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
import SiparisAnalizTab from '../components/SiparisAnalizTab'
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
  const yonetimGorur = /\b(oğuz|oguz|ali|ferdi)\b/i.test(benKullanici?.ad ?? '')
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
    ...(yonetimGorur ? [{ id: 'siparis_analiz', isim: 'Sipariş Analizi' }] : []),
    ...(yonetimGorur ? [{ id: 'mesai', isim: 'Mesai' }] : []),
    ...(yonetimGorur ? [{ id: 'arac_foto', isim: 'Araç Foto' }] : []),
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

      {aktifSekme === 'siparis_analiz' && <SiparisAnalizTab />}
      {aktifSekme === 'mesai' && <MesaiRaporTab />}
      {aktifSekme === 'arac_foto' && <AracFotoRaporTab />}
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

  // Blob'u konum seçici ile kaydet, olmazsa normal indirmeye düş
  const kaydet = async (blob, adi, mime, aciklama) => {
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: adi,
          types: [{ description: aciklama, accept: { [mime]: ['.' + adi.split('.').pop()] } }],
        })
        const w = await handle.createWritable()
        await w.write(blob)
        await w.close()
        return
      } catch (e) {
        if (e?.name === 'AbortError') return   // kullanıcı iptal etti
      }
    }
    // Fallback
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = adi
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const excelIndir = async () => {
    const XLSX = await import('xlsx')
    const veri = tabloVeri()
    const ws = XLSX.utils.json_to_sheet(veri)
    ws['!cols'] = [ { wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 40 } ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Mesai')
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    await kaydet(blob, `${dosyaAdi()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel dosyası')
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
        <td class="znapdf-num">${i + 1}</td>
        <td>${r.Tarih}</td>
        <td><b>${r.Personel}</b>${r.Unvan ? `<br><span class="znapdf-dim">${r.Unvan}</span>` : ''}</td>
        <td>${r.Giris}</td>
        <td class="${r.Cikis === 'devam' ? 'znapdf-aktif' : ''}">${r.Cikis}</td>
        <td><b>${r.Sure}</b></td>
        <td>${r.MesafeM !== '' && r.MesafeM != null ? r.MesafeM + ' m' : '—'}</td>
        <td class="znapdf-not">${(r.Not || '').replace(/</g, '&lt;')}</td>
      </tr>`).join('')

    // NOT: Tüm CSS .znapdf-root altında scope'lu — sayfaya sızmayı engeller.
    const html = `
      <style>
        .znapdf-root, .znapdf-root * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .znapdf-root {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
          color: #0f172a; padding: 24px; font-size: 11px; line-height: 1.5; background: #fff;
        }
        .znapdf-root .znapdf-header {
          display: flex; justify-content: space-between; align-items: center;
          padding-bottom: 16px; border-bottom: 3px solid #1e5aa8; margin-bottom: 18px;
        }
        .znapdf-root .znapdf-brand { display: flex; align-items: center; gap: 12px; }
        .znapdf-root .znapdf-logo { width: 52px; height: 52px; object-fit: contain; border-radius: 8px; }
        .znapdf-root .znapdf-brand-text h1 { margin: 0; font-size: 18px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px; }
        .znapdf-root .znapdf-brand-text p { margin: 2px 0 0; font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; }
        .znapdf-root .znapdf-tip { text-align: right; }
        .znapdf-root .znapdf-tip .znapdf-buyuk { font-size: 16px; font-weight: 700; color: #1e5aa8; letter-spacing: -0.2px; }
        .znapdf-root .znapdf-tip .znapdf-kucuk { font-size: 10px; color: #64748b; margin-top: 2px; }
        .znapdf-root .znapdf-meta {
          display: flex; gap: 24px; padding: 10px 14px; background: #eff6ff;
          border-left: 3px solid #1e5aa8; border-radius: 4px; margin-bottom: 14px;
          font-size: 11px;
        }
        .znapdf-root .znapdf-meta > div { display: flex; gap: 6px; align-items: baseline; }
        .znapdf-root .znapdf-meta .znapdf-label { color: #64748b; }
        .znapdf-root .znapdf-meta .znapdf-val { color: #0f172a; font-weight: 600; }
        .znapdf-root .znapdf-tbl { width: 100%; border-collapse: collapse; font-size: 10.5px; }
        .znapdf-root .znapdf-tbl thead th {
          background: #1e5aa8; color: #fff; text-align: left;
          padding: 8px 6px; font-weight: 600; font-size: 10px;
          text-transform: uppercase; letter-spacing: 0.4px;
        }
        .znapdf-root .znapdf-tbl thead th:first-child { border-top-left-radius: 6px; }
        .znapdf-root .znapdf-tbl thead th:last-child { border-top-right-radius: 6px; }
        .znapdf-root .znapdf-tbl tbody td {
          padding: 7px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top;
        }
        .znapdf-root .znapdf-tbl tbody tr:nth-child(even) td { background: #f8fafc; }
        .znapdf-root .znapdf-num { color: #94a3b8; font-size: 9px; font-weight: 600; }
        .znapdf-root .znapdf-dim { color: #64748b; font-size: 9px; }
        .znapdf-root .znapdf-aktif { color: #10b981; font-weight: 700; }
        .znapdf-root .znapdf-not { color: #64748b; font-size: 9.5px; max-width: 220px; }
        .znapdf-root .znapdf-bos { text-align: center; padding: 40px !important; color: #94a3b8; font-style: italic; }
        .znapdf-root .znapdf-footer {
          margin-top: 20px; padding-top: 12px; border-top: 1px solid #e2e8f0;
          display: flex; justify-content: space-between; align-items: center;
          font-size: 9px; color: #94a3b8;
        }
      </style>
      <div class="znapdf-root">
        <div class="znapdf-header">
          <div class="znapdf-brand">
            ${logoDataUri ? `<img src="${logoDataUri}" class="znapdf-logo" alt="ZNA">` : ''}
            <div class="znapdf-brand-text">
              <h1>ZNA Teknoloji</h1>
              <p>Mesai Takip Sistemi</p>
            </div>
          </div>
          <div class="znapdf-tip">
            <div class="znapdf-buyuk">Mesai Raporu</div>
            <div class="znapdf-kucuk">${donem}</div>
          </div>
        </div>

        <div class="znapdf-meta">
          <div><span class="znapdf-label">Personel:</span> <span class="znapdf-val">${secili ? secili.ad : 'Tüm personel'}</span></div>
          <div><span class="znapdf-label">Kayıt:</span> <span class="znapdf-val">${kayitlar.length}</span></div>
          ${aktifKayit ? `<div><span class="znapdf-label">Aktif mesai:</span> <span class="znapdf-val">${aktifKayit}</span></div>` : ''}
          <div><span class="znapdf-label">Rapor tarihi:</span> <span class="znapdf-val">${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span></div>
        </div>

        <table class="znapdf-tbl">
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
          <tbody>${satirlar || '<tr><td colspan="8" class="znapdf-bos">Bu dönemde kayıt bulunamadı.</td></tr>'}</tbody>
        </table>

        <div class="znapdf-footer">
          <div>ZNA Teknoloji · Mesai Takip · Otomatik oluşturuldu</div>
          <div>talep.znateknoloji.com</div>
        </div>
      </div>
    `

    // HTML'i off-screen render edip html2pdf ile PDF blob al, sonra konum seçici ile kaydet.
    const html2pdf = (await import('html2pdf.js')).default
    const kap = document.createElement('div')
    kap.style.cssText = 'position:fixed;left:-9999px;top:0;width:1100px;background:#fff;'
    kap.innerHTML = html
    document.body.appendChild(kap)
    try {
      const pdfBlob = await html2pdf().set({
        margin: [8, 8, 8, 8],
        filename: `${dosyaAdi()}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#fff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      }).from(kap).outputPdf('blob')
      await kaydet(pdfBlob, `${dosyaAdi()}.pdf`, 'application/pdf', 'PDF dosyası')
    } finally {
      document.body.removeChild(kap)
    }
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

// —— Araç Foto raporu sekmesi ——————————————————————————————
const ARAC_BOLGELERI = [
  { id: 'on', ad: 'Ön' },
  { id: 'arka', ad: 'Arka' },
  { id: 'sol', ad: 'Sol Yan' },
  { id: 'sag', ad: 'Sağ Yan' },
  { id: 'kokpit', ad: 'Ön Konsol' },
  { id: 'ic', ad: 'Araç İçi' },
]

// TR saat dilimine göre 'YYYY-MM-DD'
const bugunTR = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date())
const NgunOnceTR = (n) => {
  const d = new Date(); d.setDate(d.getDate() - n)
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(d)
}

const ARALIKLAR = [
  { id: 'bugun',  isim: 'Bugün',       baslangic: bugunTR,       bitis: bugunTR },
  { id: '7gun',   isim: 'Son 7 Gün',   baslangic: () => NgunOnceTR(6),  bitis: bugunTR },
  { id: '30gun',  isim: 'Son 30 Gün',  baslangic: () => NgunOnceTR(29), bitis: bugunTR },
]

function AracFotoRaporTab() {
  const [aralik, setAralik] = useState('bugun')
  const [baslangic, setBaslangic] = useState(bugunTR)
  const [bitis, setBitis] = useState(bugunTR)
  const [aracFiltresi, setAracFiltresi] = useState('')
  const [teknisyenFiltresi, setTeknisyenFiltresi] = useState('')
  const [zamanFiltresi, setZamanFiltresi] = useState('')
  const [araclar, setAraclar] = useState([])
  const [teknisyenler, setTeknisyenler] = useState([])
  const [kayitlar, setKayitlar] = useState([])
  const [imzaMap, setImzaMap] = useState({})
  const [yukleniyor, setYukleniyor] = useState(false)
  const [buyukFoto, setBuyukFoto] = useState(null)   // { url, meta }

  useEffect(() => {
    supabase.from('sirket_araclari').select('id, plaka').eq('aktif', true).order('plaka')
      .then(({ data }) => setAraclar(data ?? []))
    supabase.from('kullanicilar').select('id, ad').contains('moduller', ['arac_foto_takip']).order('ad')
      .then(({ data }) => setTeknisyenler(data ?? []))
  }, [])

  const aralikSec = (id) => {
    const a = ARALIKLAR.find(x => x.id === id)
    if (!a) { setAralik('ozel'); return }
    setAralik(id); setBaslangic(a.baslangic()); setBitis(a.bitis())
  }

  useEffect(() => {
    setYukleniyor(true)
    let q = supabase.from('arac_foto_kayitlari')
      .select('id, arac_id, tarih, zaman, bolge, foto_url, cekim_zamani, teknisyen_id, sirket_araclari(plaka,marka,model), kullanicilar(ad)')
      .gte('tarih', baslangic)
      .lte('tarih', bitis)
      .order('tarih', { ascending: false })
      .order('cekim_zamani', { ascending: false })
    if (aracFiltresi) q = q.eq('arac_id', aracFiltresi)
    if (teknisyenFiltresi) q = q.eq('teknisyen_id', teknisyenFiltresi)
    if (zamanFiltresi) q = q.eq('zaman', zamanFiltresi)
    q.then(async ({ data }) => {
      setKayitlar(data ?? [])
      const imzalar = {}
      await Promise.all((data ?? []).filter(k => k.foto_url).map(async k => {
        const { data: s } = await supabase.storage.from('arac-fotolari').createSignedUrl(k.foto_url, 3600)
        if (s?.signedUrl) imzalar[k.foto_url] = s.signedUrl
      }))
      setImzaMap(imzalar)
      setYukleniyor(false)
    })
  }, [baslangic, bitis, aracFiltresi, teknisyenFiltresi, zamanFiltresi])

  // Grup: tarih → arac_id → zaman → bolge (yeni → eski)
  const gruplu = kayitlar.reduce((h, k) => {
    if (!h[k.tarih]) h[k.tarih] = {}
    if (!h[k.tarih][k.arac_id]) h[k.tarih][k.arac_id] = { arac: k.sirket_araclari, plaka: k.sirket_araclari?.plaka ?? '?', sabah: {}, aksam: {} }
    if (k.zaman === 'sabah') h[k.tarih][k.arac_id].sabah[k.bolge] = k
    if (k.zaman === 'aksam') h[k.tarih][k.arac_id].aksam[k.bolge] = k
    return h
  }, {})
  const tarihGruplari = Object.entries(gruplu).sort(([a], [b]) => b.localeCompare(a))
  const tarihGoster = iso => new Date(iso + 'T12:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' })

  return (
    <div>
      {/* Filtreler */}
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {ARALIKLAR.map(a => (
            <button key={a.id} onClick={() => aralikSec(a.id)}
              style={{
                padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                border: '1px solid ' + (aralik === a.id ? 'var(--brand-primary)' : 'var(--border-default)'),
                background: aralik === a.id ? 'var(--brand-primary)' : 'var(--surface-sunken)',
                color: aralik === a.id ? '#fff' : 'var(--text-primary)',
                cursor: 'pointer',
              }}>
              {a.isim}
            </button>
          ))}
          <button onClick={() => setAralik('ozel')}
            style={{
              padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
              border: '1px solid ' + (aralik === 'ozel' ? 'var(--brand-primary)' : 'var(--border-default)'),
              background: aralik === 'ozel' ? 'var(--brand-primary)' : 'var(--surface-sunken)',
              color: aralik === 'ozel' ? '#fff' : 'var(--text-primary)',
              cursor: 'pointer',
            }}>
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
          <div style={{ minWidth: 180 }}>
            <label style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Araç</label>
            <CustomSelect value={aracFiltresi} onChange={e => setAracFiltresi(e.target.value)}>
              <option value="">Tüm araçlar</option>
              {araclar.map(a => <option key={a.id} value={a.id}>{a.plaka}</option>)}
            </CustomSelect>
          </div>
          <div style={{ minWidth: 180 }}>
            <label style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Teknisyen</label>
            <CustomSelect value={teknisyenFiltresi} onChange={e => setTeknisyenFiltresi(e.target.value)}>
              <option value="">Tüm teknisyenler</option>
              {teknisyenler.map(t => <option key={t.id} value={t.id}>{t.ad}</option>)}
            </CustomSelect>
          </div>
          <div style={{ minWidth: 140 }}>
            <label style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Zaman</label>
            <CustomSelect value={zamanFiltresi} onChange={e => setZamanFiltresi(e.target.value)}>
              <option value="">Sabah + Akşam</option>
              <option value="sabah">Sabah</option>
              <option value="aksam">Akşam</option>
            </CustomSelect>
          </div>
        </div>
      </Card>

      {/* İçerik */}
      {yukleniyor ? (
        <Card>
          <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 20 }}>Yükleniyor…</p>
        </Card>
      ) : tarihGruplari.length === 0 ? (
        <Card>
          <EmptyState icon={<Package size={22} />} title="Kayıt yok" aciklama="Bu dönemde foto kaydı bulunamadı." />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {tarihGruplari.map(([tarih, aracMap]) => {
            const aracList = Object.entries(aracMap).sort(([, a], [, b]) => (a.plaka || '').localeCompare(b.plaka || ''))
            return (
              <div key={tarih}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, paddingLeft: 4 }}>
                  <div style={{ width: 4, height: 22, backgroundColor: 'var(--brand-primary)', borderRadius: 2 }} />
                  <span style={{ font: '700 16px/22px var(--font-sans)', color: 'var(--text-primary)', textTransform: 'capitalize' }}>{tarihGoster(tarih)}</span>
                  <span style={{ font: '400 12px/18px var(--font-sans)', color: 'var(--text-tertiary)' }}>· {aracList.length} araç</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {aracList.map(([aracId, g]) => (
                    <Card key={aracId}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                        <span style={{ font: '800 18px/24px var(--font-sans)', letterSpacing: 0.5, color: 'var(--text-primary)' }}>{g.plaka}</span>
                        {g.arac?.marka && <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>· {g.arac.marka} {g.arac.model}</span>}
                      </div>

                      {(['sabah', 'aksam']).map(zaman => {
                        if (zamanFiltresi && zamanFiltresi !== zaman) return null
                        const zamanKayit = g[zaman]
                        const dolu = Object.keys(zamanKayit).length
                        if (dolu === 0 && zamanFiltresi) return null
                        return (
                          <div key={zaman} style={{ marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                              <Badge tone={zaman === 'sabah' ? 'bilgi' : 'nötr'}>{zaman === 'sabah' ? 'Sabah' : 'Akşam'}</Badge>
                              <span style={{ font: '500 12px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>{dolu} / {ARAC_BOLGELERI.length} bölge</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                              {ARAC_BOLGELERI.map(b => {
                                const k = zamanKayit[b.id]
                                const url = k?.foto_url ? imzaMap[k.foto_url] : null
                                return (
                                  <div key={b.id}
                                    onClick={() => url && setBuyukFoto({ url, meta: { ...k, bolgeAd: b.ad, plaka: g.plaka, zaman } })}
                                    style={{
                                      aspectRatio: '4/3', borderRadius: 8, overflow: 'hidden',
                                      backgroundColor: 'var(--surface-sunken)',
                                      border: '1px solid var(--border-default)',
                                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                      cursor: url ? 'pointer' : 'default', position: 'relative',
                                    }}>
                                    {url ? (
                                      <>
                                        <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={b.ad} />
                                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '4px 6px', background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)', color: '#fff', font: '600 10px/14px var(--font-sans)' }}>
                                          {b.ad}
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <span style={{ font: '400 22px var(--font-sans)', color: 'var(--text-tertiary)' }}>—</span>
                                        <span style={{ font: '600 10px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>{b.ad}</span>
                                      </>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </Card>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Büyük foto modal */}
      {buyukFoto && (
        <div onClick={() => setBuyukFoto(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <img src={buyukFoto.url} style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 12 }} alt="" />
            <div style={{ background: 'rgba(255,255,255,0.06)', padding: '10px 14px', borderRadius: 10, color: '#fff', font: '500 13px/18px var(--font-sans)', textAlign: 'center' }}>
              <b>{buyukFoto.meta.plaka}</b> · {buyukFoto.meta.bolgeAd} · {buyukFoto.meta.zaman === 'sabah' ? 'Sabah' : 'Akşam'}
              <br />
              <span style={{ color: '#94a3b8', fontSize: 12 }}>
                {buyukFoto.meta.kullanicilar?.ad ?? '—'} · {new Date(buyukFoto.meta.cekim_zamani).toLocaleString('tr-TR')}
              </span>
            </div>
            <button onClick={() => setBuyukFoto(null)}
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Raporlar
