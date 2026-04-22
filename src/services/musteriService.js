import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

export const musterileriGetir = async () => {
  // Supabase default 1000 limit — pagination ile tümünü çek
  const hepsi = []
  const sayfaBoyut = 1000
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('musteriler')
      .select('*')
      .order('olusturma_tarih', { ascending: false })
      .range(offset, offset + sayfaBoyut - 1)
    if (error) { console.error('musterileriGetir hata:', error.message); break }
    if (!data || data.length === 0) break
    hepsi.push(...data)
    if (data.length < sayfaBoyut) break
    offset += sayfaBoyut
  }
  return arrayToCamel(hepsi)
}

export const musteriGetir = async (id) => {
  const { data } = await supabase.from('musteriler').select('*').eq('id', id).single()
  return toCamel(data)
}

export const musteriEkle = async (musteri) => {
  const { id, olusturmaTarih, ...rest } = musteri
  const { data, error } = await supabase.from('musteriler').insert(toSnake(rest)).select().single()
  if (error) { console.error('musteriEkle hata:', error.message); throw error }
  return toCamel(data)
}

export const musteriGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, ...rest } = guncellenmis
  // ilgiliKisiler → ilgili_kisiler (JSON kolon, toSnake ile dönüştür)
  const payload = toSnake(rest)
  const { data, error } = await supabase.from('musteriler').update(payload).eq('id', id).select().single()
  if (error) { console.error('musteriGuncelle hata:', error.message); throw error }
  return toCamel(data)
}

export const musteriSil = async (id) => {
  const { error } = await supabase.from('musteriler').delete().eq('id', id)
  if (error) console.error('musteriSil hata:', error.message)
}
