// Filo sayfalarının ortak küçük parçaları — tarih/para formatı, bitiş rozeti, KPI kartı.

export const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'

export const fmtTL = (n) => n == null ? '—'
  : '₺' + Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export const kalanGun = (bitis) => {
  if (!bitis) return null
  return Math.ceil((new Date(bitis + 'T23:59:59') - new Date()) / 86400000)
}

// Bitiş tarihine göre renkli rozet: geçti (kırmızı) / ≤30 gün (turuncu) / normal (yeşil)
export function BitisRozet({ bitis }) {
  const gun = kalanGun(bitis)
  if (gun == null) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
  const stil = gun < 0
    ? { bg: 'rgba(220,38,38,0.12)', renk: '#DC2626', metin: `${-gun} gün geçti!` }
    : gun <= 30
      ? { bg: 'rgba(245,158,11,0.12)', renk: '#B45309', metin: `${gun} gün kaldı` }
      : { bg: 'rgba(16,185,129,0.10)', renk: 'var(--success)', metin: `${gun} gün` }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
      background: stil.bg, color: stil.renk,
      font: '600 11px/16px var(--font-sans)', fontVariantNumeric: 'tabular-nums',
    }}>
      {fmtTarih(bitis)} · {stil.metin}
    </span>
  )
}

export function FiloKpi({ etiket, deger, renk = 'var(--text-primary)' }) {
  return (
    <div style={{
      background: 'var(--surface-card)', border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md, 10px)', padding: '12px 14px',
    }}>
      <div style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{etiket}</div>
      <div style={{ font: '700 22px/28px var(--font-sans)', color: renk, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{deger}</div>
    </div>
  )
}
