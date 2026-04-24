import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
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

    // === Tab idle'dan dönünce session sağlığını kontrol et ===
    // Tab uzun süre gizli kaldığında GoTrueClient token refresh'i throttle
    // ediliyor, token eskiyor. Tab geri geldiğinde stale token ile istek
    // atılırsa 401 veya hang oluyor. Geri gelince:
    //   1) Refresh'i zorla (supabase.auth.refreshSession)
    //   2) Refresh fail olursa (refresh_token invalid, net hata vs)
    //      tam temizlik + sayfa reload — "Ctrl+Shift+R'ı otomatik yap"
    let hiddenAt = null
    const onVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      // Visible again
      const hiddenFor = hiddenAt ? Date.now() - hiddenAt : 0
      hiddenAt = null
      // Sadece 2+ dakika gizli kaldıysa refresh dene (kısa tab switch'lerde gereksiz)
      if (hiddenFor < 2 * 60 * 1000) return
      try {
        const { error } = await supabase.auth.refreshSession()
        if (error) throw error
        // Başarılı refresh — onAuthStateChange tetiklenir, kullanici state güncellenir
      } catch (e) {
        console.warn('[AuthContext] session refresh fail:', e?.message)
        // Refresh fail olduysa local state bozuk olabilir — tam reset yap
        try {
          Object.keys(localStorage)
            .filter(k => k.startsWith('sb-') || k.startsWith('supabase.'))
            .forEach(k => localStorage.removeItem(k))
        } catch {}
        window.location.reload()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVisibilityChange)
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
