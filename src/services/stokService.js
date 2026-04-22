import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

export const stokUrunleriniGetir = async () => {
  const { data } = await supabase.from('stok_urunler').select('*').order('stok_adi')
  return arrayToCamel(data)
}

export const stokUrunGetir = async (id) => {
  const { data } = await supabase.from('stok_urunler').select('*').eq('id', id).single()
  return toCamel(data)
}

// stok_urunler kolonları (camelCase) — tabloya gidebilecek tüm alanların whitelist'i
const KABUL_EDILEN_KOLONLAR = [
  'stokKodu', 'stokAdi', 'birim', 'minStok', 'aciklama',
  'marka', 'grupKodu', 'gorselUrl', 'katalogdaGoster', 'birimFiyat',
]

// Eski tablolarda olmayan kolonlar varsa fallback — burada da grupKodu dahil
const FALLBACK_KOLONLAR = ['stokKodu', 'stokAdi', 'birim', 'minStok', 'aciklama', 'marka', 'grupKodu']

const tumAlanlarTemizle = (urun) => {
  // Sadece whitelist'teki alanları geçir (bilinmeyen alanlar PGRST204'e yol açmasın)
  const temiz = {}
  KABUL_EDILEN_KOLONLAR.forEach(k => {
    if (urun[k] !== undefined) temiz[k] = urun[k]
  })
  // Boş string → null (numeric/url alanlar için)
  if (temiz.minStok === '' || temiz.minStok === undefined) temiz.minStok = null
  if (temiz.birimFiyat === '' || temiz.birimFiyat === undefined) temiz.birimFiyat = null
  if (temiz.gorselUrl === '') temiz.gorselUrl = null
  if (temiz.marka === '') temiz.marka = null
  if (temiz.grupKodu === '') temiz.grupKodu = null
  return temiz
}

const sadecOrijinalKolonlar = (urun) => {
  const temiz = {}
  FALLBACK_KOLONLAR.forEach(k => {
    if (urun[k] !== undefined && urun[k] !== '') temiz[k] = urun[k]
  })
  if (temiz.minStok === '' || temiz.minStok === undefined) temiz.minStok = null
  return temiz
}

export const stokUrunEkle = async (urun) => {
  const temiz = tumAlanlarTemizle(urun)
  const { data, error } = await supabase.from('stok_urunler').insert(toSnake(temiz)).select().single()
  if (error) {
    console.error('stokUrunEkle hata:', error.code, error.message, error.details, error.hint)
    if (error.code === 'PGRST204') {
      console.warn('Schema cache eski — fallback ile yeniden deneniyor (grup_kodu dahil temel kolonlar)...')
      const temel = sadecOrijinalKolonlar(urun)
      const { data: d2, error: e2 } = await supabase.from('stok_urunler').insert(toSnake(temel)).select().single()
      if (e2) { console.error('stokUrunEkle (fallback) hata:', e2.message); return null }
      return toCamel(d2)
    }
    return null
  }
  return toCamel(data)
}

export const stokUrunGuncelle = async (id, guncellenmis) => {
  const temiz = tumAlanlarTemizle(guncellenmis)
  const { data, error } = await supabase.from('stok_urunler').update(toSnake(temiz)).eq('id', id).select().single()
  if (error) {
    if (error.code === 'PGRST204') {
      console.warn('Schema cache güncellenmemiş, orijinal kolonlarla güncelleniyor...')
      const temel = sadecOrijinalKolonlar(guncellenmis)
      const { data: d2, error: e2 } = await supabase.from('stok_urunler').update(toSnake(temel)).eq('id', id).select().single()
      if (e2) { console.error('stokUrunGuncelle (fallback) hata:', e2.message); return null }
      return toCamel(d2)
    }
    console.error('stokUrunGuncelle hata:', error.message, error.details)
    return null
  }
  return toCamel(data)
}

export const stokUrunSil = async (id) => {
  await supabase.from('stok_urunler').delete().eq('id', id)
}

export const gorselYukle = async (file, stokKodu) => {
  const ext = file.name.split('.').pop()
  const path = `${stokKodu}.${ext}`
  const { error } = await supabase.storage
    .from('urun-gorselleri')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) return null
  const { data } = supabase.storage.from('urun-gorselleri').getPublicUrl(path)
  return data.publicUrl
}

export const gorselSil = async (stokKodu, ext) => {
  await supabase.storage.from('urun-gorselleri').remove([`${stokKodu}.${ext}`])
}

export const katalogUrunleriniGetir = async () => {
  const { data } = await supabase
    .from('stok_urunler')
    .select('id, stok_kodu, stok_adi, marka, grup_kodu, birim, aciklama, gorsel_url, katalogda_goster')
    .eq('katalogda_goster', true)
    .order('stok_adi')
  return arrayToCamel(data)
}

export const stokHareketleriniGetir = async () => {
  const { data } = await supabase.from('stok_hareketleri').select('*').order('tarih', { ascending: false })
  return arrayToCamel(data)
}

// ──────────────────────────────────────────────────────────────
// S/N TAKIPLI KALEMLER (stok_kalemleri) — mobile ile senkron
// ──────────────────────────────────────────────────────────────

export const DURUMLAR = [
  { id: 'depoda',          isim: 'Depoda',              renk: '#3b82f6', ikon: '📦' },
  { id: 'teknisyende',     isim: 'Teknisyende',         renk: '#a855f7', ikon: '🚚' },
  { id: 'sahada',          isim: 'Sahada',              renk: '#10b981', ikon: '✅' },
  { id: 'arizada',         isim: 'Arızalı (Teknisyen)', renk: '#f59e0b', ikon: '⚠️' },
  { id: 'arizali_depoda',  isim: 'Arızalı Depoda',      renk: '#dc2626', ikon: '🔧' },
  { id: 'tamirde',         isim: 'Tamirde',             renk: '#ec4899', ikon: '🛠️' },
  { id: 'hurda',           isim: 'Hurda',               renk: '#6b7280', ikon: '🗑️' },
]
export const durumBul = (id) => DURUMLAR.find((d) => d.id === id)

// Her stok kodu için S/N kalemlerinin özetini getir (marka/model + durum sayıları)
export const stokKalemOzetleriniGetir = async () => {
  const { data } = await supabase
    .from('stok_kalemleri')
    .select('stok_kodu, marka, model, durum')
  const kalemler = data ?? []
  const map = new Map()
  for (const k of kalemler) {
    const key = k.stok_kodu ?? '(kodsuz)'
    if (!map.has(key)) {
      map.set(key, {
        stokKodu: k.stok_kodu,
        marka: k.marka || null,
        model: k.model || null,
        toplam: 0,
        depoda: 0,
        teknisyende: 0,
        sahada: 0,
        arizada: 0,
        arizaliDepoda: 0,
        tamirde: 0,
        hurda: 0,
      })
    }
    const row = map.get(key)
    row.toplam += 1
    if (k.durum === 'depoda') row.depoda += 1
    else if (k.durum === 'teknisyende') row.teknisyende += 1
    else if (k.durum === 'sahada') row.sahada += 1
    else if (k.durum === 'arizada') row.arizada += 1
    else if (k.durum === 'arizali_depoda') row.arizaliDepoda += 1
    else if (k.durum === 'tamirde') row.tamirde += 1
    else if (k.durum === 'hurda') row.hurda += 1
    if (!row.marka && k.marka) row.marka = k.marka
    if (!row.model && k.model) row.model = k.model
  }
  return map
}

// Belirli stok_kodu için S/N'li tüm kalemleri getir
export const modelKalemleriniGetir = async (stokKodu) => {
  const { data } = await supabase
    .from('stok_kalemleri')
    .select('*')
    .eq('stok_kodu', stokKodu)
    .order('guncelleme_tarih', { ascending: false })
  return arrayToCamel(data) ?? []
}

// Tek bir S/N kalemi ekle (stok_kalemleri tablosu) — mobile ile aynı
export const stokKalemEkle = async (kalem) => {
  const { id, olusturmaTarih, guncellemeTarih, ...rest } = kalem
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .insert(toSnake(rest))
    .select()
    .single()
  if (error) { console.error('stokKalemEkle hata:', error.message); throw error }
  return toCamel(data)
}

// Birden fazla S/N kalemi toplu ekle
export const stokKalemleriToplu = async (kalemler) => {
  if (!kalemler?.length) return []
  const rows = kalemler.map(k => {
    const { id, olusturmaTarih, guncellemeTarih, ...rest } = k
    return toSnake(rest)
  })
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .insert(rows)
    .select()
  if (error) { console.error('stokKalemleriToplu hata:', error.message); throw error }
  return arrayToCamel(data) ?? []
}


export const stokHareketEkle = async (hareket) => {
  const { id, olusturmaTarih, ...rest } = hareket
  const { data, error } = await supabase.from('stok_hareketleri').insert(toSnake(rest)).select().single()
  if (error) { console.error('stokHareketEkle hata:', error); return null }
  return toCamel(data)
}
