// Mobiltek proxy istemcisi — supabase.functions.invoke ile edge function'a çağrı.

import { supabase } from '../lib/supabase'

const cagir = async (yol, params = {}) => {
  const { data, error } = await supabase.functions.invoke('mobiltek-proxy', {
    body: { yol, params },
  })
  if (error) {
    console.error('[mobiltek]', yol, error.message)
    return null
  }
  if (!data?.ok) {
    console.warn('[mobiltek]', yol, data?.hata)
    return null
  }
  return { veri: data.veri, mock: !!data.mock }
}

export const araclariGetir       = () => cagir('vehicles')
export const yakinlikTara        = async () => {
  const { data, error } = await supabase.functions.invoke('arac-yakinlik-tara')
  if (error) { console.warn('[yakinlik]', error.message); return null }
  return data
}
export const aktifYakinliklarGetir = async () => {
  const { data, error } = await supabase
    .from('arac_yakinlik_kayitlari')
    .select('id, arac1_plaka, arac2_plaka, ilk_zaman, son_zaman, son_mesafe_m, son_adres, alarm_verildi, alarm_zamani')
    .eq('cozuldu', false)
    .order('ilk_zaman')
  if (error) { console.warn('[yakinlik-liste]', error.message); return [] }
  return data ?? []
}
export const kameralariGetir     = (aracId) => cagir(`cameras/${aracId}`)

// Canlı stream URL al (v2)
export const canliKameraBaslat   = (aracId, kanal = 1) => cagir(`cameras-live/${aracId}`, { channel: kanal })
// Canlı stream durdur (v2)
export const canliKameraDurdur   = (aracId, kanal = 1) => cagir(`cameras-live-stop/${aracId}`, { channel: kanal })

// İzleme log tut (Supabase DB'ye kayıt)
export const izlemeLogBaslat = async ({ aracId, aracPlaka, kanal, kullaniciId }) => {
  const { data, error } = await supabase.from('kamera_izleme_log').insert({
    kullanici_id: kullaniciId,
    arac_id: String(aracId),
    arac_plaka: aracPlaka ?? null,
    kanal,
  }).select('id').single()
  if (error) { console.warn('izlemeLogBaslat:', error.message); return null }
  return data.id
}

export const izlemeLogBitir = async (logId) => {
  if (!logId) return
  const bitis = new Date().toISOString()
  // Süreyi trigger yerine burada hesaplayalım (basit)
  const { data: mevcut } = await supabase.from('kamera_izleme_log').select('baslangic').eq('id', logId).single()
  const sure = mevcut?.baslangic
    ? Math.max(0, Math.round((new Date(bitis) - new Date(mevcut.baslangic)) / 1000))
    : null
  await supabase.from('kamera_izleme_log').update({ bitis, sure_saniye: sure }).eq('id', logId)
}
export const konumLoglariGetir   = (aracId, tarihBaslangic, tarihBitis) =>
  cagir(`vehicles/location-logs/${aracId}`, { start: tarihBaslangic, end: tarihBitis })
export const canliTakipHarita    = () => cagir('live-map')
export const canliTakipAracV1    = (aracId) => cagir(`live-map/${aracId}`)
export const motorDurumu         = (aracId) => cagir(`vehicles/engine-status/${aracId}`)
export const surucuList          = () => cagir('drivers')
export const geocoding           = (lat, lng) => cagir('geocoding', { lat, lng })
