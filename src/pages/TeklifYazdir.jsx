import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Printer, FileDown, FileSpreadsheet, X } from 'lucide-react'
import { teklifGetir } from '../services/teklifService'
import { stokUrunleriniGetir } from '../services/stokService'
import { musteriyeGonderilebilir, tekliftenDurum, TEKLIF_DURUM_META } from '../lib/teklifDurumlari'
import { useAuth } from '../context/AuthContext'
import { ciktiLogla } from '../services/teklifCiktiLogService'
import StandartCikti from './teklifCikti/StandartCikti'
import TrassirCikti from './teklifCikti/TrassirCikti'
import KarelCikti from './teklifCikti/KarelCikti'
import { teklifDosyaAdi } from '../lib/teklifDosyaAdi'
import { dosyayiKaydet } from '../lib/dosyaIndir'
import { tipCoz } from '../lib/teklifTemplates'
import { teklifiTlyeCevir, oranMetni } from '../lib/teklifHesap'

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
  const { kullanici } = useAuth()
  const [searchParams] = useSearchParams()
  const tipUrl = searchParams.get('tip') // form'dan kayıt yapılmadan iletilen tip
  const [teklif, setTeklif] = useState(null)
  const [seciliTip, setSeciliTip] = useState(null)
  const [excelYukleniyor, setExcelYukleniyor] = useState(false)
  const [pdfYukleniyor, setPdfYukleniyor] = useState(false)
  const [tlGoster, setTlGoster] = useState(false)
  const ciktiRef = useRef(null)
  const sonLogRef = useRef(0) // buton + beforeprint çift log olmasın

  // Ctrl+P / tarayıcı menüsünden yazdırma da loglansın (butonu atlayan yol)
  useEffect(() => {
    const f = () => {
      if (!teklif || Date.now() - sonLogRef.current < 3000) return
      sonLogRef.current = Date.now()
      ciktiLogla({ teklif, kullanici, islem: 'yazdir', taslak: !musteriyeGonderilebilir(teklif) })
    }
    window.addEventListener('beforeprint', f)
    return () => window.removeEventListener('beforeprint', f)
  }, [teklif, kullanici])

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

  // Çıktı logu: kim/ne zaman/hangi yolla aldı (mig 158) — fire-and-forget
  const logla = (islem) => {
    sonLogRef.current = Date.now()
    ciktiLogla({ teklif, kullanici, islem, taslak: onaysiz })
  }

  const { baseTip, pacal } = tipCoz(seciliTip)
  const Cikti = ciktiMap[baseTip] || StandartCikti

  // "₺ TL Göster" (13.08): dövizli teklifin çıktısı TAMAMEN TL basılır — iki
  // para birimi yan yana gösterilmez (çift kolonlu ilk deneme kafa karıştırdı,
  // geri alındı). Kayıt değişmez; dönüşüm yalnız görüntülenen kopyada.
  const dovizli = teklif.paraBirimi && teklif.paraBirimi !== 'TL'
  const kurVar = Number(teklif.dovizKuru) > 0
  const gosterilen = tlGoster && dovizli && kurVar ? teklifiTlyeCevir(teklif) : teklif

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

      const SAYFA_MM = 297           // A4 yüksekliği
      const GENISLIK_MM = 210        // A4 genişliği
      const KENAR_MM = 10            // sayfa üstü/altı nefes payı
      const mmPerPx = GENISLIK_MM / A4_W
      const sayfaPx = Math.floor((SAYFA_MM - KENAR_MM * 2) / mmPerPx)
      const olcek = canvas.width / A4_W   // html2canvas scale'i (klon genişliğine göre)
      const toplamPx = Math.round(canvas.height / olcek)

      // ⚠️ Eskiden canvas sayfa yüksekliğinden KÖR kesiliyordu; kesme noktası
      // satırın ortasına denk gelince metin ikiye bölünüyordu. Artık kesme,
      // bir satırın/bloğun bittiği yerden yapılır.
      const kokUst = klon.getBoundingClientRect().top
      const kesmeNoktalari = [...new Set(
        Array.from(klon.querySelectorAll('.teklif-sayfa, tr, .bedel-serit, .page > *'))
          .map(el => {
            const r = el.getBoundingClientRect()
            return r.height > 0 ? Math.round(r.bottom - kokUst) : null
          })
          .filter(v => v != null),
      )].sort((a, b) => a - b)

      const dilimler = []
      let bas = 0
      while (bas < toplamPx - 1) {
        let son = bas + sayfaPx
        if (son >= toplamPx) {
          son = toplamPx
        } else {
          // Sayfanın en az üçte birini dolduran en son satır sınırında kes
          const adaylar = kesmeNoktalari.filter(n => n > bas + sayfaPx * 0.35 && n <= son)
          if (adaylar.length) son = adaylar[adaylar.length - 1]
        }
        if (son <= bas) son = Math.min(bas + sayfaPx, toplamPx)  // sonsuz döngü kilidi
        dilimler.push([bas, son])
        bas = son
      }

      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      dilimler.forEach(([ust, alt], i) => {
        if (i > 0) pdf.addPage()
        const yukseklikPx = Math.round((alt - ust) * olcek)
        const dilim = document.createElement('canvas')
        dilim.width = canvas.width
        dilim.height = yukseklikPx
        const ctx = dilim.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, dilim.width, dilim.height)
        ctx.drawImage(
          canvas,
          0, Math.round(ust * olcek), canvas.width, yukseklikPx,
          0, 0, canvas.width, yukseklikPx,
        )
        pdf.addImage(
          dilim.toDataURL('image/jpeg', 0.95), 'JPEG',
          0, KENAR_MM, GENISLIK_MM, (alt - ust) * mmPerPx,
        )
      })

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
      // ⚠️ Excel EKRANDAKİ görünümü indirir: TL modundayken TL, değilken döviz.
      // PDF ile Excel'in ayrışması bilinen bir vakaydı (TEK-0672) — ikisi de
      // aynı `gosterilen` nesnesinden beslenir.
      const { teklifiExcelOlarakIndir } = await import('../lib/teklifExport')
      // Anlık seçilen tipi kullan (kayıttaki tip yerine)
      await teklifiExcelOlarakIndir({ ...gosterilen, teklifTipi: seciliTip })
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
          {/* Dövizli teklifte belgeyi TAMAMEN TL basma anahtarı (13.08).
              Kur teklif kartından gelir; girilmemişse düğme pasif. */}
          {dovizli && (
            <button
              onClick={() => kurVar && setTlGoster(v => !v)}
              disabled={!kurVar}
              title={kurVar
                ? (tlGoster
                  ? `${teklif.paraBirimi} olarak göster`
                  : `Tüm tutarları TL bas (kur: ${oranMetni(teklif.dovizKuru)})`)
                : 'Teklif kartında döviz kuru girilmemiş — önce teklifi düzenleyip kuru girin.'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', fontSize: 12.5, fontWeight: 700,
                color: tlGoster ? '#fff' : kurVar ? '#0f766e' : '#94a3b8',
                background: tlGoster ? '#0f766e' : '#fff',
                border: `1px solid ${tlGoster ? '#0f766e' : kurVar ? '#0f766e' : '#e2e8f0'}`,
                borderRadius: 6, cursor: kurVar ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
              }}
            >
              {tlGoster ? `${teklif.paraBirimi === 'EUR' ? '€' : '$'} ${teklif.paraBirimi} Göster` : '₺ TL Göster'}
            </button>
          )}
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
            onClick={() => { logla('yazdir'); window.print() }}
            style={aksiyonBtn('#0176D3')}
            title="Yazdır / PDF"
          >
            <Printer size={14} strokeWidth={2} /> Yazdır
          </button>
          <button
            onClick={() => { logla('pdf'); pdfIndir() }}
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
            onClick={() => { logla('excel'); excelIndir() }}
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

      {/* Filigran + kimlik damgası ciktiRef İÇİNDE: ekranda, tarayıcı yazdırmasında
          ve html2canvas PDF indirmede aynı şekilde görünür (fixed olsaydı klonda kaybolurdu). */}
      {/* translate="no": index.html'deki notranslate meta'sı otomatik çeviriyi
          kapatıyor ama kullanıcı sağ tık → "Çevir" derse tutarlar/başlıklar
          bozulabiliyor — belge gövdesi ayrıca işaretli. */}
      <div ref={ciktiRef} translate="no" className="notranslate" style={{ position: 'relative' }}>
        <Cikti teklif={gosterilen} pacal={pacal} />
        {/* TL modunda kur ibaresi — belge tek para birimi basar, hangi kurla
            çevrildiği tek satırla beyan edilir (ciktiRef içinde: yazdırma ve
            PDF indirmede de görünür) */}
        {tlGoster && dovizli && kurVar && (
          <div style={{
            maxWidth: 794, margin: '0 auto', padding: '0 24px 4px',
            font: '400 8.5pt/1.4 Arial, sans-serif', color: '#94a3b8',
            textAlign: 'center', background: '#fff',
          }}>
            Tutarlar 1 {teklif.paraBirimi} = {oranMetni(teklif.dovizKuru)} TL kuru esas alınarak TL olarak düzenlenmiştir.
          </div>
        )}
        {onaysiz && <TaslakFiligran />}
        {/* İzlenebilirlik damgası: dışarıda görülen çıktının kaynağı belli olsun (mig 158 loguyla eş) */}
        <div style={{
          maxWidth: 794, margin: '0 auto', padding: '2px 24px 10px',
          font: '400 8.5pt/1.4 Arial, sans-serif', color: '#94a3b8',
          textAlign: 'center', background: '#fff',
        }}>
          Bu çıktı {kullanici?.ad || '—'} tarafından {new Date().toLocaleDateString('tr-TR')}{' '}
          {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}'te
          ZNA CRM üzerinden alınmıştır.{onaysiz ? ' (TASLAK — yönetici onayı alınmamıştır)' : ''}
        </div>
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
