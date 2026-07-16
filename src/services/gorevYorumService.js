import { supabase } from '../lib/supabase'
import { toCamel, toSnake } from '../lib/mapper'

// Görev yorumları (mig 174). Yorumlar gorevler.yorumlar JSONB'sinden ayrı
// tabloya taşındı: yorum INSERT'i tüm personele açık, görev UPDATE'i kısıtlı
// kaldığı için "herkes yorum yapar ama herkes görevi düzenleyemez" sağlanır.

// Render'ın beklediği eski şekle indir: {id, yazar, yazarId, icerik, tarih, duzenlendi}
// zaman = ISO (sıralama için — mobil notlarla birleşik zaman çizelgesinde kullanılır)
const yorumBicim = (r) => {
  const c = toCamel(r)
  return {
    id: c.id,
    yazar: c.yazarAd,
    yazarId: c.kullaniciId,
    icerik: c.icerik,
    // eski kayıtlarda orijinal tr-TR metni korundu; yenilerde tarihi biçimlendir
    tarih: c.zamanMetin || (c.olusturmaTarih ? new Date(c.olusturmaTarih).toLocaleString('tr-TR') : ''),
    zaman: c.olusturmaTarih || null,
    duzenlendi: !!c.duzenlendi,
    kaynak: 'web',
  }
}

export const gorevYorumlariGetir = async (gorevId) => {
  const { data, error } = await supabase
    .from('gorev_yorumlari')
    .select('*')
    .eq('gorev_id', gorevId)
    .order('olusturma_tarih', { ascending: true })
  if (error) { console.error('[gorevYorumlariGetir]', error.message); return [] }
  return (data || []).map(yorumBicim)
}

export const gorevYorumEkle = async ({ gorevId, kullaniciId, yazarAd, icerik }) => {
  const { data, error } = await supabase
    .from('gorev_yorumlari')
    .insert(toSnake({ gorevId, kullaniciId, yazarAd, icerik }))
    .select()
    .single()
  if (error) { console.error('[gorevYorumEkle]', error.message); throw error }
  return yorumBicim(data)
}

export const gorevYorumGuncelle = async (id, icerik) => {
  const { data, error } = await supabase
    .from('gorev_yorumlari')
    .update({ icerik, duzenlendi: true, guncelleme_tarih: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('[gorevYorumGuncelle]', error.message); throw error }
  return yorumBicim(data)
}

export const gorevYorumSil = async (id) => {
  const { error } = await supabase.from('gorev_yorumlari').delete().eq('id', id)
  if (error) { console.error('[gorevYorumSil]', error.message); throw error }
}

// Bir görev listesindeki yorum sayılarını topluca getir (liste rozetleri için)
export const gorevYorumSayilari = async (gorevIdler) => {
  if (!gorevIdler?.length) return {}
  const { data, error } = await supabase
    .from('gorev_yorumlari')
    .select('gorev_id')
    .in('gorev_id', gorevIdler)
  if (error) { console.error('[gorevYorumSayilari]', error.message); return {} }
  const sayac = {}
  for (const r of data || []) sayac[r.gorev_id] = (sayac[r.gorev_id] || 0) + 1
  return sayac
}
