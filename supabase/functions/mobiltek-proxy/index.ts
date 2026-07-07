// Mobiltek VTS API proxy — client_secret ve token yönetimini burada tutar,
// mobile/web'e sadeleştirilmiş uçlar sunar. Kredensiyeller Supabase secrets'ta:
//   MOBILTEK_CLIENT_ID, MOBILTEK_CLIENT_SECRET, MOBILTEK_USERNAME, MOBILTEK_PASSWORD
//
// Kullanım: POST /functions/v1/mobiltek-proxy
//   body: { yol: 'vehicles' | 'cameras/:id' | 'live-map' | ..., params?: {...} }
//
// Auth: JWT gerekli — sadece giriş yapmış kullanıcılar. Yetki kontrolü DB'den:
// kullanicilar.moduller içinde 'arac_takip' olmalı (ya da rol=admin).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const MOBILTEK_BASE = 'https://api.mobiltek.com.tr/v1'
const MOBILTEK_BASE_V2 = 'https://api.mobiltek.com.tr/v2'
const MOBILTEK_TOKEN_URL = 'https://api.mobiltek.com.tr/auth/realms/mobiltek/protocol/openid-connect/token'

const CLIENT_ID     = Deno.env.get('MOBILTEK_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('MOBILTEK_CLIENT_SECRET') ?? ''
const USERNAME      = Deno.env.get('MOBILTEK_USERNAME') ?? ''
const PASSWORD      = Deno.env.get('MOBILTEK_PASSWORD') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Basit rate limit: kullanici başına 60 istek/dk
const rateMap = new Map<number, { sayac: number, resetAt: number }>()
const rateLimit = (kullaniciId: number): boolean => {
  const now = Date.now()
  const kayit = rateMap.get(kullaniciId)
  if (!kayit || kayit.resetAt < now) {
    rateMap.set(kullaniciId, { sayac: 1, resetAt: now + 60_000 })
    return true
  }
  if (kayit.sayac >= 60) return false
  kayit.sayac++
  return true
}

// Token cache — DB'den okur, süresi dolmadan yeniler
async function getirToken(sb: any): Promise<string> {
  // Kredensiyel yoksa mock modda çalış
  if (!CLIENT_ID || !USERNAME) {
    throw new Error('MOBILTEK_CREDENTIALS_MISSING')
  }

  const { data: cache } = await sb
    .from('mobiltek_token_cache')
    .select('access_token, expires_at')
    .eq('id', true)
    .maybeSingle()

  const simdi = Date.now()
  if (cache?.access_token && new Date(cache.expires_at).getTime() > simdi + 30_000) {
    return cache.access_token
  }

  // Yeni token al
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    username: USERNAME,
    password: PASSWORD,
  })
  const res = await fetch(MOBILTEK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Mobiltek token hata ${res.status}: ${t.slice(0, 200)}`)
  }
  const j = await res.json()
  const expiresIn = Number(j.expires_in ?? 300)
  const yeniExpiresAt = new Date(simdi + expiresIn * 1000).toISOString()

  await sb.from('mobiltek_token_cache').upsert({
    id: true,
    access_token: j.access_token,
    expires_at: yeniExpiresAt,
    guncelleme_tarih: new Date().toISOString(),
  })

  return j.access_token
}

// Yol → Mobiltek endpoint eşleme
function yolToEndpoint(yol: string, params: Record<string, any> = {}): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.append(k, String(v))
  }
  const query = p.toString() ? `?${p.toString()}` : ''

  if (yol === 'vehicles') return `${MOBILTEK_BASE}/vehicles/${query}`
  if (yol === 'cameras') return `${MOBILTEK_BASE}/cameras${query}`
  // Canlı kamera stream (v2): cameras-live/{aracId} → v2/cameras/{aracId}?channel=N
  if (yol.startsWith('cameras-live/')) {
    const aracId = yol.split('/')[1]
    return `${MOBILTEK_BASE_V2}/cameras/${aracId}${query}`
  }
  // Canlı kamera durdur (v2): cameras-live-stop/{aracId} → v2/cameras/{aracId}/live/stop?channel=N
  if (yol.startsWith('cameras-live-stop/')) {
    const aracId = yol.split('/')[1]
    return `${MOBILTEK_BASE_V2}/cameras/${aracId}/live/stop${query}`
  }
  if (yol.startsWith('cameras/')) return `${MOBILTEK_BASE}/${yol}${query}`
  if (yol.startsWith('vehicles/')) return `${MOBILTEK_BASE}/${yol}${query}`
  if (yol === 'live-map') return `${MOBILTEK_BASE}/mapi/live-tracking-map-v2${query}`
  if (yol.startsWith('live-map/')) {
    const id = yol.split('/')[1]
    return `${MOBILTEK_BASE}/mapi/live-tracking-map-v1/${id}/${query}`
  }
  if (yol === 'geocoding') return `${MOBILTEK_BASE}/locations/geocoding${query}`
  if (yol === 'drivers') return `${MOBILTEK_BASE}/drivers${query}`
  throw new Error(`Bilinmeyen yol: ${yol}`)
}

// Mock veri — kredensiyel yoksa geliştirme için
function mockCevap(yol: string): any {
  if (yol === 'vehicles') {
    return {
      code: 0,
      description: 'MOCK — kredensiyel bekleniyor',
      vehicles: [
        { id: 1001, plateNo: '34 ABC 123', vin: 'MOCK1', deviceNumber: 'DEV-001', ignition: '1', gpsSpeed: '42', lat: '41.0082', lng: '28.9784', gpsTime: new Date().toISOString(), direction: '90' },
        { id: 1002, plateNo: '34 XYZ 456', vin: 'MOCK2', deviceNumber: 'DEV-002', ignition: '0', gpsSpeed: '0', lat: '41.0400', lng: '29.0100', gpsTime: new Date().toISOString(), direction: '0' },
        { id: 1003, plateNo: '34 DEF 789', vin: 'MOCK3', deviceNumber: 'DEV-003', ignition: '1', gpsSpeed: '68', lat: '40.9862', lng: '29.0301', gpsTime: new Date().toISOString(), direction: '180' },
      ],
    }
  }
  if (yol.startsWith('cameras/')) {
    return {
      code: 0,
      description: 'MOCK — kredensiyel bekleniyor',
      cameras: [
        { plateNo: '34 ABC 123', vin: 'MOCK1', lat: '41.0082', lng: '28.9784', gpsTime: new Date().toISOString(), gpsSpeed: '42', direction: '90', satellite: '8', posType: '1', urlCamera: 'https://example.com/mock-stream' },
      ],
    }
  }
  return { code: 0, description: 'MOCK', mock: true }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const t0 = Date.now()

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  // Auth kontrolü — JWT header'dan kullanıcı
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const { data: userData } = await sb.auth.getUser(token)
  const authUserId = userData?.user?.id
  if (!authUserId) {
    return new Response(JSON.stringify({ ok: false, hata: 'yetkisiz' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Kullanıcı profili ve yetki kontrolü
  const { data: profil } = await sb
    .from('kullanicilar')
    .select('id, rol, moduller')
    .eq('auth_id', authUserId)
    .maybeSingle()

  if (!profil) {
    return new Response(JSON.stringify({ ok: false, hata: 'profil yok' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const yetkili = profil.rol === 'admin' || (profil.moduller || []).includes('arac_takip')
  if (!yetkili) {
    return new Response(JSON.stringify({ ok: false, hata: 'arac_takip modülü yok' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Rate limit
  if (!rateLimit(profil.id)) {
    return new Response(JSON.stringify({ ok: false, hata: 'dakikada 60 istek limiti' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let yol = ''
  let params: any = {}
  try {
    const body = await req.json()
    yol = String(body.yol || '')
    params = body.params || {}
  } catch {
    return new Response(JSON.stringify({ ok: false, hata: 'geçersiz body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    let veri: any
    let httpKod = 200
    let mockMod = false

    try {
      const access = await getirToken(sb)
      const url = yolToEndpoint(yol, params)
      // POST kullanılan yollar (canlı kamera durdurma)
      const httpMethod = yol.startsWith('cameras-live-stop/') ? 'POST' : 'GET'
      const res = await fetch(url, {
        method: httpMethod,
        headers: { Authorization: `Bearer ${access}` },
      })
      httpKod = res.status
      if (!res.ok) {
        const t = await res.text()
        console.error(`[mobiltek-proxy] ${yol} → ${url} → ${res.status}:`, t.slice(0, 500))
        throw new Error(`Mobiltek ${res.status}: ${t.slice(0, 300)}`)
      }
      const rawText = await res.text()
      console.log(`[mobiltek-proxy] ${yol} → ${url} → 200, body preview:`, rawText.slice(0, 300))
      try {
        veri = JSON.parse(rawText)
      } catch {
        veri = { raw: rawText }
      }
    } catch (e: any) {
      if (e.message === 'MOBILTEK_CREDENTIALS_MISSING') {
        veri = mockCevap(yol)
        mockMod = true
      } else {
        throw e
      }
    }

    // Log
    await sb.from('mobiltek_istek_log').insert({
      kullanici_id: profil.id,
      endpoint: yol,
      parametre: params,
      http_kod: httpKod,
      sure_ms: Date.now() - t0,
    })

    return new Response(JSON.stringify({ ok: true, mock: mockMod, veri }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    await sb.from('mobiltek_istek_log').insert({
      kullanici_id: profil.id,
      endpoint: yol,
      parametre: params,
      hata: String(e.message).slice(0, 400),
      sure_ms: Date.now() - t0,
    })
    return new Response(JSON.stringify({ ok: false, hata: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
