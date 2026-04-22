import { createContext, useContext, useEffect, useRef } from 'react'
import { useAuth } from './AuthContext'
import { useLocation } from 'react-router-dom'

const AktiviteContext = createContext(null)

const sayfaIsimleri = {
  '/dashboard': 'Dashboard',
  '/musteriler': 'Müşteriler',
  '/gorevler': 'Görevler',
  '/gorusmeler': 'Görüşmeler',
  '/stok': 'Stok Kartları',
  '/stok-hareketleri': 'Stok Hareketleri',
  '/stok-opsiyon': 'Stok Opsiyonları',
  '/teklifler': 'Teklifler',
  '/trassir-lisanslar': 'Trassir Lisanslar',
  '/raporlar': 'Raporlar',
  '/chat': 'Mesajlar',
  '/kullanici-yonetimi': 'Kullanıcı Yönetimi',
}

export function AktiviteProvider({ children }) {
  const { kullanici } = useAuth()
  const location = useLocation()
  const sayfaGirisZamani = useRef(null)
  const oncekiSayfa = useRef(null)

  const logKaydet = (tip, veri = {}) => {
    if (!kullanici) return
    const kayitlar = JSON.parse(localStorage.getItem('aktiviteLog') || '[]')
    const yeniKayit = {
      id: crypto.randomUUID(),
      kullaniciId: kullanici.id.toString(),
      kullaniciAd: kullanici.ad,
      tip,
      tarih: new Date().toISOString(),
      ...veri,
    }
    kayitlar.push(yeniKayit)
    localStorage.setItem('aktiviteLog', JSON.stringify(kayitlar))
  }

  // Sayfa değişikliği takibi
  useEffect(() => {
    if (!kullanici) return

    const simdi = Date.now()
    const sayfaAdi = Object.entries(sayfaIsimleri).find(
      ([yol]) => location.pathname === yol || location.pathname.startsWith(yol + '/')
    )?.[1] || location.pathname

    // Önceki sayfada geçirilen süreyi kaydet
    if (oncekiSayfa.current && sayfaGirisZamani.current) {
      const sure = Math.round((simdi - sayfaGirisZamani.current) / 1000)
      if (sure > 2) {
        logKaydet('sayfa_cikis', {
          sayfa: oncekiSayfa.current,
          sureSaniye: sure,
        })
      }
    }

    // Yeni sayfa girişini kaydet
    sayfaGirisZamani.current = simdi
    oncekiSayfa.current = sayfaAdi
    logKaydet('sayfa_giris', { sayfa: sayfaAdi })

  }, [location.pathname, kullanici])

  // Giriş logu
  const girisLogu = () => {
    logKaydet('kullanici_giris', { aciklama: 'Sisteme giriş yapıldı' })
  }

  // Çıkış logu
  const cikisLogu = () => {
    if (!kullanici) return
    // Son sayfada geçirilen süreyi kaydet
    if (oncekiSayfa.current && sayfaGirisZamani.current) {
      const sure = Math.round((Date.now() - sayfaGirisZamani.current) / 1000)
      if (sure > 2) {
        logKaydet('sayfa_cikis', {
          sayfa: oncekiSayfa.current,
          sureSaniye: sure,
        })
      }
    }
    logKaydet('kullanici_cikis', { aciklama: 'Sistemden çıkış yapıldı' })
    sayfaGirisZamani.current = null
    oncekiSayfa.current = null
  }

  const tumLoglari = () => {
    return JSON.parse(localStorage.getItem('aktiviteLog') || '[]')
  }

  const kullaniciLoglari = (kullaniciId) => {
    return tumLoglari().filter((l) => l.kullaniciId === kullaniciId.toString())
  }

  const logTemizle = () => {
    localStorage.removeItem('aktiviteLog')
  }

  return (
    <AktiviteContext.Provider value={{
      girisLogu,
      cikisLogu,
      tumLoglari,
      kullaniciLoglari,
      logTemizle,
    }}>
      {children}
    </AktiviteContext.Provider>
  )
}

export function useAktivite() {
  return useContext(AktiviteContext)
}