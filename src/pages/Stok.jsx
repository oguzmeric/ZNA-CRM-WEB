import { yeniSekmedeAc, acmaHatasi } from '../lib/dosyaAc'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUrlSayfa } from '../lib/useUrlSayfa'
import * as XLSX from 'xlsx'
import {
  Plus, Pencil, Trash2, Package, Upload, Download, ClipboardList,
  ArrowLeftRight, Image as ImageIcon, AlertTriangle, X, Tag, Hash,
  ClipboardCheck, BarChart3, FolderTree, FileText, Eye, EyeOff,
  SlidersHorizontal, ArrowLeft,
} from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { useBildirim } from '../context/BildirimContext'
import { opsiyonEkle, aktifOpsiyonToplamlari } from '../services/stokOpsiyonService'
import {
  stokUrunleriniGetir, stokUrunEkle, stokUrunGuncelle, stokUrunSil,
  stokBakiyeHaritasiGetir, stokHareketEkle, gorselYukle,
  stokKalemOzetleriniGetir, stokKalemleriToplu,
  tumSeriNumaralariniGetir, modelKalemleriniGetir,
  URUN_TIPLERI, PARA_BIRIMLERI, alisFiyatGorebilir,
  dokumanYukle, dokumanImzaliUrl, DOKUMAN_MAX_MB,
  aileleriGetir, aileEkle,
} from '../services/stokService'
import {
  kategorileriGetir, kategoriEkle, kategoriGuncelle,
  agacKur, kategoriYolu, altKategoriIdleri,
} from '../services/stokKategoriService'
import {
  OZELLIK_TIPLERI, ozellikTanimlariGetir, ozellikEkle, ozellikGuncelle,
  kategoriOzellikleri, urunOzellikleriGetir, urunOzellikleriKaydet,
  tumUrunOzellikleriGetir, ozelligiOlanUrunIdleri,
} from '../services/stokOzellikService'
import { AlertTriangle as AlertIkon } from 'lucide-react'
import CustomSelect from '../components/CustomSelect'
import Sayfalama from '../components/Sayfalama'
import { SkeletonList } from '../components/Skeleton'
import { trContains } from '../lib/trSearch'
import { sorguCozumle, urunEslesiyorMu } from '../lib/stokAkilliArama'
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
  alisFiyat: '',  // Stok değeri raporu için (mig 137)
  birimFiyat: '', // Liste satış fiyatı
  raf: '',        // Depo lokasyonu, örn. "A-3" (mig 137)
  aciklama: '',
  ilkStok: '',
  gorselUrl: '',
  katalogdaGoster: true,
  seriTakipli: false,
  seriKalemleri: [],
  topluSN: '',  // Düzenleme modunda toplu SN yapıştırma
  // Stok v2 Faz 1 (mig 151)
  kategoriId: '',
  urunTipi: 'stoklu',
  barkod: '',
  tedarikci: '',
  tedarikciUrunKodu: '',
  garantiSuresiAy: '',
  paraBirimi: 'TRY',
  aktif: true,
  dokumanUrl: '',
  dokumanAd: '',
  aileId: '',   // ürün ailesi (mig 153) — TC-C32XN ↔ TC-C32GN kardeşliği
}

const bosOpsiyonForm = {
  satisciId: '',
  musteriAdi: '',
  miktar: '',
  bitisTarih: '',
  aciklama: '',
}

function stokKoduOlustur(mevcutlar) {
  // adet+1 DEĞİL max+1: silinen ürünler sayacı geriletir, verilmiş kod
  // yeniden önerilir (06.08: STK02452 doluydu — otomatik modda ürün eklenemiyordu)
  let max = 0
  for (const u of mevcutlar) {
    const m = /^STK(\d+)$/i.exec(u?.stokKodu ?? '')
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > max) max = n
    }
  }
  return `STK${String(max + 1).padStart(5, '0')}`
}

function Stok() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { kullanici, kullanicilar } = useAuth()
  const { bildirimEkle } = useBildirim()
  const dosyaRef = useRef(null)
  // Form kartına otomatik kaydırma — içerik alanı KENDİ kapsayıcısında kayıyor
  // (MainLayout overflowY:auto), bu yüzden window.scrollTo İŞE YARAMIYOR.
  const formCardRef = useRef(null)

  const [urunler, setUrunler] = useState([])
  // Hareket listesinin TAMAMI değil, ürün başına toplanmış bakiye tutuluyor.
  // (Tam liste /stok-hareketleri sayfasında; burada sadece bakiye lazımdı.)
  const [bakiyeHaritasi, setBakiyeHaritasi] = useState(new Map())
  const [kalemOzetleri, setKalemOzetleri] = useState(new Map())
  const [yukleniyor, setYukleniyor] = useState(true)
  const [form, setForm] = useState(bosForm)
  const [goster, setGoster] = useState(false)
  const [duzenleId, setDuzenleId] = useState(null)
  const [kodModu, setKodModu] = useState('otomatik')
  const [arama, setArama] = useState('')
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

  // Stok v2 Faz 1 — kategori ağacı + filtreler + doküman
  const [kategoriler, setKategoriler] = useState([])
  const [filtreKatId, setFiltreKatId] = useState('')       // liste kategori filtresi (alt dallar dahil)
  const [pasifGoster, setPasifGoster] = useState(false)    // pasif ürünleri de göster
  // ⭐ 18.08 kullanıcı isteği: "Teknik Özellikler ve resimlerin olmadığı
  // ürünleri listeleyebilelim". Katalog kalitesi denetimi — canlıda 2.456
  // aktif üründen 2.100'ünde özellik, 250'sinde görsel YOK.
  // '' | 'gorsel' | 'ozellik' | 'ikisi'
  const [eksikFiltre, setEksikFiltre] = useState('')
  const [ozellikliIdler, setOzellikliIdler] = useState(null)  // Set<urunId> — lazy
  const [kategoriModal, setKategoriModal] = useState(false) // admin kategori yönetimi
  const [dokumanYukleniyor, setDokumanYukleniyor] = useState(false)
  const dokumanRef = useRef(null)
  const admin = kullanici?.rol === 'admin'
  const alisFiyatGoster = alisFiyatGorebilir(kullanici)

  // Stok v2 Faz 4 — ürün aileleri (mig 153)
  const [aileler, setAileler] = useState([])
  const [yeniAileAd, setYeniAileAd] = useState(null)  // null = kapalı; string = inline form açık

  // Stok v2 Faz 2 — kategori-bazlı teknik özellikler (mig 152)
  const [ozellikTanimlar, setOzellikTanimlar] = useState([])   // tüm tanımlar (pasifler dahil — yönetim için)
  const [ozellikDegerleri, setOzellikDegerleri] = useState({}) // formdaki ürünün değerleri {ozellikId: deger}
  const [ozellikFiltre, setOzellikFiltre] = useState({})       // liste filtreleri {ozellikId: deger}
  // Sayfa no URL'de (?sayfa=7): model detayına girip geri dönünce liste aynı sayfada.
  // ozellikFiltre OBJE — hook DEĞER karşılaştırır, referans değişimi resetlemez.
  const [sayfa, setSayfa] = useUrlSayfa([arama, sayfaBoyutu, filtreKatId, pasifGoster, ozellikFiltre, eksikFiltre])
  const [urunOzellikMap, setUrunOzellikMap] = useState(null)   // Map<urunId, Map<ozellikId,deger>> — lazy

  // "Eksik bilgi" filtresi özellik gerektiriyorsa dolu ürün id kümesini lazy çek.
  // Görsel filtresi ürün kaydındaki gorsel_url'den okunur, sorgu gerektirmez.
  useEffect(() => {
    if (eksikFiltre !== 'ozellik' && eksikFiltre !== 'ikisi') return
    if (ozellikliIdler) return
    ozelligiOlanUrunIdleri()
      .then(s => setOzellikliIdler(s || new Set()))
      .catch(e => {
        console.error('[eksik filtre]', e?.message || e)
        setOzellikliIdler(new Set())
      })
  }, [eksikFiltre, ozellikliIdler])

  // Kategori filtresi seçilince ürün özellik değerlerini (filtre için) lazy yükle
  useEffect(() => {
    if (filtreKatId && !urunOzellikMap) {
      tumUrunOzellikleriGetir()
        .then(m => setUrunOzellikMap(m || new Map()))
        .catch(() => setUrunOzellikMap(new Map()))
    }
    setOzellikFiltre({})  // dal değişince eski özellik filtreleri sıfırlansın
  }, [filtreKatId])

  // Akıllı arama özellik filtresi çıkarırsa da değer map'i gerekir (lazy)
  useEffect(() => {
    if (urunOzellikMap || arama.trim().length < 2) return
    const c = sorguCozumle(arama, kategoriler, ozellikTanimlar)
    if (Object.keys(c.ozellikFiltre).length > 0) {
      tumUrunOzellikleriGetir()
        .then(m => setUrunOzellikMap(m || new Map()))
        .catch(() => setUrunOzellikMap(new Map()))
    }
  }, [arama])

  // id → tam yol map'i ("Güvenlik Sistemleri › Kamera Sistemleri › IP Kamera")
  // Arama ve tabloda her satırda tekrar hesaplamamak için tek sefer kurulur.
  const katYol = new Map(kategoriler.map(k => [k.id, kategoriYolu(kategoriler, k.id)]))
  const katAgac = agacKur(kategoriler)

  // Ağacı girintili düz listeye çevir (select option'ları için) — pasifler hariç
  const katSecenekler = (() => {
    const out = []
    const gez = (liste, seviye) => {
      for (const k of liste) {
        if (k.aktif === false) continue
        out.push({ id: k.id, etiket: `${'   '.repeat(seviye)}${seviye > 0 ? '› ' : ''}${k.ad}` })
        gez(katAgac.cocuklar.get(k.id) || [], seviye + 1)
      }
    }
    gez(katAgac.kokler, 0)
    return out
  })()

  // Yeni ürün modunda da seriTakipli açılınca globalSN yükle (duplicate kontrolü için).
  // Fetch fail olursa kullanıcı SN girip DB unique constraint hatası yiyecek —
  // sessiz yutmuyoruz, toast ile uyarıyoruz ki kullanıcı bilinçli devam etsin.
  useEffect(() => {
    if (form.seriTakipli && !duzenleId && globalSN.size === 0) {
      tumSeriNumaralariniGetir()
        .then(gmap => setGlobalSN(gmap || new Map()))
        .catch(e => {
          console.warn('[Stok] Global SN yüklenemedi:', e?.message)
          toast?.warning?.('Seri no çakışma kontrolü devre dışı — girmeden önce çakışmadığından emin olun.')
        })
    }
  }, [form.seriTakipli, duzenleId])

  // Aktif opsiyon toplamları (stokKodu → miktar) — DB'den (mig 137)
  const [opsiyonToplam, setOpsiyonToplam] = useState(new Map())

  useEffect(() => {
    Promise.all([
      stokUrunleriniGetir(),
      stokBakiyeHaritasiGetir(),
      stokKalemOzetleriniGetir(),
      tumSeriNumaralariniGetir(),
      aktifOpsiyonToplamlari(),
      kategorileriGetir(true),      // pasifler dahil — yönetim modalında lazım
      ozellikTanimlariGetir(true),  // pasifler dahil — yönetim modalında lazım
      aileleriGetir(),
    ])
      .then(([urunData, bakiyeMap, kalemOzet, snMap, opsMap, katData, ozData, aileData]) => {
        setUrunler(urunData || [])
        setBakiyeHaritasi(bakiyeMap || new Map())
        setKalemOzetleri(kalemOzet || new Map())
        setGlobalSN(snMap || new Map())
        setOpsiyonToplam(opsMap || new Map())
        setKategoriler(katData || [])
        setOzellikTanimlar(ozData || [])
        setAileler(aileData || [])
      })
      .catch(err => console.error('[Stok yükle]', err))
      .finally(() => setYukleniyor(false))
  }, [])

  // stokKodu → ürün. Eskiden stokBakiye içinde urunler.find() vardı: her satır
  // için 2.600 kayıt taranıyordu (liste + KPI'lar defalarca çağırıyor).
  const urunHaritasi = useMemo(() => {
    const m = new Map()
    for (const u of urunler) m.set(u.stokKodu, u)
    return m
  }, [urunler])

  const stokBakiye = (stokKodu) => {
    // SN takipli ürün: gerçek stok = SN sayısı (hurda hariç), 0 dahil
    // Ürün seriTakipli ise hareket sayısına DOKUNMA. SN silinince kalem düşer,
    // hareket kalır — o yüzden seriTakipli ürüne hareket bazlı fallback yanlış.
    const urun = urunHaritasi.get(stokKodu)
    if (urun?.seriTakipli) {
      const kalemOzet = kalemOzetleri.get(stokKodu)
      const toplam = Number(kalemOzet?.toplam) || 0
      const hurda = Number(kalemOzet?.hurda) || 0
      return Math.max(0, toplam - hurda)
    }
    // SN takipsiz: hareketlerden ÖNCEDEN toplanmış bakiye (stokBakiyeHaritasiGetir)
    return bakiyeHaritasi.get(stokKodu) || 0
  }

  // Yeni hareket sonrası bakiyeyi yerinde güncelle — tüm listeyi yeniden çekmeye
  // gerek yok (ekleme anında sayfa donmasın).
  const bakiyeGuncelle = (stokKodu, hareketTipi, miktar) => {
    const m = Number(miktar) || 0
    const isaret = (hareketTipi === 'giris' || hareketTipi === 'transfer_giris') ? m
      : (hareketTipi === 'cikis' || hareketTipi === 'transfer_cikis') ? -m
      : 0
    if (!isaret || !stokKodu) return
    setBakiyeHaritasi(prev => {
      const yeni = new Map(prev)
      yeni.set(stokKodu, (yeni.get(stokKodu) || 0) + isaret)
      return yeni
    })
  }

  // Opsiyonlar DB'de (mig 137) — localStorage okuma kaldırıldı
  const opsiyonluMiktar = (stokKodu) => opsiyonToplam.get(stokKodu) || 0

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

  // Mevcut stok listesini Excel'e aktar — bakiye + opsiyon + değer dahil
  const excelIndir = () => {
    const satirlar = urunler.map(u => {
      const bakiye = stokBakiye(u.stokKodu)
      const opsiyonlu = opsiyonluMiktar(u.stokKodu)
      const alis = Number(u.alisFiyat || 0)
      const satir = {
        'Stok Kodu': u.stokKodu,
        'Stok Adı': u.stokAdi,
        'Birim': u.birim || 'Adet',
        'Marka': u.marka || '',
        'Kategori': katYol.get(u.kategoriId) || u.grupKodu || '',
        'Ürün Tipi': URUN_TIPLERI.find(t => t.id === u.urunTipi)?.ad || '',
        'Tedarikçi': u.tedarikci || '',
        'Raf': u.raf || '',
        'Bakiye': bakiye,
        'Opsiyonlu': opsiyonlu,
        'Satılabilir': bakiye - opsiyonlu,
        'Min Stok': u.minStok || '',
        'S/N Takipli': u.seriTakipli ? 'Evet' : '',
        'Durum': u.aktif === false ? 'Pasif' : 'Aktif',
        'Açıklama': u.aciklama || '',
      }
      // Maliyet bilgisi yalnız yetkili üçlüde (kâr/marj kuralı)
      if (alisFiyatGoster) {
        satir['Alış Fiyatı (₺)'] = alis || ''
        satir['Stok Değeri (₺)'] = alis > 0 ? Number((bakiye * alis).toFixed(2)) : ''
      }
      return satir
    })
    const ws = XLSX.utils.json_to_sheet(satirlar)
    ws['!cols'] = [
      { wch: 12 }, { wch: 34 }, { wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 8 },
      { wch: 9 }, { wch: 10 }, { wch: 11 }, { wch: 9 }, { wch: 13 }, { wch: 14 },
      { wch: 10 }, { wch: 30 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Stok')
    const bugun = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `ZNA_Stok_${bugun}.xlsx`)
    toast.success(`${satirlar.length} ürün Excel'e aktarıldı.`)
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
    // Kod havuzu ayrı: başarısız satırın kodu da havuza girer ki sonraki
    // otomatik kod aynı çakışan koda takılmasın — ama ekrana/listeye GİRMEZ
    const kodHavuzu = [...urunler]
    const yeniBakiye = new Map(bakiyeHaritasi)
    let basarili = 0
    const basarisizlar = []
    for (const satir of gecerliSatirlar) {
      const stokKodu = satir.stokKodu || stokKoduOlustur(kodHavuzu)
      const yeniUrun = await stokUrunEkle({
        stokKodu,
        stokAdi: satir.stokAdi,
        birim: satir.birim,
        marka: satir.marka,
        grupKodu: satir.grupKodu,
        minStok: satir.minStok,
        aciklama: satir.aciklama,
      })
      if (!yeniUrun) {
        // Ürün eklenemedi (ör. kod çakışması) — hareket YAZILMAZ: yazılırsa
        // giriş DB'deki BAŞKA bir ürünün bakiyesine biner (06.08 denetimi)
        kodHavuzu.push({ stokKodu })
        basarisizlar.push(`${satir.stokAdi} (${stokKodu})`)
        continue
      }
      kodHavuzu.push(yeniUrun)
      yeniUrunler.push(yeniUrun)
      basarili++
      if (satir.ilkStok && Number(satir.ilkStok) > 0) {
        const yeniHareket = await stokHareketEkle({
          stokKodu,
          stokAdi: satir.stokAdi,
          hareketTipi: 'giris',
          miktar: Number(satir.ilkStok),
          aciklama: 'Excel ile toplu stok girişi',
          tarih: new Date().toISOString().split('T')[0],
        })
        if (yeniHareket) {
          yeniBakiye.set(stokKodu, (yeniBakiye.get(stokKodu) || 0) + Number(satir.ilkStok))
        } else {
          // Ürün eklendi ama stok girişi yazılamadı — sessiz kalma
          basarisizlar.push(`${satir.stokAdi} (${stokKodu}) — ürün eklendi, STOK GİRİŞİ yazılamadı`)
        }
      }
    }
    setUrunler(yeniUrunler)
    setBakiyeHaritasi(yeniBakiye)
    setExcelModal(false)
    setExcelOnizleme(null)
    if (basarisizlar.length === 0) {
      toast.success(`${basarili} ürün aktarıldı.`)
    } else {
      const ozet = basarisizlar.slice(0, 3).join(', ') + (basarisizlar.length > 3 ? ` ve ${basarisizlar.length - 3} satır daha` : '')
      if (basarili === 0) toast.error(`Hiçbir ürün aktarılamadı. Başarısız: ${ozet}`)
      else toast.error(`${basarili} ürün aktarıldı; ${basarisizlar.length} satır AKTARILAMADI: ${ozet}`)
    }
  }

  const opsiyonAc = (u) => {
    setOpsiyonModal(u)
    setOpsiyonForm(bosOpsiyonForm)
  }

  const opsiyonKaydet = async () => {
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
    try {
      // Opsiyonlar DB'de (mig 137) — opsiyon_no trigger üretir
      const yeni = await opsiyonEkle({
        stokKodu: opsiyonModal.stokKodu,
        stokAdi: opsiyonModal.stokAdi,
        miktar: Number(opsiyonForm.miktar),
        satisciId: Number(opsiyonForm.satisciId),
        satisciAd: satisci?.ad || '',
        musteriAdi: opsiyonForm.musteriAdi,
        aciklama: opsiyonForm.aciklama,
        bitisTarih: opsiyonForm.bitisTarih,
        durum: 'aktif',
        olusturanId: kullanici?.id ? Number(kullanici.id) : null,
        olusturanAd: kullanici?.ad || '',
      })
      setOpsiyonToplam(prev => {
        const m = new Map(prev)
        m.set(opsiyonModal.stokKodu, (m.get(opsiyonModal.stokKodu) || 0) + Number(opsiyonForm.miktar))
        return m
      })
      bildirimEkle(opsiyonForm.satisciId, 'Stok Opsiyonu Oluşturuldu',
        `${opsiyonForm.miktar} adet ${opsiyonModal.stokAdi} ürünü için opsiyon oluşturuldu.`,
        'bilgi', '/stok-opsiyon')
      toast.success(`Opsiyon oluşturuldu (${yeni.opsiyonNo}).`)
      setOpsiyonModal(null)
      setOpsiyonForm(bosOpsiyonForm)
    } catch (e) {
      toast.error('Opsiyon kaydedilemedi: ' + (e?.message || 'bilinmeyen hata'))
    }
  }

  const formAc = () => {
    setForm({ ...bosForm, stokKodu: stokKoduOlustur(urunler) })
    setKodModu('otomatik')
    setDuzenleId(null)
    setOzellikDegerleri({})
    setGoster(true)
    setTimeout(() => formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const duzenleAc = (u) => {
    setForm({
      stokKodu: u.stokKodu,
      stokAdi: u.stokAdi,
      birim: u.birim,
      marka: u.marka || '',
      grupKodu: u.grupKodu || '',
      minStok: u.minStok || '',
      alisFiyat: u.alisFiyat || '',
      birimFiyat: u.birimFiyat || '',
      raf: u.raf || '',
      aciklama: u.aciklama || '',
      ilkStok: '',
      gorselUrl: u.gorselUrl || '',
      katalogdaGoster: u.katalogdaGoster !== false,
      model: u.model || '',
      seriTakipli: !!u.seriTakipli,  // DB'den gerçek değeri al
      seriKalemleri: [],
      topluSN: '',
      kategoriId: u.kategoriId || '',
      urunTipi: u.urunTipi || 'stoklu',
      barkod: u.barkod || '',
      tedarikci: u.tedarikci || '',
      tedarikciUrunKodu: u.tedarikciUrunKodu || '',
      garantiSuresiAy: u.garantiSuresiAy || '',
      paraBirimi: u.paraBirimi || 'TRY',
      aktif: u.aktif !== false,
      dokumanUrl: u.dokumanUrl || '',
      dokumanAd: u.dokumanAd || '',
      aileId: u.aileId || '',
    })
    setKodModu('manuel')
    setDuzenleId(u.id)
    setGoster(true)
    setTimeout(() => formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    // Ürünün kayıtlı teknik özellik değerlerini yükle (Faz 2)
    setOzellikDegerleri({})
    urunOzellikleriGetir(u.id)
      .then(m => setOzellikDegerleri(Object.fromEntries(m)))
      .catch(() => setOzellikDegerleri({}))
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

  // Teknik özellik değerlerini kaydet — yalnız seçili kategori zincirinde geçerli
  // olanlar yazılır; kategori değişmişse artık geçersiz kalan eskiler silinir ('')
  const ozellikleriKaydet = async (urunId) => {
    const gecerliIds = new Set(
      kategoriOzellikleri(ozellikTanimlar, kategoriler, form.kategoriId).map(t => t.id)
    )
    const paket = {}
    for (const [k, v] of Object.entries(ozellikDegerleri)) {
      paket[k] = gecerliIds.has(Number(k)) ? v : ''
    }
    if (Object.keys(paket).length === 0) return
    try {
      await urunOzellikleriKaydet(urunId, paket)
      setUrunOzellikMap(null)  // filtre map'i bayatladı — gerekince yeniden yüklenir
    } catch (e) {
      toast.error(e?.message || 'Teknik özellikler kaydedilemedi.')
    }
  }

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
        await ozellikleriKaydet(duzenleId)

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
              // Özet 'giris' hareketi YAZILMAZ — DB köprü trigger'ı her yeni kalem
              // için 'Ana Depo Girişi' kaydını zaten yazıyor; ikisi birden defteri
              // ÇİFT şişiriyordu: 191 SN = 382 giriş görünüyordu (06.08 denetimi).
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
            if (yeniHareket) bakiyeGuncelle(form.stokKodu, fark > 0 ? 'giris' : 'cikis', Math.abs(fark))
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
        await ozellikleriKaydet(yeniUrun.id)
        if (form.seriTakipli && seriKalemleri.length > 0) {
          const gecerli = seriKalemleri.filter(k => k.seriNo?.trim())
          if (gecerli.length > 0) {
            try {
              const hazir = gecerli.map(k => ({
                stokKodu: form.stokKodu,
                seriNo: k.seriNo.trim(),
                barkod: k.barkod?.trim() || null,
                marka: form.marka || null,
                model: form.model || form.stokAdi,
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
          if (yeniHareket) bakiyeGuncelle(form.stokKodu, 'giris', Number(form.ilkStok))
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
    // HARD delete — onaysız silme çok tehlikeliydi (tek tıkla stok kartı gidiyordu)
    const u = urunler.find(x => x.id === id)
    const onay = await confirm({
      baslik: 'Stok Kartını Sil',
      mesaj: `"${u?.stokKodu || ''} — ${u?.stokAdi || ''}" kalıcı olarak silinecek. Bu işlem geri alınamaz. Emin misin?`,
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    await stokUrunSil(id)
    setUrunler(prev => prev.filter(u => u.id !== id))
    toast.success('Ürün silindi.')
  }

  // Arama: normal metin + SN eşleşmesi (SN girildiğinde ilgili ürünü göster)
  const aramaSN = arama.trim().toLowerCase()
  const snEslesenKod = aramaSN.length >= 3 ? globalSN.get(aramaSN) : null
  // Akıllı arama (Faz 3): "2 mp 2.8 dome kamera" → kategori + özellik filtreleri
  const aramaCozum = arama.trim().length >= 2
    ? sorguCozumle(arama, kategoriler, ozellikTanimlar)
    : null
  const akilliAktif = !!aramaCozum?.akilli
  // Kategori filtresi: seçilen dal + tüm alt dalları (örn. "Kamera Sistemleri"
  // seçilince IP/Analog/Termal/PTZ kameralar da gelir)
  const filtreKatSet = filtreKatId ? altKategoriIdleri(kategoriler, Number(filtreKatId)) : null
  // Özellik filtreleri (Faz 2): seçilen dalda filtrelenebilir alanlar =
  // dalın alt ağacında + ata zincirinde tanımlı secim/evet_hayir özellikleri
  const filtrelenebilirOzellikler = (() => {
    if (!filtreKatId) return []
    const kapsam = altKategoriIdleri(kategoriler, Number(filtreKatId))
    for (const t of kategoriOzellikleri(ozellikTanimlar, kategoriler, Number(filtreKatId))) {
      kapsam.add(t.kategoriId)  // ata zincirindeki tanım kategorileri de kapsansın
    }
    return ozellikTanimlar.filter(t =>
      t.aktif !== false && kapsam.has(t.kategoriId) && (t.tip === 'secim' || t.tip === 'evet_hayir')
    )
  })()
  const aktifOzellikFiltre = Object.entries(ozellikFiltre).filter(([, v]) => v)
  const gorunenUrunler = urunler.filter((u) => {
    if (!pasifGoster && u.aktif === false) return false
    if (filtreKatSet && !filtreKatSet.has(u.kategoriId)) return false
    // Eksik bilgi süzgeci — küme henüz yüklenmediyse özellik koşulu uygulanmaz
    if (eksikFiltre) {
      const gorselYok = !String(u.gorselUrl || '').trim()
      const ozellikYok = ozellikliIdler ? !ozellikliIdler.has(Number(u.id)) : false
      if (eksikFiltre === 'gorsel' && !gorselYok) return false
      if (eksikFiltre === 'ozellik' && !ozellikYok) return false
      if (eksikFiltre === 'ikisi' && !(gorselYok && ozellikYok)) return false
    }
    // Özellik filtreleri — map henüz yüklenmediyse filtre uygulanmaz
    if (aktifOzellikFiltre.length > 0 && urunOzellikMap) {
      const uMap = urunOzellikMap.get(u.id)
      for (const [oid, v] of aktifOzellikFiltre) {
        if (!uMap || uMap.get(Number(oid)) !== v) return false
      }
    }
    if (snEslesenKod && u.stokKodu === snEslesenKod) return true
    if (aramaSN && aramaSN.length >= 3) {
      // Kısmi SN eşleşmesi de: globalSN içinde SN aramada geçenler var mı?
      for (const [sn, kod] of globalSN) {
        if (sn.includes(aramaSN) && u.stokKodu === kod) return true
      }
    }
    const metinAra = (urun, sorgu) => trContains(
      `${urun.stokKodu || ''} ${urun.stokAdi || ''} ${urun.marka || ''} ${urun.grupKodu || ''} ${urun.barkod || ''} ${urun.tedarikciUrunKodu || ''} ${katYol.get(urun.kategoriId) || ''}`,
      sorgu,
    )
    // Akıllı arama: "2 mp 2.8 dome kamera" → kategori dalı + özellik eşitliği + kalan metin.
    // ÖNEMLİ: özellik verisi girilmemiş ürünler kaybolmasın diye metin araması
    // dışlanmaz — özellik eşleşmesi VEYA adında/modelinde geçen metin yeterli
    // (örn. "2 MP" hem etiketli ürünleri hem adında "2MP" geçenleri bulur).
    if (akilliAktif) {
      return urunEslesiyorMu(u, aramaCozum, kategoriler, urunOzellikMap, metinAra) || metinAra(u, arama)
    }
    return metinAra(u, arama)
  })

  const toplamSayfa = Math.max(1, Math.ceil(gorunenUrunler.length / sayfaBoyutu))
  const aktifSayfa = Math.min(sayfa, toplamSayfa)
  const sayfadakiUrunler = gorunenUrunler.slice(
    (aktifSayfa - 1) * sayfaBoyutu,
    aktifSayfa * sayfaBoyutu,
  )

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
          <Button variant="tertiary" size="sm" iconLeft={<Download size={13} strokeWidth={1.5} />} onClick={excelIndir}>Excel indir</Button>
          <Button variant="tertiary" size="sm" iconLeft={<Upload size={13} strokeWidth={1.5} />} onClick={() => dosyaRef.current?.click()}>Excel aktar</Button>
          <input ref={dosyaRef} type="file" accept=".xlsx,.xls" onChange={excelOku} style={{ display: 'none' }} />
          <Button variant="secondary" size="sm" iconLeft={<ClipboardList size={13} strokeWidth={1.5} />} onClick={() => navigate('/stok-opsiyon')}>Opsiyonlar</Button>
          <Button variant="secondary" size="sm" iconLeft={<ArrowLeftRight size={13} strokeWidth={1.5} />} onClick={() => navigate('/stok-hareketleri')}>Hareketler</Button>
          <Button variant="secondary" size="sm" iconLeft={<AlertTriangle size={13} strokeWidth={1.5} />} onClick={() => navigate('/stok-kritik')}>Kritik Seviye</Button>
          <Button variant="secondary" size="sm" iconLeft={<ClipboardCheck size={13} strokeWidth={1.5} />} onClick={() => navigate('/stok-sayim')}>Sayım</Button>
          <Button variant="secondary" size="sm" iconLeft={<BarChart3 size={13} strokeWidth={1.5} />} onClick={() => navigate('/depo-raporlar')}>Depo Raporları</Button>
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
            placeholder='Akıllı ara: "2 mp 2.8 dome kamera", model, marka, barkod, SN…'
          />
          {snEslesenKod && (
            <div style={{ fontSize: 11, color: 'var(--accent-primary)', marginTop: 4 }}>
              🔎 SN eşleşti — {snEslesenKod}
            </div>
          )}
          {akilliAktif && (
            <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ font: '600 10px/16px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                Algılandı:
              </span>
              {aramaCozum.rozetler.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  title="Bu filtreyi kaldır"
                  onClick={() => {
                    // Kalan rozetler + serbest metinden aramayı yeniden kur —
                    // tıklanan terim aramadan düşer
                    const parcalar = []
                    aramaCozum.rozetler.forEach((x, j) => {
                      if (j === i) return
                      if (x.tip === 'kategori') parcalar.push(x.etiket)
                      else if (x.etiket.endsWith(': Evet')) parcalar.push(x.etiket.split(':')[0])
                      else parcalar.push(x.etiket.split(': ')[1] || '')
                    })
                    if (aramaCozum.kalan) parcalar.push(aramaCozum.kalan)
                    setArama(parcalar.filter(Boolean).join(' '))
                  }}
                  style={{
                    padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                    font: '500 11px/16px var(--font-sans)',
                    background: r.tip === 'kategori' ? 'var(--brand-primary)' : 'var(--brand-primary-soft)',
                    color: r.tip === 'kategori' ? '#fff' : 'var(--brand-primary)',
                    border: '1px solid var(--brand-primary)',
                    cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}
                >
                  {r.etiket}
                  <X size={10} strokeWidth={2} />
                </button>
              ))}
              {aramaCozum.kalan && (
                <span style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                  + "{aramaCozum.kalan}" metni
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ minWidth: 220 }}>
          <CustomSelect value={filtreKatId} onChange={(e) => setFiltreKatId(e.target.value)}>
            <option value="">Tüm kategoriler</option>
            {katSecenekler.map(k => <option key={k.id} value={k.id}>{k.etiket}</option>)}
          </CustomSelect>
        </div>
        {/* EKSİK BİLGİ — katalog kalitesi denetimi (18.08 kullanıcı isteği).
            className="w-auto" ŞART: verilmezse select tüm satırı kaplar. */}
        <CustomSelect className="w-auto" value={eksikFiltre}
          onChange={(e) => setEksikFiltre(e.target.value)} style={{ minWidth: 190 }}>
          <option value="">Eksik bilgi: filtre yok</option>
          <option value="gorsel">Görseli olmayanlar</option>
          <option value="ozellik">Teknik özelliği olmayanlar</option>
          <option value="ikisi">Görseli + özelliği olmayanlar</option>
        </CustomSelect>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            checked={pasifGoster}
            onChange={(e) => setPasifGoster(e.target.checked)}
            style={{ width: 14, height: 14, accentColor: 'var(--brand-primary)' }}
          />
          Pasifleri göster
        </label>
        {admin && (
          <Button
            variant="secondary" size="sm"
            iconLeft={<FolderTree size={13} strokeWidth={1.5} />}
            onClick={() => setKategoriModal(true)}
          >
            Kategoriler
          </Button>
        )}
      </div>

      {/* Özellik filtreleri (Faz 2) — kategori seçilince o dalın teknik
          özellikleriyle daraltma: "2 MP" + "Dome" gibi kombinasyonlar */}
      {filtrelenebilirOzellikler.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center',
          padding: '8px 10px', background: 'var(--surface-sunken)',
          border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
        }}>
          <span style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
            Teknik filtre
          </span>
          {filtrelenebilirOzellikler.map(t => (
            <div key={t.id} style={{ minWidth: 140 }}>
              <CustomSelect
                className="w-auto"
                value={ozellikFiltre[t.id] || ''}
                onChange={(e) => setOzellikFiltre(prev => ({ ...prev, [t.id]: e.target.value }))}
                style={{ padding: '5px 10px', font: '400 12px/18px var(--font-sans)' }}
              >
                <option value="">{t.ad}</option>
                {t.tip === 'evet_hayir'
                  ? [<option key="e" value="Evet">{t.ad}: Evet</option>, <option key="h" value="Hayır">{t.ad}: Hayır</option>]
                  : (t.secenekler || []).map(s => <option key={s} value={s}>{t.ad}: {s}</option>)}
              </CustomSelect>
            </div>
          ))}
          {aktifOzellikFiltre.length > 0 && (
            <button
              type="button"
              onClick={() => setOzellikFiltre({})}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--danger)', font: '500 12px/16px var(--font-sans)', padding: '0 4px',
              }}
            >
              Temizle ({aktifOzellikFiltre.length})
            </button>
          )}
        </div>
      )}

      {/* Form card */}
      {goster && (
        <Card ref={formCardRef} style={{ marginBottom: 16 }}>
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
              <Label>Kategori</Label>
              <CustomSelect value={form.kategoriId} onChange={(e) => setForm({ ...form, kategoriId: e.target.value ? Number(e.target.value) : '' })}>
                <option value="">Kategori seç…</option>
                {katSecenekler.map(k => <option key={k.id} value={k.id}>{k.etiket}</option>)}
              </CustomSelect>
              {form.kategoriId && (
                <p className="t-caption" style={{ marginTop: 4, color: 'var(--brand-primary)' }}>
                  {katYol.get(Number(form.kategoriId))}
                </p>
              )}
            </div>
            <div>
              <Label>Ürün tipi</Label>
              <CustomSelect value={form.urunTipi} onChange={(e) => setForm({ ...form, urunTipi: e.target.value })}>
                {URUN_TIPLERI.map(t => <option key={t.id} value={t.id}>{t.ad}</option>)}
              </CustomSelect>
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
            {alisFiyatGoster && (
              <div>
                <Label>Alış fiyatı</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.alisFiyat}
                  onChange={(e) => setForm({ ...form, alisFiyat: e.target.value })}
                  placeholder="0,00"
                  min="0"
                />
                <p className="t-caption" style={{ marginTop: 4 }}>
                  Depo Raporları'ndaki stok değeri hesabında kullanılır.
                </p>
              </div>
            )}
            <div>
              <Label>Liste satış fiyatı</Label>
              <div style={{ display: 'flex', gap: 6 }}>
                <Input
                  type="number"
                  step="0.01"
                  value={form.birimFiyat}
                  onChange={(e) => setForm({ ...form, birimFiyat: e.target.value })}
                  placeholder="0,00"
                  min="0"
                  style={{ flex: 1 }}
                />
                <div style={{ width: 84, flexShrink: 0 }}>
                  <CustomSelect value={form.paraBirimi} onChange={(e) => setForm({ ...form, paraBirimi: e.target.value })}>
                    {PARA_BIRIMLERI.map(p => <option key={p} value={p}>{p}</option>)}
                  </CustomSelect>
                </div>
              </div>
            </div>
            <div>
              <Label>Raf / Lokasyon</Label>
              <Input
                value={form.raf}
                onChange={(e) => setForm({ ...form, raf: e.target.value })}
                placeholder="örn. A-3"
              />
            </div>
            <div>
              <Label>Ürün barkodu</Label>
              <Input
                value={form.barkod}
                onChange={(e) => setForm({ ...form, barkod: e.target.value })}
                placeholder="Ürün kutusu barkodu (SN'den bağımsız)"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </div>
            <div>
              <Label>Tedarikçi</Label>
              <Input
                value={form.tedarikci}
                onChange={(e) => setForm({ ...form, tedarikci: e.target.value })}
                placeholder="Tedarikçi firma adı"
              />
            </div>
            <div>
              <Label>Tedarikçi ürün kodu</Label>
              <Input
                value={form.tedarikciUrunKodu}
                onChange={(e) => setForm({ ...form, tedarikciUrunKodu: e.target.value })}
                placeholder="Tedarikçinin kendi kodu"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </div>
            <div>
              <Label>Garanti süresi (ay)</Label>
              <Input
                type="number"
                value={form.garantiSuresiAy}
                onChange={(e) => setForm({ ...form, garantiSuresiAy: e.target.value })}
                placeholder="örn. 24"
                min="0"
              />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <Label>
                Ürün ailesi
                <span style={{ marginLeft: 6, color: 'var(--text-tertiary)', fontWeight: 400 }}>
                  (aynı serinin modelleri birbirine bağlanır — örn. Trassir C32 Serisi)
                </span>
              </Label>
              {yeniAileAd === null ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <CustomSelect
                      value={form.aileId}
                      onChange={(e) => setForm({ ...form, aileId: e.target.value ? Number(e.target.value) : '' })}
                    >
                      <option value="">— Aile yok —</option>
                      {aileler.map(a => <option key={a.id} value={a.id}>{a.ad}</option>)}
                    </CustomSelect>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setYeniAileAd('')}>+ Yeni aile</Button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Input
                    value={yeniAileAd}
                    onChange={(e) => setYeniAileAd(e.target.value)}
                    placeholder="Aile adı — örn. Trassir C32 Kamera Serisi"
                    autoFocus
                    onKeyDown={async (e) => {
                      if (e.key !== 'Enter' || !yeniAileAd.trim()) return
                      try {
                        const a = await aileEkle(yeniAileAd)
                        setAileler(prev => [...prev, a].sort((x, y) => x.ad.localeCompare(y.ad, 'tr')))
                        setForm(f => ({ ...f, aileId: a.id }))
                        setYeniAileAd(null)
                        toast.success('Aile oluşturuldu ve seçildi.')
                      } catch (err) { toast.error(err?.message || 'Aile eklenemedi.') }
                    }}
                    style={{ flex: 1 }}
                  />
                  <Button
                    variant="primary" size="sm"
                    disabled={!yeniAileAd.trim()}
                    onClick={async () => {
                      try {
                        const a = await aileEkle(yeniAileAd)
                        setAileler(prev => [...prev, a].sort((x, y) => x.ad.localeCompare(y.ad, 'tr')))
                        setForm(f => ({ ...f, aileId: a.id }))
                        setYeniAileAd(null)
                        toast.success('Aile oluşturuldu ve seçildi.')
                      } catch (err) { toast.error(err?.message || 'Aile eklenemedi.') }
                    }}
                  >
                    Oluştur
                  </Button>
                  <Button variant="tertiary" size="sm" onClick={() => setYeniAileAd(null)}>Vazgeç</Button>
                </div>
              )}
              {/* Kardeş modeller — aynı aileden diğer ürünler */}
              {form.aileId && (() => {
                const kardesler = urunler.filter(u => u.aileId === Number(form.aileId) && u.id !== duzenleId)
                if (kardesler.length === 0) return null
                return (
                  <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ font: '600 10px/16px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      Aynı aileden:
                    </span>
                    {kardesler.slice(0, 8).map(u => (
                      <button
                        key={u.id}
                        type="button"
                        title={u.stokAdi}
                        onClick={() => duzenleAc(u)}
                        style={{
                          padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                          font: '500 11px/16px var(--font-sans)',
                          background: 'var(--surface-sunken)', color: 'var(--text-secondary)',
                          border: '1px solid var(--border-default)', cursor: 'pointer',
                          maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {u.stokKodu} — {u.stokAdi}
                      </button>
                    ))}
                    {kardesler.length > 8 && (
                      <span className="t-caption" style={{ color: 'var(--text-tertiary)' }}>+{kardesler.length - 8} daha</span>
                    )}
                  </div>
                )
              })()}
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

          {/* Teknik Özellikler (Faz 2) — kategori seçilince o dalın (+ üst dalların)
              admin tanımlı alanları otomatik açılır */}
          {(() => {
            const alanlar = kategoriOzellikleri(ozellikTanimlar, kategoriler, form.kategoriId)
            if (alanlar.length === 0) return null
            const deger = (id) => ozellikDegerleri[id] ?? ''
            const yaz = (id, v) => setOzellikDegerleri(prev => ({ ...prev, [id]: v }))
            return (
              <div style={{
                marginBottom: 16, padding: 14,
                background: 'var(--brand-primary-soft)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
              }}>
                <p className="t-label" style={{ color: 'var(--brand-primary)', marginBottom: 10 }}>
                  Teknik Özellikler — {kategoriler.find(k => k.id === Number(form.kategoriId))?.ad}
                  <span style={{ marginLeft: 6, color: 'var(--text-tertiary)', fontWeight: 400 }}>
                    (boş bırakılan alanlar kaydedilmez)
                  </span>
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                  {alanlar.map(t => (
                    <div key={t.id}>
                      <Label>{t.ad}{t.birim ? ` (${t.birim})` : ''}</Label>
                      {t.tip === 'secim' ? (
                        <CustomSelect value={deger(t.id)} onChange={(e) => yaz(t.id, e.target.value)}>
                          <option value="">—</option>
                          {(t.secenekler || []).map(s => <option key={s} value={s}>{s}</option>)}
                        </CustomSelect>
                      ) : t.tip === 'evet_hayir' ? (
                        <CustomSelect value={deger(t.id)} onChange={(e) => yaz(t.id, e.target.value)}>
                          <option value="">—</option>
                          <option value="Evet">Evet</option>
                          <option value="Hayır">Hayır</option>
                        </CustomSelect>
                      ) : t.tip === 'sayi' ? (
                        <Input
                          type="number"
                          className="sayi-sade"
                          value={deger(t.id)}
                          onChange={(e) => yaz(t.id, e.target.value)}
                          placeholder="0"
                        />
                      ) : (
                        <Input
                          value={deger(t.id)}
                          onChange={(e) => yaz(t.id, e.target.value)}
                          placeholder="—"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

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

            {/* Teknik doküman (datasheet) — private bucket, imzalı URL ile açılır */}
            <div style={{ marginTop: 14 }}>
              <Label>
                Teknik doküman
                <span style={{ marginLeft: 6, color: 'var(--text-tertiary)', fontWeight: 400 }}>
                  (datasheet, kılavuz — en fazla {DOKUMAN_MAX_MB} MB)
                </span>
              </Label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button
                  variant="secondary"
                  iconLeft={<FileText size={14} strokeWidth={1.5} />}
                  onClick={() => dokumanRef.current?.click()}
                  disabled={dokumanYukleniyor || !form.stokKodu}
                >
                  {dokumanYukleniyor ? 'Yükleniyor…' : form.dokumanUrl ? 'Değiştir' : 'Doküman yükle'}
                </Button>
                {form.dokumanUrl && (
                  <>
                    <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      📄 {form.dokumanAd || 'doküman'}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        // Pencere URL'den ÖNCE (popup engeli — bkz. src/lib/dosyaAc.js)
                        const sonuc = await yeniSekmedeAc(() => dokumanImzaliUrl(form.dokumanUrl))
                        if (!sonuc.ok) toast.error(acmaHatasi(sonuc, 'Doküman açılamadı.'))
                      }}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--brand-primary)', font: '500 12px/16px var(--font-sans)' }}
                    >
                      Görüntüle
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, dokumanUrl: '', dokumanAd: '' })}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--danger)', font: '500 12px/16px var(--font-sans)' }}
                    >
                      Kaldır
                    </button>
                  </>
                )}
              </div>
              <input
                ref={dokumanRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files[0]
                  if (!file || !form.stokKodu) return
                  setDokumanYukleniyor(true)
                  try {
                    const { path, ad } = await dokumanYukle(file, form.stokKodu)
                    setForm(prev => ({ ...prev, dokumanUrl: path, dokumanAd: ad }))
                  } catch (err) {
                    toast.error(err?.message || 'Doküman yüklenemedi.')
                  } finally {
                    setDokumanYukleniyor(false)
                    e.target.value = ''
                  }
                }}
              />
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

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.aktif}
                onChange={(e) => setForm({ ...form, aktif: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: 'var(--brand-primary)' }}
              />
              <span style={{ font: '400 13px/18px var(--font-sans)', color: form.aktif ? 'var(--text-secondary)' : 'var(--danger)' }}>
                Ürün aktif {!form.aktif && '— pasif ürünler listede ve aramalarda gizlenir'}
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
                        <Alert variant="danger" icon={<AlertIkon size={13} strokeWidth={1.5} />} style={{ marginTop: 8 }}>
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
                        <Alert variant="warning" icon={<AlertIkon size={13} strokeWidth={1.5} />} style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 12 }}>
                            Aynı S/N tekrar okundu, sadece 1 kez eklenir: <strong>{a.tekrar.slice(0, 5).join(', ')}{a.tekrar.length > 5 ? ` … (+${a.tekrar.length - 5})` : ''}</strong>
                          </div>
                        </Alert>
                      )}
                      {a.buUrunde.length > 0 && (
                        <Alert variant="warning" icon={<AlertIkon size={13} strokeWidth={1.5} />} style={{ marginTop: 8 }}>
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
                <TH>Kategori</TH>
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
                    // Satır tıklaması eskiden YALNIZ S/N takipli ürünlerde açıktı;
                    // kullanıcı hangi satırın tıklanabilir olduğunu kestiremiyordu.
                    // ModelDetay takipsiz ürünü de tam gösteriyor (bakiye/min stok/
                    // giriş-çıkış KPI'ları + son hareketler), o yüzden ayrım kalktı.
                    // Aksiyon butonları e.stopPropagation() ile korunuyor.
                    onClick={() => navigate(`/stok/model/${encodeURIComponent(u.stokKodu)}`)}
                    style={{ cursor: 'pointer' }}
                    title="Ürün detayını aç"
                  >
                    <TD>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CodeBadge>{u.stokKodu}</CodeBadge>
                        {seriTakipli && <Badge tone="brand">S/N</Badge>}
                        {u.aktif === false && <Badge tone="kayip">Pasif</Badge>}
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
                    <TD>
                      {u.kategoriId && kategoriler.length ? (
                        <span title={katYol.get(u.kategoriId)}>
                          <Badge tone="neutral">{kategoriler.find(k => k.id === u.kategoriId)?.ad || '—'}</Badge>
                        </span>
                      ) : u.grupKodu ? <Badge tone="neutral">{u.grupKodu}</Badge> : '—'}
                    </TD>
                    <TD align="right">
                      {/* Rozet sayının SOLUNDA tek satırda — alt alta dizilince
                          satır şişiyor ve sayı diğer hücrelerle hizasızdı */}
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                        {kritik ? <Badge tone="kayip">Kritik</Badge> : null}
                        <span style={{
                          fontWeight: 500,
                          fontSize: 14,
                          color: kritik ? 'var(--danger)' : 'var(--text-primary)',
                          fontVariantNumeric: 'normal',
                          fontFeatureSettings: 'normal',
                        }}>
                          {String(Math.round(Number(bakiye) || 0))}
                        </span>
                      </div>
                      {seriTakipli && u.beklenenAdet ? (
                        <div style={{ marginTop: 2, font: '500 11px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                          / {u.beklenenAdet} hedef
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

      {/* Kategori yönetimi — yalnız admin (RLS'de de yazma admin'e kilitli) */}
      <KategoriYonetimi
        open={kategoriModal}
        onClose={() => setKategoriModal(false)}
        kategoriler={kategoriler}
        yenile={async () => {
          const kat = await kategorileriGetir(true)
          setKategoriler(kat || [])
        }}
        ozellikler={ozellikTanimlar}
        ozellikYenile={async () => {
          const oz = await ozellikTanimlariGetir(true)
          setOzellikTanimlar(oz || [])
        }}
      />
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

// Kategori ağacı yönetimi — ekle / yeniden adlandır / pasife al (silme yok:
// ürünler bağlı olabilir, on delete restrict; pasif = listelerden düşer).
// Faz 2: dal başına ⚙ ile teknik özellik tanımları yönetilir.
function KategoriYonetimi({ open, onClose, kategoriler, yenile, ozellikler = [], ozellikYenile }) {
  const { toast } = useToast()
  const [yeniAd, setYeniAd] = useState('')
  const [ekleUstId, setEkleUstId] = useState(null)   // hangi dala alt ekleniyor (null = kök)
  const [duzenleKatId, setDuzenleKatId] = useState(null)
  const [duzenleAd, setDuzenleAd] = useState('')
  const [mesgul, setMesgul] = useState(false)
  const [ozellikKat, setOzellikKat] = useState(null) // ⚙ açılan kategori — özellik görünümü

  const { kokler, cocuklar } = agacKur(kategoriler)

  const ekle = async () => {
    if (!yeniAd.trim()) return
    setMesgul(true)
    try {
      await kategoriEkle({ ad: yeniAd, ustId: ekleUstId })
      setYeniAd('')
      setEkleUstId(null)
      await yenile()
      toast.success('Kategori eklendi.')
    } catch (e) {
      toast.error(e?.message || 'Kategori eklenemedi.')
    } finally { setMesgul(false) }
  }

  const adKaydet = async () => {
    if (!duzenleAd.trim() || !duzenleKatId) return
    setMesgul(true)
    try {
      await kategoriGuncelle(duzenleKatId, { ad: duzenleAd })
      setDuzenleKatId(null)
      await yenile()
      toast.success('Kategori güncellendi.')
    } catch (e) {
      toast.error(e?.message || 'Güncellenemedi.')
    } finally { setMesgul(false) }
  }

  const aktifDegistir = async (k) => {
    setMesgul(true)
    try {
      await kategoriGuncelle(k.id, { aktif: !(k.aktif !== false) })
      await yenile()
    } catch (e) {
      toast.error(e?.message || 'Değiştirilemedi.')
    } finally { setMesgul(false) }
  }

  const Satir = ({ k, seviye }) => {
    const pasif = k.aktif === false
    return (
      <>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 8px', paddingLeft: 8 + seviye * 22,
          borderBottom: '1px solid var(--border-default)',
          opacity: pasif ? 0.55 : 1,
        }}>
          <FolderTree size={13} strokeWidth={1.5} style={{ color: seviye === 0 ? 'var(--brand-primary)' : 'var(--text-tertiary)', flexShrink: 0 }} />
          {duzenleKatId === k.id ? (
            <span style={{ display: 'inline-flex', gap: 6, flex: 1, alignItems: 'center' }}>
              <Input
                value={duzenleAd}
                onChange={(e) => setDuzenleAd(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') adKaydet() }}
                style={{ height: 28, flex: 1 }}
                autoFocus
              />
              <Button variant="primary" size="sm" onClick={adKaydet} disabled={mesgul}>Kaydet</Button>
              <Button variant="tertiary" size="sm" onClick={() => setDuzenleKatId(null)}>İptal</Button>
            </span>
          ) : (
            <>
              <span style={{ font: seviye === 0 ? '600 13px/18px var(--font-sans)' : '400 13px/18px var(--font-sans)', color: 'var(--text-primary)', flex: 1 }}>
                {k.ad} {pasif && <Badge tone="kayip">Pasif</Badge>}
              </span>
              <button
                aria-label="Teknik özellikler"
                title={`Teknik özellik tanımları (${ozellikler.filter(o => o.kategoriId === k.id).length})`}
                onClick={() => setOzellikKat(k)}
                style={{
                  ...iconBtnStyle,
                  color: ozellikler.some(o => o.kategoriId === k.id) ? 'var(--brand-primary)' : 'var(--text-secondary)',
                }}
              >
                <SlidersHorizontal size={12} strokeWidth={1.5} />
              </button>
              <button
                aria-label="Alt kategori ekle"
                title="Alt kategori ekle"
                onClick={() => { setEkleUstId(k.id); setYeniAd('') }}
                style={iconBtnStyle}
              >
                <Plus size={12} strokeWidth={1.5} />
              </button>
              <button
                aria-label="Yeniden adlandır"
                title="Yeniden adlandır"
                onClick={() => { setDuzenleKatId(k.id); setDuzenleAd(k.ad) }}
                style={iconBtnStyle}
              >
                <Pencil size={12} strokeWidth={1.5} />
              </button>
              <button
                aria-label={pasif ? 'Aktifleştir' : 'Pasife al'}
                title={pasif ? 'Aktifleştir' : 'Pasife al'}
                onClick={() => aktifDegistir(k)}
                style={{ ...iconBtnStyle, color: pasif ? 'var(--success)' : 'var(--danger)' }}
                disabled={mesgul}
              >
                {pasif ? <Eye size={12} strokeWidth={1.5} /> : <EyeOff size={12} strokeWidth={1.5} />}
              </button>
            </>
          )}
        </div>
        {ekleUstId === k.id && (
          <div style={{ display: 'flex', gap: 6, padding: '6px 8px', paddingLeft: 8 + (seviye + 1) * 22, background: 'var(--brand-primary-soft)' }}>
            <Input
              value={yeniAd}
              onChange={(e) => setYeniAd(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') ekle() }}
              placeholder={`"${k.ad}" altına yeni kategori…`}
              style={{ height: 28, flex: 1 }}
              autoFocus
            />
            <Button variant="primary" size="sm" onClick={ekle} disabled={mesgul || !yeniAd.trim()}>Ekle</Button>
            <Button variant="tertiary" size="sm" onClick={() => setEkleUstId(null)}>Vazgeç</Button>
          </div>
        )}
        {(cocuklar.get(k.id) || []).map(c => <Satir key={c.id} k={c} seviye={seviye + 1} />)}
      </>
    )
  }

  // ⚙ görünümü: seçilen dalın teknik özellik tanımları
  if (ozellikKat) {
    return (
      <Modal
        open={open}
        onClose={() => { setOzellikKat(null); onClose() }}
        title={`Teknik Özellikler — ${ozellikKat.ad}`}
        width={680}
      >
        <OzellikYonetimi
          kategori={ozellikKat}
          ozellikler={ozellikler.filter(o => o.kategoriId === ozellikKat.id)}
          geri={() => setOzellikKat(null)}
          yenile={ozellikYenile}
        />
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Stok Kategorileri" width={640}>
      <p className="t-caption" style={{ marginBottom: 10, color: 'var(--text-tertiary)' }}>
        Kategoriler hiyerarşiktir; pasife alınan dal ürün formunda ve filtrelerde görünmez.
        Ürün bağlı olabileceği için silme yerine pasife alma kullanılır.
        Dal başına ⚙ ile teknik özellik alanları tanımlanır — üst dala tanımlanan
        özellik tüm alt dallarda da geçerlidir.
      </p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <Input
          value={ekleUstId === null ? yeniAd : ''}
          onChange={(e) => { setEkleUstId(null); setYeniAd(e.target.value) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && ekleUstId === null) ekle() }}
          placeholder="Yeni ana kategori adı…"
          style={{ flex: 1 }}
        />
        <Button variant="primary" size="sm" onClick={() => { setEkleUstId(null); ekle() }} disabled={mesgul || ekleUstId !== null || !yeniAd.trim()}>
          Ana kategori ekle
        </Button>
      </div>
      <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', maxHeight: 460, overflowY: 'auto' }}>
        {kokler.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', font: '400 13px/18px var(--font-sans)' }}>
            Henüz kategori yok.
          </div>
        ) : kokler.map(k => <Satir key={k.id} k={k} seviye={0} />)}
      </div>
    </Modal>
  )
}

// Bir kategorinin teknik özellik tanımları — ekle / yeniden adlandır / pasife al.
// Silme yok: ürün değerleri bağlı (on delete cascade değerleri de götürür).
const bosOzellikForm = { ad: '', tip: 'secim', secenekler: '', birim: '' }

function OzellikYonetimi({ kategori, ozellikler, geri, yenile }) {
  const { toast } = useToast()
  const [oForm, setOForm] = useState(bosOzellikForm)
  const [duzenleId, setDuzenleId] = useState(null)
  const [mesgul, setMesgul] = useState(false)

  const formuDoldur = (o) => {
    setDuzenleId(o.id)
    setOForm({
      ad: o.ad,
      tip: o.tip,
      secenekler: Array.isArray(o.secenekler) ? o.secenekler.join(', ') : '',
      birim: o.birim || '',
    })
  }

  const kaydet = async () => {
    if (!oForm.ad.trim()) { toast.error('Özellik adı zorunlu.'); return }
    const secenekler = oForm.tip === 'secim'
      ? oForm.secenekler.split(',').map(s => s.trim()).filter(Boolean)
      : null
    if (oForm.tip === 'secim' && (!secenekler || secenekler.length === 0)) {
      toast.error('Seçim listesi için en az 1 seçenek girin (virgülle ayırın).')
      return
    }
    setMesgul(true)
    try {
      if (duzenleId) {
        await ozellikGuncelle(duzenleId, {
          ad: oForm.ad, tip: oForm.tip, secenekler,
          birim: oForm.tip === 'sayi' ? (oForm.birim || null) : null,
        })
        toast.success('Özellik güncellendi.')
      } else {
        await ozellikEkle({
          kategoriId: kategori.id, ad: oForm.ad, tip: oForm.tip, secenekler,
          birim: oForm.tip === 'sayi' ? (oForm.birim || null) : null,
          sira: ozellikler.length + 1,
        })
        toast.success('Özellik eklendi.')
      }
      setOForm(bosOzellikForm)
      setDuzenleId(null)
      await yenile?.()
    } catch (e) {
      toast.error(e?.message || 'Kaydedilemedi.')
    } finally { setMesgul(false) }
  }

  const aktifDegistir = async (o) => {
    setMesgul(true)
    try {
      await ozellikGuncelle(o.id, { aktif: !(o.aktif !== false) })
      await yenile?.()
    } catch (e) {
      toast.error(e?.message || 'Değiştirilemedi.')
    } finally { setMesgul(false) }
  }

  const tipAd = (t) => OZELLIK_TIPLERI.find(x => x.id === t)?.ad || t

  return (
    <div>
      <button
        type="button"
        onClick={geri}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--brand-primary)', font: '500 13px/18px var(--font-sans)', padding: 0,
        }}
      >
        <ArrowLeft size={14} strokeWidth={1.5} /> Kategorilere dön
      </button>
      <p className="t-caption" style={{ marginBottom: 10, color: 'var(--text-tertiary)' }}>
        Bu alanlar "{kategori.ad}" ve tüm alt dallarındaki ürün formlarında otomatik açılır.
      </p>

      {/* Ekle / düzenle formu */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.4fr auto', gap: 6,
        alignItems: 'end', marginBottom: 12, padding: 10,
        background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)',
      }}>
        <div>
          <Label>Özellik adı</Label>
          <Input
            value={oForm.ad}
            onChange={(e) => setOForm({ ...oForm, ad: e.target.value })}
            placeholder="örn. Çözünürlük"
          />
        </div>
        <div>
          <Label>Tip</Label>
          <CustomSelect value={oForm.tip} onChange={(e) => setOForm({ ...oForm, tip: e.target.value })}>
            {OZELLIK_TIPLERI.map(t => <option key={t.id} value={t.id}>{t.ad}</option>)}
          </CustomSelect>
        </div>
        {oForm.tip === 'secim' ? (
          <div>
            <Label>Seçenekler (virgülle)</Label>
            <Input
              value={oForm.secenekler}
              onChange={(e) => setOForm({ ...oForm, secenekler: e.target.value })}
              placeholder="2 MP, 4 MP, 8 MP"
            />
          </div>
        ) : oForm.tip === 'sayi' ? (
          <div>
            <Label>Birim (ops.)</Label>
            <Input
              value={oForm.birim}
              onChange={(e) => setOForm({ ...oForm, birim: e.target.value })}
              placeholder="m, W, port…"
            />
          </div>
        ) : <div />}
        <div style={{ display: 'flex', gap: 6 }}>
          <Button variant="primary" size="sm" onClick={kaydet} disabled={mesgul || !oForm.ad.trim()}>
            {duzenleId ? 'Güncelle' : 'Ekle'}
          </Button>
          {duzenleId && (
            <Button variant="tertiary" size="sm" onClick={() => { setDuzenleId(null); setOForm(bosOzellikForm) }}>
              İptal
            </Button>
          )}
        </div>
      </div>

      {/* Tanım listesi */}
      <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', maxHeight: 400, overflowY: 'auto' }}>
        {ozellikler.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', font: '400 13px/18px var(--font-sans)' }}>
            Bu kategoriye henüz özellik tanımlanmadı.
          </div>
        ) : ozellikler.map(o => {
          const pasif = o.aktif === false
          return (
            <div key={o.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 10px', borderBottom: '1px solid var(--border-default)',
              opacity: pasif ? 0.55 : 1,
            }}>
              <SlidersHorizontal size={12} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                  {o.ad}{o.birim ? ` (${o.birim})` : ''} {pasif && <Badge tone="kayip">Pasif</Badge>}
                </span>
                <div className="t-caption" style={{ color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tipAd(o.tip)}{Array.isArray(o.secenekler) && o.secenekler.length > 0 ? ` — ${o.secenekler.join(' / ')}` : ''}
                </div>
              </div>
              <button
                aria-label="Düzenle"
                title="Düzenle"
                onClick={() => formuDoldur(o)}
                style={iconBtnStyle}
              >
                <Pencil size={12} strokeWidth={1.5} />
              </button>
              <button
                aria-label={pasif ? 'Aktifleştir' : 'Pasife al'}
                title={pasif ? 'Aktifleştir' : 'Pasife al'}
                onClick={() => aktifDegistir(o)}
                style={{ ...iconBtnStyle, color: pasif ? 'var(--success)' : 'var(--danger)' }}
                disabled={mesgul}
              >
                {pasif ? <Eye size={12} strokeWidth={1.5} /> : <EyeOff size={12} strokeWidth={1.5} />}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Stok
