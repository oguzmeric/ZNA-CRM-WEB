import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const ConfirmContext = createContext(null)

// ─── Modal bileşeni ───────────────────────────────────────────────────────────
function ConfirmModal({ config, onCevap }) {
  const btnRef = useRef(null)

  useEffect(() => {
    // Enter = onayla, Escape = iptal
    const handler = (e) => {
      if (e.key === 'Escape') onCevap(false)
      if (e.key === 'Enter')  onCevap(true)
    }
    window.addEventListener('keydown', handler)
    // Onay butonuna otomatik focus
    setTimeout(() => btnRef.current?.focus(), 50)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const tehlikeli = config.tip === 'tehlikeli'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={() => onCevap(false)}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -8 }}
        transition={{ duration: 0.15 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: '4px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          width: '100%',
          maxWidth: '420px',
          overflow: 'hidden',
        }}
      >
        {/* Üst renkli şerit */}
        <div style={{
          height: '4px',
          background: tehlikeli ? '#c62828' : '#0176D3',
        }} />

        {/* İçerik */}
        <div style={{ padding: '24px 24px 20px' }}>
          {/* İkon + Başlık */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{
              width: '36px', height: '36px',
              borderRadius: '50%',
              background: tehlikeli ? 'rgba(198,40,40,0.1)' : 'rgba(1,118,211,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px', flexShrink: 0,
            }}>
              {tehlikeli ? '🗑️' : config.ikon || '❓'}
            </div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', margin: 0 }}>
              {config.baslik || 'Emin misiniz?'}
            </h3>
          </div>

          {/* Mesaj */}
          {config.mesaj && (
            <p style={{ fontSize: '13px', color: '#555', lineHeight: 1.5, marginLeft: '48px' }}>
              {config.mesaj}
            </p>
          )}
        </div>

        {/* Butonlar */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: '8px',
          padding: '12px 24px',
          borderTop: '1px solid #f0f0f0',
          background: '#fafafa',
        }}>
          <button
            onClick={() => onCevap(false)}
            style={{
              padding: '7px 16px',
              borderRadius: '4px',
              border: '1px solid #dddbda',
              background: 'white',
              color: '#3e3e3c',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f4f6f9'}
            onMouseLeave={e => e.currentTarget.style.background = 'white'}
          >
            {config.iptalMetin || 'İptal'}
          </button>
          <button
            ref={btnRef}
            onClick={() => onCevap(true)}
            style={{
              padding: '7px 16px',
              borderRadius: '4px',
              border: 'none',
              background: tehlikeli ? '#c62828' : '#0176D3',
              color: 'white',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            {config.onayMetin || 'Onayla'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Provider ────────────────────────────────────────────────────────────────
export function ConfirmProvider({ children }) {
  const [modal, setModal] = useState(null)
  const cevapRef = useRef(null)

  const confirm = useCallback((config) => {
    return new Promise((resolve) => {
      cevapRef.current = resolve
      setModal(typeof config === 'string' ? { mesaj: config } : config)
    })
  }, [])

  const onCevap = (sonuc) => {
    setModal(null)
    cevapRef.current?.(sonuc)
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AnimatePresence>
        {modal && <ConfirmModal config={modal} onCevap={onCevap} />}
      </AnimatePresence>
    </ConfirmContext.Provider>
  )
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useConfirm() {
  return useContext(ConfirmContext)
}
