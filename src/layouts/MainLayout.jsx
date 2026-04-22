import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import { useBildirim } from '../context/BildirimContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ThemePaneli from '../components/ThemePaneli'

function NeuralBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animId

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const onResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    window.addEventListener('resize', onResize)

    const NOKTA_SAYISI = 70
    const noktalar = Array.from({ length: NOKTA_SAYISI }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      r: Math.random() * 2 + 1.5,
      pulse: Math.random() * Math.PI * 2,
    }))

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      noktalar.forEach((n) => {
        n.x += n.vx
        n.y += n.vy
        n.pulse += 0.02
        if (n.x < 0 || n.x > canvas.width) n.vx *= -1
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1
        const boyut = n.r + Math.sin(n.pulse) * 0.8
        ctx.beginPath()
        ctx.arc(n.x, n.y, boyut, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(1, 118, 211, 0.5)'
        ctx.fill()
      })
      for (let i = 0; i < noktalar.length; i++) {
        for (let j = i + 1; j < noktalar.length; j++) {
          const dx = noktalar[i].x - noktalar[j].x
          const dy = noktalar[i].y - noktalar[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 140) {
            const alpha = (1 - dist / 140) * 0.25
            ctx.beginPath()
            ctx.moveTo(noktalar[i].x, noktalar[i].y)
            ctx.lineTo(noktalar[j].x, noktalar[j].y)
            ctx.strokeStyle = `rgba(1, 68, 134, ${alpha})`
            ctx.lineWidth = 0.8
            ctx.stroke()
          }
        }
      }
      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100vw', height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.5,
      }}
    />
  )
}

const menuItems = [
  { id: 'dashboard', isim: 'Dashboard', ikon: '▣', yol: '/dashboard', modul: null },
  {
    id: 'musteriler',
    isim: 'Müşteriler',
    ikon: '👥',
    modul: 'musteriler',
    altMenu: [
      { id: 'musteri-liste', isim: 'Müşteri Listesi', yol: '/musteriler' },
      { id: 'firmalar', isim: 'Firmalar', yol: '/firmalar' },
    ],
  },
  { id: 'gorevler', isim: 'Görevler', ikon: '✅', yol: '/gorevler', modul: 'gorevler' },
  { id: 'gorusmeler', isim: 'Görüşmeler', ikon: '📞', yol: '/gorusmeler', modul: 'gorusmeler' },
  { id: 'takvim', isim: 'Takvim', ikon: '📅', yol: '/takvim', modul: null },
  {
    id: 'stok',
    isim: 'Stok',
    ikon: '📦',
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
    ikon: '🧾',
    modul: 'musteriler',
    altMenu: [
      { id: 'teklif-liste', isim: 'Teklifler', yol: '/teklifler' },
      { id: 'satis-faturalari', isim: 'Satış Faturaları', yol: '/satislar' },
    ],
  },
  { id: 'trassir', isim: 'Trassir Lisanslar', ikon: null, yol: '/trassir-lisanslar', modul: 'lisanslar' },
  {
    id: 'servis',
    isim: 'Servis',
    ikon: '🛎️',
    modul: 'servis_talepleri',
    altMenu: [
      { id: 'servis_talepleri', isim: 'Servis Talepleri',   yol: '/servis-talepleri' },
      { id: 'memnuniyet',       isim: 'Müşteri Memnuniyeti', yol: '/memnuniyet' },
    ],
  },
  { id: 'kargolar', isim: 'Kargo Takip', ikon: '📦', yol: '/kargolar', modul: null },
  { id: 'dokuman_merkezi', isim: 'Doküman Merkezi', ikon: '📚', yol: '/dokuman-merkezi', modul: null },
  {
    id: 'raporlar',
    isim: 'Raporlar',
    ikon: '📊',
    modul: 'raporlar',
    altMenu: [
      { id: 'raporlar-liste', isim: 'Raporlar', yol: '/raporlar' },
      { id: 'rapor-merkezi',  isim: 'Rapor Merkezi', yol: '/rapor-merkezi' },
    ],
  },
  { id: 'chat', isim: 'Mesajlar', ikon: '💬', yol: '/chat', modul: null },
  { id: 'kullanici_yonetimi', isim: 'Kullanıcılar', ikon: '⚙️', yol: '/kullanici-yonetimi', modul: 'kullanici_yonetimi' },
]

const durumRenkleri = {
  cevrimici: '#22c55e',
  mesgul: '#ef4444',
  disarida: '#f59e0b',
  toplantida: '#014486',
  cevrimdisi: '#6b7280',
}

const durumIsimleri = {
  cevrimici: 'Çevrimiçi',
  mesgul: 'Meşgul',
  disarida: 'Dışarıda',
  toplantida: 'Toplantıda',
  cevrimdisi: 'Çevrimdışı',
}

const bildirimTipIkon = {
  bilgi: '🔔',
  basari: '✅',
  uyari: '⚠️',
  hata: '❌',
}

const sayfaIsimleri = {
  '/dashboard': 'Dashboard',
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

  const handleCikis = () => {
    if (kullanici) {
      if (oncekiSayfa.current && sayfaGirisZamani.current) {
        const sure = Math.round((Date.now() - sayfaGirisZamani.current) / 1000)
        if (sure > 2) logKaydet('sayfa_cikis', { sayfa: oncekiSayfa.current, sureSaniye: sure })
      }
      logKaydet('kullanici_cikis', { aciklama: 'Sistemden çıkış yapıldı' })
    }
    cikisYap()
    navigate('/login')
  }

  const gorunenMenu = menuItems.filter(
    (m) => m.modul === null || kullanici?.moduller?.includes(m.modul)
  )

  const menuAcik = (id) => {
    if (id === 'stok') return stokAcik
    if (id === 'satislar') return teklifAcik
    if (id === 'teklifler') return teklifAcik
    if (id === 'musteriler') return musteriAcik
    if (id === 'raporlar') return raporlarAcik
    if (id === 'servis') return servisAcik
    return false
  }

  const menuToggle = (id) => {
    if (id === 'stok') setStokAcik(!stokAcik)
    if (id === 'satislar') setTeklifAcik(!teklifAcik)
    if (id === 'teklifler') setTeklifAcik(!teklifAcik)
    if (id === 'musteriler') setMusteriAcik(!musteriAcik)
    if (id === 'raporlar') setRaporlarAcik(!raporlarAcik)
    if (id === 'servis') setServisAcik(!servisAcik)
  }

  const sayfaBasligi = () => {
    if (location.pathname === '/dashboard') return 'Dashboard'
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

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', position: 'relative', background: 'var(--bg-page, #f4f6f9)' }}>

      <NeuralBackground />

      {/* Sidebar */}
      <div className="sidebar-gradient" style={{ width: '240px', display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'relative', zIndex: 10, borderRight: '1px solid rgba(1,118,211,0.15)' }}>

        <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }} className="flex items-center gap-3">
          <img src="/logo.jpeg" alt="ZNA Logo" className="w-10 h-10 object-contain rounded-xl" style={{ boxShadow: 'none' }} />
          <div>
            <h1 className="text-white font-bold text-sm tracking-tight">ZNA Teknoloji</h1>
            <p style={{ color: 'rgba(165,180,252,0.7)', fontSize: '11px' }}>Yönetim Sistemi</p>
          </div>
        </div>

        <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              {profilFoto ? (
                <img
                  src={profilFoto}
                  alt="Profil"
                  className="w-9 h-9 rounded-full object-cover cursor-pointer"
                  style={{ boxShadow: '0 0 0 2px rgba(1,118,211,0.5)' }}
                  onClick={() => navigate('/profil')}
                />
              ) : (
                <div
                  onClick={() => navigate('/profil')}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold cursor-pointer"
                  style={{ background: '#0176D3', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}
                >
                  {kullanici?.ad?.charAt(0)}
                </div>
              )}
              <div
                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                style={{ backgroundColor: durumRenkleri[mevcutDurum], borderColor: '#032D60' }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <button
                onClick={() => navigate('/profil')}
                className="text-white text-sm font-medium truncate hover:text-blue-300 transition text-left w-full block"
              >
                {kullanici?.ad}
              </button>
              <button
                onClick={() => setDurumMenuAcik(!durumMenuAcik)}
                className="text-xs flex items-center gap-1 hover:opacity-80 transition"
                style={{ color: durumRenkleri[mevcutDurum] }}
              >
                <span className="status-dot" style={{ backgroundColor: durumRenkleri[mevcutDurum], width: '6px', height: '6px' }} />
                <span>{durumIsimleri[mevcutDurum]}</span>
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>▾</span>
              </button>
            </div>
          </div>

          <AnimatePresence>
            {durumMenuAcik && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="mt-3 rounded-xl overflow-hidden"
                style={{ background: 'rgba(3,45,96,0.95)', border: '1px solid rgba(1,118,211,0.2)' }}
              >
                {Object.entries(durumIsimleri).map(([key, isim]) => (
                  <button
                    key={key}
                    onClick={() => { durumGuncelle(key); setDurumMenuAcik(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5 transition"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: durumRenkleri[key] }} />
                    <span style={{ color: 'rgba(226,232,240,0.9)' }}>{isim}</span>
                    {mevcutDurum === key && <span className="ml-auto text-blue-400 text-xs">✓</span>}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <nav className="flex-1 overflow-y-auto" style={{ padding: '12px 10px' }}>
          {gorunenMenu.map((item) => {
            if (item.altMenu) {
              const altAktif = item.altMenu.some((a) => location.pathname === a.yol || location.pathname.startsWith(a.yol + '/'))
              const acik = menuAcik(item.id)
              return (
                <div key={item.id}>
                  <button
                    onClick={() => menuToggle(item.id)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl mb-0.5 text-sm transition-all"
                    style={{
                      background: altAktif ? 'rgba(1,118,211,0.15)' : 'transparent',
                      color: altAktif ? 'rgba(165,180,252,1)' : 'rgba(148,163,184,0.8)',
                    }}
                    onMouseEnter={(e) => { if (!altAktif) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                    onMouseLeave={(e) => { if (!altAktif) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base">{item.ikon}</span>
                      <span className="font-medium">{item.isim}</span>
                    </div>
                    <span className="text-xs opacity-50">{acik ? '▾' : '▸'}</span>
                  </button>
                  <AnimatePresence>
                    {acik && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="ml-4 mb-1 overflow-hidden"
                      >
                        {item.altMenu.map((alt) => {
                          const aktif = location.pathname === alt.yol || location.pathname.startsWith(alt.yol + '/')
                          return (
                            <button
                              key={alt.id}
                              onClick={() => navigate(alt.yol)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl mb-0.5 text-sm transition-all"
                              style={{
                                background: aktif ? '#0176D3' : 'transparent',
                                color: aktif ? 'white' : 'rgba(148,163,184,0.7)',
                                boxShadow: 'none',
                              }}
                            >
                              <span className="text-xs opacity-50">—</span>
                              <span>{alt.isim}</span>
                            </button>
                          )
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            }

            const aktif = location.pathname === item.yol ||
              (item.yol !== '/dashboard' && location.pathname.startsWith(item.yol))
            return (
              <motion.button
                key={item.id}
                onClick={() => navigate(item.yol)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5 text-sm font-medium"
                style={{
                  background: aktif ? '#0176D3' : 'transparent',
                  color: aktif ? 'white' : 'rgba(148,163,184,0.8)',
                  boxShadow: 'none',
                }}
                whileHover={{ x: aktif ? 0 : 3 }}
                whileTap={{ scale: 0.98 }}
                onMouseEnter={(e) => { if (!aktif) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={(e) => { if (!aktif) e.currentTarget.style.background = 'transparent' }}
              >
                {item.id === 'trassir'
                  ? <img src="/trassirlogo.png" alt="Trassir" className="w-5 h-5 object-contain rounded" />
                  : <span className="text-base">{item.ikon}</span>
                }
                <span className="flex-1 text-left">{item.isim}</span>
                {item.id === 'chat' && okunmamis > 0 && (
                  <span className="text-white text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', fontSize: '10px' }}>
                    {okunmamis}
                  </span>
                )}
              </motion.button>
            )
          })}
        </nav>

        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={handleCikis}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all"
            style={{ color: 'rgba(148,163,184,0.7)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#f87171' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(148,163,184,0.7)' }}
          >
            <span>🚪</span>
            <span>Çıkış Yap</span>
          </button>
        </div>
      </div>

      {/* Ana içerik */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', zIndex: 10 }}>

        <div
          className="flex items-center justify-between flex-shrink-0"
          style={{
            padding: '14px 24px',
            background: 'var(--bg-header, #ffffff)',
            borderBottom: '1px solid var(--border, #dddbda)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
            position: 'relative',
            zIndex: 100,
          }}
        >
          <h2 className="font-semibold" style={{ fontSize: '15px', color: 'var(--text-primary, #374151)' }}>{sayfaBasligi()}</h2>

          <div className="flex items-center gap-3">

            {/* Tema butonu */}
            <motion.button
              onClick={() => setTemaPaneliAcik(!temaPaneliAcik)}
              className="relative flex items-center justify-center rounded-xl transition-all"
              style={{
                width: '36px', height: '36px',
                background: temaPaneliAcik ? 'rgba(1,118,211,0.1)' : 'var(--bg-hover, rgba(248,250,252,0.8))',
                border: '1px solid var(--border, #dddbda)',
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Tema Seçimi"
            >
              <span style={{ fontSize: '16px' }}>🎨</span>
            </motion.button>

            <div className="relative">
              <motion.button
                onClick={() => setBildirimPanelAcik(!bildirimPanelAcik)}
                className="relative flex items-center justify-center rounded-xl transition-all"
                style={{
                  width: '36px', height: '36px',
                  background: bildirimPanelAcik ? 'rgba(1,118,211,0.1)' : 'rgba(248,250,252,0.8)',
                  border: '1px solid #dddbda',
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <span style={{ fontSize: '16px' }}>🔔</span>
                {okunmamisSayisi > 0 && (
                  <span
                    className="absolute -top-1 -right-1 text-white rounded-full flex items-center justify-center"
                    style={{
                      width: '16px', height: '16px', fontSize: '9px',
                      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                      boxShadow: '0 2px 8px rgba(239,68,68,0.4)',
                    }}
                  >
                    {okunmamisSayisi > 9 ? '9+' : okunmamisSayisi}
                  </span>
                )}
              </motion.button>

              <AnimatePresence>
                {bildirimPanelAcik && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '48px',
                      width: '320px',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      zIndex: 9999,
                      background: 'var(--bg-card, #ffffff)',
                      border: '1px solid var(--border, #dddbda)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}
                  >
                    <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #dddbda' }}>
                      <p className="font-semibold text-gray-800 text-sm">
                        Bildirimler
                        {okunmamisSayisi > 0 && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                            {okunmamisSayisi} yeni
                          </span>
                        )}
                      </p>
                      {okunmamisSayisi > 0 && (
                        <button onClick={tumunuOku} className="text-xs text-blue-500 hover:text-blue-700 transition">
                          Tümünü oku
                        </button>
                      )}
                    </div>
                    <div style={{ maxHeight: '384px', overflowY: 'auto' }}>
                      {benimBildirimlerim.length === 0 ? (
                        <div className="px-4 py-8 text-center text-gray-400 text-sm">Henüz bildirim yok</div>
                      ) : (
                        benimBildirimlerim.map((b) => (
                          <div
                            key={b.id}
                            className="px-4 py-3 cursor-pointer transition-all"
                            style={{
                              borderBottom: '1px solid rgba(1,118,211,0.06)',
                              background: !b.okundu ? 'rgba(1,118,211,0.04)' : 'transparent',
                            }}
                            onClick={() => bildirimTikla(b)}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(1,118,211,0.08)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = !b.okundu ? 'rgba(1,118,211,0.04)' : 'transparent'}
                          >
                            <div className="flex items-start gap-3">
                              <span style={{ fontSize: '15px' }}>{bildirimTipIkon[b.tip] || '🔔'}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800">{b.baslik}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{b.mesaj}</p>
                                <p className="text-xs text-gray-400 mt-1">{zamanFormat(b.tarih)}</p>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {!b.okundu && <div className="w-2 h-2 rounded-full" style={{ background: '#0176D3' }} />}
                                <button
                                  onClick={(e) => { e.stopPropagation(); bildirimSil(b.id) }}
                                  className="text-gray-300 hover:text-red-400 transition text-xs"
                                >✕</button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
              style={{
                background: 'var(--bg-hover, rgba(248,250,252,0.8))',
                border: '1px solid var(--border, #dddbda)',
              }}
            >
              <span className="status-dot" style={{ backgroundColor: durumRenkleri[mevcutDurum], width: '7px', height: '7px' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary, #374151)' }}>{durumIsimleri[mevcutDurum]}</span>
            </div>
          </div>
        </div>

        <div
          style={{ flex: 1, overflowY: 'auto', backgroundColor: 'transparent', position: 'relative', zIndex: 1 }}
          onClick={() => setBildirimPanelAcik(false)}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              style={{ height: '100%' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Tema Paneli */}
      <ThemePaneli acik={temaPaneliAcik} kapat={() => setTemaPaneliAcik(false)} />
    </div>
  )
}

export default MainLayout