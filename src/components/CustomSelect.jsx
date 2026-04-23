import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * Native <select> yerine tamamen CSS kontrollü custom dropdown.
 * Dropdown paneli body'e portal ile render edilir → parent overflow:hidden
 * (Table, Modal, Card vs.) tarafından clip edilmez.
 *
 * API: value, onChange({ target: { value } }), className, style, children (<option> elementleri)
 */
export default function CustomSelect({ value, onChange, className = '', style = {}, children, disabled = false }) {
  const [acik, setAcik] = useState(false)
  const [panelStyle, setPanelStyle] = useState(null)
  const ref = useRef(null)

  // Option'ları parse et — nested array'leri de (map()) doğru işler
  const options = []
  const processChildren = (childs) => {
    if (!childs) return
    const arr = Array.isArray(childs) ? childs : [childs]
    arr.forEach((child) => {
      if (!child) return
      if (Array.isArray(child)) {
        processChildren(child)
      } else if (child.type === 'option') {
        options.push({ value: String(child.props.value ?? ''), label: child.props.children })
      } else if (child.props?.children) {
        processChildren(child.props.children)
      }
    })
  }
  processChildren(children)

  const secilenOpt = options.find((o) => o.value === String(value ?? ''))
  const secilenLabel = secilenOpt
    ? (Array.isArray(secilenOpt.label)
        ? secilenOpt.label.map((l, i) => <span key={i}>{l}</span>)
        : secilenOpt.label)
    : ''
  const wAuto = className.includes('w-auto')

  // Açıldığında trigger konumunu hesapla, panel için fixed pozisyon üret
  useLayoutEffect(() => {
    if (!acik || !ref.current) return
    const recalc = () => {
      const rect = ref.current.getBoundingClientRect()
      const maxH = 260
      const asagidaBosluk = window.innerHeight - rect.bottom
      const yukariAc = asagidaBosluk < maxH && rect.top > asagidaBosluk
      setPanelStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
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

  // Dışarı tıklanınca / Escape ile kapat
  useEffect(() => {
    if (!acik) return
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest('[data-custom-select-panel]')) {
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

  const handleSecim = (val) => {
    onChange?.({ target: { value: val } })
    setAcik(false)
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        display: wAuto ? 'inline-block' : 'block',
        width: wAuto ? undefined : '100%',
        minWidth: 0,
      }}
    >
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setAcik((p) => !p) }}
        className={className}
        style={{
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

      {/* Dropdown panel — body'e portal, parent overflow:hidden tarafından clip edilmez */}
      {acik && panelStyle && createPortal(
        <div
          data-custom-select-panel
          style={{
            ...panelStyle,
            background: 'var(--surface-card, #fff)',
            border: '1px solid var(--border-default, #D9DFE5)',
            borderRadius: 'var(--radius-md, 6px)',
            boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.12))',
            overflow: 'auto',
            zIndex: 10000,
          }}
        >
          {options.length === 0 ? (
            <div style={{
              padding: '12px',
              color: 'var(--text-tertiary)',
              font: '400 12px/16px var(--font-sans)',
              textAlign: 'center',
            }}>
              Seçenek yok
            </div>
          ) : options.map((opt) => {
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
        </div>,
        document.body,
      )}
    </div>
  )
}
