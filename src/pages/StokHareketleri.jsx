import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext'
import CustomSelect from '../components/CustomSelect'
import { stokUrunleriniGetir, stokHareketleriniGetir, stokHareketEkle } from '../services/stokService'
import { musterileriGetir } from '../services/musteriService'

const hareketTurleri = [
  { id: 'giris', isim: 'Ana Depo Girişi', renk: 'bg-green-100 text-green-700', gc: 'G' },
  { id: 'transfer_cikis', isim: 'Personele Transfer', renk: 'bg-blue-100 text-blue-700', gc: 'C' },
  { id: 'transfer_giris', isim: 'Personelden İade', renk: 'bg-amber-100 text-amber-700', gc: 'G' },
  { id: 'cikis', isim: 'Müşteri Çıkışı', renk: 'bg-red-100 text-red-700', gc: 'C' },
]

// Tarih + saat formatı (Türkiye)
const tarihSaat = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return iso
  const gun = String(d.getDate()).padStart(2, '0')
  const ay = String(d.getMonth() + 1).padStart(2, '0')
  const yil = d.getFullYear()
  const ss = String(d.getHours()).padStart(2, '0')
  const dk = String(d.getMinutes()).padStart(2, '0')
  return `${gun}.${ay}.${yil} ${ss}:${dk}`
}

const bosForm = {
  stokKodu: '',
  hareketTipi: 'giris',
  miktar: '',
  aciklama: '',
  tarih: new Date().toISOString().split('T')[0],
  personelId: '',
  musteriId: '',
}

function StokHareketleri() {
  const { kullanici, kullanicilar } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [hareketler, setHareketler] = useState([])
  const [urunler, setUrunler] = useState([])
  const [musteriler, setMusteriler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [form, setForm] = useState(bosForm)
  const [goster, setGoster] = useState(false)
  const [filtre, setFiltre] = useState('hepsi')
  const [arama, setArama] = useState('')
  const [detayHareket, setDetayHareket] = useState(null) // seçili satır detay modalı

  useEffect(() => {
    Promise.all([stokUrunleriniGetir(), stokHareketleriniGetir(), musterileriGetir()]).then(([urunData, hareketData, musteriData]) => {
      setUrunler(urunData || [])
      setHareketler(hareketData || [])
      setMusteriler(musteriData || [])
      setYukleniyor(false)
    })
  }, [])

  if (yukleniyor) return <div className="p-6 text-center text-gray-400">Yükleniyor...</div>

  const secilenUrun = urunler.find((u) => u.stokKodu === form.stokKodu)

  const anaBakiye = (stokKodu) => {
    return hareketler
      .filter((h) => h.stokKodu === stokKodu)
      .reduce((toplam, h) => {
        if (h.hareketTipi === 'giris' || h.hareketTipi === 'transfer_giris') return toplam + Number(h.miktar)
        if (h.hareketTipi === 'cikis' || h.hareketTipi === 'transfer_cikis') return toplam - Number(h.miktar)
        return toplam
      }, 0)
  }

  const formAc = () => {
    setForm({ ...bosForm, tarih: new Date().toISOString().split('T')[0] })
    setGoster(true)
  }

  const kaydet = async () => {
    if (!form.stokKodu || !form.miktar || !form.hareketTipi) {
      alert('Stok, tür ve miktar zorunludur!')
      return
    }
    const urun = urunler.find((u) => u.stokKodu === form.stokKodu)
    const musteri = musteriler.find((m) => m.id?.toString() === form.musteriId?.toString())
    const personel = kullanicilar.find((k) => k.id?.toString() === form.personelId?.toString())
    const aciklamaOtomatik = musteri
      ? `Müşteri: ${musteri.firma || musteri.ad}`
      : personel
      ? `Personel: ${personel.ad}`
      : ''

    const yeniHareket = await stokHareketEkle({
      stokKodu: form.stokKodu,
      stokAdi: urun?.stokAdi || '',
      hareketTipi: form.hareketTipi,
      miktar: Number(form.miktar),
      aciklama: form.aciklama || aciklamaOtomatik,
      tarih: form.tarih,
    })
    if (yeniHareket) {
      setHareketler(prev => [yeniHareket, ...prev])
      toast.success('Hareket kaydedildi.')
      setForm(bosForm)
      setGoster(false)
    } else {
      toast.error('Hareket kaydedilemedi.')
    }
  }

  const iptal = () => {
    setForm(bosForm)
    setGoster(false)
  }

  const gorunenHareketler = [...hareketler]
    .filter((h) => filtre === 'hepsi' || h.hareketTipi === filtre)
    .filter((h) =>
      arama === '' ||
      `${h.stokKodu} ${h.stokAdi} ${h.aciklama}`
        .toLowerCase()
        .includes(arama.toLowerCase())
    )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Stok Hareketleri</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{hareketler.length} hareket</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/stok')}
            className="text-sm px-4 py-2 rounded-lg border transition"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            Stok Kartları
          </button>
          <button
            onClick={formAc}
            className="text-white text-sm px-4 py-2 rounded-lg transition"
            style={{ background: 'var(--primary)' }}
          >
            + Yeni Hareket
          </button>
        </div>
      </div>

      {/* Filtre */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[{ id: 'hepsi', isim: 'Tümü' }, ...hareketTurleri].map((t) => (
          <button
            key={t.id}
            onClick={() => setFiltre(t.id)}
            className="text-sm px-3 py-1.5 rounded-lg border transition"
            style={filtre === t.id
              ? { background: 'var(--primary)', color: 'white', borderColor: 'var(--primary)' }
              : { background: 'var(--bg-card)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }
            }
          >
            {t.isim}
          </button>
        ))}
      </div>

      {/* Arama */}
      <div className="mb-6">
        <input
          type="text"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Stok kodu veya açıklama ara..."
          className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{ border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
        />
      </div>

      {/* Form */}
      {goster && (
        <div className="rounded-xl p-6 mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h3 className="font-medium mb-4" style={{ color: 'var(--text-primary)' }}>Yeni Stok Hareketi</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-sm mb-1 block" style={{ color: 'var(--text-secondary)' }}>Hareket Türü *</label>
              <CustomSelect
                value={form.hareketTipi}
                onChange={(e) => setForm({ ...form, hareketTipi: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ border: '1px solid var(--border)' }}
              >
                {hareketTurleri.map((t) => (
                  <option key={t.id} value={t.id}>{t.isim}</option>
                ))}
              </CustomSelect>
            </div>

            <div className="md:col-span-2">
              <label className="text-sm mb-1 block" style={{ color: 'var(--text-secondary)' }}>Stok Seç *</label>
              <CustomSelect
                value={form.stokKodu}
                onChange={(e) => setForm({ ...form, stokKodu: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ border: '1px solid var(--border)' }}
              >
                <option value="">Stok seç...</option>
                {urunler.map((u) => (
                  <option key={u.id} value={u.stokKodu}>
                    {u.stokKodu} — {u.stokAdi} (Bakiye: {anaBakiye(u.stokKodu).toFixed(0)} {u.birim})
                  </option>
                ))}
              </CustomSelect>
            </div>

            <div>
              <label className="text-sm mb-1 block" style={{ color: 'var(--text-secondary)' }}>Miktar *</label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={form.miktar}
                  onChange={(e) => setForm({ ...form, miktar: e.target.value })}
                  className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  placeholder="0"
                  min="0"
                />
                {secilenUrun && (
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{secilenUrun.birim}</span>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm mb-1 block" style={{ color: 'var(--text-secondary)' }}>Tarih</label>
              <input
                type="date"
                value={form.tarih}
                onChange={(e) => setForm({ ...form, tarih: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
              />
            </div>

            {/* Personele Transfer */}
            {form.hareketTipi === 'transfer_cikis' && (
              <div>
                <label className="text-sm mb-1 block" style={{ color: 'var(--text-secondary)' }}>Personel *</label>
                <CustomSelect
                  value={form.personelId}
                  onChange={(e) => setForm({ ...form, personelId: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ border: '1px solid var(--border)' }}
                >
                  <option value="">Personel seç...</option>
                  {kullanicilar.map((k) => (
                    <option key={k.id} value={k.id}>{k.ad}</option>
                  ))}
                </CustomSelect>
              </div>
            )}

            {/* Personelden İade */}
            {form.hareketTipi === 'transfer_giris' && (
              <div>
                <label className="text-sm mb-1 block" style={{ color: 'var(--text-secondary)' }}>İade Eden Personel</label>
                <CustomSelect
                  value={form.personelId}
                  onChange={(e) => setForm({ ...form, personelId: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ border: '1px solid var(--border)' }}
                >
                  <option value="">Personel seç...</option>
                  {kullanicilar.map((k) => (
                    <option key={k.id} value={k.id}>{k.ad}</option>
                  ))}
                </CustomSelect>
              </div>
            )}

            {/* Müşteri Çıkışı */}
            {form.hareketTipi === 'cikis' && (
              <>
                <div>
                  <label className="text-sm mb-1 block" style={{ color: 'var(--text-secondary)' }}>Müşteri *</label>
                  <CustomSelect
                    value={form.musteriId}
                    onChange={(e) => setForm({ ...form, musteriId: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <option value="">Müşteri seç...</option>
                    {musteriler.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.ad} {m.soyad} — {m.firma}
                      </option>
                    ))}
                  </CustomSelect>
                </div>
                <div>
                  <label className="text-sm mb-1 block" style={{ color: 'var(--text-secondary)' }}>Çıkış Yapan Personel</label>
                  <CustomSelect
                    value={form.personelId}
                    onChange={(e) => setForm({ ...form, personelId: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <option value="">Personel seç...</option>
                    {kullanicilar.map((k) => (
                      <option key={k.id} value={k.id}>{k.ad}</option>
                    ))}
                  </CustomSelect>
                </div>
              </>
            )}

            <div className="md:col-span-3">
              <label className="text-sm mb-1 block" style={{ color: 'var(--text-secondary)' }}>Açıklama</label>
              <input
                type="text"
                value={form.aciklama}
                onChange={(e) => setForm({ ...form, aciklama: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                placeholder="Hareket açıklaması..."
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={kaydet} className="text-white text-sm px-5 py-2 rounded-lg transition" style={{ background: 'var(--primary)' }}>
              Kaydet
            </button>
            <button onClick={iptal} className="text-sm px-5 py-2 rounded-lg border transition" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              İptal
            </button>
          </div>
        </div>
      )}

      {/* Liste */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-medium uppercase tracking-wide"
          style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <div className="col-span-2">Tarih</div>
          <div className="col-span-2">Stok Kodu</div>
          <div className="col-span-3">Stok Adı</div>
          <div className="col-span-2">Tür</div>
          <div className="col-span-1 text-center">G/C</div>
          <div className="col-span-2 text-right">Miktar</div>
        </div>

        {gorunenHareketler.length === 0 && (
          <div className="p-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            {arama ? 'Arama sonucu bulunamadı.' : 'Henüz hareket eklenmedi.'}
          </div>
        )}

        {gorunenHareketler.map((h) => {
          const tur = hareketTurleri.find((t) => t.id === h.hareketTipi)
          const urun = urunler.find((u) => u.stokKodu === h.stokKodu)
          return (
            <div
              key={h.id}
              onClick={() => setDetayHareket(h)}
              className="grid grid-cols-12 gap-2 px-4 py-3 items-center cursor-pointer hover:bg-gray-50 transition"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <div className="col-span-2">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{tarihSaat(h.tarih)}</p>
              </div>
              <div className="col-span-2">
                <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{h.stokKodu}</span>
              </div>
              <div className="col-span-3">
                <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{h.stokAdi || urun?.stokAdi || '—'}</p>
                {h.aciklama && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{h.aciklama}</p>}
              </div>
              <div className="col-span-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tur?.renk || 'bg-gray-100 text-gray-600'}`}>
                  {tur?.isim || h.hareketTipi}
                </span>
              </div>
              <div className="col-span-1 text-center">
                <span className={`text-xs font-bold ${tur?.gc === 'G' ? 'text-green-600' : 'text-red-500'}`}>
                  {tur?.gc || '—'}
                </span>
              </div>
              <div className="col-span-2 text-right">
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {Number(h.miktar).toFixed(0)}
                </span>
                <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>{urun?.birim || ''}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── DETAY MODAL ── */}
      {detayHareket && (() => {
        const h = detayHareket
        const tur = hareketTurleri.find((t) => t.id === h.hareketTipi)
        const urun = urunler.find((u) => u.stokKodu === h.stokKodu)
        const yeniBakiye = anaBakiye(h.stokKodu)
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setDetayHareket(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tur?.renk || 'bg-gray-100 text-gray-600'}`}>
                      {tur?.isim || h.hareketTipi}
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tur?.gc === 'G' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                      {tur?.gc === 'G' ? '↗ Giriş' : '↘ Çıkış'}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-800">Stok Hareketi Detayı</h3>
                  <p className="text-xs text-gray-400 mt-0.5">#{h.id}</p>
                </div>
                <button
                  onClick={() => setDetayHareket(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-2"
                >
                  ×
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-5">
                {/* Stok Bilgisi */}
                <div className="flex items-start gap-4 p-4 rounded-xl bg-blue-50 border border-blue-100">
                  {urun?.gorselUrl ? (
                    <img src={urun.gorselUrl} alt="" className="w-14 h-14 rounded-lg object-contain border border-blue-200 bg-white flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-white border border-blue-200 flex items-center justify-center text-blue-400 text-xl flex-shrink-0">📦</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800">{h.stokAdi || urun?.stokAdi || '—'}</p>
                    <p className="text-xs font-mono text-blue-600 mt-0.5">{h.stokKodu}</p>
                    <div className="flex gap-3 mt-2 flex-wrap">
                      {urun?.marka && <span className="text-xs text-gray-500">🏷️ {urun.marka}</span>}
                      {urun?.grupKodu && <span className="text-xs text-gray-500">📂 {urun.grupKodu}</span>}
                      {urun?.birim && <span className="text-xs text-gray-500">📏 {urun.birim}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/stok/model/${encodeURIComponent(h.stokKodu)}`)}
                    className="text-xs text-blue-500 hover:text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5 transition"
                  >
                    Karta Git →
                  </button>
                </div>

                {/* Meta Bilgiler */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Tarih / Saat</p>
                    <p className="text-sm font-medium text-gray-700">{tarihSaat(h.tarih)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Miktar</p>
                    <p className="text-sm font-bold" style={{ color: tur?.gc === 'G' ? '#10b981' : '#ef4444' }}>
                      {tur?.gc === 'G' ? '+' : '-'}{Number(h.miktar).toFixed(0)} {urun?.birim || ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Güncel Bakiye</p>
                    <p className="text-sm font-bold text-gray-700">{yeniBakiye.toFixed(0)} {urun?.birim || ''}</p>
                  </div>
                </div>

                {/* Açıklama */}
                {h.aciklama && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Açıklama</p>
                    <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{h.aciklama}</p>
                    </div>
                  </div>
                )}

                {/* Alt tablo: Stok durumu */}
                {urun && (() => {
                  const kritikMi = urun.minStok && yeniBakiye <= Number(urun.minStok)
                  return (
                    <div className="pt-4 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Stok Durumu</p>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                          <p className="text-xs text-blue-600">Şu anki Bakiye</p>
                          <p className="text-base font-bold text-blue-700 mt-0.5">{yeniBakiye.toFixed(0)} <span className="text-xs font-normal">{urun.birim || ''}</span></p>
                        </div>
                        <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                          <p className="text-xs text-gray-400">Min. Stok Uyarı</p>
                          <p className="text-base font-bold text-gray-700 mt-0.5">{urun.minStok ? `${urun.minStok} ${urun.birim || ''}` : '—'}</p>
                        </div>
                        <div className={`p-3 rounded-lg border ${kritikMi ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                          <p className={`text-xs ${kritikMi ? 'text-red-500' : 'text-green-600'}`}>Durum</p>
                          <p className={`text-base font-bold mt-0.5 ${kritikMi ? 'text-red-600' : 'text-green-700'}`}>
                            {kritikMi ? '⚠️ Kritik' : '✓ Yeterli'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
                <button
                  onClick={() => setDetayHareket(null)}
                  className="text-sm text-gray-600 border border-gray-200 rounded-lg px-4 py-1.5 hover:bg-white transition"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default StokHareketleri
