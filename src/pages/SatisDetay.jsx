import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, Printer, Mail, Save, Send, CheckCircle2,
  Search, Package, Link as LinkIcon, Inbox,
} from 'lucide-react'
import {
  satisGetir, satisEkle, satisGuncelle, satisSil,
  tahsilatEkle, tahsilatSil, yeniFaturaNo, stokDusumYap,
} from '../services/satisService'
import { musterileriGetir } from '../services/musteriService'
import { stokUrunleriniGetir } from '../services/stokService'
import { useConfirm } from '../context/ConfirmContext'
import { useToast } from '../context/ToastContext'
import CustomSelect from '../components/CustomSelect'
import {
  Button, Input, Textarea, Label, Card, Badge, CodeBadge,
  EmptyState, Modal, Table, THead, TBody, TR, TH, TD,
} from '../components/ui'

const bosForm = {
  faturaNo: '',
  firmaAdi: '',
  musteriYetkili: '',
  musteriEmail: '',
  musteriTelefon: '',
  faturaTarihi: new Date().toISOString().split('T')[0],
  vadeTarihi: '',
  durum: 'taslak',
  paraBirimi: 'TRY',
  notlar: '',
  aciklama: '',
  teklifId: null,
  teklifNo: '',
  satirlar: [],
  tahsilatlar: [],
}

const bosSatir = () => ({
  id: crypto.randomUUID(),
  stokKodu: '',
  urunAdi: '',
  aciklama: '',
  miktar: 1,
  birim: 'Adet',
  birimFiyat: 0,
  iskontoOran: 0,
  kdvOran: 20,
  araToplam: 0,
  kdvTutar: 0,
  satirToplam: 0,
})

const satirHesapla = (satir) => {
  const ham = satir.miktar * satir.birimFiyat
  const iskontoTutar = ham * (satir.iskontoOran / 100)
  const iskontoSonrasi = ham - iskontoTutar
  const kdvTutar = iskontoSonrasi * (satir.kdvOran / 100)
  const satirToplam = iskontoSonrasi + kdvTutar
  return { ...satir, araToplam: iskontoSonrasi, kdvTutar, satirToplam }
}

const paraBirimFormat = (sayi) =>
  `${(sayi || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`

const tarihFormat = (tarih) => {
  if (!tarih) return '—'
  return new Date(tarih).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const durumBilgi = (durum, vadeTarihi) => {
  const bugun = new Date()
  bugun.setHours(0, 0, 0, 0)
  const gosterim =
    durum === 'gonderildi' && vadeTarihi && new Date(vadeTarihi) < bugun ? 'gecikti' : durum
  const map = {
    taslak:     { label: 'Taslak',     tone: 'pasif' },
    gonderildi: { label: 'Gönderildi', tone: 'lead' },
    odendi:     { label: 'Ödendi',     tone: 'aktif' },
    gecikti:    { label: 'Gecikti',    tone: 'kayip' },
    iptal:      { label: 'İptal',      tone: 'pasif' },
  }
  return map[gosterim] || map.taslak
}

const BIRIM_SECENEKLERI = [
  { value: 'Adet', label: 'Adet' },
  { value: 'Kg', label: 'Kg' },
  { value: 'Lt', label: 'Lt' },
  { value: 'M', label: 'M' },
  { value: 'M2', label: 'M²' },
  { value: 'Paket', label: 'Paket' },
  { value: 'Kutu', label: 'Kutu' },
  { value: 'Saat', label: 'Saat' },
  { value: 'Gun', label: 'Gün' },
]

const KDV_SECENEKLERI = [
  { value: 0, label: '%0' },
  { value: 1, label: '%1' },
  { value: 8, label: '%8' },
  { value: 10, label: '%10' },
  { value: 18, label: '%18' },
  { value: 20, label: '%20' },
]

const ODEME_YONTEMLERI = [
  { value: 'nakit', label: 'Nakit' },
  { value: 'banka', label: 'Banka' },
  { value: 'kredi_karti', label: 'Kredi Kartı' },
  { value: 'cek', label: 'Çek' },
  { value: 'havale', label: 'Havale / EFT' },
]

const PARA_BIRIMLERI = [
  { value: 'TRY', label: '₺ TRY' },
  { value: 'USD', label: '$ USD' },
  { value: 'EUR', label: '€ EUR' },
]

const VADE_SECENEKLERI = [
  { label: 'Aynı gün', gun: 0 },
  { label: '7 gün', gun: 7 },
  { label: '14 gün', gun: 14 },
  { label: '30 gün', gun: 30 },
  { label: '60 gün', gun: 60 },
]

function SatisDetay() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { confirm } = useConfirm()
  const { toast } = useToast()

  const yeniMod = id === 'yeni'

  const [form, setForm] = useState({ ...bosForm })
  const [yukleniyor, setYukleniyor] = useState(!yeniMod)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [musteriler, setMusteriler] = useState([])
  const [stoklar, setStoklar] = useState([])
  const [stokArama, setStokArama] = useState({})
  const [stokOneri, setStokOneri] = useState({})

  const [tahsilatForm, setTahsilatForm] = useState({
    tarih: new Date().toISOString().split('T')[0],
    tutar: '',
    odemeYontemi: 'banka',
    aciklama: '',
  })
  const [tahsilatEkleniyor, setTahsilatEkleniyor] = useState(false)
  const [tahsilatPanelAcik, setTahsilatPanelAcik] = useState(false)

  useEffect(() => {
    Promise.all([musterileriGetir(), stokUrunleriniGetir()]).then(([m, s]) => {
      setMusteriler(m || [])
      setStoklar(s || [])
    })
  }, [])

  useEffect(() => {
    if (yeniMod) {
      yeniFaturaNo().then((no) => {
        setForm((prev) => ({ ...prev, faturaNo: no }))
      })
      const onDoldurum = localStorage.getItem('satis_on_doldurum')
      if (onDoldurum) {
        try {
          const d = JSON.parse(onDoldurum)
          setForm((prev) => ({
            ...prev,
            ...d,
            satirlar: (d.satirlar || []).map((s) => satirHesapla(s)),
          }))
        } catch (e) { console.error('satis_on_doldurum parse hata:', e) }
        localStorage.removeItem('satis_on_doldurum')
      }
    } else {
      satisGetir(id).then((data) => {
        if (data) {
          setForm({
            ...data,
            satirlar: Array.isArray(data.satirlar) ? data.satirlar : [],
            tahsilatlar: Array.isArray(data.tahsilatlar) ? data.tahsilatlar : [],
          })
        }
        setYukleniyor(false)
      })
    }
  }, [id, yeniMod])

  const satirGuncelle = (satirId, alan, deger) => {
    setForm((prev) => ({
      ...prev,
      satirlar: prev.satirlar.map((s) => {
        if (s.id !== satirId) return s
        return satirHesapla({ ...s, [alan]: deger })
      }),
    }))
  }

  const satirEkle = () => {
    setForm((prev) => ({ ...prev, satirlar: [...prev.satirlar, bosSatir()] }))
  }

  const satirSilLocal = (satirId) => {
    setForm((prev) => ({ ...prev, satirlar: prev.satirlar.filter((s) => s.id !== satirId) }))
  }

  const toplamlar = form.satirlar.reduce(
    (acc, s) => ({
      araToplam: acc.araToplam + (s.araToplam || 0),
      iskontoToplam: acc.iskontoToplam + (s.miktar * s.birimFiyat * (s.iskontoOran / 100) || 0),
      kdvToplam: acc.kdvToplam + (s.kdvTutar || 0),
      genelToplam: acc.genelToplam + (s.satirToplam || 0),
    }),
    { araToplam: 0, iskontoToplam: 0, kdvToplam: 0, genelToplam: 0 }
  )

  const kaydet = async () => {
    if (!form.firmaAdi && !form.faturaNo) {
      toast.error('Firma adı gereklidir.')
      return
    }
    setKaydediliyor(true)
    try {
      const payload = { ...form, ...toplamlar }
      if (yeniMod) {
        const yeni = await satisEkle(payload)
        toast.success('Fatura oluşturuldu.')
        navigate(`/satislar/${yeni.id}`)
      } else {
        await satisGuncelle(id, payload)
        toast.success('Fatura güncellendi.')
        const guncellenmis = await satisGetir(id)
        if (guncellenmis) setForm(guncellenmis)
      }
    } catch (err) {
      toast.error('Hata: ' + (err.message || 'Kaydedilemedi'))
    } finally {
      setKaydediliyor(false)
    }
  }

  const handleGonderildiIsaretle = async () => {
    const payload = { ...form, ...toplamlar, durum: 'gonderildi' }
    setKaydediliyor(true)
    try {
      if (yeniMod) {
        const yeni = await satisEkle(payload)
        await stokDusumYap(form.satirlar, form.faturaNo, form.firmaAdi)
        toast.success('Fatura gönderildi olarak kaydedildi.')
        navigate(`/satislar/${yeni.id}`)
      } else {
        await satisGuncelle(id, payload)
        setForm((prev) => ({ ...prev, durum: 'gonderildi' }))
        await stokDusumYap(form.satirlar, form.faturaNo, form.firmaAdi)
        toast.success('Durum "Gönderildi" olarak güncellendi.')
      }
    } catch (err) {
      toast.error('Hata oluştu.')
    } finally {
      setKaydediliyor(false)
    }
  }

  const handleOdendiIsaretle = async () => {
    const payload = {
      ...form,
      ...toplamlar,
      durum: 'odendi',
      odenenToplam: toplamlar.genelToplam,
    }
    setKaydediliyor(true)
    try {
      await satisGuncelle(id, payload)
      setForm((prev) => ({ ...prev, durum: 'odendi', odenenToplam: toplamlar.genelToplam }))
      toast.success('Fatura "Ödendi" olarak işaretlendi.')
    } catch (err) {
      toast.error('Hata oluştu.')
    } finally {
      setKaydediliyor(false)
    }
  }

  const handleSil = async () => {
    const onay = await confirm({
      baslik: 'Faturayı Sil',
      mesaj: `${form.faturaNo} numaralı fatura kalıcı olarak silinecek. Emin misiniz?`,
      onayMetin: 'Evet, sil',
      iptalMetin: 'Vazgeç',
      tip: 'tehlikeli',
    })
    if (!onay) return
    await satisSil(id)
    toast.success('Fatura silindi.')
    navigate('/satislar')
  }

  const handleTahsilatEkle = async () => {
    if (!tahsilatForm.tutar || Number(tahsilatForm.tutar) <= 0) {
      toast.error('Geçerli bir tutar giriniz.')
      return
    }
    setTahsilatEkleniyor(true)
    try {
      await tahsilatEkle({
        satisId: id,
        tarih: tahsilatForm.tarih,
        tutar: Number(tahsilatForm.tutar),
        odemeYontemi: tahsilatForm.odemeYontemi,
        aciklama: tahsilatForm.aciklama,
      })
      const guncellenmis = await satisGetir(id)
      if (guncellenmis) setForm(guncellenmis)
      setTahsilatForm({
        tarih: new Date().toISOString().split('T')[0],
        tutar: '',
        odemeYontemi: 'banka',
        aciklama: '',
      })
      setTahsilatPanelAcik(false)
      toast.success('Tahsilat eklendi.')
    } catch (err) {
      toast.error('Tahsilat eklenemedi.')
    } finally {
      setTahsilatEkleniyor(false)
    }
  }

  const handleTahsilatSil = async (tahsilatId) => {
    const onay = await confirm({
      baslik: 'Tahsilatı Sil',
      mesaj: 'Bu tahsilat silinecek. Emin misiniz?',
      onayMetin: 'Evet, sil',
      iptalMetin: 'Vazgeç',
      tip: 'tehlikeli',
    })
    if (!onay) return
    await tahsilatSil(tahsilatId, id)
    const guncellenmis = await satisGetir(id)
    if (guncellenmis) setForm(guncellenmis)
    toast.success('Tahsilat silindi.')
  }

  const durum = durumBilgi(form.durum, form.vadeTarihi)
  const kalan = toplamlar.genelToplam - Number(form.odenenToplam || 0)

  const [emailModal, setEmailModal] = useState(false)
  const [emailForm, setEmailForm] = useState({ konu: '', icerik: '' })

  const emailModalAc = () => {
    const pdfUrl = `${window.location.origin}/satislar/${id}/yazdir`
    setEmailForm({
      konu: `Fatura ${form.faturaNo} — ${form.firmaAdi}`,
      icerik: `Sayın ${form.musteriYetkili || form.firmaAdi},\n\nSize ait ${form.faturaNo} numaralı faturamızı iletiyoruz.\n\nFatura Tarihi: ${form.faturaTarihi}\nVade Tarihi: ${form.vadeTarihi || '—'}\nToplam Tutar: ${paraBirimFormat(toplamlar.genelToplam)}\n\nFaturanızı aşağıdaki bağlantıdan görüntüleyebilirsiniz:\n${pdfUrl}\n\nSaygılarımızla.`,
    })
    setEmailModal(true)
  }

  const emailGonder = () => {
    const mailto = `mailto:${form.musteriEmail || ''}?subject=${encodeURIComponent(emailForm.konu)}&body=${encodeURIComponent(emailForm.icerik)}`
    window.open(mailto)
    setEmailModal(false)
    toast.success('Email istemciniz açıldı.')
  }

  if (yukleniyor) {
    return <div style={{ padding: 24 }}><EmptyState title="Yükleniyor…" /></div>
  }

  const musteriAramaHandler = (e) => {
    const q = e.target.value.toLowerCase()
    if (!q) return
    const bulunan = musteriler.find(
      (m) => `${m.ad} ${m.soyad} ${m.firma}`.toLowerCase().includes(q)
    )
    if (bulunan) {
      setForm((p) => ({
        ...p,
        firmaAdi: bulunan.firma || '',
        musteriYetkili: `${bulunan.ad} ${bulunan.soyad}`,
        musteriEmail: bulunan.email || '',
        musteriTelefon: bulunan.telefon || '',
      }))
      e.target.value = ''
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      <button
        onClick={() => navigate('/satislar')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--text-tertiary)',
          font: '500 13px/18px var(--font-sans)',
          marginBottom: 16,
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-primary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
      >
        <ArrowLeft size={14} strokeWidth={1.5} /> Satışlara dön
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 className="t-h1">{yeniMod ? 'Yeni fatura' : form.faturaNo}</h1>
          {!yeniMod && <CodeBadge>{form.faturaNo}</CodeBadge>}
          <Badge tone={durum.tone}>{durum.label}</Badge>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!yeniMod && (
            <Button variant="danger" iconLeft={<Trash2 size={14} strokeWidth={1.5} />} onClick={handleSil}>
              Sil
            </Button>
          )}
          {!yeniMod && (
            <Button
              variant="secondary"
              iconLeft={<Printer size={14} strokeWidth={1.5} />}
              onClick={() => window.open(`/satislar/${id}/yazdir`, '_blank')}
            >
              PDF
            </Button>
          )}
          {!yeniMod && (
            <Button variant="secondary" iconLeft={<Mail size={14} strokeWidth={1.5} />} onClick={emailModalAc}>
              Email gönder
            </Button>
          )}
          {form.durum === 'taslak' && (
            <Button
              variant="secondary"
              iconLeft={<Send size={14} strokeWidth={1.5} />}
              onClick={handleGonderildiIsaretle}
              disabled={kaydediliyor}
            >
              Gönderildi işaretle
            </Button>
          )}
          {form.durum === 'gonderildi' && !yeniMod && (
            <Button
              variant="secondary"
              iconLeft={<CheckCircle2 size={14} strokeWidth={1.5} />}
              onClick={handleOdendiIsaretle}
              disabled={kaydediliyor}
            >
              Ödendi işaretle
            </Button>
          )}
          <Button
            variant="primary"
            iconLeft={<Save size={14} strokeWidth={1.5} />}
            onClick={kaydet}
            disabled={kaydediliyor}
          >
            {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      </div>

      {/* Açıklama */}
      <Card style={{ marginBottom: 16 }}>
        <p className="t-label" style={{ marginBottom: 6 }}>Fatura açıklaması</p>
        <input
          type="text"
          value={form.aciklama}
          onChange={(e) => setForm((p) => ({ ...p, aciklama: e.target.value }))}
          placeholder="Fatura için kısa bir açıklama girin…"
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none', outline: 'none',
            font: '600 16px/24px var(--font-sans)',
            color: 'var(--text-primary)',
          }}
        />
      </Card>

      {/* Müşteri + Fatura */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 16, marginBottom: 16 }}>
        <Card>
          <h2 className="t-h2" style={{ marginBottom: 16 }}>Müşteri bilgileri</h2>

          <div style={{ marginBottom: 12 }}>
            <Label>Kayıtlı müşterilerden seç</Label>
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                strokeWidth={1.5}
                style={{
                  position: 'absolute', left: 10, top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-tertiary)',
                  pointerEvents: 'none',
                }}
              />
              <Input
                placeholder="Müşteri adı veya firma ara…"
                onChange={musteriAramaHandler}
                style={{ paddingLeft: 32 }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <Label>Firma adı</Label>
              <Input
                value={form.firmaAdi}
                onChange={(e) => setForm((p) => ({ ...p, firmaAdi: e.target.value }))}
                placeholder="Firma adını girin…"
              />
            </div>
            <div>
              <Label>Yetkili kişi</Label>
              <Input
                value={form.musteriYetkili}
                onChange={(e) => setForm((p) => ({ ...p, musteriYetkili: e.target.value }))}
                placeholder="Ad Soyad"
              />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input
                value={form.musteriTelefon}
                onChange={(e) => setForm((p) => ({ ...p, musteriTelefon: e.target.value }))}
                placeholder="+90 5xx xxx xx xx"
              />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <Label>E-posta</Label>
              <Input
                type="email"
                value={form.musteriEmail}
                onChange={(e) => setForm((p) => ({ ...p, musteriEmail: e.target.value }))}
                placeholder="ornek@firma.com"
              />
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="t-h2" style={{ marginBottom: 16 }}>Fatura bilgileri</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Label>Fatura no</Label>
              <Input
                value={form.faturaNo}
                onChange={(e) => setForm((p) => ({ ...p, faturaNo: e.target.value }))}
                style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--brand-primary)' }}
              />
            </div>
            <div>
              <Label>Fatura tarihi</Label>
              <Input
                type="date"
                value={form.faturaTarihi}
                onChange={(e) => setForm((p) => ({ ...p, faturaTarihi: e.target.value }))}
              />
            </div>
            <div>
              <Label>Vade tarihi</Label>
              <Input
                type="date"
                value={form.vadeTarihi}
                onChange={(e) => setForm((p) => ({ ...p, vadeTarihi: e.target.value }))}
              />
              <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                {VADE_SECENEKLERI.map((opt) => {
                  const hedef = new Date(form.faturaTarihi || new Date())
                  hedef.setDate(hedef.getDate() + opt.gun)
                  const hedefStr = hedef.toISOString().split('T')[0]
                  const aktif = form.vadeTarihi === hedefStr
                  return (
                    <button
                      key={opt.gun}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, vadeTarihi: hedefStr }))}
                      style={{
                        font: '500 11px/14px var(--font-sans)',
                        padding: '3px 8px',
                        borderRadius: 'var(--radius-pill)',
                        border: `1px solid ${aktif ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                        background: aktif ? 'var(--brand-primary)' : 'var(--surface-card)',
                        color: aktif ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <Label>Para birimi</Label>
              <CustomSelect
                value={form.paraBirimi}
                onChange={(e) => setForm((p) => ({ ...p, paraBirimi: e.target.value }))}
              >
                {PARA_BIRIMLERI.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </CustomSelect>
            </div>
            {form.teklifNo && (
              <div>
                <Label>Bağlı teklif</Label>
                <Badge tone="brand">{form.teklifNo}</Badge>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Ürün satırları */}
      <Card padding={0} style={{ marginBottom: 16, overflow: 'visible' }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-default)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 className="t-h2" style={{ margin: 0 }}>Ürün / hizmet satırları</h2>
          <Button variant="secondary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={satirEkle}>
            Satır ekle
          </Button>
        </div>

        {form.satirlar.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<Inbox size={22} strokeWidth={1.5} />}
              title="Henüz satır eklenmedi"
              description={'"Satır ekle" butonuyla ilk satırı oluşturun.'}
            />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '32px 1.6fr 140px 80px 90px 100px 70px 80px 110px 36px',
                gap: 8,
                padding: '10px 16px',
                borderBottom: '1px solid var(--border-default)',
                background: 'var(--surface-sunken)',
                font: '600 11px/14px var(--font-sans)',
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <div>#</div>
              <div>Ürün / hizmet</div>
              <div>Açıklama</div>
              <div style={{ textAlign: 'center' }}>Miktar</div>
              <div style={{ textAlign: 'center' }}>Birim</div>
              <div style={{ textAlign: 'right' }}>B. fiyat</div>
              <div style={{ textAlign: 'right' }}>İsk%</div>
              <div style={{ textAlign: 'center' }}>KDV%</div>
              <div style={{ textAlign: 'right' }}>Toplam</div>
              <div></div>
            </div>

            {form.satirlar.map((satir, idx) => (
              <div
                key={satir.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px 1.6fr 140px 80px 90px 100px 70px 80px 110px 36px',
                  gap: 8,
                  alignItems: 'center',
                  padding: '8px 16px',
                  borderBottom: '1px solid var(--border-default)',
                  position: 'relative',
                }}
              >
                <div className="tabular-nums" style={{
                  font: '500 12px/16px var(--font-sans)',
                  color: 'var(--text-tertiary)',
                }}>
                  {idx + 1}
                </div>

                <div style={{ position: 'relative' }}>
                  <Input
                    value={stokArama[satir.id] !== undefined ? stokArama[satir.id] : satir.urunAdi}
                    onChange={(e) => {
                      setStokArama((prev) => ({ ...prev, [satir.id]: e.target.value }))
                      setStokOneri((prev) => ({ ...prev, [satir.id]: true }))
                      satirGuncelle(satir.id, 'urunAdi', e.target.value)
                    }}
                    onFocus={() => setStokOneri((prev) => ({ ...prev, [satir.id]: true }))}
                    onBlur={() => setTimeout(() => setStokOneri((prev) => ({ ...prev, [satir.id]: false })), 200)}
                    placeholder="Ürün ara veya seç…"
                  />
                  {satir.stokKodu && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      marginTop: 2,
                      font: '500 10px/14px var(--font-mono)',
                      color: 'var(--text-tertiary)',
                    }}>
                      <Package size={10} strokeWidth={1.5} /> {satir.stokKodu}
                    </div>
                  )}
                  {stokOneri[satir.id] && (() => {
                    const q = (stokArama[satir.id] ?? satir.urunAdi ?? '').toLowerCase()
                    const sonuclar = stoklar
                      .filter((s) =>
                        q.length === 0 ||
                        (s.stokAdi || '').toLowerCase().includes(q) ||
                        (s.stokKodu || '').toLowerCase().includes(q)
                      )
                      .slice(0, 10)
                    if (sonuclar.length === 0) return null
                    return (
                      <div style={{
                        position: 'absolute',
                        left: 0, right: 0,
                        top: 'calc(100% + 4px)',
                        maxHeight: 240,
                        overflowY: 'auto',
                        background: 'var(--surface-card)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: 'var(--shadow-lg)',
                        zIndex: 9999,
                      }}>
                        {sonuclar.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onMouseDown={() => {
                              satirGuncelle(satir.id, 'urunAdi', s.stokAdi)
                              satirGuncelle(satir.id, 'stokKodu', s.stokKodu || '')
                              satirGuncelle(satir.id, 'birimFiyat', s.birimFiyat || 0)
                              satirGuncelle(satir.id, 'birim', s.birim || 'Adet')
                              setStokArama((prev) => ({ ...prev, [satir.id]: undefined }))
                              setStokOneri((prev) => ({ ...prev, [satir.id]: false }))
                            }}
                            style={{
                              width: '100%', textAlign: 'left',
                              padding: '10px 12px',
                              background: 'transparent', border: 'none',
                              borderBottom: '1px solid var(--border-default)',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--brand-primary-soft)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                                  {s.stokAdi}
                                </div>
                                <div className="t-caption">{s.stokKodu} · {s.birim}</div>
                              </div>
                              <span className="tabular-nums" style={{
                                font: '600 13px/18px var(--font-sans)',
                                color: 'var(--brand-primary)', flexShrink: 0,
                              }}>
                                {(s.birimFiyat || 0).toLocaleString('tr-TR')} ₺
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                <Input
                  value={satir.aciklama}
                  onChange={(e) => satirGuncelle(satir.id, 'aciklama', e.target.value)}
                  placeholder="Açıklama"
                />

                <Input
                  type="number"
                  value={satir.miktar}
                  onChange={(e) => satirGuncelle(satir.id, 'miktar', parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.001"
                  style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
                />

                <CustomSelect
                  value={satir.birim}
                  onChange={(e) => satirGuncelle(satir.id, 'birim', e.target.value)}
                >
                  {BIRIM_SECENEKLERI.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                </CustomSelect>

                <Input
                  type="number"
                  value={satir.birimFiyat}
                  onChange={(e) => satirGuncelle(satir.id, 'birimFiyat', parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                  style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                />

                <Input
                  type="number"
                  value={satir.iskontoOran}
                  onChange={(e) => satirGuncelle(satir.id, 'iskontoOran', parseFloat(e.target.value) || 0)}
                  min="0"
                  max="100"
                  step="0.01"
                  style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                />

                <CustomSelect
                  value={satir.kdvOran}
                  onChange={(e) => satirGuncelle(satir.id, 'kdvOran', parseFloat(e.target.value))}
                >
                  {KDV_SECENEKLERI.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </CustomSelect>

                <div className="tabular-nums" style={{
                  textAlign: 'right',
                  font: '600 13px/18px var(--font-sans)',
                  color: 'var(--text-primary)',
                }}>
                  {paraBirimFormat(satir.satirToplam)}
                </div>

                <button
                  aria-label="Satırı sil"
                  onClick={() => satirSilLocal(satir.id)}
                  style={iconBtnStyle}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  <Trash2 size={12} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Notlar + Özet */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
        <Card>
          <h2 className="t-h2" style={{ marginBottom: 12 }}>Notlar</h2>
          <Textarea
            value={form.notlar}
            onChange={(e) => setForm((p) => ({ ...p, notlar: e.target.value }))}
            placeholder="Fatura notları…"
            rows={5}
          />
        </Card>

        <Card>
          <h2 className="t-h2" style={{ marginBottom: 16 }}>Özet</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="t-caption">Ara toplam</span>
              <span className="tabular-nums" style={{ font: '500 13px/18px var(--font-sans)' }}>
                {paraBirimFormat(toplamlar.araToplam)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="t-caption">İskonto</span>
              <span className="tabular-nums" style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--warning)' }}>
                −{paraBirimFormat(toplamlar.iskontoToplam)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="t-caption">KDV</span>
              <span className="tabular-nums" style={{ font: '500 13px/18px var(--font-sans)' }}>
                {paraBirimFormat(toplamlar.kdvToplam)}
              </span>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '12px 0 0',
              marginTop: 6,
              borderTop: '1px solid var(--border-default)',
            }}>
              <span className="t-body-strong">Genel toplam</span>
              <span className="tabular-nums" style={{
                font: '600 16px/24px var(--font-sans)',
                color: 'var(--brand-primary)',
              }}>
                {paraBirimFormat(toplamlar.genelToplam)}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Tahsilatlar */}
      {!yeniMod && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 className="t-h2" style={{ margin: 0 }}>Tahsilatlar</h2>
            <Button
              variant="secondary"
              iconLeft={<Plus size={14} strokeWidth={1.5} />}
              onClick={() => setTahsilatPanelAcik(!tahsilatPanelAcik)}
            >
              Tahsilat al
            </Button>
          </div>

          {tahsilatPanelAcik && (
            <div style={{
              marginBottom: 16,
              padding: 16,
              background: 'var(--success-soft)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 12, marginBottom: 12,
              }}>
                <div>
                  <Label>Tarih</Label>
                  <Input
                    type="date"
                    value={tahsilatForm.tarih}
                    onChange={(e) => setTahsilatForm((p) => ({ ...p, tarih: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Tutar</Label>
                  <Input
                    type="number"
                    value={tahsilatForm.tutar}
                    onChange={(e) => setTahsilatForm((p) => ({ ...p, tutar: e.target.value }))}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <Label>Ödeme yöntemi</Label>
                  <CustomSelect
                    value={tahsilatForm.odemeYontemi}
                    onChange={(e) => setTahsilatForm((p) => ({ ...p, odemeYontemi: e.target.value }))}
                  >
                    {ODEME_YONTEMLERI.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </CustomSelect>
                </div>
                <div>
                  <Label>Açıklama</Label>
                  <Input
                    value={tahsilatForm.aciklama}
                    onChange={(e) => setTahsilatForm((p) => ({ ...p, aciklama: e.target.value }))}
                    placeholder="İsteğe bağlı…"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" onClick={handleTahsilatEkle} disabled={tahsilatEkleniyor}>
                  {tahsilatEkleniyor ? 'Ekleniyor…' : 'Ekle'}
                </Button>
                <Button variant="secondary" onClick={() => setTahsilatPanelAcik(false)}>
                  İptal
                </Button>
              </div>
            </div>
          )}

          {(form.tahsilatlar || []).length === 0 ? (
            <EmptyState title="Henüz tahsilat girilmedi" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Tarih</TH>
                  <TH align="right">Tutar</TH>
                  <TH>Yöntem</TH>
                  <TH>Açıklama</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {(form.tahsilatlar || []).map((t) => (
                  <TR key={t.id}>
                    <TD><span className="tabular-nums">{tarihFormat(t.tarih)}</span></TD>
                    <TD align="right">
                      <span className="tabular-nums" style={{
                        font: '600 13px/18px var(--font-sans)',
                        color: 'var(--success)',
                      }}>
                        {paraBirimFormat(t.tutar)}
                      </span>
                    </TD>
                    <TD>{ODEME_YONTEMLERI.find((o) => o.value === t.odemeYontemi)?.label || t.odemeYontemi}</TD>
                    <TD>{t.aciklama || '—'}</TD>
                    <TD align="right">
                      <button
                        aria-label="Tahsilatı sil"
                        onClick={() => handleTahsilatSil(t.id)}
                        style={iconBtnStyle}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                      >
                        <Trash2 size={12} strokeWidth={1.5} />
                      </button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}

          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 24,
            marginTop: 16, paddingTop: 12,
            borderTop: '1px solid var(--border-default)',
          }}>
            <span className="t-caption">
              Ödenen: <span className="tabular-nums" style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--success)' }}>
                {paraBirimFormat(form.odenenToplam)}
              </span>
            </span>
            <span className="t-caption">
              Kalan: <span className="tabular-nums" style={{
                font: '600 13px/18px var(--font-sans)',
                color: kalan > 0 ? 'var(--warning)' : 'var(--success)',
              }}>
                {paraBirimFormat(kalan)}
              </span>
            </span>
          </div>
        </Card>
      )}

      {/* Email Modal */}
      <Modal
        open={emailModal}
        onClose={() => setEmailModal(false)}
        title={`Fatura email — ${form.faturaNo}`}
        width={560}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEmailModal(false)}>İptal</Button>
            <Button variant="primary" iconLeft={<Mail size={14} strokeWidth={1.5} />} onClick={emailGonder}>
              Email istemcisini aç
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <Label>Alıcı email</Label>
            <Input
              type="email"
              value={form.musteriEmail || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, musteriEmail: e.target.value }))}
              placeholder="musteri@email.com"
            />
            {!form.musteriEmail && (
              <p className="t-caption" style={{ marginTop: 4, color: 'var(--warning)' }}>
                Müşteri e-posta adresi girilmemiş.
              </p>
            )}
          </div>

          <div>
            <Label>Konu</Label>
            <Input
              value={emailForm.konu}
              onChange={(e) => setEmailForm((prev) => ({ ...prev, konu: e.target.value }))}
            />
          </div>

          <div>
            <Label>İçerik</Label>
            <Textarea
              value={emailForm.icerik}
              onChange={(e) => setEmailForm((prev) => ({ ...prev, icerik: e.target.value }))}
              rows={8}
            />
          </div>

          <div style={{
            padding: 12,
            background: 'var(--brand-primary-soft)',
            borderRadius: 'var(--radius-md)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div className="t-caption" style={{ color: 'var(--brand-primary)' }}>Fatura tutarı</div>
              <div className="tabular-nums" style={{
                font: '600 16px/24px var(--font-sans)',
                color: 'var(--brand-primary)',
              }}>
                {paraBirimFormat(toplamlar.genelToplam)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="t-caption" style={{ color: 'var(--brand-primary)' }}>Vade</div>
              <div className="tabular-nums" style={{
                font: '600 13px/18px var(--font-sans)',
                color: 'var(--brand-primary)',
              }}>
                {form.vadeTarihi || '—'}
              </div>
            </div>
          </div>

          <Button
            variant="secondary"
            iconLeft={<LinkIcon size={14} strokeWidth={1.5} />}
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/satislar/${id}/yazdir`)
              toast.success('PDF bağlantısı kopyalandı.')
            }}
          >
            PDF bağlantısını kopyala
          </Button>
        </div>
      </Modal>
    </div>
  )
}

const iconBtnStyle = {
  width: 28, height: 28,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
}

export default SatisDetay
