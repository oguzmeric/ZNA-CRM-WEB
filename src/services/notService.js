// Kullanıcının kişisel notları + opsiyonel müşteri bağlantısı + çizim ekleri.
// Web tarafı: text-only create/edit. Çizimleri sadece görüntüler.
// (Mobile tarafında crm-mobile/src/services/notService.js — aynı API + çizim upload).

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel } from '../lib/mapper'
import { cached, invalidate } from '../lib/cache'

export const KATEGORILER = [
  { id: 'kesif',     isim: 'Keşif',         renk: '#0ea5e9' },
  { id: 'toplanti',  isim: 'Toplantı Notu', renk: '#a855f7' },
  { id: 'fikir',     isim: 'Fikir',         renk: '#f59e0b' },
  { id: 'diger',     isim: 'Diğer',         renk: '#64748b' },
]

export const notlarimiGetir = (kullaniciId) =>
  cached(`notlarim:${kullaniciId}`, async () => {
    if (!kullaniciId) return []
    const { data, error } = await supabase
      .from('notlarim')
      .select('*, musteriler:musteri_id (id, firma, ad, soyad)')
      .eq('kullanici_id', kullaniciId)
      .order('olusturma_tarih', { ascending: false })
    if (error) { console.warn('notlarimiGetir', error.message); return [] }
    return arrayToCamel(data || []).map((n) => ({
      ...n,
      // Müşteri bilgisi çift mapper'a uğrayabiliyor — sade halini ekle
      musteriFirma: n.musteriler?.firma || (n.musteriler ? `${n.musteriler.ad ?? ''} ${n.musteriler.soyad ?? ''}`.trim() : null),
    }))
  })

export const notuGetir = async (id) => {
  const { data, error } = await supabase
    .from('notlarim')
    .select('*, musteriler:musteri_id (id, firma, ad, soyad)')
    .eq('id', id)
    .single()
  if (error) { console.warn('notuGetir', error.message); return null }
  return toCamel(data)
}

export const notEkle = async (kullaniciId, payload) => {
  const { data, error } = await supabase
    .from('notlarim')
    .insert({
      kullanici_id: kullaniciId,
      baslik: payload.baslik || null,
      icerik: payload.icerik || null,
      kategori: payload.kategori || 'diger',
      musteri_id: payload.musteriId || null,
      cizimler: payload.cizimler || [],
    })
    .select()
    .single()
  if (error) { console.warn('notEkle', error.message); return null }
  invalidate(`notlarim:${kullaniciId}`)
  return toCamel(data)
}

export const notGuncelle = async (id, payload, kullaniciId) => {
  const { data, error } = await supabase
    .from('notlarim')
    .update({
      baslik: payload.baslik ?? null,
      icerik: payload.icerik ?? null,
      kategori: payload.kategori || 'diger',
      musteri_id: payload.musteriId || null,
      cizimler: payload.cizimler ?? [],
    })
    .eq('id', id)
    .select()
    .single()
  if (error) { console.warn('notGuncelle', error.message); return null }
  if (kullaniciId) invalidate(`notlarim:${kullaniciId}`)
  return toCamel(data)
}

export const notSil = async (id, kullaniciId) => {
  // Önce çizim dosyalarını storage'dan sil
  const not = await notuGetir(id)
  if (Array.isArray(not?.cizimler)) {
    const paths = not.cizimler.map((c) => c.path).filter(Boolean)
    if (paths.length > 0) {
      await supabase.storage.from('not-cizimleri').remove(paths).catch(() => {})
    }
  }
  const { error } = await supabase.from('notlarim').delete().eq('id', id)
  if (error) throw error
  if (kullaniciId) invalidate(`notlarim:${kullaniciId}`)
}

// Bir çizim path'inden signed URL al (gösterim için)
export const cizimSignedUrl = async (path) => {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from('not-cizimleri')
    .createSignedUrl(path, 3600)
  if (error) return null
  return data.signedUrl
}
