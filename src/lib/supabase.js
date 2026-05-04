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
