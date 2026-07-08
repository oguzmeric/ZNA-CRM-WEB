// Global barkod / SN arama modalı — F2 ile aç.
// Bulunan kaleme veya ürüne tıklayınca ilgili ModelDetay'a yönlendirir.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { globalBarkodAra } from '../services/depoService'

const DURUM_RENK = {
  depoda: '#3b82f6', teknisyende: '#a855f7', sahada: '#10b981',
  arizada: '#f59e0b', arizali_depoda: '#dc2626', tamirde: '#ec4899', hurda: '#6b7280',
}

export default function GlobalBarkodAra() {
  const [acik, setAcik] = useState(false)
  const [giris, setGiris] = useState('')
  const [sonuc, setSonuc] = useState({ kalemler: [], urunler: [] })
  const [ariyor, setAriyor] = useState(false)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  // F2 → aç
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'F2') { e.preventDefault(); setAcik(true) }
      if (e.key === 'Escape' && acik) setAcik(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [acik])

  useEffect(() => { if (acik) setTimeout(() => inputRef.current?.focus(), 30) }, [acik])

  // Debounced arama
  useEffect(() => {
    const q = giris.trim()
    if (q.length < 2) { setSonuc({ kalemler: [], urunler: [] }); return }
    setAriyor(true)
    const t = setTimeout(async () => {
      try { setSonuc(await globalBarkodAra(q)) }
      catch (e) { console.error('[globalBarkodAra]', e); setSonuc({ kalemler: [], urunler: [] }) }
      finally { setAriyor(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [giris])

  const git = (stokKodu) => {
    setAcik(false); setGiris('')
    navigate(`/stok/model/${stokKodu}`)
  }

  if (!acik) return null

  return createPortal(
    <div onClick={() => setAcik(false)} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 90000,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 20px 20px',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface-card)', color: 'var(--text-primary)',
        borderRadius: 14, maxWidth: 720, width: '100%', maxHeight: '80vh', overflow: 'hidden',
        border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border-default)' }}>
          <Search size={18} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
          <input
            ref={inputRef}
            value={giris}
            onChange={e => setGiris(e.target.value)}
            placeholder="Barkod tara, SN yaz veya stok kodu ara…"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              color: 'var(--text-primary)', fontSize: 16, fontFamily: 'monospace',
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: '2px 6px', border: '1px solid var(--border-default)', borderRadius: 4 }}>F2</span>
          <button onClick={() => setAcik(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div style={{ overflow: 'auto', flex: 1 }}>
          {ariyor && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)' }}>Aranıyor…</div>}
          {!ariyor && giris.trim().length < 2 && (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              En az 2 karakter yaz veya SN barkodu okut.
            </div>
          )}
          {sonuc.kalemler.length > 0 && (
            <Bolum baslik={`SN Sonuçları (${sonuc.kalemler.length})`}>
              {sonuc.kalemler.map(k => (
                <Satir key={`k${k.id}`} onClick={() => git(k.stok_kodu)}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                    <div style={{ width: 4, height: 30, background: DURUM_RENK[k.durum] || '#94a3b8', borderRadius: 2 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13 }}>{k.seri_no || '—'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{k.stok_kodu} · {[k.marka, k.model].filter(Boolean).join(' ')}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: DURUM_RENK[k.durum] || 'var(--text-tertiary)', fontWeight: 600 }}>
                    {k.durum}
                    {k.rezerve_teklif_id && <span style={{ marginLeft: 6, color: '#8b5cf6' }}>· 🔖</span>}
                  </div>
                </Satir>
              ))}
            </Bolum>
          )}
          {sonuc.urunler.length > 0 && (
            <Bolum baslik={`Ürünler (${sonuc.urunler.length})`}>
              {sonuc.urunler.map(u => (
                <Satir key={`u${u.id}`} onClick={() => git(u.stok_kodu)}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{u.stok_adi}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{u.stok_kodu} · {u.marka || '—'}</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{u.seri_takipli ? 'S/N' : ''}</div>
                </Satir>
              ))}
            </Bolum>
          )}
          {!ariyor && giris.trim().length >= 2 && sonuc.kalemler.length === 0 && sonuc.urunler.length === 0 && (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              Eşleşme yok.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Bolum({ baslik, children }) {
  return (
    <div style={{ padding: '10px 0' }}>
      <div style={{ padding: '0 18px 8px', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600 }}>{baslik}</div>
      {children}
    </div>
  )
}

function Satir({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '10px 18px', border: 'none', background: 'transparent',
      color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >{children}</button>
  )
}
