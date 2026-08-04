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

// ─── Eşleştirme ──────────────────────────────────────────────────────────────
//
// ⚠️ ZNA stokunda `stokKodu` iç sayaçtır ("STK00505"); kullanıcının Excel'den
// yapıştırdığı ÜRETİCİ MODEL KODU ise çoğunlukla `stokAdi` alanında durur
// ("VTH2622GW-W", "DS-2CE76D0T-ITPFS"). 2599 üründen 2574'ü STK önekli, barkodu
// dolu olan 1, tedarikçi ürün kodu dolu olan 0. Bu yüzden yalnız stokKodu'na
// bakan eşleştirme pratikte HİÇ tutmaz — birden çok kanal denenir.

/** Birebir karşılaştırma: yalnız kırp + TR küçük harf (ayraçlar KORUNUR). */
const duzNormalize = (ham) => String(ham ?? '').trim().toLocaleLowerCase('tr')

/**
 * Gevşek karşılaştırma: ayraçlar ve boşluklar da atılır.
 * ⚠️ Tek başına kullanılmaz — "VTH2621GW-P" ile "VTH2621G-WP" aynı anahtara
 * düşer ve bunlar FARKLI ürünlerdir. Önce birebir eşleşme denenir.
 */
const kodNormalize = (ham) => String(ham ?? '')
  .toLocaleLowerCase('tr')
  .replace(/[\s\-_./\\]/g, '')

/** Model kodu görünümlü jeton mu? (hem harf hem rakam, 4+ karakter) */
const modelJetonuMu = (n) => n.length >= 4 && /[0-9]/.test(n) && /[a-zçğıöşü]/.test(n)

/** Ürün adını jetonlara böler ("Hikvision DS-KD9203-E6 Terminal" → …) */
const adJetonlari = (ad) => String(ad ?? '')
  .split(/[\s,;()[\]{}/|]+/)
  .map(kodNormalize)
  .filter(modelJetonuMu)

const anahtarEkle = (harita, anahtar, urun) => {
  if (!anahtar) return
  const mevcut = harita.get(anahtar)
  if (!mevcut) harita.set(anahtar, [urun])
  else if (!mevcut.includes(urun)) mevcut.push(urun)
}

/** Eşleşme kanalları — sırayla denenir, ilk dolu sonuç kazanır. */
export const ESLESME_KAYNAKLARI = {
  kod: 'Stok kodu',
  ad: 'Ürün adı',
  barkod: 'Barkod / tedarikçi kodu',
  adIci: 'Ad içinde geçiyor',
  secim: 'Elle seçildi',
}

/**
 * Ayrıştırılan satırları stok listesiyle eşleştirir.
 * Eşleşmeyen satır ELENMEZ — kod ve miktarıyla eklenir (kullanıcı kararı).
 *
 * Dönen her satırda:
 *   urun            eşleşen stok kartı (yoksa null)
 *   eslesti         tek aday bulundu mu
 *   belirsiz        birden çok aday var — otomatik seçilmez, kullanıcı seçer
 *   adaylar         belirsizken seçilebilecek ürünler
 *   eslesmeKaynagi  hangi kanal tuttu (ESLESME_KAYNAKLARI anahtarı)
 */
export const stoklaEslestir = (satirlar, stokUrunler = []) => {
  // "duz" = birebir (ayraçlı), "gevsek" = ayraçsız
  const kodDuz = new Map(); const kodGevsek = new Map()
  const adDuz = new Map(); const adGevsek = new Map()
  const barkodDuz = new Map(); const barkodGevsek = new Map()
  const jetonHarita = new Map()

  for (const u of stokUrunler) {
    anahtarEkle(kodDuz, duzNormalize(u.stokKodu), u)
    anahtarEkle(kodGevsek, kodNormalize(u.stokKodu), u)
    anahtarEkle(adDuz, duzNormalize(u.stokAdi), u)
    anahtarEkle(adGevsek, kodNormalize(u.stokAdi), u)
    for (const alan of [u.barkod, u.tedarikciUrunKodu]) {
      anahtarEkle(barkodDuz, duzNormalize(alan), u)
      anahtarEkle(barkodGevsek, kodNormalize(alan), u)
    }
    for (const j of adJetonlari(u.stokAdi)) anahtarEkle(jetonHarita, j, u)
  }

  return satirlar.map(s => {
    const kodD = duzNormalize(s.kod); const kodN = kodNormalize(s.kod)
    const adD = duzNormalize(s.ad); const adN = kodNormalize(s.ad)

    // Sıra önemli: birebir eşleşmeler önce, gevşek sonra, "ad içinde" en sonda.
    const denemeler = [
      ['kod', kodDuz.get(kodD)],
      ['ad', adDuz.get(kodD)],
      ['barkod', barkodDuz.get(kodD)],
      // Excel'de ayrı bir ad sütunu varsa o da kimlik olabilir
      ['ad', adD && adD !== kodD ? adDuz.get(adD) : undefined],
      ['kod', kodGevsek.get(kodN)],
      ['ad', adGevsek.get(kodN)],
      ['barkod', barkodGevsek.get(kodN)],
      ['ad', adN && adN !== kodN ? adGevsek.get(adN) : undefined],
      ['adIci', modelJetonuMu(kodN) ? jetonHarita.get(kodN) : undefined],
    ]

    let adaylar = []
    let kaynak = null
    for (const [ad, bulunan] of denemeler) {
      if (bulunan?.length) { adaylar = bulunan; kaynak = ad; break }
    }

    const urun = adaylar.length === 1 ? adaylar[0] : null
    return {
      ...s,
      urun,
      eslesti: !!urun,
      belirsiz: adaylar.length > 1,
      adaylar,
      eslesmeKaynagi: urun ? kaynak : null,
      // Ad önceliği: stoktaki resmî ad > yapıştırılan ad > kod
      cozulmusAd: urun?.stokAdi || s.ad || s.kod,
    }
  })
}
