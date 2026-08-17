// Saha Cihazları sayfasının veri katmanı (13.08.2026).
//
// ⚠️ İKİ KAYNAK, İKİ AYRI LİSTE — BİRLEŞTİRME/EŞLEŞTİRME BİLEREK YOK
// (kullanıcı kararı: "karışıklık olmamalı"). Sayfa iki sekmeyle sunar:
//   1) Takılan Ürünler  → stok_kalemleri (musteri_id dolu, silinmemiş):
//      depodan çıkıp S/N ile müşteriye bağlanan ürünler. Asıl saha envanteri
//      (canlıda 166 kayıt / 7 müşteri).
//   2) Cihaz Envanteri  → musteri_cihazlari: müşteri kartına ELLE girilenler
//      (12 kayıt). Müşteri detayındaki bölümün toplu hâli — birebir aynı veri.
//
// Lokasyon iki tabloda FARKLI tutulur (bilinen köprü sorunu): stok_kalemleri
// `musteri_lokasyon_id` (ID), musteri_cihazlari `lokasyon` (metin). Her sekme
// kendi biçimini çözer; iki biçim tek kolonda karıştırılmaz.

import { supabase } from '../lib/supabase'
import { arrayToCamel } from '../lib/mapper'
import { invalidatePrefix } from '../lib/cache'

/** id → ad sözlükleri: embed FK'ya güvenmek yerine iki küçük sorguyla map */
const musteriAdlari = async (idler) => {
  if (!idler.length) return {}
  const { data } = await supabase
    .from('musteriler').select('id, firma, ad, soyad').in('id', idler)
  const h = {}
  for (const m of data || []) {
    h[m.id] = m.firma || `${m.ad ?? ''} ${m.soyad ?? ''}`.trim() || `#${m.id}`
  }
  return h
}

const lokasyonAdlari = async (idler) => {
  if (!idler.length) return {}
  const { data } = await supabase
    .from('musteri_lokasyonlari').select('id, ad').in('id', idler)
  const h = {}
  for (const l of data || []) h[l.id] = l.ad
  return h
}

/**
 * Sekme 1 — depodan sahaya giden S/N'li ürünler.
 * ⚠️ `silindi=false` filtresi ŞART: soft delete satır silmez; filtresiz sorgu
 * silinen S/N'leri "sahada" gösterir (bilinen tuzak).
 */
export const takilanUrunleriGetir = async () => {
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .select('id, stok_kodu, seri_no, barkod, marka, model, durum, musteri_id, musteri_lokasyon_id, alt_lokasyon, takilma_tarihi, garanti_bitis_tarihi')
    .not('musteri_id', 'is', null)
    .eq('silindi', false)
    .order('takilma_tarihi', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })   // eşit tarihte kararlı sıra (id tiebreaker)
  if (error) { console.error('[takilanUrunleriGetir]', error.message); return [] }

  const liste = arrayToCamel(data)
  const [musteriler, lokasyonlar] = await Promise.all([
    musteriAdlari([...new Set(liste.map(k => k.musteriId).filter(Boolean))]),
    lokasyonAdlari([...new Set(liste.map(k => k.musteriLokasyonId).filter(Boolean))]),
  ])
  return liste.map(k => ({
    ...k,
    musteriAd: musteriler[k.musteriId] || `#${k.musteriId}`,
    // Kayıtlı lokasyon adı + varsa alt lokasyon detayı
    lokasyonAd: [lokasyonlar[k.musteriLokasyonId], k.altLokasyon]
      .filter(Boolean).join(' · '),
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// LOKASYON ATAMA (17.08.2026)
//
// 🔴 KÖK NEDEN: `stok_kalemleri.musteri_lokasyon_id` alanına yazan TEK BİR kod
// yolu yoktu — mobil `cihazTak` müşterinin İLK aktif lokasyonunu otomatik
// yazıyor, web servis malzemesi düşümü ise lokasyona hiç dokunmuyordu. Sonuç:
// sahadaki 166 kalemin müşterisi 166/166 dolu ama lokasyonu yalnız 6/166.
// Müşteri portalındaki "Cihazlarım" bu yüzden "Lokasyon girilmemiş" diyordu —
// sayfa doğruydu, veriyi girecek yer yoktu.
//
// ⚠️ Lokasyonlar MÜŞTERİYE ait: toplu atama tek müşteri içinde yapılır.
// ⚠️ Miktar değişmediği için `stok_hareketleri` (özet defter) YAZILMAZ —
//    yalnız kalemin yaşam döngüsü defterine (`stok_kalemi_hareketleri`) iz
//    düşülür. Özet deftere yazmak stoğu düşümsüz şişirirdi (bilinen tuzak).
// ─────────────────────────────────────────────────────────────────────────────

const oturumKullanici = async () => {
  const { data: sess } = await supabase.auth.getUser()
  if (!sess?.user?.id) return { id: null, ad: null }
  const { data: kul } = await supabase.from('kullanicilar')
    .select('id, ad').eq('auth_id', sess.user.id).maybeSingle()
  return { id: kul?.id || null, ad: kul?.ad || null }
}

/** Bir müşterinin lokasyonları — aktif olanlar önce, pasifler işaretli */
export const musteriLokasyonSecenekleri = async (musteriId) => {
  if (!musteriId) return []
  const { data, error } = await supabase
    .from('musteri_lokasyonlari')
    .select('id, ad, adres, aktif')
    .eq('musteri_id', musteriId)
    .order('aktif', { ascending: false })
    .order('ad')
  if (error) { console.error('[musteriLokasyonSecenekleri]', error.message); throw new Error(error.message) }
  return arrayToCamel(data) ?? []
}

/**
 * Seçili S/N kalemlerine lokasyon ata (toplu).
 *
 * Kapılar — hepsi SORGUDA, istemci kontrolüne güvenilmez:
 *   • `.eq('musteri_id', musteriId)` → başka müşterinin kalemine yazılamaz
 *   • `.eq('silindi', false)`        → soft-silinmiş kaleme yazılamaz
 *   • lokasyon o müşteriye ait mi    → ayrı doğrulama (aşağıda)
 *
 * `lokasyonId = null` göndermek atamayı KALDIRIR (yanlış atamayı geri almak için).
 *
 * @returns {{guncellenen:number, degismeyen:number}}
 */
export const kalemLokasyonAta = async ({ kalemIds, musteriId, lokasyonId, altLokasyon = null }) => {
  const idler = [...new Set((kalemIds || []).filter(Boolean))]
  if (!idler.length) return { guncellenen: 0, degismeyen: 0 }
  if (!musteriId) throw new Error('Müşteri belirtilmeden lokasyon atanamaz.')

  // Lokasyon gerçekten bu müşterinin mi? (istemci listesi bayat olabilir)
  if (lokasyonId) {
    const { data: lok } = await supabase
      .from('musteri_lokasyonlari').select('id, ad')
      .eq('id', lokasyonId).eq('musteri_id', musteriId).maybeSingle()
    if (!lok) throw new Error('Seçilen lokasyon bu müşteriye ait değil.')
  }

  const yeniAlt = altLokasyon?.trim() ? altLokasyon.trim() : null

  // Mevcut değerleri ÖNCE oku — yalnız gerçekten değişen kalemlere iz düşülür.
  // (Aynı lokasyonu ikinci kez atamak defteri mükerrer satırla şişirmesin.)
  const { data: oncekiler, error: okErr } = await supabase
    .from('stok_kalemleri')
    .select('id, seri_no, musteri_lokasyon_id, alt_lokasyon')
    .in('id', idler).eq('musteri_id', musteriId).eq('silindi', false)
  if (okErr) { console.error('[kalemLokasyonAta:oku]', okErr.message); throw new Error(okErr.message) }

  const degisen = (oncekiler || []).filter(k =>
    String(k.musteri_lokasyon_id ?? '') !== String(lokasyonId ?? '') ||
    (k.alt_lokasyon || null) !== yeniAlt
  )
  const degismeyen = (oncekiler || []).length - degisen.length
  if (!degisen.length) return { guncellenen: 0, degismeyen }

  const { data: guncel, error } = await supabase
    .from('stok_kalemleri')
    .update({ musteri_lokasyon_id: lokasyonId || null, alt_lokasyon: yeniAlt })
    .in('id', degisen.map(k => k.id))
    .eq('musteri_id', musteriId)     // ⚠️ kapı UPDATE'te de tekrarlanır
    .eq('silindi', false)
    .select('id, seri_no')
  if (error) { console.error('[kalemLokasyonAta]', error.message); throw new Error(error.message) }

  // Yaşam döngüsü izi — fail-open: iz yazılamazsa atama geri alınmaz, çünkü
  // asıl veri (lokasyon) zaten yazıldı ve doğru. Hata konsola düşer.
  const kul = await oturumKullanici()
  const oncekiAd = Object.fromEntries((oncekiler || []).map(k => [k.id, k.musteri_lokasyon_id]))
  const { error: izErr } = await supabase.from('stok_kalemi_hareketleri').insert(
    (guncel || []).map(k => ({
      kalem_id: k.id,
      hareket: lokasyonId ? 'lokasyon_atandi' : 'lokasyon_kaldirildi',
      kaynak_aciklama: oncekiAd[k.id] ? `Lokasyon #${oncekiAd[k.id]}` : 'Lokasyonsuz',
      hedef_aciklama: lokasyonId ? `Lokasyon #${lokasyonId}` : 'Lokasyonsuz',
      musteri_id: musteriId,
      musteri_lokasyon_id: lokasyonId || null,
      kullanici_id: kul.id,
      kullanici_ad: kul.ad,
      not_metni: yeniAlt ? `Alt lokasyon: ${yeniAlt}` : null,
      tarih: new Date().toISOString(),
    }))
  )
  if (izErr) console.error('[kalemLokasyonAta:iz]', izErr.message)

  invalidatePrefix('stok')
  return { guncellenen: (guncel || []).length, degismeyen }
}

/** Sekme 2 — müşteri kartlarına elle girilen cihazlar (MusteriDetay ile aynı tablo) */
export const envanterCihazlariniGetir = async () => {
  const { data, error } = await supabase
    .from('musteri_cihazlari')
    .select('id, musteri_id, cihaz_adi, marka, model, seri_no, ip_adresi, lokasyon, durum, ariza_nedeni, olusturma_tarih')
    .order('olusturma_tarih', { ascending: false })
    .order('id', { ascending: false })
  if (error) { console.error('[envanterCihazlariniGetir]', error.message); return [] }

  const liste = arrayToCamel(data)
  const musteriler = await musteriAdlari([...new Set(liste.map(c => c.musteriId).filter(Boolean))])
  return liste.map(c => ({ ...c, musteriAd: musteriler[c.musteriId] || `#${c.musteriId}` }))
}
