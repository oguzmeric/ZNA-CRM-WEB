// Proforma fatura talebi → fatura yetkililerine MAİL (Resend).
// Alıcılar SUNUCU tarafında belirlenir (fatura_yetkilisi=true kullanıcılar +
// Abdullah İğde fallback) — client keyfi adrese mail attıramaz.
// Çağıran: faturaTalepService.faturaYetkililerineBildir (personel JWT ile).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM = 'ZNA CRM <noreply@znateknoloji.com.tr>'
const FALLBACK_MUHASEBE = 'abdullahigde@znateknoloji.com'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Yetki: personel JWT şart
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return json({ ok: false, hata: 'yetkisiz' }, 401)
    const usr = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: authRes } = await usr.auth.getUser()
    if (!authRes?.user) return json({ ok: false, hata: 'yetkisiz' }, 401)
    const { data: gonderen } = await svc
      .from('kullanicilar').select('id, ad, tip').eq('auth_id', authRes.user.id).maybeSingle()
    if (!gonderen || gonderen.tip !== 'zna') return json({ ok: false, hata: 'yetkisiz' }, 403)

    const { talepNo, firmaAdi, teklifNo, genelToplam, paraBirimi } = await req.json()
    if (!talepNo) return json({ ok: false, hata: 'talepNo_gerek' }, 400)

    // Alıcılar: fatura yetkilileri (server-side) + muhasebe fallback'i
    const { data: yetkililer } = await svc
      .from('kullanicilar').select('ad, email')
      .eq('tip', 'zna').eq('fatura_yetkilisi', true)
    const adresler = new Set<string>()
    for (const y of yetkililer ?? []) if (y.email) adresler.add(y.email.trim().toLowerCase())
    adresler.add(FALLBACK_MUHASEBE)

    const tutarStr = genelToplam ? `${genelToplam} ${paraBirimi || 'TL'}` : '—'
    const subject = `Proforma fatura talebi — ${firmaAdi || ''} (${talepNo})`
    const text = [
      `Yeni bir proforma fatura talebi oluşturuldu.`,
      ``,
      `Talep No : ${talepNo}`,
      `Müşteri  : ${firmaAdi || '—'}`,
      `Teklif   : ${teklifNo || '—'}`,
      `Tutar    : ${tutarStr}`,
      `Talep Eden: ${gonderen.ad}`,
      ``,
      `Fatura Talepleri ekranı: https://talep.znateknoloji.com/fatura-talepleri`,
    ].join('\n')
    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a">
        <h2 style="color:#1d4ed8;margin:0 0 12px">Proforma Fatura Talebi</h2>
        <p>Yeni bir proforma fatura talebi oluşturuldu.</p>
        <table style="border-collapse:collapse">
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Talep No</td><td><b>${talepNo}</b></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Müşteri</td><td>${firmaAdi || '—'}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Teklif</td><td>${teklifNo || '—'}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Tutar</td><td><b>${tutarStr}</b></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Talep Eden</td><td>${gonderen.ad}</td></tr>
        </table>
        <p style="margin-top:16px">
          <a href="https://talep.znateknoloji.com/fatura-talepleri"
             style="background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
            Fatura Taleplerini Aç
          </a>
        </p>
      </div>`

    if (!RESEND_API_KEY) return json({ ok: false, hata: 'RESEND_API_KEY yok' }, 500)
    const sonuclar: Record<string, string> = {}
    for (const adres of adresler) {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, to: [adres], subject, html, text }),
        })
        sonuclar[adres] = r.ok ? 'ok' : `hata ${r.status}`
      } catch (e) {
        sonuclar[adres] = 'hata: ' + (e as Error).message
      }
    }
    return json({ ok: true, sonuclar })
  } catch (e) {
    return json({ ok: false, hata: (e as Error).message }, 500)
  }
})
