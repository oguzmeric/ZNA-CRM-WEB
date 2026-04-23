import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, MapPin, ArrowRight } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { musterileriGetir, musteriEkle, musteriGuncelle, musteriSil as dbMusteriSil } from '../services/musteriService'
import CustomSelect from '../components/CustomSelect'
import {
  Button, SearchInput, Input, Textarea, Label,
  Card, Badge, CodeBadge, Avatar, SegmentedControl, EmptyState,
} from '../components/ui'

const durumlar = [
  { id: 'aktif', isim: 'Aktif', tone: 'aktif' },
  { id: 'lead',  isim: 'Lead',  tone: 'lead' },
  { id: 'pasif', isim: 'Pasif', tone: 'pasif' },
  { id: 'kayip', isim: 'Kayıp', tone: 'kayip' },
]

const bosForm = {
  ad: '', soyad: '', firma: '', unvan: '', telefon: '', email: '',
  sehir: '', vergiNo: '', notlar: '', durum: 'lead', kod: '',
}

const trNormalize = (str = '') =>
  str.toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/İ/gi, 'i').replace(/I/g, 'i')

function firmaKoduOlustur(firmaAdi, mevcutMusteriler, mevcutKod = '') {
  const temiz = firmaAdi.toUpperCase().replace(/[^A-ZÇĞİÖŞÜ]/g, '')
  const prefix = temiz.substring(0, 3).padEnd(3, 'X')
  const ayniPrefix = mevcutMusteriler.filter(m => m.kod?.startsWith(prefix) && m.kod !== mevcutKod)
  const sayi = ayniPrefix.length + 1
  return `${prefix}-${String(sayi).padStart(4, '0')}`
}

function Musteriler() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [musteriler, setMusteriler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [form, setForm] = useState(bosForm)
  const [goster, setGoster] = useState(false)
  const [duzenleId, setDuzenleId] = useState(null)
  const [kodModu, setKodModu] = useState('otomatik')
  const [filtre, setFiltre] = useState('hepsi')
  const [arama, setArama] = useState('')

  useEffect(() => {
    musterileriGetir().then(data => { setMusteriler(data); setYukleniyor(false) })
  }, [])

  const formAc = () => {
    setForm(bosForm); setKodModu('otomatik'); setDuzenleId(null); setGoster(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const duzenleAc = (m, e) => {
    e.stopPropagation()
    setForm({
      ad: m.ad, soyad: m.soyad, firma: m.firma, unvan: m.unvan || '',
      telefon: m.telefon, email: m.email || '', sehir: m.sehir || '',
      vergiNo: m.vergiNo || '', notlar: m.notlar || '',
      durum: m.durum, kod: m.kod,
    })
    setKodModu('manuel'); setDuzenleId(m.id); setGoster(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleFirmaChange = (firmaAdi) => {
    const yeniForm = { ...form, firma: firmaAdi }
    if (kodModu === 'otomatik' && firmaAdi.length >= 2) {
      yeniForm.kod = firmaKoduOlustur(firmaAdi, musteriler)
    } else if (kodModu === 'otomatik') {
      yeniForm.kod = ''
    }
    setForm(yeniForm)
  }

  const handleKodModu = (mod) => {
    setKodModu(mod)
    if (mod === 'otomatik' && form.firma.length >= 2) {
      setForm({ ...form, kod: firmaKoduOlustur(form.firma, musteriler) })
    } else {
      setForm({ ...form, kod: '' })
    }
  }

  const kaydet = async () => {
    if (!form.ad || !form.soyad || !form.telefon || !form.firma) {
      toast.error('Ad, soyad, firma ve telefon zorunludur.')
      return
    }
    if (!form.kod) { toast.error('Müşteri kodu zorunludur.'); return }
    const kodVarMi = musteriler.find(m => m.kod === form.kod && m.id !== duzenleId)
    if (kodVarMi) { toast.error('Bu müşteri kodu zaten kullanılıyor.'); return }

    if (duzenleId) {
      const guncellendi = await musteriGuncelle(duzenleId, form)
      if (guncellendi) setMusteriler(prev => prev.map(m => m.id === duzenleId ? guncellendi : m))
      toast.success('Müşteri güncellendi.')
      setForm(bosForm); setDuzenleId(null); setGoster(false)
    } else {
      const yeni = await musteriEkle({ ...form, olusturmaTarih: new Date().toISOString() })
      if (yeni) {
        toast.success('Müşteri oluşturuldu.')
        navigate(`/musteriler/${yeni.id}`, { state: { yeniMusteri: true } })
      }
    }
  }

  const iptal = () => { setForm(bosForm); setDuzenleId(null); setGoster(false) }

  const musteriSil = async (id, e) => {
    e.stopPropagation()
    const onay = await confirm({
      baslik: 'Müşteriyi Sil',
      mesaj: 'Bu müşteriyi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      onayMetin: 'Evet, sil',
      iptalMetin: 'Vazgeç',
      tip: 'tehlikeli',
    })
    if (!onay) return
    await dbMusteriSil(id)
    setMusteriler(prev => prev.filter(m => m.id !== id))
    toast.success('Müşteri silindi.')
  }

  const gorunenMusteriler = musteriler
    .filter(m => filtre === 'hepsi' || m.durum === filtre)
    .filter(m =>
      arama === '' ||
      trNormalize(`${m.ad} ${m.soyad} ${m.firma} ${m.kod}`).includes(trNormalize(arama))
    )

  const filtreSayilari = {
    hepsi: musteriler.length,
    aktif: musteriler.filter(m => m.durum === 'aktif').length,
    lead:  musteriler.filter(m => m.durum === 'lead').length,
    pasif: musteriler.filter(m => m.durum === 'pasif').length,
    kayip: musteriler.filter(m => m.durum === 'kayip').length,
  }

  if (yukleniyor) {
    return <div style={{ padding: 24 }}><EmptyState title="Yükleniyor…" /></div>
  }

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Müşteriler</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            <span className="tabular-nums">{musteriler.length}</span> kayıt
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={formAc}>
          Yeni müşteri
        </Button>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 240, maxWidth: 480 }}>
          <SearchInput
            value={arama}
            onChange={e => setArama(e.target.value)}
            placeholder="İsim, firma veya müşteri kodu ara…"
          />
        </div>
        <SegmentedControl
          options={[
            { value: 'hepsi', label: 'Hepsi', count: filtreSayilari.hepsi },
            { value: 'aktif', label: 'Aktif', count: filtreSayilari.aktif },
            { value: 'lead',  label: 'Lead',  count: filtreSayilari.lead },
            { value: 'pasif', label: 'Pasif', count: filtreSayilari.pasif },
            { value: 'kayip', label: 'Kayıp', count: filtreSayilari.kayip },
          ]}
          value={filtre}
          onChange={setFiltre}
        />
      </div>

      {/* Form card */}
      {goster && (
        <Card style={{ marginBottom: 16 }}>
          <h2 className="t-h2" style={{ marginBottom: 16 }}>
            {duzenleId ? 'Müşteriyi Düzenle' : 'Yeni Müşteri'}
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <Label htmlFor="m-firma" required>Firma</Label>
              <Input
                id="m-firma"
                value={form.firma}
                onChange={e => handleFirmaChange(e.target.value)}
                placeholder="Başakşehir Belediyesi"
              />
            </div>
            <div>
              <Label required>Müşteri kodu</Label>
              {!duzenleId && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <button
                    onClick={() => handleKodModu('otomatik')}
                    style={{
                      padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                      font: '500 12px/16px var(--font-sans)',
                      background: kodModu === 'otomatik' ? 'var(--brand-primary)' : 'var(--surface-card)',
                      color: kodModu === 'otomatik' ? '#fff' : 'var(--text-secondary)',
                      border: `1px solid ${kodModu === 'otomatik' ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                      cursor: 'pointer',
                    }}
                  >
                    Otomatik
                  </button>
                  <button
                    onClick={() => handleKodModu('manuel')}
                    style={{
                      padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                      font: '500 12px/16px var(--font-sans)',
                      background: kodModu === 'manuel' ? 'var(--brand-primary)' : 'var(--surface-card)',
                      color: kodModu === 'manuel' ? '#fff' : 'var(--text-secondary)',
                      border: `1px solid ${kodModu === 'manuel' ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                      cursor: 'pointer',
                    }}
                  >
                    Manuel
                  </button>
                </div>
              )}
              {kodModu === 'otomatik' && !duzenleId ? (
                <div style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: form.kod ? 'var(--brand-primary-soft)' : 'var(--surface-sunken)',
                  color: form.kod ? 'var(--brand-primary)' : 'var(--text-tertiary)',
                  font: '500 13px/20px var(--font-mono)',
                  border: '1px solid var(--border-default)',
                }}>
                  {form.kod || 'Firma girin…'}
                </div>
              ) : (
                <Input
                  value={form.kod}
                  onChange={e => setForm({ ...form, kod: e.target.value.toUpperCase() })}
                  placeholder="BAS-0001"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
            <div>
              <Label required>Ad</Label>
              <Input value={form.ad} onChange={e => setForm({ ...form, ad: e.target.value })} placeholder="Ahmet" />
            </div>
            <div>
              <Label required>Soyad</Label>
              <Input value={form.soyad} onChange={e => setForm({ ...form, soyad: e.target.value })} placeholder="Yılmaz" />
            </div>
            <div>
              <Label>Unvan</Label>
              <Input value={form.unvan} onChange={e => setForm({ ...form, unvan: e.target.value })} placeholder="Satın Alma Müdürü" />
            </div>
            <div>
              <Label required>Telefon</Label>
              <Input value={form.telefon} onChange={e => setForm({ ...form, telefon: e.target.value })} placeholder="0532 000 00 00" />
            </div>
            <div>
              <Label>E-posta</Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="ahmet@firma.com" />
            </div>
            <div>
              <Label>Şehir</Label>
              <Input value={form.sehir} onChange={e => setForm({ ...form, sehir: e.target.value })} placeholder="İstanbul" />
            </div>
            <div>
              <Label>Vergi No</Label>
              <Input value={form.vergiNo} onChange={e => setForm({ ...form, vergiNo: e.target.value })} placeholder="1234567890" />
            </div>
            <div>
              <Label>Durum</Label>
              <CustomSelect
                value={form.durum}
                onChange={e => setForm({ ...form, durum: e.target.value })}
              >
                {durumlar.map(d => <option key={d.id} value={d.id}>{d.isim}</option>)}
              </CustomSelect>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <Label>Notlar</Label>
            <Textarea
              value={form.notlar}
              onChange={e => setForm({ ...form, notlar: e.target.value })}
              rows={2}
              placeholder="Müşteri hakkında notlar…"
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={kaydet}>
              {duzenleId ? 'Güncelle' : 'Kaydet'}
            </Button>
            <Button variant="secondary" onClick={iptal}>İptal</Button>
          </div>
        </Card>
      )}

      {/* Liste */}
      <Card padding={0}>
        {gorunenMusteriler.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              title={arama ? 'Arama sonucu bulunamadı' : 'Henüz müşteri eklenmedi'}
              description={arama ? 'Farklı bir arama terimi deneyin.' : 'Üstteki butonla ilk müşteriyi ekleyebilirsiniz.'}
            />
          </div>
        ) : (
          <div>
            {gorunenMusteriler.map(m => {
              const durum = durumlar.find(d => d.id === m.durum)
              return (
                <div
                  key={m.id}
                  onClick={() => navigate(`/musteriler/${m.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 20px',
                    borderBottom: '1px solid var(--border-default)',
                    cursor: 'pointer',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Avatar name={m.firma || m.ad} size="md" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
                        {m.firma || '—'}
                      </span>
                      <CodeBadge>{m.kod}</CodeBadge>
                      {durum && <Badge tone={durum.tone}>{durum.isim}</Badge>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2, flexWrap: 'wrap', font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                      {m.ad && <span>{m.ad} {m.soyad}{m.unvan ? ` · ${m.unvan}` : ''}</span>}
                      {m.telefon && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{m.telefon}</span>}
                      {m.email && <span>{m.email}</span>}
                      {m.sehir && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <MapPin size={11} strokeWidth={1.5} /> {m.sehir}
                        </span>
                      )}
                    </div>
                    {m.notlar && (
                      <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.notlar}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--brand-primary)', display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 4 }}>
                      Detay <ArrowRight size={14} strokeWidth={1.5} />
                    </span>
                    <button
                      onClick={e => duzenleAc(m, e)}
                      aria-label="Düzenle"
                      style={{
                        width: 32, height: 32,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)'; e.currentTarget.style.borderColor = 'var(--brand-primary)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}
                    >
                      <Pencil size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={e => musteriSil(m.id, e)}
                      aria-label="Sil"
                      style={{
                        width: 32, height: 32,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'var(--danger)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

export default Musteriler
