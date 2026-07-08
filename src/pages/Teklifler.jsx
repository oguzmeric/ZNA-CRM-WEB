import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Pencil, Trash2, Check, Receipt, Bell, AlertCircle, FileText, Inbox,
  ChevronUp, ChevronDown, Download, Inbox as InboxMail, ClipboardEdit, Search as SearchIc,
  CheckCircle2, Ban, Clock, CloudDownload,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useHatirlatma } from '../context/HatirlatmaContext'
import {
  teklifleriGetir, teklifSil as dbTeklifSil, teklifGuncelle,
  musteriTalepleriniGetir, musteriTalepGuncelle,
} from '../services/teklifService'
import { satislariGetir } from '../services/satisService'
import { trContains } from '../lib/trSearch'
import CustomSelect from '../components/CustomSelect'
import { SkeletonList } from '../components/Skeleton'
import {
  Button, SearchInput, Card, Badge, CodeBadge, EmptyState,
} from '../components/ui'

const onayTone = {
  takipte:    { tone: 'lead',      isim: 'Cevap Bekleniyor' },
  kabul:      { tone: 'aktif',     isim: 'Onaylandı' },
  revizyon:   { tone: 'beklemede', isim: 'Revizyon' },
  vazgecildi: { tone: 'kayip',     isim: 'Reddedildi' },
}

// Şablon tipi badge — 'standart' için gürültü olmasın diye render edilmez
const tipBadge = {
  trassir: { tone: 'lead',  isim: 'Trassir' },
  karel:   { tone: 'aktif', isim: 'Karel' },
}

const talepTone = {
  bekliyor:          { tone: 'beklemede', isim: 'Bekliyor',           C: Clock },
  inceleniyor:       { tone: 'lead',      isim: 'İnceleniyor',         C: SearchIc },
  teklif_hazirlandi: { tone: 'aktif',     isim: 'Teklif Hazırlandı',   C: CheckCircle2 },
  iptal:             { tone: 'kayip',     isim: 'İptal',              C: Ban },
}

const fmtTL = (n) => `₺${(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
// Para birimini teklife göre formatla (TEK-0547 USD'ydi, listede ₺ gösterilince yanıltıcı)
const PARA_SEMBOL = { TL: '₺', USD: '$', EUR: '€' }
const fmtPara = (n, paraBirimi) => {
  const sembol = PARA_SEMBOL[paraBirimi] || '₺'
  return `${sembol}${(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
}
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
  const { teklifHatirlatmasi, hatirlatmaSil } = useHatirlatma()

  const [teklifler, setTeklifler] = useState([])
  const [musteriTalepleri, setMusteriTalepleri] = useState([])
  const [satislar, setSatislar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)

  const [aktifSekme, setAktifSekme] = useState('cevap_beklenenler')
  const [arama, setArama] = useState('')
  const [seciliTalep, setSeciliTalep] = useState(null)
  const [gosterilecek, setGosterilecek] = useState(100)
  const [siralama, setSiralama] = useState('yeni')  // yeni | eski | tutar_yuksek | tutar_dusuk

  useEffect(() => {
    Promise.all([teklifleriGetir(), musteriTalepleriniGetir(), satislariGetir()])
      .then(([t, tl, s]) => { setTeklifler(t || []); setMusteriTalepleri(tl || []); setSatislar(s || []) })
      .catch(err => console.error('[Teklifler yükle]', err))
      .finally(() => setYukleniyor(false))
  }, [])

  if (yukleniyor) return <SkeletonList />

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
    // Kabul dışı durumlarda onay kuyruğundan (teklif_onayi + siparis_onayi) düşür.
    const payload = { onayDurumu: yeniDurum }
    if (yeniDurum !== 'kabul') { payload.teklifOnayi = null; payload.siparisOnayi = null }
    await teklifGuncelle(id, payload)
    setTeklifler(prev => prev.map(t => t.id === id ? { ...t, ...payload } : t))
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
    // Bu teklife bağlı hatırlatmayı da sil — silinmiş tekliften bildirim gelmesin
    hatirlatmaSil(id).catch(() => {})
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

  const siralayici = {
    yeni:          (a, b) => new Date(b.tarih || b.olusturmaTarih || 0) - new Date(a.tarih || a.olusturmaTarih || 0),
    eski:          (a, b) => new Date(a.tarih || a.olusturmaTarih || 0) - new Date(b.tarih || b.olusturmaTarih || 0),
    tutar_yuksek:  (a, b) => Number(b.genelToplam || 0) - Number(a.genelToplam || 0),
    tutar_dusuk:   (a, b) => Number(a.genelToplam || 0) - Number(b.genelToplam || 0),
  }

  const filtreli = [...teklifler]
    .filter(t => (filtreMap[aktifSekme] || (() => true))(t))
    .filter(t => trContains(`${t.teklifNo || ''} ${t.firmaAdi || ''} ${t.konu || ''}`, arama))
    .sort(siralayici[siralama] || siralayici.yeni)

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
        {aktifSekme !== 'musteri_talepleri' && aktifSekme !== 'esnweb' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <EsnCekButonu />
            <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => navigate('/teklifler/yeni')}>
              Yeni teklif
            </Button>
          </div>
        )}
      </div>

      {/* Arama + Sıralama */}
      {aktifSekme !== 'musteri_talepleri' && aktifSekme !== 'esnweb' && (
        <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, maxWidth: 400, minWidth: 240 }}>
            <SearchInput
              value={arama}
              onChange={e => setArama(e.target.value)}
              placeholder="Teklif no, firma veya konu ara…"
            />
          </div>
          <div style={{ minWidth: 200 }}>
            <CustomSelect value={siralama} onChange={e => setSiralama(e.target.value)}>
              <option value="yeni">Tarih: Yeni → Eski</option>
              <option value="eski">Tarih: Eski → Yeni</option>
              <option value="tutar_yuksek">Tutar: Yüksek → Düşük</option>
              <option value="tutar_dusuk">Tutar: Düşük → Yüksek</option>
            </CustomSelect>
          </div>
        </div>
      )}

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 0, borderBottom: '1px solid var(--border-default)', overflowX: 'auto' }}>
        {[
          { id: 'cevap_beklenenler', label: 'Cevap Beklenenler' },
          { id: 'onaylananlar',      label: 'Onaylananlar' },
          { id: 'reddedilenler',     label: 'Reddedilenler' },
          { id: 'tumu',              label: 'Tümü' },
          { id: 'esnweb',            label: 'esnweb', icon: <CloudDownload size={12} strokeWidth={1.5} /> },
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

      {/* esnweb tekliflerini panel */}
      {aktifSekme === 'esnweb' && <EsnwebPanel />}

      {/* TEKLİF TABLOSU */}
      {aktifSekme !== 'musteri_talepleri' && aktifSekme !== 'esnweb' && (
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
                          { l: 'Hazırlayan' },
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
                                {tipBadge[t.teklifTipi] && (
                                  <Badge tone={tipBadge[t.teklifTipi].tone}>{tipBadge[t.teklifTipi].isim}</Badge>
                                )}
                                {t.revizyon > 0 && (
                                  <span style={{ font: '500 11px/16px var(--font-sans)', color: 'var(--warning)' }}>Rev.{t.revizyon}</span>
                                )}
                              </div>
                              <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 380 }}>
                                {t.firmaAdi}{t.musteriYetkilisi ? ` · ${t.musteriYetkilisi}` : ''}
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
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
                                  <Badge tone={onay.tone}>{onay.isim}</Badge>
                                )}
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
                            <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                              <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                                {t.hazirlayan || '—'}
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 140 }}>
                                <span style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                                  {fmtPara(t.genelToplam, t.paraBirimi)}
                                </span>
                                <span style={{
                                  width: 34,
                                  textAlign: 'center',
                                  padding: '1px 0',
                                  borderRadius: 8,
                                  background: t.paraBirimi && t.paraBirimi !== 'TL' ? 'var(--warning-soft)' : 'transparent',
                                  color: t.paraBirimi && t.paraBirimi !== 'TL' ? 'var(--warning)' : 'transparent',
                                  font: '700 9px/13px var(--font-sans)',
                                }}>{t.paraBirimi && t.paraBirimi !== 'TL' ? t.paraBirimi : '·'}</span>
                              </div>
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
                      <span title="Sadece TL teklifleri toplanır (farklı para birimleri toplanamaz)">
                        TL Toplam: <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtTL(
                            gorunenTeklifler
                              .filter(t => (t.paraBirimi || 'TL') === 'TL')
                              .reduce((s, t) => s + (t.genelToplam || 0), 0)
                          )}
                        </strong>
                      </span>
                      <span title="Sadece TL kabul edilen teklifler toplanır">
                        Kabul edilen: <strong style={{ color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtTL(
                            gorunenTeklifler
                              .filter(t => t.onayDurumu === 'kabul' && (t.paraBirimi || 'TL') === 'TL')
                              .reduce((s, t) => s + (t.genelToplam || 0), 0)
                          )}
                        </strong>
                      </span>
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

// esn.dovkod → CRM para_birimi
function dovkodDon(dov) {
  if (dov === 'D') return 'USD'
  if (dov === 'E') return 'EUR'
  if (dov === 'S') return 'GBP'
  return 'TL'
}

// esnweb tekliflerini listeleyen panel — arama, tarih filtresi, kalem expand
function EsnwebPanel() {
  const navigate = useNavigate()
  const [tumu, setTumu] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [arama, setArama] = useState('')
  const [gunFiltresi, setGunFiltresi] = useState('7')  // son N gün
  const [acikFisno, setAcikFisno] = useState(null)
  const [kalemler, setKalemler] = useState({})  // fisno → kalem[]
  const [importEdiliyor, setImportEdiliyor] = useState(null)  // fisno
  const [topluAktarim, setTopluAktarim] = useState(null)  // { toplam, yapilan, hata }

  useEffect(() => {
    (async () => {
      setYukleniyor(true)
      const bugun = new Date()
      const oncesi = new Date()
      oncesi.setDate(bugun.getDate() - Number(gunFiltresi))
      const alt = oncesi.toISOString().slice(0, 10)
      const { data, error } = await supabase.from('esn_teklifler')
        .select('fisno, evrak_no, tarih, firma_adi, temsilci, hazirlayan, teklif_konusu, dovkod, genel_toplam, genel_toplam_dov, aciklama, onay_durumu, tek_kabul, crm_teklif_id')
        .eq('silindi', false)
        .gte('tarih', alt)
        .order('tarih', { ascending: false })
        .order('evrak_no', { ascending: false })
        .limit(500)
      if (error) console.warn('[esnweb-panel]', error.message)
      setTumu(data || [])
      setYukleniyor(false)
    })()
  }, [gunFiltresi])

  const acKapa = async (fisno) => {
    if (acikFisno === fisno) { setAcikFisno(null); return }
    setAcikFisno(fisno)
    if (!kalemler[fisno]) {
      const { data } = await supabase.from('esn_teklif_kalemleri')
        .select('refno, stok_kodu, stok_adi, birim, miktar, fiyat, tutar, kdv_yuzde, iskonto1_yuzde, net_tutar, dovkod, kur')
        .eq('fisno', fisno)
        .order('refno')
      setKalemler(k => ({ ...k, [fisno]: data || [] }))
    }
  }

  // Aktarılmamış tüm teklifleri toplu CRM'e aktarır (yönlendirmesiz, arka planda)
  const topluAktar = async () => {
    const aktarilmayan = tumu.filter(x => !x.crm_teklif_id)
    if (!aktarilmayan.length) { alert('Aktarılacak yeni teklif yok — hepsi zaten CRM\'de.'); return }
    if (!confirm(`${aktarilmayan.length} teklif CRM'e aktarılacak. Devam edilsin mi?`)) return
    setTopluAktarim({ toplam: aktarilmayan.length, yapilan: 0, hata: 0 })
    let yapilan = 0, hata = 0
    // Musteri map — bir kez al, sık sık sorgulama
    const { data: musteriler } = await supabase.from('musteriler').select('id, ad').limit(5000)
    const norm = (s) => (s || '').trim().replace(/\s+/g, ' ').toUpperCase()
    const musteriMap = new Map((musteriler || []).map(m => [norm(m.ad), m.id]))

    for (const t of aktarilmayan) {
      try {
        // Kalemleri çek
        const { data: kalemLst } = await supabase.from('esn_teklif_kalemleri')
          .select('stok_kodu, stok_adi, birim, miktar, fiyat, kdv_yuzde, iskonto1_yuzde, kur')
          .eq('fisno', t.fisno)
        const satirlar = (kalemLst || []).map(k => ({
          id: crypto.randomUUID(),
          stokKodu: k.stok_kodu || '',
          stokAdi: k.stok_adi || '',
          miktar: Number(k.miktar) || 0,
          birim: k.birim || 'Adet',
          birimFiyat: Number(k.fiyat) || 0,
          iskonto: Number(k.iskonto1_yuzde) || 0,
          kdv: Number(k.kdv_yuzde) || 20,
        }))
        const yeni = {
          tarih: t.tarih || new Date().toISOString().slice(0, 10),
          musteri_id: musteriMap.get(norm(t.firma_adi)) || null,
          firma_adi: t.firma_adi,
          konu: t.teklif_konusu || `esnweb #${t.evrak_no}`,
          para_birimi: dovkodDon(t.dovkod),
          doviz_kuru: Number(kalemLst?.[0]?.kur) || 0,
          hazirlayan: t.hazirlayan || t.temsilci || null,
          onay_durumu: 'takipte',
          satirlar,
          aciklama: `esnweb'den içe aktarıldı: FISNO ${t.fisno}, Evrak ${t.evrak_no}`,
        }
        const { data: inserted, error } = await supabase.from('teklifler').insert(yeni).select('id').single()
        if (error) throw error
        await supabase.from('esn_teklifler').update({ crm_teklif_id: inserted.id }).eq('fisno', t.fisno)
        yapilan++
      } catch (e) {
        console.warn('[toplu-aktar]', t.fisno, e?.message)
        hata++
      }
      setTopluAktarim({ toplam: aktarilmayan.length, yapilan, hata })
    }
    // Listeyi tazele
    const { data: tazelenmis } = await supabase.from('esn_teklifler')
      .select('fisno, evrak_no, tarih, firma_adi, temsilci, hazirlayan, teklif_konusu, dovkod, genel_toplam, genel_toplam_dov, aciklama, onay_durumu, tek_kabul, crm_teklif_id')
      .eq('silindi', false)
      .in('fisno', tumu.map(x => x.fisno))
    if (tazelenmis) setTumu(tazelenmis)
    alert(`Toplu aktarım tamamlandı!\n\nBaşarılı: ${yapilan}\nHata: ${hata}`)
    setTopluAktarim(null)
  }

  const crmeAktar = async (t) => {
    setImportEdiliyor(t.fisno)
    try {
      const kalemLst = kalemler[t.fisno] || []
      // Müşteriyi firma_adi ile bul (fuzzy: temizlenmiş, upper)
      const norm = (s) => (s || '').trim().replace(/\s+/g, ' ').toUpperCase()
      const { data: musteriler } = await supabase.from('musteriler').select('id, ad').ilike('ad', `%${(t.firma_adi || '').split(' ')[0]}%`).limit(50)
      const eslesme = (musteriler || []).find(m => norm(m.ad) === norm(t.firma_adi))

      // Kalem satırları CRM formatına
      const satirlar = kalemLst.map(k => ({
        id: crypto.randomUUID(),
        stokKodu: k.stok_kodu || '',
        stokAdi: k.stok_adi || '',
        miktar: Number(k.miktar) || 0,
        birim: k.birim || 'Adet',
        birimFiyat: Number(k.fiyat) || 0,
        iskonto: Number(k.iskonto1_yuzde) || 0,
        kdv: Number(k.kdv_yuzde) || 20,
      }))

      const yeniTeklif = {
        tarih: t.tarih || new Date().toISOString().slice(0, 10),
        musteri_id: eslesme?.id || null,
        firma_adi: t.firma_adi,
        konu: t.teklif_konusu || `esnweb #${t.evrak_no}`,
        para_birimi: dovkodDon(t.dovkod),
        doviz_kuru: Number(kalemLst[0]?.kur) || 0,
        hazirlayan: t.hazirlayan || t.temsilci || null,
        onay_durumu: 'takipte',
        satirlar,
        aciklama: `esnweb'den içe aktarıldı: FISNO ${t.fisno}, Evrak ${t.evrak_no}`,
      }

      const { data, error } = await supabase.from('teklifler').insert(yeniTeklif).select('id').single()
      if (error) {
        alert('İçe aktarma hatası: ' + error.message)
        return
      }
      // esn_teklifler.crm_teklif_id set — aynı teklifi tekrar aktarmayı önle
      await supabase.from('esn_teklifler').update({ crm_teklif_id: data.id }).eq('fisno', t.fisno)
      navigate(`/teklifler/${data.id}`)
    } catch (e) {
      alert('Hata: ' + (e?.message || e))
    } finally {
      setImportEdiliyor(null)
    }
  }

  const filtreli = tumu.filter(t => {
    if (!arama.trim()) return true
    const q = arama.toLowerCase()
    return (t.firma_adi || '').toLowerCase().includes(q)
      || String(t.evrak_no || '').includes(q)
      || (t.teklif_konusu || '').toLowerCase().includes(q)
      || (t.temsilci || '').toLowerCase().includes(q)
  })

  const fmtDov = (n, dov) => {
    const sym = dov === 'D' ? '$' : dov === 'E' ? '€' : dov === 'S' ? '£' : '₺'
    return sym + Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={arama}
          onChange={e => setArama(e.target.value)}
          placeholder="Firma, teklif no, konu, temsilci ara…"
          style={{
            flex: 1, minWidth: 260, padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-default)',
            background: 'var(--surface-card)', color: 'var(--text-primary)',
            font: '400 13px/18px var(--font-sans)',
          }}
        />
        <select value={gunFiltresi} onChange={e => setGunFiltresi(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-default)', background: 'var(--surface-card)',
            color: 'var(--text-primary)', font: '400 13px/18px var(--font-sans)',
          }}>
          <option value="1">Son 1 gün</option>
          <option value="3">Son 3 gün</option>
          <option value="7">Son 7 gün</option>
          <option value="30">Son 30 gün</option>
          <option value="90">Son 3 ay</option>
          <option value="365">Son 1 yıl</option>
        </select>
        <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
          <span className="tabular-nums">{filtreli.length}</span> teklif
          {tumu.some(x => !x.crm_teklif_id) && (
            <span style={{ marginLeft: 8, color: 'var(--warning)' }}>
              (<span className="tabular-nums">{tumu.filter(x => !x.crm_teklif_id).length}</span> aktarılmayı bekliyor)
            </span>
          )}
        </span>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Download size={12} strokeWidth={1.5} />}
          onClick={topluAktar}
          disabled={!!topluAktarim || !tumu.some(x => !x.crm_teklif_id)}
        >
          {topluAktarim
            ? `Aktarılıyor ${topluAktarim.yapilan}/${topluAktarim.toplam}${topluAktarim.hata ? ` (${topluAktarim.hata} hata)` : ''}…`
            : 'Tümünü CRM\'e Aktar'}
        </Button>
      </div>

      <Card padding={0} style={{ overflow: 'hidden' }}>
        {yukleniyor ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
        ) : filtreli.length === 0 ? (
          <div style={{ padding: 40 }}>
            <EmptyState
              icon={<CloudDownload size={32} strokeWidth={1.5} />}
              title="Kayıt yok"
              description="Üstteki 'esnweb Çek' butonuyla senkron yap veya tarih aralığını genişlet."
            />
          </div>
        ) : (
          <div>
            {filtreli.map(t => {
              const acik = acikFisno === t.fisno
              return (
                <div key={t.fisno} style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <div onClick={() => acKapa(t.fisno)} style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 100px 1fr 160px 130px 32px',
                    gap: 12, alignItems: 'center',
                    padding: '12px 16px', cursor: 'pointer',
                    background: acik ? 'var(--surface-sunken)' : 'transparent',
                    transition: 'background 120ms',
                  }}>
                    <div style={{ fontWeight: 600, color: 'var(--brand-primary)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                      #{t.evrak_no || '—'}
                      {t.crm_teklif_id && <Check size={12} strokeWidth={2} color="var(--success)" title="CRM'e aktarılmış" />}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      {t.tarih ? new Date(t.tarih).toLocaleDateString('tr-TR') : '—'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.firma_adi}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{t.teklif_konusu || '—'}</div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.temsilci || t.hazirlayan || '—'}</div>
                    <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtDov(t.genel_toplam, t.dovkod)}
                    </div>
                    <ChevronDown size={16} style={{ transform: acik ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 150ms', color: 'var(--text-tertiary)' }} />
                  </div>

                  {acik && (
                    <div style={{ padding: '10px 16px 16px', background: 'var(--surface-sunken)' }}>
                      {!kalemler[t.fisno] ? (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>Kalemler yükleniyor…</div>
                      ) : kalemler[t.fisno].length === 0 ? (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>Kalem bulunmuyor</div>
                      ) : (
                        <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', overflow: 'hidden' }}>
                          <div style={{
                            display: 'grid', gridTemplateColumns: '130px 1fr 80px 80px 110px 110px',
                            gap: 8, padding: '8px 12px',
                            background: 'var(--surface-sunken)',
                            font: '600 11px/14px var(--font-sans)',
                            color: 'var(--text-tertiary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.03em',
                            borderBottom: '1px solid var(--border-default)',
                          }}>
                            <div>Stok Kodu</div>
                            <div>Ürün</div>
                            <div style={{ textAlign: 'right' }}>Miktar</div>
                            <div>Birim</div>
                            <div style={{ textAlign: 'right' }}>Birim Fiyat</div>
                            <div style={{ textAlign: 'right' }}>Tutar</div>
                          </div>
                          {kalemler[t.fisno].map(k => (
                            <div key={k.refno} style={{
                              display: 'grid', gridTemplateColumns: '130px 1fr 80px 80px 110px 110px',
                              gap: 8, padding: '8px 12px',
                              font: '400 12px/16px var(--font-sans)',
                              color: 'var(--text-primary)',
                              borderTop: '1px solid var(--border-default)',
                            }}>
                              <div style={{ fontFamily: 'monospace', fontSize: 11 }}>{k.stok_kodu}</div>
                              <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.stok_adi}</div>
                              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Number(k.miktar || 0)}</div>
                              <div style={{ color: 'var(--text-tertiary)' }}>{k.birim}</div>
                              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtDov(k.fiyat, k.dovkod)}</div>
                              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtDov(k.tutar, k.dovkod)}</div>
                            </div>
                          ))}
                          <div style={{
                            padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20,
                            fontSize: 12, color: 'var(--text-secondary)',
                            background: 'var(--surface-sunken)', borderTop: '1px solid var(--border-default)',
                          }}>
                            {t.crm_teklif_id ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                iconLeft={<Check size={12} strokeWidth={1.5} />}
                                onClick={() => navigate(`/teklifler/${t.crm_teklif_id}`)}
                              >
                                CRM'de Aç
                              </Button>
                            ) : (
                              <Button
                                variant="primary"
                                size="sm"
                                iconLeft={<Download size={12} strokeWidth={1.5} />}
                                onClick={() => crmeAktar(t)}
                                disabled={importEdiliyor === t.fisno}
                              >
                                {importEdiliyor === t.fisno ? 'İçe aktarılıyor…' : "CRM'e İçe Aktar"}
                              </Button>
                            )}
                            <div style={{ display: 'flex', gap: 20 }}>
                              {t.dovkod === 'D' && <span>Kur: <strong style={{ color: 'var(--text-primary)' }}>{kalemler[t.fisno][0]?.kur?.toFixed(4) || '—'}</strong></span>}
                              <span>Genel Toplam: <strong style={{ color: 'var(--text-primary)', fontSize: 14 }}>{fmtDov(t.genel_toplam, t.dovkod)}</strong></span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

// esnweb'den teklif çekme butonu — 100 son teklifi liste + baş + kalem senkron eder
// supabase.functions.invoke bilinmeyen bir nedenle 'Failed to send request' veriyor,
// doğrudan fetch ile session token gönderiyoruz (test edildi: çalışıyor)
function EsnCekButonu() {
  const [cekiliyor, setCekiliyor] = useState(false)
  const cek = async () => {
    setCekiliyor(true)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess?.session?.access_token
      if (!token) { alert('Oturum bulunamadı'); return }
      const url = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/esn-teklif-senkron'
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ limit: 100 }),
      })
      const data = await r.json()
      if (!data?.ok) { alert('Çekilemedi: ' + (data?.hata || r.status)); return }
      const y = data.yeni || 0, g = data.guncellenen || 0, k = data.kalem_yeni || 0, h = data.hatalar || []
      let msg = `Tarandı: ${data.taranan}\nYeni: ${y}\nGüncellenen: ${g}\nKalem eklendi: ${k}`
      if (h.length) msg += `\n\nHatalar (${h.length}):\n` + h.slice(0, 5).join('\n')
      alert(msg)
    } catch (e) {
      alert('Hata: ' + (e?.message || e))
    } finally {
      setCekiliyor(false)
    }
  }
  return (
    <Button
      variant="secondary"
      iconLeft={<CloudDownload size={14} strokeWidth={1.5} />}
      onClick={cek}
      disabled={cekiliyor}
      title="Son 100 esnweb teklifini kalemleriyle birlikte senkron eder"
    >
      {cekiliyor ? 'Çekiliyor…' : 'esnweb Çek'}
    </Button>
  )
}
