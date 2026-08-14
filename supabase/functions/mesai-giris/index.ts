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

// FAZLA MESAİ (mig 252): 19:00 ve sonrasında başlatılan çalışma ayrı ücretlendirilir.
// Tip SUNUCUDA belirlenir — istemciden gelen değere güvenilmez, aksi halde
// normal mesai fazla gösterilip fazladan ödeme doğabilirdi.
const FAZLA_MESAI_BASLANGIC_DK = 19 * 60  // 19:00
const mesaiTipi = (dk: number) => (dk >= FAZLA_MESAI_BASLANGIC_DK ? 'fazla' : 'normal')

function istanbulDakika(d = new Date()): number {
  const bicim = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const [saat, dakika] = bicim.format(d).split(':').map(Number)
  return saat * 60 + dakika
}

// HAFTA SONU = hafta içi 19:00 sonrası akışın AYNISI (kullanıcı kararı 14.08):
// QR istenmez (ofis kapalı, personel sahada), kayıt 'fazla' tipiyle açılır ve
// ekstra mesai olarak ücretlendirilir, personel ELLE bitirir (18:30 cron'u
// 'fazla' tipe dokunmaz; 23:00 hatırlatma + 02:00 yedek kapanış işler).
function istanbulHaftaSonuMu(d = new Date()): boolean {
  const gun = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul', weekday: 'short',
  }).format(d)
  return gun === 'Sat' || gun === 'Sun'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return jsonYanit({ ok: false, hata: 'yetkisiz' }, 401)

    const suAn = istanbulDakika()
    const haftaSonu = istanbulHaftaSonuMu()
    // 18:30-19:00 kilidi HAFTA İÇİ içindir (cron kapanışının hemen ardından
    // yeniden başlatmayı önler). Hafta sonu 18:30 cron'u 'fazla' tipe
    // dokunmadığı için kilit anlamsız — uygulanmaz.
    if (!haftaSonu && suAn >= KILIT_BASLANGIC_DK && suAn < KILIT_BITIS_DK) {
      return jsonYanit({
        ok: false,
        hata: 'mesai_kilitli',
        kilit_bitis: '19:00',
        mesaj: 'Mesai 18:30\'da otomatik kapanır. Yeni mesai 19:00\'dan sonra başlatılabilir.',
      }, 403)
    }

    const { qr_payload, lat, lng, zorla } = await req.json()
    // FAZLA MESAİ (19:00+) ve HAFTA SONU (tüm gün) QR'SIZ BAŞLAR: personel
    // ofis dışında/sahada, ofisteki QR'a erişemez. Pencere SUNUCU saatiyle
    // belirlenir — hafta içi 19:00 öncesi QR'sız istek yine reddedilir.
    const fazlaPencere = suAn >= FAZLA_MESAI_BASLANGIC_DK || haftaSonu
    if (!qr_payload && !fazlaPencere) return jsonYanit({ ok: false, hata: 'qr_eksik' }, 400)
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return jsonYanit({ ok: false, hata: 'konum_yok' }, 400)
    }

    if (qr_payload) {
      const secret = Deno.env.get('MESAI_QR_SECRET') ?? ''
      if (!secret) return jsonYanit({ ok: false, hata: 'secret_yok' }, 500)

      const dogrulama = await payloadDogrula(qr_payload, secret)
      if (!dogrulama.ok) return jsonYanit({ ok: false, hata: 'gecersiz_qr' }, 400)
    }

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

    // ÇOKLU OFİS (05.08: 2. adres eklendi) — kullanıcıya EN YAKIN ofise göre
    // kontrol edilir. TEK QR her ofiste geçerlidir: payload'daki ofisId yalnız
    // HMAC imza doğrulamasına girer, mesafe seçimi konuma göre yapılır — böylece
    // aynı çıktı iki lokasyona da asılabilir, ofis başına ayrı QR yönetilmez.
    const { data: ofisler } = await svc
      .from('ofis_konumu').select('lat, lng, tolerans_metre, sert_limit_metre')
    let mesafe: number | null = null
    let tolerans = 150
    let sertLimit = 400
    for (const o of ofisler ?? []) {
      if (!o?.lat || !o?.lng) continue
      const m = haversineMetre(Number(o.lat), Number(o.lng), lat, lng)
      if (mesafe === null || m < mesafe) {
        mesafe = m
        tolerans = o.tolerans_metre ?? 150
        sertLimit = o.sert_limit_metre ?? 400
      }
    }

    // Sert eşik — mesai kesinlikle açılmaz. Fazla mesaide UYGULANMAZ:
    // akşam çalışması zaten ofis dışında olabilir, mesafe yalnız kayda yazılır.
    if (!fazlaPencere && mesafe !== null && mesafe > sertLimit) {
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

    if (!fazlaPencere && mesafe !== null && mesafe > tolerans && !zorla) {
      return jsonYanit({ ok: false, uyari: 'ofis_disi', mesafe_m: mesafe })
    }

    const uzakNot = mesafe !== null && mesafe > tolerans ? ` · ofis dışı: ${mesafe}m` : ''
    const notMetni = haftaSonu
      ? `Hafta sonu mesaisi (ekstra)${uzakNot}`   // raporda ayırt edilsin
      : fazlaPencere
        ? (uzakNot ? `Fazla mesai${uzakNot}` : null)
        : (uzakNot ? `Ofis dışı: ${mesafe}m` : null)
    // `suAn` kilit kontrolünde hesaplandı — aynı anı kullan ki 18:59'da başlayan
    // istek araya giren saniyelerle 'fazla' olarak etiketlenmesin.
    // Hafta sonu TÜM GÜN 'fazla' (ekstra mesai) — 19:00 akışıyla aynı işlenir.
    const tip = haftaSonu ? 'fazla' : mesaiTipi(suAn)
    const { data: yeni, error } = await svc.from('mesai_kayitlari').insert({
      kullanici_id: kul.id,
      giris_lat: lat, giris_lng: lng, giris_mesafe_m: mesafe,
      not_: notMetni,
      tip,
    }).select('id').single()
    if (error) return jsonYanit({ ok: false, hata: error.message }, 500)

    // İstemci tipe göre "Bitir" butonunu açar (fazla mesai elle bitirilir)
    return jsonYanit({ ok: true, mesai_id: yeni.id, mesafe_m: mesafe, tip })
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
