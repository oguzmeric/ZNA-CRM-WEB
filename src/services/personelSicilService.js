// Personel Sicil servisi (mig 310).
//
// Sicil kartı yedi tablodan besleniyor; bu dosya YALNIZ özlük tablosunun
// (personel_sicil) CRUD'unu ve kart için gereken kişi bazlı yardımcı sorguları
// tutar. İzin/avans/bordro/maaş zaten ikService'te — orada duruyor, burada
// TEKRARLANMIYOR (iki kaynak olursa biri güncellenir öbürü unutulur).
//
// ⚠️ HATA YUTMA YASAK: bu dosyada hiçbir fonksiyon catch içinde [] dönmez.
// Hata throw edilir, sekme "yüklenemedi + Tekrar Dene" gösterir. Arızalı
// Ürünler'de kaydı yutan bug tam olarak buydu: embed'de yanlış kolon adı →
// PostgREST 400 → servis boş dizi → "kaydetti ama listelemiyor".
//
// Yetki: personel_sicil RLS = ik_yetkili() → Ali (1), Oğuz (2), Abdullah (44).
// Sayfa kapısı ikGorebilirMi ile aynı küme, ek kontrol gerekmez.

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel } from '../lib/mapper'

// ── Sabit listeler ────────────────────────────────────────────────────────
// Kurumsal ERP'de bu alanlar serbest metin değil seçim listesidir; aynı
// departmanın "Teknik Servis" / "teknik servis" / "Tekik Servis" diye üç kez
// yazılması raporlamayı bozar.

export const DEPARTMANLAR = [
  'Yönetim', 'Muhasebe', 'Satış', 'Teknik Servis', 'Depo',
  'Saha Operasyon', 'Yazılım', 'İnsan Kaynakları', 'İdari İşler',
]

export const CINSIYETLER = [
  { id: 'kadin', isim: 'Kadın' },
  { id: 'erkek', isim: 'Erkek' },
]

export const MEDENI_DURUMLAR = [
  { id: 'bekar', isim: 'Bekâr' },
  { id: 'evli', isim: 'Evli' },
  { id: 'bosanmis', isim: 'Boşanmış' },
  { id: 'dul', isim: 'Dul' },
]

export const KAN_GRUPLARI = [
  'A Rh+', 'A Rh−', 'B Rh+', 'B Rh−', 'AB Rh+', 'AB Rh−', '0 Rh+', '0 Rh−',
]

export const OGRENIM_DURUMLARI = [
  'İlkokul', 'Ortaokul', 'Lise', 'Ön Lisans', 'Lisans', 'Yüksek Lisans', 'Doktora',
]

export const CALISMA_SEKILLERI = [
  { id: 'tam_zamanli', isim: 'Tam zamanlı' },
  { id: 'yari_zamanli', isim: 'Yarı zamanlı' },
  { id: 'sozlesmeli', isim: 'Sözleşmeli' },
]

export const SOZLESME_TURLERI = [
  { id: 'belirsiz_sureli', isim: 'Belirsiz süreli' },
  { id: 'belirli_sureli', isim: 'Belirli süreli' },
]

export const ASKERLIK_DURUMLARI = [
  { id: 'yapti', isim: 'Yaptı' },
  { id: 'muaf', isim: 'Muaf' },
  { id: 'tecilli', isim: 'Tecilli' },
  { id: 'yapmadi', isim: 'Yapmadı' },
  { id: 'ilgisiz', isim: 'İlgili değil' },
]

/** Sabit listeden okunur ad — bulunamazsa ham değeri döndürür (veri kaybolmaz). */
export const listeAdi = (liste, id) =>
  (liste.find(x => x.id === id)?.isim) || id || '—'

// ── Yardımcılar ───────────────────────────────────────────────────────────

/** DB'ye giden metin: boş string → null (boş string ile null aynı şey değil,
 *  CHECK kısıtları boş string'i reddeder). */
const bosNull = (v) => {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** Sayısal alan: boş → null, geçersiz → null. */
const sayiNull = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// personel_sicil tablosunun yazılabilir kolonları — WHITELIST.
// ⚠️ Formdan gelen nesneyi olduğu gibi göndermek, ekranda tutulan yardımcı
// alanların (kullaniciAd gibi) DB'ye gitmesine ve "column does not exist"
// hatasına yol açar. Kolon listesi burada TEK yerde tutulur.
const METIN_ALANLAR = [
  'tc_kimlik', 'dogum_yeri', 'cinsiyet', 'medeni_durum', 'uyruk', 'kan_grubu',
  'baba_adi', 'ana_adi', 'adres', 'il', 'ilce', 'ev_telefon',
  'acil_kisi_ad', 'acil_kisi_yakinlik', 'acil_kisi_telefon',
  'cikis_nedeni', 'departman', 'calisma_sekli', 'sozlesme_turu', 'calisma_yeri',
  'sgk_sicil_no', 'meslek_kodu', 'askerlik_durumu',
  'ogrenim_durumu', 'mezun_okul', 'bolum', 'iban', 'banka_adi', 'notlar',
]
const TARIH_ALANLAR = [
  'dogum_tarihi', 'ise_giris_tarihi', 'isten_cikis_tarihi', 'sigorta_baslangic',
]
const SAYI_ALANLAR = ['engellilik_orani', 'mezuniyet_yili', 'cocuk_sayisi', 'yonetici_id']

/** camelCase form → snake_case DB satırı (yalnız bilinen kolonlar). */
function formdanSatir(form = {}) {
  const satir = {}
  const al = (snake) => {
    // camelCase karşılığını üret: ise_giris_tarihi → iseGirisTarihi
    const camel = snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    return form[camel] !== undefined ? form[camel] : form[snake]
  }
  for (const k of METIN_ALANLAR) satir[k] = bosNull(al(k))
  for (const k of TARIH_ALANLAR) satir[k] = bosNull(al(k))
  for (const k of SAYI_ALANLAR) satir[k] = sayiNull(al(k))
  const es = al('es_calisiyor')
  satir.es_calisiyor = (es === undefined || es === null || es === '') ? null : !!es
  return satir
}

// ── Özlük kaydı ───────────────────────────────────────────────────────────

/** Tek personelin sicil kaydı. Kayıt henüz açılmamışsa null döner (hata DEĞİL). */
export async function sicilGetir(kullaniciId) {
  if (!kullaniciId) throw new Error('Personel id zorunlu.')
  const { data, error } = await supabase
    .from('personel_sicil')
    .select('*')
    .eq('kullanici_id', Number(kullaniciId))
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? toCamel(data) : null
}

/** Sicil kaydı oluştur/güncelle (upsert — kullanici_id birincil anahtar). */
export async function sicilKaydet(kullaniciId, form, guncelleyenId = null) {
  if (!kullaniciId) throw new Error('Personel id zorunlu.')

  const satir = {
    ...formdanSatir(form),
    kullanici_id: Number(kullaniciId),
    guncelleyen_id: guncelleyenId ? Number(guncelleyenId) : null,
  }

  // Tarih sırası kontrolü istemcide de yapılır — DB kısıtı son savunma ama
  // kullanıcıya anlaşılır mesaj vermek arayüzün işi.
  if (satir.ise_giris_tarihi && satir.isten_cikis_tarihi &&
      satir.isten_cikis_tarihi < satir.ise_giris_tarihi) {
    throw new Error('İşten çıkış tarihi, işe giriş tarihinden önce olamaz.')
  }

  const { data, error } = await supabase
    .from('personel_sicil')
    .upsert(satir, { onConflict: 'kullanici_id' })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return toCamel(data)
}

// ── Personel listesi (Sicil sekmesi) ──────────────────────────────────────

/**
 * Sicil sekmesindeki personel listesi: kullanicilar + varsa sicil kaydı.
 *
 * İki ayrı sorgu, istemcide eşleştirme — FK adı tahmin edip embed yazmıyoruz
 * (ikService'te de aynı disiplin: "join FK adı tahmin ETME").
 * Müşteri hesapları ve silinmiş hesaplar hariç.
 */
export async function personelListesiGetir() {
  const { data: kisiler, error: e1 } = await supabase
    .from('kullanicilar')
    .select('id, ad, unvan, email, cep_telefon, foto_url, rol, askida, hesap_silindi, created_at')
    .eq('tip', 'zna')
    .order('ad')
  if (e1) throw new Error(e1.message)

  const aktifKisiler = (kisiler || []).filter(k => !k.hesap_silindi)

  const { data: siciller, error: e2 } = await supabase
    .from('personel_sicil')
    .select('kullanici_id, ise_giris_tarihi, isten_cikis_tarihi, departman, dogum_tarihi, tc_kimlik')
  if (e2) throw new Error(e2.message)

  const sicilMap = new Map((siciller || []).map(s => [Number(s.kullanici_id), s]))

  return aktifKisiler.map(k => {
    const s = sicilMap.get(Number(k.id))
    return {
      ...toCamel(k),
      sicilVar: !!s,
      iseGirisTarihi: s?.ise_giris_tarihi || null,
      istenCikisTarihi: s?.isten_cikis_tarihi || null,
      departman: s?.departman || null,
      dogumTarihi: s?.dogum_tarihi || null,
      tcKimlik: s?.tc_kimlik || null,
    }
  })
}

/** Künye için tek kişi. Bulunamazsa null. */
export async function personelGetir(kullaniciId) {
  if (!kullaniciId) throw new Error('Personel id zorunlu.')
  const { data, error } = await supabase
    .from('kullanicilar')
    .select('id, ad, unvan, email, cep_telefon, foto_url, rol, tip, askida, aski_sebebi, ehliyet_sinifi, ehliyet_bitis, created_at')
    .eq('id', Number(kullaniciId))
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? toCamel(data) : null
}

/** Yönetici seçimi için sade personel listesi. */
export async function yoneticiSecenekleriGetir() {
  const { data, error } = await supabase
    .from('kullanicilar')
    .select('id, ad, unvan, hesap_silindi')
    .eq('tip', 'zna')
    .order('ad')
  if (error) throw new Error(error.message)
  return (data || []).filter(k => !k.hesap_silindi).map(toCamel)
}

// ── Çalışma saatleri ──────────────────────────────────────────────────────

/**
 * Kişinin belirli tarih aralığındaki mesai kayıtları.
 *
 * ⚠️ SAAT DİLİMİ: sınırlar AÇIKÇA +03:00 damgalı gönderilir. Offset'siz
 * gönderilen 'YYYY-MM-DDT00:00:00' değerini Postgres oturum TZ'inde (UTC)
 * yorumlar ve TR günüyle 3 saat kayar — MesaiRaporu'nda hâlâ öyle, yeni kodda
 * tekrarlamıyoruz.
 *
 * tip: 'normal' | 'fazla' (sunucuda belirlenir; hafta sonu her saat 'fazla',
 * hafta içi 19:00 sonrası 'fazla').
 */
export async function mesaiKayitlariGetir(kullaniciId, baslangic, bitis) {
  if (!kullaniciId) throw new Error('Personel id zorunlu.')
  const { data, error } = await supabase
    .from('mesai_kayitlari')
    .select('id, kullanici_id, giris_zamani, cikis_zamani, sure_dakika, giris_mesafe_m, not_, tip')
    .eq('kullanici_id', Number(kullaniciId))
    .gte('giris_zamani', `${baslangic}T00:00:00+03:00`)
    .lte('giris_zamani', `${bitis}T23:59:59+03:00`)
    .order('giris_zamani', { ascending: false })
    .limit(2000)
  if (error) throw new Error(error.message)
  // ⚠️ camelCase'e ÇEVİRMİYORUZ — mesaiKayitDakica() snake_case alan okuyor
  // (k.sure_dakika, k.giris_zamani). Dönüştürürsek süre hep 0 çıkar.
  return data || []
}

// ── Maaş ──────────────────────────────────────────────────────────────────

/** Kişinin maaş geçmişi (yeniden eskiye). RLS: ik_puantaj_yetkili() — mig 309. */
export async function maasGecmisiGetir(kullaniciId) {
  if (!kullaniciId) throw new Error('Personel id zorunlu.')
  const { data, error } = await supabase
    .from('personel_maaslari')
    .select('id, kullanici_id, gecerli_baslangic, brut_tutar, maas_turu, bes_dahil, not_, ekleyen_id, olusturma_tarih')
    .eq('kullanici_id', Number(kullaniciId))
    .order('gecerli_baslangic', { ascending: false })
  if (error) throw new Error(error.message)
  return arrayToCamel(data)
}
