// Sözleşmeler — bakım/kiralama/hizmet sözleşmeleri, bitiş takibiyle.
// Bitişe ≤30 gün kalanlar sabah özetine ve buradaki rozetlere düşer.

import { useEffect, useMemo, useRef, useState } from 'react'
import { FileSignature, Plus, Trash2, Pencil, ExternalLink, Paperclip } from 'lucide-react'
import { Button, Card, EmptyState, Modal, Input, Select, Label, Textarea, Table, THead, TBody, TR, TH, TD, Badge } from '../components/ui'
import { sozlesmeleriGetir, sozlesmeEkle, sozlesmeGuncelle, sozlesmeSil, SOZLESME_TIPLERI } from '../services/sozlesmeService'
import { filoDosyaYukle, filoDosyaUrl } from '../services/filoService'
import { musterileriGetir } from '../services/musteriService'
import { fmtTL, kalanGun, BitisRozet, FiloKpi } from '../components/FiloOrtak'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { SkeletonList } from '../components/Skeleton'

export default function Sozlesmeler() {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { kullanici } = useAuth()
  const [sozlesmeler, setSozlesmeler] = useState([])
  const [musteriler, setMusteriler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [modal, setModal] = useState(null) // null | {} (yeni) | sozlesme (düzenle)
  const [tipFiltre, setTipFiltre] = useState('')

  const yukle = async () => {
    const [s, m] = await Promise.all([sozlesmeleriGetir(), musterileriGetir()])
    setSozlesmeler(s); setMusteriler(m || [])
    setYukleniyor(false)
  }
  useEffect(() => { yukle() }, [])

  const gorunen = useMemo(() =>
    tipFiltre ? sozlesmeler.filter(s => s.sozlesmeTipi === tipFiltre) : sozlesmeler,
  [sozlesmeler, tipFiltre])

  const ozet = useMemo(() => {
    const aktifler = sozlesmeler.filter(s => s.aktif)
    return {
      aktif: aktifler.length,
      yaklasan: aktifler.filter(s => { const g = kalanGun(s.bitisTarih); return g != null && g >= 0 && g <= 30 }).length,
      gecen: aktifler.filter(s => { const g = kalanGun(s.bitisTarih); return g != null && g < 0 }).length,
      yillikTutar: aktifler.reduce((t, s) => t + Number(s.tutar || 0), 0),
    }
  }, [sozlesmeler])

  const sil = async (s) => {
    const onay = await confirm({
      baslik: 'Sözleşmeyi Sil',
      mesaj: `"${s.baslik}" sözleşmesi kalıcı olarak silinsin mi?`,
      onayMetin: 'Sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    const ok = await sozlesmeSil(s)
    if (ok) { toast.success('Sözleşme silindi.'); yukle() } else toast.error('Silinemedi.')
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
            <FileSignature size={22} strokeWidth={1.75} /> Sözleşmeler
          </h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            Bitişe 30 gün kalan sözleşmeler sabah özetinde görünür.
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => setModal({})}>
          Yeni Sözleşme
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <FiloKpi etiket="Aktif Sözleşme" deger={ozet.aktif} />
        <FiloKpi etiket="30 Gün İçinde Bitiyor" deger={ozet.yaklasan} renk={ozet.yaklasan > 0 ? '#B45309' : 'var(--text-primary)'} />
        <FiloKpi etiket="Süresi Geçmiş" deger={ozet.gecen} renk={ozet.gecen > 0 ? '#DC2626' : 'var(--text-primary)'} />
        <FiloKpi etiket="Aktif Sözleşme Değeri" deger={fmtTL(ozet.yillikTutar)} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Select value={tipFiltre} onChange={e => setTipFiltre(e.target.value)} style={{ maxWidth: 240 }}>
          <option value="">Tüm tipler</option>
          {SOZLESME_TIPLERI.map(t => <option key={t.id} value={t.id}>{t.isim}</option>)}
        </Select>
      </div>

      {gorunen.length === 0 ? (
        <EmptyState
          icon={<FileSignature size={32} strokeWidth={1.5} />}
          title="Sözleşme kaydı yok"
          description='"Yeni Sözleşme" ile bakım ve hizmet sözleşmelerinizi takibe alın.'
        />
      ) : (
        <Card style={{ padding: 0 }}>
          <Table>
            <THead>
              <TR>
                <TH>Sözleşme</TH>
                <TH>Müşteri</TH>
                <TH>Tip</TH>
                <TH>Bitiş</TH>
                <TH>Tutar</TH>
                <TH>Dosya</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {gorunen.map(s => (
                <TR key={s.id} style={{ opacity: s.aktif ? 1 : 0.55 }}>
                  <TD>
                    <strong>{s.baslik}</strong>
                    {!s.aktif && <Badge tone="pasif" style={{ marginLeft: 6 }}>Pasif</Badge>}
                    {s.otomatikYenileme && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>otomatik yenilenir</div>}
                  </TD>
                  <TD>{s.musteri?.firma || s.firmaAdi || '—'}</TD>
                  <TD>{SOZLESME_TIPLERI.find(t => t.id === s.sozlesmeTipi)?.isim || s.sozlesmeTipi}</TD>
                  <TD>{s.aktif ? <BitisRozet bitis={s.bitisTarih} /> : <span style={{ fontSize: 12 }}>{s.bitisTarih}</span>}</TD>
                  <TD>{fmtTL(s.tutar)}</TD>
                  <TD>
                    {s.dosyaUrl ? (
                      <Button variant="ghost" size="sm" iconLeft={<ExternalLink size={13} strokeWidth={1.5} />} onClick={() => dosyaAc(s.dosyaUrl)}>Aç</Button>
                    ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                  </TD>
                  <TD>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button variant="ghost" size="sm" onClick={() => setModal(s)} title="Düzenle">
                        <Pencil size={14} strokeWidth={1.5} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => sil(s)} title="Sil">
                        <Trash2 size={14} strokeWidth={1.5} />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {modal !== null && (
        <SozlesmeModal
          mevcut={modal.id ? modal : null}
          musteriler={musteriler}
          kullanici={kullanici}
          onKapat={() => setModal(null)}
          onKaydedildi={() => { setModal(null); yukle() }}
        />
      )}
    </div>
  )
}

function SozlesmeModal({ mevcut, musteriler, kullanici, onKapat, onKaydedildi }) {
  const { toast } = useToast()
  const dosyaRef = useRef(null)
  const [form, setForm] = useState(() => mevcut ? {
    baslik: mevcut.baslik, sozlesmeTipi: mevcut.sozlesmeTipi,
    musteriId: mevcut.musteriId || '', firmaAdi: mevcut.firmaAdi || '',
    baslangicTarih: mevcut.baslangicTarih || '', bitisTarih: mevcut.bitisTarih || '',
    tutar: mevcut.tutar || '', otomatikYenileme: !!mevcut.otomatikYenileme,
    notlar: mevcut.notlar || '', aktif: mevcut.aktif !== false,
  } : { sozlesmeTipi: 'bakim', aktif: true, otomatikYenileme: false })
  const [dosya, setDosya] = useState(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const alan = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const kaydet = async () => {
    if (!form.baslik?.trim()) { toast.error('Sözleşme başlığı gerekli.'); return }
    if (!form.bitisTarih) { toast.error('Bitiş tarihi gerekli — takip bu tarihten çalışır.'); return }
    setKaydediliyor(true)
    let dosyaPath = mevcut?.dosyaUrl || null
    if (dosya) {
      dosyaPath = await filoDosyaYukle(dosya, 'sozlesme')
      if (!dosyaPath) { setKaydediliyor(false); toast.error('Dosya yüklenemedi.'); return }
    }
    const payload = {
      baslik: form.baslik.trim(),
      sozlesmeTipi: form.sozlesmeTipi,
      musteriId: form.musteriId ? Number(form.musteriId) : null,
      firmaAdi: form.firmaAdi?.trim() || null,
      baslangicTarih: form.baslangicTarih || null,
      bitisTarih: form.bitisTarih,
      tutar: form.tutar ? Number(form.tutar) : null,
      otomatikYenileme: !!form.otomatikYenileme,
      dosyaUrl: dosyaPath,
      notlar: form.notlar?.trim() || null,
      aktif: !!form.aktif,
    }
    const sonuc = mevcut
      ? await sozlesmeGuncelle(mevcut.id, payload)
      : await sozlesmeEkle({ ...payload, olusturanId: kullanici?.id || null })
    setKaydediliyor(false)
    if (sonuc?._hata) { toast.error('Kaydedilemedi: ' + sonuc._hata); return }
    toast.success(mevcut ? 'Sözleşme güncellendi.' : 'Sözleşme kaydedildi.')
    onKaydedildi()
  }

  return (
    <Modal open onClose={onKapat} title={mevcut ? 'Sözleşmeyi Düzenle' : 'Yeni Sözleşme'} width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div>
            <Label>Başlık *</Label>
            <Input value={form.baslik || ''} onChange={e => alan('baslik', e.target.value)} placeholder="2026 Kamera Bakım Sözleşmesi" />
          </div>
          <div>
            <Label>Tip</Label>
            <Select value={form.sozlesmeTipi} onChange={e => alan('sozlesmeTipi', e.target.value)}>
              {SOZLESME_TIPLERI.map(t => <option key={t.id} value={t.id}>{t.isim}</option>)}
            </Select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label>Müşteri</Label>
            <Select value={form.musteriId || ''} onChange={e => alan('musteriId', e.target.value)}>
              <option value="">— Seçiniz —</option>
              {musteriler.map(m => (
                <option key={m.id} value={m.id}>{m.firma || `${m.ad ?? ''} ${m.soyad ?? ''}`.trim()}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>veya Firma Adı (serbest)</Label>
            <Input value={form.firmaAdi || ''} onChange={e => alan('firmaAdi', e.target.value)} placeholder="Kayıtlı müşteri değilse" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <Label>Başlangıç</Label>
            <Input type="date" value={form.baslangicTarih || ''} onChange={e => alan('baslangicTarih', e.target.value)} />
          </div>
          <div>
            <Label>Bitiş *</Label>
            <Input type="date" value={form.bitisTarih || ''} onChange={e => alan('bitisTarih', e.target.value)} />
          </div>
          <div>
            <Label>Tutar (₺)</Label>
            <Input type="number" value={form.tutar || ''} onChange={e => alan('tutar', e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Notlar</Label>
          <Textarea rows={2} value={form.notlar || ''} onChange={e => alan('notlar', e.target.value)} placeholder="Kapsam, özel şartlar…" />
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', font: '500 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={!!form.otomatikYenileme} onChange={e => alan('otomatikYenileme', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--brand-primary)' }} />
            Otomatik yenilenir
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', font: '500 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={!!form.aktif} onChange={e => alan('aktif', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--brand-primary)' }} />
            Aktif
          </label>
          <Button variant="secondary" size="sm" iconLeft={<Paperclip size={13} strokeWidth={1.5} />} onClick={() => dosyaRef.current?.click()}>
            {dosya ? dosya.name.slice(0, 20) : (mevcut?.dosyaUrl ? 'Dosyayı Değiştir' : 'Dosya Ekle')}
          </Button>
          <input ref={dosyaRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
            onChange={e => setDosya(e.target.files?.[0] || null)} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <Button variant="ghost" onClick={onKapat} disabled={kaydediliyor}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
