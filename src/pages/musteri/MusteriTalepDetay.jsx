import { useState, isValidElement } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Info, FileText, MessageSquare, MapPin, Monitor, Clock,
  Check, Star, ThumbsUp, ThumbsDown, AlertTriangle, CheckCircle2, Shield, Send,
  Frown, Meh, Smile, Paperclip, Image as ImageIcon,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useServisTalebi } from '../../context/ServisTalebiContext'
import { uygunZamanFormat } from '../../lib/uygunZamanFormat'
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
  const [degKaydediliyor, setDegKaydediliyor] = useState(false)
  const [sorunAciklama, setSorunAciklama] = useState('')
  // Mevcut değerlendirme — talep objesi içindeki DB kolonlarından
  const mevcutDeg = (() => {
    const t = talepler.find(t => t.id === parseInt(id))
    if (!t?.degerlendirmePuan) return null
    return {
      puan: t.degerlendirmePuan,
      yorum: t.degerlendirmeYorum || '',
      tarih: t.degerlendirmeTarihi || new Date().toISOString(),
      kaydeden: t.musteriAd,
    }
  })()

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
      telefon: talep.telefon || '', email: talep.email || '', uygunZaman: talep.uygunZaman || '',
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

  const degerlendirmeKaydet = async () => {
    if (!degPuan) return
    if (degKaydediliyor) return
    setDegKaydediliyor(true)
    try {
      await talepGuncelle(talep.id, {
        degerlendirmePuan: degPuan,
        degerlendirmeYorum: degYorum.trim() || null,
        degerlendirmeTarihi: new Date().toISOString(),
        degerlendirmeKullaniciId: kullanici?.id || null,
      }, kullanici.ad, `Müşteri ${degPuan}/5 yıldız değerlendirdi`)
      setOnayAsamasi('bitti')
    } catch (e) {
      console.error('[degerlendirmeKaydet]', e?.message)
      alert('Değerlendirme kaydedilemedi: ' + (e?.message || 'bilinmeyen hata'))
    } finally {
      setDegKaydediliyor(false)
    }
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
    talep.email && { k: 'E-posta', v: talep.email },
    talep.uygunZaman && { k: 'Talep Edilen Ziyaret Tarihi', v: uygunZamanFormat(talep.uygunZaman) },
  ].filter(Boolean)

  return (
    <div style={{ padding: '16px 20px', maxWidth: 1440, margin: '0 auto' }}>

      {/* Kompakt üst şerit — tek satır: geri + rozetler + başlık + düzenle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => navigate('/musteri-portal/taleplerim')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '6px 10px',
            background: 'transparent', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)',
            font: '500 12px/16px var(--font-sans)',
            cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-sunken)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <ArrowLeft size={13} strokeWidth={1.5} /> Taleplerim
        </button>
        <CodeBadge>{talep.talepNo}</CodeBadge>
        {durum && <Badge tone={DURUM_TONE[durum.id]}>{durum.isim}</Badge>}
        {aciliyet && <Badge tone={ACIL_TONE[aciliyet.id]}>{aciliyet.isim}</Badge>}
        {anaTur && <Badge tone="brand">{anaTur.isim}</Badge>}
        <h1 style={{ margin: 0, font: '600 18px/24px var(--font-sans)', color: 'var(--text-primary)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={talep.konu}>
          {talep.konu}
        </h1>
        <span className="t-caption" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {tarihFormat(talep.olusturmaTarihi)}
        </span>
        {duzenlenebilir && !duzenlemeModu && (
          <Button variant="secondary" size="sm" iconLeft={<Pencil size={13} strokeWidth={1.5} />} onClick={duzenlemeyiAc}>
            Düzenle
          </Button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 14, alignItems: 'start' }}>

        {/* Sol */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

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
                  <Label>E-posta</Label>
                  <Input type="email" value={duzenForm.email || ''} onChange={e => setDuzenForm({ ...duzenForm, email: e.target.value })} placeholder="ornek@firma.com" />
                </div>
                <div>
                  <Label>Talep edilen ziyaret tarihi</Label>
                  <Input
                    type="datetime-local"
                    value={/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(duzenForm.uygunZaman || '') ? duzenForm.uygunZaman.slice(0, 16) : ''}
                    onChange={e => setDuzenForm({ ...duzenForm, uygunZaman: e.target.value })}
                    min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                  />
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
            <Card padding={14}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <FileText size={14} strokeWidth={1.5} style={{ color: 'var(--text-secondary)' }} />
                <h2 style={{ margin: 0, font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Talep Detayı</h2>
              </div>
              <p style={{ font: '400 13px/20px var(--font-sans)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0 }}>
                {talep.aciklama}
              </p>
              {(talep.lokasyon || talep.cihazTuru) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-default)' }}>
                  {talep.lokasyon && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)' }}>
                      <MapPin size={11} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
                      {talep.lokasyon}
                    </div>
                  )}
                  {talep.cihazTuru && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)' }}>
                      <Monitor size={11} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
                      {talep.cihazTuru}
                    </div>
                  )}
                </div>
              )}

              {/* Dosyalar — kompakt yatay chip'ler */}
              {(talep.dosyalar?.length || 0) > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '600 11px/14px var(--font-sans)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.3, marginRight: 4 }}>
                    <Paperclip size={11} strokeWidth={1.5} /> Ekler ({talep.dosyalar.length})
                  </span>
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
                      title={d.name}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4px 8px',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-pill)',
                        background: 'var(--surface-sunken)',
                        cursor: 'pointer',
                        font: '500 11px/14px var(--font-sans)',
                        color: 'var(--text-secondary)',
                        maxWidth: 180,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-sunken)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                    >
                      {d.type?.startsWith('image/')
                        ? <ImageIcon size={11} strokeWidth={1.5} />
                        : <FileText size={11} strokeWidth={1.5} />}
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {d.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Yazışmalar */}
          <Card padding={0}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <MessageSquare size={14} strokeWidth={1.5} style={{ color: 'var(--text-secondary)' }} />
                <h2 style={{ margin: 0, font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Yazışmalar & Notlar</h2>
              </div>
              <span className="t-caption" style={{ fontVariantNumeric: 'tabular-nums' }}>{talep.notlar.length} mesaj</span>
            </div>
            <div style={{ minHeight: 220, maxHeight: 320, overflowY: 'auto', padding: 12 }}>
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
              <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-default)', background: 'var(--surface-sunken)' }}>
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
            <Card padding={14}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Clock size={14} strokeWidth={1.5} style={{ color: 'var(--text-secondary)' }} />
                <h2 style={{ margin: 0, font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Durum Geçmişi</h2>
              </div>
              <div style={{ position: 'relative', paddingLeft: 22, maxHeight: 180, overflowY: 'auto' }}>
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

        {/* Sağ — sticky */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 12 }}>
          <Card padding={14}>
            <p style={{ margin: '0 0 10px', font: '600 11px/14px var(--font-sans)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Talep Bilgileri</p>
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', rowGap: 8, columnGap: 8 }}>
              {talepBilgileri.map(({ k, v, tabular }) => (
                <div key={k} style={{ display: 'contents' }}>
                  <span style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>{k}</span>
                  <div style={{ minWidth: 0 }}>
                    {isValidElement(v)
                      ? v
                      : <span style={{
                          font: '500 12px/16px var(--font-sans)',
                          color: 'var(--text-primary)',
                          fontVariantNumeric: tabular ? 'tabular-nums' : 'normal',
                          wordBreak: 'break-word',
                        }}>
                          {v}
                        </span>
                    }
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Onay / memnuniyet akışı */}
          {talep.durum === 'tamamlandi' && (
            <>
              {/* 1. Onay sorusu */}
              {(talep.musteriOnay === null || talep.musteriOnay === undefined) && !onayAsamasi && (
                <Card style={{
                  background: 'var(--success-soft)',
                  borderColor: 'var(--success)',
                  borderWidth: 1.5,
                }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <CheckCircle2 size={18} strokeWidth={2} style={{ color: 'var(--success)' }} />
                    <p style={{ font: '700 15px/20px var(--font-sans)', color: 'var(--success)', margin: 0 }}>
                      Talep Tamamlandı
                    </p>
                  </div>
                  <p style={{ font: '400 13px/19px var(--font-sans)', color: 'var(--text-secondary)', marginBottom: 14 }}>
                    Teknik ekibimiz talebinizi çözdüğünü bildirdi. Sorununuz çözüldü mü?
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {/* Evet butonu — solid yeşil (Button component'i bypass et, direkt button) */}
                    <button
                      type="button"
                      onClick={musteriOnayladi}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '11px 14px',
                        background: 'var(--success)',
                        color: '#fff',
                        border: '1.5px solid var(--success)',
                        borderRadius: 'var(--radius-sm)',
                        font: '700 13.5px/18px var(--font-sans)',
                        cursor: 'pointer',
                        boxShadow: '0 4px 10px -4px var(--success)',
                        transition: 'transform 180ms, box-shadow 180ms',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 18px -8px var(--success)' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 10px -4px var(--success)' }}
                    >
                      <ThumbsUp size={15} strokeWidth={2} />
                      Evet, çözüldü
                    </button>

                    {/* Hayır butonu — solid kırmızı (Evet ile %100 eş görsel ağırlık) */}
                    <button
                      type="button"
                      onClick={sorunDevamEdiyor}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '11px 14px',
                        background: 'var(--danger)',
                        color: '#fff',
                        border: '1.5px solid var(--danger)',
                        borderRadius: 'var(--radius-sm)',
                        font: '700 13.5px/18px var(--font-sans)',
                        cursor: 'pointer',
                        boxShadow: '0 4px 10px -4px var(--danger)',
                        transition: 'transform 180ms, box-shadow 180ms',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 18px -8px var(--danger)' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 10px -4px var(--danger)' }}
                    >
                      <ThumbsDown size={15} strokeWidth={2} />
                      Sorun devam ediyor
                    </button>
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
                    disabled={!degPuan || degKaydediliyor}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {degKaydediliyor ? 'Kaydediliyor…' : 'Değerlendirmeyi gönder'}
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
