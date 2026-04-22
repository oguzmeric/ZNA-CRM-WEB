import { supabase } from '../lib/supabase'
import { toCamel, toSnake } from '../lib/mapper'

export const sistemAyarlariGetir = async () => {
  const { data } = await supabase.from('sistem_ayarlari').select('*').eq('id', 1).single()
  return toCamel(data) || {}
}

export const sistemAyarlariKaydet = async (ayarlar) => {
  const { id, ...rest } = ayarlar
  const { data } = await supabase.from('sistem_ayarlari')
    .upsert({ id: 1, ...toSnake(rest), updated_at: new Date().toISOString() })
    .select().single()
  return toCamel(data)
}
