// Kategori-bazlı dinamik teknik özellikler (mig 152, EAV).
// Tanımlar kategoriye bağlıdır; bir dalın özellikleri tüm alt dallarında da
// geçerlidir (kategoriOzellikleri ata zincirini gezerek toplar).
import { supabase } from '../lib/supabase'
import { arrayToCamel, toCamel } from '../lib/mapper'
import { cached, invalidate } from '../lib/cache'
import { pagedFetch } from '../lib/pagedFetch'

export const OZELLIK_TIPLERI = [
  { id: 'secim',      ad: 'Seçim listesi' },
  { id: 'metin',      ad: 'Serbest metin' },
  { id: 'sayi',       ad: 'Sayı' },
  { id: 'evet_hayir', ad: 'Evet / Hayır' },
]

// ── Tanımlar ──────────────────────────────────────────────────

export const ozellikTanimlariGetir = (pasiflerDahil = false) =>
  cached(`stokOzellik:tanimlar:${pasiflerDahil}`, async () => {
    let q = supabase.from('stok_kategori_ozellikler').select('*').order('sira').order('ad')
    if (!pasiflerDahil) q = q.eq('aktif', true)
    const { data, error } = await q
    if (error) { console.error('[ozellikTanimlariGetir]', error.message); return [] }
    return arrayToCamel(data) ?? []
  })

const tanimCacheTemizle = () => {
  invalidate('stokOzellik:tanimlar:true', 'stokOzellik:tanimlar:false')
}

export const ozellikEkle = async ({ kategoriId, ad, tip = 'secim', secenekler = null, birim = null, sira = 0 }) => {
  const { data, error } = await supabase
    .from('stok_kategori_ozellikler')
    .insert({ kategori_id: kategoriId, ad: ad.trim(), tip, secenekler, birim, sira })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('Bu özellik adı bu kategoride zaten var.')
    throw new Error(error.message)
  }
  tanimCacheTemizle()
  return toCamel(data)
}

export const ozellikGuncelle = async (id, alanlar) => {
  const guncel = {}
  if (alanlar.ad !== undefined) guncel.ad = alanlar.ad.trim()
  if (alanlar.tip !== undefined) guncel.tip = alanlar.tip
  if (alanlar.secenekler !== undefined) guncel.secenekler = alanlar.secenekler
  if (alanlar.birim !== undefined) guncel.birim = alanlar.birim
  if (alanlar.sira !== undefined) guncel.sira = alanlar.sira
  if (alanlar.aktif !== undefined) guncel.aktif = alanlar.aktif
  const { data, error } = await supabase
    .from('stok_kategori_ozellikler')
    .update(guncel)
    .eq('id', id)
    .select()
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('Bu özellik adı bu kategoride zaten var.')
    throw new Error(error.message)
  }
  tanimCacheTemizle()
  return toCamel(data)
}

// Bir kategorinin GEÇERLİ özellikleri: kendi + tüm ata dallarının tanımları.
// kategoriler: stokKategoriService.kategorileriGetir çıktısı (ustId alanlı).
export const kategoriOzellikleri = (tanimlar, kategoriler, kategoriId) => {
  if (!kategoriId) return []
  const katMap = new Map((kategoriler || []).map(k => [k.id, k]))
  const zincir = []
  let k = katMap.get(Number(kategoriId))
  let guard = 0
  while (k && guard < 10) {
    zincir.push(k.id)
    k = k.ustId != null ? katMap.get(k.ustId) : null
    guard++
  }
  const zincirSet = new Set(zincir)
  return (tanimlar || [])
    .filter(t => zincirSet.has(t.kategoriId) && t.aktif !== false)
    .sort((a, b) => (a.sira - b.sira) || String(a.ad).localeCompare(String(b.ad), 'tr'))
}

// ── Ürün değerleri ────────────────────────────────────────────

// Tek ürünün değerleri: Map<ozellikId, deger>
export const urunOzellikleriGetir = async (urunId) => {
  const { data, error } = await supabase
    .from('stok_urun_ozellikler')
    .select('ozellik_id, deger')
    .eq('urun_id', urunId)
  if (error) { console.error('[urunOzellikleriGetir]', error.message); return new Map() }
  return new Map((data || []).map(r => [r.ozellik_id, r.deger]))
}

// degerler: Map<ozellikId, deger> veya düz obje — boş değer o özelliği siler
export const urunOzellikleriKaydet = async (urunId, degerler) => {
  const girisler = degerler instanceof Map
    ? Array.from(degerler.entries())
    : Object.entries(degerler || {}).map(([k, v]) => [Number(k), v])

  const yaz = girisler
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([ozellikId, deger]) => ({
      urun_id: urunId,
      ozellik_id: Number(ozellikId),
      deger: String(deger),
      guncelleme_tarih: new Date().toISOString(),
    }))
  const sil = girisler
    .filter(([, v]) => v === '' || v === null || v === undefined)
    .map(([ozellikId]) => Number(ozellikId))

  if (yaz.length > 0) {
    const { error } = await supabase
      .from('stok_urun_ozellikler')
      .upsert(yaz, { onConflict: 'urun_id,ozellik_id' })
    if (error) { console.error('[urunOzellikleriKaydet]', error.message); throw new Error('Özellikler kaydedilemedi: ' + error.message) }
  }
  if (sil.length > 0) {
    await supabase
      .from('stok_urun_ozellikler')
      .delete()
      .eq('urun_id', urunId)
      .in('ozellik_id', sil)
  }
  invalidate('stokOzellik:urunDegerleri')
}

// Filtreleme için TÜM ürün değerleri: Map<urunId, Map<ozellikId, deger>>
export const tumUrunOzellikleriGetir = () =>
  cached('stokOzellik:urunDegerleri', async () => {
    const data = await pagedFetch((off, size) =>
      supabase.from('stok_urun_ozellikler')
        .select('urun_id, ozellik_id, deger')
        .order('urun_id')
        .order('ozellik_id')  // (urun_id, ozellik_id) benzersiz — sayfalar deterministik
        .range(off, off + size - 1)
    )
    const map = new Map()
    for (const r of data || []) {
      if (!map.has(r.urun_id)) map.set(r.urun_id, new Map())
      map.get(r.urun_id).set(r.ozellik_id, r.deger)
    }
    return map
  })
