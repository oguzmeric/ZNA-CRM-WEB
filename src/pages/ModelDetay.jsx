import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import {
  ArrowLeft, Package, Tag, Hash, AlertTriangle, Building2, Calendar,
  ArrowDown, ArrowUp, ArrowRightLeft, Box, Plus, User, PackageOpen,
  Pencil, Trash2, History, RotateCcw, Eye,
} from 'lucide-react'
import {
  modelKalemleriniGetir, modelKalemleriniGetirTumu, DURUMLAR, durumBul,
  stokUrunleriniGetir, stokHareketleriniGetir,
  snTeknisyeneVer, snDepoyaCek, snGuncelle, snSil, snGeriGetir, snGecmisi,
  SN_SILME_SEBEPLERI, aileleriGetir,
} from '../services/stokService'
import {
  snArizaliIsaretle, snArizasiCoz, kalemArizaGecmisi,
  rmaOlustur, rmaGeriDondu, kalemRMAGecmisi,
  snRezerveEt, snRezerveBirak,
  ARIZA_SEBEPLERI, RMA_SONUCLARI,
  depolariGetir, snDepoAta, DEPO_TIPLERI,
} from '../services/depoService'
import { AlertOctagon, Wrench, ShoppingCart, XCircle } from 'lucide-react'
import SnEkleModal from '../components/SnEkleModal'
import BarkodEtiketYazdir from '../components/BarkodEtiketYazdir'
import { Printer } from 'lucide-react'
import { musterileriGetir } from '../services/musteriService'
import { supabase } from '../lib/supabase'
import {
  Button, SearchInput, Card, Badge, CodeBadge, KPICard,
  EmptyState, Alert, Table, THead, TBody, TR, TH, TD,
} from '../components/ui'
import CustomSelect from '../components/CustomSelect'

import { SkeletonDetay } from '../components/Skeleton'
const durumTone = {
  depoda: 'info',
  teknisyende: 'lead',
  sahada: 'aktif',
  arizada: 'beklemede',
  arizali_depoda: 'kayip',
  tamirde: 'lead',
  hurda: 'pasif',
}

const FILTRELER = [
  { id: 'tumu', isim: 'Tümü' },
  ...DURUMLAR.map(d => ({ id: d.id, isim: d.isim })),
]

const hareketBilgi = {
  giris:           { isim: 'Ana depo girişi',    tone: 'aktif',     yon: 'in',  icon: ArrowDown },
  transfer_cikis:  { isim: 'Personele transfer', tone: 'brand',     yon: 'out', icon: ArrowRightLeft },
  transfer_giris:  { isim: 'Personelden iade',   tone: 'beklemede', yon: 'in',  icon: ArrowRightLeft },
  cikis:           { isim: 'Müşteri çıkışı',     tone: 'kayip',     yon: 'out', icon: ArrowUp },
}

const tarihFmt = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// mini kare ikon buton stili — durum action'ları için
const miniBtn = (color, aktif = false) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, borderRadius: 6,
  background: aktif ? color : 'var(--surface-sunken)',
  border: `1px solid ${aktif ? color : 'var(--border-default)'}`,
  color: aktif ? '#fff' : color, cursor: 'pointer',
})

const tarihKisa = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

function ModelDetay() {
  const { stokKodu } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [kalemler, setKalemler] = useState([])
  const [urun, setUrun] = useState(null)
  const [hareketler, setHareketler] = useState([])
  const [musteriMap, setMusteriMap] = useState(new Map())
  const [teknisyenMap, setTeknisyenMap] = useState(new Map())
  const [personelListe, setPersonelListe] = useState([])
  const [filtre, setFiltre] = useState('tumu')
  const [arama, setArama] = useState('')
  const [yukleniyor, setYukleniyor] = useState(true)
  const [snEkleAcik, setSnEkleAcik] = useState(false)
  const [yenile, setYenile] = useState(0)
  const [seciliKalem, setSeciliKalem] = useState(null)  // teknisyene ver modalı için
  const [duzenlenenKalem, setDuzenlenenKalem] = useState(null)  // SN düzenleme modalı için
  const [silinecekKalem, setSilinecekKalem] = useState(null)  // SN sil sebep modalı için
  const [silinenleriGoster, setSilinenleriGoster] = useState(false)
  const [gecmisModal, setGecmisModal] = useState(null)  // { seriNo, kayitlar }
  const [arizaModal, setArizaModal] = useState(null)     // kalem — arızalı işaretle modalı
  const [rmaModal, setRmaModal] = useState(null)          // kalem — RMA gönder modalı
  const [rmaDonusModal, setRmaDonusModal] = useState(null) // kalem — RMA dönüş işle modalı
  const [rezerveModal, setRezerveModal] = useState(null)  // kalem — rezerve teklif seç modalı
  const [etiketAcik, setEtiketAcik] = useState(false)     // toplu barkod etiket yazdırma
  // Faz 4 (mig 153): depolar + aileler
  const [depolar, setDepolar] = useState([])
  const [depoModal, setDepoModal] = useState(null)        // kalem — depo atama modalı
  const [tumUrunler, setTumUrunler] = useState([])        // kardeş modeller için
  const [aileler, setAileler] = useState([])

  useEffect(() => {
    Promise.all([
      modelKalemleriniGetirTumu(stokKodu, silinenleriGoster),
      stokUrunleriniGetir(),
      stokHareketleriniGetir(),
      musterileriGetir(),
      supabase.from('kullanicilar').select('id, ad, unvan, rol').order('ad'),
      depolariGetir(),
      aileleriGetir(),
    ])
      .then(([k, u, h, m, kullR, depoData, aileData]) => {
        setKalemler(k || [])
        setUrun((u || []).find(x => x.stokKodu === stokKodu) || null)
        setTumUrunler(u || [])
        setDepolar(depoData || [])
        setAileler(aileData || [])
        setHareketler((h || []).filter(x => x.stokKodu === stokKodu))
        const map = new Map()
        ;(m || []).forEach(x => map.set(x.id, x))
        setMusteriMap(map)
        const kullanicilar = kullR?.data || []
        const tmap = new Map()
        kullanicilar.forEach(kul => tmap.set(kul.id, kul))
        setTeknisyenMap(tmap)
        // Personel: yönetim (rol='admin') hariç herkes teknisyen olabilir.
        // Eski hali isim regex'iydi (oğuz|ali|ferdi) — yeni yönetici atanınca bozuluyordu.
        setPersonelListe(kullanicilar.filter(k => k.rol !== 'admin'))
      })
      .catch(err => console.error('[ModelDetay yükle]', err))
      .finally(() => setYukleniyor(false))
  }, [stokKodu, yenile, silinenleriGoster])

  const sayilar = useMemo(() => {
    const s = { toplam: kalemler.length, depoda: 0, teknisyende: 0, sahada: 0, arizada: 0, arizali_depoda: 0, tamirde: 0, hurda: 0 }
    kalemler.forEach(k => { if (s[k.durum] !== undefined) s[k.durum] += 1 })
    return s
  }, [kalemler])

  const bakiye = useMemo(() => hareketler.reduce((top, h) => {
    if (h.hareketTipi === 'giris' || h.hareketTipi === 'transfer_giris') return top + Number(h.miktar || 0)
    if (h.hareketTipi === 'cikis' || h.hareketTipi === 'transfer_cikis') return top - Number(h.miktar || 0)
    return top
  }, 0), [hareketler])

  // seri_takipli ya urun field'indan (henuz seri eklenmemis de olsa true) ya da var olan kalemlerden anlasilir
  const seriTakipli = !!urun?.seriTakipli || kalemler.length > 0
  const ornek = kalemler[0]
  const modelAdi = seriTakipli
    ? `${ornek?.marka ? ornek.marka + ' ' : ''}${ornek?.model || urun?.stokAdi || stokKodu}`
    : (urun?.stokAdi || stokKodu)

  const filtrelenmis = useMemo(() => {
    let liste = filtre === 'tumu' ? kalemler : kalemler.filter(k => k.durum === filtre)
    if (arama.trim()) {
      const q = arama.trim().toLowerCase()
      liste = liste.filter(k =>
        [k.seriNo, k.barkod, k.marka, k.model].filter(Boolean).some(s => String(s).toLowerCase().includes(q))
      )
    }
    return liste
  }, [kalemler, filtre, arama])

  const musteriDagilimi = useMemo(() => {
    const map = new Map()
    hareketler
      .filter(h => h.hareketTipi === 'cikis' && h.aciklama)
      .forEach(h => {
        const m = h.aciklama.match(/Müşteri:\s*([^·]+)/)
        if (m) {
          const ad = m[1].trim()
          map.set(ad, (map.get(ad) || 0) + Number(h.miktar || 0))
        }
      })
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [hareketler])

  if (yukleniyor) {
    return <SkeletonDetay />
  }

  const kritikMi = urun?.minStok && bakiye <= Number(urun.minStok)

  const toplamGiris = hareketler
    .filter(h => ['giris', 'transfer_giris'].includes(h.hareketTipi))
    .reduce((s, h) => s + Number(h.miktar || 0), 0)
  const toplamCikis = hareketler
    .filter(h => ['cikis', 'transfer_cikis'].includes(h.hareketTipi))
    .reduce((s, h) => s + Number(h.miktar || 0), 0)

  return (
    <div style={{ padding: 24, maxWidth: 1040, margin: '0 auto' }}>
      <button
        onClick={() => navigate('/stok')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--text-tertiary)',
          font: '500 13px/18px var(--font-sans)',
          marginBottom: 16,
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-primary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
      >
        <ArrowLeft size={14} strokeWidth={1.5} /> Stok listesine dön
      </button>

      {seriTakipli && urun && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
          <Button
            variant="secondary"
            onClick={() => setEtiketAcik(true)}
            iconLeft={<Printer size={14} strokeWidth={1.5} />}
            disabled={!kalemler.some(k => !k.silindi)}
          >
            Etiket Yazdır
          </Button>
          <Button
            variant="primary"
            onClick={() => setSnEkleAcik(true)}
            iconLeft={<Plus size={14} strokeWidth={1.5} />}
          >
            S/N Ekle
          </Button>
        </div>
      )}

      {/* Özet Kartı */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          {urun?.gorselUrl ? (
            <img
              src={urun.gorselUrl}
              alt=""
              style={{
                width: 64, height: 64, borderRadius: 'var(--radius-md)',
                objectFit: 'contain', background: 'var(--surface-sunken)',
                border: '1px solid var(--border-default)', flexShrink: 0,
              }}
            />
          ) : (
            <div style={{
              width: 64, height: 64, borderRadius: 'var(--radius-md)',
              background: 'var(--brand-primary-soft)', color: 'var(--brand-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {seriTakipli ? <Tag size={22} strokeWidth={1.5} /> : <Package size={22} strokeWidth={1.5} />}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="t-h2" style={{ marginBottom: 6 }}>{modelAdi}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <CodeBadge>{stokKodu}</CodeBadge>
              {seriTakipli ? (
                <Badge tone="brand">S/N takipli · <span className="tabular-nums">{sayilar.toplam}</span> adet</Badge>
              ) : (
                <Badge tone="info">Toplu ürün</Badge>
              )}
              {urun?.marka && <span className="t-caption">Marka: <span style={{ color: 'var(--text-secondary)' }}>{urun.marka}</span></span>}
              {urun?.grupKodu && <Badge tone="neutral">{urun.grupKodu}</Badge>}
            </div>
            {urun?.aciklama && (
              <p className="t-caption" style={{ marginTop: 8 }}>{urun.aciklama}</p>
            )}
          </div>
        </div>

        {/* S/N Takipli → Durum sayıları */}
        {seriTakipli && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 8, marginTop: 20,
          }}>
            {DURUMLAR.map(d => {
              const sayi = sayilar[d.id] || 0
              const aktif = filtre === d.id
              return (
                <button
                  key={d.id}
                  onClick={() => setFiltre(d.id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${aktif ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                    background: aktif ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                    cursor: 'pointer', textAlign: 'center',
                    transition: 'border-color 120ms, background 120ms',
                  }}
                >
                  <div className="tabular-nums" style={{
                    font: '600 18px/24px var(--font-sans)',
                    color: sayi > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  }}>
                    {sayi}
                  </div>
                  <div className="t-caption" style={{ marginTop: 2 }}>{d.isim}</div>
                </button>
              )
            })}
          </div>
        )}

        {/* Toplu ürün → KPI */}
        {!seriTakipli && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12, marginTop: 20,
          }}>
            <KPICard
              label="Güncel bakiye"
              value={`${bakiye.toFixed(0)} ${urun?.birim || ''}`}
              icon={<Hash size={16} strokeWidth={1.5} />}
            />
            <KPICard
              label="Min. stok"
              value={urun?.minStok ? `${urun.minStok} ${urun?.birim || ''}` : '—'}
              icon={<AlertTriangle size={16} strokeWidth={1.5} />}
            />
            <KPICard
              label="Toplam giriş"
              value={`${toplamGiris.toFixed(0)} ${urun?.birim || ''}`}
              icon={<ArrowDown size={16} strokeWidth={1.5} />}
            />
            <KPICard
              label="Toplam çıkış"
              value={`${toplamCikis.toFixed(0)} ${urun?.birim || ''}`}
              icon={<ArrowUp size={16} strokeWidth={1.5} />}
            />
          </div>
        )}

        {kritikMi && (
          <Alert variant="danger" style={{ marginTop: 16 }}>
            Stok kritik seviyenin altına düştü. Min. <span className="tabular-nums">{urun.minStok}</span> {urun.birim}.
          </Alert>
        )}

        {/* Ürün ailesi — aynı serinin diğer modelleri (Faz 4, mig 153) */}
        {urun?.aileId && (() => {
          const aile = aileler.find(a => a.id === urun.aileId)
          const kardesler = tumUrunler.filter(u => u.aileId === urun.aileId && u.stokKodu !== stokKodu)
          if (kardesler.length === 0) return null
          return (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-default)' }}>
              <div style={{ font: '600 10px/16px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>
                {aile?.ad || 'Ürün ailesi'} — aynı seriden modeller
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {kardesler.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    title={u.stokAdi}
                    onClick={() => u.seriTakipli
                      ? navigate(`/stok/model/${encodeURIComponent(u.stokKodu)}`)
                      : navigate('/stok')}
                    style={{
                      padding: '4px 10px', borderRadius: 'var(--radius-pill)',
                      font: '500 12px/16px var(--font-sans)',
                      background: 'var(--brand-primary-soft)', color: 'var(--brand-primary)',
                      border: '1px solid var(--brand-primary)', cursor: 'pointer',
                      maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {u.stokKodu} — {u.stokAdi}
                  </button>
                ))}
              </div>
            </div>
          )
        })()}
      </Card>

      {/* S/N takipli kalem listesi */}
      {seriTakipli && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <SearchInput
                value={arama}
                onChange={e => setArama(e.target.value)}
                placeholder="S/N, barkod, marka, model ara…"
              />
            </div>
            <div style={{ minWidth: 180 }}>
              <CustomSelect value={filtre} onChange={e => setFiltre(e.target.value)}>
                {FILTRELER.map(f => <option key={f.id} value={f.id}>{f.isim}</option>)}
              </CustomSelect>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={silinenleriGoster} onChange={e => setSilinenleriGoster(e.target.checked)} style={{ accentColor: 'var(--danger)' }} />
              🗑️ Silinenleri de göster
            </label>
          </div>

          <Card padding={0}>
            {filtrelenmis.length === 0 ? (
              <div style={{ padding: 32 }}>
                <EmptyState
                  icon={<Box size={22} strokeWidth={1.5} />}
                  title={arama ? 'Arama sonucu bulunamadı' : 'Bu durumda kalem yok'}
                />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>S/N</TH>
                    <TH>Durum</TH>
                    <TH>Teknisyen / Müşteri</TH>
                    <TH>Marka / Model</TH>
                    <TH>Barkod</TH>
                    <TH>Tarih</TH>
                    <TH style={{ textAlign: 'right' }}>Eylem</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtrelenmis.map(k => {
                    const d = durumBul(k.durum)
                    const musteri = k.musteriId ? musteriMap.get(k.musteriId) : null
                    const teknisyen = k.teknisyenId ? teknisyenMap.get(k.teknisyenId) : null
                    const rowStil = k.silindi ? { opacity: 0.5, textDecoration: 'line-through' } : {}
                    return (
                      <TR key={k.id} style={rowStil}>
                        <TD><CodeBadge>{k.seriNo || '—'}</CodeBadge></TD>
                        <TD>
                          {d ? <Badge tone={durumTone[d.id] || 'neutral'}>{d.isim}</Badge> : '—'}
                          {k.rezerveTeklifId && (
                            <Badge tone="brand" style={{ marginLeft: 4 }} title="Bir teklife rezerve edilmiş">🔖 Rezerve</Badge>
                          )}
                        </TD>
                        <TD>
                          {k.durum === 'depoda' ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)', font: '500 12px/16px var(--font-sans)' }}>
                              <Box size={12} strokeWidth={1.5} />
                              {depolar.find(d => d.id === k.depoId)?.ad || 'Merkez Depo'}
                            </span>
                          ) : teknisyen ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#a855f7', fontWeight: 500 }}>
                              <User size={12} strokeWidth={1.5} /> {teknisyen.ad}
                            </span>
                          ) : musteri ? (
                            <button
                              onClick={() => navigate(`/musteriler/${musteri.id}`)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                color: 'var(--brand-primary)',
                                font: '500 13px/18px var(--font-sans)',
                              }}
                            >
                              <Building2 size={12} strokeWidth={1.5} /> {musteri.firma}
                            </button>
                          ) : '—'}
                        </TD>
                        <TD>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {k.marka && <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{k.marka}</span>}
                            {k.model && <span className="t-caption">{k.model}</span>}
                            {!k.marka && !k.model && '—'}
                          </div>
                        </TD>
                        <TD>
                          {k.barkod ? <span className="t-mono">{k.barkod}</span> : '—'}
                        </TD>
                        <TD>
                          {k.durum === 'sahada' && k.takilmaTarihi ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--success)' }}>
                              <Calendar size={12} strokeWidth={1.5} /> {tarihFmt(k.takilmaTarihi)}
                            </span>
                          ) : '—'}
                        </TD>
                        <TD style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                            {!k.silindi && k.durum === 'depoda' && (
                              <>
                                <Button size="sm" variant="secondary" iconLeft={<User size={12} strokeWidth={1.5} />}
                                  onClick={() => setSeciliKalem(k)}>
                                  Teknisyene Ver
                                </Button>
                                <button
                                  onClick={() => setArizaModal({ kalem: k, yeniDurum: 'arizali_depoda' })}
                                  title="Arızalı olarak işaretle"
                                  style={miniBtn('#f59e0b')}
                                >
                                  <AlertOctagon size={12} strokeWidth={1.5} />
                                </button>
                                {!k.rezerveTeklifId ? (
                                  <button
                                    onClick={() => setRezerveModal(k)}
                                    title="Rezerve et (bir teklif için)"
                                    style={miniBtn('#8b5cf6')}
                                  >
                                    <ShoppingCart size={12} strokeWidth={1.5} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={async () => {
                                      const onay = await confirm({ baslik: 'Rezervi Kaldır', mesaj: `${k.seriNo} rezervi kaldırılsın mı?`, onayMetin: 'Kaldır', iptalMetin: 'Vazgeç' })
                                      if (!onay) return
                                      await snRezerveBirak(k.id); setYenile(y => y + 1)
                                    }}
                                    title="Rezervi kaldır"
                                    style={miniBtn('#8b5cf6', true)}
                                  >
                                    <XCircle size={12} strokeWidth={1.5} />
                                  </button>
                                )}
                                <button
                                  onClick={() => setRmaModal(k)}
                                  title="Servise / tamire gönder"
                                  style={miniBtn('#ec4899')}
                                >
                                  <Wrench size={12} strokeWidth={1.5} />
                                </button>
                                {depolar.length > 1 && (
                                  <button
                                    onClick={() => setDepoModal(k)}
                                    title="Depoya ata (Araç/Proje/Geçici…)"
                                    style={miniBtn('#0ea5e9')}
                                  >
                                    <Box size={12} strokeWidth={1.5} />
                                  </button>
                                )}
                              </>
                            )}
                            {!k.silindi && k.durum === 'teknisyende' && (
                              <>
                                <Button size="sm" variant="secondary" iconLeft={<PackageOpen size={12} strokeWidth={1.5} />}
                                  onClick={async () => {
                                    const onay = await confirm({ baslik: 'Depoya Çek', mesaj: `${k.seriNo} depoya çekilsin mi?`, onayMetin: 'Depoya Çek', iptalMetin: 'Vazgeç' })
                                    if (!onay) return
                                    await snDepoyaCek(k.id)
                                    setYenile(y => y + 1)
                                  }}>
                                  Depoya Çek
                                </Button>
                                <button
                                  onClick={() => setArizaModal({ kalem: k, yeniDurum: 'arizada' })}
                                  title="Teknisyende arızalandı"
                                  style={miniBtn('#f59e0b')}
                                >
                                  <AlertOctagon size={12} strokeWidth={1.5} />
                                </button>
                              </>
                            )}
                            {!k.silindi && k.durum === 'arizali_depoda' && (
                              <>
                                <Button size="sm" variant="secondary" iconLeft={<Wrench size={12} strokeWidth={1.5} />}
                                  onClick={() => setRmaModal(k)}>
                                  Tamire Gönder
                                </Button>
                                <button
                                  onClick={async () => {
                                    const onay = await confirm({ baslik: 'Onarıldı', mesaj: `${k.seriNo} onarıldı olarak işaretlensin ve depoya alınsın mı?`, onayMetin: 'Onarıldı, Depoya Al', iptalMetin: 'Vazgeç' })
                                    if (!onay) return
                                    // Açık arıza kaydını çöz
                                    const list = await kalemArizaGecmisi(k.id)
                                    const acik = list.find(x => !x.cozuldu_tarih)
                                    if (acik) await snArizasiCoz(acik.id, { cozum_notu: 'Depoda onarıldı', yeniDurum: 'depoda' })
                                    else await snDepoyaCek(k.id)
                                    setYenile(y => y + 1)
                                  }}
                                  title="Onarıldı — Depoya al"
                                  style={miniBtn('#10b981')}
                                >
                                  ✓
                                </button>
                              </>
                            )}
                            {!k.silindi && k.durum === 'arizada' && (
                              <Button size="sm" variant="secondary" iconLeft={<PackageOpen size={12} strokeWidth={1.5} />}
                                onClick={async () => {
                                  const onay = await confirm({ baslik: 'Arızalı Depoya Al', mesaj: `${k.seriNo} depoya (arızalı depoda) alınsın mı?`, onayMetin: 'Depoya Al', iptalMetin: 'Vazgeç' })
                                  if (!onay) return
                                  await snArizaliIsaretle(k.id, { yeniDurum: 'arizali_depoda', sebep: 'diger', aciklama: 'Teknisyenden arızalı geri geldi' })
                                  setYenile(y => y + 1)
                                }}>
                                Depoya Al (arızalı)
                              </Button>
                            )}
                            {!k.silindi && k.durum === 'tamirde' && (
                              <Button size="sm" variant="secondary" iconLeft={<PackageOpen size={12} strokeWidth={1.5} />}
                                onClick={async () => {
                                  const list = await kalemRMAGecmisi(k.id)
                                  const acik = list.find(x => !x.geri_donus_tarih)
                                  if (!acik) return toast.warning('Serviste bekleyen kayıt bulunamadı.')
                                  setRmaDonusModal({ kalem: k, rma: acik })
                                }}>
                                Servisten Döndü
                              </Button>
                            )}
                            {!k.silindi && k.durum === 'sahada' && (
                              <button
                                onClick={() => setArizaModal({ kalem: k, yeniDurum: 'arizali_depoda' })}
                                title="Müşteriden arızalı iade"
                                style={miniBtn('#f59e0b')}
                              >
                                <AlertOctagon size={12} strokeWidth={1.5} />
                              </button>
                            )}
                            {/* Geçmiş */}
                            <button
                              onClick={async () => {
                                const kayitlar = await snGecmisi(k.seriNo, stokKodu)
                                setGecmisModal({ seriNo: k.seriNo, kayitlar })
                              }}
                              title="Bu SN'in geçmişi"
                              style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 28, height: 28, borderRadius: 6,
                                background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
                                color: 'var(--text-secondary)', cursor: 'pointer',
                              }}>
                              <History size={12} strokeWidth={1.5} />
                            </button>
                            {!k.silindi ? (
                              <>
                                <button
                                  onClick={() => setDuzenlenenKalem(k)}
                                  title="SN'i düzenle"
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: 28, height: 28, borderRadius: 6,
                                    background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
                                    color: 'var(--text-secondary)', cursor: 'pointer',
                                  }}>
                                  <Pencil size={12} strokeWidth={1.5} />
                                </button>
                                <button
                                  onClick={() => setSilinecekKalem(k)}
                                  title="SN'i sil (sebep sorulur)"
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: 28, height: 28, borderRadius: 6,
                                    background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
                                    color: 'var(--danger)', cursor: 'pointer',
                                  }}>
                                  <Trash2 size={12} strokeWidth={1.5} />
                                </button>
                              </>
                            ) : (
                              /* Silindi ise geri getir */
                              <button
                                onClick={async () => {
                                  const onay = await confirm({ baslik: 'Geri Getir', mesaj: `${k.seriNo} geri getirilsin mi?`, onayMetin: 'Geri Getir', iptalMetin: 'Vazgeç' })
                                  if (!onay) return
                                  await snGeriGetir(k.id)
                                  setYenile(y => y + 1)
                                }}
                                title="SN'i geri getir"
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '4px 10px', borderRadius: 6,
                                  background: 'var(--success)', color: '#fff', border: 'none',
                                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                                }}>
                                <RotateCcw size={12} strokeWidth={1.5} />
                                Geri Getir
                              </button>
                            )}
                          </div>
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            )}
          </Card>
        </>
      )}

      {/* Toplu ürün görünümü */}
      {!seriTakipli && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 16 }}>
          <Card padding={0}>
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--border-default)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <h3 className="t-h2" style={{ fontSize: 14, lineHeight: '20px', margin: 0 }}>Son hareketler</h3>
                <span className="t-caption">
                  <span className="tabular-nums">{hareketler.length}</span> kayıt
                </span>
              </div>
              <Button variant="tertiary" onClick={() => navigate('/stok-hareketleri')}>
                Tümü
              </Button>
            </div>
            {hareketler.length === 0 ? (
              <div style={{ padding: 32 }}>
                <EmptyState title="Henüz hareket yok" />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Tür</TH>
                    <TH>Tarih</TH>
                    <TH>Açıklama</TH>
                    <TH align="right">Miktar</TH>
                  </TR>
                </THead>
                <TBody>
                  {hareketler.slice(0, 15).map(h => {
                    const bilgi = hareketBilgi[h.hareketTipi] || { isim: h.hareketTipi, tone: 'neutral', yon: 'in', icon: ArrowRightLeft }
                    const Icon = bilgi.icon
                    return (
                      <TR key={h.id}>
                        <TD>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Icon size={12} strokeWidth={1.5} style={{ color: 'var(--text-secondary)' }} />
                            <Badge tone={bilgi.tone}>{bilgi.isim}</Badge>
                          </span>
                        </TD>
                        <TD><span className="tabular-nums">{tarihKisa(h.tarih)}</span></TD>
                        <TD>
                          <span style={{
                            display: 'inline-block', maxWidth: 280,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {h.aciklama || '—'}
                          </span>
                        </TD>
                        <TD align="right">
                          <span className="tabular-nums" style={{
                            font: '600 13px/18px var(--font-sans)',
                            color: bilgi.yon === 'in' ? 'var(--success)' : 'var(--danger)',
                          }}>
                            {bilgi.yon === 'in' ? '+' : '−'}{Number(h.miktar).toFixed(0)}
                          </span>
                          <span className="t-caption" style={{ marginLeft: 4 }}>{urun?.birim || ''}</span>
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            )}
          </Card>

          <Card padding={0}>
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--border-default)',
            }}>
              <h3 className="t-h2" style={{ fontSize: 14, lineHeight: '20px', margin: 0 }}>En çok giden müşteriler</h3>
            </div>
            {musteriDagilimi.length === 0 ? (
              <div style={{ padding: 32 }}>
                <EmptyState title="Henüz müşteri çıkışı yok" />
              </div>
            ) : (
              <div>
                {musteriDagilimi.map(([ad, toplam], i) => {
                  const maxMiktar = musteriDagilimi[0][1]
                  const yuzde = (toplam / maxMiktar) * 100
                  return (
                    <div key={ad} style={{
                      padding: '12px 20px',
                      borderBottom: '1px solid var(--border-default)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                        <span style={{
                          font: '500 13px/18px var(--font-sans)',
                          color: 'var(--text-primary)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          flex: 1,
                        }}>
                          <span className="tabular-nums" style={{ color: 'var(--text-tertiary)' }}>{i + 1}.</span> {ad}
                        </span>
                        <span className="tabular-nums" style={{
                          font: '600 13px/18px var(--font-sans)',
                          color: 'var(--text-primary)',
                          flexShrink: 0,
                        }}>
                          {toplam.toFixed(0)} <span className="t-caption">{urun?.birim || ''}</span>
                        </span>
                      </div>
                      <div style={{
                        width: '100%', height: 4,
                        background: 'var(--surface-sunken)',
                        borderRadius: 'var(--radius-pill)',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${yuzde}%`, height: '100%',
                          background: 'var(--brand-primary)',
                          borderRadius: 'var(--radius-pill)',
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      <SnEkleModal
        open={snEkleAcik}
        onClose={() => setSnEkleAcik(false)}
        urun={urun}
        onEklendi={() => setYenile(y => y + 1)}
      />

      {/* Teknisyene Ver Modalı */}
      {seciliKalem && (
        <TeknisyeneVerModal
          kalem={seciliKalem}
          personel={personelListe}
          onKapat={() => setSeciliKalem(null)}
          onKaydet={async (teknisyenId) => {
            await snTeknisyeneVer(seciliKalem.id, teknisyenId)
            setSeciliKalem(null)
            setYenile(y => y + 1)
          }}
        />
      )}

      {/* SN Düzenle Modalı */}
      {duzenlenenKalem && (
        <SnDuzenleModal
          kalem={duzenlenenKalem}
          onKapat={() => setDuzenlenenKalem(null)}
          onKaydet={async (guncel) => {
            await snGuncelle(duzenlenenKalem.id, guncel)
            setDuzenlenenKalem(null)
            setYenile(y => y + 1)
          }}
        />
      )}

      {/* SN Sil Sebep Modalı */}
      {silinecekKalem && (
        <SnSilModal
          kalem={silinecekKalem}
          onKapat={() => setSilinecekKalem(null)}
          onSil={async ({ sebep, not }) => {
            await snSil(silinecekKalem.id, { sebep, not })
            setSilinecekKalem(null)
            setYenile(y => y + 1)
          }}
        />
      )}

      {/* SN Geçmişi Modalı */}
      {gecmisModal && (
        <SnGecmisModal
          seriNo={gecmisModal.seriNo}
          kayitlar={gecmisModal.kayitlar}
          onKapat={() => setGecmisModal(null)}
        />
      )}

      {arizaModal && (
        <ArizaModal
          {...arizaModal}
          personel={personelListe}
          musteriMap={musteriMap}
          onKapat={() => setArizaModal(null)}
          onKaydet={async (payload) => {
            await snArizaliIsaretle(arizaModal.kalem.id, { ...payload, yeniDurum: arizaModal.yeniDurum })
            setArizaModal(null); setYenile(y => y + 1)
          }}
        />
      )}

      {rmaModal && (
        <RMAModal
          kalem={rmaModal}
          onKapat={() => setRmaModal(null)}
          onKaydet={async (payload) => {
            await rmaOlustur(rmaModal.id, payload)
            setRmaModal(null); setYenile(y => y + 1)
          }}
        />
      )}

      {rmaDonusModal && (
        <RMADonusModal
          kalem={rmaDonusModal.kalem}
          rma={rmaDonusModal.rma}
          onKapat={() => setRmaDonusModal(null)}
          onKaydet={async (payload) => {
            await rmaGeriDondu(rmaDonusModal.rma.id, payload)
            setRmaDonusModal(null); setYenile(y => y + 1)
          }}
        />
      )}

      {etiketAcik && (
        <BarkodEtiketYazdir
          kalemler={kalemler.filter(k => !k.silindi && k.seriNo)}
          marka={urun?.marka || (kalemler[0]?.marka || 'ZNA')}
          stokKodu={stokKodu}
          onKapat={() => setEtiketAcik(false)}
        />
      )}

      {rezerveModal && (
        <RezerveModal
          kalem={rezerveModal}
          onKapat={() => setRezerveModal(null)}
          onKaydet={async (teklifId) => {
            await snRezerveEt(rezerveModal.id, teklifId)
            setRezerveModal(null); setYenile(y => y + 1)
          }}
        />
      )}

      {depoModal && (
        <DepoAtaModal
          kalem={depoModal}
          depolar={depolar}
          onKapat={() => setDepoModal(null)}
          onKaydet={async (depoId, depoAd) => {
            try {
              await snDepoAta(depoModal.id, depoId, depoAd)
              toast.success(`${depoModal.seriNo} → ${depoAd}`)
              setDepoModal(null); setYenile(y => y + 1)
            } catch (e) { toast.error(e?.message || 'Depo atanamadı.') }
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// DepoAtaModal — SN'in fiziksel deposunu değiştir (Faz 4, mig 153)
// ─────────────────────────────────────────────────────────────
function DepoAtaModal({ kalem, depolar, onKapat, onKaydet }) {
  const merkez = depolar.find(d => d.tip === 'merkez')
  const [depoId, setDepoId] = useState(kalem.depoId ?? merkez?.id ?? '')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const tipIkon = (tip) => DEPO_TIPLERI.find(t => t.id === tip)?.ikon || '📦'
  return (
    <ModalKutu baslik="Depoya Ata" alt={kalem.seriNo} onKapat={onKapat}>
      <FieldLabel>Depo</FieldLabel>
      <select value={depoId} onChange={e => setDepoId(Number(e.target.value))} style={selectStil}>
        {depolar.map(d => (
          <option key={d.id} value={d.id}>{tipIkon(d.tip)} {d.ad}</option>
        ))}
      </select>
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
        Depo yalnız fiziksel konumu belirtir; SN'in durumu "Depoda" olarak kalır.
      </p>
      <ModalAksiyonlar onKapat={onKapat}>
        <Button
          variant="primary" size="sm"
          disabled={kaydediliyor || !depoId}
          onClick={async () => {
            setKaydediliyor(true)
            const d = depolar.find(x => x.id === Number(depoId))
            await onKaydet(Number(depoId), d?.ad || '')
            setKaydediliyor(false)
          }}
        >
          {kaydediliyor ? 'Kaydediliyor…' : 'Ata'}
        </Button>
      </ModalAksiyonlar>
    </ModalKutu>
  )
}

// ─────────────────────────────────────────────────────────────
// ArizaModal — SN'i arızalı işaretle
// ─────────────────────────────────────────────────────────────
function ArizaModal({ kalem, yeniDurum, personel, musteriMap, onKapat, onKaydet }) {
  const [sebep, setSebep] = useState('ariza_uretici')
  const [aciklama, setAciklama] = useState('')
  const [teknisyenId, setTeknisyenId] = useState(kalem.teknisyenId || '')
  const [musteriId, setMusteriId] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const kaynakGoster = yeniDurum === 'arizali_depoda'
  const [musteriArama, setMusteriArama] = useState('')
  const musterilerRaw = [...musteriMap.values()]
    .filter(m => m.durum !== 'pasif' && m.durum !== 'silindi')
    .sort((a, b) => (a.firma || `${a.ad || ''} ${a.soyad || ''}`).localeCompare(
      b.firma || `${b.ad || ''} ${b.soyad || ''}`, 'tr'))
  const musteriEtiket = (m) => {
    const firma = (m.firma || '').trim()
    const kisi = `${m.ad || ''} ${m.soyad || ''}`.trim()
    if (firma && kisi) return `${firma} — ${kisi}`
    return firma || kisi || `#${m.id}`
  }
  const musteriler = musteriArama.trim()
    ? musterilerRaw.filter(m => {
        const q = musteriArama.toLocaleLowerCase('tr')
        return String(musteriEtiket(m)).toLocaleLowerCase('tr').includes(q)
          || String(m.kod || '').toLocaleLowerCase('tr').includes(q)
      }).slice(0, 200)
    : musterilerRaw.slice(0, 200)
  const kaydet = async () => {
    setKaydediliyor(true)
    try {
      await onKaydet({
        sebep, aciklama,
        geldigi_teknisyen_id: teknisyenId ? Number(teknisyenId) : null,
        geldigi_musteri_id: musteriId ? Number(musteriId) : null,
      })
    } finally { setKaydediliyor(false) }
  }
  return (
    <ModalKutu onKapat={onKapat} baslik="Arızalı Olarak İşaretle" alt={`SN: ${kalem.seriNo}`}>
      <FieldLabel>Sebep</FieldLabel>
      <select value={sebep} onChange={e => setSebep(e.target.value)} style={selectStil}>
        {ARIZA_SEBEPLERI.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
      </select>

      <FieldLabel style={{ marginTop: 14 }}>Açıklama (isteğe bağlı)</FieldLabel>
      <textarea rows={3} value={aciklama} onChange={e => setAciklama(e.target.value)}
        placeholder="Belirti, hata mesajı vs."
        style={{ ...selectStil, resize: 'vertical', fontFamily: 'inherit' }} />

      {kaynakGoster && (
        <>
          <FieldLabel style={{ marginTop: 14 }}>Kimden geldi? (isteğe bağlı)</FieldLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6 }}>
            <select value={teknisyenId} onChange={e => setTeknisyenId(e.target.value)} style={selectStil}>
              <option value="">— Teknisyen seç —</option>
              {personel.map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
            </select>
            <input
              value={musteriArama}
              onChange={e => setMusteriArama(e.target.value)}
              placeholder="Müşteri ara (firma / kişi / kod)…"
              style={selectStil}
            />
          </div>
          <select value={musteriId} onChange={e => setMusteriId(e.target.value)} style={selectStil} size={Math.min(6, Math.max(1, musteriler.length))}>
            <option value="">— Müşteri seç —</option>
            {musteriler.map(m => (
              <option key={m.id} value={m.id}>
                {musteriEtiket(m)}{m.kod ? ` · ${m.kod}` : ''}
              </option>
            ))}
          </select>
          {musteriArama && (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              {musteriler.length} eşleşme
            </div>
          )}
        </>
      )}

      <ModalAksiyonlar onKapat={onKapat}>
        <Button variant="primary" size="sm" onClick={kaydet} disabled={kaydediliyor}>
          {kaydediliyor ? 'Kaydediliyor…' : 'Arızalı İşaretle'}
        </Button>
      </ModalAksiyonlar>
    </ModalKutu>
  )
}

// ─────────────────────────────────────────────────────────────
// RMAModal — tedarikçiye/servise gönder
// ─────────────────────────────────────────────────────────────
function RMAModal({ kalem, onKapat, onKaydet }) {
  const { toast } = useToast()
  const [tedarikci, setTedarikci] = useState(kalem.marka || '')
  const [kargoNo, setKargoNo] = useState('')
  const [tahminiDonus, setTahminiDonus] = useState('')
  const [notlar, setNotlar] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const kaydet = async () => {
    if (!tedarikci.trim()) return toast.warning('Tedarikçi adı zorunlu.')
    setKaydediliyor(true)
    try {
      await onKaydet({
        tedarikci_ad: tedarikci.trim(),
        kargo_no: kargoNo.trim(),
        tahmini_donus: tahminiDonus || null,
        notlar: notlar.trim(),
      })
    } finally { setKaydediliyor(false) }
  }
  return (
    <ModalKutu onKapat={onKapat} baslik="Servise / Tamire Gönder" alt={`SN: ${kalem.seriNo} → durum: tamirde`}>
      <FieldLabel>Tedarikçi / Servis Adı</FieldLabel>
      <input value={tedarikci} onChange={e => setTedarikci(e.target.value)}
        placeholder="Örn: Hikvision Türkiye" style={selectStil} />

      <FieldLabel style={{ marginTop: 14 }}>Kargo Takip No (isteğe bağlı)</FieldLabel>
      <input value={kargoNo} onChange={e => setKargoNo(e.target.value)}
        placeholder="MNG 1234567890" style={selectStil} />

      <FieldLabel style={{ marginTop: 14 }}>Tahmini Dönüş Tarihi (isteğe bağlı)</FieldLabel>
      <input type="date" value={tahminiDonus} onChange={e => setTahminiDonus(e.target.value)} style={selectStil} />

      <FieldLabel style={{ marginTop: 14 }}>Notlar</FieldLabel>
      <textarea rows={2} value={notlar} onChange={e => setNotlar(e.target.value)}
        style={{ ...selectStil, resize: 'vertical', fontFamily: 'inherit' }} />

      <ModalAksiyonlar onKapat={onKapat}>
        <Button variant="primary" size="sm" onClick={kaydet} disabled={kaydediliyor}>
          {kaydediliyor ? 'Kaydediliyor…' : 'Gönderim Oluştur'}
        </Button>
      </ModalAksiyonlar>
    </ModalKutu>
  )
}

// ─────────────────────────────────────────────────────────────
// RMADonusModal — servisten geri geldi
// ─────────────────────────────────────────────────────────────
function RMADonusModal({ kalem, rma, onKapat, onKaydet }) {
  const [sonuc, setSonuc] = useState('onarildi')
  const [notlar, setNotlar] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const kaydet = async () => {
    setKaydediliyor(true)
    try { await onKaydet({ sonuc, notlar }) }
    finally { setKaydediliyor(false) }
  }
  return (
    <ModalKutu onKapat={onKapat} baslik="Servisten Döndü — Sonucu İşle" alt={`SN: ${kalem.seriNo} — ${rma.tedarikci_ad}`}>
      <FieldLabel>Sonuç</FieldLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
        {RMA_SONUCLARI.map(s => (
          <button key={s.id} onClick={() => setSonuc(s.id)}
            style={{
              padding: '10px 12px', borderRadius: 8,
              background: sonuc === s.id ? s.renk : 'var(--surface-sunken)',
              color: sonuc === s.id ? '#fff' : 'var(--text-primary)',
              border: `1px solid ${sonuc === s.id ? s.renk : 'var(--border-default)'}`,
              cursor: 'pointer', fontWeight: 600, fontSize: 13,
            }}>{s.ad}</button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
        Onarıldı/Değiştirildi → depoya alınır. Kabul edilmedi → hurda.
      </div>

      <FieldLabel style={{ marginTop: 14 }}>Notlar</FieldLabel>
      <textarea rows={2} value={notlar} onChange={e => setNotlar(e.target.value)}
        style={{ ...selectStil, resize: 'vertical', fontFamily: 'inherit' }} />

      <ModalAksiyonlar onKapat={onKapat}>
        <Button variant="primary" size="sm" onClick={kaydet} disabled={kaydediliyor}>
          {kaydediliyor ? 'Kaydediliyor…' : 'İşle'}
        </Button>
      </ModalAksiyonlar>
    </ModalKutu>
  )
}

// ─────────────────────────────────────────────────────────────
// RezerveModal — teklif seç ve rezerve et
// ─────────────────────────────────────────────────────────────
function RezerveModal({ kalem, onKapat, onKaydet }) {
  const [teklifler, setTeklifler] = useState([])
  const [seciliId, setSeciliId] = useState('')
  const [arama, setArama] = useState('')
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  useEffect(() => {
    supabase.from('teklifler')
      .select('id, teklif_no, firma_adi, tarih, onay_durumu')
      .in('onay_durumu', ['bekliyor', 'takipte', 'kabul'])
      .order('tarih', { ascending: false }).limit(200)
      .then(({ data }) => setTeklifler(data || []))
      .finally(() => setYukleniyor(false))
  }, [])
  const filtrelenen = teklifler.filter(t => {
    if (!arama.trim()) return true
    const q = arama.toLowerCase()
    return String(t.teklif_no || '').toLowerCase().includes(q) ||
           String(t.firma_adi || '').toLowerCase().includes(q)
  })
  return (
    <ModalKutu onKapat={onKapat} baslik="Bir Teklife Rezerve Et" alt={`SN: ${kalem.seriNo}`}>
      <input value={arama} onChange={e => setArama(e.target.value)}
        placeholder="Teklif no / firma ara" style={selectStil} autoFocus />
      <div style={{ maxHeight: 340, overflow: 'auto', marginTop: 10, border: '1px solid var(--border-default)', borderRadius: 8 }}>
        {yukleniyor ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
        ) : filtrelenen.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)' }}>Uygun teklif bulunamadı.</div>
        ) : filtrelenen.map(t => (
          <button key={t.id} onClick={() => setSeciliId(t.id)}
            style={{
              display: 'flex', width: '100%', justifyContent: 'space-between',
              padding: '10px 12px', borderBottom: '1px solid var(--border-default)',
              background: seciliId === t.id ? 'rgba(139,92,246,0.12)' : 'transparent',
              border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)',
            }}>
            <span><strong>{t.teklif_no}</strong> — {t.firma_adi}</span>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{t.tarih} · {t.onay_durumu}</span>
          </button>
        ))}
      </div>
      <ModalAksiyonlar onKapat={onKapat}>
        <Button variant="primary" size="sm" disabled={!seciliId || kaydediliyor}
          onClick={async () => { setKaydediliyor(true); try { await onKaydet(seciliId) } finally { setKaydediliyor(false) } }}>
          {kaydediliyor ? 'Rezerve ediliyor…' : 'Rezerve Et'}
        </Button>
      </ModalAksiyonlar>
    </ModalKutu>
  )
}

// ─────────────────────────────────────────────────────────────
// Ortak: modal kutusu, form field, aksiyon
// ─────────────────────────────────────────────────────────────
function ModalKutu({ baslik, alt, children, onKapat }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface-card)', color: 'var(--text-primary)',
        borderRadius: 12, padding: 24, maxWidth: 520, width: '100%', maxHeight: '85vh', overflow: 'auto',
        border: '1px solid var(--border-default)',
      }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>{baslik}</h3>
        {alt && <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16, fontFamily: 'monospace' }}>{alt}</div>}
        {children}
      </div>
    </div>
  )
}
function FieldLabel({ children, style }) {
  return <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6, ...style }}>{children}</label>
}
function ModalAksiyonlar({ onKapat, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
      <Button variant="secondary" size="sm" onClick={onKapat}>İptal</Button>
      {children}
    </div>
  )
}
const selectStil = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--border-default)', background: 'var(--surface-sunken)',
  color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box',
}

function SnGecmisModal({ seriNo, kayitlar, onKapat }) {
  const fmtTarih = (t) => {
    if (!t) return '—'
    try { return new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return t }
  }
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface-card)', color: 'var(--text-primary)',
        borderRadius: 12, padding: 24, maxWidth: 640, width: '100%', maxHeight: '85vh', overflow: 'auto',
        border: '1px solid var(--border-default)',
      }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>SN Geçmişi</h3>
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 18, fontFamily: 'monospace' }}>
          {seriNo}
        </div>
        {kayitlar.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            Bu SN için geçmiş kayıt yok.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {kayitlar.map((h, i) => {
              const isCikis = h.hareketTipi === 'cikis' || h.hareketTipi === 'transfer_cikis'
              const isSilme = String(h.aciklama || '').startsWith('SN silindi')
              const renk = isSilme ? 'var(--danger)' : isCikis ? '#a855f7' : 'var(--success)'
              return (
                <div key={i} style={{
                  padding: 12, borderRadius: 8,
                  background: 'var(--surface-sunken)',
                  borderLeft: `3px solid ${renk}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                    <span>{fmtTarih(h.olusturmaTarih || h.tarih)}</span>
                    {h.kullanici?.ad && <span>👤 {h.kullanici.ad}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{h.aciklama}</div>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="secondary" size="sm" onClick={onKapat}>Kapat</Button>
        </div>
      </div>
    </div>
  )
}

function SnSilModal({ kalem, onKapat, onSil }) {
  const { toast } = useToast()
  const [sebep, setSebep] = useState('')
  const [not, setNot] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface-card)', color: 'var(--text-primary)',
        borderRadius: 12, padding: 24, maxWidth: 500, width: '100%',
        border: '1px solid var(--border-default)',
      }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 18, color: 'var(--danger)' }}>SN Silme — Sebep</h3>
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 14 }}>
          Silinecek: <span className="t-mono">{kalem.seriNo}</span>
        </div>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8, fontWeight: 600 }}>
          Neden siliyorsun? *
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
          {SN_SILME_SEBEPLERI.map(s => (
            <button
              key={s.id}
              onClick={() => setSebep(s.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px', borderRadius: 8, textAlign: 'left', fontSize: 13,
                background: sebep === s.id ? 'var(--danger)' : 'var(--surface-sunken)',
                color: sebep === s.id ? '#fff' : 'var(--text-primary)',
                border: `1px solid ${sebep === s.id ? 'var(--danger)' : 'var(--border-default)'}`,
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 16 }}>{s.ikon}</span> {s.ad}
            </button>
          ))}
        </div>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 600 }}>
          Not (opsiyonel)
        </label>
        <input
          value={not}
          onChange={e => setNot(e.target.value)}
          placeholder="Örn: müşteri firma adı, kayıp tarihi, arıza detayı…"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            border: '1px solid var(--border-default)',
            background: 'var(--surface-sunken)', color: 'var(--text-primary)',
            fontSize: 14, boxSizing: 'border-box', marginBottom: 16,
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" size="sm" onClick={onKapat} disabled={yukleniyor}>İptal</Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!sebep || yukleniyor}
            onClick={async () => {
              setYukleniyor(true)
              try { await onSil({ sebep, not: not.trim() }) }
              catch (e) { toast.error('Silme hatası: ' + (e?.message || e)) }
              finally { setYukleniyor(false) }
            }}
            style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
          >
            {yukleniyor ? 'Siliniyor…' : 'Sil ve Logla'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function SnDuzenleModal({ kalem, onKapat, onKaydet }) {
  const { toast } = useToast()
  const [form, setForm] = useState({
    seriNo: kalem.seriNo || '',
    marka: kalem.marka || '',
    model: kalem.model || '',
    barkod: kalem.barkod || '',
  })
  const [yukleniyor, setYukleniyor] = useState(false)
  const alan = (isim, val, place) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 600 }}>{isim}</label>
      <input
        value={form[val]}
        onChange={e => setForm({ ...form, [val]: e.target.value })}
        placeholder={place}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8,
          border: '1px solid var(--border-default)',
          background: 'var(--surface-sunken)', color: 'var(--text-primary)',
          fontSize: 14, boxSizing: 'border-box',
          fontFamily: val === 'seriNo' || val === 'barkod' ? 'monospace' : 'inherit',
        }}
      />
    </div>
  )
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface-card)', color: 'var(--text-primary)',
        borderRadius: 12, padding: 24, maxWidth: 460, width: '100%',
        border: '1px solid var(--border-default)',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>SN Düzenle</h3>
        {alan('Seri No', 'seriNo', 'S/N')}
        {alan('Marka', 'marka', 'HIKVISION')}
        {alan('Model', 'model', 'DS-2CD1027G0-LUF')}
        {alan('Barkod', 'barkod', 'Opsiyonel')}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="secondary" size="sm" onClick={onKapat} disabled={yukleniyor}>İptal</Button>
          <Button variant="primary" size="sm" disabled={!form.seriNo.trim() || yukleniyor}
            onClick={async () => {
              setYukleniyor(true)
              try {
                await onKaydet({
                  seriNo: form.seriNo.trim(),
                  marka: form.marka.trim() || null,
                  model: form.model.trim() || null,
                  barkod: form.barkod.trim() || null,
                })
              } catch (e) {
                toast.error('Güncelleme hatası: ' + (e?.message || e))
              } finally { setYukleniyor(false) }
            }}>
            {yukleniyor ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function TeknisyeneVerModal({ kalem, personel, onKapat, onKaydet }) {
  const [teknisyenId, setTeknisyenId] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface-card)', color: 'var(--text-primary)',
        borderRadius: 12, padding: 24, maxWidth: 460, width: '100%',
        border: '1px solid var(--border-default)',
      }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>Teknisyene Ver</h3>
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          S/N: <span className="t-mono">{kalem.seriNo}</span>
        </div>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 600 }}>Kime</label>
        <select
          value={teknisyenId}
          onChange={e => setTeknisyenId(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            border: '1px solid var(--border-default)',
            background: 'var(--surface-sunken)', color: 'var(--text-primary)', fontSize: 14,
          }}
        >
          <option value="">— Teknisyen seç —</option>
          {personel.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant="secondary" size="sm" onClick={onKapat} disabled={yukleniyor}>İptal</Button>
          <Button variant="primary" size="sm" disabled={!teknisyenId || yukleniyor}
            onClick={async () => {
              setYukleniyor(true)
              try { await onKaydet(Number(teknisyenId)) } finally { setYukleniyor(false) }
            }}>
            {yukleniyor ? 'Kaydediliyor…' : 'Ver'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ModelDetay
