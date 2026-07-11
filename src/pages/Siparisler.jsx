// Siparişler — kalıcı sipariş listesi (onaylanmış).
// Sipariş no ZNA-SIP-YYYY-NNNNNN formatında.

import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Package, FileText, ShoppingCart, Building2, Calendar, Plus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Card, Button, Badge, EmptyState, Input } from '../components/ui'
import CustomSelect from '../components/CustomSelect'
import { siparisleriGetir, SIPARIS_DURUMLARI } from '../services/siparisService'
import { musterileriGetir } from '../services/musteriService'
import { gorusmeleriGetir } from '../services/gorusmeService'
import YeniOnSiparisWizard from '../components/YeniOnSiparisWizard'

const fmtPara = (n, pb = 'TL') => {
  const num = Number(n || 0)
  const sembol = pb === 'TL' ? '₺' : pb === 'USD' ? '$' : pb === 'EUR' ? '€' : pb
  return `${sembol} ${num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const fmtTarih = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`
  } catch { return iso }
}

const SEKMELER = [
  { id: 'aktif',      label: 'Aktif',      durumlar: ['aktif'] },
  { id: 'tamamlandi', label: 'Tamamlandı', durumlar: ['tamamlandi'] },
  { id: 'iptal',      label: 'İptal',      durumlar: ['iptal'] },
  { id: 'tumu',       label: 'Tümü',       durumlar: ['aktif','tamamlandi','iptal'] },
]

export default function Siparisler() {
  const { kullanici } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const musteriFiltre = searchParams.get('musteri') || ''
  const [liste, setListe] = useState([])
  const [musteriler, setMusteriler] = useState([])
  const [gorusmeMap, setGorusmeMap] = useState(new Map())
  const [yukleniyor, setYukleniyor] = useState(true)
  const [sekme, setSekme] = useState('aktif')
  const [arama, setArama] = useState('')
  const [kaynakFiltre, setKaynakFiltre] = useState('')
  const [wizardAcik, setWizardAcik] = useState(false)

  useEffect(() => {
    (async () => {
      setYukleniyor(true)
      try {
        const [s, m, gs] = await Promise.all([
          siparisleriGetir(),
          musterileriGetir(),
          gorusmeleriGetir().catch(() => []),
        ])
        setListe(s || [])
        setMusteriler(m || [])
        const gm = new Map()
        ;(gs || []).forEach(g => gm.set(g.id, g))
        setGorusmeMap(gm)
      } catch (e) {
        console.error('[siparisler]', e)
      } finally { setYukleniyor(false) }
    })()
  }, [])

  const musteriMap = useMemo(() => {
    const m = new Map()
    musteriler.forEach(x => m.set(x.id, x))
    return m
  }, [musteriler])

  // Firma filtresi için: musteriFiltre id'li kişinin firma'sı ile aynı olan tüm müşteri id'leri
  const musteriFiltreIdler = useMemo(() => {
    if (!musteriFiltre) return null
    const secili = musteriMap.get(Number(musteriFiltre))
    if (!secili?.firma) return new Set([Number(musteriFiltre)])
    const norm = secili.firma.toLowerCase().trim()
    return new Set(musteriler.filter(m => m.firma?.toLowerCase().trim() === norm).map(m => Number(m.id)))
  }, [musteriFiltre, musteriler, musteriMap])

  const filtreli = useMemo(() => {
    const sekmeObj = SEKMELER.find(s => s.id === sekme) || SEKMELER[0]
    const q = arama.toLocaleLowerCase('tr').trim()
    return liste.filter(s => {
      if (!sekmeObj.durumlar.includes(s.durum)) return false
      if (kaynakFiltre && s.kaynakTipi !== kaynakFiltre) return false
      if (musteriFiltreIdler && !musteriFiltreIdler.has(Number(s.musteriId))) return false
      if (q) {
        const musteri = musteriMap.get(s.musteriId)
        const alan = [s.siparisNo, s.konu, s.notlar, musteri?.firma, musteri?.ad]
          .filter(Boolean).join(' ').toLocaleLowerCase('tr')
        if (!alan.includes(q)) return false
      }
      return true
    })
  }, [liste, sekme, arama, kaynakFiltre, musteriFiltreIdler, musteriMap])

  const musteriFiltreObj = musteriFiltre ? musteriMap.get(Number(musteriFiltre)) : null

  const kpi = useMemo(() => {
    const aktif = liste.filter(s => s.durum === 'aktif')
    const toplamTutar = filtreli.reduce((s, x) => s + Number(x.genelToplam || 0), 0)
    return {
      aktifSayi: aktif.length,
      toplamSayi: filtreli.length,
      toplamTutar,
    }
  }, [liste, filtreli])

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Siparişler</h1>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Onaylanmış siparişler · ZNA-SIP-YYYY-NNNNNN
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => navigate('/siparis-onaylari')}>
            Sipariş Onayı ekranına git →
          </Button>
          <Button
            variant="primary"
            iconLeft={<Plus size={14} strokeWidth={1.5} />}
            onClick={() => setWizardAcik(true)}
          >
            Yeni Ön Sipariş
          </Button>
        </div>
      </div>

      {/* KPI kartları */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(59,130,246,0.15)', color: '#3b82f6', display: 'grid', placeItems: 'center' }}>
              <Package size={20} strokeWidth={1.5} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Aktif Sipariş</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{kpi.aktifSayi}</div>
            </div>
          </div>
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(16,185,129,0.15)', color: '#10b981', display: 'grid', placeItems: 'center' }}>
              <ShoppingCart size={20} strokeWidth={1.5} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Görüntülenen Toplam</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{kpi.toplamSayi}</div>
            </div>
          </div>
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', display: 'grid', placeItems: 'center' }}>
              <FileText size={20} strokeWidth={1.5} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Görüntülenen Tutar</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtPara(kpi.toplamTutar)}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border-default)', flexWrap: 'wrap' }}>
        {SEKMELER.map(s => {
          const sayi = liste.filter(x => s.durumlar.includes(x.durum)).length
          const aktif = sekme === s.id
          return (
            <button key={s.id} onClick={() => setSekme(s.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 14px', fontSize: 13, fontWeight: 600,
                color: aktif ? 'var(--text-primary)' : 'var(--text-tertiary)',
                borderBottom: `2px solid ${aktif ? 'var(--accent, #1E5AA8)' : 'transparent'}`,
                marginBottom: -1,
              }}>
              {s.label} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>({sayi})</span>
            </button>
          )
        })}
      </div>

      {/* Aktif müşteri filtresi chip'i */}
      {musteriFiltreObj && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>Müşteri filtresi:</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 999,
            background: 'rgba(59,130,246,0.10)', color: '#3b82f6',
            fontSize: 12, fontWeight: 700,
            border: '1px solid rgba(59,130,246,0.35)',
          }}>
            <Building2 size={12} strokeWidth={1.5} />
            {musteriFiltreObj.firma || `${musteriFiltreObj.ad || ''} ${musteriFiltreObj.soyad || ''}`.trim()}
            <button
              onClick={() => {
                const yeni = new URLSearchParams(searchParams)
                yeni.delete('musteri')
                setSearchParams(yeni, { replace: true })
              }}
              style={{ background: 'none', border: 'none', padding: 0, marginLeft: 2, cursor: 'pointer', color: 'inherit', display: 'inline-flex' }}
              title="Filtreyi kaldır"
            >
              ✕
            </button>
          </span>
        </div>
      )}

      {/* Filtre */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 300px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <Input
            placeholder="Sipariş no, konu, müşteri ara..."
            value={arama}
            onChange={e => setArama(e.target.value)}
            style={{ paddingLeft: 32 }}
          />
        </div>
        <div style={{ minWidth: 180 }}>
          <CustomSelect value={kaynakFiltre} onChange={e => setKaynakFiltre(e.target.value)}>
            <option value="">Tüm kaynaklar</option>
            <option value="teklif">Tekliften</option>
            <option value="on_siparis">Ön Siparişten</option>
          </CustomSelect>
        </div>
      </div>

      {/* Liste */}
      {yukleniyor ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
      ) : filtreli.length === 0 ? (
        <EmptyState
          icon={<Package size={40} strokeWidth={1.5} />}
          title={sekme === 'aktif' ? 'Aktif sipariş yok' : 'Bu sekmede sipariş yok'}
          aciklama="Sipariş Onayı ekranından onay verilince siparişler burada oluşur."
        />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {filtreli.map(s => {
            const musteri = musteriMap.get(s.musteriId)
            const durumObj = SIPARIS_DURUMLARI.find(d => d.id === s.durum)
            const kaynakIcon = s.kaynakTipi === 'teklif' ? <FileText size={11} /> : <ShoppingCart size={11} />
            const kaynakLabel = s.kaynakTipi === 'teklif' ? 'TEKLİFTEN' : 'ÖN SİPARİŞTEN'
            return (
              <Card key={s.id}
                onClick={() => navigate(`/siparisler/${s.id}`)}
                style={{
                  padding: 14, cursor: 'pointer',
                  display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14 }}>{s.siparisNo || '—'}</span>
                    <Badge style={{ background: `${durumObj?.renk}22`, color: durumObj?.renk, border: `1px solid ${durumObj?.renk}55` }}>
                      {durumObj?.isim || s.durum}
                    </Badge>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                      background: s.kaynakTipi === 'teklif' ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)',
                      color: s.kaynakTipi === 'teklif' ? '#3b82f6' : '#10b981',
                    }}>
                      {kaynakIcon} {kaynakLabel}
                    </span>
                    {(() => {
                      const g = gorusmeMap.get(s.gorusmeId)
                      return g?.aktNo ? (
                        <span style={{
                          fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
                          color: '#3b82f6', padding: '2px 6px',
                          background: 'rgba(59,130,246,0.10)', borderRadius: 4,
                        }}>{g.aktNo}</span>
                      ) : null
                    })()}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                    <Building2 size={11} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />
                    {musteri?.firma || musteri?.ad || '—'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {s.konu && <>{s.konu} · </>}
                    <Calendar size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 3 }} />
                    {fmtTarih(s.onayTarihi || s.olusturmaTarih)}
                    {s.onaylayanAd && <> · onaylayan: {s.onaylayanAd}</>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {fmtPara(s.genelToplam, s.paraBirimi)}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Yeni Ön Sipariş wizard'ı — müşteri seç + görüşme oluştur + ön sipariş */}
      {wizardAcik && (
        <YeniOnSiparisWizard
          onKapat={() => setWizardAcik(false)}
          onKaydedildi={() => {
            siparisleriGetir()
              .then(setListe)
              .catch(e => console.warn('[Siparisler] liste yenilenemedi:', e?.message))
          }}
        />
      )}
    </div>
  )
}
