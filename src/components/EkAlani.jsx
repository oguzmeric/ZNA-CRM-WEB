// Ortak eklenti seçici + görüntüleyici — görev formu, görev yorumu ve
// görüşme yorumu aynı bileşeni kullanır (madde: yorum/görev ekleri).
//
// <EkSecici dosyalar={File[]} onChange={setFiles} /> — henüz yüklenmemiş
//   local dosyaları seçtirir/listeler; upload SUBMIT anında ekleriYukle ile.
// <EkListesi dosyalar={[{url,name,type,size}]} /> — kayıtlı ekleri gösterir:
//   resimler küçük önizleme, diğerleri ataçlı link.
import { useRef } from 'react'
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

export function EkListesi({ dosyalar }) {
  if (!dosyalar?.length) return null
  const resimler = dosyalar.filter(d => (d.type || '').startsWith('image/'))
  const digerler = dosyalar.filter(d => !(d.type || '').startsWith('image/'))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
      {resimler.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {resimler.map((d, i) => (
            <a key={i} href={d.url} target="_blank" rel="noopener noreferrer" title={d.name}>
              <img src={d.url} alt={d.name} style={{
                width: 72, height: 72, objectFit: 'cover',
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)',
              }} />
            </a>
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
    </div>
  )
}
