import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cokluBildirimEkle } from './bildirimService'

// İlgili personel ID'leri — koda gömülü (zamanla DB tablosuna taşınabilir)
const FERDI_ID = 16    // Teknik Müdür — her servis talebinde haberdar olmalı
const OGUZ_ID  = 2     // Sadece Trassir ile ilgili taleplerde

// Trassir keyword'i yakala (case-insensitive, talebin konusunda/açıklamasında/kategorisinde)
const trassirIcerirMi = (talep) => {
  const metin = [
    talep?.konu, talep?.aciklama, talep?.altKategori, talep?.alt_kategori,
    talep?.cihazTuru, talep?.cihaz_turu, talep?.anaTur, talep?.ana_tur,
  ].filter(Boolean).join(' ').toLowerCase()
  return /trassir/i.test(metin)
}

// Yeni servis talebi için bildirim alıcı ID listesi.
// Kural:
//  - Tüm aktif ZNA personeli (admin sayılır)
//  - Ferdi Kalkan her zaman
//  - Oğuz Meriç sadece Trassir keyword'lü taleplerde
// Talebi oluşturan kişi listede ise çıkarılır (kendi bildirimini almasın).
export const servisTalebiBildirimAlicilari = async (talep, olusturanId = null) => {
  const aliciSet = new Set()

  // 1. Tüm ZNA personeli (pasif olmayanlar)
  const { data: znaPersonel } = await supabase
    .from('kullanicilar')
    .select('id, durum')
    .eq('tip', 'zna')
    .neq('durum', 'pasif')
  for (const k of (znaPersonel || [])) aliciSet.add(k.id)

  // 2. Ferdi'yi her durumda ekle (varsa)
  aliciSet.add(FERDI_ID)

  // 3. Oğuz'u sadece Trassir ile ilgili taleplerde tut
  if (!trassirIcerirMi(talep)) {
    aliciSet.delete(OGUZ_ID)
  }

  // 4. Kendi oluşturduğun talebin bildirimini sen alma
  if (olusturanId) aliciSet.delete(Number(olusturanId))

  return Array.from(aliciSet)
}

// Yeni servis talebi → ilgili kişilere bildirim gönder.
// RPC fonksiyonu (servis_talebi_bildirim_olustur, SECURITY DEFINER) kullanır —
// RLS bypass eder, müşteri portal kullanıcısı da kendi haricindeki personele
// bildirim oluşturabilir.
// Best-effort: hata olursa talep yine de geçerli, sadece log düşer.
export const servisTalebiBildirimGonder = async (talep, olusturanId = null) => {
  if (!talep?.id) return { gonderildi: 0 }
  try {
    const { data, error } = await supabase.rpc('servis_talebi_bildirim_olustur', {
      p_talep_id: talep.id,
      p_olusturan_id: olusturanId ?? null,
    })
    if (error) throw error
    return { gonderildi: (data || []).length, aliciIdler: (data || []).map(r => r.out_alici_id) }
  } catch (e) {
    console.warn('[servisTalebiBildirimGonder]', e?.message)
    return { gonderildi: 0, hata: e?.message }
  }
}

// LİSTE kolonları: musteri_imza + personel_imza HARİÇ her şey.
// İmzalar base64 data-URI (satır başına 95-195KB!) — select('*') 21 talep için
// 2.3MB / ~2sn çekiyordu; imzasız ~50KB. İmza gereken yerler (servis formu
// çıktısı) tek kaydı servisTalepGetir(id) ile alır. Yeni kolon eklerken buraya
// da eklemeyi unutma (whitelist tuzağı).
const SERVIS_LISTE_KOLONLARI = `id, talep_no, musteri_id, musteri_ad, firma_adi, ana_tur,
  alt_kategori, konu, lokasyon, cihaz_turu, aciklama, aciliyet, ilgili_kisi, telefon,
  uygun_zaman, durum, atanan_kullanici_id, atanan_kullanici_ad, planli_tarih, notlar,
  durum_gecmisi, musteri_onay, olusturma_tarihi, guncelleme_tarihi, operator_onay,
  operator_onay_tarihi, operator_onay_kullanici_id, operator_onay_kullanici_ad,
  periyodik_mi, periyodik_araligi, dosyalar, kok_sebep, yapilan_mudahale, teslim_alan_ad,
  gorev_id, gorusme_id, degerlendirme_puan, degerlendirme_yorum, degerlendirme_tarihi,
  degerlendirme_kullanici_id, servis_tipi, yukumluluk, servis_yeri, seri_numarasi, marka,
  model, kunye_numarasi, yedek_parcalar, cozum_aciklamasi, personel_imza_ad, kaynak,
  email, tamamlanma_tarihi, siparis_id, fatura_talep_id, kullanilacak_malzemeler`

export const servisTalepleriniGetir = async () => {
  const hepsi = []
  const sayfa = 1000
  let off = 0
  while (true) {
    const { data, error } = await supabase.from('servis_talepleri').select(SERVIS_LISTE_KOLONLARI).order('id', { ascending: false }).range(off, off + sayfa - 1)
    if (error) { console.error('servisTalepleriniGetir hata:', error.message); throw error }
    if (!data || data.length === 0) break
    hepsi.push(...data)
    if (data.length < sayfa) break
    off += sayfa
  }
  return arrayToCamel(hepsi)
}

export const servisTalepGetir = async (id) => {
  const { data } = await supabase.from('servis_talepleri').select('*').eq('id', id).single()
  return toCamel(data)
}

export const servisTalepEkle = async (talep) => {
  const { id, olusturmaTarihi, guncellemeTarihi, ...rest } = talep
  const { data, error } = await supabase.from('servis_talepleri').insert(toSnake(rest)).select().single()
  if (error) { console.error('servisTalepEkle hata:', error.message); throw error }
  return toCamel(data)
}

/**
 * Montaj sorumlusu (mig 168) — sipariş tamamlanınca açılan montaj servisinin
 * varsayılan atananı. Sabit id yerine bayrak: kişi değişince kod değişmesin.
 * (Bu dosyada FERDI_ID = 16 gömülüydü; Ferdi Kalkan aslında id 33 — o sabit
 * artık ölü kod, doğru kaynak bu bayrak.)
 */
export const montajSorumlusuGetir = async () => {
  const { data, error } = await supabase
    .from('kullanicilar')
    .select('id, ad')
    .eq('tip', 'zna')
    .eq('montaj_sorumlusu', true)
    .neq('durum', 'pasif')
    .limit(1)
  if (error) { console.error('[montajSorumlusuGetir]', error.message); return null }
  return data?.[0] ? toCamel(data[0]) : null
}

/**
 * Sipariş → montaj servis talebi (mig 168). Zincirin son halkası:
 * görüşme → teklif → sözleşme → sipariş → (tamamlanınca) MONTAJ.
 * Desen: KesifDetay.servisOlustur — anaTur 'kurulum' (canlı veride görünen
 * 'montaj' değeri eski; UI listesi ANA_TURLER'de 'kurulum' var).
 */
export const siparistenMontajServisi = async ({ siparis, kalemler, atanan, planliTarih, ekNot, kullanici }) => {
  const kalemOzet = (kalemler || [])
    .map(k => `• ${k.urunAd || k.urunAdi || '—'}${k.urunMarka ? ` (${k.urunMarka})` : ''} × ${k.miktar || 1} ${k.birim || 'Adet'}`)
    .join('\n')

  const talep = await servisTalepEkle({
    talepNo: null,                       // DB trigger üretir (mig 046)
    siparisId: siparis.id,               // geri bağ (mig 168)
    musteriId: siparis.musteriId || null,
    musteriAd: '',
    firmaAdi: siparis.firmaAdi || '',
    anaTur: 'kurulum',
    altKategori: '',
    konu: `${siparis.siparisNo} — ${siparis.konu || siparis.firmaAdi || 'sipariş'} montajı`,
    lokasyon: siparis.lokasyon || '',
    aciklama: [
      `Kaynak sipariş: ${siparis.siparisNo}`,
      siparis.konu ? `Sipariş konusu: ${siparis.konu}` : null,
      kalemOzet ? `Montaj kapsamı:\n${kalemOzet}` : null,
      ekNot ? `Not: ${ekNot}` : null,
    ].filter(Boolean).join('\n\n'),
    aciliyet: 'normal',
    ilgiliKisi: kullanici?.ad || '',
    planliTarih: planliTarih || null,
    // Atanan varsa 'atandi', yoksa 'bekliyor' — ServisTalebiContext deseni
    durum: atanan?.id ? 'atandi' : 'bekliyor',
    kaynak: 'personel',
    atananKullaniciId: atanan?.id ?? null,
    atananKullaniciAd: atanan?.ad ?? '',
    notlar: [],
    durumGecmisi: [{
      durum: atanan?.id ? 'atandi' : 'bekliyor',
      tarih: new Date().toISOString(),
      kullanici: kullanici?.ad || '',
      not: `${siparis.siparisNo} siparişi tamamlandı — montaj servisi açıldı.`,
    }],
  })
  return talep
}

export const servisTalepGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarihi, guncellemeTarihi, ...rest } = guncellenmis
  const { data, error } = await supabase.from('servis_talepleri').update({
    ...toSnake(rest),
    guncelleme_tarihi: new Date().toISOString()
  }).eq('id', id).select().single()
  if (error) { console.error('servisTalepGuncelle hata:', error.message); throw error }
  return toCamel(data)
}

export const servisTalepSil = async (id) => {
  const { error } = await supabase.from('servis_talepleri').delete().eq('id', id)
  if (error) console.error('servisTalepSil hata:', error.message)
}
