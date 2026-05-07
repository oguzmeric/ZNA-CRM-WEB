import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { Button, Card, Input, Textarea, Select, Label } from '../components/ui'
import { demoCihazGetir, demoCihazGuncelle } from '../services/demoService'
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

export default function DuzenleDemoCihaz() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [form, setForm] = useState({ ad: '', marka: '', model: '', seriNo: '', kategori: '', notlar: '' })
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const setAlan = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  useEffect(() => {
    demoCihazGetir(id).then(c => {
      if (c) {
        setForm({
          ad: c.ad || '',
          marka: c.marka || '',
          model: c.model || '',
          seriNo: c.seriNo || '',
          kategori: c.kategori || '',
          notlar: c.notlar || '',
        })
      }
      setYukleniyor(false)
    })
  }, [id])

  const kaydet = async (e) => {
    e.preventDefault()
    if (!form.ad.trim()) { toast.error('Cihaz adı gerekli.'); return }
    setKaydediliyor(true)
    const sonuc = await demoCihazGuncelle(id, {
      ad: form.ad.trim(),
      marka: form.marka.trim() || null,
      model: form.model.trim() || null,
      seriNo: form.seriNo.trim() || null,
      kategori: form.kategori || null,
      notlar: form.notlar.trim() || null,
    })
    setKaydediliyor(false)
    if (!sonuc) { toast.error('Güncellenemedi.'); return }
    toast.success('Cihaz güncellendi.')
    navigate(`/demolar/${id}`)
  }

  if (yukleniyor) return <div style={{ padding: 24 }}><Card>Yükleniyor…</Card></div>

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <Button variant="ghost" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => navigate(`/demolar/${id}`)}>
        Cihaza Dön
      </Button>
      <h1 className="t-h1" style={{ marginTop: 12, marginBottom: 20 }}>Cihaz Düzenle</h1>

      <Card>
        <form onSubmit={kaydet} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <Label>Cihaz Adı *</Label>
            <Input value={form.ad} onChange={e => setAlan('ad', e.target.value)} autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Marka</Label>
              <Input value={form.marka} onChange={e => setAlan('marka', e.target.value)} />
            </div>
            <div>
              <Label>Model</Label>
              <Input value={form.model} onChange={e => setAlan('model', e.target.value)} />
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
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Button type="submit" variant="primary" iconLeft={<Save size={14} strokeWidth={1.5} />} disabled={kaydediliyor}>
              {kaydediliyor ? 'Kaydediliyor…' : 'Güncelle'}
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
