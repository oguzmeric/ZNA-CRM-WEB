import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import { supabase } from '../lib/supabase'
import { toCamel } from '../lib/mapper'
import {
  mesajlariGetir,
  mesajGonder as dbMesajGonder,
  konusmayiOkunduYap,
} from '../services/chatService'

const ChatContext = createContext(null)

// Kısa bir "ding" sesi — Web Audio API ile asset gerektirmez
const bildirimSesiCal = () => {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.18)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.4)
  } catch (e) { /* sessizce yut */ }
}

const MANUEL_DURUMLAR = ['mesgul', 'disarida', 'toplantida']

export function ChatProvider({ children }) {
  const { kullanici, kullanicilar } = useAuth()
  const toast = useToast()
  const [mesajlar, setMesajlar] = useState([])
  const [okunmamis, setOkunmamis] = useState(0)
  const [cevrimiciIdSeti, setCevrimiciIdSeti] = useState(() => new Set())
  const aktifKonusmaRef = useRef(null) // Açık olan sohbetin kisiId'si

  // İlk yükleme + kullanıcı değişiminde mesajları çek
  useEffect(() => {
    if (!kullanici?.id) { setMesajlar([]); return }
    let iptal = false
    mesajlariGetir(kullanici.id).then((d) => {
      if (!iptal) setMesajlar(d ?? [])
    })
    return () => { iptal = true }
  }, [kullanici?.id])

  // Realtime: yeni mesaj geldiğinde state'e ekle + ses + toast
  useEffect(() => {
    if (!kullanici?.id) return
    const kanal = supabase
      .channel(`mesajlar_kullanici_${kullanici.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mesajlar', filter: `alici_id=eq.${kullanici.id}` },
        (payload) => {
          const yeni = toCamel(payload.new)
          setMesajlar((prev) => prev.some((m) => m.id === yeni.id) ? prev : [...prev, yeni])
          // Aktif sohbet bu kişi değilse bildirim göster
          if (aktifKonusmaRef.current !== yeni.gondericiId) {
            bildirimSesiCal()
            const gonderen = kullanicilar?.find((k) => k.id === yeni.gondericiId)
            const ad = gonderen?.ad || 'Yeni mesaj'
            const onizleme = (() => {
              try {
                const j = JSON.parse(yeni.icerik)
                if (j?.tip === 'dosya') return '📎 Dosya gönderdi'
              } catch {}
              return yeni.icerik.length > 60 ? yeni.icerik.slice(0, 60) + '…' : yeni.icerik
            })()
            toast?.info?.(`${ad}: ${onizleme}`)
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mesajlar', filter: `gonderici_id=eq.${kullanici.id}` },
        (payload) => {
          const yeni = toCamel(payload.new)
          setMesajlar((prev) => prev.map((m) => m.id === yeni.id ? { ...m, ...yeni } : m))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(kanal) }
  }, [kullanici?.id, kullanicilar, toast])

  // Realtime Presence: kim gerçekten bağlı?
  useEffect(() => {
    if (!kullanici?.id) { setCevrimiciIdSeti(new Set()); return }
    const kanal = supabase.channel('online-users', {
      config: { presence: { key: String(kullanici.id) } },
    })
    kanal.on('presence', { event: 'sync' }, () => {
      const state = kanal.presenceState()
      setCevrimiciIdSeti(new Set(Object.keys(state).map((k) => Number(k))))
    })
    kanal.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await kanal.track({ id: kullanici.id, ad: kullanici.ad, at: Date.now() })
      }
    })
    return () => { supabase.removeChannel(kanal) }
  }, [kullanici?.id, kullanici?.ad])

  const cevrimiciMi = useCallback((id) => cevrimiciIdSeti.has(id), [cevrimiciIdSeti])

  // Görünen durum: bağlı değilse 'cevrimdisi'; bağlıysa manuel statüyü göster (yoksa 'cevrimici')
  const efektifDurum = useCallback((k) => {
    if (!k) return 'cevrimdisi'
    if (k.id === kullanici?.id) return k.durum || 'cevrimici'
    if (!cevrimiciIdSeti.has(k.id)) return 'cevrimdisi'
    if (MANUEL_DURUMLAR.includes(k.durum)) return k.durum
    return 'cevrimici'
  }, [cevrimiciIdSeti, kullanici?.id])

  // Toplam okunmamış sayısı (alıcı = ben, okundu = false)
  useEffect(() => {
    if (!kullanici?.id) { setOkunmamis(0); return }
    const sayi = mesajlar.filter((m) => m.aliciId === kullanici.id && !m.okundu).length
    setOkunmamis(sayi)
  }, [mesajlar, kullanici?.id])

  const mesajGonder = useCallback(async (aliciId, icerik) => {
    if (!icerik?.trim() || !kullanici?.id) return
    const yeni = await dbMesajGonder(kullanici.id, aliciId, icerik)
    if (yeni?.__error) {
      toast?.error?.(`Mesaj gönderilemedi: ${yeni.__error}`)
      return
    }
    if (yeni) {
      setMesajlar((prev) => prev.some((m) => m.id === yeni.id) ? prev : [...prev, yeni])
    }
  }, [kullanici?.id, toast])

  const aktifKonusmaAyarla = useCallback((kisiId) => {
    aktifKonusmaRef.current = kisiId
  }, [])

  const mesajlariOku = useCallback(async (kisiId) => {
    if (!kullanici?.id) return
    aktifKonusmaRef.current = kisiId
    // Optimistic
    setMesajlar((prev) => prev.map((m) =>
      m.gondericiId === kisiId && m.aliciId === kullanici.id && !m.okundu
        ? { ...m, okundu: true }
        : m
    ))
    await konusmayiOkunduYap(kullanici.id, kisiId)
  }, [kullanici?.id])

  const konusmaGetir = useCallback((kisiId) => {
    if (!kullanici?.id) return []
    return mesajlar
      .filter((m) =>
        (m.gondericiId === kullanici.id && m.aliciId === kisiId) ||
        (m.gondericiId === kisiId && m.aliciId === kullanici.id)
      )
      .sort((a, b) => new Date(a.tarih) - new Date(b.tarih))
  }, [mesajlar, kullanici?.id])

  const okunmamisSay = useCallback((kisiId) => {
    if (!kullanici?.id) return 0
    return mesajlar.filter((m) =>
      m.gondericiId === kisiId && m.aliciId === kullanici.id && !m.okundu
    ).length
  }, [mesajlar, kullanici?.id])

  return (
    <ChatContext.Provider value={{
      mesajlar,
      okunmamis,
      mesajGonder,
      mesajlariOku,
      aktifKonusmaAyarla,
      konusmaGetir,
      okunmamisSay,
      cevrimiciMi,
      efektifDurum,
    }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() { return useContext(ChatContext) }
