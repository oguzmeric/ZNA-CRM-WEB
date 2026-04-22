import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

export const musteriKisileriniGetir = async (musteriId) => {
  const { data } = await supabase
    .from('musteri_kisiler')
    .select('*')
    .eq('musteri_id', musteriId)
    .order('ana_kisi', { ascending: false })
    .order('olusturma_tarih', { ascending: true })
  return arrayToCamel(data) ?? []
}

export const musteriKisiEkle = async (kisi) => {
  const { id, olusturmaTarih, ...rest } = kisi
  const { data, error } = await supabase
    .from('musteri_kisiler')
    .insert(toSnake(rest))
    .select()
    .single()
  if (error) { console.error('musteriKisiEkle hata:', error.message); throw error }
  // Ana kişi olarak eklendiyse diğerlerini ana_kisi=false yap
  if (data?.ana_kisi) {
    await supabase
      .from('musteri_kisiler')
      .update({ ana_kisi: false })
      .eq('musteri_id', data.musteri_id)
      .neq('id', data.id)
  }
  return toCamel(data)
}

export const musteriKisiGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, ...rest } = guncellenmis
  const { data, error } = await supabase
    .from('musteri_kisiler')
    .update(toSnake(rest))
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('musteriKisiGuncelle hata:', error.message); throw error }
  if (data?.ana_kisi) {
    await supabase
      .from('musteri_kisiler')
      .update({ ana_kisi: false })
      .eq('musteri_id', data.musteri_id)
      .neq('id', data.id)
  }
  return toCamel(data)
}

export const musteriKisiSil = async (id) => {
  const { error } = await supabase.from('musteri_kisiler').delete().eq('id', id)
  if (error) console.error('musteriKisiSil hata:', error.message)
}
