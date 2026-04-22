import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useDovizKuru } from '../hooks/useDovizKuru'
import { useHatirlatma } from '../context/HatirlatmaContext'
import { useToast } from '../context/ToastContext'
import { teklifleriGetir, teklifGetir, teklifEkle, teklifGuncelle, teklifSil as dbTeklifSil } from '../services/teklifService'
import { satislariGetir } from '../services/satisService'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { musterileriGetir } from '../services/musteriService'
import { stokUrunleriniGetir } from '../services/stokService'
import CustomSelect from '../components/CustomSelect'

const onayDurumlari = [
  { id: 'takipte', isim: 'Takipte', renk: 'bg-blue-100 text-blue-700' },
  { id: 'kabul', isim: 'Kabul Edildi', renk: 'bg-green-100 text-green-700' },
  { id: 'vazgecildi', isim: 'Vazgeçildi', renk: 'bg-red-100 text-red-600' },
  { id: 'revizyon', isim: 'Revizyon', renk: 'bg-amber-100 text-amber-700' },
]

const paraBirimleri = [
  { id: 'TL', sembol: '₺' },
  { id: 'USD', sembol: '$' },
  { id: 'EUR', sembol: '€' },
]

const odemeSecenekleri = [
  'Peşin', 'Havale', 'Kredi Kartı', '30 Gün Vadeli', '60 Gün Vadeli', '90 Gün Vadeli'
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

function TeklifDetay() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { kullanici, kullanicilar } = useAuth()
  const { kurlar, yukleniyor, kurCek } = useDovizKuru()
  const { hatirlatmaEkle, teklifHatirlatmasi, hatirlatmaSil } = useHatirlatma()
  const { toast } = useToast()
  const yeni = id === 'yeni'

  const [musteriler, setMusteriler] = useState([])
  const [gorusmeler, setGorusmeler] = useState([])
  const [stokUrunler, setStokUrunler] = useState([])
  const [teklifSayisi, setTeklifSayisi] = useState(0)
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
      teklifleriGetir().then(data => setTeklifSayisi(data.length)),
    ]
    if (!yeni) {
      promises.push(teklifGetir(id).then(setMevcutTeklif))
      promises.push(satislariGetir().then(data => {
        setIlgiliFatura(data.find(s => s.teklifId === id) || null)
      }))
    }
    Promise.all(promises).then(() => setVeriYuklendi(true))
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
      })
    }
  }, [veriYuklendi, mevcutTeklif])

  // Para birimi değişince kurları otomatik doldur
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
    return <div className="p-6 text-center text-gray-400">Yükleniyor...</div>
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

  const kaydet = async () => {
    if (!form.firmaAdi || !form.konu) {
      toast.warning('Firma ve konu zorunludur!')
      return
    }
    const kaydedilecek = {
      ...form,
      genelToplam,
      dovizKuru: form.dovizKuru === '' || form.dovizKuru === null ? null : Number(form.dovizKuru),
      gecerlilikTarihi: form.gecerlilikTarihi || null,
    }
    try {
      if (yeni) {
        const yeniTeklif = await teklifEkle({ ...kaydedilecek, olusturmaTarih: new Date().toISOString() })
        if (yeniTeklif) {
          if (hatirlatmaGun > 0) {
            hatirlatmaEkle(yeniTeklif, hatirlatmaGun)
            const etiket = hatirlatmaGun === 3 ? '3 gün' : hatirlatmaGun === 7 ? '1 hafta' : hatirlatmaGun === 14 ? '2 hafta' : `${hatirlatmaGun} gün`
            toast.success(`Teklif kaydedildi. ${etiket} sonra takip hatırlatması oluşturuldu.`)
          } else {
            toast.success('Teklif kaydedildi.')
          }
          navigate('/teklifler')
        }
      } else {
        await teklifGuncelle(id, kaydedilecek)
        toast.success('Teklif güncellendi.')
        navigate('/teklifler')
      }
    } catch (err) {
      toast.error('Hata: ' + (err.message || 'Teklif kaydedilemedi'))
    }
  }

  const revizyon = () => {
    setForm({ ...form, revizyon: form.revizyon + 1 })
  }

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

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Müşteri teklif talebinden gelme bildirimi */}
      {form.musteriTalepNo && (
        <div className="flex items-center gap-3 p-4 rounded-xl mb-4" style={{ background: 'rgba(1,118,211,0.08)', border: '1px solid rgba(1,118,211,0.2)' }}>
          <span style={{ fontSize: '18px' }}>📥</span>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--primary)' }}>
              Müşteri teklif talebinden oluşturuldu — {form.musteriTalepNo}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Firma ve ürün bilgileri otomatik dolduruldu. Fiyatları girdikten sonra kaydedin.
            </p>
          </div>
        </div>
      )}

      {/* Başlık */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/teklifler')}
            className="text-sm text-gray-400 hover:text-blue-600 transition"
          >
            ← Teklifler
          </button>
          <h2 className="text-xl font-semibold text-gray-800">
            {yeni ? 'Yeni Teklif' : form.teklifNo}
            {form.revizyon > 0 && (
              <span className="text-sm text-amber-500 ml-2">Rev.{form.revizyon}</span>
            )}
          </h2>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!yeni && (
            <button
              onClick={revizyon}
              className="text-sm px-4 py-2 rounded-lg border border-amber-200 text-amber-600 hover:bg-amber-50 transition"
            >
              + Revizyon
            </button>
          )}
          {!yeni && (
            <button
              onClick={() => window.open(`/teklifler/${id}/yazdir`, '_blank')}
              className="px-4 py-2 rounded-xl text-sm font-medium transition"
              style={{ border: '1px solid rgba(1,118,211,0.3)', color: 'var(--primary)', background: 'transparent' }}
            >
              🖨 PDF
            </button>
          )}
          {!yeni && ilgiliFatura && (
            <button
              onClick={() => navigate(`/satislar/${ilgiliFatura.id}`)}
              className="px-4 py-2 rounded-xl text-sm font-medium transition text-white"
              style={{ background: '#10b981' }}
            >
              ✅ Faturaya Git
            </button>
          )}
          {!yeni && !ilgiliFatura && form?.onayDurumu === 'kabul' && (
            <button
              onClick={faturayaDonustur}
              className="px-4 py-2 rounded-xl text-sm font-medium transition text-white"
              style={{ background: '#0176D3' }}
            >
              🧾 Fatura Oluştur
            </button>
          )}
          <button
            onClick={kaydet}
            className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Kaydet
          </button>
        </div>
      </div>

      {/* Teklif Açıklaması — Paraşüt stili prominent input */}
      <div
        className="rounded-2xl mb-6 flex items-center gap-4"
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
            TEKLİF AÇIKLAMASI
          </p>
          <input
            type="text"
            value={form.konu}
            onChange={(e) => setForm({ ...form, konu: e.target.value })}
            placeholder="Teklif için kısa bir başlık/açıklama girin..."
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

        {/* Sol — Teklif Bilgileri */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm font-medium text-gray-700 mb-4">Teklif Bilgileri</p>
          <div className="grid grid-cols-2 gap-4">

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Teklif No</label>
              <span className="text-sm font-mono bg-gray-100 text-gray-700 px-3 py-2 rounded-lg block">
                {form.teklifNo}
              </span>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Onay Durumu</label>
              <CustomSelect
                value={form.onayDurumu}
                onChange={(e) => setForm({ ...form, onayDurumu: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {onayDurumlari.map((d) => (
                  <option key={d.id} value={d.id}>{d.isim}</option>
                ))}
              </CustomSelect>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tarih</label>
              <input type="date" value={form.tarih}
                onChange={(e) => setForm({ ...form, tarih: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Geçerlilik Tarihi</label>
              <input type="date" value={form.gecerlilikTarihi}
                onChange={(e) => setForm({ ...form, gecerlilikTarihi: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {/* Geçerlilik hızlı seçim */}
              <div className="flex gap-1 flex-wrap mt-1">
                {[
                  { label: 'Aynı Gün', gun: 0 },
                  { label: '7 Gün', gun: 7 },
                  { label: '14 Gün', gun: 14 },
                  { label: '30 Gün', gun: 30 },
                  { label: '60 Gün', gun: 60 },
                ].map((opt) => {
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
              <label className="text-xs text-gray-500 mb-1 block">Müşteri Seç</label>
              <CustomSelect value={form.musteriId} onChange={(e) => handleMusteriSec(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Müşteri seç...</option>
                {musteriler.map((m) => (
                  <option key={m.id} value={m.id}>{m.ad} {m.soyad} — {m.firma}</option>
                ))}
              </CustomSelect>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Firma Adı *</label>
              <input type="text" value={form.firmaAdi}
                onChange={(e) => setForm({ ...form, firmaAdi: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Firma adı" />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Müşteri Yetkilisi</label>
              <input type="text" value={form.musteriYetkilisi}
                onChange={(e) => setForm({ ...form, musteriYetkilisi: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Yetkili adı" />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Hazırlayan</label>
              <CustomSelect value={form.hazirlayan}
                onChange={(e) => setForm({ ...form, hazirlayan: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {kullanicilar.map((k) => (
                  <option key={k.id} value={k.ad}>{k.ad}</option>
                ))}
              </CustomSelect>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Ödeme Şekli</label>
              <CustomSelect value={form.odemeSecenegi}
                onChange={(e) => setForm({ ...form, odemeSecenegi: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {odemeSecenekleri.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </CustomSelect>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Bağlı Görüşme</label>
              <CustomSelect value={form.gorusmeId}
                onChange={(e) => setForm({ ...form, gorusmeId: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Görüşme seç...</option>
                {gorusmeler.map((g) => (
                  <option key={g.id} value={g.id}>{g.aktNo} — {g.firmaAdi}</option>
                ))}
              </CustomSelect>
            </div>

            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Teklif Konusu *</label>
              <input type="text" value={form.konu}
                onChange={(e) => setForm({ ...form, konu: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Teklif konusu" />
            </div>

            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Teklif Koşulları</label>
              <textarea value={form.aciklama}
                onChange={(e) => setForm({ ...form, aciklama: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2} placeholder="Ek açıklama..." />
            </div>
          </div>
        </div>

        {/* Sağ — Fiyat Özeti */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm font-medium text-gray-700 mb-4">Fiyat Özeti</p>

          {/* Para Birimi */}
          <div className="mb-4">
            <label className="text-xs text-gray-500 mb-1 block">Para Birimi</label>
            <div className="flex gap-2">
              {paraBirimleri.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setForm({ ...form, paraBirimi: p.id, dovizKuru: '' })}
                  className={`flex-1 text-sm py-2 rounded-lg border transition font-medium ${
                    form.paraBirimi === p.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {p.sembol} {p.id}
                </button>
              ))}
            </div>
          </div>

          {/* Döviz Kuru Bilgisi */}
          {form.paraBirimi !== 'TL' && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-500">Döviz Kuru (TL)</label>
                <button
                  onClick={kurCek}
                  disabled={yukleniyor}
                  className="text-xs text-blue-500 hover:text-blue-700 transition disabled:opacity-40"
                >
                  {yukleniyor ? '⟳' : '↻'} Güncelle
                </button>
              </div>

              {/* Güncel kur göstergesi */}
              {kurlar[form.paraBirimi] && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-2 flex items-center justify-between">
                  <span className="text-xs text-green-600">
                    Güncel: 1 {form.paraBirimi} = ₺{kurlar[form.paraBirimi]}
                  </span>
                  <button
                    onClick={() => setForm({ ...form, dovizKuru: kurlar[form.paraBirimi] })}
                    className="text-xs text-green-700 font-medium hover:underline"
                  >
                    Kullan
                  </button>
                </div>
              )}

              <input
                type="number"
                value={form.dovizKuru}
                onChange={(e) => setForm({ ...form, dovizKuru: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
          )}

          {/* Genel İskonto */}
          <div className="mb-4">
            <label className="text-xs text-gray-500 mb-1 block">Genel İskonto (%)</label>
            <input
              type="number"
              value={form.genelIskonto}
              onChange={(e) => setForm({ ...form, genelIskonto: Number(e.target.value) })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0"
              min="0"
              max="100"
            />
          </div>

          {/* Toplam */}
          <div className="border-t border-gray-100 pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Ara Toplam</span>
              <span className="font-medium">
                {paraBirimi?.sembol}{araToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {form.genelIskonto > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">İskonto ({form.genelIskonto}%)</span>
                <span className="text-red-500">
                  -{paraBirimi?.sembol}{genelIskontoTutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">KDV Toplam</span>
              <span className="font-medium">
                {paraBirimi?.sembol}{kdvToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-base font-semibold border-t border-gray-100 pt-2">
              <span className="text-gray-800">Genel Toplam</span>
              <span className="text-blue-600">
                {paraBirimi?.sembol}{genelToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {tlKarsiligi !== null && (
              <div className="flex justify-between text-xs bg-gray-50 rounded-lg px-3 py-2 mt-2">
                <span className="text-gray-500">TL Karşılığı</span>
                <span className="font-medium text-gray-700">
                  ₺{tlKarsiligi.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ürün Satırları */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-gray-700">Ürün / Hizmet Satırları</p>
          <button
            onClick={satirEkle}
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition"
          >
            + Satır Ekle
          </button>
        </div>

        {form.satirlar.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-8 border-2 border-dashed border-gray-200 rounded-lg">
            Henüz ürün eklenmedi. "Satır Ekle" butonuna tıklayın.
          </div>
        )}

        {form.satirlar.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                  <th className="text-left py-2 pr-2 w-48">Stok</th>
                  <th className="text-left py-2 pr-2">Ürün Adı</th>
                  <th className="text-right py-2 pr-2 w-20">Miktar</th>
                  <th className="text-left py-2 pr-2 w-20">Birim</th>
                  <th className="text-right py-2 pr-2 w-28">Birim Fiyat</th>
                  <th className="text-right py-2 pr-2 w-20">İsk.%</th>
                  <th className="text-right py-2 pr-2 w-20">KDV%</th>
                  <th className="text-right py-2 pr-2 w-28">Toplam</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {form.satirlar.map((satir, index) => {
                  const { toplam } = satirToplamHesapla(satir)
                  return (
                    <tr key={satir.id || index} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 pr-2">
                        <CustomSelect
                          value={satir.stokKodu}
                          onChange={(e) => stokSec(index, e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Stok seç...</option>
                          {stokUrunler.map((u) => (
                            <option key={u.id} value={u.stokKodu}>
                              {u.stokKodu} — {u.stokAdi}
                            </option>
                          ))}
                        </CustomSelect>
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="text"
                          value={satir.stokAdi}
                          onChange={(e) => satirGuncelle(index, 'stokAdi', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Ürün adı"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          value={satir.miktar}
                          onChange={(e) => satirGuncelle(index, 'miktar', Number(e.target.value))}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="0"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="text"
                          value={satir.birim}
                          onChange={(e) => satirGuncelle(index, 'birim', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          value={satir.birimFiyat}
                          onChange={(e) => satirGuncelle(index, 'birimFiyat', Number(e.target.value))}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="0"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          value={satir.iskonto}
                          onChange={(e) => satirGuncelle(index, 'iskonto', Number(e.target.value))}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="0"
                          max="100"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <CustomSelect
                          value={satir.kdv}
                          onChange={(e) => satirGuncelle(index, 'kdv', Number(e.target.value))}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {kdvOranlari.map((k) => (
                            <option key={k} value={k}>%{k}</option>
                          ))}
                        </CustomSelect>
                      </td>
                      <td className="py-2 pr-2 text-right">
                        <span className="text-sm font-medium text-gray-800">
                          {paraBirimi?.sembol}{toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => satirSil(index)}
                          className="text-red-400 hover:text-red-600 transition"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Hatırlatma Ayarı */}
      <div
        className="bg-white rounded-xl border p-5 mb-6"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0"
              style={{ background: 'var(--primary)', fontSize: '15px' }}
            >
              🔔
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">Takip Hatırlatması</p>
              {yeni ? (
                <p className="text-xs text-gray-400 mt-0.5">
                  Teklif kaydedildikten sonra ne zaman hatırlatılsın?
                </p>
              ) : mevcutHatirlatma ? (
                <p className="text-xs mt-0.5" style={{ color: 'var(--primary)' }}>
                  Hatırlatma:{' '}
                  {new Date(mevcutHatirlatma.hatirlatmaTarihi).toLocaleDateString('tr-TR', {
                    day: 'numeric', month: 'long', year: 'numeric'
                  })}
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-0.5">Aktif hatırlatma yok</p>
              )}
            </div>
          </div>

          {yeni ? (
            <div className="flex gap-2 flex-wrap">
              {[
                { gun: 0, label: 'Yok' },
                { gun: 3, label: '3 Gün' },
                { gun: 7, label: '1 Hafta' },
                { gun: 14, label: '2 Hafta' },
                { gun: 30, label: '1 Ay' },
              ].map((opt) => (
                <button
                  key={opt.gun}
                  onClick={() => setHatirlatmaGun(opt.gun)}
                  className="text-xs px-3 py-1.5 rounded-lg border transition font-medium"
                  style={
                    hatirlatmaGun === opt.gun
                      ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }
                      : { background: '#fff', color: '#555', borderColor: 'var(--border)' }
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : mevcutHatirlatma ? (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  hatirlatmaEkle(mevcutTeklif, 7)
                  toast.info('Hatırlatma 1 hafta sonraya güncellendi.')
                }}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition text-gray-600"
              >
                ⏩ 1 Hafta Ertele
              </button>
              <button
                onClick={() => {
                  hatirlatmaSil(mevcutTeklif?.id)
                  toast.info('Hatırlatma kaldırıldı.')
                }}
                className="text-xs px-3 py-1.5 rounded-lg border transition"
                style={{ borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444' }}
              >
                🗑 Kaldır
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                hatirlatmaEkle(mevcutTeklif, 7)
                toast.success('1 hafta sonraya hatırlatma eklendi.')
              }}
              className="text-xs px-3 py-1.5 rounded-lg border transition font-medium"
              style={{ background: 'rgba(1,118,211,0.08)', color: 'var(--primary)', borderColor: 'rgba(1,118,211,0.3)' }}
            >
              + Hatırlatma Ekle
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={() => navigate('/teklifler')}
          className="text-sm px-5 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
        >
          İptal
        </button>
        <button
          onClick={kaydet}
          className="bg-blue-600 text-white text-sm px-6 py-2 rounded-lg hover:bg-blue-700 transition font-medium"
        >
          Kaydet
        </button>
      </div>
    </div>
  )
}

export default TeklifDetay
