import { useState, useEffect, useMemo } from 'react'
import { servisRaporlariniGetir } from '../services/servisRaporService'
import CustomSelect from '../components/CustomSelect'

const tarihFmt = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Türkçe normalize (arama için)
const trNorm = (s) => String(s || '').toLowerCase()
  .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
  .replace(/ı/g,'i').replace(/i̇/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')

export default function ServisRaporlariContent() {
  const [raporlar, setRaporlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [secili, setSecili] = useState(null)

  // Filtreler
  const [arama, setArama] = useState('')
  const [teknisyenFiltre, setTeknisyenFiltre] = useState('')
  const [sistemFiltre, setSistemFiltre] = useState('')
  const [tarihAraligi, setTarihAraligi] = useState('tumu')
  const [ozelBas, setOzelBas] = useState('')
  const [ozelBit, setOzelBit] = useState('')
  const [gosterilecek, setGosterilecek] = useState(100)

  useEffect(() => {
    servisRaporlariniGetir().then(data => {
      setRaporlar(data || [])
      setYukleniyor(false)
    })
  }, [])

  // Filtre seçenekleri
  const teknisyenler = useMemo(() =>
    [...new Set(raporlar.map(r => r.teknisyen).filter(Boolean))].sort(), [raporlar])
  const sistemler = useMemo(() =>
    [...new Set(raporlar.map(r => r.sistemNo).filter(Boolean))].sort(), [raporlar])

  // Tarih aralığı
  const [bas, bit] = useMemo(() => {
    const bugun = new Date()
    const bg = new Date(bugun); bg.setHours(0,0,0,0)
    const bt = new Date(bugun); bt.setHours(23,59,59,999)
    if (tarihAraligi === 'bugun') return [bg, bt]
    if (tarihAraligi === 'bu_hafta') {
      const baz = new Date(bg)
      const day = baz.getDay() || 7
      baz.setDate(baz.getDate() - day + 1)
      return [baz, bt]
    }
    if (tarihAraligi === 'bu_ay') return [new Date(bugun.getFullYear(), bugun.getMonth(), 1), bt]
    if (tarihAraligi === 'bu_yil') return [new Date(bugun.getFullYear(), 0, 1), bt]
    if (tarihAraligi === 'ozel' && ozelBas && ozelBit) return [new Date(ozelBas), new Date(ozelBit + 'T23:59:59')]
    return [new Date(2000,0,1), new Date(2100,0,1)]
  }, [tarihAraligi, ozelBas, ozelBit])

  const filtreli = useMemo(() => {
    return raporlar.filter(r => {
      if (teknisyenFiltre && r.teknisyen !== teknisyenFiltre) return false
      if (sistemFiltre && r.sistemNo !== sistemFiltre) return false
      if (tarihAraligi !== 'tumu') {
        const t = r.bilTarih ? new Date(r.bilTarih) : null
        if (!t || t < bas || t > bit) return false
      }
      if (arama) {
        const q = trNorm(arama)
        const havuz = trNorm(`${r.fisNo || ''} ${r.firmaAdi || ''} ${r.lokasyon || ''} ${r.sistemNo || ''} ${r.teknisyen || ''} ${r.sonuc || ''} ${r.bildirilenAriza || ''}`)
        if (!havuz.includes(q)) return false
      }
      return true
    })
  }, [raporlar, arama, teknisyenFiltre, sistemFiltre, tarihAraligi, bas, bit])

  const gorunen = filtreli.slice(0, gosterilecek)

  if (yukleniyor) {
    return (
      <div className="text-center text-gray-400 py-20">
        <div className="text-4xl mb-2 animate-pulse">📊</div>
        <p className="text-sm">Servis raporları yükleniyor...</p>
      </div>
    )
  }

  if (secili) {
    return (
      <div className="max-w-4xl mx-auto">
        <button onClick={() => setSecili(null)} className="text-sm text-gray-400 hover:text-blue-600 mb-4 flex items-center gap-1">
          ← Liste'ye Dön
        </button>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="h-1.5" style={{ background: 'var(--primary)' }} />
          <div className="p-6">
            <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    Fiş No: {secili.fisNo}
                  </span>
                  {secili.takipKodu && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      ✅ {secili.takipKodu}
                    </span>
                  )}
                  {secili.arizaKodu && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      🔧 {secili.arizaKodu}
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-gray-800">{secili.firmaAdi}</h2>
                {secili.lokasyon && <p className="text-sm text-gray-500 mt-1">📍 {secili.lokasyon}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 my-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">Sistem</p>
                <p className="text-sm font-semibold text-gray-800">{secili.sistemNo || '—'}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">Teknisyen</p>
                <p className="text-sm font-semibold text-gray-800">👨‍🔧 {secili.teknisyen || '—'}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">Bildiren</p>
                <p className="text-sm font-semibold text-gray-800">{secili.bildiren || '—'}</p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-xs text-blue-600">Bildirim Tarihi</p>
                <p className="text-sm font-semibold text-blue-800">📅 {tarihFmt(secili.bilTarih)}</p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <p className="text-xs text-green-600">Gidiş Tarihi</p>
                <p className="text-sm font-semibold text-green-800">🚗 {tarihFmt(secili.gidTarih)}</p>
              </div>
              {secili.cariKodu && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Cari Kodu</p>
                  <p className="text-sm font-mono font-semibold text-gray-800">{secili.cariKodu}</p>
                </div>
              )}
            </div>

            {secili.bildirilenAriza && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">⚠️ Bildirilen Arıza</p>
                <p className="text-sm text-amber-800 whitespace-pre-wrap">{secili.bildirilenAriza}</p>
              </div>
            )}

            {secili.sonuc && (
              <div className="mt-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">✅ Yapılan İşlem / Sonuç</p>
                <p className="text-sm text-green-800 whitespace-pre-wrap">{secili.sonuc}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* İstatistikler */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-blue-600">{raporlar.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Toplam Rapor</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-green-600">{teknisyenler.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Aktif Teknisyen</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-purple-600">{sistemler.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Sistem Çeşidi</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-amber-600">{filtreli.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Görüntülenen</p>
        </div>
      </div>

      {/* Filtreler */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">🔍 Arama</label>
            <input
              type="text"
              value={arama}
              onChange={e => setArama(e.target.value)}
              placeholder="Fiş no, firma, sonuç..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">👨‍🔧 Teknisyen</label>
            <CustomSelect
              value={teknisyenFiltre}
              onChange={e => setTeknisyenFiltre(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Tümü</option>
              {teknisyenler.map(t => <option key={t} value={t}>{t}</option>)}
            </CustomSelect>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">🔧 Sistem</label>
            <CustomSelect
              value={sistemFiltre}
              onChange={e => setSistemFiltre(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Tümü</option>
              {sistemler.map(s => <option key={s} value={s}>{s}</option>)}
            </CustomSelect>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">📅 Tarih</label>
            <CustomSelect
              value={tarihAraligi}
              onChange={e => setTarihAraligi(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="tumu">Tümü</option>
              <option value="bugun">Bugün</option>
              <option value="bu_hafta">Bu Hafta</option>
              <option value="bu_ay">Bu Ay</option>
              <option value="bu_yil">Bu Yıl</option>
              <option value="ozel">Özel Aralık</option>
            </CustomSelect>
          </div>
        </div>

        {tarihAraligi === 'ozel' && (
          <div className="flex items-center gap-3 mt-3">
            <span className="text-xs text-gray-500">Başlangıç:</span>
            <input type="date" value={ozelBas} onChange={e => setOzelBas(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
            <span className="text-xs text-gray-500">Bitiş:</span>
            <input type="date" value={ozelBit} onChange={e => setOzelBit(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
        )}
      </div>

      {/* Tablo */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: '1100px' }}>
            <thead>
              <tr className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-100">
                <th className="text-left px-4 py-3" style={{ width: '90px' }}>Fiş No</th>
                <th className="text-left px-4 py-3" style={{ width: '110px' }}>Tarih</th>
                <th className="text-left px-4 py-3">Müşteri / Lokasyon</th>
                <th className="text-left px-4 py-3" style={{ width: '180px' }}>Sistem</th>
                <th className="text-left px-4 py-3" style={{ width: '160px' }}>Teknisyen</th>
                <th className="text-left px-4 py-3">Yapılan İşlem</th>
              </tr>
            </thead>
            <tbody>
              {gorunen.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">
                    Sonuç bulunamadı.
                  </td>
                </tr>
              )}
              {gorunen.map(r => (
                <tr
                  key={r.id}
                  onClick={() => setSecili(r)}
                  className="border-b border-gray-50 hover:bg-blue-50/30 cursor-pointer transition"
                >
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono font-semibold text-gray-700">{r.fisNo}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-600">{tarihFmt(r.bilTarih)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-800 truncate max-w-xs" title={r.firmaAdi}>
                      🏢 {r.firmaAdi || '—'}
                    </p>
                    {r.lokasyon && (
                      <p className="text-xs text-gray-400 truncate max-w-xs" title={r.lokasyon}>
                        📍 {r.lokasyon}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.sistemNo && (
                      <span className="inline-block text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium max-w-full truncate" title={r.sistemNo}>
                        {r.sistemNo}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-700">👨‍🔧 {r.teknisyen || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-gray-600 line-clamp-2 max-w-md" title={r.sonuc}>
                      {r.sonuc || '—'}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Daha Fazla Yükle */}
        {gorunen.length < filtreli.length && (
          <div className="border-t border-gray-100 px-5 py-3 text-center">
            <button
              onClick={() => setGosterilecek(prev => prev + 200)}
              className="text-sm px-4 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition"
            >
              ⬇ {filtreli.length - gosterilecek} kayıt daha — Yükle
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
