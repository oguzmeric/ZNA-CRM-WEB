// Basit in-memory cache — sayfalar arası geçişleri hızlandırmak için.
// Aynı data'yı her sayfada yeniden Supabase'ten çekmek yerine TTL içindeyse
// hafızadan döndürüyoruz. Mutation (ekle/güncelle/sil) sırasında
// invalidate() ile ilgili key temizleniyor.
//
// TTL kısa (60sn default) — veri tazeliği ile performans dengesi. Ekran
// kritik olduğunda explicit `invalidate` çağrılıyor.

const store = new Map()                  // key -> { at: timestamp, value: any }
const pending = new Map()                // key -> Promise (dedupe concurrent fetches)
const DEFAULT_TTL = 60_000               // 60 sn

/**
 * Cache'li fetch. Aynı anahtar için son ttl ms içinde yanıt varsa onu döndürür.
 * Paralel çağrılar aynı promise'i paylaşır (dedupe).
 */
export async function cached(key, fetcher, ttl = DEFAULT_TTL) {
  const now = Date.now()
  const hit = store.get(key)
  if (hit && now - hit.at < ttl) return hit.value

  // Aynı key için yürütülen fetch varsa ona bağlan
  if (pending.has(key)) return pending.get(key)

  const p = (async () => {
    try {
      const value = await fetcher()
      store.set(key, { at: Date.now(), value })
      return value
    } finally {
      pending.delete(key)
    }
  })()
  pending.set(key, p)
  return p
}

/** Bir veya birden fazla key'i temizle. */
export function invalidate(...keys) {
  for (const k of keys) {
    store.delete(k)
    pending.delete(k)
  }
}

/** Regex/prefix ile toplu temizle. */
export function invalidatePrefix(prefix) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k)
  }
  for (const k of pending.keys()) {
    if (k.startsWith(prefix)) pending.delete(k)
  }
}

/** Komple temizle (örn. logout). */
export function invalidateAll() {
  store.clear()
  pending.clear()
}

// Debug için — console.debug('cache', cacheStats())
export function cacheStats() {
  const now = Date.now()
  return Array.from(store.entries()).map(([k, v]) => ({
    key: k,
    ageMs: now - v.at,
    size: Array.isArray(v.value) ? v.value.length : '?',
  }))
}
