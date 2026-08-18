import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, FileText, Package, Search, ShoppingCart, X, Plus, Minus,
  CheckCircle2, Check, ChevronRight, LayoutGrid,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { katalogUrunleriniGetir } from '../../services/stokService'
import { kategorileriGetir } from '../../services/stokKategoriService'
import { musteriTalepEkle } from '../../services/teklifService'
import CustomSelect from '../../components/CustomSelect'
import {
  Button, SearchInput, Input, Textarea, Label,
  Card, Badge, EmptyState, Modal,
} from '../../components/ui'

// ── Marka normalizasyonu ────────────────────────────────────────────────────
// Katalogda aynı marka iki yazımla duruyor: "Hikvision" 122 + "HIKVISION" 95,
// "DAHUA" 279 + "Dahua" 31. Filtrede tek satır görünmeli.
// ⚠️ Türkçe İ/I tuzağı: toUpperCase() 'i' harfini 'İ' yapar ve eşleşmeyi bozar
//    ([[reference_turkce_i_tuzagi]]) — anahtar üretirken 'en-US' locale ŞART.
const markaAnahtar = (m) => (m || '').trim().toLocaleLowerCase('en-US')
// Gösterimde en yaygın yazımı kullan (HIKVISION 95 < Hikvision 122 → "Hikvision")

// Kategori ağacındaki bir düğümün kendisi + tüm alt dalları
const dalIdleri = (kategoriler, id) => {
  const sonuc = new Set([id])
  let buldu = true
  while (buldu) {
    buldu = false
    for (const k of kategoriler) {
      if (k.ustId != null && sonuc.has(k.ustId) && !sonuc.has(k.id)) {
        sonuc.add(k.id); buldu = true
      }
    }
  }
  return sonuc
}

// ⚠️ Dosya seviyesinde tanımlı — bileşen içinde tanımlansaydı her render'da
//    yeniden yaratılıp açık/kapalı durumu sıfırlanırdı ([[feedback_buyuk_liste_ui]]).
function KategoriDugumu({ dugum, seciliId, acikSet, onSec, onAcKapa, derinlik = 0 }) {
  const acik = acikSet.has(dugum.id)
  const secili = seciliId === dugum.id
  const cocukVar = dugum.cocuklar.length > 0
  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: `5px 8px 5px ${8 + derinlik * 12}px`,
          borderRadius: 'var(--radius-sm)',
          background: secili ? 'var(--brand-primary-soft)' : 'transparent',
          cursor: 'pointer',
        }}
        onClick={() => onSec(dugum.id)}
      >
        {cocukVar ? (
          <button
            type="button"
            aria-label={acik ? 'Daralt' : 'Genişlet'}
            onClick={e => { e.stopPropagation(); onAcKapa(dugum.id) }}
            style={{
              display: 'grid', placeItems: 'center', width: 16, height: 16,
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--text-tertiary)', flexShrink: 0,
            }}
          >
            <ChevronRight size={13} strokeWidth={2}
              style={{ transform: acik ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }} />
          </button>
        ) : <span style={{ width: 16, flexShrink: 0 }} />}
        <span style={{
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          font: secili ? '600 12.5px/17px var(--font-sans)' : '400 12.5px/17px var(--font-sans)',
          color: secili ? 'var(--brand-primary)' : 'var(--text-secondary)',
        }}>
          {dugum.ad}
        </span>
        <span style={{
          font: '400 11px/15px var(--font-sans)',
          color: secili ? 'var(--brand-primary)' : 'var(--text-tertiary)',
          fontVariantNumeric: 'tabular-nums', flexShrink: 0,
        }}>
          {dugum.toplamAdet}
        </span>
      </div>
      {acik && dugum.cocuklar.map(c => (
        <KategoriDugumu key={c.id} dugum={c} seciliId={seciliId} acikSet={acikSet}
          onSec={onSec} onAcKapa={onAcKapa} derinlik={derinlik + 1} />
      ))}
    </div>
  )
}

export default function TeklifIste() {
  const { kullanici } = useAuth()
  const navigate = useNavigate()

  const ayarlar = JSON.parse(localStorage.getItem('sistem_ayarlari') || '{}')
  const datasheetUrl = ayarlar.datasheetUrl || ''

  const [katalogUrunler, setKatalogUrunler] = useState([])
  const [katalogYukleniyor, setKatalogYukleniyor] = useState(true)
  const [arama, setArama] = useState('')
  const [kategoriler, setKategoriler] = useState([])
  const [seciliKategori, setSeciliKategori] = useState(null)   // null = tüm ürünler
  const [acikKategoriler, setAcikKategoriler] = useState(new Set())
  const [seciliMarka, setSeciliMarka] = useState('hepsi')
  const [sepet, setSepet] = useState([])
  const [aciklama, setAciklama] = useState('')
  const [butce, setButce] = useState('')
  const [iletisimKisi, setIletisimKisi] = useState(kullanici?.ad || '')
  const [telefon, setTelefon] = useState('')
  const [hatalar, setHatalar] = useState({})
  const [gonderildi, setGonderildi] = useState(false)
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [buyukGorsel, setBuyukGorsel] = useState(null)
  const [katalogHata, setKatalogHata] = useState(null)

  // ⚠️ SESSİZ BAŞARISIZLIK YASAK (18.08): katalog çağrısının catch'i yoktu —
  // istek patlarsa setKatalogYukleniyor(false) HİÇ çalışmıyor, ekran sonsuza
  // kadar iskelet gösteriyordu. Hata yakalanmadığı için sebep de görünmüyordu
  // ("teklif iste'ye basınca ürünler listelenmiyor" vakası). Artık hata
  // ekranda yazılır ve tekrar denenebilir.
  // Yükleme bayrağı effect gövdesinde senkron set EDİLMEZ (cascading render):
  // başlangıçta zaten true, yeniden denemede `katalogYenile` içinde — yani
  // olay işleyicisinde — set edilir.
  const katalogCek = useCallback(async () => {
    try {
      const d = await katalogUrunleriniGetir()
      setKatalogUrunler(d || [])
      setKatalogHata(null)
    } catch (e) {
      console.error('[TeklifIste] katalog alınamadı:', e?.message || e)
      setKatalogHata(e?.message || 'Ürün kataloğu yüklenemedi.')
      setKatalogUrunler([])
    } finally {
      setKatalogYukleniyor(false)
    }

    kategorileriGetir()
      .then(d => setKategoriler(d || []))
      .catch(e => console.warn('[TeklifIste] kategoriler alınamadı:', e?.message))
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- katalogCek async;
  // tüm setState çağrıları ilk `await`ten SONRA çalışıyor, effect gövdesinde
  // senkron güncelleme yok. Kural async sınırını takip edemediği için uyarıyor.
  useEffect(() => { katalogCek() }, [katalogCek])

  const katalogYenile = () => {
    setKatalogYukleniyor(true)
    setKatalogHata(null)
    katalogCek()
  }

  // Kategori ağacı + her düğümün ALT DALLAR DAHİL ürün sayısı
  const kategoriAgaci = useMemo(() => {
    if (kategoriler.length === 0) return []
    const dogrudan = new Map()
    for (const u of katalogUrunler) {
      if (u.kategoriId == null) continue
      dogrudan.set(u.kategoriId, (dogrudan.get(u.kategoriId) || 0) + 1)
    }
    const dugumler = new Map(kategoriler.map(k => ({ ...k, cocuklar: [] })).map(k => [k.id, k]))
    const kokler = []
    for (const k of dugumler.values()) {
      const ust = k.ustId != null ? dugumler.get(k.ustId) : null
      if (ust) ust.cocuklar.push(k); else kokler.push(k)
    }
    const topla = (d) => {
      d.toplamAdet = (dogrudan.get(d.id) || 0) + d.cocuklar.reduce((t, c) => t + topla(c), 0)
      d.cocuklar.sort((a, b) => b.toplamAdet - a.toplamAdet)
      return d.toplamAdet
    }
    kokler.forEach(topla)
    // Boş dalları gizle — müşteri tıklayıp boş sayfa görmesin
    const ayikla = (liste) => liste
      .filter(d => d.toplamAdet > 0)
      .map(d => ({ ...d, cocuklar: ayikla(d.cocuklar) }))
    return ayikla(kokler).sort((a, b) => b.toplamAdet - a.toplamAdet)
  }, [kategoriler, katalogUrunler])

  // Seçili kategori + tüm alt dalları
  const kategoriKapsami = useMemo(
    () => (seciliKategori == null ? null : dalIdleri(kategoriler, seciliKategori)),
    [kategoriler, seciliKategori]
  )

  // Kategoriye göre süzülmüş küme — marka listesi BUNUN üstünden çıkar ki
  // "IP Kamera" seçiliyken alakasız markalar listede görünmesin.
  const kategoriliUrunler = useMemo(
    () => (kategoriKapsami ? katalogUrunler.filter(u => kategoriKapsami.has(u.kategoriId)) : katalogUrunler),
    [katalogUrunler, kategoriKapsami]
  )

  const markalar = useMemo(() => {
    const harita = new Map()   // anahtar → { etiket, adet, yazimlar }
    for (const u of kategoriliUrunler) {
      const ham = (u.marka || '').trim()
      if (!ham) continue
      const a = markaAnahtar(ham)
      const v = harita.get(a) || { adet: 0, yazimlar: new Map() }
      v.adet++
      v.yazimlar.set(ham, (v.yazimlar.get(ham) || 0) + 1)
      harita.set(a, v)
    }
    return [...harita.entries()]
      .map(([anahtar, v]) => ({
        anahtar, adet: v.adet,
        // en çok kullanılan yazımı etiket yap (HIKVISION 95 < Hikvision 122)
        etiket: [...v.yazimlar.entries()].sort((x, y) => y[1] - x[1])[0][0],
      }))
      .sort((a, b) => b.adet - a.adet || a.etiket.localeCompare(b.etiket, 'tr'))
  }, [kategoriliUrunler])

  // Kategori değişince o kategoride olmayan marka seçili kalmasın (boş liste tuzağı)
  // ⚠️ filtreliUrunler'den ÖNCE hesaplanmalı: aşağıdaki süzgeç `seciliMarka`
  // kullanıyordu, yani "geçersiz marka" düzeltmesi arayüzde uygulanıyor ama
  // LİSTEYE yansımıyordu — kategori değişince liste boş kalabiliyordu (18.08).
  const markaGecerli = seciliMarka === 'hepsi' || markalar.some(m => m.anahtar === seciliMarka)
  const etkinMarka = markaGecerli ? seciliMarka : 'hepsi'

  const filtreliUrunler = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr')
    return kategoriliUrunler.filter(u => {
      // Arama: ürün adı + marka + MODEL + stok kodu (mig 297 model kolonu)
      const aramaUygun = !q ||
        `${u.stokAdi || ''} ${u.marka || ''} ${u.model || ''} ${u.stokKodu || ''}`
          .toLocaleLowerCase('tr').includes(q)
      const markaUygun = etkinMarka === 'hepsi' || markaAnahtar(u.marka) === etkinMarka
      return aramaUygun && markaUygun
    })
  }, [kategoriliUrunler, arama, etkinMarka])

  const seciliKategoriAdi = seciliKategori == null
    ? null : kategoriler.find(k => k.id === seciliKategori)?.ad
  const filtreVar = seciliKategori != null || etkinMarka !== 'hepsi' || arama.trim() !== ''

  const filtreleriTemizle = () => {
    setSeciliKategori(null); setSeciliMarka('hepsi'); setArama('')
  }

  const kategoriAcKapa = (id) => setAcikKategoriler(prev => {
    const y = new Set(prev)
    if (y.has(id)) y.delete(id); else y.add(id)
    return y
  })

  // Kategoriye tıklayınca hem seç hem dalı aç (ikinci tık seçimi kaldırır)
  const kategoriSec = (id) => {
    setSeciliKategori(prev => (prev === id ? null : id))
    setAcikKategoriler(prev => new Set(prev).add(id))
  }

  const sepeteEkle = (urun) => {
    setSepet(prev => {
      const v = prev.find(s => s.urun.id === urun.id)
      if (v) return prev.map(s => s.urun.id === urun.id ? { ...s, adet: s.adet + 1 } : s)
      return [...prev, { urun, adet: 1 }]
    })
  }

  const sepetAdetGuncelle = (urunId, adet) => {
    if (adet <= 0) setSepet(prev => prev.filter(s => s.urun.id !== urunId))
    else setSepet(prev => prev.map(s => s.urun.id === urunId ? { ...s, adet } : s))
  }

  const sepettenCikar = (urunId) => setSepet(prev => prev.filter(s => s.urun.id !== urunId))
  const sepetteMi = (urunId) => sepet.find(s => s.urun.id === urunId)

  const dogrula = () => {
    const h = {}
    if (sepet.length === 0) h.sepet = 'En az bir ürün seçiniz'
    if (!aciklama.trim()) h.aciklama = 'Açıklama giriniz'
    setHatalar(h)
    return Object.keys(h).length === 0
  }

  const gonder = async () => {
    if (!dogrula()) return
    setGonderiliyor(true)
    try {
      // Talep DB'ye yazılır — personel Teklifler > Müşteri Talepleri buradan
      // okur. talep_no DB trigger'ından gelir (mig 269).
      await musteriTalepEkle({
        // ⭐ musteriId KİMLİK bağı (mig 301). Eskiden yalnız firma ADI
        // yazılıyordu; talep müşteri kartında görünmüyor, RLS de isim
        // eşleşmesine dayanıyordu (aynı adlı iki müşteri birbirini görebilirdi).
        musteriId: kullanici.musteriId ?? null,
        firmaAdi: kullanici.firmaAdi || '',
        urunler: sepet.map(s => ({
          isim: s.urun.stokAdi, adet: String(s.adet),
          stokKodu: s.urun.stokKodu, marka: s.urun.marka || '',
          model: s.urun.model || '',   // mig 297 — teklifi hazırlayan modeli görsün
        })),
        aciklama, butce, iletisimKisi, telefon,
        durum: 'bekliyor',
      })
      setGonderildi(true)
    } catch (e) {
      console.error('[TeklifIste gonder]', e)
      setHatalar({ genel: 'Talebiniz gönderilemedi. Lütfen tekrar deneyin; sorun sürerse bizi arayın.' })
    } finally {
      setGonderiliyor(false)
    }
  }

  if (gonderildi) {
    return (
      <div style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--success)', color: '#fff',
          marginBottom: 20, boxShadow: 'var(--shadow-lg)',
        }}>
          <CheckCircle2 size={40} strokeWidth={2} />
        </div>
        <h2 style={{ font: '600 22px/28px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 8 }}>
          Teklif Talebiniz Alındı
        </h2>
        <p style={{ font: '400 14px/20px var(--font-sans)', color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 400, marginBottom: 20 }}>
          Satış ekibimiz seçtiğiniz ürünleri inceleyip en kısa sürede size teklif hazırlayacaktır.
        </p>
        <Button variant="primary" onClick={() => navigate('/musteri-portal')}>Ana panele dön</Button>
      </div>
    )
  }

  return (
    <div style={{ padding: 16, maxWidth: 1480, margin: '0 auto' }}>

      {/* Geri + başlık TEK SATIR — dikey yer kazanmak için (bkz. YeniTalep) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button
            onClick={() => navigate('/musteri-portal')}
            aria-label="Geri dön"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, flexShrink: 0,
              background: 'none', border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)', padding: 0, cursor: 'pointer',
              color: 'var(--text-tertiary)',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
          >
            <ArrowLeft size={15} strokeWidth={1.6} />
          </button>
          <h1 className="t-h1" style={{ margin: 0 }}>Teklif İste</h1>
        </div>
        {datasheetUrl && (
          <a
            href={datasheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 36, padding: '0 16px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--brand-primary-soft)',
              color: 'var(--brand-primary)',
              border: '1px solid var(--border-default)',
              font: '500 13px/18px var(--font-sans)',
              textDecoration: 'none',
            }}
          >
            <FileText size={14} strokeWidth={1.5} /> Ürün kataloğu
          </a>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '208px 1fr 320px', gap: 16, alignItems: 'flex-start' }}>

        {/* SOL: kategori ağacı — alışveriş sitesi düzeni */}
        <Card padding={0}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 12px', borderBottom: '1px solid var(--border-default)',
            font: '600 12px/16px var(--font-sans)', color: 'var(--text-secondary)',
            letterSpacing: '.02em', textTransform: 'uppercase',
          }}>
            <LayoutGrid size={13} strokeWidth={1.8} /> Kategoriler
          </div>
          <div style={{ padding: 6, maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
            {/* Tüm ürünler */}
            <div
              onClick={() => setSeciliKategori(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: seciliKategori == null ? 'var(--brand-primary-soft)' : 'transparent',
              }}
            >
              <span style={{ width: 16, flexShrink: 0 }} />
              <span style={{
                flex: 1,
                font: seciliKategori == null ? '600 12.5px/17px var(--font-sans)' : '400 12.5px/17px var(--font-sans)',
                color: seciliKategori == null ? 'var(--brand-primary)' : 'var(--text-secondary)',
              }}>
                Tüm ürünler
              </span>
              <span style={{
                font: '400 11px/15px var(--font-sans)', fontVariantNumeric: 'tabular-nums',
                color: seciliKategori == null ? 'var(--brand-primary)' : 'var(--text-tertiary)',
              }}>
                {katalogUrunler.length}
              </span>
            </div>

            {kategoriAgaci.map(k => (
              <KategoriDugumu
                key={k.id}
                dugum={k}
                seciliId={seciliKategori}
                acikSet={acikKategoriler}
                onSec={kategoriSec}
                onAcKapa={kategoriAcKapa}
              />
            ))}

            {kategoriAgaci.length === 0 && !katalogYukleniyor && (
              <p className="t-caption" style={{ padding: '8px 10px', margin: 0 }}>
                Kategori tanımlı değil.
              </p>
            )}
          </div>
        </Card>

        {/* ORTA: Katalog */}
        <div style={{ minWidth: 0 }}>
          {/* Arama + marka */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <SearchInput value={arama} onChange={e => setArama(e.target.value)} placeholder="Ürün adı, model veya kod ara…" />
            </div>
            <div style={{ minWidth: 190 }}>
              <CustomSelect value={etkinMarka} onChange={e => setSeciliMarka(e.target.value)}>
                <option value="hepsi">Tüm markalar ({kategoriliUrunler.length})</option>
                {markalar.map(m => (
                  <option key={m.anahtar} value={m.anahtar}>{m.etiket} ({m.adet})</option>
                ))}
              </CustomSelect>
            </div>
          </div>

          {/* Aktif filtre şeridi + sonuç sayısı */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10,
            font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)',
          }}>
            <span><b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{filtreliUrunler.length}</b> ürün</span>
            {seciliKategoriAdi && (
              <Badge tone="brand">{seciliKategoriAdi}</Badge>
            )}
            {etkinMarka !== 'hepsi' && (
              <Badge tone="neutral">{markalar.find(m => m.anahtar === etkinMarka)?.etiket}</Badge>
            )}
            {filtreVar && (
              <button
                type="button"
                onClick={filtreleriTemizle}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  color: 'var(--brand-primary)', font: '500 12px/16px var(--font-sans)',
                }}
              >
                <X size={12} strokeWidth={2} /> Filtreleri temizle
              </button>
            )}
          </div>

          {katalogYukleniyor ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{
                  height: 220, borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--border-default)',
                }} className="shimmer" />
              ))}
            </div>
          ) : katalogHata ? (
            /* Katalog ÇEKİLEMEDİ — "ürün yok" ile karıştırılmamalı. Sebep
               ekranda yazar, müşteri tekrar deneyebilir. */
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap',
              padding: '14px 16px',
              border: '1px solid rgba(220,38,38,0.35)', borderRadius: 'var(--radius-md)',
              background: 'rgba(220,38,38,0.06)',
            }}>
              <Package size={16} strokeWidth={1.7} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 2 }}>
                  Ürün kataloğu yüklenemedi
                </div>
                <div style={{ font: '400 12px/17px var(--font-sans)', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                  {katalogHata}
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={katalogYenile}>Tekrar Dene</Button>
            </div>
          ) : filtreliUrunler.length === 0 ? (
            <EmptyState
              icon={<Package size={32} strokeWidth={1.5} />}
              title={filtreVar ? 'Bu filtrelerle ürün bulunamadı' : 'Katalogda ürün bulunamadı'}
              description={filtreVar ? 'Kategori veya marka seçimini genişletmeyi deneyin.' : undefined}
              action={filtreVar ? <Button variant="secondary" onClick={filtreleriTemizle}>Filtreleri temizle</Button> : undefined}
            />
          ) : (
            /* ⚠️ Katalog KENDİ İÇİNDE kayar — ürün sayısı arttıkça sayfanın tamamı
               uzayıp sağdaki teklif formunu ekrandan düşürüyordu. */
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10,
              maxHeight: 'calc(100vh - 300px)', minHeight: 240, overflowY: 'auto', paddingRight: 4,
            }}>
              {filtreliUrunler.map(urun => {
                const secili = sepetteMi(urun.id)
                return (
                  <div
                    key={urun.id}
                    onClick={() => sepeteEkle(urun)}
                    style={{
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      background: secili ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                      border: `1px solid ${secili ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                      transition: 'all 120ms',
                    }}
                  >
                    {/* Görsel */}
                    <div style={{
                      position: 'relative',
                      height: 130,
                      background: 'var(--surface-sunken)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {urun.gorselUrl ? (
                        <img
                          src={urun.gorselUrl}
                          alt={urun.stokAdi}
                          style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 12 }}
                          onClick={e => { e.stopPropagation(); setBuyukGorsel(urun) }}
                        />
                      ) : (
                        <Package size={40} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
                      )}
                      {secili && (
                        <span style={{
                          position: 'absolute', top: 8, right: 8,
                          minWidth: 24, height: 24, padding: '0 7px',
                          borderRadius: 'var(--radius-pill)',
                          background: 'var(--brand-primary)',
                          color: '#fff',
                          font: '600 12px/1 var(--font-sans)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {secili.adet}
                        </span>
                      )}
                      {urun.grupKodu && (
                        <div style={{ position: 'absolute', top: 8, left: 8 }}>
                          <Badge tone="neutral">{urun.grupKodu}</Badge>
                        </div>
                      )}
                    </div>

                    {/* Bilgi */}
                    <div style={{ padding: 12 }}>
                      <p style={{
                        font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)',
                        margin: 0,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {urun.stokAdi}
                      </p>
                      {/* Marka · Model (mig 297) — model yoksa yalnız marka */}
                      {(urun.marka || urun.model) && (
                        <p className="t-caption" style={{ marginTop: 2, display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                          {urun.marka && <span>{urun.marka}</span>}
                          {urun.marka && urun.model && <span style={{ opacity: .45 }}>·</span>}
                          {urun.model && (
                            <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                              {urun.model}
                            </span>
                          )}
                        </p>
                      )}
                      <div style={{ marginTop: 8 }}>
                        {secili ? (
                          <div onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <button
                              aria-label="Azalt"
                              onClick={() => sepetAdetGuncelle(urun.id, secili.adet - 1)}
                              style={{
                                width: 26, height: 26, borderRadius: 'var(--radius-sm)',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: 'var(--brand-primary-soft)',
                                border: '1px solid var(--border-default)',
                                color: 'var(--brand-primary)', cursor: 'pointer',
                              }}
                            >
                              <Minus size={12} strokeWidth={2} />
                            </button>
                            <input
                              type="number"
                              value={secili.adet}
                              min={1}
                              onChange={e => sepetAdetGuncelle(urun.id, Number(e.target.value))}
                              style={{
                                width: 42, height: 26, textAlign: 'center',
                                border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-sm)',
                                font: '600 13px/1 var(--font-sans)',
                                color: 'var(--brand-primary)',
                                background: 'var(--surface-card)',
                                outline: 'none',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            />
                            <button
                              aria-label="Artır"
                              onClick={() => sepetAdetGuncelle(urun.id, secili.adet + 1)}
                              style={{
                                width: 26, height: 26, borderRadius: 'var(--radius-sm)',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: 'var(--brand-primary-soft)',
                                border: '1px solid var(--border-default)',
                                color: 'var(--brand-primary)', cursor: 'pointer',
                              }}
                            >
                              <Plus size={12} strokeWidth={2} />
                            </button>
                          </div>
                        ) : (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            font: '500 12px/16px var(--font-sans)',
                            color: 'var(--brand-primary)',
                          }}>
                            <Plus size={12} strokeWidth={1.5} /> Sepete ekle
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Sağ: Sepet + Form */}
        <Card padding={0} style={{ position: 'sticky', top: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-default)',
          }}>
            <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>
              <ShoppingCart size={14} strokeWidth={1.5} /> Seçilen ürünler
            </h3>
            <Badge tone="brand">
              <span className="tabular-nums">{sepet.length}</span> ürün
            </Badge>
          </div>

          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {sepet.length === 0 ? (
              <div style={{ padding: 24 }}>
                <EmptyState icon={<ShoppingCart size={24} strokeWidth={1.5} />} title="Soldan ürün seçin" />
              </div>
            ) : (
              <div>
                {sepet.map(({ urun, adet }) => (
                  <div key={urun.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--border-default)',
                  }}>
                    {urun.gorselUrl ? (
                      <img src={urun.gorselUrl} alt="" style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', objectFit: 'contain', border: '1px solid var(--border-default)', flexShrink: 0 }} />
                    ) : (
                      <div style={{
                        width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface-sunken)',
                        border: '1px solid var(--border-default)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-tertiary)', flexShrink: 0,
                      }}>
                        <Package size={14} strokeWidth={1.5} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {urun.stokAdi}
                      </p>
                      <p className="t-caption" style={{ marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                        {adet} {urun.birim}
                      </p>
                    </div>
                    <button
                      aria-label="Çıkar"
                      onClick={() => sepettenCikar(urun.id)}
                      style={{
                        background: 'none', border: 'none', padding: 4, cursor: 'pointer',
                        color: 'var(--text-tertiary)',
                        display: 'inline-flex',
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
                    >
                      <X size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {hatalar.sepet && (
            <p style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--danger)', padding: '0 16px 8px' }}>{hatalar.sepet}</p>
          )}

          <div style={{ padding: 16, borderTop: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Label required>Açıklama</Label>
              <Textarea
                value={aciklama}
                onChange={e => setAciklama(e.target.value)}
                placeholder="Kullanım amacı, kurulum yeri, özel istekler…"
                rows={3}
                style={hatalar.aciklama ? { borderColor: 'var(--danger)' } : {}}
              />
              {hatalar.aciklama && <p style={{ color: 'var(--danger)', font: '500 11px/16px var(--font-sans)', marginTop: 4 }}>{hatalar.aciklama}</p>}
            </div>

            <div>
              <Label>Bütçe <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(opsiyonel)</span></Label>
              <Input value={butce} onChange={e => setButce(e.target.value)} placeholder="Örn: 50.000 TL" />
            </div>

            <div>
              <Label>İlgili kişi</Label>
              <Input value={iletisimKisi} onChange={e => setIletisimKisi(e.target.value)} />
            </div>

            <div>
              <Label>Telefon</Label>
              <Input type="tel" value={telefon} onChange={e => setTelefon(e.target.value)} placeholder="0xxx xxx xx xx" />
            </div>

            {hatalar.genel && (
              <p style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--danger)', margin: 0 }}>
                {hatalar.genel}
              </p>
            )}
            <Button
              variant="primary"
              iconLeft={<Check size={14} strokeWidth={2} />}
              onClick={gonder}
              disabled={sepet.length === 0 || gonderiliyor}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {gonderiliyor ? 'Gönderiliyor…' : 'Teklif talebi gönder'}
            </Button>
          </div>
        </Card>
      </div>

      {/* Büyük görsel modal */}
      {buyukGorsel && (
        <Modal
          open={!!buyukGorsel}
          onClose={() => setBuyukGorsel(null)}
          title={
            <div>
              <div style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{buyukGorsel.stokAdi}</div>
              {buyukGorsel.marka && <div className="t-caption" style={{ marginTop: 2 }}>{buyukGorsel.marka}</div>}
            </div>
          }
          footer={
            <>
              <Button variant="secondary" onClick={() => setBuyukGorsel(null)}>Kapat</Button>
              <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => { sepeteEkle(buyukGorsel); setBuyukGorsel(null) }}>
                Sepete ekle
              </Button>
            </>
          }
          width={600}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, minHeight: 300,
            background: 'var(--surface-sunken)',
            borderRadius: 'var(--radius-sm)',
          }}>
            <img src={buyukGorsel.gorselUrl} alt={buyukGorsel.stokAdi} style={{ maxHeight: 320, maxWidth: '100%', objectFit: 'contain' }} />
          </div>
          {buyukGorsel.aciklama && (
            <p style={{ font: '400 13px/20px var(--font-sans)', color: 'var(--text-secondary)', marginTop: 12 }}>
              {buyukGorsel.aciklama}
            </p>
          )}
        </Modal>
      )}
    </div>
  )
}
