// Kişisel Dokümanlar — kullanıcı kendi dosya/link'lerini yönetir.
// Görünürlük: sadece_ben / herkes / secili kişiler.

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  Upload, Link2, FileText, FileSpreadsheet, FileImage, File,
  Search, Eye, Download, Trash2, Edit2, Lock, Users, User as UserIcon,
  Plus, X, RefreshCw, ClipboardList, Target, Library, Tag,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import {
  kategorileriGetir, kategoriEkle, kategoriSil,
  dokumanlariGetir, dokumanEkle, dokumanGuncelle, dokumanSil,
  dokumanIndirmeUrl, dokumanDosyayiIndir,
  MAX_BOYUT_MB, MAX_BOYUT,
} from '../services/kisiDokumanService'
import {
  Button, Input, Textarea, Label, Card, Badge, EmptyState, SearchInput,
} from '../components/ui'
import CustomSelect from '../components/CustomSelect'

const IKON_MAP = { RefreshCw, ClipboardList, Target, FileText, File, Library, Tag }
const dosyaIkonu = (tip) => {
  if (!tip) return { Icon: File, renk: 'var(--text-tertiary)' }
  if (tip === 'link' || tip === 'application/octet-stream') return { Icon: Link2, renk: 'var(--brand-primary)' }
  if (tip === 'application/pdf') return { Icon: FileText, renk: 'var(--danger)' }
  if (tip.includes('word')) return { Icon: FileText, renk: 'var(--info)' }
  if (tip.includes('excel') || tip.includes('spreadsheet')) return { Icon: FileSpreadsheet, renk: 'var(--success)' }
  if (tip.includes('powerpoint') || tip.includes('presentation')) return { Icon: Target, renk: 'var(--warning)' }
  if (tip.startsWith('image/')) return { Icon: FileImage, renk: 'var(--brand-primary)' }
  return { Icon: File, renk: 'var(--text-tertiary)' }
}
const boyutFormat = (b) => {
  if (!b) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}
const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'

const SEKMELER = [
  { id: 'bana_ait',  label: 'Benim Dokümanlarım',   ikon: UserIcon },
  { id: 'paylasilan', label: 'Bana Paylaşılanlar',   ikon: Users },
  { id: 'herkese',    label: 'Herkese Açık',         ikon: Library },
]

export default function KisiselDokumanlar() {
  const { kullanici } = useAuth()
  const { toast } = useToast()
  const [sekme, setSekme] = useState('bana_ait')
  const [dokumanlar, setDokumanlar] = useState([])
  const [kategoriler, setKategoriler] = useState([])
  const [kullanicilar, setKullanicilar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [ekleModal, setEkleModal] = useState(false)
  const [duzenle, setDuzenle] = useState(null)
  const [kategoriModal, setKategoriModal] = useState(false)
  const [arama, setArama] = useState('')
  const [kategoriFiltre, setKategoriFiltre] = useState('')

  const kimId = kullanici?.id

  const yukle = async () => {
    setYukleniyor(true)
    try {
      const [d, k] = await Promise.all([
        dokumanlariGetir(),
        kategorileriGetir(),
      ])
      setDokumanlar(d)
      setKategoriler(k)
    } finally { setYukleniyor(false) }
  }

  useEffect(() => {
    yukle()
    supabase.from('kullanicilar')
      .select('id, ad, foto_url, rol').order('ad')
      .then(({ data }) => setKullanicilar((data || []).filter(k => k.id !== kimId)))
  }, [kimId])

  // Sekmeye göre filtrele
  const sekmeliListe = useMemo(() => {
    return dokumanlar.filter(d => {
      if (sekme === 'bana_ait') return String(d.kullaniciId) === String(kimId)
      if (sekme === 'herkese') return d.gorunurluk === 'herkes'
      if (sekme === 'paylasilan') {
        return String(d.kullaniciId) !== String(kimId)
          && (d.gorunurluk === 'herkes'
              || (d.gorunurluk === 'secili' && (d.gorunenKullaniciIdler || []).some(x => String(x) === String(kimId))))
      }
      return true
    })
  }, [dokumanlar, sekme, kimId])

  const aramaliListe = useMemo(() => {
    let liste = sekmeliListe
    if (kategoriFiltre) liste = liste.filter(d => String(d.kategoriId) === kategoriFiltre)
    if (arama.trim()) {
      const q = arama.toLocaleLowerCase('tr')
      liste = liste.filter(d =>
        String(d.baslik || '').toLocaleLowerCase('tr').includes(q)
        || String(d.aciklama || '').toLocaleLowerCase('tr').includes(q)
      )
    }
    return liste
  }, [sekmeliListe, arama, kategoriFiltre])

  const kategoriIsim = (id) => kategoriler.find(k => k.id === id)?.isim || 'Kategorisiz'

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 className="t-h1" style={{ margin: 0 }}>Dokümanlarım</h1>
          <p className="t-caption" style={{ color: 'var(--text-tertiary)', marginTop: 4 }}>
            Kişisel dosya ve linklerin. Görünürlüğü sen belirlersin.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" iconLeft={<Tag size={14} />} onClick={() => setKategoriModal(true)}>
            Kategoriler
          </Button>
          <Button variant="primary" iconLeft={<Plus size={14} />} onClick={() => { setDuzenle(null); setEkleModal(true) }}>
            Yeni Doküman
          </Button>
        </div>
      </div>

      {/* Sekmeler */}
      <div style={{
        display: 'inline-flex', background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
        borderRadius: 10, padding: 3, marginBottom: 14,
      }}>
        {SEKMELER.map(s => {
          const aktif = sekme === s.id
          const Icon = s.ikon
          return (
            <button key={s.id} onClick={() => setSekme(s.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 7,
                background: aktif ? 'var(--brand-primary)' : 'transparent',
                color: aktif ? '#fff' : 'var(--text-secondary)',
                border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}>
              <Icon size={14} /> {s.label}
            </button>
          )
        })}
      </div>

      {/* Arama + kategori filtresi */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <SearchInput placeholder="Başlık veya açıklama…" value={arama} onChange={e => setArama(e.target.value)} />
        </div>
        <CustomSelect value={kategoriFiltre} onChange={e => setKategoriFiltre(e.target.value)} style={{ minWidth: 200 }}>
          <option value="">Tüm kategoriler</option>
          {kategoriler.map(k => (
            <option key={k.id} value={k.id}>
              {k.kullaniciId ? '📁' : '🏢'} {k.isim}
            </option>
          ))}
        </CustomSelect>
      </div>

      {/* Liste */}
      {yukleniyor ? (
        <Card><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</div></Card>
      ) : aramaliListe.length === 0 ? (
        <EmptyState
          icon={<File size={40} strokeWidth={1.5} />}
          title="Doküman yok"
          description={sekme === 'bana_ait' ? 'İlk dokümanını ekle.' : 'Bu sekmede kayıt yok.'}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {aramaliListe.map(d => (
            <DokumanKarti key={d.id}
              dokuman={d}
              kategoriIsim={kategoriIsim}
              kullanicilar={kullanicilar}
              kimId={kimId}
              onSil={async () => {
                if (!confirm(`"${d.baslik}" silinsin mi?`)) return
                try { await dokumanSil(d.id); toast.success('Silindi.'); yukle() }
                catch (e) { toast.error(e?.message || 'Silme hatası') }
              }}
              onDuzenle={() => { setDuzenle(d); setEkleModal(true) }}
              onAc={async () => {
                if (d.tip === 'link') { window.open(d.linkUrl, '_blank'); return }
                try {
                  const url = await dokumanIndirmeUrl(d.dosyaYolu)
                  window.open(url, '_blank')
                } catch (e) { toast.error(e?.message || 'Açma hatası') }
              }}
              onIndir={async () => {
                if (d.tip === 'link') { window.open(d.linkUrl, '_blank'); return }
                try { await dokumanDosyayiIndir(d.dosyaYolu, d.dosyaAd) }
                catch (e) { toast.error(e?.message || 'İndirme hatası') }
              }}
            />
          ))}
        </div>
      )}

      {ekleModal && (
        <DokumanEkleModal
          duzenle={duzenle}
          kategoriler={kategoriler}
          kullanicilar={kullanicilar}
          onKapat={() => { setEkleModal(false); setDuzenle(null) }}
          onKaydet={async () => { setEkleModal(false); setDuzenle(null); await yukle() }}
        />
      )}

      {kategoriModal && (
        <KategoriYonetimModal
          kategoriler={kategoriler}
          kullanici={kullanici}
          onKapat={() => setKategoriModal(false)}
          onDegisiklik={async () => { const k = await kategorileriGetir(); setKategoriler(k) }}
        />
      )}
    </div>
  )
}

function DokumanKarti({ dokuman: d, kategoriIsim, kullanicilar, kimId, onSil, onDuzenle, onAc, onIndir }) {
  const { Icon, renk } = dosyaIkonu(d.tip === 'link' ? 'link' : d.dosyaTip)
  const sahibiBenim = String(d.kullaniciId) === String(kimId)
  const sahibi = kullanicilar.find(u => String(u.id) === String(d.kullaniciId))
  const sahibiAd = sahibiBenim ? 'Sen' : (sahibi?.ad || '—')

  const gorunurlukBadge = d.gorunurluk === 'sadece_ben'
    ? { tone: 'neutral', text: 'Özel', Ic: Lock }
    : d.gorunurluk === 'herkes'
      ? { tone: 'brand', text: 'Herkes', Ic: Users }
      : { tone: 'aktif', text: `${(d.gorunenKullaniciIdler || []).length} kişi`, Ic: UserIcon }
  const GB = gorunurlukBadge.Ic

  return (
    <Card style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 8, background: 'var(--surface-sunken)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={22} color={renk} strokeWidth={1.5} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t-body-strong" style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.baslik}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {kategoriIsim(d.kategoriId)} · {d.tip === 'link' ? 'Link' : boyutFormat(d.dosyaBoyut)}
          </div>
        </div>
      </div>

      {d.aciklama && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {d.aciklama}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 4 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Badge tone={gorunurlukBadge.tone} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <GB size={10} /> {gorunurlukBadge.text}
          </Badge>
          {!sahibiBenim && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>· {sahibiAd}</span>
          )}
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{fmtTarih(d.guncellemeTarih)}</span>
      </div>

      <div style={{ display: 'flex', gap: 6, borderTop: '1px solid var(--border-default)', paddingTop: 8 }}>
        <Button size="sm" variant="secondary" iconLeft={<Eye size={12} />} onClick={onAc}>Aç</Button>
        <Button size="sm" variant="secondary" iconLeft={<Download size={12} />} onClick={onIndir}>İndir</Button>
        {sahibiBenim && (
          <>
            <Button size="sm" variant="secondary" iconLeft={<Edit2 size={12} />} onClick={onDuzenle}>Düzenle</Button>
            <Button size="sm" variant="secondary" iconLeft={<Trash2 size={12} />} onClick={onSil} style={{ color: 'var(--danger)' }}>Sil</Button>
          </>
        )}
      </div>
    </Card>
  )
}

function DokumanEkleModal({ duzenle, kategoriler, kullanicilar, onKapat, onKaydet }) {
  const { toast } = useToast()
  const editing = !!duzenle
  const [tip, setTip] = useState(duzenle?.tip || 'dosya')
  const [baslik, setBaslik] = useState(duzenle?.baslik || '')
  const [aciklama, setAciklama] = useState(duzenle?.aciklama || '')
  const [kategoriId, setKategoriId] = useState(duzenle?.kategoriId || '')
  const [linkUrl, setLinkUrl] = useState(duzenle?.linkUrl || '')
  const [dosya, setDosya] = useState(null)
  const [gorunurluk, setGorunurluk] = useState(duzenle?.gorunurluk || 'sadece_ben')
  const [gorunenler, setGorunenler] = useState(duzenle?.gorunenKullaniciIdler || [])
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const kaydet = async () => {
    if (!baslik.trim()) { toast.error('Başlık zorunlu.'); return }
    if (!editing) {
      if (tip === 'link' && !linkUrl.trim()) { toast.error('URL zorunlu.'); return }
      if (tip === 'dosya' && !dosya) { toast.error('Dosya seç.'); return }
      if (tip === 'dosya' && dosya.size > MAX_BOYUT) { toast.error(`Dosya max ${MAX_BOYUT_MB} MB.`); return }
    }
    if (gorunurluk === 'secili' && gorunenler.length === 0) { toast.error('En az bir kişi seç.'); return }

    setKaydediliyor(true)
    try {
      if (editing) {
        await dokumanGuncelle(duzenle.id, {
          baslik, aciklama, kategoriId: kategoriId ? Number(kategoriId) : null,
          gorunurluk, gorunenKullaniciIdler: gorunenler.map(Number),
          linkUrl: tip === 'link' ? linkUrl : undefined,
        })
        toast.success('Güncellendi.')
      } else {
        await dokumanEkle({
          baslik, aciklama, kategoriId: kategoriId ? Number(kategoriId) : null, tip,
          linkUrl: tip === 'link' ? linkUrl : undefined,
          dosya: tip === 'dosya' ? dosya : undefined,
          gorunurluk, gorunenKullaniciIdler: gorunenler.map(Number),
        })
        toast.success('Eklendi.')
      }
      onKaydet()
    } catch (e) {
      toast.error(e?.message || 'Kayıt hatası')
    } finally { setKaydediliyor(false) }
  }

  return createPortal(
    <div onClick={onKapat} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface-card)', borderRadius: 14, padding: 22,
        maxWidth: 620, width: '100%', maxHeight: '90vh', overflow: 'auto',
        border: '1px solid var(--border-default)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>{editing ? 'Dokümanı Düzenle' : 'Yeni Doküman'}</h3>
          <button onClick={onKapat} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
            <X size={20} />
          </button>
        </div>

        {!editing && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {[{ id: 'dosya', label: '📎 Dosya' }, { id: 'link', label: '🔗 Link' }].map(t => (
              <button key={t.id} onClick={() => setTip(t.id)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10,
                  background: tip === t.id ? 'var(--brand-primary)' : 'var(--surface-sunken)',
                  color: tip === t.id ? '#fff' : 'var(--text-primary)',
                  border: `1px solid ${tip === t.id ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                  cursor: 'pointer', fontWeight: 600, fontSize: 14,
                }}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        <Label required>Başlık</Label>
        <Input value={baslik} onChange={e => setBaslik(e.target.value)} placeholder="Örn: 2026 Ürün Kataloğu" />

        <Label style={{ marginTop: 10 }}>Açıklama (opsiyonel)</Label>
        <Textarea rows={2} value={aciklama} onChange={e => setAciklama(e.target.value)} placeholder="Kısa not…" />

        <Label style={{ marginTop: 10 }}>Kategori</Label>
        <CustomSelect value={kategoriId} onChange={e => setKategoriId(e.target.value)}>
          <option value="">Kategorisiz</option>
          {kategoriler.map(k => (
            <option key={k.id} value={k.id}>
              {k.kullaniciId ? '📁' : '🏢'} {k.isim}
            </option>
          ))}
        </CustomSelect>

        {!editing && tip === 'link' && (
          <>
            <Label required style={{ marginTop: 10 }}>URL</Label>
            <Input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…" />
          </>
        )}
        {editing && duzenle.tip === 'link' && (
          <>
            <Label required style={{ marginTop: 10 }}>URL</Label>
            <Input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…" />
          </>
        )}

        {!editing && tip === 'dosya' && (
          <>
            <Label required style={{ marginTop: 10 }}>Dosya (max {MAX_BOYUT_MB} MB)</Label>
            <input type="file" onChange={e => setDosya(e.target.files?.[0] || null)}
              style={{ padding: 8, background: 'var(--surface-sunken)', borderRadius: 8, border: '1px solid var(--border-default)', width: '100%', color: 'var(--text-primary)' }} />
            {dosya && (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                {dosya.name} · {boyutFormat(dosya.size)}
                {dosya.size > MAX_BOYUT && <span style={{ color: 'var(--danger)', marginLeft: 8 }}>⚠️ Çok büyük</span>}
              </div>
            )}
          </>
        )}

        <Label style={{ marginTop: 14 }}>Görünürlük</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {[
            { id: 'sadece_ben', label: '🔒 Özel',     alt: 'Sadece ben' },
            { id: 'herkes',     label: '👥 Herkes',    alt: 'Tüm personel' },
            { id: 'secili',     label: '🎯 Seçili',    alt: 'Belirli kişiler' },
          ].map(o => (
            <button key={o.id} onClick={() => setGorunurluk(o.id)}
              style={{
                padding: 10, borderRadius: 8,
                background: gorunurluk === o.id ? 'var(--brand-primary)' : 'var(--surface-sunken)',
                color: gorunurluk === o.id ? '#fff' : 'var(--text-primary)',
                border: `1px solid ${gorunurluk === o.id ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                cursor: 'pointer', fontSize: 13, fontWeight: 600, textAlign: 'center',
              }}>
              <div>{o.label}</div>
              <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2, fontWeight: 400 }}>{o.alt}</div>
            </button>
          ))}
        </div>

        {gorunurluk === 'secili' && (
          <div style={{ marginTop: 10 }}>
            <Label>Görebilecek kişiler</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 8, background: 'var(--surface-sunken)', borderRadius: 8, border: '1px solid var(--border-default)', marginBottom: 6 }}>
              {gorunenler.map(uid => {
                const u = kullanicilar.find(x => String(x.id) === String(uid))
                if (!u) return null
                return (
                  <span key={uid} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, background: 'var(--brand-primary)', color: '#fff', fontSize: 11, fontWeight: 600 }}>
                    {u.ad}
                    <button type="button" onClick={() => setGorunenler(prev => prev.filter(x => String(x) !== String(uid)))}
                      style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
                  </span>
                )
              })}
              {gorunenler.length === 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Aşağıdan kişi seç…</span>
              )}
            </div>
            <CustomSelect value=""
              onChange={e => {
                const uid = e.target.value
                if (!uid) return
                if (gorunenler.some(x => String(x) === uid)) return
                setGorunenler([...gorunenler, Number(uid)])
              }}>
              <option value="">+ Kişi ekle…</option>
              {kullanicilar.filter(k => !gorunenler.some(x => String(x) === String(k.id))).map(k => (
                <option key={k.id} value={k.id}>{k.ad}</option>
              ))}
            </CustomSelect>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <Button variant="secondary" onClick={onKapat}>İptal</Button>
          <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Kaydediliyor…' : (editing ? 'Güncelle' : 'Ekle')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function KategoriYonetimModal({ kategoriler, kullanici, onKapat, onDegisiklik }) {
  const { toast } = useToast()
  const [yeniIsim, setYeniIsim] = useState('')
  const [publicMi, setPublicMi] = useState(false)
  const isAdmin = kullanici?.rol === 'admin'
  const benimKategori = kategoriler.filter(k => String(k.kullaniciId) === String(kullanici?.id))
  const publicKategori = kategoriler.filter(k => !k.kullaniciId)

  const ekle = async () => {
    if (!yeniIsim.trim()) return
    try {
      await kategoriEkle({ isim: yeniIsim, publicMi })
      toast.success('Kategori eklendi.')
      setYeniIsim('')
      await onDegisiklik()
    } catch (e) { toast.error(e?.message || 'Ekleme hatası') }
  }
  const sil = async (id, isim) => {
    if (!confirm(`"${isim}" silinsin mi? Bu kategoriye bağlı dokümanlar "Kategorisiz" olur.`)) return
    try { await kategoriSil(id); toast.success('Silindi.'); await onDegisiklik() }
    catch (e) { toast.error(e?.message || 'Silme hatası') }
  }

  return createPortal(
    <div onClick={onKapat} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface-card)', borderRadius: 14, padding: 22,
        maxWidth: 480, width: '100%', maxHeight: '85vh', overflow: 'auto',
        border: '1px solid var(--border-default)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Kategoriler</h3>
          <button onClick={onKapat} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <Input placeholder="Yeni kategori adı" value={yeniIsim} onChange={e => setYeniIsim(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') ekle() }} style={{ flex: 1 }} />
          <Button variant="primary" size="sm" onClick={ekle} disabled={!yeniIsim.trim()}>Ekle</Button>
        </div>
        {isAdmin && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={publicMi} onChange={e => setPublicMi(e.target.checked)} />
            🏢 Herkese açık (public) kategori olarak ekle (sadece admin)
          </label>
        )}

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>Kendi Kategorilerim</div>
        {benimKategori.length === 0 ? (
          <div style={{ padding: 10, fontSize: 12, color: 'var(--text-tertiary)' }}>Henüz eklemedin.</div>
        ) : benimKategori.map(k => (
          <div key={k.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--surface-sunken)', borderRadius: 6, marginBottom: 4 }}>
            <span>📁 {k.isim}</span>
            <button onClick={() => sil(k.id, k.isim)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }}>Sistem Kategorileri (Public)</div>
        {publicKategori.map(k => (
          <div key={k.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--surface-sunken)', borderRadius: 6, marginBottom: 4 }}>
            <span>🏢 {k.isim}</span>
            {isAdmin && (
              <button onClick={() => sil(k.id, k.isim)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  )
}
