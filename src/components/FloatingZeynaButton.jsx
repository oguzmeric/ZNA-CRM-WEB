// Sag-alt floating buton — Zeyna AI.
// Daha kompakt (56px), permanent etiket kaldirildi (hover'da tooltip),
// kullanici sürüklü konumu LocalStorage'da saklanir, "minimize" toggle ile gizlenebilir.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { X, Eye } from 'lucide-react'
import ZeynaAvatar from './ZeynaAvatar'
import ZeynaPaneli from './ZeynaPaneli'

const POZ_KEY = 'zeyna_fab_pos'        // {right, bottom}
const GIZLI_KEY = 'zeyna_fab_gizli'    // 'true' → session boyunca minik nokta
const BOY = 56                          // px — eski 72'den kompakt
const KENAR_PAYI = 12                   // px — viewport kenarina min mesafe

function pozOku() {
  try {
    const v = JSON.parse(localStorage.getItem(POZ_KEY) || 'null')
    if (v && Number.isFinite(v.right) && Number.isFinite(v.bottom)) return v
  } catch {}
  return { right: 24, bottom: 96 }      // Sohbet butonunun ustunde
}
function pozYaz(p) {
  try { localStorage.setItem(POZ_KEY, JSON.stringify(p)) } catch {}
}

export default function FloatingZeynaButton() {
  const location = useLocation()
  const [panelAcik, setPanelAcik] = useState(false)
  const [karsilamaGoster, setKarsilamaGoster] = useState(false)
  const [poz, setPoz] = useState(pozOku)
  const [gizliMi, setGizliMi] = useState(() => {
    try { return sessionStorage.getItem(GIZLI_KEY) === 'true' } catch { return false }
  })
  const [suruklenuiyor, setSuruklenuiyor] = useState(false)
  const baslangic = useRef(null)         // {x, y, pozRight, pozBottom}
  const surukleDistance = useRef(0)      // hareket > 5px ise click iptal
  const sonPoz = useRef(poz)             // pointerup'ta stale state olmasın

  // Print sayfalarinda ve public link sayfasinda gizle
  const sayfaUygun = !(
    location.pathname.endsWith('/yazdir') ||
    location.pathname.startsWith('/p/') ||
    location.pathname.startsWith('/davet/')
  )

  // Karsilama balonu: her yuklemede 2sn gecikme ile cikar, 6sn sonra otomatik kaybolur
  useEffect(() => {
    if (!sayfaUygun || gizliMi) return
    const ac = setTimeout(() => setKarsilamaGoster(true), 2000)
    const kapat = setTimeout(() => setKarsilamaGoster(false), 8000)
    return () => { clearTimeout(ac); clearTimeout(kapat) }
  }, [sayfaUygun, gizliMi])

  const karsilamaKapat = () => setKarsilamaGoster(false)

  const panelAc = () => {
    if (surukleDistance.current > 5) return  // suruklemeden sonraki release click sayilmasin
    karsilamaKapat()
    setPanelAcik(true)
  }

  const gizle = (e) => {
    e?.stopPropagation()
    setGizliMi(true)
    try { sessionStorage.setItem(GIZLI_KEY, 'true') } catch {}
  }

  const goster = () => {
    setGizliMi(false)
    try { sessionStorage.removeItem(GIZLI_KEY) } catch {}
  }

  // Sürükleme — pointer events
  const onPointerDown = useCallback((e) => {
    baslangic.current = {
      x: e.clientX,
      y: e.clientY,
      pozRight: poz.right,
      pozBottom: poz.bottom,
    }
    surukleDistance.current = 0
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [poz])

  const onPointerMove = useCallback((e) => {
    if (!baslangic.current) return
    const dx = e.clientX - baslangic.current.x
    const dy = e.clientY - baslangic.current.y
    const dist = Math.sqrt(dx*dx + dy*dy)
    surukleDistance.current = Math.max(surukleDistance.current, dist)
    if (dist > 3 && !suruklenuiyor) setSuruklenuiyor(true)

    // right: artarsa buton sola, bottom: artarsa yukari
    const yeniRight = baslangic.current.pozRight - dx
    const yeniBottom = baslangic.current.pozBottom - dy
    const maxR = window.innerWidth - BOY - KENAR_PAYI
    const maxB = window.innerHeight - BOY - KENAR_PAYI
    const yeniPoz = {
      right: Math.max(KENAR_PAYI, Math.min(maxR, yeniRight)),
      bottom: Math.max(KENAR_PAYI, Math.min(maxB, yeniBottom)),
    }
    sonPoz.current = yeniPoz
    setPoz(yeniPoz)
  }, [suruklenuiyor])

  const onPointerUp = useCallback((e) => {
    if (!baslangic.current) return
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    baslangic.current = null
    // surukleDistance > 3 ise drag yapılmıştır → kaydet
    if (surukleDistance.current > 3) {
      pozYaz(sonPoz.current)
      setSuruklenuiyor(false)
    }
  }, [])

  if (!sayfaUygun) return null

  // GIZLI: kucuk nokta sag-altta — tiklayinca tekrar gosterir
  if (gizliMi) {
    return (
      <button
        onClick={goster}
        title="Zeyna AI'yı geri getir"
        style={{
          position: 'fixed',
          right: 6, bottom: 6,
          width: 14, height: 14,
          borderRadius: '50%',
          background: '#534AB7',
          border: '2px solid #fff',
          boxShadow: '0 2px 6px rgba(15,27,46,0.20)',
          cursor: 'pointer',
          padding: 0,
          zIndex: 940,
          opacity: 0.55,
          transition: 'opacity 150ms, transform 150ms',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; e.currentTarget.style.transform = 'scale(1.3)' }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.55; e.currentTarget.style.transform = 'scale(1)' }}
      />
    )
  }

  return (
    <>
      <style>{`
        @keyframes zeyna-fab-glow {
          0%, 100% { box-shadow: 0 4px 14px rgba(46,35,128,0.32); }
          50%      { box-shadow: 0 4px 18px rgba(245,166,35,0.42); }
        }
        @keyframes zeyna-bubble-in {
          from { opacity: 0; transform: translateX(8px) scale(0.92); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        .zeyna-fab-wrap { transition: transform 0.18s ease; }
        .zeyna-fab-wrap:hover { transform: translateY(-2px); }
        .zeyna-fab-wrap.dragging { transition: none; cursor: grabbing !important; }
        .zeyna-fab {
          animation: zeyna-fab-glow 3s ease-in-out infinite;
          border-radius: 50%;
        }
        .zeyna-fab-wrap:hover .zeyna-mini-close,
        .zeyna-fab-wrap:focus-within .zeyna-mini-close { opacity: 1; pointer-events: auto; }
        .zeyna-bubble { animation: zeyna-bubble-in 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>

      {/* Karsilama balonu — butonun solunda */}
      {karsilamaGoster && (
        <div
          className="zeyna-bubble"
          style={{
            position: 'fixed',
            right: poz.right + BOY + 14,
            bottom: poz.bottom + (BOY/2) - 26,
            zIndex: 941,
            maxWidth: 240,
            pointerEvents: 'auto',
          }}
        >
          <button
            onClick={karsilamaKapat}
            title="Kapat"
            style={{
              position: 'absolute',
              top: -8, right: -8,
              width: 20, height: 20,
              borderRadius: '50%',
              background: '#fff',
              border: '1px solid var(--border-default, #DEE3EC)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-tertiary)',
              boxShadow: '0 2px 6px rgba(15,27,46,0.12)',
              padding: 0,
            }}
          >
            <X size={11} strokeWidth={2.5} />
          </button>
          <div
            onClick={panelAc}
            style={{
              background: '#fff',
              border: '1px solid var(--border-subtle, #DEE3EC)',
              borderRadius: 12,
              padding: '10px 14px',
              cursor: 'pointer',
              boxShadow: '0 6px 18px rgba(15,27,46,0.12)',
              font: '500 12.5px/17px var(--font-sans)',
              color: 'var(--text-primary, #0F1B2E)',
              position: 'relative',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Ben Zeyna 👋</div>
            <div style={{ color: 'var(--text-secondary, #3B4960)', fontWeight: 500 }}>
              Nasıl yardımcı olabilirim?
            </div>
            <div style={{
              position: 'absolute',
              right: -7, bottom: 14,
              width: 12, height: 12,
              background: '#fff',
              borderRight: '1px solid var(--border-subtle, #DEE3EC)',
              borderTop: '1px solid var(--border-subtle, #DEE3EC)',
              transform: 'rotate(45deg)',
            }} />
          </div>
        </div>
      )}

      {/* Zeyna FAB — sürüklenebilir, kompakt, etiketsiz */}
      <div
        className={`zeyna-fab-wrap${suruklenuiyor ? ' dragging' : ''}`}
        style={{
          position: 'fixed',
          right: poz.right,
          bottom: poz.bottom,
          zIndex: 940,                 // Sohbet (950) altinda — sohbet butonunu kapatmasin
          width: BOY,
          height: BOY,
          cursor: suruklenuiyor ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          className="zeyna-fab"
          onClick={panelAc}
          title="Zeyna AI · Sürüklemek için basılı tutun"
          style={{
            width: BOY,
            height: BOY,
            background: 'transparent',
            border: 'none',
            cursor: 'inherit',
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',     // pointer event'leri wrap'a delege
          }}
        >
          <ZeynaAvatar size={BOY} />
        </button>

        {/* Mini gizle (X) — hover'da goz, sessionStorage'a yazar */}
        <button
          className="zeyna-mini-close"
          onClick={gizle}
          onPointerDown={(e) => e.stopPropagation()}
          title="Gizle (bu oturum boyunca minik nokta gösterilir)"
          style={{
            position: 'absolute',
            top: -4, right: -4,
            width: 20, height: 20,
            borderRadius: '50%',
            background: '#fff',
            border: '1px solid var(--border-default, #DEE3EC)',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(15,27,46,0.14)',
            padding: 0,
            opacity: 0,
            pointerEvents: 'none',
            transition: 'opacity 150ms',
          }}
        >
          <X size={11} strokeWidth={2.5} />
        </button>
      </div>

      <ZeynaPaneli acik={panelAcik} onKapat={() => setPanelAcik(false)} />
    </>
  )
}
