import { AlertTriangle, Info, CheckCircle2, XCircle } from 'lucide-react'

const VARIANT = {
  danger:  { bg: 'var(--danger-soft)',  border: 'var(--danger-border)',  accent: 'var(--danger)',  icon: XCircle },
  warning: { bg: 'var(--warning-soft)', border: 'var(--warning-border)', accent: 'var(--warning)', icon: AlertTriangle },
  info:    { bg: 'var(--info-soft)',    border: 'var(--info-border)',    accent: 'var(--info)',    icon: Info },
  success: { bg: 'var(--success-soft)', border: 'var(--success-border)', accent: 'var(--success)', icon: CheckCircle2 },
}

export function Alert({ variant = 'info', title, children, action, icon, style }) {
  const v = VARIANT[variant] ?? VARIANT.info
  const IconEl = icon ?? <v.icon size={20} strokeWidth={1.5} />

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 18px',
        background: v.bg,
        border: `1px solid ${v.border}`,
        borderLeft: `3px solid ${v.accent}`,
        borderRadius: 'var(--radius-md)',
        ...style,
      }}
    >
      <span style={{ color: v.accent, display: 'inline-flex', marginTop: 1 }}>{IconEl}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-primary)', marginBottom: children ? 2 : 0 }}>
            {title}
          </div>
        )}
        {children && (
          <div style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
            {children}
          </div>
        )}
      </div>
      {action && (
        <div style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', color: v.accent, font: '500 13px/18px var(--font-sans)' }}>
          {action}
        </div>
      )}
    </div>
  )
}

export default Alert
