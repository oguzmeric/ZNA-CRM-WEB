// Teklif çıktı logları (mig 158) — kim/ne zaman/hangi yolla çıktı aldı.
// Kayıt değiştirilemez (RLS'te update/delete yok) — izlenebilirlik için.

import { supabase } from '../lib/supabase'
import { arrayToCamel } from '../lib/mapper'

// Fire-and-forget: log yazılamasa bile çıktı akışını engellemez
export const ciktiLogla = async ({ teklif, kullanici, islem, taslak }) => {
  try {
    await supabase.from('teklif_cikti_loglari').insert({
      teklif_id: teklif?.id || null,
      teklif_no: teklif?.teklifNo || null,
      kullanici_id: kullanici?.id || null,
      kullanici_ad: kullanici?.ad || null,
      islem,
      taslak: !!taslak,
    })
  } catch (e) {
    console.error('ciktiLogla hata:', e?.message)
  }
}

export const ciktiLoglariGetir = async (teklifId, limit = 20) => {
  const { data, error } = await supabase
    .from('teklif_cikti_loglari')
    .select('*')
    .eq('teklif_id', teklifId)
    .order('id', { ascending: false })
    .limit(limit)
  if (error) { console.error('ciktiLoglariGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const ISLEM_ISIMLERI = { yazdir: 'Yazdırma', pdf: 'PDF indirme', excel: 'Excel indirme' }
