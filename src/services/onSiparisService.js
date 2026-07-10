// Ön Sipariş — fiyatsız kalem talebi. Görüşmeden doğar, Sipariş Onayı ekranına düşer.
// Bkz: supabase_migrations/125_on_siparisler.sql

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cached, invalidate } from '../lib/cache'

export const ON_SIPARIS_DURUMLARI = [
  { id: 'taslak',           isim: 'Taslak',            renk: '#94a3b8' },
  { id: 'onay_bekliyor',    isim: 'Onay Bekliyor',     renk: '#f59e0b' },
  { id: 'siparise_donustu', isim: 'Siparişe Dönüştü',  renk: '#10b981' },
  { id: 'iptal',            isim: 'İptal',             renk: '#ef4444' },
]

export const ACILIYETLER = [
  { id: 'dusuk',  isim: 'Düşük',  renk: '#94a3b8' },
  { id: 'orta',   isim: 'Orta',   renk: '#3b82f6' },
  { id: 'yuksek', isim: 'Yüksek', renk: '#ef4444' },
]

// ==================== LİSTE ====================
export const onSiparisleriGetir = () => cached('onSiparisler:list', async () => {
  const { data, error } = await supabase
    .from('on_siparisler')
    .select('*')
    .order('olusturma_tarih', { ascending: false })
  if (error) { console.error('onSiparisleriGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
})

// Reddedilen (iptal) ön siparişler — Sipariş Onayı ekranı için
export const iptalEdilenOnSiparisleriGetir = async () => {
  const { data, error } = await supabase
    .from('on_siparisler')
    .select('*')
    .eq('durum', 'iptal')
    .order('guncelleme_tarih', { ascending: false })
  if (error) { console.error('iptalEdilenOnSiparisleriGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

// Bir görüşmeye ait ön siparişler
export const gorusmeninOnSiparisleri = async (gorusmeId) => {
  const { data, error } = await supabase
    .from('on_siparisler')
    .select('*')
    .eq('gorusme_id', gorusmeId)
    .order('olusturma_tarih', { ascending: false })
  if (error) { console.error('gorusmeninOnSiparisleri hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const onSiparisGetir = async (id) => {
  const { data, error } = await supabase
    .from('on_siparisler')
    .select('*')
    .eq('id', id)
    .single()
  if (error) { console.error('onSiparisGetir hata:', error.message); return null }
  return toCamel(data)
}

// ==================== YAZ ====================
export const onSiparisEkle = async (payload) => {
  const { id, onSiparisNo, olusturmaTarih, guncellemeTarih, ...rest } = payload
  const { data, error } = await supabase
    .from('on_siparisler')
    .insert(toSnake(rest))
    .select()
    .single()
  if (error) { console.error('onSiparisEkle hata:', error.message); return null }
  invalidate('onSiparisler:list')
  return toCamel(data)
}

export const onSiparisGuncelle = async (id, payload) => {
  const { id: _id, onSiparisNo, olusturmaTarih, guncellemeTarih, ...rest } = payload
  const { data, error } = await supabase
    .from('on_siparisler')
    .update(toSnake(rest))
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('onSiparisGuncelle hata:', error.message); return null }
  invalidate('onSiparisler:list')
  return toCamel(data)
}

export const onSiparisSil = async (id) => {
  const { error } = await supabase.from('on_siparisler').delete().eq('id', id)
  if (error) { console.error('onSiparisSil hata:', error.message); return false }
  invalidate('onSiparisler:list')
  return true
}

// ==================== KALEMLER ====================
export const kalemleriGetir = async (onSiparisId) => {
  const { data, error } = await supabase
    .from('on_siparis_kalemleri')
    .select('*')
    .eq('on_siparis_id', onSiparisId)
    .order('siralama', { ascending: true })
    .order('id', { ascending: true })
  if (error) { console.error('kalemleriGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const kalemEkle = async (kalem) => {
  const { id, olusturmaTarih, ...rest } = kalem
  const { data, error } = await supabase
    .from('on_siparis_kalemleri')
    .insert(toSnake(rest))
    .select()
    .single()
  if (error) { console.error('kalemEkle hata:', error.message); return null }
  return toCamel(data)
}

export const kalemGuncelle = async (id, kalem) => {
  const { id: _id, onSiparisId, olusturmaTarih, ...rest } = kalem
  const { data, error } = await supabase
    .from('on_siparis_kalemleri')
    .update(toSnake(rest))
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('kalemGuncelle hata:', error.message); return null }
  return toCamel(data)
}

export const kalemSil = async (id) => {
  const { error } = await supabase.from('on_siparis_kalemleri').delete().eq('id', id)
  if (error) { console.error('kalemSil hata:', error.message); return false }
  return true
}

// ==================== TAM KAYDET ====================
// Modal'dan gelen bütün paketi: ön sipariş + kalemler.
export const onSiparisTumunuKaydet = async ({ onSiparis, kalemler, silinecekKalemIdleri = [] }) => {
  let osKayit = onSiparis.id
    ? await onSiparisGuncelle(onSiparis.id, onSiparis)
    : await onSiparisEkle(onSiparis)
  if (!osKayit) return null

  // Silinecekleri sil
  for (const kalemId of silinecekKalemIdleri) {
    await kalemSil(kalemId)
  }

  // Kalemleri kaydet
  for (const k of kalemler) {
    const payload = { ...k, onSiparisId: osKayit.id }
    if (k.id) await kalemGuncelle(k.id, payload)
    else await kalemEkle(payload)
  }

  return osKayit
}
