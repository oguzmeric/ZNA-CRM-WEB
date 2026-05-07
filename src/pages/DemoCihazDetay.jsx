import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Boxes, ArrowDownToLine, Clock, Wrench, Trash2 } from 'lucide-react'
import { Button, Card, EmptyState, Badge, Table, THead, TBody, TR, TH, TD } from '../components/ui'
import {
  demoCihazGetir, demoZimmetGecmisi, demoZimmetIadeAl, demoZimmetUzat,
  demoBakimaAl, demoCihazSil,
} from '../services/demoService'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import DemoIadeAlModal from '../components/DemoIadeAlModal'
import DemoSureyiUzatModal from '../components/DemoSureyiUzatModal'

const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'

const KARAR_ROZETI = {
  aldi:             { label: '✓ Aldı',             tone: 'aktif' },
  almadi:           { label: '✗ Almadı',           tone: 'kayip' },
  degerlendiriyor:  { label: '… Değerlendiriyor',  tone: 'beklemede' },
}

export default function DemoCihazDetay() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { kullanici } = useAuth()
  const [cihaz, setCihaz] = useState(null)
  const [gecmis, setGecmis] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [iadeModalAcik, setIadeModalAcik] = useState(false)
  const [uzatmaModalAcik, setUzatmaModalAcik] = useState(false)

  const yukle = async () => {
    const [c, g] = await Promise.all([demoCihazGetir(id), demoZimmetGecmisi(id)])
    setCihaz(c); setGecmis(g)
    setYukleniyor(false)
  }

  useEffect(() => { yukle() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id])

  if (yukleniyor) return <div style={{ padding: 24 }}><EmptyState title="Yükleniyor…" /></div>
  if (!cihaz) return <div style={{ padding: 24 }}><EmptyState title="Cihaz bulunamadı" /></div>

  const aktif = gecmis.find(z => !z.gercekIadeTarihi)
  const isAdmin = kullanici?.rol === 'admin'

  const iadeAl = async ({ gercekIadeTarihi, musteriKarari, durumNotu }) => {
    if (!aktif) return
    const sonuc = await demoZimmetIadeAl(aktif.id, { gercekIadeTarihi, musteriKarari, durumNotu })
    setIadeModalAcik(false)
    if (sonuc) { toast.success('İade alındı.'); yukle() } else toast.error('İade alınamadı.')
  }

  const sureyiUzat = async (yeniTarih, neden) => {
    if (!aktif) return
    const sonuc = await demoZimmetUzat(aktif.id, yeniTarih, neden)
    setUzatmaModalAcik(false)
    if (sonuc) { toast.success('Süre uzatıldı.'); yukle() } else toast.error('Uzatma başarısız.')
  }

  const bakimToggle = async () => {
    const sonuc = await demoBakimaAl(cihaz.id, !cihaz.bakimda)
    if (sonuc) { toast.success(cihaz.bakimda ? 'Bakımdan çıkarıldı.' : 'Bakıma alındı.'); yukle() }
  }

  const sil = async () => {
    if (gecmis.length > 0) { toast.error('Geçmişi olan cihaz silinemez.'); return }
    if (!window.confirm('Bu cihaz havuzdan silinsin mi?')) return
    const ok = await demoCihazSil(cihaz.id)
    if (ok) { toast.success('Cihaz silindi.'); navigate('/demolar') }
  }

  const aldiSayisi = gecmis.filter(z => z.musteriKarari === 'aldi').length
  const tamamlanmisDemoSayisi = gecmis.filter(z => z.gercekIadeTarihi).length
  const conversionPct = tamamlanmisDemoSayisi > 0 ? Math.round(aldiSayisi / tamamlanmisDemoSayisi * 100) : null

  return (
    <div style={{ padding: 24, maxWidth: 1024, margin: '0 auto' }}>
      <Button variant="ghost" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => navigate('/demolar')}>
        Demolar
      </Button>

      {/* Cihaz başlık kartı */}
      <Card style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ width: 80, height: 80, borderRadius: 8, background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {cihaz.fotoUrl
              ? <img src={cihaz.fotoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} alt="" />
              : <Boxes size={32} color="var(--text-muted)" />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="t-h1">{cihaz.ad}</h1>
            <p className="t-caption">
              {[cihaz.marka, cihaz.model, cihaz.kategori].filter(Boolean).join(' · ')}
              {cihaz.seriNo && ` · S.N.: ${cihaz.seriNo}`}
            </p>
            {cihaz.notlar && <p style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 13 }}>{cihaz.notlar}</p>}
            {conversionPct !== null && (
              <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                Konversiyon: <strong>{conversionPct}%</strong> ({aldiSayisi}/{tamamlanmisDemoSayisi} demo satışla sonuçlandı)
              </p>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {isAdmin && (
              <Button variant="secondary" iconLeft={<Wrench size={14} strokeWidth={1.5} />} onClick={bakimToggle}>
                {cihaz.bakimda ? 'Bakımdan Çıkar' : 'Bakıma Al'}
              </Button>
            )}
            {isAdmin && gecmis.length === 0 && (
              <Button variant="ghost" iconLeft={<Trash2 size={14} strokeWidth={1.5} />} onClick={sil}>
                Sil
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Aktif zimmet kartı */}
      {aktif ? (
        <Card style={{ marginTop: 16, borderLeft: '4px solid var(--info)' }}>
          <h2 className="t-h3" style={{ marginBottom: 8 }}>Aktif Zimmet</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <Bilgi label="Müşteri" value={aktif.musteri?.firma || `${aktif.musteri?.ad ?? ''} ${aktif.musteri?.soyad ?? ''}`.trim() || `#${aktif.musteriId}`} />
            <Bilgi label="Lokasyon" value={aktif.lokasyon?.ad || '—'} />
            <Bilgi label="Veriliş" value={fmtTarih(aktif.verisTarihi)} />
            <Bilgi label="Beklenen İade" value={fmtTarih(aktif.beklenenIadeTarihi)} />
            <Bilgi label="Veren" value={aktif.verenKullaniciAd || '—'} />
          </div>
          {aktif.durumNotu && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, whiteSpace: 'pre-line' }}>{aktif.durumNotu}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button variant="primary" iconLeft={<ArrowDownToLine size={14} strokeWidth={1.5} />} onClick={() => setIadeModalAcik(true)}>
              İade Al
            </Button>
            <Button variant="secondary" iconLeft={<Clock size={14} strokeWidth={1.5} />} onClick={() => setUzatmaModalAcik(true)}>
              Süreyi Uzat
            </Button>
          </div>
        </Card>
      ) : (
        !cihaz.bakimda && (
          <Card style={{
            marginTop: 16, textAlign: 'center', padding: 28,
            borderLeft: '4px solid var(--success)',
            background: 'var(--success-soft, rgba(34, 197, 94, 0.06))',
          }}>
            <h3 className="t-h3" style={{ marginBottom: 6 }}>📦 Cihaz Depoda</h3>
            <p className="t-caption" style={{ marginBottom: 16 }}>
              Bu cihazı bir müşteriye zimmetlemek için aşağıdaki butona tıkla.
            </p>
            <Button variant="primary" onClick={() => navigate(`/demolar/${id}/zimmet`)}>
              Müşteriye Zimmet Aç →
            </Button>
          </Card>
        )
      )}

      {/* Geçmiş zimmetler */}
      <h2 className="t-h3" style={{ marginTop: 24, marginBottom: 8 }}>Geçmiş ({gecmis.length})</h2>
      {gecmis.length === 0 ? (
        <EmptyState title="Henüz hiç zimmet yok" />
      ) : (
        <Card style={{ padding: 0 }}>
          <Table>
            <THead>
              <TR>
                <TH>Müşteri</TH>
                <TH>Veriliş</TH>
                <TH>Beklenen</TH>
                <TH>Gerçek İade</TH>
                <TH>Süre</TH>
                <TH>Karar</TH>
              </TR>
            </THead>
            <TBody>
              {gecmis.map(z => {
                const sure = z.gercekIadeTarihi
                  ? Math.floor((new Date(z.gercekIadeTarihi) - new Date(z.verisTarihi)) / 86400000)
                  : Math.floor((new Date() - new Date(z.verisTarihi)) / 86400000)
                const karar = KARAR_ROZETI[z.musteriKarari]
                return (
                  <TR key={z.id}>
                    <TD>{z.musteri?.firma || `${z.musteri?.ad ?? ''} ${z.musteri?.soyad ?? ''}`.trim() || `#${z.musteriId}`}</TD>
                    <TD>{fmtTarih(z.verisTarihi)}</TD>
                    <TD>{fmtTarih(z.beklenenIadeTarihi)}</TD>
                    <TD>{z.gercekIadeTarihi ? fmtTarih(z.gercekIadeTarihi) : <span style={{ color: 'var(--info)' }}>aktif</span>}</TD>
                    <TD>{sure} g</TD>
                    <TD>{karar ? <Badge tone={karar.tone}>{karar.label}</Badge> : '—'}</TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </Card>
      )}

      <DemoIadeAlModal acik={iadeModalAcik} onKapat={() => setIadeModalAcik(false)} onKaydet={iadeAl} />
      <DemoSureyiUzatModal acik={uzatmaModalAcik} mevcutTarih={aktif?.beklenenIadeTarihi} onKapat={() => setUzatmaModalAcik(false)} onKaydet={sureyiUzat} />
    </div>
  )
}

function Bilgi({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  )
}
