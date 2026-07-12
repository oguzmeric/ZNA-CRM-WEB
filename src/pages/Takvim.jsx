import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DOMPurify from 'dompurify'
import {
  ChevronLeft, ChevronRight, Phone, CheckSquare, Wrench, Truck, X, Inbox, Loader2, Mail,
  MapPin, Users, Video, Clock, ExternalLink, Plus, Copy, Check, Trash2,
} from 'lucide-react'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { gorevleriGetir } from '../services/gorevService'
import { servisTalepleriniGetir } from '../services/servisService'
import { kargolariGetir } from '../services/kargoService'
import {
  hariciEtkinlikleriGetir, tazelikSyncTetikle,
  takvimBaglantilariniGetir, etkinlikOlustur, etkinlikSil,
} from '../services/takvimBaglantiService'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmContext'
import { Button, Card, Badge, EmptyState } from '../components/ui'

const TIP = {
  gorusme: { label: 'Görüşme', C: Phone,       softBg: 'var(--info-soft)',    fg: 'var(--info)',    dot: 'var(--info)' },
  gorev:   { label: 'Görev',   C: CheckSquare, softBg: 'var(--success-soft)', fg: 'var(--success)', dot: 'var(--success)' },
  servis:  { label: 'Servis',  C: Wrench,      softBg: 'var(--warning-soft)', fg: 'var(--warning)', dot: 'var(--warning)' },
  kargo:   { label: 'Kargo',   C: Truck,       softBg: 'var(--brand-primary-soft)', fg: 'var(--brand-primary)', dot: 'var(--brand-primary)' },
  harici:  { label: 'Gmail',   C: Mail,        softBg: 'rgba(168, 85, 247, 0.12)', fg: '#a855f7', dot: '#a855f7' },
}

const AYLAR  = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
const GUNLER = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz']

const dtStr = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

const haftaBasi = (d) => {
  const c = new Date(d)
  const day = c.getDay()
  c.setDate(c.getDate() + (day === 0 ? -6 : 1 - day))
  c.setHours(0, 0, 0, 0)
  return c
}

function etkinlikleriDonustur(gorusmeler, gorevler, servisTalepleri, kargolar, hariciEvs) {
  const evs = []
  ;(gorusmeler || []).forEach(g => {
    if (!g.tarih) return
    evs.push({ id: `g${g.id}`, tip: 'gorusme', baslik: g.konu || 'Görüşme', alt: g.firmaAd || g.muhatapAd || '', tarih: g.tarih.slice(0,10), link: `/gorusmeler/${g.id}` })
  })
  ;(gorevler || []).forEach(g => {
    if (!g.sonTarih) return
    evs.push({ id: `t${g.id}`, tip: 'gorev', baslik: g.baslik || 'Görev', alt: g.atanan || '', tarih: g.sonTarih.slice(0,10), link: `/gorevler/${g.id}` })
  })
  ;(servisTalepleri || []).forEach(s => {
    const t = (s.tarih || s.olusturmaTarihi || '').slice(0,10)
    if (!t) return
    evs.push({ id: `s${s.id}`, tip: 'servis', baslik: s.konu || 'Servis Talebi', alt: s.musteriAd || '', tarih: t, link: `/servis-talepleri/${s.id}` })
  })
  ;(kargolar || []).forEach(k => {
    if (!k.tahminiTeslim) return
    evs.push({ id: `k${k.id}`, tip: 'kargo', baslik: k.kargoNo || 'Kargo', alt: k.alici?.ad || '', tarih: k.tahminiTeslim.slice(0,10), link: `/kargolar/${k.id}` })
  })
  ;(hariciEvs || []).forEach(h => {
    if (!h.baslangic) return
    const tarihStr = h.baslangic.slice(0, 10)
    // Saat varsa baslık'a ekle ("14:30 Toplantı")
    let baslik = h.baslik || '(başlıksız)'
    if (!h.tum_gun && h.baslangic.includes('T')) {
      const saat = h.baslangic.slice(11, 16)
      baslik = `${saat} · ${baslik}`
    }
    evs.push({
      id: `h${h.id}`,
      tip: 'harici',
      baslik,
      alt: h.lokasyon || h.organizator_email || '',
      tarih: tarihStr,
      // Harici etkinliklere link yok — popup'ta detay göstereceğiz
      link: null,
      ham: h,  // popover için
    })
  })
  return evs
}

export default function Takvim() {
  const navigate = useNavigate()
  const { kullanici } = useAuth()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayStr = dtStr(today)

  const [mod,        setMod]        = useState('ay')
  const [yil,        setYil]        = useState(today.getFullYear())
  const [ay,         setAy]         = useState(today.getMonth())
  const [haftaIlk,   setHaftaIlk]   = useState(() => haftaBasi(today))
  const [secilenGun, setSecilenGun] = useState(null)
  // Filtre seçimini localStorage'a kaydet — sayfalar arası dönüşte korunsun
  const [filtreler,  setFiltreler]  = useState(() => {
    try {
      const kayitli = localStorage.getItem('takvim_filtreler')
      if (kayitli) {
        const p = JSON.parse(kayitli)
        if (Array.isArray(p)) return p
      }
    } catch {}
    return ['gorusme','gorev','servis','kargo','harici']
  })

  // Her değişiklikte localStorage'a yaz
  useEffect(() => {
    try { localStorage.setItem('takvim_filtreler', JSON.stringify(filtreler)) } catch {}
  }, [filtreler])
  const [evs,        setEvs]        = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hariciDetay, setHariciDetay] = useState(null)  // tıklanan Gmail etkinliği
  const [etkinlikModal, setEtkinlikModal] = useState(false)  // yeni etkinlik+Meet modal
  const [etkinlikModalTarihi, setEtkinlikModalTarihi] = useState(null)  // modal hangi tarihle açılacak (YYYY-MM-DD)
  const [baglantilar, setBaglantilar] = useState([])  // kullanıcının takvim bağlantıları

  // Etkinliğe tıklayınca: link varsa o sayfaya git, yoksa (harici) modal aç
  const etkinligeTikla = (ev) => {
    if (ev.link) {
      navigate(ev.link)
    } else if (ev.tip === 'harici' && ev.ham) {
      setHariciDetay(ev.ham)
    }
  }

  // Tüm etkinlikleri (CRM + harici) yükle
  const tumEtkinlikleriYukle = useCallback(async () => {
    setYukleniyor(true)
    try {
      const baslangic = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()
      const bitis = new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString()
      const [g, gr, s, k, h] = await Promise.all([
        gorusmeleriGetir(),
        gorevleriGetir(),
        servisTalepleriniGetir(),
        kargolariGetir(),
        kullanici?.id ? hariciEtkinlikleriGetir(kullanici.id, baslangic, bitis) : Promise.resolve([]),
      ])
      setEvs(etkinlikleriDonustur(g, gr, s, k, h))
    } catch (e) {
      console.warn('[Takvim yükle]', e?.message)
    } finally {
      setYukleniyor(false)
    }
  }, [kullanici?.id])

  // Takvim bağlantılarını yükle (etkinlik+Meet butonu için gerekli)
  useEffect(() => {
    if (!kullanici?.id) return
    takvimBaglantilariniGetir(kullanici.id)
      .then(setBaglantilar)
      .catch(e => console.warn('[takvim baglantilari]', e?.message))
  }, [kullanici?.id])

  // İlk yükleme + sync tetik
  useEffect(() => {
    tumEtkinlikleriYukle()

    // Arka planda otomatik sync — 5 dk'dan eski bağlantıları tazele
    // Sync bitince bir kez daha yükle (yeni etkinlikleri al)
    if (kullanici?.id) {
      tazelikSyncTetikle(kullanici.id).then((sonuc) => {
        if (sonuc?.tetiklenenSayisi > 0) {
          // Sync edge function'ı async — biraz bekle, sonra yeniden çek
          setTimeout(() => tumEtkinlikleriYukle(), 3000)
        }
      })
    }
  }, [kullanici?.id, tumEtkinlikleriYukle])

  // Tab geri gelince + window focus'ta tekrar sync
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && kullanici?.id) {
        tazelikSyncTetikle(kullanici.id).then((sonuc) => {
          if (sonuc?.tetiklenenSayisi > 0) {
            setTimeout(() => tumEtkinlikleriYukle(), 3000)
          }
        })
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [kullanici?.id, tumEtkinlikleriYukle])

  const filtreliEvs = useMemo(() => evs.filter(e => filtreler.includes(e.tip)), [evs, filtreler])

  const evsMap = useMemo(() => {
    const m = {}
    filtreliEvs.forEach(e => { if (!m[e.tarih]) m[e.tarih] = []; m[e.tarih].push(e) })
    return m
  }, [filtreliEvs])

  const ayGrid = useMemo(() => {
    let dow = new Date(yil, ay, 1).getDay()
    dow = dow === 0 ? 6 : dow - 1
    const dim  = new Date(yil, ay+1, 0).getDate()
    const pdim = new Date(yil, ay, 0).getDate()
    const cells = []
    for (let i = dow-1; i >= 0; i--) {
      const pm = ay === 0 ? 11 : ay-1
      const py = ay === 0 ? yil-1 : yil
      cells.push({ d: pdim-i, m: pm, y: py, out: true })
    }
    for (let d = 1; d <= dim; d++) cells.push({ d, m: ay, y: yil, out: false })
    const rem = (7 - (cells.length % 7)) % 7
    const nm = ay === 11 ? 0 : ay+1
    const ny = ay === 11 ? yil+1 : yil
    for (let d = 1; d <= rem; d++) cells.push({ d, m: nm, y: ny, out: true })
    return cells
  }, [yil, ay])

  const haftaGunler = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(haftaIlk); d.setDate(d.getDate() + i)
      return { d, str: dtStr(d) }
    }), [haftaIlk]
  )

  const prev = () => {
    if (mod === 'ay') { if (ay === 0) { setAy(11); setYil(y => y-1) } else setAy(a => a-1) }
    else setHaftaIlk(h => { const n = new Date(h); n.setDate(n.getDate()-7); return n })
  }
  const next = () => {
    if (mod === 'ay') { if (ay === 11) { setAy(0); setYil(y => y+1) } else setAy(a => a+1) }
    else setHaftaIlk(h => { const n = new Date(h); n.setDate(n.getDate()+7); return n })
  }
  const goToday = () => {
    setYil(today.getFullYear()); setAy(today.getMonth())
    setHaftaIlk(haftaBasi(today)); setSecilenGun(todayStr)
  }

  const navTitle = mod === 'ay'
    ? `${AYLAR[ay]} ${yil}`
    : `${haftaGunler[0].d.getDate()} ${AYLAR[haftaGunler[0].d.getMonth()]} — ${haftaGunler[6].d.getDate()} ${AYLAR[haftaGunler[6].d.getMonth()]} ${haftaGunler[6].d.getFullYear()}`

  const secilenEvs = secilenGun ? (evsMap[secilenGun] || []) : []
  const toggleFiltre = (tip) => setFiltreler(f => f.includes(tip) ? f.filter(t => t !== tip) : [...f, tip])

  const ayBaslangic = `${yil}-${String(ay+1).padStart(2,'0')}-01`
  const aySonu = `${yil}-${String(ay+1).padStart(2,'0')}-${String(new Date(yil, ay+1, 0).getDate()).padStart(2,'0')}`
  const buAyEvs = filtreliEvs.filter(e => e.tarih >= ayBaslangic && e.tarih <= aySonu)

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="t-h1">Takvim</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            <span className="tabular-nums">{filtreliEvs.length}</span> etkinlik · <span className="tabular-nums">{buAyEvs.length}</span> bu ay
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setEtkinlikModalTarihi(null)  // varsayılan: bugün + 15 dk
              setEtkinlikModal(true)
            }}
            disabled={baglantilar.length === 0}
            title={baglantilar.length === 0 ? 'Önce Google Calendar bağlantısı eklemelisin' : 'Yeni etkinlik + Google Meet linki oluştur'}
          >
            <Video size={14} style={{ marginRight: 6 }} /> Yeni Etkinlik + Meet
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate('/ayarlar/takvim-baglantilari')}>
            <Mail size={14} style={{ marginRight: 6 }} /> Takvim Bağlantıları
          </Button>
          <div style={{ display: 'inline-flex', padding: 2, background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)' }}>
            {[{ id: 'ay', l: 'Aylık' }, { id: 'hafta', l: 'Haftalık' }].map(m => (
              <button
                key={m.id}
                onClick={() => setMod(m.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'calc(var(--radius-sm) - 2px)',
                  background: mod === m.id ? 'var(--surface-card)' : 'transparent',
                  boxShadow: mod === m.id ? 'var(--shadow-sm)' : 'none',
                  color: mod === m.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  border: 'none', cursor: 'pointer',
                  font: '500 13px/18px var(--font-sans)',
                }}
              >
                {m.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filter chip'leri + navigasyon */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.entries(TIP).map(([tip, meta]) => {
            const on = filtreler.includes(tip)
            const sayi = evs.filter(e => e.tip === tip).length
            const IconC = meta.C
            return (
              <button
                key={tip}
                onClick={() => toggleFiltre(tip)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: on ? meta.softBg : 'var(--surface-card)',
                  color: on ? meta.fg : 'var(--text-tertiary)',
                  border: `1px solid ${on ? meta.dot : 'var(--border-default)'}`,
                  font: '500 12px/16px var(--font-sans)',
                  cursor: 'pointer',
                  transition: 'all 120ms',
                }}
              >
                <IconC size={12} strokeWidth={1.5} />
                {meta.label}
                <span style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>({sayi})</span>
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={prev}
            aria-label="Önceki"
            style={{
              width: 32, height: 32,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--surface-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-card)'}
          >
            <ChevronLeft size={16} strokeWidth={1.5} />
          </button>
          <span style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)', minWidth: 160, textAlign: 'center' }}>
            {navTitle}
          </span>
          <Button variant="secondary" size="sm" onClick={goToday}>Bugün</Button>
          <button
            onClick={next}
            aria-label="Sonraki"
            style={{
              width: 32, height: 32,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--surface-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-card)'}
          >
            <ChevronRight size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Ana içerik */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* Takvim kartı */}
        <Card padding={0} style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {yukleniyor && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80, gap: 8, color: 'var(--text-tertiary)' }}>
              <Loader2 size={20} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />
              <span className="t-body">Yükleniyor…</span>
            </div>
          )}

          {!yukleniyor && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-default)' }}>
                {GUNLER.map((g, i) => (
                  <div key={g} style={{
                    padding: '10px 8px', textAlign: 'center',
                    font: '600 11px/16px var(--font-sans)',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    color: i >= 5 ? 'var(--danger)' : 'var(--text-tertiary)',
                  }}>
                    {g}
                  </div>
                ))}
              </div>

              {/* AYLIK */}
              {mod === 'ay' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {ayGrid.map((cell, i) => {
                    const str = `${cell.y}-${String(cell.m+1).padStart(2,'0')}-${String(cell.d).padStart(2,'0')}`
                    const dayEvs  = evsMap[str] || []
                    const isToday = str === todayStr
                    const isSel   = str === secilenGun
                    const row     = Math.floor(i / 7)
                    const totalRows = Math.floor(ayGrid.length / 7)

                    return (
                      <div
                        key={i}
                        onClick={() => setSecilenGun(isSel ? null : str)}
                        style={{
                          minHeight: 88,
                          padding: '6px 6px 4px',
                          borderBottom: row < totalRows-1 ? '1px solid var(--border-default)' : 'none',
                          borderRight:  i % 7 < 6        ? '1px solid var(--border-default)' : 'none',
                          background: isSel ? 'var(--brand-primary-soft)'
                            : isToday ? 'var(--brand-primary-soft)'
                            : cell.out ? 'var(--surface-sunken)'
                            : 'var(--surface-card)',
                          cursor: 'pointer',
                          transition: 'background 120ms',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{
                            width: 22, height: 22,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: '50%',
                            font: '600 12px/1 var(--font-sans)',
                            fontVariantNumeric: 'tabular-nums',
                            background: isToday ? 'var(--brand-primary)' : 'transparent',
                            color: isToday ? '#fff' : cell.out ? 'var(--text-tertiary)' : 'var(--text-primary)',
                          }}>
                            {cell.d}
                          </span>
                          {dayEvs.length > 2 && (
                            <span style={{ font: '500 10px/1 var(--font-sans)', color: 'var(--text-tertiary)' }}>
                              +{dayEvs.length-2}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {dayEvs.slice(0, 2).map(ev => {
                            const t = TIP[ev.tip]
                            return (
                              <div
                                key={ev.id}
                                onClick={e => { e.stopPropagation(); etkinligeTikla(ev) }}
                                title={ev.baslik}
                                style={{
                                  font: '500 10px/16px var(--font-sans)',
                                  padding: '0 6px',
                                  borderRadius: 3,
                                  background: 'var(--surface-sunken)',
                                  borderLeft: `2px solid ${t.dot}`,
                                  color: 'var(--text-secondary)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  cursor: 'pointer',
                                }}
                              >
                                {ev.baslik}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* HAFTALIK */}
              {mod === 'hafta' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {haftaGunler.map(({ d, str }, i) => {
                    const dayEvs  = evsMap[str] || []
                    const isToday = str === todayStr
                    const isSel   = str === secilenGun
                    const dow     = d.getDay()
                    const isWknd  = dow === 0 || dow === 6
                    return (
                      <div
                        key={str}
                        onClick={() => setSecilenGun(isSel ? null : str)}
                        style={{
                          minHeight: 240,
                          background: isSel ? 'var(--brand-primary-soft)'
                            : isToday ? 'var(--brand-primary-soft)'
                            : 'var(--surface-card)',
                          borderRight: i < 6 ? '1px solid var(--border-default)' : 'none',
                          cursor: 'pointer',
                          transition: 'background 120ms',
                        }}
                      >
                        <div style={{
                          textAlign: 'center', padding: '8px 4px',
                          borderBottom: '1px solid var(--border-default)',
                          background: 'var(--surface-sunken)',
                        }}>
                          <div className="t-label" style={{ marginBottom: 4, color: isWknd ? 'var(--danger)' : 'var(--text-tertiary)' }}>
                            {GUNLER[dow === 0 ? 6 : dow-1]}
                          </div>
                          <span style={{
                            width: 28, height: 28,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: '50%',
                            font: '600 14px/1 var(--font-sans)',
                            fontVariantNumeric: 'tabular-nums',
                            background: isToday ? 'var(--brand-primary)' : 'transparent',
                            color: isToday ? '#fff' : isWknd ? 'var(--danger)' : 'var(--text-primary)',
                          }}>
                            {d.getDate()}
                          </span>
                          {dayEvs.length > 0 && (
                            <div style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--brand-primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                              {dayEvs.length} etkinlik
                            </div>
                          )}
                        </div>

                        <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {dayEvs.map(ev => {
                            const t = TIP[ev.tip]
                            return (
                              <div
                                key={ev.id}
                                onClick={e => { e.stopPropagation(); etkinligeTikla(ev) }}
                                style={{
                                  background: 'var(--surface-sunken)',
                                  borderLeft: `3px solid ${t.dot}`,
                                  padding: '4px 6px',
                                  borderRadius: 3,
                                  cursor: 'pointer',
                                }}
                              >
                                <div style={{ font: '500 11px/14px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {ev.baslik}
                                </div>
                                {ev.alt && (
                                  <div style={{ font: '400 10px/14px var(--font-sans)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {ev.alt}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                          {dayEvs.length === 0 && (
                            <p style={{ textAlign: 'center', padding: '12px 0', font: '400 11px/1 var(--font-sans)', color: 'var(--text-tertiary)' }}>—</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </Card>

        {/* Yan panel */}
        {secilenGun && (
          <Card padding={0} style={{ width: 260, flexShrink: 0, overflow: 'hidden', position: 'sticky', top: 16 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'var(--surface-sunken)',
              borderBottom: '1px solid var(--border-default)',
            }}>
              <div>
                <div style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {new Date(secilenGun + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
                </div>
                <div className="t-caption" style={{ textTransform: 'capitalize' }}>
                  {new Date(secilenGun + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'long' })}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {secilenGun === todayStr && <Badge tone="brand">Bugün</Badge>}
                {baglantilar.length > 0 && (
                  <button
                    title="Bu güne yeni etkinlik + Meet ekle"
                    onClick={() => {
                      setEtkinlikModalTarihi(secilenGun)
                      setEtkinlikModal(true)
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '4px 10px',
                      background: '#1a73e8',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      font: '600 11px/14px var(--font-sans)',
                    }}
                  >
                    <Video size={11} /> + Etkinlik
                  </button>
                )}
                <button
                  aria-label="Kapat"
                  onClick={() => setSecilenGun(null)}
                  style={{
                    width: 24, height: 24,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--text-tertiary)', borderRadius: 'var(--radius-sm)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-card)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)' }}
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            <div style={{ padding: 12 }}>
              {secilenEvs.length === 0 ? (
                <EmptyState icon={<Inbox size={24} strokeWidth={1.5} />} title="Bu gün için etkinlik yok" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {secilenEvs.map(ev => {
                    const t = TIP[ev.tip]
                    const IconC = t.C
                    return (
                      <button
                        key={ev.id}
                        onClick={() => etkinligeTikla(ev)}
                        style={{
                          textAlign: 'left',
                          background: 'var(--surface-sunken)',
                          border: 'none',
                          borderLeft: `3px solid ${t.dot}`,
                          padding: '8px 10px',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'flex-start', gap: 6,
                        }}
                      >
                        <IconC size={13} strokeWidth={1.5} style={{ color: t.fg, flexShrink: 0, marginTop: 1 }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ev.baslik}
                          </div>
                          {ev.alt && (
                            <div style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {ev.alt}
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {secilenEvs.length > 0 && (
              <div style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--border-default)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {Object.entries(TIP).map(([tip, meta]) => {
                    const sayi = secilenEvs.filter(e => e.tip === tip).length
                    if (!sayi) return null
                    return (
                      <div key={tip} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '400 11px/16px var(--font-sans)' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.dot }} />
                        <span style={{ color: 'var(--text-tertiary)' }}>{meta.label}</span>
                        <span style={{ marginLeft: 'auto', color: meta.fg, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{sayi}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Açıklama */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, padding: '0 4px' }}>
        {Object.entries(TIP).map(([tip, meta]) => (
          <div key={tip} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: meta.dot }} />
            {meta.label}
          </div>
        ))}
      </div>

      {/* Harici etkinlik detay modal */}
      {hariciDetay && (
        <HariciEtkinlikDetay
          etkinlik={hariciDetay}
          onKapat={() => setHariciDetay(null)}
          onSilindi={() => {
            setHariciDetay(null)
            // 500 ms bekle (DB güncellensin), sonra listeyi yenile
            setTimeout(() => tumEtkinlikleriYukle(), 500)
          }}
        />
      )}

      {/* Yeni Etkinlik + Meet modal */}
      {etkinlikModal && (
        <YeniEtkinlikModal
          baglantilar={baglantilar}
          varsayilanTarih={etkinlikModalTarihi}
          onKapat={() => setEtkinlikModal(false)}
          onBasarili={() => {
            setEtkinlikModal(false)
            // 1 sn bekle (Google'a yazılma + DB sync), sonra etkinlikleri yeniden çek
            setTimeout(() => tumEtkinlikleriYukle(), 1000)
          }}
        />
      )}
    </div>
  )
}

function HariciEtkinlikDetay({ etkinlik, onKapat, onSilindi }) {
  const h = etkinlik
  const baslangicDate = h.baslangic ? new Date(h.baslangic) : null
  const bitisDate = h.bitis ? new Date(h.bitis) : null
  const [siliniyor, setSiliniyor] = useState(false)
  const { confirm } = useConfirm()

  const silTikla = async () => {
    const onay = await confirm({
      baslik: 'Etkinliği Sil',
      mesaj: `"${h.baslik || '(başlıksız)'}" etkinliği silinecek.\n\nBu işlem Google Calendar'dan da kaldıracak ve davetlilere iptal bildirimi gönderecek. Geri alınamaz.`,
      onayMetin: 'Evet, sil',
      iptalMetin: 'Vazgeç',
      tip: 'tehlikeli',
    })
    if (!onay) return
    setSiliniyor(true)
    try {
      await etkinlikSil(h.id)
      onSilindi?.()
    } catch (e) {
      alert('Silinemedi: ' + (e?.message ?? 'bilinmeyen hata'))
      setSiliniyor(false)
    }
  }

  const tarihStr = baslangicDate?.toLocaleString('tr-TR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })
  const saatStr = h.tum_gun
    ? 'Tüm gün'
    : `${baslangicDate?.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}${bitisDate ? ` — ${bitisDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : ''}`

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 520, width: '100%',
          maxHeight: '80vh', overflowY: 'auto',
          background: 'var(--surface-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-default)',
          padding: 24,
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(168, 85, 247, 0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Mail size={16} color="#a855f7" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ font: '700 16px/22px var(--font-sans)', color: 'var(--text-primary)', margin: 0, marginBottom: 2 }}>
              {h.baslik || '(başlıksız)'}
            </h3>
            <span style={{ font: '500 11px/14px var(--font-sans)', color: '#a855f7' }}>
              Gmail Takvim
            </span>
          </div>
          <button
            onClick={onKapat}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-tertiary)', padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tarih + saat */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <Clock size={16} color="var(--text-tertiary)" style={{ marginTop: 2 }} />
          <div>
            <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
              {tarihStr}
            </div>
            <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>
              {saatStr}
            </div>
          </div>
        </div>

        {/* Toplantı linki — varsa öne çıkar (Google Meet, vs.) */}
        {h.toplanti_linki && (
          <div style={{ marginBottom: 12 }}>
            <a
              href={h.toplanti_linki}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 14px',
                background: '#1a73e8',
                color: '#fff',
                borderRadius: 'var(--radius-sm)',
                textDecoration: 'none',
                font: '600 13px/18px var(--font-sans)',
              }}
            >
              <Video size={16} /> Toplantıya Katıl
              <ExternalLink size={12} />
            </a>
          </div>
        )}

        {/* Lokasyon */}
        {h.lokasyon && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
            <MapPin size={16} color="var(--text-tertiary)" style={{ marginTop: 2 }} />
            <div style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
              {/* Lokasyon URL ise tıklanabilir yap */}
              {/^https?:\/\//i.test(h.lokasyon) ? (
                <a href={h.lokasyon} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-primary)' }}>
                  {h.lokasyon}
                </a>
              ) : h.lokasyon}
            </div>
          </div>
        )}

        {/* Organizatör */}
        {h.organizator_email && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Mail size={16} color="var(--text-tertiary)" />
            <div style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
              <span style={{ color: 'var(--text-tertiary)' }}>Organizatör: </span>
              {h.organizator_email}
            </div>
          </div>
        )}

        {/* Davetliler */}
        {Array.isArray(h.davetliler) && h.davetliler.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
            <Users size={16} color="var(--text-tertiary)" style={{ marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                {h.davetliler.length} Davetli
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {h.davetliler.slice(0, 6).map((d, i) => (
                  <div key={i} style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-primary)' }}>
                    {d.isim || d.email}
                    {d.durum && <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>· {d.durum}</span>}
                  </div>
                ))}
                {h.davetliler.length > 6 && (
                  <div style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                    +{h.davetliler.length - 6} kişi daha
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Açıklama */}
        {h.aciklama && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
            <div style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginBottom: 6 }}>
              Açıklama
            </div>
            <div
              style={{
                font: '400 13px/20px var(--font-sans)',
                color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(h.aciklama || '', {
                ALLOWED_TAGS: ['br', 'p', 'b', 'strong', 'i', 'em', 'u', 'a', 'ul', 'ol', 'li', 'span'],
                ALLOWED_ATTR: ['href', 'target', 'rel'],
                ALLOW_DATA_ATTR: false,
              }) }}
            />
          </div>
        )}

        {/* Footer: Sil + Google Calendar'da aç */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <button
            onClick={silTikla}
            disabled={siliniyor}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px',
              background: siliniyor ? 'transparent' : 'var(--danger-soft)',
              color: 'var(--danger)',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--radius-sm)',
              cursor: siliniyor ? 'wait' : 'pointer',
              font: '600 12px/16px var(--font-sans)',
              opacity: siliniyor ? 0.6 : 1,
            }}
          >
            <Trash2 size={14} />
            {siliniyor ? 'Siliniyor…' : 'Etkinliği Sil'}
          </button>
          <a
            href="https://calendar.google.com/calendar/u/0/r"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              font: '500 12px/16px var(--font-sans)',
              color: 'var(--text-tertiary)',
              textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            Google Calendar'da aç <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </div>
  )
}

// ---- Yeni Etkinlik + Meet modal ----
// CRM içinden Google Calendar'a etkinlik gönder, otomatik Meet linki üret, davetlilere mail at.

function YeniEtkinlikModal({ baglantilar, varsayilanTarih, onKapat, onBasarili }) {
  const navigate = useNavigate()
  // Varsayılan başlangıç/bitiş hesapla:
  // - varsayilanTarih (YYYY-MM-DD) verilmişse o günü 09:00 - 10:00 olarak doldur
  // - Yoksa şimdiden 15 dk sonra başlat, 30 dk sürsün
  const yuvarla = (d) => {
    const r = new Date(d)
    r.setSeconds(0, 0)
    r.setMinutes(Math.ceil(r.getMinutes() / 15) * 15)
    return r
  }
  let baslangicVar, bitisVar
  if (varsayilanTarih && /^\d{4}-\d{2}-\d{2}$/.test(varsayilanTarih)) {
    const [y, m, d] = varsayilanTarih.split('-').map(Number)
    baslangicVar = new Date(y, m - 1, d, 9, 0, 0, 0)
    bitisVar = new Date(y, m - 1, d, 10, 0, 0, 0)
  } else {
    const simdi = new Date()
    baslangicVar = yuvarla(new Date(simdi.getTime() + 15 * 60 * 1000))
    bitisVar = new Date(baslangicVar.getTime() + 30 * 60 * 1000)
  }

  const toLocalDateTime = (d) => {
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const aktifBaglantilar = baglantilar.filter((b) => b.aktif && b.saglayici === 'google')

  const [baglantiId, setBaglantiId] = useState(aktifBaglantilar[0]?.id ?? null)
  const [baslik, setBaslik] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [lokasyon, setLokasyon] = useState('')
  const [baslangic, setBaslangic] = useState(toLocalDateTime(baslangicVar))
  const [bitis, setBitis] = useState(toLocalDateTime(bitisVar))
  const [davetlilerStr, setDavetlilerStr] = useState('')  // virgül/satır ayrılmış mailler
  const [meetOlustur, setMeetOlustur] = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState(null)
  const [sonuc, setSonuc] = useState(null)
  const [kopyalandi, setKopyalandi] = useState(false)

  const kaydet = async () => {
    setHata(null)
    if (!baglantiId) { setHata({ mesaj: 'Bağlantı seç' }); return }
    if (!baslik.trim()) { setHata({ mesaj: 'Başlık zorunlu' }); return }
    if (!baslangic || !bitis) { setHata({ mesaj: 'Başlangıç ve bitiş zamanı zorunlu' }); return }
    if (new Date(bitis) <= new Date(baslangic)) { setHata({ mesaj: 'Bitiş, başlangıçtan sonra olmalı' }); return }

    // Davetli mail listesi: virgül veya satır ile ayrılmış, geçerli mailler
    const davetliler = davetlilerStr
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes('@'))

    setKaydediliyor(true)
    try {
      // datetime-local → ISO (yerel saatle, TZ Europe/Istanbul varsayılıyor)
      const baslangicISO = new Date(baslangic).toISOString()
      const bitisISO = new Date(bitis).toISOString()

      const res = await etkinlikOlustur(baglantiId, {
        baslik: baslik.trim(),
        aciklama: aciklama.trim() || null,
        lokasyon: lokasyon.trim() || null,
        baslangic: baslangicISO,
        bitis: bitisISO,
        davetliler,
        meetOlustur,
        zamanDilimi: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul',
      })

      setSonuc(res)  // başarılı — Meet linki + HTML linki göster
    } catch (e) {
      setHata({ mesaj: e?.message ?? 'Etkinlik oluşturulamadı', scopeYok: !!e?.scopeYok })
    } finally {
      setKaydediliyor(false)
    }
  }

  const linkKopyala = async (link) => {
    try {
      await navigator.clipboard.writeText(link)
      setKopyalandi(true)
      setTimeout(() => setKopyalandi(false), 2000)
    } catch {
      setHata({ mesaj: 'Kopyalama başarısız' })
    }
  }

  // Başarılıysa: linkleri göster
  if (sonuc) {
    return (
      <div
        onClick={onBasarili}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            maxWidth: 520, width: '100%',
            background: 'var(--surface-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-default)',
            padding: 24,
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(34, 197, 94, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Check size={18} color="var(--success)" />
            </div>
            <h3 style={{ font: '700 16px/22px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>
              Etkinlik oluşturuldu
            </h3>
          </div>
          <p style={{ font: '400 13px/20px var(--font-sans)', color: 'var(--text-tertiary)', marginBottom: 16 }}>
            Google Calendar'a yazıldı. Davetlilere e-posta gönderildi.
          </p>

          {sonuc.meetLinki && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                Google Meet linki
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: 10,
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
              }}>
                <Video size={16} color="#1a73e8" />
                <a
                  href={sonuc.meetLinki}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ flex: 1, font: '500 13px/18px var(--font-mono, monospace)', color: 'var(--brand-primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {sonuc.meetLinki}
                </a>
                <button
                  onClick={() => linkKopyala(sonuc.meetLinki)}
                  style={{
                    padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-default)',
                    background: kopyalandi ? 'var(--success-soft)' : 'var(--surface-card)',
                    color: kopyalandi ? 'var(--success)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    font: '500 12px/16px var(--font-sans)',
                  }}
                >
                  {kopyalandi ? <Check size={12} /> : <Copy size={12} />}
                  {kopyalandi ? 'Kopyalandı' : 'Kopyala'}
                </button>
              </div>
            </div>
          )}

          {sonuc.htmlLinki && (
            <a
              href={sonuc.htmlLinki}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                font: '500 12px/16px var(--font-sans)',
                color: 'var(--text-tertiary)',
                textDecoration: 'none',
                marginTop: 4,
              }}
            >
              Google Calendar'da aç <ExternalLink size={11} />
            </a>
          )}

          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" size="sm" onClick={onBasarili}>Tamam</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 560, width: '100%',
          maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--surface-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-default)',
          padding: 24,
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(26, 115, 232, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Video size={16} color="#1a73e8" />
            </div>
            <h3 style={{ font: '700 16px/22px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>
              Yeni Etkinlik + Google Meet
            </h3>
          </div>
          <button
            onClick={onKapat}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Bağlantı (birden fazla varsa) */}
        {aktifBaglantilar.length > 1 && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', display: 'block', marginBottom: 6 }}>
              GOOGLE HESABI
            </label>
            <select
              value={baglantiId ?? ''}
              onChange={(e) => setBaglantiId(Number(e.target.value))}
              style={{
                width: '100%', padding: 10,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                background: 'var(--surface-card)',
                color: 'var(--text-primary)',
                font: '400 13px/18px var(--font-sans)',
              }}
            >
              {aktifBaglantilar.map((b) => (
                <option key={b.id} value={b.id}>{b.hesap_email}</option>
              ))}
            </select>
          </div>
        )}

        {/* Başlık */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', display: 'block', marginBottom: 6 }}>
            BAŞLIK *
          </label>
          <input
            type="text"
            value={baslik}
            onChange={(e) => setBaslik(e.target.value)}
            placeholder="Toplantı başlığı"
            style={{
              width: '100%', padding: 10,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              background: 'var(--surface-card)',
              color: 'var(--text-primary)',
              font: '400 13px/18px var(--font-sans)',
            }}
          />
        </div>

        {/* Tarih/saat */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', display: 'block', marginBottom: 6 }}>
              BAŞLANGIÇ *
            </label>
            <input
              type="datetime-local"
              value={baslangic}
              onChange={(e) => setBaslangic(e.target.value)}
              style={{
                width: '100%', padding: 10,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                background: 'var(--surface-card)',
                color: 'var(--text-primary)',
                font: '400 13px/18px var(--font-sans)',
              }}
            />
          </div>
          <div>
            <label style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', display: 'block', marginBottom: 6 }}>
              BİTİŞ *
            </label>
            <input
              type="datetime-local"
              value={bitis}
              onChange={(e) => setBitis(e.target.value)}
              style={{
                width: '100%', padding: 10,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                background: 'var(--surface-card)',
                color: 'var(--text-primary)',
                font: '400 13px/18px var(--font-sans)',
              }}
            />
          </div>
        </div>

        {/* Davetliler */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', display: 'block', marginBottom: 6 }}>
            DAVETLİLER (virgül veya satır ile ayır)
          </label>
          <textarea
            value={davetlilerStr}
            onChange={(e) => setDavetlilerStr(e.target.value)}
            placeholder="ornek@firma.com, ikinci@firma.com"
            rows={2}
            style={{
              width: '100%', padding: 10,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              background: 'var(--surface-card)',
              color: 'var(--text-primary)',
              font: '400 13px/18px var(--font-sans)',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Lokasyon */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', display: 'block', marginBottom: 6 }}>
            LOKASYON (opsiyonel)
          </label>
          <input
            type="text"
            value={lokasyon}
            onChange={(e) => setLokasyon(e.target.value)}
            placeholder="Adres veya boş bırak"
            style={{
              width: '100%', padding: 10,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              background: 'var(--surface-card)',
              color: 'var(--text-primary)',
              font: '400 13px/18px var(--font-sans)',
            }}
          />
        </div>

        {/* Açıklama */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', display: 'block', marginBottom: 6 }}>
            AÇIKLAMA (opsiyonel)
          </label>
          <textarea
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            placeholder="Toplantı gündemi, notlar..."
            rows={3}
            style={{
              width: '100%', padding: 10,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              background: 'var(--surface-card)',
              color: 'var(--text-primary)',
              font: '400 13px/18px var(--font-sans)',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Meet checkbox */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: 12, marginBottom: 12,
          background: meetOlustur ? 'rgba(26, 115, 232, 0.08)' : 'var(--surface-sunken)',
          border: `1px solid ${meetOlustur ? '#1a73e8' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={meetOlustur}
            onChange={(e) => setMeetOlustur(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <Video size={16} color={meetOlustur ? '#1a73e8' : 'var(--text-tertiary)'} />
          <span style={{ font: '500 13px/18px var(--font-sans)', color: meetOlustur ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
            Google Meet linki otomatik oluştur
          </span>
        </label>

        {/* Hata */}
        {hata && (
          <div style={{
            padding: 10, marginBottom: 12,
            background: 'var(--danger-soft)',
            color: 'var(--danger)',
            borderRadius: 'var(--radius-sm)',
            font: '500 12px/16px var(--font-sans)',
          }}>
            <div>{typeof hata === 'string' ? hata : hata.mesaj}</div>
            {typeof hata === 'object' && hata.scopeYok && (
              <button
                type="button"
                onClick={() => { onKapat(); navigate('/ayarlar/takvim-baglantilari') }}
                style={{
                  marginTop: 8,
                  padding: '6px 12px',
                  background: 'var(--danger)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  font: '600 12px/16px var(--font-sans)',
                  cursor: 'pointer',
                }}
              >
                → Takvim Bağlantıları'na Git
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button variant="secondary" size="sm" onClick={onKapat} disabled={kaydediliyor}>
            İptal
          </Button>
          <Button variant="primary" size="sm" onClick={kaydet} disabled={kaydediliyor}>
            {kaydediliyor ? <><Loader2 size={14} style={{ marginRight: 6, animation: 'spin 1s linear infinite' }} /> Oluşturuluyor…</> : <>Oluştur</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
