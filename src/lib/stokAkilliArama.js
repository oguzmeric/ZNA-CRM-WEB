// Stok v2 Faz 3 — Akıllı ürün arama çözümleyicisi.
// "2 MP 2.8 lens dome kamera" gibi serbest metni deterministik olarak
// { kategoriId, ozellikFiltre, kalan } yapısına çevirir. AI yok — sinonim
// sözlüğü + kategori/özellik tanımlarından üretilen varyant indeksi.
//
// Spec eşleştirmeleri: 2MP = 2 mp = 2 megapiksel = iki megapiksel;
// 2.8 = 2,8 = 2.8 mm = 2.8 lens; poe = PoE = power over ethernet.
import { trNormalize } from './trSearch'

// Bir dal + tüm alt dallarının id seti. stokKategoriService'teki kopyanın
// saf hali — lib katmanı servis (→ supabase client) import etmesin diye.
const dalKapsami = (kategoriler, id) => {
  const set = new Set([id])
  const cocuklar = new Map()
  for (const k of kategoriler || []) {
    if (k.ustId == null) continue
    if (!cocuklar.has(k.ustId)) cocuklar.set(k.ustId, [])
    cocuklar.get(k.ustId).push(k)
  }
  const kuyruk = [id]
  while (kuyruk.length) {
    const su = kuyruk.shift()
    for (const c of cocuklar.get(su) || []) {
      if (!set.has(c.id)) { set.add(c.id); kuyruk.push(c.id) }
    }
  }
  return set
}

// Yazıyla sayılar (megapiksel vb. için)
const SAYI_ADLARI = {
  bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10,
}

// Sorgu ön-normalizasyonu: TR fold + birim/sinonim birleştirme
export const sorguNormalize = (metin) => {
  let s = ' ' + trNormalize(metin) + ' '
  s = s.replace(/,(?=\d)/g, '.')                       // 2,8 → 2.8
  s = s.replace(/(\d)\s*[–—]\s*(\d)/g, '$1-$2')        // 2.8–12 → 2.8-12
  s = s.replace(/(\d)([a-z])/g, '$1 $2')               // 2mp → 2 mp, 2.8mm → 2.8 mm
  s = s.replace(/power\s*over\s*ethernet/g, 'poe')
  s = s.replace(/mega\s*piksel|megapixel|megapiksel/g, 'mp')
  // "iki mp" → "2 mp"
  for (const [ad, n] of Object.entries(SAYI_ADLARI)) {
    s = s.replace(new RegExp(`\\b${ad}\\s+mp\\b`, 'g'), `${n} mp`)
  }
  return s.replace(/\s+/g, ' ').trim()
}

// Kategori alias'ları — kategori adı normalize edilmiş halinin dışındaki
// yaygın söyleyişler. Değer: kategori adı (stok_kategoriler.ad ile eşleşir).
const KATEGORI_ALIAS = {
  'kamera': 'Kamera Sistemleri',
  'ip kamera': 'IP Kamera',
  'analog kamera': 'Analog Kamera',
  'termal kamera': 'Termal Kamera',
  'ptz kamera': 'PTZ Kamera',
  'switch': 'Network Switch',
  'poe switch': 'PoE Switch',
  'access point': 'Access Point',
  'ap': 'Access Point',
  'kayit cihazi': 'Kayıt Sistemleri',
  'gecis kontrol': 'Geçiş Kontrol Sistemleri',
  'kablo': 'Kablolama',
}

// evet_hayir özellik adları için anahtar kelime türetme:
// 'PoE desteği' → 'poe'; 'Yapay zekâ desteği' → 'yapay zeka' (+el ile 'ai')
const EH_EK_ALIAS = {
  'yapay zeka': ['ai'],
  'ses': ['sesli'],
  'mikrofon': ['mikrofonlu'],
}

// Bir seçim seçeneğinin arama varyantlarını üret (normalize edilmiş).
// Örn "2 MP" → ['2 mp']; "2.8 mm" → ['2.8 mm', '2.8 lens', '2.8'];
// "Dome" → ['dome']; "İç/Dış" → ['ic/dis', 'ic dis'].
const secenekVaryantlari = (secenek, ozellikAd) => {
  const n = sorguNormalize(secenek)
  const out = new Set([n])
  const adN = trNormalize(ozellikAd)
  if (adN.includes('lens') && /^[\d.]+(-[\d.]+)?\s*mm$/.test(n)) {
    const sayi = n.replace(/\s*mm$/, '')
    out.add(`${sayi} lens`)
    out.add(sayi)                       // çıplak "2.8" — kamera bağlamında lens sayılır
  }
  if (n.includes('/')) out.add(n.replace(/\//g, ' '))
  return Array.from(out)
}

// evet_hayir özelliği için anahtar kelimeler
const ehAnahtarlari = (ozellikAd) => {
  const n = trNormalize(ozellikAd).replace(/\s*(destegi|destekli)\s*$/, '').trim()
  const out = new Set([n])
  for (const [kok, ekler] of Object.entries(EH_EK_ALIAS)) {
    if (n === kok) ekler.forEach(e => out.add(e))
  }
  return Array.from(out)
}

/**
 * Serbest metin sorgusunu çözümle.
 * @param metin       kullanıcının yazdığı arama
 * @param kategoriler stokKategoriService.kategorileriGetir çıktısı
 * @param tanimlar    stokOzellikService.ozellikTanimlariGetir çıktısı
 * @returns {{ kategoriId, kategoriAd, ozellikFiltre: {ozellikId: deger},
 *             rozetler: [{tip,etiket}], kalan: string, akilli: boolean }}
 */
export const sorguCozumle = (metin, kategoriler = [], tanimlar = []) => {
  let s = ' ' + sorguNormalize(metin) + ' '
  const rozetler = []
  let kategoriId = null
  let kategoriAd = null

  // 1) Kategori tespiti — alias + kategori adları, en uzun eşleşme önce
  const adaylar = []
  for (const [alias, hedefAd] of Object.entries(KATEGORI_ALIAS)) {
    const k = kategoriler.find(x => x.ad === hedefAd && x.aktif !== false)
    if (k) adaylar.push({ anahtar: alias, kat: k })
  }
  for (const k of kategoriler) {
    if (k.aktif === false) continue
    adaylar.push({ anahtar: trNormalize(k.ad), kat: k })
  }
  adaylar.sort((a, b) => b.anahtar.length - a.anahtar.length)
  for (const { anahtar, kat } of adaylar) {
    if (s.includes(` ${anahtar} `)) {
      kategoriId = kat.id
      kategoriAd = kat.ad
      s = s.replace(` ${anahtar} `, ' ')
      rozetler.push({ tip: 'kategori', etiket: kat.ad })
      break
    }
  }

  // 2) Özellik eşleştirme — kategori tespit edildiyse o dalın kapsamındaki
  // tanımlar önceliklidir; edilmediyse tüm aktif tanımlar denenir.
  let kapsamTanimlar = tanimlar.filter(t => t.aktif !== false)
  if (kategoriId) {
    const kapsam = dalKapsami(kategoriler, kategoriId)
    // ata zinciri: kategorinin üstlerinde tanımlı özellikler de geçerli
    const katMap = new Map(kategoriler.map(k => [k.id, k]))
    let ust = katMap.get(kategoriId)
    let guard = 0
    while (ust && guard < 10) { kapsam.add(ust.id); ust = ust.ustId != null ? katMap.get(ust.ustId) : null; guard++ }
    kapsamTanimlar = kapsamTanimlar.filter(t => kapsam.has(t.kategoriId))
  }

  const ozellikFiltre = {}
  // Seçim özellikleri — varyantlar uzundan kısaya (önce "2.8 mm", sonra "2.8")
  const secimVaryantlar = []
  for (const t of kapsamTanimlar) {
    if (t.tip === 'secim') {
      for (const sec of t.secenekler || []) {
        for (const v of secenekVaryantlari(sec, t.ad)) {
          // Çıplak sayı varyantı ("2.8") yalnız kategori bağlamı varken güvenli
          if (/^[\d.]+(-[\d.]+)?$/.test(v) && !kategoriId) continue
          secimVaryantlar.push({ v, tanim: t, deger: sec })
        }
      }
    }
  }
  secimVaryantlar.sort((a, b) => b.v.length - a.v.length)
  for (const { v, tanim, deger } of secimVaryantlar) {
    if (ozellikFiltre[tanim.id]) continue  // bu özellik zaten eşleşti
    if (s.includes(` ${v} `)) {
      ozellikFiltre[tanim.id] = deger
      s = s.replace(` ${v} `, ' ')
      rozetler.push({ tip: 'ozellik', etiket: `${tanim.ad}: ${deger}` })
    }
  }
  // Evet/Hayır özellikleri — anahtar kelime geçiyorsa "Evet"
  for (const t of kapsamTanimlar) {
    if (t.tip !== 'evet_hayir' || ozellikFiltre[t.id]) continue
    for (const anahtar of ehAnahtarlari(t.ad)) {
      if (anahtar.length >= 2 && s.includes(` ${anahtar} `)) {
        ozellikFiltre[t.id] = 'Evet'
        s = s.replace(` ${anahtar} `, ' ')
        rozetler.push({ tip: 'ozellik', etiket: `${t.ad}: Evet` })
        break
      }
    }
  }

  // 3) Kalan metin — genel dolgu kelimeleri at
  const kalan = s.replace(/\b(lens|urun|urunler)\b/g, ' ').replace(/\s+/g, ' ').trim()

  return {
    kategoriId, kategoriAd, ozellikFiltre, rozetler, kalan,
    akilli: rozetler.length > 0,
  }
}

/**
 * Bir ürün çözümlenen sorguyla eşleşiyor mu?
 * @param urun          stok ürünü (camelCase)
 * @param cozum         sorguCozumle çıktısı
 * @param kategoriler   kategori listesi
 * @param urunOzellikMap Map<urunId, Map<ozellikId, deger>> — null ise özellik şartı atlanır
 * @param metinAra      (urun, kalanMetin) => boolean — kalan metin için arayan fonksiyon
 */
export const urunEslesiyorMu = (urun, cozum, kategoriler, urunOzellikMap, metinAra) => {
  if (cozum.kategoriId) {
    const kapsam = dalKapsami(kategoriler, cozum.kategoriId)
    if (!kapsam.has(urun.kategoriId)) return false
  }
  const filtreler = Object.entries(cozum.ozellikFiltre)
  if (filtreler.length > 0) {
    if (!urunOzellikMap) return false  // değerler yüklenmeden özellik şartı sağlanamaz
    const uMap = urunOzellikMap.get(urun.id)
    if (!uMap) return false
    for (const [oid, deger] of filtreler) {
      if (uMap.get(Number(oid)) !== deger) return false
    }
  }
  if (cozum.kalan && metinAra) return metinAra(urun, cozum.kalan)
  return true
}
