import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { faturaTalepGetir } from '../services/faturaTalepService'
import { yazdirKapat } from '../lib/yazdirKapat'

// Kurumsal PROFORMA FATURA çıktısı. Proforma resmî belge değildir —
// filigran + uyarı bandı bunu belirgin kılar (gerçek fatura FaturaYazdir'da).
const MAVI = '#0B3A6E'
const ACIK = '#f4f7fb'

export default function ProformaYazdir() {
  const { id } = useParams()
  const [talep, setTalep] = useState(null)
  const [bulunamadi, setBulunamadi] = useState(false)

  useEffect(() => {
    faturaTalepGetir(id).then((data) => {
      if (!data) { setBulunamadi(true); return }
      setTalep(data)
      setTimeout(() => window.print(), 600)
    })
  }, [id])

  if (bulunamadi) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial' }}>Proforma kaydı bulunamadı.</div>
  if (!talep) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial' }}>Yükleniyor...</div>

  const fmt = (n) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })
  const ps = talep.paraBirimi === 'USD' ? '$' : talep.paraBirimi === 'EUR' ? '€' : '₺'
  const tarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'

  // ── BAKIM KAPSAMI / BEDELSİZ (mig 282) ──
  // Bakım anlaşmalı işte bedel alınmaz ve çoğu zaman malzeme de kullanılmaz →
  // belge KALEMSİZ ve ₺0,00 basılıyordu, müşteriye giden çıktı bomboş
  // görünüyordu (FTL-2026-000040 geri bildirimi). Artık:
  //   • kalem yoksa hizmetin kendisi TEK SATIR olarak yazılır
  //   • fiyat sütunlarında rakam yerine "—", toplamda "BEDELSİZ"
  //   • belgenin başında neden bedel alınmadığı açıkça yazar
  const bedelsiz = !!talep.bedelsiz
  const hamKalemler = talep.kalemler || []
  // "Servis: OTOPARK KURULUM" → "OTOPARK KURULUM"
  const isTanimi = String(talep.konu || '').replace(/^Servis:\s*/i, '').trim()
  const kalemler = (bedelsiz && hamKalemler.length === 0)
    ? [{
      urunAdi: isTanimi
        ? `Bakım Anlaşması Kapsamında Servis ve Bakım Hizmeti — ${isTanimi}`
        : 'Bakım Anlaşması Kapsamında Servis ve Bakım Hizmeti',
      aciklama: 'Sözleşme kapsamında ifa edilmiştir; bedel tahsil edilmemiştir.',
      miktar: 1, birim: 'Hizmet', birimFiyat: 0, kdvOran: 0, satirToplam: 0,
    }]
    : hamKalemler
  const kdvGruplari = {}
  kalemler.forEach((k) => {
    const oran = k.kdvOran ?? 20
    kdvGruplari[oran] = (kdvGruplari[oran] || 0) + (k.kdvTutar || 0)
  })
  const tlKarsiligi = talep.paraBirimi !== 'TL' && talep.dovizKuru
    ? (talep.genelToplam || 0) * talep.dovizKuru : null

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; }
        @media print {
          @page { size: A4; margin: 14mm 14mm 16mm 14mm; }
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
        }
        /* Sayfa dikey flex: alt bilgi (duzenleme tarihi + ust cizgisi) icerik
           kisa kalsa bile SAYFANIN DIBINE oturur — eskiden toplam blogunun
           hemen altinda, sayfanin ortasinda asili duruyordu (12.08).
           Ayni desen ServisFormu'nda da kullaniliyor. */
        .sayfa { max-width: 800px; margin: 0 auto; padding: 28px; position: relative;
          display: flex; flex-direction: column; }
        .alt-bilgi { margin-top: auto; padding-top: 18px; }
        /* ekranda sabit Yazdir/Kapat butonlari basliga binmesin; ciktida bosluk yok */
        @media screen { .sayfa { margin-top: 56px; min-height: calc(100vh - 56px); } }
        /* A4 yuksekligi eksi @page marjlari (297 - 14 - 16). box-sizing:border-box
           oldugu icin 28px padding bu yukseklige DAHIL — tasma olmaz.
           ⚠️ padding'e DOKUNMA: sifirlanirsa icerik sayfa kenarina yapisir. */
        @media print { .sayfa { min-height: 267mm; } }
        table { width: 100%; border-collapse: collapse; }
        .kalem th { background: ${MAVI}; color: #fff; font-size: 10.5px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.04em; padding: 8px 10px; text-align: left; }
        .kalem td { font-size: 12px; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
        .kalem tr:nth-child(even) td { background: ${ACIK}; }
        .r { text-align: right; }
        .filigran { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
          pointer-events: none; z-index: 0; }
        .filigran span { font-size: 92px; font-weight: 800; color: rgba(11,58,110,0.05);
          transform: rotate(-28deg); letter-spacing: 0.08em; white-space: nowrap; }
        .icerik { position: relative; z-index: 1; }
      `}</style>

      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 999 }}>
        <button onClick={() => window.print()} style={{ background: MAVI, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>🖨 Yazdır / PDF</button>
        <button onClick={() => yazdirKapat('/fatura-talepleri')} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>✕ Kapat</button>
      </div>

      {/* Bedelsizde filigran da bunu söylesin — belge tek bakışta ayırt edilsin */}
      <div className="filigran"><span>{bedelsiz ? 'BEDELSİZ' : 'PROFORMA'}</span></div>

      <div className="sayfa icerik">
        {/* Üst şerit: logo + belge kimliği */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 18, borderBottom: `3px solid ${MAVI}`, marginBottom: 18 }}>
          <div>
            <img src="/logo.jpeg" alt="ZNA Teknoloji" style={{ height: 52, display: 'block', marginBottom: 8 }} />
            <p style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>ZNA Teknoloji Bilişim Hizmetleri San. ve Tic. Ltd. Şti.</p>
            <p style={{ fontSize: 10.5, color: '#64748b' }}>Başakşehir / İstanbul · www.znateknoloji.com</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: MAVI, letterSpacing: '0.02em' }}>PROFORMA FATURA</h1>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginTop: 6 }}>{talep.talepNo}</p>
            <p style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>Düzenleme: {tarih(talep.olusturmaTarih)}</p>
          </div>
        </div>

        {/* Bakım kapsamı bandı — müşteri neden bedel görmediğini BELGEDEN anlasın */}
        {bedelsiz && (
          <div style={{ background: '#eff6ff', border: `1px solid ${MAVI}`, borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
            <p style={{ fontSize: 12, color: MAVI, fontWeight: 800, letterSpacing: 0.3 }}>
              BAKIM ANLAŞMASI KAPSAMINDA BEDELSİZ HİZMET
            </p>
            <p style={{ fontSize: 10.5, color: '#1e3a5f', marginTop: 4, lineHeight: 1.55 }}>
              İşbu belgeye konu servis ve bakım hizmeti, firmamız ile
              <strong> {talep.firmaAdi || 'müşterimiz'} </strong>
              arasında yürürlükte bulunan bakım anlaşması kapsamında ifa edilmiş olup,
              hizmet karşılığında herhangi bir bedel tahsil edilmemiştir.
            </p>
          </div>
        )}

        {/* Uyarı bandı — proforma resmî belge değildir */}
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 18 }}>
          <p style={{ fontSize: 10.5, color: '#92400e', fontWeight: 600 }}>
            Bu belge PROFORMA FATURADIR; ön bilgilendirme amaçlıdır. Mali/resmî belge niteliği taşımaz, e-fatura / e-arşiv fatura yerine geçmez.
          </p>
        </div>

        {/* Satıcı / Alıcı */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div style={{ background: ACIK, borderRadius: 10, padding: '12px 14px', borderLeft: `3px solid ${MAVI}` }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Alıcı (Müşteri)</p>
            <p style={{ fontSize: 13.5, fontWeight: 700 }}>{talep.firmaAdi || '—'}</p>
            {talep.yetkiliAdi && <p style={{ fontSize: 11.5, color: '#475569', marginTop: 3 }}>{talep.yetkiliAdi}</p>}
            {(talep.vergiDairesi || talep.vergiNo) && (
              <p style={{ fontSize: 11.5, color: '#475569', marginTop: 3 }}>
                Vergi: {[talep.vergiDairesi, talep.vergiNo].filter(Boolean).join(' / ')}
              </p>
            )}
            {talep.adres && <p style={{ fontSize: 11.5, color: '#475569', marginTop: 3 }}>{talep.adres}</p>}
            {(talep.telefon || talep.email) && (
              <p style={{ fontSize: 11.5, color: '#475569', marginTop: 3 }}>{[talep.telefon, talep.email].filter(Boolean).join(' · ')}</p>
            )}
          </div>
          <div style={{ background: ACIK, borderRadius: 10, padding: '12px 14px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Belge Bilgileri</p>
            <table style={{ fontSize: 11.5 }}>
              <tbody>
                {[
                  ['Proforma No', talep.talepNo],
                  ...(talep.teklifNo ? [['Bağlı Teklif', talep.teklifNo]] : []),
                  ...(talep.konu ? [['Konu', talep.konu]] : []),
                  ['Para Birimi', talep.paraBirimi],
                  ...(talep.odemeSekli ? [['Ödeme', talep.odemeSekli]] : []),
                  ...(talep.vadeTarihi ? [['Vade', tarih(talep.vadeTarihi)]] : []),
                  ...(tlKarsiligi ? [['Kur (TCMB)', `1 ${talep.paraBirimi} = ₺${fmt(talep.dovizKuru)}`]] : []),
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ color: '#64748b', paddingRight: 10, paddingTop: 2.5, paddingBottom: 2.5, whiteSpace: 'nowrap' }}>{k}:</td>
                    <td style={{ fontWeight: 600 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Kalemler */}
        <table className="kalem" style={{ marginBottom: 18 }}>
          <thead>
            <tr>
              <th style={{ width: 26 }}>#</th>
              <th>Ürün / Hizmet</th>
              <th className="r" style={{ width: 70 }}>Miktar</th>
              <th className="r" style={{ width: 88 }}>Birim Fiyat</th>
              {kalemler.some(k => (k.iskontoOran || 0) > 0) && <th className="r" style={{ width: 48 }}>İsk.</th>}
              <th className="r" style={{ width: 48 }}>KDV</th>
              <th className="r" style={{ width: 96 }}>Toplam</th>
            </tr>
          </thead>
          <tbody>
            {kalemler.map((k, i) => (
              <tr key={i}>
                <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                <td>
                  <span style={{ fontWeight: 600 }}>{k.urunAdi}</span>
                  {k.stokKodu && <span style={{ color: '#94a3b8', fontSize: 10.5 }}> · {k.stokKodu}</span>}
                  {k.aciklama && (
                    <div style={{ color: '#64748b', fontSize: 10.5, marginTop: 2 }}>{k.aciklama}</div>
                  )}
                </td>
                <td className="r">{k.miktar} {k.birim}</td>
                {/* Bedelsiz belgede rakam basmak yanıltıcı olur — "—" yazılır */}
                <td className="r">{bedelsiz ? '—' : `${ps}${fmt(k.birimFiyat)}`}</td>
                {kalemler.some(x => (x.iskontoOran || 0) > 0) && (
                  <td className="r">{k.iskontoOran ? `%${k.iskontoOran}` : '—'}</td>
                )}
                <td className="r">{bedelsiz ? '—' : `%${k.kdvOran ?? 20}`}</td>
                <td className="r" style={{ fontWeight: 700 }}>
                  {bedelsiz ? '—' : `${ps}${fmt(k.satirToplam)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Toplamlar — bedelsizde ₺0,00 yerine tek satır "BEDELSİZ" */}
        {bedelsiz ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 22 }}>
            <div style={{ width: 300, background: '#eff6ff', border: `2px solid ${MAVI}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: MAVI }}>
                <span>GENEL TOPLAM</span><span>BEDELSİZ</span>
              </div>
              <p style={{ fontSize: 10.5, color: '#1e3a5f', marginTop: 6, lineHeight: 1.5 }}>
                Bakım anlaşması kapsamında ifa edilmiştir; bedel tahsil edilmemiştir.
              </p>
            </div>
          </div>
        ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 22 }}>
          <div style={{ width: 300, background: ACIK, borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: '#475569' }}>
              <span>Ara Toplam</span><span>{ps}{fmt(talep.araToplam)}</span>
            </div>
            {Object.entries(kdvGruplari).map(([oran, tutar]) => (
              <div key={oran} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: '#475569' }}>
                <span>KDV %{oran}</span><span>{ps}{fmt(tutar)}</span>
              </div>
            ))}
            <div style={{ borderTop: `2px solid ${MAVI}`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: MAVI }}>
              <span>GENEL TOPLAM</span><span>{ps}{fmt(talep.genelToplam)}</span>
            </div>
            {tlKarsiligi && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginTop: 6, color: '#64748b' }}>
                <span>TL Karşılığı</span><span>₺{fmt(tlKarsiligi)}</span>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Alt bilgi — 12.08 sadeleştirildi (kullanıcı: "bu yazılara gerek var mı?")
            • Belge no ÜST ŞERİTTE zaten var; altta tekrarı gürültüydü.
            • "Düzenleyen: <personel adı>" müşteriye giden belgede iç personel
              ismi demek — kurum adına düzenlenir, kişi adına değil.
            • Fiyat/stok şartı BEDELSİZ belgede anlamsız: ortada bedel yok. */}
        <div className="alt-bilgi" style={{ borderTop: '1px solid #e2e8f0' }}>
          {!bedelsiz && (
            <p style={{ fontSize: 10, color: '#94a3b8' }}>
              Fiyatlar belirtilen para birimindedir; aksi kararlaştırılmadıkça KDV dahildir
              ve stok durumuna bağlı olarak değişebilir.
            </p>
          )}
          <p style={{ fontSize: 10, color: '#94a3b8', marginTop: bedelsiz ? 0 : 2 }}>
            Düzenleme tarihi: {tarih(talep.olusturmaTarih)}
          </p>
        </div>
      </div>
    </>
  )
}
