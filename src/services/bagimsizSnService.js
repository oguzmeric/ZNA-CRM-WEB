// Bağımsız (dahili) SN üretimi + etiket kuyruğu (mig 220).
//
// Sahada SN'siz ürünlere ZNA- ön ekli benzersiz SN üretilir (DB sequence, atomik);
// müşteri cihaz envanterine bağlanır; etiket ofiste A4 3×8 barkod sayfasıyla basılır.
import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel } from '../lib/mapper'

// SN üret — RPC atomik. Döner: { kayit: {id, seriNo, urunAdi, ...} } | { hata }
export const bagimsizSnUret = async ({ urunAdi, stokKodu, musteriId, servisTalepId, kullanici } = {}) => {
  const { data, error } = await supabase.rpc('bagimsiz_sn_uret', {
    p_urun_adi: urunAdi || null,
    p_stok_kodu: stokKodu || null,
    p_musteri_id: musteriId || null,
    p_servis_talep_id: servisTalepId || null,
    p_olusturan_id: kullanici?.id ?? null,
    p_olusturan_ad: kullanici?.ad ?? null,
  })
  if (error) { console.error('[bagimsizSnUret]', error.message); return { hata: error.message } }
  return { kayit: toCamel(data) }
}

// Üretilen SN'e oluşan müşteri cihaz kaydını bağla (client cihazEkle sonrası)
export const bagimsizSnCihazBagla = async (id, cihazId) => {
  const { error } = await supabase.from('bagimsiz_snler').update({ cihaz_id: cihazId }).eq('id', id)
  if (error) console.warn('[bagimsizSnCihazBagla]', error.message)
}

// Etiket kuyruğu — varsayılan yalnız basılmamışlar
export const etiketKuyruguGetir = async ({ sadeceBasilmamis = true } = {}) => {
  let q = supabase.from('bagimsiz_snler').select('*').order('olusturma_tarih', { ascending: false })
  if (sadeceBasilmamis) q = q.eq('etiket_basildi', false)
  const { data, error } = await q
  if (error) { console.error('[etiketKuyruguGetir]', error.message); return [] }
  return arrayToCamel(data)
}

// Bir servise üretilmiş bağımsız SN'ler (servis detayında cihaz listesi için)
export const servisBagimsizSnleriGetir = async (servisTalepId) => {
  const { data, error } = await supabase
    .from('bagimsiz_snler').select('*')
    .eq('servis_talep_id', servisTalepId)
    .order('olusturma_tarih', { ascending: true })
  if (error) { console.warn('[servisBagimsizSnleriGetir]', error.message); return [] }
  return arrayToCamel(data)
}

// Etiketleri "basıldı" işaretle
export const etiketBasildiIsaretle = async (ids) => {
  if (!ids?.length) return
  const { error } = await supabase.from('bagimsiz_snler')
    .update({ etiket_basildi: true, etiket_basim_tarih: new Date().toISOString() })
    .in('id', ids)
  if (error) console.warn('[etiketBasildiIsaretle]', error.message)
}
