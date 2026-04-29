import { lazy } from 'react'

// Vite + Vercel CDN: idle'dan sonra chunk fetch hang olabiliyor.
// Bu sarmalayıcı:
//  1) Native dynamic import'a 8sn timeout uygular
//  2) Hata olursa 1 kez retry yapar
//  3) Hâlâ fail ederse "yeni deploy var olabilir" ihtimaliyle bir kez sayfayı yeniler
const TIMEOUT_MS = 5000

const importWithTimeout = (factory, timeoutMs = TIMEOUT_MS) =>
  Promise.race([
    factory(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('chunk import timeout')), timeoutMs),
    ),
  ])

// Reload bayrağını birden fazla pencere/sekme arasında paylaşmasın diye
// pencereye özel sessionStorage flag'i. 30sn sonra otomatik temizlenir
// ki kullanıcı sonradan başka chunk açmak istediğinde tekrar reload yapabilsin.
const RELOAD_KEY = 'lazy_reload_at'
const RELOAD_COOLDOWN_MS = 30_000

const tekSeferlikReload = () => {
  if (typeof window === 'undefined') return false
  try {
    const son = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
    if (Date.now() - son < RELOAD_COOLDOWN_MS) {
      // Son 30sn içinde zaten reload yaptık — sonsuz döngü olmasın
      return false
    }
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
    window.location.reload()
    return true
  } catch {
    return false
  }
}

export function lazyWithRetry(factory, opts = {}) {
  const { retries = 1, autoReload = true } = opts
  return lazy(async () => {
    let lastError
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await importWithTimeout(factory)
      } catch (e) {
        lastError = e
        console.warn('[lazyWithRetry] chunk fail attempt', attempt + 1, '/', retries + 1, e?.message || e)
        await new Promise((r) => setTimeout(r, 250))
      }
    }
    if (autoReload && tekSeferlikReload()) {
      // Reload tetiklendi — bu Promise hiç resolve olmayacak (sayfa değişiyor)
      return new Promise(() => {})
    }
    throw lastError
  })
}
