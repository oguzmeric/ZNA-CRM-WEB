// CRM'den Google Calendar'da bir etkinliği sil.
//
// POST body: { etkinlikId: number }  — harici_etkinlikler.id
//
// Akış:
//  1. harici_etkinlikler kaydını oku → baglanti_id, harici_id, kullanici_id
//  2. Bağlantıyı + token'ı çek, scope kontrol et
//  3. Google API DELETE /calendars/primary/events/{harici_id}?sendUpdates=all
//  4. harici_etkinlikler satırına silindi=true yaz (soft-delete)
//
// Response: { ok: true } veya { ok: false, hata: '...' }

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

const supa = createClient(SUPABASE_URL, SERVICE_ROLE)

async function tokenTazele(baglanti: any): Promise<string> {
  const expiry = new Date(baglanti.token_expiry).getTime()
  if (expiry - 60_000 > Date.now()) return baglanti.access_token
  if (!baglanti.refresh_token) {
    throw new Error('Access token süresi doldu ve refresh_token yok — yeniden bağlanma gerekiyor')
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: baglanti.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error('Refresh token başarısız: ' + JSON.stringify(data))
  }
  const yeniExpiry = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString()
  await supa
    .from('kullanici_takvim_baglantilari')
    .update({ access_token: data.access_token, token_expiry: yeniExpiry })
    .eq('id', baglanti.id)
  return data.access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { etkinlikId } = (await req.json()) ?? {}
    if (!etkinlikId) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'etkinlikId zorunlu' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. Etkinliği çek
    const { data: etkinlik, error: etkErr } = await supa
      .from('harici_etkinlikler')
      .select('id, baglanti_id, kullanici_id, harici_id, takvim_id, baslik, silindi')
      .eq('id', etkinlikId)
      .maybeSingle()

    if (etkErr || !etkinlik) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'Etkinlik bulunamadı' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (etkinlik.silindi) {
      return new Response(
        JSON.stringify({ ok: true, mesaj: 'Etkinlik zaten silinmiş' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Bağlantıyı çek
    const { data: baglanti, error: baglantiErr } = await supa
      .from('kullanici_takvim_baglantilari')
      .select('id, kullanici_id, saglayici, hesap_email, access_token, refresh_token, token_expiry, scope, aktif')
      .eq('id', etkinlik.baglanti_id)
      .maybeSingle()

    if (baglantiErr || !baglanti) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'Etkinliğin bağlı olduğu hesap bulunamadı' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!baglanti.aktif) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'Bağlantı aktif değil' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Scope kontrolü — events scope'u yoksa silme yapılamaz
    if (!baglanti.scope || !baglanti.scope.includes('calendar.events')) {
      return new Response(
        JSON.stringify({
          ok: false,
          hata: 'Bu Google bağlantısı sadece okuma izinli. Silme için Takvim Bağlantıları sayfasından bağlantıyı yenileyin.',
          scopeYok: true,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3. Access token tazele
    const accessToken = await tokenTazele(baglanti)

    // 4. Google Calendar API'ye DELETE
    const takvimId = etkinlik.takvim_id || 'primary'
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(takvimId)}/events/${encodeURIComponent(etkinlik.harici_id)}`)
    url.searchParams.set('sendUpdates', 'all')          // davetlilere iptal bildirimi
    url.searchParams.set('sendNotifications', 'true')   // eski API uyumu

    const gRes = await fetch(url.toString(), {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    // Google 204 No Content döner başarıda. 410 = zaten silinmiş (idempotent).
    if (gRes.status !== 204 && gRes.status !== 410 && gRes.status !== 404) {
      let detay: any = null
      try { detay = await gRes.json() } catch {}
      return new Response(
        JSON.stringify({
          ok: false,
          hata: 'Google API hatası: ' + (detay?.error?.message ?? `HTTP ${gRes.status}`),
          detay,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 5. DB'de soft-delete
    const { error: updErr } = await supa
      .from('harici_etkinlikler')
      .update({ silindi: true })
      .eq('id', etkinlik.id)

    if (updErr) {
      // Google'dan silindi ama DB güncellenmedi — kritik değil, bir sonraki sync düzeltir
      console.warn('[etkinlik sil DB]', updErr.message)
    }

    return new Response(
      JSON.stringify({ ok: true, mesaj: 'Etkinlik silindi', baslik: etkinlik.baslik }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, hata: (e as Error)?.message ?? 'bilinmeyen' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
