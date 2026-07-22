// Origin whitelist için ortak CORS helper.
// Amaç: Access-Control-Allow-Origin '*' → whitelist'e daralt.
// Whitelist dışı origin gelirse response'a Origin header'ı KOYMAZ →
// browser cross-origin fetch'i bloklar. Server tarafında requests yine
// geçer (CORS sadece browser-level koruma).

const ALLOW_LIST = [
  'https://erp.znateknoloji.com',        // prod — CRM/ERP (yeni ana adres)
  'https://talep.znateknoloji.com',      // prod — eski adres; müşteriye gönderilmiş
                                         // /p/:token ve /davet/:token linkleri burada
                                         // yaşadığı için taşımadan sonra da AÇIK kalmalı
  'https://www.znateknoloji.com',        // olası kurumsal alt-domain
  'https://znateknoloji.com',
  'http://localhost:3000',                // vite dev
  'http://localhost:5173',                // vite alternatif
  'http://localhost:4173',                // vite preview
]

// Vercel preview domainleri (talep-git-*.oguzmericc.vercel.app gibi)
const ALLOW_REGEX = [
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
]

export function corsHeadersFor(req: Request, extraHeaders: string[] = []): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const izinli = ALLOW_LIST.includes(origin) || ALLOW_REGEX.some(r => r.test(origin))
  const headers: Record<string, string> = {
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': ['authorization', 'x-client-info', 'apikey', 'content-type', ...extraHeaders].join(', '),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  }
  if (izinli && origin) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Credentials'] = 'true'
  }
  return headers
}
