// "Notlarım" — kişisel notlar (opsiyonel müşteri bağlantılı).
// UI: grid layout (Google Keep tarzı), kart tıklayınca modal'da düzenle.
// Web tarafında sadece metin oluşturma/düzenleme. Mobile'dan eklenen çizimleri görüntüler.

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Trash2, StickyNote, Image as ImageIcon, X, Building2, Search,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  Card, Button, Input, Textarea, Label, Badge, SearchInput, EmptyState, Modal,
} from '../components/ui'
import CustomSelect from '../components/CustomSelect'
import {
  KATEGORILER, notlarimiGetir, notEkle, notGuncelle, notSil, cizimSignedUrl,
} from '../services/notService'
import { musterileriGetir } from '../services/musteriService'
import { trContains } from '../lib/trSearch'
import { invalidate } from '../lib/cache'

function tarihFormat(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const BOS_FORM = {
  baslik: '', icerik: '', kategori: 'diger', musteriId: '', cizimler: [],
}

function Notlarim() {
  const { kullanici } = useAuth()
  const { toast } = useToast()
  const [notlar, setNotlar] = useState([])
  const [musteriler, setMusteriler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [filtreKategori, setFiltreKategori] = useState('hepsi')
  const [arama, setArama] = useState('')

  // Modal state
  const [modalAcik, setModalAcik] = useState(false)
  const [form, setForm] = useState(BOS_FORM)
  const [duzenleId, setDuzenleId] = useState(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const [acikCizim, setAcikCizim] = useState(null)

  const yukle = useCallback(async ({ ilkYukleme = false } = {}) => {
    if (!kullanici?.id) { setYukleniyor(false); return }
    if (ilkYukleme) setYukleniyor(true)
    try {
      const [n, m] = await Promise.all([
        notlarimiGetir(kullanici.id),
        musterileriGetir(),
      ])
      // İlk yüklemede boş döndüyse (muhtemelen auth henüz hazır değildi),
      // cache'i invalidate edip sessizce yeniden dene
      if (ilkYukleme && (!n || n.length === 0)) {
        invalidate(`notlarim:${kullanici.id}`)
      }
      setNotlar(n || [])
      setMusteriler(m || [])
    } finally {
      if (ilkYukleme) setYukleniyor(false)
    }
  }, [kullanici?.id])

  useEffect(() => { yukle({ ilkYukleme: true }) }, [yukle])

  // Tab gizlenip tekrar görünür olunca + pencere focus alınca yenile
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') yukle() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', yukle)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', yukle)
    }
  }, [yukle])

  const filtrelenmis = useMemo(() => {
    return notlar.filter((n) => {
      if (filtreKategori !== 'hepsi' && n.kategori !== filtreKategori) return false
      if (arama && !trContains([n.baslik, n.icerik, n.musteriFirma].join(' '), arama)) return false
      return true
    })
  }, [notlar, filtreKategori, arama])

  const yeniAc = () => {
    setForm(BOS_FORM)
    setDuzenleId(null)
    setModalAcik(true)
  }

  const duzenleAc = (n) => {
    setForm({
      baslik: n.baslik || '',
      icerik: n.icerik || '',
      kategori: n.kategori || 'diger',
      musteriId: n.musteriId || '',
      cizimler: n.cizimler || [],
    })
    setDuzenleId(n.id)
    setModalAcik(true)
  }

  const kapatModal = () => {
    setForm(BOS_FORM)
    setDuzenleId(null)
    setModalAcik(false)
  }

  const kaydet = async () => {
    if (!form.icerik?.trim() && !form.baslik?.trim()) {
      toast.error('Başlık veya içerik gerekli')
      return
    }
    setKaydediliyor(true)
    try {
      if (duzenleId) {
        await notGuncelle(duzenleId, form, kullanici.id)
        toast.success('Not güncellendi')
      } else {
        await notEkle(kullanici.id, form)
        toast.success('Not eklendi')
      }
      kapatModal()
      yukle()
    } catch (e) {
      toast.error('Kaydedilemedi: ' + (e?.message ?? 'bilinmeyen'))
    } finally {
      setKaydediliyor(false)
    }
  }

  const sil = async (n, e) => {
    e?.stopPropagation()
    if (!window.confirm(`"${n.baslik || 'Başlıksız'}" notu silinsin mi? Çizimler de silinecek, geri alınamaz.`)) return
    try {
      await notSil(n.id, kullanici.id)
      toast.success('Not silindi')
      yukle()
    } catch (err) {
      toast.error('Silinemedi: ' + (err?.message ?? 'bilinmeyen'))
    }
  }

  const cizimAc = async (cizim) => {
    const url = await cizimSignedUrl(cizim.path)
    if (!url) {
      toast.error('Çizim açılamadı.')
      return
    }
    setAcikCizim(url)
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="t-h1">Notlarım</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            <span className="tabular-nums">{filtrelenmis.length}</span> not
            {filtrelenmis.length !== notlar.length && (
              <span> · toplam <span className="tabular-nums">{notlar.length}</span></span>
            )}
          </p>
        </div>
        <Button variant="primary" onClick={yeniAc}>
          <Plus size={16} style={{ marginRight: 6 }} /> Yeni Not
        </Button>
      </div>

      {/* Toolbar: filter chip'leri + arama */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center',
        padding: 12,
        background: 'var(--surface-card)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-default)',
      }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            onClick={() => setFiltreKategori('hepsi')}
            style={chipStyle(filtreKategori === 'hepsi', null)}
          >
            Hepsi
            <span style={{
              marginLeft: 6,
              padding: '1px 6px',
              borderRadius: 8,
              background: filtreKategori === 'hepsi' ? 'rgba(255,255,255,0.25)' : 'var(--surface-sunken)',
              fontSize: 10,
            }}>
              {notlar.length}
            </span>
          </button>
          {KATEGORILER.map((k) => {
            const sayi = notlar.filter((n) => n.kategori === k.id).length
            return (
              <button
                key={k.id}
                onClick={() => setFiltreKategori(k.id)}
                style={chipStyle(filtreKategori === k.id, k.renk)}
              >
                <span style={{ width: 8, height: 8, borderRadius: 4, background: k.renk, marginRight: 6 }} />
                {k.isim}
                <span style={{
                  marginLeft: 6,
                  padding: '1px 6px',
                  borderRadius: 8,
                  background: filtreKategori === k.id ? `${k.renk}30` : 'var(--surface-sunken)',
                  fontSize: 10,
                  color: filtreKategori === k.id ? k.renk : 'var(--text-tertiary)',
                }}>
                  {sayi}
                </span>
              </button>
            )
          })}
        </div>
        <div style={{ flex: 1, minWidth: 200, marginLeft: 'auto' }}>
          <SearchInput value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Notlarda ara…" />
        </div>
      </div>

      {/* Grid */}
      {yukleniyor ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
      ) : filtrelenmis.length === 0 ? (
        <div style={{
          padding: 64, textAlign: 'center',
          background: 'var(--surface-card)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-default)',
        }}>
          <StickyNote size={48} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
          <p style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>
            {arama || filtreKategori !== 'hepsi' ? 'Eşleşen not yok' : 'Henüz not yok'}
          </p>
          <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 6 }}>
            {arama || filtreKategori !== 'hepsi'
              ? 'Farklı bir filtre dene'
              : 'Yukarıdaki "Yeni Not" butonuyla başla'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {filtrelenmis.map((n) => {
            const kategori = KATEGORILER.find((k) => k.id === n.kategori) || KATEGORILER[3]
            const cizimSayisi = Array.isArray(n.cizimler) ? n.cizimler.length : 0
            return (
              <div
                key={n.id}
                onClick={() => duzenleAc(n)}
                style={{
                  position: 'relative',
                  padding: 14,
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-default)',
                  borderTop: `3px solid ${kategori.renk}`,
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'all 120ms',
                  display: 'flex', flexDirection: 'column', gap: 8,
                  minHeight: 140,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = kategori.renk
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-default)'
                  e.currentTarget.style.borderTopColor = kategori.renk
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                {/* Üst satır: kategori + sil */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px',
                    borderRadius: 8,
                    background: `${kategori.renk}15`,
                    color: kategori.renk,
                    font: '600 10px/14px var(--font-sans)',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: kategori.renk }} />
                    {kategori.isim.toUpperCase()}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {cizimSayisi > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, font: '500 10px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                        <ImageIcon size={10} /> {cizimSayisi}
                      </span>
                    )}
                    <button
                      onClick={(e) => sil(n, e)}
                      style={{
                        width: 24, height: 24,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent', border: 'none',
                        color: 'var(--text-tertiary)', cursor: 'pointer',
                        borderRadius: 6,
                        opacity: 0.6,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.opacity = 1 }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.opacity = 0.6 }}
                      title="Sil"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Başlık */}
                <div style={{ font: '700 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
                  {n.baslik || '(başlıksız)'}
                </div>

                {/* İçerik */}
                {n.icerik && (
                  <p style={{
                    font: '400 12px/18px var(--font-sans)',
                    color: 'var(--text-secondary)',
                    margin: 0,
                    flex: 1,
                    display: '-webkit-box',
                    WebkitLineClamp: 5,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {n.icerik}
                  </p>
                )}

                {/* Footer: müşteri + tarih */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
                  {n.musteriFirma ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '500 11px/14px var(--font-sans)', color: 'var(--brand-primary)', minWidth: 0 }}>
                      <Building2 size={11} style={{ flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.musteriFirma}
                      </span>
                    </div>
                  ) : <span />}
                  <span style={{ font: '400 10px/14px var(--font-sans)', color: 'var(--text-tertiary)', flexShrink: 0, marginLeft: 8 }}>
                    {tarihFormat(n.olusturmaTarih)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Düzenle/Yeni Not Modal */}
      <Modal
        open={modalAcik}
        onClose={kapatModal}
        title={duzenleId ? 'Notu Düzenle' : 'Yeni Not'}
        width={680}
        footer={
          <>
            <Button variant="secondary" onClick={kapatModal} disabled={kaydediliyor}>Vazgeç</Button>
            <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
              {kaydediliyor ? 'Kaydediliyor…' : duzenleId ? 'Güncelle' : 'Kaydet'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Label>Başlık</Label>
            <Input
              value={form.baslik}
              onChange={(e) => setForm({ ...form, baslik: e.target.value })}
              placeholder="Notun kısa başlığı…"
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div>
              <Label>Kategori</Label>
              <CustomSelect value={form.kategori} onChange={(e) => setForm({ ...form, kategori: e.target.value })}>
                {KATEGORILER.map((k) => <option key={k.id} value={k.id}>{k.isim}</option>)}
              </CustomSelect>
            </div>
            <div>
              <Label>Müşteri (opsiyonel)</Label>
              <CustomSelect value={form.musteriId} onChange={(e) => setForm({ ...form, musteriId: e.target.value })}>
                <option value="">Müşteri seç…</option>
                {musteriler.map((m) => (
                  <option key={m.id} value={m.id}>{m.firma || `${m.ad ?? ''} ${m.soyad ?? ''}`.trim()}</option>
                ))}
              </CustomSelect>
            </div>
          </div>

          <div>
            <Label>İçerik</Label>
            <Textarea
              value={form.icerik}
              onChange={(e) => setForm({ ...form, icerik: e.target.value })}
              rows={10}
              placeholder="Notunu yaz…"
            />
          </div>

          {Array.isArray(form.cizimler) && form.cizimler.length > 0 && (
            <div>
              <Label>Çizimler ({form.cizimler.length})</Label>
              <p style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2, marginBottom: 8 }}>
                Çizimler mobil uygulamadan eklenir. Tıklayınca büyür.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {form.cizimler.map((c, i) => (
                  <CizimThumbnail key={i} cizim={c} onClick={() => cizimAc(c)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Büyütülmüş çizim viewer */}
      {acikCizim && (
        <div
          onClick={() => setAcikCizim(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <button
            onClick={() => setAcikCizim(null)}
            style={{
              position: 'absolute', top: 16, right: 16,
              width: 40, height: 40, borderRadius: 20,
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
          <img src={acikCizim} alt="Çizim" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', background: '#fff' }} />
        </div>
      )}
    </div>
  )
}

function chipStyle(aktif, renk) {
  return {
    display: 'inline-flex', alignItems: 'center',
    padding: '6px 12px',
    borderRadius: 'var(--radius-sm)',
    background: aktif
      ? (renk ?? 'var(--brand-primary)')
      : 'var(--surface-sunken)',
    color: aktif
      ? '#fff'
      : 'var(--text-secondary)',
    border: aktif
      ? `1px solid ${renk ?? 'var(--brand-primary)'}`
      : '1px solid var(--border-default)',
    font: '500 12px/16px var(--font-sans)',
    cursor: 'pointer',
    transition: 'all 120ms',
  }
}

function CizimThumbnail({ cizim, onClick }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    cizimSignedUrl(cizim.path).then(setUrl)
  }, [cizim.path])

  return (
    <button
      onClick={onClick}
      style={{
        width: 80, height: 80,
        background: 'var(--surface-sunken)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-sm)',
        padding: 0, cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      {url ? (
        <img src={url} alt="Çizim" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <ImageIcon size={20} style={{ color: 'var(--text-tertiary)' }} />
      )}
    </button>
  )
}

export default Notlarim
