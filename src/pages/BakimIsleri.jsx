// Bakım İşleri — toplu bakım iş emirleri (TABLO görünümü — görevler/görüşmeler gibi).
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wrench, Plus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  topluBakimlariGetir, tbDurumBilgi, kalemBilgi, kalemDurumBilgi, sahaSorumlusuMu,
} from '../services/topluBakimService'
import { Button, Card, EmptyState, Table, THead, TBody, TR, TH, TD } from '../components/ui'
import ComboBox from '../components/ComboBox'

const FILTRELER = [
  { id: 'tumu', isim: 'Tümü' },
  { id: 'planlandi', isim: 'Planlandı' },
  { id: 'atandi', isim: 'Atandı' },
  { id: 'devam_ediyor', isim: 'Devam Ediyor' },
  { id: 'imza_bekleniyor', isim: 'İmza Bekleniyor' },
  { id: 'tamamlandi', isim: 'Tamamlandı' },
  { id: 'iptal', isim: 'İptal' },
]
const DEVAM_GRUBU = ['yola_cikildi', 'lokasyona_ulasildi', 'bakim_basladi', 'devam_ediyor', 'eksik_bakim']
const fmtTarih = (t) => t ? new Date(t + 'T00:00:00').toLocaleDateString('tr-TR') : '—'

export default function BakimIsleri() {
  const { kullanici } = useAuth()
  const navigate = useNavigate()
  const [liste, setListe] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [filtre, setFiltre] = useState('tumu')
  const [musteriFiltre, setMusteriFiltre] = useState('')

  const yukle = useCallback(async () => {
    setYukleniyor(true)
    setListe(await topluBakimlariGetir())
    setYukleniyor(false)
  }, [])
  useEffect(() => { yukle() }, [yukle])

  const filtreli = liste.filter((t) => {
    if (musteriFiltre && !(t.musteriFirma || '').toLocaleLowerCase('tr').includes(musteriFiltre.toLocaleLowerCase('tr'))) return false
    if (filtre === 'tumu') return true
    if (filtre === 'devam_ediyor') return DEVAM_GRUBU.includes(t.durum)
    return t.durum === filtre
  })
  const sayi = (id) => liste.filter((t) =>
    id === 'tumu' ? true : id === 'devam_ediyor' ? DEVAM_GRUBU.includes(t.durum) : t.durum === id
  ).length

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Wrench size={22} strokeWidth={1.8} style={{ color: 'var(--brand-primary)' }} />
          <div>
            <h2 style={{ margin: 0, font: '700 20px/26px var(--font-sans)', color: 'var(--text-primary)' }}>Bakım İşleri</h2>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Toplu bakım operasyonları — bir müşteri + bir lokasyon + bir ziyaret = bir iş emri</div>
          </div>
        </div>
        {sahaSorumlusuMu(kullanici) && (
          <Button variant="primary" onClick={() => navigate('/bakim-isleri/yeni')}>
            <Plus size={15} /> Yeni Toplu Bakım
          </Button>
        )}
      </div>

      <div style={{ maxWidth: 360, marginBottom: 10 }}>
        <ComboBox
          value={musteriFiltre}
          onChange={setMusteriFiltre}
          options={[...new Set(liste.map((t) => t.musteriFirma).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'))}
          allowNew={false}
          placeholder="🔍 Müşteriye göre filtrele…"
        />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTRELER.map((f) => (
          <button key={f.id} onClick={() => setFiltre(f.id)} style={{
            padding: '6px 12px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
            border: '1px solid var(--border-default)',
            background: filtre === f.id ? 'var(--brand-primary)' : 'var(--surface-card)',
            color: filtre === f.id ? '#fff' : 'var(--text-secondary)',
            font: '600 12px/16px var(--font-sans)',
          }}>
            {f.isim} · {sayi(f.id)}
          </button>
        ))}
      </div>

      {yukleniyor ? (
        <Card style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</Card>
      ) : filtreli.length === 0 ? (
        <EmptyState icon={<Wrench size={40} />} title="Bu filtrede bakım işi yok"
          description={sahaSorumlusuMu(kullanici) ? '"Yeni Toplu Bakım" ile ilk iş emrini oluşturabilirsiniz.' : 'Size atanan bakım işleri burada görünecek.'} />
      ) : (
        <Card style={{ padding: 0, overflowX: 'auto' }}>
          <Table>
            <THead>
              <TR>
                <TH>Bakım No</TH>
                <TH>Müşteri</TH>
                <TH>Lokasyon</TH>
                <TH>Planlanan</TH>
                <TH>Bakımlar</TH>
                <TH>Sonuç</TH>
                <TH>Durum</TH>
              </TR>
            </THead>
            <TBody>
              {filtreli.map((t) => {
                const d = tbDurumBilgi(t.durum)
                const tamam = (t.kalemler || []).filter((k) => ['tamamlandi', 'ariza_tespit', 'yapilamadi'].includes(k.durum)).length
                const arizaVar = (t.kalemler || []).some((k) => k.arizaVar)
                return (
                  <TR key={t.id} onClick={() => navigate(`/bakim-isleri/${t.id}`)} style={{ cursor: 'pointer' }}>
                    <TD><span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--brand-primary)' }}>{t.tbNo}</span></TD>
                    <TD style={{ fontWeight: 600 }}>{t.musteriFirma || '—'}</TD>
                    <TD>{t.lokasyonAdi || '—'}</TD>
                    <TD style={{ whiteSpace: 'nowrap' }}>{fmtTarih(t.planlananTarih)}{t.planlananSaat ? ` ${t.planlananSaat}` : ''}</TD>
                    <TD>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {(t.kalemler || []).map((k) => {
                          const kb = kalemBilgi(k.kalemTip)
                          const kd = kalemDurumBilgi(k.durum)
                          return (
                            // Nötr çip — durum bilgisi yalnız soldaki küçük noktada (renk cümbüşü yerine)
                            <span key={k.id} title={`${kb.isim} — ${kd.isim}`} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              fontSize: 11, fontWeight: 600, padding: '2px 8px',
                              borderRadius: 'var(--radius-pill)',
                              border: '1px solid var(--border-default)',
                              background: 'var(--surface-card)',
                              color: 'var(--text-secondary)', whiteSpace: 'nowrap',
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: kd.renk, flexShrink: 0 }} />
                              {kb.isim}
                            </span>
                          )
                        })}
                      </div>
                    </TD>
                    <TD style={{ whiteSpace: 'nowrap' }}>{tamam}/{(t.kalemler || []).length}{arizaVar ? ' ⚠️' : ''}</TD>
                    <TD>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 'var(--radius-pill)',
                        background: `${d.renk}1a`, color: d.renk, whiteSpace: 'nowrap',
                      }}>
                        {d.isim}
                      </span>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
