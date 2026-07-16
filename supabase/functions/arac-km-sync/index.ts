// arac-km-sync v2 — Mobiltek'ten araç KM'lerini çekip sirket_araclari'nı günceller.
// + Mobiltek'te olup DB'de olmayan araçları OTOMATIK ekler (plaka=label).
// + Yaklaşan bakım / muayene / sigorta / kasko bitişlerinde adminlere push.
//
// Çalıştırma: pg_cron her sabah 05:30 UTC (08:30 TR, mig 143) X-Cron-Secret ile
// veya web'den "Mobiltek KM Sync" butonu (JWT).
//
// v2 düzeltmeleri:
//   - bildirimler INSERT kullanici_id → alici_id (push zinciri hiç çalışmıyordu)
//   - plaka eşleşmesi boşluksuz normalize ("34FOD17" == "34 FOD 17")
//   - odometer birden çok alandan denenir (v.odometer / last-location.odometer / totalDistance)
//   - eksik araçlar otomatik içe aktarılır
//   - yönetici listesi isim regex yerine rol='admin'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MOBILTEK_BASE = 'https://api.mobiltek.com.tr/v1'
const MOBILTEK_TOKEN_URL = 'https://api.mobiltek.com.tr/auth/realms/mobiltek/protocol/openid-connect/token'
const BAKIM_YAKLASMA_KM = 1000
const BELGE_YAKLASMA_GUN = 15  // muayene/sigorta/kasko bitişine 15 gün kala bildir

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

// TR unaccent + lower + TÜM boşlukları at ("34 FOD 17" → "34fod17")
const norm = (s: string) =>
  (s || '').toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\s+/g, '').trim()

// Odometer farklı alanlarda gelebiliyor — sırayla dene
function kmBul(v: any): number | null {
  const loc = v['last-location'] ?? {}
  const adaylar = [v.odometer, loc.odometer, v.totalDistance, loc.totalDistance, v.km, loc.km]
  for (const a of adaylar) {
    const n = Number(a)
    if (Number.isFinite(n) && n > 0) return Math.round(n)
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // ── Yetki: cron secret VEYA geçerli JWT (personel butonu) ──
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
        yetkili = !!authRes?.user
      }
    }
    if (!yetkili) return json({ ok: false, hata: 'yetkisiz' }, 401)

    // 1) Mobiltek'ten araç listesi
    const token = await mobiltekToken(svc)
    if (!token) return json({ ok: false, hata: 'mobiltek_token_yok' }, 500)

    // Teşhis modu: { debug: "/vehicles/37843" } gönderilirse ham cevabı döndür
    try {
      const body = await req.clone().json().catch(() => null)
      if (body?.debug) {
        const dr = await fetch(`${MOBILTEK_BASE}${body.debug}`, { headers: { Authorization: `Bearer ${token}` } })
        const metin = await dr.text()
        return json({ ok: true, debugStatus: dr.status, debugBody: metin.slice(0, 4000) })
      }
    } catch (_) { /* debug yoksa normal akış */ }

    const r = await fetch(`${MOBILTEK_BASE}/vehicles/`, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) return json({ ok: false, hata: `mobiltek ${r.status}` }, 502)
    const veri = await r.json()
    const mAraclar = (veri?.vehicles ?? []).map((v: any) => ({
      id: Number(v.id),
      plaka: v.label ?? String(v.id),
      km: kmBul(v),
    }))

    // 2) DB'deki araçları çek
    const { data: dbAraclar } = await svc
      .from('sirket_araclari')
      .select('id, plaka, mobiltek_id, guncel_km, sonraki_bakim_km, bakim_araligi_km, muayene_bitis, sigorta_bitis, kasko_bitis, sorumlu_kullanici_idler')

    // 3) Eşleştir + KM güncelle
    let kmGuncelleme = 0
    const eslesenMobiltekIdler = new Set<number>()
    const araclarSonHal: any[] = []
    for (const dba of dbAraclar ?? []) {
      let mArac = mAraclar.find((m: any) => m.id === dba.mobiltek_id)
      if (!mArac) mArac = mAraclar.find((m: any) => norm(m.plaka) === norm(dba.plaka))
      if (!mArac) { araclarSonHal.push(dba); continue }
      eslesenMobiltekIdler.add(mArac.id)
      const yeniKm = mArac.km
      const guncelle: Record<string, unknown> = {}
      if (dba.mobiltek_id !== mArac.id) guncelle.mobiltek_id = mArac.id
      if (yeniKm && yeniKm !== dba.guncel_km) {
        guncelle.guncel_km = yeniKm
        guncelle.guncel_km_zamani = new Date().toISOString()
        kmGuncelleme++
      }
      if (Object.keys(guncelle).length) {
        await svc.from('sirket_araclari').update(guncelle).eq('id', dba.id)
      }
      araclarSonHal.push({ ...dba, ...guncelle })
    }

    // 3b) Mobiltek'te olup DB'de olmayan araçları içe aktar
    let yeniArac = 0
    for (const m of mAraclar) {
      if (eslesenMobiltekIdler.has(m.id)) continue
      const { data: eklenen, error } = await svc.from('sirket_araclari').insert({
        plaka: m.plaka,
        aktif: true,
        mobiltek_id: m.id,
        guncel_km: m.km,
        guncel_km_zamani: m.km ? new Date().toISOString() : null,
      }).select('id, plaka, guncel_km, sonraki_bakim_km, muayene_bitis, sigorta_bitis, kasko_bitis').single()
      if (!error && eklenen) { yeniArac++; araclarSonHal.push(eklenen) }
    }

    // 4) Yaklaşan bakım / belge bitişi kontrolü → adminlere push
    const bugun = new Date()
    const belgeEsik = new Date(bugun.getTime() + BELGE_YAKLASMA_GUN * 24 * 3600 * 1000)
    let yeniBildirim = 0

    const { data: adminler } = await svc.from('kullanicilar').select('id').eq('rol', 'admin')
    const adminIds = (adminler ?? []).map((x: any) => x.id)
    // Bir aracın bildirim alıcıları = adminler + o araca atanmış sorumlular (tekil)
    const alicilar = (a: any) =>
      [...new Set([...adminIds, ...((a.sorumlu_kullanici_idler ?? []) as number[])])].map((id) => ({ id }))

    const belgeKontrol = async (a: any, alan: string, tip: string, etiket: string, ikon: string) => {
      if (!a[alan]) return
      const bitis = new Date(a[alan])
      if (bitis > belgeEsik) return
      const gun = Math.ceil((bitis.getTime() - bugun.getTime()) / (24 * 3600 * 1000))
      if (gun < -7) return
      const ok = await bildirimDenemesi(svc, a.id, tip, {
        baslik: gun < 0 ? `🚨 ${a.plaka} — ${etiket} süresi GEÇTİ` : `${ikon} ${a.plaka} — ${etiket} yaklaşıyor`,
        mesaj: gun < 0
          ? `${a.plaka} aracının ${etiket.toLowerCase()} bitişi ${Math.abs(gun)} gün önce geçti (${a[alan]}).`
          : `${a.plaka} aracının ${etiket.toLowerCase()} bitişine ${gun} gün kaldı (${a[alan]}).`,
        adminler: alicilar(a),
      })
      if (ok) yeniBildirim++
    }

    for (const a of araclarSonHal) {
      if (a.guncel_km && a.sonraki_bakim_km) {
        const kalan = a.sonraki_bakim_km - a.guncel_km
        if (kalan <= BAKIM_YAKLASMA_KM && kalan >= -2000) {
          const ok = await bildirimDenemesi(svc, a.id, 'bakim', {
            baslik: kalan < 0 ? `🚨 ${a.plaka} — bakım KM'si geçti` : `🔧 ${a.plaka} — bakım yaklaşıyor`,
            mesaj: kalan < 0
              ? `${a.plaka} bakım hedefini ${Math.abs(kalan)} km geçti (mevcut ${a.guncel_km} km).`
              : `${a.plaka} bakımına ${kalan} km kaldı (mevcut ${a.guncel_km} / hedef ${a.sonraki_bakim_km} km).`,
            adminler: alicilar(a),
          })
          if (ok) yeniBildirim++
        }
      }
      await belgeKontrol(a, 'muayene_bitis', 'muayene', 'Muayene', '📋')
      await belgeKontrol(a, 'sigorta_bitis', 'sigorta', 'Trafik sigortası', '🛡')
      await belgeKontrol(a, 'kasko_bitis', 'kasko', 'Kasko', '🛡')
    }

    return json({
      ok: true,
      mobiltekArac: mAraclar.length,
      dbArac: (dbAraclar ?? []).length,
      yeniArac,
      kmGuncelleme,
      yeniBildirim,
      araclar: mAraclar, // teşhis için: Mobiltek'in gördüğü plaka + km
    })
  } catch (e) {
    return json({ ok: false, hata: String((e as any)?.message ?? e) }, 500)
  }
})

// Aynı gün aynı araca aynı tip bildirimi tekrarlama (unique index engeller)
async function bildirimDenemesi(svc: any, aracId: string, tip: string, veri: { baslik: string, mesaj: string, adminler: any[] }): Promise<boolean> {
  const { error } = await svc.from('arac_bakim_bildirim_log').insert({
    arac_id: aracId, bildirim_tipi: tip, detay: { baslik: veri.baslik, mesaj: veri.mesaj },
  })
  if (error) return false // aynı gün zaten gönderilmiş
  const rows = veri.adminler.map((y: any) => ({
    alici_id: y.id,
    baslik: veri.baslik,
    mesaj: veri.mesaj,
    tip: 'uyari',
    link: '/filo/bakim',
  }))
  if (rows.length) await svc.from('bildirimler').insert(rows)
  return true
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
