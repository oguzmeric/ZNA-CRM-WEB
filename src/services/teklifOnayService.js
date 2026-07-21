// Teklif Onay servisi — teklifler.teklif_onayi JSONB üzerinden çalışır.
// Akış: hazırlayan onaya gönderir → teklif onay yetkilisi karar verir → sipariş onayına düşer.

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel } from '../lib/mapper'
import { imzaYukle } from './siparisOnayService'  // aynı bucket, aynı fonksiyon
import { bildirimEkleDb } from './bildirimService'
import { smsGonderVeLogla } from './smsLogService'

// TR karakter → ASCII (SMS-friendly)
const trAsciify = (s) => String(s || '')
  .replace(/İ/g, 'I').replace(/ı/g, 'i')
  .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
  .replace(/Ş/g, 'S').replace(/ş/g, 's')
  .replace(/Ç/g, 'C').replace(/ç/g, 'c')
  .replace(/Ö/g, 'O').replace(/ö/g, 'o')
  .replace(/Ü/g, 'U').replace(/ü/g, 'u')

/**
 * Teklif "Yönetici Onayı Bekliyor"a düşünce teklif onay yetkililerine
 * bildirim + SMS. Ön sipariş onay bildirimiyle aynı desen (onSiparisOnayaBildir).
 * Best-effort — hata teklif kaydını bozmaz. Gönderen yetkiliyse kendisine gitmez.
 */
export async function teklifOnayaDustuBildir(teklif, { gonderenAd, gonderenId } = {}) {
  if (!teklif?.id) return
  try {
    const { data: yetkiler, error } = await supabase
      .from('kullanicilar')
      .select('id, ad, cep_telefon')
      .eq('teklif_onay_yetkilisi', true)
      .eq('tip', 'zna')
      .neq('durum', 'pasif')
    if (error) { console.warn('[teklifOnayaDustuBildir] yetkili çekilemedi:', error.message); return }
    if (!yetkiler?.length) { console.warn('[teklifOnayaDustuBildir] teklif_onay_yetkilisi=true kullanıcı yok'); return }

    const teklifNo = teklif.teklifNo || teklif.teklif_no || `#${teklif.id}`
    const firma = teklif.firmaAdi || teklif.firma_adi || 'Müşteri —'
    const kim = gonderenAd || 'Bir personel'

    await Promise.all(yetkiler
      .filter(y => String(y.id) !== String(gonderenId ?? ''))
      .map(async (y) => {
        bildirimEkleDb({
          aliciId: y.id,
          baslik: 'Yeni Teklif — Onay Bekliyor',
          mesaj: `${firma} için "${teklifNo}" teklifi ${kim} tarafından oluşturuldu — Teklif Onayı ekranında onayınızı bekliyor.`,
          tip: 'teklif',
          link: '/teklif-onaylari',
        }).catch(e => console.warn('[bildirim] teklif onay:', e?.message))

        const mesaj = `ZNA CRM: Yeni teklif onay bekliyor.\n${trAsciify(firma)}\nNo: ${teklifNo}\nHazirlayan: ${trAsciify(kim)}\ntalep.znateknoloji.com`
        smsGonderVeLogla({
          gsm: y.cep_telefon,
          mesaj,
          amac: 'teklif_onay_bildirim',
          refTablo: 'teklifler',
          refId: teklif.id,
          aliciKullaniciId: y.id,
          aliciAd: y.ad,
          gonderenKullaniciId: gonderenId ?? null,
        }).catch(e => console.warn('[sms] teklif onay:', e?.message))
      }))
  } catch (e) {
    console.warn('[teklifOnayaDustuBildir] hata:', e?.message)
  }
}

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
    .update({
      teklif_onayi: onay,
      siparis_onayi: siparisOnayi,
      spek_durum: 'yon_onayladi', // spec 10-durum sistemi
    })
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
  // Spec: yönetici teklifi reddederse "Revizyon İstendi"ne düşer
  const { error } = await supabase.from('teklifler').update({
    teklif_onayi: onay,
    spek_durum: 'revizyon_istendi',
  }).eq('id', teklifId)
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
  // Karar geri alındı → yönetici onayı beklemeye döner
  const { error } = await supabase.from('teklifler').update({
    teklif_onayi: onay,
    spek_durum: 'yon_onay_bekliyor',
  }).eq('id', teklifId)
  if (error) throw error
  return { ok: true }
}

export { imzaYukle }
