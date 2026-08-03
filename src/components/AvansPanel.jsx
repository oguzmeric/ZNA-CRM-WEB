// Avans onay paneli — İK Yönetim sayfasının "Avans Onayları" sekmesi (mig 255).
// Akış: bekleyen → onay/ret → "Ödendi" → taksit planı → aylık kesinti işareti.
// IKYonetim.jsx zaten uzun olduğu için ayrı dosyada.

import { useState } from 'react'
import { CheckCircle2, XCircle, Clock, Trash2, Banknote, Wallet } from 'lucide-react'
import {
  avansDurumBilgi, tutarBicim, donemBicim,
} from '../services/ikService'
import {
  Button, Input, Textarea, Label, Card, Badge, EmptyState, Modal,
} from './ui'

// IZIN_DURUM/AVANS_DURUM tone'ları Badge TONE haritasıyla birebir örtüşmüyor —
// köprü olmadan "Onaylandı" gri görünür (IKYonetim'dekiyle aynı eşleme).
const BADGE_TONE = { basari: 'basarili', 'nötr': 'neutral', beklemede: 'beklemede', kayip: 'kayip' }
const avansBadge = (durum) => {
  const b = avansDurumBilgi(durum)
  return <Badge tone={BADGE_TONE[b.tone] || b.tone}>{b.isim}</Badge>
}

const fmtTarih = (t) => t
  ? new Date(String(t).length === 10 ? t + 'T00:00:00' : t).toLocaleDateString('tr-TR')
  : '—'

function KpiKutu({ ikon, etiket, deger, renk }) {
  return (
    <Card style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--surface-sunken)', color: renk,
      }}>
        {ikon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{etiket}</div>
        <div style={{ font: '700 16px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{deger}</div>
      </div>
    </Card>
  )
}

export default function AvansOnaylari({ avanslar, mesgul, onKarar, onOde, onTaksit, onSil }) {
  const bekleyenler = avanslar.filter(a => a.durum === 'bekliyor')
  // Onaylandı ama para henüz verilmedi — kolay unutulan adım, ayrı sayaç
  const odemeBekleyen = avanslar.filter(a => a.durum === 'onaylandi' && !a.odemeTarihi)
  const toplamAcikBorc = avanslar.reduce((s, a) => s + (a.kalanBorc || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <KpiKutu ikon={<Clock size={16} />} etiket="Onay bekleyen" deger={bekleyenler.length} renk="var(--warning)" />
        <KpiKutu ikon={<Wallet size={16} />} etiket="Ödeme bekleyen" deger={odemeBekleyen.length} renk="#b45309" />
        <KpiKutu ikon={<Banknote size={16} />} etiket="Açık avans borcu" deger={tutarBicim(toplamAcikBorc)} renk="var(--brand-primary)" />
      </div>

      {avanslar.length === 0 ? (
        <EmptyState
          icon={<Banknote size={40} strokeWidth={1.5} />}
          title="Henüz avans talebi yok"
          description="Personel İzin & Bordro sayfasından avans talebi oluşturduğunda burada görünür."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {avanslar.map(a => {
            const islemde = mesgul === a.id
            return (
              <Card key={a.id} style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className="t-body-strong">{a.kullaniciAd || `#${a.kullaniciId}`}</span>
                      <span style={{ font: '700 15px/20px var(--font-sans)', color: 'var(--brand-primary)' }}>
                        {tutarBicim(a.tutar)}
                      </span>
                      <Badge tone="lead">{a.taksitSayisi} taksit</Badge>
                      {avansBadge(a.durum)}
                      {a.odemeTarihi
                        ? <Badge tone="basarili">Ödendi</Badge>
                        : a.durum === 'onaylandi' && <Badge tone="beklemede">Ödeme bekliyor</Badge>}
                    </div>
                    {a.gerekce && (
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 5 }}>{a.gerekce}</div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 5 }}>
                      Talep: {fmtTarih(a.olusturmaTarih)}
                      {a.onaylayanAd && <> · Karar: {a.onaylayanAd}</>}
                      {a.odeyenAd && <> · Ödeyen: {a.odeyenAd}</>}
                    </div>
                    {a.kararNotu && (
                      <div style={{
                        marginTop: 6, padding: '6px 10px', borderRadius: 8,
                        background: 'var(--surface-sunken)', fontSize: 12, color: 'var(--text-secondary)',
                      }}>
                        <strong>Karar notu:</strong> {a.kararNotu}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                    {a.durum === 'bekliyor' && (
                      <>
                        <Button size="sm" variant="primary" iconLeft={<CheckCircle2 size={12} />}
                          disabled={islemde} onClick={() => onKarar(a, 'onaylandi')}>
                          Onayla
                        </Button>
                        <Button size="sm" variant="secondary" iconLeft={<XCircle size={12} />}
                          disabled={islemde} onClick={() => onKarar(a, 'reddedildi')}
                          style={{ color: 'var(--danger)' }}>
                          Reddet
                        </Button>
                      </>
                    )}
                    {a.durum === 'onaylandi' && !a.odemeTarihi && (
                      <Button size="sm" variant="primary" iconLeft={<Banknote size={12} />}
                        disabled={islemde} onClick={() => onOde(a)}
                        style={{ background: '#16a34a' }}>
                        Ödendi İşaretle
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" iconLeft={<Trash2 size={12} />}
                      onClick={() => onSil(a)} style={{ color: 'var(--danger)' }}>
                      Sil
                    </Button>
                  </div>
                </div>

                {/* Taksitler — tıklayınca kesildi / geri al */}
                {a.taksitler?.length > 0 && (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border-default)', paddingTop: 10 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                      Taksitler — bordro kesildikçe tıklayıp işaretleyin
                      {a.kalanBorc > 0 && <> · <strong>Kalan: {tutarBicim(a.kalanBorc)}</strong></>}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {a.taksitler.map(t => {
                        const kesildi = !!t.kesintiTarihi
                        const bekle = mesgul === t.id
                        return (
                          <button
                            key={t.id}
                            onClick={() => onTaksit(t, !kesildi)}
                            disabled={bekle}
                            title={kesildi ? 'Kesintiyi geri al' : 'Kesildi olarak işaretle'}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '5px 11px', borderRadius: 'var(--radius-pill)',
                              fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
                              cursor: bekle ? 'wait' : 'pointer', opacity: bekle ? 0.6 : 1,
                              background: kesildi ? 'rgba(34,197,94,0.12)' : 'var(--surface-card)',
                              color: kesildi ? '#15803d' : 'var(--text-secondary)',
                              border: `1px solid ${kesildi ? 'rgba(34,197,94,0.35)' : 'var(--border-default)'}`,
                            }}
                          >
                            {kesildi ? <CheckCircle2 size={11} strokeWidth={2} /> : <Clock size={11} strokeWidth={1.5} />}
                            {donemBicim(t.donem)} · {tutarBicim(t.tutar)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function AvansKararModal({ avans, durum, mesgul, onKapat, onOnay }) {
  const [not, setNot] = useState('')
  const onayMi = durum === 'onaylandi'
  return (
    <Modal open onClose={onKapat} title={onayMi ? 'Avansı Onayla' : 'Avansı Reddet'} width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--surface-sunken)', fontSize: 13 }}>
          <strong>{avans.kullaniciAd || 'Personel'}</strong> · {tutarBicim(avans.tutar)} · {avans.taksitSayisi} taksit
          <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 3 }}>
            Aylık kesinti: {tutarBicim(avans.tutar / avans.taksitSayisi)}
          </div>
        </div>
        {onayMi && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Onaydan sonra ödemeyi ayrıca <strong>“Ödendi İşaretle”</strong> ile kaydedeceksiniz —
            taksit planı o an oluşur.
          </div>
        )}
        <div>
          <Label>{onayMi ? 'Not (opsiyonel)' : 'Ret gerekçesi'}</Label>
          <Textarea rows={3} value={not} onChange={e => setNot(e.target.value)}
            placeholder={onayMi
              ? 'Örn: Eylül bordrosundan başlanacak.'
              : 'Örn: Önceki avans borcu kapanmadan yeni avans verilemiyor.'} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onKapat} disabled={mesgul}>Vazgeç</Button>
          <Button variant="primary" disabled={mesgul} onClick={() => onOnay(not)}
            style={onayMi ? undefined : { background: 'var(--danger)' }}>
            {mesgul ? 'Kaydediliyor…' : (onayMi ? 'Onayla' : 'Reddet')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function AvansOdemeModal({ avans, mesgul, onKapat, onOnay }) {
  // Varsayılan ilk kesinti GELECEK AY: ay ortasında verilen avans o ayın
  // bordrosuna çoğunlukla yetişmiyor. İK isterse başka ay seçebilir.
  const gelecekAy = (() => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()
  const [donem, setDonem] = useState(gelecekAy)

  return (
    <Modal open onClose={onKapat} title="Avans Ödemesini İşaretle" width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--surface-sunken)', fontSize: 13 }}>
          <strong>{avans.kullaniciAd || 'Personel'}</strong> · {tutarBicim(avans.tutar)}
          <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 3 }}>
            {avans.taksitSayisi} taksit × yaklaşık {tutarBicim(avans.tutar / avans.taksitSayisi)}
          </div>
        </div>
        <div>
          <Label required>İlk kesinti hangi aydan başlasın?</Label>
          <Input type="month" value={donem} onChange={e => setDonem(e.target.value)} />
          <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Taksit planı bu aydan itibaren {avans.taksitSayisi} ay olarak oluşturulur;
            küsurat son taksite eklenir.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onKapat} disabled={mesgul}>Vazgeç</Button>
          <Button variant="primary" disabled={mesgul || !donem}
            style={{ background: '#16a34a' }}
            onClick={() => onOnay(donem ? `${donem}-01` : null)}>
            {mesgul ? 'İşaretleniyor…' : 'Ödendi İşaretle'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
