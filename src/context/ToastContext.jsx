import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

// ─── Tip konfigürasyonu ──────────────────────────────────────────────────────
const TIPLER = {
  success: {
    ikon: '✓',
    ikonBg: '#2e7d32',
    kenar: '#2e7d32',
    bg: '#ffffff',
  },
  error: {
    ikon: '✕',
    ikonBg: '#c62828',
    kenar: '#c62828',
    bg: '#ffffff',
  },
  warning: {
    ikon: '!',
    ikonBg: '#e65100',
    kenar: '#f59e0b',
    bg: '#ffffff',
  },
  info: {
    ikon: 'i',
    ikonBg: '#0176D3',
    kenar: '#0176D3',
    bg: '#ffffff',
  },
}

// ─── Context ─────────────────────────────────────────────────────────────────
const ToastContext = createContext(null)
let _id = 0

// ─── Tek toast bileşeni ───────────────────────────────────────────────────────
function ToastItem({ toast, onKapat }) {
  const tip = TIPLER[toast.tip] || TIPLER.info

  useEffect(() => {
    const t = setTimeout(() => onKapat(toast.id), toast.sure || 3500)
    return () => clearTimeout(t)
  }, [toast.id, toast.sure])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        background: tip.bg,
        borderLeft: `4px solid ${tip.kenar}`,
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '12px 14px',
        minWidth: '280px',
        maxWidth: '360px',
        pointerEvents: 'all',
      }}
    >
      {/* İkon */}
      <div style={{
        width: '22px',
        height: '22px',
        borderRadius: '50%',
        background: tip.ikonBg,
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        fontWeight: 700,
        flexShrink: 0,
        marginTop: '1px',
      }}>
        {tip.ikon}
      </div>

      {/* İçerik */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {toast.baslik && (
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', marginBottom: '2px' }}>
            {toast.baslik}
          </p>
        )}
        <p style={{ fontSize: '12px', color: toast.baslik ? '#555' : '#1a1a1a', lineHeight: 1.4 }}>
          {toast.mesaj}
        </p>
      </div>

      {/* Kapat */}
      <button
        onClick={() => onKapat(toast.id)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#aaa',
          fontSize: '16px',
          lineHeight: 1,
          padding: '0',
          flexShrink: 0,
          marginTop: '-1px',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#555'}
        onMouseLeave={e => e.currentTarget.style.color = '#aaa'}
      >
        ×
      </button>
    </motion.div>
  )
}

// ─── Container ───────────────────────────────────────────────────────────────
function ToastContainer({ toasts, onKapat }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column-reverse',
      gap: '8px',
      pointerEvents: 'none',
    }}>
      <AnimatePresence initial={false}>
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onKapat={onKapat} />
        ))}
      </AnimatePresence>
    </div>
  )
}

// ─── Provider ────────────────────────────────────────────────────────────────
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const kapat = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((mesaj, tip = 'info', options = {}) => {
    const id = ++_id
    const { baslik, sure = 3500 } = typeof options === 'object' ? options : { sure: options }
    setToasts(prev => [...prev.slice(-4), { id, mesaj, tip, baslik, sure }])
    return id
  }, [])

  // Kısayol metodları
  const toast = {
    success: (mesaj, options) => showToast(mesaj, 'success', options),
    error:   (mesaj, options) => showToast(mesaj, 'error',   options),
    warning: (mesaj, options) => showToast(mesaj, 'warning', options),
    info:    (mesaj, options) => showToast(mesaj, 'info',    options),
  }

  return (
    <ToastContext.Provider value={{ showToast, toast }}>
      {children}
      <ToastContainer toasts={toasts} onKapat={kapat} />
    </ToastContext.Provider>
  )
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useToast() {
  return useContext(ToastContext)
}
