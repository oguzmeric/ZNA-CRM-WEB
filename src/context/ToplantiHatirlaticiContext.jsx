import { createContext, useContext, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'

// Toplantı hatırlatıcısı — Google Calendar etkinliklerini periyodik kontrol eder,
// 10 dk kala ve başlarken uyarı gösterir (toast + browser notification).

const Ctx = createContext(null)

const KACAK_SN = 60      // toplantı başlarken bildirimi ±60sn içinde tetikler
const KONTROL_MS = 30_000 // her 30 sn'de kontrol
const CEK_MS = 5 * 60_000 // her 5 dk'da DB'den yaklaşan etkinlikleri çek

// notifiedSet localStorage'da (tab reload'a dayansın)
const NOTIFY_KEY = 'zna-toplanti-notify'
const notifiedYukle = () => {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIFY_KEY) || '[]')) }
  catch { return new Set() }
}
const notifiedKaydet = (s) => {
  try { localStorage.setItem(NOTIFY_KEY, JSON.stringify([...s].slice(-200))) } catch {}
}

// Browser notification izin isteme (bir kez)
const izinIste = async () => {
  if (typeof Notification === 'undefined') return
  if (Notification.permission === 'default') {
    try { await Notification.requestPermission() } catch {}
  }
}

const sistemBildirimi = (baslik, mesaj, hedefUrl) => {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  try {
    const n = new Notification(baslik, {
      body: mesaj,
      icon: '/logo.jpeg',
      tag: hedefUrl,
      requireInteraction: false,
    })
    n.onclick = () => {
      window.focus()
      if (hedefUrl) window.location.href = hedefUrl
      n.close()
    }
  } catch {}
}

export function ToplantiHatirlaticiProvider({ children }) {
  const { kullanici } = useAuth()
  const { toast } = useToast()
  const etkinliklerRef = useRef([])
  const notifiedRef = useRef(notifiedYukle())
  const kullaniciIdRef = useRef(null)

  useEffect(() => { kullaniciIdRef.current = kullanici?.id }, [kullanici?.id])

  // İzin bir kez iste — kullanıcı giriş yaptıktan sonra
  useEffect(() => {
    if (kullanici?.id) izinIste()
  }, [kullanici?.id])

  const etkinlikleriCek = useCallback(async () => {
    if (!kullaniciIdRef.current) return
    const simdi = new Date()
    const sonrasi = new Date(simdi.getTime() + 24 * 60 * 60 * 1000)  // sonraki 24 saat
    try {
      const { data, error } = await supabase
        .from('harici_etkinlikler')
        .select('id, baslik, aciklama, baslangic, toplanti_linki')
        .eq('kullanici_id', kullaniciIdRef.current)
        .eq('silindi', false)
        .gte('baslangic', simdi.toISOString())
        .lte('baslangic', sonrasi.toISOString())
        .order('baslangic', { ascending: true })
      if (error) { console.warn('[ToplantiHatirlatici] fetch:', error.message); return }
      etkinliklerRef.current = data || []
    } catch (e) {
      console.warn('[ToplantiHatirlatici] fetch hata:', e?.message)
    }
  }, [])

  const kontrolEt = useCallback(() => {
    const simdi = Date.now()
    for (const e of etkinliklerRef.current) {
      if (!e?.baslangic) continue
      const bt = new Date(e.baslangic).getTime()
      const fark = bt - simdi

      // 10 dk kala — anahtarı: e.id + ':10dk'
      const anahtar10 = `${e.id}:10dk`
      if (fark <= 10 * 60_000 && fark > 5 * 60_000 && !notifiedRef.current.has(anahtar10)) {
        const dk = Math.max(1, Math.round(fark / 60_000))
        const baslik = '⏰ Toplantı yaklaşıyor'
        const mesaj = `"${e.baslik}" — ${dk} dk sonra başlıyor`
        toast.info(mesaj, { sure: 8000 })
        sistemBildirimi(baslik, mesaj, '/takvim')
        notifiedRef.current.add(anahtar10)
        notifiedKaydet(notifiedRef.current)
      }

      // Başlarken — anahtarı: e.id + ':basladi'
      const anahtarBasladi = `${e.id}:basladi`
      if (Math.abs(fark) <= KACAK_SN * 1000 && !notifiedRef.current.has(anahtarBasladi)) {
        const baslik = '🔔 Toplantı başlıyor'
        const mesajParcalari = [`"${e.baslik}" şu an başlıyor`]
        if (e.toplanti_linki) mesajParcalari.push('Meet linkine tıklayın')
        const mesaj = mesajParcalari.join(' · ')
        toast.info(mesaj, { sure: 15000 })
        sistemBildirimi(baslik, mesaj, e.toplanti_linki || '/takvim')
        notifiedRef.current.add(anahtarBasladi)
        notifiedKaydet(notifiedRef.current)
      }
    }
  }, [toast])

  useEffect(() => {
    if (!kullanici?.id) return
    // İlk yükleme + periyodik
    etkinlikleriCek()
    kontrolEt()
    const cekInt = setInterval(etkinlikleriCek, CEK_MS)
    const kontrolInt = setInterval(kontrolEt, KONTROL_MS)
    return () => { clearInterval(cekInt); clearInterval(kontrolInt) }
  }, [kullanici?.id, etkinlikleriCek, kontrolEt])

  return <Ctx.Provider value={{}}>{children}</Ctx.Provider>
}

export const useToplantiHatirlatici = () => useContext(Ctx)
