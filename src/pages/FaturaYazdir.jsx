import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { satisGetir } from '../services/satisService'

export default function FaturaYazdir() {
  const { id } = useParams()
  const [satis, setSatis] = useState(null)

  useEffect(() => {
    satisGetir(id).then((data) => {
      setSatis(data)
      setTimeout(() => window.print(), 600)
    })
  }, [id])

  if (!satis) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial' }}>Yükleniyor...</div>

  const fmt = (n) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })
  const paraSembol = satis.paraBirimi === 'USD' ? '$' : satis.paraBirimi === 'EUR' ? '€' : '₺'

  const kdvGruplari = {}
  ;(satis.satirlar || []).forEach((s) => {
    const oran = s.kdvOran || 20
    kdvGruplari[oran] = (kdvGruplari[oran] || 0) + (s.kdvTutar || 0)
  })

  const durumRenk = { taslak: '#6b7280', gonderildi: '#0176D3', odendi: '#10b981', gecikti: '#ef4444', iptal: '#9ca3af' }
  const durumIsim = { taslak: 'Taslak', gonderildi: 'Gönderildi', odendi: 'Ödendi', gecikti: 'Gecikti', iptal: 'İptal' }

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
        tr:nth-child(even) td { background: #f8fafc; }
      `}</style>

      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 999 }}>
        <button onClick={() => window.print()} style={{ background: '#0176D3', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>🖨 Yazdır / PDF</button>
        <button onClick={() => window.close()} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>✕ Kapat</button>
      </div>

      <div className="page">
        {/* Başlık */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, paddingBottom: 20, borderBottom: '2px solid #0176D3' }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0176D3' }}>SATIŞ FATURASI</h1>
            <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>{satis.faturaNo}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 20, background: `${durumRenk[satis.durum]}18`, color: durumRenk[satis.durum], fontSize: 12, fontWeight: 700, border: `1px solid ${durumRenk[satis.durum]}40` }}>
              {durumIsim[satis.durum] || satis.durum}
            </span>
          </div>
        </div>

        {/* Bilgiler */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Müşteri</p>
            <p style={{ fontSize: 14, fontWeight: 700 }}>{satis.firmaAdi || '—'}</p>
            {satis.musteriYetkili && <p style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{satis.musteriYetkili}</p>}
            {satis.musteriEmail && <p style={{ fontSize: 12, color: '#475569' }}>{satis.musteriEmail}</p>}
            {satis.musteriTelefon && <p style={{ fontSize: 12, color: '#475569' }}>{satis.musteriTelefon}</p>}
          </div>
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Fatura Bilgileri</p>
            <table style={{ fontSize: 12 }}>
              <tbody>
                {[
                  ['Fatura No', satis.faturaNo],
                  ['Fatura Tarihi', satis.faturaTarihi],
                  ['Vade Tarihi', satis.vadeTarihi || '—'],
                  ['Para Birimi', satis.paraBirimi],
                  ...(satis.teklifNo ? [['Bağlı Teklif', satis.teklifNo]] : []),
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ color: '#64748b', paddingRight: 12, paddingTop: 3, paddingBottom: 3, background: 'transparent' }}>{k}:</td>
                    <td style={{ fontWeight: 600, background: 'transparent' }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ürünler */}
        <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Ürün / Hizmet Satırları</p>
        <table style={{ marginBottom: 20, border: '1px solid #e2e8f0' }}>
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
            {(satis.satirlar || []).map((s, i) => (
              <tr key={i}>
                <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{s.urunAdi}</td>
                <td style={{ textAlign: 'right' }}>{s.miktar}</td>
                <td>{s.birim}</td>
                <td style={{ textAlign: 'right' }}>{paraSembol}{fmt(s.birimFiyat)}</td>
                <td style={{ textAlign: 'right', color: s.iskontoOran > 0 ? '#f59e0b' : '#94a3b8' }}>{s.iskontoOran || 0}%</td>
                <td style={{ textAlign: 'right' }}>%{s.kdvOran || 20}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{paraSembol}{fmt(s.satirToplam)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Toplamlar + Tahsilatlar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 24 }}>
          {/* Tahsilatlar */}
          {(satis.tahsilatlar || []).length > 0 && (
            <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 10, padding: '12px 14px', border: '1px solid #bbf7d0' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Tahsilatlar</p>
              {satis.tahsilatlar.map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: '#475569' }}>{t.tarih}</span>
                  <span style={{ fontWeight: 600, color: '#15803d' }}>{paraSembol}{fmt(t.tutar)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Özet */}
          <div style={{ width: 280, background: '#f8fafc', borderRadius: 10, padding: '14px 16px' }}>
            {[
              { k: 'Ara Toplam', v: `${paraSembol}${fmt(satis.araToplam)}` },
              ...(satis.iskontoToplam > 0 ? [{ k: 'İskonto', v: `-${paraSembol}${fmt(satis.iskontoToplam)}` }] : []),
              ...Object.entries(kdvGruplari).map(([oran, tutar]) => ({ k: `KDV %${oran}`, v: `${paraSembol}${fmt(tutar)}` })),
            ].map(({ k, v }) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: '#475569' }}>
                <span>{k}</span><span>{v}</span>
              </div>
            ))}
            <div style={{ borderTop: '2px solid #0176D3', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: '#0176D3' }}>
              <span>GENEL TOPLAM</span><span>{paraSembol}{fmt(satis.genelToplam)}</span>
            </div>
            {satis.odenenToplam > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 8, color: '#10b981', fontWeight: 600 }}>
                  <span>Ödenen</span><span>{paraSembol}{fmt(satis.odenenToplam)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: '#f59e0b', borderTop: '1px solid #e2e8f0', marginTop: 6, paddingTop: 6 }}>
                  <span>Kalan</span><span>{paraSembol}{fmt(satis.genelToplam - satis.odenenToplam)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {satis.notlar && (
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', marginBottom: 20 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Notlar</p>
            <p style={{ fontSize: 12, color: '#475569' }}>{satis.notlar}</p>
          </div>
        )}

        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, marginTop: 20, display: 'flex', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 10, color: '#94a3b8' }}>Bu fatura bilgisayar ortamında hazırlanmıştır.</p>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#0176D3' }}>{satis.faturaNo}</p>
        </div>
      </div>
    </>
  )
}
