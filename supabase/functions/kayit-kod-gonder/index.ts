// Email tabanli auth — 6 haneli OTP kodu uretir, DB'ye yazar, Resend ile email gonderir.
//
// POST body: { email: string, amac: 'kayit' | 'sifre_sifirla' }
//
// Akis:
//  1. Email format kontrolu
//  2. Mevcut kullanici var mi (amac'a gore farkli check)
//     - 'kayit': kullanicilar tablosunda email zaten dogrulanmis ise hata (zaten uye)
//     - 'sifre_sifirla': kullanicilar tablosunda email yoksa hata
//  3. Son 60 saniyede ayni email+amac icin kod gondertilmis mi (rate limit)
//  4. 6 haneli random kod uret, DB'ye yaz
//  5. Resend API ile email gonder
//  6. Eski kullanilmamis kodlari iptal et (sadece sonuncu gecerli)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = 'ZNA Destek <noreply@znateknoloji.com.tr>'   // znateknoloji.com.tr Resend dogrulamasi tamamlandi

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE)

function emailGecerli(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function kodUret(): string {
  // 100000-999999 arasi (her zaman 6 haneli)
  return String(100_000 + Math.floor(Math.random() * 900_000))
}

function emailGovdesi(kod: string, amac: string): { html: string; text: string; subject: string } {
  const baslik =
    amac === 'sifre_sifirla' ? 'Şifre Sıfırlama Kodu' : 'ZNA CRM Doğrulama Kodu'
  const aciklama =
    amac === 'sifre_sifirla'
      ? 'Şifrenizi sıfırlamak için aşağıdaki doğrulama kodunu kullanın.'
      : 'ZNA CRM hesabınızı oluşturmak için aşağıdaki doğrulama kodunu kullanın.'

  const text = `${baslik}

${aciklama}

Kodunuz: ${kod}

Bu kod 10 dakika boyunca geçerlidir. Sizden istenmediyse bu mesajı görmezden gelin.

— ZNA Destek
znateknoloji.com`

  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F4F6F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F4F6F8;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;background:#fff;border-radius:16px;box-shadow:0 4px 12px rgba(15,27,46,0.08);overflow:hidden;">
        <!-- Header -->
        <tr><td align="center" style="padding:28px 32px 22px;border-bottom:1px solid #DEE3EC;">
          <img src="https://talep.znateknoloji.com/logo.jpeg" alt="ZNA Teknoloji" width="150" style="display:block;height:auto;border:0;outline:none;text-decoration:none;" />
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0F1B2E;letter-spacing:-0.02em;">${baslik}</h1>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.55;color:#3B4960;">${aciklama}</p>

          <!-- OTP Kod kutusu -->
          <div style="background:#E8EFF8;border:1.5px solid #1E5AA8;border-radius:12px;padding:24px;text-align:center;margin-bottom:20px;">
            <div style="font-size:11px;font-weight:700;color:#1E5AA8;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">Doğrulama Kodunuz</div>
            <div style="font-family:'SF Mono','Monaco','Consolas',monospace;font-size:36px;font-weight:800;color:#0F1B2E;letter-spacing:0.2em;">${kod}</div>
          </div>

          <p style="margin:0 0 8px;font-size:13px;line-height:1.55;color:#6B7A93;">
            ⏱️ Bu kod <strong style="color:#3B4960;">10 dakika</strong> boyunca geçerlidir.
          </p>
          <p style="margin:0;font-size:13px;line-height:1.55;color:#6B7A93;">
            🔒 Bu kodu sizden başka kimseyle paylaşmayın.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#F4F6F8;border-top:1px solid #DEE3EC;">
          <p style="margin:0 0 4px;font-size:12px;color:#6B7A93;">
            Bu mesaj sizden istenmediyse görmezden gelin.
          </p>
          <p style="margin:0;font-size:11px;color:#98A3B6;">
            © ZNA Teknoloji · <a href="https://znateknoloji.com" style="color:#1E5AA8;text-decoration:none;">znateknoloji.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  return { html, text, subject: `${kod} — ${baslik}` }
}

async function resendGonder(toEmail: string, subject: string, html: string, text: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [toEmail],
      subject,
      html,
      text,
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Resend hata (${res.status}): ${JSON.stringify(data)}`)
  }
  return data
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const email: string = (body?.email ?? '').toString().trim().toLowerCase()
    const amac: string = (body?.amac ?? 'kayit').toString()

    if (!emailGecerli(email)) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'Geçerli bir e-posta adresi girin.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    if (!['kayit', 'sifre_sifirla'].includes(amac)) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'Geçersiz amaç.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Kullanici var mi kontrol et
    const { data: mevcut } = await supa
      .from('kullanicilar')
      .select('id, email, email_dogrulandi, auth_id')
      .eq('email', email)
      .maybeSingle()

    if (amac === 'kayit') {
      if (mevcut?.email_dogrulandi) {
        return new Response(
          JSON.stringify({ ok: false, hata: 'Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    } else if (amac === 'sifre_sifirla') {
      if (!mevcut?.email_dogrulandi) {
        // Kullanici yok ya da henuz dogrulanmamis — generic mesajla cevapla (email enumeration koruma)
        // Yine de 200 dondurelim — kotuye kullanim zorlasmasin
        return new Response(
          JSON.stringify({ ok: true, mesaj: 'Eğer bu e-posta kayıtlıysa, sıfırlama kodu gönderildi.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    // Rate limit — son 60sn icinde ayni email+amac icin kod gondertilmis mi
    const altmissnOnce = new Date(Date.now() - 60_000).toISOString()
    const { data: sonKod } = await supa
      .from('email_dogrulama_kodlari')
      .select('id, olusturma_tarih')
      .eq('email', email)
      .eq('amac', amac)
      .gte('olusturma_tarih', altmissnOnce)
      .maybeSingle()

    if (sonKod) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'Lütfen 1 dakika bekleyip tekrar deneyin.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Eski kullanilmamis kodlari iptal et (sadece son gecerli olsun)
    await supa
      .from('email_dogrulama_kodlari')
      .update({ kullanildi: true })
      .eq('email', email)
      .eq('amac', amac)
      .eq('kullanildi', false)

    // Yeni kod uret + DB'ye yaz
    const kod = kodUret()
    const { error: insertErr } = await supa
      .from('email_dogrulama_kodlari')
      .insert({
        email,
        kod,
        amac,
        ip_adresi: req.headers.get('x-forwarded-for') || null,
      })

    if (insertErr) {
      console.error('[kayit-kod-gonder] DB insert hata:', insertErr.message)
      return new Response(
        JSON.stringify({ ok: false, hata: 'Sistem hatası, tekrar deneyin.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Email gonder
    const { html, text, subject } = emailGovdesi(kod, amac)
    try {
      await resendGonder(email, subject, html, text)
    } catch (e) {
      console.error('[kayit-kod-gonder] Resend hata:', (e as Error).message)
      // Email atilamadi ama kod DB'de var — kullaniciya generic mesaj donelim
      return new Response(
        JSON.stringify({ ok: false, hata: 'E-posta gönderilemedi. Birkaç dakika sonra tekrar deneyin.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ ok: true, mesaj: `Doğrulama kodu ${email} adresine gönderildi.` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[kayit-kod-gonder] beklenmedik:', e)
    return new Response(
      JSON.stringify({ ok: false, hata: (e as Error)?.message ?? 'bilinmeyen hata' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
