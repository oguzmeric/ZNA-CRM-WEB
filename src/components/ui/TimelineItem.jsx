export function Timeline({ children, style }) {
  return (
    <div
      style={{
        position: 'relative',
        paddingLeft: 48,
        ...style,
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 13,
          top: 0,
          bottom: 0,
          width: 1,
          background: 'var(--border-default)',
        }}
      />
      {children}
    </div>
  )
}

export function TimelineItem({ icon, active = false, title, meta, children, style }) {
  return (
    <div style={{ position: 'relative', padding: '12px 0 20px', ...style }}>
      <span
        style={{
          position: 'absolute',
          left: -48,
          top: 12,
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'var(--surface-card)',
          border: `2px solid ${active ? 'var(--brand-primary)' : 'var(--border-default)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: active ? 'var(--brand-primary)' : 'var(--text-tertiary)',
        }}
      >
        {icon}
      </span>
      <div>
        {(title || meta) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
            {title && (
              <div style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
                {title}
              </div>
            )}
            {meta && (
              <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                {meta}
              </div>
            )}
          </div>
        )}
        {children && (
          <div style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

export default TimelineItem
