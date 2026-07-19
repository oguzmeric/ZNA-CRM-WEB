// Servis malzemeleri (mig 153) — serviste kullanılan ürünlerin kaydı.
// Spec: "Kullanılan ürün otomatik olarak teknisyen deposundan düşmelidir."
// SN'li üründe teknisyendeki kalem seçilir → durum='sahada' (düşüm) + çıkış
// hareketi; silinirse geri alınır (durum='teknisyende' + giriş hareketi).
import { supabase } from '../lib/supabase'
import { arrayToCamel, toCamel } from '../lib/mapper'
import { invalidatePrefix } from '../lib/cache'

// Madde 23.10 — malzeme başına faturalandırma işareti. DB trigger'ı (mig 193)
// bu işarete göre Kullanılan Malzemeler'deki fatura durumunu senkron tutar.
export const FATURALANDIRMA_SECENEK = [
  { id: '',                      isim: 'Faturalandırma seç…' },
  { id: 'ucretli',               isim: '💰 Ücretli (faturalanacak)' },
  { id: 'garanti',               isim: '🛡 Garanti kapsamında' },
  { id: 'sozlesme',              isim: '📋 Bakım sözleşmesi' },
  { id: 'ucretsiz',              isim: '🎁 Ücretsiz' },
  { id: 'musteriden_alinan',     isim: '↩ Müşteriden alınan' },
  { id: 'iade',                  isim: '📦 İade edilecek' },
  { id: 'faturalandirilmayacak', isim: '🚫 Faturalandırılmayacak' },
]

const oturumKullanici = async () => {
  const { data: sess } = await supabase.auth.getUser()
  if (!sess?.user?.id) return { id: null, ad: null }
  const { data: kul } = await supabase.from('kullanicilar')
    .select('id, ad').eq('auth_id', sess.user.id).maybeSingle()
  return { id: kul?.id || null, ad: kul?.ad || null }
}

const hareketYaz = async ({ stokKodu, stokAdi, tip, aciklama, kullaniciId }) => {
  await supabase.from('stok_hareketleri').insert({
    stok_kodu: stokKodu,
    stok_adi: stokAdi || null,
    hareket_tipi: tip,
    miktar: 1,
    aciklama,
    tarih: new Date().toISOString(),
    kullanici_id: kullaniciId,
  })
}

export const servisMalzemeleriGetir = async (servisId) => {
  const { data, error } = await supabase
    .from('servis_malzemeleri')
    .select('*')
    .eq('servis_id', servisId)
    .order('tarih', { ascending: false })
  if (error) { console.error('[servisMalzemeleriGetir]', error.message); return [] }
  return arrayToCamel(data) ?? []
}

// Ürünün teknisyende olan aktif SN kalemleri (düşüm için seçilebilir liste)
export const teknisyendekiKalemler = async (stokKodu) => {
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .select('id, seri_no, teknisyen_id, model, teknisyen:teknisyen_id (ad)')
    .eq('stok_kodu', stokKodu)
    .eq('durum', 'teknisyende')
    .eq('silindi', false)
    .order('seri_no')
  if (error) { console.error('[teknisyendekiKalemler]', error.message); return [] }
  return arrayToCamel(data) ?? []
}

// Sonraki satır numarası — müşteri formundaki sıra bununla belirlenir
const sonrakiSiralama = async (servisId) => {
  const { data } = await supabase
    .from('servis_malzemeleri')
    .select('siralama').eq('servis_id', servisId)
    .order('siralama', { ascending: false }).limit(1)
  return (data?.[0]?.siralama ?? 0) + 1
}

/**
 * Malzeme ekle. kalem verilirse (SN'li) o kalem 'sahada' yapılır ve çıkış
 * hareketi yazılır; kalem yoksa yalnız kayıt + çıkış hareketi (miktarlı).
 * durum='planlanan' ise stok DÜŞÜLMEZ — sadece "kullanılacak" listesidir.
 */
export const servisMalzemeEkle = async ({
  servisId, servisKodu, urun, miktar = 1, kalem = null,
  birimFiyat = 0, durum = 'kullanildi',
}) => {
  const kul = await oturumKullanici()
  const planlanan = durum === 'planlanan'

  if (kalem && !planlanan) {
    // SN düşümü — teknisyen deposundan sahaya
    const { error: kErr } = await supabase
      .from('stok_kalemleri')
      .update({ durum: 'sahada' })
      .eq('id', kalem.id)
      .eq('durum', 'teknisyende')  // yarış koşulu: hâlâ teknisyendeyse düş
    if (kErr) throw new Error('SN düşümü yapılamadı: ' + kErr.message)
  }

  const { data, error } = await supabase
    .from('servis_malzemeleri')
    .insert({
      servis_id: servisId,
      stok_kodu: urun.stokKodu || null,
      urun_adi: urun.stokAdi || urun.urunAdi,
      miktar: Number(miktar) || 1,
      birim: urun.birim || 'Adet',
      seri_no: planlanan ? null : (kalem?.seriNo || null),
      kalem_id: planlanan ? null : (kalem?.id || null),
      birim_fiyat: Number(birimFiyat) || 0,
      durum,
      siralama: await sonrakiSiralama(servisId),
      kullanici_id: kul.id,
      kullanici_ad: kul.ad,
    })
    .select()
    .single()
  if (error) {
    // Malzeme kaydı başarısızsa SN düşümünü geri al (tutarlılık)
    if (kalem && !planlanan) {
      await supabase.from('stok_kalemleri').update({ durum: 'teknisyende' }).eq('id', kalem.id)
    }
    throw new Error('Malzeme kaydedilemedi: ' + error.message)
  }

  if (urun.stokKodu && !planlanan) {
    await hareketYaz({
      stokKodu: urun.stokKodu,
      stokAdi: urun.stokAdi || urun.urunAdi,
      tip: 'cikis',
      aciklama: kalem
        ? `Serviste kullanıldı: ${kalem.seriNo} — ${servisKodu || 'servis #' + servisId}`
        : `Serviste kullanıldı (${miktar} ${urun.birim || 'Adet'}) — ${servisKodu || 'servis #' + servisId}`,
      kullaniciId: kul.id,
    })
  }
  invalidatePrefix('stok')
  return toCamel(data)
}

// Malzeme kaydını sil + SN'li ise düşümü geri al
export const servisMalzemeSil = async (malzeme, servisKodu) => {
  const kul = await oturumKullanici()
  const { error } = await supabase.from('servis_malzemeleri').delete().eq('id', malzeme.id)
  if (error) throw new Error('Silinemedi: ' + error.message)

  if (malzeme.kalemId) {
    await supabase.from('stok_kalemleri')
      .update({ durum: 'teknisyende' })
      .eq('id', malzeme.kalemId)
      .eq('durum', 'sahada')  // yalnız hâlâ sahadaysa geri al
  }
  // 'planlanan' satır stoktan hiç düşmemişti — geri giriş yazmak stoğu ŞİŞİRİRDİ
  if (malzeme.stokKodu && malzeme.durum !== 'planlanan') {
    await hareketYaz({
      stokKodu: malzeme.stokKodu,
      stokAdi: malzeme.urunAdi,
      tip: 'giris',
      aciklama: malzeme.seriNo
        ? `Servis kullanımı geri alındı: ${malzeme.seriNo} — ${servisKodu || 'servis #' + malzeme.servisId}`
        : `Servis kullanımı geri alındı (${malzeme.miktar} ${malzeme.birim || 'Adet'}) — ${servisKodu || 'servis #' + malzeme.servisId}`,
      kullaniciId: kul.id,
    })
  }
  invalidatePrefix('stok')
}

/**
 * Miktar / birim fiyat düzenleme. Müşteri formundaki satır DB trigger'ı ile
 * kendiliğinden güncellenir (tutar da DB'de hesaplanır) — burada yazılmaz.
 */
export const servisMalzemeGuncelle = async (id, { miktar, birimFiyat, notlar, faturalandirma }) => {
  const alanlar = {}
  if (miktar !== undefined) alanlar.miktar = Number(miktar) || 0
  if (birimFiyat !== undefined) alanlar.birim_fiyat = Number(birimFiyat) || 0
  if (notlar !== undefined) alanlar.notlar = notlar || null
  if (faturalandirma !== undefined) alanlar.faturalandirma = faturalandirma || null
  const { data, error } = await supabase
    .from('servis_malzemeleri').update(alanlar).eq('id', id).select().single()
  if (error) throw new Error('Güncellenemedi: ' + error.message)
  return toCamel(data)
}

/**
 * Keşiften gelen 'planlanan' satırı "kullanıldı"ya çevirir: stok bu anda düşer.
 * SN'li üründe kalem seçilmiş olmalı.
 */
export const servisMalzemeKullanildiYap = async (malzeme, { kalem = null, servisKodu } = {}) => {
  const kul = await oturumKullanici()

  if (kalem) {
    const { error: kErr } = await supabase
      .from('stok_kalemleri').update({ durum: 'sahada' })
      .eq('id', kalem.id).eq('durum', 'teknisyende')
    if (kErr) throw new Error('SN düşümü yapılamadı: ' + kErr.message)
  }

  const { data, error } = await supabase
    .from('servis_malzemeleri')
    .update({
      durum: 'kullanildi',
      seri_no: kalem?.seriNo || null,
      kalem_id: kalem?.id || null,
      kullanici_id: kul.id,
      kullanici_ad: kul.ad,
      tarih: new Date().toISOString(),
    })
    .eq('id', malzeme.id)
    .select().single()
  if (error) {
    if (kalem) await supabase.from('stok_kalemleri').update({ durum: 'teknisyende' }).eq('id', kalem.id)
    throw new Error('İşaretlenemedi: ' + error.message)
  }

  if (malzeme.stokKodu) {
    await hareketYaz({
      stokKodu: malzeme.stokKodu,
      stokAdi: malzeme.urunAdi,
      tip: 'cikis',
      aciklama: kalem
        ? `Serviste kullanıldı: ${kalem.seriNo} — ${servisKodu || 'servis #' + malzeme.servisId}`
        : `Serviste kullanıldı (${malzeme.miktar} ${malzeme.birim || 'Adet'}) — ${servisKodu || 'servis #' + malzeme.servisId}`,
      kullaniciId: kul.id,
    })
  }
  invalidatePrefix('stok')
  return toCamel(data)
}

/**
 * Keşif kalemlerini servise "planlanan malzeme" olarak taşır (fiyatsız —
 * keşifte fiyat tutulmuyor; teknisyen/yetkili sonra girer). Stok DÜŞMEZ.
 */
export const kesiftenMalzemePlanla = async (servisId, kalemler = []) => {
  if (!servisId || !kalemler.length) return []
  const kul = await oturumKullanici()
  const satirlar = kalemler.map((k, i) => ({
    servis_id: servisId,
    stok_kodu: k.stokKodu || null,
    urun_adi: [k.urunAdi, k.marka].filter(Boolean).join(' — ') || 'Malzeme',
    miktar: Number(k.miktar) || 1,
    birim: k.birim || 'Adet',
    birim_fiyat: 0,
    durum: 'planlanan',
    siralama: i + 1,
    notlar: k.notlar || null,
    kullanici_id: kul.id,
    kullanici_ad: kul.ad,
  }))
  const { data, error } = await supabase.from('servis_malzemeleri').insert(satirlar).select()
  if (error) throw new Error('Keşif malzemeleri aktarılamadı: ' + error.message)
  return arrayToCamel(data) ?? []
}
