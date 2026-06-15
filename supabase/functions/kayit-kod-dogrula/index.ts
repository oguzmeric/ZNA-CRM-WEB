// Email tabanli auth — OTP dogrula + sifre belirle + auth.users olustur (veya guncelle)
//
// POST body: { email: string, kod: string, yeniSifre: string, amac: 'kayit' | 'sifre_sifirla' }
//
// Akis:
//  1. Email format + kod format kontrolu
//  2. email_dogrulama_kodlari'nda en son kullanilmamis, expire olmamis kayit bul
//  3. Yanlis kod -> deneme_sayisi++; 5 yanlis -> kilitle
//  4. Dogru kod:
//     - 'kayit': kullanici yoksa kullanicilar + auth.users olustur; varsa guncelle (email_dogrulandi=true, sifre set)
//     - 'sifre_sifirla': mevcut auth.users.password'unu guncelle
//  5. Kod kullanildi=true isaretle
//
// Response: { ok: true, kullaniciId, authId, mesaj } veya { ok: false, hata, kalanDeneme? }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE)

const MAX_DENEME = 5

function emailGecerli(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}
function kodGecerli(s: string): boolean {
  return /^\d{6}$/.test(s)
}

function err(status: number, hata: string, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({ ok: false, hata, ...extra }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const email: string = (body?.email ?? '').toString().trim().toLowerCase()
    const kod: string = (body?.kod ?? '').toString().trim()
    const yeniSifre: string = (body?.yeniSifre ?? '').toString()
    const amac: string = (body?.amac ?? 'kayit').toString()

    if (!emailGecerli(email)) return err(400, 'Geçerli bir e-posta adresi girin.')
    if (!kodGecerli(kod)) return err(400, 'Kod 6 haneli rakamlardan oluşmalı.')
    if (typeof yeniSifre !== 'string' || yeniSifre.length < 8) {
      return err(400, 'Şifre en az 8 karakter olmalı.')
    }
    if (!['kayit', 'sifre_sifirla'].includes(amac)) return err(400, 'Geçersiz amaç.')

    // En son kullanilmamis kayit
    const { data: otpRow, error: otpErr } = await supa
      .from('email_dogrulama_kodlari')
      .select('id, kod, son_kullanma, deneme_sayisi')
      .eq('email', email)
      .eq('amac', amac)
      .eq('kullanildi', false)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (otpErr || !otpRow) {
      return err(404, 'Kod bulunamadı. Lütfen yeni kod isteyin.')
    }

    if (new Date(otpRow.son_kullanma).getTime() < Date.now()) {
      // Expire — kullanildi olarak isaretle
      await supa.from('email_dogrulama_kodlari').update({ kullanildi: true }).eq('id', otpRow.id)
      return err(410, 'Kodun süresi doldu. Yeni kod isteyin.')
    }

    if (otpRow.deneme_sayisi >= MAX_DENEME) {
      await supa.from('email_dogrulama_kodlari').update({ kullanildi: true }).eq('id', otpRow.id)
      return err(429, 'Çok fazla yanlış deneme. Yeni kod isteyin.')
    }

    if (otpRow.kod !== kod) {
      // deneme_sayisi++
      const yeniDeneme = otpRow.deneme_sayisi + 1
      await supa
        .from('email_dogrulama_kodlari')
        .update({ deneme_sayisi: yeniDeneme })
        .eq('id', otpRow.id)
      return err(400, 'Kod hatalı.', { kalanDeneme: MAX_DENEME - yeniDeneme })
    }

    // Kod dogru — kodu hemen tuket
    await supa.from('email_dogrulama_kodlari').update({ kullanildi: true }).eq('id', otpRow.id)

    // Kullaniciyi bul (varsa)
    const { data: mevcut } = await supa
      .from('kullanicilar')
      .select('id, ad, email, auth_id, email_dogrulandi, tip')
      .eq('email', email)
      .maybeSingle()

    let authUserId: string | null = mevcut?.auth_id ?? null

    if (amac === 'kayit') {
      // Auth kaydi yoksa olustur
      if (!authUserId) {
        const { data: authData, error: authErr } = await supa.auth.admin.createUser({
          email,
          password: yeniSifre,
          email_confirm: true,
          user_metadata: { kayit_yontemi: 'email_otp' },
        })
        if (authErr || !authData?.user) {
          return err(502, 'Auth kaydı oluşturulamadı: ' + (authErr?.message ?? 'bilinmeyen'))
        }
        authUserId = authData.user.id
      } else {
        // Varsa sifreyi guncelle
        const { error: updErr } = await supa.auth.admin.updateUserById(authUserId, {
          password: yeniSifre,
          email_confirm: true,
        })
        if (updErr) return err(502, 'Şifre güncellenemedi: ' + updErr.message)
      }

      // kullanicilar tablosunda kayit yoksa olustur, varsa email_dogrulandi=true
      let kullaniciId = mevcut?.id
      if (!mevcut) {
        // Yeni kullanici — varsayilan: musteri portal
        // (Personel davet sistemiyle ayri eklenir, bu akis musteri self-signup)
        const adAday = email.split('@')[0]
        const { data: yeni, error: insertErr } = await supa
          .from('kullanicilar')
          .insert({
            ad: adAday,
            kullanici_adi: adAday,
            email,
            email_dogrulandi: true,
            auth_id: authUserId,
            tip: 'musteri',
            durum: 'cevrimdisi',
          })
          .select('id')
          .single()
        if (insertErr) {
          return err(502, 'Kullanıcı profili oluşturulamadı: ' + insertErr.message)
        }
        kullaniciId = yeni.id
      } else if (!mevcut.email_dogrulandi || mevcut.auth_id !== authUserId) {
        await supa
          .from('kullanicilar')
          .update({ email_dogrulandi: true, auth_id: authUserId })
          .eq('id', mevcut.id)
      }

      return new Response(
        JSON.stringify({
          ok: true,
          kullaniciId,
          authId: authUserId,
          mesaj: 'Kayıt tamamlandı. Şimdi giriş yapabilirsiniz.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // amac === 'sifre_sifirla'
    if (!authUserId) {
      return err(404, 'Kullanıcı bulunamadı.')
    }
    const { error: updErr } = await supa.auth.admin.updateUserById(authUserId, {
      password: yeniSifre,
    })
    if (updErr) return err(502, 'Şifre güncellenemedi: ' + updErr.message)

    return new Response(
      JSON.stringify({ ok: true, mesaj: 'Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[kayit-kod-dogrula] beklenmedik:', e)
    return err(500, (e as Error)?.message ?? 'bilinmeyen hata')
  }
})
