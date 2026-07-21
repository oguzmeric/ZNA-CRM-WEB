// Bağımsız SN Etiketleri (mig 220) — sahada üretilen ZNA- SN'lerin ofis etiket kuyruğu.
// Basılmamışları seç → mevcut A4 3×8 barkod motoruyla (BarkodEtiketYazdir) bas →
// "basıldı" işaretle. SN'ler sahada (mobil servis) üretilir, buradan basılır.
import { useEffect, useState, useMemo } from 'react'
import { Tags, Printer, Square, CheckSquare, RefreshCw } from 'lucide-react'
import {
  etiketKuyruguGetir, etiketBasildiIsaretle,
} from '../services/bagimsizSnService'
import { Card, Badge, EmptyState, Button, CodeBadge, SegmentedControl } from '../components/ui'
import BarkodEtiketYazdir from '../components/BarkodEtiketYazdir'
import { SkeletonList } from '../components/Skeleton'
import { useToast } from '../context/ToastContext'

const tarihFmt = (t) => t ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export default function BagimsizSnEtiketleri() {
  const { toast } = useToast()
  const [liste, setListe] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [gorunum, setGorunum] = useState('bekleyen')  // bekleyen | tumu
  const [seciliIdler, setSeciliIdler] = useState(() => new Set())
  const [yazdirAcik, setYazdirAcik] = useState(false)

  const yenile = () => {
    setYukleniyor(true)
    etiketKuyruguGetir({ sadeceBasilmamis: gorunum === 'bekleyen' })
      .then(d => { setListe(d); setSeciliIdler(new Set()) })
      .catch(e => console.error('[BagimsizSnEtiketleri]', e))
      .finally(() => setYukleniyor(false))
  }
  useEffect(yenile, [gorunum])

  const toggle = (id) => {
    setSeciliIdler(prev => {
      const y = new Set(prev)
      if (y.has(id)) y.delete(id); else y.add(id)
      return y
    })
  }
  const tumu = () => setSeciliIdler(new Set(liste.map(r => r.id)))
  const hicbiri = () => setSeciliIdler(new Set())

  const secili = useMemo(() => liste.filter(r => seciliIdler.has(r.id)), [liste, seciliIdler])

  // BarkodEtiketYazdir kalem formatı: {id, seriNo, model, durum}
  const yazdirKalemleri = useMemo(() => secili.map(r => ({
    id: r.id,
    seriNo: r.seriNo,
    model: r.urunAdi || r.stokKodu || '',
    durum: r.etiketBasildi ? 'basıldı' : 'bekliyor',
  })), [secili])

  const basildiIsaretle = async (kalemler) => {
    const ids = kalemler.map(k => k.id)
    await etiketBasildiIsaretle(ids)
    toast.success(`${ids.length} etiket "basıldı" işaretlendi.`)
    setYazdirAcik(false)
    yenile()
  }

  if (yukleniyor) return <SkeletonList />

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tags size={22} strokeWidth={1.5} style={{ color: 'var(--brand-600, #0176D3)' }} />
            <h1 className="t-h2" style={{ margin: 0 }}>Bağımsız SN Etiketleri</h1>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Sahada seri numarası olmayan ürünlere üretilen ZNA- seri numaraları.
            Seçip A4 3×8 barkod sayfası olarak basın, cihazın üstüne yapıştırın.
          </div>
        </div>
        <Button variant="secondary" size="sm" iconLeft={<RefreshCw size={13} strokeWidth={1.5} />} onClick={yenile}>
          Yenile
        </Button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <SegmentedControl
          value={gorunum}
          onChange={setGorunum}
          options={[
            { value: 'bekleyen', label: 'Basılmamış' },
            { value: 'tumu', label: 'Tümü' },
          ]}
        />
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onClick={tumu} disabled={!liste.length}>Tümünü Seç</Button>
        <Button variant="secondary" size="sm" onClick={hicbiri} disabled={!seciliIdler.size}>Temizle</Button>
        <Button variant="primary" size="sm" iconLeft={<Printer size={14} strokeWidth={1.5} />}
          disabled={!secili.length} onClick={() => setYazdirAcik(true)}>
          Etiket Yazdır ({secili.length})
        </Button>
      </div>

      <Card>
        {liste.length === 0 ? (
          <EmptyState
            icon={<Tags size={40} strokeWidth={1.5} />}
            title={gorunum === 'bekleyen' ? 'Basılmamış etiket yok' : 'Kayıt yok'}
            description="Sahada bir ürüne SN üretildiğinde burada belirir."
          />
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {liste.map(r => {
              const secili = seciliIdler.has(r.id)
              return (
                <button key={r.id} onClick={() => toggle(r.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                    padding: '10px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    background: secili ? 'rgba(1,118,211,0.08)' : 'var(--surface-sunken)',
                    border: `1px solid ${secili ? 'rgba(1,118,211,0.4)' : 'var(--border-default)'}`,
                    color: 'var(--text-primary)',
                  }}>
                  {secili
                    ? <CheckSquare size={18} strokeWidth={1.5} style={{ color: 'var(--brand-600, #0176D3)', flexShrink: 0 }} />
                    : <Square size={18} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                  <CodeBadge>{r.seriNo}</CodeBadge>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '500 13px/18px var(--font-sans)' }}>{r.urunAdi || r.stokKodu || 'İsimsiz ürün'}</div>
                    <div className="t-caption" style={{ color: 'var(--text-tertiary)' }}>
                      {r.olusturanAd || '—'} · {tarihFmt(r.olusturmaTarih)}
                    </div>
                  </div>
                  {r.etiketBasildi
                    ? <Badge tone="aktif">Basıldı</Badge>
                    : <Badge tone="beklemede">Bekliyor</Badge>}
                </button>
              )
            })}
          </div>
        )}
      </Card>

      {yazdirAcik && (
        <BarkodEtiketYazdir
          kalemler={yazdirKalemleri}
          marka="ZNA"
          stokKodu=""
          onKapat={() => setYazdirAcik(false)}
          onYazdir={basildiIsaretle}
        />
      )}
    </div>
  )
}
