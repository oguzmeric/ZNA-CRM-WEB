/**
 * SegmentedControl — tab alternatifi
 * props:
 *  - options: [{ value, label, count? }]
 *  - value: seçili value
 *  - onChange: (value) => void
 */
export function SegmentedControl({ options = [], value, onChange, size = 'md', style }) {
  const H = size === 'sm' ? 28 : 32
  const PY = size === 'sm' ? 4 : 6

  return (
    <div
      role="tablist"
      style={{
        display: 'inline-flex',
        padding: 2,
        background: 'var(--surface-sunken)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-sm)',
        height: H + 4,
        ...style,
      }}
    >
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(opt.value)}
            style={{
              padding: `${PY}px 14px`,
              font: active ? '500 13px/18px var(--font-sans)' : '400 13px/18px var(--font-sans)',
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: active ? 'var(--surface-card)' : 'transparent',
              border: 'none',
              borderRadius: 'calc(var(--radius-sm) - 2px)',
              cursor: 'pointer',
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
              transition: 'background 120ms, color 120ms, box-shadow 120ms',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {opt.label}
            {typeof opt.count === 'number' && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minWidth: 18,
                  height: 16,
                  padding: '0 5px',
                  borderRadius: 'var(--radius-pill)',
                  background: active ? 'var(--brand-primary-soft)' : 'var(--surface-sunken)',
                  color: active ? 'var(--brand-primary)' : 'var(--text-tertiary)',
                  font: '500 11px/1 var(--font-sans)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {opt.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default SegmentedControl
