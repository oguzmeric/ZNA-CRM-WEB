// Bağımsız (dahili) SN üretimi + etiket kuyruğu (mig 220, mig 288).
//
// İKİ KAYNAK (mig 288):
//   • 'uretilen' — SN'siz ürüne ZNA ön ekli benzersiz SN üretilir (DB sequence,
//     atomik). Format TİRESİZ: ZNA00000001.
//   • 'elle'     — cihazın KENDİ seri numarası elle girilir; sahada etiketi
//     silinmiş/okunmaz olmuş cihazın etiketini yeniden basmak için.
// Etiket ofiste basılır: üstte "SN: <numara>", altta CODE128 barkod
// (BarkodEtiketYazdir duzen="sn").
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

/**
 * ELLE seri no ekle — cihazın kendi SN'si (mig 288).
 *
 * Etiketi silinmiş cihazın numarası okunup girilir, etiket yeniden basılır.
 * Aynı SN ikinci kez girilirse HATA VERMEZ: kayıt korunur, "basıldı" işareti
 * sıfırlanır → yeniden basım kuyruğuna girer (etiket tekrar silinebilir).
 */
export const bagimsizSnElleEkle = async ({ seriNo, urunAdi, stokKodu, musteriId, servisTalepId, kullanici } = {}) => {
  const temiz = String(seriNo || '').trim()
  if (!temiz) return { hata: 'Seri numarası boş olamaz.' }
  const { data, error } = await supabase.rpc('bagimsiz_sn_elle_ekle', {
    p_seri_no: temiz,
    p_urun_adi: urunAdi || null,
    p_stok_kodu: stokKodu || null,
    p_musteri_id: musteriId || null,
    p_servis_talep_id: servisTalepId || null,
    p_olusturan_id: kullanici?.id ?? null,
    p_olusturan_ad: kullanici?.ad ?? null,
  })
  if (error) { console.error('[bagimsizSnElleEkle]', error.message); return { hata: error.message } }
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
// true = gerçekten işaretlendi (20.08 sessiz-hata temizliği): eskiden hata
// yutulup çağıran koşulsuz 'işaretlendi' diyordu.
export const etiketBasildiIsaretle = async (ids) => {
  if (!ids?.length) return true
  const { error } = await supabase.from('bagimsiz_snler')
    .update({ etiket_basildi: true, etiket_basim_tarih: new Date().toISOString() })
    .in('id', ids)
  if (error) { console.warn('[etiketBasildiIsaretle]', error.message); return false }
  return true
}

// SN kaydını sil (yanlış üretilen / demo). Cihaza atanmış SN'in cihaz kaydına
// dokunmaz — yalnız etiket kuyruğundan çıkarır.
export const bagimsizSnSil = async (ids) => {
  if (!ids?.length) return { silinen: 0 }
  const { error, count } = await supabase.from('bagimsiz_snler')
    .delete({ count: 'exact' }).in('id', ids)
  if (error) { console.error('[bagimsizSnSil]', error.message); return { hata: error.message } }
  return { silinen: count ?? ids.length }
}

// ── Havuzdan stok koduna atama (mig 317) ────────────────────────────────
// "Atanabilir" = ne bir stok kalemine ne bir müşteri cihazına bağlı.
// Büyük liste kuralı: sınır + arama servise gömülü (varsayılan 200).
export const atanabilirSnleriGetir = async ({ arama = '', limit = 200 } = {}) => {
  let q = supabase
    .from('bagimsiz_snler')
    .select('id, seri_no, urun_adi, stok_kodu, kaynak, olusturan_ad, olusturma_tarih, etiket_basildi')
    .is('stok_kalemi_id', null)
    .is('cihaz_id', null)
    .order('olusturma_tarih', { ascending: false })
    .limit(limit)
  const temiz = String(arama || '').trim()
  if (temiz) q = q.ilike('seri_no', `%${temiz}%`)
  const { data, error } = await q
  if (error) { console.error('[atanabilirSnleriGetir]', error.message); throw error }
  return arrayToCamel(data || [])
}

// Kısmi sonuç döner: { eklenen: number, atlanan: [{ seri_no, sebep }] }.
// Defteri RPC değil köprü trigger yazar (reference_stok_hareket_tek_kaynak).
export const snleriStogaAta = async (ids, stokKodu) => {
  const { data, error } = await supabase.rpc('bagimsiz_sn_stoga_ata', {
    p_ids: ids,
    p_stok_kodu: stokKodu,
  })
  if (error) throw new Error(error.message || 'Atama başarısız.')
  return data // { eklenen, atlanan }
}
