// Görev kontrol listesi (spek madde 18) — alt görevden farkı: basit adımlar,
// sorumlu+tarih opsiyonel, tamamlayan kişi damgalanır.
import { useState, useEffect, useCallback } from 'react'
import { ListChecks, Plus, Trash2 } from 'lucide-react'
import {
  kontrolListesiGetir, kontrolMaddeEkle, kontrolMaddeIsaretle, kontrolMaddeSil,
} from '../../services/gorevService'
import { useToast } from '../../context/ToastContext'
import { Button, Input, Card, CardTitle } from '../ui'
import CustomSelect from '../CustomSelect'

const trTarih = (t) => (t ? String(t).slice(0, 10).split('-').reverse().join('.') : '')

export default function KontrolListesiKarti({ gorev, kullanici, kullanicilar, duzenleyebilir }) {
  const { toast } = useToast()
  const [maddeler, setMaddeler] = useState([])
  const [ekleAcik, setEkleAcik] = useState(false)
  const [yeniBaslik, setYeniBaslik] = useState('')
  const [yeniSorumlu, setYeniSorumlu] = useState('')
  const [yeniZorunlu, setYeniZorunlu] = useState(false)
  const [mesgul, setMesgul] = useState(false)

  const yukle = useCallback(() => {
    kontrolListesiGetir(gorev.id).then(setMaddeler)
  }, [gorev.id])
  useEffect(() => { yukle() }, [yukle])

  const tamam = maddeler.filter(m => m.tamamlandi).length

  const ekle = async () => {
    if (!yeniBaslik.trim()) { toast.error('Madde başlığı boş olamaz.'); return }
    setMesgul(true)
    const m = await kontrolMaddeEkle({
      gorevId: gorev.id, baslik: yeniBaslik.trim(),
      sorumluId: yeniSorumlu ? Number(yeniSorumlu) : null,
      zorunlu: yeniZorunlu, sira: maddeler.length,
      olusturanId: kullanici.id,
    })
    setMesgul(false)
    if (!m) { toast.error('Madde eklenemedi.'); return }
    setMaddeler(p => [...p, m])
    setYeniBaslik(''); setYeniSorumlu(''); setYeniZorunlu(false)
  }

  const isaretle = async (m) => {
    const g = await kontrolMaddeIsaretle(m.id, !m.tamamlandi, kullanici)
    if (!g) { toast.error('Kaydedilemedi.'); return }
    setMaddeler(p => p.map(x => (x.id === m.id ? g : x)))
  }

  const sil = async (m) => {
    const ok = await kontrolMaddeSil(m.id)
    if (!ok) { toast.error('Silinemedi.'); return }
    setMaddeler(p => p.filter(x => x.id !== m.id))
  }

  if (!maddeler.length && !duzenleyebilir) return null

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ListChecks size={16} strokeWidth={1.5} style={{ color: 'var(--brand-primary)' }} />
          <CardTitle>Kontrol Listesi</CardTitle>
          {maddeler.length > 0 && <span className="t-caption tabular-nums">{tamam}/{maddeler.length}</span>}
        </div>
        {duzenleyebilir && !ekleAcik && (
          <Button variant="secondary" size="sm" iconLeft={<Plus size={13} strokeWidth={1.5} />} onClick={() => setEkleAcik(true)}>
            Madde Ekle
          </Button>
        )}
      </div>

      {maddeler.length > 0 && (
        <div style={{ height: 5, borderRadius: 3, background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ width: `${maddeler.length ? Math.round((tamam / maddeler.length) * 100) : 0}%`, height: '100%', background: 'var(--success)', transition: 'width 200ms' }} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {maddeler.map(m => {
          const sorumlu = kullanicilar?.find(k => String(k.id) === String(m.sorumluId))
          return (
            <div key={m.id} className="group" style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
              borderRadius: 'var(--radius-sm)', background: m.tamamlandi ? 'transparent' : 'var(--surface-sunken)',
              border: '1px solid var(--border-default)',
            }}>
              <input
                type="checkbox" checked={!!m.tamamlandi}
                onChange={() => isaretle(m)}
                disabled={!duzenleyebilir && String(m.sorumluId ?? '') !== String(kullanici?.id)}
                style={{ cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{
                font: '400 13px/18px var(--font-sans)', flex: 1,
                color: m.tamamlandi ? 'var(--text-tertiary)' : 'var(--text-primary)',
                textDecoration: m.tamamlandi ? 'line-through' : 'none',
              }}>
                {m.baslik}
                {m.zorunlu && !m.tamamlandi && (
                  <span style={{ marginLeft: 6, color: 'var(--danger)', font: '600 10px/14px var(--font-sans)' }}>ZORUNLU</span>
                )}
              </span>
              {m.tamamlandi ? (
                <span className="t-caption" title={`Tamamlayan: ${m.tamamlayanAd || '—'}`}>
                  ✓ {m.tamamlayanAd || ''} {m.tamamlanmaTarih ? '· ' + trTarih(m.tamamlanmaTarih) : ''}
                </span>
              ) : sorumlu ? (
                <span className="t-caption">→ {sorumlu.ad}</span>
              ) : null}
              {duzenleyebilir && (
                <button aria-label="Maddeyi sil" onClick={() => sil(m)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                  color: 'var(--text-tertiary)', flexShrink: 0,
                }}>
                  <Trash2 size={12} strokeWidth={1.5} />
                </button>
              )}
            </div>
          )
        })}
        {maddeler.length === 0 && (
          <p className="t-caption" style={{ fontStyle: 'italic', margin: 0 }}>
            Kontrol listesi boş — görevin adımlarını maddelere bölerek takip edebilirsin.
          </p>
        )}
      </div>

      {ekleAcik && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            value={yeniBaslik} onChange={e => setYeniBaslik(e.target.value)}
            placeholder="Örn. Vergi levhası alındı" style={{ flex: 1, minWidth: 180 }}
            onKeyDown={e => { if (e.key === 'Enter') ekle() }}
          />
          <CustomSelect value={yeniSorumlu} onChange={e => setYeniSorumlu(e.target.value)} panelMinWidth={180}>
            <option value="">Sorumlu (ops.)</option>
            {(kullanicilar || []).filter(k => k.rol !== 'musteri').map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
          </CustomSelect>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: '500 12px/16px var(--font-sans)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={yeniZorunlu} onChange={e => setYeniZorunlu(e.target.checked)} /> Zorunlu
          </label>
          <Button variant="primary" size="sm" onClick={ekle} disabled={mesgul}>Ekle</Button>
          <Button variant="secondary" size="sm" onClick={() => setEkleAcik(false)}>Kapat</Button>
        </div>
      )}
    </Card>
  )
}
