// Yeni Toplu Bakım Oluştur — SADECE saha sorumlusu (admin + bayraklı; RLS de korur).
// Kural: müşteri + lokasyon + ziyarette yapılacak bakım kalemleri seçilir;
// seçilmeyen kalem için form/kayıt OLUŞMAZ (spec madde 1-5).
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wrench, MapPin, Save, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { musterileriGetir } from '../services/musteriService'
import { musteriLokasyonlariniGetir } from '../services/musteriLokasyonService'
import { sozlesmeleriGetir } from '../services/sozlesmeService'
import { kullanicilariGetir } from '../services/kullaniciService'
import {
  BAKIM_KALEMLERI, kalemBilgi, sahaSorumlusuMu, topluBakimOlustur,
} from '../services/topluBakimService'
import { Button, Card, Input, Select, Textarea, Label } from '../components/ui'
import ComboBox from '../components/ComboBox'
import CokluSelect from '../components/CokluSelect'

const ONCELIKLER = [
  { id: 'dusuk', ad: 'Düşük' },
  { id: 'normal', ad: 'Normal' },
  { id: 'yuksek', ad: 'Yüksek' },
  { id: 'acil', ad: 'Acil' },
]

export default function YeniTopluBakim() {
  const { kullanici } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [musteriler, setMusteriler] = useState([])
  const [personel, setPersonel] = useState([])
  const [sozlesmeler, setSozlesmeler] = useState([])
  const [lokasyonlar, setLokasyonlar] = useState([])
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const [musteriMetin, setMusteriMetin] = useState('')
  const [form, setForm] = useState({
    musteriId: null,
    lokasyonId: null,
    lokasyonAdres: '',
    sozlesmeId: null,
    bakimDonemi: '',
    planlananTarih: '',
    planlananSaat: '10:00',
    teknikPersonelId: null,
    ekipIds: [],
    musteriYetkiliAd: '',
    musteriYetkiliGorev: '',
    musteriYetkiliTel: '',
    aciklama: '',
    oncelik: 'normal',
  })
  const [secilenKalemler, setSecilenKalemler] = useState([])

  useEffect(() => {
    musterileriGetir().then((m) => setMusteriler(m || [])).catch(() => {})
    kullanicilariGetir().then((k) =>
      setPersonel((k || []).filter((u) => u.tip !== 'musteri' && !u.hesapSilindi))
    ).catch(() => {})
    sozlesmeleriGetir().then((s) => setSozlesmeler(s || [])).catch(() => {})
  }, [])

  // Müşteri seçilince lokasyonları getir
  useEffect(() => {
    setLokasyonlar([])
    setForm((f) => ({ ...f, lokasyonId: null, lokasyonAdres: '' }))
    if (!form.musteriId) return
    musteriLokasyonlariniGetir(form.musteriId).then((l) => setLokasyonlar(l || [])).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.musteriId])

  const seciliLokasyon = useMemo(
    () => lokasyonlar.find((l) => String(l.id) === String(form.lokasyonId)),
    [lokasyonlar, form.lokasyonId]
  )

  // Lokasyon seçilince adresi otomatik doldur
  useEffect(() => {
    if (seciliLokasyon) setForm((f) => ({ ...f, lokasyonAdres: seciliLokasyon.adres || '' }))
  }, [seciliLokasyon])

  const musteriSozlesmeleri = useMemo(
    () => sozlesmeler.filter((s) => String(s.musteriId ?? '') === String(form.musteriId ?? '')),
    [sozlesmeler, form.musteriId]
  )

  const kalemToggle = (tip) =>
    setSecilenKalemler((prev) =>
      prev.includes(tip) ? prev.filter((t) => t !== tip) : [...prev, tip]
    )

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }))

  const kaydet = async () => {
    if (!form.musteriId) { toast?.error?.('Müşteri seçin.'); return }
    if (!form.lokasyonId) { toast?.error?.('Lokasyon seçin.'); return }
    if (!form.planlananTarih) { toast?.error?.('Planlanan bakım tarihi girin.'); return }
    if (!form.teknikPersonelId) { toast?.error?.('Görevli teknik personel seçin.'); return }
    if (secilenKalemler.length === 0) { toast?.error?.('En az bir bakım kalemi seçin.'); return }

    setKaydediliyor(true)
    const sonuc = await topluBakimOlustur({
      musteriId: Number(form.musteriId),
      lokasyonId: Number(form.lokasyonId),
      lokasyonAdi: seciliLokasyon?.ad || null,
      lokasyonAdres: form.lokasyonAdres || null,
      sozlesmeId: form.sozlesmeId ? Number(form.sozlesmeId) : null,
      bakimDonemi: form.bakimDonemi || null,
      planlananTarih: form.planlananTarih,
      planlananSaat: form.planlananSaat || null,
      teknikPersonelId: Number(form.teknikPersonelId),
      ekipIds: form.ekipIds.map(Number),
      musteriYetkiliAd: form.musteriYetkiliAd || null,
      musteriYetkiliGorev: form.musteriYetkiliGorev || null,
      musteriYetkiliTel: form.musteriYetkiliTel || null,
      aciklama: form.aciklama || null,
      oncelik: form.oncelik,
      durum: 'atandi',           // personel seçili olduğundan doğrudan atandı
      olusturanId: kullanici?.id,
      kalemTipleri: secilenKalemler,
    })
    setKaydediliyor(false)
    if (sonuc?.hata) { toast?.error?.(sonuc.hata); return }
    toast?.success?.(`Toplu bakım oluşturuldu: ${sonuc.tbNo}`)
    navigate(`/bakim-isleri/${sonuc.id}`)
  }

  if (!sahaSorumlusuMu(kullanici)) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
        Bu sayfa yalnız saha sorumlularına açıktır.
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Wrench size={22} strokeWidth={1.8} style={{ color: 'var(--brand-primary)' }} />
        <h2 style={{ margin: 0, font: '700 20px/26px var(--font-sans)', color: 'var(--text-primary)' }}>
          Yeni Toplu Bakım Oluştur
        </h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
        {/* Sol — iş bilgileri */}
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Label>Müşteri *</Label>
            {/* ComboBox metin tabanlı — seçilen ada göre müşteri id çözülür */}
            <ComboBox
              value={musteriMetin}
              options={musteriler
                .map((m) => m.firma || `${m.ad ?? ''} ${m.soyad ?? ''}`.trim())
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b, 'tr'))}
              allowNew={false}
              maxGoster={200}
              placeholder={`Müşteri ara ve seç… (${musteriler.length} müşteri)`}
              onChange={(metin) => {
                setMusteriMetin(metin)
                const bul = musteriler.find(
                  (m) => (m.firma || `${m.ad ?? ''} ${m.soyad ?? ''}`.trim()) === metin
                )
                setForm((f) => ({ ...f, musteriId: bul ? bul.id : null }))
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Lokasyon *</Label>
              <Select value={form.lokasyonId ?? ''} onChange={set('lokasyonId')} disabled={!form.musteriId}>
                <option value="">{form.musteriId ? (lokasyonlar.length ? '— Seçin —' : 'Lokasyon tanımlı değil') : 'Önce müşteri seçin'}</option>
                {lokasyonlar.map((l) => <option key={l.id} value={l.id}>{l.ad}</option>)}
              </Select>
              {seciliLokasyon?.bulunanSistemler?.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  Lokasyonda bulunan: {seciliLokasyon.bulunanSistemler.map((s) => kalemBilgi(s).isim).join(', ')}
                </div>
              )}
            </div>
            <div>
              <Label>Bakım Sözleşmesi</Label>
              <Select value={form.sozlesmeId ?? ''} onChange={set('sozlesmeId')} disabled={!form.musteriId}>
                <option value="">— Yok / Seçilmedi —</option>
                {musteriSozlesmeleri.map((s) => (
                  <option key={s.id} value={s.id}>{s.sozlesmeNo || s.baslik || `Sözleşme #${s.id}`}</option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label>Lokasyon Adresi</Label>
            <Input value={form.lokasyonAdres} onChange={set('lokasyonAdres')} placeholder="Adres" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <Label>Bakım Dönemi</Label>
              <Input value={form.bakimDonemi} onChange={set('bakimDonemi')} placeholder="örn. 2026 - Temmuz" />
            </div>
            <div>
              <Label>Planlanan Tarih *</Label>
              <Input type="date" value={form.planlananTarih} onChange={set('planlananTarih')} />
            </div>
            <div>
              <Label>Planlanan Saat</Label>
              <Input type="time" value={form.planlananSaat} onChange={set('planlananSaat')} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Görevli Teknik Personel *</Label>
              <Select value={form.teknikPersonelId ?? ''} onChange={set('teknikPersonelId')}>
                <option value="">— Seçin —</option>
                {personel.map((p) => <option key={p.id} value={p.id}>{p.ad}</option>)}
              </Select>
            </div>
            <div>
              <Label>Yardımcı Ekip</Label>
              <CokluSelect
                degerler={form.ekipIds}
                onChange={(ids) => setForm((f) => ({ ...f, ekipIds: ids }))}
                secenekler={personel
                  .filter((p) => String(p.id) !== String(form.teknikPersonelId))
                  .map((p) => ({ id: p.id, ad: p.ad }))}
                placeholder="Ekip üyeleri (opsiyonel)"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <Label>Müşteri Yetkilisi</Label>
              <Input value={form.musteriYetkiliAd} onChange={set('musteriYetkiliAd')} placeholder="Ad Soyad" />
            </div>
            <div>
              <Label>Görevi</Label>
              <Input value={form.musteriYetkiliGorev} onChange={set('musteriYetkiliGorev')} placeholder="örn. Tesis Sorumlusu" />
            </div>
            <div>
              <Label>Telefonu</Label>
              <Input value={form.musteriYetkiliTel} onChange={set('musteriYetkiliTel')} placeholder="05xx xxx xx xx" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12 }}>
            <div>
              <Label>Saha Sorumlusu Açıklaması</Label>
              <Textarea rows={2} value={form.aciklama} onChange={set('aciklama')} placeholder="Teknik personele iletilecek not…" />
            </div>
            <div>
              <Label>Öncelik</Label>
              <Select value={form.oncelik} onChange={set('oncelik')}>
                {ONCELIKLER.map((o) => <option key={o.id} value={o.id}>{o.ad}</option>)}
              </Select>
            </div>
          </div>
        </Card>

        {/* Sağ — bakım kalemleri */}
        <Card>
          <div style={{ font: '700 13px/18px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 10 }}>
            YAPILACAK BAKIM KALEMLERİNİ SEÇİN
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(BAKIM_KALEMLERI).map(([tip, b]) => {
              const secili = secilenKalemler.includes(tip)
              return (
                <button
                  key={tip}
                  type="button"
                  onClick={() => kalemToggle(tip)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    border: `1.5px solid ${secili ? b.renk : 'var(--border-default)'}`,
                    background: secili ? `${b.renk}14` : 'var(--surface-card)',
                    color: 'var(--text-primary)', font: '500 13px/18px var(--font-sans)',
                    textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    border: `2px solid ${secili ? b.renk : 'var(--border-default)'}`,
                    background: secili ? b.renk : 'transparent',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 12, fontWeight: 800,
                  }}>
                    {secili ? '✓' : ''}
                  </span>
                  {b.ikon} {b.isim}
                </button>
              )
            })}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-tertiary)' }}>
            Seçilen kalem sayısı: <strong>{secilenKalemler.length}</strong>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
            <MapPin size={12} style={{ flexShrink: 0, marginTop: 1 }} />
            Teknik personel yalnız seçtiğiniz kalemleri görür; seçilmeyenler için form oluşmaz.
          </div>
        </Card>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button variant="ghost" onClick={() => navigate('/bakim-isleri')}>
          <X size={15} /> İptal
        </Button>
        <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
          <Save size={15} /> {kaydediliyor ? 'Oluşturuluyor…' : 'Toplu Bakım İşini Oluştur'}
        </Button>
      </div>
    </div>
  )
}
