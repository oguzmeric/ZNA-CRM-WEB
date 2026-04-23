import { useState, useEffect, useRef } from 'react'

/**
 * Native <select> yerine tamamen CSS kontrollü custom dropdown.
 * API: value, onChange({ target: { value } }), className, style, children (<option> elementleri)
 */
export default function CustomSelect({ value, onChange, className = '', style = {}, children, disabled = false }) {
  const [acik, setAcik] = useState(false)
  const [yukariAc, setYukariAc] = useState(false)
  const ref = useRef(null)

  // Option'ları parse et — nested array'leri de (map()) doğru işler
  const options = []
  const processChildren = (childs) => {
    if (!childs) return
    const arr = Array.isArray(childs) ? childs : [childs]
    arr.forEach((child) => {
      if (!child) return
      if (Array.isArray(child)) {
        // {items.map(...)} gibi nested array'ler
        processChildren(child)
      } else if (child.type === 'option') {
        options.push({ value: String(child.props.value ?? ''), label: child.props.children })
      } else if (child.props?.children) {
        // optgroup veya wrapper element
        processChildren(child.props.children)
      }
    })
  }
  processChildren(children)

  const secilenOpt = options.find((o) => o.value === String(value ?? ''))
  // label array olabilir ({ikon} {isim} gibi) — her iki durumda da render edilebilir şekle getir
  const secilenLabel = secilenOpt
    ? (Array.isArray(secilenOpt.label)
        ? secilenOpt.label.map((l, i) => <span key={i}>{l}</span>)
        : secilenOpt.label)
    : ''
  // Varsayılan: form alanı olarak kullanılır, tam genişlik. Inline için className="w-auto" verilebilir.
  const wAuto = className.includes('w-auto')

  // Dışarı tıklanınca kapat
  useEffect(() => {
    if (!acik) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAcik(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [acik])

  const handleSecim = (val) => {
    onChange?.({ target: { value: val } })
    setAcik(false)
  }

  return (
    <div
      ref={ref}
      className="relative"
      style={{
        display: wAuto ? 'inline-block' : 'block',
        width: wAuto ? undefined : '100%',
        minWidth: 0, // flex item içinde trigger'ın truncate çalışması için
      }}
    >
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          if (!acik) {
            const rect = ref.current?.getBoundingClientRect()
            if (rect) setYukariAc(window.innerHeight - rect.bottom < 280)
          }
          setAcik((p) => !p)
        }}
        className={className}
        style={{
          // Input ile aynı görünüm (className ile override edilebilir)
          background: 'var(--surface-card, #fff)',
          border: '1px solid var(--border-default, #D9DFE5)',
          color: 'var(--text-primary, #0F1C2E)',
          borderRadius: 'var(--radius-sm, 4px)',
          padding: '8px 12px',
          font: '400 13px/20px var(--font-sans)',
          outline: 'none',
          ...style,
          width: '100%',
          minWidth: 0,
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
          userSelect: 'none',
          appearance: 'none',
          WebkitAppearance: 'none',
        }}
      >
        <span style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: secilenOpt ? 'inherit' : 'var(--text-tertiary)',
        }}>
          {secilenLabel || <span style={{ opacity: 0.6 }}>Seç…</span>}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          style={{
            flexShrink: 0,
            transition: 'transform 0.15s',
            transform: acik ? 'rotate(180deg)' : 'rotate(0deg)',
            opacity: 0.5,
          }}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown listesi */}
      {acik && (
        <div
          className="absolute z-[9999] rounded-lg overflow-hidden"
          style={{
            top: yukariAc ? 'auto' : 'calc(100% + 4px)',
            bottom: yukariAc ? 'calc(100% + 4px)' : 'auto',
            left: 0,
            right: 0,
            background: 'var(--surface-card, #fff)',
            border: '1px solid var(--border-default, #D9DFE5)',
            boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.12))',
            maxHeight: '260px',
            overflowY: 'auto',
          }}
        >
          {options.map((opt) => {
            const secili = opt.value === String(value ?? '')
            return (
              <div
                key={opt.value}
                onMouseDown={(e) => { e.preventDefault(); handleSecim(opt.value) }}
                title={typeof opt.label === 'string' ? opt.label : undefined}
                style={{
                  padding: '8px 12px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  color: secili ? 'var(--brand-primary, #1E5AA8)' : 'var(--text-secondary, #4A5A6E)',
                  background: secili ? 'var(--brand-primary-soft, rgba(30,90,168,0.08))' : 'transparent',
                  fontWeight: secili ? 600 : 400,
                  transition: 'background 0.1s',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                onMouseEnter={(e) => { if (!secili) e.currentTarget.style.background = 'var(--surface-sunken, #EDF0F3)' }}
                onMouseLeave={(e) => { if (!secili) e.currentTarget.style.background = 'transparent' }}
              >
                {opt.label}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
