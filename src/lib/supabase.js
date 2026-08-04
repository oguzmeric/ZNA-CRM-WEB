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

// Aktif fetch'leri başlangıç timestamp'i ile takip et.
// abortStaleInFlight ile sadece eski (>= eşik) olanları iptal ediyoruz —
// yeni başlayan fetch'leri öldürmüyoruz.
const activeControllers = new Map() // controller -> startedAt

/**
 * Belirli süreden eski hanging request'leri iptal et.
 * Default 5sn — tıklamayı tetikleyen yeni fetch'leri (taze) bırakır,
 * idle dönüşünde askıda kalanları (eski) atar.
 */
export function abortStaleInFlight(maxAgeMs = 5000, reason = 'idle-stale') {
  const now = Date.now()
  for (const [controller, startedAt] of activeControllers) {
    if (now - startedAt >= maxAgeMs) {
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

// Geriye uyumluluk: tümünü iptal et (sayfa kapanırken vs.)
export function abortAllInFlight(reason = 'visibility-reset') {
  for (const controller of activeControllers.keys()) {
    try { controller.abort(new DOMException(reason, 'AbortError')) } catch {}
  }
  activeControllers.clear()
}

// Storage upload/download path'leri büyük dosyalar için 8sn'i kolayca aşar.
// Bu istekleri timeout dışında bırak — yüklemeyi natural completion'a bırak.
const isStorageRequest = (input) => {
  try {
    const url = typeof input === 'string' ? input : (input?.url || '')
    return url.includes('/storage/v1/')
  } catch { return false }
}

// Tek deneme — verilen süre içinde bitmezse TimeoutError ile abort
const zamanAsimliDeneme = (input, init, ms) => {
  const controller = new AbortController()
  activeControllers.set(controller, Date.now())

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

  const method = (init.method || 'GET').toUpperCase()
  const ilk = zamanAsimliDeneme(input, init, DEFAULT_TIMEOUT_MS)

  // Yalnız GET/HEAD tekrar denenir (idempotent — mutasyonlarda tekrar
  // duplicate kayıt riski). Yalnız TIMEOUT'ta: abortStaleInFlight gibi
  // bilinçli iptaller (AbortError) yeniden diriltilmez.
  if (method !== 'GET' && method !== 'HEAD') return ilk
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
