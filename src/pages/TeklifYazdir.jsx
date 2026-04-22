import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { teklifGetir } from '../services/teklifService'

export default function TeklifYazdir() {
  const { id } = useParams()
  const [teklif, setTeklif] = useState(null)

  useEffect(() => {
    teklifGetir(id).then((data) => {
      setTeklif(data)
      setTimeout(() => window.print(), 600)
    })
  }, [id])

  if (!teklif) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial' }}>Yükleniyor...</div>

  const kdvOranlari = {}
  ;(teklif.satirlar || []).forEach((s) => {
    const kdv = s.kdv || 20
    const ara = s.miktar * s.birimFiyat
    const isk = ara * ((s.iskonto || 0) / 100)
    const kdvT = (ara - isk) * (kdv / 100)
    kdvOranlari[kdv] = (kdvOranlari[kdv] || 0) + kdvT
  })
  const araToplam = (teklif.satirlar || []).reduce((s, r) => {
    const ara = r.miktar * r.birimFiyat
    return s + ara - ara * ((r.iskonto || 0) / 100)
  }, 0)
  const kdvToplam = Object.values(kdvOranlari).reduce((a, b) => a + b, 0)
  const genelToplam = araToplam + kdvToplam
  const paraSembol = teklif.paraBirimi === 'USD' ? '$' : teklif.paraBirimi === 'EUR' ? '€' : '₺'
  const fmt = (n) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; }
        @media print {
          @page { size: A4; margin: 15mm 15mm 15mm 15mm; }
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .page { max-width: 860px; margin: 0 auto; padding: 32px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px 10px; font-size: 12px; }
        th { background: #f1f5f9; font-weight: 700; text-align: left; }
        tr:nth-child(even) { background: #f8fafc; }
        .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
      `}</style>

      {/* Yazdır butonu — baskıda gizlenir */}
      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 999 }}>
        <button onClick={() => window.print()} style={{ background: '#0176D3', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
          🖨 Yazdır / PDF
        </button>
        <button onClick={() => window.close()} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>
          ✕ Kapat
        </button>
      </div>

      <div className="page">
        {/* Başlık */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, paddingBottom: 20, borderBottom: '2px solid #0176D3' }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0176D3', letterSpacing: '-0.5px' }}>TEKLİF</h1>
            <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>{teklif.teklifNo}{teklif.revizyon > 0 ? ` — Rev.${teklif.revizyon}` : ''}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{teklif.firmaAdi}</p>
            {teklif.musteriYetkilisi && <p style={{ fontSize: 12, color: '#64748b' }}>{teklif.musteriYetkilisi}</p>}
          </div>
        </div>

        {/* Bilgiler */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Teklif Bilgileri</p>
            <table style={{ fontSize: 12 }}>
              <tbody>
                {[
                  ['Teklif No', teklif.teklifNo],
                  ['Tarih', teklif.tarih],
                  ['Geçerlilik', teklif.gecerlilikTarihi || '—'],
                  ['Hazırlayan', teklif.hazirlayan || '—'],
                  ['Ödeme', teklif.odemeSecenegi || '—'],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ color: '#64748b', paddingRight: 12, paddingTop: 3, paddingBottom: 3, background: 'transparent' }}>{k}:</td>
                    <td style={{ fontWeight: 600, background: 'transparent' }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Müşteri / Firma</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{teklif.firmaAdi || '—'}</p>
            {teklif.musteriYetkilisi && <p style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>Yetkili: {teklif.musteriYetkilisi}</p>}
            {teklif.konu && <p style={{ fontSize: 12, color: '#475569', marginTop: 8, fontStyle: 'italic' }}>Konu: {teklif.konu}</p>}
          </div>
        </div>

        {/* Ürünler */}
        <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Ürün / Hizmet Satırları</p>
        <table style={{ marginBottom: 20, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Ürün / Hizmet</th>
              <th style={{ textAlign: 'right' }}>Miktar</th>
              <th>Birim</th>
              <th style={{ textAlign: 'right' }}>Birim Fiyat</th>
              <th style={{ textAlign: 'right' }}>İsk%</th>
              <th style={{ textAlign: 'right' }}>KDV%</th>
              <th style={{ textAlign: 'right' }}>Toplam</th>
            </tr>
          </thead>
          <tbody>
            {(teklif.satirlar || []).map((s, i) => {
              const ara = s.miktar * s.birimFiyat
              const isk = ara * ((s.iskonto || 0) / 100)
              const kdvT = (ara - isk) * ((s.kdv || 20) / 100)
              const top = ara - isk + kdvT
              return (
                <tr key={i}>
                  <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{s.stokAdi}</td>
                  <td style={{ textAlign: 'right' }}>{s.miktar}</td>
                  <td>{s.birim}</td>
                  <td style={{ textAlign: 'right' }}>{paraSembol}{fmt(s.birimFiyat)}</td>
                  <td style={{ textAlign: 'right', color: s.iskonto > 0 ? '#f59e0b' : '#94a3b8' }}>{s.iskonto || 0}%</td>
                  <td style={{ textAlign: 'right' }}>%{s.kdv || 20}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{paraSembol}{fmt(top)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Toplamlar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 28 }}>
          <div style={{ width: 280, background: '#f8fafc', borderRadius: 10, padding: '14px 16px' }}>
            {[
              { k: 'Ara Toplam', v: `${paraSembol}${fmt(araToplam)}`, bold: false },
              ...Object.entries(kdvOranlari).map(([oran, tutar]) => ({ k: `KDV %${oran}`, v: `${paraSembol}${fmt(tutar)}`, bold: false })),
            ].map(({ k, v }) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: '#475569' }}>
                <span>{k}</span><span>{v}</span>
              </div>
            ))}
            <div style={{ borderTop: '2px solid #0176D3', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: '#0176D3' }}>
              <span>GENEL TOPLAM</span><span>{paraSembol}{fmt(genelToplam)}</span>
            </div>
          </div>
        </div>

        {/* Notlar */}
        {teklif.aciklama && (
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', marginBottom: 20 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Notlar / Koşullar</p>
            <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>{teklif.aciklama}</p>
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 10, color: '#94a3b8' }}>Bu teklif bilgisayar ortamında hazırlanmıştır.</p>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#0176D3' }}>{teklif.teklifNo}</p>
        </div>
      </div>
    </>
  )
}
