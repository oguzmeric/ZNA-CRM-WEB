import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cached, invalidate } from '../lib/cache'

export const teklifleriGetir = () => cached('teklifler:list', async () => {
  const hepsi = []
  const sayfa = 1000
  let off = 0
  while (true) {
    const { data, error } = await supabase.from('teklifler').select('*').order('olusturma_tarih', { ascending: false }).range(off, off + sayfa - 1)
    if (error) { console.error('teklifleriGetir hata:', error.message); break }
    if (!data || data.length === 0) break
    hepsi.push(...data)
    if (data.length < sayfa) break
    off += sayfa
  }
  return arrayToCamel(hepsi)
})

export const teklifGetir = (id) => cached(`teklif:${id}`, async () => {
  const { data } = await supabase.from('teklifler').select('*').eq('id', id).single()
  return toCamel(data)
})

// Sayısal/ID alanlarda boş string → null, Postgres bigint hatası önlemek için
const NUMERIC_ALANLAR = ['musteriId', 'gorusmeId', 'musteriTalepId', 'dovizKuru', 'genelIskonto', 'revizyon', 'genelToplam']
const normalize = (obj) => {
  const out = { ...obj }
  NUMERIC_ALANLAR.forEach(k => {
    if (out[k] === '' || out[k] === undefined) out[k] = null
  })
  // Tarih alanları da aynı şekilde
  const TARIH_ALANLAR = ['gecerlilikTarihi', 'kabulTarihi', 'teslimTarihi', 'musteriTalepNo']
  TARIH_ALANLAR.forEach(k => {
    if (out[k] === '' || out[k] === undefined) out[k] = null
  })
  return out
}

export const teklifEkle = async (teklif) => {
  const { id, olusturmaTarih, ...rest } = normalize(teklif)
  const { data, error } = await supabase.from('teklifler').insert(toSnake(rest)).select().single()
  if (error) { console.error('teklifEkle hata:', error.message); throw error }
  invalidate('teklifler:list')
  return toCamel(data)
}

export const teklifGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, ...rest } = normalize(guncellenmis)
  const { data, error } = await supabase.from('teklifler').update(toSnake(rest)).eq('id', id).select().single()
  if (error) { console.error('teklifGuncelle hata:', error.message); throw error }
  invalidate('teklifler:list', `teklif:${id}`)
  return toCamel(data)
}

export const teklifSil = async (id) => {
  await supabase.from('teklifler').delete().eq('id', id)
  invalidate('teklifler:list', `teklif:${id}`)
}

export const musteriTalepleriniGetir = async () => {
  const { data } = await supabase.from('musteri_teklif_talepleri').select('*').order('tarih', { ascending: false })
  return arrayToCamel(data)
}

export const musteriTalepEkle = async (talep) => {
  const { id, ...rest } = talep
  const { data } = await supabase.from('musteri_teklif_talepleri').insert(toSnake(rest)).select().single()
  return toCamel(data)
}

export const musteriTalepGuncelle = async (id, guncellenmis) => {
  const { id: _id, ...rest } = guncellenmis
  const { data } = await supabase.from('musteri_teklif_talepleri').update(toSnake(rest)).eq('id', id).select().single()
  return toCamel(data)
}
