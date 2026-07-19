// Çoklu seçim dropdown — chip yığınına alternatif (kullanıcı tercihi:
// "çoklu seçim olan her yerde dropdown kullanalım, sayfada kirlilik yapmasın").
// CustomSelect ile aynı portal/pozisyon kalıbı; panel içinde checkbox listesi,
// seçim yapınca panel AÇIK kalır (çoklu seçim akıcı olsun).
//
// API: degerler (array), onChange(yeniArray), secenekler [{id, ad}], placeholder

import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'

const trNorm = (s = '') => String(s).toLocaleLowerCase('tr')

export default function CokluSelect({
  degerler = [], onChange, secenekler = [], placeholder = 'Seç…', style = {},
}) {
  const [acik, setAcik] = useState(false)
  const [panelStyle, setPanelStyle] = useState(null)
  const [arama, setArama] = useState('')
  const ref = useRef(null)

  const secili = new Set(degerler)
  const seciliAdlar = secenekler.filter(s => secili.has(s.id)).map(s => s.ad)
  const gosterge = seciliAdlar.length === 0
    ? placeholder
    : seciliAdlar.length <= 2
      ? seciliAdlar.join(', ')
      : `${seciliAdlar.slice(0, 2).join(', ')} +${seciliAdlar.length - 2}`

  const q = trNorm(arama)
  const gorunen = q ? secenekler.filter(s => trNorm(s.ad).includes(q)) : secenekler

  const toggle = (id) => {
    const yeni = secili.has(id) ? degerler.filter(d => d !== id) : [...degerler, id]
    onChange?.(yeni)
  }

  useLayoutEffect(() => {
    if (!acik || !ref.current) return
    const recalc = () => {
      const rect = ref.current.getBoundingClientRect()
      const maxH = 320
      const asagida = window.innerHeight - rect.bottom
      const yukariAc = asagida < maxH && rect.top > asagida
      setPanelStyle({
        position: 'fixed',
        left: rect.left,
        width: Math.max(rect.width, 280),
        top: yukariAc ? undefined : rect.bottom + 4,
        bottom: yukariAc ? window.innerHeight - rect.top + 4 : undefined,
        maxHeight: maxH,
      })
    }
    recalc()
    window.addEventListener('scroll', recalc, true)
    window.addEventListener('resize', recalc)
    return () => {
      window.removeEventListener('scroll', recalc, true)
      window.removeEventListener('resize', recalc)
    }
  }, [acik])

  useEffect(() => {
    if (!acik) { setArama(''); return }
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest('[data-coklu-select-panel]')) {
        setAcik(false)
      }
    }
    const onKey = (e) => { if (e.key === 'Escape') setAcik(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [acik])

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', minWidth: 0 }}>
      <button
        type="button"
        onClick={() => setAcik(p => !p)}
        style={{
          background: 'var(--surface-card, #fff)',
          border: '1px solid var(--border-default, #D9DFE5)',
          color: seciliAdlar.length ? 'var(--text-primary, #0F1C2E)' : 'var(--text-tertiary)',
          borderRadius: 'var(--radius-sm, 4px)',
          padding: '8px 12px',
          font: '400 13px/22px var(--font-sans)',
          outline: 'none', width: '100%', textAlign: 'left',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 6,
          ...style,
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {gosterge}
        </span>
        {seciliAdlar.length > 0 && (
          <span style={{
            flexShrink: 0, minWidth: 20, height: 18, padding: '0 6px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 9, background: 'var(--brand-primary, #1E5AA8)', color: '#fff',
            font: '700 10px/1 var(--font-sans)',
          }}>{seciliAdlar.length}</span>
        )}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
          style={{ flexShrink: 0, transition: 'transform 0.15s', transform: acik ? 'rotate(180deg)' : 'none', opacity: 0.5 }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {acik && panelStyle && createPortal(
        <div
          data-coklu-select-panel
          style={{
            ...panelStyle,
            background: 'var(--surface-card, #fff)',
            border: '1px solid var(--border-default, #D9DFE5)',
            borderRadius: 'var(--radius-md, 6px)',
            boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.12))',
            display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 120000,
          }}
        >
          {secenekler.length > 8 && (
            <div style={{ padding: 8, borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
              <input
                type="text" value={arama} onChange={e => setArama(e.target.value)}
                placeholder="Ara…" autoFocus
                style={{
                  width: '100%', padding: '6px 10px',
                  font: '400 13px/18px var(--font-sans)',
                  background: 'var(--surface-sunken, #EDF0F3)',
                  border: '1px solid transparent', borderRadius: 4, outline: 'none',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          )}
          <div style={{ overflow: 'auto', flex: 1 }}>
            {gorunen.length === 0 ? (
              <div style={{ padding: 12, textAlign: 'center', font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                Sonuç bulunamadı
              </div>
            ) : gorunen.map(s => {
              const isaretli = secili.has(s.id)
              return (
                <div
                  key={s.id}
                  onMouseDown={(e) => { e.preventDefault(); toggle(s.id) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                    color: isaretli ? 'var(--brand-primary)' : 'var(--text-secondary)',
                    background: isaretli ? 'var(--brand-primary-soft, rgba(30,90,168,0.08))' : 'transparent',
                    fontWeight: isaretli ? 600 : 400,
                  }}
                  onMouseEnter={e => { if (!isaretli) e.currentTarget.style.background = 'var(--surface-sunken, #EDF0F3)' }}
                  onMouseLeave={e => { if (!isaretli) e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                    border: `1.5px solid ${isaretli ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                    background: isaretli ? 'var(--brand-primary)' : 'transparent',
                    display: 'grid', placeItems: 'center', color: '#fff',
                  }}>
                    {isaretli && <Check size={11} strokeWidth={3} />}
                  </span>
                  {s.ad}
                </div>
              )
            })}
          </div>
          <div style={{
            padding: '6px 12px', borderTop: '1px solid var(--border-default)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
            background: 'var(--surface-sunken, #EDF0F3)',
          }}>
            <span style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
              {seciliAdlar.length} seçili
            </span>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setAcik(false) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--brand-primary)', font: '600 12px/16px var(--font-sans)', padding: '2px 4px',
              }}
            >
              Tamam
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
