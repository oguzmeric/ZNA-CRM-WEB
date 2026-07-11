import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

// Stok opsiyonları (migration 137) — eskiden localStorage'daydı, artık DB.
// opsiyon_no DB trigger'ı üretir (OPS-0001), client göndermez.

export const opsiyonlariGetir = async () => {
  const { data, error } = await supabase
    .from('stok_opsiyonlar')
    .select('*')
    .order('olusturma_tarih', { ascending: false })
  if (error) { console.warn('opsiyonlariGetir hata:', error.message); return [] }
  return arrayToCamel(data)
}

// Aktif opsiyon toplamları: stokKodu → toplam miktar (satılabilir stok hesabı)
export const aktifOpsiyonToplamlari = async () => {
  const { data, error } = await supabase
    .from('stok_opsiyonlar')
    .select('stok_kodu, miktar')
    .eq('durum', 'aktif')
  if (error) { console.warn('aktifOpsiyonToplamlari hata:', error.message); return new Map() }
  const m = new Map()
  ;(data || []).forEach(o => m.set(o.stok_kodu, (m.get(o.stok_kodu) || 0) + Number(o.miktar || 0)))
  return m
}

export const opsiyonEkle = async (opsiyon) => {
  const { id, opsiyonNo, ...rest } = opsiyon
  const { data, error } = await supabase
    .from('stok_opsiyonlar')
    .insert(toSnake(rest))
    .select()
    .single()
  if (error) throw error
  return toCamel(data)
}

export const opsiyonDurumGuncelle = async (id, durum) => {
  const { data, error } = await supabase
    .from('stok_opsiyonlar')
    .update({ durum })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return toCamel(data)
}

export const opsiyonSil = async (id) => {
  const { error } = await supabase.from('stok_opsiyonlar').delete().eq('id', id)
  if (error) throw error
}

// Tek seferlik localStorage → DB taşıma. Eski tarayıcı verisi varsa DB'ye
// aktarır, marker bırakır (tekrar çalışmaz). Eski numaralar korunur.
export const localStorageOpsiyonlariTasi = async () => {
  const MARKER = 'stokOpsiyonlar_dbye_tasindi'
  if (localStorage.getItem(MARKER)) return 0
  let eski = []
  try { eski = JSON.parse(localStorage.getItem('stokOpsiyonlar') || '[]') } catch { eski = [] }
  if (!Array.isArray(eski) || eski.length === 0) {
    localStorage.setItem(MARKER, '1')
    return 0
  }
  let tasinan = 0
  for (const o of eski) {
    const kayit = {
      opsiyon_no: o.opsiyonNo || null,
      stok_kodu: o.stokKodu,
      stok_adi: o.stokAdi || '',
      miktar: Number(o.miktar) || 0,
      satisci_id: o.satisciId ? Number(o.satisciId) : null,
      satisci_ad: o.satisciAd || '',
      musteri_adi: o.musteriAdi || '',
      aciklama: o.aciklama || '',
      bitis_tarih: o.bitisTarih || null,
      durum: ['aktif', 'onaylandi', 'iptal', 'suresi_doldu'].includes(o.durum) ? o.durum : 'aktif',
      olusturan_ad: o.olusturanAd || '',
      olusturma_tarih: o.olusturmaTarih || new Date().toISOString(),
    }
    // Aynı opsiyon_no zaten DB'deyse (başka tarayıcıdan taşınmış) atla
    const { error } = await supabase.from('stok_opsiyonlar').insert(kayit)
    if (!error) tasinan++
    else if (error.code !== '23505') console.warn('opsiyon taşıma hatası:', error.message)
  }
  localStorage.setItem(MARKER, '1')
  return tasinan
}
