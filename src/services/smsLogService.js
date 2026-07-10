// SMS gönderim log helper — her denemeyi (başarılı/başarısız) sms_gonderim_log
// tablosuna yazar. Frontend'in edge function'a gönderiği gerçek isteği ve
// dönen cevabı izleyebilmek için tek merkez.

import { supabase } from '../lib/supabase'

/**
 * SMS gönder ve DB'ye logla.
 *
 * @param {object} p
 * @param {string} p.gsm            — Kullanıcının cep telefonu
 * @param {string} p.mesaj          — Gönderilecek mesaj (ASCII/TR)
 * @param {string} [p.amac]         — 'on_siparis_bildirim' | 'siparis_onay_bildirim' | ...
 * @param {string} [p.refTablo]     — Örn 'on_siparisler'
 * @param {number|string} [p.refId] — Kayıt id'si
 * @param {number|string} [p.aliciKullaniciId]
 * @param {string} [p.aliciAd]
 * @param {number|string} [p.gonderenKullaniciId]
 * @returns {Promise<{ok:boolean, jobid?:string, hata?:string}>}
 */
export async function smsGonderVeLogla({
  gsm, mesaj, amac, refTablo, refId,
  aliciKullaniciId, aliciAd, gonderenKullaniciId,
}) {
  // 1) DB'ye başlangıç kaydı — telefonsuzsa 'atlandi'
  const logBaz = {
    gsm: gsm ?? '',
    mesaj: mesaj ?? '',
    amac: amac ?? null,
    ref_tablo: refTablo ?? null,
    ref_id: refId ?? null,
    alici_kullanici_id: aliciKullaniciId ?? null,
    alici_ad: aliciAd ?? null,
    gonderen_kullanici_id: gonderenKullaniciId ?? null,
  }

  if (!gsm) {
    await supabase.from('sms_gonderim_log').insert({
      ...logBaz,
      sonuc: 'atlandi',
      hata_mesaji: 'Telefon numarası yok',
    })
    return { ok: false, hata: 'Telefon numarası yok' }
  }

  // 2) Edge function çağır
  try {
    const { data, error } = await supabase.functions.invoke('sms-gonder', {
      body: { gsm, mesaj },
    })
    if (error) {
      await supabase.from('sms_gonderim_log').insert({
        ...logBaz,
        sonuc: 'hata',
        hata_mesaji: error.message || 'invoke error',
        cevap_ham: JSON.stringify(error).slice(0, 500),
      })
      return { ok: false, hata: error.message }
    }
    if (data?.ok) {
      await supabase.from('sms_gonderim_log').insert({
        ...logBaz,
        sonuc: 'basarili',
        netgsm_jobid: data.jobid ?? null,
        cevap_ham: JSON.stringify(data).slice(0, 500),
      })
      return { ok: true, jobid: data.jobid }
    }
    // ok=false: NetGSM hata döndürdü
    await supabase.from('sms_gonderim_log').insert({
      ...logBaz,
      sonuc: 'hata',
      hata_mesaji: data?.hata || 'bilinmeyen',
      netgsm_code: data?.netgsmCode ?? null,
      cevap_ham: JSON.stringify(data).slice(0, 500),
    })
    return { ok: false, hata: data?.hata || 'bilinmeyen' }
  } catch (e) {
    await supabase.from('sms_gonderim_log').insert({
      ...logBaz,
      sonuc: 'hata',
      hata_mesaji: e?.message || 'exception',
    })
    return { ok: false, hata: e?.message || 'exception' }
  }
}
