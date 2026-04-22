import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { gorevleriGetir } from '../services/gorevService'
import { servisTalepleriniGetir } from '../services/servisService'
import { kargolariGetir } from '../services/kargoService'

// ─── Sabitler ────────────────────────────────────────────────────────────────
const TIP = {
  gorusme: { label: 'Görüşme', ikon: '📞', bg: '#e8f4fd', text: '#0176D3', dot: '#0176D3' },
  gorev:   { label: 'Görev',   ikon: '✅', bg: '#ecfdf5', text: '#047857', dot: '#10b981' },
  servis:  { label: 'Servis',  ikon: '🛎️', bg: '#fffbeb', text: '#b45309', dot: '#f59e0b' },
  kargo:   { label: 'Kargo',   ikon: '📦', bg: '#f0f4ff', text: '#3730a3', dot: '#6366f1' },
}

const AYLAR  = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
const GUNLER = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz']

function dtStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function haftaBasi(d) {
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

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────
export default function Takvim() {
  const navigate = useNavigate()
  const today = new Date(); today.setHours(0,0,0,0)
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
    Promise.all([
      gorusmeleriGetir(),
      gorevleriGetir(),
      servisTalepleriniGetir(),
      kargolariGetir(),
    ])
      .then(([gorusmeler, gorevler, servisTalepleri, kargolar]) => {
        setEvs(etkinlikleriDonustur(gorusmeler, gorevler, servisTalepleri, kargolar))
      })
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
  const goToday = () => { setYil(today.getFullYear()); setAy(today.getMonth()); setHaftaIlk(haftaBasi(today)); setSecilenGun(todayStr) }

  const navTitle = mod === 'ay'
    ? `${AYLAR[ay]} ${yil}`
    : `${haftaGunler[0].d.getDate()} ${AYLAR[haftaGunler[0].d.getMonth()]} — ${haftaGunler[6].d.getDate()} ${AYLAR[haftaGunler[6].d.getMonth()]} ${haftaGunler[6].d.getFullYear()}`

  const secilenEvs = secilenGun ? (evsMap[secilenGun] || []) : []
  const toggleFiltre = (tip) => setFiltreler(f => f.includes(tip) ? f.filter(t => t !== tip) : [...f, tip])

  const ayBaslangic = `${yil}-${String(ay+1).padStart(2,'0')}-01`
  const aySonu = `${yil}-${String(ay+1).padStart(2,'0')}-${String(new Date(yil, ay+1, 0).getDate()).padStart(2,'0')}`
  const buAyEvs = filtreliEvs.filter(e => e.tarih >= ayBaslangic && e.tarih <= aySonu)

  return (
    <div className="p-6">

      {/* ── Başlık ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Takvim</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {filtreliEvs.length} etkinlik · {buAyEvs.length} bu ay
          </p>
        </div>

        {/* Mod seçici */}
        <div className="flex rounded overflow-hidden border border-gray-200">
          {[{ id: 'ay', l: 'Aylık' }, { id: 'hafta', l: 'Haftalık' }].map(m => (
            <button key={m.id} onClick={() => setMod(m.id)}
              className="px-4 py-1.5 text-xs font-medium transition-all"
              style={{
                background: mod === m.id ? 'var(--primary)' : 'var(--bg-card)',
                color: mod === m.id ? 'white' : '#706e6b',
              }}>
              {m.l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Filtreler + Navigasyon (tek satır) ── */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">

        {/* Filtre chip'leri */}
        <div className="flex gap-1.5 flex-wrap">
          {Object.entries(TIP).map(([tip, meta]) => {
            const on = filtreler.includes(tip)
            const sayi = evs.filter(e => e.tip === tip).length
            return (
              <button key={tip} onClick={() => toggleFiltre(tip)}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all border"
                style={{
                  background: on ? meta.bg : 'var(--bg-card)',
                  color: on ? meta.text : 'var(--text-muted)',
                  borderColor: on ? meta.dot + '60' : '#e5e7eb',
                }}>
                <span style={{ fontSize: '11px' }}>{meta.ikon}</span>
                {meta.label}
                <span className="ml-0.5 opacity-50">({sayi})</span>
              </button>
            )
          })}
        </div>

        {/* Navigasyon */}
        <div className="flex items-center gap-2">
          <button onClick={prev}
            className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition text-base"
            style={{ lineHeight: 1 }}>
            ‹
          </button>
          <span className="text-sm font-semibold text-gray-700 min-w-36 text-center">{navTitle}</span>
          <button onClick={goToday}
            className="text-xs px-2.5 py-1 rounded border font-medium transition-all hover:bg-blue-50"
            style={{ borderColor: 'var(--primary)', color: 'var(--primary)', background: 'var(--bg-card)' }}>
            Bugün
          </button>
          <button onClick={next}
            className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition text-base"
            style={{ lineHeight: 1 }}>
            ›
          </button>
        </div>
      </div>

      {/* ── Ana İçerik ── */}
      <div className="flex gap-4 items-start">

        {/* Takvim kartı */}
        <div className="flex-1 min-w-0 bg-white rounded border border-gray-200 overflow-hidden">

          {/* Yükleniyor */}
          {yukleniyor && (
            <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
              <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span className="text-sm">Yükleniyor…</span>
            </div>
          )}

          {/* Gün başlıkları + Takvim içeriği */}
          {!yukleniyor && <>
          <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
            {GUNLER.map((g, i) => (
              <div key={g} className="py-2 text-center text-xs font-semibold uppercase tracking-wider"
                style={{ color: i >= 5 ? '#f43f5e' : '#9ca3af' }}>
                {g}
              </div>
            ))}
          </div>

          {/* ── AYLIK GÖRÜNÜM ── */}
          {mod === 'ay' && (
            <div className="grid grid-cols-7">
              {ayGrid.map((cell, i) => {
                const str = `${cell.y}-${String(cell.m+1).padStart(2,'0')}-${String(cell.d).padStart(2,'0')}`
                const dayEvs  = evsMap[str] || []
                const isToday = str === todayStr
                const isSel   = str === secilenGun
                const isWknd  = (i % 7) >= 5
                const row     = Math.floor(i / 7)
                const totalRows = Math.floor(ayGrid.length / 7)

                return (
                  <div key={i}
                    onClick={() => setSecilenGun(isSel ? null : str)}
                    className="cursor-pointer transition-colors"
                    style={{
                      minHeight: '80px',
                      padding: '6px 6px 4px',
                      borderBottom: row < totalRows-1 ? '1px solid #f3f4f6' : 'none',
                      borderRight:  i % 7 < 6        ? '1px solid #f3f4f6' : 'none',
                      background: isSel
                        ? '#e8f4fd'
                        : isToday
                        ? '#f0f8ff'
                        : cell.out
                        ? '#fafafa'
                        : isWknd
                        ? '#fdfcfc'
                        : 'var(--bg-card)',
                    }}
                  >
                    {/* Gün numarası */}
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full"
                        style={
                          isToday
                            ? { background: 'var(--primary)', color: 'white' }
                            : { color: cell.out ? '#d1d5db' : isWknd ? '#f43f5e' : '#374151' }
                        }>
                        {cell.d}
                      </span>
                      {dayEvs.length > 2 && (
                        <span className="text-xs text-gray-400" style={{ fontSize: '10px' }}>+{dayEvs.length-2}</span>
                      )}
                    </div>

                    {/* Etkinlik chip'leri */}
                    <div className="space-y-0.5">
                      {dayEvs.slice(0, 2).map(ev => {
                        const t = TIP[ev.tip]
                        return (
                          <div key={ev.id}
                            onClick={e => { e.stopPropagation(); navigate(ev.link) }}
                            className="truncate font-medium hover:opacity-75 transition-opacity cursor-pointer"
                            style={{
                              fontSize: '10px',
                              lineHeight: '16px',
                              padding: '0 4px',
                              borderRadius: '3px',
                              background: t.bg,
                              color: t.text,
                            }}
                            title={ev.baslik}>
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

          {/* ── HAFTALIK GÖRÜNÜM ── */}
          {mod === 'hafta' && (
            <div className="grid grid-cols-7 divide-x divide-gray-100">
              {haftaGunler.map(({ d, str }) => {
                const dayEvs  = evsMap[str] || []
                const isToday = str === todayStr
                const isSel   = str === secilenGun
                const dow     = d.getDay()
                const isWknd  = dow === 0 || dow === 6

                return (
                  <div key={str}
                    onClick={() => setSecilenGun(isSel ? null : str)}
                    className="cursor-pointer transition-colors"
                    style={{
                      minHeight: '220px',
                      background: isSel ? '#e8f4fd' : isToday ? '#f0f8ff' : isWknd ? '#fdfcfc' : 'var(--bg-card)',
                    }}
                  >
                    {/* Gün başlığı */}
                    <div className="text-center py-2 px-1 border-b border-gray-100"
                      style={{ background: isSel ? 'rgba(1,118,211,0.1)' : isToday ? 'rgba(1,118,211,0.06)' : '#fafafa' }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-1"
                        style={{ color: isWknd ? '#f43f5e' : '#9ca3af' }}>
                        {GUNLER[dow === 0 ? 6 : dow-1]}
                      </p>
                      <span
                        className="text-base font-bold w-8 h-8 flex items-center justify-center rounded-full mx-auto"
                        style={
                          isToday
                            ? { background: 'var(--primary)', color: 'white' }
                            : { color: isWknd ? '#f43f5e' : '#374151' }
                        }>
                        {d.getDate()}
                      </span>
                      {dayEvs.length > 0 && (
                        <span className="mt-0.5 text-xs block" style={{ color: 'var(--primary)', fontSize: '10px' }}>
                          {dayEvs.length} etkinlik
                        </span>
                      )}
                    </div>

                    {/* Etkinlikler */}
                    <div className="p-1.5 space-y-1">
                      {dayEvs.map(ev => {
                        const t = TIP[ev.tip]
                        return (
                          <div key={ev.id}
                            onClick={e => { e.stopPropagation(); navigate(ev.link) }}
                            className="cursor-pointer hover:opacity-80 transition-opacity rounded"
                            style={{ background: t.bg, borderLeft: `3px solid ${t.dot}`, padding: '4px 6px' }}>
                            <p className="font-semibold truncate" style={{ fontSize: '11px', color: t.text }}>
                              {ev.baslik}
                            </p>
                            {ev.alt && (
                              <p className="truncate" style={{ fontSize: '10px', color: '#9ca3af' }}>{ev.alt}</p>
                            )}
                          </div>
                        )
                      })}
                      {dayEvs.length === 0 && (
                        <p className="text-center pt-4 text-gray-300" style={{ fontSize: '11px' }}>—</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          </>}
        </div>

        {/* ── YAN PANEL ── */}
        <AnimatePresence>
          {secilenGun && (
            <motion.div
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.15 }}
              className="flex-shrink-0"
              style={{ width: 240 }}
            >
              <div className="bg-white rounded border border-gray-200 overflow-hidden sticky top-4">

                {/* Panel başlığı */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {new Date(secilenGun+'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
                    </p>
                    <p className="text-xs text-gray-400 capitalize">
                      {new Date(secilenGun+'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'long' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {secilenGun === todayStr && (
                      <span className="text-xs px-1.5 py-0.5 rounded text-white" style={{ background: 'var(--primary)', fontSize: '10px' }}>
                        Bugün
                      </span>
                    )}
                    <button onClick={() => setSecilenGun(null)}
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 transition text-gray-400 text-base">
                      ×
                    </button>
                  </div>
                </div>

                {/* Etkinlik listesi */}
                <div className="p-3">
                  {secilenEvs.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-2xl mb-2">📭</p>
                      <p className="text-xs text-gray-400">Bu gün için etkinlik yok</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {secilenEvs.map(ev => {
                        const t = TIP[ev.tip]
                        return (
                          <button key={ev.id}
                            onClick={() => navigate(ev.link)}
                            className="w-full text-left rounded transition-all hover:opacity-80"
                            style={{ background: t.bg, borderLeft: `3px solid ${t.dot}`, padding: '8px 10px' }}>
                            <div className="flex items-start gap-1.5">
                              <span style={{ fontSize: '12px', flexShrink: 0, marginTop: '1px' }}>{t.ikon}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold truncate" style={{ color: t.text }}>
                                  {ev.baslik}
                                </p>
                                {ev.alt && (
                                  <p className="text-xs text-gray-400 truncate mt-0.5">{ev.alt}</p>
                                )}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Özet */}
                {secilenEvs.length > 0 && (
                  <div className="px-3 pb-3 pt-0 border-t border-gray-100 mt-1">
                    <div className="pt-2 grid grid-cols-2 gap-1">
                      {Object.entries(TIP).map(([tip, meta]) => {
                        const sayi = secilenEvs.filter(e => e.tip === tip).length
                        if (!sayi) return null
                        return (
                          <div key={tip} className="flex items-center gap-1" style={{ fontSize: '11px' }}>
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: meta.dot }} />
                            <span className="text-gray-400">{meta.label}</span>
                            <span className="font-bold ml-auto" style={{ color: meta.text }}>{sayi}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Renk açıklaması */}
      <div className="flex gap-4 mt-2 px-1">
        {Object.entries(TIP).map(([tip, meta]) => (
          <div key={tip} className="flex items-center gap-1 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: meta.dot }} />
            {meta.label}
          </div>
        ))}
      </div>
    </div>
  )
}
