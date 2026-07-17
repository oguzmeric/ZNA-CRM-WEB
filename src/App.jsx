import { Suspense, useEffect, useState } from 'react'
import { lazyWithRetry as lazy, tumChunklariOnyukle } from './lib/lazyWithRetry'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { siparisYonetimiGorebilirMi } from './lib/siparisYetki'
import { filoGorebilirMi } from './lib/filoYetki'
import { faturaYetkisi } from './services/faturaTalepService'

// Komut Paleti — lazy: sadece kullanıcı ⌘K'ye bastığında yüklensin
const KomutPaleti = lazy(() => import('./components/KomutPaleti'))
import IdleUyariModal from './components/IdleUyariModal'

// Eager — kritik ilk-paint için (login + Dashboard)
import Login from './pages/Login'
import Signup from './pages/Signup'
import SifremiUnuttum from './pages/SifremiUnuttum'
import Dashboard from './pages/Dashboard'
import PaylasimBelge from './pages/PaylasimBelge'
import DavetKabul from './pages/DavetKabul'
import MainLayout from './layouts/MainLayout'
import MusteriLayout from './layouts/MusteriLayout'

// Lazy — kullanıcının açtığı sayfa indiğinde inecek
const KullaniciYonetimi = lazy(() => import('./pages/KullaniciYonetimi'))
const Gorevler = lazy(() => import('./pages/Gorevler'))
const GorevDetay = lazy(() => import('./pages/GorevDetay'))
const Musteriler = lazy(() => import('./pages/Musteriler'))
const MusteriDetay = lazy(() => import('./pages/MusteriDetay'))
const Bayiler = lazy(() => import('./pages/Bayiler'))
const BayiDetay = lazy(() => import('./pages/BayiDetay'))
const Gorusmeler = lazy(() => import('./pages/Gorusmeler'))
const GorusmeDetay = lazy(() => import('./pages/GorusmeDetay'))
const Stok = lazy(() => import('./pages/Stok'))
const StokHareketleri = lazy(() => import('./pages/StokHareketleri'))
const StokOpsiyon = lazy(() => import('./pages/StokOpsiyon'))
const StokKritik = lazy(() => import('./pages/StokKritik'))
const StokSayim = lazy(() => import('./pages/StokSayim'))
const DepoRaporlar = lazy(() => import('./pages/DepoRaporlar'))
const ModelDetay = lazy(() => import('./pages/ModelDetay'))
const SlaAyarlari = lazy(() => import('./pages/SlaAyarlari'))
const Performans = lazy(() => import('./pages/Performans'))
const TrassirLisanslar = lazy(() => import('./pages/TrassirLisanslar'))
const Teklifler = lazy(() => import('./pages/Teklifler'))
const SiparisOnaylari = lazy(() => import('./pages/SiparisOnaylari'))
const Siparisler = lazy(() => import('./pages/Siparisler'))
const SiparisDetay = lazy(() => import('./pages/SiparisDetay'))
const KullanilanMalzemeler = lazy(() => import('./pages/KullanilanMalzemeler'))
const TeklifOnaylari = lazy(() => import('./pages/TeklifOnaylari'))
const FaturaTalepleri = lazy(() => import('./pages/FaturaTalepleri'))
const TeklifDetay = lazy(() => import('./pages/TeklifDetay'))
const Kesifler = lazy(() => import('./pages/Kesifler'))
const KesifDetay = lazy(() => import('./pages/KesifDetay'))
const TeklifKiyasla = lazy(() => import('./pages/TeklifKiyasla'))
const Satislar = lazy(() => import('./pages/Satislar'))
const SatisDetay = lazy(() => import('./pages/SatisDetay'))
const Raporlar = lazy(() => import('./pages/Raporlar'))
const RaporMerkezi = lazy(() => import('./pages/RaporMerkezi'))
const TeklifCiktiKayitlari = lazy(() => import('./pages/TeklifCiktiKayitlari'))
const DokumanMerkezi = lazy(() => import('./pages/DokümanMerkezi'))
const KisiselDokumanlar = lazy(() => import('./pages/KisiselDokumanlar'))
const Chat = lazy(() => import('./pages/Chat'))
const Profil = lazy(() => import('./pages/Profil'))
const FirmaGecmisi = lazy(() => import('./pages/FirmaGecmisi'))
const ServisTalepleri = lazy(() => import('./pages/ServisTalepleri'))
const ServisTalepDetay = lazy(() => import('./pages/ServisTalepDetay'))
const YeniServisTalebi = lazy(() => import('./pages/YeniServisTalebi'))
const ServisRaporlari = lazy(() => import('./pages/ServisRaporlari'))
const Kargolar = lazy(() => import('./pages/Kargolar'))
const KargoDetay = lazy(() => import('./pages/KargoDetay'))
const Takvim = lazy(() => import('./pages/Takvim'))
const TakvimBaglantilari = lazy(() => import('./pages/TakvimBaglantilari'))
const OAuthGoogleCallback = lazy(() => import('./pages/OAuthGoogleCallback'))
const Notlarim = lazy(() => import('./pages/Notlarim'))
const Destek = lazy(() => import('./pages/Destek'))
const MemnuniyetDegerlendirme = lazy(() => import('./pages/MemnuniyetDegerlendirme'))
const MusteriDashboard = lazy(() => import('./pages/musteri/MusteriDashboard'))
const YeniTalep = lazy(() => import('./pages/musteri/YeniTalep'))
const Taleplerim = lazy(() => import('./pages/musteri/Taleplerim'))
const MusteriTalepDetay = lazy(() => import('./pages/musteri/MusteriTalepDetay'))
const TeklifIste = lazy(() => import('./pages/musteri/TeklifIste'))
const TeklifYazdir = lazy(() => import('./pages/TeklifYazdir'))
const FaturaYazdir = lazy(() => import('./pages/FaturaYazdir'))
const ProformaYazdir = lazy(() => import('./pages/ProformaYazdir'))
const ServisFormuYazdir = lazy(() => import('./pages/ServisFormuYazdir'))
const SiparisYazdir = lazy(() => import('./pages/SiparisYazdir'))
const DesignSystemPage = lazy(() => import('./pages/DesignSystemPage'))
const Skor = lazy(() => import('./pages/Skor'))
const Mobiltek = lazy(() => import('./pages/Mobiltek'))
const AracYonetimi = lazy(() => import('./pages/AracYonetimi'))
const FiloBakim = lazy(() => import('./pages/FiloBakim'))
const FiloBelgeler = lazy(() => import('./pages/FiloBelgeler'))
const FiloYakit = lazy(() => import('./pages/FiloYakit'))
const FiloSurucu = lazy(() => import('./pages/FiloSurucu'))
const Duyurular = lazy(() => import('./pages/Duyurular'))
const Demolar = lazy(() => import('./pages/Demolar'))
const YeniDemoCihaz = lazy(() => import('./pages/YeniDemoCihaz'))
const DemoCihazDetay = lazy(() => import('./pages/DemoCihazDetay'))
const DemoTutanakYazdir = lazy(() => import('./pages/DemoTutanakYazdir'))
const DuzenleDemoCihaz = lazy(() => import('./pages/DuzenleDemoCihaz'))
const GunlukOzet = lazy(() => import('./pages/GunlukOzet'))
const Sozlesmeler = lazy(() => import('./pages/Sozlesmeler'))
const SatisSozlesmeForm = lazy(() => import('./pages/SatisSozlesmeForm'))

// Yönetim grubu erişim guard'ı — Ali, Oğuz, Ferdi.
// URL'yi elle yazmayı engeller; sidebar'daki gizleme ile paralel.
function YonetimGuard({ children }) {
  const { kullanici } = useAuth()
  const ad = (kullanici?.ad || '').toLocaleLowerCase('tr')
  const izinli = /\b(oğuz|oguz|ali|ferdi)\b/i.test(ad)
  if (!izinli) return <Navigate to="/dashboard" replace />
  return children
}

// ZNA Filo Yönetimi guard'ı — yönetim erişimi + Ahmet Agun/Abdullah İğde.
// MainLayout filo grubu filtresiyle AYNI kaynak: filoGorebilirMi.
function FiloGuard({ children }) {
  const { kullanici } = useAuth()
  if (!filoGorebilirMi(kullanici)) return <Navigate to="/dashboard" replace />
  return children
}

// Sabah Özeti — sadece Ali Uğur (id 1) + Oğuz (id 2). İsim yerine id ile
// kontrol ('ali' araması 'Salih' gibi adlara da uyar). Ahmet eklenecekse
// id'sini listeye ekle (edge fn sabah-ozeti/ALICILAR ile birlikte).
export const SABAH_OZETI_IDLER = [1, 2]
function SabahOzetiGuard({ children }) {
  const { kullanici } = useAuth()
  if (!SABAH_OZETI_IDLER.includes(Number(kullanici?.id))) return <Navigate to="/dashboard" replace />
  return children
}

// Onay sayfaları — SADECE onay yetkisi bayrağı olanlar (Ali/Oğuz/Ahmet).
// Admin rolü bile bypass edemez; bayraklar Kullanıcı Yönetimi'nden verilir.
function TeklifOnayGuard({ children }) {
  const { kullanici } = useAuth()
  if (!kullanici?.teklifOnayYetkilisi) return <Navigate to="/dashboard" replace />
  return children
}
function SiparisOnayGuard({ children }) {
  const { kullanici } = useAuth()
  if (!kullanici?.siparisOnayYetkilisi) return <Navigate to="/dashboard" replace />
  return children
}
// Fatura kuyruğu — fatura_yetkilisi bayrağı VEYA admin (mig 165).
// Yetki mantığı tek yerde: faturaYetkisi() — sidebar ve sayfa da onu kullanır.
function FaturaYetkiGuard({ children }) {
  const { kullanici } = useAuth()
  if (!faturaYetkisi(kullanici)) return <Navigate to="/dashboard" replace />
  return children
}

// Sipariş Yönetimi (Siparişler + Kullanılan Malzemeler) — admin + izinli
// istisnalar (Abdullah İğde/muhasebe). Tutar/kâr bilgisi içerir; MainLayout
// sadeceAdmin menü filtresiyle AYNI kaynak: siparisYonetimiGorebilirMi.
function AdminGuard({ children }) {
  const { kullanici } = useAuth()
  if (!siparisYonetimiGorebilirMi(kullanici)) return <Navigate to="/dashboard" replace />
  return children
}

// Duyuru yayınlama sadece Oğuz'a — Yönetim'den bir tık daha sıkı.
function OguzGuard({ children }) {
  const { kullanici } = useAuth()
  const ad = (kullanici?.ad || '').toLocaleLowerCase('tr')
  const izinli = /\b(oğuz|oguz)\b/i.test(ad)
  if (!izinli) return <Navigate to="/dashboard" replace />
  return children
}

const SayfaYukleniyor = () => (
  <div style={{
    minHeight: '60vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-tertiary)',
    font: '400 13px/18px var(--font-sans)',
  }}>
    Yükleniyor…
  </div>
)

function App() {
  const { kullanici, oturumYuklendi } = useAuth()
  const location = useLocation()
  const [komutPaletiAcik, setKomutPaletiAcik] = useState(false)

  // Login sonrası tüm route chunk'larını arka planda indir.
  // İdle dönüşünde tıklamak için network'e gerek kalmasın → module cache'ten anlık açılsın.
  useEffect(() => {
    if (kullanici) tumChunklariOnyukle()
  }, [kullanici])

  // Veri ön-ısıtma: en çok gezilen listeleri login'den kısa süre sonra arka
  // planda cache'e çek — ilk menü tıklaması bile beklemesin. Servisler dinamik
  // import edilir (ana chunk şişmez); cache SWR olduğundan sonraki ziyaretler
  // her zaman anlık açılır, veri arkada sessizce tazelenir.
  useEffect(() => {
    if (!kullanici) return
    // 800ms: login/refresh sonrası kullanıcı daha ilk menüye tıklamadan ısıtma
    // başlasın (2.5sn beklerken tıklanınca soğuk fetch'e denk geliyordu)
    const t = setTimeout(() => {
      const isit = [
        () => import('./services/gorusmeService').then(m => m.gorusmeleriGetir()),
        () => import('./services/gorevService').then(m => m.gorevleriGetir()),
        () => import('./services/musteriService').then(m => m.musterileriGetir()),
        () => import('./services/teklifService').then(m => m.teklifleriGetir()),
        () => import('./services/satisService').then(m => m.satislariGetir()),
      ]
      isit.forEach((fn, i) => setTimeout(() => fn().catch(() => {}), i * 250))
    }, 800)
    return () => clearTimeout(t)
  }, [kullanici])

  // Global Ctrl+K / ⌘+K listener + programatik açma eventi
  useEffect(() => {
    if (!kullanici) return
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setKomutPaletiAcik(prev => !prev)
      }
    }
    const handleAcEvent = () => setKomutPaletiAcik(true)
    window.addEventListener('keydown', handleKey)
    window.addEventListener('komut-paleti-ac', handleAcEvent)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('komut-paleti-ac', handleAcEvent)
    }
  }, [kullanici])

  if (location.pathname === '/design-system') {
    return (
      <Suspense fallback={<SayfaYukleniyor />}>
        <Routes>
          <Route path="/design-system" element={<DesignSystemPage />} />
        </Routes>
      </Suspense>
    )
  }

  // /skor artık login zorunlu — herkese açık değil (veri ifşası riskini kaldırmak için).

  // Public tokenli paylasim linki — auth gate'in ONUNDE, herkese acik.
  // Musteri SMS/mail'den gelen link uzerinden teklif veya servis raporunu goruntuler.
  if (location.pathname.startsWith('/p/')) {
    return (
      <Routes>
        <Route path="/p/:token" element={<PaylasimBelge />} />
      </Routes>
    )
  }

  // B2B portal davet linki — auth gate'in ONUNDE, herkese acik.
  // Admin gonderdigi davet maili uzerinden musteri sifre belirleyip hesap aktive eder.
  if (location.pathname.startsWith('/davet/')) {
    return (
      <Routes>
        <Route path="/davet/:token" element={<DavetKabul />} />
      </Routes>
    )
  }

  // Session henüz hydrate edilmediyse hiç redirect yapma — yoksa
  // F5 sırasında URL /login'e yazılıp kullanıcı login sonrası /dashboard'a
  // düşüyor (bulunduğu sayfayı kaybediyor). Boş ekran göster, session
  // yüklensin, sonra route.
  if (!oturumYuklendi) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface-bg)',
        color: 'var(--text-tertiary)',
        font: '400 13px/18px var(--font-sans)',
      }}>
        Yükleniyor…
      </div>
    )
  }

  if (!kullanici) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/sifremi-unuttum" element={<SifremiUnuttum />} />
        <Route
          path="*"
          element={<Navigate to="/login" replace state={{ from: location }} />}
        />
      </Routes>
    )
  }

  const isPrint = location.pathname.endsWith('/yazdir')
  if (isPrint) {
    return (
      <Suspense fallback={<SayfaYukleniyor />}>
        <Routes>
          <Route path="/teklifler/:id/yazdir" element={<TeklifYazdir />} />
          <Route path="/satislar/:id/yazdir" element={<FaturaYazdir />} />
          <Route path="/fatura-talepleri/:id/yazdir" element={<ProformaYazdir />} />
          <Route path="/servis-talepleri/:id/yazdir" element={<ServisFormuYazdir />} />
          <Route path="/siparisler/:id/yazdir" element={<AdminGuard><SiparisYazdir /></AdminGuard>} />
        </Routes>
      </Suspense>
    )
  }

  // /skor — sadece yönetim (Oğuz Meriç, Ali Uğur Aktepe, Ferdi Kalkan) erişebilir
  if (location.pathname === '/skor') {
    const skorAd = (kullanici?.ad || '').toLocaleLowerCase('tr')
    const skorYetkili = /\b(oğuz|oguz|ali|ferdi)\b/i.test(skorAd)
    if (!skorYetkili) {
      return <Navigate to="/dashboard" replace />
    }
    return (
      <Suspense fallback={<SayfaYukleniyor />}>
        <Routes>
          <Route path="/skor" element={<Skor />} />
        </Routes>
      </Suspense>
    )
  }

  if (kullanici.tip === 'musteri') {
    return (
      <>
        <MusteriLayout>
          <Suspense fallback={<SayfaYukleniyor />}>
            <Routes>
              <Route path="/musteri-portal" element={<MusteriDashboard />} />
              <Route path="/musteri-portal/yeni-talep" element={<YeniTalep />} />
              <Route path="/musteri-portal/taleplerim" element={<Taleplerim />} />
              <Route path="/musteri-portal/talep/:id" element={<MusteriTalepDetay />} />
              <Route path="/musteri-portal/teklif-iste" element={<TeklifIste />} />
              <Route path="*" element={<Navigate to="/musteri-portal" />} />
            </Routes>
          </Suspense>
        </MusteriLayout>
        {komutPaletiAcik && (
          <Suspense fallback={null}>
            <KomutPaleti acik={komutPaletiAcik} onClose={() => setKomutPaletiAcik(false)} />
          </Suspense>
        )}
        <IdleUyariModal />
      </>
    )
  }

  return (
    <>
    <MainLayout>
      <Suspense fallback={<SayfaYukleniyor />}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/gorevler" element={<Gorevler />} />
          <Route path="/gorevler/:id" element={<GorevDetay />} />
          <Route path="/kullanici-yonetimi" element={<YonetimGuard><KullaniciYonetimi /></YonetimGuard>} />
          <Route path="/duyurular" element={<OguzGuard><Duyurular /></OguzGuard>} />
          <Route path="/musteriler" element={<Musteriler />} />
          <Route path="/musteriler/:id" element={<MusteriDetay />} />
          <Route path="/bayiler" element={<Bayiler />} />
          <Route path="/bayiler/:id" element={<BayiDetay />} />
          <Route path="/firmalar" element={<Navigate to="/bayiler" replace />} />
          <Route path="/gorusmeler" element={<Gorusmeler />} />
          <Route path="/gorusmeler/:id" element={<GorusmeDetay />} />
          <Route path="/stok" element={<Stok />} />
          <Route path="/stok/model/:stokKodu" element={<ModelDetay />} />
          <Route path="/stok-hareketleri" element={<StokHareketleri />} />
          <Route path="/stok-opsiyon" element={<StokOpsiyon />} />
          <Route path="/stok-kritik" element={<StokKritik />} />
          <Route path="/stok-sayim" element={<StokSayim />} />
          <Route path="/depo-raporlar" element={<DepoRaporlar />} />
          <Route path="/trassir-lisanslar" element={<TrassirLisanslar />} />
          <Route path="/teklifler" element={<Teklifler />} />
          <Route path="/kesifler" element={<Kesifler />} />
          <Route path="/kesifler/:id" element={<KesifDetay />} />
          <Route path="/teklifler/kiyasla/:id1/:id2" element={<TeklifKiyasla />} />
          <Route path="/teklifler/:id" element={<TeklifDetay />} />
          <Route path="/siparis-onaylari" element={<SiparisOnayGuard><SiparisOnaylari /></SiparisOnayGuard>} />
          <Route path="/siparisler" element={<AdminGuard><Siparisler /></AdminGuard>} />
          <Route path="/siparisler/:id" element={<AdminGuard><SiparisDetay /></AdminGuard>} />
          <Route path="/kullanilan-malzemeler" element={<AdminGuard><KullanilanMalzemeler /></AdminGuard>} />
          <Route path="/teklif-onaylari" element={<TeklifOnayGuard><TeklifOnaylari /></TeklifOnayGuard>} />
          <Route path="/fatura-talepleri" element={<FaturaYetkiGuard><FaturaTalepleri /></FaturaYetkiGuard>} />
          <Route path="/satislar" element={<Satislar />} />
          <Route path="/satislar/:id" element={<SatisDetay />} />
          <Route path="/raporlar" element={<YonetimGuard><Raporlar /></YonetimGuard>} />
          <Route path="/rapor-merkezi" element={<YonetimGuard><RaporMerkezi /></YonetimGuard>} />
          <Route path="/teklif-cikti-kayitlari" element={<YonetimGuard><TeklifCiktiKayitlari /></YonetimGuard>} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/profil" element={<Profil />} />
          <Route path="/firma-gecmisi/:firmaAdi" element={<FirmaGecmisi />} />
          <Route path="/demolar" element={<Demolar />} />
          <Route path="/demolar/yeni" element={<YeniDemoCihaz />} />
          <Route path="/demolar/:id" element={<DemoCihazDetay />} />
          <Route path="/demolar/:id/tutanak" element={<DemoTutanakYazdir />} />
          <Route path="/demolar/:id/duzenle" element={<DuzenleDemoCihaz />} />
          <Route path="/servis-talepleri" element={<ServisTalepleri />} />
          <Route path="/servis-talepleri/yeni" element={<YeniServisTalebi />} />
          <Route path="/servis-talepleri/:id" element={<ServisTalepDetay />} />
          <Route path="/servis-raporlari" element={<ServisRaporlari />} />
          <Route path="/dokuman-merkezi" element={<DokumanMerkezi />} />
          <Route path="/dokumanlarim" element={<KisiselDokumanlar />} />
          <Route path="/kargolar" element={<Kargolar />} />
          <Route path="/kargolar/:id" element={<KargoDetay />} />
          <Route path="/takvim" element={<Takvim />} />
          <Route path="/ayarlar/takvim-baglantilari" element={<TakvimBaglantilari />} />
          <Route path="/oauth/google/callback" element={<OAuthGoogleCallback />} />
          <Route path="/notlarim" element={<Notlarim />} />
          <Route path="/destek" element={<Destek />} />
          <Route path="/memnuniyet" element={<MemnuniyetDegerlendirme />} />
          <Route path="/sla-ayarlari" element={<YonetimGuard><SlaAyarlari /></YonetimGuard>} />
          <Route path="/performans" element={<YonetimGuard><Performans /></YonetimGuard>} />
          <Route path="/mobiltek" element={<Mobiltek />} />
          <Route path="/arac-yonetimi" element={<FiloGuard><AracYonetimi /></FiloGuard>} />
          <Route path="/gunluk-ozet" element={<SabahOzetiGuard><GunlukOzet /></SabahOzetiGuard>} />
          {/* Eski push linkleri /sabah-ozeti'ne gidiyor — yeni adrese yönlendir */}
          <Route path="/sabah-ozeti" element={<Navigate to="/gunluk-ozet" replace />} />
          <Route path="/sozlesmeler" element={<YonetimGuard><Sozlesmeler /></YonetimGuard>} />
          <Route path="/sozlesmeler/satis/yeni" element={<YonetimGuard><SatisSozlesmeForm /></YonetimGuard>} />
          <Route path="/sozlesmeler/satis/:id" element={<YonetimGuard><SatisSozlesmeForm /></YonetimGuard>} />
          <Route path="/filo/bakim" element={<FiloGuard><FiloBakim /></FiloGuard>} />
          <Route path="/filo/belgeler" element={<FiloGuard><FiloBelgeler /></FiloGuard>} />
          <Route path="/filo/yakit" element={<FiloGuard><FiloYakit /></FiloGuard>} />
          <Route path="/filo/surucu" element={<FiloGuard><FiloSurucu /></FiloGuard>} />
          <Route path="/" element={<Navigate to="/dashboard" />} />
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
      </Suspense>
    </MainLayout>
    <KomutPaleti acik={komutPaletiAcik} onClose={() => setKomutPaletiAcik(false)} />
    <IdleUyariModal />
    </>
  )
}

export default App
