import { NavLink } from 'react-router-dom'

export function Sidebar({ children, width = 248, style }) {
  return (
    <aside
      style={{
        width,
        height: '100vh',
        position: 'sticky',
        top: 0,
        background: 'var(--surface-sidebar)',
        color: 'var(--text-on-dark-muted)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </aside>
  )
}

export function SidebarBrand({ logo, title, subtitle }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: 16,
        borderBottom: '1px solid var(--border-on-dark)',
      }}
    >
      {logo}
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--text-on-dark)', font: '500 14px/20px var(--font-sans)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ color: 'var(--text-on-dark-muted)', font: '400 12px/16px var(--font-sans)' }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  )
}

export function SidebarSection({ children, style }) {
  return (
    <nav
      aria-label="Ana menü"
      style={{
        padding: 8,
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        ...style,
      }}
    >
      {children}
    </nav>
  )
}

/**
 * SidebarItem — react-router NavLink'e bağlı.
 * props: to, icon (lucide element), children (label), end (NavLink 'end')
 */
export function SidebarItem({ to, icon, children, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        borderRadius: 'var(--radius-sm)',
        color: isActive ? 'var(--text-on-dark)' : 'var(--text-on-dark-muted)',
        background: isActive ? 'var(--surface-sidebar-active)' : 'transparent',
        borderLeft: '3px solid',
        borderLeftColor: isActive ? 'var(--brand-primary)' : 'transparent',
        paddingLeft: 9,
        textDecoration: 'none',
        font: isActive ? '500 13px/18px var(--font-sans)' : '400 13px/18px var(--font-sans)',
        transition: 'background 120ms, color 120ms',
      })}
    >
      <span style={{ flexShrink: 0, display: 'inline-flex' }}>{icon}</span>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {children}
      </span>
    </NavLink>
  )
}

export default Sidebar
