import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useDovizKuru } from '../hooks/useDovizKuru'
import { motion, AnimatePresence } from 'framer-motion'
import { satislariGetir } from '../services/satisService'
import { musterileriGetir } from '../services/musteriService'
import { gorevleriGetir } from '../services/gorevService'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { teklifleriGetir } from '../services/teklifService'
import { lisanslariGetir } from '../services/lisansService'

// ─── Sabitler ────────────────────────────────────────────────────────────────
const AYLAR_KISA = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara']

const TUM_MODULLER = [
  { id: 'musteriler',       isim: 'Müşteriler',      aciklama: 'Müşteri ve lead takibi',    ikon: '👥', yol: '/musteriler',        renk: '#0176D3' },
  { id: 'gorevler',         isim: 'Görevler',         aciklama: 'Atama ve takip',            ikon: '✅', yol: '/gorevler',           renk: '#10b981' },
  { id: 'gorusmeler',       isim: 'Görüşmeler',       aciklama: 'Planlı aramalar',           ikon: '📞', yol: '/gorusmeler',         renk: '#3b82f6' },
  { id: 'stok',             isim: 'Stok',             aciklama: 'Ürün yönetimi',             ikon: '📦', yol: '/stok',               renk: '#f59e0b' },
  { id: 'lisanslar',        isim: 'Trassir Lisanslar',aciklama: 'Lisans takibi',             ikon: '🔑', yol: '/trassir-lisanslar',  renk: '#014486' },
  { id: 'raporlar',         isim: 'Raporlar',         aciklama: 'Performans grafikleri',     ikon: '📊', yol: '/raporlar',           renk: '#ec4899' },
  { id: 'kullanici_yonetimi',isim: 'Kullanıcılar',   aciklama: 'Kullanıcı ekle, düzenle',   ikon: '⚙️', yol: '/kullanici-yonetimi', renk: '#6b7280' },
]

const WIDGET_MODULLERI = {
  aylik_gorusme:  'gorusmeler',
  son_gorusmeler: 'gorusmeler',
  teklif_grafik:  'musteriler',
}

const VARSAYILAN_WIDGETLAR = [
  { id: 'hosgeldin',      isim: 'Hoşgeldin & Özet',      ikon: '👋', gizli: false, genislik: 'full' },
  { id: 'istatistikler',  isim: 'İstatistik Kartları',    ikon: '📊', gizli: false, genislik: 'full' },
  { id: 'gorev_durumu',   isim: 'Görev Durumu',           ikon: '🍩', gizli: false, genislik: 'half' },
  { id: 'aylik_gorusme',  isim: 'Aylık Görüşme Grafiği',  ikon: '📈', gizli: false, genislik: 'half' },
  { id: 'teklif_grafik',  isim: 'Teklif Performansı',     ikon: '💰', gizli: false, genislik: 'full' },
  { id: 'gorevlerim',     isim: 'Görevlerim',             ikon: '✅', gizli: false, genislik: 'half' },
  { id: 'son_gorusmeler', isim: 'Son Görüşmeler',         ikon: '📞', gizli: false, genislik: 'half' },
  { id: 'memnuniyet',     isim: 'Müşteri Memnuniyeti',    ikon: '⭐', gizli: false, genislik: 'half' },
  { id: 'moduller',       isim: 'Modüller',               ikon: '🧩', gizli: false, genislik: 'full' },
]

function layoutYukle(userId) {
  try {
    const saved = localStorage.getItem(`dashboard_layout_${userId}`)
    if (!saved) return null
    const parsed = JSON.parse(saved)
    const ids = parsed.map(w => w.id)
    const eksik = VARSAYILAN_WIDGETLAR.filter(w => !ids.includes(w.id))
    return [...parsed, ...eksik]
  } catch { return null }
}

function layoutKaydet(userId, widgets) {
  localStorage.setItem(`dashboard_layout_${userId}`, JSON.stringify(widgets))
}

function selamlama(ad) {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return `Günaydın, ${ad} ☀️`
  if (h >= 12 && h < 18) return `Tünaydın, ${ad} 👋`
  return `İyi akşamlar, ${ad} 🌙`
}

// ─── Grafik Bileşenleri (SVG) ─────────────────────────────────────────────────

function DonutChart({ data, boyut = 130, kalinlik = 18 }) {
  const toplam = data.reduce((s, d) => s + d.deger, 0)
  if (toplam === 0) return (
    <div className="flex items-center justify-center text-gray-300 text-xs" style={{ width: boyut, height: boyut }}>
      Veri yok
    </div>
  )
  const r   = (boyut - kalinlik) / 2 - 2
  const cx  = boyut / 2
  const cy  = boyut / 2
  const C   = 2 * Math.PI * r
  let prev  = 0
  const segs = data.filter(d => d.deger > 0).map(d => {
    const arc    = (d.deger / toplam) * C
    const offset = C / 4 - prev
    prev += arc
    return { ...d, arc, offset }
  })
  return (
    <svg width={boyut} height={boyut}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={kalinlik} />
      {segs.map((s, i) => (
        <circle key={i} cx={cx} cy={cy} r={r}
          fill="none" stroke={s.renk} strokeWidth={kalinlik}
          strokeDasharray={`${s.arc} ${C - s.arc}`}
          strokeDashoffset={s.offset}
          strokeLinecap="butt" />
      ))}
      <text x={cx} y={cy - 7} textAnchor="middle"
        style={{ fontSize: '22px', fontWeight: 800, fill: 'var(--text-primary)' }}>{toplam}</text>
      <text x={cx} y={cy + 10} textAnchor="middle"
        style={{ fontSize: '9px', fill: 'var(--text-muted)', letterSpacing: '0.06em' }}>TOPLAM</text>
    </svg>
  )
}

function BarChart({ data, yukseklik = 100 }) {
  const max = Math.max(...data.map(d => d.deger), 1)
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: yukseklik }}>
        {data.map((d, i) => {
          const h = Math.max((d.deger / max) * yukseklik, d.deger > 0 ? 5 : 2)
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5">
              {d.deger > 0 && (
                <span className="text-xs font-bold" style={{ color: d.renk, fontSize: '10px' }}>{d.deger}</span>
              )}
              <div className="w-full rounded-t-md relative overflow-hidden"
                style={{ height: h, background: d.renk, opacity: d.deger > 0 ? 1 : 0.15 }}>
                <div className="absolute inset-0" style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 'inherit' }} />
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {data.map(d => (
          <div key={d.label} className="flex-1 text-center" style={{ color: 'var(--text-muted)', fontSize: '9px', fontWeight: 600 }}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { kullanici } = useAuth()
  const navigate      = useNavigate()
  const { kurlar, yukleniyor, kurCek } = useDovizKuru()

  const [duzenleModu, setDuzenleModu] = useState(false)
  const [widgets, setWidgets] = useState(() => layoutYukle(kullanici?.id) || VARSAYILAN_WIDGETLAR)
  const [dragId,    setDragId]    = useState(null)
  const [dragOverId,setDragOverId]= useState(null)
  const [gecikmisler, setGecikmisler] = useState([])
  const [musteriler, setMusteriler] = useState([])
  const [gorevler, setGorevler] = useState([])
  const [gorusmeler, setGorusmeler] = useState([])
  const [trassirLisanslar, setTrassirLisanslar] = useState([])
  const [teklifler, setTeklifler] = useState([])
  const [veriYukleniyor, setVeriYukleniyor] = useState(true)

  useEffect(() => {
    const bugun = new Date()
    bugun.setHours(0, 0, 0, 0)
    Promise.all([
      satislariGetir(),
      musterileriGetir(),
      gorevleriGetir(),
      gorusmeleriGetir(),
      teklifleriGetir(),
      lisanslariGetir(),
    ]).then(([satis, m, gv, gr, t, l]) => {
      setGecikmisler((satis || []).filter(s => s.durum === 'gonderildi' && s.vadeTarihi && new Date(s.vadeTarihi) < bugun))
      setMusteriler(m || [])
      setGorevler(gv || [])
      setGorusmeler(gr || [])
      setTeklifler(t || [])
      setTrassirLisanslar(l || [])
      setVeriYukleniyor(false)
    }).catch((e) => { console.error('Dashboard veri yüklenemedi:', e); setVeriYukleniyor(false) })
  }, [])

  const bugun    = new Date()
  const bugunStr = bugun.toISOString().split('T')[0]

  const benimGorevler      = gorevler.filter(g => String(g.atanan) === String(kullanici?.id) && g.durum !== 'tamamlandi')
  const benimGecikGorevler = benimGorevler.filter(g => g.sonTarih && new Date(g.sonTarih) < bugun)
  const yetkili            = kullanici?.moduller?.includes('kullanici_yonetimi')
  const gorunenGorusmeler  = yetkili ? gorusmeler : gorusmeler.filter(g => g.gorusen === kullanici?.ad)

  const aktifLisanslar = trassirLisanslar.filter(l => l.durum === 'aktif').length
  const yakindaBitenLisanslar = trassirLisanslar.filter(l => {
    if (!l.bitisTarih || l.durum !== 'aktif' || l.lisansTipi === 'sureksiz_surekli') return false
    const fark = (new Date(l.bitisTarih) - bugun) / (1000 * 60 * 60 * 24)
    return fark <= 30 && fark >= 0
  }).length

  // ── Stat kartları ─────────────────────────────────────────────────────────
  const istatistikler = useMemo(() => {
    const list = []
    if (kullanici?.moduller?.includes('musteriler'))
      list.push({ baslik: 'Toplam Müşteri', deger: musteriler.length, renk: '#0176D3', ikon: '👥',
        alt: `${musteriler.filter(m => m.durum === 'aktif').length} aktif` })
    list.push({ baslik: 'Görevlerim', deger: benimGorevler.length, renk: '#f59e0b', ikon: '✅',
      alt: benimGecikGorevler.length > 0 ? `⚠️ ${benimGecikGorevler.length} gecikmiş` : '✅ Gecikmiş yok',
      uyari: benimGecikGorevler.length > 0 })
    if (kullanici?.moduller?.includes('gorusmeler')) {
      const buAy = gorunenGorusmeler.filter(g => {
        const t = new Date(g.tarih)
        return t.getMonth() === bugun.getMonth() && t.getFullYear() === bugun.getFullYear()
      }).length
      list.push({ baslik: 'Bu Ay Görüşme', deger: buAy, renk: '#3b82f6', ikon: '📞',
        alt: `${gorunenGorusmeler.filter(g => g.durum === 'acik').length} açık` })
    }
    if (kullanici?.moduller?.includes('lisanslar'))
      list.push({ baslik: 'Aktif Lisans', deger: aktifLisanslar, renk: '#10b981', ikon: '🔑',
        alt: yakindaBitenLisanslar > 0 ? `⚠️ ${yakindaBitenLisanslar} bitiyor` : '✅ Hepsi güncel',
        uyari: yakindaBitenLisanslar > 0 })
    if (kullanici?.moduller?.includes('musteriler'))
      list.push({ baslik: 'Toplam Teklif', deger: teklifler.length, renk: '#014486', ikon: '📋',
        alt: `${teklifler.filter(t => t.durum === 'kazanildi').length} kazanıldı` })
    return list
  }, [musteriler, gorevler, gorusmeler, teklifler, trassirLisanslar])

  // ── Grafik verileri ───────────────────────────────────────────────────────
  const gorevDurumuData = useMemo(() => [
    { label: 'Bekliyor',    deger: gorevler.filter(g => g.durum === 'bekliyor' || !g.durum).length,       renk: '#f59e0b' },
    { label: 'Devam',       deger: gorevler.filter(g => g.durum === 'devam_ediyor').length,               renk: '#0176D3' },
    { label: 'Tamamlandı',  deger: gorevler.filter(g => g.durum === 'tamamlandi').length,                 renk: '#10b981' },
    { label: 'İptal',       deger: gorevler.filter(g => g.durum === 'iptal').length,                      renk: '#ef4444' },
  ], [gorevler])

  const aylikGorusmeData = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => {
      const d = new Date(bugun.getFullYear(), bugun.getMonth() - 5 + i, 1)
      return {
        label: AYLAR_KISA[d.getMonth()],
        deger: gorunenGorusmeler.filter(g => {
          const t = new Date(g.tarih)
          return t.getMonth() === d.getMonth() && t.getFullYear() === d.getFullYear()
        }).length,
        renk: '#0176D3',
      }
    }), [gorusmeler])

  const teklifGrafikData = useMemo(() => [
    { label: 'Hazırlandı',  deger: teklifler.filter(t => t.durum === 'hazirlandi').length,  renk: '#0176D3' },
    { label: 'Gönderildi',  deger: teklifler.filter(t => t.durum === 'gonderildi').length,  renk: '#3b82f6' },
    { label: 'Kazanıldı',   deger: teklifler.filter(t => t.durum === 'kazanildi').length,   renk: '#10b981' },
    { label: 'Kaybedildi',  deger: teklifler.filter(t => t.durum === 'kaybedildi').length,  renk: '#ef4444' },
  ], [teklifler])

  const hizliAksiyonlar = useMemo(() => {
    const a = []
    if (kullanici?.moduller?.includes('musteriler')) a.push({ isim: 'Yeni Teklif',   ikon: '📋', yol: '/teklifler',  renk: '#0176D3' })
    if (kullanici?.moduller?.includes('gorusmeler')) a.push({ isim: 'Yeni Görüşme',  ikon: '📞', yol: '/gorusmeler', renk: '#3b82f6' })
    if (kullanici?.moduller?.includes('gorevler'))   a.push({ isim: 'Yeni Görev',    ikon: '✅', yol: '/gorevler',   renk: '#10b981' })
    if (kullanici?.moduller?.includes('musteriler')) a.push({ isim: 'Yeni Müşteri',  ikon: '👥', yol: '/musteriler', renk: '#014486' })
    return a
  }, [kullanici])

  const gorunenModuller = TUM_MODULLER.filter(m => kullanici?.moduller?.includes(m.id))
  const sonGorevler     = benimGorevler.slice(-4).reverse()
  const sonGorusmeler   = gorunenGorusmeler.slice(-4).reverse()

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const handleDragStart = (id) => setDragId(id)
  const handleDragOver  = (e, id) => { e.preventDefault(); if (id !== dragId) setDragOverId(id) }
  const handleDrop      = (targetId) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return }
    const arr = [...widgets]
    const from = arr.findIndex(w => w.id === dragId)
    const to   = arr.findIndex(w => w.id === targetId)
    const [item] = arr.splice(from, 1)
    arr.splice(to, 0, item)
    setWidgets(arr)
    setDragId(null)
    setDragOverId(null)
  }
  const handleDragEnd = () => { setDragId(null); setDragOverId(null) }

  const toggleGizle   = (id) => setWidgets(prev => prev.map(w => w.id === id ? { ...w, gizli: !w.gizli } : w))
  const duzeniKaydet  = () => { layoutKaydet(kullanici?.id, widgets); setDuzenleModu(false) }
  const duzeniSifirla = () => { setWidgets(VARSAYILAN_WIDGETLAR); layoutKaydet(kullanici?.id, VARSAYILAN_WIDGETLAR); setDuzenleModu(false) }

  // ── Widget İçerikleri ─────────────────────────────────────────────────────
  const renderIcerik = (widget) => {
    switch (widget.id) {

      // ── Hoşgeldin ──────────────────────────────────────────────────────────
      case 'hosgeldin':
        return (
          <div className="glass-card" style={{ padding: '24px' }}>
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="font-bold text-gray-800 mb-1" style={{ fontSize: '22px' }}>
                  <span className="gradient-text">{selamlama(kullanici?.ad)}</span>
                </h2>
                <p className="text-gray-400 text-sm">
                  {bugun.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {['USD','EUR'].map(k => (
                  <div key={k} className="text-center px-3 py-2 rounded-xl" style={{ background: 'rgba(1,118,211,0.07)', border: '1px solid rgba(1,118,211,0.12)' }}>
                    <p className="text-xs text-gray-400 mb-0.5">{k}</p>
                    <p className="text-sm font-bold" style={{ color: 'var(--primary)' }}>{kurlar[k] ? `₺${kurlar[k]}` : '—'}</p>
                  </div>
                ))}
                <button onClick={kurCek} disabled={yukleniyor}
                  className="px-2 rounded-xl text-sm text-gray-400 hover:text-blue-500 transition disabled:opacity-40"
                  style={{ border: '1px solid rgba(1,118,211,0.12)', background: 'rgba(255,255,255,0.6)' }}>
                  {yukleniyor ? '⟳' : '↻'}
                </button>
              </div>
            </div>

            {hizliAksiyonlar.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Hızlı İşlemler</p>
                <div className="flex flex-wrap gap-2">
                  {hizliAksiyonlar.map(a => (
                    <motion.button key={a.isim} onClick={() => navigate(a.yol)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                      style={{ background: `${a.renk}12`, border: `1px solid ${a.renk}25`, color: a.renk }}
                      whileHover={{ scale: 1.04, y: -1 }} whileTap={{ scale: 0.97 }}>
                      <span>{a.ikon}</span><span>{a.isim}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4" style={{ borderTop: '1px solid rgba(1,118,211,0.08)' }}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Bugünün Özeti</p>
              <div className="flex flex-wrap gap-5">
                {[
                  { modul: 'musteriler', d: teklifler.filter(t => t.tarih === bugunStr && t.hazirlayan === kullanici?.ad).length, label: 'Teklif', ikon: '📋', renk: '#0176D3' },
                  { modul: 'gorusmeler', d: gorusmeler.filter(g => g.tarih === bugunStr).length, label: 'Görüşme', ikon: '📞', renk: '#3b82f6' },
                  { modul: 'gorevler',   d: benimGorevler.filter(g => g.durum === 'tamamlandi').length, label: 'Tamamlanan', ikon: '✅', renk: '#10b981' },
                  { d: benimGecikGorevler.length, label: 'Geciken', ikon: '⏰', renk: '#ef4444' },
                ].filter(i => !i.modul || kullanici?.moduller?.includes(i.modul)).map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base" style={{ background: `${item.renk}15` }}>{item.ikon}</div>
                    <div>
                      <p className="text-xl font-extrabold text-gray-800 leading-none">{item.d}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {(benimGecikGorevler.length > 0 || yakindaBitenLisanslar > 0) && (
              <div className="mt-4 space-y-2">
                {benimGecikGorevler.length > 0 && (
                  <div onClick={() => navigate('/gorevler')} className="flex items-center gap-3 cursor-pointer rounded-xl px-4 py-3 hover:opacity-80 transition"
                    style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <span>⚠️</span>
                    <p className="text-sm font-medium flex-1" style={{ color: '#dc2626' }}>{benimGecikGorevler.length} gecikmiş göreviniz var!</p>
                    <span className="text-xs" style={{ color: '#ef4444' }}>Görüntüle →</span>
                  </div>
                )}
                {yakindaBitenLisanslar > 0 && kullanici?.moduller?.includes('lisanslar') && (
                  <div onClick={() => navigate('/trassir-lisanslar')} className="flex items-center gap-3 cursor-pointer rounded-xl px-4 py-3 hover:opacity-80 transition"
                    style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <span>🔑</span>
                    <p className="text-sm font-medium flex-1" style={{ color: '#d97706' }}>{yakindaBitenLisanslar} lisansın süresi 30 gün içinde doluyor!</p>
                    <span className="text-xs" style={{ color: '#f59e0b' }}>Görüntüle →</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )

      // ── İstatistikler ──────────────────────────────────────────────────────
      case 'istatistikler':
        return (
          <div className="flex flex-wrap gap-4">
            {istatistikler.map((ist, i) => (
              <div key={i} className="glass-card flex-1 min-w-36" style={{ padding: '20px' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider leading-tight">{ist.baslik}</p>
                  <span className="text-xl">{ist.ikon}</span>
                </div>
                <p className="font-extrabold mb-1.5" style={{ fontSize: '36px', color: ist.renk, lineHeight: 1 }}>{ist.deger}</p>
                <p className="text-xs" style={{ color: ist.uyari ? '#ef4444' : 'var(--text-muted)' }}>{ist.alt}</p>
              </div>
            ))}
          </div>
        )

      // ── Görev Durumu Grafiği ───────────────────────────────────────────────
      case 'gorev_durumu':
        return (
          <div className="glass-card h-full" style={{ padding: '20px' }}>
            <p className="text-sm font-semibold text-gray-700 mb-1">🍩 Görev Durumu</p>
            <p className="text-xs text-gray-400 mb-4">Tüm zamanlar</p>
            <div className="flex items-center gap-5">
              <DonutChart data={gorevDurumuData} boyut={130} kalinlik={20} />
              <div className="flex-1 space-y-3">
                {gorevDurumuData.map(d => (
                  <div key={d.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.renk }} />
                      <span className="text-xs text-gray-500">{d.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ width: 50, background: '#f1f5f9' }}>
                        <div className="h-full rounded-full" style={{ width: gorevler.length ? `${(d.deger / gorevler.length) * 100}%` : 0, background: d.renk }} />
                      </div>
                      <span className="text-sm font-bold w-6 text-right" style={{ color: d.renk }}>{d.deger}</span>
                    </div>
                  </div>
                ))}
                {gorevler.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Henüz görev yok</p>}
              </div>
            </div>
          </div>
        )

      // ── Aylık Görüşme Grafiği ──────────────────────────────────────────────
      case 'aylik_gorusme':
        return (
          <div className="glass-card h-full" style={{ padding: '20px' }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-gray-700">📈 Aylık Görüşme</p>
                <p className="text-xs text-gray-400">Son 6 ay</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-extrabold" style={{ color: 'var(--primary)' }}>
                  {aylikGorusmeData.reduce((s,d) => s + d.deger, 0)}
                </p>
                <p className="text-xs text-gray-400">toplam</p>
              </div>
            </div>
            <BarChart data={aylikGorusmeData} yukseklik={90} />
          </div>
        )

      // ── Teklif Performans Grafiği ──────────────────────────────────────────
      case 'teklif_grafik':
        return (
          <div className="glass-card" style={{ padding: '20px' }}>
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="text-sm font-semibold text-gray-700">💰 Teklif Performansı</p>
                <p className="text-xs text-gray-400">Duruma göre dağılım</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-extrabold" style={{ color: '#10b981' }}>
                  %{teklifler.length > 0 ? Math.round(teklifler.filter(t => t.durum === 'kazanildi').length / teklifler.length * 100) : 0}
                  <span className="text-sm font-normal text-gray-400 ml-1">kazanma oranı</span>
                </p>
                <p className="text-xs text-gray-400">{teklifler.length} toplam teklif</p>
              </div>
            </div>
            <div className="flex gap-6 items-end">
              <div className="flex-1">
                <BarChart data={teklifGrafikData} yukseklik={90} />
              </div>
              <div className="flex flex-col gap-3 pb-6 flex-shrink-0">
                {teklifGrafikData.map(d => (
                  <div key={d.label} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.renk }} />
                    <span className="text-gray-500 w-20">{d.label}</span>
                    <span className="font-extrabold text-sm" style={{ color: d.renk }}>{d.deger}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )

      // ── Görevlerim ────────────────────────────────────────────────────────
      case 'gorevlerim':
        return (
          <div className="glass-card overflow-hidden h-full flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(1,118,211,0.08)' }}>
              <p className="font-semibold text-gray-700 text-sm">✅ Görevlerim</p>
              <button onClick={() => navigate('/gorevler')} className="text-xs font-medium" style={{ color: 'var(--primary)' }}>Tümü →</button>
            </div>
            <div className="flex-1">
              {sonGorevler.length === 0
                ? <div className="px-5 py-8 text-center text-gray-400 text-sm">🎉 Bekleyen görev yok</div>
                : sonGorevler.map(g => {
                    const gecikti = g.sonTarih && new Date(g.sonTarih) < bugun
                    return (
                      <div key={g.id} onClick={() => navigate(`/gorevler/${g.id}`)}
                        className="px-5 py-3 cursor-pointer flex items-center justify-between transition-all"
                        style={{ borderBottom: '1px solid rgba(1,118,211,0.05)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(1,118,211,0.04)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{g.baslik}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{g.sonTarih || '—'}</p>
                        </div>
                        {gecikti && (
                          <span className="text-xs px-2 py-0.5 rounded-full ml-2 flex-shrink-0 font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>Gecikti</span>
                        )}
                      </div>
                    )
                  })
              }
            </div>
          </div>
        )

      // ── Son Görüşmeler ────────────────────────────────────────────────────
      case 'son_gorusmeler':
        return (
          <div className="glass-card overflow-hidden h-full flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(1,118,211,0.08)' }}>
              <p className="font-semibold text-gray-700 text-sm">📞 Son Görüşmeler</p>
              <button onClick={() => navigate('/gorusmeler')} className="text-xs font-medium" style={{ color: 'var(--primary)' }}>Tümü →</button>
            </div>
            <div className="flex-1">
              {sonGorusmeler.length === 0
                ? <div className="px-5 py-8 text-center text-gray-400 text-sm">Henüz görüşme yok</div>
                : sonGorusmeler.map(g => (
                    <div key={g.id} onClick={() => navigate(`/gorusmeler/${g.id}`)}
                      className="px-5 py-3 transition-all cursor-pointer"
                      style={{ borderBottom: '1px solid rgba(1,118,211,0.05)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(1,118,211,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-800 truncate">{g.firmaAdi || g.firmaAd}</p>
                        <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{g.tarih}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{g.konu} · {g.gorusen}</p>
                    </div>
                  ))
              }
            </div>
          </div>
        )

      // ── Müşteri Memnuniyeti ───────────────────────────────────────────────
      case 'memnuniyet': {
        const puanlar = (() => { try { return JSON.parse(localStorage.getItem('memnuniyet_puanlari') || '[]') } catch { return [] } })()
        const ort = puanlar.length ? (puanlar.reduce((s,p) => s + p.puan, 0) / puanlar.length) : 0
        const memnun = puanlar.length ? Math.round(puanlar.filter(p => p.puan >= 4).length / puanlar.length * 100) : 0
        const sonlar = [...puanlar].sort((a,b) => new Date(b.tarih)-new Date(a.tarih)).slice(0,4)
        const ortRenk = ort >= 4 ? '#10b981' : ort >= 3 ? '#f59e0b' : ort > 0 ? '#ef4444' : '#94a3b8'
        return (
          <div className="glass-card overflow-hidden h-full flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(1,118,211,0.08)' }}>
              <p className="font-semibold text-gray-700 text-sm">⭐ Müşteri Memnuniyeti</p>
              <button onClick={() => navigate('/memnuniyet')} className="text-xs font-medium" style={{ color: 'var(--primary)' }}>Detay →</button>
            </div>
            {puanlar.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-8 text-gray-400">
                <p className="text-3xl mb-2">⭐</p>
                <p className="text-sm">Henüz değerlendirme yok</p>
                <button onClick={() => navigate('/servis-talepleri')} className="mt-3 text-xs text-blue-500">Servis Taleplerine Git →</button>
              </div>
            ) : (
              <>
                <div className="px-5 py-4 flex items-center gap-4" style={{ borderBottom: '1px solid rgba(1,118,211,0.06)' }}>
                  <div className="text-center">
                    <p className="font-extrabold" style={{ fontSize: '38px', color: ortRenk, lineHeight: 1 }}>{ort.toFixed(1)}</p>
                    <div style={{ fontSize: '18px', letterSpacing: '2px' }}>
                      {[1,2,3,4,5].map(i => <span key={i} style={{ color: i <= Math.round(ort) ? '#f59e0b' : '#e2e8f0' }}>★</span>)}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{puanlar.length} yorum</p>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    {[5,4,3,2,1].map(y => {
                      const s = puanlar.filter(p => p.puan === y).length
                      const pct = puanlar.length ? (s / puanlar.length * 100) : 0
                      return (
                        <div key={y} className="flex items-center gap-2">
                          <span className="text-xs w-4 text-right text-gray-400">{y}</span>
                          <span style={{ color: '#f59e0b', fontSize: '10px' }}>★</span>
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: y >= 4 ? '#10b981' : y === 3 ? '#f59e0b' : '#ef4444' }} />
                          </div>
                          <span className="text-xs text-gray-400 w-4">{s}</span>
                        </div>
                      )
                    })}
                    <p className="text-xs mt-1" style={{ color: ortRenk }}>%{memnun} memnun</p>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  {sonlar.map(p => (
                    <div key={p.id} onClick={() => navigate('/memnuniyet')}
                      className="px-5 py-2.5 cursor-pointer transition-all flex items-center justify-between gap-3"
                      style={{ borderBottom: '1px solid rgba(1,118,211,0.04)' }}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(1,118,211,0.03)'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{p.musteriAd}</p>
                        {p.yorum && <p className="text-xs text-gray-400 truncate italic">"{p.yorum}"</p>}
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-1">
                        {[1,2,3,4,5].map(i=><span key={i} style={{fontSize:'11px',color:i<=p.puan?'#f59e0b':'#e2e8f0'}}>★</span>)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )
      }

      // ── Modüller ──────────────────────────────────────────────────────────
      case 'moduller':
        return (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Modüller</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {gorunenModuller.map(modul => (
                <motion.div key={modul.id} onClick={() => navigate(modul.yol)}
                  className="glass-card cursor-pointer gradient-border" style={{ padding: '20px' }}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-xl"
                    style={{ background: `${modul.renk}15`, border: `1px solid ${modul.renk}25` }}>
                    {modul.ikon}
                  </div>
                  <p className="font-semibold text-gray-800 text-sm mb-1">{modul.isim}</p>
                  <p className="text-xs text-gray-400">{modul.aciklama}</p>
                </motion.div>
              ))}
            </div>
          </div>
        )

      default: return null
    }
  }

  // ── Görünür widget listesi ────────────────────────────────────────────────
  const gorunenWidgets = widgets.filter(w => {
    if (!duzenleModu && w.gizli) return false
    const modul = WIDGET_MODULLERI[w.id]
    if (modul && !kullanici?.moduller?.includes(modul)) return false
    return true
  })

  const gizliWidgetlar = widgets.filter(w => {
    const modul = WIDGET_MODULLERI[w.id]
    if (modul && !kullanici?.moduller?.includes(modul)) return false
    return w.gizli
  })

  if (veriYukleniyor) {
    return (
      <div style={{ padding: '24px' }} className="text-center text-gray-400 py-20">
        <div className="text-4xl mb-3 animate-pulse">📊</div>
        <p className="text-sm">Dashboard verileri yükleniyor...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-xs text-gray-400 italic">
          {duzenleModu ? '✏️ Widget\'ları sürükleyerek sıralayın, göster/gizle ile özelleştirin' : ''}
        </p>
        <div className="flex gap-2">
          {duzenleModu ? (
            <>
              <button onClick={duzeniSifirla}
                className="text-xs px-4 py-2 rounded-xl border text-gray-500 hover:bg-gray-50 transition"
                style={{ border: '1px solid #e5e7eb' }}>
                ↺ Sıfırla
              </button>
              <button onClick={duzeniKaydet}
                className="text-xs px-5 py-2 rounded-xl text-white font-semibold transition"
                style={{ background: 'var(--primary)', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
                ✓ Düzeni Kaydet
              </button>
            </>
          ) : (
            <motion.button onClick={() => setDuzenleModu(true)}
              className="text-xs px-4 py-2 rounded-xl border transition flex items-center gap-1.5"
              style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'rgba(255,255,255,0.85)', color: 'var(--primary)' }}
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              ⊞ Düzeni Özelleştir
            </motion.button>
          )}
        </div>
      </div>

      {/* Geciken Fatura Uyarısı */}
      {gecikmisler.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4 mb-5 cursor-pointer"
          style={{
            background: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.25)',
            boxShadow: '0 2px 8px rgba(239,68,68,0.08)',
          }}
          onClick={() => navigate('/satislar')}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ background: 'rgba(239,68,68,0.12)' }}
            >
              ⚠️
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold" style={{ color: '#ef4444' }}>
                  {gecikmisler.length} Gecikmiş Fatura
                </p>
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ background: '#ef4444' }}
                >
                  VADESİ GEÇTİ
                </span>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Toplam{' '}
                <strong style={{ color: '#ef4444' }}>
                  {gecikmisler
                    .reduce((s, f) => s + ((f.genelToplam || 0) - (f.odenenToplam || 0)), 0)
                    .toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </strong>{' '}
                tahsil edilmeyi bekliyor
              </p>
              <div className="flex gap-2 flex-wrap mt-2">
                {gecikmisler.slice(0, 3).map((f) => (
                  <span
                    key={f.id}
                    className="text-xs px-2 py-1 rounded-lg font-medium"
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
                  >
                    {f.faturaNo} — {f.firmaAdi}
                  </span>
                ))}
                {gecikmisler.length > 3 && (
                  <span className="text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--text-muted)' }}>
                    +{gecikmisler.length - 3} daha
                  </span>
                )}
              </div>
            </div>
            <span className="text-xs font-medium flex-shrink-0" style={{ color: '#ef4444' }}>
              Görüntüle →
            </span>
          </div>
        </motion.div>
      )}

      {/* Widget Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {gorunenWidgets.map(widget => {
          const isDragging   = dragId === widget.id
          const isDropTarget = dragOverId === widget.id && dragId !== widget.id

          return (
            <div
              key={widget.id}
              className={`${widget.genislik === 'full' ? 'md:col-span-2' : ''} relative transition-all duration-200`}
              style={{
                opacity:   isDragging ? 0.45 : 1,
                outline:   isDropTarget ? '2px dashed var(--primary)' : 'none',
                outlineOffset: '4px',
                borderRadius:  '4px',
                transform: isDropTarget ? 'scale(1.01)' : 'scale(1)',
                cursor:    duzenleModu ? 'grab' : 'auto',
              }}
              draggable={duzenleModu}
              onDragStart={() => handleDragStart(widget.id)}
              onDragOver={e => handleDragOver(e, widget.id)}
              onDrop={() => handleDrop(widget.id)}
              onDragEnd={handleDragEnd}
            >
              {/* Düzenleme modu kontrolleri */}
              <AnimatePresence>
                {duzenleModu && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute top-2 right-2 z-20 flex gap-1.5">
                    <div className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded select-none"
                      style={{ background: 'rgba(3,45,96,0.85)', color: 'white' }}>
                      ⠿ Taşı
                    </div>
                    <button onClick={() => toggleGizle(widget.id)}
                      className="text-xs px-2.5 py-1.5 rounded font-medium transition-all"
                      style={{
                        background: widget.gizli ? 'rgba(16,185,129,0.9)' : 'rgba(107,114,128,0.85)',
                        color: 'white'
                      }}>
                      {widget.gizli ? '👁 Göster' : '🙈 Gizle'}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* İçerik */}
              <div style={{ opacity: widget.gizli ? 0.35 : 1, filter: widget.gizli ? 'grayscale(0.6)' : 'none', transition: 'opacity 0.2s' }}>
                {renderIcerik(widget)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Gizli widget'lar (düzenleme modunda göster) */}
      <AnimatePresence>
        {duzenleModu && gizliWidgetlar.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-5 p-4 rounded-2xl"
            style={{ background: 'rgba(243,244,246,0.85)', border: '1px dashed #d1d5db' }}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Gizli Widget'lar</p>
            <div className="flex flex-wrap gap-2">
              {gizliWidgetlar.map(w => (
                <button key={w.id} onClick={() => toggleGizle(w.id)}
                  className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl transition-all hover:shadow-md"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  {w.ikon} {w.isim}
                  <span className="font-semibold" style={{ color: '#10b981' }}>+ Göster</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
