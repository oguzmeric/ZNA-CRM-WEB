// Musteri B2B portal davet — frontend service.
// Edge function'lari cagiran helper'lar.

import { supabase } from '../lib/supabase'

async function ftnHataMesaj(error) {
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
 * Admin: musteriye portal davet maili gonder.
 * @param {object} args
 * @param {number} args.musteriId
 * @param {string} args.email
 * @param {string} [args.ad]
 */
export async function davetGonder({ musteriId, email, ad }) {
  const { data, error } = await supabase.functions.invoke('musteri-davet-gonder', {
    body: { musteri_id: musteriId, email: email.trim().toLowerCase(), ad: ad?.trim() || null },
  })
  if (error) throw new Error(await ftnHataMesaj(error))
  if (!data?.ok) throw new Error(data?.hata ?? 'Davet gönderilemedi.')
  return data
}

/**
 * Public: davet token'ini dogrula — email + musteri firma adi doner.
 */
export async function davetDogrula(token) {
  const { data, error } = await supabase.functions.invoke('musteri-davet-kabul', {
    body: { action: 'dogrula', token },
  })
  if (error) throw new Error(await ftnHataMesaj(error))
  if (!data?.ok) throw new Error(data?.hata ?? 'Davet doğrulanamadı.')
  return data
}

/**
 * Public: daveti kabul et — sifre belirle, hesap olustur.
 */
export async function davetKabul({ token, sifre }) {
  const { data, error } = await supabase.functions.invoke('musteri-davet-kabul', {
    body: { action: 'kabul', token, sifre },
  })
  if (error) throw new Error(await ftnHataMesaj(error))
  if (!data?.ok) throw new Error(data?.hata ?? 'Hesap oluşturulamadı.')
  return data
}
