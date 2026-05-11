// Google Calendar etkinliklerini çekip harici_etkinlikler tablosuna senkronize eder.
// Çağrı modları:
//   - POST { baglantiId: 123 }     — tek bağlantıyı sync et (manuel "Şimdi senkronize")
//   - POST { hepsi: true }          — tüm aktif bağlantıları sync et (cron için)

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

// Access token süresi dolmuşsa refresh ile yenile
async function tokenTazele(baglanti: any) {
  const expiry = new Date(baglanti.token_expiry).getTime()
  // 1 dakika buffer ile yenile (eski olabilir veya yakın expiry)
  if (expiry - 60_000 > Date.now()) {
    return baglanti.access_token
  }
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

  return data.access_token as string
}

// Google Calendar API: events.list
// 60 gün geriye, 90 gün ileriye event'leri çek
async function etkinlikleriCek(accessToken: string) {
  const timeMin = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString()
  const timeMax = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString()

  let pageToken: string | undefined = undefined
  const tumEtkinlikler: any[] = []

  for (let i = 0; i < 10; i++) {  // safety: max 10 sayfa
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    url.searchParams.set('timeMin', timeMin)
    url.searchParams.set('timeMax', timeMax)
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('maxResults', '250')
    url.searchParams.set('showDeleted', 'true')  // silinmişleri de al
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error('Calendar API hatası: ' + (data?.error?.message ?? res.statusText))
    }
    if (Array.isArray(data.items)) tumEtkinlikler.push(...data.items)
    pageToken = data.nextPageToken
    if (!pageToken) break
  }

  return tumEtkinlikler
}

// Tek bağlantıyı sync et
async function tekBaglantiSync(baglantiId: number) {
  const { data: baglanti, error: bErr } = await supa
    .from('kullanici_takvim_baglantilari')
    .select('*')
    .eq('id', baglantiId)
    .single()

  if (bErr || !baglanti) throw new Error('Bağlantı bulunamadı')
  if (!baglanti.aktif) return { gonderildi: 0, atlandi: 'aktif değil' }

  const accessToken = await tokenTazele(baglanti)
  const events = await etkinlikleriCek(accessToken)

  let upserted = 0
  let silindi = 0

  for (const ev of events) {
    if (!ev.id) continue

    // Tüm-gün event tarih objesi farklı: date vs dateTime
    const baslangic = ev.start?.dateTime || ev.start?.date
    const bitis = ev.end?.dateTime || ev.end?.date
    if (!baslangic) continue

    const tumGun = !ev.start?.dateTime

    // Silinmiş event
    if (ev.status === 'cancelled') {
      const { error } = await supa
        .from('harici_etkinlikler')
        .update({ silindi: true })
        .eq('baglanti_id', baglantiId)
        .eq('harici_id', ev.id)
      if (!error) silindi++
      continue
    }

    const upsertData = {
      baglanti_id: baglantiId,
      kullanici_id: baglanti.kullanici_id,
      saglayici: 'google',
      harici_id: ev.id,
      takvim_id: 'primary',
      baslik: ev.summary ?? '(başlıksız)',
      aciklama: ev.description ?? null,
      lokasyon: ev.location ?? null,
      baslangic,
      bitis: bitis ?? null,
      tum_gun: tumGun,
      durum: ev.status ?? null,
      davetliler: Array.isArray(ev.attendees)
        ? ev.attendees.map((a: any) => ({
            email: a.email,
            isim: a.displayName ?? null,
            durum: a.responseStatus ?? null,
          }))
        : null,
      organizator_email: ev.organizer?.email ?? null,
      toplanti_linki: ev.hangoutLink ?? null,
      son_guncelleme: ev.updated ?? null,
      silindi: false,
    }

    const { error } = await supa
      .from('harici_etkinlikler')
      .upsert(upsertData, { onConflict: 'baglanti_id,harici_id' })
    if (!error) upserted++
  }

  // Başarı: son_sync_zamani güncelle
  await supa
    .from('kullanici_takvim_baglantilari')
    .update({ son_sync_zamani: new Date().toISOString(), son_sync_hatasi: null })
    .eq('id', baglantiId)

  return { upserted, silindi, toplam: events.length }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))

    if (body.baglantiId) {
      const sonuc = await tekBaglantiSync(body.baglantiId)
      return new Response(
        JSON.stringify({ ok: true, ...sonuc }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (body.hepsi) {
      const { data: baglantilar } = await supa
        .from('kullanici_takvim_baglantilari')
        .select('id, kullanici_id')
        .eq('aktif', true)
        .eq('saglayici', 'google')

      const sonuclar = []
      for (const b of baglantilar ?? []) {
        try {
          const r = await tekBaglantiSync(b.id)
          sonuclar.push({ baglantiId: b.id, ok: true, ...r })
        } catch (e) {
          await supa
            .from('kullanici_takvim_baglantilari')
            .update({ son_sync_hatasi: (e as Error)?.message ?? 'bilinmeyen' })
            .eq('id', b.id)
          sonuclar.push({ baglantiId: b.id, ok: false, hata: (e as Error)?.message })
        }
      }
      return new Response(
        JSON.stringify({ ok: true, baglantiSayisi: sonuclar.length, sonuclar }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ ok: false, hata: 'baglantiId veya hepsi:true gerekli' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, hata: (e as Error)?.message ?? 'bilinmeyen' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
