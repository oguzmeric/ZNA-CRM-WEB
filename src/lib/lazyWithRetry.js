import { lazy } from 'react'

// Vite + Vercel CDN: idle'dan sonra chunk fetch hang olabiliyor.
// Bu sarmalayıcı:
//  1) Native dynamic import'a 8sn timeout uygular
//  2) Hata olursa 1 kez retry yapar
//  3) Hâlâ fail ederse "yeni deploy var olabilir" ihtimaliyle bir kez sayfayı yeniler
const TIMEOUT_MS = 8000

const importWithTimeout = (factory, timeoutMs = TIMEOUT_MS) =>
  Promise.race([
    factory(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('chunk import timeout')), timeoutMs),
    ),
  ])

export function lazyWithRetry(factory, opts = {}) {
  const { retries = 1, autoReload = true } = opts
  return lazy(async () => {
    let lastError
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await importWithTimeout(factory)
      } catch (e) {
        lastError = e
        // Kısa bekleme sonrası tekrar dene
        await new Promise((r) => setTimeout(r, 300))
      }
    }
    if (autoReload && typeof window !== 'undefined') {
      // Tek seferlik reload — sonsuz döngü önle
      const ANAHTAR = 'lazy_reload_done'
      if (!sessionStorage.getItem(ANAHTAR)) {
        sessionStorage.setItem(ANAHTAR, '1')
        window.location.reload()
      } else {
        sessionStorage.removeItem(ANAHTAR)
      }
    }
    throw lastError
  })
}
