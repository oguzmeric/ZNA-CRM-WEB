import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

export const servisTalepleriniGetir = async () => {
  const hepsi = []
  const sayfa = 1000
  let off = 0
  while (true) {
    const { data, error } = await supabase.from('servis_talepleri').select('*').order('id', { ascending: false }).range(off, off + sayfa - 1)
    if (error) { console.error('servisTalepleriniGetir hata:', error.message); throw error }
    if (!data || data.length === 0) break
    hepsi.push(...data)
    if (data.length < sayfa) break
    off += sayfa
  }
  return arrayToCamel(hepsi)
}

export const servisTalepGetir = async (id) => {
  const { data } = await supabase.from('servis_talepleri').select('*').eq('id', id).single()
  return toCamel(data)
}

export const servisTalepEkle = async (talep) => {
  const { id, olusturmaTarihi, guncellemeTarihi, ...rest } = talep
  const { data, error } = await supabase.from('servis_talepleri').insert(toSnake(rest)).select().single()
  if (error) { console.error('servisTalepEkle hata:', error.message); throw error }
  return toCamel(data)
}

export const servisTalepGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarihi, guncellemeTarihi, ...rest } = guncellenmis
  const { data, error } = await supabase.from('servis_talepleri').update({
    ...toSnake(rest),
    guncelleme_tarihi: new Date().toISOString()
  }).eq('id', id).select().single()
  if (error) { console.error('servisTalepGuncelle hata:', error.message); throw error }
  return toCamel(data)
}

export const servisTalepSil = async (id) => {
  const { error } = await supabase.from('servis_talepleri').delete().eq('id', id)
  if (error) console.error('servisTalepSil hata:', error.message)
}
