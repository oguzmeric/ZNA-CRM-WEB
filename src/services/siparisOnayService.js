// Sipariş onay sistemi — frontend service.

import { supabase } from '../lib/supabase'
import { toCamel } from '../lib/mapper'

const BUCKET = 'siparis-imzalari'

/**
 * Onay bekleyen siparişler — yetkili sayfasında listelenir.
 */
export async function bekleyenSiparisleriGetir() {
  const { data, error } = await supabase
    .from('teklifler')
    .select('*')
    .eq('onay_durumu', 'kabul')
    .filter('siparis_onayi->>durum', 'eq', 'bekliyor')
    .order('tarih', { ascending: false })
  if (error) throw error
  return (data ?? []).map(toCamel)
}

/**
 * Onaylananlar — raporlama için
 */
export async function onaylananSiparisleriGetir(baslangic, bitis) {
  let q = supabase
    .from('teklifler')
    .select('*')
    .filter('siparis_onayi->>durum', 'eq', 'onayli')
    .order('siparis_onayi->>onay_tarihi', { ascending: false })
  if (baslangic) q = q.filter('siparis_onayi->>onay_tarihi', 'gte', baslangic)
  if (bitis) q = q.filter('siparis_onayi->>onay_tarihi', 'lte', bitis)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(toCamel)
}

/**
 * Reddedilenler
 */
export async function reddedilenSiparisleriGetir() {
  const { data, error } = await supabase
    .from('teklifler')
    .select('*')
    .filter('siparis_onayi->>durum', 'eq', 'reddedildi')
    .order('siparis_onayi->>onay_tarihi', { ascending: false })
  if (error) throw error
  return (data ?? []).map(toCamel)
}

/**
 * İmza dosyasını Supabase Storage'a yükle, public URL döner.
 */
export async function imzaYukle(file, teklifId) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const yol = `teklif-${teklifId}/imza-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(yol, file, {
    contentType: file.type || 'image/png',
    upsert: true,
  })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(yol)
  return publicUrl
}

/**
 * Siparişi onayla — imza url'i ile birlikte.
 */
export async function siparisOnayla(teklifId, { onaylayanId, onaylayanAd, imzaUrl }) {
  const onay = {
    durum: 'onayli',
    onaylayan_id: onaylayanId,
    onaylayan_ad: onaylayanAd,
    onay_tarihi: new Date().toISOString(),
    imza_url: imzaUrl,
  }
  const { error } = await supabase
    .from('teklifler')
    .update({ siparis_onayi: onay })
    .eq('id', teklifId)
  if (error) throw error
  return onay
}

/**
 * Siparişi reddet — neden zorunlu.
 */
export async function siparisReddet(teklifId, { onaylayanId, onaylayanAd, redNedeni }) {
  const onay = {
    durum: 'reddedildi',
    onaylayan_id: onaylayanId,
    onaylayan_ad: onaylayanAd,
    onay_tarihi: new Date().toISOString(),
    red_nedeni: redNedeni,
  }
  const { error } = await supabase
    .from('teklifler')
    .update({ siparis_onayi: onay })
    .eq('id', teklifId)
  if (error) throw error
  return onay
}

/**
 * Raporlama özeti — bu ay/dönem onaylı toplam, bekleyen, reddedilen.
 */
export async function siparisOnayRaporu(baslangic, bitis) {
  const [bekleyen, onaylanan, reddedilen] = await Promise.all([
    bekleyenSiparisleriGetir(),
    onaylananSiparisleriGetir(baslangic, bitis),
    reddedilenSiparisleriGetir(),
  ])
  const toplam = (liste) => liste.reduce((s, t) => s + Number(t.genelToplam || 0), 0)
  return {
    bekleyen_sayisi: bekleyen.length,
    bekleyen_toplam: toplam(bekleyen),
    onayli_sayisi: onaylanan.length,
    onayli_toplam: toplam(onaylanan),
    red_sayisi: reddedilen.length,
    red_toplam: toplam(reddedilen),
    onaylananlar: onaylanan,
    bekleyenler: bekleyen,
    reddedilenler: reddedilen,
  }
}
