// arac-km-sync — Mobiltek'ten her aracın odometer'ını çekip sirket_araclari.guncel_km'yi güncelle.
// Ayrıca: sonraki_bakim_km ve belge bitişleri kontrol edip yaklaşanlara bildirim gönder.
// GitHub Actions cron ile günde bir çalışır; frontend'den de manuel çağrılabilir.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MOBILTEK_BASE = 'https://api.mobiltek.com.tr/v1'
const MOBILTEK_TOKEN_URL = 'https://api.mobiltek.com.tr/auth/realms/mobiltek/protocol/openid-connect/token'
const BAKIM_YAKLAŞMA_KM = 1000
const BELGE_YAKLAŞMA_GUN = 30

async function mobiltekToken(sb: any): Promise<string | null> {
  const { data: cache } = await sb.from('mobiltek_token_cache').select('access_token, expires_at').eq('id', true).maybeSingle()
  const simdi = Date.now()
  if (cache?.access_token && new Date(cache.expires_at).getTime() > simdi + 30_000) return cache.access_token
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: Deno.env.get('MOBILTEK_CLIENT_ID') ?? '',
    client_secret: Deno.env.get('MOBILTEK_CLIENT_SECRET') ?? '',
    username: Deno.env.get('MOBILTEK_USERNAME') ?? '',
    password: Deno.env.get('MOBILTEK_PASSWORD') ?? '',
  })
  const r = await fetch(MOBILTEK_TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
  })
  if (!r.ok) return null
  const j = await r.json()
  const expiresAt = new Date(simdi + (Number(j.expires_in ?? 300) * 1000)).toISOString()
  await sb.from('mobiltek_token_cache').upsert({ id: true, access_token: j.access_token, expires_at: expiresAt, guncelleme_tarih: new Date().toISOString() })
  return j.access_token
}

// TR unaccent + lower için basit normalize
const norm = (s: string) =>
  (s || '').toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/İ/gi, 'i').replace(/I/g, 'i')
    .replace(/\s+/g, ' ').trim()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // 1) Mobiltek'ten araç listesi
    const token = await mobiltekToken(svc)
    if (!token) return json({ ok: false, hata: 'mobiltek_token_yok' }, 500)
    const r = await fetch(`${MOBILTEK_BASE}/vehicles/`, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) return json({ ok: false, hata: `mobiltek ${r.status}` }, 502)
    const veri = await r.json()
    const mAraclar = (veri?.vehicles ?? []).map((v: any) => ({
      id: Number(v.id),
      plaka: v.label ?? String(v.id),
      km: Number(v.odometer ?? 0) || null,
    }))

    // 2) DB'deki araçları çek
    const { data: dbAraclar } = await svc
      .from('sirket_araclari')
      .select('id, plaka, mobiltek_id, guncel_km, sonraki_bakim_km, bakim_araligi_km, muayene_bitis, sigorta_bitis, kasko_bitis')
      .eq('aktif', true)

    // 3) Mobiltek → DB eşleştir (mobiltek_id varsa, yoksa plaka normalize ile)
    let kmGuncelleme = 0
    const araclarSonHal: any[] = []
    for (const dba of dbAraclar ?? []) {
      let mArac = mAraclar.find((m: any) => m.id === dba.mobiltek_id)
      if (!mArac) mArac = mAraclar.find((m: any) => norm(m.plaka) === norm(dba.plaka))
      if (!mArac) { araclarSonHal.push(dba); continue }
      const yeniKm = mArac.km
      if (yeniKm && yeniKm !== dba.guncel_km) {
        await svc.from('sirket_araclari').update({
          guncel_km: yeniKm,
          guncel_km_zamani: new Date().toISOString(),
          mobiltek_id: mArac.id,  // eşleştik → id'yi kaydet
        }).eq('id', dba.id)
        kmGuncelleme++
        araclarSonHal.push({ ...dba, guncel_km: yeniKm, mobiltek_id: mArac.id })
      } else {
        araclarSonHal.push(dba)
      }
    }

    // 4) Yaklaşan bakım / belge bitişi kontrolü
    const bugun = new Date()
    const belgeEsik = new Date(bugun.getTime() + BELGE_YAKLAŞMA_GUN * 24 * 3600 * 1000)
    let yeniBildirim = 0

    // Yönetim rolündeki kullanıcılar
    const { data: yonetim } = await svc
      .from('kullanicilar').select('id')
      .or('rol.eq.admin,ad.ilike.%oğuz%,ad.ilike.%oguz%,ad.ilike.%ali%,ad.ilike.%ferdi%')

    for (const a of araclarSonHal) {
      // BAKIM
      if (a.guncel_km && a.sonraki_bakim_km) {
        const kalan = a.sonraki_bakim_km - a.guncel_km
        if (kalan <= BAKIM_YAKLAŞMA_KM && kalan >= -1000) {
          const ok = await bildirimDenemesi(svc, a.id, 'bakim', {
            baslik: '🔧 Araç bakım yaklaşıyor',
            mesaj: `${a.plaka} bakım için ${kalan} km kaldı (mevcut ${a.guncel_km} / hedef ${a.sonraki_bakim_km} km).`,
            yonetim: yonetim ?? [],
          })
          if (ok) yeniBildirim++
        }
      }
      // MUAYENE
      if (a.muayene_bitis) {
        const bitis = new Date(a.muayene_bitis)
        if (bitis <= belgeEsik) {
          const gun = Math.ceil((bitis.getTime() - bugun.getTime()) / (24 * 3600 * 1000))
          if (gun >= -7) {
            const ok = await bildirimDenemesi(svc, a.id, 'muayene', {
              baslik: gun < 0 ? '🚨 Araç muayene süresi geçti!' : '📋 Araç muayene yaklaşıyor',
              mesaj: gun < 0 ? `${a.plaka} muayene bitti (${Math.abs(gun)} gün önce).` : `${a.plaka} muayene bitişi ${gun} gün kaldı (${a.muayene_bitis}).`,
              yonetim: yonetim ?? [],
            })
            if (ok) yeniBildirim++
          }
        }
      }
      // SIGORTA
      if (a.sigorta_bitis) {
        const bitis = new Date(a.sigorta_bitis)
        if (bitis <= belgeEsik) {
          const gun = Math.ceil((bitis.getTime() - bugun.getTime()) / (24 * 3600 * 1000))
          if (gun >= -7) {
            const ok = await bildirimDenemesi(svc, a.id, 'sigorta', {
              baslik: gun < 0 ? '🚨 Trafik sigortası bitti!' : '🛡 Trafik sigortası yaklaşıyor',
              mesaj: gun < 0 ? `${a.plaka} sigortası ${Math.abs(gun)} gün önce bitti.` : `${a.plaka} sigortası ${gun} gün sonra bitiyor (${a.sigorta_bitis}).`,
              yonetim: yonetim ?? [],
            })
            if (ok) yeniBildirim++
          }
        }
      }
      // KASKO
      if (a.kasko_bitis) {
        const bitis = new Date(a.kasko_bitis)
        if (bitis <= belgeEsik) {
          const gun = Math.ceil((bitis.getTime() - bugun.getTime()) / (24 * 3600 * 1000))
          if (gun >= -7) {
            const ok = await bildirimDenemesi(svc, a.id, 'kasko', {
              baslik: gun < 0 ? '🚨 Kasko bitti!' : '🛡 Kasko yaklaşıyor',
              mesaj: gun < 0 ? `${a.plaka} kasko ${Math.abs(gun)} gün önce bitti.` : `${a.plaka} kasko ${gun} gün sonra bitiyor.`,
              yonetim: yonetim ?? [],
            })
            if (ok) yeniBildirim++
          }
        }
      }
    }

    return json({
      ok: true,
      mobiltekArac: mAraclar.length,
      dbArac: (dbAraclar ?? []).length,
      kmGuncelleme,
      yeniBildirim,
    })
  } catch (e) {
    return json({ ok: false, hata: String((e as any)?.message ?? e) }, 500)
  }
})

// Aynı gün aynı tip bildirim spam etmesin
async function bildirimDenemesi(svc: any, aracId: string, tip: string, veri: { baslik: string, mesaj: string, yonetim: any[] }): Promise<boolean> {
  const { error } = await svc.from('arac_bakim_bildirim_log').insert({ arac_id: aracId, bildirim_tipi: tip, detay: { baslik: veri.baslik, mesaj: veri.mesaj } })
  if (error) return false  // muhtemelen aynı gün var, unique index engelledi
  // Yönetime bildirim gönder
  const rows = veri.yonetim.map(y => ({
    kullanici_id: y.id,
    baslik: veri.baslik,
    mesaj: veri.mesaj,
    tip: 'uyari',
    link: '/filo/bakim',
  }))
  if (rows.length) await svc.from('bildirimler').insert(rows).select()
  return true
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
