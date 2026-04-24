import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { pagedFetch } from '../lib/pagedFetch'
import { cached, invalidate } from '../lib/cache'

export const firmalariGetir = () => cached('firmalar:list', async () => {
  const data = await pagedFetch((off, size) =>
    supabase.from('firmalar').select('*').order('olusturma_tarih', { ascending: false }).range(off, off + size - 1)
  )
  return arrayToCamel(data)
})

export const firmaGetir = (id) => cached(`firma:${id}`, async () => {
  const { data } = await supabase.from('firmalar').select('*').eq('id', id).single()
  return toCamel(data)
})

export const firmaEkle = async (firma) => {
  const { id, olusturmaTarih, ...rest } = firma
  const { data, error } = await supabase.from('firmalar').insert(toSnake(rest)).select().single()
  if (error) { console.error('firmaEkle hata:', error.message); throw error }
  invalidate('firmalar:list')
  return toCamel(data)
}

export const firmaGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, ...rest } = guncellenmis
  const { data, error } = await supabase.from('firmalar').update(toSnake(rest)).eq('id', id).select().single()
  if (error) { console.error('firmaGuncelle hata:', error.message); throw error }
  invalidate('firmalar:list', `firma:${id}`)
  return toCamel(data)
}

export const firmaSil = async (id) => {
  const { error } = await supabase.from('firmalar').delete().eq('id', id)
  if (error) console.error('firmaSil hata:', error.message)
  invalidate('firmalar:list', `firma:${id}`)
}
