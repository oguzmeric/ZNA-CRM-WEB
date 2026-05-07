import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cached, invalidate } from '../lib/cache'

// Cihaz havuzu — view üzerinden hesaplanan durum dahil
export const demoCihazlariGetir = () => cached('demo:cihazlar:list', async () => {
  const { data, error } = await supabase
    .from('demo_cihazlari_durum')
    .select('*')
    .order('olusturma_tarih', { ascending: false })
  if (error) { console.error('demoCihazlariGetir hata:', error.message); throw error }
  return arrayToCamel(data || [])
})

export const demoCihazGetir = (id) => cached(`demo:cihaz:${id}`, async () => {
  const { data, error } = await supabase
    .from('demo_cihazlari_durum')
    .select('*')
    .eq('id', id)
    .single()
  if (error) { console.error('demoCihazGetir hata:', error.message); return null }
  return toCamel(data)
})

export const demoCihazEkle = async (payload) => {
  const { data, error } = await supabase
    .from('demo_cihazlari')
    .insert(toSnake(payload))
    .select()
    .single()
  if (error) { console.error('demoCihazEkle hata:', error.message); return null }
  invalidate('demo:cihazlar:list')
  return toCamel(data)
}

export const demoCihazGuncelle = async (id, payload) => {
  const { data, error } = await supabase
    .from('demo_cihazlari')
    .update(toSnake(payload))
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('demoCihazGuncelle hata:', error.message); return null }
  invalidate('demo:cihazlar:list', `demo:cihaz:${id}`)
  return toCamel(data)
}

export const demoCihazSil = async (id) => {
  const { error } = await supabase.from('demo_cihazlari').delete().eq('id', id)
  if (error) { console.error('demoCihazSil hata:', error.message); return false }
  invalidate('demo:cihazlar:list', `demo:cihaz:${id}`)
  return true
}

export const demoBakimaAl = async (id, bakimda) =>
  demoCihazGuncelle(id, { bakimda })

// Zimmet — geçmiş + aktif
export const demoZimmetGecmisi = async (cihazId) => {
  const { data, error } = await supabase
    .from('demo_zimmet_kayitlari')
    .select('*, musteri:musteri_id (id, firma, ad, soyad), lokasyon:lokasyon_id (id, ad)')
    .eq('cihaz_id', cihazId)
    .order('veris_tarihi', { ascending: false })
  if (error) { console.error('demoZimmetGecmisi hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const aktifZimmetleriGetir = async () => {
  const { data, error } = await supabase
    .from('demo_zimmet_kayitlari')
    .select('*, cihaz:cihaz_id (id, ad, marka, model), musteri:musteri_id (id, firma, ad, soyad)')
    .is('gercek_iade_tarihi', null)
  if (error) { console.error('aktifZimmetleriGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const demoZimmetAc = async (payload) => {
  const { data, error } = await supabase
    .from('demo_zimmet_kayitlari')
    .insert(toSnake({
      ...payload,
      uyari3gunKalaGonderildi: false,
      uyariSuresiGectiSonGonderim: null,
    }))
    .select()
    .single()
  if (error) {
    console.error('demoZimmetAc hata:', error)
    return { _hata: error.message || 'bilinmeyen hata' }
  }
  invalidate('demo:cihazlar:list', `demo:cihaz:${payload.cihazId}`)
  return toCamel(data)
}

export const demoZimmetIadeAl = async (zimmetId, { gercekIadeTarihi, musteriKarari, durumNotu }) => {
  const { data, error } = await supabase
    .from('demo_zimmet_kayitlari')
    .update(toSnake({
      gercekIadeTarihi: gercekIadeTarihi || new Date().toISOString().slice(0, 10),
      musteriKarari: musteriKarari || null,
      durumNotu: durumNotu || null,
    }))
    .eq('id', zimmetId)
    .select()
    .single()
  if (error) { console.error('demoZimmetIadeAl hata:', error.message); return null }
  invalidate('demo:cihazlar:list', `demo:cihaz:${data.cihaz_id}`)
  return toCamel(data)
}

export const demoZimmetUzat = async (zimmetId, yeniBeklenenTarih, neden) => {
  const { data: mevcut } = await supabase
    .from('demo_zimmet_kayitlari')
    .select('durum_notu, beklenen_iade_tarihi')
    .eq('id', zimmetId)
    .single()
  const yeniNot = `${mevcut?.durum_notu ? mevcut.durum_notu + '\n' : ''}` +
    `[Uzatma ${new Date().toLocaleDateString('tr-TR')}] ${mevcut?.beklenen_iade_tarihi} → ${yeniBeklenenTarih}` +
    (neden ? ` (${neden})` : '')
  const { data, error } = await supabase
    .from('demo_zimmet_kayitlari')
    .update(toSnake({
      beklenenIadeTarihi: yeniBeklenenTarih,
      durumNotu: yeniNot,
      uyari3gunKalaGonderildi: false,
    }))
    .eq('id', zimmetId)
    .select()
    .single()
  if (error) { console.error('demoZimmetUzat hata:', error.message); return null }
  invalidate('demo:cihazlar:list', `demo:cihaz:${data.cihaz_id}`)
  return toCamel(data)
}

export const zimmetUyariFlag = async (zimmetId, alanlar) => {
  await supabase.from('demo_zimmet_kayitlari').update(toSnake(alanlar)).eq('id', zimmetId)
}

// Dashboard kart kaynağı — view üzerinden
export const gecikmisDemolar = async () => {
  const { data, error } = await supabase
    .from('demo_cihazlari_durum')
    .select('*')
    .eq('hesaplanan_durum', 'suresi_gecti')
  if (error) return []
  return arrayToCamel(data || [])
}

export const yaklasanDemolar = async () => {
  const bugun = new Date().toISOString().slice(0, 10)
  const ucGunSonra = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('demo_cihazlari_durum')
    .select('*')
    .eq('hesaplanan_durum', 'musteride')
    .gte('beklenen_iade_tarihi', bugun)
    .lte('beklenen_iade_tarihi', ucGunSonra)
  if (error) return []
  return arrayToCamel(data || [])
}
