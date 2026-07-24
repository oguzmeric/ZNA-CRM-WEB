// Bakım İşleri — toplu bakım iş emirleri listesi (Servis'ten TAMAMEN AYRI menü).
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wrench, Plus, MapPin, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  topluBakimlariGetir, tbDurumBilgi, kalemBilgi, kalemDurumBilgi,
  sahaSorumlusuMu, TB_DURUMLAR,
} from '../services/topluBakimService'
import { Button, Card, EmptyState } from '../components/ui'

const FILTRELER = [
  { id: 'tumu', isim: 'Tümü' },
  { id: 'planlandi', isim: 'Planlandı' },
  { id: 'atandi', isim: 'Atandı' },
  { id: 'devam_ediyor', isim: 'Devam Ediyor' },
  { id: 'imza_bekleniyor', isim: 'İmza Bekleniyor' },
  { id: 'tamamlandi', isim: 'Tamamlandı' },
  { id: 'iptal', isim: 'İptal' },
]

// Saha durumları tek "devam ediyor" şemsiyesinde filtrelensin
const DEVAM_GRUBU = ['yola_cikildi', 'lokasyona_ulasildi', 'bakim_basladi', 'devam_ediyor', 'eksik_bakim']

const fmtTarih = (t) => t ? new Date(t + 'T00:00:00').toLocaleDateString('tr-TR') : '—'

export default function BakimIsleri() {
  const { kullanici } = useAuth()
  const navigate = useNavigate()
  const [liste, setListe] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [filtre, setFiltre] = useState('tumu')

  const yukle = useCallback(async () => {
    setYukleniyor(true)
    const l = await topluBakimlariGetir()
    setListe(l)
    setYukleniyor(false)
  }, [])

  useEffect(() => { yukle() }, [yukle])

  const filtreli = liste.filter((t) => {
    if (filtre === 'tumu') return true
    if (filtre === 'devam_ediyor') return DEVAM_GRUBU.includes(t.durum)
    return t.durum === filtre
  })

  const sayi = (id) => liste.filter((t) =>
    id === 'tumu' ? true : id === 'devam_ediyor' ? DEVAM_GRUBU.includes(t.durum) : t.durum === id
  ).length

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
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

      {/* Filtre çipleri */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTRELER.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltre(f.id)}
            style={{
              padding: '6px 12px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
              border: '1px solid var(--border-default)',
              background: filtre === f.id ? 'var(--brand-primary)' : 'var(--surface-card)',
              color: filtre === f.id ? '#fff' : 'var(--text-secondary)',
              font: '600 12px/16px var(--font-sans)',
            }}
          >
            {f.isim} · {sayi(f.id)}
          </button>
        ))}
      </div>

      {yukleniyor ? (
        <Card style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</Card>
      ) : filtreli.length === 0 ? (
        <EmptyState
          icon={<Wrench size={40} />}
          title="Bu filtrede bakım işi yok"
          description={sahaSorumlusuMu(kullanici)
            ? '"Yeni Toplu Bakım" ile ilk iş emrini oluşturabilirsiniz.'
            : 'Size atanan bakım işleri burada görünecek.'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtreli.map((t) => {
            const d = tbDurumBilgi(t.durum)
            const tamam = (t.kalemler || []).filter((k) => k.durum === 'tamamlandi').length
            const toplam = (t.kalemler || []).length
            return (
              <Card
                key={t.id}
                onClick={() => navigate(`/bakim-isleri/${t.id}`)}
                style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--brand-primary)' }}>{t.tbNo}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 'var(--radius-pill)',
                      background: `${d.renk}1a`, color: d.renk,
                    }}>
                      {d.isim}
                    </span>
                    {t.oncelik === 'acil' && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 'var(--radius-pill)', background: '#ef44441a', color: '#ef4444' }}>
                        🔥 ACİL
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {fmtTarih(t.planlananTarih)}{t.planlananSaat ? ` · ${t.planlananSaat}` : ''}
                  </span>
                </div>

                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                  {t.musteriFirma || '—'}
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)' }}>
                  {t.lokasyonAdi && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={12} /> {t.lokasyonAdi}
                    </span>
                  )}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <User size={12} /> Kalemler: {tamam}/{toplam} tamamlandı
                  </span>
                </div>

                {/* Kalem çipleri */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(t.kalemler || []).map((k) => {
                    const kb = kalemBilgi(k.kalemTip)
                    const kd = kalemDurumBilgi(k.durum)
                    return (
                      <span
                        key={k.id}
                        title={kd.isim}
                        style={{
                          fontSize: 11, fontWeight: 600, padding: '3px 9px',
                          borderRadius: 6, border: `1px solid ${kd.renk}55`,
                          background: `${kd.renk}12`, color: 'var(--text-secondary)',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        {kb.ikon} {kb.isim}
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: kd.renk }} />
                        {k.arizaVar && <span title="Arıza tespit edildi">⚠️</span>}
                      </span>
                    )
                  })}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
