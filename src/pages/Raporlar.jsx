import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts'
import CustomSelect from '../components/CustomSelect'
import { teklifleriGetir } from '../services/teklifService'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { gorevleriGetir } from '../services/gorevService'
import { stokHareketleriniGetir, stokUrunleriniGetir } from '../services/stokService'

const RENKLER = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']
const aylar = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

function Raporlar() {
  const { kullanici, kullanicilar } = useAuth()
  const [aktifSekme, setAktifSekme] = useState('teklifler')
  const [seciliPersonel, setSeciliPersonel] = useState('hepsi')
  const [yukleniyor, setYukleniyor] = useState(true)

  const [teklifler, setTeklifler] = useState([])
  const [gorusmeler, setGorusmeler] = useState([])
  const [gorevler, setGorevler] = useState([])
  const [stokHareketler, setStokHareketler] = useState([])
  const [stokUrunler, setStokUrunler] = useState([])

  useEffect(() => {
    const verileriYukle = async () => {
      setYukleniyor(true)
      const [t, g, gr, sh, su] = await Promise.all([
        teklifleriGetir(),
        gorusmeleriGetir(),
        gorevleriGetir(),
        stokHareketleriniGetir(),
        stokUrunleriniGetir(),
      ])
      setTeklifler(t || [])
      setGorusmeler(g || [])
      setGorevler(gr || [])
      setStokHareketler(sh || [])
      setStokUrunler(su || [])
      setYukleniyor(false)
    }
    verileriYukle()
  }, [])

  const sekmeler = [
    { id: 'teklifler', isim: 'Teklifler' },
    { id: 'gorusmeler', isim: 'Görüşmeler' },
    { id: 'gorevler', isim: 'Görevler' },
    { id: 'stok', isim: 'Stok' },
  ]

  const filtreliTeklifler = seciliPersonel === 'hepsi'
    ? teklifler
    : teklifler.filter((t) => t.hazirlayan === seciliPersonel)

  const filtreliGorusmeler = seciliPersonel === 'hepsi'
    ? gorusmeler
    : gorusmeler.filter((g) => g.gorusen === seciliPersonel)

  const filtreliGorevler = seciliPersonel === 'hepsi'
    ? gorevler
    : gorevler.filter((g) => {
        const k = kullanicilar.find((k) => k.ad === seciliPersonel)
        return g.atanan === k?.id?.toString()
      })

  const aylikTeklifVerisi = aylar.map((ay, i) => {
    const ayT = filtreliTeklifler.filter((t) => {
      const tarih = new Date(t.tarih)
      return tarih.getMonth() === i && tarih.getFullYear() === new Date().getFullYear()
    })
    return {
      ay,
      toplam: ayT.length,
      tutar: ayT.reduce((sum, t) => sum + (t.genelToplam || 0), 0),
      kabul: ayT.filter((t) => t.onayDurumu === 'kabul').length,
    }
  })

  const teklifDurumVerisi = [
    { isim: 'Takipte', deger: filtreliTeklifler.filter((t) => t.onayDurumu === 'takipte').length },
    { isim: 'Kabul', deger: filtreliTeklifler.filter((t) => t.onayDurumu === 'kabul').length },
    { isim: 'Vazgeçildi', deger: filtreliTeklifler.filter((t) => t.onayDurumu === 'vazgecildi').length },
    { isim: 'Revizyon', deger: filtreliTeklifler.filter((t) => t.onayDurumu === 'revizyon').length },
  ].filter((d) => d.deger > 0)

  const personelTeklifVerisi = kullanicilar.map((k) => ({
    isim: k.ad.split(' ')[0],
    ad: k.ad,
    adet: teklifler.filter((t) => t.hazirlayan === k.ad).length,
    tutar: teklifler.filter((t) => t.hazirlayan === k.ad).reduce((sum, t) => sum + (t.genelToplam || 0), 0),
    kabul: teklifler.filter((t) => t.hazirlayan === k.ad && t.onayDurumu === 'kabul').length,
  })).filter((k) => k.adet > 0)

  const aylikGorusmeVerisi = aylar.map((ay, i) => {
    const ayG = filtreliGorusmeler.filter((g) => {
      const tarih = new Date(g.tarih)
      return tarih.getMonth() === i && tarih.getFullYear() === new Date().getFullYear()
    })
    return { ay, toplam: ayG.length, kapali: ayG.filter((g) => g.durum === 'kapali').length }
  })

  const konuGorusmeVerisi = () => {
    const konuMap = {}
    filtreliGorusmeler.forEach((g) => {
      konuMap[g.konu] = (konuMap[g.konu] || 0) + 1
    })
    return Object.entries(konuMap)
      .map(([konu, adet]) => ({ konu, adet }))
      .sort((a, b) => b.adet - a.adet)
      .slice(0, 6)
  }

  const personelGorusmeVerisi = kullanicilar.map((k) => ({
    isim: k.ad.split(' ')[0],
    ad: k.ad,
    adet: gorusmeler.filter((g) => g.gorusen === k.ad).length,
  })).filter((k) => k.adet > 0)

  const gorevDurumVerisi = [
    { isim: 'Bekliyor', deger: filtreliGorevler.filter((g) => g.durum === 'bekliyor').length },
    { isim: 'Devam Ediyor', deger: filtreliGorevler.filter((g) => g.durum === 'devam').length },
    { isim: 'Tamamlandı', deger: filtreliGorevler.filter((g) => g.durum === 'tamamlandi').length },
  ].filter((d) => d.deger > 0)

  const personelGorevVerisi = kullanicilar.map((k) => {
    const pg = gorevler.filter((g) => g.atanan === k.id?.toString())
    return {
      isim: k.ad.split(' ')[0],
      ad: k.ad,
      toplam: pg.length,
      tamamlanan: pg.filter((g) => g.durum === 'tamamlandi').length,
      bekleyen: pg.filter((g) => g.durum === 'bekliyor').length,
    }
  }).filter((k) => k.toplam > 0)

  const stokCikisVerisi = () => {
    const urunMap = {}
    stokHareketler.filter((h) => h.tur === 'cikis').forEach((h) => {
      const urun = stokUrunler.find((u) => u.stokKodu === h.stokKodu)
      const ad = urun?.stokAdi || h.stokKodu
      urunMap[ad] = (urunMap[ad] || 0) + Number(h.miktar)
    })
    return Object.entries(urunMap)
      .map(([ad, miktar]) => ({ ad: ad.substring(0, 15), miktar }))
      .sort((a, b) => b.miktar - a.miktar)
      .slice(0, 8)
  }

  const kritikStokVerisi = stokUrunler.filter((u) => {
    const bakiye = stokHareketler
      .filter((h) => h.stokKodu === u.stokKodu)
      .reduce((sum, h) => {
        if (h.tur === 'giris' || h.tur === 'transfer_giris') return sum + Number(h.miktar)
        return sum - Number(h.miktar)
      }, 0)
    return u.minStok && bakiye <= Number(u.minStok)
  })

  const formatTutar = (v) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0 }).format(v)

  const secilenKisiAdi = seciliPersonel === 'hepsi' ? 'Tüm Personel' : seciliPersonel

  if (yukleniyor) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-sm text-gray-400">Yükleniyor...</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Raporlar</h2>
          <p className="text-sm text-gray-400 mt-1">Genel performans ve analiz</p>
        </div>
        {/* Personel filtresi */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-500">Personel:</label>
          <CustomSelect
            value={seciliPersonel}
            onChange={(e) => setSeciliPersonel(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="hepsi">Tüm Personel</option>
            {kullanicilar.map((k) => (
              <option key={k.id} value={k.ad}>{k.ad}</option>
            ))}
          </CustomSelect>
          {seciliPersonel !== 'hepsi' && (
            <button
              onClick={() => setSeciliPersonel('hepsi')}
              className="text-xs text-gray-400 hover:text-red-500 transition"
            >
              ✕ Temizle
            </button>
          )}
        </div>
      </div>

      {/* Personel seçili ise banner */}
      {seciliPersonel !== 'hepsi' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-6 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold">
            {seciliPersonel.charAt(0)}
          </div>
          <p className="text-sm text-blue-700 font-medium">
            {seciliPersonel} için filtrelenmiş veriler gösteriliyor
          </p>
        </div>
      )}

      {/* Sekmeler */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {sekmeler.map((s) => (
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

      {/* TEKLİF RAPORLARI */}
      {aktifSekme === 'teklifler' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Toplam Teklif</p>
              <p className="text-2xl font-bold text-gray-800">{filtreliTeklifler.length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Kabul Oranı</p>
              <p className="text-2xl font-bold text-green-600">
                {filtreliTeklifler.length > 0
                  ? Math.round((filtreliTeklifler.filter((t) => t.onayDurumu === 'kabul').length / filtreliTeklifler.length) * 100)
                  : 0}%
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Kabul Tutarı</p>
              <p className="text-2xl font-bold text-blue-600">
                ₺{formatTutar(filtreliTeklifler.filter((t) => t.onayDurumu === 'kabul').reduce((s, t) => s + (t.genelToplam || 0), 0))}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Ort. Teklif Tutarı</p>
              <p className="text-2xl font-bold text-gray-800">
                ₺{filtreliTeklifler.length > 0
                  ? formatTutar(filtreliTeklifler.reduce((s, t) => s + (t.genelToplam || 0), 0) / filtreliTeklifler.length)
                  : 0}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-sm font-medium text-gray-700 mb-4">Aylık Teklif Tutarı</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={aylikTeklifVerisi}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey="ay" tick={{ fontSize: 11 }}/>
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={formatTutar}/>
                  <Tooltip formatter={(v) => `₺${formatTutar(v)}`}/>
                  <Bar dataKey="tutar" fill="#3B82F6" radius={[4,4,0,0]} name="Tutar"/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-sm font-medium text-gray-700 mb-4">Durum Dağılımı</p>
              {teklifDurumVerisi.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={teklifDurumVerisi} dataKey="deger" nameKey="isim" cx="50%" cy="50%" outerRadius={80} label={({ isim, deger }) => `${isim}: ${deger}`}>
                      {teklifDurumVerisi.map((_, i) => <Cell key={i} fill={RENKLER[i % RENKLER.length]}/>)}
                    </Pie>
                    <Tooltip/>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Henüz veri yok</div>
              )}
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-sm font-medium text-gray-700 mb-4">Aylık Teklif Adedi</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={aylikTeklifVerisi}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey="ay" tick={{ fontSize: 11 }}/>
                  <YAxis tick={{ fontSize: 11 }}/>
                  <Tooltip/>
                  <Line type="monotone" dataKey="toplam" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} name="Toplam"/>
                  <Line type="monotone" dataKey="kabul" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} name="Kabul"/>
                </LineChart>
              </ResponsiveContainer>
            </div>

            {seciliPersonel === 'hepsi' && (
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <p className="text-sm font-medium text-gray-700 mb-4">Personel Bazlı Teklif</p>
                {personelTeklifVerisi.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={personelTeklifVerisi}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                      <XAxis dataKey="isim" tick={{ fontSize: 11 }}/>
                      <YAxis tick={{ fontSize: 11 }}/>
                      <Tooltip/>
                      <Bar dataKey="adet" fill="#8B5CF6" radius={[4,4,0,0]} name="Teklif Sayısı"/>
                      <Bar dataKey="kabul" fill="#10B981" radius={[4,4,0,0]} name="Kabul"/>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Henüz veri yok</div>
                )}
              </div>
            )}
          </div>

          {seciliPersonel === 'hepsi' && personelTeklifVerisi.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-700">Personel Teklif Detayı</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-400 uppercase">
                    <th className="text-left px-5 py-3">Personel</th>
                    <th className="text-right px-5 py-3">Teklif</th>
                    <th className="text-right px-5 py-3">Kabul</th>
                    <th className="text-right px-5 py-3">Kabul Oranı</th>
                    <th className="text-right px-5 py-3">Toplam Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {personelTeklifVerisi.map((p, i) => (
                    <tr key={i} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setSeciliPersonel(p.ad)}>
                      <td className="px-5 py-3 font-medium text-gray-800 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-semibold">
                          {p.isim.charAt(0)}
                        </div>
                        {p.ad}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600">{p.adet}</td>
                      <td className="px-5 py-3 text-right text-green-600">{p.kabul}</td>
                      <td className="px-5 py-3 text-right text-gray-600">
                        {p.adet > 0 ? Math.round((p.kabul / p.adet) * 100) : 0}%
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-gray-800">₺{formatTutar(p.tutar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 px-5 py-2 border-t border-gray-100">Satıra tıklayarak o personele filtrele</p>
            </div>
          )}
        </div>
      )}

      {/* GÖRÜŞME RAPORLARI */}
      {aktifSekme === 'gorusmeler' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Toplam Görüşme</p>
              <p className="text-2xl font-bold text-gray-800">{filtreliGorusmeler.length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Açık</p>
              <p className="text-2xl font-bold text-blue-600">{filtreliGorusmeler.filter((g) => g.durum === 'acik').length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Beklemede</p>
              <p className="text-2xl font-bold text-amber-500">{filtreliGorusmeler.filter((g) => g.durum === 'beklemede').length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Kapalı</p>
              <p className="text-2xl font-bold text-green-600">{filtreliGorusmeler.filter((g) => g.durum === 'kapali').length}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-sm font-medium text-gray-700 mb-4">Aylık Görüşme Trendi</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={aylikGorusmeVerisi}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey="ay" tick={{ fontSize: 11 }}/>
                  <YAxis tick={{ fontSize: 11 }}/>
                  <Tooltip/>
                  <Bar dataKey="toplam" fill="#3B82F6" radius={[4,4,0,0]} name="Toplam"/>
                  <Bar dataKey="kapali" fill="#10B981" radius={[4,4,0,0]} name="Kapalı"/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-sm font-medium text-gray-700 mb-4">Konu Bazlı Dağılım</p>
              {konuGorusmeVerisi().length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={konuGorusmeVerisi()} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                    <XAxis type="number" tick={{ fontSize: 11 }}/>
                    <YAxis dataKey="konu" type="category" tick={{ fontSize: 10 }} width={80}/>
                    <Tooltip/>
                    <Bar dataKey="adet" fill="#8B5CF6" radius={[0,4,4,0]} name="Adet"/>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Henüz veri yok</div>
              )}
            </div>

            {seciliPersonel === 'hepsi' && (
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 md:col-span-2">
                <p className="text-sm font-medium text-gray-700 mb-4">Personel Bazlı Görüşme</p>
                {personelGorusmeVerisi.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={personelGorusmeVerisi}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                      <XAxis dataKey="isim" tick={{ fontSize: 11 }}/>
                      <YAxis tick={{ fontSize: 11 }}/>
                      <Tooltip/>
                      <Bar dataKey="adet" fill="#EC4899" radius={[4,4,0,0]} name="Görüşme Sayısı" onClick={(d) => setSeciliPersonel(d.ad)}/>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Henüz veri yok</div>
                )}
                <p className="text-xs text-gray-400 mt-2">Bara tıklayarak o personele filtrele</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* GÖREV RAPORLARI */}
      {aktifSekme === 'gorevler' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Toplam Görev</p>
              <p className="text-2xl font-bold text-gray-800">{filtreliGorevler.length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Tamamlanan</p>
              <p className="text-2xl font-bold text-green-600">{filtreliGorevler.filter((g) => g.durum === 'tamamlandi').length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Devam Eden</p>
              <p className="text-2xl font-bold text-blue-600">{filtreliGorevler.filter((g) => g.durum === 'devam').length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Tamamlanma Oranı</p>
              <p className="text-2xl font-bold text-gray-800">
                {filtreliGorevler.length > 0
                  ? Math.round((filtreliGorevler.filter((g) => g.durum === 'tamamlandi').length / filtreliGorevler.length) * 100)
                  : 0}%
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-sm font-medium text-gray-700 mb-4">Durum Dağılımı</p>
              {gorevDurumVerisi.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={gorevDurumVerisi} dataKey="deger" nameKey="isim" cx="50%" cy="50%" outerRadius={80} label={({ isim, deger }) => `${isim}: ${deger}`}>
                      {gorevDurumVerisi.map((_, i) => <Cell key={i} fill={RENKLER[i % RENKLER.length]}/>)}
                    </Pie>
                    <Tooltip/>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Henüz veri yok</div>
              )}
            </div>

            {seciliPersonel === 'hepsi' && (
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <p className="text-sm font-medium text-gray-700 mb-4">Personel Bazlı Görev</p>
                {personelGorevVerisi.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={personelGorevVerisi}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                      <XAxis dataKey="isim" tick={{ fontSize: 11 }}/>
                      <YAxis tick={{ fontSize: 11 }}/>
                      <Tooltip/>
                      <Bar dataKey="toplam" fill="#3B82F6" radius={[4,4,0,0]} name="Toplam"/>
                      <Bar dataKey="tamamlanan" fill="#10B981" radius={[4,4,0,0]} name="Tamamlanan"/>
                      <Bar dataKey="bekleyen" fill="#F59E0B" radius={[4,4,0,0]} name="Bekleyen"/>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Henüz veri yok</div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">Geciken Görevler</p>
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                {filtreliGorevler.filter((g) => g.durum !== 'tamamlandi' && g.sonTarih && new Date(g.sonTarih) < new Date()).length} adet
              </span>
            </div>
            <div>
              {filtreliGorevler
                .filter((g) => g.durum !== 'tamamlandi' && g.sonTarih && new Date(g.sonTarih) < new Date())
                .map((g) => {
                  const atanan = kullanicilar.find((k) => k.id?.toString() === g.atanan)
                  return (
                    <div key={g.id} className="px-5 py-3 border-b border-gray-100 last:border-0 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{g.baslik}</p>
                        <p className="text-xs text-gray-400">Atanan: {atanan?.ad || '—'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-red-500">Son tarih: {g.sonTarih}</p>
                        <p className="text-xs text-red-400">
                          {Math.ceil((new Date() - new Date(g.sonTarih)) / (1000 * 60 * 60 * 24))} gün gecikti
                        </p>
                      </div>
                    </div>
                  )
                })}
              {filtreliGorevler.filter((g) => g.durum !== 'tamamlandi' && g.sonTarih && new Date(g.sonTarih) < new Date()).length === 0 && (
                <div className="px-5 py-8 text-center text-gray-400 text-sm">Geciken görev yok</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STOK RAPORLARI */}
      {aktifSekme === 'stok' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Toplam Ürün</p>
              <p className="text-2xl font-bold text-gray-800">{stokUrunler.length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Toplam Hareket</p>
              <p className="text-2xl font-bold text-blue-600">{stokHareketler.length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Kritik Stok</p>
              <p className="text-2xl font-bold text-red-500">{kritikStokVerisi.length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Müşteri Çıkışı</p>
              <p className="text-2xl font-bold text-gray-800">{stokHareketler.filter((h) => h.tur === 'cikis').length}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-4">En Çok Çıkış Yapılan Ürünler</p>
            {stokCikisVerisi().length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stokCikisVerisi()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey="ad" tick={{ fontSize: 10 }}/>
                  <YAxis tick={{ fontSize: 11 }}/>
                  <Tooltip/>
                  <Bar dataKey="miktar" fill="#F59E0B" radius={[4,4,0,0]} name="Miktar"/>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Henüz çıkış verisi yok</div>
            )}
          </div>

          {kritikStokVerisi.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <p className="text-sm font-medium text-red-600">Kritik Stok Uyarıları</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-400 uppercase">
                    <th className="text-left px-5 py-3">Stok Kodu</th>
                    <th className="text-left px-5 py-3">Ürün Adı</th>
                    <th className="text-right px-5 py-3">Mevcut</th>
                    <th className="text-right px-5 py-3">Min.</th>
                    <th className="text-right px-5 py-3">Birim</th>
                  </tr>
                </thead>
                <tbody>
                  {kritikStokVerisi.map((u) => {
                    const bakiye = stokHareketler
                      .filter((h) => h.stokKodu === u.stokKodu)
                      .reduce((sum, h) => {
                        if (h.tur === 'giris' || h.tur === 'transfer_giris') return sum + Number(h.miktar)
                        return sum - Number(h.miktar)
                      }, 0)
                    return (
                      <tr key={u.id} className="border-t border-gray-100 bg-red-50">
                        <td className="px-5 py-3 font-mono text-xs text-gray-600">{u.stokKodu}</td>
                        <td className="px-5 py-3 font-medium text-gray-800">{u.stokAdi}</td>
                        <td className="px-5 py-3 text-right text-red-600 font-bold">{bakiye.toFixed(2)}</td>
                        <td className="px-5 py-3 text-right text-gray-500">{u.minStok}</td>
                        <td className="px-5 py-3 text-right text-gray-500">{u.birim}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Raporlar