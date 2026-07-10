// SMS gonderici — NetGSM REST v2 API uzerinden.
//
// POST body: { gsm: string, mesaj: string }
//
// Required secrets:
//   - NETGSM_USER     : NetGSM abone no (ornek '8503090843')
//   - NETGSM_PASS     : NetGSM API sifresi (panel sifresinden farkli)
//   - NETGSM_HEADER   : Onayli baslik (ornek 'ZNATEKNOLOJI')
//
// NetGSM REST v2 endpoint: https://api.netgsm.com.tr/sms/rest/v2/send
// Auth: Basic Auth (username:password)
// Body: { msgheader, encoding, messages: [{ msg, no }] }
// Response: { jobid, code }  — code "00" = basarili
//
// NOT: GSM numarasi 10 haneli olmali ('5XXXXXXXXX'), basinda 0 veya +90 olmamali.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const NETGSM_USER   = Deno.env.get('NETGSM_USER') ?? ''
const NETGSM_PASS   = Deno.env.get('NETGSM_PASS') ?? ''
const NETGSM_HEADER = Deno.env.get('NETGSM_HEADER') ?? 'ZNATEKNOLOJI'
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// SMS pumping / mali suistimal koruması — dakikada max 6, saatte max 40 SMS per user.
// In-memory sliding window (edge fn instance lifecycle ile sınırlı ama etkili).
const smsLog = new Map<string, number[]>()
const DAKIKA_LIMIT = 6
const SAAT_LIMIT   = 40
function rateLimitAsti(userId: string): { ok: boolean; hata?: string } {
  const now = Date.now()
  const arr = (smsLog.get(userId) ?? []).filter(t => now - t < 3600_000)
  const sonDakika = arr.filter(t => now - t < 60_000).length
  if (sonDakika >= DAKIKA_LIMIT) return { ok: false, hata: `Rate limit: dakikada max ${DAKIKA_LIMIT} SMS` }
  if (arr.length >= SAAT_LIMIT)   return { ok: false, hata: `Rate limit: saatte max ${SAAT_LIMIT} SMS` }
  arr.push(now)
  smsLog.set(userId, arr)
  return { ok: true }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// NetGSM "code" -> Turkce hata mesaji
const HATA_MESAJLARI: Record<string, string> = {
  '20': 'Mesaj metni gecersiz veya karakter limiti asildi.',
  '30': 'Kullanici adi/sifre yanlis veya API erisimi kapali.',
  '40': 'Mesaj basligi (gonderici adi) sistemde tanimli degil.',
  '50': 'Iyzico abonelerinden gondertilemez.',
  '60': 'Aboneliginiz iptal edilmis.',
  '70': 'Hatali sorgulama, parametre eksik.',
  '80': 'Gonderim islemi sayisi limiti asildi.',
  '85': 'Cevab gore tanimli kullanima izin yok.',
  '100': 'Sistemsel hata, daha sonra deneyin.',
  '101': 'Beklenmedik hata olustu.',
}

function gsmNormalize(s: string): string | null {
  // Bosluk/tire/parantezleri at, sadece rakam ve + tut
  const cleaned = s.replace(/[^\d+]/g, '')
  // +90'la basliyorsa at
  let num = cleaned.startsWith('+90') ? cleaned.slice(3) : cleaned
  // 0090 ile basliyorsa at
  if (num.startsWith('0090')) num = num.slice(4)
  // 90 ile basliyorsa (10 haneden uzunsa) at
  if (num.length === 12 && num.startsWith('90')) num = num.slice(2)
  // 0 ile basliyorsa at
  if (num.length === 11 && num.startsWith('0')) num = num.slice(1)
  // Artik 10 haneli olmali ve 5 ile baslamali (mobile)
  if (!/^5\d{9}$/.test(num)) return null
  return num
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
    if (!NETGSM_USER || !NETGSM_PASS) {
      return err(500, 'NetGSM secret eksik (NETGSM_USER veya NETGSM_PASS).')
    }

    // ─── AUTH GATE ────────────────────────────────────────────────────
    // Sadece staff (admin/personel) SMS gönderebilir — müşteri hesapları
    // veya anon JWT bloklanır. SMS pumping / mali suistimal koruması.
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    if (!jwt) return err(401, 'Yetkilendirme gerekli.')

    // Service role key ile çağırılabilir (backend-to-backend, örn gorev-gecikme-sms)
    const isServiceRole = SERVICE_ROLE && jwt === SERVICE_ROLE
    let userId: string | null = null

    if (!isServiceRole) {
      // Kullanıcı JWT — gerçek user id + rol doğrulama
      const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
      const { data: authData, error: authErr } = await sb.auth.getUser(jwt)
      if (authErr || !authData?.user) return err(401, 'Geçersiz oturum.')
      userId = authData.user.id
      const { data: profil } = await sb
        .from('kullanicilar')
        .select('rol, hesap_silindi')
        .eq('auth_id', userId)
        .maybeSingle()
      if (!profil || profil.hesap_silindi) return err(403, 'Hesap erişimi yok.')
      if (!['admin', 'personel'].includes(profil.rol)) {
        return err(403, 'Bu işlem için yetkiniz yok.')
      }
      // Rate limit — dakikada 6, saatte 40 SMS/user
      const rl = rateLimitAsti(userId)
      if (!rl.ok) return err(429, rl.hata!)
    }
    // ──────────────────────────────────────────────────────────────────

    const body = await req.json()
    const gsmRaw: string = (body?.gsm ?? '').toString().trim()
    const mesaj:   string = (body?.mesaj ?? '').toString()

    const gsm = gsmNormalize(gsmRaw)
    if (!gsm) {
      return err(400, 'Gecerli bir GSM numarasi girin (ornek: 5XXXXXXXXX).')
    }
    if (mesaj.length < 1 || mesaj.length > 1000) {
      return err(400, 'Mesaj 1-1000 karakter olmali.')
    }

    // Basic Auth header
    const auth = 'Basic ' + btoa(`${NETGSM_USER}:${NETGSM_PASS}`)

    const ngBody = {
      msgheader: NETGSM_HEADER,
      encoding: 'TR',
      messages: [{ msg: mesaj, no: gsm }],
    }

    const ngRes = await fetch('https://api.netgsm.com.tr/sms/rest/v2/send', {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ngBody),
    })

    const ngText = await ngRes.text()
    let ngJson: { code?: string; jobid?: string; description?: string } = {}
    try { ngJson = JSON.parse(ngText) } catch { /* not JSON */ }

    const code = ngJson?.code ?? ''
    const jobid = ngJson?.jobid ?? null

    if (code === '00') {
      return new Response(
        JSON.stringify({ ok: true, jobid, gsm, mesaj: 'SMS gonderildi.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Basarisiz — code'a gore mesaj
    const ngHata = HATA_MESAJLARI[code] ?? ngJson?.description ?? `NetGSM hata kodu: ${code || 'bilinmiyor'}`
    console.error('[sms-gonder] NetGSM hata:', { code, ngText })
    return err(502, ngHata, { netgsmCode: code, raw: ngText.slice(0, 200) })
  } catch (e) {
    console.error('[sms-gonder] beklenmedik:', e)
    return err(500, (e as Error)?.message ?? 'bilinmeyen hata')
  }
})
