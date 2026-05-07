import { useState, useEffect } from 'react'
import { Button, Modal, Input, Label } from './ui'

export default function DemoSureyiUzatModal({ acik, mevcutTarih, onKapat, onKaydet }) {
  const [yeniTarih, setYeniTarih] = useState(mevcutTarih || '')
  const [neden, setNeden] = useState('')

  useEffect(() => {
    if (acik) {
      setYeniTarih(mevcutTarih || '')
      setNeden('')
    }
  }, [acik, mevcutTarih])

  if (!acik) return null

  return (
    <Modal open={acik} onClose={onKapat} title="Süreyi Uzat" width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <Label>Yeni Beklenen İade Tarihi</Label>
          <Input type="date" value={yeniTarih} onChange={e => setYeniTarih(e.target.value)} />
        </div>
        <div>
          <Label>Neden (opsiyonel)</Label>
          <Input value={neden} onChange={e => setNeden(e.target.value)} placeholder="Müşteri ek değerlendirme istedi" />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onKapat}>Vazgeç</Button>
          <Button variant="primary" onClick={() => onKaydet(yeniTarih, neden || null)} disabled={!yeniTarih}>
            Kaydet
          </Button>
        </div>
      </div>
    </Modal>
  )
}
