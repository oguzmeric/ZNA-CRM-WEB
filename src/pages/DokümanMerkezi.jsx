import { useState, useRef, useCallback } from 'react'
import {
  Upload, Link2, FileText, FileSpreadsheet, FileImage, File,
  LayoutGrid, List, Search, Eye, Download, Trash2, AlertTriangle, Library,
  RefreshCw, ClipboardList, Target, X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import CustomSelect from '../components/CustomSelect'
import {
  Button, SearchInput, Input, Textarea, Label,
  Card, Badge, EmptyState, Alert, Modal,
} from '../components/ui'

const KATEGORILER = [
  { id: 'yazilim_guncelleme', isim: 'Yazılım Güncellemeleri', C: RefreshCw,    tone: 'brand' },
  { id: 'teknik_sartname',    isim: 'Teknik Şartnameler',     C: ClipboardList, tone: 'lead' },
  { id: 'sunum',              isim: 'Şirket Sunumları',       C: Target,       tone: 'brand' },
  { id: 'sozlesme',           isim: 'Sözleşmeler',            C: FileText,     tone: 'aktif' },
  { id: 'diger',              isim: 'Diğer',                  C: File,         tone: 'neutral' },
]

const IZIN_VERILEN_TURLER = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'text/plain',
]

const MAX_BOYUT_MB = 2

function dosyaIkonu(tur) {
  if (!tur) return { Icon: File, renk: 'var(--text-tertiary)' }
  if (tur === 'link')            return { Icon: Link2,           renk: 'var(--brand-primary)' }
  if (tur === 'application/pdf') return { Icon: FileText,        renk: 'var(--danger)' }
  if (tur.includes('word'))      return { Icon: FileText,        renk: 'var(--info)' }
  if (tur.includes('excel') || tur.includes('spreadsheet')) return { Icon: FileSpreadsheet, renk: 'var(--success)' }
  if (tur.includes('powerpoint') || tur.includes('presentation')) return { Icon: Target, renk: 'var(--warning)' }
  if (tur.startsWith('image/'))  return { Icon: FileImage,       renk: 'var(--brand-primary)' }
  return { Icon: File, renk: 'var(--text-tertiary)' }
}

const boyutFormat = (b) => {
  if (!b) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

const metaYukle = () => {
  try { return JSON.parse(localStorage.getItem('dokuman_meta') || '[]') } catch { return [] }
}
const metaKaydet = (m) => localStorage.setItem('dokuman_meta', JSON.stringify(m))
const dosyaIcerikKaydet = (id, base64) => { try { localStorage.setItem(`dokuman_icerik_${id}`, base64); return true } catch { return false } }
const dosyaIcerikYukle  = (id) => localStorage.getItem(`dokuman_icerik_${id}`) || null
const dosyaIcerikSil    = (id) => localStorage.removeItem(`dokuman_icerik_${id}`)

export default function DokümanMerkezi() {
  const { kullanici } = useAuth()
  const [meta, setMeta] = useState(metaYukle)
  const [aktifKategori, setAktifKategori] = useState('hepsi')
  const [aramaMetni, setAramaMetni] = useState('')
  const [sirala, setSirala] = useState('tarih_yeni')
  const [gorunumModu, setGorunumModu] = useState('grid')
  const [yuklePanelAcik, setYuklePanelAcik] = useState(false)
  const [onizlemeDok, setOnizlemeDok] = useState(null)
  const [silOnayId, setSilOnayId] = useState(null)
  const [surukle, setSurukle] = useState(false)
  const [hata, setHata] = useState('')
  const dosyaInputRef = useRef()

  const [form, setForm] = useState({
    ad: '', kategori: 'teknik_sartname', aciklama: '', surum: '', etiketler: '', disLink: '',
  })
  const [yukleModu, setYukleModu] = useState('dosya')
  const [secilenDosya, setSecilenDosya] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(false)

  const disLinkAc = (dok) => window.open(dok.disLink, '_blank', 'noopener,noreferrer')

  const dosyaisle = (dosya) => {
    setHata('')
    if (!dosya) return
    if (!IZIN_VERILEN_TURLER.includes(dosya.type)) { setHata('Bu dosya türü desteklenmiyor.'); return }
    if (dosya.size > MAX_BOYUT_MB * 1024 * 1024) { setHata(`Dosya boyutu ${MAX_BOYUT_MB} MB'ı geçemez.`); return }
    setSecilenDosya(dosya)
    if (!form.ad) setForm(f => ({ ...f, ad: dosya.name.replace(/\.[^/.]+$/, '') }))
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setSurukle(false)
    const d = e.dataTransfer.files[0]
    if (d) { dosyaisle(d); setYuklePanelAcik(true) }
  }, [form.ad])
  const handleDragOver = (e) => { e.preventDefault(); setSurukle(true) }
  const handleDragLeave = () => setSurukle(false)

  const kaydet = async () => {
    if (!form.ad.trim()) { setHata('Dosya adı zorunludur.'); return }
    if (!form.kategori) { setHata('Kategori seçiniz.'); return }

    if (yukleModu === 'link') {
      if (!form.disLink.trim()) { setHata('Lütfen bir link girin.'); return }
      const yeniId = crypto.randomUUID()
      const yeniMeta = {
        id: yeniId, ad: form.ad.trim(), orijinalAd: form.ad.trim(),
        kategori: form.kategori, aciklama: form.aciklama.trim(),
        surum: form.surum.trim(),
        etiketler: form.etiketler.split(',').map(e => e.trim()).filter(Boolean),
        tur: 'link', boyut: null, disLink: form.disLink.trim(),
        yukleyenId: kullanici.id, yukleyenAd: kullanici.ad,
        yuklemeTarihi: new Date().toISOString(),
      }
      const liste = [yeniMeta, ...meta]
      metaKaydet(liste); setMeta(liste)
      setForm({ ad: '', kategori: 'teknik_sartname', aciklama: '', surum: '', etiketler: '', disLink: '' })
      setYuklePanelAcik(false)
      return
    }

    if (!secilenDosya) { setHata('Lütfen bir dosya seçin.'); return }
    setYukleniyor(true); setHata('')

    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = e.target.result
      const yeniId = crypto.randomUUID()
      const yeniMeta = {
        id: yeniId, ad: form.ad.trim(), orijinalAd: secilenDosya.name,
        kategori: form.kategori, aciklama: form.aciklama.trim(),
        surum: form.surum.trim(),
        etiketler: form.etiketler.split(',').map(e => e.trim()).filter(Boolean),
        tur: secilenDosya.type, boyut: secilenDosya.size, disLink: null,
        yukleyenId: kullanici.id, yukleyenAd: kullanici.ad,
        yuklemeTarihi: new Date().toISOString(),
      }
      if (!dosyaIcerikKaydet(yeniId, base64)) {
        setHata('Depolama alanı yetersiz. Daha büyük dosyalar yüklenemiyor.')
        setYukleniyor(false); return
      }
      const liste = [yeniMeta, ...meta]
      metaKaydet(liste); setMeta(liste)
      setSecilenDosya(null)
      setForm({ ad: '', kategori: 'teknik_sartname', aciklama: '', surum: '', etiketler: '', disLink: '' })
      setYuklePanelAcik(false); setYukleniyor(false)
    }
    reader.readAsDataURL(secilenDosya)
  }

  const indir = (dok) => {
    const i = dosyaIcerikYukle(dok.id)
    if (!i) return
    const a = document.createElement('a')
    a.href = i; a.download = dok.orijinalAd || dok.ad; a.click()
  }

  const onizle = (dok) => {
    const i = dosyaIcerikYukle(dok.id)
    if (!i) return
    setOnizlemeDok({ ...dok, icerik: i })
  }

  const sil = (id) => {
    dosyaIcerikSil(id)
    const liste = meta.filter(d => d.id !== id)
    metaKaydet(liste); setMeta(liste); setSilOnayId(null)
  }

  const filtreli = meta
    .filter(d => aktifKategori === 'hepsi' || d.kategori === aktifKategori)
    .filter(d => {
      if (!aramaMetni) return true
      const q = aramaMetni.toLowerCase()
      return d.ad.toLowerCase().includes(q)
        || d.aciklama?.toLowerCase().includes(q)
        || d.surum?.toLowerCase().includes(q)
        || d.etiketler?.some(e => e.toLowerCase().includes(q))
    })
    .sort((a, b) => {
      if (sirala === 'tarih_yeni') return new Date(b.yuklemeTarihi) - new Date(a.yuklemeTarihi)
      if (sirala === 'tarih_eski') return new Date(a.yuklemeTarihi) - new Date(b.yuklemeTarihi)
      if (sirala === 'ad_az') return a.ad.localeCompare(b.ad, 'tr')
      if (sirala === 'boyut') return (b.boyut || 0) - (a.boyut || 0)
      return 0
    })

  const kategoriSayisi = (kid) => kid === 'hepsi' ? meta.length : meta.filter(d => d.kategori === kid).length

  return (
    <div
      style={{ padding: 24, maxWidth: 1440, margin: '0 auto', minHeight: '100vh' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Sürükle overlay */}
      {surukle && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 'var(--z-modal)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--brand-primary-soft)',
          backdropFilter: 'blur(4px)',
          border: '3px dashed var(--brand-primary)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <Upload size={48} strokeWidth={1.5} style={{ color: 'var(--brand-primary)', marginBottom: 8 }} />
            <p style={{ font: '600 20px/28px var(--font-sans)', color: 'var(--brand-primary)' }}>Dosyayı bırakın</p>
          </div>
        </div>
      )}

      {/* Önizleme */}
      {onizlemeDok && (
        <Modal
          open={!!onizlemeDok}
          onClose={() => setOnizlemeDok(null)}
          width={960}
          title={
            <div>
              <div style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{onizlemeDok.ad}</div>
              <div className="t-caption" style={{ marginTop: 2 }}>{onizlemeDok.orijinalAd} · {boyutFormat(onizlemeDok.boyut)}</div>
            </div>
          }
          footer={
            <>
              <Button variant="secondary" onClick={() => setOnizlemeDok(null)}>Kapat</Button>
              <Button variant="primary" iconLeft={<Download size={14} strokeWidth={1.5} />} onClick={() => indir(onizlemeDok)}>İndir</Button>
            </>
          }
        >
          {onizlemeDok.tur === 'application/pdf' && (
            <iframe src={onizlemeDok.icerik} style={{ width: '100%', height: '70vh', border: 'none' }} title="Önizleme" />
          )}
          {onizlemeDok.tur?.startsWith('image/') && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <img src={onizlemeDok.icerik} alt={onizlemeDok.ad} style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 'var(--radius-sm)', objectFit: 'contain' }} />
            </div>
          )}
          {onizlemeDok.tur === 'text/plain' && (
            <pre style={{ padding: 16, font: '400 13px/20px var(--font-mono)', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)' }}>
              {atob(onizlemeDok.icerik.split(',')[1] || '')}
            </pre>
          )}
          {!['application/pdf', 'text/plain'].includes(onizlemeDok.tur) && !onizlemeDok.tur?.startsWith('image/') && (
            <EmptyState
              icon={<File size={32} strokeWidth={1.5} />}
              title="Bu dosya türü önizlenemiyor"
              action={<Button variant="primary" iconLeft={<Download size={14} strokeWidth={1.5} />} onClick={() => indir(onizlemeDok)}>İndir</Button>}
            />
          )}
        </Modal>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Doküman Merkezi</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            <span className="tabular-nums">{meta.length}</span> doküman · Sürükle bırak ile yükleyebilirsiniz
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'inline-flex', padding: 2, background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)' }}>
            {[
              { id: 'grid',  C: LayoutGrid, label: 'Grid' },
              { id: 'liste', C: List,       label: 'Liste' },
            ].map(m => {
              const active = gorunumModu === m.id
              const IconC = m.C
              return (
                <button
                  key={m.id}
                  onClick={() => setGorunumModu(m.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px',
                    borderRadius: 'calc(var(--radius-sm) - 2px)',
                    background: active ? 'var(--surface-card)' : 'transparent',
                    boxShadow: active ? 'var(--shadow-sm)' : 'none',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: 'none', cursor: 'pointer',
                    font: '500 13px/18px var(--font-sans)',
                  }}
                >
                  <IconC size={14} strokeWidth={1.5} /> {m.label}
                </button>
              )
            })}
          </div>
          <Button variant="primary" iconLeft={<Upload size={14} strokeWidth={1.5} />} onClick={() => setYuklePanelAcik(true)}>
            Dosya yükle
          </Button>
        </div>
      </div>

      {/* Kategori Tile'ları */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
        {KATEGORILER.map(kat => {
          const active = aktifKategori === kat.id
          const IconC = kat.C
          return (
            <button
              key={kat.id}
              onClick={() => setAktifKategori(kat.id)}
              style={{
                padding: 14,
                borderRadius: 'var(--radius-md)',
                background: active ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                boxShadow: active ? 'var(--shadow-sm)' : 'none',
                cursor: 'pointer', textAlign: 'center',
                transition: 'all 120ms',
              }}
            >
              <IconC size={20} strokeWidth={1.5} style={{ color: active ? 'var(--brand-primary)' : 'var(--text-secondary)', marginBottom: 6 }} />
              <div style={{ font: '600 18px/1 var(--font-sans)', color: active ? 'var(--brand-primary)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {kategoriSayisi(kat.id)}
              </div>
              <div className="t-caption" style={{ marginTop: 4 }}>{kat.isim}</div>
            </button>
          )
        })}
      </div>

      {/* Yükleme paneli */}
      {yuklePanelAcik && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 className="t-h2" style={{ margin: 0 }}>Yeni Doküman Yükle</h2>
            <button
              aria-label="Kapat"
              onClick={() => { setYuklePanelAcik(false); setSecilenDosya(null); setHata('') }}
              style={{
                width: 28, height: 28,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-tertiary)', borderRadius: 'var(--radius-sm)',
              }}
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>

          {/* Mod seçici */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, padding: 4, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)' }}>
            {[
              { id: 'dosya', C: Upload, etiket: 'Dosya Yükle', aciklama: `Maks ${MAX_BOYUT_MB} MB` },
              { id: 'link',  C: Link2,  etiket: 'Dış Link',   aciklama: 'Drive, SharePoint…' },
            ].map(m => {
              const active = yukleModu === m.id
              const IconC = m.C
              return (
                <button
                  key={m.id}
                  onClick={() => { setYukleModu(m.id); setHata('') }}
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    padding: '8px 12px',
                    background: active ? 'var(--surface-card)' : 'transparent',
                    boxShadow: active ? 'var(--shadow-sm)' : 'none',
                    border: 'none',
                    borderRadius: 'calc(var(--radius-sm) - 2px)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '500 13px/18px var(--font-sans)', color: active ? 'var(--brand-primary)' : 'var(--text-secondary)' }}>
                    <IconC size={14} strokeWidth={1.5} /> {m.etiket}
                  </span>
                  <span style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>{m.aciklama}</span>
                </button>
              )
            })}
          </div>

          {yukleModu === 'dosya' && (
            <Alert variant="warning" style={{ marginBottom: 16 }}>
              <strong>Geliştirme ortamı kısıtı:</strong> Tarayıcı depolama limiti nedeniyle şu an maks {MAX_BOYUT_MB} MB yüklenebilir.
              Büyük dosyalar için <strong>"Dış Link"</strong> seçeneğini kullanın (Google Drive, SharePoint, OneDrive).
            </Alert>
          )}

          {yukleModu === 'dosya' && (
            <div
              onClick={() => dosyaInputRef.current?.click()}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '40px 20px',
                marginBottom: 16,
                borderRadius: 'var(--radius-md)',
                border: `2px dashed ${secilenDosya ? 'var(--success)' : 'var(--border-default)'}`,
                background: secilenDosya ? 'var(--success-soft)' : 'var(--surface-sunken)',
                cursor: 'pointer',
                transition: 'all 120ms',
              }}
            >
              <input
                ref={dosyaInputRef} type="file"
                style={{ display: 'none' }}
                accept={IZIN_VERILEN_TURLER.join(',')}
                onChange={e => dosyaisle(e.target.files[0])}
              />
              {secilenDosya ? (
                (() => {
                  const { Icon } = dosyaIkonu(secilenDosya.type)
                  return (
                    <div style={{ textAlign: 'center' }}>
                      <Icon size={32} strokeWidth={1.5} style={{ color: 'var(--success)', marginBottom: 8 }} />
                      <p style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--success)', margin: 0 }}>{secilenDosya.name}</p>
                      <p className="t-caption" style={{ marginTop: 2 }}>{boyutFormat(secilenDosya.size)}</p>
                      <button
                        onClick={e => { e.stopPropagation(); setSecilenDosya(null) }}
                        style={{
                          marginTop: 8, background: 'none', border: 'none', cursor: 'pointer',
                          font: '500 12px/16px var(--font-sans)', color: 'var(--text-tertiary)',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <X size={12} strokeWidth={1.5} /> Kaldır
                      </button>
                    </div>
                  )
                })()
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <Upload size={32} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
                  <p style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-secondary)', margin: 0 }}>
                    Dosyayı buraya sürükleyin veya tıklayın
                  </p>
                  <p className="t-caption" style={{ marginTop: 4 }}>
                    PDF, Word, Excel, PowerPoint, görsel · Maks {MAX_BOYUT_MB} MB
                  </p>
                </div>
              )}
            </div>
          )}

          {yukleModu === 'link' && (
            <div style={{ marginBottom: 16 }}>
              <Label required>Dosya linki</Label>
              <Input
                type="url"
                value={form.disLink}
                onChange={e => setForm({ ...form, disLink: e.target.value })}
                placeholder="https://drive.google.com/… veya https://sharepoint.com/…"
              />
              <p className="t-caption" style={{ marginTop: 6 }}>
                Google Drive, Microsoft SharePoint, OneDrive, Dropbox veya herhangi bir erişilebilir URL.
              </p>
            </div>
          )}

          {hata && (
            <Alert variant="danger" style={{ marginBottom: 16 }}>{hata}</Alert>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
            <div>
              <Label required>Doküman adı</Label>
              <Input value={form.ad} onChange={e => setForm({ ...form, ad: e.target.value })} placeholder="Açıklayıcı bir isim verin" />
            </div>
            <div>
              <Label required>Kategori</Label>
              <CustomSelect value={form.kategori} onChange={e => setForm({ ...form, kategori: e.target.value })}>
                {KATEGORILER.map(k => <option key={k.id} value={k.id}>{k.isim}</option>)}
              </CustomSelect>
            </div>
            {form.kategori === 'yazilim_guncelleme' && (
              <div>
                <Label>Sürüm no</Label>
                <Input value={form.surum} onChange={e => setForm({ ...form, surum: e.target.value })} placeholder="v2.4.1" style={{ fontFamily: 'var(--font-mono)' }} />
              </div>
            )}
            <div style={{ gridColumn: form.kategori === 'yazilim_guncelleme' ? 'auto' : 'span 2' }}>
              <Label>Etiketler</Label>
              <Input value={form.etiketler} onChange={e => setForm({ ...form, etiketler: e.target.value })} placeholder="Virgülle ayırın: CCTV, NVR, 2026" />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <Label>Açıklama</Label>
              <Textarea value={form.aciklama} onChange={e => setForm({ ...form, aciklama: e.target.value })} rows={3} placeholder="Bu doküman hakkında kısa açıklama…" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button
              variant="primary"
              iconLeft={<Upload size={14} strokeWidth={1.5} />}
              disabled={yukleniyor || (yukleModu === 'dosya' && !secilenDosya)}
              onClick={kaydet}
            >
              {yukleniyor ? 'Yükleniyor…' : 'Yükle'}
            </Button>
            <Button variant="secondary" onClick={() => { setYuklePanelAcik(false); setSecilenDosya(null); setHata('') }}>
              İptal
            </Button>
          </div>
        </Card>
      )}

      {/* Filtre */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[{ id: 'hepsi', isim: 'Tümü', C: Library }, ...KATEGORILER].map(kat => {
            const active = aktifKategori === kat.id
            const IconC = kat.C
            return (
              <button
                key={kat.id}
                onClick={() => setAktifKategori(kat.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: active ? 'var(--brand-primary)' : 'var(--surface-card)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                  font: '500 12px/16px var(--font-sans)',
                  cursor: 'pointer',
                }}
              >
                <IconC size={12} strokeWidth={1.5} />
                {kat.isim}
                <span style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>({kategoriSayisi(kat.id)})</span>
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <div style={{ width: 200 }}>
            <SearchInput value={aramaMetni} onChange={e => setAramaMetni(e.target.value)} placeholder="Ara…" />
          </div>
          <div style={{ width: 140 }}>
            <CustomSelect value={sirala} onChange={e => setSirala(e.target.value)}>
              <option value="tarih_yeni">En yeni</option>
              <option value="tarih_eski">En eski</option>
              <option value="ad_az">A → Z</option>
              <option value="boyut">Boyut</option>
            </CustomSelect>
          </div>
        </div>
      </div>

      {/* Boş durum */}
      {filtreli.length === 0 && (
        <EmptyState
          icon={<Library size={32} strokeWidth={1.5} />}
          title={aramaMetni ? 'Arama sonucu bulunamadı' : 'Bu kategoride henüz doküman yok'}
          description={!aramaMetni && 'Dosyayı sürükleyip bırakın veya "Dosya yükle" butonuna tıklayın.'}
          action={!aramaMetni && <Button variant="primary" iconLeft={<Upload size={14} strokeWidth={1.5} />} onClick={() => setYuklePanelAcik(true)}>İlk dokümanı yükle</Button>}
        />
      )}

      {/* Grid */}
      {gorunumModu === 'grid' && filtreli.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {filtreli.map(dok => {
            const { Icon, renk } = dosyaIkonu(dok.tur)
            const kat = KATEGORILER.find(k => k.id === dok.kategori)
            const onizleyebilir = dok.tur !== 'link' &&
              (['application/pdf', 'text/plain'].includes(dok.tur) || dok.tur?.startsWith('image/'))
            return (
              <div key={dok.id}>
                <Card style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
                  <div style={{
                    width: 44, height: 44,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--surface-sunken)',
                    borderRadius: 'var(--radius-sm)',
                    color: renk,
                  }}>
                    <Icon size={22} strokeWidth={1.5} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-primary)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {dok.ad}
                    </p>
                    {dok.surum && (
                      <span style={{
                        display: 'inline-block', marginTop: 4,
                        padding: '1px 6px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--brand-primary-soft)',
                        color: 'var(--brand-primary)',
                        font: '500 11px/16px var(--font-mono)',
                      }}>
                        {dok.surum}
                      </span>
                    )}
                    {dok.aciklama && (
                      <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', margin: '4px 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {dok.aciklama}
                      </p>
                    )}
                  </div>

                  {dok.etiketler?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {dok.etiketler.slice(0, 3).map(e => <Badge key={e} tone="neutral">{e}</Badge>)}
                    </div>
                  )}

                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    paddingTop: 10, borderTop: '1px solid var(--border-default)',
                  }}>
                    {kat && <Badge tone={kat.tone}>{kat.isim.split(' ')[0]}</Badge>}
                    <span className="t-caption tabular-nums">{boyutFormat(dok.boyut)}</span>
                  </div>

                  <p className="t-caption" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {dok.yukleyenAd} · {new Date(dok.yuklemeTarihi).toLocaleDateString('tr-TR')}
                  </p>

                  <div style={{ display: 'flex', gap: 6 }}>
                    {dok.tur === 'link' ? (
                      <Button variant="primary" size="sm" iconLeft={<Link2 size={12} strokeWidth={1.5} />} onClick={() => disLinkAc(dok)} style={{ flex: 1, justifyContent: 'center' }}>
                        Aç
                      </Button>
                    ) : (
                      <>
                        {onizleyebilir && (
                          <Button variant="secondary" size="sm" iconLeft={<Eye size={12} strokeWidth={1.5} />} onClick={() => onizle(dok)} style={{ flex: 1, justifyContent: 'center' }}>
                            Önizle
                          </Button>
                        )}
                        <Button variant="primary" size="sm" iconLeft={<Download size={12} strokeWidth={1.5} />} onClick={() => indir(dok)} style={{ flex: 1, justifyContent: 'center' }}>
                          İndir
                        </Button>
                      </>
                    )}
                    <button
                      aria-label="Sil"
                      onClick={() => setSilOnayId(dok.id)}
                      style={{
                        width: 32, height: 32,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent', border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                </Card>

                {silOnayId === dok.id && (
                  <div style={{
                    marginTop: 4,
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--danger-soft)',
                    border: '1px solid var(--danger-border)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <AlertTriangle size={12} strokeWidth={1.5} style={{ color: 'var(--danger)' }} />
                    <span style={{ flex: 1, font: '500 12px/16px var(--font-sans)', color: 'var(--danger)' }}>Bu dokümanı sil?</span>
                    <Button variant="danger" size="sm" onClick={() => sil(dok.id)}>Evet</Button>
                    <Button variant="secondary" size="sm" onClick={() => setSilOnayId(null)}>İptal</Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Liste */}
      {gorunumModu === 'liste' && filtreli.length > 0 && (
        <Card padding={0}>
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.8fr 1fr auto',
            gap: 16, padding: '10px 20px',
            background: 'var(--surface-sunken)',
            borderBottom: '1px solid var(--border-default)',
            font: '600 11px/16px var(--font-sans)',
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            <div>Doküman</div><div>Kategori</div><div>Boyut</div><div>Tarih</div><div />
          </div>
          {filtreli.map(dok => {
            const { Icon, renk } = dosyaIkonu(dok.tur)
            const kat = KATEGORILER.find(k => k.id === dok.kategori)
            const onizleyebilir = dok.tur !== 'link' &&
              (['application/pdf', 'text/plain'].includes(dok.tur) || dok.tur?.startsWith('image/'))
            return (
              <div key={dok.id}>
                <div
                  style={{
                    display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.8fr 1fr auto',
                    gap: 16, padding: '12px 20px', alignItems: 'center',
                    borderBottom: '1px solid var(--border-default)',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Icon size={18} strokeWidth={1.5} style={{ color: renk, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {dok.ad}
                      </div>
                      <div className="t-caption" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {dok.surum && <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--brand-primary)' }}>{dok.surum} · </span>}
                        {dok.orijinalAd}
                      </div>
                    </div>
                  </div>
                  <div>{kat && <Badge tone={kat.tone}>{kat.isim}</Badge>}</div>
                  <div className="t-caption tabular-nums">{boyutFormat(dok.boyut)}</div>
                  <div>
                    <div style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {new Date(dok.yuklemeTarihi).toLocaleDateString('tr-TR')}
                    </div>
                    <div className="t-caption">{dok.yukleyenAd}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {dok.tur === 'link' ? (
                      <Button variant="primary" size="sm" iconLeft={<Link2 size={12} strokeWidth={1.5} />} onClick={() => disLinkAc(dok)}>Aç</Button>
                    ) : (
                      <>
                        {onizleyebilir && (
                          <Button variant="secondary" size="sm" iconLeft={<Eye size={12} strokeWidth={1.5} />} onClick={() => onizle(dok)}>Önizle</Button>
                        )}
                        <Button variant="primary" size="sm" iconLeft={<Download size={12} strokeWidth={1.5} />} onClick={() => indir(dok)}>İndir</Button>
                      </>
                    )}
                    <button
                      aria-label="Sil"
                      onClick={() => setSilOnayId(dok.id)}
                      style={{
                        width: 28, height: 28,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent', border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                    >
                      <Trash2 size={12} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
                {silOnayId === dok.id && (
                  <div style={{
                    padding: '10px 20px',
                    background: 'var(--danger-soft)',
                    borderBottom: '1px solid var(--border-default)',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <AlertTriangle size={14} strokeWidth={1.5} style={{ color: 'var(--danger)' }} />
                    <span style={{ flex: 1, font: '500 13px/18px var(--font-sans)', color: 'var(--danger)' }}>
                      <strong>{dok.ad}</strong> silinecek. Emin misiniz?
                    </span>
                    <Button variant="danger" size="sm" onClick={() => sil(dok.id)}>Evet, sil</Button>
                    <Button variant="secondary" size="sm" onClick={() => setSilOnayId(null)}>İptal</Button>
                  </div>
                )}
              </div>
            )
          })}
        </Card>
      )}
    </div>
  )
}
