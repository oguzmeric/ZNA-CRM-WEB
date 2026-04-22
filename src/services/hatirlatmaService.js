import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

export const hatirlatmalariGetir = async () => {
  const { data } = await supabase.from('hatirlatmalar').select('*').order('hatirlatma_tarihi')
  return arrayToCamel(data)
}

export const hatirlatmaEkleDB = async (hatirlatma) => {
  await supabase.from('hatirlatmalar')
    .delete().eq('teklif_id', hatirlatma.teklifId || hatirlatma.teklif_id).eq('durum', 'bekliyor')
  const { id, ...rest } = hatirlatma
  const { data, error } = await supabase.from('hatirlatmalar').insert(toSnake(rest)).select().single()
  if (error) { console.error('hatirlatmaEkle hata:', error.message); return null }
  return toCamel(data)
}

export const hatirlatmaGuncelle = async (id, guncellenmis) => {
  const { id: _id, ...rest } = guncellenmis
  const { data, error } = await supabase.from('hatirlatmalar').update(toSnake(rest)).eq('id', id).select().single()
  if (error) { console.error('hatirlatmaGuncelle hata:', error.message); return null }
  return toCamel(data)
}

export const hatirlatmaSilDB = async (teklifId) => {
  const { error } = await supabase.from('hatirlatmalar').delete().eq('teklif_id', teklifId)
  if (error) console.error('hatirlatmaSil hata:', error.message)
}
