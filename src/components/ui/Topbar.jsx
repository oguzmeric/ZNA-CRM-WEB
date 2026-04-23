export function Topbar({ title, children, style }) {
  return (
    <header
      style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        background: 'var(--surface-card)',
        borderBottom: '1px solid var(--border-default)',
        position: 'sticky',
        top: 0,
        zIndex: 'var(--z-sticky)',
        ...style,
      }}
    >
      {typeof title === 'string' ? (
        <h1 style={{ font: '600 20px/28px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>
          {title}
        </h1>
      ) : (
        title
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>{children}</div>
    </header>
  )
}

export function IconButton({ children, ariaLabel, style, onMouseEnter, onMouseLeave, ...rest }) {
  return (
    <button
      aria-label={ariaLabel}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--surface-sunken)'
        e.currentTarget.style.color = 'var(--text-primary)'
        onMouseEnter?.(e)
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--text-secondary)'
        onMouseLeave?.(e)
      }}
      style={{
        width: 36,
        height: 36,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: '1px solid transparent',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        transition: 'background 120ms, color 120ms',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

export function StatusPill({ children, tone = 'success', style }) {
  const TONES = {
    success: { bg: 'var(--success-soft)', fg: 'var(--success)', border: 'var(--success-border)', dot: 'var(--success)' },
    warning: { bg: 'var(--warning-soft)', fg: 'var(--warning)', border: 'var(--warning-border)', dot: 'var(--warning)' },
    danger:  { bg: 'var(--danger-soft)',  fg: 'var(--danger)',  border: 'var(--danger-border)',  dot: 'var(--danger)' },
    neutral: { bg: 'var(--surface-sunken)', fg: 'var(--text-secondary)', border: 'var(--border-default)', dot: 'var(--text-tertiary)' },
  }
  const t = TONES[tone] ?? TONES.success
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 'var(--radius-pill)',
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
        font: '500 12px/16px var(--font-sans)',
        ...style,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.dot }} />
      {children}
    </span>
  )
}

export default Topbar
