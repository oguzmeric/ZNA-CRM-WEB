import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { lisanslariGetir, lisansEkle, lisansGuncelle, lisansSil as dbLisansSil } from '../services/lisansService'
import { musterileriGetir } from '../services/musteriService'
import CustomSelect from '../components/CustomSelect'

const lisansTurleri = [
  'Trassir Server',
  'Trassir Client',
  'Trassir Cloud',
  'Trassir NVR',
  'Trassir DVR',
  'Trassir Analitik',
  'Diğer',
]

const lisansTipleri = [
  { id: 'sureksiz', isim: 'Süreli' },
  { id: 'sureksiz_demo', isim: 'Demo' },
  { id: 'sureksiz_surekli', isim: 'Sürekli' },
]

const demoSureler = [7, 14, 30, 60, 90]

const durumlar = [
  { id: 'aktif', isim: 'Aktif', renk: 'bg-green-100 text-green-700' },
  { id: 'pasif', isim: 'Pasif', renk: 'bg-gray-100 text-gray-600' },
  { id: 'suresi_doldu', isim: 'Süresi Doldu', renk: 'bg-red-100 text-red-600' },
  { id: 'beklemede', isim: 'Beklemede', renk: 'bg-amber-100 text-amber-700' },
]

const bosForm = {
  lisansKodu: '',
  lisansId: '',
  lisansTuru: '',
  lisansTipi: 'sureksiz',
  demoGun: '30',
  musteriId: '',
  firmaAdi: '',
  lokasyon: '',
  sunucuAdi: '',
  kanalSayisi: '',
  baslangicTarih: new Date().toISOString().split('T')[0],
  bitisTarih: '',
  durum: 'aktif',
  notlar: '',
}

function lisansKoduOlustur(mevcutlar) {
  const sayi = mevcutlar.length + 1
  return `TRS-${String(sayi).padStart(4, '0')}`
}

function demoBitisTarih(baslangic, gun) {
  const tarih = new Date(baslangic)
  tarih.setDate(tarih.getDate() + Number(gun))
  return tarih.toISOString().split('T')[0]
}

function TrassirLisanslar() {
  const { kullanicilar } = useAuth()
  const { toast } = useToast()
  const [lisanslar, setLisanslar] = useState([])
  const [musteriler, setMusteriler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [form, setForm] = useState(bosForm)
  const [goster, setGoster] = useState(false)
  const [duzenleId, setDuzenleId] = useState(null)
  const [filtre, setFiltre] = useState('hepsi')
  const [arama, setArama] = useState('')
  const [kodModu, setKodModu] = useState('otomatik')

  useEffect(() => {
    Promise.all([
      lisanslariGetir(),
      musterileriGetir(),
    ]).then(([lisansData, musteriData]) => {
      setLisanslar(lisansData)
      setMusteriler(musteriData)
      setYukleniyor(false)
    })
  }, [])

  if (yukleniyor) return <div className="p-6 text-center text-gray-400">Yükleniyor...</div>

  const formAc = () => {
    setForm({ ...bosForm, lisansKodu: lisansKoduOlustur(lisanslar) })
    setKodModu('otomatik')
    setDuzenleId(null)
    setGoster(true)
  }

  const duzenleAc = (l) => {
    setForm({
      lisansKodu: l.lisansKodu,
      lisansId: l.lisansId || '',
      lisansTuru: l.lisansTuru,
      lisansTipi: l.lisansTipi || 'sureksiz',
      demoGun: l.demoGun || '30',
      musteriId: l.musteriId || '',
      firmaAdi: l.firmaAdi || '',
      lokasyon: l.lokasyon || '',
      sunucuAdi: l.sunucuAdi || '',
      kanalSayisi: l.kanalSayisi || '',
      baslangicTarih: l.baslangicTarih || '',
      bitisTarih: l.bitisTarih || '',
      durum: l.durum,
      notlar: l.notlar || '',
    })
    setKodModu('manuel')
    setDuzenleId(l.id)
    setGoster(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleMusteriSec = (musteriId) => {
    const musteri = musteriler.find((m) => m.id?.toString() === musteriId)
    setForm({ ...form, musteriId, firmaAdi: musteri ? musteri.firma : '' })
  }

  const handleTipiDegis = (tipi) => {
    const yeniForm = { ...form, lisansTipi: tipi }
    if (tipi === 'sureksiz_surekli') {
      yeniForm.bitisTarih = ''
    } else if (tipi === 'sureksiz_demo') {
      yeniForm.bitisTarih = demoBitisTarih(form.baslangicTarih, form.demoGun)
    }
    setForm(yeniForm)
  }

  const handleDemoGunDegis = (gun) => {
    setForm({
      ...form,
      demoGun: gun,
      bitisTarih: demoBitisTarih(form.baslangicTarih, gun),
    })
  }

  const kaydet = async () => {
    if (!form.lisansKodu || !form.lisansTuru || !form.firmaAdi) {
      alert('Lisans kodu, tür ve firma zorunludur!')
      return
    }
    const kodVarMi = lisanslar.find(
      (l) => l.lisansKodu === form.lisansKodu && l.id !== duzenleId
    )
    if (kodVarMi) {
      alert('Bu lisans kodu zaten kullanılıyor!')
      return
    }
    const lisansIdVarMi = form.lisansId && lisanslar.find(
      (l) => l.lisansId === form.lisansId && l.id !== duzenleId
    )
    if (lisansIdVarMi) {
      alert('Bu Lisans ID zaten kayıtlı!')
      return
    }

    if (duzenleId) {
      const guncellendi = await lisansGuncelle(duzenleId, form)
      if (guncellendi) setLisanslar(prev => prev.map(l => l.id === duzenleId ? guncellendi : l))
      toast.success('Lisans güncellendi.')
    } else {
      const yeni = await lisansEkle({ ...form, olusturmaTarih: new Date().toISOString() })
      if (yeni) setLisanslar(prev => [yeni, ...prev])
      toast.success('Lisans kaydedildi.')
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

  const lisansSil = async (id) => {
    await dbLisansSil(id)
    setLisanslar(prev => prev.filter(l => l.id !== id))
    toast.success('Lisans silindi.')
  }

  const bugunDate = new Date()

  const gorunenLisanslar = lisanslar
    .filter((l) => filtre === 'hepsi' || l.durum === filtre)
    .filter((l) => {
      if (arama === '') return true
      const aramaMetni = arama.toLowerCase().trim()
      return (
        (l.lisansKodu || '').toLowerCase().includes(aramaMetni) ||
        (l.lisansId || '').toLowerCase().includes(aramaMetni) ||
        (l.firmaAdi || '').toLowerCase().includes(aramaMetni) ||
        (l.lokasyon || '').toLowerCase().includes(aramaMetni) ||
        (l.sunucuAdi || '').toLowerCase().includes(aramaMetni) ||
        (l.lisansTuru || '').toLowerCase().includes(aramaMetni) ||
        (l.notlar || '').toLowerCase().includes(aramaMetni)
      )
    })

  const yakinBitenler = lisanslar.filter((l) => {
    if (!l.bitisTarih || l.durum !== 'aktif' || l.lisansTipi === 'sureksiz_surekli') return false
    const bitis = new Date(l.bitisTarih)
    const fark = (bitis - bugunDate) / (1000 * 60 * 60 * 24)
    return fark <= 30 && fark >= 0
  })

  return (
    <div className="p-6">

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <img src="/trassirlogo2.jpg" alt="Trassir" className="h-14 object-contain" />
          <div>
            <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Trassir Lisanslar</h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{lisanslar.length} lisans kayıtlı</p>
          </div>
        </div>
        <button
          onClick={formAc}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          + Yeni Lisans
        </button>
      </div>

      {yakinBitenler.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <span className="text-amber-500 text-lg">⚠️</span>
          <div>
            <p className="text-sm font-medium text-amber-700">
              {yakinBitenler.length} lisansın süresi 30 gün içinde doluyor!
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {yakinBitenler.map((l) => l.firmaAdi).join(', ')}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">Toplam Lisans</p>
          <p className="text-2xl font-bold text-gray-800">{lisanslar.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">Aktif</p>
          <p className="text-2xl font-bold text-green-600">
            {lisanslar.filter((l) => l.durum === 'aktif').length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">Süresi Dolmuş</p>
          <p className="text-2xl font-bold text-red-500">
            {lisanslar.filter((l) => l.durum === 'suresi_doldu').length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">30 Günde Bitiyor</p>
          <p className="text-2xl font-bold text-amber-500">{yakinBitenler.length}</p>
        </div>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap">
        <input
          type="text"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Lisans kodu, ID, firma, sunucu ara..."
          className="flex-1 min-w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2 flex-wrap">
          {[{ id: 'hepsi', isim: 'Tümü' }, ...durumlar].map((d) => (
            <button
              key={d.id}
              onClick={() => setFiltre(d.id)}
              className={`text-sm px-3 py-2 rounded-lg border transition ${
                filtre === d.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
            >
              {d.isim}
            </button>
          ))}
        </div>
      </div>

      {goster && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-blue-100">
          <h3 className="font-medium text-gray-800 mb-4">
            {duzenleId ? 'Lisansı Düzenle' : 'Yeni Lisans'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Kayıt Kodu *</label>
              {!duzenleId && (
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => {
                      setKodModu('otomatik')
                      setForm({ ...form, lisansKodu: lisansKoduOlustur(lisanslar) })
                    }}
                    className={`text-xs px-3 py-1 rounded-lg border transition ${
                      kodModu === 'otomatik'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-500 border-gray-200'
                    }`}
                  >
                    Otomatik
                  </button>
                  <button
                    onClick={() => {
                      setKodModu('manuel')
                      setForm({ ...form, lisansKodu: '' })
                    }}
                    className={`text-xs px-3 py-1 rounded-lg border transition ${
                      kodModu === 'manuel'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-500 border-gray-200'
                    }`}
                  >
                    Manuel
                  </button>
                </div>
              )}
              {kodModu === 'otomatik' && !duzenleId ? (
                <span className="text-sm font-mono bg-blue-50 text-blue-700 px-3 py-2 rounded-lg block">
                  {form.lisansKodu}
                </span>
              ) : (
                <input
                  type="text"
                  value={form.lisansKodu}
                  onChange={(e) => setForm({ ...form, lisansKodu: e.target.value.toUpperCase() })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="TRS-0001"
                />
              )}
            </div>

            <div className="md:col-span-2">
              <label className="text-sm text-gray-600 mb-1 block">Trassir Lisans ID</label>
              <input
                type="text"
                value={form.lisansId}
                onChange={(e) => setForm({ ...form, lisansId: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0x411255E1"
              />
              <p className="text-xs text-gray-400 mt-1">Trassir sisteminden kopyalayın</p>
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Lisans Türü *</label>
              <CustomSelect
                value={form.lisansTuru}
                onChange={(e) => setForm({ ...form, lisansTuru: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tür seç...</option>
                {lisansTurleri.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </CustomSelect>
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Lisans Tipi *</label>
              <div className="flex gap-2">
                {lisansTipleri.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleTipiDegis(t.id)}
                    className={`flex-1 text-sm py-2 rounded-lg border transition ${
                      form.lisansTipi === t.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {t.isim}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Durum</label>
              <CustomSelect
                value={form.durum}
                onChange={(e) => setForm({ ...form, durum: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {durumlar.map((d) => (
                  <option key={d.id} value={d.id}>{d.isim}</option>
                ))}
              </CustomSelect>
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Müşteri Seç</label>
              <CustomSelect
                value={form.musteriId}
                onChange={(e) => handleMusteriSec(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Müşteri seç...</option>
                {musteriler.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.ad} {m.soyad} — {m.firma}
                  </option>
                ))}
              </CustomSelect>
            </div>

            <div className="md:col-span-2">
              <label className="text-sm text-gray-600 mb-1 block">Firma Adı *</label>
              <input
                type="text"
                value={form.firmaAdi}
                onChange={(e) => setForm({ ...form, firmaAdi: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Müşteri seçin veya direkt yazın..."
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm text-gray-600 mb-1 block">Lokasyon / Şube</label>
              <input
                type="text"
                value={form.lokasyon}
                onChange={(e) => setForm({ ...form, lokasyon: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Örn: Hayvan Hastanesi, Merkez Bina, 2. Şube..."
              />
              <p className="text-xs text-gray-400 mt-1">Lisansın atandığı şube veya lokasyonu belirtin</p>
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Sunucu Adı / IP</label>
              <input
                type="text"
                value={form.sunucuAdi}
                onChange={(e) => setForm({ ...form, sunucuAdi: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="192.168.1.1"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Kanal Sayısı</label>
              <input
                type="number"
                value={form.kanalSayisi}
                onChange={(e) => setForm({ ...form, kanalSayisi: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
                min="0"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Başlangıç Tarihi</label>
              <input
                type="date"
                value={form.baslangicTarih}
                onChange={(e) => {
                  const yeni = { ...form, baslangicTarih: e.target.value }
                  if (form.lisansTipi === 'sureksiz_demo') {
                    yeni.bitisTarih = demoBitisTarih(e.target.value, form.demoGun)
                  }
                  setForm(yeni)
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {form.lisansTipi === 'sureksiz' && (
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Bitiş Tarihi</label>
                <input
                  type="date"
                  value={form.bitisTarih}
                  onChange={(e) => setForm({ ...form, bitisTarih: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {form.lisansTipi === 'sureksiz_demo' && (
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Demo Süresi</label>
                <CustomSelect
                  value={form.demoGun}
                  onChange={(e) => handleDemoGunDegis(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {demoSureler.map((g) => (
                    <option key={g} value={g}>{g} gün</option>
                  ))}
                </CustomSelect>
                {form.bitisTarih && (
                  <p className="text-xs text-gray-400 mt-1">Bitiş: {form.bitisTarih}</p>
                )}
              </div>
            )}

            {form.lisansTipi === 'sureksiz_surekli' && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <span className="text-green-600 text-lg">∞</span>
                <p className="text-sm text-green-700 font-medium">Sürekli Lisans — Bitiş tarihi yok</p>
              </div>
            )}

            <div className="md:col-span-3">
              <label className="text-sm text-gray-600 mb-1 block">Notlar</label>
              <textarea
                value={form.notlar}
                onChange={(e) => setForm({ ...form, notlar: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="Lisans hakkında notlar..."
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={kaydet}
              className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              {duzenleId ? 'Güncelle' : 'Kaydet'}
            </button>
            <button
              onClick={iptal}
              className="text-sm px-5 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
            >
              İptal
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wide">
          <div className="col-span-1">Kod</div>
          <div className="col-span-2">Lisans ID</div>
          <div className="col-span-2">Firma</div>
          <div className="col-span-1">Tür</div>
          <div className="col-span-1">Tip</div>
          <div className="col-span-1">Sunucu</div>
          <div className="col-span-1">Kanal</div>
          <div className="col-span-1">Bitiş</div>
          <div className="col-span-1">Durum</div>
          <div className="col-span-1"></div>
        </div>

        {gorunenLisanslar.length === 0 && (
          <div className="p-10 text-center text-gray-400 text-sm">
            {arama ? 'Arama sonucu bulunamadı.' : 'Henüz lisans eklenmedi.'}
          </div>
        )}

        {gorunenLisanslar.map((l) => {
          const durum = durumlar.find((d) => d.id === l.durum)
          const bitis = l.bitisTarih ? new Date(l.bitisTarih) : null
          const kalanGun = bitis
            ? Math.ceil((bitis - bugunDate) / (1000 * 60 * 60 * 24))
            : null

          return (
            <div
              key={l.id}
              className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition items-center"
            >
              <div className="col-span-1">
                <span className="text-xs font-mono text-gray-600">{l.lisansKodu}</span>
              </div>
              <div className="col-span-2">
                <span className="text-xs font-mono text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
                  {l.lisansId || '—'}
                </span>
              </div>
              <div className="col-span-2">
                <p className="text-sm font-medium text-gray-800 truncate">{l.firmaAdi}</p>
                {l.lokasyon && (
                  <p className="text-xs text-blue-500 truncate mt-0.5">📍 {l.lokasyon}</p>
                )}
              </div>
              <div className="col-span-1">
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full truncate block">
                  {l.lisansTuru}
                </span>
              </div>
              <div className="col-span-1">
                {l.lisansTipi === 'sureksiz_surekli' && (
                  <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">Sürekli</span>
                )}
                {l.lisansTipi === 'sureksiz_demo' && (
                  <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">Demo {l.demoGun}g</span>
                )}
                {l.lisansTipi === 'sureksiz' && (
                  <span className="text-xs bg-gray-50 text-gray-600 px-2 py-0.5 rounded-full">Süreli</span>
                )}
              </div>
              <div className="col-span-1">
                <p className="text-xs text-gray-500 truncate">{l.sunucuAdi || '—'}</p>
              </div>
              <div className="col-span-1">
                <p className="text-xs text-gray-500">{l.kanalSayisi || '—'}</p>
              </div>
              <div className="col-span-1">
                {l.lisansTipi === 'sureksiz_surekli' ? (
                  <span className="text-xs text-green-600">∞ Sürekli</span>
                ) : l.bitisTarih ? (
                  <div>
                    <p className="text-xs text-gray-500">{l.bitisTarih}</p>
                    {kalanGun !== null && kalanGun <= 30 && kalanGun >= 0 && (
                      <p className="text-xs text-amber-500">{kalanGun} gün kaldı</p>
                    )}
                    {kalanGun !== null && kalanGun < 0 && (
                      <p className="text-xs text-red-500">Doldu</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">—</p>
                )}
              </div>
              <div className="col-span-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${durum?.renk}`}>
                  {durum?.isim}
                </span>
              </div>
              <div className="col-span-1 flex gap-1 justify-end">
                <button
                  onClick={() => duzenleAc(l)}
                  className="text-xs text-blue-400 hover:text-blue-600 border border-blue-100 rounded-lg px-2 py-1 transition"
                >
                  Düzenle
                </button>
                <button
                  onClick={() => lisansSil(l.id)}
                  className="text-xs text-red-400 hover:text-red-600 border border-red-100 rounded-lg px-2 py-1 transition"
                >
                  Sil
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TrassirLisanslar
