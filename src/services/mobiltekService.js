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
export const kameralariGetir     = (aracId) => cagir(`cameras/${aracId}`)
export const konumLoglariGetir   = (aracId, tarihBaslangic, tarihBitis) =>
  cagir(`vehicles/location-logs/${aracId}`, { start: tarihBaslangic, end: tarihBitis })
export const canliTakipHarita    = () => cagir('live-map')
export const canliTakipAracV1    = (aracId) => cagir(`live-map/${aracId}`)
export const motorDurumu         = (aracId) => cagir(`vehicles/engine-status/${aracId}`)
export const surucuList          = () => cagir('drivers')
export const geocoding           = (lat, lng) => cagir('geocoding', { lat, lng })
