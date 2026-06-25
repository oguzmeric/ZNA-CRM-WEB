// Zeyna'nın avatarı — saf CSS/SVG, lacivert-cyan gradient + Z harfi.
// Farklı boyutlarda kullanılır (floating buton, mesaj baloncuğu, panel başlığı).

export default function ZeynaAvatar({ size = 36, glow = false }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #0F1B2E 0%, #1E5AA8 45%, #4AC5E5 100%)',
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: glow
          ? '0 0 0 3px rgba(74,197,229,0.25), 0 4px 14px rgba(15,27,46,0.35)'
          : '0 2px 8px rgba(15,27,46,0.2)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Arka plan dalga */}
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute', opacity: 0.15 }}>
        <circle cx="80" cy="20" r="35" fill="#4AC5E5" />
        <circle cx="20" cy="80" r="40" fill="#1E5AA8" />
      </svg>
      {/* Z harfi */}
      <svg
        width={size * 0.55}
        height={size * 0.55}
        viewBox="0 0 24 24"
        style={{ position: 'relative', zIndex: 1 }}
      >
        <path
          d="M5 4 H19 L7 18 H19"
          fill="none"
          stroke="#fff"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Küçük yıldız/spark — AI hissi */}
        <circle cx="20" cy="6" r="1.3" fill="#4AC5E5" />
      </svg>
    </div>
  )
}
