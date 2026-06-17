// Servis Formu HTML — sunucu-taraf PDF uretimi icin (puppeteer page.setContent).
// Mobil src/templates/servisFormuHtml.js portu; sabitler inline, fotograflar
// uzak URL (puppeteer yukler, base64 gerekmez).

const tarihFormat = (iso) => {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d)) return iso
  const g = String(d.getDate()).padStart(2, '0')
  const a = String(d.getMonth() + 1).padStart(2, '0')
  return `${g}.${a}.${d.getFullYear()}`
}
const tarihSaatFormat = (iso) => {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d)) return iso
  const g = String(d.getDate()).padStart(2, '0')
  const a = String(d.getMonth() + 1).padStart(2, '0')
  const ss = String(d.getHours()).padStart(2, '0')
  const dd = String(d.getMinutes()).padStart(2, '0')
  return `${g}.${a}.${d.getFullYear()} ${ss}:${dd}`
}

const ANA_TURLER = [
  { id: 'ariza', isim: 'Arıza', ikon: '🔧', renk: '#ef4444' },
  { id: 'talep', isim: 'Talep', ikon: '📋', renk: '#3b82f6' },
  { id: 'montaj', isim: 'Montaj', ikon: '🧰', renk: '#8b5cf6' },
  { id: 'kurulum', isim: 'Kurulum', ikon: '⚙️', renk: '#0ea5e9' },
  { id: 'bakim', isim: 'Bakım', ikon: '🛠️', renk: '#f59e0b' },
  { id: 'degisim', isim: 'Değişim', ikon: '🔁', renk: '#f97316' },
  { id: 'sokum', isim: 'Söküm', ikon: '🪛', renk: '#a855f7' },
  { id: 'kesif', isim: 'Keşif', ikon: '🔍', renk: '#014486' },
  { id: 'egitim', isim: 'Eğitim', ikon: '🎓', renk: '#06b6d4' },
  { id: 'teklif', isim: 'Teklif', ikon: '💼', renk: '#10b981' },
]
const ACILIYET = [
  { id: 'dusuk', isim: 'Düşük', renk: '#6b7280', ikon: '🟢' },
  { id: 'normal', isim: 'Normal', renk: '#3b82f6', ikon: '🔵' },
  { id: 'yuksek', isim: 'Yüksek', renk: '#f59e0b', ikon: '🟡' },
  { id: 'acil', isim: 'Acil', renk: '#ef4444', ikon: '🔴' },
]
const DURUM = [
  { id: 'bekliyor', isim: 'Bekliyor', renk: '#6b7280', ikon: '⏳' },
  { id: 'inceleniyor', isim: 'İnceleniyor', renk: '#3b82f6', ikon: '🔍' },
  { id: 'atandi', isim: 'Atandı', renk: '#014486', ikon: '👤' },
  { id: 'devam_ediyor', isim: 'Devam Ediyor', renk: '#f59e0b', ikon: '🔄' },
  { id: 'tamamlandi', isim: 'Tamamlandı', renk: '#10b981', ikon: '✅' },
  { id: 'onaylandi', isim: 'Onaylandı', renk: '#059669', ikon: '🟢' },
  { id: 'reddedildi', isim: 'Reddedildi', renk: '#dc2626', ikon: '⛔' },
  { id: 'iptal', isim: 'İptal', renk: '#ef4444', ikon: '❌' },
]
const turBul = (id) => ANA_TURLER.find((t) => t.id === id)
const aciliyetBul = (id) => ACILIYET.find((a) => a.id === id)
const durumBul = (id) => DURUM.find((d) => d.id === id)

const escapeHtml = (s) =>
  String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll('\n', '<br/>')

function profilBelirle(talep) {
  const t = talep?.anaTur
  if (t === 'ariza') return { tip: 'ariza', baslik: 'ARIZA FORMU', renk: '#dc2626' }
  if (t === 'bakim') return { tip: 'bakim', baslik: 'BAKIM FORMU', renk: '#d97706' }
  return { tip: 'servis', baslik: 'SERVİS FORMU', renk: '#2563eb' }
}

const BAKIM_KONTROL = [
  'Kablo bağlantıları', 'Güç beslemesi / voltaj', 'Yazılım / Firmware güncellemesi',
  'Kayıt cihazı disk durumu', 'Ağ bağlantısı ve hız', 'Fiziksel temizlik',
  'Fan / havalandırma', 'Kamera/sensör açıları', 'Uzaktan erişim testi', 'Yedekleme kontrolü',
]

export function servisFormuHtml({ talep, malzemeler = [], logoUrl = null, fotograflar = [] }) {
  const tur = turBul(talep.anaTur)
  const aciliyet = aciliyetBul(talep.aciliyet)
  const durum = durumBul(talep.durum)
  const profil = profilBelirle(talep)

  const malzemeSatirlari = malzemeler.map((m, i) => {
    const planli = Number(m.planliMiktar ?? 0)
    const teslim = Number(m.teslimAlinanMiktar ?? 0)
    const kullanilanRaw = Number(m.kullanilanMiktar ?? 0)
    const kullanilan = kullanilanRaw > 0 ? kullanilanRaw : teslim
    return `<tr>
      <td class="center">${i + 1}</td>
      <td>${escapeHtml(m.stokKodu ?? '-')}</td>
      <td>${escapeHtml(m.stokAdi ?? m.stokKodu ?? '-')}</td>
      <td class="right">${planli}</td>
      <td class="right" style="color:#059669;font-weight:700;">${kullanilan}</td>
      <td class="center">${escapeHtml(m.birim ?? '')}</td>
    </tr>`
  }).join('')

  const notlar = (talep.notlar ?? []).map((n) => `
    <div class="not">
      <div class="not-meta">${escapeHtml(n.kullanici ?? '-')} · ${escapeHtml(tarihSaatFormat(n.tarih))}</div>
      <div class="not-metin">${escapeHtml(n.metin ?? n.icerik ?? '')}</div>
    </div>`).join('')

  const imzaSection = talep.musteriImza
    ? `<img src="${talep.musteriImza}" class="imza-img" />`
    : `<div class="imza-bos">İmza alınmadı</div>`

  const notlarMetni = Array.isArray(talep.notlar) && talep.notlar.length > 0
    ? talep.notlar.slice().sort((a, b) => new Date(b.tarih ?? 0) - new Date(a.tarih ?? 0))
        .map((n) => `• ${n.icerik ?? n.metin ?? ''}`).filter(Boolean).join('\n')
    : ''

  const tespitMudahale = `
    <div class="grid2">
      <div class="kart"><h3>Tespit</h3>
        <div class="aciklama-kutu" style="min-height:60px;background:#fff;border:1px solid #e2e8f0;border-left:none;white-space:pre-line;">${escapeHtml(talep.kokSebep ?? '').replace(/\n/g, '<br>') || '&nbsp;'}</div>
      </div>
      <div class="kart"><h3>Yapılan Müdahale</h3>
        <div class="aciklama-kutu" style="min-height:60px;background:#fff;border:1px solid #e2e8f0;border-left:none;white-space:pre-line;">${escapeHtml(talep.yapilanMudahale ?? notlarMetni).replace(/\n/g, '<br>') || '&nbsp;'}</div>
      </div>
    </div>`

  const arizaBlogu = profil.tip === 'ariza' ? `
    <div class="blok"><div class="baslik">Arıza Tanımı</div>
      <div class="aciklama-kutu" style="border-left-color:${profil.renk};min-height:60px;">${escapeHtml(talep.aciklama ?? talep.konu ?? '-')}</div>
    </div>${tespitMudahale}` : ''

  const bakimBlogu = profil.tip === 'bakim' ? `
    <div class="blok"><div class="baslik">Bakım Kontrol Listesi</div>
      <table class="kontrol-liste">${BAKIM_KONTROL.map((m, i) => `
        <tr><td style="width:22px;">${i + 1}.</td><td>${escapeHtml(m)}</td>
        <td style="width:50px;" class="center"><span class="kutucuk">✓</span></td>
        <td style="width:50px;" class="center"><span class="kutucuk">✗</span></td>
        <td style="width:120px;">Not:</td></tr>`).join('')}
      </table>
    </div>${tespitMudahale}` : ''

  const fotoSayfasi = Array.isArray(fotograflar) && fotograflar.length > 0 ? `
    <div class="foto-sayfa">
      <div class="foto-sayfa-baslik">📷 Servis Fotoğrafları</div>
      <div class="foto-sayfa-meta">${escapeHtml(talep.talepNo ?? '#' + talep.id)} · ${fotograflar.length} fotoğraf</div>
      <div class="foto-grid">${fotograflar.map((f, i) => `
        <div class="foto-item"><img src="${f.url}" />
          <div class="foto-alt">${escapeHtml(f.ad ?? 'Fotoğraf ' + (i + 1))}${f.eklenme ? ' · ' + escapeHtml(tarihSaatFormat(f.eklenme)) : ''}</div>
        </div>`).join('')}
      </div>
    </div>` : ''

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8" />
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system,"Segoe UI",Roboto,sans-serif; color:#0f172a; margin:0; padding:12mm 14mm 8mm 14mm; position:relative; font-size:11px; line-height:1.4; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .watermark { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-30deg); font-size:200px; font-weight:900; color:rgba(15,23,42,0.055); z-index:0; letter-spacing:24px; white-space:nowrap; }
  .content { position:relative; z-index:1; }
  header { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid ${profil.renk}; padding-bottom:12px; margin-bottom:14px; }
  .logo-wrap img { height:54px; object-fit:contain; }
  .logo-wrap .firma-ad { font-size:9px; color:#64748b; margin-top:2px; }
  .form-baslik { text-align:right; }
  .form-baslik h1 { margin:0; font-size:18px; font-weight:800; letter-spacing:2px; color:${profil.renk}; }
  .form-baslik .talep-no { margin-top:4px; font-size:13px; font-weight:700; color:${profil.renk}; }
  .form-baslik .tarih { font-size:10px; color:#64748b; margin-top:2px; }
  .badge-row { display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap; }
  .badge { padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700; border:1px solid; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px; }
  .kart { border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px; }
  .kart h3 { margin:0 0 8px 0; font-size:10px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.8px; border-bottom:1px solid #e2e8f0; padding-bottom:4px; }
  .satir { display:flex; padding:2px 0; }
  .satir .label { color:#64748b; width:95px; font-weight:600; flex-shrink:0; }
  .satir .deger { color:#0f172a; flex:1; word-wrap:break-word; }
  .blok { margin-bottom:14px; }
  .blok .baslik { font-size:11px; font-weight:800; color:#0f172a; text-transform:uppercase; letter-spacing:0.6px; margin-bottom:6px; padding-bottom:3px; border-bottom:1px solid #cbd5e1; }
  .aciklama-kutu { background:#f8fafc; padding:8px 10px; border-radius:6px; border-left:3px solid #2563eb; min-height:40px; }
  table.malzeme { width:100%; border-collapse:collapse; font-size:10px; }
  table.malzeme th { background:#f1f5f9; padding:6px 8px; text-align:left; font-weight:700; color:#334155; border:1px solid #cbd5e1; font-size:9px; text-transform:uppercase; }
  table.malzeme td { padding:5px 8px; border:1px solid #e2e8f0; }
  table.malzeme .center { text-align:center; } table.malzeme .right { text-align:right; }
  table.malzeme .bos { text-align:center; padding:16px; color:#94a3b8; font-style:italic; }
  .not { padding:6px 10px; border-left:3px solid #cbd5e1; margin-bottom:6px; background:#f8fafc; border-radius:4px; }
  .not-meta { font-size:9px; color:#64748b; font-weight:600; margin-bottom:2px; } .not-metin { font-size:11px; }
  table.kontrol-liste { width:100%; border-collapse:collapse; font-size:11px; }
  table.kontrol-liste td { padding:6px 8px; border-bottom:1px solid #e2e8f0; }
  table.kontrol-liste td.center { text-align:center; }
  .kutucuk { display:inline-block; width:20px; height:20px; border:1.5px solid #334155; border-radius:3px; text-align:center; line-height:16px; color:transparent; font-weight:700; }
  .imza-alani { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:14px; }
  .imza-kutu { border:1px solid #cbd5e1; border-radius:8px; padding:12px; min-height:200px; }
  .imza-kutu .imza-baslik { font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase; margin-bottom:8px; letter-spacing:0.6px; }
  .imza-kutu .imza-img { width:100%; height:130px; object-fit:contain; display:block; }
  .imza-bos { height:130px; border:1px dashed #cbd5e1; display:flex; align-items:center; justify-content:center; font-size:11px; color:#94a3b8; border-radius:4px; }
  .imza-kutu .imza-ad { margin-top:8px; padding-top:6px; border-top:1px solid #e2e8f0; font-size:10px; color:#0f172a; font-weight:600; }
  .imza-kutu .imza-ad-label { color:#64748b; font-weight:400; font-size:9px; }
  footer { margin-top:12px; padding-top:8px; border-top:1px solid #cbd5e1; font-size:9px; color:#64748b; display:flex; justify-content:space-between; }
  .foto-sayfa { margin-top:14px; page-break-inside:avoid; }
  .foto-sayfa-baslik { font-size:15px; font-weight:800; color:${profil.renk}; letter-spacing:0.6px; margin-bottom:2px; }
  .foto-sayfa-meta { font-size:10px; color:#64748b; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid ${profil.renk}; }
  .foto-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .foto-item { border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; page-break-inside:avoid; }
  .foto-item img { width:100%; height:170px; object-fit:cover; display:block; background:#f1f5f9; }
  .foto-alt { font-size:9px; color:#64748b; padding:5px 8px; border-top:1px solid #e2e8f0; }
</style></head><body>
  <div class="watermark">ZNA</div>
  <div class="content">
    <header>
      <div class="logo-wrap">
        ${logoUrl ? `<img src="${logoUrl}" />` : '<div style="font-size:24px;font-weight:900;">ZNA</div>'}
        <div class="firma-ad">ZNA Teknoloji</div>
      </div>
      <div class="form-baslik">
        <h1>${profil.baslik}</h1>
        <div class="talep-no">${escapeHtml(talep.talepNo ?? '#' + talep.id)}</div>
        <div class="tarih">Düzenlenme: ${escapeHtml(tarihSaatFormat(new Date().toISOString()))}</div>
      </div>
    </header>
    <div class="badge-row">
      ${tur ? `<span class="badge" style="color:${tur.renk};border-color:${tur.renk};background:${tur.renk}15;">${tur.isim}</span>` : ''}
      ${durum ? `<span class="badge" style="color:${durum.renk};border-color:${durum.renk};background:${durum.renk}15;">${durum.isim}</span>` : ''}
      ${aciliyet ? `<span class="badge" style="color:${aciliyet.renk};border-color:${aciliyet.renk};background:${aciliyet.renk}15;">${aciliyet.isim}</span>` : ''}
    </div>
    <div class="grid2">
      <div class="kart"><h3>Müşteri Bilgileri</h3>
        <div class="satir"><div class="label">Firma</div><div class="deger">${escapeHtml(talep.firmaAdi ?? talep.musteriAd ?? '-')}</div></div>
        <div class="satir"><div class="label">Lokasyon</div><div class="deger">${escapeHtml(talep.lokasyon ?? '-')}</div></div>
        <div class="satir"><div class="label">İlgili Kişi</div><div class="deger">${escapeHtml(talep.ilgiliKisi ?? '-')}</div></div>
        <div class="satir"><div class="label">Telefon</div><div class="deger">${escapeHtml(talep.telefon ?? '-')}</div></div>
      </div>
      <div class="kart"><h3>Servis Bilgileri</h3>
        <div class="satir"><div class="label">Talep No</div><div class="deger">${escapeHtml(talep.talepNo ?? '-')}</div></div>
        <div class="satir"><div class="label">Oluşturma</div><div class="deger">${escapeHtml(tarihSaatFormat(talep.olusturmaTarihi))}</div></div>
        <div class="satir"><div class="label">Planlı</div><div class="deger">${escapeHtml(tarihFormat(talep.planliTarih) ?? '-')}</div></div>
        <div class="satir"><div class="label">Teknisyen</div><div class="deger">${escapeHtml(talep.atananKullaniciAd ?? '-')}</div></div>
        <div class="satir"><div class="label">Cihaz</div><div class="deger">${escapeHtml(talep.cihazTuru ?? '-')}</div></div>
      </div>
    </div>
    <div class="blok"><div class="baslik">Konu</div>
      <div class="aciklama-kutu" style="border-left-color:${profil.renk};">${escapeHtml(talep.konu ?? '-')}</div>
    </div>
    ${profil.tip === 'servis' && talep.aciklama ? `<div class="blok"><div class="baslik">Açıklama</div><div class="aciklama-kutu">${escapeHtml(talep.aciklama)}</div></div>` : ''}
    ${arizaBlogu}${bakimBlogu}${profil.tip === 'servis' ? tespitMudahale : ''}
    <div class="blok"><div class="baslik">Kullanılan Malzemeler</div>
      <table class="malzeme"><thead><tr>
        <th style="width:28px;" class="center">#</th><th style="width:82px;">Stok Kodu</th><th>Ürün</th>
        <th style="width:55px;" class="right">Planlı</th><th style="width:60px;" class="right">Kullanılan</th><th style="width:48px;" class="center">Birim</th>
      </tr></thead><tbody>${malzemeSatirlari || '<tr><td colspan="6" class="bos">Malzeme kaydı yok</td></tr>'}</tbody></table>
    </div>
    ${notlar ? `<div class="blok"><div class="baslik">Yapılan İşlemler / Notlar</div>${notlar}</div>` : ''}
    <div class="imza-alani">
      <div class="imza-kutu"><div class="imza-baslik">Teknisyen</div>
        <div class="imza-bos" style="border:none;justify-content:flex-start;font-size:12px;color:#0f172a;font-weight:600;">${escapeHtml(talep.atananKullaniciAd ?? '-')}</div>
        <div class="imza-ad"><div class="imza-ad-label">Ad Soyad / Tarih</div>${escapeHtml(talep.atananKullaniciAd ?? '')} · ${escapeHtml(tarihFormat(new Date().toISOString()))}</div>
      </div>
      <div class="imza-kutu"><div class="imza-baslik">Teslim Alan / Müşteri Onayı</div>${imzaSection}
        <div class="imza-ad"><div class="imza-ad-label">Ad Soyad</div>${escapeHtml(talep.teslimAlanAd ?? talep.ilgiliKisi ?? '-')}</div>
      </div>
    </div>
    ${fotoSayfasi}
    <footer><div>ZNA Teknoloji · destek@zna.com.tr</div><div>${escapeHtml(talep.talepNo ?? '')}</div></footer>
  </div>
</body></html>`
}
