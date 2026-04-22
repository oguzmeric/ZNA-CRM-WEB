import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

export const kullanicilariGetir = async () => {
  const { data } = await supabase.from('kullanicilar').select('*').order('id')
  return arrayToCamel(data)
}

export const kullaniciGirisKontrol = async (kullaniciAdi, sifre) => {
  const { data } = await supabase
    .from('kullanicilar').select('*')
    .eq('kullanici_adi', kullaniciAdi).eq('sifre', sifre).single()
  return toCamel(data) || null
}

export const kullaniciEkle = async (kullanici) => {
  const { id, olusturmaTarih, ...rest } = kullanici
  const { data, error } = await supabase.from('kullanicilar').insert(toSnake(rest)).select().single()
  if (error) { console.error('kullaniciEkle hata:', error.message); throw error }
  return toCamel(data)
}

export const kullaniciGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, ...rest } = guncellenmis
  const { data, error } = await supabase.from('kullanicilar').update(toSnake(rest)).eq('id', id).select().single()
  if (error) { console.error('kullaniciGuncelle hata:', error.message); throw error }
  return toCamel(data)
}

export const kullaniciSil = async (id) => {
  const { error } = await supabase.from('kullanicilar').delete().eq('id', id).eq('silinebilir', true)
  if (error) console.error('kullaniciSil hata:', error.message)
}

export const kullaniciDurumGuncelle = async (id, durum) => {
  const { error } = await supabase.from('kullanicilar').update({ durum }).eq('id', id)
  if (error) console.error('kullaniciDurumGuncelle hata:', error.message)
}
