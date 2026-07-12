import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Boxes, ArrowDownToLine, Clock, Wrench, Trash2, Pencil,
  Printer, Send, Upload, FileCheck, FileWarning, FileText, ExternalLink,
} from 'lucide-react'
import { Button, Card, EmptyState, Badge, Table, THead, TBody, TR, TH, TD } from '../components/ui'
import {
  demoCihazGetir, demoZimmetGecmisi, demoZimmetIadeAl, demoZimmetUzat,
  demoBakimaAl, demoCihazSil, imzaliTutanakYukle, imzaliTutanakUrl,
} from '../services/demoService'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmContext'
import DemoIadeAlModal, { ALMADI_SEBEPLERI } from '../components/DemoIadeAlModal'
import DemoSureyiUzatModal from '../components/DemoSureyiUzatModal'
import DemoZimmetAcModal from '../components/DemoZimmetAcModal'
import BelgePaylasModal from '../components/BelgePaylasModal'

import { SkeletonDetay } from '../components/Skeleton'
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
  const { confirm } = useConfirm()
  const [cihaz, setCihaz] = useState(null)
  const [gecmis, setGecmis] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [iadeModalAcik, setIadeModalAcik] = useState(false)
  const [uzatmaModalAcik, setUzatmaModalAcik] = useState(false)
  const [zimmetModalAcik, setZimmetModalAcik] = useState(false)
  const [paylasModalAcik, setPaylasModalAcik] = useState(false)
  const [tutanakYukleniyor, setTutanakYukleniyor] = useState(false)
  const dosyaInputRef = useRef(null)

  const yukle = async () => {
    const [c, g] = await Promise.all([demoCihazGetir(id), demoZimmetGecmisi(id)])
    setCihaz(c); setGecmis(g)
    setYukleniyor(false)
  }

  useEffect(() => { yukle() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id])

  if (yukleniyor) return <SkeletonDetay />
  if (!cihaz) return <div style={{ padding: 24 }}><EmptyState title="Cihaz bulunamadı" /></div>

  const aktif = gecmis.find(z => !z.gercekIadeTarihi)
  const isAdmin = kullanici?.rol === 'admin'

  const iadeAl = async ({ gercekIadeTarihi, musteriKarari, durumNotu, almadiSebebi }) => {
    if (!aktif) return
    const sonuc = await demoZimmetIadeAl(aktif.id, { gercekIadeTarihi, musteriKarari, durumNotu, almadiSebebi })
    setIadeModalAcik(false)
    if (!sonuc) { toast.error('İade alınamadı.'); return }
    toast.success('İade alındı.')
    yukle()

    // Aldı → satış fırsatı: tek tıkla teklif oluştur
    if (musteriKarari === 'aldi') {
      const onay = await confirm({
        baslik: 'Satışa Dönüştü 🎉',
        mesaj: `${cihaz.ad} demosu satışla sonuçlandı. Cihaz satırı hazır şekilde yeni bir teklif oluşturulsun mu?`,
        onayMetin: 'Teklif Oluştur', iptalMetin: 'Şimdi Değil',
      })
      if (onay) {
        localStorage.setItem('teklif_on_doldurum', JSON.stringify({
          musteriId: aktif.musteriId || '',
          firmaAdi: aktif.musteri?.firma || `${aktif.musteri?.ad ?? ''} ${aktif.musteri?.soyad ?? ''}`.trim(),
          konu: `${cihaz.ad} — demo sonrası satış`,
          satirlar: [{
            id: crypto.randomUUID(),
            stokKodu: cihaz.seriNo || '',
            stokAdi: [cihaz.ad, cihaz.marka, cihaz.model].filter(Boolean).join(' — '),
            miktar: 1,
            birim: 'Adet',
            birimFiyat: 0,
            iskonto: 0,
            kdv: 20,
          }],
        }))
        navigate('/teklifler/yeni')
      }
    }
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
    if (aktif) { toast.error('Aktif zimmeti olan cihaz silinemez. Önce iade al.'); return }
    const onay = await confirm({
      baslik: 'Cihazı Sil',
      mesaj: gecmis.length > 0
        ? `Bu cihaz silinince ${gecmis.length} zimmet geçmişi de kalıcı olarak silinecek. Devam edilsin mi?`
        : 'Bu cihaz havuzdan kalıcı olarak silinsin mi?',
      onayMetin: 'Sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    const ok = await demoCihazSil(cihaz.id)
    if (ok) { toast.success('Cihaz silindi.'); navigate('/demolar') }
    else toast.error('Cihaz silinemedi.')
  }

  // ── İmzalı tutanak yükleme ───────────────────────────────────────────
  const dosyaSecildi = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !aktif) return
    setTutanakYukleniyor(true)
    const sonuc = await imzaliTutanakYukle(aktif.id, file)
    setTutanakYukleniyor(false)
    if (sonuc) { toast.success('İmzalı tutanak yüklendi.'); yukle() }
    else toast.error('Yükleme başarısız.')
  }

  const imzaliGoster = async (path) => {
    const url = await imzaliTutanakUrl(path)
    if (url) window.open(url, '_blank')
    else toast.error('Dosya açılamadı.')
  }

  const aldiSayisi = gecmis.filter(z => z.musteriKarari === 'aldi').length
  const tamamlanmisDemoSayisi = gecmis.filter(z => z.gercekIadeTarihi).length
  const conversionPct = tamamlanmisDemoSayisi > 0 ? Math.round(aldiSayisi / tamamlanmisDemoSayisi * 100) : null

  const aktifMusteriAd = aktif
    ? (aktif.musteri?.firma || `${aktif.musteri?.ad ?? ''} ${aktif.musteri?.soyad ?? ''}`.trim() || `#${aktif.musteriId}`)
    : null

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
            <Button variant="secondary" iconLeft={<Pencil size={14} strokeWidth={1.5} />} onClick={() => navigate(`/demolar/${id}/duzenle`)}>
              Düzenle
            </Button>
            {isAdmin && (
              <Button variant="secondary" iconLeft={<Wrench size={14} strokeWidth={1.5} />} onClick={bakimToggle}>
                {cihaz.bakimda ? 'Bakımdan Çıkar' : 'Bakıma Al'}
              </Button>
            )}
            {isAdmin && (
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
            <Bilgi label="Müşteri" value={aktifMusteriAd} />
            <Bilgi label="Lokasyon" value={aktif.lokasyon?.ad || '—'} />
            <Bilgi label="Veriliş" value={fmtTarih(aktif.verisTarihi)} />
            <Bilgi label="Beklenen İade" value={fmtTarih(aktif.beklenenIadeTarihi)} />
            <Bilgi label="Veren" value={aktif.verenKullaniciAd || '—'} />
          </div>
          {aktif.durumNotu && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, whiteSpace: 'pre-line' }}>{aktif.durumNotu}</p>}

          {/* ── Teslim tutanağı ── */}
          <div style={{
            marginTop: 14, padding: 12, borderRadius: 8,
            background: 'var(--surface-sunken)',
            border: `1px solid ${aktif.imzaliTutanakUrl ? 'var(--success)' : 'var(--warning, #F59E0B)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {aktif.imzaliTutanakUrl
                ? <FileCheck size={16} style={{ color: 'var(--success)' }} />
                : <FileWarning size={16} style={{ color: 'var(--warning, #F59E0B)' }} />}
              <span style={{ fontWeight: 600, fontSize: 13 }}>
                Teslim Tutanağı — <span style={{ fontFamily: 'var(--font-mono)' }}>{aktif.tutanakNo || '—'}</span>
              </span>
              <Badge tone={aktif.imzaliTutanakUrl ? 'aktif' : 'beklemede'}>
                {aktif.imzaliTutanakUrl ? 'İmzalı yüklendi' : 'İmzalı tutanak bekleniyor'}
              </Badge>
              {aktif.tutanakGonderildi && <Badge tone="lead">Müşteriye gönderildi</Badge>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <Button variant="secondary" iconLeft={<Printer size={14} strokeWidth={1.5} />}
                onClick={() => navigate(`/demolar/${id}/tutanak?z=${aktif.id}`)}>
                Yazdır
              </Button>
              <Button variant="secondary" iconLeft={<Send size={14} strokeWidth={1.5} />}
                onClick={() => setPaylasModalAcik(true)}>
                Müşteriye Gönder
              </Button>
              <Button variant={aktif.imzaliTutanakUrl ? 'ghost' : 'primary'}
                iconLeft={<Upload size={14} strokeWidth={1.5} />}
                onClick={() => dosyaInputRef.current?.click()}
                disabled={tutanakYukleniyor}>
                {tutanakYukleniyor ? 'Yükleniyor…' : (aktif.imzaliTutanakUrl ? 'Yeniden Yükle' : 'İmzalı Tutanağı Yükle')}
              </Button>
              {aktif.imzaliTutanakUrl && (
                <Button variant="ghost" iconLeft={<ExternalLink size={14} strokeWidth={1.5} />}
                  onClick={() => imzaliGoster(aktif.imzaliTutanakUrl)}>
                  İmzalıyı Gör
                </Button>
              )}
            </div>
            <input ref={dosyaInputRef} type="file" accept="image/*,application/pdf"
              style={{ display: 'none' }} onChange={dosyaSecildi} />
          </div>

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
              Zimmet açıldığında teslim tutanağı otomatik oluşturulur.
            </p>
            <Button variant="primary" onClick={() => setZimmetModalAcik(true)}>
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
                <TH>Tutanak</TH>
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
                const sebep = z.musteriKarari === 'almadi' && z.almadiSebebi
                  ? ALMADI_SEBEPLERI.find(s => s.id === z.almadiSebebi)?.label
                  : null
                const uzatildi = (z.durumNotu || '').includes('[Uzatma')
                return (
                  <TR key={z.id}>
                    <TD>{z.musteri?.firma || `${z.musteri?.ad ?? ''} ${z.musteri?.soyad ?? ''}`.trim() || `#${z.musteriId}`}</TD>
                    <TD>
                      <span
                        onClick={() => navigate(`/demolar/${id}/tutanak?z=${z.id}`)}
                        title="Tutanağı aç"
                        style={{
                          fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer',
                          color: 'var(--info)', display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                        <FileText size={12} /> {z.tutanakNo || '—'}
                      </span>
                      {z.imzaliTutanakUrl && (
                        <FileCheck size={13} style={{ color: 'var(--success)', marginLeft: 6, verticalAlign: -2 }} title="İmzalı tutanak yüklü" />
                      )}
                    </TD>
                    <TD>{fmtTarih(z.verisTarihi)}</TD>
                    <TD>
                      {fmtTarih(z.beklenenIadeTarihi)}
                      {uzatildi && <Badge tone="lead" style={{ marginLeft: 6 }}>uzatıldı</Badge>}
                    </TD>
                    <TD>{z.gercekIadeTarihi ? fmtTarih(z.gercekIadeTarihi) : <span style={{ color: 'var(--info)' }}>aktif</span>}</TD>
                    <TD>{sure} g</TD>
                    <TD>
                      {karar ? <Badge tone={karar.tone}>{karar.label}</Badge> : '—'}
                      {sebep && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sebep}</div>}
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </Card>
      )}

      <DemoIadeAlModal acik={iadeModalAcik} onKapat={() => setIadeModalAcik(false)} onKaydet={iadeAl} />
      <DemoSureyiUzatModal acik={uzatmaModalAcik} mevcutTarih={aktif?.beklenenIadeTarihi} onKapat={() => setUzatmaModalAcik(false)} onKaydet={sureyiUzat} />
      <DemoZimmetAcModal
        acik={zimmetModalAcik}
        cihaz={cihaz}
        onKapat={() => { setZimmetModalAcik(false); yukle() }}
        onZimmetAcildi={() => yukle()}
      />
      {aktif && (
        <BelgePaylasModal
          acik={paylasModalAcik}
          onKapat={() => { setPaylasModalAcik(false); yukle() }}
          belgeTipi="demo_tutanak"
          belgeId={aktif.id}
          baslangicEmail={aktif.musteri?.email || ''}
          baslangicGsm={aktif.musteri?.telefon || ''}
          belgeBaslik={`${aktif.tutanakNo || ''} — ${cihaz.ad} (${aktifMusteriAd})`}
        />
      )}
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
