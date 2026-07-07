// Mobiltek HTTP stream'i HTTPS proxy'lemek için basit edge fn.
// Kullanım: /functions/v1/mobiltek-stream?url=<encoded_http_url>
// Yalnızca api.mobiltek.com.tr ve 84.51.5.140 host'lara izin verir.

const ALLOWED_HOSTS = new Set(['api.mobiltek.com.tr', '84.51.5.140'])

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Expose-Headers': 'content-length, content-range',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const target = url.searchParams.get('url')
  if (!target) {
    return new Response(JSON.stringify({ hata: 'url param gerekli' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let targetUrl: URL
  try {
    targetUrl = new URL(target)
  } catch {
    return new Response(JSON.stringify({ hata: 'geçersiz url' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!ALLOWED_HOSTS.has(targetUrl.hostname)) {
    return new Response(JSON.stringify({ hata: 'izinsiz host: ' + targetUrl.hostname }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const upstreamHeaders: Record<string, string> = {}
    const range = req.headers.get('range')
    if (range) upstreamHeaders['Range'] = range

    const upstream = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: upstreamHeaders,
    })

    const passHeaders: Record<string, string> = { ...corsHeaders }
    const ct = upstream.headers.get('content-type')
    if (ct) passHeaders['Content-Type'] = ct
    const cl = upstream.headers.get('content-length')
    if (cl) passHeaders['Content-Length'] = cl
    const cr = upstream.headers.get('content-range')
    if (cr) passHeaders['Content-Range'] = cr

    // m3u8 içeriğinde absolute http:// URL'leri varsa proxy'ye çevir
    if (ct && (ct.includes('mpegurl') || targetUrl.pathname.endsWith('.m3u8'))) {
      const text = await upstream.text()
      const proxied = text.replace(
        /http:\/\/(?:84\.51\.5\.140|api\.mobiltek\.com\.tr)[^\s"'\n]*/g,
        (match) => {
          const fnUrl = `${url.origin}/functions/v1/mobiltek-stream?url=${encodeURIComponent(match)}`
          return fnUrl
        }
      )
      return new Response(proxied, {
        status: upstream.status,
        headers: { ...passHeaders, 'Content-Type': ct || 'application/vnd.apple.mpegurl' },
      })
    }

    // Diğer içerikler (ts segments, mp4 vs.) — stream olarak pas
    return new Response(upstream.body, {
      status: upstream.status,
      headers: passHeaders,
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ hata: e?.message || 'proxy hata' }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
