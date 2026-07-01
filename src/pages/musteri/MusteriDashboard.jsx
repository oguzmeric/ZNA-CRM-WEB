import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Plus, Clock, Loader2, CheckCircle2, AlertTriangle, TrendingUp, TrendingDown, Minus,
  AlertOctagon, CalendarRange, Briefcase, Phone, MessageSquare,
  Inbox, ArrowRight, Bell, Sparkles, User,
  PlayCircle, MessageCircle, RefreshCcw, UserCheck, Mail, Timer, Target, FolderOpen,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useServisTalebi } from '../../context/ServisTalebiContext'
import { benimMusteriKaydim } from '../../services/musteriService'
import { aktifDuyurulariGetir } from '../../services/duyuruService'
import { PORTAL_BLUE } from '../../layouts/MusteriLayout'

const DURUM_ROZET = {
  bekliyor:     { label: 'Bekleyen',    bg: PORTAL_BLUE[50],  fg: PORTAL_BLUE[800], border: PORTAL_BLUE[100] },
  inceleniyor:  { label: 'İnceleniyor', bg: PORTAL_BLUE[400], fg: '#fff',           border: PORTAL_BLUE[400] },
  atandi:       { label: 'Atandı',      bg: PORTAL_BLUE[400], fg: '#fff',           border: PORTAL_BLUE[400] },
  devam_ediyor: { label: 'Devam eden',  bg: PORTAL_BLUE[400], fg: '#fff',           border: PORTAL_BLUE[400] },
  tamamlandi:   { label: 'Tamamlanan',  bg: PORTAL_BLUE[600], fg: '#fff',           border: PORTAL_BLUE[600] },
  iptal:        { label: 'İptal',       bg: 'var(--surface-sunken)', fg: 'var(--text-secondary)', border: 'var(--border-default)' },
}

function CountUp({ value, duration = 600 }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const start = performance.now()
    const from = 0
    const delta = value - from
    let raf
    const step = now => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + delta * eased))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <>{display}</>
}

function Sparkline({ data, stroke }) {
  if (!data || data.length === 0) return null
  const w = 100, h = 18
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const span = Math.max(1, max - min)
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w
      const y = h - ((v - min) / span) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden="true">
      <motion.polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </svg>
  )
}

function KPIKarti({ sayi, baslik, Icon, borderColor, chipBg, chipFg, onClick }) {
  const [hover, setHover] = useState(false)
  const bos = sayi === 0
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      style={{
        position: 'relative',
        background: 'var(--surface-card)',
        border: `1px solid ${hover ? 'var(--border-strong, #d0d5dd)' : 'var(--border-default)'}`,
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 'var(--radius-md)',
        padding: '14px 16px 14px 16px',
        textAlign: 'left',
        cursor: 'pointer',
        overflow: 'hidden',
        transition: 'border-color 120ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span
          style={{
            width: 28, height: 28, borderRadius: 6,
            background: chipBg, color: chipFg,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon size={15} strokeWidth={1.8} />
        </span>
      </div>
      <div style={{ font: '500 24px/28px var(--font-sans)', color: bos ? 'var(--text-muted, var(--text-tertiary))' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        <CountUp value={sayi} />
      </div>
      <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>
        {baslik}
      </div>
    </motion.button>
  )
}

function aylikTalepHacmi(talepler, ayCount) {
  const now = new Date()
  const aylar = []
  for (let i = ayCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    aylar.push({
      key,
      isim: d.toLocaleDateString('tr-TR', { month: 'short' }),
      yil: d.getFullYear(),
      count: 0,
    })
  }
  for (const t of talepler) {
    const d = new Date(t.olusturmaTarihi)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const ay = aylar.find(a => a.key === key)
    if (ay) ay.count++
  }
  return aylar
}

function BarChart({ data }) {
  const max = Math.max(...data.map(d => d.count), 1)
  const w = 100
  const barW = 9
  const gap = (100 - data.length * barW) / (data.length + 1)
  const h = 140
  const tonlar = [PORTAL_BLUE[100], PORTAL_BLUE[200], PORTAL_BLUE[200], PORTAL_BLUE[400], PORTAL_BLUE[400], PORTAL_BLUE[600], PORTAL_BLUE[600], PORTAL_BLUE[600], PORTAL_BLUE[800], PORTAL_BLUE[800], PORTAL_BLUE[900], PORTAL_BLUE[900]]
  const grids = [0.25, 0.5, 0.75, 1]
  return (
    <div style={{ position: 'relative', height: h + 24, overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ overflow: 'hidden', display: 'block' }}>
        {grids.map((g, i) => (
          <line
            key={i}
            x1="0"
            x2={w}
            y1={h - g * h}
            y2={h - g * h}
            stroke="var(--border-default)"
            strokeWidth="0.3"
            strokeDasharray="0.8,0.8"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {data.map((d, i) => {
          const barH = (d.count / max) * (h - 4)
          const x = gap + i * (barW + gap)
          const y = h - barH
          const tonIdx = Math.floor((i / Math.max(1, data.length - 1)) * (tonlar.length - 1))
          return (
            <g key={d.key}>
              <motion.rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                fill={tonlar[tonIdx]}
                rx="1"
                initial={{ height: 0, y: h }}
                animate={{ height: barH, y }}
                transition={{ duration: 0.5, delay: i * 0.04, ease: 'easeOut' }}
              >
                <title>{`${d.isim}: ${d.count} talep`}</title>
              </motion.rect>
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 0', font: '400 10px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>
        {data.map(d => <span key={d.key} style={{ flex: 1, textAlign: 'center' }}>{d.isim}</span>)}
      </div>
    </div>
  )
}

function DurumRozet({ durum }) {
  const r = DURUM_ROZET[durum] || DURUM_ROZET.bekliyor
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        background: r.bg, color: r.fg,
        border: `1px solid ${r.border}`,
        font: '500 11px/16px var(--font-sans)',
        whiteSpace: 'nowrap',
      }}
    >
      {r.label}
    </span>
  )
}

function HizliAksiyon({ Icon, tint, baslik, aciklama, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: 12,
        background: 'var(--surface-card)',
        border: `1px solid ${hover ? PORTAL_BLUE[400] : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-md)',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'border-color 120ms',
      }}
    >
      <span
        style={{
          width: 36, height: 36, borderRadius: 8,
          background: tint.bg, color: tint.fg,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={18} strokeWidth={1.6} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{baslik}</div>
        <div style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 1 }}>{aciklama}</div>
      </div>
    </motion.button>
  )
}

function tarihFormat(tarih) {
  const d = new Date(tarih)
  const fark = Date.now() - d.getTime()
  const dk = Math.floor(fark / 60000)
  const saat = Math.floor(dk / 60)
  const gun = Math.floor(saat / 24)
  if (dk < 60) return `${Math.max(1, dk)} dk önce`
  if (saat < 24) return `${saat} sa önce`
  if (gun < 7) return `${gun} gün önce`
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
}

export default function MusteriDashboard() {
  const { kullanici } = useAuth()
  const { musteriTalepleri, ANA_TURLER } = useServisTalebi()
  const navigate = useNavigate()

  const [musteriKaydi, setMusteriKaydi] = useState(null)
  const [duyurular, setDuyurular] = useState([])

  useEffect(() => {
    let iptal = false
    Promise.all([benimMusteriKaydim(), aktifDuyurulariGetir()])
      .then(([m, d]) => {
        if (iptal) return
        setMusteriKaydi(m)
        setDuyurular(d || [])
      })
      .catch(err => console.error('[MusteriDashboard yükle]', err))
    return () => { iptal = true }
  }, [])

  const talepler = musteriTalepleri(kullanici?.musteriId)

  const izinliTurler = kullanici?.izinliTurler
  const izinliSet = izinliTurler && izinliTurler.length > 0 ? new Set(izinliTurler) : null
  const izinli = tid => !izinliSet || izinliSet.has(tid)

  // Kategoriler — olusturmaTarihi kayıtta yok olabilir, guvenlik için filtrelenir
  const acik       = talepler.filter(t => t.durum === 'bekliyor')
  const devam      = talepler.filter(t => ['inceleniyor', 'atandi', 'devam_ediyor'].includes(t.durum))
  const tamamlandi = talepler.filter(t => t.durum === 'tamamlandi')
  const acil       = talepler.filter(t => t.aciliyet === 'acil' && !['tamamlandi', 'iptal'].includes(t.durum))
  const iptal      = talepler.filter(t => t.durum === 'iptal')
  const aktifTalepler = talepler.filter(t => !['tamamlandi', 'iptal'].includes(t.durum))

  // Hizmet performansı metrikleri
  const ortCozumSuresiGun = useMemo(() => {
    if (tamamlandi.length === 0) return null
    const toplamMs = tamamlandi.reduce((acc, t) => {
      const bas = new Date(t.olusturmaTarihi).getTime()
      const bit = new Date(t.guncellemeTarihi || t.olusturmaTarihi).getTime()
      return acc + Math.max(0, bit - bas)
    }, 0)
    const ortMs = toplamMs / tamamlandi.length
    return ortMs / (1000 * 60 * 60 * 24)
  }, [tamamlandi.length])

  const ilkCozumOrani = useMemo(() => {
    const toplam = tamamlandi.length + iptal.length
    if (toplam === 0) return null
    return Math.round((tamamlandi.length / toplam) * 100)
  }, [tamamlandi.length, iptal.length])

  const enEskiAcikGun = useMemo(() => {
    if (aktifTalepler.length === 0) return null
    const eski = Math.min(...aktifTalepler.map(t => new Date(t.olusturmaTarihi).getTime()))
    return Math.floor((Date.now() - eski) / (1000 * 60 * 60 * 24))
  }, [aktifTalepler.length])

  const sonTalepler = [...talepler]
    .sort((a, b) => new Date(b.olusturmaTarihi) - new Date(a.olusturmaTarihi))
    .slice(0, 5)

  const temsilciK = musteriKaydi?.temsilci
  const temsilciInisyal = temsilciK?.ad
    ? temsilciK.ad.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
    : ''
  const temsilci = temsilciK
    ? { ad: temsilciK.ad, inisyal: temsilciInisyal, online: temsilciK.durum === 'cevrimici', email: temsilciK.email }
    : null
  const DUYURU_TON = { info: PORTAL_BLUE[400], warning: '#B77516', success: '#2F7D4F' }
  const duyuruListe = duyurular.slice(0, 5).map(d => ({
    id: d.id,
    baslik: d.baslik,
    icerik: d.icerik,
    zaman: tarihFormat(d.baslangicTarihi),
    ton: DUYURU_TON[d.seviye] || PORTAL_BLUE[400],
  }))
  // Detaylı aktiviteler: notlar + durum geçmişi + atamalar
  const aktiviteler = useMemo(() => {
    const items = []
    for (const t of talepler) {
      // Son 2 not
      const notlar = Array.isArray(t.notlar) ? t.notlar.slice(-2) : []
      for (const n of notlar) {
        const metin = String(n?.metin || n?.icerik || n?.text || '').trim()
        const zaman = n?.olusturmaTarihi || n?.tarih || n?.createdAt
        if (zaman) {
          items.push({
            id: `${t.id}-not-${zaman}`,
            refId: t.talepNo,
            tip: 'not',
            aciklama: metin ? `yeni not: "${metin.slice(0, 50)}${metin.length > 50 ? '…' : ''}"` : 'yeni not eklendi',
            zamanTs: new Date(zaman).getTime(),
            talepId: t.id,
          })
        }
      }
      // Son durum geçmişi
      const dg = Array.isArray(t.durumGecmisi) ? t.durumGecmisi.slice(-1) : []
      for (const d of dg) {
        const zaman = d?.tarih || d?.olusturmaTarihi || d?.createdAt
        const yeniDurum = d?.yeniDurum || d?.durum
        if (zaman) {
          const durumIsmi = DURUM_ROZET[yeniDurum]?.label || yeniDurum || 'güncellendi'
          items.push({
            id: `${t.id}-durum-${zaman}`,
            refId: t.talepNo,
            tip: 'durum',
            aciklama: `durum: ${durumIsmi}`,
            zamanTs: new Date(zaman).getTime(),
            talepId: t.id,
          })
        }
      }
      // Atama
      if (t.atamaTarihi && t.temsilciAdi) {
        items.push({
          id: `${t.id}-atama`,
          refId: t.talepNo,
          tip: 'atama',
          aciklama: `${t.temsilciAdi} atandı`,
          zamanTs: new Date(t.atamaTarihi).getTime(),
          talepId: t.id,
        })
      }
    }
    // Hiç bir zengin aktivite yoksa, son talepleri ekle
    if (items.length === 0) {
      for (const t of sonTalepler.slice(0, 4)) {
        items.push({
          id: `${t.id}-olusturuldu`,
          refId: t.talepNo,
          tip: 'durum',
          aciklama: 'talep oluşturuldu',
          zamanTs: new Date(t.olusturmaTarihi).getTime(),
          talepId: t.id,
        })
      }
    }
    return items
      .filter(a => !Number.isNaN(a.zamanTs))
      .sort((a, b) => b.zamanTs - a.zamanTs)
      .slice(0, 5)
      .map(a => ({ ...a, zaman: tarihFormat(a.zamanTs) }))
  }, [talepler.length])

  const kullaniciAd = kullanici?.ad || 'Değerli müşterimiz'
  const bugun = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Banner */}
      <section
        style={{
          position: 'relative',
          background: PORTAL_BLUE[600],
          color: '#fff',
          borderRadius: 'var(--radius-lg)',
          padding: '18px 22px',
          overflow: 'hidden',
        }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 200 200"
          width="200"
          height="200"
          style={{ position: 'absolute', right: -20, top: -40, opacity: 0.15, pointerEvents: 'none' }}
        >
          {[40, 70, 100, 130].map(r => (
            <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="#fff" strokeWidth="1" />
          ))}
        </svg>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ font: '400 12px/16px var(--font-sans)', opacity: 0.8 }}>Hoş geldiniz,</div>
            <div style={{ font: '500 20px/26px var(--font-sans)', marginTop: 2 }}>{kullaniciAd}</div>
            <div style={{ font: '400 12px/16px var(--font-sans)', opacity: 0.75, marginTop: 4 }}>
              {bugun}{kullanici?.firmaAdi ? ` · ${kullanici.firmaAdi}` : ''}
            </div>
          </div>
          <motion.button
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/musteri-portal/yeni-talep')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              height: 36, padding: '0 16px',
              background: '#fff', color: PORTAL_BLUE[600],
              border: 'none', borderRadius: 'var(--radius-sm)',
              font: '500 13px/18px var(--font-sans)',
              cursor: 'pointer',
            }}
          >
            <Plus size={15} strokeWidth={1.8} />
            Yeni talep oluştur
          </motion.button>
        </div>
      </section>

      {/* KPI */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 12,
        }}
      >
        <KPIKarti
          sayi={acik.length}
          baslik="Bekleyen talepler"
          Icon={Clock}
          borderColor="#185FA5"
          chipBg="#E6F1FB"
          chipFg="#0C447C"
          onClick={() => navigate('/musteri-portal/taleplerim?durum=bekliyor')}
        />
        <KPIKarti
          sayi={devam.length}
          baslik="Devam eden"
          Icon={PlayCircle}
          borderColor="#BA7517"
          chipBg="#FAEEDA"
          chipFg="#854F0B"
          onClick={() => navigate('/musteri-portal/taleplerim?durum=devam')}
        />
        <KPIKarti
          sayi={tamamlandi.length}
          baslik="Tamamlanan"
          Icon={CheckCircle2}
          borderColor="#0F6E56"
          chipBg="#E1F5EE"
          chipFg="#085041"
          onClick={() => navigate('/musteri-portal/taleplerim?durum=tamamlandi')}
        />
        <KPIKarti
          sayi={acil.length}
          baslik="Acil talepler"
          Icon={AlertTriangle}
          borderColor="#A32D2D"
          chipBg="#FCEBEB"
          chipFg="#791F1F"
          onClick={() => navigate('/musteri-portal/taleplerim?aciliyet=acil')}
        />
      </section>

      {/* Ana + yan grid */}
      <section
        className="musteri-dashboard-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
          gap: 16,
        }}
      >
        {/* Sol kolon */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* Hizmet Performansı */}
          <div
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: 16,
            }}
          >
            <div style={{ font: '500 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Hizmet Performansı
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
              {/* Ort. çözüm süresi */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: '#E6F1FB', color: '#0C447C',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <Timer size={18} strokeWidth={1.8} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: '500 20px/24px var(--font-sans)', color: ortCozumSuresiGun == null ? 'var(--text-tertiary)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {ortCozumSuresiGun == null ? '—' : `${ortCozumSuresiGun.toFixed(1)} gün`}
                  </div>
                  <div style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                    Ort. çözüm süresi
                  </div>
                </div>
              </div>
              {/* İlk çözüm oranı */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: '#E1F5EE', color: '#085041',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <Target size={18} strokeWidth={1.8} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: '500 20px/24px var(--font-sans)', color: ilkCozumOrani == null ? 'var(--text-tertiary)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {ilkCozumOrani == null ? '—' : `${ilkCozumOrani}%`}
                  </div>
                  <div style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                    İlk çözüm oranı
                  </div>
                </div>
              </div>
              {/* Açık talep + en eski */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: '#FAEEDA', color: '#854F0B',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <FolderOpen size={18} strokeWidth={1.8} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: '500 20px/24px var(--font-sans)', color: aktifTalepler.length === 0 ? 'var(--text-tertiary)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {aktifTalepler.length}
                  </div>
                  <div style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                    Açık talebiniz{enEskiAcikGun != null && enEskiAcikGun > 0 ? ` · en eskisi ${enEskiAcikGun} gün` : ''}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Son talepler */}
          <div
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-default)',
              }}
            >
              <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>Son talepler</div>
              <button
                type="button"
                onClick={() => navigate('/musteri-portal/taleplerim')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
                  color: PORTAL_BLUE[600], font: '500 12px/16px var(--font-sans)',
                }}
              >
                Tümünü gör <ArrowRight size={13} strokeWidth={1.8} />
              </button>
            </div>

            {sonTalepler.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                <div
                  aria-hidden="true"
                  style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: PORTAL_BLUE[50], color: PORTAL_BLUE[600],
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 10,
                  }}
                >
                  <Inbox size={22} strokeWidth={1.6} />
                </div>
                <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>Henüz talep oluşturmadınız</div>
                <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4, marginBottom: 12 }}>
                  İlk talebinizi oluşturun, çözüm sürecini buradan takip edin.
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/musteri-portal/yeni-talep')}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    height: 34, padding: '0 14px',
                    background: PORTAL_BLUE[600], color: '#fff',
                    border: 'none', borderRadius: 'var(--radius-sm)',
                    font: '500 12px/16px var(--font-sans)',
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={13} strokeWidth={1.8} /> Yeni talep
                </button>
              </div>
            ) : (
              <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {sonTalepler.map((t, i) => {
                  const tur = ANA_TURLER.find(x => x.id === t.anaTur)
                  const son = i === sonTalepler.length - 1
                  return (
                    <motion.li
                      key={t.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.05 }}
                    >
                      <button
                        type="button"
                        onClick={() => navigate(`/musteri-portal/talep/${t.id}`)}
                        style={{
                          width: '100%',
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '12px 16px',
                          border: 'none',
                          borderBottom: son ? 'none' : '1px solid var(--border-default)',
                          background: 'transparent',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'background 120ms',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <DurumRozet durum={t.durum} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              font: '500 13px/18px var(--font-sans)',
                              color: 'var(--text-primary)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}
                          >
                            {t.konu}
                          </div>
                          <div style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                            {t.talepNo}
                          </div>
                        </div>
                        {tur && (
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-pill)',
                              background: 'var(--surface-sunken)',
                              color: 'var(--text-secondary)',
                              font: '500 11px/16px var(--font-sans)',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                            }}
                          >
                            {tur.isim}
                          </span>
                        )}
                      </button>
                    </motion.li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Hızlı aksiyonlar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 10,
            }}
          >
            {izinli('ariza') && (
              <HizliAksiyon
                Icon={AlertOctagon}
                tint={{ bg: PORTAL_BLUE[50], fg: PORTAL_BLUE[800] }}
                baslik="Arıza bildir"
                aciklama="Cihaz veya sistem arızası"
                onClick={() => navigate('/musteri-portal/yeni-talep?tur=ariza')}
              />
            )}
            {izinli('bakim') && (
              <HizliAksiyon
                Icon={CalendarRange}
                tint={{ bg: PORTAL_BLUE[50], fg: PORTAL_BLUE[600] }}
                baslik="Bakım planla"
                aciklama="Periyodik bakım talebi"
                onClick={() => navigate('/musteri-portal/yeni-talep?tur=bakim')}
              />
            )}
            {izinli('teklif') && (
              <HizliAksiyon
                Icon={Briefcase}
                tint={{ bg: PORTAL_BLUE[50], fg: PORTAL_BLUE[400] }}
                baslik="Teklif iste"
                aciklama="Ürün veya hizmet teklifi"
                onClick={() => navigate('/musteri-portal/teklif-iste')}
              />
            )}
          </div>
        </div>

        {/* Sağ kolon */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* Temsilci / Bize ulaşın */}
          <div
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: 16,
            }}
          >
            <div style={{ font: '500 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {temsilci ? 'Temsilciniz' : 'Bize ulaşın'}
            </div>
            {temsilci ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: PORTAL_BLUE[50], color: PORTAL_BLUE[800],
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        font: '500 14px/1 var(--font-sans)',
                      }}
                    >
                      {temsilci.inisyal}
                    </span>
                    <span
                      aria-label={temsilci.online ? 'Çevrimiçi' : 'Çevrimdışı'}
                      style={{
                        position: 'absolute', right: -1, bottom: -1,
                        width: 11, height: 11, borderRadius: '50%',
                        background: temsilci.online ? '#22c55e' : 'var(--text-tertiary)',
                        border: '2px solid var(--surface-card)',
                      }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {temsilci.ad}
                    </div>
                    <div style={{ font: '400 11px/16px var(--font-sans)', color: temsilci.online ? '#16a34a' : 'var(--text-tertiary)', marginTop: 2 }}>
                      ● {temsilci.online ? 'Çevrimiçi' : 'Çevrimdışı'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <a
                    href={temsilci.email ? `mailto:${temsilci.email}` : undefined}
                    aria-disabled={!temsilci.email}
                    style={{
                      flex: 1, height: 32,
                      background: 'var(--surface-card)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      font: '500 12px/16px var(--font-sans)',
                      cursor: temsilci.email ? 'pointer' : 'not-allowed',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      textDecoration: 'none',
                      opacity: temsilci.email ? 1 : 0.5,
                    }}
                  >
                    <Phone size={13} strokeWidth={1.8} /> E-posta
                  </a>
                  <button
                    type="button"
                    onClick={() => navigate('/musteri-portal/yeni-talep')}
                    style={{
                      flex: 1, height: 32,
                      background: PORTAL_BLUE[600],
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      color: '#fff',
                      font: '500 12px/16px var(--font-sans)',
                      cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      transition: 'background 120ms',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = PORTAL_BLUE[800]}
                    onMouseLeave={e => e.currentTarget.style.background = PORTAL_BLUE[600]}
                  >
                    <MessageSquare size={13} strokeWidth={1.8} /> Talep aç
                  </button>
                </div>
              </>
            ) : (
              <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <li>
                  <a
                    href="tel:+902120000000"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '6px 0',
                      textDecoration: 'none',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: '#E6F1FB', color: '#0C447C',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Phone size={15} strokeWidth={1.8} />
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>Destek hattı</div>
                      <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', marginTop: 1 }}>0212 xxx xx xx</div>
                    </div>
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:destek@znateknoloji.com"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '6px 0',
                      textDecoration: 'none',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: '#E1F5EE', color: '#085041',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Mail size={15} strokeWidth={1.8} />
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>E-posta</div>
                      <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>destek@znateknoloji.com</div>
                    </div>
                  </a>
                </li>
              </ul>
            )}
          </div>

          {/* Duyurular — sadece varsa göster */}
          {duyuruListe.length > 0 && (
            <div
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                  <Bell size={13} strokeWidth={1.8} /> Duyurular
                </div>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-pill)',
                    background: PORTAL_BLUE[50],
                    color: PORTAL_BLUE[800],
                    font: '500 11px/16px var(--font-sans)',
                  }}
                >
                  {duyuruListe.length} aktif
                </span>
              </div>
              <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {duyuruListe.map(d => (
                  <li key={d.id} style={{ display: 'flex', gap: 10 }}>
                    <span
                      aria-hidden="true"
                      style={{ width: 2, alignSelf: 'stretch', background: d.ton, borderRadius: 1, flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-primary)' }}>{d.baslik}</div>
                      {d.icerik && (
                        <div style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'pre-wrap' }}>
                          {d.icerik}
                        </div>
                      )}
                      <div style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>{d.zaman}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Aktiviteler */}
          <div
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: 16,
            }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 10 }}>
              <Sparkles size={13} strokeWidth={1.8} /> Son aktiviteler
            </div>
            {aktiviteler.length === 0 ? (
              <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                Henüz aktivite yok.
              </div>
            ) : (
              <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {aktiviteler.map(a => {
                  const IkonMap = {
                    not:    { Icon: MessageCircle, bg: '#FAEEDA', fg: '#854F0B' },
                    durum:  { Icon: RefreshCcw,    bg: '#E1F5EE', fg: '#085041' },
                    atama:  { Icon: UserCheck,     bg: '#E6F1FB', fg: '#0C447C' },
                  }
                  const tip = IkonMap[a.tip] || IkonMap.durum
                  const IkonComp = tip.Icon
                  return (
                    <li key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: tip.bg, color: tip.fg,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, marginTop: 1,
                        }}
                      >
                        <IkonComp size={12} strokeWidth={1.8} />
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ font: '400 12px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                          <span style={{ color: PORTAL_BLUE[600], fontFamily: 'var(--font-mono)', fontWeight: 500, cursor: 'pointer' }} onClick={() => navigate(`/musteri-portal/talep/${a.talepId}`)}>{a.refId}</span>
                          {' '}— {a.aciklama}
                        </div>
                        <div style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 1 }}>{a.zaman}</div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Responsive — yan panel altta, KPI 2x2 */}
      <style>{`
        @media (max-width: 1279px) {
          .musteri-dashboard-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
