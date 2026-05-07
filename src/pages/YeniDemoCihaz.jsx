import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, ArrowRight } from 'lucide-react'
import { Button, Card, Input, Textarea, Select, Label } from '../components/ui'
import { demoCihazEkle } from '../services/demoService'
import { useToast } from '../context/ToastContext'

const KATEGORILER = [
  { value: '', label: 'Seçiniz' },
  { value: 'NVR', label: 'NVR' },
  { value: 'DVR', label: 'DVR' },
  { value: 'IP Kamera', label: 'IP Kamera' },
  { value: 'Analog Kamera', label: 'Analog Kamera' },
  { value: 'Switch', label: 'Switch' },
  { value: 'Server', label: 'Server' },
  { value: 'Santral', label: 'Santral' },
  { value: 'Telefon', label: 'Telefon' },
  { value: 'Diğer', label: 'Diğer' },
]

export default function YeniDemoCihaz() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [form, setForm] = useState({ ad: '', marka: '', model: '', seriNo: '', kategori: '', notlar: '' })
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const setAlan = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const kaydet = async (zimmeteGec = false) => {
    if (!form.ad.trim()) { toast.error('Cihaz adı gerekli.'); return }
    setKaydediliyor(true)
    const eklenen = await demoCihazEkle({
      ad: form.ad.trim(),
      marka: form.marka.trim() || null,
      model: form.model.trim() || null,
      seriNo: form.seriNo.trim() || null,
      kategori: form.kategori || null,
      notlar: form.notlar.trim() || null,
    })
    setKaydediliyor(false)
    if (!eklenen) { toast.error('Cihaz eklenemedi.'); return }
    toast.success('Cihaz havuza eklendi.')
    if (zimmeteGec) {
      navigate(`/demolar/${eklenen.id}/zimmet`)
    } else {
      navigate(`/demolar/${eklenen.id}`)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <Button variant="ghost" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => navigate('/demolar')}>
        Demolar
      </Button>
      <h1 className="t-h1" style={{ marginTop: 12, marginBottom: 20 }}>Yeni Demo Cihazı</h1>

      <Card style={{ marginBottom: 12, padding: 14, background: 'var(--info-soft, rgba(59,130,246,0.08))', borderLeft: '3px solid var(--info)' }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
          ℹ️ Cihaz havuza eklenir. Sonra <strong>"Kaydet ve Zimmet Aç"</strong> ile direkt müşteriye zimmetleyebilir
          ya da sadece kaydedip ileride detay sayfasından zimmet açabilirsin.
        </p>
      </Card>

      <Card>
        <form onSubmit={(e) => { e.preventDefault(); kaydet(false) }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <Label>Cihaz Adı *</Label>
            <Input value={form.ad} onChange={e => setAlan('ad', e.target.value)} placeholder="Örn: Trassir NVR-04" autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Marka</Label>
              <Input value={form.marka} onChange={e => setAlan('marka', e.target.value)} placeholder="Trassir" />
            </div>
            <div>
              <Label>Model</Label>
              <Input value={form.model} onChange={e => setAlan('model', e.target.value)} placeholder="HY-CW3011" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Seri No</Label>
              <Input value={form.seriNo} onChange={e => setAlan('seriNo', e.target.value)} />
            </div>
            <div>
              <Label>Kategori</Label>
              <Select value={form.kategori} onChange={e => setAlan('kategori', e.target.value)}>
                {KATEGORILER.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <Label>Notlar</Label>
            <Textarea value={form.notlar} onChange={e => setAlan('notlar', e.target.value)} rows={3} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <Button type="button" variant="primary"
              iconRight={<ArrowRight size={14} strokeWidth={1.5} />}
              onClick={() => kaydet(true)}
              disabled={kaydediliyor}>
              Kaydet ve Zimmet Aç
            </Button>
            <Button type="submit" variant="secondary" iconLeft={<Save size={14} strokeWidth={1.5} />} disabled={kaydediliyor}>
              {kaydediliyor ? 'Kaydediliyor…' : 'Sadece Kaydet'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate('/demolar')} disabled={kaydediliyor}>
              İptal
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
