const SIZE = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
}
const FONT = {
  xs: 11,
  sm: 13,
  md: 14,
  lg: 16,
}

function getInitial(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Avatar({ name, initial, src, size = 'sm', onDark = false, style }) {
  const dim = typeof size === 'number' ? size : SIZE[size] ?? 32
  const fs = typeof size === 'number' ? Math.round(size * 0.42) : FONT[size] ?? 13
  const text = initial ?? getInitial(name)

  if (src) {
    return (
      <img
        src={src}
        alt={name || 'avatar'}
        style={{
          width: dim,
          height: dim,
          borderRadius: '50%',
          objectFit: 'cover',
          ...style,
        }}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      style={{
        width: dim,
        height: dim,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: onDark ? 'rgba(255,255,255,0.08)' : 'var(--surface-sunken)',
        color: onDark ? 'var(--text-on-dark)' : 'var(--text-secondary)',
        fontFamily: 'var(--font-sans)',
        fontSize: fs,
        fontWeight: 500,
        flexShrink: 0,
        ...style,
      }}
    >
      {text}
    </span>
  )
}

export default Avatar
