import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cached, invalidate, invalidatePrefix } from '../lib/cache'

export const musterileriGetir = () => cached('musteriler:list', async () => {
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
})

export const musteriGetir = (id) => cached(`musteri:${id}`, async () => {
  const { data } = await supabase.from('musteriler').select('*').eq('id', id).single()
  return toCamel(data)
})

export const musteriEkle = async (musteri) => {
  const { id, olusturmaTarih, ...rest } = musteri
  const { data, error } = await supabase.from('musteriler').insert(toSnake(rest)).select().single()
  if (error) { console.error('musteriEkle hata:', error.message); throw error }
  invalidate('musteriler:list')
  return toCamel(data)
}

export const musteriGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, ...rest } = guncellenmis
  const payload = toSnake(rest)
  const { data, error } = await supabase.from('musteriler').update(payload).eq('id', id).select().single()
  if (error) { console.error('musteriGuncelle hata:', error.message); throw error }
  invalidate('musteriler:list', `musteri:${id}`)
  return toCamel(data)
}

export const musteriSil = async (id) => {
  const { error } = await supabase.from('musteriler').delete().eq('id', id)
  if (error) console.error('musteriSil hata:', error.message)
  invalidate('musteriler:list', `musteri:${id}`)
}

// Müşteri portalı: oturumdaki müşterinin kendi musteri kaydı + atanmış temsilci
// RLS sayesinde customer sadece kendi musteri satırını görür.
export const benimMusteriKaydim = async () => {
  const { data, error } = await supabase
    .from('musteriler')
    .select('*, temsilci:kullanicilar!temsilci_kullanici_id(id, ad, email, durum, tip)')
    .limit(1)
    .maybeSingle()
  if (error) { console.error('benimMusteriKaydim hata:', error.message); return null }
  if (!data) return null
  const { temsilci, ...rest } = data
  return { ...toCamel(rest), temsilci: temsilci ? toCamel(temsilci) : null }
}
