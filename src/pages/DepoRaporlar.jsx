// Teknisyen aylık depo raporu + servisteki ürünler.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { BarChart3, Truck, PackageCheck, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { teknisyenAylikRapor, acikRMAlar, rmaGeriDondu, RMA_SONUCLARI } from '../services/depoService'
import { Button, Card, Badge, EmptyState, Table, THead, TBody, TR, TH, TD, CodeBadge } from '../components/ui'
import { SkeletonList } from '../components/Skeleton'
import { useToast } from '../context/ToastContext'

const buAy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'
const fmtTarihSaat = (t) => t
  ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—'

export default function DepoRaporlar() {
  const { toast } = useToast()
  const [personel, setPersonel] = useState([])
  const [seciliId, setSeciliId] = useState('')
  const [ay, setAy] = useState(buAy())
  const [rapor, setRapor] = useState(null)
  const [rmalar, setRmalar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [donusModal, setDonusModal] = useState(null)  // { rma }

  const rmalariYenile = () => acikRMAlar().then(setRmalar).catch(e => console.error(e))

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
            <THead><TR><TH>SN</TH><TH>Ürün</TH><TH>Tedarikçi</TH><TH>Kargo</TH><TH>Gönderim</TH><TH>Tahmini Dönüş</TH><TH style={{ textAlign: 'right' }}>İşlem</TH></TR></THead>
            <TBody>
              {rmalar.map(r => (
                <TR key={r.id}>
                  <TD><CodeBadge>{r.kalem?.seri_no || '—'}</CodeBadge></TD>
                  <TD>{[r.kalem?.marka, r.kalem?.model].filter(Boolean).join(' ')}</TD>
                  <TD>{r.tedarikci_ad}</TD>
                  <TD>{r.kargo_no || '—'}</TD>
                  <TD>{fmtTarih(r.gonderim_tarih)}</TD>
                  <TD>{r.tahmini_donus ? fmtTarih(r.tahmini_donus) : '—'}</TD>
                  <TD style={{ textAlign: 'right' }}>
                    <Button size="sm" variant="secondary" iconLeft={<PackageCheck size={12} strokeWidth={1.5} />}
                      onClick={() => setDonusModal({ rma: r })}>
                      Servisten Döndü
                    </Button>
                  </TD>
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
                  <TD>{fmtTarihSaat(h.tarih)}</TD>
                  <TD><CodeBadge>{h.stok_kodu}</CodeBadge></TD>
                  <TD><Badge tone="neutral">{h.hareket_tipi}</Badge></TD>
                  <TD style={{ fontSize: 12 }}>{h.aciklama}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {donusModal && (
        <ServisDonusModal
          rma={donusModal.rma}
          onKapat={() => setDonusModal(null)}
          onKaydet={async (payload) => {
            try {
              await rmaGeriDondu(donusModal.rma.id, payload)
              toast.success('Servisten dönüş işlendi.')
              setDonusModal(null)
              await rmalariYenile()
            } catch (e) {
              toast.error(e?.message || 'İşlem hatası')
            }
          }}
        />
      )}
    </div>
  )
}

function ServisDonusModal({ rma, onKapat, onKaydet }) {
  const [sonuc, setSonuc] = useState('onarildi')
  const [notlar, setNotlar] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const kaydet = async () => {
    setKaydediliyor(true)
    try { await onKaydet({ sonuc, notlar }) }
    finally { setKaydediliyor(false) }
  }
  const sn = rma?.kalem?.seri_no || '—'
  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface-card)', color: 'var(--text-primary)',
        borderRadius: 12, padding: 24, maxWidth: 520, width: '100%', maxHeight: '85vh', overflow: 'auto',
        border: '1px solid var(--border-default)',
      }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>Servisten Döndü — Sonucu İşle</h3>
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16, fontFamily: 'monospace' }}>
          SN: {sn} — {rma.tedarikci_ad}
        </div>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6 }}>Sonuç</label>
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
          Onarıldı/Değiştirildi → depoya alınır. Kabul edilmedi → hurda. İptal → durum değişmez.
        </div>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginTop: 14, marginBottom: 6 }}>Notlar</label>
        <textarea rows={2} value={notlar} onChange={e => setNotlar(e.target.value)}
          placeholder="Fatura no, garanti kapsamı, dönüş bilgisi vb."
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            border: '1px solid var(--border-default)', background: 'var(--surface-sunken)',
            color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box',
            resize: 'vertical', fontFamily: 'inherit',
          }} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <Button variant="secondary" size="sm" onClick={onKapat}>İptal</Button>
          <Button variant="primary" size="sm" onClick={kaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Kaydediliyor…' : 'İşle'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const selectStil = {
  padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--border-default)', background: 'var(--surface-sunken)',
  color: 'var(--text-primary)', fontSize: 14,
}
