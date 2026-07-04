// Mesai QR — HMAC üretim/doğrulama + Haversine mesafe.
// Payload biçimi: ZNA-MESAI:v1:{ofisId}:{hmac16}
// hmac16 = HMAC-SHA256(secret, "v1|{ofisId}") base64url ilk 16 char.

export async function hmacKisa(mesaj: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(mesaj))
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 16)
}

export function payloadUret(ofisId: string, hmac16: string): string {
  return `ZNA-MESAI:v1:${ofisId}:${hmac16}`
}

export function payloadParcala(payload: string): { ofisId: string; hmac16: string } | null {
  const m = payload.match(/^ZNA-MESAI:v1:([^:]+):([A-Za-z0-9_-]{16})$/)
  return m ? { ofisId: m[1], hmac16: m[2] } : null
}

export async function payloadDogrula(payload: string, secret: string): Promise<{ ok: boolean; ofisId?: string }> {
  const p = payloadParcala(payload)
  if (!p) return { ok: false }
  const beklenen = await hmacKisa(`v1|${p.ofisId}`, secret)
  return beklenen === p.hmac16 ? { ok: true, ofisId: p.ofisId } : { ok: false }
}

export function haversineMetre(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}
