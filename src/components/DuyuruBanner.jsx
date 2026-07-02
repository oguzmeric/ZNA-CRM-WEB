import { useEffect, useState } from 'react'
import { Megaphone, X } from 'lucide-react'
import { aktifDuyurulariGetir } from '../services/duyuruService'

const SEVIYE_RENK = {
  info:    '#2563EB',
  warning: '#B45309',
  success: '#047857',
}

const OKUNAN_KEY = (uid) => `duyuru_okunanlar_${uid || 'anon'}`

// Aktif duyurular tek satırlık marquee — soldan sağa akar. Hover'da durur.
// Kullanıcı X ile listeyi tümüyle gizler; localStorage'da tutulur.
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
    <>
      <style>{`
        @keyframes duyuruAk {
          from { transform: translateX(-100%); }
          to   { transform: translateX(100%); }
        }
        .duyuru-bant:hover .duyuru-akis { animation-play-state: paused; }
      `}</style>
      <div
        className="duyuru-bant"
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', marginBottom: 14,
          background: 'var(--surface-sunken)',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          color: 'var(--brand-primary)',
          flexShrink: 0,
          font: '600 12px/16px var(--font-sans)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}>
          <Megaphone size={14} strokeWidth={1.75} />
          Duyuru
        </div>

        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', height: 20 }}>
          <div
            className="duyuru-akis"
            style={{
              position: 'absolute', whiteSpace: 'nowrap',
              animation: 'duyuruAk 15s linear infinite',
              font: '500 13px/20px var(--font-sans)',
            }}
          >
            {gorunecek.map((d, i) => {
              const renk = SEVIYE_RENK[d.seviye] || SEVIYE_RENK.info
              return (
                <span key={d.id}>
                  <span style={{ color: renk, fontWeight: 700 }}>■ </span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{d.baslik}</span>
                  {d.icerik && <span style={{ color: 'var(--text-secondary)' }}>{' — ' + d.icerik}</span>}
                  {i < gorunecek.length - 1 && <span style={{ color: 'var(--text-tertiary)' }}>{'  •  '}</span>}
                </span>
              )
            })}
          </div>
        </div>

        <button
          onClick={() => gorunecek.forEach(d => okundu(d.id))}
          title="Duyuruları gizle"
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
    </>
  )
}
