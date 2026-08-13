// Standart teklif çıktısı — A4 dikey, tek sayfa, sade.
// Tutarlar ortak `teklifHesap` modülünden gelir (bkz. src/lib/teklifHesap.js).

import {
  teklifHesapla, kdvSatirlari, iskontoEtiketi, satirIskontoMetni, oranMetni, tutarMetni, r2,
} from '../../lib/teklifHesap'

export default function StandartCikti({ teklif, pacal = false }) {
  const h = teklifHesapla(teklif)
  const { araToplam, genelToplam } = h
  const paraSembol = teklif.paraBirimi === 'USD' ? '$' : teklif.paraBirimi === 'EUR' ? '€' : '₺'
  const fmt = tutarMetni

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; }
        @media print {
          @page { size: A4; margin: 15mm 15mm 15mm 15mm; }
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          /* Çok sayfalı teklifte satır ortadan kesilmesin, başlık her sayfada tekrarlasın */
          tr, .bedel-serit { break-inside: avoid; page-break-inside: avoid; }
          thead { display: table-header-group; }
        }
        .page { max-width: 860px; margin: 0 auto; padding: 32px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th, td { padding: 8px 10px; font-size: 12px; word-break: break-word; overflow-wrap: anywhere; vertical-align: top; }
        th { background: #f1f5f9; font-weight: 700; text-align: left; }
        tr:nth-child(even) { background: #f8fafc; }
        .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
      `}</style>

      <div className="page">
        {/* Başlık */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, paddingBottom: 20, borderBottom: '2px solid #0176D3' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img
              src="/teklif-assets/zna-logo.jpg"
              alt="ZNA Teknoloji"
              style={{ height: 56, objectFit: 'contain', flexShrink: 0 }}
            />
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Teklif</p>
              <p style={{ fontSize: 14, color: '#64748b', marginTop: 4, fontWeight: 600 }}>{teklif.teklifNo}{teklif.revizyon > 0 ? ` — Rev.${teklif.revizyon}` : ''}</p>
            </div>
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
        <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          {pacal ? 'Fiyatlandırma' : 'Ürün / Hizmet Satırları'}
        </p>
        {pacal ? (
          /* PAÇAL — kalem listesi + altında tek parça PROJE BEDELİ şeridi.
             ⚠️ Bedel eskiden rowSpan'li bir hücreydi; çok satırlı teklifte hem
             sayfa kesmesinde bölünüyor hem html2canvas'ta her satıra yeniden
             çizilip mavi bloklara dönüşüyordu. Tablodan çıkarıldı. */
          <>
            <table style={{ marginBottom: 0, border: '1px solid #e2e8f0', borderTopLeftRadius: 8, borderTopRightRadius: 8, overflow: 'hidden' }}>
              <colgroup>
                <col style={{ width: '5%' }} />
                <col style={{ width: '20%' }} />
                <col />
                <col style={{ width: '16%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Marka</th>
                  <th>Açıklama</th>
                  <th style={{ textAlign: 'right' }}>Ad./Mt.</th>
                </tr>
              </thead>
              <tbody>
                {(teklif.satirlar || []).map((s, i) => (
                  <tr key={i}>
                    <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                    <td>{s.marka || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{s.stokAdi}</td>
                    <td style={{ textAlign: 'right' }}>{s.miktar} {s.birim || 'Adet'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="bedel-serit" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 16, background: '#0176D3', color: '#fff',
              padding: '14px 20px', marginBottom: 20,
              borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>PROJE BEDELİ</span>
              {/* Paçalda kalem fiyatı gösterilmediği için iskonto oranı da basılmaz —
                  bedelin kendisi iskontolu tutardır. */}
              <span style={{ fontSize: 22, fontWeight: 800 }}>{paraSembol}{fmt(r2(araToplam - h.genelIskontoTutar))}</span>
            </div>
          </>
        ) : (
          /* DETAYLI — mevcut hâli */
          <table style={{ marginBottom: 20, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <colgroup>
              <col style={{ width: '4%' }} />
              <col />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
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
                const hs = h.satirlar[i]
                return (
                  <tr key={i}>
                    <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{s.stokAdi}</td>
                    <td style={{ textAlign: 'right' }}>{s.miktar}</td>
                    <td>{s.birim}</td>
                    <td style={{ textAlign: 'right' }}>{paraSembol}{fmt(s.birimFiyat)}</td>
                    {/* İskontosuz satırda "0%" yerine tire — iskontolu satır göze çarpsın */}
                    <td style={{ textAlign: 'right', color: hs.iskontoOran > 0 ? '#b45309' : '#94a3b8', fontWeight: hs.iskontoOran > 0 ? 700 : 400 }}>
                      {satirIskontoMetni(hs.iskontoOran)}
                    </td>
                    <td style={{ textAlign: 'right' }}>%{oranMetni(hs.kdvOran)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{paraSembol}{fmt(hs.toplam)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Toplamlar — iskonto varsa brüt tutar ve indirim ayrı satırlarda gösterilir,
            böylece müşteri hangi orandan ne kadar indirim aldığını belgede görür. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 28 }}>
          <div style={{ width: 280, background: '#f8fafc', borderRadius: 10, padding: '14px 16px' }}>
            {[
              ...(h.satirIskontoVar ? [
                { k: 'Brüt Toplam', v: `${paraSembol}${fmt(h.brutToplam)}` },
                { k: iskontoEtiketi(h), v: `−${paraSembol}${fmt(h.satirIskontoToplam)}`, vurgu: true },
              ] : []),
              { k: 'Ara Toplam', v: `${paraSembol}${fmt(araToplam)}` },
              ...(h.genelIskontoVar ? [
                { k: `Genel İskonto (%${oranMetni(h.genelIskontoOran)})`, v: `−${paraSembol}${fmt(h.genelIskontoTutar)}`, vurgu: true },
              ] : []),
              ...kdvSatirlari(h).map(({ etiket, tutar }) => ({ k: etiket, v: `${paraSembol}${fmt(tutar)}` })),
            ].map(({ k, v, vurgu }) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: vurgu ? '#b45309' : '#475569', fontWeight: vurgu ? 700 : 400 }}>
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
