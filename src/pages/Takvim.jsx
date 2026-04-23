import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Phone, CheckSquare, Wrench, Truck, X, Inbox, Loader2,
} from 'lucide-react'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { gorevleriGetir } from '../services/gorevService'
import { servisTalepleriniGetir } from '../services/servisService'
import { kargolariGetir } from '../services/kargoService'
import { Button, Card, Badge, EmptyState } from '../components/ui'

const TIP = {
  gorusme: { label: 'Görüşme', C: Phone,       softBg: 'var(--info-soft)',    fg: 'var(--info)',    dot: 'var(--info)' },
  gorev:   { label: 'Görev',   C: CheckSquare, softBg: 'var(--success-soft)', fg: 'var(--success)', dot: 'var(--success)' },
  servis:  { label: 'Servis',  C: Wrench,      softBg: 'var(--warning-soft)', fg: 'var(--warning)', dot: 'var(--warning)' },
  kargo:   { label: 'Kargo',   C: Truck,       softBg: 'var(--brand-primary-soft)', fg: 'var(--brand-primary)', dot: 'var(--brand-primary)' },
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

function etkinlikleriDonustur(gorusmeler, gorevler, servisTalepleri, kargolar) {
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
  return evs
}

export default function Takvim() {
  const navigate = useNavigate()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayStr = dtStr(today)

  const [mod,        setMod]        = useState('ay')
  const [yil,        setYil]        = useState(today.getFullYear())
  const [ay,         setAy]         = useState(today.getMonth())
  const [haftaIlk,   setHaftaIlk]   = useState(() => haftaBasi(today))
  const [secilenGun, setSecilenGun] = useState(null)
  const [filtreler,  setFiltreler]  = useState(['gorusme','gorev','servis','kargo'])
  const [evs,        setEvs]        = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)

  useEffect(() => {
    setYukleniyor(true)
    Promise.all([gorusmeleriGetir(), gorevleriGetir(), servisTalepleriniGetir(), kargolariGetir()])
      .then(([g, gr, s, k]) => setEvs(etkinlikleriDonustur(g, gr, s, k)))
      .catch(() => {})
      .finally(() => setYukleniyor(false))
  }, [])

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
                                onClick={e => { e.stopPropagation(); navigate(ev.link) }}
                                title={ev.baslik}
                                style={{
                                  font: '500 10px/16px var(--font-sans)',
                                  padding: '0 6px',
                                  borderRadius: 2,
                                  background: t.softBg,
                                  color: t.fg,
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
                                onClick={e => { e.stopPropagation(); navigate(ev.link) }}
                                style={{
                                  background: t.softBg,
                                  borderLeft: `3px solid ${t.dot}`,
                                  padding: '4px 6px',
                                  borderRadius: 2,
                                  cursor: 'pointer',
                                }}
                              >
                                <div style={{ font: '500 11px/14px var(--font-sans)', color: t.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                        onClick={() => navigate(ev.link)}
                        style={{
                          textAlign: 'left',
                          background: t.softBg,
                          borderLeft: `3px solid ${t.dot}`,
                          border: 'none',
                          padding: '8px 10px',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'flex-start', gap: 6,
                        }}
                      >
                        <IconC size={13} strokeWidth={1.5} style={{ color: t.fg, flexShrink: 0, marginTop: 1 }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ font: '500 12px/16px var(--font-sans)', color: t.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
    </div>
  )
}
