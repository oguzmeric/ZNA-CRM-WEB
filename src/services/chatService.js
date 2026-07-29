import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel } from '../lib/mapper'

// Kullanıcının görebildiği mesajlar. Filtreyi ARTIK RLS koyuyor (mig 240):
// katılımcı olduğum sohbetler + kendi gizleme damgamdan sonrakiler. Grup
// mesajlarında alici_id null olduğu için eski gonderici/alici filtresi
// çalışmıyordu — bu yüzden filtre sunucuya bırakıldı.
export const mesajlariGetir = async (_kullaniciId, limit = 1500) => {
  const { data, error } = await supabase
    .from('mesajlar')
    .select('*')
    .order('tarih', { ascending: false })
    .order('id', { ascending: false })   // aynı saniyede iki mesaj → kararlı sıra
    .limit(limit)
  if (error) { console.error('mesajlariGetir hata:', error.message); return [] }
  return arrayToCamel(data).reverse()
}

// Sohbet listem (birebir + grup), katılımcı id'leriyle birlikte — tek turda
export const sohbetleriGetir = async () => {
  const { data, error } = await supabase.rpc('sohbetlerim')
  if (error) { console.error('sohbetleriGetir hata:', error.message); return [] }
  return arrayToCamel(data)
}

// Birebir sohbeti aç/bul (yoksa oluşturur). Gizleme damgasına DOKUNMAZ (mig 243).
export const birebirSohbetAc = async (digerId) => {
  const { data, error } = await supabase.rpc('birebir_sohbet_ac', { p_diger_id: Number(digerId) })
  if (error) { console.error('birebirSohbetAc hata:', error.message); return { __error: error.message } }
  return { sohbetId: data }
}

export const grupSohbetAc = async (ad, katilimciIdler) => {
  const { data, error } = await supabase.rpc('grup_sohbet_ac', {
    p_ad: ad,
    p_katilimci_idler: (katilimciIdler || []).map(Number),
  })
  if (error) { console.error('grupSohbetAc hata:', error.message); return { __error: error.message } }
  return { sohbetId: data }
}

export const grubaKisiEkle = async (sohbetId, kullaniciId) => {
  const { error } = await supabase.rpc('sohbete_katilimci_ekle', {
    p_sohbet_id: Number(sohbetId), p_kullanici_id: Number(kullaniciId),
  })
  if (error) { console.error('grubaKisiEkle hata:', error.message); return { __error: error.message } }
  return { ok: true }
}

export const gruptanAyril = async (sohbetId) => {
  const { error } = await supabase.rpc('sohbetten_ayril', { p_sohbet_id: Number(sohbetId) })
  if (error) { console.error('gruptanAyril hata:', error.message); return { __error: error.message } }
  return { ok: true }
}

export const grupAdiDegistir = async (sohbetId, ad) => {
  const { error } = await supabase.from('sohbetler').update({ ad }).eq('id', sohbetId)
  if (error) { console.error('grupAdiDegistir hata:', error.message); return { __error: error.message } }
  return { ok: true }
}

// Mesaj gönder. Birebirde alici_id de yazılır (✓✓ okundu bilgisi oradan gelir),
// grupta alıcı yoktur — hedef sohbet_id'dir.
export const mesajGonder = async (gondericId, aliciId, icerik, sohbetId) => {
  const { data, error } = await supabase
    .from('mesajlar')
    .insert({
      gonderici_id: gondericId,
      alici_id: aliciId ?? null,
      sohbet_id: sohbetId ?? null,
      icerik,
    })
    .select()
    .single()
  if (error) {
    console.error('mesajGonder hata:', error.message)
    return { __error: error.message }
  }
  return toCamel(data)
}

// ── Silme (mig 240-243) ────────────────────────────────────────────────────
// Kural (kullanıcı, 29.07): "kendi mesajını herkes siler". RLS de aynı:
// gonderici_id = kendisi VEYA admin. Başkasının mesajı silinemez.
export const mesajSil = async (id) => {
  const { error } = await supabase.from('mesajlar').delete().eq('id', id)
  if (error) { console.error('mesajSil hata:', error.message); return { __error: error.message } }
  return { ok: true }
}

// "Sohbeti sil" — KARŞI TARAFI SİLMEZ. Katılımcı satırına gizleme damgası
// basılır; o ana kadarki mesajlar yalnız BİZDEN gizlenir (RLS uyguluyor).
// Yeni mesaj gelince sohbet listeye geri döner, eski mesajlar gizli kalır.
export const sohbetiGizle = async (sohbetId) => {
  const { error } = await supabase.rpc('sohbeti_gizle', { p_sohbet_id: Number(sohbetId) })
  if (error) { console.error('sohbetiGizle hata:', error.message); return { __error: error.message } }
  return { ok: true }
}

// Grup okuma damgası — grupta satır başına `okundu` tutulamaz (N katılımcı)
export const sohbetOkunduIsaretle = async (sohbetId) => {
  const { error } = await supabase.rpc('sohbet_okundu_isaretle', { p_sohbet_id: Number(sohbetId) })
  if (error) console.error('sohbetOkunduIsaretle hata:', error.message)
}

// Belirli bir kişiden gelen ve henüz okunmamış mesajları okundu olarak işaretle
export const konusmayiOkunduYap = async (kullaniciId, kisiId) => {
  const { error } = await supabase
    .from('mesajlar')
    .update({ okundu: true })
    .eq('alici_id', kullaniciId)
    .eq('gonderici_id', kisiId)
    .eq('okundu', false)
  if (error) console.error('konusmayiOkunduYap hata:', error.message)
}
