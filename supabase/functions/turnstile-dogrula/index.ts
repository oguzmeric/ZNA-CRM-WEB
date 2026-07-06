// Cloudflare Turnstile token doğrulama proxy.
// Frontend'den gelen token'ı Cloudflare API'siyle doğrular.
// TURNSTILE_SECRET env variable'ı Supabase secrets'ta olmalı.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DOGRULA_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { token } = await req.json()
    if (!token) return json({ ok: false, hata: 'token_yok' }, 400)

    const secret = Deno.env.get('TURNSTILE_SECRET')
    if (!secret) return json({ ok: false, hata: 'secret_yok' }, 500)

    // X-Forwarded-For'dan istemci IP'sini al (opsiyonel)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined

    const params = new URLSearchParams()
    params.append('secret', secret)
    params.append('response', String(token))
    if (ip) params.append('remoteip', ip)

    const r = await fetch(DOGRULA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const data = await r.json()

    if (!data?.success) {
      return json({ ok: false, hata: 'dogrulama_basarisiz', kodlar: data?.['error-codes'] ?? [] }, 200)
    }

    return json({ ok: true, hostname: data.hostname, action: data.action })
  } catch (e) {
    return json({ ok: false, hata: String((e as any)?.message ?? e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
