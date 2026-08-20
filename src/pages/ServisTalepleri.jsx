import { useState, useEffect, useMemo } from 'react'
import { useUrlSayfa } from '../lib/useUrlSayfa'
import { useAuth } from '../context/AuthContext'
import { useServisTalebi } from '../context/ServisTalebiContext'
import { trContains } from '../lib/trSearch'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Trash2, Inbox, LayoutGrid, List, X, AlertTriangle, Filter, Plus, User, MapPin } from 'lucide-react'
import CustomSelect from '../components/CustomSelect'
import Sayfalama from '../components/Sayfalama'
import ServisKonuYonetimModal from '../components/ServisKonuYonetimModal'
import {
  Button, SearchInput, Card, Badge, CodeBadge, KPICard, EmptyState, Avatar,
} from '../components/ui'

const ACIL_TONE = {
  acil:    'kayip',
  yuksek:  'beklemede',
  normal:  'lead',
  dusuk:   'neutral',
}
const DURUM_TONE = {
  bekliyor:     'pasif',
  inceleniyor:  'beklemede',
  atandi:       'lead',
  devam_ediyor: 'beklemede',
  tamamlandi:   'aktif',
  iptal:        'kayip',
}

export default function ServisTalepleri() {
  const { kullanici } = useAuth()
  const [konuYonetimAcik, setKonuYonetimAcik] = useState(false)
  const { talepler, talepSil, ANA_TURLER, DURUM_LISTESI, ACILIYET_SEVIYELERI } = useServisTalebi()
  // Talebi OLUŞTURAN kişi — ayrı kolonu yok, durum geçmişinin ilk kaydından
  // okunur. ⚠️ Anahtar adı web/mobil'de farklı yazılmış: web `kullaniciAd`,
  // mobil `kullanici` — ikisine de bakılmalı, yoksa mobil kayıtlar boş görünür.
  const olusturanAdGetir = (talep) => {
    const ilk = Array.isArray(talep.durumGecmisi) ? talep.durumGecmisi[0] : null
    return ilk?.kullaniciAd || ilk?.kullanici
      || (talep.kaynak === 'musteri' ? 'Müşteri (portal)' : null)
  }
  const [silOnayId, setSilOnayId] = useState(null)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [aramaMetni, setAramaMetni] = useState('')
  const [durumFiltre, setDurumFiltre] = useState('tumu')
  const [turFiltre, setTurFiltre] = useState('tumu')
  const [aciliyetFiltre, setAciliyetFiltre] = useState('tumu')
  // 18.08 kullanıcı isteği: "lokasyon gözükmesi ve teknisyen filtrelemesi
  // lokasyon filtrelemesi gerekli". '_yok' = atanmamış / lokasyonsuz kayıtlar.
  const [teknisyenFiltre, setTeknisyenFiltre] = useState('tumu')
  const [lokasyonFiltre, setLokasyonFiltre] = useState('tumu')
  // ⭐ 17.08 KARARI — İKİ AYRI KUYRUK (kullanıcı):
  //   "portaldan gelen servis talepleri servis taleplerinde gözükmesine gerek
  //    yok, rozet ile de gelmesine gerek yok. Müşteri portal menüsü altında
  //    listelensin, bizler oradan yönlendirme yapabiliriz."
  // Gerekçe: portal talebi HAM GELEN İŞtir — önce bakılır, sınıflanır, ekibe
  // yönlendirilir. Servis Talepleri ise zaten işlenmiş/atanmış işin listesi.
  // İkisini karıştırmak triyajı bozar. Bu yüzden bu sayfa varsayılan olarak
  // YALNIZ PERSONEL kaynaklı talepleri gösterir; portal kuyruğu
  // "Müşteri Portalı > Portal Talepleri" menüsündedir (?kaynak=musteri).
  const [kaynakFiltre, setKaynakFiltre] = useState(() => searchParams.get('kaynak') || 'personel')
  const [gorunum, setGorunum] = useState('liste')
  // Sayfalama — yalnız liste görünümünde. Kanban'da kayıtlar zaten durum
  // sütunlarına dağıldığı için tek sütun nadiren uzuyor.
  // Sayfa no URL'de (?sayfa=N): talep detayından geri dönünce liste aynı sayfada (06.08)
  const [sayfa, setSayfa] = useUrlSayfa()
  const [sayfaBoyutu, setSayfaBoyutu] = useState(50)

  // URL param degisirse state'i de guncelle (sidebar'dan navigate edince)
  useEffect(() => {
    const p = searchParams.get('kaynak') || 'personel'
    if (p !== kaynakFiltre) setKaynakFiltre(p)
  }, [searchParams])

  // ⚠️ Yalnızca ÇOKLU durum kapsayan filtreler burada tanımlı; tekil durumlar
  // doğrudan kendi id'siyle filtrelenir (böylece şerit ile aşağıdaki "Tüm
  // Durumlar" açılır listesi aynı değeri konuşur, biri diğerini şaşırtmaz).
  const DURUM_GRUBU = {
    devam: ['inceleniyor', 'atandi', 'devam_ediyor'],
    // "Açık" = henüz kapanmamış. `tamamlandi` de buradadır: teknisyen bitirdi
    // ama onay bekliyor, iş defterden düşmüş değil (bkz. servis kapanış zinciri).
    acik: ['bekliyor', 'inceleniyor', 'atandi', 'devam_ediyor', 'tamamlandi'],
  }
  const grupCoz = (f) => DURUM_GRUBU[f] || [f]

  // ⚠️ Aciliyet dört kademeli: dusuk / normal / yuksek / acil. Şeritteki kutu
  // eskiden YALNIZ `acil` sayıyordu — oysa sahada kimse "Acil" seçmiyor,
  // "Yüksek" seçiyor (canlıda: normal 114, yuksek 2, acil 0). Kutu hep 0
  // gösteriyordu ve öncelikli işler hiçbir yerde dikkat çekmiyordu.
  const ACILIYET_GRUBU = { oncelikli: ['acil', 'yuksek'] }
  const aciliyetCoz = (f) => ACILIYET_GRUBU[f] || [f]

  // ⭐ Lokasyon İKİ kolonda taşınıyor: `lokasyon` (görüntü metni) ve
  // `lokasyonId` (mig 300 kesin bağ). Canlıda 174 kaydın 142'sinde metin,
  // 116'sında id dolu — ve id'si dolu OLUP metni boş kayıt YOK. Bu yüzden
  // hem gösterim hem filtre METİN üzerinden çalışır; id'ye düşmek gerekmiyor.
  const lokasyonMetni = (t) => (t.lokasyon || '').trim()

  // Filtre seçenekleri — kaynak kapsamına (personel/portal) SAYGILI türetilir.
  // Ham `talepler`den türetilse personel kuyruğunda portal lokasyonları da
  // listelenir ve seçilince liste boş gelirdi.
  const kaynaktakiler = useMemo(() => talepler.filter(t => {
    if (kaynakFiltre === 'tumu') return true
    return (t.kaynak || 'personel') === kaynakFiltre
  }), [talepler, kaynakFiltre])

  const teknisyenSecenekleri = useMemo(() => {
    const set = new Set(kaynaktakiler.map(t => t.atananKullaniciAd).filter(Boolean))
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'))
  }, [kaynaktakiler])

  const lokasyonSecenekleri = useMemo(() => {
    const set = new Set(kaynaktakiler.map(lokasyonMetni).filter(Boolean))
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'))
  }, [kaynaktakiler])

  // Durum DIŞINDAKİ filtreler — sayaçlar da liste de bu kümeden türer.
  // Sayaçları ham `talepler`den hesaplamak, sayfanın kaynak kapsamını (personel
  // / müşteri talebi) yok sayıyordu: şerit 116 derken liste 115 gösteriyordu.
  const kapsamdaki = talepler.filter(t => {
    if (aramaMetni && !trContains(
      // Lokasyon da aranabilir olmalı — kolonu görüp arayamamak tutarsız olurdu
      [t.talepNo, t.konu, t.musteriAd, t.firmaAdi, t.lokasyon, t.atananKullaniciAd].filter(Boolean).join(' '),
      aramaMetni,
    )) return false
    if (turFiltre !== 'tumu' && t.anaTur !== turFiltre) return false
    if (aciliyetFiltre !== 'tumu' && !aciliyetCoz(aciliyetFiltre).includes(t.aciliyet)) return false
    if (teknisyenFiltre !== 'tumu') {
      if (teknisyenFiltre === '_yok') { if (t.atananKullaniciAd) return false }
      else if (t.atananKullaniciAd !== teknisyenFiltre) return false
    }
    if (lokasyonFiltre !== 'tumu') {
      const l = lokasyonMetni(t)
      if (lokasyonFiltre === '_yok') { if (l) return false }
      else if (l !== lokasyonFiltre) return false
    }
    if (kaynakFiltre !== 'tumu') {
      const k = t.kaynak || 'personel'   // eski kayitlar default personel
      if (k !== kaynakFiltre) return false
    }
    return true
  })

  const durumEsle = (t) => durumFiltre === 'tumu' || grupCoz(durumFiltre).includes(t.durum)

  const filtrelenmis = kapsamdaki.filter(durumEsle).sort((a, b) => {
    // En yeni en üstte. Aciliyet kolonda zaten renkli badge olarak görünüyor +
    // filtre var → sıralama saf kronolojik kalsın.
    // Tarih null'sa id ile tiebreak (id artan numara, en büyük = en yeni).
    const at = a.olusturmaTarihi ? new Date(a.olusturmaTarihi).getTime() : 0
    const bt = b.olusturmaTarihi ? new Date(b.olusturmaTarihi).getTime() : 0
    if (at !== bt) return bt - at
    return (b.id || 0) - (a.id || 0)
  })

  // Filtre/arama değişince ilk sayfaya dön. React'in "render sırasında state
  // düzelt" deseni — useEffect ile yapmak react-hooks/set-state-in-effect
  // uyarısı üretiyordu.
  const filtreAnahtari = `${aramaMetni}|${durumFiltre}|${turFiltre}|${aciliyetFiltre}|${teknisyenFiltre}|${lokasyonFiltre}|${kaynakFiltre}|${sayfaBoyutu}`
  const [oncekiFiltre, setOncekiFiltre] = useState(filtreAnahtari)
  if (oncekiFiltre !== filtreAnahtari) {
    setOncekiFiltre(filtreAnahtari)
    setSayfa(1)
  }

  const toplamSayfa = Math.max(1, Math.ceil(filtrelenmis.length / sayfaBoyutu))
  const aktifSayfa = Math.min(sayfa, toplamSayfa)
  const sayfalanmis = filtrelenmis.slice((aktifSayfa - 1) * sayfaBoyutu, aktifSayfa * sayfaBoyutu)

  const say = (f) => kapsamdaki.filter(t => grupCoz(f).includes(t.durum)).length
  const ist = {
    toplam: kapsamdaki.length,
    bekliyor: say('bekliyor'),
    devam: say('devam'),
    tamamlandi: say('tamamlandi'),
    onaylandi: say('onaylandi'),
    reddedildi: say('reddedildi'),
    iptal: say('iptal'),
    // Öncelikli = AÇIK olan acil/yüksek işler. Kapanmış acil iş uyarı değil,
    // geçmiştir; bu yüzden kapsam `acik` durum grubuyla sınırlı — kutuya
    // tıklandığında da aynı küme listelenir.
    oncelikli: kapsamdaki.filter(t =>
      aciliyetCoz('oncelikli').includes(t.aciliyet) &&
      grupCoz('acik').includes(t.durum)).length,
  }

  // ⚠️ Şeritteki kutuların toplamı, toplam kayıt sayısını TUTMAK ZORUNDA.
  // 11.08.2026'da tutmuyordu: `onaylandi` (kapanmış işler) hiçbir kutuda yoktu
  // ve 116 talebin 79'u şeritte görünmüyordu — kullanıcı "kapalı servisleri
  // gösteren bir kısım yok" dedi, haklıydı. DURUM_LISTESI'ne yeni bir durum
  // eklenip buraya kutu eklenmezse aynı sessiz kayıp tekrarlar; bu kontrol
  // geliştirmede uyarır.
  if (import.meta.env.DEV) {
    const kutuToplami = ist.bekliyor + ist.devam + ist.tamamlandi
      + ist.onaylandi + ist.reddedildi + ist.iptal
    if (kutuToplami !== ist.toplam) {
      const sayilan = new Set([...grupCoz('devam'), 'bekliyor', 'tamamlandi', 'onaylandi', 'reddedildi', 'iptal'])
      const kayip = [...new Set(kapsamdaki.filter(t => !sayilan.has(t.durum)).map(t => t.durum))]
      console.warn('[ServisTalepleri] Şeritte sayılmayan durum(lar):', kayip,
        `— ${ist.toplam - kutuToplami} kayıt hiçbir kutuda görünmüyor.`)
    }
  }

  const temizle = () => {
    setDurumFiltre('tumu'); setTurFiltre('tumu'); setAciliyetFiltre('tumu')
    setTeknisyenFiltre('tumu'); setLokasyonFiltre('tumu'); setAramaMetni('')
  }
  const filtreAktif = durumFiltre !== 'tumu' || turFiltre !== 'tumu' || aciliyetFiltre !== 'tumu'
    || teknisyenFiltre !== 'tumu' || lokasyonFiltre !== 'tumu' || aramaMetni

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      <ServisKonuYonetimModal acik={konuYonetimAcik} onKapat={() => setKonuYonetimAcik(false)} />
      {/* Header — kompakt tek satır */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          {/* Sayfa iki kuyruğa hizmet ediyor; başlık hangisinde olduğunu söyler.
              Portal kuyruğu "Müşteri Portalı" menüsünden açılır (?kaynak=musteri). */}
          <h1 className="t-h2" style={{ margin: 0 }}>
            {kaynakFiltre === 'musteri' ? 'Portal Talepleri' : 'Servis Talepleri'}
          </h1>
          {kaynakFiltre === 'musteri' && (
            <span style={{
              background: 'var(--brand-primary)', color: '#fff',
              borderRadius: 5, padding: '2px 7px',
              font: '700 10px/14px var(--font-sans)', letterSpacing: '0.03em',
            }}>MÜŞTERİ PORTALI</span>
          )}
          <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
            <span className="tabular-nums">{filtrelenmis.length}</span> gösteriliyor
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/* Konu başlıkları sabit liste (mig 285) — yönetim yalnız admin */}
          {kullanici?.rol === 'admin' && (
            <Button variant="tertiary" size="sm" onClick={() => setKonuYonetimAcik(true)}>
              Konu Başlıkları
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus size={13} strokeWidth={1.5} />}
            onClick={() => navigate('/servis-talepleri/yeni')}
          >
            Yeni Talep
          </Button>
          <div style={{ display: 'inline-flex', padding: 2, background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)' }}>
            <button
              onClick={() => setGorunum('liste')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px',
                borderRadius: 'calc(var(--radius-sm) - 2px)',
                background: gorunum === 'liste' ? 'var(--surface-card)' : 'transparent',
                boxShadow: gorunum === 'liste' ? 'var(--shadow-sm)' : 'none',
                color: gorunum === 'liste' ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: 'none', cursor: 'pointer',
                font: '500 12px/16px var(--font-sans)',
              }}
            >
              <List size={12} strokeWidth={1.5} /> Liste
            </button>
            <button
              onClick={() => setGorunum('pano')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px',
                borderRadius: 'calc(var(--radius-sm) - 2px)',
                background: gorunum === 'pano' ? 'var(--surface-card)' : 'transparent',
                boxShadow: gorunum === 'pano' ? 'var(--shadow-sm)' : 'none',
                color: gorunum === 'pano' ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: 'none', cursor: 'pointer',
                font: '500 12px/16px var(--font-sans)',
              }}
            >
              <LayoutGrid size={12} strokeWidth={1.5} /> Pano
            </button>
          </div>
        </div>
      </div>

      {/* KPI — kompakt yatay şerit */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 4,
        padding: '6px 10px',
        background: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        marginBottom: 10,
        alignItems: 'stretch',
      }}>
        {[
          { l: 'Toplam',      v: ist.toplam,      ton: 'var(--text-primary)',   f: 'tumu' },
          { l: 'Bekliyor',    v: ist.bekliyor,    ton: 'var(--text-secondary)', f: 'bekliyor' },
          { l: 'Devam eden',  v: ist.devam,       ton: 'var(--warning)',        f: 'devam' },
          { l: 'Tamamlandı',  v: ist.tamamlandi,  ton: 'var(--success)',        f: 'tamamlandi' },
          { l: 'Kapalı',      v: ist.onaylandi,   ton: 'var(--text-secondary)', f: 'onaylandi' },
          ...(ist.reddedildi > 0 ? [{ l: 'Reddedildi', v: ist.reddedildi, ton: 'var(--danger)', f: 'reddedildi' }] : []),
          ...(ist.iptal > 0 ? [{ l: 'İptal', v: ist.iptal, ton: 'var(--text-tertiary)', f: 'iptal' }] : []),
          { l: 'Öncelikli',   v: ist.oncelikli,   ton: ist.oncelikli > 0 ? 'var(--danger)' : 'var(--text-tertiary)',
            f: 'acik', af: 'oncelikli', ipucu: 'Açık olan acil ve yüksek öncelikli talepler' },
        ].map((k, i, arr) => [
          // Sayaç tıklanabilir: gösterdiği küme AYNEN listeye uygulanır.
          // "Öncelikli" kutusu iki ekseni birden ayarlar (aciliyet + açık durum),
          // çünkü saydığı küme de o ikisinin kesişimi.
          k.f ? (
            <button
              key={k.l}
              onClick={() => {
                setDurumFiltre(k.f)
                setAciliyetFiltre(k.af || 'tumu')
                setSayfa(1)
              }}
              title={k.ipucu || `${k.l} olanları listele`}
              style={{
                padding: '4px 12px', display: 'inline-flex', alignItems: 'center', gap: 6,
                border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                // Seçili vurgusu iki ekseni de kontrol eder; yoksa "Öncelikli"
                // seçiliyken "Toplam" da seçili görünürdü.
                background: (durumFiltre === k.f && aciliyetFiltre === (k.af || 'tumu')) ? 'var(--surface-sunken)' : 'transparent',
                boxShadow: (durumFiltre === k.f && aciliyetFiltre === (k.af || 'tumu')) ? 'inset 0 0 0 1px var(--border-strong)' : 'none',
              }}
            >
              <span style={{ font: '500 10px/14px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{k.l}</span>
              <span style={{ font: '700 14px/18px var(--font-sans)', color: k.ton, fontVariantNumeric: 'tabular-nums' }}>{k.v}</span>
            </button>
          ) : (
            <div key={k.l} style={{ padding: '4px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ font: '500 10px/14px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{k.l}</span>
              <span style={{ font: '700 14px/18px var(--font-sans)', color: k.ton, fontVariantNumeric: 'tabular-nums' }}>{k.v}</span>
            </div>
          ),
          i < arr.length - 1 && (
            <span key={`sep-${i}`} style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-default)' }} />
          ),
        ])}
      </div>

      {/* Filtreler — kompakt tek şerit */}
      <Card style={{ marginBottom: 10, padding: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 6 }}>
          <div style={{ gridColumn: 'span 2' }}>
            <SearchInput
              value={aramaMetni}
              onChange={e => setAramaMetni(e.target.value)}
              placeholder="Talep no, konu, müşteri, firma…"
            />
          </div>
          <CustomSelect value={durumFiltre} onChange={e => { setDurumFiltre(e.target.value); setSayfa(1) }}>
            <option value="tumu">Tüm Durumlar</option>
            {/* Şeritteki "Devam eden" kutusu bu değeri set eder — listede de
                karşılığı olmalı, yoksa seçim açılır listede boş görünür. */}
            <option value="acik">Açık (kapanmamış tüm talepler)</option>
            <option value="devam">Devam Eden (atandı + inceleniyor + devam ediyor)</option>
            {DURUM_LISTESI.map(d => <option key={d.id} value={d.id}>{d.isim}</option>)}
          </CustomSelect>
          <CustomSelect value={turFiltre} onChange={e => setTurFiltre(e.target.value)}>
            <option value="tumu">Tüm Türler</option>
            {ANA_TURLER.map(t => <option key={t.id} value={t.id}>{t.isim}</option>)}
          </CustomSelect>
          <CustomSelect value={aciliyetFiltre} onChange={e => { setAciliyetFiltre(e.target.value); setSayfa(1) }}>
            <option value="tumu">Tüm Aciliyet</option>
            {/* Şeritteki "Öncelikli" kutusunun karşılığı — seçim burada da görünsün */}
            <option value="oncelikli">Öncelikli (acil + yüksek)</option>
            {ACILIYET_SEVIYELERI.map(a => <option key={a.id} value={a.id}>{a.isim}</option>)}
          </CustomSelect>
          {/* TEKNİSYEN — atanan personel. Seçenekler taleplerden türetilir,
              sabit personel listesinden DEĞİL: ayrılmış personelin eski
              talepleri de filtrelenebilsin. */}
          <CustomSelect value={teknisyenFiltre} onChange={e => { setTeknisyenFiltre(e.target.value); setSayfa(1) }}>
            <option value="tumu">Tüm Teknisyenler</option>
            <option value="_yok">Atanmamış</option>
            {teknisyenSecenekleri.map(ad => <option key={ad} value={ad}>{ad}</option>)}
          </CustomSelect>
          {/* LOKASYON — metin alanı üzerinden (bkz. lokasyonMetni notu) */}
          <CustomSelect value={lokasyonFiltre} onChange={e => { setLokasyonFiltre(e.target.value); setSayfa(1) }}>
            <option value="tumu">Tüm Lokasyonlar</option>
            <option value="_yok">Lokasyonsuz</option>
            {lokasyonSecenekleri.map(l => <option key={l} value={l}>{l}</option>)}
          </CustomSelect>
          {/* KANAL — kuyruklar ayrı olduğu için bu bir filtre değil, KAPSAM
              göstergesi. Yine de "hepsini gör" gerekebiliyor (arama/rapor);
              seçim URL'e yazılır, sayfa paylaşılınca aynı kapsam açılır.
              ⚠️ Portal görünümünde (?kaynak=musteri) GÖSTERİLMEZ (20.08 isteği):
              sayfa zaten "Portal Talepleri" başlığını taşıyor, buradaki "Portal
              talepleri" yazısı tekrar/karışıklık yaratıyordu. Kuyruklar arası
              geçiş menüden yapılır (Servis ↔ Müşteri Portalı). */}
          {kaynakFiltre !== 'musteri' && (
            <CustomSelect
              value={kaynakFiltre}
              onChange={e => {
                const v = e.target.value
                setKaynakFiltre(v); setSayfa(1)
                setSearchParams(prev => {
                  const p = new URLSearchParams(prev)
                  // 'personel' varsayılan olduğu için URL'e yazılmaz
                  if (v === 'personel') p.delete('kaynak'); else p.set('kaynak', v)
                  return p
                }, { replace: true })
              }}
            >
              <option value="personel">Personel talepleri</option>
              <option value="musteri">Portal talepleri</option>
              <option value="tumu">Hepsi (personel + portal)</option>
            </CustomSelect>
          )}
          {filtreAktif && (
            <Button variant="tertiary" size="sm" iconLeft={<X size={12} strokeWidth={1.5} />} onClick={temizle}>
              Filtreleri temizle
            </Button>
          )}
        </div>
      </Card>

      {/* Liste */}
      {gorunum === 'liste' && (
        filtrelenmis.length === 0 ? (
          <EmptyState icon={<Inbox size={32} strokeWidth={1.5} />} title="Talep bulunamadı" />
        ) : (
          <Card padding={0} style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr>
                    {['Talep No', 'Konu / Müşteri', 'Lokasyon', 'Tür', 'Aciliyet', 'Durum', 'Atanan Personel', 'Oluşturan', 'Tarih', ''].map((h, i, arr) => (
                      <th key={i} style={{
                        background: 'var(--surface-sunken)',
                        padding: '10px 14px',
                        textAlign: i === arr.length - 1 ? 'right' : 'left',
                        font: '600 11px/16px var(--font-sans)',
                        color: 'var(--text-tertiary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        borderBottom: '1px solid var(--border-default)',
                        whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sayfalanmis.map(talep => {
                    const anaTur = ANA_TURLER.find(t => t.id === talep.anaTur)
                    const durum = DURUM_LISTESI.find(d => d.id === talep.durum)
                    const aciliyet = ACILIYET_SEVIYELERI.find(a => a.id === talep.aciliyet)
                    const silOnayAcik = silOnayId === talep.id
                    return (
                      <>
                        <tr
                          key={talep.id}
                          onClick={() => !silOnayAcik && navigate(`/servis-talepleri/${talep.id}`)}
                          style={{ cursor: silOnayAcik ? 'default' : 'pointer', transition: 'background 120ms' }}
                          onMouseEnter={e => !silOnayAcik && (e.currentTarget.style.background = 'var(--surface-sunken)')}
                          onMouseLeave={e => !silOnayAcik && (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '5px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                            <CodeBadge>{talep.talepNo}</CodeBadge>
                          </td>
                          <td style={{ padding: '5px 14px', borderBottom: '1px solid var(--border-default)', maxWidth: 300 }}>
                            <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {talep.konu}
                            </div>
                            <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                              {talep.firmaAdi || talep.musteriAd}
                            </div>
                          </td>
                          <td style={{ padding: '5px 14px', borderBottom: '1px solid var(--border-default)', maxWidth: 180 }}>
                            {lokasyonMetni(talep) ? (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%',
                                font: '400 12.5px/17px var(--font-sans)', color: 'var(--text-secondary)',
                              }} title={lokasyonMetni(talep)}>
                                <MapPin size={11} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {lokasyonMetni(talep)}
                                </span>
                              </span>
                            ) : (
                              <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '5px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                            {anaTur && <Badge tone="brand">{anaTur.isim}</Badge>}
                          </td>
                          <td style={{ padding: '5px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                            {aciliyet && <Badge tone={ACIL_TONE[aciliyet.id]}>{aciliyet.isim}</Badge>}
                          </td>
                          <td style={{ padding: '5px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                            {durum && <Badge tone={DURUM_TONE[durum.id]}>{durum.isim}</Badge>}
                          </td>
                          <td style={{ padding: '5px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                            {talep.atananKullaniciAd ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <Avatar name={talep.atananKullaniciAd} size="xs" />
                                <span style={{ font: '500 12.5px/16px var(--font-sans)', color: 'var(--text-primary)' }}>
                                  {talep.atananKullaniciAd}
                                </span>
                              </span>
                            ) : (
                              <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '5px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                            {(() => {
                              const olusturan = olusturanAdGetir(talep)
                              if (!olusturan) return <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>—</span>
                              return (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  <Avatar name={olusturan} size="xs" />
                                  <span style={{ font: '500 12.5px/16px var(--font-sans)', color: 'var(--text-primary)' }}>{olusturan}</span>
                                </span>
                              )
                            })()}
                          </td>
                          <td style={{ padding: '5px 14px', borderBottom: '1px solid var(--border-default)', font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                            {new Date(talep.olusturmaTarihi).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                          </td>
                          <td style={{ padding: '5px 14px', borderBottom: '1px solid var(--border-default)', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                            <button
                              aria-label="Sil"
                              onClick={() => setSilOnayId(silOnayAcik ? null : talep.id)}
                              style={{
                                width: 28, height: 28,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: 'transparent', border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-sm)',
                                color: silOnayAcik ? 'var(--danger)' : 'var(--text-secondary)',
                                cursor: 'pointer',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = silOnayAcik ? 'var(--danger)' : 'var(--text-secondary)' }}
                            >
                              <Trash2 size={12} strokeWidth={1.5} />
                            </button>
                          </td>
                        </tr>
                        {silOnayAcik && (
                          <tr>
                            <td colSpan={10} style={{
                              padding: '12px 20px',
                              background: 'var(--danger-soft)',
                              borderTop: '1px solid var(--danger-border)',
                              borderBottom: '1px solid var(--border-default)',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '500 13px/18px var(--font-sans)', color: 'var(--danger)' }}>
                                  <AlertTriangle size={14} strokeWidth={1.5} />
                                  <strong>{talep.talepNo}</strong> silinecek. Emin misiniz?
                                </span>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <Button variant="secondary" size="sm" onClick={() => setSilOnayId(null)}>İptal</Button>
                                  <Button variant="danger" size="sm" onClick={() => { talepSil(talep.id); setSilOnayId(null) }}>Evet, sil</Button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Sayfalama
              aktifSayfa={aktifSayfa}
              toplamSayfa={toplamSayfa}
              toplam={filtrelenmis.length}
              sayfaBoyutu={sayfaBoyutu}
              setSayfa={setSayfa}
              setSayfaBoyutu={setSayfaBoyutu}
            />
          </Card>
        )
      )}

      {/* Pano */}
      {gorunum === 'pano' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {DURUM_LISTESI.filter(d => d.id !== 'iptal').map(durum => {
            const durumTalepleri = filtrelenmis.filter(t => t.durum === durum.id)
            const durumToneId = DURUM_TONE[durum.id]
            return (
              <div
                key={durum.id}
                style={{
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--surface-card)',
                  borderBottom: '1px solid var(--border-default)',
                }}>
                  <Badge tone={durumToneId}>{durum.isim}</Badge>
                  <span style={{
                    minWidth: 20, height: 20, padding: '0 6px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--surface-sunken)',
                    border: '1px solid var(--border-default)',
                    font: '600 11px/1 var(--font-sans)',
                    color: 'var(--text-secondary)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {durumTalepleri.length}
                  </span>
                </div>
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 520, overflowY: 'auto' }}>
                  {durumTalepleri.length === 0 && (
                    <p style={{ textAlign: 'center', padding: '16px 8px', font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                      Talep yok
                    </p>
                  )}
                  {durumTalepleri.map(talep => {
                    const anaTur = ANA_TURLER.find(t => t.id === talep.anaTur)
                    const aciliyet = ACILIYET_SEVIYELERI.find(a => a.id === talep.aciliyet)
                    return (
                      <div
                        key={talep.id}
                        onClick={() => navigate(`/servis-talepleri/${talep.id}`)}
                        style={{
                          background: 'var(--surface-card)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-sm)',
                          padding: 10,
                          cursor: 'pointer',
                          transition: 'border-color 120ms',
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brand-primary)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-default)'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                          <CodeBadge>{talep.talepNo}</CodeBadge>
                          {aciliyet && <Badge tone={ACIL_TONE[aciliyet.id]}>{aciliyet.isim}</Badge>}
                        </div>
                        <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                          {talep.konu}
                        </div>
                        <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                          {talep.firmaAdi || talep.musteriAd}
                        </div>
                        {anaTur && (
                          <div style={{ marginTop: 6 }}>
                            <Badge tone="brand">{anaTur.isim}</Badge>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
