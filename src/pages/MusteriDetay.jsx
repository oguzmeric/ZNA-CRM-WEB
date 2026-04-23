import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Save, X, Plus, Trash2, Star, MapPin, Phone, Mail,
  Users, Building2, FileText, Receipt, CheckSquare, ArrowRight, Inbox, Check,
  CheckCircle2,
} from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { musteriGetir, musteriGuncelle, musterileriGetir } from '../services/musteriService'
import CustomSelect from '../components/CustomSelect'
import { musteriKisileriniGetir, musteriKisiEkle, musteriKisiGuncelle, musteriKisiSil } from '../services/musteriKisiService'
import { musteriLokasyonlariniGetir, musteriLokasyonEkle, musteriLokasyonGuncelle, musteriLokasyonSil } from '../services/musteriLokasyonService'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { teklifleriGetir } from '../services/teklifService'
import { satislariGetir } from '../services/satisService'
import { gorevleriGetir } from '../services/gorevService'
import {
  Button, Input, Textarea, Label,
  Card, CardTitle, Badge, CodeBadge, Avatar, Alert, EmptyState, SegmentedControl,
} from '../components/ui'

const durumMap = {
  aktif: { tone: 'aktif', isim: 'Aktif' },
  lead:  { tone: 'lead',  isim: 'Lead' },
  pasif: { tone: 'pasif', isim: 'Pasif' },
  kayip: { tone: 'kayip', isim: 'Kayıp' },
}

const bosKisi = { ad: '', soyad: '', unvan: '', telefon: '', email: '', anaKisi: false }
const bosLok  = { ad: '', adres: '', notlar: '', aktif: true }

const TIMELINE_ICONS = {
  gorusme: Phone,
  teklif:  FileText,
  fatura:  Receipt,
  gorev:   CheckSquare,
}
const TIMELINE_RENK = {
  gorusme: 'var(--info)',
  teklif:  'var(--brand-primary)',
  fatura:  'var(--success)',
  gorev:   'var(--warning)',
}

function MusteriDetay() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const lokasyonBolumRef = useRef(null)

  const yeniOlusturuldu = location.state?.yeniMusteri === true

  const [musteri, setMusteri]       = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [aktifSekme, setAktifSekme] = useState('hepsi')

  const [kisiler, setKisiler]       = useState([])
  const [kisiForm, setKisiForm]     = useState(null)
  const [kisiKaydediliyor, setKisiKaydediliyor] = useState(false)

  const [duzenleForm, setDuzenleForm] = useState(null)
  const [duzenleKaydediliyor, setDuzenleKaydediliyor] = useState(false)

  const [lokasyonlar, setLokasyonlar]   = useState([])
  const [lokasyonForm, setLokasyonForm] = useState(null)
  const [lokKaydediliyor, setLokKaydediliyor] = useState(false)

  const [gorusmeler, setGorusmeler] = useState([])
  const [teklifler, setTeklifler]   = useState([])
  const [satislar, setSatislar]     = useState([])
  const [gorevler, setGorevler]     = useState([])

  useEffect(() => {
    const yukle = async () => {
      const musteriIdNum = Number(id)
      const [m, k, l, g, t, s, gv] = await Promise.all([
        musteriGetir(musteriIdNum),
        musteriKisileriniGetir(musteriIdNum),
        musteriLokasyonlariniGetir(musteriIdNum),
        gorusmeleriGetir(),
        teklifleriGetir(),
        satislariGetir(),
        gorevleriGetir(),
      ])
      setMusteri(m); setKisiler(k); setLokasyonlar(l)
      if (m?.firma) {
        const firma = m.firma.toLowerCase().trim()
        setGorusmeler((g || []).filter(x => x.firmaAdi?.toLowerCase().trim() === firma))
        setTeklifler((t || []).filter(x => x.firmaAdi?.toLowerCase().trim() === firma))
        setSatislar((s || []).filter(x => x.firmaAdi?.toLowerCase().trim() === firma))
        setGorevler((gv || []).filter(x => x.firmaAdi?.toLowerCase().trim() === firma))
      }
      setYukleniyor(false)
      if (yeniOlusturuldu) {
        setKisiForm({ ...bosKisi })
        setTimeout(() => lokasyonBolumRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400)
      }
    }
    yukle()
  }, [id])

  if (yukleniyor) return <div style={{ padding: 24 }}><EmptyState title="Yükleniyor…" /></div>

  if (!musteri) return (
    <div style={{ padding: 24 }}>
      <EmptyState
        icon={<Building2 size={32} strokeWidth={1.5} />}
        title="Müşteri bulunamadı"
        action={
          <Button variant="secondary" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => navigate('/musteriler')}>
            Müşterilere dön
          </Button>
        }
      />
    </div>
  )

  const durum = durumMap[musteri.durum] || durumMap.aktif

  // ── CRUD ──
  const kisiKaydet = async () => {
    if (!kisiForm.ad?.trim()) { toast.error('Ad zorunludur.'); return }
    setKisiKaydediliyor(true)
    try {
      if (kisiForm.id) {
        const g = await musteriKisiGuncelle(kisiForm.id, kisiForm)
        setKisiler(prev => prev.map(k => k.id === kisiForm.id ? g : (kisiForm.anaKisi ? { ...k, anaKisi: false } : k)))
        toast.success('Kişi güncellendi.')
      } else {
        const y = await musteriKisiEkle({ ...kisiForm, musteriId: Number(id) })
        setKisiler(prev => [...(kisiForm.anaKisi ? prev.map(k => ({ ...k, anaKisi: false })) : prev), y])
        toast.success('Kişi eklendi.')
      }
      setKisiForm(null)
    } catch { toast.error('Kaydedilemedi.') }
    finally { setKisiKaydediliyor(false) }
  }

  const kisiSil = async (kisiId) => {
    const onay = await confirm({
      baslik: 'Kişiyi Sil', mesaj: 'Bu ilgili kişi silinecek. Emin misiniz?',
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    await musteriKisiSil(kisiId)
    setKisiler(prev => prev.filter(k => k.id !== kisiId))
    toast.success('Kişi silindi.')
  }

  const lokasyonKaydet = async () => {
    if (!lokasyonForm.ad?.trim()) { toast.error('Lokasyon adı zorunludur.'); return }
    setLokKaydediliyor(true)
    try {
      if (lokasyonForm.id) {
        const g = await musteriLokasyonGuncelle(lokasyonForm.id, lokasyonForm)
        setLokasyonlar(prev => prev.map(l => l.id === lokasyonForm.id ? g : l))
        toast.success('Lokasyon güncellendi.')
      } else {
        const y = await musteriLokasyonEkle({ ...lokasyonForm, musteriId: Number(id) })
        setLokasyonlar(prev => [...prev, y])
        toast.success('Lokasyon eklendi.')
      }
      setLokasyonForm(null)
    } catch { toast.error('Kaydedilemedi.') }
    finally { setLokKaydediliyor(false) }
  }

  const lokasyonSil = async (lokId) => {
    const onay = await confirm({
      baslik: 'Lokasyonu Sil', mesaj: 'Bu lokasyon silinecek. Emin misiniz?',
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    await musteriLokasyonSil(lokId)
    setLokasyonlar(prev => prev.filter(l => l.id !== lokId))
    toast.success('Lokasyon silindi.')
  }

  const duzenleBaslat = () => {
    setDuzenleForm({
      firma: musteri.firma || '', kod: musteri.kod || '', sehir: musteri.sehir || '',
      vergiNo: musteri.vergiNo || '', telefon: musteri.telefon || '', email: musteri.email || '',
      durum: musteri.durum || 'aktif', notlar: musteri.notlar || '',
    })
  }

  const duzenleKaydet = async () => {
    if (!duzenleForm.firma?.trim()) { toast.error('Firma adı zorunludur.'); return }
    if (!duzenleForm.kod?.trim())   { toast.error('Müşteri kodu zorunludur.'); return }
    setDuzenleKaydediliyor(true)
    try {
      if (duzenleForm.kod.trim() !== musteri.kod) {
        const tum = await musterileriGetir()
        const cakisma = (tum || []).find(m => m.kod === duzenleForm.kod.trim() && m.id !== Number(id))
        if (cakisma) { toast.error(`Bu kod zaten kullanılıyor: ${cakisma.firma}`); setDuzenleKaydediliyor(false); return }
      }
      const g = await musteriGuncelle(Number(id), { ...duzenleForm, kod: duzenleForm.kod.trim(), firma: duzenleForm.firma.trim() })
      if (g) { setMusteri(prev => ({ ...prev, ...g })); setDuzenleForm(null); toast.success('Firma bilgileri güncellendi.') }
      else   { toast.error('Güncellenemedi.') }
    } catch (e) { toast.error(e?.message || 'Güncellenemedi.') }
    finally { setDuzenleKaydediliyor(false) }
  }

  // ── Finansal özet ──
  const toplam = satislar.reduce((s, f) => s + (f.genelToplam || 0), 0)
  const tahsil = satislar.reduce((s, f) => s + (f.odenenToplam || 0), 0)
  const kalan  = toplam - tahsil
  const bugun  = new Date(); bugun.setHours(0, 0, 0, 0)
  const geciken = satislar
    .filter(f => f.durum === 'gonderildi' && f.vadeTarihi && new Date(f.vadeTarihi) < bugun)
    .reduce((s, f) => s + ((f.genelToplam || 0) - (f.odenenToplam || 0)), 0)
  const fmt = n => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })

  // ── Timeline ──
  const tumOlaylar = [
    ...gorusmeler.map(g => ({ id: `g-${g.id}`, tip: 'gorusme', tarih: g.tarih, baslik: g.konu, detay: `Görüşen: ${g.gorusen || '—'}`, hedef: `/gorusmeler/${g.id}` })),
    ...teklifler.map(t => ({ id: `t-${t.id}`, tip: 'teklif', tarih: t.tarih, baslik: t.konu || t.teklifNo, detay: `${t.teklifNo} · ${fmt(t.genelToplam)} ₺`, hedef: `/teklifler/${t.id}` })),
    ...satislar.map(s => ({ id: `s-${s.id}`, tip: 'fatura', tarih: s.faturaTarihi, baslik: s.faturaNo, detay: `${fmt(s.genelToplam)} ₺`, hedef: `/satislar/${s.id}` })),
    ...gorevler.map(g => ({ id: `gv-${g.id}`, tip: 'gorev', tarih: g.olusturmaTarih?.split('T')[0] || '', baslik: g.baslik, detay: g.aciklama || '—', hedef: `/gorevler/${g.id}` })),
  ].sort((a, b) => new Date(b.tarih) - new Date(a.tarih))

  const filtreliOlaylar = aktifSekme === 'hepsi' ? tumOlaylar : tumOlaylar.filter(o => o.tip === aktifSekme)

  return (
    <div style={{ padding: 24, maxWidth: 1040, margin: '0 auto' }}>

      {/* Geri */}
      <button
        onClick={() => navigate('/musteriler')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--text-tertiary)', font: '500 13px/18px var(--font-sans)',
          marginBottom: 16, transition: 'color 120ms',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-primary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
      >
        <ArrowLeft size={14} strokeWidth={1.5} /> Müşterilere dön
      </button>

      {/* Yeni müşteri banner */}
      {yeniOlusturuldu && (
        <Alert
          variant="success"
          title="Müşteri oluşturuldu"
          style={{ marginBottom: 16 }}
        >
          Aşağıdan ilgili kişiler ve alt lokasyonlar ekleyebilirsiniz. Bunlar mobil uygulamada da görünecek.
        </Alert>
      )}

      {/* Ana başlık kartı */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
            <Avatar name={musteri.firma || musteri.ad} size="lg" />
            <div style={{ minWidth: 0 }}>
              <h1 className="t-h1" style={{ marginBottom: 6 }}>{musteri.firma || '—'}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Badge tone={durum.tone}>{durum.isim}</Badge>
                {musteri.kod && <CodeBadge>{musteri.kod}</CodeBadge>}
                {musteri.sehir && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                    <MapPin size={11} strokeWidth={1.5} /> {musteri.sehir}
                  </span>
                )}
                {musteri.vergiNo && (
                  <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                    VKN: {musteri.vergiNo}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
            <Button variant="primary" iconLeft={<Pencil size={14} strokeWidth={1.5} />} onClick={duzenleBaslat}>
              Düzenle
            </Button>
            <Button variant="secondary" iconLeft={<FileText size={14} strokeWidth={1.5} />} onClick={() => navigate(`/firma-gecmisi/${encodeURIComponent(musteri.firma)}`)}>
              Firma geçmişi
            </Button>
          </div>
        </div>

        {musteri.notlar && !duzenleForm && (
          <div style={{
            marginTop: 16,
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--brand-primary-soft)',
            border: '1px solid var(--border-default)',
            font: '400 13px/20px var(--font-sans)',
            color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
          }}>
            {musteri.notlar}
          </div>
        )}

        {/* Düzenle formu */}
        {duzenleForm && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border-default)' }}>
            <p className="t-label" style={{ marginBottom: 12 }}>FİRMA BİLGİLERİNİ DÜZENLE</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <Label required>Firma adı</Label>
                <Input value={duzenleForm.firma} onChange={e => setDuzenleForm(p => ({ ...p, firma: e.target.value }))} />
              </div>
              <div>
                <Label required>Müşteri kodu</Label>
                <Input value={duzenleForm.kod} onChange={e => setDuzenleForm(p => ({ ...p, kod: e.target.value }))} style={{ fontFamily: 'var(--font-mono)' }} placeholder="BAS-0001" />
              </div>
              <div>
                <Label>Durum</Label>
                <CustomSelect value={duzenleForm.durum} onChange={e => setDuzenleForm(p => ({ ...p, durum: e.target.value }))}>
                  <option value="aktif">Aktif</option>
                  <option value="lead">Lead</option>
                  <option value="pasif">Pasif</option>
                  <option value="kayip">Kayıp</option>
                </CustomSelect>
              </div>
              <div>
                <Label>Telefon</Label>
                <Input value={duzenleForm.telefon} onChange={e => setDuzenleForm(p => ({ ...p, telefon: e.target.value }))} />
              </div>
              <div>
                <Label>E-posta</Label>
                <Input type="email" value={duzenleForm.email} onChange={e => setDuzenleForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <Label>Şehir / ilçe</Label>
                <Input value={duzenleForm.sehir} onChange={e => setDuzenleForm(p => ({ ...p, sehir: e.target.value }))} placeholder="İstanbul · Başakşehir" />
              </div>
              <div>
                <Label>Vergi no</Label>
                <Input value={duzenleForm.vergiNo} onChange={e => setDuzenleForm(p => ({ ...p, vergiNo: e.target.value }))} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <Label>Notlar</Label>
                <Textarea value={duzenleForm.notlar} onChange={e => setDuzenleForm(p => ({ ...p, notlar: e.target.value }))} rows={3} placeholder="Adres, müşteri notları…" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" iconLeft={<Save size={14} strokeWidth={1.5} />} onClick={duzenleKaydet} disabled={duzenleKaydediliyor}>
                {duzenleKaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
              </Button>
              <Button variant="secondary" onClick={() => setDuzenleForm(null)}>İptal</Button>
            </div>
          </div>
        )}
      </Card>

      {/* İlgili kişiler */}
      <Card padding={0} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} strokeWidth={1.5} style={{ color: 'var(--text-secondary)' }} />
            <h2 className="t-h2" style={{ margin: 0 }}>İlgili Kişiler</h2>
            <span className="t-caption tabular-nums">({kisiler.length})</span>
          </div>
          {!kisiForm && (
            <Button variant="secondary" size="sm" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => setKisiForm({ ...bosKisi })}>
              Kişi ekle
            </Button>
          )}
        </div>

        {kisiForm && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-default)', background: 'var(--surface-sunken)' }}>
            <p className="t-label" style={{ marginBottom: 12 }}>{kisiForm.id ? 'KİŞİYİ DÜZENLE' : 'YENİ KİŞİ EKLE'}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
              {[
                { key: 'ad',      label: 'Ad', required: true, placeholder: 'Ad' },
                { key: 'soyad',   label: 'Soyad', placeholder: 'Soyad' },
                { key: 'unvan',   label: 'Unvan', placeholder: 'Satın Alma Müdürü' },
                { key: 'telefon', label: 'Telefon', placeholder: '0532 000 00 00' },
                { key: 'email',   label: 'E-posta', placeholder: 'kisi@firma.com' },
              ].map(f => (
                <div key={f.key}>
                  <Label required={f.required}>{f.label}</Label>
                  <Input value={kisiForm[f.key]} onChange={e => setKisiForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} />
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', font: '500 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={kisiForm.anaKisi}
                    onChange={e => setKisiForm(p => ({ ...p, anaKisi: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: 'var(--brand-primary)' }}
                  />
                  <Star size={14} strokeWidth={1.5} /> Ana kişi
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" onClick={kisiKaydet} disabled={kisiKaydediliyor}>
                {kisiKaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
              </Button>
              <Button variant="secondary" onClick={() => setKisiForm(null)}>İptal</Button>
            </div>
          </div>
        )}

        {kisiler.length === 0 && !kisiForm ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<Users size={28} strokeWidth={1.5} />}
              title="Henüz ilgili kişi eklenmedi"
              action={<Button variant="secondary" size="sm" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => setKisiForm({ ...bosKisi })}>İlk kişiyi ekle</Button>}
            />
          </div>
        ) : (
          <div>
            {kisiler.map(kisi => (
              <div
                key={kisi.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--border-default)',
                  transition: 'background 120ms',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <Avatar name={kisi.ad + ' ' + (kisi.soyad || '')} size="md" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
                      {kisi.ad} {kisi.soyad}
                    </span>
                    {kisi.anaKisi && (
                      <Badge tone="beklemede" icon={<Star size={11} strokeWidth={1.5} />}>Ana kişi</Badge>
                    )}
                    {kisi.unvan && (
                      <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>· {kisi.unvan}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 2, font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
                    {kisi.telefon && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontVariantNumeric: 'tabular-nums' }}><Phone size={11} strokeWidth={1.5} /> {kisi.telefon}</span>}
                    {kisi.email   && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mail size={11} strokeWidth={1.5} /> {kisi.email}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    aria-label="Düzenle"
                    onClick={() => setKisiForm({ ...kisi })}
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
                    onClick={() => kisiSil(kisi.id)}
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
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Alt lokasyonlar */}
      <Card ref={lokasyonBolumRef} padding={0} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={16} strokeWidth={1.5} style={{ color: 'var(--text-secondary)' }} />
            <h2 className="t-h2" style={{ margin: 0 }}>Alt Lokasyonlar</h2>
            <span className="t-caption tabular-nums">({lokasyonlar.length})</span>
          </div>
          {!lokasyonForm && (
            <Button variant="secondary" size="sm" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => setLokasyonForm({ ...bosLok })}>
              Lokasyon ekle
            </Button>
          )}
        </div>

        {lokasyonForm && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-default)', background: 'var(--surface-sunken)' }}>
            <p className="t-label" style={{ marginBottom: 12 }}>{lokasyonForm.id ? 'LOKASYONU DÜZENLE' : 'YENİ LOKASYON EKLE'}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <Label required>Lokasyon adı</Label>
                <Input value={lokasyonForm.ad} onChange={e => setLokasyonForm(p => ({ ...p, ad: e.target.value }))} placeholder="Otopark Doğu, Sistem Odası, Lobi…" />
              </div>
              <div>
                <Label>Adres</Label>
                <Input value={lokasyonForm.adres} onChange={e => setLokasyonForm(p => ({ ...p, adres: e.target.value }))} placeholder="Atatürk Cad. No:12, Kat 3…" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <Label>Notlar</Label>
                <Input value={lokasyonForm.notlar} onChange={e => setLokasyonForm(p => ({ ...p, notlar: e.target.value }))} placeholder="Erişim bilgileri, yetkili kişi, anahtar konumu…" />
              </div>
              <div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', font: '500 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={lokasyonForm.aktif}
                    onChange={e => setLokasyonForm(p => ({ ...p, aktif: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: 'var(--brand-primary)' }}
                  />
                  Aktif lokasyon
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" onClick={lokasyonKaydet} disabled={lokKaydediliyor}>
                {lokKaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
              </Button>
              <Button variant="secondary" onClick={() => setLokasyonForm(null)}>İptal</Button>
            </div>
          </div>
        )}

        {lokasyonlar.length === 0 && !lokasyonForm ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<MapPin size={28} strokeWidth={1.5} />}
              title="Henüz lokasyon eklenmedi"
              action={<Button variant="secondary" size="sm" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => setLokasyonForm({ ...bosLok })}>İlk lokasyonu ekle</Button>}
            />
          </div>
        ) : (
          <div>
            {lokasyonlar.map(lok => (
              <div
                key={lok.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--border-default)',
                  transition: 'background 120ms',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{
                  width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: lok.aktif ? 'var(--success-soft)' : 'var(--surface-sunken)',
                  color: lok.aktif ? 'var(--success)' : 'var(--text-tertiary)',
                  flexShrink: 0, marginTop: 2,
                }}>
                  <MapPin size={14} strokeWidth={1.5} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{lok.ad}</span>
                    {!lok.aktif && <Badge tone="pasif">Pasif</Badge>}
                  </div>
                  {lok.adres  && <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', margin: '2px 0 0' }}>{lok.adres}</p>}
                  {lok.notlar && <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', margin: '2px 0 0', fontStyle: 'italic' }}>{lok.notlar}</p>}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    aria-label="Düzenle"
                    onClick={() => setLokasyonForm({ ...lok })}
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
                    onClick={() => lokasyonSil(lok.id)}
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
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Özet KPI 4'lü */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { key: 'gorusme', isim: 'Görüşme', sayi: gorusmeler.length, Icon: Phone },
          { key: 'teklif',  isim: 'Teklif',  sayi: teklifler.length,  Icon: FileText },
          { key: 'fatura',  isim: 'Fatura',  sayi: satislar.length,   Icon: Receipt },
          { key: 'gorev',   isim: 'Görev',   sayi: gorevler.length,   Icon: CheckSquare },
        ].map(k => (
          <button
            key={k.key}
            onClick={() => setAktifSekme(k.key)}
            style={{
              textAlign: 'left',
              background: 'var(--surface-card)',
              border: `1px solid ${aktifSekme === k.key ? 'var(--brand-primary)' : 'var(--border-default)'}`,
              borderRadius: 'var(--radius-md)',
              padding: 16,
              cursor: 'pointer',
              transition: 'all 120ms',
              boxShadow: aktifSekme === k.key ? 'var(--shadow-sm)' : 'none',
            }}
            onMouseEnter={e => { if (aktifSekme !== k.key) e.currentTarget.style.borderColor = 'var(--border-strong)' }}
            onMouseLeave={e => { if (aktifSekme !== k.key) e.currentTarget.style.borderColor = 'var(--border-default)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, color: 'var(--text-tertiary)' }}>
              <span className="t-label">{k.isim}</span>
              <k.Icon size={14} strokeWidth={1.5} />
            </div>
            <div style={{ font: '600 24px/1 var(--font-sans)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {k.sayi}
            </div>
          </button>
        ))}
      </div>

      {/* Finansal özet */}
      {satislar.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <CardTitle>Finansal Özet</CardTitle>
            <button
              onClick={() => navigate('/satislar')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-primary)', font: '500 13px/18px var(--font-sans)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              Tüm faturalar <ArrowRight size={14} strokeWidth={1.5} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'TOPLAM',       value: `₺${fmt(toplam)}`,  color: 'var(--text-primary)' },
              { label: 'TAHSİL EDİLEN', value: `₺${fmt(tahsil)}`, color: 'var(--success)' },
              { label: 'KALAN BAKİYE',  value: `₺${fmt(kalan)}`,  color: kalan > 0 ? 'var(--warning)' : 'var(--success)' },
              { label: 'GECİKMİŞ',      value: `₺${fmt(geciken)}`, color: geciken > 0 ? 'var(--danger)' : 'var(--text-primary)' },
            ].map(k => (
              <div key={k.label} style={{
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 14px',
              }}>
                <div className="t-label" style={{ marginBottom: 4 }}>{k.label}</div>
                <div style={{ font: '600 16px/22px var(--font-sans)', color: k.color, fontVariantNumeric: 'tabular-nums' }}>
                  {k.value}
                </div>
              </div>
            ))}
          </div>

          <div>
            {satislar.slice(0, 4).map(f => {
              const gecikmisMi = f.durum === 'gonderildi' && f.vadeTarihi && new Date(f.vadeTarihi) < bugun
              const tone = gecikmisMi ? 'kayip'
                : f.durum === 'odendi' ? 'aktif'
                : f.durum === 'gonderildi' ? 'lead' : 'pasif'
              const isim = gecikmisMi ? 'Gecikti'
                : f.durum === 'odendi' ? 'Ödendi'
                : f.durum === 'gonderildi' ? 'Gönderildi' : 'Taslak'
              return (
                <div
                  key={f.id}
                  onClick={() => navigate(`/satislar/${f.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CodeBadge>{f.faturaNo}</CodeBadge>
                    <Badge tone={tone}>{isim}</Badge>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      ₺{fmt(f.genelToplam)}
                    </span>
                    {f.vadeTarihi && (
                      <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(f.vadeTarihi).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Timeline */}
      <Card padding={0}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-default)' }}>
          <SegmentedControl
            options={[
              { value: 'hepsi',   label: 'Tümü',       count: tumOlaylar.length },
              { value: 'gorusme', label: 'Görüşmeler', count: gorusmeler.length },
              { value: 'teklif',  label: 'Teklifler',  count: teklifler.length },
              { value: 'fatura',  label: 'Faturalar',  count: satislar.length },
              { value: 'gorev',   label: 'Görevler',   count: gorevler.length },
            ]}
            value={aktifSekme}
            onChange={setAktifSekme}
          />
        </div>
        <div style={{ padding: 16 }}>
          {filtreliOlaylar.length === 0 ? (
            <EmptyState icon={<Inbox size={28} strokeWidth={1.5} />} title="Bu kategoride kayıt bulunamadı" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtreliOlaylar.map(olay => {
                const IconC = TIMELINE_ICONS[olay.tip] ?? FileText
                const renk = TIMELINE_RENK[olay.tip] ?? 'var(--brand-primary)'
                return (
                  <div
                    key={olay.id}
                    onClick={() => navigate(olay.hedef)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      transition: 'background 120ms',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{
                      width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--surface-sunken)',
                      color: renk,
                      flexShrink: 0,
                    }}>
                      <IconC size={14} strokeWidth={1.5} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {olay.baslik}
                      </div>
                      <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {olay.detay}
                      </div>
                    </div>
                    <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                      {olay.tarih}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

export default MusteriDetay
