import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Phone, Mail, MapPin, Receipt, ArrowRight } from 'lucide-react'
import CustomSelect from '../components/CustomSelect'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { firmalariGetir, firmaEkle, firmaGuncelle, firmaSil as dbFirmaSil } from '../services/firmaService'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { teklifleriGetir } from '../services/teklifService'
import { lisanslariGetir } from '../services/lisansService'
import { trContains } from '../lib/trSearch'
import {
  Button, SearchInput, Input, Label,
  Card, Badge, CodeBadge, Avatar, EmptyState,
} from '../components/ui'

const sektorler = [
  'Teknoloji', 'Güvenlik', 'İnşaat', 'Sağlık', 'Eğitim',
  'Üretim', 'Lojistik', 'Finans', 'Perakende', 'Diğer'
]

const bosForm = {
  firmaAdi: '', vergiNo: '', sektor: '', telefon: '', email: '',
  adres: '', sehir: '', notlar: '',
}

function Firmalar() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [firmalar, setFirmalar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [gorusmeler, setGorusmeler] = useState([])
  const [teklifler, setTeklifler] = useState([])
  const [lisanslar, setLisanslar] = useState([])
  const [form, setForm] = useState(bosForm)
  const [goster, setGoster] = useState(false)
  const [duzenleId, setDuzenleId] = useState(null)
  const [arama, setArama] = useState('')

  useEffect(() => {
    firmalariGetir()
      .then(data => setFirmalar(data || []))
      .catch(err => console.error('[Firmalar yükle]', err))
      .finally(() => setYukleniyor(false))
    gorusmeleriGetir().then(setGorusmeler).catch(err => console.error('[Firmalar gorusmeler]', err))
    teklifleriGetir().then(setTeklifler).catch(err => console.error('[Firmalar teklifler]', err))
    lisanslariGetir().then(setLisanslar).catch(err => console.error('[Firmalar lisanslar]', err))
  }, [])

  const firmaKoduOlustur = (mevcut) => `FRM-${String(mevcut.length + 1).padStart(4, '0')}`

  const firmaIstatistik = (firmaAdi) => ({
    gorusme: gorusmeler.filter(g => g.firmaAdi === firmaAdi).length,
    teklif:  teklifler.filter(t => t.firmaAdi === firmaAdi).length,
    lisans:  lisanslar.filter(l => l.firmaAdi === firmaAdi).length,
    kabul:   teklifler.filter(t => t.firmaAdi === firmaAdi && t.onayDurumu === 'kabul').length,
  })

  const kaydet = async () => {
    if (!form.firmaAdi) { toast.error('Firma adı zorunludur.'); return }
    if (duzenleId) {
      const guncellendi = await firmaGuncelle(duzenleId, form)
      if (guncellendi) setFirmalar(prev => prev.map(f => f.id === duzenleId ? guncellendi : f))
      toast.success('Firma güncellendi.')
      setDuzenleId(null)
    } else {
      const yeni = await firmaEkle({ ...form, kod: firmaKoduOlustur(firmalar), olusturmaTarih: new Date().toISOString() })
      if (yeni) setFirmalar(prev => [yeni, ...prev])
      toast.success('Firma kaydedildi.')
    }
    setForm(bosForm); setGoster(false)
  }

  const duzenleAc = (f) => {
    setForm({
      firmaAdi: f.firmaAdi, vergiNo: f.vergiNo || '', sektor: f.sektor || '',
      telefon: f.telefon || '', email: f.email || '', adres: f.adres || '',
      sehir: f.sehir || '', notlar: f.notlar || '',
    })
    setDuzenleId(f.id); setGoster(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const firmaSil = async (id) => {
    const onay = await confirm({
      baslik: 'Firmayı Sil',
      mesaj: 'Bu firmayı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    await dbFirmaSil(id)
    setFirmalar(prev => prev.filter(f => f.id !== id))
    toast.success('Firma silindi.')
  }

  const gorunenFirmalar = firmalar.filter(f =>
    trContains([f.firmaAdi, f.kod, f.vergiNo, f.sektor, f.sehir].filter(Boolean).join(' '), arama)
  )

  if (yukleniyor) {
    return <div style={{ padding: 24 }}><EmptyState title="Yükleniyor…" /></div>
  }

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Firmalar</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            <span className="tabular-nums">{firmalar.length}</span> firma kayıtlı
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => { setGoster(true); setDuzenleId(null); setForm(bosForm) }}>
          Yeni firma
        </Button>
      </div>

      {/* Arama */}
      <div style={{ marginBottom: 16, maxWidth: 560 }}>
        <SearchInput
          value={arama}
          onChange={e => setArama(e.target.value)}
          placeholder="Firma adı, kod, vergi no, sektör veya şehir ara…"
        />
      </div>

      {/* Form */}
      {goster && (
        <Card style={{ marginBottom: 16 }}>
          <h2 className="t-h2" style={{ marginBottom: 16 }}>
            {duzenleId ? 'Firmayı Düzenle' : 'Yeni Firma'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
            <div>
              <Label required>Firma adı</Label>
              <Input value={form.firmaAdi} onChange={e => setForm({ ...form, firmaAdi: e.target.value })} placeholder="BTM Health A.Ş." />
            </div>
            <div>
              <Label>Vergi no</Label>
              <Input value={form.vergiNo} onChange={e => setForm({ ...form, vergiNo: e.target.value })} placeholder="1234567890" />
            </div>
            <div>
              <Label>Sektör</Label>
              <CustomSelect value={form.sektor} onChange={e => setForm({ ...form, sektor: e.target.value })}>
                <option value="">Seçin…</option>
                {sektorler.map(s => <option key={s} value={s}>{s}</option>)}
              </CustomSelect>
            </div>
            <div>
              <Label>Telefon</Label>
              <Input value={form.telefon} onChange={e => setForm({ ...form, telefon: e.target.value })} placeholder="0212 000 00 00" />
            </div>
            <div>
              <Label>E-posta</Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="info@firma.com" />
            </div>
            <div>
              <Label>Şehir</Label>
              <Input value={form.sehir} onChange={e => setForm({ ...form, sehir: e.target.value })} placeholder="İstanbul" />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <Label>Adres</Label>
              <Input value={form.adres} onChange={e => setForm({ ...form, adres: e.target.value })} placeholder="Mahalle, sokak, no…" />
            </div>
            <div>
              <Label>Notlar</Label>
              <Input value={form.notlar} onChange={e => setForm({ ...form, notlar: e.target.value })} placeholder="Kısa not…" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={kaydet}>{duzenleId ? 'Güncelle' : 'Kaydet'}</Button>
            <Button variant="secondary" onClick={() => { setGoster(false); setForm(bosForm); setDuzenleId(null) }}>İptal</Button>
          </div>
        </Card>
      )}

      {/* Grid */}
      {gorunenFirmalar.length === 0 ? (
        <EmptyState
          title={arama ? 'Arama sonucu bulunamadı' : 'Henüz firma eklenmedi'}
          description={arama ? 'Farklı bir arama terimi deneyin.' : 'Üstteki butonla ilk firmayı ekleyebilirsin.'}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
          {gorunenFirmalar.map(f => {
            const istat = firmaIstatistik(f.firmaAdi)
            return (
              <Card
                key={f.id}
                onClick={() => navigate(`/firma-gecmisi/${encodeURIComponent(f.firmaAdi)}`)}
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
                        {f.kod && <CodeBadge>{f.kod}</CodeBadge>}
                        {f.sektor && <Badge tone="neutral">{f.sektor}</Badge>}
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
                  {f.sehir && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={11} strokeWidth={1.5} />{f.sehir}</span>}
                  {f.vergiNo && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontVariantNumeric: 'tabular-nums' }}><Receipt size={11} strokeWidth={1.5} />{f.vergiNo}</span>}
                </div>

                {f.notlar && (
                  <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', fontStyle: 'italic', marginBottom: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.notlar}
                  </p>
                )}

                {/* İstatistik + "Geçmişi gör" */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--border-default)' }}>
                  <div style={{ display: 'flex', gap: 16 }}>
                    {[
                      { d: istat.gorusme, l: 'Görüşme' },
                      { d: istat.teklif,  l: 'Teklif' },
                      { d: istat.kabul,   l: 'Kabul', success: istat.kabul > 0 },
                      { d: istat.lisans,  l: 'Lisans' },
                    ].map((i, idx) => (
                      <div key={idx} style={{ textAlign: 'center' }}>
                        <div style={{
                          font: '600 16px/1 var(--font-sans)',
                          color: i.success ? 'var(--success)' : 'var(--text-primary)',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {i.d}
                        </div>
                        <div style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>{i.l}</div>
                      </div>
                    ))}
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--brand-primary)', font: '500 12px/18px var(--font-sans)' }}>
                    Geçmişi gör <ArrowRight size={14} strokeWidth={1.5} />
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

export default Firmalar
