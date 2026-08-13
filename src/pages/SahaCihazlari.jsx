// Saha Cihazları — sahaya takılı TÜM cihazların toplu görünümü (13.08.2026).
//
// Eskiden tek yol müşteri detayındaki "Müşteri Cihazları" bölümüydü; sahanın
// tamamını görmek için müşteri müşteri gezmek gerekiyordu.
//
// ⚠️ İKİ SEKME, BİRLEŞTİRME YOK (kullanıcı kararı: "karışıklık olmamalı"):
//   • Takılan Ürünler → stok_kalemleri (S/N ile müşteriye bağlananlar)
//   • Cihaz Envanteri → musteri_cihazlari (müşteri kartına elle girilenler;
//     müşteri detayındaki bölümün toplu hâli — birebir aynı veri)
// Müşteri detayı DEĞİŞMEDİ; bu sayfa yalnız okur.

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { MonitorSmartphone, ExternalLink, RefreshCw } from 'lucide-react'
import { SkeletonList } from '../components/Skeleton'
import Sayfalama from '../components/Sayfalama'
import CustomSelect from '../components/CustomSelect'
import { Button, SearchInput, Card, Badge, CodeBadge, KPICard, EmptyState } from '../components/ui'
import { trKelimeEslesir } from '../lib/trArama'
import { takilanUrunleriGetir, envanterCihazlariniGetir } from '../services/sahaCihazService'

const fmtTarih = (t) => (t ? new Date(t).toLocaleDateString('tr-TR') : '—')

const SEKMELER = [
  { id: 'takilan', label: 'Takılan Ürünler (S/N)' },
  { id: 'envanter', label: 'Cihaz Envanteri' },
]

const SAYFA_BOYUTU = 50

export default function SahaCihazlari() {
  const navigate = useNavigate()
  const [sekme, setSekme] = useState('takilan')
  const [takilan, setTakilan] = useState([])
  const [envanter, setEnvanter] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [arama, setArama] = useState('')
  const [musteriFiltre, setMusteriFiltre] = useState('')
  const [durumFiltre, setDurumFiltre] = useState('')
  const [sayfa, setSayfa] = useState(1)

  // İlk yüklemede yukleniyor zaten true — effect içinde senkron setState yok.
  // "Yenile" butonu event handler olduğu için orada serbest.
  const veriCek = () =>
    Promise.all([takilanUrunleriGetir(), envanterCihazlariniGetir()])
      .then(([t, e]) => { setTakilan(t); setEnvanter(e) })
      .finally(() => setYukleniyor(false))
  useEffect(() => { veriCek() }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  const yukle = () => { setYukleniyor(true); veriCek() }

  // Filtre değişince ilk sayfaya dön — render sırasında düzeltme deseni
  // (effect içinde senkron setState lint'te yasak)
  const filtreAnahtari = `${sekme}|${arama}|${musteriFiltre}|${durumFiltre}`
  const [oncekiFiltre, setOncekiFiltre] = useState(filtreAnahtari)
  if (oncekiFiltre !== filtreAnahtari) {
    setOncekiFiltre(filtreAnahtari)
    setSayfa(1)
  }

  const kaynak = sekme === 'takilan' ? takilan : envanter

  // Müşteri filtresi seçenekleri — aktif sekmenin verisinden
  const musteriler = useMemo(
    () => [...new Set(kaynak.map(k => k.musteriAd).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
    [kaynak]
  )

  const filtreli = useMemo(() => kaynak.filter(k => {
    if (musteriFiltre && k.musteriAd !== musteriFiltre) return false
    if (durumFiltre && (k.durum || '') !== durumFiltre) return false
    if (arama) {
      const hedef = sekme === 'takilan'
        ? [k.seriNo, k.stokKodu, k.barkod, k.marka, k.model, k.musteriAd, k.lokasyonAd]
        : [k.seriNo, k.cihazAdi, k.marka, k.model, k.ipAdresi, k.musteriAd, k.lokasyon]
      if (!trKelimeEslesir(hedef.filter(Boolean).join(' '), arama)) return false
    }
    return true
  }), [kaynak, sekme, arama, musteriFiltre, durumFiltre])

  const toplamSayfa = Math.max(1, Math.ceil(filtreli.length / SAYFA_BOYUTU))
  const aktifSayfa = Math.min(sayfa, toplamSayfa)
  const gorunen = filtreli.slice((aktifSayfa - 1) * SAYFA_BOYUTU, aktifSayfa * SAYFA_BOYUTU)

  // Durum filtresi seçenekleri — sekmenin gerçek verisinden (uydurma liste değil)
  const durumlar = useMemo(
    () => [...new Set(kaynak.map(k => k.durum).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
    [kaynak]
  )

  const arizali = envanter.filter(c => c.durum === 'arizali').length

  const musteriGit = (id) => { if (id) navigate(`/musteriler/${id}`) }

  if (yukleniyor) return <div style={{ padding: 24 }}><SkeletonList /></div>

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <p className="t-caption" style={{ margin: 0, color: 'var(--text-tertiary)' }}>
          Sahaya takılı cihazların toplu görünümü. Kayıt eklemek/düzenlemek için müşteri kartını kullanın —
          bu sayfa yalnız listeler.
        </p>
        <Button variant="secondary" size="sm" iconLeft={<RefreshCw size={13} strokeWidth={1.5} />} onClick={yukle}>
          Yenile
        </Button>
      </div>

      {/* Sayaç şeridi — kutular sekmelerin kaynağını birebir sayar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <KPICard label="Takılan Ürün (S/N)" value={takilan.length} kompakt />
        <KPICard label="Elle Girilen Cihaz" value={envanter.length} kompakt />
        <KPICard label="Müşteri" value={new Set([...takilan, ...envanter].map(k => k.musteriId).filter(Boolean)).size} kompakt />
        <KPICard label="Arızalı (envanter)" value={arizali} kompakt />
      </div>

      {/* Sekmeler — FaturaTalepleri ile aynı alt-çizgi deseni */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border-default)', flexWrap: 'wrap' }}>
        {SEKMELER.map(s => {
          const aktif = sekme === s.id
          return (
            <button key={s.id} type="button" onClick={() => setSekme(s.id)}
              style={{
                padding: '10px 14px', marginBottom: -1,
                background: 'transparent', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${aktif ? 'var(--brand-primary)' : 'transparent'}`,
                color: aktif ? 'var(--brand-primary)' : 'var(--text-secondary)',
                font: '600 11px/16px var(--font-sans)',
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
              {s.label} ({s.id === 'takilan' ? takilan.length : envanter.length})
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 240, maxWidth: 420 }}>
          <SearchInput
            value={arama}
            onChange={e => setArama(e.target.value)}
            placeholder={sekme === 'takilan'
              ? 'Seri no, stok kodu, marka, müşteri, lokasyon ara…'
              : 'Cihaz adı, seri no, IP, müşteri, lokasyon ara…'}
          />
        </div>
        <CustomSelect value={musteriFiltre} onChange={e => setMusteriFiltre(e.target.value)} style={{ minWidth: 200 }}>
          <option value="">Tüm Müşteriler</option>
          {musteriler.map(m => <option key={m} value={m}>{m}</option>)}
        </CustomSelect>
        <CustomSelect value={durumFiltre} onChange={e => setDurumFiltre(e.target.value)} style={{ minWidth: 140 }}>
          <option value="">Tüm Durumlar</option>
          {durumlar.map(d => <option key={d} value={d}>{d}</option>)}
        </CustomSelect>
      </div>

      {gorunen.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MonitorSmartphone size={36} strokeWidth={1.2} />}
            title={arama || musteriFiltre || durumFiltre ? 'Filtreyle eşleşen kayıt yok' : 'Kayıt yok'}
            description={sekme === 'takilan'
              ? 'Depodan S/N ile müşteriye bağlanan ürünler burada listelenir.'
              : 'Müşteri kartından elle eklenen cihazlar burada listelenir.'}
          />
        </Card>
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            {sekme === 'takilan' ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', font: '400 12.5px/18px var(--font-sans)' }}>
                <thead>
                  <tr style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', textAlign: 'left' }}>
                    {['Seri No', 'Ürün', 'Müşteri', 'Lokasyon', 'Durum', 'Takılma', 'Garanti', ''].map((h, i) => (
                      <th key={i} style={{ ...hucre, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gorunen.map(k => (
                    <tr key={k.id}
                      style={{ cursor: 'pointer', transition: 'background 120ms' }}
                      onClick={() => musteriGit(k.musteriId)}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-sunken)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      <td style={hucre}><CodeBadge>{k.seriNo || k.barkod || '—'}</CodeBadge></td>
                      <td style={{ ...hucre, fontWeight: 500 }}>
                        {[k.marka, k.model].filter(Boolean).join(' ') || k.stokKodu || '—'}
                        {k.stokKodu && (
                          <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> · {k.stokKodu}</span>
                        )}
                      </td>
                      <td style={hucre}>{k.musteriAd}</td>
                      <td style={hucre}>{k.lokasyonAd || '—'}</td>
                      <td style={hucre}>{k.durum ? <Badge tone={k.durum === 'sahada' ? 'aktif' : 'neutral'}>{k.durum}</Badge> : '—'}</td>
                      <td style={{ ...hucre, whiteSpace: 'nowrap' }}>{fmtTarih(k.takilmaTarihi)}</td>
                      <td style={{ ...hucre, whiteSpace: 'nowrap' }}>{fmtTarih(k.garantiBitisTarihi)}</td>
                      <td style={{ ...hucre, textAlign: 'right' }}>
                        <ExternalLink size={13} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', font: '400 12.5px/18px var(--font-sans)' }}>
                <thead>
                  <tr style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', textAlign: 'left' }}>
                    {['Cihaz', 'Seri No', 'IP', 'Müşteri', 'Lokasyon', 'Durum', 'Eklenme', ''].map((h, i) => (
                      <th key={i} style={{ ...hucre, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gorunen.map(c => (
                    <tr key={c.id}
                      style={{ cursor: 'pointer', transition: 'background 120ms' }}
                      onClick={() => musteriGit(c.musteriId)}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-sunken)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      <td style={{ ...hucre, fontWeight: 500 }}>
                        {c.cihazAdi || [c.marka, c.model].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td style={hucre}>{c.seriNo ? <CodeBadge>{c.seriNo}</CodeBadge> : '—'}</td>
                      <td style={hucre}>{c.ipAdresi || '—'}</td>
                      <td style={hucre}>{c.musteriAd}</td>
                      <td style={hucre}>{c.lokasyon || '—'}</td>
                      <td style={hucre}>
                        {c.durum === 'arizali'
                          ? <span title={c.arizaNedeni || ''}><Badge tone="kayip">arızalı</Badge></span>
                          : <Badge tone="aktif">{c.durum || 'aktif'}</Badge>}
                      </td>
                      <td style={{ ...hucre, whiteSpace: 'nowrap' }}>{fmtTarih(c.olusturmaTarih)}</td>
                      <td style={{ ...hucre, textAlign: 'right' }}>
                        <ExternalLink size={13} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <Sayfalama
            aktifSayfa={aktifSayfa}
            toplamSayfa={toplamSayfa}
            toplam={filtreli.length}
            sayfaBoyutu={SAYFA_BOYUTU}
            setSayfa={setSayfa}
            setSayfaBoyutu={() => {}}
            secenekler={[SAYFA_BOYUTU]}
          />
          <p className="t-caption" style={{ margin: '8px 12px 4px', color: 'var(--text-tertiary)' }}>
            Satıra tıklayınca müşteri kartı açılır.
          </p>
        </Card>
      )}
    </div>
  )
}

const hucre = { padding: '9px 12px', borderBottom: '1px solid var(--border-default)' }
