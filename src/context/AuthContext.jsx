import { createContext, useContext, useState, useEffect } from 'react'
import { supabase, abortAllInFlight, abortStaleInFlight } from '../lib/supabase'
import { invalidateAll as cacheInvalidateAll } from '../lib/cache'
import {
  kullanicilariGetir,
  kullaniciGirisKontrol,
  mevcutOturumKullanici,
  cikisYapAuth,
  kullaniciEkle as dbKullaniciEkle,
  kullaniciSil as dbKullaniciSil,
  kullaniciGuncelle as dbKullaniciGuncelle,
  kullaniciDurumGuncelle,
} from '../services/kullaniciService'

const AuthContext = createContext(null)

export const durumlar = [
  { id: 'cevrimici', isim: 'Çevrimiçi', renk: '#22c55e' },
  { id: 'mesgul', isim: 'Meşgul', renk: '#ef4444' },
  { id: 'disarida', isim: 'Dışarıda', renk: '#f59e0b' },
  { id: 'toplantida', isim: 'Toplantıda', renk: '#014486' },
  { id: 'cevrimdisi', isim: 'Çevrimdışı', renk: '#6b7280' },
]

export function AuthProvider({ children }) {
  const [kullanici, setKullanici] = useState(null)
  const [kullanicilar, setKullanicilar] = useState([])
  const [oturumYuklendi, setOturumYuklendi] = useState(false)

  useEffect(() => {
    // ÖNEMLİ: .catch + .finally ile setOturumYuklendi(true) GARANTİ altında.
    // Aksi halde ilk açılışta cold DNS/TLS sırasında supabase çağrısı 8sn
    // timeout'la reject olursa, oturumYuklendi false kalır ve App.jsx
    // sonsuza kadar "Yükleniyor…" gösterir → kullanıcı F5 yapmak zorunda.
    //
    // EK SAFETY NET: mevcutOturumKullanici içinde Promise.race timeout var
    // ama o da fail-safe değil. 10sn'lik kesin guard — sabahları stale session
    // ile sayfa yüklenmediği bug'ı kalıcı çözer (kullanıcı login ekranına
    // düşer, refresh zorunlu kalmaz).
    let cevapGeldi = false
    const safetyTimer = setTimeout(() => {
      if (!cevapGeldi) {
        console.warn('[auth] safety net 10sn — zorla login ekranına düş')
        setKullanici(null)
        setOturumYuklendi(true)
      }
    }, 10_000)

    mevcutOturumKullanici()
      .then((k) => setKullanici(k))
      .catch((e) => { console.warn('[auth] ilk oturum yükleme hata:', e); setKullanici(null) })
      .finally(() => {
        cevapGeldi = true
        clearTimeout(safetyTimer)
        setOturumYuklendi(true)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // KRİTİK: Sadece explicit SIGNED_OUT olayında logout yap.
      // Aksi halde:
      //   - Yazdir sayfası başka sekmede açıldığında supabase storage sync
      //     fırlatabilir → her iki sekmedeki kullanıcı da çıkış yapar.
      //   - Token refresh anlık başarısız olursa (network glitch) yine
      //     gereksiz logout olur.
      // SIGNED_OUT sadece kullanıcı explicit cikisYap çağırınca veya token
      // tamamen geçersizse fırlar — gerçek logout sinyali.
      if (event === 'SIGNED_OUT') {
        setKullanici(null)
        return
      }
      // Session yoksa ama event SIGNED_OUT değilse: mevcut kullaniciyi koru,
      // bir sonraki API çağrısında refresh kendiliğinden olur ya da
      // gerçekten geçersizse SIGNED_OUT gelir.
      if (!session?.user) return

      // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED — kullanıcı bilgisini güncelle
      try {
        const k = await mevcutOturumKullanici()
        if (k) setKullanici(k)
      } catch (e) {
        console.warn('[auth] onAuthStateChange profil hata:', e)
      }
    })

    // === Tab idle'dan dönünce recovery ===
    // Strateji (Aralık 2025 revizyon):
    //  1) Eşikleri yükselttik: kısa sekme geçişlerinde (<10dk) reload olmaz,
    //     sayfa state korunur (form, scroll, modal).
    //  2) Hard reload yerine SOFT RECOVERY: cache temizle + abort + auth refresh.
    //     Sadece auth refresh fail olursa son çare reload.
    //  3) Cooldown: aynı pencerede ikinci tetik yok sayılır.
    const SOFT_COOLDOWN = 5_000
    const lastSoftAt = { value: 0 }

    const softRecovery = async (sebep) => {
      const simdi = Date.now()
      if (simdi - lastSoftAt.value < SOFT_COOLDOWN) {
        console.info(`[${sebep}] soft recovery skip — cooldown`)
        return
      }
      lastSoftAt.value = simdi
      console.info(`[${sebep}] soft recovery — cache+abort+refresh`)
      try {
        abortAllInFlight('soft-recovery')
        cacheInvalidateAll()
        // Auth refresh — başarılıysa state korunur, başarısızsa reload
        const { error } = await supabase.auth.refreshSession()
        if (error) {
          console.warn(`[${sebep}] auth refresh fail → reload`, error.message)
          window.location.reload()
        }
      } catch (e) {
        console.warn(`[${sebep}] recovery exception → reload`, e?.message)
        window.location.reload()
      }
    }

    let hiddenAt = null
    const onVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      const hiddenFor = hiddenAt ? Date.now() - hiddenAt : 0
      hiddenAt = null

      // Çok kısa switch'lerde (< 5 sn) dokunma
      if (hiddenFor < 5_000) return

      // 5sn-10dk: soft recovery — cache temizle, eski fetch'leri iptal et
      abortAllInFlight('tab-idle-recovery')
      cacheInvalidateAll()

      // 10+ dk gizliyse: HTTP/2 keep-alive ölmüş olabilir, soft recovery
      // (auth refresh dene; fail olursa reload). Sayfa state korunmaya çalışır.
      if (hiddenFor >= 600_000) {
        softRecovery(`visibility ${Math.round(hiddenFor/1000)}sn`)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    // === Aynı tab'da idle detection ===
    // Sadece anlamlı interaction'ları say: click, keydown, touchstart.
    // window.focus de eklendi — kullanıcı başka pencereden geri döndü mü
    // kesin sinyal verir.
    let sonAktivite = Date.now()
    const IDLE_ESIK_HAFIF = 60_000   // 1 dk: cache temizle + stale abort
    const IDLE_ESIK_AGIR = 900_000   // 15 dk: soft recovery (auth refresh)

    const aktiviteOlay = (e) => {
      const simdi = Date.now()
      const bosluk = simdi - sonAktivite

      // focus event'i navigasyon değil, sadece sinyal — recovery yapma
      if (e?.type === 'focus') { sonAktivite = simdi; return }

      if (bosluk >= IDLE_ESIK_AGIR) {
        sonAktivite = simdi
        softRecovery(`idle ${Math.round(bosluk/1000)}sn`)
        return
      }
      sonAktivite = simdi
      if (bosluk >= IDLE_ESIK_HAFIF) {
        console.info(`[idle] ${Math.round(bosluk/1000)}sn idle → cache+abort`)
        cacheInvalidateAll()
        abortStaleInFlight(5000, 'idle-stale')
      }
    }

    // window.focus — başka uygulamadan/pencereden geri dönüş
    const onFocus = () => {
      const bosluk = Date.now() - sonAktivite
      if (bosluk >= IDLE_ESIK_AGIR) {
        sonAktivite = Date.now()
        softRecovery(`focus ${Math.round(bosluk/1000)}sn`)
        return
      }
      if (bosluk >= IDLE_ESIK_HAFIF) {
        cacheInvalidateAll()
        abortStaleInFlight(5000, 'focus-stale')
      }
      sonAktivite = Date.now()
    }

    const olaylar = ['click', 'keydown', 'touchstart']
    olaylar.forEach((e) => document.addEventListener(e, aktiviteOlay, { passive: true }))
    window.addEventListener('focus', onFocus)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      olaylar.forEach((e) => document.removeEventListener(e, aktiviteOlay))
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  useEffect(() => {
    if (!kullanici) {
      // Logout sonrası eski kullanıcı listesi hafızada kalmasın —
      // farklı kullanıcı login olursa eski liste bir an gözükmesin.
      setKullanicilar([])
      return
    }
    kullanicilariGetir().then(setKullanicilar).catch((e) => {
      console.warn('[auth] kullanicilariGetir hata:', e)
    })
  }, [kullanici])

  const girisYap = async (kullaniciAdi, sifre) => {
    const bulunan = await kullaniciGirisKontrol(kullaniciAdi, sifre)
    if (bulunan) {
      const guncel = { ...bulunan, durum: 'cevrimici' }
      setKullanici(guncel)
      // Durum güncelleme best-effort — login'i engellemez
      try { await kullaniciDurumGuncelle(bulunan.id, 'cevrimici') } catch (e) { console.warn('[girisYap] durum güncellenemedi:', e) }
      setKullanicilar((prev) =>
        prev.map((k) => (k.id === bulunan.id ? { ...k, durum: 'cevrimici' } : k))
      )
      return true
    }
    return false
  }

  const cikisYap = async () => {
    // Devam eden fetch'leri hemen iptal et — logout sonrası response'ların
    // cache'e veya context state'lerine sızıp yeni kullanıcıya görünmesini önler.
    abortAllInFlight('logout')

    // Durum güncelleme + signOut paralel — sıralı await 2x8sn block edebilirdi.
    // Her ikisi de best-effort; allSettled hata fırlatmaz.
    const isler = []
    if (kullanici) isler.push(kullaniciDurumGuncelle(kullanici.id, 'cevrimdisi'))
    isler.push(cikisYapAuth())
    const sonuclar = await Promise.allSettled(isler)
    sonuclar.forEach((s, i) => {
      if (s.status === 'rejected') console.warn(`[cikisYap] iş ${i} hata:`, s.reason)
    })

    // Diğer kullanıcılara stale data sızmasın
    cacheInvalidateAll()
    setKullanici(null)
  }

  const durumGuncelle = async (yeniDurum) => {
    if (!kullanici) return
    const guncel = { ...kullanici, durum: yeniDurum }
    setKullanici(guncel)
    await kullaniciDurumGuncelle(kullanici.id, yeniDurum)
    setKullanicilar((prev) =>
      prev.map((k) => (k.id === kullanici.id ? { ...k, durum: yeniDurum } : k))
    )
  }

  const kullaniciEkle = async (yeniKullanici) => {
    const k = await dbKullaniciEkle({
      ...yeniKullanici,
      tip: yeniKullanici.tip || 'zna',
      silinebilir: true,
      durum: 'cevrimdisi',
    })
    if (k) setKullanicilar((prev) => [...prev, k])
    return k
  }

  const kullaniciSil = async (id) => {
    await dbKullaniciSil(id)
    setKullanicilar((prev) => prev.filter((k) => k.id !== id))
  }

  const kullaniciGuncelle = async (id, guncellenmis) => {
    const k = await dbKullaniciGuncelle(id, guncellenmis)
    if (k) {
      setKullanicilar((prev) => prev.map((u) => (u.id === id ? { ...u, ...k } : u)))
      if (kullanici?.id === id) {
        setKullanici((prev) => ({ ...prev, ...k }))
      }
    }
  }

  return (
    <AuthContext.Provider
      value={{
        kullanici, kullanicilar, durumlar, oturumYuklendi,
        girisYap, cikisYap, durumGuncelle,
        kullaniciEkle, kullaniciSil, kullaniciGuncelle,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
