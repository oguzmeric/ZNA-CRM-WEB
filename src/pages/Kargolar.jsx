import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Package, ArrowUpRight, ArrowDownLeft, Truck, AlertTriangle, Check,
  Trash2, ChevronRight,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useBildirim } from '../context/BildirimContext'
import { useKargo, KARGO_FIRMALARI } from '../context/KargoContext'
import CustomSelect from '../components/CustomSelect'
import {
  Button, SearchInput, Input, Textarea, Label,
  Card, Badge, CodeBadge, KPICard, EmptyState, Avatar,
} from '../components/ui'

const KARGO_DURUM_TONE = {
  hazirlaniyor:    'beklemede',
  kargoya_verildi: 'lead',
  yolda:           'lead',
  dagitimda:       'beklemede',
  teslim_edildi:   'aktif',
  iade:            'kayip',
  kayip:           'kayip',
}

const bosForm = {
  tip: 'giden',
  kargoFirmasi: '',
  takipNo: '',
  gonderenAd: '', gonderenFirma: '', gonderenAdres: '', gonderenTelefon: '',
  aliciAd: '', aliciFirma: '', aliciAdres: '', aliciTelefon: '',
  icerik: '', agirlik: '', desi: '', ucret: '',
  odemeYontemi: 'gonderici', tahminiTeslim: '',
  ilgiliKullaniciIds: [], ilgiliModul: null,
}

export default function Kargolar() {
  const navigate = useNavigate()
  const { kullanici, kullanicilar } = useAuth()
  const { bildirimEkle } = useBildirim()
  const { kargolar, kargoOlustur, kargoSil, KARGO_FIRMALARI: firmalar, DURUM_LISTESI: durumlar } = useKargo()

  const [formAcik, setFormAcik] = useState(false)
  const [form, setForm] = useState({ ...bosForm })
  const [adim, setAdim] = useState(1)
  const [aramaMetni, setAramaMetni] = useState('')
  const [durumFiltre, setDurumFiltre] = useState('hepsi')
  const [tipFiltre, setTipFiltre] = useState('hepsi')
  const [silOnayId, setSilOnayId] = useState(null)

  const znaKullanicilar = kullanicilar.filter(k => k.tip !== 'musteri')

  const yeniKargoAc = () => {
    const v = { ...bosForm }
    if (kullanici) {
      if (v.tip === 'giden') { v.gonderenFirma = 'ZNA Teknoloji'; v.gonderenAd = kullanici.ad }
      if (!v.ilgiliKullaniciIds.includes(kullanici.id.toString())) {
        v.ilgiliKullaniciIds = [kullanici.id.toString()]
      }
    }
    setForm(v); setAdim(1); setFormAcik(true)
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50)
  }

  const handleTipDegis = (tip) => {
    const g = { ...form, tip }
    if (tip === 'giden') { g.gonderenFirma = 'ZNA Teknoloji'; g.gonderenAd = kullanici?.ad || '' }
    else if (g.gonderenFirma === 'ZNA Teknoloji') { g.gonderenFirma = ''; g.gonderenAd = '' }
    setForm(g)
  }

  const ilgiliToggle = (userId) => {
    const id = userId.toString()
    setForm(prev => ({
      ...prev,
      ilgiliKullaniciIds: prev.ilgiliKullaniciIds.includes(id)
        ? prev.ilgiliKullaniciIds.filter(x => x !== id)
        : [...prev.ilgiliKullaniciIds, id],
    }))
  }

  const adimGecerli = () => {
    if (adim === 1) return form.kargoFirmasi !== ''
    if (adim === 2) return (form.aliciAd || form.aliciFirma) && (form.gonderenAd || form.gonderenFirma)
    return true
  }

  const kaydet = async () => {
    if (!form.kargoFirmasi) { alert('Kargo firması seçiniz.'); return }
    if (!form.icerik)        { alert('Gönderi içeriğini belirtiniz.'); return }

    const y = await kargoOlustur(form, kullanici)
    if (!y) { alert('Kargo kaydedilemedi, tekrar deneyin.'); return }

    form.ilgiliKullaniciIds
      .filter(id => id !== kullanici.id.toString())
      .forEach(id => {
        const firma = firmalar.find(f => f.id === form.kargoFirmasi)
        const taraf = form.tip === 'giden'
          ? `→ ${form.aliciFirma || form.aliciAd}`
          : `← ${form.gonderenFirma || form.gonderenAd}`
        bildirimEkle(id, 'Yeni Kargo Kaydı',
          `${y.kargoNo} — ${firma?.isim} ${taraf}. İçerik: ${form.icerik}`,
          'bilgi', `/kargolar/${y.id}`)
      })

    setFormAcik(false); setForm({ ...bosForm }); setAdim(1)
    navigate(`/kargolar/${y.id}`)
  }

  const filtreli = kargolar
    .filter(k => durumFiltre === 'hepsi' || k.durum === durumFiltre)
    .filter(k => tipFiltre === 'hepsi' || k.tip === tipFiltre)
    .filter(k => {
      if (!aramaMetni) return true
      const q = aramaMetni.toLowerCase()
      return [k.kargoNo, k.alici?.ad, k.alici?.firma, k.gonderen?.ad, k.gonderen?.firma, k.takipNo, k.icerik]
        .some(v => (v || '').toLowerCase().includes(q))
    })

  const ist = {
    toplam: kargolar.length,
    aktif: kargolar.filter(k => !['teslim_edildi', 'iade'].includes(k.durum)).length,
    teslim: kargolar.filter(k => k.durum === 'teslim_edildi').length,
    iade: kargolar.filter(k => k.durum === 'iade').length,
    dagitimda: kargolar.filter(k => k.durum === 'dagitimda').length,
  }

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Kargo Takip</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            <span className="tabular-nums">{kargolar.length}</span> kayıt · <span className="tabular-nums">{ist.aktif}</span> aktif
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={yeniKargoAc}>
          Yeni kargo
        </Button>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KPICard label="TOPLAM"       value={ist.toplam}    icon={<Package size={16} strokeWidth={1.5} />} />
        <KPICard label="AKTİF"        value={ist.aktif}     footer={<span style={{ color: 'var(--warning)' }}>İşlemde</span>} />
        <KPICard label="DAĞITIMDA"    value={ist.dagitimda} footer={<span style={{ color: 'var(--warning)' }}>Yolda</span>} />
        <KPICard label="TESLİM"       value={ist.teslim}    footer={<span style={{ color: 'var(--success)' }}>Tamamlandı</span>} />
        <KPICard label="İADE"         value={ist.iade}      footer={ist.iade > 0 ? <span style={{ color: 'var(--danger)' }}>Var</span> : <span style={{ color: 'var(--text-tertiary)' }}>Yok</span>} />
      </div>

      {/* Form */}
      {formAcik && (
        <Card style={{ marginBottom: 20 }}>
          {/* Başlık + adım göstergesi */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <h2 className="t-h2" style={{ margin: 0 }}>Yeni Kargo Kaydı</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {[1, 2, 3].map(a => (
                <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 26, height: 26,
                    borderRadius: '50%',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    font: '600 12px/1 var(--font-sans)',
                    background: adim >= a ? 'var(--brand-primary)' : 'var(--surface-sunken)',
                    color: adim >= a ? '#fff' : 'var(--text-tertiary)',
                    border: adim >= a ? 'none' : '1px solid var(--border-default)',
                  }}>
                    {a}
                  </div>
                  {a < 3 && <div style={{ width: 24, height: 1, background: adim > a ? 'var(--brand-primary)' : 'var(--border-default)' }} />}
                </div>
              ))}
            </div>
          </div>

          {/* Adım 1 */}
          {adim === 1 && (
            <div>
              <p className="t-label" style={{ marginBottom: 16 }}>TEMEL BİLGİLER</p>

              <div style={{ marginBottom: 20 }}>
                <Label required>Kargo tipi</Label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[
                    { id: 'giden', isim: 'Giden Kargo', aciklama: 'ZNA\'dan gönderilen', C: ArrowUpRight },
                    { id: 'gelen', isim: 'Gelen Kargo', aciklama: 'ZNA\'ya gelen',       C: ArrowDownLeft },
                  ].map(t => {
                    const active = form.tip === t.id
                    const IconC = t.C
                    return (
                      <button
                        key={t.id}
                        onClick={() => handleTipDegis(t.id)}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', gap: 12,
                          padding: '12px 16px',
                          borderRadius: 'var(--radius-md)',
                          background: active ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                          border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'all 120ms',
                        }}
                      >
                        <span style={{
                          width: 32, height: 32,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--surface-card)',
                          border: '1px solid var(--border-default)',
                          color: active ? 'var(--brand-primary)' : 'var(--text-secondary)',
                        }}>
                          <IconC size={16} strokeWidth={1.5} />
                        </span>
                        <div>
                          <div style={{ font: '500 14px/20px var(--font-sans)', color: active ? 'var(--brand-primary)' : 'var(--text-primary)' }}>
                            {t.isim}
                          </div>
                          <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                            {t.aciklama}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <Label required>Kargo firması</Label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                  {firmalar.map(f => {
                    const active = form.kargoFirmasi === f.id
                    return (
                      <button
                        key={f.id}
                        onClick={() => setForm({ ...form, kargoFirmasi: f.id })}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-sm)',
                          background: active ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                          border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                          color: active ? 'var(--brand-primary)' : 'var(--text-secondary)',
                          font: '500 12px/16px var(--font-sans)',
                          cursor: 'pointer',
                        }}
                      >
                        {f.isim}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <Label>Takip numarası</Label>
                <Input
                  value={form.takipNo}
                  onChange={e => setForm({ ...form, takipNo: e.target.value })}
                  placeholder="Kargo takip numarası (opsiyonel)"
                  style={{ maxWidth: 360 }}
                />
              </div>
            </div>
          )}

          {/* Adım 2 */}
          {adim === 2 && (
            <div>
              <p className="t-label" style={{ marginBottom: 16 }}>GÖNDEREN & ALICI BİLGİLERİ</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
                {[
                  { baslik: 'Gönderen', icon: ArrowUpRight, prefix: 'gonderen' },
                  { baslik: 'Alıcı',    icon: ArrowDownLeft, prefix: 'alici' },
                ].map(sec => {
                  const IconC = sec.icon
                  return (
                    <div key={sec.prefix}>
                      <p style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 12 }}>
                        <IconC size={14} strokeWidth={1.5} style={{ color: 'var(--brand-primary)' }} /> {sec.baslik}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div><Label>Ad Soyad</Label>
                          <Input value={form[sec.prefix + 'Ad']} onChange={e => setForm({ ...form, [sec.prefix + 'Ad']: e.target.value })} placeholder="Ad Soyad" />
                        </div>
                        <div><Label>Firma</Label>
                          <Input value={form[sec.prefix + 'Firma']} onChange={e => setForm({ ...form, [sec.prefix + 'Firma']: e.target.value })} placeholder="Firma adı" />
                        </div>
                        <div><Label>Telefon</Label>
                          <Input value={form[sec.prefix + 'Telefon']} onChange={e => setForm({ ...form, [sec.prefix + 'Telefon']: e.target.value })} placeholder="0532 000 00 00" />
                        </div>
                        <div><Label>Adres</Label>
                          <Textarea value={form[sec.prefix + 'Adres']} onChange={e => setForm({ ...form, [sec.prefix + 'Adres']: e.target.value })} rows={2} placeholder="Adres" />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Adım 3 */}
          {adim === 3 && (
            <div>
              <p className="t-label" style={{ marginBottom: 16 }}>GÖNDERİ DETAYLARI & BİLDİRİMLER</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <Label required>Gönderi içeriği / açıklama</Label>
                  <Textarea value={form.icerik} onChange={e => setForm({ ...form, icerik: e.target.value })} rows={3} placeholder="Gönderilen ürün/doküman açıklaması…" />
                </div>
                <div><Label>Ağırlık (kg)</Label>
                  <Input type="number" step="0.1" value={form.agirlik} onChange={e => setForm({ ...form, agirlik: e.target.value })} placeholder="0.00" />
                </div>
                <div><Label>Desi</Label>
                  <Input type="number" value={form.desi} onChange={e => setForm({ ...form, desi: e.target.value })} placeholder="0" />
                </div>
                <div><Label>Kargo ücreti (₺)</Label>
                  <Input type="number" value={form.ucret} onChange={e => setForm({ ...form, ucret: e.target.value })} placeholder="0.00" />
                </div>
                <div><Label>Ödeme yöntemi</Label>
                  <CustomSelect value={form.odemeYontemi} onChange={e => setForm({ ...form, odemeYontemi: e.target.value })}>
                    <option value="gonderici">Gönderici Öder</option>
                    <option value="alici">Alıcı Öder</option>
                    <option value="kapida">Kapıda Ödeme</option>
                  </CustomSelect>
                </div>
                <div><Label>Tahmini teslimat</Label>
                  <Input type="date" value={form.tahminiTeslim} onChange={e => setForm({ ...form, tahminiTeslim: e.target.value })} />
                </div>
              </div>

              <div>
                <Label>Bildirim alacak personel</Label>
                <p className="t-caption" style={{ marginBottom: 8 }}>Durum değişikliklerinde bildirim gönderilir.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                  {znaKullanicilar.map(k => {
                    const secili = form.ilgiliKullaniciIds.includes(k.id?.toString())
                    return (
                      <button
                        key={k.id}
                        onClick={() => ilgiliToggle(k.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 10px',
                          borderRadius: 'var(--radius-sm)',
                          background: secili ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                          border: `1px solid ${secili ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                          textAlign: 'left', cursor: 'pointer',
                        }}
                      >
                        <Avatar name={k.ad} size="xs" />
                        <span style={{
                          font: secili ? '600 13px/18px var(--font-sans)' : '400 13px/18px var(--font-sans)',
                          color: secili ? 'var(--brand-primary)' : 'var(--text-secondary)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
                        }}>
                          {k.ad}
                        </span>
                        {secili && <Check size={14} strokeWidth={2} style={{ color: 'var(--brand-primary)' }} />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
            {adim > 1 && <Button variant="secondary" onClick={() => setAdim(adim - 1)}>← Geri</Button>}
            {adim < 3 ? (
              <Button variant="primary" disabled={!adimGecerli()} onClick={() => adimGecerli() && setAdim(adim + 1)}>
                Devam →
              </Button>
            ) : (
              <Button variant="primary" onClick={kaydet}>Kargoyu kaydet</Button>
            )}
            <Button variant="tertiary" onClick={() => { setFormAcik(false); setAdim(1) }}>İptal</Button>
          </div>
        </Card>
      )}

      {/* Filtreler */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 240, maxWidth: 480 }}>
          <SearchInput
            value={aramaMetni}
            onChange={e => setAramaMetni(e.target.value)}
            placeholder="Kargo no, alıcı, takip no, içerik ara…"
          />
        </div>
        <div style={{ minWidth: 160 }}>
          <CustomSelect value={tipFiltre} onChange={e => setTipFiltre(e.target.value)}>
            <option value="hepsi">Tüm tipler</option>
            <option value="giden">Giden</option>
            <option value="gelen">Gelen</option>
          </CustomSelect>
        </div>
        <div style={{ minWidth: 180 }}>
          <CustomSelect value={durumFiltre} onChange={e => setDurumFiltre(e.target.value)}>
            <option value="hepsi">Tüm durumlar</option>
            {durumlar.map(d => <option key={d.id} value={d.id}>{d.isim}</option>)}
          </CustomSelect>
        </div>
      </div>

      {/* Liste */}
      {filtreli.length === 0 ? (
        <EmptyState
          icon={<Package size={32} strokeWidth={1.5} />}
          title={aramaMetni || durumFiltre !== 'hepsi' ? 'Arama sonucu bulunamadı' : 'Henüz kargo kaydı eklenmedi'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtreli.map(kargo => {
            const durum = durumlar.find(d => d.id === kargo.durum)
            const firma = KARGO_FIRMALARI.find(f => f.id === kargo.kargoFirmasi)
            const gecikti = kargo.tahminiTeslim && new Date(kargo.tahminiTeslim) < new Date()
              && !['teslim_edildi', 'iade'].includes(kargo.durum)
            const TipIcon = kargo.tip === 'giden' ? ArrowUpRight : ArrowDownLeft

            return (
              <div key={kargo.id}>
                <Card
                  onClick={() => navigate(`/kargolar/${kargo.id}`)}
                  padding={16}
                  style={{
                    cursor: 'pointer',
                    borderLeft: `3px solid ${gecikti ? 'var(--danger)' : 'var(--border-default)'}`,
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-card)'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{
                      width: 36, height: 36,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 'var(--radius-sm)',
                      background: kargo.tip === 'giden' ? 'var(--brand-primary-soft)' : 'var(--success-soft)',
                      color: kargo.tip === 'giden' ? 'var(--brand-primary)' : 'var(--success)',
                      flexShrink: 0,
                    }}>
                      <TipIcon size={16} strokeWidth={1.5} />
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                        <CodeBadge>{kargo.kargoNo}</CodeBadge>
                        {firma && <Badge tone="brand">{firma.isim}</Badge>}
                        {kargo.takipNo && <CodeBadge>{kargo.takipNo}</CodeBadge>}
                        {gecikti && <Badge tone="kayip" icon={<AlertTriangle size={11} strokeWidth={1.5} />}>Gecikti</Badge>}
                      </div>
                      <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {kargo.gonderen?.firma || kargo.gonderen?.ad || '?'}
                        <span style={{ color: 'var(--text-tertiary)', margin: '0 8px' }}>→</span>
                        {kargo.alici?.firma || kargo.alici?.ad || '?'}
                      </div>
                      <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {kargo.icerik}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      {durum && <Badge tone={KARGO_DURUM_TONE[durum.id] ?? 'neutral'}>{durum.isim}</Badge>}
                      <span style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                        {kargo.tahminiTeslim ? `Tah. ${kargo.tahminiTeslim}` : new Date(kargo.olusturmaTarihi).toLocaleDateString('tr-TR')}
                      </span>
                    </div>

                    <ChevronRight size={16} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  </div>
                </Card>

                {silOnayId === kargo.id && (
                  <div style={{
                    margin: '0 8px',
                    padding: '10px 16px',
                    borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                    background: 'var(--danger-soft)',
                    border: '1px solid var(--danger-border)',
                    borderTop: 'none',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <AlertTriangle size={14} strokeWidth={1.5} style={{ color: 'var(--danger)' }} />
                    <span style={{ flex: 1, font: '500 13px/18px var(--font-sans)', color: 'var(--danger)' }}>
                      Bu kargoyu silmek istediğinize emin misiniz?
                    </span>
                    <Button variant="danger" size="sm" iconLeft={<Trash2 size={12} strokeWidth={1.5} />} onClick={() => { kargoSil(kargo.id); setSilOnayId(null) }}>
                      Evet, sil
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setSilOnayId(null)}>İptal</Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
