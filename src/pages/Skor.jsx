// Servis performans paneli — ofis ekranında kiosk mod. Login yok.
// Teknisyen bazlı: her satır bir teknisyenin dönem içi tamamlanmış servis sayısını gösterir.
// Yarış/ödül vurgusu yok — düz performans dashboard'u.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// TR = UTC+3, toISOString() UTC'ye çevirdiği için local midnight bir gün geri gidebiliyor.
// Local date string üretmek için manuel format.
const localTarih = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const gg = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${gg}`
}
const bugunBaslangic = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
const haftaBaslangic = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const gun = d.getDay()
  const fark = gun === 0 ? 6 : gun - 1
  d.setDate(d.getDate() - fark)
  return d
}
const ayBaslangic = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(1)
  return d
}

const SEKMELER = [
  { id: 'bugun',  isim: 'Bugün',    baslangic: bugunBaslangic },
  { id: 'hafta',  isim: 'Bu Hafta', baslangic: haftaBaslangic },
  { id: 'ay',     isim: 'Bu Ay',    baslangic: ayBaslangic    },
]

const inisyaller = (ad) => (ad || '?').split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('')

const telFormat = (t) => {
  if (!t) return null
  const d = String(t).replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0,4)} ${d.slice(4,7)} ${d.slice(7,9)} ${d.slice(9)}`
  if (d.length === 10) return `0${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6,8)} ${d.slice(8)}`
  return t
}

function useTicTac() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])
  return now
}

export default function Skor() {
  const [sekme, setSekme] = useState('ay')
  const [siralamaMap, setSiralamaMap] = useState({ bugun: [], hafta: [], ay: [] })
  const [tazeleniyor, setTazeleniyor] = useState(false)
  const [sonTazeleme, setSonTazeleme] = useState(null)
  const now = useTicTac()

  const yukle = async () => {
    setTazeleniyor(true)
    try { await yukleIcerik() } finally {
      setTazeleniyor(false)
      setSonTazeleme(new Date())
    }
  }

  const yukleIcerik = async () => {
    const bugun = localTarih(bugunBaslangic())
    const hafta = localTarih(haftaBaslangic())
    const ay    = localTarih(ayBaslangic())
    // "Bugün" için bitis = bugün (RPC between inclusive, tek gün alsın)
    // Hafta/Ay için bitis yine bugün (bu satırlar dahil, ileri tarih anlamsız)
    const bitisBugun = bugun
    const [rBugun, rHafta, rAy] = await Promise.all([
      supabase.rpc('skor_liderlik', { baslangic: bugun, bitis: bitisBugun }),
      supabase.rpc('skor_liderlik', { baslangic: hafta, bitis: bitisBugun }),
      supabase.rpc('skor_liderlik', { baslangic: ay,    bitis: bitisBugun }),
    ])
    const donusum = (rows) => (rows || []).map(r => ({
      id: r.kim,
      ad: r.kim,
      fotoUrl: r.foto_url || null,
      unvan: r.unvan || 'Teknisyen',
      telefon: r.telefon || null,
      sayi: Number(r.sayi || 0),
    }))
    setSiralamaMap({
      bugun: donusum(rBugun.data),
      hafta: donusum(rHafta.data),
      ay:    donusum(rAy.data),
    })
  }

  useEffect(() => { yukle() }, [])

  // Her 5 dakikada bir tazele (kiosk uzun süre açık kalır, Realtime bağlantısı düşerse buradan yeniden çeker)
  useEffect(() => {
    const t = setInterval(() => yukle(), 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const k1 = supabase
      .channel('skor-servis-talep')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servis_talepleri' }, () => yukle())
      .subscribe()
    const k2 = supabase
      .channel('skor-servis-rapor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servis_raporlari' }, () => yukle())
      .subscribe()
    return () => { k1?.unsubscribe?.(); k2?.unsubscribe?.() }
  }, [])

  const aktif = SEKMELER.find(s => s.id === sekme)
  const sira = siralamaMap[sekme] || []
  const toplam = sira.reduce((s, x) => s + x.sayi, 0)
  const enUst = sira[0]?.sayi || 1

  const saat = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  const tarih = now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0B1220',
      color: '#E5E9F4',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '28px 40px 32px',
      display: 'flex', flexDirection: 'column', gap: 22,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 20 }}>
        <div>
          <div style={{ fontSize: 13, color: '#7A8AA8', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, marginBottom: 6 }}>
            ZNA Teknoloji · Servis Ekibi
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 0.2 }}>
            Teknisyen Performans Paneli
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: 1, fontVariantNumeric: 'tabular-nums', color: '#E5E9F4' }}>{saat}</div>
          <div style={{ fontSize: 13, color: '#7A8AA8', marginTop: 2, textTransform: 'capitalize' }}>{tarih}</div>
        </div>
      </div>

      {/* Sekmeler + özet */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 3 }}>
          {SEKMELER.map(s => {
            const on = sekme === s.id
            return (
              <button
                key={s.id}
                onClick={() => setSekme(s.id)}
                style={{
                  padding: '10px 22px',
                  borderRadius: 8,
                  background: on ? '#1E3A5F' : 'transparent',
                  border: 'none', cursor: 'pointer',
                  color: on ? '#fff' : '#7A8AA8',
                  fontSize: 14, fontWeight: on ? 600 : 500,
                  transition: 'all 150ms',
                }}
              >
                {s.isim}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 24, fontSize: 13, color: '#7A8AA8', alignItems: 'center' }}>
          <div>
            Toplam: <strong style={{ color: '#fff', fontSize: 20, fontVariantNumeric: 'tabular-nums', marginLeft: 4 }}>{toplam}</strong> servis
          </div>
          <div>
            Teknisyen: <strong style={{ color: '#fff', fontSize: 20, fontVariantNumeric: 'tabular-nums', marginLeft: 4 }}>{sira.length}</strong>
          </div>
          <button
            onClick={yukle}
            disabled={tazeleniyor}
            title={sonTazeleme ? `Son güncelleme: ${sonTazeleme.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Sayfayı güncelle'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 10,
              background: tazeleniyor ? 'rgba(255,255,255,0.06)' : 'rgba(59,130,246,0.15)',
              border: '1px solid ' + (tazeleniyor ? 'rgba(255,255,255,0.08)' : 'rgba(59,130,246,0.35)'),
              color: '#93c5fd', fontSize: 14, fontWeight: 600,
              cursor: tazeleniyor ? 'default' : 'pointer',
              opacity: tazeleniyor ? 0.6 : 1,
              transition: 'all 150ms',
            }}
          >
            <span style={{
              display: 'inline-block',
              transformOrigin: '50% 50%',
              animation: tazeleniyor ? 'sk-dondur 1s linear infinite' : 'none',
            }}>↻</span>
            <span>{tazeleniyor ? 'Güncelleniyor…' : 'Güncelle'}</span>
          </button>
        </div>
        <style>{`@keyframes sk-dondur { to { transform: rotate(360deg) } }`}</style>
      </div>

      {/* Liste */}
      {sira.length === 0 ? (
        <div style={{ padding: 80, textAlign: 'center', color: '#7A8AA8', fontSize: 15, background: 'rgba(255,255,255,0.02)', borderRadius: 12 }}>
          {aktif.isim} döneminde henüz tamamlanan servis kaydı yok.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sira.map((p, i) => {
            const yuzde = enUst > 0 ? (p.sayi / enUst) * 100 : 0
            return (
              <div key={p.id} style={{
                display: 'grid',
                gridTemplateColumns: '48px 64px 1fr 220px 120px',
                alignItems: 'center', gap: 20,
                padding: '14px 20px',
                background: i === 0 ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.03)',
                borderRadius: 12,
                border: `1px solid ${i === 0 ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.05)'}`,
              }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: i === 0 ? '#60A5FA' : '#7A8AA8', fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>
                  {i + 1}
                </div>
                {p.fotoUrl ? (
                  <img src={p.fotoUrl} alt={p.ad} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.1)' }} />
                ) : (
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.06)',
                    color: '#E5E9F4',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 600,
                    border: '2px solid rgba(255,255,255,0.1)',
                  }}>{inisyaller(p.ad)}</div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#E5E9F4' }}>{p.ad}</div>
                  <div style={{ fontSize: 13, color: '#7A8AA8', marginTop: 3 }}>{p.unvan}</div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 999, marginTop: 8, overflow: 'hidden', maxWidth: 400 }}>
                    <div style={{ height: '100%', width: `${yuzde}%`, background: i === 0 ? '#3B82F6' : '#4B5B78', borderRadius: 999, transition: 'width 400ms' }} />
                  </div>
                </div>
                <div style={{ fontSize: 13, color: '#7A8AA8', fontVariantNumeric: 'tabular-nums' }}>
                  {p.telefon ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ opacity: 0.6 }}>📞</span> {telFormat(p.telefon)}
                    </div>
                  ) : (
                    <span style={{ opacity: 0.4 }}>—</span>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 36, fontWeight: 700, color: '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {p.sayi}
                  </div>
                  <div style={{ fontSize: 11, color: '#7A8AA8', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>
                    servis
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
