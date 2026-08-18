// Detay sayfası bölüm başlığı — TEK görsel dil (18.08: MusteriDetay'da her
// kartın başlığı farklı yazılmıştı; "karışık, bütünlüğü yok" geri bildirimi).
// İki mod: varsayılan = kart tepesine tam şerit (padding + alt çizgi,
// Card padding={0} ile kullan); inline = padding'li kartın içinde başlık satırı.
export default function BolumBaslik({ Icon, baslik, sayi, sag, inline = false }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      ...(inline
        ? { marginBottom: 12 }
        : { padding: '11px 16px', borderBottom: '1px solid var(--border-default)' }),
    }}>
      {Icon && (
        <span style={{
          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--brand-primary-soft, rgba(37,99,235,0.10))',
          color: 'var(--brand-primary)',
        }}>
          <Icon size={14} strokeWidth={1.7} />
        </span>
      )}
      <span style={{ font: '700 13.5px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
        {baslik}
      </span>
      {sayi != null && <span className="t-caption tabular-nums">({sayi})</span>}
      {sag && (
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {sag}
        </span>
      )}
    </div>
  )
}
