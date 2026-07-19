// Keşif krokileri bölümü (mig 202) — sahada boş tuvale çizilen yerleşim planları.
// Kartlar: küçük görsel + başlık + sembol sayısı; Yeni Kroki → başlık gir → editör.
// Editör = KesifFotoCizim'in kroki modu (duvar/kablo/sembol paleti + kalem bağı).
import { useState } from 'react'
import { createPortal } from 'react-dom'
// DİKKAT: lucide 'Map' ikonu global Map yapıcısını GÖLGELER (new Map() çöker) — takma adla al
import { Map as MapIkon, Plus, X, Pencil, Trash2, ImageOff } from 'lucide-react'
import {
  kesifKrokiKaydet, kesifKrokiSil, kesifFotoUrlleri, krokiSembolBilgi,
} from '../../services/kesifService'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'
import { Button, Input, Label, Card } from '../ui'
import KesifFotoCizim from './KesifFotoCizim'

const fmtTarihSaat = (t) => t ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export default function KesifKrokiBolumu({ kesifId, krokiler, setKrokiler, fotoUrlMap, setFotoUrlMap, kalemler, kullanici }) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [baslikModal, setBaslikModal] = useState(false)
  const [yeniBaslik, setYeniBaslik] = useState('')
  const [duzenlenen, setDuzenlenen] = useState(null)   // { id?, baslik, veri, gorselYolu } — editör açık
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const duzenleyebilir = (k) =>
    kullanici?.rol === 'admin' || !k.olusturanId || String(k.olusturanId) === String(kullanici?.id)

  const kaydet = async (pngBlob, veri) => {
    setKaydediliyor(true)
    try {
      const kayit = await kesifKrokiKaydet({
        id: duzenlenen.id,
        kesifId,
        baslik: duzenlenen.baslik,
        veri,
        pngBlob,
        mevcutYol: duzenlenen.gorselYolu,
        kullanici,
      })
      setDuzenlenen(null)
      const guncel = duzenlenen.id
        ? krokiler.map(x => x.id === kayit.id ? kayit : x)
        : [...krokiler, kayit]
      setKrokiler(guncel)
      // Kroki görseli değişti — signed URL tazele (upsert aynı yola yazar, cache'i kır)
      const urls = await kesifFotoUrlleri(guncel.map(k => k.gorselYolu).filter(Boolean))
      setFotoUrlMap(prev => new Map([...prev, ...urls]))
      toast.success('Kroki kaydedildi.')
    } catch (e) {
      toast.error('Kroki kaydedilemedi: ' + (e?.message || 'hata'))
    } finally {
      setKaydediliyor(false)
    }
  }

  const sil = async (k) => {
    const onay = await confirm({
      baslik: 'Krokiyi Sil', mesaj: `"${k.baslik}" kalıcı olarak silinecek. Emin misin?`,
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    try {
      await kesifKrokiSil(k)
      setKrokiler(prev => prev.filter(x => x.id !== k.id))
    } catch (e) {
      toast.error(e?.message || 'Silinemedi.')
    }
  }

  const sembolOzet = (k) => {
    const say = new Map()
    for (const s of (k.veri?.sekiller || [])) {
      if (s.tip !== 'sembol') continue
      say.set(s.sembol, (say.get(s.sembol) || 0) + 1)
    }
    return [...say.entries()].map(([id, n]) => `${n} ${krokiSembolBilgi(id).ad}`).join(' · ')
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 className="t-h2" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <MapIkon size={15} strokeWidth={1.5} /> Krokiler ({krokiler.length})
        </h2>
        <Button variant="secondary" size="sm" iconLeft={<Plus size={13} strokeWidth={1.5} />}
          onClick={() => { setYeniBaslik(`Kroki ${krokiler.length + 1}`); setBaslikModal(true) }}>
          Yeni Kroki
        </Button>
      </div>

      {krokiler.length === 0 ? (
        <p className="t-caption" style={{ margin: 0 }}>
          Henüz kroki yok. Sahadaki mekânın yerleşimini (duvarlar, kamera noktaları, kablo güzergahı)
          boş tuvale çizebilirsin — semboller keşif kalemlerine bağlanabilir.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {krokiler.map(k => {
            const url = fotoUrlMap.get(k.gorselYolu)
            const ozet = sembolOzet(k)
            const yetkili = duzenleyebilir(k)
            return (
              <div key={k.id} style={{
                borderRadius: 10, overflow: 'hidden', background: 'var(--surface-sunken)',
                border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column',
              }}>
                <div style={{ aspectRatio: '4/3', cursor: yetkili ? 'pointer' : 'default', background: '#fff' }}
                  onClick={() => yetkili && setDuzenlenen({ id: k.id, baslik: k.baslik, veri: k.veri, gorselYolu: k.gorselYolu })}
                  title={yetkili ? 'Düzenlemek için tıkla' : undefined}>
                  {url ? (
                    <img src={url} alt={k.baslik} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-tertiary)' }}>
                      <ImageOff size={18} strokeWidth={1.5} />
                    </div>
                  )}
                </div>
                <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                  <span style={{ font: '700 12.5px/17px var(--font-sans)', color: 'var(--text-primary)' }}>{k.baslik}</span>
                  {ozet && <span className="t-caption">{ozet}</span>}
                  <span className="t-caption" style={{ marginTop: 'auto' }}>
                    {k.olusturanAd || '—'} · {fmtTarihSaat(k.guncellemeTarih || k.olusturmaTarih)}
                  </span>
                </div>
                {yetkili && (
                  <div style={{ display: 'flex', borderTop: '1px solid var(--border-default)' }}>
                    <button title="Düzenle"
                      onClick={() => setDuzenlenen({ id: k.id, baslik: k.baslik, veri: k.veri, gorselYolu: k.gorselYolu })}
                      style={krokiBtn}>
                      <Pencil size={14} strokeWidth={1.6} />
                    </button>
                    <button title="Sil" onClick={() => sil(k)}
                      style={{ ...krokiBtn, borderLeft: '1px solid var(--border-default)', color: 'var(--danger, #dc2626)' }}>
                      <Trash2 size={14} strokeWidth={1.6} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Başlık girişi — yeni kroki */}
      {baslikModal && createPortal(
        <div onClick={() => setBaslikModal(false)} style={{
          position: 'fixed', inset: 0, zIndex: 100000, padding: 20,
          background: 'rgba(15, 23, 42, 0.72)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 380, background: 'var(--surface-card)',
            border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)', padding: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ font: '700 15px/21px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>Yeni Kroki</h2>
              <button onClick={() => setBaslikModal(false)} aria-label="Kapat"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4 }}>
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <Label>Kroki başlığı</Label>
            <Input autoFocus value={yeniBaslik} onChange={e => setYeniBaslik(e.target.value)}
              placeholder="Örn. Zemin kat, Dükkan içi, Otopark…"
              onKeyDown={e => { if (e.key === 'Enter' && yeniBaslik.trim()) { setBaslikModal(false); setDuzenlenen({ baslik: yeniBaslik.trim(), veri: null, gorselYolu: null }) } }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <Button variant="secondary" onClick={() => setBaslikModal(false)}>Vazgeç</Button>
              <Button variant="primary" disabled={!yeniBaslik.trim()}
                onClick={() => { setBaslikModal(false); setDuzenlenen({ baslik: yeniBaslik.trim(), veri: null, gorselYolu: null }) }}>
                Çizime Başla
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Kroki editörü */}
      {duzenlenen && (
        <KesifFotoCizim
          krokiModu
          kalemler={kalemler}
          baslangicSekilleri={duzenlenen.veri?.sekiller || []}
          onKapat={() => setDuzenlenen(null)}
          onKaydet={kaydet}
          kaydediliyor={kaydediliyor}
        />
      )}
    </Card>
  )
}

const krokiBtn = {
  flex: 1, padding: '7px 0', border: 'none', background: 'transparent',
  cursor: 'pointer', color: 'var(--text-secondary)', display: 'grid', placeItems: 'center',
}
