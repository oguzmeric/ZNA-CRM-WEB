import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

// Eager — kritik ilk-paint için (login + Dashboard)
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
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
const MemnuniyetDegerlendirme = lazy(() => import('./pages/MemnuniyetDegerlendirme'))
const MusteriDashboard = lazy(() => import('./pages/musteri/MusteriDashboard'))
const YeniTalep = lazy(() => import('./pages/musteri/YeniTalep'))
const Taleplerim = lazy(() => import('./pages/musteri/Taleplerim'))
const MusteriTalepDetay = lazy(() => import('./pages/musteri/MusteriTalepDetay'))
const TeklifIste = lazy(() => import('./pages/musteri/TeklifIste'))
const TeklifYazdir = lazy(() => import('./pages/TeklifYazdir'))
const FaturaYazdir = lazy(() => import('./pages/FaturaYazdir'))
const DesignSystemPage = lazy(() => import('./pages/DesignSystemPage'))
const Duyurular = lazy(() => import('./pages/Duyurular'))

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

  if (location.pathname === '/design-system') {
    return (
      <Suspense fallback={<SayfaYukleniyor />}>
        <Routes>
          <Route path="/design-system" element={<DesignSystemPage />} />
        </Routes>
      </Suspense>
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
        </Routes>
      </Suspense>
    )
  }

  if (kullanici.tip === 'musteri') {
    return (
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
    )
  }

  return (
    <MainLayout>
      <Suspense fallback={<SayfaYukleniyor />}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/gorevler" element={<Gorevler />} />
          <Route path="/gorevler/:id" element={<GorevDetay />} />
          <Route path="/kullanici-yonetimi" element={<KullaniciYonetimi />} />
          <Route path="/duyurular" element={<Duyurular />} />
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
          <Route path="/satislar" element={<Satislar />} />
          <Route path="/satislar/:id" element={<SatisDetay />} />
          <Route path="/raporlar" element={<Raporlar />} />
          <Route path="/rapor-merkezi" element={<RaporMerkezi />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/profil" element={<Profil />} />
          <Route path="/firma-gecmisi/:firmaAdi" element={<FirmaGecmisi />} />
          <Route path="/servis-talepleri" element={<ServisTalepleri />} />
          <Route path="/servis-talepleri/yeni" element={<YeniServisTalebi />} />
          <Route path="/servis-talepleri/:id" element={<ServisTalepDetay />} />
          <Route path="/servis-raporlari" element={<ServisRaporlari />} />
          <Route path="/dokuman-merkezi" element={<DokumanMerkezi />} />
          <Route path="/kargolar" element={<Kargolar />} />
          <Route path="/kargolar/:id" element={<KargoDetay />} />
          <Route path="/takvim" element={<Takvim />} />
          <Route path="/memnuniyet" element={<MemnuniyetDegerlendirme />} />
          <Route path="/sla-ayarlari" element={<SlaAyarlari />} />
          <Route path="/performans" element={<Performans />} />
          <Route path="/" element={<Navigate to="/dashboard" />} />
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
      </Suspense>
    </MainLayout>
  )
}

export default App
