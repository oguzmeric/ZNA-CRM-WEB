// Sohbet için emoji paleti — dış bağımlılık YOK (emoji-mart vb. ~200 KB
// getiriyor; burada ihtiyaç kadarı elle tanımlı). Son kullanılanlar
// localStorage'da tutulur, en çok kullanılan 3-4 emoji hep üstte kalsın diye.
import { useEffect, useRef, useState } from 'react'

const KATEGORILER = [
  {
    ad: 'Yüzler', ikon: '🙂', liste: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
      '😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤗','🤭','🤫','🤔','🤐','🤨',
      '😐','😑','😶','😏','😒','🙄','😬','😮','😯','😴','🥱','😪','😌','😔','😕','🙁',
      '😖','😣','😞','😟','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨',
      '😰','😥','🤗','🤠','🥳','😎','🤓','🧐','😷','🤒','🤕','🤢','🤮','🥴','😵','🤑',
    ],
  },
  {
    ad: 'El & Kişi', ikon: '👍', liste: [
      '👍','👎','👌','🤌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚',
      '🖐️','🖖','👋','🤝','🙏','✍️','💪','🦾','👏','🙌','👐','🤲','🫡','🫰','👊','✊',
      '🧑','👨','👩','🧔','👮','🕵️','👷','💂','🧑‍💻','🧑‍🔧','🧑‍🏭','🧑‍💼','🧑‍🚒','👨‍👩‍👦','🚶','🏃',
    ],
  },
  {
    ad: 'İş', ikon: '📋', liste: [
      '📋','📌','📎','🗂️','📁','📂','📅','📆','🗓️','📝','✏️','🖊️','📄','📃','📑','🧾',
      '📊','📈','📉','💼','💰','💵','💳','🧮','🔑','🔒','🔓','⏰','⏳','⌛','🔔','🔕',
      '📞','☎️','📱','💻','🖥️','🖨️','⌨️','🖱️','💾','📡','🔌','🔋','🧰','🔧','🔨','⚙️',
      '🪛','🪚','🧲','🔩','📦','🚚','🏢','🏭','🏠','🗝️','🛠️','🧯','🪜','📐','📏','✂️',
    ],
  },
  {
    ad: 'Güvenlik', ikon: '📹', liste: [
      '📹','📷','🎥','🖥️','🛰️','🚨','🔦','💡','🔍','🔎','🛡️','🚧','⚠️','🚫','⛔','🔐',
      '🚪','🪟','🏗️','🧱','🔊','📢','📣','🛎️','🚗','🚙','🚐','🛻','🏍️','🛵','🚓','🧑‍🚒',
    ],
  },
  {
    ad: 'Kalp & İşaret', ikon: '❤️', liste: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💞','💯','✅','☑️','✔️',
      '❌','❎','➕','➖','❓','❔','❗','❕','‼️','⁉️','🔴','🟠','🟡','🟢','🔵','🟣',
      '⭐','🌟','✨','⚡','🔥','💥','💫','🎉','🎊','🎁','🏆','🥇','🥈','🥉','👑','🎯',
    ],
  },
  {
    ad: 'Doğa & Yemek', ikon: '☕', liste: [
      '☀️','🌤️','⛅','🌧️','⛈️','❄️','🌈','🌙','🌊','🌪️','🌱','🌳','🌵','🍀','🌸','🌹',
      '☕','🍵','🥤','🍺','🍻','🥂','🍽️','🍕','🍔','🍟','🌮','🥗','🍜','🍲','🥘','🍞',
      '🧀','🥚','🍎','🍌','🍇','🍓','🍉','🥕','🌶️','🍫','🍪','🎂','🍰','🍦','🥪','🧊',
    ],
  },
]

const SON_ANAHTAR = 'chat_emoji_son'

const sonlariOku = () => {
  try {
    const j = JSON.parse(localStorage.getItem(SON_ANAHTAR) || '[]')
    return Array.isArray(j) ? j.slice(0, 24) : []
  } catch { return [] }
}

export const emojiKullanildi = (e) => {
  try {
    const mevcut = sonlariOku().filter(x => x !== e)
    localStorage.setItem(SON_ANAHTAR, JSON.stringify([e, ...mevcut].slice(0, 24)))
  } catch { /* özel sekmede localStorage kapalı olabilir */ }
}

export default function EmojiSecici({ onSec, onKapat, style }) {
  const [sonlar, setSonlar] = useState(sonlariOku)
  const [aktif, setAktif] = useState(sonlariOku().length ? -1 : 0) // -1 = son kullanılanlar
  const ref = useRef(null)

  useEffect(() => {
    const disaTikla = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest('[data-emoji-buton]')) {
        onKapat?.()
      }
    }
    const esc = (e) => { if (e.key === 'Escape') onKapat?.() }
    document.addEventListener('mousedown', disaTikla)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', disaTikla)
      document.removeEventListener('keydown', esc)
    }
  }, [onKapat])

  const sec = (e) => {
    emojiKullanildi(e)
    setSonlar(sonlariOku())
    onSec?.(e)
  }

  const gosterilen = aktif === -1 ? sonlar : KATEGORILER[aktif].liste

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
        width: 328, background: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
        zIndex: 50, overflow: 'hidden',
        ...style,
      }}
    >
      {/* Kategori şeridi */}
      <div style={{
        display: 'flex', gap: 2, padding: '6px 8px',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--surface-sunken)',
      }}>
        {sonlar.length > 0 && (
          <button
            type="button" onClick={() => setAktif(-1)} title="Son kullanılanlar"
            style={sekmeStil(aktif === -1)}
          >🕘</button>
        )}
        {KATEGORILER.map((k, i) => (
          <button
            key={k.ad} type="button" onClick={() => setAktif(i)} title={k.ad}
            style={sekmeStil(aktif === i)}
          >{k.ikon}</button>
        ))}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)',
        gap: 2, padding: 8, maxHeight: 216, overflowY: 'auto',
      }}>
        {gosterilen.length === 0 ? (
          <div style={{
            gridColumn: '1 / -1', padding: 16, textAlign: 'center',
            font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)',
          }}>
            Henüz emoji kullanmadın
          </div>
        ) : gosterilen.map((e, i) => (
          <button
            key={`${e}-${i}`}
            type="button"
            onClick={() => sec(e)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 20, lineHeight: '32px', height: 32, borderRadius: 4, padding: 0,
            }}
            onMouseEnter={ev => { ev.currentTarget.style.background = 'var(--surface-sunken)' }}
            onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent' }}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}

const sekmeStil = (aktifMi) => ({
  flex: 1, background: aktifMi ? 'var(--surface-card)' : 'transparent',
  border: aktifMi ? '1px solid var(--border-default)' : '1px solid transparent',
  borderRadius: 4, cursor: 'pointer', fontSize: 15, lineHeight: '24px',
  height: 26, padding: 0,
})
