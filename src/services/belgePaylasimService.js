// Musteriye belge (teklif veya servis raporu) tokenli link ile gondermek icin.
// Edge function 'belge-paylas' cagirir, secilen kanala gore mail ve/veya SMS gonderir.

import { supabase } from '../lib/supabase'

async function hataMesajCevir(error) {
  let mesaj = error?.message ?? 'İşlem başarısız.'
  try {
    const ctx = error?.context
    if (ctx && typeof ctx.text === 'function') {
      const text = await ctx.text()
      if (text) {
        try {
          const body = JSON.parse(text)
          if (body?.hata) mesaj = body.hata
        } catch {
          mesaj = text.slice(0, 300)
        }
      }
    }
  } catch {}
  return mesaj
}

/**
 * Tokenli paylasim linki uret + secilen kanala (mail / sms / her_ikisi) gonder.
 *
 * @param {object} args
 * @param {'teklif'|'servis_raporu'} args.belge_tipi
 * @param {number} args.belge_id
 * @param {'mail'|'sms'|'her_ikisi'} args.kanal
 * @param {string} [args.email]      - mail veya her_ikisi ise zorunlu
 * @param {string} [args.gsm]        - sms veya her_ikisi ise zorunlu
 * @param {number} [args.sure_gun=30]
 * @param {string} [args.ozel_mesaj] - opsiyonel ek not (mail govdesinde gosterilir)
 * @returns {Promise<{ok:true, token:string, link:string, son_kullanma:string, mail_durumu:string|null, sms_durumu:string|null, kismi:boolean}>}
 */
export async function belgePaylas(args) {
  const { data, error } = await supabase.functions.invoke('belge-paylas', {
    body: args,
  })
  if (error) throw new Error(await hataMesajCevir(error))
  if (!data?.ok) throw new Error(data?.hata ?? 'Paylaşım başarısız.')
  return data
}

/**
 * Bir belge icin daha onceki paylasim gecmisini getir (personel kendi olusturduklarini gorebilir).
 * @param {'teklif'|'servis_raporu'} belge_tipi
 * @param {number} belge_id
 */
export async function paylasimGecmisi(belge_tipi, belge_id) {
  const { data, error } = await supabase
    .from('musteri_paylasim_linkleri')
    .select('id, token, gonderim_kanali, gonderildigi_email, gonderildigi_gsm, mail_durumu, sms_durumu, olusturma_tarih, son_kullanma, acilma_sayisi, son_acilma, iptal_edildi')
    .eq('belge_tipi', belge_tipi)
    .eq('belge_id', belge_id)
    .order('id', { ascending: false })
  if (error) throw error
  return data ?? []
}
