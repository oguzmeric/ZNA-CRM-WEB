import { supabase } from '../lib/supabase'
import { toCamel, toSnake } from '../lib/mapper'

// Görüşme yorumları (mig 184) — gorev_yorumlari (mig 174) deseninin birebir
// karşılığı: herkes okur + kendi adına yorum ekler; kendi yorumunu düzenler/
// siler; admin hepsi. dosyalar = [{url,name,type,size}] (public URL ekler).

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

export const gorusmeYorumlariGetir = async (gorusmeId) => {
  const { data, error } = await supabase
    .from('gorusme_yorumlari')
    .select('*')
    .eq('gorusme_id', gorusmeId)
    .order('olusturma_tarih', { ascending: true })
  if (error) { console.error('[gorusmeYorumlariGetir]', error.message); return [] }
  return (data || []).map(yorumBicim)
}

export const gorusmeYorumEkle = async ({ gorusmeId, kullaniciId, yazarAd, icerik, dosyalar = [] }) => {
  const { data, error } = await supabase
    .from('gorusme_yorumlari')
    .insert(toSnake({ gorusmeId, kullaniciId, yazarAd, icerik, dosyalar }))
    .select()
    .single()
  if (error) { console.error('[gorusmeYorumEkle]', error.message); throw error }
  return yorumBicim(data)
}

export const gorusmeYorumGuncelle = async (id, icerik) => {
  const { data, error } = await supabase
    .from('gorusme_yorumlari')
    .update({ icerik, duzenlendi: true, guncelleme_tarih: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('[gorusmeYorumGuncelle]', error.message); throw error }
  return yorumBicim(data)
}

export const gorusmeYorumSil = async (id) => {
  const { error } = await supabase.from('gorusme_yorumlari').delete().eq('id', id)
  if (error) { console.error('[gorusmeYorumSil]', error.message); throw error }
}
