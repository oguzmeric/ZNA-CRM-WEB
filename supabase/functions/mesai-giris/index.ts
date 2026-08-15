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
//
// ⚠️ HAFTA SONU = SAATİ NE OLURSA OLSUN 'fazla' (kullanıcı kararı 15.08).
// Bu, 14.08'deki "hafta sonu hafta içiyle aynı işlensin" kararının YERİNİ ALDI.
// Gerekçe: hafta sonu çalışması normal mesai saatinin dışında, ayrı
// ücretlendirilecek. Hafta içi kuralı DEĞİŞMEDİ (19:00 öncesi normal).
const FAZLA_MESAI_BASLANGIC_DK = 19 * 60  // 19:00
const mesaiTipi = (dk: number, haftaSonu: boolean) =>
  (haftaSonu || dk >= FAZLA_MESAI_BASLANGIC_DK ? 'fazla' : 'normal')

function istanbulDakika(d = new Date()): number {
  const bicim = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const [saat, dakika] = bicim.format(d).split(':').map(Number)
  return saat * 60 + dakika
}

// HAFTA SONU (15.08 kararı — 14.08'deki "aynı işlensin" kararının yerini aldı):
//   • Tip her saat 'fazla' (yukarıdaki mesaiTipi)
//   • QR istenmez, mesafe eşiği uygulanmaz (ofis kapalı, personel sahada)
//   • Elle "Bitir" ile kapatılır; gün içinde birden çok kayıt açılabilir,
//     süreler toplanır (mesai_aktif_tek yalnız AYNI ANDA tek açık kayda izin verir)
//   • 18:30 cron'u yedek olarak duruyor: kapatmayı unutan kayıt sonsuza dek
//     açık kalmasın (14.08 kararı, bilerek korundu)
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
    // 18:30-19:00 kilidi: cron kapanışının hemen ardından yeniden başlatmayı
    // önler. Hafta sonu kayıtları da artık aynı cron'la kapandığından kilit
    // her gün geçerlidir (hafta içi ile aynı kural).
    if (suAn >= KILIT_BASLANGIC_DK && suAn < KILIT_BITIS_DK) {
      return jsonYanit({
        ok: false,
        hata: 'mesai_kilitli',
        kilit_bitis: '19:00',
        mesaj: 'Mesai 18:30\'da otomatik kapanır. Yeni mesai 19:00\'dan sonra başlatılabilir.',
      }, 403)
    }

    const { qr_payload, lat, lng, zorla } = await req.json()
    // QR MUAFİYETİ — 19:00+ (fazla mesai) ve HAFTA SONU (tüm gün): personel
    // ofis dışında/sahada, ofisteki QR'a erişemez. Pencere SUNUCU saatiyle
    // belirlenir — hafta içi 19:00 öncesi QR'sız istek yine reddedilir.
    // DİKKAT: muafiyet yalnız QR/mesafe içindir, kayıt TİPİNİ belirlemez.
    const qrMuaf = suAn >= FAZLA_MESAI_BASLANGIC_DK || haftaSonu
    if (!qr_payload && !qrMuaf) return jsonYanit({ ok: false, hata: 'qr_eksik' }, 400)
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

    // Sert eşik — mesai kesinlikle açılmaz. QR muafiyeti penceresinde
    // UYGULANMAZ: akşam/hafta sonu çalışması zaten ofis dışında olabilir,
    // mesafe yalnız kayda yazılır.
    if (!qrMuaf && mesafe !== null && mesafe > sertLimit) {
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

    if (!qrMuaf && mesafe !== null && mesafe > tolerans && !zorla) {
      return jsonYanit({ ok: false, uyari: 'ofis_disi', mesafe_m: mesafe })
    }

    // `suAn` kilit kontrolünde hesaplandı — aynı anı kullan ki 18:59'da başlayan
    // istek araya giren saniyelerle 'fazla' olarak etiketlenmesin.
    // İKİ KURAL (15.08): hafta sonu → her saat 'fazla'; hafta içi → 19:00 öncesi
    // 'normal', sonrası 'fazla'.
    const tip = mesaiTipi(suAn, haftaSonu)
    // Hafta sonu "ofis dışı" notu YAZILMAZ: ofis kapalı, herkes zaten dışarıda —
    // işaret anlam taşımaz. Mesafe her durumda giris_mesafe_m kolonuna yazılır.
    const uzakNot = !haftaSonu && mesafe !== null && mesafe > tolerans ? ` · ofis dışı: ${mesafe}m` : ''
    // Not metni hafta sonunu AYIRT EDER: bordroya bakan kişi 'fazla' kaydın
    // akşam mesaisinden mi hafta sonundan mı geldiğini görsün.
    const notMetni = haftaSonu
      ? 'Hafta sonu mesaisi'
      : tip === 'fazla'
        ? (uzakNot ? `Fazla mesai${uzakNot}` : null)
        : (uzakNot ? `Ofis dışı: ${mesafe}m` : null)
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
