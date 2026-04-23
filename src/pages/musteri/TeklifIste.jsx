import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, FileText, Package, Search, ShoppingCart, X, Plus, Minus,
  CheckCircle2, Check,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { katalogUrunleriniGetir } from '../../services/stokService'
import CustomSelect from '../../components/CustomSelect'
import {
  Button, SearchInput, Input, Textarea, Label,
  Card, Badge, EmptyState, Modal,
} from '../../components/ui'

export default function TeklifIste() {
  const { kullanici } = useAuth()
  const navigate = useNavigate()

  const ayarlar = JSON.parse(localStorage.getItem('sistem_ayarlari') || '{}')
  const datasheetUrl = ayarlar.datasheetUrl || ''

  const [katalogUrunler, setKatalogUrunler] = useState([])
  const [katalogYukleniyor, setKatalogYukleniyor] = useState(true)
  const [arama, setArama] = useState('')
  const [seciliGrup, setSeciliGrup] = useState('hepsi')
  const [sepet, setSepet] = useState([])
  const [aciklama, setAciklama] = useState('')
  const [butce, setButce] = useState('')
  const [iletisimKisi, setIletisimKisi] = useState(kullanici?.ad || '')
  const [telefon, setTelefon] = useState('')
  const [hatalar, setHatalar] = useState({})
  const [gonderildi, setGonderildi] = useState(false)
  const [buyukGorsel, setBuyukGorsel] = useState(null)

  useEffect(() => {
    katalogUrunleriniGetir().then(d => { setKatalogUrunler(d || []); setKatalogYukleniyor(false) })
  }, [])

  const gruplar = useMemo(
    () => [...new Set(katalogUrunler.map(u => u.grupKodu).filter(Boolean))].sort(),
    [katalogUrunler]
  )

  const filtreliUrunler = useMemo(() =>
    katalogUrunler.filter(u => {
      const aramaUygun = !arama || `${u.stokAdi} ${u.marka} ${u.stokKodu}`.toLowerCase().includes(arama.toLowerCase())
      const grupUygun = seciliGrup === 'hepsi' || u.grupKodu === seciliGrup
      return aramaUygun && grupUygun
    }),
    [katalogUrunler, arama, seciliGrup]
  )

  const sepeteEkle = (urun) => {
    setSepet(prev => {
      const v = prev.find(s => s.urun.id === urun.id)
      if (v) return prev.map(s => s.urun.id === urun.id ? { ...s, adet: s.adet + 1 } : s)
      return [...prev, { urun, adet: 1 }]
    })
  }

  const sepetAdetGuncelle = (urunId, adet) => {
    if (adet <= 0) setSepet(prev => prev.filter(s => s.urun.id !== urunId))
    else setSepet(prev => prev.map(s => s.urun.id === urunId ? { ...s, adet } : s))
  }

  const sepettenCikar = (urunId) => setSepet(prev => prev.filter(s => s.urun.id !== urunId))
  const sepetteMi = (urunId) => sepet.find(s => s.urun.id === urunId)

  const dogrula = () => {
    const h = {}
    if (sepet.length === 0) h.sepet = 'En az bir ürün seçiniz'
    if (!aciklama.trim()) h.aciklama = 'Açıklama giriniz'
    setHatalar(h)
    return Object.keys(h).length === 0
  }

  const gonder = () => {
    if (!dogrula()) return
    const mevcutlar = JSON.parse(localStorage.getItem('musteri_teklif_talepleri') || '[]')
    const sayi = mevcutlar.length + 1
    const yeni = {
      id: crypto.randomUUID(),
      talepNo: `TT-${String(sayi).padStart(4, '0')}`,
      musteriId: kullanici.id, musteriAd: kullanici.ad,
      firmaAdi: kullanici.firmaAdi || '',
      urunler: sepet.map(s => ({
        isim: s.urun.stokAdi, adet: String(s.adet),
        stokKodu: s.urun.stokKodu, marka: s.urun.marka || '',
      })),
      aciklama, butce, iletisimKisi, telefon,
      tarih: new Date().toISOString(), durum: 'bekliyor',
    }
    localStorage.setItem('musteri_teklif_talepleri', JSON.stringify([...mevcutlar, yeni]))
    setGonderildi(true)
  }

  if (gonderildi) {
    return (
      <div style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--success)', color: '#fff',
          marginBottom: 20, boxShadow: 'var(--shadow-lg)',
        }}>
          <CheckCircle2 size={40} strokeWidth={2} />
        </div>
        <h2 style={{ font: '600 22px/28px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 8 }}>
          Teklif Talebiniz Alındı
        </h2>
        <p style={{ font: '400 14px/20px var(--font-sans)', color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 400, marginBottom: 20 }}>
          Satış ekibimiz seçtiğiniz ürünleri inceleyip en kısa sürede size teklif hazırlayacaktır.
        </p>
        <Button variant="primary" onClick={() => navigate('/musteri-portal')}>Ana panele dön</Button>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <button
        onClick={() => navigate('/musteri-portal')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--text-tertiary)', font: '500 13px/18px var(--font-sans)',
          marginBottom: 12,
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-primary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
      >
        <ArrowLeft size={14} strokeWidth={1.5} /> Geri dön
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Teklif İste</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            Ürünleri seçin, miktarlarını belirleyin ve talebinizi gönderin.
          </p>
        </div>
        {datasheetUrl && (
          <a
            href={datasheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 36, padding: '0 16px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--brand-primary-soft)',
              color: 'var(--brand-primary)',
              border: '1px solid var(--border-default)',
              font: '500 13px/18px var(--font-sans)',
              textDecoration: 'none',
            }}
          >
            <FileText size={14} strokeWidth={1.5} /> Ürün kataloğu
          </a>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'flex-start' }}>
        {/* Sol: Katalog */}
        <div>
          {/* Arama + filter */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <SearchInput value={arama} onChange={e => setArama(e.target.value)} placeholder="Ürün ara…" />
            </div>
            <div style={{ minWidth: 200 }}>
              <CustomSelect value={seciliGrup} onChange={e => setSeciliGrup(e.target.value)}>
                <option value="hepsi">Tüm kategoriler</option>
                {gruplar.map(g => <option key={g} value={g}>{g}</option>)}
              </CustomSelect>
            </div>
          </div>

          {katalogYukleniyor ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{
                  height: 220, borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--border-default)',
                }} className="shimmer" />
              ))}
            </div>
          ) : filtreliUrunler.length === 0 ? (
            <EmptyState
              icon={<Package size={32} strokeWidth={1.5} />}
              title={arama ? 'Arama sonucu bulunamadı' : 'Katalogda ürün bulunamadı'}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {filtreliUrunler.map(urun => {
                const secili = sepetteMi(urun.id)
                return (
                  <div
                    key={urun.id}
                    onClick={() => sepeteEkle(urun)}
                    style={{
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      background: secili ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                      border: `1px solid ${secili ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                      transition: 'all 120ms',
                    }}
                  >
                    {/* Görsel */}
                    <div style={{
                      position: 'relative',
                      height: 130,
                      background: 'var(--surface-sunken)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {urun.gorselUrl ? (
                        <img
                          src={urun.gorselUrl}
                          alt={urun.stokAdi}
                          style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 12 }}
                          onClick={e => { e.stopPropagation(); setBuyukGorsel(urun) }}
                        />
                      ) : (
                        <Package size={40} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
                      )}
                      {secili && (
                        <span style={{
                          position: 'absolute', top: 8, right: 8,
                          minWidth: 24, height: 24, padding: '0 7px',
                          borderRadius: 'var(--radius-pill)',
                          background: 'var(--brand-primary)',
                          color: '#fff',
                          font: '600 12px/1 var(--font-sans)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {secili.adet}
                        </span>
                      )}
                      {urun.grupKodu && (
                        <div style={{ position: 'absolute', top: 8, left: 8 }}>
                          <Badge tone="neutral">{urun.grupKodu}</Badge>
                        </div>
                      )}
                    </div>

                    {/* Bilgi */}
                    <div style={{ padding: 12 }}>
                      <p style={{
                        font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)',
                        margin: 0,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {urun.stokAdi}
                      </p>
                      {urun.marka && (
                        <p className="t-caption" style={{ marginTop: 2 }}>{urun.marka}</p>
                      )}
                      <div style={{ marginTop: 8 }}>
                        {secili ? (
                          <div onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <button
                              aria-label="Azalt"
                              onClick={() => sepetAdetGuncelle(urun.id, secili.adet - 1)}
                              style={{
                                width: 26, height: 26, borderRadius: 'var(--radius-sm)',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: 'var(--brand-primary-soft)',
                                border: '1px solid var(--border-default)',
                                color: 'var(--brand-primary)', cursor: 'pointer',
                              }}
                            >
                              <Minus size={12} strokeWidth={2} />
                            </button>
                            <input
                              type="number"
                              value={secili.adet}
                              min={1}
                              onChange={e => sepetAdetGuncelle(urun.id, Number(e.target.value))}
                              style={{
                                width: 42, height: 26, textAlign: 'center',
                                border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-sm)',
                                font: '600 13px/1 var(--font-sans)',
                                color: 'var(--brand-primary)',
                                background: 'var(--surface-card)',
                                outline: 'none',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            />
                            <button
                              aria-label="Artır"
                              onClick={() => sepetAdetGuncelle(urun.id, secili.adet + 1)}
                              style={{
                                width: 26, height: 26, borderRadius: 'var(--radius-sm)',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: 'var(--brand-primary-soft)',
                                border: '1px solid var(--border-default)',
                                color: 'var(--brand-primary)', cursor: 'pointer',
                              }}
                            >
                              <Plus size={12} strokeWidth={2} />
                            </button>
                          </div>
                        ) : (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            font: '500 12px/16px var(--font-sans)',
                            color: 'var(--brand-primary)',
                          }}>
                            <Plus size={12} strokeWidth={1.5} /> Sepete ekle
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Sağ: Sepet + Form */}
        <Card padding={0} style={{ position: 'sticky', top: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-default)',
          }}>
            <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>
              <ShoppingCart size={14} strokeWidth={1.5} /> Seçilen ürünler
            </h3>
            <Badge tone="brand">
              <span className="tabular-nums">{sepet.length}</span> ürün
            </Badge>
          </div>

          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {sepet.length === 0 ? (
              <div style={{ padding: 24 }}>
                <EmptyState icon={<ShoppingCart size={24} strokeWidth={1.5} />} title="Soldan ürün seçin" />
              </div>
            ) : (
              <div>
                {sepet.map(({ urun, adet }) => (
                  <div key={urun.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--border-default)',
                  }}>
                    {urun.gorselUrl ? (
                      <img src={urun.gorselUrl} alt="" style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', objectFit: 'contain', border: '1px solid var(--border-default)', flexShrink: 0 }} />
                    ) : (
                      <div style={{
                        width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface-sunken)',
                        border: '1px solid var(--border-default)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-tertiary)', flexShrink: 0,
                      }}>
                        <Package size={14} strokeWidth={1.5} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {urun.stokAdi}
                      </p>
                      <p className="t-caption" style={{ marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                        {adet} {urun.birim}
                      </p>
                    </div>
                    <button
                      aria-label="Çıkar"
                      onClick={() => sepettenCikar(urun.id)}
                      style={{
                        background: 'none', border: 'none', padding: 4, cursor: 'pointer',
                        color: 'var(--text-tertiary)',
                        display: 'inline-flex',
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
                    >
                      <X size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {hatalar.sepet && (
            <p style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--danger)', padding: '0 16px 8px' }}>{hatalar.sepet}</p>
          )}

          <div style={{ padding: 16, borderTop: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Label required>Açıklama</Label>
              <Textarea
                value={aciklama}
                onChange={e => setAciklama(e.target.value)}
                placeholder="Kullanım amacı, kurulum yeri, özel istekler…"
                rows={3}
                style={hatalar.aciklama ? { borderColor: 'var(--danger)' } : {}}
              />
              {hatalar.aciklama && <p style={{ color: 'var(--danger)', font: '500 11px/16px var(--font-sans)', marginTop: 4 }}>{hatalar.aciklama}</p>}
            </div>

            <div>
              <Label>Bütçe <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(opsiyonel)</span></Label>
              <Input value={butce} onChange={e => setButce(e.target.value)} placeholder="Örn: 50.000 TL" />
            </div>

            <div>
              <Label>İlgili kişi</Label>
              <Input value={iletisimKisi} onChange={e => setIletisimKisi(e.target.value)} />
            </div>

            <div>
              <Label>Telefon</Label>
              <Input type="tel" value={telefon} onChange={e => setTelefon(e.target.value)} placeholder="0xxx xxx xx xx" />
            </div>

            <Button
              variant="primary"
              iconLeft={<Check size={14} strokeWidth={2} />}
              onClick={gonder}
              disabled={sepet.length === 0}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Teklif talebi gönder
            </Button>
          </div>
        </Card>
      </div>

      {/* Büyük görsel modal */}
      {buyukGorsel && (
        <Modal
          open={!!buyukGorsel}
          onClose={() => setBuyukGorsel(null)}
          title={
            <div>
              <div style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{buyukGorsel.stokAdi}</div>
              {buyukGorsel.marka && <div className="t-caption" style={{ marginTop: 2 }}>{buyukGorsel.marka}</div>}
            </div>
          }
          footer={
            <>
              <Button variant="secondary" onClick={() => setBuyukGorsel(null)}>Kapat</Button>
              <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => { sepeteEkle(buyukGorsel); setBuyukGorsel(null) }}>
                Sepete ekle
              </Button>
            </>
          }
          width={600}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, minHeight: 300,
            background: 'var(--surface-sunken)',
            borderRadius: 'var(--radius-sm)',
          }}>
            <img src={buyukGorsel.gorselUrl} alt={buyukGorsel.stokAdi} style={{ maxHeight: 320, maxWidth: '100%', objectFit: 'contain' }} />
          </div>
          {buyukGorsel.aciklama && (
            <p style={{ font: '400 13px/20px var(--font-sans)', color: 'var(--text-secondary)', marginTop: 12 }}>
              {buyukGorsel.aciklama}
            </p>
          )}
        </Modal>
      )}
    </div>
  )
}
