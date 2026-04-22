import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'

const ChatContext = createContext(null)

export function ChatProvider({ children }) {
  const { kullanici } = useAuth()

  const [mesajlar, setMesajlar] = useState(() => {
    const kayitli = localStorage.getItem('chatMesajlar')
    return kayitli ? JSON.parse(kayitli) : []
  })

  const [okunmamis, setOkunmamis] = useState(0)

  useEffect(() => {
    if (!kullanici) return
    const sayi = mesajlar.filter(
      (m) => m.aliciId === kullanici.id.toString() && !m.okundu
    ).length
    setOkunmamis(sayi)
  }, [mesajlar, kullanici])

  const mesajGonder = (aliciId, icerik) => {
    if (!icerik.trim() || !kullanici) return
    const yeni = {
      id: crypto.randomUUID(),
      gondericId: kullanici.id.toString(),
      gondericAd: kullanici.ad,
      aliciId: aliciId.toString(),
      icerik,
      tarih: new Date().toISOString(),
      okundu: false,
    }
    const guncellenmis = [...mesajlar, yeni]
    setMesajlar(guncellenmis)
    localStorage.setItem('chatMesajlar', JSON.stringify(guncellenmis))
  }

  const mesajlariOku = (kisiId) => {
    const guncellenmis = mesajlar.map((m) =>
      m.gondericId === kisiId.toString() && m.aliciId === kullanici?.id?.toString()
        ? { ...m, okundu: true }
        : m
    )
    setMesajlar(guncellenmis)
    localStorage.setItem('chatMesajlar', JSON.stringify(guncellenmis))
  }

  const konusmaGetir = (kisiId) => {
    return mesajlar.filter(
      (m) =>
        (m.gondericId === kullanici?.id?.toString() && m.aliciId === kisiId.toString()) ||
        (m.gondericId === kisiId.toString() && m.aliciId === kullanici?.id?.toString())
    ).sort((a, b) => new Date(a.tarih) - new Date(b.tarih))
  }

  const okunmamisSay = (kisiId) => {
    return mesajlar.filter(
      (m) =>
        m.gondericId === kisiId.toString() &&
        m.aliciId === kullanici?.id?.toString() &&
        !m.okundu
    ).length
  }

  return (
    <ChatContext.Provider value={{
      mesajlar,
      okunmamis,
      mesajGonder,
      mesajlariOku,
      konusmaGetir,
      okunmamisSay,
    }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  return useContext(ChatContext)
}