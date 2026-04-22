import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { modelKalemleriniGetir, DURUMLAR, durumBul, stokUrunleriniGetir, stokHareketleriniGetir } from '../services/stokService'
import { musterileriGetir } from '../services/musteriService'

const FILTRELER = [
  { id: 'tumu',            isim: 'Tümü',            ikon: '🌐' },
  { id: 'depoda',          isim: 'Depoda',          ikon: '📦' },
  { id: 'teknisyende',     isim: 'Teknisyende',     ikon: '🚚' },
  { id: 'sahada',          isim: 'Sahada',          ikon: '✅' },
  { id: 'arizada',         isim: 'Arızalı',         ikon: '⚠️' },
  { id: 'arizali_depoda',  isim: 'Arızalı Depoda',  ikon: '🔧' },
  { id: 'tamirde',         isim: 'Tamirde',         ikon: '🛠️' },
  { id: 'hurda',           isim: 'Hurda',           ikon: '🗑️' },
]

const hareketTurRenk = {
  giris:           { isim: 'Ana Depo Girişi',    renk: '#10b981', bg: 'rgba(16,185,129,0.1)', gc: 'G' },
  transfer_cikis:  { isim: 'Personele Transfer', renk: '#0176D3', bg: 'rgba(1,118,211,0.1)',  gc: 'C' },
  transfer_giris:  { isim: 'Personelden İade',   renk: '#f59e0b', bg: 'rgba(245,158,11,0.1)', gc: 'G' },
  cikis:           { isim: 'Müşteri Çıkışı',     renk: '#ef4444', bg: 'rgba(239,68,68,0.1)',  gc: 'C' },
}

function ModelDetay() {
  const { stokKodu } = useParams()
  const navigate = useNavigate()
  const [kalemler, setKalemler] = useState([])
  const [urun, setUrun] = useState(null)
  const [hareketler, setHareketler] = useState([])
  const [musteriMap, setMusteriMap] = useState(new Map())
  const [filtre, setFiltre] = useState('tumu')
  const [arama, setArama] = useState('')
  const [yukleniyor, setYukleniyor] = useState(true)

  useEffect(() => {
    Promise.all([
      modelKalemleriniGetir(stokKodu),
      stokUrunleriniGetir(),
      stokHareketleriniGetir(),
      musterileriGetir(),
    ]).then(([k, u, h, m]) => {
      setKalemler(k || [])
      setUrun((u || []).find(x => x.stokKodu === stokKodu) || null)
      setHareketler((h || []).filter(x => x.stokKodu === stokKodu))
      const map = new Map()
      ;(m || []).forEach(x => map.set(x.id, x))
      setMusteriMap(map)
      setYukleniyor(false)
    })
  }, [stokKodu])

  const sayilar = useMemo(() => {
    const s = { toplam: kalemler.length, depoda: 0, teknisyende: 0, sahada: 0, arizada: 0, arizali_depoda: 0, tamirde: 0, hurda: 0 }
    kalemler.forEach(k => { if (s[k.durum] !== undefined) s[k.durum] += 1 })
    return s
  }, [kalemler])

  // Toplu ürün bakiye hesaplaması
  const bakiye = useMemo(() => {
    return hareketler.reduce((top, h) => {
      if (h.hareketTipi === 'giris' || h.hareketTipi === 'transfer_giris') return top + Number(h.miktar || 0)
      if (h.hareketTipi === 'cikis' || h.hareketTipi === 'transfer_cikis') return top - Number(h.miktar || 0)
      return top
    }, 0)
  }, [hareketler])

  const seriTakipli = kalemler.length > 0

  const ornek = kalemler[0]
  const modelAdi = seriTakipli
    ? `${ornek?.marka ? ornek.marka + ' ' : ''}${ornek?.model || urun?.stokAdi || stokKodu}`
    : (urun?.stokAdi || stokKodu)

  const filtrelenmis = useMemo(() => {
    let liste = filtre === 'tumu' ? kalemler : kalemler.filter(k => k.durum === filtre)
    if (arama.trim()) {
      const q = arama.trim().toLowerCase()
      liste = liste.filter(k =>
        [k.seriNo, k.barkod, k.marka, k.model].filter(Boolean).some(s => String(s).toLowerCase().includes(q))
      )
    }
    return liste
  }, [kalemler, filtre, arama])

  // Müşteri bazlı çıkış dağılımı (toplu ürünler için)
  const musteriDagilimi = useMemo(() => {
    const map = new Map()
    hareketler
      .filter(h => h.hareketTipi === 'cikis' && h.aciklama)
      .forEach(h => {
        // Açıklamadan müşteri adını bul: "Müşteri: XXX" pattern'i
        const m = h.aciklama.match(/Müşteri:\s*([^·]+)/)
        if (m) {
          const ad = m[1].trim()
          map.set(ad, (map.get(ad) || 0) + Number(h.miktar || 0))
        }
      })
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [hareketler])

  if (yukleniyor) return <div className="p-6 text-center text-gray-400">Yükleniyor...</div>

  const tarihFmt = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    if (isNaN(d)) return '—'
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const tarihSaatFmt = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    if (isNaN(d)) return '—'
    const gun = String(d.getDate()).padStart(2, '0')
    const ay = String(d.getMonth() + 1).padStart(2, '0')
    const yil = d.getFullYear()
    return `${gun}.${ay}.${yil}`
  }

  const kritikMi = urun?.minStok && bakiye <= Number(urun.minStok)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button
        onClick={() => navigate('/stok')}
        className="text-sm text-gray-400 hover:text-blue-600 mb-6 flex items-center gap-1 transition"
      >
        ← Stok Listesine Dön
      </button>

      {/* ── Üst Özet Kartı ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-4">
        <div className="h-1.5" style={{ background: 'var(--primary)' }} />
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              {urun?.gorselUrl ? (
                <img src={urun.gorselUrl} alt="" className="w-14 h-14 rounded-2xl object-contain bg-gray-50 border border-gray-100 flex-shrink-0" />
              ) : (
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl flex-shrink-0"
                  style={{ background: 'var(--primary)' }}
                >
                  {seriTakipli ? '📱' : '📦'}
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold text-gray-800">{modelAdi}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {stokKodu}
                  </span>
                  {seriTakipli ? (
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">
                      🔖 S/N Takipli · {sayilar.toplam} adet
                    </span>
                  ) : (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                      📦 Toplu Ürün
                    </span>
                  )}
                  {urun?.marka && <span className="text-xs text-gray-500">🏷️ {urun.marka}</span>}
                  {urun?.grupKodu && <span className="text-xs text-gray-500">📂 {urun.grupKodu}</span>}
                </div>
                {urun?.aciklama && (
                  <p className="text-xs text-gray-400 mt-2">{urun.aciklama}</p>
                )}
              </div>
            </div>
          </div>

          {/* S/N Takipli → Durum özetleri */}
          {seriTakipli && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mt-5">
              {DURUMLAR.map(d => {
                const sayi = sayilar[d.id] || 0
                return (
                  <div
                    key={d.id}
                    className="rounded-lg border border-gray-100 px-3 py-2 text-center cursor-pointer hover:shadow-sm transition"
                    style={{ background: sayi > 0 ? `${d.renk}10` : '#f9fafb' }}
                    onClick={() => setFiltre(d.id)}
                  >
                    <div className="text-lg font-bold" style={{ color: sayi > 0 ? d.renk : '#9ca3af' }}>
                      {sayi}
                    </div>
                    <div className="text-[10px] text-gray-500 font-medium">
                      {d.ikon} {d.isim}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Toplu Ürün → Miktar özetleri */}
          {!seriTakipli && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
              <div className={`rounded-xl p-4 text-center border ${kritikMi ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'}`}>
                <p className={`text-xs font-medium ${kritikMi ? 'text-red-500' : 'text-blue-600'}`}>
                  Güncel Bakiye
                </p>
                <p className={`text-2xl font-bold mt-1 ${kritikMi ? 'text-red-600' : 'text-blue-700'}`}>
                  {bakiye.toFixed(0)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{urun?.birim || 'Adet'}</p>
              </div>
              <div className="rounded-xl p-4 text-center bg-gray-50 border border-gray-100">
                <p className="text-xs text-gray-500 font-medium">Min. Stok</p>
                <p className="text-2xl font-bold text-gray-700 mt-1">
                  {urun?.minStok || '—'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{urun?.minStok ? (urun?.birim || 'Adet') : ''}</p>
              </div>
              <div className="rounded-xl p-4 text-center bg-green-50 border border-green-100">
                <p className="text-xs text-green-600 font-medium">Toplam Giriş</p>
                <p className="text-2xl font-bold text-green-700 mt-1">
                  {hareketler.filter(h => ['giris','transfer_giris'].includes(h.hareketTipi)).reduce((s,h) => s + Number(h.miktar||0), 0).toFixed(0)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{urun?.birim || ''}</p>
              </div>
              <div className="rounded-xl p-4 text-center bg-orange-50 border border-orange-100">
                <p className="text-xs text-orange-600 font-medium">Toplam Çıkış</p>
                <p className="text-2xl font-bold text-orange-700 mt-1">
                  {hareketler.filter(h => ['cikis','transfer_cikis'].includes(h.hareketTipi)).reduce((s,h) => s + Number(h.miktar||0), 0).toFixed(0)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{urun?.birim || ''}</p>
              </div>
            </div>
          )}

          {kritikMi && (
            <div className="mt-4 px-4 py-2.5 rounded-lg bg-red-50 border border-red-100 flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <p className="text-sm text-red-600 font-medium">
                Stok kritik seviyenin altına düştü! Min. {urun.minStok} {urun.birim}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* S/N TAKİPLİ ÜRÜNLER İÇİN GÖRÜNÜM                   */}
      {/* ══════════════════════════════════════════════════ */}
      {seriTakipli && (
        <>
          {/* Filtre + Arama */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <input
              type="text"
              value={arama}
              onChange={e => setArama(e.target.value)}
              placeholder="S/N, Barkod, Marka, Model ara..."
              className="flex-1 min-w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={filtre}
              onChange={e => setFiltre(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {FILTRELER.map(f => (
                <option key={f.id} value={f.id}>{f.ikon} {f.isim}</option>
              ))}
            </select>
          </div>

          {/* Kalem Listesi */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {filtrelenmis.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm">
                {arama ? 'Arama sonucu bulunamadı.' : 'Bu durumda kalem yok.'}
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filtrelenmis.map(k => {
                  const d = durumBul(k.durum)
                  const musteri = k.musteriId ? musteriMap.get(k.musteriId) : null
                  return (
                    <div key={k.id} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-base flex-shrink-0 mt-0.5"
                        style={{ background: d ? `${d.renk}15` : '#f3f4f6' }}
                      >
                        {d?.ikon || '📦'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-mono font-bold text-gray-800">
                            S/N: {k.seriNo || '—'}
                          </span>
                          {d && (
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-semibold border"
                              style={{ background: `${d.renk}15`, color: d.renk, borderColor: `${d.renk}40` }}
                            >
                              {d.ikon} {d.isim}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400 mt-1 flex-wrap">
                          {k.marka && <span>🏷️ {k.marka}</span>}
                          {k.model && <span>📱 {k.model}</span>}
                          {k.barkod && <span>🔖 {k.barkod}</span>}
                          {musteri && (
                            <span
                              className="text-indigo-500 cursor-pointer hover:underline"
                              onClick={() => navigate(`/musteriler/${musteri.id}`)}
                            >
                              🏢 {musteri.firma}
                            </span>
                          )}
                          {k.durum === 'sahada' && k.takilmaTarihi && (
                            <span className="text-green-600">📅 {tarihFmt(k.takilmaTarihi)}</span>
                          )}
                        </div>
                        {k.notlar && (
                          <p className="text-xs text-gray-400 italic mt-1 line-clamp-1">{k.notlar}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* TOPLU ÜRÜNLER İÇİN GÖRÜNÜM                         */}
      {/* ══════════════════════════════════════════════════ */}
      {!seriTakipli && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Sol: Son Hareketler (2 sütun) */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">
                📊 Son Hareketler
                <span className="ml-2 text-xs font-normal text-gray-400">({hareketler.length})</span>
              </h3>
              <button
                onClick={() => navigate('/stok-hareketleri')}
                className="text-xs text-blue-500 hover:underline"
              >
                Tümü →
              </button>
            </div>
            {hareketler.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm">
                Henüz hareket kaydı yok.
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {hareketler.slice(0, 15).map(h => {
                  const bilgi = hareketTurRenk[h.hareketTipi] || { isim: h.hareketTipi, renk: '#6b7280', bg: '#f3f4f6', gc: '?' }
                  return (
                    <div key={h.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold"
                        style={{ background: bilgi.bg, color: bilgi.renk }}
                      >
                        {bilgi.gc}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: bilgi.bg, color: bilgi.renk }}>
                            {bilgi.isim}
                          </span>
                          <span className="text-xs text-gray-400">{tarihSaatFmt(h.tarih)}</span>
                        </div>
                        {h.aciklama && (
                          <p className="text-xs text-gray-500 truncate mt-0.5">{h.aciklama}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-sm font-bold" style={{ color: bilgi.gc === 'G' ? '#10b981' : '#ef4444' }}>
                          {bilgi.gc === 'G' ? '+' : '−'}{Number(h.miktar).toFixed(0)}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">{urun?.birim || ''}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Sağ: Müşteri Dağılımı */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">
                🏢 En Çok Giden Müşteriler
              </h3>
            </div>
            {musteriDagilimi.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                Henüz müşteri çıkışı yok.
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {musteriDagilimi.map(([ad, toplam], i) => {
                  const maxMiktar = musteriDagilimi[0][1]
                  const yuzde = (toplam / maxMiktar) * 100
                  return (
                    <div key={ad} className="px-5 py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-gray-700 truncate flex-1 mr-2">
                          {i + 1}. {ad}
                        </span>
                        <span className="text-sm font-bold text-gray-800">
                          {toplam.toFixed(0)} <span className="text-xs font-normal text-gray-400">{urun?.birim || ''}</span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${yuzde}%`, background: 'var(--primary)' }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ModelDetay
