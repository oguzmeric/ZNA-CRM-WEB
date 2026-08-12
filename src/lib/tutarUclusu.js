// Fatura tutar üçlüsü: matrah (KDV hariç) · KDV · genel (KDV dahil).
//
// Tedarikçi (alış) faturası girilirken muhasebe elindeki belgeden hangi rakamı
// biliyorsa onu yazar — kimi belgede matrah, kimi belgede yalnız ödenecek tutar
// öne çıkar. Üçünü de elle doldurmak hem yavaştı hem de aritmetik hatasına
// açıktı: yazılan üç rakam birbirini tutmuyorsa kimse fark etmiyordu.
//
// Saf modül: React'e, DOM'a ve Supabase'e bağlı değil.

import { r2, sayiCoz } from './teklifHesap'

// Yürürlükteki oranlar + %18 (2023 öncesi belgelerde hâlâ karşımıza çıkıyor)
export const KDV_ORANLARI = [0, 1, 10, 18, 20]

/** Karışık oranlı fatura: otomatik hesap kapanır, üç alan da bağımsız girilir */
export const ORAN_ELLE = 'elle'

/** Matrahtan türet: KDV = matrah × oran, genel = matrah + KDV */
export const matrahtanTuret = (matrah, oran) => {
  const m = r2(sayiCoz(matrah))
  const kdv = r2(m * (sayiCoz(oran) / 100))
  return { matrah: m, kdv, genel: r2(m + kdv) }
}

/**
 * KDV DAHİL tutardan ayır: matrah = genel ÷ (1 + oran), KDV = genel − matrah.
 *
 * ⚠️ KDV çarpımla DEĞİL çıkarmayla bulunur. `matrah × oran` yuvarlandığında
 * matrah + KDV, belgedeki ödenecek tutarı 1 kuruş tutmayabilir — oysa ödenecek
 * tutar belgeden birebir alınan rakamdır, kaymaması gereken odur.
 */
export const genelToplamdanAyir = (genel, oran) => {
  const g = r2(sayiCoz(genel))
  const o = sayiCoz(oran)
  const m = r2(g / (1 + o / 100))
  return { matrah: m, kdv: r2(g - m), genel: g }
}

/** KDV elle yazıldığında: genel = matrah + KDV (seçili oran artık bağlayıcı değil) */
export const kdvdenTuret = (matrah, kdv) => {
  const m = r2(sayiCoz(matrah))
  const k = r2(sayiCoz(kdv))
  return { matrah: m, kdv: k, genel: r2(m + k) }
}

/**
 * Gerçek faturalarda kalem bazlı yuvarlama yüzünden 1-2 kuruşluk sapma
 * normaldir; bunun dışına çıkan fark giriş hatasıdır.
 */
export const SAPMA_TOLERANSI = 0.02

/** genel − (matrah + KDV). Pozitifse ödenecek tutar fazla yazılmış. */
export const ucluSapmasi = (matrah, kdv, genel) =>
  r2(sayiCoz(genel) - (sayiCoz(matrah) + sayiCoz(kdv)))

export const ucluTutarli = (matrah, kdv, genel) =>
  Math.abs(ucluSapmasi(matrah, kdv, genel)) <= SAPMA_TOLERANSI

/** Girilen tutarların ima ettiği KDV oranı — belgedekiyle karşılaştırmak için */
export const efektifOran = (matrah, kdv) => {
  const m = sayiCoz(matrah)
  return m > 0 ? r2((sayiCoz(kdv) / m) * 100) : 0
}

const met = (n) => String(n)

/**
 * Bir tutar alanına YAZILDIĞINDA formun yeni hâli. Saf: React state'ine
 * dokunmaz, bileşen dönen nesneyi uygular.
 *
 * ⚠️ YAZILAN alan HAM kalır. Her tuş vuruşunda sayıya çevirip geri basmak
 * "1429," yazan kullanıcının virgülünü siler ve ondalık girmeyi imkânsız
 * kılar — hesaplanan yalnız DİĞER alanlardır.
 *
 * ⚠️ Ödenecek tutar "elle" modunda hiç türetilmez: belgeden birebir alınan
 * rakam odur, hesap onu kaydıramaz.
 */
export const tutarAlaniYazildi = ({ hangi, deger, araToplam, kdvToplam, oran }) => {
  if (oran === ORAN_ELLE) {
    if (hangi === 'ara') {
      const u = kdvdenTuret(deger, kdvToplam)
      return { araToplam: deger, kdvToplam, genelToplam: met(u.genel), oran }
    }
    if (hangi === 'kdv') {
      const u = kdvdenTuret(araToplam, deger)
      return { araToplam, kdvToplam: deger, genelToplam: met(u.genel), oran }
    }
    return { araToplam, kdvToplam, genelToplam: deger, oran }
  }
  if (hangi === 'ara') {
    const u = matrahtanTuret(deger, oran)
    return { araToplam: deger, kdvToplam: met(u.kdv), genelToplam: met(u.genel), oran }
  }
  if (hangi === 'genel') {
    const u = genelToplamdanAyir(deger, oran)
    return { araToplam: met(u.matrah), kdvToplam: met(u.kdv), genelToplam: deger, oran }
  }
  // KDV'ye elle dokunuldu → seçili oran artık bağlayıcı değil (karışık fatura)
  const u = kdvdenTuret(araToplam, deger)
  return { araToplam, kdvToplam: deger, genelToplam: met(u.genel), oran: ORAN_ELLE }
}

/**
 * KDV oranı seçicisi değiştiğinde formun yeni hâli — `null` dönerse tutarlara
 * dokunulmaz. Elde matrah varsa ondan, yoksa ödenecek tutardan hesaplanır.
 */
export const oranDegistirildi = ({ yeniOran, araToplam, genelToplam }) => {
  if (yeniOran === ORAN_ELLE) return null
  if (sayiCoz(araToplam) > 0) {
    const u = matrahtanTuret(araToplam, yeniOran)
    return { araToplam, kdvToplam: met(u.kdv), genelToplam: met(u.genel) }
  }
  if (sayiCoz(genelToplam) > 0) {
    const u = genelToplamdanAyir(genelToplam, yeniOran)
    return { araToplam: met(u.matrah), kdvToplam: met(u.kdv), genelToplam }
  }
  return null
}

/**
 * Kayıtlı bir faturayı düzenlemeye açarken oran seçicisinin başlangıcı.
 * Tutarlar standart bir orana oturmuyorsa "elle" — yanlış oran göstermek,
 * kullanıcı başka bir alana dokunduğu anda doğru tutarları bozardı.
 */
export const oraniTahminEt = (matrah, kdv) => {
  const m = sayiCoz(matrah)
  if (!(m > 0)) return 20
  const efektif = efektifOran(m, kdv)
  const yakin = KDV_ORANLARI.find(o => Math.abs(o - efektif) < 0.05)
  return yakin === undefined ? ORAN_ELLE : yakin
}
