// Cihaz envanteri + kurulum tarihçesi CRUD.
// Bir stok_kalemi (S/N'li ürün) kurulunca INSERT — 'aktif' olur.
// Sökülünce sokUD ile 'sokuldu'/'ariza' işaretlenir; yeni kurulum yeni kayıt açar.
// RLS: is_staff() — yalnızca personel erişebilir.

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

const KOLONLAR = `
  id, stok_kalemi_id, servis_talep_id, musteri_id,
  ip_adresi, mac_adresi, kullanici_adi, sifre, port,
  lokasyon_notu, model_notu, kurulum_notu,
  kuran_kullanici_id, kurulum_tarihi,
  durum, sokum_tarihi, sokum_servis_talep_id, sokum_kullanici_id, sokum_notu,
  olusturma_tarihi, guncelleme_tarihi
`

// ────────────────────────────────────────────────────────────────
// Yeni cihaz kaydı (kurulum)
// payload: { stokKalemiId, servisTalepId?, musteriId, ipAdresi, macAdresi,
//            kullaniciAdi, sifre, port?, lokasyonNotu?, modelNotu?, kurulumNotu?,
//            kuranKullaniciId }
// ────────────────────────────────────────────────────────────────
export const cihazKayitEkle = async (payload) => {
  const { data, error } = await supabase
    .from('cihaz_kayitlari')
    .insert(toSnake({ ...payload, durum: 'aktif' }))
    .select(KOLONLAR)
    .single()
  if (error) { console.error('cihazKayitEkle:', error.message); return { data: null, error } }
  return { data: toCamel(data), error: null }
}

// ────────────────────────────────────────────────────────────────
// Kayıt getir (id)
// ────────────────────────────────────────────────────────────────
export const cihazKayitGetir = async (id) => {
  const { data, error } = await supabase
    .from('cihaz_kayitlari').select(KOLONLAR).eq('id', id).single()
  if (error) { console.warn('cihazKayitGetir:', error.message); return null }
  return toCamel(data)
}

// ────────────────────────────────────────────────────────────────
// Aktif cihaz — belirli bir stok_kalemi (S/N) için
// Mobile S/N scan sırasında "bu cihaz halihazırda X'te kurulu" uyarısı
// ────────────────────────────────────────────────────────────────
export const aktifCihazGetirByStokKalemi = async (stokKalemiId) => {
  const { data, error } = await supabase
    .from('cihaz_kayitlari')
    .select(`${KOLONLAR}, musteriler:musteri_id (id, firma, ad, soyad)`)
    .eq('stok_kalemi_id', stokKalemiId)
    .eq('durum', 'aktif')
    .maybeSingle()
  if (error) { console.warn('aktifCihazGetirByStokKalemi:', error.message); return null }
  return data ? toCamel(data) : null
}

// ────────────────────────────────────────────────────────────────
// Bir S/N'in tam tarihçesi (aktif + sökülmüş hepsi)
// ────────────────────────────────────────────────────────────────
export const cihazTarihcesiGetir = async (stokKalemiId) => {
  const { data, error } = await supabase
    .from('cihaz_kayitlari')
    .select(`${KOLONLAR}, musteriler:musteri_id (id, firma, ad, soyad)`)
    .eq('stok_kalemi_id', stokKalemiId)
    .order('kurulum_tarihi', { ascending: false })
  if (error) { console.warn('cihazTarihcesiGetir:', error.message); return [] }
  return arrayToCamel(data || [])
}

// ────────────────────────────────────────────────────────────────
// Bir müşterinin aktif cihazları
// ────────────────────────────────────────────────────────────────
export const musteriAktifCihazlariGetir = async (musteriId) => {
  const { data, error } = await supabase
    .from('cihaz_kayitlari')
    .select(`${KOLONLAR}, stok_kalemleri:stok_kalemi_id (id, seri_no, urun_id, stok_urunler:urun_id (id, ad, model))`)
    .eq('musteri_id', musteriId)
    .eq('durum', 'aktif')
    .order('kurulum_tarihi', { ascending: false })
  if (error) { console.warn('musteriAktifCihazlariGetir:', error.message); return [] }
  return arrayToCamel(data || [])
}

// ────────────────────────────────────────────────────────────────
// Bir servis talebine kurulan cihazlar
// (Servis raporu tamamlanma kontrolü için)
// ────────────────────────────────────────────────────────────────
export const servisTalepCihazlariGetir = async (servisTalepId) => {
  const { data, error } = await supabase
    .from('cihaz_kayitlari')
    .select(`${KOLONLAR}, stok_kalemleri:stok_kalemi_id (id, seri_no, urun_id, stok_urunler:urun_id (id, ad, model))`)
    .eq('servis_talep_id', servisTalepId)
    .order('kurulum_tarihi', { ascending: false })
  if (error) { console.warn('servisTalepCihazlariGetir:', error.message); return [] }
  return arrayToCamel(data || [])
}

// ────────────────────────────────────────────────────────────────
// Cihaz kaydı güncelle (IP değişimi, şifre reset, not vb.)
// ────────────────────────────────────────────────────────────────
export const cihazKayitGuncelle = async (id, guncellenmis) => {
  const { id: _id, ...rest } = guncellenmis
  const { data, error } = await supabase
    .from('cihaz_kayitlari')
    .update(toSnake(rest))
    .eq('id', id)
    .select(KOLONLAR)
    .single()
  if (error) { console.error('cihazKayitGuncelle:', error.message); return { data: null, error } }
  return { data: toCamel(data), error: null }
}

// ────────────────────────────────────────────────────────────────
// Cihaz sök — durum='sokuldu', sokum_* alanları doldur
// payload: { sokumServisTalepId?, sokumKullaniciId, sokumNotu?, durum?='sokuldu' }
// ────────────────────────────────────────────────────────────────
export const cihazSok = async (id, payload) => {
  const durum = payload?.durum === 'ariza' ? 'ariza' : 'sokuldu'
  const { data, error } = await supabase
    .from('cihaz_kayitlari')
    .update(toSnake({
      durum,
      sokumTarihi: new Date().toISOString(),
      sokumServisTalepId: payload?.sokumServisTalepId ?? null,
      sokumKullaniciId: payload.sokumKullaniciId,
      sokumNotu: payload?.sokumNotu ?? null,
    }))
    .eq('id', id)
    .eq('durum', 'aktif')      // sadece aktif kayıt sökülebilir
    .select(KOLONLAR)
    .single()
  if (error) { console.error('cihazSok:', error.message); return { data: null, error } }
  return { data: toCamel(data), error: null }
}
