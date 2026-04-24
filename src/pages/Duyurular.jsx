import { useEffect, useState } from 'react'
import { Megaphone, Plus, Pencil, Trash2, Save, X, Info, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import {
  duyurulariGetir, duyuruEkle, duyuruGuncelle, duyuruSil,
} from '../services/duyuruService'
import CustomSelect from '../components/CustomSelect'
import { Button, Input, Textarea, Label, Card, Badge, EmptyState } from '../components/ui'

const SEVIYE_ROZET = {
  info:    { tone: 'bilgi',    label: 'Bilgi',  Icon: Info },
  warning: { tone: 'beklemede', label: 'Uyarı',  Icon: AlertTriangle },
  success: { tone: 'aktif',    label: 'Başarı', Icon: CheckCircle2 },
}

const BOS_FORM = {
  baslik: '', icerik: '', seviye: 'info', aktif: true,
  baslangicTarihi: '', bitisTarihi: '',
}

function tarihFormat(t) {
  if (!t) return '—'
  return new Date(t).toLocaleString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ISO string ↔ datetime-local input dönüşümü
function isoToLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function localToIso(local) {
  if (!local) return null
  return new Date(local).toISOString()
}

export default function Duyurular() {
  const { kullanici } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [duyurular, setDuyurular] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [form, setForm] = useState(null)        // { id?, baslik, ... } — null = form kapalı
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const yukle = async () => {
    setYukleniyor(true)
    const data = await duyurulariGetir()
    setDuyurular(data)
    setYukleniyor(false)
  }

  useEffect(() => { yukle() }, [])

  const yeniBaslat = () => setForm({ ...BOS_FORM, baslangicTarihi: isoToLocal(new Date().toISOString()) })
  const duzenleBaslat = (d) => setForm({
    id: d.id,
    baslik: d.baslik || '',
    icerik: d.icerik || '',
    seviye: d.seviye || 'info',
    aktif: d.aktif !== false,
    baslangicTarihi: isoToLocal(d.baslangicTarihi),
    bitisTarihi: isoToLocal(d.bitisTarihi),
  })

  const kaydet = async () => {
    if (!form.baslik.trim()) { toast.error('Başlık zorunludur.'); return }
    setKaydediliyor(true)
    try {
      const payload = {
        baslik: form.baslik.trim(),
        icerik: form.icerik.trim() || null,
        seviye: form.seviye,
        aktif: !!form.aktif,
        baslangicTarihi: localToIso(form.baslangicTarihi) || new Date().toISOString(),
        bitisTarihi: localToIso(form.bitisTarihi),
      }
      if (form.id) {
        await duyuruGuncelle(form.id, payload)
        toast.success('Duyuru güncellendi.')
      } else {
        await duyuruEkle({ ...payload, olusturan: kullanici?.id || null })
        toast.success('Duyuru oluşturuldu.')
      }
      setForm(null)
      await yukle()
    } catch (e) {
      toast.error(e?.message || 'Kaydedilemedi.')
    } finally {
      setKaydediliyor(false)
    }
  }

  const sil = async (d) => {
    const onay = await confirm({
      title: 'Duyuruyu sil',
      description: `"${d.baslik}" silinecek. Devam edilsin mi?`,
      confirmText: 'Sil', destructive: true,
    })
    if (!onay) return
    try {
      await duyuruSil(d.id)
      toast.success('Silindi.')
      await yukle()
    } catch (e) { toast.error(e?.message || 'Silinemedi.') }
  }

  const aktifToggle = async (d) => {
    try {
      await duyuruGuncelle(d.id, { aktif: !d.aktif })
      await yukle()
    } catch (e) { toast.error(e?.message || 'Güncellenemedi.') }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Duyurular</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            Müşteri portalı ana panelinde gösterilen sistem duyuruları.
          </p>
        </div>
        {!form && (
          <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={yeniBaslat}>
            Yeni duyuru
          </Button>
        )}
      </div>

      {/* Form */}
      {form && (
        <Card style={{ marginBottom: 16 }}>
          <p className="t-label" style={{ marginBottom: 12 }}>
            {form.id ? 'DUYURUYU DÜZENLE' : 'YENİ DUYURU'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <Label required>Başlık</Label>
              <Input
                value={form.baslik}
                onChange={e => setForm(p => ({ ...p, baslik: e.target.value }))}
                placeholder="Örn. Yeni dönem bakım sözleşmeleri yayında"
                maxLength={200}
              />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <Label>İçerik (opsiyonel)</Label>
              <Textarea
                value={form.icerik}
                onChange={e => setForm(p => ({ ...p, icerik: e.target.value }))}
                rows={3}
                placeholder="Müşterilere gösterilecek kısa açıklama."
              />
            </div>
            <div>
              <Label>Seviye</Label>
              <CustomSelect
                value={form.seviye}
                onChange={e => setForm(p => ({ ...p, seviye: e.target.value }))}
              >
                <option value="info">Bilgi</option>
                <option value="warning">Uyarı</option>
                <option value="success">Başarı</option>
              </CustomSelect>
            </div>
            <div>
              <Label>Durum</Label>
              <CustomSelect
                value={form.aktif ? 'aktif' : 'pasif'}
                onChange={e => setForm(p => ({ ...p, aktif: e.target.value === 'aktif' }))}
              >
                <option value="aktif">Aktif</option>
                <option value="pasif">Pasif (gösterme)</option>
              </CustomSelect>
            </div>
            <div>
              <Label>Başlangıç</Label>
              <Input
                type="datetime-local"
                value={form.baslangicTarihi}
                onChange={e => setForm(p => ({ ...p, baslangicTarihi: e.target.value }))}
              />
            </div>
            <div>
              <Label>Bitiş (boş = süresiz)</Label>
              <Input
                type="datetime-local"
                value={form.bitisTarihi}
                onChange={e => setForm(p => ({ ...p, bitisTarihi: e.target.value }))}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="primary"
              iconLeft={<Save size={14} strokeWidth={1.5} />}
              onClick={kaydet}
              disabled={kaydediliyor}
            >
              {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
            <Button variant="secondary" iconLeft={<X size={14} strokeWidth={1.5} />} onClick={() => setForm(null)}>
              İptal
            </Button>
          </div>
        </Card>
      )}

      {/* Liste */}
      {yukleniyor ? (
        <Card><p className="t-caption">Yükleniyor…</p></Card>
      ) : duyurular.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Megaphone size={32} strokeWidth={1.5} />}
            title="Henüz duyuru yok"
            description="İlk duyurunu oluştur, müşteri portalı ana panelinde gözüksün."
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {duyurular.map(d => {
            const rozet = SEVIYE_ROZET[d.seviye] || SEVIYE_ROZET.info
            const Icon = rozet.Icon
            const suresiGecti = d.bitisTarihi && new Date(d.bitisTarihi) < new Date()
            return (
              <Card key={d.id}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
                        {d.baslik}
                      </span>
                      <Badge tone={rozet.tone} icon={<Icon size={11} strokeWidth={1.5} />}>
                        {rozet.label}
                      </Badge>
                      {!d.aktif && <Badge tone="pasif">Pasif</Badge>}
                      {suresiGecti && <Badge tone="kayip">Süresi doldu</Badge>}
                    </div>
                    {d.icerik && (
                      <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', margin: '4px 0 8px', whiteSpace: 'pre-wrap' }}>
                        {d.icerik}
                      </p>
                    )}
                    <div style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                      {tarihFormat(d.baslangicTarihi)} — {d.bitisTarihi ? tarihFormat(d.bitisTarihi) : 'süresiz'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <Button size="sm" variant="secondary" onClick={() => aktifToggle(d)}>
                      {d.aktif ? 'Pasifleştir' : 'Aktifleştir'}
                    </Button>
                    <Button size="sm" variant="secondary" iconLeft={<Pencil size={13} strokeWidth={1.5} />} onClick={() => duzenleBaslat(d)}>
                      Düzenle
                    </Button>
                    <Button size="sm" variant="danger" iconLeft={<Trash2 size={13} strokeWidth={1.5} />} onClick={() => sil(d)}>
                      Sil
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
