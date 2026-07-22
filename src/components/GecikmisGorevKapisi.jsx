// Gecikmiş görev kapısı — bitiş tarihi (uzatılmış olsa bile) GEÇMİŞ görevi
// olan kullanıcı, her görev için sebep + açıklama + YENİ bitiş tarihi girmeden
// (ya da görevi tamamlamadan) CRM'i kullanamaz. Amaç: "tarih girilip unutuluyor"
// döngüsünü kırmak (2026-07-19 talebi). Girişte bir kez kontrol edilir.
import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useBildirim } from '../context/BildirimContext'
import { gorevleriGetir, gorevGuncelle, gorevOnayaGonder } from '../services/gorevService'
import { gorevYorumEkle } from '../services/gorevYorumService'
import { gorusmeleriGetir, gorusmeGuncelle } from '../services/gorusmeService'
import { gorevGecikti, gecikmeGunu } from '../lib/gorevSabitleri'
import { Button, Input, Textarea, Label } from './ui'

// Kapıya TAKILMAYAN durumlar: kapalılar + onayda bekleyen (iş teslim edilmiş)
// + taslak + bilinçli duraklatılmışlar (sebep girilerek beklemeye alınmış)
const KAPI_DISI = ['tamamlandi', 'iptal', 'reddedildi', 'onay_bekliyor', 'taslak', 'beklemede', 'bilgi_bekleniyor']
const KAPALI = ['tamamlandi', 'iptal', 'reddedildi']

const SEBEPLER = [
  { id: 'hava_muhalefeti',   isim: 'Hava Muhalefeti',   ikon: '🌧️' },
  { id: 'program_yogunlugu', isim: 'Program Yoğunluğu', ikon: '📅' },
  { id: 'tamir_ariza',       isim: 'Tamir / Arıza',     ikon: '🔧' },
  { id: 'uretici_tedarik',   isim: 'Üretici / Tedarik', ikon: '📦' },
]

const bugunStr = () => new Date().toISOString().slice(0, 10)

const benimMi = (g, kullaniciId) => {
  const id = String(kullaniciId)
  if (String(g.atananId ?? '') === id) return true
  if (String(g.atanan ?? '') === id) return true
  if (Array.isArray(g.ekip) && g.ekip.map(String).includes(id)) return true
  return false
}

export default function GecikmisGorevKapisi() {
  const { kullanici } = useAuth()
  const { toast } = useToast()
  const { bildirimEkle } = useBildirim()
  const [gecikmisler, setGecikmisler] = useState(null) // null = henüz bakılmadı
  const [sebep, setSebep] = useState(null)
  const [aciklama, setAciklama] = useState('')
  const [yeniTarih, setYeniTarih] = useState('')
  const [mesgul, setMesgul] = useState(false)
  // Takipsiz açık görüşmeler (2026-07-20 talebi): 2+ gün önce yapılmış,
  // sonucu boş, hâlâ 'Açık' duran görüşmeler — görev kapısından SONRA sorulur.
  const [gecikmisGorusmeler, setGecikmisGorusmeler] = useState(null)
  const [gorusmeNot, setGorusmeNot] = useState('')

  // Girişte tara + sekmeye her dönüşte yeniden tara (10 dk kısıtlı) —
  // sekme günlerce açık kalsa da gün dönünce gecikmişe düşen görev yakalanır
  const sonTaramaRef = useRef(0)
  useEffect(() => {
    if (!kullanici?.id) { setGecikmisler(null); return }
    let iptal = false

    const tara = () => {
      sonTaramaRef.current = Date.now()
      gorevleriGetir()
        .then(liste => {
          if (iptal) return
          const geciken = (liste || [])
            .filter(g => !KAPI_DISI.includes(g.durum))
            .filter(g => gorevGecikti(g))   // saat durdurma + öteleme (mig 221) dahil
            .filter(g => benimMi(g, kullanici.id))
            .sort((a, b) => (a.sonTarih || '').localeCompare(b.sonTarih || ''))
          setGecikmisler(geciken)
        })
        .catch(() => { if (!iptal) setGecikmisler(prev => prev ?? []) })

      // Görüşme kapısı — esnweb importları hariç; "görüşen" adı eşleşenler
      gorusmeleriGetir()
        .then(liste => {
          if (iptal) return
          const adLc = (kullanici.ad || '').trim().toLocaleLowerCase('tr')
          const esik = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
          const geciken = (liste || [])
            .filter(g => g.durum === 'acik')
            .filter(g => (g.hazirlayan || '') !== 'esnweb')
            .filter(g => !String(g.gorusmeSonucu || '').trim())
            .filter(g => g.tarih && String(g.tarih).slice(0, 10) < esik)
            .filter(g => String(g.gorusen || '').toLocaleLowerCase('tr').includes(adLc))
            .sort((a, b) => (a.tarih || '').localeCompare(b.tarih || ''))
          setGecikmisGorusmeler(geciken)
        })
        .catch(() => { if (!iptal) setGecikmisGorusmeler(prev => prev ?? []) })
    }

    tara()
    const odaklaninca = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - sonTaramaRef.current < 10 * 60_000) return
      tara()
    }
    document.addEventListener('visibilitychange', odaklaninca)
    window.addEventListener('focus', odaklaninca)
    return () => {
      iptal = true
      document.removeEventListener('visibilitychange', odaklaninca)
      window.removeEventListener('focus', odaklaninca)
    }
  }, [kullanici?.id])

  const aktif = useMemo(() => (gecikmisler && gecikmisler.length > 0 ? gecikmisler[0] : null), [gecikmisler])

  // Görev değişince form sıfırla
  useEffect(() => {
    setSebep(aktif?.devamSebep || null)
    setAciklama('')
    setYeniTarih('')
  }, [aktif?.id])

  // Görüşme kapısı görev kapısından SONRA — iki modal üst üste binmesin
  const aktifGorusme = useMemo(() => (
    !aktif && gecikmisGorusmeler && gecikmisGorusmeler.length > 0 ? gecikmisGorusmeler[0] : null
  ), [aktif, gecikmisGorusmeler])

  useEffect(() => { setGorusmeNot('') }, [aktifGorusme?.id])

  if (!aktif && !aktifGorusme) return null

  const kalanSayi = gecikmisler?.length || 0
  const gun = aktif ? gecikmeGunu(aktif) : 0

  const gorevListedenDus = () => setGecikmisler(prev => prev.filter(g => g.id !== aktif.id))

  // ── Görüşme kapısı işlemleri ──────────────────────────────────────────────
  const gorusmeListedenDus = () => setGecikmisGorusmeler(prev => prev.filter(x => x.id !== aktifGorusme.id))

  const gorusmeSonuclaKapat = async () => {
    if (!gorusmeNot.trim()) { toast.error('Görüşme sonucunu yazman zorunlu.'); return }
    setMesgul(true)
    try {
      const r = await gorusmeGuncelle(aktifGorusme.id, { durum: 'kapali', gorusmeSonucu: gorusmeNot.trim() })
      if (!r) throw new Error('Güncellenemedi')
      toast.success('Görüşme sonuçlandırıldı ve kapatıldı.')
      gorusmeListedenDus()
    } catch (e) {
      toast.error('Kaydedilemedi: ' + (e?.message || 'hata'))
    } finally { setMesgul(false) }
  }

  const gorusmeBeklemeyeAl = async () => {
    if (!gorusmeNot.trim()) { toast.error('Güncel durum notu zorunlu — takip nerede kaldı?'); return }
    setMesgul(true)
    try {
      const damga = `📌 ${new Date().toLocaleDateString('tr-TR')} ${kullanici?.ad || ''}: ${gorusmeNot.trim()}`
      const yeniTakip = (aktifGorusme.takipNotu ? aktifGorusme.takipNotu + '\n' : '') + damga
      const r = await gorusmeGuncelle(aktifGorusme.id, { durum: 'beklemede', takipNotu: yeniTakip })
      if (!r) throw new Error('Güncellenemedi')
      toast.success('Not eklendi — görüşme Beklemede durumuna alındı.')
      gorusmeListedenDus()
    } catch (e) {
      toast.error('Kaydedilemedi: ' + (e?.message || 'hata'))
    } finally { setMesgul(false) }
  }

  const ekSureKaydet = async () => {
    if (!sebep) { toast.error('Gecikme sebebini seçin.'); return }
    if (!aciklama.trim()) { toast.error('Kısa bir açıklama zorunlu — ne oldu, neden gecikti?'); return }
    if (!yeniTarih || yeniTarih <= bugunStr()) { toast.error('Yeni bitiş tarihi bugünden SONRA olmalı.'); return }
    setMesgul(true)
    try {
      const g = await gorevGuncelle(aktif.id, { durum: 'devam', devamSebep: sebep, sonTarih: yeniTarih })
      if (!g) throw new Error('Görev güncellenemedi')
      const sebepAd = SEBEPLER.find(s => s.id === sebep)?.isim || sebep
      await gorevYorumEkle({
        gorevId: aktif.id,
        kullaniciId: kullanici.id,
        yazarAd: kullanici.ad,
        icerik: `⏰ Gecikme bildirimi (${gun} gün) — Sebep: ${sebepAd}. ${aciklama.trim()} · Yeni bitiş: ${yeniTarih.split('-').reverse().join('.')}`,
      }).catch(() => {})
      toast.success('Ek süre kaydedildi.')
      gorevListedenDus()
    } catch (e) {
      toast.error('Kaydedilemedi: ' + (e?.message || 'hata'))
    } finally {
      setMesgul(false)
    }
  }

  const tamamlandiYap = async () => {
    setMesgul(true)
    try {
      // Detay ekranındaki kapılar burada da geçerli (denetim bulgusu):
      // kapı, onay/alt görev/bağımlılık kurallarını BAYPAS edemez.
      const liste = await gorevleriGetir().catch(() => [])
      // 1) Açık zorunlu alt görev / 'hepsi' kuralı
      const acikAltlar = (liste || []).filter(a =>
        String(a.ustGorevId) === String(aktif.id) && !KAPALI.includes(a.durum))
      const engelleyen = aktif.tamamlamaKurali === 'hepsi'
        ? acikAltlar
        : aktif.tamamlamaKurali === 'serbest' ? [] : acikAltlar.filter(a => a.zorunlu !== false)
      if (engelleyen.length > 0) {
        toast.error(`Alt görevler tamamlanmadan bu görev kapatılamaz (${engelleyen.length} açık) — görev detayından yönetebilirsin.`)
        return
      }
      // 2) Bağımlılık kapısı
      if (aktif.bagimliGorevId && aktif.bagimlilikTuru === 'once_tamamlanmali') {
        const bagimli = (liste || []).find(x => String(x.id) === String(aktif.bagimliGorevId))
        if (bagimli && bagimli.durum !== 'tamamlandi') {
          toast.error(`Önce bağımlı görev tamamlanmalı: ${bagimli.gorevNo || ''} "${bagimli.baslik}"`)
          return
        }
      }
      // 3) Onay kapısı: onay gerekliyse onaya gider, doğrudan kapanmaz
      const benOnaylayici = aktif.onaylayiciId
        ? String(aktif.onaylayiciId) === String(kullanici?.id)
        : (String(aktif.olusturanId ?? '') === String(kullanici?.id) || aktif.olusturanAd === kullanici?.ad)
      if (aktif.onayGerekli && !benOnaylayici) {
        const g = await gorevOnayaGonder(aktif.id)
        if (!g) throw new Error('Onaya gönderilemedi')
        const onaylayiciHedef = aktif.onaylayiciId || aktif.olusturanId || null
        if (onaylayiciHedef && String(onaylayiciHedef) !== String(kullanici?.id)) {
          bildirimEkle(onaylayiciHedef, '⏳ Görev onayınızı bekliyor',
            `${kullanici?.ad}, "${aktif.baslik}" görevini tamamladı — onayınız bekleniyor.`,
            'gorev', `/gorevler/${aktif.id}`).catch(() => {})
        }
        toast.success('Görev tamamlandı olarak işaretlendi — onaya gönderildi.')
        gorevListedenDus()
        return
      }
      const g = await gorevGuncelle(aktif.id, { durum: 'tamamlandi' })
      if (!g) throw new Error('Görev güncellenemedi')
      toast.success('Görev tamamlandı olarak işaretlendi.')
      gorevListedenDus()
    } catch (e) {
      toast.error('Kaydedilemedi: ' + (e?.message || 'hata'))
    } finally {
      setMesgul(false)
    }
  }

  // ── Görüşme kapısı modalı (görev kapısı boşsa) ───────────────────────────
  if (!aktif && aktifGorusme) {
    const gKalan = gecikmisGorusmeler.length
    const gGun = Math.max(1, Math.ceil((Date.now() - new Date(String(aktifGorusme.tarih).slice(0, 10) + 'T23:59:59').getTime()) / 86400000))
    return createPortal(
      <div style={{
        position: 'fixed', inset: 0, zIndex: 90000,
        background: 'rgba(2, 6, 23, 0.72)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
        <div style={{
          width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--surface-card)', border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <AlertTriangle size={20} style={{ color: '#f59e0b', flexShrink: 0 }} />
            <h2 style={{ font: '700 17px/24px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>
              Takipsiz açık görüşmen var{gKalan > 1 ? ` (${gKalan})` : ''}
            </h2>
          </div>
          <p className="t-caption" style={{ marginBottom: 16 }}>
            Bu görüşme {gGun} gündür <b>Açık</b> duruyor ve sonucu girilmemiş. Güncel durumu
            yazıp <b>Beklemeye al</b> ya da sonuçlandıysa <b>sonucu yazıp kapat</b> — takipsiz
            görüşme kalmasın. <b>ZNA Yönetim</b>
          </p>

          <div style={{
            padding: '12px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 16,
            background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
            borderLeft: '3px solid #f59e0b',
          }}>
            <div style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
              {aktifGorusme.firmaAdi || 'Müşteri'}{aktifGorusme.konu ? ` — ${aktifGorusme.konu}` : ''}
            </div>
            <div className="t-caption" style={{ marginTop: 4 }}>
              {aktifGorusme.aktNo ? `${aktifGorusme.aktNo} · ` : ''}
              Görüşme: {String(aktifGorusme.tarih).slice(0, 10).split('-').reverse().join('.')} ·{' '}
              <b style={{ color: '#f59e0b' }}>{gGun} gündür açık</b>
            </div>
            {aktifGorusme.notlar && (
              <div className="t-caption" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>
                {String(aktifGorusme.notlar).slice(0, 200)}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 18 }}>
            <Label>Güncel durum / sonuç (zorunlu)</Label>
            <Textarea rows={3} value={gorusmeNot} onChange={e => setGorusmeNot(e.target.value)}
              placeholder="Ne durumda? Sonuçlandıysa sonucu, sürüyorsa güncel durumu yaz…" />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={gorusmeBeklemeyeAl} disabled={mesgul}>
              Not Ekle — Beklemeye Al
            </Button>
            <Button variant="primary" onClick={gorusmeSonuclaKapat} disabled={mesgul}
              iconLeft={<CheckCircle2 size={14} strokeWidth={1.5} />}>
              {mesgul ? 'Kaydediliyor…' : 'Sonucu Kaydet ve Kapat'}
            </Button>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 90000,
      background: 'rgba(2, 6, 23, 0.72)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--surface-card)', border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <AlertTriangle size={20} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <h2 style={{ font: '700 17px/24px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>
            Gecikmiş görevin var{kalanSayi > 1 ? ` (${kalanSayi})` : ''}
          </h2>
        </div>
        <p className="t-caption" style={{ marginBottom: 16 }}>
          Görev takibimizi hep birlikte güncel tutmak istiyoruz. Bitiş tarihi geçen görevin için
          kısa bir açıklama ve <b>yeni bir bitiş tarihi</b> girmeni rica ediyoruz — görev bittiyse
          tek tıkla tamamlandı yapabilirsin. <b>ZNA Yönetim</b>
        </p>

        <div style={{
          padding: '12px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 16,
          background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
          borderLeft: '3px solid #ef4444',
        }}>
          <div style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{aktif.baslik}</div>
          <div className="t-caption" style={{ marginTop: 4 }}>
            Bitiş: {aktif.sonTarih.slice(0, 10).split('-').reverse().join('.')} ·{' '}
            <b style={{ color: '#ef4444' }}>{gun} gün gecikti</b>
          </div>
        </div>

        <Label>Gecikme Sebebi</Label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '4px 0 12px' }}>
          {SEBEPLER.map(s => (
            <button
              key={s.id}
              onClick={() => setSebep(s.id)}
              style={{
                padding: '12px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: sebep === s.id ? 'var(--brand-primary-soft)' : 'var(--surface-sunken)',
                border: `1px solid ${sebep === s.id ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                color: sebep === s.id ? 'var(--brand-primary)' : 'var(--text-secondary)',
                font: '500 12.5px/18px var(--font-sans)', textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 4 }}>{s.ikon}</div>
              {s.isim}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 12 }}>
          <Label>Açıklama (zorunlu) — ne oldu, neden gecikti?</Label>
          <Textarea rows={2} value={aciklama} onChange={e => setAciklama(e.target.value)}
            placeholder="Kısaca durumu yaz — görev yorumlarına işlenecek…" />
        </div>

        <div style={{ marginBottom: 18 }}>
          <Label>Yeni Bitiş Tarihi (ek süre — zorunlu)</Label>
          <Input type="date" value={yeniTarih} min={bugunStr()} onChange={e => setYeniTarih(e.target.value)} style={{ maxWidth: 200 }} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={tamamlandiYap} disabled={mesgul}
            iconLeft={<CheckCircle2 size={14} strokeWidth={1.5} />}>
            Görev Aslında Bitti — Tamamlandı Yap
          </Button>
          <Button variant="primary" onClick={ekSureKaydet} disabled={mesgul}>
            {mesgul ? 'Kaydediliyor…' : 'Ek Süreyi Kaydet ve Devam Et'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
