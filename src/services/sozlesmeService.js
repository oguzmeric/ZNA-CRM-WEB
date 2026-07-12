// Sözleşmeler mini modülü (mig 144) — bakım/kiralama/hizmet sözleşmeleri.
// Bitiş tarihi sabah özetine girer (30 gün kala). Dosya eki filo-belge
// bucket'ının 'sozlesme/' klasöründe tutulur.

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

export const SOZLESME_TIPLERI = [
  { id: 'bakim',    isim: 'Bakım Sözleşmesi' },
  { id: 'kiralama', isim: 'Kiralama' },
  { id: 'hizmet',   isim: 'Hizmet' },
  { id: 'tedarik',  isim: 'Tedarik' },
  { id: 'diger',    isim: 'Diğer' },
]

export const sozlesmeleriGetir = async () => {
  const { data, error } = await supabase
    .from('sozlesmeler')
    .select('*, musteri:musteri_id (id, firma, ad, soyad)')
    .order('bitis_tarih', { ascending: true })
  if (error) { console.error('sozlesmeleriGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const sozlesmeEkle = async (payload) => {
  const { data, error } = await supabase
    .from('sozlesmeler')
    .insert(toSnake(payload))
    .select()
    .single()
  if (error) { console.error('sozlesmeEkle hata:', error.message); return { _hata: error.message } }
  return toCamel(data)
}

export const sozlesmeGuncelle = async (id, payload) => {
  const { data, error } = await supabase
    .from('sozlesmeler')
    .update(toSnake(payload))
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('sozlesmeGuncelle hata:', error.message); return { _hata: error.message } }
  return toCamel(data)
}

export const sozlesmeSil = async (sozlesme) => {
  const { error } = await supabase.from('sozlesmeler').delete().eq('id', sozlesme.id)
  if (error) { console.error('sozlesmeSil hata:', error.message); return false }
  if (sozlesme.dosyaUrl) {
    await supabase.storage.from('filo-belge').remove([sozlesme.dosyaUrl]).catch(() => {})
  }
  return true
}
