import { useState, useMemo } from 'react'
import { X, Pencil, Check } from 'lucide-react'
import { Button, Input } from './ui'
import { konuTopluYeniden } from '../services/gorusmeService'

// Aktivite konularını topluca yönet — yanlış yazımlı konuları düzelt
// props:
//  acik: boolean, onClose(), gorusmeler: Görüşme[], varsayilanKonular: string[]
//  onGuncellendi(): parent gorusmeler listesini yenilesin
export default function KonuYonetimModal({ acik, onClose, gorusmeler = [], varsayilanKonular = [], onGuncellendi }) {
  const [duzenlemeAd, setDuzenlemeAd] = useState(null)
  const [yeniAd, setYeniAd] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState('')

  const konuSayilari = useMemo(() => {
    const sayaç = new Map()
    for (const g of gorusmeler) {
      if (!g?.konu) continue
      sayaç.set(g.konu, (sayaç.get(g.konu) || 0) + 1)
    }
    return sayaç
  }, [gorusmeler])

  const konular = useMemo(() => {
    const varsay = new Set(varsayilanKonular)
    return [...konuSayilari.keys()]
      .map(k => ({ ad: k, sayi: konuSayilari.get(k), varsayilan: varsay.has(k) }))
      .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
  }, [konuSayilari, varsayilanKonular])

  if (!acik) return null

  const duzenlemeBaslat = (ad) => {
    setDuzenlemeAd(ad)
    setYeniAd(ad)
    setHata('')
  }

  const duzenlemeIptal = () => {
    setDuzenlemeAd(null)
    setYeniAd('')
    setHata('')
  }

  const duzenlemeKaydet = async () => {
    const yeni = (yeniAd || '').trim()
    if (!yeni) { setHata('Boş bırakılamaz.'); return }
    if (yeni === duzenlemeAd) { duzenlemeIptal(); return }
    setKaydediliyor(true)
    setHata('')
    try {
      const say = await konuTopluYeniden(duzenlemeAd, yeni)
      if (say === null) { setHata('Güncellenemedi.'); return }
      duzenlemeIptal()
      onGuncellendi?.()
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface-card)',
          borderRadius: 'var(--radius-md)',
          maxWidth: 560, width: '100%',
          maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid var(--border-default)',
        }}>
          <div>
            <div style={{ font: '600 15px/20px var(--font-sans)', color: 'var(--text-primary)' }}>Aktivite Konularını Yönet</div>
            <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>
              Yanlış yazılmış konuları düzelt — tüm eski görüşmelerde otomatik güncellenir
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            style={{
              background: 'transparent', border: 'none', padding: 6,
              cursor: 'pointer', color: 'var(--text-secondary)',
              display: 'inline-flex', borderRadius: 'var(--radius-sm)',
            }}
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {konular.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', font: '400 13px/18px var(--font-sans)' }}>
              Henüz konu yok.
            </div>
          )}
          {konular.map(k => {
            const duzenlemede = duzenlemeAd === k.ad
            return (
              <div
                key={k.ad}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: duzenlemede ? 'var(--brand-primary-soft)' : 'transparent',
                }}
              >
                {duzenlemede ? (
                  <>
                    <Input
                      value={yeniAd}
                      onChange={e => setYeniAd(e.target.value)}
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') duzenlemeKaydet()
                        else if (e.key === 'Escape') duzenlemeIptal()
                      }}
                      style={{ flex: 1 }}
                    />
                    <Button variant="primary" size="sm" iconLeft={<Check size={13} strokeWidth={2} />} onClick={duzenlemeKaydet} disabled={kaydediliyor}>
                      {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={duzenlemeIptal}>İptal</Button>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {k.ad}
                      </div>
                      <div style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                        {k.sayi} görüşme{k.varsayilan ? ' · varsayılan' : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => duzenlemeBaslat(k.ad)}
                      aria-label="Yeniden adlandır"
                      title="Yeniden adlandır"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '6px 10px',
                        background: 'transparent',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        font: '500 12px/16px var(--font-sans)',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                    >
                      <Pencil size={12} strokeWidth={1.5} /> Düzenle
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {hata && (
          <div style={{
            padding: '8px 18px',
            background: 'var(--danger-soft)',
            color: 'var(--danger)',
            font: '500 12px/16px var(--font-sans)',
            borderTop: '1px solid var(--danger-border)',
          }}>
            {hata}
          </div>
        )}

        <div style={{
          padding: '12px 18px',
          borderTop: '1px solid var(--border-default)',
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <Button variant="secondary" onClick={onClose}>Kapat</Button>
        </div>
      </div>
    </div>
  )
}
