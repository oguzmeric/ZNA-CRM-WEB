import { forwardRef } from 'react'
import { Search } from 'lucide-react'

const baseInputStyle = {
  width: '100%',
  height: 36,
  padding: '0 12px',
  background: 'var(--surface-card)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  color: 'var(--text-primary)',
  outline: 'none',
  transition: 'border-color 120ms, box-shadow 120ms',
}

function applyFocus(e) {
  e.currentTarget.style.borderColor = 'var(--border-focus)'
  e.currentTarget.style.boxShadow = 'var(--focus-ring)'
}
function removeFocus(e) {
  e.currentTarget.style.borderColor = 'var(--border-default)'
  e.currentTarget.style.boxShadow = 'none'
}

export const Input = forwardRef(function Input(
  { leftIcon, rightIcon, style, ...rest },
  ref
) {
  if (leftIcon || rightIcon) {
    return (
      <div style={{ position: 'relative', width: '100%' }}>
        {leftIcon && (
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', display: 'inline-flex' }}>
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          onFocus={applyFocus}
          onBlur={removeFocus}
          style={{
            ...baseInputStyle,
            paddingLeft: leftIcon ? 36 : 12,
            paddingRight: rightIcon ? 36 : 12,
            ...style,
          }}
          {...rest}
        />
        {rightIcon && (
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', display: 'inline-flex' }}>
            {rightIcon}
          </span>
        )}
      </div>
    )
  }
  return (
    <input
      ref={ref}
      onFocus={applyFocus}
      onBlur={removeFocus}
      style={{ ...baseInputStyle, ...style }}
      {...rest}
    />
  )
})

export const SearchInput = forwardRef(function SearchInput(props, ref) {
  return <Input ref={ref} leftIcon={<Search size={16} strokeWidth={1.5} />} {...props} />
})

export const Textarea = forwardRef(function Textarea({ style, rows = 4, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      onFocus={applyFocus}
      onBlur={removeFocus}
      style={{
        ...baseInputStyle,
        height: 'auto',
        padding: '10px 12px',
        lineHeight: 1.5,
        resize: 'vertical',
        ...style,
      }}
      {...rest}
    />
  )
})

export const Select = forwardRef(function Select({ style, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      onFocus={applyFocus}
      onBlur={removeFocus}
      style={{
        ...baseInputStyle,
        paddingRight: 32,
        appearance: 'none',
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238393A6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
        ...style,
      }}
      {...rest}
    >
      {children}
    </select>
  )
})

export const Label = ({ children, htmlFor, required, style }) => (
  <label
    htmlFor={htmlFor}
    style={{
      display: 'block',
      fontFamily: 'var(--font-sans)',
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--text-secondary)',
      marginBottom: 6,
      ...style,
    }}
  >
    {children}
    {required && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}
  </label>
)

export default Input
