// "Notlarım" — kişisel notlar (opsiyonel müşteri bağlantılı).
// Web tarafında sadece metin oluşturma/düzenleme. Mobile'dan eklenen çizimleri görüntüler.

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Pencil, Trash2, Search, StickyNote, Image as ImageIcon, X, Building2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  Card, Button, Input, Textarea, Label, Badge, SearchInput, EmptyState,
} from '../components/ui'
import CustomSelect from '../components/CustomSelect'
import {
  KATEGORILER, notlarimiGetir, notEkle, notGuncelle, notSil, cizimSignedUrl,
} from '../services/notService'
import { musterileriGetir } from '../services/musteriService'
import { trContains } from '../lib/trSearch'

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

  const [goster, setGoster] = useState(false)
  const [form, setForm] = useState(BOS_FORM)
  const [duzenleId, setDuzenleId] = useState(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const [acikCizim, setAcikCizim] = useState(null)  // büyütülmüş çizim URL'i

  const yukle = useCallback(async () => {
    if (!kullanici?.id) { setYukleniyor(false); return }
    setYukleniyor(true)
    try {
      const [n, m] = await Promise.all([
        notlarimiGetir(kullanici.id),
        musterileriGetir(),
      ])
      setNotlar(n)
      setMusteriler(m || [])
    } finally {
      setYukleniyor(false)
    }
  }, [kullanici?.id])

  useEffect(() => { yukle() }, [yukle])

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
    setGoster(true)
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
    setGoster(true)
  }

  const iptal = () => {
    setForm(BOS_FORM)
    setDuzenleId(null)
    setGoster(false)
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
      iptal()
      yukle()
    } catch (e) {
      toast.error('Kaydedilemedi: ' + (e?.message ?? 'bilinmeyen'))
    } finally {
      setKaydediliyor(false)
    }
  }

  const sil = async (n) => {
    if (!window.confirm(`"${n.baslik || 'Başlıksız'}" notu silinsin mi? Çizimler de silinecek, geri alınamaz.`)) return
    try {
      await notSil(n.id, kullanici.id)
      toast.success('Not silindi')
      yukle()
    } catch (e) {
      toast.error('Silinemedi: ' + (e?.message ?? 'bilinmeyen'))
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
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
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

      {/* Filter + arama */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={() => setFiltreKategori('hepsi')}
          style={{
            padding: '6px 14px',
            borderRadius: 'var(--radius-sm)',
            background: filtreKategori === 'hepsi' ? 'var(--brand-primary)' : 'var(--surface-card)',
            color: filtreKategori === 'hepsi' ? '#fff' : 'var(--text-secondary)',
            border: `1px solid ${filtreKategori === 'hepsi' ? 'var(--brand-primary)' : 'var(--border-default)'}`,
            font: '500 13px/18px var(--font-sans)',
            cursor: 'pointer',
          }}
        >
          Hepsi
        </button>
        {KATEGORILER.map((k) => (
          <button
            key={k.id}
            onClick={() => setFiltreKategori(k.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px',
              borderRadius: 'var(--radius-sm)',
              background: filtreKategori === k.id ? `${k.renk}20` : 'var(--surface-card)',
              color: filtreKategori === k.id ? k.renk : 'var(--text-secondary)',
              border: `1px solid ${filtreKategori === k.id ? k.renk : 'var(--border-default)'}`,
              font: '500 13px/18px var(--font-sans)',
              cursor: 'pointer',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 4, background: k.renk }} />
            {k.isim}
          </button>
        ))}
        <div style={{ flex: 1, minWidth: 200, marginLeft: 'auto' }}>
          <SearchInput value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Notlarda ara…" />
        </div>
      </div>

      {/* Form (yeni/düzenle) */}
      {goster && (
        <Card padding={16} style={{ marginBottom: 16 }}>
          <h3 style={{ font: '700 14px/20px var(--font-sans)', color: 'var(--text-primary)', margin: 0, marginBottom: 12 }}>
            {duzenleId ? 'Notu Düzenle' : 'Yeni Not'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={{ gridColumn: 'span 3' }}>
              <Label>Başlık</Label>
              <Input value={form.baslik} onChange={(e) => setForm({ ...form, baslik: e.target.value })} placeholder="Kısa başlık…" />
            </div>
            <div>
              <Label>Kategori</Label>
              <CustomSelect value={form.kategori} onChange={(e) => setForm({ ...form, kategori: e.target.value })}>
                {KATEGORILER.map((k) => <option key={k.id} value={k.id}>{k.isim}</option>)}
              </CustomSelect>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <Label>Müşteri (opsiyonel)</Label>
              <CustomSelect value={form.musteriId} onChange={(e) => setForm({ ...form, musteriId: e.target.value })}>
                <option value="">Müşteri seç…</option>
                {musteriler.map((m) => (
                  <option key={m.id} value={m.id}>{m.firma || `${m.ad ?? ''} ${m.soyad ?? ''}`.trim()}</option>
                ))}
              </CustomSelect>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Label>İçerik</Label>
            <Textarea value={form.icerik} onChange={(e) => setForm({ ...form, icerik: e.target.value })} rows={8} placeholder="Notunu yaz…" />
          </div>

          {/* Mevcut çizimler (mobile'dan eklenmiş) */}
          {Array.isArray(form.cizimler) && form.cizimler.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <Label>Çizimler</Label>
              <p style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2, marginBottom: 6 }}>
                Çizimler mobil uygulamadan eklenir, web'den eklenemez. Tıklayınca büyür.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {form.cizimler.map((c, i) => (
                  <CizimThumbnail key={i} cizim={c} onClick={() => cizimAc(c)} />
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={iptal} disabled={kaydediliyor}>Vazgeç</Button>
            <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
              {kaydediliyor ? 'Kaydediliyor…' : duzenleId ? 'Güncelle' : 'Kaydet'}
            </Button>
          </div>
        </Card>
      )}

      {/* Liste */}
      {yukleniyor ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
      ) : filtrelenmis.length === 0 ? (
        <EmptyState
          icon={<StickyNote size={36} />}
          title="Not yok"
          subtitle={arama ? 'Aramayla eşleşen not yok' : 'İlk notunu eklemek için yukarıdaki butona bas'}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {filtrelenmis.map((n) => {
            const kategori = KATEGORILER.find((k) => k.id === n.kategori) || KATEGORILER[3]
            const cizimSayisi = Array.isArray(n.cizimler) ? n.cizimler.length : 0
            return (
              <Card
                key={n.id}
                padding={14}
                style={{
                  borderLeft: `3px solid ${kategori.renk}`,
                  display: 'flex', flexDirection: 'column', gap: 8,
                  cursor: 'pointer',
                }}
                onClick={() => duzenleAc(n)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                      <Badge tone="lead" style={{ background: `${kategori.renk}20`, color: kategori.renk, borderColor: kategori.renk }}>
                        {kategori.isim}
                      </Badge>
                      {cizimSayisi > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, font: '500 11px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                          <ImageIcon size={11} /> {cizimSayisi}
                        </span>
                      )}
                    </div>
                    <div style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
                      {n.baslik || '(başlıksız)'}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); sil(n) }}
                    style={{
                      width: 26, height: 26,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: 'transparent', border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                    }}
                    title="Sil"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {n.icerik && (
                  <p style={{
                    font: '400 12px/16px var(--font-sans)',
                    color: 'var(--text-tertiary)',
                    margin: 0,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {n.icerik}
                  </p>
                )}

                {n.musteriFirma && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '500 11px/14px var(--font-sans)', color: 'var(--brand-primary)' }}>
                    <Building2 size={11} /> {n.musteriFirma}
                  </div>
                )}

                <div style={{ font: '400 10px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 'auto' }}>
                  {tarihFormat(n.olusturmaTarih)}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Büyütülmüş çizim modal */}
      {acikCizim && (
        <div
          onClick={() => setAcikCizim(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
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
              background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
          <img src={acikCizim} alt="Çizim" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain' }} />
        </div>
      )}
    </div>
  )
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
