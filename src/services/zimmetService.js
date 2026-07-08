// Teknisyen zimmet & envanter servisi.
// - transit envanter (SN'li stok kalemi)
// - kalıcı demirbaş (laptop, çanta, alet — fotoğraflı)

import { supabase } from '../lib/supabase'

// ---------- Transit envanter — kaynak: stok_kalemleri (durum='teknisyende') ----------
// Not: 108 numaralı teknisyen_envanter tablosu vardı ama stok akışı doğrudan
// stok_kalemleri.teknisyen_id kullanıyor (116). Kaynağı tek noktada birleştirdik.

// stok_kalemi satırını ZimmetPanel'in beklediği şekle çevir
const kalemiEnvantereCevir = (k) => ({
  id: k.id,
  kullanici_id: k.teknisyen_id,
  kullanici: k.kullanici,
  zimmet_zamani: k.guncelleme_tarih || k.olusturma_tarih,
  durum: 'yolda',
  stok_kalemi: {
    id: k.id,
    seri_no: k.seri_no,
    stok_kodu: k.stok_kodu,
    urun: k.urun,
  },
})

// Yardımcı: stok kodlarına göre stok_urunler bilgilerini toplu çek
// Not: stok_urunler'da kolon adları stok_adi + marka (ad/model yok)
async function urunlerToplu(stokKodlari) {
  const benzersiz = Array.from(new Set((stokKodlari || []).filter(Boolean)))
  if (!benzersiz.length) return new Map()
  const { data, error } = await supabase
    .from('stok_urunler')
    .select('stok_kodu, stok_adi, marka')
    .in('stok_kodu', benzersiz)
  if (error) { console.error('[zimmet] urunlerToplu:', error); return new Map() }
  return new Map((data || []).map(u => [u.stok_kodu, { ad: u.stok_adi, marka: u.marka, model: null }]))
}

// Yardımcı: kullanıcı id → kullanıcı bilgisi map'i
async function kullanicilarToplu(idler) {
  const benzersiz = Array.from(new Set((idler || []).filter(Boolean)))
  if (!benzersiz.length) return new Map()
  const { data, error } = await supabase
    .from('kullanicilar')
    .select('id, ad, foto_url, unvan')
    .in('id', benzersiz)
  if (error) { console.error('[zimmet] kullanicilarToplu:', error); return new Map() }
  return new Map((data || []).map(k => [k.id, k]))
}

// Bir teknisyenin aktif envanterini getir — embed yok, iki adım
export async function teknisyenAktifEnvanter(kullaniciId) {
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .select('id, seri_no, stok_kodu, teknisyen_id, durum, silindi, olusturma_tarih, guncelleme_tarih, marka, model')
    .eq('teknisyen_id', kullaniciId)
    .eq('durum', 'teknisyende')
    .eq('silindi', false)
    .order('guncelleme_tarih', { ascending: false })
  if (error) { console.error('[zimmet] teknisyenAktifEnvanter:', error); throw error }
  const urunMap = await urunlerToplu((data || []).map(k => k.stok_kodu))
  return (data || []).map(k => kalemiEnvantereCevir({ ...k, urun: urunMap.get(k.stok_kodu) || { marka: k.marka, model: k.model } }))
}

// Tüm teknisyenlerin özeti (admin görünümü) — embed yok, iki adım
export async function tumTeknisyenEnvanter() {
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .select('id, seri_no, stok_kodu, teknisyen_id, durum, silindi, olusturma_tarih, guncelleme_tarih, marka, model')
    .eq('durum', 'teknisyende')
    .eq('silindi', false)
    .not('teknisyen_id', 'is', null)
    .order('guncelleme_tarih', { ascending: false })
  if (error) { console.error('[zimmet] tumTeknisyenEnvanter:', error); throw error }
  const rows = data || []
  console.log('[zimmet] tumTeknisyenEnvanter satır:', rows.length, rows)
  const [urunMap, kullaniciMap] = await Promise.all([
    urunlerToplu(rows.map(k => k.stok_kodu)),
    kullanicilarToplu(rows.map(k => k.teknisyen_id)),
  ])
  return rows.map(k => kalemiEnvantereCevir({
    ...k,
    urun: urunMap.get(k.stok_kodu) || { marka: k.marka, model: k.model },
    kullanici: kullaniciMap.get(k.teknisyen_id) || { id: k.teknisyen_id, ad: `#${k.teknisyen_id}` },
  }))
}

// SN ile stok kalemi bul (zimmetlemek için) — embed yok, iki adım
export async function stokKalemiBulSN(seriNo) {
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .select('id, seri_no, stok_kodu, durum, silindi, marka, model')
    .eq('seri_no', seriNo.trim())
    .eq('silindi', false)
    .limit(1)
    .maybeSingle()
  if (error) { console.error('[zimmet] stokKalemiBulSN:', error); throw error }
  if (!data) return null
  const urunMap = await urunlerToplu([data.stok_kodu])
  return { ...data, urun: urunMap.get(data.stok_kodu) || { ad: null, marka: data.marka, model: data.model } }
}

// Zimmet ekle
export async function envanterZimmetle({ kullaniciId, stokKalemiId, not }) {
  const { data: sess } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('teknisyen_envanter')
    .insert({
      kullanici_id: kullaniciId,
      stok_kalemi_id: stokKalemiId,
      zimmetleyen_id: sess?.user?.id,
      not: not || null,
      durum: 'yolda',
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// Durum güncelle (kuruldu / iade)
export async function envanterDurumGuncelle(id, durum, ekstra = {}) {
  const payload = { durum, ...ekstra }
  const { data, error } = await supabase
    .from('teknisyen_envanter')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ---------- Kalıcı demirbaş (demirbas_zimmet) ----------

export async function tumDemirbaslar() {
  const { data, error } = await supabase
    .from('demirbas_zimmet')
    .select(`
      id, kategori, aciklama, foto_url, verildi_tarih, iade_tarih, olusturuldu,
      kullanici:kullanici_id (id, ad, foto_url, unvan)
    `)
    .is('iade_tarih', null)
    .order('verildi_tarih', { ascending: false })
  if (error) throw error
  return data || []
}

export async function teknisyenDemirbaslari(kullaniciId) {
  const { data, error } = await supabase
    .from('demirbas_zimmet')
    .select('*')
    .eq('kullanici_id', kullaniciId)
    .is('iade_tarih', null)
    .order('verildi_tarih', { ascending: false })
  if (error) throw error
  return data || []
}

export async function demirbasEkle({ kullaniciId, kategori, aciklama, fotoUrl }) {
  const { data, error } = await supabase
    .from('demirbas_zimmet')
    .insert({
      kullanici_id: kullaniciId,
      kategori,
      aciklama: aciklama || null,
      foto_url: fotoUrl || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function demirbasIade(id) {
  const { data, error } = await supabase
    .from('demirbas_zimmet')
    .update({ iade_tarih: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Foto yükle → bucket: demirbas-foto
export async function demirbasFotoYukle(file, kullaniciId) {
  const ext = file.name.split('.').pop()
  const yol = `${kullaniciId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('demirbas-foto').upload(yol, file, { upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from('demirbas-foto').getPublicUrl(yol)
  return data.publicUrl
}
