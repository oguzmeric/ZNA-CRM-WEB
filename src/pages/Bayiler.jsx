// Bayiler (eski Firmalar) — bayi kartları + statü takibi (mig 154).
// Kart tıklanınca /bayiler/:id detayına gider (sözleşme + evrak + onay süreci orada).

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Phone, Mail, MapPin, Receipt, ArrowRight, UserRound } from 'lucide-react'
import CustomSelect from '../components/CustomSelect'
import { SkeletonList } from '../components/Skeleton'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { firmalariGetir, firmaEkle, firmaGuncelle, firmaSil as dbFirmaSil } from '../services/firmaService'
import { kullanicilariGetir } from '../services/kullaniciService'
import { BAYI_STATULERI, BAYI_TURLERI, bayiStatu } from '../services/bayiService'
import { trContains } from '../lib/trSearch'
import {
  Button, SearchInput, Input, Label,
  Card, Badge, CodeBadge, Avatar, EmptyState,
} from '../components/ui'

const sektorler = [
  'Teknoloji', 'Güvenlik', 'İnşaat', 'Sağlık', 'Eğitim',
  'Üretim', 'Lojistik', 'Finans', 'Perakende', 'Diğer',
]

const bosForm = {
  firmaAdi: '', vergiDairesi: '', vergiNo: '', mersisNo: '', ticaretSicilNo: '',
  sektor: '', bayiTuru: '', faaliyetAlani: '',
  telefon: '', email: '', kepAdresi: '', sehir: '', ilce: '', bolge: '', adres: '',
  yetkiliAdi: '', yetkiliUnvani: '', yetkiliTelefon: '', yetkiliEposta: '',
  satisTemsilcisiId: '', notlar: '',
}

const BOLUM_STIL = {
  gridColumn: '1 / -1',
  font: '600 11px/16px var(--font-sans)',
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  borderBottom: '1px solid var(--border-default)',
  paddingBottom: 4,
  marginTop: 4,
}

function Bayiler() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [firmalar, setFirmalar] = useState([])
  const [personel, setPersonel] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [form, setForm] = useState(bosForm)
  const [goster, setGoster] = useState(false)
  const [duzenleId, setDuzenleId] = useState(null)
  const [arama, setArama] = useState('')
  const [statuFiltre, setStatuFiltre] = useState('')

  useEffect(() => {
    firmalariGetir()
      .then(data => setFirmalar(data || []))
      .catch(err => console.error('[Bayiler yükle]', err))
      .finally(() => setYukleniyor(false))
    kullanicilariGetir()
      .then(list => setPersonel((list || []).filter(k => k.tip !== 'musteri')))
      .catch(err => console.error('[Bayiler personel]', err))
  }, [])

  const firmaKoduOlustur = (mevcut) => `BAYI-${String(mevcut.length + 1).padStart(4, '0')}`

  const alan = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const kaydet = async () => {
    if (!form.firmaAdi) { toast.error('Bayi ticari unvanı zorunludur.'); return }
    const payload = { ...form, satisTemsilcisiId: form.satisTemsilcisiId ? Number(form.satisTemsilcisiId) : null }
    try {
      if (duzenleId) {
        const guncellendi = await firmaGuncelle(duzenleId, payload)
        if (guncellendi) setFirmalar(prev => prev.map(f => f.id === duzenleId ? guncellendi : f))
        toast.success('Bayi güncellendi.')
        setDuzenleId(null)
      } else {
        const yeni = await firmaEkle({ ...payload, kod: firmaKoduOlustur(firmalar), bayiStatusu: 'aday', olusturmaTarih: new Date().toISOString() })
        if (yeni) setFirmalar(prev => [yeni, ...prev])
        toast.success('Bayi kaydedildi. Sözleşme ve evrak sürecini bayi detayından yönetebilirsiniz.')
      }
      setForm(bosForm); setGoster(false)
    } catch (e) {
      toast.error('Kaydedilemedi: ' + (e?.message || 'bilinmeyen hata'))
    }
  }

  const duzenleAc = (f) => {
    setForm({
      ...bosForm,
      ...Object.fromEntries(Object.keys(bosForm).map(k => [k, f[k] ?? ''])),
      satisTemsilcisiId: f.satisTemsilcisiId || '',
    })
    setDuzenleId(f.id); setGoster(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const firmaSil = async (id) => {
    const onay = await confirm({
      baslik: 'Bayiyi Sil',
      mesaj: 'Bu bayiyi silmek istediğinize emin misiniz? Sözleşme ve evrak kayıtları da silinir. Bu işlem geri alınamaz.',
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    await dbFirmaSil(id)
    setFirmalar(prev => prev.filter(f => f.id !== id))
    toast.success('Bayi silindi.')
  }

  const gorunenler = firmalar.filter(f =>
    trContains([f.firmaAdi, f.kod, f.vergiNo, f.sektor, f.sehir, f.yetkiliAdi].filter(Boolean).join(' '), arama)
    && (!statuFiltre || (f.bayiStatusu || 'aday') === statuFiltre)
  )

  if (yukleniyor) return <SkeletonList />

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Bayiler</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            <span className="tabular-nums">{firmalar.length}</span> bayi kayıtlı ·{' '}
            <span className="tabular-nums">{firmalar.filter(f => f.bayiStatusu === 'aktif').length}</span> aktif
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => { setGoster(true); setDuzenleId(null); setForm(bosForm) }}>
          Yeni bayi
        </Button>
      </div>

      {/* Arama + statü filtresi */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', maxWidth: 560 }}>
          <SearchInput
            value={arama}
            onChange={e => setArama(e.target.value)}
            placeholder="Unvan, kod, vergi no, yetkili veya şehir ara…"
          />
        </div>
        <div style={{ width: 220 }}>
          <CustomSelect value={statuFiltre} onChange={e => setStatuFiltre(e.target.value)}>
            <option value="">Tüm statüler</option>
            {BAYI_STATULERI.map(s => <option key={s.id} value={s.id}>{s.isim}</option>)}
          </CustomSelect>
        </div>
      </div>

      {/* Form */}
      {goster && (
        <Card style={{ marginBottom: 16 }}>
          <h2 className="t-h2" style={{ marginBottom: 16 }}>
            {duzenleId ? 'Bayiyi Düzenle' : 'Yeni Bayi'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>

            <div style={BOLUM_STIL}>Kimlik Bilgileri</div>
            <div>
              <Label required>Bayi ticari unvanı</Label>
              <Input value={form.firmaAdi} onChange={e => alan('firmaAdi', e.target.value)} placeholder="Demo Teknoloji A.Ş." />
            </div>
            <div>
              <Label>Vergi dairesi</Label>
              <Input value={form.vergiDairesi} onChange={e => alan('vergiDairesi', e.target.value)} placeholder="Kozyatağı" />
            </div>
            <div>
              <Label>Vergi numarası</Label>
              <Input value={form.vergiNo} onChange={e => alan('vergiNo', e.target.value)} placeholder="1234567890" />
            </div>
            <div>
              <Label>MERSİS numarası</Label>
              <Input value={form.mersisNo} onChange={e => alan('mersisNo', e.target.value)} placeholder="0123456789012345" />
            </div>
            <div>
              <Label>Ticaret sicil numarası</Label>
              <Input value={form.ticaretSicilNo} onChange={e => alan('ticaretSicilNo', e.target.value)} placeholder="123456-0" />
            </div>
            <div>
              <Label>Sektör</Label>
              <CustomSelect value={form.sektor} onChange={e => alan('sektor', e.target.value)}>
                <option value="">Seçin…</option>
                {sektorler.map(s => <option key={s} value={s}>{s}</option>)}
              </CustomSelect>
            </div>
            <div>
              <Label>Bayi türü</Label>
              <CustomSelect value={form.bayiTuru} onChange={e => alan('bayiTuru', e.target.value)}>
                <option value="">Seçin…</option>
                {BAYI_TURLERI.map(t => <option key={t} value={t}>{t}</option>)}
              </CustomSelect>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <Label>Faaliyet alanı</Label>
              <Input value={form.faaliyetAlani} onChange={e => alan('faaliyetAlani', e.target.value)} placeholder="Güvenlik sistemleri kurulumu ve satışı" />
            </div>

            <div style={BOLUM_STIL}>İletişim</div>
            <div>
              <Label>Telefon</Label>
              <Input value={form.telefon} onChange={e => alan('telefon', e.target.value)} placeholder="0212 000 00 00" />
            </div>
            <div>
              <Label>E-posta</Label>
              <Input type="email" value={form.email} onChange={e => alan('email', e.target.value)} placeholder="info@bayi.com" />
            </div>
            <div>
              <Label>KEP adresi</Label>
              <Input value={form.kepAdresi} onChange={e => alan('kepAdresi', e.target.value)} placeholder="firma@hs01.kep.tr" />
            </div>
            <div>
              <Label>İl</Label>
              <Input value={form.sehir} onChange={e => alan('sehir', e.target.value)} placeholder="İstanbul" />
            </div>
            <div>
              <Label>İlçe</Label>
              <Input value={form.ilce} onChange={e => alan('ilce', e.target.value)} placeholder="Kadıköy" />
            </div>
            <div>
              <Label>Bölge</Label>
              <Input value={form.bolge} onChange={e => alan('bolge', e.target.value)} placeholder="Marmara" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Label>Adres</Label>
              <Input value={form.adres} onChange={e => alan('adres', e.target.value)} placeholder="Mahalle, sokak, no…" />
            </div>

            <div style={BOLUM_STIL}>Yetkili Kişi</div>
            <div>
              <Label>Adı soyadı</Label>
              <Input value={form.yetkiliAdi} onChange={e => alan('yetkiliAdi', e.target.value)} placeholder="Ad Soyad" />
            </div>
            <div>
              <Label>Unvanı</Label>
              <Input value={form.yetkiliUnvani} onChange={e => alan('yetkiliUnvani', e.target.value)} placeholder="Genel Müdür" />
            </div>
            <div>
              <Label>Telefonu</Label>
              <Input value={form.yetkiliTelefon} onChange={e => alan('yetkiliTelefon', e.target.value)} placeholder="05xx xxx xx xx" />
            </div>
            <div>
              <Label>E-postası</Label>
              <Input type="email" value={form.yetkiliEposta} onChange={e => alan('yetkiliEposta', e.target.value)} placeholder="yetkili@bayi.com" />
            </div>

            <div style={BOLUM_STIL}>CRM</div>
            <div>
              <Label>Satış temsilcisi</Label>
              <CustomSelect value={form.satisTemsilcisiId} onChange={e => alan('satisTemsilcisiId', e.target.value)}>
                <option value="">Seçin…</option>
                {personel.map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
              </CustomSelect>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <Label>Notlar</Label>
              <Input value={form.notlar} onChange={e => alan('notlar', e.target.value)} placeholder="Kısa not…" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button variant="primary" onClick={kaydet}>{duzenleId ? 'Güncelle' : 'Kaydet'}</Button>
            <Button variant="secondary" onClick={() => { setGoster(false); setForm(bosForm); setDuzenleId(null) }}>İptal</Button>
          </div>
        </Card>
      )}

      {/* Grid */}
      {gorunenler.length === 0 ? (
        <EmptyState
          title={arama || statuFiltre ? 'Sonuç bulunamadı' : 'Henüz bayi eklenmedi'}
          description={arama || statuFiltre ? 'Farklı bir arama veya filtre deneyin.' : 'Üstteki butonla ilk bayi kartını oluşturabilirsin.'}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
          {gorunenler.map(f => {
            const statu = bayiStatu(f.bayiStatusu || 'aday')
            const temsilci = personel.find(p => Number(p.id) === Number(f.satisTemsilcisiId))
            return (
              <Card
                key={f.id}
                onClick={() => navigate(`/bayiler/${f.id}`)}
                style={{ cursor: 'pointer', transition: 'border-color 120ms, box-shadow 120ms' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-primary)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <Avatar name={f.firmaAdi} size="md" />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {f.firmaAdi}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                        <Badge tone={statu.tone}>{statu.isim}</Badge>
                        {f.kod && <CodeBadge>{f.kod}</CodeBadge>}
                        {f.bayiTuru && <Badge tone="neutral">{f.bayiTuru}</Badge>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button
                      aria-label="Düzenle"
                      onClick={() => duzenleAc(f)}
                      style={{
                        width: 32, height: 32,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                    >
                      <Pencil size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      aria-label="Sil"
                      onClick={() => firmaSil(f.id)}
                      style={{
                        width: 32, height: 32,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                {/* İletişim */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12, font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                  {f.telefon && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontVariantNumeric: 'tabular-nums' }}><Phone size={11} strokeWidth={1.5} />{f.telefon}</span>}
                  {f.email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mail size={11} strokeWidth={1.5} />{f.email}</span>}
                  {f.sehir && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={11} strokeWidth={1.5} />{[f.ilce, f.sehir].filter(Boolean).join(' / ')}</span>}
                  {f.vergiNo && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontVariantNumeric: 'tabular-nums' }}><Receipt size={11} strokeWidth={1.5} />{f.vergiNo}</span>}
                  {f.yetkiliAdi && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><UserRound size={11} strokeWidth={1.5} />{f.yetkiliAdi}</span>}
                </div>

                {/* Temsilci + "Detaya git" */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--border-default)' }}>
                  <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                    {temsilci ? `Satış temsilcisi: ${temsilci.ad}` : 'Satış temsilcisi atanmadı'}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--brand-primary)', font: '500 12px/18px var(--font-sans)' }}>
                    Süreci yönet <ArrowRight size={14} strokeWidth={1.5} />
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Bayiler
