// Sag-alt floating buton — Sohbet'in solunda 2. buton olarak.
// Tıklayınca ZeynaPaneli açılır.

import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import ZeynaAvatar from './ZeynaAvatar'
import ZeynaPaneli from './ZeynaPaneli'

export default function FloatingZeynaButton() {
  const location = useLocation()
  const [panelAcik, setPanelAcik] = useState(false)

  // Print sayfalarinda ve public link sayfasinda gizle
  if (location.pathname.endsWith('/yazdir') || location.pathname.startsWith('/p/')) return null

  return (
    <>
      <style>{`
        @keyframes zeyna-fab-glow {
          0%, 100% { box-shadow: 0 6px 20px rgba(30,90,168,0.35); }
          50%      { box-shadow: 0 6px 24px rgba(74,197,229,0.45); }
        }
        .zeyna-fab:hover { transform: translateY(-2px) scale(1.05); }
        .zeyna-fab {
          transition: transform 0.15s ease;
          animation: zeyna-fab-glow 3s ease-in-out infinite;
        }
      `}</style>
      <button
        className="zeyna-fab"
        onClick={() => setPanelAcik(true)}
        title="Zeyna AI Asistanı"
        style={{
          position: 'fixed',
          right: 24,
          bottom: 96,           // Sohbet butonunun üstüne — 24 + 56 + 16
          zIndex: 950,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ZeynaAvatar size={56} />
      </button>

      <ZeynaPaneli acik={panelAcik} onKapat={() => setPanelAcik(false)} />
    </>
  )
}
