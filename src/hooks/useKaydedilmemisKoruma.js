// Form sayfası/kartı için kaydedilmemiş-değişiklik koruması (22.08 denetimi).
//
// Kullanım:
//   const { serbestBirak, cikisOnayi } = useKaydedilmemisKoruma(kirli)
//   kaydet başarılı → serbestBirak(); navigate(...)    // aynı tick'te güvenli (ref)
//   sayfa içi Geri → if (await cikisOnayi()) geriDon(navigate, '/liste')
//
// `kirli` hesabı çağıranın işi ve YANLIŞ POZİTİF üretmemeli: başlangıç
// snapshot'ı yükleme/ön doldurma TAMAMLANDIKTAN sonra alınmalı, otomatik
// hesaplanan alanlar karşılaştırma dışı tutulmalı. "Düzenleme modu açık" =
// kirli DEĞİLDİR (PersonelSicil'deki eski yaklaşım örnek alınmamalı).
//
// Kapsam: (1) sekme kapatma/yenileme — beforeunload; (2) uygulama içi geçiş —
// KirliFormContext'e kayıt (MainLayout sidebar, Ctrl+K, bildirim tıklaması sorar).
import { useCallback, useEffect, useId, useRef } from 'react'
import { useKirliForm } from '../context/KirliFormContext'

export function useKaydedilmemisKoruma(kirli) {
  const { kayitEt, kaldir, cikisOnayi } = useKirliForm()
  const key = useId()
  const kirliRef = useRef(false)
  const serbestRef = useRef(false)   // kaydet sonrası aynı tick'te navigate için

  useEffect(() => { kirliRef.current = !!kirli; if (kirli) serbestRef.current = false }, [kirli])

  useEffect(() => {
    kayitEt(key, () => kirliRef.current && !serbestRef.current)
    return () => kaldir(key)
  }, [key, kayitEt, kaldir])

  useEffect(() => {
    if (!kirli) return undefined
    const uyar = (e) => { if (serbestRef.current) return; e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', uyar)
    return () => window.removeEventListener('beforeunload', uyar)
  }, [kirli])

  const serbestBirak = useCallback(() => { serbestRef.current = true; kirliRef.current = false }, [])
  return { serbestBirak, cikisOnayi }
}
