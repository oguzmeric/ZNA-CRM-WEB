// arac-yakinlik-tara — Mobiltek'ten anlık pozisyonları çeker, 150m altında
// olan çiftleri arac_yakinlik_kayitlari tablosuna upsert eder. Süre 15 dk'yı
// geçince alarm_verildi=true yapıp bildirim gönderir.
// Kullanım: frontend polling'iyle beraber çağrılır (30 sn) veya cron.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const YAKINLIK_ESIK_M = 500
const ALARM_ESIK_DK = 20
const COZULDU_ESIK_DK = 5  // 5 dk aktivite yoksa çift çözüldü sayılır
const MOBILTEK_BASE = 'https://api.mobiltek.com.tr/v1'
const MOBILTEK_TOKEN_URL = 'https://api.mobiltek.com.tr/auth/realms/mobiltek/protocol/openid-connect/token'

// Haversine formülü — metre cinsinden 2 GPS noktası arasındaki mesafe
function haversineMetre(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(a)))
}

async function mobiltekToken(sb: any): Promise<string | null> {
  const { data: cache } = await sb
    .from('mobiltek_token_cache')
    .select('access_token, expires_at')
    .eq('id', true)
    .maybeSingle()
  const simdi = Date.now()
  if (cache?.access_token && new Date(cache.expires_at).getTime() > simdi + 30_000) {
    return cache.access_token
  }
  const clientId = Deno.env.get('MOBILTEK_CLIENT_ID') ?? ''
  const clientSecret = Deno.env.get('MOBILTEK_CLIENT_SECRET') ?? ''
  const username = Deno.env.get('MOBILTEK_USERNAME') ?? ''
  const password = Deno.env.get('MOBILTEK_PASSWORD') ?? ''
  if (!clientId || !username) return null
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    client_secret: clientSecret,
    username,
    password,
  })
  const r = await fetch(MOBILTEK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!r.ok) return null
  const j = await r.json()
  const expiresAt = new Date(simdi + (Number(j.expires_in ?? 300) * 1000)).toISOString()
  await sb.from('mobiltek_token_cache').upsert({
    id: true, access_token: j.access_token, expires_at: expiresAt,
    guncelleme_tarih: new Date().toISOString(),
  })
  return j.access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return json({ ok: false, hata: 'yetkisiz' }, 401)

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
    if (!authRes?.user) return json({ ok: false, hata: 'yetkisiz' }, 401)
    const { data: kul } = await svc
      .from('kullanicilar').select('id, ad, rol, moduller')
      .eq('auth_id', authRes.user.id).maybeSingle()
    if (!kul) return json({ ok: false, hata: 'kullanici_yok' }, 403)
    const yetkili = kul.rol === 'admin' || (kul.moduller ?? []).includes('arac_takip')
    if (!yetkili) return json({ ok: false, hata: 'yetki_yok' }, 403)

    // Mobiltek'ten pozisyonları al
    const token = await mobiltekToken(svc)
    if (!token) return json({ ok: false, hata: 'mobiltek_token_yok' }, 500)
    const r = await fetch(`${MOBILTEK_BASE}/vehicles/`, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) return json({ ok: false, hata: `mobiltek ${r.status}` }, 502)
    const veri = await r.json()
    const araclar = (veri?.vehicles ?? [])
      .map((v: any) => ({
        id: Number(v.id),
        plaka: v.label ?? String(v.id),
        lat: v['last-location']?.latitude,
        lng: v['last-location']?.longitude,
        adres: v['last-location']?.address ?? null,
      }))
      .filter((a: any) => a.id && typeof a.lat === 'number' && typeof a.lng === 'number')

    const simdi = new Date().toISOString()
    const yakinCiftler: Array<{ a: any, b: any, mesafe: number }> = []

    // Tüm ikili kombinasyonlar için mesafe hesapla
    for (let i = 0; i < araclar.length; i++) {
      for (let j = i + 1; j < araclar.length; j++) {
        const a = araclar[i], b = araclar[j]
        const m = haversineMetre(a.lat, a.lng, b.lat, b.lng)
        if (m <= YAKINLIK_ESIK_M) {
          // Küçük id her zaman arac1 olsun (check constraint)
          const [x, y] = a.id < b.id ? [a, b] : [b, a]
          yakinCiftler.push({ a: x, b: y, mesafe: m })
        }
      }
    }

    // Yakın çiftleri DB'ye upsert
    let insert = 0, guncelle = 0, yeniAlarm = 0
    for (const { a, b, mesafe } of yakinCiftler) {
      const { data: mevcut } = await svc
        .from('arac_yakinlik_kayitlari')
        .select('id, ilk_zaman, ornek_sayisi, ortalama_mesafe_m, alarm_verildi')
        .eq('arac1_id', a.id).eq('arac2_id', b.id).eq('cozuldu', false)
        .maybeSingle()

      if (!mevcut) {
        await svc.from('arac_yakinlik_kayitlari').insert({
          arac1_id: a.id, arac1_plaka: a.plaka,
          arac2_id: b.id, arac2_plaka: b.plaka,
          ilk_zaman: simdi, son_zaman: simdi,
          ilk_lat: a.lat, ilk_lng: a.lng,
          son_lat: b.lat, son_lng: b.lng,
          son_adres: b.adres,
          son_mesafe_m: mesafe, ortalama_mesafe_m: mesafe,
          ornek_sayisi: 1,
        })
        insert++
      } else {
        const yeniSayi = mevcut.ornek_sayisi + 1
        const yeniOrt = Math.round(
          ((mevcut.ortalama_mesafe_m ?? mesafe) * mevcut.ornek_sayisi + mesafe) / yeniSayi
        )
        await svc.from('arac_yakinlik_kayitlari').update({
          son_zaman: simdi,
          son_lat: b.lat, son_lng: b.lng,
          son_adres: b.adres,
          son_mesafe_m: mesafe,
          ortalama_mesafe_m: yeniOrt,
          ornek_sayisi: yeniSayi,
        }).eq('id', mevcut.id)
        guncelle++

        // Alarm eşiği kontrolü
        const gecenDk = (new Date(simdi).getTime() - new Date(mevcut.ilk_zaman).getTime()) / 60000
        if (!mevcut.alarm_verildi && gecenDk >= ALARM_ESIK_DK) {
          await svc.from('arac_yakinlik_kayitlari').update({
            alarm_verildi: true, alarm_zamani: simdi,
          }).eq('id', mevcut.id)

          // Yönetim rolündekilere bildirim gönder
          const { data: yonetimler } = await svc
            .from('kullanicilar').select('id, ad')
            .or('rol.eq.admin,ad.ilike.%oğuz%,ad.ilike.%oguz%,ad.ilike.%ali%,ad.ilike.%ferdi%')
          const bildirimRows = (yonetimler ?? []).map((k: any) => ({
            kullanici_id: k.id,
            baslik: '🕵️ Araç yakınlık uyarısı',
            mesaj: `${a.plaka} ve ${b.plaka} ${Math.round(gecenDk)} dakikadır ${b.adres ?? 'aynı yerde'} birlikte.`,
            tip: 'uyari',
            link: '/mobiltek',
          }))
          if (bildirimRows.length) {
            await svc.from('bildirimler').insert(bildirimRows)
          }
          yeniAlarm++
        }
      }
    }

    // Çözülme kontrolü: son_zaman > COZULDU_ESIK_DK olan aktif kayıtları kapat
    const cozuldu = new Date(Date.now() - COZULDU_ESIK_DK * 60000).toISOString()
    const { count: kapatilan } = await svc
      .from('arac_yakinlik_kayitlari')
      .update({ cozuldu: true, cozuldu_zamani: simdi }, { count: 'exact' })
      .eq('cozuldu', false)
      .lt('son_zaman', cozuldu)

    return json({
      ok: true,
      taranan: araclar.length,
      yakinCift: yakinCiftler.length,
      insert, guncelle,
      yeniAlarm,
      kapatilan: kapatilan ?? 0,
    })
  } catch (e) {
    return json({ ok: false, hata: String((e as any)?.message ?? e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
