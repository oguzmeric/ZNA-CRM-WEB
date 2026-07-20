// Keşif fotoğrafları bölümü (KEŞİF DÜZENLEME dokümanı §1-6).
// Kart görünümü: başlık + etiket + ekleyen + "çizim var" rozeti.
// Tek foto seçilirse yüklemeden ÖNCE önizleme + alt bilgi ekranı açılır (doküman §4);
// çoklu seçimde direkt yüklenir, bilgiler karttan sonradan girilir.
import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Camera, Upload, X, Pencil, PenTool, Trash2, Eye, Layers, ImageOff,
} from 'lucide-react'
import {
  kesifFotoYukle, kesifFotoGuncelle, kesifFotoSil, kesifFotolariGetir,
  kesifFotoUrlleri, kesifFotoCizimKaydet, kesifFotoCizimSil,
  KESIF_FOTO_ETIKETLERI, kesifFotoEtiketBilgi, KESIF_FOTO_MAX_MB,
} from '../../services/kesifService'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'
import { Button, Input, Textarea, Label, Card, Badge } from '../ui'
import CustomSelect from '../CustomSelect'
import KesifFotoCizim from './KesifFotoCizim'

const fmtTarihSaat = (t) => t ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const BOS_META = { baslik: '', aciklama: '', montajNotu: '', mahal: '', katBolum: '', etiket: '', kalemId: '' }

// Bileşen DIŞINDA — içeride tanımlansaydı her render'da remount olur, input focus kaybederdi
function MetaForm({ meta, setMeta, kalemler }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <Label>Fotoğraf başlığı</Label>
        <Input value={meta.baslik} onChange={e => setMeta(p => ({ ...p, baslik: e.target.value }))} placeholder="Örn. Giriş kapısı kamera noktası" />
      </div>
      <div>
        <Label>Açıklama / alt bilgi</Label>
        <Textarea rows={2} value={meta.aciklama} onChange={e => setMeta(p => ({ ...p, aciklama: e.target.value }))} placeholder="Örn. Buraya 2 MP IP dome kamera önerildi" />
      </div>
      <div>
        <Label>Montaj yeri notu</Label>
        <Input value={meta.montajNotu} onChange={e => setMeta(p => ({ ...p, montajNotu: e.target.value }))} placeholder="Örn. Montaj için enerji hattı çekilecek" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <Label>Bulunduğu alan / mahal</Label>
          <Input value={meta.mahal} onChange={e => setMeta(p => ({ ...p, mahal: e.target.value }))} placeholder="Örn. Ana giriş" />
        </div>
        <div>
          <Label>Kat / bölüm</Label>
          <Input value={meta.katBolum} onChange={e => setMeta(p => ({ ...p, katBolum: e.target.value }))} placeholder="Örn. Zemin kat" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <Label>Etiket</Label>
          <CustomSelect value={meta.etiket} onChange={e => setMeta(p => ({ ...p, etiket: e.target.value }))}>
            <option value="">Etiket yok</option>
            {KESIF_FOTO_ETIKETLERI.map(t => <option key={t.id} value={t.id}>{t.ad}</option>)}
          </CustomSelect>
        </div>
        <div>
          <Label>İlgili keşif kalemi</Label>
          <CustomSelect value={meta.kalemId} onChange={e => setMeta(p => ({ ...p, kalemId: e.target.value }))}>
            <option value="">Bağlı değil</option>
            {(kalemler || []).map(k => <option key={k.id} value={k.id}>{k.miktar} {k.birim} — {k.urunAdi}</option>)}
          </CustomSelect>
        </div>
      </div>
    </div>
  )
}

export default function KesifFotoBolumu({ kesifId, fotolar, setFotolar, fotoUrlMap, setFotoUrlMap, kalemler, kullanici }) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const fotoRef = useRef(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [yeniFoto, setYeniFoto] = useState(null)        // { file, onizleme } — yükleme öncesi meta ekranı
  const [yeniMeta, setYeniMeta] = useState(BOS_META)
  const [duzenlenen, setDuzenlenen] = useState(null)    // foto — alt bilgi düzenleme modalı
  const [duzenMeta, setDuzenMeta] = useState(BOS_META)
  const [cizilen, setCizilen] = useState(null)          // foto — çizim editörü
  const [cizimKaydediliyor, setCizimKaydediliyor] = useState(false)
  const [buyuk, setBuyuk] = useState(null)              // { foto, cizimliGoster } — lightbox
  const [metaKaydediliyor, setMetaKaydediliyor] = useState(false)

  const duzenleyebilir = (f) =>
    kullanici?.rol === 'admin' || !f.olusturanId || String(f.olusturanId) === String(kullanici?.id)

  const urlleriYenile = async (liste) => {
    const yollar = (liste || fotolar).flatMap(f => [f.dosyaYolu, f.cizimYolu]).filter(Boolean)
    setFotoUrlMap(await kesifFotoUrlleri(yollar))
  }

  const listeYenile = async () => {
    const tumu = await kesifFotolariGetir(kesifId)
    setFotolar(tumu)
    await urlleriYenile(tumu)
  }

  // ── Yükleme akışı (doküman §4) ────────────────────────────────────────────
  const fotoSec = (e) => {
    const dosyalar = Array.from(e.target.files || [])
    e.target.value = ''
    if (!dosyalar.length) return
    if (dosyalar.length === 1) {
      // Tek foto: önce önizleme + alt bilgi
      setYeniMeta(BOS_META)
      setYeniFoto({ file: dosyalar[0], onizleme: URL.createObjectURL(dosyalar[0]) })
    } else {
      copluYukle(dosyalar)
    }
  }

  const copluYukle = async (dosyalar) => {
    setYukleniyor(true)
    let ok = 0
    for (const f of dosyalar) {
      try {
        const yeni = await kesifFotoYukle(kesifId, f, { olusturanAd: kullanici?.ad || '', olusturanId: kullanici?.id })
        setFotolar(prev => [yeni, ...prev])
        ok++
      } catch (err) {
        toast.error(`${f.name}: ${err?.message || 'yüklenemedi'}`)
      }
    }
    if (ok) { toast.success(`${ok} fotoğraf yüklendi — alt bilgileri kartlardan girebilirsin.`); await listeYenile() }
    setYukleniyor(false)
  }

  const yeniKaydet = async (cizimeGec = false) => {
    if (!yeniFoto) return
    setYukleniyor(true)
    try {
      const yeni = await kesifFotoYukle(kesifId, yeniFoto.file, {
        ...yeniMeta,
        kalemId: yeniMeta.kalemId || null,
        etiket: yeniMeta.etiket || null,
        olusturanAd: kullanici?.ad || '',
        olusturanId: kullanici?.id,
      })
      URL.revokeObjectURL(yeniFoto.onizleme)
      setYeniFoto(null)
      const guncelListe = [yeni, ...fotolar]
      setFotolar(guncelListe)
      await urlleriYenile(guncelListe)
      toast.success('Fotoğraf kaydedildi.')
      if (cizimeGec) setCizilen(yeni)
    } catch (e) {
      toast.error('Yüklenemedi: ' + (e?.message || 'hata'))
    } finally {
      setYukleniyor(false)
    }
  }

  // ── Alt bilgi düzenleme ───────────────────────────────────────────────────
  const duzenleAc = (f) => {
    setDuzenMeta({
      baslik: f.baslik || '', aciklama: f.aciklama || '', montajNotu: f.montajNotu || '',
      mahal: f.mahal || '', katBolum: f.katBolum || '', etiket: f.etiket || '', kalemId: f.kalemId || '',
    })
    setDuzenlenen(f)
  }

  const duzenKaydet = async () => {
    setMetaKaydediliyor(true)
    try {
      await kesifFotoGuncelle(duzenlenen.id, { ...duzenMeta, kalemId: duzenMeta.kalemId || null, etiket: duzenMeta.etiket || null })
      setFotolar(prev => prev.map(x => x.id === duzenlenen.id
        ? { ...x, ...duzenMeta, kalemId: duzenMeta.kalemId || null, etiket: duzenMeta.etiket || null }
        : x))
      setDuzenlenen(null)
      toast.success('Fotoğraf bilgileri güncellendi.')
    } catch (e) {
      toast.error(e?.message || 'Güncellenemedi.')
    } finally {
      setMetaKaydediliyor(false)
    }
  }

  // ── Çizim ─────────────────────────────────────────────────────────────────
  const cizimKaydet = async (blob, cizimVeri) => {
    setCizimKaydediliyor(true)
    try {
      const g = await kesifFotoCizimKaydet(cizilen, blob, cizimVeri, kullanici)
      setCizilen(null)
      const guncelListe = fotolar.map(x => x.id === g.id ? { ...x, ...g } : x)
      setFotolar(guncelListe)
      await urlleriYenile(guncelListe)
      toast.success('Çizim kaydedildi — orijinal fotoğraf korunuyor.')
    } catch (e) {
      toast.error('Çizim kaydedilemedi: ' + (e?.message || 'hata'))
    } finally {
      setCizimKaydediliyor(false)
    }
  }

  const cizimKaldir = async (f) => {
    const onay = await confirm({
      baslik: 'Çizimi Kaldır', mesaj: 'Fotoğraf orijinal haline dönecek, çizim silinecek. Emin misin?',
      onayMetin: 'Evet, kaldır', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    try {
      await kesifFotoCizimSil(f, kullanici)
      setFotolar(prev => prev.map(x => x.id === f.id ? { ...x, cizimYolu: null, cizimVeri: null } : x))
      setBuyuk(null)
      toast.success('Çizim kaldırıldı.')
    } catch (e) {
      toast.error(e?.message || 'Kaldırılamadı.')
    }
  }

  const fotoKaldir = async (f) => {
    const onay = await confirm({
      baslik: 'Fotoğrafı Sil', mesaj: 'Fotoğraf (varsa çizimiyle birlikte) kalıcı olarak silinecek. Emin misin?',
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    try {
      await kesifFotoSil(f)
      setFotolar(prev => prev.filter(x => x.id !== f.id))
      setBuyuk(null)
    } catch (e) {
      toast.error('Silinemedi: ' + (e?.message || 'bilinmeyen hata'))
    }
  }

  const kalemAdi = (kalemId) => {
    const k = kalemler?.find(x => String(x.id) === String(kalemId))
    return k ? `${k.miktar} ${k.birim} — ${k.urunAdi}` : null
  }

  const modalStil = {
    arka: {
      position: 'fixed', inset: 0, zIndex: 100000, padding: 20,
      background: 'rgba(15, 23, 42, 0.72)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    kart: {
      width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto',
      background: 'var(--surface-card)', border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: 22,
    },
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 className="t-h2" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Camera size={15} strokeWidth={1.5} /> Fotoğraflar ({fotolar.length})
        </h2>
        <Button variant="secondary" size="sm" iconLeft={<Upload size={13} strokeWidth={1.5} />}
          onClick={() => fotoRef.current?.click()} disabled={yukleniyor}>
          {yukleniyor ? 'Yükleniyor…' : 'Foto Ekle'}
        </Button>
        {/* capture: telefonda doğrudan kamerayı açar */}
        <input ref={fotoRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={fotoSec} />
      </div>

      {fotolar.length === 0 ? (
        <p className="t-caption" style={{ margin: 0 }}>
          Henüz fotoğraf yok. Telefondan açarsan "Foto Ekle" doğrudan kamerayı açar (max {KESIF_FOTO_MAX_MB} MB/foto).
          Tek foto seçersen yüklemeden önce başlık, açıklama ve etiket girebilirsin.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 10 }}>
          {fotolar.map(f => {
            const url = fotoUrlMap.get(f.cizimYolu) || fotoUrlMap.get(f.dosyaYolu)
            const etiket = kesifFotoEtiketBilgi(f.etiket)
            const yetkili = duzenleyebilir(f)
            return (
              <div key={f.id} style={{
                borderRadius: 10, overflow: 'hidden', background: 'var(--surface-sunken)',
                border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column',
              }}>
                <div style={{ position: 'relative', aspectRatio: '4/3', cursor: 'pointer' }}
                  onClick={() => setBuyuk({ foto: f, cizimliGoster: !!f.cizimYolu })}>
                  {url ? (
                    <img src={url} alt={f.baslik || f.aciklama || 'keşif foto'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-tertiary)' }}>
                      <ImageOff size={18} strokeWidth={1.5} />
                    </div>
                  )}
                  {f.cizimYolu && (
                    <span style={{
                      position: 'absolute', top: 6, left: 6, display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 7px', borderRadius: 10, background: 'rgba(22,163,74,0.92)',
                      color: '#fff', font: '700 10px/14px var(--font-sans)',
                    }}>
                      <PenTool size={10} /> Çizim var
                    </span>
                  )}
                  {etiket && (
                    <span style={{
                      position: 'absolute', bottom: 6, left: 6, padding: '2px 7px', borderRadius: 10,
                      background: etiket.renk, color: '#fff', font: '700 10px/14px var(--font-sans)',
                    }}>
                      {etiket.ad}
                    </span>
                  )}
                </div>
                <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                  <span style={{ font: '700 12px/16px var(--font-sans)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.baslik || <span style={{ color: 'var(--text-tertiary)', fontWeight: 500, fontStyle: 'italic' }}>Başlık yok</span>}
                  </span>
                  {f.aciklama && (
                    <span className="t-caption" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.aciklama}</span>
                  )}
                  {f.kalemId && kalemAdi(f.kalemId) && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '600 10.5px/14px var(--font-sans)', color: 'var(--brand-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Layers size={10} style={{ flexShrink: 0 }} /> {kalemAdi(f.kalemId)}
                    </span>
                  )}
                  <span className="t-caption" style={{ marginTop: 'auto' }}>
                    {f.olusturanAd || '—'} · {fmtTarihSaat(f.olusturmaTarih)}
                  </span>
                </div>
                <div style={{ display: 'flex', borderTop: '1px solid var(--border-default)' }}>
                  <button title="Görüntüle" onClick={() => setBuyuk({ foto: f, cizimliGoster: !!f.cizimYolu })} style={kartBtn}>
                    <Eye size={14} strokeWidth={1.6} />
                  </button>
                  {yetkili && (
                    <>
                      <button title="Açıklama Ekle / Düzenle" onClick={() => duzenleAc(f)} style={{ ...kartBtn, borderLeft: '1px solid var(--border-default)' }}>
                        <Pencil size={14} strokeWidth={1.6} />
                      </button>
                      <button title="Çizim Yap" onClick={() => setCizilen(f)} style={{ ...kartBtn, borderLeft: '1px solid var(--border-default)' }}>
                        <PenTool size={14} strokeWidth={1.6} />
                      </button>
                      <button title="Sil" onClick={() => fotoKaldir(f)} style={{ ...kartBtn, borderLeft: '1px solid var(--border-default)', color: 'var(--danger, #dc2626)' }}>
                        <Trash2 size={14} strokeWidth={1.6} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Yeni foto: önizleme + alt bilgi (doküman §4 akışı) */}
      {yeniFoto && createPortal(
        <div style={modalStil.arka} onClick={() => { URL.revokeObjectURL(yeniFoto.onizleme); setYeniFoto(null) }}>
          <div style={modalStil.kart} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ font: '700 16px/22px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>Fotoğraf Önizleme</h2>
              <button onClick={() => { URL.revokeObjectURL(yeniFoto.onizleme); setYeniFoto(null) }} aria-label="Kapat"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4 }}>
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
            <img src={yeniFoto.onizleme} alt="önizleme"
              style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 8, background: 'var(--surface-sunken)', marginBottom: 14 }} />
            <MetaForm meta={yeniMeta} setMeta={setYeniMeta} kalemler={kalemler} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, flexWrap: 'wrap' }}>
              <Button variant="secondary" onClick={() => { URL.revokeObjectURL(yeniFoto.onizleme); setYeniFoto(null) }}>Vazgeç</Button>
              <Button variant="secondary" onClick={() => yeniKaydet(true)} disabled={yukleniyor}
                iconLeft={<PenTool size={13} strokeWidth={1.5} />}>
                Kaydet + Çizim Yap
              </Button>
              <Button variant="primary" onClick={() => yeniKaydet(false)} disabled={yukleniyor}>
                {yukleniyor ? 'Yükleniyor…' : 'Kaydet'}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Alt bilgi düzenleme */}
      {duzenlenen && createPortal(
        <div style={modalStil.arka} onClick={() => setDuzenlenen(null)}>
          <div style={modalStil.kart} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ font: '700 16px/22px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>Fotoğraf Bilgileri</h2>
              <button onClick={() => setDuzenlenen(null)} aria-label="Kapat"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4 }}>
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
            <MetaForm meta={duzenMeta} setMeta={setDuzenMeta} kalemler={kalemler} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
              <Button variant="secondary" onClick={() => setDuzenlenen(null)}>Vazgeç</Button>
              <Button variant="primary" onClick={duzenKaydet} disabled={metaKaydediliyor}>
                {metaKaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Lightbox — orijinal ↔ çizimli geçiş (doküman §8) */}
      {buyuk && createPortal(
        <div onClick={() => setBuyuk(null)} style={{
          position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(10, 14, 25, 0.94)',
          display: 'flex', flexDirection: 'column', padding: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ font: '700 14px/20px var(--font-sans)', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {buyuk.foto.baslik || 'Keşif fotoğrafı'}
              </span>
              {buyuk.foto.cizimYolu && (
                <Badge tone={buyuk.cizimliGoster ? 'aktif' : 'lead'}>
                  {buyuk.cizimliGoster ? 'Çizimli görünüm' : 'Orijinal'}
                </Badge>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {buyuk.foto.cizimYolu && (
                <Button variant="secondary" size="sm"
                  onClick={() => setBuyuk(b => ({ ...b, cizimliGoster: !b.cizimliGoster }))}>
                  {buyuk.cizimliGoster ? 'Orijinali Göster' : 'Çizimli Göster'}
                </Button>
              )}
              {duzenleyebilir(buyuk.foto) && (
                <Button variant="secondary" size="sm" iconLeft={<PenTool size={13} />}
                  onClick={() => { setCizilen(buyuk.foto); setBuyuk(null) }}>
                  Çizim Yap
                </Button>
              )}
              {buyuk.foto.cizimYolu && duzenleyebilir(buyuk.foto) && (
                <Button variant="secondary" size="sm" onClick={() => cizimKaldir(buyuk.foto)}>Çizimi Kaldır</Button>
              )}
              <button onClick={() => setBuyuk(null)} aria-label="Kapat"
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                <X size={16} />
              </button>
            </div>
          </div>
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', minHeight: 0 }} onClick={e => e.stopPropagation()}>
            <img
              src={fotoUrlMap.get(buyuk.cizimliGoster && buyuk.foto.cizimYolu ? buyuk.foto.cizimYolu : buyuk.foto.dosyaYolu)}
              alt={buyuk.foto.baslik || 'keşif foto'}
              style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, objectFit: 'contain' }}
            />
          </div>
          <div onClick={e => e.stopPropagation()} style={{ paddingTop: 10, display: 'flex', flexWrap: 'wrap', gap: '4px 18px', justifyContent: 'center' }}>
            {[
              buyuk.foto.aciklama && `Açıklama: ${buyuk.foto.aciklama}`,
              buyuk.foto.montajNotu && `Montaj: ${buyuk.foto.montajNotu}`,
              buyuk.foto.mahal && `Mahal: ${buyuk.foto.mahal}`,
              buyuk.foto.katBolum && `Kat/Bölüm: ${buyuk.foto.katBolum}`,
              buyuk.foto.kalemId && kalemAdi(buyuk.foto.kalemId) && `Kalem: ${kalemAdi(buyuk.foto.kalemId)}`,
              kesifFotoEtiketBilgi(buyuk.foto.etiket) && `Etiket: ${kesifFotoEtiketBilgi(buyuk.foto.etiket).ad}`,
              `${buyuk.foto.olusturanAd || '—'} · ${fmtTarihSaat(buyuk.foto.olusturmaTarih)}`,
            ].filter(Boolean).map((t, i) => (
              <span key={i} style={{ font: '500 12px/17px var(--font-sans)', color: '#cbd5e1' }}>{t}</span>
            ))}
          </div>
        </div>,
        document.body,
      )}

      {/* Çizim editörü — her zaman ORİJİNAL üstüne çizilir, önceki vektörler yüklenir */}
      {cizilen && (
        <KesifFotoCizim
          imageUrl={fotoUrlMap.get(cizilen.dosyaYolu)}
          baslangicSekilleri={cizilen.cizimVeri?.sekiller || []}
          kalemler={kalemler}
          onKapat={() => setCizilen(null)}
          onKaydet={cizimKaydet}
          kaydediliyor={cizimKaydediliyor}
        />
      )}
    </Card>
  )
}

const kartBtn = {
  flex: 1, padding: '7px 0', border: 'none', background: 'transparent',
  cursor: 'pointer', color: 'var(--text-secondary)', display: 'grid', placeItems: 'center',
}
