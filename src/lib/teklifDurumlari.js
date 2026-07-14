// Teklif durumları — spec'teki 10 durum.
// Mevcut DB kolonu: teklifler.onay_durumu (text) + teklifler.teklif_onayi (jsonb).
// Geriye uyum için: eski değerler (takipte/kabul/revizyon/vazgecildi) + yeni değerler
// yan yana yaşayacak. Mapper fonksiyonu ile spec durumuna çevirilir.

// Spec sırasına göre 10 durum.
export const TEKLIF_DURUM = {
  TASLAK:                'taslak',
  YON_ONAY_BEKLIYOR:     'yon_onay_bekliyor',
  REVIZYON_ISTENDI:      'revizyon_istendi',
  YON_ONAYLADI:          'yon_onayladi',
  MUSTERIYE_GONDERILDI:  'musteriye_gonderildi',
  MUSTERI_ONAY_BEKLIYOR: 'musteri_onay_bekliyor',
  MUSTERI_ONAYLADI:      'musteri_onayladi',
  MUSTERI_REDDETTI:      'musteri_reddetti',
  SURESI_DOLDU:          'suresi_doldu',
  SIPARISE_AKTARILDI:    'siparise_aktarildi',
}

export const TEKLIF_DURUM_META = {
  taslak:                { isim: 'Taslak',                 renk: '#94A3B8', asama: 1 },
  yon_onay_bekliyor:     { isim: 'Yönetici Onayı Bekliyor', renk: '#F59E0B', asama: 2 },
  revizyon_istendi:      { isim: 'Revizyon İstendi',        renk: '#EF4444', asama: 3 },
  yon_onayladi:          { isim: 'Yönetici Onayladı',       renk: '#10B981', asama: 4 },
  musteriye_gonderildi:  { isim: 'Müşteriye Gönderildi',    renk: '#3B82F6', asama: 5 },
  musteri_onay_bekliyor: { isim: 'Müşteri Onayı Bekliyor',  renk: '#8B5CF6', asama: 6 },
  musteri_onayladi:      { isim: 'Müşteri Onayladı',        renk: '#059669', asama: 7 },
  musteri_reddetti:      { isim: 'Müşteri Reddetti',        renk: '#DC2626', asama: 7 },
  suresi_doldu:          { isim: 'Süresi Doldu',            renk: '#71717A', asama: 8 },
  siparise_aktarildi:    { isim: 'Siparişe Aktarıldı',      renk: '#0EA5E9', asama: 9 },
}

/**
 * Geriye uyum mapper: mevcut kayıtları spec'teki 10 duruma çevirir.
 * Öncelik: teklifler.spek_durum (yeni sistem) > mapper (eski değerlerden çıkarım).
 * @param teklif — { spekDurum, onayDurumu, teklifOnayi } (camelCase JS objesi)
 * @returns {string} — TEKLIF_DURUM anahtarlarından biri
 */
export function tekliftenDurum(teklif) {
  if (!teklif) return TEKLIF_DURUM.TASLAK
  // 1) Yeni kolon (spek_durum) doluysa doğrudan kullan
  const spek = teklif.spekDurum || teklif.spek_durum || ''
  if (Object.values(TEKLIF_DURUM).includes(spek)) return spek

  // 2) Eski onay_durumu + teklif_onayi jsonb'sinden çıkarım
  const od = teklif.onayDurumu || teklif.onay_durumu || ''
  const to = teklif.teklifOnayi || teklif.teklif_onayi || {}
  const toDurum = to?.durum ?? null

  // Zaten yeni değer eski kolona düşmüş (nadir edge case)
  if (Object.values(TEKLIF_DURUM).includes(od)) return od

  if (od === 'kabul') return TEKLIF_DURUM.MUSTERI_ONAYLADI
  if (od === 'vazgecildi') return TEKLIF_DURUM.MUSTERI_REDDETTI
  if (od === 'revizyon') return TEKLIF_DURUM.REVIZYON_ISTENDI

  if (od === 'takipte') {
    if (toDurum === 'onayli') return TEKLIF_DURUM.YON_ONAYLADI
    if (toDurum === 'reddedildi') return TEKLIF_DURUM.REVIZYON_ISTENDI
    if (toDurum === 'bekliyor') return TEKLIF_DURUM.YON_ONAY_BEKLIYOR
    return TEKLIF_DURUM.YON_ONAY_BEKLIYOR
  }
  return TEKLIF_DURUM.TASLAK
}

/**
 * Spec kuralı: "Yönetici tarafından onaylanmayan teklif müşteriye gönderilemez."
 * PDF üretimi, yazdırma ve Müşteriye Gönder AYNI kapıyı kullanır — tek kaynak burası.
 * (Sunucu tarafı eşleniği: belge-paylas edge fn'deki teklif kontrolü.)
 */
export const GONDERIME_UYGUN_DURUMLAR = [
  TEKLIF_DURUM.YON_ONAYLADI,
  TEKLIF_DURUM.MUSTERIYE_GONDERILDI,
  TEKLIF_DURUM.MUSTERI_ONAY_BEKLIYOR,
  TEKLIF_DURUM.MUSTERI_ONAYLADI,
  TEKLIF_DURUM.MUSTERI_REDDETTI,
  TEKLIF_DURUM.SIPARISE_AKTARILDI,
]

export const musteriyeGonderilebilir = (teklif) =>
  GONDERIME_UYGUN_DURUMLAR.includes(tekliftenDurum(teklif))

/**
 * Paylaşım kanıtından (link gönderildi / müşteri açtı) durumu İLERİ sarma.
 *
 * Neden: "Müşteriye Gönder" akışı durumu `musteriye_gonderildi`'ye çeker ama bu
 * yalnız modal callback'i çalışınca olur. Eskiden gönderilmiş (callback yokken)
 * ya da callback'i başarısız olmuş teklifler `yon_onayladi`'da takılı kalıp
 * stepper'da "Müşteriye Gönderim"i işaretlemiyordu — oysa müşteri linki açmış.
 * Elimizde paylaşım linki kaydı varsa teklif KESİNLİKLE gönderilmiştir; müşteri
 * açtıysa artık kararı bekleniyordur. Durumu buna göre bir defalık ileri sarar.
 *
 * Yalnız İLERİ yönde ve yalnız "gönderim öncesi/gönderim" durumlarından çalışır;
 * müşteri kararı verilmiş / revizyon / terminal durumlara DOKUNMAZ (revizyon
 * bilinçli bir geri-adımdır, paylaşım linki iptal edilmeden durursa geçersiz).
 *
 * @param mevcutDurum — TEKLIF_DURUM anahtarı (tekliftenDurum çıktısı)
 * @param paylasim — paylasim_durum_ozet RPC objesi (camelCase) ya da null
 * @returns {string|null} yeni durum (değişiklik gerekiyorsa) ya da null
 */
export function paylasimdanIleriDurum(mevcutDurum, paylasim) {
  if (!paylasim) return null
  // Link kaydı varsa gönderilmiştir; ilkAcilma varsa müşteri açmıştır.
  const acildi = !!(paylasim.ilkAcilma || paylasim.sonAcilma)
  const hedef = acildi ? TEKLIF_DURUM.MUSTERI_ONAY_BEKLIYOR : TEKLIF_DURUM.MUSTERIYE_GONDERILDI

  const ilerletilebilir = [
    TEKLIF_DURUM.TASLAK,
    TEKLIF_DURUM.YON_ONAY_BEKLIYOR,
    TEKLIF_DURUM.YON_ONAYLADI,
    TEKLIF_DURUM.MUSTERIYE_GONDERILDI,
  ]
  if (!ilerletilebilir.includes(mevcutDurum)) return null

  const asamaMevcut = TEKLIF_DURUM_META[mevcutDurum]?.asama ?? 0
  const asamaHedef = TEKLIF_DURUM_META[hedef]?.asama ?? 0
  if (asamaHedef <= asamaMevcut) return null   // sadece ileri sar
  return hedef
}

/**
 * Yeni durumu DB'ye yazarken hangi kolon(lar)ı güncellemeliyiz?
 * spek_durum → yeni sistem (gerçek durum)
 * onay_durumu → eski kod okumaya devam etsin diye map ile eski değere yazıyoruz
 */
export function durumdanDbAlanlar(yeniDurum) {
  // Eski kolonun almasına izin verilen değer
  const eskiOnayDurumu = (() => {
    switch (yeniDurum) {
      case TEKLIF_DURUM.MUSTERI_ONAYLADI:
      case TEKLIF_DURUM.SIPARISE_AKTARILDI:
        return 'kabul'
      case TEKLIF_DURUM.MUSTERI_REDDETTI:
        return 'vazgecildi'
      case TEKLIF_DURUM.REVIZYON_ISTENDI:
        return 'revizyon'
      default:
        return 'takipte'
    }
  })()
  return {
    spekDurum: yeniDurum,        // yeni sistem, gerçek durum
    onayDurumu: eskiOnayDurumu,  // eski kod için map
  }
}

/**
 * Bir durumdan hangi durumlara geçilebilir? (Manuel geçiş için mantıklı seçenekler)
 * Personel modal'da bu listeyi görüp seçebilir.
 */
export function sonrakiDurumlar(mevcut) {
  const D = TEKLIF_DURUM
  switch (mevcut) {
    case D.TASLAK:
      return [D.YON_ONAY_BEKLIYOR]
    case D.YON_ONAY_BEKLIYOR:
      return [D.YON_ONAYLADI, D.REVIZYON_ISTENDI]
    case D.REVIZYON_ISTENDI:
      return [D.YON_ONAY_BEKLIYOR, D.TASLAK]
    case D.YON_ONAYLADI:
      return [D.MUSTERIYE_GONDERILDI, D.REVIZYON_ISTENDI]
    case D.MUSTERIYE_GONDERILDI:
      return [D.MUSTERI_ONAY_BEKLIYOR, D.MUSTERI_ONAYLADI, D.MUSTERI_REDDETTI, D.SURESI_DOLDU]
    case D.MUSTERI_ONAY_BEKLIYOR:
      return [D.MUSTERI_ONAYLADI, D.MUSTERI_REDDETTI, D.SURESI_DOLDU]
    case D.MUSTERI_ONAYLADI:
      return [D.SIPARISE_AKTARILDI]
    case D.MUSTERI_REDDETTI:
    case D.SURESI_DOLDU:
      return [D.REVIZYON_ISTENDI]   // yeniden hazırlansın
    case D.SIPARISE_AKTARILDI:
      return []   // terminal
    default:
      return []
  }
}

// NOT: DB'ye yeni durumu nasıl kaydedeceğimizi Adım 2c/2d'de kararlaştıracağız.
// İki seçenek var:
// A) teklifler tablosuna yeni text kolon (spek_durum) eklemek — temiz ama migration.
// B) Mevcut onay_durumu text kolonunu genişletmek (yeni değerleri kabul etsin).
//    "kabul" / "vazgecildi" / "revizyon" / "takipte" değerlerini kullanan mevcut kod
//    filtreleri bozulmasın diye mapper ile ikisini paralel tutabiliriz.
// Şimdilik sadece READ (badge gösterimi) yapıyoruz, WRITE Adım 2c'de.
