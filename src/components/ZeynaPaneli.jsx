// Zeyna AI asistan paneli — sağdan slide-in.
// Floating buton tıklanınca açılır, ESC veya dış tıklama ile kapanır.
//
// Yapı:
//   - Header: Zeyna avatar + isim + kapat butonu
//   - Mesaj listesi (scroll)
//   - Input + Gönder

import { useState, useEffect, useRef } from 'react'
import { X, Send, Sparkles } from 'lucide-react'
import ZeynaAvatar from './ZeynaAvatar'
import { useAuth } from '../context/AuthContext'
import { zeynaMesajGonder, konusmaMesajlariniGetir } from '../services/zeynaService'

// Kullanicinin ilk adini al — bosluga gore ayir, ilk parcayi capitalize et
function ilkAd(adSoyad) {
  if (!adSoyad) return ''
  const parca = String(adSoyad).trim().split(/\s+/)[0]
  if (!parca) return ''
  // 'OGUZ' → 'Oguz', 'oguz' → 'Oguz', 'Oguz' → 'Oguz'
  return parca.charAt(0).toLocaleUpperCase('tr-TR') + parca.slice(1).toLocaleLowerCase('tr-TR')
}

export default function ZeynaPaneli({ acik, onKapat }) {
  const { kullanici } = useAuth()
  const ad = ilkAd(kullanici?.ad)
  const [mesajlar, setMesajlar] = useState([])
  const [girdi, setGirdi] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [konusmaId, setKonusmaId] = useState(null)
  const [hata, setHata] = useState(null)
  const listeRef = useRef(null)
  const inputRef = useRef(null)

  // Panel açıldığında input'a focus + ESC handler
  useEffect(() => {
    if (!acik) return
    const onEsc = (e) => { if (e.key === 'Escape') onKapat() }
    window.addEventListener('keydown', onEsc)
    setTimeout(() => inputRef.current?.focus(), 200)
    return () => window.removeEventListener('keydown', onEsc)
  }, [acik, onKapat])

  // Açıldığında mevcut konuşma varsa mesajları yükle (şimdilik her açılışta yeni)
  useEffect(() => {
    if (!acik) {
      setMesajlar([])
      setKonusmaId(null)
      setHata(null)
    }
  }, [acik])

  // Yeni mesaj geldiğinde aşağı kaydır
  useEffect(() => {
    if (listeRef.current) {
      listeRef.current.scrollTop = listeRef.current.scrollHeight
    }
  }, [mesajlar])

  const gonder = async () => {
    const mesaj = girdi.trim()
    if (!mesaj || gonderiliyor) return
    setHata(null)
    setGirdi('')
    setMesajlar(prev => [...prev, { rol: 'user', icerik: mesaj, id: `u-${Date.now()}` }])
    setGonderiliyor(true)
    try {
      const res = await zeynaMesajGonder(mesaj, konusmaId ?? undefined)
      setKonusmaId(res.konusma_id)
      setMesajlar(prev => [...prev, { rol: 'assistant', icerik: res.yanit, id: `a-${Date.now()}` }])
    } catch (e) {
      setHata(e.message)
      setMesajlar(prev => [...prev, {
        rol: 'assistant',
        icerik: '⚠️ Bir sorun oluştu: ' + e.message,
        id: `e-${Date.now()}`,
      }])
    } finally {
      setGonderiliyor(false)
      inputRef.current?.focus()
    }
  }

  const enterIle = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      gonder()
    }
  }

  if (!acik) return null

  return (
    <>
      {/* Backdrop — tıklayınca kapan */}
      <div
        onClick={onKapat}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,27,46,0.35)',
          zIndex: 980, backdropFilter: 'blur(2px)',
          animation: 'zeyna-fade-in 0.2s ease',
        }}
      />

      <style>{`
        @keyframes zeyna-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zeyna-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes zeyna-pulse-dot {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Slide-in panel */}
      <aside
        style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0,
          width: 'min(440px, 100vw)',
          background: 'var(--surface, #fff)',
          boxShadow: '-8px 0 32px rgba(15,27,46,0.18)',
          zIndex: 981,
          display: 'flex',
          flexDirection: 'column',
          animation: 'zeyna-slide-in 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <header style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border-subtle, #DEE3EC)',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'linear-gradient(180deg, rgba(30,90,168,0.04), transparent)',
        }}>
          <ZeynaAvatar size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              font: '700 15px/18px var(--font-sans)',
              color: 'var(--text-primary, #0F1B2E)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              Zeyna
              <Sparkles size={13} style={{ color: '#4AC5E5' }} />
            </div>
            <div style={{
              font: '500 11px/14px var(--font-sans)',
              color: 'var(--text-tertiary, #98A3B6)',
              marginTop: 2,
            }}>
              ZNA Teknoloji AI Asistan
            </div>
          </div>
          <button
            onClick={onKapat}
            title="Kapat (ESC)"
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: '1px solid var(--border-default, #DEE3EC)',
              background: 'transparent', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-tertiary)',
            }}
          >
            <X size={16} />
          </button>
        </header>

        {/* Mesaj listesi */}
        <div
          ref={listeRef}
          style={{
            flex: 1, overflowY: 'auto', padding: '20px 18px',
            display: 'flex', flexDirection: 'column', gap: 14,
            background: 'var(--surface-bg, #F4F6F8)',
          }}
        >
          {mesajlar.length === 0 && (
            <div style={{ padding: '12px 8px' }}>
              {/* Karsilama */}
              <div style={{ textAlign: 'center', marginBottom: 22 }}>
                <ZeynaAvatar size={56} glow />
                <div style={{
                  marginTop: 12, fontWeight: 700, fontSize: 16,
                  color: 'var(--text-primary)',
                }}>
                  {ad ? `Selam ${ad} 👋` : 'Selam 👋'}
                </div>
                <div style={{
                  marginTop: 4, fontSize: 13, lineHeight: 1.5,
                  color: 'var(--text-secondary)',
                  maxWidth: 300, marginInline: 'auto',
                }}>
                  Ben Zeyna — ZNA için işleri hızlandırmak için buradayım.
                </div>
              </div>

              {/* Ornek sorular — kullaniciya ne sorabilecegini gostermek icin */}
              <div style={{
                fontSize: 11, fontWeight: 700,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase', letterSpacing: 0.6,
                marginBottom: 8, paddingLeft: 4,
              }}>
                Şunları deneyebilirsin
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { ikon: '📋', metin: 'Bana atanmış açık talepleri listele' },
                  { ikon: '🔍', metin: 'Talay Lojistik\'in son taleplerini göster' },
                  { ikon: '💰', metin: 'Bu ayki teklifleri özetle' },
                  { ikon: '✍️', metin: 'Müşteriye gönderilecek e-postayı düzelt' },
                ].map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setGirdi(s.metin)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 10,
                      background: '#fff',
                      border: '1px solid var(--border-subtle, #DEE3EC)',
                      cursor: 'pointer', textAlign: 'left',
                      font: '500 13px/18px var(--font-sans)',
                      color: 'var(--text-primary)',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--accent, #5A4AD1)'
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border-subtle, #DEE3EC)'
                      e.currentTarget.style.transform = 'translateY(0)'
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{s.ikon}</span>
                    <span>{s.metin}</span>
                  </button>
                ))}
              </div>

              <div style={{
                marginTop: 16, padding: '8px 12px',
                background: 'rgba(74,197,229,0.08)',
                border: '1px solid rgba(90,74,209,0.20)',
                borderRadius: 8,
                fontSize: 11, lineHeight: 1.5,
                color: 'var(--text-secondary)',
              }}>
                🔗 CRM'e bağlıyım — müşteriler, talepler, teklifler hakkında direkt sorabilirsin.
              </div>
            </div>
          )}

          {mesajlar.map(m => (
            <MesajBaloncuk key={m.id} mesaj={m} />
          ))}

          {gonderiliyor && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 4 }}>
              <ZeynaAvatar size={26} />
              <div style={{ display: 'inline-flex', gap: 4 }}>
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: '#1E5AA8',
                      animation: 'zeyna-pulse-dot 1.2s infinite',
                      animationDelay: `${i * 0.16}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{
          borderTop: '1px solid var(--border-subtle, #DEE3EC)',
          padding: '12px 14px',
          background: 'var(--surface, #fff)',
        }}>
          {hata && (
            <div style={{
              marginBottom: 8, padding: '6px 10px',
              background: '#FEE2E2', border: '1px solid #FCA5A5',
              borderRadius: 6, color: '#991B1B',
              font: '400 11px/14px var(--font-sans)',
            }}>{hata}</div>
          )}
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 8,
            background: 'var(--surface-bg, #F4F6F8)',
            border: '1px solid var(--border-default, #DEE3EC)',
            borderRadius: 14, padding: '10px 10px 10px 14px',
          }}>
            <textarea
              ref={inputRef}
              value={girdi}
              onChange={e => setGirdi(e.target.value)}
              onKeyDown={enterIle}
              rows={3}
              placeholder="Zeyna'ya bir şey sor… (Enter ile gönder, Shift+Enter yeni satır)"
              style={{
                flex: 1, border: 'none', outline: 'none',
                resize: 'none', background: 'transparent',
                font: '400 14px/21px var(--font-sans)',
                color: 'var(--text-primary)',
                minHeight: 64, maxHeight: 200,
                padding: '4px 0',
              }}
              disabled={gonderiliyor}
            />
            <button
              onClick={gonder}
              disabled={!girdi.trim() || gonderiliyor}
              title="Gönder (Enter)"
              style={{
                width: 40, height: 40, borderRadius: 12,
                border: 'none', cursor: girdi.trim() && !gonderiliyor ? 'pointer' : 'not-allowed',
                background: girdi.trim() && !gonderiliyor
                  ? 'linear-gradient(135deg, #1E5AA8, #4AC5E5)'
                  : 'var(--border-default, #DEE3EC)',
                color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                transition: 'transform 0.12s ease',
              }}
              onMouseDown={e => { if (girdi.trim()) e.currentTarget.style.transform = 'scale(0.95)' }}
              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              <Send size={17} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

// ─── Mesaj baloncuğu ──────────────────────────────────────────────────────

function MesajBaloncuk({ mesaj }) {
  const benim = mesaj.rol === 'user'
  return (
    <div style={{
      display: 'flex',
      flexDirection: benim ? 'row-reverse' : 'row',
      alignItems: 'flex-end',
      gap: 8,
    }}>
      {!benim && <ZeynaAvatar size={26} />}
      <div style={{
        maxWidth: '78%',
        padding: '9px 13px',
        borderRadius: 14,
        borderTopRightRadius: benim ? 4 : 14,
        borderTopLeftRadius: benim ? 14 : 4,
        background: benim ? '#1E5AA8' : '#fff',
        color: benim ? '#fff' : 'var(--text-primary, #0F1B2E)',
        border: benim ? 'none' : '1px solid var(--border-subtle, #DEE3EC)',
        font: '400 13px/19px var(--font-sans)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        boxShadow: benim ? '0 1px 2px rgba(15,27,46,0.08)' : '0 1px 2px rgba(15,27,46,0.04)',
      }}>
        {mesaj.icerik}
      </div>
    </div>
  )
}
