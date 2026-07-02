import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useServisTalebi } from '../context/ServisTalebiContext'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Plus, Pencil, Trash2, User, Phone, MessageCircle, Mail, Handshake,
  Building2, Monitor, Link2, Video, Send, Lightbulb, X,
  Paperclip, Upload, FileText, Image as ImageIcon, Download,
  MapPin, Settings, Clock, AlertTriangle, ReceiptText, CheckSquare,
  History, Zap, ArrowRight,
} from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { gorusmeleriGetir, gorusmeGetir, gorusmeEkle, gorusmeGuncelle, gorusmeSil as dbGorusmeSil, dosyaYukle, dosyaLinkiAl, dosyaSil } from '../services/gorusmeService'
import { musterileriGetir } from '../services/musteriService'
import { gorevleriGetir, gorevGuncelle } from '../services/gorevService'
import GorusenCokluSecim from '../components/GorusenCokluSecim'
import ComboBox from '../components/ComboBox'
import KonuYonetimModal from '../components/KonuYonetimModal'
import { supabase } from '../lib/supabase'
import { arrayToCamel } from '../lib/mapper'
import LokasyonYonetModal from '../components/LokasyonYonetModal'
import { trContains } from '../lib/trSearch'
import CustomSelect from '../components/CustomSelect'
import { SkeletonList } from '../components/Skeleton'
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
  const { talepler } = useServisTalebi()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [konuYonetimAcik, setKonuYonetimAcik] = useState(false)
  const [arama, setArama] = useState('')
  const [sayfa, setSayfa] = useState(1)
  const [sayfaBoyutu, setSayfaBoyutu] = useState(50)
  const [manuelKonuAc, setManuelKonuAc] = useState(false)
  const [yeniDosyalar, setYeniDosyalar] = useState([])   // Henüz yüklenmemiş File[]
  const [mevcutDosyalar, setMevcutDosyalar] = useState([]) // Sunucudaki dosyalar
  const [bagliGorevler, setBagliGorevler] = useState([])   // Bu gorusme'den acilan gorevler
  // Edit modunda gorusme_id'ye bagli gorevleri yukle
  useEffect(() => {
    if (!duzenleId) { setBagliGorevler([]); return }
    gorevleriGetir()
      .then(tum => setBagliGorevler((tum || []).filter(g => String(g.gorusmeId) === String(duzenleId))))
      .catch(e => console.warn('[bagliGorevler]', e?.message))
  }, [duzenleId])

  const gorevDurumDegis = async (gorevId, yeniDurum) => {
    try {
      const guncel = await gorevGuncelle(gorevId, { durum: yeniDurum })
      if (guncel) {
        setBagliGorevler(prev => prev.map(g => g.id === gorevId ? { ...g, durum: yeniDurum } : g))
        toast.success('Görev durumu güncellendi')
      }
    } catch (e) { toast.error('Güncellenemedi: ' + (e?.message || 'hata')) }
  }
  const [dosyaYukleniyor, setDosyaYukleniyor] = useState(false)
  const [lokasyonModalAcik, setLokasyonModalAcik] = useState(false)

  const gorusmeleriYenile = () => {
    gorusmeleriGetir()
      .then(g => setGorusmeler(g || []))
      .catch(err => console.error('[Gorusmeler yenile]', err))
  }

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

  // Konu önerileri: varsayılan + geçmişte kullanılan tüm konular (deduped)
  const konuOnerileri = useMemo(() => {
    const gecmis = [...new Set((gorusmeler || []).map(g => g.konu).filter(Boolean))]
    const varsay = new Set(varsayilanKonular)
    const eklenen = gecmis.filter(k => !varsay.has(k))
    return [...varsayilanKonular, ...eklenen.sort((a, b) => a.localeCompare(b, 'tr'))]
  }, [gorusmeler])

  // Muhatap önerileri: seçili firmanın kişileri + o firmada geçmişte yazılmış muhatap adları
  const muhatapOnerileri = useMemo(() => {
    const kisiler = firmaKisileri.map(m => `${m.ad} ${m.soyad}`.trim()).filter(Boolean)
    const gecmis = secilenFirma
      ? [...new Set((gorusmeler || [])
          .filter(g => g.firmaAdi === secilenFirma)
          .map(g => g.muhatapAd)
          .filter(Boolean))]
      : []
    const set = new Set(kisiler)
    const eklenen = gecmis.filter(m => !set.has(m))
    return [...kisiler, ...eklenen.sort((a, b) => a.localeCompare(b, 'tr'))]
  }, [firmaKisileri, gorusmeler, secilenFirma])

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

  // Panel'den ?yeni=1 ile gelinirse formu direkt aç
  useEffect(() => {
    if (searchParams.get('yeni') === '1' && kullanici?.ad) {
      formAc()
      const kopya = new URLSearchParams(searchParams)
      kopya.delete('yeni')
      setSearchParams(kopya, { replace: true })
    }
  }, [searchParams, setSearchParams, kullanici?.ad])

  const duzenleAc = (g) => {
    const manuelMi = !varsayilanKonular.includes(g.konu)
    setSecilenFirma(g.firmaAdi || '')
    setForm({
      firmaAdi: g.firmaAdi,
      musteriId: g.musteriId || g.muhatapId || '',
      // Eski kayıtlarda görüşülen kişi muhatap_id yerine musteri_id'de tutuluyor;
      // düzenlemede kişi seçili gelsin diye musteri_id'ye geri düş.
      muhatapId: g.muhatapId || g.musteriId || '',
      muhatapAd: g.muhatapAd || g.musteriAdi || '',
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
    // Yeni firma'nin musteri kaydini bul — boylece DB'de firma_adi + musteri_id
    // birlikte guncellenir (eski yanlis baglanti kopar)
    const yeniMusteri = (musteriler || []).find(m => m.firma === firmaAdi)
    // Firma değişince lokasyon da resetlensin (eski firmanın lokasyonu yeni firmaya yapışmasın)
    setForm({
      ...form,
      firmaAdi,
      musteriId: yeniMusteri?.id ? String(yeniMusteri.id) : '',
      muhatapId: '', muhatapAd: '', lokasyonId: '',
    })
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
    const sonKonu = manuelKonuAc
      ? (form.manuelKonu || '').trim().toLocaleUpperCase('tr')
      : form.konu
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
    return <SkeletonList />
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

      {/* Form acikken filtreler gizlensin — odaklanma icin */}
      {!goster && (<div>
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
      </div>)}

      {/* Form — 3 bölge: üst context bar + sol form/sağ timeline + alt hızlı aksiyon */}
      {goster && (
      <div>
        <FirmaContextBar firma={form.firmaAdi || secilenFirma} gorusmeler={gorusmeler} talepler={talepler} navigate={navigate} />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 320px)', gap: 14, alignItems: 'start' }}>
        <Card style={{ marginBottom: 0 }}>
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
              <ComboBox
                value={form.muhatapAd}
                onChange={v => {
                  const eslesen = firmaKisileri.find(m => `${m.ad} ${m.soyad}`.trim() === v)
                  setForm({
                    ...form,
                    muhatapAd: v,
                    muhatapId: eslesen ? eslesen.id : '',
                  })
                }}
                options={muhatapOnerileri}
                placeholder={secilenFirma ? 'Kişi seç veya adı yaz…' : 'İsim yaz…'}
              />
              {form.muhatapAd?.trim() && !form.muhatapId && (
                <p style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--success)', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Plus size={11} strokeWidth={2} /> Yeni kişi olarak kaydedilecek
                </p>
              )}
            </div>
            {secilenFirma && firmaKisileri.length > 0 && (
              <div>
                <Label>
                  Lokasyon
                  <button
                    type="button"
                    onClick={() => setLokasyonModalAcik(true)}
                    title="Lokasyon ekle/sil"
                    style={{
                      background: 'none', border: 'none', padding: '0 0 0 6px',
                      cursor: 'pointer', color: 'var(--brand-primary)',
                      font: '500 11px/14px var(--font-sans)',
                    }}
                  >
                    <Settings size={11} strokeWidth={1.5} style={{ verticalAlign: -1 }} /> yönet
                  </button>
                </Label>
                {firmaLokasyonlari.length > 0 ? (
                  <CustomSelect value={form.lokasyonId || ''} onChange={e => setForm({ ...form, lokasyonId: e.target.value })}>
                    <option value="">— Belirtilmedi</option>
                    {firmaLokasyonlari.map(l => (
                      <option key={l.id} value={l.id}>{l.ad}</option>
                    ))}
                  </CustomSelect>
                ) : (
                  <div style={{
                    padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface-sunken)',
                    border: '1px dashed var(--border-default)',
                    font: '400 12px/16px var(--font-sans)',
                    color: 'var(--text-tertiary)',
                  }}>
                    Bu firma için lokasyon yok. <button
                      type="button"
                      onClick={() => setLokasyonModalAcik(true)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--brand-primary)', font: '500 12px/16px var(--font-sans)', textDecoration: 'underline' }}
                    >+ Lokasyon ekle</button>
                  </div>
                )}
              </div>
            )}
            <div>
              <Label required>
                Aktivite konusu
                <button
                  type="button"
                  onClick={() => setKonuYonetimAcik(true)}
                  title="Konuları yönet"
                  style={{
                    background: 'none', border: 'none', padding: '0 0 0 6px',
                    cursor: 'pointer', color: 'var(--brand-primary)',
                    font: '500 11px/14px var(--font-sans)',
                  }}
                >
                  <Settings size={11} strokeWidth={1.5} style={{ verticalAlign: -1 }} /> yönet
                </button>
              </Label>
              <ComboBox
                value={manuelKonuAc ? form.manuelKonu : form.konu}
                onChange={v => {
                  const isVarsayilan = konuOnerileri.includes(v)
                  if (isVarsayilan) {
                    setManuelKonuAc(false)
                    setForm({ ...form, konu: v, manuelKonu: '' })
                  } else {
                    setManuelKonuAc(true)
                    setForm({ ...form, konu: '', manuelKonu: v })
                  }
                }}
                options={konuOnerileri}
                placeholder="Konu seç veya kendin yaz…"
              />
              {manuelKonuAc && (form.manuelKonu || '').trim() && (
                <p style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--success)', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Plus size={11} strokeWidth={2} /> Yeni konu olarak kaydedilecek
                </p>
              )}
            </div>
            <div>
              <Label required>Görüşen</Label>
              <GorusenCokluSecim
                value={form.gorusen}
                onChange={v => setForm({ ...form, gorusen: v })}
                kullanicilar={kullanicilar || []}
              />
            </div>
            <div>
              <Label>İrtibat şekli</Label>
              <CustomSelect
                value={form.irtibatSekli}
                onChange={e => setForm({ ...form, irtibatSekli: e.target.value })}
              >
                <option value="">Seç…</option>
                {irtibatSekilleri.map(i => (
                  <option key={i.id} value={i.id}>{i.isim}</option>
                ))}
              </CustomSelect>
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

          {/* Bagli gorevler — bu gorusmeden acilan gorevlerin durumunu buradan degistir */}
          {duzenleId && bagliGorevler.length > 0 && (
            <div style={{ marginTop: 16, padding: 14, background: 'var(--surface-sunken)', borderRadius: 8, border: '1px solid var(--border-default)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <CheckSquare size={14} strokeWidth={1.8} style={{ color: 'var(--success)' }} />
                <span style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                  Bu görüşmeden açılan görevler
                </span>
                <span style={{ font: '500 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                  {bagliGorevler.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {bagliGorevler.map(g => {
                  const DURUM_OPT = [
                    { id: 'bekliyor',   isim: 'Bekliyor',     renk: 'var(--info)' },
                    { id: 'devam',      isim: 'Devam Ediyor', renk: 'var(--warning)' },
                    { id: 'tamamlandi', isim: 'Tamamlandı',   renk: 'var(--success)' },
                  ]
                  return (
                    <div key={g.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                      padding: '10px 12px',
                      background: 'var(--surface-card)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 6,
                    }}>
                      <button
                        onClick={() => navigate(`/gorevler/${g.id}`)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', textAlign: 'left', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={g.baslik}
                      >
                        {g.baslik}
                      </button>
                      {g.sonTarih && (
                        <span style={{ font: '400 11.5px/16px var(--font-sans)', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                          {new Date(g.sonTarih).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                      <div style={{ display: 'flex', gap: 4 }}>
                        {DURUM_OPT.map(opt => {
                          const aktif = g.durum === opt.id
                          return (
                            <button
                              key={opt.id}
                              onClick={() => !aktif && gorevDurumDegis(g.id, opt.id)}
                              disabled={aktif}
                              style={{
                                padding: '4px 10px',
                                background: aktif ? opt.renk : 'transparent',
                                color: aktif ? '#fff' : opt.renk,
                                border: `1px solid ${opt.renk}`,
                                borderRadius: 999,
                                cursor: aktif ? 'default' : 'pointer',
                                font: '600 11px/14px var(--font-sans)',
                                opacity: aktif ? 1 : 0.75,
                              }}
                            >
                              {opt.isim}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button variant="primary" onClick={kaydet} disabled={dosyaYukleniyor}>
              {dosyaYukleniyor ? 'Dosyalar yükleniyor…' : (duzenleId ? 'Güncelle' : 'Kaydet')}
            </Button>
            <Button variant="secondary" onClick={iptal}>İptal</Button>
          </div>
        </Card>
        <Card padding={16} style={{ marginBottom: 0, position: 'sticky', top: 16, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
          <GecmisGorusmeler firma={form.firmaAdi || secilenFirma} gorusmeler={gorusmeler} navigate={navigate} mevcutId={duzenleId} />
        </Card>
        </div>
        <HizliAksiyon
          musteriId={form.musteriId}
          firmaAdi={form.firmaAdi || secilenFirma}
          navigate={navigate}
          onayli={!!(form.firmaAdi || secilenFirma)}
        />
      </div>
      )}

      {/* Liste — form acikken gizle */}
      {!goster && (
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
                <col style={{ width: '22%' }} />
                <col />
                <col style={{ width: 160 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 70 }} />
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
                    <td style={{ padding: '12px 10px', borderBottom: '1px solid var(--border-default)', overflow: 'hidden' }} title={g.konu || ''}>
                      <Badge tone="brand" style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', verticalAlign: 'middle' }}>{g.konu}</Badge>
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
      )}

      {/* Lokasyon yönetim modal'ı — firma seçili olduğunda formdan açılır */}
      <LokasyonYonetModal
        acik={lokasyonModalAcik}
        musteriId={firmaKisileri[0]?.id || null}
        musteriAdi={secilenFirma}
        lokasyonlar={firmaLokasyonlari}
        onLokasyonlarChange={(yeni) => {
          // tumLokasyonlar'da firmaya ait olanları yeni listeyle replace et
          const firmaIdleri = new Set(firmaKisileri.map(m => m.id))
          const digerleri = tumLokasyonlar.filter(l => !firmaIdleri.has(l.musteriId))
          setTumLokasyonlar([...digerleri, ...yeni])
          // Eğer silinen lokasyon formda seçiliyse temizle
          if (form.lokasyonId && !yeni.some(l => l.id?.toString() === form.lokasyonId.toString())) {
            setForm(f => ({ ...f, lokasyonId: '' }))
          }
        }}
        onClose={() => setLokasyonModalAcik(false)}
      />

      <KonuYonetimModal
        acik={konuYonetimAcik}
        onClose={() => setKonuYonetimAcik(false)}
        gorusmeler={gorusmeler}
        varsayilanKonular={varsayilanKonular}
        onGuncellendi={gorusmeleriYenile}
      />
    </div>
  )
}

// Form üst bandı — firma seçildiğinde mevcut yüklü veriden 4 hızlı metrik gösterir.
// DB hit YOK: gorusmeler + talepler zaten state'te.
function FirmaContextBar({ firma, gorusmeler, talepler, navigate }) {
  if (!firma) {
    return (
      <Card style={{ marginBottom: 14, borderLeft: '3px solid var(--brand-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-tertiary)' }}>
          <Building2 size={16} strokeWidth={1.5} />
          <span style={{ font: '500 13px/18px var(--font-sans)' }}>Firma seçince geçmiş, açık iş ve son temas burada görünür.</span>
        </div>
      </Card>
    )
  }
  const firmaGorusmeler = gorusmeler.filter(g => g.firmaAdi === firma)
  const firmaTalepler = (talepler || []).filter(t => t.firmaAdi === firma)
  const acikTalep = firmaTalepler.filter(t => !['tamamlandi', 'iptal'].includes(t.durum)).length
  const sonTemas = firmaGorusmeler[0]?.tarih
  const sonGorusen = firmaGorusmeler[0]?.gorusen
  const gunFark = sonTemas ? Math.floor((Date.now() - new Date(sonTemas).getTime()) / 86400000) : null
  const gunFarkText = gunFark === null ? '—' : gunFark === 0 ? 'bugün' : gunFark === 1 ? 'dün' : `${gunFark} gün önce`

  const KART = ({ icon: I, renk, l, v, sub }) => (
    <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--surface-sunken)', borderLeft: `3px solid ${renk}`, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <I size={11} strokeWidth={1.5} style={{ color: renk }} />
        <span style={{ font: '600 10.5px/14px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l}</span>
      </div>
      <div style={{ font: '700 14px/20px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
      {sub && <div style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  )

  return (
    <Card style={{ marginBottom: 14, borderLeft: '3px solid var(--brand-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Building2 size={16} strokeWidth={1.5} style={{ color: 'var(--brand-primary)' }} />
        <span style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{firma}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        <KART icon={Clock} renk="var(--brand-primary)" l="Son Temas" v={gunFarkText} sub={sonGorusen ? `${sonGorusen}` : undefined} />
        <KART icon={History} renk="var(--info)" l="Geçmiş Görüşme" v={firmaGorusmeler.length} sub="toplam" />
        <KART icon={AlertTriangle} renk={acikTalep > 0 ? 'var(--warning)' : 'var(--success)'} l="Açık Servis" v={acikTalep} sub={`${firmaTalepler.length} toplam`} />
        <KART icon={CheckSquare} renk="var(--success)" l="Açık İş" v={firmaGorusmeler.filter(g => g.durum === 'acik').length} sub="görüşme" />
      </div>
    </Card>
  )
}

// Sağ panel — bu firmayla geçmiş görüşmeler timeline
function GecmisGorusmeler({ firma, gorusmeler, navigate, mevcutId }) {
  const [hepsiAcik, setHepsiAcik] = useState(false)
  const firmaGorusmeler = useMemo(
    () => gorusmeler.filter(g => g.firmaAdi === firma && g.id !== mevcutId).slice(0, 50),
    [firma, gorusmeler, mevcutId]
  )
  const goster = hepsiAcik ? firmaGorusmeler : firmaGorusmeler.slice(0, 6)
  if (!firma) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: 'var(--text-tertiary)', flexDirection: 'column', gap: 8, padding: 20 }}>
        <History size={28} strokeWidth={1.3} />
        <span style={{ font: '500 12.5px/18px var(--font-sans)', textAlign: 'center' }}>Firma seçince bu alanda geçmiş görüşmeler listelenir.</span>
      </div>
    )
  }
  if (firmaGorusmeler.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: 'var(--text-tertiary)', flexDirection: 'column', gap: 8, padding: 20 }}>
        <span style={{ font: '500 12.5px/18px var(--font-sans)', textAlign: 'center' }}>Bu firma ile henüz başka görüşme yok.</span>
      </div>
    )
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <History size={14} strokeWidth={1.5} style={{ color: 'var(--brand-primary)' }} />
        <span style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>Geçmiş Görüşmeler</span>
        <span style={{ font: '500 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>{firmaGorusmeler.length}</span>
      </div>
      <div style={{ position: 'relative', paddingLeft: 16 }}>
        <div style={{ position: 'absolute', left: 5, top: 4, bottom: 4, width: 1, background: 'var(--border-default)' }} />
        {goster.map((g, i) => {
          const d = new Date(g.tarih)
          return (
            <div key={g.id} style={{ position: 'relative', paddingBottom: i < goster.length - 1 ? 12 : 0 }}>
              <span style={{ position: 'absolute', left: -15, top: 4, width: 11, height: 11, borderRadius: '50%', background: 'var(--surface-card)', border: '2px solid var(--brand-primary)' }} />
              <button
                onClick={() => navigate(`/gorusmeler/${g.id}`)}
                style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', width: '100%' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ font: '500 11.5px/16px var(--font-sans)', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                    {d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                  {g.gorusen && <span style={{ font: '500 11.5px/16px var(--font-sans)', color: 'var(--text-secondary)' }}>· {g.gorusen}</span>}
                </div>
                <div style={{ font: '600 12.5px/18px var(--font-sans)', color: 'var(--brand-primary)' }}>{g.konu || '—'}</div>
                {g.takipNotu && (
                  <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)', marginTop: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {g.takipNotu}
                  </div>
                )}
              </button>
            </div>
          )
        })}
      </div>
      {firmaGorusmeler.length > 6 && (
        <button
          onClick={() => setHepsiAcik(!hepsiAcik)}
          style={{ marginTop: 10, padding: '5px 10px', background: 'transparent', border: '1px dashed var(--border-default)', borderRadius: 6, cursor: 'pointer', font: '500 11.5px/16px var(--font-sans)', color: 'var(--text-secondary)' }}
        >
          {hepsiAcik ? '− Daha az göster' : `+ ${firmaGorusmeler.length - 6} kayıt daha`}
        </button>
      )}
    </div>
  )
}

// Hızlı aksiyon — bu görüşmeden direkt yeni iş başlat
function HizliAksiyon({ musteriId, firmaAdi, navigate, onayli }) {
  const stilB = (renk) => ({
    flex: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '10px 14px',
    background: 'var(--surface-card)',
    border: `1.5px solid ${renk}`,
    color: renk,
    borderRadius: 8,
    cursor: onayli ? 'pointer' : 'not-allowed',
    opacity: onayli ? 1 : 0.45,
    font: '600 13px/18px var(--font-sans)',
    transition: 'background 120ms',
  })
  const handler = (yol) => () => {
    if (!onayli) return
    const params = new URLSearchParams()
    if (musteriId) params.set('musteriId', String(musteriId))
    if (firmaAdi)  params.set('firma', firmaAdi)
    navigate(`${yol}?${params.toString()}`)
  }
  return (
    <Card style={{ marginTop: 14, background: 'var(--brand-primary-soft)', border: '1px solid var(--brand-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Zap size={14} strokeWidth={1.8} style={{ color: 'var(--brand-primary)' }} />
        <span style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--brand-primary)' }}>Bu görüşmeden →</span>
        {!onayli && <span style={{ font: '400 11.5px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginLeft: 6 }}>(önce firma seçin)</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={stilB('var(--success)')} onClick={handler('/gorevler')} disabled={!onayli}>
          <CheckSquare size={14} strokeWidth={1.8} /> Görev oluştur <ArrowRight size={12} strokeWidth={1.5} />
        </button>
        <button style={stilB('var(--warning)')} onClick={handler('/servis-talepleri/yeni')} disabled={!onayli}>
          <AlertTriangle size={14} strokeWidth={1.8} /> Servis talebi aç <ArrowRight size={12} strokeWidth={1.5} />
        </button>
        <button style={stilB('var(--brand-primary)')} onClick={handler('/teklifler/yeni')} disabled={!onayli}>
          <ReceiptText size={14} strokeWidth={1.8} /> Teklif başlat <ArrowRight size={12} strokeWidth={1.5} />
        </button>
      </div>
    </Card>
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
