import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, Printer, FileText, Bell, RefreshCw,
  CheckCircle2, Receipt, Inbox,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useDovizKuru } from '../hooks/useDovizKuru'
import { useHatirlatma } from '../context/HatirlatmaContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import {
  teklifleriGetir, teklifGetir, teklifEkle, teklifGuncelle,
} from '../services/teklifService'
import { satislariGetir } from '../services/satisService'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { musterileriGetir } from '../services/musteriService'
import { stokUrunleriniGetir } from '../services/stokService'
import CustomSelect from '../components/CustomSelect'
import {
  Button, Input, Textarea, Label, Card, Badge, CodeBadge,
  Alert, EmptyState, Table, THead, TBody, TR, TH, TD, SegmentedControl, Modal,
} from '../components/ui'

const onayDurumlari = [
  { id: 'takipte',    isim: 'Takipte',      tone: 'lead' },
  { id: 'kabul',      isim: 'Kabul',        tone: 'aktif' },
  { id: 'revizyon',   isim: 'Revizyon',     tone: 'beklemede' },
  { id: 'vazgecildi', isim: 'Vazgeçildi',   tone: 'kayip' },
]

const paraBirimleri = [
  { id: 'TL', sembol: '₺' },
  { id: 'USD', sembol: '$' },
  { id: 'EUR', sembol: '€' },
]

const odemeSecenekleri = [
  'Peşin', 'Havale', 'Kredi Kartı', '30 Gün Vadeli', '60 Gün Vadeli', '90 Gün Vadeli',
]

const kdvOranlari = [0, 1, 10, 20]

const bosUrun = {
  stokKodu: '',
  stokAdi: '',
  miktar: 1,
  birim: 'Adet',
  birimFiyat: 0,
  iskonto: 0,
  kdv: 20,
}

const gecerlilikSecenekleri = [
  { label: 'Aynı gün', gun: 0 },
  { label: '7 gün', gun: 7 },
  { label: '14 gün', gun: 14 },
  { label: '30 gün', gun: 30 },
  { label: '60 gün', gun: 60 },
]

const hatirlatmaSecenekleri = [
  { gun: 0, label: 'Yok' },
  { gun: 3, label: '3 gün' },
  { gun: 7, label: '1 hafta' },
  { gun: 14, label: '2 hafta' },
  { gun: 30, label: '1 ay' },
]

const teklifTipiSecenekleri = [
  { value: 'standart', label: 'Standart' },
  { value: 'trassir',  label: 'Trassir' },
  { value: 'karel',    label: 'Karel' },
]

function TeklifDetay() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { kullanici, kullanicilar } = useAuth()
  const { kurlar, yukleniyor, kurCek } = useDovizKuru()
  const { hatirlatmaEkle, teklifHatirlatmasi, hatirlatmaSil } = useHatirlatma()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const yeni = id === 'yeni'

  const [musteriler, setMusteriler] = useState([])
  const [gorusmeler, setGorusmeler] = useState([])
  const [stokUrunler, setStokUrunler] = useState([])
  const [teklifSayisi, setTeklifSayisi] = useState(0)
  const [tumTeklifler, setTumTeklifler] = useState([])
  const [karsilastirmaAcik, setKarsilastirmaAcik] = useState(false)
  const [karsilasanTeklifler, setKarsilasanTeklifler] = useState([])
  const [aktifKarsilastirmaIdx, setAktifKarsilastirmaIdx] = useState(0)
  // Modal "Yine de oluştur"a basıldığında çağrılacak resolver — Promise pattern
  const karsilastirmaResolverRef = useRef(null)
  const [mevcutTeklif, setMevcutTeklif] = useState(null)
  const [veriYuklendi, setVeriYuklendi] = useState(false)
  const [hatirlatmaGun, setHatirlatmaGun] = useState(7)
  const [ilgiliFatura, setIlgiliFatura] = useState(null)

  const onDoldurum = yeni
    ? (() => {
        try {
          const d = JSON.parse(localStorage.getItem('teklif_on_doldurum') || 'null')
          if (d) localStorage.removeItem('teklif_on_doldurum')
          return d
        } catch { return null }
      })()
    : null

  useEffect(() => {
    const promises = [
      musterileriGetir().then(setMusteriler),
      gorusmeleriGetir().then(setGorusmeler),
      stokUrunleriniGetir().then(setStokUrunler),
      teklifleriGetir().then(data => { setTumTeklifler(data); setTeklifSayisi(data.length) }),
    ]
    if (!yeni) {
      promises.push(teklifGetir(id).then(setMevcutTeklif))
      promises.push(satislariGetir().then(data => {
        setIlgiliFatura(data.find(s => s.teklifId === id) || null)
      }))
    }
    Promise.all(promises)
      .catch(err => console.error('[TeklifDetay yükle]', err))
      .finally(() => setVeriYuklendi(true))
  }, [id])

  const mevcutHatirlatma = yeni ? null : teklifHatirlatmasi(mevcutTeklif?.id)

  const [form, setForm] = useState(null)

  useEffect(() => {
    if (!veriYuklendi) return
    if (yeni) {
      setForm({
        teklifNo: `TEK-${String(teklifSayisi + 1).padStart(4, '0')}`,
        revizyon: 0,
        tarih: new Date().toISOString().split('T')[0],
        gecerlilikTarihi: '',
        musteriId: '',
        firmaAdi: onDoldurum?.firmaAdi || '',
        musteriYetkilisi: onDoldurum?.musteriYetkilisi || '',
        hazirlayan: kullanici?.ad,
        konu: onDoldurum?.konu || '',
        odemeSecenegi: 'Peşin',
        paraBirimi: 'TL',
        dovizKuru: '',
        onayDurumu: 'takipte',
        gorusmeId: '',
        aciklama: onDoldurum?.aciklama || '',
        satirlar: onDoldurum?.satirlar || [],
        genelIskonto: 0,
        musteriTalepId: onDoldurum?.musteriTalepId || null,
        musteriTalepNo: onDoldurum?.musteriTalepNo || '',
        teklifTipi: 'standart',
      })
    } else if (mevcutTeklif) {
      setForm({
        teklifNo: mevcutTeklif.teklifNo || '',
        revizyon: mevcutTeklif.revizyon || 0,
        tarih: mevcutTeklif.tarih || '',
        gecerlilikTarihi: mevcutTeklif.gecerlilikTarihi || '',
        musteriId: mevcutTeklif.musteriId || '',
        firmaAdi: mevcutTeklif.firmaAdi || '',
        musteriYetkilisi: mevcutTeklif.musteriYetkilisi || '',
        hazirlayan: mevcutTeklif.hazirlayan || '',
        konu: mevcutTeklif.konu || '',
        odemeSecenegi: mevcutTeklif.odemeSecenegi || 'Peşin',
        paraBirimi: mevcutTeklif.paraBirimi || 'TL',
        dovizKuru: mevcutTeklif.dovizKuru || '',
        onayDurumu: mevcutTeklif.onayDurumu || 'takipte',
        gorusmeId: mevcutTeklif.gorusmeId || '',
        aciklama: mevcutTeklif.aciklama || '',
        satirlar: mevcutTeklif.satirlar || [],
        genelIskonto: mevcutTeklif.genelIskonto || 0,
        musteriTalepId: mevcutTeklif.musteriTalepId || null,
        musteriTalepNo: mevcutTeklif.musteriTalepNo || '',
        teklifTipi: mevcutTeklif.teklifTipi || 'standart',
      })
    }
  }, [veriYuklendi, mevcutTeklif])

  useEffect(() => {
    if (!form) return
    if (form.paraBirimi === 'USD' && kurlar.USD && !form.dovizKuru) {
      setForm((prev) => ({ ...prev, dovizKuru: kurlar.USD }))
    }
    if (form.paraBirimi === 'EUR' && kurlar.EUR && !form.dovizKuru) {
      setForm((prev) => ({ ...prev, dovizKuru: kurlar.EUR }))
    }
    if (form.paraBirimi === 'TL') {
      setForm((prev) => ({ ...prev, dovizKuru: '' }))
    }
  }, [form?.paraBirimi, kurlar])

  if (!veriYuklendi || !form) {
    return <div style={{ padding: 24 }}><EmptyState title="Yükleniyor…" /></div>
  }

  const handleMusteriSec = (musteriId) => {
    const musteri = musteriler.find((m) => m.id?.toString() === musteriId)
    setForm({
      ...form,
      musteriId,
      firmaAdi: musteri ? musteri.firma : '',
      musteriYetkilisi: musteri ? `${musteri.ad} ${musteri.soyad}` : '',
    })
  }

  const stokSec = (index, stokKodu) => {
    const urun = stokUrunler.find((u) => u.stokKodu === stokKodu)
    const yeniSatirlar = [...form.satirlar]
    yeniSatirlar[index] = {
      ...yeniSatirlar[index],
      stokKodu: urun?.stokKodu || '',
      stokAdi: urun?.stokAdi || '',
      birim: urun?.birim || 'Adet',
    }
    setForm({ ...form, satirlar: yeniSatirlar })
  }

  const satirGuncelle = (index, alan, deger) => {
    const yeniSatirlar = [...form.satirlar]
    yeniSatirlar[index] = { ...yeniSatirlar[index], [alan]: deger }
    setForm({ ...form, satirlar: yeniSatirlar })
  }

  const satirEkle = () => {
    setForm({ ...form, satirlar: [...form.satirlar, { ...bosUrun, id: crypto.randomUUID() }] })
  }

  const satirSil = (index) => {
    const yeniSatirlar = form.satirlar.filter((_, i) => i !== index)
    setForm({ ...form, satirlar: yeniSatirlar })
  }

  const satirToplamHesapla = (satir) => {
    const ara = satir.miktar * satir.birimFiyat
    const iskontoTutar = ara * (satir.iskonto / 100)
    const kdvTutar = (ara - iskontoTutar) * (satir.kdv / 100)
    return {
      araToplam: ara,
      iskontoTutar,
      kdvTutar,
      toplam: ara - iskontoTutar + kdvTutar,
    }
  }

  const toplamHesapla = () => {
    const araToplam = form.satirlar.reduce((sum, s) => {
      const ara = s.miktar * s.birimFiyat
      const iskonto = ara * (s.iskonto / 100)
      return sum + ara - iskonto
    }, 0)
    const genelIskontoTutar = araToplam * (form.genelIskonto / 100)
    const kdvToplam = form.satirlar.reduce((sum, s) => {
      const ara = s.miktar * s.birimFiyat
      const iskonto = ara * (s.iskonto / 100)
      return sum + (ara - iskonto) * (s.kdv / 100)
    }, 0)
    const genelToplam = araToplam - genelIskontoTutar + kdvToplam
    return { araToplam, genelIskontoTutar, kdvToplam, genelToplam }
  }

  const { araToplam, genelIskontoTutar, kdvToplam, genelToplam } = toplamHesapla()
  const paraBirimi = paraBirimleri.find((p) => p.id === form.paraBirimi)
  const tlKarsiligi = form.paraBirimi !== 'TL' && form.dovizKuru
    ? genelToplam * Number(form.dovizKuru)
    : null

  const fmtPara = (n) => `${paraBirimi?.sembol || ''}${n.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`

  const kaydet = async () => {
    if (!form.firmaAdi || !form.konu) {
      toast.warning('Firma ve konu zorunludur.')
      return
    }

    // BENZER TEKLİF UYARISI:
    // Aynı stok kodu + AYNI ADET başka bir firmaya daha önce teklif edildiyse uyar.
    // Sadece kod eşleşmesi yetersiz — aynı kameralar farklı projelerde tekrar
    // teklif edildiği için sürekli uyarı çıkıyordu. Adet de tutuyorsa gerçek
    // çakışma var demektir.
    const stokMiktarKey = (s) => `${s?.stokKodu || ''}@${Number(s?.miktar) || 0}`
    const yeniStokKodlari = new Set(
      (form.satirlar || []).filter(s => s?.stokKodu).map(stokMiktarKey)
    )
    if (yeniStokKodlari.size > 0) {
      const cakisanlar = (tumTeklifler || []).filter(t => {
        if (!yeni && t.id?.toString() === id?.toString()) return false // kendi kendinle karşılaştırma
        if (!t.firmaAdi || t.firmaAdi.trim().toLowerCase() === form.firmaAdi.trim().toLowerCase()) return false
        const tStok = new Set((t.satirlar || []).filter(s => s?.stokKodu).map(stokMiktarKey))
        for (const k of yeniStokKodlari) if (tStok.has(k)) return true
        return false
      })

      if (cakisanlar.length > 0) {
        // Yan yana karşılaştırma modali: Promise pattern ile resolve bekle
        setKarsilasanTeklifler(cakisanlar)
        setAktifKarsilastirmaIdx(0)
        setKarsilastirmaAcik(true)
        const onay = await new Promise((resolve) => { karsilastirmaResolverRef.current = resolve })
        setKarsilastirmaAcik(false)
        if (!onay) return
      }
    }

    const kaydedilecek = {
      ...form,
      genelToplam,
      dovizKuru: form.dovizKuru === '' || form.dovizKuru === null ? null : Number(form.dovizKuru),
      gecerlilikTarihi: form.gecerlilikTarihi || null,
      // Bigint kolonlar için boş string → null (PG "invalid input for bigint" hatası vermesin)
      musteriId: form.musteriId || null,
      gorusmeId: form.gorusmeId || null,
      musteriTalepId: form.musteriTalepId || null,
    }
    try {
      if (yeni) {
        const yeniTeklif = await teklifEkle({ ...kaydedilecek, olusturmaTarih: new Date().toISOString() })
        if (yeniTeklif) {
          if (hatirlatmaGun > 0) {
            hatirlatmaEkle(yeniTeklif, hatirlatmaGun)
            const etiket = hatirlatmaGun === 3 ? '3 gün' : hatirlatmaGun === 7 ? '1 hafta' : hatirlatmaGun === 14 ? '2 hafta' : `${hatirlatmaGun} gün`
            toast.success(`Teklif kaydedildi. ${etiket} sonra hatırlatma oluşturuldu.`)
          } else {
            toast.success('Teklif kaydedildi.')
          }
          navigate('/teklifler')
        } else {
          toast.error('Teklif oluşturulamadı — konsol log\'una bakın.')
        }
      } else {
        await teklifGuncelle(id, kaydedilecek)
        toast.success('Teklif güncellendi.')
        navigate('/teklifler')
      }
    } catch (err) {
      console.error('[TeklifDetay.kaydet] Tam hata:', err)
      const detay = [err?.message, err?.details, err?.hint, err?.code].filter(Boolean).join(' · ')
      toast.error('Kaydetme hatası: ' + (detay || 'bilinmeyen hata'))
    }
  }

  const revizyon = () => setForm({ ...form, revizyon: form.revizyon + 1 })

  const faturayaDonustur = () => {
    localStorage.setItem(
      'satis_on_doldurum',
      JSON.stringify({
        firmaAdi: form.firmaAdi,
        musteriYetkili: form.musteriYetkilisi,
        teklifId: id,
        teklifNo: form.teklifNo,
        satirlar: (form.satirlar || []).map((s) => ({
          id: crypto.randomUUID(),
          stokKodu: s.stokKodu || '',
          urunAdi: s.stokAdi || '',
          miktar: s.miktar || 1,
          birim: s.birim || 'Adet',
          birimFiyat: s.birimFiyat || 0,
          iskontoOran: s.iskonto || 0,
          kdvOran: s.kdv || 20,
          araToplam: 0,
          kdvTutar: 0,
          satirToplam: 0,
        })),
      })
    )
    navigate('/satislar/yeni')
  }

  const aktifDurum = onayDurumlari.find(d => d.id === form.onayDurumu)

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <button
        onClick={() => navigate('/teklifler')}
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
        <ArrowLeft size={14} strokeWidth={1.5} /> Tekliflere dön
      </button>

      {/* Müşteri talep bildirimi */}
      {form.musteriTalepNo && (
        <Alert variant="info" style={{ marginBottom: 16 }}>
          <div className="t-body-strong">Müşteri teklif talebinden oluşturuldu — {form.musteriTalepNo}</div>
          <div className="t-caption" style={{ marginTop: 2 }}>
            Firma ve ürün bilgileri otomatik dolduruldu. Fiyatları girdikten sonra kaydedin.
          </div>
        </Alert>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 className="t-h1">{yeni ? 'Yeni teklif' : form.teklifNo}</h1>
          {!yeni && <CodeBadge>{form.teklifNo}</CodeBadge>}
          {form.revizyon > 0 && <Badge tone="beklemede">Rev. {form.revizyon}</Badge>}
          {aktifDurum && <Badge tone={aktifDurum.tone}>{aktifDurum.isim}</Badge>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!yeni && (
            <Button variant="secondary" iconLeft={<RefreshCw size={14} strokeWidth={1.5} />} onClick={revizyon}>
              Revizyon
            </Button>
          )}
          {!yeni && (
            <Button
              variant="secondary"
              iconLeft={<Printer size={14} strokeWidth={1.5} />}
              onClick={() => {
                // Form'da seçili olan tipi URL'ye geçir — kaydet zorunlu olmasın
                const tip = form.teklifTipi || 'standart'
                window.open(`/teklifler/${id}/yazdir?tip=${tip}`, '_blank')
              }}
            >
              PDF
            </Button>
          )}
          {!yeni && ilgiliFatura && (
            <Button
              variant="secondary"
              iconLeft={<CheckCircle2 size={14} strokeWidth={1.5} />}
              onClick={() => navigate(`/satislar/${ilgiliFatura.id}`)}
            >
              Faturaya git
            </Button>
          )}
          {!yeni && !ilgiliFatura && form?.onayDurumu === 'kabul' && (
            <Button
              variant="secondary"
              iconLeft={<Receipt size={14} strokeWidth={1.5} />}
              onClick={faturayaDonustur}
            >
              Fatura oluştur
            </Button>
          )}
          <Button variant="primary" onClick={kaydet}>Kaydet</Button>
        </div>
      </div>

      {/* Konu */}
      <Card style={{ marginBottom: 16 }}>
        <p className="t-label" style={{ marginBottom: 6 }}>Teklif konusu</p>
        <input
          type="text"
          value={form.konu}
          onChange={(e) => setForm({ ...form, konu: e.target.value })}
          placeholder="Teklif için kısa bir başlık girin…"
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            font: '600 16px/24px var(--font-sans)',
            color: 'var(--text-primary)',
          }}
        />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 16, marginBottom: 16 }}>
        {/* Sol — Teklif Bilgileri */}
        <Card>
          <h2 className="t-h2" style={{ marginBottom: 16 }}>Teklif bilgileri</h2>

          <div style={{ marginBottom: 16 }}>
            <Label>Teklif şablonu</Label>
            <SegmentedControl
              options={teklifTipiSecenekleri}
              value={form.teklifTipi || 'standart'}
              onChange={(v) => setForm({ ...form, teklifTipi: v })}
            />
            <p style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 6 }}>
              Yazdırma ve Excel çıktısı seçilen şablona göre üretilir.
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <Label>Onay durumu</Label>
            <SegmentedControl
              options={onayDurumlari.map(d => ({ value: d.id, label: d.isim }))}
              value={form.onayDurumu}
              onChange={(v) => setForm({ ...form, onayDurumu: v })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
            <div>
              <Label>Teklif no</Label>
              <div style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface-sunken)',
                font: '500 13px/20px var(--font-mono)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
              }}>
                {form.teklifNo}
              </div>
            </div>

            <div>
              <Label>Tarih</Label>
              <Input type="date" value={form.tarih} onChange={(e) => setForm({ ...form, tarih: e.target.value })} />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <Label>Geçerlilik tarihi</Label>
              <Input
                type="date"
                value={form.gecerlilikTarihi}
                onChange={(e) => setForm({ ...form, gecerlilikTarihi: e.target.value })}
              />
              <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                {gecerlilikSecenekleri.map((opt) => {
                  const hedef = new Date(form.tarih || new Date())
                  hedef.setDate(hedef.getDate() + opt.gun)
                  const hedefStr = hedef.toISOString().split('T')[0]
                  const aktif = form.gecerlilikTarihi === hedefStr
                  return (
                    <button
                      key={opt.gun}
                      type="button"
                      onClick={() => setForm({ ...form, gecerlilikTarihi: hedefStr })}
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
              <Label>Müşteri seç</Label>
              <CustomSelect value={form.musteriId} onChange={(e) => handleMusteriSec(e.target.value)}>
                <option value="">Müşteri seç…</option>
                {musteriler.map((m) => (
                  <option key={m.id} value={m.id}>{m.ad} {m.soyad} — {m.firma}</option>
                ))}
              </CustomSelect>
            </div>

            <div>
              <Label required>Firma adı</Label>
              <Input
                value={form.firmaAdi}
                onChange={(e) => setForm({ ...form, firmaAdi: e.target.value })}
                placeholder="Firma adı"
              />
            </div>

            <div>
              <Label>Müşteri yetkilisi</Label>
              <Input
                value={form.musteriYetkilisi}
                onChange={(e) => setForm({ ...form, musteriYetkilisi: e.target.value })}
                placeholder="Yetkili adı"
              />
            </div>

            <div>
              <Label>Hazırlayan</Label>
              <CustomSelect
                value={form.hazirlayan}
                onChange={(e) => setForm({ ...form, hazirlayan: e.target.value })}
              >
                {kullanicilar.map((k) => <option key={k.id} value={k.ad}>{k.ad}</option>)}
              </CustomSelect>
            </div>

            <div>
              <Label>Ödeme şekli</Label>
              <CustomSelect
                value={form.odemeSecenegi}
                onChange={(e) => setForm({ ...form, odemeSecenegi: e.target.value })}
              >
                {odemeSecenekleri.map((o) => <option key={o} value={o}>{o}</option>)}
              </CustomSelect>
            </div>

            <div>
              <Label>Bağlı görüşme</Label>
              <CustomSelect
                value={form.gorusmeId}
                onChange={(e) => setForm({ ...form, gorusmeId: e.target.value })}
                disabled={!form.firmaAdi}
              >
                <option value="">
                  {form.firmaAdi ? 'Görüşme seç…' : 'Önce müşteri seçin'}
                </option>
                {gorusmeler
                  .filter((g) => form.firmaAdi && (g.firmaAdi || '').trim().toLowerCase() === form.firmaAdi.trim().toLowerCase())
                  .map((g) => (
                    <option key={g.id} value={g.id}>{g.aktNo} — {g.konu || '—'}</option>
                  ))}
              </CustomSelect>
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <Label>Teklif koşulları</Label>
              <Textarea
                value={form.aciklama}
                onChange={(e) => setForm({ ...form, aciklama: e.target.value })}
                rows={2}
                placeholder="Ek açıklama…"
              />
            </div>
          </div>
        </Card>

        {/* Sağ — Fiyat Özeti */}
        <Card>
          <h2 className="t-h2" style={{ marginBottom: 16 }}>Fiyat özeti</h2>

          <div style={{ marginBottom: 16 }}>
            <Label>Para birimi</Label>
            <SegmentedControl
              options={paraBirimleri.map(p => ({ value: p.id, label: `${p.sembol} ${p.id}` }))}
              value={form.paraBirimi}
              onChange={(v) => setForm({ ...form, paraBirimi: v, dovizKuru: '' })}
            />
          </div>

          {form.paraBirimi !== 'TL' && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Label style={{ margin: 0 }}>Döviz kuru (TL)</Label>
                <button
                  onClick={kurCek}
                  disabled={yukleniyor}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    color: 'var(--brand-primary)',
                    font: '500 12px/16px var(--font-sans)',
                    opacity: yukleniyor ? 0.5 : 1,
                  }}
                >
                  <RefreshCw size={12} strokeWidth={1.5} /> Güncelle
                </button>
              </div>

              {kurlar[form.paraBirimi] && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', marginBottom: 8,
                  background: 'var(--success-soft)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-default)',
                }}>
                  <span className="t-caption" style={{ color: 'var(--success)' }}>
                    Güncel: <span className="tabular-nums">1 {form.paraBirimi} = ₺{kurlar[form.paraBirimi]}</span>
                  </span>
                  <button
                    onClick={() => setForm({ ...form, dovizKuru: kurlar[form.paraBirimi] })}
                    style={{
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      color: 'var(--success)',
                      font: '500 12px/16px var(--font-sans)',
                    }}
                  >
                    Kullan
                  </button>
                </div>
              )}

              <Input
                type="number"
                value={form.dovizKuru}
                onChange={(e) => setForm({ ...form, dovizKuru: e.target.value })}
                placeholder="0.00"
              />
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <Label>Genel iskonto (%)</Label>
            <Input
              type="number"
              value={form.genelIskonto}
              onChange={(e) => setForm({ ...form, genelIskonto: Number(e.target.value) })}
              placeholder="0"
              min="0"
              max="100"
            />
          </div>

          <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="t-caption">Ara toplam</span>
              <span className="tabular-nums" style={{ font: '500 13px/18px var(--font-sans)' }}>{fmtPara(araToplam)}</span>
            </div>
            {form.genelIskonto > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="t-caption">İskonto ({form.genelIskonto}%)</span>
                <span className="tabular-nums" style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--danger)' }}>
                  −{fmtPara(genelIskontoTutar)}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="t-caption">KDV toplam</span>
              <span className="tabular-nums" style={{ font: '500 13px/18px var(--font-sans)' }}>{fmtPara(kdvToplam)}</span>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              paddingTop: 8, marginTop: 4,
              borderTop: '1px solid var(--border-default)',
            }}>
              <span className="t-body-strong">Genel toplam</span>
              <span className="tabular-nums" style={{ font: '600 15px/22px var(--font-sans)', color: 'var(--brand-primary)' }}>
                {fmtPara(genelToplam)}
              </span>
            </div>
            {tlKarsiligi !== null && (
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '8px 12px', marginTop: 6,
                background: 'var(--surface-sunken)',
                borderRadius: 'var(--radius-sm)',
              }}>
                <span className="t-caption">TL karşılığı</span>
                <span className="tabular-nums" style={{ font: '500 12px/16px var(--font-sans)' }}>
                  ₺{tlKarsiligi.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Ürün Satırları */}
      <Card padding={0} style={{ marginBottom: 16 }}>
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
              title="Henüz ürün eklenmedi"
              description={'"Satır ekle" butonuyla ilk satırı oluşturun.'}
            />
          </div>
        ) : (
          <Table style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 140 }} />
              <col />
              <col style={{ width: 90 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 50 }} />
            </colgroup>
            <THead>
              <TR>
                <TH>Stok</TH>
                <TH>Ürün adı</TH>
                <TH align="right">Miktar</TH>
                <TH>Birim</TH>
                <TH align="right">Birim fiyat</TH>
                <TH align="right">İsk.%</TH>
                <TH align="right">KDV%</TH>
                <TH align="right">Toplam</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {form.satirlar.map((satir, index) => {
                const { toplam } = satirToplamHesapla(satir)
                return (
                  <TR key={satir.id || index}>
                    <TD>
                      <CustomSelect
                        value={satir.stokKodu}
                        selectedDisplay={(v) => v || 'Stok seç…'}
                        panelMinWidth={520}
                        onChange={(e) => stokSec(index, e.target.value)}
                      >
                        <option value="">Stok seç…</option>
                        {stokUrunler.map((u) => (
                          <option key={u.id} value={u.stokKodu}>{u.stokKodu} — {u.stokAdi}</option>
                        ))}
                      </CustomSelect>
                    </TD>
                    <TD style={{ verticalAlign: 'top' }}>
                      <Textarea
                        value={satir.stokAdi}
                        onChange={(e) => satirGuncelle(index, 'stokAdi', e.target.value)}
                        placeholder="Ürün adı"
                        rows={2}
                        style={{ resize: 'vertical', minHeight: 36, fontSize: 13, lineHeight: '18px', padding: '8px 12px' }}
                      />
                    </TD>
                    <TD align="right">
                      <Input
                        type="number"
                        value={satir.miktar}
                        onChange={(e) => satirGuncelle(index, 'miktar', Number(e.target.value))}
                        min="0"
                        style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                      />
                    </TD>
                    <TD>
                      <Input
                        value={satir.birim}
                        onChange={(e) => satirGuncelle(index, 'birim', e.target.value)}
                      />
                    </TD>
                    <TD align="right">
                      <Input
                        type="number"
                        value={satir.birimFiyat}
                        onChange={(e) => satirGuncelle(index, 'birimFiyat', Number(e.target.value))}
                        min="0"
                        style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                      />
                    </TD>
                    <TD align="right">
                      <Input
                        type="number"
                        value={satir.iskonto}
                        onChange={(e) => satirGuncelle(index, 'iskonto', Number(e.target.value))}
                        min="0"
                        max="100"
                        style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                      />
                    </TD>
                    <TD align="right">
                      <CustomSelect
                        value={satir.kdv}
                        onChange={(e) => satirGuncelle(index, 'kdv', Number(e.target.value))}
                      >
                        {kdvOranlari.map((k) => <option key={k} value={k}>%{k}</option>)}
                      </CustomSelect>
                    </TD>
                    <TD align="right">
                      <span className="tabular-nums" style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                        {fmtPara(toplam)}
                      </span>
                    </TD>
                    <TD align="right">
                      <button
                        aria-label="Satırı sil"
                        onClick={() => satirSil(index)}
                        style={iconBtnStyle}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                      >
                        <Trash2 size={12} strokeWidth={1.5} />
                      </button>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Hatırlatma */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-md)',
              background: 'var(--brand-primary-soft)', color: 'var(--brand-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Bell size={16} strokeWidth={1.5} />
            </div>
            <div>
              <p className="t-body-strong">Takip hatırlatması</p>
              {yeni ? (
                <p className="t-caption">Teklif kaydedildikten sonra ne zaman hatırlatılsın?</p>
              ) : mevcutHatirlatma ? (
                <p className="t-caption" style={{ color: 'var(--brand-primary)' }}>
                  Hatırlatma: {new Date(mevcutHatirlatma.hatirlatmaTarihi).toLocaleDateString('tr-TR', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </p>
              ) : (
                <p className="t-caption">Aktif hatırlatma yok.</p>
              )}
            </div>
          </div>

          {yeni ? (
            <SegmentedControl
              options={hatirlatmaSecenekleri.map(h => ({ value: h.gun, label: h.label }))}
              value={hatirlatmaGun}
              onChange={setHatirlatmaGun}
            />
          ) : mevcutHatirlatma ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="secondary"
                onClick={() => {
                  hatirlatmaEkle(mevcutTeklif, 7)
                  toast.info('Hatırlatma 1 hafta sonraya güncellendi.')
                }}
              >
                1 hafta ertele
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  hatirlatmaSil(mevcutTeklif?.id)
                  toast.info('Hatırlatma kaldırıldı.')
                }}
              >
                Kaldır
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              iconLeft={<Plus size={14} strokeWidth={1.5} />}
              onClick={() => {
                hatirlatmaEkle(mevcutTeklif, 7)
                toast.success('1 hafta sonraya hatırlatma eklendi.')
              }}
            >
              Hatırlatma ekle
            </Button>
          )}
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="secondary" onClick={() => navigate('/teklifler')}>İptal</Button>
        <Button variant="primary" onClick={kaydet}>Kaydet</Button>
      </div>

      {/* ────────────────────────────────────────────────
          Yan yana karşılaştırma modali
          Çakışan stoklara sahip mevcut teklifle yenisini karşılaştır
      ──────────────────────────────────────────────── */}
      <Modal
        open={karsilastirmaAcik}
        onClose={() => karsilastirmaResolverRef.current?.(false)}
        title="Aynı ürünler başka firmaya teklif edilmiş"
        width={1100}
        footer={
          <>
            <Button variant="secondary" onClick={() => karsilastirmaResolverRef.current?.(false)}>
              Vazgeç
            </Button>
            <Button variant="primary" onClick={() => karsilastirmaResolverRef.current?.(true)}>
              Yine de oluştur
            </Button>
          </>
        }
      >
        {karsilasanTeklifler.length > 0 && (() => {
          const eski = karsilasanTeklifler[aktifKarsilastirmaIdx] || karsilasanTeklifler[0]
          const stokMiktarKey = (s) => `${s?.stokKodu || ''}@${Number(s?.miktar) || 0}`
          const yeniSet = new Set((form.satirlar || []).filter(s => s?.stokKodu).map(stokMiktarKey))
          const eskiSet = new Set((eski.satirlar || []).filter(s => s?.stokKodu).map(stokMiktarKey))
          const ortak = [...yeniSet].filter(k => eskiSet.has(k))
          const ortakKodlari = new Set(ortak.map(k => k.split('@')[0]))
          const eskiParaSembol = (paraBirimleri.find(p => p.id === (eski.paraBirimi || 'TL')))?.sembol || '₺'
          const fmtEski = (n) => `${eskiParaSembol}${(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`

          return (
            <>
              {/* Karşılaştırılan teklifler arasında geçiş */}
              {karsilasanTeklifler.length > 1 && (
                <div style={{
                  display: 'flex', gap: 6, flexWrap: 'wrap',
                  marginBottom: 16, padding: 8,
                  background: 'var(--surface-sunken)',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <span className="t-caption" style={{ alignSelf: 'center', marginRight: 4 }}>
                    {karsilasanTeklifler.length} teklif çakıştı:
                  </span>
                  {karsilasanTeklifler.map((t, i) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setAktifKarsilastirmaIdx(i)}
                      style={{
                        padding: '4px 10px',
                        font: '500 12px/16px var(--font-sans)',
                        borderRadius: 'var(--radius-pill)',
                        border: `1px solid ${i === aktifKarsilastirmaIdx ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                        background: i === aktifKarsilastirmaIdx ? 'var(--brand-primary)' : 'var(--surface-card)',
                        color: i === aktifKarsilastirmaIdx ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      {t.teklifNo || `#${t.id}`}
                    </button>
                  ))}
                </div>
              )}

              <Alert variant="warning" style={{ marginBottom: 16 }}>
                <span className="t-body-strong">{ortak.length}</span> ortak ürün bulundu —
                aşağıda <strong>sarı</strong> ile işaretlendi.
              </Alert>

              {/* Yan yana iki kart */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* SOL: Mevcut (eski) teklif */}
                <Card padding={16} style={{ borderColor: 'var(--warning)', borderWidth: 1, borderStyle: 'solid' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                    <Badge tone="beklemede">Mevcut teklif</Badge>
                    <CodeBadge>{eski.teklifNo || `#${eski.id}`}</CodeBadge>
                  </div>
                  <div className="t-body-strong" style={{ marginBottom: 4 }}>{eski.firmaAdi}</div>
                  <div className="t-caption" style={{ marginBottom: 12 }}>
                    {eski.tarih ? new Date(eski.tarih).toLocaleDateString('tr-TR') : '—'}
                    {eski.musteriYetkilisi ? ` · ${eski.musteriYetkilisi}` : ''}
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 8 }}>
                    {(eski.satirlar || []).length === 0 ? (
                      <div className="t-caption">Satır yok</div>
                    ) : (eski.satirlar || []).map((s, i) => {
                      const cakisan = ortak.includes(stokMiktarKey(s))
                      return (
                        <div key={i} style={{
                          display: 'grid',
                          gridTemplateColumns: '60px 1fr 60px 90px',
                          gap: 6,
                          padding: '6px 8px',
                          borderBottom: '1px solid var(--border-default)',
                          background: cakisan ? 'var(--warning-soft, rgba(183,117,22,0.08))' : 'transparent',
                          font: '400 12px/16px var(--font-sans)',
                        }}>
                          <span className="t-mono" style={{ color: 'var(--text-tertiary)' }}>{s.stokKodu || '—'}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.stokAdi}>{s.stokAdi}</span>
                          <span className="tabular-nums" style={{ textAlign: 'right' }}>{s.miktar} {s.birim || ''}</span>
                          <span className="tabular-nums" style={{ textAlign: 'right' }}>{fmtEski(s.miktar * s.birimFiyat)}</span>
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--border-default)' }}>
                    <span className="t-caption">Genel toplam</span>
                    <span className="tabular-nums" style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
                      {fmtEski(eski.genelToplam || 0)}
                    </span>
                  </div>
                </Card>

                {/* SAĞ: Yeni teklif (mevcut form) */}
                <Card padding={16} style={{ borderColor: 'var(--brand-primary)', borderWidth: 1, borderStyle: 'solid' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                    <Badge tone="brand">Yeni teklif</Badge>
                    <CodeBadge>{form.teklifNo}</CodeBadge>
                  </div>
                  <div className="t-body-strong" style={{ marginBottom: 4 }}>{form.firmaAdi}</div>
                  <div className="t-caption" style={{ marginBottom: 12 }}>
                    {form.tarih ? new Date(form.tarih).toLocaleDateString('tr-TR') : '—'}
                    {form.musteriYetkilisi ? ` · ${form.musteriYetkilisi}` : ''}
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 8 }}>
                    {(form.satirlar || []).length === 0 ? (
                      <div className="t-caption">Satır yok</div>
                    ) : (form.satirlar || []).map((s, i) => {
                      const cakisan = ortak.includes(stokMiktarKey(s))
                      const sembol = paraBirimi?.sembol || '₺'
                      return (
                        <div key={i} style={{
                          display: 'grid',
                          gridTemplateColumns: '60px 1fr 60px 90px',
                          gap: 6,
                          padding: '6px 8px',
                          borderBottom: '1px solid var(--border-default)',
                          background: cakisan ? 'var(--warning-soft, rgba(183,117,22,0.08))' : 'transparent',
                          font: '400 12px/16px var(--font-sans)',
                        }}>
                          <span className="t-mono" style={{ color: 'var(--text-tertiary)' }}>{s.stokKodu || '—'}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.stokAdi}>{s.stokAdi}</span>
                          <span className="tabular-nums" style={{ textAlign: 'right' }}>{s.miktar} {s.birim || ''}</span>
                          <span className="tabular-nums" style={{ textAlign: 'right' }}>{sembol}{(s.miktar * s.birimFiyat).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--border-default)' }}>
                    <span className="t-caption">Genel toplam</span>
                    <span className="tabular-nums" style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--brand-primary)' }}>
                      {fmtPara(genelToplam)}
                    </span>
                  </div>
                </Card>
              </div>
            </>
          )
        })()}
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

export default TeklifDetay
