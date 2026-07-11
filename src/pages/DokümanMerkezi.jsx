// Döküman Merkezi — ekibin ortak doküman kütüphanesi.
// Veri kaynağı: kisi_dokumanlari (mig 123). Burada görünenler:
//   • gorunurluk='herkes' olan tüm dokümanlar (kim yüklediyse)
//   • gorunurluk='secili' olup bana paylaşılanlar
// Merkez'den yükleme = otomatik 'herkes' görünürlüğü (ortak kütüphane).
// Kişisel dokümanlar (sadece_ben) Dokümanlarım sayfasında yönetilir.
//
// NOT: Eski sürüm localStorage tabanlıydı (dokuman_meta + base64 içerik) —
// dokümanlar sadece yüklendiği tarayıcıda görünüyordu. İlk açılışta eski
// kayıtlar otomatik DB'ye taşınır (idempotent marker'lı).

import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, Link2, FileText, FileSpreadsheet, FileImage, File,
  LayoutGrid, List, Eye, Download, Trash2, Library,
  RefreshCw, ClipboardList, Target, X, Plus, User as UserIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { supabase } from '../lib/supabase'
import {
  kategorileriGetir, dokumanlariGetir, dokumanEkle, dokumanSil,
  dokumanIndirmeUrl, dokumanDosyayiIndir, MAX_BOYUT_MB, MAX_BOYUT,
} from '../services/kisiDokumanService'
import CustomSelect from '../components/CustomSelect'
import { SkeletonList } from '../components/Skeleton'
import {
  Button, SearchInput, Input, Textarea, Label,
  Card, Badge, EmptyState, Alert, Modal,
} from '../components/ui'

const IKON_MAP = { RefreshCw, ClipboardList, Target, FileText, File, Library }

const dosyaIkonu = (tip) => {
  if (!tip) return { Icon: File, renk: 'var(--text-tertiary)' }
  if (tip === 'link') return { Icon: Link2, renk: 'var(--brand-primary)' }
  if (tip === 'application/pdf') return { Icon: FileText, renk: 'var(--danger)' }
  if (tip.includes('word')) return { Icon: FileText, renk: 'var(--info)' }
  if (tip.includes('excel') || tip.includes('spreadsheet')) return { Icon: FileSpreadsheet, renk: 'var(--success)' }
  if (tip.includes('powerpoint') || tip.includes('presentation')) return { Icon: Target, renk: 'var(--warning)' }
  if (tip.startsWith('image/')) return { Icon: FileImage, renk: 'var(--brand-primary)' }
  return { Icon: File, renk: 'var(--text-tertiary)' }
}

const boyutFormat = (b) => {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}
const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'

// Eski localStorage kategori id → mig 123 public kategori ismi
const ESKI_KATEGORI_ISIM = {
  yazilim_guncelleme: 'Yazılım Güncellemeleri',
  teknik_sartname: 'Teknik Şartnameler',
  sunum: 'Şirket Sunumları',
  sozlesme: 'Sözleşmeler',
  diger: 'Diğer',
}

// Eski localStorage dokümanlarını DB'ye taşı (bir kez; marker'lı).
// base64 içerik → Blob → File → dokumanEkle(gorunurluk: 'herkes').
async function eskiMerkezVerisiniTasi(kategoriler) {
  const MARKER = 'dokuman_merkezi_dbye_tasindi'
  if (localStorage.getItem(MARKER)) return 0
  let meta = []
  try { meta = JSON.parse(localStorage.getItem('dokuman_meta') || '[]') } catch { meta = [] }
  if (!Array.isArray(meta) || meta.length === 0) {
    localStorage.setItem(MARKER, '1')
    return 0
  }
  const kategoriIdBul = (eskiId) => {
    const isim = ESKI_KATEGORI_ISIM[eskiId]
    const k = kategoriler.find(x => !x.kullaniciId && x.isim === isim)
    return k?.id || null
  }
  let tasinan = 0
  for (const m of meta) {
    try {
      const aciklamaParcalari = [m.aciklama, m.surum ? `Sürüm: ${m.surum}` : null,
        (m.etiketler || []).length ? `Etiketler: ${m.etiketler.join(', ')}` : null].filter(Boolean)
      if (m.tur === 'link') {
        await dokumanEkle({
          baslik: m.ad, aciklama: aciklamaParcalari.join(' · '),
          kategoriId: kategoriIdBul(m.kategori), tip: 'link',
          linkUrl: m.disLink, gorunurluk: 'herkes',
        })
        tasinan++
      } else {
        const base64 = localStorage.getItem(`dokuman_icerik_${m.id}`)
        if (!base64) continue  // içerik bu tarayıcıda yok — atla
        const blob = await (await fetch(base64)).blob()
        const dosya = new window.File([blob], m.orijinalAd || m.ad, { type: m.tur || blob.type })
        if (dosya.size > MAX_BOYUT) continue
        await dokumanEkle({
          baslik: m.ad, aciklama: aciklamaParcalari.join(' · '),
          kategoriId: kategoriIdBul(m.kategori), tip: 'dosya',
          dosya, gorunurluk: 'herkes',
        })
        localStorage.removeItem(`dokuman_icerik_${m.id}`)
        tasinan++
      }
    } catch (e) {
      console.warn('[DokümanMerkezi taşıma]', m.ad, e?.message)
    }
  }
  localStorage.setItem(MARKER, '1')
  return tasinan
}

export default function DokümanMerkezi() {
  const { kullanici } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const navigate = useNavigate()

  const [dokumanlar, setDokumanlar] = useState([])
  const [kategoriler, setKategoriler] = useState([])
  const [kullaniciMap, setKullaniciMap] = useState(new Map())
  const [yukleniyor, setYukleniyor] = useState(true)
  const [aktifKategori, setAktifKategori] = useState('hepsi')
  const [arama, setArama] = useState('')
  const [gorunumModu, setGorunumModu] = useState('grid')
  const [ekleModal, setEkleModal] = useState(false)

  const kimId = kullanici?.id

  const yukle = async () => {
    setYukleniyor(true)
    try {
      const kats = await kategorileriGetir()
      setKategoriler(kats)
      // Eski localStorage verisi varsa DB'ye taşı (bir kez)
      const tasinan = await eskiMerkezVerisiniTasi(kats)
      if (tasinan > 0) toast.success(`${tasinan} doküman eski sistemden veritabanına taşındı.`)
      const d = await dokumanlariGetir()
      setDokumanlar(d)
      const { data: kul } = await supabase.from('kullanicilar').select('id, ad')
      setKullaniciMap(new Map((kul || []).map(k => [String(k.id), k.ad])))
    } catch (e) {
      console.error('[DokümanMerkezi]', e)
      toast.error('Dokümanlar yüklenemedi: ' + (e?.message || 'bilinmeyen hata'))
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { yukle() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Merkez kapsamı: herkese açık + bana özel paylaşılanlar
  const merkezListe = useMemo(() => dokumanlar.filter(d =>
    d.gorunurluk === 'herkes'
    || (d.gorunurluk === 'secili' && (d.gorunenKullaniciIdler || []).some(x => String(x) === String(kimId)))
  ), [dokumanlar, kimId])

  const gorunen = useMemo(() => {
    let l = merkezListe
    if (aktifKategori !== 'hepsi') l = l.filter(d => String(d.kategoriId) === String(aktifKategori))
    const q = arama.trim().toLocaleLowerCase('tr')
    if (q) {
      l = l.filter(d =>
        (d.baslik || '').toLocaleLowerCase('tr').includes(q)
        || (d.aciklama || '').toLocaleLowerCase('tr').includes(q)
        || (d.dosyaAd || '').toLocaleLowerCase('tr').includes(q)
      )
    }
    return l
  }, [merkezListe, aktifKategori, arama])

  // Sadece public (sistem) kategoriler + dokümanı olan kategoriler chip olur
  const kategoriChipler = useMemo(() => {
    const kullanilan = new Set(merkezListe.map(d => String(d.kategoriId)))
    return kategoriler.filter(k => !k.kullaniciId || kullanilan.has(String(k.id)))
  }, [kategoriler, merkezListe])

  const ac = async (d) => {
    try {
      if (d.tip === 'link') {
        window.open(d.linkUrl, '_blank', 'noopener,noreferrer')
      } else {
        const url = await dokumanIndirmeUrl(d.dosyaYolu)
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (e) {
      toast.error('Açılamadı: ' + (e?.message || 'bilinmeyen hata'))
    }
  }

  const indir = async (d) => {
    try { await dokumanDosyayiIndir(d.dosyaYolu, d.dosyaAd) }
    catch (e) { toast.error('İndirilemedi: ' + (e?.message || 'bilinmeyen hata')) }
  }

  const sil = async (d) => {
    const onay = await confirm({
      baslik: 'Dokümanı Sil',
      mesaj: `"${d.baslik}" kalıcı olarak silinecek. Emin misin?`,
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    try {
      await dokumanSil(d.id)
      setDokumanlar(prev => prev.filter(x => x.id !== d.id))
      toast.success('Doküman silindi.')
    } catch (e) {
      toast.error('Silinemedi: ' + (e?.message || 'bilinmeyen hata'))
    }
  }

  if (yukleniyor) return <SkeletonList />

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Library size={22} strokeWidth={1.5} /> Döküman Merkezi
          </h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            Ekibin ortak kütüphanesi — herkese açık dokümanlar ve sana paylaşılanlar.
            Kişisel dokümanların için <button
              onClick={() => navigate('/dokumanlarim')}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--brand-primary)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
            >Dokümanlarım</button>.
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => setEkleModal(true)}>
          Yeni Doküman
        </Button>
      </div>

      {/* Filtre barı */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 220, maxWidth: 420 }}>
          <SearchInput
            value={arama}
            onChange={e => setArama(e.target.value)}
            placeholder="Başlık, açıklama veya dosya adı ara…"
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <KategoriChip aktif={aktifKategori === 'hepsi'} onClick={() => setAktifKategori('hepsi')}>
            Tümü ({merkezListe.length})
          </KategoriChip>
          {kategoriChipler.map(k => {
            const sayi = merkezListe.filter(d => String(d.kategoriId) === String(k.id)).length
            if (sayi === 0 && aktifKategori !== String(k.id)) return null
            return (
              <KategoriChip key={k.id} aktif={String(aktifKategori) === String(k.id)} onClick={() => setAktifKategori(String(k.id))}>
                {k.isim} ({sayi})
              </KategoriChip>
            )
          })}
        </div>
        <div style={{ display: 'inline-flex', background: 'var(--surface-sunken)', borderRadius: 8, padding: 3, marginLeft: 'auto' }}>
          {[{ id: 'grid', Icon: LayoutGrid }, { id: 'liste', Icon: List }].map(m => (
            <button
              key={m.id}
              onClick={() => setGorunumModu(m.id)}
              aria-label={m.id}
              style={{
                width: 30, height: 26, display: 'grid', placeItems: 'center',
                borderRadius: 6, border: 'none', cursor: 'pointer',
                background: gorunumModu === m.id ? 'var(--surface-card)' : 'transparent',
                color: gorunumModu === m.id ? 'var(--brand-primary)' : 'var(--text-tertiary)',
                boxShadow: gorunumModu === m.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <m.Icon size={14} strokeWidth={1.7} />
            </button>
          ))}
        </div>
      </div>

      {/* İçerik */}
      {gorunen.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Library size={28} strokeWidth={1.5} />}
            title={arama ? 'Aramayla eşleşen doküman yok' : 'Henüz ortak doküman yok'}
            description={arama ? 'Farklı bir arama dene.' : '"Yeni Doküman" ile ekibin görebileceği ilk dokümanı yükle — veya Dokümanlarım\'daki bir dokümanın görünürlüğünü "Herkes" yap.'}
          />
        </Card>
      ) : gorunumModu === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {gorunen.map(d => {
            const { Icon, renk } = dosyaIkonu(d.tip === 'link' ? 'link' : d.dosyaTip)
            const kategori = kategoriler.find(k => String(k.id) === String(d.kategoriId))
            const benim = String(d.kullaniciId) === String(kimId)
            return (
              <Card key={d.id} padding={14} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                    background: 'var(--surface-sunken)', display: 'grid', placeItems: 'center', color: renk,
                  }}>
                    <Icon size={18} strokeWidth={1.5} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.baslik}>
                      {d.baslik}
                    </div>
                    <div className="t-caption" style={{ marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {kategori?.isim || 'Kategorisiz'}
                      {d.tip === 'dosya' && d.dosyaBoyut ? ` · ${boyutFormat(d.dosyaBoyut)}` : ''}
                    </div>
                  </div>
                  {d.gorunurluk === 'secili' && (
                    <Badge tone="beklemede" style={{ fontSize: 9, flexShrink: 0 }}>SANA ÖZEL</Badge>
                  )}
                </div>
                {d.aciklama && (
                  <p className="t-caption" style={{
                    margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden', lineHeight: '16px',
                  }}>{d.aciklama}</p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto' }}>
                  <span className="t-caption" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <UserIcon size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 3 }} />
                    {kullaniciMap.get(String(d.kullaniciId)) || '—'} · {fmtTarih(d.olusturmaTarih)}
                  </span>
                  <IkonButon title={d.tip === 'link' ? 'Linki aç' : 'Görüntüle'} onClick={() => ac(d)}>
                    <Eye size={13} strokeWidth={1.7} />
                  </IkonButon>
                  {d.tip === 'dosya' && (
                    <IkonButon title="İndir" onClick={() => indir(d)}>
                      <Download size={13} strokeWidth={1.7} />
                    </IkonButon>
                  )}
                  {benim && (
                    <IkonButon title="Sil" tehlike onClick={() => sil(d)}>
                      <Trash2 size={13} strokeWidth={1.7} />
                    </IkonButon>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card padding={0}>
          {gorunen.map((d, i) => {
            const { Icon, renk } = dosyaIkonu(d.tip === 'link' ? 'link' : d.dosyaTip)
            const kategori = kategoriler.find(k => String(k.id) === String(d.kategoriId))
            const benim = String(d.kullaniciId) === String(kimId)
            return (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                borderBottom: i < gorunen.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              }}>
                <Icon size={16} strokeWidth={1.5} style={{ color: renk, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{d.baslik}</span>
                  {d.gorunurluk === 'secili' && <Badge tone="beklemede" style={{ fontSize: 9, marginLeft: 8 }}>SANA ÖZEL</Badge>}
                  <div className="t-caption" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {kategori?.isim || 'Kategorisiz'}
                    {d.aciklama ? ` · ${d.aciklama}` : ''}
                  </div>
                </div>
                <span className="t-caption" style={{ flexShrink: 0 }}>
                  {kullaniciMap.get(String(d.kullaniciId)) || '—'} · {fmtTarih(d.olusturmaTarih)}
                  {d.tip === 'dosya' && d.dosyaBoyut ? ` · ${boyutFormat(d.dosyaBoyut)}` : ''}
                </span>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <IkonButon title={d.tip === 'link' ? 'Linki aç' : 'Görüntüle'} onClick={() => ac(d)}>
                    <Eye size={13} strokeWidth={1.7} />
                  </IkonButon>
                  {d.tip === 'dosya' && (
                    <IkonButon title="İndir" onClick={() => indir(d)}>
                      <Download size={13} strokeWidth={1.7} />
                    </IkonButon>
                  )}
                  {benim && (
                    <IkonButon title="Sil" tehlike onClick={() => sil(d)}>
                      <Trash2 size={13} strokeWidth={1.7} />
                    </IkonButon>
                  )}
                </div>
              </div>
            )
          })}
        </Card>
      )}

      {/* Yeni doküman modalı — Merkez'den yükleme her zaman herkese açık */}
      {ekleModal && (
        <YeniDokumanModal
          kategoriler={kategoriler.filter(k => !k.kullaniciId)}
          onKapat={() => setEkleModal(false)}
          onEklendi={(yeni) => {
            setDokumanlar(prev => [yeni, ...prev])
            setEkleModal(false)
            toast.success('Doküman eklendi — tüm ekip görebilir.')
          }}
        />
      )}
    </div>
  )
}

function KategoriChip({ aktif, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: 16,
        border: `1px solid ${aktif ? 'var(--brand-primary)' : 'var(--border-default)'}`,
        background: aktif ? 'var(--brand-primary)' : 'var(--surface-card)',
        color: aktif ? '#fff' : 'var(--text-secondary)',
        font: `${aktif ? 600 : 400} 12px/16px var(--font-sans)`,
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

function IkonButon({ title, tehlike = false, onClick, children }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        width: 26, height: 26, display: 'grid', placeItems: 'center',
        borderRadius: 6, border: '1px solid var(--border-default)',
        background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = tehlike ? 'var(--danger-soft)' : 'var(--surface-sunken)'
        e.currentTarget.style.color = tehlike ? 'var(--danger)' : 'var(--text-primary)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--text-secondary)'
      }}
    >
      {children}
    </button>
  )
}

function YeniDokumanModal({ kategoriler, onKapat, onEklendi }) {
  const { toast } = useToast()
  const [mod, setMod] = useState('dosya') // dosya | link
  const [baslik, setBaslik] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [kategoriId, setKategoriId] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [dosya, setDosya] = useState(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const dosyaRef = useRef(null)

  const dosyaSec = (f) => {
    if (!f) return
    if (f.size > MAX_BOYUT) { toast.error(`Dosya çok büyük (max ${MAX_BOYUT_MB} MB).`); return }
    setDosya(f)
    if (!baslik) setBaslik(f.name.replace(/\.[^/.]+$/, ''))
  }

  const kaydet = async () => {
    if (!baslik.trim()) { toast.warning('Başlık zorunlu.'); return }
    if (mod === 'link' && !linkUrl.trim()) { toast.warning('Link URL zorunlu.'); return }
    if (mod === 'dosya' && !dosya) { toast.warning('Dosya seçin.'); return }
    setKaydediliyor(true)
    try {
      const yeni = await dokumanEkle({
        baslik, aciklama, kategoriId: kategoriId || null,
        tip: mod, linkUrl, dosya,
        gorunurluk: 'herkes',
      })
      onEklendi(yeni)
    } catch (e) {
      toast.error('Eklenemedi: ' + (e?.message || 'bilinmeyen hata'))
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <Modal
      open
      onClose={onKapat}
      title="Yeni Doküman — Ortak Kütüphane"
      width={480}
      footer={
        <>
          <Button variant="secondary" onClick={onKapat}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Kaydediliyor…' : 'Ekle'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <Alert variant="info">
          Merkeze eklenen dokümanları <strong>tüm ekip</strong> görür. Kişiye özel doküman için Dokümanlarım sayfasını kullan.
        </Alert>

        {/* Mod seçimi */}
        <div style={{ display: 'inline-flex', background: 'var(--surface-sunken)', borderRadius: 8, padding: 3, width: 'fit-content' }}>
          {[{ id: 'dosya', ad: 'Dosya', Icon: Upload }, { id: 'link', ad: 'Link', Icon: Link2 }].map(m => (
            <button
              key={m.id}
              onClick={() => setMod(m.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: mod === m.id ? 'var(--surface-card)' : 'transparent',
                color: mod === m.id ? 'var(--brand-primary)' : 'var(--text-secondary)',
                font: `${mod === m.id ? 600 : 400} 13px/16px var(--font-sans)`,
                boxShadow: mod === m.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <m.Icon size={13} strokeWidth={1.7} /> {m.ad}
            </button>
          ))}
        </div>

        {mod === 'dosya' ? (
          <div>
            <Label required>Dosya (max {MAX_BOYUT_MB} MB)</Label>
            <input ref={dosyaRef} type="file" hidden onChange={e => dosyaSec(e.target.files?.[0])} />
            <div
              onClick={() => dosyaRef.current?.click()}
              style={{
                border: '2px dashed var(--border-default)', borderRadius: 10,
                padding: 18, textAlign: 'center', cursor: 'pointer',
                background: dosya ? 'var(--brand-primary-soft)' : 'var(--surface-sunken)',
              }}
            >
              {dosya ? (
                <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                  📄 {dosya.name} <span className="t-caption">({boyutFormat(dosya.size)})</span>
                </span>
              ) : (
                <span className="t-caption">Tıkla ve dosya seç</span>
              )}
            </div>
          </div>
        ) : (
          <div>
            <Label required>Link URL</Label>
            <Input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…" />
          </div>
        )}

        <div>
          <Label required>Başlık</Label>
          <Input value={baslik} onChange={e => setBaslik(e.target.value)} placeholder="Doküman başlığı" />
        </div>
        <div>
          <Label>Kategori</Label>
          <CustomSelect value={kategoriId} onChange={e => setKategoriId(e.target.value)}>
            <option value="">Kategorisiz</option>
            {kategoriler.map(k => <option key={k.id} value={k.id}>{k.isim}</option>)}
          </CustomSelect>
        </div>
        <div>
          <Label>Açıklama</Label>
          <Textarea rows={2} value={aciklama} onChange={e => setAciklama(e.target.value)} placeholder="Kısa açıklama (opsiyonel)" />
        </div>
      </div>
    </Modal>
  )
}
