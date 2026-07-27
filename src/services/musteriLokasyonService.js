import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

export const musteriLokasyonlariniGetir = async (musteriId) => {
  const { data } = await supabase
    .from('musteri_lokasyonlari')
    .select('*')
    .eq('musteri_id', musteriId)
    .order('aktif', { ascending: false })
    .order('olusturma_tarih', { ascending: true })
  return arrayToCamel(data) ?? []
}

export const musteriLokasyonEkle = async (lokasyon) => {
  const { id, olusturmaTarih, ...rest } = lokasyon
  const { data, error } = await supabase
    .from('musteri_lokasyonlari')
    .insert(toSnake(rest))
    .select()
    .single()
  if (error) { console.error('musteriLokasyonEkle hata:', error.message); throw error }
  return toCamel(data)
}

export const musteriLokasyonGuncelle = async (lokasyonId, guncellenmis) => {
  const { id: _id, olusturmaTarih, ...rest } = guncellenmis
  const { data, error } = await supabase
    .from('musteri_lokasyonlari')
    .update(toSnake(rest))
    .eq('id', lokasyonId)
    .select()
    .single()
  if (error) { console.error('musteriLokasyonGuncelle hata:', error.message); throw error }
  return toCamel(data)
}

export const musteriLokasyonSil = async (id) => {
  const { error } = await supabase.from('musteri_lokasyonlari').delete().eq('id', id)
  if (error) console.error('musteriLokasyonSil hata:', error.message)
}

// ---------- Lokasyon bazlı kayıt dökümü ----------
// Müşteri detayında bir alt lokasyona tıklanınca: o lokasyondaki keşifler,
// takılı S/N ürünler, cihazlar, servis talepleri ve toplu bakımlar.
//
// DİKKAT — iki farklı bağlanma biçimi var (şema tarihçesi):
//   • ID ile  : stok_kalemleri.musteri_lokasyon_id, toplu_bakimlar.lokasyon_id
//   • METİN ile: kesifler.lokasyon, musteri_cihazlari.lokasyon,
//                servis_talepleri.lokasyon
// Metin eşleşmesi normalize edilir (TR harf + noktalama + boşluk farkları).

const trAscii = (s = '') =>
  String(s).toLocaleLowerCase('tr')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')

const lokNormalize = (s = '') => trAscii(s).replace(/[^a-z0-9]/g, '')

// Serbest metin lokasyon eşleşmesi. Saha ekibi lokasyon alanına adres ya da
// farklı sıralamada isim yazabiliyor ("DENEYİM MERKEZİ KAYAŞEHİR KAPALI PAZAR"
// ↔ lokasyon kaydı "KAYAŞEHİR DENEYİM"), bu yüzden tam eşitlik yetmiyor:
// lokasyon adının ANLAMLI kelimelerinin tamamı metinde geçiyorsa eşleşir.
const KISA_KELIMELER = new Set(['ve', 'ile', 'no', 'kat', 'cd', 'sk', 'mah', 'blok'])
const anlamliKelimeler = (ad = '') =>
  trAscii(ad).split(/[^a-z0-9]+/).filter(k => k.length >= 3 && !KISA_KELIMELER.has(k))

const metinLokasyonEsler = (kayitLokasyon, hedefAd) => {
  const kayit = lokNormalize(kayitLokasyon)
  const hedef = lokNormalize(hedefAd)
  if (!kayit || !hedef) return false
  if (kayit === hedef) return true                       // tam eşleşme

  const kelimeler = anlamliKelimeler(hedefAd)
  // TEK kelimelik lokasyon adı ("Merkez", "Depo") bulanık eşleşmez — yoksa
  // "FENERTEPE KÜLTÜR YAŞAM MERKEZİ" kaydını da kendine çeker (canlı vakada görüldü)
  if (kelimeler.length < 2) return false

  // Kelimeler METİN İÇİNDE TAM KELİME olarak geçmeli (substring değil):
  // "merkez" ≠ "merkezi" kazası olmasın
  const kayitKelimeler = new Set(trAscii(kayitLokasyon).split(/[^a-z0-9]+/).filter(Boolean))
  return kelimeler.every(k => kayitKelimeler.has(k))
}

export const lokasyonKayitlariGetir = async ({ musteriId, lokasyonId, lokasyonAdi }) => {
  const bos = { kesifler: [], snKalemler: [], cihazlar: [], servisler: [], bakimlar: [] }
  if (!musteriId || !lokasyonId) return bos
  const hedefAd = lokNormalize(lokasyonAdi)
  // Metin bazlı tablolarda lokasyon adı boşsa eşleşme yapılamaz
  const adVar = !!hedefAd

  const [kesifQ, snQ, cihazQ, servisQ, bakimQ] = await Promise.all([
    // Keşif: gerçek bağ (lokasyon_id, mig 236) VEYA aynı müşterinin serbest
    // metin keşifleri — metin olanlar aşağıda kelime bazlı elenir.
    supabase.from('kesifler')
      .select('id, kesif_no, lokasyon, lokasyon_id, kesif_tarihi, durum, proje_adi, kesif_basligi')
      .or(`lokasyon_id.eq.${lokasyonId}` + (musteriId ? `,musteri_id.eq.${musteriId}` : ''))
      .order('id', { ascending: false }).limit(150),
    supabase.from('stok_kalemleri')
      .select('id, seri_no, stok_kodu, marka, model, durum, takilma_tarihi, alt_lokasyon, ip_adresi, kanal_no')
      .eq('musteri_lokasyon_id', lokasyonId).eq('silindi', false)
      .order('id', { ascending: false }).limit(200),
    adVar
      ? supabase.from('musteri_cihazlari')
          .select('id, cihaz_adi, marka, model, seri_no, lokasyon, durum, ip_adresi')
          .eq('musteri_id', musteriId).order('id', { ascending: false }).limit(200)
      : Promise.resolve({ data: [] }),
    adVar
      ? supabase.from('servis_talepleri')
          .select('id, talep_no, konu, lokasyon, durum, olusturma_tarih')
          .eq('musteri_id', musteriId).order('id', { ascending: false }).limit(100)
      : Promise.resolve({ data: [] }),
    supabase.from('toplu_bakimlar')
      .select('id, tb_no, planlanan_tarih, durum, lokasyon_adi')
      .eq('lokasyon_id', lokasyonId).order('id', { ascending: false }).limit(50),
  ])

  const adEsle = (satirlar) =>
    (satirlar || []).filter(r => metinLokasyonEsler(r.lokasyon, lokasyonAdi))

  // Keşifte gerçek bağ varsa o kesindir; yoksa metin eşleşmesine düşülür
  const kesifEsle = (satirlar) =>
    (satirlar || []).filter(r =>
      r.lokasyon_id != null
        ? String(r.lokasyon_id) === String(lokasyonId)
        : metinLokasyonEsler(r.lokasyon, lokasyonAdi))

  return {
    kesifler: arrayToCamel(kesifEsle(kesifQ.data)),
    snKalemler: arrayToCamel(snQ.data || []),
    cihazlar: arrayToCamel(adEsle(cihazQ.data)),
    servisler: arrayToCamel(adEsle(servisQ.data)),
    bakimlar: arrayToCamel(bakimQ.data || []),
  }
}
