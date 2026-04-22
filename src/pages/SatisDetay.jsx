import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  satisGetir,
  satisEkle,
  satisGuncelle,
  satisSil,
  tahsilatEkle,
  tahsilatSil,
  yeniFaturaNo,
  stokDusumYap,
} from '../services/satisService'
import { musterileriGetir } from '../services/musteriService'
import { stokUrunleriniGetir } from '../services/stokService'
import { useConfirm } from '../context/ConfirmContext'
import { useToast } from '../context/ToastContext'
import CustomSelect from '../components/CustomSelect'

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

const durumBadgeStyle = (durum, vadeTarihi) => {
  const bugun = new Date()
  bugun.setHours(0, 0, 0, 0)
  const gosterim =
    durum === 'gonderildi' && vadeTarihi && new Date(vadeTarihi) < bugun ? 'gecikti' : durum
  const map = {
    taslak: { label: 'Taslak', bg: 'rgba(107,114,128,0.12)', color: '#6b7280' },
    gonderildi: { label: 'Gönderildi', bg: 'rgba(1,118,211,0.1)', color: 'var(--primary)' },
    odendi: { label: 'Ödendi', bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
    gecikti: { label: 'Gecikti', bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
    iptal: { label: 'İptal', bg: 'rgba(156,163,175,0.15)', color: '#9ca3af' },
  }
  return map[gosterim] || map['taslak']
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
  const [stokArama, setStokArama] = useState({}) // satirId → arama metni
  const [stokOneri, setStokOneri] = useState({}) // satirId → göster/gizle

  // Tahsilat formu
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
      // Teklif'ten gelen ön doldurma
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
          // Supabase null kolonları için güvenli default'lar
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
        const guncellenmis = { ...s, [alan]: deger }
        return satirHesapla(guncellenmis)
      }),
    }))
  }

  const satirEkle = () => {
    setForm((prev) => ({
      ...prev,
      satirlar: [...prev.satirlar, bosSatir()],
    }))
  }

  const satirSilLocal = (satirId) => {
    setForm((prev) => ({
      ...prev,
      satirlar: prev.satirlar.filter((s) => s.id !== satirId),
    }))
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
      const payload = {
        ...form,
        ...toplamlar,
      }
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
        // Stok düşümü
        await stokDusumYap(form.satirlar, form.faturaNo, form.firmaAdi)
        toast.success('Fatura gönderildi olarak kaydedildi.')
        navigate(`/satislar/${yeni.id}`)
      } else {
        await satisGuncelle(id, payload)
        setForm((prev) => ({ ...prev, durum: 'gonderildi' }))
        // Stok düşümü
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
      setForm((prev) => ({
        ...prev,
        durum: 'odendi',
        odenenToplam: toplamlar.genelToplam,
      }))
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
      onayMetin: 'Evet, Sil',
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
      onayMetin: 'Evet, Sil',
      iptalMetin: 'Vazgeç',
      tip: 'tehlikeli',
    })
    if (!onay) return
    await tahsilatSil(tahsilatId, id)
    const guncellenmis = await satisGetir(id)
    if (guncellenmis) setForm(guncellenmis)
    toast.success('Tahsilat silindi.')
  }

  const badge = durumBadgeStyle(form.durum, form.vadeTarihi)
  const kalan = toplamlar.genelToplam - Number(form.odenenToplam || 0)

  // Email modal
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

  const inputStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: '10px',
    padding: '8px 12px',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
  }

  const labelStyle = {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    marginBottom: '4px',
    display: 'block',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }

  const cardStyle = {
    background: 'var(--bg-card)',
    border: '1px solid rgba(1,118,211,0.1)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    borderRadius: '16px',
    padding: '20px',
    marginBottom: '16px',
  }

  if (yukleniyor) {
    return (
      <div className="p-6 flex items-center justify-center" style={{ minHeight: '200px' }}>
        <p style={{ color: 'var(--text-muted)' }}>Yükleniyor...</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/satislar')}
            className="flex items-center gap-1 text-sm transition-opacity hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
          >
            ← Geri
          </button>
          <span style={{ color: 'var(--border)' }}>|</span>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            {yeniMod ? 'Yeni Fatura' : form.faturaNo}
          </h2>
          {!yeniMod && (
            <span
              className="text-xs font-medium px-2.5 py-1 rounded-full"
              style={{ background: badge.bg, color: badge.color }}
            >
              {badge.label}
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {!yeniMod && (
            <button
              onClick={handleSil}
              className="px-3 py-2 rounded-xl text-sm transition"
              style={{
                color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.25)',
                background: 'transparent',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.06)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              🗑 Sil
            </button>
          )}
          {!yeniMod && (
            <button
              onClick={() => window.open(`/satislar/${id}/yazdir`, '_blank')}
              className="px-3 py-2 rounded-xl text-sm transition"
              style={{ border: '1px solid rgba(1,118,211,0.3)', color: 'var(--primary)', background: 'transparent' }}
            >
              🖨 PDF
            </button>
          )}
          {!yeniMod && (
            <button
              onClick={emailModalAc}
              className="px-3 py-2 rounded-xl text-sm transition flex items-center gap-1.5 font-medium"
              style={{ border: '1px solid rgba(99,102,241,0.3)', color: '#6366f1', background: 'rgba(99,102,241,0.05)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.05)')}
            >
              ✉️ Email Gönder
            </button>
          )}
          <button
            onClick={kaydet}
            disabled={kaydediliyor}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white transition"
            style={{ background: 'var(--primary)', opacity: kaydediliyor ? 0.7 : 1 }}
          >
            {kaydediliyor ? 'Kaydediliyor...' : '💾 Kaydet'}
          </button>
          {form.durum === 'taslak' && (
            <button
              onClick={handleGonderildiIsaretle}
              disabled={kaydediliyor}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white transition"
              style={{ background: '#0176D3' }}
            >
              📤 Gönderildi İşaretle
            </button>
          )}
          {form.durum === 'gonderildi' && !yeniMod && (
            <button
              onClick={handleOdendiIsaretle}
              disabled={kaydediliyor}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white transition"
              style={{ background: '#10b981' }}
            >
              ✅ Ödendi İşaretle
            </button>
          )}
        </div>
      </div>

      {/* Fatura Açıklaması — Paraşüt stili prominent input */}
      <div
        className="rounded-2xl mb-4 flex items-center gap-4"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid rgba(1,118,211,0.1)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          padding: '16px 20px',
        }}
      >
        <div style={{ fontSize: '28px', color: 'var(--text-muted)', flexShrink: 0 }}>📄</div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
            FATURA AÇIKLAMASI
          </p>
          <input
            type="text"
            value={form.aciklama}
            onChange={(e) => setForm((p) => ({ ...p, aciklama: e.target.value }))}
            placeholder="Fatura için kısa bir açıklama girin..."
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              width: '100%',
            }}
          />
        </div>
      </div>

      {/* Üst bölüm: Müşteri + Fatura Bilgileri */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Müşteri Bilgileri */}
        <div className="lg:col-span-2" style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Müşteri Bilgileri
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 mb-2">
              <label style={labelStyle}>Müşteri Seç (kayıtlılardan)</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Müşteri adı veya firma ara..."
                  onChange={(e) => {
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
                  }}
                  style={{ ...inputStyle, paddingLeft: '36px' }}
                />
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px' }}>🔍</span>
              </div>
            </div>
            <div className="md:col-span-2">
              <label style={labelStyle}>Firma Adı</label>
              <input
                type="text"
                value={form.firmaAdi}
                onChange={(e) => setForm((p) => ({ ...p, firmaAdi: e.target.value }))}
                placeholder="Firma adını girin..."
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Yetkili Kişi</label>
              <input
                type="text"
                value={form.musteriYetkili}
                onChange={(e) => setForm((p) => ({ ...p, musteriYetkili: e.target.value }))}
                placeholder="Ad Soyad"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Telefon</label>
              <input
                type="text"
                value={form.musteriTelefon}
                onChange={(e) => setForm((p) => ({ ...p, musteriTelefon: e.target.value }))}
                placeholder="+90 5xx xxx xx xx"
                style={inputStyle}
              />
            </div>
            <div className="md:col-span-2">
              <label style={labelStyle}>E-Posta</label>
              <input
                type="email"
                value={form.musteriEmail}
                onChange={(e) => setForm((p) => ({ ...p, musteriEmail: e.target.value }))}
                placeholder="ornek@firma.com"
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Fatura Bilgileri */}
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Fatura Bilgileri
          </h3>
          <div className="space-y-3">
            <div>
              <label style={labelStyle}>Fatura No</label>
              <input
                type="text"
                value={form.faturaNo}
                onChange={(e) => setForm((p) => ({ ...p, faturaNo: e.target.value }))}
                style={{ ...inputStyle, fontWeight: '700', color: 'var(--primary)' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Fatura Tarihi</label>
              <input
                type="date"
                value={form.faturaTarihi}
                onChange={(e) => setForm((p) => ({ ...p, faturaTarihi: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Vade Tarihi</label>
              <input
                type="date"
                value={form.vadeTarihi}
                onChange={(e) => setForm((p) => ({ ...p, vadeTarihi: e.target.value }))}
                style={inputStyle}
              />
              {/* Vade hızlı seçim */}
              <div className="flex gap-1 flex-wrap mt-1">
                {[
                  { label: 'Aynı Gün', gun: 0 },
                  { label: '7 Gün', gun: 7 },
                  { label: '14 Gün', gun: 14 },
                  { label: '30 Gün', gun: 30 },
                  { label: '60 Gün', gun: 60 },
                ].map((opt) => {
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
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: aktif ? '1px solid var(--primary)' : '1px solid var(--border)',
                        background: aktif ? 'var(--primary)' : 'transparent',
                        color: aktif ? '#fff' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontWeight: aktif ? 600 : 400,
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Para Birimi</label>
              <CustomSelect
                value={form.paraBirimi}
                onChange={(e) => setForm((p) => ({ ...p, paraBirimi: e.target.value }))}
                style={inputStyle}
              >
                {PARA_BIRIMLERI.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </CustomSelect>
            </div>
            {form.teklifNo && (
              <div>
                <label style={labelStyle}>Bağlı Teklif</label>
                <p className="text-sm font-medium" style={{ color: 'var(--primary)' }}>
                  {form.teklifNo}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ürün/Hizmet Satırları */}
      <div
        className="rounded-2xl mb-4"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid rgba(1,118,211,0.1)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          overflow: 'visible',
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Ürün / Hizmet Satırları
          </h3>
        </div>

        {/* Tablo başlığı */}
        <div
          className="grid text-xs font-semibold uppercase px-4 py-2"
          style={{
            gridTemplateColumns: '32px 1fr 140px 80px 90px 100px 70px 80px 110px 36px',
            color: 'var(--text-muted)',
            background: 'var(--bg-hover)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div>#</div>
          <div>Ürün / Hizmet</div>
          <div>Açıklama</div>
          <div className="text-center">Miktar</div>
          <div className="text-center">Birim</div>
          <div className="text-right">B. Fiyat</div>
          <div className="text-right">İsk%</div>
          <div className="text-center">KDV%</div>
          <div className="text-right">Toplam</div>
          <div></div>
        </div>

        {/* Satırlar */}
        <AnimatePresence>
          {form.satirlar.map((satir, idx) => (
            <motion.div
              key={satir.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid items-center px-4 py-2 gap-2"
              style={{ position: 'relative', overflow: 'visible' }}
              style={{
                gridTemplateColumns: '32px 1fr 140px 80px 90px 100px 70px 80px 110px 36px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                {idx + 1}
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={stokArama[satir.id] !== undefined ? stokArama[satir.id] : satir.urunAdi}
                  onChange={(e) => {
                    setStokArama((prev) => ({ ...prev, [satir.id]: e.target.value }))
                    setStokOneri((prev) => ({ ...prev, [satir.id]: true }))
                    satirGuncelle(satir.id, 'urunAdi', e.target.value)
                  }}
                  onFocus={() => setStokOneri((prev) => ({ ...prev, [satir.id]: true }))}
                  onBlur={() => setTimeout(() => setStokOneri((prev) => ({ ...prev, [satir.id]: false })), 200)}
                  placeholder="Ürün ara veya seç..."
                  style={{ ...inputStyle, padding: '6px 8px', fontSize: '13px' }}
                />
                {satir.stokKodu && (
                  <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    📦 {satir.stokKodu}
                  </p>
                )}
                {/* Stok öneriler dropdown */}
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
                    <div
                      className="absolute left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-y-auto"
                      style={{ top: 'calc(100% + 4px)', maxHeight: '240px', zIndex: 9999 }}
                    >
                      {sonuclar.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition border-b border-gray-50 last:border-0"
                          onMouseDown={() => {
                            satirGuncelle(satir.id, 'urunAdi', s.stokAdi)
                            satirGuncelle(satir.id, 'stokKodu', s.stokKodu || '')
                            satirGuncelle(satir.id, 'birimFiyat', s.birimFiyat || 0)
                            satirGuncelle(satir.id, 'birim', s.birim || 'Adet')
                            setStokArama((prev) => ({ ...prev, [satir.id]: undefined }))
                            setStokOneri((prev) => ({ ...prev, [satir.id]: false }))
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-gray-800">{s.stokAdi}</p>
                              <p className="text-xs text-gray-400">{s.stokKodu} · {s.birim}</p>
                            </div>
                            <p className="text-sm font-semibold text-blue-600 flex-shrink-0">
                              {(s.birimFiyat || 0).toLocaleString('tr-TR')} ₺
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )
                })()}
              </div>
              <div>
                <input
                  type="text"
                  value={satir.aciklama}
                  onChange={(e) => satirGuncelle(satir.id, 'aciklama', e.target.value)}
                  placeholder="Açıklama"
                  style={{ ...inputStyle, padding: '6px 8px', fontSize: '13px' }}
                />
              </div>
              <div>
                <input
                  type="number"
                  value={satir.miktar}
                  onChange={(e) => satirGuncelle(satir.id, 'miktar', parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.001"
                  style={{ ...inputStyle, padding: '6px 8px', fontSize: '13px', textAlign: 'center' }}
                />
              </div>
              <div>
                <CustomSelect
                  value={satir.birim}
                  onChange={(e) => satirGuncelle(satir.id, 'birim', e.target.value)}
                  style={{ ...inputStyle, padding: '6px 8px', fontSize: '13px' }}
                >
                  {BIRIM_SECENEKLERI.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </CustomSelect>
              </div>
              <div>
                <input
                  type="number"
                  value={satir.birimFiyat}
                  onChange={(e) => satirGuncelle(satir.id, 'birimFiyat', parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                  style={{ ...inputStyle, padding: '6px 8px', fontSize: '13px', textAlign: 'right' }}
                />
              </div>
              <div>
                <input
                  type="number"
                  value={satir.iskontoOran}
                  onChange={(e) => satirGuncelle(satir.id, 'iskontoOran', parseFloat(e.target.value) || 0)}
                  min="0"
                  max="100"
                  step="0.01"
                  style={{ ...inputStyle, padding: '6px 8px', fontSize: '13px', textAlign: 'right' }}
                />
              </div>
              <div>
                <CustomSelect
                  value={satir.kdvOran}
                  onChange={(e) => satirGuncelle(satir.id, 'kdvOran', parseFloat(e.target.value))}
                  style={{ ...inputStyle, padding: '6px 8px', fontSize: '13px' }}
                >
                  {KDV_SECENEKLERI.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </CustomSelect>
              </div>
              <div className="text-right text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {paraBirimFormat(satir.satirToplam)}
              </div>
              <div>
                <button
                  onClick={() => satirSilLocal(satir.id)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition"
                  style={{ color: '#ef4444' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  🗑
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Satır ekle */}
        <div className="px-4 py-3">
          <button
            onClick={satirEkle}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl transition"
            style={{
              color: 'var(--primary)',
              border: '1px dashed rgba(1,118,211,0.3)',
              background: 'transparent',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(1,118,211,0.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            + Satır Ekle
          </button>
        </div>
      </div>

      {/* Notlar + Özet */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Notlar */}
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Notlar
          </h3>
          <textarea
            value={form.notlar}
            onChange={(e) => setForm((p) => ({ ...p, notlar: e.target.value }))}
            placeholder="Fatura notları..."
            rows={5}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        {/* Özet */}
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Özet
          </h3>
          <div className="space-y-2">
            {[
              { label: 'Ara Toplam', value: paraBirimFormat(toplamlar.araToplam), muted: true },
              { label: 'İskonto', value: `- ${paraBirimFormat(toplamlar.iskontoToplam)}`, muted: true, color: '#f59e0b' },
              { label: 'KDV', value: paraBirimFormat(toplamlar.kdvToplam), muted: true },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center py-1">
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                <span className="text-sm font-medium" style={{ color: row.color || 'var(--text-secondary)' }}>
                  {row.value}
                </span>
              </div>
            ))}
            <div
              className="flex justify-between items-center py-3 mt-2"
              style={{ borderTop: '2px solid var(--border)' }}
            >
              <span className="font-bold" style={{ color: 'var(--text-primary)' }}>GENEL TOPLAM</span>
              <span className="text-lg font-bold" style={{ color: 'var(--primary)' }}>
                {paraBirimFormat(toplamlar.genelToplam)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tahsilatlar (sadece kayıtlı fatura) */}
      {!yeniMod && (
        <div style={cardStyle}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Tahsilatlar
            </h3>
            <button
              onClick={() => setTahsilatPanelAcik(!tahsilatPanelAcik)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium text-white transition"
              style={{ background: '#10b981' }}
            >
              + Tahsilat Al
            </button>
          </div>

          {/* Tahsilat ekleme formu */}
          <AnimatePresence>
            {tahsilatPanelAcik && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 rounded-xl p-4"
                style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)' }}
              >
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <div>
                    <label style={labelStyle}>Tarih</label>
                    <input
                      type="date"
                      value={tahsilatForm.tarih}
                      onChange={(e) => setTahsilatForm((p) => ({ ...p, tarih: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Tutar</label>
                    <input
                      type="number"
                      value={tahsilatForm.tutar}
                      onChange={(e) => setTahsilatForm((p) => ({ ...p, tutar: e.target.value }))}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Ödeme Yöntemi</label>
                    <CustomSelect
                      value={tahsilatForm.odemeYontemi}
                      onChange={(e) => setTahsilatForm((p) => ({ ...p, odemeYontemi: e.target.value }))}
                      style={inputStyle}
                    >
                      {ODEME_YONTEMLERI.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </CustomSelect>
                  </div>
                  <div>
                    <label style={labelStyle}>Açıklama</label>
                    <input
                      type="text"
                      value={tahsilatForm.aciklama}
                      onChange={(e) => setTahsilatForm((p) => ({ ...p, aciklama: e.target.value }))}
                      placeholder="İsteğe bağlı..."
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleTahsilatEkle}
                    disabled={tahsilatEkleniyor}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-white"
                    style={{ background: '#10b981', opacity: tahsilatEkleniyor ? 0.7 : 1 }}
                  >
                    {tahsilatEkleniyor ? 'Ekleniyor...' : 'Ekle'}
                  </button>
                  <button
                    onClick={() => setTahsilatPanelAcik(false)}
                    className="px-4 py-2 rounded-xl text-sm"
                    style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                  >
                    İptal
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tahsilat listesi */}
          {(form.tahsilatlar || []).length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>
              Henüz tahsilat girilmedi
            </p>
          ) : (
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: '1px solid var(--border)' }}
            >
              <div
                className="grid text-xs font-semibold uppercase px-4 py-2"
                style={{
                  gridTemplateColumns: '110px 120px 130px 1fr 36px',
                  color: 'var(--text-muted)',
                  background: 'var(--bg-hover)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div>Tarih</div>
                <div className="text-right">Tutar</div>
                <div>Yöntem</div>
                <div>Açıklama</div>
                <div></div>
              </div>
              {(form.tahsilatlar || []).map((t) => (
                <div
                  key={t.id}
                  className="grid items-center px-4 py-3 text-sm"
                  style={{
                    gridTemplateColumns: '110px 120px 130px 1fr 36px',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div style={{ color: 'var(--text-secondary)' }}>{tarihFormat(t.tarih)}</div>
                  <div className="text-right font-semibold" style={{ color: '#10b981' }}>
                    {paraBirimFormat(t.tutar)}
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {ODEME_YONTEMLERI.find((o) => o.value === t.odemeYontemi)?.label || t.odemeYontemi}
                  </div>
                  <div style={{ color: 'var(--text-muted)' }}>{t.aciklama || '—'}</div>
                  <div>
                    <button
                      onClick={() => handleTahsilatSil(t.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg transition"
                      style={{ color: '#ef4444' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Özet alt kısım */}
          <div className="flex items-center justify-end gap-6 mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Ödenen: <strong style={{ color: '#10b981' }}>{paraBirimFormat(form.odenenToplam)}</strong>
            </span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Kalan: <strong style={{ color: kalan > 0 ? '#f59e0b' : '#10b981' }}>{paraBirimFormat(kalan)}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Email Modal */}
      {emailModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setEmailModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal başlık */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">✉️</span>
                <div>
                  <h3 className="font-semibold text-gray-800">Fatura Email Gönder</h3>
                  <p className="text-xs text-gray-400">{form.faturaNo} — {form.firmaAdi}</p>
                </div>
              </div>
              <button onClick={() => setEmailModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="p-6 space-y-4">
              {/* Alıcı */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Alıcı Email</label>
                <input
                  type="email"
                  value={form.musteriEmail || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, musteriEmail: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="musteri@email.com"
                />
                {!form.musteriEmail && (
                  <p className="text-xs text-amber-500 mt-1">⚠️ Müşteri emaili girilmemiş</p>
                )}
              </div>

              {/* Konu */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Konu</label>
                <input
                  type="text"
                  value={emailForm.konu}
                  onChange={(e) => setEmailForm((prev) => ({ ...prev, konu: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              {/* İçerik */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">İçerik</label>
                <textarea
                  value={emailForm.icerik}
                  onChange={(e) => setEmailForm((prev) => ({ ...prev, icerik: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  rows={8}
                />
              </div>

              {/* Özet bilgi */}
              <div className="bg-indigo-50 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-indigo-500 font-medium">Fatura Tutarı</p>
                  <p className="text-lg font-bold text-indigo-700">{paraBirimFormat(toplamlar.genelToplam)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-indigo-500 font-medium">Vade</p>
                  <p className="text-sm font-semibold text-indigo-700">{form.vadeTarihi || '—'}</p>
                </div>
              </div>

              {/* PDF kopyala */}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/satislar/${id}/yazdir`)
                  toast.success('PDF bağlantısı kopyalandı.')
                }}
                className="w-full py-2 rounded-lg border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition flex items-center justify-center gap-2"
              >
                📎 PDF Bağlantısını Kopyala
              </button>
            </div>

            {/* Butonlar */}
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setEmailModal(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
              >
                İptal
              </button>
              <button
                onClick={emailGonder}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition flex items-center justify-center gap-2"
                style={{ background: '#6366f1' }}
              >
                ✉️ Email İstemcisini Aç
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SatisDetay
