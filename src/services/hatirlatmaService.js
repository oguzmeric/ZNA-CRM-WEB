import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { pagedFetch } from '../lib/pagedFetch'

export const hatirlatmalariGetir = async () => {
  const data = await pagedFetch((off, size) =>
    supabase.from('hatirlatmalar').select('*').order('hatirlatma_tarihi').range(off, off + size - 1)
  )
  return arrayToCamel(data)
}

export const hatirlatmaEkleDB = async (hatirlatma) => {
  // Aynı kaynak için (aynı teklif veya aynı görüşme) bekleyen hatırlatmayı
  // silip yeni kaydı insert et — son hatırlatma tarihi güncellenmiş olur.
  const tip = hatirlatma.tip || 'teklif'
  if (tip === 'gorusme' && hatirlatma.gorusmeId) {
    await supabase.from('hatirlatmalar')
      .delete().eq('gorusme_id', hatirlatma.gorusmeId).eq('durum', 'bekliyor')
  } else if (hatirlatma.teklifId || hatirlatma.teklif_id) {
    await supabase.from('hatirlatmalar')
      .delete().eq('teklif_id', hatirlatma.teklifId || hatirlatma.teklif_id).eq('durum', 'bekliyor')
  }
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

export const hatirlatmaGorusmeSilDB = async (gorusmeId) => {
  const { error } = await supabase.from('hatirlatmalar').delete().eq('gorusme_id', gorusmeId)
  if (error) console.error('hatirlatmaGorusmeSil hata:', error.message)
}
