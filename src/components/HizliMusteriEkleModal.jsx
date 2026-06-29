// Teklif/Servis akışında müşteri seçerken aranan müşteri yoksa hızlıca ekleyebilmek için.
// Minimum alanlar (firma + ad + soyad zorunlu, tel/email opsiyonel).
// Detaylar Müşteriler ekranından sonradan girilebilir.
//
// Kullanım:
//   <HizliMusteriEkleModal
//     acik={modalAcik}
//     baslangicFirma={arananMetin}
//     onKapat={() => setModalAcik(false)}
//     onEklendi={(yeniMusteri) => {
//       // listeye ekle + form.musteriId = yeniMusteri.id
//     }}
//   />

import { useState, useEffect } from 'react'
import { Button, Modal, Input, Label } from './ui'
import { musteriEkle, musterileriGetir } from '../services/musteriService'

// Musteriler.jsx ile ayni kod uretme mantigi — firma adindan 3 harfli prefix + sira
function firmaKoduOlustur(firmaAdi, mevcutMusteriler) {
  const temiz = (firmaAdi || '').toUpperCase().replace(/[^A-ZÇĞİÖŞÜ]/g, '')
  const prefix = temiz.substring(0, 3).padEnd(3, 'X')
  const ayniPrefix = (mevcutMusteriler || []).filter(m => m.kod?.startsWith(prefix))
  const sayi = ayniPrefix.length + 1
  return `${prefix}-${String(sayi).padStart(4, '0')}`
}

export default function HizliMusteriEkleModal({
  acik,
  baslangicFirma = '',
  onKapat,
  onEklendi,
}) {
  const [firma, setFirma] = useState('')
  const [ad, setAd] = useState('')
  const [soyad, setSoyad] = useState('')
  const [telefon, setTelefon] = useState('')
  const [email, setEmail] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState(null)

  useEffect(() => {
    if (acik) {
      setFirma(baslangicFirma || '')
      setAd('')
      setSoyad('')
      setTelefon('')
      setEmail('')
      setHata(null)
      setKaydediliyor(false)
    }
  }, [acik])

  if (!acik) return null

  const kaydet = async () => {
    setHata(null)
    if (!firma.trim()) { setHata('Firma adı zorunlu.'); return }
    if (!ad.trim()) { setHata('Yetkili adı zorunlu.'); return }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setHata('Geçerli bir e-posta gir.')
      return
    }
    setKaydediliyor(true)
    try {
      // kod NOT NULL — Musteriler.jsx ile ayni mantikla auto-uret
      const mevcut = await musterileriGetir()
      const kod = firmaKoduOlustur(firma.trim(), mevcut)
      const yeni = await musteriEkle({
        firma: firma.trim(),
        kod,
        ad: ad.trim(),
        soyad: soyad.trim() || null,
        telefon: telefon.trim() || null,
        email: email.trim() || null,
        durum: 'aktif',
      })
      if (!yeni) {
        setHata('Müşteri eklenemedi (DB hatası).')
        return
      }
      onEklendi?.(yeni)
      onKapat?.()
    } catch (e) {
      setHata(e?.message ?? 'Müşteri eklenemedi.')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <Modal open={acik} onClose={onKapat} title="Hızlı Müşteri Ekle" width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <Label required>Firma Adı</Label>
          <Input
            value={firma}
            onChange={e => setFirma(e.target.value)}
            placeholder="Firma / şirket adı"
            autoFocus
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label required>Yetkili Adı</Label>
            <Input value={ad} onChange={e => setAd(e.target.value)} placeholder="Ad" />
          </div>
          <div>
            <Label>Yetkili Soyadı</Label>
            <Input value={soyad} onChange={e => setSoyad(e.target.value)} placeholder="Soyad" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label>Telefon</Label>
            <Input value={telefon} onChange={e => setTelefon(e.target.value)} placeholder="+90..." />
          </div>
          <div>
            <Label>E-posta</Label>
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="ornek@firma.com" />
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
          Müşteri kaydı oluşturulur. Adres, vergi no, ek bilgiler "Müşteriler" ekranından sonradan girilebilir.
        </p>

        <div style={{ display: 'flex', gap: 8, marginTop: 4, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onKapat} disabled={kaydediliyor}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Kaydediliyor…' : 'Ekle ve Seç'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
