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
