// Kişisel Dokümanlar — kullanıcı kendi dosya/link'lerini yönetir.
// Görünürlük: sadece_ben / herkes / secili kişiler.

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  Upload, Link2, FileText, FileSpreadsheet, FileImage, File,
  Search, Eye, Download, Trash2, Edit2, Lock, Users, User as UserIcon,
  Plus, X, RefreshCw, ClipboardList, Target, Library, Tag, Cloud, CheckCircle2, AlertTriangle,
  Folder, FolderPlus,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import {
  kategorileriGetir, kategoriEkle, kategoriSil, kategoriYenidenAdlandir,
  dokumanlariGetir, dokumanEkle, dokumanGuncelle, dokumanSil,
  dokumanIndirmeUrl, dokumanDosyayiIndir,
  MAX_BOYUT_MB, MAX_BOYUT,
} from '../services/kisiDokumanService'
import {
  Button, Input, Textarea, Label, Card, Badge, EmptyState, SearchInput, Modal,
} from '../components/ui'
import CustomSelect from '../components/CustomSelect'
import { uygulamaAyarGetir, uygulamaAyarKaydet } from '../services/ayarService'
import {
  oneDriveSec, oneDriveDosyaIndir, ONEDRIVE_AYAR_ANAHTARI, ONEDRIVE_KURULUM_ADIMLARI,
} from '../lib/oneDrive'

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
  const [oneDriveModal, setOneDriveModal] = useState(false)
  const [arama, setArama] = useState('')
  const [kategoriFiltre, setKategoriFiltre] = useState('')

  // ── Klasör görünümü ───────────────────────────────────────────────────
  // Kategoriler zaten kullanıcı-tanımlı ve isimliydi, ama sadece filtre
  // açılırında duruyordu — kullanıcı "dağınık" görüyordu. Artık içine
  // girilen klasör kartları (2026-07-15).
  const [acikKlasor, setAcikKlasor] = useState(null)   // null = kök
  const [yeniKlasorAcik, setYeniKlasorAcik] = useState(false)
  const [yeniKlasorAd, setYeniKlasorAd] = useState('')
  const [surukleAktif, setSurukleAktif] = useState(false)
  const [yuklemeDurum, setYuklemeDurum] = useState(null)  // {toplam, biten, ad}

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

  // Klasörde kaç doküman var (o anki sekme kapsamında)
  const klasorSayisi = (kid) => sekmeliListe.filter(d => String(d.kategoriId) === String(kid)).length

  // Arama yapılırken klasör gezinme devre dışı: kullanıcı "her yerde ara"
  // bekler, açık klasörün içine hapsolmasın.
  const aramaModu = arama.trim().length > 0

  const gorunenListe = useMemo(() => {
    if (aramaModu || kategoriFiltre) return aramaliListe
    return aramaliListe.filter(d =>
      acikKlasor ? String(d.kategoriId) === String(acikKlasor) : !d.kategoriId)
  }, [aramaliListe, acikKlasor, aramaModu, kategoriFiltre])

  const acikKlasorObj = kategoriler.find(k => String(k.id) === String(acikKlasor)) || null

  const klasorOlustur = async (ad) => {
    const isim = String(ad || '').trim()
    if (!isim) return null
    const mevcut = kategoriler.find(k => k.isim.toLocaleLowerCase('tr') === isim.toLocaleLowerCase('tr'))
    if (mevcut) return mevcut     // aynı isim varsa onu kullan (sürükle-bırakta tekrar açma)
    const yeniK = await kategoriEkle({ isim })
    setKategoriler(prev => [...prev, yeniK])
    return yeniK
  }

  const yeniKlasorKaydet = async () => {
    try {
      const k = await klasorOlustur(yeniKlasorAd)
      if (!k) { toast.error('Klasör adı boş olamaz.'); return }
      setYeniKlasorAd(''); setYeniKlasorAcik(false)
      toast.success(`"${k.isim}" klasörü oluşturuldu.`)
    } catch (e) {
      toast.error(e?.message?.includes('duplicate') || e?.code === '23505'
        ? 'Bu isimde bir klasörün zaten var.'
        : (e?.message || 'Klasör oluşturulamadı.'))
    }
  }

  // ── Sürükle-bırak ────────────────────────────────────────────────────
  // Dosya bırakılırsa açık klasöre yüklenir. KLASÖR bırakılırsa o isimde
  // klasör açılır ve içindekiler oraya yüklenir (kullanıcı isteği).
  // DataTransferItem.webkitGetAsEntry: dizin mi dosya mı ayırmanın tek yolu;
  // dosya listesi (e.dataTransfer.files) dizinleri 0 baytlık dosya gösterir.
  const dizinDosyalari = (dizinEntry) => new Promise((resolve) => {
    const okuyucu = dizinEntry.createReader()
    const hepsi = []
    const oku = () => okuyucu.readEntries(async (girisler) => {
      if (!girisler.length) { resolve(hepsi); return }
      for (const g of girisler) {
        if (g.isFile) {
          await new Promise(r => g.file((f) => { hepsi.push(f); r() }))
        }
        // Alt klasörler DÜZ geçilir — tek seviye klasör modeli.
      }
      oku()   // readEntries tek seferde en fazla 100 döner
    }, () => resolve(hepsi))
    oku()
  })

  const dosyalariYukle = async (dosyalar, kategoriId) => {
    if (!dosyalar.length) return
    setYuklemeDurum({ toplam: dosyalar.length, biten: 0, ad: dosyalar[0].name })
    let basarili = 0
    const hatalar = []
    for (let i = 0; i < dosyalar.length; i++) {
      const f = dosyalar[i]
      setYuklemeDurum({ toplam: dosyalar.length, biten: i, ad: f.name })
      try {
        if (f.size > MAX_BOYUT) {
          hatalar.push(`${f.name}: ${MAX_BOYUT_MB} MB üstü`)
          continue
        }
        await dokumanEkle({
          baslik: f.name.replace(/\.[^.]+$/, ''),
          aciklama: null,
          kategoriId: kategoriId || null,
          tip: 'dosya',
          dosya: f,
          gorunurluk: 'sadece_ben',
        })
        basarili++
      } catch (e) {
        hatalar.push(`${f.name}: ${e?.message || 'yüklenemedi'}`)
      }
    }
    setYuklemeDurum(null)
    await yukle()
    // Kısmi başarı SAKLANMAZ — hangi dosya neden yüklenmedi söylenir.
    if (basarili) toast.success(`${basarili} dosya yüklendi.`)
    if (hatalar.length) toast.error(`${hatalar.length} dosya yüklenemedi — ${hatalar.slice(0, 3).join(' · ')}${hatalar.length > 3 ? ' …' : ''}`)
  }

  const birakildi = async (e) => {
    e.preventDefault()
    setSurukleAktif(false)
    if (sekme !== 'bana_ait') { toast.error('Dosya eklemek için "Benim Dokümanlarım" sekmesinde ol.'); return }
    const ogeler = Array.from(e.dataTransfer.items || [])
      .map(o => (o.webkitGetAsEntry ? o.webkitGetAsEntry() : null))
      .filter(Boolean)

    try {
      if (ogeler.length) {
        const dizinler = ogeler.filter(o => o.isDirectory)
        const dosyaGirisleri = ogeler.filter(o => o.isFile)

        // Klasör(ler) bırakıldı → aynı isimde klasör aç, içine yükle
        for (const d of dizinler) {
          const k = await klasorOlustur(d.name)
          const icerik = await dizinDosyalari(d)
          if (!icerik.length) { toast.error(`"${d.name}" boş görünüyor — yüklenecek dosya yok.`); continue }
          await dosyalariYukle(icerik, k?.id)
        }

        // Tekil dosyalar → açık klasöre
        if (dosyaGirisleri.length) {
          const dosyalar = await Promise.all(dosyaGirisleri.map(g => new Promise(r => g.file(r))))
          await dosyalariYukle(dosyalar, acikKlasor)
        }
        return
      }
      // webkitGetAsEntry yoksa (eski tarayıcı) düz dosya listesi
      await dosyalariYukle(Array.from(e.dataTransfer.files || []), acikKlasor)
    } catch (err) {
      setYuklemeDurum(null)
      toast.error(err?.message || 'Yükleme başarısız.')
    }
  }

  return (
    <div
      style={{ padding: 24, maxWidth: 1400, margin: '0 auto', position: 'relative' }}
      onDragOver={e => { e.preventDefault(); if (!surukleAktif) setSurukleAktif(true) }}
      onDragLeave={e => { if (e.currentTarget === e.target) setSurukleAktif(false) }}
      onDrop={birakildi}
    >
      {/* Sürükle-bırak katmanı — dosya/klasör bırakılınca yüklenir */}
      {surukleAktif && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 900,
          background: 'rgba(30,90,168,0.08)',
          border: '3px dashed var(--brand-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            background: 'var(--surface-card)', padding: '18px 28px',
            borderRadius: 'var(--radius-lg)', border: '1px solid var(--brand-primary)',
            boxShadow: 'var(--shadow-lg)', textAlign: 'center',
          }}>
            <Upload size={28} style={{ color: 'var(--brand-primary)' }} />
            <div style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)', marginTop: 6 }}>
              {acikKlasorObj ? `"${acikKlasorObj.isim}" klasörüne bırak` : 'Bırak — yüklensin'}
            </div>
            <div style={{ font: '400 12px/17px var(--font-sans)', color: 'var(--text-tertiary)' }}>
              Klasör bırakırsan aynı isimde klasör açılır · max {MAX_BOYUT_MB} MB
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 className="t-h1" style={{ margin: 0 }}>Dokümanlarım</h1>
          <p className="t-caption" style={{ color: 'var(--text-tertiary)', marginTop: 4 }}>
            Kişisel dosya ve linklerin. Görünürlüğü sen belirlersin.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" iconLeft={<FolderPlus size={14} />} onClick={() => { setYeniKlasorAd(''); setYeniKlasorAcik(true) }}>
            Yeni Klasör
          </Button>
          <Button variant="secondary" iconLeft={<Tag size={14} />} onClick={() => setKategoriModal(true)}>
            Klasörleri Yönet
          </Button>
          <Button variant="secondary" iconLeft={<Cloud size={14} />} onClick={() => setOneDriveModal(true)}>
            OneDrive'dan Ekle
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

      {/* Yeni klasör satırı */}
      {yeniKlasorAcik && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Folder size={16} style={{ color: 'var(--brand-primary)' }} />
            <input
              autoFocus
              value={yeniKlasorAd}
              onChange={e => setYeniKlasorAd(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') yeniKlasorKaydet(); if (e.key === 'Escape') setYeniKlasorAcik(false) }}
              placeholder="Klasör adı (ör. Bayrampaşa Projesi)"
              style={{
                flex: 1, minWidth: 200, padding: 8,
                borderRadius: 8, border: '1px solid var(--border-default)',
                background: 'var(--surface-card)', color: 'var(--text-primary)', fontSize: 13,
              }}
            />
            <Button variant="primary" size="sm" onClick={yeniKlasorKaydet}>Oluştur</Button>
            <Button variant="tertiary" size="sm" onClick={() => setYeniKlasorAcik(false)}>Vazgeç</Button>
          </div>
        </Card>
      )}

      {/* Yükleme göstergesi */}
      {yuklemeDurum && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            <Upload size={16} style={{ color: 'var(--brand-primary)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>
              Yükleniyor: <strong style={{ color: 'var(--text-primary)' }}>{yuklemeDurum.ad}</strong>
              {yuklemeDurum.toplam > 1 && <> · {yuklemeDurum.biten + 1}/{yuklemeDurum.toplam}</>}
            </span>
          </div>
        </Card>
      )}

      {/* Konum çubuğu — klasörün içindeyken */}
      {acikKlasorObj && !aramaModu && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13 }}>
          <button onClick={() => setAcikKlasor(null)}
            style={{ background: 'none', border: 'none', color: 'var(--brand-primary)', cursor: 'pointer', padding: 0, fontSize: 13, fontWeight: 600 }}>
            Dokümanlarım
          </button>
          <span style={{ color: 'var(--text-tertiary)' }}>/</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--text-primary)' }}>
            <Folder size={14} style={{ color: 'var(--brand-primary)' }} /> {acikKlasorObj.isim}
          </span>
          <span style={{ color: 'var(--text-tertiary)' }}>· {klasorSayisi(acikKlasorObj.id)} doküman</span>
        </div>
      )}

      {/* Klasör kartları — yalnız kökte ve arama yokken */}
      {!yukleniyor && !acikKlasor && !aramaModu && !kategoriFiltre && kategoriler.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10, marginBottom: 16 }}>
          {kategoriler.map(k => (
            <button key={k.id} onClick={() => setAcikKlasor(k.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 14px', textAlign: 'left',
                background: 'var(--surface-card)', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)', cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
            >
              <Folder size={20} style={{ color: k.kullaniciId ? 'var(--brand-primary)' : 'var(--text-tertiary)', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {k.isim}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {klasorSayisi(k.id)} doküman{k.kullaniciId ? '' : ' · ortak'}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Liste */}
      {yukleniyor ? (
        <Card><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</div></Card>
      ) : gorunenListe.length === 0 ? (
        <EmptyState
          icon={<File size={40} strokeWidth={1.5} />}
          title={acikKlasorObj ? `"${acikKlasorObj.isim}" boş` : (aramaModu ? 'Sonuç yok' : 'Klasör dışında doküman yok')}
          description={sekme === 'bana_ait'
            ? 'Dosyaları buraya sürükleyip bırakabilirsin — klasör bırakırsan aynı isimde klasör açılır.'
            : 'Bu sekmede kayıt yok.'}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {gorunenListe.map(d => (
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

      {oneDriveModal && (
        <OneDriveModal
          kategoriler={kategoriler}
          kullanici={kullanici}
          onKapat={() => setOneDriveModal(false)}
          onAktarildi={async () => { await yukle() }}
        />
      )}
    </div>
  )
}

// ---------------- OneDrive'dan Ekle ----------------
// Client ID uygulama_ayarlari'nda ('onedrive_client_id'). Yoksa kurulum ekranı
// gösterilir (admin ID'yi buradan yapıştırır). Varsa Microsoft seçicisi açılır,
// seçilen dosyalar CRM deposuna kopyalanır (8 MB üstü ise OneDrive linki olarak eklenir).

function OneDriveModal({ kategoriler, kullanici, onKapat, onAktarildi }) {
  const { toast } = useToast()
  const admin = kullanici?.rol === 'admin'
  const [clientId, setClientId] = useState(null)      // null = yükleniyor, '' = tanımsız
  const [yeniId, setYeniId] = useState('')
  const [kategoriId, setKategoriId] = useState('')
  const [gorunurluk, setGorunurluk] = useState('sadece_ben')
  const [mod, setMod] = useState('link')              // link = depo kullanmaz (varsayılan) | kopya = CRM'e kopyala
  const [secilenler, setSecilenler] = useState([])    // {oge, durum: bekliyor|aktariliyor|tamam|link|hata, mesaj}
  const [mesgul, setMesgul] = useState(false)

  useEffect(() => {
    uygulamaAyarGetir(ONEDRIVE_AYAR_ANAHTARI).then(v => setClientId(v || ''))
  }, [])

  const idKaydet = async () => {
    const v = yeniId.trim()
    if (!/^[0-9a-f-]{30,40}$/i.test(v)) { toast.error('Geçerli bir Application (client) ID yapıştırın.'); return }
    const s = await uygulamaAyarKaydet(ONEDRIVE_AYAR_ANAHTARI, v, kullanici?.id)
    if (s?._hata) { toast.error('Kaydedilemedi: ' + s._hata); return }
    setClientId(v)
    toast.success('OneDrive bağlantısı kaydedildi — artık seçici kullanılabilir.')
  }

  const seciciAc = async () => {
    setMesgul(true)
    try {
      const ogeler = await oneDriveSec(clientId, mod)
      setSecilenler(ogeler.map(oge => ({ oge, durum: 'bekliyor', mesaj: '' })))
      if (!ogeler.length) toast.info?.('Dosya seçilmedi.')
    } catch (e) {
      toast.error('Seçici açılamadı: ' + (e?.message || 'bilinmeyen hata'))
    } finally {
      setMesgul(false)
    }
  }

  const aktar = async () => {
    setMesgul(true)
    let tamam = 0
    for (let i = 0; i < secilenler.length; i++) {
      const { oge } = secilenler[i]
      const durumYaz = (durum, mesaj = '') =>
        setSecilenler(prev => prev.map((s, j) => j === i ? { ...s, durum, mesaj } : s))
      try {
        durumYaz('aktariliyor')
        // Link modu (varsayılan) VEYA kopya modunda depo limitini aşan dosya:
        // Supabase deposu HİÇ kullanılmaz — OneDrive linki olarak bağlanır.
        if (mod === 'link' || oge.size > MAX_BOYUT) {
          const url = oge.paylasimUrl || oge.webUrl
          if (!url) throw new Error('Paylaşım linki alınamadı.')
          await dokumanEkle({
            baslik: oge.name, tip: 'link', linkUrl: url,
            aciklama: mod === 'link'
              ? 'OneDrive dosyası (link — CRM deposu kullanılmadı)'
              : `OneDrive dosyası (${MAX_BOYUT_MB} MB üstü olduğu için link olarak eklendi)`,
            kategoriId: kategoriId || null, gorunurluk,
          })
          durumYaz('link')
        } else {
          const dosya = await oneDriveDosyaIndir(oge)
          await dokumanEkle({
            baslik: oge.name, tip: 'dosya', dosya,
            aciklama: 'OneDrive üzerinden aktarıldı',
            kategoriId: kategoriId || null, gorunurluk,
          })
          durumYaz('tamam')
        }
        tamam++
      } catch (e) {
        durumYaz('hata', e?.message || 'aktarılamadı')
      }
    }
    setMesgul(false)
    if (tamam) {
      toast.success(mod === 'link'
        ? `${tamam} dosya link olarak eklendi — depo kullanılmadı.`
        : `${tamam} dosya Dokümanlarım'a aktarıldı.`)
      onAktarildi()
    }
  }

  const DURUM_GOSTERIM = {
    bekliyor:    { renk: 'var(--text-tertiary)', metin: 'Bekliyor' },
    aktariliyor: { renk: 'var(--brand-primary)', metin: 'Aktarılıyor…' },
    tamam:       { renk: 'var(--success)',       metin: 'Aktarıldı ✓' },
    link:        { renk: 'var(--success)',       metin: 'Link olarak eklendi ✓' },
    hata:        { renk: 'var(--danger)',        metin: 'Hata' },
  }

  return (
    <Modal open onClose={onKapat} title="OneDrive'dan Ekle" width={640}>
      {clientId === null ? (
        <p className="t-caption">Ayarlar yükleniyor…</p>
      ) : clientId === '' ? (
        // ---- Kurulum ekranı ----
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ font: '400 13px/19px var(--font-sans)', color: 'var(--text-secondary)', margin: 0 }}>
            OneDrive bağlantısı için bir kerelik Microsoft uygulama kaydı gerekir (~5 dk).
            Kayıt sonrası tüm personel kendi Microsoft hesabıyla dosya seçebilir.
          </p>
          <ol style={{ margin: 0, paddingLeft: 20, font: '400 12.5px/20px var(--font-sans)', color: 'var(--text-secondary)' }}>
            {ONEDRIVE_KURULUM_ADIMLARI.map((a, i) => <li key={i}>{a}</li>)}
          </ol>
          <div style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', padding: '8px 12px', font: '500 12px/18px var(--font-mono)', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
            Redirect URI (SPA): {window.location.origin}
          </div>
          {admin ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <Label>Application (client) ID</Label>
                <Input value={yeniId} onChange={e => setYeniId(e.target.value)} placeholder="örn. 3f2a1b0c-...-9d8e" />
              </div>
              <Button variant="primary" onClick={idKaydet}>Kaydet</Button>
            </div>
          ) : (
            <p style={{ font: '400 12.5px/18px var(--font-sans)', color: 'var(--warning)', margin: 0 }}>
              <AlertTriangle size={13} style={{ verticalAlign: '-2px' }} /> Kurulumu yalnızca yönetici yapabilir — lütfen yöneticinize iletin.
            </p>
          )}
        </div>
      ) : (
        // ---- Seçici + aktarım ----
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Ekleme şekli — varsayılan LINK: Supabase deposu hiç kullanılmaz */}
          <div>
            <Label>Ekleme şekli</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                ['link', 'Link olarak bağla (önerilen)', 'Dosya OneDrive\'da kalır, CRM deposunda YER KAPLAMAZ. Paylaşım linki üretilir.'],
                ['kopya', 'CRM deposuna kopyala', `Dosya CRM'e kopyalanır (${MAX_BOYUT_MB} MB'a kadar) — OneDrive'dan silinse bile erişilir, depo kotası kullanır.`],
              ].map(([id, baslik, aciklama]) => (
                <label key={id} style={{
                  display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer',
                  border: `1px solid ${mod === id ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                  background: mod === id ? 'var(--brand-primary-soft)' : 'transparent',
                  borderRadius: 'var(--radius-md)', padding: '8px 12px',
                }}>
                  <input type="radio" name="od-mod" checked={mod === id} onChange={() => { setMod(id); setSecilenler([]) }}
                    style={{ marginTop: 2, accentColor: 'var(--brand-primary)' }} />
                  <span>
                    <span style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{baslik}</span>
                    <br />
                    <span className="t-caption">{aciklama}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Kategori</Label>
              <CustomSelect value={kategoriId} onChange={e => setKategoriId(e.target.value)}>
                <option value="">Kategorisiz</option>
                {kategoriler.map(k => <option key={k.id} value={k.id}>{k.isim}</option>)}
              </CustomSelect>
            </div>
            <div>
              <Label>Görünürlük</Label>
              <CustomSelect value={gorunurluk} onChange={e => setGorunurluk(e.target.value)}>
                <option value="sadece_ben">Sadece ben</option>
                <option value="herkes">Herkes</option>
              </CustomSelect>
            </div>
          </div>

          <Button variant="secondary" iconLeft={<Cloud size={14} />} onClick={seciciAc} disabled={mesgul}>
            {secilenler.length ? 'Farklı Dosyalar Seç' : "OneDrive'ı Aç ve Dosya Seç"}
          </Button>

          {secilenler.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflow: 'auto' }}>
              {secilenler.map((s, i) => {
                const g = DURUM_GOSTERIM[s.durum]
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '8px 12px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.oge.name}
                      </div>
                      <div className="t-caption">
                        {boyutFormat(s.oge.size)}
                        {mod === 'link' ? ' — link olarak eklenecek (depo kullanılmaz)'
                          : s.oge.size > MAX_BOYUT ? ` — ${MAX_BOYUT_MB} MB üstü, link olarak eklenecek` : ''}
                        {s.mesaj ? ` · ${s.mesaj}` : ''}
                      </div>
                    </div>
                    <span style={{ font: '600 12px/16px var(--font-sans)', color: g.renk, whiteSpace: 'nowrap' }}>{g.metin}</span>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            {admin ? (
              <button onClick={() => { setClientId(''); setYeniId(clientId) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', font: '400 11.5px/16px var(--font-sans)', color: 'var(--text-tertiary)', padding: 0 }}>
                Bağlantı ayarını değiştir
              </button>
            ) : <span />}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" onClick={onKapat} disabled={mesgul}>Kapat</Button>
              <Button variant="primary" iconLeft={<CheckCircle2 size={14} />} onClick={aktar}
                disabled={mesgul || !secilenler.some(s => s.durum === 'bekliyor' || s.durum === 'hata')}>
                {mesgul ? 'Aktarılıyor…' : "Dokümanlarım'a Aktar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
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

      {/* flexWrap: dar kartlarda 4 buton tek satıra sığmayıp kartın dışına taşıyordu */}
      <div style={{ display: 'flex', gap: 6, borderTop: '1px solid var(--border-default)', paddingTop: 8, flexWrap: 'wrap' }}>
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
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-card)', borderRadius: 14, padding: 22,
          maxWidth: 620, width: '100%', maxHeight: '90vh', overflow: 'auto',
          border: '1px solid var(--border-default)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>🔒 {editing ? 'Dokümanı Düzenle' : 'Yeni Doküman'}</h3>
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
  const [adDuzenle, setAdDuzenle] = useState(null)   // yeniden adlandırılan klasör id
  const [yeniAd, setYeniAd] = useState('')
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
    // Klasör silinince İÇİNDEKİ DOKÜMANLAR SİLİNMEZ — kategori_id null olur
    // (mig 123: on delete set null). Kullanıcı bunu bilerek onaylasın.
    if (!confirm(`"${isim}" klasörü silinsin mi? İçindeki dokümanlar silinmez, klasörsüz kalır.`)) return
    try { await kategoriSil(id); toast.success('Klasör silindi.'); await onDegisiklik() }
    catch (e) { toast.error(e?.message || 'Silme hatası') }
  }
  const adKaydet = async (id) => {
    try {
      await kategoriYenidenAdlandir(id, yeniAd)
      setAdDuzenle(null)
      toast.success('Klasör adı değişti.')
      await onDegisiklik()
    } catch (e) { toast.error(e?.message || 'Yeniden adlandırılamadı.') }
  }

  return createPortal(
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-card)', borderRadius: 14, padding: 22,
          maxWidth: 480, width: '100%', maxHeight: '85vh', overflow: 'auto',
          border: '1px solid var(--border-default)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>🔒 Kategoriler</h3>
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
          <div key={k.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, padding: '8px 10px', background: 'var(--surface-sunken)', borderRadius: 6, marginBottom: 4 }}>
            {adDuzenle === k.id ? (
              <>
                <Input autoFocus value={yeniAd} onChange={e => setYeniAd(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') adKaydet(k.id); if (e.key === 'Escape') setAdDuzenle(null) }}
                  style={{ flex: 1 }} />
                <Button variant="primary" size="sm" onClick={() => adKaydet(k.id)}>Kaydet</Button>
                <Button variant="tertiary" size="sm" onClick={() => setAdDuzenle(null)}>Vazgeç</Button>
              </>
            ) : (
              <>
                <span style={{ flex: 1 }}>📁 {k.isim}</span>
                <button onClick={() => { setAdDuzenle(k.id); setYeniAd(k.isim) }} title="Yeniden adlandır"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                  <Edit2 size={14} />
                </button>
                <button onClick={() => sil(k.id, k.isim)} title="Sil"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>
                  <Trash2 size={14} />
                </button>
              </>
            )}
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
