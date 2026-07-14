// Stok kategori ağacı (mig 151) — hiyerarşik: kök → alt → alt-alt.
// Okuma tüm personel, yazma yalnız admin (RLS'de de aynı kural var).
import { supabase } from '../lib/supabase'
import { arrayToCamel, toCamel } from '../lib/mapper'
import { cached, invalidate } from '../lib/cache'

export const kategorileriGetir = (pasiflerDahil = false) =>
  cached(`stokKategori:list:${pasiflerDahil}`, async () => {
    let q = supabase.from('stok_kategoriler').select('*').order('sira').order('ad')
    if (!pasiflerDahil) q = q.eq('aktif', true)
    const { data, error } = await q
    if (error) { console.error('[kategorileriGetir]', error.message); return [] }
    return arrayToCamel(data) ?? []
  })

const kategoriCacheTemizle = () => {
  invalidate('stokKategori:list:true', 'stokKategori:list:false')
}

export const kategoriEkle = async ({ ad, ustId = null, sira = 0 }) => {
  const { data, error } = await supabase
    .from('stok_kategoriler')
    .insert({ ad: ad.trim(), ust_id: ustId, sira })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('Bu ad aynı seviyede zaten var.')
    throw new Error(error.message)
  }
  kategoriCacheTemizle()
  return toCamel(data)
}

export const kategoriGuncelle = async (id, alanlar) => {
  const guncel = {}
  if (alanlar.ad !== undefined) guncel.ad = alanlar.ad.trim()
  if (alanlar.sira !== undefined) guncel.sira = alanlar.sira
  if (alanlar.aktif !== undefined) guncel.aktif = alanlar.aktif
  const { data, error } = await supabase
    .from('stok_kategoriler')
    .update(guncel)
    .eq('id', id)
    .select()
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('Bu ad aynı seviyede zaten var.')
    throw new Error(error.message)
  }
  kategoriCacheTemizle()
  return toCamel(data)
}

// ── Ağaç yardımcıları (düz liste → yapı) ──────────────────────

// Düz listeden { kokler: [...], cocuklar: Map<ustId, [...]> } üret
export const agacKur = (kategoriler) => {
  const cocuklar = new Map()
  const kokler = []
  for (const k of kategoriler || []) {
    if (k.ustId == null) { kokler.push(k); continue }
    if (!cocuklar.has(k.ustId)) cocuklar.set(k.ustId, [])
    cocuklar.get(k.ustId).push(k)
  }
  return { kokler, cocuklar }
}

// id → "Güvenlik Sistemleri › Kamera Sistemleri › IP Kamera" tam yolu
export const kategoriYolu = (kategoriler, id) => {
  if (!id) return ''
  const map = new Map((kategoriler || []).map(k => [k.id, k]))
  const parcalar = []
  let k = map.get(id)
  let guard = 0
  while (k && guard < 10) {
    parcalar.unshift(k.ad)
    k = k.ustId != null ? map.get(k.ustId) : null
    guard++
  }
  return parcalar.join(' › ')
}

// Bir kategorinin kendisi + tüm alt torunlarının id seti (filtrelemede kullanılır)
export const altKategoriIdleri = (kategoriler, id) => {
  const set = new Set([id])
  const { cocuklar } = agacKur(kategoriler)
  const kuyruk = [id]
  while (kuyruk.length) {
    const su = kuyruk.shift()
    for (const c of cocuklar.get(su) || []) {
      if (!set.has(c.id)) { set.add(c.id); kuyruk.push(c.id) }
    }
  }
  return set
}
