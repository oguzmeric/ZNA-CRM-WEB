// Karel teklif çıktısı — A4 yatay, tek sayfa, kompakt mektup formatı.
// Üst banner: ZNA logosu (sol) + KAREL İŞ ORTAĞI logosu (sağ)
// Bilgi grid'i (Sayın/Tel/Konu  +  Tarih/Evrak No/Hazırlayan)
// Tablo: Marka | Açıklama | Miktar | Birim | Birim Fiyat | Toplam Fiyat
// Alt: Not (sol) + Toplam/KDV/Genel Toplam (sağ)

import { useEffect, useState } from 'react'
import { ZNA_FIRMA } from '../../lib/teklifTemplates'
import { musterileriGetir } from '../../services/musteriService'

const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : ''

export default function KarelCikti({ teklif }) {
  const [musteri, setMusteri] = useState(null)

  useEffect(() => {
    musterileriGetir().then(list => {
      const m = (list || []).find(x => x.firma === teklif.firmaAdi)
      setMusteri(m || null)
    }).catch(() => setMusteri(null))
  }, [teklif.firmaAdi])

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

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; }
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div style={{
        width: '297mm',
        minHeight: '210mm',
        padding: '8mm 10mm',
        boxSizing: 'border-box',
        fontFamily: "'Segoe UI', Arial, sans-serif",
        color: '#1e293b',
        background: '#fff',
        fontSize: 11,
        margin: '0 auto',
      }}>
        {/* Üst banner — iki logo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <img src="/teklif-assets/zna-logo.jpg" alt="ZNA Teknoloji" style={{ height: 70, objectFit: 'contain' }} />
          <img src="/teklif-assets/karel-is-ortagi.png" alt="Karel İş Ortağı" style={{ height: 60, objectFit: 'contain' }} />
        </div>

        {/* Üst başlık banner — firma bilgisi tek satır */}
        <div style={{
          background: '#1e3a8a',
          color: '#fff',
          padding: '6px 10px',
          fontSize: 9.5,
          fontWeight: 600,
          marginBottom: 10,
          textAlign: 'center',
          letterSpacing: '0.2px',
        }}>
          UNVAN: {ZNA_FIRMA.unvan} &nbsp;&nbsp;&nbsp; ADRES: {ZNA_FIRMA.adres} &nbsp;&nbsp;&nbsp; TEL/FAX: {ZNA_FIRMA.telFax}
        </div>

        {/* Bilgi grid'i */}
        <table style={{ width: '100%', fontSize: 11.5, marginBottom: 10, borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ padding: '4px 6px', width: '10%', fontWeight: 700, background: '#f1f5f9' }}>Sayın :</td>
              <td style={{ padding: '4px 8px', width: '40%', borderBottom: '1px solid #cbd5e1' }}>{teklif.firmaAdi}</td>
              <td style={{ padding: '4px 6px', width: '10%', fontWeight: 700, background: '#f1f5f9' }}>Tarih:</td>
              <td style={{ padding: '4px 8px', width: '40%', borderBottom: '1px solid #cbd5e1' }}>{fmtTarih(teklif.tarih)}</td>
            </tr>
            <tr>
              <td style={{ padding: '4px 6px', fontWeight: 700, background: '#f1f5f9' }}>Tel :</td>
              <td style={{ padding: '4px 8px', borderBottom: '1px solid #cbd5e1' }}>{musteri?.telefon || ''}</td>
              <td style={{ padding: '4px 6px', fontWeight: 700, background: '#f1f5f9' }}>Evrak No:</td>
              <td style={{ padding: '4px 8px', borderBottom: '1px solid #cbd5e1' }}>{teklif.teklifNo}</td>
            </tr>
            <tr>
              <td style={{ padding: '4px 6px', fontWeight: 700, background: '#f1f5f9' }}>Konu :</td>
              <td style={{ padding: '4px 8px', borderBottom: '1px solid #cbd5e1' }}>{teklif.konu}</td>
              <td style={{ padding: '4px 6px', fontWeight: 700, background: '#f1f5f9' }}>Hazırlayan:</td>
              <td style={{ padding: '4px 8px', borderBottom: '1px solid #cbd5e1' }}>{teklif.hazirlayan || '—'}</td>
            </tr>
          </tbody>
        </table>

        {/* Başlık */}
        <h2 style={{
          fontSize: 15,
          fontWeight: 800,
          textAlign: 'center',
          margin: '10px 0 8px',
          letterSpacing: '1px',
          color: '#1e3a8a',
        }}>
          FİYAT TEKLİFİ
        </h2>

        {/* Tablo */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 8 }}>
          <thead>
            <tr style={{ background: '#1e3a8a', color: '#fff' }}>
              <th style={{ padding: 6, border: '1px solid #1e3a8a', textAlign: 'left', width: '10%' }}>Marka</th>
              <th style={{ padding: 6, border: '1px solid #1e3a8a', textAlign: 'left' }}>Açıklama</th>
              <th style={{ padding: 6, border: '1px solid #1e3a8a', textAlign: 'right', width: '7%' }}>Miktar</th>
              <th style={{ padding: 6, border: '1px solid #1e3a8a', textAlign: 'left', width: '8%' }}>Birim</th>
              <th style={{ padding: 6, border: '1px solid #1e3a8a', textAlign: 'right', width: '13%' }}>Birim Fiyat</th>
              <th style={{ padding: 6, border: '1px solid #1e3a8a', textAlign: 'right', width: '13%' }}>Toplam Fiyat</th>
            </tr>
          </thead>
          <tbody>
            {(teklif.satirlar || []).map((s, i) => {
              const ara = s.miktar * s.birimFiyat
              const isk = ara * ((s.iskonto || 0) / 100)
              const top = ara - isk
              return (
                <tr key={i} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                  <td style={{ padding: 5, border: '1px solid #cbd5e1', fontWeight: 600 }}>{s.marka || (s.stokKodu ? '—' : 'ZNA')}</td>
                  <td style={{ padding: 5, border: '1px solid #cbd5e1' }}>{s.stokAdi}</td>
                  <td style={{ padding: 5, border: '1px solid #cbd5e1', textAlign: 'right' }}>{s.miktar}</td>
                  <td style={{ padding: 5, border: '1px solid #cbd5e1' }}>{s.birim}</td>
                  <td style={{ padding: 5, border: '1px solid #cbd5e1', textAlign: 'right' }}>{paraSembol}{fmt(s.birimFiyat)}</td>
                  <td style={{ padding: 5, border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 700 }}>{paraSembol}{fmt(top)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Alt: Not + Toplamlar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, gap: 16 }}>
          <div style={{ flex: 1, fontSize: 11, color: '#475569' }}>
            {teklif.aciklama && (<><strong>Not:</strong> {teklif.aciklama}</>)}
          </div>
          <table style={{ fontSize: 12, minWidth: 260 }}>
            <tbody>
              <tr>
                <td style={{ padding: 3, paddingRight: 16, color: '#475569' }}>Toplam :</td>
                <td style={{ textAlign: 'right', padding: 3 }}>{paraSembol}{fmt(araToplam)}</td>
              </tr>
              <tr>
                <td style={{ padding: 3, paddingRight: 16, color: '#475569' }}>KDV (%20) :</td>
                <td style={{ textAlign: 'right', padding: 3 }}>{paraSembol}{fmt(kdvToplam)}</td>
              </tr>
              <tr style={{ fontWeight: 800, color: '#1e3a8a' }}>
                <td style={{ padding: 6, paddingRight: 16, borderTop: '2px solid #1e3a8a' }}>Genel Toplam :</td>
                <td style={{ textAlign: 'right', padding: 6, borderTop: '2px solid #1e3a8a' }}>{paraSembol}{fmt(genelToplam)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
