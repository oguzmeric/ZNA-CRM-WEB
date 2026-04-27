import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel } from '../lib/mapper'

// Kullanıcının dahil olduğu tüm mesajlar (gönderen veya alıcı)
export const mesajlariGetir = async (kullaniciId) => {
  const { data, error } = await supabase
    .from('mesajlar')
    .select('*')
    .or(`gonderici_id.eq.${kullaniciId},alici_id.eq.${kullaniciId}`)
    .order('tarih', { ascending: true })
  if (error) { console.error('mesajlariGetir hata:', error.message); return [] }
  return arrayToCamel(data)
}

export const mesajGonder = async (gondericId, aliciId, icerik) => {
  const { data, error } = await supabase
    .from('mesajlar')
    .insert({ gonderici_id: gondericId, alici_id: aliciId, icerik })
    .select()
    .single()
  if (error) { console.error('mesajGonder hata:', error.message); return null }
  return toCamel(data)
}

// Belirli bir kişiden gelen ve henüz okunmamış mesajları okundu olarak işaretle
export const konusmayiOkunduYap = async (kullaniciId, kisiId) => {
  const { error } = await supabase
    .from('mesajlar')
    .update({ okundu: true })
    .eq('alici_id', kullaniciId)
    .eq('gonderici_id', kisiId)
    .eq('okundu', false)
  if (error) console.error('konusmayiOkunduYap hata:', error.message)
}
