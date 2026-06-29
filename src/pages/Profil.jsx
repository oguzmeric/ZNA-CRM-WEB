import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  Save, LayoutDashboard, BarChart3, Settings, Check, AlertCircle,
  CheckCircle2, AlertTriangle, TrendingUp, Target, Award, Activity,
  ReceiptText, CheckSquare, Phone, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { teklifleriGetir } from '../services/teklifService'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { gorevleriGetir } from '../services/gorevService'
import { sifreDegistir as authSifreDegistir, kullaniciGirisKontrol } from '../services/kullaniciService'
import {
  Button, Input, Label, Card, CardTitle, Badge, Avatar, Alert, EmptyState,
} from '../components/ui'

const durumRenk = {
  cevrimici:  'var(--success)',
  mesgul:     'var(--danger)',
  disarida:   'var(--warning)',
  toplantida: 'var(--brand-primary)',
  cevrimdisi: 'var(--text-tertiary)',
}
const durumIsim = {
  cevrimici: 'Çevrimiçi', mesgul: 'Meşgul', disarida: 'Dışarıda',
  toplantida: 'Toplantıda', cevrimdisi: 'Çevrimdışı',
}

const saniyeFormat = (s) => {
  if (!s || s === 0) return '0 s'
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.floor(s / 60)} dk ${s % 60} s`
  return `${Math.floor(s / 3600)} sa ${Math.floor((s % 3600) / 60)} dk`
}

const BAR_RENK = ['var(--brand-primary)', 'var(--success)', 'var(--info)', 'var(--warning)', 'var(--danger)']

// Sparkline'li KPI kartı — sol tarafta deger, sağda mini son 6 ay grafigi
function KPIKarti({ Icon, renk, baslik, deger, altBilgi, buAy, gecenAy, spark }) {
  const fark = buAy - gecenAy
  const yon = fark > 0 ? 'up' : fark < 0 ? 'down' : 'flat'
  const YonIcon = yon === 'up' ? ArrowUpRight : yon === 'down' ? ArrowDownRight : Minus
  const yonRenk = yon === 'up' ? 'var(--success)' : yon === 'down' ? 'var(--danger)' : 'var(--text-tertiary)'

  // SVG sparkline
  const maxV = Math.max(1, ...spark)
  const W = 100, H = 36, gap = W / Math.max(spark.length - 1, 1)
  const pts = spark.map((v, i) => [i * gap, H - (v / maxV) * (H - 4) - 2])
  const polyline = pts.map(p => p.join(',')).join(' ')
  const areaPath = `M${pts[0][0]},${H} L${polyline.split(' ').join(' L')} L${pts[pts.length - 1][0]},${H} Z`

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 26, height: 26, borderRadius: 7, background: `color-mix(in srgb, ${renk} 14%, transparent)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: renk }}>
              <Icon size={14} strokeWidth={1.8} />
            </span>
            <span style={{ font: '600 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {baslik}
            </span>
          </div>
          <div style={{ font: '700 26px/30px var(--font-sans)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', marginBottom: 2 }}>
            {deger}
          </div>
          <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
            {altBilgi}
          </div>
          <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, background: `color-mix(in srgb, ${yonRenk} 12%, transparent)`, color: yonRenk, font: '600 11px/14px var(--font-sans)' }}>
            <YonIcon size={11} strokeWidth={2} />
            {fark === 0 ? 'değişim yok' : `${fark > 0 ? '+' : ''}${fark} bu ay`}
          </div>
        </div>
        <svg width={W} height={H} style={{ flexShrink: 0, opacity: 0.95 }}>
          <defs>
            <linearGradient id={`grad-${baslik}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={renk} stopOpacity="0.28" />
              <stop offset="100%" stopColor={renk} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#grad-${baslik})`} />
          <polyline points={polyline} fill="none" stroke={renk} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
          {pts.map((p, i) => i === pts.length - 1 && (
            <circle key={i} cx={p[0]} cy={p[1]} r="2.4" fill={renk} />
          ))}
        </svg>
      </div>
    </Card>
  )
}

// Yatay oran cubuğu
function OranSatiri({ label, yuzde, renk }) {
  const v = Math.max(0, Math.min(100, yuzde))
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ font: '700 15px/20px var(--font-sans)', color: renk, fontVariantNumeric: 'tabular-nums' }}>%{v}</span>
      </div>
      <div style={{ height: 6, background: 'var(--surface-sunken)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${v}%`, background: renk, borderRadius: 999, transition: 'width 360ms cubic-bezier(.2,.7,.3,1)' }} />
      </div>
    </div>
  )
}

function Profil() {
  const { kullanici, kullaniciGuncelle, durumGuncelle } = useAuth()
  const [aktifSekme, setAktifSekme] = useState('genel')
  const imzaFileRef = useRef(null)
  const [imzaYukleniyor, setImzaYukleniyor] = useState(false)
  const [imzaHata, setImzaHata] = useState(null)
  const [sifreDegistir, setSifreDegistir] = useState(false)
  const [form, setForm] = useState({
    ad: kullanici?.ad || '',
    kullaniciAdi: kullanici?.kullaniciAdi || '',
    mevcutSifre: '', yeniSifre: '', yeniSifreTekrar: '',
  })
  const [kaydetMesaj, setKaydetMesaj] = useState(null) // { tone, text }
  const [yukleniyor, setYukleniyor] = useState(true)

  const [teklifler, setTeklifler] = useState([])
  const [gorevler, setGorevler] = useState([])
  const [gorusmeler, setGorusmeler] = useState([])

  const aktiviteLoglari = JSON.parse(localStorage.getItem('aktiviteLog') || '[]')

  useEffect(() => {
    (async () => {
      setYukleniyor(true)
      try {
        const [t, g, gr] = await Promise.all([teklifleriGetir(), gorevleriGetir(), gorusmeleriGetir()])
        setTeklifler(t || []); setGorevler(g || []); setGorusmeler(gr || [])
      } catch (err) {
        console.error('[Profil yükle]', err)
      } finally {
        setYukleniyor(false)
      }
    })()
  }, [])

  const benimTeklifler  = teklifler.filter(t => t.hazirlayan === kullanici?.ad)
  const benimGorevler   = gorevler.filter(g => g.atanan === kullanici?.id?.toString())
  const benimGorusmeler = gorusmeler.filter(g => g.gorusen === kullanici?.ad)
  const benimLoglar     = aktiviteLoglari.filter(l => l.kullaniciId === kullanici?.id?.toString())

  const kabulOrani = benimTeklifler.length > 0
    ? Math.round((benimTeklifler.filter(t => t.onayDurumu === 'kabul').length / benimTeklifler.length) * 100)
    : 0

  const tamamlananGorevler = benimGorevler.filter(g => g.durum === 'tamamlandi').length
  const gorevTamamlamaOrani = benimGorevler.length > 0 ? Math.round((tamamlananGorevler / benimGorevler.length) * 100) : 0

  const toplamOnlineSure = benimLoglar.filter(l => l.tip === 'sayfa_cikis').reduce((s, l) => s + (l.sureSaniye || 0), 0)
  const toplamGiris = benimLoglar.filter(l => l.tip === 'kullanici_giris').length

  const sayfaSayilari = {}
  benimLoglar.filter(l => l.tip === 'sayfa_giris').forEach(l => {
    sayfaSayilari[l.sayfa] = (sayfaSayilari[l.sayfa] || 0) + 1
  })
  const enCokSayfalar = Object.entries(sayfaSayilari).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const sonGiris = benimLoglar.filter(l => l.tip === 'kullanici_giris').sort((a, b) => new Date(b.tarih) - new Date(a.tarih))[0]

  const buAyTeklif = benimTeklifler.filter(t => {
    const d = new Date(t.tarih); const b = new Date()
    return d.getMonth() === b.getMonth() && d.getFullYear() === b.getFullYear()
  }).length

  const fmtTL = (n) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })

  const imzaYukle = async (file) => {
    setImzaHata(null)
    if (!file.type.startsWith('image/')) { setImzaHata('Sadece görsel (JPG/PNG/WebP)'); return }
    if (file.size > 5 * 1024 * 1024) { setImzaHata('Dosya 5 MB\'ı aşıyor'); return }
    setImzaYukleniyor(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const yol = `kullanici-${kullanici.id}/profil-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('imzalar').upload(yol, file, {
        contentType: file.type || 'image/png',
        upsert: true,
      })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('imzalar').getPublicUrl(yol)
      await kullaniciGuncelle(kullanici.id, { imza: publicUrl })
      setKaydetMesaj({ tone: 'success', text: 'İmza güncellendi.' })
      setTimeout(() => setKaydetMesaj(null), 2500)
    } catch (e) {
      setImzaHata(e?.message || 'İmza yüklenemedi.')
    } finally {
      setImzaYukleniyor(false)
      if (imzaFileRef.current) imzaFileRef.current.value = ''
    }
  }

  const imzaKaldir = async () => {
    try {
      await kullaniciGuncelle(kullanici.id, { imza: null })
      setKaydetMesaj({ tone: 'success', text: 'İmza kaldırıldı.' })
      setTimeout(() => setKaydetMesaj(null), 2500)
    } catch (e) {
      setImzaHata(e?.message || 'Kaldırılamadı.')
    }
  }

  const bilgiKaydet = async () => {
    if (!form.ad || !form.kullaniciAdi) { setKaydetMesaj({ tone: 'danger', text: 'Ad ve kullanıcı adı zorunludur.' }); return }
    if (sifreDegistir) {
      if (form.yeniSifre !== form.yeniSifreTekrar) { setKaydetMesaj({ tone: 'danger', text: 'Yeni şifreler eşleşmiyor.' }); return }
      if (form.yeniSifre.length < 8) { setKaydetMesaj({ tone: 'danger', text: 'Şifre en az 8 karakter olmalı.' }); return }
      // Mevcut şifreyi doğrula: re-auth
      const dogrulama = await kullaniciGirisKontrol(kullanici.kullaniciAdi, form.mevcutSifre)
      if (!dogrulama) { setKaydetMesaj({ tone: 'danger', text: 'Mevcut şifre hatalı.' }); return }
      try {
        await authSifreDegistir(form.yeniSifre)
      } catch (e) {
        setKaydetMesaj({ tone: 'danger', text: 'Şifre güncellenemedi: ' + e.message }); return
      }
    }
    await kullaniciGuncelle(kullanici.id, { ad: form.ad, kullaniciAdi: form.kullaniciAdi })
    setKaydetMesaj({ tone: 'success', text: 'Bilgiler güncellendi.' })
    setSifreDegistir(false)
    setForm({ ...form, mevcutSifre: '', yeniSifre: '', yeniSifreTekrar: '' })
    setTimeout(() => setKaydetMesaj(null), 3000)
  }

  if (yukleniyor) return <div style={{ padding: 24 }}><EmptyState title="Yükleniyor…" /></div>

  const mevcutDurum = kullanici?.durum || 'cevrimici'

  const gecikmisGorevler = benimGorevler.filter(g => g.durum !== 'tamamlandi' && g.sonTarih && new Date(g.sonTarih) < new Date())

  return (
    <div style={{ padding: 24, maxWidth: 1040, margin: '0 auto' }}>

      {/* Profil kartı */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Avatar name={kullanici?.ad} size="lg" />
            <span
              aria-hidden
              style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 14, height: 14, borderRadius: '50%',
                background: durumRenk[mevcutDurum],
                border: '2px solid var(--surface-card)',
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="t-h1">{kullanici?.ad}</h1>
            <p className="t-caption" style={{ marginTop: 2 }}>@{kullanici?.kullaniciAdi}</p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, font: '500 12px/16px var(--font-sans)', color: durumRenk[mevcutDurum] }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: durumRenk[mevcutDurum] }} />
              {durumIsim[mevcutDurum]}
            </div>
          </div>

          {/* Hızlı durum değiştir */}
          <div style={{ display: 'flex', gap: 6 }}>
            {Object.entries(durumIsim).map(([key, isim]) => {
              const active = mevcutDurum === key
              return (
                <button
                  key={key}
                  onClick={() => durumGuncelle(key)}
                  title={isim}
                  aria-label={isim}
                  style={{
                    width: 28, height: 28,
                    borderRadius: '50%',
                    background: durumRenk[key],
                    border: active ? '2px solid var(--brand-primary)' : '2px solid var(--border-default)',
                    transform: active ? 'scale(1.15)' : 'scale(1)',
                    opacity: active ? 1 : 0.65,
                    cursor: 'pointer',
                    transition: 'all 120ms',
                  }}
                />
              )
            })}
          </div>
        </div>
      </Card>

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border-default)' }}>
        {[
          { id: 'genel',      isim: 'Genel Bakış',    C: LayoutDashboard },
          { id: 'istatistik', isim: 'İstatistikler',  C: BarChart3 },
          { id: 'ayarlar',    isim: 'Ayarlar',        C: Settings },
        ].map(s => {
          const aktif = aktifSekme === s.id
          const IconC = s.C
          return (
            <button
              key={s.id}
              onClick={() => setAktifSekme(s.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 14px',
                background: 'transparent', border: 'none',
                borderBottom: `2px solid ${aktif ? 'var(--brand-primary)' : 'transparent'}`,
                marginBottom: -1,
                color: aktif ? 'var(--brand-primary)' : 'var(--text-secondary)',
                font: aktif ? '600 13px/18px var(--font-sans)' : '500 13px/18px var(--font-sans)',
                cursor: 'pointer',
              }}
            >
              <IconC size={14} strokeWidth={1.5} />
              {s.isim}
            </button>
          )
        })}
      </div>

      {/* GENEL BAKIŞ */}
      {aktifSekme === 'genel' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {[
              { l: 'TOPLAM TEKLİF',  v: benimTeklifler.length, alt: `Bu ay: ${buAyTeklif}` },
              { l: 'KABUL ORANI',    v: `%${kabulOrani}`, alt: `${benimTeklifler.filter(t => t.onayDurumu === 'kabul').length} kabul`, c: 'var(--success)' },
              { l: 'GÖREV BAŞARISI', v: `%${gorevTamamlamaOrani}`, alt: `${tamamlananGorevler}/${benimGorevler.length} tamamlandı`, c: gorevTamamlamaOrani >= 60 ? 'var(--success)' : 'var(--warning)' },
              { l: 'GÖRÜŞMELER',     v: benimGorusmeler.length, alt: `${benimGorusmeler.filter(g => g.durum === 'acik').length} açık` },
            ].map(k => (
              <Card key={k.l}>
                <div className="t-label" style={{ marginBottom: 6 }}>{k.l}</div>
                <div style={{ font: '600 24px/1 var(--font-sans)', color: k.c || 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {k.v}
                </div>
                <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 6 }}>{k.alt}</div>
              </Card>
            ))}
          </div>

          {/* Sistem Aktivitesi */}
          <Card>
            <CardTitle>Sistem Aktivitesi</CardTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
              {[
                { l: 'TOPLAM GİRİŞ',        v: toplamGiris, c: 'var(--text-primary)' },
                { l: 'TOPLAM ONLİNE SÜRE',  v: saniyeFormat(toplamOnlineSure), c: 'var(--brand-primary)' },
                { l: 'SON GİRİŞ',           v: sonGiris
                    ? `${new Date(sonGiris.tarih).toLocaleDateString('tr-TR')} ${new Date(sonGiris.tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
                    : '—', c: 'var(--text-primary)' },
              ].map(i => (
                <div key={i.l} style={{
                  background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)', padding: '12px 14px',
                }}>
                  <div className="t-label" style={{ marginBottom: 4 }}>{i.l}</div>
                  <div style={{ font: '600 16px/22px var(--font-sans)', color: i.c, fontVariantNumeric: 'tabular-nums' }}>{i.v}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* En çok kullanılan sayfalar */}
          {enCokSayfalar.length > 0 && (
            <Card>
              <CardTitle>En Çok Kullandığım Sayfalar</CardTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                {enCokSayfalar.map(([sayfa, adet], i) => {
                  const maxAdet = enCokSayfalar[0][1]
                  const yuzde = Math.round((adet / maxAdet) * 100)
                  return (
                    <div key={sayfa}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{sayfa}</span>
                        <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                          {adet} ziyaret
                        </span>
                      </div>
                      <div style={{ width: '100%', height: 6, background: 'var(--surface-sunken)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{
                          width: `${yuzde}%`, height: '100%',
                          background: BAR_RENK[i], borderRadius: 3,
                          transition: 'width 300ms',
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* İSTATİSTİK */}
      {aktifSekme === 'istatistik' && (() => {
        // Tum hesaplamalar zaten yuklu veriden — DB hit yok
        const simdi = new Date()
        const buAyBaslangic = new Date(simdi.getFullYear(), simdi.getMonth(), 1)
        const oncekiAyBaslangic = new Date(simdi.getFullYear(), simdi.getMonth() - 1, 1)
        const oncekiAyBitis = buAyBaslangic

        const tarihAl = (x) => new Date(x?.tarih || x?.olusturmaTarihi || x?.olusturulmaTarihi || 0)
        const buAy = (x) => tarihAl(x) >= buAyBaslangic
        const gecenAy = (x) => { const d = tarihAl(x); return d >= oncekiAyBaslangic && d < oncekiAyBitis }

        // Son 6 ay teklif/gorev/gorusme histogrami
        const aylar = []
        for (let i = 5; i >= 0; i--) {
          const d = new Date(simdi.getFullYear(), simdi.getMonth() - i, 1)
          aylar.push({
            label: d.toLocaleDateString('tr-TR', { month: 'short' }),
            baslangic: d,
            bitis: new Date(d.getFullYear(), d.getMonth() + 1, 1),
          })
        }
        const aylikSay = (arr) => aylar.map(a =>
          arr.filter(x => { const d = tarihAl(x); return d >= a.baslangic && d < a.bitis }).length
        )
        const teklifAylik   = aylikSay(benimTeklifler)
        const gorevAylik    = aylikSay(benimGorevler)
        const gorusmeAylik  = aylikSay(benimGorusmeler)

        const kabulSayi = benimTeklifler.filter(t => t.onayDurumu === 'kabul').length
        const kabulTutar = benimTeklifler.filter(t => t.onayDurumu === 'kabul').reduce((s, t) => s + (t.genelToplam || 0), 0)
        const acikGorusme = benimGorusmeler.filter(g => g.durum === 'acik').length
        const buAyTeklifSayi = benimTeklifler.filter(buAy).length
        const gecenAyTeklifSayi = benimTeklifler.filter(gecenAy).length
        const buAyGorevSayi = benimGorevler.filter(buAy).length
        const gecenAyGorevSayi = benimGorevler.filter(gecenAy).length
        const buAyGorusmeSayi = benimGorusmeler.filter(buAy).length
        const gecenAyGorusmeSayi = benimGorusmeler.filter(gecenAy).length

        // En cok calistigi musteri (firmaAdi bazli)
        const firmaSay = {}
        ;[...benimTeklifler, ...benimGorusmeler].forEach(x => {
          const f = x.firmaAdi || x.musteriAd
          if (f) firmaSay[f] = (firmaSay[f] || 0) + 1
        })
        const enCokMusteri = Object.entries(firmaSay).sort((a, b) => b[1] - a[1]).slice(0, 3)

        // Son aktivite akisi
        const aktiviteler = [
          ...benimTeklifler.map(t => ({ tip: 'teklif', baslik: t.konu || t.teklifNo, ek: t.firmaAdi || '', tarih: tarihAl(t), durum: t.onayDurumu, link: `/teklifler/${t.id}` })),
          ...benimGorevler.map(g => ({ tip: 'gorev', baslik: g.baslik, ek: g.firmaAdi || '', tarih: tarihAl(g), durum: g.durum, link: `/gorevler/${g.id}` })),
          ...benimGorusmeler.map(g => ({ tip: 'gorusme', baslik: g.konu, ek: g.firmaAdi || g.musteriAd || '', tarih: tarihAl(g), durum: g.durum, link: `/gorusmeler/${g.id}` })),
        ].filter(a => a.tarih.getTime() > 0).sort((a, b) => b.tarih - a.tarih).slice(0, 8)

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Ust 3 KPI — sparkline'li */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <KPIKarti
                Icon={ReceiptText} renk="var(--brand-primary)"
                baslik="Teklif" deger={benimTeklifler.length}
                altBilgi={`${kabulSayi} kabul · ₺${fmtTL(kabulTutar)}`}
                buAy={buAyTeklifSayi} gecenAy={gecenAyTeklifSayi}
                spark={teklifAylik}
              />
              <KPIKarti
                Icon={CheckSquare} renk="var(--success)"
                baslik="Görev" deger={benimGorevler.length}
                altBilgi={`%${gorevTamamlamaOrani} tamamlandı`}
                buAy={buAyGorevSayi} gecenAy={gecenAyGorevSayi}
                spark={gorevAylik}
              />
              <KPIKarti
                Icon={Phone} renk="var(--info)"
                baslik="Görüşme" deger={benimGorusmeler.length}
                altBilgi={`${acikGorusme} açık`}
                buAy={buAyGorusmeSayi} gecenAy={gecenAyGorusmeSayi}
                spark={gorusmeAylik}
              />
            </div>

            {/* Performans + En cok musteri yan yana */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
              {/* Performans */}
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: 'color-mix(in srgb, var(--success) 14%, transparent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)' }}>
                    <Target size={16} strokeWidth={1.8} />
                  </span>
                  <CardTitle style={{ margin: 0 }}>Performans</CardTitle>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <OranSatiri label="Teklif kabul oranı" yuzde={kabulOrani} renk="var(--brand-primary)" />
                  <OranSatiri label="Görev tamamlanma oranı" yuzde={gorevTamamlamaOrani} renk="var(--success)" />
                  <OranSatiri
                    label="Görüşme kapanış oranı"
                    yuzde={benimGorusmeler.length > 0 ? Math.round((benimGorusmeler.filter(g => g.durum === 'kapali').length / benimGorusmeler.length) * 100) : 0}
                    renk="var(--info)"
                  />
                </div>
                {gecikmisGorevler.length > 0 && (
                  <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={14} strokeWidth={1.5} style={{ color: 'var(--danger)' }} />
                    <span style={{ font: '500 12.5px/16px var(--font-sans)', color: 'var(--danger)' }}>
                      <strong className="tabular-nums">{gecikmisGorevler.length}</strong> gecikmiş görev var
                    </span>
                  </div>
                )}
              </Card>

              {/* En cok calistigi musteri */}
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: 'color-mix(in srgb, var(--warning) 14%, transparent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--warning)' }}>
                    <Award size={16} strokeWidth={1.8} />
                  </span>
                  <CardTitle style={{ margin: 0 }}>En aktif müşteriler</CardTitle>
                </div>
                {enCokMusteri.length === 0 ? (
                  <p className="t-caption" style={{ margin: 0 }}>Henüz müşteri etkileşimin yok.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {enCokMusteri.map(([firma, say], i) => {
                      const tone = i === 0 ? 'var(--warning)' : i === 1 ? 'var(--brand-primary)' : 'var(--text-tertiary)'
                      return (
                        <div key={firma} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--surface-sunken)', borderRadius: 8 }}>
                          <span style={{ width: 22, height: 22, borderRadius: '50%', background: tone, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '700 11px/1 var(--font-sans)' }}>
                            {i + 1}
                          </span>
                          <span style={{ flex: 1, font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {firma}
                          </span>
                          <span style={{ font: '600 12px/16px var(--font-sans)', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                            {say} işlem
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            </div>

            {/* Son aktivite akisi */}
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: 'color-mix(in srgb, var(--info) 14%, transparent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--info)' }}>
                  <Activity size={16} strokeWidth={1.8} />
                </span>
                <CardTitle style={{ margin: 0 }}>Son aktivitelerim</CardTitle>
              </div>
              {aktiviteler.length === 0 ? (
                <p className="t-caption" style={{ margin: 0 }}>Henüz aktivite yok.</p>
              ) : (
                <div style={{ position: 'relative', paddingLeft: 18 }}>
                  <div style={{ position: 'absolute', left: 5, top: 4, bottom: 4, width: 1, background: 'var(--border-default)' }} />
                  {aktiviteler.map((a, i) => {
                    const tipMeta = a.tip === 'teklif' ? { Icon: ReceiptText, renk: 'var(--brand-primary)', isim: 'Teklif' }
                                  : a.tip === 'gorev' ? { Icon: CheckSquare, renk: 'var(--success)', isim: 'Görev' }
                                  : { Icon: Phone, renk: 'var(--info)', isim: 'Görüşme' }
                    const TI = tipMeta.Icon
                    const fark = simdi - a.tarih
                    const gunCevir = fark < 86400000 ? 'Bugün'
                                   : fark < 172800000 ? 'Dün'
                                   : fark < 604800000 ? `${Math.floor(fark / 86400000)} gün önce`
                                   : a.tarih.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
                    return (
                      <div key={i} style={{ position: 'relative', paddingBottom: i < aktiviteler.length - 1 ? 12 : 0 }}>
                        <span style={{
                          position: 'absolute', left: -16, top: 2,
                          width: 11, height: 11, borderRadius: '50%',
                          background: 'var(--surface-card)',
                          border: `2px solid ${tipMeta.renk}`,
                        }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <TI size={12} strokeWidth={1.5} style={{ color: tipMeta.renk }} />
                          <Badge tone="neutral">{tipMeta.isim}</Badge>
                          <span style={{ font: '400 11.5px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                            {gunCevir}
                          </span>
                        </div>
                        <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{a.baslik || '—'}</div>
                        {a.ek && (
                          <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>{a.ek}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            {gecikmisGorevler.length > 0 && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--danger-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }}>
                    <AlertTriangle size={16} strokeWidth={1.8} />
                  </span>
                  <CardTitle style={{ margin: 0, color: 'var(--danger)' }}>Gecikmiş görevler</CardTitle>
                </div>
                <div>
                  {gecikmisGorevler.map(g => (
                    <div key={g.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 0', borderBottom: '1px solid var(--border-default)',
                      font: '400 13px/18px var(--font-sans)',
                    }}>
                      <span style={{ color: 'var(--text-primary)' }}>{g.baslik}</span>
                      <span style={{ color: 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>{g.sonTarih}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )
      })()}

      {/* AYARLAR */}
      {aktifSekme === 'ayarlar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card>
            <CardTitle>Kişisel Bilgiler</CardTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, marginTop: 16 }}>
              <div>
                <Label>Ad Soyad</Label>
                <Input value={form.ad} onChange={e => setForm({ ...form, ad: e.target.value })} />
              </div>
              <div>
                <Label>Kullanıcı adı</Label>
                <Input value={form.kullaniciAdi} onChange={e => setForm({ ...form, kullaniciAdi: e.target.value })} />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={sifreDegistir}
                  onChange={e => setSifreDegistir(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--brand-primary)' }}
                />
                <span style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>Şifre değiştir</span>
              </label>
            </div>

            {sifreDegistir && (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12,
                padding: 16, marginTop: 12,
                background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
              }}>
                <div>
                  <Label>Mevcut şifre</Label>
                  <Input type="password" value={form.mevcutSifre} onChange={e => setForm({ ...form, mevcutSifre: e.target.value })} placeholder="••••••••" />
                </div>
                <div>
                  <Label>Yeni şifre</Label>
                  <Input type="password" value={form.yeniSifre} onChange={e => setForm({ ...form, yeniSifre: e.target.value })} placeholder="••••••••" />
                </div>
                <div>
                  <Label>Yeni şifre tekrar</Label>
                  <Input type="password" value={form.yeniSifreTekrar} onChange={e => setForm({ ...form, yeniSifreTekrar: e.target.value })} placeholder="••••••••" />
                </div>
              </div>
            )}

            {kaydetMesaj && (
              <Alert variant={kaydetMesaj.tone} style={{ marginTop: 16 }}>{kaydetMesaj.text}</Alert>
            )}

            <div style={{ marginTop: 16 }}>
              <Button variant="primary" iconLeft={<Save size={14} strokeWidth={1.5} />} onClick={bilgiKaydet}>
                Kaydet
              </Button>
            </div>
          </Card>

          <Card>
            <CardTitle>İmza</CardTitle>
            <p className="t-caption" style={{ marginTop: 4, marginBottom: 12 }}>
              Sipariş onaylarında ve resmi belgelerde kullanılacak imza görseli.
            </p>
            <div style={{
              border: '2px dashed var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: 20,
              background: kullanici?.imza ? 'var(--surface-card)' : 'var(--surface-sunken)',
              textAlign: 'center',
            }}>
              {kullanici?.imza ? (
                <>
                  <img
                    src={kullanici.imza}
                    alt="İmza"
                    style={{
                      maxHeight: 120, maxWidth: 360,
                      background: '#fff',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6, padding: 8,
                      marginBottom: 12,
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <Button variant="secondary" onClick={() => imzaFileRef.current?.click()} disabled={imzaYukleniyor}>
                      Değiştir
                    </Button>
                    <Button variant="tertiary" onClick={imzaKaldir}>Kaldır</Button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', marginBottom: 12 }}>
                    Henüz bir imza yüklemedin. JPG / PNG / WebP, en fazla 5 MB.
                  </div>
                  <Button variant="primary" onClick={() => imzaFileRef.current?.click()} disabled={imzaYukleniyor}>
                    {imzaYukleniyor ? 'Yükleniyor…' : 'İmza Yükle'}
                  </Button>
                </>
              )}
              <input
                ref={imzaFileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={e => { const f = e.target.files?.[0]; if (f) imzaYukle(f) }}
              />
            </div>
            {imzaHata && (
              <Alert variant="danger" style={{ marginTop: 12 }}>{imzaHata}</Alert>
            )}
          </Card>

          <Card>
            <CardTitle>Durum Ayarları</CardTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginTop: 16 }}>
              {Object.entries(durumIsim).map(([key, isim]) => {
                const active = mevcutDurum === key
                return (
                  <button
                    key={key}
                    onClick={() => durumGuncelle(key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                      background: active ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: durumRenk[key], flexShrink: 0 }} />
                    <span style={{ flex: 1, font: '400 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{isim}</span>
                    {active && <Check size={14} strokeWidth={2} style={{ color: 'var(--brand-primary)' }} />}
                  </button>
                )
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default Profil
