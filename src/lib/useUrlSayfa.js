// Liste sayfa numarasını URL'de tutar (?sayfa=N): detaya girip geri dönünce
// liste AYNI sayfada açılır; F5'te ve link paylaşımında da korunur (06.08).
//
// Kullanım:
//   const [sayfa, setSayfa] = useUrlSayfa([filtre, arama, sayfaBoyutu])
//   (dizi = filtre değişince 1. sayfaya dönülecek değerler; boş bırakılabilir)
//
// ⚠️ Reset DEĞER karşılaştırmasıyla yapılır (referansla değil): Stok'taki
// ozellikFiltre gibi OBJE bağımlılıklar her render'da yeni referans üretip
// sayfayı sessizce 1'e çekiyordu — kullanıcı "geri dönünce hep 1. sayfa"
// diye bildirdi. JSON değeri aynıysa reset ÇALIŞMAZ; async yüklenen filtreler
// ve React StrictMode'un çift effect çağrısı da bu sayede zararsız.
import { useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

export const useUrlSayfa = (resetDegerleri) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const sayfa = Math.max(1, parseInt(searchParams.get('sayfa') || '1', 10) || 1)

  const setSayfa = useCallback((n) => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev)
      if (Number(n) <= 1) p.delete('sayfa'); else p.set('sayfa', String(n))
      return p
    }, { replace: true })
  }, [setSearchParams])

  // Filtre değişince 1. sayfaya dön — yalnız GERÇEK değer değişiminde
  const anahtar = resetDegerleri === undefined ? null : JSON.stringify(resetDegerleri)
  const oncekiAnahtar = useRef(anahtar)
  useEffect(() => {
    if (anahtar === null) return
    if (oncekiAnahtar.current === anahtar) return   // ilk render + referans-only değişim
    oncekiAnahtar.current = anahtar
    setSayfa(1)
  }, [anahtar, setSayfa])

  return [sayfa, setSayfa]
}
