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
const DEFAULT_TIMEOUT_MS = 20000

// Aktif fetch'lerin AbortController'larını takip et — tab idle'dan dönüşte
// bunları toplu iptal edebilelim (askıda kalmış istekler pending Map'i
// kilitlemesin, sayfa geçişleri donmasın).
const activeControllers = new Set()

export function abortAllInFlight(reason = 'visibility-reset') {
  for (const controller of activeControllers) {
    try { controller.abort(new DOMException(reason, 'AbortError')) } catch {}
  }
  activeControllers.clear()
}

const fetchWithTimeout = (input, init = {}) => {
  // Çağıran kendi signal'ını geçiriyorsa ona dokunma
  if (init.signal) return fetch(input, init)

  const controller = new AbortController()
  activeControllers.add(controller)

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
