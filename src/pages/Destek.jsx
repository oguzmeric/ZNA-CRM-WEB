// Destek — hata bildirimi + yönetici yanıtı. Mobil ile AYNI tablo (destek_talepleri),
// realtime aboneliği sayesinde iki taraf da anlık senkron.
import { useState, useEffect, useRef } from 'react'
import { LifeBuoy, ImagePlus, X, Send, CheckCircle2, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { ekleriYukle } from '../lib/ekDosya'
import { panodanResimler, Lightbox } from '../components/EkAlani'
import {
  destekTalepleriGetir, destekTalepEkle, destekTalepCevapla, destekTalepKapat, destekTalepSil, DESTEK_DURUM,
  destekMesajlariGetir, destekMesajEkle, DESTEK_YONETICISI_ID,
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

function TalepKarti({ t, adminMi, kullanici, onKapat, onSil, onYenile }) {
  const [cevapMetni, setCevapMetni] = useState('')
  const [mesgul, setMesgul] = useState(false)
  const [fotoBuyuk, setFotoBuyuk] = useState(false)
  // Sohbet (mig 222) — tek 'cevap' kolonu her yanıtta öncekini eziyordu
  const [mesajlar, setMesajlar] = useState([])
  useEffect(() => {
    let iptal = false
    destekMesajlariGetir(t.id).then(m => { if (!iptal) setMesajlar(m) }).catch(() => {})
    return () => { iptal = true }
  }, [t.id])

  const destekYoneticisiMi = Number(kullanici?.id) === DESTEK_YONETICISI_ID
  const benimTalebimMi = String(t.kullaniciId ?? '') === String(kullanici?.id ?? '')
  const yazabilir = (destekYoneticisiMi || benimTalebimMi) && t.durum !== 'kapandi'

  const mesajGonder = async () => {
    const metin = cevapMetni.trim()
    if (!metin) return
    setMesgul(true)
    const sonuc = await destekMesajEkle({
      talep: t, mesaj: metin, yazarId: kullanici?.id, yazarAd: kullanici?.ad,
    })
    setMesgul(false)
    if (sonuc?.hata) return
    if (sonuc) setMesajlar(prev => [...prev, sonuc])
    setCevapMetni('')
    onYenile?.()   // durum/rozet tazelensin
  }
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
        <>
          <button type="button" onClick={() => setFotoBuyuk(true)}
            style={{ display: 'inline-block', marginTop: 8, padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}>
            <img
              src={t.fotoUrl}
              alt="Hata ekran görüntüsü"
              style={{ maxWidth: 260, maxHeight: 180, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', objectFit: 'cover', display: 'block' }}
            />
          </button>
          <Lightbox acik={fotoBuyuk} url={t.fotoUrl} ad="Hata ekran görüntüsü" onKapat={() => setFotoBuyuk(false)} />
        </>
      )}

      {/* Sohbet akışı — her yanıt ayrı mesaj (mig 222); artık üzerine yazılmıyor */}
      {mesajlar.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mesajlar.map(m => {
            const benim = String(m.yazarId ?? '') === String(kullanici?.id ?? '')
            const destekten = Number(m.yazarId) === DESTEK_YONETICISI_ID
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: benim ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '78%', padding: '8px 12px', borderRadius: 12,
                  background: benim ? 'var(--brand-50, rgba(1,118,211,0.10))' : 'var(--surface-sunken)',
                  border: `1px solid ${benim ? 'rgba(1,118,211,0.25)' : 'var(--border-default)'}`,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: destekten ? 'var(--info, #3b82f6)' : 'var(--text-tertiary)', marginBottom: 3 }}>
                    {destekten ? '🛠 Destek' : (m.yazarAd || 'Kullanıcı')}
                    {m.olusturmaTarih ? ` · ${fmtTarih(m.olusturmaTarih)}` : ''}
                  </div>
                  <p style={{ font: '400 13px/20px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', margin: 0 }}>
                    {m.mesaj}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Mesaj kutusu — hem talep sahibi hem destek yöneticisi yazar (sohbet) */}
      {yazabilir && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-default)' }}>
          <Textarea
            rows={2}
            value={cevapMetni}
            onChange={e => setCevapMetni(e.target.value)}
            placeholder={destekYoneticisiMi ? 'Yanıt yaz…' : 'Mesaj yaz…'}
            style={{ marginBottom: 8 }}
          />
          <Button
            variant="primary"
            disabled={mesgul || !cevapMetni.trim()}
            iconLeft={<Send size={14} strokeWidth={1.5} />}
            onClick={mesajGonder}
          >
            {mesgul ? 'Gönderiliyor…' : 'Gönder'}
          </Button>
        </div>
      )}
      {t.durum === 'kapandi' && (
        <p className="t-caption" style={{ color: 'var(--text-tertiary)', marginTop: 10 }}>
          Bu talep kapatıldı — yeni mesaj yazılamaz.
        </p>
      )}

      {adminMi && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {t.durum !== 'kapandi' && (
              <Button
                variant="secondary"
                disabled={mesgul}
                iconLeft={<CheckCircle2 size={14} strokeWidth={1.5} />}
                onClick={async () => { setMesgul(true); await onKapat(t); setMesgul(false) }}
              >
                Kapat
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={mesgul}
              iconLeft={<Trash2 size={14} strokeWidth={1.5} style={{ color: 'var(--danger)' }} />}
              onClick={async () => {
                if (!window.confirm('Bu destek talebi kalıcı olarak silinecek. Emin misiniz?')) return
                setMesgul(true); await onSil(t); setMesgul(false)
              }}
              style={{ marginLeft: 'auto' }}
            >
              Sil
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
  // Destek yöneticisi TEK kişi: Oğuz Meriç (id 2) — mig 189 RLS de aynı kuralı DB'de uygular
  const adminMi = Number(kullanici?.id) === 2

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

  const sil = async (t) => {
    const ok = await destekTalepSil(t.id)
    if (ok) { toast.success('Talep silindi.'); yenile() }
    else toast.error('Silinemedi.')
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
          placeholder="Sorunu anlatın: hangi sayfada, ne yaparken, hangi hata çıktı… (Ctrl+V ile ekran görüntüsü yapıştırabilirsiniz)"
          style={{ marginBottom: 8 }}
          onPaste={(e) => {
            const resimler = panodanResimler(e)
            if (resimler.length) {
              e.preventDefault()
              setFoto(resimler[0])
              setFotoOnizleme(URL.createObjectURL(resimler[0]))
            }
          }}
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
            kullanici={kullanici}
            onKapat={kapat}
            onSil={sil}
            onYenile={yenile}
          />
        ))
      )}
    </div>
  )
}

export default Destek
