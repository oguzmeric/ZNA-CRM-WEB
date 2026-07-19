// "Notlarım" — kişisel notlar (opsiyonel müşteri bağlantılı).
// UI: grid layout (Google Keep tarzı), kart tıklayınca modal'da düzenle.
// Web tarafında sadece metin oluşturma/düzenleme. Mobile'dan eklenen çizimleri görüntüler.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Plus, Trash2, StickyNote, Image as ImageIcon, X, Building2, Search,
  Paperclip, FileText, File as FileIcon, Bell, Upload, Mic, Square, Loader2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import ReactQuill, { Quill } from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'

// Quill'e ekstra fontları register et — default sadece sans-serif/serif/monospace var.
// Bu blok modül seviyesinde bir kez çalışır.
const QUILL_FONTS = [
  'sans-serif', 'serif', 'monospace',
  'arial', 'times-new-roman', 'georgia', 'tahoma', 'verdana',
  'helvetica', 'courier-new', 'trebuchet-ms', 'comic-sans-ms', 'impact',
  'roboto', 'open-sans', 'lato', 'montserrat', 'poppins',
]
const QUILL_SIZES = ['8px', '10px', '12px', '14px', '16px', '18px', '20px', '24px', '32px', '48px']

try {
  const Font = Quill.import('formats/font')
  Font.whitelist = QUILL_FONTS
  Quill.register(Font, true)

  const Size = Quill.import('attributors/style/size')
  Size.whitelist = QUILL_SIZES
  Quill.register(Size, true)
} catch (e) {
  // SSR/StrictMode'da iki kez register'da uyarı verir, yutuyoruz
}

// Etiket isimleri için human-friendly map
const FONT_ETIKETLER = {
  'sans-serif':     'Sans Serif',
  'serif':          'Serif',
  'monospace':      'Monospace',
  'arial':          'Arial',
  'times-new-roman': 'Times New Roman',
  'georgia':        'Georgia',
  'tahoma':         'Tahoma',
  'verdana':        'Verdana',
  'helvetica':      'Helvetica',
  'courier-new':    'Courier New',
  'trebuchet-ms':   'Trebuchet MS',
  'comic-sans-ms':  'Comic Sans MS',
  'impact':         'Impact',
  'roboto':         'Roboto',
  'open-sans':      'Open Sans',
  'lato':           'Lato',
  'montserrat':     'Montserrat',
  'poppins':        'Poppins',
}
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  Card, Button, Input, Textarea, Label, Badge, SearchInput, EmptyState, Modal, TarihSaatSecici,
} from '../components/ui'
import CustomSelect from '../components/CustomSelect'
import {
  KATEGORILER, notlarimiGetir, notEkle, notGuncelle, notSil, cizimSignedUrl,
  ekSignedUrl, ekYukleWeb, ekSil,
} from '../services/notService'
import { musterileriGetir } from '../services/musteriService'
import { trContains } from '../lib/trSearch'
import { htmlMi, htmlToDuzMetin, duzMetinToHtml } from '../lib/notIcerik'
import { invalidate } from '../lib/cache'

function tarihFormat(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const BOS_FORM = {
  baslik: '', icerik: '', kategori: 'diger', musteriId: '',
  cizimler: [], ekler: [], hatirlatmaTarihi: '',
}

function ekIkon(ek) {
  if (ek?.tip === 'foto') return <ImageIcon size={14} />
  const mime = ek?.mimeType || ''
  if (mime.startsWith('image/')) return <ImageIcon size={14} />
  if (mime.includes('pdf')) return <FileText size={14} />
  return <FileIcon size={14} />
}

function ekBoyutFormat(byte) {
  if (!byte) return ''
  if (byte < 1024) return `${byte} B`
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(0)} KB`
  return `${(byte / 1024 / 1024).toFixed(1)} MB`
}

// datetime-local input için ISO ⇄ yyyy-mm-ddThh:mm dönüşüm
function isoToLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function localToIso(local) {
  if (!local) return ''
  const d = new Date(local)
  if (isNaN(d.getTime())) return ''
  return d.toISOString()
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

  // ── Sesli not (Groq Whisper) ────────────────────────────────────────────
  // Tarayıcı mikrofonuyla kayıt → sesten-metin edge fn → metin içeriğe eklenir,
  // ses dosyası da nota ek olarak iliştirilir (orijinali dinlenebilsin).
  const [sesDurum, setSesDurum] = useState('bos') // bos | kayit | cozuluyor
  const [sesSure, setSesSure] = useState(0)
  const kayitciRef = useRef(null)
  const parcalarRef = useRef([])
  const sesTimerRef = useRef(null)

  const htmlKacir = (s) => String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const sesKaydiBaslat = async () => {
    try {
      const akis = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '')
      const kayitci = new MediaRecorder(akis, mime ? { mimeType: mime } : undefined)
      parcalarRef.current = []
      kayitci.ondataavailable = (e) => { if (e.data?.size) parcalarRef.current.push(e.data) }
      kayitci.onstop = async () => {
        akis.getTracks().forEach((t) => t.stop())
        clearInterval(sesTimerRef.current)
        const blob = new Blob(parcalarRef.current, { type: kayitci.mimeType || 'audio/webm' })
        parcalarRef.current = []
        if (blob.size < 1000) { setSesDurum('bos'); setSesSure(0); return } // boş/anlık tık
        await sesiCoz(blob)
      }
      kayitciRef.current = kayitci
      kayitci.start()
      setSesSure(0)
      setSesDurum('kayit')
      sesTimerRef.current = setInterval(() => setSesSure((s) => s + 1), 1000)
    } catch (e) {
      toast.error('Mikrofona erişilemedi — tarayıcı izni gerekli')
    }
  }

  const sesKaydiDurdur = () => {
    if (kayitciRef.current?.state === 'recording') kayitciRef.current.stop()
  }

  const sesiCoz = async (blob) => {
    setSesDurum('cozuluyor')
    try {
      const uzanti = blob.type.includes('mp4') ? 'm4a' : 'webm'
      const dosya = new File([blob], `sesli-not-${Date.now()}.${uzanti}`, { type: blob.type })

      const fd = new FormData()
      fd.append('ses', dosya)
      fd.append('dil', 'tr')
      const { data, error } = await supabase.functions.invoke('sesten-metin', { body: fd })
      if (error || !data?.ok) {
        const hata = data?.hata === 'limit'
          ? 'Günlük ücretsiz çeviri limiti doldu — yarın tekrar dene'
          : (data?.hata || error?.message || 'çevrilemedi')
        throw new Error(hata)
      }
      const metin = (data.metin || '').trim()
      if (!metin) {
        toast.error('Kayıtta konuşma algılanamadı')
        return
      }

      // Metni içeriğin sonuna paragraf olarak ekle; ses dosyasını da ek yap
      const ek = await ekYukleWeb({ file: dosya, kullaniciId: kullanici.id, notId: duzenleId })
      setForm((f) => ({
        ...f,
        icerik: `${f.icerik || ''}<p>${htmlKacir(metin)}</p>`,
        ekler: ek ? [...(f.ekler || []), { ...ek, tip: 'ses' }] : (f.ekler || []),
      }))
      toast.success('Sesli not metne çevrildi')
    } catch (e) {
      toast.error('Ses çözülemedi: ' + (e?.message ?? 'bilinmeyen'))
    } finally {
      setSesDurum('bos')
      setSesSure(0)
    }
  }

  // Modal kapanırsa aktif kaydı iptal et (çözmeye çalışma)
  useEffect(() => {
    if (!modalAcik && kayitciRef.current?.state === 'recording') {
      kayitciRef.current.onstop = null
      kayitciRef.current.stop()
      kayitciRef.current.stream?.getTracks?.().forEach((t) => t.stop())
      clearInterval(sesTimerRef.current)
      setSesDurum('bos')
      setSesSure(0)
    }
  }, [modalAcik])

  const sureFormat = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

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
      // İçerik HTML olabilir (Quill) — arama düz metin üzerinde yapılsın
      // ("65 usd" araması "65&nbsp;usd" kaydını da bulsun)
      if (arama && !trContains([n.baslik, htmlToDuzMetin(n.icerik), n.musteriFirma].join(' '), arama)) return false
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
      // Mobilden gelen eski düz metin notlarda Quill \n'leri yutuyordu —
      // HTML değilse paragraf HTML'ine sarıp aç (satırlar korunur)
      icerik: htmlMi(n.icerik) ? (n.icerik || '') : duzMetinToHtml(n.icerik || ''),
      kategori: n.kategori || 'diger',
      musteriId: n.musteriId || '',
      cizimler: n.cizimler || [],
      ekler: n.ekler || [],
      hatirlatmaTarihi: n.hatirlatmaTarihi || '',
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
            const ekSayisi = Array.isArray(n.ekler) ? n.ekler.length : 0
            const hatirlatma = n.hatirlatmaTarihi ? new Date(n.hatirlatmaTarihi) : null
            const hatirlatmaGecmis = hatirlatma && hatirlatma.getTime() < Date.now()
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
                    {hatirlatma && (
                      <span title={hatirlatma.toLocaleString('tr-TR')} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        font: '500 10px/14px var(--font-sans)',
                        color: hatirlatmaGecmis ? '#dc2626' : '#f59e0b',
                      }}>
                        <Bell size={10} />
                      </span>
                    )}
                    {ekSayisi > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, font: '500 10px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                        <Paperclip size={10} /> {ekSayisi}
                      </span>
                    )}
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
                    {/* HTML'i strip ederek plain text önizle */}
                    {htmlToDuzMetin(n.icerik).replace(/\s+/g, ' ').trim()}
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Label style={{ marginBottom: 0 }}>İçerik</Label>
              {sesDurum === 'bos' && (
                <button
                  type="button"
                  onClick={sesKaydiBaslat}
                  title="Konuş, yazıya çevrilsin (ses dosyası da nota eklenir)"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 12px', cursor: 'pointer',
                    background: 'var(--brand-primary-soft)', color: 'var(--brand-primary)',
                    border: '1px solid var(--brand-primary)', borderRadius: 'var(--radius-sm)',
                    font: '600 12px/16px var(--font-sans)',
                  }}
                >
                  <Mic size={13} /> Sesli Not
                </button>
              )}
              {sesDurum === 'kayit' && (
                <button
                  type="button"
                  onClick={sesKaydiDurdur}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 12px', cursor: 'pointer',
                    background: 'var(--danger)', color: '#fff',
                    border: 'none', borderRadius: 'var(--radius-sm)',
                    font: '600 12px/16px var(--font-sans)',
                  }}
                >
                  <Square size={12} fill="#fff" />
                  Kaydı Bitir · <span className="tabular-nums">{sureFormat(sesSure)}</span>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', background: '#fff',
                    animation: 'pulse 1s ease-in-out infinite',
                  }} />
                </button>
              )}
              {sesDurum === 'cozuluyor' && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 12px',
                  color: 'var(--text-tertiary)', font: '500 12px/16px var(--font-sans)',
                }}>
                  <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Metne çevriliyor…
                </span>
              )}
            </div>
            <div className="not-quill-wrap">
              <ReactQuill
                theme="snow"
                value={form.icerik}
                onChange={(html) => setForm({ ...form, icerik: html })}
                placeholder="Notunu yaz…"
                modules={{
                  toolbar: [
                    [{ font: QUILL_FONTS }, { size: QUILL_SIZES }],
                    [{ header: [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ color: [] }, { background: [] }],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    [{ align: [] }],
                    [{ indent: '-1' }, { indent: '+1' }],
                    ['link', 'blockquote', 'code-block'],
                    ['clean'],
                  ],
                }}
                formats={[
                  'font', 'size', 'header',
                  'bold', 'italic', 'underline', 'strike',
                  'color', 'background',
                  // 'bullet' ayrı format değil — quill v2'de 'list' değeri
                  // olarak gelir; ayrı yazınca konsola register uyarısı düşer
                  'list', 'indent',
                  'align',
                  'link', 'blockquote', 'code-block',
                ]}
                style={{ background: 'var(--surface-card)' }}
              />
            </div>
            <style>{`
              @keyframes spin { to { transform: rotate(360deg); } }
              @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
              .not-quill-wrap .ql-toolbar {
                border-top-left-radius: 6px;
                border-top-right-radius: 6px;
                background: var(--surface-sunken);
                border-color: var(--border-default);
              }
              .not-quill-wrap .ql-container {
                border-bottom-left-radius: 6px;
                border-bottom-right-radius: 6px;
                min-height: 220px;
                font: 400 14px/22px var(--font-sans);
                border-color: var(--border-default);
              }
              .not-quill-wrap .ql-editor {
                min-height: 220px;
              }
              /* Font seçici dropdown — etiketler + render font-family */
              .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="sans-serif"]::before,
              .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="sans-serif"]::before { content: 'Sans Serif'; font-family: sans-serif; }
              .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="serif"]::before,
              .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="serif"]::before { content: 'Serif'; font-family: serif; }
              .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="monospace"]::before,
              .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="monospace"]::before { content: 'Monospace'; font-family: monospace; }
              .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="arial"]::before,
              .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="arial"]::before { content: 'Arial'; font-family: Arial, sans-serif; }
              .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="times-new-roman"]::before,
              .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="times-new-roman"]::before { content: 'Times New Roman'; font-family: 'Times New Roman', Times, serif; }
              .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="georgia"]::before,
              .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="georgia"]::before { content: 'Georgia'; font-family: Georgia, serif; }
              .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="tahoma"]::before,
              .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="tahoma"]::before { content: 'Tahoma'; font-family: Tahoma, sans-serif; }
              .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="verdana"]::before,
              .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="verdana"]::before { content: 'Verdana'; font-family: Verdana, sans-serif; }
              .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="helvetica"]::before,
              .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="helvetica"]::before { content: 'Helvetica'; font-family: Helvetica, Arial, sans-serif; }
              .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="courier-new"]::before,
              .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="courier-new"]::before { content: 'Courier New'; font-family: 'Courier New', Courier, monospace; }
              .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="trebuchet-ms"]::before,
              .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="trebuchet-ms"]::before { content: 'Trebuchet MS'; font-family: 'Trebuchet MS', sans-serif; }
              .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="comic-sans-ms"]::before,
              .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="comic-sans-ms"]::before { content: 'Comic Sans MS'; font-family: 'Comic Sans MS', cursive; }
              .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="impact"]::before,
              .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="impact"]::before { content: 'Impact'; font-family: Impact, sans-serif; }
              .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="roboto"]::before,
              .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="roboto"]::before { content: 'Roboto'; font-family: Roboto, sans-serif; }
              .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="open-sans"]::before,
              .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="open-sans"]::before { content: 'Open Sans'; font-family: 'Open Sans', sans-serif; }
              .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="lato"]::before,
              .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="lato"]::before { content: 'Lato'; font-family: Lato, sans-serif; }
              .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="montserrat"]::before,
              .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="montserrat"]::before { content: 'Montserrat'; font-family: Montserrat, sans-serif; }
              .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="poppins"]::before,
              .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="poppins"]::before { content: 'Poppins'; font-family: Poppins, sans-serif; }

              /* Editor içinde her font ile gerçekten render olsun */
              .ql-font-sans-serif { font-family: sans-serif; }
              .ql-font-serif { font-family: serif; }
              .ql-font-monospace { font-family: monospace; }
              .ql-font-arial { font-family: Arial, sans-serif; }
              .ql-font-times-new-roman { font-family: 'Times New Roman', Times, serif; }
              .ql-font-georgia { font-family: Georgia, serif; }
              .ql-font-tahoma { font-family: Tahoma, sans-serif; }
              .ql-font-verdana { font-family: Verdana, sans-serif; }
              .ql-font-helvetica { font-family: Helvetica, Arial, sans-serif; }
              .ql-font-courier-new { font-family: 'Courier New', Courier, monospace; }
              .ql-font-trebuchet-ms { font-family: 'Trebuchet MS', sans-serif; }
              .ql-font-comic-sans-ms { font-family: 'Comic Sans MS', cursive; }
              .ql-font-impact { font-family: Impact, sans-serif; }
              .ql-font-roboto { font-family: Roboto, sans-serif; }
              .ql-font-open-sans { font-family: 'Open Sans', sans-serif; }
              .ql-font-lato { font-family: Lato, sans-serif; }
              .ql-font-montserrat { font-family: Montserrat, sans-serif; }
              .ql-font-poppins { font-family: Poppins, sans-serif; }

              /* Punto dropdown — boyut etiketleri görünür olsun */
              .ql-snow .ql-picker.ql-size .ql-picker-label::before,
              .ql-snow .ql-picker.ql-size .ql-picker-item::before {
                content: attr(data-value) !important;
              }
              .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="8px"]::before,
              .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="8px"]::before { font-size: 9px; }
              .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="10px"]::before,
              .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="10px"]::before { font-size: 10px; }
              .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="12px"]::before,
              .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="12px"]::before { font-size: 12px; }
              .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="14px"]::before,
              .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="14px"]::before { font-size: 14px; }
              .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="16px"]::before,
              .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="16px"]::before { font-size: 16px; }
              .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="18px"]::before,
              .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="18px"]::before { font-size: 18px; }
              .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="20px"]::before,
              .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="20px"]::before { font-size: 20px; }
              .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="24px"]::before,
              .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="24px"]::before { font-size: 22px; }
              .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="32px"]::before,
              .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="32px"]::before { font-size: 24px; }
              .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="48px"]::before,
              .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="48px"]::before { font-size: 26px; }
            `}</style>
          </div>

          {/* Hatırlatma */}
          <div>
            <Label>
              <Bell size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Hatırlatıcı (opsiyonel)
            </Label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <TarihSaatSecici
                value={isoToLocal(form.hatirlatmaTarihi)}
                onChange={(v) => setForm({ ...form, hatirlatmaTarihi: localToIso(v) })}
                style={{ flex: 1 }}
              />
              {form.hatirlatmaTarihi && (
                <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, hatirlatmaTarihi: '' })}>
                  Temizle
                </Button>
              )}
            </div>
            <p style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>
              Mobil cihazda local bildirim olarak görüntülenir. Web'de görsel uyarı.
            </p>
          </div>

          {/* Foto ve belge ekleri */}
          <EklerBolumu
            ekler={form.ekler}
            kullaniciId={kullanici?.id}
            notId={duzenleId}
            onEkleEklendi={(yeniEk) => setForm((f) => ({ ...f, ekler: [...(f.ekler || []), yeniEk] }))}
            onEkSilindi={(path) => setForm((f) => ({ ...f, ekler: (f.ekler || []).filter((e) => e.path !== path) }))}
          />

          {/* Mobile'dan eklenen çizimler */}
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

// EklerBolumu — foto/belge yükleme + listeleme
function EklerBolumu({ ekler = [], kullaniciId, notId, onEkleEklendi, onEkSilindi }) {
  const [yukleniyor, setYukleniyor] = useState(false)
  const [acikFotoUrl, setAcikFotoUrl] = useState(null)

  const dosyaSec = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setYukleniyor(true)
    try {
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
          alert(`${file.name} 10MB'tan büyük, atlanıyor.`)
          continue
        }
        const sonuc = await ekYukleWeb({ file, kullaniciId, notId })
        if (sonuc) onEkleEklendi(sonuc)
      }
    } finally {
      setYukleniyor(false)
      e.target.value = ''  // input reset
    }
  }

  const ekAc = async (ek) => {
    const url = await ekSignedUrl(ek.path)
    if (!url) return alert('Dosya açılamadı')
    if (ek.tip === 'foto' || ek.mimeType?.startsWith('image/')) {
      setAcikFotoUrl(url)
    } else {
      window.open(url, '_blank')
    }
  }

  const ekKaldir = async (ek) => {
    if (!window.confirm(`"${ek.ad}" silinsin mi?`)) return
    await ekSil(ek.path)
    onEkSilindi(ek.path)
  }

  return (
    <div>
      <Label>
        <Paperclip size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Ekler {ekler.length > 0 ? `(${ekler.length})` : ''}
      </Label>

      <label style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 14px',
        background: 'var(--brand-primary-soft)',
        color: 'var(--brand-primary)',
        border: '1px dashed var(--brand-primary)',
        borderRadius: 'var(--radius-sm)',
        font: '500 12px/16px var(--font-sans)',
        cursor: yukleniyor ? 'wait' : 'pointer',
        opacity: yukleniyor ? 0.6 : 1,
        marginBottom: 8,
      }}>
        <Upload size={14} />
        {yukleniyor ? 'Yükleniyor…' : 'Foto / Belge Ekle'}
        <input
          type="file"
          multiple
          accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv"
          onChange={dosyaSec}
          disabled={yukleniyor}
          style={{ display: 'none' }}
        />
      </label>

      {ekler.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {ekler.map((ek, i) => (
            <EkKart key={ek.path || i} ek={ek} onAc={() => ekAc(ek)} onSil={() => ekKaldir(ek)} />
          ))}
        </div>
      )}

      {acikFotoUrl && (
        <div
          onClick={() => setAcikFotoUrl(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1200,
            background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <button onClick={() => setAcikFotoUrl(null)} style={{
            position: 'absolute', top: 16, right: 16,
            width: 40, height: 40, borderRadius: 20, background: 'rgba(255,255,255,0.15)',
            border: 'none', color: '#fff', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}><X size={20} /></button>
          <img src={acikFotoUrl} alt="" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain' }} />
        </div>
      )}
    </div>
  )
}

function EkKart({ ek, onAc, onSil }) {
  const [fotoUrl, setFotoUrl] = useState(null)
  const isFoto = ek?.tip === 'foto' || ek?.mimeType?.startsWith('image/')

  useEffect(() => {
    if (!isFoto) return
    ekSignedUrl(ek.path).then(setFotoUrl)
  }, [ek.path, isFoto])

  return (
    <div style={{
      position: 'relative',
      width: 140, padding: 10,
      background: 'var(--surface-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-sm)',
      cursor: 'pointer',
    }}>
      <div onClick={onAc} style={{ cursor: 'pointer' }}>
        {isFoto ? (
          <div style={{
            width: '100%', height: 80,
            background: '#fff',
            border: '1px solid var(--border-default)',
            borderRadius: 6,
            overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 6,
          }}>
            {fotoUrl ? (
              <img src={fotoUrl} alt={ek.ad} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <ImageIcon size={20} style={{ color: 'var(--text-tertiary)' }} />
            )}
          </div>
        ) : (
          <div style={{
            width: '100%', height: 80,
            background: 'var(--surface-sunken)',
            borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 6,
          }}>
            {ekIkon(ek)}
          </div>
        )}
        <div style={{
          font: '500 11px/14px var(--font-sans)',
          color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{ek.ad}</div>
        <div style={{ font: '400 10px/12px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>
          {ekBoyutFormat(ek.boyut)}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onSil() }}
        style={{
          position: 'absolute', top: -6, right: -6,
          width: 22, height: 22, borderRadius: 11,
          background: '#ef4444', border: '2px solid var(--surface-base)',
          color: '#fff', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <X size={12} />
      </button>
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
