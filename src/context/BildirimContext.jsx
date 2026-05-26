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

export function BildirimProvider({ children }) {
  const { kullanici } = useAuth()
  const toastCtx = useToast()
  const navigate = useNavigate()
  const [bildirimler, setBildirimler] = useState([])
  const subRef = useRef(null)
  // İlk yükleme bittikten sonra mı? — eski bildirimler için toast atmamak için
  const hazirRef = useRef(false)

  // Kullanıcı değişince bildirimleri çek + realtime subscribe
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
      }
    })
    // Realtime — yeni bildirim gelince listeye ekle + sağ üstte toast göster
    subRef.current = bildirimleriDinle(kullanici.id, (yeni) => {
      setBildirimler(prev => {
        if (prev.some(b => b.id === yeni.id)) return prev
        return [yeni, ...prev].slice(0, 50)
      })
      // Sayfa ilk açılışındaki backlog'u toast yapma — sadece gerçek "yeni" olanı
      if (!hazirRef.current) return

      const baslik = yeni.baslik || 'Yeni bildirim'
      const mesaj  = (yeni.mesaj || '').slice(0, 160)
      const sure = 8000

      // Tip'e göre toast varyantı seç
      const tip = yeni.tip || 'bilgi'
      const toast = toastCtx?.toast
      if (!toast) return
      if (tip === 'servis_talebi') {
        toast.info(mesaj, { baslik, sure })
      } else if (tip === 'hata' || tip === 'kritik') {
        toast.error(mesaj, { baslik, sure })
      } else if (tip === 'basari') {
        toast.success(mesaj, { baslik, sure })
      } else {
        toast.info(mesaj, { baslik, sure })
      }
    })
    return () => {
      iptal = true
      subRef.current?.unsubscribe?.()
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
