import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import KullaniciYonetimi from './pages/KullaniciYonetimi'
import Gorevler from './pages/Gorevler'
import GorevDetay from './pages/GorevDetay'
import Musteriler from './pages/Musteriler'
import MusteriDetay from './pages/MusteriDetay'
import Firmalar from './pages/Firmalar'
import Gorusmeler from './pages/Gorusmeler'
import GorusmeDetay from './pages/GorusmeDetay'
import Stok from './pages/Stok'
import StokHareketleri from './pages/StokHareketleri'
import StokOpsiyon from './pages/StokOpsiyon'
import ModelDetay from './pages/ModelDetay'
import TrassirLisanslar from './pages/TrassirLisanslar'
import Teklifler from './pages/Teklifler'
import TeklifDetay from './pages/TeklifDetay'
import Satislar from './pages/Satislar'
import SatisDetay from './pages/SatisDetay'
import Raporlar from './pages/Raporlar'
import RaporMerkezi from './pages/RaporMerkezi'
import DokümanMerkezi from './pages/DokümanMerkezi'
import Chat from './pages/Chat'
import Profil from './pages/Profil'
import FirmaGecmisi from './pages/FirmaGecmisi'
import ServisTalepleri from './pages/ServisTalepleri'
import ServisTalepDetay from './pages/ServisTalepDetay'
import ServisRaporlari from './pages/ServisRaporlari'
import Kargolar from './pages/Kargolar'
import KargoDetay from './pages/KargoDetay'
import Takvim from './pages/Takvim'
import MemnuniyetDegerlendirme from './pages/MemnuniyetDegerlendirme'
import MainLayout from './layouts/MainLayout'
import MusteriLayout from './layouts/MusteriLayout'
import MusteriDashboard from './pages/musteri/MusteriDashboard'
import YeniTalep from './pages/musteri/YeniTalep'
import Taleplerim from './pages/musteri/Taleplerim'
import MusteriTalepDetay from './pages/musteri/MusteriTalepDetay'
import TeklifIste from './pages/musteri/TeklifIste'
import TeklifYazdir from './pages/TeklifYazdir'
import FaturaYazdir from './pages/FaturaYazdir'
import DesignSystemPage from './pages/DesignSystemPage'

function App() {
  const { kullanici } = useAuth()
  const location = useLocation()

  if (location.pathname === '/design-system') {
    return (
      <Routes>
        <Route path="/design-system" element={<DesignSystemPage />} />
      </Routes>
    )
  }

  if (!kullanici) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    )
  }

  const isPrint = location.pathname.endsWith('/yazdir')
  if (isPrint) {
    return (
      <Routes>
        <Route path="/teklifler/:id/yazdir" element={<TeklifYazdir />} />
        <Route path="/satislar/:id/yazdir" element={<FaturaYazdir />} />
      </Routes>
    )
  }

  if (kullanici.tip === 'musteri') {
    return (
      <MusteriLayout>
        <Routes>
          <Route path="/musteri-portal" element={<MusteriDashboard />} />
          <Route path="/musteri-portal/yeni-talep" element={<YeniTalep />} />
          <Route path="/musteri-portal/taleplerim" element={<Taleplerim />} />
          <Route path="/musteri-portal/talep/:id" element={<MusteriTalepDetay />} />
          <Route path="/musteri-portal/teklif-iste" element={<TeklifIste />} />
          <Route path="*" element={<Navigate to="/musteri-portal" />} />
        </Routes>
      </MusteriLayout>
    )
  }

  return (
    <MainLayout>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/gorevler" element={<Gorevler />} />
        <Route path="/gorevler/:id" element={<GorevDetay />} />
        <Route path="/kullanici-yonetimi" element={<KullaniciYonetimi />} />
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
        <Route path="/teklifler/:id" element={<TeklifDetay />} />
        <Route path="/satislar" element={<Satislar />} />
        <Route path="/satislar/:id" element={<SatisDetay />} />
        <Route path="/raporlar" element={<Raporlar />} />
        <Route path="/rapor-merkezi" element={<RaporMerkezi />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/profil" element={<Profil />} />
        <Route path="/firma-gecmisi/:firmaAdi" element={<FirmaGecmisi />} />
        <Route path="/servis-talepleri" element={<ServisTalepleri />} />
        <Route path="/servis-talepleri/:id" element={<ServisTalepDetay />} />
        <Route path="/servis-raporlari" element={<ServisRaporlari />} />
        <Route path="/dokuman-merkezi" element={<DokümanMerkezi />} />
        <Route path="/kargolar" element={<Kargolar />} />
        <Route path="/kargolar/:id" element={<KargoDetay />} />
        <Route path="/takvim" element={<Takvim />} />
        <Route path="/memnuniyet" element={<MemnuniyetDegerlendirme />} />
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </MainLayout>
  )
}

export default App