// Keşif Modülü servisi (mig 139) — saha keşif kayıtları.
// kesif_no (KSF-YYYY-NNNN) DB trigger üretir, client göndermez.

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

const FOTO_BUCKET = 'kesif-foto'
export const KESIF_FOTO_MAX_MB = 8
export const KESIF_FOTO_MAX = KESIF_FOTO_MAX_MB * 1024 * 1024

export const KESIF_KATEGORILERI = [
  { id: 'kamera',       ad: 'Kamera',        ikon: '📷' },
  { id: 'kayit_cihazi', ad: 'Kayıt Cihazı',  ikon: '💾' },
  { id: 'kablo',        ad: 'Kablo',         ikon: '🔌' },
  { id: 'network',      ad: 'Network',       ikon: '🌐' },
  { id: 'malzeme',      ad: 'Malzeme',       ikon: '🧰' },
  { id: 'iscilik',      ad: 'İşçilik',       ikon: '👷' },
  { id: 'diger',        ad: 'Diğer',         ikon: '📦' },
]

export const KESIF_DURUMLARI = [
  { id: 'acik',       ad: 'Açık',        tone: 'lead' },
  { id: 'tamamlandi', ad: 'Tamamlandı',  tone: 'aktif' },
  { id: 'iptal',      ad: 'İptal',       tone: 'kayip' },
]

export const KESIF_ONCELIKLERI = [
  { id: 'dusuk',  ad: 'Düşük',  renk: '#94A3B8' },
  { id: 'normal', ad: 'Normal', renk: '#3B82F6' },
  { id: 'yuksek', ad: 'Yüksek', renk: '#F59E0B' },
  { id: 'acil',   ad: 'Acil',   renk: '#DC2626' },
]

// Keşif türleri (spec §4) — çoklu seçim; seçilen türe göre teknik not alanı açılır
export const KESIF_TURLERI = [
  { id: 'cctv',              ad: 'CCTV Kamera Sistemi' },
  { id: 'video_analitik',    ad: 'Video Analitik Sistemi' },
  { id: 'alev_duman',        ad: 'Alev ve Duman Algılama' },
  { id: 'plaka_tanima',      ad: 'Plaka Tanıma Sistemi' },
  { id: 'kartli_gecis',      ad: 'Kartlı Geçiş Sistemi' },
  { id: 'pdks',              ad: 'PDKS Sistemi' },
  { id: 'turnike',           ad: 'Turnike Sistemi' },
  { id: 'bariyer',           ad: 'Bariyer Sistemi' },
  { id: 'network',           ad: 'Network Altyapısı' },
  { id: 'kablosuz_ag',       ad: 'Kablosuz Ağ Sistemi' },
  { id: 'fiber_optik',       ad: 'Fiber Optik Altyapı' },
  { id: 'yapisal_kablolama', ad: 'Yapısal Kablolama' },
  { id: 'telefon_santrali',  ad: 'Telefon Santrali' },
  { id: 'interkom',          ad: 'İnterkom Sistemi' },
  { id: 'hirsiz_alarm',      ad: 'Hırsız Alarm Sistemi' },
  { id: 'yangin_algilama',   ad: 'Yangın Algılama Sistemi' },
  { id: 'seslendirme',       ad: 'Seslendirme ve Anons' },
  { id: 'sistem_odasi',      ad: 'Sistem Odası' },
  { id: 'veri_merkezi',      ad: 'Veri Merkezi' },
  { id: 'zayif_akim',        ad: 'Zayıf Akım Altyapısı' },
  { id: 'bakim_yenileme',    ad: 'Bakım ve Sistem Yenileme' },
  { id: 'diger',             ad: 'Diğer' },
]

// ---------- Keşifler ----------
export const kesifleriGetir = async () => {
  const { data, error } = await supabase
    .from('kesifler')
    .select('*')
    .order('olusturma_tarih', { ascending: false })
  if (error) { console.error('kesifleriGetir:', error.message); return [] }
  return arrayToCamel(data)
}

export const kesifGetir = async (id) => {
  const { data, error } = await supabase.from('kesifler').select('*').eq('id', id).single()
  if (error) { console.error('kesifGetir:', error.message); return null }
  return toCamel(data)
}

export const kesifEkle = async (kesif) => {
  const { id, kesifNo, olusturmaTarih, guncellemeTarih, ...rest } = kesif
  const { data, error } = await supabase.from('kesifler').insert(toSnake(rest)).select().single()
  if (error) throw error
  return toCamel(data)
}

export const kesifGuncelle = async (id, alanlar) => {
  const { id: _id, kesifNo, olusturmaTarih, guncellemeTarih, ...rest } = alanlar
  const { data, error } = await supabase.from('kesifler').update(toSnake(rest)).eq('id', id).select().single()
  if (error) throw error
  return toCamel(data)
}

export const kesifSil = async (id) => {
  // Fotolar storage'dan da temizlensin (DB satırları cascade siliniyor)
  const { data: fotolar } = await supabase.from('kesif_fotolari').select('dosya_yolu').eq('kesif_id', id)
  const { error } = await supabase.from('kesifler').delete().eq('id', id)
  if (error) throw error
  const yollar = (fotolar || []).map(f => f.dosya_yolu)
  if (yollar.length) await supabase.storage.from(FOTO_BUCKET).remove(yollar).catch(() => {})
}

// ---------- Kalemler ----------
export const kesifKalemleriGetir = async (kesifId) => {
  const { data, error } = await supabase
    .from('kesif_kalemleri')
    .select('*')
    .eq('kesif_id', kesifId)
    .order('siralama', { ascending: true })
    .order('id', { ascending: true })
  if (error) { console.error('kesifKalemleriGetir:', error.message); return [] }
  return arrayToCamel(data)
}

export const kesifKalemEkle = async (kalem) => {
  const { id, olusturmaTarih, ...rest } = kalem
  const { data, error } = await supabase.from('kesif_kalemleri').insert(toSnake(rest)).select().single()
  if (error) throw error
  return toCamel(data)
}

export const kesifKalemGuncelle = async (id, alanlar) => {
  const { id: _id, olusturmaTarih, ...rest } = alanlar
  const { data, error } = await supabase.from('kesif_kalemleri').update(toSnake(rest)).eq('id', id).select().single()
  if (error) throw error
  return toCamel(data)
}

export const kesifKalemSil = async (id) => {
  const { error } = await supabase.from('kesif_kalemleri').delete().eq('id', id)
  if (error) throw error
}

// ---------- Fotoğraflar ----------
export const kesifFotolariGetir = async (kesifId) => {
  const { data, error } = await supabase
    .from('kesif_fotolari')
    .select('*')
    .eq('kesif_id', kesifId)
    .order('olusturma_tarih', { ascending: false })
  if (error) { console.error('kesifFotolariGetir:', error.message); return [] }
  return arrayToCamel(data)
}

export const kesifFotoYukle = async (kesifId, file, { aciklama = '', olusturanAd = '' } = {}) => {
  if (file.size > KESIF_FOTO_MAX) throw new Error(`Fotoğraf çok büyük (max ${KESIF_FOTO_MAX_MB} MB).`)
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().slice(0, 6)
  const yol = `${kesifId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error: upErr } = await supabase.storage.from(FOTO_BUCKET).upload(yol, file, {
    contentType: file.type || 'image/jpeg',
    cacheControl: '3600',
  })
  if (upErr) throw upErr
  const { data, error } = await supabase.from('kesif_fotolari').insert({
    kesif_id: kesifId,
    dosya_yolu: yol,
    aciklama: aciklama || null,
    olusturan_ad: olusturanAd || null,
  }).select().single()
  if (error) {
    await supabase.storage.from(FOTO_BUCKET).remove([yol]).catch(() => {})
    throw error
  }
  return toCamel(data)
}

export const kesifFotoSil = async (foto) => {
  const { error } = await supabase.from('kesif_fotolari').delete().eq('id', foto.id)
  if (error) throw error
  if (foto.dosyaYolu) await supabase.storage.from(FOTO_BUCKET).remove([foto.dosyaYolu]).catch(() => {})
}

// Signed URL — private bucket
export const kesifFotoUrl = async (dosyaYolu, saniye = 3600) => {
  const { data, error } = await supabase.storage.from(FOTO_BUCKET).createSignedUrl(dosyaYolu, saniye)
  if (error) throw error
  return data.signedUrl
}

// Toplu signed URL (liste görünümü için tek istek)
export const kesifFotoUrlleri = async (yollar, saniye = 3600) => {
  if (!yollar?.length) return new Map()
  const { data, error } = await supabase.storage.from(FOTO_BUCKET).createSignedUrls(yollar, saniye)
  if (error) { console.warn('kesifFotoUrlleri:', error.message); return new Map() }
  return new Map((data || []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]))
}
