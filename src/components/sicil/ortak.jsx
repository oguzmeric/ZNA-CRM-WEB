// Sicil kartı ortak parçaları — sekmelerin paylaştığı görünüm birimleri.
//
// ⚠️ SESSİZ BOŞLUK YASAK: her sekme hatayı GÖSTERİR ve "Tekrar Dene" sunar.
// Kullanıcının açık talebi: "sekmelere tıklandığında database hatası rls
// hatası istemiyorum" — hatayı gizlemek onu yok etmez, teşhisi imkânsızlaştırır.

import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button, Input, Textarea, Label } from '../ui'
import CustomSelect from '../CustomSelect'
import { listeAdi } from '../../services/personelSicilService'
import { tarihBicim } from './bicim'

// Biçimleyiciler bicim.js'te — bileşen ve saf fonksiyon aynı dosyadan
// export edilince Vite fast-refresh bozuluyor.

// ── Sekme durum bileşenleri ───────────────────────────────────────────────

export function SekmeYukleniyor({ metin = 'Yükleniyor…' }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', font: '400 13px/18px var(--font-sans)' }}>
      {metin}
    </div>
  )
}

/** Sekme yüklenemedi — hata metni + tekrar dene. Sessizce boş liste GÖSTERİLMEZ. */
export function SekmeHata({ hata, tekrar }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap',
      padding: '14px 16px', margin: 12,
      border: '1px solid rgba(220,38,38,0.35)', borderRadius: 'var(--radius-md)',
      background: 'rgba(220,38,38,0.06)',
    }}>
      <AlertTriangle size={16} strokeWidth={1.7} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ font: '600 12.5px/18px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 2 }}>
          Bu bölüm yüklenemedi
        </div>
        <div style={{ font: '400 12px/17px var(--font-sans)', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
          {String(hata?.message || hata || 'Bilinmeyen hata')}
        </div>
      </div>
      {tekrar && (
        <Button variant="secondary" size="sm" iconLeft={<RefreshCw size={13} strokeWidth={1.5} />} onClick={tekrar}>
          Tekrar Dene
        </Button>
      )}
    </div>
  )
}

/** Kesikli çerçeveli boş kutu — "bu kayıt hiç yok" (MusteriDetay deseni). */
export function SekmeBos({ children }) {
  return (
    <div style={{
      padding: '20px 12px', textAlign: 'center',
      color: 'var(--text-tertiary)', font: '400 13px/18px var(--font-sans)',
      background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)',
      border: '1px dashed var(--border-default)',
    }}>
      {children}
    </div>
  )
}

// ── Özet kutucuk şeridi (KPI) ─────────────────────────────────────────────

/** kutular: [{ label, value, color?, ipucu? }] — MusteriDetay §4 kalıbı. */
export function OzetKutular({ kutular = [], sutun }) {
  if (!kutular.length) return null
  const n = sutun || Math.min(4, kutular.length)
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
      gap: 12, marginBottom: 16,
    }}>
      {kutular.map(k => (
        <div key={k.label} style={{
          background: 'var(--surface-sunken)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 14px',
        }}>
          <div className="t-label" style={{ marginBottom: 4 }}>{k.label}</div>
          <div style={{
            font: '600 16px/22px var(--font-sans)',
            color: k.color || 'var(--text-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {k.value}
          </div>
          {k.ipucu && (
            <div className="t-caption" style={{ marginTop: 3 }}>{k.ipucu}</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Alan görünümü / düzenleme ─────────────────────────────────────────────

/** Bir alanın OKUNUR değeri (görünüm modu). */
function alanDegeriMetin(alan, form, ekBaglam = {}) {
  const v = form?.[alan.k]
  if (v === null || v === undefined || v === '') return null

  if (alan.tip === 'tarih') return tarihBicim(v)
  if (alan.tip === 'evet_hayir') return v ? 'Evet' : 'Hayır'
  if (alan.tip === 'liste') {
    const sec = alan.dinamik ? (ekBaglam[alan.dinamik] || []) : alan.secenekler
    // Düz string dizisi (DEPARTMANLAR gibi) → değerin kendisi
    if (Array.isArray(sec) && typeof sec[0] === 'string') return String(v)
    return listeAdi(sec || [], alan.dinamik ? Number(v) : v)
  }
  return String(v)
}

/** Tek alan — görünüm modunda etiket+değer, düzenlemede etiket+girdi. */
function Alan({ alan, form, setAlan, duzenle, ekBaglam }) {
  const genisStil = alan.genis ? { gridColumn: '1 / -1' } : undefined

  if (!duzenle) {
    const metin = alanDegeriMetin(alan, form, ekBaglam)
    return (
      <div style={genisStil}>
        <div className="t-label" style={{ marginBottom: 3 }}>{alan.ad}</div>
        <div style={{
          font: '400 13px/18px var(--font-sans)',
          color: metin ? 'var(--text-primary)' : 'var(--text-tertiary)',
          whiteSpace: alan.tip === 'cokSatir' ? 'pre-wrap' : 'normal',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {metin || '—'}
        </div>
      </div>
    )
  }

  const deger = form?.[alan.k] ?? ''
  const yaz = (v) => setAlan(alan.k, v)

  return (
    <div style={genisStil}>
      <Label>{alan.ad}</Label>
      {alan.tip === 'cokSatir' ? (
        <Textarea rows={3} value={deger} onChange={e => yaz(e.target.value)} placeholder={alan.ipucu || ''} />
      ) : alan.tip === 'liste' ? (
        (() => {
          const sec = alan.dinamik ? (ekBaglam[alan.dinamik] || []) : (alan.secenekler || [])
          const duzSecenek = Array.isArray(sec) && typeof sec[0] === 'string'
          return (
            <CustomSelect value={deger === null ? '' : String(deger)} onChange={e => yaz(e.target.value)}>
              <option value="">Seçilmedi</option>
              {duzSecenek
                ? sec.map(s => <option key={s} value={s}>{s}</option>)
                : (sec || []).map(s => <option key={s.id} value={String(s.id)}>{s.isim || s.ad}</option>)}
            </CustomSelect>
          )
        })()
      ) : alan.tip === 'evet_hayir' ? (
        <CustomSelect value={deger === '' || deger === null ? '' : (deger ? 'e' : 'h')}
          onChange={e => yaz(e.target.value === '' ? '' : e.target.value === 'e')}>
          <option value="">Belirtilmedi</option>
          <option value="e">Evet</option>
          <option value="h">Hayır</option>
        </CustomSelect>
      ) : (
        <Input
          type={alan.tip === 'tarih' ? 'date' : alan.tip === 'sayi' ? 'number' : 'text'}
          value={deger}
          maxLength={alan.maxLength}
          onChange={e => yaz(e.target.value)}
          placeholder={alan.ipucu || ''}
        />
      )}
      {alan.ipucu && alan.tip !== 'metin' && alan.tip !== 'cokSatir' && (
        <div className="t-caption" style={{ marginTop: 3 }}>{alan.ipucu}</div>
      )}
    </div>
  )
}

/**
 * Alan grubu — başlık + responsive alan ızgarası.
 * gruplar: alanlar.js'teki OZLUK_GRUPLARI / ISTIHDAM_GRUPLARI biçimi.
 */
export function AlanGruplari({ gruplar, form, setAlan, duzenle, ekBaglam = {} }) {
  return (
    <>
      <style>{`
        .sicil-alan-izgara {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px 18px;
        }
        @media (max-width: 900px) { .sicil-alan-izgara { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 620px) { .sicil-alan-izgara { grid-template-columns: minmax(0, 1fr); } }
      `}</style>
      {gruplar.map((g, gi) => (
        <div key={g.baslik} style={{ marginTop: gi === 0 ? 0 : 22 }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
            marginBottom: 10, paddingBottom: 6,
            borderBottom: '1px solid var(--border-default)',
          }}>
            <span style={{ font: '700 12.5px/17px var(--font-sans)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
              {g.baslik}
            </span>
            {g.aciklama && <span className="t-caption">{g.aciklama}</span>}
          </div>
          <div className="sicil-alan-izgara">
            {g.alanlar.map(a => (
              <Alan key={a.k} alan={a} form={form} setAlan={setAlan} duzenle={duzenle} ekBaglam={ekBaglam} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
