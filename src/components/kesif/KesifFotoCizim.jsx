// Keşif fotoğrafı üzerine çizim editörü (KEŞİF DÜZENLEME dokümanı §3).
// Araçlar: serbest kalem, ok, çizgi, daire, dikdörtgen, metin, numara balonu, silgi.
// Şekiller GÖRÜNTÜ koordinatında (orijinal piksel) tutulur → cizim_veri.sekiller
// olarak kaydedilir ve sonradan yeniden düzenlenebilir. Kaydet: orijinal çözünürlükte
// flatten PNG (orijinal dosyaya dokunulmaz).
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Pen, MoveUpRight, Minus, Circle, Square, Type, Hash,
  Eraser, Undo2, Redo2, Trash2, Check, BrickWall, Cable, MapPin,
  Camera, Video, HardDrive, Server, Zap, Globe, RotateCw, LogIn,
} from 'lucide-react'
import { KROKI_SEMBOLLERI, krokiSembolBilgi, KROKI_SEMBOL_PATH } from '../../services/kesifService'

// Sembol path'lerini bir kez Path2D'ye çevir (her karede yeniden kurmayalım)
const SEMBOL_PATH2D = Object.fromEntries(
  Object.entries(KROKI_SEMBOL_PATH).map(([k, d]) => [k, new Path2D(d)]),
)

// Sembol ikon adı (Feather) → lucide bileşeni — palet çipi gerçek mini görselle
const SEMBOL_IKON = {
  camera: Camera, video: Video, 'hard-drive': HardDrive, server: Server,
  zap: Zap, globe: Globe, minus: Minus, 'rotate-cw': RotateCw, 'log-in': LogIn,
}

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
// Kroki moduna özel araçlar (2026-07-19 karar: boş tuval + duvar/kablo/sembol paleti)
const KROKI_ARACLAR = [
  { id: 'duvar',  ikon: BrickWall, ad: 'Duvar (kalın çizgi)' },
  { id: 'kablo',  ikon: Cable,     ad: 'Kablo güzergahı (kesikli)' },
  { id: 'sembol', ikon: MapPin,    ad: 'Sembol yerleştir — mevcut sembole tıkla: kaleme bağla/sil' },
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
  } else if (s.tip === 'duvar') {
    ctx.lineWidth = 10 * olcek
    ctx.strokeStyle = s.renk || '#334155'
    ctx.beginPath()
    ctx.moveTo(P(s.x1), P(s.y1))
    ctx.lineTo(P(s.x2), P(s.y2))
    ctx.stroke()
  } else if (s.tip === 'kablo' && s.noktalar?.length) {
    ctx.setLineDash([12 * olcek, 8 * olcek])
    ctx.beginPath()
    ctx.moveTo(P(s.noktalar[0].x), P(s.noktalar[0].y))
    for (let i = 1; i < s.noktalar.length; i++) ctx.lineTo(P(s.noktalar[i].x), P(s.noktalar[i].y))
    ctx.stroke()
    ctx.setLineDash([])
  } else if (s.tip === 'sembol') {
    const b = krokiSembolBilgi(s.sembol)
    const r = (s.boyut || 28) * olcek
    const cx = P(s.x), cy = P(s.y)
    // renkli daire + halka (kaleme bağlıysa sarı)
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = b.renk; ctx.fill()
    ctx.lineWidth = 2.5 * olcek
    ctx.strokeStyle = s.kalemId ? '#facc15' : '#ffffff'
    ctx.stroke()
    // GERÇEK İKON — lucide 24×24 path, beyaz stroke, daire merkezine ölçekli
    const p2d = SEMBOL_PATH2D[s.sembol]
    if (p2d) {
      const sc = (r * 1.35) / 24
      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(sc, sc)
      ctx.translate(-12, -12)
      ctx.strokeStyle = '#ffffff'
      ctx.fillStyle = 'transparent'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke(p2d)
      ctx.restore()
    }
    // numara rozeti — sağ-alt köşe (ikon tipini belirtir, K/N ayrımı ikonla)
    const nr = r * 0.6
    const nx = cx + r * 0.72, ny = cy + r * 0.72
    ctx.beginPath(); ctx.arc(nx, ny, nr, 0, Math.PI * 2)
    ctx.fillStyle = '#0f172a'; ctx.fill()
    ctx.lineWidth = 1.5 * olcek; ctx.strokeStyle = '#ffffff'; ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.font = `800 ${nr * 1.15}px system-ui, sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(String(s.no), nx, ny + nr * 0.05)
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'
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
  if (s.tip === 'kalem' || s.tip === 'kablo') return (s.noktalar || []).some(n => Math.abs(n.x - x) < PAY && Math.abs(n.y - y) < PAY)
  if (s.tip === 'sembol') return Math.hypot(s.x - x, s.y - y) < (s.boyut || 26) + PAY
  if (s.tip === 'metin') return x > s.x - PAY && x < s.x + (s.metin?.length || 1) * (s.boyut || 28) * 0.6 + PAY && y > s.y - (s.boyut || 28) - PAY && y < s.y + PAY
  if (s.tip === 'balon') return Math.hypot(s.x - x, s.y - y) < (s.yaricap || 22) + PAY
  const minX = Math.min(s.x1, s.x2) - PAY, maxX = Math.max(s.x1, s.x2) + PAY
  const minY = Math.min(s.y1, s.y2) - PAY, maxY = Math.max(s.y1, s.y2) + PAY
  return x >= minX && x <= maxX && y >= minY && y <= maxY
}

// Kroki tuvalına açık gri ızgara çiz (hem önizleme hem flatten)
function izgaraCiz(ctx, w, h, olcek) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w * olcek, h * olcek)
  ctx.strokeStyle = '#e8edf3'
  ctx.lineWidth = 1
  for (let x = 100; x < w; x += 100) {
    ctx.beginPath(); ctx.moveTo(x * olcek, 0); ctx.lineTo(x * olcek, h * olcek); ctx.stroke()
  }
  for (let y = 100; y < h; y += 100) {
    ctx.beginPath(); ctx.moveTo(0, y * olcek); ctx.lineTo(w * olcek, y * olcek); ctx.stroke()
  }
}

export default function KesifFotoCizim({
  imageUrl, baslangicSekilleri = [], onKapat, onKaydet, kaydediliyor,
  krokiModu = false, tuval = { w: 1600, h: 1200 }, kalemler = [],
}) {
  const canvasRef = useRef(null)
  const kapRef = useRef(null)
  const imgRef = useRef(null)
  const [hazir, setHazir] = useState(krokiModu)
  const [hata, setHata] = useState('')
  const [sekiller, setSekiller] = useState(baslangicSekilleri)
  const [geriYigin, setGeriYigin] = useState([])
  const [ileriYigin, setIleriYigin] = useState([])
  const [arac, setArac] = useState('kalem')
  const [renk, setRenk] = useState('#dc2626')
  const [kalinlik, setKalinlik] = useState(4)
  const [taslak, setTaslak] = useState(null)           // sürükleme sırasındaki geçici şekil
  const [metinGiris, setMetinGiris] = useState(null)   // {x, y, ekranX, ekranY, deger}
  const [secSembol, setSecSembol] = useState('kamera') // aktif sembol tipi (kroki)
  const [sembolPanel, setSembolPanel] = useState(null) // {index, ekranX, ekranY} — kalem bağla/sil

  // Görüntü boyutu: kroki modunda sabit tuval, foto modunda doğal boyut
  const dogalW = krokiModu ? tuval.w : (imgRef.current?.naturalWidth || 0)
  const dogalH = krokiModu ? tuval.h : (imgRef.current?.naturalHeight || 0)

  // Görüntüyü yükle (signed URL — canvas taint olmasın diye crossOrigin)
  useEffect(() => {
    if (krokiModu) return // kroki: foto yok, tuval hazır
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { imgRef.current = img; setHazir(true) }
    img.onerror = () => setHata('Fotoğraf yüklenemedi.')
    img.src = imageUrl
  }, [imageUrl, krokiModu])

  const degistir = useCallback((yeniListe) => {
    setGeriYigin(p => [...p, sekiller])
    setIleriYigin([])
    setSekiller(yeniListe)
  }, [sekiller])

  // Önizleme çizimi
  useEffect(() => {
    if (!hazir) return
    const canvas = canvasRef.current
    if (!canvas || !dogalW) return
    const kap = kapRef.current
    const maxW = kap.clientWidth
    const maxH = kap.clientHeight
    const olcek = Math.min(maxW / dogalW, maxH / dogalH, 1)
    canvas.width = Math.round(dogalW * olcek)
    canvas.height = Math.round(dogalH * olcek)
    const ctx = canvas.getContext('2d')
    if (krokiModu) izgaraCiz(ctx, dogalW, dogalH, olcek)
    else ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height)
    for (const s of sekiller) sekilCiz(ctx, s, olcek)
    if (taslak) sekilCiz(ctx, taslak, olcek)
  }, [hazir, sekiller, taslak, krokiModu, dogalW, dogalH])

  // Ekran → görüntü koordinatı
  const konum = (e) => {
    const canvas = canvasRef.current
    const r = canvas.getBoundingClientRect()
    const olcek = dogalW / canvas.width
    const cw = canvas.width / r.width  // CSS küçültmesi
    return {
      x: (e.clientX - r.left) * cw * olcek,
      y: (e.clientY - r.top) * cw * olcek,
      ekranX: e.clientX - r.left,
      ekranY: e.clientY - r.top,
    }
  }

  const basla = (e) => {
    if (!hazir || metinGiris || sembolPanel) return
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
    if (arac === 'sembol') {
      // Önce mevcut sembole tıklama: kaleme bağla / sil paneli
      for (let i = sekiller.length - 1; i >= 0; i--) {
        if (sekiller[i].tip === 'sembol' && sekilIcindeMi(sekiller[i], x, y)) {
          setSembolPanel({ index: i, ekranX, ekranY })
          return
        }
      }
      const no = sekiller.filter(s => s.tip === 'sembol' && s.sembol === secSembol).length + 1
      degistir([...sekiller, { tip: 'sembol', sembol: secSembol, x, y, no, boyut: 28 }])
      return
    }
    if (arac === 'kalem' || arac === 'kablo') setTaslak({ tip: arac, noktalar: [{ x, y }], renk, kalinlik })
    else if (arac === 'duvar') setTaslak({ tip: 'duvar', x1: x, y1: y, x2: x, y2: y, renk: '#334155' })
    else setTaslak({ tip: arac, x1: x, y1: y, x2: x, y2: y, renk, kalinlik })
  }

  const hareket = (e) => {
    if (!taslak) return
    const { x, y } = konum(e)
    setTaslak(t => (t.tip === 'kalem' || t.tip === 'kablo')
      ? { ...t, noktalar: [...t.noktalar, { x, y }] }
      : { ...t, x2: x, y2: y })
  }

  const bitir = () => {
    if (!taslak) return
    const t = taslak
    setTaslak(null)
    const bos = (t.tip === 'kalem' || t.tip === 'kablo')
      ? t.noktalar.length < 2
      : Math.abs(t.x2 - t.x1) < 4 && Math.abs(t.y2 - t.y1) < 4
    if (!bos) degistir([...sekiller, t])
  }

  const sembolGuncelle = (index, degisiklik) => {
    degistir(sekiller.map((s, i) => i === index ? { ...s, ...degisiklik } : s))
    setSembolPanel(null)
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
    const off = document.createElement('canvas')
    // Çok büyük fotoğraflarda çıktı boyutunu sınırla (uzun kenar 2000px)
    const kucult = Math.min(1, 2000 / Math.max(dogalW, dogalH))
    off.width = Math.round(dogalW * kucult)
    off.height = Math.round(dogalH * kucult)
    const ctx = off.getContext('2d')
    if (krokiModu) izgaraCiz(ctx, dogalW, dogalH, kucult)
    else ctx.drawImage(imgRef.current, 0, 0, off.width, off.height)
    for (const s of sekiller) sekilCiz(ctx, s, kucult)
    const blob = await new Promise(r => off.toBlob(r, 'image/png', 0.92))
    if (!blob) { setHata('Görsel oluşturulamadı.'); return }
    onKaydet(blob, { surum: 1, sekiller })
  }

  const araclar = krokiModu ? [...KROKI_ARACLAR, ...ARACLAR] : ARACLAR

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
        {araclar.map(a => {
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

      {/* Sembol paleti — sembol aracı seçiliyken (kroki) */}
      {krokiModu && arac === 'sembol' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 10px 8px', flexWrap: 'wrap' }}>
          {KROKI_SEMBOLLERI.map(s => {
            const Ikon = SEMBOL_IKON[s.ikon] || Circle
            return (
              <button key={s.id} onClick={() => setSecSembol(s.id)} title={s.ad}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px',
                  borderRadius: 16, cursor: 'pointer',
                  border: secSembol === s.id ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.18)',
                  background: secSembol === s.id ? 'rgba(96,165,250,0.18)' : 'rgba(255,255,255,0.05)',
                  color: '#fff', font: '700 11px/15px var(--font-sans)',
                }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: s.renk, display: 'grid', placeItems: 'center' }}>
                  <Ikon size={12} color="#fff" strokeWidth={2.4} />
                </span>
                {s.ad}
              </button>
            )
          })}
        </div>
      )}

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
        {/* Sembol paneli — kaleme bağla / sil */}
        {sembolPanel && sekiller[sembolPanel.index] && (() => {
          const s = sekiller[sembolPanel.index]
          const b = krokiSembolBilgi(s.sembol)
          return (
            <div style={{
              position: 'absolute',
              left: Math.min(sembolPanel.ekranX + (canvasRef.current?.offsetLeft || 0), (kapRef.current?.clientWidth || 320) - 250),
              top: Math.min(sembolPanel.ekranY + (canvasRef.current?.offsetTop || 0), (kapRef.current?.clientHeight || 300) - 160),
              width: 240, padding: 12, borderRadius: 10, zIndex: 2,
              background: '#0f172a', border: '1px solid #334155', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#fff', font: '700 12.5px/17px var(--font-sans)' }}>{b.kod}{s.no} — {b.ad}</span>
                <button onClick={() => setSembolPanel(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2 }}><X size={14} /></button>
              </div>
              <label style={{ display: 'block', color: '#94a3b8', font: '600 10.5px/14px var(--font-sans)', marginBottom: 4 }}>İLGİLİ KEŞİF KALEMİ</label>
              <select
                value={s.kalemId || ''}
                onChange={e => sembolGuncelle(sembolPanel.index, { kalemId: e.target.value ? Number(e.target.value) : null })}
                style={{
                  width: '100%', padding: '7px 8px', borderRadius: 8, marginBottom: 10,
                  background: '#1e293b', color: '#fff', border: '1px solid #334155', font: '500 12.5px/17px var(--font-sans)',
                }}>
                <option value="">Bağlı değil</option>
                {(kalemler || []).map(k => <option key={k.id} value={k.id}>{k.miktar} {k.birim} — {k.urunAdi}</option>)}
              </select>
              <button
                onClick={() => { degistir(sekiller.filter((_, j) => j !== sembolPanel.index)); setSembolPanel(null) }}
                style={{
                  width: '100%', padding: '7px 0', borderRadius: 8, cursor: 'pointer',
                  background: 'rgba(220,38,38,0.15)', border: '1px solid #dc2626', color: '#fca5a5',
                  font: '700 12px/16px var(--font-sans)',
                }}>
                Sembolü Sil
              </button>
            </div>
          )
        })()}
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
        {krokiModu
          ? 'Duvar aracıyla mekân sınırlarını, sembol aracıyla cihaz noktalarını yerleştir — mevcut sembole tıklayınca kaleme bağlayabilirsin.'
          : 'Orijinal fotoğraf korunur — çizim ayrı bir kopya olarak kaydedilir.'}
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
