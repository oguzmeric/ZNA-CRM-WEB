import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import { useBildirim } from '../context/BildirimContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import {
  LayoutDashboard, Users, CheckSquare, Phone, Calendar, Package,
  ReceiptText, KeyRound, Wrench, Truck, FolderOpen, BarChart3,
  MessageSquare, UserCog, LogOut, ChevronDown, ChevronRight, Bell,
  Palette, Check, X, Info, CheckCircle2, AlertTriangle, XCircle,
} from 'lucide-react'
import ThemePaneli from '../components/ThemePaneli'
import { Avatar } from '../components/ui'

const menuItems = [
  { id: 'dashboard', isim: 'Panel', Icon: LayoutDashboard, yol: '/dashboard', modul: null },
  {
    id: 'musteriler',
    isim: 'Müşteriler',
    Icon: Users,
    modul: 'musteriler',
    altMenu: [
      { id: 'musteri-liste', isim: 'Müşteri Listesi', yol: '/musteriler' },
      { id: 'firmalar', isim: 'Firmalar', yol: '/firmalar' },
    ],
  },
  { id: 'gorevler', isim: 'Görevler', Icon: CheckSquare, yol: '/gorevler', modul: 'gorevler' },
  { id: 'gorusmeler', isim: 'Görüşmeler', Icon: Phone, yol: '/gorusmeler', modul: 'gorusmeler' },
  { id: 'takvim', isim: 'Takvim', Icon: Calendar, yol: '/takvim', modul: null },
  {
    id: 'stok',
    isim: 'Stok',
    Icon: Package,
    modul: 'stok',
    altMenu: [
      { id: 'stok-kartlar', isim: 'Stok Kartları', yol: '/stok' },
      { id: 'stok-hareketler', isim: 'Stok Hareketleri', yol: '/stok-hareketleri' },
      { id: 'stok-opsiyon', isim: 'Stok Opsiyonları', yol: '/stok-opsiyon' },
    ],
  },
  {
    id: 'satislar',
    isim: 'Satışlar',
    Icon: ReceiptText,
    modul: 'musteriler',
    altMenu: [
      { id: 'teklif-liste', isim: 'Teklifler', yol: '/teklifler' },
      { id: 'satis-faturalari', isim: 'Satış Faturaları', yol: '/satislar' },
    ],
  },
  { id: 'trassir', isim: 'Trassir Lisanslar', Icon: KeyRound, yol: '/trassir-lisanslar', modul: 'lisanslar' },
  {
    id: 'servis',
    isim: 'Servis',
    Icon: Wrench,
    modul: 'servis_talepleri',
    altMenu: [
      { id: 'servis_talepleri', isim: 'Servis Talepleri',   yol: '/servis-talepleri' },
      { id: 'servis_raporlari', isim: 'Servis Raporları',   yol: '/servis-raporlari' },
      { id: 'memnuniyet',       isim: 'Müşteri Memnuniyeti', yol: '/memnuniyet' },
    ],
  },
  { id: 'kargolar', isim: 'Kargo Takip', Icon: Truck, yol: '/kargolar', modul: null },
  { id: 'dokuman_merkezi', isim: 'Doküman Merkezi', Icon: FolderOpen, yol: '/dokuman-merkezi', modul: null },
  {
    id: 'raporlar',
    isim: 'Raporlar',
    Icon: BarChart3,
    modul: 'raporlar',
    altMenu: [
      { id: 'raporlar-liste', isim: 'Raporlar', yol: '/raporlar' },
      { id: 'rapor-merkezi',  isim: 'Rapor Merkezi', yol: '/rapor-merkezi' },
    ],
  },
  { id: 'chat', isim: 'Mesajlar', Icon: MessageSquare, yol: '/chat', modul: null },
  { id: 'kullanici_yonetimi', isim: 'Kullanıcılar', Icon: UserCog, yol: '/kullanici-yonetimi', modul: 'kullanici_yonetimi' },
]

const durumRenkleri = {
  cevrimici: 'var(--success)',
  mesgul: 'var(--danger)',
  disarida: 'var(--warning)',
  toplantida: 'var(--brand-primary)',
  cevrimdisi: 'var(--text-tertiary)',
}

const durumIsimleri = {
  cevrimici: 'Çevrimiçi',
  mesgul: 'Meşgul',
  disarida: 'Dışarıda',
  toplantida: 'Toplantıda',
  cevrimdisi: 'Çevrimdışı',
}

const bildirimTipIcon = {
  bilgi:   { C: Info,           color: 'var(--info)' },
  basari:  { C: CheckCircle2,   color: 'var(--success)' },
  uyari:   { C: AlertTriangle,  color: 'var(--warning)' },
  hata:    { C: XCircle,        color: 'var(--danger)' },
}

const sayfaIsimleri = {
  '/dashboard': 'Panel',
  '/musteriler': 'Müşteriler',
  '/firmalar': 'Firmalar',
  '/gorevler': 'Görevler',
  '/gorusmeler': 'Görüşmeler',
  '/stok': 'Stok Kartları',
  '/stok-hareketleri': 'Stok Hareketleri',
  '/stok-opsiyon': 'Stok Opsiyonları',
  '/teklifler': 'Teklifler',
  '/satislar': 'Satış Faturaları',
  '/trassir-lisanslar': 'Trassir Lisanslar',
  '/servis-talepleri': 'Servis Talepleri',
  '/raporlar': 'Raporlar',
  '/chat': 'Mesajlar',
  '/kullanici-yonetimi': 'Kullanıcı Yönetimi',
  '/profil': 'Profilim',
}

function MainLayout({ children }) {
  const { kullanici, cikisYap, durumGuncelle } = useAuth()
  const { okunmamis } = useChat()
  const { benimBildirimlerim, okunmamisSayisi, bildirimOku, tumunuOku, bildirimSil } = useBildirim()
  const navigate = useNavigate()
  const location = useLocation()

  const [musteriAcik, setMusteriAcik] = useState(
    location.pathname.startsWith('/musteri') || location.pathname.startsWith('/firma')
  )
  const [stokAcik, setStokAcik] = useState(location.pathname.startsWith('/stok'))
  const [teklifAcik, setTeklifAcik] = useState(
    location.pathname.startsWith('/teklif') || location.pathname.startsWith('/satis')
  )
  const [raporlarAcik, setRaporlarAcik] = useState(
    location.pathname.startsWith('/raporlar') || location.pathname.startsWith('/rapor-')
  )
  const [servisAcik, setServisAcik] = useState(
    location.pathname.startsWith('/servis') || location.pathname.startsWith('/memnuniyet')
  )
  const [durumMenuAcik, setDurumMenuAcik] = useState(false)
  const [bildirimPanelAcik, setBildirimPanelAcik] = useState(false)
  const [temaPaneliAcik, setTemaPaneliAcik] = useState(false)
  const sayfaGirisZamani = useRef(null)
  const oncekiSayfa = useRef(null)

  const logKaydet = (tip, veri = {}) => {
    if (!kullanici) return
    const kayitlar = JSON.parse(localStorage.getItem('aktiviteLog') || '[]')
    kayitlar.push({
      id: crypto.randomUUID(),
      kullaniciId: kullanici.id.toString(),
      kullaniciAd: kullanici.ad,
      tip,
      tarih: new Date().toISOString(),
      ...veri,
    })
    localStorage.setItem('aktiviteLog', JSON.stringify(kayitlar))
  }

  useEffect(() => {
    if (!kullanici) return
    const simdi = Date.now()
    const sayfaAdi = Object.entries(sayfaIsimleri).find(
      ([yol]) => location.pathname === yol || location.pathname.startsWith(yol + '/')
    )?.[1] || location.pathname

    if (oncekiSayfa.current && sayfaGirisZamani.current) {
      const sure = Math.round((simdi - sayfaGirisZamani.current) / 1000)
      if (sure > 2) logKaydet('sayfa_cikis', { sayfa: oncekiSayfa.current, sureSaniye: sure })
    }
    sayfaGirisZamani.current = simdi
    oncekiSayfa.current = sayfaAdi
    logKaydet('sayfa_giris', { sayfa: sayfaAdi })
  }, [location.pathname, kullanici])

  const handleCikis = async () => {
    if (kullanici) {
      if (oncekiSayfa.current && sayfaGirisZamani.current) {
        const sure = Math.round((Date.now() - sayfaGirisZamani.current) / 1000)
        if (sure > 2) logKaydet('sayfa_cikis', { sayfa: oncekiSayfa.current, sureSaniye: sure })
      }
      logKaydet('kullanici_cikis', { aciklama: 'Sistemden çıkış yapıldı' })
    }
    await cikisYap()
    navigate('/login', { replace: true })
  }

  const gorunenMenu = menuItems.filter(
    (m) => m.modul === null || kullanici?.moduller?.includes(m.modul)
  )

  const menuAcik = (id) => {
    if (id === 'stok') return stokAcik
    if (id === 'satislar') return teklifAcik
    if (id === 'musteriler') return musteriAcik
    if (id === 'raporlar') return raporlarAcik
    if (id === 'servis') return servisAcik
    return false
  }

  const menuToggle = (id) => {
    if (id === 'stok') setStokAcik(!stokAcik)
    if (id === 'satislar') setTeklifAcik(!teklifAcik)
    if (id === 'musteriler') setMusteriAcik(!musteriAcik)
    if (id === 'raporlar') setRaporlarAcik(!raporlarAcik)
    if (id === 'servis') setServisAcik(!servisAcik)
  }

  const sayfaBasligi = () => {
    if (location.pathname === '/dashboard') return 'Panel'
    if (location.pathname === '/musteriler') return 'Müşteriler'
    if (location.pathname.startsWith('/musteriler/')) return 'Müşteri Detayı'
    if (location.pathname === '/firmalar') return 'Firmalar'
    if (location.pathname === '/stok') return 'Stok Kartları'
    if (location.pathname === '/stok-hareketleri') return 'Stok Hareketleri'
    if (location.pathname === '/stok-opsiyon') return 'Stok Opsiyonları'
    if (location.pathname === '/trassir-lisanslar') return 'Trassir Lisanslar'
    if (location.pathname === '/teklifler') return 'Teklifler'
    if (location.pathname.startsWith('/teklifler/')) return 'Teklif Detayı'
    if (location.pathname === '/satislar') return 'Satış Faturaları'
    if (location.pathname.startsWith('/satislar/')) return 'Fatura Detayı'
    if (location.pathname === '/servis-talepleri') return 'Servis Talepleri'
    if (location.pathname.startsWith('/servis-talepleri/')) return 'Servis Talep Detayı'
    if (location.pathname === '/chat') return 'Mesajlar'
    if (location.pathname === '/profil') return 'Profilim'
    if (location.pathname.startsWith('/firma-gecmisi/')) return 'Firma Geçmişi'
    const bulunan = gorunenMenu.find(
      (m) => !m.altMenu && location.pathname.startsWith(m.yol) && m.yol !== '/dashboard'
    )
    return bulunan?.isim || ''
  }

  const mevcutDurum = kullanici?.durum || 'cevrimici'

  const bildirimTikla = (b) => {
    bildirimOku(b.id)
    if (b.link) navigate(b.link)
    setBildirimPanelAcik(false)
  }

  const zamanFormat = (tarih) => {
    const fark = Date.now() - new Date(tarih).getTime()
    const dk = Math.floor(fark / 60000)
    const saat = Math.floor(dk / 60)
    const gun = Math.floor(saat / 24)
    if (dk < 1) return 'Az önce'
    if (dk < 60) return `${dk} dk önce`
    if (saat < 24) return `${saat} saat önce`
    return `${gun} gün önce`
  }

  const profilFoto = localStorage.getItem(`profil_foto_${kullanici?.id}`)

  // ─────────────────────────── Render ───────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--surface-bg)' }}>

      {/* Sidebar */}
      <aside
        style={{
          width: 248,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          background: 'var(--surface-sidebar)',
          color: 'var(--text-on-dark-muted)',
        }}
      >
        {/* Brand */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: 16,
            borderBottom: '1px solid var(--border-on-dark)',
          }}
        >
          <img src="/logo.jpeg" alt="ZNA" style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', objectFit: 'contain', background: 'var(--surface-card)' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--text-on-dark)', font: '500 14px/20px var(--font-sans)', whiteSpace: 'nowrap' }}>ZNA Teknoloji</div>
            <div style={{ color: 'var(--text-on-dark-muted)', font: '400 12px/16px var(--font-sans)' }}>Yönetim sistemi</div>
          </div>
        </div>

        {/* User */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-on-dark)', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {profilFoto ? (
                <img
                  src={profilFoto}
                  alt="Profil"
                  onClick={() => navigate('/profil')}
                  style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' }}
                />
              ) : (
                <span onClick={() => navigate('/profil')} style={{ cursor: 'pointer', display: 'inline-flex' }}>
                  <Avatar name={kullanici?.ad} size="sm" onDark />
                </span>
              )}
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  bottom: -1, right: -1,
                  width: 10, height: 10,
                  borderRadius: '50%',
                  background: durumRenkleri[mevcutDurum],
                  border: '2px solid var(--surface-sidebar)',
                }}
              />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <button
                onClick={() => navigate('/profil')}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  color: 'var(--text-on-dark)',
                  font: '500 13px/18px var(--font-sans)',
                  textAlign: 'left',
                  width: '100%',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                {kullanici?.ad}
              </button>
              <button
                onClick={() => setDurumMenuAcik(!durumMenuAcik)}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  color: durumRenkleri[mevcutDurum],
                  font: '400 12px/16px var(--font-sans)',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: durumRenkleri[mevcutDurum] }} />
                {durumIsimleri[mevcutDurum]}
                <ChevronDown size={12} strokeWidth={1.5} style={{ color: 'var(--text-on-dark-muted)' }} />
              </button>
            </div>
          </div>

          {durumMenuAcik && (
            <div
              style={{
                position: 'absolute',
                top: '100%', left: 16, right: 16,
                marginTop: 4,
                background: 'var(--surface-sidebar-active)',
                border: '1px solid var(--border-on-dark)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                zIndex: 'var(--z-dropdown)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              {Object.entries(durumIsimleri).map(([key, isim]) => (
                <button
                  key={key}
                  onClick={() => { durumGuncelle(key); setDurumMenuAcik(false) }}
                  style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--text-on-dark)',
                    font: '400 13px/18px var(--font-sans)',
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: durumRenkleri[key], flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{isim}</span>
                  {mevcutDurum === key && <Check size={14} strokeWidth={2} style={{ color: 'var(--brand-primary)' }} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Nav */}
        <nav aria-label="Ana menü" style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {gorunenMenu.map(item => {
            if (item.altMenu) {
              const altAktif = item.altMenu.some(a => location.pathname === a.yol || location.pathname.startsWith(a.yol + '/'))
              const acik = menuAcik(item.id)
              return (
                <div key={item.id}>
                  <button
                    onClick={() => menuToggle(item.id)}
                    style={{
                      width: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      background: altAktif ? 'var(--surface-sidebar-active)' : 'transparent',
                      color: altAktif ? 'var(--text-on-dark)' : 'var(--text-on-dark-muted)',
                      border: 'none',
                      borderLeft: `3px solid ${altAktif ? 'var(--brand-primary)' : 'transparent'}`,
                      paddingLeft: 9,
                      cursor: 'pointer',
                      font: altAktif ? '500 13px/18px var(--font-sans)' : '400 13px/18px var(--font-sans)',
                      transition: 'background 120ms, color 120ms',
                    }}
                    onMouseEnter={e => { if (!altAktif) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-on-dark)' } }}
                    onMouseLeave={e => { if (!altAktif) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-on-dark-muted)' } }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <item.Icon size={16} strokeWidth={1.5} />
                      {item.isim}
                    </span>
                    {acik ? <ChevronDown size={14} strokeWidth={1.5} /> : <ChevronRight size={14} strokeWidth={1.5} />}
                  </button>
                  {acik && (
                    <div style={{ marginLeft: 24, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2, marginBottom: 4 }}>
                      {item.altMenu.map(alt => {
                        const aktif = location.pathname === alt.yol || location.pathname.startsWith(alt.yol + '/')
                        return (
                          <button
                            key={alt.id}
                            onClick={() => navigate(alt.yol)}
                            style={{
                              width: '100%', textAlign: 'left',
                              padding: '6px 12px',
                              borderRadius: 'var(--radius-sm)',
                              background: aktif ? 'var(--surface-sidebar-active)' : 'transparent',
                              color: aktif ? 'var(--text-on-dark)' : 'var(--text-on-dark-muted)',
                              border: 'none',
                              cursor: 'pointer',
                              font: aktif ? '500 13px/18px var(--font-sans)' : '400 13px/18px var(--font-sans)',
                            }}
                            onMouseEnter={e => { if (!aktif) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-on-dark)' } }}
                            onMouseLeave={e => { if (!aktif) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-on-dark-muted)' } }}
                          >
                            {alt.isim}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            const aktif = location.pathname === item.yol ||
              (item.yol !== '/dashboard' && location.pathname.startsWith(item.yol))
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.yol)}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: aktif ? 'var(--surface-sidebar-active)' : 'transparent',
                  color: aktif ? 'var(--text-on-dark)' : 'var(--text-on-dark-muted)',
                  border: 'none',
                  borderLeft: `3px solid ${aktif ? 'var(--brand-primary)' : 'transparent'}`,
                  paddingLeft: 9,
                  cursor: 'pointer',
                  font: aktif ? '500 13px/18px var(--font-sans)' : '400 13px/18px var(--font-sans)',
                  transition: 'background 120ms, color 120ms',
                }}
                onMouseEnter={e => { if (!aktif) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-on-dark)' } }}
                onMouseLeave={e => { if (!aktif) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-on-dark-muted)' } }}
                aria-current={aktif ? 'page' : undefined}
              >
                {item.id === 'trassir'
                  ? <img src="/trassirlogo.png" alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                  : <item.Icon size={16} strokeWidth={1.5} />}
                <span style={{ flex: 1, textAlign: 'left' }}>{item.isim}</span>
                {item.id === 'chat' && okunmamis > 0 && (
                  <span style={{
                    minWidth: 18, height: 18, padding: '0 5px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--danger)', color: '#fff',
                    fontSize: 11, fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {okunmamis}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: 8, borderTop: '1px solid var(--border-on-dark)' }}>
          <button
            onClick={handleCikis}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--text-on-dark-muted)',
              border: 'none',
              cursor: 'pointer',
              font: '400 13px/18px var(--font-sans)',
              transition: 'background 120ms, color 120ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(178,58,58,0.12)'; e.currentTarget.style.color = '#E88B8B' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-on-dark-muted)' }}
          >
            <LogOut size={16} strokeWidth={1.5} />
            <span>Çıkış Yap</span>
          </button>
        </div>
      </aside>

      {/* Content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Topbar */}
        <header
          style={{
            height: 56,
            flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 24px',
            background: 'var(--surface-card)',
            borderBottom: '1px solid var(--border-default)',
            position: 'relative',
            zIndex: 'var(--z-sticky)',
          }}
        >
          <h1 style={{ font: '600 20px/28px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>
            {sayfaBasligi()}
          </h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Tema */}
            <button
              onClick={() => setTemaPaneliAcik(!temaPaneliAcik)}
              aria-label="Tema"
              style={{
                width: 36, height: 36,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: temaPaneliAcik ? 'var(--surface-sunken)' : 'transparent',
                border: '1px solid transparent',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'background 120ms, color 120ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-sunken)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { if (!temaPaneliAcik) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
            >
              <Palette size={18} strokeWidth={1.5} />
            </button>

            {/* Bildirim */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setBildirimPanelAcik(!bildirimPanelAcik)}
                aria-label="Bildirimler"
                style={{
                  width: 36, height: 36,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: bildirimPanelAcik ? 'var(--surface-sunken)' : 'transparent',
                  border: '1px solid transparent',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  position: 'relative',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-sunken)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { if (!bildirimPanelAcik) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
              >
                <Bell size={18} strokeWidth={1.5} />
                {okunmamisSayisi > 0 && (
                  <span
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      minWidth: 16, height: 16, padding: '0 4px',
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--danger)', color: '#fff',
                      fontSize: 10, fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      border: '2px solid var(--surface-card)',
                    }}
                  >
                    {okunmamisSayisi > 9 ? '9+' : okunmamisSayisi}
                  </span>
                )}
              </button>

              {bildirimPanelAcik && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0, top: 44,
                    width: 340,
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-lg)',
                    overflow: 'hidden',
                    zIndex: 'var(--z-dropdown)',
                  }}
                >
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>Bildirimler</span>
                      {okunmamisSayisi > 0 && (
                        <span style={{
                          padding: '1px 7px',
                          borderRadius: 'var(--radius-pill)',
                          background: 'var(--danger-soft)', color: 'var(--danger)',
                          font: '500 11px/16px var(--font-sans)',
                        }}>
                          {okunmamisSayisi} yeni
                        </span>
                      )}
                    </div>
                    {okunmamisSayisi > 0 && (
                      <button
                        onClick={tumunuOku}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--brand-primary)',
                          font: '500 12px/16px var(--font-sans)',
                        }}
                      >
                        Tümünü oku
                      </button>
                    )}
                  </div>
                  <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                    {benimBildirimlerim.length === 0 ? (
                      <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-tertiary)', font: '400 13px/18px var(--font-sans)' }}>
                        Henüz bildirim yok
                      </div>
                    ) : (
                      benimBildirimlerim.map(b => {
                        const tip = bildirimTipIcon[b.tip] ?? bildirimTipIcon.bilgi
                        const IconC = tip.C
                        return (
                          <div
                            key={b.id}
                            onClick={() => bildirimTikla(b)}
                            style={{
                              padding: '12px 16px',
                              borderBottom: '1px solid var(--border-default)',
                              background: !b.okundu ? 'var(--brand-primary-soft)' : 'transparent',
                              cursor: 'pointer',
                              display: 'flex', alignItems: 'flex-start', gap: 10,
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                            onMouseLeave={e => e.currentTarget.style.background = !b.okundu ? 'var(--brand-primary-soft)' : 'transparent'}
                          >
                            <span style={{ color: tip.color, display: 'inline-flex', marginTop: 2 }}>
                              <IconC size={16} strokeWidth={1.5} />
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{b.baslik}</div>
                              <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)', marginTop: 2 }}>{b.mesaj}</div>
                              <div style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>{zamanFormat(b.tarih)}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              {!b.okundu && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand-primary)' }} />}
                              <button
                                onClick={e => { e.stopPropagation(); bildirimSil(b.id) }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 2, display: 'inline-flex' }}
                                onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
                              >
                                <X size={14} strokeWidth={1.5} />
                              </button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Durum pill */}
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)',
                font: '500 12px/16px var(--font-sans)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: durumRenkleri[mevcutDurum] }} />
              {durumIsimleri[mevcutDurum]}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main
          style={{ flex: 1, overflowY: 'auto', background: 'var(--surface-bg)' }}
          onClick={() => setBildirimPanelAcik(false)}
        >
          {children}
        </main>
      </div>

      <ThemePaneli acik={temaPaneliAcik} kapat={() => setTemaPaneliAcik(false)} />
    </div>
  )
}

export default MainLayout
