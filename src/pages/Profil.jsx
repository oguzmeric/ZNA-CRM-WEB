import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { teklifleriGetir } from '../services/teklifService'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { gorevleriGetir } from '../services/gorevService'

const durumRenkleri = {
  cevrimici: '#22c55e',
  mesgul: '#ef4444',
  disarida: '#f59e0b',
  toplantida: '#014486',
  cevrimdisi: '#6b7280',
}

const durumIsimleri = {
  cevrimici: 'Çevrimiçi',
  mesgul: 'Meşgul',
  disarida: 'Dışarıda',
  toplantida: 'Toplantıda',
  cevrimdisi: 'Çevrimdışı',
}

function saniyeFormat(saniye) {
  if (!saniye || saniye === 0) return '0s'
  if (saniye < 60) return `${saniye}s`
  if (saniye < 3600) return `${Math.floor(saniye / 60)}dk ${saniye % 60}s`
  return `${Math.floor(saniye / 3600)}sa ${Math.floor((saniye % 3600) / 60)}dk`
}

function Profil() {
  const { kullanici, kullaniciGuncelle, durumGuncelle } = useAuth()
  const [aktifSekme, setAktifSekme] = useState('genel')
  const [sifreDegistir, setSifreDegistir] = useState(false)
  const [form, setForm] = useState({
    ad: kullanici?.ad || '',
    kullaniciAdi: kullanici?.kullaniciAdi || '',
    mevcutSifre: '',
    yeniSifre: '',
    yeniSifreTekrar: '',
  })
  const [kaydetMesaj, setKaydetMesaj] = useState('')
  const [yukleniyor, setYukleniyor] = useState(true)

  const [teklifler, setTeklifler] = useState([])
  const [gorevler, setGorevler] = useState([])
  const [gorusmeler, setGorusmeler] = useState([])

  const aktiviteLoglari = JSON.parse(localStorage.getItem('aktiviteLog') || '[]')

  useEffect(() => {
    const verileriYukle = async () => {
      setYukleniyor(true)
      const [t, g, gr] = await Promise.all([
        teklifleriGetir(),
        gorevleriGetir(),
        gorusmeleriGetir(),
      ])
      setTeklifler(t || [])
      setGorevler(g || [])
      setGorusmeler(gr || [])
      setYukleniyor(false)
    }
    verileriYukle()
  }, [])

  const benimTeklifler = teklifler.filter((t) => t.hazirlayan === kullanici?.ad)
  const benimGorevler = gorevler.filter((g) => g.atanan === kullanici?.id?.toString())
  const benimGorusmeler = gorusmeler.filter((g) => g.gorusen === kullanici?.ad)
  const benimLoglar = aktiviteLoglari.filter((l) => l.kullaniciId === kullanici?.id?.toString())

  const kabulOrani = benimTeklifler.length > 0
    ? Math.round((benimTeklifler.filter((t) => t.onayDurumu === 'kabul').length / benimTeklifler.length) * 100)
    : 0

  const tamamlananGorevler = benimGorevler.filter((g) => g.durum === 'tamamlandi').length
  const gorevTamamlamaOrani = benimGorevler.length > 0
    ? Math.round((tamamlananGorevler / benimGorevler.length) * 100)
    : 0

  const toplamOnlineSure = benimLoglar
    .filter((l) => l.tip === 'sayfa_cikis')
    .reduce((sum, l) => sum + (l.sureSaniye || 0), 0)

  const toplamGiris = benimLoglar.filter((l) => l.tip === 'kullanici_giris').length

  const sayfaSayilari = {}
  benimLoglar.filter((l) => l.tip === 'sayfa_giris').forEach((l) => {
    sayfaSayilari[l.sayfa] = (sayfaSayilari[l.sayfa] || 0) + 1
  })
  const enCokSayfalar = Object.entries(sayfaSayilari)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const sonGiris = benimLoglar
    .filter((l) => l.tip === 'kullanici_giris')
    .sort((a, b) => new Date(b.tarih) - new Date(a.tarih))[0]

  const buAyTeklif = benimTeklifler.filter((t) => {
    const tarih = new Date(t.tarih)
    const bugun = new Date()
    return tarih.getMonth() === bugun.getMonth() && tarih.getFullYear() === bugun.getFullYear()
  }).length

  const bilgiKaydet = () => {
    if (!form.ad || !form.kullaniciAdi) {
      setKaydetMesaj('Ad ve kullanıcı adı zorunludur!')
      return
    }
    if (sifreDegistir) {
      if (form.mevcutSifre !== kullanici?.sifre) {
        setKaydetMesaj('Mevcut şifre hatalı!')
        return
      }
      if (form.yeniSifre !== form.yeniSifreTekrar) {
        setKaydetMesaj('Yeni şifreler eşleşmiyor!')
        return
      }
      if (form.yeniSifre.length < 4) {
        setKaydetMesaj('Şifre en az 4 karakter olmalı!')
        return
      }
      kullaniciGuncelle(kullanici.id, {
        ad: form.ad,
        kullaniciAdi: form.kullaniciAdi,
        sifre: form.yeniSifre,
      })
    } else {
      kullaniciGuncelle(kullanici.id, {
        ad: form.ad,
        kullaniciAdi: form.kullaniciAdi,
      })
    }
    setKaydetMesaj('✅ Bilgiler güncellendi!')
    setSifreDegistir(false)
    setForm({ ...form, mevcutSifre: '', yeniSifre: '', yeniSifreTekrar: '' })
    setTimeout(() => setKaydetMesaj(''), 3000)
  }

  if (yukleniyor) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-sm text-gray-400">Yükleniyor...</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {/* Profil başlığı */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center gap-5">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl font-bold">
              {kullanici?.ad?.charAt(0)}
            </div>
            <div
              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white"
              style={{ backgroundColor: durumRenkleri[kullanici?.durum || 'cevrimici'] }}
            />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-800">{kullanici?.ad}</h2>
            <p className="text-sm text-gray-400">@{kullanici?.kullaniciAdi}</p>
            <div className="flex items-center gap-2 mt-1">
              <span style={{ color: durumRenkleri[kullanici?.durum || 'cevrimici'] }} className="text-xs">●</span>
              <span className="text-xs text-gray-500">{durumIsimleri[kullanici?.durum || 'cevrimici']}</span>
            </div>
          </div>

          {/* Hızlı durum değiştir */}
          <div className="flex gap-2">
            {Object.entries(durumIsimleri).map(([key, isim]) => (
              <button
                key={key}
                onClick={() => durumGuncelle(key)}
                title={isim}
                className={`w-7 h-7 rounded-full border-2 transition ${
                  (kullanici?.durum || 'cevrimici') === key ? 'border-gray-400 scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                }`}
                style={{ backgroundColor: durumRenkleri[key] }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {[
          { id: 'genel', isim: '📊 Genel Bakış' },
          { id: 'istatistik', isim: '📈 İstatistikler' },
          { id: 'ayarlar', isim: '⚙️ Ayarlar' },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => setAktifSekme(s.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              aktifSekme === s.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {s.isim}
          </button>
        ))}
      </div>

      {/* GENEL BAKIŞ */}
      {aktifSekme === 'genel' && (
        <div className="space-y-6">

          {/* Özet kartlar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
              <p className="text-xs text-gray-400 mb-2">Toplam Teklif</p>
              <p className="text-3xl font-bold text-blue-600">{benimTeklifler.length}</p>
              <p className="text-xs text-gray-400 mt-1">Bu ay: {buAyTeklif}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
              <p className="text-xs text-gray-400 mb-2">Kabul Oranı</p>
              <p className="text-3xl font-bold text-green-600">%{kabulOrani}</p>
              <p className="text-xs text-gray-400 mt-1">
                {benimTeklifler.filter((t) => t.onayDurumu === 'kabul').length} kabul
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
              <p className="text-xs text-gray-400 mb-2">Görev Başarısı</p>
              <p className="text-3xl font-bold text-purple-600">%{gorevTamamlamaOrani}</p>
              <p className="text-xs text-gray-400 mt-1">
                {tamamlananGorevler}/{benimGorevler.length} tamamlandı
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
              <p className="text-xs text-gray-400 mb-2">Görüşmeler</p>
              <p className="text-3xl font-bold text-amber-500">{benimGorusmeler.length}</p>
              <p className="text-xs text-gray-400 mt-1">
                {benimGorusmeler.filter((g) => g.durum === 'acik').length} açık
              </p>
            </div>
          </div>

          {/* Online aktivite */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm font-medium text-gray-700 mb-4">Sistem Aktivitesi</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">Toplam Giriş</p>
                <p className="text-xl font-bold text-gray-800">{toplamGiris}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">Toplam Online Süre</p>
                <p className="text-xl font-bold text-blue-600">{saniyeFormat(toplamOnlineSure)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">Son Giriş</p>
                <p className="text-sm font-medium text-gray-700">
                  {sonGiris
                    ? new Date(sonGiris.tarih).toLocaleDateString('tr-TR') + ' ' +
                      new Date(sonGiris.tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* En çok kullanılan sayfalar */}
          {enCokSayfalar.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <p className="text-sm font-medium text-gray-700 mb-4">En Çok Kullandığım Sayfalar</p>
              <div className="space-y-3">
                {enCokSayfalar.map(([sayfa, adet], i) => {
                  const maxAdet = enCokSayfalar[0][1]
                  const yuzde = Math.round((adet / maxAdet) * 100)
                  return (
                    <div key={sayfa}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-700">{sayfa}</span>
                        <span className="text-xs text-gray-400">{adet} ziyaret</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: `${yuzde}%`,
                            backgroundColor: ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899'][i],
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* İSTATİSTİKLER */}
      {aktifSekme === 'istatistik' && (
        <div className="space-y-6">

          {/* Teklif istatistikleri */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm font-medium text-gray-700 mb-4">Teklif İstatistikleri</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-800">{benimTeklifler.length}</p>
                <p className="text-xs text-gray-400">Toplam</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {benimTeklifler.filter((t) => t.onayDurumu === 'kabul').length}
                </p>
                <p className="text-xs text-gray-400">Kabul</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {benimTeklifler.filter((t) => t.onayDurumu === 'takipte').length}
                </p>
                <p className="text-xs text-gray-400">Takipte</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-500">
                  {benimTeklifler.filter((t) => t.onayDurumu === 'vazgecildi').length}
                </p>
                <p className="text-xs text-gray-400">Vazgeçildi</p>
              </div>
            </div>

            {benimTeklifler.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-2">Kabul Edilen Toplam Tutar</p>
                <p className="text-2xl font-bold text-green-600">
                  ₺{benimTeklifler
                    .filter((t) => t.onayDurumu === 'kabul')
                    .reduce((sum, t) => sum + (t.genelToplam || 0), 0)
                    .toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}
          </div>

          {/* Görev istatistikleri */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm font-medium text-gray-700 mb-4">Görev İstatistikleri</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-800">{benimGorevler.length}</p>
                <p className="text-xs text-gray-400">Toplam</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{tamamlananGorevler}</p>
                <p className="text-xs text-gray-400">Tamamlandı</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {benimGorevler.filter((g) => g.durum === 'devam').length}
                </p>
                <p className="text-xs text-gray-400">Devam Ediyor</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-500">
                  {benimGorevler.filter((g) => g.durum === 'bekliyor').length}
                </p>
                <p className="text-xs text-gray-400">Bekliyor</p>
              </div>
            </div>

            {/* Geciken görevler */}
            {benimGorevler.filter((g) => g.durum !== 'tamamlandi' && g.sonTarih && new Date(g.sonTarih) < new Date()).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-red-500 font-medium mb-2">
                  ⚠️ {benimGorevler.filter((g) => g.durum !== 'tamamlandi' && g.sonTarih && new Date(g.sonTarih) < new Date()).length} gecikmiş görev
                </p>
                {benimGorevler
                  .filter((g) => g.durum !== 'tamamlandi' && g.sonTarih && new Date(g.sonTarih) < new Date())
                  .map((g) => (
                    <div key={g.id} className="flex items-center justify-between py-1.5 border-b border-gray-50">
                      <p className="text-sm text-gray-700">{g.baslik}</p>
                      <p className="text-xs text-red-500">{g.sonTarih}</p>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Görüşme istatistikleri */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm font-medium text-gray-700 mb-4">Görüşme İstatistikleri</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-800">{benimGorusmeler.length}</p>
                <p className="text-xs text-gray-400">Toplam</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {benimGorusmeler.filter((g) => g.durum === 'acik').length}
                </p>
                <p className="text-xs text-gray-400">Açık</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {benimGorusmeler.filter((g) => g.durum === 'kapali').length}
                </p>
                <p className="text-xs text-gray-400">Kapalı</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AYARLAR */}
      {aktifSekme === 'ayarlar' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm font-medium text-gray-700 mb-4">Kişisel Bilgiler</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Ad Soyad</label>
                <input
                  type="text"
                  value={form.ad}
                  onChange={(e) => setForm({ ...form, ad: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Kullanıcı Adı</label>
                <input
                  type="text"
                  value={form.kullaniciAdi}
                  onChange={(e) => setForm({ ...form, kullaniciAdi: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sifreDegistir}
                  onChange={(e) => setSifreDegistir(e.target.checked)}
                  className="accent-blue-600"
                />
                <span className="text-sm text-gray-600">Şifre değiştir</span>
              </label>
            </div>

            {sifreDegistir && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Mevcut Şifre</label>
                  <input
                    type="password"
                    value={form.mevcutSifre}
                    onChange={(e) => setForm({ ...form, mevcutSifre: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Yeni Şifre</label>
                  <input
                    type="password"
                    value={form.yeniSifre}
                    onChange={(e) => setForm({ ...form, yeniSifre: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Yeni Şifre Tekrar</label>
                  <input
                    type="password"
                    value={form.yeniSifreTekrar}
                    onChange={(e) => setForm({ ...form, yeniSifreTekrar: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            )}

            {kaydetMesaj && (
              <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${
                kaydetMesaj.includes('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
              }`}>
                {kaydetMesaj}
              </div>
            )}

            <button
              onClick={bilgiKaydet}
              className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Kaydet
            </button>
          </div>

          {/* Durum ayarları */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm font-medium text-gray-700 mb-4">Durum Ayarları</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(durumIsimleri).map(([key, isim]) => (
                <button
                  key={key}
                  onClick={() => durumGuncelle(key)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition ${
                    (kullanici?.durum || 'cevrimici') === key
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: durumRenkleri[key] }} />
                  <span className="text-sm text-gray-700">{isim}</span>
                  {(kullanici?.durum || 'cevrimici') === key && (
                    <span className="ml-auto text-blue-500 text-xs">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Profil