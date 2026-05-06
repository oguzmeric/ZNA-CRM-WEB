import { useState, useEffect, useCallback } from 'react'

// TCMB günlük kur XML — /api/tcmb/today.xml (Vercel rewrite + Vite proxy ile geçiriliyor)
// TCMB kurları her iş günü ~15:30'da güncellenir; hafta sonu/tatilde son iş günü kuru döner.

const CACHE_KEY = 'dovizKurlar'
const CACHE_ZAMAN_KEY = 'dovizKurZaman'
const CACHE_TTL_MS = 1000 * 60 * 30  // 30 dk

const parseTcmbXml = (xmlText) => {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml')
  if (doc.querySelector('parsererror')) throw new Error('XML parse hatası')

  const al = (kod) => {
    const node = doc.querySelector(`Currency[Kod="${kod}"] ForexSelling`)
    const v = node?.textContent?.trim()
    return v ? Number(v).toFixed(2) : null
  }
  const tarih = doc.querySelector('Tarih_Date')?.getAttribute('Tarih') || null

  return { USD: al('USD'), EUR: al('EUR'), tcmbTarih: tarih }
}

export function useDovizKuru() {
  const [kurlar, setKurlar] = useState(() => {
    const kayitli = localStorage.getItem(CACHE_KEY)
    const zamani = localStorage.getItem(CACHE_ZAMAN_KEY)
    if (kayitli && zamani) {
      const fark = Date.now() - Number(zamani)
      if (fark < CACHE_TTL_MS) return JSON.parse(kayitli)
    }
    return { USD: null, EUR: null, guncelleme: null, tcmbTarih: null }
  })
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState(null)

  const kurCek = useCallback(async () => {
    setYukleniyor(true)
    setHata(null)
    try {
      const res = await fetch('/api/tcmb/today.xml', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const xml = await res.text()
      const { USD, EUR, tcmbTarih } = parseTcmbXml(xml)

      const yeniKurlar = {
        USD,
        EUR,
        tcmbTarih,
        guncelleme: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      }
      setKurlar(yeniKurlar)
      localStorage.setItem(CACHE_KEY, JSON.stringify(yeniKurlar))
      localStorage.setItem(CACHE_ZAMAN_KEY, Date.now().toString())
    } catch (err) {
      console.warn('[doviz] kur çekilemedi:', err?.message)
      setHata('Kur bilgisi alınamadı')
    } finally {
      setYukleniyor(false)
    }
  }, [])

  useEffect(() => {
    const zamani = localStorage.getItem(CACHE_ZAMAN_KEY)
    if (zamani) {
      const fark = Date.now() - Number(zamani)
      if (fark < CACHE_TTL_MS) return
    }
    kurCek()
  }, [kurCek])

  return { kurlar, yukleniyor, hata, kurCek }
}
