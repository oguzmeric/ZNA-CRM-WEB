import { useState, useEffect } from 'react'
import { Button, Modal, Input, Textarea, Label, Select } from './ui'

const KARAR_SECENEKLERI = [
  { id: 'aldi', label: 'Aldı (satışa dönüştü)' },
  { id: 'almadi', label: 'Almadı' },
  { id: 'degerlendiriyor', label: 'Değerlendiriyor' },
]

export const ALMADI_SEBEPLERI = [
  { id: 'fiyat',           label: 'Fiyat yüksek buldu' },
  { id: 'ihtiyac_yok',     label: 'İhtiyacı kalmadı' },
  { id: 'rakip_secti',     label: 'Rakip ürünü seçti' },
  { id: 'teknik_yetersiz', label: 'Teknik olarak yetersiz buldu' },
  { id: 'diger',           label: 'Diğer' },
]

export default function DemoIadeAlModal({ acik, onKapat, onKaydet }) {
  const bugun = new Date().toISOString().slice(0, 10)
  const [tarih, setTarih] = useState(bugun)
  const [karar, setKarar] = useState('')
  const [almadiSebebi, setAlmadiSebebi] = useState('')
  const [notlar, setNotlar] = useState('')

  // Modal her açıldığında state'i sıfırla
  useEffect(() => {
    if (acik) {
      setTarih(bugun)
      setKarar('')
      setAlmadiSebebi('')
      setNotlar('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik])

  if (!acik) return null

  const kaydet = () => {
    onKaydet({
      gercekIadeTarihi: tarih,
      musteriKarari: karar || null,
      durumNotu: notlar || null,
      almadiSebebi: karar === 'almadi' ? (almadiSebebi || null) : null,
    })
  }

  return (
    <Modal open={acik} onClose={onKapat} title="İade Al">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <Label>Gerçek İade Tarihi</Label>
          <Input type="date" value={tarih} onChange={e => setTarih(e.target.value)} />
        </div>

        <div>
          <Label>Müşteri Kararı</Label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {KARAR_SECENEKLERI.map(k => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKarar(karar === k.id ? '' : k.id)}
                style={{
                  padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                  background: karar === k.id ? 'var(--brand-primary)' : 'var(--surface-card)',
                  color: karar === k.id ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border-default)', cursor: 'pointer', fontSize: 13,
                }}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        {karar === 'almadi' && (
          <div>
            <Label>Almama Sebebi</Label>
            <Select value={almadiSebebi} onChange={e => setAlmadiSebebi(e.target.value)}>
              <option value="">Seçiniz</option>
              {ALMADI_SEBEPLERI.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </Select>
          </div>
        )}

        <div>
          <Label>Notlar (cihaz durumu, hasar vs.)</Label>
          <Textarea value={notlar} onChange={e => setNotlar(e.target.value)} rows={3} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onKapat}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet}>İade Et</Button>
        </div>
      </div>
    </Modal>
  )
}
