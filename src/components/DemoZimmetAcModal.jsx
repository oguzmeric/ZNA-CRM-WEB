// Demo cihazını müşteriye zimmetleme modalı — YeniZimmet sayfasının yerini alır.
// Kayıt sonrası aynı modalda "tutanak" adımı: Yazdır / Müşteriye Gönder / Kapat.
//
// Kullanım:
//   <DemoZimmetAcModal acik={acik} cihaz={cihaz} onKapat={...} onZimmetAcildi={yenile} />
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Printer, Send, Check } from 'lucide-react'
import { Button, Modal, Input, Select, Label } from './ui'
import BelgePaylasModal from './BelgePaylasModal'
import { demoZimmetAc } from '../services/demoService'
import { musterileriGetir } from '../services/musteriService'
import { musteriLokasyonlariniGetir } from '../services/musteriLokasyonService'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'

const SURE_PRESETLERI = [7, 14, 30]
const ekleGun = (gun) => {
  const t = new Date()
  t.setDate(t.getDate() + gun)
  return t.toISOString().slice(0, 10)
}

export default function DemoZimmetAcModal({ acik, cihaz, onKapat, onZimmetAcildi }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { kullanici } = useAuth()
  const [musteriler, setMusteriler] = useState([])
  const [lokasyonlar, setLokasyonlar] = useState([])

  const [musteriId, setMusteriId] = useState('')
  const [lokasyonId, setLokasyonId] = useState('')
  const [verisTarihi, setVerisTarihi] = useState('')
  const [beklenenIadeTarihi, setBeklenenIadeTarihi] = useState('')
  const [notlar, setNotlar] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)

  // Kayıt sonrası tutanak adımı
  const [acilanZimmet, setAcilanZimmet] = useState(null)
  const [paylasModalAcik, setPaylasModalAcik] = useState(false)

  useEffect(() => {
    if (!acik) return
    setMusteriId('')
    setLokasyonId('')
    setVerisTarihi(new Date().toISOString().slice(0, 10))
    setBeklenenIadeTarihi(ekleGun(14))
    setNotlar('')
    setAcilanZimmet(null)
    setPaylasModalAcik(false)
    musterileriGetir().then(list => setMusteriler(list || []))
  }, [acik])

  useEffect(() => {
    if (!musteriId) { setLokasyonlar([]); setLokasyonId(''); return }
    musteriLokasyonlariniGetir(musteriId)
      .then(l => setLokasyonlar(l || []))
      .catch(() => setLokasyonlar([]))
    setLokasyonId('')
  }, [musteriId])

  if (!acik || !cihaz) return null

  const secilenMusteri = musteriler.find(m => String(m.id) === String(musteriId))

  const kaydet = async () => {
    if (!musteriId) { toast.error('Müşteri seçin.'); return }
    if (!beklenenIadeTarihi) { toast.error('Beklenen iade tarihi gerekli.'); return }
    if (cihaz.aktifZimmetId) { toast.error('Bu cihazın aktif zimmeti var.'); return }
    if (cihaz.bakimda) { toast.error('Bu cihaz bakımda, zimmet açılamaz.'); return }

    setKaydediliyor(true)
    const sonuc = await demoZimmetAc({
      cihazId: parseInt(cihaz.id),
      musteriId: parseInt(musteriId),
      lokasyonId: lokasyonId ? parseInt(lokasyonId) : null,
      verenKullaniciId: kullanici?.id ? String(kullanici.id) : null,
      verenKullaniciAd: kullanici?.ad || null,
      verisTarihi,
      beklenenIadeTarihi,
      durumNotu: notlar.trim() || null,
    })
    setKaydediliyor(false)
    if (!sonuc || sonuc._hata) {
      toast.error(`Zimmet açılamadı: ${sonuc?._hata || 'bilinmeyen hata'}`)
      return
    }
    toast.success('Zimmet açıldı, tutanak hazırlandı.')
    setAcilanZimmet(sonuc)
    onZimmetAcildi?.(sonuc)
  }

  // ── Adım 2: Tutanak ──────────────────────────────────────────────────
  if (acilanZimmet) {
    return (
      <>
        <Modal open onClose={onKapat} title="Teslim Tutanağı Hazır" width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              background: 'var(--surface-success, rgba(34,197,94,0.08))',
              border: '1px solid var(--success)', borderRadius: 10, padding: 14,
            }}>
              <Check size={18} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, lineHeight: 1.55 }}>
                <div><strong>{cihaz.ad}</strong> — {secilenMusteri?.firma || 'müşteriye'} zimmetlendi.</div>
                <div style={{ marginTop: 4 }}>
                  Tutanak No: <strong style={{ fontFamily: 'var(--font-mono)' }}>{acilanZimmet.tutanakNo}</strong>
                </div>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Tutanağı yazdırıp cihazla birlikte imzalatın. İmzalı halinin fotoğrafını
              (web veya telefondan) cihaz sayfasına yükleyene kadar zimmet
              &quot;tutanak bekleniyor&quot; olarak işaretli kalır.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="primary" iconLeft={<Printer size={14} strokeWidth={1.5} />}
                onClick={() => navigate(`/demolar/${cihaz.id}/tutanak?z=${acilanZimmet.id}`)}>
                Tutanağı Yazdır
              </Button>
              <Button variant="secondary" iconLeft={<Send size={14} strokeWidth={1.5} />}
                onClick={() => setPaylasModalAcik(true)}>
                Müşteriye Gönder
              </Button>
              <Button variant="ghost" onClick={onKapat}>Kapat</Button>
            </div>
          </div>
        </Modal>
        <BelgePaylasModal
          acik={paylasModalAcik}
          onKapat={() => setPaylasModalAcik(false)}
          belgeTipi="demo_tutanak"
          belgeId={acilanZimmet.id}
          baslangicEmail={secilenMusteri?.email || ''}
          baslangicGsm={secilenMusteri?.telefon || ''}
          belgeBaslik={`${acilanZimmet.tutanakNo} — ${cihaz.ad}`}
        />
      </>
    )
  }

  // ── Adım 1: Zimmet formu ─────────────────────────────────────────────
  return (
    <Modal open onClose={onKapat} title={`Zimmet Aç — ${cihaz.ad}`} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <Label>Müşteri *</Label>
          <Select value={musteriId} onChange={e => setMusteriId(e.target.value)}>
            <option value="">Seçiniz</option>
            {musteriler.map(m => (
              <option key={m.id} value={m.id}>
                {m.firma || `${m.ad ?? ''} ${m.soyad ?? ''}`.trim()}
              </option>
            ))}
          </Select>
        </div>

        {lokasyonlar.length > 0 && (
          <div>
            <Label>Lokasyon</Label>
            <Select value={lokasyonId} onChange={e => setLokasyonId(e.target.value)}>
              <option value="">Lokasyon yok</option>
              {lokasyonlar.map(l => (
                <option key={l.id} value={l.id}>{l.ad}</option>
              ))}
            </Select>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label>Veriliş Tarihi</Label>
            <Input type="date" value={verisTarihi} onChange={e => setVerisTarihi(e.target.value)} />
          </div>
          <div>
            <Label>Beklenen İade Tarihi *</Label>
            <Input type="date" value={beklenenIadeTarihi} onChange={e => setBeklenenIadeTarihi(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Süre:</span>
          {SURE_PRESETLERI.map(g => (
            <button key={g} type="button" onClick={() => setBeklenenIadeTarihi(ekleGun(g))}
              style={{ padding: '4px 10px', borderRadius: 4, background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
              {g} gün
            </button>
          ))}
        </div>

        <div>
          <Label>Aksesuar / Not (tutanakta görünür)</Label>
          <Input value={notlar} onChange={e => setNotlar(e.target.value)} placeholder="Adaptör, kablo, montaj aparatı..." />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onKapat} disabled={kaydediliyor}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Kaydediliyor…' : 'Zimmet Aç ve Tutanak Oluştur'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
