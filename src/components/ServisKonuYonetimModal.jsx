// Servis konu başlıkları yönetimi (mig 285) — yalnız admin.
//
// SİLME YOK, pasife alma var: başlık metni binlerce raporda yaşıyor; pasif
// başlık yeni taleplerde seçilemez ama geçmiş kayıtlar bozulmaz.

import { useState, useEffect, useRef } from 'react'
import { Plus, EyeOff, Eye } from 'lucide-react'
import { Button, Input, Modal, Badge } from './ui'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { tumKonulariGetir, konuEkle, konuAktifDegistir } from '../services/servisKonuService'

export default function ServisKonuYonetimModal({ acik, onKapat }) {
  const { toast } = useToast()
  const { kullanici } = useAuth()
  const [konular, setKonular] = useState([])
  const [yeniAd, setYeniAd] = useState('')
  const [mesgul, setMesgul] = useState(false)
  const kilit = useRef(false)   // çift tıklama: setState asenkron, ref senkron

  const yukle = () => { tumKonulariGetir().then(setKonular) }
  useEffect(() => { if (acik) yukle() }, [acik])

  if (!acik) return null

  const ekle = async () => {
    if (kilit.current) return
    kilit.current = true
    setMesgul(true)
    try {
      const sonuc = await konuEkle(yeniAd, kullanici?.id)
      if (sonuc?._hata) { toast.error(sonuc._hata); return }
      toast.success(`"${sonuc.ad}" eklendi.`)
      setYeniAd('')
      yukle()
    } finally { kilit.current = false; setMesgul(false) }
  }

  const aktifDegistir = async (k) => {
    const sonuc = await konuAktifDegistir(k.id, !k.aktif)
    if (sonuc?._hata) { toast.error(sonuc._hata); return }
    toast.success(k.aktif
      ? `"${k.ad}" pasife alındı — yeni taleplerde görünmez.`
      : `"${k.ad}" tekrar aktif.`)
    yukle()
  }

  return (
    <Modal open onClose={onKapat} title="Servis Konu Başlıkları" width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="t-caption" style={{ margin: 0, color: 'var(--text-tertiary)' }}>
          Yeni servis talepleri yalnız bu listeden konu seçebilir (web, mobil ve
          müşteri portalı). Başlık silinmez, pasife alınır — geçmiş raporlar bozulmaz.
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            value={yeniAd}
            onChange={e => setYeniAd(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') ekle() }}
            placeholder="Yeni başlık — örn: YANGIN ALGILAMA"
            style={{ flex: 1 }}
          />
          <Button variant="primary" onClick={ekle} disabled={mesgul || !yeniAd.trim()}
            iconLeft={<Plus size={14} strokeWidth={1.5} />}>
            Ekle
          </Button>
        </div>

        <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
          {konular.map(k => (
            <div key={k.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              padding: '8px 12px', borderBottom: '1px solid var(--border-subtle, var(--border-default))',
              opacity: k.aktif ? 1 : 0.55,
            }}>
              <span style={{ font: '500 13px/18px var(--font-sans)' }}>
                {k.ad} {!k.aktif && <Badge tone="neutral">pasif</Badge>}
              </span>
              <Button variant="tertiary" size="sm" onClick={() => aktifDegistir(k)}
                iconLeft={k.aktif ? <EyeOff size={13} strokeWidth={1.5} /> : <Eye size={13} strokeWidth={1.5} />}>
                {k.aktif ? 'Pasife al' : 'Aktifle'}
              </Button>
            </div>
          ))}
          {konular.length === 0 && (
            <div style={{ padding: 14, font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-tertiary)' }}>
              Yükleniyor…
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
