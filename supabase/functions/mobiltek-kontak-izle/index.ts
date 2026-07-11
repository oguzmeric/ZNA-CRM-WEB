// mobiltek-kontak-izle — Mobiltek araçlarının kontak durumunu izler.
// MESAİ DIŞI (hafta içi 19:00–08:00 + hafta sonu) kontak AÇILDIĞINDA admin
// kullanıcılara bildirim ekler → tr_bildirim_push trigger'ı telefonlara
// Expo push gönderir.
//
// Çalıştırma: pg_cron her 5 dk (mig 141, X-Cron-Secret header) veya
// admin kullanıcı Authorization ile manuel.
//
// Durum takibi: mobiltek_kontak_durumlari (arac_id → kontak bool).
// Geçiş kapalı→açık + mesai dışı + 30 dk spam koruması ⇒ bildirim.
// İlk görülen araç için bildirim atılmaz (ilk cron'da yağmur olmasın).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MOBILTEK_BASE = 'https://api.mobiltek.com.tr/v1'
const MOBILTEK_TOKEN_URL = 'https://api.mobiltek.com.tr/auth/realms/mobiltek/protocol/openid-connect/token'
const SPAM_KORUMA_DK = 30

// Mesai penceresi (Europe/Istanbul): hafta içi 08:00–19:00 arası mesai sayılır.
// Bunun DIŞI (gece + hafta sonu) → bildirim penceresi.
function mesaiIcindeMi(): boolean {
  const tr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }))
  const gun = tr.getDay() // 0=Pazar, 6=Cumartesi
  if (gun === 0 || gun === 6) return false
  const dakika = tr.getHours() * 60 + tr.getMinutes()
  return dakika >= 8 * 60 && dakika < 19 * 60
}

function trSaat(): string {
  return new Date().toLocaleTimeString('tr-TR', {
    timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit',
  })
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
    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Yetki: cron secret VEYA admin/arac_takip kullanıcısı ──
    const cronSecret = req.headers.get('X-Cron-Secret') ?? ''
    const beklenen = Deno.env.get('ESN_CRON_SECRET') ?? ''
    let yetkili = beklenen !== '' && cronSecret === beklenen
    if (!yetkili) {
      const authHeader = req.headers.get('Authorization') ?? ''
      if (authHeader) {
        const usr = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_ANON_KEY')!,
          { global: { headers: { Authorization: authHeader } } },
        )
        const { data: authRes } = await usr.auth.getUser()
        if (authRes?.user) {
          const { data: kul } = await svc
            .from('kullanicilar').select('rol, moduller')
            .eq('auth_id', authRes.user.id).maybeSingle()
          yetkili = kul?.rol === 'admin' || (kul?.moduller ?? []).includes('arac_takip')
        }
      }
    }
    if (!yetkili) return json({ ok: false, hata: 'yetkisiz' }, 401)

    // ── Mobiltek'ten araçları çek ──
    const token = await mobiltekToken(svc)
    if (!token) return json({ ok: false, hata: 'mobiltek_token_yok' }, 500)
    const r = await fetch(`${MOBILTEK_BASE}/vehicles/`, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) return json({ ok: false, hata: `mobiltek ${r.status}` }, 502)
    const veri = await r.json()

    // Kontak sinyali: Mobiltek 'ignition' bazen yanlış rapor ediyor —
    // web ekranıyla aynı mantık: ignition truthy VEYA hız > 0
    const araclar = (veri?.vehicles ?? [])
      .map((v: any) => {
        const loc = v['last-location'] ?? {}
        const ign = loc.ignition ?? v.ignition ?? false
        const hiz = Number(loc.speed ?? v.gpsSpeed ?? 0)
        return {
          id: Number(v.id),
          plaka: v.label ?? String(v.id),
          kontak: ign === '1' || ign === true || ign === 1 || hiz > 0,
          adres: loc.address ?? null,
        }
      })
      .filter((a: any) => a.id)

    // ── Önceki durumlar ──
    const { data: onceki } = await svc
      .from('mobiltek_kontak_durumlari')
      .select('arac_id, kontak, son_bildirim')
    const oncekiMap = new Map((onceki ?? []).map((x: any) => [Number(x.arac_id), x]))

    const simdi = new Date().toISOString()
    const mesaide = mesaiIcindeMi()
    let acilan = 0, bildirimSayisi = 0

    // Admin listesi (bildirim gerekirse bir kez çek)
    let adminler: Array<{ id: number }> | null = null

    for (const a of araclar) {
      const eski = oncekiMap.get(a.id)

      // Durum upsert (her araç için güncel tut)
      await svc.from('mobiltek_kontak_durumlari').upsert({
        arac_id: a.id,
        plaka: a.plaka,
        kontak: a.kontak,
        son_gorulme: simdi,
        son_adres: a.adres,
        ...(eski && eski.kontak !== a.kontak ? { son_degisim: simdi } : {}),
        ...(!eski ? { son_degisim: simdi } : {}),
      })

      // Geçiş: kapalı → açık (ilk görülen araçta bildirim yok)
      const gecis = eski && eski.kontak === false && a.kontak === true
      if (!gecis) continue
      acilan++

      // Mesai içindeyse sadece izle, bildirim yok
      if (mesaide) continue

      // Spam koruması: aynı araca 30 dk içinde ikinci bildirim atma
      if (eski.son_bildirim) {
        const gecenDk = (Date.now() - new Date(eski.son_bildirim).getTime()) / 60000
        if (gecenDk < SPAM_KORUMA_DK) continue
      }

      if (!adminler) {
        const { data } = await svc.from('kullanicilar').select('id').eq('rol', 'admin')
        adminler = data ?? []
      }
      if (adminler.length === 0) continue

      // bildirimler insert → tr_bildirim_push trigger'ı Expo push gönderir
      const rows = adminler.map((k) => ({
        alici_id: k.id,
        baslik: '🚗 Mesai dışı kontak açıldı',
        mesaj: `${a.plaka} — saat ${trSaat()}${a.adres ? ` · ${a.adres}` : ''}`,
        tip: 'uyari',
        link: '/mobiltek',
      }))
      const { error: bErr } = await svc.from('bildirimler').insert(rows)
      if (!bErr) {
        bildirimSayisi += rows.length
        await svc.from('mobiltek_kontak_durumlari')
          .update({ son_bildirim: simdi })
          .eq('arac_id', a.id)
      }
    }

    return json({
      ok: true,
      taranan: araclar.length,
      kontakAcik: araclar.filter((a: any) => a.kontak).length,
      yeniAcilan: acilan,
      mesaide,
      bildirim: bildirimSayisi,
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
