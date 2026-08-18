// Sekme verisi kancası — tembel yükleme + hata durumu, TEK yerde.
//
// ⚠️ SONSUZ DÖNGÜ KORUMASI: yükleyici fonksiyon her render'da yeniden
// oluşturulduğu için effect bağımlılığına KONMAZ; ref'te tutulur ve ref
// RENDER SIRASINDA DEĞİL ayrı bir effect'te güncellenir. Bu proje bu tuzağa
// bir kez düştü (14.08: memoize edilmemiş fn effect dizisinde → 2678 çağrı).
//
// Yükleme bayrağı effect gövdesinde senkron set EDİLMEZ (cascading render);
// başlangıçta zaten true, yenilemede `yenile()` içinde — yani olay
// işleyicisinde — set edilir.

import { useState, useEffect, useRef, useCallback } from 'react'

export function useSekmeVeri(yukleyici, deps = []) {
  const [durum, setDurum] = useState({ veri: null, yukleniyor: true, hata: null })
  const [sayac, setSayac] = useState(0)

  const fnRef = useRef(yukleyici)
  useEffect(() => { fnRef.current = yukleyici })

  useEffect(() => {
    let iptal = false
    const calistir = async () => {
      try {
        const v = await fnRef.current()
        if (!iptal) setDurum({ veri: v, yukleniyor: false, hata: null })
      } catch (e) {
        if (iptal) return
        console.error('[sicil sekme]', e?.message || e)
        setDurum({ veri: null, yukleniyor: false, hata: e })
      }
    }
    calistir()
    return () => { iptal = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, sayac])

  const yenile = useCallback(() => {
    setDurum({ veri: null, yukleniyor: true, hata: null })
    setSayac(s => s + 1)
  }, [])

  return { ...durum, yenile }
}
