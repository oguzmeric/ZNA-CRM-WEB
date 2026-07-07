// Mobiltek 84.51.5.140:8881 HTTP stream'i için HTTPS path-based proxy.
// /functions/v1/mobiltek-stream/{PATH} → http://84.51.5.140:8881/{PATH}
//
// Yapar:
//  - m3u8 body içinde mutlak http:// URL'leri path proxy'sine rewrite (mixed content önlemek için)
//  - .m3u8 → Content-Type: application/vnd.apple.mpegurl (Safari native handoff)
//  - .ts → Content-Type: video/mp2t
//  - .flv → Content-Type: video/x-flv
//  - Manifest/segment için Range header forward etme (Mobiltek 416 dönebiliyor)

const MOBILTEK_HOST = 'http://84.51.5.140:8881'
const MOBILTEK_HOST_ESCAPED = 'http://84\\.51\\.5\\.140:8881'
const PROXY_PREFIX = '/functions/v1/mobiltek-stream'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Expose-Headers': 'content-length, content-range, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  let sub = url.pathname
  if (sub.startsWith(PROXY_PREFIX)) sub = sub.slice(PROXY_PREFIX.length)
  if (sub.startsWith('/')) sub = sub.slice(1)

  if (!sub) {
    return new Response(JSON.stringify({ hata: 'path gerekli, örn: /1/860.../hls.m3u8' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const targetUrl = `${MOBILTEK_HOST}/${sub}${url.search}`
  const isM3u8 = sub.endsWith('.m3u8') || sub.includes('.m3u8?')
  const isTs = sub.endsWith('.ts') || sub.includes('.ts?')
  const isFlv = sub.endsWith('.flv') || sub.includes('.flv?')

  try {
    const upstreamHeaders: Record<string, string> = {}
    // Range header — HLS manifest/segment veya FLV live için upstream desteklemez, 416 riski var
    // Sadece diğer içerikler (mp4 seek vs.) için forward et
    const range = req.headers.get('range')
    if (range && !isM3u8 && !isTs && !isFlv) upstreamHeaders['Range'] = range

    const upstream = await fetch(targetUrl, { method: 'GET', headers: upstreamHeaders })

    const passHeaders: Record<string, string> = { ...corsHeaders }
    const upstreamCt = upstream.headers.get('content-type')

    // MIME type override — upstream Mobiltek text/plain vs. octet-stream dönebiliyor
    if (isM3u8) passHeaders['Content-Type'] = 'application/vnd.apple.mpegurl'
    else if (isTs) passHeaders['Content-Type'] = 'video/mp2t'
    else if (isFlv) passHeaders['Content-Type'] = 'video/x-flv'
    else if (upstreamCt) passHeaders['Content-Type'] = upstreamCt

    // Content-Length — m3u8 rewrite ederse artık geçersiz, çıkar. Diğerleri forward.
    if (!isM3u8) {
      const cl = upstream.headers.get('content-length')
      if (cl) passHeaders['Content-Length'] = cl
    }
    const cr = upstream.headers.get('content-range')
    if (cr) passHeaders['Content-Range'] = cr

    console.log(`[mobiltek-stream] ${sub} → ${upstream.status} (upstream ct: ${upstreamCt || 'n/a'})`)

    // m3u8 body içinde mutlak URL'leri proxy path'ine rewrite et
    if (isM3u8 && upstream.ok) {
      const text = await upstream.text()
      const rewritten = text
        // Mutlak URL'ler: http://84.51.5.140:8881/xxx → /functions/v1/mobiltek-stream/xxx
        .replace(new RegExp(`${MOBILTEK_HOST_ESCAPED}/`, 'g'), `${PROXY_PREFIX}/`)
        // Absolute path'ler (nadir ama olası): /1/xxx → /functions/v1/mobiltek-stream/1/xxx
        // (satır başı veya yeni satırdan sonra / ile başlayanlar, http değil)
        .replace(/(^|\n)\/([^\/])/g, (_, p1, p2) => `${p1}${PROXY_PREFIX}/${p2}`)
      return new Response(rewritten, { status: upstream.status, headers: passHeaders })
    }

    // Diğer içerikler stream olarak forward
    return new Response(upstream.body, { status: upstream.status, headers: passHeaders })
  } catch (e: any) {
    console.error(`[mobiltek-stream] fetch fail:`, e?.message)
    return new Response(JSON.stringify({ hata: e?.message || 'proxy hata' }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
