// Karel teklif çıktısı — A4 dikey, tek sayfa: sadece Fiyatlandırma.
// (Eskiden 5 sayfaydı; istek üzerine yalnızca eski 3. sayfa korundu.)

import { ZNA_FIRMA } from '../../lib/teklifTemplates'

const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'

// Antetli kağıt footer'ı
function SayfaFooter() {
  return (
    <div style={{
      position: 'absolute',
      bottom: '10mm',
      left: '20mm',
      right: '20mm',
      textAlign: 'center',
      fontFamily: "'Segoe UI', Arial, sans-serif",
      borderTop: '1px solid #cbd5e1',
      paddingTop: 6,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#0176D3', marginBottom: 2 }}>
        {ZNA_FIRMA.unvan}
      </div>
      <div style={{ fontSize: 9, color: '#475569', marginBottom: 1 }}>
        {ZNA_FIRMA.adres}  &nbsp;&nbsp; {ZNA_FIRMA.vdNo}
      </div>
      <div style={{ fontSize: 9, color: '#475569' }}>
        Tel.: {ZNA_FIRMA.tel} &nbsp;&nbsp;
        <span style={{ color: '#0176D3' }}>{ZNA_FIRMA.email}</span> &nbsp;&nbsp;
        <span style={{ color: '#0176D3' }}>{ZNA_FIRMA.web}</span>
      </div>
    </div>
  )
}

// Sayfa başlığı — sol üst ZNA logosu + sağ üst Karel İş Ortağı rozeti
function SayfaBasligi() {
  return (
    <>
      <img src="/teklif-assets/zna-logo.jpg" alt="ZNA Teknoloji"
        style={{ position: 'absolute', top: '12mm', left: '14mm', height: 56, objectFit: 'contain', zIndex: 5 }} />
      <div style={{
        position: 'absolute',
        top: '12mm',
        right: '14mm',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: '#fff',
        padding: '4px 8px',
        borderRadius: 4,
        boxShadow: '0 0 0 1px #e2e8f0',
        zIndex: 5,
      }}>
        <img src="/teklif-assets/karel-is-ortagi.png" alt="Karel İş Ortağı"
          style={{ height: 36, objectFit: 'contain' }} />
      </div>
    </>
  )
}

export default function KarelCikti({ teklif }) {
  const paraSembol = teklif.paraBirimi === 'USD' ? '$' : teklif.paraBirimi === 'EUR' ? '€' : '₺'
  const fmt = (n) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })

  const araToplam = (teklif.satirlar || []).reduce((s, r) => {
    const ara = r.miktar * r.birimFiyat
    return s + ara - ara * ((r.iskonto || 0) / 100)
  }, 0)
  const kdvToplam = (teklif.satirlar || []).reduce((s, r) => {
    const ara = r.miktar * r.birimFiyat
    const isk = ara * ((r.iskonto || 0) / 100)
    return s + (ara - isk) * ((r.kdv || 20) / 100)
  }, 0)
  const genelToplam = araToplam + kdvToplam

  const sayfaStil = {
    width: '210mm',
    minHeight: '297mm',
    pageBreakAfter: 'auto',
    padding: '20mm 20mm 35mm 20mm',
    boxSizing: 'border-box',
    fontFamily: "'Segoe UI', Arial, sans-serif",
    color: '#1e293b',
    background: '#fff',
    margin: '0 auto',
    position: 'relative',
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; }
        @media screen {
          body { background: #f1f5f9; padding: 24px 0; }
          .teklif-sayfa {
            border: 1px solid #e2e8f0;
            box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
            margin-bottom: 20px;
          }
        }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; background: #fff; }
          .no-print { display: none !important; }
          .teklif-sayfa { box-shadow: none !important; border: none !important; margin-bottom: 0 !important; }
        }
      `}</style>

      {/* Tek sayfa — Fiyatlandırma */}
      <div className="teklif-sayfa" style={sayfaStil}>
        <SayfaBasligi />

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 50, marginBottom: 18, fontSize: 12, color: '#475569' }}>
          <span><strong>Tarih :</strong> {fmtTarih(teklif.tarih)}</span>
          <span><strong>Hazırlayan :</strong> {teklif.hazirlayan || '—'}</span>
        </div>

        <h2 style={{ fontSize: 24, color: '#0176D3', fontWeight: 800, marginBottom: 20, textAlign: 'center', letterSpacing: '-0.3px' }}>
          Fiyatlandırma
        </h2>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
          <thead>
            <tr style={{ background: '#0176D3', color: '#fff' }}>
              <th style={{ padding: 8, textAlign: 'left',  border: '1px solid #0176D3', width: '15%' }}>Marka</th>
              <th style={{ padding: 8, textAlign: 'left',  border: '1px solid #0176D3' }}>Açıklama</th>
              <th style={{ padding: 8, textAlign: 'right', border: '1px solid #0176D3', width: '13%' }}>Ad./Mt.</th>
              <th style={{ padding: 8, textAlign: 'right', border: '1px solid #0176D3', width: '15%' }}>Birim Fiyat</th>
              <th style={{ padding: 8, textAlign: 'right', border: '1px solid #0176D3', width: '17%' }}>Toplam Fiyat</th>
            </tr>
          </thead>
          <tbody>
            {(teklif.satirlar || []).map((s, i) => {
              const ara = s.miktar * s.birimFiyat
              const isk = ara * ((s.iskonto || 0) / 100)
              const top = ara - isk
              return (
                <tr key={i} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                  <td style={{ padding: 6, border: '1px solid #cbd5e1', fontWeight: 600 }}>{s.marka || (s.stokKodu ? '—' : 'ZNA')}</td>
                  <td style={{ padding: 6, border: '1px solid #cbd5e1' }}>{s.stokAdi}</td>
                  <td style={{ padding: 6, border: '1px solid #cbd5e1', textAlign: 'right' }}>{s.miktar} {s.birim}</td>
                  <td style={{ padding: 6, border: '1px solid #cbd5e1', textAlign: 'right' }}>{paraSembol}{fmt(s.birimFiyat)}</td>
                  <td style={{ padding: 6, border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 700 }}>{paraSembol}{fmt(top)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <table style={{ fontSize: 13, minWidth: 280 }}>
            <tbody>
              <tr>
                <td style={{ padding: 4, paddingRight: 16, color: '#475569' }}>Ara Tutar :</td>
                <td style={{ textAlign: 'right', padding: 4 }}>{paraSembol}{fmt(araToplam)}</td>
              </tr>
              <tr>
                <td style={{ padding: 4, paddingRight: 16, color: '#475569' }}>Kdv % 20 :</td>
                <td style={{ textAlign: 'right', padding: 4 }}>{paraSembol}{fmt(kdvToplam)}</td>
              </tr>
              <tr style={{ fontWeight: 800, color: '#0176D3' }}>
                <td style={{ padding: 8, paddingRight: 16, borderTop: '2px solid #0176D3' }}>Genel Toplam :</td>
                <td style={{ textAlign: 'right', padding: 8, borderTop: '2px solid #0176D3' }}>{paraSembol}{fmt(genelToplam)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {teklif.aciklama && (
          <div style={{ marginTop: 28, fontSize: 12, padding: '12px 16px', background: '#f8fafc', borderLeft: '3px solid #0176D3', borderRadius: 4 }}>
            <strong style={{ color: '#0176D3' }}>Açıklama : </strong>
            <span style={{ color: '#475569' }}>{teklif.aciklama}</span>
          </div>
        )}
        <SayfaFooter />
      </div>
    </>
  )
}
