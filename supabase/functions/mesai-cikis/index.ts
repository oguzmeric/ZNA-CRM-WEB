// mesai-cikis — açık mesai kaydını kapatır.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const body = await req.json().catch(() => ({}))
    const lat = typeof body.lat === 'number' ? body.lat : null
    const lng = typeof body.lng === 'number' ? body.lng : null

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
      .from('kullanicilar').select('id').eq('auth_id', authRes.user.id).maybeSingle()
    if (!kul) return jsonYanit({ ok: false, hata: 'kullanici_yok' }, 403)

    const { data: acik } = await svc
      .from('mesai_kayitlari').select('id')
      .eq('kullanici_id', kul.id).is('cikis_zamani', null)
      .order('giris_zamani', { ascending: false }).limit(1).maybeSingle()
    if (!acik) return jsonYanit({ ok: false, hata: 'acik_kayit_yok' }, 400)

    const { data: guncel, error } = await svc.from('mesai_kayitlari').update({
      cikis_zamani: new Date().toISOString(),
      cikis_lat: lat, cikis_lng: lng,
    }).eq('id', acik.id).select('sure_dakika').single()
    if (error) return jsonYanit({ ok: false, hata: error.message }, 500)

    return jsonYanit({ ok: true, sure_dakika: guncel.sure_dakika })
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
