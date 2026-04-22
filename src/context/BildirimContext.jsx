import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'

const BildirimContext = createContext(null)

export function BildirimProvider({ children }) {
  const { kullanici } = useAuth()

  const [bildirimler, setBildirimler] = useState(() => {
    const kayitli = localStorage.getItem('bildirimler')
    return kayitli ? JSON.parse(kayitli) : []
  })

  useEffect(() => {
    const interval = setInterval(() => {
      const kayitli = localStorage.getItem('bildirimler')
      if (kayitli) setBildirimler(JSON.parse(kayitli))
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  const okunmamisSayisi = bildirimler.filter(
    (b) => b.aliciId === kullanici?.id?.toString() && !b.okundu
  ).length

  const benimBildirimlerim = bildirimler
    .filter((b) => b.aliciId === kullanici?.id?.toString())
    .sort((a, b) => new Date(b.tarih) - new Date(a.tarih))
    .slice(0, 20)

  const bildirimEkle = (aliciId, baslik, mesaj, tip = 'bilgi', link = '') => {
    const yeni = {
      id: crypto.randomUUID(),
      aliciId: aliciId.toString(),
      baslik,
      mesaj,
      tip,
      link,
      tarih: new Date().toISOString(),
      okundu: false,
    }
    const mevcutlar = JSON.parse(localStorage.getItem('bildirimler') || '[]')
    const guncellenmis = [yeni, ...mevcutlar]
    localStorage.setItem('bildirimler', JSON.stringify(guncellenmis))
    setBildirimler(guncellenmis)
  }

  const bildirimOku = (id) => {
    const guncellenmis = bildirimler.map((b) =>
      b.id === id ? { ...b, okundu: true } : b
    )
    setBildirimler(guncellenmis)
    localStorage.setItem('bildirimler', JSON.stringify(guncellenmis))
  }

  const tumunuOku = () => {
    const guncellenmis = bildirimler.map((b) =>
      b.aliciId === kullanici?.id?.toString() ? { ...b, okundu: true } : b
    )
    setBildirimler(guncellenmis)
    localStorage.setItem('bildirimler', JSON.stringify(guncellenmis))
  }

  const bildirimSil = (id) => {
    const guncellenmis = bildirimler.filter((b) => b.id !== id)
    setBildirimler(guncellenmis)
    localStorage.setItem('bildirimler', JSON.stringify(guncellenmis))
  }

  return (
    <BildirimContext.Provider value={{
      bildirimler,
      benimBildirimlerim,
      okunmamisSayisi,
      bildirimEkle,
      bildirimOku,
      tumunuOku,
      bildirimSil,
    }}>
      {children}
    </BildirimContext.Provider>
  )
}

export function useBildirim() {
  return useContext(BildirimContext)
}