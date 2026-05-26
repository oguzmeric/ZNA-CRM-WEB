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
// 8sn — idle dönüşünde HTTP/2 keep-alive ölmüş olabilir, hızlı timeout'la
// kullanıcıyı 20sn değil 8sn'de kurtaralım. Page-level useEffect .finally
// setYukleniyor(false) yapacak, kullanıcı menüden tekrar tıklayabilir
// (browser yeni HTTP bağlantısı kurar).
const DEFAULT_TIMEOUT_MS = 8000

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

const fetchWithTimeout = (input, init = {}) => {
  // Çağıran kendi signal'ını geçiriyorsa ona dokunma
  if (init.signal) return fetch(input, init)

  // Storage istekleri timeout'tan muaf — büyük dosya transferi için
  if (isStorageRequest(input)) return fetch(input, init)

  const controller = new AbortController()
  activeControllers.set(controller, Date.now())

  const timer = setTimeout(() => {
    try {
      controller.abort(new DOMException('Request timed out', 'TimeoutError'))
    } catch { controller.abort() }
  }, DEFAULT_TIMEOUT_MS)

  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer)
    activeControllers.delete(controller)
  })
}

// =====================================================================
// Çoklu hesap modu — geliştirici/test için sekme bazlı izole session.
//
// Normalde Supabase tüm sekmeler için aynı localStorage'i paylaşır:
// bir sekmede login → diğer sekmeler de aynı kullanıcıya geçer.
//
// URL'de ?multi=1 varsa veya localStorage'da 'crm_multi_mode'=true
// flag'i ayarlıysa, her sekme kendi sessionStorage tabId'sini kullanarak
// localStorage'da kendine özel bir anahtarda session saklar. Böylece 3
// sekmede 3 farklı kullanıcıyla giriş yapılabilir.
//
// Production normal kullanıcı üzerinde etki: SIFIR (flag yoksa eski yol).
// =====================================================================
function multiHesapAnahtariUret() {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const urlFlag = url.searchParams.get('multi') === '1'
  let kalici = false
  try { kalici = window.localStorage.getItem('crm_multi_mode') === 'true' } catch {}
  // URL'de geldiyse kalıcılaştır — bir kez ?multi=1 ile aç, sonraki sekmeler de izole olsun
  if (urlFlag && !kalici) {
    try { window.localStorage.setItem('crm_multi_mode', 'true') } catch {}
    kalici = true
  }
  if (!kalici) return null
  // Sekme bazlı tabId — sessionStorage sekmeyle aynı yaşar, reload'da kalır
  let tabId = null
  try { tabId = window.sessionStorage.getItem('crm_tab_id') } catch {}
  if (!tabId) {
    tabId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
    try { window.sessionStorage.setItem('crm_tab_id', tabId) } catch {}
  }
  return `sb-crm-${tabId}-auth`
}

const multiStorageKey = multiHesapAnahtariUret()

// lock: false → Web Locks API devre dışı
// Aksi halde başka tab/oturum kilidi bırakmadıysa auth çağrıları askıda kalabiliyor.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    lock: async (_name, _acquireTimeout, fn) => fn(),
    ...(multiStorageKey ? { storageKey: multiStorageKey } : {}),
  },
  global: {
    fetch: fetchWithTimeout,
  },
})

// Geliştirici aracı: console'dan multi modu kapatmak için
if (typeof window !== 'undefined') {
  window.__crmMultiKapat = () => {
    try {
      window.localStorage.removeItem('crm_multi_mode')
      window.sessionStorage.removeItem('crm_tab_id')
      // İzole storage anahtarını da temizle
      const tabKey = multiStorageKey
      if (tabKey) {
        try { window.localStorage.removeItem(tabKey) } catch {}
      }
      console.info('[crm] Çoklu hesap modu kapatıldı. Sayfayı yenileyin.')
    } catch (e) { console.warn(e) }
  }
}
