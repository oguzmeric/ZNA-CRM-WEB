import { useAuth } from '../context/AuthContext'
import { faturaYetkisi } from '../services/faturaTalepService'
import { siparisYonetimiGorebilirMi } from '../lib/siparisYetki'
import { filoGorebilirMi } from '../lib/filoYetki'
import { ikGorebilirMi } from '../lib/ikYetki'
import { mesaiRaporuGorebilirMi } from '../lib/mesaiYetki'
import { teklifGorebilirMi } from '../lib/teklifYetki'
import { sozlesmeArsiviGorebilirMi } from '../lib/sozlesmeArsivYetki'
import { aktiviteLogEkle } from '../services/aktiviteService'
import { useChat } from '../context/ChatContext'
import { useBildirim } from '../context/BildirimContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import {
  LayoutDashboard, Users, CheckSquare, Phone, Calendar, Package,
  ReceiptText, KeyRound, Wrench, Truck, FolderOpen, BarChart3,
  MessageSquare, UserCog, LogOut, ChevronDown, ChevronRight, Bell,
  Palette, Check, X, Info, CheckCircle2, AlertTriangle, XCircle, Megaphone,
  Activity, Timer, Boxes, StickyNote, GripVertical, RotateCcw, BadgeCheck, Car, LifeBuoy,
  FileCheck, Fuel, ShoppingCart, Sun, FileSignature, Receipt, CalendarCheck, Wallet,
  Landmark, Archive, ShieldCheck, Search, SlidersHorizontal, Inbox, Star,
} from 'lucide-react'
import ThemePaneli from '../components/ThemePaneli'
import FloatingSohbetButton from '../components/FloatingSohbetButton'
import SohbetPenceresi from '../components/SohbetPenceresi'
import GecikmisGorevKapisi from '../components/GecikmisGorevKapisi'
import FloatingZeynaButton from '../components/FloatingZeynaButton'
import GlobalBarkodAra from '../components/GlobalBarkodAra'
import { kritikSeviyeSayisi } from '../services/depoService'
import { Avatar } from '../components/ui'
import { useMenuSiralama } from '../hooks/useMenuSiralama'
import { trContains } from '../lib/trSearch'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Drag-drop wrapper — bir menu satirini sortable hale getirir.
//
// ⚠️ Grip YALNIZ duzen modunda gorunur (14.08). Eskiden her satirda surekli
// %40 opaklikta duruyordu; kurumsal urunde duzenleme afordansi surekli ekranda
// olmaz — "prototip" hissi verir. Duzen modu disinda satir tamamen normal.
function SortableSatir({ id, children, duzenModu }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !duzenModu })
  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'relative',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 10 : 'auto',
        background: isDragging ? 'rgba(255,255,255,0.06)' : 'transparent',
        borderRadius: 6,
        paddingRight: duzenModu ? 20 : 0,   // grip icin sag bosluk — yalniz duzen modunda
      }}
      className="menu-satir"
    >
      {children}
      {duzenModu && (
        <span
          {...attributes}
          {...listeners}
          title="Sürükle ile sırala"
          style={{
            position: 'absolute',
            right: 2, top: 4,
            width: 16, height: 20,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'grab',
            color: '#fff',
            opacity: 0.55,
            transition: 'opacity 0.12s, background 0.12s',
            borderRadius: 4,
            touchAction: 'none',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.55'; e.currentTarget.style.background = 'transparent' }}
        >
          <GripVertical size={13} strokeWidth={2} />
        </span>
      )}
    </div>
  )
}

// Sidebar rozeti — tek bicim, tek yerde. Grup/ust baslik/alt madde ayni gorunur.
function MenuRozet({ sayi, nabiz, baslik }) {
  if (!sayi) return null
  return (
    <span
      title={baslik}
      style={{
        minWidth: 17, height: 16, padding: '0 5px',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--danger)', color: '#fff',
        font: '700 10px/1 var(--font-sans)',
        flexShrink: 0,
        animation: nabiz ? 'nabizYansin 1.6s ease-in-out infinite' : undefined,
      }}
    >
      {sayi > 99 ? '99+' : sayi}
    </span>
  )
}

// Grup hiyerarşisi — Salesforce'un "app tab" mantığından esinlenildi, dikey karşılığı.
// Grup başlıkları uppercase + silik renkli render edilir, hiyerarşi net görünsün diye.
const GRUPLAR = [
  { id: 'gunluk',    baslik: 'Günlük' },
  { id: 'satis',     baslik: 'Satış' },
  { id: 'tedarik',   baslik: 'Tedarik Süreçleri' },
  { id: 'operasyon', baslik: 'Operasyon' },
  // ⭐ 17.08 — Portal 1-2 hafta içinde onlarca firmaya açılıyor (Bayrampaşa ilk).
  // Müşterinin gönderdiği işler ve portalın kendi yönetimi tek grupta toplanır;
  // servis ekibinin iç kuyruğuyla karışmaz.
  { id: 'portal',    baslik: 'Müşteri Portalı' },
  { id: 'bakim',     baslik: 'Bakım' },
  { id: 'filo',      baslik: 'ZNA Filo Yönetimi' },
  { id: 'yonetim',   baslik: 'Yönetim' },
]

const menuItems = [
  { id: 'dashboard', isim: 'Panel', Icon: LayoutDashboard, yol: '/dashboard', modul: null, grup: 'gunluk' },
  {
    id: 'musteriler',
    isim: 'Müşteriler',
    Icon: Users,
    modul: 'musteriler',
    grup: 'gunluk',
    altMenu: [
      { id: 'musteri-liste', isim: 'Müşteri Listesi', yol: '/musteriler' },
      { id: 'bayiler', isim: 'Bayiler', yol: '/bayiler' },
    ],
  },
  { id: 'gorevler', isim: 'Görevler', Icon: CheckSquare, yol: '/gorevler', modul: 'gorevler', grup: 'gunluk' },
  { id: 'gorusmeler', isim: 'Görüşmeler', Icon: Phone, yol: '/gorusmeler', modul: 'gorusmeler', grup: 'gunluk' },
  { id: 'takvim', isim: 'Takvim', Icon: Calendar, yol: '/takvim', modul: null, grup: 'gunluk' },
  { id: 'notlarim', isim: 'Notlarım', Icon: StickyNote, yol: '/notlarim', modul: null, grup: 'gunluk' },
  { id: 'destek', isim: 'Destek', Icon: LifeBuoy, yol: '/destek', modul: null, grup: 'gunluk' },
  {
    id: 'satislar',
    isim: 'Satışlar',
    Icon: ReceiptText,
    modul: 'musteriler',
    grup: 'satis',
    altMenu: [
      { id: 'kesif-liste', isim: 'Keşifler', yol: '/kesifler' },
      // Teklifler fiyat/kâr içerir: teknisyen, saha ekibi ve depo GÖREMEZ (mig 238).
      // sadeceTeklif → altMenu filtresinde teklifGorebilirMi ile değerlendirilir;
      // Keşifler (fiyatsız) sahada kalmaya devam eder.
      { id: 'teklif-liste', isim: 'Teklifler', yol: '/teklifler', sadeceTeklif: true },
      // 'Satış Faturaları' menüden KALDIRILDI (2026-07-15): fatura işleri tek
      // merkezden — Proforma Fatura — yürüyor (Faturalanan sekmesi: PDF +
      // satış kaydına git + müşteriye gönder). /satislar rotaları YAŞIYOR:
      // proforma detayındaki "Satış kaydına git", Teklifler'deki fatura rozeti
      // ve Müşteri Detay bağları oraya derin link veriyor.
    ],
  },
  // Onaylar — SADECE onay yetkilisi olanlar görür (admin dahil bypass yok).
  // Sipariş Onayı da buraya taşındı; eskiden 'musteriler' modüllü grupta
  // olduğu için herkes menüde görüyordu.
  {
    id: 'onaylar',
    isim: 'Onaylar',
    Icon: BadgeCheck,
    modul: '_onay_yetkisi',
    grup: 'satis',
    altMenu: [
      { id: 'teklif_onaylari',  isim: 'Teklif Onayı',  yol: '/teklif-onaylari' },
      { id: 'siparis_onaylari', isim: 'Sipariş Onayı', yol: '/siparis-onaylari' },
    ],
  },
  // Fatura Oluşturulacak — fatura yetkilisi (Abdullah) + adminler (mig 165).
  // Satıştan gelen numarasız fatura talepleri burada karşılanır.
  {
    id: 'fatura_talepleri',
    isim: 'Proforma Fatura',
    Icon: Receipt,
    modul: '_fatura_yetkisi',
    grup: 'satis',
    yol: '/fatura-talepleri',
  },
  // ── Tedarik Süreçleri — Sipariş takibi (SADECE ADMİN: tutar/kâr içerir) ──
  {
    id: 'tedarik_surecleri',
    isim: 'Sipariş Yönetimi',
    Icon: ShoppingCart,
    modul: 'musteriler',
    grup: 'tedarik',
    sadeceAdmin: true,
    altMenu: [
      { id: 'siparisler_tedarik', isim: 'Siparişler', yol: '/siparisler' },
      { id: 'kullanilan_malzemeler', isim: 'Kullanılan Malzemeler', yol: '/kullanilan-malzemeler' },
    ],
  },
  { id: 'demolar', isim: 'Demolar', Icon: Boxes, yol: '/demolar', modul: 'demolar', grup: 'satis' },
  {
    id: 'stok',
    isim: 'Stok',
    Icon: Package,
    modul: 'stok',
    grup: 'operasyon',
    altMenu: [
      { id: 'stok-kartlar', isim: 'Stok Kartları', yol: '/stok' },
      { id: 'stok-hareketler', isim: 'Stok Hareketleri', yol: '/stok-hareketleri' },
      { id: 'stok-opsiyon', isim: 'Stok Opsiyonları', yol: '/stok-opsiyon' },
      { id: 'stok-kritik', isim: 'Kritik Seviye', yol: '/stok-kritik' },
      { id: 'stok-sayim', isim: 'Sayım', yol: '/stok-sayim' },
      { id: 'depo-raporlar', isim: 'Depo Raporları', yol: '/depo-raporlar' },
      { id: 'bagimsiz-sn', isim: 'Bağımsız SN Etiketleri', yol: '/bagimsiz-sn' },
    ],
  },
  { id: 'trassir', isim: 'Trassir Lisanslar', Icon: KeyRound, yol: '/trassir-lisanslar', modul: 'lisanslar', grup: 'operasyon' },
  {
    id: 'servis',
    isim: 'Servis',
    Icon: Wrench,
    modul: 'servis_talepleri',
    grup: 'operasyon',
    altMenu: [
      // ⭐ 17.08 — Bu menü artık YALNIZ İÇ SERVİS AKIŞI:
      //   • "Müşteri Talepleri" → Müşteri Portalı grubuna taşındı (ham gelen iş)
      //   • "Müşteri Memnuniyeti" → aynı gruba taşındı (müşteri geri bildirimi)
      // Kalanlar ekibin kendi işlettiği kuyruk ve çıktılar.
      { id: 'servis_talepleri', isim: 'Servis Talepleri',   yol: '/servis-talepleri' },
      { id: 'servis_raporlari', isim: 'Servis Raporları',   yol: '/servis-raporlari' },
      // Sahaya takılı cihazların toplu görünümü (13.08) — eskiden tek yol
      // müşteri detayındaki bölümdü, müşteri müşteri gezmek gerekiyordu
      { id: 'saha_cihazlari',   isim: 'Saha Cihazları',      yol: '/saha-cihazlari' },
    ],
  },
  { id: 'kargolar', isim: 'Kargo Takip', Icon: Truck, yol: '/kargolar', modul: null, grup: 'operasyon' },
  // Bridge Talepleri — Başakşehir Belediyesi entegrasyonu (Seçenek A: ayrı menü).
  // lucide 'Landmark' ikonu; RLS zaten staff-only, menü tüm personele açık.
  { id: 'bridge_talepleri', isim: 'Bridge Talepleri', Icon: Landmark, yol: '/bridge-talepleri', modul: null, grup: 'operasyon' },

  // ── MÜŞTERİ PORTALI (17.08) ────────────────────────────────────────────────
  // Portal talepleri BURADA, Servis Talepleri'nde DEĞİL (kullanıcı kararı):
  // gelen ham taleptir, önce bakılır ve ekibe yönlendirilir. Servis Talepleri
  // ise zaten işlenmiş/atanmış işin listesi — ikisi karışırsa triyaj bozulur.
  // ⚠️ Aynı sayfa, farklı kapsam: ?kaynak=musteri. Rozeti de ayrı sayılır.
  { id: 'portal_talepleri', isim: 'Portal Talepleri', Icon: Inbox, yol: '/servis-talepleri?kaynak=musteri', modul: 'servis_talepleri', grup: 'portal' },
  // Memnuniyet = müşterinin bize verdiği not; iç servis akışı değil, müşteriyle
  // olan ilişkinin çıktısı. Bu yüzden Servis'ten buraya taşındı (17.08).
  { id: 'memnuniyet', isim: 'Müşteri Memnuniyeti', Icon: Star, yol: '/memnuniyet', modul: 'servis_talepleri', grup: 'portal' },
  { id: 'portal_kullanicilar', isim: 'Portal Kullanıcıları', Icon: Users, yol: '/portal-kullanicilar', modul: 'kullanici_yonetimi', grup: 'portal' },
  // Bakım — Servis'ten TAMAMEN AYRI menü grubu (toplu bakım operasyonu)
  { id: 'bakim_isleri', isim: 'Bakım İşleri', Icon: Wrench, yol: '/bakim-isleri', modul: null, grup: 'bakim' },
  { id: 'mobiltek', isim: 'Araç Takip (Mobiltek)', Icon: Truck, yol: '/mobiltek', modul: 'arac_takip', grup: 'filo' },
  { id: 'dokuman_merkezi', isim: 'Doküman Merkezi', Icon: FolderOpen, yol: '/dokuman-merkezi', modul: null, grup: 'operasyon' },
  { id: 'dokumanlarim', isim: 'Dokümanlarım', Icon: FolderOpen, yol: '/dokumanlarim', modul: null, grup: 'operasyon' },
  {
    id: 'raporlar',
    isim: 'Raporlar',
    Icon: BarChart3,
    modul: 'raporlar',
    grup: 'yonetim',
    altMenu: [
      { id: 'raporlar-liste', isim: 'Raporlar', yol: '/raporlar' },
      { id: 'rapor-merkezi',  isim: 'Rapor Merkezi', yol: '/rapor-merkezi' },
      { id: 'teklif-cikti-kayitlari', isim: 'Teklif Çıktı Kayıtları', yol: '/teklif-cikti-kayitlari' },
    ],
  },
  // Sohbet: sidebar'dan kaldirildi, sag alt FloatingSohbetButton ile erisilir
  { id: 'sabah_ozeti', isim: 'Günlük Özet', Icon: Sun, yol: '/gunluk-ozet', modul: 'kullanici_yonetimi', grup: 'yonetim', sadeceSabahOzeti: true },
  { id: 'sozlesmeler', isim: 'Sözleşmeler', Icon: FileSignature, yol: '/sozlesmeler', modul: 'kullanici_yonetimi', grup: 'yonetim' },
  // Sözleşme Arşivi: muhasebe de görür (Abdullah) — 'yonetim' grup kuralından
  // ÖNCE değerlendirilir, yoksa yonetimErisimi'ne takılıp menüden düşerdi.
  { id: 'sozlesme_arsivi', isim: 'Sözleşme Arşivi', Icon: Archive, yol: '/sozlesme-arsivi', modul: null, grup: 'yonetim', sadeceSozlesmeArsiv: true },
  // İK Yönetimi: yonetim grubunda ama erişim ikGorebilirMi ile (Abdullah + admin) —
  // grup 'yonetim' filtresinden ÖNCE sadeceIK bayrağıyla değerlendirilir
  { id: 'ik_yonetim', isim: 'İK Yönetimi', Icon: Wallet, yol: '/ik-yonetim', modul: null, grup: 'yonetim', sadeceIK: true },
  // Mesai Raporu — saha ekiplerinin QR mesai saatleri (günlük/haftalık/aylık).
  // İK yetkilileri (Ali/Oğuz/Abdullah) + Ferdi; App.jsx MesaiRaporGuard ile paralel.
  { id: 'mesai_raporu', isim: 'Çalışma Saatleri', Icon: Timer, yol: '/mesai-raporu', modul: null, grup: 'yonetim', sadeceMesaiRapor: true },
  // Kişisel özlük alanı — Dokümanlarım'ın yanında (kullanıcı kararı: GÜNLÜK'te değil)
  // Kişisel sayfa: HERKES kendi izin/bordrosunu görür → grup 'operasyon', modul null.
  // İK yetkilisinde (Abdullah + admin) 'yonetim' grubuna, İK Yönetimi'nin yanına taşınır
  // (grupIK). DİKKAT: statik grup 'yonetim' YAPILMAZ — filtrede 'yonetim' grubu yalnız
  // Oğuz/Ali/Ferdi'ye açık, o zaman normal personelde sayfa kaybolurdu.
  { id: 'izin_bordro', isim: 'İzin & Bordro', Icon: CalendarCheck, yol: '/izin-bordro', modul: null, grup: 'operasyon', grupIK: 'yonetim' },
  // Personel ekleme/çıkarma + modül yetkileri. Eski adı "Kullanıcılar" idi;
  // kullanıcı personel eklemeyi burada bulamadığı için adı netleştirildi (27.07).
  // İK bloğunun (İK Yönetimi > Mesai Raporu > İzin & Bordro) hemen ardında.
  { id: 'kullanici_yonetimi', isim: 'Personel Yönetimi', Icon: UserCog, yol: '/kullanici-yonetimi', modul: 'kullanici_yonetimi', grup: 'yonetim' },
  { id: 'sozlesme_onaylari', isim: 'Sözleşme Onayları', Icon: ShieldCheck, yol: '/sozlesme-onaylari', sadeceYonetim: true, grup: 'yonetim' },
  { id: 'duyurular', isim: 'Duyurular', Icon: Megaphone, yol: '/duyurular', modul: 'kullanici_yonetimi', grup: 'yonetim', sadeceOguz: true },
  { id: 'performans', isim: 'Performans', Icon: Activity, yol: '/performans', modul: 'kullanici_yonetimi', grup: 'yonetim' },
  { id: 'sla_ayarlari', isim: 'SLA Ayarları', Icon: Timer, yol: '/sla-ayarlari', modul: 'kullanici_yonetimi', grup: 'yonetim' },
  { id: 'arac_yonetimi', isim: 'Araçlar', Icon: Car, yol: '/arac-yonetimi', modul: 'kullanici_yonetimi', grup: 'filo' },
  { id: 'filo_bakim', isim: 'Araç Bakımları', Icon: Wrench, yol: '/filo/bakim', modul: 'arac_takip', grup: 'filo' },
  { id: 'filo_belgeler', isim: 'Araç Belgeleri', Icon: FileCheck, yol: '/filo/belgeler', modul: 'arac_takip', grup: 'filo' },
  { id: 'filo_yakit', isim: 'Yakıt Fişleri', Icon: Fuel, yol: '/filo/yakit', modul: 'arac_takip', grup: 'filo' },
  { id: 'filo_surucu', isim: 'Sürücüler', Icon: UserCog, yol: '/filo/surucu', modul: 'arac_takip', grup: 'filo' },
]

const durumRenkleri = {
  cevrimici: 'var(--success)',
  mesgul: 'var(--danger)',
  disarida: 'var(--warning)',
  toplantida: 'var(--brand-primary)',
  cevrimdisi: 'var(--text-tertiary)',
}

const durumIsimleri = {
  cevrimici: 'Çevrimiçi',
  mesgul: 'Meşgul',
  disarida: 'Dışarıda',
  toplantida: 'Toplantıda',
  cevrimdisi: 'Çevrimdışı',
}

const bildirimTipIcon = {
  bilgi:   { C: Info,           color: 'var(--info)' },
  basari:  { C: CheckCircle2,   color: 'var(--success)' },
  uyari:   { C: AlertTriangle,  color: 'var(--warning)' },
  hata:    { C: XCircle,        color: 'var(--danger)' },
}

const sayfaIsimleri = {
  '/dashboard': 'Panel',
  '/musteriler': 'Müşteriler',
  '/bayiler': 'Bayiler',
  '/gorevler': 'Görevler',
  '/gorusmeler': 'Görüşmeler',
  '/stok': 'Stok Kartları',
  '/stok-hareketleri': 'Stok Hareketleri',
  '/stok-opsiyon': 'Stok Opsiyonları',
  '/stok-kritik': 'Kritik Seviye',
  '/stok-sayim': 'Sayım',
  '/depo-raporlar': 'Depo Raporları',
  '/teklifler': 'Teklifler',
  '/siparisler': 'Siparişler',
  '/satislar': 'Satış Faturaları',
  '/fatura-talepleri': 'Proforma Fatura',
  '/kesifler': 'Keşifler',
  '/gunluk-ozet': 'Günlük Özet',
  '/izin-bordro': 'İzin & Bordro',
  '/ik-yonetim': 'İK Yönetimi',
  '/mesai-raporu': 'Çalışma Saatleri',
  '/sozlesmeler': 'Sözleşmeler',
  '/sozlesme-arsivi': 'Sözleşme Arşivi',
  '/trassir-lisanslar': 'Trassir Lisanslar',
  '/servis-talepleri': 'Servis Talepleri',
  '/bridge-talepleri': 'Bridge Talepleri',
  '/bakim-isleri': 'Bakım İşleri',
  '/raporlar': 'Raporlar',
  '/chat': 'Sohbet',
  '/kullanici-yonetimi': 'Personel Yönetimi',
  '/sla-ayarlari': 'SLA Ayarları',
  '/performans': 'Personel Performansı',
  '/profil': 'Profilim',
}

function MainLayout({ children }) {
  const { kullanici, cikisYap, durumGuncelle } = useAuth()
  const { okunmamis } = useChat()
  const { bildirimler, benimBildirimlerim, okunmamisSayisi, bildirimOku, tumunuOku, bildirimSil,
          topluSil, bildirimSayilari } = useBildirim()
  // ⭐ 17.08 — İKİ AYRI KUYRUK, İKİ AYRI ROZET (kullanıcı kararı):
  // portal talepleri Servis Talepleri listesinde görünmüyor, dolayısıyla onun
  // rozetine de GİRMEZ. Portal kuyruğunun rozeti "Müşteri Portalı > Portal
  // Talepleri" öğesindedir.
  // ⚠️ Kural: rozet, tıklanınca açılan listenin kapsamıyla AYNI olmalı —
  //    bu uyuşmazlık projede en sık tekrar eden arayüz hatası.
  // Eski bildirimlerde meta.kaynak yoksa 'personel' kabul edilir.
  const _servisTalepBildirimleri = (bildirimler || []).filter(b => !b.okundu && b.tip === 'servis_talebi')
  const personelTalepOkunmamis = _servisTalepBildirimleri.filter(b => (b.meta?.kaynak || 'personel') !== 'musteri').length
  const portalTalepOkunmamis   = _servisTalepBildirimleri.filter(b => b.meta?.kaynak === 'musteri').length
  // Görev bildirimleri (atama + yorum + @etiket) — Görevler menüsünde sayı rozeti.
  // link '/gorevler/...' olan her okunmamış bildirim modüle sayılır (mention'lar dahil).
  const gorevBildirimleri = (bildirimler || []).filter(b =>
    !b.okundu && (
      b.tip === 'gorev' ||
      /görev atandı/i.test(b.baslik || '') ||
      (b.link || '').startsWith('/gorevler')
    )
  )
  const gorevOkunmamis = gorevBildirimleri.length
  // Görüşme bildirimleri (@etiket + yorum) — Görüşmeler menüsünde sayı rozeti
  const gorusmeBildirimleri = (bildirimler || []).filter(b =>
    !b.okundu && (b.tip === 'gorusme' || (b.link || '').startsWith('/gorusmeler'))
  )
  const gorusmeOkunmamis = gorusmeBildirimleri.length
  const navigate = useNavigate()
  const location = useLocation()

  // Kritik stok rozeti — min_stok altına düşen ürün sayısı. Mount'ta + 5 dk'da
  // bir tazelenir; stok sayfalarından çıkınca da tazelenir (düzeltme yapılmıştır).
  const [kritikStokSayi, setKritikStokSayi] = useState(0)
  useEffect(() => {
    let iptal = false
    const tazele = () => {
      kritikSeviyeSayisi()
        .then(n => { if (!iptal) setKritikStokSayi(n || 0) })
        .catch(() => {})
    }
    tazele()
    const timer = setInterval(tazele, 5 * 60 * 1000)
    return () => { iptal = true; clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname.startsWith('/stok')])

  // Grup açık/kapalı — localStorage'da kalıcı, ELLE yapılan seçimleri tutar.
  //
  // ⚠️ VARSAYILAN DEĞİŞTİ (14.08): eskiden "hepsi açık" idi, 45 satırlık liste
  // taşıyordu; kullanıcılar hepsini kapatınca da menü tamamen bilgisiz kalıyordu
  // (bekleyen iş rozetleri kapalı grubun içinde kayboluyordu). Yeni kural:
  // AKTİF SAYFANIN GRUBU AÇIK, diğerleri kapalı. Kullanıcı elle açar/kapatırsa
  // tercihi kaydedilir ve varsayılanı ezer.
  //
  // Eski 'sidebarGrupKapali' anahtarı BİLEREK okunmuyor: ters semantikte (kapalı=true)
  // ve çoğu kullanıcıda "hepsi kapalı" yazılı — taşınsa herkes boş menüyle açardı.
  const [grupDurum, setGrupDurum] = useState(() => {
    try {
      const raw = localStorage.getItem('sidebarGrupDurum')
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  })
  const grupToggle = (id, suAndaAcik) => {
    setGrupDurum(prev => {
      const yeni = { ...prev, [id]: !suAndaAcik }
      try { localStorage.setItem('sidebarGrupDurum', JSON.stringify(yeni)) } catch { /* kota/gizli mod — menü yine çalışır */ }
      return yeni
    })
  }
  // Grubun elle seçimini SİL → "aktif grup açık" varsayılanına döner.
  // Aramayla bir sayfaya gidildiğinde kullanılır: kullanıcı o grubu daha önce
  // kapatmışsa, gittiği sayfa yine görünmez kalırdı.
  const grupVarsayilanaDon = (id) => {
    setGrupDurum(prev => {
      if (!(id in prev)) return prev
      const yeni = { ...prev }
      delete yeni[id]
      try { localStorage.setItem('sidebarGrupDurum', JSON.stringify(yeni)) } catch { /* kota/gizli mod — menü yine çalışır */ }
      return yeni
    })
  }

  // Menü araması — 45 sayfada doğru grubu hatırlamak zorunda kalmamak için.
  // Doluyken gruplar gizlenir, düz sonuç listesi çıkar.
  //
  // ⚠️ Ctrl+K kısayolu BİLEREK YOK: o kombinasyon App.jsx'teki Komut Paleti'nin
  // (müşteri/görev/teklif/stok KAYDI arar). İkisi farklı iş yapar — palet KAYIT
  // bulur, buradaki arama EKRAN bulur; aynı tuşa bağlanırsa ikisi de tetiklenir.
  const [menuAra, setMenuAra] = useState('')
  const menuAraRef = useRef(null)

  // Menü düzenleme modu — sürükle-bırak tutamakları YALNIZ burada görünür.
  const [duzenModu, setDuzenModu] = useState(false)
  // Alt menü açık/kapalı — gruplarla AYNI mantık: kullanıcının elle seçimi varsa
  // o geçerli, yoksa "içinde bulunduğun sayfanın başlığı açık".
  //
  // ⚠️ Eskiden yedi ayrı state vardı (stokAcik, servisAcik…) ve hepsi YALNIZ
  // mount'ta location'a bakıyordu. MainLayout tüm oturum boyunca mount kaldığı
  // için, uygulama içinde bir alt sayfaya gidildiğinde (panelden link, bildirim,
  // arama) başlık KAPALI kalıyordu: kullanıcı hangi sayfada olduğunu menüde
  // göremiyor, kardeş sayfalara geçemiyordu.
  const [altDurum, setAltDurum] = useState({})
  const [cikisYapiliyor, setCikisYapiliyor] = useState(false)
  const [durumMenuAcik, setDurumMenuAcik] = useState(false)
  const [bildirimPanelAcik, setBildirimPanelAcik] = useState(false)
  const [temaPaneliAcik, setTemaPaneliAcik] = useState(false)
  const [temizleniyor, setTemizleniyor] = useState(false)

  /**
   * Bildirimleri toplu sil. Panel yalnız son 20 kaydı gösterdiği için onay
   * ekranındaki sayı DB'den okunur — bellekteki liste gerçek hacmi yansıtmaz
   * (canlıda bir kullanıcıda 886 bildirim var, panelde 20 görünüyor).
   */
  const topluTemizle = async (sadeceOkunan) => {
    if (temizleniyor) return
    setTemizleniyor(true)
    try {
      const { toplam, okunan, okunmamis } = await bildirimSayilari()
      const adet = sadeceOkunan ? okunan : toplam
      if (adet === 0) {
        window.alert(sadeceOkunan ? 'Silinecek okunmuş bildirim yok.' : 'Silinecek bildirim yok.')
        return
      }
      const mesaj = sadeceOkunan
        ? `${okunan} okunmuş bildirim silinecek.${okunmamis > 0 ? ` ${okunmamis} okunmamış bildirim korunacak.` : ''}\n\nDevam edilsin mi?`
        : `${toplam} bildirimin TAMAMI silinecek${okunmamis > 0 ? ` (${okunmamis} tanesi henüz okunmamış)` : ''}.\n\nBu işlem geri alınamaz. Devam edilsin mi?`
      if (!window.confirm(mesaj)) return

      const { ok, silinen } = await topluSil(sadeceOkunan)
      if (!ok) window.alert('Bildirimler silinemedi. Lütfen tekrar deneyin.')
      else if (silinen > 0) setBildirimPanelAcik(false)
    } finally {
      setTemizleniyor(false)
    }
  }
  const sayfaGirisZamani = useRef(null)
  const oncekiSayfa = useRef(null)

  // Aktivite logu artık DB tabanlı (mig 181) ve SAYFA takibi tek yerde:
  // AktiviteContext. MainLayout yalnız giriş/çıkış olayını yazar; buradaki
  // eski localStorage + sayfa-takip useEffect'i (AktiviteContext ile ÇİFT
  // kayıt üretiyordu) kaldırıldı.
  const logKaydet = (tip, veri = {}) => {
    if (!kullanici) return
    aktiviteLogEkle({
      kullaniciId: kullanici.id,
      kullaniciAd: kullanici.ad,
      tip,
      sayfa: veri.sayfa ?? null,
      sureSaniye: veri.sureSaniye ?? null,
      aciklama: veri.aciklama ?? null,
    })
  }

  // Görevler/Görüşmeler sayfasına girildiğinde o modülün bildirimleri okundu
  // işaretlenir (rozet düşsün) — kullanıcı gördü demektir.
  useEffect(() => {
    if (location.pathname.startsWith('/gorevler') && gorevBildirimleri.length > 0) {
      gorevBildirimleri.forEach(b => bildirimOku?.(b.id))
    }
    if (location.pathname.startsWith('/gorusmeler') && gorusmeBildirimleri.length > 0) {
      gorusmeBildirimleri.forEach(b => bildirimOku?.(b.id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, gorevBildirimleri.length, gorusmeBildirimleri.length])

  const handleCikis = async () => {
    // Çift tıklama koruması + anlık geri bildirim: çıkış birkaç yüz ms sürebilir
    // (sunucuya haber verilir). Eskiden buton hiçbir tepki vermediği için
    // kullanıcı "tıkladım olmadı" diye üst üste basıyordu.
    if (cikisYapiliyor) return
    setCikisYapiliyor(true)
    if (kullanici) {
      if (oncekiSayfa.current && sayfaGirisZamani.current) {
        const sure = Math.round((Date.now() - sayfaGirisZamani.current) / 1000)
        if (sure > 2) logKaydet('sayfa_cikis', { sayfa: oncekiSayfa.current, sureSaniye: sure })
      }
      logKaydet('kullanici_cikis', { aciklama: 'Sistemden çıkış yapıldı' })
    }
    try {
      await cikisYap()
    } catch (e) {
      console.warn('[handleCikis] cikisYap hata:', e)
    } finally {
      // finally: cikisYap beklenmedik bir hata fırlatsa bile kullanıcı ekranda
      // kilitli kalmasın, login'e mutlaka gitsin.
      navigate('/login', { replace: true })
      setCikisYapiliyor(false)
    }
  }

  // 'Yönetim' grubu (Raporlar, Kullanıcılar, Duyurular, Performans, SLA Ayarları)
  // sadece Ali ve Oğuz'a açık — admin rolü olsa bile başka biri göremez.
  // İsim eşleşmesi TR karakter ve büyük/küçük harf duyarsız.
  const _adLc = (kullanici?.ad || '').toLocaleLowerCase('tr')
  const yonetimErisimi = /\b(oğuz|oguz|ali|ferdi)\b/i.test(_adLc)
  const oguzMu = /\b(oğuz|oguz)\b/i.test(_adLc)

  // Admin tüm modülleri görür (moduller listesi ne olursa olsun) — hariç 'yonetim' grubu.
  const gorunenMenuRaw = menuItems.filter((m) => {
    if (m.sadeceOguz) return oguzMu
    // Sözleşme Onayları: App.jsx YonetimGuard ile AYNI kural (Ali/Oğuz/Ferdi)
    if (m.sadeceYonetim) return /\b(oğuz|oguz|ali|ferdi)\b/i.test(_adLc)
    // İK Yönetimi: Abdullah (ik_yonetim modülü) + admin — grup 'yonetim' kuralından ÖNCE
    if (m.sadeceIK) return ikGorebilirMi(kullanici)
    // Mesai Raporu: İK yetkilileri + Ferdi — 'yonetim' grup kuralından ÖNCE
    // (Abdullah personel rolünde, yonetimErisimi'ne takılırdı)
    if (m.sadeceMesaiRapor) return mesaiRaporuGorebilirMi(kullanici)
    // Sözleşme Arşivi: muhasebe/fatura yetkilisi + yönetim — App.jsx
    // SozlesmeArsivGuard ile AYNI kaynak: sozlesmeArsiviGorebilirMi
    if (m.sadeceSozlesmeArsiv) return sozlesmeArsiviGorebilirMi(kullanici)
    // Sipariş Yönetimi: admin + izinli istisnalar (App.jsx AdminGuard ile paralel)
    if (m.sadeceAdmin) return siparisYonetimiGorebilirMi(kullanici)
    // Sabah Özeti: sadece Ali Uğur (id 1) + Oğuz (id 2) — App.jsx SabahOzetiGuard ile paralel
    if (m.sadeceSabahOzeti) return [1, 2].includes(Number(kullanici?.id))
    // Onay menüleri: yetki bayrağı ŞART — admin rolü bile bypass edemez
    // (Ferdi admin ama onay yetkisi yok; sadece Ali/Oğuz/Ahmet görür)
    if (m.modul === '_onay_yetkisi') return !!(kullanici?.siparisOnayYetkilisi || kullanici?.teklifOnayYetkilisi)
    if (m.modul === '_siparis_onay_yetkilisi') return !!kullanici?.siparisOnayYetkilisi
    // Fatura kuyruğu — App.jsx FaturaYetkiGuard ile AYNI kaynak (faturaYetkisi)
    if (m.modul === '_fatura_yetkisi') return faturaYetkisi(kullanici)
    if (m.grup === 'yonetim') return yonetimErisimi
    // Filo grubu: yönetim erişimi + izinli istisnalar (Ahmet Agun, Abdullah İğde)
    if (m.grup === 'filo') return filoGorebilirMi(kullanici)
    return m.modul === null
      || kullanici?.rol === 'admin'
      || (m.modul === '_siparis_onay_yetkilisi' && kullanici?.siparisOnayYetkilisi)
      || (m.modul === '_onay_yetkisi' && (kullanici?.siparisOnayYetkilisi || kullanici?.teklifOnayYetkilisi))
      || kullanici?.moduller?.includes(m.modul)
  }).map((m) => {
    // Alt menü içi yetki filtresi — şimdilik yalnız 'sadeceTeklif' (Teklifler).
    // Üst başlık görünür kalıyor ama yetkisiz alt madde düşüyor; hepsi düşerse
    // üst başlık da kaybolur.
    if (!m.altMenu) return m
    const alt = m.altMenu.filter(a => !a.sadeceTeklif || teklifGorebilirMi(kullanici))
    if (alt.length === m.altMenu.length) return m
    return alt.length ? { ...m, altMenu: alt } : null
  }).filter(Boolean)

  // Kullanıcı bazlı menü sıralaması (drag-drop ile yeniden sıralanabilir)
  const { siralanmis: gorunenMenu, yenidenSirala, ozellestirildiMi, sifirla: menuSifirla } =
    useMenuSiralama(gorunenMenuRaw, kullanici?.id)

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const dragSonu = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = gorunenMenu.findIndex(m => m.id === active.id)
    const newIndex = gorunenMenu.findIndex(m => m.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const newOrder = arrayMove(gorunenMenu, oldIndex, newIndex).map(m => m.id)
    yenidenSirala(newOrder)
  }

  // altAktif: bu başlığın alt sayfalarından biri şu an açık mı (render'da hesaplanır)
  const menuAcik = (id, altAktif) => (id in altDurum ? altDurum[id] : !!altAktif)

  const menuToggle = (id, suAndaAcik) => setAltDurum(p => ({ ...p, [id]: !suAndaAcik }))

  // Elle seçimi SİL → "aktif başlık açık" varsayılanına döner. Arama sonucundan
  // bir alt sayfaya gidilince kullanılır: kullanıcı o başlığı daha önce kapatmış
  // olsa bile gittiği sayfa menüde görünür.
  const menuAc = (id) => setAltDurum(p => {
    if (!(id in p)) return p
    const yeni = { ...p }
    delete yeni[id]
    return yeni
  })

  const sayfaBasligi = () => {
    if (location.pathname === '/dashboard') return 'Panel'
    if (location.pathname === '/musteriler') return 'Müşteriler'
    if (location.pathname.startsWith('/musteriler/')) return 'Müşteri Detayı'
    if (location.pathname === '/bayiler') return 'Bayiler'
    if (location.pathname.startsWith('/bayiler/')) return 'Bayi Detayı'
    if (location.pathname === '/stok') return 'Stok Kartları'
    if (location.pathname === '/stok-hareketleri') return 'Stok Hareketleri'
    if (location.pathname === '/stok-opsiyon') return 'Stok Opsiyonları'
    if (location.pathname === '/stok-kritik') return 'Kritik Seviye'
    if (location.pathname === '/stok-sayim') return 'Sayım'
    if (location.pathname === '/depo-raporlar') return 'Depo Raporları'
    if (location.pathname === '/trassir-lisanslar') return 'Trassir Lisanslar'
    if (location.pathname === '/teklifler') return 'Teklifler'
    if (location.pathname.startsWith('/teklifler/')) return 'Teklif Detayı'
    if (location.pathname === '/satislar') return 'Satış Faturaları'
    if (location.pathname.startsWith('/satislar/')) return 'Fatura Detayı'
    if (location.pathname === '/servis-talepleri') return 'Servis Talepleri'
    if (location.pathname === '/servis-talepleri/yeni') return 'Yeni Servis Talebi'
    if (location.pathname.startsWith('/servis-talepleri/')) return 'Servis Talep Detayı'
    if (location.pathname === '/chat') return 'Sohbet'
    if (location.pathname === '/profil') return 'Profilim'
    if (location.pathname.startsWith('/firma-gecmisi/')) return 'Firma Geçmişi'
    if (location.pathname === '/demolar/yeni') return 'Yeni Demo Cihazı'
    if (location.pathname.endsWith('/duzenle') && location.pathname.startsWith('/demolar/')) return 'Cihaz Düzenle'
    // ⚠️ ALT MENÜ öğeleri de taranır: eskiden yalnız üst seviye (altMenu'süz)
    // öğelere bakılıyordu, bu yüzden Teklif Onayları / Rapor Merkezi gibi alt
    // menüdeki sayfalarda üst bar BOŞ kalıyordu (10.08).
    // Eşleşme tam yol ya da yol + '/' — düz startsWith, '/stok-hareketleri'ni
    // '/stok' ile eşleştirip yanlış başlık basıyordu. En UZUN eşleşme kazanır.
    const adaylar = []
    for (const m of gorunenMenu) {
      if (m.altMenu) { for (const a of m.altMenu) if (a.yol) adaylar.push(a) }
      else if (m.yol) adaylar.push(m)
    }
    const bulunan = adaylar
      .filter(m => m.yol !== '/dashboard'
        && (location.pathname === m.yol || location.pathname.startsWith(m.yol + '/')))
      .sort((a, b) => b.yol.length - a.yol.length)[0]
    return bulunan?.isim || ''
  }

  const mevcutDurum = kullanici?.durum || 'cevrimici'

  const bildirimTikla = (b) => {
    bildirimOku(b.id)
    if (b.link) navigate(b.link)
    setBildirimPanelAcik(false)
  }

  const zamanFormat = (tarih) => {
    if (!tarih) return ''
    const t = new Date(tarih).getTime()
    if (isNaN(t)) return ''
    const fark = Date.now() - t
    if (fark < 0) return 'Az önce'
    const dk = Math.floor(fark / 60000)
    const saat = Math.floor(dk / 60)
    const gun = Math.floor(saat / 24)
    if (dk < 1) return 'Az önce'
    if (dk < 60) return `${dk} dk önce`
    if (saat < 24) return `${saat} saat önce`
    return `${gun} gün önce`
  }

  const profilFoto = localStorage.getItem(`profil_foto_${kullanici?.id}`)

  // ─────────── Sidebar rozetleri — TEK KAYNAK ───────────
  // Rozet sayısı menü id'sinden okunur; böylece aynı sayı hem alt maddede, hem
  // (kapalıyken) üst başlıkta, hem (grup kapalıyken) grup etiketinde gösterilebilir.
  // ⚠️ Eskiden her rozet kendi render dalına gömülüydü: grup kapatılınca bekleyen
  // iş TAMAMEN görünmez oluyordu. Toplama mantığı bu kaybı kapatır.
  const rozetSayisi = (id) => {
    if (id === 'servis_talepleri') return personelTalepOkunmamis
    if (id === 'portal_talepleri') return portalTalepOkunmamis
    if (id === 'stok-kritik') return kritikStokSayi
    if (id === 'gorevler') return gorevOkunmamis
    if (id === 'gorusmeler') return gorusmeOkunmamis
    if (id === 'chat') return okunmamis
    return 0
  }
  // Dikkat çekmesi gereken (nabız atan) rozetler — bildirim kaynaklı olanlar.
  const nabizliRozet = (id) => id === 'gorevler' || id === 'gorusmeler'
  const ogeRozetToplam = (item) =>
    rozetSayisi(item.id) + (item.altMenu || []).reduce((t, a) => t + rozetSayisi(a.id), 0)

  // grupIK: İK yetkilisinde öğe farklı gruba düşer (İzin & Bordro → Yönetim).
  // Filtre aşaması statik m.grup ile çalıştığı için burada, RENDER'da uygulanır.
  const ikYetkiliMi = ikGorebilirMi(kullanici)
  const etkinGrup = (m) => (ikYetkiliMi && m.grupIK) ? m.grupIK : (m.grup || 'gunluk')

  // Aktif sayfanın menü öğesi — en UZUN yol eşleşmesi kazanır ('/stok-hareketleri'
  // düz startsWith ile '/stok'a da uyar, kısa olan yanlış grubu açardı).
  const aktifOge = (() => {
    let enIyi = null
    for (const m of gorunenMenu) {
      const yollar = m.altMenu ? m.altMenu.map(a => a.yol) : (m.yol ? [m.yol] : [])
      for (const ham of yollar) {
        if (!ham) continue
        const p = ham.split('?')[0]
        const eslesti = p === '/dashboard'
          ? location.pathname === '/dashboard'
          : (location.pathname === p || location.pathname.startsWith(p + '/'))
        if (eslesti && (!enIyi || p.length > enIyi.uzunluk)) enIyi = { item: m, uzunluk: p.length }
      }
    }
    return enIyi?.item || null
  })()
  // ⚠️ Menüde KARŞILIĞI OLMAYAN sayfalar var (/profil, /bildirimler, davet ekranları…).
  // Fallback olmazsa oralarda hiçbir grup "aktif" sayılmaz ve menü tamamen kapalı
  // açılırdı — tam da düzeltmeye çalıştığımız boş-menü hali. İlk gruba düşülür.
  const aktifGrupId = aktifOge ? etkinGrup(aktifOge) : (GRUPLAR[0]?.id ?? null)

  // Grup açık mı: kullanıcının elle seçimi varsa o, yoksa "aktif grup açık".
  // Düzen modunda HEPSİ açık — kapalı gruptaki öğe sürüklenemez.
  const grupAcikMi = (gid) =>
    duzenModu ? true : (gid in grupDurum ? grupDurum[gid] : gid === aktifGrupId)

  // Arama sonuçları — düz liste, hiyerarşi yok. Üst başlık adı da metne dahil
  // ("Stok › Kritik Seviye"), böylece hem "stok" hem "kritik" aynı sonucu bulur.
  const aramaSonuclari = (() => {
    const q = menuAra.trim()
    if (!q) return null
    const adaylar = []
    for (const m of gorunenMenu) {
      if (m.altMenu) {
        for (const a of m.altMenu) adaylar.push({ id: `${m.id}__${a.id}`, rozetId: a.id, ad: `${m.isim} › ${a.isim}`, yol: a.yol, item: m })
      } else if (m.yol) {
        adaylar.push({ id: m.id, rozetId: m.id, ad: m.isim, yol: m.yol, item: m })
      }
    }
    return adaylar.filter(a => trContains(a.ad, q)).slice(0, 12)
  })()

  // Arama sonucuna git: sayfaya geç + grubu ve üst başlığı AÇ, aramayı temizle.
  // Sadece navigate edilse hedef sayfa kapalı bir grubun/başlığın içinde kalır.
  const aramaGit = (s) => {
    grupVarsayilanaDon(etkinGrup(s.item))
    menuAc(s.item.id)
    navigate(s.yol)
    setMenuAra('')
  }

  // Grup başlıklarını menu listesine entrilaştır — item map'i içinde header vs item ayrımı yapılır.
  // useMenuSiralama tarafından döndürülen siparişi bozmadan grup bazında sıralar.
  const menuEntries = (() => {
    const gruplu = GRUPLAR.map(g => ({
      grup: g,
      items: gorunenMenu.filter(m => etkinGrup(m) === g.id),
    })).filter(g => g.items.length > 0)
    const result = []
    gruplu.forEach(g => {
      const acik = grupAcikMi(g.grup.id)
      const rozet = g.items.reduce((t, m) => t + ogeRozetToplam(m), 0)
      result.push({ type: 'header', id: `__hdr_${g.grup.id}`, grupId: g.grup.id, baslik: g.grup.baslik, acik, rozet })
      if (acik) g.items.forEach(item => result.push({ type: 'item', id: item.id, data: item }))
    })
    return result
  })()

  // ─────────────────────────── Render ───────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--surface-bg)' }}>

      {/* Sidebar */}
      <aside
        style={{
          width: 248,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          background: 'var(--surface-sidebar)',
          color: 'var(--text-on-dark-muted)',
        }}
      >
        {/* Brand */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: 16,
            borderBottom: '1px solid var(--border-on-dark)',
          }}
        >
          <img src="/logo.jpeg" alt="ZNA" style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', objectFit: 'contain', background: 'var(--surface-card)' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--text-on-dark)', font: '500 14px/20px var(--font-sans)', whiteSpace: 'nowrap' }}>ZNA Teknoloji</div>
            <div style={{ color: 'var(--text-on-dark-muted)', font: '400 12px/16px var(--font-sans)' }}>Yönetim sistemi</div>
          </div>
        </div>

        {/* User */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-on-dark)', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {profilFoto ? (
                <img
                  src={profilFoto}
                  alt="Profil"
                  onClick={() => navigate('/profil')}
                  style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' }}
                />
              ) : (
                <span onClick={() => navigate('/profil')} style={{ cursor: 'pointer', display: 'inline-flex' }}>
                  <Avatar name={kullanici?.ad} size="sm" onDark />
                </span>
              )}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <button
                onClick={() => navigate('/profil')}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  color: 'var(--text-on-dark)',
                  font: '500 14px/20px var(--font-sans)',
                  textAlign: 'left',
                  width: '100%',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                {kullanici?.ad}
              </button>
              <button
                onClick={() => setDurumMenuAcik(!durumMenuAcik)}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  color: durumRenkleri[mevcutDurum],
                  font: '400 12px/16px var(--font-sans)',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: durumRenkleri[mevcutDurum] }} />
                {durumIsimleri[mevcutDurum]}
                <ChevronDown size={12} strokeWidth={1.5} style={{ color: 'var(--text-on-dark-muted)' }} />
              </button>
            </div>
          </div>

          {durumMenuAcik && (
            <div
              style={{
                position: 'absolute',
                top: '100%', left: 16, right: 16,
                marginTop: 4,
                background: 'var(--surface-sidebar-active)',
                border: '1px solid var(--border-on-dark)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                zIndex: 'var(--z-dropdown)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              {Object.entries(durumIsimleri).map(([key, isim]) => (
                <button
                  key={key}
                  onClick={() => { durumGuncelle(key); setDurumMenuAcik(false) }}
                  style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 12px',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--text-on-dark)',
                    font: '400 14px/20px var(--font-sans)',
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: durumRenkleri[key], flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{isim}</span>
                  {mevcutDurum === key && <Check size={14} strokeWidth={2} style={{ color: 'var(--brand-primary)' }} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Menü arama + düzenleme düğmesi */}
        <div style={{ padding: '10px 10px 6px', display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{
            flex: 1, minWidth: 0,
            display: 'flex', alignItems: 'center', gap: 7, padding: '0 8px', height: 30,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--border-on-dark)',
            borderRadius: 'var(--radius-sm)',
          }}>
            <Search size={13} strokeWidth={1.8} style={{ color: 'var(--text-on-dark-muted)', flexShrink: 0 }} />
            <input
              ref={menuAraRef}
              value={menuAra}
              onChange={e => setMenuAra(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') { setMenuAra(''); e.currentTarget.blur() }
                // Enter → ilk sonuca git (arama kutusundan elini çekmeden)
                if (e.key === 'Enter' && aramaSonuclari?.length) {
                  aramaGit(aramaSonuclari[0]); e.currentTarget.blur()
                }
              }}
              placeholder="Menüde ara"
              aria-label="Menüde ara"
              style={{
                flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none',
                color: 'var(--text-on-dark)', font: '400 12px/16px var(--font-sans)',
              }}
            />
            {menuAra ? (
              <button
                onClick={() => { setMenuAra(''); menuAraRef.current?.focus() }}
                title="Aramayı temizle"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-on-dark-muted)', display: 'inline-flex', flexShrink: 0 }}
              >
                <X size={13} strokeWidth={2} />
              </button>
            ) : null}
          </div>
          <button
            onClick={() => { setDuzenModu(d => !d); setMenuAra('') }}
            title={duzenModu ? 'Menü düzenlemeyi bitir' : 'Menüyü düzenle (sıralama)'}
            aria-pressed={duzenModu}
            style={{
              width: 30, height: 30, flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: duzenModu ? 'var(--brand-primary)' : 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border-on-dark)',
              borderRadius: 'var(--radius-sm)',
              color: duzenModu ? '#fff' : 'var(--text-on-dark-muted)',
              cursor: 'pointer',
            }}
          >
            <SlidersHorizontal size={14} strokeWidth={1.8} />
          </button>
        </div>

        {duzenModu && (
          <div style={{
            margin: '0 10px 6px', padding: '7px 9px',
            background: 'rgba(30,90,168,0.16)',
            border: '1px solid rgba(30,90,168,0.45)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          }}>
            <span style={{ flex: 1, minWidth: 96, color: 'var(--text-on-dark)', font: '400 11px/15px var(--font-sans)' }}>
              Satırları sürükleyerek sıralayın
            </span>
            {ozellestirildiMi && (
              <button
                onClick={menuSifirla}
                style={{
                  background: 'transparent', border: '1px solid var(--border-on-dark)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--text-on-dark-muted)',
                  font: '400 11px/14px var(--font-sans)', padding: '3px 7px', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                <RotateCcw size={10} strokeWidth={1.8} />Sıfırla
              </button>
            )}
            <button
              onClick={() => setDuzenModu(false)}
              style={{
                background: 'var(--brand-primary)', border: 'none',
                borderRadius: 'var(--radius-sm)', color: '#fff',
                font: '500 11px/14px var(--font-sans)', padding: '4px 10px', cursor: 'pointer',
              }}
            >
              Bitti
            </button>
          </div>
        )}

        {/* Nav */}
        <nav aria-label="Ana menü" style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {aramaSonuclari ? (
            aramaSonuclari.length === 0 ? (
              <div style={{ padding: '14px 10px', color: 'var(--text-on-dark-muted)', font: '400 12px/17px var(--font-sans)' }}>
                “{menuAra}” için sonuç yok.
              </div>
            ) : aramaSonuclari.map(s => {
              const aktif = location.pathname === s.yol.split('?')[0]
              return (
                <button
                  key={s.id}
                  onClick={() => aramaGit(s)}
                  style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 9,
                    padding: '6px 10px', paddingLeft: 8,
                    borderRadius: 'var(--radius-sm)',
                    background: aktif ? 'var(--surface-sidebar-active)' : 'transparent',
                    color: aktif ? 'var(--text-on-dark)' : 'var(--text-on-dark-muted)',
                    border: 'none', borderLeft: `2px solid ${aktif ? 'var(--brand-primary)' : 'transparent'}`,
                    cursor: 'pointer', font: '400 13px/17px var(--font-sans)',
                  }}
                  onMouseEnter={e => { if (!aktif) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-on-dark)' } }}
                  onMouseLeave={e => { if (!aktif) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-on-dark-muted)' } }}
                >
                  <s.item.Icon size={16} strokeWidth={1.6} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.ad}</span>
                  <MenuRozet sayi={rozetSayisi(s.rozetId)} />
                </button>
              )
            })
          ) : (
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={dragSonu}>
          <SortableContext items={gorunenMenu.map(m => m.id)} strategy={verticalListSortingStrategy}>
          {menuEntries.map((entry, entryIdx) => {
            if (entry.type === 'header') {
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => grupToggle(entry.grupId, entry.acik)}
                  aria-expanded={entry.acik}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                    padding: entryIdx === 0 ? '4px 10px 3px' : '13px 10px 3px',
                    background: 'transparent', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                  title={entry.acik ? 'Grubu kapat' : 'Grubu aç'}
                >
                  {/* Grup etiketi GERİ ÇEKİLDİ (14.08): eskiden 800 ağırlık + marka
                      çubuğu + ayraç çizgisi ile ekranın en baskın elemanıydı —
                      tıklanamayan bir etiket, tıklanan sayfa adlarını bastırıyordu.
                      ⚠️ CSS uppercase KULLANMA: i→I yapar (FILO), Türkçe İ kaybolur. */}
                  <span style={{
                    flex: 1, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: 'rgba(230,236,242,0.42)',
                    font: '600 11px/15px var(--font-sans)',
                    letterSpacing: '0.07em',
                  }}>
                    {entry.baslik.toLocaleUpperCase('tr')}
                  </span>
                  {/* Grup kapalıyken bekleyen iş SAYISI etikete taşınır — yoksa
                      kapalı grubun içindeki rozetler tamamen görünmez olurdu. */}
                  {!entry.acik && (
                    <MenuRozet sayi={entry.rozet} baslik={`${entry.baslik}: ${entry.rozet} bekleyen`} />
                  )}
                  <ChevronRight
                    size={11}
                    strokeWidth={2}
                    style={{
                      color: 'rgba(230,236,242,0.3)',
                      transform: entry.acik ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 160ms ease',
                      flexShrink: 0,
                    }}
                  />
                </button>
              )
            }
            const item = entry.data
            if (item.altMenu) {
              const altAktif = item.altMenu.some(a => location.pathname === a.yol || location.pathname.startsWith(a.yol + '/'))
              const acik = menuAcik(item.id, altAktif)
              const kapaliAltRozet = item.altMenu.reduce((t, a) => t + rozetSayisi(a.id), 0)
              return (
                <SortableSatir id={item.id} key={item.id} duzenModu={duzenModu}>
                <div>
                  <button
                    onClick={() => menuToggle(item.id, acik)}
                    style={{
                      width: '100%',
                      display: 'flex', alignItems: 'center', gap: 9,
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: altAktif ? 'var(--surface-sidebar-active)' : 'transparent',
                      color: altAktif ? 'var(--text-on-dark)' : 'var(--text-on-dark-muted)',
                      border: 'none',
                      borderLeft: `2px solid ${altAktif ? 'var(--brand-primary)' : 'transparent'}`,
                      paddingLeft: 8,
                      cursor: 'pointer',
                      textAlign: 'left',
                      font: altAktif ? '500 13px/17px var(--font-sans)' : '400 13px/17px var(--font-sans)',
                      transition: 'background 120ms, color 120ms',
                    }}
                    onMouseEnter={e => { if (!altAktif) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-on-dark)' } }}
                    onMouseLeave={e => { if (!altAktif) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-on-dark-muted)' } }}
                  >
                    <item.Icon size={16} strokeWidth={1.6} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.isim}</span>
                    {/* Kapalıyken alt maddelerin rozetleri üst başlığa toplanır —
                        eskiden yalnız 'Servis'te kırmızı nokta vardı, sayı yoktu. */}
                    {!acik && <MenuRozet sayi={kapaliAltRozet} />}
                    {acik
                      ? <ChevronDown size={12} strokeWidth={1.8} style={{ flexShrink: 0, opacity: 0.6 }} />
                      : <ChevronRight size={12} strokeWidth={1.8} style={{ flexShrink: 0, opacity: 0.6 }} />}
                  </button>
                  {acik && (
                    <div style={{ marginLeft: 25, borderLeft: '1px solid var(--border-on-dark)', paddingLeft: 6, display: 'flex', flexDirection: 'column', marginTop: 1, marginBottom: 2 }}>
                      {item.altMenu.map(alt => {
                        // alt.yol query string icerebilir (orn /servis-talepleri?kaynak=musteri).
                        // pathname ve search'i ayri kontrol et.
                        const [altPath, altQuery = ''] = alt.yol.split('?')
                        const pathEslesti = location.pathname === altPath || location.pathname.startsWith(altPath + '/')
                        const aktif = altQuery
                          ? (pathEslesti && location.search.replace(/^\?/, '') === altQuery)
                          : (pathEslesti
                              // Query'siz item (Servis Talepleri) — kardes query'li link aktifse aktif degil
                              && !item.altMenu.some(a2 => {
                                if (a2 === alt || !a2.yol.includes('?')) return false
                                const [p2, q2] = a2.yol.split('?')
                                return p2 === altPath && location.search.replace(/^\?/, '') === q2
                              }))
                        // Rozet kaynağı tek yerde: rozetSayisi() (personel/müşteri talebi, kritik stok…)
                        return (
                          <button
                            key={alt.id}
                            onClick={() => navigate(alt.yol)}
                            style={{
                              width: '100%', textAlign: 'left',
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '5px 8px',
                              borderRadius: 'var(--radius-sm)',
                              background: aktif ? 'var(--surface-sidebar-active)' : 'transparent',
                              color: aktif ? 'var(--text-on-dark)' : 'var(--text-on-dark-muted)',
                              border: 'none',
                              borderLeft: `2px solid ${aktif ? 'var(--brand-primary)' : 'transparent'}`,
                              cursor: 'pointer',
                              font: aktif ? '500 13px/17px var(--font-sans)' : '400 13px/17px var(--font-sans)',
                            }}
                            onMouseEnter={e => { if (!aktif) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-on-dark)' } }}
                            onMouseLeave={e => { if (!aktif) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-on-dark-muted)' } }}
                          >
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alt.isim}</span>
                            <MenuRozet sayi={rozetSayisi(alt.id)} />
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                </SortableSatir>
              )
            }

            const aktif = location.pathname === item.yol ||
              (item.yol !== '/dashboard' && location.pathname.startsWith(item.yol))
            return (
              <SortableSatir id={item.id} key={item.id} duzenModu={duzenModu}>
              <button
                onClick={() => navigate(item.yol)}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: aktif ? 'var(--surface-sidebar-active)' : 'transparent',
                  color: aktif ? 'var(--text-on-dark)' : 'var(--text-on-dark-muted)',
                  border: 'none',
                  borderLeft: `2px solid ${aktif ? 'var(--brand-primary)' : 'transparent'}`,
                  paddingLeft: 8,
                  cursor: 'pointer',
                  font: aktif ? '500 13px/17px var(--font-sans)' : '400 13px/17px var(--font-sans)',
                  transition: 'background 120ms, color 120ms',
                }}
                onMouseEnter={e => { if (!aktif) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-on-dark)' } }}
                onMouseLeave={e => { if (!aktif) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-on-dark-muted)' } }}
                aria-current={aktif ? 'page' : undefined}
              >
                {item.id === 'trassir'
                  ? <img src="/trassirlogo.png" alt="" style={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0 }} />
                  : <item.Icon size={16} strokeWidth={1.6} style={{ flexShrink: 0 }} />}
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.isim}</span>
                <MenuRozet
                  sayi={rozetSayisi(item.id)}
                  nabiz={nabizliRozet(item.id)}
                  baslik={item.id === 'gorevler' ? `${gorevOkunmamis} yeni görev bildirimi (atama / yorum / etiket)`
                        : item.id === 'gorusmeler' ? `${gorusmeOkunmamis} yeni görüşme bildirimi (yorum / etiket)`
                        : undefined}
                />
              </button>
              </SortableSatir>
            )
          })}
          </SortableContext>
          </DndContext>
          )}
        </nav>

        {/* Logout */}
        <div style={{ padding: 8, borderTop: '1px solid var(--border-on-dark)' }}>
          <button
            onClick={handleCikis}
            disabled={cikisYapiliyor}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              background: cikisYapiliyor ? 'rgba(178,58,58,0.12)' : 'transparent',
              color: cikisYapiliyor ? '#E88B8B' : 'var(--text-on-dark-muted)',
              border: 'none',
              cursor: cikisYapiliyor ? 'progress' : 'pointer',
              font: '400 14px/20px var(--font-sans)',
              transition: 'background 120ms, color 120ms',
            }}
            onMouseEnter={e => { if (!cikisYapiliyor) { e.currentTarget.style.background = 'rgba(178,58,58,0.12)'; e.currentTarget.style.color = '#E88B8B' } }}
            onMouseLeave={e => { if (!cikisYapiliyor) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-on-dark-muted)' } }}
          >
            <LogOut size={16} strokeWidth={1.5} />
            <span>{cikisYapiliyor ? 'Çıkış yapılıyor…' : 'Çıkış Yap'}</span>
          </button>
        </div>
      </aside>

      {/* Content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Topbar */}
        <header
          style={{
            height: 56,
            flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 24px',
            background: 'var(--surface-card)',
            borderBottom: '1px solid var(--border-default)',
            position: 'relative',
            zIndex: 'var(--z-sticky)',
          }}
        >
          <h1 style={{ font: '600 20px/28px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>
            {sayfaBasligi()}
          </h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Tema */}
            <button
              onClick={() => setTemaPaneliAcik(!temaPaneliAcik)}
              aria-label="Tema"
              style={{
                width: 36, height: 36,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: temaPaneliAcik ? 'var(--surface-sunken)' : 'transparent',
                border: '1px solid transparent',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'background 120ms, color 120ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-sunken)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { if (!temaPaneliAcik) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
            >
              <Palette size={18} strokeWidth={1.5} />
            </button>

            {/* Bildirim */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setBildirimPanelAcik(!bildirimPanelAcik)}
                aria-label="Bildirimler"
                style={{
                  width: 36, height: 36,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: bildirimPanelAcik ? 'var(--surface-sunken)' : 'transparent',
                  border: '1px solid transparent',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  position: 'relative',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-sunken)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { if (!bildirimPanelAcik) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
              >
                <Bell size={18} strokeWidth={1.5} />
                {okunmamisSayisi > 0 && (
                  <span
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      minWidth: 16, height: 16, padding: '0 4px',
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--danger)', color: '#fff',
                      fontSize: 10, fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      border: '2px solid var(--surface-card)',
                    }}
                  >
                    {okunmamisSayisi > 9 ? '9+' : okunmamisSayisi}
                  </span>
                )}
              </button>

              {bildirimPanelAcik && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0, top: 44,
                    width: 340,
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-lg)',
                    overflow: 'hidden',
                    zIndex: 'var(--z-dropdown)',
                  }}
                >
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>Bildirimler</span>
                      {okunmamisSayisi > 0 && (
                        <span style={{
                          padding: '1px 7px',
                          borderRadius: 'var(--radius-pill)',
                          background: 'var(--danger-soft)', color: 'var(--danger)',
                          font: '500 11px/16px var(--font-sans)',
                        }}>
                          {okunmamisSayisi} yeni
                        </span>
                      )}
                    </div>
                    {okunmamisSayisi > 0 && (
                      <button
                        onClick={tumunuOku}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--brand-primary)',
                          font: '500 12px/16px var(--font-sans)',
                        }}
                      >
                        Tümünü oku
                      </button>
                    )}
                  </div>
                  <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                    {benimBildirimlerim.length === 0 ? (
                      <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-tertiary)', font: '400 14px/20px var(--font-sans)' }}>
                        Henüz bildirim yok
                      </div>
                    ) : (
                      benimBildirimlerim.map(b => {
                        const tip = bildirimTipIcon[b.tip] ?? bildirimTipIcon.bilgi
                        const IconC = tip.C
                        return (
                          <div
                            key={b.id}
                            onClick={() => bildirimTikla(b)}
                            style={{
                              padding: '12px 16px',
                              borderBottom: '1px solid var(--border-default)',
                              background: !b.okundu ? 'var(--brand-primary-soft)' : 'transparent',
                              cursor: 'pointer',
                              display: 'flex', alignItems: 'flex-start', gap: 10,
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                            onMouseLeave={e => e.currentTarget.style.background = !b.okundu ? 'var(--brand-primary-soft)' : 'transparent'}
                          >
                            <span style={{ color: tip.color, display: 'inline-flex', marginTop: 2 }}>
                              <IconC size={16} strokeWidth={1.5} />
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{b.baslik}</div>
                              <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)', marginTop: 2 }}>{b.mesaj}</div>
                              <div style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>{zamanFormat(b.olusturmaTarih || b.tarih || b.olusturma_tarih)}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              {!b.okundu && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand-primary)' }} />}
                              <button
                                onClick={e => { e.stopPropagation(); bildirimSil(b.id) }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 2, display: 'inline-flex' }}
                                onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
                              >
                                <X size={14} strokeWidth={1.5} />
                              </button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>

                  {/* Toplu temizleme — 800+ bildirimi tek tek silmek gerekiyordu.
                      Panel yalnız son 20'yi gösterir, bu butonlar TÜM kayıtlara
                      işler; onay ekranındaki sayı bu yüzden DB'den okunur. */}
                  {benimBildirimlerim.length > 0 && (
                    <div style={{
                      padding: '10px 16px',
                      borderTop: '1px solid var(--border-default)',
                      background: 'var(--surface-sunken)',
                      display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end',
                    }}>
                      <button
                        onClick={() => topluTemizle(true)}
                        disabled={temizleniyor}
                        style={{
                          background: 'none', border: 'none',
                          cursor: temizleniyor ? 'wait' : 'pointer',
                          color: 'var(--text-secondary)',
                          font: '500 12px/16px var(--font-sans)',
                          padding: '4px 6px',
                        }}
                      >
                        Okunanları temizle
                      </button>
                      <span style={{ width: 1, height: 14, background: 'var(--border-default)' }} />
                      <button
                        onClick={() => topluTemizle(false)}
                        disabled={temizleniyor}
                        style={{
                          background: 'none', border: 'none',
                          cursor: temizleniyor ? 'wait' : 'pointer',
                          color: 'var(--danger)',
                          font: '500 12px/16px var(--font-sans)',
                          padding: '4px 6px',
                        }}
                      >
                        {temizleniyor ? 'Siliniyor…' : 'Tümünü sil'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Durum pill */}
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)',
                font: '500 12px/16px var(--font-sans)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: durumRenkleri[mevcutDurum] }} />
              {durumIsimleri[mevcutDurum]}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main
          style={{ flex: 1, overflowY: 'auto', background: 'var(--surface-bg)' }}
          onClick={() => setBildirimPanelAcik(false)}
        >
          {children}
        </main>
      </div>

      <ThemePaneli acik={temaPaneliAcik} kapat={() => setTemaPaneliAcik(false)} />
      {/* Gecikmiş görev kapısı — ek süre girilmeden CRM kullanılamaz (2026-07-19) */}
      <GecikmisGorevKapisi />
      <FloatingSohbetButton />
      {/* Mini sohbet penceresi — butonun KARDEŞİ, içinde değil: buton /chat ve
          yazdır sayfalarında erken return yapıyor, pencere de onunla kaybolurdu.
          Routes'un dışında olduğu için sayfa değişince kapanmaz. */}
      <SohbetPenceresi />
      <FloatingZeynaButton />
      <GlobalBarkodAra />
    </div>
  )
}

export default MainLayout
