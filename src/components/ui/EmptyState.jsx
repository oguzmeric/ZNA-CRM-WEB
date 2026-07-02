// EmptyState — boş durum göstergesi.
// Default 'md' boyut kart içi bölümler için uygun (öncekine göre ~%50 daha kompakt).
// size='sm' tek satırlık (metin + varsa küçük ikon) — inline notlar için.
// size='lg' geniş boşluklu, hero benzeri — tam sayfa boş listelerde kullanılır.

export function EmptyState({ icon, title, description, action, style, size = 'md' }) {
  if (size === 'sm') {
    return (
      <div
        style={{
          padding: '10px 14px',
          font: '400 12px/16px var(--font-sans)',
          color: 'var(--text-tertiary)',
          fontStyle: 'italic',
          textAlign: 'center',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          ...style,
        }}
      >
        {icon}
        <span>{title}</span>
        {action}
      </div>
    )
  }

  const pad     = size === 'lg' ? '48px 24px' : '20px 16px'
  const iconMb  = size === 'lg' ? 12          : 8
  const actMt   = size === 'lg' ? 16          : 10
  const border  = size === 'lg' ? '1px dashed var(--border-default)' : 'none'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: pad,
        border,
        borderRadius: 'var(--radius-md)',
        color: 'var(--text-tertiary)',
        ...style,
      }}
    >
      {icon && <span style={{ marginBottom: iconMb, display: 'inline-flex', opacity: 0.6 }}>{icon}</span>}
      {title && (
        <p style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-secondary)', margin: '0 0 3px' }}>
          {title}
        </p>
      )}
      {description && (
        <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', margin: 0, maxWidth: 360 }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: actMt }}>{action}</div>}
    </div>
  )
}

export default EmptyState
