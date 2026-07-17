import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { slaKurallariGetir, slaDurumHesapla, SLA_MODULLER } from '../services/slaService'
import { kargolariGetir } from '../services/kargoService'
import { servisTalepleriniGetir } from '../services/servisService'
import { gorevleriGetir } from '../services/gorevService'
import { teklifleriGetir } from '../services/teklifService'
import { gorusmeleriGetir } from '../services/gorusmeService'

// Durum geçmişinden belirli bir duruma ne zaman ulaşıldığını bul
function ilkUlasmaTarihi(durumGecmisi, hedefDurum) {
  if (!Array.isArray(durumGecmisi)) return null
  const kayit = durumGecmisi.find(d => d.durum === hedefDurum)
  return kayit?.tarih || null
}

// renk: metin/KPI vurgusu · bar: dağılım barındaki yumuşak ton
const DURUM_TANIM = {
  zamaninda: { isim: 'Zamanında', renk: '#10b981', bar: '#6ee7b7', aciklama: 'İş, SLA süresi içinde tamamlandı' },
  gec:       { isim: 'Geç',       renk: '#ef4444', bar: '#fca5a5', aciklama: 'İş tamamlandı ama SLA süresi aşıldı' },
  acik:      { isim: 'Açık',      renk: '#64748b', bar: '#e2e8f0', aciklama: 'İş devam ediyor, süresi henüz dolmadı' },
  kritik:    { isim: 'Kritik',    renk: '#f59e0b', bar: '#fcd34d', aciklama: 'İş devam ediyor ama SLA süresi doldu — acil ilgi ister' },
}

const ZAMAN_SECENEK = [
  { id: 'bu_ay',  isim: 'Bu Ay' },
  { id: 'gecen_ay', isim: 'Geçen Ay' },
  { id: 'bu_yil', isim: 'Bu Yıl' },
  { id: 'tumu',   isim: 'Tümü' },
  { id: 'ozel',   isim: 'Özel' },
]

// Süreyi insan diliyle yaz: 4 sa · 36 sa (1,5 g) · 96 sa (4 g)
function saatYaz(saat) {
  if (saat == null) return '—'
  const s = Math.round(saat)
  if (s < 24) return `${s} sa`
  const gun = (s / 24).toFixed(s % 24 === 0 ? 0 : 1).replace('.', ',')
  return `${gun} gün`
}

const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '—'

function skorRengi(skor) {
  if (skor == null) return '#9ca3af'
  if (skor >= 90) return '#10b981'
  if (skor >= 75) return '#f59e0b'
  return '#ef4444'
}

// Yüzde paylı yatay bar — zamanında/geç/kritik/açık dağılımını görselleştirir
function DagilimBar({ r, height = 6 }) {
  const toplam = r.toplam || 1
  const parcalar = [
    { n: r.zamaninda, renk: DURUM_TANIM.zamaninda.bar },
    { n: r.gec,       renk: DURUM_TANIM.gec.bar },
    { n: r.kritik,    renk: DURUM_TANIM.kritik.bar },
    { n: r.acik,      renk: DURUM_TANIM.acik.bar },
  ].filter(p => p.n > 0)
  return (
    <div className="flex w-full rounded-full overflow-hidden bg-gray-100" style={{ height, gap: 1 }}>
      {parcalar.map((p, i) => (
        <div key={i} style={{ width: `${(p.n / toplam) * 100}%`, background: p.renk, minWidth: 4 }} />
      ))}
    </div>
  )
}

function SkorRozet({ skor, buyuk = false }) {
  if (skor == null) {
    return <span className={`text-gray-400 ${buyuk ? 'text-lg' : 'text-xs'}`} title="Henüz tamamlanan iş yok">—</span>
  }
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold ${buyuk ? 'text-xl px-4 py-1.5' : 'text-sm px-3 py-1'}`}
      style={{ background: `${skorRengi(skor)}15`, color: skorRengi(skor) }}
    >
      %{skor}
    </span>
  )
}

function Performans() {
  const { kullanicilar } = useAuth()
  const navigate = useNavigate()

  const [slaKurallari, setSlaKurallari] = useState([])
  const [kargolar, setKargolar] = useState([])
  const [servisler, setServisler] = useState([])
  const [gorevler, setGorevler] = useState([])
  const [teklifler, setTeklifler] = useState([])
  const [gorusmeler, setGorusmeler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)

  // Filtreler
  const [aralik, setAralik] = useState('bu_ay')
  const [ozelBas, setOzelBas] = useState('')
  const [ozelBit, setOzelBit] = useState('')
  const [modulFiltre, setModulFiltre] = useState('tumu')
  const [seciliKullanici, setSeciliKullanici] = useState(null)
  const [aciklamaAcik, setAciklamaAcik] = useState(false)

  useEffect(() => {
    Promise.all([
      slaKurallariGetir(),
      kargolariGetir(),
      servisTalepleriniGetir(),
      gorevleriGetir(),
      teklifleriGetir(),
      gorusmeleriGetir().catch(() => []),
    ]).then(([sla, k, s, g, t, gr]) => {
      setSlaKurallari(sla.filter(r => r.aktif))
      setKargolar(k || [])
      setServisler(s || [])
      setGorevler(g || [])
      setTeklifler(t || [])
      setGorusmeler(gr || [])
      setYukleniyor(false)
    })
  }, [])

  // Tarih aralığını hesapla
  const [bas, bit] = useMemo(() => {
    const bugun = new Date()
    if (aralik === 'bu_ay') {
      return [new Date(bugun.getFullYear(), bugun.getMonth(), 1), new Date(bugun.getFullYear(), bugun.getMonth() + 1, 0, 23, 59, 59)]
    }
    if (aralik === 'gecen_ay') {
      return [new Date(bugun.getFullYear(), bugun.getMonth() - 1, 1), new Date(bugun.getFullYear(), bugun.getMonth(), 0, 23, 59, 59)]
    }
    if (aralik === 'bu_yil') {
      return [new Date(bugun.getFullYear(), 0, 1), new Date(bugun.getFullYear(), 11, 31, 23, 59, 59)]
    }
    if (aralik === 'ozel' && ozelBas && ozelBit) {
      return [new Date(ozelBas), new Date(ozelBit + 'T23:59:59')]
    }
    return [new Date(2000, 0, 1), new Date(2100, 0, 1)]
  }, [aralik, ozelBas, ozelBit])

  // Her iş için SLA analizi yap
  const isler = useMemo(() => {
    const araliktaMi = (iso) => {
      if (!iso) return false
      const d = new Date(iso)
      return d >= bas && d <= bit
    }
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
          modul: 'kargo', modulIsim: 'Kargo', ikon: '🚚',
          baslik: k.kargoNo + ' · ' + kural.olayIsim,
          detay: (k.gonderen?.firma || k.gonderen?.ad || '?') + ' → ' + (k.alici?.firma || k.alici?.ad || '?'),
          kullaniciId: String(kullaniciId),
          baslangic: k.olusturmaTarihi, bitis: bitisTarih,
          kural, sonuc,
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
          modul: 'servis', modulIsim: 'Servis', ikon: '🔧',
          baslik: s.talepNo + ' · ' + kural.olayIsim,
          detay: s.firmaAdi || s.musteriAd || '?',
          kullaniciId: String(kullaniciId),
          baslangic: s.olusturmaTarihi, bitis: bitisTarih,
          kural, sonuc,
          hedef: `/servis-talepleri/${s.id}`,
        })
      })
    })

    // ═══ GÖREV ═══
    // Not: yeni görevler atanan_id kullanır, eski kayıtlarda atanan (legacy) dolu.
    const gorevKurallari = slaKurallari.filter(k => k.modul === 'gorev')
    gorevler.forEach(g => {
      if (!araliktaMi(g.olusturmaTarih)) return
      const kullaniciId = g.atananId ?? g.atanan
      if (!kullaniciId) return

      gorevKurallari.forEach(kural => {
        const bitisTarih = g.durum === kural.bitisDurum
          ? (g.tamamlanmaTarihi || g.bitisTarihi || g.sonTarih)
          : null
        // Görevin kendi son tarihi varsa SLA yerine onu kullan
        const hedefTarih = g.bitisTarihi || g.sonTarih
        const slaSaat = hedefTarih
          ? ((new Date(hedefTarih) - new Date(g.olusturmaTarih)) / (1000 * 60 * 60))
          : kural.sureSaat
        const sonuc = slaDurumHesapla(g.olusturmaTarih, bitisTarih, slaSaat)
        if (!sonuc) return
        hepsi.push({
          id: `gorev-${g.id}-${kural.id}`,
          modul: 'gorev', modulIsim: 'Görev', ikon: '✅',
          baslik: g.baslik,
          detay: g.firmaAdi || g.aciklama?.substring(0, 60) || '',
          kullaniciId: String(kullaniciId),
          baslangic: g.olusturmaTarih, bitis: bitisTarih,
          kural: { ...kural, sureSaat: slaSaat }, sonuc,
          hedef: `/gorevler/${g.id}`,
        })
      })
    })

    // ═══ TEKLİF ═══
    // Gönderim ANI kayıt edilmediği için hedefe ulaşmış teklifler ölçülemez —
    // onları saymıyoruz (eskiden bitiş=oluşturma sayılıp herkese sahte %100
    // yazıyordu). Hâlâ hazırlanmakta olanlar açık/kritik olarak izlenir.
    const teklifKurallari = slaKurallari.filter(k => k.modul === 'teklif')
    teklifler.forEach(t => {
      if (!araliktaMi(t.olusturmaTarih)) return
      const kullaniciId = kullanicilar?.find(u => u.ad === t.hazirlayan || u.ad === t.musteriTemsilcisi)?.id
      if (!kullaniciId) return

      teklifKurallari.forEach(kural => {
        const hedefeUlasti = t.onayDurumu === kural.bitisDurum || t.durum === kural.bitisDurum
        let bitisTarih = null
        if (hedefeUlasti) {
          if (kural.bitisDurum === 'kabul' && t.kabulTarihi) bitisTarih = t.kabulTarihi
          else return // ulaşmış ama zamanı bilinmiyor → skora katma
        }
        const sonuc = slaDurumHesapla(t.olusturmaTarih, bitisTarih, kural.sureSaat)
        if (!sonuc) return
        hepsi.push({
          id: `teklif-${t.id}-${kural.id}`,
          modul: 'teklif', modulIsim: 'Teklif', ikon: '📋',
          baslik: (t.teklifNo || `Teklif #${t.id}`) + ' · ' + kural.olayIsim,
          detay: t.firmaAdi || '?',
          kullaniciId: String(kullaniciId),
          baslangic: t.olusturmaTarih, bitis: bitisTarih,
          kural, sonuc,
          hedef: `/teklifler/${t.id}`,
        })
      })
    })

    return modulFiltre === 'tumu' ? hepsi : hepsi.filter(i => i.modul === modulFiltre)
  }, [slaKurallari, kargolar, servisler, gorevler, teklifler, kullanicilar, modulFiltre, bas, bit])

  // Kişi başına görüşme sayısı — gorusen "A, B" çok kişili olabilir; her kişi
  // kendi hanesine sayılır. Ad eşleşmesi TR büyük/küçük harf duyarsız.
  const gorusmeSayaci = useMemo(() => {
    const adIndex = new Map() // norm(ad) → kullanıcı id
    for (const u of (kullanicilar || [])) {
      if (u.ad) adIndex.set(u.ad.trim().toLocaleLowerCase('tr'), String(u.id))
    }
    const sayac = new Map() // kullanıcı id → görüşme sayısı
    for (const g of gorusmeler) {
      if (!g.tarih) continue
      const d = new Date(g.tarih)
      if (d < bas || d > bit) continue
      const kisiler = new Set(
        String(g.gorusen || '').split(',').map(p => p.trim().toLocaleLowerCase('tr')).filter(Boolean)
      )
      for (const ad of kisiler) {
        const uid = adIndex.get(ad)
        if (uid) sayac.set(uid, (sayac.get(uid) || 0) + 1)
      }
    }
    return sayac
  }, [gorusmeler, kullanicilar, bas, bit])

  // Kullanıcı bazlı rapor
  const rapor = useMemo(() => {
    const map = new Map()
    const bosSatir = (k) => ({ kullaniciId: k, zamaninda: 0, gec: 0, acik: 0, kritik: 0, toplam: 0, gorusmeSayisi: 0, isler: [] })
    isler.forEach(is => {
      const k = is.kullaniciId
      if (!map.has(k)) map.set(k, bosSatir(k))
      const r = map.get(k)
      r[is.sonuc.durum]++
      r.toplam++
      r.isler.push(is)
    })
    // Görüşme sayıları — SLA işi olmayan ama görüşme yapan kişi de tabloya girsin
    for (const [uid, adet] of gorusmeSayaci.entries()) {
      if (!map.has(uid)) map.set(uid, bosSatir(uid))
      map.get(uid).gorusmeSayisi = adet
    }
    for (const [, r] of map.entries()) {
      const tamamlanan = r.zamaninda + r.gec
      r.tamamlanan = tamamlanan
      r.skor = tamamlanan > 0 ? Math.round((r.zamaninda / tamamlanan) * 100) : null
    }
    // Skor > iş sayısı > görüşme sayısı sırası; skorsuzlar en altta
    return [...map.values()].sort((a, b) =>
      (b.skor ?? -1) - (a.skor ?? -1) || b.toplam - a.toplam || b.gorusmeSayisi - a.gorusmeSayisi)
  }, [isler, gorusmeSayaci])

  // Ekip geneli özet
  const ozet = useMemo(() => {
    const s = { toplam: isler.length, zamaninda: 0, gec: 0, acik: 0, kritik: 0 }
    isler.forEach(i => { s[i.sonuc.durum]++ })
    const tamamlanan = s.zamaninda + s.gec
    s.skor = tamamlanan > 0 ? Math.round((s.zamaninda / tamamlanan) * 100) : null
    s.tamamlanan = tamamlanan
    // Aralıktaki toplam görüşme (kayıt bazında — çok kişili görüşme 1 sayılır)
    s.gorusme = gorusmeler.filter(g => {
      if (!g.tarih) return false
      const d = new Date(g.tarih)
      return d >= bas && d <= bit
    }).length
    return s
  }, [isler, gorusmeler, bas, bit])

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

  // ═══════ Kullanıcı Detay Görünümü ═══════
  if (seciliKullanici) {
    const r = rapor.find(x => x.kullaniciId === seciliKullanici)
    const kullanici = kullanicilar?.find(u => String(u.id) === seciliKullanici)
    const kisiIsler = r?.isler || []
    const sorunlular = kisiIsler
      .filter(i => i.sonuc.durum === 'gec' || i.sonuc.durum === 'kritik')
      .sort((a, b) => (b.sonuc.gecikmeSaat || 0) - (a.sonuc.gecikmeSaat || 0))

    // Modül kırılımı
    const modulKirilim = []
    for (const m of SLA_MODULLER) {
      const mi = kisiIsler.filter(i => i.modul === m.id)
      if (mi.length === 0) continue
      const mr = { zamaninda: 0, gec: 0, acik: 0, kritik: 0, toplam: mi.length }
      mi.forEach(i => { mr[i.sonuc.durum]++ })
      const tamam = mr.zamaninda + mr.gec
      modulKirilim.push({
        ...m, ...mr,
        skor: tamam > 0 ? Math.round((mr.zamaninda / tamam) * 100) : null,
      })
    }

    return (
      <div className="p-6 max-w-5xl mx-auto">
        <button
          onClick={() => setSeciliKullanici(null)}
          className="text-sm text-gray-400 hover:text-blue-600 mb-4 flex items-center gap-1"
        >
          ← Tüm Personele Dön
        </button>

        {/* Kişi başlık kartı */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <div className="h-1.5" style={{ background: skorRengi(r?.skor) }} />
          <div className="p-6">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0" style={{ background: 'var(--primary)' }}>
                {kullanici?.ad?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold text-gray-800">{kullanici?.ad || '—'}</h2>
                <p className="text-sm text-gray-400">
                  {r?.tamamlanan > 0
                    ? <>Tamamlanan <strong className="text-gray-600">{r.tamamlanan}</strong> işin <strong className="text-gray-600">{r.zamaninda}</strong>'i zamanında bitirildi</>
                    : 'Bu aralıkta tamamlanan iş yok'}
                  <span className="text-blue-500 font-medium"> · 📞 {r?.gorusmeSayisi || 0} görüşme</span>
                </p>
              </div>
              <SkorRozet skor={r?.skor} buyuk />
            </div>

            <div className="mt-4">
              <DagilimBar r={r || { toplam: 0 }} height={10} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              {[
                { key: 'zamaninda', deger: r?.zamaninda },
                { key: 'gec',       deger: r?.gec },
                { key: 'kritik',    deger: r?.kritik },
                { key: 'acik',      deger: r?.acik },
              ].map(({ key, deger }) => (
                <div key={key} className="rounded-xl p-3 text-center border" style={{ background: `${DURUM_TANIM[key].renk}0d`, borderColor: `${DURUM_TANIM[key].renk}33` }}>
                  <p className="text-xs font-medium" style={{ color: DURUM_TANIM[key].renk }}>{DURUM_TANIM[key].isim}</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: DURUM_TANIM[key].renk }}>{deger || 0}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modül kırılımı */}
        {modulKirilim.length > 1 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Modül Bazında</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {modulKirilim.map(m => (
                <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="text-lg w-7 text-center flex-shrink-0">{m.ikon}</span>
                  <span className="text-sm font-medium text-gray-700 w-24 flex-shrink-0">{m.isim.replace(' Takip', '').replace(' Talebi', '')}</span>
                  <div className="flex-1"><DagilimBar r={m} height={6} /></div>
                  <span className="text-xs text-gray-400 w-14 text-right flex-shrink-0">{m.toplam} iş</span>
                  <span className="w-14 text-right flex-shrink-0"><SkorRozet skor={m.skor} /></span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sorunlu işler */}
        {sorunlular.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-red-100 mb-4">
            <div className="px-5 py-3 border-b border-red-100 bg-red-50">
              <h3 className="text-sm font-semibold text-red-700">⚠️ Geciken / Kritik İşler ({sorunlular.length})</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {sorunlular.map(is => (
                <div
                  key={is.id}
                  onClick={() => navigate(is.hedef)}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition cursor-pointer"
                >
                  <div className="text-xl flex-shrink-0">{is.ikon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{is.baslik}</p>
                    <p className="text-xs text-gray-400 truncate">{is.detay} · {fmtTarih(is.baslangic)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold" style={{ color: DURUM_TANIM[is.sonuc.durum].renk }}>
                      {is.sonuc.durum === 'kritik' ? 'Süresi doldu · ' : ''}{saatYaz(is.sonuc.gecikmeSaat)} gecikme
                    </p>
                    <p className="text-xs text-gray-400">Süre limiti: {saatYaz(is.kural.sureSaat)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tüm işler */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">📋 Tüm İşler ({kisiIsler.length})</h3>
          </div>
          <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
            {kisiIsler.map(is => {
              const d = DURUM_TANIM[is.sonuc.durum]
              return (
                <div
                  key={is.id}
                  onClick={() => navigate(is.hedef)}
                  className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 transition cursor-pointer"
                >
                  <div className="text-lg flex-shrink-0">{is.ikon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{is.baslik}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {fmtTarih(is.baslangic)}
                      {is.sonuc.kullanilanSaat != null && ` · ${saatYaz(is.sonuc.kullanilanSaat)} sürdü`}
                      {` · limit ${saatYaz(is.kural.sureSaat)}`}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ background: `${d.renk}15`, color: d.renk }}>
                    {d.isim}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ═══════ Ana Görünüm ═══════
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">📊 Personel Performansı</h2>
          <p className="text-sm text-gray-400 mt-1">
            Skor = tamamlanan işlerin <strong className="text-gray-500">zamanında bitirilme</strong> oranı
          </p>
        </div>
        <button
          onClick={() => setAciklamaAcik(a => !a)}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium border border-blue-200 bg-blue-50 rounded-lg px-3 py-1.5"
        >
          {aciklamaAcik ? 'Açıklamayı Gizle' : 'ℹ️ Nasıl hesaplanır?'}
        </button>
      </div>

      {/* Nasıl hesaplanır kutusu */}
      {aciklamaAcik && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4 text-sm text-gray-600">
          <p className="mb-3">
            Her iş, <strong>SLA kurallarındaki</strong> süre limitiyle karşılaştırılır (örn. "Servis İlk Müdahale: 4 saat").
            Görevlerde görevin kendi bitiş tarihi limit kabul edilir.
            <strong> Skor</strong>, yalnızca tamamlanan işler üzerinden hesaplanır: zamanında biten ÷ toplam biten.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(DURUM_TANIM).map(([key, d]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.renk }} />
                <span className="text-xs"><strong style={{ color: d.renk }}>{d.isim}:</strong> {d.aciklama}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtreler */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
        <div className="flex gap-4 flex-wrap items-end">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block font-medium">Zaman Aralığı</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {ZAMAN_SECENEK.map(z => (
                <button
                  key={z.id}
                  onClick={() => setAralik(z.id)}
                  className={`px-3 py-2 text-sm font-medium transition ${aralik === z.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  {z.isim}
                </button>
              ))}
            </div>
          </div>

          {aralik === 'ozel' && (
            <>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block font-medium">Başlangıç</label>
                <input type="date" value={ozelBas} onChange={e => setOzelBas(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block font-medium">Bitiş</label>
                <input type="date" value={ozelBit} onChange={e => setOzelBit(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </>
          )}

          <div>
            <label className="text-xs text-gray-500 mb-1.5 block font-medium">Modül</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setModulFiltre('tumu')}
                className={`px-3 py-2 text-sm font-medium transition ${modulFiltre === 'tumu' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                Tümü
              </button>
              {SLA_MODULLER.filter(m => slaKurallari.some(k => k.modul === m.id)).map(m => (
                <button
                  key={m.id}
                  onClick={() => setModulFiltre(m.id)}
                  className={`px-3 py-2 text-sm font-medium transition ${modulFiltre === m.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  title={m.isim}
                >
                  {m.ikon} {m.isim.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Ekip özeti */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-400 font-medium">EKİP SKORU</p>
          <p className="text-2xl font-bold mt-1" style={{ color: skorRengi(ozet.skor) }}>
            {ozet.skor != null ? `%${ozet.skor}` : '—'}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-400 font-medium">TOPLAM İŞ</p>
          <p className="text-2xl font-bold text-gray-700 mt-1">{ozet.toplam}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs font-medium text-blue-500">GÖRÜŞME</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{ozet.gorusme}</p>
        </div>
        {['zamaninda', 'gec', 'kritik'].map(key => (
          <div key={key} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs font-medium" style={{ color: DURUM_TANIM[key].renk }}>{DURUM_TANIM[key].isim.toLocaleUpperCase('tr')}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: DURUM_TANIM[key].renk }}>{ozet[key]}</p>
          </div>
        ))}
      </div>

      {/* Personel listesi */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {rapor.length === 0 ? (
          <div className="text-center py-14 text-gray-400 text-sm">
            Bu aralıkta SLA'ya tabi iş kaydı bulunmuyor.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {rapor.map((r, idx) => {
              const kullanici = kullanicilar?.find(u => String(u.id) === r.kullaniciId)
              const madalya = r.skor != null && r.tamamlanan >= 3 && idx < 3
                ? ['🥇', '🥈', '🥉'][idx]
                : null
              return (
                <div
                  key={r.kullaniciId}
                  onClick={() => setSeciliKullanici(r.kullaniciId)}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 cursor-pointer transition"
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: 'var(--primary)' }}>
                      {kullanici?.ad?.charAt(0) || '?'}
                    </div>
                    {madalya && <span className="absolute -top-1.5 -right-1.5 text-sm">{madalya}</span>}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1.5 flex-wrap">
                      <span className="font-semibold text-gray-800 text-sm">{kullanici?.ad || 'Bilinmiyor'}</span>
                      <span className="text-xs text-gray-400">
                        {r.toplam} iş
                        <span className="text-blue-500 font-medium"> · 📞 {r.gorusmeSayisi} görüşme</span>
                        {r.gec > 0 && <span className="text-red-500 font-medium"> · {r.gec} geç</span>}
                        {r.kritik > 0 && <span className="text-amber-500 font-medium"> · {r.kritik} kritik ⚠</span>}
                        {r.acik > 0 && <span> · {r.acik} açık</span>}
                      </span>
                    </div>
                    <DagilimBar r={r} />
                  </div>

                  <div className="flex-shrink-0 w-20 text-right">
                    <SkorRozet skor={r.skor} />
                  </div>
                  <span className="text-gray-300 flex-shrink-0">›</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Alt lejant */}
      <div className="flex gap-4 flex-wrap mt-3 px-1">
        {Object.entries(DURUM_TANIM).map(([key, d]) => (
          <span key={key} className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.bar, border: '1px solid rgba(0,0,0,0.06)' }} /> {d.isim}
          </span>
        ))}
      </div>
    </div>
  )
}

export default Performans
