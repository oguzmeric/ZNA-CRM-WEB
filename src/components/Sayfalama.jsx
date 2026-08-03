// Ortak sayfalama çubuğu. Kaynağı Stok.jsx'teki yerel bileşendi; seri numaralı
// model detayında da gerekince (100 kalemlik tek liste kaydırılıyordu) buraya
// taşındı. `secenekler` ile sayfa boyutu listesi ekrana göre değişebilir.

export default function Sayfalama({
  aktifSayfa, toplamSayfa, toplam, sayfaBoyutu, setSayfa, setSayfaBoyutu,
  secenekler = [50, 100, 200],
}) {
  if (toplam === 0) return null
  const ilk = (aktifSayfa - 1) * sayfaBoyutu + 1
  const son = Math.min(aktifSayfa * sayfaBoyutu, toplam)
  const sayfalar = [1]
  for (let n = aktifSayfa - 1; n <= aktifSayfa + 1; n++) {
    if (n > 1 && n < toplamSayfa) sayfalar.push(n)
  }
  if (toplamSayfa > 1) sayfalar.push(toplamSayfa)
  const tekil = [...new Set(sayfalar)].sort((a, b) => a - b)
  const btnStil = (aktif, devre) => ({
    minWidth: 32, height: 32, padding: '0 10px',
    background: aktif ? 'var(--brand-primary)' : 'var(--surface-card)',
    color: aktif ? '#fff' : devre ? 'var(--text-faded)' : 'var(--text-primary)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    font: '500 13px/16px var(--font-sans)',
    cursor: devre ? 'not-allowed' : 'pointer',
    fontVariantNumeric: 'tabular-nums',
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderTop: '1px solid var(--border-default)', flexWrap: 'wrap' }}>
      <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
        <span className="tabular-nums">{ilk}-{son}</span> / <span className="tabular-nums">{toplam}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button style={btnStil(false, aktifSayfa === 1)} disabled={aktifSayfa === 1} onClick={() => setSayfa(aktifSayfa - 1)}>‹</button>
        {tekil.map((n, i) => {
          const onceki = tekil[i - 1]
          const bosluk = onceki && n - onceki > 1
          return (
            <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {bosluk && <span style={{ color: 'var(--text-faded)', padding: '0 4px' }}>…</span>}
              <button style={btnStil(n === aktifSayfa, false)} onClick={() => setSayfa(n)}>{n}</button>
            </span>
          )
        })}
        <button style={btnStil(false, aktifSayfa === toplamSayfa)} disabled={aktifSayfa === toplamSayfa} onClick={() => setSayfa(aktifSayfa + 1)}>›</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>Sayfa başına</span>
        <select value={sayfaBoyutu} onChange={e => setSayfaBoyutu(Number(e.target.value))}
          style={{ height: 32, padding: '0 8px', background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', font: '500 13px/16px var(--font-sans)', color: 'var(--text-primary)', cursor: 'pointer' }}>
          {secenekler.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </div>
  )
}
