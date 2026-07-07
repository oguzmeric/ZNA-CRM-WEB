// Canlı kamera izleme modalı — Mobiltek MDVR.
//
// Transport: HTTP-FLV via mpegts.js (Chinese CMSV6/JC MDVR ekosisteminin standardı).
// Neden HLS değil: MDVR ilk keyframe göndermeden m3u8 boş dönüyor, hls.js pes ediyor.
// mpegts.js chunked HTTP fetch açık tutar; DVR frame göndermeye başlayınca anında oynatır.
//
// Akış:
//   1. cameras-live (v2) → streamingUrls (rtmp, flv, hls)
//   2. FLV URL'i tercih et → Supabase edge fn proxy path'ine çevir (HTTPS/CSP güvenli)
//   3. mpegts.js Player → <video>
//   4. Kapat/kanal değişimi → live/stop + player.destroy

import { useEffect, useRef, useState } from 'react'
import { X, Video, RefreshCw, AlertTriangle } from 'lucide-react'
import { canliKameraBaslat, canliKameraDurdur, izlemeLogBaslat, izlemeLogBitir } from '../services/mobiltekService'
import { useAuth } from '../context/AuthContext'

const KANAL_SEC = [1, 2]
const BUSY_BEKLEME_SN = 90
const WARM_UP_MAKS_MS = 120000 // 2 dk

// Mobiltek HTTP URL'ini Supabase edge fn HTTPS proxy path'ine çevir
const proxyle = (url) => {
  if (!url) return url
  const m = url.match(/^http:\/\/84\.51\.5\.140:8881\/(.+)$/)
  if (!m) return url
  const base = import.meta.env.VITE_SUPABASE_URL || 'https://hcrbwxeuscfibgmchdtt.supabase.co'
  return `${base}/functions/v1/mobiltek-stream/${m[1]}`
}

export default function CanliKameraModal({ acik, kapat, arac }) {
  const { kullanici } = useAuth()
  const [kanal, setKanal] = useState(1)
  const [streamUrl, setStreamUrl] = useState(null)
  const [streamTipi, setStreamTipi] = useState(null) // 'flv' | 'hls' | 'mp4'
  const [yukleniyor, setYukleniyor] = useState(false)
  const [busyBekleme, setBusyBekleme] = useState(0)
  const [hata, setHata] = useState(null)
  const [logId, setLogId] = useState(null)

  const videoRef = useRef(null)
  const playerRef = useRef(null) // mpegts.js Player veya hls.js instance
  const playerTipiRef = useRef(null) // 'mpegts' | 'hls' | 'native'
  const busyIntervalRef = useRef(null)
  const warmUpTimerRef = useRef(null)
  const suanKiKanalRef = useRef(1)

  const temizle = () => {
    if (busyIntervalRef.current) { clearInterval(busyIntervalRef.current); busyIntervalRef.current = null }
    if (warmUpTimerRef.current) { clearTimeout(warmUpTimerRef.current); warmUpTimerRef.current = null }
    if (playerRef.current) {
      try {
        if (playerTipiRef.current === 'mpegts') {
          playerRef.current.pause()
          playerRef.current.unload()
          playerRef.current.detachMediaElement()
          playerRef.current.destroy()
        } else if (playerTipiRef.current === 'hls') {
          playerRef.current.destroy()
        }
      } catch (e) { console.warn('[canli-kamera] player destroy hata:', e?.message) }
      playerRef.current = null
      playerTipiRef.current = null
    }
    if (videoRef.current) {
      try { videoRef.current.pause(); videoRef.current.removeAttribute('src'); videoRef.current.load() } catch {}
    }
  }

  const baslat = async (secilenKanal) => {
    if (!arac?.id) return
    suanKiKanalRef.current = secilenKanal
    setYukleniyor(true)
    setBusyBekleme(0)
    setHata(null)
    setStreamUrl(null)
    setStreamTipi(null)
    temizle()

    // İzleme log
    const yeniLog = await izlemeLogBaslat({
      aracId: arac.id,
      aracPlaka: arac.plateNo || arac.label,
      kanal: secilenKanal,
      kullaniciId: kullanici?.id,
    })
    setLogId(yeniLog)

    const cevap = await canliKameraBaslat(arac.id, secilenKanal)
    if (!cevap) {
      setYukleniyor(false)
      setHata('Kamera başlatılamadı — kredensiyel/ağ sorunu olabilir.')
      return
    }

    const cam = cevap.veri?.camera
    if (cam?.resultCode && cam.resultCode !== '100') {
      // 302 Device busy → 90 sn countdown + auto-retry
      if (cam.resultCode === '302' || (cam.resultMsg || '').toLowerCase().includes('busy')) {
        setBusyBekleme(BUSY_BEKLEME_SN)
        const t0 = Date.now()
        busyIntervalRef.current = setInterval(() => {
          const kalan = Math.max(0, BUSY_BEKLEME_SN - Math.floor((Date.now() - t0) / 1000))
          setBusyBekleme(kalan)
          if (kalan === 0) {
            clearInterval(busyIntervalRef.current)
            busyIntervalRef.current = null
            if (arac?.id) baslat(suanKiKanalRef.current)
          }
        }, 1000)
        return
      }
      setYukleniyor(false)
      setHata(`Kamera hatası: ${cam.resultMsg || cam.resultCode}. Motor kapalıysa açın, kamera arızalıysa Mobiltek destek çağırın.`)
      return
    }

    const su = cam?.streamingUrls || cevap.veri?.streamingUrls || {}
    // Öncelik: FLV (mpegts.js — warm-up dostu) > HLS (yalnız Safari) > mp4
    const flvUrl = su.flv ? proxyle(su.flv) : null
    const hlsUrl = su.hls ? proxyle(su.hls) : null

    if (flvUrl) {
      setStreamUrl(flvUrl)
      setStreamTipi('flv')
    } else if (hlsUrl) {
      setStreamUrl(hlsUrl)
      setStreamTipi('hls')
    } else {
      setYukleniyor(false)
      setHata('Kullanılabilir stream URL yok. API yanıtı: ' + JSON.stringify(cevap.veri).slice(0, 300))
    }
  }

  // Player başlat (streamUrl + streamTipi değişince)
  useEffect(() => {
    if (!streamUrl || !streamTipi || !videoRef.current) return
    const video = videoRef.current
    let iptal = false

    const onLoadedData = () => setYukleniyor(false)
    const onPlaying = () => setYukleniyor(false)
    const onWaiting = () => {/* buffering — kullanıcıyı bilgilendirmiyoruz */}
    video.addEventListener('loadeddata', onLoadedData)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('waiting', onWaiting)

    // 2 dk içinde ilk frame gelmezse hata göster
    warmUpTimerRef.current = setTimeout(() => {
      if (video.readyState < 2) {
        setYukleniyor(false)
        setHata('Yayın 2 dakikada başlamadı. Motor kapalıysa açın veya birazdan tekrar deneyin.')
      }
    }, WARM_UP_MAKS_MS)

    if (streamTipi === 'flv') {
      import('mpegts.js').then(({ default: mpegts }) => {
        if (iptal) return
        if (!mpegts.getFeatureList().mseLivePlayback) {
          setHata('Tarayıcı canlı FLV desteklemiyor. Chrome/Edge deneyin.')
          return
        }
        const player = mpegts.createPlayer(
          {
            type: 'flv',
            url: streamUrl,
            isLive: true,
            hasVideo: true,
            hasAudio: false,
            cors: true,
          },
          {
            enableWorker: false,
            enableStashBuffer: false,     // canlıda buffer yok, minimum latency
            stashInitialSize: 128,
            liveBufferLatencyChasing: true,
            liveBufferLatencyChasingOnPaused: false,
            liveBufferLatencyMaxDelay: 4,
            liveBufferLatencyMinRemain: 1,
            autoCleanupSourceBuffer: true,
            reuseRedirectedURL: true,
          },
        )
        playerRef.current = player
        playerTipiRef.current = 'mpegts'
        player.on(mpegts.Events.ERROR, (t, d, info) => {
          console.warn('[mpegts] error:', t, d, info)
          // Network → 5sn sonra unload+load, max 20 kez
          if (t === mpegts.ErrorTypes.NETWORK_ERROR || t === mpegts.ErrorTypes.MEDIA_ERROR) {
            setTimeout(() => {
              if (playerRef.current === player) {
                try { player.unload(); player.load() } catch {}
              }
            }, 5000)
          }
        })
        player.attachMediaElement(video)
        player.load()
        player.play().catch(e => console.warn('[mpegts] autoplay engel:', e?.message))
      }).catch(e => {
        console.error('[mpegts] import fail:', e)
        setHata('Video oynatıcı yüklenemedi.')
      })
    } else if (streamTipi === 'hls') {
      // Safari native
      const canNativeHls = video.canPlayType('application/vnd.apple.mpegurl')
      if (canNativeHls) {
        video.src = streamUrl
        playerTipiRef.current = 'native'
        video.play().catch(e => console.warn('[hls-native] autoplay engel:', e?.message))
      } else {
        import('hls.js').then(({ default: Hls }) => {
          if (iptal || !Hls.isSupported()) { setHata('Tarayıcı HLS desteklemiyor.'); return }
          const hls = new Hls({
            liveDurationInfinity: true,
            lowLatencyMode: false,
            backBufferLength: 30,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 10,
            manifestLoadingMaxRetry: 15,
            manifestLoadingRetryDelay: 2000,
            manifestLoadingMaxRetryTimeout: 120000,
            levelLoadingMaxRetry: 15,
            levelLoadingRetryDelay: 2000,
            fragLoadingMaxRetry: 15,
            fragLoadingRetryDelay: 1500,
          })
          playerRef.current = hls
          playerTipiRef.current = 'hls'
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              console.warn('[hls] fatal:', data.type, data.details)
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                setTimeout(() => { try { hls.startLoad() } catch {} }, 3000)
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                try { hls.recoverMediaError() } catch {}
              }
            }
            // levelEmptyError → warm-up sırasında normal, loadSource re-arm
            if (data.details === 'levelEmptyError' || data.details === 'manifestParsingError') {
              setTimeout(() => { try { hls.loadSource(streamUrl); hls.startLoad() } catch {} }, 3000)
            }
          })
          hls.loadSource(streamUrl)
          hls.attachMedia(video)
        }).catch(e => {
          console.error('[hls] import fail:', e)
          setHata('Video oynatıcı yüklenemedi.')
        })
      }
    } else {
      video.src = streamUrl
      playerTipiRef.current = 'native'
    }

    return () => {
      iptal = true
      video.removeEventListener('loadeddata', onLoadedData)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('waiting', onWaiting)
      if (warmUpTimerRef.current) { clearTimeout(warmUpTimerRef.current); warmUpTimerRef.current = null }
    }
  }, [streamUrl, streamTipi])

  // Modal aç/arac değiş/kanal değiş → başlat
  useEffect(() => {
    if (acik && arac) baslat(kanal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik, arac?.id, kanal])

  const kapatEt = async () => {
    if (arac?.id) canliKameraDurdur(arac.id, suanKiKanalRef.current).catch(() => {})
    if (logId) izlemeLogBitir(logId).catch(() => {})
    temizle()
    setStreamUrl(null)
    setStreamTipi(null)
    setLogId(null)
    setYukleniyor(false)
    setBusyBekleme(0)
    setHata(null)
    kapat?.()
  }

  // Component unmount cleanup
  useEffect(() => {
    return () => {
      if (arac?.id && streamUrl) canliKameraDurdur(arac.id, suanKiKanalRef.current).catch(() => {})
      if (logId) izlemeLogBitir(logId).catch(() => {})
      temizle()
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
              <div style={{ fontSize: 11, color: '#6b7a93' }}>
                Kanal {kanal}{streamTipi ? ` · ${streamTipi.toUpperCase()}` : ''}
              </div>
            </div>
          </div>
          <button onClick={kapatEt} style={btnClose}><X size={20} /></button>
        </div>

        <div style={kanalRow}>
          {KANAL_SEC.map(k => (
            <button
              key={k}
              onClick={() => { if (k !== kanal) setKanal(k) }}
              style={{ ...kanalBtn, ...(k === kanal ? kanalBtnAktif : {}) }}
            >
              Kanal {k}
            </button>
          ))}
        </div>

        <div style={videoWrap}>
          {/* Video her zaman render — mpegts.js attachMediaElement öncesi hazır olsun */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            controls
            muted
            style={{
              width: '100%', height: '100%', objectFit: 'contain', background: '#000',
              display: (yukleniyor || hata) ? 'none' : 'block',
            }}
          />

          {yukleniyor && (
            <div style={centerText}>
              <RefreshCw size={32} className="spin" />
              {busyBekleme > 0 ? (
                <>
                  <div style={{ marginTop: 12, fontSize: 14, fontWeight: 600 }}>
                    Cihaz meşgul — otomatik yeniden deneme
                  </div>
                  <div style={{ marginTop: 6, fontSize: 32, fontWeight: 800, color: '#fbbf24' }}>
                    {busyBekleme}s
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75, maxWidth: 340, textAlign: 'center', lineHeight: 1.5 }}>
                    Önceki yayın hâlâ aktif — Mobiltek cihazı serbest bırakınca otomatik başlatılacak.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginTop: 12, fontSize: 14, fontWeight: 600 }}>Yayın başlatılıyor…</div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75, maxWidth: 320, textAlign: 'center', lineHeight: 1.5 }}>
                    Motor açıkken 15-20 sn, motor kapalıyken <strong>1-2 dakika</strong> sürebilir.
                  </div>
                </>
              )}
            </div>
          )}

          {hata && (
            <div style={centerText}>
              <AlertTriangle size={32} color="#dc2626" />
              <div style={{ marginTop: 8, fontSize: 13, color: '#fca5a5', maxWidth: 400, textAlign: 'center', lineHeight: 1.5 }}>
                {hata}
              </div>
              <button onClick={() => baslat(kanal)} style={{ ...kanalBtn, marginTop: 12, background: '#1e5aa8', color: '#fff', border: 'none' }}>
                Yeniden Dene
              </button>
            </div>
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
const centerText = { display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#fff', position: 'absolute', inset: 0, justifyContent: 'center' }
