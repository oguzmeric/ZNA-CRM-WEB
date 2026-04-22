import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel } from '../lib/mapper'

// Manual field mapping for kargo (has nested objects that should NOT be snake_case converted inside)
const kargoToSnake = (kargo) => {
  const result = {}
  const fieldMap = {
    kargoNo: 'kargo_no',
    tip: 'tip',
    durum: 'durum',
    kargoFirmasi: 'kargo_firmasi',
    takipNo: 'takip_no',
    gonderen: 'gonderen',
    alici: 'alici',
    icerik: 'icerik',
    agirlik: 'agirlik',
    desi: 'desi',
    ucret: 'ucret',
    odemeYontemi: 'odeme_yontemi',
    tahminiTeslim: 'tahmini_teslim',
    teslimTarihi: 'teslim_tarihi',
    ilgiliModul: 'ilgili_modul',
    ilgiliKullaniciIds: 'ilgili_kullanici_ids',
    notlar: 'notlar',
    durumGecmisi: 'durum_gecmisi',
    olusturanId: 'olusturan_id',
    olusturanAd: 'olusturan_ad',
  }
  for (const [camel, snake] of Object.entries(fieldMap)) {
    if (kargo[camel] !== undefined) {
      result[snake] = kargo[camel]
    }
  }
  return result
}

export const kargolariGetir = async () => {
  const { data } = await supabase.from('kargolar').select('*').order('id', { ascending: false })
  return (data || []).map(toCamel)
}

export const kargoGetir = async (id) => {
  const { data } = await supabase.from('kargolar').select('*').eq('id', id).single()
  return toCamel(data)
}

export const kargoEkle = async (kargo) => {
  const { id, olusturmaTarihi, guncellemeTarihi, ...rest } = kargo
  const { data, error } = await supabase.from('kargolar').insert(kargoToSnake(rest)).select().single()
  if (error) { console.error('kargoEkle hata:', error.message); return null }
  return toCamel(data)
}

export const kargoGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarihi, guncellemeTarihi, ...rest } = guncellenmis
  const { data, error } = await supabase.from('kargolar').update({
    ...kargoToSnake(rest),
    guncelleme_tarihi: new Date().toISOString()
  }).eq('id', id).select().single()
  if (error) { console.error('kargoGuncelle hata:', error.message); return null }
  return toCamel(data)
}

export const kargoSil = async (id) => {
  await supabase.from('kargolar').delete().eq('id', id)
}
