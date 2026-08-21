// Basit in-memory cache — sayfalar arası geçişleri hızlandırmak için.
// Aynı data'yı her sayfada yeniden Supabase'ten çekmek yerine TTL içindeyse
// hafızadan döndürüyoruz. Mutation (ekle/güncelle/sil) sırasında
// invalidate() ile ilgili key temizleniyor.
//
// TTL kısa (60sn default) — veri tazeliği ile performans dengesi. Ekran
// kritik olduğunda explicit `invalidate` çağrılıyor.

const store = new Map()                  // key -> { at: timestamp, value: any }
const pending = new Map()                // key -> Promise (dedupe concurrent fetches)
// 5 dk: SWR olduğundan kullanıcı hiç beklemez; TTL yalnız arka plan tazeleme
// sıklığını belirler. 60sn'de görüşmeler (~1.3MB) her gezintide yeniden iniyordu —
// bant + ana iş parçacığı (JSON parse) yükü menü geçişlerinde takılma hissi veriyordu.
// Kendi mutasyonların invalidate ile anında yansır; kritik ekranlar realtime.
const DEFAULT_TTL = 300_000              // 5 dk

// Invalidate token'ı: in-flight fetch resolve olduğunda karşılaştırır —
// değiştiyse store'a yazmaz (invalidate sonrası stale değer geri kaçmasın).
// ⚠️ 21.08: token artık KEY BAZLI. Eskiden tek global sayaçtı ve HERHANGİ bir
// key'in invalidate'i, süren TÜM fetch'lerin sonucunu çöpe attırıyordu —
// login fırtınasında kullanicilar listesi 3 kez indirilip 3 kez yazılamadı
// (açılış seli ölçümü). invalidateAll için global sayaç ayrıca durur.
const epochs = new Map()                 // key -> sayaç
let globalEpoch = 0
const epochOf = (key) => `${globalEpoch}:${epochs.get(key) || 0}`

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

  const baslatildigiEpoch = epochOf(key)
  const p = (async () => {
    try {
      const value = await fetcher()
      // Bu fetch başladıktan sonra BU KEY invalidate olduysa store'a yazma —
      // aksi halde stale değer cache'e geri kaçar.
      if (epochOf(key) === baslatildigiEpoch) {
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
  const baslatildigiEpoch = epochOf(key)
  const p = (async () => {
    try {
      const value = await fetcher()
      if (epochOf(key) === baslatildigiEpoch) store.set(key, { at: Date.now(), value })
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
  for (const k of keys) {
    epochs.set(k, (epochs.get(k) || 0) + 1)
    store.delete(k)
    pending.delete(k)
  }
}

/** Regex/prefix ile toplu temizle. */
export function invalidatePrefix(prefix) {
  // Süren fetch'ler pending'de — uyan HER key'in epoch'u artar ki in-flight
  // sonuç store'a geri yazılmasın; store'daki uyanlar da silinir.
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) { epochs.set(k, (epochs.get(k) || 0) + 1); store.delete(k) }
  }
  for (const k of pending.keys()) {
    if (k.startsWith(prefix)) { epochs.set(k, (epochs.get(k) || 0) + 1); pending.delete(k) }
  }
}

/** Komple temizle (örn. logout). */
export function invalidateAll() {
  globalEpoch++
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
