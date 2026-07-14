// Bayi sözleşmesi belge biçimlendirici — düz metin içeriği Word dokümanındaki
// yapıya çevirir: başlık, künye tablosu, bölüm başlıkları, kalın madde etiketleri,
// taraf bilgileri tabloları ve imza kutuları.
//
// Ekranda başlık üstte sabit değildir; Ctrl+P / Yazdır'da logo+no her A4 sayfanın
// üstünde, kaşe/imza şeridi altında tekrarlanır (@media print position:fixed).
// İçerik metni değişmez — biçim yalnızca görüntüleme anında giydirilir.

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const STIL = `
<style>
  .bd { font: 400 11.5pt/1.5 'Times New Roman', Georgia, serif; color: #111; }
  .bd * { box-sizing: border-box; }
  .bd-ust { display: flex; align-items: center; justify-content: space-between;
    padding: 6px 0 5px; border-bottom: 1.5px solid #1E5AA8; background: #fff; margin-bottom: 14px; }
  .bd-ust img { height: 40px; object-fit: contain; }
  .bd-ust .no { font: 700 10pt/1.25 'Times New Roman', serif; color: #1E5AA8; text-align: right; }
  .bd-ust .no span { font-weight: 400; color: #555; }
  .bd-alt { display: none; }
  .bd h1 { font-size: 14.5pt; text-align: center; margin: 10px 0 2px; letter-spacing: 0.02em; }
  .bd .altbaslik { text-align: center; font-size: 10.5pt; color: #333; margin: 0 0 14px; }
  .bd h2 { font-size: 12pt; margin: 16px 0 6px; border-bottom: 1px solid #bbb; padding-bottom: 2px; page-break-after: avoid; }
  .bd p { margin: 0 0 7px; text-align: justify; }
  .bd table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; page-break-inside: avoid; }
  .bd td { border: 1px solid #999; padding: 4px 8px; font-size: 10.5pt; vertical-align: top; }
  .bd .kunye td:first-child, .bd .taraf td:first-child { width: 190px; font-weight: 700; background: #F6F8FB; }
  .bd .taraf-baslik { font-weight: 700; font-size: 11pt; margin: 10px 0 4px; }
  .bd .imza { margin-top: 30px; display: flex; justify-content: space-between; gap: 24px; page-break-inside: avoid; }
  .bd .imza .alan { width: 47%; border: 1px solid #999; padding: 12px 14px 60px; font-size: 10.5pt; }
  @media print {
    .bd-ust { position: fixed; top: 0; left: 0; right: 0; height: 56px; margin: 0; }
    .bd-alt { display: flex; position: fixed; bottom: 0; left: 0; right: 0; height: 48px;
      justify-content: space-between; border-top: 1px solid #999; background: #fff;
      padding-top: 4px; font: 600 8.5pt/1.3 'Times New Roman', serif; color: #444; }
    .bd-icerik { margin: 70px 0 60px; }
    @page { size: A4; margin: 16mm 14mm; }
  }
</style>`

// "Anahtar : Değer" satırını ayır (ilk ':' üzerinden)
const anahtarDeger = (satir) => {
  const i = satir.indexOf(':')
  if (i < 0) return null
  return [satir.slice(0, i).trim(), satir.slice(i + 1).trim()]
}

// Düz metin sözleşmeyi bölümlerine ayır — beklenen işaretler yoksa null (fallback)
const parcala = (metin) => {
  const satirlar = (metin || '').split('\n')
  const govdeBas = satirlar.findIndex(s => /^1\. TARAFLAR/.test(s.trim()))
  if (govdeBas < 0) return null

  const baslik = satirlar[0]?.trim() || 'BAYİLİK SÖZLEŞMESİ'
  const altBaslik = satirlar[1]?.trim() || ''

  // Künye: alt başlıktan gövdeye kadar "X : Y" satırları; aradaki düz satırlar giriş paragrafı
  const kunye = []
  const giris = []
  for (let i = 2; i < govdeBas; i++) {
    const s = satirlar[i].trim()
    if (!s) continue
    const ad = anahtarDeger(s)
    if (ad && ad[0].length <= 24) kunye.push(ad)
    else giris.push(s)
  }

  const tarafBas = satirlar.findIndex(s => /^13\. TARAF/.test(s.trim()))
  const govde = satirlar.slice(govdeBas, tarafBas > 0 ? tarafBas : undefined)

  // Taraf bilgileri: ZNA / BAYİ blokları ("  Anahtar : Değer")
  const taraflar = { beyan: '', ZNA: [], BAYİ: [] }
  if (tarafBas > 0) {
    let aktif = null
    for (let i = tarafBas + 1; i < satirlar.length; i++) {
      const ham = satirlar[i]
      const s = ham.trim()
      if (!s) continue
      if (s === 'ZNA' || s === 'BAYİ') { aktif = s; continue }
      if (/^ZNA TEKNOLOJİ/.test(s)) break // imza kuyruğu — veriden yeniden kurulur
      const ad = anahtarDeger(s)
      if (aktif && ad) taraflar[aktif].push(ad)
      else if (!aktif) taraflar.beyan += (taraflar.beyan ? ' ' : '') + s
    }
  }

  const kunyeMap = Object.fromEntries(kunye)
  const znaMap = Object.fromEntries(taraflar.ZNA)
  const bayiMap = Object.fromEntries(taraflar.BAYİ)

  return { baslik, altBaslik, kunye, giris, govde, taraflar, kunyeMap, znaMap, bayiMap }
}

// Gövde satırlarını HTML'e çevir: "N. BÜYÜK BAŞLIK" → h2, "N.M. Etiket. metin" → kalın etiketli paragraf
const govdeHtml = (satirlar) => {
  const parcalar = []
  for (const ham of satirlar) {
    const s = ham.trim()
    if (!s) continue
    if (/^\d{1,2}\.\s/.test(s) && !/^\d+\.\d/.test(s)) {
      parcalar.push(`<h2>${esc(s)}</h2>`)
      continue
    }
    const m = s.match(/^(\d+\.\d+\.)\s*(.+?\.)\s(.*)$/)
    if (m && m[2].length <= 120) {
      parcalar.push(`<p><strong>${esc(m[1])} ${esc(m[2])}</strong> ${esc(m[3])}</p>`)
    } else {
      parcalar.push(`<p>${esc(s)}</p>`)
    }
  }
  return parcalar.join('\n')
}

const tarafTablo = (baslik, cifter) => !cifter.length ? '' : `
  <div class="taraf-baslik">${esc(baslik)}</div>
  <table class="taraf"><tbody>
    ${cifter.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}
  </tbody></table>`

/**
 * Belge gövdesi (style + içerik) — modal önizlemesi ve anon /p/:token doğrudan basar.
 * Yazdırma penceresi için bayiSozlesmeYazdirSayfasi ile sarılır.
 */
export const bayiBelgeHtml = (icerik, { sozlesmeNo = '', logoUrl = '/logo.jpeg' } = {}) => {
  const p = parcala(icerik)

  const ust = `
  <div class="bd-ust">
    <img src="${esc(logoUrl)}" alt="ZNA Teknoloji" />
    <div class="no">${esc(sozlesmeNo || p?.kunyeMap?.['Sözleşme No'] || '')}<br/>
      <span>Yetkili Dış Bayilik ve Deal Register Sözleşmesi</span></div>
  </div>`
  const alt = (bayiUnvan) => `
  <div class="bd-alt">
    <div>ZNA TEKNOLOJİ — Kaşe / İmza:</div>
    <div style="text-align:right">BAYİ${bayiUnvan ? ` (${esc(bayiUnvan)})` : ''} — Kaşe / İmza:</div>
  </div>`

  // Beklenen yapı yoksa: sade ama düzgün fallback (Times, yazdırma şeritli)
  if (!p) {
    return `${STIL}<div class="bd">${ust}${alt('')}
      <div class="bd-icerik"><pre style="white-space:pre-wrap;font:11.5pt/1.55 'Times New Roman',serif;margin:0">${esc(icerik || 'Sözleşme içeriği bulunamadı.')}</pre></div></div>`
  }

  const bayiUnvan = p.kunyeMap['Bayi'] || p.bayiMap['Ticari Unvan'] || ''
  const tarih = p.kunyeMap['Sözleşme Tarihi'] || ''

  return `${STIL}
<div class="bd">
  ${ust}
  ${alt(bayiUnvan)}
  <div class="bd-icerik">
    <h1>${esc(p.baslik)}</h1>
    <p class="altbaslik">${esc(p.altBaslik)}</p>

    <table class="kunye"><tbody>
      ${p.kunye.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}
    </tbody></table>

    ${p.giris.map(s => `<p>${esc(s)}</p>`).join('')}

    ${govdeHtml(p.govde)}

    <h2>13. TARAF BİLGİLERİ VE İMZALAR</h2>
    ${p.taraflar.beyan ? `<p>${esc(p.taraflar.beyan)}</p>` : ''}
    ${tarafTablo('ZNA', p.taraflar.ZNA)}
    ${tarafTablo('BAYİ', p.taraflar.BAYİ)}

    <div class="imza">
      <div class="alan"><strong>ZNA TEKNOLOJİ</strong><br/>
        ${esc(p.znaMap['Ticari Unvan'] || 'ZNA Teknoloji Bilişim Hizmetleri San. ve Tic. Ltd. Şti.')}<br/>
        Yetkili: ${esc(p.znaMap['Yetkili Kişi'] || 'Ali Uğur Aktepe')}<br/>
        Tarih: ${esc(tarih)}<br/><br/>Kaşe / İmza:</div>
      <div class="alan"><strong>BAYİ</strong><br/>
        ${esc(bayiUnvan || '—')}<br/>
        Yetkili: ${esc(p.bayiMap['Yetkili Kişi'] || '—')}<br/>
        Tarih: ${esc(tarih)}<br/><br/>Kaşe / İmza:</div>
    </div>
  </div>
</div>`
}

/** Yazdırma penceresi için tam sayfa (base + otomatik window.print) */
export const bayiSozlesmeYazdirSayfasi = (icerik, { sozlesmeNo, origin = '' } = {}) =>
  `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><base href="${origin}/">
<title>${esc(sozlesmeNo || 'Bayi Sözleşmesi')}</title></head><body style="margin:24px 28px">
${bayiBelgeHtml(icerik, { sozlesmeNo })}
<scr` + `ipt>window.onload = () => setTimeout(() => window.print(), 350)</scr` + `ipt></body></html>`
