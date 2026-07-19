// Keşif fotoğrafı üzerine çizim editörü (KEŞİF DÜZENLEME dokümanı §3).
// Araçlar: serbest kalem, ok, çizgi, daire, dikdörtgen, metin, numara balonu, silgi.
// Şekiller GÖRÜNTÜ koordinatında (orijinal piksel) tutulur → cizim_veri.sekiller
// olarak kaydedilir ve sonradan yeniden düzenlenebilir. Kaydet: orijinal çözünürlükte
// flatten PNG (orijinal dosyaya dokunulmaz).
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Pen, MoveUpRight, Minus, Circle, Square, Type, Hash,
  Eraser, Undo2, Redo2, Trash2, Check,
} from 'lucide-react'

const RENKLER = ['#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#0f172a', '#ffffff']
const KALINLIKLAR = [2, 4, 6, 10]
const ARACLAR = [
  { id: 'kalem',      ikon: Pen,        ad: 'Serbest kalem' },
  { id: 'ok',         ikon: MoveUpRight, ad: 'Ok' },
  { id: 'cizgi',      ikon: Minus,      ad: 'Çizgi' },
  { id: 'daire',      ikon: Circle,     ad: 'Daire' },
  { id: 'dikdortgen', ikon: Square,     ad: 'Dikdörtgen' },
  { id: 'metin',      ikon: Type,       ad: 'Metin' },
  { id: 'balon',      ikon: Hash,       ad: 'Numara balonu' },
  { id: 'silgi',      ikon: Eraser,     ad: 'Silgi (şekle tıkla)' },
]

// ── Şekil çizimi (hem önizleme hem flatten aynı fonksiyonu kullanır) ─────────
function sekilCiz(ctx, s, olcek = 1) {
  ctx.strokeStyle = s.renk
  ctx.fillStyle = s.renk
  ctx.lineWidth = (s.kalinlik || 4) * olcek
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const P = (n) => n * olcek
  if (s.tip === 'kalem' && s.noktalar?.length) {
    ctx.beginPath()
    ctx.moveTo(P(s.noktalar[0].x), P(s.noktalar[0].y))
    for (let i = 1; i < s.noktalar.length; i++) ctx.lineTo(P(s.noktalar[i].x), P(s.noktalar[i].y))
    ctx.stroke()
  } else if (s.tip === 'cizgi' || s.tip === 'ok') {
    ctx.beginPath()
    ctx.moveTo(P(s.x1), P(s.y1))
    ctx.lineTo(P(s.x2), P(s.y2))
    ctx.stroke()
    if (s.tip === 'ok') {
      const aci = Math.atan2(s.y2 - s.y1, s.x2 - s.x1)
      const boy = Math.max(12, (s.kalinlik || 4) * 4) * olcek
      ctx.beginPath()
      ctx.moveTo(P(s.x2), P(s.y2))
      ctx.lineTo(P(s.x2) - boy * Math.cos(aci - Math.PI / 6), P(s.y2) - boy * Math.sin(aci - Math.PI / 6))
      ctx.moveTo(P(s.x2), P(s.y2))
      ctx.lineTo(P(s.x2) - boy * Math.cos(aci + Math.PI / 6), P(s.y2) - boy * Math.sin(aci + Math.PI / 6))
      ctx.stroke()
    }
  } else if (s.tip === 'daire') {
    ctx.beginPath()
    ctx.ellipse(P((s.x1 + s.x2) / 2), P((s.y1 + s.y2) / 2),
      Math.abs(P(s.x2 - s.x1)) / 2, Math.abs(P(s.y2 - s.y1)) / 2, 0, 0, Math.PI * 2)
    ctx.stroke()
  } else if (s.tip === 'dikdortgen') {
    ctx.strokeRect(P(Math.min(s.x1, s.x2)), P(Math.min(s.y1, s.y2)),
      Math.abs(P(s.x2 - s.x1)), Math.abs(P(s.y2 - s.y1)))
  } else if (s.tip === 'metin' && s.metin) {
    const boyut = (s.boyut || 28) * olcek
    ctx.font = `700 ${boyut}px system-ui, sans-serif`
    // Okunabilirlik: koyu kontur + renkli dolgu
    ctx.lineWidth = Math.max(2, boyut / 9)
    ctx.strokeStyle = s.renk === '#ffffff' ? '#0f172a' : '#ffffff'
    ctx.strokeText(s.metin, P(s.x), P(s.y))
    ctx.fillText(s.metin, P(s.x), P(s.y))
  } else if (s.tip === 'balon') {
    const r = (s.yaricap || 22) * olcek
    ctx.beginPath()
    ctx.arc(P(s.x), P(s.y), r, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 2 * olcek
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 ${r * 1.1}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(s.no), P(s.x), P(s.y) + r * 0.05)
    ctx.textAlign = 'start'
    ctx.textBaseline = 'alphabetic'
  }
}

// Silgi: şeklin kaba sınır kutusuna tıklama testi
function sekilIcindeMi(s, x, y) {
  const PAY = 14
  if (s.tip === 'kalem') return (s.noktalar || []).some(n => Math.abs(n.x - x) < PAY && Math.abs(n.y - y) < PAY)
  if (s.tip === 'metin') return x > s.x - PAY && x < s.x + (s.metin?.length || 1) * (s.boyut || 28) * 0.6 + PAY && y > s.y - (s.boyut || 28) - PAY && y < s.y + PAY
  if (s.tip === 'balon') return Math.hypot(s.x - x, s.y - y) < (s.yaricap || 22) + PAY
  const minX = Math.min(s.x1, s.x2) - PAY, maxX = Math.max(s.x1, s.x2) + PAY
  const minY = Math.min(s.y1, s.y2) - PAY, maxY = Math.max(s.y1, s.y2) + PAY
  return x >= minX && x <= maxX && y >= minY && y <= maxY
}

export default function KesifFotoCizim({ imageUrl, baslangicSekilleri = [], onKapat, onKaydet, kaydediliyor }) {
  const canvasRef = useRef(null)
  const kapRef = useRef(null)
  const imgRef = useRef(null)
  const [hazir, setHazir] = useState(false)
  const [hata, setHata] = useState('')
  const [sekiller, setSekiller] = useState(baslangicSekilleri)
  const [geriYigin, setGeriYigin] = useState([])
  const [ileriYigin, setIleriYigin] = useState([])
  const [arac, setArac] = useState('kalem')
  const [renk, setRenk] = useState('#dc2626')
  const [kalinlik, setKalinlik] = useState(4)
  const [taslak, setTaslak] = useState(null)           // sürükleme sırasındaki geçici şekil
  const [metinGiris, setMetinGiris] = useState(null)   // {x, y, ekranX, ekranY, deger}

  // Görüntüyü yükle (signed URL — canvas taint olmasın diye crossOrigin)
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { imgRef.current = img; setHazir(true) }
    img.onerror = () => setHata('Fotoğraf yüklenemedi.')
    img.src = imageUrl
  }, [imageUrl])

  const degistir = useCallback((yeniListe) => {
    setGeriYigin(p => [...p, sekiller])
    setIleriYigin([])
    setSekiller(yeniListe)
  }, [sekiller])

  // Önizleme çizimi
  useEffect(() => {
    if (!hazir) return
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const kap = kapRef.current
    const maxW = kap.clientWidth
    const maxH = kap.clientHeight
    const olcek = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1)
    canvas.width = Math.round(img.naturalWidth * olcek)
    canvas.height = Math.round(img.naturalHeight * olcek)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const s of sekiller) sekilCiz(ctx, s, olcek)
    if (taslak) sekilCiz(ctx, taslak, olcek)
  }, [hazir, sekiller, taslak])

  // Ekran → görüntü koordinatı
  const konum = (e) => {
    const canvas = canvasRef.current
    const r = canvas.getBoundingClientRect()
    const olcek = imgRef.current.naturalWidth / canvas.width
    const cw = canvas.width / r.width  // CSS küçültmesi
    return {
      x: (e.clientX - r.left) * cw * olcek,
      y: (e.clientY - r.top) * cw * olcek,
      ekranX: e.clientX - r.left,
      ekranY: e.clientY - r.top,
    }
  }

  const basla = (e) => {
    if (!hazir || metinGiris) return
    e.preventDefault()
    canvasRef.current.setPointerCapture?.(e.pointerId)
    const { x, y, ekranX, ekranY } = konum(e)
    if (arac === 'silgi') {
      for (let i = sekiller.length - 1; i >= 0; i--) {
        if (sekilIcindeMi(sekiller[i], x, y)) {
          degistir(sekiller.filter((_, j) => j !== i))
          return
        }
      }
      return
    }
    if (arac === 'metin') {
      setMetinGiris({ x, y, ekranX, ekranY, deger: '' })
      return
    }
    if (arac === 'balon') {
      const no = sekiller.filter(s => s.tip === 'balon').length + 1
      degistir([...sekiller, { tip: 'balon', x, y, no, renk, yaricap: 22 + kalinlik * 2 }])
      return
    }
    if (arac === 'kalem') setTaslak({ tip: 'kalem', noktalar: [{ x, y }], renk, kalinlik })
    else setTaslak({ tip: arac, x1: x, y1: y, x2: x, y2: y, renk, kalinlik })
  }

  const hareket = (e) => {
    if (!taslak) return
    const { x, y } = konum(e)
    setTaslak(t => t.tip === 'kalem'
      ? { ...t, noktalar: [...t.noktalar, { x, y }] }
      : { ...t, x2: x, y2: y })
  }

  const bitir = () => {
    if (!taslak) return
    const t = taslak
    setTaslak(null)
    const bos = t.tip === 'kalem'
      ? t.noktalar.length < 2
      : Math.abs(t.x2 - t.x1) < 4 && Math.abs(t.y2 - t.y1) < 4
    if (!bos) degistir([...sekiller, t])
  }

  const metinKaydet = () => {
    const m = metinGiris
    setMetinGiris(null)
    if (m?.deger?.trim()) {
      degistir([...sekiller, { tip: 'metin', x: m.x, y: m.y, metin: m.deger.trim(), renk, boyut: 22 + kalinlik * 3 }])
    }
  }

  const geriAl = () => {
    if (!geriYigin.length) return
    setIleriYigin(p => [...p, sekiller])
    setSekiller(geriYigin[geriYigin.length - 1])
    setGeriYigin(p => p.slice(0, -1))
  }
  const ileriAl = () => {
    if (!ileriYigin.length) return
    setGeriYigin(p => [...p, sekiller])
    setSekiller(ileriYigin[ileriYigin.length - 1])
    setIleriYigin(p => p.slice(0, -1))
  }
  const temizle = () => { if (sekiller.length) degistir([]) }

  // Flatten: orijinal çözünürlükte PNG üret
  const kaydet = async () => {
    if (!sekiller.length) { onKapat(); return }
    const img = imgRef.current
    const off = document.createElement('canvas')
    // Çok büyük fotoğraflarda çıktı boyutunu sınırla (uzun kenar 2000px)
    const kucult = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight))
    off.width = Math.round(img.naturalWidth * kucult)
    off.height = Math.round(img.naturalHeight * kucult)
    const ctx = off.getContext('2d')
    ctx.drawImage(img, 0, 0, off.width, off.height)
    for (const s of sekiller) sekilCiz(ctx, s, kucult)
    const blob = await new Promise(r => off.toBlob(r, 'image/png', 0.92))
    if (!blob) { setHata('Görsel oluşturulamadı.'); return }
    onKaydet(blob, { surum: 1, sekiller })
  }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(10, 14, 25, 0.94)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Üst çubuk */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', gap: 8 }}>
        <button onClick={onKapat} title="Kapat" style={ust.btn}><X size={18} /></button>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={geriAl} disabled={!geriYigin.length} title="Geri al" style={{ ...ust.btn, opacity: geriYigin.length ? 1 : 0.35 }}><Undo2 size={16} /></button>
          <button onClick={ileriAl} disabled={!ileriYigin.length} title="İleri al" style={{ ...ust.btn, opacity: ileriYigin.length ? 1 : 0.35 }}><Redo2 size={16} /></button>
          <button onClick={temizle} disabled={!sekiller.length} title="Tümünü temizle" style={{ ...ust.btn, opacity: sekiller.length ? 1 : 0.35 }}><Trash2 size={16} /></button>
        </div>
        <button onClick={kaydet} disabled={kaydediliyor}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            borderRadius: 8, border: 'none', cursor: 'pointer',
            background: '#16a34a', color: '#fff', font: '700 13px/18px var(--font-sans)',
            opacity: kaydediliyor ? 0.6 : 1,
          }}>
          <Check size={15} /> {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>

      {/* Araç çubuğu */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '0 10px 8px', flexWrap: 'wrap' }}>
        {ARACLAR.map(a => {
          const Ikon = a.ikon
          const aktif = arac === a.id
          return (
            <button key={a.id} onClick={() => setArac(a.id)} title={a.ad}
              style={{
                width: 38, height: 38, borderRadius: 8, cursor: 'pointer',
                display: 'grid', placeItems: 'center',
                border: aktif ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.18)',
                background: aktif ? 'rgba(96,165,250,0.22)' : 'rgba(255,255,255,0.06)',
                color: '#fff',
              }}>
              <Ikon size={17} strokeWidth={1.7} />
            </button>
          )
        })}
        <div style={{ width: 1, height: 26, background: 'rgba(255,255,255,0.2)', margin: '0 6px' }} />
        {RENKLER.map(r => (
          <button key={r} onClick={() => setRenk(r)} title={r}
            style={{
              width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', background: r,
              border: renk === r ? '3px solid #60a5fa' : '1px solid rgba(255,255,255,0.4)',
            }} />
        ))}
        <div style={{ width: 1, height: 26, background: 'rgba(255,255,255,0.2)', margin: '0 6px' }} />
        {KALINLIKLAR.map(k => (
          <button key={k} onClick={() => setKalinlik(k)} title={`${k}px`}
            style={{
              width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
              display: 'grid', placeItems: 'center',
              border: kalinlik === k ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.06)',
            }}>
            <span style={{ width: k * 1.6, height: k * 1.6, borderRadius: '50%', background: '#fff', display: 'block' }} />
          </button>
        ))}
      </div>

      {/* Canvas alanı */}
      <div ref={kapRef} style={{ flex: 1, display: 'grid', placeItems: 'center', overflow: 'hidden', padding: 8, position: 'relative' }}>
        {hata ? (
          <p style={{ color: '#fca5a5', font: '500 14px/20px var(--font-sans)' }}>{hata}</p>
        ) : !hazir ? (
          <p style={{ color: '#94a3b8', font: '500 14px/20px var(--font-sans)' }}>Fotoğraf yükleniyor…</p>
        ) : (
          <canvas
            ref={canvasRef}
            onPointerDown={basla}
            onPointerMove={hareket}
            onPointerUp={bitir}
            onPointerCancel={bitir}
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 6, touchAction: 'none', cursor: 'crosshair' }}
          />
        )}
        {metinGiris && (
          <input
            autoFocus
            value={metinGiris.deger}
            onChange={e => setMetinGiris(m => ({ ...m, deger: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') metinKaydet(); if (e.key === 'Escape') setMetinGiris(null) }}
            onBlur={metinKaydet}
            placeholder="Metni yaz, Enter'a bas…"
            style={{
              position: 'absolute',
              left: Math.min(metinGiris.ekranX + (canvasRef.current?.offsetLeft || 0), (kapRef.current?.clientWidth || 300) - 220),
              top: metinGiris.ekranY + (canvasRef.current?.offsetTop || 0),
              width: 210, padding: '7px 10px', borderRadius: 8,
              border: '2px solid #60a5fa', background: '#0f172a', color: '#fff',
              font: '600 13px/18px var(--font-sans)', outline: 'none',
            }}
          />
        )}
      </div>
      <p style={{ margin: 0, padding: '4px 12px 10px', textAlign: 'center', color: '#64748b', font: '500 11px/16px var(--font-sans)' }}>
        Orijinal fotoğraf korunur — çizim ayrı bir kopya olarak kaydedilir.
      </p>
    </div>,
    document.body,
  )
}

const ust = {
  btn: {
    width: 36, height: 36, borderRadius: 8, cursor: 'pointer',
    display: 'grid', placeItems: 'center',
    border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.06)', color: '#fff',
  },
}
