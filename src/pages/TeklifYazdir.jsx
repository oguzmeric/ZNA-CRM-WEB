import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { teklifGetir } from '../services/teklifService'
import { stokUrunleriniGetir } from '../services/stokService'
import StandartCikti from './teklifCikti/StandartCikti'
import TrassirCikti from './teklifCikti/TrassirCikti'
import KarelCikti from './teklifCikti/KarelCikti'

const ciktiMap = {
  standart: StandartCikti,
  trassir:  TrassirCikti,
  karel:    KarelCikti,
}

const tipSecenekleri = [
  { value: 'standart', label: 'Standart' },
  { value: 'trassir',  label: 'Trassir' },
  { value: 'karel',    label: 'Karel' },
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

  const Cikti = ciktiMap[seciliTip] || StandartCikti

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

      const dosyaAdi = `Teklif_${teklif.teklifNo || teklif.id}_${seciliTip}.pdf`
      pdf.save(dosyaAdi)
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
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: seciliTip === tip ? 700 : 500,
    color: seciliTip === tip ? '#fff' : '#475569',
    background: seciliTip === tip ? '#0176D3' : '#fff',
    border: '1px solid ' + (seciliTip === tip ? '#0176D3' : '#cbd5e1'),
    cursor: 'pointer',
    transition: 'all 120ms',
  })

  return (
    <>
      {/* Format seçici — baskıda gizlenir */}
      <div className="no-print" style={{
        position: 'fixed', top: 16, left: 16,
        display: 'flex', alignItems: 'center', gap: 8,
        background: '#fff', borderRadius: 8, padding: '8px 12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 999,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginRight: 4 }}>Şablon:</span>
        <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden' }}>
          {tipSecenekleri.map((t, i) => (
            <button
              key={t.value}
              onClick={() => setSeciliTip(t.value)}
              style={{
                ...tipBtnStil(t.value),
                borderTopLeftRadius:    i === 0 ? 6 : 0,
                borderBottomLeftRadius: i === 0 ? 6 : 0,
                borderTopRightRadius:    i === tipSecenekleri.length - 1 ? 6 : 0,
                borderBottomRightRadius: i === tipSecenekleri.length - 1 ? 6 : 0,
                marginLeft: i > 0 ? -1 : 0,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Yazdır + Excel butonları — baskıda gizlenir */}
      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 999 }}>
        <button
          onClick={() => window.print()}
          style={{ background: '#0176D3', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
        >
          🖨 Yazdır / PDF
        </button>
        <button
          onClick={pdfIndir}
          disabled={pdfYukleniyor}
          style={{
            background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 18px', fontSize: 13, cursor: pdfYukleniyor ? 'wait' : 'pointer',
            fontWeight: 600, opacity: pdfYukleniyor ? 0.6 : 1,
          }}
        >
          {pdfYukleniyor ? 'Hazırlanıyor…' : '📄 PDF İndir'}
        </button>
        <button
          onClick={excelIndir}
          disabled={excelYukleniyor}
          style={{
            background: '#0d9f6e', color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 18px', fontSize: 13, cursor: excelYukleniyor ? 'wait' : 'pointer',
            fontWeight: 600, opacity: excelYukleniyor ? 0.6 : 1,
          }}
        >
          {excelYukleniyor ? 'Hazırlanıyor…' : '📊 Excel İndir'}
        </button>
        <button
          onClick={() => window.close()}
          style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}
        >
          ✕ Kapat
        </button>
      </div>

      <div ref={ciktiRef}>
        <Cikti teklif={teklif} />
      </div>
    </>
  )
}
