import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

// Personel/admin — tümünü listele (pasif ve tarihi geçmiş dahil)
export const duyurulariGetir = async () => {
  const { data, error } = await supabase
    .from('duyurular')
    .select('*')
    .order('baslangic_tarihi', { ascending: false })
  if (error) { console.error('duyurulariGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

// Müşteri portalı — sadece aktif + tarih aralığındakileri getirir (RLS zaten filtreliyor ama yine de emin olmak için)
export const aktifDuyurulariGetir = async () => {
  const simdi = new Date().toISOString()
  const { data, error } = await supabase
    .from('duyurular')
    .select('id, baslik, icerik, seviye, baslangic_tarihi')
    .eq('aktif', true)
    .lte('baslangic_tarihi', simdi)
    .or(`bitis_tarihi.is.null,bitis_tarihi.gte.${simdi}`)
    .order('baslangic_tarihi', { ascending: false })
    .limit(10)
  if (error) { console.error('aktifDuyurulariGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const duyuruEkle = async (duyuru) => {
  const payload = toSnake(duyuru)
  const { data, error } = await supabase.from('duyurular').insert(payload).select().single()
  if (error) { console.error('duyuruEkle hata:', error.message); throw error }
  return toCamel(data)
}

export const duyuruGuncelle = async (id, guncel) => {
  const { id: _id, olusturmaTarih, guncellemeTarih, olusturan, ...rest } = guncel
  const { data, error } = await supabase
    .from('duyurular')
    .update(toSnake(rest))
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('duyuruGuncelle hata:', error.message); throw error }
  return toCamel(data)
}

export const duyuruSil = async (id) => {
  const { error } = await supabase.from('duyurular').delete().eq('id', id)
  if (error) { console.error('duyuruSil hata:', error.message); throw error }
}
