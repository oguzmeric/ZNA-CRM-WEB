// Siparişler — kalıcı sipariş kaydı. SADECE Sipariş Onayı verildiğinde INSERT edilir.
// Kaynak: teklif (müşteri kabul etmiş) veya on_siparis (ön sipariş).
// Bkz: supabase_migrations/126_siparisler.sql

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cached, invalidate } from '../lib/cache'

export const SIPARIS_DURUMLARI = [
  { id: 'aktif',       isim: 'Aktif',       renk: '#3b82f6' },
  { id: 'tamamlandi',  isim: 'Tamamlandı',  renk: '#10b981' },
  { id: 'iptal',       isim: 'İptal',       renk: '#ef4444' },
]

// ==================== LİSTE ====================
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

// Bir görüşmeye bağlı siparişler (Görüşme detayında listelemek için)
export const gorusmeninSiparisleri = async (gorusmeId) => {
  const { data, error } = await supabase
    .from('siparisler')
    .select('*')
    .eq('gorusme_id', gorusmeId)
    .order('olusturma_tarih', { ascending: false })
  if (error) return []
  return arrayToCamel(data || [])
}

// Bir müşteriye bağlı siparişler
export const musteriSiparisleri = async (musteriId) => {
  const { data, error } = await supabase
    .from('siparisler')
    .select('*')
    .eq('musteri_id', musteriId)
    .order('olusturma_tarih', { ascending: false })
  if (error) return []
  return arrayToCamel(data || [])
}

// ==================== YAZ ====================
export const siparisEkle = async (payload) => {
  const { id, siparisNo, olusturmaTarih, guncellemeTarih, ...rest } = payload
  const { data, error } = await supabase
    .from('siparisler')
    .insert(toSnake(rest))
    .select()
    .single()
  if (error) { console.error('siparisEkle hata:', error.message); return null }
  invalidate('siparisler:list')
  return toCamel(data)
}

export const siparisGuncelle = async (id, payload) => {
  const { id: _id, siparisNo, olusturmaTarih, guncellemeTarih, ...rest } = payload
  const { data, error } = await supabase
    .from('siparisler')
    .update(toSnake(rest))
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('siparisGuncelle hata:', error.message); return null }
  invalidate('siparisler:list', `siparis:${id}`)
  return toCamel(data)
}

export const siparisSil = async (id) => {
  const { error } = await supabase.from('siparisler').delete().eq('id', id)
  if (error) { console.error('siparisSil hata:', error.message); return false }
  invalidate('siparisler:list', `siparis:${id}`)
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
  const { data, error } = await supabase
    .from('siparis_kalemleri')
    .insert(toSnake(rest))
    .select()
    .single()
  if (error) { console.error('kalemEkle hata:', error.message); return null }
  invalidate(`siparis-kalem:${kalem.siparisId}`)
  return toCamel(data)
}

export const kalemleriEkle = async (kalemler) => {
  // Toplu ekleme (onay anında tüm kalemleri tek seferde INSERT etmek için)
  if (!kalemler || kalemler.length === 0) return []
  const payload = kalemler.map(k => {
    const { id, olusturmaTarih, ...rest } = k
    return toSnake(rest)
  })
  const { data, error } = await supabase
    .from('siparis_kalemleri')
    .insert(payload)
    .select()
  if (error) { console.error('kalemleriEkle hata:', error.message); return [] }
  const siparisIds = new Set(kalemler.map(k => k.siparisId).filter(Boolean))
  siparisIds.forEach(sid => invalidate(`siparis-kalem:${sid}`))
  return arrayToCamel(data || [])
}

export const kalemGuncelle = async (id, kalem) => {
  const { id: _id, siparisId, olusturmaTarih, ...rest } = kalem
  const { data, error } = await supabase
    .from('siparis_kalemleri')
    .update(toSnake(rest))
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('kalemGuncelle hata:', error.message); return null }
  invalidate(`siparis-kalem:${siparisId}`)
  return toCamel(data)
}

export const kalemSil = async (id, siparisId) => {
  const { error } = await supabase.from('siparis_kalemleri').delete().eq('id', id)
  if (error) { console.error('kalemSil hata:', error.message); return false }
  invalidate(`siparis-kalem:${siparisId}`)
  return true
}

// ==================== HESAPLAMA YARDIMCI (client-side) ====================
export const kalemAraToplam = (kalem) => {
  const miktar = Number(kalem?.miktar || 0)
  const fiyat = Number(kalem?.birimFiyat || 0)
  const isk = Number(kalem?.iskontoOrani || 0)
  return miktar * fiyat * (1 - isk / 100)
}

export const kalemlerToplam = (kalemler, genelIskonto = 0) => {
  const araToplam = (kalemler || []).reduce((s, k) => s + kalemAraToplam(k), 0)
  const iskontolu = araToplam - Number(genelIskonto || 0)
  const kdvToplam = (kalemler || []).reduce((s, k) => {
    return s + kalemAraToplam(k) * (Number(k?.kdvOrani || 0) / 100)
  }, 0)
  return {
    araToplam,
    iskontolu,
    kdvToplam,
    genelToplam: iskontolu + kdvToplam,
  }
}
