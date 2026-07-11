import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  Plus, Package, ArrowUp, ArrowDown, AlertTriangle, CheckCircle2, X,
  ArrowRight, ChevronRight, ChevronDown, Download,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import CustomSelect from '../components/CustomSelect'
import { SkeletonList } from '../components/Skeleton'
import { stokUrunleriniGetir, stokHareketleriniGetir, stokHareketEkle, stokKalemOzetleriniGetir } from '../services/stokService'
import { trContains } from '../lib/trSearch'
import { musterileriGetir } from '../services/musteriService'
import {
  Button, SearchInput, Input, Label,
  Card, Badge, CodeBadge, Modal, EmptyState, SegmentedControl,
} from '../components/ui'

const hareketTurleri = [
  { id: 'giris',           isim: 'Ana Depo Girişi',    tone: 'aktif',     gc: 'G' },
  { id: 'transfer_cikis',  isim: 'Personele Transfer', tone: 'lead',      gc: 'C' },
  { id: 'transfer_giris',  isim: 'Personelden İade',   tone: 'beklemede', gc: 'G' },
  { id: 'cikis',           isim: 'Müşteri Çıkışı',     tone: 'kayip',     gc: 'C' },
]

const tarihSaat = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return iso
  const gun = String(d.getDate()).padStart(2, '0')
  const ay = String(d.getMonth() + 1).padStart(2, '0')
  const ss = String(d.getHours()).padStart(2, '0')
  const dk = String(d.getMinutes()).padStart(2, '0')
  return `${gun}.${ay}.${d.getFullYear()} ${ss}:${dk}`
}

const bosForm = {
  stokKodu: '', hareketTipi: 'giris', miktar: '',
  aciklama: '', tarih: new Date().toISOString().split('T')[0],
  personelId: '', musteriId: '',
}

export default function StokHareketleri() {
  const { kullanici, kullanicilar } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [hareketler, setHareketler] = useState([])
  const [urunler, setUrunler] = useState([])
  const [kalemOzetleri, setKalemOzetleri] = useState(new Map())
  const [musteriler, setMusteriler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [form, setForm] = useState(bosForm)
  const [goster, setGoster] = useState(false)
  const [filtre, setFiltre] = useState('hepsi')
  const [arama, setArama] = useState('')
  const [detayHareket, setDetayHareket] = useState(null)
  const [acikGruplar, setAcikGruplar] = useState(new Set())  // expand olan grup ID'leri

  useEffect(() => {
    Promise.all([stokUrunleriniGetir(), stokHareketleriniGetir(), musterileriGetir(), stokKalemOzetleriniGetir()])
      .then(([u, h, m, ko]) => {
        setUrunler(u || []); setHareketler(h || []); setMusteriler(m || [])
        setKalemOzetleri(ko || new Map())
      })
      .catch(err => console.error('[StokHareketleri yükle]', err))
      .finally(() => setYukleniyor(false))
  }, [])

  if (yukleniyor) return <SkeletonList />

  const secilenUrun = urunler.find(u => u.stokKodu === form.stokKodu)

  // SN takipli ürünlerde bakiye = kalem sayısı (hurda hariç). Değilse hareket bazlı.
  const anaBakiye = (kod) => {
    const urun = urunler.find(u => u.stokKodu === kod)
    if (urun?.seriTakipli) {
      const ozet = kalemOzetleri.get(kod)
      return Math.max(0, (Number(ozet?.toplam) || 0) - (Number(ozet?.hurda) || 0))
    }
    return hareketler
      .filter(h => h.stokKodu === kod)
      .reduce((t, h) => {
        if (h.hareketTipi === 'giris' || h.hareketTipi === 'transfer_giris') return t + Number(h.miktar)
        if (h.hareketTipi === 'cikis' || h.hareketTipi === 'transfer_cikis') return t - Number(h.miktar)
        return t
      }, 0)
  }

  const formAc = () => {
    setForm({ ...bosForm, tarih: new Date().toISOString().split('T')[0] })
    setGoster(true)
  }

  const kaydet = async () => {
    if (!form.stokKodu || !form.miktar || !form.hareketTipi) {
      toast.error('Stok, tür ve miktar zorunludur.'); return
    }
    const urun = urunler.find(u => u.stokKodu === form.stokKodu)
    const musteri = musteriler.find(m => m.id?.toString() === form.musteriId?.toString())
    const personel = kullanicilar.find(k => k.id?.toString() === form.personelId?.toString())
    const aciklamaOtomatik = musteri
      ? `Müşteri: ${musteri.firma || musteri.ad}`
      : personel ? `Personel: ${personel.ad}` : ''

    const yeni = await stokHareketEkle({
      stokKodu: form.stokKodu, stokAdi: urun?.stokAdi || '',
      hareketTipi: form.hareketTipi, miktar: Number(form.miktar),
      aciklama: form.aciklama || aciklamaOtomatik,
      tarih: form.tarih,
    })
    if (yeni) {
      setHareketler(prev => [yeni, ...prev])
      toast.success('Hareket kaydedildi.')
      setForm(bosForm); setGoster(false)
    } else {
      toast.error('Hareket kaydedilemedi.')
    }
  }

  const iptal = () => { setForm(bosForm); setGoster(false) }

  const gorunenHareketler = [...hareketler]
    .filter(h => filtre === 'hepsi' || h.hareketTipi === filtre)
    .filter(h => trContains(`${h.stokKodu || ''} ${h.stokAdi || ''} ${h.aciklama || ''}`, arama))

  // Aynı dakika + stok_kodu + hareket_tipi olan satırları grupla
  // Böylece toplu SN eklemede 20 satır yerine 1 grup + expand görürüz
  const grupla = (harekets) => {
    const gruplar = new Map()
    for (const h of harekets) {
      const zaman = h.olusturmaTarih || h.createdAt || h.tarih || ''
      const dakika = String(zaman).slice(0, 16)  // 'YYYY-MM-DD HH:mm'
      const anahtar = `${dakika}|${h.stokKodu}|${h.hareketTipi}`
      if (!gruplar.has(anahtar)) gruplar.set(anahtar, { anahtar, hareketler: [], toplamMiktar: 0 })
      const g = gruplar.get(anahtar)
      g.hareketler.push(h)
      g.toplamMiktar += Number(h.miktar) || 0
    }
    return Array.from(gruplar.values())
  }
  const gruplananlar = grupla(gorunenHareketler)

  // Filtrelenmiş hareketleri Excel'e aktar (gruplama olmadan, ham satırlar)
  const excelIndir = () => {
    const satirlar = gorunenHareketler.map(x => ({
      'Tarih': x.tarih || '',
      'Stok Kodu': x.stokKodu || '',
      'Stok Adı': x.stokAdi || '',
      'Tip': x.hareketTipi || '',
      'Miktar': Number(x.miktar) || 0,
      'Açıklama': x.aciklama || '',
      'Kullanıcı': x.kullaniciAd || '',
    }))
    const ws = XLSX.utils.json_to_sheet(satirlar)
    ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 8 }, { wch: 50 }, { wch: 18 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Hareketler')
    const bugun = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `ZNA_StokHareketleri_${bugun}.xlsx`)
    toast.success(`${satirlar.length} hareket Excel'e aktarıldı.`)
  }

  const h = detayHareket
  const modalTur = h ? hareketTurleri.find(t => t.id === h.hareketTipi) : null
  const modalUrun = h ? urunler.find(u => u.stokKodu === h.stokKodu) : null
  const modalBakiye = h ? anaBakiye(h.stokKodu) : 0
  const modalKritik = modalUrun?.minStok && modalBakiye <= Number(modalUrun.minStok)

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Stok Hareketleri</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            <span className="tabular-nums">{hareketler.length}</span> hareket
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" iconLeft={<Download size={14} strokeWidth={1.5} />} onClick={excelIndir}>
            Excel indir
          </Button>
          <Button variant="secondary" iconLeft={<Package size={14} strokeWidth={1.5} />} onClick={() => navigate('/stok')}>
            Stok kartları
          </Button>
          <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={formAc}>
            Yeni hareket
          </Button>
        </div>
      </div>

      {/* Filter + arama */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 240, maxWidth: 480 }}>
          <SearchInput
            value={arama}
            onChange={e => setArama(e.target.value)}
            placeholder="Stok kodu, ürün veya açıklama ara…"
          />
        </div>
        <SegmentedControl
          options={[
            { value: 'hepsi', label: 'Tümü' },
            ...hareketTurleri.map(t => ({ value: t.id, label: t.isim })),
          ]}
          value={filtre}
          onChange={setFiltre}
        />
      </div>

      {/* Form */}
      {goster && (
        <Card style={{ marginBottom: 16 }}>
          <h2 className="t-h2" style={{ marginBottom: 16 }}>Yeni Stok Hareketi</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
            <div>
              <Label required>Hareket türü</Label>
              <CustomSelect value={form.hareketTipi} onChange={e => setForm({ ...form, hareketTipi: e.target.value })}>
                {hareketTurleri.map(t => <option key={t.id} value={t.id}>{t.isim}</option>)}
              </CustomSelect>
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <Label required>Stok seç</Label>
              <CustomSelect value={form.stokKodu} onChange={e => setForm({ ...form, stokKodu: e.target.value })}>
                <option value="">Stok seç…</option>
                {urunler.map(u => (
                  <option key={u.id} value={u.stokKodu}>
                    {u.stokKodu} — {u.stokAdi} (Bakiye: {anaBakiye(u.stokKodu).toFixed(0)} {u.birim})
                  </option>
                ))}
              </CustomSelect>
            </div>

            <div>
              <Label required>Miktar</Label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <Input type="number" value={form.miktar} onChange={e => setForm({ ...form, miktar: e.target.value })} placeholder="0" min="0" />
                </div>
                {secilenUrun && <span className="t-caption">{secilenUrun.birim}</span>}
              </div>
            </div>

            <div>
              <Label>Tarih</Label>
              <Input type="date" value={form.tarih} onChange={e => setForm({ ...form, tarih: e.target.value })} />
            </div>

            {(form.hareketTipi === 'transfer_cikis' || form.hareketTipi === 'transfer_giris') && (
              <div>
                <Label required={form.hareketTipi === 'transfer_cikis'}>
                  {form.hareketTipi === 'transfer_cikis' ? 'Personel' : 'İade eden personel'}
                </Label>
                <CustomSelect value={form.personelId} onChange={e => setForm({ ...form, personelId: e.target.value })}>
                  <option value="">Personel seç…</option>
                  {kullanicilar.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
                </CustomSelect>
              </div>
            )}

            {form.hareketTipi === 'cikis' && (
              <>
                <div>
                  <Label required>Müşteri</Label>
                  <CustomSelect value={form.musteriId} onChange={e => setForm({ ...form, musteriId: e.target.value })}>
                    <option value="">Müşteri seç…</option>
                    {musteriler.map(m => (
                      <option key={m.id} value={m.id}>{m.ad} {m.soyad} — {m.firma}</option>
                    ))}
                  </CustomSelect>
                </div>
                <div>
                  <Label>Çıkış yapan personel</Label>
                  <CustomSelect value={form.personelId} onChange={e => setForm({ ...form, personelId: e.target.value })}>
                    <option value="">Personel seç…</option>
                    {kullanicilar.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
                  </CustomSelect>
                </div>
              </>
            )}

            <div style={{ gridColumn: 'span 3' }}>
              <Label>Açıklama</Label>
              <Input value={form.aciklama} onChange={e => setForm({ ...form, aciklama: e.target.value })} placeholder="Hareket açıklaması…" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={kaydet}>Kaydet</Button>
            <Button variant="secondary" onClick={iptal}>İptal</Button>
          </div>
        </Card>
      )}

      {/* Liste */}
      <Card padding={0}>
        {gorunenHareketler.length === 0 ? (
          <div style={{ padding: 40 }}>
            <EmptyState
              icon={<Package size={32} strokeWidth={1.5} />}
              title={arama ? 'Arama sonucu bulunamadı' : 'Henüz hareket eklenmedi'}
            />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr>
                  {[
                    { l: 'Tarih' }, { l: 'Stok Kodu' }, { l: 'Stok Adı' },
                    { l: 'Tür' }, { l: 'G/C', align: 'center' }, { l: 'Miktar', align: 'right' },
                  ].map((h, i) => (
                    <th key={i} style={{
                      background: 'var(--surface-sunken)',
                      padding: '10px 14px',
                      textAlign: h.align || 'left',
                      font: '600 11px/16px var(--font-sans)',
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      borderBottom: '1px solid var(--border-default)',
                      whiteSpace: 'nowrap',
                    }}>{h.l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gruplananlar.map(grup => {
                  const ilkHareket = grup.hareketler[0]
                  const tur = hareketTurleri.find(t => t.id === ilkHareket.hareketTipi)
                  const urun = urunler.find(u => u.stokKodu === ilkHareket.stokKodu)
                  const giris = tur?.gc === 'G'
                  const cokluMu = grup.hareketler.length > 1
                  const acikMi = acikGruplar.has(grup.anahtar)
                  const grupClick = () => {
                    if (cokluMu) {
                      const yeni = new Set(acikGruplar)
                      acikMi ? yeni.delete(grup.anahtar) : yeni.add(grup.anahtar)
                      setAcikGruplar(yeni)
                    } else {
                      setDetayHareket(ilkHareket)
                    }
                  }
                  return (
                    <React.Fragment key={grup.anahtar}>
                      <tr
                        onClick={grupClick}
                        style={{ cursor: 'pointer', transition: 'background 120ms', background: acikMi ? 'var(--surface-sunken)' : 'transparent' }}
                        onMouseEnter={e => { if (!acikMi) e.currentTarget.style.background = 'var(--surface-sunken)' }}
                        onMouseLeave={e => { if (!acikMi) e.currentTarget.style.background = 'transparent' }}
                      >
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {cokluMu && (acikMi ? <ChevronDown size={12} strokeWidth={2} /> : <ChevronRight size={12} strokeWidth={2} />)}
                            {tarihSaat(ilkHareket.tarih)}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                          <CodeBadge>{ilkHareket.stokKodu}</CodeBadge>
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', maxWidth: 320 }}>
                          <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ilkHareket.stokAdi || urun?.stokAdi || '—'}
                          </div>
                          {cokluMu ? (
                            <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--brand-primary)', marginTop: 2 }}>
                              📦 {grup.hareketler.length} kalem — {tur?.isim || ''}
                            </div>
                          ) : (
                            ilkHareket.aciklama && (
                              <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {ilkHareket.aciklama}
                              </div>
                            )
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                          {tur && <Badge tone={tur.tone}>{tur.isim}</Badge>}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', borderBottom: '1px solid var(--border-default)' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 22, height: 22, borderRadius: '50%',
                            background: giris ? 'var(--success-soft)' : 'var(--danger-soft)',
                            color: giris ? 'var(--success)' : 'var(--danger)',
                          }}>
                            {giris ? <ArrowUp size={12} strokeWidth={2} /> : <ArrowDown size={12} strokeWidth={2} />}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                          <span style={{ font: '600 14px/20px var(--font-sans)', color: giris ? 'var(--success)' : 'var(--danger)' }}>
                            {giris ? '+' : '−'}{grup.toplamMiktar.toFixed(0)}
                          </span>
                          <span className="t-caption" style={{ marginLeft: 4 }}>{urun?.birim || ''}</span>
                        </td>
                      </tr>
                      {acikMi && grup.hareketler.map(h => (
                        <tr key={h.id}
                          onClick={() => setDetayHareket(h)}
                          style={{ cursor: 'pointer', background: 'var(--surface-sunken)' }}
                        >
                          <td colSpan={6} style={{ padding: '6px 14px 6px 42px', borderBottom: '1px solid var(--border-default)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                              <span style={{ font: '400 12px/16px var(--font-mono, monospace)', color: 'var(--text-tertiary)' }}>
                                └ {h.aciklama || '—'}
                              </span>
                              <span style={{ color: giris ? 'var(--success)' : 'var(--danger)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {giris ? '+' : '−'}{Number(h.miktar).toFixed(0)} {urun?.birim || ''}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detay Modal */}
      {h && (
        <Modal
          open={!!h}
          onClose={() => setDetayHareket(null)}
          width={640}
          title={
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span>Stok Hareketi Detayı</span>
              {modalTur && <Badge tone={modalTur.tone}>{modalTur.isim}</Badge>}
            </div>
          }
          footer={<Button variant="secondary" onClick={() => setDetayHareket(null)}>Kapat</Button>}
        >
          {/* Stok bilgisi */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: 14,
            background: 'var(--brand-primary-soft)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 16,
          }}>
            {modalUrun?.gorselUrl ? (
              <img src={modalUrun.gorselUrl} alt="" style={{ width: 56, height: 56, borderRadius: 'var(--radius-sm)', objectFit: 'contain', background: 'var(--surface-card)', border: '1px solid var(--border-default)', flexShrink: 0 }} />
            ) : (
              <div style={{
                width: 56, height: 56, borderRadius: 'var(--radius-sm)',
                background: 'var(--surface-card)', border: '1px solid var(--border-default)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--brand-primary)', flexShrink: 0,
              }}>
                <Package size={24} strokeWidth={1.5} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>
                {h.stokAdi || modalUrun?.stokAdi || '—'}
              </p>
              <div style={{ marginTop: 4 }}>
                <CodeBadge>{h.stokKodu}</CodeBadge>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                {modalUrun?.marka && <span>{modalUrun.marka}</span>}
                {modalUrun?.grupKodu && <span>{modalUrun.grupKodu}</span>}
                {modalUrun?.birim && <span>{modalUrun.birim}</span>}
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              iconRight={<ArrowRight size={12} strokeWidth={1.5} />}
              onClick={() => { setDetayHareket(null); navigate(`/stok/model/${encodeURIComponent(h.stokKodu)}`) }}
            >
              Karta git
            </Button>
          </div>

          {/* Meta */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <div className="t-label" style={{ marginBottom: 4 }}>TARİH / SAAT</div>
              <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{tarihSaat(h.tarih)}</div>
            </div>
            <div>
              <div className="t-label" style={{ marginBottom: 4 }}>MİKTAR</div>
              <div style={{
                font: '600 14px/20px var(--font-sans)',
                color: modalTur?.gc === 'G' ? 'var(--success)' : 'var(--danger)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {modalTur?.gc === 'G' ? '+' : '−'}{Number(h.miktar).toFixed(0)} {modalUrun?.birim || ''}
              </div>
            </div>
            <div>
              <div className="t-label" style={{ marginBottom: 4 }}>GÜNCEL BAKİYE</div>
              <div style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {modalBakiye.toFixed(0)} {modalUrun?.birim || ''}
              </div>
            </div>
          </div>

          {h.aciklama && (
            <div style={{ marginBottom: 16 }}>
              <div className="t-label" style={{ marginBottom: 4 }}>AÇIKLAMA</div>
              <div style={{
                padding: 12,
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                font: '400 13px/20px var(--font-sans)',
                color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
              }}>
                {h.aciklama}
              </div>
            </div>
          )}

          {modalUrun && (
            <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
              <p className="t-label" style={{ marginBottom: 10 }}>STOK DURUMU</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                <div style={{
                  padding: 12, borderRadius: 'var(--radius-sm)',
                  background: 'var(--brand-primary-soft)',
                  border: '1px solid var(--border-default)',
                  textAlign: 'center',
                }}>
                  <div className="t-caption">Şu anki bakiye</div>
                  <div style={{ font: '600 18px/22px var(--font-sans)', color: 'var(--brand-primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                    {modalBakiye.toFixed(0)} <span style={{ fontSize: 12, fontWeight: 400 }}>{modalUrun.birim || ''}</span>
                  </div>
                </div>
                <div style={{
                  padding: 12, borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--border-default)',
                  textAlign: 'center',
                }}>
                  <div className="t-caption">Min. stok uyarı</div>
                  <div style={{ font: '600 18px/22px var(--font-sans)', color: 'var(--text-primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                    {modalUrun.minStok ? `${modalUrun.minStok} ${modalUrun.birim || ''}` : '—'}
                  </div>
                </div>
                <div style={{
                  padding: 12, borderRadius: 'var(--radius-sm)',
                  background: modalKritik ? 'var(--danger-soft)' : 'var(--success-soft)',
                  border: `1px solid ${modalKritik ? 'var(--danger-border)' : 'var(--success-border)'}`,
                  textAlign: 'center',
                }}>
                  <div className="t-caption" style={{ color: modalKritik ? 'var(--danger)' : 'var(--success)' }}>Durum</div>
                  <div style={{
                    font: '600 14px/20px var(--font-sans)', marginTop: 4,
                    color: modalKritik ? 'var(--danger)' : 'var(--success)',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    {modalKritik ? <><AlertTriangle size={14} strokeWidth={1.5} /> Kritik</> : <><CheckCircle2 size={14} strokeWidth={1.5} /> Yeterli</>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
