// Mobiltek 84.51.5.140:8881 HTTP stream'i için HTTPS path-based proxy.
// /functions/v1/mobiltek-stream/{PATH} → http://84.51.5.140:8881/{PATH}
// Böylece m3u8 içindeki göreceli segment URL'leri (chunk1.ts) hls.js için
// aynı base path altında kalır ve otomatik çözümlenir.

const MOBILTEK_HOST = 'http://84.51.5.140:8881'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Expose-Headers': 'content-length, content-range, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const prefix = '/functions/v1/mobiltek-stream'
  let sub = url.pathname
  if (sub.startsWith(prefix)) sub = sub.slice(prefix.length)
  if (sub.startsWith('/')) sub = sub.slice(1)

  if (!sub) {
    return new Response(JSON.stringify({ hata: 'path gerekli, örn: /1/860.../hls.m3u8' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const targetUrl = `${MOBILTEK_HOST}/${sub}${url.search}`

  try {
    const upstreamHeaders: Record<string, string> = {}
    const range = req.headers.get('range')
    if (range) upstreamHeaders['Range'] = range

    const upstream = await fetch(targetUrl, { method: 'GET', headers: upstreamHeaders })

    const passHeaders: Record<string, string> = { ...corsHeaders }
    const ct = upstream.headers.get('content-type')
    if (ct) passHeaders['Content-Type'] = ct
    const cl = upstream.headers.get('content-length')
    if (cl) passHeaders['Content-Length'] = cl
    const cr = upstream.headers.get('content-range')
    if (cr) passHeaders['Content-Range'] = cr

    console.log(`[mobiltek-stream] ${sub} → ${upstream.status} ${ct || ''}`)

    return new Response(upstream.body, { status: upstream.status, headers: passHeaders })
  } catch (e: any) {
    console.error(`[mobiltek-stream] fetch fail:`, e?.message)
    return new Response(JSON.stringify({ hata: e?.message || 'proxy hata' }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
