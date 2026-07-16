import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { AKTIVITE_KEY, aktiviteDamgala, aktiviteOku, aktiviteTemizle } from '../lib/idleAktivite'

/**
 * Idle Timeout — X dakika hareketsizlik sonrası oturumu otomatik kapat.
 *
 * - Uyarı süresi: 55 dk (kalan 5 dk için modal)
 * - Kapatma süresi: 60 dk
 * - Aktivite olayları: mousemove, mousedown, keydown, scroll, touchstart
 * - Multi-tab senkron: localStorage 'zna-son-aktivite' üzerinden yayın
 */

const UYARI_MS = 55 * 60 * 1000
const KAPATMA_MS = 60 * 60 * 1000
const KONTROL_MS = 15 * 1000
const KISIM_MS = 500  // Aktivite güncelleme throttle

const IdleTimeoutContext = createContext(null)

export function IdleTimeoutProvider({ children }) {
  const { kullanici, cikisYap } = useAuth()
  const [uyariGorunur, setUyariGorunur] = useState(false)
  const [kalanSaniye, setKalanSaniye] = useState(0)
  const sonAktiviteRef = useRef(Date.now())
  const sonYayinRef = useRef(0)

  // Aktiviteyi güncelle (yerel + localStorage)
  const aktiviteGuncelle = useCallback(() => {
    const simdi = Date.now()
    sonAktiviteRef.current = simdi
    if (simdi - sonYayinRef.current > KISIM_MS) {
      sonYayinRef.current = simdi
      aktiviteDamgala(simdi)
    }
    if (uyariGorunur) setUyariGorunur(false)
  }, [uyariGorunur])

  const oturumUzat = useCallback(() => {
    aktiviteGuncelle()
    setUyariGorunur(false)
  }, [aktiviteGuncelle])

  // Aktivite dinleyicileri
  useEffect(() => {
    if (!kullanici) return
    const olaylar = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
    olaylar.forEach((e) => window.addEventListener(e, aktiviteGuncelle, { passive: true }))
    return () => {
      olaylar.forEach((e) => window.removeEventListener(e, aktiviteGuncelle))
    }
  }, [kullanici, aktiviteGuncelle])

  // Diğer tab'lerden aktivite senkronu
  useEffect(() => {
    if (!kullanici) return
    const dinle = (e) => {
      if (e.key === AKTIVITE_KEY && e.newValue) {
        const zaman = parseInt(e.newValue, 10)
        if (zaman > sonAktiviteRef.current) {
          sonAktiviteRef.current = zaman
          if (uyariGorunur) setUyariGorunur(false)
        }
      }
    }
    window.addEventListener('storage', dinle)
    return () => window.removeEventListener('storage', dinle)
  }, [kullanici, uyariGorunur])

  // İlk yükleme: localStorage'daki son aktiviteyi al.
  // Damga bilerek kalıcıdır: sayfa yenilenince (softRecovery otomatik reload
  // dahil) sayaç sıfırlanmasın, başında olunmayan sekme gerçekten kapansın.
  // Önceki oturumdan miras kalmaması AuthContext'in sorumluluğu: girisYap
  // damgayı tazeler, cikisYap siler.
  useEffect(() => {
    if (!kullanici) return
    const zaman = aktiviteOku()
    if (zaman !== null) sonAktiviteRef.current = zaman
    else aktiviteDamgala()
  }, [kullanici])

  // Kontrol döngüsü — uyarı ve kapatma
  useEffect(() => {
    if (!kullanici) {
      setUyariGorunur(false)
      return
    }
    const kontrolEt = () => {
      const gecen = Date.now() - sonAktiviteRef.current
      if (gecen >= KAPATMA_MS) {
        setUyariGorunur(false)
        aktiviteTemizle()
        cikisYap()
      } else if (gecen >= UYARI_MS) {
        setUyariGorunur(true)
        setKalanSaniye(Math.max(0, Math.ceil((KAPATMA_MS - gecen) / 1000)))
      } else {
        if (uyariGorunur) setUyariGorunur(false)
      }
    }
    kontrolEt()  // ilk anda kontrol
    const t = setInterval(kontrolEt, KONTROL_MS)
    return () => clearInterval(t)
  }, [kullanici, cikisYap, uyariGorunur])

  return (
    <IdleTimeoutContext.Provider value={{ uyariGorunur, kalanSaniye, oturumUzat }}>
      {children}
    </IdleTimeoutContext.Provider>
  )
}

export function useIdleTimeout() {
  const ctx = useContext(IdleTimeoutContext)
  if (!ctx) throw new Error('useIdleTimeout must be used within IdleTimeoutProvider')
  return ctx
}
