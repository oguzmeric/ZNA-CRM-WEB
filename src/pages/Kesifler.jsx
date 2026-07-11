// Keşifler — saha keşif kayıtları listesi + yeni keşif oluşturma.
// Detay/kalemler/fotoğraflar/dönüşümler KesifDetay sayfasında.

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, MapPin, Compass, FileText, CheckSquare, Wrench, Camera } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { kesifleriGetir, kesifEkle, KESIF_DURUMLARI, KESIF_ONCELIKLERI } from '../services/kesifService'
import { musterileriGetir } from '../services/musteriService'
import CustomSelect from '../components/CustomSelect'
import { SkeletonList } from '../components/Skeleton'
import { trContains } from '../lib/trSearch'
import {
  Button, SearchInput, Input, Textarea, Label,
  Card, Badge, CodeBadge, EmptyState, Modal, SegmentedControl,
} from '../components/ui'

const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'

export default function Kesifler() {
  const navigate = useNavigate()
  const { kullanici } = useAuth()
  const { toast } = useToast()

  const [kesifler, setKesifler] = useState([])
  const [musteriler, setMusteriler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [arama, setArama] = useState('')
  const [durumFiltre, setDurumFiltre] = useState('hepsi')
  const [yeniModal, setYeniModal] = useState(false)

  useEffect(() => {
    Promise.all([kesifleriGetir(), musterileriGetir()])
      .then(([k, m]) => { setKesifler(k || []); setMusteriler(m || []) })
      .catch(e => {
        console.error('[Kesifler]', e)
        toast.error('Keşifler yüklenemedi: ' + (e?.message || 'bilinmeyen hata'))
      })
      .finally(() => setYukleniyor(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const gorunen = useMemo(() => kesifler
    .filter(k => durumFiltre === 'hepsi' || k.durum === durumFiltre)
    .filter(k => trContains(`${k.kesifNo || ''} ${k.firmaAdi || ''} ${k.lokasyon || ''} ${k.kesfiYapan || ''}`, arama)),
  [kesifler, durumFiltre, arama])

  if (yukleniyor) return <SkeletonList />

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Compass size={22} strokeWidth={1.5} /> Keşifler
          </h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            Saha keşif kayıtları — notlar, malzeme listesi, fotoğraflar. Keşiften tek tıkla teklif, görev veya servis oluştur.
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => setYeniModal(true)}>
          Yeni Keşif
        </Button>
      </div>

      {/* Filtre */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 240, maxWidth: 440 }}>
          <SearchInput
            value={arama}
            onChange={e => setArama(e.target.value)}
            placeholder="Keşif no, firma, lokasyon veya kişi ara…"
          />
        </div>
        <SegmentedControl
          options={[
            { value: 'hepsi', label: 'Tümü' },
            ...KESIF_DURUMLARI.map(d => ({ value: d.id, label: d.ad })),
          ]}
          value={durumFiltre}
          onChange={setDurumFiltre}
        />
      </div>

      {/* Liste */}
      {gorunen.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Compass size={28} strokeWidth={1.5} />}
            title={arama ? 'Aramayla eşleşen keşif yok' : 'Henüz keşif kaydı yok'}
            description={arama ? 'Farklı bir arama dene.' : '"Yeni Keşif" ile ilk saha keşfini kaydet — telefondan da kullanılabilir.'}
          />
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {gorunen.map(k => {
            const durum = KESIF_DURUMLARI.find(d => d.id === k.durum)
            return (
              <Card
                key={k.id}
                padding={16}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/kesifler/${k.id}`)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <CodeBadge>{k.kesifNo}</CodeBadge>
                  {durum && <Badge tone={durum.tone}>{durum.ad}</Badge>}
                  {(() => {
                    const o = KESIF_ONCELIKLERI.find(x => x.id === k.oncelik)
                    return o && o.id !== 'normal' ? (
                      <span style={{
                        padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                        color: o.renk, background: `${o.renk}18`, border: `1px solid ${o.renk}55`,
                      }}>{o.ad.toUpperCase()}</span>
                    ) : null
                  })()}
                  {/* Dönüşüm rozetleri */}
                  {k.teklifId && <Badge tone="brand" style={{ fontSize: 9 }}><FileText size={9} style={{ display: 'inline', verticalAlign: -1 }} /> TEKLİF</Badge>}
                  {k.gorevId && <Badge tone="beklemede" style={{ fontSize: 9 }}><CheckSquare size={9} style={{ display: 'inline', verticalAlign: -1 }} /> GÖREV</Badge>}
                  {k.servisTalepId && <Badge tone="aktif" style={{ fontSize: 9 }}><Wrench size={9} style={{ display: 'inline', verticalAlign: -1 }} /> SERVİS</Badge>}
                </div>
                <div style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 4 }}>
                  {k.firmaAdi || '—'}
                </div>
                {k.kesifBasligi && (
                  <div className="t-caption" style={{ marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {k.kesifBasligi}
                  </div>
                )}
                {k.lokasyon && (
                  <div className="t-caption" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                    <MapPin size={11} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.lokasyon}</span>
                  </div>
                )}
                <div className="t-caption" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{k.kesfiYapan || k.olusturanAd || '—'}</span>
                  <span>{fmtTarih(k.kesifTarihi)}</span>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Yeni keşif modalı */}
      {yeniModal && (
        <YeniKesifModal
          musteriler={musteriler}
          kullanici={kullanici}
          onKapat={() => setYeniModal(false)}
          onOlusturuldu={(yeni) => {
            setYeniModal(false)
            toast.success(`Keşif oluşturuldu (${yeni.kesifNo}).`)
            navigate(`/kesifler/${yeni.id}`)
          }}
        />
      )}
    </div>
  )
}

function YeniKesifModal({ musteriler, kullanici, onKapat, onOlusturuldu }) {
  const { toast } = useToast()
  const [musteriId, setMusteriId] = useState('')
  const [firmaAdi, setFirmaAdi] = useState('')
  const [lokasyon, setLokasyon] = useState('')
  const [kesifTarihi, setKesifTarihi] = useState(new Date().toISOString().split('T')[0])
  const [kesfiYapan, setKesfiYapan] = useState(kullanici?.ad || '')
  const [genelNot, setGenelNot] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const musteriSec = (id) => {
    setMusteriId(id)
    const m = musteriler.find(x => String(x.id) === String(id))
    if (m) setFirmaAdi(m.firma || '')
  }

  const kaydet = async () => {
    if (!firmaAdi.trim() && !musteriId) { toast.warning('Müşteri seçin veya firma adı girin.'); return }
    setKaydediliyor(true)
    try {
      const yeni = await kesifEkle({
        musteriId: musteriId ? Number(musteriId) : null,
        firmaAdi: firmaAdi.trim(),
        lokasyon: lokasyon.trim(),
        kesifTarihi,
        kesfiYapan: kesfiYapan.trim(),
        genelNot: genelNot.trim() || null,
        durum: 'acik',
        olusturanId: kullanici?.id ? Number(kullanici.id) : null,
        olusturanAd: kullanici?.ad || '',
      })
      onOlusturuldu(yeni)
    } catch (e) {
      toast.error('Keşif oluşturulamadı: ' + (e?.message || 'bilinmeyen hata'))
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <Modal
      open
      onClose={onKapat}
      title="Yeni Keşif"
      width={480}
      footer={
        <>
          <Button variant="secondary" onClick={onKapat}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Oluşturuluyor…' : 'Oluştur ve Aç'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <Label>Müşteri</Label>
          <CustomSelect value={musteriId} onChange={e => musteriSec(e.target.value)}>
            <option value="">Müşteri seç… (veya aşağıya firma yaz)</option>
            {musteriler.map(m => (
              <option key={m.id} value={m.id}>{m.firma || `${m.ad || ''} ${m.soyad || ''}`}</option>
            ))}
          </CustomSelect>
        </div>
        <div>
          <Label required>Firma adı</Label>
          <Input value={firmaAdi} onChange={e => setFirmaAdi(e.target.value)} placeholder="Firma / saha adı" />
        </div>
        <div>
          <Label>Lokasyon / Adres</Label>
          <Input value={lokasyon} onChange={e => setLokasyon(e.target.value)} placeholder="örn. Başakşehir fabrika — B blok" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label>Keşif tarihi</Label>
            <Input type="date" value={kesifTarihi} onChange={e => setKesifTarihi(e.target.value)} />
          </div>
          <div>
            <Label>Keşfi yapan</Label>
            <Input value={kesfiYapan} onChange={e => setKesfiYapan(e.target.value)} placeholder="İsim(ler)" />
          </div>
        </div>
        <div>
          <Label>Genel not</Label>
          <Textarea rows={3} value={genelNot} onChange={e => setGenelNot(e.target.value)} placeholder="Saha gözlemleri, müşteri talepleri…" />
        </div>
        <p className="t-caption" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Camera size={12} strokeWidth={1.5} /> Malzeme listesi ve fotoğraflar bir sonraki adımda (keşif detayında) eklenir.
        </p>
      </div>
    </Modal>
  )
}
