// Sipariş çıktı sayfası — A4 antetli, ZNA logolu.
// TeklifYazdir deseni: toolbar (Yazdır / PDF / Kapat) + off-screen clone → html2canvas → jsPDF.

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Printer, FileDown, X } from 'lucide-react'
import {
  siparisGetir, kalemleriGetir, SIPARIS_DURUMLARI, kalemAraToplam, kalemlerToplam,
} from '../services/siparisService'
import { musteriGetir } from '../services/musteriService'
import { gorusmeGetir } from '../services/gorusmeService'
import { dosyayiKaydet } from '../lib/dosyaIndir'

const paraSembol = (pb) => (pb === 'USD' ? '$' : pb === 'EUR' ? '€' : '₺')
const fmt = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtTarih = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`
  } catch { return iso }
}
const fmtTarihSaat = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  } catch { return iso }
}

export default function SiparisYazdir() {
  const { id } = useParams()
  const [siparis, setSiparis] = useState(null)
  const [kalemler, setKalemler] = useState([])
  const [musteri, setMusteri] = useState(null)
  const [gorusme, setGorusme] = useState(null)
  const [pdfYukleniyor, setPdfYukleniyor] = useState(false)
  const ciktiRef = useRef(null)

  useEffect(() => {
    (async () => {
      const s = await siparisGetir(id)
      if (!s) return
      setSiparis(s)
      const [k, m, g] = await Promise.all([
        kalemleriGetir(s.id),
        s.musteriId ? musteriGetir(s.musteriId) : Promise.resolve(null),
        s.gorusmeId ? gorusmeGetir(s.gorusmeId) : Promise.resolve(null),
      ])
      setKalemler(k || [])
      setMusteri(m)
      setGorusme(g)
    })()
  }, [id])

  const pdfIndir = async () => {
    if (!ciktiRef.current) return
    setPdfYukleniyor(true)
    let klon = null
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const A4_W = 794
      klon = ciktiRef.current.cloneNode(true)
      klon.style.position = 'fixed'
      klon.style.left = '-99999px'
      klon.style.top = '0'
      klon.style.width = A4_W + 'px'
      klon.style.background = '#fff'
      klon.style.zIndex = '-1'
      document.body.appendChild(klon)
      await new Promise(r => setTimeout(r, 300))
      const canvas = await html2canvas(klon, {
        scale: 2, useCORS: true, allowTaint: true,
        backgroundColor: '#ffffff', logging: false,
        width: A4_W, windowWidth: A4_W,
      })
      const imgW = 210
      const imgH = (canvas.height * imgW) / canvas.width
      const pageH = 297
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      const imgData = canvas.toDataURL('image/jpeg', 0.95)
      if (imgH <= pageH) {
        pdf.addImage(imgData, 'JPEG', 0, 0, imgW, imgH)
      } else {
        let kalan = imgH
        let pos = 0
        while (kalan > 0) {
          pdf.addImage(imgData, 'JPEG', 0, pos === 0 ? 0 : -(pos), imgW, imgH)
          kalan -= pageH
          pos += pageH
          if (kalan > 0) pdf.addPage()
        }
      }
      const blob = pdf.output('blob')
      await dosyayiKaydet(blob, `${siparis.siparisNo}.pdf`)
    } catch (err) {
      console.error('[Sipariş PDF]', err)
      alert('PDF üretilirken hata: ' + (err?.message || 'bilinmeyen'))
    } finally {
      if (klon) try { document.body.removeChild(klon) } catch {}
      setPdfYukleniyor(false)
    }
  }

  if (!siparis) {
    return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial' }}>Yükleniyor…</div>
  }

  const durumObj = SIPARIS_DURUMLARI.find(d => d.id === siparis.durum)
  const isTeklif = siparis.kaynakTipi === 'teklif'
  const pb = siparis.paraBirimi || 'TL'
  const sembol = paraSembol(pb)
  const toplam = kalemlerToplam(kalemler, siparis.genelIskonto)
  const genelToplam = Number(siparis.genelToplam || toplam.genelToplam)

  const aksiyonBtn = (bg) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 12px', fontSize: 12.5, fontWeight: 600,
    color: '#fff', background: bg,
    border: 'none', borderRadius: 6, cursor: 'pointer',
    transition: 'background 120ms, transform 80ms',
  })

  return (
    <>
      <style>{`
        @media print { .toolbar-yazdir { display: none !important; } body { padding-top: 0 !important; } }
        body { padding-top: 56px; background: #f1f5f9; }
        .toolbar-yazdir button:hover:not(:disabled) { filter: brightness(1.08); }
        .toolbar-yazdir button:active:not(:disabled) { transform: translateY(1px); }
      `}</style>

      {/* Toolbar */}
      <div
        className="no-print toolbar-yazdir"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 48,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', gap: 12,
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          zIndex: 999,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
          {siparis.siparisNo}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => window.print()} style={aksiyonBtn('#0176D3')} title="Yazdır">
            <Printer size={14} strokeWidth={2} /> Yazdır
          </button>
          <button
            onClick={pdfIndir}
            disabled={pdfYukleniyor}
            style={{ ...aksiyonBtn('#dc2626'), cursor: pdfYukleniyor ? 'wait' : 'pointer', opacity: pdfYukleniyor ? 0.6 : 1 }}
            title="PDF olarak indir"
          >
            <FileDown size={14} strokeWidth={2} /> {pdfYukleniyor ? 'Hazırlanıyor…' : 'PDF'}
          </button>
          <div style={{ width: 1, height: 22, background: '#e2e8f0', margin: '0 2px' }} />
          <button
            onClick={() => window.close()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '7px 10px', fontSize: 12.5, fontWeight: 500,
              color: '#64748b', background: 'transparent',
              border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer',
            }}
            title="Kapat"
          >
            <X size={14} strokeWidth={2} /> Kapat
          </button>
        </div>
      </div>

      {/* Antetli çıktı */}
      <div ref={ciktiRef}>
        <style>{`
          .siparis-page * { box-sizing: border-box; }
          .siparis-page { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; }
          @media print {
            @page { size: A4; margin: 0; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          .siparis-page table { width: 100%; border-collapse: collapse; }
          .siparis-page th, .siparis-page td { padding: 8px 10px; font-size: 12px; vertical-align: top; }
          .siparis-page th { background: #f1f5f9; font-weight: 700; text-align: left; color: #475569; text-transform: uppercase; font-size: 10px; letter-spacing: 0.06em; }
          .siparis-page tr:nth-child(even) td { background: #f8fafc; }
        `}</style>

        <div className="siparis-page" style={{ maxWidth: 794, margin: '0 auto', background: '#fff', boxShadow: '0 2px 16px rgba(15,23,42,0.08)' }}>
          {/* ANTET (letterhead) */}
          <div style={{
            padding: '24px 40px 18px 40px',
            borderBottom: '3px solid #0176D3',
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <img
                src="/teklif-assets/zna-logo.jpg"
                alt="ZNA Teknoloji"
                style={{ height: 64, objectFit: 'contain', flexShrink: 0 }}
              />
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', letterSpacing: '0.02em' }}>
                  ZNA TEKNOLOJİ
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 1.5 }}>
                  Güvenlik & Bilişim Sistemleri<br/>
                  info@znateknoloji.com.tr · znateknoloji.com.tr
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Sipariş
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0176D3', fontFamily: 'monospace', marginTop: 4 }}>
                {siparis.siparisNo}
              </div>
              <div style={{ marginTop: 6, display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 10.5, fontWeight: 700,
                background: `${durumObj?.renk || '#64748b'}18`, color: durumObj?.renk || '#64748b',
                border: `1px solid ${durumObj?.renk || '#64748b'}50`,
              }}>
                {(durumObj?.isim || siparis.durum || '').toUpperCase()}
              </div>
              <div style={{ marginTop: 6, fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Kaynak: {isTeklif ? 'Teklif' : 'Ön Sipariş'}
              </div>
            </div>
          </div>

          {/* GÖVDE */}
          <div style={{ padding: '24px 40px 32px 40px' }}>
            {/* Bilgi kutuları */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 22 }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Müşteri / Firma
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{musteri?.firma || musteri?.ad || '—'}</div>
                {musteri?.ad && musteri?.firma && (
                  <div style={{ fontSize: 11.5, color: '#475569', marginTop: 3 }}>Yetkili: {musteri.ad}</div>
                )}
                {musteri?.telefon && <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>Tel: {musteri.telefon}</div>}
                {musteri?.eposta && <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>E-posta: {musteri.eposta}</div>}
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Sipariş Bilgileri
                </div>
                <table style={{ fontSize: 11.5 }}>
                  <tbody>
                    {[
                      ['Sipariş No', siparis.siparisNo],
                      ['Onay Tarihi', fmtTarihSaat(siparis.onayTarihi || siparis.olusturmaTarih)],
                      ['Onaylayan', siparis.onaylayanAd || '—'],
                      gorusme?.gorusmeNo ? ['Kaynak Görüşme', gorusme.gorusmeNo] : null,
                      siparis.paraBirimi && siparis.paraBirimi !== 'TL' ? ['Para Birimi', siparis.paraBirimi] : null,
                    ].filter(Boolean).map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ color: '#64748b', paddingRight: 10, paddingTop: 2, paddingBottom: 2, background: 'transparent', border: 0 }}>{k}:</td>
                        <td style={{ fontWeight: 600, color: '#0f172a', background: 'transparent', border: 0 }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Kalemler */}
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Sipariş Kalemleri ({kalemler.length})
            </div>
            <table style={{ marginBottom: 20, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <colgroup>
                <col style={{ width: '4%' }} />
                <col />
                <col style={{ width: '10%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ürün / Hizmet</th>
                  <th style={{ textAlign: 'right' }}>Miktar</th>
                  <th style={{ textAlign: 'right' }}>Birim Fiyat</th>
                  <th style={{ textAlign: 'right' }}>İsk%</th>
                  <th style={{ textAlign: 'right' }}>KDV%</th>
                  <th style={{ textAlign: 'right' }}>Ara Toplam</th>
                </tr>
              </thead>
              <tbody>
                {kalemler.map((k, i) => {
                  const at = kalemAraToplam(k)
                  return (
                    <tr key={k.id}>
                      <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{k.urunAd}</div>
                        {(k.stokKodu || k.urunMarka) && (
                          <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>
                            {k.stokKodu && <span style={{ fontFamily: 'monospace' }}>{k.stokKodu}</span>}
                            {k.stokKodu && k.urunMarka && ' · '}
                            {k.urunMarka}
                          </div>
                        )}
                        {k.aciklama && (
                          <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 3, fontStyle: 'italic' }}>{k.aciklama}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>{Number(k.miktar || 0)} {k.birim || ''}</td>
                      <td style={{ textAlign: 'right' }}>{sembol}{fmt(k.birimFiyat)}</td>
                      <td style={{ textAlign: 'right', color: Number(k.iskontoOrani) > 0 ? '#f59e0b' : '#94a3b8' }}>
                        {Number(k.iskontoOrani || 0)}%
                      </td>
                      <td style={{ textAlign: 'right' }}>%{Number(k.kdvOrani || 0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{sembol}{fmt(at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Toplamlar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
              <div style={{ width: 300, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: '#475569' }}>
                  <span>Ara Toplam</span><span>{sembol}{fmt(toplam.araToplam)}</span>
                </div>
                {Number(siparis.genelIskonto) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: '#475569' }}>
                    <span>Genel İskonto</span><span>−{sembol}{fmt(siparis.genelIskonto)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: '#475569' }}>
                  <span>KDV Toplamı</span><span>{sembol}{fmt(toplam.kdvToplam)}</span>
                </div>
                <div style={{ borderTop: '2px solid #0176D3', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: '#0176D3' }}>
                  <span>GENEL TOPLAM</span><span>{sembol}{fmt(genelToplam)}</span>
                </div>
              </div>
            </div>

            {/* Notlar */}
            {siparis.notlar && (
              <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#a16207', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Notlar
                </div>
                <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{siparis.notlar}</div>
              </div>
            )}

            {/* Onay + imza */}
            <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Onay
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>{siparis.onaylayanAd || '—'}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{fmtTarih(siparis.onayTarihi)}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                {siparis.imzaUrl ? (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      İmza
                    </div>
                    <img
                      src={siparis.imzaUrl} alt="İmza"
                      crossOrigin="anonymous"
                      style={{ maxHeight: 70, background: 'transparent', display: 'block' }}
                    />
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* Footer / Alt antet */}
          <div style={{
            marginTop: 12, padding: '12px 40px 20px 40px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 10, color: '#94a3b8',
          }}>
            <span>Bu belge bilgisayar ortamında hazırlanmıştır.</span>
            <span style={{ fontWeight: 700, color: '#0176D3', fontFamily: 'monospace' }}>{siparis.siparisNo}</span>
          </div>
        </div>
      </div>
    </>
  )
}
