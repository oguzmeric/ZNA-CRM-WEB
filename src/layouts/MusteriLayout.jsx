import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useServisTalebi } from '../context/ServisTalebiContext'
import { useNavigate, useLocation, NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Inbox, Briefcase, Plus, Settings, LogOut,
  Search, Bell, Menu, X, ChevronDown,
} from 'lucide-react'

// Mavi tonları — sadece müşteri portalı kapsamında kullanılır.
// brand-primary (#1E5AA8) ile tutarlı, etrafına açık/koyu varyantlar eklendi.
export const PORTAL_BLUE = {
  50:  '#E8EFF8',
  100: '#C7D8EE',
  200: '#94B5DE',
  400: '#5287C5',
  600: '#1E5AA8',
  800: '#133B70',
  900: '#0A2550',
}

const SIDEBAR_WIDTH = 208

function SidebarLink({ to, icon: Icon, children, end, badge }) {
  return (
    <NavLink
      to={to}
      end={end}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        borderRadius: 'var(--radius-sm)',
        textDecoration: 'none',
        background: isActive ? PORTAL_BLUE[50] : 'transparent',
        color: isActive ? PORTAL_BLUE[800] : 'var(--text-secondary)',
        font: `${isActive ? 500 : 400} 13px/18px var(--font-sans)`,
        transition: 'background 120ms, color 120ms',
      })}
      onMouseEnter={e => {
        if (!e.currentTarget.style.background || e.currentTarget.style.background === 'transparent')
          e.currentTarget.style.background = 'var(--surface-sunken)'
      }}
      onMouseLeave={e => {
        // NavLink yeniden render edince tekrar doğru renge döner; hover state için
        // cache'lediğimiz bir aktiflik bilgisi yok, bu yüzden güvenli reset yapıyoruz.
        const isActive = e.currentTarget.getAttribute('aria-current') === 'page'
        e.currentTarget.style.background = isActive ? PORTAL_BLUE[50] : 'transparent'
      }}
    >
      <Icon size={15} strokeWidth={1.6} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {children}
      </span>
      {badge > 0 && (
        <span
          aria-label={`${badge} aktif`}
          style={{
            minWidth: 18, height: 18,
            padding: '0 5px',
            borderRadius: 'var(--radius-pill)',
            background: PORTAL_BLUE[600],
            color: '#fff',
            font: '500 10px/18px var(--font-sans)',
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {badge}
        </span>
      )}
    </NavLink>
  )
}

function UserChip({ kullanici, onCikis }) {
  const [acik, setAcik] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!acik) return
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setAcik(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [acik])

  const initial = (kullanici?.ad || '?').trim().charAt(0).toUpperCase()

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={acik}
        onClick={() => setAcik(a => !a)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          height: 36, padding: '0 10px 0 4px',
          background: 'var(--surface-sunken)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-pill)',
          cursor: 'pointer',
          font: '500 12px/16px var(--font-sans)',
          color: 'var(--text-primary)',
          transition: 'background 120ms',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 28, height: 28, borderRadius: '50%',
            background: PORTAL_BLUE[50], color: PORTAL_BLUE[800],
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            font: '500 12px/1 var(--font-sans)',
          }}
        >
          {initial}
        </span>
        <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {kullanici?.ad}
        </span>
        <ChevronDown size={13} strokeWidth={1.6} style={{ color: 'var(--text-tertiary)' }} />
      </button>

      <AnimatePresence>
        {acik && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            style={{
              position: 'absolute', top: 42, right: 0, minWidth: 220,
              background: 'var(--surface-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              padding: 6,
              zIndex: 300,
            }}
          >
            <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--border-default)', marginBottom: 4 }}>
              <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{kullanici?.ad}</div>
              {kullanici?.firmaAdi && (
                <div style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {kullanici.firmaAdi}
                </div>
              )}
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={onCikis}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px',
                background: 'transparent', border: 'none', cursor: 'pointer',
                font: '400 13px/18px var(--font-sans)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-sm)',
                textAlign: 'left',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <LogOut size={14} strokeWidth={1.6} />
              Çıkış yap
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function MusteriLayout({ children }) {
  const { kullanici, cikisYap } = useAuth()
  const { musteriTalepleri } = useServisTalebi()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileAcik, setMobileAcik] = useState(false)

  const talepler = musteriTalepleri(kullanici?.id)
  const acikTalepler = talepler.filter(t => !['tamamlandi', 'iptal'].includes(t.durum))

  const izinliTurler = kullanici?.izinliTurler
  const teklifIzinli =
    !izinliTurler || izinliTurler.length === 0 || izinliTurler.includes('teklif')

  const handleCikis = async () => {
    await cikisYap()
    navigate('/login', { replace: true })
  }

  const SidebarBody = (
    <>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '16px 14px',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        <img
          src="/logo.jpeg"
          alt="ZNA"
          style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain' }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ font: '500 13px/16px var(--font-sans)', color: 'var(--text-primary)' }}>ZNA Teknoloji</div>
          <div style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>Müşteri portalı</div>
        </div>
      </div>

      <nav aria-label="Portal menüsü" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        <SidebarLink to="/musteri-portal" icon={LayoutDashboard} end>Ana panel</SidebarLink>
        <SidebarLink to="/musteri-portal/taleplerim" icon={Inbox} badge={acikTalepler.length}>Taleplerim</SidebarLink>
        {teklifIzinli && (
          <SidebarLink to="/musteri-portal/teklif-iste" icon={Briefcase}>Teklif iste</SidebarLink>
        )}
        <SidebarLink to="/musteri-portal/yeni-talep" icon={Plus}>Yeni talep</SidebarLink>
      </nav>

      <div style={{ padding: 8, borderTop: '1px solid var(--border-default)' }}>
        <button
          type="button"
          onClick={handleCikis}
          style={{
            width: '100%',
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px',
            border: 'none', background: 'transparent', cursor: 'pointer',
            borderRadius: 'var(--radius-sm)',
            font: '400 13px/18px var(--font-sans)',
            color: 'var(--text-secondary)',
            textAlign: 'left',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-sunken)'; e.currentTarget.style.color = 'var(--danger)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          <LogOut size={15} strokeWidth={1.6} />
          <span>Çıkış yap</span>
        </button>
      </div>
    </>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-bg)', display: 'flex' }}>

      {/* Desktop sidebar */}
      <aside
        aria-label="Portal navigasyon"
        className="musteri-sidebar-desktop"
        style={{
          width: SIDEBAR_WIDTH,
          background: 'var(--surface-card)',
          borderRight: '1px solid var(--border-default)',
          position: 'sticky',
          top: 0,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        {SidebarBody}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileAcik && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setMobileAcik(false)}
              style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', zIndex: 300 }}
            />
            <motion.aside
              initial={{ x: -SIDEBAR_WIDTH }}
              animate={{ x: 0 }}
              exit={{ x: -SIDEBAR_WIDTH }}
              transition={{ duration: 0.2 }}
              style={{
                position: 'fixed', left: 0, top: 0, height: '100vh',
                width: SIDEBAR_WIDTH,
                background: 'var(--surface-card)',
                borderRight: '1px solid var(--border-default)',
                display: 'flex', flexDirection: 'column',
                zIndex: 310,
              }}
              onClick={() => setMobileAcik(false)}
            >
              {SidebarBody}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Ana kolon */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>

        {/* Topbar */}
        <header
          style={{
            height: 56,
            padding: '0 20px',
            background: 'var(--surface-card)',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            position: 'sticky', top: 0, zIndex: 200,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <button
              type="button"
              aria-label="Menüyü aç"
              className="musteri-hamburger"
              onClick={() => setMobileAcik(true)}
              style={{
                width: 36, height: 36, border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)', background: 'var(--surface-card)',
                display: 'none', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--text-secondary)',
              }}
            >
              <Menu size={16} strokeWidth={1.6} />
            </button>

            <label
              style={{
                position: 'relative', maxWidth: 320, width: '100%',
                display: 'flex', alignItems: 'center',
              }}
            >
              <Search
                size={14}
                strokeWidth={1.6}
                style={{ position: 'absolute', left: 10, color: 'var(--text-tertiary)', pointerEvents: 'none' }}
              />
              <input
                type="search"
                placeholder="Talep, belge, SSS ara…"
                aria-label="Portalda ara"
                style={{
                  height: 36, width: '100%',
                  padding: '0 10px 0 30px',
                  background: 'var(--surface-sunken)',
                  border: '1px solid transparent',
                  borderRadius: 'var(--radius-sm)',
                  font: '400 13px/20px var(--font-sans)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  transition: 'background 120ms, border-color 120ms',
                }}
                onFocus={e => { e.currentTarget.style.background = 'var(--surface-card)'; e.currentTarget.style.borderColor = PORTAL_BLUE[400] }}
                onBlur={e => { e.currentTarget.style.background = 'var(--surface-sunken)'; e.currentTarget.style.borderColor = 'transparent' }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              aria-label="Bildirimler"
              style={{
                position: 'relative',
                width: 36, height: 36,
                borderRadius: '50%',
                border: '1px solid var(--border-default)',
                background: 'var(--surface-card)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'background 120ms',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-card)'}
            >
              <Bell size={15} strokeWidth={1.6} />
              {acikTalepler.length > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute', top: -2, right: -2,
                    minWidth: 16, height: 16, padding: '0 4px',
                    borderRadius: 'var(--radius-pill)',
                    background: PORTAL_BLUE[600], color: '#fff',
                    font: '500 10px/16px var(--font-sans)',
                    border: '2px solid var(--surface-card)',
                    boxSizing: 'content-box',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {acikTalepler.length}
                </span>
              )}
            </button>

            <UserChip kullanici={kullanici} onCikis={handleCikis} />
          </div>
        </header>

        {/* İçerik alanı */}
        <main style={{ flex: 1, padding: 24 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Responsive — sidebar'ı <1024px altında gizle, hamburger görünsün */}
      <style>{`
        @media (max-width: 1023px) {
          .musteri-sidebar-desktop { display: none !important; }
          .musteri-hamburger { display: inline-flex !important; }
        }
      `}</style>
    </div>
  )
}
