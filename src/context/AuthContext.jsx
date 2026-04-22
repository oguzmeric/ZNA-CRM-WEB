import { createContext, useContext, useState, useEffect } from 'react'
import {
  kullanicilariGetir,
  kullaniciGirisKontrol,
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
  const [kullanici, setKullanici] = useState(() => {
    const k = localStorage.getItem('aktifKullanici')
    return k ? JSON.parse(k) : null
  })
  const [kullanicilar, setKullanicilar] = useState([])

  useEffect(() => {
    kullanicilariGetir().then(setKullanicilar)
  }, [])

  const girisYap = async (kullaniciAdi, sifre) => {
    const bulunan = await kullaniciGirisKontrol(kullaniciAdi, sifre)
    if (bulunan) {
      const guncel = { ...bulunan, durum: 'cevrimici' }
      setKullanici(guncel)
      localStorage.setItem('aktifKullanici', JSON.stringify(guncel))
      await kullaniciDurumGuncelle(bulunan.id, 'cevrimici')
      setKullanicilar(prev => prev.map(k => k.id === bulunan.id ? { ...k, durum: 'cevrimici' } : k))
      return true
    }
    return false
  }

  const cikisYap = async () => {
    if (kullanici) {
      await kullaniciDurumGuncelle(kullanici.id, 'cevrimdisi')
    }
    setKullanici(null)
    localStorage.removeItem('aktifKullanici')
  }

  const durumGuncelle = async (yeniDurum) => {
    if (!kullanici) return
    const guncel = { ...kullanici, durum: yeniDurum }
    setKullanici(guncel)
    localStorage.setItem('aktifKullanici', JSON.stringify(guncel))
    await kullaniciDurumGuncelle(kullanici.id, yeniDurum)
    setKullanicilar(prev => prev.map(k => k.id === kullanici.id ? { ...k, durum: yeniDurum } : k))
  }

  const kullaniciEkle = async (yeniKullanici) => {
    const k = await dbKullaniciEkle({
      ...yeniKullanici,
      tip: yeniKullanici.tip || 'zna',
      silinebilir: true,
      durum: 'cevrimdisi',
    })
    if (k) setKullanicilar(prev => [...prev, k])
    return k
  }

  const kullaniciSil = async (id) => {
    await dbKullaniciSil(id)
    setKullanicilar(prev => prev.filter(k => k.id !== id))
  }

  const kullaniciGuncelle = async (id, guncellenmis) => {
    const k = await dbKullaniciGuncelle(id, guncellenmis)
    if (k) {
      setKullanicilar(prev => prev.map(u => u.id === id ? { ...u, ...k } : u))
      if (kullanici?.id === id) {
        const yeni = { ...kullanici, ...k }
        setKullanici(yeni)
        localStorage.setItem('aktifKullanici', JSON.stringify(yeni))
      }
    }
  }

  return (
    <AuthContext.Provider value={{
      kullanici, kullanicilar, durumlar,
      girisYap, cikisYap, durumGuncelle,
      kullaniciEkle, kullaniciSil, kullaniciGuncelle,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
