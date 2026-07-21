// Servis raporu yazdir entry page.
// Route: /servis-talepleri/:id/servis-formu?sirket=zna|anadolunet
//
// Personel servis talep detayinda 'Form Cikti' butonuna basinca acilir.
// Yeni sekmede acilir, talep verisini ceker, ServisFormu'na pass eder, ust
// kosede print + sirket switcher gosterir.

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { servisTalepGetir } from '../services/servisService'
import { servisMalzemeleriGetir } from '../services/servisMalzemeService'
import ServisFormu from './servisCikti/ServisFormu'

const SIRKETLER = [
  { id: 'zna',        label: 'ZNA Teknoloji' },
  { id: 'anadolunet', label: 'Anadolunet' },
]

export default function ServisFormuYazdir() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const sirketParam = searchParams.get('sirket') || 'zna'
  const [seciliSirket, setSeciliSirket] = useState(sirketParam)
  const [talep, setTalep] = useState(null)
  const [malzemeler, setMalzemeler] = useState([])
  const [hata, setHata] = useState(null)

  useEffect(() => {
    let iptal = false
    servisTalepGetir(id)
      .then(d => { if (!iptal) setTalep(d) })
      .catch(e => { if (!iptal) setHata(e?.message ?? 'Talep yuklenemedi') })
    // Envanterden kullanılan malzeme/cihazlar — formda ayrı tablo olarak basılır
    servisMalzemeleriGetir(id)
      .then(m => { if (!iptal) setMalzemeler((m || []).filter(x => x.durum === 'kullanildi')) })
      .catch(() => {})
    return () => { iptal = true }
  }, [id])

  // Sirket degisince URL'i guncelle (refresh sonrasi secim korunsun)
  const sirketDegistir = (sirket) => {
    setSeciliSirket(sirket)
    setSearchParams({ sirket }, { replace: true })
  }

  if (hata) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#c00' }}>Hata: {hata}</div>
  }
  if (!talep) {
    return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial' }}>Yükleniyor…</div>
  }

  return (
    <>
      {/* Sirket switcher — sol ust */}
      <div className="no-print" style={{
        position: 'fixed', top: 16, left: 16, zIndex: 999,
        background: '#fff', borderRadius: 8, padding: '8px 12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Şirket:</span>
        <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden' }}>
          {SIRKETLER.map((s, i) => {
            const aktif = seciliSirket === s.id
            return (
              <button
                key={s.id}
                onClick={() => sirketDegistir(s.id)}
                style={{
                  padding: '6px 14px', fontSize: 12,
                  fontWeight: aktif ? 700 : 500,
                  color: aktif ? '#fff' : '#475569',
                  background: aktif ? '#0176D3' : '#fff',
                  border: '1px solid ' + (aktif ? '#0176D3' : '#cbd5e1'),
                  cursor: 'pointer',
                  borderTopLeftRadius:    i === 0 ? 6 : 0,
                  borderBottomLeftRadius: i === 0 ? 6 : 0,
                  borderTopRightRadius:    i === SIRKETLER.length - 1 ? 6 : 0,
                  borderBottomRightRadius: i === SIRKETLER.length - 1 ? 6 : 0,
                  marginLeft: i > 0 ? -1 : 0,
                }}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Yazdir butonu — sag ust */}
      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 999 }}>
        <button
          onClick={() => window.print()}
          style={{
            background: '#0176D3', color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 18px', fontSize: 13,
            cursor: 'pointer', fontWeight: 600,
          }}
        >
          🖨 Yazdır / PDF
        </button>
        <button
          onClick={() => window.close()}
          style={{
            background: '#f1f5f9', color: '#475569', border: 'none',
            borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer',
          }}
        >
          Kapat
        </button>
      </div>

      <ServisFormu talep={talep} sirket={seciliSirket} malzemeler={malzemeler} />
    </>
  )
}
