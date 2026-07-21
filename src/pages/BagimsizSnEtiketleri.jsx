// Bağımsız SN Etiketleri (mig 220) — SN'siz ürünler için ZNA- seri no üretimi + etiket.
// Burada "Yeni SN Üret" ile kod oluştur (ofis) VEYA sahadan (mobil servis) üretilenler
// düşer → basılmamışları seç → A4 3×8 barkod motoruyla (BarkodEtiketYazdir) bas → yapıştır.
import { useEffect, useState, useMemo } from 'react'
import { Tags, Printer, Square, CheckSquare, RefreshCw, Plus } from 'lucide-react'
import {
  etiketKuyruguGetir, etiketBasildiIsaretle, bagimsizSnUret,
} from '../services/bagimsizSnService'
import { Card, Badge, EmptyState, Button, CodeBadge, SegmentedControl, Modal, Input, Label } from '../components/ui'
import BarkodEtiketYazdir from '../components/BarkodEtiketYazdir'
import { SkeletonList } from '../components/Skeleton'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'

const tarihFmt = (t) => t ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export default function BagimsizSnEtiketleri() {
  const { toast } = useToast()
  const { kullanici } = useAuth()
  const [liste, setListe] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [gorunum, setGorunum] = useState('bekleyen')  // bekleyen | tumu
  const [seciliIdler, setSeciliIdler] = useState(() => new Set())
  const [yazdirAcik, setYazdirAcik] = useState(false)
  // Yeni SN üretimi (ofis)
  const [uretAcik, setUretAcik] = useState(false)
  const [uretAd, setUretAd] = useState('')
  const [uretAdet, setUretAdet] = useState('1')
  const [uretiliyor, setUretiliyor] = useState(false)

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

  // Ofiste yeni SN üret — ürün adı + adet; her biri ZNA-... alır, kuyruğa düşer
  const uret = async () => {
    const ad = uretAd.trim()
    const adet = Math.min(100, Math.max(1, parseInt(uretAdet, 10) || 1))
    setUretiliyor(true)
    try {
      let basarili = 0
      for (let i = 0; i < adet; i++) {
        const sonuc = await bagimsizSnUret({ urunAdi: ad || null, kullanici })
        if (sonuc?.hata) { toast.error(sonuc.hata); break }
        basarili++
      }
      if (basarili > 0) {
        toast.success(`${basarili} adet SN üretildi — listeye eklendi.`)
        setUretAcik(false); setUretAd(''); setUretAdet('1')
        setGorunum('bekleyen')
        yenile()
      }
    } catch (e) {
      toast.error(e?.message || 'SN üretilemedi.')
    } finally { setUretiliyor(false) }
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
            Seri numarası olmayan ürünler için ZNA- seri no üret, A4 3×8 barkod sayfası
            olarak bas, cihazın üstüne yapıştır. Sahadan (mobil servis) üretilenler de buraya düşer.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" iconLeft={<RefreshCw size={13} strokeWidth={1.5} />} onClick={yenile}>
            Yenile
          </Button>
          <Button variant="primary" size="sm" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => setUretAcik(true)}>
            Yeni SN Üret
          </Button>
        </div>
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

      {/* Yeni SN üret (ofis) — ürün adı + adet; her biri ZNA-... alır */}
      <Modal
        open={uretAcik}
        onClose={() => !uretiliyor && setUretAcik(false)}
        title="Yeni SN Üret"
        width={460}
        footer={
          <>
            <Button variant="tertiary" size="sm" onClick={() => setUretAcik(false)} disabled={uretiliyor}>Vazgeç</Button>
            <Button variant="primary" size="sm" onClick={uret} disabled={uretiliyor}
              iconLeft={<Plus size={14} strokeWidth={1.5} />}>
              {uretiliyor ? 'Üretiliyor…' : 'Üret'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="t-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>
            Seri numarası olmayan ürün için benzersiz <strong>ZNA-…</strong> kod üretilir.
            Ürün adı isteğe bağlı (boş bırakırsan sadece kod basılır, sonra cihaza atarsın).
          </p>
          <div>
            <Label>Ürün / Cihaz Adı (opsiyonel)</Label>
            <Input value={uretAd} onChange={e => setUretAd(e.target.value)}
              placeholder="Ör. 4 Portlu Switch" autoFocus />
          </div>
          <div style={{ width: 140 }}>
            <Label>Kaç adet?</Label>
            <Input type="number" min="1" max="100" value={uretAdet}
              onChange={e => setUretAdet(e.target.value)} style={{ textAlign: 'right' }} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
