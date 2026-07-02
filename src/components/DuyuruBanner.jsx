import { useEffect, useState } from 'react'
import { Megaphone, Info, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { aktifDuyurulariGetir } from '../services/duyuruService'

const SEVIYE = {
  info:    { renk: '#2563EB', bg: 'rgba(37,99,235,0.08)',  Icon: Info },
  warning: { renk: '#B45309', bg: 'rgba(180,83,9,0.10)',   Icon: AlertTriangle },
  success: { renk: '#047857', bg: 'rgba(4,120,87,0.08)',   Icon: CheckCircle2 },
}

const OKUNAN_KEY = (uid) => `duyuru_okunanlar_${uid || 'anon'}`

// Personel Dashboard'unun üstünde aktif duyuruları gösterir.
// Dismiss edilen id'ler localStorage'da tutulur; kullanıcı bir daha görmez.
export default function DuyuruBanner({ kullaniciId }) {
  const [duyurular, setDuyurular] = useState([])
  const [okunanlar, setOkunanlar] = useState(() => {
    try { return JSON.parse(localStorage.getItem(OKUNAN_KEY(kullaniciId)) || '[]') }
    catch { return [] }
  })

  useEffect(() => {
    aktifDuyurulariGetir()
      .then(setDuyurular)
      .catch(err => console.error('[DuyuruBanner]', err))
  }, [])

  const okundu = (id) => {
    const yeni = [...new Set([...okunanlar, id])]
    setOkunanlar(yeni)
    try { localStorage.setItem(OKUNAN_KEY(kullaniciId), JSON.stringify(yeni)) } catch {}
  }

  const gorunecek = duyurular.filter(d => !okunanlar.includes(d.id))
  if (gorunecek.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
      {gorunecek.map(d => {
        const s = SEVIYE[d.seviye] || SEVIYE.info
        const IconC = s.Icon
        return (
          <div
            key={d.id}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '10px 14px',
              background: s.bg,
              border: `1px solid ${s.renk}33`,
              borderLeft: `3px solid ${s.renk}`,
              borderRadius: 8,
            }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: s.renk, flexShrink: 0, marginTop: 2 }}>
              <Megaphone size={14} strokeWidth={1.75} />
              <IconC size={14} strokeWidth={1.75} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 2 }}>
                {d.baslik}
              </div>
              {d.icerik && (
                <div style={{ font: '400 12px/17px var(--font-sans)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                  {d.icerik}
                </div>
              )}
            </div>
            <button
              onClick={() => okundu(d.id)}
              title="Bu duyuruyu gizle"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-tertiary)', padding: 4,
                display: 'inline-flex', alignItems: 'center', flexShrink: 0,
                borderRadius: 4,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)' }}
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
