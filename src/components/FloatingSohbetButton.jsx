// Sag alt kosede floating sohbet butonu — her sayfadan tek tikla /chat'e gider.
// Okunmamis mesaj varsa pulse animasyonu + rozet sayisi gosterir.
// /chat sayfasindayken kendini gizler (mukerrer islev).

import { MessageSquare } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useChat } from '../context/ChatContext'

export default function FloatingSohbetButton() {
  const navigate = useNavigate()
  const location = useLocation()
  const { okunmamis } = useChat()

  // Chat sayfasinda gizle (zaten oradayız)
  if (location.pathname === '/chat') return null
  // Print sayfalarinda gizle
  if (location.pathname.endsWith('/yazdir') || location.pathname.startsWith('/p/')) return null

  const varOkunmamis = okunmamis > 0

  return (
    <>
      <style>{`
        @keyframes sohbet-pulse {
          0%   { box-shadow: 0 0 0 0   rgba(239, 68, 68, 0.55), 0 6px 20px rgba(30,90,168,0.35); }
          70%  { box-shadow: 0 0 0 14px rgba(239, 68, 68, 0);    0 6px 20px rgba(30,90,168,0.35); }
          100% { box-shadow: 0 0 0 0   rgba(239, 68, 68, 0);    0 6px 20px rgba(30,90,168,0.35); }
        }
        .sohbet-fab:hover { transform: translateY(-2px); }
        .sohbet-fab { transition: transform 0.15s ease; }
      `}</style>
      <button
        className="sohbet-fab"
        onClick={() => navigate('/chat')}
        title={varOkunmamis ? `${okunmamis} okunmamış mesaj` : 'Sohbet'}
        style={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          zIndex: 950,                  // KomutPaleti'nin (1000+) altında, içerikten üstte
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--brand-primary, #1E5AA8)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 20px rgba(30,90,168,0.35)',
          animation: varOkunmamis ? 'sohbet-pulse 1.8s infinite' : 'none',
        }}
      >
        <MessageSquare size={22} strokeWidth={2} />
        {varOkunmamis && (
          <span style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 22,
            height: 22,
            padding: '0 6px',
            background: '#EF4444',
            color: '#fff',
            borderRadius: 11,
            fontSize: 11,
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #fff',
            lineHeight: 1,
          }}>
            {okunmamis > 99 ? '99+' : okunmamis}
          </span>
        )}
      </button>
    </>
  )
}
