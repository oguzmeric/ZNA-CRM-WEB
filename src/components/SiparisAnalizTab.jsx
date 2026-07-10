// Sipariş Analizi — Kâr/Marj + Firma bazlı özet.
// Raporlar sayfası içinde tab olarak gösterilir. Sadece Sipariş Onayı
// yetkilileri (Ali / Ahmet / Oğuz + üzerinde flag olanlar) görür.

import { useState, useEffect, useMemo } from 'react'
import { Download, TrendingUp, TrendingDown, Building2, FileText } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { arrayToCamel } from '../lib/mapper'
import { Card, CardTitle, Button, Input } from './ui'
import { SkeletonList } from './Skeleton'

const fmtPara = (n) => `₺${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtYuzde = (n) => n == null ? '—' : `${n >= 0 ? '+' : ''}${Number(n).toFixed(1).replace('.', ',')}%`

const karRenk = (yuzde) => yuzde == null ? 'var(--text-tertiary)'
  : yuzde < 0 ? '#dc2626' : yuzde < 15 ? '#f59e0b' : '#10b981'

// Bir siparişin TL karşılığı (para_birimi=TL → aynısı, USD/EUR → doviz_kuru ile çevir)
const tlKarsiligi = (tutar, siparis) => {
  const pb = siparis.paraBirimi || 'TL'
  if (pb === 'TL') return Number(tutar || 0)
  const kur = Number(siparis.dovizKuru || 0)
  return Number(tutar || 0) * (kur > 0 ? kur : 1)
}

export default function SiparisAnalizTab() {
  const [siparisler, setSiparisler] = useState([])
  const [kalemler, setKalemler] = useState([])
  const [musteriler, setMusteriler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [aralikTip, setAralikTip] = useState('bu_ay')  // bu_ay | gecen_ay | yil | ozel
  const [ozelBas, setOzelBas] = useState('')
  const [ozelBit, setOzelBit] = useState('')
  const [altTab, setAltTab] = useState('kar_marj')     // kar_marj | firma

  useEffect(() => {
    (async () => {
      setYukleniyor(true)
      try {
        const [s, k, m] = await Promise.all([
          supabase.from('siparisler').select('*').neq('durum', 'iptal').order('olusturma_tarih', { ascending: false }),
          supabase.from('siparis_kalemleri').select('*'),
          supabase.from('musteriler').select('id, firma, ad, soyad'),
        ])
        setSiparisler(arrayToCamel(s.data || []))
        setKalemler(arrayToCamel(k.data || []))
        setMusteriler(arrayToCamel(m.data || []))
      } catch (e) {
        console.error('[SiparisAnaliz]', e)
      } finally { setYukleniyor(false) }
    })()
  }, [])

  const { basTarih, bitTarih } = useMemo(() => {
    const bugun = new Date()
    if (aralikTip === 'bu_ay') {
      const b = new Date(bugun.getFullYear(), bugun.getMonth(), 1)
      const bt = new Date(bugun.getFullYear(), bugun.getMonth() + 1, 0, 23, 59, 59)
      return { basTarih: b, bitTarih: bt }
    }
    if (aralikTip === 'gecen_ay') {
      const b = new Date(bugun.getFullYear(), bugun.getMonth() - 1, 1)
      const bt = new Date(bugun.getFullYear(), bugun.getMonth(), 0, 23, 59, 59)
      return { basTarih: b, bitTarih: bt }
    }
    if (aralikTip === 'yil') {
      const b = new Date(bugun.getFullYear(), 0, 1)
      const bt = new Date(bugun.getFullYear(), 11, 31, 23, 59, 59)
      return { basTarih: b, bitTarih: bt }
    }
    // ozel
    return {
      basTarih: ozelBas ? new Date(ozelBas + 'T00:00:00') : new Date(2000, 0, 1),
      bitTarih: ozelBit ? new Date(ozelBit + 'T23:59:59') : new Date(),
    }
  }, [aralikTip, ozelBas, ozelBit])

  const filtreli = useMemo(() => {
    return (siparisler || []).filter(s => {
      const t = new Date(s.onayTarihi || s.olusturmaTarih)
      return t >= basTarih && t <= bitTarih
    })
  }, [siparisler, basTarih, bitTarih])

  const kalemMap = useMemo(() => {
    const m = new Map()
    kalemler.forEach(k => {
      const list = m.get(k.siparisId) || []
      list.push(k)
      m.set(k.siparisId, list)
    })
    return m
  }, [kalemler])

  const musteriMap = useMemo(() => {
    const m = new Map()
    musteriler.forEach(x => m.set(x.id, x))
    return m
  }, [musteriler])

  // Her sipariş için TL bazında toplam alış/satış/kar hesapla
  const siparisMetrikler = useMemo(() => {
    return filtreli.map(s => {
      const kalemleriS = kalemMap.get(s.id) || []
      const alisTL = kalemleriS.reduce((t, k) => t + tlKarsiligi(Number(k.miktar || 0) * Number(k.alisFiyat || 0), s), 0)
      const satisTL = kalemleriS.reduce((t, k) => t + tlKarsiligi(Number(k.miktar || 0) * Number(k.birimFiyat || 0), s), 0)
      const karTL = satisTL - alisTL
      const karYuzde = alisTL > 0 ? (karTL / alisTL) * 100 : null
      const musteri = musteriMap.get(s.musteriId)
      return {
        id: s.id,
        siparisNo: s.siparisNo,
        firma: musteri?.firma || musteri?.ad || 'Bilinmiyor',
        musteriId: s.musteriId,
        onayTarihi: s.onayTarihi || s.olusturmaTarih,
        paraBirimi: s.paraBirimi || 'TL',
        alisTL, satisTL, karTL, karYuzde,
        kalemSayisi: kalemleriS.length,
      }
    })
  }, [filtreli, kalemMap, musteriMap])

  const genelKpi = useMemo(() => {
    const alis = siparisMetrikler.reduce((t, s) => t + s.alisTL, 0)
    const satis = siparisMetrikler.reduce((t, s) => t + s.satisTL, 0)
    const kar = satis - alis
    const yuzde = alis > 0 ? (kar / alis) * 100 : null
    return {
      adet: siparisMetrikler.length,
      alis, satis, kar, yuzde,
      dusukMarj: siparisMetrikler.filter(s => s.karYuzde != null && s.karYuzde < 15).length,
      zararli: siparisMetrikler.filter(s => s.karYuzde != null && s.karYuzde < 0).length,
    }
  }, [siparisMetrikler])

  // Firma bazlı gruplama
  const firmaMetrikler = useMemo(() => {
    const m = new Map()
    siparisMetrikler.forEach(s => {
      const key = s.firma
      const g = m.get(key) || { firma: key, adet: 0, alis: 0, satis: 0, kar: 0, kalemSayisi: 0 }
      g.adet += 1
      g.alis += s.alisTL
      g.satis += s.satisTL
      g.kar += s.karTL
      g.kalemSayisi += s.kalemSayisi
      m.set(key, g)
    })
    return [...m.values()].map(g => ({
      ...g,
      karYuzde: g.alis > 0 ? (g.kar / g.alis) * 100 : null,
      ortSepet: g.adet > 0 ? g.satis / g.adet : 0,
    })).sort((a, b) => b.satis - a.satis)
  }, [siparisMetrikler])

  const excelIndir = () => {
    const wb = XLSX.utils.book_new()
    if (altTab === 'kar_marj') {
      const sat = XLSX.utils.json_to_sheet(siparisMetrikler.map(s => ({
        'Sipariş No': s.siparisNo,
        'Firma': s.firma,
        'Onay Tarihi': new Date(s.onayTarihi).toLocaleDateString('tr-TR'),
        'Para Birimi': s.paraBirimi,
        'Kalem': s.kalemSayisi,
        'Toplam Alış (₺)': Number(s.alisTL.toFixed(2)),
        'Toplam Satış (₺)': Number(s.satisTL.toFixed(2)),
        'Kar (₺)': Number(s.karTL.toFixed(2)),
        'Kar %': s.karYuzde != null ? Number(s.karYuzde.toFixed(2)) : null,
      })))
      XLSX.utils.book_append_sheet(wb, sat, 'Sipariş Kâr Analizi')
    } else {
      const sat = XLSX.utils.json_to_sheet(firmaMetrikler.map(f => ({
        'Firma': f.firma,
        'Sipariş Adedi': f.adet,
        'Toplam Kalem': f.kalemSayisi,
        'Toplam Alış (₺)': Number(f.alis.toFixed(2)),
        'Toplam Satış (₺)': Number(f.satis.toFixed(2)),
        'Toplam Kar (₺)': Number(f.kar.toFixed(2)),
        'Kar %': f.karYuzde != null ? Number(f.karYuzde.toFixed(2)) : null,
        'Ortalama Sepet (₺)': Number(f.ortSepet.toFixed(2)),
      })))
      XLSX.utils.book_append_sheet(wb, sat, 'Firma Bazlı Sipariş')
    }
    const ad = altTab === 'kar_marj' ? 'Siparis_Kar_Analizi' : 'Siparis_Firma_Analizi'
    XLSX.writeFile(wb, `${ad}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  if (yukleniyor) return <SkeletonList />

  return (
    <div>
      {/* Filtre çubuğu */}
      <Card style={{ marginBottom: 16, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Tarih Aralığı
          </span>
          {[
            { id: 'bu_ay',    isim: 'Bu Ay' },
            { id: 'gecen_ay', isim: 'Geçen Ay' },
            { id: 'yil',      isim: 'Bu Yıl' },
            { id: 'ozel',     isim: 'Özel' },
          ].map(t => (
            <button key={t.id} onClick={() => setAralikTip(t.id)} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: aralikTip === t.id ? '1px solid #3b82f6' : '1px solid var(--border-default)',
              background: aralikTip === t.id ? '#3b82f6' : 'var(--surface-card)',
              color: aralikTip === t.id ? '#fff' : 'var(--text-primary)',
              cursor: 'pointer',
            }}>{t.isim}</button>
          ))}
          {aralikTip === 'ozel' && (
            <>
              <Input type="date" value={ozelBas} onChange={e => setOzelBas(e.target.value)} style={{ width: 160 }} />
              <span style={{ color: 'var(--text-tertiary)' }}>—</span>
              <Input type="date" value={ozelBit} onChange={e => setOzelBit(e.target.value)} style={{ width: 160 }} />
            </>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {basTarih.toLocaleDateString('tr-TR')} — {bitTarih.toLocaleDateString('tr-TR')}
            </span>
            <Button variant="secondary" size="sm" iconLeft={<Download size={13} />} onClick={excelIndir}>
              Excel indir
            </Button>
          </div>
        </div>
      </Card>

      {/* KPI kartları */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KpiKart etiket="Sipariş Adedi" deger={genelKpi.adet} />
        <KpiKart etiket="Toplam Ciro (TL)" deger={fmtPara(genelKpi.satis)} vurgu />
        <KpiKart etiket="Toplam Alış (TL)" deger={fmtPara(genelKpi.alis)} />
        <KpiKart
          etiket="Toplam Kar (TL)"
          deger={fmtPara(genelKpi.kar)}
          altBilgi={genelKpi.yuzde != null ? fmtYuzde(genelKpi.yuzde) : null}
          altRenk={karRenk(genelKpi.yuzde)}
        />
        <KpiKart etiket="Düşük Marj (<%15)" deger={genelKpi.dusukMarj} altBilgi={genelKpi.zararli > 0 ? `${genelKpi.zararli} zararlı` : null} altRenk="#dc2626" />
      </div>

      {/* Alt sekme */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border-default)' }}>
        {[
          { id: 'kar_marj', isim: 'Kâr / Marj Analizi', ikon: <TrendingUp size={13} /> },
          { id: 'firma',    isim: 'Firma Bazlı Özet',   ikon: <Building2 size={13} /> },
        ].map(t => (
          <button key={t.id} onClick={() => setAltTab(t.id)} style={{
            padding: '10px 16px', border: 'none', background: 'transparent',
            color: altTab === t.id ? '#3b82f6' : 'var(--text-secondary)',
            fontWeight: altTab === t.id ? 700 : 500, fontSize: 13,
            borderBottom: altTab === t.id ? '2px solid #3b82f6' : '2px solid transparent',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
            marginBottom: -1,
          }}>{t.ikon} {t.isim}</button>
        ))}
      </div>

      {altTab === 'kar_marj' ? (
        <KarMarjTablo siparisler={siparisMetrikler} />
      ) : (
        <FirmaTablo firmalar={firmaMetrikler} />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────

function KpiKart({ etiket, deger, vurgu, altBilgi, altRenk }) {
  return (
    <Card style={{ padding: 14 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        {etiket}
      </div>
      <div style={{ fontSize: vurgu ? 20 : 18, fontWeight: 700, color: vurgu ? 'var(--brand-primary)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {deger}
      </div>
      {altBilgi && (
        <div style={{ fontSize: 12, fontWeight: 700, color: altRenk || 'var(--text-tertiary)', marginTop: 4 }}>
          {altBilgi}
        </div>
      )}
    </Card>
  )
}

function KarMarjTablo({ siparisler }) {
  const [sirala, setSirala] = useState({ alan: 'karTL', yon: 'desc' })
  const siralali = useMemo(() => {
    const a = [...siparisler]
    a.sort((x, y) => {
      const va = x[sirala.alan] ?? 0, vb = y[sirala.alan] ?? 0
      return sirala.yon === 'asc' ? va - vb : vb - va
    })
    return a
  }, [siparisler, sirala])

  const th = (alan, label, right) => (
    <th
      onClick={() => setSirala(s => ({ alan, yon: s.alan === alan && s.yon === 'desc' ? 'asc' : 'desc' }))}
      style={{
        textAlign: right ? 'right' : 'left', padding: '10px 8px', cursor: 'pointer',
        color: sirala.alan === alan ? '#3b82f6' : 'var(--text-tertiary)',
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
        userSelect: 'none',
      }}
    >
      {label} {sirala.alan === alan && (sirala.yon === 'desc' ? '↓' : '↑')}
    </th>
  )

  if (siparisler.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Seçilen aralıkta sipariş yok.</div>
  }

  return (
    <Card padding={0}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
          <thead style={{ background: 'var(--surface-subtle)' }}>
            <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
              {th('siparisNo', 'Sipariş No')}
              {th('firma', 'Firma')}
              {th('onayTarihi', 'Tarih')}
              {th('alisTL', 'Alış (TL)', true)}
              {th('satisTL', 'Satış (TL)', true)}
              {th('karTL', 'Kar (TL)', true)}
              {th('karYuzde', 'Kar %', true)}
            </tr>
          </thead>
          <tbody>
            {siralali.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontWeight: 700 }}>{s.siparisNo}</td>
                <td style={{ padding: '10px 8px' }}>{s.firma}</td>
                <td style={{ padding: '10px 8px', color: 'var(--text-tertiary)' }}>
                  {new Date(s.onayTarihi).toLocaleDateString('tr-TR')}
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>{fmtPara(s.alisTL)}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600 }}>{fmtPara(s.satisTL)}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: karRenk(s.karYuzde) }}>{fmtPara(s.karTL)}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: karRenk(s.karYuzde) }}>{fmtYuzde(s.karYuzde)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function FirmaTablo({ firmalar }) {
  if (firmalar.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Seçilen aralıkta firma yok.</div>
  }
  const enBuyukSatis = Math.max(...firmalar.map(f => f.satis), 1)
  return (
    <Card padding={0}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
          <thead style={{ background: 'var(--surface-subtle)' }}>
            <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
              <th style={{ textAlign: 'left',  padding: '10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, width: 24 }}>#</th>
              <th style={{ textAlign: 'left',  padding: '10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Firma</th>
              <th style={{ textAlign: 'right', padding: '10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Sipariş</th>
              <th style={{ textAlign: 'right', padding: '10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Toplam Alış</th>
              <th style={{ textAlign: 'right', padding: '10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Toplam Satış</th>
              <th style={{ textAlign: 'right', padding: '10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Kar (TL)</th>
              <th style={{ textAlign: 'right', padding: '10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Kar %</th>
              <th style={{ textAlign: 'right', padding: '10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Ort. Sepet</th>
              <th style={{ padding: '10px 8px', width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {firmalar.map((f, i) => {
              const oran = (f.satis / enBuyukSatis) * 100
              return (
                <tr key={f.firma} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '10px 8px', color: 'var(--text-tertiary)' }}>{i + 1}</td>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{f.firma}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>{f.adet}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>{fmtPara(f.alis)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>{fmtPara(f.satis)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: karRenk(f.karYuzde) }}>{fmtPara(f.kar)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: karRenk(f.karYuzde) }}>{fmtYuzde(f.karYuzde)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-tertiary)' }}>{fmtPara(f.ortSepet)}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <div style={{ height: 6, background: 'var(--surface-sunken)', borderRadius: 3 }}>
                      <div style={{ width: `${Math.max(oran, 2)}%`, height: '100%', background: '#3b82f6', borderRadius: 3 }} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
