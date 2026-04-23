import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Pencil, Trash2, User, Phone, MessageCircle, Mail, Handshake,
  Building2, Monitor, Link2, Video, Send, Lightbulb, X,
} from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { gorusmeleriGetir, gorusmeEkle, gorusmeGuncelle, gorusmeSil as dbGorusmeSil } from '../services/gorusmeService'
import { musterileriGetir } from '../services/musteriService'
import CustomSelect from '../components/CustomSelect'
import {
  Button, SearchInput, Input, Textarea, Label,
  Card, Badge, CodeBadge, EmptyState, SegmentedControl,
} from '../components/ui'

const varsayilanKonular = [
  'CCTV', 'NVR-ANALİZ', 'Network', 'Teklif', 'Demo',
  'Fuar', 'Access Kontrol', 'Mobiltek', 'Donanım', 'Yazılım', 'Diğer',
]

const IRTIBAT_ICONS = {
  telefon: Phone, whatsapp: MessageCircle, mail: Mail, yuz_yuze: Handshake,
  merkez: Building2, uzak_baglanti: Monitor, bridge: Link2,
  online_toplanti: Video, telegram: Send, diger: Lightbulb,
}
const irtibatSekilleri = [
  { id: 'telefon',         isim: 'Telefon' },
  { id: 'whatsapp',        isim: 'WhatsApp' },
  { id: 'mail',            isim: 'Mail' },
  { id: 'yuz_yuze',        isim: 'Yüz Yüze' },
  { id: 'merkez',          isim: 'Merkez' },
  { id: 'uzak_baglanti',   isim: 'Uzak Bağlantı' },
  { id: 'bridge',          isim: 'Bridge' },
  { id: 'online_toplanti', isim: 'Online Toplantı' },
  { id: 'telegram',        isim: 'Telegram' },
  { id: 'diger',           isim: 'Diğer' },
]

const durumlar = [
  { id: 'acik',      isim: 'Açık',      tone: 'acik' },
  { id: 'beklemede', isim: 'Beklemede', tone: 'beklemede' },
  { id: 'kapali',    isim: 'Kapalı',    tone: 'kapali' },
]

const bosForm = {
  firmaAdi: '', musteriId: '', muhatapId: '', muhatapAd: '',
  konu: '', manuelKonu: '', irtibatSekli: '',
  gorusen: '', takipNotu: '', durum: 'acik',
  tarih: new Date().toISOString().split('T')[0],
}

function aktNo(mevcut) { return `ACT-${String(mevcut.length + 1).padStart(4, '0')}` }

function Gorusmeler() {
  const { kullanici, kullanicilar } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [gorusmeler, setGorusmeler] = useState([])
  const [musteriler, setMusteriler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [form, setForm] = useState(bosForm)
  const [secilenFirma, setSecilenFirma] = useState('')
  const [goster, setGoster] = useState(false)
  const [duzenleId, setDuzenleId] = useState(null)
  const [filtre, setFiltre] = useState('hepsi')
  const [gorusenFiltre, setGorusenFiltre] = useState('')
  const [konuFiltre, setKonuFiltre] = useState('')
  const [arama, setArama] = useState('')
  const [manuelKonuAc, setManuelKonuAc] = useState(false)

  useEffect(() => {
    Promise.all([gorusmeleriGetir(), musterileriGetir()]).then(([g, m]) => {
      setGorusmeler(g); setMusteriler(m); setYukleniyor(false)
    })
  }, [])

  const benzersizFirmalar = [...new Map(
    (musteriler || []).filter(m => m.firma).map(m => [m.firma, m])
  ).values()].sort((a, b) => (a.firma || '').localeCompare(b.firma || '', 'tr'))

  const firmaKisileri = secilenFirma ? musteriler.filter(m => m.firma === secilenFirma) : []

  const formAc = () => {
    setForm({ ...bosForm, gorusen: kullanici.ad, tarih: new Date().toISOString().split('T')[0] })
    setSecilenFirma(''); setManuelKonuAc(false); setDuzenleId(null); setGoster(true)
  }

  const duzenleAc = (g) => {
    const manuelMi = !varsayilanKonular.includes(g.konu)
    setSecilenFirma(g.firmaAdi || '')
    setForm({
      firmaAdi: g.firmaAdi,
      musteriId: g.musteriId || '',
      muhatapId: g.muhatapId || '',
      muhatapAd: g.muhatapAd || '',
      konu: manuelMi ? '' : g.konu,
      manuelKonu: manuelMi ? g.konu : '',
      irtibatSekli: g.irtibatSekli || '',
      gorusen: g.gorusen,
      takipNotu: g.takipNotu,
      durum: g.durum,
      tarih: g.tarih,
    })
    setManuelKonuAc(manuelMi); setDuzenleId(g.id); setGoster(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleFirmaSec = (firmaAdi) => {
    setSecilenFirma(firmaAdi)
    setForm({ ...form, firmaAdi, musteriId: '', muhatapId: '', muhatapAd: '' })
  }

  const handleKisiSec = (musteriId) => {
    const m = musteriler.find(x => x.id?.toString() === musteriId)
    setForm({ ...form, musteriId, muhatapId: musteriId, muhatapAd: m ? `${m.ad} ${m.soyad}` : '' })
  }

  const handleKonuSec = (konu) => {
    if (konu === '__manuel__') {
      setManuelKonuAc(true); setForm({ ...form, konu: '', manuelKonu: '' })
    } else {
      setManuelKonuAc(false); setForm({ ...form, konu, manuelKonu: '' })
    }
  }

  const kaydet = async () => {
    const sonKonu = manuelKonuAc ? form.manuelKonu : form.konu
    if (!form.firmaAdi || !sonKonu || !form.gorusen) {
      toast.error('Firma, konu ve görüşen zorunludur.'); return
    }
    if (duzenleId) {
      const g = await gorusmeGuncelle(duzenleId, { ...form, konu: sonKonu })
      if (g) { setGorusmeler(prev => prev.map(x => x.id === duzenleId ? g : x)); toast.success('Görüşme güncellendi.') }
      else { toast.error('Görüşme güncellenemedi.'); return }
    } else {
      const yeni = await gorusmeEkle({
        ...form, konu: sonKonu, aktNo: aktNo(gorusmeler),
        olusturanId: kullanici.id, olusturmaTarih: new Date().toISOString(),
      })
      if (yeni) { setGorusmeler(prev => [yeni, ...prev]); toast.success('Görüşme kaydedildi.') }
      else { toast.error('Görüşme kaydedilemedi.'); return }
    }
    setForm(bosForm); setSecilenFirma(''); setDuzenleId(null); setGoster(false)
  }

  const durumGuncelle = async (id, yeniDurum) => {
    await gorusmeGuncelle(id, { durum: yeniDurum })
    setGorusmeler(prev => prev.map(g => g.id === id ? { ...g, durum: yeniDurum } : g))
  }

  const gorusmeSil = async (id) => {
    await dbGorusmeSil(id)
    setGorusmeler(prev => prev.filter(g => g.id !== id))
    toast.success('Görüşme silindi.')
  }

  const iptal = () => {
    setForm(bosForm); setSecilenFirma(''); setDuzenleId(null); setGoster(false); setManuelKonuAc(false)
  }

  const gorusenler = [...new Set(gorusmeler.map(g => g.gorusen).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'))

  const gorunenGorusmeler = [...gorusmeler]
    .reverse()
    .filter(g => filtre === 'hepsi' || g.durum === filtre)
    .filter(g => gorusenFiltre === '' || g.gorusen === gorusenFiltre)
    .filter(g => konuFiltre === '' || g.konu === konuFiltre)
    .filter(g => arama === '' ||
      `${g.firmaAdi} ${g.konu} ${g.gorusen} ${g.aktNo} ${g.muhatapAd || ''}`.toLowerCase().includes(arama.toLowerCase())
    )

  const sayilari = {
    hepsi: gorusmeler.length,
    acik: gorusmeler.filter(g => g.durum === 'acik').length,
    beklemede: gorusmeler.filter(g => g.durum === 'beklemede').length,
    kapali: gorusmeler.filter(g => g.durum === 'kapali').length,
  }

  if (yukleniyor) {
    return <div style={{ padding: 24 }}><EmptyState title="Yükleniyor…" /></div>
  }

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Görüşmeler</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            <span className="tabular-nums">{gorusmeler.length}</span> aktivite
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={formAc}>
          Yeni görüşme
        </Button>
      </div>

      {/* Durum filter */}
      <div style={{ marginBottom: 12 }}>
        <SegmentedControl
          options={[
            { value: 'hepsi',     label: 'Tümü',      count: sayilari.hepsi },
            { value: 'acik',      label: 'Açık',      count: sayilari.acik },
            { value: 'beklemede', label: 'Beklemede', count: sayilari.beklemede },
            { value: 'kapali',    label: 'Kapalı',    count: sayilari.kapali },
          ]}
          value={filtre}
          onChange={setFiltre}
        />
      </div>

      {/* Görüşen + konu + arama */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ gridColumn: 'span 2' }}>
          <Label>Arama</Label>
          <SearchInput
            value={arama}
            onChange={e => setArama(e.target.value)}
            placeholder="Firma, kişi, konu, görüşen veya ACT no ara…"
          />
        </div>
        <div>
          <Label>Görüşen</Label>
          <CustomSelect value={gorusenFiltre} onChange={e => setGorusenFiltre(e.target.value)}>
            <option value="">Tümü</option>
            {gorusenler.map(ad => <option key={ad} value={ad}>{ad}</option>)}
          </CustomSelect>
        </div>
        <div>
          <Label>Konu</Label>
          <CustomSelect value={konuFiltre} onChange={e => setKonuFiltre(e.target.value)}>
            <option value="">Tümü</option>
            {varsayilanKonular.map(k => <option key={k} value={k}>{k}</option>)}
          </CustomSelect>
        </div>
      </div>

      {/* Aktif filtre chip'leri */}
      {(gorusenFiltre || konuFiltre || filtre !== 'hepsi') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <span className="t-caption">Filtre:</span>
          {gorusenFiltre && (
            <Badge tone="lead" icon={<User size={11} strokeWidth={1.5} />}>
              {gorusenFiltre}
              <button onClick={() => setGorusenFiltre('')} style={{ background: 'none', border: 'none', padding: 0, marginLeft: 2, cursor: 'pointer', color: 'inherit', display: 'inline-flex' }}>
                <X size={12} strokeWidth={1.5} />
              </button>
            </Badge>
          )}
          {konuFiltre && (
            <Badge tone="brand">
              {konuFiltre}
              <button onClick={() => setKonuFiltre('')} style={{ background: 'none', border: 'none', padding: 0, marginLeft: 2, cursor: 'pointer', color: 'inherit', display: 'inline-flex' }}>
                <X size={12} strokeWidth={1.5} />
              </button>
            </Badge>
          )}
          <span className="t-caption tabular-nums">{gorunenGorusmeler.length} sonuç</span>
        </div>
      )}

      {/* Form */}
      {goster && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <h2 className="t-h2" style={{ margin: 0 }}>
              {duzenleId ? 'Görüşmeyi Düzenle' : 'Yeni Görüşme'}
            </h2>
            {!duzenleId && <CodeBadge>{aktNo(gorusmeler)}</CodeBadge>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
            <div>
              <Label required>Firma</Label>
              <CustomSelect value={secilenFirma} onChange={e => handleFirmaSec(e.target.value)}>
                <option value="">Firma seç…</option>
                {benzersizFirmalar.map(m => <option key={m.id} value={m.firma}>{m.firma}</option>)}
              </CustomSelect>
            </div>
            <div>
              <Label>Muhatap kişi</Label>
              <CustomSelect value={form.muhatapId} onChange={e => handleKisiSec(e.target.value)} disabled={!secilenFirma}>
                <option value="">{secilenFirma ? 'Kişi seç…' : 'Önce firma seçin'}</option>
                {firmaKisileri.map(m => (
                  <option key={m.id} value={m.id}>{m.ad} {m.soyad}{m.unvan ? ` — ${m.unvan}` : ''}</option>
                ))}
              </CustomSelect>
            </div>
            <div>
              <Label required>Aktivite konusu</Label>
              <CustomSelect value={manuelKonuAc ? '__manuel__' : form.konu} onChange={e => handleKonuSec(e.target.value)}>
                <option value="">Konu seç…</option>
                {varsayilanKonular.map(k => <option key={k} value={k}>{k}</option>)}
                <option value="__manuel__">+ Manuel gir</option>
              </CustomSelect>
              {manuelKonuAc && (
                <Input
                  style={{ marginTop: 8 }}
                  value={form.manuelKonu}
                  onChange={e => setForm({ ...form, manuelKonu: e.target.value.toUpperCase() })}
                  placeholder="Konu yazın…"
                  autoFocus
                />
              )}
            </div>
            <div>
              <Label required>Görüşen</Label>
              <CustomSelect value={form.gorusen} onChange={e => setForm({ ...form, gorusen: e.target.value })}>
                <option value="">Kişi seç…</option>
                {kullanicilar.map(k => <option key={k.id} value={k.ad}>{k.ad}</option>)}
              </CustomSelect>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <Label>İrtibat şekli</Label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {irtibatSekilleri.map(i => {
                  const active = form.irtibatSekli === i.id
                  const IconC = IRTIBAT_ICONS[i.id] ?? Phone
                  return (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => setForm({ ...form, irtibatSekli: active ? '' : i.id })}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                        background: active ? 'var(--brand-primary)' : 'var(--surface-card)',
                        color: active ? '#fff' : 'var(--text-secondary)',
                        font: '500 12px/16px var(--font-sans)',
                        cursor: 'pointer',
                        transition: 'all 120ms',
                      }}
                    >
                      <IconC size={13} strokeWidth={1.5} />
                      {i.isim}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <Label>Tarih</Label>
              <Input type="date" value={form.tarih} onChange={e => setForm({ ...form, tarih: e.target.value })} />
            </div>
            <div>
              <Label>Durum</Label>
              <CustomSelect value={form.durum} onChange={e => setForm({ ...form, durum: e.target.value })}>
                {durumlar.map(d => <option key={d.id} value={d.id}>{d.isim}</option>)}
              </CustomSelect>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <Label>Takip edilecek konular / not</Label>
            <Textarea
              value={form.takipNotu}
              onChange={e => setForm({ ...form, takipNotu: e.target.value })}
              rows={3}
              placeholder="Görüşme detayları, takip edilecek konular…"
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={kaydet}>{duzenleId ? 'Güncelle' : 'Kaydet'}</Button>
            <Button variant="secondary" onClick={iptal}>İptal</Button>
          </div>
        </Card>
      )}

      {/* Liste */}
      <Card padding={0}>
        {gorunenGorusmeler.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              title={arama ? 'Arama sonucu bulunamadı' : 'Henüz görüşme eklenmedi'}
              description={arama ? 'Farklı bir arama terimi deneyin.' : 'Üstteki butonla ilk görüşmeyi kaydedebilirsin.'}
            />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr>
                  {['No', 'Firma / Muhatap', 'Takip Notu', 'Konu', 'Görüşen', 'Tarih', 'Durum', ''].map((h, i) => (
                    <th key={i} style={{
                      background: 'var(--surface-sunken)',
                      padding: '10px 16px',
                      textAlign: i === 7 ? 'right' : 'left',
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
                {gorunenGorusmeler.map(g => (
                  <tr key={g.id}
                    onClick={() => navigate(`/gorusmeler/${g.id}`)}
                    style={{ cursor: 'pointer', transition: 'background 120ms' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                      <CodeBadge>{g.aktNo}</CodeBadge>
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', maxWidth: 280 }}>
                      <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {g.firmaAdi}
                      </div>
                      {g.muhatapAd && (
                        <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <User size={11} strokeWidth={1.5} /> {g.muhatapAd}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', maxWidth: 300 }}>
                      <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {g.takipNotu || '—'}
                      </p>
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                      <Badge tone="brand">{g.konu}</Badge>
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {g.gorusen}
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', font: '400 13px/18px var(--font-sans)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                      {g.tarih}
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)' }} onClick={e => e.stopPropagation()}>
                      <CustomSelect
                        value={g.durum}
                        onChange={e => durumGuncelle(g.id, e.target.value)}
                        style={{ height: 28, padding: '0 8px', fontSize: 12 }}
                      >
                        {durumlar.map(d => <option key={d.id} value={d.id}>{d.isim}</option>)}
                      </CustomSelect>
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <button
                          aria-label="Düzenle"
                          onClick={() => duzenleAc(g)}
                          style={{
                            width: 28, height: 28,
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
                          <Pencil size={12} strokeWidth={1.5} />
                        </button>
                        <button
                          aria-label="Sil"
                          onClick={() => gorusmeSil(g.id)}
                          style={{
                            width: 28, height: 28,
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
                          <Trash2 size={12} strokeWidth={1.5} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

export default Gorusmeler
