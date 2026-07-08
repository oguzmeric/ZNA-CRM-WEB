// Teklif veya Servis Raporu'nu musteriye mail/SMS ile gondermek icin modal.
//
// Kullanim:
//   <BelgePaylasModal
//     acik={modalAcik}
//     onKapat={() => setModalAcik(false)}
//     belgeTipi="teklif"             // veya 'servis_raporu'
//     belgeId={teklif.id}
//     baslangicEmail={musteri.email}
//     baslangicGsm={musteri.telefon}
//     belgeBaslik={`#${teklif.id} — ${teklif.musteri}`}
//   />

import { useState, useEffect } from 'react'
import { Mail, MessageCircle, Send, Check, AlertTriangle, Copy, ExternalLink } from 'lucide-react'
import { Button, Modal, Input, Label, Textarea } from './ui'
import { belgePaylas } from '../services/belgePaylasimService'

const KANAL_SECENEKLERI = [
  { id: 'mail',       label: 'Sadece E-posta', icon: Mail },
  { id: 'sms',        label: 'Sadece SMS',     icon: MessageCircle },
  { id: 'her_ikisi',  label: 'E-posta + SMS',  icon: Send },
]

const SURE_SECENEKLERI = [
  { gun: 7,   label: '7 gün' },
  { gun: 30,  label: '30 gün' },
  { gun: 90,  label: '90 gün' },
  { gun: 365, label: '1 yıl' },
]

const SABLON_SECENEKLERI = [
  { id: 'standart',       label: 'Standart' },
  { id: 'standart_pacal', label: 'Standart Paçal' },
  { id: 'trassir',        label: 'Trassir' },
  { id: 'trassir_pacal',  label: 'Trassir Paçal' },
  { id: 'karel',          label: 'Karel' },
  { id: 'karel_pacal',    label: 'Karel Paçal' },
]

export default function BelgePaylasModal({
  acik,
  onKapat,
  belgeTipi,         // 'teklif' | 'servis_raporu'
  belgeId,
  baslangicEmail = '',
  baslangicGsm   = '',
  baslangicSablon = 'standart',   // teklifin kayitli sablonu — default secim
  belgeBaslik    = '',
}) {
  const [kanal, setKanal] = useState('mail')
  const [email, setEmail] = useState('')
  const [gsm, setGsm] = useState('')
  const [sureGun, setSureGun] = useState(30)
  const [sablon, setSablon] = useState('standart')
  const [sirket, setSirket] = useState('zna') // servis raporu: ZNA / Anadolunet
  const [ozelMesaj, setOzelMesaj] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [hata, setHata] = useState(null)
  const [sonuc, setSonuc] = useState(null)

  useEffect(() => {
    if (acik) {
      setKanal('mail')
      setEmail(baslangicEmail || '')
      setGsm(baslangicGsm || '')
      setSureGun(30)
      setSablon(baslangicSablon || 'standart')
      setSirket('zna')
      setOzelMesaj('')
      setHata(null)
      setSonuc(null)
      setGonderiliyor(false)
    }
  }, [acik, baslangicEmail, baslangicGsm, baslangicSablon])

  if (!acik) return null

  const mailGerekli = kanal === 'mail' || kanal === 'her_ikisi'
  const smsGerekli  = kanal === 'sms'  || kanal === 'her_ikisi'

  const gonder = async () => {
    setHata(null)
    if (mailGerekli && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setHata('Geçerli bir e-posta adresi girin.')
      return
    }
    if (smsGerekli && !/^\d{10,11}$/.test(gsm.replace(/[^\d]/g, ''))) {
      setHata('Geçerli bir GSM numarası girin (örnek: 5XX XXX XX XX).')
      return
    }
    setGonderiliyor(true)
    try {
      const res = await belgePaylas({
        belge_tipi: belgeTipi,
        belge_id: belgeId,
        kanal,
        email: mailGerekli ? email.trim() : undefined,
        gsm: smsGerekli ? gsm.trim() : undefined,
        sure_gun: sureGun,
        sablon: belgeTipi === 'teklif' ? sablon : undefined,
        sirket: belgeTipi === 'servis_raporu' ? sirket : undefined,
        ozel_mesaj: ozelMesaj.trim() || undefined,
      })
      setSonuc(res)
    } catch (e) {
      setHata(e.message)
    } finally {
      setGonderiliyor(false)
    }
  }

  const linkKopyala = async () => {
    if (!sonuc?.link) return
    try {
      await navigator.clipboard.writeText(sonuc.link)
    } catch {}
  }

  const baslik = belgeTipi === 'teklif' ? 'Teklifi Müşteriye Gönder' : 'Servis Raporunu Müşteriye Gönder'

  // ─── BASARILI SONUC EKRANI ─────────────────────────────────────────────
  if (sonuc) {
    return (
      <Modal open={acik} onClose={onKapat} title="Paylaşım Hazır" width={560}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            background: sonuc.kismi ? 'var(--surface-warning, #FFF7E6)' : 'var(--surface-success, #E8F7EE)',
            border: `1px solid ${sonuc.kismi ? '#F59E0B' : '#10B981'}`,
            borderRadius: 12, padding: 16,
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            {sonuc.kismi
              ? <AlertTriangle size={20} style={{ color: '#F59E0B', flexShrink: 0, marginTop: 2 }} />
              : <Check size={20} style={{ color: '#10B981', flexShrink: 0, marginTop: 2 }} />}
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.55 }}>
              {sonuc.mail_durumu === 'gonderildi' && <div>✉️ E-posta gönderildi: <strong>{email}</strong></div>}
              {sonuc.mail_durumu && sonuc.mail_durumu !== 'gonderildi' && <div style={{ color: '#B45309' }}>✉️ Mail hatası: {sonuc.mail_durumu.replace('hata: ', '')}</div>}
              {sonuc.sms_durumu === 'gonderildi' && <div>📱 SMS gönderildi: <strong>{gsm}</strong></div>}
              {sonuc.sms_durumu && sonuc.sms_durumu !== 'gonderildi' && <div style={{ color: '#B45309' }}>📱 SMS hatası: {sonuc.sms_durumu.replace('hata: ', '')}</div>}
            </div>
          </div>

          <div>
            <Label>Paylaşım Linki ({sureGun} gün geçerli)</Label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <Input value={sonuc.link} readOnly style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12 }} />
              <Button variant="secondary" onClick={linkKopyala} title="Kopyala">
                <Copy size={16} />
              </Button>
              <Button variant="secondary" onClick={() => window.open(sonuc.link, '_blank')} title="Aç">
                <ExternalLink size={16} />
              </Button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
              Bu linki başka kanallardan (WhatsApp, Telegram vb.) da paylaşabilirsiniz.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <Button variant="secondary" onClick={onKapat}>Kapat</Button>
          </div>
        </div>
      </Modal>
    )
  }

  // ─── GONDERIM FORMU ────────────────────────────────────────────────────
  return (
    <Modal open={acik} onClose={onKapat} title={baslik} width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {belgeBaslik && (
          <div style={{
            background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)',
            borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--text-secondary)',
          }}>
            <strong style={{ color: 'var(--text-primary)' }}>Belge:</strong> {belgeBaslik}
          </div>
        )}

        {/* Sablon secimi — sadece teklif icin */}
        {belgeTipi === 'teklif' && (
          <div>
            <Label>Teklif Şablonu</Label>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {SABLON_SECENEKLERI.map(({ id, label }) => {
                const aktif = sablon === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSablon(id)}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 8,
                      border: aktif ? '1.5px solid var(--accent, #1E5AA8)' : '1px solid var(--border-subtle)',
                      background: aktif ? 'rgba(30,90,168,0.06)' : 'var(--surface-bg)',
                      color: aktif ? 'var(--accent, #1E5AA8)' : 'var(--text-secondary)',
                      cursor: 'pointer', fontSize: 13, fontWeight: aktif ? 600 : 500,
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Müşteri linke tıkladığında seçtiğiniz şablonla görür.
            </div>
          </div>
        )}

        {belgeTipi === 'servis_raporu' && (
          <div>
            <Label>Form Şirketi</Label>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {[{ id: 'zna', label: 'ZNA Teknoloji' }, { id: 'anadolunet', label: 'Anadolunet' }].map(({ id, label }) => {
                const aktif = sirket === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSirket(id)}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 8,
                      border: aktif ? '1.5px solid var(--accent, #1E5AA8)' : '1px solid var(--border-subtle)',
                      background: aktif ? 'rgba(30,90,168,0.06)' : 'var(--surface-bg)',
                      color: aktif ? 'var(--accent, #1E5AA8)' : 'var(--text-secondary)',
                      cursor: 'pointer', fontSize: 13, fontWeight: aktif ? 600 : 500,
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Müşteri formu seçtiğiniz şirket başlığıyla görür.
            </div>
          </div>
        )}

        {/* Kanal secimi */}
        <div>
          <Label>Gönderim Kanalı</Label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {KANAL_SECENEKLERI.map(({ id, label, icon: Icon }) => {
              const aktif = kanal === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setKanal(id)}
                  style={{
                    flex: 1, padding: '12px 10px', borderRadius: 10,
                    border: aktif ? '2px solid var(--accent, #1E5AA8)' : '1px solid var(--border-subtle)',
                    background: aktif ? 'rgba(30,90,168,0.06)' : 'var(--surface-bg)',
                    color: aktif ? 'var(--accent, #1E5AA8)' : 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: 13, fontWeight: aktif ? 600 : 500,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    transition: 'all 0.15s',
                  }}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* E-posta input */}
        {mailGerekli && (
          <div>
            <Label htmlFor="paylas-email">E-posta Adresi</Label>
            <Input
              id="paylas-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="musteri@example.com"
              autoFocus
            />
          </div>
        )}

        {/* GSM input */}
        {smsGerekli && (
          <div>
            <Label htmlFor="paylas-gsm">GSM Numarası</Label>
            <Input
              id="paylas-gsm"
              type="tel"
              value={gsm}
              onChange={(e) => setGsm(e.target.value)}
              placeholder="5XX XXX XX XX"
              autoFocus={!mailGerekli}
            />
          </div>
        )}

        {/* Sure */}
        <div>
          <Label>Link Geçerlilik Süresi</Label>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {SURE_SECENEKLERI.map(({ gun, label }) => {
              const aktif = sureGun === gun
              return (
                <button
                  key={gun}
                  type="button"
                  onClick={() => setSureGun(gun)}
                  style={{
                    padding: '8px 14px', borderRadius: 8,
                    border: aktif ? '1.5px solid var(--accent, #1E5AA8)' : '1px solid var(--border-subtle)',
                    background: aktif ? 'rgba(30,90,168,0.06)' : 'var(--surface-bg)',
                    color: aktif ? 'var(--accent, #1E5AA8)' : 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: 13, fontWeight: aktif ? 600 : 500,
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Ozel mesaj */}
        <div>
          <Label htmlFor="paylas-mesaj">Müşteriye Not (opsiyonel — sadece e-postada görünür)</Label>
          <Textarea
            id="paylas-mesaj"
            value={ozelMesaj}
            onChange={(e) => setOzelMesaj(e.target.value)}
            placeholder="Sayın ... , talep ettiğiniz teklif ektedir..."
            rows={3}
            maxLength={500}
          />
          <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {ozelMesaj.length}/500
          </div>
        </div>

        {hata && (
          <div style={{
            background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8,
            padding: '10px 14px', color: '#991B1B', fontSize: 13,
          }}>
            {hata}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <Button variant="secondary" onClick={onKapat} disabled={gonderiliyor}>İptal</Button>
          <Button variant="primary" onClick={gonder} disabled={gonderiliyor}>
            {gonderiliyor ? 'Gönderiliyor…' : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Send size={14} /> Gönder
              </span>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
