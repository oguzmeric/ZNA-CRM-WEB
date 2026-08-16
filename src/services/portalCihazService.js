// Müşteri portalı cihaz envanteri (mig 298).
//
// ⚠️ Kaynak `portal_cihazlarim` GÖRÜNÜMÜ — ham `stok_kalemleri` DEĞİL:
//    • ham tablo cihaz_sifre / cihaz_kullanici / ip_adresi / mac_adresi taşıyor;
//      RLS satır bazlı olduğu için tabloyu açmak bu kolonları da açardı
//    • satır filtresi (musteri_id = current_musteri_id()) görünümün İÇİNDE,
//      yani müşteri başkasının cihazını hiçbir sorguyla göremez
// ⚠️ Cihaz envanteri ÜÇ tabloda tutuluyor ve senkron değil; portal
//    `stok_kalemleri` kaynağını kullanır (3.937 satır — gerçek envanter;
//    musteri_cihazlari 13, cihaz_kayitlari 23 satır).
import { supabase } from '../lib/supabase'
import { arrayToCamel } from '../lib/mapper'

// Müşteriye gösterilen durum etiketleri — ham değerler depo diliyle yazılmış
export const CIHAZ_DURUMLARI = {
  sahada:         { etiket: 'Kullanımda',        tone: 'basarili' },
  teknisyende:    { etiket: 'Teknisyende',       tone: 'beklemede' },
  arizali_depoda: { etiket: 'Arızalı — serviste', tone: 'kayip' },
  depoda:         { etiket: 'Depoda',            tone: 'neutral' },
}

export const portalCihazlariGetir = async () => {
  const { data, error } = await supabase
    .from('portal_cihazlarim')
    .select('id, seri_no, marka, model, durum, kanal_no, takilma_tarihi, sokulme_tarihi, garanti_bitis_tarihi, alt_lokasyon, lokasyon_ad, lokasyon_adres, urun_adi, gorsel_url')
    .order('lokasyon_ad', { nullsFirst: false })
    .order('takilma_tarihi', { ascending: false })
    .order('id')
  if (error) {
    console.error('[portalCihazlariGetir]', error.message)
    throw new Error(error.message)
  }
  return arrayToCamel(data) ?? []
}
