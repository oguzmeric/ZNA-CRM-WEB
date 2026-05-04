import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Search, CheckCircle2, Trash2, AlertTriangle, FileText, MessageSquare,
  Lock, User, Mail, MapPin, Monitor, Phone, Clock, Star, Send, Check,
  Paperclip, Upload, Download, Image as ImageIcon, Pencil, X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useServisTalebi } from '../context/ServisTalebiContext'
import { gorevGetir } from '../services/gorevService'
import CustomSelect from '../components/CustomSelect'
import {
  Button, Textarea, Card, CardTitle, Badge, CodeBadge, Avatar, Alert, EmptyState,
} from '../components/ui'

const ACIL_TONE = {
  acil:    'kayip',
  yuksek:  'beklemede',
  normal:  'lead',
  dusuk:   'neutral',
}
const DURUM_TONE = {
  bekliyor:     'pasif',
  inceleniyor:  'beklemede',
  atandi:       'lead',
  devam_ediyor: 'beklemede',
  tamamlandi:   'aktif',
  iptal:        'kayip',
}

export default function ServisTalepDetay() {
  const { id } = useParams()
  const { kullanici, kullanicilar } = useAuth()
  const { talepler, talepGuncelle, talepSil, notEkle, dosyaYukle, dosyaLinkiAl, dosyaSil, ANA_TURLER, DURUM_LISTESI, ACILIYET_SEVIYELERI } = useServisTalebi()
  const navigate = useNavigate()

  const [yeniNot, setYeniNot] = useState('')
  const [notTip, setNotTip] = useState('ic')
  const [silOnayGoster, setSilOnayGoster] = useState(false)
  const [secilenAtanan, setSecilenAtanan] = useState('')
  const [atamaKaydediliyor, setAtamaKaydediliyor] = useState(false)

  const [degPuan, setDegPuan] = useState(0)
  const [degHover, setDegHover] = useState(0)
  const [degYorum, setDegYorum] = useState('')
  const [mevcutDeg, setMevcutDeg] = useState(() => {
    try {
      const puanlar = JSON.parse(localStorage.getItem('memnuniyet_puanlari') || '[]')
      return puanlar.find(p => p.servisTalepId === parseInt(id)) || null
    } catch { return null }
  })

  const talep = talepler.find(t => t.id === parseInt(id))
  const [bagliGorev, setBagliGorev] = useState(null)
  const [aciklamaDuzenle, setAciklamaDuzenle] = useState(false)
  const [aciklamaTaslak, setAciklamaTaslak] = useState('')
  const [aciklamaKaydediliyor, setAciklamaKaydediliyor] = useState(false)

  // Bağlı görev varsa yorumlarını çek (read-only gösterim için)
  useEffect(() => {
    if (talep?.gorevId) {
      gorevGetir(talep.gorevId).then(setBagliGorev).catch(() => setBagliGorev(null))
    } else {
      setBagliGorev(null)
    }
  }, [talep?.gorevId])

  if (!talep) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyState
          title="Talep bulunamadı"
          action={<Button variant="secondary" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => navigate('/servis-talepleri')}>Taleplere dön</Button>}
        />
      </div>
    )
  }

  const anaTur = ANA_TURLER.find(t => t.id === talep.anaTur)
  const durum = DURUM_LISTESI.find(d => d.id === talep.durum)
  const aciliyet = ACILIYET_SEVIYELERI.find(a => a.id === talep.aciliyet)
  const znaKullanicilar = kullanicilar.filter(k => k.tip !== 'musteri')

  const durumGuncelle = (yeniDurum, aciklama = '') => {
    talepGuncelle(talep.id, { durum: yeniDurum }, kullanici.ad, aciklama)
  }

  const atamayiKaydet = async () => {
    const k = secilenAtanan ? kullanicilar.find(x => x.id.toString() === secilenAtanan) : null
    setAtamaKaydediliyor(true)
    try {
      await talepGuncelle(
        talep.id,
        { atananKullaniciId: k?.id || null, atananKullaniciAd: k?.ad || null, durum: k ? 'atandi' : (talep.durum === 'atandi' ? 'bekliyor' : talep.durum) },
        kullanici.ad,
        k ? `${k.ad} kişisine atandı` : 'Atama kaldırıldı'
      )
    } finally {
      setAtamaKaydediliyor(false)
    }
  }

  const planliTarihGuncelle = (tarih) => {
    talepGuncelle(talep.id, { planliTarih: tarih || null }, kullanici.ad,
      tarih ? `Planlı tarih: ${new Date(tarih).toLocaleDateString('tr-TR')}` : 'Planlı tarih kaldırıldı')
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
  }

  const notGonder = () => {
    if (!yeniNot.trim()) return
    notEkle(talep.id, yeniNot.trim(), kullanici, notTip)
    setYeniNot('')
  }

  const tarihFormat = (t) =>
    new Date(t).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const META_ICONS = {
    lokasyon: MapPin, cihazTuru: Monitor, ilgiliKisi: User,
    telefon: Phone, uygunZaman: Clock,
  }

  const ekBilgiler = [
    { k: 'Lokasyon',    v: talep.lokasyon,  Icon: MapPin },
    { k: 'Cihaz/Sistem', v: talep.cihazTuru, Icon: Monitor },
    { k: 'İlgili Kişi', v: talep.ilgiliKisi, Icon: User },
    { k: 'Telefon',     v: talep.telefon,    Icon: Phone },
    { k: 'Uygun Zaman', v: talep.uygunZaman, Icon: Clock },
  ].filter(x => x.v && String(x.v).trim())

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>

      {/* Geri */}
      <button
        onClick={() => navigate('/servis-talepleri')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--text-tertiary)', font: '500 13px/18px var(--font-sans)',
          marginBottom: 16,
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-primary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
      >
        <ArrowLeft size={14} strokeWidth={1.5} /> Taleplere dön
      </button>

      {/* Başlık kartı */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <CodeBadge>{talep.talepNo}</CodeBadge>
                {durum && <Badge tone={DURUM_TONE[durum.id]}>{durum.isim}</Badge>}
                {aciliyet && <Badge tone={ACIL_TONE[aciliyet.id]}>{aciliyet.isim}</Badge>}
                {anaTur && <Badge tone="brand">{anaTur.isim}</Badge>}
              </div>
              <h1 className="t-h1">{talep.konu}</h1>
              <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', marginTop: 6 }}>
                <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{talep.firmaAdi || talep.musteriAd}</span>
                {talep.firmaAdi && <span style={{ color: 'var(--text-tertiary)' }}> · {talep.musteriAd}</span>}
              </p>
              <p className="t-caption" style={{ marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{tarihFormat(talep.olusturmaTarihi)}</p>
            </div>
          </div>

          {/* Hızlı aksiyonlar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
            {talep.durum !== 'tamamlandi' && talep.durum !== 'iptal' && (
              <>
                {talep.durum === 'bekliyor' && (
                  <Button variant="secondary" iconLeft={<Search size={14} strokeWidth={1.5} />} onClick={() => durumGuncelle('inceleniyor', 'İncelemeye alındı')}>
                    İncelemeye al
                  </Button>
                )}
                {talep.durum === 'devam_ediyor' && (
                  <Button
                    style={{ background: 'var(--success)', color: '#fff', border: '1px solid var(--success)' }}
                    iconLeft={<CheckCircle2 size={14} strokeWidth={1.5} />}
                    onClick={() => durumGuncelle('tamamlandi', 'Talep tamamlandı')}
                  >
                    Tamamlandı
                  </Button>
                )}
              </>
            )}
            <Button variant="tertiary" size="md" iconLeft={<Trash2 size={14} strokeWidth={1.5} />} onClick={() => setSilOnayGoster(true)}>
              Sil
            </Button>
          </div>
        </div>

        {/* Silme onayı */}
        {silOnayGoster && (
          <Alert
            variant="danger"
            title={<>Bu <strong>{talep.talepNo}</strong> numaralı talep kalıcı olarak silinecek. Emin misiniz?</>}
            action={
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" size="sm" onClick={() => setSilOnayGoster(false)}>İptal</Button>
                <Button variant="danger" size="sm" onClick={() => { talepSil(talep.id); navigate('/servis-talepleri') }}>Evet, sil</Button>
              </div>
            }
            style={{ marginTop: 16 }}
          />
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr) minmax(280px, 320px))', gap: 20 }}>

        {/* Sol — Ana içerik */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Açıklama */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <FileText size={16} strokeWidth={1.5} style={{ color: 'var(--text-secondary)' }} />
                <CardTitle style={{ margin: 0 }}>Talep İçeriği</CardTitle>
              </div>
              {!aciklamaDuzenle && (
                <button
                  onClick={() => { setAciklamaTaslak(talep.aciklama || ''); setAciklamaDuzenle(true) }}
                  title="Açıklamayı düzenle"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: 'transparent', border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    font: '500 12px/16px var(--font-sans)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <Pencil size={12} strokeWidth={1.5} /> Düzenle
                </button>
              )}
            </div>

            {aciklamaDuzenle ? (
              <div>
                <Textarea
                  value={aciklamaTaslak}
                  onChange={e => setAciklamaTaslak(e.target.value)}
                  rows={4}
                  placeholder="Talep detayını yazın…"
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Button
                    variant="primary"
                    size="sm"
                    iconLeft={<Check size={12} strokeWidth={1.5} />}
                    disabled={aciklamaKaydediliyor}
                    onClick={async () => {
                      setAciklamaKaydediliyor(true)
                      try {
                        await talepGuncelle(talep.id, { aciklama: aciklamaTaslak.trim() }, kullanici.ad, 'Açıklama güncellendi')
                        setAciklamaDuzenle(false)
                      } catch (err) {
                        alert('Kaydedilemedi: ' + (err?.message || 'bilinmeyen'))
                      } finally {
                        setAciklamaKaydediliyor(false)
                      }
                    }}
                  >
                    {aciklamaKaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeft={<X size={12} strokeWidth={1.5} />}
                    onClick={() => setAciklamaDuzenle(false)}
                  >
                    İptal
                  </Button>
                </div>
              </div>
            ) : talep.aciklama && talep.aciklama.trim() ? (
              <p style={{ font: '400 14px/22px var(--font-sans)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0 }}>
                {talep.aciklama}
              </p>
            ) : bagliGorev?.aciklama && bagliGorev.aciklama.trim() ? (
              <div>
                <p style={{ font: '400 14px/22px var(--font-sans)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0 }}>
                  {bagliGorev.aciklama}
                </p>
                <p style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', fontStyle: 'italic', marginTop: 8 }}>
                  Bu açıklama bağlı <button onClick={() => navigate(`/gorevler/${bagliGorev.id}`)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--brand-primary)', textDecoration: 'underline', font: 'inherit' }}>görevden</button> alındı.
                </p>
              </div>
            ) : (
              <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-tertiary)', fontStyle: 'italic', margin: 0 }}>
                Açıklama girilmemiş — sağ üstteki <strong>Düzenle</strong> butonuyla ekleyebilirsiniz.
              </p>
            )}
            {ekBilgiler.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
                {ekBilgiler.map(({ k, v, Icon }) => (
                  <div key={k}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
                      <Icon size={11} strokeWidth={1.5} /> {k}
                    </div>
                    <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Dosyalar */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <Paperclip size={11} strokeWidth={1.5} /> Ekler ({talep.dosyalar?.length || 0})
                </div>
                <label style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px',
                  border: '1px dashed var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  font: '500 12px/16px var(--font-sans)',
                  color: 'var(--text-secondary)',
                }}>
                  <Upload size={12} strokeWidth={1.5} /> Dosya ekle
                  <input
                    type="file"
                    multiple
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || [])
                      for (const f of files) {
                        try { await dosyaYukle(talep.id, f, kullanici?.ad) } catch {}
                      }
                      e.target.value = ''
                    }}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
              {(talep.dosyalar || []).map(d => (
                <div key={d.path} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', marginBottom: 6,
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-card)',
                }}>
                  {d.type?.startsWith('image/')
                    ? <ImageIcon size={14} strokeWidth={1.5} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
                    : <FileText size={14} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.name}>
                      {d.name}
                    </div>
                    <div className="t-caption">
                      {d.size ? `${(d.size / 1024).toFixed(0)} KB` : ''}
                      {d.uploaderAd && ` · ${d.uploaderAd}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const url = await dosyaLinkiAl(d.path)
                        window.open(url, '_blank')
                      } catch {}
                    }}
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    <Download size={12} strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm('Dosya silinsin mi?')) return
                      try { await dosyaSil(talep.id, d.path) } catch {}
                    }}
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    <Trash2 size={12} strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
          </Card>

          {/* Bağlı görev yorumları (read-only) — talep görevden oluşturulduysa */}
          {bagliGorev && (bagliGorev.yorumlar || []).length > 0 && (
            <Card padding={0}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border-default)' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <MessageSquare size={16} strokeWidth={1.5} style={{ color: 'var(--brand-primary)' }} />
                  <CardTitle style={{ margin: 0 }}>Bağlı görev yorumları</CardTitle>
                  <Badge tone="lead">{(bagliGorev.yorumlar || []).length}</Badge>
                </div>
                <button
                  onClick={() => navigate(`/gorevler/${bagliGorev.id}`)}
                  style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '4px 10px', font: '500 12px/16px var(--font-sans)', color: 'var(--brand-primary)', cursor: 'pointer' }}
                >
                  Göreve git →
                </button>
              </div>
              <div style={{ padding: '12px 20px' }}>
                {(bagliGorev.yorumlar || []).map(y => (
                  <div key={y.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border-default)' }}>
                    <Avatar name={y.yazar} size="sm" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{y.yazar}</span>
                        <span style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>{y.tarih}</span>
                        {y.duzenlendi && <span style={{ font: '400 10px/14px var(--font-sans)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>(düzenlendi)</span>}
                      </div>
                      <div style={{ font: '400 13px/20px var(--font-sans)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                        {y.icerik}
                      </div>
                    </div>
                  </div>
                ))}
                <p style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', fontStyle: 'italic', marginTop: 10 }}>
                  Yorumlar görevde tutuluyor — yeni yorum eklemek için "Göreve git" linkini kullanın.
                </p>
              </div>
            </Card>
          )}

          {/* Yazışmalar */}
          <Card padding={0}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border-default)' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <MessageSquare size={16} strokeWidth={1.5} style={{ color: 'var(--text-secondary)' }} />
                <CardTitle style={{ margin: 0 }}>Notlar & Yazışmalar</CardTitle>
              </div>
              <div style={{ display: 'inline-flex', padding: 2, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)' }}>
                {[
                  { id: 'ic',      label: 'İç Not',      C: Lock },
                  { id: 'musteri', label: 'Müşteriye',   C: Mail },
                ].map(t => {
                  const active = notTip === t.id
                  const IconC = t.C
                  return (
                    <button
                      key={t.id}
                      onClick={() => setNotTip(t.id)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px',
                        borderRadius: 'calc(var(--radius-sm) - 2px)',
                        background: active ? 'var(--surface-card)' : 'transparent',
                        boxShadow: active ? 'var(--shadow-sm)' : 'none',
                        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        border: 'none', cursor: 'pointer',
                        font: '500 12px/16px var(--font-sans)',
                      }}
                    >
                      <IconC size={11} strokeWidth={1.5} /> {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ minHeight: 160, maxHeight: 360, overflowY: 'auto', padding: 16 }}>
              {(talep.notlar || []).length === 0 ? (
                <EmptyState title="Henüz not eklenmedi" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(talep.notlar || []).map(not => {
                    const icNot = not.tip === 'ic'
                    const IconC = icNot ? Lock : Mail
                    const tone = icNot ? 'brand' : 'aktif'
                    return (
                      <div
                        key={not.id}
                        style={{
                          padding: 12,
                          background: icNot ? 'var(--brand-primary-soft)' : 'var(--success-soft)',
                          border: `1px solid ${icNot ? 'var(--border-default)' : 'var(--success-border)'}`,
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <IconC size={11} strokeWidth={1.5} style={{ color: icNot ? 'var(--brand-primary)' : 'var(--success)' }} />
                            <span style={{ font: '600 12px/16px var(--font-sans)', color: icNot ? 'var(--brand-primary)' : 'var(--success)' }}>
                              {icNot ? 'İç not' : 'Müşteriye'}
                            </span>
                            <span style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-secondary)' }}>· {not.kullaniciAd}</span>
                          </div>
                          <span className="t-caption" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {new Date(not.tarih).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                          </span>
                        </div>
                        <p style={{ font: '400 13px/20px var(--font-sans)', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap' }}>
                          {not.metin}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-default)', background: 'var(--surface-sunken)' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                marginBottom: 10,
                background: notTip === 'ic' ? 'var(--brand-primary-soft)' : 'var(--success-soft)',
                color: notTip === 'ic' ? 'var(--brand-primary)' : 'var(--success)',
                font: '500 12px/16px var(--font-sans)',
              }}>
                {notTip === 'ic'
                  ? <><Lock size={11} strokeWidth={1.5} /> İç not — müşteri görmeyecek</>
                  : <><Mail size={11} strokeWidth={1.5} /> Bu not müşteriye de görünür</>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Textarea
                    value={yeniNot}
                    onChange={e => setYeniNot(e.target.value)}
                    placeholder="Not ekle…"
                    rows={2}
                  />
                </div>
                <Button
                  variant="primary"
                  iconLeft={<Send size={14} strokeWidth={1.5} />}
                  onClick={notGonder}
                  disabled={!yeniNot.trim()}
                  style={{ alignSelf: 'flex-start' }}
                >
                  Ekle
                </Button>
              </div>
            </div>
          </Card>

          {/* Durum geçmişi */}
          <Card>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Clock size={16} strokeWidth={1.5} style={{ color: 'var(--text-secondary)' }} />
              <CardTitle style={{ margin: 0 }}>Durum Geçmişi</CardTitle>
            </div>
            {(talep.durumGecmisi || []).length === 0 ? (
              <p className="t-caption">Henüz durum değişikliği yok.</p>
            ) : (
              <div style={{ position: 'relative', paddingLeft: 24 }}>
                <div style={{ position: 'absolute', left: 8, top: 0, bottom: 0, width: 1, background: 'var(--border-default)' }} />
                {[...(talep.durumGecmisi || [])].reverse().map((g, i) => {
                  const d = DURUM_LISTESI.find(x => x.id === g.durum)
                  return (
                    <div key={i} style={{ position: 'relative', paddingBottom: i < (talep.durumGecmisi?.length || 1) - 1 ? 16 : 0 }}>
                      <span style={{
                        position: 'absolute', left: -20, top: 2,
                        width: 17, height: 17, borderRadius: '50%',
                        background: 'var(--surface-card)',
                        border: '2px solid var(--brand-primary)',
                      }} />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          {d && <Badge tone={DURUM_TONE[d.id]}>{d.isim}</Badge>}
                        </div>
                        {g.aciklama && (
                          <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', margin: '0 0 2px' }}>
                            {g.aciklama}
                          </p>
                        )}
                        <p className="t-caption" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {g.kullaniciAd} · {tarihFormat(g.tarih)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Sağ — Yönetim paneli */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Durum değiştir */}
          <Card>
            <p className="t-label" style={{ marginBottom: 10 }}>DURUM</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {DURUM_LISTESI.map(d => {
                const active = talep.durum === d.id
                return (
                  <button
                    key={d.id}
                    onClick={() => durumGuncelle(d.id, `Durum "${d.isim}" olarak güncellendi`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      background: active ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                      border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                      color: active ? 'var(--brand-primary)' : 'var(--text-secondary)',
                      font: active ? '600 13px/18px var(--font-sans)' : '400 13px/18px var(--font-sans)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ flex: 1 }}>{d.isim}</span>
                    {active && <Check size={14} strokeWidth={2} />}
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Atama */}
          <Card>
            <p className="t-label" style={{ marginBottom: 10 }}>ATAMA</p>
            {talep.atananKullaniciAd && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '6px 12px', marginBottom: 10,
                borderRadius: 'var(--radius-pill)',
                background: 'var(--brand-primary-soft)',
              }}>
                <Avatar name={talep.atananKullaniciAd} size="xs" />
                <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--brand-primary)' }}>
                  {talep.atananKullaniciAd}
                </span>
              </div>
            )}
            <CustomSelect
              value={secilenAtanan || talep.atananKullaniciId?.toString() || ''}
              onChange={e => setSecilenAtanan(e.target.value)}
            >
              <option value="">— Atanmadı —</option>
              {znaKullanicilar.map(k => <option key={k.id} value={k.id?.toString()}>{k.ad}</option>)}
            </CustomSelect>
            {(() => {
              const mevcut = talep.atananKullaniciId?.toString() || ''
              const secili = secilenAtanan !== '' ? secilenAtanan : mevcut
              const degisti = secilenAtanan !== '' && secili !== mevcut
              return (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={atamayiKaydet}
                  disabled={!degisti || atamaKaydediliyor}
                  style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
                >
                  {atamaKaydediliyor
                    ? 'Kaydediliyor…'
                    : degisti
                      ? (secili ? 'Atamayı kaydet' : 'Atamayı kaldır')
                      : 'Değişiklik yok'}
                </Button>
              )
            })()}
          </Card>

          {/* Planlı tarih */}
          <Card>
            <p className="t-label" style={{ marginBottom: 10 }}>PLANLI SERVİS TARİHİ</p>
            <input
              type="date"
              value={talep.planliTarih ? talep.planliTarih.split('T')[0] : ''}
              onChange={e => planliTarihGuncelle(e.target.value || null)}
              style={{
                width: '100%', height: 36, padding: '0 12px',
                background: 'var(--surface-card)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-sans)', fontSize: 14,
                color: 'var(--text-primary)', outline: 'none',
                fontVariantNumeric: 'tabular-nums',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--border-focus)'; e.currentTarget.style.boxShadow = 'var(--focus-ring)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.boxShadow = 'none' }}
            />
          </Card>

          {/* Müşteri memnuniyet değerlendirmesi */}
          {talep.durum === 'tamamlandi' && (
            <Card style={{ borderColor: 'var(--warning-border)' }}>
              <p className="t-label" style={{ marginBottom: 10 }}>MÜŞTERİ DEĞERLENDİRMESİ</p>
              {mevcutDeg ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                    {[1,2,3,4,5].map(i => (
                      <Star
                        key={i}
                        size={22}
                        strokeWidth={1.5}
                        fill={i <= mevcutDeg.puan ? 'var(--warning)' : 'transparent'}
                        style={{ color: i <= mevcutDeg.puan ? 'var(--warning)' : 'var(--border-default)' }}
                      />
                    ))}
                    <span style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--warning)', marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>
                      {mevcutDeg.puan}/5
                    </span>
                  </div>
                  {mevcutDeg.yorum && (
                    <p style={{ font: '400 13px/20px var(--font-sans)', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 8 }}>
                      "{mevcutDeg.yorum}"
                    </p>
                  )}
                  <p className="t-caption" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {new Date(mevcutDeg.tarih).toLocaleDateString('tr-TR')} · {mevcutDeg.kaydeden}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="t-caption" style={{ marginBottom: 10 }}>Müşterinin hizmet memnuniyetini kaydedin.</p>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                    {[1,2,3,4,5].map(i => {
                      const filled = i <= (degHover || degPuan)
                      return (
                        <button
                          key={i}
                          onClick={() => setDegPuan(i)}
                          onMouseEnter={() => setDegHover(i)}
                          onMouseLeave={() => setDegHover(0)}
                          aria-label={`${i} yıldız`}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: 2,
                            transform: filled ? 'scale(1.1)' : 'scale(1)',
                            transition: 'transform 120ms',
                          }}
                        >
                          <Star
                            size={28}
                            strokeWidth={1.5}
                            fill={filled ? 'var(--warning)' : 'transparent'}
                            style={{ color: filled ? 'var(--warning)' : 'var(--border-default)' }}
                          />
                        </button>
                      )
                    })}
                  </div>
                  {degPuan > 0 && (
                    <p style={{
                      font: '500 13px/18px var(--font-sans)',
                      color: degPuan >= 4 ? 'var(--success)' : degPuan === 3 ? 'var(--warning)' : 'var(--danger)',
                      marginBottom: 10,
                    }}>
                      {['', 'Çok Kötü', 'Kötü', 'Orta', 'İyi', 'Mükemmel'][degPuan]}
                    </p>
                  )}
                  <Textarea
                    value={degYorum}
                    onChange={e => setDegYorum(e.target.value)}
                    placeholder="Yorum (isteğe bağlı)…"
                    rows={2}
                    style={{ marginBottom: 10 }}
                  />
                  <Button
                    variant="primary"
                    disabled={!degPuan}
                    iconLeft={<Star size={14} strokeWidth={1.5} fill={degPuan ? '#fff' : 'none'} />}
                    onClick={degerlendirmeKaydet}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Değerlendirmeyi kaydet
                  </Button>
                </div>
              )}
            </Card>
          )}

          {/* Müşteri bilgileri */}
          <Card>
            <p className="t-label" style={{ marginBottom: 10 }}>MÜŞTERİ BİLGİSİ</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { k: 'Müşteri',     v: talep.musteriAd },
                talep.firmaAdi && { k: 'Firma', v: talep.firmaAdi },
                { k: 'İlgili Kişi', v: talep.ilgiliKisi },
                talep.telefon && { k: 'Telefon', v: talep.telefon, tabular: true },
                talep.uygunZaman && { k: 'Uygun Zaman', v: talep.uygunZaman },
              ].filter(Boolean).map(({ k, v, tabular }) => (
                <div key={k}>
                  <div className="t-label" style={{ marginBottom: 2 }}>{k.toUpperCase()}</div>
                  <div style={{
                    font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)',
                    fontVariantNumeric: tabular ? 'tabular-nums' : 'normal',
                  }}>
                    {v}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
