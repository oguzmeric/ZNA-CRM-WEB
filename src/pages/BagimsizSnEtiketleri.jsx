// Bağımsız SN Etiketleri (mig 220) — SN'siz ürünler için ZNA- seri no üretimi + etiket.
// Burada "Yeni SN Üret" ile kod oluştur (ofis) VEYA sahadan (mobil servis) üretilenler
// düşer → basılmamışları seç → A4 3×8 barkod motoruyla (BarkodEtiketYazdir) bas → yapıştır.
import { useEffect, useState, useMemo } from 'react'
import { Tags, Printer, Square, CheckSquare, RefreshCw, Plus, Trash2, Keyboard } from 'lucide-react'
import {
  etiketKuyruguGetir, etiketBasildiIsaretle, bagimsizSnUret, bagimsizSnSil, bagimsizSnElleEkle,
} from '../services/bagimsizSnService'
import { Card, Badge, EmptyState, Button, CodeBadge, SegmentedControl, Modal, Input, Label } from '../components/ui'
import BarkodEtiketYazdir from '../components/BarkodEtiketYazdir'
import { SkeletonList } from '../components/Skeleton'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'

const tarihFmt = (t) => t ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export default function BagimsizSnEtiketleri() {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { kullanici } = useAuth()
  const [liste, setListe] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [gorunum, setGorunum] = useState('bekleyen')  // bekleyen | tumu
  const [seciliIdler, setSeciliIdler] = useState(() => new Set())
  const [yazdirAcik, setYazdirAcik] = useState(false)
  // Yeni SN üretimi (ofis)
  const [uretAcik, setUretAcik] = useState(false)
  const [uretAd, setUretAd] = useState('')
  const [uretAdet, setUretAdet] = useState('1')
  const [uretiliyor, setUretiliyor] = useState(false)
  // Elle SN girişi (mig 288) — cihazın kendi numarası, etiketi silinmişse
  const [elleAcik, setElleAcik] = useState(false)
  const [elleSn, setElleSn] = useState('')
  const [elleAd, setElleAd] = useState('')
  const [elleKaydediliyor, setElleKaydediliyor] = useState(false)

  const yenile = () => {
    setYukleniyor(true)
    etiketKuyruguGetir({ sadeceBasilmamis: gorunum === 'bekleyen' })
      .then(d => { setListe(d); setSeciliIdler(new Set()) })
      .catch(e => console.error('[BagimsizSnEtiketleri]', e))
      .finally(() => setYukleniyor(false))
  }
  useEffect(yenile, [gorunum])

  const toggle = (id) => {
    setSeciliIdler(prev => {
      const y = new Set(prev)
      if (y.has(id)) y.delete(id); else y.add(id)
      return y
    })
  }
  const tumu = () => setSeciliIdler(new Set(liste.map(r => r.id)))
  const hicbiri = () => setSeciliIdler(new Set())

  const secili = useMemo(() => liste.filter(r => seciliIdler.has(r.id)), [liste, seciliIdler])

  // BarkodEtiketYazdir kalem formatı: {id, seriNo, model, durum}
  const yazdirKalemleri = useMemo(() => secili.map(r => ({
    id: r.id,
    seriNo: r.seriNo,
    model: r.urunAdi || r.stokKodu || '',
    durum: r.etiketBasildi ? 'basıldı' : 'bekliyor',
  })), [secili])

  const basildiIsaretle = async (kalemler) => {
    const ids = kalemler.map(k => k.id)
    // Servis artık gerçek sonucu dönüyor (20.08): eskiden hata yutulup
    // koşulsuz "işaretlendi" deniyordu — işaret DB'ye yazılmamışken.
    const ok = await etiketBasildiIsaretle(ids)
    if (!ok) { toast.error('Basıldı işareti kaydedilemedi — etiketler "bekliyor" olarak kaldı.'); return }
    toast.success(`${ids.length} etiket "basıldı" işaretlendi.`)
    setYazdirAcik(false)
    yenile()
  }

  // Seçili SN'leri sil (yanlış üretilen / demo). Cihaza atanmış SN'in cihaz kaydına dokunmaz.
  const sil = async () => {
    const ids = [...seciliIdler]
    if (!ids.length) return
    const onay = await confirm({
      baslik: 'Seçili SN’leri sil',
      mesaj: `${ids.length} adet SN etiket kuyruğundan silinecek. (Cihaza atanmışsa cihaz kaydı silinmez.) Devam edilsin mi?`,
      onayMetin: 'Sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    const sonuc = await bagimsizSnSil(ids)
    if (sonuc?.hata) { toast.error(sonuc.hata); return }
    toast.success(`${sonuc.silinen} SN silindi.`)
    yenile()
  }

  // Ofiste yeni SN üret — ürün adı + adet; her biri ZNA-... alır, kuyruğa düşer
  const uret = async () => {
    const ad = uretAd.trim()
    const adet = Math.min(100, Math.max(1, parseInt(uretAdet, 10) || 1))
    setUretiliyor(true)
    try {
      let basarili = 0
      for (let i = 0; i < adet; i++) {
        const sonuc = await bagimsizSnUret({ urunAdi: ad || null, kullanici })
        if (sonuc?.hata) { toast.error(sonuc.hata); break }
        basarili++
      }
      if (basarili > 0) {
        toast.success(`${basarili} adet SN üretildi — listeye eklendi.`)
        setUretAcik(false); setUretAd(''); setUretAdet('1')
        setGorunum('bekleyen')
        yenile()
      }
    } catch (e) {
      toast.error(e?.message || 'SN üretilemedi.')
    } finally { setUretiliyor(false) }
  }

  // Elle girilen SN'yi kuyruğa al. Aynı numara daha önce girildiyse DB tarafı
  // hata vermez, "basıldı" işaretini sıfırlayıp yeniden basıma açar.
  const elleEkle = async () => {
    const sn = elleSn.trim()
    if (!sn) return
    setElleKaydediliyor(true)
    try {
      const sonuc = await bagimsizSnElleEkle({ seriNo: sn, urunAdi: elleAd.trim() || null, kullanici })
      if (sonuc?.hata) { toast.error(sonuc.hata); return }
      toast.success(`${sn} etiket kuyruğuna eklendi.`)
      setElleAcik(false); setElleSn(''); setElleAd('')
      setGorunum('bekleyen')
      yenile()
    } catch (e) {
      toast.error(e?.message || 'Eklenemedi.')
    } finally { setElleKaydediliyor(false) }
  }

  if (yukleniyor) return <SkeletonList />

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tags size={22} strokeWidth={1.5} style={{ color: 'var(--brand-600, #0176D3)' }} />
            <h1 className="t-h2" style={{ margin: 0 }}>Bağımsız SN Etiketleri</h1>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Seri numarası olmayan ürünler için <strong>ZNA…</strong> seri no üret; etiketi
            silinmiş cihazın kendi numarasını <strong>elle</strong> gir. Etiket üstte SN,
            altta barkod olarak basılır. Sahadan (mobil servis) üretilenler de buraya düşer.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" iconLeft={<RefreshCw size={13} strokeWidth={1.5} />} onClick={yenile}>
            Yenile
          </Button>
          {/* Etiketi silinmiş cihazın KENDİ numarası (mig 288) */}
          <Button variant="secondary" size="sm" iconLeft={<Keyboard size={14} strokeWidth={1.5} />} onClick={() => setElleAcik(true)}>
            Elle SN Gir
          </Button>
          <Button variant="primary" size="sm" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => setUretAcik(true)}>
            Yeni SN Üret
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <SegmentedControl
          value={gorunum}
          onChange={setGorunum}
          options={[
            { value: 'bekleyen', label: 'Basılmamış' },
            { value: 'tumu', label: 'Tümü' },
          ]}
        />
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onClick={tumu} disabled={!liste.length}>Tümünü Seç</Button>
        <Button variant="secondary" size="sm" onClick={hicbiri} disabled={!seciliIdler.size}>Temizle</Button>
        <Button variant="danger" size="sm" iconLeft={<Trash2 size={14} strokeWidth={1.5} />}
          disabled={!secili.length} onClick={sil}>
          Sil ({secili.length})
        </Button>
        <Button variant="primary" size="sm" iconLeft={<Printer size={14} strokeWidth={1.5} />}
          disabled={!secili.length} onClick={() => setYazdirAcik(true)}>
          Etiket Yazdır ({secili.length})
        </Button>
      </div>

      <Card>
        {liste.length === 0 ? (
          <EmptyState
            icon={<Tags size={40} strokeWidth={1.5} />}
            title={gorunum === 'bekleyen' ? 'Basılmamış etiket yok' : 'Kayıt yok'}
            description="Sahada bir ürüne SN üretildiğinde burada belirir."
          />
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {liste.map(r => {
              const secili = seciliIdler.has(r.id)
              return (
                <button key={r.id} onClick={() => toggle(r.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                    padding: '10px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    background: secili ? 'rgba(1,118,211,0.08)' : 'var(--surface-sunken)',
                    border: `1px solid ${secili ? 'rgba(1,118,211,0.4)' : 'var(--border-default)'}`,
                    color: 'var(--text-primary)',
                  }}>
                  {secili
                    ? <CheckSquare size={18} strokeWidth={1.5} style={{ color: 'var(--brand-600, #0176D3)', flexShrink: 0 }} />
                    : <Square size={18} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                  <CodeBadge>{r.seriNo}</CodeBadge>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '500 13px/18px var(--font-sans)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {r.urunAdi || r.stokKodu || 'İsimsiz ürün'}
                      {/* Cihazın kendi numarası mı, biz mi ürettik (mig 288) */}
                      {r.kaynak === 'elle' && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                          color: '#7c3aed', background: 'rgba(124,58,237,0.10)',
                          border: '1px solid rgba(124,58,237,0.25)', borderRadius: 4, padding: '1px 5px',
                        }}>ELLE</span>
                      )}
                    </div>
                    <div className="t-caption" style={{ color: 'var(--text-tertiary)' }}>
                      {r.olusturanAd || '—'} · {tarihFmt(r.olusturmaTarih)}
                    </div>
                  </div>
                  {r.etiketBasildi
                    ? <Badge tone="aktif">Basıldı</Badge>
                    : <Badge tone="beklemede">Bekliyor</Badge>}
                </button>
              )
            })}
          </div>
        )}
      </Card>

      {yazdirAcik && (
        <BarkodEtiketYazdir
          kalemler={yazdirKalemleri}
          marka="ZNA"
          stokKodu=""
          duzen="sn"          /* üstte "SN: …", altta dikey çizgili barkod — 14.08 kararı */
          onKapat={() => setYazdirAcik(false)}
          onYazdir={basildiIsaretle}
        />
      )}

      {/* Elle SN gir — cihazın KENDİ seri numarası (etiketi silinmiş/okunmaz).
          Aynı numara ikinci kez girilirse hata değil, yeniden basım kuyruğuna girer. */}
      <Modal
        open={elleAcik}
        onClose={() => !elleKaydediliyor && setElleAcik(false)}
        title="Elle Seri No Gir"
        width={460}
        footer={
          <>
            <Button variant="tertiary" size="sm" onClick={() => setElleAcik(false)} disabled={elleKaydediliyor}>Vazgeç</Button>
            <Button variant="primary" size="sm" onClick={elleEkle} disabled={elleKaydediliyor || !elleSn.trim()}
              iconLeft={<Keyboard size={14} strokeWidth={1.5} />}>
              {elleKaydediliyor ? 'Ekleniyor…' : 'Kuyruğa Ekle'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="t-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>
            Cihazın <strong>kendi seri numarasını</strong> yaz — etiketi silinmiş/okunmaz
            olduğunda yeniden basmak için. Sistem yeni numara üretmez, yazdığın numara basılır.
          </p>
          <div>
            <Label>Seri No <span style={{ color: '#DC2626' }}>*</span></Label>
            <Input value={elleSn} onChange={e => setElleSn(e.target.value)}
              placeholder="Ör. T81910230427" autoFocus
              style={{ fontFamily: 'monospace' }}
              onKeyDown={e => { if (e.key === 'Enter' && elleSn.trim()) elleEkle() }} />
          </div>
          <div>
            <Label>Ürün / Cihaz Adı (opsiyonel)</Label>
            <Input value={elleAd} onChange={e => setElleAd(e.target.value)} placeholder="Ör. 5MP Kamera" />
          </div>
        </div>
      </Modal>

      {/* Yeni SN üret (ofis) — ürün adı + adet; her biri ZNA-... alır */}
      <Modal
        open={uretAcik}
        onClose={() => !uretiliyor && setUretAcik(false)}
        title="Yeni SN Üret"
        width={460}
        footer={
          <>
            <Button variant="tertiary" size="sm" onClick={() => setUretAcik(false)} disabled={uretiliyor}>Vazgeç</Button>
            <Button variant="primary" size="sm" onClick={uret} disabled={uretiliyor}
              iconLeft={<Plus size={14} strokeWidth={1.5} />}>
              {uretiliyor ? 'Üretiliyor…' : 'Üret'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="t-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>
            Seri numarası olmayan ürün için benzersiz <strong>ZNA…</strong> kod üretilir.
            Ürün adı isteğe bağlı (boş bırakırsan sadece kod basılır, sonra cihaza atarsın).
          </p>
          <div>
            <Label>Ürün / Cihaz Adı (opsiyonel)</Label>
            <Input value={uretAd} onChange={e => setUretAd(e.target.value)}
              placeholder="Ör. 4 Portlu Switch" autoFocus />
          </div>
          <div style={{ width: 140 }}>
            <Label>Kaç adet?</Label>
            <Input type="number" min="1" max="100" value={uretAdet}
              onChange={e => setUretAdet(e.target.value)} style={{ textAlign: 'right' }} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
