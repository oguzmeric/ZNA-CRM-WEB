import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { musterileriGetir, musteriEkle, musteriGuncelle, musteriSil as dbMusteriSil } from '../services/musteriService'
import CustomSelect from '../components/CustomSelect'

const durumlar = [
  { id: 'aktif', isim: 'Aktif', renk: 'bg-green-100 text-green-700' },
  { id: 'lead', isim: 'Lead', renk: 'bg-amber-100 text-amber-700' },
  { id: 'pasif', isim: 'Pasif', renk: 'bg-gray-100 text-gray-600' },
  { id: 'kayip', isim: 'Kayıp', renk: 'bg-red-100 text-red-600' },
]

const bosForm = {
  ad: '',
  soyad: '',
  firma: '',
  unvan: '',
  telefon: '',
  email: '',
  sehir: '',
  vergiNo: '',
  notlar: '',
  durum: 'lead',
  kod: '',
}

const trNormalize = (str = '') =>
  str
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/İ/gi, 'i').replace(/I/g, 'i')

function firmaKoduOlustur(firmaAdi, mevcutMusteriler, mevcutKod = '') {
  const temiz = firmaAdi.toUpperCase().replace(/[^A-ZÇĞİÖŞÜ]/g, '')
  const prefix = temiz.substring(0, 3).padEnd(3, 'X')
  const ayniPrefix = mevcutMusteriler.filter(
    (m) => m.kod?.startsWith(prefix) && m.kod !== mevcutKod
  )
  const sayi = ayniPrefix.length + 1
  return `${prefix}-${String(sayi).padStart(4, '0')}`
}

function Musteriler() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [musteriler, setMusteriler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [form, setForm] = useState(bosForm)
  const [goster, setGoster] = useState(false)
  const [duzenleId, setDuzenleId] = useState(null)
  const [kodModu, setKodModu] = useState('otomatik')
  const [filtre, setFiltre] = useState('hepsi')
  const [arama, setArama] = useState('')

  useEffect(() => {
    musterileriGetir().then(data => { setMusteriler(data); setYukleniyor(false) })
  }, [])

  if (yukleniyor) return <div className="p-6 text-center text-gray-400">Yükleniyor...</div>

  const formAc = () => {
    setForm(bosForm)
    setKodModu('otomatik')
    setDuzenleId(null)
    setGoster(true)
  }

  const duzenleAc = (m, e) => {
    e.stopPropagation()
    setForm({
      ad: m.ad,
      soyad: m.soyad,
      firma: m.firma,
      unvan: m.unvan || '',
      telefon: m.telefon,
      email: m.email || '',
      sehir: m.sehir || '',
      vergiNo: m.vergiNo || '',
      notlar: m.notlar || '',
      durum: m.durum,
      kod: m.kod,
    })
    setKodModu('manuel')
    setDuzenleId(m.id)
    setGoster(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleFirmaChange = (firmaAdi) => {
    const yeniForm = { ...form, firma: firmaAdi }
    if (kodModu === 'otomatik' && firmaAdi.length >= 2) {
      yeniForm.kod = firmaKoduOlustur(firmaAdi, musteriler)
    } else if (kodModu === 'otomatik') {
      yeniForm.kod = ''
    }
    setForm(yeniForm)
  }

  const handleKodModu = (mod) => {
    setKodModu(mod)
    if (mod === 'otomatik' && form.firma.length >= 2) {
      setForm({ ...form, kod: firmaKoduOlustur(form.firma, musteriler) })
    } else if (mod === 'otomatik') {
      setForm({ ...form, kod: '' })
    } else {
      setForm({ ...form, kod: '' })
    }
  }

  const kaydet = async () => {
    if (!form.ad || !form.soyad || !form.telefon || !form.firma) {
      alert('Ad, soyad, firma ve telefon zorunludur!')
      return
    }
    if (!form.kod) {
      alert('Müşteri kodu zorunludur!')
      return
    }
    const kodVarMi = musteriler.find((m) => m.kod === form.kod && m.id !== duzenleId)
    if (kodVarMi) {
      alert('Bu müşteri kodu zaten kullanılıyor!')
      return
    }

    if (duzenleId) {
      const guncellendi = await musteriGuncelle(duzenleId, form)
      if (guncellendi) setMusteriler(prev => prev.map(m => m.id === duzenleId ? guncellendi : m))
      toast.success('Müşteri güncellendi.')
      setForm(bosForm)
      setDuzenleId(null)
      setGoster(false)
    } else {
      const yeni = await musteriEkle({ ...form, olusturmaTarih: new Date().toISOString() })
      if (yeni) {
        toast.success('Müşteri oluşturuldu. Kişi ve lokasyon ekleyebilirsiniz.')
        navigate(`/musteriler/${yeni.id}`, { state: { yeniMusteri: true } })
      }
    }
  }

  const iptal = () => {
    setForm(bosForm)
    setDuzenleId(null)
    setGoster(false)
  }

  const musteriSil = async (id, e) => {
    e.stopPropagation()
    const onay = await confirm({
      baslik: 'Müşteriyi Sil',
      mesaj: 'Bu müşteriyi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      onayMetin: 'Evet, Sil',
      iptalMetin: 'Vazgeç',
      tip: 'tehlikeli',
    })
    if (!onay) return
    await dbMusteriSil(id)
    setMusteriler(prev => prev.filter(m => m.id !== id))
    toast.success('Müşteri silindi.')
  }

  const gorunenMusteriler = musteriler
    .filter((m) => filtre === 'hepsi' || m.durum === filtre)
    .filter((m) =>
      arama === '' ||
      trNormalize(`${m.ad} ${m.soyad} ${m.firma} ${m.kod}`)
        .includes(trNormalize(arama))
    )

  return (
    <div className="p-6">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Müşteriler</h2>
          <p className="text-sm text-gray-400 mt-1">{musteriler.length} kayıt</p>
        </div>
        <button
          onClick={formAc}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          + Yeni Müşteri
        </button>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap">
        <input
          type="text"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="İsim, firma veya müşteri kodu ara..."
          className="flex-1 min-w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2 flex-wrap">
          {[{ id: 'hepsi', isim: 'Hepsi' }, ...durumlar].map((d) => (
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
            {duzenleId ? 'Müşteriyi Düzenle' : 'Yeni Müşteri'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="text-sm text-gray-600 mb-1 block">Firma *</label>
              <input
                type="text"
                value={form.firma}
                onChange={(e) => handleFirmaChange(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Başakşehir Belediyesi"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Müşteri Kodu *</label>
              {!duzenleId && (
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => handleKodModu('otomatik')}
                    className={`text-xs px-3 py-1 rounded-lg border transition ${
                      kodModu === 'otomatik'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    Otomatik
                  </button>
                  <button
                    onClick={() => handleKodModu('manuel')}
                    className={`text-xs px-3 py-1 rounded-lg border transition ${
                      kodModu === 'manuel'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    Manuel
                  </button>
                </div>
              )}
              {kodModu === 'otomatik' && !duzenleId ? (
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-mono px-3 py-2 rounded-lg ${
                    form.kod ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {form.kod || 'Firma girin...'}
                  </span>
                </div>
              ) : (
                <input
                  type="text"
                  value={form.kod}
                  onChange={(e) => setForm({ ...form, kod: e.target.value.toUpperCase() })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="BAS-0001"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Ad *</label>
              <input
                type="text"
                value={form.ad}
                onChange={(e) => setForm({ ...form, ad: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ahmet"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Soyad *</label>
              <input
                type="text"
                value={form.soyad}
                onChange={(e) => setForm({ ...form, soyad: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Yılmaz"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Unvan</label>
              <input
                type="text"
                value={form.unvan}
                onChange={(e) => setForm({ ...form, unvan: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Satın Alma Müdürü"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Telefon *</label>
              <input
                type="text"
                value={form.telefon}
                onChange={(e) => setForm({ ...form, telefon: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0532 000 00 00"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">E-posta</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ahmet@firma.com"
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
            <div className="md:col-span-3">
              <label className="text-sm text-gray-600 mb-1 block">Notlar</label>
              <textarea
                value={form.notlar}
                onChange={(e) => setForm({ ...form, notlar: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="Müşteri hakkında notlar..."
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

      {/* Liste */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {gorunenMusteriler.length === 0 && (
          <div className="p-10 text-center text-gray-400 text-sm">
            {arama ? 'Arama sonucu bulunamadı.' : 'Henüz müşteri eklenmedi.'}
          </div>
        )}
        {gorunenMusteriler.map((m) => {
          const durum = durumlar.find((d) => d.id === m.durum)
          return (
            <div
              key={m.id}
              onClick={() => navigate(`/musteriler/${m.id}`)}
              className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition cursor-pointer"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ background: 'var(--primary)' }}
              >
                {(m.firma || m.ad)?.charAt(0)?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-800">
                    {m.firma || '—'}
                  </p>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-mono">
                    {m.kod}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${durum?.renk}`}>
                    {durum?.isim}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5 flex-wrap">
                  {m.ad && <span>{m.ad} {m.soyad}{m.unvan ? ` · ${m.unvan}` : ''}</span>}
                  {m.telefon && <span>{m.telefon}</span>}
                  {m.email && <span>{m.email}</span>}
                  {m.sehir && <span>📍 {m.sehir}</span>}
                </div>
                {m.notlar && (
                  <p className="text-xs text-gray-400 mt-0.5 italic line-clamp-1">{m.notlar}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-indigo-500 mr-2">Detay →</span>
                <button
                  onClick={(e) => duzenleAc(m, e)}
                  className="text-xs text-blue-400 hover:text-blue-600 border border-blue-100 rounded-lg px-3 py-1.5 transition"
                >
                  Düzenle
                </button>
                <button
                  onClick={(e) => musteriSil(m.id, e)}
                  className="text-xs text-red-400 hover:text-red-600 border border-red-100 rounded-lg px-3 py-1.5 transition"
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

export default Musteriler
