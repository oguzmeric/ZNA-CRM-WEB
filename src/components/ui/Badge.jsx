const TONE = {
  neutral:  { bg: 'var(--surface-sunken)',   fg: 'var(--text-secondary)' },
  aktif:    { bg: 'var(--success-soft)',     fg: 'var(--success)' },
  kapali:   { bg: 'var(--success-soft)',     fg: 'var(--success)' },
  basarili: { bg: 'var(--success-soft)',     fg: 'var(--success)' },
  lead:     { bg: 'var(--info-soft)',        fg: 'var(--info)' },
  acik:     { bg: 'var(--info-soft)',        fg: 'var(--info)' },
  bilgi:    { bg: 'var(--info-soft)',        fg: 'var(--info)' },
  beklemede:{ bg: 'var(--warning-soft)',     fg: 'var(--warning)' },
  uyari:    { bg: 'var(--warning-soft)',     fg: 'var(--warning)' },
  pasif:    { bg: 'var(--surface-sunken)',   fg: 'var(--text-secondary)' },
  kayip:    { bg: 'var(--danger-soft)',      fg: 'var(--danger)' },
  hata:     { bg: 'var(--danger-soft)',      fg: 'var(--danger)' },
  brand:    { bg: 'var(--brand-primary-soft)', fg: 'var(--brand-primary)' },
}

export function Badge({ tone = 'neutral', children, icon, style }) {
  const t = TONE[tone] ?? TONE.neutral
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        font: '500 12px/16px var(--font-sans)',
        background: t.bg,
        color: t.fg,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {icon}
      {children}
    </span>
  )
}

/** Koyu kritik badge — "VADESİ GEÇTİ" gibi uyarılar */
export function CriticalBadge({ children, style }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        font: '500 11px/16px var(--font-sans)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        background: 'var(--danger)',
        color: '#fff',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

/** Kod chip — müşteri kodu, ACT kodu, takip kodu için mono font */
export function CodeBadge({ children, style }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--radius-sm)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 500,
        background: 'var(--surface-sunken)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-default)',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

export default Badge
