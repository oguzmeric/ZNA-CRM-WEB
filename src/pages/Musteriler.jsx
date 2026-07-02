import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Plus, Pencil, Trash2, MapPin, ArrowRight,
  FolderOpen, CheckCircle2, Circle, AlertTriangle, List,
  ChevronLeft, ChevronRight, X, Mail, Phone, Building2,
} from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { musterileriGetir, musteriEkle, musteriGuncelle, musteriSil as dbMusteriSil } from '../services/musteriService'
import { trContains } from '../lib/trSearch'
import CustomSelect from '../components/CustomSelect'
import {
  Button, SearchInput, Input, Textarea, Label,
  Card, Badge, CodeBadge, Avatar, SegmentedControl, EmptyState,
} from '../components/ui'
import { SkeletonList } from '../components/Skeleton'

const durumIkonu = (durumId) => {
  if (durumId === 'aktif') return <CheckCircle2 size={14} strokeWidth={1.8} style={{ color: 'var(--success)' }} />
  if (durumId === 'pasif') return <Circle size={14} strokeWidth={1.8} style={{ color: 'var(--text-tertiary)' }} />
  if (durumId === 'kayip') return <AlertTriangle size={14} strokeWidth={1.8} style={{ color: 'var(--danger)' }} />
  return <Circle size={14} strokeWidth={1.5} />
}

const durumlar = [
  { id: 'aktif', isim: 'Aktif', tone: 'aktif' },
  { id: 'pasif', isim: 'Pasif', tone: 'pasif' },
  { id: 'kayip', isim: 'Kayıp', tone: 'kayip' },
]

const bosForm = {
  ad: '', soyad: '', firma: '', unvan: '', telefon: '', email: '',
  sehir: '', adres: '', vergiNo: '', vergiDairesi: '', notlar: '', durum: 'aktif', kod: '',
}


function firmaKoduOlustur(firmaAdi, mevcutMusteriler, mevcutKod = '') {
  const temiz = firmaAdi.toUpperCase().replace(/[^A-ZÇĞİÖŞÜ]/g, '')
  const prefix = temiz.substring(0, 3).padEnd(3, 'X')
  const ayniPrefix = mevcutMusteriler.filter(m => m.kod?.startsWith(prefix) && m.kod !== mevcutKod)
  const sayi = ayniPrefix.length + 1
  return `${prefix}-${String(sayi).padStart(4, '0')}`
}

function Musteriler() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [sayfa, setSayfa] = useState(1)
  const [sayfaBoyutu, setSayfaBoyutu] = useState(50)

  // Sütun bazli filtreler
  const [kolonFiltre, setKolonFiltre] = useState({
    kod: '', firma: '', yetkili: '', telefon: '', email: '', sehir: '',
  })

  useEffect(() => {
    musterileriGetir().then(data => { setMusteriler(data); setYukleniyor(false) })
  }, [])

  // Panel/dashboard'dan ?yeni=1 ile gelinirse formu direkt aç
  useEffect(() => {
    if (searchParams.get('yeni') === '1') {
      setForm(bosForm); setKodModu('otomatik'); setDuzenleId(null); setGoster(true)
      // param'ı temizle → sayfa yenilenince form açık kalmasın
      const kopya = new URLSearchParams(searchParams)
      kopya.delete('yeni')
      setSearchParams(kopya, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const formAc = () => {
    setForm(bosForm); setKodModu('otomatik'); setDuzenleId(null); setGoster(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const duzenleAc = (m, e) => {
    e.stopPropagation()
    setForm({
      ad: m.ad, soyad: m.soyad, firma: m.firma, unvan: m.unvan || '',
      telefon: m.telefon, email: m.email || '', sehir: m.sehir || '',
      adres: m.adres || '', vergiNo: m.vergiNo || '', vergiDairesi: m.vergiDairesi || '', notlar: m.notlar || '',
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
    if (!form.ad || !form.firma) {
      toast.error('Ad ve firma zorunludur.')
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

  const inSearch = (val, q) => !q || String(val ?? '').toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))

  const gorunenMusteriler = musteriler
    .filter(m => filtre === 'hepsi' || m.durum === filtre)
    .filter(m =>
      arama === '' ||
      trContains(`${m.ad} ${m.soyad} ${m.firma} ${m.kod}`, arama)
    )
    .filter(m => (
      inSearch(m.kod, kolonFiltre.kod) &&
      inSearch(m.firma, kolonFiltre.firma) &&
      inSearch(`${m.ad ?? ''} ${m.soyad ?? ''}`, kolonFiltre.yetkili) &&
      inSearch(m.telefon, kolonFiltre.telefon) &&
      inSearch(m.email, kolonFiltre.email) &&
      inSearch(m.sehir, kolonFiltre.sehir)
    ))

  const toplamSayfa = Math.max(1, Math.ceil(gorunenMusteriler.length / sayfaBoyutu))
  const aktifSayfa = Math.min(sayfa, toplamSayfa)
  const sayfadakiMusteriler = gorunenMusteriler.slice(
    (aktifSayfa - 1) * sayfaBoyutu,
    aktifSayfa * sayfaBoyutu,
  )

  useEffect(() => { setSayfa(1) }, [filtre, arama, sayfaBoyutu])

  const filtreSayilari = {
    hepsi: musteriler.length,
    aktif: musteriler.filter(m => m.durum === 'aktif').length,
    pasif: musteriler.filter(m => m.durum === 'pasif').length,
    kayip: musteriler.filter(m => m.durum === 'kayip').length,
  }

  if (yukleniyor) {
    return <SkeletonList satirSayisi={10} />
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <button
              onClick={iptal}
              title="Müşteri listesine dön"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px',
                background: 'transparent',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                font: '500 13px/18px var(--font-sans)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-sunken)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              <ChevronLeft size={14} strokeWidth={1.5} /> Müşteri listesi
            </button>
            <h2 className="t-h2" style={{ margin: 0 }}>
              {duzenleId ? 'Müşteriyi Düzenle' : 'Yeni Müşteri'}
            </h2>
          </div>

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

          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            margin: '4px 0 10px',
            font: '600 12px/16px var(--font-sans)',
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: 0.4,
          }}>
            <span>Yetkili Bilgileri</span>
            <span style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
            <div>
              <Label required>Yetkili Adı</Label>
              <Input value={form.ad} onChange={e => setForm({ ...form, ad: e.target.value })} placeholder="Ahmet" />
            </div>
            <div>
              <Label>Yetkili Soyadı</Label>
              <Input value={form.soyad} onChange={e => setForm({ ...form, soyad: e.target.value })} placeholder="Yılmaz" />
            </div>
            <div>
              <Label>Unvan</Label>
              <Input value={form.unvan} onChange={e => setForm({ ...form, unvan: e.target.value })} placeholder="Satın Alma Müdürü" />
            </div>
            <div>
              <Label>Telefon</Label>
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
              <Label>Vergi Dairesi</Label>
              <Input value={form.vergiDairesi} onChange={e => setForm({ ...form, vergiDairesi: e.target.value })} placeholder="Kadıköy Vergi Dairesi" />
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
            <Label>Açık Adres</Label>
            <Textarea
              value={form.adres || ''}
              onChange={e => setForm({ ...form, adres: e.target.value })}
              rows={2}
              placeholder="Mahalle, sokak, bina, kapı no…"
            />
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

      {/* Liste — profesyonel tablo */}
      {!goster && (() => {
        const filtreVar = Object.values(kolonFiltre).some(Boolean)
        const thStyle = {
          textAlign: 'left',
          padding: '10px 12px',
          font: '600 11px/14px var(--font-sans)',
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: 0.3,
          background: 'var(--surface-sunken)',
          borderBottom: '1px solid var(--border-default)',
          whiteSpace: 'nowrap',
          position: 'sticky', top: 0, zIndex: 1,
        }
        const tdStyle = {
          padding: '10px 12px',
          font: '400 13px/18px var(--font-sans)',
          color: 'var(--text-primary)',
          borderBottom: '1px solid var(--border-default)',
          verticalAlign: 'middle',
          whiteSpace: 'nowrap',
        }
        const colFilterInput = {
          width: '100%',
          padding: '6px 8px',
          font: '400 12px/16px var(--font-sans)',
          color: 'var(--text-primary)',
          background: 'var(--surface-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          outline: 'none',
        }
        return (
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {/* Filtre temizle butonu üstte */}
            {filtreVar && (
              <div style={{
                display: 'flex', justifyContent: 'flex-end',
                padding: '8px 12px',
                borderBottom: '1px solid var(--border-default)',
                background: 'var(--surface-card)',
              }}>
                <button
                  onClick={() => setKolonFiltre({ kod:'', firma:'', yetkili:'', telefon:'', email:'', sehir:'' })}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '6px 10px',
                    background: 'transparent', border: '1px solid var(--border-default)',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                    borderRadius: 'var(--radius-sm)',
                    font: '500 12px/16px var(--font-sans)',
                  }}
                >
                  <X size={12} strokeWidth={1.5} /> Filtreleri temizle
                </button>
              </div>
            )}

            <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 64 }}></th>
                    <th style={thStyle}>Müşteri Kodu</th>
                    <th style={{ ...thStyle, minWidth: 220 }}>Firma</th>
                    <th style={thStyle}>Yetkili</th>
                    <th style={thStyle}>Telefon</th>
                    <th style={thStyle}>E-posta</th>
                    <th style={thStyle}>Şehir</th>
                    <th style={thStyle}>Durum</th>
                    <th style={{ ...thStyle, width: 90 }}></th>
                  </tr>
                  <tr>
                    <th style={{ ...thStyle, top: 34, padding: '6px 12px', background: 'var(--surface-card)' }}></th>
                    <th style={{ ...thStyle, top: 34, padding: '6px 12px', background: 'var(--surface-card)' }}>
                      <input placeholder="ara…" value={kolonFiltre.kod}
                        onChange={e => { setKolonFiltre({ ...kolonFiltre, kod: e.target.value }); setSayfa(1) }}
                        style={colFilterInput} />
                    </th>
                    <th style={{ ...thStyle, top: 34, padding: '6px 12px', background: 'var(--surface-card)' }}>
                      <input placeholder="ara…" value={kolonFiltre.firma}
                        onChange={e => { setKolonFiltre({ ...kolonFiltre, firma: e.target.value }); setSayfa(1) }}
                        style={colFilterInput} />
                    </th>
                    <th style={{ ...thStyle, top: 34, padding: '6px 12px', background: 'var(--surface-card)' }}>
                      <input placeholder="ara…" value={kolonFiltre.yetkili}
                        onChange={e => { setKolonFiltre({ ...kolonFiltre, yetkili: e.target.value }); setSayfa(1) }}
                        style={colFilterInput} />
                    </th>
                    <th style={{ ...thStyle, top: 34, padding: '6px 12px', background: 'var(--surface-card)' }}>
                      <input placeholder="ara…" value={kolonFiltre.telefon}
                        onChange={e => { setKolonFiltre({ ...kolonFiltre, telefon: e.target.value }); setSayfa(1) }}
                        style={colFilterInput} />
                    </th>
                    <th style={{ ...thStyle, top: 34, padding: '6px 12px', background: 'var(--surface-card)' }}>
                      <input placeholder="ara…" value={kolonFiltre.email}
                        onChange={e => { setKolonFiltre({ ...kolonFiltre, email: e.target.value }); setSayfa(1) }}
                        style={colFilterInput} />
                    </th>
                    <th style={{ ...thStyle, top: 34, padding: '6px 12px', background: 'var(--surface-card)' }}>
                      <input placeholder="ara…" value={kolonFiltre.sehir}
                        onChange={e => { setKolonFiltre({ ...kolonFiltre, sehir: e.target.value }); setSayfa(1) }}
                        style={colFilterInput} />
                    </th>
                    <th style={{ ...thStyle, top: 34, padding: '6px 12px', background: 'var(--surface-card)' }}></th>
                    <th style={{ ...thStyle, top: 34, padding: '6px 12px', background: 'var(--surface-card)' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sayfadakiMusteriler.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', font: '400 13px/18px var(--font-sans)' }}>
                        {arama || filtreVar ? 'Arama sonucu bulunamadı' : 'Henüz müşteri eklenmedi'}
                      </td>
                    </tr>
                  )}
                  {sayfadakiMusteriler.map(m => {
                    const durum = durumlar.find(d => d.id === m.durum)
                    return (
                      <tr
                        key={m.id}
                        onClick={() => navigate(`/musteriler/${m.id}`)}
                        style={{ cursor: 'pointer', background: 'var(--surface-card)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-card)'}
                      >
                        <td style={{ ...tdStyle, padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'inline-flex', gap: 2 }}>
                            <button
                              aria-label="Detay"
                              onClick={() => navigate(`/musteriler/${m.id}`)}
                              title="Detay"
                              style={{
                                width: 26, height: 26,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: 'transparent', border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                            >
                              <FolderOpen size={13} strokeWidth={1.5} />
                            </button>
                            <button
                              aria-label={durum?.isim || 'Durum'}
                              title={durum?.isim || 'Durum'}
                              onClick={() => navigate(`/musteriler/${m.id}`)}
                              style={{
                                width: 26, height: 26,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: 'transparent', border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                              }}
                            >
                              {durumIkonu(m.durum)}
                            </button>
                          </div>
                        </td>
                        <td style={tdStyle}><CodeBadge>{m.kod}</CodeBadge></td>
                        <td style={{ ...tdStyle, fontWeight: 500 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <Avatar name={m.firma || m.ad} size="xs" />
                            <span style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.firma}>
                              {m.firma || '—'}
                            </span>
                          </span>
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--text-secondary)', textTransform: 'uppercase', font: '500 12px/16px var(--font-sans)' }}>
                          {m.ad ? `${m.ad} ${m.soyad || ''}`.trim() : '—'}
                        </td>
                        <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                          {m.telefon || '—'}
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                          {m.email || '—'}
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                          {m.sehir ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <MapPin size={11} strokeWidth={1.5} /> {m.sehir}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={tdStyle}>
                          {durum && <Badge tone={durum.tone}>{durum.isim}</Badge>}
                        </td>
                        <td style={{ ...tdStyle, padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'inline-flex', gap: 2 }}>
                            <button
                              onClick={e => duzenleAc(m, e)}
                              aria-label="Düzenle"
                              title="Düzenle"
                              style={{
                                width: 26, height: 26,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: 'transparent', border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                            >
                              <Pencil size={13} strokeWidth={1.5} />
                            </button>
                            <button
                              onClick={e => musteriSil(m.id, e)}
                              aria-label="Sil"
                              title="Sil"
                              style={{
                                width: 26, height: 26,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: 'transparent', border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                            >
                              <Trash2 size={13} strokeWidth={1.5} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <Sayfalama
              aktifSayfa={aktifSayfa}
              toplamSayfa={toplamSayfa}
              toplam={gorunenMusteriler.length}
              sayfaBoyutu={sayfaBoyutu}
              setSayfa={setSayfa}
              setSayfaBoyutu={setSayfaBoyutu}
            />
          </Card>
        )
      })()}
    </div>
  )
}

function Sayfalama({ aktifSayfa, toplamSayfa, toplam, sayfaBoyutu, setSayfa, setSayfaBoyutu }) {
  if (toplam === 0) return null
  const ilk = (aktifSayfa - 1) * sayfaBoyutu + 1
  const son = Math.min(aktifSayfa * sayfaBoyutu, toplam)
  const sayfalar = [1]
  for (let n = aktifSayfa - 1; n <= aktifSayfa + 1; n++) {
    if (n > 1 && n < toplamSayfa) sayfalar.push(n)
  }
  if (toplamSayfa > 1) sayfalar.push(toplamSayfa)
  const tekil = [...new Set(sayfalar)].sort((a, b) => a - b)
  const btnStil = (aktif, devre) => ({
    minWidth: 32, height: 32, padding: '0 10px',
    background: aktif ? 'var(--brand-primary)' : 'var(--surface-card)',
    color: aktif ? '#fff' : devre ? 'var(--text-faded)' : 'var(--text-primary)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    font: '500 13px/16px var(--font-sans)',
    cursor: devre ? 'not-allowed' : 'pointer',
    fontVariantNumeric: 'tabular-nums',
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderTop: '1px solid var(--border-default)', flexWrap: 'wrap' }}>
      <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
        <span className="tabular-nums">{ilk}-{son}</span> / <span className="tabular-nums">{toplam}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button style={btnStil(false, aktifSayfa === 1)} disabled={aktifSayfa === 1} onClick={() => setSayfa(aktifSayfa - 1)}>‹</button>
        {tekil.map((n, i) => {
          const onceki = tekil[i - 1]
          const bosluk = onceki && n - onceki > 1
          return (
            <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {bosluk && <span style={{ color: 'var(--text-faded)', padding: '0 4px' }}>…</span>}
              <button style={btnStil(n === aktifSayfa, false)} onClick={() => setSayfa(n)}>{n}</button>
            </span>
          )
        })}
        <button style={btnStil(false, aktifSayfa === toplamSayfa)} disabled={aktifSayfa === toplamSayfa} onClick={() => setSayfa(aktifSayfa + 1)}>›</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>Sayfa başına</span>
        <select value={sayfaBoyutu} onChange={e => setSayfaBoyutu(Number(e.target.value))}
          style={{ height: 32, padding: '0 8px', background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', font: '500 13px/16px var(--font-sans)', color: 'var(--text-primary)', cursor: 'pointer' }}>
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={200}>200</option>
        </select>
      </div>
    </div>
  )
}

export default Musteriler
