// <img>'in HEIC'e dayanıklı hali — normal uzantıda düz <img>'e düşer (sıfır
// maliyet), .heic/.heif ise Supabase render endpoint'inden sunucuda JPEG'e
// çevrilmiş halini gösterir (heicGoruntu). Beklemesizdir; yazdır ve PDF
// akışları normal <img> gibi davranır.
import { useEffect, useState } from 'react'
import { heicMi, heicGosterimUrl } from '../lib/heicGoruntu'

export default function HeicResim({ src, alt = '', style, ...props }) {
  const [hata, setHata] = useState(false)
  useEffect(() => { setHata(false) }, [src])

  if (heicMi(src) && hata) {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f1f5f9', color: '#94a3b8', fontSize: 11,
          fontFamily: 'Arial, sans-serif', textAlign: 'center', padding: 8,
          ...style,
        }}
        {...props}
      >
        Fotoğraf görüntülenemedi (HEIC)
      </div>
    )
  }
  return (
    <img
      src={heicGosterimUrl(src)}
      alt={alt}
      style={style}
      onError={heicMi(src) ? () => setHata(true) : undefined}
      {...props}
    />
  )
}
