import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useBildirim } from '../context/BildirimContext'
import CustomSelect from '../components/CustomSelect'
import { gorusmeGetir, gorusmeGuncelle as gorusmeGuncelleService } from '../services/gorusmeService'
import { gorevleriGetir, gorevEkle } from '../services/gorevService'

const varsayilanKonular = [
  'CCTV', 'NVR-ANALİZ', 'Network', 'Teklif', 'Demo',
  'Fuar', 'Access Kontrol', 'Mobiltek', 'Donanım', 'Yazılım', 'Diğer',
]

const durumlar = [
  { id: 'acik', isim: 'Açık', renk: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  { id: 'beklemede', isim: 'Beklemede', renk: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  { id: 'kapali', isim: 'Kapalı', renk: '#10b981', bg: 'rgba(16,185,129,0.1)' },
]

const gorevOncelikleri = [
  { id: 'dusuk', isim: 'Düşük', renk: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  { id: 'orta', isim: 'Orta', renk: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  { id: 'yuksek', isim: 'Yüksek', renk: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
]

const bosGorevForm = {
  baslik: '',
  aciklama: '',
  atanan: '',
  oncelik: 'orta',
  sonTarih: '',
}

function GorusmeDetay() {
  const { id } = useParams()
  const { kullanici, kullanicilar } = useAuth()
  const { bildirimEkle } = useBildirim()
  const navigate = useNavigate()

  const [gorusme, setGorusme] = useState(null)
  const [gorevler, setGorevler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)

  const [duzenleAcik, setDuzenleAcik] = useState(false)
  const [duzenleForm, setDuzenleForm] = useState({})
  const [manuelKonuAc, setManuelKonuAc] = useState(false)
  const [gorevFormAcik, setGorevFormAcik] = useState(false)
  const [gorevForm, setGorevForm] = useState(bosGorevForm)

  useEffect(() => {
    const verileriGetir = async () => {
      setYukleniyor(true)
      try {
        const [gorusmeVerisi, tumGorevler] = await Promise.all([
          gorusmeGetir(id),
          gorevleriGetir(),
        ])
        setGorusme(gorusmeVerisi)
        const baglilar = tumGorevler.filter(
          (g) => g.firmaAdi === gorusmeVerisi?.firmaAdi
        )
        setGorevler(baglilar)
      } finally {
        setYukleniyor(false)
      }
    }
    verileriGetir()
  }, [id])

  if (yukleniyor) {
    return (
      <div className="p-6 flex items-center justify-center">
        <p className="text-gray-400">Yükleniyor...</p>
      </div>
    )
  }

  if (!gorusme) {
    return (
      <div className="p-6">
        <p className="text-gray-400 mb-4">Görüşme bulunamadı.</p>
        <button
          onClick={() => navigate('/gorusmeler')}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Görüşmelere dön
        </button>
      </div>
    )
  }

  const durum = durumlar.find((d) => d.id === gorusme.durum)
  const bagliGorevler = gorevler

  // Görüşmeyi güncelle
  const gorusmeGuncelle = async (guncellenmis) => {
    const guncellendi = await gorusmeGuncelleService(gorusme.id, { ...gorusme, ...guncellenmis })
    if (guncellendi) setGorusme(guncellendi)
  }

  // Durum değiştir
  const durumDegistir = (yeniDurum) => {
    gorusmeGuncelle({ durum: yeniDurum })
  }

  // Düzenleme aç
  const duzenleAc = () => {
    const manuelMi = !varsayilanKonular.includes(gorusme.konu)
    setDuzenleForm({
      takipNotu: gorusme.notlar || '',
      konu: manuelMi ? '' : gorusme.konu,
      manuelKonu: manuelMi ? gorusme.konu : '',
      durum: gorusme.durum,
    })
    setManuelKonuAc(manuelMi)
    setDuzenleAcik(true)
  }

  const duzenleKaydet = () => {
    const sonKonu = manuelKonuAc ? duzenleForm.manuelKonu : duzenleForm.konu
    if (!sonKonu) return
    gorusmeGuncelle({ notlar: duzenleForm.takipNotu, konu: sonKonu, durum: duzenleForm.durum })
    setDuzenleAcik(false)
  }

  // Görev oluştur
  const gorevAc = () => {
    setGorevForm({
      ...bosGorevForm,
      baslik: `${gorusme.firmaAdi} — ${gorusme.konu}`,
      aciklama: gorusme.notlar || '',
    })
    setGorevFormAcik(true)
  }

  const gorevKaydet = async () => {
    if (!gorevForm.baslik || !gorevForm.atanan || !gorevForm.sonTarih) {
      alert('Başlık, atanan kişi ve son tarih zorunludur!')
      return
    }
    const atananKisi = kullanicilar.find((k) => k.id?.toString() === gorevForm.atanan)
    const yeniGorev = {
      baslik: gorevForm.baslik,
      aciklama: gorevForm.aciklama,
      durum: 'bekliyor',
      oncelik: gorevForm.oncelik,
      atananId: gorevForm.atanan,
      atananAd: atananKisi?.ad || '',
      olusturanAd: kullanici.ad,
      bitisTarihi: gorevForm.sonTarih,
      firmaAdi: gorusme.firmaAdi,
    }
    const eklenenGorev = await gorevEkle(yeniGorev)
    if (eklenenGorev) {
      setGorevler((prev) => [...prev, eklenenGorev])
    }

    const oncelik = gorevOncelikleri.find((o) => o.id === gorevForm.oncelik)
    bildirimEkle(
      gorevForm.atanan,
      'Yeni Görev Atandı',
      `"${gorevForm.baslik}" görevi size atandı. Öncelik: ${oncelik?.isim}`,
      'bilgi',
      '/gorevler'
    )
    setGorevForm(bosGorevForm)
    setGorevFormAcik(false)
  }

  const gorevDurumRenk = (d) => {
    if (d === 'tamamlandi') return { renk: '#10b981', bg: 'rgba(16,185,129,0.1)', isim: 'Tamamlandı' }
    if (d === 'devam') return { renk: '#f59e0b', bg: 'rgba(245,158,11,0.1)', isim: 'Devam Ediyor' }
    return { renk: '#0176D3', bg: 'rgba(1,118,211,0.1)', isim: 'Bekliyor' }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">

      {/* Geri butonu */}
      <button
        onClick={() => navigate('/gorusmeler')}
        className="text-sm text-gray-400 hover:text-indigo-600 mb-5 flex items-center gap-1 transition"
      >
        ← Görüşmelere dön
      </button>

      {/* Başlık kartı */}
      <div
        className="rounded-2xl p-6 mb-4"
        style={{
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid rgba(1,118,211,0.12)',
          boxShadow: '0 4px 24px rgba(1,118,211,0.08)',
        }}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {gorusme.aktNo}
              </span>
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: durum?.bg, color: durum?.renk }}
              >
                {durum?.isim}
              </span>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mt-1">
              {gorusme.firmaAdi}
            </h2>
            {gorusme.musteriAdi && (
              <p className="text-sm text-gray-500 mt-0.5">👤 {gorusme.musteriAdi}</p>
            )}
          </div>
          <button
            onClick={duzenleAcik ? () => setDuzenleAcik(false) : duzenleAc}
            className="text-sm px-4 py-2 rounded-xl border transition flex-shrink-0"
            style={{
              color: duzenleAcik ? '#6b7280' : 'var(--primary)',
              borderColor: duzenleAcik ? 'rgba(107,114,128,0.3)' : 'rgba(1,118,211,0.3)',
            }}
          >
            {duzenleAcik ? 'İptal' : 'Düzenle'}
          </button>
        </div>

        {/* Detay satırları */}
        {!duzenleAcik && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-400 mb-1">Konu</p>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(1,68,134,0.1)', color: 'var(--primary-dark)' }}
                >
                  {gorusme.konu}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">İrtibat Şekli</p>
                <p className="text-sm font-medium text-gray-700">
                  {gorusme.irtibatSekli
                    ? {
                        telefon: '📞 Telefon', whatsapp: '💬 WhatsApp', mail: '✉️ Mail',
                        yuz_yuze: '🤝 Yüz Yüze', merkez: '🏢 Merkez', uzak_baglanti: '🖥️ Uzak Bağlantı',
                        bridge: '🌉 Bridge', online_toplanti: '📹 Online Toplantı',
                        telegram: '📨 Telegram', diger: '💡 Diğer',
                      }[gorusme.irtibatSekli] || gorusme.irtibatSekli
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Görüşen</p>
                <p className="text-sm font-medium text-gray-700">{gorusme.hazirlayan}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Tarih</p>
                <p className="text-sm font-medium text-gray-700">{gorusme.tarih}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Firma Geçmişi</p>
                <button
                  onClick={() => navigate(`/firma-gecmisi/${encodeURIComponent(gorusme.firmaAdi)}`)}
                  className="text-xs font-medium transition"
                  style={{ color: 'var(--primary)' }}
                >
                  Geçmişi gör →
                </button>
              </div>
            </div>

            {gorusme.notlar && (
              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-1">Notlar</p>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{gorusme.notlar}</p>
              </div>
            )}

            {/* Durum değiştir */}
            <div className="pt-4 border-t border-gray-100 mt-4">
              <p className="text-xs text-gray-400 mb-2">Durum</p>
              <div className="flex gap-2">
                {durumlar.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => durumDegistir(d.id)}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium transition"
                    style={{
                      background: gorusme.durum === d.id ? d.bg : 'transparent',
                      color: gorusme.durum === d.id ? d.renk : '#9ca3af',
                      border: gorusme.durum === d.id ? `1.5px solid ${d.renk}50` : '1.5px solid #e5e7eb',
                    }}
                  >
                    {d.isim}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Düzenleme formu */}
        {duzenleAcik && (
          <div className="border-t border-gray-100 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Konu</label>
                <CustomSelect
                  value={manuelKonuAc ? '__manuel__' : duzenleForm.konu}
                  onChange={(e) => {
                    if (e.target.value === '__manuel__') {
                      setManuelKonuAc(true)
                      setDuzenleForm({ ...duzenleForm, konu: '', manuelKonu: '' })
                    } else {
                      setManuelKonuAc(false)
                      setDuzenleForm({ ...duzenleForm, konu: e.target.value, manuelKonu: '' })
                    }
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
                    value={duzenleForm.manuelKonu || ''}
                    onChange={(e) => setDuzenleForm({ ...duzenleForm, manuelKonu: e.target.value.toUpperCase() })}
                    className="w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 mt-2"
                    placeholder="Konu yazın..."
                    autoFocus
                  />
                )}
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Durum</label>
                <CustomSelect
                  value={duzenleForm.durum}
                  onChange={(e) => setDuzenleForm({ ...duzenleForm, durum: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  {durumlar.map((d) => (
                    <option key={d.id} value={d.id}>{d.isim}</option>
                  ))}
                </CustomSelect>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600 mb-1 block">Notlar</label>
                <textarea
                  value={duzenleForm.takipNotu}
                  onChange={(e) => setDuzenleForm({ ...duzenleForm, takipNotu: e.target.value })}
                  rows={4}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="Görüşme detayları, takip edilecek konular..."
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={duzenleKaydet}
                className="text-sm px-5 py-2 rounded-xl text-white transition"
                style={{ background: 'var(--primary)' }}
              >
                Kaydet
              </button>
              <button
                onClick={() => setDuzenleAcik(false)}
                className="text-sm px-5 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
              >
                İptal
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bağlı Görevler */}
      <div
        className="rounded-2xl p-6"
        style={{
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid rgba(1,118,211,0.12)',
          boxShadow: '0 4px 24px rgba(1,118,211,0.08)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-gray-800">Bağlı Görevler</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {bagliGorevler.length > 0
                ? `${bagliGorevler.length} görev`
                : 'Bu görüşmeye henüz görev eklenmedi'}
            </p>
          </div>
          <button
            onClick={gorevFormAcik ? () => setGorevFormAcik(false) : gorevAc}
            className="text-sm px-4 py-2 rounded-xl text-white transition flex items-center gap-1.5"
            style={{
              background: gorevFormAcik
                ? '#9ca3af'
                : 'var(--primary)',
              boxShadow: gorevFormAcik ? 'none' : '0 4px 12px rgba(1,118,211,0.3)',
            }}
          >
            {gorevFormAcik ? 'İptal' : '+ Görev Oluştur'}
          </button>
        </div>

        {/* Görev oluşturma formu */}
        {gorevFormAcik && (
          <div
            className="rounded-xl p-4 mb-4"
            style={{ background: 'rgba(1,118,211,0.04)', border: '1px solid rgba(1,118,211,0.15)' }}
          >
            <p className="text-xs font-semibold text-indigo-600 mb-3 uppercase tracking-wide">Yeni Görev</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div className="md:col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Başlık *</label>
                <input
                  type="text"
                  value={gorevForm.baslik}
                  onChange={(e) => setGorevForm({ ...gorevForm, baslik: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="Görev başlığı"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Atanacak Kişi *</label>
                <CustomSelect
                  value={gorevForm.atanan}
                  onChange={(e) => setGorevForm({ ...gorevForm, atanan: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">Kişi seç...</option>
                  {kullanicilar.filter((k) => k.tip !== 'musteri').map((k) => (
                    <option key={k.id} value={k.id}>{k.ad}</option>
                  ))}
                </CustomSelect>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Son Tarih *</label>
                <input
                  type="date"
                  value={gorevForm.sonTarih}
                  onChange={(e) => setGorevForm({ ...gorevForm, sonTarih: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Öncelik</label>
                <div className="flex gap-2">
                  {gorevOncelikleri.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setGorevForm({ ...gorevForm, oncelik: o.id })}
                      className="flex-1 text-xs py-2 rounded-lg font-medium transition"
                      style={{
                        background: gorevForm.oncelik === o.id ? o.bg : 'var(--bg-card)',
                        color: gorevForm.oncelik === o.id ? o.renk : 'var(--text-muted)',
                        border: gorevForm.oncelik === o.id ? `1.5px solid ${o.renk}50` : '1.5px solid #e5e7eb',
                      }}
                    >
                      {o.isim}
                    </button>
                  ))}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Açıklama</label>
                <textarea
                  value={gorevForm.aciklama}
                  onChange={(e) => setGorevForm({ ...gorevForm, aciklama: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="Görev detayları..."
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={gorevKaydet}
                className="text-sm px-5 py-2 rounded-xl text-white transition"
                style={{ background: 'var(--primary)' }}
              >
                Görevi Kaydet
              </button>
              <button
                onClick={() => setGorevFormAcik(false)}
                className="text-sm px-5 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
              >
                İptal
              </button>
            </div>
          </div>
        )}

        {/* Bağlı görevler listesi */}
        {bagliGorevler.length === 0 && !gorevFormAcik && (
          <div
            className="flex flex-col items-center justify-center py-8 rounded-xl"
            style={{ border: '2px dashed rgba(1,118,211,0.2)' }}
          >
            <span className="text-2xl mb-2">📋</span>
            <p className="text-sm text-gray-400">Henüz görev eklenmedi</p>
            <p className="text-xs text-gray-300 mt-0.5">Yukarıdaki butona tıklayarak görev oluşturabilirsiniz</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {bagliGorevler.map((gorev) => {
            const oncelik = gorevOncelikleri.find((o) => o.id === gorev.oncelik)
            const durumBilgi = gorevDurumRenk(gorev.durum)
            const atananKisi = kullanicilar.find((k) => k.id?.toString() === gorev.atananId?.toString())
            const gecikti = gorev.bitisTarihi && new Date(gorev.bitisTarihi) < new Date() && gorev.durum !== 'tamamlandi'

            return (
              <div
                key={gorev.id}
                onClick={() => navigate(`/gorevler/${gorev.id}`)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition"
                style={{
                  background: 'rgba(255,255,255,0.7)',
                  border: gecikti ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(1,118,211,0.1)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(1,118,211,0.04)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.7)')}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{gorev.baslik}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: oncelik?.bg, color: oncelik?.renk }}
                    >
                      {oncelik?.isim}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: durumBilgi.bg, color: durumBilgi.renk }}
                    >
                      {durumBilgi.isim}
                    </span>
                    {gecikti && (
                      <span className="text-xs text-red-500 font-medium">⚠️ Gecikti</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 flex-shrink-0">
                  <span>{atananKisi?.ad}</span>
                  <span style={{ color: gecikti ? '#ef4444' : 'var(--text-muted)' }}>{gorev.bitisTarihi}</span>
                  <span className="text-indigo-400">Detay →</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default GorusmeDetay
