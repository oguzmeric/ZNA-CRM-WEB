// Sipariş Talep listesi — durum makinesi + kâr/marj guard.
// Bkz: supabase_migrations/124, siparis-talep-modulu-spec_1.md

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Filter, Package, TrendingUp, Users, Calendar } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  Card, Button, Badge, EmptyState, Input,
} from '../components/ui'
import { SkeletonList } from '../components/Skeleton'
import {
  siparisleriGetir, siparisToplamlariniGetir,
  SIPARIS_DURUMLARI, DURUM_ETIKET, DURUM_RENK, karGorebilir,
} from '../services/siparisService'
import { musterileriGetir } from '../services/musteriService'
import CustomSelect from '../components/CustomSelect'

const fmtPara = (n) => `₺ ${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtTarih = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`
  } catch { return iso }
}

const SEKMELER = [
  { id: 'aktif',    label: 'Aktif',        durumlar: ['GORUSME_TALEBI','ON_SIPARIS','ONAY_BEKLIYOR','ONAYLANDI','TEDARIK','KISMI_TESLIM'] },
  { id: 'teslim',   label: 'Teslim/Fatura', durumlar: ['SEVK_TESLIM','FATURALANDI'] },
  { id: 'kapali',   label: 'Kapalı',       durumlar: ['KAPANDI'] },
  { id: 'iptal',    label: 'İptal',        durumlar: ['IPTAL'] },
  { id: 'tumu',     label: 'Tümü',         durumlar: SIPARIS_DURUMLARI },
]

export default function Siparisler() {
  const { kullanici } = useAuth()
  const navigate = useNavigate()
  const [liste, setListe] = useState([])
  const [toplamlar, setToplamlar] = useState([])
  const [musteriler, setMusteriler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [sekme, setSekme] = useState('aktif')
  const [arama, setArama] = useState('')
  const [durumFiltre, setDurumFiltre] = useState('')

  const gosterKar = karGorebilir(kullanici)

  useEffect(() => {
    (async () => {
      setYukleniyor(true)
      const [s, t, m] = await Promise.all([
        siparisleriGetir(),
        siparisToplamlariniGetir(),
        musterileriGetir(),
      ])
      setListe(s || [])
      setToplamlar(t || [])
      setMusteriler(m || [])
      setYukleniyor(false)
    })()
  }, [])

  const musteriMap = useMemo(() => {
    const m = new Map()
    musteriler.forEach(x => m.set(x.id, x))
    return m
  }, [musteriler])

  const toplamMap = useMemo(() => {
    const m = new Map()
    toplamlar.forEach(t => m.set(t.siparisId, t))
    return m
  }, [toplamlar])

  const filtreli = useMemo(() => {
    const sekmeObj = SEKMELER.find(s => s.id === sekme) || SEKMELER[0]
    const q = arama.toLocaleLowerCase('tr').trim()
    return liste.filter(s => {
      if (!sekmeObj.durumlar.includes(s.durum)) return false
      if (durumFiltre && s.durum !== durumFiltre) return false
      if (q) {
        const musteri = musteriMap.get(s.musteriId)
        const arananda = [
          s.siparisNo, s.konu, s.notlar,
          musteri?.firma, musteri?.ad,
        ].filter(Boolean).join(' ').toLocaleLowerCase('tr')
        if (!arananda.includes(q)) return false
      }
      return true
    })
  }, [liste, sekme, arama, durumFiltre, musteriMap])

  const kpi = useMemo(() => {
    const aktif = liste.filter(s => ['GORUSME_TALEBI','ON_SIPARIS','ONAY_BEKLIYOR','ONAYLANDI','TEDARIK','KISMI_TESLIM'].includes(s.durum))
    let toplamSatis = 0, toplamKar = 0
    filtreli.forEach(s => {
      const t = toplamMap.get(s.id)
      if (t) {
        toplamSatis += Number(t.toplamSatis || 0)
        toplamKar += Number(t.toplamKar || 0)
      }
    })
    return { aktifSayi: aktif.length, toplamSatis, toplamKar }
  }, [liste, filtreli, toplamMap])

  return (
    <div style={{ padding: 24 }}>
      {/* Başlık + Yeni */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
            Siparişler
          </h1>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Ön sipariş → tedarik → teslim → tahsilat akışı
          </div>
        </div>
        <Button
          variant="primary"
          iconLeft={<Plus size={14} />}
          onClick={() => navigate('/siparisler/yeni')}
        >
          Yeni Sipariş
        </Button>
      </div>

      {/* KPI kartları */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${gosterKar ? 3 : 2}, minmax(0, 1fr))`,
        gap: 12, marginBottom: 20,
      }}>
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
            <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(6,182,212,0.15)', color: '#06b6d4', display: 'grid', placeItems: 'center' }}>
              <TrendingUp size={20} strokeWidth={1.5} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Toplam Satış (görüntülenen)</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtPara(kpi.toplamSatis)}</div>
            </div>
          </div>
        </Card>
        {gosterKar && (
          <Card style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(16,185,129,0.15)', color: '#10b981', display: 'grid', placeItems: 'center' }}>
                <TrendingUp size={20} strokeWidth={1.5} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Toplam Kâr</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: kpi.toplamKar >= 0 ? '#10b981' : '#ef4444' }}>
                  {fmtPara(kpi.toplamKar)}
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border-default)', paddingBottom: 0, flexWrap: 'wrap' }}>
        {SEKMELER.map(s => {
          const sayi = liste.filter(x => s.durumlar.includes(x.durum)).length
          const aktif = sekme === s.id
          return (
            <button key={s.id}
              onClick={() => setSekme(s.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 14px', fontSize: 13, fontWeight: 600,
                color: aktif ? 'var(--text-primary)' : 'var(--text-tertiary)',
                borderBottom: `2px solid ${aktif ? 'var(--primary)' : 'transparent'}`,
                marginBottom: -1,
              }}>
              {s.label} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>({sayi})</span>
            </button>
          )
        })}
      </div>

      {/* Filtre + Arama */}
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
        <div style={{ minWidth: 200 }}>
          <CustomSelect
            value={durumFiltre}
            onChange={setDurumFiltre}
            options={[
              { value: '', label: 'Tüm durumlar' },
              ...SIPARIS_DURUMLARI.map(d => ({ value: d, label: DURUM_ETIKET[d] })),
            ]}
          />
        </div>
      </div>

      {/* Liste */}
      {yukleniyor ? (
        <SkeletonList adet={5} />
      ) : filtreli.length === 0 ? (
        <EmptyState
          icon={<Package size={40} strokeWidth={1.5} />}
          title="Bu sekmede sipariş yok"
          description="Görüşme veya teklif üzerinden ön sipariş oluşturabilirsin."
        />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {filtreli.map(s => {
            const musteri = musteriMap.get(s.musteriId)
            const t = toplamMap.get(s.id)
            return (
              <Card
                key={s.id}
                onClick={() => navigate(`/siparisler/${s.id}`)}
                style={{
                  padding: 14, cursor: 'pointer',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 12, alignItems: 'center',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14 }}>
                      {s.siparisNo || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </div>
                    <Badge
                      style={{
                        background: `${DURUM_RENK[s.durum]}22`,
                        color: DURUM_RENK[s.durum],
                        border: `1px solid ${DURUM_RENK[s.durum]}55`,
                      }}
                    >
                      {DURUM_ETIKET[s.durum]}
                    </Badge>
                    {s.terminTarihi && (
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={11} strokeWidth={1.5} /> Termin: {fmtTarih(s.terminTarihi)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                    {musteri?.firma || musteri?.ad || 'Müşteri —'}
                  </div>
                  {s.konu && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.konu}
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {fmtPara(t?.toplamSatis)}
                  </div>
                  {gosterKar && (
                    <div style={{
                      fontSize: 11,
                      color: (t?.toplamKar ?? 0) >= 0 ? '#10b981' : '#ef4444',
                      fontWeight: 600,
                    }}>
                      Kâr: {fmtPara(t?.toplamKar)}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {t?.kalemSayisi || 0} kalem
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
