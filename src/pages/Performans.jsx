import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { slaKurallariGetir, slaDurumHesapla, SLA_MODULLER } from '../services/slaService'
import { kargolariGetir } from '../services/kargoService'
import { servisTalepleriniGetir } from '../services/servisService'
import { gorevleriGetir } from '../services/gorevService'
import { teklifleriGetir } from '../services/teklifService'
import CustomSelect from '../components/CustomSelect'

// Durum geçmişinden belirli bir duruma ne zaman ulaşıldığını bul
function ilkUlasmaTarihi(durumGecmisi, hedefDurum) {
  if (!Array.isArray(durumGecmisi)) return null
  const kayit = durumGecmisi.find(d => d.durum === hedefDurum)
  return kayit?.tarih || null
}

function Performans() {
  const { kullanicilar } = useAuth()
  const navigate = useNavigate()

  const [slaKurallari, setSlaKurallari] = useState([])
  const [kargolar, setKargolar] = useState([])
  const [servisler, setServisler] = useState([])
  const [gorevler, setGorevler] = useState([])
  const [teklifler, setTeklifler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)

  // Filtreler
  const [aralik, setAralik] = useState('bu_ay')   // bu_ay, bu_yil, tumu, ozel
  const [ozelBas, setOzelBas] = useState('')
  const [ozelBit, setOzelBit] = useState('')
  const [modulFiltre, setModulFiltre] = useState('tumu')
  const [seciliKullanici, setSeciliKullanici] = useState(null)

  useEffect(() => {
    Promise.all([
      slaKurallariGetir(),
      kargolariGetir(),
      servisTalepleriniGetir(),
      gorevleriGetir(),
      teklifleriGetir(),
    ]).then(([sla, k, s, g, t]) => {
      setSlaKurallari(sla.filter(r => r.aktif))
      setKargolar(k || [])
      setServisler(s || [])
      setGorevler(g || [])
      setTeklifler(t || [])
      setYukleniyor(false)
    })
  }, [])

  // Tarih aralığını hesapla
  const [bas, bit] = useMemo(() => {
    const bugun = new Date()
    if (aralik === 'bu_ay') {
      return [new Date(bugun.getFullYear(), bugun.getMonth(), 1), new Date(bugun.getFullYear(), bugun.getMonth() + 1, 0, 23, 59, 59)]
    }
    if (aralik === 'bu_yil') {
      return [new Date(bugun.getFullYear(), 0, 1), new Date(bugun.getFullYear(), 11, 31, 23, 59, 59)]
    }
    if (aralik === 'ozel' && ozelBas && ozelBit) {
      return [new Date(ozelBas), new Date(ozelBit + 'T23:59:59')]
    }
    return [new Date(2000, 0, 1), new Date(2100, 0, 1)]
  }, [aralik, ozelBas, ozelBit])

  const araliktaMi = (iso) => {
    if (!iso) return false
    const d = new Date(iso)
    return d >= bas && d <= bit
  }

  // Her iş için SLA analizi yap
  const isler = useMemo(() => {
    const hepsi = []

    // ═══ KARGO ═══
    const kargoKurallari = slaKurallari.filter(k => k.modul === 'kargo')
    kargolar.forEach(k => {
      if (!araliktaMi(k.olusturmaTarihi)) return
      const kullaniciId = k.olusturanId
      if (!kullaniciId) return

      kargoKurallari.forEach(kural => {
        const bitisTarih = ilkUlasmaTarihi(k.durumGecmisi, kural.bitisDurum) ||
                           (k.durum === kural.bitisDurum ? k.guncellemeTarihi : null)
        const sonuc = slaDurumHesapla(k.olusturmaTarihi, bitisTarih, kural.sureSaat)
        if (!sonuc) return
        hepsi.push({
          id: `kargo-${k.id}-${kural.id}`,
          modul: 'kargo',
          modulIsim: 'Kargo',
          ikon: '🚚',
          baslik: k.kargoNo + ' · ' + kural.olayIsim,
          detay: (k.gonderen?.firma || k.gonderen?.ad || '?') + ' → ' + (k.alici?.firma || k.alici?.ad || '?'),
          kullaniciId: String(kullaniciId),
          baslangic: k.olusturmaTarihi,
          bitis: bitisTarih,
          kural,
          sonuc,
          hedef: `/kargolar/${k.id}`,
        })
      })
    })

    // ═══ SERVİS ═══
    const servisKurallari = slaKurallari.filter(k => k.modul === 'servis')
    servisler.forEach(s => {
      if (!araliktaMi(s.olusturmaTarihi)) return
      const kullaniciId = s.atananKullaniciId
      if (!kullaniciId) return

      servisKurallari.forEach(kural => {
        const bitisTarih = ilkUlasmaTarihi(s.durumGecmisi, kural.bitisDurum) ||
                           (s.durum === kural.bitisDurum ? s.guncellemeTarihi : null)
        const sonuc = slaDurumHesapla(s.olusturmaTarihi, bitisTarih, kural.sureSaat)
        if (!sonuc) return
        hepsi.push({
          id: `servis-${s.id}-${kural.id}`,
          modul: 'servis',
          modulIsim: 'Servis',
          ikon: '🔧',
          baslik: s.talepNo + ' · ' + kural.olayIsim,
          detay: s.firmaAdi || s.musteriAd || '?',
          kullaniciId: String(kullaniciId),
          baslangic: s.olusturmaTarihi,
          bitis: bitisTarih,
          kural,
          sonuc,
          hedef: `/servis-talepleri/${s.id}`,
        })
      })
    })

    // ═══ GÖREV ═══
    const gorevKurallari = slaKurallari.filter(k => k.modul === 'gorev')
    gorevler.forEach(g => {
      if (!araliktaMi(g.olusturmaTarih)) return
      const kullaniciId = g.atanan
      if (!kullaniciId) return

      gorevKurallari.forEach(kural => {
        const bitisTarih = g.durum === kural.bitisDurum
          ? (g.tamamlanmaTarihi || g.bitisTarihi)
          : null
        // Eğer görevin kendi sonTarih'i varsa onu kullan, yoksa SLA saatini
        const slaSaat = g.sonTarih
          ? ((new Date(g.sonTarih) - new Date(g.olusturmaTarih)) / (1000 * 60 * 60))
          : kural.sureSaat
        const sonuc = slaDurumHesapla(g.olusturmaTarih, bitisTarih, slaSaat)
        if (!sonuc) return
        hepsi.push({
          id: `gorev-${g.id}-${kural.id}`,
          modul: 'gorev',
          modulIsim: 'Görev',
          ikon: '✅',
          baslik: g.baslik,
          detay: g.aciklama?.substring(0, 60) || '',
          kullaniciId: String(kullaniciId),
          baslangic: g.olusturmaTarih,
          bitis: bitisTarih,
          kural: { ...kural, sureSaat: slaSaat },
          sonuc,
          hedef: `/gorevler/${g.id}`,
        })
      })
    })

    // ═══ TEKLİF ═══
    const teklifKurallari = slaKurallari.filter(k => k.modul === 'teklif')
    teklifler.forEach(t => {
      if (!araliktaMi(t.olusturmaTarih)) return
      // Teklif yazar - 'hazirlayan' text, eşleşme: isim ile kullanıcı bul
      const kullaniciId = kullanicilar?.find(u => u.ad === t.hazirlayan || u.ad === t.musteriTemsilcisi)?.id
      if (!kullaniciId) return

      teklifKurallari.forEach(kural => {
        // Hedef durum kontrol: onay_durumu ya da durum
        const bitisTarih = (t.onayDurumu === kural.bitisDurum || t.durum === kural.bitisDurum)
          ? t.olusturmaTarih  // basitçe olusturulma anı
          : null
        const sonuc = slaDurumHesapla(t.olusturmaTarih, bitisTarih, kural.sureSaat)
        if (!sonuc) return
        hepsi.push({
          id: `teklif-${t.id}-${kural.id}`,
          modul: 'teklif',
          modulIsim: 'Teklif',
          ikon: '📋',
          baslik: t.teklifNo + ' · ' + kural.olayIsim,
          detay: t.firmaAdi || '?',
          kullaniciId: String(kullaniciId),
          baslangic: t.olusturmaTarih,
          bitis: bitisTarih,
          kural,
          sonuc,
          hedef: `/teklifler/${t.id}`,
        })
      })
    })

    return modulFiltre === 'tumu' ? hepsi : hepsi.filter(i => i.modul === modulFiltre)
  }, [slaKurallari, kargolar, servisler, gorevler, teklifler, kullanicilar, modulFiltre, bas, bit])

  // Kullanıcı bazlı rapor
  const rapor = useMemo(() => {
    const map = new Map()
    isler.forEach(is => {
      const k = is.kullaniciId
      if (!map.has(k)) {
        map.set(k, { kullaniciId: k, zamaninda: 0, gec: 0, acik: 0, kritik: 0, toplam: 0, isler: [] })
      }
      const r = map.get(k)
      r[is.sonuc.durum]++
      r.toplam++
      r.isler.push(is)
    })
    for (const [, r] of map.entries()) {
      const tamamlanan = r.zamaninda + r.gec
      r.skor = tamamlanan > 0 ? Math.round((r.zamaninda / tamamlanan) * 100) : null
    }
    return [...map.values()].sort((a, b) => (b.skor ?? -1) - (a.skor ?? -1))
  }, [isler])

  if (yukleniyor) {
    return (
      <div className="p-6 text-center text-gray-400">
        <div className="text-4xl mb-2 animate-pulse">📊</div>
        <p className="text-sm">Performans verileri yükleniyor...</p>
      </div>
    )
  }

  // SLA kural yoksa uyar
  if (slaKurallari.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">📊 Personel Performansı</h2>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-4xl mb-2">⏱️</p>
          <p className="text-sm text-amber-800 font-medium">Henüz SLA kuralı tanımlanmamış</p>
          <p className="text-xs text-amber-600 mt-2">Performans hesabı için önce SLA kuralları tanımlamanız gerekir.</p>
          <button
            onClick={() => navigate('/sla-ayarlari')}
            className="mt-4 bg-amber-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-amber-700 transition"
          >
            SLA Ayarlarına Git
          </button>
        </div>
      </div>
    )
  }

  // Kullanıcı detay görünümü
  if (seciliKullanici) {
    const r = rapor.find(x => x.kullaniciId === seciliKullanici)
    const kullanici = kullanicilar?.find(u => String(u.id) === seciliKullanici)
    const isler = r?.isler || []
    const gecIsler = isler.filter(i => i.sonuc.durum === 'gec' || i.sonuc.durum === 'kritik')

    return (
      <div className="p-6 max-w-5xl mx-auto">
        <button
          onClick={() => setSeciliKullanici(null)}
          className="text-sm text-gray-400 hover:text-blue-600 mb-4 flex items-center gap-1"
        >
          ← Tüm Personele Dön
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <div className="h-1.5" style={{ background: 'var(--primary)' }} />
          <div className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl font-bold" style={{ background: 'var(--primary)' }}>
                {kullanici?.ad?.charAt(0) || '?'}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-800">{kullanici?.ad || '—'}</h2>
                <p className="text-sm text-gray-400">{kullanici?.rol || ''}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded-xl p-4 text-center bg-blue-50 border border-blue-100">
                <p className="text-xs text-blue-600 font-medium">Toplam İş</p>
                <p className="text-2xl font-bold text-blue-700 mt-1">{r?.toplam || 0}</p>
              </div>
              <div className="rounded-xl p-4 text-center bg-green-50 border border-green-100">
                <p className="text-xs text-green-600 font-medium">✅ Zamanında</p>
                <p className="text-2xl font-bold text-green-700 mt-1">{r?.zamaninda || 0}</p>
              </div>
              <div className="rounded-xl p-4 text-center bg-red-50 border border-red-100">
                <p className="text-xs text-red-600 font-medium">❌ Geç</p>
                <p className="text-2xl font-bold text-red-700 mt-1">{r?.gec || 0}</p>
              </div>
              <div className="rounded-xl p-4 text-center bg-amber-50 border border-amber-100">
                <p className="text-xs text-amber-600 font-medium">⚠️ Kritik</p>
                <p className="text-2xl font-bold text-amber-700 mt-1">{r?.kritik || 0}</p>
              </div>
              <div className="rounded-xl p-4 text-center bg-gray-50 border border-gray-100">
                <p className="text-xs text-gray-600 font-medium">SKOR</p>
                <p className="text-2xl font-bold mt-1" style={{ color: skorRengi(r?.skor) }}>
                  {r?.skor != null ? `%${r.skor}` : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {gecIsler.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-red-100 mb-4">
            <div className="px-5 py-4 border-b border-red-100 bg-red-50">
              <h3 className="text-sm font-semibold text-red-700">⚠️ Geciken / Kritik İşler ({gecIsler.length})</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {gecIsler.map(is => (
                <div
                  key={is.id}
                  onClick={() => navigate(is.hedef)}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition cursor-pointer"
                >
                  <div className="text-2xl flex-shrink-0">{is.ikon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{is.baslik}</p>
                    <p className="text-xs text-gray-400 truncate">{is.detay}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-semibold text-red-600">
                      +{Math.round(is.sonuc.gecikmeSaat)} saat gecikme
                    </p>
                    <p className="text-xs text-gray-400">Limit: {is.kural.sureSaat}h</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">📋 Tüm İşler ({isler.length})</h3>
          </div>
          <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
            {isler.map(is => {
              const dr = durumRengi(is.sonuc.durum)
              return (
                <div
                  key={is.id}
                  onClick={() => navigate(is.hedef)}
                  className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 transition cursor-pointer"
                >
                  <div className="text-lg flex-shrink-0">{is.ikon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{is.baslik}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: dr.bg, color: dr.renk }}>
                    {dr.isim}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ═══════ Ana Liste Görünümü ═══════

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800">📊 Personel Performans Raporu</h2>
        <p className="text-sm text-gray-400 mt-1">
          SLA kurallarına göre hesaplanan performans skorları
        </p>
      </div>

      {/* Filtreler */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Zaman Aralığı</label>
            <CustomSelect
              value={aralik}
              onChange={e => setAralik(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="bu_ay">Bu Ay</option>
              <option value="bu_yil">Bu Yıl</option>
              <option value="tumu">Tümü</option>
              <option value="ozel">Özel Aralık</option>
            </CustomSelect>
          </div>

          {aralik === 'ozel' && (
            <>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Başlangıç</label>
                <input
                  type="date"
                  value={ozelBas}
                  onChange={e => setOzelBas(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Bitiş</label>
                <input
                  type="date"
                  value={ozelBit}
                  onChange={e => setOzelBit(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Modül</label>
            <CustomSelect
              value={modulFiltre}
              onChange={e => setModulFiltre(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="tumu">Tümü</option>
              {SLA_MODULLER.map(m => (
                <option key={m.id} value={m.id}>{m.ikon} {m.isim}</option>
              ))}
            </CustomSelect>
          </div>

          <div className="text-xs text-gray-400 ml-auto">
            Toplam: <strong className="text-gray-700">{isler.length}</strong> iş · <strong className="text-gray-700">{rapor.length}</strong> personel
          </div>
        </div>
      </div>

      {/* Rapor Tablosu */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
              <th className="text-left py-3 px-5">Personel</th>
              <th className="text-right py-3 px-3">Toplam</th>
              <th className="text-right py-3 px-3">Zamanında</th>
              <th className="text-right py-3 px-3">Geç</th>
              <th className="text-right py-3 px-3">Açık</th>
              <th className="text-right py-3 px-3">Kritik</th>
              <th className="text-right py-3 px-5">Skor</th>
            </tr>
          </thead>
          <tbody>
            {rapor.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-gray-400">
                  Bu aralıkta kayıt bulunmuyor.
                </td>
              </tr>
            )}
            {rapor.map(r => {
              const kullanici = kullanicilar?.find(u => String(u.id) === r.kullaniciId)
              return (
                <tr
                  key={r.kullaniciId}
                  onClick={() => setSeciliKullanici(r.kullaniciId)}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="py-3 px-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: 'var(--primary)' }}>
                        {kullanici?.ad?.charAt(0) || '?'}
                      </div>
                      <span className="font-medium text-gray-800">{kullanici?.ad || 'Bilinmiyor'}</span>
                    </div>
                  </td>
                  <td className="text-right py-3 px-3 text-gray-700 font-medium">{r.toplam}</td>
                  <td className="text-right py-3 px-3 text-green-600 font-medium">{r.zamaninda}</td>
                  <td className="text-right py-3 px-3 text-red-500 font-medium">{r.gec}</td>
                  <td className="text-right py-3 px-3 text-blue-500 font-medium">{r.acik}</td>
                  <td className="text-right py-3 px-3 text-amber-500 font-medium">{r.kritik}</td>
                  <td className="text-right py-3 px-5">
                    {r.skor != null ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold" style={{ background: `${skorRengi(r.skor)}15`, color: skorRengi(r.skor) }}>
                        ● %{r.skor}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Helpers
function skorRengi(skor) {
  if (skor == null) return '#9ca3af'
  if (skor >= 90) return '#10b981'
  if (skor >= 75) return '#f59e0b'
  return '#ef4444'
}

function durumRengi(durum) {
  const map = {
    zamaninda: { isim: '✅ Zamanında', renk: '#10b981', bg: '#10b98115' },
    gec:       { isim: '❌ Geç',        renk: '#ef4444', bg: '#ef444415' },
    kritik:    { isim: '⚠️ Kritik',    renk: '#f59e0b', bg: '#f59e0b15' },
    acik:      { isim: '🔵 Açık',       renk: '#3b82f6', bg: '#3b82f615' },
  }
  return map[durum] || map.acik
}

export default Performans
