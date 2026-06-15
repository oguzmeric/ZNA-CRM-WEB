// Email tabanli auth — frontend service wrapper.
// Edge function'lari cagiran helper fonksiyonlar.

import { supabase } from '../lib/supabase'

// Edge function hatasini Turkce mesaja cevirir (response body parse + fallback)
async function ftnHataMesaj(error) {
  let mesaj = error?.message ?? 'İşlem başarısız.'
  try {
    const ctx = error?.context
    if (ctx && typeof ctx.text === 'function') {
      const text = await ctx.text()
      if (text) {
        try {
          const body = JSON.parse(text)
          if (body?.hata) {
            mesaj = body.hata
            if (body?.kalanDeneme != null) {
              mesaj += ` (${body.kalanDeneme} deneme hakkınız kaldı)`
            }
          }
        } catch {
          mesaj = text.slice(0, 300)
        }
      }
    }
  } catch {}
  return mesaj
}

/**
 * Email'e 6 haneli OTP kodu gonder.
 * @param {string} email
 * @param {'kayit'|'sifre_sifirla'} amac
 * @returns {Promise<{ok: true, mesaj: string}>}
 * @throws {Error} hata olursa
 */
export async function kayitKodGonder(email, amac = 'kayit') {
  const { data, error } = await supabase.functions.invoke('kayit-kod-gonder', {
    body: { email: email.trim().toLowerCase(), amac },
  })
  if (error) throw new Error(await ftnHataMesaj(error))
  if (!data?.ok) throw new Error(data?.hata ?? 'Kod gönderilemedi.')
  return data
}

/**
 * OTP'yi dogrula + sifre belirle (signup tamamla veya sifre sifirla).
 * @param {object} args
 * @param {string} args.email
 * @param {string} args.kod  - 6 haneli
 * @param {string} args.yeniSifre  - en az 8 karakter
 * @param {'kayit'|'sifre_sifirla'} args.amac
 * @returns {Promise<{ok: true, kullaniciId?: number, authId?: string, mesaj: string}>}
 */
export async function kayitKodDogrula({ email, kod, yeniSifre, amac = 'kayit' }) {
  const { data, error } = await supabase.functions.invoke('kayit-kod-dogrula', {
    body: { email: email.trim().toLowerCase(), kod: kod.trim(), yeniSifre, amac },
  })
  if (error) throw new Error(await ftnHataMesaj(error))
  if (!data?.ok) throw new Error(data?.hata ?? 'Doğrulama başarısız.')
  return data
}

/**
 * Dogrulamadan sonra otomatik giris yapmak icin.
 * supabase.auth.signInWithPassword cagiriyor.
 */
export async function emailIleGiris(email, sifre) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: sifre,
  })
  if (error) throw new Error(error.message)
  return data
}
