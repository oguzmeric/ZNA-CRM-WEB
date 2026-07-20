// İK servisi — Bordrolar + İzin Talepleri (migration 204).
// Storage: 'bordrolar' bucket (PRIVATE) — indirme SADECE signed URL ile.
// RLS: personel yalnız kendi satırlarını görür; 'ik_yonetim' modüllüler + admin hepsini yönetir.

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel } from '../lib/mapper'
import { bildirimEkleDb, cokluBildirimEkle } from './bildirimService'

const BUCKET = 'bordrolar'

// ---------- Sabitler ----------
export const IZIN_TURLERI = [
  { id: 'yillik', isim: 'Yıllık İzin' },
  { id: 'mazeret', isim: 'Mazeret İzni' },
  { id: 'rapor', isim: 'Raporlu' },
  { id: 'ucretsiz', isim: 'Ücretsiz İzin' },
  { id: 'diger', isim: 'Diğer' },
]

// tone değerleri Badge bileşeninin TONE haritasıyla birebir (basarili/neutral/beklemede/kayip)
export const IZIN_DURUM = {
  bekliyor: { isim: 'Bekliyor', tone: 'beklemede' },
  onaylandi: { isim: 'Onaylandı', tone: 'basarili' },
  reddedildi: { isim: 'Reddedildi', tone: 'kayip' },
  iptal: { isim: 'İptal', tone: 'neutral' },
}

export const izinTurBilgi = (id) =>
  IZIN_TURLERI.find(t => t.id === id) || { id, isim: id || '—' }

export const izinDurumBilgi = (id) =>
  IZIN_DURUM[id] || { isim: id || '—', tone: 'neutral' }

// ---------- Yardımcılar ----------

/** Hafta sonu (Cumartesi + Pazar) HARİÇ gün sayısı — her iki uç dahil.
 *  baslangic/bitis: 'YYYY-MM-DD' string veya Date. Geçersizse 0 döner. */
export function isGunuHesapla(baslangic, bitis) {
  if (!baslangic || !bitis) return 0
  // Saat dilimi kaymasını önlemek için öğlen 12:00'a sabitle
  const bas = new Date(typeof baslangic === 'string' ? `${baslangic.slice(0, 10)}T12:00:00` : baslangic)
  const bit = new Date(typeof bitis === 'string' ? `${bitis.slice(0, 10)}T12:00:00` : bitis)
  if (isNaN(bas) || isNaN(bit) || bit < bas) return 0
  let sayac = 0
  const cursor = new Date(bas)
  while (cursor <= bit) {
    const g = cursor.getDay() // 0=Pazar, 6=Cumartesi
    if (g !== 0 && g !== 6) sayac++
    cursor.setDate(cursor.getDate() + 1)
  }
  return sayac
}

/** İK yetkililerinin id listesi (moduller text[] içinde 'ik_yonetim' olanlar). */
async function ikYetkilileriGetir() {
  const { data, error } = await supabase
    .from('kullanicilar')
    .select('id, ad')
    .contains('moduller', ['ik_yonetim'])
  if (error) { console.error('[ikYetkilileri]', error.message); return [] }
  return data || []
}

/** Kullanıcı adlarını ayrı sorguyla eşle (join FK adı tahmin ETME — güvenli yol).
 *  rows: kullanici_id içeren satırlar → Map<id, ad> döner. */
async function kullaniciAdMap(idler) {
  const tekil = [...new Set((idler || []).filter(Boolean).map(Number))]
  if (!tekil.length) return new Map()
  const { data, error } = await supabase
    .from('kullanicilar')
    .select('id, ad')
    .in('id', tekil)
  if (error) { console.error('[kullaniciAdMap]', error.message); return new Map() }
  return new Map((data || []).map(k => [Number(k.id), k.ad]))
}

// ---------- Bordrolar ----------

/** Bordro listesi. kullaniciId null → RLS süzer (personel kendi kayıtlarını görür,
 *  İK hepsini). İK sayfası belirli personel için kullaniciId verebilir.
 *  Dönen satırlara kullaniciAd eklenir (ayrı sorguyla eşlenir). */
export async function bordrolariGetir(kullaniciId = null) {
  // Sayfalar hem skaler hem { kullaniciId } biçiminde çağırıyor — ikisini de kabul et
  if (kullaniciId && typeof kullaniciId === 'object') {
    kullaniciId = kullaniciId.kullaniciId ?? null
  }
  let q = supabase
    .from('bordrolar')
    .select('id, kullanici_id, donem_yil, donem_ay, dosya_yol, dosya_ad, aciklama, yukleyen_id, olusturma_tarih')
    .order('donem_yil', { ascending: false })
    .order('donem_ay', { ascending: false })
  if (kullaniciId) q = q.eq('kullanici_id', Number(kullaniciId))
  const { data, error } = await q
  if (error) { console.error('[bordrolariGetir]', error.message); return [] }
  const adMap = await kullaniciAdMap((data || []).map(r => r.kullanici_id))
  return arrayToCamel(data).map(r => ({
    ...r,
    kullaniciAd: adMap.get(Number(r.kullaniciId)) || null,
  }))
}

/** Bordro yükle (İK). Aynı dönem varsa üzerine yazar (upsert) ve storage'daki
 *  eski dosyayı siler. İlgili personele bildirim gönderir. */
export async function bordroYukle({ kullaniciId, yil, ay, donemYil, donemAy, dosya, aciklama, yukleyenId }) {
  // IKYonetim donemYil/donemAy adlarıyla gönderiyor — iki adlandırmayı da kabul et
  yil = yil ?? donemYil
  ay = ay ?? donemAy
  if (!kullaniciId || !yil || !ay) throw new Error('Personel, yıl ve ay zorunlu.')
  if (!dosya) throw new Error('Dosya zorunlu.')

  // Aynı döneme ait eski kayıt var mı? (üzerine yazınca eski dosya storage'da kalmasın)
  const { data: eski } = await supabase
    .from('bordrolar')
    .select('id, dosya_yol')
    .eq('kullanici_id', Number(kullaniciId))
    .eq('donem_yil', Number(yil))
    .eq('donem_ay', Number(ay))
    .maybeSingle()

  const yol = `${kullaniciId}/${yil}-${ay}-${Date.now()}.pdf`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(yol, dosya, {
    cacheControl: '3600', upsert: false, contentType: 'application/pdf',
  })
  if (upErr) throw upErr

  const { data, error } = await supabase
    .from('bordrolar')
    .upsert({
      kullanici_id: Number(kullaniciId),
      donem_yil: Number(yil),
      donem_ay: Number(ay),
      dosya_yol: yol,
      dosya_ad: dosya.name || `bordro-${yil}-${ay}.pdf`,
      aciklama: aciklama?.trim() || null,
      yukleyen_id: yukleyenId ? Number(yukleyenId) : null,
    }, { onConflict: 'kullanici_id,donem_yil,donem_ay' })
    .select('id, kullanici_id, donem_yil, donem_ay, dosya_yol, dosya_ad, aciklama, olusturma_tarih')
    .single()
  if (error) {
    // Upsert patladıysa yeni yüklenen dosyayı geri temizle
    await supabase.storage.from(BUCKET).remove([yol]).catch(() => {})
    throw error
  }

  // Üzerine yazıldıysa eski dosyayı sil (yeni yol farklı — timestamp'li)
  if (eski?.dosya_yol && eski.dosya_yol !== yol) {
    await supabase.storage.from(BUCKET).remove([eski.dosya_yol]).catch(() => {})
  }

  // Personele bildirim — ana akışı BEKLETMEZ (timeout kaydı "hata" gibi gösteriyordu)
  const aylar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
  bildirimEkleDb({
    aliciId: Number(kullaniciId),
    baslik: '💼 Yeni bordro yüklendi',
    mesaj: `${aylar[Number(ay) - 1] || ay} ${yil} dönemi bordronuz yüklendi.`,
    tip: 'bilgi',
    link: '/izin-bordro',
  }).catch(e => console.warn('[bordro bildirimi]', e?.message))

  return toCamel(data)
}

/** Signed URL (300 sn) — private bucket'tan indirme/önizleme.
 *  dosyaAd verilirse tarayıcı o adla indirir (download parametresi). */
export async function bordroIndirUrl(dosyaYol, dosyaAd = null) {
  const { data, error } = await supabase.storage.from(BUCKET)
    .createSignedUrl(dosyaYol, 300, dosyaAd ? { download: dosyaAd } : undefined)
  if (error) throw error
  return data.signedUrl
}

/** Bordro sil (İK) — storage dosyası + tablo satırı.
 *  dosyaYol verilmezse satırdan okunur (IKYonetim yalnız id ile çağırıyor). */
export async function bordroSil(id, dosyaYol = null) {
  if (!dosyaYol) {
    const { data } = await supabase
      .from('bordrolar').select('dosya_yol').eq('id', id).maybeSingle()
    dosyaYol = data?.dosya_yol || null
  }
  const { error } = await supabase.from('bordrolar').delete().eq('id', id)
  if (error) throw error
  if (dosyaYol) {
    await supabase.storage.from(BUCKET).remove([dosyaYol]).catch(() => {})
  }
}

// ---------- İzin Talepleri ----------

/** İzin talepleri. kullaniciId null → RLS süzer (personel kendini, İK herkesi görür).
 *  durum verilirse ('bekliyor' vb.) ek süzgeç. Satırlara kullaniciAd + onaylayanAd eklenir. */
export async function izinTalepleriGetir({ kullaniciId = null, durum = null } = {}) {
  let q = supabase
    .from('izin_talepleri')
    .select('id, kullanici_id, tur, baslangic, bitis, gun_sayisi, aciklama, durum, onaylayan_id, onay_tarihi, karar_notu, olusturma_tarih')
    .order('olusturma_tarih', { ascending: false })
  if (kullaniciId) q = q.eq('kullanici_id', Number(kullaniciId))
  if (durum) q = q.eq('durum', durum)
  const { data, error } = await q
  if (error) { console.error('[izinTalepleriGetir]', error.message); return [] }
  const adMap = await kullaniciAdMap(
    (data || []).flatMap(r => [r.kullanici_id, r.onaylayan_id])
  )
  return arrayToCamel(data).map(r => ({
    ...r,
    kullaniciAd: adMap.get(Number(r.kullaniciId)) || null,
    onaylayanAd: r.onaylayanId ? (adMap.get(Number(r.onaylayanId)) || null) : null,
  }))
}

/** Yeni izin talebi (personel kendi adına; İK herkese — RLS karar verir).
 *  payload: { kullaniciId, tur, baslangic, bitis, gunSayisi, aciklama }
 *  İK yetkililerine bildirim gönderir. */
export async function izinTalepEkle({ kullaniciId, tur, baslangic, bitis, gunSayisi, aciklama }) {
  if (!kullaniciId) throw new Error('Oturum bulunamadı.')
  if (!tur) throw new Error('İzin türü zorunlu.')
  if (!baslangic || !bitis) throw new Error('Başlangıç ve bitiş tarihi zorunlu.')

  const gun = gunSayisi != null && gunSayisi !== ''
    ? Number(gunSayisi)
    : isGunuHesapla(baslangic, bitis)

  const { data, error } = await supabase
    .from('izin_talepleri')
    .insert({
      kullanici_id: Number(kullaniciId),
      tur,
      baslangic,
      bitis,
      gun_sayisi: gun,
      aciklama: aciklama?.trim() || null,
      durum: 'bekliyor',
    })
    .select('id, kullanici_id, tur, baslangic, bitis, gun_sayisi, aciklama, durum, olusturma_tarih')
    .single()
  if (error) throw error

  // İK yetkililerine haber ver — talep KAYDEDİLDİKTEN sonra, akışı BEKLETMEDEN.
  // (await'li hali: bildirim RPC'si timeout olunca kullanıcı "Request timed out"
  // görüyordu ama talep girilmişti — tekrar deneyince çift kayıt riski.)
  ;(async () => {
    const ikler = await ikYetkilileriGetir()
    const aliciIdler = ikler.map(k => Number(k.id)).filter(id => id !== Number(kullaniciId))
    if (aliciIdler.length) {
      const turAd = izinTurBilgi(tur).isim
      await cokluBildirimEkle(aliciIdler, {
        baslik: '🏖️ Yeni izin talebi',
        mesaj: `${turAd} talebi: ${baslangic} → ${bitis} (${gun} iş günü).`,
        tip: 'bilgi',
        link: '/ik-yonetim',
      })
    }
  })().catch(e => console.warn('[izin talep bildirimi]', e?.message))

  return toCamel(data)
}

/** İK kararı: onayla / reddet. Talep sahibine bildirim gönderir.
 *  Çağrı biçimleri: izinKarar(id, { durum, ... }) VEYA izinKarar({ id, durum, ... }). */
export async function izinKarar(id, karar) {
  // IKYonetim tek obje ile çağırıyor — iki imzayı da kabul et
  if (id && typeof id === 'object') { karar = id; id = karar.id }
  const { durum, onaylayanId, kararNotu } = karar || {}
  if (!id) throw new Error('Talep id zorunlu.')
  if (!['onaylandi', 'reddedildi'].includes(durum)) {
    throw new Error("Geçersiz karar — 'onaylandi' veya 'reddedildi' olmalı.")
  }
  const { data, error } = await supabase
    .from('izin_talepleri')
    .update({
      durum,
      onaylayan_id: onaylayanId ? Number(onaylayanId) : null,
      onay_tarihi: new Date().toISOString(),
      karar_notu: kararNotu?.trim() || null,
    })
    .eq('id', id)
    .select('id, kullanici_id, tur, baslangic, bitis, gun_sayisi, durum, karar_notu')
    .single()
  if (error) throw error

  const onay = durum === 'onaylandi'
  const turAd = izinTurBilgi(data.tur).isim
  // Karar kaydedildi — bildirim akışı BEKLETMEZ
  bildirimEkleDb({
    aliciId: Number(data.kullanici_id),
    baslik: onay ? '✅ İzin talebiniz onaylandı' : '❌ İzin talebiniz reddedildi',
    mesaj: `${turAd} (${data.baslangic} → ${data.bitis})${data.karar_notu ? ` — Not: ${data.karar_notu}` : ''}`,
    tip: onay ? 'basari' : 'uyari',
    link: '/izin-bordro',
  }).catch(e => console.warn('[izin karar bildirimi]', e?.message))

  return toCamel(data)
}

/** Personel kendi talebini iptal eder (RLS: yalnız durum='bekliyor' iken). */
export async function izinIptal(id) {
  const { data, error } = await supabase
    .from('izin_talepleri')
    .update({ durum: 'iptal' })
    .eq('id', id)
    .eq('durum', 'bekliyor')
    .select('id, durum')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Talep iptal edilemedi — yalnız bekleyen talepler iptal edilebilir.')
  return toCamel(data)
}
