import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { stokUrunleriniGetir, stokUrunEkle, stokUrunGuncelle, stokUrunSil, stokHareketleriniGetir, stokHareketEkle, gorselYukle, stokKalemOzetleriniGetir, stokKalemleriToplu } from '../services/stokService'
import CustomSelect from '../components/CustomSelect'

const birimler = ['Adet', 'Metre', 'Kg', 'Boy', 'Paket', 'Kutu', 'Litre', 'Mt²']

const bosForm = {
  stokKodu: '',
  stokAdi: '',
  birim: 'Adet',
  marka: '',
  model: '',
  grupKodu: '',
  minStok: '',
  aciklama: '',
  ilkStok: '',
  gorselUrl: '',
  katalogdaGoster: true,
  seriTakipli: false,
  seriKalemleri: [], // [{ seriNo, barkod, notlar }]
}

const bosOpsiyonForm = {
  satisciId: '',
  musteriAdi: '',
  miktar: '',
  bitisTarih: '',
  aciklama: '',
}

function stokKoduOlustur(mevcutlar) {
  const sayi = mevcutlar.length + 1
  return `STK${String(sayi).padStart(5, '0')}`
}

function Stok() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { kullanicilar } = useAuth()
  const dosyaRef = useRef(null)

  const [urunler, setUrunler] = useState([])
  const [hareketler, setHareketler] = useState([])
  const [kalemOzetleri, setKalemOzetleri] = useState(new Map())
  const [yukleniyor, setYukleniyor] = useState(true)
  const [form, setForm] = useState(bosForm)
  const [goster, setGoster] = useState(false)
  const [duzenleId, setDuzenleId] = useState(null)
  const [kodModu, setKodModu] = useState('otomatik')
  const [arama, setArama] = useState('')
  const [opsiyonModal, setOpsiyonModal] = useState(null)
  const [opsiyonForm, setOpsiyonForm] = useState(bosOpsiyonForm)
  const [excelOnizleme, setExcelOnizleme] = useState(null)
  const [excelHata, setExcelHata] = useState([])
  const [excelModal, setExcelModal] = useState(false)
  const [gorselYukleniyor, setGorselYukleniyor] = useState(false)
  const gorselRef = useRef(null)

  useEffect(() => {
    Promise.all([
      stokUrunleriniGetir(),
      stokHareketleriniGetir(),
      stokKalemOzetleriniGetir(),
    ]).then(([urunData, hareketData, kalemOzet]) => {
      setUrunler(urunData)
      setHareketler(hareketData)
      setKalemOzetleri(kalemOzet)
      setYukleniyor(false)
    })
  }, [])

  if (yukleniyor) return <div className="p-6 text-center text-gray-400">Yükleniyor...</div>

  const stokBakiye = (stokKodu) => {
    return hareketler
      .filter((h) => h.stokKodu === stokKodu)
      .reduce((toplam, h) => {
        if (h.hareketTipi === 'giris' || h.hareketTipi === 'transfer_giris') return toplam + Number(h.miktar)
        if (h.hareketTipi === 'cikis' || h.hareketTipi === 'transfer_cikis') return toplam - Number(h.miktar)
        return toplam
      }, 0)
  }

  const opsiyonluMiktar = (stokKodu) => {
    const opsiyonlar = JSON.parse(localStorage.getItem('stokOpsiyonlar') || '[]')
    return opsiyonlar
      .filter((o) => o.stokKodu === stokKodu && o.durum === 'aktif')
      .reduce((sum, o) => sum + Number(o.miktar), 0)
  }

  const sablonIndir = () => {
    const sablon = [
      {
        'Stok Kodu': 'STK00001',
        'Stok Adı': 'Örnek Ürün',
        'Birim': 'Adet',
        'Marka': 'Örnek Marka',
        'Grup Kodu': 'GENEL',
        'Min Stok': 10,
        'Mevcut Stok': 100,
        'Açıklama': 'Açıklama buraya',
      },
      {
        'Stok Kodu': '',
        'Stok Adı': 'Otomatik Kod İçin Boş Bırakın',
        'Birim': 'Metre',
        'Marka': '',
        'Grup Kodu': 'KABLO',
        'Min Stok': 50,
        'Mevcut Stok': 500,
        'Açıklama': '',
      },
    ]
    const ws = XLSX.utils.json_to_sheet(sablon)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Stok')
    ws['!cols'] = [
      { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 20 },
      { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 30 },
    ]
    XLSX.writeFile(wb, 'ZNA_Stok_Sablonu.xlsx')
  }

  const excelOku = (e) => {
    const dosya = e.target.files[0]
    if (!dosya) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const veri = new Uint8Array(ev.target.result)
        const wb = XLSX.read(veri, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const satirlar = XLSX.utils.sheet_to_json(ws)

        const hatalar = []
        const onizleme = satirlar.map((satir, i) => {
          const hataSatir = []

          if (!satir['Stok Adı']) hataSatir.push('Stok adı zorunlu')

          const birim = satir['Birim'] || 'Adet'
          if (!birimler.includes(birim)) hataSatir.push(`Geçersiz birim: ${birim}`)

          let stokKodu = satir['Stok Kodu'] || ''
          if (stokKodu) {
            const varMi = urunler.find((u) => u.stokKodu === stokKodu.toString().trim())
            if (varMi) hataSatir.push(`Stok kodu zaten var: ${stokKodu}`)
          }

          if (hataSatir.length > 0) {
            hatalar.push({ satir: i + 2, hatalar: hataSatir })
          }

          return {
            stokKodu: stokKodu.toString().trim(),
            stokAdi: satir['Stok Adı'] || '',
            birim: birim,
            marka: satir['Marka'] || '',
            grupKodu: satir['Grup Kodu'] || '',
            minStok: satir['Min Stok'] || '',
            ilkStok: satir['Mevcut Stok'] || '',
            aciklama: satir['Açıklama'] || '',
            hatalar: hataSatir,
          }
        })

        setExcelOnizleme(onizleme)
        setExcelHata(hatalar)
        setExcelModal(true)
      } catch (err) {
        alert('Excel dosyası okunamadı! Lütfen şablonu kullanın.')
      }
    }
    reader.readAsArrayBuffer(dosya)
    e.target.value = ''
  }

  const excelAktar = async () => {
    const gecerliSatirlar = excelOnizleme.filter((s) => s.hatalar.length === 0)
    if (gecerliSatirlar.length === 0) {
      alert('Aktarılacak geçerli satır yok!')
      return
    }

    const yeniUrunler = [...urunler]
    const yeniHareketler = [...hareketler]

    for (const satir of gecerliSatirlar) {
      const stokKodu = satir.stokKodu || stokKoduOlustur(yeniUrunler)
      const yeniUrun = await stokUrunEkle({
        stokKodu,
        stokAdi: satir.stokAdi,
        birim: satir.birim,
        marka: satir.marka,
        grupKodu: satir.grupKodu,
        minStok: satir.minStok,
        aciklama: satir.aciklama,
      })
      if (yeniUrun) yeniUrunler.push(yeniUrun)

      if (satir.ilkStok && Number(satir.ilkStok) > 0) {
        const yeniHareket = await stokHareketEkle({
          stokKodu,
          stokAdi: satir.stokAdi,
          hareketTipi: 'giris',
          miktar: Number(satir.ilkStok),
          aciklama: 'Excel ile toplu stok girişi',
          tarih: new Date().toISOString().split('T')[0],
        })
        if (yeniHareket) yeniHareketler.push(yeniHareket)
      }
    }

    setUrunler(yeniUrunler)
    setHareketler(yeniHareketler)

    setExcelModal(false)
    setExcelOnizleme(null)
    alert(`✅ ${gecerliSatirlar.length} ürün başarıyla aktarıldı!`)
  }

  const opsiyonAc = (u) => {
    setOpsiyonModal(u)
    setOpsiyonForm(bosOpsiyonForm)
  }

  const opsiyonKaydet = () => {
    if (!opsiyonForm.satisciId || !opsiyonForm.miktar || !opsiyonForm.bitisTarih) {
      alert('Satışçı, miktar ve bitiş tarihi zorunludur!')
      return
    }
    const bakiye = stokBakiye(opsiyonModal.stokKodu)
    const mevcutOpsiyon = opsiyonluMiktar(opsiyonModal.stokKodu)
    const kullanilabilir = bakiye - mevcutOpsiyon
    if (Number(opsiyonForm.miktar) > kullanilabilir) {
      alert(`Yetersiz stok! Kullanılabilir: ${kullanilabilir} ${opsiyonModal.birim}`)
      return
    }
    const satisci = kullanicilar.find((k) => k.id?.toString() === opsiyonForm.satisciId)
    const mevcutOpsiyonlar = JSON.parse(localStorage.getItem('stokOpsiyonlar') || '[]')
    const yeni = {
      ...opsiyonForm,
      id: crypto.randomUUID(),
      stokKodu: opsiyonModal.stokKodu,
      stokAdi: opsiyonModal.stokAdi,
      durum: 'aktif',
      satisciAd: satisci?.ad || '',
      olusturmaTarih: new Date().toISOString(),
      opsiyonNo: `OPS-${String(mevcutOpsiyonlar.length + 1).padStart(4, '0')}`,
    }
    localStorage.setItem('stokOpsiyonlar', JSON.stringify([...mevcutOpsiyonlar, yeni]))
    const bildirimler = JSON.parse(localStorage.getItem('bildirimler') || '[]')
    bildirimler.unshift({
      id: crypto.randomUUID(),
      aliciId: opsiyonForm.satisciId,
      baslik: 'Stok Opsiyonu Oluşturuldu',
      mesaj: `${opsiyonForm.miktar} adet ${opsiyonModal.stokAdi} ürünü için opsiyon oluşturuldu.`,
      tip: 'bilgi',
      link: '/stok-opsiyon',
      tarih: new Date().toISOString(),
      okundu: false,
    })
    localStorage.setItem('bildirimler', JSON.stringify(bildirimler))
    alert(`✅ Opsiyon oluşturuldu! (${yeni.opsiyonNo})`)
    setOpsiyonModal(null)
    setOpsiyonForm(bosOpsiyonForm)
  }

  const formAc = () => {
    setForm({ ...bosForm, stokKodu: stokKoduOlustur(urunler) })
    setKodModu('otomatik')
    setDuzenleId(null)
    setGoster(true)
  }

  const duzenleAc = (u) => {
    setForm({
      stokKodu: u.stokKodu,
      stokAdi: u.stokAdi,
      birim: u.birim,
      marka: u.marka || '',
      grupKodu: u.grupKodu || '',
      minStok: u.minStok || '',
      aciklama: u.aciklama || '',
      ilkStok: '',
      gorselUrl: u.gorselUrl || '',
      katalogdaGoster: u.katalogdaGoster !== false,
      model: '',
      seriTakipli: false,
      seriKalemleri: [],
    })
    setKodModu('manuel')
    setDuzenleId(u.id)
    setGoster(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const kaydet = async () => {
    if (!form.stokAdi || !form.stokKodu) {
      alert('Stok adı ve kodu zorunludur!')
      return
    }
    const kodVarMi = urunler.find((u) => u.stokKodu === form.stokKodu && u.id !== duzenleId)
    if (kodVarMi) {
      alert('Bu stok kodu zaten kullanılıyor!')
      return
    }
    if (duzenleId) {
      const { ilkStok, ...updateForm } = form
      const guncellendi = await stokUrunGuncelle(duzenleId, updateForm)
      if (guncellendi) {
        setUrunler(prev => prev.map(u => u.id === duzenleId ? guncellendi : u))
        // Stok düzeltmesi yapılacak mı?
        if (ilkStok !== '' && Number(ilkStok) >= 0) {
          const mevcutBakiye = stokBakiye(form.stokKodu)
          const yeniMiktar = Number(ilkStok)
          const fark = yeniMiktar - mevcutBakiye
          if (fark !== 0) {
            const yeniHareket = await stokHareketEkle({
              stokKodu: form.stokKodu,
              stokAdi: form.stokAdi,
              hareketTipi: fark > 0 ? 'giris' : 'cikis',
              miktar: Math.abs(fark),
              aciklama: 'Stok düzeltmesi',
              tarih: new Date().toISOString().split('T')[0],
            })
            if (yeniHareket) setHareketler(prev => [...prev, yeniHareket])
          }
        }
        toast.success('Ürün güncellendi.')
      } else {
        toast.error('Ürün güncellenemedi. Konsolu kontrol edin.')
        return
      }
    } else {
      const { ilkStok, seriTakipli, seriKalemleri, model, ...insertForm } = form
      const yeniUrun = await stokUrunEkle(insertForm)
      if (yeniUrun) {
        setUrunler(prev => [...prev, yeniUrun])
        // S/N takipli donanım ise her kalem için stok_kalemleri'ne satır ekle
        if (seriTakipli && seriKalemleri.length > 0) {
          const gecerli = seriKalemleri.filter(k => k.seriNo?.trim())
          if (gecerli.length > 0) {
            try {
              const hazir = gecerli.map(k => ({
                stokKodu: form.stokKodu,
                seriNo: k.seriNo.trim(),
                barkod: k.barkod?.trim() || null,
                marka: form.marka || null,
                model: model || form.stokAdi,
                durum: 'depoda',
                notlar: k.notlar?.trim() || null,
              }))
              await stokKalemleriToplu(hazir)
              // Özet map'ini güncelle
              const yeniOzet = await stokKalemOzetleriniGetir()
              setKalemOzetleri(yeniOzet)
              toast.success(`${gecerli.length} adet S/N kaydedildi.`)
            } catch (e) {
              toast.error('S/N kayıtlarında hata oluştu.')
            }
          }
        } else if (form.ilkStok && Number(form.ilkStok) > 0) {
          // Toplu stokta ilk giriş hareketi oluştur
          const yeniHareket = await stokHareketEkle({
            stokKodu: form.stokKodu,
            stokAdi: form.stokAdi,
            hareketTipi: 'giris',
            miktar: Number(form.ilkStok),
            aciklama: 'İlk stok girişi',
            tarih: new Date().toISOString().split('T')[0],
          })
          if (yeniHareket) setHareketler(prev => [...prev, yeniHareket])
        }
        toast.success('Ürün kaydedildi.')
      } else {
        toast.error('Ürün kaydedilemedi. Konsolu kontrol edin.')
        return
      }
    }
    setForm(bosForm)
    setDuzenleId(null)
    setGoster(false)
  }

  const iptal = () => {
    setForm(bosForm)
    setDuzenleId(null)
    setGoster(false)
  }

  const urunSil = async (id) => {
    await stokUrunSil(id)
    setUrunler(prev => prev.filter(u => u.id !== id))
    toast.success('Ürün silindi.')
  }

  const gorunenUrunler = urunler.filter((u) =>
    arama === '' ||
    `${u.stokKodu} ${u.stokAdi} ${u.marka} ${u.grupKodu}`
      .toLowerCase()
      .includes(arama.toLowerCase())
  )

  return (
    <div className="p-6">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Stok Kartları</h2>
          <p className="text-sm text-gray-400 mt-1">{urunler.length} ürün kayıtlı</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={sablonIndir}
            className="text-sm px-4 py-2 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition"
          >
            📥 Excel Şablonu
          </button>
          <button
            onClick={() => dosyaRef.current?.click()}
            className="text-sm px-4 py-2 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition"
          >
            📤 Excel'den Aktar
          </button>
          <input
            ref={dosyaRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={excelOku}
            className="hidden"
          />
          <button
            onClick={() => navigate('/stok-opsiyon')}
            className="text-sm px-4 py-2 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition"
          >
            📋 Opsiyonlar
          </button>
          <button
            onClick={() => navigate('/stok-hareketleri')}
            className="text-sm px-4 py-2 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition"
          >
            Stok Hareketleri
          </button>
          <button
            onClick={formAc}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            + Yeni Ürün
          </button>
        </div>
      </div>

      <div className="mb-6">
        <input
          type="text"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Stok kodu, adı veya marka ara..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {goster && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-blue-100">
          <h3 className="font-medium text-gray-800 mb-4">
            {duzenleId ? 'Ürünü Düzenle' : 'Yeni Stok Kartı'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Stok Kodu *</label>
              {!duzenleId && (
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => { setKodModu('otomatik'); setForm({ ...form, stokKodu: stokKoduOlustur(urunler) }) }}
                    className={`text-xs px-3 py-1 rounded-lg border transition ${kodModu === 'otomatik' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}
                  >Otomatik</button>
                  <button
                    onClick={() => { setKodModu('manuel'); setForm({ ...form, stokKodu: '' }) }}
                    className={`text-xs px-3 py-1 rounded-lg border transition ${kodModu === 'manuel' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}
                  >Manuel</button>
                </div>
              )}
              {kodModu === 'otomatik' && !duzenleId ? (
                <span className="text-sm font-mono bg-blue-50 text-blue-700 px-3 py-2 rounded-lg block">{form.stokKodu}</span>
              ) : (
                <input type="text" value={form.stokKodu} onChange={(e) => setForm({ ...form, stokKodu: e.target.value.toUpperCase() })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="STK00001" />
              )}
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-gray-600 mb-1 block">Stok Adı *</label>
              <input type="text" value={form.stokAdi} onChange={(e) => setForm({ ...form, stokAdi: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ürün adı" />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Birim</label>
              <CustomSelect value={form.birim} onChange={(e) => setForm({ ...form, birim: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {birimler.map((b) => <option key={b} value={b}>{b}</option>)}
              </CustomSelect>
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Marka</label>
              <input type="text" value={form.marka} onChange={(e) => setForm({ ...form, marka: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Marka adı" />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Grup Kodu</label>
              <input
                type="text"
                value={form.grupKodu}
                onChange={(e) => setForm({ ...form, grupKodu: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Kamera, Kablo, Bariyer..."
              />
              {/* Hızlı seçim çipleri: önerilen + daha önce kayıtlı olanlar */}
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {Array.from(new Set([
                  'Kamera', 'Kablo', 'NVR', 'Aksesuar',
                  ...urunler.map(u => u.grupKodu).filter(Boolean),
                ])).map(g => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setForm({ ...form, grupKodu: g })}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                      form.grupKodu === g
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Min. Stok Uyarı</label>
              <input type="number" value={form.minStok} onChange={(e) => setForm({ ...form, minStok: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" min="0" />
            </div>
            {!duzenleId ? (
              <div>
                <label className="text-sm text-gray-600 mb-1 block">
                  Mevcut Stok Miktarı
                  <span className="ml-1 text-xs text-gray-400">(Depoda var olan)</span>
                </label>
                <input type="number" value={form.ilkStok} onChange={(e) => setForm({ ...form, ilkStok: e.target.value })}
                  className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" placeholder="0" min="0" />
                <p className="text-xs text-green-600 mt-1">Otomatik stok girişi oluşturulur</p>
              </div>
            ) : (
              <div>
                <label className="text-sm text-gray-600 mb-1 block">
                  Stok Düzeltme
                  <span className="ml-1 text-xs text-gray-400">(Mevcut: <strong>{stokBakiye(form.stokKodu)}</strong> {form.birim})</span>
                </label>
                <input type="number" value={form.ilkStok} onChange={(e) => setForm({ ...form, ilkStok: e.target.value })}
                  className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="Yeni miktar girin..." min="0" />
                <p className="text-xs text-amber-600 mt-1">Boş bırakırsanız stok miktarı değişmez</p>
              </div>
            )}
            <div className="md:col-span-2">
              <label className="text-sm text-gray-600 mb-1 block">Açıklama</label>
              <input type="text" value={form.aciklama} onChange={(e) => setForm({ ...form, aciklama: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ürün hakkında kısa açıklama..." />
            </div>

            {/* Görsel Yükleme */}
            <div className="md:col-span-3">
              <label className="text-sm text-gray-600 mb-1 block">Ürün Görseli <span className="text-gray-400 font-normal">(müşteri katalogunda görünür)</span></label>
              <div className="flex items-start gap-4">
                {/* Önizleme */}
                <div
                  className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0 cursor-pointer hover:border-blue-300 transition"
                  onClick={() => gorselRef.current?.click()}
                >
                  {form.gorselUrl ? (
                    <img src={form.gorselUrl} alt="görsel" className="w-full h-full object-contain p-1" />
                  ) : (
                    <div className="text-center">
                      <span className="text-2xl">📷</span>
                      <p className="text-xs text-gray-400 mt-1">Görsel Ekle</p>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  {/* Dosya yükle */}
                  <button
                    type="button"
                    onClick={() => gorselRef.current?.click()}
                    disabled={gorselYukleniyor || !form.stokKodu}
                    className="text-sm px-4 py-2 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {gorselYukleniyor ? '⏳ Yükleniyor...' : '📤 Dosya Seç'}
                  </button>
                  {!form.stokKodu && <p className="text-xs text-amber-500">Önce stok kodu belirlenmeli</p>}

                  {/* URL ile ekle */}
                  <input
                    type="url"
                    value={form.gorselUrl}
                    onChange={(e) => setForm({ ...form, gorselUrl: e.target.value })}
                    placeholder="veya görsel URL'si girin..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />

                  {form.gorselUrl && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, gorselUrl: '' })}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      ✕ Görseli Kaldır
                    </button>
                  )}
                </div>
              </div>

              {/* Katalogda göster toggle */}
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.katalogdaGoster}
                  onChange={(e) => setForm({ ...form, katalogdaGoster: e.target.checked })}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span className="text-sm text-gray-600">Müşteri katalogunda göster</span>
              </label>

              {/* ── S/N TAKİPLİ DONANIM ── */}
              {!duzenleId && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.seriTakipli}
                      onChange={(e) => setForm({ ...form, seriTakipli: e.target.checked, seriKalemleri: e.target.checked ? [{ seriNo: '', barkod: '', notlar: '' }] : [] })}
                      className="w-4 h-4 rounded accent-indigo-600"
                    />
                    <span className="text-sm font-semibold text-gray-700">🔖 Bu donanım S/N takipli (kamera, NVR, cihaz...)</span>
                  </label>

                  {form.seriTakipli && (
                    <div className="mt-3 p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">Model</label>
                          <input
                            type="text"
                            value={form.model}
                            onChange={(e) => setForm({ ...form, model: e.target.value })}
                            placeholder="Örn: DS-2CD2143G2-IS"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                          <p className="text-xs text-gray-400 mt-1">Tüm S/N'ler bu modele atanacak</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
                          Seri Numaraları ({form.seriKalemleri.length})
                        </p>
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, seriKalemleri: [...form.seriKalemleri, { seriNo: '', barkod: '', notlar: '' }] })}
                          className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-700 transition"
                        >
                          + Satır Ekle
                        </button>
                      </div>

                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {form.seriKalemleri.map((k, i) => (
                          <div key={i} className="grid grid-cols-12 gap-2 items-start bg-white p-2 rounded-lg border border-indigo-100">
                            <div className="col-span-4">
                              <input
                                type="text"
                                value={k.seriNo}
                                onChange={(e) => {
                                  const yeni = [...form.seriKalemleri]
                                  yeni[i] = { ...yeni[i], seriNo: e.target.value }
                                  setForm({ ...form, seriKalemleri: yeni })
                                }}
                                placeholder="S/N (zorunlu)"
                                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                              />
                            </div>
                            <div className="col-span-3">
                              <input
                                type="text"
                                value={k.barkod}
                                onChange={(e) => {
                                  const yeni = [...form.seriKalemleri]
                                  yeni[i] = { ...yeni[i], barkod: e.target.value }
                                  setForm({ ...form, seriKalemleri: yeni })
                                }}
                                placeholder="Barkod (opsiyonel)"
                                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                              />
                            </div>
                            <div className="col-span-4">
                              <input
                                type="text"
                                value={k.notlar}
                                onChange={(e) => {
                                  const yeni = [...form.seriKalemleri]
                                  yeni[i] = { ...yeni[i], notlar: e.target.value }
                                  setForm({ ...form, seriKalemleri: yeni })
                                }}
                                placeholder="Not (opsiyonel)"
                                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                              />
                            </div>
                            <div className="col-span-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  const yeni = form.seriKalemleri.filter((_, idx) => idx !== i)
                                  setForm({ ...form, seriKalemleri: yeni.length > 0 ? yeni : [{ seriNo: '', barkod: '', notlar: '' }] })
                                }}
                                className="text-red-400 hover:text-red-600 px-2 py-1 text-sm"
                                title="Sil"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <p className="text-xs text-indigo-500 mt-3 italic">
                        💡 Her kalem "Depoda" durumunda eklenecek. Tüm cihazlar mobil uygulamada barkod ile bulunabilir.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <input
                ref={gorselRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files[0]
                  if (!file || !form.stokKodu) return
                  setGorselYukleniyor(true)
                  const url = await gorselYukle(file, form.stokKodu)
                  if (url) setForm(prev => ({ ...prev, gorselUrl: url }))
                  else toast.error('Görsel yüklenemedi.')
                  setGorselYukleniyor(false)
                  e.target.value = ''
                }}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={kaydet} className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 transition">
              {duzenleId ? 'Güncelle' : 'Kaydet'}
            </button>
            <button onClick={iptal} className="text-sm px-5 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition">İptal</button>
          </div>
        </div>
      )}

      {/* Excel Önizleme Modal */}
      {excelModal && excelOnizleme && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 max-h-screen overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">Excel Önizleme</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {excelOnizleme.filter((s) => s.hatalar.length === 0).length} geçerli,{' '}
                  {excelOnizleme.filter((s) => s.hatalar.length > 0).length} hatalı satır
                </p>
              </div>
              <button onClick={() => setExcelModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {excelHata.length > 0 && (
              <div className="px-6 py-3 bg-red-50 border-b border-red-100">
                <p className="text-xs font-medium text-red-700 mb-1">⚠️ Hatalı satırlar aktarılmayacak:</p>
                {excelHata.map((h, i) => (
                  <p key={i} className="text-xs text-red-600">{h.satir}. satır: {h.hatalar.join(', ')}</p>
                ))}
              </div>
            )}

            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-400 uppercase">
                    <th className="text-left px-4 py-3">Durum</th>
                    <th className="text-left px-4 py-3">Stok Kodu</th>
                    <th className="text-left px-4 py-3">Stok Adı</th>
                    <th className="text-left px-4 py-3">Birim</th>
                    <th className="text-left px-4 py-3">Marka</th>
                    <th className="text-left px-4 py-3">Grup</th>
                    <th className="text-right px-4 py-3">Min Stok</th>
                    <th className="text-right px-4 py-3">Mevcut</th>
                  </tr>
                </thead>
                <tbody>
                  {excelOnizleme.map((satir, i) => (
                    <tr key={i} className={`border-t border-gray-100 ${satir.hatalar.length > 0 ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                      <td className="px-4 py-2">
                        {satir.hatalar.length > 0 ? (
                          <span className="text-xs text-red-500" title={satir.hatalar.join(', ')}>❌ Hatalı</span>
                        ) : (
                          <span className="text-xs text-green-600">✅ Geçerli</span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-600">{satir.stokKodu || '(otomatik)'}</td>
                      <td className="px-4 py-2 font-medium text-gray-800">{satir.stokAdi}</td>
                      <td className="px-4 py-2 text-gray-600">{satir.birim}</td>
                      <td className="px-4 py-2 text-gray-600">{satir.marka || '—'}</td>
                      <td className="px-4 py-2 text-gray-600">{satir.grupKodu || '—'}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{satir.minStok || '—'}</td>
                      <td className="px-4 py-2 text-right font-medium text-green-700">{satir.ilkStok || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={() => setExcelModal(false)} className="text-sm px-5 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition">
                İptal
              </button>
              <button
                onClick={excelAktar}
                disabled={excelOnizleme.filter((s) => s.hatalar.length === 0).length === 0}
                className="bg-green-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-green-700 transition disabled:opacity-40"
              >
                {excelOnizleme.filter((s) => s.hatalar.length === 0).length} Ürünü Aktar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opsiyon Modal */}
      {opsiyonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">📋 Stok Opsiyonla</h3>
              <button onClick={() => setOpsiyonModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm font-medium text-blue-800">{opsiyonModal.stokAdi}</p>
              <p className="text-xs text-blue-600 font-mono mb-2">{opsiyonModal.stokKodu}</p>
              <div className="flex gap-4">
                <div className="text-center">
                  <p className="text-xs text-gray-500">Toplam</p>
                  <p className="text-sm font-bold text-gray-800">{stokBakiye(opsiyonModal.stokKodu)} {opsiyonModal.birim}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">Opsiyonlu</p>
                  <p className="text-sm font-bold text-amber-500">{opsiyonluMiktar(opsiyonModal.stokKodu)} {opsiyonModal.birim}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">Kullanılabilir</p>
                  <p className="text-sm font-bold text-green-600">{stokBakiye(opsiyonModal.stokKodu) - opsiyonluMiktar(opsiyonModal.stokKodu)} {opsiyonModal.birim}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Satışçı *</label>
                <CustomSelect value={opsiyonForm.satisciId} onChange={(e) => setOpsiyonForm({ ...opsiyonForm, satisciId: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Satışçı seç...</option>
                  {kullanicilar.map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}
                </CustomSelect>
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Müşteri Adı</label>
                <input type="text" value={opsiyonForm.musteriAdi} onChange={(e) => setOpsiyonForm({ ...opsiyonForm, musteriAdi: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Müşteri firma adı" />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Miktar * ({opsiyonModal.birim})</label>
                <input type="number" value={opsiyonForm.miktar} onChange={(e) => setOpsiyonForm({ ...opsiyonForm, miktar: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" min="1" />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Bitiş Tarihi *</label>
                <input type="date" value={opsiyonForm.bitisTarih} onChange={(e) => setOpsiyonForm({ ...opsiyonForm, bitisTarih: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min={new Date().toISOString().split('T')[0]} />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Açıklama</label>
                <textarea value={opsiyonForm.aciklama} onChange={(e) => setOpsiyonForm({ ...opsiyonForm, aciklama: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} placeholder="Notlar..." />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={opsiyonKaydet} className="flex-1 bg-purple-600 text-white text-sm py-2 rounded-lg hover:bg-purple-700 transition font-medium">
                Opsiyonla
              </button>
              <button onClick={() => setOpsiyonModal(null)} className="flex-1 text-sm py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition">
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Liste */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wide">
          <div className="col-span-2">Stok Kodu</div>
          <div className="col-span-3">Stok Adı</div>
          <div className="col-span-1">Birim</div>
          <div className="col-span-1">Marka</div>
          <div className="col-span-1">Grup</div>
          <div className="col-span-1">Bakiye</div>
          <div className="col-span-1">Opsiyonlu</div>
          <div className="col-span-1">Boş</div>
          <div className="col-span-1"></div>
        </div>

        {gorunenUrunler.length === 0 && (
          <div className="p-10 text-center text-gray-400 text-sm">
            {arama ? 'Arama sonucu bulunamadı.' : 'Henüz ürün eklenmedi.'}
          </div>
        )}

        {gorunenUrunler.map((u) => {
          const bakiye = stokBakiye(u.stokKodu)
          const opsiyon = opsiyonluMiktar(u.stokKodu)
          const bos = bakiye - opsiyon
          const kritik = u.minStok && bakiye <= Number(u.minStok)
          const kalemOzet = kalemOzetleri.get(u.stokKodu)
          const seriTakipli = !!kalemOzet
          const gosterilenMarka = kalemOzet?.marka || u.marka || ''
          const gosterilenModel = kalemOzet?.model || ''
          return (
            <div
              key={u.id}
              className={`grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition items-center ${kritik ? 'bg-red-50' : ''} ${seriTakipli ? 'cursor-pointer' : ''}`}
              onClick={seriTakipli ? () => navigate(`/stok/model/${encodeURIComponent(u.stokKodu)}`) : undefined}
            >
              <div className="col-span-2">
                <span className="text-xs font-mono text-gray-600">{u.stokKodu}</span>
                {seriTakipli && (
                  <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-semibold">S/N</span>
                )}
              </div>
              <div className="col-span-3 flex items-center gap-2">
                {u.gorselUrl ? (
                  <img src={u.gorselUrl} alt="" className="w-8 h-8 rounded object-contain border border-gray-100 flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-300 text-xs">📷</div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{u.stokAdi}</p>
                  {gosterilenModel && (
                    <p className="text-xs text-indigo-500 truncate">📱 {gosterilenModel}</p>
                  )}
                  {!gosterilenModel && u.aciklama && <p className="text-xs text-gray-400 truncate">{u.aciklama}</p>}
                </div>
              </div>
              <div className="col-span-1">
                <span className="text-xs text-gray-500">{u.birim}</span>
              </div>
              <div className="col-span-1">
                <span className="text-xs text-gray-500 truncate block">{gosterilenMarka || '—'}</span>
              </div>
              <div className="col-span-1">
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{u.grupKodu || '—'}</span>
              </div>
              <div className="col-span-1">
                <span className={`text-sm font-semibold ${kritik ? 'text-red-500' : 'text-gray-800'}`}>{bakiye.toFixed(0)}</span>
              </div>
              <div className="col-span-1">
                {opsiyon > 0 ? (
                  <span className="text-sm font-semibold text-amber-500">{opsiyon}</span>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </div>
              <div className="col-span-1">
                <span className={`text-sm font-semibold ${bos <= 0 ? 'text-red-500' : 'text-green-600'}`}>{bos.toFixed(0)}</span>
              </div>
              <div className="col-span-1 flex gap-1 justify-end">
                <button onClick={(e) => { e.stopPropagation(); opsiyonAc(u) }} className="text-xs text-purple-500 hover:text-purple-700 border border-purple-200 rounded-lg px-2 py-1 transition" title="Opsiyonla">📋</button>
                <button onClick={(e) => { e.stopPropagation(); duzenleAc(u) }} className="text-xs text-blue-400 hover:text-blue-600 border border-blue-100 rounded-lg px-2 py-1 transition" title="Düzenle">✏️</button>
                <button onClick={(e) => { e.stopPropagation(); urunSil(u.id) }} className="text-xs text-red-400 hover:text-red-600 border border-red-100 rounded-lg px-2 py-1 transition" title="Sil">🗑️</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Stok
