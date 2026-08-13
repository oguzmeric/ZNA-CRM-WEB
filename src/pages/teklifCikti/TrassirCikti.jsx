// Trassir teklif çıktısı — A4 dikey, 5 sayfalık marka-yoğun sunum.
// Sayfa 1: kapak görseli
// Sayfa 2: karşılama + ZNA Hakkında + Hizmetlerimiz
// Sayfa 3: fiyatlandırma tablosu
// Sayfa 4: İş Ortaklarımız (logo grid'i)
// Sayfa 5: Bazı Referanslarımız (logo grid'i)

import { TRASSIR_KARSILAMA, ZNA_HAKKINDA, HIZMETLERIMIZ, ZNA_FIRMA } from '../../lib/teklifTemplates'
import {
  teklifHesapla, kdvSatirlari, iskontoEtiketi, satirIskontoMetni, oranMetni, tutarMetni, r2,
  tlKarsiligiGoster, tlKarsilik, kurBeyani,
} from '../../lib/teklifHesap'

// Antetli kağıt footer'ı — her içerik sayfasının altına gelir (kapak hariç)
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

const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'

export default function TrassirCikti({ teklif, pacal = false }) {
  const paraSembol = teklif.paraBirimi === 'USD' ? '$' : teklif.paraBirimi === 'EUR' ? '€' : '₺'
  // Dövizli teklifte TL karşılığı (13.08) — devlet kuruluşları TL ister
  const tlGoster = tlKarsiligiGoster(teklif)
  const kur = Number(teklif.dovizKuru) || 0
  const fmt = tutarMetni

  const h = teklifHesapla(teklif)
  const { araToplam, genelToplam } = h
  // İskonto kolonu yalnız iskontolu tekliflerde basılır — iskontosuz teklifin
  // çıktısı olduğu gibi kalsın, boş bir "—" sütunu eklenmesin.
  const iskKolon = h.satirIskontoVar

  const sayfaStil = {
    width: '210mm',
    // height: 296mm (297mm degil): yazicinin basilabilir alani alt-piksel
    // yuvarlama ile 297mm'den birazcik kucuk; tam 297mm her sayfayi 2. fiziksel
    // sayfaya tasiriyordu (5 -> 10 sayfa bug'i). 1mm pay ile taşma biter.
    // 285mm: iOS basilabilir alani 296mm'yi ~1mm asiyordu (her sayfa tasip bos
    // sayfa birakiyordu). Belirgin pay ile artik tasma yok, tam 5 sayfa.
    height: '285mm',
    overflow: 'hidden',
    // page-break-AFTER, bir sayfa-dolusu ogeden sonra iOS'ta ekstra bos sayfa
    // ekliyordu. page-break-BEFORE ile her yeni sayfa kendi onunde kiriliyor;
    // kapak (ilk sayfa) asagida bunu 'auto' ile devre disi birakir.
    pageBreakBefore: 'always',
    breakBefore: 'page',
    padding: '20mm 20mm 35mm 20mm', // bottom 35mm = footer için yer
    boxSizing: 'border-box',
    fontFamily: "'Segoe UI', Arial, sans-serif",
    color: '#1e293b',
    background: '#fff',
    margin: '0 auto',
    position: 'relative', // footer absolute için
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
          /* Uzun paçal listesinde satır ortadan kesilmesin, başlık her sayfada tekrarlasın */
          tr, .bedel-serit { break-inside: avoid; page-break-inside: avoid; }
          thead { display: table-header-group; }
        }
      `}</style>

      {/* Sayfa 1 — Kapak (ilk sayfa: oncesinde kirma yok) */}
      <div className="teklif-sayfa" style={{ ...sayfaStil, pageBreakBefore: 'auto', breakBefore: 'auto', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <img
          src="/teklif-assets/zna-cover.png"
          alt="ZNA Teknoloji"
          style={{ width: '100%', height: '285mm', objectFit: 'cover' }}
        />
      </div>

      {/* Sayfa 2 — Anlatı */}
      <div className="teklif-sayfa" style={sayfaStil}>
        <img src="/teklif-assets/zna-logo.jpg" alt="ZNA Teknoloji"
          style={{ position: 'absolute', top: '12mm', left: '14mm', height: 56, objectFit: 'contain', zIndex: 5 }} />
        <h1 style={{ fontSize: 26, color: '#0176D3', fontWeight: 600, marginTop: 50, marginBottom: 28, textAlign: 'center', letterSpacing: '0', fontFamily: "'Segoe UI', Arial, sans-serif" }}>
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
        <SayfaFooter />
      </div>

      {/* Sayfa 3 — Fiyatlandırma */}
      <div className="teklif-sayfa" style={sayfaStil}>
        <img src="/teklif-assets/zna-logo.jpg" alt="ZNA Teknoloji"
          style={{ position: 'absolute', top: '12mm', left: '14mm', height: 56, objectFit: 'contain', zIndex: 5 }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18, marginTop: 50, fontSize: 12, color: '#475569' }}>
          <span><strong>Tarih :</strong> {fmtTarih(teklif.tarih)}</span>
          <span><strong>Hazırlayan :</strong> {teklif.hazirlayan || '—'}</span>
        </div>

        <h2 style={{ fontSize: 22, color: '#0176D3', fontWeight: 600, marginBottom: 22, textAlign: 'center', letterSpacing: '0', fontFamily: "'Segoe UI', Arial, sans-serif" }}>
          Fiyatlandırma
        </h2>

        {pacal ? (
          /* PAÇAL — kalem listesi + altında tek parça PROJE BEDELİ şeridi.
             ⚠️ Bedel eskiden rowSpan'li bir hücreydi; çok satırlı teklifte sayfa
             kesmesinde bölünüyor, html2canvas'ta her satıra yeniden çizilip mavi
             bloklara dönüşüyordu. Tablodan çıkarıldı. */
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
              <thead>
                <tr style={{ background: '#0176D3', color: '#fff' }}>
                  <th style={{ padding: 8, textAlign: 'left', border: '1px solid #0176D3', width: '22%' }}>Marka</th>
                  <th style={{ padding: 8, textAlign: 'left', border: '1px solid #0176D3' }}>Açıklama</th>
                  <th style={{ padding: 8, textAlign: 'right', border: '1px solid #0176D3', width: '18%' }}>Ad./Mt.</th>
                </tr>
              </thead>
              <tbody>
                {(teklif.satirlar || []).map((s, i) => (
                  <tr key={i} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                    <td style={{ padding: 6, border: '1px solid #cbd5e1', fontWeight: 600 }}>{s.marka || (s.stokKodu ? 'Trassir' : 'ZNA')}</td>
                    <td style={{ padding: 6, border: '1px solid #cbd5e1' }}>{s.stokAdi}</td>
                    <td style={{ padding: 6, border: '1px solid #cbd5e1', textAlign: 'right' }}>{s.miktar} {s.birim}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="bedel-serit" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 16, background: '#0176D3', color: '#fff',
              padding: '14px 20px', border: '1px solid #0176D3', borderTop: 'none',
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>PROJE BEDELİ</span>
              {/* Paçalda kalem fiyatı gösterilmediği için iskonto oranı da basılmaz —
                  bedelin kendisi iskontolu tutardır. */}
              <span style={{ fontSize: 20, fontWeight: 800 }}>{paraSembol}{fmt(r2(araToplam - h.genelIskontoTutar))}{tlGoster && <span style={{ display: 'block', fontSize: 11, fontWeight: 700, opacity: 0.9, textAlign: 'right' }}>TL karşılığı ₺{fmt(tlKarsilik(r2(araToplam - h.genelIskontoTutar), kur))}</span>}</span>
            </div>
          </>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
            <thead>
              <tr style={{ background: '#0176D3', color: '#fff' }}>
                <th style={{ padding: 8, textAlign: 'left',  border: '1px solid #0176D3', width: iskKolon ? '14%' : '15%' }}>Marka</th>
                <th style={{ padding: 8, textAlign: 'left',  border: '1px solid #0176D3' }}>Açıklama</th>
                <th style={{ padding: 8, textAlign: 'right', border: '1px solid #0176D3', width: iskKolon ? '11%' : '13%' }}>Ad./Mt.</th>
                <th style={{ padding: 8, textAlign: 'right', border: '1px solid #0176D3', width: iskKolon ? '14%' : '15%' }}>Birim Fiyat</th>
                {iskKolon && <th style={{ padding: 8, textAlign: 'right', border: '1px solid #0176D3', width: '9%' }}>İskonto</th>}
                <th style={{ padding: 8, textAlign: 'right', border: '1px solid #0176D3', width: iskKolon ? '16%' : '17%' }}>Toplam Fiyat</th>
                {tlGoster && <th style={{ padding: 8, textAlign: 'right', border: '1px solid #0176D3', width: '14%' }}>Toplam (TL)</th>}
              </tr>
            </thead>
            <tbody>
              {(teklif.satirlar || []).map((s, i) => {
                const hs = h.satirlar[i]
                return (
                  <tr key={i} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                    <td style={{ padding: 6, border: '1px solid #cbd5e1', fontWeight: 600 }}>{s.marka || (s.stokKodu ? 'Trassir' : 'ZNA')}</td>
                    <td style={{ padding: 6, border: '1px solid #cbd5e1' }}>{s.stokAdi}</td>
                    <td style={{ padding: 6, border: '1px solid #cbd5e1', textAlign: 'right' }}>{s.miktar} {s.birim}</td>
                    <td style={{ padding: 6, border: '1px solid #cbd5e1', textAlign: 'right' }}>{paraSembol}{fmt(s.birimFiyat)}</td>
                    {iskKolon && (
                      <td style={{ padding: 6, border: '1px solid #cbd5e1', textAlign: 'right', color: hs.iskontoOran > 0 ? '#b45309' : '#94a3b8', fontWeight: hs.iskontoOran > 0 ? 700 : 400 }}>
                        {satirIskontoMetni(hs.iskontoOran)}
                      </td>
                    )}
                    <td style={{ padding: 6, border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 700 }}>{paraSembol}{fmt(hs.net)}</td>
                    {tlGoster && (
                      <td style={{ padding: 6, border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>₺{fmt(tlKarsilik(hs.net, kur))}</td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Toplamlar — iskonto varsa brüt tutar ve indirim ayrı satırlarda görünür.
            KDV etiketi satırların gerçek oranından üretilir; sabit "% 20" yazısı
            %18'li tekliflerde tutar doğruyken bile yanlış oran gösteriyordu. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <table style={{ fontSize: 13, minWidth: 280 }}>
            <tbody>
              {[
                ...(h.satirIskontoVar ? [
                  { k: 'Brüt Tutar', v: `${paraSembol}${fmt(h.brutToplam)}` },
                  { k: iskontoEtiketi(h), v: `−${paraSembol}${fmt(h.satirIskontoToplam)}`, vurgu: true },
                ] : []),
                { k: 'Ara Tutar', v: `${paraSembol}${fmt(araToplam)}` },
                ...(h.genelIskontoVar ? [
                  { k: `Genel İskonto (%${oranMetni(h.genelIskontoOran)})`, v: `−${paraSembol}${fmt(h.genelIskontoTutar)}`, vurgu: true },
                ] : []),
                ...kdvSatirlari(h).map(({ etiket, tutar }) => ({ k: etiket, v: `${paraSembol}${fmt(tutar)}` })),
              ].map(({ k, v, vurgu }) => (
                <tr key={k}>
                  <td style={{ padding: 4, paddingRight: 16, color: vurgu ? '#b45309' : '#475569', fontWeight: vurgu ? 700 : 400 }}>{k} :</td>
                  <td style={{ textAlign: 'right', padding: 4, color: vurgu ? '#b45309' : undefined, fontWeight: vurgu ? 700 : 400 }}>{v}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 800, color: '#0176D3' }}>
                <td style={{ padding: 8, paddingRight: 16, borderTop: '2px solid #0176D3' }}>Genel Toplam :</td>
                <td style={{ textAlign: 'right', padding: 8, borderTop: '2px solid #0176D3' }}>{paraSembol}{fmt(genelToplam)}</td>
              </tr>
              {tlGoster && (
                <>
                  <tr style={{ fontWeight: 700, color: '#0f766e' }}>
                    <td style={{ padding: 6, paddingRight: 16 }}>TL Karşılığı :</td>
                    <td style={{ textAlign: 'right', padding: 6 }}>₺{fmt(tlKarsilik(genelToplam, kur))}</td>
                  </tr>
                  <tr>
                    <td colSpan={2} style={{ padding: '2px 6px', fontSize: 9.5, color: '#94a3b8', fontWeight: 400 }}>
                      {kurBeyani(teklif.paraBirimi, kur)}
                    </td>
                  </tr>
                </>
              )}
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

      {/* Sayfa 4 — İş Ortaklarımız */}
      <div className="teklif-sayfa" style={sayfaStil}>
        <img src="/teklif-assets/zna-logo.jpg" alt="ZNA Teknoloji"
          style={{ position: 'absolute', top: '12mm', left: '14mm', height: 56, objectFit: 'contain', zIndex: 5 }} />
        <h2 style={{ fontSize: 24, color: '#0176D3', fontWeight: 600, textAlign: 'center', marginTop: 30, marginBottom: 36, letterSpacing: '0', fontFamily: "'Segoe UI', Arial, sans-serif" }}>
          İş Ortaklarımız
        </h2>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <img
            src="/teklif-assets/is-ortaklari.png"
            alt="İş ortakları"
            style={{ maxWidth: '100%', maxHeight: '210mm', objectFit: 'contain' }}
          />
        </div>
        <SayfaFooter />
      </div>

      {/* Sayfa 5 — Referanslar */}
      <div className="teklif-sayfa" style={sayfaStil}>
        <img src="/teklif-assets/zna-logo.jpg" alt="ZNA Teknoloji"
          style={{ position: 'absolute', top: '12mm', left: '14mm', height: 56, objectFit: 'contain', zIndex: 5 }} />
        <h2 style={{ fontSize: 24, color: '#0176D3', fontWeight: 600, textAlign: 'center', marginTop: 30, marginBottom: 36, letterSpacing: '0', fontFamily: "'Segoe UI', Arial, sans-serif" }}>
          Bazı Referanslarımız
        </h2>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <img
            src="/teklif-assets/referanslar.png"
            alt="Referanslar"
            style={{ maxWidth: '100%', maxHeight: '210mm', objectFit: 'contain' }}
          />
        </div>
        <SayfaFooter />
      </div>
    </>
  )
}
