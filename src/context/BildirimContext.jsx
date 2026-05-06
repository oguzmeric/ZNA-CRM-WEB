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
  const [bildirimler, setBildirimler] = useState([])
  const subRef = useRef(null)

  // Kullanıcı değişince bildirimleri çek + realtime subscribe
  useEffect(() => {
    if (!kullanici?.id) {
      setBildirimler([])
      return
    }
    let iptal = false
    bildirimleriGetir(kullanici.id, 50).then(data => {
      if (!iptal) setBildirimler(data)
    })
    // Realtime — yeni bildirim gelince listeye ekle
    subRef.current = bildirimleriDinle(kullanici.id, (yeni) => {
      setBildirimler(prev => {
        if (prev.some(b => b.id === yeni.id)) return prev
        return [yeni, ...prev].slice(0, 50)
      })
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
    }}>
      {children}
    </BildirimContext.Provider>
  )
}

export function useBildirim() {
  return useContext(BildirimContext)
}
