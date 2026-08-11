import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// === Fetch timeout ===
// Supabase client bazı durumlarda (ağ kesintisi, edge cache, proxy takılması)
// yanıtsız kalıyor ve Promise hiç resolve/reject etmiyordu. Bu durumda
// sayfalarımızdaki .finally(() => setYukleniyor(false)) çalışmıyor, ekran
// sonsuza kadar "Yükleniyor…"da takılıyordu. 20 saniyelik sert timeout
// koyuyoruz — istek uzun sürerse AbortError'la rejekte olur, .catch çalışır,
// .finally setYukleniyor(false) yapar. Kullanıcı deneyimi: en fazla 20sn
// bekleme sonrası empty state veya hata toast'u gelir.
// 5sn ilk deneme + GET'lerde otomatik 1 tekrar (8sn): idle dönüşünde HTTP/2
// keep-alive ölmüşse ilk istek askıda kalır. Eskiden 8sn bekleyip TimeoutError
// ile BOŞ EKRAN kalıyordu, kullanıcı elle tekrar tıklamak zorundaydı
// ("menüye tıklayınca 8-10sn bekliyoruz" şikayetinin ana sebebi). Artık ilk
// deneme 5sn'de kesilir ve GET istekleri otomatik yeniden denenir — retry
// tarayıcıda taze bağlantı kurar, tipik olarak ~1sn'de veri gelir.
const DEFAULT_TIMEOUT_MS = 5000
const RETRY_TIMEOUT_MS = 8000
// Yazma istekleri tekrar denenmediği için ayrı ve geniş bütçe (aşağıda gerekçe).
const MUTASYON_TIMEOUT_MS = 25000

// Aktif fetch'leri başlangıç timestamp'i ile takip et.
// abortStaleInFlight ile sadece eski (>= eşik) olanları iptal ediyoruz —
// yeni başlayan fetch'leri öldürmüyoruz.
// `korumali` işareti: edge function çağrıları bu süpürmelerden muaftır
// (aşağıda gerekçesi yazılı).
const activeControllers = new Map() // controller -> { startedAt, korumali }

/**
 * Belirli süreden eski hanging request'leri iptal et.
 * Default 5sn — tıklamayı tetikleyen yeni fetch'leri (taze) bırakır,
 * idle dönüşünde askıda kalanları (eski) atar.
 *
 * ⚠️ Korumalı (edge function) istekler ATLANIR: bunlar 5sn'i normalde aşar,
 * "askıda kalmış" değildir. Kendi 30sn'lik bütçeleri var.
 */
export function abortStaleInFlight(maxAgeMs = 5000, reason = 'idle-stale') {
  const now = Date.now()
  for (const [controller, kayit] of activeControllers) {
    if (kayit.korumali) continue
    if (now - kayit.startedAt >= maxAgeMs) {
      try { controller.abort(new DOMException(reason, 'AbortError')) } catch {}
      activeControllers.delete(controller)
    }
  }
}

/**
 * Yerel oturum jetonunu KESİN sil.
 * signOut() ağ yüzünden tamamlanmazsa supabase token'ı storage'da bırakır;
 * kullanıcı çıkış yaptığını sanır ama sayfa yenilenince geri girmiş olur.
 * Çıkışın ağa bağımlı olmayan garantisi burasıdır.
 */
export function yerelOturumTemizle() {
  const temizle = (depo) => {
    try {
      for (const anahtar of Object.keys(depo)) {
        if (anahtar.startsWith('sb-') && anahtar.endsWith('-auth-token')) depo.removeItem(anahtar)
      }
    } catch {}
  }
  temizle(localStorage)
  temizle(sessionStorage)   // sekme-izole oturum modu buraya yazıyor
}

/**
 * Tümünü iptal et (sayfa kapanırken, idle kurtarmada vs.).
 *
 * `korumaliDahil` VARSAYILAN OLARAK false: idle/focus kurtarmaları takılmış
 * tablo sorgularını temizlemek içindir, çalışmakta olan edge function
 * çağrısını öldürmemelidir. Çıkışta (logout) true geçilir — orada amaç
 * gerçekten her şeyi kesmek, yanıtların yeni kullanıcıya sızmasını önlemek.
 */
export function abortAllInFlight(reason = 'visibility-reset', korumaliDahil = false) {
  for (const [controller, kayit] of activeControllers) {
    if (!korumaliDahil && kayit.korumali) continue
    try { controller.abort(new DOMException(reason, 'AbortError')) } catch {}
    activeControllers.delete(controller)
  }
}

// Storage upload/download path'leri büyük dosyalar için 8sn'i kolayca aşar.
// Bu istekleri timeout dışında bırak — yüklemeyi natural completion'a bırak.
const isStorageRequest = (input) => {
  try {
    const url = typeof input === 'string' ? input : (input?.url || '')
    return url.includes('/storage/v1/')
  } catch { return false }
}

// Edge function çağrıları 5sn'lik tablo-sorgusu bütçesine SIĞMAZ: fonksiyon
// dış bir API'yi (Mobiltek, NetGSM, Resend, Groq…) beklerken sürenin çoğu
// orada geçer + soğuk başlangıç eklenir.
// 04.08 canlı vaka: /mobiltek sayfası araçları göstermiyordu. Proxy logunda
// Mobiltek çağrısı 3,4-3,8 sn ölçülmüş; soğuk başlangıçla 5 sn aşılıyor,
// istemci isteği kesiyor, edge fn log satırını yazamadan ölüyor (bu yüzden
// logda hiç iz yoktu). functions.invoke POST olduğu için otomatik tekrar da
// devreye girmiyordu → sessizce boş liste.
// Bu istekler ayrı ve geniş bir bütçeye alınır; yine de sonsuz asılı kalmaz.
const FONKSIYON_TIMEOUT_MS = 30000
const isFunctionsRequest = (input) => {
  try {
    const url = typeof input === 'string' ? input : (input?.url || '')
    return url.includes('/functions/v1/')
  } catch { return false }
}

// ⚠️ EDGE FONKSİYONLARINA ÖZEL BAŞLIK GÖNDERİLEMEZ — CORS TUZAĞI
// Tarayıcı, standart dışı bir başlık taşıyan cross-origin POST'tan önce
// OPTIONS ön kontrolü yapar. Sunucu o başlığı Access-Control-Allow-Headers
// listesinde saymazsa isteği HİÇ GÖNDERMEZ.
// 04.08 canlı vaka: veri koruması için eklenen 'x-zna-istemci' imzası
// (global.headers) tüm /functions/v1/ çağrılarını kırdı — 32 edge
// fonksiyonunun hiçbiri bu başlığı listesinde saymıyor. Belirti: "Failed to
// send a request to the Edge Function", sunucu tarafı tamamen sağlamken
// (gerçek oturumla curl → HTTP 200) ve loglarda hiç iz yokken.
// İmzanın işi zaten PostgREST tarafında (script tespiti); fonksiyon
// çağrılarında hiçbir karşılığı yok, bu yüzden burada ayıklanıyor.
const OZEL_BASLIKLAR = ['x-zna-istemci']

const baslikAyikla = (init) => {
  try {
    const h = init?.headers
    if (!h) return init
    if (typeof Headers !== 'undefined' && h instanceof Headers) {
      const yeni = new Headers(h)
      for (const ad of OZEL_BASLIKLAR) yeni.delete(ad)
      return { ...init, headers: yeni }
    }
    if (Array.isArray(h)) {
      return {
        ...init,
        headers: h.filter(([k]) => !OZEL_BASLIKLAR.includes(String(k).toLowerCase())),
      }
    }
    const yeni = { ...h }
    for (const k of Object.keys(yeni)) {
      if (OZEL_BASLIKLAR.includes(k.toLowerCase())) delete yeni[k]
    }
    return { ...init, headers: yeni }
  } catch { return init }
}

// Tek deneme — verilen süre içinde bitmezse TimeoutError ile abort
const zamanAsimliDeneme = (input, init, ms, korumali = false) => {
  const controller = new AbortController()
  activeControllers.set(controller, { startedAt: Date.now(), korumali })

  const timer = setTimeout(() => {
    try {
      controller.abort(new DOMException('Request timed out', 'TimeoutError'))
    } catch { controller.abort() }
  }, ms)

  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer)
    activeControllers.delete(controller)
  })
}

// === Veri erişim sayacı — GÖZETİM FAZI (mig 259, 03-04.08 kararları) =======
// Amaç: kim, hangi tablodan, kaç satır çekiyor — günlük özet DB'ye yazılır,
// eşik aşımında yönetime bildirim düşer (bu fazda KİLİT YOK). PostgREST
// okumaları salt-okunur transaction'da çalıştığı için log RLS'ten YAZILAMAZ;
// tek yol bu istemci sayacı + VOLATILE rpc. Sayaç best-effort: uygulamayı
// asla yavaşlatamaz/bozamaz — satır sayısı Content-Range BAŞLIĞINDAN okunur
// (gövdeye dokunulmaz), gönderim 30 sn'de bir tek RPC'dir.
let veriSayac = { istek: 0, satir: 0, enBuyuk: 0, tablolar: {} }

const veriErisimSay = (input, res) => {
  try {
    const url = typeof input === 'string' ? input : (input?.url || '')
    const i = url.indexOf('/rest/v1/')
    if (i < 0 || !res?.ok) return
    const yol = url.slice(i + 9)
    // Kendi log RPC'miz sayılmaz (kendini besleyen döngü olmasın)
    if (yol.startsWith('rpc/veri_erisim_kaydet')) return
    const tablo = yol.split(/[?/]/)[0] || 'bilinmiyor'
    // PostgREST her listede "0-24/*" biçiminde Content-Range döndürür
    const cr = res.headers?.get?.('content-range')
    let satir = 0
    if (cr) {
      const m = cr.match(/^(\d+)-(\d+)/)
      if (m) satir = Number(m[2]) - Number(m[1]) + 1
    }
    veriSayac.istek += 1
    veriSayac.satir += satir
    if (satir > veriSayac.enBuyuk) veriSayac.enBuyuk = satir
    veriSayac.tablolar[tablo] = (veriSayac.tablolar[tablo] || 0) + satir
  } catch {}
}

const veriSayacFlush = async () => {
  const s = veriSayac
  if (!s.istek) return
  veriSayac = { istek: 0, satir: 0, enBuyuk: 0, tablolar: {} }
  try {
    // Oturum yoksa gönderme — RPC zaten uid'siz sessiz döner ama boşuna istek atma
    const { data } = await supabase.auth.getSession()
    if (!data?.session) return
    await supabase.rpc('veri_erisim_kaydet', {
      p_istek: s.istek, p_satir: s.satir, p_en_buyuk: s.enBuyuk, p_tablolar: s.tablolar,
    })
  } catch {} // log altyapısı uygulamayı asla bozamaz
}

const fetchWithTimeout = (input, init = {}) => {
  // Çağıran kendi signal'ını geçiriyorsa ona dokunma
  if (init.signal) return fetch(input, init)

  // Storage istekleri timeout'tan muaf — büyük dosya transferi için
  if (isStorageRequest(input)) return fetch(input, init)

  // Edge function çağrıları geniş bütçeyle (30sn) — tekrar denenmez:
  // çoğu fonksiyon yan etkili (mail/SMS gönderimi, kayıt yazımı) ve POST'un
  // tekrarı mükerrer iş üretir.
  //
  // ⭐ korumali=true — asıl mesele buydu: sekmeye dönüşte çalışan
  // abortStaleInFlight(5000) ve abortAllInFlight, 5sn'i aşan İSTEĞİ askıda
  // kalmış sayıp kesiyordu. Mobiltek proxy'si gerçek oturumla ölçüldüğünde
  // 3,7 sn sürüyor (HTTP 200, 8 araç) — yani sunucu sağlamken istek
  // tarayıcıda öldürülüyor, kullanıcı "araçları göremiyorum" diyordu.
  // Bu süpürmeler takılmış TABLO SORGULARI için; edge çağrısının uzun
  // sürmesi normaldir ve kendi bütçesi zaten var.
  if (isFunctionsRequest(input)) {
    return zamanAsimliDeneme(input, baslikAyikla(init), FONKSIYON_TIMEOUT_MS, true)
  }

  const method = (init.method || 'GET').toUpperCase()
  const mutasyon = method !== 'GET' && method !== 'HEAD'

  // ⚠️ MUTASYONLAR (POST/PATCH/PUT/DELETE) — 11.08.2026 mükerrer teklif olayı.
  // Bunlar tekrar DENENMEZ (tekrar = mükerrer kayıt), dolayısıyla bütçeleri
  // cömert olmalı. 5sn'de kesilen bir INSERT sunucuda TAMAMLANMIŞ olabilir:
  // abort yalnızca tarayıcının beklemesini keser, isteği geri almaz. Kullanıcı
  // "Request timed out" görüp "kaydedilmedi" sanıyor, tekrar basıyor ve ikinci
  // kayıt oluşuyordu. Aynı teklif 7+ kez kaydedildi.
  //
  // ⭐ korumali=true — edge çağrılarındakiyle aynı gerekçe: sekmeye dönüşteki
  // abortStaleInFlight(5000) süpürmesi, 5sn'i aşan bir INSERT'i "askıda kalmış"
  // sayıp kesiyordu. Yarıda kesilen mutasyon sunucuda işlenmiş olabilir; bu
  // süpürmeler takılmış OKUMA sorguları içindir, yan etkili yazma için değil.
  if (mutasyon) return zamanAsimliDeneme(input, init, MUTASYON_TIMEOUT_MS, true)

  const ilk = zamanAsimliDeneme(input, init, DEFAULT_TIMEOUT_MS)

  // Yalnız GET/HEAD tekrar denenir (idempotent). Yalnız TIMEOUT'ta:
  // abortStaleInFlight gibi bilinçli iptaller (AbortError) yeniden diriltilmez.
  return ilk.catch((err) => {
    if (err?.name === 'TimeoutError') {
      console.info('[fetch] timeout → otomatik tekrar:', typeof input === 'string' ? input.slice(0, 90) : '')
      return zamanAsimliDeneme(input, init, RETRY_TIMEOUT_MS)
    }
    throw err
  }).then((res) => { veriErisimSay(input, res); return res })
}

// lock: false → Web Locks API devre dışı
// Aksi halde başka tab/oturum kilidi bırakmadıysa auth çağrıları askıda kalabiliyor.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    lock: async (_name, _acquireTimeout, fn) => fn(),
  },
  global: {
    fetch: fetchWithTimeout,
    // UYGULAMA İMZASI (04.08) — script/otomasyon tespitinin temeli.
    // PostgREST bu başlığı `request.headers` GUC'una koyuyor; RLS içinden
    // okunabildiği CANLIDA doğrulandı. İkinci fazda kritik tablolara
    // "imzasız istek veri alamaz" kapısı bu başlıkla kurulacak — jetonu
    // kopyalayıp curl/Python ile çeken bir script bu başlığı bilmez.
    // ŞU AN SADECE GÖNDERİLİYOR, hiçbir yerde ZORUNLU DEĞİL: tüm cihazlar
    // güncellenmeden kapı açılırsa eski sürümler veri göremez hale gelir.
    headers: { 'x-zna-istemci': 'web' },
  },
})

// Sayaç dökümü: 30 sn'de bir + sekme arka plana geçerken (kapanışta veri
// kaybolmasın). globalThis bayrağı: dev HMR'de modül yeniden yüklenince
// ikinci bir zamanlayıcı kurulmasın.
if (typeof window !== 'undefined' && !globalThis.__veriSayacKuruldu) {
  globalThis.__veriSayacKuruldu = true
  setInterval(veriSayacFlush, 30000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') veriSayacFlush()
  })
}
