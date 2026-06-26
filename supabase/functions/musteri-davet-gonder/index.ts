// B2B musteri portal davet maili gonder.
//
// Yetkili admin (ZNA personeli) cagirir:
//   POST { musteri_id, email, ad? }
//
// Akis:
//  1. Caller auth kontrolu — sadece ZNA personeli davet gonderebilir
//  2. Musteri var mi?
//  3. Bu email icin zaten gecerli (kullanilmamis, expire olmamis) davet var mi -> yeniden kullan
//  4. Yoksa: 32 char random token uret, musteri_davetleri'ne yaz
//  5. Resend ile davet maili gonder (link: https://talep.znateknoloji.com/davet/<token>)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = 'ZNA Destek <noreply@znateknoloji.com.tr>'
const PORTAL_BASE = Deno.env.get('PORTAL_BASE_URL') ?? 'https://talep.znateknoloji.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE)

function emailGecerli(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function err(status: number, hata: string) {
  return new Response(
    JSON.stringify({ ok: false, hata }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

// Crypto-secure random 32 char hex
function tokenUret(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function davetEmailGovde(opts: {
  ad: string
  firma: string
  link: string
  davetEdenAd: string
}): { html: string; text: string; subject: string } {
  const subject = `ZNA CRM Müşteri Portal Davetiyesi`
  const text = `Merhaba ${opts.ad || ''}

${opts.davetEdenAd} sizi ${opts.firma} adına ZNA CRM müşteri portalına davet etti.

Aşağıdaki linke tıklayıp şifrenizi belirleyerek hesabınızı aktive edin:

${opts.link}

Bu davet 7 gün boyunca geçerlidir.

Portal üzerinden:
  • Servis taleplerini açabilir ve takip edebilirsiniz
  • Tekliflerinizi görebilirsiniz
  • Paylaşılan belgelere erişebilirsiniz

— ZNA Destek
znateknoloji.com`

  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F4F6F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F4F6F8;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#fff;border-radius:16px;box-shadow:0 4px 12px rgba(15,27,46,0.08);overflow:hidden;">
        <!-- Header -->
        <tr><td align="center" style="padding:28px 32px 22px;border-bottom:1px solid #DEE3EC;">
          <img src="${PORTAL_BASE}/logo.jpeg" alt="ZNA Teknoloji" width="150" style="display:block;height:auto;border:0;outline:none;text-decoration:none;" />
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0F1B2E;letter-spacing:-0.02em;">Müşteri Portalına Davet Edildiniz</h1>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3B4960;">
            Merhaba${opts.ad ? ' <strong>' + opts.ad + '</strong>' : ''},
          </p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#3B4960;">
            <strong>${opts.davetEdenAd}</strong>, sizi <strong>${opts.firma}</strong> adına ZNA CRM müşteri portalına davet etti.
            Aşağıdaki butona tıklayarak şifrenizi belirleyin ve hesabınızı hemen kullanmaya başlayın.
          </p>

          <!-- CTA -->
          <div style="text-align:center;margin:28px 0;">
            <a href="${opts.link}" style="display:inline-block;background:linear-gradient(135deg,#1E5AA8,#4A82C8);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;box-shadow:0 10px 24px -8px rgba(30,90,168,0.45);">
              Hesabımı Aktive Et
            </a>
          </div>

          <p style="margin:0 0 8px;font-size:12.5px;line-height:1.55;color:#6B7A93;">
            Buton çalışmazsa şu bağlantıyı kopyalayın:
          </p>
          <p style="margin:0 0 20px;font-size:12px;line-height:1.5;color:#1E5AA8;word-break:break-all;">
            ${opts.link}
          </p>

          <div style="border-top:1px solid #DEE3EC;padding-top:18px;margin-top:8px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#3B4960;">Portal ile neler yapabilirsiniz?</p>
            <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;color:#3B4960;">
              <li>Servis taleplerini açın ve takip edin</li>
              <li>Teklif ve faturalarınızı görüntüleyin</li>
              <li>Paylaşılan belgelere kolayca erişin</li>
            </ul>
          </div>

          <p style="margin:20px 0 0;font-size:12px;color:#98A3B6;">
            ⏱️ Bu davet <strong style="color:#6B7A93;">7 gün</strong> boyunca geçerlidir.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#F4F6F8;border-top:1px solid #DEE3EC;">
          <p style="margin:0 0 4px;font-size:12px;color:#6B7A93;">
            Bu davet size yanlışlıkla geldiyse görmezden gelebilirsiniz.
          </p>
          <p style="margin:0;font-size:11px;color:#98A3B6;">
            © ZNA Teknoloji · <a href="https://znateknoloji.com" style="color:#1E5AA8;text-decoration:none;">znateknoloji.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  return { html, text, subject }
}

async function resendGonder(toEmail: string, subject: string, html: string, text: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: [toEmail], subject, html, text }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Resend hata (${res.status}): ${JSON.stringify(data)}`)
  return data
}

// Caller'in ZNA personeli oldugunu dogrula (auth header'dan)
async function callerProfil(req: Request): Promise<{ id: number; ad: string; tip: string } | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  const supaCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await supaCaller.auth.getUser()
  if (!user) return null
  const { data: profil } = await supa
    .from('kullanicilar')
    .select('id, ad, tip')
    .eq('auth_id', user.id)
    .maybeSingle()
  return profil ?? null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Yetki: sadece ZNA personeli
    const caller = await callerProfil(req)
    if (!caller) return err(401, 'Oturum gerekli.')
    if (caller.tip !== 'zna') return err(403, 'Davet gönderme yetkiniz yok.')

    const body = await req.json()
    const musteri_id = Number(body?.musteri_id)
    const email: string = (body?.email ?? '').toString().trim().toLowerCase()
    const ad: string = (body?.ad ?? '').toString().trim()

    if (!musteri_id) return err(400, 'musteri_id gerekli.')
    if (!emailGecerli(email)) return err(400, 'Geçerli bir e-posta adresi girin.')

    // Musteri var mi?
    const { data: musteri, error: mErr } = await supa
      .from('musteriler')
      .select('id, firma')
      .eq('id', musteri_id)
      .maybeSingle()
    if (mErr || !musteri) return err(404, 'Müşteri bulunamadı.')

    // Bu email zaten dogrulanmis kullanici mi? (cift kayit engeli)
    const { data: mevcutKullanici } = await supa
      .from('kullanicilar')
      .select('id, email_dogrulandi')
      .eq('email', email)
      .maybeSingle()
    if (mevcutKullanici?.email_dogrulandi) {
      return err(409, 'Bu e-posta ile kayıtlı bir hesap zaten var. Müşteri "Şifremi unuttum" ile giriş yapabilir.')
    }

    // Mevcut gecerli davet var mi -> yeniden kullan (re-send sayilir)
    const { data: mevcutDavet } = await supa
      .from('musteri_davetleri')
      .select('id, token, son_kullanma')
      .eq('email', email)
      .eq('musteri_id', musteri_id)
      .eq('kullanildi', false)
      .gte('son_kullanma', new Date().toISOString())
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    let token: string
    let davetId: number

    if (mevcutDavet) {
      token = mevcutDavet.token
      davetId = mevcutDavet.id
    } else {
      token = tokenUret()
      const { data: yeniDavet, error: insertErr } = await supa
        .from('musteri_davetleri')
        .insert({
          token,
          email,
          musteri_id,
          ad: ad || null,
          davet_eden_id: caller.id,
        })
        .select('id')
        .single()
      if (insertErr || !yeniDavet) {
        console.error('[musteri-davet-gonder] insert:', insertErr?.message)
        return err(500, 'Davet kaydı oluşturulamadı.')
      }
      davetId = yeniDavet.id
    }

    const link = `${PORTAL_BASE}/davet/${token}`
    const { html, text, subject } = davetEmailGovde({
      ad,
      firma: musteri.firma ?? '',
      link,
      davetEdenAd: caller.ad ?? 'ZNA Destek',
    })

    try {
      await resendGonder(email, subject, html, text)
    } catch (e) {
      console.error('[musteri-davet-gonder] Resend:', (e as Error).message)
      return err(502, 'E-posta gönderilemedi. Birkaç dakika sonra tekrar deneyin.')
    }

    return new Response(
      JSON.stringify({
        ok: true,
        davet_id: davetId,
        mesaj: `Davet ${email} adresine gönderildi.`,
        link, // dev/test icin
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[musteri-davet-gonder] beklenmedik:', e)
    return err(500, (e as Error)?.message ?? 'bilinmeyen hata')
  }
})
