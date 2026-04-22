import { AnimatePresence, motion } from 'framer-motion'
import { useTheme, AKSENT_RENKLER } from '../context/ThemeContext'

const hazirTemalar = [
  { isim: 'Mavi Işık',     aksent: 'mavi',    mod: 'light', bg: '#ffffff', bar: '#0176D3' },
  { isim: 'Koyu Lacivert', aksent: 'mavi',    mod: 'dark',  bg: '#1f2937', bar: '#0176D3' },
  { isim: 'Yeşil Açık',   aksent: 'yesil',   mod: 'light', bg: '#ffffff', bar: '#10b981' },
  { isim: 'Gece Moru',    aksent: 'mor',     mod: 'dark',  bg: '#1f2937', bar: '#8b5cf6' },
  { isim: 'Amber',        aksent: 'turuncu', mod: 'light', bg: '#ffffff', bar: '#f59e0b' },
  { isim: 'Minimal',      aksent: 'slate',   mod: 'light', bg: '#f8fafc', bar: '#64748b' },
]

function MiniKart({ tema, aktif, onClick }) {
  return (
    <button
      onClick={onClick}
      title={tema.isim}
      className="flex flex-col overflow-hidden transition-all"
      style={{
        width: '64px',
        borderRadius: '8px',
        border: aktif ? `2px solid var(--primary)` : '2px solid transparent',
        boxShadow: aktif ? '0 0 0 1px var(--primary)' : '0 1px 4px rgba(0,0,0,0.15)',
        outline: 'none',
      }}
    >
      {/* mini ekran */}
      <div style={{ background: tema.bg, height: '40px', position: 'relative', overflow: 'hidden' }}>
        {/* sol sidebar şeridi */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '16px', background: '#1e2d40', opacity: 0.9 }} />
        {/* üst bar */}
        <div style={{ position: 'absolute', left: '16px', top: 0, right: 0, height: '6px', background: tema.bar }} />
        {/* içerik satırları */}
        <div style={{ position: 'absolute', left: '20px', top: '10px', right: '4px', height: '3px', background: tema.bg === '#ffffff' ? '#e5e7eb' : '#374151', borderRadius: '2px' }} />
        <div style={{ position: 'absolute', left: '20px', top: '16px', right: '10px', height: '3px', background: tema.bg === '#ffffff' ? '#e5e7eb' : '#374151', borderRadius: '2px' }} />
        <div style={{ position: 'absolute', left: '20px', top: '22px', right: '6px', height: '3px', background: tema.bg === '#ffffff' ? '#e5e7eb' : '#374151', borderRadius: '2px' }} />
      </div>
      <div style={{
        background: tema.bg === '#ffffff' ? '#f4f6f9' : '#111827',
        padding: '3px 0',
        fontSize: '9px',
        textAlign: 'center',
        color: tema.bg === '#ffffff' ? '#6b7280' : '#9ca3af',
        borderTop: '1px solid rgba(0,0,0,0.08)',
      }}>
        {tema.isim}
      </div>
    </button>
  )
}

function ThemePaneli({ acik, kapat }) {
  const { mod, aksent, setMod, setAksent, hazirTemaUygula } = useTheme()

  return (
    <AnimatePresence>
      {acik && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[9990]"
            style={{ background: 'transparent' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={kapat}
          />

          {/* Panel */}
          <motion.div
            className="fixed top-0 right-0 h-full z-[9991] flex flex-col overflow-y-auto"
            style={{
              width: '280px',
              background: 'var(--bg-card, #ffffff)',
              borderLeft: '1px solid var(--border, #dddbda)',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
            }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            {/* Başlık */}
            <div
              className="flex items-center justify-between px-5 py-4 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border, #dddbda)' }}
            >
              <div className="flex items-center gap-2">
                <span style={{ fontSize: '16px' }}>🎨</span>
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-primary, #1e293b)' }}>
                    TEMA SEÇİMİ
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted, #9ca3af)' }}>
                    Görünümü Değiştirin
                  </p>
                </div>
              </div>
              <button
                onClick={kapat}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition"
                style={{ color: 'var(--text-muted, #9ca3af)', background: 'var(--bg-hover, #f4f6f9)' }}
              >
                ✕
              </button>
            </div>

            <div className="flex-1 px-5 py-4 space-y-6">

              {/* KARANLIK MOD */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-3"
                  style={{ color: 'var(--text-muted, #9ca3af)' }}>
                  Karanlık Mod
                </p>
                <div className="flex gap-2">
                  {/* Gündüz */}
                  <button
                    onClick={() => setMod('light')}
                    className="flex-1 flex flex-col items-center gap-2 py-3 rounded-xl transition"
                    style={{
                      border: mod === 'light' ? '2px solid var(--primary)' : '2px solid var(--border, #dddbda)',
                      background: mod === 'light' ? 'rgba(var(--primary-rgb,1,118,211),0.06)' : 'var(--bg-hover, #f4f6f9)',
                    }}
                  >
                    <span style={{ fontSize: '22px' }}>☀️</span>
                    <span className="text-xs font-medium" style={{ color: mod === 'light' ? 'var(--primary)' : 'var(--text-secondary, #6b7280)' }}>
                      Açık
                    </span>
                    {mod === 'light' && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full text-white" style={{ background: 'var(--primary)', fontSize: '9px' }}>
                        Aktif
                      </span>
                    )}
                  </button>

                  {/* Gece */}
                  <button
                    onClick={() => setMod('dark')}
                    className="flex-1 flex flex-col items-center gap-2 py-3 rounded-xl transition"
                    style={{
                      border: mod === 'dark' ? '2px solid var(--primary)' : '2px solid var(--border, #dddbda)',
                      background: mod === 'dark' ? 'rgba(var(--primary-rgb,1,118,211),0.06)' : 'var(--bg-hover, #f4f6f9)',
                    }}
                  >
                    <span style={{ fontSize: '22px' }}>🌙</span>
                    <span className="text-xs font-medium" style={{ color: mod === 'dark' ? 'var(--primary)' : 'var(--text-secondary, #6b7280)' }}>
                      Koyu
                    </span>
                    {mod === 'dark' && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full text-white" style={{ background: 'var(--primary)', fontSize: '9px' }}>
                        Aktif
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* RENK SEÇİMİ */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-3"
                  style={{ color: 'var(--text-muted, #9ca3af)' }}>
                  Renk Seçimi
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(AKSENT_RENKLER).map(([key, renk]) => (
                    <button
                      key={key}
                      onClick={() => setAksent(key)}
                      title={renk.label}
                      className="flex flex-col items-center gap-1"
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
                        style={{
                          background: renk.primary,
                          boxShadow: aksent === key
                            ? `0 0 0 3px white, 0 0 0 5px ${renk.primary}`
                            : '0 1px 4px rgba(0,0,0,0.2)',
                          transform: aksent === key ? 'scale(1.15)' : 'scale(1)',
                        }}
                      >
                        {aksent === key && (
                          <span className="text-white font-bold" style={{ fontSize: '14px' }}>✓</span>
                        )}
                      </div>
                      <span className="text-xs" style={{ color: 'var(--text-muted, #9ca3af)', fontSize: '10px' }}>
                        {renk.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* HAZIR TEMALAR */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-3"
                  style={{ color: 'var(--text-muted, #9ca3af)' }}>
                  Hazır Temalar
                </p>
                <div className="flex flex-wrap gap-2">
                  {hazirTemalar.map((tema) => (
                    <MiniKart
                      key={tema.isim}
                      tema={tema}
                      aktif={aksent === tema.aksent && mod === tema.mod}
                      onClick={() => hazirTemaUygula(tema.mod, tema.aksent)}
                    />
                  ))}
                </div>
              </div>

            </div>

            {/* Alt not */}
            <div
              className="px-5 py-3 flex-shrink-0 text-center"
              style={{ borderTop: '1px solid var(--border, #dddbda)' }}
            >
              <p className="text-xs" style={{ color: 'var(--text-muted, #9ca3af)' }}>
                Tercihler otomatik kaydedilir
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default ThemePaneli
