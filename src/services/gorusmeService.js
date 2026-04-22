import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

export const gorusmeleriGetir = async () => {
  const hepsi = []
  const sayfa = 1000
  let off = 0
  while (true) {
    const { data, error } = await supabase.from('gorusmeler').select('*').order('olusturma_tarih', { ascending: false }).range(off, off + sayfa - 1)
    if (error) { console.error('gorusmeleriGetir hata:', error.message); break }
    if (!data || data.length === 0) break
    hepsi.push(...data)
    if (data.length < sayfa) break
    off += sayfa
  }
  return arrayToCamel(hepsi)
}

export const gorusmeGetir = async (id) => {
  const { data } = await supabase.from('gorusmeler').select('*').eq('id', id).single()
  return toCamel(data)
}

export const gorusmeEkle = async (gorusme) => {
  const { id, olusturmaTarih, manuelKonu, ...rest } = gorusme
  const { data, error } = await supabase.from('gorusmeler').insert(toSnake(rest)).select().single()
  if (error) { console.error('gorusmeEkle hata:', error.message); return null }
  return toCamel(data)
}

export const gorusmeGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, manuelKonu, ...rest } = guncellenmis
  const { data, error } = await supabase.from('gorusmeler').update(toSnake(rest)).eq('id', id).select().single()
  if (error) { console.error('gorusmeGuncelle hata:', error.message); return null }
  return toCamel(data)
}

export const gorusmeSil = async (id) => {
  await supabase.from('gorusmeler').delete().eq('id', id)
}
