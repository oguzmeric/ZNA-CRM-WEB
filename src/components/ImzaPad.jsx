// Basit imza pedi (fare + dokunmatik) — dataURL döner. Web'den bakım imzası için.
import { useRef, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from './ui'

export default function ImzaPad({ baslik = 'İmza', onKapat, onKaydet }) {
  const canvasRef = useRef(null)
  const cizdi = useRef(false)
  const [bos, setBos] = useState(true)

  useEffect(() => {
    const cv = canvasRef.current
    const ctx = cv.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, cv.width, cv.height)
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    let ciziyor = false
    const poz = (e) => {
      const r = cv.getBoundingClientRect()
      const p = e.touches ? e.touches[0] : e
      return { x: (p.clientX - r.left) * (cv.width / r.width), y: (p.clientY - r.top) * (cv.height / r.height) }
    }
    const basla = (e) => { ciziyor = true; const { x, y } = poz(e); ctx.beginPath(); ctx.moveTo(x, y); e.preventDefault() }
    const ciz = (e) => {
      if (!ciziyor) return
      const { x, y } = poz(e); ctx.lineTo(x, y); ctx.stroke()
      cizdi.current = true; setBos(false); e.preventDefault()
    }
    const bitir = () => { ciziyor = false }
    cv.addEventListener('mousedown', basla); cv.addEventListener('mousemove', ciz)
    window.addEventListener('mouseup', bitir)
    cv.addEventListener('touchstart', basla, { passive: false })
    cv.addEventListener('touchmove', ciz, { passive: false })
    cv.addEventListener('touchend', bitir)
    return () => {
      cv.removeEventListener('mousedown', basla); cv.removeEventListener('mousemove', ciz)
      window.removeEventListener('mouseup', bitir)
      cv.removeEventListener('touchstart', basla); cv.removeEventListener('touchmove', ciz)
      cv.removeEventListener('touchend', bitir)
    }
  }, [])

  const temizle = () => {
    const cv = canvasRef.current
    const ctx = cv.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, cv.width, cv.height)
    cizdi.current = false
    setBos(true)
  }

  return (
    <div onClick={onKapat} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', padding: 16, width: '100%', maxWidth: 520, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <strong style={{ color: 'var(--text-primary)', fontSize: 14 }}>{baslik}</strong>
          <button onClick={onKapat} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={18} /></button>
        </div>
        <canvas
          ref={canvasRef}
          width={960}
          height={320}
          style={{ width: '100%', height: 160, border: '1.5px dashed var(--border-default)', borderRadius: 10, background: '#fff', touchAction: 'none', cursor: 'crosshair' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
          <Button variant="ghost" onClick={temizle}>Temizle</Button>
          <Button variant="primary" disabled={bos} onClick={() => onKaydet(canvasRef.current.toDataURL('image/png'))}>
            İmzayı Kaydet
          </Button>
        </div>
      </div>
    </div>
  )
}
