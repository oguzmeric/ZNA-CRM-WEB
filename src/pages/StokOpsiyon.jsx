import { useState, useEffect } from 'react'
import {
  Plus, Pencil, Trash2, Package, Check, Ban, Clock, AlertTriangle,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useBildirim } from '../context/BildirimContext'
import CustomSelect from '../components/CustomSelect'
import { stokUrunleriniGetir, stokHareketleriniGetir } from '../services/stokService'
import {
  Button, SearchInput, Input, Textarea, Label,
  Card, Badge, CodeBadge, KPICard, EmptyState, SegmentedControl,
} from '../components/ui'

const durumlar = [
  { id: 'aktif',        isim: 'Aktif',        tone: 'lead' },
  { id: 'onaylandi',    isim: 'Onaylandı',    tone: 'aktif' },
  { id: 'iptal',        isim: 'İptal',        tone: 'kayip' },
  { id: 'suresi_doldu', isim: 'Süresi Doldu', tone: 'pasif' },
]

const bosForm = {
  stokKodu: '', stokAdi: '', miktar: '',
  satisciId: '', musteriAdi: '', aciklama: '', bitisTarih: '',
}

function StokOpsiyon() {
  const { kullanici, kullanicilar } = useAuth()
  const { bildirimEkle } = useBildirim()

  const [opsiyonlar, setOpsiyonlar] = useState(() => {
    try { return JSON.parse(localStorage.getItem('stokOpsiyonlar') || '[]') }
    catch { return [] }
  })
  const [stokUrunler, setStokUrunler] = useState([])
  const [hareketler, setHareketler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)

  useEffect(() => {
    Promise.all([stokUrunleriniGetir(), stokHareketleriniGetir()])
      .then(([u, h]) => { setStokUrunler(u || []); setHareketler(h || []); setYukleniyor(false) })
      .catch(() => setYukleniyor(false))
  }, [])

  const [form, setForm] = useState(bosForm)
  const [goster, setGoster] = useState(false)
  const [filtre, setFiltre] = useState('hepsi')
  const [arama, setArama] = useState('')

  const stokBakiye = (kod) => hareketler
    .filter(h => h.stokKodu === kod)
    .reduce((s, h) => {
      const tip = h.hareketTipi || h.tur
      return tip === 'giris' || tip === 'transfer_giris' ? s + Number(h.miktar) : s - Number(h.miktar)
    }, 0)

  const opsiyonluMiktar = (kod) => opsiyonlar
    .filter(o => o.stokKodu === kod && o.durum === 'aktif')
    .reduce((s, o) => s + Number(o.miktar), 0)

  const stokSec = (kod) => {
    const u = stokUrunler.find(x => x.stokKodu === kod)
    setForm({ ...form, stokKodu: kod, stokAdi: u?.stokAdi || '' })
  }

  const kaydet = () => {
    if (!form.stokKodu || !form.miktar || !form.satisciId || !form.bitisTarih) {
      alert('Stok, miktar, satışçı ve bitiş tarihi zorunludur.')
      return
    }
    const bakiye = stokBakiye(form.stokKodu)
    const mevcut = opsiyonluMiktar(form.stokKodu)
    const kullanilabilir = bakiye - mevcut
    if (Number(form.miktar) > kullanilabilir) {
      alert(`Yetersiz stok. Kullanılabilir: ${kullanilabilir} adet (${bakiye} toplam − ${mevcut} opsiyonlu)`)
      return
    }
    const satisci = kullanicilar.find(k => k.id?.toString() === form.satisciId)
    const yeni = {
      ...form, id: crypto.randomUUID(), durum: 'aktif',
      olusturanId: kullanici?.id?.toString(), olusturanAd: kullanici?.ad,
      satisciAd: satisci?.ad || '',
      olusturmaTarih: new Date().toISOString(),
      opsiyonNo: `OPS-${String(opsiyonlar.length + 1).padStart(4, '0')}`,
    }
    const g = [...opsiyonlar, yeni]
    setOpsiyonlar(g)
    localStorage.setItem('stokOpsiyonlar', JSON.stringify(g))
    bildirimEkle(form.satisciId, 'Stok Opsiyonu Oluşturuldu',
      `${form.miktar} adet ${form.stokAdi} ürünü için opsiyon oluşturuldu. Bitiş: ${form.bitisTarih}`,
      'bilgi', '/stok-opsiyon')
    setForm(bosForm); setGoster(false)
  }

  const durumGuncelle = (id, yeniDurum) => {
    const o = opsiyonlar.find(x => x.id === id)
    const g = opsiyonlar.map(x => x.id === id ? { ...x, durum: yeniDurum } : x)
    setOpsiyonlar(g)
    localStorage.setItem('stokOpsiyonlar', JSON.stringify(g))
    if (yeniDurum === 'onaylandi' && o) {
      bildirimEkle(o.satisciId, 'Opsiyon Onaylandı',
        `${o.miktar} adet ${o.stokAdi} opsiyonunuz onaylandı.`,
        'basari', '/stok-opsiyon')
    }
    if (yeniDurum === 'iptal' && o) {
      bildirimEkle(o.satisciId, 'Opsiyon İptal Edildi',
        `${o.miktar} adet ${o.stokAdi} opsiyonunuz iptal edildi.`,
        'uyari', '/stok-opsiyon')
    }
  }

  const opsiyonSil = (id) => {
    const g = opsiyonlar.filter(o => o.id !== id)
    setOpsiyonlar(g)
    localStorage.setItem('stokOpsiyonlar', JSON.stringify(g))
  }

  const bugun = new Date()

  const gorunen = opsiyonlar
    .filter(o => filtre === 'hepsi' || o.durum === filtre)
    .filter(o => {
      if (!arama) return true
      const q = arama.toLowerCase()
      return [o.opsiyonNo, o.stokAdi, o.satisciAd, o.musteriAdi].some(v => (v || '').toLowerCase().includes(q))
    })
    .sort((a, b) => new Date(b.olusturmaTarih) - new Date(a.olusturmaTarih))

  const yetkili = kullanici?.moduller?.includes('kullanici_yonetimi') || kullanici?.moduller?.includes('stok')

  if (yukleniyor) return <div style={{ padding: 24 }}><EmptyState title="Yükleniyor…" /></div>

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Stok Opsiyonları</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            <span className="tabular-nums">{opsiyonlar.filter(o => o.durum === 'aktif').length}</span> aktif opsiyon
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => setGoster(true)}>
          Yeni opsiyon
        </Button>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KPICard label="TOPLAM OPSİYON" value={opsiyonlar.length} icon={<Package size={16} strokeWidth={1.5} />} />
        <KPICard label="AKTİF"         value={opsiyonlar.filter(o => o.durum === 'aktif').length}     footer={<span style={{ color: 'var(--info)' }}>Beklemede</span>} />
        <KPICard label="ONAYLANDI"     value={opsiyonlar.filter(o => o.durum === 'onaylandi').length} footer={<span style={{ color: 'var(--success)' }}>Tamamlandı</span>} />
        <KPICard label="İPTAL / DOLDU" value={opsiyonlar.filter(o => o.durum === 'iptal' || o.durum === 'suresi_doldu').length} footer={<span style={{ color: 'var(--text-tertiary)' }}>Kapalı</span>} />
      </div>

      {/* Arama + filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 240, maxWidth: 480 }}>
          <SearchInput
            value={arama}
            onChange={e => setArama(e.target.value)}
            placeholder="Opsiyon no, ürün, satışçı veya müşteri ara…"
          />
        </div>
        <SegmentedControl
          options={[
            { value: 'hepsi', label: 'Tümü' },
            ...durumlar.map(d => ({ value: d.id, label: d.isim })),
          ]}
          value={filtre}
          onChange={setFiltre}
        />
      </div>

      {/* Form */}
      {goster && (
        <Card style={{ marginBottom: 16 }}>
          <h2 className="t-h2" style={{ marginBottom: 16 }}>Yeni Opsiyon Oluştur</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
            <div>
              <Label required>Stok ürünü</Label>
              <CustomSelect value={form.stokKodu} onChange={e => stokSec(e.target.value)}>
                <option value="">Ürün seç…</option>
                {stokUrunler.map(u => {
                  const b = stokBakiye(u.stokKodu)
                  const o = opsiyonluMiktar(u.stokKodu)
                  return (
                    <option key={u.id} value={u.stokKodu}>
                      {u.stokKodu} — {u.stokAdi} (Mevcut: {b - o} {u.birim})
                    </option>
                  )
                })}
              </CustomSelect>
            </div>

            {form.stokKodu && (
              <div style={{
                padding: '12px 14px',
                background: 'var(--brand-primary-soft)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
              }}>
                <p className="t-label" style={{ marginBottom: 6 }}>STOK DURUMU</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, font: '400 13px/18px var(--font-sans)' }}>
                  <div>Toplam: <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{stokBakiye(form.stokKodu)}</strong></div>
                  <div>Opsiyonlu: <strong style={{ color: 'var(--warning)', fontVariantNumeric: 'tabular-nums' }}>{opsiyonluMiktar(form.stokKodu)}</strong></div>
                  <div>Kullanılabilir: <strong style={{ color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>{stokBakiye(form.stokKodu) - opsiyonluMiktar(form.stokKodu)}</strong></div>
                </div>
              </div>
            )}

            <div>
              <Label required>Miktar</Label>
              <Input type="number" value={form.miktar} onChange={e => setForm({ ...form, miktar: e.target.value })} placeholder="0" min="1" />
            </div>

            <div>
              <Label required>Satışçı</Label>
              <CustomSelect value={form.satisciId} onChange={e => setForm({ ...form, satisciId: e.target.value })}>
                <option value="">Satışçı seç…</option>
                {kullanicilar.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
              </CustomSelect>
            </div>

            <div>
              <Label>Müşteri adı</Label>
              <Input value={form.musteriAdi} onChange={e => setForm({ ...form, musteriAdi: e.target.value })} placeholder="Müşteri firma adı" />
            </div>

            <div>
              <Label required>Opsiyon bitiş tarihi</Label>
              <Input
                type="date"
                value={form.bitisTarih}
                onChange={e => setForm({ ...form, bitisTarih: e.target.value })}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div style={{ gridColumn: 'span 3' }}>
              <Label>Açıklama</Label>
              <Textarea value={form.aciklama} onChange={e => setForm({ ...form, aciklama: e.target.value })} rows={2} placeholder="Opsiyon hakkında notlar…" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={kaydet}>Opsiyonla</Button>
            <Button variant="secondary" onClick={() => { setForm(bosForm); setGoster(false) }}>İptal</Button>
          </div>
        </Card>
      )}

      {/* Liste */}
      <Card padding={0}>
        {gorunen.length === 0 ? (
          <div style={{ padding: 40 }}>
            <EmptyState
              icon={<Package size={32} strokeWidth={1.5} />}
              title={arama ? 'Arama sonucu bulunamadı' : 'Henüz opsiyon oluşturulmadı'}
            />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr>
                  {['No', 'Ürün', 'Miktar', 'Satışçı', 'Müşteri', 'Bitiş', 'Durum', ''].map((h, i) => (
                    <th key={i} style={{
                      background: 'var(--surface-sunken)',
                      padding: '10px 14px',
                      textAlign: i === 7 ? 'right' : 'left',
                      font: '600 11px/16px var(--font-sans)',
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      borderBottom: '1px solid var(--border-default)',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gorunen.map(o => {
                  const durum = durumlar.find(d => d.id === o.durum)
                  const bitis = new Date(o.bitisTarih)
                  const kalanGun = Math.ceil((bitis - bugun) / (1000 * 60 * 60 * 24))
                  const suresiDoldu = kalanGun < 0 && o.durum === 'aktif'
                  return (
                    <tr key={o.id}
                      style={{
                        transition: 'background 120ms',
                        background: suresiDoldu ? 'var(--danger-soft)' : 'transparent',
                      }}
                      onMouseEnter={e => !suresiDoldu && (e.currentTarget.style.background = 'var(--surface-sunken)')}
                      onMouseLeave={e => !suresiDoldu && (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                        <CodeBadge>{o.opsiyonNo}</CodeBadge>
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', maxWidth: 220 }}>
                        <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {o.stokAdi}
                        </div>
                        <div style={{ font: '400 12px/16px var(--font-mono)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                          {o.stokKodu}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                        <span style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{o.miktar}</span>
                        <span className="t-caption" style={{ marginLeft: 4 }}>adet</span>
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)' }}>
                        <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{o.satisciAd}</div>
                        <div className="t-caption" style={{ marginTop: 2 }}>Oluşturan: {o.olusturanAd}</div>
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', maxWidth: 220 }}>
                        <div style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {o.musteriAdi || '—'}
                        </div>
                        {o.aciklama && (
                          <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {o.aciklama}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                        <div style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>{o.bitisTarih}</div>
                        {o.durum === 'aktif' && (
                          <div style={{
                            font: '500 11px/16px var(--font-sans)', marginTop: 2,
                            color: kalanGun < 0 ? 'var(--danger)' : kalanGun <= 3 ? 'var(--warning)' : 'var(--text-tertiary)',
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                          }}>
                            {kalanGun < 0 && <AlertTriangle size={11} strokeWidth={1.5} />}
                            {kalanGun < 0 ? `${Math.abs(kalanGun)}g geçti` : `${kalanGun}g kaldı`}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                        {durum && <Badge tone={durum.tone}>{durum.isim}</Badge>}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          {o.durum === 'aktif' && yetkili && (
                            <button
                              onClick={() => durumGuncelle(o.id, 'onaylandi')}
                              style={{
                                height: 28, padding: '0 10px',
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                background: 'var(--success)', color: '#fff',
                                border: 'none',
                                borderRadius: 'var(--radius-sm)',
                                font: '500 12px/16px var(--font-sans)',
                                cursor: 'pointer',
                              }}
                            >
                              <Check size={11} strokeWidth={2} /> Onayla
                            </button>
                          )}
                          {o.durum === 'aktif' && (
                            <button
                              aria-label="İptal"
                              onClick={() => durumGuncelle(o.id, 'iptal')}
                              style={{
                                height: 28, padding: '0 10px',
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                background: 'transparent', color: 'var(--danger)',
                                border: '1px solid var(--danger-border)',
                                borderRadius: 'var(--radius-sm)',
                                font: '500 12px/16px var(--font-sans)',
                                cursor: 'pointer',
                              }}
                            >
                              <Ban size={11} strokeWidth={1.5} /> İptal
                            </button>
                          )}
                          {yetkili && (
                            <button
                              aria-label="Sil"
                              onClick={() => opsiyonSil(o.id)}
                              style={{
                                width: 28, height: 28,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: 'transparent', border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                            >
                              <Trash2 size={12} strokeWidth={1.5} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

export default StokOpsiyon
