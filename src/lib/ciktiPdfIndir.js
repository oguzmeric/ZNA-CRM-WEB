// html2canvas + jsPDF ile ekrandaki çıktıyı çok sayfalı PDF'e çevirir.
//
// TeklifYazdir içindeki pdfIndir'den ortak lib'e taşındı (20.08) — Teklif
// İcmali de aynı motoru kullanır. Davranış birebir korunmuştur; tek fark
// BÖLÜM desteğidir: her bölüm PDF'te YENİ SAYFADAN başlar (icmalde kapak ve
// her teklif ayrı bölümdür). Tek bölüm verilirse eski davranışla aynıdır.
//
// Dilimleme: bölüm içeriği sayfa yüksekliğinden uzunsa kesme bir satırın/
// bloğun bittiği yerden yapılır — kör kesim metni ikiye bölüyordu.

const A4_W = 794   // px @ 96dpi
const SAYFA_MM = 297
const GENISLIK_MM = 210
const KENAR_MM = 10            // sayfa üstü/altı nefes payı

/**
 * @param {HTMLElement[]} bolumler  Her biri PDF'te yeni sayfadan başlar
 * @param {string} dosyaAdi
 */
export async function bolumleriPdfIndir(bolumler, dosyaAdi) {
  const [{ default: html2canvas }, { default: jsPDF }, { dosyayiKaydet }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
    import('./dosyaIndir'),
  ])

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const mmPerPx = GENISLIK_MM / A4_W
  const sayfaPx = Math.floor((SAYFA_MM - KENAR_MM * 2) / mmPerPx)
  let ilkSayfa = true

  for (const bolum of bolumler) {
    if (!bolum) continue
    // Bölümü off-screen klonla — print:none stilleri ve sayfa scroll'u etkilemesin
    const klon = bolum.cloneNode(true)
    klon.style.position = 'fixed'
    klon.style.left = '-99999px'
    klon.style.top = '0'
    klon.style.width = A4_W + 'px'
    klon.style.background = '#fff'
    klon.style.zIndex = '-1'
    document.body.appendChild(klon)
    try {
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

      dilimler.forEach(([ust, alt]) => {
        if (!ilkSayfa) pdf.addPage()
        ilkSayfa = false
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
    } finally {
      try { document.body.removeChild(klon) } catch { /* klon zaten kaldırılmış olabilir */ }
    }
  }

  const blob = pdf.output('blob')
  await dosyayiKaydet(blob, dosyaAdi)
}
