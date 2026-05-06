// MentionTextarea — @ yazılınca kullanıcı autocomplete dropdown'u açan textarea.
//
// Kullanım:
//   <MentionTextarea
//     value={metin}
//     onChange={setMetin}
//     kullanicilar={kullaniciListesi}
//     placeholder="..."
//     rows={3}
//   />
//
// Seçilen kullanıcı @AdSoyad (boşluksuz) olarak metne yazılır.
// parseMentions(metin, kullanicilar) ile mention'lar id'lere çözülür.

import { useState, useRef, useEffect, useMemo } from 'react'
import { trNormalize } from '../lib/trSearch'
import { adToMentionToken } from '../lib/mention'
import { Textarea } from './ui'

export default function MentionTextarea({
  value = '',
  onChange,
  kullanicilar = [],
  placeholder,
  rows = 3,
  style,
  ...rest
}) {
  const taRef = useRef(null)
  const [pickerAcik, setPickerAcik] = useState(false)
  const [arama, setArama] = useState('')
  const [tetikIdx, setTetikIdx] = useState(-1) // @'in başladığı index
  const [vurguIdx, setVurguIdx] = useState(0)

  const filtreli = useMemo(() => {
    if (!pickerAcik) return []
    const q = trNormalize(arama)
    return kullanicilar
      .filter(k => k.ad)
      .filter(k => !q || trNormalize(k.ad).includes(q))
      .slice(0, 8)
  }, [pickerAcik, arama, kullanicilar])

  // Cursor değiştikçe @ kontrolü yap
  const cursorIzle = (yeniDeger, cursorPos) => {
    // @ pozisyonu — cursor'dan geri @ veya boşluğa kadar git
    let i = cursorPos - 1
    while (i >= 0) {
      const c = yeniDeger[i]
      if (c === '@') {
        // @'in solunda boşluk veya başlangıç olmalı
        const prev = yeniDeger[i - 1]
        if (i === 0 || /\s/.test(prev)) {
          const aranan = yeniDeger.slice(i + 1, cursorPos)
          // @sonrası harf/sayı dışı varsa picker kapanır
          if (/^[\p{L}\p{N}_]*$/u.test(aranan)) {
            setTetikIdx(i)
            setArama(aranan)
            setPickerAcik(true)
            setVurguIdx(0)
            return
          }
        }
        break
      }
      if (/\s/.test(c)) break
      i--
    }
    setPickerAcik(false)
  }

  const handleChange = (e) => {
    const yeniDeger = e.target.value
    onChange?.(yeniDeger)
    setTimeout(() => cursorIzle(yeniDeger, e.target.selectionStart || 0), 0)
  }

  const handleKeyDown = (e) => {
    if (!pickerAcik || filtreli.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setVurguIdx(i => Math.min(i + 1, filtreli.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setVurguIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      sec(filtreli[vurguIdx])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setPickerAcik(false)
    }
  }

  const sec = (kullanici) => {
    if (!kullanici || tetikIdx < 0) return
    const ta = taRef.current
    if (!ta) return
    const cursorPos = ta.selectionStart || 0
    const token = adToMentionToken(kullanici.ad)
    const yeniDeger = value.slice(0, tetikIdx) + '@' + token + ' ' + value.slice(cursorPos)
    onChange?.(yeniDeger)
    setPickerAcik(false)
    // Cursor'u eklenen token'ın sonuna taşı
    setTimeout(() => {
      const yeniPos = tetikIdx + 1 + token.length + 1
      ta.focus()
      ta.setSelectionRange(yeniPos, yeniPos)
    }, 0)
  }

  // Cursor pozisyonuna göre dropdown konumunu hesapla — basit: textarea altına yerleştir
  // (Tam mention pozisyonu için canvas measure gerekir; pragmatik çözüm: alta sabit)
  return (
    <div style={{ position: 'relative', ...style }}>
      <Textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setPickerAcik(false), 150)}
        placeholder={placeholder}
        rows={rows}
        {...rest}
      />
      {pickerAcik && filtreli.length > 0 && (
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 'calc(100% + 4px)',
          maxHeight: 220,
          overflowY: 'auto',
          background: 'var(--surface-card, #fff)',
          border: '1px solid var(--border-default, #e2e8f0)',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 100,
        }}>
          <div style={{ padding: '6px 12px', font: '600 10px/14px var(--font-sans)', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-default)' }}>
            KULLANICI ETİKETLE — ↑↓ + ↵ ile seç
          </div>
          {filtreli.map((k, i) => (
            <button
              key={k.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); sec(k) }}
              onMouseEnter={() => setVurguIdx(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '8px 12px',
                background: i === vurguIdx ? 'var(--brand-primary-soft)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                font: '500 13px/18px var(--font-sans)',
                color: 'var(--text-primary)',
              }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                font: '600 11px/1 var(--font-sans)',
                flexShrink: 0,
              }}>
                {(k.ad || '?').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.ad}</div>
                <div style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                  @{adToMentionToken(k.ad)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
