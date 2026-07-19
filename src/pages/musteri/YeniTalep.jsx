import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Check, ChevronRight, CheckCircle2, ClipboardList,
  Paperclip, Upload, FileText, Image as ImageIcon, X,
  AlertTriangle, MessageSquare, Search, Wrench, Briefcase, GraduationCap,
} from 'lucide-react'

// Talep türü için lucide icon + kısa açıklama (müşterinin doğru türü seçmesi için)
const TUR_META = {
  ariza:  { Ikon: AlertTriangle,  aciklama: 'Mevcut bir sorun ya da kesinti bildirimi' },
  talep:  { Ikon: MessageSquare,  aciklama: 'Yeni bir hizmet veya iş isteği' },
  kesif:  { Ikon: Search,         aciklama: 'Yerinde inceleme ve durum tespiti' },
  bakim:  { Ikon: Wrench,         aciklama: 'Periyodik veya planlı bakım hizmeti' },
  teklif: { Ikon: Briefcase,      aciklama: 'Fiyat veya hizmet teklifi talebi' },
  egitim: { Ikon: GraduationCap,  aciklama: 'Kullanım veya bilgilendirme eğitimi' },
}
import { useAuth } from '../../context/AuthContext'
import { useServisTalebi } from '../../context/ServisTalebiContext'
import { uygunZamanFormat } from '../../lib/uygunZamanFormat'
import {
  Button, Input, Textarea, Label, Card, Badge, EmptyState, TarihSaatSecici,
} from '../../components/ui'

const ACIL_TONE = { acil: 'kayip', yuksek: 'beklemede', normal: 'lead', dusuk: 'neutral' }

const bosForm = {
  anaTur: '', altKategori: '', konu: '', lokasyon: '', cihazTuru: '',
  aciklama: '', aciliyet: 'normal', ilgiliKisi: '', telefon: '', email: '', uygunZaman: '',
}

export default function YeniTalep() {
  const { kullanici } = useAuth()
  const { talepOlustur, dosyaYukle, ANA_TURLER, ALT_KATEGORILER, ACILIYET_SEVIYELERI } = useServisTalebi()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [form, setForm] = useState({ ...bosForm, ilgiliKisi: kullanici?.ad || '' })
  const [gonderildi, setGonderildi] = useState(false)
  const [hata, setHata] = useState({})
  const [adim, setAdim] = useState(1)
  // Auto-scroll için ref'ler — müşteri tür seçince devamına bakmadan bırakmasın
  const altKategoriRef = useRef(null)
  const devamButonRef = useRef(null)

  // Tür değişince alt kategori bölümüne yumuşakça kaydır
  useEffect(() => {
    if (adim !== 1 || !form.anaTur) return
    const t = setTimeout(() => {
      altKategoriRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 200)
    return () => clearTimeout(t)
  }, [form.anaTur, adim])

  // Alt kategori seçilince devam butonuna kaydır
  useEffect(() => {
    if (adim !== 1 || !form.altKategori) return
    const t = setTimeout(() => {
      devamButonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 200)
    return () => clearTimeout(t)
  }, [form.altKategori, adim])
  const [yeniDosyalar, setYeniDosyalar] = useState([])
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [gonderHata, setGonderHata] = useState('')

  const izinliTurler = kullanici?.izinliTurler
  const filtreliTurler = izinliTurler && izinliTurler.length > 0
    ? ANA_TURLER.filter(t => izinliTurler.includes(t.id))
    : ANA_TURLER

  useEffect(() => {
    const tur = searchParams.get('tur')
    if (tur && filtreliTurler.find(t => t.id === tur)) {
      setForm(prev => ({ ...prev, anaTur: tur }))
      setAdim(2)
    }
  }, [])

  const altKategoriler = form.anaTur ? ALT_KATEGORILER[form.anaTur] || [] : []

  const guncelle = (alan, deger) => {
    setForm(prev => {
      const yeni = { ...prev, [alan]: deger }
      if (alan === 'anaTur') yeni.altKategori = ''
      return yeni
    })
    if (hata[alan]) setHata(prev => ({ ...prev, [alan]: '' }))
  }

  const gorselMi = (f) => (f?.type || '').startsWith('image/') || (f?.type || '').startsWith('video/')

  const dogrula = () => {
    const e = {}
    if (!form.anaTur) e.anaTur = 'Talep türü seçiniz'
    if (!form.altKategori) e.altKategori = 'Alt kategori seçiniz'
    if (!form.konu.trim()) e.konu = 'Konu başlığı giriniz'
    if (!form.aciklama.trim()) e.aciklama = 'Açıklama giriniz'
    if (yeniDosyalar.length === 0 || !yeniDosyalar.some(gorselMi)) {
      e.dosya = 'En az bir fotoğraf veya video eklemelisiniz'
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      e.email = 'Geçerli bir e-posta giriniz'
    }
    setHata(e)
    return Object.keys(e).length === 0
  }

  const gonder = async () => {
    setGonderHata('')
    if (!dogrula()) return
    setGonderiliyor(true)
    try {
      const talep = await talepOlustur(form, kullanici)
      if (!talep?.id) throw new Error('Talep oluşturulamadı (kayıt sistemi yanıt vermedi).')
      // Dosyaları sırayla yükle
      for (const f of yeniDosyalar) {
        try { await dosyaYukle(talep.id, f, kullanici.ad) }
        catch (e) { console.error('[dosya]', f.name, e) }
      }
      setGonderildi(true)
      setTimeout(() => navigate(`/musteri-portal/talep/${talep.id}`), 1500)
    } catch (e) {
      console.error('[gonder]', e)
      const mesaj = e?.message || 'Bilinmeyen hata. Lütfen tekrar deneyin.'
      setGonderHata(mesaj)
      setGonderiliyor(false)
    }
  }

  const boyutFormatla = (bytes) => {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  if (gonderildi) {
    return (
      <div style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--success)',
          color: '#fff',
          marginBottom: 20,
          boxShadow: 'var(--shadow-lg)',
        }}>
          <CheckCircle2 size={40} strokeWidth={2} />
        </div>
        <h2 style={{ font: '600 22px/28px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 8 }}>
          Talebiniz Alındı
        </h2>
        <p style={{ font: '400 14px/20px var(--font-sans)', color: 'var(--text-secondary)' }}>
          En kısa sürede ekibimiz sizinle iletişime geçecektir.
        </p>
      </div>
    )
  }

  const ADIMLAR = [
    { no: 1, isim: 'Talep Türü' },
    { no: 2, isim: 'Detaylar' },
    { no: 3, isim: 'İletişim' },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>

      {/* Geri + başlık */}
      <button
        onClick={() => navigate('/musteri-portal')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--text-tertiary)', font: '500 13px/18px var(--font-sans)',
          marginBottom: 12,
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-primary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
      >
        <ArrowLeft size={14} strokeWidth={1.5} /> Geri dön
      </button>
      <h1 className="t-h1">Yeni Talep Oluştur</h1>
      <p className="t-caption" style={{ marginTop: 4, marginBottom: 20 }}>
        Talebinizi aşağıdaki formu doldurarak iletebilirsiniz.
      </p>

      <Card padding={0}>
        {/* Adım göstergesi */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--surface-sunken)',
        }}>
          {ADIMLAR.map(a => {
            const aktif = a.no === adim
            const tamamlandi = a.no < adim
            return (
              <button
                key={a.no}
                onClick={() => tamamlandi && setAdim(a.no)}
                style={{
                  flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${aktif ? 'var(--brand-primary)' : 'transparent'}`,
                  marginBottom: -1,
                  color: aktif ? 'var(--brand-primary)' : tamamlandi ? 'var(--success)' : 'var(--text-tertiary)',
                  font: aktif ? '600 13px/18px var(--font-sans)' : '500 13px/18px var(--font-sans)',
                  cursor: tamamlandi ? 'pointer' : 'default',
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: '50%',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: aktif ? 'var(--brand-primary)' : tamamlandi ? 'var(--success)' : 'var(--border-default)',
                  color: aktif || tamamlandi ? '#fff' : 'var(--text-tertiary)',
                  font: '600 11px/1 var(--font-sans)',
                }}>
                  {tamamlandi ? <Check size={12} strokeWidth={2.5} /> : a.no}
                </span>
                <span>{a.isim}</span>
              </button>
            )
          })}
        </div>

        <div style={{ padding: 28 }}>

          {/* ADIM 1 */}
          {adim === 1 && (
            <div>
              <h2 className="t-h2" style={{ marginBottom: 4 }}>Talep Türünü Seçin</h2>
              <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-tertiary)', margin: '0 0 22px' }}>
                Oluşturmak istediğiniz talebin türünü belirleyin.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
                {filtreliTurler.map(tur => {
                  const secili = form.anaTur === tur.id
                  const meta = TUR_META[tur.id] || { Ikon: ClipboardList, aciklama: '' }
                  const Ikon = meta.Ikon
                  return (
                    <button
                      key={tur.id}
                      onClick={() => guncelle('anaTur', tur.id)}
                      onMouseEnter={(e) => {
                        if (secili) return
                        e.currentTarget.style.borderColor = tur.renk
                        e.currentTarget.style.transform = 'translateY(-4px)'
                        e.currentTarget.style.boxShadow = `0 14px 30px -18px ${tur.renk}b3`
                        e.currentTarget.querySelector('[data-icon-wrap]').style.background = tur.renk
                        e.currentTarget.querySelector('[data-icon-wrap]').style.color = '#fff'
                      }}
                      onMouseLeave={(e) => {
                        if (secili) return
                        e.currentTarget.style.borderColor = 'var(--border-default)'
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = 'none'
                        e.currentTarget.querySelector('[data-icon-wrap]').style.background = tur.bg
                        e.currentTarget.querySelector('[data-icon-wrap]').style.color = tur.renk
                      }}
                      style={{
                        position: 'relative',
                        padding: '22px 18px 20px',
                        borderRadius: 14,
                        background: secili ? `color-mix(in srgb, ${tur.renk} 5%, var(--surface-card))` : 'var(--surface-card)',
                        border: `1.5px solid ${secili ? tur.renk : 'var(--border-default)'}`,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'transform 280ms cubic-bezier(.2,.7,.3,1), box-shadow 280ms, border-color 250ms, background 250ms',
                        boxShadow: secili ? `0 16px 34px -20px ${tur.renk}d9` : 'none',
                        outline: 'none',
                        fontFamily: 'inherit',
                      }}
                    >
                      {/* Selected check badge — sağ üst */}
                      <span
                        style={{
                          position: 'absolute',
                          top: 13, right: 13,
                          width: 23, height: 23, borderRadius: '50%',
                          background: tur.renk, color: '#fff',
                          display: 'grid', placeItems: 'center',
                          transform: secili ? 'scale(1)' : 'scale(0)',
                          transition: 'transform 300ms cubic-bezier(.34,1.56,.64,1)',
                        }}
                      >
                        <Check size={13} strokeWidth={3.2} />
                      </span>

                      {/* Icon container */}
                      <div
                        data-icon-wrap
                        style={{
                          width: 50, height: 50,
                          borderRadius: 13,
                          display: 'grid', placeItems: 'center',
                          background: secili ? tur.renk : tur.bg,
                          color: secili ? '#fff' : tur.renk,
                          marginBottom: 16,
                          transform: secili ? 'scale(1.04)' : 'scale(1)',
                          transition: 'all 300ms cubic-bezier(.2,.7,.3,1)',
                        }}
                      >
                        <Ikon size={25} strokeWidth={1.7} />
                      </div>

                      {/* İsim */}
                      <div style={{
                        font: '700 16px/20px var(--font-sans)',
                        letterSpacing: '-0.01em',
                        color: 'var(--text-primary)',
                        marginBottom: 3,
                      }}>
                        {tur.isim}
                      </div>

                      {/* Açıklama */}
                      <div style={{
                        font: '400 12.5px/17px var(--font-sans)',
                        color: 'var(--text-tertiary)',
                      }}>
                        {meta.aciklama}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Footer indicator — "Seçilen tür: X" */}
              {form.anaTur && (() => {
                const seciliTur = filtreliTurler.find(t => t.id === form.anaTur)
                if (!seciliTur) return null
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px',
                    marginBottom: 16,
                    borderRadius: 999,
                    background: `color-mix(in srgb, ${seciliTur.renk} 12%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${seciliTur.renk} 28%, transparent)`,
                    color: seciliTur.renk,
                    font: '600 13px/16px var(--font-sans)',
                    width: 'fit-content',
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: seciliTur.renk,
                    }} />
                    Seçilen tür: <b style={{ fontWeight: 700 }}>{seciliTur.isim}</b>
                  </div>
                )
              })()}
              {hata.anaTur && <p style={{ color: 'var(--danger)', font: '500 12px/16px var(--font-sans)', marginBottom: 12 }}>{hata.anaTur}</p>}

              {form.anaTur && (
                <div ref={altKategoriRef} style={{ scrollMarginTop: 80 }}>
                  <h3 className="t-h2" style={{ marginBottom: 12 }}>Alt Kategori Seçin</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 12 }}>
                    {altKategoriler.map(kat => {
                      const secili = form.altKategori === kat.id
                      return (
                        <button
                          key={kat.id}
                          onClick={() => guncelle('altKategori', kat.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '10px 14px',
                            borderRadius: 'var(--radius-sm)',
                            background: secili ? 'var(--brand-primary-soft)' : 'var(--surface-sunken)',
                            border: `1px solid ${secili ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                            color: secili ? 'var(--brand-primary)' : 'var(--text-secondary)',
                            font: secili ? '600 13px/18px var(--font-sans)' : '400 13px/18px var(--font-sans)',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <span style={{
                            width: 14, height: 14, borderRadius: '50%',
                            border: `2px solid ${secili ? 'var(--brand-primary)' : 'var(--border-strong)'}`,
                            background: secili ? 'var(--brand-primary)' : 'transparent',
                            boxShadow: secili ? 'inset 0 0 0 2px var(--surface-card)' : 'none',
                            flexShrink: 0,
                          }} />
                          {kat.isim}
                        </button>
                      )
                    })}
                  </div>
                  {hata.altKategori && <p style={{ color: 'var(--danger)', font: '500 12px/16px var(--font-sans)', marginBottom: 12 }}>{hata.altKategori}</p>}
                </div>
              )}

              {/* Hazır mı banner — alt kategori seçilince çıkar, müşteriyi devamına yönlendirir */}
              {form.anaTur && form.altKategori && (
                <div
                  ref={devamButonRef}
                  style={{
                    scrollMarginTop: 80,
                    marginTop: 24,
                    padding: '18px 20px',
                    borderRadius: 14,
                    background: 'linear-gradient(135deg, var(--brand-primary-soft), var(--surface-card))',
                    border: '1.5px solid var(--brand-primary)',
                    display: 'flex', alignItems: 'center', gap: 16,
                    flexWrap: 'wrap',
                    boxShadow: '0 12px 30px -20px var(--brand-primary)',
                    animation: 'talepDevamSlideIn 350ms cubic-bezier(.2,.7,.3,1)',
                  }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: 'var(--brand-primary)', color: '#fff',
                    display: 'grid', placeItems: 'center',
                    flexShrink: 0,
                    boxShadow: '0 4px 12px var(--brand-primary)',
                  }}>
                    <Check size={18} strokeWidth={3} />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ font: '700 14px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                      Harika, seçimlerin hazır!
                    </div>
                    <div style={{ font: '400 12.5px/17px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                      Sonraki adımda talebinizin detaylarını gireceksiniz.
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const e = {}
                      if (!form.anaTur) e.anaTur = 'Talep türü seçiniz'
                      if (!form.altKategori) e.altKategori = 'Alt kategori seçiniz'
                      if (Object.keys(e).length > 0) { setHata(e); return }
                      setAdim(2)
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      padding: '12px 22px',
                      borderRadius: 10,
                      background: 'var(--brand-primary)',
                      color: '#fff',
                      border: 'none',
                      cursor: 'pointer',
                      font: '700 14.5px/18px var(--font-sans)',
                      boxShadow: '0 10px 22px -10px var(--brand-primary)',
                      transition: 'transform 250ms, box-shadow 250ms',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 16px 30px -12px var(--brand-primary)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 10px 22px -10px var(--brand-primary)' }}
                  >
                    Sonraki Adım
                    <ChevronRight size={16} strokeWidth={2.5} />
                  </button>
                </div>
              )}

              {/* Eğer henüz seçim yoksa veya sadece tür seçildiyse — eski Devam butonu sade */}
              {(!form.anaTur || !form.altKategori) && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <Button
                    variant="primary"
                    iconRight={<ChevronRight size={14} strokeWidth={1.5} />}
                    disabled={!form.anaTur || !form.altKategori}
                    onClick={() => {
                      const e = {}
                      if (!form.anaTur) e.anaTur = 'Talep türü seçiniz'
                      if (!form.altKategori) e.altKategori = 'Alt kategori seçiniz'
                      if (Object.keys(e).length > 0) { setHata(e); return }
                      setAdim(2)
                    }}
                  >
                    Devam
                  </Button>
                </div>
              )}

              {/* Animasyon keyframe */}
              <style>{`
                @keyframes talepDevamSlideIn {
                  from { opacity: 0; transform: translateY(12px); }
                  to   { opacity: 1; transform: translateY(0); }
                }
              `}</style>
            </div>
          )}

          {/* ADIM 2 */}
          {adim === 2 && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <Label required>Konu başlığı</Label>
                  <Input
                    value={form.konu}
                    onChange={e => guncelle('konu', e.target.value)}
                    placeholder="Talebinizi kısaca özetleyin"
                    style={hata.konu ? { borderColor: 'var(--danger)' } : {}}
                  />
                  {hata.konu && <p style={{ color: 'var(--danger)', font: '500 11px/16px var(--font-sans)', marginTop: 4 }}>{hata.konu}</p>}
                </div>

                <div>
                  <Label required>Açıklama</Label>
                  <Textarea
                    value={form.aciklama}
                    onChange={e => guncelle('aciklama', e.target.value)}
                    placeholder="Sorunu ya da talebinizi ayrıntılı açıklayınız…"
                    rows={4}
                    style={hata.aciklama ? { borderColor: 'var(--danger)' } : {}}
                  />
                  {hata.aciklama && <p style={{ color: 'var(--danger)', font: '500 11px/16px var(--font-sans)', marginTop: 4 }}>{hata.aciklama}</p>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
                  <div>
                    <Label>Lokasyon / adres</Label>
                    <Input value={form.lokasyon} onChange={e => guncelle('lokasyon', e.target.value)} placeholder="Bina, kat, oda…" />
                  </div>
                  <div>
                    <Label>Cihaz / sistem türü</Label>
                    <Input value={form.cihazTuru} onChange={e => guncelle('cihazTuru', e.target.value)} placeholder="Kamera, NVR, PDKS…" />
                  </div>
                </div>

                <div>
                  <Label>Aciliyet seviyesi</Label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6 }}>
                    {ACILIYET_SEVIYELERI.map(a => {
                      const secili = form.aciliyet === a.id
                      return (
                        <button
                          key={a.id}
                          onClick={() => guncelle('aciliyet', a.id)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 'var(--radius-sm)',
                            background: secili ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                            border: `1px solid ${secili ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                            color: secili ? 'var(--brand-primary)' : 'var(--text-secondary)',
                            font: secili ? '600 13px/18px var(--font-sans)' : '400 13px/18px var(--font-sans)',
                            cursor: 'pointer',
                          }}
                        >
                          {a.isim}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Dosya ekleri — fotograf veya video zorunlu */}
                <div>
                  <Label required>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Paperclip size={12} strokeWidth={1.5} /> Fotoğraf veya video <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(en az 1 adet)</span>
                    </span>
                  </Label>
                  <p style={{ font: '400 11.5px/16px var(--font-sans)', color: 'var(--text-tertiary)', margin: '0 0 8px' }}>
                    Sorunu net gosteren bir gorsel veya video paylasmaniz teknige hizli tani koymasinda yardimci olur.
                  </p>
                  {yeniDosyalar.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      {yeniDosyalar.map((f, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', marginBottom: 6,
                          border: '1px dashed var(--brand-primary)',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--brand-primary-soft)',
                        }}>
                          {f.type?.startsWith('image/')
                            ? <ImageIcon size={16} strokeWidth={1.5} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
                            : <FileText size={16} strokeWidth={1.5} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--brand-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.name}>
                              {f.name}
                            </div>
                            <div className="t-caption" style={{ color: 'var(--brand-primary)' }}>{boyutFormatla(f.size)}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setYeniDosyalar(prev => prev.filter((_, idx) => idx !== i))}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--brand-primary)', padding: 4 }}
                          >
                            <X size={14} strokeWidth={1.5} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px',
                    border: `1px dashed ${hata.dosya ? 'var(--danger)' : 'var(--border-default)'}`,
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    color: hata.dosya ? 'var(--danger)' : 'var(--text-secondary)',
                    font: '500 13px/18px var(--font-sans)',
                    background: hata.dosya ? 'var(--danger-soft)' : 'var(--surface-card)',
                  }}>
                    <Upload size={14} strokeWidth={1.5} /> Fotoğraf / video seç
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*"
                      capture="environment"
                      onChange={e => {
                        const files = Array.from(e.target.files || [])
                        setYeniDosyalar(prev => [...prev, ...files])
                        if (files.length > 0) setHata(prev => ({ ...prev, dosya: '' }))
                        e.target.value = ''
                      }}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {hata.dosya && (
                    <p style={{ color: 'var(--danger)', font: '500 12px/16px var(--font-sans)', marginTop: 6 }}>
                      {hata.dosya}
                    </p>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
                <Button variant="secondary" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => setAdim(1)}>Geri</Button>
                <Button
                  variant="primary"
                  iconRight={<ChevronRight size={14} strokeWidth={1.5} />}
                  onClick={() => {
                    const e = {}
                    if (!form.konu.trim()) e.konu = 'Konu başlığı giriniz'
                    if (!form.aciklama.trim()) e.aciklama = 'Açıklama giriniz'
                    if (yeniDosyalar.length === 0 || !yeniDosyalar.some(gorselMi)) {
                      e.dosya = 'En az bir fotoğraf veya video eklemelisiniz'
                    }
                    if (Object.keys(e).length > 0) { setHata(e); return }
                    setAdim(3)
                  }}
                >
                  Devam
                </Button>
              </div>
            </div>
          )}

          {/* ADIM 3 */}
          {adim === 3 && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
                  <div>
                    <Label>İlgili kişi</Label>
                    <Input value={form.ilgiliKisi} onChange={e => guncelle('ilgiliKisi', e.target.value)} />
                  </div>
                  <div>
                    <Label>Telefon numarası</Label>
                    <Input type="tel" value={form.telefon} onChange={e => guncelle('telefon', e.target.value)} placeholder="0xxx xxx xx xx" />
                  </div>
                </div>
                <div>
                  <Label>E-posta</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={e => guncelle('email', e.target.value)}
                    placeholder="ornek@firma.com"
                    style={hata.email ? { borderColor: 'var(--danger)' } : {}}
                  />
                  {hata.email && <p style={{ color: 'var(--danger)', font: '500 11px/16px var(--font-sans)', marginTop: 4 }}>{hata.email}</p>}
                </div>
                <div>
                  <Label>Talep edilen ziyaret tarihi</Label>
                  <TarihSaatSecici
                    value={form.uygunZaman}
                    onChange={v => guncelle('uygunZaman', v)}
                    min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                  />
                  <p style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                    Takvimden uygun gördüğünüz tarih ve saati seçin. Ekip bu zamana göre planlama yapacaktır.
                  </p>
                </div>
              </div>

              {/* Özet */}
              <div style={{
                padding: 16,
                borderRadius: 'var(--radius-md)',
                background: 'var(--brand-primary-soft)',
                border: '1px solid var(--border-default)',
                marginBottom: 20,
              }}>
                <p style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '600 13px/18px var(--font-sans)', color: 'var(--brand-primary)', marginBottom: 12 }}>
                  <ClipboardList size={14} strokeWidth={1.5} /> Talep Özeti
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                  {[
                    { k: 'Tür',      v: ANA_TURLER.find(t => t.id === form.anaTur)?.isim, tone: 'brand' },
                    { k: 'Konu',     v: form.konu },
                    { k: 'Lokasyon', v: form.lokasyon || '—' },
                    { k: 'Aciliyet', v: ACILIYET_SEVIYELERI.find(a => a.id === form.aciliyet)?.isim, tone: ACIL_TONE[form.aciliyet] },
                    ...(form.uygunZaman ? [{ k: 'Talep Edilen Ziyaret Tarihi', v: uygunZamanFormat(form.uygunZaman) }] : []),
                    ...(yeniDosyalar.length > 0 ? [{ k: 'Ekler', v: `${yeniDosyalar.length} dosya` }] : []),
                  ].map(({ k, v, tone }) => (
                    <div key={k}>
                      <div className="t-label" style={{ marginBottom: 2 }}>{k.toUpperCase()}</div>
                      {tone
                        ? <Badge tone={tone}>{v}</Badge>
                        : <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{v}</div>}
                    </div>
                  ))}
                </div>
              </div>

              {gonderHata && (
                <div style={{
                  marginBottom: 12,
                  padding: '12px 14px',
                  background: 'var(--danger-soft)',
                  border: '1px solid var(--danger-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--danger)',
                  font: '500 13px/19px var(--font-sans)',
                }}>
                  <strong style={{ fontWeight: 700 }}>Talep gönderilemedi:</strong> {gonderHata}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Button variant="secondary" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => setAdim(2)}>Geri</Button>
                <Button
                  variant="primary"
                  iconLeft={<Check size={14} strokeWidth={2} />}
                  onClick={gonder}
                  disabled={gonderiliyor}
                >
                  {gonderiliyor ? 'Gönderiliyor…' : 'Talebi gönder'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
