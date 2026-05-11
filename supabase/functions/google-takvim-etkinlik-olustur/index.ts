// CRM'den Google Calendar'a etkinlik oluştur + opsiyonel Google Meet linki üret.
//
// POST body:
// {
//   baglantiId: number,           // hangi Google hesabına yazılacak
//   baslik: string,
//   aciklama?: string,
//   lokasyon?: string,
//   baslangic: string (ISO),
//   bitis: string (ISO),
//   davetliler?: string[],        // email listesi
//   meetOlustur?: boolean,        // true → Google Meet linki otomatik üret
//   zamanDilimi?: string,         // default 'Europe/Istanbul'
// }
//
// Response: { ok: true, etkinlikId, hariciId, meetLinki, htmlLinki }

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

// Token refresh (sync function'daki ile aynı mantık)
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const {
      baglantiId,
      baslik,
      aciklama,
      lokasyon,
      baslangic,
      bitis,
      davetliler,
      meetOlustur,
      zamanDilimi,
    } = body ?? {}

    if (!baglantiId || !baslik || !baslangic || !bitis) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'baglantiId, baslik, baslangic, bitis zorunlu' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. Bağlantıyı + token'ı çek
    const { data: baglanti, error: baglantiErr } = await supa
      .from('kullanici_takvim_baglantilari')
      .select('id, kullanici_id, saglayici, hesap_email, access_token, refresh_token, token_expiry, scope, aktif')
      .eq('id', baglantiId)
      .maybeSingle()

    if (baglantiErr || !baglanti) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'Bağlantı bulunamadı' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!baglanti.aktif) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'Bağlantı aktif değil' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Scope kontrolü: events scope'u yoksa kullanıcı eski readonly bağlantıyla
    // — yeniden bağlanması gerek
    if (!baglanti.scope || !baglanti.scope.includes('calendar.events')) {
      return new Response(
        JSON.stringify({
          ok: false,
          hata: 'Bu Google bağlantısı sadece okuma izinli. Etkinlik oluşturma için "Takvim Bağlantıları" sayfasından bağlantıyı yenileyin.',
          scopeYok: true,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Access token'ı tazele
    const accessToken = await tokenTazele(baglanti)

    // 3. Google Calendar event payload
    const tz = zamanDilimi || 'Europe/Istanbul'
    const eventBody: any = {
      summary: baslik,
      description: aciklama || undefined,
      location: lokasyon || undefined,
      start: { dateTime: baslangic, timeZone: tz },
      end: { dateTime: bitis, timeZone: tz },
    }

    if (Array.isArray(davetliler) && davetliler.length > 0) {
      eventBody.attendees = davetliler
        .filter((e: any) => typeof e === 'string' && e.includes('@'))
        .map((email: string) => ({ email: email.trim() }))
    }

    if (meetOlustur) {
      eventBody.conferenceData = {
        createRequest: {
          requestId: `crm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      }
    }

    // 4. Google Calendar API'ye POST
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    url.searchParams.set('conferenceDataVersion', '1')        // Meet için zorunlu
    url.searchParams.set('sendUpdates', 'all')                // davetlilere mail at (yeni param)
    url.searchParams.set('sendNotifications', 'true')         // davetlilere mail at (eski param — bazi consumer hesaplar icin)
    url.searchParams.set('supportsAttachments', 'true')

    const gRes = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventBody),
    })

    const gData = await gRes.json()
    if (!gRes.ok) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'Google API hatası: ' + (gData?.error?.message ?? 'bilinmeyen'), detay: gData }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 5. Meet linkini bul (entryPoints içinde video type'lı olan)
    let meetLinki: string | null = null
    let meetKonferansId: string | null = gData?.conferenceData?.conferenceId ?? null
    const entryPoints = gData?.conferenceData?.entryPoints
    if (Array.isArray(entryPoints)) {
      const video = entryPoints.find((e: any) => e?.entryPointType === 'video')
      meetLinki = video?.uri ?? null
    }

    // 6. harici_etkinlikler tablosuna kaydet (sync beklemeden hemen göster)
    const attendees = gData?.attendees ?? []
    const davetlilerJsonb = attendees.map((a: any) => ({
      email: a.email,
      isim: a.displayName ?? null,
      durum: a.responseStatus ?? null,
    }))

    const { data: yeniEtkinlik, error: insertErr } = await supa
      .from('harici_etkinlikler')
      .insert({
        baglanti_id: baglanti.id,
        kullanici_id: baglanti.kullanici_id,
        saglayici: 'google',
        harici_id: gData.id,
        takvim_id: 'primary',
        baslik: gData.summary ?? baslik,
        aciklama: gData.description ?? aciklama ?? null,
        lokasyon: gData.location ?? lokasyon ?? null,
        baslangic: gData.start?.dateTime ?? baslangic,
        bitis: gData.end?.dateTime ?? bitis,
        tum_gun: false,
        durum: gData.status ?? 'confirmed',
        davetliler: davetlilerJsonb,
        organizator_email: gData.organizer?.email ?? baglanti.hesap_email,
        toplanti_linki: meetLinki,
        son_guncelleme: gData.updated ?? null,
        crm_olusturuldu: true,
        meet_konferans_id: meetKonferansId,
      })
      .select('id')
      .single()

    if (insertErr) {
      // Google'a yazıldı ama DB'ye geçmedi — kullanıcıya yine de Meet linkini dön
      console.warn('[etkinlik insert]', insertErr.message)
    }

    return new Response(
      JSON.stringify({
        ok: true,
        etkinlikId: yeniEtkinlik?.id ?? null,
        hariciId: gData.id,
        meetLinki,
        htmlLinki: gData.htmlLink ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, hata: (e as Error)?.message ?? 'bilinmeyen' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
