// Teklif kalemleri tablosu — SiparisOnaylari ve TeklifOnaylari sayfalarında ortak kullanım.
// teklif.satirlar (JSONB) bekleniyor: [{stokKodu, stokAdi, miktar, birim, birimFiyat, kdv, iskonto}, ...]

const paraSembol = (pb) => pb === 'TL' ? '₺' : pb === 'USD' ? '$' : pb === 'EUR' ? '€' : (pb || '')

const fmtTutar = (v, pb) => {
  const n = Number(v || 0)
  return `${paraSembol(pb)} ${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function TeklifKalemTablosu({ satirlar, paraBirimi = 'TL' }) {
  const rows = Array.isArray(satirlar) ? satirlar : []
  if (!rows.length) {
    return (
      <div style={{
        padding: 14, background: 'var(--surface-sunken)', borderRadius: 8,
        color: 'var(--text-tertiary)', fontSize: 13, fontStyle: 'italic',
        marginBottom: 14,
      }}>
        Bu teklifte kalem yok.
      </div>
    )
  }

  const araToplam = rows.reduce((s, k) => {
    const miktar = Number(k.miktar || 0)
    const fiyat = Number(k.birimFiyat || 0)
    const isk = Number(k.iskonto || 0)
    return s + miktar * fiyat * (1 - isk / 100)
  }, 0)
  const kdvToplam = rows.reduce((s, k) => {
    const miktar = Number(k.miktar || 0)
    const fiyat = Number(k.birimFiyat || 0)
    const isk = Number(k.iskonto || 0)
    const tutar = miktar * fiyat * (1 - isk / 100)
    return s + tutar * (Number(k.kdv || 0) / 100)
  }, 0)
  const genel = araToplam + kdvToplam

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ font: '600 12px/16px var(--font-sans)', color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        Kalemler ({rows.length})
      </div>
      <div style={{
        border: '1px solid var(--border-default)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--surface-default)',
      }}>
        <div style={{ overflow: 'auto', maxHeight: 380 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-sunken)', zIndex: 1 }}>
              <tr>
                <th style={thStyle}>Stok</th>
                <th style={thStyle}>Ürün / Açıklama</th>
                <th style={{ ...thStyle, textAlign: 'right', width: 60 }}>Miktar</th>
                <th style={{ ...thStyle, textAlign: 'right', width: 60 }}>Birim</th>
                <th style={{ ...thStyle, textAlign: 'right', width: 90 }}>B.Fiyat</th>
                <th style={{ ...thStyle, textAlign: 'right', width: 40 }}>%İsk</th>
                <th style={{ ...thStyle, textAlign: 'right', width: 40 }}>%KDV</th>
                <th style={{ ...thStyle, textAlign: 'right', width: 100 }}>Tutar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k, i) => {
                const miktar = Number(k.miktar || 0)
                const fiyat = Number(k.birimFiyat || 0)
                const isk = Number(k.iskonto || 0)
                const tutar = miktar * fiyat * (1 - isk / 100)
                return (
                  <tr key={k.id || i} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {k.stokKodu || '—'}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-primary)' }}>
                        {k.stokAdi || '—'}
                      </div>
                      {k.aciklama && (
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{k.aciklama}</div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{miktar}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-tertiary)' }}>{k.birim || '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtTutar(fiyat, paraBirimi)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: isk > 0 ? 'var(--danger)' : 'var(--text-tertiary)' }}>%{isk}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-tertiary)' }}>%{k.kdv || 0}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {fmtTutar(tutar, paraBirimi)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '10px 14px', background: 'var(--surface-sunken)', borderTop: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
            <span>Ara toplam</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtTutar(araToplam, paraBirimi)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
            <span>KDV toplamı</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtTutar(kdvToplam, paraBirimi)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
            <span>Genel Toplam</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtTutar(genel, paraBirimi)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const thStyle = {
  padding: '9px 10px',
  textAlign: 'left',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  color: 'var(--text-tertiary)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
}
const tdStyle = { padding: '8px 10px', verticalAlign: 'top' }
