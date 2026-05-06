import { useState, useMemo, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useDovizKuru } from '../hooks/useDovizKuru'
import {
  Users, CheckSquare, Phone, KeyRound, FileText, TrendingUp, AlertTriangle,
  Package, BarChart3, UserCog, Plus, ArrowRight, Clock, AlertCircle, Star,
} from 'lucide-react'
import { satislariGetir } from '../services/satisService'
import { musterileriGetir } from '../services/musteriService'
import { gorevleriGetir } from '../services/gorevService'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { teklifleriGetir } from '../services/teklifService'
import { lisanslariGetir } from '../services/lisansService'
import {
  Button, Card, CardTitle, CardSubtitle, KPICard,
  Badge, CriticalBadge, Alert,
  Table, THead, TBody, TR, TH, TD,
  CurrencyBox, EmptyState,
} from '../components/ui'

const AYLAR_KISA = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara']

const MODUL_ICONS = {
  musteriler: Users,
  gorevler: CheckSquare,
  gorusmeler: Phone,
  stok: Package,
  lisanslar: KeyRound,
  raporlar: BarChart3,
  kullanici_yonetimi: UserCog,
}
const TUM_MODULLER = [
  { id: 'musteriler',         isim: 'Müşteriler',        aciklama: 'Müşteri ve lead takibi',      yol: '/musteriler' },
  { id: 'gorevler',           isim: 'Görevler',          aciklama: 'Atama ve takip',              yol: '/gorevler' },
  { id: 'gorusmeler',         isim: 'Görüşmeler',        aciklama: 'Planlı aramalar',             yol: '/gorusmeler' },
  { id: 'stok',               isim: 'Stok',              aciklama: 'Ürün yönetimi',               yol: '/stok' },
  { id: 'lisanslar',          isim: 'Trassir Lisanslar', aciklama: 'Lisans takibi',               yol: '/trassir-lisanslar' },
  { id: 'raporlar',           isim: 'Raporlar',          aciklama: 'Performans grafikleri',       yol: '/raporlar' },
  { id: 'kullanici_yonetimi', isim: 'Kullanıcılar',      aciklama: 'Kullanıcı ekle, düzenle',     yol: '/kullanici-yonetimi' },
]

function selamlama(ad) {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return `Günaydın, ${ad}.`
  if (h >= 12 && h < 18) return `Tünaydın, ${ad}.`
  return `İyi akşamlar, ${ad}.`
}

/* ── Charts (token renkli) ─────────────────────────────────────────── */

function DonutChart({ data, boyut = 140, kalinlik = 20 }) {
  const toplam = data.reduce((s, d) => s + d.deger, 0)
  if (toplam === 0) {
    return (
      <div style={{ width: boyut, height: boyut, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', font: '400 12px/16px var(--font-sans)' }}>
        Veri yok
      </div>
    )
  }
  const r = (boyut - kalinlik) / 2 - 2
  const cx = boyut / 2, cy = boyut / 2
  const C = 2 * Math.PI * r
  let prev = 0
  const segs = data.filter(d => d.deger > 0).map(d => {
    const arc = (d.deger / toplam) * C
    const offset = C / 4 - prev
    prev += arc
    return { ...d, arc, offset }
  })
  return (
    <svg width={boyut} height={boyut}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={kalinlik} />
      {segs.map((s, i) => (
        <circle key={i} cx={cx} cy={cy} r={r}
          fill="none" stroke={s.renk} strokeWidth={kalinlik}
          strokeDasharray={`${s.arc} ${C - s.arc}`}
          strokeDashoffset={s.offset}
          strokeLinecap="butt" />
      ))}
      <text x={cx} y={cy - 4} textAnchor="middle"
        style={{ font: '600 24px/1 var(--font-sans)', fill: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{toplam}</text>
      <text x={cx} y={cy + 14} textAnchor="middle"
        style={{ font: '500 10px/1 var(--font-sans)', fill: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Toplam</text>
    </svg>
  )
}

function BarChart({ data, yukseklik = 100 }) {
  const max = Math.max(...data.map(d => d.deger), 1)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: yukseklik }}>
        {data.map((d, i) => {
          const h = Math.max((d.deger / max) * yukseklik, d.deger > 0 ? 4 : 2)
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
              {d.deger > 0 && (
                <span style={{ font: '600 11px/1 var(--font-sans)', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{d.deger}</span>
              )}
              <div style={{
                width: '60%', height: h,
                background: d.renk ?? 'var(--brand-primary)',
                opacity: d.deger > 0 ? 1 : 0.2,
                borderRadius: 2,
              }} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {data.map(d => (
          <div key={d.label} style={{ flex: 1, textAlign: 'center', color: 'var(--text-tertiary)', font: '500 11px/1 var(--font-sans)' }}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Ana bileşen ───────────────────────────────────────────────────── */

export default function Dashboard() {
  const { kullanici } = useAuth()
  const navigate = useNavigate()
  const { kurlar, yukleniyor, kurCek } = useDovizKuru()

  const [gecikmisler, setGecikmisler] = useState([])
  const [musteriler, setMusteriler] = useState([])
  const [gorevler, setGorevler] = useState([])
  const [gorusmeler, setGorusmeler] = useState([])
  const [trassirLisanslar, setTrassirLisanslar] = useState([])
  const [teklifler, setTeklifler] = useState([])
  const [veriYukleniyor, setVeriYukleniyor] = useState(true)

  const veriYukle = useCallback(() => {
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

  // İlk yükleme
  useEffect(() => { veriYukle() }, [veriYukle])

  // Tab focus aldığında veriyi tazele — başka sayfada satış silinmiş/eklenmiş
  // olabilir, Dashboard'ın KPI'ları senkron kalsın.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') veriYukle()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', veriYukle)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', veriYukle)
    }
  }, [veriYukle])

  const bugun = new Date()
  bugun.setHours(0, 0, 0, 0) // Sadece tarih karşılaştırması — saat dahil değil
  const bugunStr = bugun.toISOString().split('T')[0]

  const benimGorevler = gorevler.filter(g => String(g.atanan) === String(kullanici?.id) && g.durum !== 'tamamlandi')
  // 'Geciken' = son tarihi bugünden ÖNCE. Bugün biten görev henüz gecikmemiş sayılır.
  const benimGecikGorevler = benimGorevler.filter(g => g.sonTarih && new Date(g.sonTarih) < bugun)
  const yetkili = kullanici?.moduller?.includes('kullanici_yonetimi')
  const gorunenGorusmeler = yetkili ? gorusmeler : gorusmeler.filter(g => g.gorusen === kullanici?.ad)

  const aktifLisanslar = trassirLisanslar.filter(l => l.durum === 'aktif').length
  const yakindaBitenLisanslar = trassirLisanslar.filter(l => {
    if (!l.bitisTarih || l.durum !== 'aktif' || l.lisansTipi === 'sureksiz_surekli') return false
    const fark = (new Date(l.bitisTarih) - bugun) / (1000 * 60 * 60 * 24)
    return fark <= 30 && fark >= 0
  }).length

  const kpiKartlari = useMemo(() => {
    const list = []
    if (kullanici?.moduller?.includes('musteriler')) {
      list.push({
        label: 'Toplam Müşteri', value: musteriler.length.toLocaleString('tr-TR'),
        icon: <Users size={16} strokeWidth={1.5} />,
        footer: <><TrendingUp size={12} strokeWidth={1.5} style={{ color: 'var(--success)' }} />{musteriler.filter(m => m.durum === 'aktif').length} aktif</>
      })
    }
    list.push({
      label: 'Görevlerim', value: benimGorevler.length,
      icon: <CheckSquare size={16} strokeWidth={1.5} />,
      footer: benimGecikGorevler.length > 0
        ? <><AlertCircle size={12} strokeWidth={1.5} style={{ color: 'var(--danger)' }} /><span style={{ color: 'var(--danger)' }}>{benimGecikGorevler.length} gecikmiş</span></>
        : <span style={{ color: 'var(--text-tertiary)' }}>Gecikmiş yok</span>,
    })
    if (kullanici?.moduller?.includes('gorusmeler')) {
      const buAy = gorunenGorusmeler.filter(g => {
        const t = new Date(g.tarih)
        return t.getMonth() === bugun.getMonth() && t.getFullYear() === bugun.getFullYear()
      }).length
      list.push({
        label: 'Bu Ay Görüşme', value: buAy,
        icon: <Phone size={16} strokeWidth={1.5} />,
        footer: <span style={{ color: 'var(--text-tertiary)' }}>{gorunenGorusmeler.filter(g => g.durum === 'acik').length} açık</span>,
      })
    }
    if (kullanici?.moduller?.includes('lisanslar')) {
      list.push({
        label: 'Aktif Lisans', value: aktifLisanslar,
        icon: <KeyRound size={16} strokeWidth={1.5} />,
        footer: yakindaBitenLisanslar > 0
          ? <><AlertCircle size={12} strokeWidth={1.5} style={{ color: 'var(--warning)' }} /><span style={{ color: 'var(--warning)' }}>{yakindaBitenLisanslar} bitiyor</span></>
          : <span style={{ color: 'var(--text-tertiary)' }}>Hepsi güncel</span>,
      })
    }
    if (kullanici?.moduller?.includes('musteriler')) {
      list.push({
        label: 'Toplam Teklif', value: teklifler.length,
        icon: <FileText size={16} strokeWidth={1.5} />,
        footer: <span style={{ color: 'var(--text-tertiary)' }}>{teklifler.filter(t => t.durum === 'kazanildi').length} kazanıldı</span>,
      })
    }
    return list
  }, [musteriler, gorevler, gorusmeler, teklifler, trassirLisanslar, aktifLisanslar, yakindaBitenLisanslar])

  const gorevDurumuData = useMemo(() => [
    { label: 'Bekliyor',   deger: gorevler.filter(g => g.durum === 'bekliyor' || !g.durum).length, renk: 'var(--warning)' },
    { label: 'Devam',      deger: gorevler.filter(g => g.durum === 'devam_ediyor').length,         renk: 'var(--info)' },
    { label: 'Tamamlandı', deger: gorevler.filter(g => g.durum === 'tamamlandi').length,          renk: 'var(--success)' },
    { label: 'İptal',      deger: gorevler.filter(g => g.durum === 'iptal').length,               renk: 'var(--danger)' },
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
        renk: 'var(--brand-primary)',
      }
    }), [gorusmeler])

  const teklifGrafikData = useMemo(() => [
    { label: 'Hazırlandı',  deger: teklifler.filter(t => t.durum === 'hazirlandi').length,  renk: 'var(--brand-primary)' },
    { label: 'Gönderildi',  deger: teklifler.filter(t => t.durum === 'gonderildi').length,  renk: 'var(--info)' },
    { label: 'Kazanıldı',   deger: teklifler.filter(t => t.durum === 'kazanildi').length,   renk: 'var(--success)' },
    { label: 'Kaybedildi',  deger: teklifler.filter(t => t.durum === 'kaybedildi').length,  renk: 'var(--danger)' },
  ], [teklifler])

  const kazanmaOrani = teklifler.length > 0
    ? Math.round(teklifler.filter(t => t.durum === 'kazanildi').length / teklifler.length * 100)
    : 0

  const hizliAksiyonlar = useMemo(() => {
    const a = []
    if (kullanici?.moduller?.includes('musteriler')) a.push({ isim: 'Yeni teklif',   yol: '/teklifler' })
    if (kullanici?.moduller?.includes('gorusmeler')) a.push({ isim: 'Yeni görüşme',  yol: '/gorusmeler' })
    if (kullanici?.moduller?.includes('gorevler'))   a.push({ isim: 'Yeni görev',    yol: '/gorevler' })
    if (kullanici?.moduller?.includes('musteriler')) a.push({ isim: 'Yeni müşteri',  yol: '/musteriler' })
    return a
  }, [kullanici])

  const bugunTileleri = [
    { modul: 'musteriler', d: teklifler.filter(t => t.tarih === bugunStr && t.hazirlayan === kullanici?.ad).length, label: 'Teklif' },
    { modul: 'gorusmeler', d: gorusmeler.filter(g => g.tarih === bugunStr).length, label: 'Görüşme' },
    { modul: 'gorevler',   d: benimGorevler.filter(g => g.durum === 'tamamlandi').length, label: 'Tamamlanan' },
    { d: benimGecikGorevler.length, label: 'Geciken', tone: benimGecikGorevler.length > 0 ? 'danger' : null },
  ].filter(i => !i.modul || kullanici?.moduller?.includes(i.modul))

  // Servisler zaten yeni→eski sıralı; ilk 5 = en son 5
  const sonGorevler = benimGorevler.slice(0, 5)
  const sonGorusmeler = gorunenGorusmeler.slice(0, 5)
  const gorunenModuller = TUM_MODULLER.filter(m => kullanici?.moduller?.includes(m.id))

  /* ── Loading ─────────────────────────────────────────────────────── */
  if (veriYukleniyor) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyState
          icon={<BarChart3 size={32} strokeWidth={1.5} />}
          title="Dashboard verileri yükleniyor"
          description="Lütfen bekleyin…"
        />
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* ── Hoşgeldin ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1" style={{ marginBottom: 4 }}>{selamlama(kullanici?.ad)}</h1>
          <p className="t-caption">
            {bugun.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <CurrencyBox code="USD" value={kurlar.USD ? `₺${kurlar.USD}` : '—'} onRefresh={kurCek} loading={yukleniyor} />
          <CurrencyBox code="EUR" value={kurlar.EUR ? `₺${kurlar.EUR}` : '—'} onRefresh={kurCek} loading={yukleniyor} />
        </div>
      </div>

      {/* ── Kritik uyarı: Gecikmiş fatura ── */}
      {gecikmisler.length > 0 && (
        <Alert
          variant="danger"
          title={
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {gecikmisler.length} gecikmiş fatura
              <CriticalBadge>Vadesi geçti</CriticalBadge>
            </div>
          }
          action={
            <a
              href="/satislar"
              onClick={e => { e.preventDefault(); navigate('/satislar') }}
              style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              Görüntüle <ArrowRight size={14} strokeWidth={1.5} />
            </a>
          }
          style={{ marginBottom: 20 }}
        >
          Toplam {gecikmisler.reduce((s, g) => s + (g.toplam || 0), 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ tahsil edilmeyi bekliyor.
        </Alert>
      )}

      {/* ── Hızlı işlemler ── */}
      {hizliAksiyonlar.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <p className="t-label" style={{ marginBottom: 8 }}>HIZLI İŞLEMLER</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {hizliAksiyonlar.map(a => (
              <Button
                key={a.isim}
                variant="secondary"
                iconLeft={<Plus size={14} strokeWidth={1.5} />}
                onClick={() => navigate(a.yol)}
              >
                {a.isim}
              </Button>
            ))}
          </div>
        </section>
      )}

      {/* ── Bugünün özeti ── */}
      {bugunTileleri.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <p className="t-label" style={{ marginBottom: 8 }}>BUGÜNÜN ÖZETİ</p>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bugunTileleri.length}, minmax(0, 1fr))`, gap: 12 }}>
            {bugunTileleri.map((t, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                }}
              >
                <div style={{
                  font: '600 24px/1.2 var(--font-sans)',
                  color: t.tone === 'danger' ? 'var(--danger)' : 'var(--text-primary)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {t.d}
                </div>
                <div style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {t.label}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── KPI kartları ── */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {kpiKartlari.map((k, i) => (
            <KPICard key={i} label={k.label} value={k.value} icon={k.icon} footer={k.footer} />
          ))}
        </div>
      </section>

      {/* ── Görev Durumu + Aylık Görüşme ── */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <Card>
            <CardTitle>Görev durumu</CardTitle>
            <CardSubtitle>Tüm zamanlar</CardSubtitle>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <DonutChart data={gorevDurumuData} boyut={140} kalinlik={20} />
              <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {gorevDurumuData.map(d => (
                  <div key={d.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: d.renk, flexShrink: 0 }} />
                      <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>{d.label}</span>
                    </div>
                    <span style={{ font: '600 14px/1 var(--font-sans)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{d.deger}</span>
                  </div>
                ))}
                {gorevler.length === 0 && <p className="t-caption" style={{ textAlign: 'center', padding: '8px 0' }}>Henüz görev yok</p>}
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <CardTitle>Aylık görüşme</CardTitle>
                <CardSubtitle>Son 6 ay</CardSubtitle>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ font: '600 24px/1 var(--font-sans)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {aylikGorusmeData.reduce((s,d) => s + d.deger, 0)}
                </div>
                <div className="t-caption">toplam</div>
              </div>
            </div>
            <BarChart data={aylikGorusmeData} yukseklik={100} />
          </Card>
        </div>
      </section>

      {/* ── Teklif Performansı ── */}
      {teklifler.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <CardTitle>Teklif performansı</CardTitle>
                <CardSubtitle>Duruma göre dağılım</CardSubtitle>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ font: '600 24px/1 var(--font-sans)', color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>
                  %{kazanmaOrani}
                </div>
                <div className="t-caption">kazanma oranı · {teklifler.length} teklif</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'center' }}>
              <BarChart data={teklifGrafikData} yukseklik={90} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {teklifGrafikData.map(d => (
                  <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, font: '400 12px/16px var(--font-sans)' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: d.renk, flexShrink: 0 }} />
                    <span style={{ color: 'var(--text-secondary)', minWidth: 80 }}>{d.label}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{d.deger}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </section>
      )}

      {/* ── Görevlerim + Son Görüşmeler ── */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>

          {/* Görevlerim */}
          <Card padding={0}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <CardTitle style={{ margin: 0 }}>Görevlerim</CardTitle>
              </div>
              <button
                onClick={() => navigate('/gorevler')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-primary)', font: '500 13px/18px var(--font-sans)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                Tümü <ArrowRight size={14} strokeWidth={1.5} />
              </button>
            </div>
            {sonGorevler.length === 0 ? (
              <div style={{ padding: 24 }}>
                <EmptyState
                  icon={<CheckSquare size={28} strokeWidth={1.5} />}
                  title="Bekleyen görev yok"
                  description="Atanmış tüm görevler tamamlanmış."
                />
              </div>
            ) : (
              <div>
                {sonGorevler.map(g => {
                  const gecikti = g.sonTarih && new Date(g.sonTarih) < bugun
                  return (
                    <div
                      key={g.id}
                      onClick={() => navigate(`/gorevler/${g.id}`)}
                      style={{
                        padding: '12px 20px',
                        borderBottom: '1px solid var(--border-default)',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                        transition: 'background 120ms',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {g.baslik}
                        </div>
                        <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                          {g.sonTarih || '—'}
                        </div>
                      </div>
                      {gecikti && <Badge tone="kayip" icon={<Clock size={12} strokeWidth={1.5} />}>Gecikti</Badge>}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Son görüşmeler */}
          <Card padding={0}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <CardTitle style={{ margin: 0 }}>Son görüşmeler</CardTitle>
              <button
                onClick={() => navigate('/gorusmeler')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-primary)', font: '500 13px/18px var(--font-sans)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                Tümü <ArrowRight size={14} strokeWidth={1.5} />
              </button>
            </div>
            {sonGorusmeler.length === 0 ? (
              <div style={{ padding: 24 }}>
                <EmptyState icon={<Phone size={28} strokeWidth={1.5} />} title="Henüz görüşme yok" />
              </div>
            ) : (
              <div>
                {sonGorusmeler.map(g => (
                  <div
                    key={g.id}
                    onClick={() => navigate(`/gorusmeler/${g.id}`)}
                    style={{
                      padding: '12px 20px',
                      borderBottom: '1px solid var(--border-default)',
                      cursor: 'pointer',
                      transition: 'background 120ms',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {g.firmaAdi || g.firmaAd}
                      </span>
                      <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {g.tarih}
                      </span>
                    </div>
                    <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {g.konu} · {g.gorusen}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </section>

      {/* ── Modüller ── */}
      {gorunenModuller.length > 0 && (
        <section>
          <p className="t-label" style={{ marginBottom: 12 }}>MODÜLLER</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {gorunenModuller.map(modul => {
              const IconC = MODUL_ICONS[modul.id] ?? BarChart3
              return (
                <Card
                  key={modul.id}
                  onClick={() => navigate(modul.yol)}
                  style={{ cursor: 'pointer', transition: 'border-color 120ms, box-shadow 120ms' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-primary)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)' }}
                >
                  <div style={{
                    width: 36, height: 36,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--brand-primary-soft)',
                    color: 'var(--brand-primary)',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: 10,
                  }}>
                    <IconC size={18} strokeWidth={1.5} />
                  </div>
                  <div style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 2 }}>
                    {modul.isim}
                  </div>
                  <div className="t-caption">{modul.aciklama}</div>
                </Card>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
