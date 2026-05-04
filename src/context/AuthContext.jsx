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
    mevcutOturumKullanici()
      .then((k) => setKullanici(k))
      .catch((e) => { console.warn('[auth] ilk oturum yükleme hata:', e); setKullanici(null) })
      .finally(() => setOturumYuklendi(true))

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        setKullanici(null)
        return
      }
      // Token refresh sırasında network koparsa mevcutOturumKullanici throw eder.
      // try/catch olmazsa unhandled rejection ve setKullanici hiç çağrılmaz →
      // ekran stale state ile kalır. Hata durumunda mevcut kullaniciyi koru.
      try {
        const k = await mevcutOturumKullanici()
        setKullanici(k)
      } catch (e) {
        console.warn('[auth] onAuthStateChange profil hata:', e)
      }
    })

    // === Tab idle'dan dönünce recovery ===
    // Problem: tab 10-20 sn arka plana alındığında tarayıcı pending fetch'leri
    // pause ediyor. Dönünce supabase client'ın pending Promise'leri askıda
    // kalıyor → sayfa geçişleri "yüklenmiyor", refresh zorunlu oluyor.
    //
    // Çözüm (3 katman):
    //  - Kısa gizlilik (>= 5 sn): cache.invalidateAll() → pending Map temizlenir,
    //    sonraki fetch'ler taze başlar. Soft recovery, yeniden yükleme yok.
    //  - Orta gizlilik (>= 2 dk): +  supabase.auth.refreshSession() zorla.
    //  - Refresh fail: localStorage sb-* sil + sayfa reload (Ctrl+Shift+R otomatik).
    // === Reload guard ===
    // visibility (≥2dk), idle (≥3dk) ve focus (≥3dk) hepsi reload tetikleyebilir.
    // Kullanıcı 4 dk gizli kalıp sonra tıklarsa hem visibilitychange hem
    // aktiviteOlay çakışıp çift reload deneyebilir. Tek seferlik guard:
    // 5sn cooldown — bu pencere içinde ikinci tetik yok sayılır.
    const guvenliReload = (sebep) => {
      try {
        const son = Number(sessionStorage.getItem('auth_reload_at') || 0)
        if (Date.now() - son < 5000) {
          console.info(`[${sebep}] reload skip — cooldown aktif`)
          return
        }
        sessionStorage.setItem('auth_reload_at', String(Date.now()))
      } catch {}
      console.info(`[${sebep}] sessiz reload`)
      window.location.reload()
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

      // 5sn-2dk: soft recovery — cache temizle, eski fetch'leri iptal et
      abortAllInFlight('tab-idle-recovery')
      cacheInvalidateAll()

      // 2+ dk gizliyse: HTTP/2 keep-alive ölmüş olabilir, sessiz reload
      // (Vite preconnect + chunk preload sayesinde reload anlık)
      if (hiddenFor >= 120_000) {
        guvenliReload(`visibility ${Math.round(hiddenFor/1000)}sn`)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    // === Aynı tab'da idle kalıp dönünce de recovery ===
    // visibilitychange tab değişiminde fire eder. Ama kullanıcı tab'ı açık
    // bırakıp 1-2 dk boşta kalırsa (tarayıcı throttle, websocket disconnect)
    // bir sonraki tıklamada sayfa "donuk" geliyor — refresh zorunlu kalıyor.
    // Çözüm: son aktivite zamanını takip et; idle süre belli eşiği geçtikten
    // sonraki ilk aktivite olayında soft recovery uygula.
    // === Aynı tab'da idle detection ===
    // Önemli: mousemove DİNLEMİYORUZ — kullanıcı başka uygulamada çalışırken
    // cursor browser üstünde durunca sonAktivite gereksiz yere yenileniyor,
    // bosluk asla eşiği geçmiyor ama altta HTTP/2 keep-alive ölüyordu.
    // Sadece anlamlı interaction'ları say: click, keydown, touchstart.
    // window.focus de eklendi — kullanıcı başka pencereden geri döndü mü
    // kesin sinyal verir.
    let sonAktivite = Date.now()
    const IDLE_ESIK_HAFIF = 60_000   // 1 dk: cache temizle + stale abort
    const IDLE_ESIK_AGIR = 180_000   // 3 dk: sessiz reload (chunk preload anlık)

    const aktiviteOlay = (e) => {
      const simdi = Date.now()
      const bosluk = simdi - sonAktivite

      // focus event'i navigasyon değil, sadece sinyal — recovery yapma
      if (e?.type === 'focus') { sonAktivite = simdi; return }

      if (bosluk >= IDLE_ESIK_AGIR) {
        // sayfa zaten gidiyor — sonAktivite atamasına gerek yok
        guvenliReload(`idle ${Math.round(bosluk/1000)}sn`)
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
        guvenliReload(`focus ${Math.round(bosluk/1000)}sn`)
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
    // Her çağrı best-effort; biri askıda kalırsa diğerlerini engellemesin
    if (kullanici) {
      try { await kullaniciDurumGuncelle(kullanici.id, 'cevrimdisi') } catch (e) { console.warn('[cikisYap] durum güncellenemedi:', e) }
    }
    try { await cikisYapAuth() } catch (e) { console.warn('[cikisYap] signOut hata:', e) }
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
