import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

export const servisRaporlariniGetir = async () => {
  const hepsi = []
  const sayfa = 1000
  let off = 0
  while (true) {
    const { data, error } = await supabase
      .from('servis_raporlari')
      .select('*')
      .order('bil_tarih', { ascending: false, nullsFirst: false })
      .range(off, off + sayfa - 1)
    if (error) { console.error('servisRaporlariniGetir hata:', error.message); break }
    if (!data || data.length === 0) break
    hepsi.push(...data)
    if (data.length < sayfa) break
    off += sayfa
  }
  return arrayToCamel(hepsi)
}

export const servisRaporGetir = async (id) => {
  const { data, error } = await supabase.from('servis_raporlari').select('*').eq('id', id).single()
  if (error) { console.error('servisRaporGetir hata:', error.message); return null }
  return toCamel(data)
}

// Belirli müşterinin tüm raporları
export const musteriRaporlariniGetir = async (musteriId) => {
  const { data, error } = await supabase
    .from('servis_raporlari')
    .select('*')
    .eq('musteri_id', musteriId)
    .order('bil_tarih', { ascending: false, nullsFirst: false })
  if (error) { console.error(error.message); return [] }
  return arrayToCamel(data) ?? []
}

export const servisRaporEkle = async (rapor) => {
  const { id, olusturmaTarih, ...rest } = rapor
  const { data, error } = await supabase.from('servis_raporlari').insert(toSnake(rest)).select().single()
  if (error) { console.error('servisRaporEkle hata:', error.message); throw error }
  return toCamel(data)
}

export const servisRaporGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, ...rest } = guncellenmis
  const { data, error } = await supabase.from('servis_raporlari').update(toSnake(rest)).eq('id', id).select().single()
  if (error) { console.error('servisRaporGuncelle hata:', error.message); throw error }
  return toCamel(data)
}

export const servisRaporSil = async (id) => {
  const { error } = await supabase.from('servis_raporlari').delete().eq('id', id)
  if (error) console.error('servisRaporSil hata:', error.message)
}
