// Karel teklif çıktısı — A4 dikey, 5 sayfalık marka-yoğun sunum.
// Trassir formatıyla aynı yapı + sayfa 1 kapağında "KAREL İŞ ORTAĞI" logosu eklendi.
// Sayfa 1: kapak görseli + Karel İş Ortağı rozeti
// Sayfa 2: karşılama + ZNA Hakkında + Hizmetlerimiz
// Sayfa 3: fiyatlandırma tablosu
// Sayfa 4: İş Ortaklarımız (logo grid'i)
// Sayfa 5: Bazı Referanslarımız (logo grid'i)

import { TRASSIR_KARSILAMA, ZNA_HAKKINDA, HIZMETLERIMIZ } from '../../lib/teklifTemplates'

const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'

// Sayfa başlığı — sol üst ZNA logosu + sağ üst Karel rozeti (her içerik sayfasında)
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
    pageBreakAfter: 'always',
    padding: '20mm',
    boxSizing: 'border-box',
    fontFamily: "'Segoe UI', Arial, sans-serif",
    color: '#1e293b',
    background: '#fff',
    margin: '0 auto',
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Sayfa 1 — Kapak (ZNA görseli + Karel İş Ortağı rozeti) */}
      <div style={{ ...sayfaStil, padding: 0, position: 'relative', overflow: 'hidden' }}>
        <img
          src="/teklif-assets/zna-cover.png"
          alt="ZNA Teknoloji"
          style={{ width: '100%', height: '297mm', objectFit: 'cover' }}
        />
        {/* Karel İş Ortağı logosu — sağ üst köşe, beyaz arkaplan */}
        <div style={{
          position: 'absolute',
          top: '20mm',
          right: '15mm',
          background: '#fff',
          padding: '12px 18px',
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        }}>
          <img src="/teklif-assets/karel-is-ortagi.png" alt="Karel İş Ortağı"
            style={{ height: 70, objectFit: 'contain' }} />
        </div>
      </div>

      {/* Sayfa 2 — Anlatı */}
      <div style={{ ...sayfaStil, position: 'relative' }}>
        <SayfaBasligi />

        <h1 style={{ fontSize: 32, color: '#0176D3', fontWeight: 800, marginTop: 50, marginBottom: 28, textAlign: 'center', letterSpacing: '-0.5px' }}>
          Fiyat Teklifi
        </h1>

        <div style={{ marginBottom: 28, fontSize: 12, lineHeight: 1.75 }}>
          <p style={{ fontWeight: 700, marginBottom: 12 }}>Sayın {teklif.firmaAdi}</p>
          <p style={{ textAlign: 'justify', whiteSpace: 'pre-line' }}>{TRASSIR_KARSILAMA}</p>
        </div>

        <h2 style={{ fontSize: 18, color: '#0176D3', fontWeight: 700, marginTop: 24, marginBottom: 10, paddingBottom: 4, borderBottom: '2px solid #0176D3' }}>
          ZNA Hakkında
        </h2>
        <p style={{ fontSize: 12, lineHeight: 1.75, textAlign: 'justify', marginBottom: 24 }}>{ZNA_HAKKINDA}</p>

        <h2 style={{ fontSize: 18, color: '#0176D3', fontWeight: 700, marginTop: 16, marginBottom: 10, paddingBottom: 4, borderBottom: '2px solid #0176D3' }}>
          Hizmetlerimiz
        </h2>
        <ul style={{ fontSize: 12, lineHeight: 1.9, paddingLeft: 22 }}>
          {HIZMETLERIMIZ.map(h => <li key={h}>{h}</li>)}
        </ul>
      </div>

      {/* Sayfa 3 — Fiyatlandırma */}
      <div style={{ ...sayfaStil, position: 'relative' }}>
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
      </div>

      {/* Sayfa 4 — İş Ortaklarımız */}
      <div style={{ ...sayfaStil, position: 'relative' }}>
        <SayfaBasligi />
        <h2 style={{ fontSize: 28, color: '#0176D3', fontWeight: 800, textAlign: 'center', marginTop: 30, marginBottom: 36, letterSpacing: '-0.3px' }}>
          İş Ortaklarımız
        </h2>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <img
            src="/teklif-assets/is-ortaklari.png"
            alt="İş ortakları"
            style={{ maxWidth: '100%', maxHeight: '230mm', objectFit: 'contain' }}
          />
        </div>
      </div>

      {/* Sayfa 5 — Referanslar */}
      <div style={{ ...sayfaStil, position: 'relative', pageBreakAfter: 'auto' }}>
        <SayfaBasligi />
        <h2 style={{ fontSize: 28, color: '#0176D3', fontWeight: 800, textAlign: 'center', marginTop: 30, marginBottom: 36, letterSpacing: '-0.3px' }}>
          Bazı Referanslarımız
        </h2>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <img
            src="/teklif-assets/referanslar.png"
            alt="Referanslar"
            style={{ maxWidth: '100%', maxHeight: '230mm', objectFit: 'contain' }}
          />
        </div>
      </div>
    </>
  )
}
