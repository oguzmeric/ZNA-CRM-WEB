import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import CustomSelect from '../components/CustomSelect'
import { motion } from 'framer-motion'

// ─── Yardımcılar ─────────────────────────────────────────────────────────────
const AYLAR_KISA = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara']

const PUAN_ETIKETLERI = {
  1: { label: 'Çok Kötü',    renk: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
  2: { label: 'Kötü',        renk: '#f97316', bg: 'rgba(249,115,22,0.1)'  },
  3: { label: 'Orta',        renk: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
  4: { label: 'İyi',         renk: '#10b981', bg: 'rgba(16,185,129,0.1)'  },
  5: { label: 'Mükemmel',    renk: '#0176D3', bg: 'rgba(1,118,211,0.1)'  },
}

function puanOku() {
  try { return JSON.parse(localStorage.getItem('memnuniyet_puanlari') || '[]') } catch { return [] }
}

function YildizGoster({ puan, boyut = 'base' }) {
  const sizes = { sm: '12px', base: '16px', lg: '24px', xl: '36px' }
  return (
    <span style={{ fontSize: sizes[boyut] || sizes.base, lineHeight: 1, letterSpacing: '1px' }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= puan ? '#f59e0b' : '#e2e8f0' }}>★</span>
      ))}
    </span>
  )
}

function OrtalamaHalka({ ortalama, toplam }) {
  const pct = (ortalama / 5) * 100
  const r = 52, cx = 64, cy = 64
  const C = 2 * Math.PI * r
  const arc = (pct / 100) * C
  const renk = ortalama >= 4 ? '#10b981' : ortalama >= 3 ? '#f59e0b' : '#ef4444'
  return (
    <div className="relative" style={{ width: 128, height: 128 }}>
      <svg width={128} height={128}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={12} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={renk} strokeWidth={12}
          strokeDasharray={`${arc} ${C - arc}`} strokeDashoffset={C / 4}
          strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-extrabold" style={{ fontSize: '28px', color: renk, lineHeight: 1 }}>
          {ortalama.toFixed(1)}
        </span>
        <span className="text-xs text-gray-400 mt-0.5">{toplam} yorum</span>
      </div>
    </div>
  )
}

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────
export default function MemnuniyetDegerlendirme() {
  const navigate = useNavigate()
  const [aramaMetni, setAramaMetni] = useState('')
  const [puanFiltre, setPuanFiltre] = useState('hepsi')
  const [sirala, setSirala] = useState('tarih_yeni')

  const puanlar = puanOku()

  // ── İstatistikler ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (puanlar.length === 0) return { ortalama: 0, memnun: 0, toplam: 0, buAy: 0, buAyOrt: 0 }
    const bugun = new Date()
    const buAy = puanlar.filter(p => {
      const t = new Date(p.tarih)
      return t.getMonth() === bugun.getMonth() && t.getFullYear() === bugun.getFullYear()
    })
    return {
      ortalama: puanlar.reduce((s, p) => s + p.puan, 0) / puanlar.length,
      memnun: Math.round(puanlar.filter(p => p.puan >= 4).length / puanlar.length * 100),
      toplam: puanlar.length,
      buAy: buAy.length,
      buAyOrt: buAy.length ? (buAy.reduce((s, p) => s + p.puan, 0) / buAy.length).toFixed(1) : 0,
    }
  }, [puanlar])

  // ── Yıldız dağılımı ───────────────────────────────────────────────────────
  const dagilim = useMemo(() =>
    [5,4,3,2,1].map(y => ({
      puan: y,
      sayi: puanlar.filter(p => p.puan === y).length,
      pct: puanlar.length ? Math.round(puanlar.filter(p => p.puan === y).length / puanlar.length * 100) : 0,
    })),
    [puanlar]
  )

  // ── Aylık trend (son 6 ay) ────────────────────────────────────────────────
  const aylikTrend = useMemo(() => {
    const bugun = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(bugun.getFullYear(), bugun.getMonth() - 5 + i, 1)
      const ayPuanlar = puanlar.filter(p => {
        const t = new Date(p.tarih)
        return t.getMonth() === d.getMonth() && t.getFullYear() === d.getFullYear()
      })
      return {
        label: AYLAR_KISA[d.getMonth()],
        ort: ayPuanlar.length ? (ayPuanlar.reduce((s,p) => s + p.puan, 0) / ayPuanlar.length) : 0,
        sayi: ayPuanlar.length,
      }
    })
  }, [puanlar])

  // ── Filtreli liste ────────────────────────────────────────────────────────
  const filtreliListe = useMemo(() => {
    let liste = [...puanlar]
    if (puanFiltre !== 'hepsi') liste = liste.filter(p => p.puan === parseInt(puanFiltre))
    if (aramaMetni) {
      const q = aramaMetni.toLowerCase()
      liste = liste.filter(p =>
        p.musteriAd?.toLowerCase().includes(q) ||
        p.firmaAdi?.toLowerCase().includes(q) ||
        p.konu?.toLowerCase().includes(q) ||
        p.yorum?.toLowerCase().includes(q)
      )
    }
    if (sirala === 'tarih_yeni') liste.sort((a,b) => new Date(b.tarih) - new Date(a.tarih))
    if (sirala === 'tarih_eski') liste.sort((a,b) => new Date(a.tarih) - new Date(b.tarih))
    if (sirala === 'puan_yuksek') liste.sort((a,b) => b.puan - a.puan)
    if (sirala === 'puan_dusuk')  liste.sort((a,b) => a.puan - b.puan)
    return liste
  }, [puanlar, puanFiltre, aramaMetni, sirala])

  const sil = (id) => {
    const yeni = puanlar.filter(p => p.id !== id)
    localStorage.setItem('memnuniyet_puanlari', JSON.stringify(yeni))
    window.location.reload()
  }

  return (
    <div className="p-6 min-h-screen">

      {/* Başlık */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">⭐ Müşteri Memnuniyeti</h2>
          <p className="text-sm text-gray-400 mt-0.5">Servis sonrası değerlendirmeler</p>
        </div>
        <button onClick={() => navigate('/servis-talepleri')}
          className="text-sm px-4 py-2 rounded-xl border text-gray-500 hover:bg-gray-50 transition"
          style={{ border: '1px solid #e5e7eb' }}>
          ← Servis Talepleri
        </button>
      </div>

      {puanlar.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-6xl mb-4">⭐</p>
          <p className="text-lg font-semibold text-gray-500">Henüz değerlendirme yok</p>
          <p className="text-sm text-gray-400 mt-2">
            Tamamlanan servis taleplerinde "Müşteri Değerlendirmesi" bölümünden puan ekleyebilirsiniz.
          </p>
          <button onClick={() => navigate('/servis-talepleri')}
            className="mt-5 text-sm px-5 py-2.5 rounded-xl text-white"
            style={{ background: 'var(--primary)' }}>
            Servis Taleplerine Git
          </button>
        </div>
      ) : (
        <>
          {/* ── Özet Kartları ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { baslik: 'Genel Ortalama', deger: stats.ortalama.toFixed(1), alt: '5 üzerinden', ikon: '⭐', renk: '#f59e0b' },
              { baslik: 'Memnuniyet Oranı', deger: `%${stats.memnun}`, alt: '4+ yıldız alanlar', ikon: '😊', renk: '#10b981' },
              { baslik: 'Toplam Yorum', deger: stats.toplam, alt: 'Tüm zamanlar', ikon: '💬', renk: '#0176D3' },
              { baslik: 'Bu Ay Ortalama', deger: stats.buAyOrt || '—', alt: `${stats.buAy} değerlendirme`, ikon: '📅', renk: '#014486' },
            ].map((k, i) => (
              <motion.div key={i} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay: i*0.05 }}
                className="rounded-2xl p-5" style={{ background:'rgba(255,255,255,0.93)', border:'1px solid rgba(1,118,211,0.1)', boxShadow:'0 2px 8px rgba(1,118,211,0.06)' }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">{k.baslik}</p>
                  <span className="text-xl">{k.ikon}</span>
                </div>
                <p className="font-extrabold mb-1" style={{ fontSize:'32px', color:k.renk, lineHeight:1 }}>{k.deger}</p>
                <p className="text-xs text-gray-400">{k.alt}</p>
              </motion.div>
            ))}
          </div>

          {/* ── Grafikler ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">

            {/* Yıldız dağılımı */}
            <div className="rounded-2xl p-5" style={{ background:'rgba(255,255,255,0.93)', border:'1px solid rgba(1,118,211,0.1)', boxShadow:'0 2px 8px rgba(1,118,211,0.06)' }}>
              <div className="flex items-center gap-5 mb-5">
                <OrtalamaHalka ortalama={stats.ortalama} toplam={stats.toplam} />
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">Puan Dağılımı</p>
                  <YildizGoster puan={Math.round(stats.ortalama)} boyut="lg" />
                  <p className="text-xs text-gray-400 mt-1">
                    {stats.memnun >= 80 ? '🟢 Çok İyi' : stats.memnun >= 60 ? '🟡 İyi' : '🔴 Geliştirilmeli'}
                  </p>
                </div>
              </div>
              <div className="space-y-2.5">
                {dagilim.map(d => (
                  <div key={d.puan} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-500 w-4 text-right">{d.puan}</span>
                    <span style={{ color: '#f59e0b', fontSize: '12px' }}>★</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
                      <motion.div className="h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${d.pct}%` }}
                        transition={{ duration: 0.6, delay: (5 - d.puan) * 0.1 }}
                        style={{ background: PUAN_ETIKETLERI[d.puan].renk }} />
                    </div>
                    <span className="text-xs text-gray-500 w-6 text-right">{d.sayi}</span>
                    <span className="text-xs text-gray-400 w-8 text-right">%{d.pct}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Aylık trend */}
            <div className="rounded-2xl p-5" style={{ background:'rgba(255,255,255,0.93)', border:'1px solid rgba(1,118,211,0.1)', boxShadow:'0 2px 8px rgba(1,118,211,0.06)' }}>
              <p className="text-sm font-semibold text-gray-700 mb-1">Aylık Trend</p>
              <p className="text-xs text-gray-400 mb-5">Son 6 ay ortalama puan</p>
              <div className="flex items-end gap-2" style={{ height: 110 }}>
                {aylikTrend.map((ay, i) => {
                  const h = ay.ort > 0 ? Math.max((ay.ort / 5) * 95, 8) : 3
                  const renk = ay.ort >= 4 ? '#10b981' : ay.ort >= 3 ? '#f59e0b' : ay.ort > 0 ? '#ef4444' : '#e2e8f0'
                  return (
                    <div key={i} className="flex flex-col items-center flex-1 gap-1">
                      {ay.ort > 0 && (
                        <span className="text-xs font-bold" style={{ color: renk, fontSize: '10px' }}>{Number(ay.ort).toFixed(1)}</span>
                      )}
                      <div className="w-full rounded-t-lg relative overflow-hidden" style={{ height: h, background: renk }}>
                        <div className="absolute inset-0" style={{ background: 'rgba(255,255,255,0.2)' }} />
                      </div>
                      <span className="text-center" style={{ color: 'var(--text-muted)', fontSize: '9px', fontWeight: 600 }}>{ay.label}</span>
                      {ay.sayi > 0 && (
                        <span style={{ color: '#cbd5e1', fontSize: '9px' }}>{ay.sayi}</span>
                      )}
                    </div>
                  )
                })}
              </div>
              {/* 5 yıldız çizgisi referansı */}
              <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid #f1f5f9' }}>
                {[
                  { renk: '#10b981', label: '4-5 ★ Memnun' },
                  { renk: '#f59e0b', label: '3 ★ Orta' },
                  { renk: '#ef4444', label: '1-2 ★ Memnunsuz' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1 text-xs text-gray-400">
                    <div className="w-2 h-2 rounded-sm" style={{ background: l.renk }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Filtreler ─────────────────────────────────────────────────── */}
          <div className="flex gap-3 mb-4 flex-wrap items-center">
            <div className="flex gap-1.5 flex-wrap">
              {[{ id:'hepsi', label:'Tümü' }, ...([5,4,3,2,1].map(y => ({ id: y.toString(), label: `${'★'.repeat(y)} (${puanlar.filter(p=>p.puan===y).length})` })))].map(f => (
                <button key={f.id} onClick={() => setPuanFiltre(f.id)}
                  className="text-xs px-3 py-1.5 rounded-xl border font-medium transition"
                  style={{
                    background: puanFiltre === f.id ? 'var(--primary)' : 'white',
                    color: puanFiltre === f.id ? 'white' : '#6b7280',
                    borderColor: puanFiltre === f.id ? 'transparent' : '#e5e7eb',
                  }}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 ml-auto">
              <input type="text" value={aramaMetni} onChange={e => setAramaMetni(e.target.value)}
                placeholder="Ara..." className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-36" />
              <CustomSelect value={sirala} onChange={e => setSirala(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="tarih_yeni">En Yeni</option>
                <option value="tarih_eski">En Eski</option>
                <option value="puan_yuksek">Puan ↑</option>
                <option value="puan_dusuk">Puan ↓</option>
              </CustomSelect>
            </div>
          </div>

          {/* ── Değerlendirme Listesi ──────────────────────────────────────── */}
          {filtreliListe.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-sm">Sonuç bulunamadı</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtreliListe.map(p => {
                const meta = PUAN_ETIKETLERI[p.puan]
                return (
                  <motion.div key={p.id} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
                    className="rounded-2xl p-5" style={{ background:'rgba(255,255,255,0.93)', border:'1px solid rgba(1,118,211,0.1)', boxShadow:'0 2px 8px rgba(1,118,211,0.04)' }}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        {/* Puan rozeti */}
                        <div className="flex-shrink-0 w-14 h-14 rounded-2xl flex flex-col items-center justify-center"
                          style={{ background: meta.bg }}>
                          <span className="text-xl font-extrabold leading-none" style={{ color: meta.renk }}>{p.puan}</span>
                          <span style={{ color: meta.renk, fontSize: '14px', lineHeight: 1 }}>★</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="font-semibold text-gray-800">{p.musteriAd}</p>
                            {p.firmaAdi && <span className="text-xs text-gray-400">· {p.firmaAdi}</span>}
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: meta.bg, color: meta.renk }}>
                              {meta.label}
                            </span>
                          </div>
                          <button onClick={() => navigate(`/servis-talepleri/${p.servisTalepId}`)}
                            className="text-xs text-indigo-500 hover:text-indigo-700 transition mb-2">
                            🔗 {p.talepNo} — {p.konu}
                          </button>
                          <YildizGoster puan={p.puan} boyut="base" />
                          {p.yorum && (
                            <p className="text-sm text-gray-600 mt-2 leading-relaxed italic">"{p.yorum}"</p>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs text-gray-400">
                          {new Date(p.tarih).toLocaleDateString('tr-TR', { day:'2-digit', month:'short', year:'numeric' })}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">Kaydeden: {p.kaydeden}</p>
                        <button onClick={() => sil(p.id)} className="mt-2 text-xs text-red-400 hover:text-red-600 transition">🗑 Sil</button>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
