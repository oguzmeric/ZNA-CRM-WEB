// Google OAuth callback handler.
// Frontend, callback sayfasında bu fonksiyonu çağırır → biz code'u
// access_token + refresh_token'a çeviririz ve DB'ye kaydederiz.
//
// POST body: { code, redirectUri, kullaniciId }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code, redirectUri, kullaniciId } = await req.json()

    if (!code || !redirectUri || !kullaniciId) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'code, redirectUri ve kullaniciId zorunlu' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. code → token exchange
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const tokenData = await tokenResponse.json()
    if (!tokenResponse.ok || !tokenData.access_token) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'Google token exchange başarısız', detay: tokenData }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const accessToken: string = tokenData.access_token
    const refreshToken: string | undefined = tokenData.refresh_token
    const expiresIn: number = tokenData.expires_in ?? 3600
    const scope: string = tokenData.scope ?? ''
    const tokenExpiry = new Date(Date.now() + expiresIn * 1000).toISOString()

    // 2. Hangi hesap için bağlandık? userinfo endpoint'ten email çek
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const userinfo = await userinfoRes.json()
    const hesapEmail: string = userinfo.email ?? 'bilinmiyor'

    // 3. Supabase'e kaydet (upsert: aynı kullanıcı + email + saglayici varsa güncelle)
    const supa = createClient(SUPABASE_URL, SERVICE_ROLE)

    const { data: existing } = await supa
      .from('kullanici_takvim_baglantilari')
      .select('id, refresh_token')
      .eq('kullanici_id', kullaniciId)
      .eq('saglayici', 'google')
      .eq('hesap_email', hesapEmail)
      .maybeSingle()

    // Refresh token sadece ilk consent'te döner. Eğer yok ama daha önce kaydedildiyse onu koru.
    const effectiveRefreshToken = refreshToken ?? existing?.refresh_token ?? null

    const upsertData = {
      kullanici_id: kullaniciId,
      saglayici: 'google',
      hesap_email: hesapEmail,
      access_token: accessToken,
      refresh_token: effectiveRefreshToken,
      token_expiry: tokenExpiry,
      scope,
      aktif: true,
      son_sync_hatasi: null,
    }

    let baglantiId: number | null = null
    if (existing) {
      const { data, error } = await supa
        .from('kullanici_takvim_baglantilari')
        .update(upsertData)
        .eq('id', existing.id)
        .select('id')
        .single()
      if (error) {
        return new Response(
          JSON.stringify({ ok: false, hata: 'DB update fail: ' + error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      baglantiId = data.id
    } else {
      const { data, error } = await supa
        .from('kullanici_takvim_baglantilari')
        .insert(upsertData)
        .select('id')
        .single()
      if (error) {
        return new Response(
          JSON.stringify({ ok: false, hata: 'DB insert fail: ' + error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      baglantiId = data.id
    }

    return new Response(
      JSON.stringify({ ok: true, baglantiId, hesapEmail }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, hata: (e as Error)?.message ?? 'bilinmeyen' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
