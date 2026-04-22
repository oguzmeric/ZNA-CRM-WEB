import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

export const musteriLokasyonlariniGetir = async (musteriId) => {
  const { data } = await supabase
    .from('musteri_lokasyonlari')
    .select('*')
    .eq('musteri_id', musteriId)
    .order('aktif', { ascending: false })
    .order('olusturma_tarih', { ascending: true })
  return arrayToCamel(data) ?? []
}

export const musteriLokasyonEkle = async (lokasyon) => {
  const { id, olusturmaTarih, ...rest } = lokasyon
  const { data, error } = await supabase
    .from('musteri_lokasyonlari')
    .insert(toSnake(rest))
    .select()
    .single()
  if (error) { console.error('musteriLokasyonEkle hata:', error.message); throw error }
  return toCamel(data)
}

export const musteriLokasyonGuncelle = async (lokasyonId, guncellenmis) => {
  const { id: _id, olusturmaTarih, ...rest } = guncellenmis
  const { data, error } = await supabase
    .from('musteri_lokasyonlari')
    .update(toSnake(rest))
    .eq('id', lokasyonId)
    .select()
    .single()
  if (error) { console.error('musteriLokasyonGuncelle hata:', error.message); throw error }
  return toCamel(data)
}

export const musteriLokasyonSil = async (id) => {
  const { error } = await supabase.from('musteri_lokasyonlari').delete().eq('id', id)
  if (error) console.error('musteriLokasyonSil hata:', error.message)
}
