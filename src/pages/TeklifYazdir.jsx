import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Printer, FileDown, FileSpreadsheet, X } from 'lucide-react'
import { teklifGetir } from '../services/teklifService'
import { stokUrunleriniGetir } from '../services/stokService'
import { musteriyeGonderilebilir, tekliftenDurum, TEKLIF_DURUM_META } from '../lib/teklifDurumlari'
import StandartCikti from './teklifCikti/StandartCikti'
import TrassirCikti from './teklifCikti/TrassirCikti'
import KarelCikti from './teklifCikti/KarelCikti'
import { teklifDosyaAdi } from '../lib/teklifDosyaAdi'
import { dosyayiKaydet } from '../lib/dosyaIndir'
import { tipCoz } from '../lib/teklifTemplates'

const ciktiMap = {
  standart: StandartCikti,
  trassir:  TrassirCikti,
  karel:    KarelCikti,
}

const tipSecenekleri = [
  { value: 'standart',       label: 'Standart' },
  { value: 'standart_pacal', label: 'Standart Proje' },
  { value: 'trassir',        label: 'Trassir' },
  { value: 'trassir_pacal',  label: 'Trassir Proje' },
  { value: 'karel',          label: 'Karel' },
  { value: 'karel_pacal',    label: 'Karel Proje' },
]

export default function TeklifYazdir() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const tipUrl = searchParams.get('tip') // form'dan kayıt yapılmadan iletilen tip
  const [teklif, setTeklif] = useState(null)
  const [seciliTip, setSeciliTip] = useState(null)
  const [excelYukleniyor, setExcelYukleniyor] = useState(false)
  const [pdfYukleniyor, setPdfYukleniyor] = useState(false)
  const ciktiRef = useRef(null)

  useEffect(() => {
    Promise.all([teklifGetir(id), stokUrunleriniGetir()]).then(([data, urunler]) => {
      // Eski teklifler satirlarinda marka olmayabiliyor — stokKodu uzerinden enrich et
      if (data?.satirlar?.length) {
        const urunMap = new Map((urunler || []).map(u => [u.stokKodu, u]))
        data = {
          ...data,
          satirlar: data.satirlar.map(s => ({
            ...s,
            marka: s.marka || urunMap.get(s.stokKodu)?.marka || '',
          })),
        }
      }
      setTeklif(data)
      // Öncelik: URL ?tip= → kaydedilmiş teklifTipi → 'standart'
      setSeciliTip(tipUrl || data?.teklifTipi || 'standart')
    })
  }, [id, tipUrl])

  if (!teklif || !seciliTip) {
    return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial' }}>Yükleniyor...</div>
  }

  // Yönetici onayı olmayan teklif: çıktı ALINABİLİR ama her sayfada
  // "TASLAK" filigranı basılır (müşteriye gönderim ayrıca kilitli — belge-paylas 403).
  const onaysiz = !musteriyeGonderilebilir(teklif)
  const durumIsim = TEKLIF_DURUM_META[tekliftenDurum(teklif)]?.isim || 'Taslak'

  const { baseTip, pacal } = tipCoz(seciliTip)
  const Cikti = ciktiMap[baseTip] || StandartCikti

  // PDF'i direkt indir — html2canvas + jsPDF, dialog acmaz.
  // Cikti elementini off-screen container'a klonla (print CSS bypass icin),
  // 794x1123 px (A4 96dpi) sabit genislik ver, capture et, multi-page PDF olarak indir.
  const pdfIndir = async () => {
    if (!ciktiRef.current) return
    setPdfYukleniyor(true)
    let klon = null
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      const A4_W = 794   // px @ 96dpi
      const A4_H = 1123

      // Cikti'yi off-screen clone et — print:none stilleri etkilemesin
      klon = ciktiRef.current.cloneNode(true)
      klon.style.position = 'fixed'
      klon.style.left = '-99999px'
      klon.style.top = '0'
      klon.style.width = A4_W + 'px'
      klon.style.background = '#fff'
      klon.style.zIndex = '-1'
      document.body.appendChild(klon)

      // Görseller yüklensin (CORS dahil)
      await new Promise(r => setTimeout(r, 300))

      const canvas = await html2canvas(klon, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: A4_W,
        windowWidth: A4_W,
      })

      const imgW = 210               // mm (A4 width)
      const imgH = (canvas.height * imgW) / canvas.width
      const pageH = 297              // mm (A4 height)

      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      const imgData = canvas.toDataURL('image/jpeg', 0.95)

      if (imgH <= pageH) {
        pdf.addImage(imgData, 'JPEG', 0, 0, imgW, imgH)
      } else {
        // Multi-page split — img'i sayfa sayfa kaydirip ekle
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
      const dosyaAd = onaysiz
        ? teklifDosyaAdi(teklif, 'pdf').replace(/\.pdf$/i, '-TASLAK.pdf')
        : teklifDosyaAdi(teklif, 'pdf')
      await dosyayiKaydet(blob, dosyaAd)
    } catch (err) {
      console.error('[PDF indir]', err)
      alert('PDF üretilirken hata: ' + (err?.message || 'bilinmeyen'))
    } finally {
      if (klon) try { document.body.removeChild(klon) } catch {}
      setPdfYukleniyor(false)
    }
  }

  const excelIndir = async () => {
    setExcelYukleniyor(true)
    try {
      const { teklifiExcelOlarakIndir } = await import('../lib/teklifExport')
      // Anlık seçilen tipi kullan (kayıttaki tip yerine)
      await teklifiExcelOlarakIndir({ ...teklif, teklifTipi: seciliTip })
    } catch (err) {
      console.error('[Excel indir]', err)
      alert('Excel üretilirken hata: ' + (err?.message || 'bilinmeyen'))
    } finally {
      setExcelYukleniyor(false)
    }
  }

  const tipBtnStil = (tip) => ({
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: seciliTip === tip ? 600 : 500,
    color: seciliTip === tip ? '#fff' : '#475569',
    background: seciliTip === tip ? '#0f172a' : 'transparent',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 120ms',
  })

  const aksiyonBtn = (bg, hoverBg) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 12px',
    fontSize: 12.5, fontWeight: 600,
    color: '#fff',
    background: bg,
    border: 'none', borderRadius: 6,
    cursor: 'pointer',
    transition: 'background 120ms, transform 80ms',
    _hover: hoverBg,
  })

  return (
    <>
      <style>{`
        @media print { .toolbar-yazdir { display: none !important; } body { padding-top: 0 !important; } }
        body { padding-top: 56px; }
        .toolbar-yazdir button:hover:not(:disabled) { filter: brightness(1.08); }
        .toolbar-yazdir button:active:not(:disabled) { transform: translateY(1px); }
      `}</style>

      {/* Tek satır üst toolbar */}
      <div
        className="no-print toolbar-yazdir"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          height: 48,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', gap: 12,
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          zIndex: 999,
        }}
      >
        {/* Sol: Şablon seçici */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Şablon
          </span>
          <div style={{
            display: 'inline-flex',
            padding: 3,
            background: '#f1f5f9',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
          }}>
            {tipSecenekleri.map(t => (
              <button key={t.value} onClick={() => setSeciliTip(t.value)} style={tipBtnStil(t.value)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sağ: Aksiyonlar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onaysiz && (
            <span
              title={`Durum: ${durumIsim} — yönetici onayı alınmadığı için çıktıya TASLAK filigranı basılır. Müşteriye gönderim onaydan sonra açılır.`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 999,
                background: '#FEF3C7', border: '1px solid #F59E0B', color: '#92400E',
                fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              }}>
              ⚠ ONAYSIZ — TASLAK filigranlı çıktı
            </span>
          )}
          <button
            onClick={() => window.print()}
            style={aksiyonBtn('#0176D3')}
            title="Yazdır / PDF"
          >
            <Printer size={14} strokeWidth={2} /> Yazdır
          </button>
          <button
            onClick={pdfIndir}
            disabled={pdfYukleniyor}
            style={{
              ...aksiyonBtn('#dc2626'),
              cursor: pdfYukleniyor ? 'wait' : 'pointer',
              opacity: pdfYukleniyor ? 0.6 : 1,
            }}
            title="PDF olarak indir"
          >
            <FileDown size={14} strokeWidth={2} /> {pdfYukleniyor ? 'Hazırlanıyor…' : 'PDF'}
          </button>
          <button
            onClick={excelIndir}
            disabled={excelYukleniyor}
            style={{
              ...aksiyonBtn('#0d9f6e'),
              cursor: excelYukleniyor ? 'wait' : 'pointer',
              opacity: excelYukleniyor ? 0.6 : 1,
            }}
            title="Excel olarak indir"
          >
            <FileSpreadsheet size={14} strokeWidth={2} /> {excelYukleniyor ? 'Hazırlanıyor…' : 'Excel'}
          </button>
          <div style={{ width: 1, height: 22, background: '#e2e8f0', margin: '0 2px' }} />
          <button
            onClick={() => window.close()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '7px 10px', fontSize: 12.5, fontWeight: 500,
              color: '#64748b',
              background: 'transparent',
              border: '1px solid #e2e8f0',
              borderRadius: 6, cursor: 'pointer',
            }}
            title="Kapat"
          >
            <X size={14} strokeWidth={2} /> Kapat
          </button>
        </div>
      </div>

      {/* Filigran ciktiRef İÇİNDE: ekranda, tarayıcı yazdırmasında ve html2canvas
          PDF indirmede aynı şekilde görünür (fixed olsaydı klonda kaybolurdu). */}
      <div ref={ciktiRef} style={{ position: 'relative' }}>
        <Cikti teklif={teklif} pacal={pacal} />
        {onaysiz && <TaslakFiligran />}
      </div>
    </>
  )
}

// Çapraz, yarı saydam TASLAK filigranı — teklif görünümünü bozmadan içeriğe
// yayılır (yüzde konumlu 8 tekrar; 1-4 sayfalık tekliflerde her sayfaya düşer).
function TaslakFiligran() {
  return (
    <div aria-hidden style={{
      position: 'absolute', inset: 0, overflow: 'hidden',
      pointerEvents: 'none', zIndex: 40, printColorAdjust: 'exact',
    }}>
      {[4, 17, 30, 43, 56, 69, 82, 94].map(top => (
        <div key={top} style={{
          position: 'absolute', top: `${top}%`, left: '50%',
          transform: 'translateX(-50%) rotate(-24deg)',
          font: '800 46px/1 Arial, sans-serif',
          letterSpacing: '0.06em', whiteSpace: 'nowrap',
          color: 'rgba(148, 163, 184, 0.16)',
          WebkitPrintColorAdjust: 'exact',
        }}>
          TASLAK — ONAYLANMAMIŞ TEKLİF
        </div>
      ))}
    </div>
  )
}
