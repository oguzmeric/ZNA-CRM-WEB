// Yakıt Fişleri — gider takibi + araç başına tüketim (L/100km).
// Tüketim hesabı: aynı aracın ardışık fişleri arasındaki km farkı / litre.
// Fişte girilen km, araç güncel km'sini de tazeler (bakım hatırlatması buradan beslenir).

import { useEffect, useMemo, useRef, useState } from 'react'
import { Fuel, Plus, Trash2, ExternalLink, Paperclip } from 'lucide-react'
import { Button, Card, EmptyState, Modal, Input, Select, Label, Table, THead, TBody, TR, TH, TD } from '../components/ui'
import { yakitlariGetir, yakitEkle, yakitSil, filoAraclariGetir, filoDosyaYukle, filoDosyaUrl, sonYuklemeHata } from '../services/filoService'
import { fmtTarih, fmtTL, FiloKpi } from '../components/FiloOrtak'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { SkeletonList } from '../components/Skeleton'

export default function FiloYakit() {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { kullanici } = useAuth()
  const [kayitlar, setKayitlar] = useState([])
  const [araclar, setAraclar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [modalAcik, setModalAcik] = useState(false)
  const [aracFiltre, setAracFiltre] = useState('')

  const yukle = async () => {
    const [y, a] = await Promise.all([yakitlariGetir(), filoAraclariGetir()])
    setKayitlar(y); setAraclar(a)
    setYukleniyor(false)
  }
  useEffect(() => { yukle() }, [])

  const gorunen = useMemo(() =>
    aracFiltre ? kayitlar.filter(k => String(k.aracId) === aracFiltre) : kayitlar,
  [kayitlar, aracFiltre])

  const simdi = new Date()
  const ozet = useMemo(() => {
    const buAy = kayitlar.filter(k => {
      const t = new Date(k.tarih)
      return t.getFullYear() === simdi.getFullYear() && t.getMonth() === simdi.getMonth()
    })
    const litre = buAy.reduce((s, k) => s + Number(k.litre || 0), 0)
    const tutar = buAy.reduce((s, k) => s + Number(k.tutar || 0), 0)
    return {
      fisSayi: buAy.length,
      litre: Math.round(litre),
      tutar,
      ortFiyat: litre > 0 ? tutar / litre : null,
    }
  }, [kayitlar]) // eslint-disable-line react-hooks/exhaustive-deps

  // Araç başına tüketim: km'li ardışık fişlerden L/100km
  const tuketim = useMemo(() => {
    const sonuc = []
    for (const a of araclar) {
      const fisler = kayitlar
        .filter(k => String(k.aracId) === String(a.id) && k.km && k.litre)
        .sort((x, y) => x.km - y.km)
      if (fisler.length < 2) continue
      // İlk fişin litresi önceki dönemi doldurur — km aralığına sonraki fişlerin litresi düşer
      const kmFark = fisler[fisler.length - 1].km - fisler[0].km
      const litreToplam = fisler.slice(1).reduce((s, f) => s + Number(f.litre), 0)
      if (kmFark <= 0 || litreToplam <= 0) continue
      sonuc.push({
        arac: a,
        l100: (litreToplam / kmFark) * 100,
        kmFark,
        fisSayi: fisler.length,
      })
    }
    return sonuc.sort((x, y) => y.l100 - x.l100)
  }, [kayitlar, araclar])

  const sil = async (k) => {
    const onay = await confirm({
      baslik: 'Fişi Sil',
      mesaj: `${k.arac?.plaka || ''} — ${fmtTarih(k.tarih)} yakıt fişi silinsin mi?`,
      onayMetin: 'Sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    const ok = await yakitSil(k)
    if (ok) { toast.success('Fiş silindi.'); yukle() } else toast.error('Silinemedi.')
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
            <Fuel size={22} strokeWidth={1.75} /> Yakıt Fişleri
          </h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            Fişteki KM araç kilometresini günceller; iki fiş arası mesafeden tüketim hesaplanır.
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => setModalAcik(true)}>
          Yeni Fiş
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <FiloKpi etiket="Bu Ay Fiş" deger={ozet.fisSayi} />
        <FiloKpi etiket="Bu Ay Litre" deger={ozet.litre.toLocaleString('tr-TR') + ' L'} />
        <FiloKpi etiket="Bu Ay Tutar" deger={fmtTL(ozet.tutar)} renk="#B45309" />
        <FiloKpi etiket="Ort. ₺/Litre" deger={ozet.ortFiyat ? '₺' + ozet.ortFiyat.toFixed(2) : '—'} />
      </div>

      {/* Tüketim özeti */}
      {tuketim.length > 0 && (
        <Card style={{ padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Araç Başına Tüketim</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {tuketim.map(t => (
              <div key={t.arac.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: 8,
                background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{t.arac.plaka}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.kmFark.toLocaleString('tr-TR')} km · {t.fisSayi} fiş</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>
                    {t.l100.toFixed(1)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>L/100km</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="t-h3" style={{ margin: 0 }}>Fişler ({gorunen.length})</h2>
        <Select value={aracFiltre} onChange={e => setAracFiltre(e.target.value)} style={{ maxWidth: 240 }}>
          <option value="">Tüm araçlar</option>
          {araclar.map(a => <option key={a.id} value={a.id}>{a.plaka}</option>)}
        </Select>
      </div>

      {gorunen.length === 0 ? (
        <EmptyState
          icon={<Fuel size={32} strokeWidth={1.5} />}
          title="Yakıt fişi yok"
          description='"Yeni Fiş" ile gider ve tüketim takibine başlayın.'
        />
      ) : (
        <Card style={{ padding: 0 }}>
          <Table>
            <THead>
              <TR>
                <TH>Tarih</TH>
                <TH>Araç</TH>
                <TH>Litre</TH>
                <TH>₺/L</TH>
                <TH>Tutar</TH>
                <TH>KM</TH>
                <TH>İstasyon</TH>
                <TH>Fiş</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {gorunen.map(k => (
                <TR key={k.id}>
                  <TD>{fmtTarih(k.tarih)}</TD>
                  <TD><strong>{k.arac?.plaka || '—'}</strong></TD>
                  <TD>{k.litre ? Number(k.litre).toFixed(1) : '—'}</TD>
                  <TD>{k.birimFiyat ? '₺' + Number(k.birimFiyat).toFixed(2) : '—'}</TD>
                  <TD><strong>{fmtTL(k.tutar)}</strong></TD>
                  <TD>{k.km ? k.km.toLocaleString('tr-TR') : '—'}</TD>
                  <TD>{k.istasyon || '—'}</TD>
                  <TD>
                    {k.fisUrl ? (
                      <Button variant="ghost" size="sm" iconLeft={<ExternalLink size={13} strokeWidth={1.5} />} onClick={() => dosyaAc(k.fisUrl)}>Aç</Button>
                    ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                  </TD>
                  <TD>
                    <Button variant="ghost" size="sm" onClick={() => sil(k)} title="Sil">
                      <Trash2 size={14} strokeWidth={1.5} />
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <YeniFisModal
        acik={modalAcik}
        araclar={araclar}
        kullanici={kullanici}
        onKapat={() => setModalAcik(false)}
        onKaydedildi={() => { setModalAcik(false); yukle() }}
      />
    </div>
  )
}

function YeniFisModal({ acik, araclar, kullanici, onKapat, onKaydedildi }) {
  const { toast } = useToast()
  const dosyaRef = useRef(null)
  const [form, setForm] = useState({})
  const [dosya, setDosya] = useState(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const alan = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (acik) { setForm({ tarih: new Date().toISOString().slice(0, 10) }); setDosya(null) }
  }, [acik])

  if (!acik) return null

  const secilenArac = araclar.find(a => String(a.id) === String(form.aracId))
  const birimFiyat = form.litre && form.tutar && Number(form.litre) > 0
    ? (Number(form.tutar) / Number(form.litre))
    : null

  const kaydet = async () => {
    if (!form.aracId) { toast.error('Araç seçin.'); return }
    if (!form.tutar) { toast.error('Tutar gerekli.'); return }
    setKaydediliyor(true)
    let dosyaPath = null
    if (dosya) {
      dosyaPath = await filoDosyaYukle(dosya, `yakit/${form.aracId}`)
      if (!dosyaPath) { setKaydediliyor(false); toast.error('Dosya yüklenemedi: ' + (sonYuklemeHata || 'bilinmeyen hata')); return }
    }
    const sonuc = await yakitEkle({
      aracId: form.aracId,
      tarih: form.tarih,
      km: form.km ? Number(form.km) : null,
      litre: form.litre ? Number(form.litre) : null,
      birimFiyat: birimFiyat ? Number(birimFiyat.toFixed(3)) : null,
      tutar: Number(form.tutar),
      istasyon: form.istasyon?.trim() || null,
      yakitTipi: secilenArac?.yakitTipi || null,
      fisNo: form.fisNo?.trim() || null,
      fisUrl: dosyaPath,
      olusturanId: kullanici?.id || null,
    })
    setKaydediliyor(false)
    if (sonuc?._hata) { toast.error('Kaydedilemedi: ' + sonuc._hata); return }
    toast.success('Fiş kaydedildi.')
    onKaydedildi()
  }

  return (
    <Modal open onClose={onKapat} title="Yeni Yakıt Fişi" width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <Label>Litre</Label>
            <Input type="number" step="0.01" value={form.litre || ''} onChange={e => alan('litre', e.target.value)} />
          </div>
          <div>
            <Label>Tutar (₺) *</Label>
            <Input type="number" step="0.01" value={form.tutar || ''} onChange={e => alan('tutar', e.target.value)} />
          </div>
          <div>
            <Label>₺/Litre</Label>
            <Input value={birimFiyat ? birimFiyat.toFixed(2) : ''} readOnly placeholder="otomatik" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label>Araç KM (tüketim için önemli)</Label>
            <Input type="number" value={form.km || ''} onChange={e => alan('km', e.target.value)}
              placeholder={secilenArac?.guncelKm ? `son: ${secilenArac.guncelKm}` : ''} />
          </div>
          <div>
            <Label>İstasyon</Label>
            <Input value={form.istasyon || ''} onChange={e => alan('istasyon', e.target.value)} placeholder="Opet, Shell..." />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
          <div>
            <Label>Fiş No / Foto</Label>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input value={form.fisNo || ''} onChange={e => alan('fisNo', e.target.value)} placeholder="Fiş no" style={{ flex: 1 }} />
              <Button variant="secondary" onClick={() => dosyaRef.current?.click()} title="Fiş fotoğrafı">
                <Paperclip size={14} strokeWidth={1.5} />
              </Button>
            </div>
            {dosya && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{dosya.name}</div>}
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
