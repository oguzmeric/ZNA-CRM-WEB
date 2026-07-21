// Sözleşmeler — sekmeli modül (mig 154):
//   Bayi Sözleşmeleri : şablondan otomatik üretim + imzalı PDF + yenileme rozetleri
//   Şablonlar         : {{degisken}} gövdeli sözleşme şablonları (admin)
//   Eksik Evrak       : onaylanmamış bayi evrakları
//   Onay Bekleyenler  : aktivasyon sürecindeki bayiler
//   Genel             : eski mini modül (bakım/kiralama/hizmet, sabah özeti takipli)

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSignature, Plus, Trash2, Pencil, ExternalLink, Paperclip, ArrowRight } from 'lucide-react'
import { Button, Card, EmptyState, Modal, Input, Select, Label, Textarea, Table, THead, TBody, TR, TH, TD, Badge, CodeBadge } from '../components/ui'
import { sozlesmeleriGetir, sozlesmeEkle, sozlesmeGuncelle, sozlesmeSil, SOZLESME_TIPLERI } from '../services/sozlesmeService'
import { filoDosyaYukle, filoDosyaUrl, sonYuklemeHata } from '../services/filoService'
import { musterileriGetir } from '../services/musteriService'
import { firmalariGetir } from '../services/firmaService'
import {
  bayiSozlesmeleriGetir, sablonlariGetir, sablonEkle, sablonGuncelle,
  eksikEvrakKayitlari, onayKayitlariTumu,
  SOZLESME_DURUMLARI, EVRAK_TIPLERI, EVRAK_DURUMLARI, ONAY_ADIMLARI, bayiStatu,
} from '../services/bayiService'
import { YeniSozlesmeWizard, SozlesmeGoruntuleModal } from '../components/BayiSozlesmeModallari'
import { satisSozlesmeleriGetir } from '../services/satisSozlesmeService'
import { SS_DURUMLARI, SABLON_TIPLERI_SS } from '../lib/satisSozlesmeMaddeleri'
import { paraFmt } from '../lib/satisSozlesmeHesap'
import { fmtTL, kalanGun, BitisRozet, FiloKpi } from '../components/FiloOrtak'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { SkeletonList } from '../components/Skeleton'

const SEKMELER = [
  { id: 'satis',     isim: 'Satış Sözleşmeleri' },
  { id: 'bayi',      isim: 'Bayi Sözleşmeleri' },
  { id: 'sablonlar', isim: 'Şablonlar' },
  { id: 'evrak',     isim: 'Eksik Evrak Takibi' },
  { id: 'onay',      isim: 'Onay Bekleyenler' },
  { id: 'genel',     isim: 'Genel Sözleşmeler' },
]

const trTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'

// Yenileme uyarı rozeti — 60/30/15 gün eşikleri (spec §13)
function YenilemeRozet({ bitis }) {
  const g = kalanGun(bitis)
  if (g == null) return <span className="t-caption">—</span>
  if (g < 0)   return <Badge tone="kayip">Süresi doldu</Badge>
  if (g <= 15) return <Badge tone="kayip">{g} gün kaldı</Badge>
  if (g <= 30) return <Badge tone="uyari">{g} gün kaldı</Badge>
  if (g <= 60) return <Badge tone="beklemede">{g} gün kaldı</Badge>
  return <span className="t-caption">{trTarih(bitis)}</span>
}

export default function Sozlesmeler() {
  const [sekme, setSekme] = useState('satis')

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="t-h1" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileSignature size={22} strokeWidth={1.75} /> Sözleşmeler
        </h1>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border-default)', flexWrap: 'wrap' }}>
        {SEKMELER.map(s => (
          <button key={s.id} onClick={() => setSekme(s.id)}
            style={{
              padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
              font: `${sekme === s.id ? 600 : 400} 13px/18px var(--font-sans)`,
              color: sekme === s.id ? 'var(--brand-primary)' : 'var(--text-secondary)',
              borderBottom: sekme === s.id ? '2px solid var(--brand-primary)' : '2px solid transparent',
              marginBottom: -1,
            }}>
            {s.isim}
          </button>
        ))}
      </div>

      {sekme === 'satis' && <SatisSozlesmeleriSekmesi />}
      {sekme === 'bayi' && <BayiSozlesmeleriSekmesi />}
      {sekme === 'sablonlar' && <SablonlarSekmesi />}
      {sekme === 'evrak' && <EksikEvrakSekmesi />}
      {sekme === 'onay' && <OnayBekleyenlerSekmesi />}
      {sekme === 'genel' && <GenelSozlesmeler />}
    </div>
  )
}

// ---------------- Satış Sözleşmeleri ----------------

const SS_FILTRELER = [
  { id: 'tumu',        isim: 'Tümü' },
  { id: 'taslak',      isim: 'Taslaklar' },
  { id: 'yonetici',    isim: 'Yönetici Onayı Bekleyenler' },
  { id: 'gonderilen',  isim: 'Müşteriye Gönderilenler' },
  { id: 'imzalanan',   isim: 'İmzalanan Sözleşmeler' },
  { id: 'eksik_evrak', isim: 'Eksik Evraklı' },
  { id: 'vadeli',      isim: 'Vadeli / Çekli' },
  { id: 'kur_farki',   isim: 'Kur Farkı Takip' },
  { id: 'tahsilat',    isim: 'Tahsilatı Yaklaşanlar' },
  { id: 'temerrut',    isim: 'Temerrüde Düşenler' },
]

const ssYasayan = (s) => !['iptal'].includes(s.durum)

function SatisSozlesmeleriSekmesi() {
  const navigate = useNavigate()
  const [sozlesmeler, setSozlesmeler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [filtre, setFiltre] = useState('tumu')

  useEffect(() => {
    satisSozlesmeleriGetir().then(s => { setSozlesmeler(s); setYukleniyor(false) })
  }, [])

  const bugun = new Date(new Date().toDateString())
  const kalanGunSS = (t) => t ? Math.round((new Date(t) - bugun) / 86400000) : null

  const filtrele = (s) => {
    switch (filtre) {
      case 'taslak':      return s.durum === 'taslak'
      case 'yonetici':    return s.durum === 'yonetici_onayinda'
      case 'gonderilen':  return s.durum === 'gonderildi'
      case 'imzalanan':   return s.durum === 'imzalandi'
      case 'eksik_evrak': return ssYasayan(s) && (s.evraklar || []).some(e => e.durum !== 'tamam')
      case 'vadeli':      return ssYasayan(s) && (['cek', 'senet'].includes(s.odemeTipi) || Number(s.vadeGunu) > 0)
      case 'kur_farki':   return ssYasayan(s) && (s.kurFarkiUygulanir || s.paraBirimi !== 'TL') && s.kurFarkiDurumu !== 'faturalandi'
      case 'tahsilat': {
        const g = kalanGunSS(s.vadeTarihi)
        return ssYasayan(s) && g != null && g >= 0 && g <= 14
      }
      case 'temerrut': {
        const g = kalanGunSS(s.vadeTarihi)
        return ['onaylandi', 'gonderildi', 'imzalandi'].includes(s.durum) && g != null && g < 0
      }
      default: return true
    }
  }

  const gorunen = useMemo(() => sozlesmeler.filter(filtrele), [sozlesmeler, filtre]) // eslint-disable-line react-hooks/exhaustive-deps

  if (yukleniyor) return <SkeletonList />

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <p className="t-caption">
          Teklif veya siparişten tek tuşla üretilir; vade farkı, damga vergisi ve iskonto otomatik hesaplanır (ZNA-SS-YYYY-NNNN).
        </p>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => navigate('/sozlesmeler/satis/yeni')}>
          Yeni Satış Sözleşmesi
        </Button>
      </div>

      {/* Filtre çipleri (spec §9 alt menüleri) */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {SS_FILTRELER.map(f => {
          const aktif = filtre === f.id
          return (
            <button key={f.id} onClick={() => setFiltre(f.id)}
              style={{
                padding: '5px 12px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                border: `1px solid ${aktif ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                background: aktif ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                font: `${aktif ? 600 : 400} 12px/16px var(--font-sans)`,
                color: aktif ? 'var(--brand-primary)' : 'var(--text-secondary)',
              }}>
              {f.isim}
            </button>
          )
        })}
      </div>

      {gorunen.length === 0 ? (
        <EmptyState
          icon={<FileSignature size={32} strokeWidth={1.5} />}
          title={filtre === 'tumu' ? 'Satış sözleşmesi yok' : 'Bu filtrede sözleşme yok'}
          description={filtre === 'tumu' ? '"Yeni Satış Sözleşmesi" ile teklif veya siparişten üretin.' : 'Farklı bir filtre deneyin.'}
        />
      ) : (
        <Card style={{ padding: 0 }}>
          <Table>
            <THead>
              <TR>
                <TH>Sözleşme</TH>
                <TH>Müşteri / Proje</TH>
                <TH>Tip</TH>
                <TH>Nihai Bedel</TH>
                <TH>Vade</TH>
                <TH>Çek</TH>
                <TH>Kur Farkı</TH>
                <TH>İmza</TH>
                <TH>Evrak</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {gorunen.map(s => {
                const d = SS_DURUMLARI[s.durum] || SS_DURUMLARI.taslak
                const g = kalanGunSS(s.vadeTarihi)
                const evrakEksik = (s.evraklar || []).filter(e => e.durum !== 'tamam').length
                const kf = s.kurFarkiDurumu
                return (
                  <TR key={s.id}>
                    <TD>
                      <strong>{s.sozlesmeNo}</strong>
                      <div className="t-caption" style={{ marginTop: 2 }}>
                        {[s.gorusmeNo, s.teklifNo, s.siparisNo].filter(Boolean).join(' · ') || '—'}
                      </div>
                      <Badge tone={d.tone} style={{ marginTop: 3 }}>{d.isim}</Badge>
                    </TD>
                    <TD>
                      <strong>{s.firmaAdi || '—'}</strong>
                      {s.projeAdi && <div className="t-caption">{s.projeAdi}</div>}
                    </TD>
                    <TD style={{ maxWidth: 150 }}>
                      <span style={{ font: '400 12px/16px var(--font-sans)' }}>
                        {SABLON_TIPLERI_SS.find(t => t.id === s.sablonTipi)?.isim || s.sablonTipi}
                      </span>
                    </TD>
                    <TD>
                      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{paraFmt(s.nihaiToplam, s.paraBirimi)}</strong>
                      <div className="t-caption" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        Ana {paraFmt(s.anaToplam, s.paraBirimi)}
                        {Number(s.vadeFarki) ? ` + VF ${paraFmt(s.vadeFarki, s.paraBirimi)}` : ''}
                        {Number(s.damgaVergisi) ? ` + DV ${paraFmt(s.damgaVergisi, s.paraBirimi)}` : ''}
                        {Number(s.iskonto) ? ` − İsk ${paraFmt(s.iskonto, s.paraBirimi)}` : ''}
                      </div>
                    </TD>
                    <TD>
                      {s.vadeTarihi ? (
                        g < 0 && ['onaylandi', 'gonderildi', 'imzalandi'].includes(s.durum)
                          ? <Badge tone="kayip">Vadesi geçti ({-g} gün)</Badge>
                          : g != null && g <= 14 && ssYasayan(s)
                            ? <Badge tone="uyari">{g} gün kaldı</Badge>
                            : <span className="t-caption">{new Date(s.vadeTarihi).toLocaleDateString('tr-TR')}</span>
                      ) : Number(s.vadeGunu) > 0
                        ? <span className="t-caption">{s.vadeGunu} gün</span>
                        : <span className="t-caption">Peşin</span>}
                    </TD>
                    <TD>
                      {['cek', 'senet'].includes(s.odemeTipi)
                        ? <Badge tone="beklemede">{s.cekNo ? `Çek ${s.cekNo}` : 'Çekli'}</Badge>
                        : <span className="t-caption">—</span>}
                    </TD>
                    <TD>
                      {kf === 'faturalandi' ? <Badge tone="aktif">Faturalandı</Badge>
                        : kf === 'olustu' ? <Badge tone="kayip">{Number(s.kurFarkiTl) ? paraFmt(s.kurFarkiTl, 'TL') : 'Oluştu'}</Badge>
                        : kf === 'izleniyor' ? <Badge tone="uyari">İzleniyor</Badge>
                        : <span className="t-caption">—</span>}
                    </TD>
                    <TD>
                      {s.imzaliPdfUrl ? <Badge tone="aktif">İmzalı</Badge>
                        : s.durum === 'gonderildi' ? <Badge tone="beklemede">Bekleniyor</Badge>
                        : <span className="t-caption">—</span>}
                    </TD>
                    <TD>
                      {(s.evraklar || []).length === 0 ? <span className="t-caption">—</span>
                        : evrakEksik === 0 ? <Badge tone="aktif">Tamam</Badge>
                        : <Badge tone="uyari">{evrakEksik} eksik</Badge>}
                    </TD>
                    <TD>
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/sozlesmeler/satis/${s.id}`)}>Aç</Button>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  )
}

// ---------------- Bayi Sözleşmeleri ----------------

function BayiSozlesmeleriSekmesi() {
  const { kullanici } = useAuth()
  const [sozlesmeler, setSozlesmeler] = useState([])
  const [firmalar, setFirmalar] = useState([])
  const [sablonlar, setSablonlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [durumFiltre, setDurumFiltre] = useState('')
  const [wizardAcik, setWizardAcik] = useState(false)
  const [acik, setAcik] = useState(null)

  const yukle = async () => {
    const [s, f, sab] = await Promise.all([bayiSozlesmeleriGetir(), firmalariGetir(), sablonlariGetir()])
    setSozlesmeler(s); setFirmalar(f || []); setSablonlar(sab)
    setYukleniyor(false)
  }
  useEffect(() => { yukle() }, [])

  const gorunen = useMemo(() =>
    durumFiltre ? sozlesmeler.filter(s => s.durum === durumFiltre) : sozlesmeler,
  [sozlesmeler, durumFiltre])

  const ozet = useMemo(() => {
    const yasayan = sozlesmeler.filter(s => ['olusturuldu', 'imza_bekleniyor', 'imzalandi'].includes(s.durum))
    return {
      toplam: yasayan.length,
      imzaBekleyen: sozlesmeler.filter(s => s.durum === 'imza_bekleniyor').length,
      imzali: sozlesmeler.filter(s => s.durum === 'imzalandi').length,
      yaklasan: yasayan.filter(s => { const g = kalanGun(s.bitisTarih); return g != null && g >= 0 && g <= 60 }).length,
    }
  }, [sozlesmeler])

  if (yukleniyor) return <SkeletonList />

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <p className="t-caption">
          Sözleşme numaraları otomatik üretilir (ZNA-DB-YYYY-NNNN). Bitişe 60/30/15 gün kala rozetler uyarır.
        </p>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => setWizardAcik(true)}>
          Yeni Sözleşme Oluştur
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <FiloKpi etiket="Yaşayan Sözleşme" deger={ozet.toplam} />
        <FiloKpi etiket="İmza Bekleyen" deger={ozet.imzaBekleyen} renk={ozet.imzaBekleyen > 0 ? '#B45309' : 'var(--text-primary)'} />
        <FiloKpi etiket="İmzalandı" deger={ozet.imzali} renk={ozet.imzali > 0 ? '#15803D' : 'var(--text-primary)'} />
        <FiloKpi etiket="60 Gün İçinde Bitiyor" deger={ozet.yaklasan} renk={ozet.yaklasan > 0 ? '#DC2626' : 'var(--text-primary)'} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Select value={durumFiltre} onChange={e => setDurumFiltre(e.target.value)} style={{ maxWidth: 240 }}>
          <option value="">Tüm durumlar</option>
          {Object.entries(SOZLESME_DURUMLARI).map(([id, d]) => <option key={id} value={id}>{d.isim}</option>)}
        </Select>
      </div>

      {gorunen.length === 0 ? (
        <EmptyState
          icon={<FileSignature size={32} strokeWidth={1.5} />}
          title="Bayi sözleşmesi yok"
          description='"Yeni Sözleşme Oluştur" ile şablondan otomatik sözleşme üretin.'
        />
      ) : (
        <Card style={{ padding: 0 }}>
          <Table>
            <THead>
              <TR>
                <TH>Sözleşme No</TH>
                <TH>Bayi</TH>
                <TH>Tarih</TH>
                <TH>Yenileme</TH>
                <TH>Durum</TH>
                <TH>İmzalı PDF</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {gorunen.map(s => {
                const d = SOZLESME_DURUMLARI[s.durum] || SOZLESME_DURUMLARI.olusturuldu
                return (
                  <TR key={s.id}>
                    <TD>
                      <strong>{s.sozlesmeNo}</strong>
                      {s.versiyon > 1 && <span className="t-caption"> v{s.versiyon}</span>}
                    </TD>
                    <TD>{s.firma?.firmaAdi || '—'}</TD>
                    <TD>{trTarih(s.sozlesmeTarihi)}</TD>
                    <TD>{['olusturuldu', 'imza_bekleniyor', 'imzalandi'].includes(s.durum) ? <YenilemeRozet bitis={s.bitisTarih} /> : <span className="t-caption">—</span>}</TD>
                    <TD><Badge tone={d.tone}>{d.isim}</Badge></TD>
                    <TD>{s.imzaliPdfUrl ? <Badge tone="aktif">Yüklendi</Badge> : <span className="t-caption">—</span>}</TD>
                    <TD><Button variant="ghost" size="sm" onClick={() => setAcik(s)}>Görüntüle</Button></TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </Card>
      )}

      {wizardAcik && (
        <YeniSozlesmeWizard
          firmalar={firmalar}
          sablonlar={sablonlar}
          kullanici={kullanici}
          onKapat={() => setWizardAcik(false)}
          onOlustu={() => { setWizardAcik(false); yukle() }}
        />
      )}

      {acik && (
        <SozlesmeGoruntuleModal
          sozlesme={acik}
          firma={acik.firma ? { ...acik.firma, id: acik.firmaId } : firmalar.find(f => f.id === acik.firmaId)}
          sablonlar={sablonlar}
          kullanici={kullanici}
          onKapat={() => setAcik(null)}
          onDegisti={() => { setAcik(null); yukle() }}
        />
      )}
    </>
  )
}

// ---------------- Şablonlar ----------------

const SABLON_DEGISKENLERI = [
  'sozlesme_no', 'sozlesme_tarihi', 'bayi_unvani', 'bayi_adresi', 'bayi_vergi_dairesi',
  'bayi_vergi_no', 'bayi_mersis_no', 'bayi_ticaret_sicil_no', 'bayi_yetkili_adi',
  'bayi_yetkili_unvani', 'bayi_telefon', 'bayi_eposta', 'bayi_kep_adresi',
  'bayi_yillik_hedef', 'bayi_vade_durumu', 'bayi_vade_gunu', 'bayi_kredi_limiti',
  'sozlesme_suresi', 'yetkili_satici_statusu', 'imza_yetkilisi',
]

const SABLON_TIPLERI = [
  { id: 'bayi',           isim: 'Bayi Sözleşmesi' },
  { id: 'musteri_satis',  isim: 'Müşteri Satış' },
  { id: 'bakim',          isim: 'Bakım' },
  { id: 'servis',         isim: 'Servis' },
  { id: 'gizlilik',       isim: 'Gizlilik' },
  { id: 'alt_yuklenici',  isim: 'Alt Yüklenici' },
  { id: 'proje_ozel',     isim: 'Proje Bazlı Özel Şartlar' },
]

function SablonlarSekmesi() {
  const { toast } = useToast()
  const { kullanici } = useAuth()
  const admin = kullanici?.rol === 'admin'
  const [sablonlar, setSablonlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [modal, setModal] = useState(null) // null | {} | sablon

  const yukle = () => sablonlariGetir(true).then(s => { setSablonlar(s); setYukleniyor(false) })
  useEffect(() => { yukle() }, [])

  if (yukleniyor) return <SkeletonList />

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <p className="t-caption">
          Şablon gövdesindeki {'{{degisken}}'} alanları sözleşme üretilirken bayi kartından otomatik doldurulur.
        </p>
        {admin && (
          <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => setModal({})}>
            Yeni Şablon
          </Button>
        )}
      </div>

      {sablonlar.length === 0 ? (
        <EmptyState title="Şablon yok" description="Yeni şablon ekleyin." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sablonlar.map(s => (
            <Card key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{s.ad}</span>
                  <Badge tone="neutral">{SABLON_TIPLERI.find(t => t.id === s.tip)?.isim || s.tip}</Badge>
                  <Badge tone="brand">v{s.versiyon}</Badge>
                  {!s.aktif && <Badge tone="pasif">Pasif</Badge>}
                </div>
                <p className="t-caption" style={{ marginTop: 4 }}>
                  {(s.govde || '').slice(0, 140).replace(/\n/g, ' ')}…
                </p>
              </div>
              {admin && (
                <Button variant="secondary" size="sm" iconLeft={<Pencil size={13} strokeWidth={1.5} />} onClick={() => setModal(s)}>
                  Düzenle
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      {modal !== null && (
        <SablonModal
          mevcut={modal.id ? modal : null}
          onKapat={() => setModal(null)}
          onKaydedildi={() => { setModal(null); yukle() }}
          toast={toast}
        />
      )}
    </>
  )
}

function SablonModal({ mevcut, onKapat, onKaydedildi, toast }) {
  const govdeRef = useRef(null)
  const [form, setForm] = useState(() => mevcut
    ? { ad: mevcut.ad, tip: mevcut.tip, govde: mevcut.govde, aktif: mevcut.aktif, versiyon: mevcut.versiyon }
    : { ad: '', tip: 'bayi', govde: '', aktif: true, versiyon: 1 })
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const degiskenEkle = (d) => {
    const ta = govdeRef.current
    const eklenecek = `{{${d}}}`
    if (!ta) { setForm(f => ({ ...f, govde: (f.govde || '') + eklenecek })); return }
    const bas = ta.selectionStart ?? (form.govde || '').length
    const son = ta.selectionEnd ?? bas
    setForm(f => ({ ...f, govde: (f.govde || '').slice(0, bas) + eklenecek + (f.govde || '').slice(son) }))
  }

  const kaydet = async () => {
    if (!form.ad?.trim()) { toast.error('Şablon adı gerekli.'); return }
    if (!form.govde?.trim()) { toast.error('Şablon gövdesi boş olamaz.'); return }
    setKaydediliyor(true)
    const sonuc = mevcut
      ? await sablonGuncelle(mevcut.id, { ...form, versiyon: (mevcut.versiyon || 1) + 1 })
      : await sablonEkle(form)
    setKaydediliyor(false)
    if (sonuc?._hata) { toast.error('Kaydedilemedi: ' + sonuc._hata); return }
    toast.success(mevcut ? 'Şablon güncellendi (versiyon arttı).' : 'Şablon eklendi.')
    onKaydedildi()
  }

  return (
    <Modal open onClose={onKapat} title={mevcut ? `Şablonu Düzenle — ${mevcut.ad}` : 'Yeni Şablon'} width={860}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <div>
            <Label>Şablon adı *</Label>
            <Input value={form.ad} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))} />
          </div>
          <div>
            <Label>Tip</Label>
            <Select value={form.tip} onChange={e => setForm(f => ({ ...f, tip: e.target.value }))}>
              {SABLON_TIPLERI.map(t => <option key={t.id} value={t.id}>{t.isim}</option>)}
            </Select>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', font: '500 13px/18px var(--font-sans)', color: 'var(--text-secondary)', height: 36 }}>
            <input type="checkbox" checked={!!form.aktif} onChange={e => setForm(f => ({ ...f, aktif: e.target.checked }))}
              style={{ width: 15, height: 15, accentColor: 'var(--brand-primary)' }} />
            Aktif
          </label>
        </div>

        <div>
          <Label>Değişkenler (tıkla → imlece ekle)</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {SABLON_DEGISKENLERI.map(d => (
              <button key={d} onClick={() => degiskenEkle(d)}
                style={{
                  padding: '2px 8px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                  border: '1px solid var(--border-default)', background: 'var(--surface-sunken)',
                  font: '500 11px/16px var(--font-mono)', color: 'var(--text-secondary)',
                }}>
                {`{{${d}}}`}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Gövde *</Label>
          <Textarea ref={govdeRef} rows={18} value={form.govde}
            onChange={e => setForm(f => ({ ...f, govde: e.target.value }))}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.55 }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" onClick={onKapat} disabled={kaydediliyor}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------- Eksik Evrak Takibi ----------------

function EksikEvrakSekmesi() {
  const navigate = useNavigate()
  const [kayitlar, setKayitlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)

  useEffect(() => {
    eksikEvrakKayitlari().then(k => { setKayitlar(k); setYukleniyor(false) })
  }, [])

  const gruplar = useMemo(() => {
    const map = new Map()
    for (const k of kayitlar) {
      // Aktif olmayan pipeline bayileri göster; koşullu evrak yalnız vade talebi varsa
      const tanim = EVRAK_TIPLERI.find(t => t.id === k.evrakTipi)
      if (tanim?.kosullu && !k.firma?.vadeTalebi) continue
      const fid = k.firma?.id
      if (!fid) continue
      if (!map.has(fid)) map.set(fid, { firma: k.firma, evraklar: [] })
      map.get(fid).evraklar.push(k)
    }
    return [...map.values()]
  }, [kayitlar])

  if (yukleniyor) return <SkeletonList />
  if (!gruplar.length) {
    return <EmptyState title="Eksik evrak yok" description="Tüm bayi evrakları onaylı görünüyor. 👏" />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {gruplar.map(({ firma, evraklar }) => {
        const s = bayiStatu(firma.bayiStatusu || 'aday')
        return (
          <Card key={firma.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/bayiler/${firma.id}`)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{firma.firmaAdi}</span>
                {firma.kod && <CodeBadge>{firma.kod}</CodeBadge>}
                <Badge tone={s.tone}>{s.isim}</Badge>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--brand-primary)', font: '500 12px/18px var(--font-sans)' }}>
                Sürece git <ArrowRight size={14} strokeWidth={1.5} />
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {evraklar.map(e => {
                const tanim = EVRAK_TIPLERI.find(t => t.id === e.evrakTipi)
                const d = EVRAK_DURUMLARI[e.durum] || EVRAK_DURUMLARI.bekleniyor
                return (
                  <Badge key={e.id} tone={d.tone}>
                    {tanim?.isim || e.evrakTipi}: {d.isim}
                  </Badge>
                )
              })}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ---------------- Onay Bekleyenler ----------------

function OnayBekleyenlerSekmesi() {
  const navigate = useNavigate()
  const [kayitlar, setKayitlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)

  useEffect(() => {
    onayKayitlariTumu().then(k => { setKayitlar(k); setYukleniyor(false) })
  }, [])

  const gruplar = useMemo(() => {
    const map = new Map()
    for (const k of kayitlar) {
      const fid = k.firma?.id
      if (!fid) continue
      if (!map.has(fid)) map.set(fid, { firma: k.firma, adimlar: new Map() })
      map.get(fid).adimlar.set(k.adim, k)
    }
    // Aktif olmayan + en az bir adımı bekleyen bayiler
    return [...map.values()].filter(g =>
      g.firma.bayiStatusu !== 'aktif'
      && [...g.adimlar.values()].some(a => a.durum === 'bekliyor' || a.durum === 'reddedildi'))
  }, [kayitlar])

  if (yukleniyor) return <SkeletonList />
  if (!gruplar.length) {
    return <EmptyState title="Onay bekleyen bayi yok" description="Aktivasyon sürecinde bekleyen adım bulunmuyor." />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {gruplar.map(({ firma, adimlar }) => {
        const s = bayiStatu(firma.bayiStatusu || 'aday')
        return (
          <Card key={firma.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/bayiler/${firma.id}`)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{firma.firmaAdi}</span>
                {firma.kod && <CodeBadge>{firma.kod}</CodeBadge>}
                <Badge tone={s.tone}>{s.isim}</Badge>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--brand-primary)', font: '500 12px/18px var(--font-sans)' }}>
                Onay sürecine git <ArrowRight size={14} strokeWidth={1.5} />
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {ONAY_ADIMLARI.map(a => {
                const o = adimlar.get(a.id)
                const tone = o?.durum === 'onaylandi' ? 'aktif' : o?.durum === 'reddedildi' ? 'kayip' : 'beklemede'
                const metin = o?.durum === 'onaylandi' ? 'Onaylı' : o?.durum === 'reddedildi' ? 'Red' : 'Bekliyor'
                return <Badge key={a.id} tone={tone}>{a.isim}: {metin}</Badge>
              })}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ---------------- Genel Sözleşmeler (eski mini modül) ----------------

function GenelSozlesmeler() {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { kullanici } = useAuth()
  const [sozlesmeler, setSozlesmeler] = useState([])
  const [musteriler, setMusteriler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [modal, setModal] = useState(null) // null | {} (yeni) | sozlesme (düzenle)
  const [tipFiltre, setTipFiltre] = useState('')

  const yukle = async () => {
    const [s, m] = await Promise.all([sozlesmeleriGetir(), musterileriGetir()])
    setSozlesmeler(s); setMusteriler(m || [])
    setYukleniyor(false)
  }
  useEffect(() => { yukle() }, [])

  const gorunen = useMemo(() =>
    tipFiltre ? sozlesmeler.filter(s => s.sozlesmeTipi === tipFiltre) : sozlesmeler,
  [sozlesmeler, tipFiltre])

  const ozet = useMemo(() => {
    const aktifler = sozlesmeler.filter(s => s.aktif)
    return {
      aktif: aktifler.length,
      yaklasan: aktifler.filter(s => { const g = kalanGun(s.bitisTarih); return g != null && g >= 0 && g <= 30 }).length,
      gecen: aktifler.filter(s => { const g = kalanGun(s.bitisTarih); return g != null && g < 0 }).length,
      yillikTutar: aktifler.reduce((t, s) => t + Number(s.tutar || 0), 0),
    }
  }, [sozlesmeler])

  const sil = async (s) => {
    const onay = await confirm({
      baslik: 'Sözleşmeyi Sil',
      mesaj: `"${s.baslik}" sözleşmesi kalıcı olarak silinsin mi?`,
      onayMetin: 'Sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    const ok = await sozlesmeSil(s)
    if (ok) { toast.success('Sözleşme silindi.'); yukle() } else toast.error('Silinemedi.')
  }

  const dosyaAc = async (path) => {
    const url = await filoDosyaUrl(path)
    if (url) window.open(url, '_blank')
    else toast.error('Dosya açılamadı.')
  }

  if (yukleniyor) return <SkeletonList />

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <p className="t-caption">
          Bakım / kiralama / hizmet sözleşmeleri. Bitişe 30 gün kalanlar sabah özetinde görünür.
        </p>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => setModal({})}>
          Yeni Sözleşme
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <FiloKpi etiket="Aktif Sözleşme" deger={ozet.aktif} />
        <FiloKpi etiket="30 Gün İçinde Bitiyor" deger={ozet.yaklasan} renk={ozet.yaklasan > 0 ? '#B45309' : 'var(--text-primary)'} />
        <FiloKpi etiket="Süresi Geçmiş" deger={ozet.gecen} renk={ozet.gecen > 0 ? '#DC2626' : 'var(--text-primary)'} />
        <FiloKpi etiket="Aktif Sözleşme Değeri" deger={fmtTL(ozet.yillikTutar)} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Select value={tipFiltre} onChange={e => setTipFiltre(e.target.value)} style={{ maxWidth: 240 }}>
          <option value="">Tüm tipler</option>
          {SOZLESME_TIPLERI.map(t => <option key={t.id} value={t.id}>{t.isim}</option>)}
        </Select>
      </div>

      {gorunen.length === 0 ? (
        <EmptyState
          icon={<FileSignature size={32} strokeWidth={1.5} />}
          title="Sözleşme kaydı yok"
          description='"Yeni Sözleşme" ile bakım ve hizmet sözleşmelerinizi takibe alın.'
        />
      ) : (
        <Card style={{ padding: 0 }}>
          <Table>
            <THead>
              <TR>
                <TH>Sözleşme</TH>
                <TH>Müşteri</TH>
                <TH>Tip</TH>
                <TH>Bitiş</TH>
                <TH>Tutar</TH>
                <TH>Dosya</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {gorunen.map(s => (
                <TR key={s.id} style={{ opacity: s.aktif ? 1 : 0.55 }}>
                  <TD>
                    <strong>{s.baslik}</strong>
                    {!s.aktif && <Badge tone="pasif" style={{ marginLeft: 6 }}>Pasif</Badge>}
                    {s.otomatikYenileme && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>otomatik yenilenir</div>}
                  </TD>
                  <TD>{s.musteri?.firma || s.firmaAdi || '—'}</TD>
                  <TD>{SOZLESME_TIPLERI.find(t => t.id === s.sozlesmeTipi)?.isim || s.sozlesmeTipi}</TD>
                  <TD>{s.aktif ? <BitisRozet bitis={s.bitisTarih} /> : <span style={{ fontSize: 12 }}>{s.bitisTarih}</span>}</TD>
                  <TD>{fmtTL(s.tutar)}</TD>
                  <TD>
                    {s.dosyaUrl ? (
                      <Button variant="ghost" size="sm" iconLeft={<ExternalLink size={13} strokeWidth={1.5} />} onClick={() => dosyaAc(s.dosyaUrl)}>Aç</Button>
                    ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                  </TD>
                  <TD>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button variant="ghost" size="sm" onClick={() => setModal(s)} title="Düzenle">
                        <Pencil size={14} strokeWidth={1.5} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => sil(s)} title="Sil">
                        <Trash2 size={14} strokeWidth={1.5} />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {modal !== null && (
        <SozlesmeModal
          mevcut={modal.id ? modal : null}
          musteriler={musteriler}
          kullanici={kullanici}
          onKapat={() => setModal(null)}
          onKaydedildi={() => { setModal(null); yukle() }}
        />
      )}
    </>
  )
}

function SozlesmeModal({ mevcut, musteriler, kullanici, onKapat, onKaydedildi }) {
  const { toast } = useToast()
  const dosyaRef = useRef(null)
  const [form, setForm] = useState(() => mevcut ? {
    baslik: mevcut.baslik, sozlesmeTipi: mevcut.sozlesmeTipi,
    musteriId: mevcut.musteriId || '', firmaAdi: mevcut.firmaAdi || '',
    baslangicTarih: mevcut.baslangicTarih || '', bitisTarih: mevcut.bitisTarih || '',
    tutar: mevcut.tutar || '', otomatikYenileme: !!mevcut.otomatikYenileme,
    notlar: mevcut.notlar || '', aktif: mevcut.aktif !== false,
  } : { sozlesmeTipi: 'bakim', aktif: true, otomatikYenileme: false })
  const [dosya, setDosya] = useState(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const alan = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const kaydet = async () => {
    if (!form.baslik?.trim()) { toast.error('Sözleşme başlığı gerekli.'); return }
    if (!form.bitisTarih) { toast.error('Bitiş tarihi gerekli — takip bu tarihten çalışır.'); return }
    setKaydediliyor(true)
    let dosyaPath = mevcut?.dosyaUrl || null
    if (dosya) {
      dosyaPath = await filoDosyaYukle(dosya, 'sozlesme')
      if (!dosyaPath) { setKaydediliyor(false); toast.error('Dosya yüklenemedi: ' + (sonYuklemeHata || 'bilinmeyen hata')); return }
    }
    const payload = {
      baslik: form.baslik.trim(),
      sozlesmeTipi: form.sozlesmeTipi,
      musteriId: form.musteriId ? Number(form.musteriId) : null,
      firmaAdi: form.firmaAdi?.trim() || null,
      baslangicTarih: form.baslangicTarih || null,
      bitisTarih: form.bitisTarih,
      tutar: form.tutar ? Number(form.tutar) : null,
      otomatikYenileme: !!form.otomatikYenileme,
      dosyaUrl: dosyaPath,
      notlar: form.notlar?.trim() || null,
      aktif: !!form.aktif,
    }
    const sonuc = mevcut
      ? await sozlesmeGuncelle(mevcut.id, payload)
      : await sozlesmeEkle({ ...payload, olusturanId: kullanici?.id || null })
    setKaydediliyor(false)
    if (sonuc?._hata) { toast.error('Kaydedilemedi: ' + sonuc._hata); return }
    toast.success(mevcut ? 'Sözleşme güncellendi.' : 'Sözleşme kaydedildi.')
    onKaydedildi()
  }

  return (
    <Modal open onClose={onKapat} title={mevcut ? 'Sözleşmeyi Düzenle' : 'Yeni Sözleşme'} width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div>
            <Label>Başlık *</Label>
            <Input value={form.baslik || ''} onChange={e => alan('baslik', e.target.value)} placeholder="2026 Kamera Bakım Sözleşmesi" />
          </div>
          <div>
            <Label>Tip</Label>
            <Select value={form.sozlesmeTipi} onChange={e => alan('sozlesmeTipi', e.target.value)}>
              {SOZLESME_TIPLERI.map(t => <option key={t.id} value={t.id}>{t.isim}</option>)}
            </Select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label>Müşteri</Label>
            <Select value={form.musteriId || ''} onChange={e => alan('musteriId', e.target.value)}>
              <option value="">— Seçiniz —</option>
              {musteriler.map(m => (
                <option key={m.id} value={m.id}>{m.firma || `${m.ad ?? ''} ${m.soyad ?? ''}`.trim()}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>veya Firma Adı (serbest)</Label>
            <Input value={form.firmaAdi || ''} onChange={e => alan('firmaAdi', e.target.value)} placeholder="Kayıtlı müşteri değilse" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <Label>Başlangıç</Label>
            <Input type="date" value={form.baslangicTarih || ''} onChange={e => alan('baslangicTarih', e.target.value)} />
          </div>
          <div>
            <Label>Bitiş *</Label>
            <Input type="date" value={form.bitisTarih || ''} onChange={e => alan('bitisTarih', e.target.value)} />
          </div>
          <div>
            <Label>Tutar (₺)</Label>
            <Input type="number" value={form.tutar || ''} onChange={e => alan('tutar', e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Notlar</Label>
          <Textarea rows={2} value={form.notlar || ''} onChange={e => alan('notlar', e.target.value)} placeholder="Kapsam, özel şartlar…" />
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', font: '500 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={!!form.otomatikYenileme} onChange={e => alan('otomatikYenileme', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--brand-primary)' }} />
            Otomatik yenilenir
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', font: '500 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={!!form.aktif} onChange={e => alan('aktif', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--brand-primary)' }} />
            Aktif
          </label>
          <Button variant="secondary" size="sm" iconLeft={<Paperclip size={13} strokeWidth={1.5} />} onClick={() => dosyaRef.current?.click()}>
            {dosya ? dosya.name.slice(0, 20) : (mevcut?.dosyaUrl ? 'Dosyayı Değiştir' : 'Dosya Ekle')}
          </Button>
          <input ref={dosyaRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
            onChange={e => setDosya(e.target.files?.[0] || null)} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <Button variant="ghost" onClick={onKapat} disabled={kaydediliyor}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
