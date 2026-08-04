// Excel/tablo yapıştırmasını teklif satırlarına çeviren ayrıştırıcı.
//
// Kullanıcı Excel'den "Ürün Kodu | Miktar" sütunlarını kopyalayıp yapıştırır;
// panoya TAB ayraçlı düz metin düşer. Buradaki fonksiyonlar SAF'tır (DOM/ağ
// yok) — davranışı testle sabitlemek ve modalda birebir aynı sonucu göstermek
// için.
//
// ⭐ TASARIM KARARI: stokta olmayan kod da satır olur. Kullanıcının açık
// isteği: "Stoğumuzda bu ürünlerden olmak zorunda değil". Eşleşen üründe ad
// ve fiyat otomatik gelir, eşleşmeyende kod yazılır ve fiyat elle girilir.

/** Başlık satırı mı? ("Ürün Kodu - Article No", "Miktar", "Qty"…) */
const BASLIK_KELIMELERI = [
  'ürün', 'urun', 'kod', 'code', 'article', 'artikel',
  'miktar', 'adet', 'qty', 'quantity', 'menge',
  'açıklama', 'aciklama', 'tanım', 'tanim', 'description',
  'fiyat', 'price', 'birim',
]

const baslikSatiriMi = (parcalar) => {
  const metin = parcalar.join(' ').toLocaleLowerCase('tr')
  if (!metin.trim()) return false
  // Son parça sayıysa başlık değildir (veri satırıdır)
  if (sayiyaCevir(parcalar[parcalar.length - 1]) !== null) return false
  return BASLIK_KELIMELERI.some(k => metin.includes(k))
}

/**
 * Türkçe/İngiliz sayı biçimlerini çözer.
 *   "12"      → 12
 *   "12,5"    → 12.5      (TR ondalık)
 *   "1.234"   → 1234      (TR binlik — nokta + tam 3 hane, virgül yok)
 *   "1.5"     → 1.5       (ondalık nokta)
 *   "1.234,5" → 1234.5
 * Sayı değilse null döner (miktar mı yoksa metin mi ayrımı buna dayanır).
 */
export const sayiyaCevir = (ham) => {
  if (ham === null || ham === undefined) return null
  let s = String(ham).trim()
  if (!s) return null
  // Birim ekleri: "12 adet", "3 ad." → sayıyı ayıkla
  s = s.replace(/\s*(adet|ad\.?|pcs?|stk|unit)\s*$/i, '').trim()
  if (!/^[\d.,\s]+$/.test(s)) return null
  s = s.replace(/\s/g, '')
  if (!s) return null

  const virgulVar = s.includes(',')
  const noktaVar = s.includes('.')

  if (virgulVar && noktaVar) {
    // "1.234,5" — nokta binlik, virgül ondalık
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (virgulVar) {
    s = s.replace(',', '.')
  } else if (noktaVar) {
    // Tek nokta + tam 3 hane → binlik ayracı ("1.234" = 1234)
    const parcalar = s.split('.')
    const binlikGorunumu = parcalar.length > 1 && parcalar.slice(1).every(p => p.length === 3)
    if (binlikGorunumu) s = parcalar.join('')
  }

  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Bir satırı sütunlara böler: önce TAB, yoksa ; | , sonra çoklu boşluk. */
const sutunlaraBol = (satir) => {
  if (satir.includes('\t')) return satir.split('\t')
  if (satir.includes(';')) return satir.split(';')
  // Virgül: ondalık ayracı da olabilir — yalnız "kod, miktar" gibi
  // boşlukla desteklenmiş virgülü ayraç say
  if (/,\s/.test(satir)) return satir.split(/,\s+/)
  // 2+ boşluk = sütun ayracı (Excel'den düz metin yapıştırmada olur)
  if (/\s{2,}/.test(satir)) return satir.split(/\s{2,}/)
  // Tek boşluk: son parça sayıysa "KOD 12" biçimidir
  const parcalar = satir.trim().split(/\s+/)
  if (parcalar.length >= 2 && sayiyaCevir(parcalar[parcalar.length - 1]) !== null) {
    return [parcalar.slice(0, -1).join(' '), parcalar[parcalar.length - 1]]
  }
  return [satir]
}

/**
 * Yapıştırılan metni satır nesnelerine çevirir.
 * → [{ kod, ad, miktar, hamSatir }]
 *
 * Sütun sırası SABİT DEĞİL, içerikten çıkarılır:
 *   "KOD  12"            → kod + miktar
 *   "KOD  Ürün adı  12"  → kod + ad + miktar
 *   "KOD"                → kod, miktar 1
 * Son sütun sayıysa miktardır; ilk sütun daima koddur; aradakiler addır.
 */
export const yapistirmaAyristir = (metin) => {
  if (!metin || !String(metin).trim()) return []

  const satirlar = String(metin)
    .split(/\r\n|\r|\n/)
    .map(s => s.trim())
    .filter(Boolean)

  const sonuc = []
  satirlar.forEach((ham, i) => {
    const parcalar = sutunlaraBol(ham).map(p => p.trim()).filter(p => p !== '')
    if (parcalar.length === 0) return
    // Yalnız ilk satır başlık olabilir
    if (i === 0 && baslikSatiriMi(parcalar)) return

    let kod = parcalar[0]
    let ad = ''
    let miktar = 1

    if (parcalar.length >= 2) {
      const sonSayi = sayiyaCevir(parcalar[parcalar.length - 1])
      if (sonSayi !== null) {
        miktar = sonSayi
        if (parcalar.length >= 3) ad = parcalar.slice(1, -1).join(' ')
      } else {
        // Son sütun sayı değil → hepsi metin: ilk kod, kalanı ad
        ad = parcalar.slice(1).join(' ')
      }
    }

    kod = kod.trim()
    if (!kod) return
    // Miktar 0 veya negatifse 1'e çek — yapıştırmada boş/bozuk hücre olabilir
    if (!(miktar > 0)) miktar = 1

    sonuc.push({ kod, ad: ad.trim(), miktar, hamSatir: ham })
  })

  return sonuc
}

/**
 * Ayrıştırılan satırları stok listesiyle eşleştirir.
 * Eşleşme: stok kodu, boşluk/büyük-küçük duyarsız.
 * Eşleşmeyen satır ELENMEZ — kod ve miktarıyla eklenir (kullanıcı kararı).
 */
export const stoklaEslestir = (satirlar, stokUrunler = []) => {
  const harita = new Map()
  for (const u of stokUrunler) {
    const k = String(u.stokKodu || '').trim().toLocaleLowerCase('tr')
    if (k) harita.set(k, u)
  }
  return satirlar.map(s => {
    const urun = harita.get(String(s.kod).trim().toLocaleLowerCase('tr')) || null
    return {
      ...s,
      urun,
      eslesti: !!urun,
      // Ad önceliği: stoktaki resmî ad > yapıştırılan ad > kod
      cozulmusAd: urun?.stokAdi || s.ad || s.kod,
    }
  })
}
