import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Boxes, Plus, AlertTriangle, Clock, CheckCircle, Wrench,
  FileWarning, FileCheck, ArrowUpRight,
} from 'lucide-react'
import {
  Button, Card, EmptyState, Badge,
  Table, THead, TBody, TR, TH, TD,
} from '../components/ui'
import { demoCihazlariGetir } from '../services/demoService'
import { musterileriGetir } from '../services/musteriService'
import { trContains } from '../lib/trSearch'
import { SkeletonList } from '../components/Skeleton'
import DemoZimmetAcModal from '../components/DemoZimmetAcModal'

const DURUM_ETIKET = {
  depoda:       { isim: 'Depoda',       icon: CheckCircle,   tone: 'aktif' },
  musteride:    { isim: 'Müşteride',    icon: Clock,         tone: 'beklemede' },
  suresi_gecti: { isim: 'Süresi Geçti', icon: AlertTriangle, tone: 'kayip' },
  bakimda:      { isim: 'Bakımda',      icon: Wrench,        tone: 'lead' },
}

const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'

export default function Demolar() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [cihazlar, setCihazlar] = useState([])
  const [musteriMap, setMusteriMap] = useState(new Map())
  const [yukleniyor, setYukleniyor] = useState(true)
  const [arama, setArama] = useState('')
  const [zimmetCihaz, setZimmetCihaz] = useState(null) // listeden zimmet açılan cihaz
  const sekme = searchParams.get('sekme') || 'tumu'

  const yukle = () => {
    Promise.all([demoCihazlariGetir(), musterileriGetir()])
      .then(([c, m]) => {
        setCihazlar(c || [])
        setMusteriMap(new Map((m || []).map(x => [x.id, x])))
      })
      .catch(e => console.error('[Demolar yükle]', e))
      .finally(() => setYukleniyor(false))
  }

  useEffect(() => { yukle() }, [])

  // Aktif zimmet var + imzalı tutanak yok = tutanak bekleniyor
  const tutanakBekleyen = (c) => c.aktifZimmetId && !c.aktifImzaliTutanakUrl

  const sayilar = useMemo(() => {
    const s = { tumu: cihazlar.length, depoda: 0, musteride: 0, suresi_gecti: 0, bakimda: 0, tutanak: 0 }
    for (const c of cihazlar) {
      s[c.hesaplananDurum] = (s[c.hesaplananDurum] || 0) + 1
      if (tutanakBekleyen(c)) s.tutanak++
    }
    return s
  }, [cihazlar])

  const KPI_KARTLAR = [
    { id: 'tumu',         isim: 'Tüm Cihazlar',  icon: Boxes,         renk: 'var(--text-secondary)' },
    { id: 'depoda',       isim: 'Depoda',        icon: CheckCircle,   renk: 'var(--success)' },
    { id: 'musteride',    isim: 'Müşteride',     icon: Clock,         renk: 'var(--info)' },
    { id: 'suresi_gecti', isim: 'Süresi Geçti',  icon: AlertTriangle, renk: 'var(--danger)' },
    { id: 'bakimda',      isim: 'Bakımda',       icon: Wrench,        renk: 'var(--text-muted)' },
    { id: 'tutanak',      isim: 'Tutanak Bekleyen', icon: FileWarning, renk: 'var(--warning, #F59E0B)' },
  ]

  const filtreli = useMemo(() => {
    let liste = cihazlar
    if (sekme === 'tutanak') liste = liste.filter(tutanakBekleyen)
    else if (sekme !== 'tumu') liste = liste.filter(c => c.hesaplananDurum === sekme)
    if (arama.trim()) {
      liste = liste.filter(c => trContains(
        [c.ad, c.marka, c.model, c.seriNo].filter(Boolean).join(' '),
        arama,
      ))
    }
    return liste.slice().sort((a, b) => {
      if (a.hesaplananDurum === 'suresi_gecti' && b.hesaplananDurum !== 'suresi_gecti') return -1
      if (a.hesaplananDurum !== 'suresi_gecti' && b.hesaplananDurum === 'suresi_gecti') return 1
      return (b.gecenGun || 0) - (a.gecenGun || 0)
    })
  }, [cihazlar, sekme, arama])

  if (yukleniyor) return <SkeletonList />

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Demolar</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            <span className="tabular-nums">{filtreli.length}</span> cihaz
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => navigate('/demolar/yeni')}>
            Yeni Cihaz
          </Button>
        </div>
      </div>

      {/* KPI şeridi — tıklanınca filtreler */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 10, marginBottom: 16,
      }}>
        {KPI_KARTLAR.map(k => {
          const Icon = k.icon
          const aktif = sekme === k.id
          return (
            <button
              key={k.id}
              onClick={() => setSearchParams(k.id === 'tumu' ? {} : { sekme: k.id })}
              style={{
                textAlign: 'left', cursor: 'pointer',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md, 10px)',
                background: 'var(--surface-card)',
                border: aktif ? `2px solid ${k.renk}` : '1px solid var(--border-default)',
                boxShadow: aktif ? `0 0 0 3px color-mix(in srgb, ${k.renk} 15%, transparent)` : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: k.renk }}>
                <Icon size={15} strokeWidth={1.8} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{k.isim}</span>
              </div>
              <div className="tabular-nums" style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: (sayilar[k.id] ?? 0) > 0 ? k.renk : 'var(--text-muted)' }}>
                {sayilar[k.id] ?? 0}
              </div>
            </button>
          )
        })}
      </div>

      {/* Arama */}
      <input
        type="text"
        placeholder="Ad / marka / model / S.N. ara..."
        value={arama}
        onChange={(e) => setArama(e.target.value)}
        style={{
          width: '100%', padding: 10,
          background: 'var(--surface-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-primary)',
          marginBottom: 16,
        }}
      />

      {filtreli.length === 0 ? (
        <EmptyState
          icon={<Boxes size={32} strokeWidth={1.5} />}
          title="Cihaz yok"
          description={sekme === 'tumu' ? 'Henüz hiç demo cihazı eklenmemiş.' : 'Bu durumda cihaz yok.'}
        />
      ) : (
        <Card style={{ padding: 0 }}>
          <Table>
            <THead>
              <TR>
                <TH>Cihaz</TH>
                <TH>Müşteri</TH>
                <TH>Veriliş</TH>
                <TH>Beklenen İade</TH>
                <TH>Durum</TH>
                <TH>Tutanak</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {filtreli.map(c => {
                const d = DURUM_ETIKET[c.hesaplananDurum] || DURUM_ETIKET.depoda
                const Icon = d.icon
                const kalan = c.beklenenIadeTarihi
                  ? Math.floor((new Date(c.beklenenIadeTarihi) - new Date()) / 86400000)
                  : null
                const m = c.aktifMusteriId ? musteriMap.get(c.aktifMusteriId) : null
                const musteriAd = m ? (m.firma || `${m.ad ?? ''} ${m.soyad ?? ''}`.trim()) : null
                return (
                  <TR key={c.id} onClick={() => navigate(`/demolar/${c.id}`)} style={{ cursor: 'pointer' }}>
                    <TD>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {c.fotoUrl
                          ? <img src={c.fotoUrl} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} />
                          : <div style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Boxes size={18} color="var(--text-muted)" />
                            </div>}
                        <div>
                          <div style={{ fontWeight: 600 }}>{c.ad}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {[c.marka, c.model].filter(Boolean).join(' · ')}
                            {c.seriNo && ` · S.N.: ${c.seriNo}`}
                          </div>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      {musteriAd
                        ? <span>{musteriAd}</span>
                        : c.aktifMusteriId
                          ? <span>#{c.aktifMusteriId}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </TD>
                    <TD>{fmtTarih(c.verisTarihi)}</TD>
                    <TD>{fmtTarih(c.beklenenIadeTarihi)}</TD>
                    <TD>
                      <Badge tone={d.tone}>
                        <Icon size={12} strokeWidth={1.5} /> {d.isim}
                        {kalan !== null && (
                          <span style={{ marginLeft: 4 }}>
                            {kalan < 0 ? `· ${-kalan}g geçti` : kalan === 0 ? '· bugün' : `· ${kalan}g`}
                          </span>
                        )}
                      </Badge>
                    </TD>
                    <TD>
                      {c.aktifZimmetId ? (
                        c.aktifImzaliTutanakUrl
                          ? <Badge tone="aktif"><FileCheck size={11} strokeWidth={1.8} /> İmzalı</Badge>
                          : <Badge tone="beklemede"><FileWarning size={11} strokeWidth={1.8} /> Bekliyor</Badge>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </TD>
                    <TD onClick={e => e.stopPropagation()}>
                      {c.hesaplananDurum === 'depoda' && (
                        <Button variant="secondary" size="sm"
                          iconLeft={<ArrowUpRight size={13} strokeWidth={1.5} />}
                          onClick={() => setZimmetCihaz(c)}>
                          Zimmet Aç
                        </Button>
                      )}
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </Card>
      )}

      <DemoZimmetAcModal
        acik={!!zimmetCihaz}
        cihaz={zimmetCihaz}
        onKapat={() => { setZimmetCihaz(null); yukle() }}
        onZimmetAcildi={() => yukle()}
      />
    </div>
  )
}
