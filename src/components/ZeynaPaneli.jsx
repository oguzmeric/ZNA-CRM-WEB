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
  const [kalanSoru, setKalanSoru] = useState(null)  // null = bilinmiyor, ilk yanittan sonra dolar
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
      if (typeof res.kalan_soru === 'number') setKalanSoru(res.kalan_soru)
      setMesajlar(prev => [...prev, { rol: 'assistant', icerik: res.yanit, id: `a-${Date.now()}` }])
    } catch (e) {
      // Kota bitti hatasi ozel mesaj
      if (e.kota_bitti || /soru hakkın/i.test(e.message)) {
        setKalanSoru(0)
        setMesajlar(prev => [...prev, {
          rol: 'assistant',
          icerik: '🔒 Soru hakkın doldu.\n\nLütfen **yöneticinden daha fazla soru hakkı iste**. Yönetici Kullanıcılar sayfasından sana ek hak verebilir.',
          id: `e-${Date.now()}`,
        }])
      } else {
        setHata(e.message)
        setMesajlar(prev => [...prev, {
          rol: 'assistant',
          icerik: '⚠️ Bir sorun oluştu: ' + e.message,
          id: `e-${Date.now()}`,
        }])
      }
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
          {/* Kalan soru hakki rozeti */}
          {kalanSoru != null && (
            <div
              title={kalanSoru === 0 ? 'Soru hakkın bitti — yöneticinden iste' : `${kalanSoru} soru hakkın kaldı`}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                background: kalanSoru === 0
                  ? 'rgba(239,68,68,0.12)'
                  : kalanSoru <= 1 ? 'rgba(245,166,35,0.15)' : 'rgba(74,197,229,0.12)',
                color: kalanSoru === 0
                  ? '#DC2626'
                  : kalanSoru <= 1 ? '#B45309' : '#1E5AA8',
                font: '700 11px/14px var(--font-sans)',
                whiteSpace: 'nowrap',
              }}
            >
              {kalanSoru === 0 ? 'Hak bitti' : `${kalanSoru} hak`}
            </div>
          )}
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

              {/* Hizli baslangic kartlari */}
              <div style={{
                fontSize: 10, fontWeight: 800,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase', letterSpacing: 0.8,
                marginBottom: 10, paddingLeft: 4,
              }}>
                Hızlı Başla
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
              }}>
                {[
                  {
                    renk: '#1E5AA8', renkBg: 'rgba(30,90,168,0.08)',
                    Ikon: 'M9 11H7v5h2v-5zm4 0h-2v5h2v-5zm4 0h-2v5h2v-5zm2-7h-1V2h-2v2H8V2H6v2H5C3.89 4 3 4.9 3 6v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z',
                    baslik: 'Açık Servisler',
                    metin: 'Bana atanmış açık servis taleplerini listele',
                  },
                  {
                    renk: '#5346C7', renkBg: 'rgba(83,70,199,0.08)',
                    Ikon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
                    baslik: 'Müşteri 360',
                    metin: 'Bir müşteri için 360 derece özet (firma adını söyle)',
                  },
                  {
                    renk: '#0E7E5C', renkBg: 'rgba(14,126,92,0.08)',
                    Ikon: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z',
                    baslik: 'Bu Ay Satış',
                    metin: 'Bu ay kesilen toplam fatura tutarı',
                  },
                  {
                    renk: '#B45309', renkBg: 'rgba(180,83,9,0.08)',
                    Ikon: 'M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z',
                    baslik: 'Yaklaşan Lisans',
                    metin: 'Önümüzdeki 30 gün içinde biten Trassir lisansları',
                  },
                  {
                    renk: '#9F2B68', renkBg: 'rgba(159,43,104,0.08)',
                    Ikon: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z',
                    baslik: 'Açık Talep Durumu',
                    metin: 'Tüm açık taleplerin durum dağılımı',
                  },
                  {
                    renk: '#4A4A4A', renkBg: 'rgba(74,74,74,0.06)',
                    Ikon: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
                    baslik: 'E-posta Düzelt',
                    metin: 'Müşteriye göndereceğim e-postayı dilini düzelt',
                  },
                ].map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setGirdi(s.metin)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                      gap: 6, padding: '12px 12px',
                      borderRadius: 12,
                      background: '#fff',
                      border: '1px solid var(--border-subtle, #DEE3EC)',
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'all 0.15s',
                      minHeight: 76,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = s.renk
                      e.currentTarget.style.transform = 'translateY(-1px)'
                      e.currentTarget.style.boxShadow = `0 4px 12px ${s.renkBg}`
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border-subtle, #DEE3EC)'
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: s.renkBg,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={s.renk}>
                        <path d={s.Ikon} />
                      </svg>
                    </div>
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: 'var(--text-primary)',
                      lineHeight: 1.3,
                    }}>{s.baslik}</div>
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
              placeholder="Zeyna'ya bir şey sor…"
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
