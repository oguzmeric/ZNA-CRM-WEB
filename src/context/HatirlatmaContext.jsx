import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  hatirlatmalariGetir,
  hatirlatmaEkleDB,
  hatirlatmaGuncelle,
  hatirlatmaSilDB,
} from '../services/hatirlatmaService'

const HatirlatmaContext = createContext(null)

export function HatirlatmaProvider({ children }) {
  const navigate = useNavigate()
  const [hatirlatmalar, setHatirlatmalar] = useState([])
  const [gosterModal, setGosterModal] = useState(false)
  const [vadesiGelenler, setVadesiGelenler] = useState([])
  const kontrolEdildiRef = useRef(false)

  useEffect(() => {
    hatirlatmalariGetir().then((liste) => {
      setHatirlatmalar(liste)
      if (kontrolEdildiRef.current) return
      kontrolEdildiRef.current = true
      const simdi = new Date()
      const vadesiGelen = liste.filter(
        (h) => h.durum === 'bekliyor' && new Date(h.hatirlatmaTarihi) <= simdi
      )
      if (vadesiGelen.length > 0) {
        setVadesiGelenler(vadesiGelen)
        setTimeout(() => setGosterModal(true), 800)
      }
    })
  }, [])

  const hatirlatmaEkle = async (teklifData, gunSayisi = 7) => {
    if (!gunSayisi || gunSayisi <= 0) return null
    const tarih = new Date()
    tarih.setDate(tarih.getDate() + gunSayisi)

    const yeni = {
      teklifId: teklifData.id,
      teklifNo: teklifData.teklifNo,
      firmaAdi: teklifData.firmaAdi,
      konu: teklifData.konu,
      hatirlatmaTarihi: tarih.toISOString(),
      olusturmaTarih: new Date().toISOString(),
      durum: 'bekliyor',
      gunSayisi,
    }
    const kayitli = await hatirlatmaEkleDB(yeni)
    if (kayitli) {
      // Remove old pending reminder for same teklif and add new one
      setHatirlatmalar(prev => [
        ...prev.filter(h => !(h.teklifId === teklifData.id && h.durum === 'bekliyor')),
        kayitli,
      ])
    }
    return kayitli
  }

  const tamamla = async (id) => {
    const kayitli = await hatirlatmaGuncelle(id, {
      durum: 'tamamlandi',
      tamamlanmaTarihi: new Date().toISOString(),
    })
    if (kayitli) {
      setHatirlatmalar(prev => prev.map(h => h.id === id ? { ...h, ...kayitli } : h))
    }
    const yeniVadesi = vadesiGelenler.filter((h) => h.id !== id)
    setVadesiGelenler(yeniVadesi)
    if (yeniVadesi.length === 0) setGosterModal(false)
  }

  const ertele = async (id, gunSayisi = 3) => {
    const tarih = new Date()
    tarih.setDate(tarih.getDate() + gunSayisi)
    const kayitli = await hatirlatmaGuncelle(id, {
      hatirlatmaTarihi: tarih.toISOString(),
      durum: 'bekliyor',
    })
    if (kayitli) {
      setHatirlatmalar(prev => prev.map(h => h.id === id ? { ...h, ...kayitli } : h))
    }
    const yeniVadesi = vadesiGelenler.filter((h) => h.id !== id)
    setVadesiGelenler(yeniVadesi)
    if (yeniVadesi.length === 0) setGosterModal(false)
  }

  const teklifHatirlatmasi = (teklifId) =>
    hatirlatmalar.find((h) => h.teklifId === teklifId && h.durum === 'bekliyor') || null

  const hatirlatmaSil = async (teklifId) => {
    await hatirlatmaSilDB(teklifId)
    setHatirlatmalar(prev => prev.filter(h => h.teklifId !== teklifId))
  }

  return (
    <HatirlatmaContext.Provider
      value={{ hatirlatmalar, hatirlatmaEkle, tamamla, ertele, teklifHatirlatmasi, hatirlatmaSil }}
    >
      {children}

      {/* Hatırlatma Popup Modal */}
      <AnimatePresence>
        {gosterModal && vadesiGelenler.length > 0 && (
          <motion.div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setGosterModal(false)}
            />

            <motion.div
              className="relative bg-white w-full max-w-lg overflow-hidden"
              style={{
                borderRadius: '10px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                border: '1px solid #dddbda',
              }}
              initial={{ scale: 0.92, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            >
              {/* Üst renkli şerit */}
              <div className="h-1 w-full" style={{ background: '#0176D3' }} />

              <div className="p-6">
                {/* Başlık */}
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-white flex-shrink-0"
                    style={{ background: '#0176D3', fontSize: '18px' }}
                  >
                    🔔
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 text-base">
                      Teklif Takip Hatırlatması
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {vadesiGelenler.length} teklif için takip zamanı geldi
                    </p>
                  </div>
                </div>

                {/* Teklif listesi */}
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {vadesiGelenler.map((h) => {
                    const gunFarki = Math.floor(
                      (new Date() - new Date(h.olusturmaTarih)) / (1000 * 60 * 60 * 24)
                    )
                    return (
                      <div
                        key={h.id}
                        className="rounded-lg p-4"
                        style={{ background: '#f4f6f9', border: '1px solid #e8e8e8' }}
                      >
                        <div className="mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="text-xs font-mono px-2 py-0.5 rounded"
                              style={{ background: '#fff', border: '1px solid #dddbda', color: '#0176D3' }}
                            >
                              {h.teklifNo}
                            </span>
                            <span className="text-sm font-semibold text-gray-800">{h.firmaAdi}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-1">{h.konu}</p>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs mb-3"
                          style={{ color: '#b45309' }}>
                          <span>⏱</span>
                          <span>
                            {gunFarki === 0
                              ? 'Bugün verildi'
                              : `${gunFarki} gün önce verildi`}
                            {' — '}takip bekleniyor
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => {
                              navigate(`/teklifler/${h.teklifId}`)
                              setGosterModal(false)
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg transition font-medium"
                            style={{
                              color: '#0176D3',
                              border: '1px solid rgba(1,118,211,0.3)',
                              background: 'rgba(1,118,211,0.06)',
                            }}
                          >
                            📄 Teklifi Aç
                          </button>
                          <button
                            onClick={() => ertele(h.id, 3)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-white transition text-gray-600"
                          >
                            ⏩ 3 Gün Ertele
                          </button>
                          <button
                            onClick={() => ertele(h.id, 7)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-white transition text-gray-600"
                          >
                            ⏩ 1 Hafta Ertele
                          </button>
                          <button
                            onClick={() => tamamla(h.id)}
                            className="text-xs px-3 py-1.5 rounded-lg text-white transition font-medium ml-auto"
                            style={{ background: '#10b981' }}
                          >
                            ✓ Takip Edildi
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Alt buton */}
                <div
                  className="flex items-center justify-between mt-5 pt-4"
                  style={{ borderTop: '1px solid #f0f0f0' }}
                >
                  <p className="text-xs text-gray-400">
                    Kapatırsanız bir sonraki açılışta tekrar gösterilir.
                  </p>
                  <button
                    onClick={() => setGosterModal(false)}
                    className="text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition text-gray-600"
                  >
                    Sonra Bak
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </HatirlatmaContext.Provider>
  )
}

export function useHatirlatma() {
  return useContext(HatirlatmaContext)
}
