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
  zimmet_zamani: k.guncellendi || k.olusturuldu,
  durum: 'yolda',
  stok_kalemi: {
    id: k.id,
    seri_no: k.seri_no,
    stok_kodu: k.stok_kodu,
    urun: k.urun,
  },
})

// Bir teknisyenin aktif envanterini getir
export async function teknisyenAktifEnvanter(kullaniciId) {
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .select(`
      id, seri_no, stok_kodu, teknisyen_id, durum, olusturuldu, guncellendi,
      urun:stok_kodu (id, ad, marka, model)
    `)
    .eq('teknisyen_id', kullaniciId)
    .eq('durum', 'teknisyende')
    .eq('silindi', false)
    .order('guncellendi', { ascending: false })
  if (error) throw error
  return (data || []).map(kalemiEnvantereCevir)
}

// Tüm teknisyenlerin özeti (admin görünümü)
export async function tumTeknisyenEnvanter() {
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .select(`
      id, seri_no, stok_kodu, teknisyen_id, durum, olusturuldu, guncellendi,
      kullanici:teknisyen_id (id, ad, foto_url, unvan),
      urun:stok_kodu (id, ad, marka, model)
    `)
    .eq('durum', 'teknisyende')
    .eq('silindi', false)
    .not('teknisyen_id', 'is', null)
    .order('guncellendi', { ascending: false })
  if (error) throw error
  return (data || []).map(kalemiEnvantereCevir)
}

// SN ile stok kalemi bul (zimmetlemek için)
export async function stokKalemiBulSN(seriNo) {
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .select('id, seri_no, stok_kodu, urun:stok_kodu (ad, marka, model)')
    .eq('seri_no', seriNo.trim())
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
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
