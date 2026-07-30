// Satış sözleşmesi otomatik hesap motoru (spec §3):
//   Vade farkı   = Ana toplam × aylık vade oranı × vade ayı (vade günü / 30)
//   Damga vergisi = (Ana toplam + vade farkı) × damga oranı (binde 9,48 = 0.00948)
//   Nihai toplam = Ana + vade farkı + damga − iskonto + yuvarlama
// Ana toplam KDV DAHİL tutardır (teklif genel toplamı × 1.20 önerilir; manuel da girilebilir).

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

export const sozlesmeHesapla = ({ anaToplam, vadeGunu, vadeOrani, damgaOrani, damgaDahil, iskonto, yuvarlama }) => {
  const ana = Number(anaToplam) || 0
  const vadeAy = (Number(vadeGunu) || 0) / 30
  const vadeFarki = r2(ana * ((Number(vadeOrani) || 0) / 100) * vadeAy)
  const damgaVergisi = damgaDahil === false ? 0 : r2((ana + vadeFarki) * (Number(damgaOrani) || 0))
  const nihaiToplam = r2(ana + vadeFarki + damgaVergisi - (Number(iskonto) || 0) + (Number(yuvarlama) || 0))
  return { anaToplam: r2(ana), vadeFarki, damgaVergisi, nihaiToplam }
}

// Kur farkı takibi (spec §10):
//   Çek düzenleme kurundan alınan TL tutar ile vade/tahsil günü kurundaki
//   karşılık arasındaki SATICI ALEYHİNE fark faturalanır.
// Örnek: 18.000 USD, düzenleme 40 ₺ (çek 720.000 ₺), tahsil 43 ₺ → 774.000 − 720.000 = 54.000 ₺
export const kurFarkiHesapla = ({ dovizTutar, duzenlemeKuru, tahsilKuru, cekTutarTl }) => {
  const usd = Number(dovizTutar) || 0
  const dKur = Number(duzenlemeKuru) || 0
  const tKur = Number(tahsilKuru) || 0
  const cekTl = Number(cekTutarTl) || r2(usd * dKur)
  const vadeDegeriTl = r2(usd * tKur)
  const fark = r2(vadeDegeriTl - cekTl)
  return {
    cekTutarTl: r2(cekTl),
    vadeDegeriTl,
    kurFarkiTl: fark,
    saticiAleyhine: fark > 0, // pozitifse ZNA aleyhine → fatura edilir
  }
}

export const PARA_SEMBOL = { TL: '₺', USD: '$', EUR: '€' }

export const paraFmt = (n, birim = 'TL') =>
  `${(Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${PARA_SEMBOL[birim] || birim}`

// ---------- Parçalı ödeme planı (mig 247) ----------
// Tek satırlık "ödeme tipi + vade günü" gerçek anlaşmaları taşımıyordu:
// "%30 nakit ön ödeme, kalanı 60 ve 90 gün vadeli çek" gibi planlar satır satır girilir.

export const ODEME_SATIR_TIPLERI = [
  { id: 'nakit',       isim: 'Nakit' },
  { id: 'havale',      isim: 'Havale / EFT' },
  { id: 'kredi_karti', isim: 'Kredi Kartı' },
  { id: 'cek',         isim: 'Çek' },
  { id: 'senet',       isim: 'Senet' },
]

export const odemeSatirIsim = (id) => ODEME_SATIR_TIPLERI.find(t => t.id === id)?.isim || id || '—'

export const BOS_ODEME_SATIRI = {
  tip: 'nakit', yuzde: '', tutar: '', vadeGunu: 0, vadeTarihi: '',
  banka: '', belgeNo: '', aciklama: '',
}

// Kullanıcının sık kullandığı anlaşma kalıpları — tek tıkla plan kurulur.
export const ODEME_PLANI_SABLONLARI = [
  {
    id: 'p30_cek_60_90',
    isim: '%30 Peşin + 60/90 Gün Çek',
    satirlar: [
      { tip: 'nakit', yuzde: 30, vadeGunu: 0,  aciklama: 'Sözleşme imzasında ön ödeme' },
      { tip: 'cek',   yuzde: 35, vadeGunu: 60 },
      { tip: 'cek',   yuzde: 35, vadeGunu: 90 },
    ],
  },
  {
    id: 'p40_cek_60_120',
    isim: '%40 Peşin + 60/120 Gün Çek',
    satirlar: [
      { tip: 'nakit', yuzde: 40, vadeGunu: 0,   aciklama: 'Sözleşme imzasında ön ödeme' },
      { tip: 'cek',   yuzde: 30, vadeGunu: 60 },
      { tip: 'cek',   yuzde: 30, vadeGunu: 120 },
    ],
  },
  {
    id: 'p50_havale_30',
    isim: '%50 Peşin + 30 Gün Havale',
    satirlar: [
      { tip: 'havale', yuzde: 50, vadeGunu: 0, aciklama: 'Sipariş onayında' },
      { tip: 'havale', yuzde: 50, vadeGunu: 30, aciklama: 'Teslimden sonra' },
    ],
  },
  {
    id: 'esit3',
    isim: '3 Eşit Taksit (0 / 30 / 60 gün)',
    satirlar: [
      { tip: 'havale', yuzde: 34, vadeGunu: 0 },
      { tip: 'havale', yuzde: 33, vadeGunu: 30 },
      { tip: 'havale', yuzde: 33, vadeGunu: 60 },
    ],
  },
  {
    id: 'pesin_avans_teslim',
    isim: '%50 Avans + %40 Sevkiyat + %10 Devreye Alma',
    satirlar: [
      { tip: 'havale', yuzde: 50, vadeGunu: 0,  aciklama: 'Avans' },
      { tip: 'havale', yuzde: 40, vadeGunu: 30, aciklama: 'Sevkiyat öncesi' },
      { tip: 'havale', yuzde: 10, vadeGunu: 60, aciklama: 'Devreye alma sonrası' },
    ],
  },
]

/**
 * Plan satırlarını tutar/yüzde bakımından tamamlar ve toplamı denetler.
 * Yüzde girilmişse tutar ondan türetilir; yalnız tutar girilmişse yüzde geri hesaplanır.
 * Toplam bedelle fark varsa `dengeli: false` döner — form uyarı gösterir, kayıt engellenmez
 * (yuvarlama/özel anlaşma nedeniyle kasıtlı fark olabilir).
 */
export const odemePlaniHesapla = (plan, toplamBedel) => {
  const toplam = Number(toplamBedel) || 0
  const satirlar = (Array.isArray(plan) ? plan : []).map((s, i) => {
    const yuzdeHam = Number(s.yuzde)
    const tutarHam = Number(s.tutar)
    const yuzdeVar = Number.isFinite(yuzdeHam) && yuzdeHam > 0
    const tutarVar = Number.isFinite(tutarHam) && tutarHam > 0
    const tutar = tutarVar ? r2(tutarHam) : (yuzdeVar ? r2(toplam * yuzdeHam / 100) : 0)
    const yuzde = yuzdeVar ? yuzdeHam : (toplam > 0 && tutar ? r2(tutar / toplam * 100) : 0)
    return { ...s, sira: i + 1, tutar, yuzde, vadeGunu: Number(s.vadeGunu) || 0 }
  })
  const planToplam = r2(satirlar.reduce((a, s) => a + s.tutar, 0))
  const fark = r2(toplam - planToplam)
  return {
    satirlar,
    planToplam,
    fark,
    // 1 ₺ altı sapma yuvarlamadan gelir, uyarıya değmez
    dengeli: Math.abs(fark) < 1,
    agirlikliVade: agirlikliVadeGunu(satirlar),
  }
}

/**
 * Tutarla ağırlıklandırılmış ortalama vade günü.
 * %30 peşin + %35 60 gün + %35 90 gün → 0,3×0 + 0,35×60 + 0,35×90 = 53 gün.
 * Vade farkı bu tek sayı üzerinden hesaplanabilir (form "Ağırlıklı vadeyi uygula" der).
 */
export const agirlikliVadeGunu = (satirlar) => {
  const liste = Array.isArray(satirlar) ? satirlar : []
  const toplam = liste.reduce((a, s) => a + (Number(s.tutar) || 0), 0)
  if (!toplam) return 0
  const agirlikli = liste.reduce((a, s) => a + (Number(s.tutar) || 0) * (Number(s.vadeGunu) || 0), 0)
  return Math.round(agirlikli / toplam)
}

/** Planda çek/senet var mı — evrak listesi ve çek maddeleri buna bakar. */
export const planCekliMi = (plan) =>
  (Array.isArray(plan) ? plan : []).some(s => s.tip === 'cek' || s.tip === 'senet')
