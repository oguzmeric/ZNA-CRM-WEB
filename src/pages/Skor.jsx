// Servis şampiyonası — ofis ekranında kiosk mod. Giriş gerektirmez.
// Teknisyen bir servisi tamamlandı'ya çekince realtime tetiklenir + sayılar güncellenir.
// Temmuz'dan itibaren tamamlanan servisleri sayar; Bugün / Bu Hafta / Bu Ay sekmeleri.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const bugunBaslangic = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
const haftaBaslangic = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const gun = d.getDay() // 0=Paz, 1=Pzt...
  const fark = gun === 0 ? 6 : gun - 1 // Pazartesi baz
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

function useTicTac() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

export default function Skor() {
  const [sekme, setSekme] = useState('ay')
  const now = useTicTac()

  const [siralamaMap, setSiralamaMap] = useState({ bugun: [], hafta: [], ay: [] })
  const yukle = async () => {
    const bugun = bugunBaslangic().toISOString().slice(0, 10)
    const hafta = haftaBaslangic().toISOString().slice(0, 10)
    const ay    = ayBaslangic().toISOString().slice(0, 10)
    const yarin = new Date(); yarin.setDate(yarin.getDate() + 1)
    const bitis = yarin.toISOString().slice(0, 10)
    // Public RPC — anon key ile çağrılır, RLS bypass ama sadece agregat döner
    const [rBugun, rHafta, rAy] = await Promise.all([
      supabase.rpc('skor_liderlik', { baslangic: bugun, bitis }),
      supabase.rpc('skor_liderlik', { baslangic: hafta, bitis }),
      supabase.rpc('skor_liderlik', { baslangic: ay,    bitis }),
    ])
    const donusum = (rows) => (rows || []).map(r => ({
      id: r.kim,
      ad: r.kim,
      fotoUrl: r.foto_url || null,
      sayi: Number(r.sayi || 0),
    }))
    setSiralamaMap({
      bugun: donusum(rBugun.data),
      hafta: donusum(rHafta.data),
      ay:    donusum(rAy.data),
    })
  }

  useEffect(() => { yukle() }, [])

  // Realtime — iki kaynak da dinlensin
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
  const zirve = sira[0]
  const enUst = zirve?.sayi || 1
  const podyum = [sira[1], sira[0], sira[2]].filter(Boolean)
  const kalan = sira.slice(3, 13)

  const saat = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  const tarih = now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0B1220 0%, #0E1B33 100%)',
      color: '#E5E9F4',
      fontFamily: 'var(--font-sans, system-ui)',
      padding: '32px 40px 40px',
      display: 'flex', flexDirection: 'column', gap: 28,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: 0.5 }}>
            🏆 <span style={{ background: 'linear-gradient(90deg,#FBBF24,#F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ZNA Servis Şampiyonası</span>
          </div>
          <div style={{ fontSize: 14, color: '#9AA5C1', marginTop: 4, textTransform: 'capitalize' }}>{tarih}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: 1, fontVariantNumeric: 'tabular-nums' }}>{saat}</div>
          <div style={{ fontSize: 12, color: '#9AA5C1', marginTop: 2 }}>canlı yayın</div>
        </div>
      </div>

      {/* Sekmeler */}
      <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.05)', borderRadius: 999, padding: 4, alignSelf: 'flex-start' }}>
        {SEKMELER.map(s => {
          const on = sekme === s.id
          return (
            <button
              key={s.id}
              onClick={() => setSekme(s.id)}
              style={{
                padding: '10px 22px',
                borderRadius: 999,
                background: on ? 'linear-gradient(135deg,#3B82F6,#2563EB)' : 'transparent',
                border: 'none', cursor: 'pointer',
                color: on ? '#fff' : '#9AA5C1',
                fontSize: 15, fontWeight: on ? 700 : 500,
                letterSpacing: 0.3,
                boxShadow: on ? '0 6px 20px -6px rgba(59,130,246,0.6)' : 'none',
                transition: 'all 180ms',
              }}
            >
              {s.isim}
            </button>
          )
        })}
      </div>

      {/* Podyum */}
      {podyum.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, alignItems: 'end' }}>
          {podyum.map((p, i) => {
            // podyum sıra: [2., 1., 3.]
            const rank = i === 0 ? 2 : i === 1 ? 1 : 3
            const yukseklik = rank === 1 ? 320 : rank === 2 ? 260 : 220
            const renk = rank === 1 ? '#FBBF24' : rank === 2 ? '#94A3B8' : '#B45309'
            const emoji = rank === 1 ? '👑' : rank === 2 ? '🥈' : '🥉'
            return (
              <div key={p.id} style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
                border: `1px solid ${renk}55`,
                borderRadius: 20,
                padding: '24px 20px',
                minHeight: yukseklik,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                position: 'relative',
                boxShadow: rank === 1 ? `0 20px 60px -20px ${renk}88` : 'none',
              }}>
                <div style={{ position: 'absolute', top: -18, fontSize: 40 }}>{emoji}</div>
                {p.fotoUrl ? (
                  <img src={p.fotoUrl} alt={p.ad} style={{ width: rank === 1 ? 96 : 76, height: rank === 1 ? 96 : 76, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${renk}` }} />
                ) : (
                  <div style={{
                    width: rank === 1 ? 96 : 76, height: rank === 1 ? 96 : 76,
                    borderRadius: '50%',
                    background: `${renk}22`, color: renk,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: rank === 1 ? 32 : 26, fontWeight: 700,
                    border: `3px solid ${renk}`,
                  }}>{inisyaller(p.ad)}</div>
                )}
                <div style={{ fontSize: rank === 1 ? 20 : 17, fontWeight: 700, textAlign: 'center', minHeight: 44 }}>{p.ad}</div>
                <div style={{
                  fontSize: rank === 1 ? 56 : 42,
                  fontWeight: 800,
                  color: renk,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                  textShadow: rank === 1 ? `0 4px 24px ${renk}88` : 'none',
                }}>{p.sayi}</div>
                <div style={{ fontSize: 12, color: '#9AA5C1', letterSpacing: 0.5 }}>SERVİS</div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ padding: 60, textAlign: 'center', color: '#9AA5C1', fontSize: 16 }}>
          Bu dönemde henüz tamamlanan servis yok. İlk zafer sizin olsun 🚀
        </div>
      )}

      {/* Kalan sıralama */}
      {kalan.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {kalan.map((p, i) => {
            const yuzde = enUst > 0 ? (p.sayi / enUst) * 100 : 0
            return (
              <div key={p.id} style={{
                display: 'grid', gridTemplateColumns: '52px 48px 1fr 100px', alignItems: 'center', gap: 14,
                padding: '10px 16px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#9AA5C1', fontVariantNumeric: 'tabular-nums' }}>#{i + 4}</div>
                {p.fotoUrl ? (
                  <img src={p.fotoUrl} alt={p.ad} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#E5E9F4' }}>
                    {inisyaller(p.ad)}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{p.ad}</div>
                  <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 999, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${yuzde}%`, background: 'linear-gradient(90deg,#3B82F6,#60A5FA)', borderRadius: 999, transition: 'width 500ms' }} />
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, textAlign: 'right', color: '#93C5FD', fontVariantNumeric: 'tabular-nums' }}>{p.sayi}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Alt band */}
      <div style={{
        marginTop: 'auto',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px',
        background: 'rgba(59,130,246,0.08)',
        border: '1px solid rgba(59,130,246,0.2)',
        borderRadius: 14,
      }}>
        <div style={{ fontSize: 15, color: '#93C5FD' }}>
          <strong style={{ color: '#fff', fontSize: 18, marginRight: 4, fontVariantNumeric: 'tabular-nums' }}>{toplam}</strong>
          servis tamamlandı — {aktif.isim.toLowerCase()}
        </div>
        <div style={{ fontSize: 13, color: '#9AA5C1' }}>
          {sira.length} teknisyen sahada · Temmuz {new Date().getFullYear()} kampanyası
        </div>
      </div>
    </div>
  )
}
