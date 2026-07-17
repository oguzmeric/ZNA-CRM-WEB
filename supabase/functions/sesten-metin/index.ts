// Sesli not → metin (Groq Whisper, ücretsiz katman).
// Client ses dosyasını multipart FormData ile gönderir ('ses' alanı),
// fonksiyon Groq'a iletir, çözülen Türkçe metni döndürür.
// GROQ_API_KEY sunucuda kalır — client'a hiçbir anahtar sızmaz.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? ''
// turbo: ücretsiz katmanda hızlı + Türkçe doğruluğu large-v3'e yakın
const MODEL = 'whisper-large-v3-turbo'
const MAX_BOYUT = 15 * 1024 * 1024 // 15MB (~20 dk opus kaydı)

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    if (!GROQ_API_KEY) return json({ ok: false, hata: 'GROQ_API_KEY yok' }, 500)

    // Yetki: personel JWT şart
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return json({ ok: false, hata: 'yetkisiz' }, 401)
    const usr = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: authRes } = await usr.auth.getUser()
    if (!authRes?.user) return json({ ok: false, hata: 'yetkisiz' }, 401)
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: kisi } = await svc
      .from('kullanicilar').select('id, tip').eq('auth_id', authRes.user.id).maybeSingle()
    if (!kisi || kisi.tip !== 'zna') return json({ ok: false, hata: 'yetkisiz' }, 403)

    const form = await req.formData()
    const ses = form.get('ses')
    if (!(ses instanceof File)) return json({ ok: false, hata: 'ses_dosyasi_gerek' }, 400)
    if (ses.size > MAX_BOYUT) return json({ ok: false, hata: 'dosya_cok_buyuk' }, 400)
    const dil = String(form.get('dil') || 'tr')

    const groqForm = new FormData()
    groqForm.append('file', ses, ses.name || 'kayit.webm')
    groqForm.append('model', MODEL)
    groqForm.append('language', dil)
    groqForm.append('response_format', 'json')
    groqForm.append('temperature', '0')

    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: groqForm,
    })
    if (!r.ok) {
      const detay = await r.text().catch(() => '')
      // 429 = ücretsiz katman limiti — client dostça mesaj göstersin
      if (r.status === 429) return json({ ok: false, hata: 'limit', detay }, 429)
      return json({ ok: false, hata: `groq ${r.status}`, detay: detay.slice(0, 400) }, 502)
    }
    const sonuc = await r.json()
    const metin = String(sonuc?.text ?? '').trim()
    return json({ ok: true, metin })
  } catch (e) {
    return json({ ok: false, hata: (e as Error).message }, 500)
  }
})
