import { useState, useEffect, useRef } from 'react'
import { useUrlSayfa } from '../lib/useUrlSayfa'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Pencil, Trash2, Check, Receipt, Bell, AlertCircle, FileText, Inbox,
  ChevronUp, ChevronDown, Download, Inbox as InboxMail, ClipboardEdit, Search as SearchIc,
  CheckCircle2, Ban, Clock, Layers, AlertTriangle,
} from 'lucide-react'

import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useHatirlatma } from '../context/HatirlatmaContext'
import {
  teklifleriGetir, tekliflerIlkSayfa, teklifSil as dbTeklifSil,
  musteriTalepleriniGetir, musteriTalepGuncelle, teklifTaslakGetir,
} from '../services/teklifService'
import { useAuth } from '../context/AuthContext'
import { satisTeklifRozetleri } from '../services/satisService'
import {
  TEKLIF_DURUM_META, tekliftenDurum,
} from '../lib/teklifDurumlari'
import { trContains } from '../lib/trSearch'
import {
  teklifAcikMi, yaslandirmaOzeti, kovayaGiriyorMu, kisiBazliAcik,
} from '../lib/teklifTakip'
import AcikTeklifSeridi from '../components/AcikTeklifSeridi'
import CustomSelect from '../components/CustomSelect'
import { SkeletonList } from '../components/Skeleton'
import {
  Button, SearchInput, Card, Badge, CodeBadge, EmptyState,
} from '../components/ui'

// Rozet artık gerçek durumu (spek_durum öncelikli) gösterir. Eskiden yalnız eski
// onay_durumu kolonuna bakıyordu; yönetici onayı bekleyen teklif "Cevap Bekleniyor"
// görünüp detay sayfasıyla çelişiyordu.
const DURUM_TONE = {
  taslak:                'neutral',
  yon_onay_bekliyor:     'beklemede',
  revizyon_istendi:      'uyari',
  yon_onayladi:          'basarili',
  musteriye_gonderildi:  'lead',
  musteri_onay_bekliyor: 'lead',
  musteri_onayladi:      'aktif',
  musteri_reddetti:      'kayip',
  suresi_doldu:          'neutral',
  siparise_aktarildi:    'aktif',
}

// Şablon tipi badge — 'standart' için gürültü olmasın diye render edilmez
const tipBadge = {
  trassir: { tone: 'lead',  isim: 'Trassir' },
  karel:   { tone: 'aktif', isim: 'Karel' },
}

const talepTone = {
  bekliyor:          { tone: 'beklemede', isim: 'Bekliyor',           C: Clock },
  inceleniyor:       { tone: 'lead',      isim: 'İnceleniyor',         C: SearchIc },
  teklif_hazirlandi: { tone: 'aktif',     isim: 'Teklif Hazırlandı',   C: CheckCircle2 },
  iptal:             { tone: 'kayip',     isim: 'İptal',              C: Ban },
}

const fmtTL = (n) => `₺${(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
// Para birimini teklife göre formatla (TEK-0547 USD'ydi, listede ₺ gösterilince yanıltıcı)
const PARA_SEMBOL = { TL: '₺', USD: '$', EUR: '€' }
const fmtPara = (n, paraBirimi) => {
  const sembol = PARA_SEMBOL[paraBirimi] || '₺'
  return `${sembol}${(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const goreceTarih = (t) => {
  if (!t) return '—'
  const gun = Math.floor((Date.now() - new Date(t).getTime()) / 86400000)
  if (gun === 0) return 'bugün'
  if (gun === 1) return 'dün'
  if (gun < 7)   return `${gun} gün önce`
  if (gun < 30)  return `${Math.floor(gun / 7)} hafta önce`
  if (gun < 365) return `${Math.floor(gun / 30)} ay önce`
  return `${Math.floor(gun / 365)} yıl önce`
}

// ⚠️ Sekmeler TÜM durumları kapsamalı. 11.08.2026'ya kadar `bekliyor` hiçbir
// sekmede yoktu: 482 teklif (toplamın %32'si) yalnız "Tümü"de görünüyordu.
// Aynı hata Servis Talepleri'nde de vardı (kapalı işler hiç sayılmıyordu).
const filtreMap = {
  acik:              (t) => teklifAcikMi(t),          // bekliyor + takipte + revizyon + durumsuz
  bekleyenler:       (t) => t.onayDurumu === 'bekliyor',
  cevap_beklenenler: (t) => ['takipte', 'revizyon'].includes(t.onayDurumu),
  onaylananlar:      (t) => t.onayDurumu === 'kabul',
  reddedilenler:     (t) => t.onayDurumu === 'vazgecildi',
  tumu:              () => true,
}

export default function Teklifler() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { teklifHatirlatmasi, hatirlatmaSil } = useHatirlatma()

  const { kullanici } = useAuth()

  const [teklifler, setTeklifler] = useState([])
  const [musteriTalepleri, setMusteriTalepleri] = useState([])
  const [satislar, setSatislar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [tamListeHazir, setTamListeHazir] = useState(false)
  const [sunucuToplam, setSunucuToplam] = useState(0)
  const tamListeHazirRef = useRef(false)

  const [aktifSekme, setAktifSekme] = useState('cevap_beklenenler')
  const [arama, setArama] = useState('')
  const [seciliTalep, setSeciliTalep] = useState(null)
  const [siralama, setSiralama] = useState('yeni')  // yeni | eski | tutar_yuksek | tutar_dusuk
  const [benimTekliflerim, setBenimTekliflerim] = useState(false) // "Tekliflerim" — hazırlayan/temsilci benim
  // Sayfa no URL'de (?sayfa=N): teklif detayından geri dönünce liste aynı sayfada (06.08)
  // Yaşlandırma kovası filtresi — şeritteki kutuya tıklayınca dolar.
  // null = kova filtresi yok.
  const [yasFiltresi, setYasFiltresi] = useState(null)
  // Kullanıcının kaydedilmemiş yeni-teklif taslağı (mig 308) — 18.08
  // Ahmet/Turkuaz vakası: taslak yalnız Yeni Teklif'te görünüyordu,
  // listede arayan "kaydetmedim, kayboldu" sanıyordu.
  const [taslagim, setTaslagim] = useState(null)
  // İCMAL modu (20.08): aynı kurumun 3-4 teklifi tek belgede sunulur.
  // Seçim DİZİ tutulur (Set değil) — icmal kapağındaki sıra SEÇİM sırasıdır
  // (kullanıcı "kamera / ses / yangın" gibi anlamlı bir sunum sırası kurar).
  const [icmalModu, setIcmalModu] = useState(false)
  const [icmalSecim, setIcmalSecim] = useState([])
  const [sayfa, setSayfa] = useUrlSayfa([aktifSekme, arama, siralama, benimTekliflerim, yasFiltresi])

  // Filtre/sekme/arama değişince 1. sayfaya dön

  useEffect(() => {
    let iptal = false
    // AŞAMA 1 — hızlı ilk boyama: en yeni ~60 teklif + toplam (Gorusmeler deseni).
    // Önbellek doluysa tam liste zaten senkron gelir; ilk sayfa onu ezmesin.
    tekliflerIlkSayfa()
      .then(({ satirlar, toplam }) => {
        if (iptal || tamListeHazirRef.current) return
        setTeklifler(satirlar)
        setSunucuToplam(toplam)
        setYukleniyor(false)
      })
      .catch(() => {})
    // AŞAMA 2 — tam liste arka planda
    teklifleriGetir()
      .then(t => {
        if (iptal) return
        tamListeHazirRef.current = true
        setTeklifler(t || [])
        setTamListeHazir(true)
        setYukleniyor(false)
      })
      .catch(err => { console.error('[Teklifler yükle]', err); if (!iptal) setYukleniyor(false) })
    // Yan veriler liste render'ını BEKLETMEZ
    musteriTalepleriniGetir().then(tl => { if (!iptal) setMusteriTalepleri(tl || []) }).catch(() => {})
    satisTeklifRozetleri().then(s => { if (!iptal) setSatislar(s || []) }).catch(() => {})
    teklifTaslakGetir(kullanici?.id).then(t => { if (!iptal) setTaslagim(t) }).catch(() => {})
    return () => { iptal = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (yukleniyor) return <SkeletonList />

  // "Tekliflerim": hazırlayan veya müşteri temsilcisi alanında benim adım
  // (TR büyük/küçük harf duyarsız)
  const benimAdim = String(kullanici?.ad || '').trim().toLocaleLowerCase('tr')
  const teklifBenimMi = (t) => {
    // Öncelik gerçek FK (mig 223) — karar bildirimi de bu kişiye gidiyor, liste onunla
    // birebir örtüşsün. Eski kayıtlarda kolon boş kalabilir → serbest metin adla eşle.
    if (t.olusturanId && kullanici?.id) return String(t.olusturanId) === String(kullanici.id)
    if (!benimAdim) return false
    return [t.hazirlayan, t.musteriTemsilcisi, t.olusturanAd]
      .some(a => String(a || '').trim().toLocaleLowerCase('tr') === benimAdim)
  }
  const bazTeklifler = benimTekliflerim ? teklifler.filter(teklifBenimMi) : teklifler

  const bekleyenSayisi = musteriTalepleri.filter(t => t.durum === 'bekliyor').length

  const musteriTalepDurumGuncelle = async (id, yeniDurum) => {
    await musteriTalepGuncelle(id, { durum: yeniDurum })
    setMusteriTalepleri(prev => prev.map(t => t.id === id ? { ...t, durum: yeniDurum } : t))
  }

  const teklifOlustur = (talep) => {
    localStorage.setItem('teklif_on_doldurum', JSON.stringify({
      firmaAdi: talep.firmaAdi, musteriYetkilisi: talep.iletisimKisi,
      konu: `Teklif Talebi - ${talep.talepNo}`,
      aciklama: talep.aciklama,
      satirlar: (talep.urunler || []).map(u => ({
        stokKodu: '', stokAdi: u.isim, miktar: parseInt(u.adet) || 1,
        birim: 'Adet', birimFiyat: 0, iskonto: 0, kdv: 20,
      })),
      musteriTalepId: talep.id, musteriTalepNo: talep.talepNo,
    }))
    musteriTalepDurumGuncelle(talep.id, 'inceleniyor')
    navigate('/teklifler/yeni')
  }

  // Listede onay butonu YOKTUR. Onay, teklif detayındaki durum akışı üzerinden
  // verilir — listeden tek tıkla onaylamak adım atlatıyordu (bkz. 2026-07-15).
  const teklifSil = async (id) => {
    const onay = await confirm({
      baslik: 'Teklifi Sil',
      mesaj: 'Bu teklif kalıcı olarak silinecek. Emin misiniz?',
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    await dbTeklifSil(id)
    setTeklifler(prev => prev.filter(t => t.id !== id))
    // Bu teklife bağlı hatırlatmayı da sil — silinmiş tekliften bildirim gelmesin
    hatirlatmaSil(id).catch(() => {})
    toast.success('Teklif silindi.')
  }

  // Eski faturayaDonustur KALDIRILDI (2026-07-15); ?proforma=1 kısayolu da
  // KALDIRILDI (2026-08-06): proforma artık TEKLİFTEN kesilmez — teklif
  // siparişe dönüşür, proforma SİPARİŞ üzerinden kesilir (faturaTalepService
  // aynı kuralı sunucu tarafında da uygular).

  // ── İCMAL seçimi ──────────────────────────────────────────────────────────
  const icmalToggle = (id) => {
    setIcmalSecim(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  const icmalKapat = () => { setIcmalModu(false); setIcmalSecim([]) }
  const icmalGoruntule = () => {
    if (icmalSecim.length < 2) return
    // Senkron window.open — await yok, popup engeline takılmaz
    window.open(`/teklifler/icmal/yazdir?ids=${icmalSecim.join(',')}`, '_blank')
  }
  const icmalSecilenler = icmalSecim
    .map(id => teklifler.find(t => t.id === id))
    .filter(Boolean)
  const icmalFirmalar = [...new Set(icmalSecilenler.map(t => String(t.firmaAdi || '').trim()).filter(Boolean))]

  const siralayici = {
    yeni:          (a, b) => new Date(b.tarih || b.olusturmaTarih || 0) - new Date(a.tarih || a.olusturmaTarih || 0),
    eski:          (a, b) => new Date(a.tarih || a.olusturmaTarih || 0) - new Date(b.tarih || b.olusturmaTarih || 0),
    tutar_yuksek:  (a, b) => Number(b.genelToplam || 0) - Number(a.genelToplam || 0),
    tutar_dusuk:   (a, b) => Number(a.genelToplam || 0) - Number(b.genelToplam || 0),
  }

  // ⚠️ Yaşlandırma özeti ve liste AYNI kümeden türer (`aramaSonrasi`). Özet ham
  // listeden hesaplanırsa şerit bir sayı, liste başka sayı gösterir — bugün
  // Görevler ve Servis Talepleri'nde tam olarak bu yaşandı.
  const aramaSonrasi = bazTeklifler
    .filter(t => trContains(`${t.teklifNo || ''} ${t.firmaAdi || ''} ${t.konu || ''}`, arama))
  const takipOzeti = yaslandirmaOzeti(aramaSonrasi)
  const kisiYuku = kisiBazliAcik(aramaSonrasi)

  const filtreli = [...aramaSonrasi]
    .filter(t => (filtreMap[aktifSekme] || (() => true))(t))
    .filter(t => !yasFiltresi || kovayaGiriyorMu(t, yasFiltresi))
    .sort(siralayici[siralama] || siralayici.yeni)

  // Şeritteki kutuya tıkla → açık teklifler + o yaş kovası
  const kovaSec = (kovaId) => {
    const ayni = yasFiltresi === kovaId && aktifSekme === 'acik'
    setYasFiltresi(ayni ? null : kovaId)
    setAktifSekme(ayni ? 'tumu' : 'acik')
  }

  const SAYFA_BOY = 100
  const toplamSayfa = Math.max(1, Math.ceil(filtreli.length / SAYFA_BOY))
  const guvenliSayfa = Math.min(sayfa, toplamSayfa)
  const gorunenTeklifler = filtreli.slice((guvenliSayfa - 1) * SAYFA_BOY, guvenliSayfa * SAYFA_BOY)
  const sayfaGit = (p) => { setSayfa(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  // Sayfa numaraları: 1 … (aktif±2) … son
  const sayfaListesi = []
  for (let p = 1; p <= toplamSayfa; p++) {
    if (p === 1 || p === toplamSayfa || Math.abs(p - guvenliSayfa) <= 2) sayfaListesi.push(p)
    else if (sayfaListesi[sayfaListesi.length - 1] !== '…') sayfaListesi.push('…')
  }

  const taslakDolu = taslagim?.form
    && (taslagim.form.firmaAdi || taslagim.form.konu || (taslagim.form.satirlar || []).length > 0)

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Kaydedilmemiş taslak şeridi — taslak listede kayıt olarak GÖRÜNMEZ,
          bu şerit "kayboldu" sanılmasını engeller (18.08 Ahmet/Turkuaz) */}
      {taslakDolu && (
        <Card style={{ padding: '10px 14px', marginBottom: 14, borderLeft: '3px solid var(--accent, #2563eb)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <span className="t-body-strong">Kaydedilmemiş teklif taslağın var: </span>
              <span className="t-body" style={{ color: 'var(--text-secondary)' }}>
                {taslagim.form.firmaAdi || 'müşteri seçilmemiş'} — {(taslagim.form.satirlar || []).length} satır
                {taslagim.ts ? ` · ${new Date(taslagim.ts).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` : ''}
              </span>
            </div>
            <Button variant="primary" onClick={() => navigate('/teklifler/yeni?taslak=1')}>Devam Et</Button>
          </div>
        </Card>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <p className="t-caption" style={{ marginTop: 4 }}>
            <span className="tabular-nums">{tamListeHazir ? bazTeklifler.length : sunucuToplam}</span> teklif
            {!tamListeHazir && <span style={{ opacity: 0.6 }}> · tüm kayıtlar yükleniyor…</span>}
          </p>
        </div>
        {aktifSekme !== 'musteri_talepleri' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Kapsam: Tümü | Tekliflerim (hazırlayan/temsilci benim) */}
            <div style={{ display: 'inline-flex', padding: 2, background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)' }}>
              {[{ v: false, l: 'Tümü' }, { v: true, l: 'Tekliflerim' }].map(s => (
                <button
                  key={s.l}
                  onClick={() => { setBenimTekliflerim(s.v); setYasFiltresi(null) }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'calc(var(--radius-sm) - 2px)',
                    background: benimTekliflerim === s.v ? 'var(--surface-card)' : 'transparent',
                    boxShadow: benimTekliflerim === s.v ? 'var(--shadow-sm)' : 'none',
                    color: benimTekliflerim === s.v ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: 'none', cursor: 'pointer',
                    font: '500 13px/18px var(--font-sans)',
                  }}
                >
                  {s.l}
                </button>
              ))}
            </div>
            <Button
              variant={icmalModu ? 'primary' : 'secondary'}
              iconLeft={<Layers size={14} strokeWidth={1.5} />}
              onClick={() => icmalModu ? icmalKapat() : setIcmalModu(true)}
              title="Aynı kurumun birden çok teklifini tek belgede (icmal) görüntüle"
            >
              {icmalModu ? 'İcmali Kapat' : 'İcmal'}
            </Button>
            <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => navigate('/teklifler/yeni')}>
              Yeni teklif
            </Button>
          </div>
        )}
      </div>

      {/* İCMAL seçim şeridi — mod açıkken görünür */}
      {icmalModu && aktifSekme !== 'musteri_talepleri' && (
        <Card style={{ padding: '10px 14px', marginBottom: 14, borderLeft: '3px solid var(--brand-primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <span className="t-body-strong">
                <span className="tabular-nums">{icmalSecim.length}</span> teklif seçildi
              </span>
              <span className="t-body" style={{ color: 'var(--text-secondary)' }}>
                {' '}— listeden işaretleyin; icmal kapağındaki sıra seçim sıranızdır.
              </span>
              {icmalFirmalar.length > 1 && (
                <div style={{
                  display: 'flex', gap: 6, alignItems: 'center', marginTop: 6,
                  font: '500 12px/16px var(--font-sans)', color: 'var(--warning)',
                }}>
                  <AlertTriangle size={13} strokeWidth={1.7} style={{ flexShrink: 0 }} />
                  Farklı müşterilerden teklif seçtiniz: {icmalFirmalar.join(' · ')}
                </div>
              )}
            </div>
            <Button
              variant="primary"
              iconLeft={<Layers size={14} strokeWidth={1.5} />}
              disabled={icmalSecim.length < 2}
              title={icmalSecim.length < 2 ? 'En az 2 teklif seçin' : 'İcmali yeni sekmede aç'}
              onClick={icmalGoruntule}
            >
              İcmal Görüntüle ({icmalSecim.length})
            </Button>
            <Button variant="secondary" onClick={icmalKapat}>Vazgeç</Button>
          </div>
        </Card>
      )}

      {/* Arama + Sıralama */}
      {aktifSekme !== 'musteri_talepleri' && (
        <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, maxWidth: 400, minWidth: 240 }}>
            <SearchInput
              value={arama}
              onChange={e => setArama(e.target.value)}
              placeholder="Teklif no, firma veya konu ara…"
            />
          </div>
          <div style={{ minWidth: 200 }}>
            <CustomSelect value={siralama} onChange={e => setSiralama(e.target.value)}>
              <option value="yeni">Tarih: Yeni → Eski</option>
              <option value="eski">Tarih: Eski → Yeni</option>
              <option value="tutar_yuksek">Tutar: Yüksek → Düşük</option>
              <option value="tutar_dusuk">Tutar: Düşük → Yüksek</option>
            </CustomSelect>
          </div>
        </div>
      )}

      {/* ─── AÇIK TEKLİF TAKİBİ — yaşlandırma şeridi ───
          Kutular tıklanabilir; gösterdikleri kümeyi AYNEN listeler
          (sayaç ↔ liste kapsam kuralı). Düzen AcikTeklifSeridi içinde. */}
      {aktifSekme !== 'musteri_talepleri' && (
        <AcikTeklifSeridi
          ozet={takipOzeti}
          kisiYuku={kisiYuku}
          yasFiltresi={yasFiltresi}
          aktif={aktifSekme === 'acik'}
          onKovaSec={kovaSec}
        />
      )}

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 0, borderBottom: '1px solid var(--border-default)', overflowX: 'auto' }}>
        {[
          { id: 'acik',              label: 'Açık' },
          { id: 'bekleyenler',       label: 'Bekleyenler' },
          { id: 'cevap_beklenenler', label: 'Cevap Beklenenler' },
          { id: 'onaylananlar',      label: 'Onaylananlar' },
          { id: 'reddedilenler',     label: 'Reddedilenler' },
          { id: 'tumu',              label: 'Tümü' },
          { id: 'musteri_talepleri', label: 'Müşteri Talepleri', icon: <InboxMail size={12} strokeWidth={1.5} />, badge: bekleyenSayisi },
        ].map(s => {
          const aktif = aktifSekme === s.id
          return (
            <button
              key={s.id}
              // Sekme değişince yaş kovası filtresi düşer — aksi hâlde
              // "Onaylananlar"a geçince gizli bir 31-90 gün filtresi kalır
              // ve liste boş görünür, sebebi ekranda yazmaz.
              onClick={() => { setAktifSekme(s.id); setYasFiltresi(null) }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${aktif ? 'var(--brand-primary)' : 'transparent'}`,
                marginBottom: -1,
                color: aktif ? 'var(--brand-primary)' : 'var(--text-secondary)',
                // agirlik HEP 600: aktifken degisirse sekme genisligi zipliyor (FaturaTalepleri'ndeki ayni fix)
                font: '600 13px/18px var(--font-sans)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                fontSize: 11,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {s.icon}
              {s.label}
              {s.badge > 0 && (
                <span style={{
                  minWidth: 16, height: 16, padding: '0 5px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--danger)', color: '#fff',
                  fontSize: 10, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {s.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* MÜŞTERİ TALEPLERİ */}
      {aktifSekme === 'musteri_talepleri' && (
        <div style={{ marginTop: 20 }}>
          {musteriTalepleri.length === 0 ? (
            <EmptyState icon={<Inbox size={32} strokeWidth={1.5} />} title="Henüz müşteri teklif talebi yok" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[...musteriTalepleri].sort((a, b) => new Date(b.tarih) - new Date(a.tarih)).map(talep => {
                const d = talepTone[talep.durum] || talepTone.bekliyor
                const IconC = d.C
                const acik = seciliTalep === talep.id
                return (
                  <Card key={talep.id} padding={0} style={{ overflow: 'hidden' }}>
                    <div
                      onClick={() => setSeciliTalep(acik ? null : talep.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 16,
                        padding: '14px 20px',
                        cursor: 'pointer',
                        transition: 'background 120ms',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <CodeBadge>{talep.talepNo}</CodeBadge>
                          <Badge tone={d.tone} icon={<IconC size={11} strokeWidth={1.5} />}>{d.isim}</Badge>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, font: '400 13px/18px var(--font-sans)', flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{talep.firmaAdi || '—'}</span>
                          <span style={{ color: 'var(--border-default)' }}>·</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{talep.iletisimKisi}</span>
                          <span style={{ color: 'var(--border-default)' }}>·</span>
                          <span style={{ color: 'var(--text-tertiary)' }}>
                            <span className="tabular-nums">{talep.urunler?.length || 0}</span> ürün
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtTarih(talep.tarih)}
                        </span>
                        {acik ? <ChevronUp size={14} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronDown size={14} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />}
                      </div>
                    </div>

                    {acik && (
                      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-default)', background: 'var(--surface-sunken)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 20 }}>
                          <div>
                            <p className="t-label" style={{ marginBottom: 8 }}>İSTENEN ÜRÜNLER</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {(talep.urunler || []).map((u, i) => (
                                <div key={i} style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '6px 10px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: 'var(--surface-card)',
                                  border: '1px solid var(--border-default)',
                                }}>
                                  <span style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{u.isim}</span>
                                  <span style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                                    {u.adet} adet
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                              <p className="t-label" style={{ marginBottom: 6 }}>AÇIKLAMA</p>
                              <p style={{
                                font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)',
                                padding: '8px 10px',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--surface-card)',
                                border: '1px solid var(--border-default)',
                                margin: 0,
                              }}>
                                {talep.aciklama}
                              </p>
                            </div>
                            {talep.butce && (
                              <div>
                                <p className="t-label" style={{ marginBottom: 4 }}>BÜTÇE</p>
                                <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{talep.butce}</p>
                              </div>
                            )}
                            {talep.telefon && (
                              <div>
                                <p className="t-label" style={{ marginBottom: 4 }}>TELEFON</p>
                                <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{talep.telefon}</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-default)', flexWrap: 'wrap' }}>
                          {(talep.durum === 'bekliyor' || talep.durum === 'inceleniyor') && (
                            <Button variant="primary" iconLeft={<ClipboardEdit size={14} strokeWidth={1.5} />} onClick={() => teklifOlustur(talep)}>
                              Teklif oluştur
                            </Button>
                          )}
                          <div style={{ minWidth: 180 }}>
                            <CustomSelect
                              value={talep.durum}
                              onChange={e => musteriTalepDurumGuncelle(talep.id, e.target.value)}
                            >
                              <option value="bekliyor">Bekliyor</option>
                              <option value="inceleniyor">İnceleniyor</option>
                              <option value="teklif_hazirlandi">Teklif Hazırlandı</option>
                              <option value="iptal">İptal</option>
                            </CustomSelect>
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TEKLİF TABLOSU */}
      {aktifSekme !== 'musteri_talepleri' && (
        <div style={{ marginTop: 20 }}>
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {gorunenTeklifler.length === 0 ? (
              <div style={{ padding: 40 }}>
                <EmptyState
                  icon={<FileText size={32} strokeWidth={1.5} />}
                  title={arama ? 'Arama sonucu bulunamadı' : 'Bu kategoride teklif bulunmuyor'}
                />
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  {/* tableLayout fixed + colgroup: uzun firma/konu adları satırı bozmaz, üç nokta ile kısalır */}
                  <table style={{ width: '100%', minWidth: 1120, tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>
                    <colgroup>
                      {icmalModu && <col style={{ width: 40 }} />} {/* İcmal seçimi */}
                      <col style={{ width: 112 }} />               {/* Teklif No */}
                      <col style={{ width: '24%' }} />             {/* Müşteri */}
                      <col style={{ width: '24%' }} />             {/* Açıklama */}
                      {/* ikonlu "Proforma oluştur" butonu ~176px — dar olursa Düzenleme kolonuna taşıyor */}
                      <col style={{ width: 180 }} />               {/* Proforma */}
                      <col style={{ width: 104 }} />               {/* Düzenleme */}
                      <col style={{ width: 118 }} />               {/* Hazırlayan */}
                      <col style={{ width: 148 }} />               {/* Toplam */}
                      <col style={{ width: 148 }} />               {/* Aksiyonlar */}
                    </colgroup>
                    <thead>
                      <tr>
                        {[
                          ...(icmalModu ? [{ l: '' }] : []),
                          { l: 'Teklif No' },
                          { l: 'Müşteri' },
                          { l: 'Teklif Açıklaması' },
                          { l: 'Proforma' },
                          { l: 'Düzenleme' },
                          { l: 'Hazırlayan' },
                          { l: 'Toplam', align: 'right' },
                          { l: '', align: 'right' },
                        ].map((h, i) => (
                          <th key={i} style={{
                            background: 'var(--surface-sunken)',
                            padding: '10px 14px',
                            textAlign: h.align || 'left',
                            font: '600 11px/16px var(--font-sans)',
                            color: 'var(--text-tertiary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            borderBottom: '1px solid var(--border-default)',
                            whiteSpace: 'nowrap',
                          }}>{h.l}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {gorunenTeklifler.map(t => {
                        const durum = tekliftenDurum(t)
                        const onay = {
                          tone: DURUM_TONE[durum] || 'neutral',
                          isim: TEKLIF_DURUM_META[durum]?.isim || 'Taslak',
                        }
                        const hatirlatma = teklifHatirlatmasi(t.id)
                        const hatirlatmaVadesiGeldi = hatirlatma && new Date(hatirlatma.hatirlatmaTarihi) <= new Date()
                        const ilgiliFatura = satislar.find(s => s.teklifId === t.id)
                        return (
                          <tr key={t.id}
                            style={{ transition: 'background 120ms' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            {/* İcmal seçimi */}
                            {icmalModu && (
                              <td style={{ padding: '5px 0 5px 14px', borderBottom: '1px solid var(--border-default)', verticalAlign: 'middle' }}>
                                <input
                                  type="checkbox"
                                  aria-label={`${t.teklifNo || t.id} icmale ekle`}
                                  checked={icmalSecim.includes(t.id)}
                                  onChange={() => icmalToggle(t.id)}
                                  style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--brand-primary)' }}
                                />
                              </td>
                            )}
                            {/* Teklif No */}
                            <td style={{ padding: '5px 10px 12px 14px', borderBottom: '1px solid var(--border-default)', overflow: 'hidden' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                                {hatirlatma && (
                                  <span
                                    title={hatirlatmaVadesiGeldi
                                      ? 'Takip zamanı geldi!'
                                      : `Hatırlatma: ${new Date(hatirlatma.hatirlatmaTarihi).toLocaleDateString('tr-TR')}`}
                                    style={{ display: 'inline-flex', flexShrink: 0, color: hatirlatmaVadesiGeldi ? 'var(--danger)' : 'var(--warning)' }}
                                  >
                                    {hatirlatmaVadesiGeldi
                                      ? <AlertCircle size={13} strokeWidth={1.5} />
                                      : <Bell size={13} strokeWidth={1.5} />}
                                  </span>
                                )}
                                <button
                                  onClick={() => navigate(`/teklifler/${t.id}`)}
                                  title={t.teklifNo}
                                  style={{
                                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
                                    color: 'var(--brand-primary)', whiteSpace: 'nowrap',
                                    overflow: 'hidden', textOverflow: 'ellipsis',
                                  }}
                                >
                                  {t.teklifNo || `#${t.id}`}
                                </button>
                              </div>
                              {t.revizyon > 0 && (
                                <div style={{ font: '500 11px/14px var(--font-sans)', color: 'var(--warning)', marginTop: 2 }}>Rev.{t.revizyon}</div>
                              )}
                            </td>
                            {/* Müşteri */}
                            <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--border-default)', overflow: 'hidden' }}>
                              <div title={t.firmaAdi || ''} style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {t.firmaAdi || '—'}
                              </div>
                              {t.musteriYetkilisi && (
                                <div style={{ font: '400 11.5px/15px var(--font-sans)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                                  {t.musteriYetkilisi}
                                </div>
                              )}
                            </td>
                            {/* Teklif Açıklaması */}
                            <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--border-default)', overflow: 'hidden' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <button
                                  onClick={() => navigate(`/teklifler/${t.id}`)}
                                  title={t.konu || ''}
                                  style={{
                                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                    font: '400 13px/18px var(--font-sans)', color: 'var(--text-primary)',
                                    textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    minWidth: 0, flex: '0 1 auto',
                                  }}
                                >
                                  {t.konu || '—'}
                                </button>
                                {tipBadge[t.teklifTipi] && (
                                  <span style={{ flexShrink: 0 }}>
                                    <Badge tone={tipBadge[t.teklifTipi].tone}>{tipBadge[t.teklifTipi].isim}</Badge>
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '5px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                {ilgiliFatura ? (
                                  <button
                                    onClick={() => navigate(`/satislar/${ilgiliFatura.id}`)}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 4,
                                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                      font: '500 12px/16px var(--font-sans)', color: 'var(--success)',
                                    }}
                                  >
                                    <CheckCircle2 size={12} strokeWidth={1.5} /> Fatura oluşturuldu
                                  </button>
                                ) : t.onayDurumu === 'kabul' ? (
                                  // İŞ KURALI (06.08): proforma TEKLİFTEN kesilmez — teklif
                                  // siparişe dönüşür, proforma SİPARİŞ üzerinden kesilir.
                                  // (Teklif + sipariş çifte proformaya yol açıyordu.)
                                  <Badge tone="basarili">Kabul</Badge>
                                ) : (
                                  <Badge tone={onay.tone}>{onay.isim}</Badge>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '5px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                              <div style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                                {fmtTarih(t.tarih)}
                              </div>
                              <div style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', fontStyle: 'italic', marginTop: 2 }}>
                                {goreceTarih(t.tarih)}
                              </div>
                            </td>
                            <td style={{ padding: '5px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                              <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                                {t.olusturanAd || t.hazirlayan || '—'}
                              </div>
                            </td>
                            <td style={{ padding: '5px 14px', textAlign: 'right', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 140 }}>
                                {Number(t.genelToplam) ? (
                                  <>
                                    <span style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                                      {fmtPara(t.genelToplam, t.paraBirimi)}
                                    </span>
                                    <span style={{
                                      width: 34,
                                      textAlign: 'center',
                                      padding: '1px 0',
                                      borderRadius: 8,
                                      background: t.paraBirimi && t.paraBirimi !== 'TL' ? 'var(--warning-soft)' : 'transparent',
                                      color: t.paraBirimi && t.paraBirimi !== 'TL' ? 'var(--warning)' : 'transparent',
                                      font: '700 9px/13px var(--font-sans)',
                                    }}>{t.paraBirimi && t.paraBirimi !== 'TL' ? t.paraBirimi : '·'}</span>
                                  </>
                                ) : (
                                  /* 0/boş toplam = fiyat hiç girilmemiş — $0,00 gerçek tutar sanılmasın */
                                  <span style={{ font: '400 11.5px/16px var(--font-sans)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                                    Fiyat girilmemiş
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '5px 14px', textAlign: 'right', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'inline-flex', gap: 4 }}>
                                <button
                                  aria-label="Düzenle"
                                  onClick={() => navigate(`/teklifler/${t.id}`)}
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
                                  onClick={() => teklifSil(t.id)}
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
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {toplamSayfa > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14, borderTop: '1px solid var(--border-default)', flexWrap: 'wrap' }}>
                    <button
                      disabled={guvenliSayfa <= 1}
                      onClick={() => sayfaGit(guvenliSayfa - 1)}
                      style={{
                        padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-default)', background: 'transparent',
                        color: guvenliSayfa <= 1 ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                        cursor: guvenliSayfa <= 1 ? 'default' : 'pointer',
                        font: '500 13px/18px var(--font-sans)',
                      }}
                    >‹ Önceki</button>
                    {sayfaListesi.map((p, i) => p === '…' ? (
                      <span key={`e${i}`} style={{ padding: '0 4px', color: 'var(--text-tertiary)' }}>…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => sayfaGit(p)}
                        style={{
                          minWidth: 34, padding: '6px 8px', borderRadius: 'var(--radius-sm)',
                          border: `1px solid ${p === guvenliSayfa ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                          background: p === guvenliSayfa ? 'var(--brand-primary-soft)' : 'transparent',
                          color: p === guvenliSayfa ? 'var(--brand-primary)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          font: `${p === guvenliSayfa ? 600 : 500} 13px/18px var(--font-sans)`,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >{p}</button>
                    ))}
                    <button
                      disabled={guvenliSayfa >= toplamSayfa}
                      onClick={() => sayfaGit(guvenliSayfa + 1)}
                      style={{
                        padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-default)', background: 'transparent',
                        color: guvenliSayfa >= toplamSayfa ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                        cursor: guvenliSayfa >= toplamSayfa ? 'default' : 'pointer',
                        font: '500 13px/18px var(--font-sans)',
                      }}
                    >Sonraki ›</button>
                  </div>
                )}

                {gorunenTeklifler.length > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 20px',
                    background: 'var(--surface-sunken)',
                    borderTop: '1px solid var(--border-default)',
                    font: '400 12px/16px var(--font-sans)',
                    color: 'var(--text-tertiary)',
                  }}>
                    <span className="tabular-nums">
                      {(guvenliSayfa - 1) * SAYFA_BOY + 1}–{(guvenliSayfa - 1) * SAYFA_BOY + gorunenTeklifler.length} / {filtreli.length} kayıt
                      {toplamSayfa > 1 ? ` · Sayfa ${guvenliSayfa}/${toplamSayfa}` : ''}
                    </span>
                    <div style={{ display: 'flex', gap: 24 }}>
                      <span title="Sadece TL teklifleri toplanır (farklı para birimleri toplanamaz)">
                        TL Toplam: <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtTL(
                            gorunenTeklifler
                              .filter(t => (t.paraBirimi || 'TL') === 'TL')
                              .reduce((s, t) => s + (t.genelToplam || 0), 0)
                          )}
                        </strong>
                      </span>
                      <span title="Sadece TL kabul edilen teklifler toplanır">
                        Kabul edilen: <strong style={{ color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtTL(
                            gorunenTeklifler
                              .filter(t => t.onayDurumu === 'kabul' && (t.paraBirimi || 'TL') === 'TL')
                              .reduce((s, t) => s + (t.genelToplam || 0), 0)
                          )}
                        </strong>
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
