import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Check, ChevronRight, CheckCircle2, ClipboardList,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useServisTalebi } from '../../context/ServisTalebiContext'
import {
  Button, Input, Textarea, Label, Card, Badge, EmptyState,
} from '../../components/ui'

const ACIL_TONE = { acil: 'kayip', yuksek: 'beklemede', normal: 'lead', dusuk: 'neutral' }

const bosForm = {
  anaTur: '', altKategori: '', konu: '', lokasyon: '', cihazTuru: '',
  aciklama: '', aciliyet: 'normal', ilgiliKisi: '', telefon: '', uygunZaman: '',
}

export default function YeniTalep() {
  const { kullanici } = useAuth()
  const { talepOlustur, ANA_TURLER, ALT_KATEGORILER, ACILIYET_SEVIYELERI } = useServisTalebi()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [form, setForm] = useState({ ...bosForm, ilgiliKisi: kullanici?.ad || '' })
  const [gonderildi, setGonderildi] = useState(false)
  const [hata, setHata] = useState({})
  const [adim, setAdim] = useState(1)

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

  const dogrula = () => {
    const e = {}
    if (!form.anaTur) e.anaTur = 'Talep türü seçiniz'
    if (!form.altKategori) e.altKategori = 'Alt kategori seçiniz'
    if (!form.konu.trim()) e.konu = 'Konu başlığı giriniz'
    if (!form.aciklama.trim()) e.aciklama = 'Açıklama giriniz'
    setHata(e)
    return Object.keys(e).length === 0
  }

  const gonder = () => {
    if (!dogrula()) return
    const talep = talepOlustur(form, kullanici)
    setGonderildi(true)
    setTimeout(() => navigate(`/musteri-portal/talep/${talep.id}`), 1800)
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
              <h2 className="t-h2" style={{ marginBottom: 16 }}>Talep Türünü Seçin</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
                {filtreliTurler.map(tur => {
                  const secili = form.anaTur === tur.id
                  return (
                    <button
                      key={tur.id}
                      onClick={() => guncelle('anaTur', tur.id)}
                      style={{
                        padding: 16,
                        borderRadius: 'var(--radius-md)',
                        background: secili ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                        border: `1px solid ${secili ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 120ms',
                      }}
                    >
                      <div style={{
                        width: 40, height: 40,
                        margin: '0 auto 8px',
                        borderRadius: 'var(--radius-sm)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: secili ? 'var(--brand-primary)' : 'var(--surface-sunken)',
                        color: secili ? '#fff' : 'var(--text-secondary)',
                        font: '600 16px/1 var(--font-sans)',
                      }}>
                        {tur.isim.charAt(0)}
                      </div>
                      <div style={{
                        font: secili ? '600 13px/18px var(--font-sans)' : '500 13px/18px var(--font-sans)',
                        color: secili ? 'var(--brand-primary)' : 'var(--text-primary)',
                      }}>
                        {tur.isim}
                      </div>
                    </button>
                  )
                })}
              </div>
              {hata.anaTur && <p style={{ color: 'var(--danger)', font: '500 12px/16px var(--font-sans)', marginBottom: 12 }}>{hata.anaTur}</p>}

              {form.anaTur && (
                <div>
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <Button
                  variant="primary"
                  iconRight={<ChevronRight size={14} strokeWidth={1.5} />}
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
                  <Label>Uygun ziyaret / destek zamanı</Label>
                  <Input value={form.uygunZaman} onChange={e => guncelle('uygunZaman', e.target.value)} placeholder="Örn: Hafta içi 09:00-17:00, öğleden sonra…" />
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

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Button variant="secondary" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => setAdim(2)}>Geri</Button>
                <Button
                  variant="primary"
                  iconLeft={<Check size={14} strokeWidth={2} />}
                  onClick={gonder}
                >
                  Talebi gönder
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
