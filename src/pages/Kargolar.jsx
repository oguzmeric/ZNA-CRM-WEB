import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Package, ArrowUpRight, ArrowDownLeft, Truck, AlertTriangle, Check,
  Trash2, ChevronRight,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useBildirim } from '../context/BildirimContext'
import { useKargo, KARGO_FIRMALARI } from '../context/KargoContext'
import { trContains } from '../lib/trSearch'
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
    .filter(k => trContains(
      [k.kargoNo, k.alici?.ad, k.alici?.firma, k.gonderen?.ad, k.gonderen?.firma, k.takipNo, k.icerik].filter(Boolean).join(' '),
      aramaMetni,
    ))

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

      {/* KPI — kompakt yatay şerit */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8,
        padding: '10px 14px',
        background: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        marginBottom: 16,
        alignItems: 'center',
      }}>
        {[
          { l: 'Toplam',    v: ist.toplam,    ton: 'var(--text-primary)',   ikon: <Package size={13} strokeWidth={1.6} /> },
          { l: 'Aktif',     v: ist.aktif,     ton: 'var(--warning)' },
          { l: 'Dağıtımda', v: ist.dagitimda, ton: 'var(--warning)' },
          { l: 'Teslim',    v: ist.teslim,    ton: 'var(--success)' },
          { l: 'İade',      v: ist.iade,      ton: ist.iade > 0 ? 'var(--danger)' : 'var(--text-tertiary)' },
        ].map((k) => (
          <div key={k.l} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px',
            font: '400 12px/16px var(--font-sans)',
            color: 'var(--text-secondary)',
          }}>
            {k.ikon && <span style={{ color: 'var(--text-tertiary)' }}>{k.ikon}</span>}
            <span style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.4, color: 'var(--text-tertiary)' }}>{k.l}</span>
            <span style={{
              font: '700 14px/18px var(--font-sans)',
              color: k.ton,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {k.v}
            </span>
          </div>
        )).flatMap((el, i, arr) => i < arr.length - 1
          ? [el, <span key={`sep-${i}`} style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-default)' }} />]
          : [el])}
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

      {/* Liste — Tablo formatı */}
      {(() => {
        const thStyle = {
          textAlign: 'left',
          padding: '10px 12px',
          font: '600 11px/14px var(--font-sans)',
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: 0.3,
          background: 'var(--surface-sunken)',
          borderBottom: '1px solid var(--border-default)',
          whiteSpace: 'nowrap',
          position: 'sticky', top: 0, zIndex: 1,
        }
        const tdStyle = {
          padding: '10px 12px',
          font: '400 13px/18px var(--font-sans)',
          color: 'var(--text-primary)',
          borderBottom: '1px solid var(--border-default)',
          verticalAlign: 'middle',
          whiteSpace: 'nowrap',
        }

        return filtreli.length === 0 ? (
          <EmptyState
            icon={<Package size={32} strokeWidth={1.5} />}
            title={aramaMetni || durumFiltre !== 'hepsi' ? 'Arama sonucu bulunamadı' : 'Henüz kargo kaydı eklenmedi'}
          />
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 320px)', overflowY: 'auto', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 30 }}></th>
                  <th style={thStyle}>Kargo No</th>
                  <th style={thStyle}>Firma</th>
                  <th style={thStyle}>Takip No</th>
                  <th style={{ ...thStyle, minWidth: 240 }}>Gönderen → Alıcı</th>
                  <th style={{ ...thStyle, minWidth: 180 }}>İçerik</th>
                  <th style={thStyle}>Durum</th>
                  <th style={thStyle}>Tarih</th>
                  <th style={{ ...thStyle, width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtreli.map(kargo => {
                  const durum = durumlar.find(d => d.id === kargo.durum)
                  const firma = KARGO_FIRMALARI.find(f => f.id === kargo.kargoFirmasi)
                  const gecikti = kargo.tahminiTeslim && new Date(kargo.tahminiTeslim) < new Date()
                    && !['teslim_edildi', 'iade'].includes(kargo.durum)
                  const TipIcon = kargo.tip === 'giden' ? ArrowUpRight : ArrowDownLeft

                  return (
                    <tr
                      key={kargo.id}
                      onClick={() => navigate(`/kargolar/${kargo.id}`)}
                      style={{
                        cursor: 'pointer',
                        background: 'var(--surface-card)',
                        borderLeft: gecikti ? '3px solid var(--danger)' : '3px solid transparent',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-card)'}
                    >
                      <td style={tdStyle} title={kargo.tip === 'giden' ? 'Giden' : 'Gelen'}>
                        <span style={{
                          width: 26, height: 26,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 'var(--radius-sm)',
                          background: kargo.tip === 'giden' ? 'var(--brand-primary-soft)' : 'var(--success-soft)',
                          color: kargo.tip === 'giden' ? 'var(--brand-primary)' : 'var(--success)',
                        }}>
                          <TipIcon size={13} strokeWidth={1.5} />
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <CodeBadge>{kargo.kargoNo}</CodeBadge>
                        {gecikti && <span style={{ display: 'inline-flex', marginLeft: 6 }}><Badge tone="kayip" icon={<AlertTriangle size={10} strokeWidth={1.5} />}>Gecikti</Badge></span>}
                      </td>
                      <td style={tdStyle}>
                        {firma
                          ? <Badge tone="brand">{firma.isim}</Badge>
                          : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                      </td>
                      <td style={tdStyle}>
                        {kargo.takipNo
                          ? <CodeBadge>{kargo.takipNo}</CodeBadge>
                          : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>
                        <span style={{ maxWidth: 320, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                          {kargo.gonderen?.firma || kargo.gonderen?.ad || '?'}
                          <span style={{ color: 'var(--text-tertiary)', margin: '0 6px' }}>→</span>
                          {kargo.alici?.firma || kargo.alici?.ad || '?'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                        <span style={{ maxWidth: 220, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle' }} title={kargo.icerik}>
                          {kargo.icerik || '—'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {durum && <Badge tone={KARGO_DURUM_TONE[durum.id] ?? 'neutral'}>{durum.isim}</Badge>}
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                        {kargo.tahminiTeslim
                          ? <span title="Tahmini teslim">Tah. {kargo.tahminiTeslim}</span>
                          : new Date(kargo.olusturmaTarihi).toLocaleDateString('tr-TR')}
                      </td>
                      <td style={{ ...tdStyle, padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                        {silOnayId === kargo.id ? (
                          <div style={{ display: 'inline-flex', gap: 4 }}>
                            <button
                              onClick={() => { kargoSil(kargo.id); setSilOnayId(null) }}
                              title="Evet, sil"
                              aria-label="Sil"
                              style={{
                                width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: 'var(--danger)', color: '#fff', border: 'none',
                                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                              }}
                            >
                              <Check size={13} strokeWidth={1.8} />
                            </button>
                            <button
                              onClick={() => setSilOnayId(null)}
                              title="İptal"
                              aria-label="İptal"
                              style={{
                                width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: 'transparent', color: 'var(--text-secondary)',
                                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setSilOnayId(kargo.id)}
                            aria-label="Sil"
                            title="Sil"
                            style={{
                              width: 26, height: 26,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              background: 'transparent', border: '1px solid var(--border-default)',
                              borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                          >
                            <Trash2 size={13} strokeWidth={1.5} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })()}
    </div>
  )
}
