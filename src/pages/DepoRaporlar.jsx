// Teknisyen aylık depo raporu + açık RMA'lar.
import { useEffect, useState } from 'react'
import { BarChart3, Truck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { teknisyenAylikRapor, acikRMAlar } from '../services/depoService'
import { Card, Badge, EmptyState, Table, THead, TBody, TR, TH, TD, CodeBadge } from '../components/ui'
import { SkeletonList } from '../components/Skeleton'

const buAy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'

export default function DepoRaporlar() {
  const [personel, setPersonel] = useState([])
  const [seciliId, setSeciliId] = useState('')
  const [ay, setAy] = useState(buAy())
  const [rapor, setRapor] = useState(null)
  const [rmalar, setRmalar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('kullanicilar').select('id, ad, rol').order('ad'),
      acikRMAlar(),
    ])
      .then(([r1, r2]) => {
        const list = (r1?.data || []).filter(k => !/\b(oğuz|oguz|ali|ferdi)\b/i.test(k.ad || ''))
        setPersonel(list)
        setRmalar(r2 || [])
        if (list.length) setSeciliId(list[0].id)
      })
      .catch(e => console.error('[DepoRaporlar]', e))
      .finally(() => setYukleniyor(false))
  }, [])

  useEffect(() => {
    if (!seciliId || !ay) return
    teknisyenAylikRapor(seciliId, ay).then(setRapor).catch(e => console.error('[rapor]', e))
  }, [seciliId, ay])

  if (yukleniyor) return <SkeletonList />

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <BarChart3 size={22} strokeWidth={1.5} />
        <h1 className="t-h2" style={{ margin: 0 }}>Depo Raporları</h1>
      </div>

      {/* Açık RMA */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Truck size={16} strokeWidth={1.5} />
          <h3 className="t-h2" style={{ fontSize: 14, margin: 0 }}>Servisteki Ürünler — Dönüş Bekleniyor ({rmalar.length})</h3>
        </div>
        {rmalar.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: 8 }}>Servisten dönüşü bekleyen kayıt yok.</div>
        ) : (
          <Table>
            <THead><TR><TH>SN</TH><TH>Ürün</TH><TH>Tedarikçi</TH><TH>Kargo</TH><TH>Gönderim</TH><TH>Tahmini Dönüş</TH></TR></THead>
            <TBody>
              {rmalar.map(r => (
                <TR key={r.id}>
                  <TD><CodeBadge>{r.kalem?.seri_no || '—'}</CodeBadge></TD>
                  <TD>{[r.kalem?.marka, r.kalem?.model].filter(Boolean).join(' ')}</TD>
                  <TD>{r.tedarikci_ad}</TD>
                  <TD>{r.kargo_no || '—'}</TD>
                  <TD>{fmtTarih(r.gonderim_tarih)}</TD>
                  <TD>{r.tahmini_donus ? fmtTarih(r.tahmini_donus) : '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Teknisyen aylık */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <h3 className="t-h2" style={{ fontSize: 14, margin: 0 }}>Teknisyen Aylık Rapor</h3>
          <select value={seciliId} onChange={e => setSeciliId(Number(e.target.value))} style={selectStil}>
            {personel.map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
          </select>
          <input type="month" value={ay} onChange={e => setAy(e.target.value)} style={{ ...selectStil, maxWidth: 160 }} />
        </div>
        {rapor && (
          <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
            <div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Toplam Hareket</div><div style={{ fontWeight: 700, fontSize: 22 }}>{rapor.ozet.toplam}</div></div>
            <div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Çıkış</div><div style={{ fontWeight: 700, fontSize: 22, color: '#a855f7' }}>{rapor.ozet.cikis}</div></div>
            <div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>İade</div><div style={{ fontWeight: 700, fontSize: 22, color: 'var(--success)' }}>{rapor.ozet.giris}</div></div>
            <div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Arıza</div><div style={{ fontWeight: 700, fontSize: 22, color: '#f59e0b' }}>{rapor.ozet.ariza}</div></div>
          </div>
        )}
        {!rapor || rapor.hareketler.length === 0 ? (
          <EmptyState icon={<BarChart3 size={40} strokeWidth={1.5} />} title="Bu ay hareket yok" description="Farklı bir ay veya teknisyen seç." />
        ) : (
          <Table>
            <THead><TR><TH>Tarih</TH><TH>Stok Kodu</TH><TH>Tip</TH><TH>Açıklama</TH></TR></THead>
            <TBody>
              {rapor.hareketler.map(h => (
                <TR key={h.id}>
                  <TD>{fmtTarih(h.tarih)}</TD>
                  <TD><CodeBadge>{h.stok_kodu}</CodeBadge></TD>
                  <TD><Badge tone="neutral">{h.hareket_tipi}</Badge></TD>
                  <TD style={{ fontSize: 12 }}>{h.aciklama}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

const selectStil = {
  padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--border-default)', background: 'var(--surface-sunken)',
  color: 'var(--text-primary)', fontSize: 14,
}
