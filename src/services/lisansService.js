import { supabase } from '../lib/supabase'
import { pagedFetch } from '../lib/pagedFetch'
import { cached, invalidate } from '../lib/cache'

// Form (camelCase) → DB (snake_case)
const formToDb = (l) => ({
  firma_adi: l.firmaAdi || null,
  musteri_id: l.musteriId || null,
  lisans_no: l.lisansKodu || null,
  lisans_id: l.lisansId || null,
  lisans_turu: l.lisansTuru || null,
  lisans_tipi: l.lisansTipi || 'sureksiz',
  sunucu_adi: l.sunucuAdi || null,
  proje: l.proje || null,
  lokasyon: l.lokasyon || null,
  baslangic_tarihi: l.baslangicTarih || null,
  bitis_tarihi: l.bitisTarih || null,
  durum: l.durum || 'aktif',
  kamera_sayisi: l.kanalSayisi ? Number(l.kanalSayisi) : null,
  notlar: l.notlar || null,
})

// DB (snake_case) → Form (camelCase)
const dbToForm = (row) => {
  if (!row) return null
  return {
    id: row.id,
    firmaAdi: row.firma_adi || '',
    musteriId: row.musteri_id || '',
    lisansKodu: row.lisans_no || '',
    lisansId: row.lisans_id || '',
    lisansTuru: row.lisans_turu || '',
    lisansTipi: row.lisans_tipi || 'sureksiz',
    sunucuAdi: row.sunucu_adi || '',
    proje: row.proje || '',
    lokasyon: row.lokasyon || '',
    baslangicTarih: row.baslangic_tarihi || '',
    bitisTarih: row.bitis_tarihi || '',
    durum: row.durum || 'aktif',
    kanalSayisi: row.kamera_sayisi || '',
    notlar: row.notlar || '',
    gorselYolu: row.gorsel_yolu || '',
    olusturmaTarih: row.olusturma_tarih || '',
    demoGun: hesaplaDemoGun(row.baslangic_tarihi, row.bitis_tarihi),
  }
}

// Demo gün sayısını başlangıç-bitiş farkından hesapla.
// 7/14/30/60/90 listesinden en yakını eşleşmezse '30' fallback.
function hesaplaDemoGun(bas, bitis) {
  if (!bas || !bitis) return '30'
  const ms = new Date(bitis) - new Date(bas)
  const gun = Math.round(ms / (1000 * 60 * 60 * 24))
  const sec = [7, 14, 30, 60, 90].find((g) => g === gun)
  return sec ? String(sec) : String(gun)
}

export const lisanslariGetir = () => cached('lisanslar:list', async () => {
  const data = await pagedFetch((off, size) =>
    supabase.from('trassir_lisanslar').select('*').order('olusturma_tarih', { ascending: false }).range(off, off + size - 1)
  )
  return (data || []).map(dbToForm)
})

export const lisansGetir = (id) => cached(`lisans:${id}`, async () => {
  const { data, error } = await supabase.from('trassir_lisanslar').select('*').eq('id', id).single()
  if (error) { console.error('lisansGetir hata:', error.message); return null }
  return dbToForm(data)
})

export const lisansEkle = async (lisans) => {
  const { data, error } = await supabase.from('trassir_lisanslar').insert(formToDb(lisans)).select().single()
  if (error) { console.error('lisansEkle hata:', error.message); return null }
  invalidate('lisanslar:list')
  return dbToForm(data)
}

export const lisansGuncelle = async (id, guncellenmis) => {
  const { data, error } = await supabase.from('trassir_lisanslar').update(formToDb(guncellenmis)).eq('id', id).select().single()
  if (error) { console.error('lisansGuncelle hata:', error.message); return null }
  invalidate('lisanslar:list', `lisans:${id}`)
  return dbToForm(data)
}

export const lisansSil = async (id) => {
  // Görsel varsa storage'dan da temizle
  const { data } = await supabase.from('trassir_lisanslar').select('gorsel_yolu').eq('id', id).maybeSingle()
  if (data?.gorsel_yolu) {
    await supabase.storage.from(GORSEL_BUCKET).remove([data.gorsel_yolu])
  }
  await supabase.from('trassir_lisanslar').delete().eq('id', id)
  invalidate('lisanslar:list', `lisans:${id}`)
}

// ---------- Lisans görseli (lisans özeti ekran görüntüsü) ----------
const GORSEL_BUCKET = 'lisans-gorsel'
export const GORSEL_MAX_MB = 8
export const GORSEL_MAX = GORSEL_MAX_MB * 1024 * 1024

// Yükle + satıra yaz; eski görsel varsa storage'dan sil. Güncel satırı döner.
export const lisansGorselYukle = async (id, dosya, eskiYol = null) => {
  const ext = (dosya.name.split('.').pop() || 'png').toLowerCase().slice(0, 8)
  const yol = `${id}/${Date.now()}.${ext}`
  const { error: upErr } = await supabase.storage.from(GORSEL_BUCKET).upload(yol, dosya, {
    cacheControl: '3600', upsert: false,
  })
  if (upErr) { console.error('lisansGorselYukle upload:', upErr.message); return null }
  const { data, error } = await supabase.from('trassir_lisanslar')
    .update({ gorsel_yolu: yol }).eq('id', id).select().single()
  if (error) {
    console.error('lisansGorselYukle update:', error.message)
    await supabase.storage.from(GORSEL_BUCKET).remove([yol])
    return null
  }
  if (eskiYol && eskiYol !== yol) {
    await supabase.storage.from(GORSEL_BUCKET).remove([eskiYol])
  }
  invalidate('lisanslar:list', `lisans:${id}`)
  return dbToForm(data)
}

export const lisansGorselSil = async (id, yol) => {
  if (yol) await supabase.storage.from(GORSEL_BUCKET).remove([yol])
  const { data, error } = await supabase.from('trassir_lisanslar')
    .update({ gorsel_yolu: null }).eq('id', id).select().single()
  if (error) { console.error('lisansGorselSil hata:', error.message); return null }
  invalidate('lisanslar:list', `lisans:${id}`)
  return dbToForm(data)
}

// Private bucket — görüntüleme için kısa ömürlü imzalı URL
export const lisansGorselUrl = async (yol) => {
  if (!yol) return null
  const { data, error } = await supabase.storage.from(GORSEL_BUCKET).createSignedUrl(yol, 3600)
  if (error) { console.error('lisansGorselUrl hata:', error.message); return null }
  return data?.signedUrl || null
}
