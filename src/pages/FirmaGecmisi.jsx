import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { teklifleriGetir } from '../services/teklifService'
import { gorevleriGetir } from '../services/gorevService'
import { lisanslariGetir } from '../services/lisansService'

const lisansTipiLabel = { sureksiz: 'Süreli', sureksiz_demo: 'Demo', sureksiz_surekli: 'Sürekli' }
const durumRenk = {
  aktif: { bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
  pasif: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
  suresi_doldu: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
  beklemede: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' },
}

function LisansModal({ lisans, onKapat }) {
  if (!lisans) return null
  const bugun = new Date()
  const bitis = lisans.bitisTarih ? new Date(lisans.bitisTarih) : null
  const kalanGun = bitis ? Math.ceil((bitis - bugun) / (1000 * 60 * 60 * 24)) : null
  const dr = durumRenk[lisans.durum] || durumRenk.pasif

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onKapat}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔑</span>
            <div>
              <h3 className="font-bold text-gray-800">{lisans.lisansTuru}</h3>
              <p className="text-xs text-gray-400 font-mono">{lisans.lisansKodu}</p>
            </div>
          </div>
          <button onClick={onKapat} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="space-y-3">
          {lisans.lisansId && (
            <div className="flex justify-between items-center py-2 border-b border-gray-50">
              <span className="text-xs text-gray-400">Lisans ID</span>
              <span className="text-xs font-mono text-purple-600 bg-purple-50 px-2 py-0.5 rounded">{lisans.lisansId}</span>
            </div>
          )}
          <div className="flex justify-between items-center py-2 border-b border-gray-50">
            <span className="text-xs text-gray-400">Firma</span>
            <span className="text-sm font-medium text-gray-700">{lisans.firmaAdi}</span>
          </div>
          {lisans.lokasyon && (
            <div className="flex justify-between items-center py-2 border-b border-gray-50">
              <span className="text-xs text-gray-400">Lokasyon / Şube</span>
              <span className="text-sm text-blue-600">📍 {lisans.lokasyon}</span>
            </div>
          )}
          {lisans.sunucuAdi && (
            <div className="flex justify-between items-center py-2 border-b border-gray-50">
              <span className="text-xs text-gray-400">Sunucu / IP</span>
              <span className="text-sm font-mono text-gray-700">{lisans.sunucuAdi}</span>
            </div>
          )}
          <div className="flex justify-between items-center py-2 border-b border-gray-50">
            <span className="text-xs text-gray-400">Tip</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
              {lisansTipiLabel[lisans.lisansTipi] || lisans.lisansTipi}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-50">
            <span className="text-xs text-gray-400">Durum</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: dr.bg, color: dr.color }}>
              {lisans.durum === 'aktif' ? 'Aktif' : lisans.durum === 'pasif' ? 'Pasif' : lisans.durum === 'suresi_doldu' ? 'Süresi Doldu' : 'Beklemede'}
            </span>
          </div>
          {lisans.kanalSayisi && (
            <div className="flex justify-between items-center py-2 border-b border-gray-50">
              <span className="text-xs text-gray-400">Kanal Sayısı</span>
              <span className="text-sm font-medium text-gray-700">{lisans.kanalSayisi} kanal</span>
            </div>
          )}
          <div className="flex justify-between items-center py-2 border-b border-gray-50">
            <span className="text-xs text-gray-400">Başlangıç</span>
            <span className="text-sm text-gray-700">{lisans.baslangicTarih || '—'}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-50">
            <span className="text-xs text-gray-400">Bitiş</span>
            {lisans.lisansTipi === 'sureksiz_surekli' ? (
              <span className="text-sm font-medium text-green-600">∞ Sürekli</span>
            ) : (
              <div className="text-right">
                <span className="text-sm text-gray-700">{lisans.bitisTarih || '—'}</span>
                {kalanGun !== null && kalanGun >= 0 && kalanGun <= 30 && (
                  <p className="text-xs text-amber-500">{kalanGun} gün kaldı</p>
                )}
                {kalanGun !== null && kalanGun < 0 && (
                  <p className="text-xs text-red-500">Süresi doldu</p>
                )}
              </div>
            )}
          </div>
          {lisans.notlar && (
            <div className="py-2">
              <p className="text-xs text-gray-400 mb-1">Notlar</p>
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{lisans.notlar}</p>
            </div>
          )}
        </div>

        <button
          onClick={onKapat}
          className="w-full mt-5 py-2 rounded-xl text-sm font-medium border border-gray-200 hover:bg-gray-50 transition"
        >
          Kapat
        </button>
      </div>
    </div>
  )
}

function FirmaGecmisi() {
  const { firmaAdi } = useParams()
  const navigate = useNavigate()
  const firma = decodeURIComponent(firmaAdi)

  const [aktifSekme, setAktifSekme] = useState('hepsi')
  const [yukleniyor, setYukleniyor] = useState(true)
  const [secilenLisans, setSecilenLisans] = useState(null)

  const [gorusmeler, setGorusmeler] = useState([])
  const [teklifler, setTeklifler] = useState([])
  const [lisanslar, setLisanslar] = useState([])
  const [gorevler, setGorevler] = useState([])

  useEffect(() => {
    const verileriYukle = async () => {
      setYukleniyor(true)
      const [g, t, l, gr] = await Promise.all([
        gorusmeleriGetir(),
        teklifleriGetir(),
        lisanslariGetir(),
        gorevleriGetir(),
      ])
      setGorusmeler((g || []).filter((item) => item.firmaAdi === firma))
      setTeklifler((t || []).filter((item) => item.firmaAdi === firma))
      setLisanslar((l || []).filter((item) => item.firmaAdi === firma))
      setGorevler((gr || []).filter((item) => item.firmaAdi === firma))
      setYukleniyor(false)
    }
    verileriYukle()
  }, [firma])

  // Timeline — tüm olayları birleştir ve tarihe göre sırala
  const tumOlaylar = [
    ...gorusmeler.map((g) => ({
      id: `gorusme-${g.id}`,
      tip: 'gorusme',
      tarih: g.tarih,
      baslik: g.konu,
      detay: `Görüşen: ${g.gorusen} • Durum: ${g.durum}`,
      ikon: '📞',
      renk: '#3b82f6',
      veri: g,
    })),
    ...teklifler.map((t) => ({
      id: `teklif-${t.id}`,
      tip: 'teklif',
      tarih: t.tarih,
      baslik: t.konu,
      detay: `${t.teklifNo} • ${(t.genelToplam || 0).toLocaleString('tr-TR')} ₺`,
      ikon: '📋',
      renk: '#0176D3',
      veri: t,
    })),
    ...lisanslar.map((l) => ({
      id: `lisans-${l.id}`,
      tip: 'lisans',
      tarih: l.baslangicTarih,
      baslik: `${l.lisansTuru} Lisansı`,
      detay: `${l.lisansKodu} • ${l.durum}`,
      ikon: '🔑',
      renk: '#014486',
      veri: l,
    })),
    ...gorevler.map((g) => ({
      id: `gorev-${g.id}`,
      tip: 'gorev',
      tarih: g.olusturmaTarih?.split('T')[0] || '',
      baslik: g.baslik,
      detay: `Atanan: ${g.atananAd || ''} • ${g.durum}`,
      ikon: '✅',
      renk: '#10b981',
      veri: g,
    })),
  ].sort((a, b) => new Date(b.tarih) - new Date(a.tarih))

  const filtreliOlaylar = aktifSekme === 'hepsi'
    ? tumOlaylar
    : tumOlaylar.filter((o) => o.tip === aktifSekme)

  const onayDurumRenk = {
    takipte: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
    kabul: { bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
    vazgecildi: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
    revizyon: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' },
  }

  if (yukleniyor) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-sm text-gray-400">Yükleniyor...</p>
      </div>
    )
  }

  return (
    <>
    <div className="p-6 max-w-4xl mx-auto">

      {/* Başlık */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-blue-600 hover:text-blue-800 transition"
        >
          ← Geri
        </button>
        <div>
          <h2 className="text-xl font-semibold text-gray-800">{firma}</h2>
          <p className="text-sm text-gray-400 mt-0.5">Firma geçmişi ve kayıtları</p>
        </div>
      </div>

      {/* Özet kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { isim: 'Görüşme', sayi: gorusmeler.length, ikon: '📞', renk: 'text-blue-500' },
          { isim: 'Teklif', sayi: teklifler.length, ikon: '📋', renk: 'text-blue-700' },
          { isim: 'Lisans', sayi: lisanslar.length, ikon: '🔑', renk: 'text-indigo-700' },
          { isim: 'Görev', sayi: gorevler.length, ikon: '✅', renk: 'text-green-500' },
        ].map((k) => (
          <div key={k.isim} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
            <div className="text-2xl mb-2">{k.ikon}</div>
            <p className={`text-2xl font-bold ${k.renk}`}>{k.sayi}</p>
            <p className="text-xs text-gray-400 mt-1">{k.isim}</p>
          </div>
        ))}
      </div>

      {/* Teklif özeti */}
      {teklifler.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-3">Teklif Özeti</p>
          <div className="flex gap-8 flex-wrap">
            <div>
              <p className="text-xs text-gray-400 mb-1">Toplam Teklif Tutarı</p>
              <p className="text-xl font-bold text-blue-600">
                ₺{teklifler.reduce((sum, t) => sum + (t.genelToplam || 0), 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Kabul Edilen</p>
              <p className="text-xl font-bold text-green-600">
                ₺{teklifler.filter((t) => t.onayDurumu === 'kabul').reduce((sum, t) => sum + (t.genelToplam || 0), 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Kabul Oranı</p>
              <p className="text-xl font-bold text-amber-500">
                %{teklifler.length > 0 ? Math.round((teklifler.filter((t) => t.onayDurumu === 'kabul').length / teklifler.length) * 100) : 0}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sekmeler */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { id: 'hepsi', isim: 'Tümü', sayi: tumOlaylar.length },
          { id: 'gorusme', isim: 'Görüşmeler', sayi: gorusmeler.length },
          { id: 'teklif', isim: 'Teklifler', sayi: teklifler.length },
          { id: 'lisans', isim: 'Lisanslar', sayi: lisanslar.length },
          { id: 'gorev', isim: 'Görevler', sayi: gorevler.length },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => setAktifSekme(s.id)}
            className={`text-sm px-4 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${
              aktifSekme === s.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            {s.isim}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${aktifSekme === s.id ? 'bg-white/20' : 'bg-gray-100'}`}>
              {s.sayi}
            </span>
          </button>
        ))}
      </div>

      {/* Timeline */}
      {filtreliOlaylar.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-sm">Bu kategoride kayıt bulunamadı</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline çizgisi */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-blue-200" />

          <div className="space-y-3">
            {filtreliOlaylar.map((olay) => (
              <div key={olay.id} className="flex gap-4 relative">
                {/* Nokta */}
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg flex-shrink-0 relative z-10 bg-white border-2 border-gray-200 shadow-sm">
                  {olay.ikon}
                </div>

                {/* Kart */}
                <div
                  className="flex-1 bg-white rounded-xl p-4 border border-gray-100 shadow-sm cursor-pointer hover:shadow-md hover:border-blue-100 transition-all"
                  onClick={() => {
                    if (olay.tip === 'gorusme') navigate(`/gorusmeler/${olay.veri.id}`)
                    if (olay.tip === 'teklif') navigate(`/teklifler/${olay.veri.id}`)
                    if (olay.tip === 'gorev') navigate(`/gorevler/${olay.veri.id}`)
                    if (olay.tip === 'lisans') setSecilenLisans(olay.veri)
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          olay.tip === 'gorusme' ? 'bg-blue-50 text-blue-600' :
                          olay.tip === 'teklif' ? 'bg-indigo-50 text-indigo-600' :
                          olay.tip === 'lisans' ? 'bg-purple-50 text-purple-600' :
                          'bg-green-50 text-green-600'
                        }`}>
                          {olay.tip === 'gorusme' && 'Görüşme'}
                          {olay.tip === 'teklif' && 'Teklif'}
                          {olay.tip === 'lisans' && 'Lisans'}
                          {olay.tip === 'gorev' && 'Görev'}
                        </span>

                        {/* Teklif durumu */}
                        {olay.tip === 'teklif' && olay.veri.onayDurumu && (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            olay.veri.onayDurumu === 'kabul' ? 'bg-green-50 text-green-600' :
                            olay.veri.onayDurumu === 'vazgecildi' ? 'bg-red-50 text-red-500' :
                            olay.veri.onayDurumu === 'revizyon' ? 'bg-amber-50 text-amber-600' :
                            'bg-blue-50 text-blue-600'
                          }`}>
                            {olay.veri.onayDurumu === 'takipte' && 'Takipte'}
                            {olay.veri.onayDurumu === 'kabul' && '✓ Kabul'}
                            {olay.veri.onayDurumu === 'vazgecildi' && 'Vazgeçildi'}
                            {olay.veri.onayDurumu === 'revizyon' && 'Revizyon'}
                          </span>
                        )}

                        {/* Görüşme durumu */}
                        {olay.tip === 'gorusme' && (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            olay.veri.durum === 'kapali' ? 'bg-green-50 text-green-600' :
                            olay.veri.durum === 'beklemede' ? 'bg-amber-50 text-amber-600' :
                            'bg-blue-50 text-blue-600'
                          }`}>
                            {olay.veri.durum === 'acik' && 'Açık'}
                            {olay.veri.durum === 'beklemede' && 'Beklemede'}
                            {olay.veri.durum === 'kapali' && 'Kapalı'}
                          </span>
                        )}
                      </div>

                      <p className="font-semibold text-gray-800 text-sm">{olay.baslik}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{olay.detay}</p>

                      {/* Teklif tutarı */}
                      {olay.tip === 'teklif' && olay.veri.genelToplam > 0 && (
                        <p className="text-sm font-bold mt-1.5 text-blue-600">
                          ₺{olay.veri.genelToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </p>
                      )}

                      {/* Lisans bilgisi */}
                      {olay.tip === 'lisans' && (
                        <div className="flex gap-3 mt-1.5">
                          {olay.veri.lisansId && (
                            <span className="text-xs font-mono text-purple-600">{olay.veri.lisansId}</span>
                          )}
                          {olay.veri.kanalSayisi && (
                            <span className="text-xs text-gray-400">{olay.veri.kanalSayisi} kanal</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-400">{olay.tarih}</p>
                      <p className="text-xs mt-1 text-blue-500">Detay →</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>

    <LisansModal lisans={secilenLisans} onKapat={() => setSecilenLisans(null)} />
    </>
  )
}

export default FirmaGecmisi