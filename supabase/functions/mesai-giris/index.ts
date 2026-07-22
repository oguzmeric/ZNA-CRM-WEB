// mesai-giris — QR + GPS ile mesai açar.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { payloadDogrula, haversineMetre } from '../_shared/mesai_hmac.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── Mesai başlatma kilidi ────────────────────────────────────────────────
// Mesai 18:30'da cron ile otomatik kapanır ve "Bitir" butonu yoktur. Kapanışın
// hemen ardından yeniden başlatmayı engellemek için 18:30–19:00 arası giriş
// kapalıdır; 19:00'dan sonra tekrar açılır (ertesi sabah normal giriş için).
// İstemci de aynı kontrolü yapıyor ama burası ZORUNLU: mobil kontrolü
// atlanabilir, sunucu tarafı atlanamaz.
const KILIT_BASLANGIC_DK = 18 * 60 + 30   // 18:30
const KILIT_BITIS_DK     = 19 * 60        // 19:00

function istanbulDakika(d = new Date()): number {
  const bicim = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const [saat, dakika] = bicim.format(d).split(':').map(Number)
  return saat * 60 + dakika
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return jsonYanit({ ok: false, hata: 'yetkisiz' }, 401)

    const suAn = istanbulDakika()
    if (suAn >= KILIT_BASLANGIC_DK && suAn < KILIT_BITIS_DK) {
      return jsonYanit({
        ok: false,
        hata: 'mesai_kilitli',
        kilit_bitis: '19:00',
        mesaj: 'Mesai 18:30\'da otomatik kapanır. Yeni mesai 19:00\'dan sonra başlatılabilir.',
      }, 403)
    }

    const { qr_payload, lat, lng, zorla } = await req.json()
    if (!qr_payload) return jsonYanit({ ok: false, hata: 'qr_eksik' }, 400)
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return jsonYanit({ ok: false, hata: 'konum_yok' }, 400)
    }

    const secret = Deno.env.get('MESAI_QR_SECRET') ?? ''
    if (!secret) return jsonYanit({ ok: false, hata: 'secret_yok' }, 500)

    const dogrulama = await payloadDogrula(qr_payload, secret)
    if (!dogrulama.ok) return jsonYanit({ ok: false, hata: 'gecersiz_qr' }, 400)

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
    if (!authRes?.user) return jsonYanit({ ok: false, hata: 'yetkisiz' }, 401)

    const { data: kul } = await svc
      .from('kullanicilar').select('id, moduller')
      .eq('auth_id', authRes.user.id).maybeSingle()
    if (!kul) return jsonYanit({ ok: false, hata: 'kullanici_yok' }, 403)
    if (!(kul.moduller ?? []).includes('mesai_takip')) {
      return jsonYanit({ ok: false, hata: 'modul_yok' }, 403)
    }

    const { data: ofis } = await svc
      .from('ofis_konumu').select('lat, lng, tolerans_metre, sert_limit_metre').limit(1).single()
    const mesafe = (ofis?.lat && ofis?.lng)
      ? haversineMetre(Number(ofis.lat), Number(ofis.lng), lat, lng)
      : null
    const tolerans = ofis?.tolerans_metre ?? 150
    const sertLimit = ofis?.sert_limit_metre ?? 400

    // Sert eşik — mesai kesinlikle açılmaz
    if (mesafe !== null && mesafe > sertLimit) {
      return jsonYanit({ ok: false, hata: 'cok_uzak', mesafe_m: mesafe, sert_limit: sertLimit })
    }

    const { data: acik } = await svc
      .from('mesai_kayitlari').select('id, giris_zamani')
      .eq('kullanici_id', kul.id).is('cikis_zamani', null).maybeSingle()

    if (acik && !zorla) {
      return jsonYanit({ ok: false, hata: 'zaten_acik', acik_kayit_baslangic: acik.giris_zamani })
    }
    if (acik && zorla) {
      await svc.from('mesai_kayitlari').update({
        cikis_zamani: new Date().toISOString(),
        not_: 'Yeni giriş için otomatik kapatıldı',
      }).eq('id', acik.id)
    }

    if (mesafe !== null && mesafe > tolerans && !zorla) {
      return jsonYanit({ ok: false, uyari: 'ofis_disi', mesafe_m: mesafe })
    }

    const notMetni = (mesafe !== null && mesafe > tolerans) ? `Ofis dışı: ${mesafe}m` : null
    const { data: yeni, error } = await svc.from('mesai_kayitlari').insert({
      kullanici_id: kul.id,
      giris_lat: lat, giris_lng: lng, giris_mesafe_m: mesafe,
      not_: notMetni,
    }).select('id').single()
    if (error) return jsonYanit({ ok: false, hata: error.message }, 500)

    return jsonYanit({ ok: true, mesai_id: yeni.id, mesafe_m: mesafe })
  } catch (e) {
    return jsonYanit({ ok: false, hata: String((e as any)?.message ?? e) }, 500)
  }
})

function jsonYanit(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
