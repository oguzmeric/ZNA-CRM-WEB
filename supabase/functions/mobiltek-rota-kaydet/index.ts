// mobiltek-rota-kaydet — araç rota geçmişi + park (P) tespiti.
//
// pg_cron her 2 dakikada bir çağırır (mig 261, X-Cron-Secret).
// Mobiltek v1/vehicles/ ucundan tüm araçların anlık konumunu alır ve:
//   1) arac_konum_izleri  → rota noktası (haritada çizgi olur)
//   2) arac_park_kayitlari → duraklama (haritada P işareti olur)
//
// ⚠️ Mobiltek'in KENDİ geçmiş rota ucu (v1/vehicles/location-logs/{id}) 401
// dönüyor — uç var, hesabımızın yetkisi yok (04.08 canlı test). Bayiden yetki
// alınırsa geçmişe dönük veri de çekilebilir; o zamana kadar tarih bugünden
// itibaren burada birikir.
//
// KONTAK MANTIĞI — Mobiltek'in ignition alanı güvenilmez (araç çalışırken bile
// false dönebiliyor). Web ekranı ve mobiltek-kontak-izle ile BİREBİR aynı
// kural kullanılır: kontak = ignition truthy VEYA hız > 0. İkisi de yoksa
// araç park halindedir.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MOBILTEK_BASE = 'https://api.mobiltek.com.tr/v1'
const MOBILTEK_TOKEN_URL = 'https://api.mobiltek.com.tr/auth/realms/mobiltek/protocol/openid-connect/token'

// Eşikler
const HAREKET_ESIK_M   = 60   // iz yazmak için: duran araç bu kadar kaymışsa gerçekten hareket etmiştir
const PARK_ESIK_M      = 80   // açık park bu yarıçapta ise "aynı yerde duruyor" sayılır (GPS sapması payı)
const YASAM_SINYALI_DK = 30   // duran araç için bu kadar sürede bir yine de iz yaz (kayıt kopmasın)
const MIN_PARK_DK      = 3    // bundan kısa duraklama park sayılmaz (trafik ışığı) → kapanışta silinir

// Haversine — iki GPS noktası arası metre
function mesafeM(e1: number, b1: number, e2: number, b2: number): number {
  const R = 6371000
  const f1 = (e1 * Math.PI) / 180
  const f2 = (e2 * Math.PI) / 180
  const df = ((e2 - e1) * Math.PI) / 180
  const dl = ((b2 - b1) * Math.PI) / 180
  const x = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)))
}

// Mobiltek .NET tarihi: "/Date(1783358792000+0300)/" → ISO
function netTarih(s: unknown): string | null {
  if (!s) return null
  const m = String(s).match(/\/Date\((\d+)/)
  if (m) return new Date(parseInt(m[1], 10)).toISOString()
  const d = new Date(String(s))
  return isNaN(d.getTime()) ? null : d.toISOString()
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
  const username = Deno.env.get('MOBILTEK_USERNAME') ?? ''
  if (!clientId || !username) return null
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    client_secret: Deno.env.get('MOBILTEK_CLIENT_SECRET') ?? '',
    username,
    password: Deno.env.get('MOBILTEK_PASSWORD') ?? '',
  })
  const r = await fetch(MOBILTEK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!r.ok) return null
  const j = await r.json()
  await sb.from('mobiltek_token_cache').upsert({
    id: true,
    access_token: j.access_token,
    expires_at: new Date(simdi + Number(j.expires_in ?? 300) * 1000).toISOString(),
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
    const beklenen = Deno.env.get('ESN_CRON_SECRET') ?? ''
    let yetkili = beklenen !== '' && (req.headers.get('X-Cron-Secret') ?? '') === beklenen
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

    // ── Mobiltek'ten anlık konumlar ──
    const token = await mobiltekToken(svc)
    if (!token) return json({ ok: false, hata: 'mobiltek_token_yok' }, 500)
    const r = await fetch(`${MOBILTEK_BASE}/vehicles/`, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) return json({ ok: false, hata: `mobiltek ${r.status}` }, 502)
    const veri = await r.json()

    const simdi = new Date().toISOString()
    const araclar = (veri?.vehicles ?? [])
      .map((v: any) => {
        const loc = v['last-location'] ?? {}
        const ign = loc.ignition ?? v.ignition ?? false
        const hiz = Number(loc.speed ?? v.gpsSpeed ?? 0) || 0
        const enlem = Number(loc.latitude ?? v.lat)
        const boylam = Number(loc.longitude ?? v.lng)
        return {
          arac_id: Number(v.id),
          plaka: v.label ?? String(v.id),
          enlem, boylam, hiz,
          yon: Math.round(Number(loc.dir ?? v.direction ?? 0)) || 0,
          kontak: ign === '1' || ign === true || ign === 1 || hiz > 0,
          adres: loc.address ?? null,
          il: loc.city ?? null,
          ilce: loc.district ?? null,
          olcum_zamani: netTarih(loc.logdatetime) ?? simdi,
        }
      })
      .filter((a: any) => a.arac_id && Number.isFinite(a.enlem) && Number.isFinite(a.boylam)
                          && (a.enlem !== 0 || a.boylam !== 0))

    if (araclar.length === 0) return json({ ok: true, taranan: 0, not: 'konumlu arac yok' })

    // ── Önceki durum + açık parklar (ikisi de tek sorgu) ──
    const { data: durumlar } = await svc
      .from('arac_iz_durumu')
      .select('arac_id, son_enlem, son_boylam, son_olcum, son_yazim')
    const durumMap = new Map((durumlar ?? []).map((d: any) => [Number(d.arac_id), d]))

    const { data: acikParklar } = await svc
      .from('arac_park_kayitlari')
      .select('id, arac_id, enlem, boylam, baslangic')
      .is('bitis', null)
    const parkMap = new Map((acikParklar ?? []).map((p: any) => [Number(p.arac_id), p]))

    const izler: any[] = []
    const durumGuncel: any[] = []
    let parkAcilan = 0, parkKapanan = 0, parkSilinen = 0

    for (const a of araclar) {
      const onceki = durumMap.get(a.arac_id)
      const kayma = onceki?.son_enlem != null
        ? mesafeM(Number(onceki.son_enlem), Number(onceki.son_boylam), a.enlem, a.boylam)
        : Infinity

      // ── İZ YAZILSIN MI? ──
      // Kontak açıksa her nokta değerlidir (rota çizgisi ondan oluşur).
      // Kontak kapalıysa park halindeki araç için 2 dk'da bir aynı nokta
      // yazmanın anlamı yok; ancak gerçekten yer değiştirdiyse (çekici, GPS
      // sapması dışı) veya uzun süredir hiç kayıt yoksa yazılır.
      const gecenDk = onceki?.son_yazim
        ? (Date.now() - new Date(onceki.son_yazim).getTime()) / 60000
        : Infinity
      const izYaz = a.kontak || kayma > HAREKET_ESIK_M || gecenDk >= YASAM_SINYALI_DK

      if (izYaz) {
        izler.push({
          arac_id: a.arac_id, plaka: a.plaka,
          enlem: a.enlem, boylam: a.boylam,
          hiz: a.hiz, yon: a.yon, kontak: a.kontak,
          adres: a.adres, il: a.il, ilce: a.ilce,
          olcum_zamani: a.olcum_zamani,
        })
      }

      // ── PARK MANTIĞI ──
      const acik = parkMap.get(a.arac_id)
      if (!a.kontak) {
        // Araç duruyor
        if (!acik) {
          const { error } = await svc.from('arac_park_kayitlari').insert({
            arac_id: a.arac_id, plaka: a.plaka,
            enlem: a.enlem, boylam: a.boylam,
            adres: a.adres, il: a.il, ilce: a.ilce,
            baslangic: a.olcum_zamani,
          })
          if (!error) parkAcilan++
        } else {
          const parkKayma = mesafeM(Number(acik.enlem), Number(acik.boylam), a.enlem, a.boylam)
          if (parkKayma > PARK_ESIK_M) {
            // Kontak kapalı ama araç yer değiştirmiş (çekildi / ignition yanlış
            // raporlandı) → eski parkı kapat, yenisini aç
            await parkiKapat(svc, acik, a.olcum_zamani)
            parkKapanan++
            const { error } = await svc.from('arac_park_kayitlari').insert({
              arac_id: a.arac_id, plaka: a.plaka,
              enlem: a.enlem, boylam: a.boylam,
              adres: a.adres, il: a.il, ilce: a.ilce,
              baslangic: a.olcum_zamani,
            })
            if (!error) parkAcilan++
          } else {
            // Aynı yerde duruyor — adres ilk taramada boş geldiyse tamamla
            await svc.from('arac_park_kayitlari')
              .update({ guncelleme: simdi, ...(acik.adres ? {} : { adres: a.adres }) })
              .eq('id', acik.id)
          }
        }
      } else if (acik) {
        // Araç hareket etti → park bitti
        const silindi = await parkiKapat(svc, acik, a.olcum_zamani)
        if (silindi) parkSilinen++; else parkKapanan++
      }

      durumGuncel.push({
        arac_id: a.arac_id, plaka: a.plaka,
        son_enlem: a.enlem, son_boylam: a.boylam,
        son_olcum: a.olcum_zamani,
        son_yazim: izYaz ? simdi : (onceki?.son_yazim ?? null),
        guncelleme: simdi,
      })
    }

    // ── Toplu yazım ──
    // ⚠️ ignoreDuplicates: araç dururken cihaz aynı logdatetime'ı tekrar
    // raporlar; (arac_id, olcum_zamani) unique index'i mükerreri engeller.
    let yazilan = 0
    if (izler.length) {
      const { error } = await svc.from('arac_konum_izleri')
        .upsert(izler, { onConflict: 'arac_id,olcum_zamani', ignoreDuplicates: true })
      if (error) console.error('[rota] iz yazma:', error.message)
      else yazilan = izler.length
    }
    if (durumGuncel.length) {
      const { error } = await svc.from('arac_iz_durumu').upsert(durumGuncel, { onConflict: 'arac_id' })
      if (error) console.error('[rota] durum yazma:', error.message)
    }

    return json({
      ok: true,
      taranan: araclar.length,
      hareketli: araclar.filter((a: any) => a.kontak).length,
      izYazilan: yazilan,
      parkAcilan, parkKapanan, parkSilinen,
    })
  } catch (e) {
    console.error('[rota] hata:', e)
    return json({ ok: false, hata: String((e as any)?.message ?? e) }, 500)
  }
})

// Parkı kapatır. MIN_PARK_DK'dan kısaysa kayıt tamamen silinir (trafik ışığı
// gibi duraklamalar haritayı P işaretiyle doldurmasın). Silindiyse true döner.
async function parkiKapat(svc: any, park: any, bitis: string): Promise<boolean> {
  const sureDk = Math.max(0, Math.round(
    (new Date(bitis).getTime() - new Date(park.baslangic).getTime()) / 60000
  ))
  if (sureDk < MIN_PARK_DK) {
    await svc.from('arac_park_kayitlari').delete().eq('id', park.id)
    return true
  }
  await svc.from('arac_park_kayitlari')
    .update({ bitis, sure_dk: sureDk, guncelleme: new Date().toISOString() })
    .eq('id', park.id)
  return false
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
