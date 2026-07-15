import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Phone, FileText, KeyRound, CheckSquare, MapPin, Inbox, Infinity as InfIcon, ArrowRight,
  Building2, Mail, Clock, Plus, Wrench, ReceiptText, AlertTriangle, User, Video,
} from 'lucide-react'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { teklifleriGetir } from '../services/teklifService'
import { gorevleriGetir } from '../services/gorevService'
import { lisanslariGetir } from '../services/lisansService'
import { musterileriGetir } from '../services/musteriService'
import { musteriToplantilariGetir } from '../services/takvimBaglantiService'
import { useAuth } from '../context/AuthContext'
import { useServisTalebi } from '../context/ServisTalebiContext'
import {
  Button, Card, CardTitle, Badge, CodeBadge, Modal, EmptyState, Avatar,
} from '../components/ui'
import { SkeletonDetay } from '../components/Skeleton'

const lisansTipiLabel = { sureksiz: 'Süreli', sureksiz_demo: 'Demo', sureksiz_surekli: 'Sürekli' }
const lisansDurumTone = { aktif: 'aktif', pasif: 'pasif', suresi_doldu: 'kayip', beklemede: 'beklemede' }
const lisansDurumIsim = { aktif: 'Aktif', pasif: 'Pasif', suresi_doldu: 'Süresi Doldu', beklemede: 'Beklemede' }

const OLAY_KONFIG = {
  gorusme: { isim: 'Görüşme', C: Phone,       tone: 'lead',      renk: 'var(--info)' },
  teklif:  { isim: 'Teklif',  C: FileText,    tone: 'brand',     renk: 'var(--brand-primary)' },
  lisans:  { isim: 'Lisans',  C: KeyRound,    tone: 'brand',     renk: 'var(--brand-primary)' },
  gorev:   { isim: 'Görev',   C: CheckSquare, tone: 'beklemede', renk: 'var(--warning)' },
  // Takvimden müşteriye bağlanan Google Meet toplantıları (mig 173)
  toplanti: { isim: 'Toplantı', C: Video,     tone: 'lead',      renk: '#a855f7' },
}

const onayTone = {
  takipte:    'lead',
  kabul:      'aktif',
  vazgecildi: 'kayip',
  revizyon:   'beklemede',
}
const onayIsim = {
  takipte:    'Takipte',
  kabul:      'Kabul',
  vazgecildi: 'Vazgeçildi',
  revizyon:   'Revizyon',
}

const fmtTL = (n) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })

function LisansModal({ lisans, onKapat }) {
  if (!lisans) return null
  const bugun = new Date()
  const bitis = lisans.bitisTarih ? new Date(lisans.bitisTarih) : null
  const kalanGun = bitis ? Math.ceil((bitis - bugun) / (1000 * 60 * 60 * 24)) : null
  const durumT = lisansDurumTone[lisans.durum] ?? 'neutral'

  const Row = ({ label, children }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      gap: 12, padding: '10px 0',
      borderBottom: '1px solid var(--border-default)',
    }}>
      <span className="t-label">{label}</span>
      <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', textAlign: 'right' }}>
        {children}
      </span>
    </div>
  )

  return (
    <Modal
      open={!!lisans}
      onClose={onKapat}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <KeyRound size={16} strokeWidth={1.5} style={{ color: 'var(--brand-primary)' }} />
          {lisans.lisansTuru}
        </span>
      }
      footer={<Button variant="secondary" onClick={onKapat}>Kapat</Button>}
      width={480}
    >
      <div style={{ marginBottom: 8 }}>
        <CodeBadge>{lisans.lisansKodu}</CodeBadge>
      </div>
      {lisans.lisansId && <Row label="LİSANS ID"><CodeBadge>{lisans.lisansId}</CodeBadge></Row>}
      <Row label="FİRMA">{lisans.firmaAdi}</Row>
      {lisans.lokasyon && (
        <Row label="LOKASYON / ŞUBE">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={12} strokeWidth={1.5} /> {lisans.lokasyon}
          </span>
        </Row>
      )}
      {lisans.sunucuAdi && <Row label="SUNUCU / IP"><span style={{ fontFamily: 'var(--font-mono)' }}>{lisans.sunucuAdi}</span></Row>}
      <Row label="TİP"><Badge tone="brand">{lisansTipiLabel[lisans.lisansTipi] || lisans.lisansTipi}</Badge></Row>
      <Row label="DURUM"><Badge tone={durumT}>{lisansDurumIsim[lisans.durum]}</Badge></Row>
      {lisans.kanalSayisi && <Row label="KANAL SAYISI"><span style={{ fontVariantNumeric: 'tabular-nums' }}>{lisans.kanalSayisi} kanal</span></Row>}
      <Row label="BAŞLANGIÇ"><span style={{ fontVariantNumeric: 'tabular-nums' }}>{lisans.baslangicTarih || '—'}</span></Row>
      <Row label="BİTİŞ">
        {lisans.lisansTipi === 'sureksiz_surekli' ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--success)' }}>
            <InfIcon size={14} strokeWidth={1.5} /> Sürekli
          </span>
        ) : (
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{lisans.bitisTarih || '—'}</span>
            {kalanGun !== null && kalanGun >= 0 && kalanGun <= 30 && (
              <span style={{ font: '500 11px/16px var(--font-sans)', color: 'var(--warning)' }}>{kalanGun} gün kaldı</span>
            )}
            {kalanGun !== null && kalanGun < 0 && (
              <span style={{ font: '500 11px/16px var(--font-sans)', color: 'var(--danger)' }}>Süresi doldu</span>
            )}
          </span>
        )}
      </Row>
      {lisans.notlar && (
        <div style={{ paddingTop: 12 }}>
          <p className="t-label" style={{ marginBottom: 4 }}>NOTLAR</p>
          <p style={{
            font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', margin: 0,
            padding: '10px 12px',
            background: 'var(--surface-sunken)',
            borderRadius: 'var(--radius-sm)',
          }}>{lisans.notlar}</p>
        </div>
      )}
    </Modal>
  )
}

function FirmaGecmisi() {
  const { firmaAdi } = useParams()
  const navigate = useNavigate()
  const firma = decodeURIComponent(firmaAdi)

  const [aktifSekme, setAktifSekme] = useState('hepsi')
  const [yukleniyor, setYukleniyor] = useState(true)
  const [secilenLisans, setSecilenLisans] = useState(null)
  const [gosterilenSayi, setGosterilenSayi] = useState(20)
  useEffect(() => { setGosterilenSayi(20) }, [aktifSekme])

  const [gorusmeler, setGorusmeler] = useState([])
  const [teklifler, setTeklifler] = useState([])
  const [lisanslar, setLisanslar] = useState([])
  const [gorevler, setGorevler] = useState([])
  const [musteri, setMusteri] = useState(null)
  const [toplantilar, setToplantilar] = useState([])
  const { kullanicilar } = useAuth()
  const { talepler } = useServisTalebi()

  useEffect(() => {
    (async () => {
      setYukleniyor(true)
      try {
        const [g, t, l, gr, m] = await Promise.all([
          gorusmeleriGetir(), teklifleriGetir(), lisanslariGetir(), gorevleriGetir(), musterileriGetir(),
        ])
        setGorusmeler((g || []).filter(i => i.firmaAdi === firma))
        setTeklifler((t || []).filter(i => i.firmaAdi === firma))
        setLisanslar((l || []).filter(i => i.firmaAdi === firma))
        setGorevler((gr || []).filter(i => i.firmaAdi === firma))
        // Toplantı bağı musteri_id üzerinden — bu sayfa firma ADI ile çalışıyor,
        // önce müşteri kartını çöz, sonra toplantıları çek.
        const kart = (m || []).find(i => i.firma === firma) || null
        setMusteri(kart)
        setToplantilar(kart ? await musteriToplantilariGetir(kart.id) : [])
      } catch (err) {
        console.error('[FirmaGecmisi yükle]', err)
      } finally {
        setYukleniyor(false)
      }
    })()
  }, [firma])

  const firmaTalepleri = (talepler || []).filter(t => t.firmaAdi === firma)
  const acikTalepler = firmaTalepleri.filter(t => !['tamamlandi', 'iptal'].includes(t.durum))
  const temsilci = musteri?.temsilciKullaniciId
    ? (kullanicilar || []).find(k => k.id === musteri.temsilciKullaniciId)
    : null
  const sonGorusme = gorusmeler[0] || gorusmeler.slice().sort((a, b) => new Date(b.tarih) - new Date(a.tarih))[0]
  const ilkGorusme = useMemo(() => {
    const tum = [...gorusmeler, ...teklifler.map(t => ({ tarih: t.tarih }))]
    return tum.length > 0
      ? tum.reduce((min, x) => new Date(x.tarih) < new Date(min.tarih) ? x : min)
      : null
  }, [gorusmeler, teklifler])

  // KPI delta + sparkline (son 6 ay)
  const aylikSay = (arr) => {
    const aylar = []
    const simdi = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(simdi.getFullYear(), simdi.getMonth() - i, 1)
      const bitis = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      aylar.push(arr.filter(x => { const xd = new Date(x.tarih || x.olusturmaTarih); return xd >= d && xd < bitis }).length)
    }
    return aylar
  }
  const gunFark = (tarih) => Math.floor((Date.now() - new Date(tarih).getTime()) / 86400000)
  const gorusmeAylik  = aylikSay(gorusmeler)
  const teklifAylik   = aylikSay(teklifler)
  const lisansAylik   = aylikSay(lisanslar)
  const gorevAylik    = aylikSay(gorevler)
  const son30 = (arr) => arr.filter(x => gunFark(x.tarih || x.olusturmaTarih) <= 30).length

  const tumOlaylar = [
    ...gorusmeler.map(g => ({
      id: `gorusme-${g.id}`, tip: 'gorusme', tarih: g.tarih,
      baslik: g.konu, detay: `Görüşen: ${g.gorusen} · Durum: ${g.durum}`,
      veri: g,
    })),
    ...teklifler.map(t => ({
      id: `teklif-${t.id}`, tip: 'teklif', tarih: t.tarih,
      baslik: t.konu,
      detay: `${t.teklifNo} · ₺${fmtTL(t.genelToplam)}`,
      veri: t,
    })),
    ...lisanslar.map(l => ({
      id: `lisans-${l.id}`, tip: 'lisans', tarih: l.baslangicTarih,
      baslik: `${l.lisansTuru} Lisansı`,
      detay: `${l.lisansKodu} · ${lisansDurumIsim[l.durum] || l.durum}`,
      veri: l,
    })),
    ...gorevler.map(g => ({
      id: `gorev-${g.id}`, tip: 'gorev', tarih: g.olusturmaTarih?.split('T')[0] || '',
      baslik: g.baslik,
      detay: `Atanan: ${g.atananAd || ''} · ${g.durum}`,
      veri: g,
    })),
    ...toplantilar.map(t => ({
      id: `toplanti-${t.id}`, tip: 'toplanti',
      tarih: (t.baslangic || '').split('T')[0],
      baslik: t.baslik || '(başlıksız toplantı)',
      detay: [
        new Date(t.baslangic).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        Array.isArray(t.davetliler) && t.davetliler.length ? `${t.davetliler.length} davetli` : null,
        t.toplanti_linki ? 'Meet' : null,
      ].filter(Boolean).join(' · '),
      veri: t,
    })),
  ].sort((a, b) => new Date(b.tarih) - new Date(a.tarih))

  const filtreliOlaylar = aktifSekme === 'hepsi' ? tumOlaylar : tumOlaylar.filter(o => o.tip === aktifSekme)

  if (yukleniyor) {
    return <SkeletonDetay />
  }

  const toplamTeklif = teklifler.reduce((s, t) => s + (t.genelToplam || 0), 0)
  const kabulTeklif  = teklifler.filter(t => t.onayDurumu === 'kabul').reduce((s, t) => s + (t.genelToplam || 0), 0)
  const kabulOrani   = teklifler.length > 0
    ? Math.round((teklifler.filter(t => t.onayDurumu === 'kabul').length / teklifler.length) * 100)
    : 0

  const KPI_RENK = {
    gorusme: 'var(--info)',
    teklif:  'var(--brand-primary)',
    lisans:  '#534AB7',
    gorev:   'var(--warning)',
    toplanti: '#a855f7',
  }
  const sparkline = (data, renk) => {
    if (data.every(v => v === 0)) {
      return <line x1="0" y1="18" x2="100" y2="18" stroke="var(--border-default)" strokeWidth="1" strokeDasharray="2 3" />
    }
    const max = Math.max(1, ...data)
    const step = 100 / Math.max(data.length - 1, 1)
    const pts = data.map((v, i) => `${i * step},${18 - (v / max) * 16}`).join(' ')
    return <polyline points={pts} fill="none" stroke={renk} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
  }
  const KPICard = ({ k }) => {
    const aktif = aktifSekme === k.key
    const delta = k.delta || 0
    const renk = KPI_RENK[k.key]
    return (
      <button
        onClick={() => setAktifSekme(k.key)}
        style={{
          textAlign: 'left',
          background: 'var(--surface-card)',
          border: `1px solid ${aktif ? renk : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-md)',
          padding: 12,
          cursor: 'pointer',
          borderLeftWidth: 3,
          borderLeftColor: renk,
          transition: 'border-color 120ms',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, color: 'var(--text-tertiary)' }}>
          <k.C size={12} strokeWidth={1.6} style={{ color: renk }} />
          <span style={{ font: '600 10.5px/14px var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.isim}</span>
        </div>
        <div style={{ font: '700 22px/26px var(--font-sans)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{k.sayi}</div>
        <div style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>{k.altyazi}</div>
        <svg width="100%" height="20" viewBox="0 0 100 20" style={{ marginTop: 4, display: 'block' }}>
          {sparkline(k.spark || [], renk)}
        </svg>
      </button>
    )
  }

  return (
    <>
      <div style={{ padding: 20, maxWidth: 1240, margin: '0 auto' }}>

        {/* Geri butonu */}
        <Button variant="secondary" size="sm" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>
          Geri
        </Button>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 240px', gap: 16, alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>

        {/* Firma context kartı */}
        <Card style={{ marginBottom: 14, padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--brand-primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Building2 size={18} strokeWidth={1.6} style={{ color: 'var(--brand-primary)' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: '500 16px/22px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{firma}</div>
              <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {musteri?.sehir && (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MapPin size={11} strokeWidth={1.5} /> {musteri.sehir}</span>)}
                {temsilci && (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>· <User size={11} strokeWidth={1.5} /> {temsilci.ad}</span>)}
                {acikTalepler.length > 0 && (<span style={{ color: 'var(--danger)' }}>· {acikTalepler.length} açık servis</span>)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
              {musteri?.telefon && (
                <a href={`tel:${musteri.telefon}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)', textDecoration: 'none' }}>
                  <Phone size={12} strokeWidth={1.5} /> {musteri.telefon}
                </a>
              )}
              {musteri?.email && (
                <a href={`mailto:${musteri.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)', textDecoration: 'none' }}>
                  <Mail size={12} strokeWidth={1.5} /> {musteri.email}
                </a>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, paddingTop: 10, borderTop: '1px solid var(--border-default)', font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
            {sonGorusme && <span><Clock size={11} strokeWidth={1.5} style={{ verticalAlign: -1 }} /> Son temas: {gunFark(sonGorusme.tarih) === 0 ? 'bugün' : gunFark(sonGorusme.tarih) === 1 ? 'dün' : `${gunFark(sonGorusme.tarih)} gün önce`} · {sonGorusme.gorusen}</span>}
            {ilkGorusme && <span>· İlk kayıt: {new Date(ilkGorusme.tarih).toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })}</span>}
            <span>· {gorusmeler.length + teklifler.length + lisanslar.length + gorevler.length} toplam olay</span>
          </div>
        </Card>

        {/* KPI'lar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 14 }}>
          <KPICard k={{ key: 'gorusme', isim: 'Görüşme', sayi: gorusmeler.length, altyazi: son30(gorusmeler) > 0 ? `+${son30(gorusmeler)} son 30 gün` : 'son 30 günde yok', spark: gorusmeAylik, C: Phone }} />
          <KPICard k={{ key: 'teklif',  isim: 'Teklif',  sayi: teklifler.length,  altyazi: teklifler.length > 0 ? `₺${fmtTL(kabulTeklif)} kabul · %${kabulOrani}` : 'Henüz teklif yok', spark: teklifAylik, C: FileText }} />
          <KPICard k={{ key: 'lisans',  isim: 'Lisans',  sayi: lisanslar.length,  altyazi: lisanslar.length > 0 ? `${lisanslar.filter(l => l.durum === 'aktif').length} aktif` : 'Trassir yok', spark: lisansAylik, C: KeyRound }} />
          <KPICard k={{ key: 'gorev',   isim: 'Görev',   sayi: gorevler.length,   altyazi: gorevler.filter(g => g.durum !== 'tamamlandi').length > 0 ? `${gorevler.filter(g => g.durum !== 'tamamlandi').length} açık görev` : 'Açık görev yok', spark: gorevAylik, C: CheckSquare }} />
        </div>

        {/* Filter chip'leri */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { key: 'hepsi',   isim: 'Tümü',       sayi: tumOlaylar.length },
            { key: 'gorusme', isim: 'Görüşmeler', sayi: gorusmeler.length },
            { key: 'teklif',  isim: 'Teklifler',  sayi: teklifler.length },
            { key: 'lisans',  isim: 'Lisanslar',  sayi: lisanslar.length },
            { key: 'gorev',   isim: 'Görevler',   sayi: gorevler.length },
            { key: 'toplanti', isim: 'Toplantılar', sayi: toplantilar.length },
          ].map(c => {
            const aktif = aktifSekme === c.key
            return (
              <button
                key={c.key}
                onClick={() => setAktifSekme(c.key)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 999,
                  background: aktif ? 'var(--text-primary)' : 'var(--surface-card)',
                  color: aktif ? 'var(--surface-card)' : (c.sayi === 0 ? 'var(--text-tertiary)' : 'var(--text-secondary)'),
                  border: aktif ? 'none' : '1px solid var(--border-default)',
                  font: '500 12px/16px var(--font-sans)',
                  cursor: 'pointer',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {c.isim} <span style={{ opacity: aktif ? 0.7 : 1, marginLeft: 4 }}>{c.sayi}</span>
              </button>
            )
          })}
        </div>

        {/* Timeline — ay basliklarina gore grupla */}
        {filtreliOlaylar.length === 0 ? (
          <EmptyState icon={<Inbox size={32} strokeWidth={1.5} />} title="Bu kategoride kayıt bulunamadı" />
        ) : (() => {
          const goster = filtreliOlaylar.slice(0, gosterilenSayi)
          // Aylik grupla
          const gruplar = []
          let sonAy = null
          goster.forEach(o => {
            const d = new Date(o.tarih)
            const ay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            const ayBaslik = d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
            if (ay !== sonAy) {
              gruplar.push({ ay, ayBaslik, olaylar: [] })
              sonAy = ay
            }
            gruplar[gruplar.length - 1].olaylar.push(o)
          })

          const olayIkonu = (tip) => {
            if (tip === 'gorusme') return { renk: 'var(--info)', soft: 'var(--info-soft, #E6F1FB)', C: Phone, isim: 'Görüşme' }
            if (tip === 'teklif')  return { renk: '#993C1D', soft: '#FAECE7', C: FileText, isim: 'Teklif' }
            if (tip === 'lisans')  return { renk: '#534AB7', soft: '#EEEDFE', C: KeyRound, isim: 'Lisans' }
            return { renk: 'var(--warning)', soft: 'var(--warning-soft, #FAEEDA)', C: CheckSquare, isim: 'Görev' }
          }

          return gruplar.map(g => (
            <div key={g.ay} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 8px' }}>
                <span style={{ font: '600 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{g.ayBaslik}</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
                <span style={{ font: '500 11px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>{g.olaylar.length} olay</span>
              </div>
              <div style={{ position: 'relative', paddingLeft: 22 }}>
                <div style={{ position: 'absolute', left: 8, top: 4, bottom: 4, width: 1, background: 'var(--border-default)' }} />
                {g.olaylar.map(o => {
                  const ik = olayIkonu(o.tip)
                  const Ic = ik.C
                  const onTikla = () => {
                    if (o.tip === 'gorusme') navigate(`/gorusmeler/${o.veri.id}`)
                    if (o.tip === 'teklif')  navigate(`/teklifler/${o.veri.id}`)
                    if (o.tip === 'gorev')   navigate(`/gorevler/${o.veri.id}`)
                    if (o.tip === 'lisans')  setSecilenLisans(o.veri)
                  }
                  const tarih = new Date(o.tarih)
                  return (
                    <div key={o.id} style={{ position: 'relative', paddingBottom: 8 }}>
                      <span style={{
                        position: 'absolute', left: -19, top: 6, width: 18, height: 18, borderRadius: '50%',
                        background: ik.soft, border: `2px solid ${ik.renk}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ic size={9} strokeWidth={1.8} style={{ color: ik.renk }} />
                      </span>
                      <button
                        onClick={onTikla}
                        style={{
                          width: '100%', textAlign: 'left',
                          background: 'var(--surface-card)', border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-sm)', padding: '10px 12px',
                          cursor: 'pointer', transition: 'border-color 120ms',
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = ik.renk}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-default)'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ padding: '1px 7px', borderRadius: 4, background: ik.soft, color: ik.renk, font: '500 10.5px/14px var(--font-sans)' }}>{ik.isim}</span>
                          <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{o.baslik || '—'}</span>
                          {o.tip === 'teklif' && o.veri.onayDurumu && <Badge tone={onayTone[o.veri.onayDurumu]}>{onayIsim[o.veri.onayDurumu]}</Badge>}
                          {o.tip === 'gorusme' && (
                            <Badge tone={o.veri.durum === 'kapali' ? 'kapali' : o.veri.durum === 'beklemede' ? 'beklemede' : 'acik'}>
                              {o.veri.durum === 'acik' ? 'Açık' : o.veri.durum === 'beklemede' ? 'Beklemede' : 'Kapalı'}
                            </Badge>
                          )}
                          <span style={{ marginLeft: 'auto', font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                            {tarih.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                          </span>
                        </div>
                        {o.tip === 'gorusme' && o.veri.takipNotu && (
                          <div style={{ font: '400 12.5px/17px var(--font-sans)', color: 'var(--text-secondary)', marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {o.veri.takipNotu}
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
                          {(o.veri.gorusen || o.veri.atananAd) && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Avatar name={o.veri.gorusen || o.veri.atananAd} size="xs" />
                              {o.veri.gorusen || o.veri.atananAd}
                            </span>
                          )}
                          {o.tip === 'gorusme' && o.veri.irtibatSekli && <span>· {o.veri.irtibatSekli}</span>}
                          {o.tip === 'teklif' && o.veri.genelToplam > 0 && (
                            <span style={{ color: 'var(--brand-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>· ₺{fmtTL(o.veri.genelToplam)}</span>
                          )}
                          {o.tip === 'lisans' && o.veri.kanalSayisi && <span style={{ fontVariantNumeric: 'tabular-nums' }}>· {o.veri.kanalSayisi} kanal</span>}
                          {o.tip === 'gorev' && o.veri.sonTarih && <span>· Son tarih: {new Date(o.veri.sonTarih).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}</span>}
                        </div>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        })()}

        {/* Daha fazla göster */}
        {filtreliOlaylar.length > gosterilenSayi && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20, gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => setGosterilenSayi(s => s + 20)}
              style={{
                padding: '8px 20px',
                background: 'var(--surface-card)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                font: '500 13px/18px var(--font-sans)',
                color: 'var(--brand-primary)',
              }}
            >
              + 20 daha göster
            </button>
            <button
              onClick={() => setGosterilenSayi(filtreliOlaylar.length)}
              style={{
                padding: '8px 20px',
                background: 'transparent',
                border: '1px dashed var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                font: '400 13px/18px var(--font-sans)',
                color: 'var(--text-tertiary)',
              }}
            >
              Tümünü göster ({filtreliOlaylar.length})
            </button>
          </div>
        )}
        {filtreliOlaylar.length > 0 && (
          <p style={{ textAlign: 'center', marginTop: 12, font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
            <span className="tabular-nums">{Math.min(gosterilenSayi, filtreliOlaylar.length)}</span> / <span className="tabular-nums">{filtreliOlaylar.length}</span> kayıt gösteriliyor
          </p>
        )}

        </div>

        {/* Sağ sticky panel */}
        <div style={{ position: 'sticky', top: 16 }}>
          <Card style={{ marginBottom: 12, padding: 14 }}>
            <p className="t-label" style={{ marginBottom: 10 }}>HIZLI AKSİYON</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onClick={() => navigate(`/gorusmeler?firma=${encodeURIComponent(firma)}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--brand-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', font: '500 12.5px/16px var(--font-sans)', cursor: 'pointer', textAlign: 'left' }}
              >
                <Plus size={14} strokeWidth={1.8} /> Yeni görüşme
              </button>
              <button
                onClick={() => navigate(`/gorevler?firma=${encodeURIComponent(firma)}${musteri?.id ? `&musteriId=${musteri.id}` : ''}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', font: '500 12.5px/16px var(--font-sans)', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left' }}
              >
                <CheckSquare size={14} strokeWidth={1.8} style={{ color: 'var(--warning)' }} /> Görev aç
              </button>
              <button
                onClick={() => navigate(`/servis-talepleri/yeni?firma=${encodeURIComponent(firma)}${musteri?.id ? `&musteriId=${musteri.id}` : ''}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', font: '500 12.5px/16px var(--font-sans)', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left' }}
              >
                <Wrench size={14} strokeWidth={1.8} style={{ color: '#993C1D' }} /> Servis talebi
              </button>
              <button
                onClick={() => navigate(`/teklifler/yeni?firma=${encodeURIComponent(firma)}${musteri?.id ? `&musteriId=${musteri.id}` : ''}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', font: '500 12.5px/16px var(--font-sans)', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left' }}
              >
                <ReceiptText size={14} strokeWidth={1.8} style={{ color: 'var(--brand-primary)' }} /> Teklif başlat
              </button>
            </div>
          </Card>

          {acikTalepler.length > 0 && (
            <Card style={{ marginBottom: 12, padding: 14, background: 'var(--danger-soft)', border: '1px solid var(--danger-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <AlertTriangle size={13} strokeWidth={1.8} style={{ color: 'var(--danger)' }} />
                <span style={{ font: '600 11px/14px var(--font-sans)', color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Aktif Talepler</span>
              </div>
              {acikTalepler.slice(0, 3).map(t => (
                <button
                  key={t.id}
                  onClick={() => navigate(`/servis-talepleri/${t.id}`)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', font: '400 12px/16px var(--font-sans)', color: 'var(--text-primary)', cursor: 'pointer', marginTop: 4 }}
                >
                  <div style={{ font: '500 12px/16px var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.konu}</div>
                  <div style={{ font: '400 10.5px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 1 }}>{t.talepNo} · {t.durum}</div>
                </button>
              ))}
              {acikTalepler.length > 3 && (
                <button
                  onClick={() => navigate('/servis-talepleri')}
                  style={{ marginTop: 6, padding: 4, background: 'transparent', border: 'none', font: '500 11px/14px var(--font-sans)', color: 'var(--danger)', cursor: 'pointer' }}
                >
                  +{acikTalepler.length - 3} tane daha
                </button>
              )}
            </Card>
          )}
        </div>

        </div>
      </div>

      <LisansModal lisans={secilenLisans} onKapat={() => setSecilenLisans(null)} />
    </>
  )
}

export default FirmaGecmisi
