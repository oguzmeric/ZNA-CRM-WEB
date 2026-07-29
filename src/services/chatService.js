import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel } from '../lib/mapper'

// Kullanıcının dahil olduğu tüm mesajlar (gönderen veya alıcı)
export const mesajlariGetir = async (kullaniciId) => {
  const { data, error } = await supabase
    .from('mesajlar')
    .select('*')
    .or(`gonderici_id.eq.${kullaniciId},alici_id.eq.${kullaniciId}`)
    .order('tarih', { ascending: true })
  if (error) { console.error('mesajlariGetir hata:', error.message); return [] }
  return arrayToCamel(data)
}

export const mesajGonder = async (gondericId, aliciId, icerik) => {
  const { data, error } = await supabase
    .from('mesajlar')
    .insert({ gonderici_id: gondericId, alici_id: aliciId, icerik })
    .select()
    .single()
  if (error) {
    console.error('mesajGonder hata:', error.message)
    return { __error: error.message }
  }
  return toCamel(data)
}

// ── Silme (mig 240-242) ────────────────────────────────────────────────────
// Kural (kullanıcı, 29.07): "kendi mesajını herkes siler". RLS de aynı:
// gonderici_id = kendisi VEYA admin. Başkasının mesajı silinemez.
export const mesajSil = async (id) => {
  const { error } = await supabase.from('mesajlar').delete().eq('id', id)
  if (error) { console.error('mesajSil hata:', error.message); return { __error: error.message } }
  return { ok: true }
}

// "Sohbeti sil" — KARŞI TARAFI SİLMEZ. Katılımcı satırına gizleme damgası
// basılır; o ana kadarki mesajlar yalnız BİZDEN gizlenir (RLS bunu uyguluyor).
// Aynı kişiye tekrar yazınca damga kalkar ve sohbet geri döner — kullanıcının
// "silsin, sonra tekrar başlatabilsin" isteği bu şekilde karşılanıyor.
export const sohbetiSil = async (kullaniciId, kisiId) => {
  // Bu iki kişinin birebir sohbetini bul (RPC yoksa oluşturur; silinen sohbeti
  // yeniden açmak da aynı RPC ile olduğu için tutarlı)
  const { data: sohbetId, error: rpcErr } = await supabase
    .rpc('birebir_sohbet_ac', { p_diger_id: Number(kisiId) })
  if (rpcErr) { console.error('sohbetiSil (rpc) hata:', rpcErr.message); return { __error: rpcErr.message } }

  const { error } = await supabase
    .from('sohbet_katilimcilar')
    .update({ gizlendi_tarih: new Date().toISOString() })
    .eq('sohbet_id', sohbetId)
    .eq('kullanici_id', kullaniciId)
  if (error) { console.error('sohbetiSil hata:', error.message); return { __error: error.message } }
  return { ok: true, sohbetId }
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
