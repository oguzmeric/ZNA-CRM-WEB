import { supabase } from '../lib/supabase'
import { toCamel, toSnake } from '../lib/mapper'

// Proforma Fatura (fatura_talepleri) yorumları (mig 214) — gorusme_yorumlari
// (mig 184) deseninin birebir karşılığı: herkes (staff) okur + kendi adına
// yorum ekler; kendi yorumunu siler; admin hepsi.
// dosyalar = [{url,name,type,size}] (public URL ekler).

const yorumBicim = (r) => {
  const c = toCamel(r)
  return {
    id: c.id,
    yazar: c.yazarAd,
    yazarId: c.kullaniciId,
    icerik: c.icerik,
    dosyalar: Array.isArray(c.dosyalar) ? c.dosyalar : [],
    tarih: c.olusturmaTarih ? new Date(c.olusturmaTarih).toLocaleString('tr-TR') : '',
    zaman: c.olusturmaTarih || null,
    duzenlendi: !!c.duzenlendi,
  }
}

export const faturaTalebiYorumlariGetir = async (talepId) => {
  const { data, error } = await supabase
    .from('fatura_talebi_yorumlari')
    .select('*')
    .eq('talep_id', talepId)
    .order('olusturma_tarih', { ascending: true })
  if (error) { console.error('[faturaTalebiYorumlariGetir]', error.message); return [] }
  return (data || []).map(yorumBicim)
}

export const faturaTalebiYorumEkle = async ({ talepId, kullaniciId, yazarAd, icerik, dosyalar = [] }) => {
  const { data, error } = await supabase
    .from('fatura_talebi_yorumlari')
    .insert(toSnake({ talepId, kullaniciId, yazarAd, icerik, dosyalar }))
    .select()
    .single()
  if (error) { console.error('[faturaTalebiYorumEkle]', error.message); throw error }
  return yorumBicim(data)
}

export const faturaTalebiYorumSil = async (id) => {
  const { error } = await supabase.from('fatura_talebi_yorumlari').delete().eq('id', id)
  if (error) { console.error('[faturaTalebiYorumSil]', error.message); throw error }
}
