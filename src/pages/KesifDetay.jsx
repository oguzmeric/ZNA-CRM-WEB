// Keşif Detayı — bilgiler + malzeme listesi + fotoğraflar + dönüşümler.
// Dönüşümler: Teklife Aktar (kalemler teklif satırlarına), Görev Oluştur,
// Servis Talebi Oluştur — oluşan kayıtların id'leri keşfe geri bağlanır.

import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, MapPin, Compass, FileText, CheckSquare, Wrench, Camera,
  Plus, Trash2, Save, Upload, ExternalLink, X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import {
  kesifGetir, kesifGuncelle, kesifSil,
  kesifKalemleriGetir, kesifKalemEkle, kesifKalemSil,
  kesifFotolariGetir, kesifFotoYukle, kesifFotoSil, kesifFotoUrlleri,
  KESIF_KATEGORILERI, KESIF_DURUMLARI, KESIF_FOTO_MAX_MB,
} from '../services/kesifService'
import { stokUrunleriniGetir } from '../services/stokService'
import { gorevEkle } from '../services/gorevService'
import { servisTalepEkle, servisTalebiBildirimGonder } from '../services/servisService'
import CustomSelect from '../components/CustomSelect'
import { SkeletonDetay } from '../components/Skeleton'
import {
  Button, Input, Textarea, Label, Card, Badge, CodeBadge,
  EmptyState, Modal, Table, THead, TBody, TR, TH, TD,
} from '../components/ui'

const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'
const birimler = ['Adet', 'Metre', 'Paket', 'Kutu', 'Takım', 'Saat']

const bosKalem = {
  kategori: 'kamera', stokKodu: '', urunAdi: '', marka: '',
  miktar: 1, birim: 'Adet', notlar: '',
}

export default function KesifDetay() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { kullanici, kullanicilar } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [kesif, setKesif] = useState(null)
  const [kalemler, setKalemler] = useState([])
  const [fotolar, setFotolar] = useState([])
  const [fotoUrlMap, setFotoUrlMap] = useState(new Map())
  const [stokUrunler, setStokUrunler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [yeniKalem, setYeniKalem] = useState({ ...bosKalem })
  const [fotoYukleniyor, setFotoYukleniyor] = useState(false)
  const [gorevModal, setGorevModal] = useState(false)
  const [donusumCalisiyor, setDonusumCalisiyor] = useState(false)
  const fotoRef = useRef(null)

  const yukle = async () => {
    setYukleniyor(true)
    try {
      const [k, kal, fot, stok] = await Promise.all([
        kesifGetir(id),
        kesifKalemleriGetir(id),
        kesifFotolariGetir(id),
        stokUrunleriniGetir(),
      ])
      setKesif(k)
      setKalemler(kal)
      setFotolar(fot)
      setStokUrunler(stok || [])
      const urls = await kesifFotoUrlleri(fot.map(f => f.dosyaYolu))
      setFotoUrlMap(urls)
    } catch (e) {
      console.error('[KesifDetay]', e)
      toast.error('Keşif yüklenemedi: ' + (e?.message || 'bilinmeyen hata'))
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { yukle() }, [id])  // eslint-disable-line react-hooks/exhaustive-deps

  // Kategori bazlı özet chip'leri (📷 12 Kamera gibi)
  const kategoriOzet = useMemo(() => {
    const m = new Map()
    kalemler.forEach(k => m.set(k.kategori, (m.get(k.kategori) || 0) + Number(k.miktar || 0)))
    return KESIF_KATEGORILERI.filter(kat => m.has(kat.id)).map(kat => ({ ...kat, toplam: m.get(kat.id) }))
  }, [kalemler])

  const kalemOzetMetni = () => kalemler
    .map(k => `• ${k.miktar} ${k.birim} — ${k.urunAdi}${k.marka ? ` (${k.marka})` : ''}${k.notlar ? ` · ${k.notlar}` : ''}`)
    .join('\n')

  if (yukleniyor) return <SkeletonDetay />
  if (!kesif) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <EmptyState title="Keşif bulunamadı" icon={<Compass size={28} />} />
        <Button variant="primary" style={{ marginTop: 12 }} onClick={() => navigate('/kesifler')}>Keşiflere Dön</Button>
      </div>
    )
  }

  const durum = KESIF_DURUMLARI.find(d => d.id === kesif.durum)

  const bilgiKaydet = async () => {
    setKaydediliyor(true)
    try {
      await kesifGuncelle(id, {
        firmaAdi: kesif.firmaAdi,
        lokasyon: kesif.lokasyon,
        kesifTarihi: kesif.kesifTarihi,
        kesfiYapan: kesif.kesfiYapan,
        genelNot: kesif.genelNot,
        durum: kesif.durum,
      })
      toast.success('Keşif kaydedildi.')
    } catch (e) {
      toast.error('Kaydedilemedi: ' + (e?.message || 'bilinmeyen hata'))
    } finally {
      setKaydediliyor(false)
    }
  }

  const kalemKaydet = async () => {
    if (!yeniKalem.urunAdi.trim()) { toast.warning('Ürün adı girin.'); return }
    try {
      const eklenen = await kesifKalemEkle({
        ...yeniKalem,
        kesifId: Number(id),
        miktar: Number(yeniKalem.miktar) || 1,
        siralama: kalemler.length,
      })
      setKalemler(prev => [...prev, eklenen])
      setYeniKalem({ ...bosKalem, kategori: yeniKalem.kategori })
    } catch (e) {
      toast.error('Kalem eklenemedi: ' + (e?.message || 'bilinmeyen hata'))
    }
  }

  const kalemKaldir = async (k) => {
    try {
      await kesifKalemSil(k.id)
      setKalemler(prev => prev.filter(x => x.id !== k.id))
    } catch (e) {
      toast.error('Silinemedi: ' + (e?.message || 'bilinmeyen hata'))
    }
  }

  const stokSec = (kod) => {
    const u = stokUrunler.find(x => x.stokKodu === kod)
    setYeniKalem(v => ({
      ...v, stokKodu: kod,
      urunAdi: u ? u.stokAdi : v.urunAdi,
      marka: u?.marka || v.marka,
      birim: u?.birim || v.birim,
    }))
  }

  const fotoSec = async (e) => {
    const dosyalar = Array.from(e.target.files || [])
    e.target.value = ''
    if (!dosyalar.length) return
    setFotoYukleniyor(true)
    let ok = 0
    for (const f of dosyalar) {
      try {
        const yeni = await kesifFotoYukle(id, f, { olusturanAd: kullanici?.ad || '' })
        setFotolar(prev => [yeni, ...prev])
        ok++
      } catch (err) {
        toast.error(`${f.name}: ${err?.message || 'yüklenemedi'}`)
      }
    }
    if (ok) {
      toast.success(`${ok} fotoğraf yüklendi.`)
      const tumu = await kesifFotolariGetir(id)
      setFotoUrlMap(await kesifFotoUrlleri(tumu.map(f => f.dosyaYolu)))
    }
    setFotoYukleniyor(false)
  }

  const fotoKaldir = async (f) => {
    const onay = await confirm({
      baslik: 'Fotoğrafı Sil', mesaj: 'Bu fotoğraf kalıcı olarak silinecek. Emin misin?',
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    try {
      await kesifFotoSil(f)
      setFotolar(prev => prev.filter(x => x.id !== f.id))
    } catch (e) {
      toast.error('Silinemedi: ' + (e?.message || 'bilinmeyen hata'))
    }
  }

  // ── Dönüşümler ─────────────────────────────────────────────────────
  const teklifeAktar = () => {
    if (kalemler.length === 0) { toast.warning('Önce malzeme listesine kalem ekleyin — teklif satırları buradan oluşur.'); return }
    localStorage.setItem('teklif_on_doldurum', JSON.stringify({
      kesifId: Number(id),  // TeklifDetay kaydedince kesifler.teklif_id günceller
      musteriId: kesif.musteriId || '',
      firmaAdi: kesif.firmaAdi || '',
      konu: `${kesif.kesifNo} — ${kesif.lokasyon || kesif.firmaAdi || 'Keşif'} kurulum teklifi`,
      aciklama: kesif.genelNot || '',
      satirlar: kalemler.map(k => ({
        id: crypto.randomUUID(),
        stokKodu: k.stokKodu || '',
        stokAdi: `${k.urunAdi}${k.marka ? ` — ${k.marka}` : ''}`,
        miktar: Number(k.miktar) || 1,
        birim: k.birim || 'Adet',
        birimFiyat: 0,
        iskonto: 0,
        kdv: 20,
      })),
    }))
    navigate('/teklifler/yeni')
  }

  const servisOlustur = async () => {
    const onay = await confirm({
      baslik: 'Servis Talebi Oluştur',
      mesaj: `${kesif.kesifNo} için "Kurulum" türünde servis talebi açılacak (keşif notları ve malzeme listesi açıklamaya eklenir). Devam?`,
      onayMetin: 'Talebi Oluştur', iptalMetin: 'Vazgeç',
    })
    if (!onay) return
    setDonusumCalisiyor(true)
    try {
      const talep = await servisTalepEkle({
        talepNo: null,
        musteriId: kesif.musteriId || null,
        musteriAd: '',
        firmaAdi: kesif.firmaAdi || '',
        anaTur: 'kurulum',
        altKategori: '',
        konu: `${kesif.kesifNo} — ${kesif.lokasyon || kesif.firmaAdi || 'keşif'} kurulumu`,
        lokasyon: kesif.lokasyon || '',
        aciklama: [
          kesif.genelNot ? `Keşif notu: ${kesif.genelNot}` : null,
          kalemler.length ? `Malzeme listesi:\n${kalemOzetMetni()}` : null,
          `Kaynak keşif: ${kesif.kesifNo}`,
        ].filter(Boolean).join('\n\n'),
        aciliyet: 'normal',
        ilgiliKisi: kesif.kesfiYapan || kullanici?.ad || '',
        durum: 'bekliyor',
        kaynak: 'personel',
        atananKullaniciId: null,
        atananKullaniciAd: null,
        planliTarih: null,
        notlar: [],
        durumGecmisi: [{
          durum: 'bekliyor',
          tarih: new Date().toISOString(),
          kullaniciAd: kullanici?.ad || '',
          aciklama: `${kesif.kesifNo} keşfinden oluşturuldu`,
        }],
      })
      await kesifGuncelle(id, { servisTalepId: talep.id })
      setKesif(k => ({ ...k, servisTalepId: talep.id }))
      servisTalebiBildirimGonder(talep, kullanici?.id).catch(() => {})
      toast.success(`Servis talebi oluşturuldu (${talep.talepNo || '#' + talep.id}).`)
    } catch (e) {
      toast.error('Servis talebi oluşturulamadı: ' + (e?.message || 'bilinmeyen hata'))
    } finally {
      setDonusumCalisiyor(false)
    }
  }

  const kesfiSil = async () => {
    const onay = await confirm({
      baslik: 'Keşfi Sil',
      mesaj: `${kesif.kesifNo} kalemleri ve fotoğraflarıyla birlikte kalıcı silinecek. Emin misin?`,
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    try {
      await kesifSil(id)
      toast.success('Keşif silindi.')
      navigate('/kesifler')
    } catch (e) {
      toast.error('Silinemedi: ' + (e?.message || 'bilinmeyen hata'))
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <button
        onClick={() => navigate('/kesifler')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--text-tertiary)', font: '500 13px/18px var(--font-sans)', marginBottom: 16,
        }}
      >
        <ArrowLeft size={14} strokeWidth={1.5} /> Keşiflere dön
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 className="t-h1" style={{ margin: 0 }}>{kesif.kesifNo}</h1>
          {durum && <Badge tone={durum.tone}>{durum.ad}</Badge>}
          {kesif.teklifId && (
            <Badge tone="brand" style={{ cursor: 'pointer' }} onClick={() => navigate(`/teklifler/${kesif.teklifId}`)}>
              <FileText size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 3 }} />Teklif oluşturuldu →
            </Badge>
          )}
          {kesif.gorevId && (
            <Badge tone="beklemede" style={{ cursor: 'pointer' }} onClick={() => navigate(`/gorevler/${kesif.gorevId}`)}>
              <CheckSquare size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 3 }} />Görev oluşturuldu →
            </Badge>
          )}
          {kesif.servisTalepId && (
            <Badge tone="aktif" style={{ cursor: 'pointer' }} onClick={() => navigate(`/servis-talepleri/${kesif.servisTalepId}`)}>
              <Wrench size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 3 }} />Servis oluşturuldu →
            </Badge>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!kesif.teklifId && (
            <Button variant="primary" iconLeft={<FileText size={14} strokeWidth={1.5} />} onClick={teklifeAktar} disabled={donusumCalisiyor}>
              Teklife Aktar
            </Button>
          )}
          {!kesif.gorevId && (
            <Button variant="secondary" iconLeft={<CheckSquare size={14} strokeWidth={1.5} />} onClick={() => setGorevModal(true)} disabled={donusumCalisiyor}>
              Görev Oluştur
            </Button>
          )}
          {!kesif.servisTalepId && (
            <Button variant="secondary" iconLeft={<Wrench size={14} strokeWidth={1.5} />} onClick={servisOlustur} disabled={donusumCalisiyor}>
              Servis Talebi
            </Button>
          )}
          <Button variant="danger" iconLeft={<Trash2 size={14} strokeWidth={1.5} />} onClick={kesfiSil}>Sil</Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)', gap: 16, marginBottom: 16 }}>
        {/* Bilgiler */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 className="t-h2" style={{ margin: 0 }}>Keşif Bilgileri</h2>
            <Button variant="secondary" size="sm" iconLeft={<Save size={13} strokeWidth={1.5} />} onClick={bilgiKaydet} disabled={kaydediliyor}>
              {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <Label>Firma</Label>
              <Input value={kesif.firmaAdi || ''} onChange={e => setKesif(k => ({ ...k, firmaAdi: e.target.value }))} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <Label>Lokasyon / Adres</Label>
              <Input value={kesif.lokasyon || ''} onChange={e => setKesif(k => ({ ...k, lokasyon: e.target.value }))} placeholder="Saha adresi" />
            </div>
            <div>
              <Label>Keşif tarihi</Label>
              <Input type="date" value={kesif.kesifTarihi || ''} onChange={e => setKesif(k => ({ ...k, kesifTarihi: e.target.value }))} />
            </div>
            <div>
              <Label>Keşfi yapan</Label>
              <Input value={kesif.kesfiYapan || ''} onChange={e => setKesif(k => ({ ...k, kesfiYapan: e.target.value }))} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <Label>Genel not</Label>
              <Textarea rows={4} value={kesif.genelNot || ''} onChange={e => setKesif(k => ({ ...k, genelNot: e.target.value }))}
                placeholder="Saha gözlemleri, montaj noktaları, müşteri talepleri…" />
            </div>
            <div>
              <Label>Durum</Label>
              <CustomSelect value={kesif.durum} onChange={e => setKesif(k => ({ ...k, durum: e.target.value }))}>
                {KESIF_DURUMLARI.map(d => <option key={d.id} value={d.id}>{d.ad}</option>)}
              </CustomSelect>
            </div>
          </div>
        </Card>

        {/* Fotoğraflar */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 className="t-h2" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Camera size={15} strokeWidth={1.5} /> Fotoğraflar ({fotolar.length})
            </h2>
            <Button variant="secondary" size="sm" iconLeft={<Upload size={13} strokeWidth={1.5} />}
              onClick={() => fotoRef.current?.click()} disabled={fotoYukleniyor}>
              {fotoYukleniyor ? 'Yükleniyor…' : 'Foto Ekle'}
            </Button>
            {/* capture: telefonda doğrudan kamerayı açar */}
            <input ref={fotoRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={fotoSec} />
          </div>
          {fotolar.length === 0 ? (
            <p className="t-caption" style={{ margin: 0 }}>
              Henüz fotoğraf yok. Telefondan açarsan "Foto Ekle" doğrudan kamerayı açar (max {KESIF_FOTO_MAX_MB} MB/foto).
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
              {fotolar.map(f => {
                const url = fotoUrlMap.get(f.dosyaYolu)
                return (
                  <div key={f.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: 'var(--surface-sunken)' }}>
                    {url ? (
                      <img
                        src={url} alt={f.aciklama || 'keşif foto'}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                        onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                      />
                    ) : (
                      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-tertiary)' }}>
                        <Camera size={18} strokeWidth={1.5} />
                      </div>
                    )}
                    <button
                      onClick={() => fotoKaldir(f)}
                      aria-label="Fotoğrafı sil"
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        width: 22, height: 22, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.55)', color: '#fff',
                        border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center',
                      }}
                    >
                      <X size={12} strokeWidth={2} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Malzeme listesi */}
      <Card padding={0}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 className="t-h2" style={{ margin: 0 }}>Malzeme Listesi ({kalemler.length})</h2>
          {kategoriOzet.map(k => (
            <span key={k.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 10px', borderRadius: 12,
              background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
              font: '600 11px/16px var(--font-sans)', color: 'var(--text-secondary)',
            }}>
              {k.ikon} {Number(k.toplam).toLocaleString('tr-TR')} {k.ad}
            </span>
          ))}
        </div>

        {/* Yeni kalem satırı */}
        <div style={{
          display: 'grid', gap: 8, padding: '12px 20px',
          gridTemplateColumns: '130px 150px minmax(160px, 1fr) 130px 70px 90px minmax(120px, 1fr) auto',
          alignItems: 'end', borderBottom: '1px solid var(--border-default)',
          background: 'var(--surface-subtle, #F4F6F8)',
        }}>
          <div>
            <Label>Kategori</Label>
            <CustomSelect value={yeniKalem.kategori} onChange={e => setYeniKalem(v => ({ ...v, kategori: e.target.value }))}>
              {KESIF_KATEGORILERI.map(k => <option key={k.id} value={k.id}>{k.ikon} {k.ad}</option>)}
            </CustomSelect>
          </div>
          <div>
            <Label>Stok (ops.)</Label>
            <CustomSelect value={yeniKalem.stokKodu} selectedDisplay={(v) => v || '—'} panelMinWidth={420}
              onChange={e => stokSec(e.target.value)}>
              <option value="">Stoktan seç…</option>
              {stokUrunler.map(u => <option key={u.id} value={u.stokKodu}>{u.stokKodu} — {u.stokAdi}</option>)}
            </CustomSelect>
          </div>
          <div>
            <Label required>Ürün adı</Label>
            <Input value={yeniKalem.urunAdi} onChange={e => setYeniKalem(v => ({ ...v, urunAdi: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') kalemKaydet() }} placeholder="örn. 4MP IP Dome kamera" />
          </div>
          <div>
            <Label>Marka/Model</Label>
            <Input value={yeniKalem.marka} onChange={e => setYeniKalem(v => ({ ...v, marka: e.target.value }))} placeholder="Hikvision…" />
          </div>
          <div>
            <Label>Miktar</Label>
            <Input type="number" min="0" value={yeniKalem.miktar}
              onChange={e => setYeniKalem(v => ({ ...v, miktar: e.target.value }))}
              style={{ textAlign: 'right' }} />
          </div>
          <div>
            <Label>Birim</Label>
            <CustomSelect value={yeniKalem.birim} onChange={e => setYeniKalem(v => ({ ...v, birim: e.target.value }))}>
              {birimler.map(b => <option key={b} value={b}>{b}</option>)}
            </CustomSelect>
          </div>
          <div>
            <Label>Not</Label>
            <Input value={yeniKalem.notlar} onChange={e => setYeniKalem(v => ({ ...v, notlar: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') kalemKaydet() }} placeholder="montaj yeri vb." />
          </div>
          <Button variant="primary" iconLeft={<Plus size={13} strokeWidth={1.5} />} onClick={kalemKaydet}>Ekle</Button>
        </div>

        {kalemler.length === 0 ? (
          <div style={{ padding: 28 }}>
            <EmptyState
              icon={<Compass size={22} strokeWidth={1.5} />}
              title="Malzeme listesi boş"
              description='Yukarıdaki satırdan kamera/kayıt cihazı/kablo vb. ekle — "Teklife Aktar" bu listeyi teklif satırlarına çevirir.'
            />
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Kategori</TH><TH>Stok</TH><TH>Ürün</TH><TH>Marka/Model</TH>
                <TH align="right">Miktar</TH><TH>Not</TH><TH></TH>
              </TR>
            </THead>
            <TBody>
              {kalemler.map(k => {
                const kat = KESIF_KATEGORILERI.find(x => x.id === k.kategori)
                return (
                  <TR key={k.id}>
                    <TD>{kat ? `${kat.ikon} ${kat.ad}` : k.kategori}</TD>
                    <TD>{k.stokKodu ? <CodeBadge>{k.stokKodu}</CodeBadge> : '—'}</TD>
                    <TD style={{ fontWeight: 500 }}>{k.urunAdi}</TD>
                    <TD>{k.marka || '—'}</TD>
                    <TD align="right"><span className="tabular-nums">{Number(k.miktar).toLocaleString('tr-TR')} {k.birim}</span></TD>
                    <TD style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{k.notlar || '—'}</TD>
                    <TD align="right">
                      <button
                        aria-label="Kalemi sil"
                        onClick={() => kalemKaldir(k)}
                        style={{
                          width: 26, height: 26, display: 'inline-grid', placeItems: 'center',
                          background: 'transparent', border: '1px solid var(--border-default)',
                          borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                      >
                        <Trash2 size={12} strokeWidth={1.5} />
                      </button>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Görev oluştur modalı */}
      {gorevModal && (
        <GorevOlusturModal
          kesif={kesif}
          kalemOzet={kalemOzetMetni()}
          kullanici={kullanici}
          kullanicilar={kullanicilar}
          onKapat={() => setGorevModal(false)}
          onOlusturuldu={async (gorev) => {
            await kesifGuncelle(id, { gorevId: gorev.id }).catch(() => {})
            setKesif(k => ({ ...k, gorevId: gorev.id }))
            setGorevModal(false)
            toast.success('Görev oluşturuldu ve keşfe bağlandı.')
          }}
        />
      )}
    </div>
  )
}

function GorevOlusturModal({ kesif, kalemOzet, kullanici, kullanicilar, onKapat, onOlusturuldu }) {
  const { toast } = useToast()
  const [baslik, setBaslik] = useState(`${kesif.kesifNo} — ${kesif.firmaAdi || 'saha'} kurulum/uygulama`)
  const [atanan, setAtanan] = useState('')
  const [oncelik, setOncelik] = useState('orta')
  const [sonTarih, setSonTarih] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const kaydet = async () => {
    if (!baslik.trim()) { toast.warning('Başlık zorunlu.'); return }
    setKaydediliyor(true)
    try {
      const gorev = await gorevEkle({
        baslik: baslik.trim(),
        aciklama: [
          kesif.lokasyon ? `Lokasyon: ${kesif.lokasyon}` : null,
          kesif.genelNot ? `Keşif notu: ${kesif.genelNot}` : null,
          kalemOzet ? `Malzeme listesi:\n${kalemOzet}` : null,
          `Kaynak keşif: ${kesif.kesifNo}`,
        ].filter(Boolean).join('\n\n'),
        atanan: atanan || '',
        oncelik,
        durum: 'bekliyor',
        sonTarih: sonTarih || null,
        musteriId: kesif.musteriId || null,
        firmaAdi: kesif.firmaAdi || '',
        olusturan: kullanici?.ad || '',
      })
      if (!gorev) throw new Error('Görev kaydedilemedi.')
      onOlusturuldu(gorev)
    } catch (e) {
      toast.error('Görev oluşturulamadı: ' + (e?.message || 'bilinmeyen hata'))
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <Modal
      open
      onClose={onKapat}
      title="Keşiften Görev Oluştur"
      width={460}
      footer={
        <>
          <Button variant="secondary" onClick={onKapat}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Oluşturuluyor…' : 'Görevi Oluştur'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <Label required>Başlık</Label>
          <Input value={baslik} onChange={e => setBaslik(e.target.value)} />
        </div>
        <div>
          <Label>Atanan</Label>
          <CustomSelect value={atanan} onChange={e => setAtanan(e.target.value)}>
            <option value="">Atanmadı</option>
            {(kullanicilar || []).map(k => <option key={k.id} value={String(k.id)}>{k.ad}</option>)}
          </CustomSelect>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label>Öncelik</Label>
            <CustomSelect value={oncelik} onChange={e => setOncelik(e.target.value)}>
              <option value="dusuk">Düşük</option>
              <option value="orta">Orta</option>
              <option value="yuksek">Yüksek</option>
            </CustomSelect>
          </div>
          <div>
            <Label>Son tarih</Label>
            <Input type="date" value={sonTarih} onChange={e => setSonTarih(e.target.value)} />
          </div>
        </div>
        <p className="t-caption" style={{ margin: 0 }}>
          Keşif notu ve malzeme listesi görev açıklamasına otomatik eklenir.
        </p>
      </div>
    </Modal>
  )
}
