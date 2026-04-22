import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { gorevGetir, gorevGuncelle } from '../services/gorevService'

const oncelikler = [
  { id: 'dusuk', isim: 'Düşük', renk: 'bg-gray-100 text-gray-600' },
  { id: 'orta', isim: 'Orta', renk: 'bg-amber-100 text-amber-600' },
  { id: 'yuksek', isim: 'Yüksek', renk: 'bg-red-100 text-red-600' },
]

const durumlar = [
  { id: 'bekliyor', isim: 'Bekliyor', renk: 'bg-gray-100 text-gray-600' },
  { id: 'devam', isim: 'Devam Ediyor', renk: 'bg-blue-100 text-blue-600' },
  { id: 'tamamlandi', isim: 'Tamamlandı', renk: 'bg-green-100 text-green-600' },
]

function GorevDetay() {
  const { id } = useParams()
  const { kullanici, kullanicilar } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [gorev, setGorev] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [yeniYorum, setYeniYorum] = useState('')
  const [duzenleYorumId, setDuzenleYorumId] = useState(null)
  const [duzenleIcerik, setDuzenleIcerik] = useState('')

  useEffect(() => {
    gorevGetir(id).then((data) => {
      setGorev(data)
      setYukleniyor(false)
    })
  }, [id])

  if (yukleniyor) return <div className="p-6 text-center text-gray-400">Yükleniyor...</div>

  if (!gorev) {
    return (
      <div className="p-6">
        <p className="text-gray-400">Görev bulunamadı.</p>
        <button onClick={() => navigate('/gorevler')} className="mt-4 text-sm text-blue-600 hover:underline">
          ← Geri dön
        </button>
      </div>
    )
  }

  const oncelik = oncelikler.find((o) => o.id === gorev.oncelik)
  const durum = durumlar.find((d) => d.id === gorev.durum)
  const atananKisi = kullanicilar.find((k) => k.id?.toString() === gorev.atanan?.toString())

  const durumGuncelle = async (yeniDurum) => {
    await gorevGuncelle(gorev.id, { durum: yeniDurum })
    setGorev((prev) => ({ ...prev, durum: yeniDurum }))
    toast.success('Durum güncellendi.')
  }

  const yorumEkle = async () => {
    if (!yeniYorum.trim()) return
    const yorum = {
      id: crypto.randomUUID(),
      yazar: kullanici.ad,
      yazarId: kullanici.id,
      icerik: yeniYorum,
      tarih: new Date().toLocaleString('tr-TR'),
    }
    const yeniYorumlar = [...(gorev.yorumlar || []), yorum]
    await gorevGuncelle(gorev.id, { yorumlar: yeniYorumlar })
    setGorev((prev) => ({ ...prev, yorumlar: yeniYorumlar }))
    setYeniYorum('')
    toast.success('Yorum eklendi.')
  }

  const duzenlemeBaslat = (yorum) => {
    setDuzenleYorumId(yorum.id)
    setDuzenleIcerik(yorum.icerik)
  }

  const duzenlemeIptal = () => {
    setDuzenleYorumId(null)
    setDuzenleIcerik('')
  }

  const yorumGuncelle = async () => {
    if (!duzenleIcerik.trim()) return
    const yeniYorumlar = (gorev.yorumlar || []).map(y =>
      y.id === duzenleYorumId
        ? { ...y, icerik: duzenleIcerik.trim(), duzenlendi: true, duzenlemeTarihi: new Date().toLocaleString('tr-TR') }
        : y
    )
    await gorevGuncelle(gorev.id, { yorumlar: yeniYorumlar })
    setGorev(prev => ({ ...prev, yorumlar: yeniYorumlar }))
    duzenlemeIptal()
    toast.success('Yorum güncellendi.')
  }

  const yorumSil = async (yorumId) => {
    const onay = await confirm({
      baslik: 'Yorumu Sil',
      mesaj: 'Bu yorum kalıcı olarak silinecek. Emin misiniz?',
      onayMetin: 'Evet, Sil',
      iptalMetin: 'Vazgeç',
      tip: 'tehlikeli',
    })
    if (!onay) return
    const yeniYorumlar = (gorev.yorumlar || []).filter(y => y.id !== yorumId)
    await gorevGuncelle(gorev.id, { yorumlar: yeniYorumlar })
    setGorev(prev => ({ ...prev, yorumlar: yeniYorumlar }))
    toast.success('Yorum silindi.')
  }

  const kendisiMi = (yorum) => {
    if (yorum.yazarId && kullanici.id) return String(yorum.yazarId) === String(kullanici.id)
    return yorum.yazar === kullanici.ad
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">

      <button
        onClick={() => navigate('/gorevler')}
        className="text-sm text-blue-600 hover:text-blue-800 mb-6 flex items-center gap-1 transition"
      >
        ← Görevlere dön
      </button>

      {/* Görev başlık kartı */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${oncelik?.renk}`}>
                {oncelik?.isim}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${durum?.renk}`}>
                {durum?.isim}
              </span>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">{gorev.baslik}</h2>
            {gorev.aciklama && (
              <p className="text-gray-500 text-sm leading-relaxed">{gorev.aciklama}</p>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 mt-4 pt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400 mb-1">Atanan</p>
            <p className="font-medium text-gray-700">{atananKisi?.ad || 'Bilinmiyor'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Son Tarih</p>
            <p className="font-medium text-gray-700">{gorev.sonTarih || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Oluşturan</p>
            <p className="font-medium text-gray-700">{gorev.olusturanAd || '—'}</p>
          </div>
          {gorev.musteriAdi && (
            <div>
              <p className="text-xs text-gray-400 mb-1">İlgili Müşteri</p>
              <p className="font-medium text-gray-700">{gorev.musteriAdi}</p>
              {gorev.firmaAdi && (
                <button
                  onClick={() => navigate(`/firma-gecmisi/${encodeURIComponent(gorev.firmaAdi)}`)}
                  className="text-xs text-blue-500 hover:underline"
                >
                  🏢 {gorev.firmaAdi}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Görüşme bağlantısı */}
        {gorev.gorusmeId && (
          <div className="border-t border-gray-100 mt-4 pt-4">
            <p className="text-xs text-gray-400 mb-2">Bağlı Görüşme</p>
            <button
              onClick={() => navigate(`/gorusmeler/${gorev.gorusmeId}`)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-blue-50 border border-blue-100 hover:bg-blue-100 transition w-full text-left"
            >
              <span className="text-base">🤝</span>
              <div>
                <span className="font-medium text-blue-700">{gorev.gorusmeFirma}</span>
                <span className="text-gray-400 ml-2 text-xs">{gorev.gorusmeAktNo}</span>
              </div>
              <span className="ml-auto text-xs text-blue-400">Görüşmeye git →</span>
            </button>
          </div>
        )}
      </div>

      {/* Durum güncelle */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
        <p className="text-sm font-medium text-gray-700 mb-3">Durumu Güncelle</p>
        <div className="flex gap-2 flex-wrap">
          {durumlar.map((d) => (
            <button
              key={d.id}
              onClick={() => durumGuncelle(d.id)}
              className={`text-sm px-4 py-2 rounded-lg border transition font-medium ${
                gorev.durum === d.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
            >
              {d.isim}
            </button>
          ))}
        </div>
      </div>

      {/* Yorumlar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <p className="text-sm font-medium text-gray-700 mb-4">
          Yorumlar ({gorev.yorumlar?.length || 0})
        </p>

        <div className="flex flex-col gap-3 mb-4">
          {(gorev.yorumlar || []).length === 0 && (
            <p className="text-sm text-gray-400">Henüz yorum yok.</p>
          )}
          {(gorev.yorumlar || []).map((yorum) => {
            const benimMi = kendisiMi(yorum)
            const duzenlemede = duzenleYorumId === yorum.id
            return (
              <div key={yorum.id} className="bg-gray-50 rounded-lg p-3 group">
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className="text-sm font-medium text-gray-700">{yorum.yazar}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {yorum.tarih}
                      {yorum.duzenlendi && <span className="ml-1 italic">(düzenlendi)</span>}
                    </span>
                    {benimMi && !duzenlemede && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={() => duzenlemeBaslat(yorum)}
                          className="text-xs text-blue-500 hover:text-blue-700 px-2 py-0.5 rounded border border-blue-100 hover:bg-blue-50 transition"
                          title="Düzenle"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => yorumSil(yorum.id)}
                          className="text-xs text-red-400 hover:text-red-600 px-2 py-0.5 rounded border border-red-100 hover:bg-red-50 transition"
                          title="Sil"
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {duzenlemede ? (
                  <div className="space-y-2 mt-2">
                    <textarea
                      value={duzenleIcerik}
                      onChange={e => setDuzenleIcerik(e.target.value)}
                      rows={3}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={yorumGuncelle}
                        className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition"
                      >
                        Kaydet
                      </button>
                      <button
                        onClick={duzenlemeIptal}
                        className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition"
                      >
                        İptal
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{yorum.icerik}</p>
                )}
              </div>
            )
          })}
        </div>

        <div className="border-t border-gray-100 pt-4">
          <textarea
            value={yeniYorum}
            onChange={(e) => setYeniYorum(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            rows={3}
            placeholder="Yorum yaz..."
          />
          <button
            onClick={yorumEkle}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Yorum Ekle
          </button>
        </div>
      </div>

    </div>
  )
}

export default GorevDetay
