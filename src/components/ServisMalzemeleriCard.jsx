// Serviste kullanılan malzemeler — TEK KAYNAK (mig 170).
//
// Bu kart hem stok/zimmet kaydını hem müşteri formundaki "Yedek Parçalar"
// listesini besler: servis_malzemeleri'ne yazılır, DB trigger'ı
// servis_talepleri.yedek_parcalar'ı türetir. Eskiden ikisi ayrıydı ve stoktan
// eklenen malzeme müşteri formuna HİÇ yansımıyordu (bkz. 2026-07-15).
//
// Keşiften gelen kalemler 'planlanan' olarak düşer: forma basılmaz, stok
// düşmez. Teknisyen "Kullandım" deyince stok düşer ve forma girer.
import { useState, useEffect, useMemo } from 'react'
import { Package, Trash2, Tag, Check, Plus } from 'lucide-react'
import { Button, Card, Badge, Input, CodeBadge } from './ui'
import CustomSelect from './CustomSelect'
import CokluSelect from './CokluSelect'
import AkilliUrunSecici from './AkilliUrunSecici'
import { stokUrunleriniGetir } from '../services/stokService'
import {
  servisMalzemeleriGetir, servisMalzemeEkle, servisMalzemeSil, FATURALANDIRMA_SECENEK,
  servisMalzemeGuncelle, servisMalzemeKullanildiYap, teknisyendekiKalemler,
} from '../services/servisMalzemeService'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'

const paraFmt = (n) => `${(Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`
const tarihFmt = (t) => t
  ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—'

export default function ServisMalzemeleriCard({ servisId, servisKodu, onDegisti }) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [malzemeler, setMalzemeler] = useState([])
  const [urunler, setUrunler] = useState([])
  const [seciliUrun, setSeciliUrun] = useState(null)
  const [miktar, setMiktar] = useState(1)
  const [birimFiyat, setBirimFiyat] = useState('')
  const [snKalemler, setSnKalemler] = useState([])
  const [seciliKalemIdler, setSeciliKalemIdler] = useState([]) // TOPLU S/N seçimi
  const [mesgul, setMesgul] = useState(false)
  const [elleAcik, setElleAcik] = useState(false)
  const [elleAd, setElleAd] = useState('')
  const [elleMiktar, setElleMiktar] = useState(1)
  const [elleBirim, setElleBirim] = useState('Adet')
  const [elleFiyat, setElleFiyat] = useState('')

  const yenile = () => servisMalzemeleriGetir(servisId).then(d => {
    setMalzemeler(d)
    onDegisti?.()
  })

  useEffect(() => {
    servisMalzemeleriGetir(servisId).then(setMalzemeler)
    stokUrunleriniGetir()
      .then(d => setUrunler((d || []).filter(u => u.aktif !== false)))
      .catch(() => setUrunler([]))
  }, [servisId])

  const planlananlar = useMemo(() => malzemeler.filter(m => m.durum === 'planlanan'), [malzemeler])
  const kullanilanlar = useMemo(() => malzemeler.filter(m => m.durum !== 'planlanan'), [malzemeler])
  const genelToplam = useMemo(
    () => kullanilanlar.reduce((s, m) => s + (Number(m.tutar) || 0), 0),
    [kullanilanlar],
  )

  // Ürün seçilince: SN'liyse teknisyendeki kalemleri getir, fiyatı öner
  const urunSec = async (u) => {
    setSeciliUrun(u)
    setSeciliKalemIdler([])
    setSnKalemler([])
    // Stok kartındaki satış fiyatı 'birimFiyat' — 'satisFiyat' diye bir alan YOK
    setBirimFiyat(u?.birimFiyat != null ? String(u.birimFiyat) : '')
    if (u.seriTakipli) setSnKalemler(await teknisyendekiKalemler(u.stokKodu))
  }

  const ekle = async () => {
    if (!seciliUrun) return
    if (seciliUrun.seriTakipli && seciliKalemIdler.length === 0) {
      toast.error('Bu ürün S/N takipli — en az bir seri numarası seçin.')
      return
    }
    // S/N'siz ürün — aynı stok kodu ikinci kez eklenmesin (miktarı satırdan güncelle).
    if (!seciliUrun.seriTakipli && seciliUrun.stokKodu &&
        kullanilanlar.some(m => m.stokKodu && m.stokKodu === seciliUrun.stokKodu)) {
      toast.error(`${seciliUrun.stokAdi || seciliUrun.urunAdi || seciliUrun.stokKodu} zaten ekli — satırdaki miktarı güncelleyin.`)
      return
    }
    setMesgul(true)
    try {
      if (seciliUrun.seriTakipli) {
        // TOPLU: seçili tüm S/N'leri sırayla ekle; zaten ekli olanları atla.
        let eklendi = 0, atlandi = 0
        for (const kid of seciliKalemIdler) {
          const kalem = snKalemler.find(k => k.id === Number(kid))
          if (!kalem) continue
          if (kalem.seriNo && malzemeler.some(m => m.seriNo && m.seriNo === kalem.seriNo)) { atlandi++; continue }
          await servisMalzemeEkle({
            servisId, servisKodu, urun: seciliUrun, miktar: 1,
            birimFiyat: Number(birimFiyat) || 0, kalem,
          })
          eklendi++
        }
        await yenile()
        toast.success(`${eklendi} cihaz teknisyen deposundan düşüldü${atlandi ? ` — ${atlandi} zaten vardı` : ''}.`)
      } else {
        await servisMalzemeEkle({
          servisId, servisKodu, urun: seciliUrun, miktar,
          birimFiyat: Number(birimFiyat) || 0,
        })
        await yenile()
        toast.success('Malzeme eklendi.')
      }
      setSeciliUrun(null); setMiktar(1); setBirimFiyat('')
      setSnKalemler([]); setSeciliKalemIdler([])
    } catch (e) {
      toast.error(e?.message || 'Malzeme eklenemedi.')
    } finally { setMesgul(false) }
  }

  // Stokta olmayan satır — işçilik, nakliye, 3. parti hizmet
  const elleEkle = async () => {
    if (!elleAd.trim()) { toast.error('Açıklama girin.'); return }
    setMesgul(true)
    try {
      await servisMalzemeEkle({
        servisId, servisKodu,
        urun: { stokKodu: null, urunAdi: elleAd.trim(), birim: elleBirim },
        miktar: elleMiktar,
        birimFiyat: Number(elleFiyat) || 0,
      })
      await yenile()
      toast.success('Satır eklendi.')
      setElleAd(''); setElleMiktar(1); setElleFiyat(''); setElleBirim('Adet'); setElleAcik(false)
    } catch (e) {
      toast.error(e?.message || 'Eklenemedi.')
    } finally { setMesgul(false) }
  }

  const alanGuncelle = async (m, alan, deger) => {
    const eski = malzemeler
    setMalzemeler(prev => prev.map(x => x.id === m.id ? { ...x, [alan]: deger } : x))
    try {
      await servisMalzemeGuncelle(m.id, { [alan]: deger })
      await yenile()   // tutar DB'de hesaplanıyor — doğrusunu tekrar oku
    } catch (e) {
      setMalzemeler(eski)
      toast.error(e?.message || 'Güncellenemedi.')
    }
  }

  const kullandim = async (m) => {
    let kalem = null
    if (m.stokKodu) {
      const urun = urunler.find(u => u.stokKodu === m.stokKodu)
      if (urun?.seriTakipli) {
        const kalemler = await teknisyendekiKalemler(m.stokKodu)
        if (!kalemler.length) {
          toast.error('Bu ürün S/N takipli ve teknisyende hiç SN yok — önce "Teknisyene Ver" yapılmalı.')
          return
        }
        kalem = kalemler[0]
      }
    }
    try {
      await servisMalzemeKullanildiYap(m, { kalem, servisKodu })
      await yenile()
      toast.success(kalem ? `${kalem.seriNo} düşüldü — müşteri formuna eklendi.` : 'Kullanıldı olarak işaretlendi.')
    } catch (e) {
      toast.error(e?.message || 'İşaretlenemedi.')
    }
  }

  const sil = async (m) => {
    const onay = await confirm({
      baslik: 'Satırı Kaldır',
      mesaj: m.seriNo
        ? `${m.urunAdi} (${m.seriNo}) silinecek ve SN teknisyen deposuna GERİ alınacak. Emin misin?`
        : m.durum === 'planlanan'
          ? `${m.urunAdi} planlanan listesinden çıkarılacak (stok etkilenmez). Emin misin?`
          : `${m.urunAdi} silinecek (stok girişi geri yazılır) ve müşteri formundan çıkar. Emin misin?`,
      onayMetin: 'Kaldır', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    try {
      await servisMalzemeSil(m, servisKodu)
      await yenile()
      toast.success('Satır kaldırıldı.')
    } catch (e) {
      toast.error(e?.message || 'Kaldırılamadı.')
    }
  }

  const satirKutu = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px', borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-default)', background: 'var(--surface-sunken)',
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Package size={16} strokeWidth={1.5} />
        <h3 className="t-h2" style={{ fontSize: 14, margin: 0 }}>
          Kullanılan Malzemeler {kullanilanlar.length > 0 && <span className="tabular-nums">({kullanilanlar.length})</span>}
        </h3>
      </div>
      <p className="t-caption" style={{ color: 'var(--text-tertiary)', margin: '0 0 12px' }}>
        Buraya eklenenler müşteri servis formundaki “Yedek Parçalar” listesine aynen basılır.
      </p>

      {/* Keşiften gelen planlanan malzemeler */}
      {planlananlar.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="t-caption" style={{ color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>
            Keşifte planlanan ({planlananlar.length}) — kullandıkça işaretle; forma basılmaz, stok düşmez
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {planlananlar.map(m => (
              <div key={m.id} style={{ ...satirKutu, borderStyle: 'dashed' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ font: '500 13px/18px var(--font-sans)' }}>{m.urunAdi}</span>
                    {m.stokKodu && <CodeBadge>{m.stokKodu}</CodeBadge>}
                    <Badge tone="uyari">Planlanan</Badge>
                  </div>
                  <div className="t-caption" style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>
                    <span className="tabular-nums">{m.miktar}</span> {m.birim || 'Adet'}
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => kullandim(m)}
                  iconLeft={<Check size={12} strokeWidth={2} />}>
                  Kullandım
                </Button>
                <button aria-label="Kaldır" title="Planlanan listesinden çıkar" onClick={() => sil(m)}
                  style={{
                    width: 28, height: 28, borderRadius: 4, cursor: 'pointer', flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--danger)',
                  }}>
                  <Trash2 size={12} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ekleme satırı — akıllı arama: "2 mp dome kamera" veya model/kod */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <AkilliUrunSecici
            urunler={urunler}
            value={seciliUrun?.stokKodu || ''}
            placeholder="Malzeme ara — akıllı arama…"
            onSec={urunSec}
          />
        </div>
        {seciliUrun?.seriTakipli ? (
          <div style={{ flex: 1.4, minWidth: 200 }}>
            <CokluSelect
              degerler={seciliKalemIdler}
              onChange={setSeciliKalemIdler}
              secenekler={snKalemler.map(k => ({ id: k.id, ad: `${k.seriNo} — ${k.teknisyen?.ad || 'teknisyen ?'}` }))}
              placeholder={snKalemler.length === 0 ? 'Teknisyende SN yok!' : 'S/N seç (çoklu)…'}
            />
          </div>
        ) : (
          <div style={{ width: 80 }}>
            <Input type="number" className="sayi-sade" min="0.001" value={miktar}
              onChange={e => setMiktar(e.target.value)} placeholder="Miktar" style={{ textAlign: 'right' }} />
          </div>
        )}
        <div style={{ width: 110 }}>
          <Input type="number" className="sayi-sade" min="0" step="0.01" value={birimFiyat}
            onChange={e => setBirimFiyat(e.target.value)} placeholder="Birim fiyat" style={{ textAlign: 'right' }} />
        </div>
        <Button variant="primary" size="sm" onClick={ekle} disabled={mesgul || !seciliUrun}>
          {mesgul ? 'Ekleniyor…' : 'Ekle'}
        </Button>
      </div>
      {seciliUrun?.seriTakipli && snKalemler.length === 0 && (
        <p className="t-caption" style={{ color: 'var(--warning)', marginTop: -2, marginBottom: 8 }}>
          Bu üründen hiçbir teknisyenin üzerinde SN yok — önce ModelDetay’dan “Teknisyene Ver” yapılmalı.
        </p>
      )}

      {/* Stokta olmayan satır (işçilik, nakliye vb.) */}
      {!elleAcik ? (
        <Button variant="tertiary" size="sm" onClick={() => setElleAcik(true)}
          iconLeft={<Plus size={12} strokeWidth={1.5} />} style={{ marginBottom: 12 }}>
          Stokta olmayan satır ekle (işçilik, nakliye…)
        </Button>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ flex: 2, minWidth: 180 }}>
            <Input value={elleAd} onChange={e => setElleAd(e.target.value)} placeholder="Açıklama (ör. İşçilik)" />
          </div>
          <div style={{ width: 80 }}>
            <Input type="number" className="sayi-sade" min="0.001" value={elleMiktar}
              onChange={e => setElleMiktar(e.target.value)} style={{ textAlign: 'right' }} />
          </div>
          <div style={{ width: 90 }}>
            <Input value={elleBirim} onChange={e => setElleBirim(e.target.value)} placeholder="Birim" />
          </div>
          <div style={{ width: 110 }}>
            <Input type="number" className="sayi-sade" min="0" step="0.01" value={elleFiyat}
              onChange={e => setElleFiyat(e.target.value)} placeholder="Birim fiyat" style={{ textAlign: 'right' }} />
          </div>
          <Button variant="primary" size="sm" onClick={elleEkle} disabled={mesgul}>Ekle</Button>
          <Button variant="tertiary" size="sm" onClick={() => setElleAcik(false)}>Vazgeç</Button>
        </div>
      )}

      {/* Kullanılanlar — müşteri formuna basılan liste */}
      {kullanilanlar.length === 0 ? (
        <p className="t-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>
          Henüz malzeme eklenmedi. S/N’li ürünlerde kullanım, teknisyen deposundan otomatik düşer.
        </p>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 6 }}>
            {kullanilanlar.map(m => (
              <div key={m.id} style={satirKutu}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                      {m.urunAdi}
                    </span>
                    {m.stokKodu ? <CodeBadge>{m.stokKodu}</CodeBadge> : <Badge tone="neutral">Stok dışı</Badge>}
                    {m.seriNo && (
                      <Badge tone="brand">
                        <Tag size={10} strokeWidth={1.5} style={{ marginRight: 3 }} />{m.seriNo}
                      </Badge>
                    )}
                  </div>
                  <div className="t-caption" style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {m.kullaniciAd || '—'} · {tarihFmt(m.tarih)}
                  </div>
                </div>
                {/* S/N'li satırda miktar hep 1 — SN tekildir */}
                <div style={{ width: 70 }}>
                  <Input type="number" className="sayi-sade" min="0.001" value={m.miktar}
                    disabled={!!m.seriNo}
                    onChange={e => alanGuncelle(m, 'miktar', e.target.value)}
                    style={{ textAlign: 'right' }} />
                </div>
                <span className="t-caption" style={{ color: 'var(--text-tertiary)', width: 40 }}>{m.birim || 'Adet'}</span>
                <div style={{ width: 100 }}>
                  <Input type="number" className="sayi-sade" min="0" step="0.01" value={m.birimFiyat ?? 0}
                    onChange={e => alanGuncelle(m, 'birimFiyat', e.target.value)}
                    style={{ textAlign: 'right' }} />
                </div>
                <span className="tabular-nums" style={{ width: 92, textAlign: 'right', font: '600 13px/18px var(--font-sans)' }}>
                  {paraFmt(m.tutar)}
                </span>
                {/* Faturalandırma işareti (madde 23.10) — Kullanılan Malzemeler
                    ekranındaki fatura durumu bu seçime göre otomatik atanır */}
                <div style={{ width: 170 }}>
                  <CustomSelect
                    value={m.faturalandirma || ''}
                    onChange={e => alanGuncelle(m, 'faturalandirma', e.target.value)}
                  >
                    {FATURALANDIRMA_SECENEK.map(s => <option key={s.id} value={s.id}>{s.isim}</option>)}
                  </CustomSelect>
                </div>
                <button aria-label="Malzemeyi kaldır"
                  title={m.seriNo ? 'Kaldır — SN teknisyene geri döner' : 'Kaldır'}
                  onClick={() => sil(m)}
                  style={{
                    width: 28, height: 28, borderRadius: 4, cursor: 'pointer', flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--danger)',
                  }}>
                  <Trash2 size={12} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'baseline',
            marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-default)',
          }}>
            <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>Genel Toplam</span>
            <span className="tabular-nums" style={{ font: '700 15px/20px var(--font-sans)' }}>{paraFmt(genelToplam)}</span>
          </div>
        </>
      )}
    </Card>
  )
}
