// Yeni Ön Sipariş Wizard — iki adımlı modal.
// Adım 1: Müşteri seç + görüşme bilgileri → arka planda görüşme oluşturur (GRS-...)
// Adım 2: OnSiparisModal aynı görüşmeyle açılır, kalemler eklenir.
// Kullanım:
//   const [acik, setAcik] = useState(false)
//   {acik && <YeniOnSiparisWizard onKapat={() => setAcik(false)} onKaydedildi={() => refreshList()} />}

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ShoppingCart, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Button, Input, Label } from './ui'
import CustomSelect from './CustomSelect'
import OnSiparisModal from './OnSiparisModal'
import { musterileriGetir } from '../services/musteriService'
import { gorusmeEkle } from '../services/gorusmeService'

export default function YeniOnSiparisWizard({ onKapat, onKaydedildi }) {
  const { kullanici, kullanicilar } = useAuth()
  const { toast } = useToast()
  const [step, setStep] = useState('musteri') // 'musteri' | 'kalem'
  const [yeniGorusme, setYeniGorusme] = useState(null)
  const [musteriler, setMusteriler] = useState([])

  useEffect(() => {
    musterileriGetir().then(setMusteriler).catch(() => setMusteriler([]))
  }, [])

  const gorusmeOlustur = async (payload) => {
    const yeni = await gorusmeEkle({
      tarih: new Date().toISOString().slice(0, 10),
      saat: new Date().toTimeString().slice(0, 5),
      firmaAdi: payload.firmaAdi,
      musteriId: payload.musteriId || null,
      muhatapAd: payload.muhatapAd,
      konu: payload.konu,
      gorusen: payload.gorusen || kullanici?.ad || '',
      durum: 'acik',
      tip: 'diğer',
      hazirlayan: kullanici?.ad || '',
      olusturanId: kullanici?.id || null,
      notlar: '',
    })
    if (!yeni) {
      toast.error('Görüşme oluşturulamadı.')
      return null
    }
    return yeni
  }

  if (step === 'musteri') {
    return (
      <Adim1MusteriSec
        musteriler={musteriler}
        kullanicilar={kullanicilar}
        kullanici={kullanici}
        onKapat={onKapat}
        onDevam={async (payload) => {
          const g = await gorusmeOlustur(payload)
          if (!g) return
          setYeniGorusme(g)
          setStep('kalem')
        }}
      />
    )
  }

  if (step === 'kalem' && yeniGorusme) {
    return (
      <OnSiparisModal
        gorusme={yeniGorusme}
        mevcutOnSiparis={null}
        onKapat={() => { onKapat?.() }}
        onKaydedildi={(kayit) => {
          toast.success(`Ön sipariş oluşturuldu: ${kayit?.onSiparisNo || ''}`)
          onKaydedildi?.(kayit)
          onKapat?.()
        }}
      />
    )
  }

  return null
}

// ─── Adım 1: müşteri + görüşme bilgileri ──────────────────────────────────
function Adim1MusteriSec({ musteriler, kullanicilar, kullanici, onKapat, onDevam }) {
  const [musteriId, setMusteriId] = useState('')
  const [manuelFirma, setManuelFirma] = useState('')
  const [manuelMi, setManuelMi] = useState(false)
  const [muhatapAd, setMuhatapAd] = useState('')
  const [konu, setKonu] = useState('')
  const [gorusen, setGorusen] = useState(kullanici?.ad || '')
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const musteriSecili = musteriler.find(m => m.id === Number(musteriId))
  const firmaAdi = manuelMi ? manuelFirma.trim() : (musteriSecili?.firma || musteriSecili?.ad || '')
  const gecerli = firmaAdi && konu.trim() && gorusen.trim()

  const kaydet = async () => {
    if (!gecerli) return
    setKaydediliyor(true)
    try {
      await onDevam({
        musteriId: manuelMi ? null : Number(musteriId) || null,
        firmaAdi,
        muhatapAd: muhatapAd.trim(),
        konu: konu.trim(),
        gorusen: gorusen.trim(),
      })
    } finally {
      setKaydediliyor(false)
    }
  }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: 'var(--surface-card)', color: 'var(--text-primary)',
        borderRadius: 14, padding: 20, maxWidth: 560, width: '100%',
        border: '1px solid var(--border-default)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShoppingCart size={18} strokeWidth={1.5} />
              Yeni Ön Sipariş
            </h2>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Adım 1/2: Müşteri ve görüşme bilgileri — GRS numarası otomatik atanacak
            </div>
          </div>
          <button onClick={onKapat}
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}>
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <Label>
            Müşteri
            <button
              type="button"
              onClick={() => { setManuelMi(!manuelMi); setMusteriId(''); setManuelFirma('') }}
              style={{
                marginLeft: 8, background: 'none', border: 'none', color: 'var(--brand)',
                cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0,
              }}
            >
              {manuelMi ? 'Listeden Seç' : 'Manuel Yaz'}
            </button>
          </Label>
          {!manuelMi ? (
            <CustomSelect value={musteriId} onChange={e => setMusteriId(e.target.value)}>
              <option value="">Müşteri seç…</option>
              {musteriler.map(m => (
                <option key={m.id} value={m.id}>{m.firma || m.ad || `#${m.id}`}</option>
              ))}
            </CustomSelect>
          ) : (
            <Input value={manuelFirma} onChange={e => setManuelFirma(e.target.value)} placeholder="Firma adı..." />
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <Label>Muhatap</Label>
            <Input value={muhatapAd} onChange={e => setMuhatapAd(e.target.value)} placeholder="Görüşülen kişi (opsiyonel)" />
          </div>
          <div>
            <Label>Görüşen Personel *</Label>
            {kullanicilar && kullanicilar.length > 0 ? (
              <CustomSelect value={gorusen} onChange={e => setGorusen(e.target.value)}>
                <option value="">Seç…</option>
                {kullanicilar.map(k => (
                  <option key={k.id} value={k.ad}>{k.ad}</option>
                ))}
              </CustomSelect>
            ) : (
              <Input value={gorusen} onChange={e => setGorusen(e.target.value)} />
            )}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Label>Konu *</Label>
          <Input value={konu} onChange={e => setKonu(e.target.value)} placeholder="Örn. Kamera Sistemi Talebi..." />
        </div>

        <div style={{ padding: 10, borderRadius: 6, background: 'rgba(59,130,246,0.08)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16 }}>
          "Devam" tuşuyla görüşme kaydı oluşturulacak (GRS-2026-...), sonra ön sipariş formu açılacak.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" onClick={onKapat}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={!gecerli || kaydediliyor}>
            {kaydediliyor ? 'Görüşme oluşturuluyor…' : 'Devam →'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
