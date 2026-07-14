// 3.767 mevcut ürüne isimden otomatik kategori + teknik özellik atama.
// KURALLAR muhafazakâr: emin olunamayan ürün BOŞ bırakılır, mevcut manuel
// kategori_id ASLA ezilmez, özellik değerleri de mevcutları ezmez.
// Kullanım: node urun-siniflandir.cjs          → kuru çalıştırma (rapor)
//           APPLY=1 node urun-siniflandir.cjs  → uygula
const NM = 'C:/Users/MSI-LAPTOP/crm-app/.claude/worktrees/adoring-hermann-edb720/node_modules'
const { createClient } = require(NM + '/@supabase/supabase-js')
const fs = require('fs')

const KEY = process.env.SERVICE_KEY
const APPLY = process.env.APPLY === '1'
const svc = createClient('https://hcrbwxeuscfibgmchdtt.supabase.co', KEY)

const norm = (s) => String(s || '')
  .toLowerCase()
  .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
  .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
  .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/â/g, 'a')
  .replace(/,(?=\d)/g, '.')

// Hizmet/işçilik satırları ürün değil — hiç sınıflandırma (boş kalsın)
const HIZMET_MI = (m) => /(montaj|kurulum|devreye\s*alma|iscilik|isciligi|nakliye|kesif\s*bedeli|servis\s*bedeli|bakim\s*anlasmasi|danismanlik)/.test(m)

// ── Kategori kuralları — sıra önemli (özgülden genele) ──
// test(m, ad): m = ad+marka+açıklama; ad = yalnız ad+marka (özgül kurallar
// açıklamadaki yan cümlelere takılmasın — "plaka tanıma destekli NVR" gibi)
const KURALLAR = [
  // Çok özgül ifadeler önce — YALNIZ ürün adında ara
  ['Plaka Tanıma',    (m, ad) => /plaka\s*tanima|\blpr\b|\banpr\b/.test(ad)],
  ['Turnike',         (m, ad) => /turnike/.test(ad)],
  ['Bariyer',         (m, ad) => /bariyer|barrier/.test(ad)],
  ['Kartlı Geçiş',    (m, ad) => /kartli\s*gecis|gecis\s*kontrol|kart\s*okuyucu|card\s*reader|parmak\s*izi|face\s*terminal|yuz\s*tanima\s*terminal/.test(ad)],
  ['Telekomünikasyon Sistemleri', (m, ad) => /santral|\bdect\b|telefon|\bsip\b|\bfxo\b|\bfxs\b/.test(ad)],
  ['Yangın Sistemleri', (m, ad) => /yangin|duman\s*dedektor|\bsiren\b|gaz\s*dedektor/.test(ad)],

  ['Kamera Ayağı',    (m) => /(ayak|ayagi|braket|bracket|mount|dire[gk])/.test(m) && /(kamera|camera|cam\b)/.test(m)],
  ['Buat',            (m) => /\bbuat\b/.test(m)],
  // Lens: bağımsız lens ürünü — kamera göstergesi (MP/çözünürlük) varsa kameradır
  ['Lens',            (m) => /\blens\b/.test(m) && !/(kamera|camera|ipc|bullet|dome|turret|\bmp\b|megapiksel|cozunurluk)/.test(m)],
  ['Termal Kamera',   (m) => /termal|thermal/.test(m) && /(kamera|camera|cam\b|ipc)/.test(m)],
  ['PTZ Kamera',      (m) => /\bptz\b|speed\s*dome/.test(m)],
  ['Analog Kamera',   (m) => /(\bahd\b|\btvi\b|\bcvi\b|analog)/.test(m) && /(kamera|camera|cam\b)/.test(m)],
  ['IP Kamera',       (m) => /(kamera|camera|\bipc\b|\bip cam)/.test(m)],
  ['NVR',             (m) => /\bnvr\b/.test(m)],
  ['DVR',             (m) => /\bdvr\b|\bxvr\b/.test(m)],
  ['Sunucu',          (m) => /sunucu|\bserver\b/.test(m) && !/rack|kabinet/.test(m)],
  ['PoE Switch',      (m) => /\bpoe\b.*switch|switch.*\bpoe\b/.test(m)],
  ['Network Switch',  (m) => /\bswitch\b/.test(m)],
  ['Access Point',    (m) => /access\s*point|accesspoint/.test(m)],
  ['Router',          (m) => /\brouter\b|\bmodem\b/.test(m)],
  ['Patch Cord',      (m) => /patch\s*cord|patchcord/.test(m)],
  // Patch panel / pense / test cihazı kablo DEĞİL — kablo kurallarından önce ele
  ['Sarf Malzemeleri',(m) => /(patch\s*panel|pense|cakma\s*aparati|kablo\s*test)/.test(m)],
  ['Fiber Kablo',     (m) => /fiber/.test(m) && /(kablo|cable|optik)/.test(m)],
  ['Data Kablosu',    (m) => /(cat\s*5|cat5|cat\s*6|cat6|cat\s*7|cat7|\butp\b|\bftp\b|s\/ftp|sftp)/.test(m) && /kablo|cable|\bmt\b|metre|305/.test(m)],
  ['Enerji Kablosu',  (m) => /(\bnym\b|\bnyy\b|\bttr\b|\bnyaf\b|enerji\s*kablo)/.test(m)],
  ['Adaptör',         (m) => /(adaptor|adapter|power\s*supply|guc\s*kaynagi|\bpsu\b)/.test(m)],
  ['Sarf Malzemeleri',(m) => /(\bvida\b|\bdubel\b|kelepce|spiral|makaron|klemens|\bjack\b|konnektor|konektor|silikon|\bbant\b|kablo\s*kanali)/.test(m)],
]

// ── Özellik çıkarımı — kamera dalları için (tanım IP Kamera'da) ──
const kameraOzellikleri = (m) => {
  const oz = {}
  const mp = m.match(/\b([2458])\s*(mp|megapiksel|megapixel)\b/)
  if (mp) oz['Çözünürlük'] = `${mp[1]} MP`
  if (/2\.8\s*[-–]\s*12/.test(m)) oz['Lens ölçüsü'] = '2.8–12 mm'
  else {
    const lens = m.match(/\b(2\.8|3\.6|4)\s*mm\b/)
    if (lens) oz['Lens ölçüsü'] = `${lens[1]} mm`
  }
  if (/\bbullet\b/.test(m)) oz['Kamera tipi'] = 'Bullet'
  else if (/\bdome\b/.test(m)) oz['Kamera tipi'] = 'Dome'
  else if (/\bturret\b|eyeball/.test(m)) oz['Kamera tipi'] = 'Turret'
  else if (/fisheye|balik\s*gozu/.test(m)) oz['Kamera tipi'] = 'Fisheye'
  if (/motorize|motorized/.test(m)) oz['Lens tipi'] = 'Motorize lens'
  else if (/varifocal|varifokal/.test(m)) oz['Lens tipi'] = 'Varifocal lens'
  else if (/sabit\s*(lens|odak)/.test(m)) oz['Lens tipi'] = 'Sabit lens'
  if (/\bpoe\b/.test(m)) oz['PoE desteği'] = 'Evet'
  if (/\bwdr\b|dwdr/.test(m)) oz['WDR'] = 'Evet'
  if (/\bonvif\b/.test(m)) oz['ONVIF desteği'] = 'Evet'
  if (/sd\s*kart|micro\s*sd|microsd/.test(m)) oz['SD kart desteği'] = 'Evet'
  if (/mikrofon|dahili\s*ses|built[- ]?in\s*mic/.test(m)) oz['Mikrofon'] = 'Evet'
  if (/insan\s*(ve\s*arac\s*)?(ayrimi|algilama)|human\s*detect/.test(m)) oz['İnsan algılama'] = 'Evet'
  if (/arac\s*(ayrimi|algilama)|vehicle\s*detect/.test(m)) oz['Araç algılama'] = 'Evet'
  const ir = m.match(/\b(\d{2,3})\s*m(?:t|etre)?\s*ir\b/) || m.match(/\bir\s*(\d{2,3})\s*m\b/)
  if (ir) oz['Gece görüş mesafesi'] = ir[1]
  if (/ip6[678]/.test(m)) oz['IP koruma sınıfı'] = (m.match(/ip6[678]/) || [])[0].toUpperCase()
  if (/dis\s*(mekan|ortam)|outdoor/.test(m)) oz['Ortam'] = 'Dış ortam'
  else if (/ic\s*(mekan|ortam)|indoor/.test(m)) oz['Ortam'] = 'İç ortam'
  return oz
}

const switchOzellikleri = (m) => {
  const oz = {}
  const port = m.match(/\b(\d{1,2})\s*port/)
  if (port) oz['Port sayısı'] = port[1]
  if (/yonetilebilir|managed/.test(m) && !/unmanaged|yonetilemez/.test(m)) oz['Yönetim'] = 'Yönetilebilir'
  if (/gigabit|\bgbe\b|10\/100\/1000/.test(m)) oz['Gigabit desteği'] = 'Evet'
  return oz
}

;(async () => {
  // Kategoriler + özellik tanımları
  const { data: katlar } = await svc.from('stok_kategoriler').select('id, ad')
  const katId = new Map(katlar.map(k => [k.ad, k.id]))
  const { data: tanimlar } = await svc.from('stok_kategori_ozellikler').select('id, kategori_id, ad, tip, secenekler')
  const tanimBul = (kategoriId, ad) => tanimlar.find(t => t.kategori_id === kategoriId && t.ad === ad)

  // Tüm ürünler (sayfalı)
  const urunler = []
  for (let off = 0; ; off += 1000) {
    const { data } = await svc.from('stok_urunler')
      .select('id, stok_kodu, stok_adi, marka, aciklama, kategori_id')
      .order('id').range(off, off + 999)
    urunler.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  console.log(`Toplam ürün: ${urunler.length} (kategorili: ${urunler.filter(u => u.kategori_id).length})`)

  // Sınıflandır
  const atamalar = []       // { id, stok_kodu, ad, kategori, ozellikler }
  const sayac = new Map()
  let eslesmedi = 0
  for (const u of urunler) {
    if (u.kategori_id) continue  // manuel atama — dokunma
    const m = ' ' + norm(`${u.stok_adi} ${u.marka || ''} ${u.aciklama || ''}`) + ' '
    const mAd = ' ' + norm(`${u.stok_adi} ${u.marka || ''}`) + ' '
    if (HIZMET_MI(mAd)) { eslesmedi++; continue }  // hizmet satırı — ürün değil
    let kategori = null
    for (const [ad, test] of KURALLAR) {
      if (test(m, mAd)) { kategori = ad; break }
    }
    if (!kategori) { eslesmedi++; continue }
    const kid = katId.get(kategori)
    if (!kid) continue

    // Özellikler — yalnız IP Kamera (tanımlar orada) + switch'ler
    let ozellikler = {}
    if (kategori === 'IP Kamera') ozellikler = kameraOzellikleri(m)
    else if (kategori === 'Network Switch' || kategori === 'PoE Switch') ozellikler = switchOzellikleri(m)

    atamalar.push({ id: u.id, stok_kodu: u.stok_kodu, ad: u.stok_adi, kategori, kid, ozellikler })
    sayac.set(kategori, (sayac.get(kategori) || 0) + 1)
  }

  console.log(`\nAtanacak: ${atamalar.length} · Eşleşmeyen (boş kalacak): ${eslesmedi}`)
  console.log('\nKategori dağılımı:')
  for (const [k, n] of [...sayac.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${k}`)
  }
  const ozellikliSayi = atamalar.filter(a => Object.keys(a.ozellikler).length > 0).length
  const toplamOzellik = atamalar.reduce((t, a) => t + Object.keys(a.ozellikler).length, 0)
  console.log(`\nÖzellik çıkarılan ürün: ${ozellikliSayi} · Toplam özellik değeri: ${toplamOzellik}`)

  // Örnekler (kategori başına 2)
  console.log('\nÖrnekler:')
  const gosterildi = new Set()
  for (const a of atamalar) {
    const say = gosterildi.has(a.kategori) ? 1 : 0
    if ([...atamalar.filter(x => x.kategori === a.kategori)].indexOf(a) > 1) continue
    if (!gosterildi.has(a.kategori + '2')) {
      const ozStr = Object.entries(a.ozellikler).map(([k, v]) => `${k}=${v}`).join(', ')
      console.log(`  [${a.kategori}] ${a.ad.slice(0, 70)}${ozStr ? '  →  ' + ozStr : ''}`)
      gosterildi.add(gosterildi.has(a.kategori) ? a.kategori + '2' : a.kategori)
    }
  }

  // Log dosyası (geri alma için tam liste)
  fs.writeFileSync(__dirname + '/siniflandirma-log.json', JSON.stringify(atamalar, null, 1))
  console.log(`\nTam liste: siniflandirma-log.json (${atamalar.length} kayıt — geri alma referansı)`)

  if (!APPLY) { console.log('\nKURU ÇALIŞTIRMA — uygulanmadı. APPLY=1 ile uygula.'); return }

  // ── UYGULA ──
  console.log('\nUygulanıyor...')
  // Kategori güncellemeleri — kategori bazında toplu update
  const grup = new Map()
  for (const a of atamalar) {
    if (!grup.has(a.kid)) grup.set(a.kid, [])
    grup.get(a.kid).push(a.id)
  }
  for (const [kid, ids] of grup) {
    for (let i = 0; i < ids.length; i += 500) {
      const parca = ids.slice(i, i + 500)
      const { error } = await svc.from('stok_urunler')
        .update({ kategori_id: kid })
        .in('id', parca)
        .is('kategori_id', null)  // güvence: hâlâ boş olanlar
      if (error) { console.error('kategori update hata:', error.message); process.exit(1) }
    }
  }
  console.log('Kategoriler yazıldı.')

  // Özellik değerleri — upsert (mevcut manuel değer ezilmez: ignoreDuplicates)
  const satirlar = []
  for (const a of atamalar) {
    for (const [ozAd, deger] of Object.entries(a.ozellikler)) {
      const t = tanimBul(a.kid, ozAd)
      if (!t) continue
      satirlar.push({ urun_id: a.id, ozellik_id: t.id, deger: String(deger) })
    }
  }
  for (let i = 0; i < satirlar.length; i += 500) {
    const { error } = await svc.from('stok_urun_ozellikler')
      .upsert(satirlar.slice(i, i + 500), { onConflict: 'urun_id,ozellik_id', ignoreDuplicates: true })
    if (error) { console.error('özellik upsert hata:', error.message); process.exit(1) }
  }
  console.log(`Özellik değerleri yazıldı: ${satirlar.length}`)

  // Doğrulama
  const { count: kategorili } = await svc.from('stok_urunler').select('id', { count: 'exact', head: true }).not('kategori_id', 'is', null)
  const { count: ozellikSayisi } = await svc.from('stok_urun_ozellikler').select('id', { count: 'exact', head: true })
  console.log(`\nDoğrulama: kategorili ürün=${kategorili}, toplam özellik kaydı=${ozellikSayisi}`)
})().catch(e => { console.error('HATA:', e.message); process.exit(1) })
