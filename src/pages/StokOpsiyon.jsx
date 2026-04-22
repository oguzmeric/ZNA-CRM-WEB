import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useBildirim } from '../context/BildirimContext'
import CustomSelect from '../components/CustomSelect'
import { stokUrunleriniGetir, stokHareketleriniGetir } from '../services/stokService'

const durumlar = [
  { id: 'aktif', isim: 'Aktif', renk: 'bg-blue-100 text-blue-700' },
  { id: 'onaylandi', isim: 'Onaylandı', renk: 'bg-green-100 text-green-700' },
  { id: 'iptal', isim: 'İptal', renk: 'bg-red-100 text-red-600' },
  { id: 'suresi_doldu', isim: 'Süresi Doldu', renk: 'bg-gray-100 text-gray-500' },
]

const bosForm = {
  stokKodu: '',
  stokAdi: '',
  miktar: '',
  satisciId: '',
  musteriAdi: '',
  aciklama: '',
  bitisTarih: '',
}

function StokOpsiyon() {
  const { kullanici, kullanicilar } = useAuth()
  const { bildirimEkle } = useBildirim()

  const [opsiyonlar, setOpsiyonlar] = useState(() => {
    try { return JSON.parse(localStorage.getItem('stokOpsiyonlar') || '[]') } catch { return [] }
  })
  const [stokUrunler, setStokUrunler] = useState([])
  const [hareketler, setHareketler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)

  useEffect(() => {
    Promise.all([
      stokUrunleriniGetir(),
      stokHareketleriniGetir(),
    ]).then(([urun, hare]) => {
      setStokUrunler(urun || [])
      setHareketler(hare || [])
      setYukleniyor(false)
    }).catch(() => setYukleniyor(false))
  }, [])

  const [form, setForm] = useState(bosForm)
  const [goster, setGoster] = useState(false)
  const [filtre, setFiltre] = useState('hepsi')
  const [arama, setArama] = useState('')

  const stokBakiye = (stokKodu) => {
    return hareketler
      .filter((h) => h.stokKodu === stokKodu)
      .reduce((sum, h) => {
        const tip = h.hareketTipi || h.tur
        if (tip === 'giris' || tip === 'transfer_giris') return sum + Number(h.miktar)
        return sum - Number(h.miktar)
      }, 0)
  }

  const opsiyonluMiktar = (stokKodu) => {
    return opsiyonlar
      .filter((o) => o.stokKodu === stokKodu && o.durum === 'aktif')
      .reduce((sum, o) => sum + Number(o.miktar), 0)
  }

  const stokSec = (stokKodu) => {
    const urun = stokUrunler.find((u) => u.stokKodu === stokKodu)
    setForm({
      ...form,
      stokKodu,
      stokAdi: urun?.stokAdi || '',
    })
  }

  const kaydet = () => {
    if (!form.stokKodu || !form.miktar || !form.satisciId || !form.bitisTarih) {
      alert('Stok, miktar, satışçı ve bitiş tarihi zorunludur!')
      return
    }

    const bakiye = stokBakiye(form.stokKodu)
    const mevcutOpsiyon = opsiyonluMiktar(form.stokKodu)
    const kullanilabilir = bakiye - mevcutOpsiyon

    if (Number(form.miktar) > kullanilabilir) {
      alert(`Yetersiz stok! Kullanılabilir: ${kullanilabilir} adet (${bakiye} toplam - ${mevcutOpsiyon} opsiyonlu)`)
      return
    }

    const satisci = kullanicilar.find((k) => k.id?.toString() === form.satisciId)
    const yeni = {
      ...form,
      id: crypto.randomUUID(),
      durum: 'aktif',
      olusturanId: kullanici?.id?.toString(),
      olusturanAd: kullanici?.ad,
      satisciAd: satisci?.ad || '',
      olusturmaTarih: new Date().toISOString(),
      opsiyonNo: `OPS-${String(opsiyonlar.length + 1).padStart(4, '0')}`,
    }

    const guncellenmis = [...opsiyonlar, yeni]
    setOpsiyonlar(guncellenmis)
    localStorage.setItem('stokOpsiyonlar', JSON.stringify(guncellenmis))

    // Satışçıya bildirim
    bildirimEkle(
      form.satisciId,
      'Stok Opsiyonu Oluşturuldu',
      `${form.miktar} adet ${form.stokAdi} ürünü için opsiyon oluşturuldu. Bitiş: ${form.bitisTarih}`,
      'bilgi',
      '/stok-opsiyon'
    )

    setForm(bosForm)
    setGoster(false)
  }

  const durumGuncelle = (id, yeniDurum) => {
    const opsiyon = opsiyonlar.find((o) => o.id === id)
    const guncellenmis = opsiyonlar.map((o) =>
      o.id === id ? { ...o, durum: yeniDurum } : o
    )
    setOpsiyonlar(guncellenmis)
    localStorage.setItem('stokOpsiyonlar', JSON.stringify(guncellenmis))

    // Onaylandıysa satışçıya bildirim
    if (yeniDurum === 'onaylandi' && opsiyon) {
      bildirimEkle(
        opsiyon.satisciId,
        'Opsiyon Onaylandı ✅',
        `${opsiyon.miktar} adet ${opsiyon.stokAdi} opsiyonunuz onaylandı!`,
        'basari',
        '/stok-opsiyon'
      )
    }

    if (yeniDurum === 'iptal' && opsiyon) {
      bildirimEkle(
        opsiyon.satisciId,
        'Opsiyon İptal Edildi',
        `${opsiyon.miktar} adet ${opsiyon.stokAdi} opsiyonunuz iptal edildi.`,
        'uyari',
        '/stok-opsiyon'
      )
    }
  }

  const opsiyonSil = (id) => {
    const guncellenmis = opsiyonlar.filter((o) => o.id !== id)
    setOpsiyonlar(guncellenmis)
    localStorage.setItem('stokOpsiyonlar', JSON.stringify(guncellenmis))
  }

  const bugun = new Date()

  const gorunenOpsiyonlar = opsiyonlar
    .filter((o) => filtre === 'hepsi' || o.durum === filtre)
    .filter((o) => {
      if (arama === '') return true
      const aramaMetni = arama.toLowerCase()
      return (
        (o.opsiyonNo || '').toLowerCase().includes(aramaMetni) ||
        (o.stokAdi || '').toLowerCase().includes(aramaMetni) ||
        (o.satisciAd || '').toLowerCase().includes(aramaMetni) ||
        (o.musteriAdi || '').toLowerCase().includes(aramaMetni)
      )
    })
    .sort((a, b) => new Date(b.olusturmaTarih) - new Date(a.olusturmaTarih))

  const yetkili = kullanici?.moduller?.includes('kullanici_yonetimi') ||
    kullanici?.moduller?.includes('stok')

  if (yukleniyor) return <div className="p-6 text-center text-gray-400">Yükleniyor...</div>

  return (
    <div className="p-6">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Stok Opsiyonları</h2>
          <p className="text-sm text-gray-400 mt-1">{opsiyonlar.filter((o) => o.durum === 'aktif').length} aktif opsiyon</p>
        </div>
        <button
          onClick={() => setGoster(true)}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          + Yeni Opsiyon
        </button>
      </div>

      {/* Özet kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">Toplam Opsiyon</p>
          <p className="text-2xl font-bold text-gray-800">{opsiyonlar.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">Aktif</p>
          <p className="text-2xl font-bold text-blue-600">{opsiyonlar.filter((o) => o.durum === 'aktif').length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">Onaylandı</p>
          <p className="text-2xl font-bold text-green-600">{opsiyonlar.filter((o) => o.durum === 'onaylandi').length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">İptal / Doldu</p>
          <p className="text-2xl font-bold text-red-500">
            {opsiyonlar.filter((o) => o.durum === 'iptal' || o.durum === 'suresi_doldu').length}
          </p>
        </div>
      </div>

      {/* Filtre ve arama */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <input
          type="text"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Opsiyon no, ürün, satışçı veya müşteri ara..."
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

      {/* Form */}
      {goster && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-blue-100">
          <h3 className="font-medium text-gray-800 mb-4">Yeni Opsiyon Oluştur</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Stok Ürünü *</label>
              <CustomSelect
                value={form.stokKodu}
                onChange={(e) => stokSec(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Ürün seç...</option>
                {stokUrunler.map((u) => {
                  const bakiye = stokBakiye(u.stokKodu)
                  const opsiyon = opsiyonluMiktar(u.stokKodu)
                  const kullanilabilir = bakiye - opsiyon
                  return (
                    <option key={u.id} value={u.stokKodu}>
                      {u.stokKodu} — {u.stokAdi} (Mevcut: {kullanilabilir} {u.birim})
                    </option>
                  )
                })}
              </CustomSelect>
            </div>

            {form.stokKodu && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <p className="text-xs text-blue-600 font-medium mb-1">Stok Durumu</p>
                <p className="text-sm text-blue-800">
                  Toplam: <strong>{stokBakiye(form.stokKodu)}</strong> adet
                </p>
                <p className="text-sm text-amber-600">
                  Opsiyonlu: <strong>{opsiyonluMiktar(form.stokKodu)}</strong> adet
                </p>
                <p className="text-sm text-green-700">
                  Kullanılabilir: <strong>{stokBakiye(form.stokKodu) - opsiyonluMiktar(form.stokKodu)}</strong> adet
                </p>
              </div>
            )}

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Miktar *</label>
              <input
                type="number"
                value={form.miktar}
                onChange={(e) => setForm({ ...form, miktar: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
                min="1"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Satışçı *</label>
              <CustomSelect
                value={form.satisciId}
                onChange={(e) => setForm({ ...form, satisciId: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Satışçı seç...</option>
                {kullanicilar.map((k) => (
                  <option key={k.id} value={k.id}>{k.ad}</option>
                ))}
              </CustomSelect>
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Müşteri Adı</label>
              <input
                type="text"
                value={form.musteriAdi}
                onChange={(e) => setForm({ ...form, musteriAdi: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Müşteri firma adı"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Opsiyon Bitiş Tarihi *</label>
              <input
                type="date"
                value={form.bitisTarih}
                onChange={(e) => setForm({ ...form, bitisTarih: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-sm text-gray-600 mb-1 block">Açıklama</label>
              <textarea
                value={form.aciklama}
                onChange={(e) => setForm({ ...form, aciklama: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="Opsiyon hakkında notlar..."
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={kaydet}
              className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Opsiyonla
            </button>
            <button
              onClick={() => { setForm(bosForm); setGoster(false) }}
              className="text-sm px-5 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {/* Liste */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wide">
          <div className="col-span-1">No</div>
          <div className="col-span-2">Ürün</div>
          <div className="col-span-1">Miktar</div>
          <div className="col-span-2">Satışçı</div>
          <div className="col-span-2">Müşteri</div>
          <div className="col-span-1">Bitiş</div>
          <div className="col-span-1">Durum</div>
          <div className="col-span-2"></div>
        </div>

        {gorunenOpsiyonlar.length === 0 && (
          <div className="p-10 text-center text-gray-400 text-sm">
            {arama ? 'Arama sonucu bulunamadı.' : 'Henüz opsiyon oluşturulmadı.'}
          </div>
        )}

        {gorunenOpsiyonlar.map((o) => {
          const durum = durumlar.find((d) => d.id === o.durum)
          const bitis = new Date(o.bitisTarih)
          const kalanGun = Math.ceil((bitis - bugun) / (1000 * 60 * 60 * 24))
          const suresiDoldu = kalanGun < 0 && o.durum === 'aktif'

          return (
            <div
              key={o.id}
              className={`grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition items-center ${
                suresiDoldu ? 'bg-red-50' : ''
              }`}
            >
              <div className="col-span-1">
                <span className="text-xs font-mono text-gray-600">{o.opsiyonNo}</span>
              </div>
              <div className="col-span-2">
                <p className="text-sm font-medium text-gray-800 truncate">{o.stokAdi}</p>
                <p className="text-xs text-gray-400 font-mono">{o.stokKodu}</p>
              </div>
              <div className="col-span-1">
                <span className="text-sm font-semibold text-gray-800">{o.miktar}</span>
                <span className="text-xs text-gray-400 ml-1">adet</span>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-gray-700 truncate">{o.satisciAd}</p>
                <p className="text-xs text-gray-400 truncate">Oluşturan: {o.olusturanAd}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-gray-700 truncate">{o.musteriAdi || '—'}</p>
                {o.aciklama && <p className="text-xs text-gray-400 truncate">{o.aciklama}</p>}
              </div>
              <div className="col-span-1">
                <p className="text-xs text-gray-500">{o.bitisTarih}</p>
                {o.durum === 'aktif' && (
                  <p className={`text-xs font-medium ${kalanGun < 0 ? 'text-red-500' : kalanGun <= 3 ? 'text-amber-500' : 'text-gray-400'}`}>
                    {kalanGun < 0 ? `${Math.abs(kalanGun)}g geçti` : `${kalanGun}g kaldı`}
                  </p>
                )}
              </div>
              <div className="col-span-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${durum?.renk}`}>
                  {durum?.isim}
                </span>
              </div>
              <div className="col-span-2 flex gap-1 justify-end flex-wrap">
                {o.durum === 'aktif' && yetkili && (
                  <button
                    onClick={() => durumGuncelle(o.id, 'onaylandi')}
                    className="text-xs text-green-500 hover:text-green-700 border border-green-200 rounded-lg px-2 py-1 transition"
                  >
                    Onayla
                  </button>
                )}
                {o.durum === 'aktif' && (
                  <button
                    onClick={() => durumGuncelle(o.id, 'iptal')}
                    className="text-xs text-red-400 hover:text-red-600 border border-red-100 rounded-lg px-2 py-1 transition"
                  >
                    İptal
                  </button>
                )}
                {yetkili && (
                  <button
                    onClick={() => opsiyonSil(o.id)}
                    className="text-xs text-gray-400 hover:text-gray-600 border border-gray-100 rounded-lg px-2 py-1 transition"
                  >
                    Sil
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default StokOpsiyon