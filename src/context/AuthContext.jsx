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
    mevcutOturumKullanici().then((k) => {
      setKullanici(k)
      setOturumYuklendi(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        setKullanici(null)
        return
      }
      const k = await mevcutOturumKullanici()
      setKullanici(k)
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

      // Soft recovery:
      //  1) Aktif in-flight fetch'leri ZORLA abort et (tarayıcı tab hidden
      //     iken onları pause etmişti, dönünce askıda kalıyor)
      //  2) Cache + pending Map'i temizle
      // Böylece sonraki sayfa geçişinde yeni fetch'ler anında başlar.
      abortAllInFlight('tab-idle-recovery')
      cacheInvalidateAll()

      // 30+ sn gizlilikte ek olarak session refresh
      if (hiddenFor < 30_000) return
      try {
        const { error } = await supabase.auth.refreshSession()
        if (error) throw error
      } catch (e) {
        console.warn('[AuthContext] session refresh fail:', e?.message)
        try {
          Object.keys(localStorage)
            .filter(k => k.startsWith('sb-') || k.startsWith('supabase.'))
            .forEach(k => localStorage.removeItem(k))
        } catch {}
        window.location.reload()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    // === Aynı tab'da idle kalıp dönünce de recovery ===
    // visibilitychange tab değişiminde fire eder. Ama kullanıcı tab'ı açık
    // bırakıp 1-2 dk boşta kalırsa (tarayıcı throttle, websocket disconnect)
    // bir sonraki tıklamada sayfa "donuk" geliyor — refresh zorunlu kalıyor.
    // Çözüm: son aktivite zamanını takip et; idle süre belli eşiği geçtikten
    // sonraki ilk aktivite olayında soft recovery uygula.
    let sonAktivite = Date.now()
    const IDLE_ESIK_HAFIF = 60_000   // 1 dk: soft recovery (cache temizle + eski fetch'leri abort et)
    const IDLE_ESIK_AGIR = 300_000   // 5 dk: hard recovery (sayfayı sessizce yenile)

    const aktiviteOlay = () => {
      const simdi = Date.now()
      const bosluk = simdi - sonAktivite
      sonAktivite = simdi

      if (bosluk >= IDLE_ESIK_AGIR) {
        console.info(`[idle] ${Math.round(bosluk/1000)}sn idle → sayfa yenileniyor`)
        window.location.reload()
        return
      }

      if (bosluk >= IDLE_ESIK_HAFIF) {
        console.info(`[idle] ${Math.round(bosluk/1000)}sn idle → cache temizlendi + eski fetch'ler abort`)
        cacheInvalidateAll()
        abortStaleInFlight(5000, 'idle-stale')
      }
    }
    const olaylar = ['click', 'keydown', 'mousemove', 'touchstart']
    olaylar.forEach((e) => document.addEventListener(e, aktiviteOlay, { passive: true }))

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      olaylar.forEach((e) => document.removeEventListener(e, aktiviteOlay))
    }
  }, [])

  useEffect(() => {
    if (!kullanici) return
    kullanicilariGetir().then(setKullanicilar)
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
