import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { Button, Card, Input, Select, Label } from '../components/ui'
import { demoCihazGetir, demoZimmetAc } from '../services/demoService'
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

export default function YeniZimmet() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { kullanici } = useAuth()
  const [cihaz, setCihaz] = useState(null)
  const [musteriler, setMusteriler] = useState([])
  const [lokasyonlar, setLokasyonlar] = useState([])

  const [musteriId, setMusteriId] = useState('')
  const [lokasyonId, setLokasyonId] = useState('')
  const [verisTarihi, setVerisTarihi] = useState(new Date().toISOString().slice(0, 10))
  const [beklenenIadeTarihi, setBeklenenIadeTarihi] = useState(ekleGun(14))
  const [notlar, setNotlar] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)

  useEffect(() => {
    demoCihazGetir(id).then(setCihaz)
    musterileriGetir().then(list => setMusteriler(list || []))
  }, [id])

  useEffect(() => {
    if (!musteriId) { setLokasyonlar([]); setLokasyonId(''); return }
    musteriLokasyonlariniGetir(musteriId)
      .then(l => setLokasyonlar(l || []))
      .catch(() => setLokasyonlar([]))
    setLokasyonId('')
  }, [musteriId])

  const presetSec = (gun) => setBeklenenIadeTarihi(ekleGun(gun))

  const kaydet = async (e) => {
    e.preventDefault()
    if (!musteriId) { toast.error('Müşteri seçin.'); return }
    if (!beklenenIadeTarihi) { toast.error('Beklenen iade tarihi gerekli.'); return }
    if (cihaz?.aktifZimmetId) { toast.error('Bu cihazın aktif zimmeti var.'); return }
    if (cihaz?.bakimda) { toast.error('Bu cihaz bakımda, zimmet açılamaz.'); return }

    setKaydediliyor(true)
    const sonuc = await demoZimmetAc({
      cihazId: parseInt(id),
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
    toast.success('Zimmet açıldı.')
    navigate(`/demolar/${id}`)
  }

  if (!cihaz) return <div style={{ padding: 24 }}><Card>Yükleniyor…</Card></div>

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <Button variant="ghost" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => navigate(`/demolar/${id}`)}>
        Cihaza Dön
      </Button>
      <h1 className="t-h1" style={{ marginTop: 12, marginBottom: 4 }}>Yeni Zimmet</h1>
      <p className="t-caption" style={{ marginBottom: 20 }}>{cihaz.ad}</p>

      <Card>
        <form onSubmit={kaydet} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Süre presetleri:</span>
            {SURE_PRESETLERI.map(g => (
              <button key={g} type="button" onClick={() => presetSec(g)}
                style={{ padding: '4px 10px', borderRadius: 4, background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                {g} gün
              </button>
            ))}
          </div>

          <div>
            <Label>Notlar</Label>
            <Input value={notlar} onChange={e => setNotlar(e.target.value)} placeholder="Ek bilgi (opsiyonel)" />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Button type="submit" variant="primary" iconLeft={<Save size={14} strokeWidth={1.5} />} disabled={kaydediliyor}>
              {kaydediliyor ? 'Kaydediliyor…' : 'Zimmet Aç'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate(`/demolar/${id}`)} disabled={kaydediliyor}>
              İptal
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
