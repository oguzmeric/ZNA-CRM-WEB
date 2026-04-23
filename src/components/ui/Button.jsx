import { forwardRef } from 'react'

const VARIANT = {
  primary: {
    background: 'var(--brand-primary)',
    color: '#fff',
    border: '1px solid var(--brand-primary)',
  },
  secondary: {
    background: 'var(--surface-card)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
  },
  tertiary: {
    background: 'transparent',
    color: 'var(--brand-primary)',
    border: '1px solid transparent',
  },
  danger: {
    background: 'var(--danger)',
    color: '#fff',
    border: '1px solid var(--danger)',
  },
}

const SIZE = {
  sm: { height: 32, padding: '0 12px', fontSize: 13 },
  md: { height: 36, padding: '0 16px', fontSize: 14 },
  lg: { height: 40, padding: '0 20px', fontSize: 14 },
}

const HOVER_BG = {
  primary:   'var(--brand-primary-hover)',
  secondary: 'var(--surface-sunken)',
  tertiary:  'var(--brand-primary-soft)',
  danger:    '#8E2E2E',
}

const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', iconLeft, iconRight, children, style, disabled, onMouseEnter, onMouseLeave, ...rest },
  ref
) {
  const v = VARIANT[variant] ?? VARIANT.secondary
  const s = SIZE[size] ?? SIZE.md

  return (
    <button
      ref={ref}
      disabled={disabled}
      onMouseEnter={e => {
        if (!disabled) e.currentTarget.style.background = HOVER_BG[variant]
        onMouseEnter?.(e)
      }}
      onMouseLeave={e => {
        if (!disabled) e.currentTarget.style.background = v.background
        onMouseLeave?.(e)
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: s.height,
        padding: s.padding,
        fontSize: s.fontSize,
        fontWeight: 500,
        fontFamily: 'var(--font-sans)',
        borderRadius: 'var(--radius-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 120ms, border-color 120ms, color 120ms',
        whiteSpace: 'nowrap',
        ...v,
        ...style,
      }}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  )
})

export default Button
