/**
 * Teklif benzerlik algoritması
 *
 * Bir tekilifi diğer tekliflere karşı karşılaştırır ve benzerlik skoru üretir.
 * Dört faktöre bakar:
 *   1. Ürün seti (Jaccard similarity) — en ağır ağırlıkla
 *   2. Konu benzerliği (normalize edilmiş string)
 *   3. Genel toplam yakınlığı
 *   4. Tarih yakınlığı (ağırlık azaltıcı olarak eskidikçe)
 *
 * Çıktı: { teklif, skor (0-100), detay: { urun, konu, tutar, tarih } }
 */

const TR_NORM = (s) =>
  String(s || '').toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Stok kodu set'i
const urunSet = (teklif) => {
  const satirlar = Array.isArray(teklif.satirlar) ? teklif.satirlar : []
  const set = new Set()
  satirlar.forEach(s => {
    const k = String(s.stokKodu || s.stokAdi || '').trim().toLowerCase()
    if (k) set.add(k)
  })
  return set
}

// Jaccard Similarity = |A ∩ B| / |A ∪ B|
const jaccard = (a, b) => {
  if (a.size === 0 || b.size === 0) return 0
  let kesisim = 0
  for (const x of a) if (b.has(x)) kesisim++
  const birlesim = a.size + b.size - kesisim
  return birlesim === 0 ? 0 : kesisim / birlesim
}

// String benzerlik (kelime bazlı Jaccard)
const konuBenzerlik = (a, b) => {
  const sa = new Set(TR_NORM(a).split(' ').filter(w => w.length > 2))
  const sb = new Set(TR_NORM(b).split(' ').filter(w => w.length > 2))
  return jaccard(sa, sb)
}

// Tutar yakınlığı: Aynı ise 1, ±%20 ise ~0.5, %100 farklı ise 0
const tutarBenzerlik = (a, b) => {
  const sa = Number(a) || 0
  const sb = Number(b) || 0
  if (sa === 0 || sb === 0) return 0
  const min = Math.min(sa, sb)
  const max = Math.max(sa, sb)
  return min / max
}

// Tarih yakınlığı: Aynı gün 1.0, 30 gün ~0.5, 180 gün ~0
const tarihYakinlik = (a, b) => {
  if (!a || !b) return 0
  const fark = Math.abs(new Date(a) - new Date(b)) / (1000 * 60 * 60 * 24)
  if (fark === 0) return 1
  if (fark > 365) return 0
  return Math.max(0, 1 - (fark / 365))
}

/**
 * İki teklifin benzerlik skoru (0-100)
 */
export function teklifBenzerlikSkoru(yeniTeklif, eskiTeklif) {
  const uA = urunSet(yeniTeklif)
  const uB = urunSet(eskiTeklif)
  const urunSkor = jaccard(uA, uB)                   // 0-1
  const konuSkor = konuBenzerlik(yeniTeklif.konu, eskiTeklif.konu)
  const tutarSkor = tutarBenzerlik(yeniTeklif.genelToplam, eskiTeklif.genelToplam)
  const tarihSkor = tarihYakinlik(yeniTeklif.tarih || new Date().toISOString(), eskiTeklif.tarih)

  // Ağırlıklar: ürünler en önemli
  const agırlıklar = {
    urun: 0.55,
    konu: 0.20,
    tutar: 0.15,
    tarih: 0.10,
  }

  const toplam =
    urunSkor * agırlıklar.urun +
    konuSkor * agırlıklar.konu +
    tutarSkor * agırlıklar.tutar +
    tarihSkor * agırlıklar.tarih

  return {
    skor: Math.round(toplam * 100),
    detay: {
      urun: Math.round(urunSkor * 100),
      konu: Math.round(konuSkor * 100),
      tutar: Math.round(tutarSkor * 100),
      tarih: Math.round(tarihSkor * 100),
      ortakUrunSayisi: [...uA].filter(x => uB.has(x)).length,
      yeniUrunSayisi: uA.size,
    },
  }
}

/**
 * Benzer teklifleri bulur ve skoruna göre sıralar.
 *
 * @param {Object} yeni - Kaydedilecek teklif
 * @param {Array} mevcut - DB'deki tüm teklifler
 * @param {Object} opts - { esik: 50, hariç: [teklifId], max: 5 }
 * @returns Array<{ teklif, skor, detay }>
 */
export function benzerTeklifleriBul(yeni, mevcut, opts = {}) {
  const { esik = 50, haric = [], max = 5 } = opts
  const haricSet = new Set(haric.map(String))

  const uA = urunSet(yeni)
  if (uA.size === 0) return []  // Yeni teklifte ürün yoksa kontrol yapma

  return (mevcut || [])
    .filter(t => !haricSet.has(String(t.id)))
    .map(t => ({ teklif: t, ...teklifBenzerlikSkoru(yeni, t) }))
    .filter(r => r.skor >= esik)
    .sort((a, b) => b.skor - a.skor)
    .slice(0, max)
}
