import { RefreshCw } from 'lucide-react'

export function CurrencyBox({ code, value, onRefresh, loading = false, style }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        background: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-sm)',
        font: '400 13px/18px var(--font-sans)',
        ...style,
      }}
    >
      <span
        style={{
          color: 'var(--text-tertiary)',
          letterSpacing: '0.04em',
          fontSize: 11,
          fontWeight: 500,
        }}
      >
        {code}
      </span>
      <span
        style={{
          color: 'var(--text-primary)',
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      {onRefresh && (
        <button
          aria-label="Yenile"
          onClick={onRefresh}
          disabled={loading}
          style={{
            background: 'none',
            border: 'none',
            padding: 2,
            color: 'var(--text-tertiary)',
            cursor: loading ? 'default' : 'pointer',
            display: 'inline-flex',
          }}
          onMouseEnter={e => !loading && (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        >
          <RefreshCw size={14} strokeWidth={1.5} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      )}
    </div>
  )
}

export default CurrencyBox
