import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { katalogUrunleriniGetir } from '../../services/stokService'
import CustomSelect from '../../components/CustomSelect'

export default function TeklifIste() {
  const { kullanici } = useAuth()
  const navigate = useNavigate()

  const ayarlar = JSON.parse(localStorage.getItem('sistem_ayarlari') || '{}')
  const datasheetUrl = ayarlar.datasheetUrl || ''

  // Katalog
  const [katalogUrunler, setKatalogUrunler] = useState([])
  const [katalogYukleniyor, setKatalogYukleniyor] = useState(true)
  const [arama, setArama] = useState('')
  const [seciliGrup, setSeciliGrup] = useState('hepsi')

  // Sepet (seçilen ürünler)
  const [sepet, setSepet] = useState([]) // [{ urun, adet }]

  // Form
  const [gorünüm, setGörünüm] = useState('katalog') // 'katalog' | 'form'
  const [aciklama, setAciklama] = useState('')
  const [butce, setButce] = useState('')
  const [iletisimKisi, setIletisimKisi] = useState(kullanici?.ad || '')
  const [telefon, setTelefon] = useState('')
  const [hatalar, setHatalar] = useState({})
  const [gonderildi, setGonderildi] = useState(false)
  const [buyukGorsel, setBuyukGorsel] = useState(null)

  useEffect(() => {
    katalogUrunleriniGetir().then((data) => {
      setKatalogUrunler(data || [])
      setKatalogYukleniyor(false)
    })
  }, [])

  const gruplar = useMemo(() => {
    const gs = [...new Set(katalogUrunler.map(u => u.grupKodu).filter(Boolean))]
    return gs.sort()
  }, [katalogUrunler])

  const filtreliUrunler = useMemo(() =>
    katalogUrunler.filter(u => {
      const aramaUygun = !arama ||
        `${u.stokAdi} ${u.marka} ${u.stokKodu}`.toLowerCase().includes(arama.toLowerCase())
      const grupUygun = seciliGrup === 'hepsi' || u.grupKodu === seciliGrup
      return aramaUygun && grupUygun
    }),
    [katalogUrunler, arama, seciliGrup]
  )

  const sepeteEkle = (urun) => {
    setSepet(prev => {
      const var_ = prev.find(s => s.urun.id === urun.id)
      if (var_) return prev.map(s => s.urun.id === urun.id ? { ...s, adet: s.adet + 1 } : s)
      return [...prev, { urun, adet: 1 }]
    })
  }

  const sepetAdetGuncelle = (urunId, adet) => {
    if (adet <= 0) {
      setSepet(prev => prev.filter(s => s.urun.id !== urunId))
    } else {
      setSepet(prev => prev.map(s => s.urun.id === urunId ? { ...s, adet } : s))
    }
  }

  const sepettenCikar = (urunId) => {
    setSepet(prev => prev.filter(s => s.urun.id !== urunId))
  }

  const sepetteMi = (urunId) => sepet.find(s => s.urun.id === urunId)

  const dogrula = () => {
    const h = {}
    if (sepet.length === 0) h.sepet = 'En az bir ürün seçiniz'
    if (!aciklama.trim()) h.aciklama = 'Açıklama giriniz'
    setHatalar(h)
    return Object.keys(h).length === 0
  }

  const gonder = () => {
    if (!dogrula()) return
    const mevcutlar = JSON.parse(localStorage.getItem('musteri_teklif_talepleri') || '[]')
    const sayi = mevcutlar.length + 1
    const yeni = {
      id: crypto.randomUUID(),
      talepNo: `TT-${String(sayi).padStart(4, '0')}`,
      musteriId: kullanici.id,
      musteriAd: kullanici.ad,
      firmaAdi: kullanici.firmaAdi || '',
      urunler: sepet.map(s => ({
        isim: s.urun.stokAdi,
        adet: String(s.adet),
        stokKodu: s.urun.stokKodu,
        marka: s.urun.marka || '',
      })),
      aciklama,
      butce,
      iletisimKisi,
      telefon,
      tarih: new Date().toISOString(),
      durum: 'bekliyor',
    }
    localStorage.setItem('musteri_teklif_talepleri', JSON.stringify([...mevcutlar, yeni]))
    setGonderildi(true)
  }

  if (gonderildi) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="w-20 h-20 rounded-full flex items-center justify-center text-4xl mb-6"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 8px 32px rgba(16,185,129,0.3)' }}
        >
          ✓
        </motion.div>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
          Teklif Talebiniz Alındı!
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px', textAlign: 'center', maxWidth: '400px' }}>
          Satış ekibimiz seçtiğiniz ürünleri inceleyip en kısa sürede size teklif hazırlayacaktır.
        </p>
        <button
          onClick={() => navigate('/musteri-portal')}
          className="px-6 py-2.5 rounded text-sm font-medium text-white"
          style={{ background: 'var(--primary)' }}
        >
          Ana Panele Dön
        </button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      {/* Başlık */}
      <div className="mb-5">
        <button onClick={() => navigate('/musteri-portal')} className="text-sm flex items-center gap-1 mb-3 transition-colors" style={{ color: 'var(--primary)' }}>
          ← Geri Dön
        </button>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>Teklif İste</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
              Ürünleri seçin, miktarlarını belirleyin ve talebinizi gönderin.
            </p>
          </div>
          {datasheetUrl && (
            <a href={datasheetUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition"
              style={{ background: 'rgba(1,118,211,0.08)', color: 'var(--primary)', border: '1px solid rgba(1,118,211,0.2)', textDecoration: 'none' }}
            >
              📄 Ürün Kataloğu
            </a>
          )}
        </div>
      </div>

      <div className="flex gap-6 items-start">
        {/* Sol: Katalog */}
        <div className="flex-1 min-w-0">
          {/* Arama + Filtre */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <input
              type="text"
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              placeholder="Ürün ara..."
              className="flex-1 min-w-[180px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <CustomSelect
              value={seciliGrup}
              onChange={(e) => setSeciliGrup(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="hepsi">Tüm Kategoriler</option>
              {gruplar.map(g => <option key={g} value={g}>{g}</option>)}
            </CustomSelect>
          </div>

          {/* Ürün Grid */}
          {katalogYukleniyor ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-xl bg-gray-100 animate-pulse" style={{ height: '200px' }} />
              ))}
            </div>
          ) : filtreliUrunler.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-3xl mb-3">📦</p>
              <p className="text-sm">{arama ? 'Arama sonucu bulunamadı' : 'Katalogda ürün bulunamadı'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtreliUrunler.map((urun) => {
                const secili = sepetteMi(urun.id)
                return (
                  <motion.div
                    key={urun.id}
                    layout
                    whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(1,118,211,0.12)' }}
                    className="rounded-xl overflow-hidden cursor-pointer transition-all"
                    style={{
                      border: secili ? '2px solid var(--primary)' : '1px solid #e8ecf0',
                      background: secili ? 'rgba(1,118,211,0.04)' : 'white',
                    }}
                    onClick={() => sepeteEkle(urun)}
                  >
                    {/* Görsel */}
                    <div
                      className="relative bg-gray-50 flex items-center justify-center overflow-hidden"
                      style={{ height: '130px' }}
                    >
                      {urun.gorselUrl ? (
                        <img
                          src={urun.gorselUrl}
                          alt={urun.stokAdi}
                          className="w-full h-full object-contain p-3"
                          onClick={(e) => { e.stopPropagation(); setBuyukGorsel(urun) }}
                        />
                      ) : (
                        <div className="text-gray-200 text-5xl">📦</div>
                      )}
                      {secili && (
                        <div
                          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ background: 'var(--primary)' }}
                        >
                          {secili.adet}
                        </div>
                      )}
                      {urun.grupKodu && (
                        <div className="absolute top-2 left-2">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white/80 text-gray-500 border border-gray-100">
                            {urun.grupKodu}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Bilgi */}
                    <div className="p-3">
                      <p className="text-sm font-semibold text-gray-800 line-clamp-2 leading-tight mb-1">
                        {urun.stokAdi}
                      </p>
                      {urun.marka && (
                        <p className="text-xs text-gray-400">{urun.marka}</p>
                      )}
                      <div className="mt-2">
                        {secili ? (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => sepetAdetGuncelle(urun.id, secili.adet - 1)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold"
                              style={{ background: 'rgba(1,118,211,0.1)', color: 'var(--primary)' }}
                            >−</button>
                            <input
                              type="number"
                              value={secili.adet}
                              min={1}
                              onChange={(e) => sepetAdetGuncelle(urun.id, Number(e.target.value))}
                              className="w-10 text-center text-sm font-semibold border border-blue-200 rounded focus:outline-none"
                              style={{ color: 'var(--primary)' }}
                            />
                            <button
                              onClick={() => sepetAdetGuncelle(urun.id, secili.adet + 1)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold"
                              style={{ background: 'rgba(1,118,211,0.1)', color: 'var(--primary)' }}
                            >+</button>
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--primary)' }}>
                            + Sepete Ekle
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>

        {/* Sağ: Sepet + Form */}
        <div className="w-72 flex-shrink-0 sticky top-6">
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {/* Sepet başlık */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Seçilen Ürünler</h3>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'rgba(1,118,211,0.1)', color: 'var(--primary)' }}>
                {sepet.length} ürün
              </span>
            </div>

            {/* Sepet içerik */}
            <div className="max-h-60 overflow-y-auto">
              {sepet.length === 0 ? (
                <div className="p-6 text-center text-gray-400">
                  <p className="text-2xl mb-1">🛒</p>
                  <p className="text-xs">Soldan ürün seçin</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {sepet.map(({ urun, adet }) => (
                    <div key={urun.id} className="px-3 py-2.5 flex items-center gap-2">
                      {urun.gorselUrl ? (
                        <img src={urun.gorselUrl} alt="" className="w-8 h-8 rounded object-contain border border-gray-100 flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-300 flex-shrink-0 text-sm">📦</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{urun.stokAdi}</p>
                        <p className="text-xs text-gray-400">{adet} {urun.birim}</p>
                      </div>
                      <button onClick={() => sepettenCikar(urun.id)} className="text-gray-300 hover:text-red-400 transition text-sm">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {hatalar.sepet && (
              <p className="text-xs text-red-500 px-4 pb-2">{hatalar.sepet}</p>
            )}

            {/* Form alanları */}
            <div className="p-4 border-t border-gray-100 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  Açıklama <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={aciklama}
                  onChange={(e) => setAciklama(e.target.value)}
                  placeholder="Kullanım amacı, kurulum yeri, özel istekler..."
                  rows={3}
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                  style={{ borderColor: hatalar.aciklama ? '#ef4444' : undefined }}
                />
                {hatalar.aciklama && <p className="text-xs text-red-400 mt-0.5">{hatalar.aciklama}</p>}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Bütçe <span className="text-gray-400 font-normal">(opsiyonel)</span></label>
                <input
                  type="text"
                  value={butce}
                  onChange={(e) => setButce(e.target.value)}
                  placeholder="Örn: 50.000 TL"
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">İlgili Kişi</label>
                <input
                  type="text"
                  value={iletisimKisi}
                  onChange={(e) => setIletisimKisi(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Telefon</label>
                <input
                  type="tel"
                  value={telefon}
                  onChange={(e) => setTelefon(e.target.value)}
                  placeholder="0xxx xxx xx xx"
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={gonder}
                disabled={sepet.length === 0}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}
              >
                ✓ Teklif Talebi Gönder
              </motion.button>
            </div>
          </div>
        </div>
      </div>

      {/* Büyük Görsel Modal */}
      <AnimatePresence>
        {buyukGorsel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={() => setBuyukGorsel(null)}
          >
            <motion.div
              initial={{ scale: 0.85 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.85 }}
              className="bg-white rounded-2xl overflow-hidden max-w-lg w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{buyukGorsel.stokAdi}</p>
                  {buyukGorsel.marka && <p className="text-xs text-gray-400">{buyukGorsel.marka}</p>}
                </div>
                <button onClick={() => setBuyukGorsel(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
              <div className="p-4 bg-gray-50 flex items-center justify-center" style={{ minHeight: '300px' }}>
                <img src={buyukGorsel.gorselUrl} alt={buyukGorsel.stokAdi} className="max-h-80 max-w-full object-contain" />
              </div>
              <div className="p-4 flex items-center justify-between">
                {buyukGorsel.aciklama && <p className="text-xs text-gray-500">{buyukGorsel.aciklama}</p>}
                <button
                  onClick={() => { sepeteEkle(buyukGorsel); setBuyukGorsel(null) }}
                  className="ml-auto text-sm px-4 py-2 rounded-lg text-white font-medium"
                  style={{ background: 'var(--primary)' }}
                >
                  + Sepete Ekle
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
