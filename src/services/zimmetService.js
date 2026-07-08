// Teknisyen zimmet & envanter servisi.
// - transit envanter (SN'li stok kalemi)
// - kalıcı demirbaş (laptop, çanta, alet — fotoğraflı)

import { supabase } from '../lib/supabase'

// ---------- Transit envanter (teknisyen_envanter) ----------

// Bir teknisyenin aktif (durum='yolda') envanterini getir
export async function teknisyenAktifEnvanter(kullaniciId) {
  const { data, error } = await supabase
    .from('teknisyen_envanter')
    .select(`
      id, zimmet_zamani, durum, not,
      stok_kalemi:stok_kalemi_id (
        id, seri_no, stok_kodu,
        urun:stok_kodu (id, ad, marka, model)
      )
    `)
    .eq('kullanici_id', kullaniciId)
    .eq('durum', 'yolda')
    .order('zimmet_zamani', { ascending: false })
  if (error) throw error
  return data || []
}

// Tüm teknisyenlerin özet (admin dashboard için)
export async function tumTeknisyenEnvanter() {
  const { data, error } = await supabase
    .from('teknisyen_envanter')
    .select(`
      id, kullanici_id, zimmet_zamani, durum,
      kullanici:kullanici_id (id, ad, foto_url, unvan),
      stok_kalemi:stok_kalemi_id (
        id, seri_no, stok_kodu,
        urun:stok_kodu (ad, marka, model)
      )
    `)
    .eq('durum', 'yolda')
    .order('zimmet_zamani', { ascending: false })
  if (error) throw error
  return data || []
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
