// <img>'in HEIC'e dayanıklı hali — normal uzantıda düz <img>'e düşer (sıfır
// maliyet), .heic/.heif ise tarayıcıda JPEG'e çevirip gösterir (heicGoruntu).
// data-heic-durum: "bekliyor" → dönüşüm sürüyor; PDF üreticileri bu işareti
// bekleyerek eksik fotolu çıktı üretmekten kaçınır (BakimYazdir.pdfIndir).
import { useEffect, useState } from 'react'
import { heicMi, heicNesneUrlGetir } from '../lib/heicGoruntu'

export default function HeicResim({ src, alt = '', style, ...props }) {
  const heic = heicMi(src)
  const [durum, setDurum] = useState(heic ? 'bekliyor' : 'hazir')
  const [cozulmusUrl, setCozulmusUrl] = useState(heic ? null : src)

  useEffect(() => {
    if (!heicMi(src)) { setDurum('hazir'); setCozulmusUrl(src); return }
    let aktif = true
    setDurum('bekliyor'); setCozulmusUrl(null)
    heicNesneUrlGetir(src).then((url) => {
      if (!aktif) return
      if (url) { setCozulmusUrl(url); setDurum('hazir') }
      else setDurum('hata')
    })
    return () => { aktif = false }
  }, [src])

  if (durum === 'hazir') {
    return <img src={cozulmusUrl} alt={alt} style={style} {...props} />
  }
  return (
    <div
      data-heic-durum={durum}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f1f5f9', color: '#94a3b8', fontSize: 11,
        fontFamily: 'Arial, sans-serif', textAlign: 'center', padding: 8,
        ...style,
      }}
      {...props}
    >
      {durum === 'bekliyor' ? 'Fotoğraf hazırlanıyor…' : 'Fotoğraf görüntülenemedi (HEIC)'}
    </div>
  )
}
