// ZNA antetli PERSONEL İZİN TALEP FORMU — talep verisinden otomatik dolar.
// Keşif raporu şablon desenleri: thead/tfoot antetli kağıt (her sayfada antet+dip),
// @page margin:0 (tarayıcı URL/tarih eki basamaz), logo ${origin}/logo.jpeg.
import { IZIN_TURLERI } from '../services/ikService'

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fmtT = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'
const fmtTS = (t) => t ? new Date(t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

// Bitişten sonraki ilk iş günü (Cmt/Paz atla) — "işe dönüş tarihi"
const iseDonus = (bitis) => {
  if (!bitis) return null
  const d = new Date(bitis + 'T12:00:00')
  do { d.setDate(d.getDate() + 1) } while (d.getDay() === 0 || d.getDay() === 6)
  return d
}

// talep: ikService camelCase kaydı; kisi: { ad, unvan } (talep sahibinin bilgileri)
export function izinFormuHtml(talep, kisi) {
  const logo = `${window.location.origin}/logo.jpeg`
  const turlar = IZIN_TURLERI.map(t => {
    const secili = t.id === talep.tur
    return `<span class="tur ${secili ? 'sec' : ''}"><span class="kutu">${secili ? '✕' : '&nbsp;'}</span>${esc(t.isim)}</span>`
  }).join('')
  const donus = iseDonus(talep.bitis)
  const onayli = talep.durum === 'onaylandi'
  const red = talep.durum === 'reddedildi'

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>İzin Talep Formu — ${esc(kisi?.ad || '')}</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { font: 12.5px/1.6 -apple-system, system-ui, "Segoe UI", sans-serif; color: #1a2332; padding: 26px 30px; }
  .sheet { width: 100%; border-collapse: collapse; }
  .sheet > thead > tr > td, .sheet > tbody > tr > td, .sheet > tfoot > tr > td { padding: 0; border: none; vertical-align: top; }
  .top-space { height: 0; }
  .antet { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #014486; padding-bottom: 12px; }
  .antet img { height: 46px; width: auto; }
  .antet .marka { flex: 1; }
  .antet .marka b { display: block; font-size: 18px; font-weight: 800; color: #014486; letter-spacing: .3px; }
  .antet .marka span { font-size: 10.5px; font-weight: 700; color: #64748b; letter-spacing: 2.5px; }
  .antet .no { text-align: right; font-size: 11px; color: #64748b; }
  .antet .no b { display: block; font-size: 14px; color: #1a2332; font-weight: 800; }
  h2 { font-size: 12.5px; margin: 18px 0 8px; padding: 5px 10px; background: #eef3f8; border-left: 4px solid #014486; color: #014486; font-weight: 800; letter-spacing: .3px; }
  table.b { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.b td { border: 1px solid #cbd5e1; padding: 8px 10px; }
  table.b td.l { width: 32%; background: #f8fafc; color: #475569; font-weight: 700; }
  .turlar { display: flex; flex-wrap: wrap; gap: 8px 18px; padding: 10px 4px; }
  .tur { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: #475569; }
  .tur.sec { color: #014486; font-weight: 800; }
  .kutu { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border: 1.5px solid #64748b; border-radius: 3px; font-size: 11px; font-weight: 800; line-height: 1; }
  .tur.sec .kutu { border-color: #014486; color: #014486; }
  .metin { white-space: pre-wrap; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; min-height: 52px; font-size: 12px; background: #fff; }
  .durum { display: inline-block; padding: 3px 12px; border-radius: 999px; font-weight: 800; font-size: 11.5px; }
  .durum.onay { background: #dcfce7; color: #15803d; }
  .durum.red { background: #fee2e2; color: #b91c1c; }
  .durum.bek { background: #fef9c3; color: #a16207; }
  .imza { display: flex; justify-content: space-between; gap: 60px; margin-top: 46px; break-inside: avoid; page-break-inside: avoid; }
  .imza > div { flex: 1; border-top: 1.5px solid #334155; padding-top: 6px; font-size: 11px; color: #64748b; text-align: center; }
  .imza b { display: block; color: #1a2332; font-size: 12px; margin-top: 2px; }
  .foot { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 9.5px; color: #94a3b8; text-align: center; line-height: 1.5; }
  .foot b { color: #014486; }
  @media print {
    @page { margin: 0; } /* tarayıcının URL/tarih ekini kaldırır */
    body { padding: 0; }
    h2 { break-after: avoid; }
    .sheet > tbody > tr > td { padding: 0 14mm; }
    .top-space { height: 12mm; }
    .foot { margin-top: 0; padding: 4mm 14mm 6mm; background: #fff; }
  }
</style></head><body>
<table class="sheet">
<thead><tr><td><div class="top-space"></div></td></tr></thead>
<tbody><tr><td>
<div class="antet">
  <img src="${logo}" alt="ZNA" onerror="this.style.display='none'">
  <div class="marka"><b>ZNA TEKNOLOJİ</b><span>PERSONEL İZİN TALEP FORMU</span></div>
  <div class="no"><b>İZN-${String(talep.id || '').padStart(5, '0')}</b>Talep: ${esc(fmtTS(talep.olusturmaTarih))}</div>
</div>

<h2>PERSONEL BİLGİLERİ</h2>
<table class="b">
  <tr><td class="l">Adı Soyadı</td><td>${esc(kisi?.ad || '—')}</td></tr>
  ${kisi?.unvan ? `<tr><td class="l">Görevi / Ünvanı</td><td>${esc(kisi.unvan)}</td></tr>` : ''}
</table>

<h2>İZİN BİLGİLERİ</h2>
<div class="turlar">${turlar}</div>
<table class="b">
  <tr><td class="l">İzin Başlangıç Tarihi</td><td>${esc(fmtT(talep.baslangic))}</td></tr>
  <tr><td class="l">İzin Bitiş Tarihi</td><td>${esc(fmtT(talep.bitis))}</td></tr>
  <tr><td class="l">İzin Süresi (İş Günü)</td><td><b>${esc(talep.gunSayisi)} gün</b></td></tr>
  <tr><td class="l">İşe Dönüş Tarihi</td><td>${donus ? donus.toLocaleDateString('tr-TR') : '—'}</td></tr>
</table>

<h2>AÇIKLAMA</h2>
<div class="metin">${esc(talep.aciklama || '')}</div>

<h2>ONAY BİLGİLERİ</h2>
<table class="b">
  <tr><td class="l">Durum</td><td>
    ${onayli ? '<span class="durum onay">ONAYLANDI</span>'
      : red ? '<span class="durum red">REDDEDİLDİ</span>'
      : '<span class="durum bek">ONAY BEKLİYOR</span>'}
  </td></tr>
  ${talep.onaylayanAd ? `<tr><td class="l">Onaylayan</td><td>${esc(talep.onaylayanAd)}</td></tr>` : ''}
  ${talep.onayTarihi ? `<tr><td class="l">Karar Tarihi</td><td>${esc(fmtTS(talep.onayTarihi))}</td></tr>` : ''}
  ${talep.kararNotu ? `<tr><td class="l">Karar Notu</td><td>${esc(talep.kararNotu)}</td></tr>` : ''}
</table>

<div class="imza">
  <div>Talep Eden<b>${esc(kisi?.ad || '')}</b>İmza</div>
  <div>Onaylayan (İK)<b>${esc(talep.onaylayanAd || '')}</b>İmza</div>
</div>
</td></tr></tbody>
<tfoot><tr><td>
<div class="foot"><b>ZNA TEKNOLOJİ BİLİŞİM HİZ. SAN. VE TİC. LTD. ŞTİ.</b> · znateknoloji.com<br>Bu form ZNA Teknoloji CRM sistemi üzerinden ${esc(new Date().toLocaleString('tr-TR'))} tarihinde oluşturulmuştur.</div>
</td></tr></tfoot>
</table>
</body></html>`
}

// Formu yeni pencerede aç + yazdırma diyaloğunu tetikle
export function izinFormuYazdir(talep, kisi) {
  const html = izinFormuHtml(talep, kisi)
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (!w) return false
  w.document.write(html + `<script>window.onload = () => setTimeout(() => window.print(), 500)<\/script>`)
  w.document.close()
  return true
}
