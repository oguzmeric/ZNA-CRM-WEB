import { supabase } from '../lib/supabase'
import { toCamel, toSnake } from '../lib/mapper'

export const sistemAyarlariGetir = async () => {
  const { data } = await supabase.from('sistem_ayarlari').select('*').eq('id', 1).single()
  return toCamel(data) || {}
}

export const sistemAyarlariKaydet = async (ayarlar) => {
  const { id, ...rest } = ayarlar
  const { data } = await supabase.from('sistem_ayarlari')
    .upsert({ id: 1, ...toSnake(rest), updated_at: new Date().toISOString() })
    .select().single()
  return toCamel(data)
}

// ---- uygulama_ayarlari (mig 157) — anahtar/değer entegrasyon ayarları ----
// Okuma staff, yazma admin (RLS). İlk kullanım: OneDrive Client ID.

export const uygulamaAyarGetir = async (anahtar) => {
  const { data, error } = await supabase
    .from('uygulama_ayarlari').select('deger').eq('anahtar', anahtar).maybeSingle()
  if (error) { console.error('uygulamaAyarGetir hata:', error.message); return null }
  return data?.deger ?? null
}

export const uygulamaAyarKaydet = async (anahtar, deger, kullaniciId) => {
  const { error } = await supabase.from('uygulama_ayarlari').upsert({
    anahtar,
    deger,
    guncelleyen_id: kullaniciId || null,
    guncelleme_tarih: new Date().toISOString(),
  })
  if (error) return { _hata: error.message }
  return true
}
