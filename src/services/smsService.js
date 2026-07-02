// SMS servisi — NetGSM üzerinden görev bildirimi.
// Backend: supabase edge function 'sms-gonder'.
// Türkçe karakter kullanmıyoruz — NetGSM TR encoding daha stabil, herkes okuyabilir.

import { supabase } from '../lib/supabase'

// Türkçe karakter → ASCII (SMS-friendly).
// NetGSM TR encoding 155 karakter destekliyor ama karışıklık olmasın diye normalize edelim.
function trAsciify(s) {
  return String(s || '')
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u')
}

async function kullaniciTelefonuGetir(kullaniciId) {
  if (!kullaniciId) return null
  const { data, error } = await supabase
    .from('kullanicilar')
    .select('id, ad, cep_telefon')
    .eq('id', kullaniciId)
    .maybeSingle()
  if (error) { console.warn('[smsService] telefon çekilemedi:', error.message); return null }
  return data
}

// Yeni görev atandı — kısa, kurumsal, ASCII.
export async function gorevAtamaSMSGonder({ atananId, gorevBaslik, sonTarih, oncelik }) {
  const kullanici = await kullaniciTelefonuGetir(atananId)
  if (!kullanici?.cep_telefon) {
    return { ok: false, hata: 'Telefon numarasi yok', atlandi: true }
  }
  const baslik = trAsciify(gorevBaslik).slice(0, 60)
  const tarih = sonTarih ? new Date(sonTarih).toLocaleDateString('tr-TR') : ''
  const oncStr = oncelik && oncelik !== 'orta' ? ` [${trAsciify(oncelik).toUpperCase()}]` : ''
  const mesaj = `ZNA CRM: Size yeni gorev atandi${oncStr}.\n"${baslik}"\nSon tarih: ${tarih}\ntalep.znateknoloji.com`
  try {
    const { data, error } = await supabase.functions.invoke('sms-gonder', {
      body: { gsm: kullanici.cep_telefon, mesaj },
    })
    if (error) throw error
    // Flag güncelle — DB'de görevin atama_sms_gonderildi = true olmalı ki tekrar gitmez
    return { ok: true, ...data }
  } catch (e) {
    console.warn('[gorevAtamaSMSGonder] hata:', e?.message)
    return { ok: false, hata: e?.message || 'SMS gönderilemedi' }
  }
}

// Belirli bir görevin atama SMS'ini gönder + flag işaretle.
// Görev id gerekiyor (flag için).
export async function gorevAtamaSMSGonderVeIsaretle({ gorevId, atananId, gorevBaslik, sonTarih, oncelik }) {
  const sonuc = await gorevAtamaSMSGonder({ atananId, gorevBaslik, sonTarih, oncelik })
  if (sonuc.ok && gorevId) {
    try {
      await supabase
        .from('gorevler')
        .update({ atama_sms_gonderildi: true, atama_sms_tarihi: new Date().toISOString() })
        .eq('id', gorevId)
    } catch (e) {
      console.warn('[gorevAtamaSMS flag] hata:', e?.message)
    }
  }
  return sonuc
}
