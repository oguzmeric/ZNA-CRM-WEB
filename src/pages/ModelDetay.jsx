import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Package, Tag, Hash, AlertTriangle, Building2, Calendar,
  ArrowDown, ArrowUp, ArrowRightLeft, Box,
} from 'lucide-react'
import {
  modelKalemleriniGetir, DURUMLAR, durumBul,
  stokUrunleriniGetir, stokHareketleriniGetir,
} from '../services/stokService'
import { musterileriGetir } from '../services/musteriService'
import {
  Button, SearchInput, Card, Badge, CodeBadge, KPICard,
  EmptyState, Alert, Table, THead, TBody, TR, TH, TD,
} from '../components/ui'
import CustomSelect from '../components/CustomSelect'

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

const tarihKisa = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

function ModelDetay() {
  const { stokKodu } = useParams()
  const navigate = useNavigate()
  const [kalemler, setKalemler] = useState([])
  const [urun, setUrun] = useState(null)
  const [hareketler, setHareketler] = useState([])
  const [musteriMap, setMusteriMap] = useState(new Map())
  const [filtre, setFiltre] = useState('tumu')
  const [arama, setArama] = useState('')
  const [yukleniyor, setYukleniyor] = useState(true)

  useEffect(() => {
    Promise.all([
      modelKalemleriniGetir(stokKodu),
      stokUrunleriniGetir(),
      stokHareketleriniGetir(),
      musterileriGetir(),
    ]).then(([k, u, h, m]) => {
      setKalemler(k || [])
      setUrun((u || []).find(x => x.stokKodu === stokKodu) || null)
      setHareketler((h || []).filter(x => x.stokKodu === stokKodu))
      const map = new Map()
      ;(m || []).forEach(x => map.set(x.id, x))
      setMusteriMap(map)
      setYukleniyor(false)
    })
  }, [stokKodu])

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

  const seriTakipli = kalemler.length > 0
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
    return <div style={{ padding: 24 }}><EmptyState title="Yükleniyor…" /></div>
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
                    <TH>Marka / Model</TH>
                    <TH>Barkod</TH>
                    <TH>Müşteri</TH>
                    <TH>Tarih</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtrelenmis.map(k => {
                    const d = durumBul(k.durum)
                    const musteri = k.musteriId ? musteriMap.get(k.musteriId) : null
                    return (
                      <TR key={k.id}>
                        <TD><CodeBadge>{k.seriNo || '—'}</CodeBadge></TD>
                        <TD>{d ? <Badge tone={durumTone[d.id] || 'neutral'}>{d.isim}</Badge> : '—'}</TD>
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
                          {musteri ? (
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
                          {k.durum === 'sahada' && k.takilmaTarihi ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--success)' }}>
                              <Calendar size={12} strokeWidth={1.5} /> {tarihFmt(k.takilmaTarihi)}
                            </span>
                          ) : '—'}
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
    </div>
  )
}

export default ModelDetay
