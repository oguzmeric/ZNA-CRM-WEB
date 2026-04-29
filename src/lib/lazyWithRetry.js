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

// Idle sonrası HTTP/2 bağlantısı askıda kalan chunk fetch'leri için reload =
// browser'ın connection pool'unu yeniler. Native import()'i Promise.race ile
// abort edemediğimiz için, timeout sonrası reload tek güvenilir yol.
// Cooldown sadece flash-loop önler: ilk reload'dan 5sn sonra ikinci reload
// serbest. (Önceki 30sn fazla agresifti, kullanıcıyı kilitleyebiliyordu.)
const RELOAD_KEY = 'lazy_reload_at'
const RELOAD_COOLDOWN_MS = 5_000

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
        // Retry beklemesi: tarayıcının HTTP/2 bağlantısını yenilemesine fırsat ver
        await new Promise((r) => setTimeout(r, 1000))
      }
    }
    if (autoReload && tekSeferlikReload()) {
      // Reload tetiklendi — bu Promise hiç resolve olmayacak (sayfa değişiyor)
      return new Promise(() => {})
    }
    throw lastError
  })
}
