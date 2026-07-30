// Sözleşme Arşivi — muhasebenin "firmalara ilettiğimiz sözleşmelerin tamamı"
// görünümü (Abdullah İğde talebi, 30.07).
//
// Üç ayrı tablo aynı soruyu yanıtlıyor ama farklı dille konuşuyor:
//   satis_sozlesmeleri : durum taslak→…→imzalandi, imzali_pdf_url  (satis-sozlesme bucket)
//   bayi_sozlesmeleri  : durum olusturuldu→imza_bekleniyor→imzalandi (bayi-evrak bucket)
//   sozlesmeler        : bakım/kiralama/hizmet, tek dosya_url        (filo-belge bucket)
// Burada hepsi TEK satır şemasına çevrilir; yükleme/görüntüleme kaynağa göre
// ilgili servise yönlendirilir. Ekran hangi tabloda olduğunu bilmek zorunda değil.

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel } from '../lib/mapper'
import { imzaliSozlesmeYukleSS, ssDosyaUrl } from './satisSozlesmeService'
import { imzaliSozlesmeYukle, bayiDosyaUrl } from './bayiService'
import { sozlesmeleriGetir, sozlesmeGuncelle, SOZLESME_TIPLERI } from './sozlesmeService'
import { filoDosyaYukle, filoDosyaUrl, sonYuklemeHata } from './filoService'
import { SS_DURUMLARI } from '../lib/satisSozlesmeMaddeleri'
import { SOZLESME_DURUMLARI as BAYI_DURUMLARI } from './bayiService'

// Liste sorgusu ÜRETİLEN İÇERİĞİ (sözleşme gövdesi, ~40-80 KB HTML) çekmez —
// arşivde yüzlerce kayıt olacak, gövdeler listeyi megabaytlara taşırdı.
// Belge önizlemesi açılınca tek kayıt için ayrıca istenir (arsivBelgeIcerigi).
const SATIS_KOLON = [
  'id', 'sozlesme_no', 'proje_adi', 'isin_konusu', 'firma_adi', 'musteri_id',
  'nihai_toplam', 'para_birimi', 'olusturma_tarih', 'gonderim_tarihi', 'imza_tarihi',
  'imzali_pdf_url', 'imzali_pdf_ad', 'durum', 'revizyon_no', 'hazirlayan_ad',
  'teklif_no', 'siparis_id', 'kur_farki_uygulanir', 'kur_farki_durumu',
].join(', ')

const BAYI_KOLON = [
  'id', 'firma_id', 'sozlesme_no', 'sozlesme_tarihi', 'imzali_pdf_url', 'imzali_pdf_ad',
  'durum', 'versiyon', 'olusturan_ad', 'olusturma_tarih', 'guncelleme_tarih',
].join(', ')

export const ARSIV_KAYNAKLARI = {
  satis: { isim: 'Satış Sözleşmesi', kisa: 'Satış', tone: 'brand' },
  bayi:  { isim: 'Bayi Sözleşmesi',  kisa: 'Bayi',  tone: 'bilgi' },
  genel: { isim: 'Bakım / Hizmet',   kisa: 'Genel', tone: 'neutral' },
}

// Üç kaynağın durum adları ortak imza diline indirgenir — muhasebe "hangi
// tabloda ne deniyor" değil "imzası geldi mi" sorusunu soruyor.
export const IMZA_DURUMLARI = {
  imzali:       { isim: 'İmzalı',          tone: 'aktif' },
  bekliyor:     { isim: 'İmza Bekleniyor', tone: 'uyari' },
  hazirlaniyor: { isim: 'Hazırlanıyor',    tone: 'neutral' },
  iptal:        { isim: 'İptal / Arşiv',   tone: 'kayip' },
}

const GUN = 86400000
const bugun = () => new Date(new Date().toDateString())

/** Gönderimden bugüne geçen gün — imzalanmışsa null (artık beklemiyor). */
const bekleyenGun = (gonderimTarihi, imzali) => {
  if (imzali || !gonderimTarihi) return null
  const g = Math.floor((bugun() - new Date(new Date(gonderimTarihi).toDateString())) / GUN)
  return Number.isFinite(g) && g >= 0 ? g : null
}

// ---------- Kaynak → ortak satır ----------

const satisSatiri = (s) => {
  const imzali = !!s.imzaliPdfUrl
  const iptal = s.durum === 'iptal'
  // İmzalı PDF ancak metin KESİNLEŞTİKTEN sonra anlamlı: taslak/onay bekleyen
  // sözleşmede içerik hâlâ değişebilir, o metnin imzası bağlayıcı olmaz.
  const hazirAsama = ['onaylandi', 'gonderildi', 'imzalandi'].includes(s.durum)
  return {
    anahtar: `satis-${s.id}`, kaynak: 'satis', id: s.id, ham: s,
    belgeNo: s.sozlesmeNo || `#${s.id}`,
    baslik: s.projeAdi || s.isinKonusu || '',
    firma: s.firmaAdi || '',
    tutar: s.nihaiToplam, paraBirimi: s.paraBirimi || 'TL',
    tarih: s.olusturmaTarih || null,
    gonderimTarihi: s.gonderimTarihi || null,
    imzaTarihi: s.imzaTarihi || null,
    dosyaYolu: s.imzaliPdfUrl || null, dosyaAdi: s.imzaliPdfAd || null,
    durumMetni: SS_DURUMLARI[s.durum]?.isim || s.durum,
    durumTone: SS_DURUMLARI[s.durum]?.tone || 'neutral',
    imzaDurumu: iptal ? 'iptal' : imzali ? 'imzali' : hazirAsama ? 'bekliyor' : 'hazirlaniyor',
    bekleyenGun: bekleyenGun(s.gonderimTarihi, imzali),
    revizyonNo: Number(s.revizyonNo) || 0,
    sorumlu: s.hazirlayanAd || '',
    detayYolu: `/sozlesmeler/satis/${s.id}`,
    yuklenebilir: hazirAsama,
    yuklemeEngeli: iptal
      ? 'İptal edilmiş sözleşmeye imzalı PDF yüklenemez.'
      : hazirAsama ? null
      : 'Sözleşme henüz yönetici onayından geçmedi — imzası bağlayıcı olmaz. Önce onaylatın.',
  }
}

const bayiSatiri = (s) => {
  const imzali = !!s.imzaliPdfUrl
  const kapali = ['iptal', 'arsiv'].includes(s.durum)
  // 'olusturuldu' = PDF üretildi ama bayiye HENÜZ iletilmedi. Buna "imza
  // bekleniyor" demek muhasebeyi yanıltır (kimse imzalamayı beklemiyor).
  const iletildi = s.durum === 'imza_bekleniyor'
  return {
    anahtar: `bayi-${s.id}`, kaynak: 'bayi', id: s.id, ham: s,
    belgeNo: s.sozlesmeNo || `#${s.id}`,
    baslik: s.versiyon > 1 ? `v${s.versiyon}` : '',
    firma: s.firma?.firmaAdi || '',
    tutar: null, paraBirimi: null,
    tarih: s.sozlesmeTarihi || null,
    // Bayi tarafında ayrı gönderim damgası yok — "imza bekleniyor" işareti
    // sözleşmenin bayiye iletildiği andır.
    gonderimTarihi: iletildi ? (s.guncellemeTarih || s.sozlesmeTarihi || null) : null,
    imzaTarihi: null,
    dosyaYolu: s.imzaliPdfUrl || null, dosyaAdi: s.imzaliPdfAd || null,
    durumMetni: BAYI_DURUMLARI[s.durum]?.isim || s.durum,
    durumTone: BAYI_DURUMLARI[s.durum]?.tone || 'neutral',
    imzaDurumu: kapali ? 'iptal' : imzali ? 'imzali' : iletildi ? 'bekliyor' : 'hazirlaniyor',
    bekleyenGun: bekleyenGun(iletildi ? (s.guncellemeTarih || s.sozlesmeTarihi) : null, imzali),
    revizyonNo: 0,
    sorumlu: s.olusturanAd || '',
    detayYolu: s.firmaId ? `/bayiler/${s.firmaId}` : null,
    yuklenebilir: !kapali,
    yuklemeEngeli: kapali ? 'İptal/arşiv sözleşmeye imzalı PDF yüklenemez.' : null,
  }
}

const genelSatiri = (s) => {
  const dosyaVar = !!s.dosyaUrl
  return {
    anahtar: `genel-${s.id}`, kaynak: 'genel', id: s.id, ham: s,
    belgeNo: s.baslik || `#${s.id}`,
    baslik: SOZLESME_TIPLERI.find(t => t.id === s.sozlesmeTipi)?.isim || s.sozlesmeTipi || '',
    firma: s.musteri?.firma || s.firmaAdi || '',
    tutar: s.tutar, paraBirimi: 'TL',
    tarih: s.baslangicTarih || null,
    // Bu modülde gönderim/imza damgası tutulmuyor; belge yüklendiyse imzalı
    // hali arşivde demektir. Bekleme süresi hesaplanamaz — uydurmuyoruz.
    gonderimTarihi: null, imzaTarihi: null,
    dosyaYolu: s.dosyaUrl || null, dosyaAdi: null,
    durumMetni: s.aktif ? 'Aktif' : 'Pasif',
    durumTone: s.aktif ? 'aktif' : 'pasif',
    imzaDurumu: !s.aktif && !dosyaVar ? 'iptal' : dosyaVar ? 'imzali' : 'bekliyor',
    bekleyenGun: null,
    revizyonNo: 0,
    sorumlu: '',
    detayYolu: null,
    yuklenebilir: true,
    yuklemeEngeli: null,
    bitisTarihi: s.bitisTarih || null,
  }
}

// ---------- Okuma ----------

const satisHamGetir = async () => {
  const { data, error } = await supabase
    .from('satis_sozlesmeleri').select(SATIS_KOLON).order('id', { ascending: false })
  if (error) { console.error('arsiv satis:', error.message); return [] }
  return arrayToCamel(data || [])
}

const bayiHamGetir = async () => {
  const { data, error } = await supabase
    .from('bayi_sozlesmeleri')
    .select(`${BAYI_KOLON}, firma:firma_id (id, firma_adi, kod)`)
    .order('id', { ascending: false })
  if (error) { console.error('arsiv bayi:', error.message); return [] }
  // toCamel SIĞ çalışır — join'li alt nesne ayrıca çevrilmezse firma_adi olarak kalır
  return arrayToCamel(data || []).map(s => (s.firma ? { ...s, firma: toCamel(s.firma) } : s))
}

/**
 * Üç kaynağı paralel çeker, tek listede birleştirir (en yeni önce).
 * Bir kaynak patlarsa diğerleri gelmeye devam eder — arşiv tamamen boş görünmesin.
 */
export const arsivKayitlariGetir = async () => {
  const [satis, bayi, genel] = await Promise.all([
    satisHamGetir().catch(e => { console.error('arsiv satis:', e?.message); return [] }),
    bayiHamGetir().catch(e => { console.error('arsiv bayi:', e?.message); return [] }),
    sozlesmeleriGetir().catch(e => { console.error('arsiv genel:', e?.message); return [] }),
  ])
  const liste = [
    ...(satis || []).map(satisSatiri),
    ...(bayi || []).map(bayiSatiri),
    ...(genel || []).map(genelSatiri),
  ]
  return liste.sort((a, b) => new Date(b.tarih || 0) - new Date(a.tarih || 0))
}

// ---------- Dosya ----------

const BUCKET_URL = { satis: ssDosyaUrl, bayi: bayiDosyaUrl, genel: filoDosyaUrl }

/** Kaydın imzalı belgesi için imzalı (signed) URL üretir. */
export const arsivDosyaUrl = (kayit) => {
  if (!kayit?.dosyaYolu) return Promise.resolve(null)
  const fn = BUCKET_URL[kayit.kaynak]
  return fn ? fn(kayit.dosyaYolu) : Promise.resolve(null)
}

/**
 * İmzalı PDF yükler ve kaydı imzalı duruma taşır.
 * Satış/bayi tarafında mevcut servis fonksiyonları kullanılır — durum geçişi,
 * evrak satırı, "Sözleşmeli Sipariş" işareti gibi yan etkiler orada tanımlı;
 * burada tekrar yazmak iki yerde ayrışan iş kuralı üretirdi.
 */
export const arsivImzaliYukle = async ({ kayit, file, kullanici }) => {
  if (!file) return { _hata: 'Dosya seçilmedi.' }
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    return { _hata: 'İmzalı sözleşme yalnızca PDF olarak yüklenebilir.' }
  }
  if (!kayit?.yuklenebilir) return { _hata: kayit?.yuklemeEngeli || 'Bu kayda yükleme yapılamaz.' }

  if (kayit.kaynak === 'satis') {
    return imzaliSozlesmeYukleSS({ sozlesme: kayit.ham, file })
  }
  if (kayit.kaynak === 'bayi') {
    return imzaliSozlesmeYukle({ sozlesme: kayit.ham, file, kullanici })
  }
  // Genel sözleşme: tek dosya alanı — imzalı tarama onun yerine geçer
  const yol = await filoDosyaYukle(file, 'sozlesme')
  if (!yol) return { _hata: 'Dosya yüklenemedi: ' + (sonYuklemeHata || 'bilinmeyen hata') }
  return sozlesmeGuncelle(kayit.id, { dosyaUrl: yol })
}

/**
 * Sözleşmenin üretilmiş gövdesi (önizleme modalı için, istek üzerine çekilir).
 * Genel sözleşmelerde gövde yoktur — yalnız yüklenen dosya vardır.
 */
export const arsivBelgeIcerigi = async (kayit) => {
  const tablo = kayit?.kaynak === 'satis' ? 'satis_sozlesmeleri'
    : kayit?.kaynak === 'bayi' ? 'bayi_sozlesmeleri' : null
  if (!tablo) return null
  const { data, error } = await supabase
    .from(tablo).select('uretilen_icerik').eq('id', kayit.id).single()
  if (error) { console.error('arsivBelgeIcerigi hata:', error.message); return null }
  return data?.uretilen_icerik || null
}

// ---------- Filtre / özet ----------

export const ARSIV_FILTRELERI = [
  { id: 'tumu',      isim: 'Tümü' },
  { id: 'bekleyen',  isim: 'İmza Bekleyenler' },
  { id: 'imzali',    isim: 'İmzalı Arşiv' },
  { id: 'geciken',   isim: '15+ Gündür Bekleyen' },
  { id: 'hazirlik',  isim: 'Hazırlık Aşamasında' },
  { id: 'kapali',    isim: 'İptal / Arşiv' },
]

export const arsivFiltrele = (kayit, filtre) => {
  switch (filtre) {
    case 'bekleyen': return kayit.imzaDurumu === 'bekliyor'
    case 'imzali':   return kayit.imzaDurumu === 'imzali'
    case 'geciken':  return kayit.imzaDurumu === 'bekliyor' && (kayit.bekleyenGun ?? 0) >= 15
    case 'hazirlik': return kayit.imzaDurumu === 'hazirlaniyor'
    case 'kapali':   return kayit.imzaDurumu === 'iptal'
    default: return true
  }
}

export const arsivOzet = (kayitlar) => {
  const liste = kayitlar || []
  return {
    toplam: liste.length,
    bekleyen: liste.filter(k => k.imzaDurumu === 'bekliyor').length,
    imzali: liste.filter(k => k.imzaDurumu === 'imzali').length,
    geciken: liste.filter(k => k.imzaDurumu === 'bekliyor' && (k.bekleyenGun ?? 0) >= 15).length,
  }
}
