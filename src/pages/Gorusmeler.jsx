import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext'
import { gorusmeleriGetir, gorusmeEkle, gorusmeGuncelle, gorusmeSil as dbGorusmeSil } from '../services/gorusmeService'
import { musterileriGetir } from '../services/musteriService'
import CustomSelect from '../components/CustomSelect'

const varsayilanKonular = [
  'CCTV', 'NVR-ANALİZ', 'Network', 'Teklif', 'Demo',
  'Fuar', 'Access Kontrol', 'Mobiltek', 'Donanım', 'Yazılım', 'Diğer'
]

const irtibatSekilleri = [
  { id: 'telefon',         isim: 'Telefon',          ikon: '📞' },
  { id: 'whatsapp',        isim: 'WhatsApp',         ikon: '💬' },
  { id: 'mail',            isim: 'Mail',             ikon: '✉️' },
  { id: 'yuz_yuze',        isim: 'Yüz Yüze',         ikon: '🤝' },
  { id: 'merkez',          isim: 'Merkez',           ikon: '🏢' },
  { id: 'uzak_baglanti',   isim: 'Uzak Bağlantı',    ikon: '🖥️' },
  { id: 'bridge',          isim: 'Bridge',           ikon: '🌉' },
  { id: 'online_toplanti', isim: 'Online Toplantı',  ikon: '📹' },
  { id: 'telegram',        isim: 'Telegram',         ikon: '📨' },
  { id: 'diger',           isim: 'Diğer',            ikon: '💡' },
]

const durumlar = [
  { id: 'acik', isim: 'Açık', renk: 'bg-blue-100 text-blue-700' },
  { id: 'beklemede', isim: 'Beklemede', renk: 'bg-amber-100 text-amber-700' },
  { id: 'kapali', isim: 'Kapalı', renk: 'bg-green-100 text-green-700' },
]

const bosForm = {
  firmaAdi: '',
  musteriId: '',
  muhatapId: '',
  muhatapAd: '',
  konu: '',
  manuelKonu: '',
  irtibatSekli: '',
  gorusen: '',
  takipNotu: '',
  durum: 'acik',
  tarih: new Date().toISOString().split('T')[0],
}

function aktNo(mevcutlar) {
  const sayi = mevcutlar.length + 1
  return `ACT-${String(sayi).padStart(4, '0')}`
}

function Gorusmeler() {
  const { kullanici, kullanicilar } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [gorusmeler, setGorusmeler] = useState([])
  const [musteriler, setMusteriler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [form, setForm] = useState(bosForm)
  const [secilenFirma, setSecilenFirma] = useState('')
  const [goster, setGoster] = useState(false)
  const [duzenleId, setDuzenleId] = useState(null)
  const [filtre, setFiltre] = useState('hepsi')
  const [gorusenFiltre, setGorusenFiltre] = useState('')
  const [konuFiltre, setKonuFiltre] = useState('')
  const [arama, setArama] = useState('')
  const [manuelKonuAc, setManuelKonuAc] = useState(false)

  useEffect(() => {
    Promise.all([
      gorusmeleriGetir(),
      musterileriGetir(),
    ]).then(([gorusmeData, musteriData]) => {
      setGorusmeler(gorusmeData)
      setMusteriler(musteriData)
      setYukleniyor(false)
    })
  }, [])

  if (yukleniyor) return <div className="p-6 text-center text-gray-400">Yükleniyor...</div>

  // Benzersiz firma listesi
  const benzersizFirmalar = [...new Map(
    (musteriler || []).filter(m => m.firma).map((m) => [m.firma, m])
  ).values()].sort((a, b) => (a.firma || '').localeCompare(b.firma || '', 'tr'))

  // Seçilen firmadaki kişiler
  const firmaKisileri = secilenFirma
    ? musteriler.filter((m) => m.firma === secilenFirma)
    : []

  const formAc = () => {
    setForm({ ...bosForm, gorusen: kullanici.ad, tarih: new Date().toISOString().split('T')[0] })
    setSecilenFirma('')
    setManuelKonuAc(false)
    setDuzenleId(null)
    setGoster(true)
  }

  const duzenleAc = (g) => {
    const manuelMi = !varsayilanKonular.includes(g.konu)
    setSecilenFirma(g.firmaAdi || '')
    setForm({
      firmaAdi: g.firmaAdi,
      musteriId: g.musteriId || '',
      muhatapId: g.muhatapId || '',
      muhatapAd: g.muhatapAd || '',
      konu: manuelMi ? '' : g.konu,
      manuelKonu: manuelMi ? g.konu : '',
      irtibatSekli: g.irtibatSekli || '',
      gorusen: g.gorusen,
      takipNotu: g.takipNotu,
      durum: g.durum,
      tarih: g.tarih,
    })
    setManuelKonuAc(manuelMi)
    setDuzenleId(g.id)
    setGoster(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleFirmaSec = (firmaAdi) => {
    setSecilenFirma(firmaAdi)
    setForm({ ...form, firmaAdi, musteriId: '', muhatapId: '', muhatapAd: '' })
  }

  const handleKisiSec = (musteriId) => {
    const musteri = musteriler.find((m) => m.id?.toString() === musteriId)
    setForm({
      ...form,
      musteriId,
      muhatapId: musteriId,
      muhatapAd: musteri ? `${musteri.ad} ${musteri.soyad}` : '',
    })
  }

  const handleKonuSec = (konu) => {
    if (konu === '__manuel__') {
      setManuelKonuAc(true)
      setForm({ ...form, konu: '', manuelKonu: '' })
    } else {
      setManuelKonuAc(false)
      setForm({ ...form, konu, manuelKonu: '' })
    }
  }

  const kaydet = async () => {
    const sonKonu = manuelKonuAc ? form.manuelKonu : form.konu
    if (!form.firmaAdi || !sonKonu || !form.gorusen) {
      alert('Firma, konu ve görüşen zorunludur!')
      return
    }
    if (duzenleId) {
      const guncellendi = await gorusmeGuncelle(duzenleId, { ...form, konu: sonKonu })
      if (guncellendi) {
        setGorusmeler(prev => prev.map(g => g.id === duzenleId ? guncellendi : g))
        toast.success('Görüşme güncellendi.')
      } else {
        toast.error('Görüşme güncellenemedi. Konsolu kontrol edin.')
        return
      }
    } else {
      const yeniGorusme = await gorusmeEkle({
        ...form,
        konu: sonKonu,
        aktNo: aktNo(gorusmeler),
        olusturanId: kullanici.id,
        olusturmaTarih: new Date().toISOString(),
      })
      if (yeniGorusme) {
        setGorusmeler(prev => [yeniGorusme, ...prev])
        toast.success('Görüşme kaydedildi.')
      } else {
        toast.error('Görüşme kaydedilemedi. Konsolu kontrol edin.')
        return
      }
    }
    setForm(bosForm)
    setSecilenFirma('')
    setDuzenleId(null)
    setGoster(false)
  }

  const durumGuncelle = async (id, yeniDurum) => {
    await gorusmeGuncelle(id, { durum: yeniDurum })
    setGorusmeler(prev => prev.map(g => g.id === id ? { ...g, durum: yeniDurum } : g))
  }

  const gorusmeSil = async (id) => {
    await dbGorusmeSil(id)
    setGorusmeler(prev => prev.filter(g => g.id !== id))
    toast.success('Görüşme silindi.')
  }

  const iptal = () => {
    setForm(bosForm)
    setSecilenFirma('')
    setDuzenleId(null)
    setGoster(false)
    setManuelKonuAc(false)
  }

  // Görüşmelerden benzersiz görüşen listesi
  const gorusenler = [...new Set(gorusmeler.map((g) => g.gorusen).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'tr')
  )

  const gorunenGorusmeler = [...gorusmeler]
    .reverse()
    .filter((g) => filtre === 'hepsi' || g.durum === filtre)
    .filter((g) => gorusenFiltre === '' || g.gorusen === gorusenFiltre)
    .filter((g) => konuFiltre === '' || g.konu === konuFiltre)
    .filter((g) =>
      arama === '' ||
      `${g.firmaAdi} ${g.konu} ${g.gorusen} ${g.aktNo} ${g.muhatapAd || ''}`
        .toLowerCase()
        .includes(arama.toLowerCase())
    )

  return (
    <div className="p-6">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Görüşmeler</h2>
          <p className="text-sm text-gray-400 mt-1">{gorusmeler.length} aktivite</p>
        </div>
        <button
          onClick={formAc}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          + Yeni Görüşme
        </button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {[{ id: 'hepsi', isim: 'Tümü' }, ...durumlar].map((d) => (
          <button
            key={d.id}
            onClick={() => setFiltre(d.id)}
            className={`text-sm px-4 py-1.5 rounded-lg border transition ${
              filtre === d.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            {d.isim}
            <span className="ml-1 text-xs opacity-70">
              {d.id === 'hepsi'
                ? gorusmeler.length
                : gorusmeler.filter((g) => g.durum === d.id).length}
            </span>
          </button>
        ))}
      </div>

      {/* Görüşen ve konu filtreleri */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-40">
          <span className="text-xs text-gray-400 whitespace-nowrap">Görüşen:</span>
          <CustomSelect
            value={gorusenFiltre}
            onChange={(e) => setGorusenFiltre(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Tümü</option>
            {gorusenler.map((ad) => (
              <option key={ad} value={ad}>{ad}</option>
            ))}
          </CustomSelect>
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-40">
          <span className="text-xs text-gray-400 whitespace-nowrap">Konu:</span>
          <CustomSelect
            value={konuFiltre}
            onChange={(e) => setKonuFiltre(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Tümü</option>
            {varsayilanKonular.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </CustomSelect>
        </div>
        {(gorusenFiltre || konuFiltre) && (
          <button
            onClick={() => { setGorusenFiltre(''); setKonuFiltre('') }}
            className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 border border-gray-200 rounded-lg transition"
          >
            Filtreyi Temizle
          </button>
        )}
      </div>

      <div className="mb-6">
        <input
          type="text"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Firma, kişi, konu, görüşen veya aktivite no ara..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {goster && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-blue-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-800">
              {duzenleId ? 'Görüşmeyi Düzenle' : 'Yeni Görüşme'}
            </h3>
            {!duzenleId && (
              <span className="text-xs font-mono bg-gray-100 text-gray-500 px-3 py-1 rounded-full">
                {aktNo(gorusmeler)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">

            {/* Firma Seç */}
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Firma *</label>
              <CustomSelect
                value={secilenFirma}
                onChange={(e) => handleFirmaSec(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Firma seç...</option>
                {benzersizFirmalar.map((m) => (
                  <option key={m.id} value={m.firma}>{m.firma}</option>
                ))}
              </CustomSelect>
            </div>

            {/* Muhatap Kişi Seç */}
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Muhatap Kişi</label>
              <CustomSelect
                value={form.muhatapId}
                onChange={(e) => handleKisiSec(e.target.value)}
                disabled={!secilenFirma}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">
                  {secilenFirma ? 'Kişi seç...' : 'Önce firma seçin'}
                </option>
                {firmaKisileri.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.ad} {m.soyad}{m.unvan ? ` — ${m.unvan}` : ''}
                  </option>
                ))}
              </CustomSelect>
            </div>

            {/* Aktivite Konusu */}
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Aktivite Konusu *</label>
              <CustomSelect
                value={manuelKonuAc ? '__manuel__' : form.konu}
                onChange={(e) => handleKonuSec(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Konu seç...</option>
                {varsayilanKonular.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
                <option value="__manuel__">+ Manuel gir</option>
              </CustomSelect>
              {manuelKonuAc && (
                <input
                  type="text"
                  value={form.manuelKonu}
                  onChange={(e) => setForm({ ...form, manuelKonu: e.target.value.toUpperCase() })}
                  className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2"
                  placeholder="Konu yazın..."
                  autoFocus
                />
              )}
            </div>

            {/* Görüşen */}
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Görüşen *</label>
              <CustomSelect
                value={form.gorusen}
                onChange={(e) => setForm({ ...form, gorusen: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Kişi seç...</option>
                {kullanicilar.map((k) => (
                  <option key={k.id} value={k.ad}>{k.ad}</option>
                ))}
              </CustomSelect>
            </div>

            {/* İrtibat Şekli */}
            <div className="md:col-span-2">
              <label className="text-sm text-gray-600 mb-1 block">İrtibat Şekli</label>
              <div className="flex gap-1.5 flex-wrap">
                {irtibatSekilleri.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setForm({ ...form, irtibatSekli: form.irtibatSekli === i.id ? '' : i.id })}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium ${
                      form.irtibatSekli === i.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {i.ikon} {i.isim}
                  </button>
                ))}
              </div>
            </div>

            {/* Tarih */}
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Tarih</label>
              <input
                type="date"
                value={form.tarih}
                onChange={(e) => setForm({ ...form, tarih: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Durum */}
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

            {/* Takip Notu */}
            <div className="md:col-span-3">
              <label className="text-sm text-gray-600 mb-1 block">Takip Edilecek Konular / Not</label>
              <textarea
                value={form.takipNotu}
                onChange={(e) => setForm({ ...form, takipNotu: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Görüşme detayları, takip edilecek konular..."
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

      {/* Aktif filtre özeti */}
      {(gorusenFiltre || konuFiltre || filtre !== 'hepsi') && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-400">Filtre:</span>
          {gorusenFiltre && (
            <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full font-medium flex items-center gap-1">
              👤 {gorusenFiltre}
              <button onClick={() => setGorusenFiltre('')} className="hover:text-indigo-800 ml-0.5">×</button>
            </span>
          )}
          {konuFiltre && (
            <span className="text-xs bg-purple-50 text-purple-600 px-2 py-1 rounded-full font-medium flex items-center gap-1">
              {konuFiltre}
              <button onClick={() => setKonuFiltre('')} className="hover:text-purple-800 ml-0.5">×</button>
            </span>
          )}
          {filtre !== 'hepsi' && (
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full font-medium flex items-center gap-1">
              {durumlar.find((d) => d.id === filtre)?.isim}
              <button onClick={() => setFiltre('hepsi')} className="hover:text-blue-800 ml-0.5">×</button>
            </span>
          )}
          <span className="text-xs text-gray-400">{gorunenGorusmeler.length} sonuç</span>
        </div>
      )}

      {/* Liste */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wide">
          <div className="col-span-1">No</div>
          <div className="col-span-3">Firma / Muhatap</div>
          <div className="col-span-3">Takip Notu</div>
          <div className="col-span-1">Konu</div>
          <div className="col-span-1">Görüşen</div>
          <div className="col-span-1">Tarih</div>
          <div className="col-span-1">Durum</div>
          <div className="col-span-1"></div>
        </div>

        {gorunenGorusmeler.length === 0 && (
          <div className="p-10 text-center text-gray-400 text-sm">
            {arama ? 'Arama sonucu bulunamadı.' : 'Henüz görüşme eklenmedi.'}
          </div>
        )}

        {gorunenGorusmeler.map((g) => {
          const durum = durumlar.find((d) => d.id === g.durum)
          return (
            <div
              key={g.id}
              className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition items-center cursor-pointer"
              onClick={() => navigate(`/gorusmeler/${g.id}`)}
            >
              <div className="col-span-1">
                <span className="text-xs font-mono text-gray-500">{g.aktNo}</span>
              </div>
              <div className="col-span-3">
                <p className="text-sm font-medium text-gray-800 truncate">{g.firmaAdi}</p>
                {g.muhatapAd && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">👤 {g.muhatapAd}</p>
                )}
              </div>
              <div className="col-span-3">
                <p className="text-xs text-gray-500 line-clamp-2">{g.takipNotu || '—'}</p>
              </div>
              <div className="col-span-1">
                <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-medium">
                  {g.konu}
                </span>
              </div>
              <div className="col-span-1">
                <p className="text-xs text-gray-500 truncate">{g.gorusen}</p>
              </div>
              <div className="col-span-1">
                <p className="text-xs text-gray-400">{g.tarih}</p>
              </div>
              <div className="col-span-1">
                <CustomSelect
                  value={g.durum}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => { e.stopPropagation(); durumGuncelle(g.id, e.target.value) }}
                  className={`text-xs border-0 rounded-lg px-2 py-1 font-medium focus:outline-none cursor-pointer ${durum?.renk}`}
                >
                  {durumlar.map((d) => (
                    <option key={d.id} value={d.id}>{d.isim}</option>
                  ))}
                </CustomSelect>
              </div>
              <div className="col-span-1 flex gap-1 justify-end">
                <button
                  onClick={(e) => { e.stopPropagation(); duzenleAc(g) }}
                  className="text-xs text-blue-400 hover:text-blue-600 border border-blue-100 rounded-lg px-2 py-1 transition"
                >
                  Düzenle
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); gorusmeSil(g.id) }}
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

export default Gorusmeler
