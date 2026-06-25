// Sadece debug — auth check + hizli echo, Claude cagrisi YOK.
// Eger bu calisirsa zeyna'da timeout/CPU sorunu var demektir.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const t0 = Date.now()
  try {
    const auth = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: auth } },
    })
    const { data: ures } = await userClient.auth.getUser()
    const t1 = Date.now()
    if (!ures?.user) {
      return new Response(JSON.stringify({ ok: false, hata: 'Oturum yok', auth_ms: t1 - t0 }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const { data: krow } = await supa.from('kullanicilar').select('id, ad, tip').eq('auth_id', ures.user.id).maybeSingle()
    const t2 = Date.now()
    if (!krow) {
      return new Response(JSON.stringify({ ok: false, hata: 'Kullanici yok', auth_id: ures.user.id, db_ms: t2 - t1 }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const body = await req.json().catch(() => ({}))
    return new Response(
      JSON.stringify({
        ok: true,
        yanit: `[DEBUG ECHO] Merhaba ${krow.ad}! Mesajini aldim: "${body?.mesaj ?? ''}". Function calisiyor (auth:${t1-t0}ms, db:${t2-t1}ms).`,
        konusma_id: 0,
        token_input: 0,
        token_output: 0,
        debug: { auth_ms: t1 - t0, db_ms: t2 - t1, kullanici: krow },
      }),
      { headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, hata: (e as Error).message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
