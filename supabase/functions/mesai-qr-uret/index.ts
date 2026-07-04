// mesai-qr-uret — Oğuz için mevcut ofisin HMAC-imzalı QR payload'ını üretir.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hmacKisa, payloadUret } from '../_shared/mesai_hmac.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return jsonYanit({ ok: false, hata: 'yetkisiz' }, 401)

    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const usr = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: authRes } = await usr.auth.getUser()
    if (!authRes?.user) return jsonYanit({ ok: false, hata: 'yetkisiz' }, 401)

    const { data: kul } = await svc
      .from('kullanicilar').select('ad').eq('auth_id', authRes.user.id).maybeSingle()
    if (!kul || !/\b(oğuz|oguz)\b/i.test(kul.ad ?? '')) {
      return jsonYanit({ ok: false, hata: 'sadece_oguz' }, 403)
    }

    const { data: ofis } = await svc
      .from('ofis_konumu').select('id').limit(1).single()
    const secret = Deno.env.get('MESAI_QR_SECRET') ?? ''
    if (!secret) return jsonYanit({ ok: false, hata: 'secret_yok' }, 500)

    const hmac16 = await hmacKisa(`v1|${ofis.id}`, secret)
    const payload = payloadUret(ofis.id, hmac16)

    return jsonYanit({ ok: true, payload })
  } catch (e) {
    return jsonYanit({ ok: false, hata: String((e as any)?.message ?? e) }, 500)
  }
})

function jsonYanit(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
