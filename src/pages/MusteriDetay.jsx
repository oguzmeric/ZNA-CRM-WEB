import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Save, X, Plus, Trash2, Star, MapPin, Phone, Mail,
  Users, Building2, FileText, Receipt, CheckSquare, ArrowRight, Inbox, Check,
  CheckCircle2, Send, User,
} from 'lucide-react'
import MusteriDavetModal from '../components/MusteriDavetModal'
import MusteriCihazlariBolumu from '../components/MusteriCihazlariBolumu'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { musteriGetir, musteriGuncelle, musterileriGetir } from '../services/musteriService'
import CustomSelect from '../components/CustomSelect'
import { SkeletonDetay } from '../components/Skeleton'
import { musteriKisileriniGetir, musteriKisiEkle, musteriKisiGuncelle, musteriKisiSil } from '../services/musteriKisiService'
import { musteriLokasyonlariniGetir, musteriLokasyonEkle, musteriLokasyonGuncelle, musteriLokasyonSil } from '../services/musteriLokasyonService'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { teklifleriGetir } from '../services/teklifService'
import { satislariGetir } from '../services/satisService'
import { musteriSiparisleri, SIPARIS_DURUMLARI } from '../services/siparisService'
import { gorevleriGetir } from '../services/gorevService'
import { musteriDemoZimmetleri } from '../services/demoService'
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
  const { kullanicilar } = useAuth()
  const personelListesi = (kullanicilar || []).filter(k => k.tip === 'zna')
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
  const [lokArama, setLokArama] = useState('')
  const [lokHepsi, setLokHepsi] = useState(false)

  const [davetAcik, setDavetAcik] = useState(false)

  const [gorusmeler, setGorusmeler] = useState([])
  const [teklifler, setTeklifler]   = useState([])
  const [satislar, setSatislar]     = useState([])
  const [gorevler, setGorevler]     = useState([])
  const [siparisler, setSiparisler] = useState([])
  const [demoZimmetler, setDemoZimmetler] = useState([])

  useEffect(() => {
    const yukle = async () => {
      const musteriIdNum = Number(id)
      try {
        const [m, k, l, g, t, s, gv, sip] = await Promise.all([
          musteriGetir(musteriIdNum),
          musteriKisileriniGetir(musteriIdNum),
          musteriLokasyonlariniGetir(musteriIdNum),
          gorusmeleriGetir(),
          teklifleriGetir(),
          satislariGetir(),
          gorevleriGetir(),
          musteriSiparisleri(musteriIdNum).catch(() => []),
        ])
        musteriDemoZimmetleri(musteriIdNum).then(dz => setDemoZimmetler(dz || [])).catch(() => {})
        setMusteri(m); setKisiler(k); setLokasyonlar(l)
        // Siparişler firma bazında da toplansın (aynı firmadaki başka müşteri kayıtları da dahil)
        if (m?.firma) {
          const sipFirma = await musteriSiparisleri(musteriIdNum, m.firma).catch(() => sip || [])
          setSiparisler(sipFirma || [])
          const firma = m.firma.toLowerCase().trim()
          setGorusmeler((g || []).filter(x => x.firmaAdi?.toLowerCase().trim() === firma))
          setTeklifler((t || []).filter(x => x.firmaAdi?.toLowerCase().trim() === firma))
          setSatislar((s || []).filter(x => x.firmaAdi?.toLowerCase().trim() === firma))
          setGorevler((gv || []).filter(x => x.firmaAdi?.toLowerCase().trim() === firma))
        } else {
          setSiparisler(sip || [])
        }
        if (yeniOlusturuldu) {
          setKisiForm({ ...bosKisi })
          setTimeout(() => lokasyonBolumRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400)
        }
      } catch (err) {
        console.error('[MusteriDetay yükle]', err)
      } finally {
        setYukleniyor(false)
      }
    }
    yukle()
  }, [id])

  if (yukleniyor) return <SkeletonDetay />

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
      vergiNo: musteri.vergiNo || '', vergiDairesi: musteri.vergiDairesi || '',
      adres: musteri.adres || '',
      telefon: musteri.telefon || '', email: musteri.email || '',
      durum: musteri.durum || 'aktif', notlar: musteri.notlar || '',
      temsilciKullaniciId: musteri.temsilciKullaniciId ?? null,
      ad: musteri.ad || '', soyad: musteri.soyad || '', unvan: musteri.unvan || '',
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
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>

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

      {/* Ana başlık kartı — kompakt */}
      <Card style={{ marginBottom: 12, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
            <Avatar name={musteri.firma || musteri.ad} size="md" />
            <div style={{ minWidth: 0 }}>
              <div style={{ font: '700 16px/22px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 2 }}>
                {musteri.firma || '—'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                <Badge tone={durum.tone}>{durum.isim}</Badge>
                {musteri.kod && <CodeBadge>{musteri.kod}</CodeBadge>}
                {musteri.sehir && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <MapPin size={11} strokeWidth={1.5} /> {musteri.sehir}
                  </span>
                )}
                {musteri.vergiNo && (
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>VKN: {musteri.vergiNo}</span>
                )}
                {musteri.vergiDairesi && <span>· {musteri.vergiDairesi}</span>}
                {musteri.temsilciKullaniciId && (() => {
                  const t = personelListesi.find(k => k.id === musteri.temsilciKullaniciId)
                  return t ? (
                    <Badge tone="brand" icon={<User size={11} strokeWidth={1.5} />}>
                      Temsilci: {t.ad}
                    </Badge>
                  ) : null
                })()}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
            <Button variant="primary" size="sm" iconLeft={<Pencil size={13} strokeWidth={1.5} />} onClick={duzenleBaslat}>Düzenle</Button>
            <Button variant="secondary" size="sm" iconLeft={<Send size={13} strokeWidth={1.5} />} onClick={() => setDavetAcik(true)}>Portal Davet</Button>
            <Button variant="secondary" size="sm" iconLeft={<FileText size={13} strokeWidth={1.5} />} onClick={() => navigate(`/firma-gecmisi/${encodeURIComponent(musteri.firma)}`)}>Firma geçmişi</Button>
          </div>
        </div>

        {(musteri.adres || musteri.notlar) && !duzenleForm && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {musteri.adres && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 6,
                font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)',
              }}>
                <MapPin size={11} strokeWidth={1.5} style={{ marginTop: 2, color: 'var(--text-tertiary)', flexShrink: 0 }} />
                <span style={{ whiteSpace: 'pre-wrap' }}>{musteri.adres}</span>
              </div>
            )}
            {musteri.notlar && (
              <div style={{
                font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)',
                fontStyle: 'italic', whiteSpace: 'pre-wrap',
              }}>
                {musteri.notlar}
              </div>
            )}
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
              <div>
                <Label>Vergi dairesi</Label>
                <Input value={duzenleForm.vergiDairesi} onChange={e => setDuzenleForm(p => ({ ...p, vergiDairesi: e.target.value }))} placeholder="Kadıköy Vergi Dairesi" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <Label>Açık adres</Label>
                <Textarea value={duzenleForm.adres} onChange={e => setDuzenleForm(p => ({ ...p, adres: e.target.value }))} rows={2} placeholder="Mahalle, sokak, bina, kapı no…" />
              </div>
              <div style={{ gridColumn: 'span 2', marginTop: 4 }}>
                <p className="t-label" style={{ marginBottom: 8 }}>YETKİLİ BİLGİLERİ</p>
              </div>
              <div>
                <Label>Yetkili adı</Label>
                <Input value={duzenleForm.ad} onChange={e => setDuzenleForm(p => ({ ...p, ad: e.target.value }))} placeholder="Ahmet" />
              </div>
              <div>
                <Label>Yetkili soyadı</Label>
                <Input value={duzenleForm.soyad} onChange={e => setDuzenleForm(p => ({ ...p, soyad: e.target.value }))} placeholder="Yılmaz" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <Label>Unvan</Label>
                <Input value={duzenleForm.unvan} onChange={e => setDuzenleForm(p => ({ ...p, unvan: e.target.value }))} placeholder="Satın Alma Müdürü" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <Label>Müşteri temsilcisi</Label>
                <CustomSelect
                  value={duzenleForm.temsilciKullaniciId ?? ''}
                  onChange={e => setDuzenleForm(p => ({
                    ...p,
                    temsilciKullaniciId: e.target.value ? Number(e.target.value) : null,
                  }))}
                >
                  <option value="">— Atanmamış —</option>
                  {personelListesi.map(k => (
                    <option key={k.id} value={k.id}>{k.ad}</option>
                  ))}
                </CustomSelect>
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

      {/* Özet — kompakt yatay şerit */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 4,
        padding: '6px 10px',
        background: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        marginBottom: 12,
        alignItems: 'stretch',
      }}>
        {[
          { key: 'gorusme', isim: 'Görüşme', sayi: gorusmeler.length, Icon: Phone },
          { key: 'teklif',  isim: 'Teklif',  sayi: teklifler.length,  Icon: FileText },
          { key: 'fatura',  isim: 'Fatura',  sayi: satislar.length,   Icon: Receipt },
          { key: 'gorev',   isim: 'Görev',   sayi: gorevler.length,   Icon: CheckSquare },
        ].map((k, i, arr) => {
          const aktif = aktifSekme === k.key
          return [
            <button
              key={k.key}
              onClick={() => setAktifSekme(k.key)}
              style={{
                background: aktif ? 'var(--brand-primary-soft)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 12px',
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                transition: 'background 120ms',
              }}
              onMouseEnter={e => { if (!aktif) e.currentTarget.style.background = 'var(--surface-sunken)' }}
              onMouseLeave={e => { if (!aktif) e.currentTarget.style.background = 'transparent' }}
            >
              <k.Icon size={13} strokeWidth={1.5} style={{ color: aktif ? 'var(--brand-primary)' : 'var(--text-tertiary)' }} />
              <span style={{ font: '500 12px/16px var(--font-sans)', color: aktif ? 'var(--brand-primary)' : 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                {k.isim}
              </span>
              <span style={{
                font: '700 14px/18px var(--font-sans)',
                color: aktif ? 'var(--brand-primary)' : 'var(--text-primary)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {k.sayi}
              </span>
            </button>,
            i < arr.length - 1 && (
              <span key={`sep-${i}`} style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-default)' }} />
            ),
          ]
        })}
      </div>

      {/* Sipariş Özeti — ZNA-SIP kayıtları (üst sırada göster) */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <CardTitle>Sipariş Özeti</CardTitle>
          {siparisler.length > 0 && (
            <button
              onClick={() => navigate(`/siparisler?musteri=${musteri.id}`)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-primary)', font: '500 13px/18px var(--font-sans)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              Tümünü gör <ArrowRight size={14} strokeWidth={1.5} />
            </button>
          )}
        </div>
        {siparisler.length === 0 ? (
          <div style={{
            padding: '20px 12px', textAlign: 'center',
            color: 'var(--text-tertiary)', font: '400 13px/18px var(--font-sans)',
            background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--border-default)',
          }}>
            Bu müşteriye ait sipariş yok.
          </div>
        ) : (
        <>
          {(() => {
            const aktif = siparisler.filter(s => s.durum === 'aktif').length
            const tamamlanan = siparisler.filter(s => s.durum === 'tamamlandi').length
            const toplamTutar = siparisler.filter(s => s.durum !== 'iptal').reduce((sum, s) => sum + Number(s.genelToplam || 0), 0)
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'TOPLAM SİPARİŞ', value: siparisler.length, color: 'var(--text-primary)' },
                  { label: 'AKTİF',          value: aktif,             color: '#3b82f6' },
                  { label: 'TAMAMLANDI',     value: tamamlanan,        color: 'var(--success)' },
                  { label: 'TOPLAM TUTAR',   value: `₺${fmt(toplamTutar)}`, color: 'var(--text-primary)' },
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
            )
          })()}
          <div>
            {siparisler.slice(0, 5).map(s => {
              const durumObj = SIPARIS_DURUMLARI.find(d => d.id === s.durum)
              const kaynakLabel = s.kaynakTipi === 'teklif' ? 'TEKLİFTEN' : 'ÖN SİPARİŞTEN'
              const kaynakRenk = s.kaynakTipi === 'teklif' ? '#3b82f6' : '#10b981'
              return (
                <div
                  key={s.id}
                  onClick={() => navigate(`/siparisler/${s.id}`)}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>{s.siparisNo}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                      background: `${durumObj?.renk}22`, color: durumObj?.renk,
                      border: `1px solid ${durumObj?.renk}55`,
                    }}>{durumObj?.isim || s.durum}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                      background: `${kaynakRenk}15`, color: kaynakRenk,
                    }}>{kaynakLabel}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      ₺{fmt(s.genelToplam)}
                    </span>
                    <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums', minWidth: 80, textAlign: 'right' }}>
                      {s.onayTarihi ? new Date(s.onayTarihi).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
        )}
      </Card>

      {/* Müşterideki Demolar — aktif demo zimmetleri + geçmiş */}
      {demoZimmetler.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <CardTitle>Demo Cihazlar</CardTitle>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {demoZimmetler.filter(z => !z.gercekIadeTarihi).length} aktif · {demoZimmetler.length} toplam
            </span>
          </div>
          <div>
            {demoZimmetler.slice(0, 6).map(z => {
              const aktifMi = !z.gercekIadeTarihi
              const kalan = aktifMi && z.beklenenIadeTarihi
                ? Math.floor((new Date(z.beklenenIadeTarihi) - new Date()) / 86400000)
                : null
              return (
                <div
                  key={z.id}
                  onClick={() => navigate(`/demolar/${z.cihazId}`)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    padding: '10px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      {z.cihaz?.ad || `Cihaz #${z.cihazId}`}
                    </span>
                    {z.cihaz?.seri_no && (
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-tertiary)' }}>
                        S.N. {z.cihaz.seri_no}
                      </span>
                    )}
                    {aktifMi ? (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                        background: kalan !== null && kalan < 0 ? 'rgba(220,38,38,0.12)' : 'rgba(59,130,246,0.12)',
                        color: kalan !== null && kalan < 0 ? '#DC2626' : '#3b82f6',
                      }}>
                        {kalan !== null && kalan < 0 ? `${-kalan} GÜN GECİKTİ` : 'MÜŞTERİDE'}
                      </span>
                    ) : (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                        background: z.musteriKarari === 'aldi' ? 'rgba(34,197,94,0.12)' : 'var(--surface-sunken)',
                        color: z.musteriKarari === 'aldi' ? 'var(--success)' : 'var(--text-tertiary)',
                      }}>
                        {z.musteriKarari === 'aldi' ? 'SATIN ALDI' : z.musteriKarari === 'almadi' ? 'ALMADI' : 'İADE EDİLDİ'}
                      </span>
                    )}
                    {aktifMi && !z.imzaliTutanakUrl && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                        background: 'rgba(245,158,11,0.12)', color: '#B45309',
                      }}>TUTANAK BEKLENİYOR</span>
                    )}
                  </div>
                  <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums', minWidth: 120, textAlign: 'right' }}>
                    {z.verisTarihi ? new Date(z.verisTarihi).toLocaleDateString('tr-TR') : ''}
                    {aktifMi && z.beklenenIadeTarihi ? ` → ${new Date(z.beklenenIadeTarihi).toLocaleDateString('tr-TR')}` : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Müşteri Cihaz Envanteri — SN/IP/MAC/kimlik takibi + arıza durumu */}
      <MusteriCihazlariBolumu musteriId={Number(id)} lokasyonlar={lokasyonlar} />

      {/* Timeline — müşteri etkileşim geçmişi (scrollable) */}
      <Card padding={0} style={{ marginBottom: 16 }}>
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
        <div style={{ padding: 12, maxHeight: 360, overflowY: 'auto' }}>
          {filtreliOlaylar.length === 0 ? (
            <div style={{
              padding: '10px 14px',
              font: '400 12px/16px var(--font-sans)',
              color: 'var(--text-tertiary)',
              fontStyle: 'italic',
              textAlign: 'center',
            }}>
              Bu kategoride kayıt bulunamadı.
            </div>
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
          <div style={{
            padding: '10px 14px',
            font: '400 12px/16px var(--font-sans)',
            color: 'var(--text-tertiary)',
            fontStyle: 'italic',
          }}>
            Henüz ilgili kişi eklenmedi. Üstteki <b style={{ fontStyle: 'normal', color: 'var(--text-secondary)' }}>+ Kişi ekle</b> butonundan ekleyebilirsin.
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
          <div style={{
            padding: '10px 14px',
            font: '400 12px/16px var(--font-sans)',
            color: 'var(--text-tertiary)',
            fontStyle: 'italic',
          }}>
            Henüz lokasyon eklenmedi. Üstteki <b style={{ fontStyle: 'normal', color: 'var(--text-secondary)' }}>+ Lokasyon ekle</b> butonundan ekleyebilirsin.
          </div>
        ) : (
          (() => {
            // Çok lokasyonlu müşteride çarşaf olmasın: arama + çok kolonlu grid + ilk 9
            const q = lokArama.trim().toLocaleLowerCase('tr')
            const filtreli = q
              ? lokasyonlar.filter(l => `${l.ad || ''} ${l.adres || ''} ${l.notlar || ''}`.toLocaleLowerCase('tr').includes(q))
              : lokasyonlar
            const LIMIT = 9
            const gorunenLok = (lokHepsi || q) ? filtreli : filtreli.slice(0, LIMIT)
            return (
              <div style={{ padding: '12px 20px 16px' }}>
                {lokasyonlar.length > LIMIT && (
                  <input
                    type="text"
                    value={lokArama}
                    onChange={e => setLokArama(e.target.value)}
                    placeholder={`${lokasyonlar.length} lokasyonda ara…`}
                    style={{
                      width: '100%', maxWidth: 360, padding: '8px 12px', marginBottom: 12,
                      background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                      font: '400 13px/18px var(--font-sans)',
                    }}
                  />
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
                  {gorunenLok.map(lok => (
                    <div
                      key={lok.id}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '10px 12px',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-sm)',
                        transition: 'background 120ms',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{
                        width: 26, height: 26, borderRadius: 'var(--radius-sm)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: lok.aktif ? 'var(--success-soft)' : 'var(--surface-sunken)',
                        color: lok.aktif ? 'var(--success)' : 'var(--text-tertiary)',
                        flexShrink: 0, marginTop: 1,
                      }}>
                        <MapPin size={13} strokeWidth={1.5} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span title={lok.ad} style={{
                            font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{lok.ad}</span>
                          {!lok.aktif && <Badge tone="pasif">Pasif</Badge>}
                        </div>
                        {(lok.adres || lok.notlar) && (
                          <p title={[lok.adres, lok.notlar].filter(Boolean).join(' · ')} style={{
                            font: '400 11px/15px var(--font-sans)', color: 'var(--text-tertiary)', margin: '2px 0 0',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {[lok.adres, lok.notlar].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button
                          aria-label="Düzenle"
                          onClick={() => setLokasyonForm({ ...lok })}
                          style={{
                            width: 26, height: 26,
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
                            width: 26, height: 26,
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
                {q && filtreli.length === 0 && (
                  <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', fontStyle: 'italic', margin: '10px 0 0' }}>
                    Aramayla eşleşen lokasyon yok.
                  </p>
                )}
                {!q && filtreli.length > LIMIT && (
                  <button
                    onClick={() => setLokHepsi(h => !h)}
                    style={{
                      marginTop: 12, padding: '8px 16px', width: '100%',
                      background: 'var(--surface-sunken)', border: '1px dashed var(--border-default)',
                      borderRadius: 'var(--radius-sm)', color: 'var(--brand-primary)',
                      font: '600 13px/18px var(--font-sans)', cursor: 'pointer',
                    }}
                  >
                    {lokHepsi ? '▲ Daralt' : `▼ Tümünü göster (${filtreli.length})`}
                  </button>
                )}
              </div>
            )
          })()
        )}
      </Card>

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

      <MusteriDavetModal
        open={davetAcik}
        onClose={() => setDavetAcik(false)}
        musteri={musteri}
        onayKisi={kisiler.find(k => k.anaKisi) || kisiler[0] || null}
      />
    </div>
  )
}

export default MusteriDetay
