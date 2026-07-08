import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  Plus, Pencil, Trash2, Package, Upload, Download, ClipboardList,
  ArrowLeftRight, Image as ImageIcon, AlertTriangle, X, Tag, Hash,
} from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import {
  stokUrunleriniGetir, stokUrunEkle, stokUrunGuncelle, stokUrunSil,
  stokHareketleriniGetir, stokHareketEkle, gorselYukle,
  stokKalemOzetleriniGetir, stokKalemleriToplu,
  tumSeriNumaralariniGetir, modelKalemleriniGetir,
} from '../services/stokService'
import { AlertTriangle as AlertIkon } from 'lucide-react'
import CustomSelect from '../components/CustomSelect'
import { SkeletonList } from '../components/Skeleton'
import { trContains } from '../lib/trSearch'
import {
  Button, SearchInput, Input, Textarea, Label,
  Card, Badge, CodeBadge, EmptyState, Modal, KPICard, Alert,
  Table, THead, TBody, TR, TH, TD,
} from '../components/ui'

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
  seriKalemleri: [],
  topluSN: '',  // Düzenleme modunda toplu SN yapıştırma
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
  const [sayfa, setSayfa] = useState(1)
  const [sayfaBoyutu, setSayfaBoyutu] = useState(50)
  const [opsiyonModal, setOpsiyonModal] = useState(null)
  const [opsiyonForm, setOpsiyonForm] = useState(bosOpsiyonForm)
  const [excelOnizleme, setExcelOnizleme] = useState(null)
  const [excelHata, setExcelHata] = useState([])
  const [excelModal, setExcelModal] = useState(false)
  const [gorselYukleniyor, setGorselYukleniyor] = useState(false)
  const gorselRef = useRef(null)
  // SN duplicate kontrolü — düzenleme modunda yüklenen mevcut SN'ler + global map
  const [urunSNSet, setUrunSNSet] = useState(new Set())  // bu üründeki SN'ler
  const [globalSN, setGlobalSN] = useState(new Map())  // seri_no.lower → stok_kodu

  // Yeni ürün modunda da seriTakipli açılınca globalSN yükle (duplicate kontrolü için)
  useEffect(() => {
    if (form.seriTakipli && !duzenleId && globalSN.size === 0) {
      tumSeriNumaralariniGetir()
        .then(gmap => setGlobalSN(gmap || new Map()))
        .catch(() => {})
    }
  }, [form.seriTakipli, duzenleId])

  useEffect(() => {
    Promise.all([
      stokUrunleriniGetir(),
      stokHareketleriniGetir(),
      stokKalemOzetleriniGetir(),
    ])
      .then(([urunData, hareketData, kalemOzet]) => {
        setUrunler(urunData || [])
        setHareketler(hareketData || [])
        setKalemOzetleri(kalemOzet || new Map())
      })
      .catch(err => console.error('[Stok yükle]', err))
      .finally(() => setYukleniyor(false))
  }, [])

  const stokBakiye = (stokKodu) => {
    // SN takipli ürün: gerçek stok = SN sayısı (hurda hariç), 0 dahil
    // Ürün seriTakipli ise hareket sayısına DOKUNMA. SN silinince kalem düşer,
    // hareket kalır — o yüzden seriTakipli ürüne hareket bazlı fallback yanlış.
    const urun = urunler.find(u => u.stokKodu === stokKodu)
    if (urun?.seriTakipli) {
      const kalemOzet = kalemOzetleri.get(stokKodu)
      const toplam = Number(kalemOzet?.toplam) || 0
      const hurda = Number(kalemOzet?.hurda) || 0
      return Math.max(0, toplam - hurda)
    }
    // SN takipsiz: hareket bazlı sayı
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
          if (hataSatir.length > 0) hatalar.push({ satir: i + 2, hatalar: hataSatir })

          return {
            stokKodu: stokKodu.toString().trim(),
            stokAdi: satir['Stok Adı'] || '',
            birim,
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
        toast.error('Excel dosyası okunamadı. Lütfen şablonu kullanın.')
      }
    }
    reader.readAsArrayBuffer(dosya)
    e.target.value = ''
  }

  const excelAktar = async () => {
    const gecerliSatirlar = excelOnizleme.filter((s) => s.hatalar.length === 0)
    if (gecerliSatirlar.length === 0) {
      toast.error('Aktarılacak geçerli satır yok.')
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
    toast.success(`${gecerliSatirlar.length} ürün aktarıldı.`)
  }

  const opsiyonAc = (u) => {
    setOpsiyonModal(u)
    setOpsiyonForm(bosOpsiyonForm)
  }

  const opsiyonKaydet = () => {
    if (!opsiyonForm.satisciId || !opsiyonForm.miktar || !opsiyonForm.bitisTarih) {
      toast.error('Satışçı, miktar ve bitiş tarihi zorunludur.')
      return
    }
    const bakiye = stokBakiye(opsiyonModal.stokKodu)
    const mevcutOpsiyon = opsiyonluMiktar(opsiyonModal.stokKodu)
    const kullanilabilir = bakiye - mevcutOpsiyon
    if (Number(opsiyonForm.miktar) > kullanilabilir) {
      toast.error(`Yetersiz stok. Kullanılabilir: ${kullanilabilir} ${opsiyonModal.birim}`)
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
    toast.success(`Opsiyon oluşturuldu (${yeni.opsiyonNo}).`)
    setOpsiyonModal(null)
    setOpsiyonForm(bosOpsiyonForm)
  }

  const formAc = () => {
    setForm({ ...bosForm, stokKodu: stokKoduOlustur(urunler) })
    setKodModu('otomatik')
    setDuzenleId(null)
    setGoster(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
      model: u.model || '',
      seriTakipli: !!u.seriTakipli,  // DB'den gerçek değeri al
      seriKalemleri: [],
      topluSN: '',
    })
    setKodModu('manuel')
    setDuzenleId(u.id)
    setGoster(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    // SN takipli üründe düzenleme açılınca mevcut SN'leri ve global SN map'ini yükle
    if (u.seriTakipli) {
      Promise.all([
        modelKalemleriniGetir(u.stokKodu),
        tumSeriNumaralariniGetir(),
      ])
        .then(([arr, gmap]) => {
          setUrunSNSet(new Set((arr || []).filter(k => k.seriNo).map(k => k.seriNo.trim().toLowerCase())))
          setGlobalSN(gmap || new Map())
        })
        .catch(() => { setUrunSNSet(new Set()); setGlobalSN(new Map()) })
    } else {
      setUrunSNSet(new Set())
      setGlobalSN(new Map())
    }
  }

  // Toplu SN analizi (yeni/bu ürün/başka ürün/tekrar)
  const topluSNAnaliz = (() => {
    const lines = (form.topluSN || '').split('\n').map(s => s.trim()).filter(Boolean)
    const yeni = [], buUrunde = [], baskaUrunde = [], tekrar = []
    const goruldu = new Set()
    for (const s of lines) {
      const k = s.toLowerCase()
      if (goruldu.has(k)) { tekrar.push(s); continue }
      goruldu.add(k)
      if (urunSNSet.has(k)) { buUrunde.push(s); continue }
      const digerStok = globalSN.get(k)
      if (digerStok && digerStok !== form.stokKodu) {
        baskaUrunde.push({ sn: s, stokKodu: digerStok })
        continue
      }
      yeni.push(s)
    }
    return { yeni, buUrunde, baskaUrunde, tekrar }
  })()

  const kaydet = async () => {
    if (!form.stokAdi || !form.stokKodu) {
      toast.error('Stok adı ve kodu zorunludur.')
      return
    }
    const kodVarMi = urunler.find((u) => u.stokKodu === form.stokKodu && u.id !== duzenleId)
    if (kodVarMi) {
      toast.error('Bu stok kodu zaten kullanılıyor.')
      return
    }
    if (duzenleId) {
      const { ilkStok, topluSN, seriKalemleri, ...updateForm } = form
      const guncellendi = await stokUrunGuncelle(duzenleId, updateForm)
      if (guncellendi) {
        setUrunler(prev => prev.map(u => u.id === duzenleId ? guncellendi : u))

        // Toplu S/N ekleme — seri_takipli ürünler için
        // DUPLICATE FİLTRE: sadece "yeni" olanları ekle (analiz sonucundan)
        if (form.seriTakipli && topluSN?.trim()) {
          const snListesi = topluSNAnaliz.yeni  // filtrelenmiş: sadece yeni ve unique
          if (snListesi.length > 0) {
            try {
              const hazir = snListesi.map(sn => ({
                stokKodu: form.stokKodu,
                seriNo: sn,
                barkod: null,
                marka: form.marka || null,
                model: form.model || form.stokAdi,
                durum: 'depoda',
                notlar: null,
              }))
              await stokKalemleriToplu(hazir)
              const yeniOzet = await stokKalemOzetleriniGetir()
              setKalemOzetleri(yeniOzet)
              // Hareket kaydı ekle (giriş)
              await stokHareketEkle({
                stokKodu: form.stokKodu,
                stokAdi: form.stokAdi,
                hareketTipi: 'giris',
                miktar: snListesi.length,
                aciklama: `S/N ile toplu giriş (${snListesi.length} adet)`,
                tarih: new Date().toISOString().split('T')[0],
              })
              toast.success(`${snListesi.length} adet S/N kaydedildi.`)
            } catch (e) {
              toast.error(e?.message || 'S/N kaydedilirken bir sorun oldu.')
            }
          }
        } else if (ilkStok !== '' && Number(ilkStok) >= 0) {
          // Seri takipsiz — sadece sayaç düzeltmesi
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
        toast.error('Ürün güncellenemedi.')
        return
      }
    } else {
      // BUG FIX: seriTakipli ve model DB'ye yazılmalı, sadece frontend-only alanları çıkar
      const { ilkStok, topluSN, seriKalemleri, ...insertForm } = form
      const yeniUrun = await stokUrunEkle(insertForm)
      if (yeniUrun) {
        setUrunler(prev => [...prev, yeniUrun])
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
              const yeniOzet = await stokKalemOzetleriniGetir()
              setKalemOzetleri(yeniOzet)
              toast.success(`${gecerli.length} adet S/N kaydedildi.`)
            } catch (e) {
              toast.error(e?.message || 'S/N kaydedilirken bir sorun oldu.')
            }
          }
        } else if (form.ilkStok && Number(form.ilkStok) > 0) {
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
        toast.error('Ürün kaydedilemedi.')
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
    trContains(`${u.stokKodu || ''} ${u.stokAdi || ''} ${u.marka || ''} ${u.grupKodu || ''}`, arama)
  )

  const toplamSayfa = Math.max(1, Math.ceil(gorunenUrunler.length / sayfaBoyutu))
  const aktifSayfa = Math.min(sayfa, toplamSayfa)
  const sayfadakiUrunler = gorunenUrunler.slice(
    (aktifSayfa - 1) * sayfaBoyutu,
    aktifSayfa * sayfaBoyutu,
  )

  useEffect(() => { setSayfa(1) }, [arama, sayfaBoyutu])

  const toplamUrun = urunler.length
  const toplamBakiye = urunler.reduce((sum, u) => sum + stokBakiye(u.stokKodu), 0)
  const kritikSayi = urunler.filter(u => u.minStok && stokBakiye(u.stokKodu) <= Number(u.minStok)).length
  const seriTakipliSayi = kalemOzetleri.size

  if (yukleniyor) {
    return <SkeletonList />
  }

  const gecerliExcelSayi = excelOnizleme?.filter(s => s.hatalar.length === 0).length || 0
  const hataliExcelSayi = excelOnizleme?.filter(s => s.hatalar.length > 0).length || 0

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>
      {/* Header — kompakt tek satır */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <h1 className="t-h2" style={{ margin: 0 }}>Stok Kartları</h1>
          <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
            <span className="tabular-nums">{toplamUrun}</span> ürün
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button variant="tertiary" size="sm" iconLeft={<Download size={13} strokeWidth={1.5} />} onClick={sablonIndir}>Şablon</Button>
          <Button variant="tertiary" size="sm" iconLeft={<Upload size={13} strokeWidth={1.5} />} onClick={() => dosyaRef.current?.click()}>Excel aktar</Button>
          <input ref={dosyaRef} type="file" accept=".xlsx,.xls" onChange={excelOku} style={{ display: 'none' }} />
          <Button variant="secondary" size="sm" iconLeft={<ClipboardList size={13} strokeWidth={1.5} />} onClick={() => navigate('/stok-opsiyon')}>Opsiyonlar</Button>
          <Button variant="secondary" size="sm" iconLeft={<ArrowLeftRight size={13} strokeWidth={1.5} />} onClick={() => navigate('/stok-hareketleri')}>Hareketler</Button>
          <Button variant="primary" size="sm" iconLeft={<Plus size={13} strokeWidth={1.5} />} onClick={formAc}>Yeni ürün</Button>
        </div>
      </div>

      {/* KPI — kompakt yatay şerit */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 4,
        padding: '6px 10px',
        background: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        marginBottom: 10,
        alignItems: 'stretch',
      }}>
        {[
          { l: 'Toplam ürün',        v: toplamUrun,                 ton: 'var(--text-primary)',   Icon: Package },
          { l: 'Toplam stok bakiye', v: Math.round(toplamBakiye),   ton: 'var(--text-primary)',   Icon: Hash },
          { l: 'Kritik seviye',      v: kritikSayi,                 ton: kritikSayi > 0 ? 'var(--danger)' : 'var(--text-tertiary)',    Icon: AlertTriangle },
          { l: 'S/N takipli',        v: seriTakipliSayi,            ton: 'var(--text-secondary)', Icon: Tag },
        ].map((k, i, arr) => [
          <div key={k.l} style={{ padding: '4px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <k.Icon size={13} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
            <span style={{ font: '500 10px/14px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{k.l}</span>
            <span style={{ font: '700 14px/18px var(--font-sans)', color: k.ton, fontVariantNumeric: 'tabular-nums' }}>{k.v}</span>
          </div>,
          i < arr.length - 1 && (
            <span key={`sep-${i}`} style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-default)' }} />
          ),
        ])}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 240, maxWidth: 480 }}>
          <SearchInput
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="Stok kodu, adı veya marka ara…"
          />
        </div>
      </div>

      {/* Form card */}
      {goster && (
        <Card style={{ marginBottom: 16 }}>
          <h2 className="t-h2" style={{ marginBottom: 16 }}>
            {duzenleId ? 'Ürünü düzenle' : 'Yeni stok kartı'}
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 16 }}>
            <div>
              <Label required>Stok kodu</Label>
              {!duzenleId && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  {['otomatik', 'manuel'].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setKodModu(m)
                        setForm({ ...form, stokKodu: m === 'otomatik' ? stokKoduOlustur(urunler) : '' })
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        font: '500 12px/16px var(--font-sans)',
                        background: kodModu === m ? 'var(--brand-primary)' : 'var(--surface-card)',
                        color: kodModu === m ? '#fff' : 'var(--text-secondary)',
                        border: `1px solid ${kodModu === m ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                        cursor: 'pointer',
                      }}
                    >
                      {m === 'otomatik' ? 'Otomatik' : 'Manuel'}
                    </button>
                  ))}
                </div>
              )}
              {kodModu === 'otomatik' && !duzenleId ? (
                <div style={{
                  padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary)',
                  font: '500 13px/20px var(--font-mono)',
                  border: '1px solid var(--border-default)',
                }}>
                  {form.stokKodu}
                </div>
              ) : (
                <Input
                  value={form.stokKodu}
                  onChange={(e) => setForm({ ...form, stokKodu: e.target.value.toUpperCase() })}
                  placeholder="STK00001"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              )}
            </div>
            <div>
              <Label required>Stok adı</Label>
              <Input
                value={form.stokAdi}
                onChange={(e) => setForm({ ...form, stokAdi: e.target.value })}
                placeholder="Ürün adı"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
            <div>
              <Label>Birim</Label>
              <CustomSelect value={form.birim} onChange={(e) => setForm({ ...form, birim: e.target.value })}>
                {birimler.map((b) => <option key={b} value={b}>{b}</option>)}
              </CustomSelect>
            </div>
            <div>
              <Label>Marka</Label>
              <Input
                value={form.marka}
                onChange={(e) => setForm({ ...form, marka: e.target.value })}
                placeholder="Marka adı"
              />
            </div>
            <div>
              <Label>Grup kodu</Label>
              <Input
                value={form.grupKodu}
                onChange={(e) => setForm({ ...form, grupKodu: e.target.value })}
                placeholder="Kamera, Kablo, Bariyer…"
              />
              <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                {Array.from(new Set([
                  'Kamera', 'Kablo', 'NVR', 'Aksesuar',
                  ...urunler.map(u => u.grupKodu).filter(Boolean),
                ])).map(g => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setForm({ ...form, grupKodu: g })}
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-pill)',
                      font: '500 11px/14px var(--font-sans)',
                      background: form.grupKodu === g ? 'var(--brand-primary)' : 'var(--surface-card)',
                      color: form.grupKodu === g ? '#fff' : 'var(--text-secondary)',
                      border: `1px solid ${form.grupKodu === g ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                      cursor: 'pointer',
                    }}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Min. stok uyarı</Label>
              <Input
                type="number"
                value={form.minStok}
                onChange={(e) => setForm({ ...form, minStok: e.target.value })}
                placeholder="0"
                min="0"
              />
            </div>
            {!duzenleId ? (
              <div>
                <Label>Mevcut stok miktarı</Label>
                <Input
                  type="number"
                  value={form.ilkStok}
                  onChange={(e) => setForm({ ...form, ilkStok: e.target.value })}
                  placeholder="0"
                  min="0"
                />
                <p className="t-caption" style={{ marginTop: 4, color: 'var(--success)' }}>
                  Otomatik stok girişi oluşturulur.
                </p>
              </div>
            ) : (
              <div>
                <Label>
                  Stok düzeltme
                  <span style={{ marginLeft: 6, color: 'var(--text-tertiary)', fontWeight: 400 }}>
                    (Mevcut: <span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{stokBakiye(form.stokKodu)}</span> {form.birim})
                  </span>
                </Label>
                <Input
                  type="number"
                  value={form.ilkStok}
                  onChange={(e) => setForm({ ...form, ilkStok: e.target.value })}
                  placeholder="Yeni miktar girin…"
                  min="0"
                />
                <p className="t-caption" style={{ marginTop: 4, color: 'var(--warning)' }}>
                  Boş bırakırsanız stok miktarı değişmez.
                </p>
              </div>
            )}
            <div style={{ gridColumn: 'span 2' }}>
              <Label>Açıklama</Label>
              <Input
                value={form.aciklama}
                onChange={(e) => setForm({ ...form, aciklama: e.target.value })}
                placeholder="Ürün hakkında kısa açıklama…"
              />
            </div>
          </div>

          {/* Görsel */}
          <div style={{ marginBottom: 16 }}>
            <Label>
              Ürün görseli
              <span style={{ marginLeft: 6, color: 'var(--text-tertiary)', fontWeight: 400 }}>
                (müşteri katalogunda görünür)
              </span>
            </Label>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div
                onClick={() => gorselRef.current?.click()}
                style={{
                  width: 96, height: 96, flexShrink: 0,
                  borderRadius: 'var(--radius-md)',
                  border: '2px dashed var(--border-default)',
                  background: 'var(--surface-sunken)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', overflow: 'hidden',
                }}
              >
                {form.gorselUrl ? (
                  <img src={form.gorselUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} />
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>
                    <ImageIcon size={20} strokeWidth={1.5} />
                    <p className="t-caption" style={{ marginTop: 4 }}>Görsel ekle</p>
                  </div>
                )}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Button
                  variant="secondary"
                  iconLeft={<Upload size={14} strokeWidth={1.5} />}
                  onClick={() => gorselRef.current?.click()}
                  disabled={gorselYukleniyor || !form.stokKodu}
                >
                  {gorselYukleniyor ? 'Yükleniyor…' : 'Dosya seç'}
                </Button>
                {!form.stokKodu && (
                  <p className="t-caption" style={{ color: 'var(--warning)' }}>Önce stok kodu belirlenmeli.</p>
                )}
                <Input
                  type="url"
                  value={form.gorselUrl}
                  onChange={(e) => setForm({ ...form, gorselUrl: e.target.value })}
                  placeholder="veya görsel URL'si girin…"
                />
                {form.gorselUrl && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, gorselUrl: '' })}
                    style={{
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      color: 'var(--danger)', font: '500 12px/16px var(--font-sans)',
                      alignSelf: 'flex-start',
                    }}
                  >
                    Görseli kaldır
                  </button>
                )}
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.katalogdaGoster}
                onChange={(e) => setForm({ ...form, katalogdaGoster: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: 'var(--brand-primary)' }}
              />
              <span style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                Müşteri katalogunda göster
              </span>
            </label>

            {/* Düzenleme modunda seri_takipli checkbox — off ise Toplu S/N gizli */}
            {duzenleId && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: form.seriTakipli ? 16 : 0 }}>
                  <input
                    type="checkbox"
                    checked={form.seriTakipli}
                    onChange={(e) => setForm({ ...form, seriTakipli: e.target.checked, topluSN: e.target.checked ? form.topluSN : '' })}
                    style={{ width: 16, height: 16, accentColor: 'var(--brand-primary)' }}
                  />
                  <Tag size={14} strokeWidth={1.5} style={{ color: 'var(--brand-primary)' }} />
                  <span className="t-body-strong">Bu donanım S/N takipli (kamera, NVR, cihaz…)</span>
                </label>
              </div>
            )}

            {/* Toplu S/N ekle — düzenleme modunda seri_takipli ürünler için */}
            {duzenleId && form.seriTakipli && (
              <div style={{ marginTop: 4 }}>
                <Label>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Tag size={14} strokeWidth={1.5} style={{ color: 'var(--brand-primary)' }} />
                    Toplu S/N ekle
                  </span>
                  <span style={{ marginLeft: 6, color: 'var(--text-tertiary)', fontWeight: 400 }}>
                    (her satıra 1 seri numarası)
                  </span>
                </Label>
                <textarea
                  value={form.topluSN}
                  onChange={(e) => setForm({ ...form, topluSN: e.target.value })}
                  placeholder={'Örn.\nDS2CD1027-000001\nDS2CD1027-000002\nDS2CD1027-000003'}
                  rows={6}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--surface-card)',
                    color: 'var(--text-primary)',
                    font: '400 13px/18px var(--font-mono, monospace)',
                    resize: 'vertical',
                    minHeight: 120,
                  }}
                />
                {(() => {
                  const say = form.topluSN.split('\n').map(s => s.trim()).filter(Boolean).length
                  if (say === 0) {
                    return (
                      <p className="t-caption" style={{ marginTop: 4, color: 'var(--text-tertiary)' }}>
                        Excel veya listeden kopyala‑yapıştır: her satırda 1 S/N.
                      </p>
                    )
                  }
                  const a = topluSNAnaliz
                  return (
                    <div style={{ marginTop: 8 }}>
                      <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
                        background: 'var(--surface-sunken)', padding: 10, borderRadius: 'var(--radius-sm)',
                      }}>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>YENİ</div>
                          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--success)' }}>{a.yeni.length}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>BU ÜRÜNDE</div>
                          <div style={{ fontSize: 16, fontWeight: 600, color: a.buUrunde.length > 0 ? 'var(--warning)' : 'var(--text-tertiary)' }}>{a.buUrunde.length}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>BAŞKA ÜRÜNDE</div>
                          <div style={{ fontSize: 16, fontWeight: 600, color: a.baskaUrunde.length > 0 ? 'var(--danger)' : 'var(--text-tertiary)' }}>{a.baskaUrunde.length}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>TEKRAR</div>
                          <div style={{ fontSize: 16, fontWeight: 600, color: a.tekrar.length > 0 ? 'var(--warning)' : 'var(--text-tertiary)' }}>{a.tekrar.length}</div>
                        </div>
                      </div>
                      {a.baskaUrunde.length > 0 && (
                        <Alert tone="danger" icon={<AlertIkon size={13} strokeWidth={1.5} />} style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 12 }}>
                            <strong>Bu S/N/barkodlar başka bir ürüne kayıtlı!</strong>
                            <div style={{ marginTop: 4, display: 'grid', gap: 2 }}>
                              {a.baskaUrunde.slice(0, 5).map(x => (
                                <div key={x.sn}>
                                  <span style={{ fontFamily: 'var(--font-mono)' }}>{x.sn}</span> → <strong>{x.stokKodu}</strong>
                                </div>
                              ))}
                              {a.baskaUrunde.length > 5 && <div>… (+{a.baskaUrunde.length - 5} daha)</div>}
                            </div>
                          </div>
                        </Alert>
                      )}
                      {a.tekrar.length > 0 && (
                        <Alert tone="warning" icon={<AlertIkon size={13} strokeWidth={1.5} />} style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 12 }}>
                            Aynı S/N tekrar okundu, sadece 1 kez eklenir: <strong>{a.tekrar.slice(0, 5).join(', ')}{a.tekrar.length > 5 ? ` … (+${a.tekrar.length - 5})` : ''}</strong>
                          </div>
                        </Alert>
                      )}
                      {a.buUrunde.length > 0 && (
                        <Alert tone="warning" icon={<AlertIkon size={13} strokeWidth={1.5} />} style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 12 }}>
                            Bu S/N'ler bu üründe zaten kayıtlı: <strong>{a.buUrunde.slice(0, 5).join(', ')}{a.buUrunde.length > 5 ? ` … (+${a.buUrunde.length - 5})` : ''}</strong>
                          </div>
                        </Alert>
                      )}
                      <p className="t-caption" style={{ marginTop: 8, color: a.yeni.length > 0 ? 'var(--success)' : 'var(--text-tertiary)' }}>
                        → <strong>{a.yeni.length}</strong> adet yeni S/N eklenecek {a.yeni.length > 0 && `+ ${a.yeni.length} birim stok girişi`}.
                      </p>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* S/N takipli */}
            {!duzenleId && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.seriTakipli}
                    onChange={(e) => setForm({
                      ...form,
                      seriTakipli: e.target.checked,
                      seriKalemleri: e.target.checked ? [{ seriNo: '', barkod: '', notlar: '' }] : [],
                    })}
                    style={{ width: 16, height: 16, accentColor: 'var(--brand-primary)' }}
                  />
                  <Tag size={14} strokeWidth={1.5} style={{ color: 'var(--brand-primary)' }} />
                  <span className="t-body-strong">Bu donanım S/N takipli (kamera, NVR, cihaz…)</span>
                </label>

                {form.seriTakipli && (
                  <div style={{
                    marginTop: 12, padding: 16,
                    background: 'var(--brand-primary-soft)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                      <div>
                        <Label>Model</Label>
                        <Input
                          value={form.model}
                          onChange={(e) => setForm({ ...form, model: e.target.value })}
                          placeholder="Örn: DS-2CD2143G2-IS"
                        />
                        <p className="t-caption" style={{ marginTop: 4 }}>Tüm S/N'ler bu modele atanacak.</p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                      <p className="t-label" style={{ color: 'var(--brand-primary)' }}>
                        Seri numaraları (<span className="tabular-nums">{form.seriKalemleri.filter(k => k.seriNo?.trim()).length}</span>)
                      </p>
                      <Button
                        variant="secondary"
                        iconLeft={<Plus size={12} strokeWidth={1.5} />}
                        onClick={() => setForm({ ...form, seriKalemleri: [...form.seriKalemleri, { seriNo: '', barkod: '', notlar: '' }] })}
                      >
                        Satır ekle (manuel)
                      </Button>
                    </div>

                    {/* Barkod tarayıcı için hızlı toplu ekle textarea */}
                    <div style={{ marginBottom: 10, padding: 10, background: 'var(--surface-card)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--brand-primary)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--brand-primary)', marginBottom: 6 }}>
                        <Tag size={12} strokeWidth={1.5} />
                        📷 Barkod tarayıcı ile toplu ekle
                      </label>
                      <textarea
                        placeholder={'Barkod tarayıcıyı buraya odakla ve peşpeşe okut.\nHer okutma Enter gönderir → o SN listeye eklenir.\nYa da Excel/Word\'den kopyala‑yapıştır.\n\nÖrn:\nJB3062404010491\nJB3062404010492\nJB3062404010493'}
                        rows={5}
                        autoFocus
                        onChange={(e) => {
                          const val = e.target.value
                          // Enter gelmeden hiçbir şey yapma — barkod cihazı karakter karakter yazıyor
                          if (!val.includes('\n')) return
                          const parcalar = val.split(/\r?\n/)
                          const tamamlananlar = parcalar.slice(0, -1).map(s => s.trim()).filter(Boolean)
                          const yarim = parcalar[parcalar.length - 1] || ''
                          if (tamamlananlar.length === 0) {
                            e.target.value = yarim
                            return
                          }
                          const mevcutDolu = form.seriKalemleri.filter(k => k.seriNo?.trim())
                          // Session içi + global DB duplicate kontrolü
                          const sessionSet = new Set(mevcutDolu.map(k => k.seriNo.trim().toLowerCase()))
                          const yeni = []
                          const dublikeSession = [], dublikeGlobal = []
                          for (const sn of tamamlananlar) {
                            const k = sn.toLowerCase()
                            if (sessionSet.has(k)) { dublikeSession.push(sn); continue }
                            const digerStok = globalSN.get(k)
                            if (digerStok) { dublikeGlobal.push({ sn, stok: digerStok }); continue }
                            sessionSet.add(k)
                            yeni.push({ seriNo: sn, barkod: '', notlar: '' })
                          }
                          if (yeni.length > 0) {
                            setForm({ ...form, seriKalemleri: [...mevcutDolu, ...yeni] })
                          }
                          if (dublikeSession.length > 0) {
                            toast.error(`Zaten okutulmuş: ${dublikeSession.slice(0, 3).join(', ')}${dublikeSession.length > 3 ? ` (+${dublikeSession.length - 3})` : ''}`)
                          }
                          if (dublikeGlobal.length > 0) {
                            const ilk = dublikeGlobal[0]
                            toast.error(`Başka üründe kayıtlı: ${ilk.sn} → ${ilk.stok}`)
                          }
                          e.target.value = yarim
                        }}
                        style={{
                          width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-default)',
                          background: 'var(--surface-sunken)', color: 'var(--text-primary)',
                          font: '400 13px/18px var(--font-mono, monospace)',
                          resize: 'vertical', minHeight: 100, boxSizing: 'border-box',
                        }}
                      />
                      <p className="t-caption" style={{ marginTop: 6, color: 'var(--text-tertiary)' }}>
                        Karakter karakter yazma sırasında beklenir; Enter geldiğinde tamamlanan satır listeye eklenir.
                      </p>

                      {/* Okutulan barkodlar — direkt burada listelensin */}
                      {form.seriKalemleri.filter(k => k.seriNo?.trim()).length > 0 && (
                        <div style={{ marginTop: 12, borderTop: '1px solid var(--border-default)', paddingTop: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            ✓ Okutulanlar ({form.seriKalemleri.filter(k => k.seriNo?.trim()).length})
                          </div>
                          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {form.seriKalemleri.map((k, i) => {
                              if (!k.seriNo?.trim()) return null
                              return (
                                <div key={i} style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  gap: 8, padding: '6px 10px',
                                  background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)',
                                  border: '1px solid var(--border-default)',
                                }}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', minWidth: 24 }}>#{i + 1}</span>
                                    <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{k.seriNo}</span>
                                  </span>
                                  <button
                                    type="button"
                                    aria-label="Kaldır"
                                    onClick={() => {
                                      const yeni = form.seriKalemleri.filter((_, idx) => idx !== i)
                                      setForm({ ...form, seriKalemleri: yeni.length > 0 ? yeni : [{ seriNo: '', barkod: '', notlar: '' }] })
                                    }}
                                    style={{
                                      width: 22, height: 22, borderRadius: 4,
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      background: 'transparent', border: '1px solid var(--border-default)',
                                      color: 'var(--danger)', cursor: 'pointer', flexShrink: 0,
                                    }}
                                  >
                                    <X size={12} strokeWidth={2} />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>


                    <p className="t-caption" style={{ marginTop: 12, color: 'var(--brand-primary)' }}>
                      Her kalem "Depoda" durumunda eklenecek; barkodla mobil uygulamadan bulunabilir.
                    </p>
                  </div>
                )}
              </div>
            )}

            <input
              ref={gorselRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
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

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={kaydet}>{duzenleId ? 'Güncelle' : 'Kaydet'}</Button>
            <Button variant="secondary" onClick={iptal}>İptal</Button>
          </div>
        </Card>
      )}

      {/* Liste */}
      <Card padding={0}>
        {gorunenUrunler.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<Package size={24} strokeWidth={1.5} />}
              title={arama ? 'Arama sonucu bulunamadı' : 'Henüz ürün eklenmedi'}
              description={arama ? 'Farklı bir arama terimi deneyin.' : 'Üstteki butonla ilk ürünü ekleyebilirsiniz.'}
            />
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Stok kodu</TH>
                <TH>Ürün</TH>
                <TH>Birim</TH>
                <TH>Marka</TH>
                <TH>Grup</TH>
                <TH align="right">Bakiye</TH>
                <TH align="right">Opsiyonlu</TH>
                <TH align="right">Boş</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {sayfadakiUrunler.map((u) => {
                const kalemOzet = kalemOzetleri.get(u.stokKodu)
                // S/N badge — sadece DB'deki seri_takipli true ise göster. Kalem varlığı fallback DEĞİL.
                // Kullanıcı checkbox'ı kapatabilsin diye.
                const seriTakipli = !!u.seriTakipli
                const bakiye = seriTakipli ? (kalemOzet?.depoda ?? 0) : stokBakiye(u.stokKodu)
                const opsiyon = opsiyonluMiktar(u.stokKodu)
                const bos = bakiye - opsiyon
                const kritik = Boolean(u.minStok) && bakiye <= Number(u.minStok)
                const gosterilenMarka = kalemOzet?.marka || u.marka || ''
                const gosterilenModel = kalemOzet?.model || ''
                return (
                  <TR
                    key={u.id}
                    onClick={seriTakipli ? () => navigate(`/stok/model/${encodeURIComponent(u.stokKodu)}`) : undefined}
                    style={seriTakipli ? { cursor: 'pointer' } : undefined}
                  >
                    <TD>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CodeBadge>{u.stokKodu}</CodeBadge>
                        {seriTakipli && <Badge tone="brand">S/N</Badge>}
                      </div>
                    </TD>
                    <TD>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {u.gorselUrl ? (
                          <img src={u.gorselUrl} alt="" style={{
                            width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                            objectFit: 'contain', border: '1px solid var(--border-default)', flexShrink: 0,
                          }} />
                        ) : (
                          <div style={{
                            width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                            background: 'var(--surface-sunken)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--text-tertiary)', flexShrink: 0,
                          }}>
                            <Package size={14} strokeWidth={1.5} />
                          </div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div
                            title={u.stokAdi}
                            style={{
                              font: '500 13px/18px var(--font-sans)',
                              color: 'var(--text-primary)',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              wordBreak: 'break-word',
                            }}
                          >
                            {u.stokAdi}
                          </div>
                          {gosterilenModel && (
                            <div className="t-caption" style={{ color: 'var(--brand-primary)' }}>{gosterilenModel}</div>
                          )}
                          {!gosterilenModel && u.aciklama && (
                            <div
                              title={u.aciklama}
                              className="t-caption"
                              style={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                wordBreak: 'break-word',
                              }}
                            >
                              {u.aciklama}
                            </div>
                          )}
                        </div>
                      </div>
                    </TD>
                    <TD>{u.birim}</TD>
                    <TD>{gosterilenMarka || '—'}</TD>
                    <TD>{u.grupKodu ? <Badge tone="neutral">{u.grupKodu}</Badge> : '—'}</TD>
                    <TD align="right">
                      <span style={{
                        fontWeight: 500,
                        fontSize: 14,
                        color: kritik ? 'var(--danger)' : 'var(--text-primary)',
                        fontVariantNumeric: 'normal',
                        fontFeatureSettings: 'normal',
                      }}>
                        {String(Math.round(Number(bakiye) || 0))}
                      </span>
                      {seriTakipli && u.beklenenAdet ? (
                        <div style={{ marginTop: 2, font: '500 11px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                          / {u.beklenenAdet} hedef
                        </div>
                      ) : null}
                      {kritik ? (
                        <div style={{ marginTop: 2 }}>
                          <Badge tone="kayip">Kritik</Badge>
                        </div>
                      ) : null}
                    </TD>
                    <TD align="right">
                      <span className="tabular-nums" style={{
                        font: '600 13px/18px var(--font-sans)',
                        color: opsiyon > 0 ? 'var(--warning)' : 'var(--text-tertiary)',
                      }}>
                        {opsiyon > 0 ? opsiyon : '—'}
                      </span>
                    </TD>
                    <TD align="right">
                      <span className="tabular-nums" style={{
                        font: '600 13px/18px var(--font-sans)',
                        color: bos <= 0 ? 'var(--danger)' : 'var(--success)',
                      }}>
                        {Math.round(Number(bos) || 0)}
                      </span>
                    </TD>
                    <TD align="right">
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <button
                          aria-label="Opsiyonla"
                          onClick={(e) => { e.stopPropagation(); opsiyonAc(u) }}
                          style={iconBtnStyle}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                        >
                          <ClipboardList size={12} strokeWidth={1.5} />
                        </button>
                        <button
                          aria-label="Düzenle"
                          onClick={(e) => { e.stopPropagation(); duzenleAc(u) }}
                          style={iconBtnStyle}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                        >
                          <Pencil size={12} strokeWidth={1.5} />
                        </button>
                        <button
                          aria-label="Sil"
                          onClick={(e) => { e.stopPropagation(); urunSil(u.id) }}
                          style={iconBtnStyle}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                        >
                          <Trash2 size={12} strokeWidth={1.5} />
                        </button>
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
        <Sayfalama
          aktifSayfa={aktifSayfa}
          toplamSayfa={toplamSayfa}
          toplam={gorunenUrunler.length}
          sayfaBoyutu={sayfaBoyutu}
          setSayfa={setSayfa}
          setSayfaBoyutu={setSayfaBoyutu}
        />
      </Card>

      {/* Excel Modal */}
      <Modal
        open={excelModal && !!excelOnizleme}
        onClose={() => setExcelModal(false)}
        title="Excel önizleme"
        width={960}
        footer={
          <>
            <Button variant="secondary" onClick={() => setExcelModal(false)}>İptal</Button>
            <Button
              variant="primary"
              onClick={excelAktar}
              disabled={gecerliExcelSayi === 0}
            >
              {gecerliExcelSayi} ürünü aktar
            </Button>
          </>
        }
      >
        {excelOnizleme && (
          <>
            <p className="t-caption" style={{ marginBottom: 12 }}>
              <span className="tabular-nums">{gecerliExcelSayi}</span> geçerli,{' '}
              <span className="tabular-nums">{hataliExcelSayi}</span> hatalı satır.
            </p>

            {excelHata.length > 0 && (
              <Alert variant="danger" style={{ marginBottom: 12 }}>
                <div className="t-body-strong" style={{ marginBottom: 4 }}>Hatalı satırlar aktarılmayacak</div>
                {excelHata.map((h, i) => (
                  <div key={i} className="t-caption">
                    {h.satir}. satır: {h.hatalar.join(', ')}
                  </div>
                ))}
              </Alert>
            )}

            <Table>
              <THead>
                <TR>
                  <TH>Durum</TH>
                  <TH>Stok kodu</TH>
                  <TH>Stok adı</TH>
                  <TH>Birim</TH>
                  <TH>Marka</TH>
                  <TH>Grup</TH>
                  <TH align="right">Min</TH>
                  <TH align="right">Mevcut</TH>
                </TR>
              </THead>
              <TBody>
                {excelOnizleme.map((satir, i) => (
                  <TR key={i}>
                    <TD>
                      {satir.hatalar.length > 0 ? (
                        <Badge tone="kayip" title={satir.hatalar.join(', ')}>Hatalı</Badge>
                      ) : (
                        <Badge tone="aktif">Geçerli</Badge>
                      )}
                    </TD>
                    <TD>{satir.stokKodu ? <CodeBadge>{satir.stokKodu}</CodeBadge> : <span className="t-caption">(otomatik)</span>}</TD>
                    <TD>{satir.stokAdi}</TD>
                    <TD>{satir.birim}</TD>
                    <TD>{satir.marka || '—'}</TD>
                    <TD>{satir.grupKodu || '—'}</TD>
                    <TD align="right"><span className="tabular-nums">{satir.minStok || '—'}</span></TD>
                    <TD align="right"><span className="tabular-nums" style={{ color: 'var(--success)', fontWeight: 600 }}>{satir.ilkStok || '—'}</span></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </>
        )}
      </Modal>

      {/* Opsiyon Modal */}
      <Modal
        open={!!opsiyonModal}
        onClose={() => setOpsiyonModal(null)}
        title="Stok opsiyonla"
        width={480}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpsiyonModal(null)}>İptal</Button>
            <Button variant="primary" onClick={opsiyonKaydet}>Opsiyonla</Button>
          </>
        }
      >
        {opsiyonModal && (
          <>
            <div style={{
              padding: 12, marginBottom: 16,
              background: 'var(--brand-primary-soft)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
            }}>
              <div className="t-body-strong" style={{ color: 'var(--brand-primary)' }}>{opsiyonModal.stokAdi}</div>
              <CodeBadge>{opsiyonModal.stokKodu}</CodeBadge>
              <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                <div>
                  <div className="t-caption">Toplam</div>
                  <div className="tabular-nums" style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
                    {stokBakiye(opsiyonModal.stokKodu)} {opsiyonModal.birim}
                  </div>
                </div>
                <div>
                  <div className="t-caption">Opsiyonlu</div>
                  <div className="tabular-nums" style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--warning)' }}>
                    {opsiyonluMiktar(opsiyonModal.stokKodu)} {opsiyonModal.birim}
                  </div>
                </div>
                <div>
                  <div className="t-caption">Kullanılabilir</div>
                  <div className="tabular-nums" style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--success)' }}>
                    {stokBakiye(opsiyonModal.stokKodu) - opsiyonluMiktar(opsiyonModal.stokKodu)} {opsiyonModal.birim}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <Label required>Satışçı</Label>
                <CustomSelect
                  value={opsiyonForm.satisciId}
                  onChange={(e) => setOpsiyonForm({ ...opsiyonForm, satisciId: e.target.value })}
                >
                  <option value="">Satışçı seç…</option>
                  {kullanicilar.map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}
                </CustomSelect>
              </div>
              <div>
                <Label>Müşteri adı</Label>
                <Input
                  value={opsiyonForm.musteriAdi}
                  onChange={(e) => setOpsiyonForm({ ...opsiyonForm, musteriAdi: e.target.value })}
                  placeholder="Müşteri firma adı"
                />
              </div>
              <div>
                <Label required>Miktar ({opsiyonModal.birim})</Label>
                <Input
                  type="number"
                  value={opsiyonForm.miktar}
                  onChange={(e) => setOpsiyonForm({ ...opsiyonForm, miktar: e.target.value })}
                  placeholder="0"
                  min="1"
                />
              </div>
              <div>
                <Label required>Bitiş tarihi</Label>
                <Input
                  type="date"
                  value={opsiyonForm.bitisTarih}
                  onChange={(e) => setOpsiyonForm({ ...opsiyonForm, bitisTarih: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <Label>Açıklama</Label>
                <Textarea
                  value={opsiyonForm.aciklama}
                  onChange={(e) => setOpsiyonForm({ ...opsiyonForm, aciklama: e.target.value })}
                  rows={2}
                  placeholder="Notlar…"
                />
              </div>
            </div>
          </>
        )}
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

function Sayfalama({ aktifSayfa, toplamSayfa, toplam, sayfaBoyutu, setSayfa, setSayfaBoyutu }) {
  if (toplam === 0) return null
  const ilk = (aktifSayfa - 1) * sayfaBoyutu + 1
  const son = Math.min(aktifSayfa * sayfaBoyutu, toplam)
  const sayfalar = [1]
  for (let n = aktifSayfa - 1; n <= aktifSayfa + 1; n++) {
    if (n > 1 && n < toplamSayfa) sayfalar.push(n)
  }
  if (toplamSayfa > 1) sayfalar.push(toplamSayfa)
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderTop: '1px solid var(--border-default)', flexWrap: 'wrap' }}>
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
        <select value={sayfaBoyutu} onChange={e => setSayfaBoyutu(Number(e.target.value))}
          style={{ height: 32, padding: '0 8px', background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', font: '500 13px/16px var(--font-sans)', color: 'var(--text-primary)', cursor: 'pointer' }}>
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={200}>200</option>
        </select>
      </div>
    </div>
  )
}

export default Stok
