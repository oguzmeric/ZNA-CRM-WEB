// Kullanılan Malzemeler (madde 23) — müşteri bazında sipariş kalemleri:
// hangi ürünlerin faturası KESİLDİ / KESİLMEDİ + teslim (montaj) durumu.
// Veri: siparis_kalemleri (kanonik) + mig 182 sipariş↔fatura köprüsü +
// mig 168 sipariş↔montaj servisi köprüsü (servis tamamlandı → "Teslim edildi").

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, ChevronDown, ChevronRight, Receipt, Wrench, CheckCircle2, Clock } from 'lucide-react'
import { Card, Badge, EmptyState, SegmentedControl, SearchInput } from '../components/ui'
import { kullanilanMalzemeVerisi } from '../services/siparisService'
import { trContains } from '../lib/trSearch'
import { SkeletonList } from '../components/Skeleton'

const fmtPara = (n, pb = 'TL') => {
  const sembol = pb === 'TL' ? '₺' : pb === 'USD' ? '$' : pb === 'EUR' ? '€' : pb
  return `${sembol} ${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
const fmtTarih = (iso) => {
  if (!iso) return '—'
  try { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}` } catch { return iso }
}

// Fatura durum rozeti
function FaturaRozet({ siparis }) {
  if (siparis.faturaDurum === 'faturalandi') {
    return (
      <Badge style={{ background: 'rgba(16,185,129,0.14)', color: '#10b981', border: '1px solid rgba(16,185,129,0.4)' }}>
        <CheckCircle2 size={11} /> Faturalandı{siparis.fatura?.faturaNo ? ` · ${siparis.fatura.faturaNo}` : ''}
      </Badge>
    )
  }
  if (siparis.faturaDurum === 'bekliyor') {
    return (
      <Badge style={{ background: 'rgba(245,158,11,0.14)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.4)' }}>
        <Clock size={11} /> Proforma kuyrukta · {siparis.fatura?.talepNo}
      </Badge>
    )
  }
  return (
    <Badge style={{ background: 'rgba(148,163,184,0.14)', color: 'var(--text-tertiary)', border: '1px solid var(--border-default)' }}>
      <Receipt size={11} /> Fatura kesilmedi
    </Badge>
  )
}

// Teslimat rozeti (montaj servisi köprüsü)
function TeslimRozet({ siparis }) {
  if (siparis.teslimEdildi) {
    return (
      <Badge style={{ background: 'rgba(16,185,129,0.14)', color: '#10b981', border: '1px solid rgba(16,185,129,0.4)' }}>
        <CheckCircle2 size={11} /> Teslim edildi (montaj tamam)
      </Badge>
    )
  }
  if (siparis.montajServisi) {
    return (
      <Badge style={{ background: 'rgba(59,130,246,0.14)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.4)' }}>
        <Wrench size={11} /> Montajda · {siparis.montajServisi.talepNo}
      </Badge>
    )
  }
  return null
}

export default function KullanilanMalzemeler() {
  const navigate = useNavigate()
  const [veri, setVeri] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [filtre, setFiltre] = useState('hepsi')       // hepsi | kesilmedi | bekliyor | faturalandi
  const [arama, setArama] = useState('')
  const [acikMusteriler, setAcikMusteriler] = useState({}) // firma → bool
  const [acikSiparisler, setAcikSiparisler] = useState({}) // siparisId → bool

  useEffect(() => {
    kullanilanMalzemeVerisi()
      .then(setVeri)
      .catch(e => console.error('[kullanilan malzemeler]', e))
      .finally(() => setYukleniyor(false))
  }, [])

  // Filtre + arama → sonra müşteri (firma) bazında grupla
  const gruplar = useMemo(() => {
    const filtreli = veri.filter(s => {
      if (filtre === 'kesilmedi' && s.faturaDurum !== 'yok') return false
      if (filtre === 'bekliyor' && s.faturaDurum !== 'bekliyor') return false
      if (filtre === 'faturalandi' && s.faturaDurum !== 'faturalandi') return false
      if (arama.trim()) {
        const firma = s.musteri?.firma || [s.musteri?.ad, s.musteri?.soyad].filter(Boolean).join(' ')
        const kalemMetni = s.kalemler.map(k => `${k.urunAd} ${k.stokKodu || ''}`).join(' ')
        if (!trContains(`${firma} ${s.siparisNo} ${s.konu || ''} ${kalemMetni}`, arama)) return false
      }
      return true
    })
    const map = new Map()
    for (const s of filtreli) {
      const anahtar = (s.musteri?.firma || '').trim()
        || [s.musteri?.ad, s.musteri?.soyad].filter(Boolean).join(' ')
        || `Müşteri #${s.musteriId}`
      if (!map.has(anahtar)) map.set(anahtar, [])
      map.get(anahtar).push(s)
    }
    // Firma adına göre alfabetik
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr'))
  }, [veri, filtre, arama])

  const sayilar = useMemo(() => ({
    hepsi: veri.length,
    kesilmedi: veri.filter(s => s.faturaDurum === 'yok').length,
    bekliyor: veri.filter(s => s.faturaDurum === 'bekliyor').length,
    faturalandi: veri.filter(s => s.faturaDurum === 'faturalandi').length,
  }), [veri])

  if (yukleniyor) return <SkeletonList />

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 className="t-h1">Kullanılan Malzemeler</h1>
        <p className="t-caption" style={{ marginTop: 4 }}>
          Müşteri bazında sipariş kalemleri — fatura ve teslimat durumu
        </p>
      </div>

      {/* Fatura durum sekmeleri */}
      <div style={{ marginBottom: 12 }}>
        <SegmentedControl
          options={[
            { value: 'hepsi',       label: 'Tümü',            count: sayilar.hepsi },
            { value: 'kesilmedi',   label: 'Fatura Kesilmedi', count: sayilar.kesilmedi },
            { value: 'bekliyor',    label: 'Proforma Kuyrukta', count: sayilar.bekliyor },
            { value: 'faturalandi', label: 'Faturalanan',      count: sayilar.faturalandi },
          ]}
          value={filtre}
          onChange={setFiltre}
        />
      </div>

      {/* Arama */}
      <div style={{ maxWidth: 420, marginBottom: 16 }}>
        <SearchInput
          value={arama}
          onChange={e => setArama(e.target.value)}
          placeholder="Müşteri, sipariş no veya ürün ara…"
        />
      </div>

      {gruplar.length === 0 ? (
        <EmptyState
          title="Kayıt yok"
          description={filtre === 'hepsi' ? 'Henüz sipariş bulunmuyor.' : 'Bu filtreye uyan sipariş yok.'}
          icon={<Package size={32} />}
        />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {gruplar.map(([firma, siparisler]) => {
            const acik = acikMusteriler[firma] ?? (gruplar.length <= 3)
            const kalemSayisi = siparisler.reduce((a, s) => a + s.kalemler.length, 0)
            const faturasiz = siparisler.filter(s => s.faturaDurum !== 'faturalandi').length
            return (
              <Card key={firma} style={{ padding: 0, overflow: 'hidden' }}>
                {/* Müşteri başlığı */}
                <button
                  onClick={() => setAcikMusteriler(p => ({ ...p, [firma]: !acik }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '14px 16px', background: 'transparent', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  {acik ? <ChevronDown size={16} color="var(--text-tertiary)" /> : <ChevronRight size={16} color="var(--text-tertiary)" />}
                  <span style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {firma}
                  </span>
                  <span className="t-caption tabular-nums">
                    {siparisler.length} sipariş · {kalemSayisi} kalem
                  </span>
                  {faturasiz > 0 && (
                    <Badge style={{ background: 'rgba(245,158,11,0.14)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.4)' }}>
                      {faturasiz} faturasız
                    </Badge>
                  )}
                </button>

                {acik && (
                  <div style={{ borderTop: '1px solid var(--border-default)' }}>
                    {siparisler.map(s => {
                      const sAcik = acikSiparisler[s.id] ?? (siparisler.length === 1)
                      return (
                        <div key={s.id} style={{ borderBottom: '1px solid var(--border-default)' }}>
                          {/* Sipariş satırı */}
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px 10px 28px', flexWrap: 'wrap', cursor: 'pointer' }}
                            onClick={() => setAcikSiparisler(p => ({ ...p, [s.id]: !sAcik }))}
                          >
                            {sAcik ? <ChevronDown size={14} color="var(--text-tertiary)" /> : <ChevronRight size={14} color="var(--text-tertiary)" />}
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/siparisler/${s.id}`) }}
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: '600 13px/18px monospace', color: 'var(--brand)' }}
                              title="Sipariş detayına git"
                            >
                              {s.siparisNo}
                            </button>
                            <span className="t-caption">{fmtTarih(s.olusturmaTarih)}</span>
                            <span className="t-caption tabular-nums">{s.kalemler.length} kalem · {fmtPara(s.genelToplam, s.paraBirimi)}</span>
                            <div style={{ flex: 1 }} />
                            <FaturaRozet siparis={s} />
                            <TeslimRozet siparis={s} />
                          </div>

                          {/* Kalem tablosu */}
                          {sAcik && s.kalemler.length > 0 && (
                            <div style={{ padding: '0 16px 12px 44px', overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
                                <thead>
                                  <tr>
                                    {['Ürün', 'Marka/Model', 'Miktar', 'Birim Fiyat', 'Tutar'].map((h, i) => (
                                      <th key={h} style={{
                                        textAlign: i >= 2 ? 'right' : 'left', padding: '6px 8px',
                                        font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)',
                                        textTransform: 'uppercase', letterSpacing: 0.4,
                                        borderBottom: '1px solid var(--border-default)',
                                      }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {s.kalemler.map(k => (
                                    <tr key={k.id}>
                                      <td style={{ padding: '6px 8px', font: '400 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                                        {k.urunAd}
                                        {k.stokKodu && <span className="t-caption" style={{ marginLeft: 6 }}>({k.stokKodu})</span>}
                                      </td>
                                      <td style={{ padding: '6px 8px', font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                                        {[k.urunMarka, k.urunModel].filter(Boolean).join(' ') || '—'}
                                      </td>
                                      <td style={{ padding: '6px 8px', textAlign: 'right', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                                        {Number(k.miktar || 0).toLocaleString('tr-TR')} {k.birim || 'Adet'}
                                      </td>
                                      <td style={{ padding: '6px 8px', textAlign: 'right', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                                        {fmtPara(k.birimFiyat, s.paraBirimi)}
                                      </td>
                                      <td style={{ padding: '6px 8px', textAlign: 'right', font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                                        {fmtPara(k.araToplam ?? (Number(k.miktar || 0) * Number(k.birimFiyat || 0)), s.paraBirimi)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {sAcik && s.kalemler.length === 0 && (
                            <p className="t-caption" style={{ margin: 0, padding: '0 16px 12px 44px' }}>Bu siparişte kalem kaydı yok.</p>
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
    </div>
  )
}
