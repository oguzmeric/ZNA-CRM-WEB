import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cached, invalidate } from '../lib/cache'

export const gorusmeleriGetir = () => cached('gorusmeler:list', async () => {
  const hepsi = []
  const sayfa = 1000
  let off = 0
  while (true) {
    const { data, error } = await supabase.from('gorusmeler').select('*').order('olusturma_tarih', { ascending: false }).range(off, off + sayfa - 1)
    if (error) { console.error('gorusmeleriGetir hata:', error.message); break }
    if (!data || data.length === 0) break
    hepsi.push(...data)
    if (data.length < sayfa) break
    off += sayfa
  }
  return arrayToCamel(hepsi)
})

export const gorusmeGetir = (id) => cached(`gorusme:${id}`, async () => {
  const { data } = await supabase.from('gorusmeler').select('*').eq('id', id).single()
  return toCamel(data)
})

export const gorusmeEkle = async (gorusme) => {
  const { id, olusturmaTarih, manuelKonu, ...rest } = gorusme
  const { data, error } = await supabase.from('gorusmeler').insert(toSnake(rest)).select().single()
  if (error) { console.error('gorusmeEkle hata:', error.message); return null }
  invalidate('gorusmeler:list')
  return toCamel(data)
}

export const gorusmeGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, manuelKonu, ...rest } = guncellenmis
  const { data, error } = await supabase.from('gorusmeler').update(toSnake(rest)).eq('id', id).select().single()
  if (error) { console.error('gorusmeGuncelle hata:', error.message); return null }
  invalidate('gorusmeler:list', `gorusme:${id}`)
  return toCamel(data)
}

export const gorusmeSil = async (id) => {
  const { data: g } = await supabase.from('gorusmeler').select('dosyalar').eq('id', id).single()
  const dosyaPaths = (g?.dosyalar || []).map(d => d.path).filter(Boolean)
  if (dosyaPaths.length > 0) {
    await supabase.storage.from('gorusme-dosyalari').remove(dosyaPaths)
  }
  await supabase.from('gorusmeler').delete().eq('id', id)
  invalidate('gorusmeler:list', `gorusme:${id}`)
}

// ─────────────────────────────────────────────────────────────────────
// DOSYA yönetimi
// ─────────────────────────────────────────────────────────────────────

// Dosya yükle + dosyalar array'ini güncelle
// Döner: yeni dosya meta objesi { path, name, type, size, uploadedAt, uploaderAd }
export const dosyaYukle = async (gorusmeId, file, uploaderAd = '') => {
  const safeName = file.name.replace(/[^\w.\-]/g, '_')
  const path = `${gorusmeId}/${Date.now()}_${safeName}`
  const { error: upError } = await supabase.storage
    .from('gorusme-dosyalari')
    .upload(path, file, { contentType: file.type })
  if (upError) throw upError

  const yeniMeta = {
    path,
    name: file.name,
    type: file.type,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    uploaderAd: uploaderAd || null,
  }

  const { data: mevcut } = await supabase.from('gorusmeler').select('dosyalar').eq('id', gorusmeId).single()
  const yeniDosyalar = [...(mevcut?.dosyalar || []), yeniMeta]
  const { error: updError } = await supabase.from('gorusmeler').update({ dosyalar: yeniDosyalar }).eq('id', gorusmeId)
  if (updError) throw updError

  return yeniMeta
}

// Dosyaya geçici (60 sn) signed URL üret — bucket private olduğu için public URL yok
export const dosyaLinkiAl = async (path) => {
  const { data, error } = await supabase.storage
    .from('gorusme-dosyalari')
    .createSignedUrl(path, 60)
  if (error) throw error
  return data.signedUrl
}

// Dosya sil (storage + dosyalar array)
export const dosyaSil = async (gorusmeId, path) => {
  const { error: delError } = await supabase.storage
    .from('gorusme-dosyalari')
    .remove([path])
  if (delError) throw delError

  const { data: mevcut } = await supabase.from('gorusmeler').select('dosyalar').eq('id', gorusmeId).single()
  const kalanlar = (mevcut?.dosyalar || []).filter(d => d.path !== path)
  const { error: updError } = await supabase.from('gorusmeler').update({ dosyalar: kalanlar }).eq('id', gorusmeId)
  if (updError) throw updError
}
