// Sipariş Talep Modülü — CRUD + durum makinesi + kalem yönetimi.
// Migration 124 üzerinde çalışır. Kâr/marj görünürlüğü UI katmanında karGorebilir() ile.

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cached, invalidate } from '../lib/cache'

export const SIPARIS_DURUMLARI = [
  'GORUSME_TALEBI',
  'ON_SIPARIS',
  'ONAY_BEKLIYOR',
  'ONAYLANDI',
  'TEDARIK',
  'SEVK_TESLIM',
  'KISMI_TESLIM',
  'FATURALANDI',
  'KAPANDI',
  'IPTAL',
]

export const DURUM_ETIKET = {
  GORUSME_TALEBI: 'Görüşme Talebi',
  ON_SIPARIS: 'Ön Sipariş',
  ONAY_BEKLIYOR: 'Onay Bekliyor',
  ONAYLANDI: 'Onaylandı',
  TEDARIK: 'Tedarik',
  SEVK_TESLIM: 'Sevk/Teslim',
  KISMI_TESLIM: 'Kısmi Teslim',
  FATURALANDI: 'Faturalandı',
  KAPANDI: 'Kapandı',
  IPTAL: 'İptal',
}

export const DURUM_RENK = {
  GORUSME_TALEBI: '#94a3b8',
  ON_SIPARIS: '#3b82f6',
  ONAY_BEKLIYOR: '#f59e0b',
  ONAYLANDI: '#10b981',
  TEDARIK: '#8b5cf6',
  SEVK_TESLIM: '#06b6d4',
  KISMI_TESLIM: '#0ea5e9',
  FATURALANDI: '#6366f1',
  KAPANDI: '#059669',
  IPTAL: '#ef4444',
}

// UI GUARD: Kâr/marj/alış fiyatı sadece belirli kişilere görünür.
export const karGorebilir = (kullanici) => {
  const adLower = String(kullanici?.ad ?? '').toLocaleLowerCase('tr')
  return (
    adLower.includes('ali uğur') || adLower.includes('ali ugur') ||
    adLower.includes('ahmet agun') ||
    adLower.includes('oğuz meriç') || adLower.includes('oguz meric') ||
    adLower.includes('oğuz merıç') || adLower.includes('oguz meriç')
  )
}

// Session'a kullanıcı id set eder (trigger denetim izi için)
const oturumKullaniciBelirle = async (kullaniciId) => {
  if (!kullaniciId) return
  try {
    await supabase.rpc('set_config', {
      setting_name: 'app.current_user_id',
      new_value: String(kullaniciId),
      is_local: true,
    })
  } catch { /* rpc yoksa sessiz geç */ }
}

// ==================== SİPARİŞ CRUD ====================

export const siparisleriGetir = () => cached('siparisler:list', async () => {
  const hepsi = []
  const sayfa = 1000
  let off = 0
  while (true) {
    const { data, error } = await supabase
      .from('siparisler')
      .select('*')
      .order('olusturma_tarih', { ascending: false })
      .range(off, off + sayfa - 1)
    if (error) { console.error('siparisleriGetir hata:', error.message); throw error }
    if (!data || data.length === 0) break
    hepsi.push(...data)
    if (data.length < sayfa) break
    off += sayfa
  }
  return arrayToCamel(hepsi)
})

export const siparisGetir = (id) => cached(`siparis:${id}`, async () => {
  const { data, error } = await supabase.from('siparisler').select('*').eq('id', id).single()
  if (error) { console.error('siparisGetir hata:', error.message); return null }
  return toCamel(data)
})

export const siparisEkle = async (siparis, kullaniciId) => {
  await oturumKullaniciBelirle(kullaniciId)
  const { id, olusturmaTarih, guncellemeTarih, siparisNo, ...rest } = siparis
  const payload = toSnake({ ...rest, olusturanId: kullaniciId })
  const { data, error } = await supabase.from('siparisler').insert(payload).select().single()
  if (error) { console.error('siparisEkle hata:', error.message); return null }
  invalidate('siparisler:list', 'siparis-toplamlari')
  return toCamel(data)
}

export const siparisGuncelle = async (id, guncellenmis, kullaniciId) => {
  await oturumKullaniciBelirle(kullaniciId)
  const { id: _id, olusturmaTarih, guncellemeTarih, ...rest } = guncellenmis
  const { data, error } = await supabase.from('siparisler').update(toSnake(rest)).eq('id', id).select().single()
  if (error) { console.error('siparisGuncelle hata:', error.message); return null }
  invalidate('siparisler:list', `siparis:${id}`, 'siparis-toplamlari')
  return toCamel(data)
}

// Durum makinesi — trigger otomasyonu tarih ve no doldurmayı halleder.
export const siparisDurumGuncelle = async (id, yeniDurum, kullaniciId, gerekce = null) => {
  await oturumKullaniciBelirle(kullaniciId)
  const guncelleme = { durum: yeniDurum }
  if (gerekce) guncelleme.iptal_sebebi = gerekce
  const { data, error } = await supabase
    .from('siparisler')
    .update(guncelleme)
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('siparisDurumGuncelle hata:', error.message); return null }
  invalidate('siparisler:list', `siparis:${id}`, `siparis-gecmis:${id}`)
  return toCamel(data)
}

export const siparisSil = async (id) => {
  const { error } = await supabase.from('siparisler').delete().eq('id', id)
  if (error) { console.error('siparisSil hata:', error.message); return false }
  invalidate('siparisler:list', `siparis:${id}`, 'siparis-toplamlari')
  return true
}

// ==================== KALEMLER ====================

export const kalemleriGetir = (siparisId) => cached(`siparis-kalem:${siparisId}`, async () => {
  const { data, error } = await supabase
    .from('siparis_kalemleri')
    .select('*')
    .eq('siparis_id', siparisId)
    .order('siralama', { ascending: true })
    .order('id', { ascending: true })
  if (error) { console.error('kalemleriGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
})

export const kalemEkle = async (kalem) => {
  const { id, olusturmaTarih, ...rest } = kalem
  const { data, error } = await supabase.from('siparis_kalemleri').insert(toSnake(rest)).select().single()
  if (error) { console.error('kalemEkle hata:', error.message); return null }
  invalidate(`siparis-kalem:${kalem.siparisId}`, 'siparis-toplamlari')
  return toCamel(data)
}

export const kalemGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, siparisId, ...rest } = guncellenmis
  const { data, error } = await supabase.from('siparis_kalemleri').update(toSnake(rest)).eq('id', id).select().single()
  if (error) { console.error('kalemGuncelle hata:', error.message); return null }
  invalidate(`siparis-kalem:${siparisId}`, 'siparis-toplamlari')
  return toCamel(data)
}

export const kalemSil = async (id, siparisId) => {
  const { error } = await supabase.from('siparis_kalemleri').delete().eq('id', id)
  if (error) { console.error('kalemSil hata:', error.message); return false }
  invalidate(`siparis-kalem:${siparisId}`, 'siparis-toplamlari')
  return true
}

// ==================== TOPLAMLAR VIEW ====================

export const siparisToplamlariniGetir = () => cached('siparis-toplamlari', async () => {
  const { data, error } = await supabase.from('v_siparis_toplamlari').select('*')
  if (error) { console.error('siparisToplamlariniGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
})

export const siparisToplami = async (siparisId) => {
  const { data, error } = await supabase.from('v_siparis_toplamlari').select('*').eq('siparis_id', siparisId).single()
  if (error) return null
  return toCamel(data)
}

// ==================== DURUM GEÇMİŞİ ====================

export const durumGecmisiniGetir = (siparisId) => cached(`siparis-gecmis:${siparisId}`, async () => {
  const { data, error } = await supabase
    .from('siparis_durum_gecmisi')
    .select('*')
    .eq('siparis_id', siparisId)
    .order('olusturma_tarih', { ascending: false })
  if (error) { console.error('durumGecmisiniGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
})

// ==================== MÜŞTERİ ÖZETİ (F2 için hazır) ====================

export const musteriSiparisleri = async (musteriId) => {
  const { data, error } = await supabase
    .from('siparisler')
    .select('*')
    .eq('musteri_id', musteriId)
    .order('olusturma_tarih', { ascending: false })
  if (error) return []
  return arrayToCamel(data || [])
}

// ==================== KALEM HESAPLAMA YARDIMCI ====================

export const kalemSatisTutari = (kalem) => {
  const miktar = Number(kalem?.miktar || 0)
  const fiyat = Number(kalem?.satisBirimFiyat || 0)
  const isk = Number(kalem?.iskontoOrani || 0)
  return miktar * fiyat * (1 - isk / 100)
}

export const kalemAlisTutari = (kalem) => {
  const miktar = Number(kalem?.miktar || 0)
  const fiyat = Number(kalem?.alisBirimFiyat || 0)
  return miktar * fiyat
}

export const kalemKar = (kalem) => kalemSatisTutari(kalem) - kalemAlisTutari(kalem)

export const kalemKarMarji = (kalem) => {
  const satis = kalemSatisTutari(kalem)
  if (satis === 0) return 0
  return (kalemKar(kalem) / satis) * 100
}

// Sipariş toplam (kalemlerden hesap) — canlı UI için
export const siparisKalemToplam = (kalemler, iskontoTutari = 0) => {
  const toplamSatis = kalemler.reduce((s, k) => s + kalemSatisTutari(k), 0)
  const toplamAlis = kalemler.reduce((s, k) => s + kalemAlisTutari(k), 0)
  const toplamKar = toplamSatis - toplamAlis - Number(iskontoTutari || 0)
  const marj = toplamSatis > 0 ? (toplamKar / toplamSatis) * 100 : 0
  return { toplamSatis, toplamAlis, toplamKar, marj }
}
