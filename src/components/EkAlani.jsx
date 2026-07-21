// Ortak eklenti seçici + görüntüleyici — görev formu, görev yorumu ve
// görüşme yorumu aynı bileşeni kullanır (madde: yorum/görev ekleri).
//
// <EkSecici dosyalar={File[]} onChange={setFiles} /> — henüz yüklenmemiş
//   local dosyaları seçtirir/listeler; upload SUBMIT anında ekleriYukle ile.
// <EkListesi dosyalar={[{url,name,type,size}]} /> — kayıtlı ekleri gösterir:
//   resimler küçük önizleme, diğerleri ataçlı link.
import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Paperclip, X, FileText } from 'lucide-react'

// Panodaki (Ctrl+V) resimleri File[] olarak çıkarır — ekran görüntüsünü
// kaydetmeden doğrudan yorum/form alanına yapıştırma için (WhatsApp gibi).
// Resim yoksa boş dizi döner; metin yapıştırma normal akışında kalır.
export function panodanResimler(e) {
  const ogeler = Array.from(e.clipboardData?.items || [])
  const resimler = ogeler
    .filter(o => o.kind === 'file' && (o.type || '').startsWith('image/'))
    .map(o => o.getAsFile())
    .filter(Boolean)
  if (!resimler.length) return []
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return resimler.map((f, i) => new File(
    [f],
    `ekran-goruntusu-${ts}${resimler.length > 1 ? `-${i + 1}` : ''}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`,
    { type: f.type },
  ))
}

export function EkSecici({ dosyalar, onChange, disabled = false }) {
  const inputRef = useRef(null)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: 'var(--radius-sm)',
            background: 'transparent', border: '1px dashed var(--border-default)',
            color: 'var(--text-secondary)', cursor: disabled ? 'not-allowed' : 'pointer',
            font: '500 12.5px/18px var(--font-sans)',
          }}
        >
          <Paperclip size={13} strokeWidth={1.7} /> Dosya / resim ekle
        </button>
        {dosyalar.map((f, i) => (
          <span key={`${f.name}-${i}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 8px', borderRadius: 'var(--radius-pill)',
            background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
            font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)',
            maxWidth: 220,
          }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
            <button
              type="button"
              onClick={() => onChange(dosyalar.filter((_, j) => j !== i))}
              disabled={disabled}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-tertiary)', display: 'inline-flex' }}
              aria-label="Kaldır"
            >
              <X size={12} strokeWidth={1.7} />
            </button>
          </span>
        ))}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={e => {
          const yeni = Array.from(e.target.files || [])
          if (yeni.length) onChange([...dosyalar, ...yeni])
          e.target.value = '' // aynı dosya tekrar seçilebilsin
        }}
      />
    </div>
  )
}

// Resimleri uygulama İÇİNDE lightbox'ta gösterir — yeni sekmede açınca adres
// çubuğunda ham Supabase storage URL'i görünüyordu (2026-07-21). Diğer dosya
// tipleri (PDF vb.) yeni sekmede açılmaya devam eder.
export function Lightbox({ acik, url, ad, onKapat }) {
  useEffect(() => {
    if (!acik) return
    const onKey = e => e.key === 'Escape' && onKapat?.()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [acik, onKapat])
  if (!acik) return null
  return createPortal(
    <div onClick={onKapat} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10001,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <img src={url} alt={ad || ''} onClick={e => e.stopPropagation()} style={{
        maxWidth: '95vw', maxHeight: '92vh', objectFit: 'contain',
        borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      }} />
      <button aria-label="Kapat" onClick={onKapat} style={{
        position: 'fixed', top: 16, right: 16, width: 40, height: 40, borderRadius: 20,
        background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff',
        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <X size={20} strokeWidth={1.7} />
      </button>
    </div>,
    document.body,
  )
}

export function EkListesi({ dosyalar }) {
  const [buyuk, setBuyuk] = useState(null)  // { url, ad }
  if (!dosyalar?.length) return null
  const resimler = dosyalar.filter(d => (d.type || '').startsWith('image/'))
  const digerler = dosyalar.filter(d => !(d.type || '').startsWith('image/'))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
      {resimler.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {resimler.map((d, i) => (
            <button key={i} type="button" title={d.name}
              onClick={() => setBuyuk({ url: d.url, ad: d.name })}
              style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}>
              <img src={d.url} alt={d.name} style={{
                width: 72, height: 72, objectFit: 'cover', display: 'block',
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)',
              }} />
            </button>
          ))}
        </div>
      )}
      {digerler.map((d, i) => (
        <a key={i} href={d.url} target="_blank" rel="noopener noreferrer" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          font: '400 12.5px/18px var(--font-sans)', color: 'var(--brand-primary)',
          textDecoration: 'none', width: 'fit-content',
        }}>
          <FileText size={13} strokeWidth={1.7} />
          {d.name}
          {d.size ? <span style={{ color: 'var(--text-tertiary)' }}>({Math.round(d.size / 1024)} KB)</span> : null}
        </a>
      ))}
      <Lightbox acik={!!buyuk} url={buyuk?.url} ad={buyuk?.ad} onKapat={() => setBuyuk(null)} />
    </div>
  )
}
