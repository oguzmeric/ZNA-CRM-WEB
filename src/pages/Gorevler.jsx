import { useState, useEffect, useCallback, useRef } from 'react'
import { useUrlSayfa } from '../lib/useUrlSayfa'
import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useBildirim } from '../context/BildirimContext'
import { useToast } from '../context/ToastContext'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, Pencil, Trash2, LayoutGrid, List, AlertCircle, Building2, Clock, MapPin, Settings,
  FolderOpen, CheckCircle2, Circle, Filter, ChevronLeft, ChevronRight, X,
  ChevronDown, CornerDownRight, Bookmark, Repeat, Copy,
} from 'lucide-react'
import {
  gorevleriGetir, gorevGetir, gorevEkle, gorevGuncelle as dbGorevGuncelle, gorevSil as dbGorevSil,
} from '../services/gorevService'
import { gorevKategorileriGetir } from '../services/gorevKategoriService'
import {
  GOREV_DURUMLARI, durumBilgi, KAPALI_DURUMLAR, SEBEP_ZORUNLU_DURUMLAR,
  gorevGecikti, etkinDurum, ONCELIK_SECENEKLERI, ONCELIK_MAP, oncelikBilgi,
  GIZLILIK_SECENEKLERI, ATAMA_TURLERI, TAMAMLAMA_KURALLARI, bugunStr,
  anaGorevKapatKontrol,
} from '../lib/gorevSabitleri'
import {
  SEKME_LISTESI, sekmeBaglami, sekmeKumesi, kapsamEsle,
  gorunurMu, durumEsle, inSearch, inDateEq, bitisGorunen, hiyerarsikSirala, listeSirala,
} from '../lib/gorevFiltre'
import {
  IlerlemeBar, EtkinDurumRozeti, OncelikNokta, SekmeSatiri, SebepModal, IsYukuPaneli,
} from '../components/gorev/GorevListeParcalari'
import GorevOtomasyonModal from '../components/gorev/GorevOtomasyonModal'
import CokluSelect from '../components/CokluSelect'
import { invalidate } from '../lib/cache'
import { gorevAtamaSMSGonderVeIsaretle } from '../services/smsService'
import { musterileriGetir } from '../services/musteriService'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { musteriLokasyonlariniGetir } from '../services/musteriLokasyonService'
import LokasyonYonetModal from '../components/LokasyonYonetModal'
import { useServisTalebi } from '../context/ServisTalebiContext'
import CustomSelect from '../components/CustomSelect'
import { EkSecici, EkListesi, panodanResimler } from '../components/EkAlani'
import { ekleriYukle } from '../lib/ekDosya'
import { SkeletonList } from '../components/Skeleton'
import {
  Button, Card, Input, Textarea, Label,
  Badge, EmptyState, Avatar, TarihSaatSecici,
} from '../components/ui'
import { useKaydedilmemisKoruma } from '../hooks/useKaydedilmemisKoruma'

// Kanban v2 (madde 33): 5 kolon — her kolon birden çok DB durumunu toplar,
// sürüklemede hedef kolonun ANA durumu (id) yazılır.
const kolonlar = [
  { id: 'bekliyor',      isim: 'Atandı',        renk: 'var(--info)',    durumlar: ['bekliyor', 'taslak'] },
  { id: 'devam',         isim: 'Devam Ediyor',  renk: 'var(--warning)', durumlar: ['devam', 'revize'] },
  { id: 'beklemede',     isim: 'Beklemede',     renk: '#f97316',        durumlar: ['beklemede', 'bilgi_bekleniyor'] },
  { id: 'onay_bekliyor', isim: 'Onay Bekliyor', renk: '#06b6d4',        durumlar: ['onay_bekliyor'] },
  { id: 'tamamlandi',    isim: 'Tamamlandı',    renk: 'var(--success)', durumlar: ['tamamlandi'] },
  // İptal + Reddedildi kanbanda kaybolmasın (tutarsızlık bulgusu) — buraya
  // sürükleme = iptal (SEBEP_ZORUNLU → sebep modalı açılır); reddedildi yalnız
  // kabul akışından atanır, kolonda sadece görüntülenir.
  { id: 'iptal',         isim: 'İptal / Red',   renk: 'var(--text-muted)', durumlar: ['iptal', 'reddedildi'] },
]
// durumBilgi ile normalize: legacy 'devam_ediyor' gibi alias'lar da kolonunu bulsun
const kolonBul = (durum) => kolonlar.find(k => k.durumlar.includes(durumBilgi(durum).id))

// Liste sekmeleri (madde 30) — tanım ve eşleşme kuralı src/lib/gorevFiltre.js'te

// Sütun filtrelerinin boş hâli — hem ilk değer, hem "Filtreleri temizle", hem
// kayıtlı filtre uygulaması BURADAN başlar (biri unutulursa eski değer kalıyor
// ve kullanıcı sebebini göremediği bir daralmayla karşılaşıyordu).
const BOS_KOLON_FILTRE = { no: '', takip: '', veren: '', alan: '', gorev: '', basTar: '', bitTar: '', kontrol: '' }

const bosForm = {
  baslik: '', aciklama: '', atanan: '', oncelik: 'normal', durum: 'bekliyor',
  baslamaTarih: '', bitisTarih: '', sonTarih: '',
  musteriId: '', musteriAdi: '', firmaAdi: '',
  lokasyonId: '', gorusmeId: '',
  servisTalebiOlustur: false,
  ekip: [],
  // Form v2 (madde 4)
  kategoriId: '', gizlilik: 'standart', gozlemciler: [],
  onayGerekli: false, onaylayiciId: '', atamaTuru: 'tek',
  etiketlerMetin: '', beklenenCikti: '',
  hatirlatmaSecim: { gun3: false, gun1: false, gecikme: false },
  tamamlamaKurali: 'zorunlular',
}

// datetime-local (YYYY-MM-DDTHH:mm) → 'YYYY-MM-DD' (sonTarih legacy için)
const dtToTarih = (dt) => (dt || '').slice(0, 10)

// DB'deki hatirlatmalar jsonb'sinden checkbox durumu türet
const hatirlatmalardanSecim = (arr) => ({
  gun3: Array.isArray(arr) && arr.some(h => h?.tip === 'gun_once' && Number(h?.deger) === 3),
  gun1: Array.isArray(arr) && arr.some(h => h?.tip === 'gun_once' && Number(h?.deger) === 1),
  gecikme: Array.isArray(arr) && arr.some(h => h?.tip === 'gun_geciti_gunluk'),
})

// Form state → DB payload: UI-only alanları at, tipleri düzelt.
// detayYuklendi=false ise (düzenlemede tam kayıt henüz inmemişse) beklenenCikti
// ve hatirlatmalar payload'dan çıkarılır — mevcut değerler yanlışlıkla silinmesin.
const formdanPayload = (form, { detayYuklendi = true } = {}) => {
  const { servisTalebiOlustur: _atla, etiketlerMetin, hatirlatmaSecim, ...rest } = form
  const p = { ...rest }
  p.kategoriId = form.kategoriId ? Number(form.kategoriId) : null
  // Bağlı görüşme — boş string bigint FK'ye gidince PG hata verir, null'a çevir
  p.gorusmeId = form.gorusmeId ? Number(form.gorusmeId) : null
  p.onaylayiciId = form.onayGerekli && form.onaylayiciId ? Number(form.onaylayiciId) : null
  p.onayGerekli = !!form.onayGerekli
  p.gozlemciler = (form.gozlemciler || []).map(Number).filter(n => !Number.isNaN(n))
  p.etiketler = (etiketlerMetin || '').split(',').map(s => s.trim()).filter(Boolean)
  const h = []
  if (hatirlatmaSecim?.gun3) h.push({ tip: 'gun_once', deger: 3 })
  if (hatirlatmaSecim?.gun1) h.push({ tip: 'gun_once', deger: 1 })
  if (hatirlatmaSecim?.gecikme) h.push({ tip: 'gun_geciti_gunluk' })
  p.hatirlatmalar = h
  if (!detayYuklendi) { delete p.beklenenCikti; delete p.hatirlatmalar }
  return p
}

function GorevKarti({ gorev, kullanicilar, lokasyonAd, altSayi = 0, onClick, onEdit, onSil, yetki, overlay = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: gorev.id.toString() })
  // Yetkisi olmayan kullanıcı kartı SÜRÜKLEYEMEZ (RLS zaten reddediyor —
  // deneme-yanılma hatası yerine aksiyonu baştan kapat; denetim bulgusu)
  const suruklenebilir = !yetki || yetki.suruklenebilir !== false
  const silinebilir = !yetki || yetki.silinebilir !== false

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  const atananKisi = kullanicilar.find(k => k.id?.toString() === gorev.atanan)
  const ed = etkinDurum(gorev)
  const gecikti = ed.id === 'suresi_gecti'
  const bugun = bugunStr()
  const bugunMu = gorev.sonTarih === bugun && !KAPALI_DURUMLAR.includes(gorev.durum)

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: 'var(--surface-card)',
        border: `1px solid ${gecikti ? 'var(--danger-border)' : 'var(--border-default)'}`,
        borderLeft: `3px solid ${gecikti ? 'var(--danger)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-md)',
        padding: 14,
        marginBottom: 8,
        cursor: overlay ? 'grabbing' : (suruklenebilir ? 'grab' : 'pointer'),
        boxShadow: overlay ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
        userSelect: 'none',
      }}
      onClick={overlay ? undefined : onClick}
      {...attributes}
      {...(suruklenebilir ? listeners : {})}
      className="gorev-karti"
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 6 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <OncelikNokta oncelik={gorev.oncelik} />
          {gecikti && <Badge tone="kayip" icon={<AlertCircle size={11} strokeWidth={1.5} />}>{ed.isim}</Badge>}
          {bugunMu && !gecikti && <Badge tone="beklemede">Bugün</Badge>}
        </div>
        {!overlay && (onEdit || onSil) && (
          <div
            className="gorev-aksiyon"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'inline-flex', gap: 2,
              opacity: 0, transition: 'opacity 120ms',
            }}
          >
            {onEdit && (
              <button
                aria-label="Düzenle"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onEdit(gorev, e) }}
                style={{
                  width: 24, height: 24,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              >
                <Pencil size={11} strokeWidth={1.5} />
              </button>
            )}
            {onSil && silinebilir && (
              <button
                aria-label="Sil"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onSil(gorev.id, e) }}
                style={{
                  width: 24, height: 24,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              >
                <Trash2 size={11} strokeWidth={1.5} />
              </button>
            )}
          </div>
        )}
      </div>

      {gorev.gorevNo && (
        <div style={{ font: '500 10px/14px var(--font-mono, monospace)', color: 'var(--text-tertiary)', marginBottom: 2, letterSpacing: 0.3 }}>
          {gorev.ustGorevId ? <CornerDownRight size={9} strokeWidth={1.8} style={{ verticalAlign: -1, marginRight: 2 }} /> : null}
          {gorev.gorevNo}
        </div>
      )}

      <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 4 }}>
        {gorev.baslik}
      </div>

      {(altSayi > 0 || Number(gorev.ilerleme) > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          {Number(gorev.ilerleme) > 0 && <IlerlemeBar deger={gorev.ilerleme} genislik={56} />}
          {altSayi > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              font: '500 11px/14px var(--font-sans)', color: 'var(--text-tertiary)',
            }}>
              <ChevronDown size={11} strokeWidth={1.8} /> {altSayi} alt görev
            </span>
          )}
        </div>
      )}

      {gorev.aciklama && (
        <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', margin: '0 0 8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {gorev.aciklama}
        </p>
      )}

      {lokasyonAd && (
        <div style={{
          font: '500 11px/14px var(--font-sans)',
          color: 'var(--brand-primary)',
          margin: '0 0 8px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          maxWidth: '100%',
        }}>
          <MapPin size={11} strokeWidth={1.5} style={{ flexShrink: 0 }} />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={lokasyonAd}>
            {lokasyonAd}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-default)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Avatar name={atananKisi?.ad} size="xs" />
          <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {atananKisi?.ad}
          </span>
        </div>
        {(gorev.bitisTarih || gorev.sonTarih) && (
          <span
            title={gorev.baslamaTarih ? `Başlama: ${new Date(gorev.baslamaTarih).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}` : undefined}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              font: '400 12px/16px var(--font-sans)',
              color: gecikti ? 'var(--danger)' : 'var(--text-tertiary)',
              fontVariantNumeric: 'tabular-nums',
            }}>
            <Clock size={11} strokeWidth={1.5} />
            {gorev.bitisTarih
              ? new Date(gorev.bitisTarih).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
              : gorev.sonTarih}
          </span>
        )}
      </div>
    </div>
  )
}

function DroppableKolon({ kolon, gorevler, kullanicilar, lokasyonMap, altSayiMap, onGorevClick, onEdit, onSil, kartYetki }) {
  const { setNodeRef, isOver } = useDroppable({ id: kolon.id })

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', flex: '1 1 0',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-sunken)',
        border: `1px solid ${isOver ? kolon.renk : 'var(--border-default)'}`,
        padding: 12,
        // Yükseklik pano kapsayıcısından gelir; kartlar kolon İÇİNDE kayar
        // (sayfa scroll'u değil) — başlıklar hep görünür kalır.
        minHeight: 0,
        minWidth: 224, // 6 kolon geniş ekrana sığsın; dar ekranda yatay scroll devreye girer
        maxWidth: 380,
        transition: 'border-color 120ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: kolon.renk }} />
          <span style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{kolon.isim}</span>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 20, height: 20, padding: '0 6px',
          borderRadius: 'var(--radius-pill)',
          background: 'var(--surface-card)',
          border: '1px solid var(--border-default)',
          color: 'var(--text-secondary)',
          font: '600 11px/1 var(--font-sans)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {gorevler.length}
        </span>
      </div>

      <SortableContext items={gorevler.map(g => g.id.toString())} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} style={{ flex: 1, minHeight: 120, overflowY: 'auto', paddingRight: 4 }}>
          {gorevler.length === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              minHeight: 80,
              border: `1px dashed ${isOver ? kolon.renk : 'var(--border-default)'}`,
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-tertiary)',
              font: '400 12px/16px var(--font-sans)',
              padding: 16,
            }}>
              {isOver ? 'Bırakın' : 'Görev yok'}
            </div>
          )}
          {gorevler.map(gorev => (
            <GorevKarti
              key={gorev.id}
              gorev={gorev}
              kullanicilar={kullanicilar}
              altSayi={altSayiMap?.get(gorev.id) || 0}
              lokasyonAd={gorev.lokasyonId ? lokasyonMap?.get(gorev.lokasyonId)?.ad : null}
              onClick={() => onGorevClick(gorev.id)}
              onEdit={onEdit}
              onSil={onSil}
              yetki={kartYetki ? kartYetki(gorev) : undefined}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

function Gorevler() {
  const { talepOlusturGorevden } = useServisTalebi()
  const { kullanici, kullanicilar } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { bildirimEkle } = useBildirim()
  const { toast } = useToast()

  const [gorevler, setGorevler] = useState([])
  const [musteriler, setMusteriler] = useState([])
  const [musteriLokasyonlari, setMusteriLokasyonlari] = useState([]) // sadece form için (seçili müşteri)
  const [tumLokasyonlar, setTumLokasyonlar] = useState([]) // kart üzerinde lokasyon adı göstermek için lookup
  const [gorusmeler, setGorusmeler] = useState([])          // form "Bağlı görüşme" seçicisi (teklif ile aynı desen)
  const [lokasyonModalAcik, setLokasyonModalAcik] = useState(false)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [form, setFormHam] = useState(bosForm)
  // 22.08 geri çıkış koruması: kullanıcı etkileşimiyle değişen form 'dokunuldu';
  // formAc/duzenleAc ön doldurması setFormHam ile yazar ve bayrağı sıfırlar (yanlış pozitif yok).
  const [dokunuldu, setDokunuldu] = useState(false)
  const setForm = useCallback((u) => { setDokunuldu(true); setFormHam(u) }, [])
  const [goster, setGoster] = useState(false)
  const [duzenleId, setDuzenleId] = useState(null)
  const [aktifGorev, setAktifGorev] = useState(null)
  const [gorunumModu, setGorunumModu] = useState('liste')
  const [otomasyonAcik, setOtomasyonAcik] = useState(false)
  const [filtre, setFiltre] = useState('hepsi')
  const [kisiFiltre, setKisiFiltre] = useState('')      // tek kişi kontrolü (boş = herkes)
  const [gorevEkleri, setGorevEkleri] = useState([])    // formda seçilen YENİ ekler (File[], mig 184)
  const [mevcutEkler, setMevcutEkler] = useState([])    // düzenlemede görevde zaten ekli olanlar (meta[])
  const [kaydetMesgul, setKaydetMesgul] = useState(false)

  // Liste görünümü için sütun filtreleri + sayfalama
  const [kolonFiltre, setKolonFiltre] = useState(BOS_KOLON_FILTRE)
  // Sayfa no URL'de (?sayfa=N): detaydan geri dönünce liste aynı sayfada (06.08)
  const [sayfa, setSayfa] = useUrlSayfa()
  const SAYFA_BOYUT = 50

  // ─── v2 state (madde 30-35) ───────────────────────────────────────────────
  const [sekme, setSekme] = useState('bana')            // liste sekmeleri (madde 30)
  const [kategoriler, setKategoriler] = useState([])    // görev kategorileri (form + filtre)
  const [kategoriFiltre, setKategoriFiltre] = useState('')
  const [oncelikFiltre, setOncelikFiltre] = useState('')
  const [etiketFiltre, setEtiketFiltre] = useState('')
  // Kayıtlı filtreler (madde 31) — kişisel tercih, localStorage'da (lazy init)
  const filtreAnahtar = kullanici?.id != null ? `gorevFiltre:${kullanici.id}` : null
  const [kayitliFiltreler, setKayitliFiltreler] = useState(() => {
    if (!filtreAnahtar) return []
    try {
      const kayit = JSON.parse(localStorage.getItem(filtreAnahtar) || '[]')
      return Array.isArray(kayit) ? kayit : []
    } catch { return [] }
  })
  // Filtre paneli (kategori/öncelik/etiket + sütun filtreleri) katlanır: her
  // zaman açık dururken liste alanından ~90px yiyordu. Tercih kişiye özel.
  const [filtrePaneli, setFiltrePaneli] = useState(() => {
    try { return localStorage.getItem('gorevFiltrePaneli') === '1' } catch { return false }
  })
  const filtrePaneliDegistir = () => {
    setFiltrePaneli(a => {
      try { localStorage.setItem('gorevFiltrePaneli', a ? '0' : '1') } catch { /* dolu olabilir */ }
      return !a
    })
  }
  const [gelismisAcik, setGelismisAcik] = useState(false)      // form "Gelişmiş" bölümü
  const [detayYuklendi, setDetayYuklendi] = useState(true)     // düzenlemede tam kayıt indi mi
  const [sebepModal, setSebepModal] = useState(null)           // kanban sebep zorunlu geçiş
  const duzenleFetchRef = useRef(null)                          // bayat gorevGetir yanıtına kalkan

  // Kategoriler — form CustomSelect + liste filtresi için
  useEffect(() => {
    gorevKategorileriGetir().then(k => setKategoriler(k || [])).catch(() => {})
  }, [])


  const veriYukle = useCallback(({ ilkYukleme = false } = {}) => {
    // Liste yalnız GÖREV verisini bekler (63 kayıt, hızlı) — müşteri listesi
    // (1.885 kayıt, form lookup'ı) sayfayı BEKLETMESİN; arkada paralel iner.
    gorevleriGetir()
      .then(g => setGorevler(g || []))
      .catch(err => console.error('[Gorevler yükle]', err))
      .finally(() => { if (ilkYukleme) setYukleniyor(false) })
    musterileriGetir()
      .then(m => setMusteriler(m || []))
      .catch(() => {})
    gorusmeleriGetir()
      .then(g => setGorusmeler(g || []))
      .catch(() => {})
    import('../lib/supabase').then(({ supabase }) =>
      supabase.from('musteri_lokasyonlari').select('id, ad, musteri_id').then(({ data }) =>
        setTumLokasyonlar((data || []).map(r => ({ id: r.id, ad: r.ad, musteriId: r.musteri_id })))
      )
    ).catch(() => {})
  }, [])

  // İlk yükleme
  useEffect(() => { veriYukle({ ilkYukleme: true }) }, [veriYukle])

  // Realtime: telefondan (veya başka kullanıcıdan) görev eklenince/değişince
  // liste anında güncellensin (mig 175 — gorevler publication'da). Cache'i
  // temizleyip yeniden çek; kısa throttle ile art arda olayları tek çekime indir.
  useEffect(() => {
    let zaman = null
    const tazele = () => {
      if (zaman) return
      zaman = setTimeout(() => { zaman = null; invalidate('gorevler:list'); veriYukle() }, 600)
    }
    let kanal
    import('../lib/supabase').then(({ supabase }) => {
      kanal = supabase
        .channel('gorevler-canli')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'gorevler' }, tazele)
        .subscribe()
    })
    return () => { if (zaman) clearTimeout(zaman); if (kanal) kanal.unsubscribe() }
  }, [veriYukle])

  // GorevDetay'dan "Düzenle" tıklayınca state.duzenleGorevId ile gelir → form aç
  useEffect(() => {
    const hedefId = location.state?.duzenleGorevId
    if (!hedefId || gorevler.length === 0) return
    const g = gorevler.find(x => x.id === hedefId)
    if (g) {
      duzenleAc(g, { stopPropagation: () => {} })
      // state'i temizle — sayfaya geri dönünce form tekrar açılmasın
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [gorevler, location.state?.duzenleGorevId])

  // Sayfa odağa dönünce tazele — detayda görev "tamamlandı" olarak
  // işaretlenip geri dönüldüğünde kanban senkron kalsın
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') veriYukle()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', veriYukle)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', veriYukle)
    }
  }, [veriYukle])

  // Güvenlik ağı: realtime event'i kaçarsa (arka plan sekme, uyuyan soket,
  // WS reconnect penceresi) telefondan açılan görev dakikalarca görünmeyebiliyordu.
  // Sayfa GÖRÜNÜRken 30sn'de bir sessizce tazele — liste en fazla 30sn bayat kalır.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') { invalidate('gorevler:list'); veriYukle() }
    }, 30000)
    return () => clearInterval(id)
  }, [veriYukle])

  const lokasyonMap = new Map(tumLokasyonlar.map(l => [l.id, l]))

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const surukleBaslangic = useRef(null)

  const handleDragStart = (event) => {
    const gorev = gorevler.find(g => g.id.toString() === event.active.id)
    setAktifGorev(gorev || null)
    // ORIJINAL durumu sakla — handleDragOver state'i degistiriyor,
    // dragEnd'de orijinalle karsilastirmazsak DB'ye yazma atlaniyor
    surukleBaslangic.current = gorev?.durum || null
  }

  // Kart bazlı yetki: sürükleme = RLS update kuralıyla, silme = RLS delete
  // kuralıyla birebir (denetim bulgusu — UI aksiyonu RLS'in reddedeceği
  // işlemi hiç sunmasın)
  const kartYetkisi = (g) => {
    const uid = String(kullanici?.id ?? '')
    const admin = kullanici?.rol === 'admin'
    const benimki = String(g.atananId ?? g.atanan ?? '') === uid ||
      String(g.olusturanId ?? '') === uid ||
      g.olusturanAd === kullanici?.ad || g.olusturanAd === kullanici?.kullaniciAdi ||
      String(g.onaylayiciId ?? '') === uid ||
      (Array.isArray(g.ekip) && g.ekip.map(String).includes(uid))
    const olusturanBenim = String(g.olusturanId ?? '') === uid ||
      g.olusturanAd === kullanici?.ad || g.olusturanAd === kullanici?.kullaniciAdi
    return {
      suruklenebilir: admin || benimki,
      silinebilir: admin || (g.durum === 'taslak' && olusturanBenim),
    }
  }

  const handleDragEnd = async (event) => {
    const { active, over } = event
    setAktifGorev(null)
    const baslangicDurum = surukleBaslangic.current
    surukleBaslangic.current = null
    // Kolon dışına bırakıldıysa DragOver'ın iyimser değişikliğini geri al
    if (!over) {
      if (baslangicDurum) {
        setGorevler(prev => prev.map(g => g.id.toString() === String(active.id) ? { ...g, durum: baslangicDurum } : g))
      }
      return
    }
    const aktifId = active.id
    const hedefId = over.id
    const hedefKolon = kolonlar.find(k => k.id === hedefId)
    const hedefGorevKolonu = gorevler.find(g => g.id.toString() === hedefId)?.durum
    // Kart üzerine bırakıldıysa: o kartın DURUMUNU değil, KOLONUNUN ana durumunu al
    const yeniDurum = hedefKolon ? hedefKolon.id : kolonBul(hedefGorevKolonu)?.id
    if (!yeniDurum) return
    const mevcut = gorevler.find(g => g.id.toString() === aktifId)
    if (!mevcut) return
    // Aynı kolonda kaldıysa DB'ye yazma (taslak→Atandı kolonu gibi çok-durumlu
    // kolonlarda durum eşitliği değil KOLON eşitliği kontrol edilir)
    if (baslangicDurum && kolonBul(baslangicDurum)?.id === yeniDurum) return
    // Sürükleme, DragOver'ın iyimser yazdığı durumu geri alabilmeli
    const geriAl = () =>
      setGorevler(prev => prev.map(g => g.id.toString() === aktifId ? { ...g, durum: baslangicDurum } : g))
    // Tamamlanma kapıları (madde 13-14, 16) — detay ekranındaki kurallar kanban
    // sürüklemesiyle BAYPAS edilemez:
    if (yeniDurum === 'tamamlandi') {
      // 1) Alt görev kapısı — detayla AYNI kural seti (hepsi/zorunlular/serbest)
      const altlar = gorevler.filter(g => String(g.ustGorevId) === String(mevcut.id))
      const kontrol = anaGorevKapatKontrol(mevcut, altlar)
      if (kontrol.engel) { geriAl(); toast.error(kontrol.mesaj + ' Detay sayfasından yönetebilirsin.'); return }
      if (kontrol.gerekceli) {
        geriAl()
        toast.warning('Açık alt görevlerle kapatmak gerekçe ister — görevi detay sayfasından gerekçeyle tamamla.')
        return
      }
      // 2) Bağımlılık kapısı (madde 16)
      if (mevcut.bagimliGorevId && mevcut.bagimlilikTuru === 'once_tamamlanmali') {
        const bagimli = gorevler.find(g => String(g.id) === String(mevcut.bagimliGorevId))
        if (bagimli && bagimli.durum !== 'tamamlandi') {
          geriAl()
          toast.error(`Önce bağımlı görev tamamlanmalı: ${bagimli.gorevNo || ''} "${bagimli.baslik}"`)
          return
        }
      }
      // 2) Onay kapısı: onay gerekliyse ve onaylayıcı ben değilsem onaya gider
      const uidStr = String(kullanici?.id ?? '')
      const benOnaylayici = mevcut.onaylayiciId
        ? String(mevcut.onaylayiciId) === uidStr
        : (String(mevcut.olusturanId ?? '') === uidStr || mevcut.olusturanAd === kullanici?.ad)
      if (mevcut.onayGerekli && !benOnaylayici) {
        setGorevler(prev => prev.map(g => g.id.toString() === aktifId ? { ...g, durum: 'onay_bekliyor' } : g))
        const g = await dbGorevGuncelle(mevcut.id, { durum: 'onay_bekliyor', onayDurumu: 'bekliyor', ilerleme: 100 })
        if (!g) {
          setGorevler(prev => prev.map(x => x.id.toString() === aktifId ? { ...x, durum: baslangicDurum } : x))
          toast.error('Onaya gönderilemedi.')
          return
        }
        const onaylayiciHedef = mevcut.onaylayiciId ||
          kullanicilar?.find(k => String(k.id) === String(mevcut.olusturanId ?? '') || k.ad === mevcut.olusturanAd)?.id
        if (onaylayiciHedef && String(onaylayiciHedef) !== uidStr) {
          bildirimEkle(onaylayiciHedef, '⏳ Görev onayınızı bekliyor',
            `${kullanici?.ad}, "${mevcut.baslik}" görevini tamamladı — onayınız bekleniyor.`,
            'gorev', `/gorevler/${mevcut.id}`).catch(() => {})
        }
        toast.success('Görev tamamlandı olarak işaretlendi — onaya gönderildi.')
        return
      }
    }
    // Onay Bekliyor kolonuna elle sürükleme = onaya gönderme (onay_durumu da yazılır)
    if (yeniDurum === 'onay_bekliyor') {
      // Onay akışı tanımsız görev bu kolonda LİMBODA kalır — kimsenin
      // 'Onay Bekleyenler' sekmesine düşmez (denetim bulgusu): engelle.
      if (!mevcut.onayGerekli && !mevcut.onaylayiciId) {
        geriAl()
        toast.warning('Bu görevde onay akışı tanımlı değil — görevi detaydan tamamlayabilir ya da düzenleyip onaylayıcı ekleyebilirsin.')
        return
      }
      setGorevler(prev => prev.map(g => g.id.toString() === aktifId ? { ...g, durum: 'onay_bekliyor' } : g))
      const g = await dbGorevGuncelle(mevcut.id, { durum: 'onay_bekliyor', onayDurumu: 'bekliyor', ilerleme: 100 })
      if (!g) {
        setGorevler(prev => prev.map(x => x.id.toString() === aktifId ? { ...x, durum: baslangicDurum } : x))
        toast.error('Onaya gönderilemedi.')
        return
      }
      const uid2 = String(kullanici?.id ?? '')
      const onayHedef = mevcut.onaylayiciId ||
        kullanicilar?.find(k => String(k.id) === String(mevcut.olusturanId ?? '') || k.ad === mevcut.olusturanAd)?.id
      if (onayHedef && String(onayHedef) !== uid2) {
        bildirimEkle(onayHedef, '⏳ Görev onayınızı bekliyor',
          `${kullanici?.ad}, "${mevcut.baslik}" görevini onaya gönderdi.`,
          'gorev', `/gorevler/${mevcut.id}`).catch(() => {})
      }
      return
    }
    setGorevler(prev => prev.map(g => g.id.toString() === aktifId ? { ...g, durum: yeniDurum } : g))
    // Sebep zorunlu durumlar (madde 10): sebep alınmadan yazma — modal açılır,
    // vazgeçilirse sebepVazgec rollback yapar.
    if (SEBEP_ZORUNLU_DURUMLAR.includes(yeniDurum)) {
      setSebepModal({
        gorevId: mevcut.id, gorevBaslik: mevcut.baslik, atanan: mevcut.atanan,
        eskiDurum: baslangicDurum || mevcut.durum, yeniDurum,
      })
      return
    }
    try {
      const sonuc = await dbGorevGuncelle(mevcut.id, { durum: yeniDurum })
      if (!sonuc) throw new Error('DB null donerdü')
      // Durum bildirimi mig 212 DB trigger'ında (atanan + ekip + oluşturan)
    } catch (err) {
      console.error('[handleDragEnd] DB guncelleme fail:', err)
      // Rollback — UI'yi baslangic durumuna geri al
      setGorevler(prev => prev.map(g => g.id.toString() === aktifId ? { ...g, durum: baslangicDurum } : g))
      toast.error('Görev güncellenemedi: ' + (err?.message || 'bilinmeyen hata'))
    }
  }

  const handleDragOver = (event) => {
    const { active, over } = event
    if (!over) return
    const aktifId = active.id
    const hedefId = over.id
    const hedefKolon = kolonlar.find(k => k.id === hedefId)
    const hedefGorevKolonu = gorevler.find(g => g.id.toString() === hedefId)?.durum
    const yeniDurum = hedefKolon ? hedefKolon.id : kolonBul(hedefGorevKolonu)?.id
    if (!yeniDurum) return
    const mevcut = gorevler.find(g => g.id.toString() === aktifId)
    if (!mevcut || kolonBul(mevcut.durum)?.id === yeniDurum) return
    setGorevler(prev => prev.map(g => g.id.toString() === aktifId ? { ...g, durum: yeniDurum } : g))
  }

  // Sebep modalı onay/vazgeç (kanban sürüklemesi — SEBEP_ZORUNLU_DURUMLAR)
  const sebepOnayla = async (sebep) => {
    const m = sebepModal
    if (!m) return
    setSebepModal(null)
    try {
      const sonuc = await dbGorevGuncelle(m.gorevId, { durum: m.yeniDurum, durumSebebi: sebep })
      if (!sonuc) throw new Error('DB null döndü')
      // Durum bildirimi mig 212 DB trigger'ında (sebep dahil; atanan + ekip + oluşturan)
    } catch (err) {
      console.error('[sebepOnayla] DB guncelleme fail:', err)
      setGorevler(prev => prev.map(g => g.id === m.gorevId ? { ...g, durum: m.eskiDurum } : g))
      toast.error('Görev güncellenemedi: ' + (err?.message || 'bilinmeyen hata'))
    }
  }

  const sebepVazgec = () => {
    const m = sebepModal
    if (m) setGorevler(prev => prev.map(g => g.id === m.gorevId ? { ...g, durum: m.eskiDurum } : g))
    setSebepModal(null)
  }

  const formAc = () => {
    setFormHam(bosForm); setDokunuldu(false); setDuzenleId(null); setDetayYuklendi(true); setGelismisAcik(false); setGoster(true)
  }

  // Panel'den ?yeni=1 ile gelinirse formu direkt aç
  useEffect(() => {
    if (searchParams.get('yeni') === '1') {
      formAc()
      const kopya = new URLSearchParams(searchParams)
      kopya.delete('yeni')
      setSearchParams(kopya, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const kirli = goster && (dokunuldu || gorevEkleri.length > 0)
  useKaydedilmemisKoruma(kirli)   // sidebar/palet/bildirim geçişi kirli formda sorar

  const kaydet = async () => {
    if (!form.baslik || !form.atanan || !form.bitisTarih) {
      toast.error('Başlık, atanacak kişi ve bitiş tarihi zorunludur.'); return
    }
    // Kaydetmeden önce sonTarih'i bitisTarih'in tarih kısmından türet (geriye uyum)
    form.sonTarih = dtToTarih(form.bitisTarih)
    // Ekip = ek atananlar (birincil hariç, unique)
    const ekipIds = Array.from(new Set((form.ekip || []).map(String).filter(x => x && x !== String(form.atanan)).map(Number)))
    // v2 alanları dahil temiz DB payload'u (UI-only alanlar atılır, tipler düzelir)
    const payload = formdanPayload(
      { ...form, sonTarih: dtToTarih(form.bitisTarih), ekip: ekipIds },
      { detayYuklendi },
    )
    // Ekip üyelerine YALNIZ uygulama içi bildirim — SMS YOK.
    // (Ali'nin destek talebi 2026-07-24: Abdullah her görevine Ali'yi ekip yapınca
    // Ali'ye görev başına SMS yağıyordu. Kural: SMS SADECE atanana gider.)
    const ekipeBildir = async (gorevId, oncelik) => {
      for (const uid of ekipIds) {
        bildirimEkle(String(uid), 'Yeni Görev — Ekip', `"${form.baslik}" görevine ekip üyesi olarak eklendiniz. Öncelik: ${oncelik?.isim || form.oncelik}. Son tarih: ${form.sonTarih}`, 'gorev', '/gorevler')
      }
    }

    if (duzenleId) {
      const eski = gorevler.find(g => g.id === duzenleId)
      // Düzenlemede eklenen yeni dosyalar — MEVCUTLARIN ÜSTÜNE eklenir.
      // payload.dosyalar sadece yeni ek varsa yazılır; yoksa alan hiç gönderilmez
      // ki mevcut liste yanlışlıkla boşalmasın.
      if (gorevEkleri.length) {
        setKaydetMesgul(true)
        try {
          // Mevcut listeyi KAYDETME ANINDA tazele: form açıkken başkası ek
          // eklemiş olabilir ve bayat listeyle yazmak onun eklerini silerdi.
          const taze = await gorevGetir(duzenleId).catch(() => null)
          const oncekiler = Array.isArray(taze?.dosyalar) ? taze.dosyalar : mevcutEkler
          const yuklenen = await ekleriYukle('gorev-dosyalar', gorevEkleri)
          payload.dosyalar = [...oncekiler, ...yuklenen]
        } catch (e) {
          toast.error('Dosya yüklenemedi: ' + (e?.message || 'hata'))
          setKaydetMesgul(false)
          return
        }
        setKaydetMesgul(false)
      }
      // Atanan DEĞİŞTİYSE kabul akışı sıfırlanır — yeni sorumlu kabul barını
      // görmeli (gorevDevret ile aynı reset; denetim bulgusu 2026-07-19)
      if (eski && String(eski.atananId ?? eski.atanan ?? '') !== String(form.atanan)) {
        payload.kabulDurumu = 'atandi'
        payload.redSebebi = null
      }
      const guncel = await dbGorevGuncelle(duzenleId, payload)
      if (!guncel) {
        toast.error('Görev güncellenemedi — lütfen tekrar deneyin.')
        return
      }
      setGorevler(prev => prev.map(g => g.id === duzenleId ? { ...g, ...guncel } : g))
      toast.success('Görev güncellendi.')
      if (eski?.atanan !== form.atanan) {
        bildirimEkle(form.atanan, 'Görev Güncellendi', `"${form.baslik}" görevi size yeniden atandı.`, 'bilgi', '/gorevler')
        // Yeni atanana SMS — kendine atadıysa GÖNDERME (bildirimle aynı kural)
        if (String(form.atanan) !== String(kullanici?.id)) {
          gorevAtamaSMSGonderVeIsaretle({
            gorevId: duzenleId, atananId: form.atanan,
            gorevBaslik: form.baslik, sonTarih: form.bitisTarih ? new Date(form.bitisTarih).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : form.sonTarih, oncelik: form.oncelik,
          }).catch(() => {})
        }
      }
      // Ekipte yeni gelen üyelere bildir (eski ekipte olmayanlar)
      const eskiEkipSet = new Set((eski?.ekip || []).map(String))
      const yeniEklenenler = ekipIds.filter(uid => !eskiEkipSet.has(String(uid)))
      if (yeniEklenenler.length) {
        const yeniEkipIds = yeniEklenenler
        await Promise.resolve()
        // Yeni eklenen ekip üyelerine bildir
        const oncelik = oncelikBilgi(form.oncelik)
        const sonTarihStr = form.bitisTarih
          ? new Date(form.bitisTarih).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
          : form.sonTarih
        // Ekip üyesine SMS YOK — yalnız uygulama içi bildirim (SMS sadece atanana)
        for (const uid of yeniEkipIds) {
          bildirimEkle(String(uid), 'Görev Ekibine Eklendiniz', `"${form.baslik}" görevine ekip üyesi olarak eklendiniz.`, 'gorev', '/gorevler')
        }
      }
    } else {
      // Görev ekleri (mig 184) — önce yükle, meta listesini kayda göm
      let gorevDosyalari = []
      if (gorevEkleri.length) {
        setKaydetMesgul(true)
        try {
          gorevDosyalari = await ekleriYukle('gorev-dosyalar', gorevEkleri)
        } catch (e) {
          toast.error('Dosya yüklenemedi: ' + (e?.message || 'hata'))
          setKaydetMesgul(false)
          return
        }
        setKaydetMesgul(false)
      }
      const yeniGorev = { ...payload, dosyalar: gorevDosyalari, ekip: ekipIds, durum: payload.durum || 'bekliyor', olusturanAd: kullanici.ad, olusturmaTarih: new Date().toISOString() }
      const eklenen = await gorevEkle(yeniGorev)
      if (eklenen) {
        setGorevler(prev => [eklenen, ...prev])
        toast.success('Görev eklendi.')
        const oncelik = oncelikBilgi(form.oncelik)
        bildirimEkle(form.atanan, 'Yeni Görev Atandı', `"${form.baslik}" görevi size atandı. Öncelik: ${oncelik?.isim}. Son tarih: ${form.sonTarih}`, 'gorev', '/gorevler')
        // SMS gönder — YALNIZ atanana; kendine görev açana SMS gitmez
        if (String(form.atanan) !== String(kullanici?.id)) {
          gorevAtamaSMSGonderVeIsaretle({
            gorevId: eklenen.id, atananId: form.atanan,
            gorevBaslik: form.baslik, sonTarih: form.bitisTarih ? new Date(form.bitisTarih).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : form.sonTarih, oncelik: oncelik?.isim,
          }).catch(() => {})
        }
        // Ekip üyelerine de bildirim + SMS
        ekipeBildir(eklenen.id, oncelik).catch(() => {})

        // Servis talebi de istendiyse oluştur ve oraya yönlendir
        if (form.servisTalebiOlustur && form.musteriId) {
          try {
            const atananKisi = kullanicilar?.find(k => k.id?.toString() === form.atanan)
            const servisTalebi = await talepOlusturGorevden(eklenen, kullanici, atananKisi)
            if (servisTalebi) {
              toast.success('Servis talebi de oluşturuldu.')
              navigate(`/servis-talepleri/${servisTalebi.id}`)
              return
            }
          } catch (err) {
            console.error('[Servis talebi]', err)
            toast.error('Servis talebi oluşturulamadı: ' + (err?.message || 'bilinmeyen'))
          }
        }
      } else { toast.error('Görev kaydedilemedi.'); return }
    }
    setForm(bosForm); setDuzenleId(null); setGoster(false); setGorevEkleri([]); setMevcutEkler([]); setDetayYuklendi(true); setGelismisAcik(false)
  }

  const iptal = () => {
    setForm(bosForm); setDuzenleId(null); setGoster(false); setGorevEkleri([]); setMevcutEkler([]); setDetayYuklendi(true); setGelismisAcik(false)
    // Garantiye al: detay sayfasından gelinmişse de listeye dön
    if (location.pathname !== '/gorevler') navigate('/gorevler', { replace: true })
  }

  const gorevSil = async (id, e) => {
    e.stopPropagation()
    if (!window.confirm('Bu görevi silmek istediğine emin misin? Geri alınamaz.')) return
    try {
      await dbGorevSil(id)
      setGorevler(prev => prev.filter(g => g.id !== id))
      toast.success('Görev silindi.')
    } catch (err) {
      toast.error('Görev silinemedi: ' + (err?.message ?? 'bilinmeyen hata'))
    }
  }

  const duzenleAc = (g, e) => {
    e.stopPropagation()
    // timestamptz → 'YYYY-MM-DDTHH:mm' (datetime-local formatı)
    const dtLocal = (ts) => {
      if (!ts) return ''
      const d = new Date(ts)
      if (isNaN(d.getTime())) return ''
      const pad = n => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    setDokunuldu(false)
    setFormHam({
      baslik: g.baslik, aciklama: g.aciklama || '', atanan: g.atanan, oncelik: g.oncelik,
      durum: g.durum || 'bekliyor',
      sonTarih: g.sonTarih,
      baslamaTarih: dtLocal(g.baslamaTarih),
      // bitisTarih önceliği: yeni bitis_tarih varsa onu, yoksa legacy son_tarih'i 23:59'a taşı
      bitisTarih: g.bitisTarih ? dtLocal(g.bitisTarih) : (g.sonTarih ? `${g.sonTarih}T23:59` : ''),
      musteriId: g.musteriId || '', musteriAdi: g.musteriAdi || '', firmaAdi: g.firmaAdi || '',
      lokasyonId: g.lokasyonId || '', gorusmeId: g.gorusmeId != null ? String(g.gorusmeId) : '',
      ekip: Array.isArray(g.ekip) ? g.ekip : [],
      // v2 alanları (liste kolonlarından gelenler)
      kategoriId: g.kategoriId != null ? String(g.kategoriId) : '',
      gizlilik: g.gizlilik || 'standart',
      gozlemciler: Array.isArray(g.gozlemciler) ? g.gozlemciler : [],
      onayGerekli: !!g.onayGerekli,
      onaylayiciId: g.onaylayiciId != null ? String(g.onaylayiciId) : '',
      atamaTuru: g.atamaTuru || 'tek',
      etiketlerMetin: Array.isArray(g.etiketler) ? g.etiketler.join(', ') : '',
      tamamlamaKurali: g.tamamlamaKurali || 'zorunlular',
      // beklenenCikti + hatirlatmalar liste kolonlarında YOK — tam kayıt inince dolar
      beklenenCikti: '',
      hatirlatmaSecim: { gun3: false, gun1: false, gecikme: false },
    })
    // Tam kaydı çek (beklenenCikti + hatirlatmalar) — inene kadar bu iki alan
    // update payload'undan çıkarılır ki mevcut değerler yanlışlıkla silinmesin.
    setDetayYuklendi(false)
    // Yeni ek seçimi her düzenlemede sıfırdan başlar; mevcut ekler ayrı tutulur
    setGorevEkleri([])
    setMevcutEkler(Array.isArray(g.dosyalar) ? g.dosyalar : [])
    duzenleFetchRef.current = g.id
    gorevGetir(g.id).then(tam => {
      if (duzenleFetchRef.current !== g.id || !tam) return
      setFormHam(f => ({
        ...f,
        beklenenCikti: tam.beklenenCikti || '',
        hatirlatmaSecim: hatirlatmalardanSecim(tam.hatirlatmalar),
      }))
      // Liste sorgusu dosyalar kolonunu taşımayabilir — tam kayıt kesin taşır
      setMevcutEkler(Array.isArray(tam.dosyalar) ? tam.dosyalar : [])
      setDetayYuklendi(true)
    }).catch(() => {})
    // Lokasyonları çek (varsa dropdown göstereceğiz)
    if (g.musteriId) {
      musteriLokasyonlariniGetir(g.musteriId).then(setMusteriLokasyonlari).catch(() => setMusteriLokasyonlari([]))
    } else {
      setMusteriLokasyonlari([])
    }
    setDuzenleId(g.id); setGoster(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ─── Filtre çekirdeği (src/lib/gorevFiltre.js) ────────────────────────────
  // ⭐ Rozet, KPI ve tablo AYNI fonksiyondan (sekmeKumesi) geçer. Ayrı ayrı
  // sayıldıkları sürümde "rozet 37 · liste 0" gibi matematiksel boş kümeler
  // oluşuyordu (10.08 denetimi). Kural: yeni bir sayı gösterecekseniz onu da
  // sekmeKumesi'nden türetin, elle filtrelemeyin.
  const ctx = { ...sekmeBaglami(kullanici), kisiFiltre }

  // Görünürlük: HERKES tüm görevleri görür (mig 174 — RLS SELECT is_staff()).
  // TEK istisna: taslak görevler yalnız oluşturana görünür (madde 30/8).
  const gorunurGorevler = gorevler.filter(g => gorunurMu(g, ctx))

  // Alt görev sayısı + görev lookup (rozet ve üst görev no gösterimi için)
  const gorevMap = new Map(gorunurGorevler.map(g => [g.id, g]))
  const altSayiMap = new Map()
  for (const g of gorunurGorevler) {
    if (g.ustGorevId) altSayiMap.set(g.ustGorevId, (altSayiMap.get(g.ustGorevId) || 0) + 1)
  }

  // Sekme rozetleri — kapsam DAHİL
  const sekmeSayilari = {}
  for (const s of SEKME_LISTESI) {
    sekmeSayilari[s.id] = sekmeKumesi(gorunurGorevler, s.id, ctx).length
  }

  // Kanban kapsam filtresi (panoda sekme kavramı yok — yalnız kapsam uygulanır)
  const filtreliGorevler = gorunurGorevler.filter(g => kapsamEsle(g, ctx))

  // Aktif sekmenin kümesi — tablonun tabanı (rozetle aynı kaynak)
  const sekmeliGorevler = sekmeKumesi(gorunurGorevler, sekme, ctx)

  // Seçili kişinin adı — başlıkta ve boş liste açıklamasında kullanılır
  const kisiAdi = kisiFiltre
    ? (String(kullanici?.id ?? '') === kisiFiltre ? kullanici?.ad : kullanicilar.find(k => k.id?.toString() === kisiFiltre)?.ad) || ''
    : ''

  // Sekme rozetlerindeki uyarı rengi (KPI şeridinin yerini alır): sayı sıfırdan
  // büyükse ilgili sekme renkli yanar, göz doğrudan oraya gider.
  const SEKME_VURGU = { geciken: 'var(--danger)', onay: '#06b6d4', bugun: 'var(--warning)' }

  // Kayıtlı filtre işlemleri (madde 31)
  const filtreKaydetTikla = () => {
    if (!filtreAnahtar) return
    const ad = window.prompt('Filtre adı:')
    if (!ad || !ad.trim()) return
    const yeni = [
      ...kayitliFiltreler.filter(f => f.ad !== ad.trim()),
      { ad: ad.trim(), sekme, filtre, kategoriFiltre, oncelikFiltre, etiketFiltre, arama: kolonFiltre.gorev },
    ]
    setKayitliFiltreler(yeni)
    try { localStorage.setItem(filtreAnahtar, JSON.stringify(yeni)) } catch { /* dolu olabilir */ }
    toast.success('Filtre kaydedildi.')
  }

  const filtreUygula = (f) => {
    setSekme(f.sekme || 'bana')
    setFiltre(f.filtre || 'hepsi')
    setKategoriFiltre(f.kategoriFiltre || '')
    setOncelikFiltre(f.oncelikFiltre || '')
    setEtiketFiltre(f.etiketFiltre || '')
    // ⚠️ Sütun filtrelerinin TAMAMI sıfırlanır: yalnız 'gorev' yazıldığı
    // sürümde ekranda kalan diğer 7 alan kayıtlı filtreye sessizce ekleniyor,
    // "kaydettiğim filtre başka sonuç veriyor" hissi doğuyordu.
    setKolonFiltre({ ...BOS_KOLON_FILTRE, gorev: f.arama || '' })
    setSayfa(1)
  }

  const kayitliFiltreSil = (ad) => {
    if (!filtreAnahtar) return
    const yeni = kayitliFiltreler.filter(f => f.ad !== ad)
    setKayitliFiltreler(yeni)
    try { localStorage.setItem(filtreAnahtar, JSON.stringify(yeni)) } catch { /* yoksay */ }
  }

  // ─── Tablo hesap zinciri ──────────────────────────────────────────────────
  // Gövdede hesaplanır: başlıktaki sayaç, tablo ve alttaki "toplam N kayıt"
  // tek bir kümeden okur (eskiden başlık kapsamı, footer süzülmüşü sayıyor,
  // ikisi aynı ekranda farklı rakam gösteriyordu).
  const listeSuzulmus = sekmeliGorevler
    .filter(g => durumEsle(g, filtre))
    .filter(g => {
      // Ek filtreler (madde 31): kategori, öncelik, etiket
      if (kategoriFiltre && String(g.kategoriId ?? '') !== kategoriFiltre) return false
      if (oncelikFiltre) {
        const esdeger = oncelikFiltre === 'normal' ? ['normal', 'orta'] : [oncelikFiltre]
        if (!esdeger.includes(g.oncelik)) return false
      }
      if (etiketFiltre) {
        const q = etiketFiltre.toLocaleLowerCase('tr')
        if (!Array.isArray(g.etiketler) || !g.etiketler.some(t => String(t).toLocaleLowerCase('tr').includes(q))) return false
      }
      return true
    })
    .filter(g => {
      const atananKisi = kullanicilar.find(k => k.id?.toString() === g.atanan)
      const oncAd = oncelikBilgi(g.oncelik).isim
      const basTar = g.olusturmaTarih ? String(g.olusturmaTarih).slice(0, 10) : ''
      return (
        inSearch(g.gorevNo, kolonFiltre.no) &&
        (!kolonFiltre.takip ||
          (kolonFiltre.takip === 'suresi_gecti' ? gorevGecikti(g) : durumBilgi(g.durum).id === kolonFiltre.takip)) &&
        inSearch(g.olusturanAd, kolonFiltre.veren) &&
        inSearch(atananKisi?.ad, kolonFiltre.alan) &&
        (inSearch(g.baslik, kolonFiltre.gorev) || inSearch(g.aciklama, kolonFiltre.gorev)) &&
        inDateEq(basTar, kolonFiltre.basTar) &&
        inDateEq(bitisGorunen(g), kolonFiltre.bitTar) &&
        inSearch(oncAd, kolonFiltre.kontrol)
      )
    })

  // Sıralama çekirdekte (listeSirala): AÇIK işler üstte, her grup kendi içinde
  // en yeni önce. Salt tarih sıralaması devam eden işi tamamlananların arasına
  // düşürüyordu (18.08 geri bildirimi).
  // Alt görevleri üstlerinin hemen altına grupla (madde 32) — sıralamadan SONRA.
  const tabloRow = hiyerarsikSirala(listeSirala(listeSuzulmus))
  const toplam = tabloRow.length
  const toplamSayfa = Math.max(1, Math.ceil(toplam / SAYFA_BOYUT))
  const guvSayfa = Math.min(sayfa, toplamSayfa)
  const dilim = tabloRow.slice((guvSayfa - 1) * SAYFA_BOYUT, guvSayfa * SAYFA_BOYUT)

  // İkincil durum filtresi (sekme İÇİNDE) — satırda görünen HER durum şeritte
  // de seçilebilir; 'Açık'/'Kapalı' hızlı grup olarak durur. Eşleşme kuralı
  // gorevFiltre.CHIP_DURUMLARI'nda; burası yalnız sunum (ikon/renk/isim).
  // ⚠️ Taslak artık 'Atandı'nın içinde DEĞİL (atanmamış taslak "Atandı"
  // başlığında görünüyor, chip toplamları "Tümü"yü tutmuyordu); kendi chip'i
  // yalnızca kullanıcının görebildiği bir taslak varsa çıkar.
  const taslakVar = gorunurGorevler.some(g => g.durum === 'taslak')
  // Sunum: 12 ayrı lucide ikonu yerine tabloyla AYNI dil (renk noktası) —
  // hem daha sade hem şerit daha dar (10.08 sadeleştirme).
  const durumChipler = [
    { id: 'hepsi',     isim: 'Tümü' },
    { id: 'acik',      isim: 'Açık',            renk: 'var(--info)' },
    { id: 'kapali',    isim: 'Kapalı',          renk: 'var(--text-muted)' },
    ...(taslakVar ? [{ id: 'taslak', isim: 'Taslak', renk: 'var(--text-muted)' }] : []),
    { id: 'atandi',    isim: 'Atandı',          renk: 'var(--info)' },
    { id: 'devam',     isim: 'Devam Ediyor',    renk: 'var(--warning)' },
    { id: 'beklemede', isim: 'Beklemede',       renk: '#f97316' },
    { id: 'bilgi',     isim: 'Bilgi Bekleniyor',renk: '#a855f7' },
    { id: 'onay',      isim: 'Onay Bekliyor',   renk: '#06b6d4' },
    { id: 'tamam',     isim: 'Tamamlandı',      renk: 'var(--success)' },
    { id: 'iptal',     isim: 'İptal / Red',     renk: 'var(--text-muted)' },
    { id: 'gecmis',    isim: 'Geçmiş',          renk: 'var(--danger)' },
  ]

  // Panel kapalıyken bile kaç filtrenin daralttığı düğmede rozetle görünür
  const ekFiltreSayisi = [kategoriFiltre, oncelikFiltre, etiketFiltre]
    .filter(Boolean).length + Object.values(kolonFiltre).filter(Boolean).length

  // ⚠️ Durum chip'i de "aktif filtre" sayılır: tek başına seçiliyken temizle
  // düğmesi hiç görünmüyordu, kullanıcı daralmayı geri alamıyordu.
  const chipAktif = !!filtre && filtre !== 'hepsi'
  const chipAdi = durumChipler.find(c => c.id === filtre)?.isim || filtre
  // Kişi seçimi de daraltan bir filtredir — temizleme onu da kapsar, yoksa
  // "liste neden boş" sorusunun cevabı ekranın başka bir köşesinde kalıyor.
  const filtreVar = Object.values(kolonFiltre).some(Boolean)
    || !!kategoriFiltre || !!oncelikFiltre || !!etiketFiltre || chipAktif || !!kisiFiltre

  const filtreleriTemizle = () => {
    setKolonFiltre(BOS_KOLON_FILTRE)
    setKategoriFiltre(''); setOncelikFiltre(''); setEtiketFiltre('')
    setFiltre('hepsi')
    setKisiFiltre('')
    setSayfa(1)
  }

  if (yukleniyor) return <SkeletonList />

  // TEK EKRAN (06.08): liste modunda sayfa scroll'u YOK — üst bloklar sabit,
  // yalnız tablo kayar. Form/kanban modunda normal akış sürer.
  const tekEkran = gorunumModu === 'liste' && !goster
  return (
    <div style={{
      padding: 16, maxWidth: 1440, margin: '0 auto',
      ...(tekEkran ? {
        maxWidth: 'none',
        height: 'calc(100vh - 56px)', boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      } : {}),
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          {/* Başlık sayacı listedeki NİHAİ sayıyı gösterir — alttaki "toplam N
              kayıt" ile aynı kümedir (eskiden ikisi farklı rakam veriyordu). */}
          <p className="t-caption" style={{ marginTop: 4 }}>
            {gorunumModu === 'liste' && !goster ? (
              <>
                <span className="tabular-nums">{toplam}</span> görev
                {' — '}{SEKME_LISTESI.find(s => s.id === sekme)?.isim}
                {kisiAdi && ` · ${kisiAdi}`}
              </>
            ) : (
              <>
                <span className="tabular-nums">{filtreliGorevler.length}</span> görev
                {kisiAdi && ` — ${kisiAdi}`}
              </>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* ⚠️ "Tümü | Görevlerim" anahtarı KALDIRILDI (10.08 geri bildirimi:
              "yukarıdakilere tıklayamıyorum, normal mi?"). O anahtar sekmelerin
              kopyasıydı — "Görevlerim" = Bana Atananlar sekmesi, "Tümü" = Tümü
              sekmesi — ve kişisel sekmelerle çakışmasın diye kilitleniyordu.
              Varsayılan sekme de kişisel olduğu için sayfa HER açılışta gri
              geliyordu: kilitli bir düğme kullanıcıya "bozuk" görünür.
              Geriye TEK kişi kontrolü kaldı; her sekmede çalışır, varsayılanı
              boş olduğu için hiçbir listeyi sessizce daraltmaz. */}
          <div style={{ minWidth: 180 }}>
            <CustomSelect value={kisiFiltre} onChange={e => { setKisiFiltre(e.target.value); setSayfa(1) }}>
              <option value="">Tüm kişiler</option>
              {kullanici?.id != null && <option value={String(kullanici.id)}>{kullanici.ad} (ben)</option>}
              {kullanicilar
                .filter(k => String(k.id) !== String(kullanici?.id ?? ''))
                .map(k => <option key={k.id} value={k.id?.toString()}>{k.ad}</option>)}
            </CustomSelect>
          </div>
          <div style={{ display: 'inline-flex', padding: 2, background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)' }}>
            <button
              onClick={() => setGorunumModu('kanban')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px',
                borderRadius: 'calc(var(--radius-sm) - 2px)',
                background: gorunumModu === 'kanban' ? 'var(--surface-card)' : 'transparent',
                boxShadow: gorunumModu === 'kanban' ? 'var(--shadow-sm)' : 'none',
                color: gorunumModu === 'kanban' ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: 'none', cursor: 'pointer',
                font: '500 13px/18px var(--font-sans)',
              }}
            >
              <LayoutGrid size={14} strokeWidth={1.5} /> Kanban
            </button>
            <button
              onClick={() => setGorunumModu('liste')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px',
                borderRadius: 'calc(var(--radius-sm) - 2px)',
                background: gorunumModu === 'liste' ? 'var(--surface-card)' : 'transparent',
                boxShadow: gorunumModu === 'liste' ? 'var(--shadow-sm)' : 'none',
                color: gorunumModu === 'liste' ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: 'none', cursor: 'pointer',
                font: '500 13px/18px var(--font-sans)',
              }}
            >
              <List size={14} strokeWidth={1.5} /> Liste
            </button>
          </div>
          <Button variant="secondary" iconLeft={<Repeat size={14} strokeWidth={1.5} />} onClick={() => setOtomasyonAcik(true)}>
            Otomasyon
          </Button>
          <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={formAc}>
            Yeni görev
          </Button>
        </div>
      </div>

      {/* Şablonlar + tekrarlayan görevler + vekâlet (madde 28, 29, 39) */}
      {otomasyonAcik && (
        <GorevOtomasyonModal
          kullanici={kullanici}
          kullanicilar={kullanicilar}
          onKapat={() => setOtomasyonAcik(false)}
          onGorevOlustu={() => { invalidate('gorevler:list'); veriYukle() }}
        />
      )}

      {/* KPI şeridi KALDIRILDI (10.08 sadeleştirme): dört karttan üçü
          ("Bugün Bitecek", "Geciken", "Onayımı Bekleyen") hemen altındaki sekme
          rozetinin BİREBİR kopyasıydı — aynı sayıyı iki kez göstermek liste
          alanından ~70px yiyordu. Uyarı işlevi sekme rozetlerine taşındı:
          dolu olduğunda "Gecikenler" kırmızı, "Onay Bekleyenler" camgöbeği
          yanar (SEKME_VURGU). */}

      {/* Form */}
      {goster && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <button
              onClick={iptal}
              title="Görev listesine dön"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px',
                background: 'transparent',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                font: '500 13px/18px var(--font-sans)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-sunken)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              <ChevronLeft size={14} strokeWidth={1.5} /> Görev listesi
            </button>
            <h2 className="t-h2" style={{ margin: 0 }}>{duzenleId ? 'Görevi Düzenle' : 'Yeni Görev'}</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
            <div>
              <Label required>Başlık</Label>
              <Input value={form.baslik} onChange={e => setForm({ ...form, baslik: e.target.value })} placeholder="Görev başlığı" />
            </div>
            <div>
              <Label required>Atanacak kişi (birincil)</Label>
              <CustomSelect value={form.atanan} onChange={e => setForm({ ...form, atanan: e.target.value })}>
                <option value="">Kişi seç…</option>
                {kullanicilar.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
              </CustomSelect>
              {/* İş yükü göstergesi (madde 35) */}
              {form.atanan && (
                <IsYukuPaneli
                  liste={gorevler.filter(g => g && g.id !== duzenleId)}
                  kullaniciId={form.atanan}
                  ad={kullanicilar.find(k => String(k.id) === String(form.atanan))?.ad}
                />
              )}
            </div>
            <div>
              <Label>Ekip (ek kişiler, opsiyonel)</Label>
              <CokluSelect
                degerler={(form.ekip || []).map(Number)}
                onChange={arr => setForm({ ...form, ekip: arr.filter(x => String(x) !== String(form.atanan)).map(Number) })}
                secenekler={kullanicilar
                  .filter(k => String(k.id) !== String(form.atanan))
                  .map(k => ({ id: Number(k.id), ad: k.ad }))}
                placeholder="Ekip üyesi seç…"
              />
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Ekip üyeleri de bildirim ve SMS alır. Görev listelerinde görev onlara da görünür.
              </div>
            </div>
            <div>
              <Label>İlgili müşteri</Label>
              <CustomSelect
                value={form.musteriId}
                onChange={e => {
                  const m = musteriler.find(x => x.id?.toString() === e.target.value)
                  setForm({
                    ...form,
                    musteriId: e.target.value,
                    musteriAdi: m ? `${m.ad} ${m.soyad}` : '',
                    firmaAdi: m ? m.firma : '',
                    lokasyonId: '',
                    gorusmeId: '',   // görüşme listesi müşteriye bağlı — sıfırla
                  })
                  // Müşteri değişince lokasyonları yenile
                  if (m?.id) {
                    musteriLokasyonlariniGetir(m.id).then(setMusteriLokasyonlari).catch(() => setMusteriLokasyonlari([]))
                  } else {
                    setMusteriLokasyonlari([])
                  }
                }}
              >
                <option value="">Müşteri seç (opsiyonel)…</option>
                {musteriler.map(m => <option key={m.id} value={m.id}>{m.ad} {m.soyad} — {m.firma}</option>)}
              </CustomSelect>
              {form.firmaAdi && (
                <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Building2 size={12} strokeWidth={1.5} /> {form.firmaAdi}
                </p>
              )}
            </div>

            {/* Bağlı görüşme — teklif formundaki desenle aynı: müşteriye göre filtreli */}
            <div>
              <Label>Bağlı görüşme</Label>
              <CustomSelect
                value={form.gorusmeId || ''}
                onChange={e => setForm({ ...form, gorusmeId: e.target.value })}
                disabled={!form.musteriId && !form.firmaAdi}
              >
                <option value="">
                  {(form.musteriId || form.firmaAdi) ? 'Görüşme seç (opsiyonel)…' : 'Önce müşteri seçin'}
                </option>
                {(() => {
                  const normalize = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')
                  const hedefMusteriId = form.musteriId ? String(form.musteriId) : null
                  const hedefFirma = normalize(form.firmaAdi)
                  return gorusmeler
                    .filter(g => (hedefMusteriId && g.musteriId)
                      ? String(g.musteriId) === hedefMusteriId
                      : (hedefFirma && normalize(g.firmaAdi) === hedefFirma))
                    .map(g => (
                      <option key={g.id} value={g.id}>
                        {g.aktNo || `G-${g.id}`} — {g.konu || g.amac || '—'}{g.tarih ? ` · ${g.tarih}` : ''}
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
            {form.musteriId && (
              <div>
                <Label>
                  Lokasyon
                  <button
                    type="button"
                    onClick={() => setLokasyonModalAcik(true)}
                    title="Lokasyon ekle/sil"
                    style={{
                      background: 'none', border: 'none', padding: '0 0 0 6px',
                      cursor: 'pointer', color: 'var(--brand-primary)',
                      font: '500 11px/14px var(--font-sans)',
                    }}
                  >
                    <Settings size={11} strokeWidth={1.5} style={{ verticalAlign: -1 }} /> yönet
                  </button>
                </Label>
                {musteriLokasyonlari.length > 0 ? (
                  <CustomSelect
                    value={form.lokasyonId || ''}
                    onChange={e => setForm({ ...form, lokasyonId: e.target.value })}
                  >
                    <option value="">— Belirtilmedi</option>
                    {musteriLokasyonlari.map(l => (
                      <option key={l.id} value={l.id}>{l.ad}</option>
                    ))}
                  </CustomSelect>
                ) : (
                  <div style={{
                    padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface-sunken)',
                    border: '1px dashed var(--border-default)',
                    font: '400 12px/16px var(--font-sans)',
                    color: 'var(--text-tertiary)',
                  }}>
                    Bu müşteri için lokasyon yok. <button
                      type="button"
                      onClick={() => setLokasyonModalAcik(true)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--brand-primary)', font: '500 12px/16px var(--font-sans)', textDecoration: 'underline' }}
                    >+ Lokasyon ekle</button>
                  </div>
                )}
              </div>
            )}
            <div>
              <Label>Öncelik</Label>
              <CustomSelect value={form.oncelik} onChange={e => setForm({ ...form, oncelik: e.target.value })}>
                {/* Legacy 'orta' kaydı düzenlenirken değeri bozulmasın diye listede tutulur */}
                {form.oncelik === 'orta' && <option value="orta">{ONCELIK_MAP.orta.isim}</option>}
                {ONCELIK_SECENEKLERI.map(o => <option key={o.id} value={o.id}>{o.isim}</option>)}
              </CustomSelect>
            </div>
            <div>
              <Label>Durum</Label>
              <CustomSelect value={form.durum || 'bekliyor'} onChange={e => setForm({ ...form, durum: e.target.value })}>
                {GOREV_DURUMLARI.map(d => <option key={d.id} value={d.id}>{d.isim}</option>)}
              </CustomSelect>
            </div>
            <div>
              <Label>Kategori</Label>
              <CustomSelect value={form.kategoriId} onChange={e => setForm({ ...form, kategoriId: e.target.value })}>
                <option value="">— Kategori yok</option>
                {kategoriler.map(k => <option key={k.id} value={String(k.id)}>{k.ad}</option>)}
              </CustomSelect>
            </div>
            <div>
              <Label>Başlama tarihi</Label>
              <TarihSaatSecici
                value={form.baslamaTarih}
                onChange={v => setForm({ ...form, baslamaTarih: v })}
              />
            </div>
            <div>
              <Label required>Bitiş tarihi</Label>
              <TarihSaatSecici
                value={form.bitisTarih}
                onChange={v => setForm({ ...form, bitisTarih: v, sonTarih: dtToTarih(v) })}
              />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <Label>Açıklama</Label>
            <Textarea
              value={form.aciklama}
              onChange={e => setForm({ ...form, aciklama: e.target.value })}
              rows={3}
              placeholder="Görev detayları… (Ctrl+V ile ekran görüntüsü yapıştırabilirsin)"
              onPaste={(e) => {
                const resimler = panodanResimler(e)
                if (resimler.length) { e.preventDefault(); setGorevEkleri(prev => [...prev, ...resimler]) }
              }}
            />
          </div>

          {/* Gelişmiş bölüm (madde 4) — gizlilik, gözlemci, onay, atama türü, etiket, hatırlatma… */}
          <div style={{ marginBottom: 16, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setGelismisAcik(a => !a)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                padding: '10px 12px', background: 'var(--surface-sunken)',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                color: 'var(--text-primary)', font: '600 13px/18px var(--font-sans)',
              }}
            >
              <ChevronDown
                size={14}
                strokeWidth={1.5}
                style={{ transition: 'transform 120ms', transform: gelismisAcik ? 'none' : 'rotate(-90deg)' }}
              />
              Gelişmiş
              <span style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                gizlilik · gözlemciler · onay · etiketler · hatırlatmalar
              </span>
            </button>
            {gelismisAcik && (
              <div style={{ padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
                  <div>
                    <Label>Gizlilik</Label>
                    <CustomSelect value={form.gizlilik} onChange={e => setForm({ ...form, gizlilik: e.target.value })}>
                      {GIZLILIK_SECENEKLERI.map(gz => <option key={gz.id} value={gz.id}>{gz.isim}</option>)}
                    </CustomSelect>
                  </div>
                  <div>
                    <Label>Gözlemciler</Label>
                    <CokluSelect
                      degerler={(form.gozlemciler || []).map(Number)}
                      onChange={arr => setForm({ ...form, gozlemciler: arr.map(Number) })}
                      secenekler={kullanicilar.map(k => ({ id: Number(k.id), ad: k.ad }))}
                      placeholder="Gözlemci seç…"
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      Gözlemciler görevi takip eder, sorumluluk almaz.
                    </div>
                  </div>
                  <div>
                    <Label>Onay</Label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', padding: '8px 0' }}>
                      <input
                        type="checkbox"
                        checked={form.onayGerekli}
                        onChange={e => setForm({ ...form, onayGerekli: e.target.checked })}
                      />
                      Tamamlanınca onay gereksin
                    </label>
                    {form.onayGerekli && (
                      <>
                        <CustomSelect value={form.onaylayiciId} onChange={e => setForm({ ...form, onaylayiciId: e.target.value })}>
                          <option value="">Onaylayıcı: oluşturan (varsayılan)</option>
                          {kullanicilar.map(k => <option key={k.id} value={String(k.id)}>{k.ad}</option>)}
                        </CustomSelect>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                          Boş bırakılırsa görevi oluşturan onaylar.
                        </div>
                      </>
                    )}
                  </div>
                  <div>
                    <Label>Atama türü</Label>
                    <CustomSelect value={form.atamaTuru} onChange={e => setForm({ ...form, atamaTuru: e.target.value })}>
                      {ATAMA_TURLERI.map(a => <option key={a.id} value={a.id}>{a.isim}</option>)}
                    </CustomSelect>
                    {form.atamaTuru === 'ortak' && (
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                        Ortak sorumlulukta ekip üyeleri de sorumlu sayılır.
                      </div>
                    )}
                  </div>
                  <div>
                    <Label>Etiketler</Label>
                    <Input
                      value={form.etiketlerMetin}
                      onChange={e => setForm({ ...form, etiketlerMetin: e.target.value })}
                      placeholder="virgülle ayır: keşif, acil, saha…"
                    />
                  </div>
                  <div>
                    <Label>Tamamlama kuralı</Label>
                    <CustomSelect value={form.tamamlamaKurali} onChange={e => setForm({ ...form, tamamlamaKurali: e.target.value })}>
                      {TAMAMLAMA_KURALLARI.map(tk => <option key={tk.id} value={tk.id}>{tk.isim}</option>)}
                    </CustomSelect>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      Alt görevli akışta kullanılır (bilgi amaçlı).
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <Label>Beklenen çıktı</Label>
                  <Textarea
                    rows={2}
                    value={form.beklenenCikti}
                    onChange={e => setForm({ ...form, beklenenCikti: e.target.value })}
                    placeholder="Görev bittiğinde ortaya ne çıkmalı?"
                  />
                </div>
                <div style={{ marginTop: 16 }}>
                  <Label>Hatırlatmalar</Label>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '6px 0' }}>
                    {[
                      { k: 'gun3', l: '3 gün önce' },
                      { k: 'gun1', l: '1 gün önce' },
                      { k: 'gecikme', l: 'Geciktiğinde her gün' },
                    ].map(h => (
                      <label key={h.k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                        <input
                          type="checkbox"
                          checked={!!form.hatirlatmaSecim?.[h.k]}
                          onChange={e => setForm({ ...form, hatirlatmaSecim: { ...form.hatirlatmaSecim, [h.k]: e.target.checked } })}
                        />
                        {h.l}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Servis talebi toggle — sadece müşteri seçiliyse + yeni görev oluşturuyorsa */}
          {!duzenleId && form.musteriId && (
            <div style={{ marginBottom: 16, padding: '10px 12px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                <input
                  type="checkbox"
                  checked={form.servisTalebiOlustur || false}
                  onChange={e => setForm({ ...form, servisTalebiOlustur: e.target.checked })}
                />
                Aynı anda servis talebi de oluştur
              </label>
              {form.servisTalebiOlustur && (
                <p style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 6, paddingLeft: 22 }}>
                  Görev kaydedildikten sonra otomatik servis talebi oluşturulup detay sayfasına yönlendirileceksiniz.
                </p>
              )}
            </div>
          )}

          {/* Ekler — dosya/resim (mig 184). Düzenlemede de açık: Salih Çakmaklı
              31.07'de "düzenlemeye girince foto ekleyemiyorum" diye bildirdi.
              Düzenlemede seçilenler MEVCUT eklerin üstüne EKLENİR, silmez. */}
          <div style={{ marginBottom: 16 }}>
            {duzenleId && mevcutEkler.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <Label>Görevde ekli dosyalar ({mevcutEkler.length})</Label>
                <EkListesi dosyalar={mevcutEkler} />
              </div>
            )}
            <EkSecici dosyalar={gorevEkleri} onChange={setGorevEkleri} disabled={kaydetMesgul} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={kaydet} disabled={kaydetMesgul}>
              {kaydetMesgul ? 'Kaydediliyor…' : (duzenleId ? 'Güncelle' : (form.servisTalebiOlustur ? 'Görev + Servis talebi oluştur' : 'Kaydet'))}
            </Button>
            <Button variant="secondary" onClick={iptal} disabled={kaydetMesgul}>İptal</Button>
          </div>
        </Card>
      )}

      {/* Kanban */}
      <style>{`
        .gorev-karti:hover .gorev-aksiyon { opacity: 1 !important; }
        .gorev-karti:focus-within .gorev-aksiyon { opacity: 1 !important; }
        tr.gorev-satir:hover .no-kopyala { opacity: 1 !important; }
        tr.gorev-satir:focus-within .no-kopyala { opacity: 1 !important; }
      `}</style>
      {!goster && gorunumModu === 'kanban' && (() => {
        // Kanban da liste ile aynı ek filtreleri kullanır (kategori/öncelik/etiket) —
        // "kanbanda filtre yok" tutarsızlığı giderildi. State liste ile ORTAK.
        const q = etiketFiltre.toLocaleLowerCase('tr')
        const kanbanEsle = (g) => {
          if (kategoriFiltre && String(g.kategoriId ?? '') !== kategoriFiltre) return false
          if (oncelikFiltre) {
            const esdeger = oncelikFiltre === 'normal' ? ['normal', 'orta'] : [oncelikFiltre]
            if (!esdeger.includes(g.oncelik)) return false
          }
          if (etiketFiltre && !(Array.isArray(g.etiketler) && g.etiketler.some(t => String(t).toLocaleLowerCase('tr').includes(q)))) return false
          return true
        }
        const kanbanGorevler = filtreliGorevler.filter(kanbanEsle)
        const kanbanFiltreAktif = !!(kategoriFiltre || oncelikFiltre || etiketFiltre)
        return (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ minWidth: 150 }}>
              <CustomSelect value={kategoriFiltre} onChange={e => setKategoriFiltre(e.target.value)}>
                <option value="">Tüm kategoriler</option>
                {kategoriler.map(k => <option key={k.id} value={String(k.id)}>{k.ad}</option>)}
              </CustomSelect>
            </div>
            <div style={{ minWidth: 130 }}>
              <CustomSelect value={oncelikFiltre} onChange={e => setOncelikFiltre(e.target.value)}>
                <option value="">Tüm öncelikler</option>
                {ONCELIK_SECENEKLERI.map(o => <option key={o.id} value={o.id}>{o.isim}</option>)}
              </CustomSelect>
            </div>
            <input
              placeholder="etiket ara…"
              value={etiketFiltre}
              onChange={e => setEtiketFiltre(e.target.value)}
              style={{
                width: 130, padding: '7px 10px',
                font: '400 12px/16px var(--font-sans)', color: 'var(--text-primary)',
                background: 'var(--surface-card)', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)', outline: 'none',
              }}
            />
            {kanbanFiltreAktif && (
              <button
                onClick={() => { setKategoriFiltre(''); setOncelikFiltre(''); setEtiketFiltre('') }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '6px 10px',
                  background: 'transparent', border: '1px solid var(--border-default)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)',
                  font: '500 12px/16px var(--font-sans)',
                }}
              >
                <X size={12} strokeWidth={1.5} /> Temizle ({kanbanGorevler.length})
              </button>
            )}
            {/* Panoda sekme ve durum filtresi UYGULANMAZ (kolonlar zaten
                duruma göre dizili). Listede daraltılan küme burada geri
                geldiği için "filtrem kayboldu" hissi doğuyordu — sessiz
                kalmak yerine söylüyoruz. */}
            {(sekme !== 'tumu' || chipAktif) && (
              <span
                title="Pano tüm akışı gösterir; sekme ve durum filtresi yalnız liste görünümüne uygulanır."
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 'var(--radius-pill)',
                  background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
                  font: '500 11px/16px var(--font-sans)', color: 'var(--text-tertiary)',
                }}
              >
                <Filter size={11} strokeWidth={1.5} />
                Panoda uygulanmaz: {SEKME_LISTESI.find(s => s.id === sekme)?.isim}
                {chipAktif && ` · ${chipAdi}`}
              </span>
            )}
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
            {/* Pano ekrana sabitlenir — sayfa değil, her kolon kendi içinde kayar */}
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'stretch', height: 'calc(100vh - 350px)', minHeight: 420 }}>
              {kolonlar.map(kolon => (
                <DroppableKolon
                  key={kolon.id}
                  kolon={kolon}
                  gorevler={kanbanGorevler.filter(g => kolon.durumlar.includes(durumBilgi(g.durum).id))}
                  kullanicilar={kullanicilar}
                  lokasyonMap={lokasyonMap}
                  altSayiMap={altSayiMap}
                  onGorevClick={(id) => navigate(`/gorevler/${id}`)}
                  onEdit={duzenleAc}
                  onSil={gorevSil}
                  kartYetki={kartYetkisi}
                />
              ))}
            </div>
            <DragOverlay dropAnimation={{ duration: 150 }}>
              {aktifGorev ? <GorevKarti gorev={aktifGorev} kullanicilar={kullanicilar} overlay /> : null}
            </DragOverlay>
          </DndContext>
        </>
        )
      })()}

      {/* Liste — Profesyonel tablo görünümü */}
      {!goster && gorunumModu === 'liste' && (() => {
        // ISO timestamp'ı TR saat dilimine göre biçimle (UTC → Europe/Istanbul)
        const fmtTarih = (iso) => {
          if (!iso) return ''
          const str = String(iso)
          const saatVar = str.includes('T') || str.includes(' ')
          const d = new Date(str)
          if (isNaN(d.getTime())) return str.slice(0, 10)
          // ⚠️ YIL 2 HANE (18.08): "13.08.2026 09:35" 16 karakterdi ve iki tarih
          // kolonu tabloyu ekran dışına taşırıyordu ("ekrana sığmıyor" geri
          // bildirimi). "13.08.26 09:35" ile kolon başına ~18px kazanılıyor,
          // bilgi kaybı yok.
          if (saatVar) {
            return new Intl.DateTimeFormat('tr-TR', {
              day: '2-digit', month: '2-digit', year: '2-digit',
              hour: '2-digit', minute: '2-digit',
              timeZone: 'Europe/Istanbul',
            }).format(d)
          }
          return new Intl.DateTimeFormat('tr-TR', {
            day: '2-digit', month: '2-digit', year: '2-digit',
            timeZone: 'Europe/Istanbul',
          }).format(d)
        }

        // 18.08 "ekrana sığmıyor": 10 kolon × yatay dolgu tabloyu taşırıyordu.
        // Dolgu 8→6px, başlık 11→10.5px, hücre 12→11.5px. Satır yoğunluğu
        // (06.08 kararı) korunuyor; yalnız yatay eksende sıkıştırma yapıldı.
        const thStyle = {
          textAlign: 'left',
          padding: '7px 6px',
          font: '600 10.5px/14px var(--font-sans)',
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: 0.2,
          background: 'var(--surface-sunken)',
          borderBottom: '1px solid var(--border-default)',
          whiteSpace: 'nowrap',
          position: 'sticky', top: 0, zIndex: 1,
        }
        const tdStyle = {
          // GRID yoğunluğu (06.08): satırlar sıkı — tek ekranda daha çok görev
          padding: '5px 6px',
          font: '400 11.5px/17px var(--font-sans)',
          color: 'var(--text-primary)',
          borderBottom: '1px solid var(--border-default)',
          verticalAlign: 'middle',
          whiteSpace: 'nowrap',
        }
        const colFilterInput = {
          width: '100%',
          padding: '3px 6px',
          font: '400 11.5px/16px var(--font-sans)',
          color: 'var(--text-primary)',
          background: 'var(--surface-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          outline: 'none',
        }

        return (
          <Card padding={0} style={{
            overflow: 'hidden',
            // Tek ekran: kart kalan alanı doldurur, içindeki tablo kayar
            flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
          }}>
            {/* Sekmeler (madde 30) — yatay kaydırılabilir, sayı rozetli */}
            {/* ⚠️ Sekme değişince durum chip'i SIFIRLANIR: KPI'dan gelen
                chip ("Açık") yeni sekmeyle çelişince liste matematiksel olarak
                boşalıyor, rozet dolu görünüyordu ("rozet 37 · liste 0").
                Kayıtlı filtre uygulaması bu yoldan geçmez (filtreUygula
                sekme+chip'i birlikte yazar) — chip'i ezmez. */}
            <SekmeSatiri
              sekmeler={SEKME_LISTESI.map(s => ({
                ...s, sayi: sekmeSayilari[s.id] ?? 0, vurgu: SEKME_VURGU[s.id],
              }))}
              aktif={sekme}
              onSec={(id) => { setSekme(id); setFiltre('hepsi'); setSayfa(1) }}
            />

            {/* Kayıtlı filtreler + ek filtreler (madde 31) — KATLANIR */}
            {filtrePaneli && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              padding: '8px 8px',
              borderBottom: '1px solid var(--border-default)',
              background: 'var(--surface-sunken)',
            }}>
              <div style={{ minWidth: 150 }}>
                <CustomSelect value={kategoriFiltre} onChange={e => { setKategoriFiltre(e.target.value); setSayfa(1) }}>
                  <option value="">Tüm kategoriler</option>
                  {kategoriler.map(k => <option key={k.id} value={String(k.id)}>{k.ad}</option>)}
                </CustomSelect>
              </div>
              <div style={{ minWidth: 130 }}>
                <CustomSelect value={oncelikFiltre} onChange={e => { setOncelikFiltre(e.target.value); setSayfa(1) }}>
                  <option value="">Tüm öncelikler</option>
                  {ONCELIK_SECENEKLERI.map(o => <option key={o.id} value={o.id}>{o.isim}</option>)}
                </CustomSelect>
              </div>
              <input
                placeholder="etiket ara…"
                value={etiketFiltre}
                onChange={e => { setEtiketFiltre(e.target.value); setSayfa(1) }}
                style={{
                  width: 130, padding: '7px 10px',
                  font: '400 12px/16px var(--font-sans)', color: 'var(--text-primary)',
                  background: 'var(--surface-card)', border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)', outline: 'none',
                }}
              />
              <button
                onClick={filtreKaydetTikla}
                title="Aktif sekme + filtre kombinasyonunu kaydet"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '6px 10px',
                  background: 'transparent', border: '1px solid var(--border-default)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)',
                  font: '500 12px/16px var(--font-sans)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              >
                <Bookmark size={12} strokeWidth={1.5} /> Filtreyi Kaydet
              </button>
              {kayitliFiltreler.map(f => (
                <span
                  key={f.ad}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '5px 4px 5px 10px',
                    background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-pill)',
                    font: '500 12px/16px var(--font-sans)', color: 'var(--text-secondary)',
                  }}
                >
                  <button
                    onClick={() => filtreUygula(f)}
                    title="Filtreyi uygula"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit' }}
                  >
                    {f.ad}
                  </button>
                  <button
                    onClick={() => kayitliFiltreSil(f.ad)}
                    aria-label={`${f.ad} filtresini sil`}
                    title="Sil"
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 18, height: 18, background: 'none', border: 'none',
                      padding: 0, cursor: 'pointer', color: 'var(--text-tertiary)',
                    }}
                  >
                    <X size={11} strokeWidth={1.8} />
                  </button>
                </span>
              ))}
            </div>
            )}

            {/* Durum şeridi — renk noktası + isim (tabloyla aynı dil).
                "+ Yeni" chip'i KALDIRILDI: sağ üstteki "Yeni görev" düğmesiyle
                aynı işi yapıyordu. */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
              padding: '7px 8px',
              borderBottom: '1px solid var(--border-default)',
              background: 'var(--surface-card)',
            }}>
              {durumChipler.map(d => {
                const aktif = filtre === d.id
                return (
                  <button
                    key={d.id}
                    onClick={() => { setFiltre(d.id); setSayfa(1) }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '5px 10px',
                      background: aktif ? 'var(--brand-primary-soft)' : 'transparent',
                      color: aktif ? 'var(--brand-primary)' : 'var(--text-secondary)',
                      border: 'none', cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)',
                      font: aktif ? '600 13px/18px var(--font-sans)' : '500 13px/18px var(--font-sans)',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { if (!aktif) e.currentTarget.style.background = 'var(--surface-sunken)' }}
                    onMouseLeave={e => { if (!aktif) e.currentTarget.style.background = 'transparent' }}
                  >
                    {d.renk && (
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: d.renk, flexShrink: 0,
                      }} />
                    )}
                    {d.isim}
                  </button>
                )
              })}
              <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {filtreVar && (
                  <button
                    onClick={filtreleriTemizle}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '5px 10px',
                      background: 'transparent', border: '1px solid var(--border-default)',
                      color: 'var(--text-secondary)', cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)',
                      font: '500 12px/16px var(--font-sans)',
                    }}
                  >
                    <X size={12} strokeWidth={1.5} /> Temizle
                  </button>
                )}
                {/* Katlanır filtre paneli: kategori/öncelik/etiket + sütun
                    filtreleri. Kapalıyken kaç filtrenin daralttığı rozette
                    görünür — daralmanın sessiz kalmamasi sart. */}
                <button
                  onClick={filtrePaneliDegistir}
                  title={filtrePaneli ? 'Filtre alanını gizle' : 'Kategori, öncelik, etiket ve sütun filtrelerini göster'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '5px 10px',
                    background: filtrePaneli ? 'var(--brand-primary-soft)' : 'transparent',
                    border: '1px solid var(--border-default)',
                    color: filtrePaneli ? 'var(--brand-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-sm)',
                    font: '500 12px/16px var(--font-sans)',
                  }}
                >
                  <Filter size={12} strokeWidth={1.5} /> Filtreler
                  {ekFiltreSayisi > 0 && (
                    <span className="tabular-nums" style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: 16, height: 15, padding: '0 4px', borderRadius: 8,
                      background: 'var(--brand-primary)', color: '#fff',
                      font: '600 10px/1 var(--font-sans)',
                    }}>{ekFiltreSayisi}</span>
                  )}
                </button>
              </div>
            </div>

            {/* Tablo */}
            <div style={{ overflowX: 'auto', flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 52 }}></th>
                    <th style={thStyle}>No</th>
                    <th style={thStyle}>Takip</th>
                    <th style={thStyle}>Görevi Veren</th>
                    <th style={thStyle}>Görevi Alan</th>
                    {/* Görev metni esnek kolon: minWidth 320→240, kalan genişliği
                        yine bu kolon yutar (tableLayout auto) */}
                    <th style={{ ...thStyle, minWidth: 240 }}>Görev</th>
                    <th style={thStyle}>İlerleme</th>
                    <th style={thStyle}>Baş. Tarih</th>
                    <th style={thStyle}>Bit. Tarih</th>
                    <th style={thStyle}>Öncelik</th>
                  </tr>
                  {/* Sütun filtre satırı — "Filtreler" düğmesiyle katlanır */}
                  {filtrePaneli && (
                  <tr>
                    <th style={{ ...thStyle, top: 34, padding: '5px 6px', background: 'var(--surface-card)' }}></th>
                    <th style={{ ...thStyle, top: 34, padding: '5px 6px', background: 'var(--surface-card)' }}>
                      <input placeholder="GRV-…" value={kolonFiltre.no}
                        onChange={e => { setKolonFiltre({ ...kolonFiltre, no: e.target.value }); setSayfa(1) }}
                        style={{ ...colFilterInput, minWidth: 64 }} />
                    </th>
                    <th style={{ ...thStyle, top: 34, padding: '5px 6px', background: 'var(--surface-card)' }}>
                      <select
                        value={kolonFiltre.takip}
                        onChange={e => { setKolonFiltre({ ...kolonFiltre, takip: e.target.value }); setSayfa(1) }}
                        style={{ ...colFilterInput, cursor: 'pointer' }}
                      >
                        <option value="">Tümü</option>
                        {GOREV_DURUMLARI.map(d => <option key={d.id} value={d.id}>{d.isim}</option>)}
                        <option value="suresi_gecti">Gecikmiş</option>
                      </select>
                    </th>
                    <th style={{ ...thStyle, top: 34, padding: '5px 6px', background: 'var(--surface-card)' }}>
                      <input placeholder="ara…" value={kolonFiltre.veren}
                        onChange={e => { setKolonFiltre({ ...kolonFiltre, veren: e.target.value }); setSayfa(1) }}
                        style={colFilterInput} />
                    </th>
                    <th style={{ ...thStyle, top: 34, padding: '5px 6px', background: 'var(--surface-card)' }}>
                      <input placeholder="ara…" value={kolonFiltre.alan}
                        onChange={e => { setKolonFiltre({ ...kolonFiltre, alan: e.target.value }); setSayfa(1) }}
                        style={colFilterInput} />
                    </th>
                    <th style={{ ...thStyle, top: 34, padding: '5px 6px', background: 'var(--surface-card)' }}>
                      <input placeholder="başlık / açıklama…" value={kolonFiltre.gorev}
                        onChange={e => { setKolonFiltre({ ...kolonFiltre, gorev: e.target.value }); setSayfa(1) }}
                        style={colFilterInput} />
                    </th>
                    <th style={{ ...thStyle, top: 34, padding: '5px 6px', background: 'var(--surface-card)' }}></th>
                    <th style={{ ...thStyle, top: 34, padding: '5px 6px', background: 'var(--surface-card)' }}>
                      <input type="date" value={kolonFiltre.basTar}
                        onChange={e => { setKolonFiltre({ ...kolonFiltre, basTar: e.target.value }); setSayfa(1) }}
                        style={colFilterInput} />
                    </th>
                    <th style={{ ...thStyle, top: 34, padding: '5px 6px', background: 'var(--surface-card)' }}>
                      <input type="date" value={kolonFiltre.bitTar}
                        onChange={e => { setKolonFiltre({ ...kolonFiltre, bitTar: e.target.value }); setSayfa(1) }}
                        style={colFilterInput} />
                    </th>
                    <th style={{ ...thStyle, top: 34, padding: '5px 6px', background: 'var(--surface-card)' }}>
                      <input placeholder="ara…" value={kolonFiltre.kontrol}
                        onChange={e => { setKolonFiltre({ ...kolonFiltre, kontrol: e.target.value }); setSayfa(1) }}
                        style={colFilterInput} />
                    </th>
                  </tr>
                  )}
                </thead>
                <tbody>
                  {dilim.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', font: '400 13px/18px var(--font-sans)' }}>
                        {/* Boş liste SEBEBİNİ söyler: "rozet dolu ama liste boş"
                            şikâyetinin yarısı, daralmanın görünmemesindendi. */}
                        {filtreVar ? (
                          <>
                            <div style={{ marginBottom: 10 }}>
                              Bu sekmede filtrelerle eşleşen görev yok.
                              {' '}<span style={{ color: 'var(--text-secondary)' }}>
                                (sekme: {SEKME_LISTESI.find(s => s.id === sekme)?.isim}
                                {chipAktif && ` · durum: ${chipAdi}`}
                                {kisiAdi && ` · kişi: ${kisiAdi}`})
                              </span>
                            </div>
                            <Button variant="secondary" onClick={filtreleriTemizle} iconLeft={<X size={13} strokeWidth={1.5} />}>
                              Filtreleri temizle
                            </Button>
                          </>
                        ) : 'Bu sekmede görev bulunmuyor.'}
                      </td>
                    </tr>
                  )}
                  {dilim.map(g => {
                    const atananKisi = kullanicilar.find(k => k.id?.toString() === g.atanan)
                    const gecikti = gorevGecikti(g)
                    const durumBil = durumBilgi(g.durum)
                    const durumIkon = KAPALI_DURUMLAR.includes(g.durum)
                      ? <CheckCircle2 size={14} strokeWidth={1.8} style={{ color: durumBil.renk }} />
                      : g.durum === 'devam' || g.durum === 'revize'
                        ? <Clock size={14} strokeWidth={1.8} style={{ color: durumBil.renk }} />
                        : <Circle size={14} strokeWidth={1.8} style={{ color: durumBil.renk }} />
                    const altGorevMu = !!g.ustGorevId
                    const ustNo = altGorevMu ? gorevMap.get(g.ustGorevId)?.gorevNo : null
                    const altSayi = altSayiMap.get(g.id) || 0

                    return (
                      <tr
                        key={g.id}
                        className="gorev-satir"
                        // ⚠️ Metin seçiliyken satır tıklaması detayı AÇMAZ:
                        // görev no'sunu kopyalamak için basılı tutup sürüklemek
                        // "tıklama" sayılıyor, seçim tamamlanır tamamlanmaz
                        // sayfa detaya atlıyordu.
                        onClick={() => {
                          if (window.getSelection()?.toString()) return
                          navigate(`/gorevler/${g.id}`)
                        }}
                        style={{ cursor: 'pointer', background: 'var(--surface-card)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-card)'}
                      >
                        <td style={{ ...tdStyle, padding: '4px 12px' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'inline-flex', gap: 2 }}>
                            <button
                              aria-label="Detay"
                              onClick={() => navigate(`/gorevler/${g.id}`)}
                              title="Detay"
                              style={{
                                width: 22, height: 22,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: 'transparent', border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                            >
                              <FolderOpen size={13} strokeWidth={1.5} />
                            </button>
                            <button
                              aria-label={durumBil.isim}
                              onClick={() => navigate(`/gorevler/${g.id}`)}
                              title={durumBil.isim}
                              style={{
                                width: 22, height: 22,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: 'transparent', border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                              }}
                            >
                              {durumIkon}
                            </button>
                          </div>
                        </td>
                        <td style={{ ...tdStyle, paddingLeft: altGorevMu ? 20 : 8 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} title={ustNo ? `Üst görev: ${ustNo}` : undefined}>
                            {altGorevMu && <CornerDownRight size={11} strokeWidth={1.8} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                            <span style={{ font: '500 11px/14px var(--font-mono, monospace)', color: 'var(--text-tertiary)', letterSpacing: 0.3, userSelect: 'text' }}>
                              {g.gorevNo || '—'}
                            </span>
                            {/* Elle seçmeye gerek kalmadan tek tıkla kopyalama —
                                satır hover'ında belirir, sakin dururken görünmez */}
                            {g.gorevNo && (
                              <button
                                className="no-kopyala"
                                title="Görev numarasını kopyala"
                                aria-label="Görev numarasını kopyala"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigator.clipboard?.writeText(g.gorevNo)
                                    .then(() => toast.success(`${g.gorevNo} kopyalandı.`))
                                    .catch(() => toast.error('Kopyalanamadı — numarayı elle seçebilirsiniz.'))
                                }}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  width: 18, height: 18, flexShrink: 0,
                                  background: 'transparent', border: 'none', padding: 0,
                                  color: 'var(--text-tertiary)', cursor: 'pointer',
                                  opacity: 0, transition: 'opacity 120ms',
                                }}
                                onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-primary)'}
                                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
                              >
                                <Copy size={11} strokeWidth={1.8} />
                              </button>
                            )}
                          </span>
                          {altGorevMu && ustNo && (
                            <div style={{ font: '400 10px/13px var(--font-mono, monospace)', color: 'var(--text-tertiary)', opacity: 0.7, paddingLeft: 14 }}>
                              üst: {ustNo}
                            </div>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <EtkinDurumRozeti gorev={g} />
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--text-secondary)', textTransform: 'uppercase', font: '500 12px/16px var(--font-sans)' }}>
                          {g.olusturanAd || '—'}
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--text-secondary)', textTransform: 'uppercase', font: '500 12px/16px var(--font-sans)' }}>
                          {atananKisi ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <Avatar name={atananKisi.ad} size="xs" />
                              {atananKisi.ad}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ ...tdStyle, maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: altGorevMu ? 24 : 8 }} title={g.baslik}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: '100%' }}>
                            {altGorevMu && <CornerDownRight size={12} strokeWidth={1.8} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.baslik}</span>
                            {altSayi > 0 && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
                                padding: '1px 8px', borderRadius: 'var(--radius-pill)',
                                background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
                                font: '500 11px/16px var(--font-sans)', color: 'var(--text-tertiary)',
                              }}>
                                <ChevronDown size={10} strokeWidth={1.8} /> {altSayi} alt görev
                              </span>
                            )}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          {g.ilerleme != null ? <IlerlemeBar deger={g.ilerleme} /> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                        </td>
                        <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                          {fmtTarih(g.olusturmaTarih)}
                        </td>
                        <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums', color: gecikti ? 'var(--danger)' : 'var(--text-secondary)' }}>
                          {fmtTarih(g.bitisTarih || g.sonTarih)}
                        </td>
                        <td style={tdStyle}>
                          <OncelikNokta oncelik={g.oncelik} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer: sayfalama */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              padding: '10px 16px',
              borderTop: '1px solid var(--border-default)',
              background: 'var(--surface-sunken)',
              flexWrap: 'wrap',
            }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={() => setSayfa(1)}
                  disabled={guvSayfa === 1}
                  style={{
                    padding: '6px 10px', background: 'var(--surface-card)',
                    border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                    cursor: guvSayfa === 1 ? 'not-allowed' : 'pointer',
                    color: 'var(--text-secondary)', font: '500 12px/16px var(--font-sans)',
                    opacity: guvSayfa === 1 ? 0.5 : 1,
                  }}
                >«</button>
                <button
                  onClick={() => setSayfa(p => Math.max(1, p - 1))}
                  disabled={guvSayfa === 1}
                  style={{
                    padding: '6px 10px', background: 'var(--surface-card)',
                    border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                    cursor: guvSayfa === 1 ? 'not-allowed' : 'pointer',
                    color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center',
                    opacity: guvSayfa === 1 ? 0.5 : 1,
                  }}
                ><ChevronLeft size={14} strokeWidth={1.5} /></button>
                {(() => {
                  const start = Math.max(1, guvSayfa - 4)
                  const end = Math.min(toplamSayfa, start + 9)
                  const baslangic = Math.max(1, end - 9)
                  const sayilar = []
                  for (let i = baslangic; i <= end; i++) sayilar.push(i)
                  return sayilar.map(n => (
                    <button
                      key={n}
                      onClick={() => setSayfa(n)}
                      style={{
                        minWidth: 32, padding: '6px 10px',
                        background: n === guvSayfa ? 'var(--brand-primary)' : 'var(--surface-card)',
                        color: n === guvSayfa ? '#fff' : 'var(--text-secondary)',
                        border: `1px solid ${n === guvSayfa ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                        font: '500 12px/16px var(--font-sans)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >{n}</button>
                  ))
                })()}
                <button
                  onClick={() => setSayfa(p => Math.min(toplamSayfa, p + 1))}
                  disabled={guvSayfa === toplamSayfa}
                  style={{
                    padding: '6px 10px', background: 'var(--surface-card)',
                    border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                    cursor: guvSayfa === toplamSayfa ? 'not-allowed' : 'pointer',
                    color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center',
                    opacity: guvSayfa === toplamSayfa ? 0.5 : 1,
                  }}
                ><ChevronRight size={14} strokeWidth={1.5} /></button>
                <button
                  onClick={() => setSayfa(toplamSayfa)}
                  disabled={guvSayfa === toplamSayfa}
                  style={{
                    padding: '6px 10px', background: 'var(--surface-card)',
                    border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                    cursor: guvSayfa === toplamSayfa ? 'not-allowed' : 'pointer',
                    color: 'var(--text-secondary)', font: '500 12px/16px var(--font-sans)',
                    opacity: guvSayfa === toplamSayfa ? 0.5 : 1,
                  }}
                >»</button>
              </div>
              <div style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-secondary)' }}>
                <span className="tabular-nums">{toplamSayfa}</span> sayfada toplam <strong style={{ color: 'var(--text-primary)' }} className="tabular-nums">{toplam}</strong> kayıt var
              </div>
            </div>
          </Card>
        )
      })()}

      {/* Sebep zorunlu durum geçişi (kanban → Beklemede) — kapanınca unmount,
          böylece metin alanı her açılışta temiz başlar */}
      {sebepModal && (
        <SebepModal
          acik
          baslik="Bekleme sebebi gerekli"
          aciklama={`"${sebepModal.gorevBaslik}" görevi ${kolonlar.find(k => k.id === sebepModal.yeniDurum)?.isim || durumBilgi(sebepModal.yeniDurum).isim} durumuna alınıyor. Sebep yazmadan geçiş yapılamaz.`}
          onKaydet={sebepOnayla}
          onVazgec={sebepVazgec}
        />
      )}

      {/* Lokasyon yönetim modal'ı */}
      <LokasyonYonetModal
        acik={lokasyonModalAcik}
        musteriId={form.musteriId ? Number(form.musteriId) : null}
        musteriAdi={form.musteriAdi || form.firmaAdi || ''}
        lokasyonlar={musteriLokasyonlari}
        onLokasyonlarChange={(yeni) => {
          setMusteriLokasyonlari(yeni)
          // Tüm lokasyonlar lookup'ını da güncelle (kart üzerindeki gösterim için)
          const musteriIdNum = Number(form.musteriId)
          const digerleri = tumLokasyonlar.filter(l => l.musteriId !== musteriIdNum)
          setTumLokasyonlar([...digerleri, ...yeni.map(l => ({ ...l, musteriId: musteriIdNum }))])
          // Silinen lokasyon formda seçiliyse temizle
          if (form.lokasyonId && !yeni.some(l => l.id?.toString() === form.lokasyonId.toString())) {
            setForm(f => ({ ...f, lokasyonId: '' }))
          }
        }}
        onClose={() => setLokasyonModalAcik(false)}
      />
    </div>
  )
}

export default Gorevler
