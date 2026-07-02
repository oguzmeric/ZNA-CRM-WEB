// Skeleton loader'lar — 'Yükleniyor…' metnini yerine gerçek içerik şeklinde
// gri parıltılı iskeletler koyar. Kullanıcı hız algısı yükselir, göz sabit kalır.
//
// Kullanım:
//   {yukleniyor ? <SkeletonList satirSayisi={8} /> : <RealContent />}
//   {yukleniyor ? <SkeletonPanel /> : <Dashboard />}
//   {yukleniyor ? <SkeletonDetay /> : <MusteriDetay />}

import { Card } from './ui'

// Global CSS bir kez enjekte et
const styleId = 'skeleton-shimmer-style'
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const el = document.createElement('style')
  el.id = styleId
  el.textContent = `
    @keyframes skl-shimmer {
      0% { background-position: -600px 0; }
      100% { background-position: 600px 0; }
    }
    .skl {
      background: linear-gradient(90deg,
        var(--surface-sunken, #eef2f7) 0%,
        var(--bg-000, #f8fafc) 40%,
        var(--surface-sunken, #eef2f7) 80%);
      background-size: 1200px 100%;
      animation: skl-shimmer 1.6s infinite linear;
      border-radius: 6px;
      display: inline-block;
    }
    @keyframes skl-fade-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .skl-fade { animation: skl-fade-in 220ms ease-out both; }
  `
  document.head.appendChild(el)
}

// Temel iskelet: genişlik/yükseklik/radius verilebilir
export function Skeleton({ w = '100%', h = 12, radius = 6, style, ...rest }) {
  return (
    <span
      className="skl"
      style={{ width: w, height: h, borderRadius: radius, ...style }}
      {...rest}
    />
  )
}

// Liste/tablo iskeleti — Müşteriler, Görevler, Görüşmeler vb.
export function SkeletonList({ satirSayisi = 8 }) {
  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>
      {/* Başlık + arama şeridi */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Skeleton w={180} h={22} style={{ marginBottom: 8, display: 'block' }} />
          <Skeleton w={90} h={12} style={{ display: 'block' }} />
        </div>
        <Skeleton w={120} h={36} radius={8} />
      </div>

      <Card>
        {/* Arama + filtre çubuğu */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <Skeleton w="60%" h={34} radius={8} />
          <Skeleton w={140} h={34} radius={8} />
        </div>

        {/* Tablo başlıkları */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '90px 1fr 1fr 90px 100px 32px',
          gap: 16, padding: '8px 12px',
          borderBottom: '1px solid var(--border-default)',
          marginBottom: 4,
        }}>
          <Skeleton w={60} h={10} />
          <Skeleton w={80} h={10} />
          <Skeleton w={70} h={10} />
          <Skeleton w={50} h={10} />
          <Skeleton w={60} h={10} />
          <span />
        </div>

        {/* Tablo satırları */}
        {Array.from({ length: satirSayisi }).map((_, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '90px 1fr 1fr 90px 100px 32px',
              gap: 16, padding: '10px 12px',
              alignItems: 'center',
              borderBottom: '1px solid var(--border-subtle, #f1f5f9)',
            }}
          >
            <Skeleton w={70} h={20} radius={4} />
            <Skeleton w={`${70 + (i * 3) % 25}%`} h={13} />
            <Skeleton w={`${50 + (i * 7) % 30}%`} h={12} />
            <Skeleton w={60} h={12} />
            <Skeleton w={60} h={20} radius={999} />
            <Skeleton w={20} h={20} radius={4} />
          </div>
        ))}
      </Card>
    </div>
  )
}

// Panel / Dashboard iskeleti — KPI kartları + grafikler
export function SkeletonPanel() {
  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>
      {/* Karşılama */}
      <div style={{ marginBottom: 24 }}>
        <Skeleton w={280} h={26} style={{ marginBottom: 8, display: 'block' }} />
        <Skeleton w={180} h={12} style={{ display: 'block' }} />
      </div>

      {/* KPI satırı */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <Skeleton w={70} h={10} style={{ marginBottom: 12, display: 'block' }} />
            <Skeleton w={90} h={26} style={{ marginBottom: 6, display: 'block' }} />
            <Skeleton w={110} h={11} style={{ display: 'block' }} />
          </Card>
        ))}
      </div>

      {/* Grafik alanı */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Card>
          <Skeleton w={140} h={14} style={{ marginBottom: 6, display: 'block' }} />
          <Skeleton w={80} h={11} style={{ marginBottom: 16, display: 'block' }} />
          <Skeleton w="100%" h={180} radius={8} style={{ display: 'block' }} />
        </Card>
        <Card>
          <Skeleton w={140} h={14} style={{ marginBottom: 6, display: 'block' }} />
          <Skeleton w={80} h={11} style={{ marginBottom: 16, display: 'block' }} />
          <Skeleton w="100%" h={180} radius={8} style={{ display: 'block' }} />
        </Card>
      </div>
    </div>
  )
}

// Detay sayfası iskeleti — Müşteri/Görev/Görüşme/Teklif detay
export function SkeletonDetay() {
  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Geri bağlantısı */}
      <Skeleton w={100} h={12} style={{ marginBottom: 16, display: 'block' }} />

      {/* Ana kart */}
      <Card style={{ marginBottom: 16 }}>
        {/* Başlık + aksiyonlar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <Skeleton w={70} h={20} radius={999} />
              <Skeleton w={60} h={20} radius={999} />
            </div>
            <Skeleton w={280} h={22} style={{ marginBottom: 6, display: 'block' }} />
            <Skeleton w={160} h={12} style={{ display: 'block' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Skeleton w={100} h={34} radius={8} />
            <Skeleton w={100} h={34} radius={8} />
          </div>
        </div>

        {/* Alan grid'i */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 20,
          paddingTop: 16,
          borderTop: '1px solid var(--border-subtle, #f1f5f9)',
        }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <Skeleton w={80} h={10} style={{ marginBottom: 8, display: 'block' }} />
              <Skeleton w={`${60 + (i * 15) % 35}%`} h={14} style={{ display: 'block' }} />
            </div>
          ))}
        </div>

        {/* Notlar / metin bloğu */}
        <div style={{ marginTop: 20 }}>
          <Skeleton w={80} h={10} style={{ marginBottom: 8, display: 'block' }} />
          <Skeleton w="100%" h={11} style={{ marginBottom: 6, display: 'block' }} />
          <Skeleton w="92%" h={11} style={{ marginBottom: 6, display: 'block' }} />
          <Skeleton w="78%" h={11} style={{ display: 'block' }} />
        </div>
      </Card>

      {/* Bağlı içerik kartı */}
      <Card>
        <Skeleton w={160} h={14} style={{ marginBottom: 6, display: 'block' }} />
        <Skeleton w={140} h={11} style={{ marginBottom: 16, display: 'block' }} />
        <Skeleton w="100%" h={80} radius={10} style={{ display: 'block' }} />
      </Card>
    </div>
  )
}
