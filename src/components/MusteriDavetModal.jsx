// Admin musteriye B2B portal davet gonderme modal'i.
// Email + Ad alir, "Portal Davet Gonder" deyince edge fn cagirir.

import { useState, useEffect } from 'react'
import { Mail, Send, CheckCircle2, Info } from 'lucide-react'
import { Modal, Button, Input, Label, Alert } from './ui'
import { davetGonder } from '../services/musteriDavetService'

export default function MusteriDavetModal({ open, onClose, musteri, onayKisi }) {
  // onayKisi: opsiyonel — ana kisi (auto-prefill icin)
  const [email, setEmail] = useState('')
  const [ad, setAd] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState('')
  const [basari, setBasari] = useState('')

  useEffect(() => {
    if (open) {
      // Ana kisi varsa onun bilgilerini pre-fill
      setEmail(onayKisi?.email || musteri?.email || '')
      const tamAd = [onayKisi?.ad, onayKisi?.soyad].filter(Boolean).join(' ')
      setAd(tamAd || '')
      setHata('')
      setBasari('')
    }
  }, [open, onayKisi, musteri])

  const gonder = async (e) => {
    e?.preventDefault?.()
    setHata('')
    setBasari('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setHata('Geçerli bir e-posta adresi girin.')
      return
    }
    setYukleniyor(true)
    try {
      const sonuc = await davetGonder({
        musteriId: musteri.id,
        email,
        ad,
      })
      setBasari(sonuc?.mesaj || 'Davet gönderildi.')
    } catch (err) {
      setHata(err?.message || 'Davet gönderilemedi.')
    } finally {
      setYukleniyor(false)
    }
  }

  const kapat = () => {
    if (yukleniyor) return
    onClose?.()
  }

  return (
    <Modal
      open={open}
      onClose={kapat}
      title="Portal Davet Gönder"
      width={520}
      footer={
        <>
          <Button variant="secondary" onClick={kapat} disabled={yukleniyor}>
            {basari ? 'Kapat' : 'İptal'}
          </Button>
          {!basari && (
            <Button
              variant="primary"
              iconLeft={<Send size={14} strokeWidth={1.5} />}
              onClick={gonder}
              disabled={yukleniyor}
            >
              {yukleniyor ? 'Gönderiliyor…' : 'Davet Gönder'}
            </Button>
          )}
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          background: 'var(--brand-primary-soft)', border: '1px solid var(--border-default)',
          borderRadius: 10, padding: '10px 12px',
        }}>
          <Info size={16} strokeWidth={2} style={{ color: 'var(--brand-primary)', flexShrink: 0, marginTop: 1 }} />
          <div style={{ font: '500 12.5px/17px var(--font-sans)', color: 'var(--text-secondary)' }}>
            <strong>{musteri?.firma}</strong> firmasına müşteri portalı davetiyesi gönderiyorsunuz.
            Davet edilen kişi linke tıklayıp şifre belirleyince hesap otomatik aktive olur ve müşteri olarak giriş yapar.
            Davet 7 gün geçerlidir.
          </div>
        </div>

        {basari ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(47,125,79,0.08)', border: '1px solid rgba(47,125,79,0.25)',
            borderRadius: 10, padding: '12px 14px',
          }}>
            <CheckCircle2 size={18} strokeWidth={2} style={{ color: '#2F7D4F', flexShrink: 0 }} />
            <div style={{ font: '600 13px/18px var(--font-sans)', color: '#2F7D4F' }}>{basari}</div>
          </div>
        ) : (
          <form onSubmit={gonder} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <Label htmlFor="davet-email">
                <Mail size={12} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                E-posta adresi <span style={{ color: 'var(--danger)' }}>*</span>
              </Label>
              <Input
                id="davet-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ad@firma.com"
                autoComplete="email"
                autoFocus
                disabled={yukleniyor}
              />
            </div>

            <div>
              <Label htmlFor="davet-ad">Davet edilen kişinin adı (opsiyonel)</Label>
              <Input
                id="davet-ad"
                type="text"
                value={ad}
                onChange={(e) => setAd(e.target.value)}
                placeholder="Ahmet Yılmaz"
                disabled={yukleniyor}
              />
            </div>

            {hata && (
              <Alert tone="danger">{hata}</Alert>
            )}
          </form>
        )}
      </div>
    </Modal>
  )
}
