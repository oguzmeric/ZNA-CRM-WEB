import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cached, invalidate } from '../lib/cache'

export const gorevleriGetir = () => cached('gorevler:list', async () => {
  const hepsi = []
  const sayfa = 1000
  let off = 0
  while (true) {
    const { data, error } = await supabase.from('gorevler').select('*').order('olusturma_tarih', { ascending: false }).range(off, off + sayfa - 1)
    if (error) { console.error('gorevleriGetir hata:', error.message); break }
    if (!data || data.length === 0) break
    hepsi.push(...data)
    if (data.length < sayfa) break
    off += sayfa
  }
  return arrayToCamel(hepsi)
})

export const gorevGetir = (id) => cached(`gorev:${id}`, async () => {
  const { data } = await supabase.from('gorevler').select('*').eq('id', id).single()
  return toCamel(data)
})

export const gorevEkle = async (gorev) => {
  const { id, olusturmaTarih, yorumlar, ...rest } = gorev
  const { data, error } = await supabase.from('gorevler').insert(toSnake(rest)).select().single()
  if (error) { console.error('gorevEkle hata:', error.message); return null }
  invalidate('gorevler:list')
  return toCamel(data)
}

export const gorevGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, ...rest } = guncellenmis
  const { data, error } = await supabase.from('gorevler').update(toSnake(rest)).eq('id', id).select().single()
  if (error) { console.error('gorevGuncelle hata:', error.message); return null }
  invalidate('gorevler:list', `gorev:${id}`)
  return toCamel(data)
}

export const gorevSil = async (id) => {
  await supabase.from('gorevler').delete().eq('id', id)
  invalidate('gorevler:list', `gorev:${id}`)
}
