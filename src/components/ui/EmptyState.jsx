export function EmptyState({ icon, title, description, action, style }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '48px 24px',
        border: '1px dashed var(--border-default)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--text-tertiary)',
        ...style,
      }}
    >
      {icon && <span style={{ marginBottom: 12, display: 'inline-flex' }}>{icon}</span>}
      {title && (
        <p style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-secondary)', margin: '0 0 4px' }}>
          {title}
        </p>
      )}
      {description && (
        <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-tertiary)', margin: 0, maxWidth: 360 }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}

export default EmptyState
