// Görevler LİSTE sayfası v2 yardımcı bileşenleri (44 maddelik spek — madde 30-35).
// Sadece sunum: veri/filtre mantığı Gorevler.jsx'te kalır.

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal, Button, Textarea, Label } from '../ui'
import { etkinDurum, oncelikBilgi, isYukuHesapla } from '../../lib/gorevSabitleri'

// ─── İlerleme mini bar (%) ──────────────────────────────────────────────────
export function IlerlemeBar({ deger, genislik = 64 }) {
  const v = Math.max(0, Math.min(100, Number(deger) || 0))
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: genislik, height: 5, borderRadius: 3, overflow: 'hidden',
        background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
        display: 'inline-block', flexShrink: 0,
      }}>
        <span style={{
          display: 'block', height: '100%', width: `${v}%`,
          background: v >= 100 ? 'var(--success)' : 'var(--brand-primary)',
          transition: 'width 150ms',
        }} />
      </span>
      <span className="tabular-nums" style={{ font: '500 11px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>
        %{v}
      </span>
    </span>
  )
}

// ─── Etkin durum rozeti (gecikme saklanan durumu ezer) ──────────────────────
export function EtkinDurumRozeti({ gorev }) {
  const ed = etkinDurum(gorev)
  const gecikti = ed.id === 'suresi_gecti'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      font: `${gecikti ? '600' : '500'} 12px/16px var(--font-sans)`,
      color: gecikti ? 'var(--danger)' : 'var(--text-secondary)',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: ed.renk, flexShrink: 0 }} />
      {ed.isim}
    </span>
  )
}

// ─── Öncelik: renkli nokta + isim ───────────────────────────────────────────
export function OncelikNokta({ oncelik }) {
  const o = oncelikBilgi(oncelik)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      font: '500 12px/16px var(--font-sans)', color: 'var(--text-secondary)', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: o.renk, flexShrink: 0 }} />
      {o.isim}
    </span>
  )
}

// ─── Sekme chip satırı (madde 30) — yatay kaydırılabilir, sayı rozetli ──────
export function SekmeSatiri({ sekmeler, aktif, onSec }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '10px 8px', overflowX: 'auto', whiteSpace: 'nowrap',
      borderBottom: '1px solid var(--border-default)', background: 'var(--surface-card)',
    }}>
      {sekmeler.map(s => {
        const secili = aktif === s.id
        return (
          <button
            key={s.id}
            onClick={() => onSec(s.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
              padding: '6px 12px',
              background: secili ? 'var(--brand-primary)' : 'var(--surface-sunken)',
              color: secili ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${secili ? 'var(--brand-primary)' : 'var(--border-default)'}`,
              borderRadius: 'var(--radius-pill)', cursor: 'pointer',
              font: `${secili ? '600' : '500'} 12px/16px var(--font-sans)`,
            }}
            onMouseEnter={e => { if (!secili) e.currentTarget.style.background = 'var(--brand-primary-soft)' }}
            onMouseLeave={e => { if (!secili) e.currentTarget.style.background = 'var(--surface-sunken)' }}
          >
            {s.isim}
            <span className="tabular-nums" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minWidth: 18, height: 16, padding: '0 5px', borderRadius: 9,
              background: secili ? 'rgba(255,255,255,0.22)' : 'var(--surface-card)',
              border: secili ? 'none' : '1px solid var(--border-default)',
              font: '600 10px/1 var(--font-sans)',
              color: secili ? '#fff' : 'var(--text-tertiary)',
            }}>
              {s.sayi}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Sebep modalı (SEBEP_ZORUNLU_DURUMLAR — ör. kanban'da Beklemede'ye sürükleme)
// NOT: Kapanınca UNMOUNT edilecek şekilde kullan ({acikMi && <SebepModal acik …/>})
// — metin alanı her açılışta böyle sıfırlanır.
export function SebepModal({ acik, baslik, aciklama, onKaydet, onVazgec }) {
  const [sebep, setSebep] = useState('')
  return (
    <Modal
      open={acik}
      onClose={onVazgec}
      title={baslik || 'Sebep gerekli'}
      width={440}
      footer={
        <>
          <Button variant="secondary" onClick={onVazgec}>Vazgeç</Button>
          <Button variant="primary" disabled={!sebep.trim()} onClick={() => sebep.trim() && onKaydet(sebep.trim())}>
            Kaydet
          </Button>
        </>
      }
    >
      {aciklama && (
        <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
          {aciklama}
        </p>
      )}
      <Label required>Sebep</Label>
      <Textarea
        rows={3}
        value={sebep}
        onChange={e => setSebep(e.target.value)}
        placeholder="Sebebi kısaca yaz…"
        autoFocus
      />
    </Modal>
  )
}

// ─── İş yükü göstergesi (madde 35) — formda atanan seçilince ────────────────
export function IsYukuPaneli({ liste, kullaniciId, ad }) {
  if (!kullaniciId) return null
  const y = isYukuHesapla(liste, kullaniciId)
  const seviyeRenk = y.seviye === 'Yüksek' ? 'var(--danger)' : y.seviye === 'Orta' ? 'var(--warning)' : 'var(--success)'
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        padding: '6px 10px', borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
        font: '500 12px/16px var(--font-sans)', color: 'var(--text-secondary)',
      }}>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{ad || 'Seçilen kişi'}</span>
        <span>— Açık: <b className="tabular-nums">{y.acik}</b></span>
        <span>· Bugün: <b className="tabular-nums">{y.bugunBitecek}</b></span>
        <span>· Geciken: <b className="tabular-nums" style={{ color: y.geciken ? 'var(--danger)' : undefined }}>{y.geciken}</b></span>
        <span>· Kritik: <b className="tabular-nums">{y.kritik}</b></span>
        <span>· Yoğunluk: <b style={{ color: seviyeRenk }}>{y.seviye}</b></span>
      </div>
      {y.seviye === 'Yüksek' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 6,
          padding: '6px 10px', borderRadius: 'var(--radius-sm)',
          background: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--warning)',
          font: '500 12px/16px var(--font-sans)', color: 'var(--warning)',
        }}>
          <AlertTriangle size={13} strokeWidth={1.8} style={{ flexShrink: 0 }} />
          Bu kişinin görev yoğunluğu yüksek. Yine de atayabilirsin.
        </div>
      )}
    </div>
  )
}
