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
 * @param teklif — { onayDurumu, teklifOnayi } (camelCase JS objesi)
 * @returns {string} — TEKLIF_DURUM anahtarlarından biri
 */
export function tekliftenDurum(teklif) {
  if (!teklif) return TEKLIF_DURUM.TASLAK
  const od = teklif.onayDurumu || teklif.onay_durumu || ''
  const to = teklif.teklifOnayi || teklif.teklif_onayi || {}
  const toDurum = to?.durum || to?.durum === '' ? to.durum : null

  // Zaten yeni değer varsa doğrudan kullan
  if (Object.values(TEKLIF_DURUM).includes(od)) return od

  // Eski değerler → yeni sistem
  if (od === 'kabul') return TEKLIF_DURUM.MUSTERI_ONAYLADI
  if (od === 'vazgecildi') return TEKLIF_DURUM.MUSTERI_REDDETTI
  if (od === 'revizyon') return TEKLIF_DURUM.REVIZYON_ISTENDI

  // 'takipte' + yönetici onay durumu:
  if (od === 'takipte') {
    if (toDurum === 'onayli') return TEKLIF_DURUM.YON_ONAYLADI
    if (toDurum === 'reddedildi') return TEKLIF_DURUM.REVIZYON_ISTENDI
    if (toDurum === 'bekliyor') return TEKLIF_DURUM.YON_ONAY_BEKLIYOR
    return TEKLIF_DURUM.YON_ONAY_BEKLIYOR
  }
  return TEKLIF_DURUM.TASLAK
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
