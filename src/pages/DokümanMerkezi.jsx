import { useState, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import CustomSelect from '../components/CustomSelect'

// ─── Sabitler ────────────────────────────────────────────────────────────────
const KATEGORILER = [
  { id: 'yazilim_guncelleme', isim: 'Yazılım Güncellemeleri', ikon: '🔄', renk: '#0176D3', bg: 'rgba(1,118,211,0.1)' },
  { id: 'teknik_sartname',   isim: 'Teknik Şartnameler',     ikon: '📋', renk: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  { id: 'sunum',             isim: 'Şirket Sunumları',        ikon: '🎯', renk: '#014486', bg: 'rgba(1,68,134,0.1)' },
  { id: 'sozlesme',          isim: 'Sözleşmeler',             ikon: '📄', renk: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  { id: 'diger',             isim: 'Diğer',                   ikon: '📁', renk: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
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

const MAX_BOYUT_MB = 2 // localStorage limiti nedeniyle; backend'e geçince bu kısıtlama kalkar

// ─── Yardımcılar ─────────────────────────────────────────────────────────────
function dosyaIkonu(tur) {
  if (!tur) return { ikon: '📁', renk: '#6b7280' }
  if (tur === 'link')            return { ikon: '🔗', renk: '#0176D3' }
  if (tur === 'application/pdf') return { ikon: '📄', renk: '#ef4444' }
  if (tur.includes('word'))      return { ikon: '📝', renk: '#3b82f6' }
  if (tur.includes('excel') || tur.includes('spreadsheet')) return { ikon: '📊', renk: '#10b981' }
  if (tur.includes('powerpoint') || tur.includes('presentation')) return { ikon: '🎯', renk: '#f59e0b' }
  if (tur.startsWith('image/'))  return { ikon: '🖼️', renk: '#014486' }
  if (tur === 'text/plain')      return { ikon: '📃', renk: '#6b7280' }
  return { ikon: '📁', renk: '#6b7280' }
}

function boyutFormat(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

function metaYukle() {
  try { return JSON.parse(localStorage.getItem('dokuman_meta') || '[]') } catch { return [] }
}

function metaKaydet(meta) {
  localStorage.setItem('dokuman_meta', JSON.stringify(meta))
}

function dosyaIcerikKaydet(id, base64) {
  try {
    localStorage.setItem(`dokuman_icerik_${id}`, base64)
    return true
  } catch {
    return false // QuotaExceededError
  }
}

function dosyaIcerikYukle(id) {
  return localStorage.getItem(`dokuman_icerik_${id}`) || null
}

function dosyaIcerikSil(id) {
  localStorage.removeItem(`dokuman_icerik_${id}`)
}

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────
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

  // Form state
  const [form, setForm] = useState({
    ad: '', kategori: 'teknik_sartname', aciklama: '', surum: '', etiketler: '', disLink: '',
  })
  const [yukleModu, setYukleModu] = useState('dosya') // 'dosya' | 'link'
  const [secilenDosya, setSecilenDosya] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(false)

  // ── Dosya seç / sürükle ──────────────────────────────────────────────────
  const disLinkAc = (dok) => {
    window.open(dok.disLink, '_blank', 'noopener,noreferrer')
  }

  const dosyaisle = (dosya) => {
    setHata('')
    if (!dosya) return
    if (!IZIN_VERILEN_TURLER.includes(dosya.type)) {
      setHata('Bu dosya türü desteklenmiyor.')
      return
    }
    if (dosya.size > MAX_BOYUT_MB * 1024 * 1024) {
      setHata(`Dosya boyutu ${MAX_BOYUT_MB} MB\'ı geçemez.`)
      return
    }
    setSecilenDosya(dosya)
    if (!form.ad) setForm((f) => ({ ...f, ad: dosya.name.replace(/\.[^/.]+$/, '') }))
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setSurukle(false)
    const dosya = e.dataTransfer.files[0]
    if (dosya) { dosyaisle(dosya); setYuklePanelAcik(true) }
  }, [])

  const handleDragOver = (e) => { e.preventDefault(); setSurukle(true) }
  const handleDragLeave = () => setSurukle(false)

  // ── Kaydet ───────────────────────────────────────────────────────────────
  const kaydet = async () => {
    if (!form.ad.trim()) { setHata('Dosya adı zorunludur.'); return }
    if (!form.kategori) { setHata('Kategori seçiniz.'); return }

    // Link modu
    if (yukleModu === 'link') {
      if (!form.disLink.trim()) { setHata('Lütfen bir link girin.'); return }
      const yeniId = crypto.randomUUID()
      const yeniMeta = {
        id: yeniId,
        ad: form.ad.trim(),
        orijinalAd: form.ad.trim(),
        kategori: form.kategori,
        aciklama: form.aciklama.trim(),
        surum: form.surum.trim(),
        etiketler: form.etiketler.split(',').map((e) => e.trim()).filter(Boolean),
        tur: 'link',
        boyut: null,
        disLink: form.disLink.trim(),
        yukleyenId: kullanici.id,
        yukleyenAd: kullanici.ad,
        yuklemeTarihi: new Date().toISOString(),
      }
      const yeniListe = [yeniMeta, ...meta]
      metaKaydet(yeniListe)
      setMeta(yeniListe)
      setForm({ ad: '', kategori: 'teknik_sartname', aciklama: '', surum: '', etiketler: '', disLink: '' })
      setYuklePanelAcik(false)
      return
    }

    // Dosya modu
    if (!secilenDosya) { setHata('Lütfen bir dosya seçin.'); return }

    setYukleniyor(true)
    setHata('')

    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = e.target.result
      const yeniId = crypto.randomUUID()
      const yeniMeta = {
        id: yeniId,
        ad: form.ad.trim(),
        orijinalAd: secilenDosya.name,
        kategori: form.kategori,
        aciklama: form.aciklama.trim(),
        surum: form.surum.trim(),
        etiketler: form.etiketler.split(',').map((e) => e.trim()).filter(Boolean),
        tur: secilenDosya.type,
        boyut: secilenDosya.size,
        disLink: null,
        yukleyenId: kullanici.id,
        yukleyenAd: kullanici.ad,
        yuklemeTarihi: new Date().toISOString(),
      }

      const basarili = dosyaIcerikKaydet(yeniId, base64)
      if (!basarili) {
        setHata('Depolama alanı yetersiz. Daha büyük dosyalar yüklenemiyor.')
        setYukleniyor(false)
        return
      }

      const yeniListe = [yeniMeta, ...meta]
      metaKaydet(yeniListe)
      setMeta(yeniListe)
      setSecilenDosya(null)
      setForm({ ad: '', kategori: 'teknik_sartname', aciklama: '', surum: '', etiketler: '', disLink: '' })
      setYuklePanelAcik(false)
      setYukleniyor(false)
    }
    reader.readAsDataURL(secilenDosya)
  }

  // ── İndir ────────────────────────────────────────────────────────────────
  const indir = (dok) => {
    const icerik = dosyaIcerikYukle(dok.id)
    if (!icerik) return
    const a = document.createElement('a')
    a.href = icerik
    a.download = dok.orijinalAd || dok.ad
    a.click()
  }

  // ── Önizle ───────────────────────────────────────────────────────────────
  const onizle = (dok) => {
    const icerik = dosyaIcerikYukle(dok.id)
    if (!icerik) return
    setOnizlemeDok({ ...dok, icerik })
  }

  // ── Sil ──────────────────────────────────────────────────────────────────
  const sil = (id) => {
    dosyaIcerikSil(id)
    const yeniListe = meta.filter((d) => d.id !== id)
    metaKaydet(yeniListe)
    setMeta(yeniListe)
    setSilOnayId(null)
  }

  // ── Filtreleme ────────────────────────────────────────────────────────────
  const filtreliDokuman = meta
    .filter((d) => aktifKategori === 'hepsi' || d.kategori === aktifKategori)
    .filter((d) => {
      if (!aramaMetni) return true
      const q = aramaMetni.toLowerCase()
      return (
        d.ad.toLowerCase().includes(q) ||
        d.aciklama?.toLowerCase().includes(q) ||
        d.surum?.toLowerCase().includes(q) ||
        d.etiketler?.some((e) => e.toLowerCase().includes(q))
      )
    })
    .sort((a, b) => {
      if (sirala === 'tarih_yeni') return new Date(b.yuklemeTarihi) - new Date(a.yuklemeTarihi)
      if (sirala === 'tarih_eski') return new Date(a.yuklemeTarihi) - new Date(b.yuklemeTarihi)
      if (sirala === 'ad_az') return a.ad.localeCompare(b.ad, 'tr')
      if (sirala === 'boyut') return b.boyut - a.boyut
      return 0
    })

  const kategoriSayisi = (kid) =>
    kid === 'hepsi' ? meta.length : meta.filter((d) => d.kategori === kid).length

  return (
    <div
      className="p-6 min-h-screen"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Sürükle overlay */}
      {surukle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(1,118,211,0.15)', backdropFilter: 'blur(4px)', border: '3px dashed var(--primary)' }}>
          <div className="text-center">
            <p className="text-5xl mb-3">📂</p>
            <p className="text-xl font-bold text-indigo-700">Dosyayı bırakın</p>
          </div>
        </div>
      )}

      {/* Önizleme Modal */}
      {onizlemeDok && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} onClick={() => setOnizlemeDok(null)}>
          <div className="bg-white rounded-2xl overflow-hidden shadow-2xl max-w-4xl w-full max-h-screen" style={{ maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <p className="font-semibold text-gray-800">{onizlemeDok.ad}</p>
                <p className="text-xs text-gray-400">{onizlemeDok.orijinalAd} · {boyutFormat(onizlemeDok.boyut)}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => indir(onizlemeDok)} className="text-sm px-4 py-2 rounded-xl text-white" style={{ background: 'var(--primary)' }}>⬇ İndir</button>
                <button onClick={() => setOnizlemeDok(null)} className="text-sm px-4 py-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50">✕ Kapat</button>
              </div>
            </div>
            <div className="overflow-auto" style={{ maxHeight: 'calc(90vh - 72px)' }}>
              {onizlemeDok.tur === 'application/pdf' && (
                <iframe src={onizlemeDok.icerik} className="w-full" style={{ height: '70vh' }} title="Önizleme" />
              )}
              {onizlemeDok.tur?.startsWith('image/') && (
                <div className="flex items-center justify-center p-6">
                  <img src={onizlemeDok.icerik} alt={onizlemeDok.ad} className="max-w-full max-h-96 rounded-xl object-contain" />
                </div>
              )}
              {onizlemeDok.tur === 'text/plain' && (
                <pre className="p-6 text-sm text-gray-700 whitespace-pre-wrap font-mono">{atob(onizlemeDok.icerik.split(',')[1] || '')}</pre>
              )}
              {!['application/pdf', 'text/plain'].includes(onizlemeDok.tur) && !onizlemeDok.tur?.startsWith('image/') && (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <p className="text-5xl mb-4">{dosyaIkonu(onizlemeDok.tur).ikon}</p>
                  <p className="text-sm">Bu dosya türü önizlenemiyor.</p>
                  <button onClick={() => indir(onizlemeDok)} className="mt-4 text-sm px-5 py-2 rounded-xl text-white" style={{ background: 'var(--primary)' }}>İndir</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Başlık */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Doküman Merkezi</h2>
          <p className="text-sm text-gray-400 mt-0.5">{meta.length} doküman · Sürükle bırak ile yükleyebilirsiniz</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(1,118,211,0.2)' }}>
            {['grid', 'liste'].map((mod) => (
              <button
                key={mod}
                onClick={() => setGorunumModu(mod)}
                className="px-3 py-2 text-xs font-medium transition-all"
                style={{
                  background: gorunumModu === mod ? 'var(--primary)' : 'transparent',
                  color: gorunumModu === mod ? 'white' : 'var(--primary)',
                }}
              >
                {mod === 'grid' ? '⊞ Grid' : '☰ Liste'}
              </button>
            ))}
          </div>
          <button
            onClick={() => setYuklePanelAcik(true)}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-1.5"
          >
            ⬆ Dosya Yükle
          </button>
        </div>
      </div>

      {/* Özet istatistik */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {KATEGORILER.map((kat) => (
          <button
            key={kat.id}
            onClick={() => setAktifKategori(kat.id)}
            className="rounded-xl p-3 text-center transition-all"
            style={{
              background: aktifKategori === kat.id ? kat.bg : 'rgba(255,255,255,0.7)',
              border: aktifKategori === kat.id ? `2px solid ${kat.renk}50` : '2px solid transparent',
              boxShadow: aktifKategori === kat.id ? `0 4px 12px ${kat.renk}20` : '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <p className="text-xl mb-1">{kat.ikon}</p>
            <p className="text-lg font-bold" style={{ color: kat.renk }}>{kategoriSayisi(kat.id)}</p>
            <p className="text-xs text-gray-500 leading-tight mt-0.5">{kat.isim}</p>
          </button>
        ))}
      </div>

      {/* Yükleme Paneli */}
      {yuklePanelAcik && (
        <div className="rounded-2xl p-6 mb-6" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(1,118,211,0.2)', boxShadow: '0 8px 32px rgba(1,118,211,0.12)' }}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-800">Yeni Doküman Yükle</h3>
            <button onClick={() => { setYuklePanelAcik(false); setSecilenDosya(null); setHata('') }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>

          {/* Mod seçici */}
          <div className="flex gap-2 mb-5 p-1 rounded-xl" style={{ background: '#f1f5f9' }}>
            {[
              { id: 'dosya', etiket: '📁 Dosya Yükle', aciklama: 'Maks 2 MB' },
              { id: 'link',  etiket: '🔗 Dış Link',   aciklama: 'Drive, SharePoint…' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => { setYukleModu(m.id); setHata('') }}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all flex flex-col items-center gap-0.5"
                style={{
                  background: yukleModu === m.id ? 'white' : 'transparent',
                  color: yukleModu === m.id ? 'var(--primary)' : '#9ca3af',
                  boxShadow: yukleModu === m.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <span>{m.etiket}</span>
                <span className="text-xs opacity-60">{m.aciklama}</span>
              </button>
            ))}
          </div>

          {/* Büyük dosya uyarısı */}
          {yukleModu === 'dosya' && (
            <div className="mb-4 px-4 py-3 rounded-xl flex items-start gap-2 text-xs" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <span className="text-base mt-0.5">⚠️</span>
              <div className="text-amber-700">
                <strong>Geliştirme ortamı kısıtı:</strong> Tarayıcı depolama limiti nedeniyle şu an maks 2 MB yüklenebilir.
                3-5 GB boyutundaki dosyalar için <strong>"Dış Link"</strong> seçeneğini kullanarak Google Drive, SharePoint veya OneDrive bağlantısı ekleyebilirsiniz.
                Backend entegrasyonu tamamlandığında bu limit tamamen kalkar.
              </div>
            </div>
          )}

          {/* Drag & Drop alanı */}
          {yukleModu === 'dosya' && (
            <div
              className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-10 mb-5 cursor-pointer transition-all"
              style={{ borderColor: secilenDosya ? '#10b981' : '#d1d5db', background: secilenDosya ? 'rgba(16,185,129,0.04)' : '#fafafa' }}
              onClick={() => dosyaInputRef.current?.click()}
            >
              <input
                ref={dosyaInputRef}
                type="file"
                className="hidden"
                accept={IZIN_VERILEN_TURLER.join(',')}
                onChange={(e) => dosyaisle(e.target.files[0])}
              />
              {secilenDosya ? (
                <div className="text-center">
                  <p className="text-3xl mb-2">{dosyaIkonu(secilenDosya.type).ikon}</p>
                  <p className="text-sm font-semibold text-green-700">{secilenDosya.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{boyutFormat(secilenDosya.size)}</p>
                  <button
                    className="mt-2 text-xs text-gray-400 hover:text-red-500"
                    onClick={(e) => { e.stopPropagation(); setSecilenDosya(null) }}
                  >
                    × Kaldır
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-4xl mb-2">📂</p>
                  <p className="text-sm font-medium text-gray-600">Dosyayı buraya sürükleyin veya tıklayın</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, PowerPoint, görsel · Maks {MAX_BOYUT_MB} MB</p>
                </div>
              )}
            </div>
          )}

          {/* Dış Link modu */}
          {yukleModu === 'link' && (
            <div className="mb-5">
              <label className="text-sm text-gray-600 mb-1 block">Dosya Linki *</label>
              <input
                type="url"
                value={form.disLink}
                onChange={(e) => setForm({ ...form, disLink: e.target.value })}
                className="premium-input"
                placeholder="https://drive.google.com/... veya https://sharepoint.com/..."
              />
              <p className="text-xs text-gray-400 mt-1.5">
                Google Drive, Microsoft SharePoint, OneDrive, Dropbox veya herhangi bir erişilebilir URL
              </p>
            </div>
          )}

          {hata && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              ⚠️ {hata}
            </div>
          )}

          {/* Form alanları */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Doküman Adı *</label>
              <input
                type="text"
                value={form.ad}
                onChange={(e) => setForm({ ...form, ad: e.target.value })}
                className="premium-input"
                placeholder="Açıklayıcı bir isim verin"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Kategori *</label>
              <CustomSelect
                value={form.kategori}
                onChange={(e) => setForm({ ...form, kategori: e.target.value })}
                className="premium-input"
              >
                {KATEGORILER.map((k) => (
                  <option key={k.id} value={k.id}>{k.ikon} {k.isim}</option>
                ))}
              </CustomSelect>
            </div>

            {form.kategori === 'yazilim_guncelleme' && (
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Sürüm No</label>
                <input
                  type="text"
                  value={form.surum}
                  onChange={(e) => setForm({ ...form, surum: e.target.value })}
                  className="premium-input"
                  placeholder="v2.4.1"
                />
              </div>
            )}

            <div className={form.kategori === 'yazilim_guncelleme' ? '' : 'md:col-span-2'}>
              <label className="text-sm text-gray-600 mb-1 block">Etiketler</label>
              <input
                type="text"
                value={form.etiketler}
                onChange={(e) => setForm({ ...form, etiketler: e.target.value })}
                className="premium-input"
                placeholder="Virgülle ayırın: CCTV, NVR, 2026"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm text-gray-600 mb-1 block">Açıklama</label>
              <textarea
                value={form.aciklama}
                onChange={(e) => setForm({ ...form, aciklama: e.target.value })}
                className="premium-input"
                rows={3}
                placeholder="Bu doküman hakkında kısa açıklama..."
              />
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            <button
              onClick={kaydet}
              disabled={yukleniyor || (yukleModu === 'dosya' && !secilenDosya)}
              className="px-6 py-2.5 rounded-xl text-sm text-white font-medium transition disabled:opacity-50 flex items-center gap-2"
              style={{ background: 'var(--primary)', boxShadow: '0 4px 12px rgba(1,118,211,0.35)' }}
            >
              {yukleniyor ? '⏳ Yükleniyor...' : '⬆ Yükle'}
            </button>
            <button
              onClick={() => { setYuklePanelAcik(false); setSecilenDosya(null); setHata('') }}
              className="px-5 py-2.5 rounded-xl border text-sm text-gray-600 hover:bg-gray-50 transition"
              style={{ border: '1px solid #e5e7eb' }}
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {/* Filtreler */}
      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <div className="flex gap-1.5 flex-wrap">
          {[{ id: 'hepsi', isim: 'Tümü', ikon: '📚' }, ...KATEGORILER].map((kat) => (
            <button
              key={kat.id}
              onClick={() => setAktifKategori(kat.id)}
              className="text-sm px-3 py-1.5 rounded-xl border transition font-medium flex items-center gap-1"
              style={{
                background: aktifKategori === kat.id ? 'var(--primary)' : 'white',
                color: aktifKategori === kat.id ? 'white' : '#6b7280',
                borderColor: aktifKategori === kat.id ? 'transparent' : '#e5e7eb',
              }}
            >
              {kat.ikon} {kat.isim}
              <span className="opacity-70 text-xs">({kategoriSayisi(kat.id)})</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          <input
            type="text"
            value={aramaMetni}
            onChange={(e) => setAramaMetni(e.target.value)}
            placeholder="Ara..."
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-40"
          />
          <CustomSelect
            value={sirala}
            onChange={(e) => setSirala(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="tarih_yeni">En Yeni</option>
            <option value="tarih_eski">En Eski</option>
            <option value="ad_az">A → Z</option>
            <option value="boyut">Boyut</option>
          </CustomSelect>
        </div>
      </div>

      {/* Boş durum */}
      {filtreliDokuman.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <p className="text-5xl mb-4">📂</p>
          <p className="text-base font-medium text-gray-500">
            {aramaMetni ? 'Arama sonucu bulunamadı' : 'Bu kategoride henüz doküman yok'}
          </p>
          <p className="text-sm mt-1">
            {!aramaMetni && 'Dosyayı sürükleyip bırakın veya "Dosya Yükle" butonuna tıklayın'}
          </p>
          {!aramaMetni && (
            <button
              onClick={() => setYuklePanelAcik(true)}
              className="mt-4 text-sm px-5 py-2.5 rounded-xl text-white"
              style={{ background: 'var(--primary)' }}
            >
              İlk Dokümanı Yükle
            </button>
          )}
        </div>
      )}

      {/* Grid Görünüm */}
      {gorunumModu === 'grid' && filtreliDokuman.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtreliDokuman.map((dok) => {
            const ikon = dosyaIkonu(dok.tur)
            const kat = KATEGORILER.find((k) => k.id === dok.kategori)
            return (
              <div key={dok.id}>
                <div
                  className="rounded-2xl p-5 flex flex-col gap-3 transition-all hover-lift"
                  style={{
                    background: 'rgba(255,255,255,0.92)',
                    border: '1px solid rgba(1,118,211,0.1)',
                    boxShadow: '0 2px 8px rgba(1,118,211,0.06)',
                  }}
                >
                  {/* Dosya ikon */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                    style={{ background: `${ikon.renk}15` }}
                  >
                    {ikon.ikon}
                  </div>

                  {/* Bilgiler */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">{dok.ad}</p>
                    {dok.surum && (
                      <span className="text-xs font-mono text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded mt-1 inline-block">{dok.surum}</span>
                    )}
                    {dok.aciklama && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">{dok.aciklama}</p>
                    )}
                  </div>

                  {/* Etiketler */}
                  {dok.etiketler?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {dok.etiketler.slice(0, 3).map((e) => (
                        <span key={e} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{e}</span>
                      ))}
                    </div>
                  )}

                  {/* Alt bilgi */}
                  <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid rgba(1,118,211,0.08)' }}>
                    <div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: kat?.bg, color: kat?.renk }}>
                        {kat?.ikon} {kat?.isim.split(' ')[0]}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">{boyutFormat(dok.boyut)}</span>
                  </div>

                  <p className="text-xs text-gray-400">
                    {dok.yukleyenAd} · {new Date(dok.yuklemeTarihi).toLocaleDateString('tr-TR')}
                  </p>

                  {/* Aksiyon butonları */}
                  <div className="flex gap-2">
                    {dok.tur === 'link' ? (
                      <button
                        onClick={() => disLinkAc(dok)}
                        className="flex-1 text-xs py-2 rounded-lg text-white transition font-medium flex items-center justify-center gap-1"
                        style={{ background: 'var(--primary)' }}
                      >
                        🔗 Aç
                      </button>
                    ) : (
                      <>
                        {(['application/pdf', 'text/plain'].includes(dok.tur) || dok.tur?.startsWith('image/')) && (
                          <button
                            onClick={() => onizle(dok)}
                            className="flex-1 text-xs py-2 rounded-lg border transition font-medium"
                            style={{ color: 'var(--primary)', borderColor: 'rgba(1,118,211,0.25)', background: 'rgba(1,118,211,0.04)' }}
                          >
                            👁 Önizle
                          </button>
                        )}
                        <button
                          onClick={() => indir(dok)}
                          className="flex-1 text-xs py-2 rounded-lg text-white transition font-medium"
                          style={{ background: 'var(--primary)' }}
                        >
                          ⬇ İndir
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setSilOnayId(dok.id)}
                      className="text-xs px-2.5 py-2 rounded-lg border transition"
                      style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}
                    >
                      🗑
                    </button>
                  </div>
                </div>

                {/* Silme onayı */}
                {silOnayId === dok.id && (
                  <div className="mt-1 px-4 py-3 rounded-xl bg-red-50 border border-red-100 flex items-center gap-2 text-sm">
                    <span className="flex-1 text-red-700 text-xs">Bu dokümanı sil?</span>
                    <button onClick={() => sil(dok.id)} className="text-xs text-red-600 font-semibold px-3 py-1 border border-red-200 rounded-lg">Evet</button>
                    <button onClick={() => setSilOnayId(null)} className="text-xs text-gray-500 px-3 py-1 border border-gray-200 rounded-lg">İptal</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Liste Görünüm */}
      {gorunumModu === 'liste' && filtreliDokuman.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(1,118,211,0.1)', boxShadow: '0 4px 24px rgba(1,118,211,0.07)' }}>
          <div className="grid gap-x-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide" style={{ gridTemplateColumns: '2fr 1.2fr 0.8fr 1fr auto' }}>
            <div>Doküman</div><div>Kategori</div><div>Boyut</div><div>Tarih</div><div></div>
          </div>
          {filtreliDokuman.map((dok) => {
            const ikon = dosyaIkonu(dok.tur)
            const kat = KATEGORILER.find((k) => k.id === dok.kategori)
            return (
              <div key={dok.id}>
                <div
                  className="grid gap-x-4 px-5 py-3 border-b border-gray-50 hover:bg-gray-50 transition items-center"
                  style={{ gridTemplateColumns: '2fr 1.2fr 0.8fr 1fr auto' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl flex-shrink-0">{ikon.ikon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{dok.ad}</p>
                      {dok.surum && <span className="text-xs font-mono text-indigo-500">{dok.surum} · </span>}
                      <span className="text-xs text-gray-400 truncate">{dok.orijinalAd}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: kat?.bg, color: kat?.renk }}>
                      {kat?.ikon} {kat?.isim}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">{boyutFormat(dok.boyut)}</div>
                  <div>
                    <p className="text-sm text-gray-500">{new Date(dok.yuklemeTarihi).toLocaleDateString('tr-TR')}</p>
                    <p className="text-xs text-gray-400">{dok.yukleyenAd}</p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    {dok.tur === 'link' ? (
                      <button onClick={() => disLinkAc(dok)} className="text-xs px-3 py-1.5 rounded-lg text-white transition" style={{ background: 'var(--primary)' }}>🔗 Aç</button>
                    ) : (
                      <>
                        {(['application/pdf', 'text/plain'].includes(dok.tur) || dok.tur?.startsWith('image/')) && (
                          <button onClick={() => onizle(dok)} className="text-xs px-3 py-1.5 rounded-lg border transition" style={{ color: 'var(--primary)', borderColor: 'rgba(1,118,211,0.25)' }}>Önizle</button>
                        )}
                        <button onClick={() => indir(dok)} className="text-xs px-3 py-1.5 rounded-lg text-white transition" style={{ background: 'var(--primary)' }}>⬇ İndir</button>
                      </>
                    )}
                    <button onClick={() => setSilOnayId(dok.id)} className="text-xs px-2.5 py-1.5 rounded-lg border transition" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}>🗑</button>
                  </div>
                </div>
                {silOnayId === dok.id && (
                  <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex items-center gap-3 text-sm">
                    <span className="flex-1 text-red-700 text-xs font-medium">"{dok.ad}" silinecek. Emin misiniz?</span>
                    <button onClick={() => sil(dok.id)} className="text-xs text-red-600 font-semibold px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-100 transition">Evet, Sil</button>
                    <button onClick={() => setSilOnayId(null)} className="text-xs text-gray-500 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition">İptal</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
