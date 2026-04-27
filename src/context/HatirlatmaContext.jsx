import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  hatirlatmalariGetir,
  hatirlatmaEkleDB,
  hatirlatmaGuncelle,
  hatirlatmaSilDB,
} from '../services/hatirlatmaService'
import { lisanslariGetir } from '../services/lisansService'

// Demo bitişi <= bu kadar gün ise hatırlatma çıkar
const LISANS_UYARI_GUN = 3
// Sessions arası "ertele" — localStorage'da tutulur (lisans için DB kayıt açmıyoruz)
const SNOOZE_KEY = 'lisans_hatirlatma_snooze' // { [lisansId]: epochMs (bu zamana kadar gizle) }

const snoozeOku = () => {
  try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}') } catch { return {} }
}
const snoozeYaz = (obj) => {
  try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(obj)) } catch {}
}

const HatirlatmaContext = createContext(null)

export function HatirlatmaProvider({ children }) {
  const navigate = useNavigate()
  const [hatirlatmalar, setHatirlatmalar] = useState([])
  const [gosterModal, setGosterModal] = useState(false)
  const [vadesiGelenler, setVadesiGelenler] = useState([])
  const kontrolEdildiRef = useRef(false)

  useEffect(() => {
    Promise.all([hatirlatmalariGetir(), lisanslariGetir().catch(() => [])]).then(([liste, lisanslar]) => {
      setHatirlatmalar(liste)
      if (kontrolEdildiRef.current) return
      kontrolEdildiRef.current = true
      const simdi = new Date()

      // Demo lisanslarda bitişe <= 3 gün kalanlar (synthetic hatirlatma)
      const snooze = snoozeOku()
      const lisansHatirlatmalari = (lisanslar || [])
        .filter((l) => l.lisansTipi === 'sureksiz_demo' && l.durum === 'aktif' && l.bitisTarih)
        .map((l) => {
          const kalanGun = Math.ceil((new Date(l.bitisTarih) - simdi) / 86400000)
          return { l, kalanGun }
        })
        .filter(({ kalanGun, l }) => {
          if (kalanGun > LISANS_UYARI_GUN || kalanGun < 0) return false
          // Snooze kontrolü
          if (snooze[l.id] && snooze[l.id] > simdi.getTime()) return false
          return true
        })
        .map(({ l, kalanGun }) => ({
          id: `lisans-${l.id}`,
          tip: 'lisans',
          lisansId: l.id,
          firmaAdi: l.firmaAdi,
          konu: `Demo lisans — ${kalanGun === 0 ? 'bugün' : kalanGun + ' gün içinde'} bitiyor`,
          aciklama: l.lisansKodu ? `Lisans no: ${l.lisansKodu}` : '',
          bitisTarih: l.bitisTarih,
          hatirlatmaTarihi: simdi.toISOString(),
          olusturmaTarih: l.olusturmaTarih || simdi.toISOString(),
          durum: 'bekliyor',
          kalanGun,
        }))

      const vadesiGelenGercek = liste.filter(
        (h) => h.durum === 'bekliyor' && new Date(h.hatirlatmaTarihi) <= simdi
      )
      const vadesiGelen = [...vadesiGelenGercek, ...lisansHatirlatmalari]
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
      tip: 'teklif',
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
      setHatirlatmalar(prev => [
        ...prev.filter(h => !(h.teklifId === teklifData.id && h.durum === 'bekliyor')),
        kayitli,
      ])
    }
    return kayitli
  }

  // Görüşme hatırlatması — hem preset gün sayısı hem özel ISO tarih kabul eder
  const gorusmeHatirlatmaEkle = async (gorusmeData, { gunSayisi, tarihIso, aciklama = '' } = {}) => {
    const tarih = tarihIso
      ? new Date(tarihIso)
      : (() => { const d = new Date(); d.setDate(d.getDate() + (gunSayisi || 7)); return d })()
    if (isNaN(tarih.getTime())) return null

    const yeni = {
      tip: 'gorusme',
      gorusmeId: gorusmeData.id,
      firmaAdi: gorusmeData.firmaAdi,
      musteriAd: gorusmeData.musteriAdi,
      konu: gorusmeData.konu || '',
      aciklama,
      hatirlatmaTarihi: tarih.toISOString(),
      olusturmaTarih: new Date().toISOString(),
      durum: 'bekliyor',
      gunSayisi: gunSayisi || null,
    }
    const kayitli = await hatirlatmaEkleDB(yeni)
    if (kayitli) {
      setHatirlatmalar(prev => [
        ...prev.filter(h => !(h.gorusmeId === gorusmeData.id && h.durum === 'bekliyor')),
        kayitli,
      ])
    }
    return kayitli
  }

  const gorusmeHatirlatmasi = (gorusmeId) =>
    hatirlatmalar.find(h => h.gorusmeId === gorusmeId && h.durum === 'bekliyor') || null

  // Synthetic lisans reminder mı? (id "lisans-XX" formatında)
  const lisansSentetikMi = (id) => typeof id === 'string' && id.startsWith('lisans-')

  const tamamla = async (id) => {
    if (lisansSentetikMi(id)) {
      // Lisans için DB kaydı yok — uzun süreli snooze (30 gün) yap
      const snooze = snoozeOku()
      const lisansId = String(id).replace('lisans-', '')
      snooze[lisansId] = Date.now() + 30 * 86400000
      snoozeYaz(snooze)
    } else {
      const kayitli = await hatirlatmaGuncelle(id, {
        durum: 'tamamlandi',
        tamamlanmaTarihi: new Date().toISOString(),
      })
      if (kayitli) {
        setHatirlatmalar(prev => prev.map(h => h.id === id ? { ...h, ...kayitli } : h))
      }
    }
    const yeniVadesi = vadesiGelenler.filter((h) => h.id !== id)
    setVadesiGelenler(yeniVadesi)
    if (yeniVadesi.length === 0) setGosterModal(false)
  }

  const ertele = async (id, gunSayisi = 3) => {
    if (lisansSentetikMi(id)) {
      const snooze = snoozeOku()
      const lisansId = String(id).replace('lisans-', '')
      snooze[lisansId] = Date.now() + gunSayisi * 86400000
      snoozeYaz(snooze)
    } else {
      const tarih = new Date()
      tarih.setDate(tarih.getDate() + gunSayisi)
      const kayitli = await hatirlatmaGuncelle(id, {
        hatirlatmaTarihi: tarih.toISOString(),
        durum: 'bekliyor',
      })
      if (kayitli) {
        setHatirlatmalar(prev => prev.map(h => h.id === id ? { ...h, ...kayitli } : h))
      }
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
      value={{ hatirlatmalar, hatirlatmaEkle, gorusmeHatirlatmaEkle, tamamla, ertele, teklifHatirlatmasi, gorusmeHatirlatmasi, hatirlatmaSil }}
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
                      Takip Hatırlatması
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {vadesiGelenler.length} kayıt için takip zamanı geldi
                    </p>
                  </div>
                </div>

                {/* Teklif listesi */}
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {vadesiGelenler.map((h) => {
                    const gunFarki = Math.floor(
                      (new Date() - new Date(h.olusturmaTarih)) / (1000 * 60 * 60 * 24)
                    )
                    const isGorusme = h.tip === 'gorusme'
                    const isLisans = h.tip === 'lisans'
                    const hedefYol = isLisans ? '/trassir-lisanslar' : isGorusme ? `/gorusmeler/${h.gorusmeId}` : `/teklifler/${h.teklifId}`
                    const acButonLabel = isLisans ? '🎫 Lisansı Aç' : isGorusme ? '📞 Görüşmeyi Aç' : '📄 Teklifi Aç'
                    const etiket = isLisans ? 'DEMO' : isGorusme ? 'GÖRÜŞME' : h.teklifNo
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
                              {etiket}
                            </span>
                            <span className="text-sm font-semibold text-gray-800">{h.firmaAdi}</span>
                          </div>
                          {h.konu && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{h.konu}</p>}
                          {h.aciklama && <p className="text-xs text-gray-600 mt-1 line-clamp-2 italic">{h.aciklama}</p>}
                        </div>

                        <div className="flex items-center gap-1.5 text-xs mb-3"
                          style={{ color: '#b45309' }}>
                          <span>⏱</span>
                          <span>
                            {isLisans
                              ? (h.kalanGun === 0 ? '⚠️ Demo BUGÜN bitiyor' : `⚠️ ${h.kalanGun} gün sonra demo bitiyor`)
                              : isGorusme
                                ? (gunFarki === 0 ? 'Bugün planlandı' : `${gunFarki} gün önce planlandı`)
                                : (gunFarki === 0 ? 'Bugün verildi' : `${gunFarki} gün önce verildi`)
                            }
                            {!isLisans && ' — takip bekleniyor'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => {
                              navigate(hedefYol)
                              setGosterModal(false)
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg transition font-medium"
                            style={{
                              color: '#0176D3',
                              border: '1px solid rgba(1,118,211,0.3)',
                              background: 'rgba(1,118,211,0.06)',
                            }}
                          >
                            {acButonLabel}
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
