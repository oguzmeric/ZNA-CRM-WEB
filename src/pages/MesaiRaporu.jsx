// Mesai Raporu (İK Yönetimi altı) — QR ile mesai başlatan saha ekiplerinin
// çalışma saatleri: GÜNLÜK / HAFTALIK / AYLIK kırılım + Excel dışa aktarma.
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
import { CalendarClock, Download, Users, Clock, CalendarDays } from 'lucide-react'
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
      .select('id, kullanici_id, giris_zamani, cikis_zamani, sure_dakika, giris_mesafe_m, not_, kullanicilar(ad, unvan)')
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
          gun: new Set(), dakika: 0, kayit: 0, devam: 0,
          ilkGiris: k.giris_zamani, sonCikis: k.cikis_zamani,
        })
      }
      const r = map.get(anahtarTam)
      r.gun.add(iso(new Date(k.giris_zamani)))
      r.dakika += kayitDakika(k, simdi)
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
    return {
      kisi: kisiler.size,
      gun: gunler.size,
      kisiGun,
      // Toplam süre KPI'ı KALDIRILDI: farklı kişilerin sürelerini toplamak
      // yönetsel bir anlam taşımıyordu (kullanıcı geri bildirimi 01.08).
      kisiBasiGunluk: kisiGun ? saatBicim(toplamDk / kisiGun) : '0:00',
      devam,
    }
  }, [kayitlar, simdi])

  const excelIndir = () => {
    if (!ozet.length) { toast?.warning?.('Dışa aktarılacak kayıt yok.'); return }
    const kirilimAd = KIRILIMLAR.find(k => k.id === kirilim)?.ad || ''
    const ozetSatir = ozet.map(r => ({
      Dönem: r.etiket,
      Personel: r.ad,
      Ünvan: r.unvan,
      'Gün Sayısı': r.gunSayisi,
      'Toplam Süre (sa:dk)': saatBicim(r.dakika),
      'Toplam Dakika': r.dakika,
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
      'Süre (sa:dk)': saatBicim(kayitDakika(k, simdi)),
      'Ofise Mesafe (m)': k.giris_mesafe_m ?? '',
      Not: k.not_ ?? '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ozetSatir), `Özet-${kirilimAd}`)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detaySatir), 'Detay')
    XLSX.writeFile(wb, `mesai-raporu-${baslangic}_${bitis}.xlsx`)
    toast?.success?.('Excel indirildi.')
  }

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <CalendarClock size={22} strokeWidth={1.8} style={{ color: 'var(--brand-primary)' }} />
        <h2 style={{ margin: 0, font: '700 20px/26px var(--font-sans)', color: 'var(--text-primary)' }}>Mesai Raporu</h2>
      </div>
      <p style={{ font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-tertiary)', margin: '0 0 16px' }}>
        QR ile mesai başlatan saha ekiplerinin çalışma saatleri. Devam eden mesailerde
        süre <strong>şu ana kadar</strong> hesaplanır ve <strong style={{ color: '#f59e0b' }}>+</strong> ile
        işaretlenir; 18:30'daki otomatik kapanışta kesinleşir.
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
          { ikon: <CalendarClock size={15} />, etiket: 'DEVAM EDEN', deger: kpi.devam },
        ].map(k => (
          <Card key={k.etiket} style={{ padding: '12px 14px' }} title={k.ipucu}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-tertiary)', marginBottom: 4 }}>
              {k.ikon}
              <span style={{ font: '600 11px/14px var(--font-sans)', letterSpacing: 0.3 }}>{k.etiket}</span>
            </div>
            <div className="tabular-nums" style={{ font: '700 20px/26px var(--font-sans)', color: 'var(--text-primary)' }}>
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
                <TH>Toplam Süre</TH>
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
