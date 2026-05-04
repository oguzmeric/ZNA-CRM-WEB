// Müşteri lokasyonlarını anlık yönetme modal'ı.
// Görüşme + Servis talebi formlarında kullanılır.
// - Mevcut lokasyonları listeler (× ile silinebilir)
// - Yeni lokasyon ekleme inputu
// onClose / onChange callback'i ile parent'a güncel listeyi bildirir.

import { useState } from 'react'
import { Plus, MapPin, Trash2 } from 'lucide-react'
import {
  musteriLokasyonEkle,
  musteriLokasyonSil,
} from '../services/musteriLokasyonService'
import { Button, Input, Modal } from './ui'

export default function LokasyonYonetModal({
  acik,
  musteriId,
  musteriAdi = '',
  lokasyonlar,
  onLokasyonlarChange,   // (yeniListe) => void
  onClose,
}) {
  const [yeniAd, setYeniAd] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState('')

  if (!acik) return null

  const ekle = async () => {
    const ad = yeniAd.trim()
    if (!ad) { setHata('Lokasyon adı boş olamaz.'); return }
    if (!musteriId) { setHata('Önce müşteri seçin.'); return }
    if (lokasyonlar.some(l => (l.ad || '').toLowerCase() === ad.toLowerCase())) {
      setHata('Bu lokasyon zaten ekli.'); return
    }
    setHata(''); setYukleniyor(true)
    try {
      const yeni = await musteriLokasyonEkle({ musteriId, ad, aktif: true })
      if (yeni) {
        onLokasyonlarChange([...lokasyonlar, yeni])
        setYeniAd('')
      }
    } catch (err) {
      setHata('Eklenemedi: ' + (err?.message || 'bilinmeyen hata'))
    } finally {
      setYukleniyor(false)
    }
  }

  const sil = async (l) => {
    if (!window.confirm(`"${l.ad}" lokasyonu silinsin mi?`)) return
    setYukleniyor(true)
    try {
      await musteriLokasyonSil(l.id)
      onLokasyonlarChange(lokasyonlar.filter(x => x.id !== l.id))
    } catch (err) {
      setHata('Silinemedi: ' + (err?.message || 'bilinmeyen hata'))
    } finally {
      setYukleniyor(false)
    }
  }

  return (
    <Modal open={acik} onClose={onClose} title={`Lokasyon Yönetimi${musteriAdi ? ` — ${musteriAdi}` : ''}`} width={480}>
      <div>
        {/* Mevcut liste */}
        {lokasyonlar.length === 0 ? (
          <div style={{
            padding: '16px',
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            font: '400 13px/18px var(--font-sans)',
            background: 'var(--surface-sunken)',
            borderRadius: 6,
            marginBottom: 12,
          }}>
            Henüz lokasyon eklenmemiş.
          </div>
        ) : (
          <div style={{
            maxHeight: 280,
            overflowY: 'auto',
            border: '1px solid var(--border-default)',
            borderRadius: 6,
            marginBottom: 12,
          }}>
            {lokasyonlar.map(l => (
              <div key={l.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderBottom: '1px solid var(--border-default)',
                background: 'var(--surface-card)',
              }}>
                <MapPin size={14} strokeWidth={1.5} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
                <span style={{ flex: 1, font: '400 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                  {l.ad}
                </span>
                <button
                  type="button"
                  onClick={() => sil(l)}
                  disabled={yukleniyor}
                  title="Sil"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: yukleniyor ? 'wait' : 'pointer',
                    padding: 4,
                    color: 'var(--danger, #dc2626)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Yeni ekleme */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Input
            value={yeniAd}
            onChange={e => { setYeniAd(e.target.value); setHata('') }}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), ekle())}
            placeholder="Yeni lokasyon adı…"
            disabled={yukleniyor || !musteriId}
            style={{ flex: 1 }}
          />
          <Button
            variant="primary"
            iconLeft={<Plus size={14} strokeWidth={1.5} />}
            onClick={ekle}
            disabled={yukleniyor || !yeniAd.trim() || !musteriId}
          >
            Ekle
          </Button>
        </div>

        {hata && (
          <div style={{
            marginTop: 10,
            padding: '8px 10px',
            background: 'var(--danger-soft, #fef2f2)',
            color: 'var(--danger, #dc2626)',
            borderRadius: 4,
            font: '400 12px/16px var(--font-sans)',
          }}>
            {hata}
          </div>
        )}

        {!musteriId && (
          <div style={{
            marginTop: 10,
            font: '400 11px/14px var(--font-sans)',
            color: 'var(--text-tertiary)',
            fontStyle: 'italic',
          }}>
            Lokasyon eklemek için önce müşteri seçmelisiniz.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-default)' }}>
          <Button variant="secondary" onClick={onClose}>Kapat</Button>
        </div>
      </div>
    </Modal>
  )
}
