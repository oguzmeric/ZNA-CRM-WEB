// Görev yaşam döngüsü aksiyonları (spek madde 11, 14, 38):
//  - Atanana: Kabul Et / Bilgi Talep Et / Reddet / Tarih Revizesi İste
//  - Sorumluya: Görevi Devret
//  - Onaylayıcıya: Onayla / Revize İste / Reddet (durum onay_bekliyor iken)
//  - Oluşturana: bekleyen tarih revize talebini onayla/reddet
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, XCircle, HelpCircle, CalendarClock, ArrowRightLeft, X } from 'lucide-react'
import {
  gorevKabulEt, gorevReddet, gorevGuncelle, gorevDevret,
  gorevOnayla, gorevRevizeIste, gorevOnayReddet,
} from '../../services/gorevService'
import { gorevYorumEkle } from '../../services/gorevYorumService'
import { useBildirim } from '../../context/BildirimContext'
import { useToast } from '../../context/ToastContext'
import { RET_SEBEPLERI, gorevYetkisi, gorevSorumlusuMu, bugunStr } from '../../lib/gorevSabitleri'
import { Button, Input, Textarea, Label, Card, CardTitle } from '../ui'
import CustomSelect from '../CustomSelect'

const trTarih = (t) => (t ? String(t).slice(0, 10).split('-').reverse().join('.') : '—')

function ModalKabuk({ baslik, onKapat, children }) {
  return createPortal(
    <div onClick={onKapat} style={{
      position: 'fixed', inset: 0, zIndex: 100000, padding: 20,
      background: 'rgba(15, 23, 42, 0.72)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--surface-card)', border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: 22,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ font: '700 15px/20px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>{baslik}</h3>
          <button onClick={onKapat} aria-label="Kapat" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4 }}>
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export default function GorevAkisKarti({ gorev, kullanici, kullanicilar, onGuncellendi }) {
  const { bildirimEkle } = useBildirim()
  const { toast } = useToast()
  const [modal, setModal] = useState(null) // 'ret' | 'bilgi' | 'revize' | 'devir' | 'onay_ret' | 'onay_revize'
  const [metin, setMetin] = useState('')
  const [retSebep, setRetSebep] = useState(RET_SEBEPLERI[0])
  const [istenenTarih, setIstenenTarih] = useState('')
  const [devirKisi, setDevirKisi] = useState('')
  const [mesgul, setMesgul] = useState(false)

  const uid = String(kullanici?.id ?? '___')
  const benAtanan = String(gorev.atananId ?? gorev.atanan ?? '') === uid
  const benOlusturan = String(gorev.olusturanId ?? '') === uid || gorev.olusturanAd === kullanici?.ad || gorev.olusturanAd === kullanici?.kullaniciAdi
  const benOnaylayici = gorev.onaylayiciId
    ? String(gorev.onaylayiciId) === uid
    : benOlusturan // onaylayıcı seçilmemişse oluşturan onaylar (madde 14)
  const kapali = ['tamamlandi', 'iptal', 'reddedildi'].includes(gorev.durum)

  const olusturanKisi = kullanicilar?.find(k =>
    String(k.id) === String(gorev.olusturanId ?? '') || k.ad === gorev.olusturanAd || k.kullaniciAdi === gorev.olusturanAd)

  const olusturanaBildir = (baslik, mesaj) => {
    if (!olusturanKisi?.id || String(olusturanKisi.id) === uid) return
    bildirimEkle(olusturanKisi.id, baslik, mesaj, 'gorev', `/gorevler/${gorev.id}`).catch(() => {})
  }

  const yorumDus = (icerik) =>
    gorevYorumEkle({ gorevId: gorev.id, kullaniciId: kullanici.id, yazarAd: kullanici.ad, icerik }).catch(() => {})

  const kapat = () => { setModal(null); setMetin(''); setIstenenTarih(''); setDevirKisi('') }

  // ── Aksiyonlar ────────────────────────────────────────────────────────────
  const kabulEt = async () => {
    setMesgul(true)
    const g = await gorevKabulEt(gorev.id)
    setMesgul(false)
    if (!g) { toast.error('Kabul kaydedilemedi.'); return }
    olusturanaBildir('✅ Görev kabul edildi', `${kullanici.ad}, "${gorev.baslik}" görevini kabul etti.`)
    toast.success('Görevi kabul ettin — kolay gelsin!')
    onGuncellendi(g)
  }

  const reddet = async () => {
    const aciklama = metin.trim()
    if (retSebep === 'Diğer' && !aciklama) { toast.error('Ret açıklaması zorunlu.'); return }
    setMesgul(true)
    const sebepTam = aciklama ? `${retSebep} — ${aciklama}` : retSebep
    const g = await gorevReddet(gorev.id, sebepTam)
    setMesgul(false)
    if (!g) { toast.error('Ret kaydedilemedi.'); return }
    yorumDus(`❌ Görev reddedildi — Sebep: ${sebepTam}`)
    olusturanaBildir('❌ Görev reddedildi', `${kullanici.ad}, "${gorev.baslik}" görevini reddetti. Sebep: ${sebepTam}`)
    toast.success('Görev reddedildi, oluşturan bilgilendirildi.')
    kapat(); onGuncellendi(g)
  }

  const bilgiIste = async () => {
    if (!metin.trim()) { toast.error('Hangi bilgiye ihtiyacın olduğunu yaz.'); return }
    setMesgul(true)
    const g = await gorevGuncelle(gorev.id, { durum: 'bilgi_bekleniyor', durumSebebi: metin.trim() })
    setMesgul(false)
    if (!g) { toast.error('Kaydedilemedi.'); return }
    yorumDus(`ℹ️ Bilgi talebi: ${metin.trim()}`)
    olusturanaBildir('❓ Görevde bilgi talebi', `${kullanici.ad}, "${gorev.baslik}" için bilgi istiyor: ${metin.trim()}`)
    toast.success('Bilgi talebin iletildi.')
    kapat(); onGuncellendi(g)
  }

  const tarihRevizeIste = async () => {
    if (!istenenTarih || istenenTarih <= bugunStr()) { toast.error('Bugünden sonraki bir tarih seç.'); return }
    if (!metin.trim()) { toast.error('Revize gerekçesi zorunlu.'); return }
    setMesgul(true)
    const g = await gorevGuncelle(gorev.id, {
      tarihRevize: { isteyenId: kullanici.id, isteyenAd: kullanici.ad, istenen: istenenTarih, sebep: metin.trim(), durum: 'bekliyor', talep_tarih: new Date().toISOString() },
    })
    setMesgul(false)
    if (!g) { toast.error('Kaydedilemedi.'); return }
    yorumDus(`📅 Tarih revizesi istendi: ${trTarih(istenenTarih)} — ${metin.trim()}`)
    olusturanaBildir('📅 Görev tarihi revize talebi', `${kullanici.ad}, "${gorev.baslik}" için yeni tarih istiyor: ${trTarih(istenenTarih)} (${metin.trim()})`)
    toast.success('Tarih revize talebin oluşturana iletildi.')
    kapat(); onGuncellendi(g)
  }

  const devret = async () => {
    if (!devirKisi) { toast.error('Yeni sorumluyu seç.'); return }
    if (!metin.trim()) { toast.error('Devir sebebi zorunlu.'); return }
    setMesgul(true)
    const g = await gorevDevret(gorev.id, { yeniAtananId: devirKisi, devredenId: kullanici.id, sebep: metin.trim() })
    setMesgul(false)
    if (!g) { toast.error('Devir kaydedilemedi.'); return }
    const yeni = kullanicilar.find(k => String(k.id) === String(devirKisi))
    yorumDus(`🔁 Görev devredildi: ${kullanici.ad} → ${yeni?.ad || '—'}. Sebep: ${metin.trim()}`)
    bildirimEkle(devirKisi, '📋 Size görev devredildi',
      `${kullanici.ad}, "${gorev.baslik}" görevini size devretti. Sebep: ${metin.trim()}. Kabul etmen bekleniyor.`,
      'gorev', `/gorevler/${gorev.id}`).catch(() => {})
    olusturanaBildir('🔁 Görev devredildi', `"${gorev.baslik}": ${kullanici.ad} → ${yeni?.ad || '—'} (${metin.trim()})`)
    toast.success(`Görev ${yeni?.ad || ''} kişisine devredildi — kabul etmesi bekleniyor.`)
    kapat(); onGuncellendi(g)
  }

  // Onay aksiyonları (madde 14)
  const sorumluyaBildir = (baslik, mesaj) => {
    const hedef = gorev.atananId ?? gorev.atanan
    if (!hedef || String(hedef) === uid) return
    bildirimEkle(hedef, baslik, mesaj, 'gorev', `/gorevler/${gorev.id}`).catch(() => {})
  }

  const onayla = async () => {
    setMesgul(true)
    const g = await gorevOnayla(gorev.id, metin.trim() || null)
    setMesgul(false)
    if (!g) { toast.error('Onay kaydedilemedi.'); return }
    yorumDus(`✅ Görev onaylandı ve tamamlandı.${metin.trim() ? ' Not: ' + metin.trim() : ''}`)
    sorumluyaBildir('✅ Görevin onaylandı', `"${gorev.baslik}" görevi ${kullanici.ad} tarafından onaylandı ve tamamlandı.`)
    toast.success('Görev onaylandı ve tamamlandı.')
    kapat(); onGuncellendi(g)
  }

  const revizeIste = async () => {
    if (!metin.trim()) { toast.error('Revize açıklaması zorunlu.'); return }
    setMesgul(true)
    const g = await gorevRevizeIste(gorev.id, metin.trim())
    setMesgul(false)
    if (!g) { toast.error('Kaydedilemedi.'); return }
    yorumDus(`🔄 Revize istendi: ${metin.trim()}`)
    sorumluyaBildir('🔄 Görevde revize istendi', `"${gorev.baslik}": ${kullanici.ad} revize istedi — ${metin.trim()}`)
    toast.success('Revize talebi sorumluya iletildi.')
    kapat(); onGuncellendi(g)
  }

  const onayReddet = async () => {
    if (!metin.trim()) { toast.error('Ret açıklaması zorunlu.'); return }
    setMesgul(true)
    const g = await gorevOnayReddet(gorev.id, metin.trim())
    setMesgul(false)
    if (!g) { toast.error('Kaydedilemedi.'); return }
    yorumDus(`⛔ Onay reddedildi: ${metin.trim()}`)
    sorumluyaBildir('⛔ Görev onayı reddedildi', `"${gorev.baslik}": ${kullanici.ad} onayı reddetti — ${metin.trim()}`)
    toast.warning('Onay reddedildi.')
    kapat(); onGuncellendi(g)
  }

  // Tarih revize kararı (oluşturan)
  const tarihRevizeKarar = async (kabul) => {
    const t = gorev.tarihRevize
    setMesgul(true)
    const g = await gorevGuncelle(gorev.id, kabul
      ? { sonTarih: t.istenen, bitisTarihi: t.istenen, tarihRevize: { ...t, durum: 'onaylandi', kararTarih: new Date().toISOString() } }
      : { tarihRevize: { ...t, durum: 'reddedildi', kararTarih: new Date().toISOString() } })
    setMesgul(false)
    if (!g) { toast.error('Kaydedilemedi.'); return }
    yorumDus(kabul
      ? `📅 Tarih revizesi ONAYLANDI — yeni bitiş: ${trTarih(t.istenen)}`
      : '📅 Tarih revize talebi reddedildi.')
    if (t.isteyenId && String(t.isteyenId) !== uid) {
      bildirimEkle(t.isteyenId,
        kabul ? '📅 Tarih revizen onaylandı' : '📅 Tarih revize talebin reddedildi',
        `"${gorev.baslik}"${kabul ? ` — yeni bitiş: ${trTarih(t.istenen)}` : ''}`,
        'gorev', `/gorevler/${gorev.id}`).catch(() => {})
    }
    toast.success(kabul ? 'Yeni tarih uygulandı.' : 'Talep reddedildi.')
    onGuncellendi(g)
  }

  // ── Hangi bölümler görünecek? ─────────────────────────────────────────────
  const kabulBariGoster = benAtanan && !kapali && ['atandi', 'goruldu'].includes(gorev.kabulDurumu)
  const devirGoster = !kapali && gorevSorumlusuMu(gorev, kullanici) && (kullanici?.rol === 'admin' || gorevYetkisi(kullanici).devir)
  const onayPaneliGoster = gorev.durum === 'onay_bekliyor' && benOnaylayici
  const tarihTalebi = gorev.tarihRevize && gorev.tarihRevize.durum === 'bekliyor'
  const tarihKarariGoster = tarihTalebi && (benOlusturan || kullanici?.rol === 'admin')

  if (!kabulBariGoster && !devirGoster && !onayPaneliGoster && !tarihTalebi) return null

  return (
    <Card style={{ marginBottom: 16 }}>
      {/* Kabul barı (madde 11) */}
      {kabulBariGoster && (
        <div style={{ marginBottom: devirGoster || onayPaneliGoster ? 14 : 0 }}>
          <CardTitle>Bu görev sana atandı</CardTitle>
          <p className="t-caption" style={{ margin: '4px 0 10px' }}>
            Görevi kabul edebilir, eksik bilgi isteyebilir, tarih revizesi talep edebilir veya gerekçesiyle reddedebilirsin.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="primary" iconLeft={<CheckCircle2 size={14} strokeWidth={1.5} />} onClick={kabulEt} disabled={mesgul}>
              Görevi Kabul Et
            </Button>
            <Button variant="secondary" iconLeft={<HelpCircle size={14} strokeWidth={1.5} />} onClick={() => setModal('bilgi')} disabled={mesgul}>
              Bilgi Talep Et
            </Button>
            <Button variant="secondary" iconLeft={<CalendarClock size={14} strokeWidth={1.5} />} onClick={() => setModal('revize')} disabled={mesgul}>
              Tarih Revizesi İste
            </Button>
            <Button variant="secondary" iconLeft={<XCircle size={14} strokeWidth={1.5} />} onClick={() => setModal('ret')} disabled={mesgul}
              style={{ color: 'var(--danger)', borderColor: 'var(--danger-border, var(--danger))' }}>
              Görevi Reddet
            </Button>
          </div>
        </div>
      )}

      {/* Bekleyen tarih revize talebi */}
      {tarihTalebi && (
        <div style={{
          padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: onayPaneliGoster || devirGoster ? 14 : 0,
          background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', borderLeft: '3px solid var(--warning)',
        }}>
          <div style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 2 }}>
            📅 Bekleyen tarih revize talebi
          </div>
          <p className="t-caption" style={{ margin: 0 }}>
            {gorev.tarihRevize.isteyenAd || '—'}, yeni bitiş olarak <b>{trTarih(gorev.tarihRevize.istenen)}</b> istiyor.
            Sebep: {gorev.tarihRevize.sebep || '—'}
          </p>
          {tarihKarariGoster && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Button variant="primary" size="sm" onClick={() => tarihRevizeKarar(true)} disabled={mesgul}>Yeni Tarihi Onayla</Button>
              <Button variant="secondary" size="sm" onClick={() => tarihRevizeKarar(false)} disabled={mesgul}>Reddet</Button>
            </div>
          )}
        </div>
      )}

      {/* Onay paneli (madde 14) */}
      {onayPaneliGoster && (
        <div style={{ marginBottom: devirGoster ? 14 : 0 }}>
          <CardTitle>Onayını bekliyor</CardTitle>
          <p className="t-caption" style={{ margin: '4px 0 10px' }}>
            {gorev.atananAd || 'Sorumlu'}, görevi tamamladığını bildirdi. Kontrol edip karar ver.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="primary" iconLeft={<CheckCircle2 size={14} strokeWidth={1.5} />} onClick={onayla} disabled={mesgul}>
              Onayla ve Tamamla
            </Button>
            <Button variant="secondary" onClick={() => setModal('onay_revize')} disabled={mesgul}>Revize İste</Button>
            <Button variant="secondary" onClick={() => setModal('onay_ret')} disabled={mesgul}
              style={{ color: 'var(--danger)', borderColor: 'var(--danger-border, var(--danger))' }}>
              Reddet
            </Button>
          </div>
        </div>
      )}

      {/* Devir (madde 38) */}
      {devirGoster && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span className="t-caption">Görevin tüm sorumluluğunu başka birine aktarabilirsin (alt görev vermekten farklıdır).</span>
          <Button variant="secondary" iconLeft={<ArrowRightLeft size={14} strokeWidth={1.5} />} onClick={() => setModal('devir')} disabled={mesgul}>
            Görevi Devret
          </Button>
        </div>
      )}

      {/* ── Modallar ── */}
      {modal === 'ret' && (
        <ModalKabuk baslik="Görevi Reddet" onKapat={kapat}>
          <Label required>Ret sebebi</Label>
          <CustomSelect value={retSebep} onChange={e => setRetSebep(e.target.value)}>
            {RET_SEBEPLERI.map(s => <option key={s} value={s}>{s}</option>)}
          </CustomSelect>
          <div style={{ marginTop: 10 }}>
            <Label required={retSebep === 'Diğer'}>Açıklama</Label>
            <Textarea rows={2} value={metin} onChange={e => setMetin(e.target.value)} placeholder="Kısaca açıkla…" />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <Button variant="secondary" onClick={kapat}>Vazgeç</Button>
            <Button variant="primary" onClick={reddet} disabled={mesgul}>Reddet</Button>
          </div>
        </ModalKabuk>
      )}
      {modal === 'bilgi' && (
        <ModalKabuk baslik="Bilgi Talep Et" onKapat={kapat}>
          <Label required>Hangi bilgiye ihtiyacın var?</Label>
          <Textarea rows={3} value={metin} onChange={e => setMetin(e.target.value)} placeholder="Görevi yapabilmek için eksik olan bilgiyi yaz…" />
          <p className="t-caption" style={{ marginTop: 6 }}>Görev "Bilgi Bekleniyor" durumuna geçer ve oluşturan bilgilendirilir.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <Button variant="secondary" onClick={kapat}>Vazgeç</Button>
            <Button variant="primary" onClick={bilgiIste} disabled={mesgul}>Gönder</Button>
          </div>
        </ModalKabuk>
      )}
      {modal === 'revize' && (
        <ModalKabuk baslik="Tarih Revizesi İste" onKapat={kapat}>
          <p className="t-caption" style={{ marginTop: 0, marginBottom: 10 }}>Mevcut bitiş: <b>{trTarih(gorev.sonTarih)}</b></p>
          <Label required>İstediğin yeni bitiş tarihi</Label>
          <Input type="date" value={istenenTarih} min={bugunStr()} onChange={e => setIstenenTarih(e.target.value)} style={{ maxWidth: 200 }} />
          <div style={{ marginTop: 10 }}>
            <Label required>Gerekçe</Label>
            <Textarea rows={2} value={metin} onChange={e => setMetin(e.target.value)} placeholder="Neden ek süre gerekiyor?" />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <Button variant="secondary" onClick={kapat}>Vazgeç</Button>
            <Button variant="primary" onClick={tarihRevizeIste} disabled={mesgul}>Talep Gönder</Button>
          </div>
        </ModalKabuk>
      )}
      {modal === 'devir' && (
        <ModalKabuk baslik="Görevi Devret" onKapat={kapat}>
          <p className="t-caption" style={{ marginTop: 0, marginBottom: 10 }}>
            Devirle görevin <b>bütün sorumluluğu</b> yeni kişiye geçer; yeni sorumlu görevi kabul edene kadar süreç onda bekler. Sen görev geçmişinde eski sorumlu olarak görünürsün.
          </p>
          <Label required>Yeni sorumlu</Label>
          <CustomSelect value={devirKisi} onChange={e => setDevirKisi(e.target.value)} searchable>
            <option value="">Seç…</option>
            {(kullanicilar || []).filter(k => k.rol !== 'musteri' && String(k.id) !== uid).map(k => (
              <option key={k.id} value={k.id}>{k.ad}</option>
            ))}
          </CustomSelect>
          <div style={{ marginTop: 10 }}>
            <Label required>Devir sebebi</Label>
            <Textarea rows={2} value={metin} onChange={e => setMetin(e.target.value)} placeholder="Neden devrediyorsun?" />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <Button variant="secondary" onClick={kapat}>Vazgeç</Button>
            <Button variant="primary" onClick={devret} disabled={mesgul}>Devret</Button>
          </div>
        </ModalKabuk>
      )}
      {(modal === 'onay_ret' || modal === 'onay_revize') && (
        <ModalKabuk baslik={modal === 'onay_ret' ? 'Onayı Reddet' : 'Revize İste'} onKapat={kapat}>
          <Label required>{modal === 'onay_ret' ? 'Ret açıklaması' : 'Nelerin düzeltilmesi gerekiyor?'}</Label>
          <Textarea rows={3} value={metin} onChange={e => setMetin(e.target.value)} placeholder="Sorumluya iletilecek açıklama…" />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <Button variant="secondary" onClick={kapat}>Vazgeç</Button>
            <Button variant="primary" onClick={modal === 'onay_ret' ? onayReddet : revizeIste} disabled={mesgul}>Gönder</Button>
          </div>
        </ModalKabuk>
      )}
    </Card>
  )
}
