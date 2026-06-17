// Admin bir kullaniciyi onayladiginda, kullaniciya "hesabin onaylandi" maili gonderir.
//
// POST body: { kullaniciId: number }
//
// Akis:
//  1. Authorization header'dan caller'i dogrula (anon JWT)
//  2. Caller admin (tip='zna') olmali
//  3. Hedef kullaniciyi bul; onay_durum='onaylandi' ve email varsa Resend ile mail at
//
// Response: { ok: true, gonderildi: boolean } veya { ok: false, hata: '...' }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM          = 'ZNA Destek <noreply@znateknoloji.com.tr>'
const GIRIS_URL     = 'https://talep.znateknoloji.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supaAdmin = createClient(SUPABASE_URL, SERVICE_ROLE)

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function resendGonder(toEmail: string, subject: string, html: string, text: string) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY tanimli degil.')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: [toEmail], subject, html, text }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Resend (${res.status}): ${JSON.stringify(data).slice(0, 200)}`)
  return data
}

function onayMaili(ad: string): { subject: string; html: string; text: string } {
  const isim = ad || 'Merhaba'
  const subject = 'Hesabınız onaylandı — ZNA CRM'
  const text =
    `Merhaba ${isim},\n\n` +
    `ZNA CRM hesabınız yönetici tarafından onaylandı. Artık e-posta adresiniz ve şifrenizle giriş yapabilirsiniz.\n\n` +
    `Giriş: ${GIRIS_URL}\n\n` +
    `İyi çalışmalar,\nZNA Teknoloji`
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2937">` +
    `<h2 style="color:#0f1b2e;margin:0 0 12px">Hesabınız onaylandı ✅</h2>` +
    `<p>Merhaba <strong>${isim}</strong>,</p>` +
    `<p>ZNA CRM hesabınız yönetici tarafından <strong>onaylandı</strong>. Artık e-posta adresiniz ve şifrenizle giriş yapabilirsiniz.</p>` +
    `<p style="margin:24px 0"><a href="${GIRIS_URL}" style="background:#1e5aa8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;display:inline-block">Giriş Yap</a></p>` +
    `<p style="color:#6b7280;font-size:13px">Buton çalışmazsa: <a href="${GIRIS_URL}">${GIRIS_URL}</a></p>` +
    `<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>` +
    `<p style="color:#9ca3af;font-size:12px">ZNA Teknoloji · Servis & Saha Yönetim Platformu</p>` +
    `</div>`
  return { subject, html, text }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 1. Caller dogrula
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(401, { ok: false, hata: 'Yetkisiz — token yok' })

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: callerAuth, error: callerAuthErr } = await callerClient.auth.getUser()
    if (callerAuthErr || !callerAuth?.user) return json(401, { ok: false, hata: 'Yetkisiz — gecersiz token' })

    // 2. Caller admin mi? (tip='zna')
    const { data: callerProfil } = await supaAdmin
      .from('kullanicilar')
      .select('id, tip, durum')
      .eq('auth_id', callerAuth.user.id)
      .maybeSingle()
    if (!callerProfil || callerProfil.tip !== 'zna' || callerProfil.durum === 'pasif') {
      return json(403, { ok: false, hata: 'Bu islem icin admin yetkisi gerekli' })
    }

    // 3. Hedef kullanici
    const { kullaniciId } = (await req.json()) ?? {}
    if (!kullaniciId) return json(400, { ok: false, hata: 'kullaniciId zorunlu' })

    const { data: hedef, error: hedefErr } = await supaAdmin
      .from('kullanicilar')
      .select('id, ad, email, onay_durum')
      .eq('id', kullaniciId)
      .maybeSingle()
    if (hedefErr || !hedef) return json(404, { ok: false, hata: 'Hedef kullanici bulunamadi' })

    // Sadece onaylanmis ve email'i olan kullaniciya gonder
    if (hedef.onay_durum !== 'onaylandi') return json(200, { ok: true, gonderildi: false, sebep: 'onay_durum != onaylandi' })
    if (!hedef.email) return json(200, { ok: true, gonderildi: false, sebep: 'email yok' })

    const { subject, html, text } = onayMaili(hedef.ad)
    await resendGonder(hedef.email, subject, html, text)
    console.info(`[onay-bildir] ${hedef.email} bilgilendirildi`)

    return json(200, { ok: true, gonderildi: true })
  } catch (e) {
    return json(500, { ok: false, hata: (e as Error)?.message ?? 'bilinmeyen' })
  }
})
