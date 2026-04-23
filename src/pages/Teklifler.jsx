import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Pencil, Trash2, Check, Receipt, Bell, AlertCircle, FileText, Inbox,
  ChevronUp, ChevronDown, Download, Inbox as InboxMail, ClipboardEdit, Search as SearchIc,
  CheckCircle2, Ban, Clock,
} from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useHatirlatma } from '../context/HatirlatmaContext'
import {
  teklifleriGetir, teklifSil as dbTeklifSil, teklifGuncelle,
  musteriTalepleriniGetir, musteriTalepGuncelle,
} from '../services/teklifService'
import { satislariGetir } from '../services/satisService'
import CustomSelect from '../components/CustomSelect'
import {
  Button, SearchInput, Card, Badge, CodeBadge, EmptyState,
} from '../components/ui'

const onayTone = {
  takipte:    { tone: 'lead',      isim: 'Cevap Bekleniyor' },
  kabul:      { tone: 'aktif',     isim: 'Onaylandı' },
  revizyon:   { tone: 'beklemede', isim: 'Revizyon' },
  vazgecildi: { tone: 'kayip',     isim: 'Reddedildi' },
}

const talepTone = {
  bekliyor:          { tone: 'beklemede', isim: 'Bekliyor',           C: Clock },
  inceleniyor:       { tone: 'lead',      isim: 'İnceleniyor',         C: SearchIc },
  teklif_hazirlandi: { tone: 'aktif',     isim: 'Teklif Hazırlandı',   C: CheckCircle2 },
  iptal:             { tone: 'kayip',     isim: 'İptal',              C: Ban },
}

const fmtTL = (n) => `₺${(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const goreceTarih = (t) => {
  if (!t) return '—'
  const gun = Math.floor((Date.now() - new Date(t).getTime()) / 86400000)
  if (gun === 0) return 'bugün'
  if (gun === 1) return 'dün'
  if (gun < 7)   return `${gun} gün önce`
  if (gun < 30)  return `${Math.floor(gun / 7)} hafta önce`
  if (gun < 365) return `${Math.floor(gun / 30)} ay önce`
  return `${Math.floor(gun / 365)} yıl önce`
}

const filtreMap = {
  cevap_beklenenler: (t) => ['takipte', 'revizyon'].includes(t.onayDurumu),
  onaylananlar:      (t) => t.onayDurumu === 'kabul',
  reddedilenler:     (t) => t.onayDurumu === 'vazgecildi',
  tumu:              () => true,
}

export default function Teklifler() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { teklifHatirlatmasi } = useHatirlatma()

  const [teklifler, setTeklifler] = useState([])
  const [musteriTalepleri, setMusteriTalepleri] = useState([])
  const [satislar, setSatislar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)

  const [aktifSekme, setAktifSekme] = useState('cevap_beklenenler')
  const [arama, setArama] = useState('')
  const [seciliTalep, setSeciliTalep] = useState(null)
  const [gosterilecek, setGosterilecek] = useState(100)

  useEffect(() => {
    Promise.all([teklifleriGetir(), musteriTalepleriniGetir(), satislariGetir()])
      .then(([t, tl, s]) => { setTeklifler(t); setMusteriTalepleri(tl); setSatislar(s); setYukleniyor(false) })
  }, [])

  if (yukleniyor) return <div style={{ padding: 24 }}><EmptyState title="Yükleniyor…" /></div>

  const bekleyenSayisi = musteriTalepleri.filter(t => t.durum === 'bekliyor').length

  const musteriTalepDurumGuncelle = async (id, yeniDurum) => {
    await musteriTalepGuncelle(id, { durum: yeniDurum })
    setMusteriTalepleri(prev => prev.map(t => t.id === id ? { ...t, durum: yeniDurum } : t))
  }

  const teklifOlustur = (talep) => {
    localStorage.setItem('teklif_on_doldurum', JSON.stringify({
      firmaAdi: talep.firmaAdi, musteriYetkilisi: talep.iletisimKisi,
      konu: `Teklif Talebi - ${talep.talepNo}`,
      aciklama: talep.aciklama,
      satirlar: (talep.urunler || []).map(u => ({
        stokKodu: '', stokAdi: u.isim, miktar: parseInt(u.adet) || 1,
        birim: 'Adet', birimFiyat: 0, iskonto: 0, kdv: 20,
      })),
      musteriTalepId: talep.id, musteriTalepNo: talep.talepNo,
    }))
    musteriTalepDurumGuncelle(talep.id, 'inceleniyor')
    navigate('/teklifler/yeni')
  }

  const durumGuncelle = async (id, yeniDurum) => {
    await teklifGuncelle(id, { onayDurumu: yeniDurum })
    setTeklifler(prev => prev.map(t => t.id === id ? { ...t, onayDurumu: yeniDurum } : t))
  }

  const teklifSil = async (id) => {
    const onay = await confirm({
      baslik: 'Teklifi Sil',
      mesaj: 'Bu teklif kalıcı olarak silinecek. Emin misiniz?',
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    await dbTeklifSil(id)
    setTeklifler(prev => prev.filter(t => t.id !== id))
    toast.success('Teklif silindi.')
  }

  const faturayaDonustur = (teklif) => {
    localStorage.setItem('satis_on_doldurum', JSON.stringify({
      firmaAdi: teklif.firmaAdi, musteriYetkili: teklif.musteriYetkilisi,
      teklifId: teklif.id, teklifNo: teklif.teklifNo,
      satirlar: (teklif.satirlar || []).map(s => ({
        id: crypto.randomUUID(),
        stokKodu: s.stokKodu || '', urunAdi: s.stokAdi || '',
        miktar: s.miktar || 1, birim: s.birim || 'Adet',
        birimFiyat: s.birimFiyat || 0, iskontoOran: s.iskonto || 0,
        kdvOran: s.kdv || 20, araToplam: 0, kdvTutar: 0, satirToplam: 0,
      })),
    }))
    navigate('/satislar/yeni')
  }

  const filtreli = [...teklifler]
    .reverse()
    .filter(t => (filtreMap[aktifSekme] || (() => true))(t))
    .filter(t => arama === '' || `${t.teklifNo || ''} ${t.firmaAdi || ''} ${t.konu || ''}`.toLowerCase().includes(arama.toLowerCase()))

  const gorunenTeklifler = filtreli.slice(0, gosterilecek)
  const dahaFazlaVar = filtreli.length > gosterilecek

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Teklifler</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            <span className="tabular-nums">{teklifler.length}</span> teklif
          </p>
        </div>
        {aktifSekme !== 'musteri_talepleri' && (
          <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => navigate('/teklifler/yeni')}>
            Yeni teklif
          </Button>
        )}
      </div>

      {/* Arama */}
      {aktifSekme !== 'musteri_talepleri' && (
        <div style={{ marginBottom: 16, maxWidth: 400 }}>
          <SearchInput
            value={arama}
            onChange={e => setArama(e.target.value)}
            placeholder="Teklif no, firma veya konu ara…"
          />
        </div>
      )}

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 0, borderBottom: '1px solid var(--border-default)', overflowX: 'auto' }}>
        {[
          { id: 'cevap_beklenenler', label: 'Cevap Beklenenler' },
          { id: 'onaylananlar',      label: 'Onaylananlar' },
          { id: 'reddedilenler',     label: 'Reddedilenler' },
          { id: 'tumu',              label: 'Tümü' },
          { id: 'musteri_talepleri', label: 'Müşteri Talepleri', icon: <InboxMail size={12} strokeWidth={1.5} />, badge: bekleyenSayisi },
        ].map(s => {
          const aktif = aktifSekme === s.id
          return (
            <button
              key={s.id}
              onClick={() => { setAktifSekme(s.id); setGosterilecek(100) }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${aktif ? 'var(--brand-primary)' : 'transparent'}`,
                marginBottom: -1,
                color: aktif ? 'var(--brand-primary)' : 'var(--text-secondary)',
                font: aktif ? '600 13px/18px var(--font-sans)' : '500 13px/18px var(--font-sans)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                fontSize: 11,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {s.icon}
              {s.label}
              {s.badge > 0 && (
                <span style={{
                  minWidth: 16, height: 16, padding: '0 5px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--danger)', color: '#fff',
                  fontSize: 10, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {s.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* MÜŞTERİ TALEPLERİ */}
      {aktifSekme === 'musteri_talepleri' && (
        <div style={{ marginTop: 20 }}>
          {musteriTalepleri.length === 0 ? (
            <EmptyState icon={<Inbox size={32} strokeWidth={1.5} />} title="Henüz müşteri teklif talebi yok" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[...musteriTalepleri].sort((a, b) => new Date(b.tarih) - new Date(a.tarih)).map(talep => {
                const d = talepTone[talep.durum] || talepTone.bekliyor
                const IconC = d.C
                const acik = seciliTalep === talep.id
                return (
                  <Card key={talep.id} padding={0} style={{ overflow: 'hidden' }}>
                    <div
                      onClick={() => setSeciliTalep(acik ? null : talep.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 16,
                        padding: '14px 20px',
                        cursor: 'pointer',
                        transition: 'background 120ms',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <CodeBadge>{talep.talepNo}</CodeBadge>
                          <Badge tone={d.tone} icon={<IconC size={11} strokeWidth={1.5} />}>{d.isim}</Badge>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, font: '400 13px/18px var(--font-sans)', flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{talep.firmaAdi || '—'}</span>
                          <span style={{ color: 'var(--border-default)' }}>·</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{talep.iletisimKisi}</span>
                          <span style={{ color: 'var(--border-default)' }}>·</span>
                          <span style={{ color: 'var(--text-tertiary)' }}>
                            <span className="tabular-nums">{talep.urunler?.length || 0}</span> ürün
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtTarih(talep.tarih)}
                        </span>
                        {acik ? <ChevronUp size={14} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronDown size={14} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />}
                      </div>
                    </div>

                    {acik && (
                      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-default)', background: 'var(--surface-sunken)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 20 }}>
                          <div>
                            <p className="t-label" style={{ marginBottom: 8 }}>İSTENEN ÜRÜNLER</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {(talep.urunler || []).map((u, i) => (
                                <div key={i} style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '6px 10px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: 'var(--surface-card)',
                                  border: '1px solid var(--border-default)',
                                }}>
                                  <span style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{u.isim}</span>
                                  <span style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                                    {u.adet} adet
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                              <p className="t-label" style={{ marginBottom: 6 }}>AÇIKLAMA</p>
                              <p style={{
                                font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)',
                                padding: '8px 10px',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--surface-card)',
                                border: '1px solid var(--border-default)',
                                margin: 0,
                              }}>
                                {talep.aciklama}
                              </p>
                            </div>
                            {talep.butce && (
                              <div>
                                <p className="t-label" style={{ marginBottom: 4 }}>BÜTÇE</p>
                                <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{talep.butce}</p>
                              </div>
                            )}
                            {talep.telefon && (
                              <div>
                                <p className="t-label" style={{ marginBottom: 4 }}>TELEFON</p>
                                <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{talep.telefon}</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-default)', flexWrap: 'wrap' }}>
                          {(talep.durum === 'bekliyor' || talep.durum === 'inceleniyor') && (
                            <Button variant="primary" iconLeft={<ClipboardEdit size={14} strokeWidth={1.5} />} onClick={() => teklifOlustur(talep)}>
                              Teklif oluştur
                            </Button>
                          )}
                          <div style={{ minWidth: 180 }}>
                            <CustomSelect
                              value={talep.durum}
                              onChange={e => musteriTalepDurumGuncelle(talep.id, e.target.value)}
                            >
                              <option value="bekliyor">Bekliyor</option>
                              <option value="inceleniyor">İnceleniyor</option>
                              <option value="teklif_hazirlandi">Teklif Hazırlandı</option>
                              <option value="iptal">İptal</option>
                            </CustomSelect>
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TEKLİF TABLOSU */}
      {aktifSekme !== 'musteri_talepleri' && (
        <div style={{ marginTop: 20 }}>
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {gorunenTeklifler.length === 0 ? (
              <div style={{ padding: 40 }}>
                <EmptyState
                  icon={<FileText size={32} strokeWidth={1.5} />}
                  title={arama ? 'Arama sonucu bulunamadı' : 'Bu kategoride teklif bulunmuyor'}
                />
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>
                    <thead>
                      <tr>
                        {[
                          { l: 'Teklif Açıklaması' },
                          { l: 'Fatura' },
                          { l: 'Düzenleme' },
                          { l: 'Toplam', align: 'right' },
                          { l: '', align: 'right' },
                        ].map((h, i) => (
                          <th key={i} style={{
                            background: 'var(--surface-sunken)',
                            padding: '10px 14px',
                            textAlign: h.align || 'left',
                            font: '600 11px/16px var(--font-sans)',
                            color: 'var(--text-tertiary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            borderBottom: '1px solid var(--border-default)',
                            whiteSpace: 'nowrap',
                          }}>{h.l}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {gorunenTeklifler.map(t => {
                        const onay = onayTone[t.onayDurumu] || onayTone.takipte
                        const hatirlatma = teklifHatirlatmasi(t.id)
                        const hatirlatmaVadesiGeldi = hatirlatma && new Date(hatirlatma.hatirlatmaTarihi) <= new Date()
                        const ilgiliFatura = satislar.find(s => s.teklifId === t.id)
                        return (
                          <tr key={t.id}
                            style={{ transition: 'background 120ms' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', minWidth: 280 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                {hatirlatma && (
                                  <span
                                    title={hatirlatmaVadesiGeldi
                                      ? 'Takip zamanı geldi!'
                                      : `Hatırlatma: ${new Date(hatirlatma.hatirlatmaTarihi).toLocaleDateString('tr-TR')}`}
                                    style={{ display: 'inline-flex', color: hatirlatmaVadesiGeldi ? 'var(--danger)' : 'var(--warning)' }}
                                  >
                                    {hatirlatmaVadesiGeldi
                                      ? <AlertCircle size={13} strokeWidth={1.5} />
                                      : <Bell size={13} strokeWidth={1.5} />}
                                  </span>
                                )}
                                <button
                                  onClick={() => navigate(`/teklifler/${t.id}`)}
                                  style={{
                                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                    font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)',
                                    textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360,
                                  }}
                                >
                                  {t.konu || t.teklifNo}
                                </button>
                                {t.revizyon > 0 && (
                                  <span style={{ font: '500 11px/16px var(--font-sans)', color: 'var(--warning)' }}>Rev.{t.revizyon}</span>
                                )}
                              </div>
                              <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 380 }}>
                                {t.firmaAdi}{t.musteriYetkilisi ? ` · ${t.musteriYetkilisi}` : ''}
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                                {ilgiliFatura ? (
                                  <button
                                    onClick={() => navigate(`/satislar/${ilgiliFatura.id}`)}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 4,
                                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                      font: '500 12px/16px var(--font-sans)', color: 'var(--success)',
                                    }}
                                  >
                                    <CheckCircle2 size={12} strokeWidth={1.5} /> Fatura oluşturuldu
                                  </button>
                                ) : t.onayDurumu === 'kabul' ? (
                                  <Button variant="primary" size="sm" iconLeft={<Receipt size={12} strokeWidth={1.5} />} onClick={() => faturayaDonustur(t)}>
                                    Fatura oluştur
                                  </Button>
                                ) : (
                                  <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                                )}
                                <Badge tone={onay.tone}>{onay.isim}</Badge>
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                              <div style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                                {fmtTarih(t.tarih)}
                              </div>
                              <div style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', fontStyle: 'italic', marginTop: 2 }}>
                                {goreceTarih(t.tarih)}
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', borderBottom: '1px solid var(--border-default)', font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                              {fmtTL(t.genelToplam)}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'inline-flex', gap: 4 }}>
                                <button
                                  aria-label="Düzenle"
                                  onClick={() => navigate(`/teklifler/${t.id}`)}
                                  style={{
                                    width: 28, height: 28,
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'transparent', border: '1px solid var(--border-default)',
                                    borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                                >
                                  <Pencil size={12} strokeWidth={1.5} />
                                </button>
                                {t.onayDurumu !== 'kabul' && t.onayDurumu !== 'vazgecildi' && (
                                  <button
                                    aria-label="Onayla"
                                    onClick={() => durumGuncelle(t.id, 'kabul')}
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
                                    <Check size={12} strokeWidth={2} /> Onayla
                                  </button>
                                )}
                                <button
                                  aria-label="Sil"
                                  onClick={() => teklifSil(t.id)}
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
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {dahaFazlaVar && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 16, borderTop: '1px solid var(--border-default)' }}>
                    <Button variant="secondary" iconLeft={<Download size={14} strokeWidth={1.5} />} onClick={() => setGosterilecek(p => p + 200)}>
                      {filtreli.length - gosterilecek} kayıt daha — yükle
                    </Button>
                  </div>
                )}

                {gorunenTeklifler.length > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 20px',
                    background: 'var(--surface-sunken)',
                    borderTop: '1px solid var(--border-default)',
                    font: '400 12px/16px var(--font-sans)',
                    color: 'var(--text-tertiary)',
                  }}>
                    <span><span className="tabular-nums">{gorunenTeklifler.length}</span> Kayıt</span>
                    <div style={{ display: 'flex', gap: 24 }}>
                      <span>Toplam: <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtTL(gorunenTeklifler.reduce((s, t) => s + (t.genelToplam || 0), 0))}
                      </strong></span>
                      <span>Kabul edilen: <strong style={{ color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtTL(gorunenTeklifler.filter(t => t.onayDurumu === 'kabul').reduce((s, t) => s + (t.genelToplam || 0), 0))}
                      </strong></span>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
