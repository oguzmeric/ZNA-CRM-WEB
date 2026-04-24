import { useState, useEffect, useMemo } from 'react'
import { slaKurallariGetir, slaDurumHesapla } from '../services/slaService'

// Basit cache (sayfa başına tek fetch)
let _cache = null
let _cachePromise = null
async function _getKurallar() {
  if (_cache) return _cache
  if (_cachePromise) return _cachePromise
  _cachePromise = slaKurallariGetir().then(data => { _cache = data; return data })
  return _cachePromise
}

/**
 * SLA Bilgi komponenti — üç modda çalışır:
 *
 * 1) OLUŞTURMA/ATAMA MODU (baslangic yok)
 *    Bu iş tipi için tanımlı SLA kurallarını listeler ki kullanıcı bilsin.
 *
 * 2) AÇIK İŞ MODU (baslangic var, bitis yok)
 *    Kalan süreyi progress bar ile gösterir (yeşil → sarı → kırmızı).
 *
 * 3) TAMAMLANMIŞ İŞ MODU (baslangic + bitis)
 *    SLA başarılı mı / geç mi kalındı gösterir.
 *
 * Props:
 *   modul        — 'kargo' | 'servis' | 'gorev' | 'teklif'
 *   baslangic    — ISO tarih (opsiyonel)
 *   bitis        — ISO tarih (opsiyonel)
 *   hedefDurum   — belirli bir durum için SLA gösterilsin (opsiyonel)
 *   kompakt      — küçük satır gösterim (default: false)
 *   slaSaatOverride — SLA saatini override et (ör. görevin kendi sonTarih'i varsa)
 */
export default function SlaBilgi({ modul, baslangic, bitis, hedefDurum, kompakt = false, slaSaatOverride }) {
  const [kurallar, setKurallar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    _getKurallar().then(data => {
      setKurallar((data || []).filter(k => k.aktif && k.modul === modul))
      setYukleniyor(false)
    })
  }, [modul])

  // Açık işte her dakika tazele (canlı kalan süre)
  useEffect(() => {
    if (!baslangic || bitis) return
    const timer = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(timer)
  }, [baslangic, bitis])

  const gosterilecekKurallar = useMemo(() => {
    if (hedefDurum) return kurallar.filter(k => k.bitisDurum === hedefDurum)
    return kurallar
  }, [kurallar, hedefDurum])

  if (yukleniyor) return null
  if (gosterilecekKurallar.length === 0) return null

  // ═══ MOD 1: Oluşturma / Atama — sadece bilgi ═══
  if (!baslangic) {
    return (
      <div className={`rounded-lg border border-blue-100 bg-blue-50 ${kompakt ? 'px-3 py-2' : 'p-4'}`}>
        <div className="flex items-start gap-2">
          <span className="text-lg flex-shrink-0">⏱️</span>
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-blue-700 ${kompakt ? 'text-xs' : 'text-sm'}`}>
              SLA Süreleri
            </p>
            <div className={`mt-1 flex flex-wrap gap-2 ${kompakt ? 'text-xs' : 'text-xs'}`}>
              {gosterilecekKurallar.map(k => (
                <span key={k.id} className="inline-flex items-center gap-1 bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full">
                  {k.olayIsim}: <strong>{sureMetin(k.sureSaat)}</strong>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ═══ MOD 2-3: İş var — durum/progress göster ═══
  return (
    <div className={`flex flex-col gap-2 ${kompakt ? '' : ''}`}>
      {gosterilecekKurallar.map(k => {
        const slaSaat = slaSaatOverride || k.sureSaat
        const sonuc = slaDurumHesapla(baslangic, bitis, slaSaat)
        if (!sonuc) return null

        const dr = durumRengi(sonuc.durum)
        const yuzde = Math.min((sonuc.kullanilanSaat / slaSaat) * 100, 100)

        return (
          <div key={k.id} className={`rounded-lg border px-3 py-2 ${kompakt ? '' : 'py-2.5'}`} style={{ background: dr.bg, borderColor: dr.border }}>
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="flex items-center gap-2">
                <span className="text-base">{dr.ikon}</span>
                <span className={`font-semibold ${kompakt ? 'text-xs' : 'text-sm'}`} style={{ color: dr.renk }}>
                  {k.olayIsim}
                </span>
                <span className={`${kompakt ? 'text-[10px]' : 'text-xs'} text-gray-500`}>
                  Limit: {sureMetin(slaSaat)}
                </span>
              </div>
              <span className={`font-bold ${kompakt ? 'text-xs' : 'text-sm'}`} style={{ color: dr.renk }}>
                {durumMetni(sonuc, slaSaat)}
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full bg-white overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${yuzde}%`, background: dr.renk }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Helpers
function sureMetin(saat) {
  if (saat < 24) return `${saat} saat`
  const gun = Math.floor(saat / 24)
  const kalanSaat = saat % 24
  if (kalanSaat === 0) return `${gun} gün`
  return `${gun}g ${kalanSaat}s`
}

function durumMetni(sonuc, slaSaat) {
  if (sonuc.durum === 'zamaninda') return `✅ Zamanında (${sureMetin(Math.round(sonuc.kullanilanSaat))})`
  if (sonuc.durum === 'gec') return `❌ ${sureMetin(Math.round(sonuc.gecikmeSaat))} gecikmeli tamamlandı`
  if (sonuc.durum === 'kritik') return `⚠️ ${sureMetin(Math.round(sonuc.gecikmeSaat))} aşıldı!`
  // acik
  return `⏳ ${sureMetin(Math.round(sonuc.kalanSaat))} kaldı`
}

function durumRengi(durum) {
  const map = {
    zamaninda: { renk: '#10b981', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.3)', ikon: '✅' },
    gec:       { renk: '#ef4444', bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.3)',  ikon: '❌' },
    kritik:    { renk: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.4)', ikon: '⚠️' },
    acik:      { renk: '#3b82f6', bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.3)', ikon: '⏳' },
  }
  return map[durum] || map.acik
}
