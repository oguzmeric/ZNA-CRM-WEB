import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cached, invalidate, invalidatePrefix } from '../lib/cache'

// Liste için — notlar, vergi_no, vergi_dairesi, adres, ilgili_kisiler detay ekranında lazım
const MUSTERI_LISTE_KOLONLARI = 'id, ad, soyad, firma, unvan, telefon, email, sehir, durum, kod, olusturma_tarih, temsilci_kullanici_id'

export const musterileriGetir = () => cached('musteriler:list', async () => {
  // Supabase default 1000 limit — pagination ile tümünü çek
  const hepsi = []
  const sayfaBoyut = 1000
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('musteriler')
      .select(MUSTERI_LISTE_KOLONLARI)
      // olusturma_tarih benzersiz DEĞİL (esnweb toplu importu aynı damgayı taşır) —
      // tek başına sıralanırsa .range() sayfaları arasında satırlar tekrarlanır/atlanır.
      // id tiebreaker sıralamayı deterministik yapar (24.07 "her firma 3 kez" vakası).
      .order('olusturma_tarih', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + sayfaBoyut - 1)
    if (error) { console.error('musterileriGetir hata:', error.message); throw error }
    if (!data || data.length === 0) break
    hepsi.push(...data)
    if (data.length < sayfaBoyut) break
    offset += sayfaBoyut
  }
  return arrayToCamel(hepsi)
})

export const musteriGetir = (id) => cached(`musteri:${id}`, async () => {
  const { data } = await supabase.from('musteriler').select('*').eq('id', id).single()
  return toCamel(data)
})

export const musteriEkle = async (musteri) => {
  const { id, olusturmaTarih, ...rest } = musteri
  const { data, error } = await supabase.from('musteriler').insert(toSnake(rest)).select().single()
  if (error) { console.error('musteriEkle hata:', error.message); throw error }
  invalidate('musteriler:list')
  return toCamel(data)
}

export const musteriGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, ...rest } = guncellenmis
  const payload = toSnake(rest)
  const { data, error } = await supabase.from('musteriler').update(payload).eq('id', id).select().single()
  if (error) { console.error('musteriGuncelle hata:', error.message); throw error }
  invalidate('musteriler:list', `musteri:${id}`)
  return toCamel(data)
}

// Müşteriye bağlı kayıt sayıları — SİLMEDEN ÖNCE sorulur (mükerrer temizliği).
// ⚠️ 27 tablo musteri_id tutuyor ama teklifler/gorusmeler/servis_talepleri/
// gorevler/fatura_talepleri/satis_sozlesmeleri/trassir_lisanslar/
// malzeme_hareketleri'nde FK YOK — müşteri silinse DB ENGELLEMEZ, kayıtlar
// sahipsiz kalır. O yüzden kontrol istemcide yapılmak ZORUNDA (06.08).
const BAGLI_TABLOLAR = [
  { tablo: 'gorusmeler',            ad: 'görüşme' },
  { tablo: 'teklifler',             ad: 'teklif' },
  { tablo: 'servis_talepleri',      ad: 'servis talebi' },
  { tablo: 'servis_raporlari',      ad: 'servis raporu' },
  { tablo: 'gorevler',              ad: 'görev' },
  { tablo: 'siparisler',            ad: 'sipariş' },
  { tablo: 'on_siparisler',         ad: 'ön sipariş' },
  { tablo: 'fatura_talepleri',      ad: 'proforma' },
  { tablo: 'kesifler',              ad: 'keşif' },
  { tablo: 'sozlesmeler',           ad: 'sözleşme' },
  { tablo: 'satis_sozlesmeleri',    ad: 'satış sözleşmesi' },
  { tablo: 'toplu_bakimlar',        ad: 'toplu bakım' },
  { tablo: 'demo_zimmet_kayitlari', ad: 'demo zimmeti' },
  { tablo: 'musteri_cihazlari',     ad: 'kayıtlı cihaz' },
  { tablo: 'cihaz_kayitlari',       ad: 'cihaz kaydı' },
  { tablo: 'stok_kalemleri',        ad: 'sahadaki S/N' },
  { tablo: 'trassir_lisanslar',     ad: 'Trassir lisansı' },
  { tablo: 'malzeme_hareketleri',   ad: 'malzeme hareketi' },
  { tablo: 'kullanicilar',          ad: 'portal kullanıcısı' },
]

// Silinince birlikte gidecek (FK cascade) — engel DEĞİL, yalnız bilgilendirme
const CASCADE_TABLOLAR = [
  { tablo: 'musteri_kisiler',       ad: 'ilgili kişi' },
  { tablo: 'musteri_lokasyonlari',  ad: 'alt lokasyon' },
]

const sayFiltreli = async (tablo, musteriId) => {
  const { count, error } = await supabase
    .from(tablo).select('id', { count: 'exact', head: true }).eq('musteri_id', musteriId)
  if (error) {
    console.warn(`[bagliKayit] ${tablo}:`, error.message)
    return { hata: true, adet: 0 }   // okunamadıysa "0" deyip silmeye izin VERME
  }
  return { hata: false, adet: count || 0 }
}

/**
 * { bagli: [{ad, adet}], cascade: [{ad, adet}], toplam, okunamayan: [tablo] }
 * toplam > 0 → müşteri silinmemeli (kayıtlar sahipsiz kalır).
 */
export const musteriBagliKayitSayilari = async (musteriId) => {
  const id = Number(musteriId)
  const [bagliSonuc, cascadeSonuc] = await Promise.all([
    Promise.all(BAGLI_TABLOLAR.map(async t => ({ ...t, ...(await sayFiltreli(t.tablo, id)) }))),
    Promise.all(CASCADE_TABLOLAR.map(async t => ({ ...t, ...(await sayFiltreli(t.tablo, id)) }))),
  ])
  return {
    bagli: bagliSonuc.filter(x => x.adet > 0).map(({ ad, adet }) => ({ ad, adet })),
    cascade: cascadeSonuc.filter(x => x.adet > 0).map(({ ad, adet }) => ({ ad, adet })),
    toplam: bagliSonuc.reduce((s, x) => s + x.adet, 0),
    okunamayan: bagliSonuc.filter(x => x.hata).map(x => x.tablo),
  }
}

// ⚠️ Hata YUTULMAZ: eskiden error yalnız console'a yazılıyordu ve çağıran
// "Müşteri silindi" diyordu — bağlı kayıt (FK) ya da RLS engeli varsa müşteri
// DURUYOR ama kullanıcı sildiğini sanıyordu (06.08). Silinen satır sayısı da
// doğrulanır: 0 satır = yetki yok / kayıt yok.
export const musteriSil = async (id) => {
  const { data, error } = await supabase
    .from('musteriler').delete().eq('id', id).select('id')
  if (error) {
    console.error('musteriSil hata:', error.message)
    // Postgres FK ihlali (23503) — anlaşılır mesaja çevir
    if (error.code === '23503') {
      throw new Error('Bu müşteri silinemiyor: bağlı kayıtları var (teklif, servis, sipariş vb.). Önce bağlı kayıtları taşıyın ya da müşteriyi "Pasif" yapın.')
    }
    throw new Error('Müşteri silinemedi: ' + error.message)
  }
  if (!data?.length) throw new Error('Müşteri silinemedi — kayıt bulunamadı ya da silme yetkiniz yok.')
  invalidate('musteriler:list', `musteri:${id}`)
}

// Müşteri portalı: oturumdaki müşterinin kendi musteri kaydı + atanmış temsilci
// RLS sayesinde customer sadece kendi musteri satırını görür.
export const benimMusteriKaydim = async () => {
  const { data, error } = await supabase
    .from('musteriler')
    .select('*, temsilci:kullanicilar!temsilci_kullanici_id(id, ad, email, durum, tip)')
    .limit(1)
    .maybeSingle()
  if (error) { console.error('benimMusteriKaydim hata:', error.message); return null }
  if (!data) return null
  const { temsilci, ...rest } = data
  return { ...toCamel(rest), temsilci: temsilci ? toCamel(temsilci) : null }
}
