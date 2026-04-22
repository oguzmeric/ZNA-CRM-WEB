import { useState, useEffect } from 'react'

export function useDovizKuru() {
  const [kurlar, setKurlar] = useState(() => {
    const kayitli = localStorage.getItem('dovizKurlar')
    const zamani = localStorage.getItem('dovizKurZaman')
    if (kayitli && zamani) {
      const fark = Date.now() - Number(zamani)
      if (fark < 1000 * 60 * 30) {
        return JSON.parse(kayitli)
      }
    }
    return { USD: null, EUR: null, guncelleme: null }
  })
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState(null)

  const kurCek = async () => {
    setYukleniyor(true)
    setHata(null)
    try {
      const [usdRes, eurRes] = await Promise.all([
        fetch('/api/doviz/latest?from=USD&to=TRY'),
        fetch('/api/doviz/latest?from=EUR&to=TRY'),
      ])

      const usdVeri = await usdRes.json()
      const eurVeri = await eurRes.json()

      const yeniKurlar = {
        USD: usdVeri.rates?.TRY ? Number(usdVeri.rates.TRY).toFixed(2) : null,
        EUR: eurVeri.rates?.TRY ? Number(eurVeri.rates.TRY).toFixed(2) : null,
        guncelleme: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      }

      setKurlar(yeniKurlar)
      localStorage.setItem('dovizKurlar', JSON.stringify(yeniKurlar))
      localStorage.setItem('dovizKurZaman', Date.now().toString())
    } catch (err) {
      setHata('Kur bilgisi alınamadı')
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => {
    const kayitli = localStorage.getItem('dovizKurlar')
    const zamani = localStorage.getItem('dovizKurZaman')
    if (kayitli && zamani) {
      const fark = Date.now() - Number(zamani)
      if (fark < 1000 * 60 * 30) return
    }
    kurCek()
  }, [])

  return { kurlar, yukleniyor, hata, kurCek }
}