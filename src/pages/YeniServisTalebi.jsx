import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Building2, User, AlertTriangle, MapPin, Phone, Calendar, Wrench,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useServisTalebi, ANA_TURLER, ALT_KATEGORILER, ACILIYET_SEVIYELERI } from '../context/ServisTalebiContext'
import { musterileriGetir } from '../services/musteriService'
import { musteriLokasyonlariniGetir } from '../services/musteriLokasyonService'
import CustomSelect from '../components/CustomSelect'
import {
  Button, Input, Textarea, Label, Card, Badge, EmptyState, Alert, SearchInput,
} from '../components/ui'

const trNormalize = (str = '') =>
  String(str).toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/İ/gi, 'i').replace(/I/g, 'i')

const bos = {
  anaTur: 'ariza',
  altKategori: '',
  konu: '',
  aciklama: '',
  aciliyet: 'normal',
  lokasyon: '',
  cihazTuru: '',
  ilgiliKisi: '',
  telefon: '',
  uygunZaman: '',
  planliTarih: '',
}

export default function YeniServisTalebi() {
  const navigate = useNavigate()
  const { kullanici, kullanicilar } = useAuth()
  const { toast } = useToast()
  const { talepOlusturPersonel } = useServisTalebi()

  const [musteriler, setMusteriler] = useState([])
  const [seciliMusteri, setSeciliMusteri] = useState(null)
  const [musteriLokasyonlari, setMusteriLokasyonlari] = useState([])
  const [form, setForm] = useState(bos)
  const [seciliTeknisyenId, setSeciliTeknisyenId] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)

  useEffect(() => {
    musterileriGetir().then(d => setMusteriler(d || []))
  }, [])

  const teknisyenler = (kullanicilar || []).filter(k => k.tip !== 'musteri')
  const altKategoriler = ALT_KATEGORILER[form.anaTur] || []

  const musteriSec = (musteriId) => {
    if (!musteriId) { setSeciliMusteri(null); setMusteriLokasyonlari([]); return }
    const m = musteriler.find(x => x.id?.toString() === musteriId.toString())
    if (!m) return
    setSeciliMusteri(m)
    setForm(p => ({
      ...p,
      lokasyon: p.lokasyon || m.sehir || '',
      ilgiliKisi: p.ilgiliKisi || `${m.ad} ${m.soyad}`,
      telefon: p.telefon || m.telefon || '',
    }))
    // Müşterinin lokasyonlarını çek (varsa dropdown göstereceğiz)
    musteriLokasyonlariniGetir(m.id).then(setMusteriLokasyonlari).catch(() => setMusteriLokasyonlari([]))
  }

  const kaydet = async () => {
    if (!seciliMusteri) {
      toast.warning('Lütfen müşteri seçin.')
      return
    }
    if (!form.altKategori) {
      toast.warning('Lütfen arıza/talep kategorisini seçin.')
      return
    }
    if (!form.konu.trim()) {
      toast.warning('Konu zorunludur.')
      return
    }
    setKaydediliyor(true)
    try {
      const atanan = seciliTeknisyenId
        ? teknisyenler.find(k => k.id?.toString() === seciliTeknisyenId)
        : null
      const yeni = await talepOlusturPersonel(form, kullanici, seciliMusteri, atanan)
      if (yeni) {
        toast.success(`Talep oluşturuldu: ${yeni.talepNo}`)
        navigate(`/servis-talepleri/${yeni.id}`)
      } else {
        toast.error('Talep oluşturulamadı.')
      }
    } catch (err) {
      console.error('[YeniServisTalebi] hata:', err)
      toast.error('Hata: ' + (err?.message || 'Talep oluşturulamadı'))
    } finally {
      setKaydediliyor(false)
    }
  }

  const aktifTur = ANA_TURLER.find(t => t.id === form.anaTur)

  return (
    <div style={{ padding: 24, maxWidth: 1040, margin: '0 auto' }}>
      <button
        onClick={() => navigate('/servis-talepleri')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--text-tertiary)',
          font: '500 13px/18px var(--font-sans)',
          marginBottom: 16,
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-primary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
      >
        <ArrowLeft size={14} strokeWidth={1.5} /> Servis taleplerine dön
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Yeni Servis Talebi</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            Müşteri için arıza, talep, keşif veya bakım kaydı oluştur.
          </p>
        </div>
      </div>

      {/* 1. Müşteri seçimi */}
      <Card style={{ marginBottom: 16 }}>
        <h2 className="t-h2" style={{ marginBottom: 16 }}>1. Müşteri</h2>

        <div>
          <Label required>Müşteri</Label>
          <CustomSelect
            value={seciliMusteri?.id?.toString() || ''}
            onChange={e => musteriSec(e.target.value)}
            searchable
            placeholder="Müşteri adı, firma veya kod ara…"
          >
            <option value="">Müşteri seç…</option>
            {musteriler.map(m => (
              <option key={m.id} value={m.id}>
                {m.firma} — {m.ad} {m.soyad}{m.kod ? ` · ${m.kod}` : ''}
              </option>
            ))}
          </CustomSelect>

          {seciliMusteri && (
            <div style={{
              marginTop: 12,
              padding: 12,
              background: 'var(--brand-primary-soft)',
              border: '1px solid var(--brand-primary)',
              borderRadius: 'var(--radius-md)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Building2 size={16} strokeWidth={1.5} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-body-strong" style={{ color: 'var(--brand-primary)' }}>
                  {seciliMusteri.firma}
                </div>
                <div className="t-caption" style={{ marginTop: 2 }}>
                  {seciliMusteri.ad} {seciliMusteri.soyad}
                  {seciliMusteri.telefon && ` · ${seciliMusteri.telefon}`}
                  {seciliMusteri.sehir && ` · ${seciliMusteri.sehir}`}
                </div>
              </div>
            </div>
          )}
        </div>

      </Card>

      {/* 2. Talep türü ve kategori */}
      <Card style={{ marginBottom: 16 }}>
        <h2 className="t-h2" style={{ marginBottom: 16 }}>2. Talep türü</h2>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 16,
        }}>
          {ANA_TURLER.map(t => {
            const aktif = form.anaTur === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setForm(p => ({ ...p, anaTur: t.id, altKategori: '' }))}
                style={{
                  padding: '12px 8px',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${aktif ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                  background: aktif ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                  color: aktif ? 'var(--brand-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  font: '500 13px/18px var(--font-sans)',
                }}
              >
                {t.isim}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <Label required>Kategori</Label>
            <CustomSelect
              value={form.altKategori}
              onChange={e => setForm(p => ({ ...p, altKategori: e.target.value }))}
            >
              <option value="">{aktifTur?.isim || 'Tür'} kategorisi seç…</option>
              {altKategoriler.map(k => <option key={k.id} value={k.id}>{k.isim}</option>)}
            </CustomSelect>
          </div>
          <div>
            <Label>Aciliyet</Label>
            <CustomSelect
              value={form.aciliyet}
              onChange={e => setForm(p => ({ ...p, aciliyet: e.target.value }))}
            >
              {ACILIYET_SEVIYELERI.map(a => <option key={a.id} value={a.id}>{a.isim}</option>)}
            </CustomSelect>
          </div>
        </div>
      </Card>

      {/* 3. Detaylar */}
      <Card style={{ marginBottom: 16 }}>
        <h2 className="t-h2" style={{ marginBottom: 16 }}>3. Detaylar</h2>

        <div style={{ marginBottom: 16 }}>
          <Label required>Konu / Başlık</Label>
          <Input
            value={form.konu}
            onChange={e => setForm(p => ({ ...p, konu: e.target.value }))}
            placeholder="Kısa özet — örn: Lobby NVR ekranında görüntü yok"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <Label>Açıklama</Label>
          <Textarea
            value={form.aciklama}
            onChange={e => setForm(p => ({ ...p, aciklama: e.target.value }))}
            rows={4}
            placeholder="Sorunun veya talebin detayı, geçmiş gözlem, sistem bilgisi…"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <Label>Lokasyon</Label>
            {musteriLokasyonlari.length > 0 && (
              <CustomSelect
                value={musteriLokasyonlari.find(l => l.ad === form.lokasyon)?.id?.toString() || ''}
                onChange={e => {
                  const sec = musteriLokasyonlari.find(l => l.id?.toString() === e.target.value)
                  setForm(p => ({ ...p, lokasyon: sec?.ad || '' }))
                }}
                style={{ marginBottom: 6 }}
              >
                <option value="">— Müşteri lokasyonlarından seç…</option>
                {musteriLokasyonlari.map(l => (
                  <option key={l.id} value={l.id}>{l.ad}</option>
                ))}
              </CustomSelect>
            )}
            <Input
              value={form.lokasyon}
              onChange={e => setForm(p => ({ ...p, lokasyon: e.target.value }))}
              placeholder={musteriLokasyonlari.length > 0 ? 'veya manuel girin' : 'Şube / kat / oda'}
            />
          </div>
          <div>
            <Label>Cihaz türü</Label>
            <Input
              value={form.cihazTuru}
              onChange={e => setForm(p => ({ ...p, cihazTuru: e.target.value }))}
              placeholder="Kamera, NVR, PDKS…"
            />
          </div>
          <div>
            <Label>İlgili kişi</Label>
            <Input
              value={form.ilgiliKisi}
              onChange={e => setForm(p => ({ ...p, ilgiliKisi: e.target.value }))}
              placeholder="Müşteri tarafındaki muhatap"
            />
          </div>
          <div>
            <Label>Telefon</Label>
            <Input
              value={form.telefon}
              onChange={e => setForm(p => ({ ...p, telefon: e.target.value }))}
              placeholder="+90 5xx xxx xx xx"
            />
          </div>
          <div>
            <Label>Uygun zaman</Label>
            <Input
              value={form.uygunZaman}
              onChange={e => setForm(p => ({ ...p, uygunZaman: e.target.value }))}
              placeholder="Örn: Hafta içi 09-18"
            />
          </div>
          <div>
            <Label>Planlı tarih</Label>
            <Input
              type="date"
              value={form.planliTarih}
              onChange={e => setForm(p => ({ ...p, planliTarih: e.target.value }))}
            />
          </div>
        </div>
      </Card>

      {/* 4. Teknisyen ataması */}
      <Card style={{ marginBottom: 16 }}>
        <h2 className="t-h2" style={{ marginBottom: 4 }}>4. Teknisyen ataması</h2>
        <p className="t-caption" style={{ marginBottom: 16 }}>
          İsteğe bağlı. Atama yapılırsa talep direkt "Atandı" durumunda açılır.
        </p>

        <CustomSelect
          value={seciliTeknisyenId}
          onChange={e => setSeciliTeknisyenId(e.target.value)}
        >
          <option value="">Atama yok (durum: bekliyor)</option>
          {teknisyenler.map(k => (
            <option key={k.id} value={k.id?.toString()}>{k.ad}</option>
          ))}
        </CustomSelect>
      </Card>

      {/* Kaydet / iptal */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="secondary" onClick={() => navigate('/servis-talepleri')}>İptal</Button>
        <Button
          variant="primary"
          iconLeft={<Plus size={14} strokeWidth={1.5} />}
          onClick={kaydet}
          disabled={kaydediliyor}
        >
          {kaydediliyor ? 'Oluşturuluyor…' : 'Talep oluştur'}
        </Button>
      </div>
    </div>
  )
}
