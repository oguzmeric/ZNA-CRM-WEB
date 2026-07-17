// Destek — hata bildirimi + yönetici yanıtı. Mobil ile AYNI tablo (destek_talepleri),
// realtime aboneliği sayesinde iki taraf da anlık senkron.
import { useState, useEffect, useRef } from 'react'
import { LifeBuoy, ImagePlus, X, Send, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { ekleriYukle } from '../lib/ekDosya'
import {
  destekTalepleriGetir, destekTalepEkle, destekTalepCevapla, destekTalepKapat, DESTEK_DURUM,
} from '../services/destekService'
import { Button, Textarea, Card, CardTitle, EmptyState, SegmentedControl } from '../components/ui'

const fmtTarih = (t) => t ? new Date(t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : ''

function DurumRozet({ durum }) {
  const m = DESTEK_DURUM[durum] || { isim: durum, renk: '#94a3b8', ikon: '⚪' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-pill)',
      background: `${m.renk}1a`, color: m.renk, whiteSpace: 'nowrap',
    }}>
      {m.ikon} {m.isim}
    </span>
  )
}

function TalepKarti({ t, adminMi, onCevapla, onKapat }) {
  const [cevapMetni, setCevapMetni] = useState('')
  const [mesgul, setMesgul] = useState(false)
  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{t.kullaniciAd || '—'}</span>
          <DurumRozet durum={t.durum} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
          {fmtTarih(t.olusturmaTarih)}
        </span>
      </div>

      <p style={{ font: '400 13px/20px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', margin: 0 }}>
        {t.mesaj}
      </p>

      {t.fotoUrl && (
        <a href={t.fotoUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8 }}>
          <img
            src={t.fotoUrl}
            alt="Hata ekran görüntüsü"
            style={{ maxWidth: 260, maxHeight: 180, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', objectFit: 'cover' }}
          />
        </a>
      )}

      {t.cevap && (
        <div style={{
          marginTop: 10, padding: '10px 12px', borderRadius: 'var(--radius-sm)',
          background: 'var(--info-soft, rgba(59,130,246,0.08))', borderLeft: '3px solid var(--info, #3b82f6)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--info, #3b82f6)', marginBottom: 4 }}>
            YÖNETİCİ YANITI {t.cevapTarihi ? `· ${fmtTarih(t.cevapTarihi)}` : ''}
          </div>
          <p style={{ font: '400 13px/20px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', margin: 0 }}>
            {t.cevap}
          </p>
        </div>
      )}

      {adminMi && t.durum !== 'kapandi' && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-default)' }}>
          <Textarea
            rows={2}
            value={cevapMetni}
            onChange={e => setCevapMetni(e.target.value)}
            placeholder={t.cevap ? 'Yanıtı güncelle…' : 'Yanıt yaz…'}
            style={{ marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="primary"
              disabled={mesgul || !cevapMetni.trim()}
              iconLeft={<Send size={14} strokeWidth={1.5} />}
              onClick={async () => {
                setMesgul(true)
                await onCevapla(t, cevapMetni.trim())
                setCevapMetni('')
                setMesgul(false)
              }}
            >
              Yanıtla
            </Button>
            <Button
              variant="secondary"
              disabled={mesgul}
              iconLeft={<CheckCircle2 size={14} strokeWidth={1.5} />}
              onClick={async () => { setMesgul(true); await onKapat(t); setMesgul(false) }}
            >
              Kapat
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function Destek() {
  const { kullanici } = useAuth()
  const { toast } = useToast()
  const adminMi = kullanici?.rol === 'admin'

  const [talepler, setTalepler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [mesaj, setMesaj] = useState('')
  const [foto, setFoto] = useState(null)         // File
  const [fotoOnizleme, setFotoOnizleme] = useState(null)
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [gorunum, setGorunum] = useState('benim') // benim | hepsi (admin)
  const [durumFiltre, setDurumFiltre] = useState('acik')
  const fileRef = useRef(null)

  const yenile = async () => {
    const data = await destekTalepleriGetir()
    setTalepler(data)
    setYukleniyor(false)
  }

  useEffect(() => {
    yenile()
    // Realtime — mobil/webden gelen yeni talep ve cevaplar anında düşsün
    const kanal = supabase
      .channel('destek-talepleri')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'destek_talepleri' }, () => yenile())
      .subscribe()
    return () => { supabase.removeChannel(kanal) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fotoSec = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Yalnızca resim dosyası eklenebilir.'); return }
    setFoto(f)
    setFotoOnizleme(URL.createObjectURL(f))
    e.target.value = ''
  }

  const gonder = async () => {
    if (!mesaj.trim()) { toast.error('Lütfen yaşadığınız sorunu kısaca anlatın.'); return }
    setGonderiliyor(true)
    try {
      let fotoUrl = null
      if (foto) {
        const yuklenen = await ekleriYukle('destek-ekleri', [foto])
        fotoUrl = yuklenen?.[0]?.url || null
      }
      const kayit = await destekTalepEkle({
        kullaniciId: kullanici.id, kullaniciAd: kullanici.ad,
        mesaj: mesaj.trim(), fotoUrl,
      })
      if (!kayit) { toast.error('Talep gönderilemedi — tekrar deneyin.'); return }
      toast.success('Destek talebiniz alındı. En kısa sürede yanıtlanacak.')
      setMesaj(''); setFoto(null); setFotoOnizleme(null)
      yenile()
    } catch (e) {
      toast.error('Gönderilemedi: ' + (e?.message || 'hata'))
    } finally {
      setGonderiliyor(false)
    }
  }

  const cevapla = async (t, cevap) => {
    const g = await destekTalepCevapla(t, cevap, kullanici.ad)
    if (g) { toast.success('Yanıt gönderildi — talep sahibine bildirim gitti.'); yenile() }
    else toast.error('Yanıt kaydedilemedi.')
  }

  const kapat = async (t) => {
    const ok = await destekTalepKapat(t.id)
    if (ok) { toast.success('Talep kapatıldı.'); yenile() }
    else toast.error('Kapatılamadı.')
  }

  const benimkiler = talepler.filter(t => String(t.kullaniciId) === String(kullanici?.id))
  const gosterilecek = (gorunum === 'hepsi' ? talepler : benimkiler)
    .filter(t => gorunum === 'benim' || durumFiltre === 'tumu' || t.durum === durumFiltre)
  const acikSayi = talepler.filter(t => t.durum === 'acik').length

  return (
    <div style={{ padding: 24, maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <LifeBuoy size={22} strokeWidth={1.5} style={{ color: 'var(--brand-primary)' }} />
        <h1 className="t-h1" style={{ margin: 0 }}>Destek</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
        Kullanım sırasında aldığınız hataları buradan bildirin — ekran görüntüsü eklerseniz çözüm hızlanır.
        Yanıtlar hem buraya hem bildirim olarak size düşer (mobil ile senkron).
      </p>

      {/* Yeni talep formu */}
      <Card style={{ marginBottom: 20 }}>
        <CardTitle style={{ marginBottom: 10 }}>Yeni Destek Talebi</CardTitle>
        <Textarea
          rows={3}
          value={mesaj}
          onChange={e => setMesaj(e.target.value)}
          placeholder="Sorunu anlatın: hangi sayfada, ne yaparken, hangi hata çıktı…"
          style={{ marginBottom: 8 }}
        />
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={fotoSec} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            iconLeft={<ImagePlus size={14} strokeWidth={1.5} />}
            onClick={() => fileRef.current?.click()}
            disabled={gonderiliyor}
          >
            {foto ? 'Görüntüyü Değiştir' : 'Ekran Görüntüsü Ekle'}
          </Button>
          {fotoOnizleme && (
            <span style={{ position: 'relative', display: 'inline-block' }}>
              <img src={fotoOnizleme} alt="önizleme" style={{ height: 44, borderRadius: 6, border: '1px solid var(--border-default)' }} />
              <button
                onClick={() => { setFoto(null); setFotoOnizleme(null) }}
                style={{
                  position: 'absolute', top: -6, right: -6, width: 18, height: 18,
                  borderRadius: '50%', background: 'var(--danger)', color: '#fff',
                  border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={11} strokeWidth={2} />
              </button>
            </span>
          )}
          <div style={{ flex: 1 }} />
          <Button variant="primary" onClick={gonder} disabled={gonderiliyor}>
            {gonderiliyor ? 'Gönderiliyor…' : 'Talep Gönder'}
          </Button>
        </div>
      </Card>

      {/* Görünüm seçici (admin) */}
      {adminMi && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <SegmentedControl
            options={[
              { value: 'benim', label: 'Taleplerim' },
              { value: 'hepsi', label: `Gelen Talepler${acikSayi ? ` (${acikSayi} açık)` : ''}` },
            ]}
            value={gorunum}
            onChange={setGorunum}
          />
          {gorunum === 'hepsi' && (
            <SegmentedControl
              options={[
                { value: 'acik', label: 'Açık' },
                { value: 'cevaplandi', label: 'Cevaplandı' },
                { value: 'kapandi', label: 'Kapandı' },
                { value: 'tumu', label: 'Tümü' },
              ]}
              value={durumFiltre}
              onChange={setDurumFiltre}
            />
          )}
        </div>
      )}

      {/* Liste */}
      {yukleniyor ? (
        <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Yükleniyor…</p>
      ) : gosterilecek.length === 0 ? (
        <EmptyState
          title={gorunum === 'hepsi' ? 'Bu filtrede talep yok' : 'Henüz destek talebiniz yok'}
          description={gorunum === 'hepsi' ? '' : 'Bir sorun yaşadığınızda yukarıdaki formdan bildirebilirsiniz.'}
        />
      ) : (
        gosterilecek.map(t => (
          <TalepKarti
            key={t.id}
            t={t}
            adminMi={adminMi && gorunum === 'hepsi'}
            onCevapla={cevapla}
            onKapat={kapat}
          />
        ))
      )}
    </div>
  )
}

export default Destek
