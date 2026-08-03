import { forwardRef } from 'react'

export const Card = forwardRef(function Card({ children, style, padding = 20, ...rest }, ref) {
  return (
    <div
      ref={ref}
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        padding,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
})

export function CardTitle({ children, style }) {
  return (
    <h3
      style={{
        font: '600 16px/24px var(--font-sans)',
        color: 'var(--text-primary)',
        margin: '0 0 4px',
        ...style,
      }}
    >
      {children}
    </h3>
  )
}

export function CardSubtitle({ children, style }) {
  return (
    <p
      style={{
        font: '400 12px/16px var(--font-sans)',
        color: 'var(--text-tertiary)',
        margin: '0 0 16px',
        ...style,
      }}
    >
      {children}
    </p>
  )
}

/**
 * KPI Card — Dashboard rakam kartı
 * props: label, value, icon (lucide node), footer
 */
// kompakt: detay sayfalarında "0 Adet" gibi kısa değerler 28px'te fazla iri
// duruyordu. Dashboard'ın büyük rakamları varsayılan boyutta kalsın diye
// davranış prop ile ayrıldı.
export function KPICard({ label, value, icon, footer, style, kompakt = false }) {
  return (
    <article
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: kompakt ? 14 : 20,
        ...style,
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: 'var(--text-tertiary)',
          marginBottom: kompakt ? 6 : 8,
        }}
      >
        <span className="t-label">{label}</span>
        {icon}
      </header>
      <div
        style={{
          font: kompakt ? '600 19px/26px var(--font-sans)' : '600 28px/36px var(--font-sans)',
          color: 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {footer && (
        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            font: '400 12px/16px var(--font-sans)',
            color: 'var(--text-secondary)',
            marginTop: 8,
          }}
        >
          {footer}
        </footer>
      )}
    </article>
  )
}

export default Card
