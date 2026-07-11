// Depo v3: arıza + RMA + rezerve + sayım + min stok + global barkod arama.
// Ana stok akışı stokService.js'de; burası "üst düzey" depo işlemleri.

import { supabase } from '../lib/supabase'

// Oturum kullanıcısı → kullanicilar.id
const oturumKullaniciId = async () => {
  const { data: sess } = await supabase.auth.getUser()
  if (!sess?.user?.id) return null
  const { data: kul } = await supabase.from('kullanicilar')
    .select('id').eq('auth_id', sess.user.id).maybeSingle()
  return kul?.id || null
}

// Ortak: stok_hareketleri'ne audit satırı
const hareket = async ({ stokKodu, stokAdi, tip, aciklama }) => {
  const uid = await oturumKullaniciId()
  await supabase.from('stok_hareketleri').insert({
    stok_kodu: stokKodu,
    stok_adi: stokAdi || null,
    hareket_tipi: tip,
    miktar: 1,
    aciklama,
    tarih: new Date().toISOString(),
    kullanici_id: uid,
  })
}

// ─────────────────────────────────────────────────────────────
// ARIZA — SN'i arızalı işaretle (sebep + geldiği kaynak audit'li)
// ─────────────────────────────────────────────────────────────

export const ARIZA_SEBEPLERI = [
  { id: 'ariza_uretici',   ad: 'Üretim/donanım hatası' },
  { id: 'fiziksel_hasar',  ad: 'Fiziksel hasar' },
  { id: 'yildirim',        ad: 'Yıldırım/aşırı gerilim' },
  { id: 'yazilim',         ad: 'Yazılım/firmware' },
  { id: 'kablolama',       ad: 'Kablolama/kurulum' },
  { id: 'diger',           ad: 'Diğer' },
]

export const RMA_SONUCLARI = [
  { id: 'onarildi',      ad: 'Onarıldı',        renk: '#10b981' },
  { id: 'degistirildi',  ad: 'Değiştirildi',    renk: '#3b82f6' },
  { id: 'red',           ad: 'Kabul edilmedi',  renk: '#ef4444' },
  { id: 'iptal',         ad: 'İptal',           renk: '#6b7280' },
]

// SN'i "arızalı depoda" olarak işaretle + kayıt aç.
// ATOMİK: mig 138 RPC — durum + arıza kaydı + hareket tek transaction
// (eskiden 3 ayrı sorguydu, ortada patlarsa yarım kalıyordu).
export async function snArizaliIsaretle(stokKalemId, {
  yeniDurum = 'arizali_depoda', // veya 'arizada' (teknisyende bozuldu)
  sebep = 'diger',
  aciklama = '',
  geldigi_teknisyen_id = null,
  geldigi_musteri_id = null,
}) {
  const uid = await oturumKullaniciId()
  const { data, error } = await supabase.rpc('sn_ariza_isaretle_atomik', {
    in_kalem_id: stokKalemId,
    in_yeni_durum: yeniDurum,
    in_sebep: sebep,
    in_sebep_ad: (ARIZA_SEBEPLERI.find(s => s.id === sebep) || {}).ad || sebep,
    in_aciklama: aciklama || null,
    in_teknisyen_id: geldigi_teknisyen_id,
    in_musteri_id: geldigi_musteri_id,
    in_olusturan_id: uid,
  })
  if (error) throw error
  return { kalem: data?.kalem, kayit: data?.kayit }
}

// SN arızası çözüldü — kayda not düş, kalem durumunu isteğe göre değiştir
export async function snArizasiCoz(arizaKayitId, { cozum_notu = '', yeniDurum = 'depoda' } = {}) {
  const { data: ariza, error: e1 } = await supabase
    .from('stok_ariza_kayitlari')
    .update({ cozum_notu, cozuldu_tarih: new Date().toISOString() })
    .eq('id', arizaKayitId)
    .select('stok_kalem_id')
    .single()
  if (e1) throw e1
  if (yeniDurum) {
    await supabase.from('stok_kalemleri')
      .update({ durum: yeniDurum })
      .eq('id', ariza.stok_kalem_id)
  }
  return ariza
}

// Bir kalemin tüm arıza kayıtları (son → ilk)
export async function kalemArizaGecmisi(stokKalemId) {
  const { data, error } = await supabase
    .from('stok_ariza_kayitlari')
    .select('*')
    .eq('stok_kalem_id', stokKalemId)
    .order('olusturuldu', { ascending: false })
  if (error) throw error
  return data || []
}

// ─────────────────────────────────────────────────────────────
// RMA — tedarikçiye/servise gönderme
// ─────────────────────────────────────────────────────────────

// ATOMİK: mig 138 RPC — kalem durumu + RMA kaydı + hareket tek transaction
export async function rmaOlustur(stokKalemId, { tedarikci_ad, kargo_no = '', tahmini_donus = null, notlar = '' }) {
  const uid = await oturumKullaniciId()
  const { data, error } = await supabase.rpc('sn_rma_olustur_atomik', {
    in_kalem_id: stokKalemId,
    in_tedarikci_ad: tedarikci_ad,
    in_kargo_no: kargo_no || null,
    in_tahmini_donus: tahmini_donus,
    in_notlar: notlar || null,
    in_olusturan_id: uid,
  })
  if (error) throw error
  return { kalem: data?.kalem, rma: data?.rma }
}

// ATOMİK: mig 138 RPC — RMA sonucu + kalem durumu + hareket tek transaction
export async function rmaGeriDondu(rmaId, { sonuc, notlar = '', yeniDurum = null }) {
  const uid = await oturumKullaniciId()
  const { data, error } = await supabase.rpc('sn_rma_donus_atomik', {
    in_rma_id: rmaId,
    in_sonuc: sonuc,
    in_sonuc_ad: (RMA_SONUCLARI.find(s => s.id === sonuc) || {}).ad || sonuc,
    in_notlar: notlar || null,
    in_yeni_durum: yeniDurum,
    in_olusturan_id: uid,
  })
  if (error) throw error
  return { rma: data?.rma, kalem: data?.kalem }
}

// Bir kalemin RMA geçmişi
export async function kalemRMAGecmisi(stokKalemId) {
  const { data, error } = await supabase
    .from('stok_rma_kayitlari')
    .select('*')
    .eq('stok_kalem_id', stokKalemId)
    .order('gonderim_tarih', { ascending: false })
  if (error) throw error
  return data || []
}

// Açık RMA'lar (henüz geri gelmemiş)
export async function acikRMAlar() {
  const { data, error } = await supabase
    .from('stok_rma_kayitlari')
    .select(`
      id, tedarikci_ad, kargo_no, gonderim_tarih, tahmini_donus, notlar,
      stok_kalem_id
    `)
    .is('geri_donus_tarih', null)
    .order('gonderim_tarih', { ascending: true })
  if (error) throw error
  const kalemIdler = (data || []).map(r => r.stok_kalem_id)
  if (!kalemIdler.length) return []
  const { data: kalemler } = await supabase
    .from('stok_kalemleri')
    .select('id, seri_no, stok_kodu, marka, model, durum')
    .in('id', kalemIdler)
  const map = new Map((kalemler || []).map(k => [k.id, k]))
  return (data || []).map(r => ({ ...r, kalem: map.get(r.stok_kalem_id) }))
}

// ─────────────────────────────────────────────────────────────
// REZERVE — Teklif için SN rezerve et
// ─────────────────────────────────────────────────────────────

export async function snRezerveEt(stokKalemId, teklifId) {
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .update({ rezerve_teklif_id: teklifId })
    .eq('id', stokKalemId)
    .eq('durum', 'depoda')      // sadece depodaki rezerve edilebilir
    .is('rezerve_teklif_id', null) // zaten rezerve değil
    .select().single()
  if (error) throw error
  return data
}

export async function snRezerveBirak(stokKalemId) {
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .update({ rezerve_teklif_id: null })
    .eq('id', stokKalemId)
    .select().single()
  if (error) throw error
  return data
}

// Bir teklifin rezerve ettiği kalemler
export async function teklifRezerveKalemleri(teklifId) {
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .select('id, seri_no, stok_kodu, marka, model, durum, rezerve_tarih')
    .eq('rezerve_teklif_id', teklifId)
    .eq('silindi', false)
  if (error) throw error
  return data || []
}

// ─────────────────────────────────────────────────────────────
// MİN STOK — kritik seviye altında olan ürünler
// ─────────────────────────────────────────────────────────────

// urun.min_stok altına düşen ürünleri getir.
// stok_urunler.stok_miktari sadece SN'siz ürünler için doğru; seri_takipli'lerde
// gerçek bakiyeyi stok_kalemleri'nden hesaplarız.
export async function kritikSeviyeUrunler() {
  const { data: urunler, error } = await supabase
    .from('stok_urunler')
    .select('id, stok_kodu, stok_adi, marka, kategori, birim, stok_miktari, min_stok, seri_takipli')
  if (error) throw error
  const list = urunler || []
  // Seri takipli ürünler için gerçek "depoda" sayısını al
  const takiplenler = list.filter(u => u.seri_takipli).map(u => u.stok_kodu)
  const sayilar = new Map()
  if (takiplenler.length) {
    const { data: kalemler } = await supabase
      .from('stok_kalemleri')
      .select('stok_kodu, durum, rezerve_teklif_id')
      .in('stok_kodu', takiplenler)
      .eq('silindi', false)
      .eq('durum', 'depoda')
    for (const k of kalemler || []) {
      const key = k.stok_kodu
      const cur = sayilar.get(key) || { toplam: 0, rezerve: 0 }
      cur.toplam += 1
      if (k.rezerve_teklif_id) cur.rezerve += 1
      sayilar.set(key, cur)
    }
  }
  return list.map(u => {
    const s = sayilar.get(u.stok_kodu) || { toplam: 0, rezerve: 0 }
    const gercekBakiye = u.seri_takipli ? s.toplam : (u.stok_miktari || 0)
    const satilabilir = gercekBakiye - s.rezerve
    return {
      ...u,
      gercek_bakiye: gercekBakiye,
      rezerve_adet: s.rezerve,
      satilabilir,
      kritik: (u.min_stok || 0) > 0 && satilabilir < (u.min_stok || 0),
    }
  }).filter(u => u.kritik).sort((a, b) => (a.satilabilir - a.min_stok) - (b.satilabilir - b.min_stok))
}

// Sadece kritik seviyedeki ürün sayısı (sidebar rozeti için)
export async function kritikSeviyeSayisi() {
  try {
    const liste = await kritikSeviyeUrunler()
    return liste.length
  } catch { return 0 }
}

// ─────────────────────────────────────────────────────────────
// GLOBAL BARKOD/SN ARAMA — F2 kısayolu için
// ─────────────────────────────────────────────────────────────

// SN'i her tabloda ara: stok_kalemleri (SN, barkod), stok_urunler (stok_kodu, barkod?)
export async function globalBarkodAra(giris) {
  const q = String(giris || '').trim()
  if (q.length < 2) return { kalemler: [], urunler: [] }
  // stok_kalemleri: SN veya barkod eşleşmesi
  const { data: kalemler } = await supabase
    .from('stok_kalemleri')
    .select('id, seri_no, stok_kodu, durum, teknisyen_id, rezerve_teklif_id, silindi, marka, model')
    .or(`seri_no.ilike.%${q}%,barkod.ilike.%${q}%`)
    .eq('silindi', false)
    .limit(20)
  // stok_urunler: stok_kodu / stok_adi / marka
  const { data: urunler } = await supabase
    .from('stok_urunler')
    .select('id, stok_kodu, stok_adi, marka, stok_miktari, min_stok, seri_takipli')
    .or(`stok_kodu.ilike.%${q}%,stok_adi.ilike.%${q}%,marka.ilike.%${q}%`)
    .limit(20)
  return { kalemler: kalemler || [], urunler: urunler || [] }
}

// ─────────────────────────────────────────────────────────────
// STOK SAYIM
// ─────────────────────────────────────────────────────────────

export async function sayimBaslat(aciklama = '') {
  const uid = await oturumKullaniciId()
  const { data: sayim, error: e1 } = await supabase
    .from('stok_sayimlar')
    .insert({ aciklama: aciklama || null, olusturan_id: uid })
    .select().single()
  if (e1) throw e1
  // Depodaki tüm aktif SN'leri sayım kalemlerine ekle
  const { data: kalemler } = await supabase
    .from('stok_kalemleri')
    .select('id')
    .eq('durum', 'depoda')
    .eq('silindi', false)
  const satirlar = (kalemler || []).map(k => ({ sayim_id: sayim.id, stok_kalem_id: k.id }))
  if (satirlar.length) {
    await supabase.from('stok_sayim_kalemleri').insert(satirlar)
  }
  return sayim
}

export async function sayimSNTara(sayimId, seriNo) {
  const sn = String(seriNo || '').trim()
  if (!sn) return { ok: false, reason: 'bos' }
  // SN'i bul
  const { data: kalem } = await supabase
    .from('stok_kalemleri')
    .select('id, durum, silindi')
    .eq('seri_no', sn).maybeSingle()
  if (!kalem) return { ok: false, reason: 'bulunamadi' }
  if (kalem.silindi) return { ok: false, reason: 'silinmis' }
  // Sayım kalemine tikle (yoksa ekle)
  const { data: mevcut } = await supabase
    .from('stok_sayim_kalemleri')
    .select('id, tarandi').eq('sayim_id', sayimId).eq('stok_kalem_id', kalem.id).maybeSingle()
  if (mevcut) {
    if (mevcut.tarandi) return { ok: true, reason: 'zaten_tarandi' }
    await supabase.from('stok_sayim_kalemleri')
      .update({ tarandi: true, tarama_zamani: new Date().toISOString() })
      .eq('id', mevcut.id)
    return { ok: true, reason: 'tarandi' }
  } else {
    // Sayım listesinde yok — "fazla" olarak ekle
    await supabase.from('stok_sayim_kalemleri').insert({
      sayim_id: sayimId,
      stok_kalem_id: kalem.id,
      tarandi: true,
      tarama_zamani: new Date().toISOString(),
    })
    return { ok: true, reason: 'fazladan' }
  }
}

export async function sayimOzet(sayimId) {
  const { data, error } = await supabase
    .from('stok_sayim_kalemleri')
    .select(`
      id, tarandi, tarama_zamani, stok_kalem_id
    `)
    .eq('sayim_id', sayimId)
  if (error) throw error
  const satirlar = data || []
  const kalemIdler = satirlar.map(s => s.stok_kalem_id)
  const { data: kalemler } = await supabase
    .from('stok_kalemleri')
    .select('id, seri_no, stok_kodu, marka, model, durum')
    .in('id', kalemIdler.length ? kalemIdler : [0])
  const map = new Map((kalemler || []).map(k => [k.id, k]))
  const enriched = satirlar.map(s => ({ ...s, kalem: map.get(s.stok_kalem_id) }))
  return {
    toplam: enriched.length,
    tarandi: enriched.filter(s => s.tarandi).length,
    eksik: enriched.filter(s => !s.tarandi),
    tarandiList: enriched.filter(s => s.tarandi),
  }
}

export async function sayimBitir(sayimId) {
  // Fark snapshot'ı kalıcı kaydedilir (mig 137: toplam/tarandi/eksik kolonları) —
  // sayım kapandıktan sonra denetim izinde "o gün kaç eksik vardı" sorusu cevaplanabilsin.
  const ozet = await sayimOzet(sayimId)
  const { error } = await supabase
    .from('stok_sayimlar')
    .update({
      tamamlandi: true,
      tamamlanma_tarihi: new Date().toISOString(),
      toplam_kalem: ozet.toplam,
      tarandi_kalem: ozet.tarandi,
      eksik_kalem: ozet.eksik.length,
    })
    .eq('id', sayimId)
  if (error) throw error
  return ozet
}

// Sayımı sil — cascade ile stok_sayim_kalemleri de siler
export async function sayimSil(sayimId) {
  const { error } = await supabase
    .from('stok_sayimlar')
    .delete()
    .eq('id', sayimId)
  if (error) throw error
}

export async function sonSayimlar(limit = 10) {
  const { data, error } = await supabase
    .from('stok_sayimlar')
    .select('*')
    .order('olusturuldu', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

// ─────────────────────────────────────────────────────────────
// TEKNİSYEN AYLIK RAPOR — kim ne aldı/iade etti
// ─────────────────────────────────────────────────────────────

export async function teknisyenAylikRapor(kullaniciId, ay /* YYYY-MM */) {
  const [y, m] = String(ay).split('-').map(Number)
  const bas = new Date(y, m - 1, 1).toISOString().split('T')[0]
  const bit = new Date(y, m, 1).toISOString().split('T')[0]
  // Kullanıcının adını al (hareket açıklamalarında geçiyor)
  const { data: kul } = await supabase
    .from('kullanicilar').select('ad').eq('id', kullaniciId).maybeSingle()
  const ad = String(kul?.ad || '').trim()
  if (!ad) return { hareketler: [], ozet: { toplam: 0, cikis: 0, giris: 0, ariza: 0 } }
  // stok_hareketleri.aciklama'da adı geçen tüm hareketler
  // (hareket yapan yönetim olsa da, teknisyene ait audit satırları burada)
  const { data, error } = await supabase
    .from('stok_hareketleri')
    .select('*')
    .ilike('aciklama', `%${ad}%`)
    .gte('tarih', bas)
    .lt('tarih', bit)
    .order('tarih', { ascending: false })
  if (error) throw error
  const list = data || []
  return {
    hareketler: list,
    ozet: {
      toplam: list.length,
      cikis: list.filter(h => h.hareket_tipi === 'transfer_cikis').length,
      giris: list.filter(h => h.hareket_tipi === 'transfer_giris').length,
      ariza: list.filter(h => h.hareket_tipi === 'ariza').length,
    },
  }
}
