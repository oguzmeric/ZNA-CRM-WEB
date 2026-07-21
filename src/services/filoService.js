// Filo Yönetimi servisi — bakım / belge / yakıt / sürücü (mig 095 + 143).
// KM kaynağı: Mobiltek odometer 0 döndüğü için güncel KM, yakıt fişi ve bakım
// girişlerindeki km alanından beslenir (kayıt eklenince araç km'si güncellenir).

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

const BUCKET = 'filo-belge'

export const BAKIM_TIPLERI = [
  { id: 'periyodik', isim: 'Periyodik Bakım' },
  { id: 'motor',     isim: 'Motor / Mekanik' },
  { id: 'lastik',    isim: 'Lastik' },
  { id: 'fren',      isim: 'Fren' },
  { id: 'aku',       isim: 'Akü' },
  { id: 'sanziman',  isim: 'Şanzıman' },
  { id: 'kaporta',   isim: 'Kaporta / Boya' },
  { id: 'diger',     isim: 'Diğer' },
]

export const BELGE_TIPLERI = [
  { id: 'muayene', isim: 'Muayene',          aracKolon: 'muayene_bitis' },
  { id: 'sigorta', isim: 'Trafik Sigortası', aracKolon: 'sigorta_bitis' },
  { id: 'kasko',   isim: 'Kasko',            aracKolon: 'kasko_bitis' },
  { id: 'egzoz',   isim: 'Egzoz Emisyon',    aracKolon: null },
  { id: 'ruhsat',  isim: 'Ruhsat',           aracKolon: null },
  { id: 'diger',   isim: 'Diğer',            aracKolon: null },
]

// ── Araçlar ──────────────────────────────────────────────────────────
export const filoAraclariGetir = async () => {
  const { data, error } = await supabase
    .from('sirket_araclari')
    .select('*')
    .eq('aktif', true)
    .order('plaka')
  if (error) { console.error('filoAraclariGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const filoAracGuncelle = async (id, payload) => {
  const { data, error } = await supabase
    .from('sirket_araclari')
    .update(toSnake(payload))
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('filoAracGuncelle hata:', error.message); return null }
  return toCamel(data)
}

// Kayıtlardan gelen km, araçtaki değerden büyükse güncelle
const aracKmTazele = async (aracId, km) => {
  if (!aracId || !km) return
  const { data: a } = await supabase
    .from('sirket_araclari').select('guncel_km').eq('id', aracId).single()
  if (a && (!a.guncel_km || km > a.guncel_km)) {
    await supabase.from('sirket_araclari').update({
      guncel_km: km,
      guncel_km_zamani: new Date().toISOString(),
    }).eq('id', aracId)
  }
}

// ── Bakım ────────────────────────────────────────────────────────────
export const bakimlariGetir = async () => {
  const { data, error } = await supabase
    .from('arac_bakim_kayitlari')
    .select('*, arac:arac_id (id, plaka, marka, model)')
    .order('tarih', { ascending: false })
    .limit(500)
  if (error) { console.error('bakimlariGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const bakimEkle = async (payload) => {
  const { data, error } = await supabase
    .from('arac_bakim_kayitlari')
    .insert(toSnake(payload))
    .select()
    .single()
  if (error) { console.error('bakimEkle hata:', error.message); return { _hata: error.message } }
  // Araç km + sonraki bakım bilgilerini güncelle
  await aracKmTazele(payload.aracId, payload.km)
  const aracGuncelle = {}
  if (payload.sonrakiBakimKm) aracGuncelle.sonraki_bakim_km = payload.sonrakiBakimKm
  if (payload.sonrakiBakimTarih) aracGuncelle.sonraki_bakim_tarih = payload.sonrakiBakimTarih
  if (Object.keys(aracGuncelle).length) {
    await supabase.from('sirket_araclari').update(aracGuncelle).eq('id', payload.aracId)
  }
  return toCamel(data)
}

export const bakimSil = async (id) => {
  const { error } = await supabase.from('arac_bakim_kayitlari').delete().eq('id', id)
  if (error) { console.error('bakimSil hata:', error.message); return false }
  return true
}

// ── Belgeler ─────────────────────────────────────────────────────────
export const belgeleriGetir = async () => {
  const { data, error } = await supabase
    .from('arac_belgeleri')
    .select('*, arac:arac_id (id, plaka, marka, model)')
    .order('bitis_tarih', { ascending: true })
  if (error) { console.error('belgeleriGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const belgeEkle = async (payload) => {
  const { data, error } = await supabase
    .from('arac_belgeleri')
    .insert(toSnake(payload))
    .select()
    .single()
  if (error) { console.error('belgeEkle hata:', error.message); return { _hata: error.message } }
  // Muayene/sigorta/kasko ise araç kartındaki bitiş tarihini de güncelle (cron uyarıları buradan okur)
  const tip = BELGE_TIPLERI.find(t => t.id === payload.belgeTipi)
  if (tip?.aracKolon && payload.bitisTarih) {
    await supabase.from('sirket_araclari')
      .update({ [tip.aracKolon]: payload.bitisTarih })
      .eq('id', payload.aracId)
  }
  return toCamel(data)
}

export const belgeSil = async (belge) => {
  const { error } = await supabase.from('arac_belgeleri').delete().eq('id', belge.id)
  if (error) { console.error('belgeSil hata:', error.message); return false }
  if (belge.dosyaUrl) {
    await supabase.storage.from(BUCKET).remove([belge.dosyaUrl]).catch(() => {})
  }
  return true
}

// ── Yakıt ────────────────────────────────────────────────────────────
export const yakitlariGetir = async () => {
  const { data, error } = await supabase
    .from('arac_yakit_kayitlari')
    .select('*, arac:arac_id (id, plaka, marka, model)')
    .order('tarih', { ascending: false })
    .limit(1000)
  if (error) { console.error('yakitlariGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const yakitEkle = async (payload) => {
  const { data, error } = await supabase
    .from('arac_yakit_kayitlari')
    .insert(toSnake(payload))
    .select()
    .single()
  if (error) { console.error('yakitEkle hata:', error.message); return { _hata: error.message } }
  await aracKmTazele(payload.aracId, payload.km)
  return toCamel(data)
}

export const yakitSil = async (kayit) => {
  const { error } = await supabase.from('arac_yakit_kayitlari').delete().eq('id', kayit.id)
  if (error) { console.error('yakitSil hata:', error.message); return false }
  if (kayit.fisUrl) {
    await supabase.storage.from(BUCKET).remove([kayit.fisUrl]).catch(() => {})
  }
  return true
}

// ── Dosya (private bucket — path sakla, signed URL ile aç) ───────────
export const filoDosyaYukle = async (file, klasor) => {
  const uzanti = (file.name?.split('.').pop() || 'pdf').toLowerCase()
  const path = `${klasor}/${Date.now()}.${uzanti}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' })
  if (error) {
    console.error('filoDosyaYukle hata:', error.message)
    sonYuklemeHata = error.message  // çağıran toast'ta gerçek sebebi gösterebilsin
    return null
  }
  sonYuklemeHata = null
  return path
}

// Son yükleme hatasının mesajı — filoDosyaYukle null dönerse buradan okunur
export let sonYuklemeHata = null

export const filoDosyaUrl = async (path) => {
  if (!path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error) { console.error('filoDosyaUrl hata:', error.message); return null }
  return data?.signedUrl ?? null
}

// ── Sürücüler ────────────────────────────────────────────────────────
export const surucuAta = async (aracId, kullaniciId) =>
  filoAracGuncelle(aracId, { surucuKullaniciId: kullaniciId || null })

export const ehliyetGuncelle = async (kullaniciId, { ehliyetSinifi, ehliyetBitis }) => {
  const { error } = await supabase
    .from('kullanicilar')
    .update({ ehliyet_sinifi: ehliyetSinifi || null, ehliyet_bitis: ehliyetBitis || null })
    .eq('id', kullaniciId)
  if (error) { console.error('ehliyetGuncelle hata:', error.message); return false }
  return true
}

// ── Sync (belge/bakım uyarıları + Mobiltek araç içe aktarma) ─────────
export const kmSyncTetikle = async () => {
  const { data, error } = await supabase.functions.invoke('arac-km-sync')
  if (error) throw new Error(error.message)
  return data
}
