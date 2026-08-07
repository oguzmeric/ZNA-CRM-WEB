// Liste sayfa numarasını URL'de tutar (?sayfa=N): detaya girip geri dönünce
// liste AYNI sayfada açılır; F5'te ve link paylaşımında da korunur (06.08).
//
// Kullanım:
//   const [sayfa, setSayfa, sayfaResetIlkMi] = useUrlSayfa()
//   useEffect(() => { if (sayfaResetIlkMi()) return; setSayfa(1) }, [filtreler])
//
// Reset effect'inin başındaki guard ŞART: ilk render'da URL'deki ?sayfa=N
// daha okunmadan 1'e ezilmesin (geri dönüş senaryosunun özü).
import { useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

export const useUrlSayfa = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const sayfa = Math.max(1, parseInt(searchParams.get('sayfa') || '1', 10) || 1)
  const setSayfa = (n) => setSearchParams(prev => {
    const p = new URLSearchParams(prev)
    if (Number(n) <= 1) p.delete('sayfa'); else p.set('sayfa', String(n))
    return p
  }, { replace: true })
  const ilk = useRef(true)
  const sayfaResetIlkMi = () => {
    if (ilk.current) { ilk.current = false; return true }
    return false
  }
  return [sayfa, setSayfa, sayfaResetIlkMi]
}
