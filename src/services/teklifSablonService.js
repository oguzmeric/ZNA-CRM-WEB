import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

// Teklif şablonları (migration 135) — sık kullanılan ürün setleri.
// satirlar jsonb, teklifler.satirlar ile aynı formatta saklanır.

export const sablonlariGetir = async () => {
  const { data, error } = await supabase
    .from('teklif_sablonlari')
    .select('*')
    .order('olusturma_tarih', { ascending: false })
  if (error) { console.warn('sablonlariGetir hata:', error.message); return [] }
  return arrayToCamel(data)
}

export const sablonEkle = async (sablon) => {
  const { data, error } = await supabase
    .from('teklif_sablonlari')
    .insert(toSnake(sablon))
    .select()
    .single()
  if (error) throw error
  return toCamel(data)
}

export const sablonSil = async (id) => {
  const { error } = await supabase.from('teklif_sablonlari').delete().eq('id', id)
  if (error) throw error
}
