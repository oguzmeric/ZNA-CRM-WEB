import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Pencil, Trash2, User, Phone, MessageCircle, Mail, Handshake,
  Building2, Monitor, Link2, Video, Send, Lightbulb, X,
  Paperclip, Upload, FileText, Image as ImageIcon, Download,
} from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { gorusmeleriGetir, gorusmeGetir, gorusmeEkle, gorusmeGuncelle, gorusmeSil as dbGorusmeSil, dosyaYukle, dosyaLinkiAl, dosyaSil } from '../services/gorusmeService'
import { musterileriGetir } from '../services/musteriService'
import { supabase } from '../lib/supabase'
import { arrayToCamel } from '../lib/mapper'
import { trContains } from '../lib/trSearch'
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
  lokasyonId: '',
}

function aktNo(mevcut) { return `ACT-${String(mevcut.length + 1).padStart(4, '0')}` }

function Gorusmeler() {
  const { kullanici, kullanicilar } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [gorusmeler, setGorusmeler] = useState([])
  const [musteriler, setMusteriler] = useState([])
  const [tumLokasyonlar, setTumLokasyonlar] = useState([]) // tüm lokasyonlar — list satırları + form dropdown'ı için
  const [yukleniyor, setYukleniyor] = useState(true)
  const [form, setForm] = useState(bosForm)
  const [secilenFirma, setSecilenFirma] = useState('')
  const [goster, setGoster] = useState(false)
  const [duzenleId, setDuzenleId] = useState(null)
  const [filtre, setFiltre] = useState('hepsi')
  const [gorusenFiltre, setGorusenFiltre] = useState('')
  const [konuFiltre, setKonuFiltre] = useState('')
  const [arama, setArama] = useState('')
  const [sayfa, setSayfa] = useState(1)
  const [sayfaBoyutu, setSayfaBoyutu] = useState(50)
  const [manuelKonuAc, setManuelKonuAc] = useState(false)
  const [yeniDosyalar, setYeniDosyalar] = useState([])   // Henüz yüklenmemiş File[]
  const [mevcutDosyalar, setMevcutDosyalar] = useState([]) // Sunucudaki dosyalar
  const [dosyaYukleniyor, setDosyaYukleniyor] = useState(false)

  useEffect(() => {
    Promise.all([
      gorusmeleriGetir(),
      musterileriGetir(),
      // Lokasyonları tek seferde çek — N+1 olmasın
      supabase.from('musteri_lokasyonlari').select('*').then(({ data }) => arrayToCamel(data || [])),
    ])
      .then(([g, m, l]) => { setGorusmeler(g || []); setMusteriler(m || []); setTumLokasyonlar(l || []) })
      .catch(err => console.error('[Gorusmeler yükle]', err))
      .finally(() => setYukleniyor(false))
  }, [])

  const benzersizFirmalar = [...new Map(
    (musteriler || []).filter(m => m.firma).map(m => [m.firma, m])
  ).values()].sort((a, b) => (a.firma || '').localeCompare(b.firma || '', 'tr'))

  const firmaKisileri = secilenFirma ? musteriler.filter(m => m.firma === secilenFirma) : []

  // Seçili firmanın lokasyonları — firma adıyla eşleşen tüm musteri kayıtlarının lokasyonları (deduped)
  const firmaLokasyonlari = (() => {
    if (!secilenFirma) return []
    const firmaMusteriIdleri = new Set(firmaKisileri.map(m => m.id))
    const benzersiz = new Map()
    tumLokasyonlar.forEach(l => {
      if (firmaMusteriIdleri.has(l.musteriId) && !benzersiz.has(l.id)) benzersiz.set(l.id, l)
    })
    return [...benzersiz.values()].sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr'))
  })()

  const lokasyonMap = new Map(tumLokasyonlar.map(l => [l.id, l]))

  const formAc = () => {
    setForm({ ...bosForm, gorusen: kullanici.ad, tarih: new Date().toISOString().split('T')[0] })
    setSecilenFirma(''); setManuelKonuAc(false); setDuzenleId(null); setGoster(true)
    setYeniDosyalar([]); setMevcutDosyalar([])
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
      lokasyonId: g.lokasyonId || '',
    })
    setManuelKonuAc(manuelMi); setDuzenleId(g.id); setGoster(true)
    setYeniDosyalar([]); setMevcutDosyalar(g.dosyalar || [])
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleFirmaSec = (firmaAdi) => {
    setSecilenFirma(firmaAdi)
    // Firma değişince lokasyon da resetlensin (eski firmanın lokasyonu yeni firmaya yapışmasın)
    setForm({ ...form, firmaAdi, musteriId: '', muhatapId: '', muhatapAd: '', lokasyonId: '' })
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
    let gorusmeId = duzenleId
    try {
      if (duzenleId) {
        const g = await gorusmeGuncelle(duzenleId, { ...form, konu: sonKonu })
        if (!g) { toast.error('Görüşme güncellenemedi.'); return }
        setGorusmeler(prev => prev.map(x => x.id === duzenleId ? g : x))
      } else {
        const yeni = await gorusmeEkle({
          ...form, konu: sonKonu, aktNo: aktNo(gorusmeler),
          olusturanId: kullanici.id, olusturmaTarih: new Date().toISOString(),
        })
        if (!yeni) { toast.error('Görüşme kaydedilemedi.'); return }
        setGorusmeler(prev => [yeni, ...prev])
        gorusmeId = yeni.id
      }

      // Yeni seçilen dosyaları yükle
      if (yeniDosyalar.length > 0 && gorusmeId) {
        setDosyaYukleniyor(true)
        let basarili = 0
        for (const f of yeniDosyalar) {
          try {
            await dosyaYukle(gorusmeId, f, kullanici.ad)
            basarili++
          } catch (e) {
            console.error('[dosya yükleme]', f.name, e)
            toast.error(`"${f.name}" yüklenemedi: ${e.message}`)
          }
        }
        setDosyaYukleniyor(false)
        if (basarili > 0) {
          // Güncel görüşmeyi yenile (dosyalar kolonu dahil)
          const g = await gorusmeGetir(gorusmeId)
          if (g) setGorusmeler(prev => {
            const varMi = prev.some(x => x.id === gorusmeId)
            return varMi ? prev.map(x => x.id === gorusmeId ? g : x) : [g, ...prev]
          })
        }
      }

      toast.success(duzenleId ? 'Görüşme güncellendi.' : 'Görüşme kaydedildi.')
    } catch (err) {
      console.error('[gorusme kaydet]', err)
      toast.error('Hata: ' + (err?.message || 'kaydedilemedi'))
      return
    }
    setForm(bosForm); setSecilenFirma(''); setDuzenleId(null); setGoster(false)
    setYeniDosyalar([]); setMevcutDosyalar([])
  }

  const dosyaIndir = async (path, name) => {
    try {
      const url = await dosyaLinkiAl(path)
      const a = document.createElement('a')
      a.href = url; a.download = name; a.target = '_blank'
      a.click()
    } catch (e) {
      toast.error('Dosya açılamadı: ' + e.message)
    }
  }

  const mevcutDosyaSil = async (path) => {
    if (!duzenleId) return
    try {
      await dosyaSil(duzenleId, path)
      setMevcutDosyalar(prev => prev.filter(d => d.path !== path))
      // Görüşmeler state'indeki dosya listesini de güncelle
      setGorusmeler(prev => prev.map(x =>
        x.id === duzenleId ? { ...x, dosyalar: (x.dosyalar || []).filter(d => d.path !== path) } : x
      ))
      toast.success('Dosya silindi.')
    } catch (e) {
      toast.error('Silinemedi: ' + e.message)
    }
  }

  const boyutFormatla = (bytes) => {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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
    setYeniDosyalar([]); setMevcutDosyalar([])
  }

  const gorusenler = [...new Set(gorusmeler.map(g => g.gorusen).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'))

  const gorunenGorusmeler = [...gorusmeler]
    .filter(g => filtre === 'hepsi' || g.durum === filtre)
    .filter(g => gorusenFiltre === '' || g.gorusen === gorusenFiltre)
    .filter(g => konuFiltre === '' || g.konu === konuFiltre)
    .filter(g => trContains(
      `${g.firmaAdi} ${g.konu} ${g.gorusen} ${g.aktNo} ${g.muhatapAd || ''} ${g.takipNotu || ''}`,
      arama,
    ))

  const toplamSayfa = Math.max(1, Math.ceil(gorunenGorusmeler.length / sayfaBoyutu))
  const aktifSayfa = Math.min(sayfa, toplamSayfa)
  const sayfadakiGorusmeler = gorunenGorusmeler.slice(
    (aktifSayfa - 1) * sayfaBoyutu,
    aktifSayfa * sayfaBoyutu,
  )

  // Filtre değişince sayfa 1'e dön
  useEffect(() => { setSayfa(1) }, [filtre, gorusenFiltre, konuFiltre, arama, sayfaBoyutu])

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
            {firmaLokasyonlari.length > 0 && (
              <div>
                <Label>Lokasyon</Label>
                <CustomSelect value={form.lokasyonId || ''} onChange={e => setForm({ ...form, lokasyonId: e.target.value })}>
                  <option value="">— Belirtilmedi</option>
                  {firmaLokasyonlari.map(l => (
                    <option key={l.id} value={l.id}>{l.ad}</option>
                  ))}
                </CustomSelect>
              </div>
            )}
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

          {/* Dosyalar */}
          <div style={{ marginBottom: 16 }}>
            <Label>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Paperclip size={12} strokeWidth={1.5} /> Ekler (sözleşme, fotoğraf, belge…)
              </span>
            </Label>

            {/* Mevcut dosyalar (edit mode) */}
            {mevcutDosyalar.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {mevcutDosyalar.map(d => {
                  const resim = d.type?.startsWith('image/')
                  return (
                    <div key={d.path} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)',
                      marginBottom: 6,
                      background: 'var(--surface-card)',
                    }}>
                      {resim
                        ? <ImageIcon size={16} strokeWidth={1.5} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
                        : <FileText size={16} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.name}>
                          {d.name}
                        </div>
                        <div className="t-caption" style={{ display: 'flex', gap: 8 }}>
                          <span>{boyutFormatla(d.size)}</span>
                          {d.uploaderAd && <span>· {d.uploaderAd}</span>}
                          {d.uploadedAt && <span>· {new Date(d.uploadedAt).toLocaleDateString('tr-TR')}</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label="İndir"
                        onClick={() => dosyaIndir(d.path, d.name)}
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
                        <Download size={12} strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        aria-label="Sil"
                        onClick={() => mevcutDosyaSil(d.path)}
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
                  )
                })}
              </div>
            )}

            {/* Yeni seçilen dosyalar (henüz yüklenmemiş) */}
            {yeniDosyalar.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {yeniDosyalar.map((f, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px',
                    border: '1px dashed var(--brand-primary)',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: 6,
                    background: 'var(--brand-primary-soft)',
                  }}>
                    {f.type?.startsWith('image/')
                      ? <ImageIcon size={16} strokeWidth={1.5} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
                      : <FileText size={16} strokeWidth={1.5} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--brand-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.name}>
                        {f.name}
                      </div>
                      <div className="t-caption" style={{ color: 'var(--brand-primary)' }}>
                        {boyutFormatla(f.size)} · Kaydederken yüklenecek
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setYeniDosyalar(prev => prev.filter((_, idx) => idx !== i))}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--brand-primary)', padding: 4,
                      }}
                    >
                      <X size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Dosya seç butonu */}
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px',
              border: '1px dashed var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              cursor: dosyaYukleniyor ? 'not-allowed' : 'pointer',
              color: 'var(--text-secondary)',
              font: '500 13px/18px var(--font-sans)',
              background: 'var(--surface-card)',
              opacity: dosyaYukleniyor ? 0.5 : 1,
            }}>
              <Upload size={14} strokeWidth={1.5} />
              {dosyaYukleniyor ? 'Yükleniyor…' : 'Dosya ekle'}
              <input
                type="file"
                multiple
                disabled={dosyaYukleniyor}
                onChange={e => {
                  const files = Array.from(e.target.files || [])
                  setYeniDosyalar(prev => [...prev, ...files])
                  e.target.value = '' // aynı dosyayı tekrar seçebilsin
                }}
                style={{ display: 'none' }}
              />
            </label>
            <span className="t-caption" style={{ marginLeft: 8 }}>
              Fotoğraf, PDF, sözleşme, Word/Excel vs. (max 50 MB önerilir)
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={kaydet} disabled={dosyaYukleniyor}>
              {dosyaYukleniyor ? 'Dosyalar yükleniyor…' : (duzenleId ? 'Güncelle' : 'Kaydet')}
            </Button>
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
          <div style={{ overflowX: 'hidden' }}>
            <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>
              <colgroup>
                <col style={{ width: 90 }} />
                <col style={{ width: '20%' }} />
                <col />
                <col style={{ width: 90 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 80 }} />
              </colgroup>
              <thead>
                <tr>
                  {['No', 'Firma / Muhatap', 'Takip Notu', 'Konu', 'Görüşen', 'Tarih', 'Durum', ''].map((h, i) => (
                    <th key={i} style={{
                      background: 'var(--surface-sunken)',
                      padding: '10px 10px',
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
                {sayfadakiGorusmeler.map(g => (
                  <tr key={g.id}
                    onClick={() => navigate(`/gorusmeler/${g.id}`)}
                    style={{ cursor: 'pointer', transition: 'background 120ms' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 10px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                      <CodeBadge>{g.aktNo}</CodeBadge>
                    </td>
                    <td style={{ padding: '12px 10px', borderBottom: '1px solid var(--border-default)', width: 280, maxWidth: 280 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{
                          font: '500 13px/18px var(--font-sans)',
                          color: 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          flex: '1 1 auto',
                          minWidth: 0,
                        }}>
                          {g.firmaAdi}
                        </span>
                        {(g.dosyalar?.length || 0) > 0 && (
                          <span title={`${g.dosyalar.length} dosya`} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 2,
                            padding: '1px 6px',
                            background: 'var(--brand-primary-soft)',
                            color: 'var(--brand-primary)',
                            borderRadius: 'var(--radius-pill)',
                            font: '500 10px/14px var(--font-sans)',
                            flexShrink: 0,
                          }}>
                            <Paperclip size={10} strokeWidth={1.5} /> {g.dosyalar.length}
                          </span>
                        )}
                      </div>
                      {g.muhatapAd && (
                        <div style={{
                          font: '400 12px/16px var(--font-sans)',
                          color: 'var(--text-tertiary)',
                          marginTop: 2,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          minWidth: 0,
                        }}>
                          <User size={11} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.muhatapAd}</span>
                        </div>
                      )}
                      {g.lokasyonId && lokasyonMap.get(g.lokasyonId) && (
                        <div style={{
                          font: '400 12px/16px var(--font-sans)',
                          color: 'var(--brand-primary)',
                          marginTop: 2,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          minWidth: 0,
                        }}>
                          <span style={{ flexShrink: 0 }}>📍</span>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={lokasyonMap.get(g.lokasyonId).ad}>
                            {lokasyonMap.get(g.lokasyonId).ad}
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 10px', borderBottom: '1px solid var(--border-default)', maxWidth: 300 }}>
                      <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {g.takipNotu || '—'}
                      </p>
                    </td>
                    <td style={{ padding: '12px 10px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                      <Badge tone="brand">{g.konu}</Badge>
                    </td>
                    <td style={{ padding: '12px 10px', borderBottom: '1px solid var(--border-default)', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={g.gorusen || ''}>
                      {g.gorusen}
                    </td>
                    <td style={{ padding: '12px 10px', borderBottom: '1px solid var(--border-default)', font: '400 13px/18px var(--font-sans)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                      {g.tarih}
                    </td>
                    <td style={{ padding: '12px 10px', borderBottom: '1px solid var(--border-default)' }} onClick={e => e.stopPropagation()}>
                      <CustomSelect
                        value={g.durum}
                        onChange={e => durumGuncelle(g.id, e.target.value)}
                        style={{ height: 28, padding: '0 8px', fontSize: 12 }}
                      >
                        {durumlar.map(d => <option key={d.id} value={d.id}>{d.isim}</option>)}
                      </CustomSelect>
                    </td>
                    <td style={{ padding: '12px 10px', borderBottom: '1px solid var(--border-default)', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
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
            <Sayfalama
              aktifSayfa={aktifSayfa}
              toplamSayfa={toplamSayfa}
              toplam={gorunenGorusmeler.length}
              sayfaBoyutu={sayfaBoyutu}
              setSayfa={setSayfa}
              setSayfaBoyutu={setSayfaBoyutu}
            />
          </div>
        )}
      </Card>
    </div>
  )
}

function Sayfalama({ aktifSayfa, toplamSayfa, toplam, sayfaBoyutu, setSayfa, setSayfaBoyutu }) {
  if (toplam === 0) return null
  const ilk = (aktifSayfa - 1) * sayfaBoyutu + 1
  const son = Math.min(aktifSayfa * sayfaBoyutu, toplam)

  // Görünen sayfa numaraları: 1 ... aktif-1 aktif aktif+1 ... toplam
  const sayfalar = []
  const goster = (n) => sayfalar.push(n)
  const aralik = 1
  goster(1)
  for (let n = aktifSayfa - aralik; n <= aktifSayfa + aralik; n++) {
    if (n > 1 && n < toplamSayfa) goster(n)
  }
  if (toplamSayfa > 1) goster(toplamSayfa)
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
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, padding: '12px 16px',
      borderTop: '1px solid var(--border-default)',
      flexWrap: 'wrap',
    }}>
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
        <select
          value={sayfaBoyutu}
          onChange={e => setSayfaBoyutu(Number(e.target.value))}
          style={{
            height: 32, padding: '0 8px',
            background: 'var(--surface-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            font: '500 13px/16px var(--font-sans)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={200}>200</option>
        </select>
      </div>
    </div>
  )
}

export default Gorusmeler
