// Kullanılan Malzemeler v2 (madde 23) — sipariş + servis + manuel teslimlerin
// TEK ekranda müşteri bazlı fatura takibi. Veri: malzeme_hareketleri (mig 192,
// trigger'larla otomatik beslenir). Kayıt silinmez; durumlar renk kodludur.

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  Package, ChevronDown, ChevronRight, Receipt, Clock, Plus, History, X, FileDown, Send,
} from 'lucide-react'
import { Card, Badge, EmptyState, SearchInput, Modal, Button, Input, Label, Textarea } from '../components/ui'
import CustomSelect from '../components/CustomSelect'
import {
  FATURA_DURUM, KAYNAK_META, ACIKLAMA_ZORUNLU, YONETICI_ONAYLI, BEKLEYEN_DURUMLAR,
  hareketleriGetir, hareketGuncelle, manuelHareketEkle, bekleyenGun, bekleyenTutar,
  hareketlerdenProformaAc,
} from '../services/malzemeHareketService'
import { musterileriGetir } from '../services/musteriService'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { trContains } from '../lib/trSearch'
import { SkeletonList } from '../components/Skeleton'

const PB_SEMBOL = { TL: '₺', USD: '$', EUR: '€' }
const fmtPara = (n, pb = 'TL') =>
  `${PB_SEMBOL[pb] || pb} ${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtTarih = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
  } catch { return iso }
}

const SEKME_DURUM = {
  kesilmemis:  ['fatura_bekliyor', 'faturaya_hazir', 'fatura_iptal'],
  proforma:    ['proforma_hazirlandi', 'proforma_gonderildi', 'musteri_onayi_bekleniyor'],
  kismen:      ['kismen_faturalandi'],
  faturalandi: ['faturalandi'],
}

function DurumRozet({ h }) {
  const m = FATURA_DURUM[h.faturaDurumu] || { isim: h.faturaDurumu, renk: '#94a3b8' }
  return (
    <Badge style={{ background: `${m.renk}22`, color: m.renk, border: `1px solid ${m.renk}66`, whiteSpace: 'nowrap' }}>
      {m.isim}
      {h.faturaDurumu === 'kismen_faturalandi' && ` · ${Number(h.faturalananMiktar)}/${Number(h.miktar)}`}
      {h.faturaDurumu === 'faturalandi' && h.faturaNo ? ` · ${h.faturaNo}` : ''}
    </Badge>
  )
}

function KaynakRozet({ h, navigate }) {
  const m = KAYNAK_META[h.kaynak] || { isim: h.kaynak, renk: '#64748b' }
  const hedef = h.kaynak === 'siparis' && h.siparisId ? `/siparisler/${h.siparisId}`
    : h.kaynak === 'servis' && h.servisId ? `/servis-talepleri/${h.servisId}` : null
  return (
    <span
      onClick={hedef ? (e) => { e.stopPropagation(); navigate(hedef) } : undefined}
      title={hedef ? 'Kaynağa git' : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 'var(--radius-pill)',
        background: `${m.renk}18`, color: m.renk, border: `1px solid ${m.renk}55`,
        font: '600 10.5px/14px var(--font-sans)',
        cursor: hedef ? 'pointer' : 'default', whiteSpace: 'nowrap',
      }}
    >
      {m.isim}{h.kaynakNo ? ` · ${h.kaynakNo}` : ''}
    </span>
  )
}

export default function KullanilanMalzemeler() {
  const navigate = useNavigate()
  const { kullanici } = useAuth()
  const { toast } = useToast()
  const adminMi = kullanici?.rol === 'admin'

  const [hareketler, setHareketler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [sekme, setSekme] = useState('hepsi') // hepsi | kesilmemis | proforma | kismen | faturalandi | sure
  const [sureEsik, setSureEsik] = useState(3)
  const [kaynakFiltre, setKaynakFiltre] = useState('')
  const [arama, setArama] = useState('')
  const [acikMusteriler, setAcikMusteriler] = useState({})
  const [gecmisAcik, setGecmisAcik] = useState({})       // hareketId → bool
  const [secili, setSecili] = useState(new Set())
  const [durumModal, setDurumModal] = useState(null)      // { hareketler: [...] }
  const [manuelModal, setManuelModal] = useState(false)

  const yukle = () => {
    hareketleriGetir()
      .then(setHareketler)
      .catch(e => { console.error('[kullanilan malzemeler]', e); toast.error('Liste yüklenemedi: ' + (e?.message || '')) })
      .finally(() => setYukleniyor(false))
  }
  useEffect(() => { yukle() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sekme + kaynak + arama süzgeci
  const filtreli = useMemo(() => hareketler.filter(h => {
    if (sekme === 'sure') {
      if (!BEKLEYEN_DURUMLAR.includes(h.faturaDurumu)) return false
      if (bekleyenGun(h) < sureEsik) return false
    } else if (sekme !== 'hepsi' && !SEKME_DURUM[sekme]?.includes(h.faturaDurumu)) return false
    if (kaynakFiltre && h.kaynak !== kaynakFiltre) return false
    if (arama.trim()) {
      const metin = `${h.musteriAd || ''} ${h.urunAd || ''} ${h.model || ''} ${h.stokKodu || ''} ${h.seriNo || ''} ${h.kaynakNo || ''} ${h.proformaNo || ''} ${h.faturaNo || ''} ${h.teknisyen || ''}`
      if (!trContains(metin, arama)) return false
    }
    return true
  }), [hareketler, sekme, sureEsik, kaynakFiltre, arama])

  // Müşteri bazlı gruplama (23.2)
  const gruplar = useMemo(() => {
    const map = new Map()
    for (const h of filtreli) {
      const anahtar = (h.musteriAd || '').trim() || `Müşteri #${h.musteriId ?? '—'}`
      if (!map.has(anahtar)) map.set(anahtar, [])
      map.get(anahtar).push(h)
    }
    return [...map.entries()]
      .map(([ad, liste]) => {
        const bekleyenler = liste.filter(x => BEKLEYEN_DURUMLAR.includes(x.faturaDurumu))
        const tutarlar = {}
        for (const x of bekleyenler) {
          const pb = x.paraBirimi || 'TL'
          tutarlar[pb] = (tutarlar[pb] || 0) + bekleyenTutar(x)
        }
        const enEski = bekleyenler.reduce((acc, x) => {
          const t = x.teslimTarihi || x.olusturmaTarih
          return (!acc || (t && t < acc)) ? t : acc
        }, null)
        return {
          ad, liste,
          bekleyenSayi: bekleyenler.length,
          kesilenSayi: liste.filter(x => x.faturaDurumu === 'faturalandi').length,
          kismenSayi: liste.filter(x => x.faturaDurumu === 'kismen_faturalandi').length,
          tutarlar, enEski,
        }
      })
      .sort((a, b) => b.bekleyenSayi - a.bekleyenSayi || a.ad.localeCompare(b.ad, 'tr'))
  }, [filtreli])

  // KPI şeridi + sekme sayıları
  const kpi = useMemo(() => {
    const bekleyenler = hareketler.filter(h => BEKLEYEN_DURUMLAR.includes(h.faturaDurumu))
    const tutarlar = {}
    for (const h of bekleyenler) {
      const pb = h.paraBirimi || 'TL'
      tutarlar[pb] = (tutarlar[pb] || 0) + bekleyenTutar(h)
    }
    return {
      bekleyen: bekleyenler.length,
      tutarlar,
      geciken15: bekleyenler.filter(h => bekleyenGun(h) >= 15).length,
      sayilar: {
        hepsi: hareketler.length,
        kesilmemis: hareketler.filter(h => SEKME_DURUM.kesilmemis.includes(h.faturaDurumu)).length,
        proforma: hareketler.filter(h => SEKME_DURUM.proforma.includes(h.faturaDurumu)).length,
        kismen: hareketler.filter(h => SEKME_DURUM.kismen.includes(h.faturaDurumu)).length,
        faturalandi: hareketler.filter(h => h.faturaDurumu === 'faturalandi').length,
        sure: hareketler.filter(h => BEKLEYEN_DURUMLAR.includes(h.faturaDurumu) && bekleyenGun(h) >= 3).length,
      },
    }
  }, [hareketler])

  const seciliToggle = (id) => setSecili(prev => {
    const s = new Set(prev)
    s.has(id) ? s.delete(id) : s.add(id)
    return s
  })

  const [proformaAciliyor, setProformaAciliyor] = useState(false)

  // Seçili kalemlerden proforma aç (Faturaya Gönder) — Abdullah'a bildirim gider
  const faturayaGonder = async () => {
    const secilenler = hareketler.filter(h => secili.has(h.id))
    setProformaAciliyor(true)
    try {
      const { kayit, vergiEksik } = await hareketlerdenProformaAc(secilenler, kullanici)
      toast.success(`Proforma ${kayit.talepNo} oluşturuldu — muhasebeye bildirim gitti.`)
      if (vergiEksik) toast.info('Dikkat: müşterinin vergi no/dairesi eksik — fatura kesilmeden tamamlanmalı.', { sure: 12000 })
      setSecili(new Set())
      yukle()
    } catch (e) {
      toast.error(e?.message || 'Proforma açılamadı.')
    } finally {
      setProformaAciliyor(false)
    }
  }

  // Görünen listeyi Excel'e aktar (madde 23.14)
  const excelAktar = () => {
    const satirlar = filtreli.map(h => ({
      'Müşteri': h.musteriAd || '',
      'Ürün': h.urunAd || '',
      'Model': h.model || '',
      'Stok Kodu': h.stokKodu || '',
      'Seri No': h.seriNo || '',
      'Miktar': Number(h.miktar) || 0,
      'Birim': h.birim || 'Adet',
      'Birim Fiyat': h.birimFiyat != null ? Number(h.birimFiyat) : '',
      'Para Birimi': h.paraBirimi || 'TL',
      'Kaynak': KAYNAK_META[h.kaynak]?.isim || h.kaynak,
      'Kaynak No': h.kaynakNo || '',
      'Fatura Durumu': FATURA_DURUM[h.faturaDurumu]?.isim || h.faturaDurumu,
      'Faturalanan': Number(h.faturalananMiktar) || 0,
      'Bekleyen Tutar': bekleyenTutar(h),
      'Proforma No': h.proformaNo || '',
      'Fatura No': h.faturaNo || '',
      'Fatura Tarihi': h.faturaTarihi || '',
      'Teslim Tarihi': (h.teslimTarihi || '').slice(0, 10),
      'Bekleme (gün)': bekleyenGun(h),
      'Teknisyen': h.teknisyen || '',
      'Açıklama': h.aciklama || '',
    }))
    const ws = XLSX.utils.json_to_sheet(satirlar)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Kullanılan Malzemeler')
    const bugun = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `ZNA_Kullanilan_Malzemeler_${bugun}.xlsx`)
  }

  if (yukleniyor) return <SkeletonList />

  const SEKMELER = [
    { id: 'hepsi',       l: 'Tüm Malzemeler' },
    { id: 'kesilmemis',  l: 'Faturası Kesilmemiş' },
    { id: 'proforma',    l: 'Proforma Oluşturulanlar' },
    { id: 'kismen',      l: 'Kısmen Kesilenler' },
    { id: 'faturalandi', l: 'Faturası Kesilenler' },
    { id: 'sure',        l: 'Bekleme Süresi Geçenler' },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      {/* Header + KPI */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Kullanılan Malzemeler</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            Sipariş + servis + manuel teslimlerin fatura takibi — hiçbir ürün faturasız unutulmasın
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {secili.size > 0 && (
            <>
              <Button
                variant="primary"
                iconLeft={<Send size={14} strokeWidth={1.5} />}
                onClick={faturayaGonder}
                disabled={proformaAciliyor}
                title="Seçili kalemlerden proforma oluştur — muhasebeye bildirim gider"
              >
                {proformaAciliyor ? 'Proforma açılıyor…' : `Faturaya Gönder (${secili.size})`}
              </Button>
              <Button variant="secondary" onClick={() => {
                const secilenler = hareketler.filter(h => secili.has(h.id))
                setDurumModal({ hareketler: secilenler })
              }}>
                Durum Değiştir ({secili.size})
              </Button>
            </>
          )}
          <Button variant="secondary" iconLeft={<FileDown size={14} strokeWidth={1.5} />} onClick={excelAktar} title="Görünen listeyi Excel'e aktar">
            Excel
          </Button>
          <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => setManuelModal(true)}>
            Manuel Kayıt
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { l: 'Fatura Bekleyen', v: kpi.bekleyen, renk: '#ef4444' },
          { l: 'Bekleyen Tutar', v: Object.entries(kpi.tutarlar).map(([pb, t]) => fmtPara(t, pb)).join(' + ') || '₺ 0,00', renk: '#f59e0b' },
          { l: '15+ Gün Geciken', v: kpi.geciken15, renk: '#dc2626' },
          { l: 'Faturası Kesilen', v: kpi.sayilar.faturalandi, renk: '#10b981' },
        ].map(k => (
          <Card key={k.l} padding={12} style={{ flex: '1 1 160px', borderLeft: `3px solid ${k.renk}` }}>
            <div className="t-caption">{k.l}</div>
            <div style={{ font: '700 18px/24px var(--font-sans)', color: 'var(--text-primary)', marginTop: 2 }}>{k.v}</div>
          </Card>
        ))}
      </div>

      {/* Yönetici özeti (madde 23.15) — yalnız admin */}
      {adminMi && <YoneticiOzeti hareketler={hareketler} sekmeyeGit={(esik) => { setSekme('sure'); setSureEsik(esik) }} />}

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--border-default)', overflowX: 'auto' }}>
        {SEKMELER.map(s => (
          <button
            key={s.id}
            onClick={() => setSekme(s.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 12px',
              background: 'transparent', border: 'none', marginBottom: -1,
              borderBottom: `2px solid ${sekme === s.id ? 'var(--brand-primary)' : 'transparent'}`,
              color: sekme === s.id ? 'var(--brand-primary)' : 'var(--text-secondary)',
              font: '600 11px/16px var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.04em',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {s.l}
            <span style={{ opacity: 0.65, fontVariantNumeric: 'tabular-nums' }}>({kpi.sayilar[s.id]})</span>
          </button>
        ))}
      </div>

      {/* Filtre satırı */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, maxWidth: 380, minWidth: 220 }}>
          <SearchInput value={arama} onChange={e => setArama(e.target.value)} placeholder="Müşteri, ürün, stok kodu, seri no, sipariş/servis/fatura no…" />
        </div>
        <div style={{ minWidth: 180 }}>
          <CustomSelect value={kaynakFiltre} onChange={e => setKaynakFiltre(e.target.value)}>
            <option value="">Tüm Kaynaklar</option>
            {Object.entries(KAYNAK_META).map(([k, m]) => <option key={k} value={k}>{m.isim}</option>)}
          </CustomSelect>
        </div>
        {sekme === 'sure' && (
          <div style={{ display: 'inline-flex', padding: 2, background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)' }}>
            {[3, 7, 15, 30].map(g => (
              <button key={g} onClick={() => setSureEsik(g)} style={{
                padding: '6px 12px', borderRadius: 'calc(var(--radius-sm) - 2px)', border: 'none', cursor: 'pointer',
                background: sureEsik === g ? 'var(--surface-card)' : 'transparent',
                boxShadow: sureEsik === g ? 'var(--shadow-sm)' : 'none',
                color: sureEsik === g ? 'var(--text-primary)' : 'var(--text-secondary)',
                font: '500 12.5px/18px var(--font-sans)',
              }}>{g}+ gün</button>
            ))}
          </div>
        )}
      </div>

      {/* Müşteri grupları */}
      {gruplar.length === 0 ? (
        <EmptyState icon={<Package size={32} strokeWidth={1.5} />} title="Bu görünümde kayıt yok" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {gruplar.map(g => {
            const acik = acikMusteriler[g.ad]
            return (
              <Card key={g.ad} padding={0} style={{ overflow: 'hidden' }}>
                <div
                  onClick={() => setAcikMusteriler(p => ({ ...p, [g.ad]: !p[g.ad] }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer', flexWrap: 'wrap' }}
                >
                  {acik ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{g.ad}</div>
                    <div className="t-caption" style={{ marginTop: 2 }}>
                      {g.liste.length} malzeme · {g.kesilenSayi} kesildi
                      {g.kismenSayi > 0 && ` · ${g.kismenSayi} kısmen`}
                      {g.enEski && g.bekleyenSayi > 0 && ` · en eski bekleyen: ${fmtTarih(g.enEski)}`}
                    </div>
                  </div>
                  {g.bekleyenSayi > 0 && (
                    <Badge style={{ background: 'rgba(239,68,68,0.14)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)' }}>
                      <Clock size={11} /> {g.bekleyenSayi} fatura bekliyor
                    </Badge>
                  )}
                  {Object.entries(g.tutarlar).filter(([, t]) => t > 0).map(([pb, t]) => (
                    <span key={pb} style={{ font: '700 13px/18px var(--font-sans)', color: '#f59e0b', whiteSpace: 'nowrap' }}>
                      {fmtPara(t, pb)}
                    </span>
                  ))}
                </div>

                {acik && (
                  <div style={{ borderTop: '1px solid var(--border-default)' }}>
                    {g.liste.map(h => {
                      const gun = bekleyenGun(h)
                      const durumRenk = FATURA_DURUM[h.faturaDurumu]?.renk || '#94a3b8'
                      return (
                        <div key={h.id} style={{ borderBottom: '1px solid var(--border-default)', borderLeft: `3px solid ${durumRenk}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', flexWrap: 'wrap' }}>
                            <input
                              type="checkbox"
                              checked={secili.has(h.id)}
                              onChange={() => seciliToggle(h.id)}
                              style={{ cursor: 'pointer' }}
                            />
                            <div style={{ flex: 1, minWidth: 220 }}>
                              <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                                {h.urunAd}
                                {h.model ? <span style={{ color: 'var(--text-tertiary)' }}> · {h.model}</span> : null}
                              </div>
                              <div className="t-caption" style={{ marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <span className="tabular-nums">{Number(h.miktar)} {h.birim || 'Adet'}</span>
                                {h.birimFiyat != null && <span>{fmtPara(h.birimFiyat, h.paraBirimi)} / birim</span>}
                                {h.stokKodu && <span>{h.stokKodu}</span>}
                                {h.seriNo && <span>SN: {h.seriNo}</span>}
                                {h.teknisyen && <span>👤 {h.teknisyen}</span>}
                                <span>{fmtTarih(h.teslimTarihi || h.olusturmaTarih)}</span>
                                {gun >= 3 && (
                                  <span style={{ color: gun >= 15 ? '#dc2626' : '#f59e0b', fontWeight: 600 }}>
                                    {gun} gündür bekliyor
                                  </span>
                                )}
                              </div>
                              {h.aciklama && (
                                <div className="t-caption" style={{ marginTop: 2, fontStyle: 'italic' }}>
                                  “{h.aciklama}”{h.onaylayanAd ? ` — onay: ${h.onaylayanAd}` : ''}
                                </div>
                              )}
                            </div>
                            <KaynakRozet h={h} navigate={navigate} />
                            {h.proformaNo && h.faturaDurumu !== 'faturalandi' && (
                              <Badge style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316', border: '1px solid rgba(249,115,22,0.4)' }}>
                                <Receipt size={11} /> {h.proformaNo}
                              </Badge>
                            )}
                            <DurumRozet h={h} />
                            <button
                              title="İşlem geçmişi"
                              onClick={() => setGecmisAcik(p => ({ ...p, [h.id]: !p[h.id] }))}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4, display: 'inline-flex' }}
                            >
                              <History size={14} strokeWidth={1.5} />
                            </button>
                            <Button size="sm" variant="secondary" onClick={() => setDurumModal({ hareketler: [h] })}>
                              Durum
                            </Button>
                          </div>
                          {gecmisAcik[h.id] && (
                            <div style={{ padding: '6px 14px 12px 40px', background: 'var(--surface-sunken)' }}>
                              {(Array.isArray(h.islemGecmisi) ? h.islemGecmisi : []).map((g2, i) => (
                                <div key={i} className="t-caption" style={{ padding: '2px 0' }}>
                                  <span className="tabular-nums">{fmtTarih(g2.t)}</span> — {g2.detay}
                                  {g2.kim ? ` (${g2.kim})` : ''}
                                </div>
                              ))}
                              {!(h.islemGecmisi?.length) && <div className="t-caption">Geçmiş kaydı yok.</div>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {durumModal && (
        <DurumModal
          hareketler={durumModal.hareketler}
          adminMi={adminMi}
          kullanici={kullanici}
          onKapat={() => setDurumModal(null)}
          onKaydedildi={() => { setDurumModal(null); setSecili(new Set()); yukle() }}
        />
      )}
      {manuelModal && (
        <ManuelModal
          kullanici={kullanici}
          onKapat={() => setManuelModal(false)}
          onKaydedildi={() => { setManuelModal(false); yukle() }}
        />
      )}
    </div>
  )
}

// ── Yönetici özeti (madde 23.15) — kapalı başlar, tıklayınca açılır ─────────
function YoneticiOzeti({ hareketler, sekmeyeGit }) {
  const [acik, setAcik] = useState(false)

  const ozet = useMemo(() => {
    const bekleyenler = hareketler.filter(h => BEKLEYEN_DURUMLAR.includes(h.faturaDurumu))
    const kesilenler = hareketler.filter(h => h.faturaDurumu === 'faturalandi')
    const tutarToplam = (liste, fn) => {
      const t = {}
      for (const h of liste) {
        const pb = h.paraBirimi || 'TL'
        t[pb] = (t[pb] || 0) + fn(h)
      }
      return t
    }
    const kesilenTutar = (h) => Number(h.faturalananMiktar || 0) * Number(h.birimFiyat || 0)

    // Kaynak kırılımı (bekleyenler)
    const kaynakKirilim = {}
    for (const h of bekleyenler) {
      if (!kaynakKirilim[h.kaynak]) kaynakKirilim[h.kaynak] = { sayi: 0, tutarlar: {} }
      kaynakKirilim[h.kaynak].sayi++
      const pb = h.paraBirimi || 'TL'
      kaynakKirilim[h.kaynak].tutarlar[pb] = (kaynakKirilim[h.kaynak].tutarlar[pb] || 0) + bekleyenTutar(h)
    }

    // En çok bekleten müşteriler (pb bazlı toplamların TL+döviz karışımı — sıralama kaba, gösterim pb'li)
    const musteriler = new Map()
    for (const h of bekleyenler) {
      const ad = h.musteriAd || 'Bilinmeyen'
      if (!musteriler.has(ad)) musteriler.set(ad, { tutarlar: {}, sayi: 0 })
      const m = musteriler.get(ad)
      m.sayi++
      const pb = h.paraBirimi || 'TL'
      m.tutarlar[pb] = (m.tutarlar[pb] || 0) + bekleyenTutar(h)
    }
    const enCokBekletenler = [...musteriler.entries()]
      .sort((a, b) => Object.values(b[1].tutarlar).reduce((x, y) => x + y, 0) - Object.values(a[1].tutarlar).reduce((x, y) => x + y, 0))
      .slice(0, 5)

    const enEskiler = [...bekleyenler]
      .sort((a, b) => new Date(a.teslimTarihi || a.olusturmaTarih) - new Date(b.teslimTarihi || b.olusturmaTarih))
      .slice(0, 5)

    return {
      bekleyenTutarlar: tutarToplam(bekleyenler, bekleyenTutar),
      kesilenTutarlar: tutarToplam(kesilenler, kesilenTutar),
      kaynakKirilim,
      g7: bekleyenler.filter(h => bekleyenGun(h) >= 7).length,
      g15: bekleyenler.filter(h => bekleyenGun(h) >= 15).length,
      g30: bekleyenler.filter(h => bekleyenGun(h) >= 30).length,
      proformaBekleyen: hareketler.filter(h =>
        ['proforma_hazirlandi', 'proforma_gonderildi', 'musteri_onayi_bekleniyor'].includes(h.faturaDurumu)).length,
      enCokBekletenler, enEskiler,
    }
  }, [hareketler])

  const tutarYaz = (t) => Object.entries(t).filter(([, v]) => v > 0)
    .map(([pb, v]) => fmtPara(v, pb)).join(' + ') || '₺ 0,00'

  const kutu = { padding: '10px 14px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)' }

  return (
    <Card padding={0} style={{ marginBottom: 16, overflow: 'hidden' }}>
      <div
        onClick={() => setAcik(a => !a)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', cursor: 'pointer' }}
      >
        {acik ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>📊 Yönetici Özeti</span>
        <span className="t-caption" style={{ marginLeft: 'auto' }}>
          Bekleyen: <b style={{ color: '#f59e0b' }}>{tutarYaz(ozet.bekleyenTutarlar)}</b> · Kesilen: <b style={{ color: '#10b981' }}>{tutarYaz(ozet.kesilenTutarlar)}</b>
        </span>
      </div>
      {acik && (
        <div style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <div style={kutu}>
            <div className="t-caption" style={{ fontWeight: 600, marginBottom: 6 }}>Gecikme Eşikleri</div>
            {[[7, ozet.g7], [15, ozet.g15], [30, ozet.g30]].map(([esik, sayi]) => (
              <div key={esik} onClick={() => sayi > 0 && sekmeyeGit(esik)}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', cursor: sayi > 0 ? 'pointer' : 'default', font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                <span>{esik}+ gün bekleyen</span>
                <b style={{ color: sayi > 0 ? (esik >= 15 ? '#dc2626' : '#f59e0b') : 'var(--text-tertiary)' }}>{sayi}</b>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
              <span>Proforma açık (fatura yok)</span>
              <b style={{ color: ozet.proformaBekleyen > 0 ? '#f97316' : 'var(--text-tertiary)' }}>{ozet.proformaBekleyen}</b>
            </div>
          </div>
          <div style={kutu}>
            <div className="t-caption" style={{ fontWeight: 600, marginBottom: 6 }}>Kaynak Kırılımı (bekleyen)</div>
            {Object.entries(ozet.kaynakKirilim).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                <span>{KAYNAK_META[k]?.isim || k} ({v.sayi})</span>
                <b>{tutarYaz(v.tutarlar)}</b>
              </div>
            ))}
            {!Object.keys(ozet.kaynakKirilim).length && <div className="t-caption">Bekleyen yok 🎉</div>}
          </div>
          <div style={kutu}>
            <div className="t-caption" style={{ fontWeight: 600, marginBottom: 6 }}>En Çok Bekleten Müşteriler</div>
            {ozet.enCokBekletenler.map(([ad, v]) => (
              <div key={ad} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad} ({v.sayi})</span>
                <b style={{ whiteSpace: 'nowrap' }}>{tutarYaz(v.tutarlar)}</b>
              </div>
            ))}
            {!ozet.enCokBekletenler.length && <div className="t-caption">Bekleyen yok 🎉</div>}
          </div>
          <div style={kutu}>
            <div className="t-caption" style={{ fontWeight: 600, marginBottom: 6 }}>En Eski Faturasız Hareketler</div>
            {ozet.enEskiler.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.musteriAd} — {h.urunAd}</span>
                <b style={{ whiteSpace: 'nowrap', color: bekleyenGun(h) >= 15 ? '#dc2626' : '#f59e0b' }}>{bekleyenGun(h)} gün</b>
              </div>
            ))}
            {!ozet.enEskiler.length && <div className="t-caption">Bekleyen yok 🎉</div>}
          </div>
        </div>
      )}
    </Card>
  )
}

// ── Durum değiştirme modalı (tekli + toplu) ──────────────────────────────────
function DurumModal({ hareketler, adminMi, kullanici, onKapat, onKaydedildi }) {
  const { toast } = useToast()
  const tekli = hareketler.length === 1
  const h0 = hareketler[0]
  const [durum, setDurum] = useState(tekli ? h0.faturaDurumu : 'fatura_bekliyor')
  const [aciklama, setAciklama] = useState(tekli ? (h0.aciklama || '') : '')
  const [faturalanan, setFaturalanan] = useState(tekli ? Number(h0.faturalananMiktar || 0) : 0)
  const [faturaNo, setFaturaNo] = useState(tekli ? (h0.faturaNo || '') : '')
  const [faturaTarihi, setFaturaTarihi] = useState(tekli ? (h0.faturaTarihi || '') : '')
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const aciklamaZorunlu = ACIKLAMA_ZORUNLU.includes(durum)
  const yoneticiGerekli = YONETICI_ONAYLI.includes(durum)

  const kaydet = async () => {
    if (aciklamaZorunlu && !aciklama.trim()) { toast.error('Bu durum için açıklama zorunlu.'); return }
    if (yoneticiGerekli && !adminMi) { toast.error('Bu durumu yalnız yönetici seçebilir.'); return }
    if (durum === 'kismen_faturalandi') {
      // Kısmi faturalama kayıt başına miktar ister — toplu seçimde anlamsız
      if (!tekli) { toast.error('Kısmi faturalama toplu yapılamaz — her ürünün faturalanan adedi farklıdır. İlgili ürünün satırındaki "Durum" butonunu kullanıp miktarı girin.'); return }
      const f = Number(faturalanan)
      if (!(f > 0 && f < Number(h0.miktar))) { toast.error(`Faturalanan miktar 0 ile ${Number(h0.miktar)} arasında olmalı.`); return }
    }
    setKaydediliyor(true)
    try {
      for (const h of hareketler) {
        const patch = { faturaDurumu: durum }
        if (aciklama.trim()) patch.aciklama = aciklama.trim()
        if (yoneticiGerekli) patch.onaylayanAd = kullanici?.ad || ''
        if (durum === 'kismen_faturalandi' && tekli) patch.faturalananMiktar = Number(faturalanan)
        if (durum === 'faturalandi') {
          patch.faturalananMiktar = Number(h.miktar)
          if (faturaNo.trim()) patch.faturaNo = faturaNo.trim()
          if (faturaTarihi) patch.faturaTarihi = faturaTarihi
        }
        if (durum === 'iade') patch.faturalananMiktar = Number(h.faturalananMiktar || 0)
        await hareketGuncelle(
          h, patch,
          `Durum: ${FATURA_DURUM[h.faturaDurumu]?.isim || h.faturaDurumu} → ${FATURA_DURUM[durum]?.isim}${aciklama.trim() ? ` — ${aciklama.trim()}` : ''}`,
          kullanici,
        )
      }
      toast.success(tekli ? 'Durum güncellendi' : `${hareketler.length} kayıt güncellendi`)
      onKaydedildi()
    } catch (e) {
      toast.error('Kaydedilemedi: ' + (e?.message || 'hata'))
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <Modal
      open
      onClose={onKapat}
      title={tekli ? `Durum Değiştir — ${h0.urunAd}` : `Toplu Durum Değiştir (${hareketler.length} kayıt)`}
      width={520}
      footer={
        <>
          <Button variant="secondary" onClick={onKapat} disabled={kaydediliyor}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={kaydediliyor || (yoneticiGerekli && !adminMi)}>
            {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <Label>Fatura Durumu</Label>
          <CustomSelect value={durum} onChange={e => setDurum(e.target.value)}>
            {Object.entries(FATURA_DURUM).map(([k, m]) => (
              <option key={k} value={k}>{m.isim}{YONETICI_ONAYLI.includes(k) ? ' (yönetici onayı)' : ''}</option>
            ))}
          </CustomSelect>
          {yoneticiGerekli && !adminMi && (
            <p className="t-caption" style={{ color: '#ef4444', marginTop: 4 }}>
              Bu durumu yalnız yönetici rolü seçebilir.
            </p>
          )}
        </div>

        {durum === 'kismen_faturalandi' && tekli && (
          <div>
            <Label>Faturalanan Miktar (toplam {Number(h0.miktar)} {h0.birim || 'Adet'})</Label>
            <Input type="number" min={0} max={Number(h0.miktar)} value={faturalanan} onChange={e => setFaturalanan(e.target.value)} />
            <p className="t-caption" style={{ marginTop: 4 }}>
              Kalan {Math.max(0, Number(h0.miktar) - Number(faturalanan || 0))} birim faturasız listesinde kalır.
            </p>
          </div>
        )}

        {durum === 'faturalandi' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Fatura No</Label>
              <Input value={faturaNo} onChange={e => setFaturaNo(e.target.value)} placeholder="ör. ZNA2026-000123" />
            </div>
            <div>
              <Label>Fatura Tarihi</Label>
              <Input type="date" value={faturaTarihi} onChange={e => setFaturaTarihi(e.target.value)} />
            </div>
          </div>
        )}

        <div>
          <Label>Açıklama{aciklamaZorunlu ? ' (zorunlu)' : ' (opsiyonel)'}</Label>
          <Textarea rows={2} value={aciklama} onChange={e => setAciklama(e.target.value)}
            placeholder={aciklamaZorunlu ? 'Bu durumun gerekçesini yazın…' : 'Not…'} />
        </div>
      </div>
    </Modal>
  )
}

// ── Manuel / demo / numune kaydı ─────────────────────────────────────────────
function ManuelModal({ kullanici, onKapat, onKaydedildi }) {
  const { toast } = useToast()
  const [musteriler, setMusteriler] = useState([])
  const [form, setForm] = useState({
    kaynak: 'manuel', musteriId: '', urunAd: '', model: '', stokKodu: '', seriNo: '',
    miktar: 1, birim: 'Adet', birimFiyat: '', paraBirimi: 'TL',
    teslimTarihi: new Date().toISOString().slice(0, 10), teslimAlan: '', teslimSekli: '', aciklama: '',
  })
  const [kaydediliyor, setKaydediliyor] = useState(false)

  useEffect(() => { musterileriGetir().then(d => setMusteriler(d || [])).catch(() => {}) }, [])

  const kaydet = async () => {
    if (!form.musteriId) { toast.error('Müşteri seçin.'); return }
    if (!form.urunAd.trim()) { toast.error('Ürün adı zorunlu.'); return }
    if (!(Number(form.miktar) > 0)) { toast.error('Miktar 0’dan büyük olmalı.'); return }
    setKaydediliyor(true)
    try {
      const m = musteriler.find(x => String(x.id) === String(form.musteriId))
      // Demo/numune başlangıç durumu gri kapalı grupta başlamasın — takip edilsin
      // diye "fatura_bekliyor" açılır; gerekiyorsa Durum Değiştir ile işaretlenir.
      await manuelHareketEkle({
        kaynak: form.kaynak,
        musteriId: Number(form.musteriId),
        musteriAd: m?.firma || [m?.ad, m?.soyad].filter(Boolean).join(' ') || '',
        urunAd: form.urunAd.trim(),
        model: form.model.trim() || null,
        stokKodu: form.stokKodu.trim() || null,
        seriNo: form.seriNo.trim() || null,
        miktar: Number(form.miktar),
        birim: form.birim || 'Adet',
        birimFiyat: form.birimFiyat === '' ? null : Number(form.birimFiyat),
        paraBirimi: form.paraBirimi,
        teslimTarihi: form.teslimTarihi || null,
        teslimAlan: form.teslimAlan.trim() || null,
        teslimSekli: form.teslimSekli.trim() || null,
        aciklama: form.aciklama.trim() || null,
        faturaDurumu: ['demo', 'numune'].includes(form.kaynak) ? 'demo_numune' : 'fatura_bekliyor',
      }, kullanici)
      toast.success('Malzeme kaydı eklendi')
      onKaydedildi()
    } catch (e) {
      toast.error('Eklenemedi: ' + (e?.message || 'hata'))
    } finally {
      setKaydediliyor(false)
    }
  }

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <Modal
      open
      onClose={onKapat}
      title="Manuel Malzeme Kaydı"
      width={640}
      footer={
        <>
          <Button variant="secondary" onClick={onKapat} disabled={kaydediliyor}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label>Kaynak / Teslim Türü</Label>
            <CustomSelect value={form.kaynak} onChange={f('kaynak')}>
              {['manuel', 'demo', 'numune', 'garanti_degisim', 'ucretli_degisim', 'on_siparis'].map(k => (
                <option key={k} value={k}>{KAYNAK_META[k].isim}</option>
              ))}
            </CustomSelect>
          </div>
          <div>
            <Label>Müşteri</Label>
            <CustomSelect value={form.musteriId} onChange={f('musteriId')}>
              <option value="">Müşteri seç…</option>
              {musteriler.map(m => (
                <option key={m.id} value={m.id}>{m.firma || `${m.ad ?? ''} ${m.soyad ?? ''}`.trim()}</option>
              ))}
            </CustomSelect>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div><Label>Ürün / Malzeme Adı</Label><Input value={form.urunAd} onChange={f('urunAd')} placeholder="ör. Trassir 4MP Dome Kamera" /></div>
          <div><Label>Model</Label><Input value={form.model} onChange={f('model')} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
          <div><Label>Stok Kodu</Label><Input value={form.stokKodu} onChange={f('stokKodu')} /></div>
          <div><Label>Seri No</Label><Input value={form.seriNo} onChange={f('seriNo')} /></div>
          <div><Label>Miktar</Label><Input type="number" min={0.001} value={form.miktar} onChange={f('miktar')} /></div>
          <div><Label>Birim</Label><Input value={form.birim} onChange={f('birim')} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div><Label>Birim Fiyat (ops.)</Label><Input type="number" min={0} value={form.birimFiyat} onChange={f('birimFiyat')} /></div>
          <div>
            <Label>Para Birimi</Label>
            <CustomSelect value={form.paraBirimi} onChange={f('paraBirimi')}>
              {['TL', 'USD', 'EUR'].map(p => <option key={p} value={p}>{p}</option>)}
            </CustomSelect>
          </div>
          <div><Label>Teslim Tarihi</Label><Input type="date" value={form.teslimTarihi} onChange={f('teslimTarihi')} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><Label>Teslim Alan (ops.)</Label><Input value={form.teslimAlan} onChange={f('teslimAlan')} /></div>
          <div><Label>Teslim Şekli (ops.)</Label><Input value={form.teslimSekli} onChange={f('teslimSekli')} placeholder="elden / kargo / sevkiyat" /></div>
        </div>
        <div><Label>Açıklama (ops.)</Label><Textarea rows={2} value={form.aciklama} onChange={f('aciklama')} /></div>
      </div>
    </Modal>
  )
}
