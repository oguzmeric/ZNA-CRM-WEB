import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Phone, FileText, KeyRound, CheckSquare, MapPin, Inbox, Infinity as InfIcon, ArrowRight,
} from 'lucide-react'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { teklifleriGetir } from '../services/teklifService'
import { gorevleriGetir } from '../services/gorevService'
import { lisanslariGetir } from '../services/lisansService'
import {
  Button, Card, CardTitle, Badge, CodeBadge, Modal, EmptyState, SegmentedControl,
  Timeline, TimelineItem,
} from '../components/ui'

const lisansTipiLabel = { sureksiz: 'Süreli', sureksiz_demo: 'Demo', sureksiz_surekli: 'Sürekli' }
const lisansDurumTone = { aktif: 'aktif', pasif: 'pasif', suresi_doldu: 'kayip', beklemede: 'beklemede' }
const lisansDurumIsim = { aktif: 'Aktif', pasif: 'Pasif', suresi_doldu: 'Süresi Doldu', beklemede: 'Beklemede' }

const OLAY_KONFIG = {
  gorusme: { isim: 'Görüşme', C: Phone,       tone: 'lead',      renk: 'var(--info)' },
  teklif:  { isim: 'Teklif',  C: FileText,    tone: 'brand',     renk: 'var(--brand-primary)' },
  lisans:  { isim: 'Lisans',  C: KeyRound,    tone: 'brand',     renk: 'var(--brand-primary)' },
  gorev:   { isim: 'Görev',   C: CheckSquare, tone: 'beklemede', renk: 'var(--warning)' },
}

const onayTone = {
  takipte:    'lead',
  kabul:      'aktif',
  vazgecildi: 'kayip',
  revizyon:   'beklemede',
}
const onayIsim = {
  takipte:    'Takipte',
  kabul:      'Kabul',
  vazgecildi: 'Vazgeçildi',
  revizyon:   'Revizyon',
}

const fmtTL = (n) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })

function LisansModal({ lisans, onKapat }) {
  if (!lisans) return null
  const bugun = new Date()
  const bitis = lisans.bitisTarih ? new Date(lisans.bitisTarih) : null
  const kalanGun = bitis ? Math.ceil((bitis - bugun) / (1000 * 60 * 60 * 24)) : null
  const durumT = lisansDurumTone[lisans.durum] ?? 'neutral'

  const Row = ({ label, children }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      gap: 12, padding: '10px 0',
      borderBottom: '1px solid var(--border-default)',
    }}>
      <span className="t-label">{label}</span>
      <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', textAlign: 'right' }}>
        {children}
      </span>
    </div>
  )

  return (
    <Modal
      open={!!lisans}
      onClose={onKapat}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <KeyRound size={16} strokeWidth={1.5} style={{ color: 'var(--brand-primary)' }} />
          {lisans.lisansTuru}
        </span>
      }
      footer={<Button variant="secondary" onClick={onKapat}>Kapat</Button>}
      width={480}
    >
      <div style={{ marginBottom: 8 }}>
        <CodeBadge>{lisans.lisansKodu}</CodeBadge>
      </div>
      {lisans.lisansId && <Row label="LİSANS ID"><CodeBadge>{lisans.lisansId}</CodeBadge></Row>}
      <Row label="FİRMA">{lisans.firmaAdi}</Row>
      {lisans.lokasyon && (
        <Row label="LOKASYON / ŞUBE">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={12} strokeWidth={1.5} /> {lisans.lokasyon}
          </span>
        </Row>
      )}
      {lisans.sunucuAdi && <Row label="SUNUCU / IP"><span style={{ fontFamily: 'var(--font-mono)' }}>{lisans.sunucuAdi}</span></Row>}
      <Row label="TİP"><Badge tone="brand">{lisansTipiLabel[lisans.lisansTipi] || lisans.lisansTipi}</Badge></Row>
      <Row label="DURUM"><Badge tone={durumT}>{lisansDurumIsim[lisans.durum]}</Badge></Row>
      {lisans.kanalSayisi && <Row label="KANAL SAYISI"><span style={{ fontVariantNumeric: 'tabular-nums' }}>{lisans.kanalSayisi} kanal</span></Row>}
      <Row label="BAŞLANGIÇ"><span style={{ fontVariantNumeric: 'tabular-nums' }}>{lisans.baslangicTarih || '—'}</span></Row>
      <Row label="BİTİŞ">
        {lisans.lisansTipi === 'sureksiz_surekli' ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--success)' }}>
            <InfIcon size={14} strokeWidth={1.5} /> Sürekli
          </span>
        ) : (
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{lisans.bitisTarih || '—'}</span>
            {kalanGun !== null && kalanGun >= 0 && kalanGun <= 30 && (
              <span style={{ font: '500 11px/16px var(--font-sans)', color: 'var(--warning)' }}>{kalanGun} gün kaldı</span>
            )}
            {kalanGun !== null && kalanGun < 0 && (
              <span style={{ font: '500 11px/16px var(--font-sans)', color: 'var(--danger)' }}>Süresi doldu</span>
            )}
          </span>
        )}
      </Row>
      {lisans.notlar && (
        <div style={{ paddingTop: 12 }}>
          <p className="t-label" style={{ marginBottom: 4 }}>NOTLAR</p>
          <p style={{
            font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', margin: 0,
            padding: '10px 12px',
            background: 'var(--surface-sunken)',
            borderRadius: 'var(--radius-sm)',
          }}>{lisans.notlar}</p>
        </div>
      )}
    </Modal>
  )
}

function FirmaGecmisi() {
  const { firmaAdi } = useParams()
  const navigate = useNavigate()
  const firma = decodeURIComponent(firmaAdi)

  const [aktifSekme, setAktifSekme] = useState('hepsi')
  const [yukleniyor, setYukleniyor] = useState(true)
  const [secilenLisans, setSecilenLisans] = useState(null)

  const [gorusmeler, setGorusmeler] = useState([])
  const [teklifler, setTeklifler] = useState([])
  const [lisanslar, setLisanslar] = useState([])
  const [gorevler, setGorevler] = useState([])

  useEffect(() => {
    (async () => {
      setYukleniyor(true)
      try {
        const [g, t, l, gr] = await Promise.all([
          gorusmeleriGetir(), teklifleriGetir(), lisanslariGetir(), gorevleriGetir(),
        ])
        setGorusmeler((g || []).filter(i => i.firmaAdi === firma))
        setTeklifler((t || []).filter(i => i.firmaAdi === firma))
        setLisanslar((l || []).filter(i => i.firmaAdi === firma))
        setGorevler((gr || []).filter(i => i.firmaAdi === firma))
      } catch (err) {
        console.error('[FirmaGecmisi yükle]', err)
      } finally {
        setYukleniyor(false)
      }
    })()
  }, [firma])

  const tumOlaylar = [
    ...gorusmeler.map(g => ({
      id: `gorusme-${g.id}`, tip: 'gorusme', tarih: g.tarih,
      baslik: g.konu, detay: `Görüşen: ${g.gorusen} · Durum: ${g.durum}`,
      veri: g,
    })),
    ...teklifler.map(t => ({
      id: `teklif-${t.id}`, tip: 'teklif', tarih: t.tarih,
      baslik: t.konu,
      detay: `${t.teklifNo} · ₺${fmtTL(t.genelToplam)}`,
      veri: t,
    })),
    ...lisanslar.map(l => ({
      id: `lisans-${l.id}`, tip: 'lisans', tarih: l.baslangicTarih,
      baslik: `${l.lisansTuru} Lisansı`,
      detay: `${l.lisansKodu} · ${lisansDurumIsim[l.durum] || l.durum}`,
      veri: l,
    })),
    ...gorevler.map(g => ({
      id: `gorev-${g.id}`, tip: 'gorev', tarih: g.olusturmaTarih?.split('T')[0] || '',
      baslik: g.baslik,
      detay: `Atanan: ${g.atananAd || ''} · ${g.durum}`,
      veri: g,
    })),
  ].sort((a, b) => new Date(b.tarih) - new Date(a.tarih))

  const filtreliOlaylar = aktifSekme === 'hepsi' ? tumOlaylar : tumOlaylar.filter(o => o.tip === aktifSekme)

  if (yukleniyor) {
    return <div style={{ padding: 24 }}><EmptyState title="Yükleniyor…" /></div>
  }

  const toplamTeklif = teklifler.reduce((s, t) => s + (t.genelToplam || 0), 0)
  const kabulTeklif  = teklifler.filter(t => t.onayDurumu === 'kabul').reduce((s, t) => s + (t.genelToplam || 0), 0)
  const kabulOrani   = teklifler.length > 0
    ? Math.round((teklifler.filter(t => t.onayDurumu === 'kabul').length / teklifler.length) * 100)
    : 0

  return (
    <>
      <div style={{ padding: 24, maxWidth: 1040, margin: '0 auto' }}>

        {/* Başlık */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => navigate(-1)}>
            Geri
          </Button>
          <div>
            <h1 className="t-h1">{firma}</h1>
            <p className="t-caption" style={{ marginTop: 2 }}>Firma geçmişi ve kayıtları</p>
          </div>
        </div>

        {/* Özet KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { key: 'gorusme', isim: 'Görüşme', sayi: gorusmeler.length, C: Phone },
            { key: 'teklif',  isim: 'Teklif',  sayi: teklifler.length,  C: FileText },
            { key: 'lisans',  isim: 'Lisans',  sayi: lisanslar.length,  C: KeyRound },
            { key: 'gorev',   isim: 'Görev',   sayi: gorevler.length,   C: CheckSquare },
          ].map(k => (
            <button
              key={k.key}
              onClick={() => setAktifSekme(k.key)}
              style={{
                textAlign: 'left',
                background: 'var(--surface-card)',
                border: `1px solid ${aktifSekme === k.key ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                borderRadius: 'var(--radius-md)',
                padding: 16,
                cursor: 'pointer',
                transition: 'all 120ms',
                boxShadow: aktifSekme === k.key ? 'var(--shadow-sm)' : 'none',
              }}
              onMouseEnter={e => { if (aktifSekme !== k.key) e.currentTarget.style.borderColor = 'var(--border-strong)' }}
              onMouseLeave={e => { if (aktifSekme !== k.key) e.currentTarget.style.borderColor = 'var(--border-default)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, color: 'var(--text-tertiary)' }}>
                <span className="t-label">{k.isim}</span>
                <k.C size={14} strokeWidth={1.5} />
              </div>
              <div style={{ font: '600 24px/1 var(--font-sans)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {k.sayi}
              </div>
            </button>
          ))}
        </div>

        {/* Teklif Özeti */}
        {teklifler.length > 0 && (
          <Card style={{ marginBottom: 20 }}>
            <CardTitle>Teklif Özeti</CardTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 12 }}>
              {[
                { l: 'TOPLAM TEKLİF TUTARI', v: `₺${fmtTL(toplamTeklif)}`, c: 'var(--text-primary)' },
                { l: 'KABUL EDİLEN',         v: `₺${fmtTL(kabulTeklif)}`, c: 'var(--success)' },
                { l: 'KABUL ORANI',          v: `%${kabulOrani}`,          c: kabulOrani >= 50 ? 'var(--success)' : 'var(--warning)' },
              ].map(k => (
                <div key={k.l} style={{
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px 14px',
                }}>
                  <div className="t-label" style={{ marginBottom: 4 }}>{k.l}</div>
                  <div style={{ font: '600 18px/22px var(--font-sans)', color: k.c, fontVariantNumeric: 'tabular-nums' }}>
                    {k.v}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Sekmeler */}
        <div style={{ marginBottom: 20 }}>
          <SegmentedControl
            options={[
              { value: 'hepsi',   label: 'Tümü',       count: tumOlaylar.length },
              { value: 'gorusme', label: 'Görüşmeler', count: gorusmeler.length },
              { value: 'teklif',  label: 'Teklifler',  count: teklifler.length },
              { value: 'lisans',  label: 'Lisanslar',  count: lisanslar.length },
              { value: 'gorev',   label: 'Görevler',   count: gorevler.length },
            ]}
            value={aktifSekme}
            onChange={setAktifSekme}
          />
        </div>

        {/* Timeline */}
        {filtreliOlaylar.length === 0 ? (
          <EmptyState icon={<Inbox size={32} strokeWidth={1.5} />} title="Bu kategoride kayıt bulunamadı" />
        ) : (
          <Timeline>
            {filtreliOlaylar.map(olay => {
              const konf = OLAY_KONFIG[olay.tip] ?? OLAY_KONFIG.gorusme
              return (
                <TimelineItem
                  key={olay.id}
                  icon={<konf.C size={14} strokeWidth={1.5} />}
                  active={olay.tip === 'gorusme' || olay.tip === 'lisans'}
                  title={
                    <button
                      onClick={() => {
                        if (olay.tip === 'gorusme') navigate(`/gorusmeler/${olay.veri.id}`)
                        if (olay.tip === 'teklif')  navigate(`/teklifler/${olay.veri.id}`)
                        if (olay.tip === 'gorev')   navigate(`/gorevler/${olay.veri.id}`)
                        if (olay.tip === 'lisans')  setSecilenLisans(olay.veri)
                      }}
                      style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        font: '500 14px/20px var(--font-sans)', color: 'var(--text-primary)',
                        textAlign: 'left', display: 'inline-flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      <Badge tone={konf.tone}>{konf.isim}</Badge>
                      {olay.baslik}
                      {olay.tip === 'teklif' && olay.veri.onayDurumu && (
                        <Badge tone={onayTone[olay.veri.onayDurumu]}>{onayIsim[olay.veri.onayDurumu]}</Badge>
                      )}
                      {olay.tip === 'gorusme' && (
                        <Badge tone={olay.veri.durum === 'kapali' ? 'kapali' : olay.veri.durum === 'beklemede' ? 'beklemede' : 'acik'}>
                          {olay.veri.durum === 'acik' ? 'Açık' : olay.veri.durum === 'beklemede' ? 'Beklemede' : 'Kapalı'}
                        </Badge>
                      )}
                    </button>
                  }
                  meta={<span style={{ fontVariantNumeric: 'tabular-nums' }}>{olay.tarih}</span>}
                >
                  {olay.detay}
                  {olay.tip === 'teklif' && olay.veri.genelToplam > 0 && (
                    <div style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--brand-primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                      ₺{fmtTL(olay.veri.genelToplam)}
                    </div>
                  )}
                  {olay.tip === 'lisans' && (
                    <div style={{ display: 'inline-flex', gap: 12, marginTop: 4, font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                      {olay.veri.lisansId && <CodeBadge>{olay.veri.lisansId}</CodeBadge>}
                      {olay.veri.kanalSayisi && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{olay.veri.kanalSayisi} kanal</span>}
                    </div>
                  )}
                </TimelineItem>
              )
            })}
          </Timeline>
        )}
      </div>

      <LisansModal lisans={secilenLisans} onKapat={() => setSecilenLisans(null)} />
    </>
  )
}

export default FirmaGecmisi
