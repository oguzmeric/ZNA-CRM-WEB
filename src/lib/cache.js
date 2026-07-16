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

// Invalidate token'ı: her invalidate çağrısı bunu artırır. In-flight fetch
// resolve olduğunda token'ı karşılaştırır — değiştiyse store'a yazmaz.
// Race fix: invalidatePrefix sonra in-flight fetch eski değeri yazmasın.
let epoch = 0

/**
 * Cache'li fetch. Aynı anahtar için son ttl ms içinde yanıt varsa onu döndürür.
 * Paralel çağrılar aynı promise'i paylaşır (dedupe).
 *
 * NOT: Boş array sonuçları çok kısa TTL (3sn) ile cache edilir — race
 * condition senaryosunda (auth henüz hazır değilken RLS 0 satır döner)
 * 60 saniye boyunca "boş veri" zehirlenmesi olmasın.
 */
const EMPTY_TTL = 3_000  // boş array dönüşleri için

export async function cached(key, fetcher, ttl = DEFAULT_TTL) {
  const now = Date.now()
  const hit = store.get(key)
  if (hit) {
    const bos = Array.isArray(hit.value) && hit.value.length === 0
    const effTtl = bos ? EMPTY_TTL : ttl
    if (now - hit.at < effTtl) return hit.value
    // STALE-WHILE-REVALIDATE: süresi dolmuş ama elimizde değer var —
    // sayfayı BEKLETME: eski değeri anında döndür, arkada sessizce tazele.
    // (Boş array'ler hariç — boş veri zehirlenmesi stale servis edilmez.)
    if (!bos) {
      arkaPlandaTazele(key, fetcher)
      return hit.value
    }
  }

  // Aynı key için yürütülen fetch varsa ona bağlan
  if (pending.has(key)) return pending.get(key)

  const baslatildigiEpoch = epoch
  const p = (async () => {
    try {
      const value = await fetcher()
      // Bu fetch başladıktan sonra invalidate olduysa store'a yazma —
      // aksi halde stale değer cache'e geri kaçar.
      if (epoch === baslatildigiEpoch) {
        store.set(key, { at: Date.now(), value })
      }
      return value
    } finally {
      pending.delete(key)
    }
  })()
  pending.set(key, p)
  return p
}

// Arka plan tazeleme — sonucu beklenmez; epoch değiştiyse (invalidate olduysa)
// stale değer cache'e geri yazılmaz. pending dedupe'u paylaşır.
function arkaPlandaTazele(key, fetcher) {
  if (pending.has(key)) return
  const baslatildigiEpoch = epoch
  const p = (async () => {
    try {
      const value = await fetcher()
      if (epoch === baslatildigiEpoch) store.set(key, { at: Date.now(), value })
      return value
    } catch (_) {
      return undefined // sessiz — eldeki stale değer zaten servis edildi
    } finally {
      pending.delete(key)
    }
  })()
  pending.set(key, p)
}

/** Bir veya birden fazla key'i temizle. */
export function invalidate(...keys) {
  epoch++
  for (const k of keys) {
    store.delete(k)
    pending.delete(k)
  }
}

/** Regex/prefix ile toplu temizle. */
export function invalidatePrefix(prefix) {
  epoch++
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k)
  }
  for (const k of pending.keys()) {
    if (k.startsWith(prefix)) pending.delete(k)
  }
}

/** Komple temizle (örn. logout). */
export function invalidateAll() {
  epoch++
  store.clear()
  pending.clear()
}

/**
 * Değerleri SİLMEDEN bayatlat — idle dönüşü için.
 * invalidateAll idle dönüşünde cache'i tamamen boşaltıyordu: kullanıcı menüye
 * tıkladığında sayfa SIFIRDAN fetch bekliyordu (ölü bağlantıda 5-8sn boş ekran).
 * expireAll ise TTL damgasını sıfırlar: stale-while-revalidate eski veriyi
 * ANINDA gösterir, arkada sessizce tazeler. Kullanıcı asla boş ekran görmez.
 */
export function expireAll() {
  for (const v of store.values()) v.at = 0
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
