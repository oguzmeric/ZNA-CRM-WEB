// Bağımsız SN havuzundan bu ürüne TOPLU atama (mig 317).
//
// Akış: SN'siz ürünler için barkodlar önceden üretilip basılıyor
// (BagimsizSnEtiketleri). Bu modal, o havuzdan seçilen barkodları okuyucusuz,
// ekrandan bir stok koduna atar — her seçim 'depoda' durumunda stok kalemi
// olur, giriş hareketini köprü trigger yazar.
//
// Kısmi sonuç ŞEFFAF (sessiz-hata listesi md.1): RPC {eklenen, atlanan[]}
// döner; atlanan her SN sebebiyle listelenir — "12 seçtim 10 oldu" muğlaklığı
// yaşanmaz.

import { useEffect, useRef, useState } from 'react'
import { Layers, Search, CheckSquare, Square, AlertTriangle } from 'lucide-react'
import { Modal, Button, Input, Alert, Badge } from './ui'
import { atanabilirSnleriGetir, snleriStogaAta } from '../services/bagimsizSnService'
import { useToast } from '../context/ToastContext'

const tarihKisa = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'

export default function SnHavuzAtaModal({ open, onClose, urun, onEklendi }) {
  const { toast } = useToast()
  const [liste, setListe] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState('')
  const [arama, setArama] = useState('')
  const [secili, setSecili] = useState(() => new Set())
  const [ataniyor, setAtaniyor] = useState(false)
  const [sonuc, setSonuc] = useState(null)   // { eklenen, atlanan[] }
  // Çift tıklama kilidi — mükerrer kayıt koruması deseni (useRef, state değil:
  // state güncellemesi asenkron, ikinci tık araya sızabilir).
  const kilitRef = useRef(false)

  const yukle = async (aramaMetni = '') => {
    try {
      const veri = await atanabilirSnleriGetir({ arama: aramaMetni })
      setListe(veri)
      setHata('')
    } catch (e) {
      setHata(e?.message || 'Havuz yüklenemedi.')
    } finally {
      setYukleniyor(false)
    }
  }

  // Açılışta yükle + durumu sıfırla (setState'ler await'in ardında —
  // cascading render kuralı)
  useEffect(() => {
    if (!open) return
    let iptal = false
    ;(async () => {
      try {
        const veri = await atanabilirSnleriGetir({})
        if (iptal) return
        // Sıfırlama await'in ARDINDA — effect gövdesinde senkron setState
        // cascading render kuralına takılır (kendi kontrol listem md.:))
        setListe(veri); setHata(''); setSecili(new Set()); setSonuc(null); setArama('')
      } catch (e) {
        if (!iptal) setHata(e?.message || 'Havuz yüklenemedi.')
      } finally {
        if (!iptal) setYukleniyor(false)
      }
    })()
    return () => { iptal = true }
  }, [open])

  // Arama: 300ms debounce, sunucu tarafı (havuz 200 sınırının dışını da bulur)
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => { yukle(arama) }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arama])

  const toggle = (id) => {
    setSecili(prev => {
      const yeni = new Set(prev)
      if (yeni.has(id)) yeni.delete(id); else yeni.add(id)
      return yeni
    })
  }
  const gorunenler = liste
  const hepsiSecili = gorunenler.length > 0 && gorunenler.every(s => secili.has(s.id))
  const tumunuSec = () => {
    setSecili(prev => {
      const yeni = new Set(prev)
      if (hepsiSecili) gorunenler.forEach(s => yeni.delete(s.id))
      else gorunenler.forEach(s => yeni.add(s.id))
      return yeni
    })
  }

  const seciliSayi = secili.size

  const ata = async () => {
    if (kilitRef.current) return
    if (seciliSayi === 0) { toast.warning('En az bir SN seçin.'); return }
    kilitRef.current = true
    setAtaniyor(true)
    setSonuc(null)
    try {
      const r = await snleriStogaAta(Array.from(secili), urun.stokKodu)
      setSonuc(r)
      if (r.eklenen > 0) {
        toast.success(`${r.eklenen} SN "${urun.stokKodu}" stokuna eklendi.`)
        onEklendi?.()
      }
      if ((r.atlanan?.length ?? 0) > 0 && r.eklenen === 0) {
        toast.warning('Hiçbir SN eklenemedi — sebepler listede.')
      }
      setSecili(new Set())
      yukle(arama)
    } catch (e) {
      setHata(e?.message || 'Atama başarısız.')
      toast.error(e?.message || 'Atama başarısız.')
    } finally {
      setAtaniyor(false)
      kilitRef.current = false
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={640}
      title={`Havuzdan S/N Ata — ${urun?.stokKodu || ''}`}
    >
      <div style={{ font: '400 12px/17px var(--font-sans)', color: 'var(--text-tertiary)', marginBottom: 12 }}>
        Önceden üretilip etiketi basılan barkodları okuyucusuz, buradan seçerek{' '}
        <strong>{urun?.stokAdi || urun?.stokKodu}</strong> stokuna ekleyin.
        Her seçim <strong>depoda</strong> durumunda bir stok kalemi olur; giriş hareketi otomatik işlenir.
      </div>

      {hata && (
        <Alert variant="danger" icon={<AlertTriangle size={14} strokeWidth={1.5} />} style={{ marginBottom: 10 }}>
          {hata}
        </Alert>
      )}

      {sonuc && (
        <div style={{
          border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
          padding: '10px 12px', marginBottom: 12, background: 'var(--surface-sunken)',
          font: '400 12px/18px var(--font-sans)',
        }}>
          <div style={{ fontWeight: 600, color: sonuc.eklenen > 0 ? 'var(--success)' : 'var(--warning)' }}>
            {sonuc.eklenen} eklendi{(sonuc.atlanan?.length ?? 0) > 0 ? ` · ${sonuc.atlanan.length} atlandı` : ''}
          </div>
          {(sonuc.atlanan?.length ?? 0) > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--text-secondary)' }}>
              {sonuc.atlanan.map((a, i) => (
                <li key={i}><span style={{ fontFamily: 'var(--font-mono)' }}>{a.seri_no}</span> — {a.sebep}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} strokeWidth={1.6} style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-tertiary)', pointerEvents: 'none',
          }} />
          <Input
            value={arama}
            onChange={e => setArama(e.target.value)}
            placeholder="Seri no ara… (havuzun tamamında)"
            style={{ paddingLeft: 32 }}
          />
        </div>
        <Button variant="tertiary" size="sm" onClick={tumunuSec} disabled={gorunenler.length === 0}>
          {hepsiSecili ? 'Seçimi temizle' : `Görünenleri seç (${gorunenler.length})`}
        </Button>
      </div>

      <div style={{
        border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
        maxHeight: 320, overflow: 'auto', background: 'var(--surface-sunken)',
      }}>
        {yukleniyor ? (
          <div style={{ padding: 18, textAlign: 'center', color: 'var(--text-tertiary)', font: '400 13px/18px var(--font-sans)' }}>
            Havuz yükleniyor…
          </div>
        ) : gorunenler.length === 0 ? (
          <div style={{ padding: 18, textAlign: 'center', color: 'var(--text-tertiary)', font: '400 13px/18px var(--font-sans)' }}>
            {arama
              ? 'Aramaya uyan atanabilir SN yok.'
              : 'Havuzda atanabilir SN kalmadı. Önce "Bağımsız SN Etiketleri" sayfasından üretin.'}
          </div>
        ) : gorunenler.map(s => {
          const isaretli = secili.has(s.id)
          return (
            <button
              key={s.id} type="button" onClick={() => toggle(s.id)}
              style={{
                display: 'flex', width: '100%', alignItems: 'center', gap: 10,
                padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--border-default)',
                background: isaretli ? 'rgba(59,130,246,0.08)' : 'transparent',
                cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)',
              }}
            >
              {isaretli
                ? <CheckSquare size={16} strokeWidth={1.6} color="#3b82f6" />
                : <Square size={16} strokeWidth={1.6} color="var(--text-tertiary)" />}
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13 }}>{s.seriNo}</span>
              {!s.etiketBasildi && <Badge tone="uyari">etiket basılmadı</Badge>}
              {s.urunAdi && (
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.urunAdi}
                </span>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                {tarihKisa(s.olusturmaTarih)}{s.olusturanAd ? ` · ${s.olusturanAd}` : ''}
              </span>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={onClose} disabled={ataniyor}>Kapat</Button>
        <Button
          variant="primary"
          iconLeft={<Layers size={14} strokeWidth={1.7} />}
          onClick={ata}
          disabled={ataniyor || seciliSayi === 0}
        >
          {ataniyor ? 'Atanıyor…' : `Stoka Ata (${seciliSayi})`}
        </Button>
      </div>
    </Modal>
  )
}
