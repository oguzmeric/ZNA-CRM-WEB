// Toplu barkod etiket yazdırma — CODE128 SVG barkod, A4 3×8 grid.
// Kalemler seçilir, "Yazdır" ile print önizleme açılır.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { Printer, X, Square, CheckSquare } from 'lucide-react'
import { Button } from './ui'
import { useToast } from '../context/ToastContext'

// SN → SVG barkod (component)
function Barkod({ deger, height = 40 }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current || !deger) return
    try {
      JsBarcode(ref.current, String(deger), {
        format: 'CODE128',
        displayValue: false,
        height, margin: 0,
        width: 1.4,
      })
    } catch (e) { console.warn('[Barkod]', deger, e?.message) }
  }, [deger, height])
  return <svg ref={ref} />
}

// SN → QR (SVG string). Kare olduğu için küçük etikete barkoddan iyi sığar ve
// telefon kamerası açıyı düzeltebildiği için saha okumasında daha toleranslı.
// errorCorrectionLevel 'M': etiket kısmen çizilse/kirlense de okunur.
function QrKod({ deger, kenar = 26 }) {
  // { deger, svg } birlikte tutulur: effect'te senkron setState yapmadan
  // "bu svg hangi değere ait" sorusunu cevaplar (eslint set-state-in-effect).
  const [uretilen, setUretilen] = useState({ deger: null, svg: '' })
  useEffect(() => {
    if (!deger) return
    let iptal = false
    QRCode.toString(String(deger), {
      type: 'svg', errorCorrectionLevel: 'M', margin: 0,
    })
      .then(s => { if (!iptal) setUretilen({ deger, svg: s }) })
      .catch(e => console.warn('[QrKod]', deger, e?.message))
    return () => { iptal = true }
  }, [deger])
  // Değer değiştiyse ESKİ QR'ı gösterme — yanlış etiket basılmasın.
  const svg = uretilen.deger === deger ? uretilen.svg : ''
  if (!svg) return null
  return (
    <div
      className="etiket-qr-kutu"
      style={{ width: kenar, height: kenar }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

/**
 * @param {'barkod'|'qr'} duzen
 *   'barkod' (varsayılan): marka / model / CODE128 / SN — stok-depo etiketi.
 *   'qr' (14.08 kullanıcı kararı): ÜSTTE "SN: <numara>", ALTTA QR. Bağımsız SN
 *   etiketlerinde kullanılır; sahada telefonla okutmak için sade tutuldu.
 */
export default function BarkodEtiketYazdir({ kalemler, marka, stokKodu, onKapat, onYazdir, duzen = 'barkod' }) {
  const qrDuzen = duzen === 'qr'
  const { toast } = useToast()
  const [seciliIdler, setSeciliIdler] = useState(() => new Set(kalemler.map(k => k.id)))
  const tumu = () => setSeciliIdler(new Set(kalemler.map(k => k.id)))
  const hicbiri = () => setSeciliIdler(new Set())
  const toggleKalem = (id) => {
    const yeni = new Set(seciliIdler)
    if (yeni.has(id)) yeni.delete(id); else yeni.add(id)
    setSeciliIdler(yeni)
  }
  const seciliKalemler = kalemler.filter(k => seciliIdler.has(k.id))

  const yazdir = () => {
    if (seciliKalemler.length === 0) { toast.warning('En az bir SN seçin.'); return }
    // window.print browser-native — CSS'te print class'ları etiketleri düzenler
    window.print()
    // Basıldı işareti çağıranın sorumluluğunda (window.print senkron döner)
    onYazdir?.(seciliKalemler)
  }

  return createPortal(
    <>
      <div className="etiket-modal-overlay" style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
        <div onClick={e => e.stopPropagation()} className="etiket-modal-kutu" style={{
          background: 'var(--surface-card)', color: 'var(--text-primary)',
          borderRadius: 14, padding: 24, maxWidth: 900, width: '100%', maxHeight: '85vh',
          overflow: 'auto', border: '1px solid var(--border-default)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18 }}>Toplu Barkod Etiket</h3>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                {marka} · {stokKodu} · {seciliKalemler.length}/{kalemler.length} seçili · A4 · 3×8 grid = 24 etiket/sayfa
              </div>
            </div>
            <button onClick={onKapat} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm" onClick={tumu}>Tümünü Seç</Button>
            <Button variant="secondary" size="sm" onClick={hicbiri}>Hiçbirini Seçme</Button>
            <div style={{ flex: 1 }} />
            <Button variant="primary" size="sm" iconLeft={<Printer size={13} />} onClick={yazdir}>
              Yazdır ({seciliKalemler.length})
            </Button>
          </div>

          <div style={{
            border: '1px solid var(--border-default)', borderRadius: 8, padding: 12,
            maxHeight: 300, overflow: 'auto', background: 'var(--surface-sunken)',
          }}>
            {kalemler.map(k => {
              const secili = seciliIdler.has(k.id)
              return (
                <button key={k.id} onClick={() => toggleKalem(k.id)}
                  style={{
                    display: 'flex', width: '100%', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 6, marginBottom: 4,
                    background: secili ? 'rgba(59,130,246,0.1)' : 'transparent',
                    border: `1px solid ${secili ? 'rgba(59,130,246,0.4)' : 'transparent'}`,
                    cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)',
                  }}>
                  {secili ? <CheckSquare size={16} strokeWidth={1.5} color="#3b82f6" /> : <Square size={16} strokeWidth={1.5} color="#94a3b8" />}
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13 }}>{k.seriNo}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>· {k.durum}</span>
                </button>
              )
            })}
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 12 }}>
            💡 Yazdır'a basınca tarayıcının yazdır önizlemesi açılır. Kağıt tipini <strong>A4</strong>, kenar boşluğunu <strong>Yok/Minimum</strong> seç. Etiket kağıdı da bu grid ile uyumlu.
          </div>
        </div>
      </div>

      {/* Yazdırılacak katman — normalde gizli, print sırasında görünür */}
      <div className="etiket-yazdir-alani">
        <div className="etiket-grid">
          {seciliKalemler.map(k => (qrDuzen ? (
            // ÜSTTE SN, ALTTA QR — başka bilgi yok (kullanıcı kararı 14.08)
            <div key={k.id} className="etiket-hucre etiket-hucre-qr">
              <div className="etiket-sn-ust">SN: {k.seriNo}</div>
              <QrKod deger={k.seriNo} />
            </div>
          ) : (
            <div key={k.id} className="etiket-hucre">
              <div className="etiket-marka">{marka || k.marka || 'ZNA'}</div>
              <div className="etiket-model">{k.model || stokKodu}</div>
              <div className="etiket-barkod"><Barkod deger={k.seriNo} height={38} /></div>
              <div className="etiket-sn">{k.seriNo}</div>
            </div>
          )))}
        </div>
      </div>

      <style>{`
        /* Ekranda gizli */
        .etiket-yazdir-alani { display: none; }

        @media print {
          /* Modal ve tüm sayfa gizli, sadece etiket alanı */
          body > * { display: none !important; }

          /* Uygulama kabuğu ekranda iç kaydırmalı (MainLayout overflow:auto) ve
             yüksekliği viewport'a sabit — yazdırmada bu, içeriği tek sayfaya
             kırpar. Akışı serbest bırak. */
          html, body {
            height: auto !important;
            overflow: visible !important;
            background: #fff !important;
          }

          /* DİKKAT: burada position:fixed KULLANMA. Sabit konumlu eleman
             yazdırmada viewport'a çakılır ve taşan içerik BASILMAZ —
             100 etiket seçilip tek sayfa çıkmasının sebebi buydu (29.07).
             Normal akışta kalırsa tarayıcı grid'i sayfalara böler. */
          .etiket-yazdir-alani {
            display: block !important;
            position: static !important;
            width: auto !important;
            height: auto !important;
            overflow: visible !important;
            background: #fff !important;
            color: #000 !important;
            padding: 0 !important;
          }
          @page { size: A4; margin: 5mm; }

          .etiket-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            grid-auto-rows: 33mm;
            gap: 2mm;
          }
          .etiket-hucre {
            border: 1px dashed #999;
            padding: 3mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1mm;
            text-align: center;
            page-break-inside: avoid;
            break-inside: avoid;   /* modern karşılığı — etiket ikiye bölünmesin */
          }
          .etiket-marka {
            font-size: 11pt;
            font-weight: 700;
            line-height: 1.1;
          }
          .etiket-model {
            font-size: 8pt;
            color: #444;
            line-height: 1.1;
          }
          .etiket-barkod svg {
            width: 100%;
            max-width: 55mm;
            height: 12mm !important;
          }
          .etiket-sn {
            font-family: 'Courier New', monospace;
            font-size: 8pt;
            font-weight: 600;
            letter-spacing: 0.5px;
          }

          /* ── QR DÜZENİ (14.08): üstte SN yazısı, altta QR ──────────────
             Hücre yüksekliği grid'den (33mm) geliyor; QR kalan alana
             sığacak sabit ölçüde. QR'ı yüzde ile büyütmüyoruz — yazıcı
             ölçeklemesinde bulanıklaşıp okunmaz hale gelebiliyor. */
          .etiket-hucre-qr {
            justify-content: flex-start;
            gap: 1.5mm;
            padding: 2mm;
          }
          .etiket-sn-ust {
            font-family: 'Courier New', monospace;
            font-size: 9pt;
            font-weight: 700;
            letter-spacing: 0.3px;
            line-height: 1.15;
            /* Uzun SN'ler (cihazın kendi seri no'su) taşmasın, sarsın */
            word-break: break-all;
            max-width: 100%;
          }
          .etiket-qr-kutu {
            width: 20mm !important;
            height: 20mm !important;
          }
          .etiket-qr-kutu svg {
            width: 100% !important;
            height: 100% !important;
            display: block;
            shape-rendering: crispEdges;  /* QR kareleri keskin kalsın */
          }
        }
      `}</style>
    </>,
    document.body,
  )
}
