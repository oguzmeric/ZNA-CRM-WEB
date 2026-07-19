// Görev performans raporu (spek madde 36) — kişi bazlı; sadece sayı değil,
// öncelik AĞIRLIKLI puan da hesaplanır (kritik görev ≠ düşük görev).
import { useState, useEffect, useMemo } from 'react'
import { gorevleriGetir } from '../../services/gorevService'
import { oncelikBilgi, KAPALI_DURUMLAR, gorevGecikti } from '../../lib/gorevSabitleri'
import { Card, CardTitle } from '../ui'

const ARALIKLAR = [
  { id: 30, isim: 'Son 30 gün' },
  { id: 90, isim: 'Son 90 gün' },
  { id: 365, isim: 'Son 1 yıl' },
  { id: 0, isim: 'Tüm zamanlar' },
]

export default function GorevPerformansTab({ kullanicilar }) {
  const [gorevler, setGorevler] = useState([])
  const [aralik, setAralik] = useState(90)
  const [yukleniyor, setYukleniyor] = useState(true)

  useEffect(() => {
    gorevleriGetir().then(setGorevler).finally(() => setYukleniyor(false))
  }, [])

  const satirlar = useMemo(() => {
    const esik = aralik ? Date.now() - aralik * 86400000 : 0
    const kapsam = gorevler.filter(g =>
      g.durum !== 'taslak' && (!esik || new Date(g.olusturmaTarih || 0).getTime() >= esik))

    const kisiler = new Map()
    for (const g of kapsam) {
      const kid = String(g.atananId ?? g.atanan ?? '')
      if (!kid) continue
      if (!kisiler.has(kid)) {
        kisiler.set(kid, {
          kid, ad: g.atananAd || kullanicilar?.find(k => String(k.id) === kid)?.ad || `#${kid}`,
          atanan: 0, tamamlanan: 0, zamaninda: 0, geciken: 0, acik: 0,
          reddedilen: 0, devredilen: 0, revize: 0, altGorev: 0,
          puan: 0, sureToplam: 0, sureSayac: 0, gecikmeToplam: 0, gecikmeSayac: 0,
        })
      }
      const s = kisiler.get(kid)
      const agirlik = oncelikBilgi(g.oncelik).agirlik
      s.atanan++
      if (g.ustGorevId) s.altGorev++
      if (g.devredenId) s.devredilen++
      if (g.onayDurumu === 'revize' || g.durum === 'revize') s.revize++
      if (g.durum === 'reddedildi') s.reddedilen++
      if (g.durum === 'tamamlandi') {
        s.tamamlanan++
        s.puan += agirlik
        const bitis = g.tamamlanmaTarihi ? String(g.tamamlanmaTarihi).slice(0, 10) : null
        const hedef = g.sonTarih ? String(g.sonTarih).slice(0, 10) : null
        if (bitis && hedef) {
          if (bitis <= hedef) { s.zamaninda++; s.puan += agirlik }
          else {
            const gec = Math.round((new Date(bitis) - new Date(hedef)) / 86400000)
            s.gecikmeToplam += gec; s.gecikmeSayac++
          }
        }
        if (g.olusturmaTarih && g.tamamlanmaTarihi) {
          s.sureToplam += Math.max(0, (new Date(g.tamamlanmaTarihi) - new Date(g.olusturmaTarih)) / 86400000)
          s.sureSayac++
        }
      } else if (!KAPALI_DURUMLAR.includes(g.durum)) {
        s.acik++
        if (gorevGecikti(g)) { s.geciken++; s.puan -= agirlik }
      }
    }

    return [...kisiler.values()]
      .filter(s => s.atanan > 0)
      .map(s => ({
        ...s,
        zamanindaOran: s.tamamlanan ? Math.round((s.zamaninda / s.tamamlanan) * 100) : null,
        ortSure: s.sureSayac ? (s.sureToplam / s.sureSayac).toFixed(1) : null,
        ortGecikme: s.gecikmeSayac ? (s.gecikmeToplam / s.gecikmeSayac).toFixed(1) : null,
      }))
      .sort((a, b) => b.puan - a.puan)
  }, [gorevler, aralik, kullanicilar])

  if (yukleniyor) return <p className="t-caption">Yükleniyor…</p>

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <div>
          <CardTitle>Görev Performansı</CardTitle>
          <p className="t-caption" style={{ marginTop: 2 }}>
            Puan öncelik ağırlıklıdır: kritik görevi zamanında bitirmek, düşük öncelikli görevden çok daha değerlidir; geciken açık görev puan düşürür.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {ARALIKLAR.map(a => (
            <button key={a.id} onClick={() => setAralik(a.id)} style={{
              padding: '5px 12px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
              font: '600 12px/16px var(--font-sans)',
              background: aralik === a.id ? 'var(--brand-primary)' : 'var(--surface-sunken)',
              color: aralik === a.id ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--border-default)',
            }}>{a.isim}</button>
          ))}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr>
              {['Kişi', 'Puan', 'Atanan', 'Tamamlanan', 'Zamanında', 'Zamanında %', 'Geciken (açık)', 'Açık', 'Reddedilen', 'Devreden', 'Revize', 'Alt Görev', 'Ort. Süre (gün)', 'Ort. Gecikme (gün)'].map(b => (
                <th key={b} className="t-label" style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid var(--border-default)', whiteSpace: 'nowrap' }}>{b}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {satirlar.map(s => (
              <tr key={s.kid} style={{ borderBottom: '1px solid var(--border-default)' }}>
                <td style={{ padding: '8px 10px', font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{s.ad}</td>
                <td className="tabular-nums" style={{ padding: '8px 10px', font: '700 13px/18px var(--font-sans)', color: s.puan >= 0 ? 'var(--success)' : 'var(--danger)' }}>{s.puan}</td>
                <td className="tabular-nums" style={{ padding: '8px 10px' }}>{s.atanan}</td>
                <td className="tabular-nums" style={{ padding: '8px 10px' }}>{s.tamamlanan}</td>
                <td className="tabular-nums" style={{ padding: '8px 10px' }}>{s.zamaninda}</td>
                <td className="tabular-nums" style={{ padding: '8px 10px', color: s.zamanindaOran === null ? 'var(--text-tertiary)' : s.zamanindaOran >= 80 ? 'var(--success)' : s.zamanindaOran >= 50 ? 'var(--warning)' : 'var(--danger)', fontWeight: 600 }}>
                  {s.zamanindaOran === null ? '—' : `%${s.zamanindaOran}`}
                </td>
                <td className="tabular-nums" style={{ padding: '8px 10px', color: s.geciken ? 'var(--danger)' : 'inherit', fontWeight: s.geciken ? 700 : 400 }}>{s.geciken}</td>
                <td className="tabular-nums" style={{ padding: '8px 10px' }}>{s.acik}</td>
                <td className="tabular-nums" style={{ padding: '8px 10px' }}>{s.reddedilen}</td>
                <td className="tabular-nums" style={{ padding: '8px 10px' }}>{s.devredilen}</td>
                <td className="tabular-nums" style={{ padding: '8px 10px' }}>{s.revize}</td>
                <td className="tabular-nums" style={{ padding: '8px 10px' }}>{s.altGorev}</td>
                <td className="tabular-nums" style={{ padding: '8px 10px' }}>{s.ortSure ?? '—'}</td>
                <td className="tabular-nums" style={{ padding: '8px 10px' }}>{s.ortGecikme ?? '—'}</td>
              </tr>
            ))}
            {satirlar.length === 0 && (
              <tr><td colSpan={14} style={{ padding: 16, textAlign: 'center' }} className="t-caption">Bu aralıkta veri yok.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
