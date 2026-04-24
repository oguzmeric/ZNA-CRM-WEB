import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Plus, Pencil, Trash2, MapPin, Infinity as InfIcon, AlertTriangle } from 'lucide-react'
import { lisanslariGetir, lisansEkle, lisansGuncelle, lisansSil as dbLisansSil } from '../services/lisansService'
import { musterileriGetir } from '../services/musteriService'
import { trContains } from '../lib/trSearch'
import CustomSelect from '../components/CustomSelect'
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
  musteriId: '', firmaAdi: '', lokasyon: '',
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
  const [yukleniyor, setYukleniyor] = useState(true)
  const [form, setForm] = useState(bosForm)
  const [goster, setGoster] = useState(false)
  const [duzenleId, setDuzenleId] = useState(null)
  const [filtre, setFiltre] = useState('hepsi')
  const [arama, setArama] = useState('')
  const [kodModu, setKodModu] = useState('otomatik')

  useEffect(() => {
    Promise.all([lisanslariGetir(), musterileriGetir()])
      .then(([l, m]) => { setLisanslar(l || []); setMusteriler(m || []) })
      .catch(err => console.error('[TrassirLisanslar yükle]', err))
      .finally(() => setYukleniyor(false))
  }, [])

  const formAc = () => {
    setForm({ ...bosForm, lisansKodu: lisansKoduOlustur(lisanslar) })
    setKodModu('otomatik'); setDuzenleId(null); setGoster(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const duzenleAc = (l) => {
    setForm({
      lisansKodu: l.lisansKodu, lisansId: l.lisansId || '', lisansTuru: l.lisansTuru,
      lisansTipi: l.lisansTipi || 'sureksiz', demoGun: l.demoGun || '30',
      musteriId: l.musteriId || '', firmaAdi: l.firmaAdi || '', lokasyon: l.lokasyon || '',
      sunucuAdi: l.sunucuAdi || '', kanalSayisi: l.kanalSayisi || '',
      baslangicTarih: l.baslangicTarih || '', bitisTarih: l.bitisTarih || '',
      durum: l.durum, notlar: l.notlar || '',
    })
    setKodModu('manuel'); setDuzenleId(l.id); setGoster(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleMusteriSec = (musteriId) => {
    const m = musteriler.find(x => x.id?.toString() === musteriId)
    setForm({ ...form, musteriId, firmaAdi: m ? m.firma : '' })
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
      const g = await lisansGuncelle(duzenleId, form)
      if (g) setLisanslar(prev => prev.map(l => l.id === duzenleId ? g : l))
      toast.success('Lisans güncellendi.')
    } else {
      const y = await lisansEkle({ ...form, olusturmaTarih: new Date().toISOString() })
      if (y) setLisanslar(prev => [y, ...prev])
      toast.success('Lisans kaydedildi.')
    }
    setForm(bosForm); setDuzenleId(null); setGoster(false)
  }

  const iptal = () => { setForm(bosForm); setDuzenleId(null); setGoster(false) }

  const lisansSil = async (id) => {
    await dbLisansSil(id)
    setLisanslar(prev => prev.filter(l => l.id !== id))
    toast.success('Lisans silindi.')
  }

  const bugunDate = new Date()

  const gorunenLisanslar = lisanslar
    .filter(l => filtre === 'hepsi' || l.durum === filtre)
    .filter(l => trContains(
      [l.lisansKodu, l.lisansId, l.firmaAdi, l.lokasyon, l.sunucuAdi, l.lisansTuru, l.notlar].filter(Boolean).join(' '),
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

  if (yukleniyor) return <div style={{ padding: 24 }}><EmptyState title="Yükleniyor…" /></div>

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src="/trassirlogo2.jpg" alt="Trassir" style={{ height: 44, objectFit: 'contain' }} />
          <div>
            <h1 className="t-h1">Trassir Lisanslar</h1>
            <p className="t-caption" style={{ marginTop: 4 }}>
              <span className="tabular-nums">{lisanslar.length}</span> lisans kayıtlı
            </p>
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

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KPICard label="TOPLAM LİSANS" value={sayilari.toplam} />
        <KPICard label="AKTİF"          value={sayilari.aktif} footer={<span style={{ color: 'var(--success)' }}>Kullanımda</span>} />
        <KPICard label="SÜRESİ DOLDU"   value={sayilari.doldu} footer={sayilari.doldu > 0 ? <span style={{ color: 'var(--danger)' }}>Yenilenmeli</span> : <span style={{ color: 'var(--text-tertiary)' }}>Yok</span>} />
        <KPICard label="30 GÜNDE BİTİYOR" value={sayilari.yakin} footer={sayilari.yakin > 0 ? <><AlertTriangle size={12} strokeWidth={1.5} style={{ color: 'var(--warning)' }} /><span style={{ color: 'var(--warning)' }}>Takipte</span></> : <span style={{ color: 'var(--text-tertiary)' }}>Güncel</span>} />
      </div>

      {/* Arama + filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 240, maxWidth: 480 }}>
          <SearchInput
            value={arama}
            onChange={e => setArama(e.target.value)}
            placeholder="Lisans kodu, ID, firma, sunucu ara…"
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

            <div>
              <Label>Müşteri seç</Label>
              <CustomSelect value={form.musteriId} onChange={e => handleMusteriSec(e.target.value)}>
                <option value="">Müşteri seç…</option>
                {musteriler.map(m => <option key={m.id} value={m.id}>{m.ad} {m.soyad} — {m.firma}</option>)}
              </CustomSelect>
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <Label required>Firma adı</Label>
              <Input value={form.firmaAdi} onChange={e => setForm({ ...form, firmaAdi: e.target.value })} placeholder="Müşteri seçin veya direkt yazın…" />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <Label>Lokasyon / şube</Label>
              <Input value={form.lokasyon} onChange={e => setForm({ ...form, lokasyon: e.target.value })} placeholder="Örn: Hayvan Hastanesi, Merkez Bina, 2. Şube…" />
              <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>Lisansın atandığı şube veya lokasyonu belirtin</p>
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
                  {['Kod', 'Lisans ID', 'Firma / Lokasyon', 'Tür', 'Tip', 'Sunucu', 'Kanal', 'Bitiş', 'Durum', ''].map((h, i) => (
                    <th key={i} style={{
                      background: 'var(--surface-sunken)',
                      padding: '10px 14px',
                      textAlign: i === 9 ? 'right' : 'left',
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
    </div>
  )
}

export default TrassirLisanslar
