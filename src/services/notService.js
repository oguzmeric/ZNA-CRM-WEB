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
      ekler: payload.ekler || [],
      hatirlatma_tarihi: payload.hatirlatmaTarihi || null,
      hatirlatildi: false,
    })
    .select()
    .single()
  if (error) { console.warn('notEkle', error.message); return null }
  invalidate(`notlarim:${kullaniciId}`)
  return toCamel(data)
}

export const notGuncelle = async (id, payload, kullaniciId) => {
  const guncelle = {
    baslik: payload.baslik ?? null,
    icerik: payload.icerik ?? null,
    kategori: payload.kategori || 'diger',
    musteri_id: payload.musteriId || null,
    cizimler: payload.cizimler ?? [],
    ekler: payload.ekler ?? [],
    hatirlatma_tarihi: payload.hatirlatmaTarihi || null,
  }
  if (payload.hatirlatmaTarihi) guncelle.hatirlatildi = false
  const { data, error } = await supabase
    .from('notlarim')
    .update(guncelle)
    .eq('id', id)
    .select()
    .single()
  if (error) { console.warn('notGuncelle', error.message); return null }
  if (kullaniciId) invalidate(`notlarim:${kullaniciId}`)
  return toCamel(data)
}

export const notSil = async (id, kullaniciId) => {
  // Önce çizim ve ek dosyalarını storage'dan sil
  const not = await notuGetir(id)
  if (Array.isArray(not?.cizimler)) {
    const paths = not.cizimler.map((c) => c.path).filter(Boolean)
    if (paths.length > 0) {
      await supabase.storage.from('not-cizimleri').remove(paths).catch(() => {})
    }
  }
  if (Array.isArray(not?.ekler)) {
    const paths = not.ekler.map((e) => e.path).filter(Boolean)
    if (paths.length > 0) {
      await supabase.storage.from('not-ekleri').remove(paths).catch(() => {})
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

// Ek (foto/belge) için signed URL
export const ekSignedUrl = async (path) => {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from('not-ekleri')
    .createSignedUrl(path, 3600)
  if (error) return null
  return data.signedUrl
}

// Web'den ek yükle (File API)
export const ekYukleWeb = async ({ file, kullaniciId, notId }) => {
  if (!file) return null
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const guvenliAd = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
    const path = `kullanici_${kullaniciId}/not_${notId ?? 'taslak'}/${ts}_${guvenliAd}`

    const { error } = await supabase.storage
      .from('not-ekleri')
      .upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
    if (error) {
      console.warn('[ekYukleWeb]', error.message)
      return null
    }
    return {
      tip: file.type?.startsWith('image/') ? 'foto' : 'belge',
      path,
      ad: file.name,
      boyut: file.size,
      mimeType: file.type,
      eklenmeTarih: new Date().toISOString(),
    }
  } catch (e) {
    console.warn('[ekYukleWeb catch]', e?.message)
    return null
  }
}

export const ekSil = async (path) => {
  if (!path) return
  await supabase.storage.from('not-ekleri').remove([path]).catch(() => {})
}

// Sadece ekler array'i güncelle
export const notEkleriGuncelle = async (id, ekler, kullaniciId) => {
  if (!id) return null
  const { data, error } = await supabase
    .from('notlarim')
    .update({ ekler: ekler ?? [] })
    .eq('id', id)
    .select('id, ekler')
    .single()
  if (error) { console.warn('notEkleriGuncelle', error.message); return null }
  if (kullaniciId) invalidate(`notlarim:${kullaniciId}`)
  return data
}
