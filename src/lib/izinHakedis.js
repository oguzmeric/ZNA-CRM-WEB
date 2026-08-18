// Yıllık ücretli izin hakedişi — TEK KAYNAK.
// 4857 sayılı İş Kanunu md. 53:
//   • 1 yıldan az kıdem            → hak doğmaz
//   • 1 yıl – 5 yıl (5 DAHİL)      → 14 gün
//   • 5 yıldan fazla – 15'ten az   → 20 gün
//   • 15 yıl ve üzeri              → 26 gün
//   • 18 yaşından küçük VEYA 50 yaşından büyük işçiye verilecek izin
//     20 günden az olamaz (yaş istisnası).
//
// ⚠️ Bu dosya saf fonksiyon tutar — DB/istemci bilmez. Ekranda ayrıca hesap
// YAPILMAZ; teklifHesap.js ve puantajHesap.js ile aynı disiplin.
// Testleri: scripts/test-izin-hakedis.mjs (npm run test:hakedis)

/** 'YYYY-MM-DD' | Date | null → Date | null. Saat dilimi kaymasını önlemek için
 *  gün başlangıcı yerine ÖĞLEN 12:00'a sabitlenir (izin gün sayımında yerleşik desen). */
export function tarihNormalle(d) {
  if (!d) return null
  const t = d instanceof Date
    ? new Date(d)
    : new Date(`${String(d).slice(0, 10)}T12:00:00`)
  return isNaN(t) ? null : t
}

/** İki tarih arasındaki tam yıl / ay / gün farkı (takvim bazlı).
 *  bitis < baslangic ise hepsi 0 döner. */
export function kidemHesapla(iseGiris, bitis = new Date()) {
  const bas = tarihNormalle(iseGiris)
  const son = tarihNormalle(bitis)
  if (!bas || !son || son < bas) return { yil: 0, ay: 0, gun: 0, gecerli: false }

  let yil = son.getFullYear() - bas.getFullYear()
  let ay = son.getMonth() - bas.getMonth()
  let gun = son.getDate() - bas.getDate()

  if (gun < 0) {
    ay -= 1
    // Bir önceki ayın gün sayısı
    const oncekiAy = new Date(son.getFullYear(), son.getMonth(), 0).getDate()
    gun += oncekiAy
  }
  if (ay < 0) { yil -= 1; ay += 12 }

  return { yil, ay, gun, gecerli: true }
}

/** Kıdem yılını okunur metne çevirir: "3 yıl 2 ay". */
export function kidemMetni(iseGiris, bitis = new Date()) {
  const k = kidemHesapla(iseGiris, bitis)
  if (!k.gecerli) return '—'
  if (k.yil === 0 && k.ay === 0) return `${k.gun} gün`
  if (k.yil === 0) return `${k.ay} ay`
  return k.ay > 0 ? `${k.yil} yıl ${k.ay} ay` : `${k.yil} yıl`
}

/** Belirli bir kıdem yılı için o yıla ait izin hakkı (gün).
 *  kidemYili: TAMAMLANMIŞ hizmet yılı (1 = ilk yılını doldurdu).
 *  yas: hakkın doğduğu andaki yaş — null ise yaş istisnası uygulanmaz. */
export function yilBasinaHak(kidemYili, yas = null) {
  if (!Number.isFinite(kidemYili) || kidemYili < 1) return 0
  let gun
  if (kidemYili <= 5) gun = 14           // 5 DAHİL
  else if (kidemYili < 15) gun = 20
  else gun = 26                          // 15 ve üzeri
  // Yaş istisnası: 18 ve küçük ya da 50 ve büyük → en az 20 gün
  if (yas != null && Number.isFinite(yas) && (yas <= 18 || yas >= 50)) {
    gun = Math.max(gun, 20)
  }
  return gun
}

/** Verilen tarihte kişinin yaşı (tam yıl). dogumTarihi yoksa null. */
export function yasHesapla(dogumTarihi, tarih = new Date()) {
  const k = kidemHesapla(dogumTarihi, tarih)
  return k.gecerli ? k.yil : null
}

/**
 * İşe girişten bugüne TOPLAM hak edilen yıllık izin (gün).
 * Her TAMAMLANMIŞ hizmet yılı için, o yılın dolduğu tarihteki kıdem ve yaşa
 * karşılık gelen gün sayısı toplanır. Devreden izinler böylece kendiliğinden
 * hesaba girer — ayrı bir "devir" alanı tutmaya gerek yoktur.
 *
 * Örnek: 3 yıllık çalışan → 14 + 14 + 14 = 42 gün.
 */
export function toplamHakEdilen(iseGiris, dogumTarihi = null, bugun = new Date()) {
  const bas = tarihNormalle(iseGiris)
  const son = tarihNormalle(bugun)
  if (!bas || !son) return 0

  const tamYil = kidemHesapla(bas, son).yil
  if (tamYil < 1) return 0

  let toplam = 0
  for (let y = 1; y <= tamYil; y++) {
    // y'inci hizmet yılının dolduğu tarih
    const hakTarihi = new Date(bas)
    hakTarihi.setFullYear(bas.getFullYear() + y)
    const yas = dogumTarihi ? yasHesapla(dogumTarihi, hakTarihi) : null
    toplam += yilBasinaHak(y, yas)
  }
  return toplam
}

/** İzin taleplerinden KULLANILMIŞ yıllık izin günü.
 *  Sadece tur='yillik' ve durum='onaylandi' sayılır — mazeret/rapor/ücretsiz
 *  yıllık hakedişten DÜŞMEZ. */
export function kullanilanYillik(talepler = []) {
  return (talepler || [])
    .filter(t => t?.tur === 'yillik' && t?.durum === 'onaylandi')
    .reduce((top, t) => top + (Number(t.gunSayisi ?? t.gun_sayisi) || 0), 0)
}

/**
 * Sicil kartının İzinler sekmesinde gösterilen hakediş özeti.
 *
 * iseGiris yoksa { gecerli: false } döner — ekran bu durumda SIFIR göstermez,
 * "işe giriş tarihi girilmemiş" uyarısı çıkarır. (Sessiz 0, İK'ya veri
 * girilmiş gibi görünürdü.)
 *
 * kalan NEGATİF olabilir (fazla kullanım) — sıfıra KIRPILMAZ, çünkü fazla
 * kullanım İK'nın görmesi gereken bir bilgidir.
 */
export function hakedisOzeti({ iseGiris, dogumTarihi = null, talepler = [], bugun = new Date() } = {}) {
  const bas = tarihNormalle(iseGiris)
  if (!bas) {
    return { gecerli: false, kidem: null, kidemMetni: '—', hakEdilen: 0, kullanilan: 0, kalan: 0, yilBasina: 0 }
  }
  const kidem = kidemHesapla(bas, bugun)
  const hakEdilen = toplamHakEdilen(bas, dogumTarihi, bugun)
  const kullanilan = kullanilanYillik(talepler)
  const yas = dogumTarihi ? yasHesapla(dogumTarihi, bugun) : null

  return {
    gecerli: true,
    kidem,
    kidemMetni: kidemMetni(bas, bugun),
    hakEdilen,
    kullanilan,
    kalan: hakEdilen - kullanilan,
    // Bu yıl için geçerli oran (bilgi amaçlı — "yılda 14 gün")
    yilBasina: yilBasinaHak(Math.max(1, kidem.yil), yas),
  }
}
