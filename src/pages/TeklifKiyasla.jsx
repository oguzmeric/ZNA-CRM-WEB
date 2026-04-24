import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { teklifGetir } from '../services/teklifService'
import { teklifBenzerlikSkoru } from '../lib/teklifBenzerlik'

const fmt = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })

// Ürün adını temizle — import'tan gelen tırnak, fazla boşluk vs.
const temizUrunAd = (s) => String(s || '').replace(/^["'\s]+|["'\s]+$/g, '').trim()

const tarihFmt = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d) ? '—' : d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function TeklifKiyasla() {
  const { id1, id2 } = useParams()
  const navigate = useNavigate()
  const [teklifA, setTeklifA] = useState(null)
  const [teklifB, setTeklifB] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)

  const taslakMi = id1 === 'taslak'

  useEffect(() => {
    const teklifAPromise = taslakMi
      ? Promise.resolve(JSON.parse(sessionStorage.getItem('kiyasla_taslak') || 'null'))
      : teklifGetir(id1)

    Promise.all([teklifAPromise, teklifGetir(id2)]).then(([a, b]) => {
      setTeklifA(a)
      setTeklifB(b)
      setYukleniyor(false)
    })
  }, [id1, id2, taslakMi])

  const analiz = useMemo(() => {
    if (!teklifA || !teklifB) return null
    const satirlariHazirla = (t) => (Array.isArray(t.satirlar) ? t.satirlar : []).map(s => {
      const miktar = Number(s.miktar) || 0
      const birimFiyat = Number(s.birimFiyat) || 0
      const iskonto = Number(s.iskonto) || 0
      const kdv = Number(s.kdv) || 0
      const ara = miktar * birimFiyat
      const iskontoTutar = ara * (iskonto / 100)
      const netAra = ara - iskontoTutar
      const kdvTutar = netAra * (kdv / 100)
      const toplam = netAra + kdvTutar
      return {
        ...s,
        anahtar: String(s.stokKodu || s.stokAdi || '').trim().toLowerCase(),
        miktar,
        birimFiyat,
        iskonto,
        kdv,
        toplam,        // KDV dahil (kart'taki Genel Toplam ile tutarlı)
        araToplam: ara,
      }
    })
    const sA = satirlariHazirla(teklifA)
    const sB = satirlariHazirla(teklifB)

    const mapA = new Map()
    sA.forEach(s => { if (s.anahtar) mapA.set(s.anahtar, s) })
    const mapB = new Map()
    sB.forEach(s => { if (s.anahtar) mapB.set(s.anahtar, s) })

    const tumAnahtarlar = new Set([...mapA.keys(), ...mapB.keys()])
    const satirlar = [...tumAnahtarlar].map(k => {
      const a = mapA.get(k)
      const b = mapB.get(k)
      let tip
      if (a && b) tip = 'ortak'
      else if (a) tip = 'sadeceA'
      else tip = 'sadeceB'
      return { anahtar: k, a, b, tip }
    })

    // Sırala: Ortak üstte, sonra sadece A, sonra sadece B
    const sira = { ortak: 0, sadeceA: 1, sadeceB: 2 }
    satirlar.sort((x, y) => sira[x.tip] - sira[y.tip])

    const benzerlik = teklifBenzerlikSkoru(teklifA, teklifB)

    const toplam = {
      a: sA.reduce((s, r) => s + r.toplam, 0),
      b: sB.reduce((s, r) => s + r.toplam, 0),
      ortakSay: satirlar.filter(x => x.tip === 'ortak').length,
      sadeceASay: satirlar.filter(x => x.tip === 'sadeceA').length,
      sadeceBSay: satirlar.filter(x => x.tip === 'sadeceB').length,
    }

    return { satirlar, benzerlik, toplam }
  }, [teklifA, teklifB])

  if (yukleniyor) {
    return (
      <div className="p-6 text-center text-gray-400">
        <div className="text-4xl mb-2 animate-pulse">📋</div>
        <p className="text-sm">Teklifler yükleniyor...</p>
      </div>
    )
  }

  if (!teklifA || !teklifB) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-gray-400">Teklif bulunamadı.</p>
        <button onClick={() => navigate('/teklifler')} className="mt-4 text-sm text-blue-600">
          ← Tekliflere dön
        </button>
      </div>
    )
  }

  const skor = analiz?.benzerlik.skor || 0
  const skorRenk = skor >= 85 ? '#ef4444' : skor >= 70 ? '#f59e0b' : '#3b82f6'

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-gray-400 hover:text-blue-600 mb-4 flex items-center gap-1"
      >
        ← Geri Dön
      </button>

      {/* Taslak Uyarısı */}
      {taslakMi && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3">
          <span className="text-xl">📝</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Taslak Teklif Kıyaslaması</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Hazırlamakta olduğun <strong>yeni teklif (Sütun A)</strong> ile daha önce oluşturulmuş <strong>teklif (Sütun B)</strong> karşılaştırılıyor.
              Kararını verdikten sonra geri dönüp teklifi kaydedebilirsin.
            </p>
          </div>
        </div>
      )}

      {/* Üst Bilgi */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <h2 className="text-xl font-semibold text-gray-800">📊 Teklif Kıyaslama</h2>
          <div className="flex items-center gap-3">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-white text-xl shadow-md"
              style={{ background: skorRenk }}
            >
              %{skor}
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Toplam Benzerlik</p>
              <p className="text-sm font-semibold" style={{ color: skorRenk }}>
                {skor >= 85 ? 'Çok Benzer' : skor >= 70 ? 'Benzer' : skor >= 50 ? 'Kısmen Benzer' : 'Farklı'}
              </p>
            </div>
          </div>
        </div>

        {/* İstatistikler */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-xl p-3 text-center bg-green-50 border border-green-100">
            <p className="text-xs text-green-600 font-medium">🟰 Ortak Ürün</p>
            <p className="text-xl font-bold text-green-700 mt-0.5">{analiz.toplam.ortakSay}</p>
          </div>
          <div className="rounded-xl p-3 text-center bg-blue-50 border border-blue-100">
            <p className="text-xs text-blue-600 font-medium">◀ Sadece A'da</p>
            <p className="text-xl font-bold text-blue-700 mt-0.5">{analiz.toplam.sadeceASay}</p>
          </div>
          <div className="rounded-xl p-3 text-center bg-purple-50 border border-purple-100">
            <p className="text-xs text-purple-600 font-medium">B'de Sadece ▶</p>
            <p className="text-xl font-bold text-purple-700 mt-0.5">{analiz.toplam.sadeceBSay}</p>
          </div>
          <div className="rounded-xl p-3 text-center bg-gray-50 border border-gray-100">
            <p className="text-xs text-gray-600 font-medium">💰 Tutar Farkı</p>
            <p className="text-lg font-bold text-gray-700 mt-0.5">
              {fmt(Math.abs(analiz.toplam.a - analiz.toplam.b))} ₺
            </p>
          </div>
          <div className="rounded-xl p-3 text-center bg-amber-50 border border-amber-100">
            <p className="text-xs text-amber-600 font-medium">📅 Tarih Farkı</p>
            <p className="text-lg font-bold text-amber-700 mt-0.5">
              {Math.abs(Math.floor((new Date(teklifA.tarih) - new Date(teklifB.tarih)) / (1000 * 60 * 60 * 24))) || 0} gün
            </p>
          </div>
        </div>
      </div>

      {/* İki Sütun — Teklif Başlıkları */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {[{ t: teklifA, id: id1, etiket: 'A', renk: 'blue' }, { t: teklifB, id: id2, etiket: 'B', renk: 'purple' }].map((col) => (
          <div
            key={col.etiket}
            className="bg-white rounded-xl border shadow-sm p-5"
            style={{ borderColor: col.renk === 'blue' ? 'rgba(59,130,246,0.2)' : 'rgba(168,85,247,0.2)' }}
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                style={{ background: col.renk === 'blue' ? '#3b82f6' : '#a855f7' }}
              >
                {col.etiket}
              </div>
              <button
                onClick={() => navigate(`/teklifler/${col.id}`)}
                className="text-xs text-gray-500 hover:text-blue-600"
              >
                Teklife Git →
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {col.t.teklifNo || `#${col.t.id}`}
                </span>
                <span className="text-xs text-gray-400">{tarihFmt(col.t.tarih)}</span>
              </div>
              <p className="text-base font-bold text-gray-800 truncate" title={col.t.firmaAdi}>
                🏢 {temizUrunAd(col.t.firmaAdi) || '—'}
              </p>
              {col.t.konu && (
                <p className="text-sm text-gray-600 truncate" title={col.t.konu}>
                  📋 {temizUrunAd(col.t.konu)}
                </p>
              )}
              {col.t.musteriTemsilcisi && (
                <p className="text-xs text-gray-400">👤 {col.t.musteriTemsilcisi}</p>
              )}
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500">Genel Toplam</p>
                <p className="text-2xl font-bold text-gray-800">
                  {fmt(col.t.genelToplam)} <span className="text-sm font-normal text-gray-400">₺</span>
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Satır Satır Kıyaslama */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">📋 Ürün Bazlı Kıyaslama ({analiz.satirlar.length})</h3>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-100 border border-green-300"></span> Ortak</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300"></span> Sadece A</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-purple-100 border border-purple-300"></span> Sadece B</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-xs text-gray-500 uppercase">
                <th className="text-left px-4 py-2">Ürün</th>
                <th className="text-right px-3 py-2" style={{ borderLeft: '2px solid #3b82f6' }}>A Miktar</th>
                <th className="text-right px-3 py-2">A Birim ₺</th>
                <th className="text-right px-3 py-2" title="KDV Dahil">A Toplam <span className="font-normal normal-case text-[10px]">(KDV Dahil)</span></th>
                <th className="text-right px-3 py-2" style={{ borderLeft: '2px solid #a855f7' }}>B Miktar</th>
                <th className="text-right px-3 py-2">B Birim ₺</th>
                <th className="text-right px-3 py-2" title="KDV Dahil">B Toplam <span className="font-normal normal-case text-[10px]">(KDV Dahil)</span></th>
                <th className="text-right px-3 py-2">Fark</th>
              </tr>
            </thead>
            <tbody>
              {analiz.satirlar.map((satir) => {
                const satirRenk = satir.tip === 'ortak' ? '#f0fdf4' : satir.tip === 'sadeceA' ? '#eff6ff' : '#faf5ff'
                const fark = (satir.a?.toplam || 0) - (satir.b?.toplam || 0)
                const farkRengi = fark > 0 ? '#ef4444' : fark < 0 ? '#10b981' : '#9ca3af'
                const urunAd = temizUrunAd(satir.a?.stokAdi || satir.b?.stokAdi || satir.anahtar)
                const urunKod = temizUrunAd(satir.a?.stokKodu || satir.b?.stokKodu || '')

                return (
                  <tr key={satir.anahtar} style={{ background: satirRenk }} className="border-b border-gray-100">
                    <td className="px-4 py-2">
                      <div className="flex items-start gap-2">
                        <span className="flex-shrink-0 mt-0.5">
                          {satir.tip === 'ortak' && <span className="text-xs">🟰</span>}
                          {satir.tip === 'sadeceA' && <span className="text-xs text-blue-600">◀</span>}
                          {satir.tip === 'sadeceB' && <span className="text-xs text-purple-600">▶</span>}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-800 truncate max-w-md" title={urunAd}>{urunAd}</p>
                          {urunKod && <p className="text-xs text-gray-400 font-mono">{urunKod}</p>}
                        </div>
                      </div>
                    </td>
                    {/* A */}
                    <td className="text-right px-3 py-2" style={{ borderLeft: '2px solid #3b82f6' }}>
                      {satir.a ? <span className="font-medium text-blue-700">{fmt(satir.a.miktar)}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="text-right px-3 py-2 text-gray-700">
                      {satir.a ? fmt(satir.a.birimFiyat) : '—'}
                    </td>
                    <td className="text-right px-3 py-2 font-bold text-blue-700">
                      {satir.a ? fmt(satir.a.toplam) : '—'}
                    </td>
                    {/* B */}
                    <td className="text-right px-3 py-2" style={{ borderLeft: '2px solid #a855f7' }}>
                      {satir.b ? <span className="font-medium text-purple-700">{fmt(satir.b.miktar)}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="text-right px-3 py-2 text-gray-700">
                      {satir.b ? fmt(satir.b.birimFiyat) : '—'}
                    </td>
                    <td className="text-right px-3 py-2 font-bold text-purple-700">
                      {satir.b ? fmt(satir.b.toplam) : '—'}
                    </td>
                    {/* Fark */}
                    <td className="text-right px-3 py-2">
                      {satir.a && satir.b ? (
                        <span
                          className="inline-block px-2 py-0.5 rounded-md text-xs font-bold"
                          style={{
                            color: farkRengi,
                            background: fark === 0 ? 'transparent' : (fark > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)'),
                          }}
                        >
                          {fark > 0 ? '↑ ' : fark < 0 ? '↓ ' : ''}
                          {fark > 0 ? '+' : ''}{fmt(fark)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 italic">
                          {satir.a ? 'sadece A' : 'sadece B'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}

              {/* Toplam Satır */}
              <tr style={{ background: 'linear-gradient(to right, rgba(59,130,246,0.06), rgba(168,85,247,0.06))' }} className="font-bold border-t-2 border-gray-200">
                <td className="px-4 py-4 text-gray-700 uppercase text-xs tracking-wide">💰 Toplam</td>
                <td colSpan={3} className="text-right px-3 py-4 text-base text-blue-700" style={{ borderLeft: '2px solid #3b82f6' }}>
                  {fmt(analiz.toplam.a)} <span className="text-xs text-gray-500">₺</span>
                </td>
                <td colSpan={3} className="text-right px-3 py-4 text-base text-purple-700" style={{ borderLeft: '2px solid #a855f7' }}>
                  {fmt(analiz.toplam.b)} <span className="text-xs text-gray-500">₺</span>
                </td>
                <td className="text-right px-3 py-4">
                  {(() => {
                    const fark = analiz.toplam.a - analiz.toplam.b
                    if (fark === 0) return <span className="text-xs text-gray-400">=</span>
                    const renk = fark > 0 ? '#ef4444' : '#10b981'
                    const bg = fark > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)'
                    return (
                      <span className="inline-block px-3 py-1 rounded-lg text-sm font-bold" style={{ color: renk, background: bg }}>
                        {fark > 0 ? '↑ +' : '↓ '}{fmt(fark)} ₺
                      </span>
                    )
                  })()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default TeklifKiyasla
