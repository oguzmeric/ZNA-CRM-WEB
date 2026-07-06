import { useEffect, useRef } from 'react'

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const SITE_KEY = '0x4AAAAAADwhJjgYwoQKS4xV'

let scriptYuklendi = false
let scriptPromise = null

function scriptYukle() {
  if (scriptYuklendi) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve()
    if (window.turnstile) { scriptYuklendi = true; return resolve() }
    const s = document.createElement('script')
    s.src = SCRIPT_URL
    s.async = true
    s.defer = true
    s.onload = () => { scriptYuklendi = true; resolve() }
    s.onerror = () => reject(new Error('Turnstile script yüklenemedi'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

/**
 * Cloudflare Turnstile widget.
 *
 * @param {(token: string | null) => void} onToken  Token değişince (verify/expire/error) çağrılır
 * @param {'light'|'dark'|'auto'} tema
 */
export default function TurnstileWidget({ onToken, tema = 'auto' }) {
  const kutu = useRef(null)
  const widgetId = useRef(null)

  useEffect(() => {
    let iptal = false
    scriptYukle().then(() => {
      if (iptal || !window.turnstile || !kutu.current) return
      widgetId.current = window.turnstile.render(kutu.current, {
        sitekey: SITE_KEY,
        theme: tema,
        callback: (token) => onToken?.(token),
        'expired-callback': () => onToken?.(null),
        'error-callback': () => onToken?.(null),
      })
    }).catch((e) => console.warn('[Turnstile] yükleme hatası:', e))
    return () => {
      iptal = true
      if (widgetId.current && window.turnstile) {
        try { window.turnstile.remove(widgetId.current) } catch { /* ignore */ }
      }
    }
  }, [onToken, tema])

  return <div ref={kutu} style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }} />
}
