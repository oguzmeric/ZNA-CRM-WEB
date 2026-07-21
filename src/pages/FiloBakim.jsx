// Araç Bakımları — bakım geçmişi + araç başına "sonraki bakıma kalan km" takibi.
// Bakım kaydı girilince: girilen km araç km'sini tazeler, sonraki bakım hedefi
// (varsayılan: km + bakım aralığı) araç kartına yazılır; eşik yaklaşınca
// günlük cron yöneticilere push atar.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Wrench, Plus, Trash2, ExternalLink, Paperclip, Gauge } from 'lucide-react'
import { Button, Card, EmptyState, Modal, Input, Select, Label, Textarea, Table, THead, TBody, TR, TH, TD, Badge } from '../components/ui'
import { bakimlariGetir, bakimEkle, bakimSil, filoAraclariGetir, filoDosyaYukle, filoDosyaUrl, sonYuklemeHata, BAKIM_TIPLERI } from '../services/filoService'
import { fmtTarih, fmtTL, FiloKpi } from '../components/FiloOrtak'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { SkeletonList } from '../components/Skeleton'

export default function FiloBakim() {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { kullanici } = useAuth()
  const [bakimlar, setBakimlar] = useState([])
  const [araclar, setAraclar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [modalAcik, setModalAcik] = useState(false)
  const [aracFiltre, setAracFiltre] = useState('')

  const yukle = async () => {
    const [b, a] = await Promise.all([bakimlariGetir(), filoAraclariGetir()])
    setBakimlar(b); setAraclar(a)
    setYukleniyor(false)
  }
  useEffect(() => { yukle() }, [])

  const gorunen = useMemo(() =>
    aracFiltre ? bakimlar.filter(b => String(b.aracId) === aracFiltre) : bakimlar,
  [bakimlar, aracFiltre])

  const buYil = new Date().getFullYear()
  const ozet = useMemo(() => {
    const yillik = bakimlar.filter(b => new Date(b.tarih).getFullYear() === buYil)
    const yaklasan = araclar.filter(a => a.guncelKm && a.sonrakiBakimKm && (a.sonrakiBakimKm - a.guncelKm) <= 1000).length
    return {
      yillikSayi: yillik.length,
      yillikTutar: yillik.reduce((s, b) => s + Number(b.tutar || 0), 0),
      yaklasan,
    }
  }, [bakimlar, araclar, buYil])

  const sil = async (b) => {
    const onay = await confirm({
      baslik: 'Bakım Kaydını Sil',
      mesaj: `${b.arac?.plaka || ''} — ${fmtTarih(b.tarih)} bakım kaydı silinsin mi?`,
      onayMetin: 'Sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    const ok = await bakimSil(b.id)
    if (ok) { toast.success('Kayıt silindi.'); yukle() } else toast.error('Silinemedi.')
  }

  const dosyaAc = async (path) => {
    const url = await filoDosyaUrl(path)
    if (url) window.open(url, '_blank')
    else toast.error('Dosya açılamadı.')
  }

  if (yukleniyor) return <SkeletonList />

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 className="t-h1" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Wrench size={22} strokeWidth={1.75} /> Araç Bakımları
          </h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            Araç KM'si yakıt fişi ve bakım girişlerinden güncellenir; hedefe 1000 km kala yöneticilere bildirim gider.
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => setModalAcik(true)}>
          Yeni Bakım Kaydı
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <FiloKpi etiket={`${buYil} Bakım Sayısı`} deger={ozet.yillikSayi} />
        <FiloKpi etiket={`${buYil} Bakım Gideri`} deger={fmtTL(ozet.yillikTutar)} />
        <FiloKpi etiket="Bakımı Yaklaşan Araç" deger={ozet.yaklasan} renk={ozet.yaklasan > 0 ? '#B45309' : 'var(--text-primary)'} />
      </div>

      {/* Araç bakım durumu kartları */}
      <Card style={{ padding: 0, marginBottom: 16 }}>
        <Table>
          <THead>
            <TR>
              <TH>Araç</TH>
              <TH>Güncel KM</TH>
              <TH>Sonraki Bakım</TH>
              <TH>Durum</TH>
            </TR>
          </THead>
          <TBody>
            {araclar.map(a => {
              const kalan = a.guncelKm && a.sonrakiBakimKm ? a.sonrakiBakimKm - a.guncelKm : null
              return (
                <TR key={a.id}>
                  <TD>
                    <strong>{a.plaka}</strong>
                    {(a.marka || a.model) && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{[a.marka, a.model].filter(Boolean).join(' ')}</div>}
                  </TD>
                  <TD>
                    {a.guncelKm
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Gauge size={13} strokeWidth={1.5} /> {a.guncelKm.toLocaleString('tr-TR')} km
                          {a.guncelKmZamani && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({fmtTarih(a.guncelKmZamani)})</span>}
                        </span>
                      : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>KM girilmemiş</span>}
                  </TD>
                  <TD>{a.sonrakiBakimKm ? `${a.sonrakiBakimKm.toLocaleString('tr-TR')} km` : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}</TD>
                  <TD>
                    {kalan == null
                      ? <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>takip için km + hedef girin</span>
                      : kalan < 0
                        ? <Badge tone="kayip">{Math.abs(kalan).toLocaleString('tr-TR')} km GEÇTİ</Badge>
                        : kalan <= 1000
                          ? <Badge tone="beklemede">{kalan.toLocaleString('tr-TR')} km kaldı</Badge>
                          : <Badge tone="aktif">{kalan.toLocaleString('tr-TR')} km kaldı</Badge>}
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      </Card>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="t-h3" style={{ margin: 0 }}>Bakım Geçmişi ({gorunen.length})</h2>
        <Select value={aracFiltre} onChange={e => setAracFiltre(e.target.value)} style={{ maxWidth: 240 }}>
          <option value="">Tüm araçlar</option>
          {araclar.map(a => <option key={a.id} value={a.id}>{a.plaka}</option>)}
        </Select>
      </div>

      {gorunen.length === 0 ? (
        <EmptyState
          icon={<Wrench size={32} strokeWidth={1.5} />}
          title="Bakım kaydı yok"
          description='"Yeni Bakım Kaydı" ile geçmişi oluşturmaya başlayın.'
        />
      ) : (
        <Card style={{ padding: 0 }}>
          <Table>
            <THead>
              <TR>
                <TH>Tarih</TH>
                <TH>Araç</TH>
                <TH>Tür</TH>
                <TH>Açıklama</TH>
                <TH>KM</TH>
                <TH>Tutar</TH>
                <TH>Servis</TH>
                <TH>Fatura</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {gorunen.map(b => (
                <TR key={b.id}>
                  <TD>{fmtTarih(b.tarih)}</TD>
                  <TD><strong>{b.arac?.plaka || '—'}</strong></TD>
                  <TD>{BAKIM_TIPLERI.find(t => t.id === b.bakimTipi)?.isim || b.bakimTipi}</TD>
                  <TD style={{ maxWidth: 260 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.aciklama || '—'}</span>
                  </TD>
                  <TD>{b.km ? b.km.toLocaleString('tr-TR') : '—'}</TD>
                  <TD>{fmtTL(b.tutar)}</TD>
                  <TD>{b.servisAdi || '—'}</TD>
                  <TD>
                    {b.faturaUrl ? (
                      <Button variant="ghost" size="sm" iconLeft={<ExternalLink size={13} strokeWidth={1.5} />} onClick={() => dosyaAc(b.faturaUrl)}>Aç</Button>
                    ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                  </TD>
                  <TD>
                    <Button variant="ghost" size="sm" onClick={() => sil(b)} title="Sil">
                      <Trash2 size={14} strokeWidth={1.5} />
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <YeniBakimModal
        acik={modalAcik}
        araclar={araclar}
        kullanici={kullanici}
        onKapat={() => setModalAcik(false)}
        onKaydedildi={() => { setModalAcik(false); yukle() }}
      />
    </div>
  )
}

function YeniBakimModal({ acik, araclar, kullanici, onKapat, onKaydedildi }) {
  const { toast } = useToast()
  const dosyaRef = useRef(null)
  const [form, setForm] = useState({})
  const [dosya, setDosya] = useState(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const alan = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (acik) {
      setForm({ tarih: new Date().toISOString().slice(0, 10), bakimTipi: 'periyodik' })
      setDosya(null)
    }
  }, [acik])

  if (!acik) return null

  const secilenArac = araclar.find(a => String(a.id) === String(form.aracId))

  // Araç veya km değişince sonraki bakım önerisi: km + bakım aralığı
  const kmDegisti = (v) => {
    alan('km', v)
    const km = Number(v)
    if (km && secilenArac && !form.sonrakiBakimKmElle) {
      setForm(f => ({ ...f, km: v, sonrakiBakimKm: String(km + (secilenArac.bakimAraligiKm || 10000)) }))
    }
  }

  const kaydet = async () => {
    if (!form.aracId) { toast.error('Araç seçin.'); return }
    if (!form.tarih) { toast.error('Tarih gerekli.'); return }
    setKaydediliyor(true)
    let dosyaPath = null
    if (dosya) {
      dosyaPath = await filoDosyaYukle(dosya, `bakim/${form.aracId}`)
      if (!dosyaPath) { setKaydediliyor(false); toast.error('Dosya yüklenemedi: ' + (sonYuklemeHata || 'bilinmeyen hata')); return }
    }
    const sonuc = await bakimEkle({
      aracId: form.aracId,
      tarih: form.tarih,
      km: form.km ? Number(form.km) : null,
      bakimTipi: form.bakimTipi,
      aciklama: form.aciklama?.trim() || null,
      tutar: form.tutar ? Number(form.tutar) : null,
      servisAdi: form.servisAdi?.trim() || null,
      sonrakiBakimKm: form.sonrakiBakimKm ? Number(form.sonrakiBakimKm) : null,
      sonrakiBakimTarih: form.sonrakiBakimTarih || null,
      faturaUrl: dosyaPath,
      olusturanId: kullanici?.id || null,
    })
    setKaydediliyor(false)
    if (sonuc?._hata) { toast.error('Kaydedilemedi: ' + sonuc._hata); return }
    toast.success('Bakım kaydedildi.')
    onKaydedildi()
  }

  return (
    <Modal open onClose={onKapat} title="Yeni Bakım Kaydı" width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <Label>Araç *</Label>
            <Select value={form.aracId || ''} onChange={e => alan('aracId', e.target.value)}>
              <option value="">Seçiniz</option>
              {araclar.map(a => <option key={a.id} value={a.id}>{a.plaka}</option>)}
            </Select>
          </div>
          <div>
            <Label>Tarih *</Label>
            <Input type="date" value={form.tarih || ''} onChange={e => alan('tarih', e.target.value)} />
          </div>
          <div>
            <Label>Bakım Türü</Label>
            <Select value={form.bakimTipi || 'periyodik'} onChange={e => alan('bakimTipi', e.target.value)}>
              {BAKIM_TIPLERI.map(t => <option key={t.id} value={t.id}>{t.isim}</option>)}
            </Select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <Label>Araç KM</Label>
            <Input type="number" value={form.km || ''} onChange={e => kmDegisti(e.target.value)}
              placeholder={secilenArac?.guncelKm ? String(secilenArac.guncelKm) : ''} />
          </div>
          <div>
            <Label>Tutar (₺)</Label>
            <Input type="number" value={form.tutar || ''} onChange={e => alan('tutar', e.target.value)} />
          </div>
          <div>
            <Label>Servis</Label>
            <Input value={form.servisAdi || ''} onChange={e => alan('servisAdi', e.target.value)} placeholder="Yetkili servis adı" />
          </div>
        </div>

        <div>
          <Label>Açıklama (yapılan işlemler)</Label>
          <Textarea rows={2} value={form.aciklama || ''} onChange={e => alan('aciklama', e.target.value)} placeholder="Yağ + filtre değişimi, fren balataları..." />
        </div>

        <div style={{
          padding: 12, borderRadius: 8, background: 'var(--surface-sunken)',
          border: '1px dashed var(--border-default)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
            Sonraki bakım hedefi (hatırlatma bu değerlerden çalışır)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Sonraki Bakım KM</Label>
              <Input type="number" value={form.sonrakiBakimKm || ''}
                onChange={e => setForm(f => ({ ...f, sonrakiBakimKm: e.target.value, sonrakiBakimKmElle: true }))}
                placeholder={form.km ? String(Number(form.km) + 10000) : 'örn. 95000'} />
            </div>
            <div>
              <Label>Sonraki Bakım Tarihi</Label>
              <Input type="date" value={form.sonrakiBakimTarih || ''} onChange={e => alan('sonrakiBakimTarih', e.target.value)} />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
          <div>
            <Label>Fatura (PDF/foto)</Label>
            <Button variant="secondary" iconLeft={<Paperclip size={14} strokeWidth={1.5} />} onClick={() => dosyaRef.current?.click()} style={{ width: '100%' }}>
              {dosya ? dosya.name.slice(0, 22) : 'Dosya Seç'}
            </Button>
            <input ref={dosyaRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
              onChange={e => setDosya(e.target.files?.[0] || null)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="ghost" onClick={onKapat} disabled={kaydediliyor}>Vazgeç</Button>
            <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
              {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
