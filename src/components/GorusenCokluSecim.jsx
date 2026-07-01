import { useState } from 'react'
import { X } from 'lucide-react'

// Görüşen kişileri çoklu seçim — DB'de "Oğuz, Ali" gibi virgülle ayrılmış string olarak tutar.
// Mevcut tek-değerli kayıtlarla geriye dönük uyumlu.
export default function GorusenCokluSecim({ value, onChange, kullanicilar }) {
  const [acik, setAcik] = useState(false)
  const secililer = (value || '').split(',').map(s => s.trim()).filter(Boolean)
  const toggle = (ad) => {
    const yeni = secililer.includes(ad)
      ? secililer.filter(x => x !== ad)
      : [...secililer, ad]
    onChange(yeni.join(', '))
  }
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setAcik(a => !a)}
        style={{
          width: '100%', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          minHeight: 38, padding: '6px 32px 6px 10px',
          background: 'var(--surface-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          font: '400 13px/18px var(--font-sans)',
          color: secililer.length ? 'var(--text-primary)' : 'var(--text-tertiary)',
          cursor: 'pointer',
          position: 'relative',
        }}
      >
        {secililer.length === 0 ? (
          'Kişi seç…'
        ) : (
          secililer.map(ad => (
            <span
              key={ad}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 4px 2px 8px',
                background: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary)',
                borderRadius: 'var(--radius-pill)',
                font: '500 12px/16px var(--font-sans)',
              }}
              onClick={e => e.stopPropagation()}
            >
              {ad}
              <span
                role="button"
                onClick={e => { e.stopPropagation(); toggle(ad) }}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 16, height: 16, borderRadius: '50%',
                  color: 'var(--brand-primary)',
                  cursor: 'pointer',
                }}
                title="Kaldır"
              ><X size={11} strokeWidth={2} /></span>
            </span>
          ))
        )}
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-tertiary)' }}>
          <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {acik && (
        <>
          <div onClick={() => setAcik(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            maxHeight: 260, overflowY: 'auto',
            background: 'var(--surface-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 50,
            padding: 4,
          }}>
            {kullanicilar.length === 0 && (
              <div style={{ padding: '10px 12px', font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>Kullanıcı yok</div>
            )}
            {kullanicilar.map(k => {
              const seciliMi = secililer.includes(k.ad)
              return (
                <label
                  key={k.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    background: seciliMi ? 'var(--brand-primary-soft)' : 'transparent',
                    font: '500 13px/18px var(--font-sans)',
                    color: 'var(--text-primary)',
                  }}
                  onMouseEnter={e => { if (!seciliMi) e.currentTarget.style.background = 'var(--surface-sunken)' }}
                  onMouseLeave={e => { if (!seciliMi) e.currentTarget.style.background = 'transparent' }}
                >
                  <input
                    type="checkbox"
                    checked={seciliMi}
                    onChange={() => toggle(k.ad)}
                    style={{ margin: 0, cursor: 'pointer' }}
                  />
                  {k.ad}
                </label>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
