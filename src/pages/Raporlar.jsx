import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts'
import { X as XIcon, AlertTriangle, Package } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Clock, Download, FileSpreadsheet, FileText } from 'lucide-react'
import CustomSelect from '../components/CustomSelect'
import { SkeletonList } from '../components/Skeleton'
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
  const { kullanicilar, kullanici: benKullanici } = useAuth()
  const yonetimGorur = /\b(oğuz|oguz|ali)\b/i.test(benKullanici?.ad ?? '')
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
    ...(yonetimGorur ? [{ id: 'mesai', isim: 'Mesai' }] : []),
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

  // Ortalama tamamlama süresi (gün) — tamamlanmis + tamamlanma_tarihi dolu görevlerden.
  // Süre = tamamlanma_tarihi - olusturma_tarih. NULL olanlar (legacy 11 görev) hariç.
  const personelTamamlamaSuresi = kullanicilar.map(k => {
    const kidStr = k.id?.toString()
    const tamamlananlar = gorevler.filter(g => {
      if (g.durum !== 'tamamlandi' || !g.tamamlanmaTarihi || !g.olusturmaTarih) return false
      // atanan (text) veya atanan_id (bigint) hangisi doluysa
      const gAtanan = g.atanan?.toString() ?? g.atananId?.toString()
      return gAtanan === kidStr
    })
    if (tamamlananlar.length === 0) return null
    const toplamMs = tamamlananlar.reduce((s, g) =>
      s + (new Date(g.tamamlanmaTarihi) - new Date(g.olusturmaTarih)), 0
    )
    const ortMs = toplamMs / tamamlananlar.length
    const ortSaat = ortMs / (1000 * 60 * 60)
    return {
      isim: k.ad.split(' ')[0], ad: k.ad,
      adet: tamamlananlar.length,
      ortSaat: Math.round(ortSaat * 10) / 10,   // 1 ondalık
      etiket: `${(Math.round(ortSaat * 10) / 10)} saat`,
    }
  }).filter(Boolean).sort((a, b) => a.ortSaat - b.ortSaat)

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

  if (yukleniyor) return <SkeletonList />

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

          {/* Ortalama tamamlama süresi — açılıştan tamamlanmaya kadar geçen gün */}
          {seciliPersonel === 'hepsi' && (
            <Card padding={0}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border-default)' }}>
                <div>
                  <p className="t-body-strong" style={{ margin: 0 }}>Ortalama Tamamlama Süresi</p>
                  <p className="t-caption" style={{ marginTop: 2 }}>Görev açılışından tamamlanmasına kadar geçen ortalama süre</p>
                </div>
                <Badge tone="lead">{personelTamamlamaSuresi.length} personel</Badge>
              </div>
              {personelTamamlamaSuresi.length === 0 ? (
                <div style={{ padding: 40 }}>
                  <EmptyState title="Henüz veri yok" aciklama="Yeni tamamlanan görevler biriktikçe burada görünecek." />
                </div>
              ) : (
                <>
                  <div style={{ padding: '20px 20px 12px' }}>
                    <ResponsiveContainer width="100%" height={Math.max(180, personelTamamlamaSuresi.length * 44)}>
                      <BarChart layout="vertical" data={personelTamamlamaSuresi} margin={{ left: 10, right: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" horizontal={false} />
                        <XAxis type="number" tick={chartAxisStyle} tickFormatter={v => `${v}s`} />
                        <YAxis type="category" dataKey="isim" tick={chartAxisStyle} width={100} />
                        <Tooltip {...chartTooltipStyle} formatter={(val, _n, item) => [item?.payload?.etiket || `${val} saat`, 'Ortalama']} />
                        <Bar dataKey="ortSaat" fill="var(--brand-primary)" radius={[0, 4, 4, 0]} name="Ortalama süre (saat)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ borderTop: '1px solid var(--border-default)' }}>
                    {personelTamamlamaSuresi.map(p => (
                      <div key={p.ad} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 20px',
                        borderBottom: '1px solid var(--border-default)',
                      }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={p.ad} size="xs" />
                          <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{p.ad}</span>
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
                          <span className="t-caption">{p.adet} tamamlanan</span>
                          <span style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--brand-primary)', fontVariantNumeric: 'tabular-nums' }}>
                            {p.etiket}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
          )}

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

      {aktifSekme === 'mesai' && <MesaiRaporTab />}
    </div>
  )
}

// —— Mesai raporu sekmesi ——————————————————————————————
const isoBugun = () => new Date().toISOString().slice(0, 10)
const isoNGunOnce = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
const isoHaftaBasi = () => {
  const d = new Date(); const gun = d.getDay() || 7
  d.setDate(d.getDate() - gun + 1); return d.toISOString().slice(0, 10)
}
const isoAyBasi = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }

const HAZIR_ARALIKLAR = [
  { id: 'bugun',  isim: 'Bugün',    baslangic: isoBugun,       bitis: isoBugun },
  { id: 'hafta',  isim: 'Bu Hafta', baslangic: isoHaftaBasi,   bitis: isoBugun },
  { id: 'ay',     isim: 'Bu Ay',    baslangic: isoAyBasi,      bitis: isoBugun },
  { id: '30gun',  isim: 'Son 30 Gün', baslangic: () => isoNGunOnce(30), bitis: isoBugun },
]

function MesaiRaporTab() {
  const [aralik, setAralik] = useState('hafta')
  const [baslangic, setBaslangic] = useState(isoHaftaBasi)
  const [bitis, setBitis] = useState(isoBugun)
  const [personelListe, setPersonelListe] = useState([])
  const [seciliPersonelId, setSeciliPersonelId] = useState('')  // '' = tümü
  const [kayitlar, setKayitlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(false)

  useEffect(() => {
    supabase.from('kullanicilar')
      .select('id, ad, unvan')
      .contains('moduller', ['mesai_takip'])
      .order('ad')
      .then(({ data }) => setPersonelListe(data ?? []))
  }, [])

  const aralikSec = (id) => {
    const a = HAZIR_ARALIKLAR.find(x => x.id === id)
    if (!a) { setAralik('ozel'); return }
    setAralik(id)
    setBaslangic(a.baslangic())
    setBitis(a.bitis())
  }

  useEffect(() => {
    setYukleniyor(true)
    let q = supabase.from('mesai_kayitlari')
      .select('id, kullanici_id, giris_zamani, cikis_zamani, sure_dakika, giris_mesafe_m, not_, kullanicilar(ad, unvan)')
      .gte('giris_zamani', baslangic + 'T00:00:00')
      .lte('giris_zamani', bitis + 'T23:59:59')
      .order('giris_zamani', { ascending: false })
    if (seciliPersonelId) q = q.eq('kullanici_id', seciliPersonelId)
    q.then(({ data }) => { setKayitlar(data ?? []); setYukleniyor(false) })
  }, [baslangic, bitis, seciliPersonelId])

  const sureGoster = dk => {
    if (dk == null) return 'devam'
    const s = String(Math.floor(dk / 60)).padStart(2, '0')
    const m = String(dk % 60).padStart(2, '0')
    return `${s}:${m}`
  }
  const saatGoster = iso => iso ? new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—'
  const tarihGoster = iso => new Date(iso).toLocaleDateString('tr-TR')

  const dosyaAdi = () => `mesai-${baslangic}_${bitis}`
  const tabloVeri = () => kayitlar.map(k => ({
    Tarih: tarihGoster(k.giris_zamani),
    Personel: k.kullanicilar?.ad ?? '',
    Unvan: k.kullanicilar?.unvan ?? '',
    Giris: saatGoster(k.giris_zamani),
    Cikis: k.cikis_zamani ? saatGoster(k.cikis_zamani) : 'devam',
    Sure: sureGoster(k.sure_dakika),
    MesafeM: k.giris_mesafe_m ?? '',
    Not: k.not_ ?? '',
  }))

  const excelIndir = async () => {
    const XLSX = await import('xlsx')
    const veri = tabloVeri()
    const ws = XLSX.utils.json_to_sheet(veri)
    ws['!cols'] = [ { wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 40 } ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Mesai')
    XLSX.writeFile(wb, `${dosyaAdi()}.xlsx`)
  }

  const pdfIndir = async () => {
    const secili = personelListe.find(p => String(p.id) === String(seciliPersonelId))
    const donem = `${tarihGoster(baslangic + 'T00:00:00')} — ${tarihGoster(bitis + 'T00:00:00')}`
    const veri = tabloVeri()

    const aktifKayit = kayitlar.filter(k => !k.cikis_zamani).length

    // Logo'yu data URI'ye dönüştür (blob URL sayfası kendi origin'inden asset çekemez)
    let logoDataUri = ''
    try {
      const r = await fetch('/logo.jpeg')
      const b = await r.blob()
      logoDataUri = await new Promise(res => {
        const fr = new FileReader()
        fr.onloadend = () => res(fr.result)
        fr.readAsDataURL(b)
      })
    } catch {}

    const satirlar = veri.map((r, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${r.Tarih}</td>
        <td><b>${r.Personel}</b>${r.Unvan ? `<br><span class="dim">${r.Unvan}</span>` : ''}</td>
        <td>${r.Giris}</td>
        <td class="${r.Cikis === 'devam' ? 'aktif' : ''}">${r.Cikis}</td>
        <td><b>${r.Sure}</b></td>
        <td>${r.MesafeM !== '' && r.MesafeM != null ? r.MesafeM + ' m' : '—'}</td>
        <td class="not">${(r.Not || '').replace(/</g, '&lt;')}</td>
      </tr>`).join('')

    const html = `<!doctype html><html lang="tr"><head>
      <meta charset="utf-8">
      <title>ZNA · Mesai Raporu · ${donem}</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
          color: #0f172a; margin: 0; padding: 24px; font-size: 11px; line-height: 1.5;
        }

        /* — Header — */
        .header {
          display: flex; justify-content: space-between; align-items: center;
          padding-bottom: 16px; border-bottom: 3px solid #1e5aa8; margin-bottom: 18px;
        }
        .brand { display: flex; align-items: center; gap: 12px; }
        .logo { width: 52px; height: 52px; object-fit: contain; border-radius: 8px; }
        .brand-text h1 { margin: 0; font-size: 18px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px; }
        .brand-text p { margin: 2px 0 0; font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; }
        .rapor-tipi {
          text-align: right;
        }
        .rapor-tipi .buyuk {
          font-size: 16px; font-weight: 700; color: #1e5aa8; letter-spacing: -0.2px;
        }
        .rapor-tipi .kucuk { font-size: 10px; color: #64748b; margin-top: 2px; }

        /* — Meta şerit — */
        .meta {
          display: flex; gap: 24px; padding: 10px 14px; background: #eff6ff;
          border-left: 3px solid #1e5aa8; border-radius: 4px; margin-bottom: 14px;
          font-size: 11px;
        }
        .meta > div { display: flex; gap: 6px; align-items: baseline; }
        .meta .label { color: #64748b; }
        .meta .val { color: #0f172a; font-weight: 600; }

        /* — Tablo — */
        table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
        thead th {
          background: #1e5aa8; color: #fff; text-align: left;
          padding: 8px 6px; font-weight: 600; font-size: 10px;
          text-transform: uppercase; letter-spacing: 0.4px;
        }
        thead th:first-child { border-top-left-radius: 6px; }
        thead th:last-child { border-top-right-radius: 6px; }
        tbody td {
          padding: 7px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top;
        }
        tbody tr:nth-child(even) td { background: #f8fafc; }
        .num { color: #94a3b8; font-size: 9px; font-weight: 600; }
        .dim { color: #64748b; font-size: 9px; }
        .aktif { color: #10b981; font-weight: 700; }
        .not { color: #64748b; font-size: 9.5px; max-width: 220px; }
        .bos { text-align: center; padding: 40px !important; color: #94a3b8; font-style: italic; }

        /* — Footer — */
        footer {
          margin-top: 20px; padding-top: 12px; border-top: 1px solid #e2e8f0;
          display: flex; justify-content: space-between; align-items: center;
          font-size: 9px; color: #94a3b8;
        }
        footer .sag { text-align: right; }

        @media print {
          body { padding: 0; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
        }
      </style>
    </head><body>
      <div class="header">
        <div class="brand">
          ${logoDataUri ? `<img src="${logoDataUri}" class="logo" alt="ZNA">` : ''}
          <div class="brand-text">
            <h1>ZNA Teknoloji</h1>
            <p>Mesai Takip Sistemi</p>
          </div>
        </div>
        <div class="rapor-tipi">
          <div class="buyuk">Mesai Raporu</div>
          <div class="kucuk">${donem}</div>
        </div>
      </div>

      <div class="meta">
        <div><span class="label">Personel:</span> <span class="val">${secili ? secili.ad : 'Tüm personel'}</span></div>
        <div><span class="label">Kayıt:</span> <span class="val">${kayitlar.length}</span></div>
        ${aktifKayit ? `<div><span class="label">Aktif mesai:</span> <span class="val">${aktifKayit}</span></div>` : ''}
        <div><span class="label">Rapor tarihi:</span> <span class="val">${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span></div>
      </div>

      <table>
        <thead><tr>
          <th style="width:32px">#</th>
          <th>Tarih</th>
          <th>Personel</th>
          <th>Giriş</th>
          <th>Çıkış</th>
          <th>Süre</th>
          <th>Mesafe</th>
          <th>Not</th>
        </tr></thead>
        <tbody>${satirlar || '<tr><td colspan="8" class="bos">Bu dönemde kayıt bulunamadı.</td></tr>'}</tbody>
      </table>

      <footer>
        <div>ZNA Teknoloji · Mesai Takip · Otomatik oluşturuldu</div>
        <div class="sag">talep.znateknoloji.com</div>
      </footer>

      <script>window.onload = () => setTimeout(() => window.print(), 300)</script>
    </body></html>`

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank', 'width=1200,height=800')
    if (!w) { alert('Pop-up engellendi. Tarayıcı ayarlarından bu site için izin ver.'); URL.revokeObjectURL(url); return }
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  return (
    <Card>
      {/* Üst şerit: aralık chip'leri + personel + export butonları */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {HAZIR_ARALIKLAR.map(a => (
            <button
              key={a.id}
              onClick={() => aralikSec(a.id)}
              style={{
                padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                border: '1px solid ' + (aralik === a.id ? 'var(--brand-primary)' : 'var(--border-default)'),
                background: aralik === a.id ? 'var(--brand-primary)' : 'var(--surface-sunken)',
                color: aralik === a.id ? '#fff' : 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              {a.isim}
            </button>
          ))}
          <button
            onClick={() => setAralik('ozel')}
            style={{
              padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
              border: '1px solid ' + (aralik === 'ozel' ? 'var(--brand-primary)' : 'var(--border-default)'),
              background: aralik === 'ozel' ? 'var(--brand-primary)' : 'var(--surface-sunken)',
              color: aralik === 'ozel' ? '#fff' : 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            Özel
          </button>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          {aralik === 'ozel' && (
            <>
              <div>
                <label style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Başlangıç</label>
                <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)}
                  style={{ display: 'block', marginTop: 4, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--surface-sunken)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Bitiş</label>
                <input type="date" value={bitis} onChange={e => setBitis(e.target.value)}
                  style={{ display: 'block', marginTop: 4, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--surface-sunken)', color: 'var(--text-primary)' }} />
              </div>
            </>
          )}
          <div style={{ minWidth: 220 }}>
            <label style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Personel</label>
            <CustomSelect value={seciliPersonelId} onChange={e => setSeciliPersonelId(e.target.value)}>
              <option value="">Tüm personel</option>
              {personelListe.map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
            </CustomSelect>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" iconLeft={<FileSpreadsheet size={14} strokeWidth={1.5} />}
              onClick={excelIndir} disabled={kayitlar.length === 0}>
              Excel
            </Button>
            <Button variant="secondary" size="sm" iconLeft={<FileText size={14} strokeWidth={1.5} />}
              onClick={pdfIndir} disabled={kayitlar.length === 0}>
              PDF
            </Button>
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>
          <thead>
            <tr>
              {['Tarih', 'Personel', 'Giriş', 'Çıkış', 'Süre', 'Mesafe', 'Not'].map(h =>
                <th key={h} style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid var(--border-default)', font: '600 12px/16px var(--font-sans)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {yukleniyor && <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</td></tr>}
            {!yukleniyor && kayitlar.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>Bu dönemde kayıt yok.</td></tr>
            )}
            {kayitlar.map(k => {
              const aktif = !k.cikis_zamani
              const ofisDisi = (k.not_ ?? '').toLowerCase().includes('ofis dışı')
              return (
                <tr key={k.id} style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <td style={{ padding: '10px 8px', color: 'var(--text-secondary)', fontSize: 13 }}>{tarihGoster(k.giris_zamani)}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--text-primary)', fontSize: 13, fontWeight: 500 }}>
                    {k.kullanicilar?.ad}
                    {k.kullanicilar?.unvan && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 8, fontSize: 11 }}>· {k.kullanicilar.unvan}</span>}
                  </td>
                  <td style={{ padding: '10px 8px', color: 'var(--text-primary)', fontSize: 13 }}>{saatGoster(k.giris_zamani)}</td>
                  <td style={{ padding: '10px 8px', color: aktif ? 'var(--success)' : 'var(--text-primary)', fontSize: 13, fontWeight: aktif ? 600 : 400 }}>
                    {aktif ? 'devam' : saatGoster(k.cikis_zamani)}
                  </td>
                  <td style={{ padding: '10px 8px', color: 'var(--text-primary)', fontSize: 13 }}>{sureGoster(k.sure_dakika)}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--text-tertiary)', fontSize: 12 }}>
                    {k.giris_mesafe_m != null ? `${k.giris_mesafe_m} m` : '—'}
                  </td>
                  <td style={{ padding: '10px 8px', fontSize: 11 }}>
                    {ofisDisi ? <span style={{ color: 'var(--warning)', fontWeight: 600 }}>⚠ {k.not_}</span> : <span style={{ color: 'var(--text-tertiary)' }}>{k.not_ ?? ''}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export default Raporlar
