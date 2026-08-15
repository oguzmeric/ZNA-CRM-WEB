// Mesai kaydı düzeltme — yönetici işlemleri (mig 291).
//
// ⚠️ `mesai_kayitlari` tablosunda INSERT/UPDATE/DELETE RLS politikası YOK ve
// bilerek eklenmedi. Yazma yolunun TAMAMI SECURITY DEFINER RPC'lerden geçer:
// yetki kapısı (ik_yetkili), sebep zorunluluğu ve denetim satırı fonksiyonun
// içinde — istemci hiçbirini atlayamaz. Buradan doğrudan .insert()/.update()
// çağırmayın, RLS reddeder.
//
// ⚠️ SAAT DİLİMİ: form değerleri 'YYYY-MM-DDTHH:mm' (yerel, TarihSaatSecici
// sözleşmesi). Bunu new Date(...) ile çevirmek TARAYICININ saat dilimine
// bağlar — yurtdışından veya TZ'i şaşmış bir makineden girilen saat kayar.
// Türkiye 2016'dan beri sabit UTC+3 (yaz saati yok), o yüzden damgayı AÇIKÇA
// +03:00 yazıyoruz. Okurken de Europe/Istanbul'a çeviriyoruz.

import { supabase } from '../lib/supabase'

const TR_OFFSET = '+03:00'

/**
 * 'YYYY-MM-DDTHH:mm' (yerel form değeri) → tam ISO damgalı string.
 *
 * ⚠️ Zaten saat dilimi damgası taşıyan bir değer OLDUĞU GİBİ geçer. Sebep:
 * form dakika hassasiyetinde çalışır, DB kaydı ise saniye taşır (QR ile yazılan
 * giriş 08:28:34 olabilir). Yönetici yalnızca notu düzeltip kaydettiğinde
 * saatin saniyesi sıfırlanmamalı — yoksa dokunulmayan bir alan yüzünden süre
 * 1 dakika kayar. Modal, değişmemiş alanlar için ham DB damgasını gönderir.
 */
export const formdanIso = (v) => {
  if (!v) return null
  if (/([+-]\d{2}:?\d{2}|Z)$/.test(v)) return v      // dokunulmamış DB damgası
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(v)
  return m ? `${m[1]}T${m[2]}:${m[3]}:00${TR_OFFSET}` : null
}

/** DB timestamptz → 'YYYY-MM-DDTHH:mm' (İstanbul saatiyle, forma konacak) */
export const isodanForm = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  // sv-SE locale'i 'YYYY-MM-DD HH:mm:ss' verir — ISO'ya en yakın yerelleştirme.
  return d.toLocaleString('sv-SE', { timeZone: 'Europe/Istanbul' }).replace(' ', 'T').slice(0, 16)
}

// RPC hataları PostgreSQL mesajını taşır; fonksiyonlar zaten Türkçe ve anlamlı
// mesaj fırlatıyor ("Çıkış zamanı girişten önce olamaz." gibi). Ham kodu değil
// mesajı gösteriyoruz; beklenmedik hatada genel metne düşüyoruz.
const hataMetni = (error, varsayilan) => {
  const m = error?.message || ''
  if (!m) return varsayilan
  if (/permission denied|not allowed/i.test(m)) return 'Bu işlem için yetkiniz yok.'
  return m
}

export async function mesaiKaydiEkle({ kullaniciId, giris, cikis, tip, not, sebep }) {
  const { data, error } = await supabase.rpc('mesai_kaydi_ekle', {
    p_kullanici_id: Number(kullaniciId),
    p_giris: formdanIso(giris),
    p_cikis: formdanIso(cikis),
    p_tip: tip || 'normal',
    p_not: not || null,
    p_sebep: sebep,
  })
  if (error) throw new Error(hataMetni(error, 'Mesai kaydı eklenemedi.'))
  return data
}

export async function mesaiKaydiDuzelt({ id, giris, cikis, tip, not, sebep }) {
  const { error } = await supabase.rpc('mesai_kaydi_duzelt', {
    p_id: id,
    p_giris: formdanIso(giris),
    p_cikis: formdanIso(cikis),
    p_tip: tip || 'normal',
    p_not: not || null,
    p_sebep: sebep,
  })
  if (error) throw new Error(hataMetni(error, 'Mesai kaydı güncellenemedi.'))
}

export async function mesaiKaydiSil({ id, sebep }) {
  const { error } = await supabase.rpc('mesai_kaydi_sil', { p_id: id, p_sebep: sebep })
  if (error) throw new Error(hataMetni(error, 'Mesai kaydı silinemedi.'))
}

/**
 * Verilen mesai kayıtları için düzeltme geçmişi.
 * Rapor satırında "elle düzeltildi" rozeti göstermek ve geçmişi açmak için.
 * mesaiIdler boşsa sorgu HİÇ atılmaz (boş .in() PostgREST'te tüm tabloyu döner).
 */
export async function mesaiDuzeltmeleriGetir(mesaiIdler = []) {
  if (!mesaiIdler.length) return []
  const { data, error } = await supabase
    .from('mesai_duzeltmeleri')
    .select('id, mesai_id, kullanici_id, islem, eski, yeni, sebep, yapan_ad, olusturma_tarihi')
    .in('mesai_id', mesaiIdler)
    .order('olusturma_tarihi', { ascending: false })
    .limit(500)
  if (error) { console.warn('[mesaiDuzeltmeleriGetir]', error.message); return [] }
  return data || []
}

/** Bir dönemdeki tüm düzeltmeler (silinenler dahil) — denetim listesi için. */
export async function mesaiDuzeltmeGecmisi({ baslangic, bitis, kullaniciId } = {}) {
  let q = supabase
    .from('mesai_duzeltmeleri')
    .select('id, mesai_id, kullanici_id, islem, eski, yeni, sebep, yapan_ad, olusturma_tarihi')
    .order('olusturma_tarihi', { ascending: false })
    .limit(300)
  if (baslangic) q = q.gte('olusturma_tarihi', `${baslangic}T00:00:00`)
  if (bitis) q = q.lte('olusturma_tarihi', `${bitis}T23:59:59`)
  if (kullaniciId) q = q.eq('kullanici_id', kullaniciId)
  const { data, error } = await q
  if (error) { console.warn('[mesaiDuzeltmeGecmisi]', error.message); return [] }
  return data || []
}
