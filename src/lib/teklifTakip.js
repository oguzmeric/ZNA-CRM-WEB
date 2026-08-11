// Teklif takip çekirdeği — "açık teklif" tanımı, yaşlandırma kovaları ve
// sonuçlandırma kuralları TEK yerde.
//
// Neden var: 11.08.2026 ölçümünde canlıda 911 açık teklif (₺25,1M) bulundu;
// 525'i (₺17,4M) 31-90 gündür bekliyordu ve hiçbir ekranda görünmüyordu.
// Son 180 günün tekliflerinin %89'u ne kabul ne vazgeçildi — açılıyor,
// kapanmıyordu. Sekmelerde de `bekliyor` durumu hiç yoktu: 482 teklif yalnız
// "Tümü"de görünüyordu.
//
// ⚠️ Sayaçlar ve liste AYNI fonksiyonlardan beslenmeli. Rozet bir kümeden,
// liste başka kümeden hesaplanınca kullanıcı "37 yazıyor ama liste boş" diyor
// (Görevler ve Servis Talepleri'nde aynı hata yaşandı).

/** Sonuçlanmış sayılan durumlar — bunlar takip kuyruğunda görünmez */
export const KAPALI_DURUMLAR = ['kabul', 'vazgecildi', 'iptal']

/** Açık = henüz sonuçlanmamış. Boş/bilinmeyen durum da AÇIK sayılır:
 *  gözden kaçmasın, kuyrukta dursun. */
export const teklifAcikMi = (t) => !KAPALI_DURUMLAR.includes(t?.onayDurumu)

/** Teklifin referans tarihi — teklif tarihi yoksa oluşturma damgası */
export const teklifTarihi = (t) => {
  const ham = t?.tarih || t?.olusturmaTarih
  if (!ham) return null
  const d = new Date(ham)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Bugüne göre yaş (gün). Tarihsizde null. */
export const teklifYasi = (t, simdi = new Date()) => {
  const d = teklifTarihi(t)
  if (!d) return null
  return Math.floor((simdi - d) / 86400000)
}

/**
 * Yaşlandırma kovaları. `esik` alt sınır (gün, dahil), sıralama yukarıdan aşağı.
 * ⚠️ Kovalar TÜM yaşları kapsamak zorunda — biri düşerse teklif hiçbir kutuda
 * görünmez ve tam da gizlenmesini istemediğimiz kayıt kaybolur.
 */
export const YAS_KOVALARI = [
  { id: '0_7',   etiket: '0-7 gün',   esik: 0,  ton: 'var(--text-secondary)' },
  { id: '8_30',  etiket: '8-30 gün',  esik: 8,  ton: 'var(--text-secondary)' },
  { id: '31_90', etiket: '31-90 gün', esik: 31, ton: 'var(--warning)' },
  { id: '90_',   etiket: '90+ gün',   esik: 91, ton: 'var(--danger)' },
]

/** Yaşa karşılık gelen kova id'si; tarihsiz teklif için null */
export const yasKovasi = (yas) => {
  if (yas == null) return null
  for (let i = YAS_KOVALARI.length - 1; i >= 0; i--) {
    if (yas >= YAS_KOVALARI[i].esik) return YAS_KOVALARI[i].id
  }
  return YAS_KOVALARI[0].id
}

const sayi = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Açık tekliflerin yaş kırılımı: her kovada adet + tutar.
 * Tarihi olmayan açık teklifler `tarihsiz` kovasında toplanır — sessizce
 * yok sayılmazlar (canlıda teklif tarihi boş kayıtlar var).
 */
export const yaslandirmaOzeti = (teklifler, simdi = new Date()) => {
  const acik = (teklifler || []).filter(teklifAcikMi)
  const bos = () => ({ adet: 0, tutar: 0 })
  const kovalar = Object.fromEntries(YAS_KOVALARI.map(k => [k.id, bos()]))
  const tarihsiz = bos()

  for (const t of acik) {
    const hedef = kovalar[yasKovasi(teklifYasi(t, simdi))] || tarihsiz
    hedef.adet += 1
    hedef.tutar += sayi(t.genelToplam)
  }

  const toplamAdet = acik.length
  const toplamTutar = acik.reduce((s, t) => s + sayi(t.genelToplam), 0)
  return { kovalar, tarihsiz, toplamAdet, toplamTutar }
}

/** Bir teklif belirli kovaya düşüyor mu — liste filtresi bu fonksiyonu kullanır */
export const kovayaGiriyorMu = (t, kovaId, simdi = new Date()) => {
  if (!teklifAcikMi(t)) return false
  const yas = teklifYasi(t, simdi)
  if (kovaId === 'tarihsiz') return yas == null
  return yasKovasi(yas) === kovaId
}

/** Kişi bazlı açık teklif yükü — kimin üzerinde ne kadar iş birikmiş */
export const kisiBazliAcik = (teklifler, simdi = new Date(), limit = 6) => {
  const harita = new Map()
  for (const t of (teklifler || []).filter(teklifAcikMi)) {
    const ad = t.olusturanAd || t.hazirlayan || '(atanmamış)'
    const kayit = harita.get(ad) || { kisi: ad, adet: 0, tutar: 0, enEskiGun: 0 }
    kayit.adet += 1
    kayit.tutar += sayi(t.genelToplam)
    const yas = teklifYasi(t, simdi)
    if (yas != null && yas > kayit.enEskiGun) kayit.enEskiGun = yas
    harita.set(ad, kayit)
  }
  return [...harita.values()].sort((a, b) => b.adet - a.adet).slice(0, limit)
}

/** ₺25.144.331 → "₺25,1M" · ₺6.193.644 → "₺6,2M" · ₺840.000 → "₺840B" */
export const kisaTutar = (n) => {
  const v = sayi(n)
  if (Math.abs(v) >= 1_000_000) return `₺${(v / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}M`
  if (Math.abs(v) >= 1_000) return `₺${Math.round(v / 1_000).toLocaleString('tr-TR')}B`
  return `₺${v.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`
}
