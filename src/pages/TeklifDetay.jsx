// build-cache-buster 1782976128315
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, Printer, FileText, Bell, RefreshCw,
  CheckCircle2, XCircle, Receipt, Inbox, Send, StickyNote, Save, Calculator,
  GripVertical, Percent, Copy, History, LayoutTemplate, Eye, FileSignature, Clock,
  ShoppingCart,
} from 'lucide-react'
// Not: ↑↓ butonlar drag+drop lehine kaldırıldı (satirTasi fonksiyonu artık kullanılmıyor).
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import BelgePaylasModal from '../components/BelgePaylasModal'
import { siparisOnayNotuKaydet, siparisOnayGeriAl, tekliftenSiparisiOlustur } from '../services/siparisOnayService'
import { useAuth } from '../context/AuthContext'
import { useDovizKuru } from '../hooks/useDovizKuru'
import { useHatirlatma } from '../context/HatirlatmaContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import {
  teklifleriGetir, teklifGetir, teklifEkle, teklifGuncelle, stokFiyatGecmisi, paylasimDurumOzet,
} from '../services/teklifService'
import { sablonlariGetir, sablonEkle, sablonSil } from '../services/teklifSablonService'
import { bayiTeklifKontrol } from '../services/bayiService'
import { ciktiLoglariGetir, ISLEM_ISIMLERI } from '../services/teklifCiktiLogService'
import { supabase } from '../lib/supabase'
import { toCamel } from '../lib/mapper'
import { tekliftenDurum, TEKLIF_DURUM, TEKLIF_DURUM_META, sonrakiDurumlar, durumdanDbAlanlar, GONDERIME_UYGUN_DURUMLAR, paylasimdanIleriDurum } from '../lib/teklifDurumlari'
import { satislariGetir } from '../services/satisService'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { musterileriGetir, musteriGetir } from '../services/musteriService'
import {
  tekliftenTalep, faturaTalebiEkle, teklifFaturaTalebiGetir,
} from '../services/faturaTalepService'
import { musteriKisileriniGetir } from '../services/musteriKisiService'
import { teklifinAktifSozlesmesi } from '../services/satisSozlesmeService'
import { stokUrunleriniGetir } from '../services/stokService'
import AkilliUrunSecici from '../components/AkilliUrunSecici'
import HizliStokEkleModal from '../components/HizliStokEkleModal'
import HizliMusteriEkleModal from '../components/HizliMusteriEkleModal'
import CustomSelect from '../components/CustomSelect'
import { SkeletonDetay } from '../components/Skeleton'
import {
  Button, Input, Textarea, Label, Card, CardTitle, Badge, CodeBadge,
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

// Kopyalama fiyat ayarı — saf fonksiyon (modal önizlemesi + kopyalama aynı hesabı kullanır)
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100
const kopyaSatirlariHesapla = (satirlar, { mod, yuzde }) =>
  (satirlar || []).map(s => {
    const yeni = { ...s, id: crypto.randomUUID() }
    const oran = 1 + (Number(yuzde) || 0) / 100
    if (mod === 'zam') {
      yeni.birimFiyat = r2((Number(s.birimFiyat) || 0) * oran)
    } else if (mod === 'kar' && Number(s.alisFiyat) > 0) {
      yeni.birimFiyat = r2(Number(s.alisFiyat) * oran)
      yeni.katsayi = r2(oran) // Alış Katsayısı modalı da yeni oranı hatırlasın
    }
    return yeni
  })

// Satırlardan genel toplam (TeklifDetay.toplamHesapla ile aynı formül)
const satirlardanGenelToplam = (satirlar, genelIskonto) => {
  const araToplam = (satirlar || []).reduce((sum, s) => {
    const ara = (Number(s.miktar) || 0) * (Number(s.birimFiyat) || 0)
    return sum + ara - ara * ((Number(s.iskonto) || 0) / 100)
  }, 0)
  const kdvToplam = (satirlar || []).reduce((sum, s) => {
    const ara = (Number(s.miktar) || 0) * (Number(s.birimFiyat) || 0)
    const net = ara - ara * ((Number(s.iskonto) || 0) / 100)
    return sum + net * ((Number(s.kdv) || 0) / 100)
  }, 0)
  return araToplam - araToplam * ((Number(genelIskonto) || 0) / 100) + kdvToplam
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
  { value: 'standart',        label: 'Standart' },
  { value: 'standart_pacal',  label: 'Standart Proje' },
  { value: 'trassir',         label: 'Trassir' },
  { value: 'trassir_pacal',   label: 'Trassir Proje' },
  { value: 'karel',           label: 'Karel' },
  { value: 'karel_pacal',     label: 'Karel Proje' },
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
  // Fatura talebi (mig 165) — early return'ün ÜSTÜNDE (Rules of Hooks)
  const [faturaTalebi, setFaturaTalebi] = useState(null)
  const [mevcutSozlesme, setMevcutSozlesme] = useState(null)
  const [faturaTalepAcik, setFaturaTalepAcik] = useState(false)
  const [faturaTalepTaslak, setFaturaTalepTaslak] = useState(null)
  const [faturaTalepNotu, setFaturaTalepNotu] = useState('')
  const [faturaTalepMesgul, setFaturaTalepMesgul] = useState(false)
  // Siparişe aktarma (mig 168 zinciri) — early return'ün ÜSTÜNDE (Rules of Hooks)
  const [ilgiliSiparis, setIlgiliSiparis] = useState(null)
  const [siparisMesgul, setSiparisMesgul] = useState(false)
  // Hızlı stok ekleme modal'ı state — early return'ün ÜSTÜNDE olmalı
  // (Rules of Hooks: tüm hook'lar her render'da aynı sırada çağrılmalı)
  const [hizliStokAcik, setHizliStokAcik] = useState(false)
  const [paylasimModalAcik, setPaylasimModalAcik] = useState(false)
  const [hizliStokSatirIndex, setHizliStokSatirIndex] = useState(null)
  // Hızlı müşteri ekleme modal'ı
  const [hizliMusteriAcik, setHizliMusteriAcik] = useState(false)
  // Seçili müşterinin yetkili kişileri (kayıtlıysa dropdown'a düşer)
  const [musteriKisileri, setMusteriKisileri] = useState([])
  // Durum değiştirme modal (spec 10 durum) — Rules of Hooks: early return'ün ÜSTÜNDE olmalı
  const [durumModalAcik, setDurumModalAcik] = useState(false)
  const [kopyalaModalAcik, setKopyalaModalAcik] = useState(false)
  const [ciktiLoglari, setCiktiLoglari] = useState([])

  // Çıktı geçmişi (kim/ne zaman yazdırdı-indirdi) — izlenebilirlik
  useEffect(() => {
    if (yeni) return
    ciktiLoglariGetir(Number(id)).then(setCiktiLoglari).catch(() => {})
  }, [id, yeni])
  // Satış Fiyatı Hesapla modal — satır index + alış/katsayı state
  const [hesaplaModal, setHesaplaModal] = useState(null) // null | { idx, alis, katsayi }
  // Toplu iskonto modal — tüm satırlara aynı % uygula
  const [topluIskonto, setTopluIskonto] = useState(null) // null | { deger: string }
  // Teklif şablonları modal + liste (lazy — modal ilk açılınca çekilir)
  const [sablonModalAcik, setSablonModalAcik] = useState(false)
  const [sablonlar, setSablonlar] = useState(null) // null = henüz yüklenmedi
  const [sablonAd, setSablonAd] = useState('')
  // "Müşteri açtı mı?" rozeti — paylaşım linki açılma istatistiği
  const [paylasimDurum, setPaylasimDurum] = useState(null)

  useEffect(() => {
    if (yeni) return
    paylasimDurumOzet('teklif', id).then(setPaylasimDurum).catch(() => setPaylasimDurum(null))
  }, [id, yeni])

  // Durum senkronu: paylaşım linki kanıtı (gönderildi / müşteri açtı) durumun
  // önündeyse spek_durum'u bir defalık ileri sar. Eskiden gönderilmiş (onGönderildi
  // callback'i yokken) ya da callback'i başarısız olmuş teklifler yon_onayladi'da
  // takılıp stepper'da "Müşteriye Gönderim"i işaretlemiyordu — müşteri açmış olsa da.
  const durumSenkronRef = useRef(false)
  useEffect(() => {
    if (yeni || !paylasimDurum || !mevcutTeklif || durumSenkronRef.current) return
    const mevcutDurum = tekliftenDurum({
      spekDurum: mevcutTeklif.spekDurum,
      onayDurumu: mevcutTeklif.onayDurumu,
      teklifOnayi: mevcutTeklif.teklifOnayi,
    })
    const yeniDurum = paylasimdanIleriDurum(mevcutDurum, paylasimDurum)
    if (!yeniDurum) return
    durumSenkronRef.current = true
    const alanlar = durumdanDbAlanlar(yeniDurum)
    teklifGuncelle(id, alanlar)
      .then(() => {
        setForm(f => ({ ...f, ...alanlar }))
        setMevcutTeklif(t => (t ? { ...t, ...alanlar } : t))
      })
      .catch(e => {
        durumSenkronRef.current = false
        console.warn('[TeklifDetay] durum senkronu yazılamadı:', e?.message)
      })
  }, [yeni, id, paylasimDurum, mevcutTeklif])

  // Ctrl+P → tarayıcının ham sayfa yazdırması yerine antetli PDF çıktısı.
  // (Kullanıcı refleksi: yazdırmak için Ctrl+P — ekran sayfası yazdırılabilir
  // değil, PDF butonuyla aynı çıktıya yönlendiriyoruz.)
  const teklifTipiRef = useRef('standart')
  useEffect(() => { teklifTipiRef.current = form?.teklifTipi || 'standart' })
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'p') return
      e.preventDefault()
      if (yeni) {
        toast.warning('Yazdırmak için önce teklifi kaydedin — PDF kayıtlı veriden üretilir.')
        return
      }
      window.open(`/teklifler/${id}/yazdir?tip=${teklifTipiRef.current}`, '_blank')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, yeni])
  // Drag & drop sensors — Rules of Hooks: early return'ün ÜSTÜNDE olmalı
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Ön doldurum (kopyala / görüşmeden-keşiften teklif) — BUG GEÇMİŞİ:
  // Okurken localStorage'ı hemen silmek, bileşen auth/route akışında yeniden
  // mount olduğunda veriyi kaybettiriyordu (LS tüketilmiş, form boş — "kopyala
  // hiçbir veriyi açmıyor"). Kural: OKURKEN SİLME; form'a uygulandıktan sonra
  // sil + remount'lar için window yedeği tut. 10 dk'dan eski kayıt yok sayılır
  // (kopyalanıp yarıda bırakılan veri günler sonra boş teklifi doldurmasın).
  const [onDoldurum] = useState(() => {
    if (!yeni) return null
    try {
      const d = JSON.parse(localStorage.getItem('teklif_on_doldurum') || 'null')
      if (d) {
        if (d.__ts && Date.now() - d.__ts > 10 * 60 * 1000) {
          localStorage.removeItem('teklif_on_doldurum')
          return null
        }
        return d
      }
      // Aynı oturumda remount yedeği (yalnız tazeyse — eski kopya boş teklifi doldurmasın)
      const w = window.__teklifOnDoldurum
      if (w?.__ts && Date.now() - w.__ts < 10 * 60 * 1000) return w
      return null
    } catch { return null }
  })

  useEffect(() => {
    const promises = [
      musterileriGetir().then(setMusteriler),
      gorusmeleriGetir().then(setGorusmeler),
      // Pasif ürünler teklife eklenemesin (mig 151)
      stokUrunleriniGetir().then(d => setStokUrunler((d || []).filter(u => u.aktif !== false))),
      teklifleriGetir().then(data => {
        setTumTeklifler(data)
        // TEK-XXXX formatindaki mevcut en yuksek numarayi bul (eski farkli formatli
        // 545 kayit + yeni TEK- formati karisik — total count + 1 yapinca duplicate olur)
        const tekNumaralari = (data || [])
          .map(t => t.teklifNo?.match(/^TEK-(\d+)$/)?.[1])
          .filter(Boolean)
          .map(n => parseInt(n, 10))
        const sonNumara = tekNumaralari.length > 0 ? Math.max(...tekNumaralari) : 0
        setTeklifSayisi(sonNumara)
      }),
    ]
    if (!yeni) {
      promises.push(teklifGetir(id).then(setMevcutTeklif))
      promises.push(satislariGetir().then(data => {
        setIlgiliFatura(data.find(s => s.teklifId === id) || null)
      }))
      // Bu teklif için açılmış fatura talebi var mı? (tek sorgu — tüm liste değil)
      promises.push(teklifFaturaTalebiGetir(id).then(setFaturaTalebi))
      // Tekliften zaten sözleşme oluşturulmuş mu? (teklif başına tek sözleşme, mig 186)
      promises.push(teklifinAktifSozlesmesi(id).then(setMevcutSozlesme))
      // Teklif zaten siparişe aktarılmış mı?
      promises.push(
        supabase.from('siparisler')
          .select('id, siparis_no, durum')
          .eq('teklif_id', Number(id))
          .neq('durum', 'iptal')
          .limit(1)
          .then(({ data }) => setIlgiliSiparis(data?.[0] ? toCamel(data[0]) : null))
      )
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
        musteriId: onDoldurum?.musteriId || '',
        firmaAdi: onDoldurum?.firmaAdi || '',
        musteriYetkilisi: onDoldurum?.musteriYetkilisi || '',
        hazirlayan: kullanici?.ad,
        konu: onDoldurum?.konu || '',
        odemeSecenegi: onDoldurum?.odemeSecenegi || 'Peşin',
        paraBirimi: onDoldurum?.paraBirimi || 'TL',
        dovizKuru: '',
        onayDurumu: 'takipte',
        gorusmeId: onDoldurum?.gorusmeId || '',
        aciklama: onDoldurum?.aciklama || '',
        satirlar: onDoldurum?.satirlar || [],
        genelIskonto: onDoldurum?.genelIskonto || 0,
        musteriTalepId: onDoldurum?.musteriTalepId || null,
        musteriTalepNo: onDoldurum?.musteriTalepNo || '',
        teklifTipi: onDoldurum?.teklifTipi || 'standart',
      })
      // Ön doldurum form'a UYGULANDI — şimdi temizle; remount olursa window yedeği taşır
      if (onDoldurum) {
        window.__teklifOnDoldurum = { ...onDoldurum, __ts: onDoldurum.__ts || Date.now() }
        try { localStorage.removeItem('teklif_on_doldurum') } catch { /* sessiz */ }
      }
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

  // form.musteriId değiştiğinde o müşterinin kayıtlı kişilerini yükle
  useEffect(() => {
    if (!form?.musteriId) {
      setMusteriKisileri([])
      return
    }
    let iptal = false
    musteriKisileriniGetir(form.musteriId)
      .then(d => { if (!iptal) setMusteriKisileri(d || []) })
      .catch(() => { if (!iptal) setMusteriKisileri([]) })
    return () => { iptal = true }
  }, [form?.musteriId])

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

  // ── Otomatik taslak (yeni teklif) ──────────────────────────────────
  // Sekme kazayla kapanırsa girilen veriler kaybolmasın: form 2sn debounce ile
  // localStorage'a yazılır; mount'ta taslak varsa "Devam Et / Yoksay" banner'ı çıkar.
  const [taslakBanner, setTaslakBanner] = useState(null) // null | { form, ts }

  useEffect(() => {
    if (!yeni || onDoldurum) return
    try {
      const t = JSON.parse(localStorage.getItem('teklif_taslak_yeni') || 'null')
      const dolu = t?.form && (t.form.firmaAdi || t.form.konu || (t.form.satirlar || []).length > 0)
      if (dolu) setTaslakBanner(t)
    } catch { /* bozuk taslak — yoksay */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!yeni || !form) return
    // Banner cevaplanmadan otomatik kayıt eski taslağın üzerine yazmasın
    if (taslakBanner) return
    const timer = setTimeout(() => {
      const dolu = form.firmaAdi || form.konu || (form.satirlar || []).length > 0
      if (!dolu) return
      try { localStorage.setItem('teklif_taslak_yeni', JSON.stringify({ form, ts: Date.now() })) } catch { /* quota — sessiz geç */ }
    }, 2000)
    return () => clearTimeout(timer)
  }, [yeni, form, taslakBanner])

  // Teklifler listesindeki "Proforma oluştur" ?proforma=1 ile gelir — form
  // yüklenince modal kendiliğinden açılır (listedeki tek tık hissi korunur).
  // faturaTalebiAc early return'lerin ALTINDA tanımlı; bu effect ise Rules of
  // Hooks gereği ÜSTTE olmak zorunda (bu dosyada 3 kez beyaz sayfa yaşandı) —
  // köprü ref ile kurulur, render gövdesinde en güncel fonksiyon atanır.
  const proformaOtoAcRef = useRef(new URLSearchParams(window.location.search).get('proforma') === '1')
  const faturaTalebiAcRef = useRef(null)
  useEffect(() => {
    if (!form || !proformaOtoAcRef.current) return
    proformaOtoAcRef.current = false   // tek sefer — form her düzenlemede değişir
    if (form.onayDurumu === 'kabul') faturaTalebiAcRef.current?.()
  }, [form])

  if (!veriYuklendi) {
    return <SkeletonDetay />
  }
  if (!yeni && !mevcutTeklif) {
    return (
      <div style={{ padding: 40, textAlign: 'center', maxWidth: 480, margin: '80px auto' }}>
        <h2 style={{ font: '700 20px/28px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>
          Teklif bulunamadı
        </h2>
        <p className="t-caption" style={{ marginTop: 8, marginBottom: 24 }}>
          #{id} numaralı teklif silinmiş veya erişilemiyor. Hatırlatma bildiriminden geldiyseniz teklif artık mevcut değil.
        </p>
        <Button variant="primary" onClick={() => navigate('/teklifler')}>Tekliflere Dön</Button>
      </div>
    )
  }
  if (!form) return <SkeletonDetay />

  const handleMusteriSec = (musteriId) => {
    // "+ Yeni Müşteri..." seçildiyse modal aç, seçimi değiştirme
    if (musteriId === '__yeni__') {
      setHizliMusteriAcik(true)
      return
    }
    const musteri = musteriler.find((m) => m.id?.toString() === musteriId)
    setForm({
      ...form,
      musteriId,
      firmaAdi: musteri ? musteri.firma : '',
      // Yetkiliyi default doldur — sonra dropdown'dan değiştirilebilir
      musteriYetkilisi: musteri ? `${musteri.ad} ${musteri.soyad}` : '',
    })
    // Müşterinin kayıtlı kişilerini çek (varsa dropdown'a düşecek)
    if (musteriId) {
      musteriKisileriniGetir(musteriId)
        .then(d => setMusteriKisileri(d || []))
        .catch(() => setMusteriKisileri([]))
    } else {
      setMusteriKisileri([])
    }
  }

  const stokSec = (index, stokKodu) => {
    // "+ Yeni Stok Ürünü..." seçildiyse modal aç, satıra dokunma
    if (stokKodu === '__yeni__') {
      setHizliStokSatirIndex(index)
      setHizliStokAcik(true)
      return
    }
    const urun = stokUrunler.find((u) => u.stokKodu === stokKodu)
    const yeniSatirlar = [...form.satirlar]
    yeniSatirlar[index] = {
      ...yeniSatirlar[index],
      stokKodu: urun?.stokKodu || '',
      stokAdi: urun?.stokAdi || '',
      birim: urun?.birim || 'Adet',
      marka: urun?.marka || '',
    }
    setForm({ ...form, satirlar: yeniSatirlar })
  }

  // Yeni stok eklendiğinde: listeye ekle + ilgili satıra otomatik ata
  const hizliStokEklendi = (yeni) => {
    if (!yeni) return
    setStokUrunler((prev) => [...prev, yeni])
    if (hizliStokSatirIndex != null) {
      const yeniSatirlar = [...form.satirlar]
      yeniSatirlar[hizliStokSatirIndex] = {
        ...yeniSatirlar[hizliStokSatirIndex],
        stokKodu: yeni.stokKodu,
        stokAdi: yeni.stokAdi,
        birim: yeni.birim || 'Adet',
        marka: yeni.marka || '',
      }
      setForm({ ...form, satirlar: yeniSatirlar })
    }
    setHizliStokSatirIndex(null)
  }

  const satirGuncelle = (index, alan, deger) => {
    const yeniSatirlar = [...form.satirlar]
    yeniSatirlar[index] = { ...yeniSatirlar[index], [alan]: deger }
    setForm({ ...form, satirlar: yeniSatirlar })
  }

  // Birden fazla alanı tek seferde güncelle (hesapla modalı: birimFiyat + alisFiyat)
  const satirGuncelleCoklu = (index, alanlar) => {
    const yeniSatirlar = [...form.satirlar]
    yeniSatirlar[index] = { ...yeniSatirlar[index], ...alanlar }
    setForm({ ...form, satirlar: yeniSatirlar })
  }

  // Kar% — alış fiyatı girilmişse (hesapla modalından) net satış üzerinden hesapla.
  // İskonto sonrası birim fiyat baz alınır; alış yoksa null → gösterge çizilmez.
  const satirKarYuzde = (satir) => {
    const alis = Number(satir.alisFiyat || 0)
    if (!(alis > 0)) return null
    const netSatis = Number(satir.birimFiyat || 0) * (1 - Number(satir.iskonto || 0) / 100)
    return ((netSatis - alis) / alis) * 100
  }

  const satirEkle = () => {
    setForm({ ...form, satirlar: [...form.satirlar, { ...bosUrun, id: crypto.randomUUID() }] })
  }

  const satirSil = (index) => {
    const yeniSatirlar = form.satirlar.filter((_, i) => i !== index)
    setForm({ ...form, satirlar: yeniSatirlar })
  }

  // dndSensors yukarıda tanımlı (Rules of Hooks — early return'ün üstünde).
  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = Number(String(active.id).replace('satir-', ''))
    const newIdx = Number(String(over.id).replace('satir-', ''))
    if (Number.isNaN(oldIdx) || Number.isNaN(newIdx)) return
    setForm(f => ({ ...f, satirlar: arrayMove(f.satirlar, oldIdx, newIdx) }))
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

    // BAYİ BLOKAJI (bayi spec §11/§18): firma adı bir bayi kartıyla eşleşiyorsa
    // ve bayi "Aktif" statüsünde değilse teklif kaydına izin verme.
    // Bayi kaydı olmayan normal müşteriler etkilenmez.
    try {
      const bayiKontrol = await bayiTeklifKontrol(form.firmaAdi)
      if (bayiKontrol.engel) {
        toast.error(bayiKontrol.mesaj)
        return
      }
    } catch (e) {
      console.error('[TeklifDetay bayi kontrol]', e)
    }

    // PARA BİRİMİ UYARISI: TL değilse onay sor — kullanıcı yanlışlıkla USD/EUR
    // seçmiş olabilir, fatura/PDF buna göre üretilir, sonradan düzeltmek zor olabilir.
    if (form.paraBirimi && form.paraBirimi !== 'TL') {
      const sembol = paraBirimleri.find(p => p.id === form.paraBirimi)?.sembol || ''
      const onay = window.confirm(
        `Bu teklif "${sembol} ${form.paraBirimi}" para biriminde kaydedilecek.\n\n` +
        `Toplam: ${sembol}${genelToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}\n\n` +
        `Devam etmek istiyor musunuz?`,
      )
      if (!onay) return
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
    // Kabul edilmiş teklif kabul DIŞINA düşürülürse onay kuyruklarından çıkar.
    // DİKKAT: Eski hali "kabul değilse her kayıtta sil" idi — yönetici onaylı
    // (ama müşteri kabulü henüz gelmemiş, onay_durumu='takipte') bir teklifi
    // herhangi biri düzenleyip kaydedince teklif_onayi + siparis_onayi
    // SİLİNİYORDU. Artık sadece gerçek düşürme anında (kabul → başka durum)
    // temizlenir.
    if (!yeni && mevcutTeklif?.onayDurumu === 'kabul' && form.onayDurumu !== 'kabul') {
      kaydedilecek.teklifOnayi = null
      kaydedilecek.siparisOnayi = null
    }
    try {
      if (yeni) {
        // teklif_no DB trigger 'tr_teklif_no_uret' tarafindan otomatik uretilir
        // (migration 055). Client teklif_no gondermez → trigger max+1 ile set eder.
        // Bu sayede race condition + stale state sorunlari yok.
        const { teklifNo: _omit, ...payload } = kaydedilecek
        // Spec: "Teklif kaydedildiğinde 'Yönetici Teklif Onayı Bekliyor' durumuna düşer"
        // Kullanıcı manuel farklı bir durum seçmediyse otomatik yon_onay_bekliyor.
        const hedefDurum = payload.spekDurum || 'yon_onay_bekliyor'
        const otomatikDurum = durumdanDbAlanlar(hedefDurum)
        const yeniTeklif = await teklifEkle({
          ...payload,
          ...otomatikDurum,
          olusturmaTarih: new Date().toISOString(),
        })
        if (yeniTeklif) {
          // Kayıt başarılı — otomatik taslağı temizle (yoksa bir sonraki yeni
          // teklifte "taslak bulundu" banner'ı yanlış çıkar)
          localStorage.removeItem('teklif_taslak_yeni')
          // Keşiften geldiyse keşfe geri bağla (KesifDetay "Teklife Aktar" akışı)
          if (onDoldurum?.kesifId) {
            supabase.from('kesifler')
              .update({ teklif_id: yeniTeklif.id })
              .eq('id', onDoldurum.kesifId)
              .then(({ error }) => { if (error) console.warn('[TeklifDetay] keşif bağlanamadı:', error.message) })
          }
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

  // ── Teklif şablonları ──────────────────────────────────────────────
  const sablonModaliAc = async () => {
    setSablonModalAcik(true)
    if (sablonlar === null) {
      const d = await sablonlariGetir()
      setSablonlar(d)
    }
  }

  const sablonUygula = (s) => {
    const eklenecek = (s.satirlar || []).map(x => ({ ...x, id: crypto.randomUUID() }))
    if (eklenecek.length === 0) { toast.warning('Şablonda satır yok.'); return }
    setForm(f => ({ ...f, satirlar: [...f.satirlar, ...eklenecek] }))
    setSablonModalAcik(false)
    toast.success(`"${s.ad}" şablonu eklendi — ${eklenecek.length} satır.`)
  }

  const sablonKaydet = async () => {
    const ad = sablonAd.trim()
    if (!ad) { toast.warning('Şablon adı girin.'); return }
    if (!form.satirlar.length) { toast.warning('Şablona kaydedilecek satır yok.'); return }
    try {
      const yeniSablon = await sablonEkle({
        ad,
        satirlar: form.satirlar,
        teklifTipi: form.teklifTipi || 'standart',
        olusturan: kullanici?.ad || '',
      })
      setSablonlar(prev => [yeniSablon, ...(prev || [])])
      setSablonAd('')
      toast.success(`"${ad}" şablonu kaydedildi.`)
    } catch (e) {
      toast.error('Şablon kaydedilemedi: ' + (e?.message || 'bilinmeyen hata'))
    }
  }

  const sablonuSil = async (s) => {
    const onay = await confirm({
      baslik: 'Şablonu Sil',
      mesaj: `"${s.ad}" şablonu silinsin mi? Bu işlem geri alınamaz.`,
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    try {
      await sablonSil(s.id)
      setSablonlar(prev => (prev || []).filter(x => x.id !== s.id))
      toast.success('Şablon silindi.')
    } catch (e) {
      toast.error('Şablon silinemedi: ' + (e?.message || 'bilinmeyen hata'))
    }
  }

  // Mevcut teklifi kopyalayarak yeni teklif başlat. localStorage ön-doldurum
  // mekanizması useState initializer'da (sadece MOUNT'ta) okunduğu için aynı
  // component'te route param değişimi yetmez — full reload ile temiz mount alırız.
  // Kopyala — fiyat ayarıyla (KopyalaModal'dan çağrılır).
  // ayar: { mod: 'birebir' | 'zam' | 'kar', yuzde: number }
  //   zam → tüm birim fiyatlara % uygula (negatif = indirim)
  //   kar → alış fiyatı olan satırlarda birimFiyat = alışFiyat × (1 + %/100)
  const teklifKopyala = (ayar = { mod: 'birebir', yuzde: 0 }) => {
    const satirlar = kopyaSatirlariHesapla(form.satirlar, ayar)
    localStorage.setItem('teklif_on_doldurum', JSON.stringify({
      __ts: Date.now(),
      musteriId: form.musteriId,
      firmaAdi: form.firmaAdi,
      musteriYetkilisi: form.musteriYetkilisi,
      konu: form.konu,
      aciklama: form.aciklama,
      satirlar,
      teklifTipi: form.teklifTipi,
      paraBirimi: form.paraBirimi,
      odemeSecenegi: form.odemeSecenegi,
      genelIskonto: form.genelIskonto,
    }))
    window.location.assign('/teklifler/yeni')
  }

  // Durum değiştirme (spec 10 durum) — durumModalAcik state yukarıda Rules of Hooks uyumlu
  const durumuDegistir = async (yeniDurum) => {
    // YÖNETİCİ ONAYI yalnız admin verebilir — modal herkese açık olduğundan
    // buton gizlense bile fonksiyon seviyesinde de kilitli (çift katman).
    if (yeniDurum === TEKLIF_DURUM.YON_ONAYLADI && kullanici?.rol !== 'admin') {
      toast.error('Yönetici onayını yalnız admin yetkisine sahip kullanıcılar verebilir.')
      return
    }
    // Teklif yönetici onayındayken durum tamamen adminin elinde — personelin
    // "Revizyon İstendi"ye basıp süreci karıştırması engellenir (Tarık vakası).
    if (spekDurumKey === TEKLIF_DURUM.YON_ONAY_BEKLIYOR && kullanici?.rol !== 'admin') {
      toast.error('Teklif yönetici onayında — bu aşamada durumu yalnız admin değiştirebilir.')
      return
    }
    const alanlar = durumdanDbAlanlar(yeniDurum) // { spekDurum, onayDurumu }
    if (yeni) {
      // Kayıt edilmemiş: sadece form state güncelle, kaydet'e basınca DB'ye yazılacak
      setForm({ ...form, ...alanlar })
      setDurumModalAcik(false)
      return
    }
    // "Siparişe Aktarıldı" SADECE kolon yazmak değildir — gerçek sipariş kaydı
    // doğmalı. Eskiden burası yalnız spek_durum/onay_durumu yazıyordu: teklif
    // "Siparişe Aktarıldı" görünüyor ama siparisler'de kayıt yok, Siparişler
    // listesi boş kalıyordu (sessiz kopukluk). Artık aynı fonksiyon hem butondan
    // hem durum modalından gerçek siparişi üretiyor.
    if (yeniDurum === TEKLIF_DURUM.SIPARISE_AKTARILDI) {
      await siparisiOlustur()
      return
    }
    try {
      await teklifGuncelle(id, alanlar)
      setForm(f => ({ ...f, ...alanlar }))
      setMevcutTeklif(t => t ? { ...t, ...alanlar } : t)
      toast.success(`Durum: ${TEKLIF_DURUM_META[yeniDurum]?.isim || yeniDurum}`)
      setDurumModalAcik(false)
    } catch (err) {
      const detay = [err?.message, err?.details, err?.hint].filter(Boolean).join(' · ')
      toast.error('Durum güncellenemedi: ' + (detay || 'bilinmeyen'))
    }
  }

  // Teklif → gerçek sipariş kaydı. tekliftenSiparisiOlustur kalemleri de taşır
  // ve teklif_id ile idempotenttir (aynı teklif iki kez siparişe dönüşmez).
  const siparisiOlustur = async () => {
    const onay = await confirm({
      baslik: 'Siparişe Aktar',
      mesaj: `${form.teklifNo} siparişe aktarılacak; kalemleriyle birlikte sipariş kaydı oluşturulacak. Devam edilsin mi?`,
      onayMetin: 'Siparişe Aktar', iptalMetin: 'Vazgeç',
    })
    if (!onay) return
    setSiparisMesgul(true)
    try {
      // NOT: bu fonksiyon obje değil sipariş NUMARASI (string) döner
      const siparisNo = await tekliftenSiparisiOlustur(id, {
        onaylayanId: kullanici?.id ?? null,
        onaylayanAd: kullanici?.ad ?? '',
      })
      const alanlar = durumdanDbAlanlar(TEKLIF_DURUM.SIPARISE_AKTARILDI)
      await teklifGuncelle(id, alanlar)
      setForm(f => ({ ...f, ...alanlar }))
      setMevcutTeklif(t => t ? { ...t, ...alanlar } : t)
      // "Siparişe git" için id lazım — kaydı geri çekiyoruz
      const { data } = await supabase.from('siparisler')
        .select('id, siparis_no, durum').eq('teklif_id', Number(id)).neq('durum', 'iptal').limit(1)
      setIlgiliSiparis(data?.[0] ? toCamel(data[0]) : { siparisNo, durum: 'aktif' })
      setDurumModalAcik(false)
      toast.success(`${siparisNo || 'Sipariş'} oluşturuldu.`)
    } catch (e) {
      toast.error('Siparişe aktarılamadı: ' + (e?.message || 'bilinmeyen hata'))
    } finally {
      setSiparisMesgul(false)
    }
  }

  // Fatura talebi — satışçı NUMARASIZ talep açar, fatura yetkilisi keser.
  // Eskiden bu buton localStorage'a yarım veri koyup /satislar/yeni açıyordu:
  // satışçı fatura numarasını kendisi uyduruyordu ve müşteri e-posta/telefon,
  // para birimi, vade, notlar hiç taşınmıyordu.
  const faturaTalebiAc = async () => {
    setFaturaTalepMesgul(true)
    try {
      const musteri = await musteriKartiniBul()
      setFaturaTalepTaslak(tekliftenTalep({ ...form, id, satirlar: form.satirlar }, musteri, kullanici))
      setFaturaTalepAcik(true)
      // (?proforma=1 otomatik açılışı yukarıdaki ref köprüsünden buraya gelir)
    } finally {
      setFaturaTalepMesgul(false)
    }
  }
  // ?proforma=1 köprüsü — effect üstte (Rules of Hooks), fonksiyon burada.
  faturaTalebiAcRef.current = faturaTalebiAc

  // Teklifin müşteri kartı — künye (vergi no / adres) faturaya lazım.
  // Tekliflerin ~yarısında musteri_id boş, firma adından eşleştiriyoruz.
  const musteriKartiniBul = async () => {
    try {
      if (form.musteriId) {
        const m = await musteriGetir(Number(form.musteriId))
        if (m) return m
      }
      const norm = (s) => (s || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim()
      const hedef = norm(form.firmaAdi)
      if (!hedef) return null
      const liste = await musterileriGetir()
      const bulunan = (liste || []).find(m => norm(m.firma) === hedef)
      return bulunan ? await musteriGetir(bulunan.id) : null
    } catch (e) {
      console.warn('[TeklifDetay] müşteri kartı bulunamadı:', e?.message)
      return null
    }
  }

  const faturaTalebiGonder = async () => {
    if (!faturaTalepTaslak) return
    setFaturaTalepMesgul(true)
    try {
      const kayit = await faturaTalebiEkle({ ...faturaTalepTaslak, talepNotu: faturaTalepNotu.trim() || null })
      setFaturaTalebi(kayit)
      setFaturaTalepAcik(false)
      setFaturaTalepNotu('')
      toast.success(`${kayit.talepNo} oluşturuldu — fatura yetkilisine bildirildi.`)
    } catch (e) {
      const mesaj = e?.code === '23505'
        ? 'Bu teklif için zaten bekleyen bir proforma var.'
        : 'Talep oluşturulamadı: ' + (e?.message || 'bilinmeyen hata')
      toast.error(mesaj)
    } finally {
      setFaturaTalepMesgul(false)
    }
  }

  // Spec sistem durumu (10 durum). ÖNCELİK: spek_durum kolonu (yeni sistem, gerçek
  // durum). O boşsa eski onayDurumu + teklif_onayi jsonb'den çıkarım yapılır.
  // (spekDurum atlanırsa gönderim/durum ilerlemeleri görünmez kalır — stepper takılır.)
  const spekDurumKey = tekliftenDurum({
    spekDurum: mevcutTeklif?.spekDurum,
    onayDurumu: form.onayDurumu,
    teklifOnayi: mevcutTeklif?.teklifOnayi,
  })
  const spekDurumMeta = TEKLIF_DURUM_META[spekDurumKey]

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

      {/* Kaydedilmemiş taslak banner'ı — yeni teklifte yarım kalan form varsa */}
      {yeni && taslakBanner && (
        <Alert variant="info" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div className="t-body-strong">Kaydedilmemiş taslak bulundu</div>
              <div className="t-caption" style={{ marginTop: 2 }}>
                {taslakBanner.form?.firmaAdi ? `${taslakBanner.form.firmaAdi} — ` : ''}
                {(taslakBanner.form?.satirlar || []).length} satır
                {taslakBanner.ts ? ` · ${new Date(taslakBanner.ts).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="secondary"
                onClick={() => {
                  localStorage.removeItem('teklif_taslak_yeni')
                  setTaslakBanner(null)
                }}
              >
                Yoksay
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setForm(f => ({ ...f, ...taslakBanner.form }))
                  setTaslakBanner(null)
                  toast.success('Taslak geri yüklendi.')
                }}
              >
                Devam Et
              </Button>
            </div>
          </div>
        </Alert>
      )}

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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 className="t-h1">{yeni ? 'Yeni teklif' : form.teklifNo}</h1>
            {!yeni && <CodeBadge>{form.teklifNo}</CodeBadge>}
            {form.revizyon > 0 && <Badge tone="beklemede">Rev. {form.revizyon}</Badge>}
            {/* Spec 10 durum sistemi — tıklanabilir, modal ile değiştirilebilir */}
            {!yeni && spekDurumMeta && (
              <button
                type="button"
                onClick={() => {
                  // Yönetici onayı aşamasında durum rozetine yalnız admin dokunur
                  if (spekDurumKey === TEKLIF_DURUM.YON_ONAY_BEKLIYOR && kullanici?.rol !== 'admin') {
                    toast.error('Teklif yönetici onayında — bu aşamada durumu yalnız admin değiştirebilir.')
                    return
                  }
                  setDurumModalAcik(true)
                }}
                title="Durumu değiştirmek için tıkla"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '3px 10px', borderRadius: 6,
                  fontSize: 12, fontWeight: 700,
                  color: spekDurumMeta.renk,
                  background: `${spekDurumMeta.renk}18`,
                  border: `1px solid ${spekDurumMeta.renk}55`,
                  cursor: 'pointer',
                }}
              >
                {spekDurumMeta.isim}
                <span style={{ fontSize: 10, opacity: 0.7 }}>▾</span>
              </button>
            )}
            {/* Müşteri açtı rozeti — paylaşım linki açılma istatistiği */}
            {!yeni && paylasimDurum && (() => {
              const acildi = !!paylasimDurum.ilkAcilma
              const renk = acildi ? '#059669' : '#94A3B8'
              const zamanOnce = (t) => {
                if (!t) return ''
                const dk = Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 60000))
                if (dk < 60) return `${dk} dk önce`
                const saat = Math.round(dk / 60)
                if (saat < 24) return `${saat} saat önce`
                return `${Math.round(saat / 24)} gün önce`
              }
              return (
                <span
                  title={acildi
                    ? `İlk açılma: ${new Date(paylasimDurum.ilkAcilma).toLocaleString('tr-TR')} — toplam ${paylasimDurum.acilmaSayisi} görüntüleme`
                    : `Link gönderildi (${new Date(paylasimDurum.gonderimTarihi).toLocaleString('tr-TR')}), müşteri henüz açmadı`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 10px', borderRadius: 6,
                    fontSize: 12, fontWeight: 600,
                    color: renk, background: `${renk}18`, border: `1px solid ${renk}55`,
                    cursor: 'help',
                  }}
                >
                  <Eye size={12} strokeWidth={2} />
                  {acildi
                    ? `Müşteri açtı · ${zamanOnce(paylasimDurum.sonAcilma)}${paylasimDurum.acilmaSayisi > 1 ? ` (${paylasimDurum.acilmaSayisi}×)` : ''}`
                    : 'Henüz açılmadı'}
                </span>
              )
            })()}
          </div>
          {/* Bağlı Görüşme bilgi kartı — spec: "Teklif detayında hangi görüşmeden oluşturulduğu açık şekilde görünür" */}
          {(() => {
            const bagliGorusme = form.gorusmeId && gorusmeler.find(g => String(g.id) === String(form.gorusmeId))
            if (!bagliGorusme?.aktNo) return null
            return (
              <button
                type="button"
                onClick={() => navigate(`/gorusmeler/${bagliGorusme.id}`)}
                title="Kaynak görüşmeye git"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  marginTop: 8, padding: '6px 10px', borderRadius: 6,
                  background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{
                  fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                  color: '#3b82f6', padding: '2px 8px',
                  background: 'rgba(59,130,246,0.15)', borderRadius: 4,
                }}>{bagliGorusme.aktNo}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Kaynak görüşme
                </span>
                {bagliGorusme.tarih && (
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    · {(() => {
                      try {
                        const d = new Date(bagliGorusme.tarih)
                        return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`
                      } catch { return bagliGorusme.tarih }
                    })()}
                  </span>
                )}
                {bagliGorusme.gorusen && (
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    · {bagliGorusme.gorusen}
                  </span>
                )}
                {bagliGorusme.muhatapAd && (
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    · Muhatap: {bagliGorusme.muhatapAd}
                  </span>
                )}
              </button>
            )
          })()}
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
              iconLeft={<Copy size={14} strokeWidth={1.5} />}
              onClick={() => setKopyalaModalAcik(true)}
              title="Bu teklifin satırları ve bilgileriyle yeni bir teklif başlat"
            >
              Kopyala
            </Button>
          )}
          {!yeni && (
            <Button
              variant="secondary"
              iconLeft={<Printer size={14} strokeWidth={1.5} />}
              onClick={() => {
                // Onaysız teklif: çıktı alınabilir ama önce uyar — çıktıya her
                // sayfada "TASLAK — ONAYLANMAMIŞ TEKLİF" filigranı basılır.
                // (Müşteriye Gönder ayrıca kilitli kalır — o gerçek gönderim kanalı.)
                if (!GONDERIME_UYGUN_DURUMLAR.includes(spekDurumKey)) {
                  const devam = window.confirm(
                    'Bu teklif henüz yönetici onayı almadı.\n\n' +
                    'Çıktının üzerinde her sayfada "TASLAK — ONAYLANMAMIŞ TEKLİF" filigranı görünecek ' +
                    've dosya adına -TASLAK eklenecek.\n\n' +
                    'Taslak çıktı alınsın mı?',
                  )
                  if (!devam) return
                }
                // Form'da seçili olan tipi URL'ye geçir — kaydet zorunlu olmasın
                const tip = form.teklifTipi || 'standart'

                // Kaydedilmemiş değişiklik var mı? Para birimi/firma/konu/satırlar
                // değiştiyse PDF kaydedilmiş veriyi gösterir — kafa karıştırıcı.
                const degistiAlanlar = []
                if (mevcutTeklif) {
                  if ((form.paraBirimi || 'TL') !== (mevcutTeklif.paraBirimi || 'TL')) degistiAlanlar.push('Para birimi')
                  if ((form.firmaAdi || '') !== (mevcutTeklif.firmaAdi || '')) degistiAlanlar.push('Firma')
                  if ((form.konu || '') !== (mevcutTeklif.konu || '')) degistiAlanlar.push('Konu')
                  if (JSON.stringify(form.satirlar || []) !== JSON.stringify(mevcutTeklif.satirlar || [])) degistiAlanlar.push('Satırlar')
                  if (Number(form.dovizKuru || 0) !== Number(mevcutTeklif.dovizKuru || 0)) degistiAlanlar.push('Döviz kuru')
                  if (Number(form.genelIskonto || 0) !== Number(mevcutTeklif.genelIskonto || 0)) degistiAlanlar.push('Genel iskonto')
                  if ((form.aciklama || '') !== (mevcutTeklif.aciklama || '')) degistiAlanlar.push('Açıklama')
                }

                if (degistiAlanlar.length > 0) {
                  const onay = window.confirm(
                    `Kaydedilmemiş değişiklikler var:\n\n• ${degistiAlanlar.join('\n• ')}\n\n` +
                    `PDF kayıtlı veriyi gösterir, mevcut değişikliklerini göremezsin.\n\n` +
                    `OK: Yine de PDF aç\nCancel: Önce Kaydet'e bas, sonra PDF aç`,
                  )
                  if (!onay) return
                }

                window.open(`/teklifler/${id}/yazdir?tip=${tip}`, '_blank')
              }}
            >
              PDF
            </Button>
          )}
          {!yeni && (() => {
            // Spec: "Yönetici tarafından onaylanmayan teklif müşteriye gönderilemez"
            // Yön.Onayladı ve sonrası durumlarda gönderime izin ver (tek kaynak: lib).
            const gonderimeUygun = GONDERIME_UYGUN_DURUMLAR.includes(spekDurumKey)
            return (
              <Button
                variant={gonderimeUygun ? 'primary' : 'secondary'}
                iconLeft={<Send size={14} strokeWidth={1.5} />}
                onClick={() => {
                  if (!gonderimeUygun) {
                    toast.error('Yönetici onayı olmayan teklif müşteriye gönderilemez.')
                    return
                  }
                  setPaylasimModalAcik(true)
                }}
                title={gonderimeUygun ? 'Müşteriye e-posta / WhatsApp / SMS ile gönder' : 'Yönetici onayı gerek — durum: ' + (spekDurumMeta?.isim || spekDurumKey)}
              >
                Müşteriye Gönder{!gonderimeUygun && ' 🔒'}
              </Button>
            )
          })()}
          {!yeni && ilgiliFatura && (
            <Button
              variant="secondary"
              iconLeft={<CheckCircle2 size={14} strokeWidth={1.5} />}
              onClick={() => navigate(`/satislar/${ilgiliFatura.id}`)}
            >
              Faturaya git
            </Button>
          )}
          {/* Siparişe Aktar — zincirin eksik halkası. Müşteri onayladıysa görünür;
              zaten sipariş varsa "Siparişe git" olur. */}
          {!yeni && form?.onayDurumu === 'kabul' && (
            ilgiliSiparis ? (
              <Button
                variant="secondary"
                iconLeft={<ShoppingCart size={14} strokeWidth={1.5} />}
                onClick={() => ilgiliSiparis.id ? navigate(`/siparisler/${ilgiliSiparis.id}`) : navigate('/siparisler')}
                title={`${ilgiliSiparis.siparisNo} — siparişe git`}
              >
                {ilgiliSiparis.siparisNo || 'Siparişe git'}
              </Button>
            ) : (
              <Button
                variant="primary"
                iconLeft={<ShoppingCart size={14} strokeWidth={1.5} />}
                onClick={siparisiOlustur}
                disabled={siparisMesgul}
                title="Teklifi kalemleriyle birlikte siparişe aktar"
              >
                {siparisMesgul ? 'Aktarılıyor…' : 'Siparişe Aktar'}
              </Button>
            )
          )}

          {/* Fatura talebi — bekleyen/red talep varsa kuyruğa götür, yoksa talep aç */}
          {!yeni && !ilgiliFatura && form?.onayDurumu === 'kabul' && (
            faturaTalebi && faturaTalebi.durum === 'bekliyor' ? (
              <Button
                variant="secondary"
                iconLeft={<Clock size={14} strokeWidth={1.5} />}
                onClick={() => navigate('/fatura-talepleri')}
                title={`${faturaTalebi.talepNo} — fatura yetkilisinde`}
              >
                Proforma Gönderildi
              </Button>
            ) : (
              <Button
                variant="secondary"
                iconLeft={<Receipt size={14} strokeWidth={1.5} />}
                onClick={faturaTalebiAc}
                disabled={faturaTalepMesgul}
                title="Fatura yetkilisine proforma gönder — gerçek faturayı muhasebe keser"
              >
                {faturaTalepMesgul ? 'Hazırlanıyor…' : 'Proforma Oluştur'}
              </Button>
            )
          )}
          {/* Satış sözleşmesi (spec: teklif onaylandıktan sonra tek tuşla üretim).
              Zaten oluşturulmuşsa buton kilitlenir, mevcut sözleşmeye götürür (mig 186). */}
          {!yeni && form?.onayDurumu === 'kabul' && (
            mevcutSozlesme ? (
              <Button
                variant="secondary"
                iconLeft={<FileSignature size={14} strokeWidth={1.5} />}
                onClick={() => navigate(`/sozlesmeler/satis/${mevcutSozlesme.id}`)}
                title="Bu tekliften zaten sözleşme oluşturuldu — görüntülemek için tıklayın"
              >
                🔒 Sözleşme: {mevcutSozlesme.sozlesmeNo}
              </Button>
            ) : (
              <Button
                variant="secondary"
                iconLeft={<FileSignature size={14} strokeWidth={1.5} />}
                onClick={() => navigate(`/sozlesmeler/satis/yeni?teklifId=${id}`)}
              >
                Satış Sözleşmesi Oluştur
              </Button>
            )
          )}
          <Button variant="primary" onClick={kaydet}>Kaydet</Button>
        </div>
      </div>

      {/* Zaman çizelgesi — teklifin süreçte nerede olduğu tek bakışta */}
      {!yeni && <TeklifZamanCizelgesi durum={spekDurumKey} />}

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

      {/* Sipariş Onay Notu — kabul edilmiş ve onay bekliyor durumdaki tekliflerde gözükür */}
      {!yeni && form?.onayDurumu === 'kabul' && form?.siparisOnayi?.durum === 'bekliyor' && (
        <SiparisOnayNotuKart
          teklifId={Number(id)}
          mevcut={form.siparisOnayi?.onay_notu || ''}
          onKaydedildi={(yeni) => setForm(f => ({ ...f, siparisOnayi: yeni }))}
        />
      )}

      {/* Sipariş Onay Durum — onaylandı/reddedildi ise durumu ve 'Geri Al' butonu göster.
          Geri alma yetkisi: onaylayan kişinin kendisi VEYA üst yetkili. */}
      {!yeni && (form?.siparisOnayi?.durum === 'onayli' || form?.siparisOnayi?.durum === 'reddedildi') && (
        <SiparisOnayDurumKart
          teklifId={Number(id)}
          siparisOnayi={form.siparisOnayi}
          kullanici={kullanici}
          onGeriAlindi={(yeni) => setForm(f => ({ ...f, siparisOnayi: yeni }))}
        />
      )}

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
                <option value="__yeni__" style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>
                  + Yeni Müşteri Ekle…
                </option>
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
              {musteriKisileri.length > 0 ? (
                <>
                  <CustomSelect
                    value={
                      musteriKisileri.some(k => {
                        const ad = `${k.ad ?? ''} ${k.soyad ?? ''}`.trim()
                        return ad === form.musteriYetkilisi
                      })
                        ? form.musteriYetkilisi
                        : (form.musteriYetkilisi ? '__manuel__' : '')
                    }
                    onChange={e => {
                      const v = e.target.value
                      if (v === '__manuel__') {
                        setForm({ ...form, musteriYetkilisi: '' })
                      } else {
                        setForm({ ...form, musteriYetkilisi: v })
                      }
                    }}
                  >
                    <option value="">Yetkili seç…</option>
                    {musteriKisileri.map(k => {
                      const ad = `${k.ad ?? ''} ${k.soyad ?? ''}`.trim()
                      const ek = [k.unvan, k.telefon].filter(Boolean).join(' · ')
                      return (
                        <option key={k.id} value={ad}>
                          {ad}{ek ? ` — ${ek}` : ''}
                          {k.anaKisi ? ' ⭐' : ''}
                        </option>
                      )
                    })}
                    <option value="__manuel__">+ Manuel yaz…</option>
                  </CustomSelect>
                  {/* Dropdown'da seçili olmayan veya manuel modunda input görünür */}
                  {(!form.musteriYetkilisi || !musteriKisileri.some(k => {
                    const ad = `${k.ad ?? ''} ${k.soyad ?? ''}`.trim()
                    return ad === form.musteriYetkilisi
                  })) && (
                    <Input
                      value={form.musteriYetkilisi}
                      onChange={(e) => setForm({ ...form, musteriYetkilisi: e.target.value })}
                      placeholder="Yetkili adı"
                      style={{ marginTop: 8 }}
                    />
                  )}
                </>
              ) : (
                <Input
                  value={form.musteriYetkilisi}
                  onChange={(e) => setForm({ ...form, musteriYetkilisi: e.target.value })}
                  placeholder="Yetkili adı"
                />
              )}
              {form.musteriId && musteriKisileri.length === 0 && (
                <p style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                  Bu müşterinin kayıtlı ilgili kişisi yok — manuel yaz
                </p>
              )}
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
                disabled={!form.musteriId && !form.firmaAdi}
              >
                <option value="">
                  {(form.musteriId || form.firmaAdi) ? 'Görüşme seç…' : 'Önce müşteri seçin'}
                </option>
                {(() => {
                  // Önce musteriId ile filtrele (en güvenilir). Yoksa firmaAdi normalize edip karşılaştır.
                  const normalize = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')
                  const hedefMusteriId = form.musteriId ? String(form.musteriId) : null
                  const hedefFirma = normalize(form.firmaAdi)
                  const filtre = gorusmeler.filter((g) => {
                    if (hedefMusteriId && g.musteriId) {
                      return String(g.musteriId) === hedefMusteriId
                    }
                    return hedefFirma && normalize(g.firmaAdi) === hedefFirma
                  })
                  // Yeniden eskiye sırala (görüşmeler en yeniden gelir zaten ama emin olalım)
                  return filtre.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.aktNo || `G-${g.id}`} — {g.konu || g.amac || '—'}
                      {g.tarih ? ` · ${g.tarih}` : ''}
                    </option>
                  ))
                })()}
              </CustomSelect>
              {form.musteriId && gorusmeler.filter(g => String(g.musteriId) === String(form.musteriId)).length === 0 && (
                <p style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                  Bu müşteriye ait kayıtlı görüşme yok.
                </p>
              )}
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
            <Label>
              Para birimi
              {form.paraBirimi && form.paraBirimi !== 'TL' && (
                <span style={{
                  marginLeft: 8,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--warning-soft)',
                  color: 'var(--warning)',
                  font: '700 11px/14px var(--font-sans)',
                }}>
                  ⚠️ {form.paraBirimi} seçili
                </span>
              )}
            </Label>
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              iconLeft={<LayoutTemplate size={14} strokeWidth={1.5} />}
              onClick={sablonModaliAc}
              title="Kayıtlı ürün seti şablonlarını listele / mevcut satırları şablon olarak kaydet"
            >
              Şablonlar
            </Button>
            {form.satirlar.length > 1 && (
              <Button
                variant="secondary"
                iconLeft={<Percent size={14} strokeWidth={1.5} />}
                onClick={() => setTopluIskonto({ deger: '' })}
                title="Tüm satırlara aynı iskonto oranını uygula"
              >
                Toplu İskonto
              </Button>
            )}
            <Button variant="secondary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={satirEkle}>
              Satır ekle
            </Button>
          </div>
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
            {/* Hücre bütçesi: TD dolgusu dar kolonlarda 6px'e indirildi (darHucre) —
                eski 16px dolgu + number spinner 80px kolonda 2 haneyi bile
                görünmez yapıyordu. Inputlar sayi-sade (spinner gizli) + 8px dolgu. */}
            <colgroup>
              <col style={{ width: 26 }} />{/* Grip — drag handle */}
              <col style={{ width: 112 }} />{/* Stok — 'STK01605' yeter */}
              <col />{/* Ürün adı — auto (kalan alan, en geniş) */}
              <col style={{ width: 84 }} />{/* Miktar — 4 basamak rahat */}
              <col style={{ width: 96 }} />{/* Birim — dropdown ('Adet', 'Lisans' vb) */}
              <col style={{ width: 186 }} />{/* Birim fiyat — input + hesapla + fiyat geçmişi ikonları */}
              <col style={{ width: 72 }} />{/* İsk.% — 3 basamak rahat */}
              <col style={{ width: 80 }} />{/* KDV% */}
              <col style={{ width: 122 }} />{/* Toplam */}
              <col style={{ width: 40 }} />{/* Sil */}
            </colgroup>
            <THead>
              <TR>
                <TH style={{ padding: '10px 4px' }}></TH>{/* Grip */}
                <TH style={{ padding: '10px 8px' }}>Stok</TH>
                <TH style={{ padding: '10px 8px' }}>Ürün adı</TH>
                <TH align="right" style={{ padding: '10px 6px' }}>Miktar</TH>
                <TH style={{ padding: '10px 6px' }}>Birim</TH>
                <TH align="right" style={{ padding: '10px 6px' }}>Birim fiyat</TH>
                <TH align="right" style={{ padding: '10px 6px' }}>İsk.%</TH>
                <TH align="right" style={{ padding: '10px 6px' }}>KDV%</TH>
                <TH align="right" style={{ padding: '10px 8px' }}>Toplam</TH>
                <TH style={{ padding: '10px 4px' }}></TH>
              </TR>
            </THead>
            <TBody>
              <DndContext
                sensors={dndSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={form.satirlar.map((_, i) => `satir-${i}`)}
                  strategy={verticalListSortingStrategy}
                >
              {form.satirlar.map((satir, index) => {
                const { toplam } = satirToplamHesapla(satir)
                return (
                  <SortableSatirTR key={`satir-${index}`} index={index}>
                    <TD style={{ padding: '10px 8px' }}>
                      {/* Akıllı seçici (Faz 3): "2 mp 2.8 dome" gibi özellik bazlı
                          arama + stok durumu; model/marka/kod araması da çalışır */}
                      <AkilliUrunSecici
                        urunler={stokUrunler}
                        value={satir.stokKodu}
                        onSec={(u) => stokSec(index, u.stokKodu)}
                        onYeni={() => stokSec(index, '__yeni__')}
                      />
                    </TD>
                    <TD style={{ verticalAlign: 'top', padding: '10px 8px' }}>
                      {/* fieldSizing: content → uzun ürün adında kutu kendiliğinden
                          büyür (Chrome 123+); desteklemeyen tarayıcıda resize kolu var */}
                      <Textarea
                        value={satir.stokAdi}
                        onChange={(e) => satirGuncelle(index, 'stokAdi', e.target.value)}
                        placeholder="Ürün adı"
                        rows={1}
                        style={{
                          resize: 'vertical', minHeight: 38, maxHeight: 200,
                          fontSize: 13, lineHeight: '18px', padding: '9px 10px',
                          fieldSizing: 'content', overflowY: 'auto',
                        }}
                      />
                    </TD>
                    <TD align="right" style={{ padding: '10px 6px' }}>
                      <Input
                        type="number"
                        className="sayi-sade"
                        value={satir.miktar}
                        onChange={(e) => satirGuncelle(index, 'miktar', Number(e.target.value))}
                        min="0"
                        style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', padding: '8px 8px' }}
                      />
                    </TD>
                    <TD style={{ padding: '10px 6px' }}>
                      <CustomSelect
                        value={satir.birim || ''}
                        onChange={(e) => satirGuncelle(index, 'birim', e.target.value)}
                      >
                        <option value="">—</option>
                        <option value="Adet">Adet</option>
                        <option value="Lisans">Lisans</option>
                        <option value="Paket">Paket</option>
                        <option value="Metre">Metre</option>
                        <option value="Kg">Kg</option>
                        <option value="Litre">Litre</option>
                      </CustomSelect>
                    </TD>
                    <TD align="right" style={{ padding: '10px 6px' }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <Input
                          type="number"
                          className="sayi-sade"
                          value={satir.birimFiyat}
                          onChange={(e) => satirGuncelle(index, 'birimFiyat', Number(e.target.value))}
                          min="0"
                          style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', flex: 1, minWidth: 0, padding: '8px 8px' }}
                        />
                        <button
                          type="button"
                          onClick={() => setHesaplaModal({ idx: index, alis: satir.alisFiyat || 0, katsayi: satir.katsayi || 1.4 })}
                          title={satir.katsayi
                            ? `Alış × Katsayı — bu ürünün kayıtlı katsayısı: ${satir.katsayi}`
                            : 'Alış × Katsayı ile satış fiyatı hesapla'}
                          style={{
                            width: 28, height: 28, padding: 0, flexShrink: 0,
                            background: 'var(--surface-subtle)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 4, cursor: 'pointer',
                            display: 'grid', placeItems: 'center',
                            color: 'var(--text-secondary)',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-soft, rgba(59,130,246,0.1))'; e.currentTarget.style.color = 'var(--brand, #3b82f6)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                        >
                          <Calculator size={13} strokeWidth={1.7} />
                        </button>
                        <FiyatGecmisiButon
                          stokKodu={satir.stokKodu}
                          haricTeklifId={yeni ? null : id}
                          onUygula={(fiyat) => satirGuncelle(index, 'birimFiyat', fiyat)}
                        />
                      </div>
                    </TD>
                    <TD align="right" style={{ padding: '10px 6px' }}>
                      <Input
                        type="number"
                        className="sayi-sade"
                        value={satir.iskonto}
                        onChange={(e) => satirGuncelle(index, 'iskonto', Number(e.target.value))}
                        min="0"
                        max="100"
                        style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', padding: '8px 8px' }}
                      />
                    </TD>
                    <TD align="right" style={{ padding: '10px 6px' }}>
                      <CustomSelect
                        value={satir.kdv}
                        onChange={(e) => satirGuncelle(index, 'kdv', Number(e.target.value))}
                        style={{ padding: '8px 8px' }}
                      >
                        {kdvOranlari.map((k) => <option key={k} value={k}>%{k}</option>)}
                      </CustomSelect>
                    </TD>
                    <TD align="right" style={{ padding: '10px 8px' }}>
                      {(() => {
                        const kar = satirKarYuzde(satir)
                        const karRenk = kar === null ? null : kar < 0 ? '#DC2626' : kar < 15 ? '#F59E0B' : '#10B981'
                        return (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {kar !== null && (
                              <span
                                title={`Kar: %${kar.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} — alış ${fmtPara(Number(satir.alisFiyat))}`}
                                style={{
                                  width: 4, height: 16, borderRadius: 2, flexShrink: 0,
                                  background: karRenk, cursor: 'help',
                                }}
                              />
                            )}
                            <span className="tabular-nums" style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                              {fmtPara(toplam)}
                            </span>
                          </span>
                        )
                      })()}
                    </TD>
                    <TD align="right" style={{ padding: '10px 4px' }}>
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
                  </SortableSatirTR>
                )
              })}
                </SortableContext>
              </DndContext>
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

      {/* Hızlı stok ekleme — teklif satırında dropdown'dan "+ Yeni" seçilince */}
      <HizliStokEkleModal
        acik={hizliStokAcik}
        mevcutKodlar={stokUrunler.map(u => u.stokKodu)}
        onKapat={() => { setHizliStokAcik(false); setHizliStokSatirIndex(null) }}
        onEklendi={(yeni) => {
          hizliStokEklendi(yeni)
          setHizliStokAcik(false)
        }}
      />

      {/* Hızlı müşteri ekleme — müşteri dropdown'dan "+ Yeni" seçilince */}
      <HizliMusteriEkleModal
        acik={hizliMusteriAcik}
        onKapat={() => setHizliMusteriAcik(false)}
        onEklendi={(yeni) => {
          // Listeye ekle, formu o müşteriye bağla, kişi listesini tazele
          setMusteriler(prev => [yeni, ...prev])
          setForm(f => ({
            ...f,
            musteriId: String(yeni.id),
            firmaAdi: yeni.firma || '',
            musteriYetkilisi: `${yeni.ad ?? ''} ${yeni.soyad ?? ''}`.trim(),
          }))
          // Yeni müşterinin henüz kayıtlı kişisi yok — picker sıfırla
          setMusteriKisileri([])
          setHizliMusteriAcik(false)
        }}
      />

      {/* Müşteriye gönder — mail/SMS ile tokenli paylaşım linki */}
      {!yeni && (() => {
        const seciliMusteri = musteriler.find(m => String(m.id) === String(form.musteriId))
        return (
          <BelgePaylasModal
            acik={paylasimModalAcik}
            onKapat={() => setPaylasimModalAcik(false)}
            belgeTipi="teklif"
            belgeId={Number(id)}
            baslangicEmail={seciliMusteri?.email || ''}
            baslangicGsm={seciliMusteri?.telefon || ''}
            baslangicSablon={form.teklifTipi || 'standart'}
            belgeBaslik={`${form.teklifNo || '#' + id} — ${form.firmaAdi || ''}`}
            onGonderildi={async () => {
              // "Müşteri açtı mı?" rozeti tazelensin (yeni link → "Henüz açılmadı")
              paylasimDurumOzet('teklif', id).then(setPaylasimDurum).catch(() => {})
              // Spec: gönderim sonrası "Müşteriye Gönderildi" durumuna geçer.
              // Durum ilerde ise (müşteri onayladı / reddetti / siparişe aktarıldı)
              // üzerine yazmayalım — yeniden gönderim durumu bozmasın.
              const ileriDurumlar = ['musteri_onayladi', 'musteri_reddetti', 'siparise_aktarildi', 'musteri_onay_bekliyor']
              if (ileriDurumlar.includes(spekDurumKey)) return
              try {
                const alanlar = durumdanDbAlanlar('musteriye_gonderildi')
                await teklifGuncelle(id, alanlar)
                setForm(f => ({ ...f, ...alanlar }))
                setMevcutTeklif(t => t ? { ...t, ...alanlar } : t)
              } catch (e) {
                console.warn('[TeklifDetay] gönderim sonrası durum güncellenemedi:', e?.message)
              }
            }}
          />
        )
      })()}

      {/* Fatura Talebi — numarasız; muhasebe kesip numarasını ve PDF'ini girecek */}
      {faturaTalepAcik && faturaTalepTaslak && (() => {
        const t = faturaTalepTaslak
        const sembol = paraBirimleri.find(p => p.id === t.paraBirimi)?.sembol || '₺'
        const fmt = (n) => `${sembol}${(Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
        const satir = { padding: '5px 8px', borderBottom: '1px solid var(--border-default)' }
        const kunye = [
          ['Firma', t.firmaAdi], ['Yetkili', t.yetkiliAdi], ['Vergi No', t.vergiNo],
          ['Vergi Dairesi', t.vergiDairesi], ['Adres', t.adres],
          ['Telefon', t.telefon], ['E-posta', t.email],
        ]
        const eksik = ['vergiNo', 'vergiDairesi', 'adres'].filter(k => !t[k])
        return (
          <Modal open onClose={() => setFaturaTalepAcik(false)} title="Proforma Fatura Oluştur" width={720}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{
                background: 'var(--info-soft)', border: '1px solid var(--info)',
                borderRadius: 8, padding: '10px 12px', font: '400 12.5px/1.5 var(--font-sans)', color: 'var(--text-primary)',
              }}>
                Fatura <strong>numarası girilmez</strong>. Talep fatura yetkilisine düşer; gerçek faturayı
                o keser, numarasını ve PDF'ini sisteme girer.
              </div>

              <div>
                <div style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Müşteri Künyesi
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', font: '400 12.5px/18px var(--font-sans)' }}>
                  <tbody>
                    {kunye.map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ ...satir, color: 'var(--text-tertiary)', width: 120 }}>{k}</td>
                        <td style={{ ...satir, color: v ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{v || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {eksik.length > 0 && (
                  <div style={{ font: '400 11.5px/16px var(--font-sans)', color: 'var(--warning)', marginTop: 6 }}>
                    ⚠ Müşteri kartında vergi/adres bilgisi eksik — fatura kesilirken sorun çıkabilir.
                  </div>
                )}
              </div>

              <div>
                <div style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Kalemler ({t.kalemler.length})
                </div>
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', font: '400 12.5px/18px var(--font-sans)' }}>
                    <thead>
                      <tr style={{ color: 'var(--text-tertiary)', textAlign: 'left' }}>
                        <th style={satir}>Ürün</th>
                        <th style={{ ...satir, textAlign: 'right', width: 60 }}>Miktar</th>
                        <th style={{ ...satir, textAlign: 'right', width: 90 }}>Birim Fiyat</th>
                        <th style={{ ...satir, textAlign: 'right', width: 100 }}>Toplam</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.kalemler.map((k, i) => (
                        <tr key={i}>
                          <td style={satir}>{k.urunAdi || '—'}{k.stokKodu ? ` · ${k.stokKodu}` : ''}</td>
                          <td style={{ ...satir, textAlign: 'right' }}>{k.miktar} {k.birim}</td>
                          <td style={{ ...satir, textAlign: 'right' }}>{fmt(k.birimFiyat)}</td>
                          <td style={{ ...satir, textAlign: 'right', fontWeight: 600 }}>{fmt(k.satirToplam)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ background: 'var(--surface-sunken)', borderRadius: 8, padding: '10px 12px' }}>
                {[['Ara toplam', t.araToplam], ['KDV', t.kdvToplam]].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', font: '400 12.5px/20px var(--font-sans)', color: 'var(--text-secondary)' }}>
                    <span>{k}</span><span>{fmt(v)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', font: '700 15px/24px var(--font-sans)', color: 'var(--text-primary)', borderTop: '1px solid var(--border-default)', marginTop: 4, paddingTop: 4 }}>
                  <span>Fatura Tutarı (KDV dahil)</span><span>{fmt(t.genelToplam)}</span>
                </div>
                {t.odemeSekli && (
                  <div style={{ font: '400 11.5px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                    Ödeme: {t.odemeSekli}
                  </div>
                )}
              </div>

              <div>
                <Label>Muhasebeye not (isteğe bağlı)</Label>
                <Textarea rows={2} value={faturaTalepNotu} onChange={e => setFaturaTalepNotu(e.target.value)}
                  placeholder="Ör. Fatura ay sonuna kadar kesilmeli / e-arşiv olarak düzenlensin" />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => setFaturaTalepAcik(false)}>Vazgeç</Button>
                <Button variant="primary" onClick={faturaTalebiGonder} disabled={faturaTalepMesgul}
                  iconLeft={<Receipt size={14} strokeWidth={1.5} />}>
                  {faturaTalepMesgul ? 'Gönderiliyor…' : 'Proformayı Gönder'}
                </Button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* Satış Fiyatı Hesapla modal — Alış × Katsayı */}
      {hesaplaModal && (() => {
        const alis = Number(hesaplaModal.alis || 0)
        const katsayi = Number(hesaplaModal.katsayi || 0)
        const satis = alis * katsayi
        const kapat = () => setHesaplaModal(null)
        const uygula = () => {
          if (!Number.isFinite(satis) || satis <= 0) {
            toast.warning('Geçerli alış fiyatı ve katsayı girin.')
            return
          }
          // Kuruş hassasiyeti — 2 haneye yuvarla. Alış fiyatı VE katsayı da satıra
          // kaydedilir (kar% renk göstergesi + modal tekrar açılınca o ürünün kendi
          // katsayısı gelsin diye — her üründe farklı katsayı olabilir: 1.3 / 1.5).
          satirGuncelleCoklu(hesaplaModal.idx, { birimFiyat: Number(satis.toFixed(2)), alisFiyat: alis, katsayi })
          setHesaplaModal(null)
        }
        return (
          <div
            onClick={kapat}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--surface-card)', color: 'var(--text-primary)',
                borderRadius: 10, width: '100%', maxWidth: 380,
                border: '1px solid var(--border-default)', overflow: 'hidden',
              }}
            >
              <div style={{
                background: '#6366F1', color: '#fff',
                padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                  <Calculator size={16} strokeWidth={2} /> Satış Fiyatı Hesapla
                </div>
                <button onClick={kapat}
                  style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}>
                  <XCircle size={18} strokeWidth={1.8} />
                </button>
              </div>

              <div style={{ padding: 16, display: 'grid', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Alış Fiyatı</label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={hesaplaModal.alis}
                    onChange={e => setHesaplaModal({ ...hesaplaModal, alis: e.target.value })}
                    autoFocus
                    style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Alış Katsayısı</label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={hesaplaModal.katsayi}
                    onChange={e => setHesaplaModal({ ...hesaplaModal, katsayi: e.target.value })}
                    style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>

                {satis > 0 && (
                  <div style={{
                    padding: '10px 12px', borderRadius: 6, background: 'rgba(99,102,241,0.08)',
                    border: '1px solid rgba(99,102,241,0.25)', textAlign: 'right',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>SATIŞ FİYATI</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#6366F1', fontVariantNumeric: 'tabular-nums' }}>
                      {satis.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                  <Button variant="ghost" onClick={kapat}>Vazgeç</Button>
                  <Button
                    variant="primary"
                    iconLeft={<Calculator size={13} strokeWidth={1.7} />}
                    onClick={uygula}
                    disabled={!Number.isFinite(satis) || satis <= 0}
                  >
                    Hesapla ve Uygula
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Teklif şablonları modalı — listele/uygula/sil + mevcut satırları kaydet */}
      <Modal
        open={sablonModalAcik}
        onClose={() => setSablonModalAcik(false)}
        title="Teklif Şablonları"
        width={560}
        footer={
          <Button variant="secondary" onClick={() => setSablonModalAcik(false)}>Kapat</Button>
        }
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {/* Mevcut satırları şablon olarak kaydet */}
          {form.satirlar.length > 0 && (
            <div style={{
              padding: 12, borderRadius: 8,
              background: 'var(--brand-primary-soft, rgba(30,90,168,0.08))',
              border: '1px solid var(--border-default)',
            }}>
              <p className="t-body-strong" style={{ marginBottom: 8 }}>
                Mevcut {form.satirlar.length} satırı şablon olarak kaydet
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  value={sablonAd}
                  onChange={e => setSablonAd(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') sablonKaydet() }}
                  placeholder='Şablon adı — örn. "Trassir 8 Kanal Set"'
                  style={{ flex: 1 }}
                />
                <Button variant="primary" iconLeft={<Save size={14} strokeWidth={1.5} />} onClick={sablonKaydet}>
                  Kaydet
                </Button>
              </div>
            </div>
          )}

          {/* Kayıtlı şablonlar */}
          {sablonlar === null ? (
            <p className="t-caption" style={{ textAlign: 'center', padding: 12 }}>Yükleniyor…</p>
          ) : sablonlar.length === 0 ? (
            <EmptyState
              icon={<LayoutTemplate size={22} strokeWidth={1.5} />}
              title="Henüz şablon yok"
              description="Satırları doldurup yukarıdan bir isimle kaydedin — sonraki tekliflerde tek tıkla eklensin."
            />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {sablonlar.map(s => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--border-default)',
                    background: 'var(--surface-card)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="t-body-strong" style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.ad}
                    </p>
                    <p className="t-caption" style={{ margin: '2px 0 0' }}>
                      {(s.satirlar || []).length} satır
                      {s.olusturan ? ` · ${s.olusturan}` : ''}
                      {s.olusturmaTarih ? ` · ${new Date(s.olusturmaTarih).toLocaleDateString('tr-TR')}` : ''}
                    </p>
                    <p className="t-caption" style={{ margin: '2px 0 0', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(s.satirlar || []).slice(0, 3).map(x => x.stokAdi || x.stokKodu).filter(Boolean).join(', ')}
                      {(s.satirlar || []).length > 3 ? '…' : ''}
                    </p>
                  </div>
                  <Button variant="primary" size="sm" onClick={() => sablonUygula(s)}>
                    Uygula
                  </Button>
                  <button
                    aria-label="Şablonu sil"
                    onClick={() => sablonuSil(s)}
                    style={iconBtnStyle}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                  >
                    <Trash2 size={13} strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Toplu iskonto modalı — tüm satırlara aynı % */}
      {topluIskonto && (() => {
        // TR virgül desteği: "7,5" → 7.5
        const oran = Number(String(topluIskonto.deger).replace(',', '.'))
        const gecerli = Number.isFinite(oran) && oran >= 0 && oran <= 100
        const kapat = () => setTopluIskonto(null)
        const uygula = () => {
          if (!gecerli) { toast.warning('0–100 arası bir oran girin.'); return }
          setForm(f => ({ ...f, satirlar: f.satirlar.map(s => ({ ...s, iskonto: oran })) }))
          toast.success(`${form.satirlar.length} satıra %${oran.toLocaleString('tr-TR')} iskonto uygulandı.`)
          setTopluIskonto(null)
        }
        return (
          <div
            onClick={kapat}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--surface-card)', color: 'var(--text-primary)',
                borderRadius: 10, width: '100%', maxWidth: 340,
                border: '1px solid var(--border-default)', overflow: 'hidden',
              }}
            >
              <div style={{
                background: 'var(--brand-primary, #1E5AA8)', color: '#fff',
                padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                  <Percent size={16} strokeWidth={2} /> Toplu İskonto
                </div>
                <button onClick={kapat}
                  style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}>
                  <XCircle size={18} strokeWidth={1.8} />
                </button>
              </div>
              <div style={{ padding: 16, display: 'grid', gap: 12 }}>
                <p className="t-caption" style={{ margin: 0 }}>
                  {form.satirlar.length} satırın tamamına aynı iskonto oranı uygulanır.
                  Mevcut satır iskontolarının üzerine yazar.
                </p>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>İskonto Oranı (%)</label>
                  <Input
                    type="text" inputMode="decimal"
                    value={topluIskonto.deger}
                    onChange={e => setTopluIskonto({ deger: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') uygula() }}
                    autoFocus
                    placeholder="örn. 5 veya 7,5"
                    style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                  <Button variant="ghost" onClick={kapat}>Vazgeç</Button>
                  <Button variant="primary" onClick={uygula} disabled={!gecerli || topluIskonto.deger === ''}>
                    Uygula
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Durum değiştirme modalı — spec 10 durum */}
      {/* Çıktı Geçmişi — dışarıda dolaşan bir çıktının kaynağını izlemek için */}
      {!yeni && ciktiLoglari.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <p className="t-label" style={{ marginBottom: 8 }}>
            Çıktı Geçmişi <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(son {ciktiLoglari.length})</span>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ciktiLoglari.map(l => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-tertiary)' }}>
                  {new Date(l.olusturmaTarih).toLocaleDateString('tr-TR')} {new Date(l.olusturmaTarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <strong style={{ color: 'var(--text-primary)' }}>{l.kullaniciAd || '—'}</strong>
                <span>{ISLEM_ISIMLERI[l.islem] || l.islem}</span>
                {l.taslak && <Badge tone="uyari">Taslak filigranlı</Badge>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {kopyalaModalAcik && (
        <KopyalaModal
          satirlar={form.satirlar}
          genelIskonto={form.genelIskonto}
          paraSembol={paraBirimi?.sembol || ''}
          onKapat={() => setKopyalaModalAcik(false)}
          onKopyala={(ayar) => { setKopyalaModalAcik(false); teklifKopyala(ayar) }}
        />
      )}

      {durumModalAcik && (
        <div
          onClick={() => setDurumModalAcik(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface-card)', color: 'var(--text-primary)',
              borderRadius: 12, padding: 20, maxWidth: 480, width: '100%',
              border: '1px solid var(--border-default)',
            }}
          >
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Teklif Durumunu Değiştir</h3>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
              Mevcut durum:{' '}
              <strong style={{ color: spekDurumMeta?.renk }}>
                {spekDurumMeta?.isim || spekDurumKey}
              </strong>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 8, letterSpacing: 0.3 }}>
              MANTIKLI SONRAKI DURUMLAR
            </div>
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              {(() => {
                const secenekler = sonrakiDurumlar(spekDurumKey)
                if (secenekler.length === 0) {
                  return (
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: 8 }}>
                      Bu durumdan başka bir duruma geçilemiyor (terminal). Manuel geçiş için aşağıdaki tam listeyi kullan.
                    </div>
                  )
                }
                return secenekler.map(k => {
                  const meta = TEKLIF_DURUM_META[k]
                  // Yönetici onayı yalnız admin; onay AŞAMASINDAYKEN de tüm geçişler
                  // (Revizyon İstendi dahil) yalnız admin — personel karıştıramaz
                  const kilitli = kullanici?.rol !== 'admin' &&
                    (k === TEKLIF_DURUM.YON_ONAYLADI || spekDurumKey === TEKLIF_DURUM.YON_ONAY_BEKLIYOR)
                  return (
                    <button
                      key={k}
                      onClick={() => !kilitli && durumuDegistir(k)}
                      disabled={kilitli}
                      title={kilitli ? 'Teklif yönetici onayında — bu geçişi yalnız admin yapabilir' : undefined}
                      style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: kilitli ? 'var(--surface-subtle)' : `${meta.renk}18`,
                        color: kilitli ? 'var(--text-tertiary)' : meta.renk,
                        border: `1px solid ${kilitli ? 'var(--border-default)' : meta.renk + '55'}`,
                        cursor: kilitli ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13,
                        textAlign: 'left', opacity: kilitli ? 0.6 : 1,
                      }}
                    >
                      → {meta.isim}{kilitli ? '  🔒 yalnız admin' : ''}
                    </button>
                  )
                })
              })()}
            </div>

            {/* Serbest geçiş listesi adı üstünde ADMIN — herkese görünüyordu,
                Hasan/Tarık gibi personel buradan onay verebiliyordu. */}
            {kullanici?.rol === 'admin' && (
            <details style={{ marginBottom: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 0.3 }}>
                TÜM DURUMLAR (ADMIN GEÇIŞ)
              </summary>
              <div style={{ display: 'grid', gap: 4, marginTop: 8, gridTemplateColumns: '1fr 1fr' }}>
                {Object.entries(TEKLIF_DURUM_META).map(([k, meta]) => {
                  const secili = k === spekDurumKey
                  return (
                    <button
                      key={k}
                      disabled={secili}
                      onClick={() => durumuDegistir(k)}
                      style={{
                        padding: '6px 10px', borderRadius: 6,
                        background: secili ? 'var(--surface-subtle)' : `${meta.renk}10`,
                        color: secili ? 'var(--text-tertiary)' : meta.renk,
                        border: `1px solid ${meta.renk}30`,
                        cursor: secili ? 'default' : 'pointer',
                        fontSize: 11, fontWeight: 500,
                        textAlign: 'left', opacity: secili ? 0.5 : 1,
                      }}
                    >
                      {meta.isim}
                    </button>
                  )
                })}
              </div>
            </details>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setDurumModalAcik(false)}>Kapat</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Siparis Onay Notu — kabul edilmis ve onay bekliyor durumdaki tekliflerde gozukur.
// Personel onaylayacak kisiye 1000 karaktere kadar not birakabilir.
// Kopyalama seçenekleri — birebir / satış fiyatına % / alış üzerinden kâr %
// Canlı önizleme: mevcut genel toplam → yeni genel toplam.
function KopyalaModal({ satirlar, genelIskonto, paraSembol, onKapat, onKopyala }) {
  const [mod, setMod] = useState('birebir')
  const [yuzde, setYuzde] = useState(20)

  const alisliSatirSayisi = (satirlar || []).filter(s => Number(s.alisFiyat) > 0).length
  const mevcutToplam = satirlardanGenelToplam(satirlar, genelIskonto)
  const yeniSatirlar = kopyaSatirlariHesapla(satirlar, { mod, yuzde })
  const yeniToplam = satirlardanGenelToplam(yeniSatirlar, genelIskonto)
  const fmt = (n) => `${paraSembol}${(Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`

  const SECENEKLER = [
    ['birebir', 'Birebir kopyala', 'Fiyatlar aynen taşınır.'],
    ['zam', 'Satış fiyatlarına % uygula', 'Tüm birim fiyatlar girilen oranda artar (eksi değer = indirim).'],
    ['kar', 'Alış fiyatı üzerinden kâr % uygula',
      alisliSatirSayisi
        ? `Birim fiyat = alış fiyatı × (1 + %). ${alisliSatirSayisi}/${(satirlar || []).length} satırda alış fiyatı var; olmayanlar aynı kalır.`
        : 'Bu teklifin satırlarında alış fiyatı kayıtlı değil — bu mod fiyatları değiştirmez.'],
  ]

  return (
    <Modal open onClose={onKapat} title="Teklifi Kopyala" width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SECENEKLER.map(([id, baslik, aciklama]) => (
          <label key={id} style={{
            display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer',
            border: `1px solid ${mod === id ? 'var(--brand-primary)' : 'var(--border-default)'}`,
            background: mod === id ? 'var(--brand-primary-soft)' : 'transparent',
            borderRadius: 'var(--radius-md)', padding: '10px 12px',
          }}>
            <input type="radio" name="kopya-mod" checked={mod === id} onChange={() => setMod(id)}
              style={{ marginTop: 2, accentColor: 'var(--brand-primary)' }} />
            <span>
              <span style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{baslik}</span>
              <br />
              <span className="t-caption">{aciklama}</span>
            </span>
          </label>
        ))}

        {mod !== 'birebir' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 140 }}>
              <Label>{mod === 'zam' ? 'Artış oranı (%)' : 'Kâr oranı (%)'}</Label>
              <Input type="number" step="0.5" className="sayi-sade" value={yuzde}
                onChange={e => setYuzde(e.target.value)} placeholder="20" />
            </div>
            <div style={{ flex: 1, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', padding: '10px 12px', font: '400 12.5px/19px var(--font-sans)', color: 'var(--text-secondary)' }}>
              Genel toplam (KDV dahil):<br />
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(mevcutToplam)}</span>
              {' → '}
              <strong style={{ color: 'var(--brand-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(yeniToplam)}</strong>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <Button variant="ghost" onClick={onKapat}>Vazgeç</Button>
          <Button variant="primary" iconLeft={<Copy size={14} strokeWidth={1.5} />}
            onClick={() => onKopyala({ mod, yuzde: Number(yuzde) || 0 })}>
            Kopyala ve Aç
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function SiparisOnayNotuKart({ teklifId, mevcut, onKaydedildi }) {
  const [not, setNot] = useState(mevcut || '')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [mesaj, setMesaj] = useState(null)
  const degisti = not.trim() !== (mevcut || '').trim()

  const kaydet = async () => {
    setMesaj(null); setKaydediliyor(true)
    try {
      const yeni = await siparisOnayNotuKaydet(teklifId, not.trim())
      onKaydedildi?.(yeni)
      setMesaj({ tone: 'success', text: 'Not kaydedildi.' })
      setTimeout(() => setMesaj(null), 2500)
    } catch (e) {
      setMesaj({ tone: 'danger', text: e?.message || 'Kaydedilemedi.' })
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <Card style={{ marginBottom: 16, borderLeft: '3px solid #F59E0B' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <StickyNote size={16} strokeWidth={1.5} style={{ color: '#B45309' }} />
        <CardTitle style={{ margin: 0 }}>Sipariş Onay Notu</CardTitle>
        <Badge tone="beklemede">Onay Bekliyor</Badge>
      </div>
      <p className="t-caption" style={{ marginBottom: 10 }}>
        Onaylayacak kişiye iletmek istediğin bilgi varsa buraya yaz (örn. acil, özel indirim, stok durumu). Onaylayan kişi Sipariş Onayları sayfasında bu notu görür.
      </p>
      <Textarea
        value={not}
        onChange={e => setNot(e.target.value.slice(0, 1000))}
        placeholder="Onaylayacak kişi için not…"
        rows={3}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>
          {not.length}/1000 karakter
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {mesaj && (
            <span style={{ font: '500 12px/16px var(--font-sans)', color: mesaj.tone === 'success' ? 'var(--success)' : 'var(--danger)' }}>
              {mesaj.text}
            </span>
          )}
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Save size={12} strokeWidth={1.5} />}
            disabled={!degisti || kaydediliyor}
            onClick={kaydet}
          >
            {kaydediliyor ? 'Kaydediliyor…' : 'Notu Kaydet'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

// Siparis Onay Durum — 'onayli' veya 'reddedildi' durumda mevcut durumu gosterir
// + yetkili ise 'Geri Al' butonu sunar. Yetki: onaylayan kisi veya ust yetkili.
function SiparisOnayDurumKart({ teklifId, siparisOnayi, kullanici, onGeriAlindi }) {
  const [calisiyor, setCalisiyor] = useState(false)
  const [mesaj, setMesaj] = useState(null)
  const s = siparisOnayi || {}
  const onaylandiMi = s.durum === 'onayli'
  const ustYetkili = kullanici?.siparisOnayUstYetkili === true || kullanici?.siparis_onay_ust_yetkili === true
  const kararKimin = String(s.onaylayan_id) === String(kullanici?.id)
  const geriAlYetkili = ustYetkili || kararKimin

  const geriAl = async () => {
    const eminMi = window.confirm(
      onaylandiMi
        ? 'Onay geri alınacak. Sipariş tekrar "bekleyen" olacak. Devam?'
        : 'Red kararı geri alınacak. Sipariş tekrar "bekleyen" olacak. Devam?'
    )
    if (!eminMi) return
    setMesaj(null); setCalisiyor(true)
    try {
      const yeni = await siparisOnayGeriAl(teklifId)
      onGeriAlindi?.(yeni)
      setMesaj({ tone: 'success', text: 'Karar geri alındı, sipariş tekrar bekleyene çevrildi.' })
      setTimeout(() => setMesaj(null), 3000)
    } catch (e) {
      setMesaj({ tone: 'danger', text: e?.message || 'Geri alınamadı.' })
    } finally {
      setCalisiyor(false)
    }
  }

  return (
    <Card style={{
      marginBottom: 16,
      borderLeft: `3px solid ${onaylandiMi ? '#10B981' : '#DC2626'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onaylandiMi
            ? <CheckCircle2 size={18} strokeWidth={1.5} style={{ color: '#10B981' }} />
            : <XCircle size={18} strokeWidth={1.5} style={{ color: '#DC2626' }} />}
          <div>
            <div style={{ font: '700 14px/18px var(--font-sans)', color: onaylandiMi ? '#065F46' : '#991B1B' }}>
              {onaylandiMi ? 'Sipariş Onaylandı' : 'Sipariş Reddedildi'}
            </div>
            <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)', marginTop: 2 }}>
              {s.onaylayan_ad || '—'}
              {s.onay_tarihi && ' · ' + new Date(s.onay_tarihi).toLocaleDateString('tr-TR')}
              {s.red_nedeni && <> · <strong>Red nedeni:</strong> {s.red_nedeni}</>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {mesaj && (
            <span style={{ font: '500 12px/16px var(--font-sans)', color: mesaj.tone === 'success' ? 'var(--success)' : 'var(--danger)' }}>
              {mesaj.text}
            </span>
          )}
          {geriAlYetkili ? (
            <Button variant="secondary" size="sm" onClick={geriAl} disabled={calisiyor}>
              {calisiyor ? 'İşleniyor…' : (onaylandiMi ? 'Onayı Geri Al' : 'Reddi Geri Al')}
            </Button>
          ) : (
            <span style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>
              Geri alma yetkisi yok
            </span>
          )}
        </div>
      </div>
    </Card>
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

// Kalem satırı — drag+drop sortable wrapper.
// İlk hücre olarak grip handle render eder, sonra parent'tan gelen children (diğer TD'ler).
// Teklif zaman çizelgesi — 5 kilometre taşlı yatay stepper.
// Duruma göre aktif adım renklenir; olumsuz durumlar (revizyon/red/süre) kendi
// rengiyle işaretlenir. Salt görsel — tıklanmaz, durum değişimi header badge'inden.
function TeklifZamanCizelgesi({ durum }) {
  const meta = TEKLIF_DURUM_META[durum]
  if (!meta) return null
  const ADIMLAR = ['Taslak', 'Yönetici Onayı', 'Müşteriye Gönderim', 'Müşteri Kararı', 'Sipariş']
  const asama = meta.asama ?? 1
  const aktifIdx = asama <= 1 ? 0 : asama <= 4 ? 1 : asama === 5 ? 2 : asama <= 8 ? 3 : 4
  const tamamlandi = durum === 'siparise_aktarildi'
  return (
    <Card padding={0} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', padding: '14px 20px 12px', overflowX: 'auto' }}>
        {ADIMLAR.map((label, i) => {
          const gecti = i < aktifIdx || tamamlandi
          const aktif = !tamamlandi && i === aktifIdx
          const renk = gecti ? '#10B981' : aktif ? meta.renk : 'var(--border-default, #D9DFE5)'
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'flex-start', flex: i < ADIMLAR.length - 1 ? 1 : 'none', minWidth: i < ADIMLAR.length - 1 ? 96 : 64 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, width: 64, flexShrink: 0 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  display: 'grid', placeItems: 'center',
                  background: gecti ? '#10B981' : aktif ? meta.renk : 'transparent',
                  border: `2px solid ${renk}`,
                  color: '#fff',
                }}>
                  {gecti ? (
                    <CheckCircle2 size={12} strokeWidth={2.5} />
                  ) : aktif ? (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                  ) : null}
                </div>
                <span style={{
                  font: `${aktif ? 600 : 400} 10px/13px var(--font-sans)`,
                  color: aktif ? meta.renk : gecti ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                  textAlign: 'center',
                }}>
                  {aktif ? meta.isim : label}
                </span>
              </div>
              {i < ADIMLAR.length - 1 && (
                <div style={{
                  flex: 1, height: 2, marginTop: 9, borderRadius: 1,
                  background: (i < aktifIdx || tamamlandi) ? '#10B981' : 'var(--border-default, #D9DFE5)',
                }} />
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// Fiyat geçmişi popover'ı — stok seçili satırda History butonuna basınca o ürünün
// son 3 tekliften birim fiyatlarını gösterir; satıra tıklayınca fiyat uygulanır.
const PARA_SEMBOL = { TL: '₺', USD: '$', EUR: '€' }
function FiyatGecmisiButon({ stokKodu, haricTeklifId, onUygula }) {
  const [acik, setAcik] = useState(false)
  const [kayitlar, setKayitlar] = useState(null) // null = yükleniyor
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const cacheRef = useRef({})

  const ac = async () => {
    if (!stokKodu || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const width = 320
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 12))
    const asagidaBosluk = window.innerHeight - rect.bottom
    setPos({
      left, width,
      top: asagidaBosluk > 240 ? rect.bottom + 6 : undefined,
      bottom: asagidaBosluk > 240 ? undefined : window.innerHeight - rect.top + 6,
    })
    setAcik(true)
    if (cacheRef.current[stokKodu]) { setKayitlar(cacheRef.current[stokKodu]); return }
    setKayitlar(null)
    const d = await stokFiyatGecmisi(stokKodu, haricTeklifId)
    cacheRef.current[stokKodu] = d
    setKayitlar(d)
  }

  useEffect(() => {
    if (!acik) return
    const kapat = (e) => {
      if (btnRef.current?.contains(e.target)) return
      if (e.target.closest?.('[data-fiyat-gecmisi-panel]')) return
      setAcik(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setAcik(false) }
    document.addEventListener('mousedown', kapat)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', kapat)
      document.removeEventListener('keydown', onKey)
    }
  }, [acik])

  const fmtTarih = (t) => {
    try {
      const d = new Date(t)
      return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
    } catch { return t || '' }
  }

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        onClick={ac}
        disabled={!stokKodu}
        title={stokKodu ? 'Bu ürünün geçmiş teklif fiyatları' : 'Önce stok seçin'}
        style={{
          width: 28, height: 28, padding: 0, flexShrink: 0,
          background: 'var(--surface-subtle)',
          border: '1px solid var(--border-default)',
          borderRadius: 4, cursor: stokKodu ? 'pointer' : 'not-allowed',
          display: 'grid', placeItems: 'center',
          color: 'var(--text-secondary)', opacity: stokKodu ? 1 : 0.4,
        }}
        onMouseEnter={e => { if (stokKodu) { e.currentTarget.style.background = 'rgba(245,158,11,0.12)'; e.currentTarget.style.color = '#B45309' } }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
      >
        <History size={13} strokeWidth={1.7} />
      </button>
      {acik && pos && createPortal(
        <div
          data-fiyat-gecmisi-panel
          style={{
            position: 'fixed', ...pos, zIndex: 10000,
            background: 'var(--surface-card, #fff)',
            border: '1px solid var(--border-default, #D9DFE5)',
            borderRadius: 8,
            boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.12))',
            overflow: 'hidden',
          }}
        >
          <div style={{
            padding: '8px 12px', borderBottom: '1px solid var(--border-default)',
            display: 'flex', alignItems: 'center', gap: 6,
            font: '600 12px/16px var(--font-sans)', color: 'var(--text-secondary)',
          }}>
            <History size={12} strokeWidth={1.7} /> Fiyat geçmişi — {stokKodu}
          </div>
          {kayitlar === null ? (
            <div style={{ padding: 14, textAlign: 'center', font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
              Yükleniyor…
            </div>
          ) : kayitlar.length === 0 ? (
            <div style={{ padding: 14, textAlign: 'center', font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
              Bu ürün daha önce teklif edilmemiş.
            </div>
          ) : (
            <div>
              {kayitlar.map((k, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onUygula(k.birimFiyat); setAcik(false) }}
                  title="Bu fiyatı satıra uygula"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    width: '100%', padding: '8px 12px', textAlign: 'left',
                    background: 'transparent', border: 'none',
                    borderBottom: i < kayitlar.length - 1 ? '1px solid var(--border-default)' : 'none',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken, #EDF0F3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', font: '500 12px/16px var(--font-sans)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {k.firma || '—'}
                    </span>
                    <span style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                      {k.teklifNo} · {fmtTarih(k.tarih)}
                    </span>
                  </span>
                  <span className="tabular-nums" style={{ font: '700 13px/18px var(--font-sans)', color: 'var(--brand-primary)', flexShrink: 0 }}>
                    {PARA_SEMBOL[k.paraBirimi] || ''}{k.birimFiyat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </span>
                </button>
              ))}
              <div style={{ padding: '6px 12px', font: '400 10px/14px var(--font-sans)', color: 'var(--text-tertiary)', background: 'var(--surface-sunken, #EDF0F3)' }}>
                Fiyata tıklayınca satıra uygulanır
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

function SortableSatirTR({ index, children }) {
  const id = `satir-${index}`
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: isDragging ? 'var(--surface-sunken, #F4F6F8)' : undefined,
    opacity: isDragging ? 0.7 : 1,
    boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.10)' : 'none',
    zIndex: isDragging ? 10 : 'auto',
    position: 'relative',
  }
  return (
    <tr ref={setNodeRef} style={style}>
      <td style={{ padding: '4px 2px', textAlign: 'center', verticalAlign: 'middle' }}>
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Satırı sürükle"
          title="Sürükleyip yer değiştir"
          style={{
            width: 22, height: 22, padding: 0,
            background: 'none', border: 'none',
            cursor: 'grab', color: 'var(--text-tertiary, #94A3B8)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'none',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--brand, #3b82f6)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary, #94A3B8)' }}
        >
          <GripVertical size={14} strokeWidth={1.7} />
        </button>
      </td>
      {children}
    </tr>
  )
}

export default TeklifDetay
