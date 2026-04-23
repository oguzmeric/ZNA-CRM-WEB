import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, User, Plus, FileText, AlertCircle, ArrowRight,
  Phone, MessageCircle, Mail, Handshake, Building2, Monitor, Link2, Video, Send, Lightbulb,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useBildirim } from '../context/BildirimContext'
import CustomSelect from '../components/CustomSelect'
import { gorusmeGetir, gorusmeGuncelle as gorusmeGuncelleService } from '../services/gorusmeService'
import { gorevleriGetir, gorevEkle } from '../services/gorevService'
import {
  Button, Input, Textarea, Label,
  Card, CardTitle, Badge, CodeBadge, EmptyState, SegmentedControl,
} from '../components/ui'

const varsayilanKonular = [
  'CCTV', 'NVR-ANALİZ', 'Network', 'Teklif', 'Demo',
  'Fuar', 'Access Kontrol', 'Mobiltek', 'Donanım', 'Yazılım', 'Diğer',
]

const durumlar = [
  { id: 'acik',      isim: 'Açık',      tone: 'acik' },
  { id: 'beklemede', isim: 'Beklemede', tone: 'beklemede' },
  { id: 'kapali',    isim: 'Kapalı',    tone: 'kapali' },
]

const gorevOncelikleri = [
  { id: 'dusuk',  isim: 'Düşük',  tone: 'pasif' },
  { id: 'orta',   isim: 'Orta',   tone: 'beklemede' },
  { id: 'yuksek', isim: 'Yüksek', tone: 'kayip' },
]

const IRTIBAT = {
  telefon:         { C: Phone,         isim: 'Telefon' },
  whatsapp:        { C: MessageCircle, isim: 'WhatsApp' },
  mail:            { C: Mail,          isim: 'Mail' },
  yuz_yuze:        { C: Handshake,     isim: 'Yüz Yüze' },
  merkez:          { C: Building2,     isim: 'Merkez' },
  uzak_baglanti:   { C: Monitor,       isim: 'Uzak Bağlantı' },
  bridge:          { C: Link2,         isim: 'Bridge' },
  online_toplanti: { C: Video,         isim: 'Online Toplantı' },
  telegram:        { C: Send,          isim: 'Telegram' },
  diger:           { C: Lightbulb,     isim: 'Diğer' },
}

const gorevDurumTone = (d) => {
  if (d === 'tamamlandi') return { tone: 'aktif', isim: 'Tamamlandı' }
  if (d === 'devam')      return { tone: 'beklemede', isim: 'Devam Ediyor' }
  return { tone: 'lead', isim: 'Bekliyor' }
}

const bosGorevForm = { baslik: '', aciklama: '', atanan: '', oncelik: 'orta', sonTarih: '' }

function GorusmeDetay() {
  const { id } = useParams()
  const { kullanici, kullanicilar } = useAuth()
  const { bildirimEkle } = useBildirim()
  const navigate = useNavigate()

  const [gorusme, setGorusme] = useState(null)
  const [gorevler, setGorevler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)

  const [duzenleAcik, setDuzenleAcik] = useState(false)
  const [duzenleForm, setDuzenleForm] = useState({})
  const [manuelKonuAc, setManuelKonuAc] = useState(false)
  const [gorevFormAcik, setGorevFormAcik] = useState(false)
  const [gorevForm, setGorevForm] = useState(bosGorevForm)

  useEffect(() => {
    (async () => {
      setYukleniyor(true)
      try {
        const [g, tum] = await Promise.all([gorusmeGetir(id), gorevleriGetir()])
        setGorusme(g)
        setGorevler(tum.filter(t => t.firmaAdi === g?.firmaAdi))
      } finally { setYukleniyor(false) }
    })()
  }, [id])

  if (yukleniyor) return <div style={{ padding: 24 }}><EmptyState title="Yükleniyor…" /></div>

  if (!gorusme) return (
    <div style={{ padding: 24 }}>
      <EmptyState
        icon={<Phone size={32} strokeWidth={1.5} />}
        title="Görüşme bulunamadı"
        action={
          <Button variant="secondary" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => navigate('/gorusmeler')}>
            Görüşmelere dön
          </Button>
        }
      />
    </div>
  )

  const durum = durumlar.find(d => d.id === gorusme.durum)

  const gorusmeGuncelle = async (g) => {
    const gncl = await gorusmeGuncelleService(gorusme.id, { ...gorusme, ...g })
    if (gncl) setGorusme(gncl)
  }

  const duzenleAc = () => {
    const manuelMi = !varsayilanKonular.includes(gorusme.konu)
    setDuzenleForm({
      takipNotu: gorusme.notlar || '',
      konu: manuelMi ? '' : gorusme.konu,
      manuelKonu: manuelMi ? gorusme.konu : '',
      durum: gorusme.durum,
    })
    setManuelKonuAc(manuelMi); setDuzenleAcik(true)
  }

  const duzenleKaydet = () => {
    const sonKonu = manuelKonuAc ? duzenleForm.manuelKonu : duzenleForm.konu
    if (!sonKonu) return
    gorusmeGuncelle({ notlar: duzenleForm.takipNotu, konu: sonKonu, durum: duzenleForm.durum })
    setDuzenleAcik(false)
  }

  const gorevAc = () => {
    setGorevForm({ ...bosGorevForm, baslik: `${gorusme.firmaAdi} — ${gorusme.konu}`, aciklama: gorusme.notlar || '' })
    setGorevFormAcik(true)
  }

  const gorevKaydet = async () => {
    if (!gorevForm.baslik || !gorevForm.atanan || !gorevForm.sonTarih) {
      alert('Başlık, atanan kişi ve son tarih zorunludur.')
      return
    }
    const atananKisi = kullanicilar.find(k => k.id?.toString() === gorevForm.atanan)
    const yeniGorev = {
      baslik: gorevForm.baslik, aciklama: gorevForm.aciklama,
      durum: 'bekliyor', oncelik: gorevForm.oncelik,
      atananId: gorevForm.atanan, atananAd: atananKisi?.ad || '',
      olusturanAd: kullanici.ad, bitisTarihi: gorevForm.sonTarih,
      firmaAdi: gorusme.firmaAdi,
    }
    const eklenen = await gorevEkle(yeniGorev)
    if (eklenen) setGorevler(prev => [...prev, eklenen])
    const oncelik = gorevOncelikleri.find(o => o.id === gorevForm.oncelik)
    bildirimEkle(gorevForm.atanan, 'Yeni Görev Atandı', `"${gorevForm.baslik}" görevi size atandı. Öncelik: ${oncelik?.isim}`, 'bilgi', '/gorevler')
    setGorevForm(bosGorevForm); setGorevFormAcik(false)
  }

  const Ir = IRTIBAT[gorusme.irtibatSekli]

  return (
    <div style={{ padding: 24, maxWidth: 880, margin: '0 auto' }}>

      {/* Geri */}
      <button
        onClick={() => navigate('/gorusmeler')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--text-tertiary)', font: '500 13px/18px var(--font-sans)',
          marginBottom: 16,
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-primary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
      >
        <ArrowLeft size={14} strokeWidth={1.5} /> Görüşmelere dön
      </button>

      {/* Ana kart */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <CodeBadge>{gorusme.aktNo}</CodeBadge>
              {durum && <Badge tone={durum.tone}>{durum.isim}</Badge>}
            </div>
            <h1 className="t-h1">{gorusme.firmaAdi}</h1>
            {gorusme.muhatapAd && (
              <p style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '400 13px/18px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                <User size={12} strokeWidth={1.5} /> {gorusme.muhatapAd}
              </p>
            )}
          </div>
          <Button
            variant={duzenleAcik ? 'secondary' : 'primary'}
            iconLeft={duzenleAcik ? null : undefined}
            onClick={duzenleAcik ? () => setDuzenleAcik(false) : duzenleAc}
          >
            {duzenleAcik ? 'İptal' : 'Düzenle'}
          </Button>
        </div>

        {/* Görüntüleme modu */}
        {!duzenleAcik && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
              <div>
                <div className="t-label" style={{ marginBottom: 4 }}>KONU</div>
                <Badge tone="brand">{gorusme.konu}</Badge>
              </div>
              <div>
                <div className="t-label" style={{ marginBottom: 4 }}>İRTİBAT ŞEKLİ</div>
                {Ir ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                    <Ir.C size={14} strokeWidth={1.5} /> {Ir.isim}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                )}
              </div>
              <div>
                <div className="t-label" style={{ marginBottom: 4 }}>GÖRÜŞEN</div>
                <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{gorusme.hazirlayan || gorusme.gorusen}</span>
              </div>
              <div>
                <div className="t-label" style={{ marginBottom: 4 }}>TARİH</div>
                <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{gorusme.tarih}</span>
              </div>
              <div>
                <div className="t-label" style={{ marginBottom: 4 }}>FİRMA GEÇMİŞİ</div>
                <button
                  onClick={() => navigate(`/firma-gecmisi/${encodeURIComponent(gorusme.firmaAdi)}`)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--brand-primary)', font: '500 13px/18px var(--font-sans)' }}
                >
                  Geçmişi gör <ArrowRight size={12} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {(gorusme.notlar || gorusme.takipNotu) && (
              <div style={{ paddingTop: 16, marginTop: 16, borderTop: '1px solid var(--border-default)' }}>
                <div className="t-label" style={{ marginBottom: 4 }}>NOTLAR</div>
                <p style={{ font: '400 13px/20px var(--font-sans)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0 }}>
                  {gorusme.notlar || gorusme.takipNotu}
                </p>
              </div>
            )}

            {/* Durum SegmentedControl */}
            <div style={{ paddingTop: 16, marginTop: 16, borderTop: '1px solid var(--border-default)' }}>
              <div className="t-label" style={{ marginBottom: 8 }}>DURUM</div>
              <SegmentedControl
                options={durumlar.map(d => ({ value: d.id, label: d.isim }))}
                value={gorusme.durum}
                onChange={v => gorusmeGuncelle({ durum: v })}
              />
            </div>
          </>
        )}

        {/* Düzenleme */}
        {duzenleAcik && (
          <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <Label>Konu</Label>
                <CustomSelect
                  value={manuelKonuAc ? '__manuel__' : duzenleForm.konu}
                  onChange={e => {
                    if (e.target.value === '__manuel__') {
                      setManuelKonuAc(true); setDuzenleForm({ ...duzenleForm, konu: '', manuelKonu: '' })
                    } else {
                      setManuelKonuAc(false); setDuzenleForm({ ...duzenleForm, konu: e.target.value, manuelKonu: '' })
                    }
                  }}
                >
                  <option value="">Konu seç…</option>
                  {varsayilanKonular.map(k => <option key={k} value={k}>{k}</option>)}
                  <option value="__manuel__">+ Manuel gir</option>
                </CustomSelect>
                {manuelKonuAc && (
                  <Input
                    style={{ marginTop: 8 }}
                    value={duzenleForm.manuelKonu || ''}
                    onChange={e => setDuzenleForm({ ...duzenleForm, manuelKonu: e.target.value.toUpperCase() })}
                    placeholder="Konu yazın…"
                    autoFocus
                  />
                )}
              </div>
              <div>
                <Label>Durum</Label>
                <CustomSelect value={duzenleForm.durum} onChange={e => setDuzenleForm({ ...duzenleForm, durum: e.target.value })}>
                  {durumlar.map(d => <option key={d.id} value={d.id}>{d.isim}</option>)}
                </CustomSelect>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <Label>Notlar</Label>
                <Textarea
                  value={duzenleForm.takipNotu}
                  onChange={e => setDuzenleForm({ ...duzenleForm, takipNotu: e.target.value })}
                  rows={4}
                  placeholder="Görüşme detayları, takip edilecek konular…"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" onClick={duzenleKaydet}>Kaydet</Button>
              <Button variant="secondary" onClick={() => setDuzenleAcik(false)}>İptal</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Bağlı görevler */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <CardTitle>Bağlı Görevler</CardTitle>
            <p className="t-caption" style={{ marginTop: 2 }}>
              {gorevler.length > 0
                ? <><span className="tabular-nums">{gorevler.length}</span> görev</>
                : 'Bu görüşmeye henüz görev eklenmedi'}
            </p>
          </div>
          <Button
            variant={gorevFormAcik ? 'secondary' : 'primary'}
            iconLeft={gorevFormAcik ? null : <Plus size={14} strokeWidth={1.5} />}
            onClick={gorevFormAcik ? () => setGorevFormAcik(false) : gorevAc}
          >
            {gorevFormAcik ? 'İptal' : 'Görev oluştur'}
          </Button>
        </div>

        {/* Görev formu */}
        {gorevFormAcik && (
          <div style={{
            padding: 16,
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-sunken)',
            border: '1px solid var(--border-default)',
            marginBottom: 16,
          }}>
            <p className="t-label" style={{ marginBottom: 12 }}>YENİ GÖREV</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <Label required>Başlık</Label>
                <Input value={gorevForm.baslik} onChange={e => setGorevForm({ ...gorevForm, baslik: e.target.value })} placeholder="Görev başlığı" />
              </div>
              <div>
                <Label required>Atanacak kişi</Label>
                <CustomSelect value={gorevForm.atanan} onChange={e => setGorevForm({ ...gorevForm, atanan: e.target.value })}>
                  <option value="">Kişi seç…</option>
                  {kullanicilar.filter(k => k.tip !== 'musteri').map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
                </CustomSelect>
              </div>
              <div>
                <Label required>Son tarih</Label>
                <Input type="date" value={gorevForm.sonTarih} onChange={e => setGorevForm({ ...gorevForm, sonTarih: e.target.value })} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <Label>Öncelik</Label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {gorevOncelikleri.map(o => {
                    const active = gorevForm.oncelik === o.id
                    return (
                      <button
                        key={o.id}
                        onClick={() => setGorevForm({ ...gorevForm, oncelik: o.id })}
                        style={{
                          flex: 1, height: 36, padding: '0 10px',
                          borderRadius: 'var(--radius-sm)',
                          background: active ? 'var(--brand-primary)' : 'var(--surface-card)',
                          color: active ? '#fff' : 'var(--text-secondary)',
                          border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                          font: '500 13px/18px var(--font-sans)',
                          cursor: 'pointer',
                        }}
                      >
                        {o.isim}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <Label>Açıklama</Label>
                <Textarea value={gorevForm.aciklama} onChange={e => setGorevForm({ ...gorevForm, aciklama: e.target.value })} rows={3} placeholder="Görev detayları…" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" onClick={gorevKaydet}>Görevi kaydet</Button>
              <Button variant="secondary" onClick={() => setGorevFormAcik(false)}>İptal</Button>
            </div>
          </div>
        )}

        {/* Liste */}
        {gorevler.length === 0 && !gorevFormAcik ? (
          <EmptyState
            icon={<FileText size={28} strokeWidth={1.5} />}
            title="Henüz görev eklenmedi"
            description="Yukarıdaki butonla ilk görevi oluşturabilirsin."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {gorevler.map(gorev => {
              const oncelik = gorevOncelikleri.find(o => o.id === gorev.oncelik)
              const db = gorevDurumTone(gorev.durum)
              const atananKisi = kullanicilar.find(k => k.id?.toString() === gorev.atananId?.toString())
              const gecikti = gorev.bitisTarihi && new Date(gorev.bitisTarihi) < new Date() && gorev.durum !== 'tamamlandi'
              return (
                <div
                  key={gorev.id}
                  onClick={() => navigate(`/gorevler/${gorev.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${gecikti ? 'var(--danger-border)' : 'var(--border-default)'}`,
                    borderLeft: `3px solid ${gecikti ? 'var(--danger)' : 'var(--border-default)'}`,
                    background: 'var(--surface-card)',
                    cursor: 'pointer',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-card)'}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {gorev.baslik}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      {oncelik && <Badge tone={oncelik.tone}>{oncelik.isim}</Badge>}
                      <Badge tone={db.tone}>{db.isim}</Badge>
                      {gecikti && <Badge tone="kayip" icon={<AlertCircle size={11} strokeWidth={1.5} />}>Gecikti</Badge>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    {atananKisi && <span>{atananKisi.ad}</span>}
                    {gorev.bitisTarihi && (
                      <span style={{ color: gecikti ? 'var(--danger)' : 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                        {gorev.bitisTarihi}
                      </span>
                    )}
                    <ArrowRight size={14} strokeWidth={1.5} style={{ color: 'var(--brand-primary)' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

export default GorusmeDetay
