// Ön Sipariş — fiyatsız kalem talebi. Görüşmeden doğar, Sipariş Onayı ekranına düşer.
// Bkz: supabase_migrations/125_on_siparisler.sql

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cached, invalidate } from '../lib/cache'
import { bildirimEkleDb } from './bildirimService'

// SMS-friendly TR → ASCII (smsService ile aynı desen)
const trAsciify = (s) => String(s || '')
  .replace(/İ/g, 'I').replace(/ı/g, 'i')
  .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
  .replace(/Ş/g, 'S').replace(/ş/g, 's')
  .replace(/Ç/g, 'C').replace(/ç/g, 'c')
  .replace(/Ö/g, 'O').replace(/ö/g, 'o')
  .replace(/Ü/g, 'U').replace(/ü/g, 'u')

/**
 * Ön sipariş oluşturulduğunda Sipariş Onayı yetkilerine (kullanicilar.siparis_onay_yetkili=true)
 * hem sistem bildirimi hem SMS gönderir. Best-effort — bir kullanıcı bulunamaz
 * veya SMS başarısız olursa akış bozulmaz.
 *
 * Yetkili listesi DB'de yönetilir (mig 132). Personel değişikliğinde:
 *   update kullanicilar set siparis_onay_yetkili = true/false where id = X;
 */
export async function onSiparisOnayaBildir(onSiparis, { firmaAdi, olusturanAd } = {}) {
  if (!onSiparis?.id) return
  try {
    // 1) DB flag'i true olan tüm yetkilileri çek
    const { data: yetkiler, error } = await supabase
      .from('kullanicilar')
      .select('id, ad, cep_telefon')
      .eq('siparis_onay_yetkili', true)
    if (error) { console.warn('[onSiparisOnayaBildir] yetkili çekilemedi:', error.message); return }
    if (!yetkiler || yetkiler.length === 0) {
      console.warn('[onSiparisOnayaBildir] siparis_onay_yetkili=true kullanıcı yok')
      return
    }

    const osNo = onSiparis.on_siparis_no || onSiparis.onSiparisNo || onSiparis.id
    const firma = firmaAdi || onSiparis.firma_adi || 'Firma —'
    const kim = olusturanAd || 'Bir personel'

    // 2) Bildirim + SMS paralel
    await Promise.all(yetkiler.map(async (y) => {
      // Sistem bildirimi
      bildirimEkleDb({
        aliciId: y.id,
        baslik: 'Yeni Ön Sipariş — Onay Bekliyor',
        mesaj: `${firma} için "${osNo}" ön siparişi oluşturuldu. ${kim} tarafından — Sipariş Onayı ekranında incelenmeyi bekliyor.`,
        tip: 'siparis',
        link: '/siparis-onaylari',
      }).catch(e => console.warn('[bildirim] ön sipariş onay:', e?.message))

      // SMS
      if (y.cep_telefon) {
        const mesaj = `ZNA CRM: Yeni on siparis onay bekliyor.\n${trAsciify(firma)}\nNo: ${osNo}\nEkleyen: ${trAsciify(kim)}\ntalep.znateknoloji.com`
        supabase.functions.invoke('sms-gonder', { body: { gsm: y.cep_telefon, mesaj } })
          .catch(e => console.warn('[sms] ön sipariş onay:', e?.message))
      }
    }))
  } catch (e) {
    console.warn('[onSiparisOnayaBildir] hata:', e?.message)
  }
}

export const ON_SIPARIS_DURUMLARI = [
  { id: 'taslak',           isim: 'Taslak',            renk: '#94a3b8' },
  { id: 'onay_bekliyor',    isim: 'Onay Bekliyor',     renk: '#f59e0b' },
  { id: 'siparise_donustu', isim: 'Siparişe Dönüştü',  renk: '#10b981' },
  { id: 'iptal',            isim: 'İptal',             renk: '#ef4444' },
]

export const ACILIYETLER = [
  { id: 'dusuk',  isim: 'Düşük',  renk: '#94a3b8' },
  { id: 'orta',   isim: 'Orta',   renk: '#3b82f6' },
  { id: 'yuksek', isim: 'Yüksek', renk: '#ef4444' },
]

// ==================== LİSTE ====================
export const onSiparisleriGetir = () => cached('onSiparisler:list', async () => {
  const { data, error } = await supabase
    .from('on_siparisler')
    .select('*')
    .order('olusturma_tarih', { ascending: false })
  if (error) { console.error('onSiparisleriGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
})

// Reddedilen (iptal) ön siparişler — Sipariş Onayı ekranı için
export const iptalEdilenOnSiparisleriGetir = async () => {
  const { data, error } = await supabase
    .from('on_siparisler')
    .select('*')
    .eq('durum', 'iptal')
    .order('guncelleme_tarih', { ascending: false })
  if (error) { console.error('iptalEdilenOnSiparisleriGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

// Bir görüşmeye ait ön siparişler
export const gorusmeninOnSiparisleri = async (gorusmeId) => {
  const { data, error } = await supabase
    .from('on_siparisler')
    .select('*')
    .eq('gorusme_id', gorusmeId)
    .order('olusturma_tarih', { ascending: false })
  if (error) { console.error('gorusmeninOnSiparisleri hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const onSiparisGetir = async (id) => {
  const { data, error } = await supabase
    .from('on_siparisler')
    .select('*')
    .eq('id', id)
    .single()
  if (error) { console.error('onSiparisGetir hata:', error.message); return null }
  return toCamel(data)
}

// ==================== YAZ ====================
export const onSiparisEkle = async (payload) => {
  const { id, onSiparisNo, olusturmaTarih, guncellemeTarih, ...rest } = payload
  const { data, error } = await supabase
    .from('on_siparisler')
    .insert(toSnake(rest))
    .select()
    .single()
  if (error) { console.error('onSiparisEkle hata:', error.message); return null }
  invalidate('onSiparisler:list')
  return toCamel(data)
}

export const onSiparisGuncelle = async (id, payload) => {
  const { id: _id, onSiparisNo, olusturmaTarih, guncellemeTarih, ...rest } = payload
  const { data, error } = await supabase
    .from('on_siparisler')
    .update(toSnake(rest))
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('onSiparisGuncelle hata:', error.message); return null }
  invalidate('onSiparisler:list')
  return toCamel(data)
}

export const onSiparisSil = async (id) => {
  const { error } = await supabase.from('on_siparisler').delete().eq('id', id)
  if (error) { console.error('onSiparisSil hata:', error.message); return false }
  invalidate('onSiparisler:list')
  return true
}

// ==================== KALEMLER ====================
export const kalemleriGetir = async (onSiparisId) => {
  const { data, error } = await supabase
    .from('on_siparis_kalemleri')
    .select('*')
    .eq('on_siparis_id', onSiparisId)
    .order('siralama', { ascending: true })
    .order('id', { ascending: true })
  if (error) { console.error('kalemleriGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const kalemEkle = async (kalem) => {
  const { id, olusturmaTarih, ...rest } = kalem
  const { data, error } = await supabase
    .from('on_siparis_kalemleri')
    .insert(toSnake(rest))
    .select()
    .single()
  if (error) { console.error('kalemEkle hata:', error.message); return null }
  return toCamel(data)
}

export const kalemGuncelle = async (id, kalem) => {
  const { id: _id, onSiparisId, olusturmaTarih, ...rest } = kalem
  const { data, error } = await supabase
    .from('on_siparis_kalemleri')
    .update(toSnake(rest))
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('kalemGuncelle hata:', error.message); return null }
  return toCamel(data)
}

export const kalemSil = async (id) => {
  const { error } = await supabase.from('on_siparis_kalemleri').delete().eq('id', id)
  if (error) { console.error('kalemSil hata:', error.message); return false }
  return true
}

// ==================== TAM KAYDET ====================
// Modal'dan gelen bütün paketi: ön sipariş + kalemler.
export const onSiparisTumunuKaydet = async ({ onSiparis, kalemler, silinecekKalemIdleri = [], firmaAdi, olusturanAd }) => {
  const yeniKayit = !onSiparis.id
  let osKayit = onSiparis.id
    ? await onSiparisGuncelle(onSiparis.id, onSiparis)
    : await onSiparisEkle(onSiparis)
  if (!osKayit) return null

  // Silinecekleri sil
  for (const kalemId of silinecekKalemIdleri) {
    await kalemSil(kalemId)
  }

  // Kalemleri kaydet
  for (const k of kalemler) {
    const payload = { ...k, onSiparisId: osKayit.id }
    if (k.id) await kalemGuncelle(k.id, payload)
    else await kalemEkle(payload)
  }

  // Yeni ön sipariş oluşturulduğunda Sipariş Onayı yetkililerine bildir (best-effort)
  if (yeniKayit && (osKayit.durum || onSiparis.durum) === 'onay_bekliyor') {
    onSiparisOnayaBildir(osKayit, { firmaAdi, olusturanAd })
      .catch(e => console.warn('[onSiparisOnayaBildir]', e?.message))
  }

  return osKayit
}
