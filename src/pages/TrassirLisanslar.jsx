import { useState, useEffect, useCallback } from 'react'
import { invalidate } from '../lib/cache'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Plus, Pencil, Trash2, MapPin, Infinity as InfIcon, AlertTriangle, Image as ImageIcon, Upload, X } from 'lucide-react'
import {
  lisanslariGetir, lisansEkle, lisansGuncelle, lisansSil as dbLisansSil,
  lisansGorselYukle, lisansGorselSil, lisansGorselUrl, GORSEL_MAX, GORSEL_MAX_MB,
} from '../services/lisansService'
import { musterileriGetir } from '../services/musteriService'
import { musteriLokasyonlariniGetir } from '../services/musteriLokasyonService'
import { trContains } from '../lib/trSearch'
import CustomSelect from '../components/CustomSelect'
import ComboBox from '../components/ComboBox'
import { SkeletonList } from '../components/Skeleton'
import {
  Button, SearchInput, Input, Textarea, Label,
  Card, Badge, CodeBadge, KPICard, Alert, EmptyState, SegmentedControl,
} from '../components/ui'

const lisansTurleri = [
  'Trassir Server', 'Trassir Client', 'Trassir Cloud', 'Trassir NVR',
  'Trassir DVR', 'Trassir Analitik', 'Diğer',
]

const lisansTipleri = [
  { id: 'sureksiz',         isim: 'Süreli' },
  { id: 'sureksiz_demo',    isim: 'Demo' },
  { id: 'sureksiz_surekli', isim: 'Sürekli' },
]

const demoSureler = [7, 14, 30, 60, 90]

const durumlar = [
  { id: 'aktif',        isim: 'Aktif',        tone: 'aktif' },
  { id: 'pasif',        isim: 'Pasif',        tone: 'pasif' },
  { id: 'suresi_doldu', isim: 'Süresi Doldu', tone: 'kayip' },
  { id: 'beklemede',    isim: 'Beklemede',    tone: 'beklemede' },
]

const bosForm = {
  lisansKodu: '', lisansId: '', lisansTuru: '',
  lisansTipi: 'sureksiz', demoGun: '30',
  musteriId: '', firmaAdi: '', proje: '', lokasyon: '',
  sunucuAdi: '', kanalSayisi: '',
  baslangicTarih: new Date().toISOString().split('T')[0],
  bitisTarih: '', durum: 'aktif', notlar: '',
}

function lisansKoduOlustur(mevcut) { return `TRS-${String(mevcut.length + 1).padStart(4, '0')}` }
function demoBitisTarih(bas, gun) {
  const t = new Date(bas); t.setDate(t.getDate() + Number(gun))
  return t.toISOString().split('T')[0]
}

function TrassirLisanslar() {
  const { kullanicilar } = useAuth()
  const { toast } = useToast()
  const [lisanslar, setLisanslar] = useState([])
  const [musteriler, setMusteriler] = useState([])
  const [musteriLokasyonlari, setMusteriLokasyonlari] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [form, setForm] = useState(bosForm)
  const [goster, setGoster] = useState(false)
  const [duzenleId, setDuzenleId] = useState(null)
  const [filtre, setFiltre] = useState('aktif')
  const [arama, setArama] = useState('')
  const [kodModu, setKodModu] = useState('otomatik')
  // Lisans görseli (lisans özeti ekran görüntüsü)
  const [gorselFile, setGorselFile] = useState(null)         // yeni seçilen dosya
  const [gorselOnizleme, setGorselOnizleme] = useState('')   // yeni dosyanın object URL'i
  const [gorselKaldir, setGorselKaldir] = useState(false)    // düzenlemede mevcut görseli sil
  const [mevcutGorselUrl, setMevcutGorselUrl] = useState('') // düzenlemede kayıtlı görselin imzalı URL'i
  const [lightbox, setLightbox] = useState(null)             // { lisans, url }

  const veriYukle = useCallback(({ ilkYukleme = false } = {}) => {
    if (ilkYukleme) setYukleniyor(true)
    Promise.all([lisanslariGetir(), musterileriGetir()])
      .then(([l, m]) => {
        // Boş dönmüş + henüz hiç veri yoksa cache zehirlenmiş olabilir,
        // sessizce bir kez daha dene (auth context oturduktan sonra)
        if ((!l || l.length === 0) && ilkYukleme) {
          invalidate('lisanslar:list')
        }
        setLisanslar(l || [])
        setMusteriler(m || [])
      })
      .catch(err => console.error('[TrassirLisanslar yükle]', err))
      .finally(() => { if (ilkYukleme) setYukleniyor(false) })
  }, [])

  useEffect(() => { veriYukle({ ilkYukleme: true }) }, [veriYukle])

  // Tab gizlenip tekrar görünür olunca + pencere focus alınca yenile
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') veriYukle() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', veriYukle)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', veriYukle)
    }
  }, [veriYukle])

  const gorselStateSifirla = () => {
    if (gorselOnizleme) URL.revokeObjectURL(gorselOnizleme)
    setGorselFile(null); setGorselOnizleme(''); setGorselKaldir(false); setMevcutGorselUrl('')
  }

  const formAc = () => {
    setForm({ ...bosForm, lisansKodu: lisansKoduOlustur(lisanslar) })
    setKodModu('otomatik'); setDuzenleId(null); setGoster(true)
    gorselStateSifirla()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const duzenleAc = (l) => {
    setForm({
      lisansKodu: l.lisansKodu, lisansId: l.lisansId || '', lisansTuru: l.lisansTuru,
      lisansTipi: l.lisansTipi || 'sureksiz', demoGun: l.demoGun || '30',
      musteriId: l.musteriId || '', firmaAdi: l.firmaAdi || '', proje: l.proje || '', lokasyon: l.lokasyon || '',
      sunucuAdi: l.sunucuAdi || '', kanalSayisi: l.kanalSayisi || '',
      baslangicTarih: l.baslangicTarih || '', bitisTarih: l.bitisTarih || '',
      durum: l.durum, notlar: l.notlar || '',
    })
    // Düzenleme açılırken o müşterinin lokasyonlarını da yükle (dropdown'da seçili gelsin)
    if (l.musteriId) {
      musteriLokasyonlariniGetir(l.musteriId)
        .then(d => setMusteriLokasyonlari(d || []))
        .catch(() => setMusteriLokasyonlari([]))
    } else {
      setMusteriLokasyonlari([])
    }
    setKodModu('manuel'); setDuzenleId(l.id); setGoster(true)
    gorselStateSifirla()
    if (l.gorselYolu) {
      lisansGorselUrl(l.gorselYolu).then(url => { if (url) setMevcutGorselUrl(url) })
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const gorselSec = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Sadece görsel dosyası yüklenebilir (JPG/PNG/WebP).'); return }
    if (f.size > GORSEL_MAX) { toast.error(`Görsel çok büyük (max ${GORSEL_MAX_MB} MB).`); return }
    if (gorselOnizleme) URL.revokeObjectURL(gorselOnizleme)
    setGorselFile(f); setGorselOnizleme(URL.createObjectURL(f)); setGorselKaldir(false)
  }

  const gorselGoruntule = async (l) => {
    const url = await lisansGorselUrl(l.gorselYolu)
    if (!url) { toast.error('Görsel yüklenemedi.'); return }
    setLightbox({ lisans: l, url })
  }

  const handleMusteriSec = (musteriId) => {
    const m = musteriler.find(x => x.id?.toString() === musteriId)
    // Lokasyonu sıfırla (müşteri değişince eski lokasyon anlamsız)
    setForm({ ...form, musteriId, firmaAdi: m ? m.firma : '', lokasyon: '' })
    if (musteriId) {
      musteriLokasyonlariniGetir(musteriId)
        .then(d => setMusteriLokasyonlari(d || []))
        .catch(() => setMusteriLokasyonlari([]))
    } else {
      setMusteriLokasyonlari([])
    }
  }

  const handleTipiDegis = (tipi) => {
    const y = { ...form, lisansTipi: tipi }
    if (tipi === 'sureksiz_surekli') y.bitisTarih = ''
    else if (tipi === 'sureksiz_demo') y.bitisTarih = demoBitisTarih(form.baslangicTarih, form.demoGun)
    setForm(y)
  }

  const handleDemoGunDegis = (gun) => {
    setForm({ ...form, demoGun: gun, bitisTarih: demoBitisTarih(form.baslangicTarih, gun) })
  }

  const kaydet = async () => {
    if (!form.lisansKodu || !form.lisansTuru || !form.firmaAdi) {
      toast.error('Lisans kodu, tür ve firma zorunludur.'); return
    }
    const kodVarMi = lisanslar.find(l => l.lisansKodu === form.lisansKodu && l.id !== duzenleId)
    if (kodVarMi) { toast.error('Bu lisans kodu zaten kullanılıyor.'); return }
    const lisansIdVarMi = form.lisansId && lisanslar.find(l => l.lisansId === form.lisansId && l.id !== duzenleId)
    if (lisansIdVarMi) { toast.error('Bu Lisans ID zaten kayıtlı.'); return }

    if (duzenleId) {
      let g = await lisansGuncelle(duzenleId, form)
      const eskiYol = lisanslar.find(l => l.id === duzenleId)?.gorselYolu || null
      if (gorselFile) {
        const g2 = await lisansGorselYukle(duzenleId, gorselFile, eskiYol)
        if (g2) g = g2; else toast.error('Görsel yüklenemedi — lisans bilgileri kaydedildi.')
      } else if (gorselKaldir && eskiYol) {
        const g2 = await lisansGorselSil(duzenleId, eskiYol)
        if (g2) g = g2
      }
      if (g) setLisanslar(prev => prev.map(l => l.id === duzenleId ? g : l))
      toast.success('Lisans güncellendi.')
    } else {
      let y = await lisansEkle({ ...form, olusturmaTarih: new Date().toISOString() })
      if (y && gorselFile) {
        const y2 = await lisansGorselYukle(y.id, gorselFile)
        if (y2) y = y2; else toast.error('Görsel yüklenemedi — lisans kaydedildi.')
      }
      if (y) setLisanslar(prev => [y, ...prev])
      toast.success('Lisans kaydedildi.')
    }
    setForm(bosForm); setDuzenleId(null); setGoster(false); setMusteriLokasyonlari([])
    gorselStateSifirla()
  }

  const iptal = () => {
    setForm(bosForm); setDuzenleId(null); setGoster(false); setMusteriLokasyonlari([])
    gorselStateSifirla()
  }

  const lisansSil = async (id) => {
    await dbLisansSil(id)
    setLisanslar(prev => prev.filter(l => l.id !== id))
    toast.success('Lisans silindi.')
  }

  const bugunDate = new Date()

  const gorunenLisanslar = lisanslar
    .filter(l => filtre === 'hepsi' || l.durum === filtre)
    .filter(l => trContains(
      [l.lisansKodu, l.lisansId, l.firmaAdi, l.proje, l.lokasyon, l.sunucuAdi, l.lisansTuru, l.notlar].filter(Boolean).join(' '),
      arama,
    ))

  const yakinBitenler = lisanslar.filter(l => {
    if (!l.bitisTarih || l.durum !== 'aktif' || l.lisansTipi === 'sureksiz_surekli') return false
    const fark = (new Date(l.bitisTarih) - bugunDate) / (1000 * 60 * 60 * 24)
    return fark <= 30 && fark >= 0
  })

  const sayilari = {
    toplam: lisanslar.length,
    aktif:  lisanslar.filter(l => l.durum === 'aktif').length,
    doldu:  lisanslar.filter(l => l.durum === 'suresi_doldu').length,
    yakin:  yakinBitenler.length,
  }

  if (yukleniyor) return <SkeletonList />

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Header — başlık + KPI rakamlar + yeni lisans butonu aynı satırda */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src="/trassirlogo2.jpg" alt="Trassir" style={{ height: 40, objectFit: 'contain' }} />
          <div>
            <h1 className="t-h1">Trassir Lisanslar</h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 4 }}>
              <KompaktKpi label="Toplam" value={sayilari.toplam} />
              <KompaktKpi label="Aktif" value={sayilari.aktif} renk="var(--success)" />
              <KompaktKpi label="Süresi doldu" value={sayilari.doldu} renk={sayilari.doldu > 0 ? 'var(--danger)' : 'var(--text-tertiary)'} />
              <KompaktKpi label="30 günde bitiyor" value={sayilari.yakin} renk={sayilari.yakin > 0 ? 'var(--warning)' : 'var(--text-tertiary)'} />
            </div>
          </div>
        </div>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={formAc}>
          Yeni lisans
        </Button>
      </div>

      {/* Yakın bitenler uyarı */}
      {yakinBitenler.length > 0 && (
        <Alert
          variant="warning"
          title={<><span className="tabular-nums">{yakinBitenler.length}</span> lisansın süresi 30 gün içinde doluyor</>}
          style={{ marginBottom: 16 }}
        >
          {yakinBitenler.map(l => l.firmaAdi).slice(0, 5).join(', ')}
          {yakinBitenler.length > 5 && ` ve ${yakinBitenler.length - 5} diğeri`}
        </Alert>
      )}

      {/* Arama + filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 240, maxWidth: 480 }}>
          <SearchInput
            value={arama}
            onChange={e => setArama(e.target.value)}
            placeholder="Lisans kodu, ID, firma, proje, sunucu ara…"
          />
        </div>
        <SegmentedControl
          options={[
            { value: 'hepsi', label: 'Tümü' },
            ...durumlar.map(d => ({ value: d.id, label: d.isim })),
          ]}
          value={filtre}
          onChange={setFiltre}
        />
      </div>

      {/* Form */}
      {goster && (
        <Card style={{ marginBottom: 16 }}>
          <h2 className="t-h2" style={{ marginBottom: 16 }}>{duzenleId ? 'Lisansı Düzenle' : 'Yeni Lisans'}</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
            <div>
              <Label required>Kayıt kodu</Label>
              {!duzenleId && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  {['otomatik', 'manuel'].map(mod => (
                    <button
                      key={mod}
                      onClick={() => { setKodModu(mod); setForm({ ...form, lisansKodu: mod === 'otomatik' ? lisansKoduOlustur(lisanslar) : '' }) }}
                      style={{
                        padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                        font: '500 12px/16px var(--font-sans)',
                        background: kodModu === mod ? 'var(--brand-primary)' : 'var(--surface-card)',
                        color: kodModu === mod ? '#fff' : 'var(--text-secondary)',
                        border: `1px solid ${kodModu === mod ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                        cursor: 'pointer',
                      }}
                    >
                      {mod === 'otomatik' ? 'Otomatik' : 'Manuel'}
                    </button>
                  ))}
                </div>
              )}
              {kodModu === 'otomatik' && !duzenleId ? (
                <div style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary)',
                  font: '500 13px/20px var(--font-mono)',
                  border: '1px solid var(--border-default)',
                }}>
                  {form.lisansKodu}
                </div>
              ) : (
                <Input
                  value={form.lisansKodu}
                  onChange={e => setForm({ ...form, lisansKodu: e.target.value.toUpperCase() })}
                  placeholder="TRS-0001"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              )}
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <Label>Trassir Lisans ID</Label>
              <Input
                value={form.lisansId}
                onChange={e => setForm({ ...form, lisansId: e.target.value })}
                placeholder="0x411255E1"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
              <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>Trassir sisteminden kopyalayın</p>
            </div>

            <div>
              <Label required>Lisans türü</Label>
              <CustomSelect value={form.lisansTuru} onChange={e => setForm({ ...form, lisansTuru: e.target.value })}>
                <option value="">Tür seç…</option>
                {lisansTurleri.map(t => <option key={t} value={t}>{t}</option>)}
              </CustomSelect>
            </div>

            <div>
              <Label required>Lisans tipi</Label>
              <div style={{ display: 'flex', gap: 6 }}>
                {lisansTipleri.map(t => {
                  const active = form.lisansTipi === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => handleTipiDegis(t.id)}
                      style={{
                        flex: 1, height: 36, padding: '0 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: active ? 'var(--brand-primary)' : 'var(--surface-card)',
                        color: active ? '#fff' : 'var(--text-secondary)',
                        border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                        font: '500 13px/18px var(--font-sans)',
                        cursor: 'pointer',
                      }}
                    >
                      {t.isim}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <Label>Durum</Label>
              <CustomSelect value={form.durum} onChange={e => setForm({ ...form, durum: e.target.value })}>
                {durumlar.map(d => <option key={d.id} value={d.id}>{d.isim}</option>)}
              </CustomSelect>
            </div>

            <div style={{ gridColumn: 'span 3' }}>
              <Label required>Firma</Label>
              <ComboBox
                value={form.firmaAdi}
                onChange={v => {
                  const eslesen = musteriler.find(m => (m.firma || '') === v)
                  setForm({
                    ...form,
                    firmaAdi: v,
                    musteriId: eslesen ? eslesen.id : '',
                    ...(eslesen && !form.lokasyon ? { lokasyon: '' } : {}),
                  })
                }}
                options={[...new Set(musteriler.map(m => m.firma).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'))}
                placeholder="Müşteri seç veya firma adı yaz…"
              />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <Label>Proje Adı</Label>
              <Input
                value={form.proje}
                onChange={e => setForm({ ...form, proje: e.target.value })}
                placeholder="Örn: Depo blok A, Kütüphane genişletme, Şube 3"
              />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <Label>Lokasyon / şube</Label>
              {musteriLokasyonlari.length > 0 ? (
                <>
                  <CustomSelect
                    value={
                      musteriLokasyonlari.some(l => l.ad === form.lokasyon)
                        ? form.lokasyon
                        : (form.lokasyon ? '__manuel__' : '')
                    }
                    onChange={e => {
                      const v = e.target.value
                      if (v === '__manuel__') {
                        // "Elden yaz" seçeneği — input'u boşalt
                        setForm({ ...form, lokasyon: '' })
                      } else {
                        setForm({ ...form, lokasyon: v })
                      }
                    }}
                  >
                    <option value="">Lokasyon seç…</option>
                    {musteriLokasyonlari.map(l => (
                      <option key={l.id} value={l.ad}>{l.ad}{l.adres ? ` — ${l.adres}` : ''}</option>
                    ))}
                    <option value="__manuel__">+ Manuel yaz…</option>
                  </CustomSelect>
                  {/* Dropdown'da seçili olmayan ya da manuel modunda input görünür */}
                  {(!form.lokasyon || !musteriLokasyonlari.some(l => l.ad === form.lokasyon)) && (
                    <Input
                      value={form.lokasyon}
                      onChange={e => setForm({ ...form, lokasyon: e.target.value })}
                      placeholder="Örn: Merkez Bina, 2. Şube…"
                      style={{ marginTop: 8 }}
                    />
                  )}
                </>
              ) : (
                <Input value={form.lokasyon} onChange={e => setForm({ ...form, lokasyon: e.target.value })} placeholder="Örn: Hayvan Hastanesi, Merkez Bina, 2. Şube…" />
              )}
              <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                {form.musteriId
                  ? (musteriLokasyonlari.length > 0
                      ? 'Müşterinin kayıtlı lokasyonlarından seç veya manuel yaz'
                      : 'Bu müşterinin kayıtlı lokasyonu yok — manuel yaz')
                  : 'Önce müşteri seç (otomatik lokasyon listesi gelir)'}
              </p>
            </div>

            <div>
              <Label>Sunucu adı / IP</Label>
              <Input value={form.sunucuAdi} onChange={e => setForm({ ...form, sunucuAdi: e.target.value })} placeholder="192.168.1.1" />
            </div>

            <div>
              <Label>Kanal sayısı</Label>
              <Input type="number" value={form.kanalSayisi} onChange={e => setForm({ ...form, kanalSayisi: e.target.value })} placeholder="0" min="0" />
            </div>

            <div>
              <Label>Başlangıç tarihi</Label>
              <Input
                type="date"
                value={form.baslangicTarih}
                onChange={e => {
                  const y = { ...form, baslangicTarih: e.target.value }
                  if (form.lisansTipi === 'sureksiz_demo') y.bitisTarih = demoBitisTarih(e.target.value, form.demoGun)
                  setForm(y)
                }}
              />
            </div>

            {form.lisansTipi === 'sureksiz' && (
              <div>
                <Label>Bitiş tarihi</Label>
                <Input type="date" value={form.bitisTarih} onChange={e => setForm({ ...form, bitisTarih: e.target.value })} />
              </div>
            )}

            {form.lisansTipi === 'sureksiz_demo' && (
              <div>
                <Label>Demo süresi</Label>
                <CustomSelect value={form.demoGun} onChange={e => handleDemoGunDegis(e.target.value)}>
                  {demoSureler.map(g => <option key={g} value={g}>{g} gün</option>)}
                </CustomSelect>
                {form.bitisTarih && (
                  <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                    Bitiş: {form.bitisTarih}
                  </p>
                )}
              </div>
            )}

            {form.lisansTipi === 'sureksiz_surekli' && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--success-soft)',
                border: '1px solid var(--success-border)',
                color: 'var(--success)',
                font: '500 13px/18px var(--font-sans)',
                alignSelf: 'flex-end',
              }}>
                <InfIcon size={16} strokeWidth={1.5} />
                Sürekli Lisans — Bitiş tarihi yok
              </div>
            )}

            <div style={{ gridColumn: 'span 3' }}>
              <Label>Notlar</Label>
              <Textarea
                value={form.notlar}
                onChange={e => setForm({ ...form, notlar: e.target.value })}
                rows={2}
                placeholder="Lisans hakkında notlar…"
              />
            </div>

            <div style={{ gridColumn: 'span 3' }}>
              <Label>Lisans görseli</Label>
              <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', margin: '0 0 8px' }}>
                Trassir'deki lisans özeti ekranının görüntüsünü buraya ekleyebilirsin (JPG/PNG, max {GORSEL_MAX_MB} MB)
              </p>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                {/* Yeni seçilen görselin önizlemesi */}
                {gorselOnizleme && (
                  <GorselKutu url={gorselOnizleme} etiket="Yeni görsel" onKaldir={() => {
                    URL.revokeObjectURL(gorselOnizleme)
                    setGorselFile(null); setGorselOnizleme('')
                  }} />
                )}
                {/* Kayıtlı görsel (düzenleme) — yeni dosya seçilmediyse ve kaldırılmadıysa */}
                {!gorselOnizleme && !gorselKaldir && mevcutGorselUrl && (
                  <GorselKutu url={mevcutGorselUrl} etiket="Kayıtlı görsel" onKaldir={() => setGorselKaldir(true)} />
                )}
                {gorselKaldir && !gorselOnizleme && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--danger-soft)', border: '1px solid var(--danger-border, var(--border-default))',
                    color: 'var(--danger)', font: '500 13px/18px var(--font-sans)',
                  }}>
                    <Trash2 size={14} strokeWidth={1.5} /> Kaydedince görsel silinecek
                    <button
                      onClick={() => setGorselKaldir(false)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', textDecoration: 'underline', font: 'inherit', padding: 0 }}
                    >
                      Vazgeç
                    </button>
                  </div>
                )}
                <label style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '9px 14px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-card)', border: '1px dashed var(--border-default)',
                  color: 'var(--text-secondary)', font: '500 13px/18px var(--font-sans)',
                  cursor: 'pointer',
                }}>
                  <Upload size={14} strokeWidth={1.5} />
                  {(gorselOnizleme || mevcutGorselUrl) ? 'Görseli değiştir…' : 'Görsel seç…'}
                  <input type="file" accept="image/*" onChange={gorselSec} style={{ display: 'none' }} />
                </label>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={kaydet}>{duzenleId ? 'Güncelle' : 'Kaydet'}</Button>
            <Button variant="secondary" onClick={iptal}>İptal</Button>
          </div>
        </Card>
      )}

      {/* Tablo */}
      <Card padding={0}>
        {gorunenLisanslar.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              title={arama ? 'Arama sonucu bulunamadı' : 'Henüz lisans eklenmedi'}
              description={arama ? 'Farklı bir arama deneyin.' : 'Üstteki butonla ilk lisansı ekleyebilirsin.'}
            />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr>
                  {['Kod', 'Lisans ID', 'Firma / Lokasyon', 'Proje Adı', 'Tür', 'Tip', 'Sunucu', 'Kanal', 'Bitiş', 'Durum', ''].map((h, i, arr) => (
                    <th key={i} style={{
                      background: 'var(--surface-sunken)',
                      padding: '10px 14px',
                      textAlign: i === arr.length - 1 ? 'right' : 'left',
                      font: '600 11px/16px var(--font-sans)',
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      borderBottom: '1px solid var(--border-default)',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gorunenLisanslar.map(l => {
                  const durum = durumlar.find(d => d.id === l.durum)
                  const bitis = l.bitisTarih ? new Date(l.bitisTarih) : null
                  const kalanGun = bitis ? Math.ceil((bitis - bugunDate) / (1000 * 60 * 60 * 24)) : null
                  return (
                    <tr key={l.id}
                      style={{ transition: 'background 120ms' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                        <CodeBadge>{l.lisansKodu}</CodeBadge>
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                        {l.lisansId ? <CodeBadge>{l.lisansId}</CodeBadge> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', maxWidth: 240 }}>
                        <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {l.firmaAdi}
                        </div>
                        {l.lokasyon && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                            <MapPin size={11} strokeWidth={1.5} /> {l.lokasyon}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', maxWidth: 200, font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={l.proje || ''}>
                        {l.proje || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                        <Badge tone="brand">{l.lisansTuru}</Badge>
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                        {l.lisansTipi === 'sureksiz_surekli' && <Badge tone="aktif">Sürekli</Badge>}
                        {l.lisansTipi === 'sureksiz_demo'    && <Badge tone="beklemede">Demo {l.demoGun}g</Badge>}
                        {l.lisansTipi === 'sureksiz'         && <Badge tone="neutral">Süreli</Badge>}
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {l.sunucuAdi || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {l.kanalSayisi || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                        {l.lisansTipi === 'sureksiz_surekli' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--success)', font: '500 13px/18px var(--font-sans)' }}>
                            <InfIcon size={14} strokeWidth={1.5} /> Sürekli
                          </span>
                        ) : l.bitisTarih ? (
                          <div>
                            <div style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>{l.bitisTarih}</div>
                            {kalanGun !== null && kalanGun <= 30 && kalanGun >= 0 && (
                              <div style={{ font: '500 11px/16px var(--font-sans)', color: 'var(--warning)' }}>{kalanGun} gün kaldı</div>
                            )}
                            {kalanGun !== null && kalanGun < 0 && (
                              <div style={{ font: '500 11px/16px var(--font-sans)', color: 'var(--danger)' }}>Doldu</div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                        {durum && <Badge tone={durum.tone}>{durum.isim}</Badge>}
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          {l.gorselYolu && (
                            <button
                              aria-label="Lisans görselini görüntüle"
                              title="Lisans görselini görüntüle"
                              onClick={() => gorselGoruntule(l)}
                              style={{
                                width: 28, height: 28,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: 'var(--brand-primary-soft)', border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-sm)', color: 'var(--brand-primary)', cursor: 'pointer',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary)'; e.currentTarget.style.color = '#fff' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
                            >
                              <ImageIcon size={12} strokeWidth={1.5} />
                            </button>
                          )}
                          <button
                            aria-label="Düzenle"
                            onClick={() => duzenleAc(l)}
                            style={{
                              width: 28, height: 28,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              background: 'transparent', border: '1px solid var(--border-default)',
                              borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                          >
                            <Pencil size={12} strokeWidth={1.5} />
                          </button>
                          <button
                            aria-label="Sil"
                            onClick={() => lisansSil(l.id)}
                            style={{
                              width: 28, height: 28,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              background: 'transparent', border: '1px solid var(--border-default)',
                              borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                          >
                            <Trash2 size={12} strokeWidth={1.5} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Lisans görseli lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(6, 12, 26, 0.74)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 32, cursor: 'zoom-out',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface-card)', borderRadius: 12, padding: 14,
              maxWidth: '92vw', maxHeight: '90vh',
              display: 'flex', flexDirection: 'column', gap: 10, cursor: 'default',
              boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <CodeBadge>{lightbox.lisans.lisansKodu}</CodeBadge>
                <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {lightbox.lisans.firmaAdi}
                </span>
                {lightbox.lisans.lisansId && <CodeBadge>{lightbox.lisans.lisansId}</CodeBadge>}
              </div>
              <button
                aria-label="Kapat"
                onClick={() => setLightbox(null)}
                style={{
                  width: 28, height: 28, flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                }}
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>
            <img
              src={lightbox.url}
              alt={`${lightbox.lisans.lisansKodu} lisans görseli`}
              style={{ maxWidth: '88vw', maxHeight: '78vh', objectFit: 'contain', borderRadius: 8, background: 'var(--surface-sunken)' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function GorselKutu({ url, etiket, onKaldir }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <img
        src={url}
        alt={etiket}
        style={{
          height: 96, maxWidth: 220, objectFit: 'cover',
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)',
          display: 'block',
        }}
      />
      <span style={{
        position: 'absolute', left: 6, bottom: 6,
        padding: '2px 8px', borderRadius: 999,
        background: 'rgba(6,12,26,0.66)', color: '#fff',
        font: '500 10px/14px var(--font-sans)',
      }}>{etiket}</span>
      <button
        aria-label="Görseli kaldır"
        onClick={onKaldir}
        style={{
          position: 'absolute', top: -8, right: -8,
          width: 22, height: 22,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--danger)', border: 'none', borderRadius: '50%',
          color: '#fff', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
        }}
      >
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  )
}

function KompaktKpi({ label, value, renk = 'var(--text-primary)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 22, fontWeight: 700, color: renk, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
    </div>
  )
}

export default TrassirLisanslar
