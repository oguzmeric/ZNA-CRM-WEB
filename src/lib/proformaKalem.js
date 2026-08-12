// Proforma kalem düzenleme — saf hesap ve doğrulama.
//
// Fatura yetkilisi, teknisyenin (ya da siparişin) girdiği kalemleri kesim
// öncesi düzeltebiliyor (mig 283). Bu dosya o ekranın çekirdeği: DOM'a,
// Supabase'e ve React'e bağlı değil, doğrudan test edilebilir.
//
// ⚠️ HESAP TEK KAYNAK: tutarlar `teklifHesap.js`'e delege edilir. Kopyalanmış
// bir formül, PDF ile Excel'i ayıran TEK-0672 vakasının kök nedeniydi; mobil
// `crm-mobile/src/lib/faturaHesap.js` de aynı kuralları izlemek zorunda.
//
// Alan adı köprüsü: `fatura_talepleri.kalemler` jsonb şeması `iskontoOran`/
// `kdvOran` kullanır, `teklifHesap` ise `iskonto`/`kdv`. Çeviri burada yapılır —
// iki şemayı ekranın içinde karıştırmak sessiz sıfırlama üretir.

import { teklifHesapla, r2 } from './teklifHesap'

// "12.000" / "1.250.000" — noktayla ayrılmış TAM üçlü gruplar. TR yazımında bu
// binlik ayracıdır. "1250.50" ve "0.5" bu kalıba UYMAZ, ondalık kalır.
const TR_BINLIK = /^-?\d{1,3}(\.\d{3})+$/

/**
 * Kullanıcının yazdığı metni sayıya çevirir. TR klavye gerçeği: "1.250,50",
 * "1250,50" ve "1250.50" aynı tutardır.
 *
 * ⚠️ `teklifHesap.sayi` düz `Number()` — virgüllü girişi NaN→0 yapar. Ekrandan
 * gelen ham string bu yüzden ÖNCE burada çözülür.
 *
 * ⚠️ "12.000" TUZAĞI: düz `parseFloat` bunu 12 okur. Fatura tutarında 12 TL ile
 * 12.000 TL arasındaki fark bir yazım tercihine bırakılamaz — noktalar tam üçlü
 * grup oluşturuyorsa binlik ayracı sayılır. Yorumun doğru olduğunu kullanıcı
 * ekrandaki canlı toplamdan görür.
 */
export const sayiCoz = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v ?? '').trim()
  if (!s) return 0
  const ham = s.includes(',') ? s.replace(/\./g, '').replace(',', '.')
    : TR_BINLIK.test(s) ? s.replace(/\./g, '')
    : s
  const n = parseFloat(ham)
  return Number.isFinite(n) ? n : 0
}

// KDV: boş bırakılırsa %20, açıkça 0 yazılırsa 0 (`|| 20` kalıbı 0'ı yutuyordu)
const kdvCoz = (v) => (v === null || v === undefined || v === '' ? 20 : sayiCoz(v))

/** Proforma kalemi → teklifHesap satır şeması */
const satiraCevir = (k) => ({
  miktar: sayiCoz(k?.miktar),
  birimFiyat: sayiCoz(k?.birimFiyat),
  iskonto: sayiCoz(k?.iskontoOran),
  kdv: kdvCoz(k?.kdvOran),
})

/**
 * Kalem listesinin toplamları. Genel iskonto YOK — proformada tek tek satır
 * fiyatı düzeltilir, toplamdan indirim yapılmaz.
 */
export const proformaHesapla = (kalemler) => {
  const h = teklifHesapla({ satirlar: (kalemler || []).map(satiraCevir), genelIskonto: 0 })
  return {
    satirlar: h.satirlar,
    araToplam: h.araToplam,
    kdvKirilimi: h.kdvKirilimi,
    kdvToplam: h.kdvToplam,
    genelToplam: h.genelToplam,
  }
}

/**
 * Ekrandaki satırı DB'ye yazılacak jsonb kalemine çevirir.
 * Alan seti `servistenTalep` / `siparistenTalep` ile birebir aynı olmalı —
 * eksik alan, `faturayiKaydet`'in satislar'a taşıdığı satırı sakatlar.
 */
export const kalemPayload = (k) => {
  const s = satiraCevir(k)
  const h = proformaHesapla([k]).satirlar[0]
  return {
    stokKodu: String(k?.stokKodu || '').trim(),
    urunAdi: String(k?.urunAdi || '').trim(),
    aciklama: String(k?.aciklama || '').trim(),
    miktar: s.miktar,
    birim: String(k?.birim || '').trim() || 'Adet',
    birimFiyat: s.birimFiyat,
    iskontoOran: h.iskontoOran,
    kdvOran: h.kdvOran,
    araToplam: h.net,
    kdvTutar: h.kdvTutar,
    satirToplam: h.toplam,
  }
}

/** Yeni satır iskeleti — ekranda "+ Satır ekle" bunu basar */
export const bosKalem = () => ({
  stokKodu: '', urunAdi: '', aciklama: '',
  miktar: '1', birim: 'Adet', birimFiyat: '', iskontoOran: '0', kdvOran: '20',
})

/**
 * DB'den gelen kalemi düzenlenebilir forma çevirir.
 * Sayılar STRING'e döner: input'a 0 basmak kullanıcıyı "0"ı silmeye zorlar,
 * boş bırakmak ise 0 kabul edilir — ikisi de aynı sonucu verir ama boş alan
 * yazmaya davet eder.
 */
export const kalemiFormaAl = (k) => ({
  stokKodu: k?.stokKodu || '',
  urunAdi: k?.urunAdi || '',
  aciklama: k?.aciklama || '',
  miktar: k?.miktar === 0 || k?.miktar ? String(k.miktar) : '1',
  birim: k?.birim || 'Adet',
  birimFiyat: Number(k?.birimFiyat) > 0 ? String(k.birimFiyat) : '',
  iskontoOran: Number(k?.iskontoOran) > 0 ? String(k.iskontoOran) : '0',
  kdvOran: k?.kdvOran === 0 || k?.kdvOran ? String(k.kdvOran) : '20',
})

/**
 * Kaydetmeden önceki kapılar. Dönen dizi BOŞSA kayıt serbesttir.
 *
 * Neden burada: aynı kurallar hem butonun `disabled` hâlini hem de servis
 * katmanının reddini belirliyor. İkisi ayrı yazılırsa ekran "kaydet" der,
 * sunucu reddeder.
 */
export const kalemleriDogrula = (kalemler) => {
  const hatalar = []
  const liste = kalemler || []
  if (liste.length === 0) {
    hatalar.push('En az bir kalem olmalı.')
    return hatalar
  }
  const adsiz = liste.filter(k => !String(k?.urunAdi || '').trim()).length
  if (adsiz > 0) hatalar.push(`${adsiz} satırda ürün/hizmet adı boş.`)

  const miktarsiz = liste.filter(k => !(sayiCoz(k?.miktar) > 0)).length
  if (miktarsiz > 0) hatalar.push(`${miktarsiz} satırda miktar sıfır veya geçersiz.`)

  const iskontoBozuk = liste.filter(k => {
    const i = sayiCoz(k?.iskontoOran)
    return i < 0 || i > 100
  }).length
  if (iskontoBozuk > 0) hatalar.push(`${iskontoBozuk} satırda iskonto oranı %0–100 aralığı dışında.`)

  const kdvBozuk = liste.filter(k => {
    const o = kdvCoz(k?.kdvOran)
    return o < 0 || o > 100
  }).length
  if (kdvBozuk > 0) hatalar.push(`${kdvBozuk} satırda KDV oranı %0–100 aralığı dışında.`)

  const negatif = liste.filter(k => sayiCoz(k?.birimFiyat) < 0).length
  if (negatif > 0) hatalar.push(`${negatif} satırda birim fiyat negatif.`)

  // Fiyatsız satır tek başına hata değil (kalem listesi hâlâ anlamlı) ama
  // TOPLAM sıfırsa fatura kesilemez — bedelsiz kapatma ayrı bir yoldur.
  if (hatalar.length === 0 && !(proformaHesapla(liste).genelToplam > 0)) {
    hatalar.push('Genel toplam sıfır. Bedel alınmıyorsa "Bakım kapsamı (bedelsiz)" yolunu kullanın.')
  }
  return hatalar
}

/**
 * Düzeltme gerçekten tutarı değiştirdi mi? Yalnız satır adı düzeltmek için
 * teknisyene "tutarınız değişti" bildirimi göndermek gürültü olur.
 */
export const tutarDegistiMi = (oncekiGenelToplam, yeniGenelToplam) =>
  r2(oncekiGenelToplam) !== r2(yeniGenelToplam)
