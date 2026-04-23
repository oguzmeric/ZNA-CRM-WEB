import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Star, ArrowLeft, Search, MessageSquare, Calendar, Smile, Frown, Meh, Trash2, Link2,
} from 'lucide-react'
import CustomSelect from '../components/CustomSelect'
import { Button, SearchInput, Card, CardTitle, Badge, CodeBadge, EmptyState } from '../components/ui'

const AYLAR_KISA = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara']

const PUAN_META = {
  1: { label: 'Çok Kötü', tone: 'kayip',     renk: 'var(--danger)' },
  2: { label: 'Kötü',     tone: 'kayip',     renk: 'var(--danger)' },
  3: { label: 'Orta',     tone: 'beklemede', renk: 'var(--warning)' },
  4: { label: 'İyi',      tone: 'aktif',     renk: 'var(--success)' },
  5: { label: 'Mükemmel', tone: 'brand',     renk: 'var(--brand-primary)' },
}

const puanOku = () => {
  try { return JSON.parse(localStorage.getItem('memnuniyet_puanlari') || '[]') }
  catch { return [] }
}

function YildizGoster({ puan, boyut = 16 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1,2,3,4,5].map(i => (
        <Star
          key={i}
          size={boyut}
          strokeWidth={1.5}
          fill={i <= puan ? 'var(--warning)' : 'transparent'}
          style={{ color: i <= puan ? 'var(--warning)' : 'var(--border-default)' }}
        />
      ))}
    </span>
  )
}

function OrtalamaHalka({ ortalama, toplam }) {
  const pct = (ortalama / 5) * 100
  const r = 52, cx = 64, cy = 64
  const C = 2 * Math.PI * r
  const arc = (pct / 100) * C
  const renk = ortalama >= 4 ? 'var(--success)' : ortalama >= 3 ? 'var(--warning)' : 'var(--danger)'

  return (
    <div style={{ position: 'relative', width: 128, height: 128, flexShrink: 0 }}>
      <svg width={128} height={128}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={10} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={renk} strokeWidth={10}
          strokeDasharray={`${arc} ${C - arc}`} strokeDashoffset={C / 4}
          strokeLinecap="round" />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ font: '600 28px/1 var(--font-sans)', color: renk, fontVariantNumeric: 'tabular-nums' }}>
          {ortalama.toFixed(1)}
        </span>
        <span className="t-caption" style={{ marginTop: 2 }}>{toplam} yorum</span>
      </div>
    </div>
  )
}

export default function MemnuniyetDegerlendirme() {
  const navigate = useNavigate()
  const [aramaMetni, setAramaMetni] = useState('')
  const [puanFiltre, setPuanFiltre] = useState('hepsi')
  const [sirala, setSirala] = useState('tarih_yeni')

  const puanlar = puanOku()

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
      buAyOrt: buAy.length ? Number((buAy.reduce((s, p) => s + p.puan, 0) / buAy.length).toFixed(1)) : 0,
    }
  }, [puanlar])

  const dagilim = useMemo(() =>
    [5, 4, 3, 2, 1].map(y => ({
      puan: y,
      sayi: puanlar.filter(p => p.puan === y).length,
      pct: puanlar.length ? Math.round(puanlar.filter(p => p.puan === y).length / puanlar.length * 100) : 0,
    })),
    [puanlar]
  )

  const aylikTrend = useMemo(() => {
    const bugun = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(bugun.getFullYear(), bugun.getMonth() - 5 + i, 1)
      const ayP = puanlar.filter(p => {
        const t = new Date(p.tarih)
        return t.getMonth() === d.getMonth() && t.getFullYear() === d.getFullYear()
      })
      return {
        label: AYLAR_KISA[d.getMonth()],
        ort: ayP.length ? (ayP.reduce((s, p) => s + p.puan, 0) / ayP.length) : 0,
        sayi: ayP.length,
      }
    })
  }, [puanlar])

  const filtreliListe = useMemo(() => {
    let l = [...puanlar]
    if (puanFiltre !== 'hepsi') l = l.filter(p => p.puan === parseInt(puanFiltre))
    if (aramaMetni) {
      const q = aramaMetni.toLowerCase()
      l = l.filter(p =>
        (p.musteriAd || '').toLowerCase().includes(q) ||
        (p.firmaAdi  || '').toLowerCase().includes(q) ||
        (p.konu      || '').toLowerCase().includes(q) ||
        (p.yorum     || '').toLowerCase().includes(q)
      )
    }
    if (sirala === 'tarih_yeni')  l.sort((a, b) => new Date(b.tarih) - new Date(a.tarih))
    if (sirala === 'tarih_eski')  l.sort((a, b) => new Date(a.tarih) - new Date(b.tarih))
    if (sirala === 'puan_yuksek') l.sort((a, b) => b.puan - a.puan)
    if (sirala === 'puan_dusuk')  l.sort((a, b) => a.puan - b.puan)
    return l
  }, [puanlar, puanFiltre, aramaMetni, sirala])

  const sil = (id) => {
    const y = puanlar.filter(p => p.id !== id)
    localStorage.setItem('memnuniyet_puanlari', JSON.stringify(y))
    window.location.reload()
  }

  const memnuniyetIkon = stats.memnun >= 80 ? Smile : stats.memnun >= 60 ? Meh : Frown
  const memnuniyetRenk = stats.memnun >= 80 ? 'var(--success)' : stats.memnun >= 60 ? 'var(--warning)' : 'var(--danger)'
  const memnuniyetMesaj = stats.memnun >= 80 ? 'Çok iyi' : stats.memnun >= 60 ? 'İyi' : 'Geliştirilmeli'
  const IconMem = memnuniyetIkon

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Müşteri Memnuniyeti</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>Servis sonrası değerlendirmeler</p>
        </div>
        <Button variant="secondary" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => navigate('/servis-talepleri')}>
          Servis talepleri
        </Button>
      </div>

      {puanlar.length === 0 ? (
        <EmptyState
          icon={<Star size={32} strokeWidth={1.5} />}
          title="Henüz değerlendirme yok"
          description="Tamamlanan servis taleplerinde müşteri değerlendirmesi ekleyerek başlayabilirsin."
          action={<Button variant="primary" onClick={() => navigate('/servis-talepleri')}>Servis taleplerine git</Button>}
        />
      ) : (
        <>
          {/* KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
            <Card>
              <div className="t-label" style={{ marginBottom: 6 }}>GENEL ORTALAMA</div>
              <div style={{ font: '600 28px/1 var(--font-sans)', color: 'var(--warning)', fontVariantNumeric: 'tabular-nums' }}>
                {stats.ortalama.toFixed(1)}
              </div>
              <div style={{ marginTop: 6 }}><YildizGoster puan={Math.round(stats.ortalama)} boyut={13} /></div>
            </Card>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="t-label">MEMNUNİYET ORANI</div>
                <IconMem size={14} strokeWidth={1.5} style={{ color: memnuniyetRenk }} />
              </div>
              <div style={{ font: '600 28px/1 var(--font-sans)', color: memnuniyetRenk, marginTop: 8 }}>%{stats.memnun}</div>
              <div className="t-caption" style={{ marginTop: 6 }}>4+ yıldız alanlar · {memnuniyetMesaj}</div>
            </Card>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="t-label">TOPLAM YORUM</div>
                <MessageSquare size={14} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
              </div>
              <div style={{ font: '600 28px/1 var(--font-sans)', color: 'var(--text-primary)', marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{stats.toplam}</div>
              <div className="t-caption" style={{ marginTop: 6 }}>Tüm zamanlar</div>
            </Card>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="t-label">BU AY ORTALAMA</div>
                <Calendar size={14} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
              </div>
              <div style={{ font: '600 28px/1 var(--font-sans)', color: 'var(--text-primary)', marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
                {stats.buAyOrt || '—'}
              </div>
              <div className="t-caption" style={{ marginTop: 6 }}>{stats.buAy} değerlendirme</div>
            </Card>
          </div>

          {/* Grafikler */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, marginBottom: 20 }}>

            {/* Puan dağılımı */}
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <OrtalamaHalka ortalama={stats.ortalama} toplam={stats.toplam} />
                <div>
                  <CardTitle>Puan Dağılımı</CardTitle>
                  <div style={{ marginTop: 8 }}><YildizGoster puan={Math.round(stats.ortalama)} boyut={18} /></div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dagilim.map(d => (
                  <div key={d.puan} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 16, textAlign: 'right', font: '600 11px/1 var(--font-sans)', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {d.puan}
                    </span>
                    <Star size={12} strokeWidth={1.5} fill="var(--warning)" style={{ color: 'var(--warning)' }} />
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--surface-sunken)', overflow: 'hidden' }}>
                      <div style={{
                        width: `${d.pct}%`, height: '100%',
                        background: PUAN_META[d.puan].renk,
                        borderRadius: 3,
                        transition: 'width 300ms',
                      }} />
                    </div>
                    <span style={{ width: 28, textAlign: 'right', font: '400 12px/1 var(--font-sans)', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{d.sayi}</span>
                    <span style={{ width: 32, textAlign: 'right', font: '400 11px/1 var(--font-sans)', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>%{d.pct}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Aylık trend */}
            <Card>
              <CardTitle>Aylık Trend</CardTitle>
              <p className="t-caption" style={{ marginTop: 2, marginBottom: 20 }}>Son 6 ay ortalama puan</p>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 110 }}>
                {aylikTrend.map((ay, i) => {
                  const h = ay.ort > 0 ? Math.max((ay.ort / 5) * 95, 8) : 3
                  const renk = ay.ort >= 4 ? 'var(--success)' : ay.ort >= 3 ? 'var(--warning)' : ay.ort > 0 ? 'var(--danger)' : 'var(--border-default)'
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      {ay.ort > 0 && (
                        <span style={{ font: '600 10px/1 var(--font-sans)', color: renk, fontVariantNumeric: 'tabular-nums' }}>
                          {Number(ay.ort).toFixed(1)}
                        </span>
                      )}
                      <div style={{ width: '70%', height: h, background: renk, borderRadius: '2px 2px 0 0' }} />
                      <span style={{ font: '500 10px/1 var(--font-sans)', color: 'var(--text-tertiary)' }}>{ay.label}</span>
                      {ay.sayi > 0 && <span style={{ font: '400 9px/1 var(--font-sans)', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{ay.sayi}</span>}
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-default)' }}>
                {[
                  { renk: 'var(--success)', label: '4-5 ★ Memnun' },
                  { renk: 'var(--warning)', label: '3 ★ Orta' },
                  { renk: 'var(--danger)',  label: '1-2 ★ Memnunsuz' },
                ].map(l => (
                  <div key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: l.renk }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Filtreler */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { id: 'hepsi', label: `Tümü (${puanlar.length})` },
                ...[5, 4, 3, 2, 1].map(y => ({
                  id: y.toString(),
                  label: `${y} ★ (${puanlar.filter(p => p.puan === y).length})`,
                })),
              ].map(f => {
                const active = puanFiltre === f.id
                return (
                  <button
                    key={f.id}
                    onClick={() => setPuanFiltre(f.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      background: active ? 'var(--brand-primary)' : 'var(--surface-card)',
                      color: active ? '#fff' : 'var(--text-secondary)',
                      border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                      font: '500 12px/16px var(--font-sans)',
                      cursor: 'pointer',
                    }}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <div style={{ width: 180 }}>
                <SearchInput value={aramaMetni} onChange={e => setAramaMetni(e.target.value)} placeholder="Ara…" />
              </div>
              <div style={{ width: 140 }}>
                <CustomSelect value={sirala} onChange={e => setSirala(e.target.value)}>
                  <option value="tarih_yeni">En yeni</option>
                  <option value="tarih_eski">En eski</option>
                  <option value="puan_yuksek">Puan ↑</option>
                  <option value="puan_dusuk">Puan ↓</option>
                </CustomSelect>
              </div>
            </div>
          </div>

          {/* Liste */}
          {filtreliListe.length === 0 ? (
            <EmptyState icon={<Search size={32} strokeWidth={1.5} />} title="Sonuç bulunamadı" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtreliListe.map(p => {
                const meta = PUAN_META[p.puan]
                return (
                  <Card key={p.id}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                      <div style={{
                        flexShrink: 0, width: 54, height: 54,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--surface-sunken)',
                        border: `1px solid var(--border-default)`,
                        borderRadius: 'var(--radius-md)',
                      }}>
                        <span style={{ font: '600 20px/1 var(--font-sans)', color: meta.renk, fontVariantNumeric: 'tabular-nums' }}>{p.puan}</span>
                        <Star size={13} strokeWidth={1.5} fill={meta.renk} style={{ color: meta.renk, marginTop: 2 }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{p.musteriAd}</span>
                          {p.firmaAdi && <span className="t-caption">· {p.firmaAdi}</span>}
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </div>
                        <button
                          onClick={() => navigate(`/servis-talepleri/${p.servisTalepId}`)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                            font: '500 12px/16px var(--font-sans)', color: 'var(--brand-primary)',
                            marginBottom: 8,
                          }}
                        >
                          <Link2 size={11} strokeWidth={1.5} /> {p.talepNo} — {p.konu}
                        </button>
                        <YildizGoster puan={p.puan} boyut={14} />
                        {p.yorum && (
                          <p style={{ font: '400 13px/20px var(--font-sans)', color: 'var(--text-secondary)', marginTop: 8, fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                            "{p.yorum}"
                          </p>
                        )}
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <p className="t-caption" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {new Date(p.tarih).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                        <p className="t-caption" style={{ marginTop: 2 }}>Kaydeden: {p.kaydeden}</p>
                        <button
                          onClick={() => sil(p.id)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer',
                            font: '500 12px/16px var(--font-sans)', color: 'var(--text-tertiary)',
                            marginTop: 8,
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
                        >
                          <Trash2 size={12} strokeWidth={1.5} /> Sil
                        </button>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
