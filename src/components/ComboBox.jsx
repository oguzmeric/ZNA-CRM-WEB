import { useState, useRef, useMemo } from 'react'
import { Input } from './ui'

const trNormalize = (s = '') =>
  String(s).toLocaleLowerCase('tr')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')

// CustomSelect görsel diliyle uyumlu, serbest metin girişi + öneri dropdown.
// allowNew=true → yazılan metin listede yoksa altta "+ ... ekle" satırı çıkar.
export default function ComboBox({
  value = '',
  onChange,
  options = [],
  placeholder = '',
  disabled = false,
  allowNew = true,
  yeniMetin = 'olarak ekle',
  onSelectOption,
  maxGoster = 30,   // yazmadan açılınca gösterilecek en fazla öğe (panel scroll'lu)
}) {
  const [acik, setAcik] = useState(false)
  const [vurgu, setVurgu] = useState(0)
  const ref = useRef(null)

  const filtreli = useMemo(() => {
    // Aynı ad birden çok kayıtta olabiliyor (esnweb import mükerrerleri) —
    // tekilleştirmezsek duplicate React key'ler dropdown DOM'unu bozup
    // filtre uygulanmamış bayat liste gösterebiliyor (24.07 "Element" vakası).
    const tekil = [...new Set(options)]
    const q = trNormalize(value)
    if (!q) return tekil.slice(0, maxGoster)
    return tekil.filter(o => trNormalize(o).includes(q)).slice(0, maxGoster)
  }, [value, options, maxGoster])

  const trimlenmis = (value || '').trim()
  const zatenVar = filtreli.some(o => trNormalize(o) === trNormalize(trimlenmis))
  const yeniGoster = allowNew && !!trimlenmis && !zatenVar

  const oge = [...filtreli, ...(yeniGoster ? ['__yeni__'] : [])]

  const sec = (v) => {
    const gercek = v === '__yeni__' ? trimlenmis : v
    onSelectOption?.(gercek)
    onChange?.(gercek)
    setAcik(false)
  }

  const handleKey = (e) => {
    if (!acik || oge.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setVurgu(i => Math.min(i + 1, oge.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setVurgu(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      if (oge[vurgu]) { e.preventDefault(); sec(oge[vurgu]) }
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
      {acik && oge.length > 0 && (
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
              key={`${i}-${o}`}
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
          {yeniGoster && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); sec('__yeni__') }}
              onMouseEnter={() => setVurgu(filtreli.length)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                padding: '8px 10px',
                background: vurgu === filtreli.length ? 'var(--success-soft, rgba(16,185,129,0.12))' : 'transparent',
                color: 'var(--success)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                textAlign: 'left',
                cursor: 'pointer',
                font: '600 13px/18px var(--font-sans)',
                marginTop: filtreli.length > 0 ? 4 : 0,
                borderTop: filtreli.length > 0 ? '1px solid var(--border-default)' : 'none',
                paddingTop: filtreli.length > 0 ? 10 : 8,
              }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 16, height: 16, borderRadius: '50%',
                background: 'var(--success)', color: '#fff',
                fontSize: 12, fontWeight: 700, lineHeight: 1,
              }}>+</span>
              <span>"{trimlenmis}" {yeniMetin}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
