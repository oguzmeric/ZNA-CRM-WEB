// Toplu barkod etiket yazdırma — CODE128 SVG barkod, A4 3×8 grid.
// Kalemler seçilir, "Yazdır" ile print önizleme açılır.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import JsBarcode from 'jsbarcode'
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

/**
 * SN yazısının puntosu — uzun numara tek satırda kalsın diye.
 * Rulo (40mm) dar olduğu için eşikler orada daha erken devreye girer;
 * A4 hücresi (63mm) geniş, orada yalnız çok uzun numaralarda küçülür.
 */
function snPunto(seriNo, ruloModu) {
  const n = `SN: ${seriNo || ''}`.length
  if (ruloModu) {
    if (n > 22) return { fontSize: '6pt' }
    if (n > 18) return { fontSize: '7pt' }
    return undefined            // CSS'teki 8pt
  }
  if (n > 26) return { fontSize: '8pt' }
  return undefined              // CSS'teki 10pt
}

/**
 * @param {'barkod'|'sn'} duzen
 *   'barkod' (varsayılan): marka / model / CODE128 / SN — stok-depo etiketi.
 *   'sn' (14.08 kullanıcı kararı): ÜSTTE "SN: <numara>", ALTTA dikey çizgili
 *   CODE128 barkod. Cihaz üstündeki fabrika etiketlerinin düzeniyle aynı —
 *   saha ekibi aynı tarayıcıyla okutuyor.
 */
export default function BarkodEtiketYazdir({ kalemler, marka, stokKodu, onKapat, onYazdir, duzen = 'barkod' }) {
  const snDuzen = duzen === 'sn'
  const { toast } = useToast()
  // Kağıt seçimi (14.08): A4 etiket sayfası (24 etiket) VEYA NIIMBOT 40×20 rulo
  // (etiket başına bir sayfa). Rulo modu yalnız SN düzeninde anlamlı.
  const [kagit, setKagit] = useState('a4')   // 'a4' | 'rulo'
  const ruloModu = snDuzen && kagit === 'rulo'
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
                {marka} · {stokKodu} · {seciliKalemler.length}/{kalemler.length} seçili ·{' '}
                {ruloModu ? 'NIIMBOT 40×20 mm rulo · her etiket ayrı' : 'A4 · 3×8 grid = 24 etiket/sayfa'}
              </div>
            </div>
            <button onClick={onKapat} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>

          {/* Kağıt seçimi — yalnız SN düzeninde (bağımsız SN etiketleri) */}
          {snDuzen && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginRight: 2 }}>Kağıt:</span>
              {[
                { id: 'a4', etiket: 'A4 etiket sayfası (24 adet)' },
                { id: 'rulo', etiket: 'NIIMBOT rulo 40×20 mm' },
              ].map(s => (
                <button key={s.id} type="button" onClick={() => setKagit(s.id)}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                    background: kagit === s.id ? 'rgba(59,130,246,0.12)' : 'transparent',
                    border: `1px solid ${kagit === s.id ? 'rgba(59,130,246,0.45)' : 'var(--border-default)'}`,
                    color: kagit === s.id ? '#3b82f6' : 'var(--text-secondary)',
                  }}>
                  {s.etiket}
                </button>
              ))}
            </div>
          )}

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
            {ruloModu ? (
              <>💡 Yazdır'a basınca yazdır önizlemesi açılır. Yazıcı olarak <strong>NIIMBOT</strong>'u,
              kenar boşluğunu <strong>Yok</strong> seç. Her seri no ayrı etikete basılır
              ({seciliKalemler.length} etiket).</>
            ) : (
              <>💡 Yazdır'a basınca tarayıcının yazdır önizlemesi açılır. Kağıt tipini <strong>A4</strong>,
              kenar boşluğunu <strong>Yok/Minimum</strong> seç. Etiket kağıdı da bu grid ile uyumlu.</>
            )}
          </div>
        </div>
      </div>

      {/* Yazdırılacak katman — normalde gizli, print sırasında görünür */}
      <div className={`etiket-yazdir-alani${ruloModu ? ' etiket-rulo-modu' : ''}`}>
        <div className="etiket-grid">
          {seciliKalemler.map(k => (snDuzen ? (
            // ÜSTTE "SN: numara", ALTTA dikey çizgili barkod — başka bilgi yok
            // (kullanıcı kararı 14.08; cihazların fabrika etiketiyle aynı düzen)
            <div key={k.id} className="etiket-hucre etiket-hucre-sn">
              {/* Uzun seri no 40mm etikette iki satıra sarıp taşırabiliyor —
                  uzunluğa göre punto düşürülür (CSS içerik uzunluğunu bilemez). */}
              <div className="etiket-sn-ust" style={snPunto(k.seriNo, ruloModu)}>SN: {k.seriNo}</div>
              <div className="etiket-barkod-sn"><Barkod deger={k.seriNo} height={44} /></div>
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

          /* ── SN DÜZENİ (14.08): üstte "SN: numara", altta barkod ────────
             Cihazların fabrika etiketiyle aynı görünüm. Barkod, hücre
             genişliğini doldurur; yüksekliği sabit tutulur ki yazıcı
             ölçeklemesinde çizgiler birbirine girmesin. */
          .etiket-hucre-sn {
            justify-content: center;
            gap: 1.5mm;
            padding: 2mm;
          }
          .etiket-sn-ust {
            font-family: 'Courier New', monospace;
            font-size: 10pt;
            font-weight: 700;
            letter-spacing: 0.3px;
            line-height: 1.15;
            /* Uzun SN'ler (cihazın kendi seri no'su) taşmasın, sarsın */
            word-break: break-all;
            max-width: 100%;
          }
          .etiket-barkod-sn {
            width: 100%;
            display: flex;
            justify-content: center;
          }
          .etiket-barkod-sn svg {
            width: 100%;
            max-width: 52mm;
            height: 14mm !important;
            shape-rendering: crispEdges;  /* çizgiler keskin kalsın */
          }

          /* ── NIIMBOT RULO 40×20 mm (14.08 kullanıcı kararı) ──────────────
             Rulo etiketleri ÖNCEDEN KESİLMİŞ: her etiket ayrı "sayfa" olmalı,
             yoksa yazıcı ikinci etiketi ilkinin üstüne bindirir.
             ÖLÇÜ: barkodumuz 123 modül; 203 dpi'de modül başına 2 nokta
             (0,25 mm) için 31 mm gerekir. 40 mm etikette 34 mm'ye basıyoruz —
             iki yanda ~3 mm sessiz alan kalıyor, telefon kamerası okuyor. */
        }

        @media print {
          .etiket-rulo-modu .etiket-grid {
            display: block;
          }
          .etiket-rulo-modu .etiket-hucre {
            width: 40mm;
            height: 20mm;
            border: none;              /* rulo zaten kesik — çerçeve gereksiz */
            padding: 1.5mm 2mm;
            gap: 1mm;
            page-break-after: always;  /* HER ETİKET AYRI SAYFA */
            break-after: page;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .etiket-rulo-modu .etiket-hucre:last-child {
            page-break-after: auto;
            break-after: auto;         /* son etiketten sonra boş sayfa çıkmasın */
          }
          .etiket-rulo-modu .etiket-sn-ust {
            font-size: 8pt;
            line-height: 1.1;
          }
          .etiket-rulo-modu .etiket-barkod-sn svg {
            max-width: 34mm;
            height: 10mm !important;
          }
        }
      `}</style>

      {/* @page sınıfla hedeflenemez — rulo modunda sayfa ölçüsünü AYRI bir blok
          ezer (sonra gelen kural kazanır). A4 modunda bu blok hiç basılmaz. */}
      {ruloModu && <style>{`
        @media print {
          @page { size: 40mm 20mm; margin: 0; }
          html, body { width: 40mm; }
        }
      `}</style>}
    </>,
    document.body,
  )
}
