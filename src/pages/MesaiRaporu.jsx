// Çalışma Saatleri (İK Yönetimi altı) — QR ile mesai başlatan saha ekiplerinin
// çalışma saatleri: GÜNLÜK / HAFTALIK / AYLIK kırılım + Excel dışa aktarma.
// Menü adı 01.08'de "Mesai Raporu"ndan değişti: halk dilinde "mesai" fazla
// çalışmayı anlatıyor, oysa bu sayfa normal + fazla çalışmanın ikisini de tutar.
//
// FAZLA MESAİ (mig 252): 19:00 sonrası başlatılan kayıt tip='fazla' işaretlenir,
// 18:30 cron'u ona dokunmaz, personel elle bitirir (yedek: 02:00 cron).
// Raporda normal ve fazla süre AYRI sütun — ayrı ücretlendirildiği için.
//
// Erişim: Abdullah (İK modülü) + Ali + Oğuz + Ferdi — mesaiRaporuGorebilirMi.
// DB tarafı mig 237 ile aynı hizada (İK yetkilileri tüm mesai kayıtlarını okur).
//
// Mesai modeli hatırlatma: "Bitir" YOK — 18:30'da pg_cron otomatik kapatır
// (mig 225). sure_dakika kolonu YALNIZ o kapanışta yazılır; gün içinde null'dur.
// Eskiden devam eden kayıt süreye HİÇ katılmıyordu ve rapor gün boyu 0:00
// gösteriyordu (01.08 bildirimi: "10 dk önce QR ile başladılar, hâlâ 0.00").
// Artık çıkışı olmayan kayıt için "şu ana kadar geçen" süre hesaplanıyor;
// bu satırlar 'devam ediyor' rozetiyle ayrıca işaretleniyor.

import { useState, useEffect, useMemo } from 'react'
import { CalendarClock, Download, Users, Clock, CalendarDays, Moon } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { Button, Card, Input, Label, Badge, EmptyState, Table, THead, TBody, TR, TH, TD } from '../components/ui'
import CustomSelect from '../components/CustomSelect'
import { mesaiKayitDakika as kayitDakika } from '../lib/mesaiSure'

const iso = (d) => d.toISOString().slice(0, 10)
const bugun = () => iso(new Date())
const gunEkle = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

// Pazartesi başlangıçlı hafta (TR)
const haftaBasi = (d = new Date()) => {
  const x = new Date(d)
  const g = (x.getDay() + 6) % 7        // Pzt=0 … Paz=6
  x.setDate(x.getDate() - g)
  return x
}
const ayBasi = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1)

const HAZIR_ARALIKLAR = [
  { id: 'bugun',      ad: 'Bugün',        bas: () => bugun(),                                   bit: () => bugun() },
  { id: 'buhafta',    ad: 'Bu hafta',     bas: () => iso(haftaBasi()),                          bit: () => bugun() },
  { id: 'gecenhafta', ad: 'Geçen hafta',  bas: () => iso(gunEkle(haftaBasi(), -7)),             bit: () => iso(gunEkle(haftaBasi(), -1)) },
  { id: 'buay',       ad: 'Bu ay',        bas: () => iso(ayBasi()),                             bit: () => bugun() },
  { id: 'gecenay',    ad: 'Geçen ay',     bas: () => iso(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)),
                                          bit: () => iso(new Date(new Date().getFullYear(), new Date().getMonth(), 0)) },
  { id: 'son90',      ad: 'Son 90 gün',   bas: () => iso(gunEkle(new Date(), -90)),             bit: () => bugun() },
]

const KIRILIMLAR = [
  { id: 'gunluk',   ad: 'Günlük' },
  { id: 'haftalik', ad: 'Haftalık' },
  { id: 'aylik',    ad: 'Aylık' },
]

const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

// Bir mesai kaydının dönem anahtarı + etiketi (seçilen kırılıma göre)
const donemBilgi = (girisIso, kirilim) => {
  const d = new Date(girisIso)
  if (kirilim === 'gunluk') {
    return { anahtar: iso(d), etiket: d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', weekday: 'short' }) }
  }
  if (kirilim === 'haftalik') {
    const hb = haftaBasi(d)
    const hs = gunEkle(hb, 6)
    return {
      anahtar: iso(hb),
      etiket: `${hb.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} – ${hs.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}`,
    }
  }
  return { anahtar: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, etiket: `${AY_ADLARI[d.getMonth()]} ${d.getFullYear()}` }
}

const saatBicim = (dk) => {
  if (!dk) return '0:00'
  const s = Math.floor(dk / 60)
  const m = Math.round(dk % 60)
  return `${s}:${String(m).padStart(2, '0')}`
}
const saatGoster = (i) => i ? new Date(i).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—'

// ── Excel süre sütunları ────────────────────────────────────────────────────
// Excel süreyi GÜN KESRİ olarak tutar (8sa30dk = 8.5/24). Hücreye [h]:mm
// biçimi verilince "8:30" görünür AMA sayı olarak kalır: SUM, ortalama,
// 24 saati aşan toplamlar hepsi çalışır. Metin "8:30" yazsaydık toplanamazdı —
// eskiden bu yüzden her sürenin yanına ayrı "... Dakika" sütunu konuyordu.
const sureDeger = (dk) => (Number(dk) || 0) / 1440
const SURE_BICIMI = '[h]:mm'   // köşeli parantez: 24 saati aşınca sıfırlanmaz

const sureBicimle = (ws, basliklar) => {
  if (!basliklar?.length || !ws['!ref']) return
  const aralik = XLSX.utils.decode_range(ws['!ref'])
  // Başlık satırı künyeden sonra geliyor; sabit indeks varsaymak yerine
  // aranan başlıkların geçtiği ilk satırı bul (künye satır sayısı değişebilir).
  let basSatir = -1
  const sutunlar = []
  for (let r = aralik.s.r; r <= aralik.e.r && basSatir < 0; r++) {
    for (let c = aralik.s.c; c <= aralik.e.c; c++) {
      const h = ws[XLSX.utils.encode_cell({ r, c })]
      if (h && basliklar.includes(h.v)) { basSatir = r; sutunlar.push(c) }
    }
  }
  if (basSatir < 0) return
  for (const c of sutunlar) {
    for (let r = basSatir + 1; r <= aralik.e.r; r++) {
      const hucre = ws[XLSX.utils.encode_cell({ r, c })]
      if (hucre && hucre.t === 'n') hucre.z = SURE_BICIMI
    }
  }
}

export default function MesaiRaporu() {
  const { toast } = useToast()
  const [aralikId, setAralikId] = useState('buhafta')
  const [baslangic, setBaslangic] = useState(iso(haftaBasi()))
  const [bitis, setBitis] = useState(bugun())
  const [kirilim, setKirilim] = useState('gunluk')
  const [personelId, setPersonelId] = useState('')
  const [personeller, setPersoneller] = useState([])
  const [kayitlar, setKayitlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  // Devam eden mesailerin süresi sayfa açıkken donmasın — dakika başı tazele.
  const [simdi, setSimdi] = useState(() => Date.now())

  useEffect(() => {
    const sayac = setInterval(() => setSimdi(Date.now()), 60000)
    return () => clearInterval(sayac)
  }, [])

  useEffect(() => {
    supabase.from('kullanicilar').select('id, ad, unvan').contains('moduller', ['mesai_takip']).order('ad')
      .then(({ data }) => setPersoneller(data || []))
  }, [])

  useEffect(() => {
    setYukleniyor(true)
    let q = supabase.from('mesai_kayitlari')
      .select('id, kullanici_id, giris_zamani, cikis_zamani, sure_dakika, giris_mesafe_m, not_, tip, kullanicilar(ad, unvan)')
      .gte('giris_zamani', `${baslangic}T00:00:00`)
      .lte('giris_zamani', `${bitis}T23:59:59`)
      .order('giris_zamani', { ascending: false })
      .limit(5000)
    if (personelId) q = q.eq('kullanici_id', personelId)
    q.then(({ data, error }) => {
      if (error) { console.error('[mesai raporu]', error.message); toast?.error?.('Mesai kayıtları alınamadı.') }
      setKayitlar(data || [])
      setYukleniyor(false)
    })
  }, [baslangic, bitis, personelId])   // eslint-disable-line react-hooks/exhaustive-deps

  const aralikSec = (id) => {
    const a = HAZIR_ARALIKLAR.find(x => x.id === id)
    setAralikId(id)
    if (a) { setBaslangic(a.bas()); setBitis(a.bit()) }
  }

  // Kişi × dönem kırılımı
  const ozet = useMemo(() => {
    const map = new Map()
    for (const k of kayitlar) {
      const { anahtar, etiket } = donemBilgi(k.giris_zamani, kirilim)
      const kisiId = k.kullanici_id
      const anahtarTam = `${anahtar}__${kisiId}`
      if (!map.has(anahtarTam)) {
        map.set(anahtarTam, {
          anahtar, etiket, kisiId,
          ad: k.kullanicilar?.ad || `#${kisiId}`,
          unvan: k.kullanicilar?.unvan || '',
          gun: new Set(), dakika: 0, normalDk: 0, fazlaDk: 0, fazlaKayit: 0,
          kayit: 0, devam: 0,
          ilkGiris: k.giris_zamani, sonCikis: k.cikis_zamani,
        })
      }
      const r = map.get(anahtarTam)
      const dk = kayitDakika(k, simdi)
      r.gun.add(iso(new Date(k.giris_zamani)))
      r.dakika += dk
      // Fazla mesai (mig 252) AYRI toplanır — puantajda farklı ücretlendirilir
      if (k.tip === 'fazla') { r.fazlaDk += dk; r.fazlaKayit += 1 } else { r.normalDk += dk }
      r.kayit += 1
      if (!k.cikis_zamani) r.devam += 1
      if (new Date(k.giris_zamani) < new Date(r.ilkGiris)) r.ilkGiris = k.giris_zamani
      if (k.cikis_zamani && (!r.sonCikis || new Date(k.cikis_zamani) > new Date(r.sonCikis))) r.sonCikis = k.cikis_zamani
    }
    return [...map.values()]
      .map(r => ({ ...r, gunSayisi: r.gun.size }))
      .sort((a, b) => (b.anahtar.localeCompare(a.anahtar)) || a.ad.localeCompare(b.ad, 'tr'))
  }, [kayitlar, kirilim, simdi])

  const kpi = useMemo(() => {
    const kisiler = new Set(kayitlar.map(k => k.kullanici_id))
    const gunler = new Set(kayitlar.map(k => iso(new Date(k.giris_zamani))))
    const toplamDk = kayitlar.reduce((t, k) => t + kayitDakika(k, simdi), 0)
    const devam = kayitlar.filter(k => !k.cikis_zamani).length
    // KİŞİ-GÜN: (personel × tarih) benzersiz çift sayısı. Ortalamanın doğru
    // paydası budur. Eskiden toplam süre TAKVİM GÜNÜNE bölünüyordu; 9 kişinin
    // toplamı 5 güne bölününce "günlük ortalama 12:14" çıkıyor ve tek kişi
    // günde 12 saat çalışmış gibi okunuyordu (01.08 bildirimi).
    const kisiGun = new Set(
      kayitlar.map(k => `${k.kullanici_id}__${iso(new Date(k.giris_zamani))}`)
    ).size
    // Fazla mesai TOPLAMI anlamlıdır (kişilerin normal süresini toplamanın
    // aksine): ödenecek ek ücretin karşılığı doğrudan bu rakamdır.
    const fazlaKayitlar = kayitlar.filter(k => k.tip === 'fazla')
    const fazlaDk = fazlaKayitlar.reduce((t, k) => t + kayitDakika(k, simdi), 0)
    return {
      kisi: kisiler.size,
      gun: gunler.size,
      kisiGun,
      fazlaSaat: saatBicim(fazlaDk),
      fazlaKayit: fazlaKayitlar.length,
      fazlaKisi: new Set(fazlaKayitlar.map(k => k.kullanici_id)).size,
      // Toplam süre KPI'ı KALDIRILDI: farklı kişilerin sürelerini toplamak
      // yönetsel bir anlam taşımıyordu (kullanıcı geri bildirimi 01.08).
      kisiBasiGunluk: kisiGun ? saatBicim(toplamDk / kisiGun) : '0:00',
      devam,
    }
  }, [kayitlar, simdi])

  const excelIndir = () => {
    if (!ozet.length) { toast?.warning?.('Dışa aktarılacak kayıt yok.'); return }
    const kirilimAd = KIRILIMLAR.find(k => k.id === kirilim)?.ad || ''
    // Web tablosuyla aynı mantık: günlük kırılımda o günün giriş/çıkış saati,
    // haftalık-aylıkta dönemin ilk girişi / son çıkışı (başlık da öyle söyler).
    const girisBaslik = kirilim === 'gunluk' ? 'Giriş' : 'İlk Giriş'
    const cikisBaslik = kirilim === 'gunluk' ? 'Çıkış' : 'Son Çıkış'
    const ozetSatir = ozet.map(r => ({
      Dönem: r.etiket,
      Personel: r.ad,
      Ünvan: r.unvan,
      'Gün Sayısı': r.gunSayisi,
      [girisBaslik]: saatGoster(r.ilkGiris),
      [cikisBaslik]: r.sonCikis ? saatGoster(r.sonCikis) : 'devam ediyor',
      // Normal ve fazla mesai farklı ücretlendirildiği için ayrı sütun.
      // Değerler GERÇEK SÜRE (Excel gün kesri) — sayfa yazılırken [h]:mm
      // biçimi veriliyor: "08:30" görünür ve SUM/ortalama çalışır.
      // (Eskiden metin "08:30" toplanamadığı için yanına ayrı "... Dakika"
      //  sütunu konmuştu; aynı bilgi iki kez yazılıyordu, kaldırıldı.)
      Normal: sureDeger(r.normalDk),
      'Fazla Mesai': sureDeger(r.fazlaDk),
      Toplam: sureDeger(r.dakika),
      // "Kayıt Adedi" + "Devam Eden" ikisi de sayı basıyordu ve günde tek giriş
      // olduğu için sütun baştan aşağı "1 / 1" çıkıyordu — bilgi taşımıyordu.
      // Sayı ekranla aynı ada geçti, durum metne çevrildi.
      'Mesai Girişi': r.kayit,
      Durum: r.devam === 0
        ? 'Tamamlandı'
        : (r.devam === r.kayit ? 'Devam ediyor (süre anlık)' : `${r.devam}/${r.kayit} devam ediyor`),
    }))
    const detaySatir = kayitlar.map(k => ({
      Tarih: new Date(k.giris_zamani).toLocaleDateString('tr-TR'),
      Personel: k.kullanicilar?.ad || '',
      Ünvan: k.kullanicilar?.unvan || '',
      Giriş: saatGoster(k.giris_zamani),
      // Çıkış sütunu zaten durumu söylüyor — ayrıca "Süre Durumu" sütunu
      // koymak aynı bilgiyi ikinci kez yazmak olurdu.
      Çıkış: k.cikis_zamani ? saatGoster(k.cikis_zamani) : 'devam ediyor',
      Tip: k.tip === 'fazla' ? 'FAZLA MESAİ' : 'Normal',
      Süre: sureDeger(kayitDakika(k, simdi)),
      'Ofise Mesafe (m)': k.giris_mesafe_m ?? '',
      Not: k.not_ ?? '',
    }))
    // KÜNYE (01.08): dosya adı aralığı yazıyordu ama kırılımı yazmıyordu.
    // Aylık aralık + Günlük kırılım seçilince Dönem sütununda tek gün çıkıyor
    // ve rapor hatalı sanılıyordu. Artık hangi ayarla alındığı sayfanın
    // başında açıkça yazıyor.
    const trTarih = (i) => new Date(i).toLocaleDateString('tr-TR')
    const kunye = [
      ['MESAİ RAPORU'],
      ['Tarih aralığı', `${trTarih(baslangic)} — ${trTarih(bitis)}`],
      ['Kırılım', `${kirilimAd} (Dönem sütunu bu kırılıma göre gruplanır)`],
      ['Personel', personelId ? (personeller.find(p => String(p.id) === String(personelId))?.ad || '') : 'Tümü'],
      ['Rapor alındı', new Date().toLocaleString('tr-TR')],
      [],
    ]
    const sayfaYaz = (satirlar, ad, sureBasliklari) => {
      const ws = XLSX.utils.aoa_to_sheet(kunye)
      XLSX.utils.sheet_add_json(ws, satirlar, { origin: -1 })
      sureBicimle(ws, sureBasliklari)
      XLSX.utils.book_append_sheet(wb, ws, ad)
    }
    const wb = XLSX.utils.book_new()
    sayfaYaz(ozetSatir, `Özet-${kirilimAd}`, ['Normal', 'Fazla Mesai', 'Toplam'])
    sayfaYaz(detaySatir, 'Detay', ['Süre'])
    // Kırılım dosya adına da girsin — indirilen dosyalar birbirine karışmasın
    XLSX.writeFile(wb, `mesai-raporu-${kirilimAd}-${baslangic}_${bitis}.xlsx`)
    toast?.success?.('Excel indirildi.')
  }

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <CalendarClock size={22} strokeWidth={1.8} style={{ color: 'var(--brand-primary)' }} />
        <h2 style={{ margin: 0, font: '700 20px/26px var(--font-sans)', color: 'var(--text-primary)' }}>Çalışma Saatleri</h2>
      </div>
      <p style={{ font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-tertiary)', margin: '0 0 16px' }}>
        QR ile mesai başlatan saha ekiplerinin çalışma saatleri. Devam eden mesailerde
        süre <strong>şu ana kadar</strong> hesaplanır ve <strong style={{ color: '#f59e0b' }}>+</strong> ile
        işaretlenir; 18:30'daki otomatik kapanışta bitiş <strong>18:00</strong> olarak yazılır
        (18:00–18:30 arası fazla mesai karar tamponudur, süreye sayılmaz).
      </p>

      {/* Filtreler */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {HAZIR_ARALIKLAR.map(a => (
            <button
              key={a.id}
              onClick={() => aralikSec(a.id)}
              style={{
                padding: '6px 12px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                border: `1px solid ${aralikId === a.id ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                background: aralikId === a.id ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                color: aralikId === a.id ? 'var(--brand-primary)' : 'var(--text-secondary)',
                font: '600 12.5px/18px var(--font-sans)',
              }}
            >{a.ad}</button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, alignItems: 'end' }}>
          <div>
            <Label>Başlangıç</Label>
            <Input type="date" value={baslangic} onChange={e => { setBaslangic(e.target.value); setAralikId('ozel') }} />
          </div>
          <div>
            <Label>Bitiş</Label>
            <Input type="date" value={bitis} onChange={e => { setBitis(e.target.value); setAralikId('ozel') }} />
          </div>
          <div>
            <Label>Kırılım</Label>
            <CustomSelect value={kirilim} onChange={e => setKirilim(e.target.value)}>
              {KIRILIMLAR.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
            </CustomSelect>
          </div>
          <div>
            <Label>Personel</Label>
            <CustomSelect value={personelId} onChange={e => setPersonelId(e.target.value)}>
              <option value="">Tümü ({personeller.length})</option>
              {personeller.map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
            </CustomSelect>
          </div>
          <div>
            <Button variant="secondary" onClick={excelIndir} iconLeft={<Download size={15} strokeWidth={1.5} />}>
              Excel
            </Button>
          </div>
        </div>
      </Card>

      {/* KPI şeridi */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { ikon: <Users size={15} />, etiket: 'PERSONEL', deger: kpi.kisi },
          { ikon: <CalendarDays size={15} />, etiket: 'ÇALIŞILAN GÜN', deger: kpi.gun },
          {
            ikon: <Clock size={15} />, etiket: 'KİŞİ BAŞI GÜNLÜK', deger: kpi.kisiBasiGunluk,
            ipucu: `Bir personelin ortalama günlük mesaisi (${kpi.kisiGun} kişi-gün üzerinden). Devam eden mesailer anlık süreyle girer, gün ilerledikçe yükselir.`,
          },
          {
            ikon: <Moon size={15} />, etiket: 'FAZLA MESAİ', deger: kpi.fazlaSaat,
            ipucu: `19:00'dan sonra başlatılan çalışma — ${kpi.fazlaKisi} personel, ${kpi.fazlaKayit} kayıt. Ayrı ücretlendirilir.`,
            vurgu: kpi.fazlaKayit > 0 ? '#f59e0b' : undefined,
          },
          { ikon: <CalendarClock size={15} />, etiket: 'DEVAM EDEN', deger: kpi.devam },
        ].map(k => (
          <Card key={k.etiket} style={{ padding: '12px 14px' }} title={k.ipucu}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-tertiary)', marginBottom: 4 }}>
              {k.ikon}
              <span style={{ font: '600 11px/14px var(--font-sans)', letterSpacing: 0.3 }}>{k.etiket}</span>
            </div>
            <div className="tabular-nums" style={{ font: '700 20px/26px var(--font-sans)', color: k.vurgu || 'var(--text-primary)' }}>
              {k.deger}
            </div>
          </Card>
        ))}
      </div>

      {/* Kırılım tablosu */}
      <Card padding={0}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ margin: 0, font: '600 15px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
            {KIRILIMLAR.find(k => k.id === kirilim)?.ad} Özet
          </h3>
          <span className="tabular-nums" style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
            ({ozet.length} satır · {kayitlar.length} kayıt)
          </span>
        </div>

        {yukleniyor ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Yükleniyor…</div>
        ) : ozet.length === 0 ? (
          <div style={{ padding: 28 }}>
            <EmptyState
              icon={<CalendarClock size={22} strokeWidth={1.5} />}
              title="Bu aralıkta mesai kaydı yok"
              description="Tarih aralığını genişletin veya personel filtresini kaldırın."
            />
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Dönem</TH>
                <TH>Personel</TH>
                <TH>Ünvan</TH>
                <TH>Gün</TH>
                {/* Günlük kırılımda o günün giriş/çıkışı; haftalık-aylıkta tek
                    saat olamayacağı için dönemin ilk girişi / son çıkışı. */}
                <TH title={kirilim === 'gunluk' ? 'Mesainin başlatıldığı saat (QR)' : 'Dönemdeki ilk mesai başlangıcı'}>
                  {kirilim === 'gunluk' ? 'Giriş' : 'İlk Giriş'}
                </TH>
                <TH title={kirilim === 'gunluk' ? 'Mesainin bitiş saati (otomatik kapanışta 18:00 yazılır)' : 'Dönemdeki son mesai bitişi'}>
                  {kirilim === 'gunluk' ? 'Çıkış' : 'Son Çıkış'}
                </TH>
                <TH title="19:00 öncesi başlayan normal çalışma">Normal</TH>
                <TH title="19:00 sonrası başlayan, ayrı ücretlendirilen çalışma">Fazla Mesai</TH>
                <TH>Toplam</TH>
                <TH>Günlük Ort.</TH>
                {/* "Kayıt" tek başına neyi saydığını söylemiyordu */}
                <TH title="O dönemde kaç kez mesai başlatıldı (QR okutuldu)">Mesai Girişi</TH>
              </TR>
            </THead>
            <TBody>
              {ozet.map(r => (
                <TR key={`${r.anahtar}-${r.kisiId}`}>
                  <TD style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{r.etiket}</TD>
                  <TD style={{ fontWeight: 600 }}>{r.ad}</TD>
                  <TD style={{ color: 'var(--text-tertiary)' }}>{r.unvan || '—'}</TD>
                  <TD className="tabular-nums">{r.gunSayisi}</TD>
                  <TD className="tabular-nums">{saatGoster(r.ilkGiris)}</TD>
                  <TD className="tabular-nums">
                    {r.sonCikis ? saatGoster(r.sonCikis) : (
                      <span style={{ color: '#f59e0b' }} title="Mesai hâlâ açık — 18:30'da otomatik kapanır">açık</span>
                    )}
                  </TD>
                  <TD className="tabular-nums">{r.normalDk > 0 ? saatBicim(r.normalDk) : '—'}</TD>
                  <TD className="tabular-nums" style={{ fontWeight: r.fazlaDk > 0 ? 700 : 400, color: r.fazlaDk > 0 ? '#f59e0b' : 'var(--text-tertiary)' }}>
                    {r.fazlaDk > 0 ? saatBicim(r.fazlaDk) : '—'}
                  </TD>
                  <TD className="tabular-nums" style={{ fontWeight: 700 }}>
                    {saatBicim(r.dakika)}
                    {r.devam > 0 && (
                      <span
                        title="Devam eden mesai var — süre şu ana kadar hesaplandı, 18:30 kapanışında kesinleşir"
                        style={{ marginLeft: 3, color: '#f59e0b', cursor: 'help' }}
                      >+</span>
                    )}
                  </TD>
                  <TD className="tabular-nums">{r.gunSayisi ? saatBicim(r.dakika / r.gunSayisi) : '—'}</TD>
                  {/* "1  1 devam" okunmuyordu (01.08): tek kayıt varken sayıyı iki
                      kez yazmak yerine rozet sadece durumu söylüyor. Kısmi
                      durumda (3 kayıt, 1'i açık) sayı korunuyor. */}
                  <TD className="tabular-nums">
                    {r.kayit}
                    {r.devam > 0 && (
                      <Badge
                        tone="beklemede"
                        style={{ marginLeft: 6 }}
                        title={r.devam === r.kayit
                          ? 'Mesai hâlâ açık — çıkış yapılmadı, 18:30\'da otomatik kapanır'
                          : `${r.kayit} kayıttan ${r.devam} tanesi hâlâ açık`}
                      >
                        {r.devam === r.kayit ? 'devam ediyor' : `${r.devam}'i devam`}
                      </Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
