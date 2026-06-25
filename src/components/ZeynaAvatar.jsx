// Zeyna karakteri — gozluklu, basparmak yukarida, mor-altin gradient.
// Tasarim kullanici tarafindan saglandi (300x300 viewBox).
//
// Farkli boyutlarda kullanilir:
//   - 56 → floating buton
//   - 40 → panel basligi
//   - 26 → mesaj baloncugu yanindaki kucuk avatar
//
// glow prop: hafif disardan box-shadow halkasi (vurgu icin).

import { useId } from 'react'

export default function ZeynaAvatar({ size = 36, glow = false }) {
  // Birden fazla instance render edilse bile defs ID cakismasin diye unique suffix
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: glow
          ? '0 0 0 3px rgba(169,156,255,0.25), 0 6px 18px rgba(46,35,128,0.35)'
          : '0 2px 8px rgba(46,35,128,0.25)',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <svg
        viewBox="0 0 300 300"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Zeyna AI Asistan"
        width={size}
        height={size}
        style={{ display: 'block' }}
      >
        <defs>
          <radialGradient id={`disc-${uid}`} cx="0.5" cy="0.42" r="0.62">
            <stop offset="0" stopColor="#4234A8" />
            <stop offset="0.6" stopColor="#2B2078" />
            <stop offset="1" stopColor="#160F44" />
          </radialGradient>
          <linearGradient id={`ring-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#A99CFF" />
            <stop offset="0.5" stopColor="#5A4AD1" />
            <stop offset="1" stopColor="#2E2380" />
          </linearGradient>
          <linearGradient id={`bodyG-${uid}`} x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0" stopColor="#9C90F5" />
            <stop offset="0.55" stopColor="#5346C7" />
            <stop offset="1" stopColor="#2E2380" />
          </linearGradient>
          <linearGradient id={`shade-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#221A52" />
            <stop offset="1" stopColor="#0E0A2A" />
          </linearGradient>
          <linearGradient id={`spark-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFE08A" />
            <stop offset="1" stopColor="#F5A623" />
          </linearGradient>
          <filter id={`glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={`soft-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="16" />
          </filter>
        </defs>

        {/* ambient glow */}
        <circle cx="150" cy="150" r="120" fill="#6A5BE6" opacity="0.45" filter={`url(#soft-${uid})`} />

        {/* disc */}
        <circle cx="150" cy="150" r="118" fill={`url(#disc-${uid})`} />

        {/* tech dotted ring */}
        <circle cx="150" cy="150" r="106" fill="none" stroke={`url(#spark-${uid})`} strokeWidth="2.5"
                strokeDasharray="2 16" opacity="0.55" />

        {/* main ring */}
        <circle cx="150" cy="150" r="118" fill="none" stroke={`url(#ring-${uid})`} strokeWidth="11" />
        <circle cx="150" cy="150" r="112" fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.18" />

        {/* accent arc */}
        <path d="M150 32 A118 118 0 0 1 256 110" fill="none" stroke={`url(#spark-${uid})`} strokeWidth="3.5"
              strokeLinecap="round" opacity="0.9" filter={`url(#glow-${uid})`} />

        {/* ===== character ===== */}
        <g>
          {/* body */}
          <path d="M150,92 C170,124 206,140 206,178 A56,56 0 1 1 94,178 C94,140 130,124 150,92 Z"
                fill={`url(#bodyG-${uid})`} />
          {/* sheen */}
          <ellipse cx="126" cy="150" rx="22" ry="30" fill="#ffffff" opacity="0.12" />

          {/* thumbs up hand */}
          <g>
            <rect x="198" y="200" width="34" height="27" rx="10" fill="#4A3CBE" />
            <rect x="200" y="178" width="13" height="28" rx="6.5" fill="#5346C7" />
            <line x1="210" y1="206" x2="210" y2="222" stroke="#2E2380" strokeWidth="1.6" opacity="0.55" />
            <line x1="218" y1="206" x2="218" y2="222" stroke="#2E2380" strokeWidth="1.6" opacity="0.55" />
            <line x1="226" y1="206" x2="226" y2="222" stroke="#2E2380" strokeWidth="1.6" opacity="0.55" />
          </g>

          {/* sunglasses */}
          <g>
            <rect x="108" y="150" width="38" height="26" rx="11" fill={`url(#shade-${uid})`} />
            <rect x="154" y="150" width="38" height="26" rx="11" fill={`url(#shade-${uid})`} />
            <rect x="144" y="158" width="12" height="6" rx="3" fill={`url(#shade-${uid})`} />
            {/* amber reflections */}
            <rect x="116" y="155" width="6" height="16" rx="3" fill={`url(#spark-${uid})`} opacity="0.85"
                  transform="rotate(20 119 163)" />
            <rect x="162" y="155" width="6" height="16" rx="3" fill={`url(#spark-${uid})`} opacity="0.85"
                  transform="rotate(20 165 163)" />
          </g>

          {/* confident grin */}
          <path d="M126,188 Q150,212 174,188 Q150,198 126,188 Z" fill="#ffffff" />
          <path d="M126,188 Q150,198 174,188" fill="none" stroke="#0E0A2A" strokeWidth="2"
                strokeLinecap="round" opacity="0.25" />
        </g>

        {/* energy sparks */}
        <g fill={`url(#spark-${uid})`} filter={`url(#glow-${uid})`}>
          <path d="M214,70 Q214,86 230,86 Q214,86 214,102 Q214,86 198,86 Q214,86 214,70 Z" />
          <path d="M238,98 Q238,108 248,108 Q238,108 238,118 Q238,108 228,108 Q238,108 238,98 Z" />
        </g>
      </svg>
    </div>
  )
}
