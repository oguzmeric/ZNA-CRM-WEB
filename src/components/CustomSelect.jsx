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
  const wFull = className.includes('w-full')

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
      style={{ display: wFull ? 'block' : 'inline-block', width: wFull ? '100%' : undefined }}
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
          ...style,
          width: '100%',
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
        <span className="truncate flex-1">{secilenLabel}</span>
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
          className="absolute z-[9999] rounded-xl overflow-hidden"
          style={{
            top: yukariAc ? 'auto' : 'calc(100% + 4px)',
            bottom: yukariAc ? 'calc(100% + 4px)' : 'auto',
            left: 0,
            minWidth: '100%',
            background: 'var(--bg-card, #fff)',
            border: '1px solid var(--border, #e2e8f0)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
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
                style={{
                  padding: '8px 12px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  color: secili ? 'var(--primary, #0176D3)' : 'var(--text-secondary, #374151)',
                  background: secili ? 'rgba(1,118,211,0.07)' : 'transparent',
                  fontWeight: secili ? 600 : 400,
                  transition: 'background 0.1s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { if (!secili) e.currentTarget.style.background = 'var(--bg-hover, #f8fafc)' }}
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
