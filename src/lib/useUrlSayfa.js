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
import { sayfaOku, sayfaHesapla } from './sayfaNo'

export const useUrlSayfa = (resetDegerleri) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const sayfa = sayfaOku(searchParams.get('sayfa'))

  // Reset effect'inin sayfayı bağımlılığa almadan okuyabilmesi için.
  // ⚠️ Güncelleme EFFECT'te: render sırasında ref yazmak lint kuralınca yasak
  // (react-hooks/refs) ve React'in eşzamanlı render'ında güvenilmez. `sayfa`
  // ile `anahtar` aynı render'da değişmediği için sıra sorunu doğmaz.
  const sayfaRef = useRef(sayfa)
  useEffect(() => { sayfaRef.current = sayfa }, [sayfa])

  // ⚠️ FONKSİYONEL GÜNCELLEYİCİ DESTEKLENİR — `setSayfa(s => s + 1)` (17.08).
  // Hesap `sayfaNo.js`'te (tarayıcısız test edilebilsin diye); oradaki başlık
  // yorumu bu düzeltmenin neden gerektiğini anlatıyor.
  const setSayfa = useCallback((n) => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev)
      // ⚠️ Önceki değer `prev`'den okunur (ref'ten DEĞİL): art arda gelen
      // çağrılarda ref bayat kalabilir, URL parametresi kalmaz.
      const sayi = sayfaHesapla(p.get('sayfa'), n)
      if (sayi <= 1) p.delete('sayfa'); else p.set('sayfa', String(sayi))
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
    // ⚠️ Sayfa ZATEN 1 ise URL'e dokunma. setSearchParams her çağrıda yeni
    // location üretir ve router tüm sayfayı yeniden render eder — arama
    // kutusuna yazılan HER HARF "sayfa yenileniyor" hissi veriyordu (07.08,
    // Servis Raporları). Değişiklik yoksa çağrı da yok.
    if (sayfaRef.current !== 1) setSayfa(1)
  }, [anahtar, setSayfa])

  return [sayfa, setSayfa]
}
