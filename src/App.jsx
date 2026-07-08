import { Suspense, useEffect, useState } from 'react'
import { lazyWithRetry as lazy, tumChunklariOnyukle } from './lib/lazyWithRetry'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

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
const Firmalar = lazy(() => import('./pages/Firmalar'))
const Gorusmeler = lazy(() => import('./pages/Gorusmeler'))
const GorusmeDetay = lazy(() => import('./pages/GorusmeDetay'))
const Stok = lazy(() => import('./pages/Stok'))
const StokHareketleri = lazy(() => import('./pages/StokHareketleri'))
const StokOpsiyon = lazy(() => import('./pages/StokOpsiyon'))
const ModelDetay = lazy(() => import('./pages/ModelDetay'))
const SlaAyarlari = lazy(() => import('./pages/SlaAyarlari'))
const Performans = lazy(() => import('./pages/Performans'))
const TrassirLisanslar = lazy(() => import('./pages/TrassirLisanslar'))
const Teklifler = lazy(() => import('./pages/Teklifler'))
const SiparisOnaylari = lazy(() => import('./pages/SiparisOnaylari'))
const TeklifOnaylari = lazy(() => import('./pages/TeklifOnaylari'))
const TeklifDetay = lazy(() => import('./pages/TeklifDetay'))
const TeklifKiyasla = lazy(() => import('./pages/TeklifKiyasla'))
const Satislar = lazy(() => import('./pages/Satislar'))
const SatisDetay = lazy(() => import('./pages/SatisDetay'))
const Raporlar = lazy(() => import('./pages/Raporlar'))
const RaporMerkezi = lazy(() => import('./pages/RaporMerkezi'))
const DokumanMerkezi = lazy(() => import('./pages/DokümanMerkezi'))
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
const MemnuniyetDegerlendirme = lazy(() => import('./pages/MemnuniyetDegerlendirme'))
const MusteriDashboard = lazy(() => import('./pages/musteri/MusteriDashboard'))
const YeniTalep = lazy(() => import('./pages/musteri/YeniTalep'))
const Taleplerim = lazy(() => import('./pages/musteri/Taleplerim'))
const MusteriTalepDetay = lazy(() => import('./pages/musteri/MusteriTalepDetay'))
const TeklifIste = lazy(() => import('./pages/musteri/TeklifIste'))
const TeklifYazdir = lazy(() => import('./pages/TeklifYazdir'))
const FaturaYazdir = lazy(() => import('./pages/FaturaYazdir'))
const ServisFormuYazdir = lazy(() => import('./pages/ServisFormuYazdir'))
const DesignSystemPage = lazy(() => import('./pages/DesignSystemPage'))
const Skor = lazy(() => import('./pages/Skor'))
const Mobiltek = lazy(() => import('./pages/Mobiltek'))
const AracYonetimi = lazy(() => import('./pages/AracYonetimi'))
const FiloYonetimi = lazy(() => import('./pages/FiloYonetimi'))
const Duyurular = lazy(() => import('./pages/Duyurular'))
const Demolar = lazy(() => import('./pages/Demolar'))
const YeniDemoCihaz = lazy(() => import('./pages/YeniDemoCihaz'))
const DemoCihazDetay = lazy(() => import('./pages/DemoCihazDetay'))
const YeniZimmet = lazy(() => import('./pages/YeniZimmet'))
const DuzenleDemoCihaz = lazy(() => import('./pages/DuzenleDemoCihaz'))

// Yönetim grubu erişim guard'ı — Ali, Oğuz, Ferdi.
// URL'yi elle yazmayı engeller; sidebar'daki gizleme ile paralel.
function YonetimGuard({ children }) {
  const { kullanici } = useAuth()
  const ad = (kullanici?.ad || '').toLocaleLowerCase('tr')
  const izinli = /\b(oğuz|oguz|ali|ferdi)\b/i.test(ad)
  if (!izinli) return <Navigate to="/dashboard" replace />
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
          <Route path="/servis-talepleri/:id/yazdir" element={<ServisFormuYazdir />} />
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
          <Route path="/firmalar" element={<Firmalar />} />
          <Route path="/gorusmeler" element={<Gorusmeler />} />
          <Route path="/gorusmeler/:id" element={<GorusmeDetay />} />
          <Route path="/stok" element={<Stok />} />
          <Route path="/stok/model/:stokKodu" element={<ModelDetay />} />
          <Route path="/stok-hareketleri" element={<StokHareketleri />} />
          <Route path="/stok-opsiyon" element={<StokOpsiyon />} />
          <Route path="/trassir-lisanslar" element={<TrassirLisanslar />} />
          <Route path="/teklifler" element={<Teklifler />} />
          <Route path="/teklifler/kiyasla/:id1/:id2" element={<TeklifKiyasla />} />
          <Route path="/teklifler/:id" element={<TeklifDetay />} />
          <Route path="/siparis-onaylari" element={<SiparisOnaylari />} />
          <Route path="/teklif-onaylari" element={<TeklifOnaylari />} />
          <Route path="/satislar" element={<Satislar />} />
          <Route path="/satislar/:id" element={<SatisDetay />} />
          <Route path="/raporlar" element={<YonetimGuard><Raporlar /></YonetimGuard>} />
          <Route path="/rapor-merkezi" element={<YonetimGuard><RaporMerkezi /></YonetimGuard>} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/profil" element={<Profil />} />
          <Route path="/firma-gecmisi/:firmaAdi" element={<FirmaGecmisi />} />
          <Route path="/demolar" element={<Demolar />} />
          <Route path="/demolar/yeni" element={<YeniDemoCihaz />} />
          <Route path="/demolar/:id" element={<DemoCihazDetay />} />
          <Route path="/demolar/:id/zimmet" element={<YeniZimmet />} />
          <Route path="/demolar/:id/duzenle" element={<DuzenleDemoCihaz />} />
          <Route path="/servis-talepleri" element={<ServisTalepleri />} />
          <Route path="/servis-talepleri/yeni" element={<YeniServisTalebi />} />
          <Route path="/servis-talepleri/:id" element={<ServisTalepDetay />} />
          <Route path="/servis-raporlari" element={<ServisRaporlari />} />
          <Route path="/dokuman-merkezi" element={<DokumanMerkezi />} />
          <Route path="/kargolar" element={<Kargolar />} />
          <Route path="/kargolar/:id" element={<KargoDetay />} />
          <Route path="/takvim" element={<Takvim />} />
          <Route path="/ayarlar/takvim-baglantilari" element={<TakvimBaglantilari />} />
          <Route path="/oauth/google/callback" element={<OAuthGoogleCallback />} />
          <Route path="/notlarim" element={<Notlarim />} />
          <Route path="/memnuniyet" element={<MemnuniyetDegerlendirme />} />
          <Route path="/sla-ayarlari" element={<YonetimGuard><SlaAyarlari /></YonetimGuard>} />
          <Route path="/performans" element={<YonetimGuard><Performans /></YonetimGuard>} />
          <Route path="/mobiltek" element={<Mobiltek />} />
          <Route path="/arac-yonetimi" element={<YonetimGuard><AracYonetimi /></YonetimGuard>} />
          <Route path="/filo/bakim" element={<YonetimGuard><FiloYonetimi /></YonetimGuard>} />
          <Route path="/filo/belgeler" element={<YonetimGuard><FiloYonetimi /></YonetimGuard>} />
          <Route path="/filo/yakit" element={<YonetimGuard><FiloYonetimi /></YonetimGuard>} />
          <Route path="/filo/surucu" element={<YonetimGuard><FiloYonetimi /></YonetimGuard>} />
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
