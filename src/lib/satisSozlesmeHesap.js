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
