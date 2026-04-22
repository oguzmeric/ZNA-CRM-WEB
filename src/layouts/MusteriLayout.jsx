import { useAuth } from '../context/AuthContext'
import { useServisTalebi } from '../context/ServisTalebiContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const sayfaIsimleri = {
  '/musteri-portal': 'Ana Panel',
  '/musteri-portal/yeni-talep': 'Yeni Talep Oluştur',
  '/musteri-portal/taleplerim': 'Taleplerim',
  '/musteri-portal/teklif-iste': 'Teklif İste',
}

function MusteriLayout({ children }) {
  const { kullanici, cikisYap } = useAuth()
  const { musteriTalepleri } = useServisTalebi()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuAcik, setMenuAcik] = useState(false)

  const talepler = musteriTalepleri(kullanici?.id)
  const acikTalepler = talepler.filter((t) => !['tamamlandi', 'iptal'].includes(t.durum))

  // Teklif modülü izni kontrolü
  const izinliTurler = kullanici?.izinliTurler
  const teklifIzinli =
    !izinliTurler || izinliTurler.length === 0 || izinliTurler.includes('teklif')

  const handleCikis = () => {
    cikisYap()
    navigate('/login')
  }

  const sayfaBasligi = () => {
    if (location.pathname.startsWith('/musteri-portal/talep/')) return 'Talep Detayı'
    return sayfaIsimleri[location.pathname] || 'Portal'
  }

  const navItems = [
    { yol: '/musteri-portal', isim: 'Ana Panel', ikon: '▣' },
    { yol: '/musteri-portal/taleplerim', isim: 'Taleplerim', ikon: '📋', rozet: acikTalepler.length },
    ...(teklifIzinli
      ? [{ yol: '/musteri-portal/teklif-iste', isim: 'Teklif İste', ikon: '💼' }]
      : []),
    { yol: '/musteri-portal/yeni-talep', isim: 'Yeni Talep', ikon: '➕', vurgulu: true },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>

      {/* Üst bar */}
      <div
        style={{
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

          {/* Logo + başlık */}
          <div className="flex items-center gap-3">
            <img src="/logo.jpeg" alt="ZNA" className="w-9 h-9 object-contain rounded" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }} />
            <div>
              <h1 style={{ fontSize: '14px', fontWeight: 700, color: '#032D60', lineHeight: 1.2 }}>ZNA Teknoloji</h1>
              <p style={{ fontSize: '11px', color: 'var(--primary)' }}>Müşteri Portalı</p>
            </div>
          </div>

          {/* Desktop navigasyon */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const aktif = location.pathname === item.yol
              return (
                <button
                  key={item.yol}
                  onClick={() => navigate(item.yol)}
                  className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-all relative"
                  style={{
                    background: item.vurgulu
                      ? 'var(--primary)'
                      : aktif
                      ? '#e8f4fd'
                      : 'transparent',
                    color: item.vurgulu ? 'white' : aktif ? 'var(--primary)' : '#706e6b',
                    borderBottom: aktif && !item.vurgulu ? '2px solid var(--primary)' : 'none',
                    boxShadow: 'none',
                  }}
                >
                  <span>{item.ikon}</span>
                  <span>{item.isim}</span>
                  {item.rozet > 0 && (
                    <span
                      className="text-white rounded-full flex items-center justify-center"
                      style={{
                        minWidth: '18px', height: '18px', fontSize: '10px', padding: '0 4px',
                        background: '#ef4444',
                      }}
                    >
                      {item.rozet}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Kullanıcı + çıkış */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end">
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{kullanici?.ad}</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>{kullanici?.firmaAdi || 'Müşteri'}</span>
            </div>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ background: 'var(--primary)', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}
            >
              {kullanici?.ad?.charAt(0)}
            </div>
            <button
              onClick={handleCikis}
              className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all"
              style={{ color: '#706e6b', background: 'rgba(248,250,252,0.8)', border: '1px solid var(--border)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.06)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'rgba(248,250,252,0.8)' }}
            >
              <span>🚪</span>
              <span>Çıkış</span>
            </button>

            {/* Mobile hamburger */}
            <button
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl"
              style={{ background: 'rgba(1,118,211,0.08)', color: 'var(--primary)' }}
              onClick={() => setMenuAcik(!menuAcik)}
            >
              {menuAcik ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {menuAcik && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}
            >
              <div style={{ padding: '12px 24px' }}>
                <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#3e3e3c' }}>{kullanici?.ad}</p>
                  <p style={{ fontSize: '11px', color: '#706e6b' }}>{kullanici?.firmaAdi || 'Müşteri'}</p>
                </div>
                {navItems.map((item) => {
                  const aktif = location.pathname === item.yol
                  return (
                    <button
                      key={item.yol}
                      onClick={() => { navigate(item.yol); setMenuAcik(false) }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium mb-1"
                      style={{
                        background: item.vurgulu
                          ? 'var(--primary)'
                          : aktif
                          ? '#e8f4fd'
                          : 'transparent',
                        color: item.vurgulu ? 'white' : aktif ? 'var(--primary)' : '#706e6b',
                      }}
                    >
                      <span>{item.ikon}</span>
                      <span>{item.isim}</span>
                      {item.rozet > 0 && (
                        <span className="ml-auto text-white rounded-full px-2 py-0.5 text-xs" style={{ background: '#ef4444' }}>
                          {item.rozet}
                        </span>
                      )}
                    </button>
                  )
                })}
                <button
                  onClick={handleCikis}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm mt-1"
                  style={{ color: '#ef4444' }}
                >
                  <span>🚪</span>
                  <span>Çıkış Yap</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* İçerik */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

export default MusteriLayout
