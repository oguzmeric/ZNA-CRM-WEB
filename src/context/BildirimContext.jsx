// Bildirim context — DB tabanlı (Supabase Realtime ile anlık).
//
// MIGRASYON: Önce localStorage tabanlıydı, başkasına atanan bildirimleri
// alıcı asla göremiyordu. Şimdi Supabase 'bildirimler' tablosu + RLS +
// Realtime subscription ile gerçek bildirim sistemi.
//
// API geriye uyumlu — bildirimEkle(aliciId, baslik, mesaj, tip, link)
// imzası aynı, çağıran kodlarda değişiklik gerekmez.

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import { useNavigate } from 'react-router-dom'
import {
  bildirimleriGetir,
  bildirimEkleDb,
  bildirimOkuDb,
  tumBildirimleriOkuDb,
  bildirimSilDb,
  bildirimleriDinle,
} from '../services/bildirimService'

const BildirimContext = createContext(null)

// Tarayıcı sistem bildirimi — sekme arka planda bile görünür.
// İzin yoksa sessizce iste, verilirse notification göster; reddedilirse yut.
function gonderTarayiciBildirimi(baslik, mesaj, link, navigate) {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    const goster = () => {
      const n = new Notification(baslik, {
        body: mesaj,
        icon: '/logo.jpeg',
        tag: 'crm-bildirim-' + Date.now(),
      })
      n.onclick = () => {
        try { window.focus() } catch {}
        if (link && navigate) { try { navigate(link) } catch {} }
        n.close()
      }
    }
    if (Notification.permission === 'granted') {
      goster()
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((izin) => {
        if (izin === 'granted') goster()
      }).catch(() => {})
    }
  } catch (e) {
    console.warn('[tarayıcı bildirimi]', e?.message)
  }
}

export function BildirimProvider({ children }) {
  const { kullanici } = useAuth()
  const toastCtx = useToast()
  const navigate = useNavigate()
  const [bildirimler, setBildirimler] = useState([])
  const subRef = useRef(null)
  // İlk yükleme bittikten sonra mı? — eski bildirimler için toast atmamak için
  const hazirRef = useRef(false)
  // Realtime websocket uykuda/uzun boşta KOPUYOR ve popup'lar sessizce
  // kaçıyordu (destek bildirimi raporu, 2026-07-17). Sekme görünür olunca
  // aboneliği sıfırla + listeyi tazele; kaçan okunmamışlar için tek toast.
  const [baglantiTik, setBaglantiTik] = useState(0)
  const sonYenilemeRef = useRef(0)
  const bilinenEnYeniRef = useRef(0)

  // Kullanıcı değişince veya bağlantı tazelenince bildirimleri çek + subscribe
  useEffect(() => {
    if (!kullanici?.id) {
      setBildirimler([])
      return
    }
    let iptal = false
    hazirRef.current = false
    bildirimleriGetir(kullanici.id, 50).then(data => {
      if (!iptal) {
        setBildirimler(data)
        // İlk yükleme bitti — sonraki realtime event'ler "yeni" sayılır
        hazirRef.current = true
        // Bağlantı kopukken kaçırılan bildirim var mı? (yalnız yeniden bağlanmada)
        const enYeni = Math.max(0, ...data.map(b => Number(b.id) || 0))
        if (baglantiTik > 0 && bilinenEnYeniRef.current > 0 && enYeni > bilinenEnYeniRef.current) {
          const kacan = data.filter(b => (Number(b.id) || 0) > bilinenEnYeniRef.current && !b.okundu)
          if (kacan.length > 0) {
            toastCtx?.toast?.info(
              kacan[0].baslik + (kacan.length > 1 ? ` (+${kacan.length - 1} bildirim daha)` : ''),
              { baslik: '🔔 Siz yokken bildirim geldi', sure: 15000 },
            )
          }
        }
        bilinenEnYeniRef.current = enYeni
      }
    })
    // Realtime — yeni bildirim gelince listeye ekle + sağ üstte toast göster
    // Görev/servis atamalarında ayrıca tarayıcı sistem notification'ı (sekme
    // arka planda bile görünür) — kullanıcı ilk gorev/servis'te izin ister.
    subRef.current = bildirimleriDinle(kullanici.id, (yeni) => {
      setBildirimler(prev => {
        if (prev.some(b => b.id === yeni.id)) return prev
        return [yeni, ...prev].slice(0, 50)
      })
      bilinenEnYeniRef.current = Math.max(bilinenEnYeniRef.current, Number(yeni.id) || 0)
      // Sayfa ilk açılışındaki backlog'u toast yapma — sadece gerçek "yeni" olanı
      if (!hazirRef.current) return

      const baslik = yeni.baslik || 'Yeni bildirim'
      const mesaj  = (yeni.mesaj || '').slice(0, 160)
      const tip = yeni.tip || 'bilgi'

      // Görev atamaları + destek talepleri için daha belirgin, uzun süreli toast
      const gorevTipi = tip === 'gorev' || /görev atandı/i.test(baslik)
      const destekTipi = tip === 'destek'
      const sure = (gorevTipi || destekTipi) ? 15000 : 8000

      const toast = toastCtx?.toast
      if (toast) {
        if (tip === 'servis_talebi' || gorevTipi || destekTipi) {
          toast.info(mesaj, { baslik, sure })
        } else if (tip === 'hata' || tip === 'kritik') {
          toast.error(mesaj, { baslik, sure })
        } else if (tip === 'basari') {
          toast.success(mesaj, { baslik, sure })
        } else {
          toast.info(mesaj, { baslik, sure })
        }
      }

      // Tarayıcı sistem bildirimi — sekme arka planda bile görünür
      if (gorevTipi || tip === 'servis_talebi' || destekTipi) {
        gonderTarayiciBildirimi(baslik, mesaj, yeni.link, navigate)
      }
    })
    return () => {
      iptal = true
      subRef.current?.unsubscribe?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kullanici?.id, baglantiTik])

  // Sekme görünür olunca / pencere odak alınca bağlantıyı tazele (30sn kısıtlı)
  useEffect(() => {
    if (!kullanici?.id) return
    const tazele = () => {
      if (document.visibilityState !== 'visible') return
      const simdi = Date.now()
      if (simdi - sonYenilemeRef.current < 30_000) return
      sonYenilemeRef.current = simdi
      setBaglantiTik(t => t + 1)
    }
    document.addEventListener('visibilitychange', tazele)
    window.addEventListener('focus', tazele)
    return () => {
      document.removeEventListener('visibilitychange', tazele)
      window.removeEventListener('focus', tazele)
    }
  }, [kullanici?.id])

  const okunmamisSayisi = bildirimler.filter(b => !b.okundu).length

  // Mevcut sıralı liste (en yeni en üstte — DB'den zaten sıralı geliyor)
  const benimBildirimlerim = bildirimler.slice(0, 20)

  // Geriye uyumlu API — eski çağrılar aynen çalışır
  // bildirimEkle(aliciId, baslik, mesaj, tip, link)
  const bildirimEkle = useCallback(async (aliciId, baslik, mesaj, tip = 'bilgi', link = '') => {
    if (!aliciId) return null
    return await bildirimEkleDb({
      aliciId,
      gonderenId: kullanici?.id || null,
      baslik,
      mesaj,
      tip,
      link,
    })
  }, [kullanici?.id])

  const bildirimOku = useCallback(async (id) => {
    setBildirimler(prev => prev.map(b => b.id === id ? { ...b, okundu: true } : b))
    await bildirimOkuDb(id)
  }, [])

  const tumunuOku = useCallback(async () => {
    if (!kullanici?.id) return
    setBildirimler(prev => prev.map(b => ({ ...b, okundu: true })))
    await tumBildirimleriOkuDb(kullanici.id)
  }, [kullanici?.id])

  // Belirli bir servis talebine ait okunmamış bildirimleri okundu yap.
  // Kullanım: ServisTalepDetay açıldığında veya durum güncellendiğinde çağrılır,
  // sidebar rozetinin azalmasını sağlar.
  const talepBildirimleriniOku = useCallback(async (talepId) => {
    if (!talepId) return
    const tid = Number(talepId)
    const eslesenler = bildirimler.filter(b =>
      !b.okundu &&
      b.tip === 'servis_talebi' &&
      (b.meta?.talepId === tid || b.link === `/servis-talepleri/${tid}`)
    )
    if (eslesenler.length === 0) return
    // Optimistic — UI'de hemen düş
    setBildirimler(prev => prev.map(b =>
      eslesenler.some(e => e.id === b.id) ? { ...b, okundu: true } : b
    ))
    // DB'de paralel mark
    await Promise.all(eslesenler.map(b => bildirimOkuDb(b.id).catch(e => console.warn('[talepBildirimleriniOku]', e?.message))))
  }, [bildirimler])

  const bildirimSil = useCallback(async (id) => {
    setBildirimler(prev => prev.filter(b => b.id !== id))
    await bildirimSilDb(id)
  }, [])

  return (
    <BildirimContext.Provider value={{
      bildirimler,
      benimBildirimlerim,
      okunmamisSayisi,
      bildirimEkle,
      bildirimOku,
      tumunuOku,
      bildirimSil,
      talepBildirimleriniOku,
    }}>
      {children}
    </BildirimContext.Provider>
  )
}

export function useBildirim() {
  return useContext(BildirimContext)
}
