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

  // ⚠️ SONSUZ RENDER DÖNGÜSÜ KORUMASI (14.08)
  // cikisYap AuthContext'te useCallback'SİZ tanımlı → AuthProvider'ın her
  // render'ında YENİ referans üretiyor. Bağımlılık dizisinde dururken aşağıdaki
  // kontrol effect'i her render'da yeniden kuruluyor, kontrolEt() setState/
  // cikisYap çağırıp yeni render tetikliyor ve döngü kapanmıyordu →
  // "Maximum update depth exceeded" + arka arkaya çıkış denemesi (401 yığını).
  // Bayat aktivite damgasıyla açılan sekmede tetikleniyordu.
  // Çözüm: değişken referanslar ref'te taşınır, effect yalnız `kullanici`ye bağlı.
  const cikisRef = useRef(cikisYap)
  const uyariRef = useRef(uyariGorunur)
  useEffect(() => { cikisRef.current = cikisYap })
  useEffect(() => { uyariRef.current = uyariGorunur }, [uyariGorunur])
  // Çıkış tek sefer tetiklensin — süre dolduğunda her tik yeniden çağırmasın.
  const cikisTetiklendiRef = useRef(false)

  // Aktiviteyi güncelle (yerel + localStorage)
  // Bağımlılık YOK: uyariGorunur ref'ten okunur, yoksa her uyarı değişiminde
  // beş aktivite dinleyicisi sökülüp yeniden bağlanıyordu.
  const aktiviteGuncelle = useCallback(() => {
    const simdi = Date.now()
    sonAktiviteRef.current = simdi
    if (simdi - sonYayinRef.current > KISIM_MS) {
      sonYayinRef.current = simdi
      aktiviteDamgala(simdi)
    }
    if (uyariRef.current) setUyariGorunur(false)
  }, [])

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
  // ⚠️ Bağımlılık YALNIZ [kullanici]. cikisYap ve uyariGorunur BİLEREK yok:
  // ikisi de burada set edilen/her render değişen değerler, dizide durunca
  // effect kendi kendini yeniden kurup sonsuz döngü yapıyordu (yukarıdaki not).
  useEffect(() => {
    if (!kullanici) {
      cikisTetiklendiRef.current = false
      setUyariGorunur(false)
      return
    }
    const kontrolEt = () => {
      const gecen = Date.now() - sonAktiviteRef.current
      if (gecen >= KAPATMA_MS) {
        if (cikisTetiklendiRef.current) return   // çıkış zaten yolda
        cikisTetiklendiRef.current = true
        setUyariGorunur(false)
        aktiviteTemizle()
        cikisRef.current?.()
      } else if (gecen >= UYARI_MS) {
        setUyariGorunur(true)
        setKalanSaniye(Math.max(0, Math.ceil((KAPATMA_MS - gecen) / 1000)))
      } else {
        setUyariGorunur(false)   // aynı değerde React zaten bail out eder
      }
    }
    kontrolEt()  // ilk anda kontrol
    const t = setInterval(kontrolEt, KONTROL_MS)
    return () => clearInterval(t)
  }, [kullanici])

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
