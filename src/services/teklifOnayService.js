// Teklif Onay servisi — teklifler.teklif_onayi JSONB üzerinden çalışır.
// Akış: hazırlayan onaya gönderir → teklif onay yetkilisi karar verir → sipariş onayına düşer.

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel } from '../lib/mapper'
import { imzaYukle } from './siparisOnayService'  // aynı bucket, aynı fonksiyon

// Bekleyen teklif onayları — Teklifler > Cevap Beklenenler ile aynı liste.
// Teklifler.jsx'te filtre: onay_durumu IN ('takipte', 'revizyon').
// Yönetim henüz karar vermemişse (teklif_onayi null veya durumu 'onayli'/'reddedildi'
// değil) bekleyen sayılır.
export async function bekleyenTeklifOnaylariniGetir() {
  const { data, error } = await supabase
    .from('teklifler')
    .select('*')
    .in('onay_durumu', ['takipte', 'revizyon'])
    .or('teklif_onayi.is.null,teklif_onayi->>durum.not.in.(onayli,reddedildi)')
    .order('id', { ascending: false })
  if (error) { console.error('[bekleyenTeklifOnaylari]', error.message); return [] }
  return arrayToCamel(data)
}

export async function onaylananTeklifOnaylariniGetir() {
  const { data, error } = await supabase
    .from('teklifler')
    .select('*')
    .eq('teklif_onayi->>durum', 'onayli')
    .order('teklif_onayi->>onay_tarih', { ascending: false })
    .limit(200)
  if (error) { console.error('[onaylananTeklifOnaylari]', error.message); return [] }
  return arrayToCamel(data)
}

export async function reddedilenTeklifOnaylariniGetir() {
  const { data, error } = await supabase
    .from('teklifler')
    .select('*')
    .eq('teklif_onayi->>durum', 'reddedildi')
    .order('teklif_onayi->>onay_tarih', { ascending: false })
    .limit(200)
  if (error) { console.error('[reddedilenTeklifOnaylari]', error.message); return [] }
  return arrayToCamel(data)
}

// Hazırlayanın teklifi onaya göndermesi
export async function teklifOnayaGonder(teklifId, gonderen) {
  const onay = {
    durum: 'bekliyor',
    gonderen_id: gonderen?.id ?? null,
    gonderen_ad: gonderen?.ad ?? '',
    gonderme_tarih: new Date().toISOString(),
  }
  const { error } = await supabase.from('teklifler').update({ teklif_onayi: onay }).eq('id', teklifId)
  if (error) throw error
  return { ok: true }
}

// Teklif onay yetkilisi onayla
export async function teklifOnayla(teklifId, kullanici, gerekce, imzaUrl) {
  // Mevcut teklif_onayi'yi çek, birleştir
  const { data: t } = await supabase.from('teklifler').select('teklif_onayi').eq('id', teklifId).single()
  const onay = {
    ...(t?.teklif_onayi || {}),
    durum: 'onayli',
    onaylayan_id: kullanici?.id,
    onaylayan_ad: kullanici?.ad,
    onay_tarih: new Date().toISOString(),
    onay_gerekcesi: gerekce || null,
    onaylayan_imza: imzaUrl || null,
    red_nedeni: null,
  }
  // Aynı anda sipariş onayına da düşürüyoruz — hiyerarşi devamı
  const siparisOnayi = {
    durum: 'bekliyor',
    olusturma_tarih: new Date().toISOString(),
    kaynak: 'teklif_onayi',
  }
  const { error } = await supabase
    .from('teklifler')
    .update({ teklif_onayi: onay, siparis_onayi: siparisOnayi })
    .eq('id', teklifId)
  if (error) throw error
  return { ok: true }
}

export async function teklifReddet(teklifId, kullanici, redNedeni) {
  const { data: t } = await supabase.from('teklifler').select('teklif_onayi').eq('id', teklifId).single()
  const onay = {
    ...(t?.teklif_onayi || {}),
    durum: 'reddedildi',
    onaylayan_id: kullanici?.id,
    onaylayan_ad: kullanici?.ad,
    onay_tarih: new Date().toISOString(),
    red_nedeni: redNedeni || 'Belirtilmedi',
  }
  const { error } = await supabase.from('teklifler').update({ teklif_onayi: onay }).eq('id', teklifId)
  if (error) throw error
  return { ok: true }
}

// Onay/red kararını geri al (onaylayan self veya üst yetkili)
export async function teklifOnayGeriAl(teklifId) {
  const { data: t } = await supabase.from('teklifler').select('teklif_onayi').eq('id', teklifId).single()
  const onay = {
    ...(t?.teklif_onayi || {}),
    durum: 'bekliyor',
    onaylayan_id: null,
    onaylayan_ad: null,
    onay_tarih: null,
    onay_gerekcesi: null,
    onaylayan_imza: null,
    red_nedeni: null,
  }
  const { error } = await supabase.from('teklifler').update({ teklif_onayi: onay }).eq('id', teklifId)
  if (error) throw error
  return { ok: true }
}

export { imzaYukle }
