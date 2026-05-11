// Teklif/Servis akışında stoktan ürün seçerken yoksa hızlıca ekleyebilmek için.
// Minimum alanlar (kod, ad, birim) — diğer detaylar Stok ekranından sonradan girilir.
//
// Kullanım:
//   <HizliStokEkleModal
//     acik={modalAcik}
//     mevcutKodlar={stokUrunler.map(u => u.stokKodu)}
//     baslangicAd={arananMetin}
//     onKapat={() => setModalAcik(false)}
//     onEklendi={(yeniUrun) => {
//       // listeye ekle + o satırda otomatik seç
//     }}
//   />

import { useState, useEffect } from 'react'
import { Button, Modal, Input, Label } from './ui'
import CustomSelect from './CustomSelect'
import { stokUrunEkle } from '../services/stokService'

const birimler = ['Adet', 'Metre', 'Kg', 'Boy', 'Paket', 'Kutu', 'Litre', 'Mt²']

function otoKodUret(mevcutKodlar = []) {
  // Mevcut STK kodlarını dolaş, en yüksek numarayı bul, +1
  let max = 0
  for (const k of mevcutKodlar) {
    const m = /^STK(\d+)$/i.exec(k ?? '')
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > max) max = n
    }
  }
  return `STK${String(max + 1).padStart(5, '0')}`
}

export default function HizliStokEkleModal({
  acik,
  mevcutKodlar = [],
  baslangicAd = '',
  onKapat,
  onEklendi,
}) {
  const [stokKodu, setStokKodu] = useState('')
  const [stokAdi, setStokAdi] = useState('')
  const [birim, setBirim] = useState('Adet')
  const [marka, setMarka] = useState('')
  const [model, setModel] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState(null)

  useEffect(() => {
    if (acik) {
      setStokKodu(otoKodUret(mevcutKodlar))
      setStokAdi(baslangicAd || '')
      setBirim('Adet')
      setMarka('')
      setModel('')
      setHata(null)
      setKaydediliyor(false)
    }
  }, [acik])

  if (!acik) return null

  const kaydet = async () => {
    setHata(null)
    if (!stokKodu.trim()) { setHata('Stok kodu zorunlu.'); return }
    if (!stokAdi.trim()) { setHata('Stok adı zorunlu.'); return }
    if (mevcutKodlar.includes(stokKodu.trim())) {
      setHata('Bu stok kodu zaten kullanımda.')
      return
    }
    setKaydediliyor(true)
    try {
      const yeni = await stokUrunEkle({
        stokKodu: stokKodu.trim(),
        stokAdi: stokAdi.trim(),
        birim,
        marka: marka.trim() || null,
        model: model.trim() || null,
        katalogdaGoster: true,
      })
      if (!yeni) {
        setHata('Stok eklenemedi (DB hatası).')
        return
      }
      onEklendi?.(yeni)
      onKapat?.()
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <Modal open={acik} onClose={onKapat} title="Hızlı Stok Ekle" width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
          <div>
            <Label required>Stok Kodu</Label>
            <Input value={stokKodu} onChange={e => setStokKodu(e.target.value)} placeholder="STK00001" />
          </div>
          <div>
            <Label required>Stok Adı</Label>
            <Input value={stokAdi} onChange={e => setStokAdi(e.target.value)} placeholder="Ürün adı" autoFocus />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <Label>Birim</Label>
            <CustomSelect value={birim} onChange={e => setBirim(e.target.value)}>
              {birimler.map(b => <option key={b} value={b}>{b}</option>)}
            </CustomSelect>
          </div>
          <div>
            <Label>Marka</Label>
            <Input value={marka} onChange={e => setMarka(e.target.value)} placeholder="Opsiyonel" />
          </div>
          <div>
            <Label>Model</Label>
            <Input value={model} onChange={e => setModel(e.target.value)} placeholder="Opsiyonel" />
          </div>
        </div>

        {hata && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: 'var(--danger-soft)', color: 'var(--danger)',
            font: '500 12px/16px var(--font-sans)',
          }}>
            {hata}
          </div>
        )}

        <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', margin: 0 }}>
          Stok kalemi oluşturulur. Detaylı bilgiler (kategori, görsel, fiyat vs.) Stok ekranından sonradan girilebilir.
        </p>

        <div style={{ display: 'flex', gap: 8, marginTop: 4, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onKapat} disabled={kaydediliyor}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Kaydediliyor…' : 'Ekle ve Devam'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
