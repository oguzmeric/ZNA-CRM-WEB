import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { pagedFetch } from '../lib/pagedFetch'

export const firmalariGetir = async () => {
  const data = await pagedFetch((off, size) =>
    supabase.from('firmalar').select('*').order('olusturma_tarih', { ascending: false }).range(off, off + size - 1)
  )
  return arrayToCamel(data)
}

export const firmaGetir = async (id) => {
  const { data } = await supabase.from('firmalar').select('*').eq('id', id).single()
  return toCamel(data)
}

export const firmaEkle = async (firma) => {
  const { id, olusturmaTarih, ...rest } = firma
  const { data, error } = await supabase.from('firmalar').insert(toSnake(rest)).select().single()
  if (error) { console.error('firmaEkle hata:', error.message); throw error }
  return toCamel(data)
}

export const firmaGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, ...rest } = guncellenmis
  const { data, error } = await supabase.from('firmalar').update(toSnake(rest)).eq('id', id).select().single()
  if (error) { console.error('firmaGuncelle hata:', error.message); throw error }
  return toCamel(data)
}

export const firmaSil = async (id) => {
  const { error } = await supabase.from('firmalar').delete().eq('id', id)
  if (error) console.error('firmaSil hata:', error.message)
}
