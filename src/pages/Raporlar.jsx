import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts'
import { X as XIcon, AlertTriangle, Package } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import CustomSelect from '../components/CustomSelect'
import { teklifleriGetir } from '../services/teklifService'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { gorevleriGetir } from '../services/gorevService'
import { stokHareketleriniGetir, stokUrunleriniGetir } from '../services/stokService'
import {
  Button, Card, KPICard, Badge, Avatar, EmptyState, Alert,
} from '../components/ui'

const RENKLER = ['#1E5AA8', '#2F7D4F', '#B77516', '#B23A3A', '#6B4A8E', '#2B6A9E']
const aylar = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
const formatTutar = v => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0 }).format(v)

const chartAxisStyle = { fontSize: 11, fill: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)' }
const chartTooltipStyle = {
  contentStyle: {
    background: 'var(--surface-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'var(--font-sans)',
    boxShadow: 'var(--shadow-md)',
    padding: '8px 12px',
  },
  labelStyle: { color: 'var(--text-primary)', fontWeight: 500 },
}

function ChartCard({ title, children, height = 240 }) {
  return (
    <Card>
      <p className="t-body-strong" style={{ marginBottom: 14 }}>{title}</p>
      {/* position: relative + minWidth/minHeight: 0 → ResponsiveContainer
          ilk mount'ta -1,-1 uyarısı vermesin (flex/grid child'larda gerekir) */}
      <div style={{ position: 'relative', width: '100%', height, minWidth: 0, minHeight: 0 }}>
        {children}
      </div>
    </Card>
  )
}

function Raporlar() {
  const { kullanicilar } = useAuth()
  const [aktifSekme, setAktifSekme] = useState('teklifler')
  const [seciliPersonel, setSeciliPersonel] = useState('hepsi')
  const [yukleniyor, setYukleniyor] = useState(true)

  const [teklifler, setTeklifler] = useState([])
  const [gorusmeler, setGorusmeler] = useState([])
  const [gorevler, setGorevler] = useState([])
  const [stokHareketler, setStokHareketler] = useState([])
  const [stokUrunler, setStokUrunler] = useState([])

  useEffect(() => {
    (async () => {
      setYukleniyor(true)
      try {
        const [t, g, gr, sh, su] = await Promise.all([
          teklifleriGetir(), gorusmeleriGetir(), gorevleriGetir(),
          stokHareketleriniGetir(), stokUrunleriniGetir(),
        ])
        setTeklifler(t || []); setGorusmeler(g || []); setGorevler(gr || [])
        setStokHareketler(sh || []); setStokUrunler(su || [])
      } catch (err) {
        console.error('[Raporlar yükle]', err)
      } finally {
        setYukleniyor(false)
      }
    })()
  }, [])

  const sekmeler = [
    { id: 'teklifler',  isim: 'Teklifler' },
    { id: 'gorusmeler', isim: 'Görüşmeler' },
    { id: 'gorevler',   isim: 'Görevler' },
    { id: 'stok',       isim: 'Stok' },
  ]

  const filtreliTeklifler = seciliPersonel === 'hepsi' ? teklifler : teklifler.filter(t => t.hazirlayan === seciliPersonel)
  const filtreliGorusmeler = seciliPersonel === 'hepsi' ? gorusmeler : gorusmeler.filter(g => g.gorusen === seciliPersonel)
  const filtreliGorevler = seciliPersonel === 'hepsi'
    ? gorevler
    : gorevler.filter(g => {
        const k = kullanicilar.find(k => k.ad === seciliPersonel)
        return g.atanan === k?.id?.toString()
      })

  const aylikTeklifVerisi = aylar.map((ay, i) => {
    const ayT = filtreliTeklifler.filter(t => {
      const tarih = new Date(t.tarih)
      return tarih.getMonth() === i && tarih.getFullYear() === new Date().getFullYear()
    })
    return {
      ay,
      toplam: ayT.length,
      tutar: ayT.reduce((s, t) => s + (t.genelToplam || 0), 0),
      kabul: ayT.filter(t => t.onayDurumu === 'kabul').length,
    }
  })

  const teklifDurumVerisi = [
    { isim: 'Takipte',    deger: filtreliTeklifler.filter(t => t.onayDurumu === 'takipte').length },
    { isim: 'Kabul',      deger: filtreliTeklifler.filter(t => t.onayDurumu === 'kabul').length },
    { isim: 'Vazgeçildi', deger: filtreliTeklifler.filter(t => t.onayDurumu === 'vazgecildi').length },
    { isim: 'Revizyon',   deger: filtreliTeklifler.filter(t => t.onayDurumu === 'revizyon').length },
  ].filter(d => d.deger > 0)

  const personelTeklifVerisi = kullanicilar.map(k => ({
    isim: k.ad.split(' ')[0], ad: k.ad,
    adet: teklifler.filter(t => t.hazirlayan === k.ad).length,
    tutar: teklifler.filter(t => t.hazirlayan === k.ad).reduce((s, t) => s + (t.genelToplam || 0), 0),
    kabul: teklifler.filter(t => t.hazirlayan === k.ad && t.onayDurumu === 'kabul').length,
  })).filter(k => k.adet > 0)

  const aylikGorusmeVerisi = aylar.map((ay, i) => {
    const ayG = filtreliGorusmeler.filter(g => {
      const t = new Date(g.tarih)
      return t.getMonth() === i && t.getFullYear() === new Date().getFullYear()
    })
    return { ay, toplam: ayG.length, kapali: ayG.filter(g => g.durum === 'kapali').length }
  })

  const konuGorusmeVerisi = () => {
    const m = {}
    filtreliGorusmeler.forEach(g => { m[g.konu] = (m[g.konu] || 0) + 1 })
    return Object.entries(m).map(([konu, adet]) => ({ konu, adet }))
      .sort((a, b) => b.adet - a.adet).slice(0, 6)
  }

  const personelGorusmeVerisi = kullanicilar.map(k => ({
    isim: k.ad.split(' ')[0], ad: k.ad,
    adet: gorusmeler.filter(g => g.gorusen === k.ad).length,
  })).filter(k => k.adet > 0)

  const gorevDurumVerisi = [
    { isim: 'Bekliyor',     deger: filtreliGorevler.filter(g => g.durum === 'bekliyor').length },
    { isim: 'Devam Ediyor', deger: filtreliGorevler.filter(g => g.durum === 'devam').length },
    { isim: 'Tamamlandı',   deger: filtreliGorevler.filter(g => g.durum === 'tamamlandi').length },
  ].filter(d => d.deger > 0)

  const personelGorevVerisi = kullanicilar.map(k => {
    const pg = gorevler.filter(g => g.atanan === k.id?.toString())
    return {
      isim: k.ad.split(' ')[0], ad: k.ad,
      toplam: pg.length,
      tamamlanan: pg.filter(g => g.durum === 'tamamlandi').length,
      bekleyen: pg.filter(g => g.durum === 'bekliyor').length,
    }
  }).filter(k => k.toplam > 0)

  const stokCikisVerisi = () => {
    const m = {}
    stokHareketler.filter(h => h.tur === 'cikis').forEach(h => {
      const urun = stokUrunler.find(u => u.stokKodu === h.stokKodu)
      const ad = urun?.stokAdi || h.stokKodu
      m[ad] = (m[ad] || 0) + Number(h.miktar)
    })
    return Object.entries(m).map(([ad, miktar]) => ({ ad: ad.substring(0, 15), miktar }))
      .sort((a, b) => b.miktar - a.miktar).slice(0, 8)
  }

  const kritikStokVerisi = stokUrunler.filter(u => {
    const bakiye = stokHareketler.filter(h => h.stokKodu === u.stokKodu).reduce((s, h) => {
      if (h.tur === 'giris' || h.tur === 'transfer_giris') return s + Number(h.miktar)
      return s - Number(h.miktar)
    }, 0)
    return u.minStok && bakiye <= Number(u.minStok)
  })

  const gecikenler = filtreliGorevler.filter(g => g.durum !== 'tamamlandi' && g.sonTarih && new Date(g.sonTarih) < new Date())

  if (yukleniyor) return <div style={{ padding: 24 }}><EmptyState title="Yükleniyor…" /></div>

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Raporlar</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>Genel performans ve analiz</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="t-caption">Personel:</span>
          <div style={{ minWidth: 200 }}>
            <CustomSelect value={seciliPersonel} onChange={e => setSeciliPersonel(e.target.value)}>
              <option value="hepsi">Tüm personel</option>
              {kullanicilar.map(k => <option key={k.id} value={k.ad}>{k.ad}</option>)}
            </CustomSelect>
          </div>
          {seciliPersonel !== 'hepsi' && (
            <Button variant="tertiary" size="sm" iconLeft={<XIcon size={12} strokeWidth={1.5} />} onClick={() => setSeciliPersonel('hepsi')}>
              Temizle
            </Button>
          )}
        </div>
      </div>

      {/* Personel banner */}
      {seciliPersonel !== 'hepsi' && (
        <Alert variant="info" style={{ marginBottom: 20 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Avatar name={seciliPersonel} size="xs" />
            <strong>{seciliPersonel}</strong> için filtrelenmiş veriler gösteriliyor
          </span>
        </Alert>
      )}

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border-default)', overflowX: 'auto' }}>
        {sekmeler.map(s => {
          const aktif = aktifSekme === s.id
          return (
            <button
              key={s.id}
              onClick={() => setAktifSekme(s.id)}
              style={{
                padding: '10px 14px',
                background: 'transparent', border: 'none',
                borderBottom: `2px solid ${aktif ? 'var(--brand-primary)' : 'transparent'}`,
                marginBottom: -1,
                color: aktif ? 'var(--brand-primary)' : 'var(--text-secondary)',
                font: aktif ? '600 13px/18px var(--font-sans)' : '500 13px/18px var(--font-sans)',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {s.isim}
            </button>
          )
        })}
      </div>

      {/* TEKLİFLER */}
      {aktifSekme === 'teklifler' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <KPICard label="TOPLAM TEKLİF" value={filtreliTeklifler.length} />
            <KPICard
              label="KABUL ORANI"
              value={`%${filtreliTeklifler.length > 0 ? Math.round((filtreliTeklifler.filter(t => t.onayDurumu === 'kabul').length / filtreliTeklifler.length) * 100) : 0}`}
              footer={<span style={{ color: 'var(--success)' }}>Başarı oranı</span>}
            />
            <KPICard
              label="KABUL TUTARI"
              value={`₺${formatTutar(filtreliTeklifler.filter(t => t.onayDurumu === 'kabul').reduce((s, t) => s + (t.genelToplam || 0), 0))}`}
            />
            <KPICard
              label="ORT. TEKLİF TUTARI"
              value={`₺${filtreliTeklifler.length > 0 ? formatTutar(filtreliTeklifler.reduce((s, t) => s + (t.genelToplam || 0), 0) / filtreliTeklifler.length) : 0}`}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
            <ChartCard title="Aylık Teklif Tutarı">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aylikTeklifVerisi} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                  <XAxis dataKey="ay" tick={chartAxisStyle} />
                  <YAxis tick={chartAxisStyle} tickFormatter={formatTutar} />
                  <Tooltip formatter={v => `₺${formatTutar(v)}`} {...chartTooltipStyle} />
                  <Bar dataKey="tutar" fill="var(--brand-primary)" radius={[2, 2, 0, 0]} name="Tutar" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Durum Dağılımı">
              {teklifDurumVerisi.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={teklifDurumVerisi} dataKey="deger" nameKey="isim" cx="50%" cy="50%" outerRadius={80} label={({ isim, deger }) => `${isim}: ${deger}`}>
                      {teklifDurumVerisi.map((_, i) => <Cell key={i} fill={RENKLER[i % RENKLER.length]} />)}
                    </Pie>
                    <Tooltip {...chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyState title="Henüz veri yok" />}
            </ChartCard>

            <ChartCard title="Aylık Teklif Adedi">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={aylikTeklifVerisi}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                  <XAxis dataKey="ay" tick={chartAxisStyle} />
                  <YAxis tick={chartAxisStyle} />
                  <Tooltip {...chartTooltipStyle} />
                  <Line type="monotone" dataKey="toplam" stroke="var(--brand-primary)" strokeWidth={2} dot={{ r: 3 }} name="Toplam" />
                  <Line type="monotone" dataKey="kabul" stroke="var(--success)" strokeWidth={2} dot={{ r: 3 }} name="Kabul" />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {seciliPersonel === 'hepsi' && (
              <ChartCard title="Personel Bazlı Teklif">
                {personelTeklifVerisi.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={personelTeklifVerisi}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                      <XAxis dataKey="isim" tick={chartAxisStyle} />
                      <YAxis tick={chartAxisStyle} />
                      <Tooltip {...chartTooltipStyle} />
                      <Bar dataKey="adet" fill="var(--info)" radius={[2, 2, 0, 0]} name="Teklif" />
                      <Bar dataKey="kabul" fill="var(--success)" radius={[2, 2, 0, 0]} name="Kabul" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState title="Henüz veri yok" />}
              </ChartCard>
            )}
          </div>

          {seciliPersonel === 'hepsi' && personelTeklifVerisi.length > 0 && (
            <Card padding={0}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-default)' }}>
                <p className="t-body-strong">Personel Teklif Detayı</p>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>
                  <thead>
                    <tr>
                      {[
                        { l: 'Personel' }, { l: 'Teklif', a: 'right' }, { l: 'Kabul', a: 'right' },
                        { l: 'Kabul Oranı', a: 'right' }, { l: 'Toplam Tutar', a: 'right' },
                      ].map((h, i) => (
                        <th key={i} style={{
                          background: 'var(--surface-sunken)',
                          padding: '10px 20px', textAlign: h.a || 'left',
                          font: '600 11px/16px var(--font-sans)',
                          color: 'var(--text-tertiary)',
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                          borderBottom: '1px solid var(--border-default)',
                        }}>{h.l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {personelTeklifVerisi.map((p, i) => (
                      <tr key={i}
                        onClick={() => setSeciliPersonel(p.ad)}
                        style={{ cursor: 'pointer', transition: 'background 120ms' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-default)' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <Avatar name={p.ad} size="xs" />
                            <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{p.ad}</span>
                          </span>
                        </td>
                        <td style={{ padding: '12px 20px', textAlign: 'right', borderBottom: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>{p.adet}</td>
                        <td style={{ padding: '12px 20px', textAlign: 'right', borderBottom: '1px solid var(--border-default)', color: 'var(--success)', fontWeight: 500 }}>{p.kabul}</td>
                        <td style={{ padding: '12px 20px', textAlign: 'right', borderBottom: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>%{p.adet > 0 ? Math.round((p.kabul / p.adet) * 100) : 0}</td>
                        <td style={{ padding: '12px 20px', textAlign: 'right', borderBottom: '1px solid var(--border-default)', color: 'var(--text-primary)', fontWeight: 600 }}>₺{formatTutar(p.tutar)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="t-caption" style={{ padding: '10px 20px', borderTop: '1px solid var(--border-default)' }}>
                Satıra tıklayarak o personele filtrele.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* GÖRÜŞMELER */}
      {aktifSekme === 'gorusmeler' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <KPICard label="TOPLAM GÖRÜŞME" value={filtreliGorusmeler.length} />
            <KPICard label="AÇIK"       value={filtreliGorusmeler.filter(g => g.durum === 'acik').length}      footer={<span style={{ color: 'var(--info)' }}>Devam eden</span>} />
            <KPICard label="BEKLEMEDE"  value={filtreliGorusmeler.filter(g => g.durum === 'beklemede').length} footer={<span style={{ color: 'var(--warning)' }}>Takip</span>} />
            <KPICard label="KAPALI"     value={filtreliGorusmeler.filter(g => g.durum === 'kapali').length}    footer={<span style={{ color: 'var(--success)' }}>Tamamlandı</span>} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
            <ChartCard title="Aylık Görüşme Trendi">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aylikGorusmeVerisi}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                  <XAxis dataKey="ay" tick={chartAxisStyle} />
                  <YAxis tick={chartAxisStyle} />
                  <Tooltip {...chartTooltipStyle} />
                  <Bar dataKey="toplam" fill="var(--brand-primary)" radius={[2, 2, 0, 0]} name="Toplam" />
                  <Bar dataKey="kapali" fill="var(--success)" radius={[2, 2, 0, 0]} name="Kapalı" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Konu Bazlı Dağılım">
              {konuGorusmeVerisi().length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={konuGorusmeVerisi()} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                    <XAxis type="number" tick={chartAxisStyle} />
                    <YAxis dataKey="konu" type="category" tick={chartAxisStyle} width={80} />
                    <Tooltip {...chartTooltipStyle} />
                    <Bar dataKey="adet" fill="var(--info)" radius={[0, 2, 2, 0]} name="Adet" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState title="Henüz veri yok" />}
            </ChartCard>

            {seciliPersonel === 'hepsi' && (
              <ChartCard title="Personel Bazlı Görüşme" height={260}>
                {personelGorusmeVerisi.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={personelGorusmeVerisi}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                      <XAxis dataKey="isim" tick={chartAxisStyle} />
                      <YAxis tick={chartAxisStyle} />
                      <Tooltip {...chartTooltipStyle} />
                      <Bar dataKey="adet" fill="var(--brand-primary)" radius={[2, 2, 0, 0]} name="Görüşme"
                        onClick={d => d?.ad && setSeciliPersonel(d.ad)} style={{ cursor: 'pointer' }} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState title="Henüz veri yok" />}
              </ChartCard>
            )}
          </div>
        </div>
      )}

      {/* GÖREVLER */}
      {aktifSekme === 'gorevler' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <KPICard label="TOPLAM GÖREV"     value={filtreliGorevler.length} />
            <KPICard label="TAMAMLANAN"       value={filtreliGorevler.filter(g => g.durum === 'tamamlandi').length} footer={<span style={{ color: 'var(--success)' }}>Bitti</span>} />
            <KPICard label="DEVAM EDEN"       value={filtreliGorevler.filter(g => g.durum === 'devam').length} footer={<span style={{ color: 'var(--info)' }}>İşlemde</span>} />
            <KPICard
              label="TAMAMLANMA ORANI"
              value={`%${filtreliGorevler.length > 0 ? Math.round((filtreliGorevler.filter(g => g.durum === 'tamamlandi').length / filtreliGorevler.length) * 100) : 0}`}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
            <ChartCard title="Durum Dağılımı">
              {gorevDurumVerisi.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={gorevDurumVerisi} dataKey="deger" nameKey="isim" cx="50%" cy="50%" outerRadius={80} label={({ isim, deger }) => `${isim}: ${deger}`}>
                      {gorevDurumVerisi.map((_, i) => <Cell key={i} fill={RENKLER[i % RENKLER.length]} />)}
                    </Pie>
                    <Tooltip {...chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyState title="Henüz veri yok" />}
            </ChartCard>

            {seciliPersonel === 'hepsi' && (
              <ChartCard title="Personel Bazlı Görev">
                {personelGorevVerisi.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={personelGorevVerisi}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                      <XAxis dataKey="isim" tick={chartAxisStyle} />
                      <YAxis tick={chartAxisStyle} />
                      <Tooltip {...chartTooltipStyle} />
                      <Bar dataKey="toplam" fill="var(--brand-primary)" radius={[2, 2, 0, 0]} name="Toplam" />
                      <Bar dataKey="tamamlanan" fill="var(--success)" radius={[2, 2, 0, 0]} name="Tamamlanan" />
                      <Bar dataKey="bekleyen" fill="var(--warning)" radius={[2, 2, 0, 0]} name="Bekleyen" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState title="Henüz veri yok" />}
              </ChartCard>
            )}
          </div>

          <Card padding={0}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border-default)' }}>
              <p className="t-body-strong">Geciken Görevler</p>
              <Badge tone="kayip">{gecikenler.length} adet</Badge>
            </div>
            {gecikenler.length === 0 ? (
              <div style={{ padding: 40 }}>
                <EmptyState icon={<AlertTriangle size={28} strokeWidth={1.5} />} title="Geciken görev yok" />
              </div>
            ) : (
              gecikenler.map(g => {
                const atanan = kullanicilar.find(k => k.id?.toString() === g.atanan)
                const gun = Math.ceil((new Date() - new Date(g.sonTarih)) / 86400000)
                return (
                  <div key={g.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--border-default)',
                  }}>
                    <div>
                      <p style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>{g.baslik}</p>
                      <p className="t-caption" style={{ marginTop: 2 }}>Atanan: {atanan?.ad || '—'}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--danger)', fontVariantNumeric: 'tabular-nums', margin: 0 }}>Son tarih: {g.sonTarih}</p>
                      <p className="t-caption" style={{ color: 'var(--danger)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{gun} gün gecikti</p>
                    </div>
                  </div>
                )
              })
            )}
          </Card>
        </div>
      )}

      {/* STOK */}
      {aktifSekme === 'stok' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <KPICard label="TOPLAM ÜRÜN"     value={stokUrunler.length}    icon={<Package size={16} strokeWidth={1.5} />} />
            <KPICard label="TOPLAM HAREKET"  value={stokHareketler.length} footer={<span style={{ color: 'var(--text-tertiary)' }}>Tüm zamanlar</span>} />
            <KPICard label="KRİTİK STOK"     value={kritikStokVerisi.length} footer={kritikStokVerisi.length > 0 ? <><AlertTriangle size={12} strokeWidth={1.5} style={{ color: 'var(--danger)' }} /><span style={{ color: 'var(--danger)' }}>Tükeniyor</span></> : <span style={{ color: 'var(--text-tertiary)' }}>Yok</span>} />
            <KPICard label="MÜŞTERİ ÇIKIŞI"  value={stokHareketler.filter(h => h.tur === 'cikis').length} />
          </div>

          <ChartCard title="En Çok Çıkış Yapılan Ürünler">
            {stokCikisVerisi().length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stokCikisVerisi()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                  <XAxis dataKey="ad" tick={chartAxisStyle} />
                  <YAxis tick={chartAxisStyle} />
                  <Tooltip {...chartTooltipStyle} />
                  <Bar dataKey="miktar" fill="var(--warning)" radius={[2, 2, 0, 0]} name="Miktar" />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState title="Henüz çıkış verisi yok" />}
          </ChartCard>

          {kritikStokVerisi.length > 0 && (
            <Card padding={0}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px', borderBottom: '1px solid var(--border-default)' }}>
                <AlertTriangle size={16} strokeWidth={1.5} style={{ color: 'var(--danger)' }} />
                <p className="t-body-strong" style={{ color: 'var(--danger)' }}>Kritik Stok Uyarıları</p>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>
                  <thead>
                    <tr>
                      {[
                        { l: 'Stok Kodu' }, { l: 'Ürün Adı' },
                        { l: 'Mevcut', a: 'right' }, { l: 'Min.', a: 'right' }, { l: 'Birim', a: 'right' },
                      ].map((h, i) => (
                        <th key={i} style={{
                          background: 'var(--surface-sunken)',
                          padding: '10px 20px', textAlign: h.a || 'left',
                          font: '600 11px/16px var(--font-sans)',
                          color: 'var(--text-tertiary)',
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                          borderBottom: '1px solid var(--border-default)',
                        }}>{h.l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {kritikStokVerisi.map(u => {
                      const bakiye = stokHareketler.filter(h => h.stokKodu === u.stokKodu).reduce((s, h) => {
                        if (h.tur === 'giris' || h.tur === 'transfer_giris') return s + Number(h.miktar)
                        return s - Number(h.miktar)
                      }, 0)
                      return (
                        <tr key={u.id} style={{ background: 'var(--danger-soft)' }}>
                          <td style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-default)', font: '500 12px/16px var(--font-mono)', color: 'var(--text-secondary)' }}>{u.stokKodu}</td>
                          <td style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-default)', font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{u.stokAdi}</td>
                          <td style={{ padding: '12px 20px', textAlign: 'right', borderBottom: '1px solid var(--border-default)', color: 'var(--danger)', fontWeight: 600 }}>{bakiye.toFixed(0)}</td>
                          <td style={{ padding: '12px 20px', textAlign: 'right', borderBottom: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>{u.minStok}</td>
                          <td style={{ padding: '12px 20px', textAlign: 'right', borderBottom: '1px solid var(--border-default)', color: 'var(--text-tertiary)' }}>{u.birim}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

export default Raporlar
