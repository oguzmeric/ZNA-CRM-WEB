// Araç Belgeleri — muayene / sigorta / kasko / egzoz / ruhsat takibi.
// Bitişe ≤30 gün kalan ve süresi geçen belgeler rozetle öne çıkar;
// muayene/sigorta/kasko kaydı araç kartındaki bitiş tarihini de günceller
// (günlük arac-km-sync cron'u o tarihlerden push atar).

import { useEffect, useMemo, useRef, useState } from 'react'
import { FileCheck, Plus, Trash2, ExternalLink, Paperclip } from 'lucide-react'
import { Button, Card, EmptyState, Modal, Input, Select, Label, Textarea, Table, THead, TBody, TR, TH, TD } from '../components/ui'
import { belgeleriGetir, belgeEkle, belgeSil, filoAraclariGetir, filoDosyaYukle, filoDosyaUrl, sonYuklemeHata, BELGE_TIPLERI } from '../services/filoService'
import { fmtTarih, fmtTL, kalanGun, BitisRozet, FiloKpi } from '../components/FiloOrtak'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { SkeletonList } from '../components/Skeleton'

export default function FiloBelgeler() {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { kullanici } = useAuth()
  const [belgeler, setBelgeler] = useState([])
  const [araclar, setAraclar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [modalAcik, setModalAcik] = useState(false)
  const [aracFiltre, setAracFiltre] = useState('')

  const yukle = async () => {
    const [b, a] = await Promise.all([belgeleriGetir(), filoAraclariGetir()])
    setBelgeler(b); setAraclar(a)
    setYukleniyor(false)
  }
  useEffect(() => { yukle() }, [])

  const gorunen = useMemo(() =>
    aracFiltre ? belgeler.filter(b => String(b.aracId) === aracFiltre) : belgeler,
  [belgeler, aracFiltre])

  const ozet = useMemo(() => {
    const s = { toplam: belgeler.length, yaklasan: 0, gecen: 0 }
    belgeler.forEach(b => {
      const g = kalanGun(b.bitisTarih)
      if (g == null) return
      if (g < 0) s.gecen++
      else if (g <= 30) s.yaklasan++
    })
    return s
  }, [belgeler])

  const sil = async (b) => {
    const onay = await confirm({
      baslik: 'Belgeyi Sil',
      mesaj: `${b.arac?.plaka || ''} — ${BELGE_TIPLERI.find(t => t.id === b.belgeTipi)?.isim || b.belgeTipi} kaydı silinsin mi?`,
      onayMetin: 'Sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    const ok = await belgeSil(b)
    if (ok) { toast.success('Belge silindi.'); yukle() } else toast.error('Silinemedi.')
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
            <FileCheck size={22} strokeWidth={1.75} /> Araç Belgeleri
          </h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            Bitişe 30 gün kala ve süresi geçince her sabah yöneticilere bildirim gider.
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => setModalAcik(true)}>
          Yeni Belge
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <FiloKpi etiket="Toplam Belge" deger={ozet.toplam} />
        <FiloKpi etiket="30 Gün İçinde Bitiyor" deger={ozet.yaklasan} renk={ozet.yaklasan > 0 ? '#B45309' : 'var(--text-primary)'} />
        <FiloKpi etiket="Süresi Geçmiş" deger={ozet.gecen} renk={ozet.gecen > 0 ? '#DC2626' : 'var(--text-primary)'} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <Select value={aracFiltre} onChange={e => setAracFiltre(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">Tüm araçlar</option>
          {araclar.map(a => <option key={a.id} value={a.id}>{a.plaka}</option>)}
        </Select>
      </div>

      {gorunen.length === 0 ? (
        <EmptyState
          icon={<FileCheck size={32} strokeWidth={1.5} />}
          title="Belge kaydı yok"
          description='"Yeni Belge" ile muayene, sigorta ve kasko tarihlerini girin — bitişleri sistem takip etsin.'
        />
      ) : (
        <Card style={{ padding: 0 }}>
          <Table>
            <THead>
              <TR>
                <TH>Araç</TH>
                <TH>Belge</TH>
                <TH>Sağlayıcı</TH>
                <TH>Bitiş</TH>
                <TH>Tutar</TH>
                <TH>Dosya</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {gorunen.map(b => {
                const tip = BELGE_TIPLERI.find(t => t.id === b.belgeTipi)
                return (
                  <TR key={b.id}>
                    <TD><strong>{b.arac?.plaka || '—'}</strong></TD>
                    <TD>
                      {tip?.isim || b.belgeTipi}
                      {b.belgeNo && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{b.belgeNo}</div>}
                    </TD>
                    <TD>{b.saglayici || '—'}</TD>
                    <TD><BitisRozet bitis={b.bitisTarih} /></TD>
                    <TD>{fmtTL(b.tutar)}</TD>
                    <TD>
                      {b.dosyaUrl ? (
                        <Button variant="ghost" size="sm" iconLeft={<ExternalLink size={13} strokeWidth={1.5} />} onClick={() => dosyaAc(b.dosyaUrl)}>
                          Aç
                        </Button>
                      ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                    </TD>
                    <TD>
                      <Button variant="ghost" size="sm" onClick={() => sil(b)} title="Sil">
                        <Trash2 size={14} strokeWidth={1.5} />
                      </Button>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </Card>
      )}

      <YeniBelgeModal
        acik={modalAcik}
        araclar={araclar}
        kullanici={kullanici}
        onKapat={() => setModalAcik(false)}
        onKaydedildi={() => { setModalAcik(false); yukle() }}
      />
    </div>
  )
}

function YeniBelgeModal({ acik, araclar, kullanici, onKapat, onKaydedildi }) {
  const { toast } = useToast()
  const dosyaRef = useRef(null)
  const [form, setForm] = useState({})
  const [dosya, setDosya] = useState(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const alan = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (acik) { setForm({ belgeTipi: 'muayene', tarihBugun: true }); setDosya(null) }
  }, [acik])

  if (!acik) return null

  const kaydet = async () => {
    if (!form.aracId) { toast.error('Araç seçin.'); return }
    if (!form.bitisTarih) { toast.error('Bitiş tarihi gerekli.'); return }
    setKaydediliyor(true)
    let dosyaPath = null
    if (dosya) {
      dosyaPath = await filoDosyaYukle(dosya, `belge/${form.aracId}`)
      if (!dosyaPath) { setKaydediliyor(false); toast.error('Dosya yüklenemedi: ' + (sonYuklemeHata || 'bilinmeyen hata')); return }
    }
    const sonuc = await belgeEkle({
      aracId: form.aracId,
      belgeTipi: form.belgeTipi,
      belgeNo: form.belgeNo?.trim() || null,
      baslangicTarih: form.baslangicTarih || null,
      bitisTarih: form.bitisTarih,
      tutar: form.tutar ? Number(form.tutar) : null,
      saglayici: form.saglayici?.trim() || null,
      dosyaUrl: dosyaPath,
      notlar: form.notlar?.trim() || null,
      olusturanId: kullanici?.id || null,
    })
    setKaydediliyor(false)
    if (sonuc?._hata) { toast.error('Kaydedilemedi: ' + sonuc._hata); return }
    toast.success('Belge kaydedildi.')
    onKaydedildi()
  }

  return (
    <Modal open onClose={onKapat} title="Yeni Araç Belgesi" width={520}>
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
            <Label>Belge Tipi *</Label>
            <Select value={form.belgeTipi || 'muayene'} onChange={e => alan('belgeTipi', e.target.value)}>
              {BELGE_TIPLERI.map(t => <option key={t.id} value={t.id}>{t.isim}</option>)}
            </Select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label>Başlangıç</Label>
            <Input type="date" value={form.baslangicTarih || ''} onChange={e => alan('baslangicTarih', e.target.value)} />
          </div>
          <div>
            <Label>Bitiş *</Label>
            <Input type="date" value={form.bitisTarih || ''} onChange={e => alan('bitisTarih', e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label>Sağlayıcı</Label>
            <Input value={form.saglayici || ''} onChange={e => alan('saglayici', e.target.value)} placeholder="Sigorta şirketi / TÜVTÜRK..." />
          </div>
          <div>
            <Label>Tutar (₺)</Label>
            <Input type="number" value={form.tutar || ''} onChange={e => alan('tutar', e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label>Belge No</Label>
            <Input value={form.belgeNo || ''} onChange={e => alan('belgeNo', e.target.value)} placeholder="Poliçe no vb." />
          </div>
          <div>
            <Label>Dosya (poliçe/PDF/foto)</Label>
            <Button variant="secondary" iconLeft={<Paperclip size={14} strokeWidth={1.5} />} onClick={() => dosyaRef.current?.click()} style={{ width: '100%' }}>
              {dosya ? dosya.name.slice(0, 22) : 'Dosya Seç'}
            </Button>
            <input ref={dosyaRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
              onChange={e => setDosya(e.target.files?.[0] || null)} />
          </div>
        </div>

        <div>
          <Label>Notlar</Label>
          <Textarea rows={2} value={form.notlar || ''} onChange={e => alan('notlar', e.target.value)} />
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
