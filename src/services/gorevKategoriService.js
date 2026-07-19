import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cached, invalidate } from '../lib/cache'

// Görev kategorileri (mig 195) — Süper Admin ekler/düzenler/pasifler (madde 5)

export const gorevKategorileriGetir = (aktifSadece = true) => cached(`gorevKategoriler:${aktifSadece}`, async () => {
  let q = supabase.from('gorev_kategoriler').select('*').order('sira').order('ad')
  if (aktifSadece) q = q.eq('aktif', true)
  const { data, error } = await q
  if (error) { console.error('gorevKategorileriGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
})

const kategoriCacheTemizle = () => invalidate('gorevKategoriler:true', 'gorevKategoriler:false')

export const gorevKategoriEkle = async (kategori) => {
  const { data, error } = await supabase.from('gorev_kategoriler')
    .insert(toSnake(kategori)).select().single()
  if (error) { console.error('gorevKategoriEkle hata:', error.message); return null }
  kategoriCacheTemizle()
  return toCamel(data)
}

export const gorevKategoriGuncelle = async (id, degisiklik) => {
  const { data, error } = await supabase.from('gorev_kategoriler')
    .update(toSnake(degisiklik)).eq('id', id).select().single()
  if (error) { console.error('gorevKategoriGuncelle hata:', error.message); return null }
  kategoriCacheTemizle()
  return toCamel(data)
}
