import { useState, isValidElement } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Info, FileText, MessageSquare, MapPin, Monitor, Clock,
  Check, Star, ThumbsUp, ThumbsDown, AlertTriangle, CheckCircle2, Shield, Send,
  Frown, Meh, Smile, Paperclip, Image as ImageIcon,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useServisTalebi } from '../../context/ServisTalebiContext'
import {
  Button, Input, Textarea, Label, Card, Badge, CodeBadge, Alert, EmptyState,
} from '../../components/ui'

const ACIL_TONE = { acil: 'kayip', yuksek: 'beklemede', normal: 'lead', dusuk: 'neutral' }
const DURUM_TONE = {
  bekliyor: 'pasif', inceleniyor: 'beklemede', atandi: 'lead',
  devam_ediyor: 'beklemede', tamamlandi: 'aktif', iptal: 'kayip',
}

const PUAN_META = [
  null,
  { isim: 'Çok Kötü',  tone: 'kayip',     color: 'var(--danger)',  C: Frown },
  { isim: 'Kötü',      tone: 'kayip',     color: 'var(--danger)',  C: Frown },
  { isim: 'Orta',      tone: 'beklemede', color: 'var(--warning)', C: Meh },
  { isim: 'İyi',       tone: 'aktif',     color: 'var(--success)', C: Smile },
  { isim: 'Mükemmel',  tone: 'brand',     color: 'var(--brand-primary)', C: Smile },
]

function YildizGoster({ puan, boyut = 18 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={boyut}
          strokeWidth={1.5}
          fill={i <= puan ? 'var(--warning)' : 'transparent'}
          style={{ color: i <= puan ? 'var(--warning)' : 'var(--border-default)' }}
        />
      ))}
    </span>
  )
}

export default function MusteriTalepDetay() {
  const { id } = useParams()
  const { kullanici } = useAuth()
  const { talepler, notEkle, talepGuncelle, dosyaLinkiAl, ANA_TURLER, DURUM_LISTESI, ACILIYET_SEVIYELERI } = useServisTalebi()
  const navigate = useNavigate()

  const [yeniNot, setYeniNot] = useState('')
  const [duzenlemeModu, setDuzenlemeModu] = useState(false)
  const [duzenForm, setDuzenForm] = useState(null)
  const [onayAsamasi, setOnayAsamasi] = useState(null)
  const [degPuan, setDegPuan] = useState(0)
  const [degHover, setDegHover] = useState(0)
  const [degYorum, setDegYorum] = useState('')
  const [sorunAciklama, setSorunAciklama] = useState('')
  const [mevcutDeg, setMevcutDeg] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('memnuniyet_puanlari') || '[]')
        .find(p => p.servisTalepId === parseInt(id)) || null
    } catch { return null }
  })

  const talep = talepler.find(t => t.id === parseInt(id))

  if (!talep) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyState
          icon={<FileText size={32} strokeWidth={1.5} />}
          title="Talep bulunamadı"
          action={<Button variant="secondary" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => navigate('/musteri-portal/taleplerim')}>Taleplerime dön</Button>}
        />
      </div>
    )
  }

  const anaTur = ANA_TURLER.find(t => t.id === talep.anaTur)
  const durum = DURUM_LISTESI.find(d => d.id === talep.durum)
  const aciliyet = ACILIYET_SEVIYELERI.find(a => a.id === talep.aciliyet)
  const duzenlenebilir = talep.durum === 'bekliyor'

  const tarihFormat = (t) =>
    new Date(t).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const duzenlemeyiAc = () => {
    setDuzenForm({
      konu: talep.konu, aciklama: talep.aciklama,
      lokasyon: talep.lokasyon || '', cihazTuru: talep.cihazTuru || '',
      aciliyet: talep.aciliyet, ilgiliKisi: talep.ilgiliKisi || '',
      telefon: talep.telefon || '', uygunZaman: talep.uygunZaman || '',
    })
    setDuzenlemeModu(true)
  }

  const duzenlemeyiIptal = () => { setDuzenlemeModu(false); setDuzenForm(null) }

  const duzenlemeyiKaydet = () => {
    if (!duzenForm.konu.trim() || !duzenForm.aciklama.trim()) return
    talepGuncelle(talep.id, duzenForm, kullanici.ad, 'Müşteri tarafından güncellendi')
    setDuzenlemeModu(false); setDuzenForm(null)
  }

  const notGonder = () => {
    if (!yeniNot.trim()) return
    notEkle(talep.id, yeniNot.trim(), kullanici, 'musteri')
    setYeniNot('')
  }

  const musteriOnayladi = () => {
    talepGuncelle(talep.id, { musteriOnay: 'onaylandi' }, kullanici.ad, 'Müşteri çözümü onayladı')
    setOnayAsamasi('anket')
  }

  const sorunDevamEdiyor = () => setOnayAsamasi('sorun')

  const sorunGonder = () => {
    talepGuncelle(talep.id,
      { durum: 'devam_ediyor', musteriOnay: 'ret' },
      kullanici.ad,
      'Müşteri sorunu devam ettiğini bildirdi'
    )
    if (sorunAciklama.trim()) notEkle(talep.id, sorunAciklama.trim(), kullanici, 'musteri')
    setOnayAsamasi('bitti')
  }

  const degerlendirmeKaydet = () => {
    if (!degPuan) return
    const puanlar = JSON.parse(localStorage.getItem('memnuniyet_puanlari') || '[]')
    const yeni = {
      id: crypto.randomUUID(),
      servisTalepId: talep.id, talepNo: talep.talepNo,
      musteriAd: talep.musteriAd, firmaAdi: talep.firmaAdi || '',
      konu: talep.konu, puan: degPuan, yorum: degYorum.trim(),
      tarih: new Date().toISOString(), kaydeden: kullanici.ad,
    }
    puanlar.push(yeni)
    localStorage.setItem('memnuniyet_puanlari', JSON.stringify(puanlar))
    setMevcutDeg(yeni)
    setOnayAsamasi('bitti')
  }

  const talepBilgileri = [
    { k: 'Talep No',       v: <CodeBadge>{talep.talepNo}</CodeBadge> },
    { k: 'Tür',            v: anaTur && <Badge tone="brand">{anaTur.isim}</Badge> },
    { k: 'Durum',          v: durum && <Badge tone={DURUM_TONE[durum.id]}>{durum.isim}</Badge> },
    { k: 'Aciliyet',       v: aciliyet && <Badge tone={ACIL_TONE[aciliyet.id]}>{aciliyet.isim}</Badge> },
    talep.atananKullaniciAd && { k: 'Atanan Ekip', v: talep.atananKullaniciAd },
    talep.planliTarih && { k: 'Planlı Tarih', v: new Date(talep.planliTarih).toLocaleDateString('tr-TR'), tabular: true },
    { k: 'İlgili Kişi',    v: talep.ilgiliKisi },
    talep.telefon && { k: 'Telefon', v: talep.telefon, tabular: true },
    talep.uygunZaman && { k: 'Uygun Zaman', v: talep.uygunZaman },
  ].filter(Boolean)

  return (
    <div style={{ padding: 24, maxWidth: 1040, margin: '0 auto' }}>

      <button
        onClick={() => navigate('/musteri-portal/taleplerim')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--text-tertiary)', font: '500 13px/18px var(--font-sans)',
          marginBottom: 16,
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-primary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
      >
        <ArrowLeft size={14} strokeWidth={1.5} /> Taleplerime dön
      </button>

      {/* Başlık kartı */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <CodeBadge>{talep.talepNo}</CodeBadge>
              {durum && <Badge tone={DURUM_TONE[durum.id]}>{durum.isim}</Badge>}
              {aciliyet && <Badge tone={ACIL_TONE[aciliyet.id]}>{aciliyet.isim}</Badge>}
              {anaTur && <Badge tone="brand">{anaTur.isim}</Badge>}
            </div>
            <h1 className="t-h1">{talep.konu}</h1>
            <p className="t-caption" style={{ marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              Oluşturulma: {tarihFormat(talep.olusturmaTarihi)}
              {talep.guncellemeTarihi !== talep.olusturmaTarihi && (
                <> · Güncellendi: {tarihFormat(talep.guncellemeTarihi)}</>
              )}
            </p>
          </div>

          {duzenlenebilir && !duzenlemeModu && (
            <Button variant="secondary" iconLeft={<Pencil size={14} strokeWidth={1.5} />} onClick={duzenlemeyiAc}>
              Düzenle
            </Button>
          )}
        </div>

        {duzenlenebilir && !duzenlemeModu && (
          <Alert variant="info" style={{ marginTop: 16 }}>
            Talebiniz henüz incelemeye alınmadı. İçeriği düzenleyebilirsiniz.
          </Alert>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 2fr) minmax(280px, 1fr))', gap: 20 }}>

        {/* Sol */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Detay veya düzenleme formu */}
          {duzenlemeModu ? (
            <Card padding={0}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px',
                background: 'var(--brand-primary-soft)',
                borderBottom: '1px solid var(--border-default)',
              }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, font: '600 14px/20px var(--font-sans)', color: 'var(--brand-primary)' }}>
                  <Pencil size={14} strokeWidth={1.5} /> Talebi Düzenle
                </div>
                <button
                  onClick={duzenlemeyiIptal}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: '500 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}
                >
                  İptal
                </button>
              </div>

              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <Label required>Konu başlığı</Label>
                  <Input value={duzenForm.konu} onChange={e => setDuzenForm({ ...duzenForm, konu: e.target.value })} />
                </div>
                <div>
                  <Label required>Açıklama</Label>
                  <Textarea value={duzenForm.aciklama} onChange={e => setDuzenForm({ ...duzenForm, aciklama: e.target.value })} rows={4} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
                  <div>
                    <Label>Lokasyon</Label>
                    <Input value={duzenForm.lokasyon} onChange={e => setDuzenForm({ ...duzenForm, lokasyon: e.target.value })} />
                  </div>
                  <div>
                    <Label>Cihaz / sistem</Label>
                    <Input value={duzenForm.cihazTuru} onChange={e => setDuzenForm({ ...duzenForm, cihazTuru: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Aciliyet</Label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6 }}>
                    {ACILIYET_SEVIYELERI.map(a => {
                      const active = duzenForm.aciliyet === a.id
                      return (
                        <button
                          key={a.id}
                          onClick={() => setDuzenForm({ ...duzenForm, aciliyet: a.id })}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-sm)',
                            background: active ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                            border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                            color: active ? 'var(--brand-primary)' : 'var(--text-secondary)',
                            font: active ? '600 13px/18px var(--font-sans)' : '400 13px/18px var(--font-sans)',
                            cursor: 'pointer',
                          }}
                        >
                          {a.isim}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
                  <div>
                    <Label>İlgili kişi</Label>
                    <Input value={duzenForm.ilgiliKisi} onChange={e => setDuzenForm({ ...duzenForm, ilgiliKisi: e.target.value })} />
                  </div>
                  <div>
                    <Label>Telefon</Label>
                    <Input type="tel" value={duzenForm.telefon} onChange={e => setDuzenForm({ ...duzenForm, telefon: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Uygun ziyaret zamanı</Label>
                  <Input value={duzenForm.uygunZaman} onChange={e => setDuzenForm({ ...duzenForm, uygunZaman: e.target.value })} placeholder="Örn: Hafta içi 09:00-17:00" />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    variant="primary"
                    iconLeft={<Check size={14} strokeWidth={2} />}
                    onClick={duzenlemeyiKaydet}
                    disabled={!duzenForm.konu.trim() || !duzenForm.aciklama.trim()}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    Değişiklikleri kaydet
                  </Button>
                  <Button variant="secondary" onClick={duzenlemeyiIptal}>İptal</Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <FileText size={16} strokeWidth={1.5} style={{ color: 'var(--text-secondary)' }} />
                <h2 className="t-h2" style={{ margin: 0 }}>Talep Detayı</h2>
              </div>
              <p style={{ font: '400 14px/22px var(--font-sans)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0 }}>
                {talep.aciklama}
              </p>
              {(talep.lokasyon || talep.cihazTuru) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-default)' }}>
                  {talep.lokasyon && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '400 13px/18px var(--font-sans)' }}>
                      <MapPin size={12} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
                      <span className="t-caption">Lokasyon:</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{talep.lokasyon}</span>
                    </div>
                  )}
                  {talep.cihazTuru && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '400 13px/18px var(--font-sans)' }}>
                      <Monitor size={12} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
                      <span className="t-caption">Cihaz/Sistem:</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{talep.cihazTuru}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Dosyalar */}
              {(talep.dosyalar?.length || 0) > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-default)' }}>
                  <div className="t-label" style={{ marginBottom: 6 }}>
                    <Paperclip size={12} strokeWidth={1.5} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                    Ekler ({talep.dosyalar.length})
                  </div>
                  {talep.dosyalar.map(d => (
                    <button
                      key={d.path}
                      type="button"
                      onClick={async () => {
                        try {
                          const url = await dosyaLinkiAl(d.path)
                          window.open(url, '_blank')
                        } catch {}
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '8px 12px', marginBottom: 6,
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface-card)',
                        cursor: 'pointer', textAlign: 'left',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-card)'}
                    >
                      {d.type?.startsWith('image/')
                        ? <ImageIcon size={14} strokeWidth={1.5} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
                        : <FileText size={14} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                      <span style={{ flex: 1, font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {d.name}
                      </span>
                      <span className="t-caption">
                        {d.size ? `${(d.size / 1024).toFixed(0)} KB` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Yazışmalar */}
          <Card padding={0}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-default)' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <MessageSquare size={16} strokeWidth={1.5} style={{ color: 'var(--text-secondary)' }} />
                <h2 className="t-h2" style={{ margin: 0 }}>Yazışmalar & Notlar</h2>
              </div>
            </div>
            <div style={{ minHeight: 160, maxHeight: 380, overflowY: 'auto', padding: 16 }}>
              {talep.notlar.length === 0 ? (
                <EmptyState title="Henüz yazışma yok" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {talep.notlar.map(not => {
                    const benimNot = not.kullaniciId === kullanici?.id
                    const znaTeam = not.tip === 'ic' && !benimNot
                    return (
                      <div
                        key={not.id}
                        style={{ display: 'flex', justifyContent: benimNot ? 'flex-end' : 'flex-start' }}
                      >
                        <div style={{
                          maxWidth: 480,
                          padding: '10px 14px',
                          borderRadius: 'var(--radius-md)',
                          background: benimNot ? 'var(--brand-primary)'
                            : znaTeam ? 'var(--success-soft)'
                            : 'var(--surface-sunken)',
                          border: benimNot ? 'none'
                            : znaTeam ? '1px solid var(--success-border)'
                            : '1px solid var(--border-default)',
                        }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                            {znaTeam && <Shield size={11} strokeWidth={1.5} style={{ color: 'var(--success)' }} />}
                            <span style={{
                              font: '600 11px/16px var(--font-sans)',
                              color: benimNot ? 'rgba(255,255,255,0.85)'
                                : znaTeam ? 'var(--success)'
                                : 'var(--text-secondary)',
                            }}>
                              {znaTeam ? 'ZNA Ekibi' : not.kullaniciAd}
                            </span>
                          </div>
                          <p style={{
                            font: '400 13px/20px var(--font-sans)',
                            color: benimNot ? '#fff' : 'var(--text-primary)',
                            margin: 0, whiteSpace: 'pre-wrap',
                          }}>
                            {not.metin}
                          </p>
                          <p style={{
                            font: '400 10px/14px var(--font-sans)',
                            color: benimNot ? 'rgba(255,255,255,0.65)' : 'var(--text-tertiary)',
                            marginTop: 4, fontVariantNumeric: 'tabular-nums',
                          }}>
                            {new Date(not.tarih).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {!['tamamlandi', 'iptal'].includes(talep.durum) && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-default)', background: 'var(--surface-sunken)' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Input
                      value={yeniNot}
                      onChange={e => setYeniNot(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && notGonder()}
                      placeholder="Not veya soru yazın…"
                    />
                  </div>
                  <Button
                    variant="primary"
                    iconLeft={<Send size={14} strokeWidth={1.5} />}
                    onClick={notGonder}
                    disabled={!yeniNot.trim()}
                  >
                    Gönder
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Durum geçmişi */}
          {talep.durumGecmisi.length > 0 && (
            <Card>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Clock size={16} strokeWidth={1.5} style={{ color: 'var(--text-secondary)' }} />
                <h2 className="t-h2" style={{ margin: 0 }}>Durum Geçmişi</h2>
              </div>
              <div style={{ position: 'relative', paddingLeft: 24 }}>
                <div style={{ position: 'absolute', left: 8, top: 0, bottom: 0, width: 1, background: 'var(--border-default)' }} />
                {[...talep.durumGecmisi].reverse().map((g, i) => {
                  const d = DURUM_LISTESI.find(x => x.id === g.durum)
                  return (
                    <div key={i} style={{ position: 'relative', paddingBottom: i < talep.durumGecmisi.length - 1 ? 16 : 0 }}>
                      <span style={{
                        position: 'absolute', left: -20, top: 2,
                        width: 17, height: 17, borderRadius: '50%',
                        background: 'var(--surface-card)',
                        border: '2px solid var(--brand-primary)',
                      }} />
                      <div>
                        <div style={{ marginBottom: 4 }}>
                          {d && <Badge tone={DURUM_TONE[d.id]}>{d.isim}</Badge>}
                        </div>
                        {g.aciklama && (
                          <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', margin: '0 0 2px' }}>{g.aciklama}</p>
                        )}
                        <p className="t-caption" style={{ fontVariantNumeric: 'tabular-nums' }}>{tarihFormat(g.tarih)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Sağ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <p className="t-label" style={{ marginBottom: 14 }}>TALEP BİLGİLERİ</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {talepBilgileri.map(({ k, v, tabular }) => (
                <div key={k}>
                  <p className="t-caption" style={{ marginBottom: 2 }}>{k}</p>
                  {isValidElement(v)
                    ? v
                    : <p style={{
                        font: '500 13px/18px var(--font-sans)',
                        color: 'var(--text-primary)', margin: 0,
                        fontVariantNumeric: tabular ? 'tabular-nums' : 'normal',
                      }}>
                        {v}
                      </p>
                  }
                </div>
              ))}
            </div>
          </Card>

          {/* Onay / memnuniyet akışı */}
          {talep.durum === 'tamamlandi' && (
            <>
              {/* 1. Onay sorusu */}
              {(talep.musteriOnay === null || talep.musteriOnay === undefined) && !onayAsamasi && (
                <Card style={{ background: 'var(--success-soft)', borderColor: 'var(--success-border)' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <CheckCircle2 size={16} strokeWidth={1.5} style={{ color: 'var(--success)' }} />
                    <p style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--success)', margin: 0 }}>Talep Tamamlandı</p>
                  </div>
                  <p style={{ font: '400 12px/18px var(--font-sans)', color: 'var(--text-secondary)', marginBottom: 14 }}>
                    Teknik ekibimiz talebinizi çözdüğünü bildirdi. Sorununuz çözüldü mü?
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                      variant="primary"
                      iconLeft={<ThumbsUp size={14} strokeWidth={1.5} />}
                      onClick={musteriOnayladi}
                      style={{ flex: 1, justifyContent: 'center', background: 'var(--success)', border: '1px solid var(--success)' }}
                    >
                      Evet, çözüldü
                    </Button>
                    <Button
                      variant="tertiary"
                      iconLeft={<ThumbsDown size={14} strokeWidth={1.5} />}
                      onClick={sorunDevamEdiyor}
                      style={{ flex: 1, justifyContent: 'center', color: 'var(--danger)', background: 'var(--danger-soft)', border: '1px solid var(--danger-border)' }}
                    >
                      Sorun devam ediyor
                    </Button>
                  </div>
                </Card>
              )}

              {/* 2. Anket */}
              {onayAsamasi === 'anket' && (
                <Card style={{ borderColor: 'var(--warning-border)' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Star size={16} strokeWidth={1.5} fill="var(--warning)" style={{ color: 'var(--warning)' }} />
                    <p style={{ font: '700 14px/20px var(--font-sans)', color: 'var(--warning)', margin: 0 }}>Hizmet Değerlendirmesi</p>
                  </div>
                  <p style={{ font: '400 12px/18px var(--font-sans)', color: 'var(--text-secondary)', marginBottom: 14 }}>
                    Aldığınız hizmeti değerlendirmeniz bize çok yardımcı olur.
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 10 }}>
                    {[1, 2, 3, 4, 5].map(i => {
                      const filled = i <= (degHover || degPuan)
                      return (
                        <button
                          key={i}
                          onClick={() => setDegPuan(i)}
                          onMouseEnter={() => setDegHover(i)}
                          onMouseLeave={() => setDegHover(0)}
                          aria-label={`${i} yıldız`}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                            transform: filled ? 'scale(1.15)' : 'scale(1)',
                            transition: 'transform 120ms',
                          }}
                        >
                          <Star
                            size={34}
                            strokeWidth={1.5}
                            fill={filled ? 'var(--warning)' : 'transparent'}
                            style={{ color: filled ? 'var(--warning)' : 'var(--border-default)' }}
                          />
                        </button>
                      )
                    })}
                  </div>

                  {degPuan > 0 && (() => {
                    const meta = PUAN_META[degPuan]
                    const IconC = meta.C
                    return (
                      <p style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        font: '600 13px/18px var(--font-sans)', color: meta.color,
                        textAlign: 'center', marginBottom: 12,
                      }}>
                        <IconC size={16} strokeWidth={1.5} /> {meta.isim}
                      </p>
                    )
                  })()}

                  <Textarea
                    value={degYorum}
                    onChange={e => setDegYorum(e.target.value)}
                    placeholder="Yorumunuz (isteğe bağlı)…"
                    rows={2}
                    style={{ marginBottom: 12 }}
                  />

                  <Button
                    variant="primary"
                    iconLeft={<Star size={14} strokeWidth={1.5} fill={degPuan ? '#fff' : 'none'} />}
                    onClick={degerlendirmeKaydet}
                    disabled={!degPuan}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Değerlendirmeyi gönder
                  </Button>
                </Card>
              )}

              {/* 3. Sorun formu */}
              {onayAsamasi === 'sorun' && (
                <Card style={{ borderColor: 'var(--danger-border)', background: 'var(--danger-soft)' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <AlertTriangle size={14} strokeWidth={1.5} style={{ color: 'var(--danger)' }} />
                    <p style={{ font: '700 13px/18px var(--font-sans)', color: 'var(--danger)', margin: 0 }}>Sorunu Bildir</p>
                  </div>
                  <p style={{ font: '400 12px/18px var(--font-sans)', color: 'var(--text-secondary)', marginBottom: 12 }}>
                    Talebiniz yeniden açılacak. Sorun hakkında bilgi verebilir misiniz?
                  </p>
                  <Textarea
                    value={sorunAciklama}
                    onChange={e => setSorunAciklama(e.target.value)}
                    placeholder="Sorun nedir? Neler denendi?…"
                    rows={3}
                    style={{ marginBottom: 10 }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="danger" onClick={sorunGonder} style={{ flex: 1, justifyContent: 'center' }}>
                      Talebi yeniden aç
                    </Button>
                    <Button variant="secondary" onClick={() => setOnayAsamasi(null)}>İptal</Button>
                  </div>
                </Card>
              )}

              {/* 4. Değerlendirme alındı */}
              {(onayAsamasi === 'bitti' || mevcutDeg) && talep.musteriOnay === 'onaylandi' && (
                <Card style={{ background: 'var(--brand-primary-soft)', borderColor: 'var(--border-default)' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <CheckCircle2 size={16} strokeWidth={1.5} style={{ color: 'var(--brand-primary)' }} />
                    <p style={{ font: '700 13px/18px var(--font-sans)', color: 'var(--brand-primary)', margin: 0 }}>
                      Değerlendirmeniz Alındı
                    </p>
                  </div>
                  {mevcutDeg && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <YildizGoster puan={mevcutDeg.puan} boyut={20} />
                        <span style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--warning)', fontVariantNumeric: 'tabular-nums' }}>
                          {mevcutDeg.puan}/5
                        </span>
                      </div>
                      {mevcutDeg.yorum && (
                        <p style={{ font: '400 12px/18px var(--font-sans)', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>
                          "{mevcutDeg.yorum}"
                        </p>
                      )}
                    </>
                  )}
                </Card>
              )}

              {/* 5. Talep yeniden açıldı */}
              {talep.musteriOnay === 'ret' && (
                <Alert
                  variant="danger"
                  title="Talebiniz yeniden açıldı"
                >
                  Ekibimiz en kısa sürede sizinle iletişime geçecek.
                </Alert>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
