// Kullanılacak Malzemeler (İÇ NOT) — teknisyen sahaya çıkmadan önce
// "ne götüreceğim" listesi. Keşif/teklif kalemleri gibi STOK KALEMİ seçilir,
// metre/adet girilir; serbest metin yazımı yerine yapılandırılmış satırlar.
//
// KURAL (kullanıcı, 28.07): "SADECE GÖSTERECEK, TESLİM ALMIYOR — denetim
// istemiyorum." Bu liste stok DÜŞMEZ, zimmet OLUŞTURMAZ, müşteri servis
// formunda GÖRÜNMEZ. Gerçek akış değişmedi:
//   sabah TARA ile zimmet  →  iş bitince "Kullanılan Malzemeler"den kendi
//   deposundan seçim (o kart stoktan düşer).
//
// Veri: servis_malzemeleri, durum='planlanan' (mig 153). servisMalzemeEkle
// 'planlanan' iken SN düşümü ve stok hareketi YAZMAZ — kasıtlı.
// Keşiften aktarılan kalemler (kesiftenMalzemePlanla) da aynı listede toplanır.
import { useState, useEffect, useMemo } from 'react'
import { Package, Plus, Trash2, Check, Pencil, X } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import {
  servisMalzemeleriGetir, servisMalzemeEkle, servisMalzemeSil,
  servisMalzemeKullanildiYap, teknisyendekiKalemler,
} from '../services/servisMalzemeService'
import { stokUrunleriniGetir } from '../services/stokService'
import AkilliUrunSecici from './AkilliUrunSecici'
import { Card, CardTitle, Button, Input, Badge, CodeBadge, Textarea } from './ui'

export default function ServisMalzemePlanCard({
  servisId, servisKodu, notMetni = '', onNotKaydet, onDegisti,
}) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [satirlar, setSatirlar] = useState([])
  const [urunler, setUrunler] = useState([])
  const [seciliUrun, setSeciliUrun] = useState(null)
  const [miktar, setMiktar] = useState(1)
  const [birim, setBirim] = useState('Adet')
  const [mesgul, setMesgul] = useState(false)
  const [elleAcik, setElleAcik] = useState(false)
  const [elleAd, setElleAd] = useState('')
  const [elleMiktar, setElleMiktar] = useState(1)
  const [elleBirim, setElleBirim] = useState('Adet')
  // Serbest metin ek not — eski "Kullanılacak Malzemeler" alanı burada yaşıyor
  const [notDuzenle, setNotDuzenle] = useState(false)
  const [notTaslak, setNotTaslak] = useState('')
  const [notKaydediliyor, setNotKaydediliyor] = useState(false)

  const yenile = () => servisMalzemeleriGetir(servisId).then(d => {
    setSatirlar(d)
    onDegisti?.()
  })

  useEffect(() => {
    servisMalzemeleriGetir(servisId).then(setSatirlar).catch(() => setSatirlar([]))
    stokUrunleriniGetir()
      .then(d => setUrunler((d || []).filter(u => u.aktif !== false)))
      .catch(() => setUrunler([]))
  }, [servisId])

  const planlananlar = useMemo(
    () => satirlar.filter(m => m.durum === 'planlanan'),
    [satirlar],
  )

  const urunSec = (u) => {
    setSeciliUrun(u)
    setBirim(u?.birim || 'Adet')
  }

  const ekle = async () => {
    if (!seciliUrun) return
    const adet = Number(miktar)
    if (!adet || adet <= 0) { toast.error('Miktar 0’dan büyük olmalı.'); return }
    setMesgul(true)
    try {
      // durum='planlanan' → stok düşmez, SN seçilmez, müşteri formuna basılmaz
      await servisMalzemeEkle({
        servisId, servisKodu,
        urun: { ...seciliUrun, birim },
        miktar: adet,
        birimFiyat: 0,
        durum: 'planlanan',
      })
      await yenile()
      setSeciliUrun(null)
      setMiktar(1)
      toast.success('Listeye eklendi.')
    } catch (e) {
      toast.error(e?.message || 'Eklenemedi.')
    } finally {
      setMesgul(false)
    }
  }

  // Stokta karşılığı olmayan satır (kablo kangalı, sarf, "yedek adaptör" gibi)
  const elleEkle = async () => {
    const ad = elleAd.trim()
    if (!ad) { toast.error('Malzeme adı gerekli.'); return }
    setMesgul(true)
    try {
      await servisMalzemeEkle({
        servisId, servisKodu,
        urun: { stokKodu: null, urunAdi: ad, stokAdi: ad, birim: elleBirim || 'Adet' },
        miktar: Number(elleMiktar) || 1,
        birimFiyat: 0,
        durum: 'planlanan',
      })
      await yenile()
      setElleAd('')
      setElleMiktar(1)
      setElleAcik(false)
      toast.success('Listeye eklendi.')
    } catch (e) {
      toast.error(e?.message || 'Eklenemedi.')
    } finally {
      setMesgul(false)
    }
  }

  const sil = async (m) => {
    const ok = await confirm({
      baslik: 'Listeden Çıkar',
      mesaj: `${m.urunAdi} kullanılacak listesinden çıkarılacak. Stok etkilenmez.`,
      onayMetin: 'Çıkar', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!ok) return
    try {
      await servisMalzemeSil(m, servisKodu)
      await yenile()
    } catch (e) {
      toast.error(e?.message || 'Silinemedi.')
    }
  }

  // Kısayol: planlanan satırı "kullanıldı"ya çevirir — ASIL kayıt yeri
  // "Kullanılan Malzemeler" kartıdır, bu yalnız hızlı geçiş.
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

  const satirKutu = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px', borderRadius: 'var(--radius-sm)',
    border: '1px dashed var(--border-default)', background: 'var(--surface-sunken)',
  }

  return (
    <Card style={{ borderColor: '#f59e0b', background: 'rgba(245,158,11,0.05)', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Package size={16} strokeWidth={1.5} style={{ color: '#b45309' }} />
        <CardTitle style={{ margin: 0 }}>
          Kullanılacak Malzemeler {planlananlar.length > 0 && <span className="tabular-nums">({planlananlar.length})</span>}
        </CardTitle>
        <Badge tone="uyari">İç Not</Badge>
      </div>
      <p className="t-caption" style={{ color: 'var(--text-tertiary)', margin: '0 0 12px' }}>
        Sahaya çıkmadan önce hazırlanacak liste. Stok düşmez, zimmet oluşmaz,
        müşteri servis formunda görünmez.
      </p>

      {/* Ekleme satırı — teklif/keşifteki akıllı arama ile aynı bileşen */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <AkilliUrunSecici
            urunler={urunler}
            value={seciliUrun?.stokKodu || ''}
            placeholder="Malzeme ara — akıllı arama…"
            onSec={urunSec}
          />
        </div>
        <div style={{ width: 90 }}>
          <Input
            type="number" className="sayi-sade" min="0.001" value={miktar}
            onChange={e => setMiktar(e.target.value)} placeholder="Miktar"
            style={{ textAlign: 'right' }}
          />
        </div>
        <div style={{ width: 100 }}>
          <Input value={birim} onChange={e => setBirim(e.target.value)} placeholder="Birim" />
        </div>
        <Button variant="primary" size="sm" onClick={ekle} disabled={mesgul || !seciliUrun}>
          {mesgul ? 'Ekleniyor…' : 'Ekle'}
        </Button>
      </div>

      {!elleAcik ? (
        <Button
          variant="tertiary" size="sm" onClick={() => setElleAcik(true)}
          iconLeft={<Plus size={12} strokeWidth={1.5} />} style={{ marginBottom: 12 }}
        >
          Stokta olmayan malzeme ekle
        </Button>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ flex: 2, minWidth: 180 }}>
            <Input value={elleAd} onChange={e => setElleAd(e.target.value)} placeholder="Malzeme adı" />
          </div>
          <div style={{ width: 90 }}>
            <Input type="number" className="sayi-sade" min="0.001" value={elleMiktar}
              onChange={e => setElleMiktar(e.target.value)} style={{ textAlign: 'right' }} />
          </div>
          <div style={{ width: 100 }}>
            <Input value={elleBirim} onChange={e => setElleBirim(e.target.value)} placeholder="Birim" />
          </div>
          <Button variant="primary" size="sm" onClick={elleEkle} disabled={mesgul}>Ekle</Button>
          <Button variant="tertiary" size="sm" onClick={() => setElleAcik(false)}>Vazgeç</Button>
        </div>
      )}

      {/* Liste */}
      {planlananlar.length === 0 ? (
        <p className="t-caption" style={{ color: 'var(--text-tertiary)', margin: '0 0 12px' }}>
          Henüz malzeme seçilmedi. Yukarıdan stok kalemi arayıp metre/adet girerek ekleyin.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
          {planlananlar.map(m => (
            <div key={m.id} style={satirKutu}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ font: '500 13px/18px var(--font-sans)' }}>{m.urunAdi}</span>
                  {m.stokKodu && <CodeBadge>{m.stokKodu}</CodeBadge>}
                </div>
                <div className="t-caption" style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>
                  <span className="tabular-nums">{m.miktar}</span> {m.birim || 'Adet'}
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => kullandim(m)}
                iconLeft={<Check size={12} strokeWidth={2} />}>
                Kullandım
              </Button>
              <button
                aria-label="Kaldır" title="Listeden çıkar" onClick={() => sil(m)}
                style={{
                  width: 28, height: 28, borderRadius: 4, cursor: 'pointer', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--danger)',
                }}
              >
                <Trash2 size={12} strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Serbest metin ek not — eski alan; "merdiven lazım", "kabloyu şuradan çek" gibi */}
      <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="t-caption" style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Ek not</span>
          {!notDuzenle && (
            <button
              onClick={() => { setNotTaslak(notMetni || ''); setNotDuzenle(true) }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'transparent', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)', padding: '3px 8px', cursor: 'pointer',
                font: '500 11px/16px var(--font-sans)', color: 'var(--text-secondary)',
              }}
            >
              <Pencil size={11} strokeWidth={1.5} /> Düzenle
            </button>
          )}
        </div>
        {notDuzenle ? (
          <div>
            <Textarea
              value={notTaslak}
              onChange={e => setNotTaslak(e.target.value)}
              rows={3}
              placeholder="Örn: merdiven gerekli, kablo güzergâhı bodrumdan…"
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Button
                variant="primary" size="sm" disabled={notKaydediliyor}
                iconLeft={<Check size={12} strokeWidth={1.5} />}
                onClick={async () => {
                  setNotKaydediliyor(true)
                  try {
                    await onNotKaydet?.(notTaslak.trim())
                    setNotDuzenle(false)
                  } catch (e) {
                    toast.error(e?.message || 'Not kaydedilemedi.')
                  } finally {
                    setNotKaydediliyor(false)
                  }
                }}
              >
                {notKaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
              </Button>
              <Button variant="secondary" size="sm" iconLeft={<X size={12} strokeWidth={1.5} />}
                onClick={() => setNotDuzenle(false)}>
                İptal
              </Button>
            </div>
          </div>
        ) : notMetni && notMetni.trim() ? (
          <p style={{ font: '400 13px/20px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', margin: 0 }}>
            {notMetni}
          </p>
        ) : (
          <p className="t-caption" style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', margin: 0 }}>
            Not yok.
          </p>
        )}
      </div>
    </Card>
  )
}
