// Canlı kamera izleme modalı.
// Kullanım: seçili aracın kanal(lar)ını Mobiltek v2/cameras/{id}?channel=N ile çeker,
// dönen stream URL'sini <video> ile oynatır.
// Modal kapanınca /live/stop çağırır ve izleme log'unu kapatır.

import { useEffect, useRef, useState } from 'react'
import { X, Video, RefreshCw, AlertTriangle } from 'lucide-react'
import { canliKameraBaslat, canliKameraDurdur, izlemeLogBaslat, izlemeLogBitir } from '../services/mobiltekService'
import { useAuth } from '../context/AuthContext'

const KANAL_SEC = [1, 2]

export default function CanliKameraModal({ acik, kapat, arac }) {
  const { kullanici } = useAuth()
  const [kanal, setKanal] = useState(1)
  const [streamUrl, setStreamUrl] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState(null)
  const [logId, setLogId] = useState(null)
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const flvRef = useRef(null)

  const baslat = async (secilenKanal) => {
    if (!arac?.id) return
    setYukleniyor(true)
    setHata(null)
    setStreamUrl(null)

    // Log başlat
    const yeniLog = await izlemeLogBaslat({
      aracId: arac.id,
      aracPlaka: arac.plateNo || arac.label,
      kanal: secilenKanal,
      kullaniciId: kullanici?.id,
    })
    setLogId(yeniLog)

    // Önce olası açık stream'leri kapat (Kanal 1 ve 2 sırayla, race yaşamasın)
    for (const k of [1, 2]) {
      await canliKameraDurdur(arac.id, k).catch(() => null)
    }
    // 3 sn bekleme — Mobiltek device state reset olsun
    await new Promise(r => setTimeout(r, 3000))

    const cevap = await canliKameraBaslat(arac.id, secilenKanal)
    // yukleniyor state'i video 'canplay' event'inde kapatılıyor (aşağıda)

    if (!cevap) {
      setYukleniyor(false)
      setHata('Kamera başlatılamadı — kredensiyel/ağ sorunu olabilir.')
      return
    }

    // Mobiltek v2 response yapısı:
    // { code:1000, description:"Success", camera:{ resultCode:"100", streamingUrls:{ rtmp, flv, hls } } }
    // resultCode 100=OK, 302=Device busy, diğerleri hata
    const cam = cevap.veri?.camera
    if (cam && cam.resultCode && cam.resultCode !== '100') {
      setYukleniyor(false)
      setHata(`Kamera hatası: ${cam.resultMsg || cam.resultCode}. Aracın kamerası kapalı olabilir ya da başka biri izliyor olabilir.`)
      return
    }
    const su = cam?.streamingUrls || cevap.veri?.streamingUrls || null
    let url = su?.hls        // öncelik: HLS (native)
      || su?.flv               // sonra: FLV (flv.js)
      || cevap.veri?.url
      || cevap.veri?.urlCamera
      || null
    // RTMP tarayıcıda çalışmaz — atlanır
    if (!url) {
      setYukleniyor(false)
      setHata('Stream URL alınamadı. API yanıtı: ' + JSON.stringify(cevap.veri).slice(0, 300))
      return
    }
    // Mobiltek HTTP stream'ini Supabase edge fn (path-based) HTTPS proxy'le
    // http://84.51.5.140:8881/1/xxx/hls.m3u8 → https://[supabase]/functions/v1/mobiltek-stream/1/xxx/hls.m3u8
    // Path-based olduğu için m3u8 içindeki göreceli segment URL'leri
    // (chunk1.ts vb.) hls.js tarafından otomatik olarak aynı base'e çözümlenir.
    const m = url.match(/^http:\/\/84\.51\.5\.140:8881\/(.+)$/)
    if (m) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://hcrbwxeuscfibgmchdtt.supabase.co'
      url = `${supabaseUrl}/functions/v1/mobiltek-stream/${m[1]}`
    }
    setStreamUrl(url)
  }

  // Kanal değiştiğinde restart
  useEffect(() => {
    if (acik && arac) baslat(kanal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik, arac?.id, kanal])

  // Stream tipini algıla ve uygun player'ı başlat
  useEffect(() => {
    if (!streamUrl || !videoRef.current) return
    const video = videoRef.current
    const isFlv = streamUrl.includes('.flv') || streamUrl.startsWith('http') && !streamUrl.includes('.m3u8') && !streamUrl.endsWith('.mp4')
    const isHls = streamUrl.includes('.m3u8')
    const canNativeHls = video.canPlayType('application/vnd.apple.mpegurl')

    // Video oynayınca yukleniyor state'ini kapat
    const onCanPlay = () => setYukleniyor(false)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('playing', onCanPlay)

    const cleanup = () => {
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('playing', onCanPlay)
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      if (flvRef.current) { flvRef.current.destroy(); flvRef.current = null }
    }

    if (isHls && !canNativeHls) {
      import('hls.js').then(({ default: Hls }) => {
        if (!Hls.isSupported()) { setHata('Tarayıcı HLS desteklemiyor.'); return }
        cleanup()
        // Mobiltek stream warm-up ~60-90sn sürüyor. hls.js retry parametrelerini
        // agresif tut — manifest 404'lerini 90sn boyunca yeniden dene.
        const hls = new Hls({
          manifestLoadingMaxRetry: 30,
          manifestLoadingRetryDelay: 3000,
          manifestLoadingMaxRetryTimeout: 90000,
          levelLoadingMaxRetry: 30,
          levelLoadingRetryDelay: 3000,
          fragLoadingMaxRetry: 15,
          fragLoadingRetryDelay: 2000,
        })
        hlsRef.current = hls
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            console.warn('[hls] fatal error:', data.type, data.details)
            // Recoverable durumlar için yeniden dene
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
          }
        })
        hls.loadSource(streamUrl)
        hls.attachMedia(video)
      }).catch(() => { video.src = streamUrl })
    } else if (streamUrl.startsWith('http') && !streamUrl.endsWith('.mp4') && !isHls) {
      // FLV over HTTP — Mobiltek stream'i için
      import('flv.js').then(({ default: flvjs }) => {
        if (!flvjs.isSupported()) { setHata('Tarayıcı FLV desteklemiyor. Chrome/Edge deneyin.'); return }
        cleanup()
        const player = flvjs.createPlayer({
          type: 'flv',
          url: streamUrl,
          isLive: true,
          cors: true,
        })
        flvRef.current = player
        player.attachMediaElement(video)
        player.load()
        player.play().catch((e) => {
          console.warn('FLV play() blocked, autoplay policy:', e?.message)
        })
      }).catch((e) => {
        console.error('flv.js import fail:', e)
        video.src = streamUrl
      })
    } else {
      video.src = streamUrl
    }
    return cleanup
  }, [streamUrl])

  // Kapanışta stream durdur + log kapat
  const kapatEt = async () => {
    if (arac?.id) canliKameraDurdur(arac.id, kanal).catch(() => {})
    if (logId) izlemeLogBitir(logId).catch(() => {})
    setStreamUrl(null)
    setLogId(null)
    kapat?.()
  }

  // Component unmount'ta cleanup
  useEffect(() => {
    return () => {
      if (arac?.id && streamUrl) canliKameraDurdur(arac.id, kanal).catch(() => {})
      if (logId) izlemeLogBitir(logId).catch(() => {})
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      if (flvRef.current) { flvRef.current.destroy(); flvRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!acik) return null

  return (
    <div style={overlay} onClick={kapatEt}>
      <div style={panel} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Video size={20} color="#1e5aa8" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {arac?.plateNo || arac?.label || 'Araç'} — Canlı Kamera
              </div>
              <div style={{ fontSize: 11, color: '#6b7a93' }}>Kanal {kanal}</div>
            </div>
          </div>
          <button onClick={kapatEt} style={btnClose}><X size={20} /></button>
        </div>

        <div style={kanalRow}>
          {KANAL_SEC.map(k => (
            <button
              key={k}
              onClick={() => setKanal(k)}
              style={{ ...kanalBtn, ...(k === kanal ? kanalBtnAktif : {}) }}
            >
              Kanal {k}
            </button>
          ))}
        </div>

        <div style={videoWrap}>
          {yukleniyor && (
            <div style={centerText}>
              <RefreshCw size={32} className="spin" />
              <div style={{ marginTop: 12, fontSize: 14, fontWeight: 600 }}>Yayın başlatılıyor…</div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75, maxWidth: 320, textAlign: 'center', lineHeight: 1.5 }}>
                Mobiltek araç bağlantısı kurulurken <strong>1-2 dakika</strong> sürebilir.
                Lütfen sayfayı kapatmayın.
              </div>
            </div>
          )}
          {hata && (
            <div style={centerText}>
              <AlertTriangle size={32} color="#dc2626" />
              <div style={{ marginTop: 8, fontSize: 13, color: '#dc2626', maxWidth: 400, textAlign: 'center' }}>
                {hata}
              </div>
              <button onClick={() => baslat(kanal)} style={{ ...kanalBtn, marginTop: 12 }}>
                Yeniden Dene
              </button>
            </div>
          )}
          {!yukleniyor && !hata && streamUrl && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              controls
              muted
              style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
            />
          )}
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin 1s linear infinite}`}</style>
    </div>
  )
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }
const panel = { background: '#fff', borderRadius: 14, width: '100%', maxWidth: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
const header = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #e5eaf2' }
const btnClose = { background: 'none', border: 'none', cursor: 'pointer', color: '#6b7a93', padding: 4 }
const kanalRow = { display: 'flex', gap: 8, padding: '12px 18px', borderBottom: '1px solid #f0f3f7' }
const kanalBtn = { padding: '8px 14px', borderRadius: 8, border: '1px solid #dee3ec', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#3b4960' }
const kanalBtnAktif = { background: '#1e5aa8', color: '#fff', borderColor: '#1e5aa8' }
const videoWrap = { flex: 1, minHeight: 420, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }
const centerText = { display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#fff' }
