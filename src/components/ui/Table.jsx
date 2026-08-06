export function Table({ children, style }) {
  return (
    <div
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        // ⚠️ Eskiden `overflow: hidden` idi (yuvarlak köşeler için). Geniş
        // tablolarda son kolon kaydırılamadan KESİLİYORDU — S/N listesinde
        // eylem butonları yarım görünüyordu. auto: dar tabloda hiçbir fark yok
        // (çubuk çıkmaz), taşanda yatay kaydırma gelir. Köşeler yine kırpılır.
        overflowX: 'auto',
        ...style,
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'separate',
          borderSpacing: 0,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {children}
      </table>
    </div>
  )
}

export function THead({ children }) {
  return <thead>{children}</thead>
}

export function TH({ children, align = 'left', style }) {
  return (
    <th
      style={{
        background: 'var(--surface-sunken)',
        padding: '8px 14px',
        textAlign: align,
        font: '600 11.5px/16px var(--font-sans)',
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        borderBottom: '1px solid var(--border-default)',
        ...style,
      }}
    >
      {children}
    </th>
  )
}

export function TBody({ children }) {
  return <tbody>{children}</tbody>
}

export function TR({ children, onClick, style, ...rest }) {
  const clickable = !!onClick
  return (
    <tr
      onClick={onClick}
      onMouseEnter={e => clickable && (e.currentTarget.style.background = 'var(--surface-sunken)')}
      onMouseLeave={e => clickable && (e.currentTarget.style.background = 'transparent')}
      style={{
        cursor: clickable ? 'pointer' : 'default',
        transition: 'background 120ms',
        ...style,
      }}
      {...rest}
    >
      {children}
    </tr>
  )
}

export function TD({ children, align = 'left', style }) {
  return (
    <td
      style={{
        // Yoğunluk (06.08): 12x16 → 10x14 dolgu + 14 → 13px — ERP satır sıklığı
        padding: '10px 14px',
        textAlign: align,
        font: '400 13px/19px var(--font-sans)',
        color: 'var(--text-primary)',
        borderBottom: '1px solid var(--border-default)',
        ...style,
      }}
    >
      {children}
    </td>
  )
}

export default Table
