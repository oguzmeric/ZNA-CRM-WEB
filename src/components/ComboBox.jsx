import { useState, useRef, useMemo } from 'react'
import { Input } from './ui'

const trNormalize = (s = '') =>
  String(s).toLocaleLowerCase('tr')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')

// CustomSelect görsel diliyle uyumlu, serbest metin girişi + öneri dropdown.
// value: string, onChange(v), options: string[], placeholder, disabled
export default function ComboBox({
  value = '',
  onChange,
  options = [],
  placeholder = '',
  disabled = false,
  onSelectOption,
}) {
  const [acik, setAcik] = useState(false)
  const [vurgu, setVurgu] = useState(0)
  const ref = useRef(null)

  const filtreli = useMemo(() => {
    const q = trNormalize(value)
    if (!q) return options.slice(0, 30)
    return options.filter(o => trNormalize(o).includes(q)).slice(0, 30)
  }, [value, options])

  const sec = (v) => {
    onSelectOption?.(v)
    onChange?.(v)
    setAcik(false)
  }

  const handleKey = (e) => {
    if (!acik || filtreli.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setVurgu(i => Math.min(i + 1, filtreli.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setVurgu(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      if (filtreli[vurgu]) { e.preventDefault(); sec(filtreli[vurgu]) }
    }
    else if (e.key === 'Escape') { setAcik(false) }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Input
        value={value}
        onChange={e => { onChange?.(e.target.value); setAcik(true); setVurgu(0) }}
        onFocus={() => setAcik(true)}
        onBlur={() => setTimeout(() => setAcik(false), 150)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      {acik && filtreli.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0, right: 0,
            maxHeight: 240,
            overflowY: 'auto',
            background: 'var(--surface-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 50,
            padding: 4,
          }}
        >
          {filtreli.map((o, i) => (
            <button
              key={o}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); sec(o) }}
              onMouseEnter={() => setVurgu(i)}
              style={{
                display: 'block', width: '100%',
                padding: '8px 10px',
                background: i === vurgu ? 'var(--brand-primary-soft)' : 'transparent',
                color: i === vurgu ? 'var(--brand-primary)' : 'var(--text-primary)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                textAlign: 'left',
                cursor: 'pointer',
                font: '500 13px/18px var(--font-sans)',
              }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
