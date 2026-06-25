// Sag-alt floating buton — Sohbet'in ustunde, daha buyuk (72px) ve dikkat cekici.
// Yaninda konusma baloncugu (tooltip) gunde bir defa otomatik gosterilir.

import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { X } from 'lucide-react'
import ZeynaAvatar from './ZeynaAvatar'
import ZeynaPaneli from './ZeynaPaneli'

const STORAGE_KEY = 'zeyna-greeting-shown-session'

// Bu session'da karsilama gosterildi mi? sessionStorage — yeni sekme/giris'te tekrar gosterilir,
// ayni sekme icindeki sayfa gecislerinde tekrar gosterilmez.
function gosterildi() {
  try { return sessionStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}
function isaretle() {
  try { sessionStorage.setItem(STORAGE_KEY, '1') } catch {}
}

export default function FloatingZeynaButton() {
  const location = useLocation()
  const [panelAcik, setPanelAcik] = useState(false)
  const [karsilamaGoster, setKarsilamaGoster] = useState(false)

  // Print sayfalarinda ve public link sayfasinda gizle
  const sayfaUygun = !(
    location.pathname.endsWith('/yazdir') ||
    location.pathname.startsWith('/p/')
  )

  // Karsilama balonu: ilk yuklemede 2sn gecikme ile cikar, session basina 1 kez
  useEffect(() => {
    if (!sayfaUygun) return
    if (gosterildi()) return
    const t = setTimeout(() => setKarsilamaGoster(true), 2000)
    return () => clearTimeout(t)
  }, [sayfaUygun])

  // Karsilamayi kapat ve "gosterildi" isaretle
  const karsilamaKapat = () => {
    setKarsilamaGoster(false)
    isaretle()
  }

  // Panel acilinca da karsilama otomatik kaybolsun
  const panelAc = () => {
    karsilamaKapat()
    setPanelAcik(true)
  }

  if (!sayfaUygun) return null

  return (
    <>
      <style>{`
        @keyframes zeyna-fab-glow {
          0%, 100% { box-shadow: 0 8px 24px rgba(46,35,128,0.45); }
          50%      { box-shadow: 0 8px 30px rgba(245,166,35,0.55); }
        }
        @keyframes zeyna-bubble-in {
          from { opacity: 0; transform: translateX(8px) scale(0.92); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        .zeyna-fab:hover { transform: translateY(-3px) scale(1.06); }
        .zeyna-fab {
          transition: transform 0.18s ease;
          animation: zeyna-fab-glow 3s ease-in-out infinite;
          border-radius: 50%;
        }
        .zeyna-bubble {
          animation: zeyna-bubble-in 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>

      {/* Karsilama balonu — butonun solunda */}
      {karsilamaGoster && (
        <div
          className="zeyna-bubble"
          style={{
            position: 'fixed',
            right: 110,            // 24 (sag) + 72 (buton) + 14 (bosluk)
            bottom: 120,           // butonun ortasi hizasi: 96 + 36 - balon yarisi ~ 120
            zIndex: 951,
            maxWidth: 280,
          }}
        >
          {/* X butonu */}
          <button
            onClick={karsilamaKapat}
            title="Kapat"
            style={{
              position: 'absolute',
              top: -8, right: -8,
              width: 22, height: 22,
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
            <X size={12} strokeWidth={2.5} />
          </button>

          {/* Balon icerigi */}
          <div
            onClick={panelAc}
            style={{
              background: '#fff',
              border: '1px solid var(--border-subtle, #DEE3EC)',
              borderRadius: 14,
              padding: '12px 16px',
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(15,27,46,0.14)',
              font: '500 13px/19px var(--font-sans)',
              color: 'var(--text-primary, #0F1B2E)',
              position: 'relative',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 2 }}>
              Merhaba! Ben Zeyna 👋
            </div>
            <div style={{ color: 'var(--text-secondary, #3B4960)', fontWeight: 500 }}>
              Nasıl yardımcı olabilirim?
            </div>
            {/* Konusma balonu kuyrugu — saga dogru */}
            <div style={{
              position: 'absolute',
              right: -7, bottom: 14,
              width: 14, height: 14,
              background: '#fff',
              borderRight: '1px solid var(--border-subtle, #DEE3EC)',
              borderTop: '1px solid var(--border-subtle, #DEE3EC)',
              transform: 'rotate(45deg)',
            }} />
          </div>
        </div>
      )}

      {/* Zeyna FAB + kalici etiket — buton ne icin oldugu anlasilsin */}
      <div style={{
        position: 'fixed',
        right: 24,
        bottom: 96,           // Sohbet butonunun ustunde
        zIndex: 950,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}>
        <button
          className="zeyna-fab"
          onClick={panelAc}
          title="Zeyna AI Asistanı"
          style={{
            width: 72,
            height: 72,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ZeynaAvatar size={72} />
        </button>
        <div style={{
          background: 'linear-gradient(135deg, #4234A8, #5346C7)',
          color: '#fff',
          padding: '2px 10px',
          borderRadius: 999,
          font: '700 10px/14px var(--font-sans)',
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          boxShadow: '0 2px 8px rgba(46,35,128,0.35)',
          pointerEvents: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}>
          <span style={{ fontSize: 9 }}>✨</span>
          <span>Zeyna AI</span>
        </div>
      </div>

      <ZeynaPaneli acik={panelAcik} onKapat={() => setPanelAcik(false)} />
    </>
  )
}
