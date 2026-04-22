import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import CustomSelect from '../components/CustomSelect'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { firmalariGetir, firmaEkle, firmaGuncelle, firmaSil as dbFirmaSil } from '../services/firmaService'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { teklifleriGetir } from '../services/teklifService'
import { lisanslariGetir } from '../services/lisansService'

const sektorler = [
  'Teknoloji', 'Güvenlik', 'İnşaat', 'Sağlık', 'Eğitim',
  'Üretim', 'Lojistik', 'Finans', 'Perakende', 'Diğer'
]

const bosForm = {
  firmaAdi: '',
  vergiNo: '',
  sektor: '',
  telefon: '',
  email: '',
  adres: '',
  sehir: '',
  notlar: '',
}

const sektorRenk = {
  'Teknoloji': '#0176D3',
  'Güvenlik': '#ef4444',
  'İnşaat': '#f59e0b',
  'Sağlık': '#10b981',
  'Eğitim': '#3b82f6',
  'Üretim': '#014486',
  'Lojistik': '#ec4899',
  'Finans': '#14b8a6',
  'Perakende': '#f97316',
  'Diğer': '#6b7280',
}

function Firmalar() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [firmalar, setFirmalar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [gorusmeler, setGorusmeler] = useState([])
  const [teklifler, setTeklifler] = useState([])
  const [lisanslar, setLisanslar] = useState([])
  const [form, setForm] = useState(bosForm)
  const [goster, setGoster] = useState(false)
  const [duzenleId, setDuzenleId] = useState(null)
  const [arama, setArama] = useState('')

  useEffect(() => {
    firmalariGetir().then(data => { setFirmalar(data); setYukleniyor(false) })
    gorusmeleriGetir().then(setGorusmeler)
    teklifleriGetir().then(setTeklifler)
    lisanslariGetir().then(setLisanslar)
  }, [])

  if (yukleniyor) return <div className="p-6 text-center text-gray-400">Yükleniyor...</div>

  const firmaKoduOlustur = (mevcutFirmalar) => {
    const sayi = mevcutFirmalar.length + 1
    return `FRM-${String(sayi).padStart(4, '0')}`
  }

  const firmaIstatistik = (firmaAdi) => {
    return {
      gorusme: gorusmeler.filter((g) => g.firmaAdi === firmaAdi).length,
      teklif: teklifler.filter((t) => t.firmaAdi === firmaAdi).length,
      lisans: lisanslar.filter((l) => l.firmaAdi === firmaAdi).length,
      kabulTeklif: teklifler.filter((t) => t.firmaAdi === firmaAdi && t.onayDurumu === 'kabul').length,
    }
  }

  const kaydet = async () => {
    if (!form.firmaAdi) {
      alert('Firma adı zorunludur!')
      return
    }
    if (duzenleId) {
      const guncellendi = await firmaGuncelle(duzenleId, form)
      if (guncellendi) setFirmalar(prev => prev.map(f => f.id === duzenleId ? guncellendi : f))
      toast.success('Firma güncellendi.')
      setDuzenleId(null)
    } else {
      const yeni = await firmaEkle({
        ...form,
        kod: firmaKoduOlustur(firmalar),
        olusturmaTarih: new Date().toISOString(),
      })
      if (yeni) setFirmalar(prev => [yeni, ...prev])
      toast.success('Firma kaydedildi.')
    }
    setForm(bosForm)
    setGoster(false)
  }

  const duzenleAc = (f) => {
    setForm({
      firmaAdi: f.firmaAdi,
      vergiNo: f.vergiNo || '',
      sektor: f.sektor || '',
      telefon: f.telefon || '',
      email: f.email || '',
      adres: f.adres || '',
      sehir: f.sehir || '',
      notlar: f.notlar || '',
    })
    setDuzenleId(f.id)
    setGoster(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const firmaSil = async (id) => {
    const onay = await confirm({
      baslik: 'Firmayı Sil',
      mesaj: 'Bu firmayı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      onayMetin: 'Evet, Sil',
      iptalMetin: 'Vazgeç',
      tip: 'tehlikeli',
    })
    if (!onay) return
    await dbFirmaSil(id)
    setFirmalar(prev => prev.filter(f => f.id !== id))
    toast.success('Firma silindi.')
  }

  const gorunenFirmalar = firmalar.filter((f) =>
    arama === '' ||
    (f.firmaAdi || '').toLowerCase().includes(arama.toLowerCase()) ||
    (f.kod || '').toLowerCase().includes(arama.toLowerCase()) ||
    (f.vergiNo || '').toLowerCase().includes(arama.toLowerCase()) ||
    (f.sektor || '').toLowerCase().includes(arama.toLowerCase()) ||
    (f.sehir || '').toLowerCase().includes(arama.toLowerCase())
  )

  return (
    <div className="p-6">

      {/* Başlık */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Firmalar</h2>
          <p className="text-sm text-gray-400 mt-1">{firmalar.length} firma kayıtlı</p>
        </div>
        <button
          onClick={() => { setGoster(true); setDuzenleId(null); setForm(bosForm) }}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          + Yeni Firma
        </button>
      </div>

      {/* Arama */}
      <div className="mb-6">
        <input
          type="text"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Firma adı, kod, vergi no, sektör veya şehir ara..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Form */}
      {goster && (
        <div className="bg-white rounded-xl p-6 mb-6 border border-blue-100 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">
            {duzenleId ? 'Firmayı Düzenle' : 'Yeni Firma'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Firma Adı *</label>
              <input
                type="text"
                value={form.firmaAdi}
                onChange={(e) => setForm({ ...form, firmaAdi: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="BTM Health A.Ş."
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Vergi No</label>
              <input
                type="text"
                value={form.vergiNo}
                onChange={(e) => setForm({ ...form, vergiNo: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="1234567890"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Sektör</label>
              <CustomSelect
                value={form.sektor}
                onChange={(e) => setForm({ ...form, sektor: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Seçin...</option>
                {sektorler.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </CustomSelect>
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Telefon</label>
              <input
                type="text"
                value={form.telefon}
                onChange={(e) => setForm({ ...form, telefon: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0212 000 00 00"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">E-posta</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="info@firma.com"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Şehir</label>
              <input
                type="text"
                value={form.sehir}
                onChange={(e) => setForm({ ...form, sehir: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="İstanbul"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-gray-600 mb-1 block">Adres</label>
              <input
                type="text"
                value={form.adres}
                onChange={(e) => setForm({ ...form, adres: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Mahalle, sokak, no..."
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Notlar</label>
              <input
                type="text"
                value={form.notlar}
                onChange={(e) => setForm({ ...form, notlar: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Kısa not..."
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
              onClick={() => { setGoster(false); setForm(bosForm); setDuzenleId(null) }}
              className="text-sm px-5 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {/* Firma listesi */}
      {gorunenFirmalar.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
          <p className="text-4xl mb-3">🏢</p>
          <p className="text-gray-400 text-sm">
            {arama ? 'Arama sonucu bulunamadı.' : 'Henüz firma eklenmedi.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {gorunenFirmalar.map((f) => {
          const istat = firmaIstatistik(f.firmaAdi)
          const renk = sektorRenk[f.sektor] || '#0176D3'

          return (
            <div
              key={f.id}
              className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden cursor-pointer hover:shadow-md hover:border-blue-100 transition-all"
              onClick={() => navigate(`/firma-gecmisi/${encodeURIComponent(f.firmaAdi)}`)}
            >
              {/* Üst renkli şerit */}
              <div className="h-1 w-full" style={{ background: renk }} />

              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-base font-bold flex-shrink-0"
                      style={{ background: renk }}
                    >
                      {f.firmaAdi?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{f.firmaAdi}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-mono text-gray-400">{f.kod}</span>
                        {f.sektor && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                            {f.sektor}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => duzenleAc(f)}
                      className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition text-gray-500"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => firmaSil(f.id)}
                      className="text-xs px-2 py-1.5 rounded-lg border border-red-100 hover:bg-red-50 transition text-red-400"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* İletişim bilgileri */}
                <div className="flex flex-wrap gap-3 mb-4 text-xs text-gray-400">
                  {f.telefon && <span>📞 {f.telefon}</span>}
                  {f.email && <span>✉️ {f.email}</span>}
                  {f.sehir && <span>📍 {f.sehir}</span>}
                  {f.vergiNo && <span>🧾 {f.vergiNo}</span>}
                </div>

                {f.notlar && (
                  <p className="text-xs text-gray-400 italic mb-4 line-clamp-1">{f.notlar}</p>
                )}

                {/* İstatistikler */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="flex gap-4">
                    <div className="text-center">
                      <p className="text-base font-bold text-blue-500">{istat.gorusme}</p>
                      <p className="text-xs text-gray-400">Görüşme</p>
                    </div>
                    <div className="text-center">
                      <p className="text-base font-bold text-blue-700">{istat.teklif}</p>
                      <p className="text-xs text-gray-400">Teklif</p>
                    </div>
                    <div className="text-center">
                      <p className="text-base font-bold text-green-500">{istat.kabulTeklif}</p>
                      <p className="text-xs text-gray-400">Kabul</p>
                    </div>
                    <div className="text-center">
                      <p className="text-base font-bold text-indigo-600">{istat.lisans}</p>
                      <p className="text-xs text-gray-400">Lisans</p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-blue-600 px-3 py-1 rounded-lg bg-blue-50">
                    Geçmişi Gör →
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Firmalar
