// Lokasyon seçici — aramalı, ID tabanlı.
//
// Neden ayrı bir bileşen (12.08.2026 kullanıcı isteği):
//   • Düz `<select>` ile Başakşehir Belediyesi'nin 83 lokasyonu arasında
//     kaydırarak arama yapılıyordu; kullanıcı "2-3 kere kontrol etmek lazım
//     oluyor" dedi.
//   • Adlar uzun ve aynı kelimeyle başlıyor ("ALTINŞEHİR SPOR PARKI",
//     "ALTINŞEHİR KÜLTÜR VE YAŞAM MERKEZİ", "ALTINŞEHİR MİLLET BAHÇESİ") —
//     dar bir açılır kutuda kırpılınca ayırt edilemiyor. Burada satırlar
//     kırpılmaz, sarar.
//
// ⚠️ Neden `ComboBox` DEĞİL: o metin tabanlıdır ve `new Set` ile aynı adlıları
// TEKİLLEŞTİRİR. Canlıda aynı ada sahip iki lokasyon çifti var (ŞAMLAR MOLA
// KAFE, Rizom Tatil Köyü) — orada bir kayıt listeden düşer, seçim de yanlış
// kaydı işaret edebilirdi. Bu seçici ID ile çalışır.

import { useState, useRef, useMemo, useEffect } from 'react'
import { Search, X, MapPin, Check } from 'lucide-react'
import { Input } from './ui'
import { trKelimeEslesir } from '../lib/trArama'

export default function LokasyonSecici({
  lokasyonlar = [],
  value = null,                 // seçili lokasyon id
  onChange,                     // (id | null) => void
  disabled = false,
  bosEtiket = '— Lokasyonsuz (müşteri geneli) —',
  placeholder = 'Lokasyon ara ve seç…',
  /** Satırın altına yazılacak ayırt edici bilgi — sayfa kendi bağlamını verir */
  ipucuVer,
}) {
  const [acik, setAcik] = useState(false)
  const [q, setQ] = useState('')
  const [vurgu, setVurgu] = useState(0)
  const sarmal = useRef(null)
  const listeRef = useRef(null)

  const secili = useMemo(
    () => lokasyonlar.find(l => String(l.id) === String(value)) || null,
    [lokasyonlar, value]
  )

  // Aynı ada sahip kayıtlar var mı — varsa o satırlarda ipucu ZORUNLU görünür,
  // yoksa kullanıcı iki özdeş satır görür ve hangisini seçtiğini bilemez.
  const cakisanAdlar = useMemo(() => {
    const say = {}
    for (const l of lokasyonlar) say[l.ad] = (say[l.ad] || 0) + 1
    return new Set(Object.keys(say).filter(a => say[a] > 1))
  }, [lokasyonlar])

  const filtreli = useMemo(() => {
    // Adres de aranır: adı hatırlanmayan lokasyon adresten bulunabilsin
    // (canlıda adres 217 kaydın 40'ında dolu — olanı işe yarasın).
    if (!q.trim()) return lokasyonlar
    return lokasyonlar.filter(l =>
      trKelimeEslesir(`${l.ad || ''} ${l.adres || ''}`, q))
  }, [lokasyonlar, q])

  // Dışarı tıklayınca kapan
  useEffect(() => {
    if (!acik) return undefined
    const dinle = (e) => { if (sarmal.current && !sarmal.current.contains(e.target)) setAcik(false) }
    document.addEventListener('mousedown', dinle)
    return () => document.removeEventListener('mousedown', dinle)
  }, [acik])

  // Klavyeyle gezerken vurgulanan satır görünürde kalsın (83 kayıtta şart)
  useEffect(() => {
    if (!acik || !listeRef.current) return
    const el = listeRef.current.querySelector(`[data-sira="${vurgu}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [vurgu, acik])

  const sec = (id) => { onChange?.(id); setAcik(false); setQ('') }

  // 0 = "lokasyonsuz" satırı, sonrası filtreli liste
  const toplamSatir = filtreli.length + 1
  const tusla = (e) => {
    if (!acik) { if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); setAcik(true) } return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setVurgu(i => Math.min(i + 1, toplamSatir - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setVurgu(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      sec(vurgu === 0 ? null : filtreli[vurgu - 1]?.id ?? null)
    } else if (e.key === 'Escape') { setAcik(false) }
  }

  if (disabled) {
    // Seçili değer pasifken de GÖRÜNÜR kalmalı: kaydetme sırasında kutu
    // boşalıp placeholder'a düşünce kullanıcı ne seçtiğini kaybediyordu.
    return (
      <Input value={secili?.ad || ''} readOnly disabled placeholder={placeholder}
        style={{ cursor: 'not-allowed' }} />
    )
  }

  // Kapalıyken seçili lokasyonun ADI görünür; açılınca arama kutusuna döner.
  const kutuDegeri = acik ? q : (secili?.ad || '')

  return (
    <div ref={sarmal} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={14} strokeWidth={1.5} style={{
          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--text-tertiary)', pointerEvents: 'none',
        }} />
        <Input
          value={kutuDegeri}
          onChange={e => { setQ(e.target.value); setVurgu(0); if (!acik) setAcik(true) }}
          onFocus={() => setAcik(true)}
          onKeyDown={tusla}
          placeholder={secili ? secili.ad : placeholder}
          style={{ paddingLeft: 30, paddingRight: secili ? 30 : 10 }}
        />
        {secili && !acik && (
          <button type="button" aria-label="Lokasyon seçimini temizle"
            onClick={() => sec(null)}
            style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', borderRadius: 4,
              color: 'var(--text-tertiary)', cursor: 'pointer',
            }}>
            <X size={13} strokeWidth={1.6} />
          </button>
        )}
      </div>

      {acik && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, marginTop: 4,
          background: 'var(--surface-card)', border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.18))',
          overflow: 'hidden',
        }}>
          <div ref={listeRef} style={{ maxHeight: 260, overflowY: 'auto' }}>
            {/* Lokasyon OPSİYONEL — müşteri geneli bakım da yapılabiliyor */}
            <Satir sira={0} vurgu={vurgu} onVurgu={setVurgu} onSec={() => sec(null)}
              secili={value == null} baslik={bosEtiket} sade />

            {filtreli.length === 0 && (
              <div style={{ padding: '10px 12px', font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                “{q}” ile eşleşen lokasyon yok.
              </div>
            )}

            {filtreli.map((l, i) => {
              const ipucu = ipucuVer?.(l) || l.adres || (cakisanAdlar.has(l.ad) ? `Kayıt #${l.id}` : '')
              return (
                <Satir key={l.id} sira={i + 1} vurgu={vurgu} onVurgu={setVurgu}
                  onSec={() => sec(l.id)}
                  secili={String(value) === String(l.id)}
                  baslik={l.ad} ipucu={ipucu} pasif={l.aktif === false} />
              )
            })}
          </div>

          {/* Kaç kayıt arasında olduğunu bilmek "hepsini gördüm mü" sorusunu bitirir */}
          <div style={{
            padding: '6px 12px', borderTop: '1px solid var(--border-default)',
            font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)',
            background: 'var(--surface-sunken)',
          }}>
            {q.trim()
              ? `${filtreli.length} / ${lokasyonlar.length} lokasyon`
              : `${lokasyonlar.length} lokasyon — daraltmak için yazın`}
          </div>
        </div>
      )}
    </div>
  )
}

function Satir({ sira, vurgu, onVurgu, onSec, secili, baslik, ipucu, sade, pasif }) {
  const vurgulu = vurgu === sira
  return (
    <button type="button" data-sira={sira}
      onMouseEnter={() => onVurgu(sira)}
      onClick={onSec}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', textAlign: 'left',
        padding: '8px 12px', border: 'none', cursor: 'pointer',
        borderBottom: '1px solid var(--border-subtle, var(--border-default))',
        background: vurgulu ? 'var(--surface-sunken)' : 'transparent',
      }}>
      <span style={{ width: 14, flexShrink: 0, marginTop: 2, color: secili ? 'var(--brand-primary)' : 'var(--text-tertiary)' }}>
        {secili ? <Check size={13} strokeWidth={2} /> : sade ? null : <MapPin size={12} strokeWidth={1.5} />}
      </span>
      <span style={{ minWidth: 0 }}>
        {/* ⚠️ Kırpma YOK: uzun adlar sarar. Kırpılan ad tam da kullanıcının
            "belli olmuyor" dediği sorundu. */}
        <span style={{
          display: 'block',
          font: `${secili ? 600 : 400} 13px/18px var(--font-sans)`,
          color: sade ? 'var(--text-secondary)' : 'var(--text-primary)',
          overflowWrap: 'anywhere',
        }}>
          {baslik}{pasif && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> · pasif</span>}
        </span>
        {ipucu && (
          <span style={{ display: 'block', font: '400 11.5px/16px var(--font-sans)', color: 'var(--text-tertiary)', overflowWrap: 'anywhere' }}>
            {ipucu}
          </span>
        )}
      </span>
    </button>
  )
}
