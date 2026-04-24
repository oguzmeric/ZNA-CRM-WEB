import { useState, useEffect } from 'react'
import {
  Save, LayoutDashboard, BarChart3, Settings, Check, AlertCircle,
  CheckCircle2, AlertTriangle,
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

function Profil() {
  const { kullanici, kullaniciGuncelle, durumGuncelle } = useAuth()
  const [aktifSekme, setAktifSekme] = useState('genel')
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
      {aktifSekme === 'istatistik' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Teklif */}
          <Card>
            <CardTitle>Teklif İstatistikleri</CardTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginTop: 16 }}>
              {[
                { l: 'Toplam',       v: benimTeklifler.length, c: 'var(--text-primary)' },
                { l: 'Kabul',        v: benimTeklifler.filter(t => t.onayDurumu === 'kabul').length, c: 'var(--success)' },
                { l: 'Takipte',      v: benimTeklifler.filter(t => t.onayDurumu === 'takipte').length, c: 'var(--info)' },
                { l: 'Vazgeçildi',   v: benimTeklifler.filter(t => t.onayDurumu === 'vazgecildi').length, c: 'var(--danger)' },
              ].map(i => (
                <div key={i.l} style={{ textAlign: 'center' }}>
                  <div style={{ font: '600 24px/1 var(--font-sans)', color: i.c, fontVariantNumeric: 'tabular-nums' }}>{i.v}</div>
                  <div className="t-caption" style={{ marginTop: 4 }}>{i.l}</div>
                </div>
              ))}
            </div>
            {benimTeklifler.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
                <div className="t-label" style={{ marginBottom: 4 }}>KABUL EDİLEN TOPLAM TUTAR</div>
                <div style={{ font: '600 24px/1 var(--font-sans)', color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>
                  ₺{fmtTL(benimTeklifler.filter(t => t.onayDurumu === 'kabul').reduce((s, t) => s + (t.genelToplam || 0), 0))}
                </div>
              </div>
            )}
          </Card>

          {/* Görev */}
          <Card>
            <CardTitle>Görev İstatistikleri</CardTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginTop: 16 }}>
              {[
                { l: 'Toplam',       v: benimGorevler.length, c: 'var(--text-primary)' },
                { l: 'Tamamlandı',   v: tamamlananGorevler, c: 'var(--success)' },
                { l: 'Devam Ediyor', v: benimGorevler.filter(g => g.durum === 'devam').length, c: 'var(--info)' },
                { l: 'Bekliyor',     v: benimGorevler.filter(g => g.durum === 'bekliyor').length, c: 'var(--warning)' },
              ].map(i => (
                <div key={i.l} style={{ textAlign: 'center' }}>
                  <div style={{ font: '600 24px/1 var(--font-sans)', color: i.c, fontVariantNumeric: 'tabular-nums' }}>{i.v}</div>
                  <div className="t-caption" style={{ marginTop: 4 }}>{i.l}</div>
                </div>
              ))}
            </div>

            {gecikmisGorevler.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
                <p style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '500 13px/18px var(--font-sans)', color: 'var(--danger)', marginBottom: 8 }}>
                  <AlertTriangle size={14} strokeWidth={1.5} />
                  <span className="tabular-nums">{gecikmisGorevler.length}</span> gecikmiş görev
                </p>
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
              </div>
            )}
          </Card>

          {/* Görüşme */}
          <Card>
            <CardTitle>Görüşme İstatistikleri</CardTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 16 }}>
              {[
                { l: 'Toplam', v: benimGorusmeler.length, c: 'var(--text-primary)' },
                { l: 'Açık',   v: benimGorusmeler.filter(g => g.durum === 'acik').length, c: 'var(--info)' },
                { l: 'Kapalı', v: benimGorusmeler.filter(g => g.durum === 'kapali').length, c: 'var(--success)' },
              ].map(i => (
                <div key={i.l} style={{ textAlign: 'center' }}>
                  <div style={{ font: '600 24px/1 var(--font-sans)', color: i.c, fontVariantNumeric: 'tabular-nums' }}>{i.v}</div>
                  <div className="t-caption" style={{ marginTop: 4 }}>{i.l}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

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
