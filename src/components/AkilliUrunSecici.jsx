// Akıllı ürün seçici (Stok v2 Faz 3) — teklif / ön sipariş / keşif satırlarında
// ortak bileşen. "2 mp 2.8 dome kamera" gibi özellik bazlı VE model/marka/kod
// metin araması yapar; sonuçlarda stok durumu + özellik rozetleri gösterir.
// Veri: ürünler prop'la gelir (çağıran zaten yükler); kategori/özellik
// tanımları ve stok özetleri cached servislerden kendisi çeker.
import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Package, Search } from 'lucide-react'
import { trContains } from '../lib/trSearch'
import { sorguCozumle, urunEslesiyorMu } from '../lib/stokAkilliArama'
import { kategorileriGetir } from '../services/stokKategoriService'
import { ozellikTanimlariGetir, tumUrunOzellikleriGetir } from '../services/stokOzellikService'
import { stokKalemOzetleriniGetir } from '../services/stokService'

const MAKS_SONUC = 30

export default function AkilliUrunSecici({
  urunler = [],
  value = '',
  onSec,
  onYeni,           // verilirse listede '+ Yeni Stok Ürünü…' çıkar
  placeholder = 'Stok seç…',
  disabled = false,
}) {
  const [acik, setAcik] = useState(false)
  const [sorgu, setSorgu] = useState('')
  const [panelStyle, setPanelStyle] = useState(null)
  const [kategoriler, setKategoriler] = useState([])
  const [tanimlar, setTanimlar] = useState([])
  const [urunOzellikMap, setUrunOzellikMap] = useState(null)
  const [kalemOzetleri, setKalemOzetleri] = useState(new Map())
  const ref = useRef(null)
  const inputRef = useRef(null)

  // Panel ilk açıldığında bağlam verilerini (cached) yükle
  useEffect(() => {
    if (!acik || kategoriler.length > 0) return
    Promise.all([
      kategorileriGetir(false),
      ozellikTanimlariGetir(false),
      tumUrunOzellikleriGetir(),
      stokKalemOzetleriniGetir(),
    ])
      .then(([kat, tan, uoz, koz]) => {
        setKategoriler(kat || [])
        setTanimlar(tan || [])
        setUrunOzellikMap(uoz || new Map())
        setKalemOzetleri(koz || new Map())
      })
      .catch(e => console.warn('[AkilliUrunSecici] bağlam yüklenemedi:', e?.message))
  }, [acik])

  // Panel konumu (CustomSelect deseni — body portal, fixed)
  useLayoutEffect(() => {
    if (!acik || !ref.current) return
    const recalc = () => {
      const rect = ref.current.getBoundingClientRect()
      const maxH = 420
      const asagidaBosluk = window.innerHeight - rect.bottom
      const yukariAc = asagidaBosluk < maxH && rect.top > asagidaBosluk
      const genislik = Math.min(Math.max(520, rect.width), window.innerWidth - rect.left - 8)
      setPanelStyle({
        position: 'fixed',
        left: rect.left,
        width: genislik,
        top: yukariAc ? undefined : rect.bottom + 4,
        bottom: yukariAc ? window.innerHeight - rect.top + 4 : undefined,
        maxHeight: maxH,
      })
    }
    recalc()
    window.addEventListener('scroll', recalc, true)
    window.addEventListener('resize', recalc)
    return () => {
      window.removeEventListener('scroll', recalc, true)
      window.removeEventListener('resize', recalc)
    }
  }, [acik])

  // Dışarı tık / Escape → kapat
  useEffect(() => {
    if (!acik) return
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest('[data-akilli-urun-panel]')) {
        setAcik(false)
      }
    }
    const onKey = (e) => { if (e.key === 'Escape') setAcik(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [acik])

  useEffect(() => {
    if (acik) setTimeout(() => inputRef.current?.focus(), 0)
    else setSorgu('')
  }, [acik])

  // Sorgu çözümle + filtrele
  const cozum = sorgu.trim().length >= 2 ? sorguCozumle(sorgu, kategoriler, tanimlar) : null
  const metinAra = (u, q) => trContains(
    `${u.stokKodu || ''} ${u.stokAdi || ''} ${u.marka || ''} ${u.model || ''} ${u.barkod || ''} ${u.tedarikciUrunKodu || ''}`,
    q,
  )
  const sonuclar = []
  for (const u of urunler) {
    if (u.aktif === false) continue
    if (cozum?.akilli) {
      if (!urunEslesiyorMu(u, cozum, kategoriler, urunOzellikMap, metinAra)) continue
    } else if (sorgu.trim() && !metinAra(u, sorgu)) continue
    sonuclar.push(u)
    if (sonuclar.length >= MAKS_SONUC) break
  }

  const secili = urunler.find(u => u.stokKodu === value)
  const katAd = (id) => kategoriler.find(k => k.id === id)?.ad

  // Stok durumu satırı: SN'li ürünse kalem özetinden, değilse stok_miktari
  const stokBilgi = (u) => {
    const oz = kalemOzetleri.get(u.stokKodu)
    if (u.seriTakipli && oz) return `Depo ${oz.depoda} · Tekn. ${oz.teknisyende} · Toplam ${Math.max(0, oz.toplam - oz.hurda)}`
    const m = Number(u.stokMiktari ?? 0)
    return `Stok ${m}`
  }

  // Ürünün özellik rozetleri (ilk 3)
  const ozellikRozetleri = (u) => {
    const uMap = urunOzellikMap?.get(u.id)
    if (!uMap) return []
    const out = []
    for (const [oid, deger] of uMap) {
      const t = tanimlar.find(x => x.id === oid)
      if (!t) continue
      out.push(t.tip === 'evet_hayir' ? (deger === 'Evet' ? t.ad : null) : deger)
      if (out.filter(Boolean).length >= 3) break
    }
    return out.filter(Boolean)
  }

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', minWidth: 0 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setAcik(p => !p) }}
        title={secili ? `${secili.stokKodu} — ${secili.stokAdi}` : placeholder}
        style={{
          width: '100%', minWidth: 0,
          background: 'var(--surface-card, #fff)',
          border: '1px solid var(--border-default, #D9DFE5)',
          color: value ? 'var(--text-primary)' : 'var(--text-tertiary)',
          borderRadius: 'var(--radius-sm, 4px)',
          padding: '8px 10px',
          font: '400 13px/20px var(--font-sans)',
          textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          overflow: 'hidden',
        }}
      >
        <Search size={12} strokeWidth={1.5} style={{ flexShrink: 0, opacity: 0.5 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {value || placeholder}
        </span>
      </button>

      {acik && panelStyle && createPortal(
        <div
          data-akilli-urun-panel
          style={{
            ...panelStyle,
            background: 'var(--surface-card, #fff)',
            border: '1px solid var(--border-default, #D9DFE5)',
            borderRadius: 'var(--radius-md, 6px)',
            boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.12))',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            zIndex: 10000,
          }}
        >
          <div style={{ padding: 8, borderBottom: '1px solid var(--border-default)' }}>
            <input
              ref={inputRef}
              type="text"
              value={sorgu}
              onChange={e => setSorgu(e.target.value)}
              placeholder='Akıllı ara: "2 mp 2.8 dome kamera" veya model/marka/kod…'
              style={{
                width: '100%', padding: '7px 10px',
                font: '400 13px/18px var(--font-sans)',
                background: 'var(--surface-sunken, #EDF0F3)',
                border: '1px solid transparent',
                borderRadius: 'var(--radius-sm, 4px)',
                outline: 'none', color: 'var(--text-primary)',
              }}
            />
            {cozum?.akilli && (
              <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ font: '600 9px/14px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  Algılandı:
                </span>
                {cozum.rozetler.map((r, i) => (
                  <span key={i} style={{
                    padding: '1px 7px', borderRadius: 'var(--radius-pill)',
                    font: '500 10px/15px var(--font-sans)',
                    background: r.tip === 'kategori' ? 'var(--brand-primary)' : 'var(--brand-primary-soft)',
                    color: r.tip === 'kategori' ? '#fff' : 'var(--brand-primary)',
                    border: '1px solid var(--brand-primary)',
                  }}>
                    {r.etiket}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {onYeni && (
              <div
                onMouseDown={(e) => { e.preventDefault(); onYeni(); setAcik(false) }}
                style={{
                  padding: '8px 12px', cursor: 'pointer',
                  color: 'var(--brand-primary)', font: '500 13px/18px var(--font-sans)',
                  borderBottom: '1px solid var(--border-default)',
                }}
              >
                + Yeni Stok Ürünü…
              </div>
            )}
            {sonuclar.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', font: '400 12px/16px var(--font-sans)' }}>
                Sonuç bulunamadı.
              </div>
            ) : sonuclar.map(u => (
              <div
                key={u.id}
                onMouseDown={(e) => { e.preventDefault(); onSec?.(u); setAcik(false) }}
                style={{
                  padding: '7px 12px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border-default)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-sunken, #EDF0F3)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Package size={12} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  <span style={{
                    flex: 1, minWidth: 0, font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {u.stokAdi}
                  </span>
                  <span className="tabular-nums" style={{ font: '500 11px/16px var(--font-sans)', color: 'var(--success)', flexShrink: 0 }}>
                    {stokBilgi(u)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2, paddingLeft: 20, flexWrap: 'wrap' }}>
                  <span style={{ font: '500 11px/15px var(--font-mono)', color: 'var(--text-tertiary)' }}>{u.stokKodu}</span>
                  {u.marka && <span style={{ font: '400 11px/15px var(--font-sans)', color: 'var(--text-tertiary)' }}>{u.marka}</span>}
                  {katAd(u.kategoriId) && (
                    <span style={{
                      padding: '0 6px', borderRadius: 'var(--radius-pill)',
                      font: '500 10px/15px var(--font-sans)',
                      background: 'var(--surface-sunken)', color: 'var(--text-secondary)',
                      border: '1px solid var(--border-default)',
                    }}>
                      {katAd(u.kategoriId)}
                    </span>
                  )}
                  {ozellikRozetleri(u).map((r, i) => (
                    <span key={i} style={{
                      padding: '0 6px', borderRadius: 'var(--radius-pill)',
                      font: '500 10px/15px var(--font-sans)',
                      background: 'var(--brand-primary-soft)', color: 'var(--brand-primary)',
                    }}>
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {sonuclar.length >= MAKS_SONUC && (
              <div style={{ padding: '6px 12px', font: '400 11px/15px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                İlk {MAKS_SONUC} sonuç gösteriliyor — aramayı daraltın.
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
