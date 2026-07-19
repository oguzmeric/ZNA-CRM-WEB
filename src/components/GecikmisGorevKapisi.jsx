// Gecikmiş görev kapısı — bitiş tarihi (uzatılmış olsa bile) GEÇMİŞ görevi
// olan kullanıcı, her görev için sebep + açıklama + YENİ bitiş tarihi girmeden
// (ya da görevi tamamlamadan) CRM'i kullanamaz. Amaç: "tarih girilip unutuluyor"
// döngüsünü kırmak (2026-07-19 talebi). Girişte bir kez kontrol edilir.
import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { gorevleriGetir, gorevGuncelle } from '../services/gorevService'
import { gorevYorumEkle } from '../services/gorevYorumService'
import { Button, Input, Textarea, Label } from './ui'

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

const gecikmeGunu = (sonTarih) => {
  const fark = Date.now() - new Date(sonTarih + 'T23:59:59').getTime()
  return Math.max(1, Math.ceil(fark / 86400000))
}

export default function GecikmisGorevKapisi() {
  const { kullanici } = useAuth()
  const { toast } = useToast()
  const [gecikmisler, setGecikmisler] = useState(null) // null = henüz bakılmadı
  const [sebep, setSebep] = useState(null)
  const [aciklama, setAciklama] = useState('')
  const [yeniTarih, setYeniTarih] = useState('')
  const [mesgul, setMesgul] = useState(false)

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
          const bugun = bugunStr()
          const geciken = (liste || [])
            .filter(g => g.durum !== 'tamamlandi')
            .filter(g => g.sonTarih && g.sonTarih.slice(0, 10) < bugun)
            .filter(g => benimMi(g, kullanici.id))
            .sort((a, b) => (a.sonTarih || '').localeCompare(b.sonTarih || ''))
          setGecikmisler(geciken)
        })
        .catch(() => { if (!iptal) setGecikmisler(prev => prev ?? []) })
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

  if (!aktif) return null

  const kalanSayi = gecikmisler.length
  const gun = gecikmeGunu(aktif.sonTarih.slice(0, 10))

  const gorevListedenDus = () => setGecikmisler(prev => prev.filter(g => g.id !== aktif.id))

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
          Bitiş tarihi geçen görev için <b>ek süre</b> girmeden (ya da görevi tamamlamadan) devam edilemez —
          böylece hiçbir görev sessizce unutulmaz.
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
