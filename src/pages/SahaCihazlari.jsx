// Saha Cihazları — sahaya takılı TÜM cihazların toplu görünümü (13.08.2026).
//
// Eskiden tek yol müşteri detayındaki "Müşteri Cihazları" bölümüydü; sahanın
// tamamını görmek için müşteri müşteri gezmek gerekiyordu.
//
// ⚠️ İKİ SEKME, BİRLEŞTİRME YOK (kullanıcı kararı: "karışıklık olmamalı"):
//   • Takılan Ürünler → stok_kalemleri (S/N ile müşteriye bağlananlar)
//   • Cihaz Envanteri → musteri_cihazlari (müşteri kartına elle girilenler;
//     müşteri detayındaki bölümün toplu hâli — birebir aynı veri)
//
// 17.08 — sayfa artık yalnız okumuyor: "Takılan Ürünler" sekmesinden LOKASYON
// ATANABİLİYOR. Sebep: `musteri_lokasyon_id` alanına yazan hiçbir ekran yoktu,
// sahadaki 166 cihazın yalnız 6'sında lokasyon vardı ve müşteri portalındaki
// "Cihazlarım" bu yüzden boş gösteriyordu. Diğer alanların girişi hâlâ müşteri
// kartında — bu sayfa SADECE lokasyon atar.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MonitorSmartphone, ExternalLink, RefreshCw, MapPin, X } from 'lucide-react'
import { SkeletonList } from '../components/Skeleton'
import Sayfalama from '../components/Sayfalama'
import CustomSelect from '../components/CustomSelect'
import { Button, SearchInput, Card, Badge, CodeBadge, EmptyState, Modal, Input, Label, Alert } from '../components/ui'
import { trKelimeEslesir } from '../lib/trArama'
import {
  takilanUrunleriGetir, envanterCihazlariniGetir,
  musteriLokasyonSecenekleri, kalemLokasyonAta,
} from '../services/sahaCihazService'

const fmtTarih = (t) => (t ? new Date(t).toLocaleDateString('tr-TR') : '—')

const SEKMELER = [
  { id: 'takilan', label: 'Takılan Ürünler (S/N)' },
  { id: 'envanter', label: 'Cihaz Envanteri' },
]

const SAYFA_BOYUTU = 50

// ⚠️ Modal DOSYA SEVİYESİNDE tanımlı — bileşen içinde tanımlansaydı her
// render'da yeni tip üretilir, yazılan alt lokasyon metni silinirdi
// (aynı tuzağa büyük listelerde bir kez düşülmüştü).
function LokasyonAtaModal({ acik, kalemler, onKapat, onTamamlandi }) {
  const navigate = useNavigate()
  const [lokasyonlar, setLokasyonlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [lokasyonId, setLokasyonId] = useState('')
  const [altLokasyon, setAltLokasyon] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState('')

  const musteriId = kalemler[0]?.musteriId
  const musteriAd = kalemler[0]?.musteriAd

  // ⚠️ setState'ler promise İÇİNDE — effect gövdesinde senkron setState lint
  // kuralınca yasak (cascading render). Başlangıç değerleri zaten doğru:
  // modal koşullu render edildiği için her açılışta yeniden mount olur.
  useEffect(() => {
    if (!acik || !musteriId) return
    let iptal = false
    musteriLokasyonSecenekleri(musteriId)
      .then(l => { if (!iptal) { setLokasyonlar(l); setHata('') } })
      .catch(e => { if (!iptal) setHata(e.message) })
      .finally(() => { if (!iptal) setYukleniyor(false) })
    return () => { iptal = true }
  }, [acik, musteriId])

  const kaydet = async () => {
    setKaydediliyor(true)
    setHata('')
    try {
      const sonuc = await kalemLokasyonAta({
        kalemIds: kalemler.map(k => k.id),
        musteriId,
        lokasyonId: lokasyonId === '__kaldir__' ? null : Number(lokasyonId),
        altLokasyon,
      })
      onTamamlandi(sonuc)
    } catch (e) {
      setHata(e.message)
    } finally {
      setKaydediliyor(false)
    }
  }

  const aktifLokasyonlar = lokasyonlar.filter(l => l.aktif !== false)
  const pasifLokasyonlar = lokasyonlar.filter(l => l.aktif === false)
  const secildi = !!lokasyonId

  return (
    <Modal
      open={acik}
      onClose={kaydediliyor ? undefined : onKapat}
      title={`Lokasyon Ata — ${kalemler.length} cihaz`}
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={onKapat} disabled={kaydediliyor}>Vazgeç</Button>
          <Button onClick={kaydet} disabled={!secildi || kaydediliyor || yukleniyor}>
            {kaydediliyor ? 'Atanıyor…' : lokasyonId === '__kaldir__' ? 'Lokasyonu Kaldır' : 'Ata'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
          Müşteri: <strong style={{ color: 'var(--text-primary)' }}>{musteriAd}</strong>
        </div>

        {hata && <Alert variant="danger">{hata}</Alert>}

        {yukleniyor ? (
          <div style={{ font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-tertiary)' }}>
            Lokasyonlar yükleniyor…
          </div>
        ) : lokasyonlar.length === 0 ? (
          <Alert variant="warning">
            Bu müşteride tanımlı lokasyon yok. Önce müşteri kartından lokasyon eklenmeli.
            <div style={{ marginTop: 8 }}>
              <Button size="sm" variant="secondary" onClick={() => navigate(`/musteriler/${musteriId}`)}>
                Müşteri kartını aç
              </Button>
            </div>
          </Alert>
        ) : (
          <>
            <div>
              <Label>Lokasyon</Label>
              <CustomSelect value={lokasyonId} onChange={e => setLokasyonId(e.target.value)}>
                <option value="">Lokasyon seçin…</option>
                {aktifLokasyonlar.map(l => (
                  <option key={l.id} value={l.id}>{l.ad}{l.adres ? ` — ${l.adres}` : ''}</option>
                ))}
                {pasifLokasyonlar.map(l => (
                  <option key={l.id} value={l.id}>{l.ad} (pasif)</option>
                ))}
                <option value="__kaldir__">— Lokasyonu kaldır —</option>
              </CustomSelect>
            </div>

            <div>
              <Label>Alt lokasyon <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(isteğe bağlı)</span></Label>
              <Input
                value={altLokasyon}
                onChange={e => setAltLokasyon(e.target.value)}
                placeholder="Kat 3 · Giriş holü · A blok…"
                disabled={lokasyonId === '__kaldir__'}
              />
              <p className="t-caption" style={{ margin: '4px 0 0', color: 'var(--text-tertiary)' }}>
                Seçili cihazların HEPSİNE aynı değer yazılır. Boş bırakılırsa mevcut alt lokasyon silinir.
              </p>
            </div>
          </>
        )}

        {/* Ne değişeceği açıkça gösterilir — toplu işlemde "ne oldu" belirsizliği olmamalı */}
        <div style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
          <div style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Etkilenecek cihazlar
          </div>
          <div style={{ font: '400 12px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
            {kalemler.slice(0, 6).map(k => k.seriNo || k.barkod || `#${k.id}`).join(', ')}
            {kalemler.length > 6 && ` … ve ${kalemler.length - 6} cihaz daha`}
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function SahaCihazlari() {
  const navigate = useNavigate()
  const [sekme, setSekme] = useState('takilan')
  const [takilan, setTakilan] = useState([])
  const [envanter, setEnvanter] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [arama, setArama] = useState('')
  const [musteriFiltre, setMusteriFiltre] = useState('')
  const [durumFiltre, setDurumFiltre] = useState('')
  const [yalnizLokasyonsuz, setYalnizLokasyonsuz] = useState(false)
  const [sayfa, setSayfa] = useState(1)
  // Lokasyon atama — seçim id kümesi olarak tutulur, sayfa değişince kaybolmaz
  const [seciliIdler, setSeciliIdler] = useState(() => new Set())
  const [modalAcik, setModalAcik] = useState(false)
  const [sonucMesaji, setSonucMesaji] = useState('')

  // İlk yüklemede yukleniyor zaten true — effect içinde senkron setState yok.
  // "Yenile" butonu event handler olduğu için orada serbest.
  const veriCek = () =>
    Promise.all([takilanUrunleriGetir(), envanterCihazlariniGetir()])
      .then(([t, e]) => { setTakilan(t); setEnvanter(e) })
      .finally(() => setYukleniyor(false))
  useEffect(() => { veriCek() }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  const yukle = () => { setYukleniyor(true); veriCek() }

  // Filtre değişince ilk sayfaya dön — render sırasında düzeltme deseni
  // (effect içinde senkron setState lint'te yasak)
  const filtreAnahtari = `${sekme}|${arama}|${musteriFiltre}|${durumFiltre}|${yalnizLokasyonsuz}`
  const [oncekiFiltre, setOncekiFiltre] = useState(filtreAnahtari)
  if (oncekiFiltre !== filtreAnahtari) {
    setOncekiFiltre(filtreAnahtari)
    setSayfa(1)
  }

  const kaynak = sekme === 'takilan' ? takilan : envanter

  // Müşteri filtresi seçenekleri — aktif sekmenin verisinden
  const musteriler = useMemo(
    () => [...new Set(kaynak.map(k => k.musteriAd).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
    [kaynak]
  )

  const filtreli = useMemo(() => kaynak.filter(k => {
    if (musteriFiltre && k.musteriAd !== musteriFiltre) return false
    if (durumFiltre && (k.durum || '') !== durumFiltre) return false
    // Lokasyonsuz filtresi yalnız S/N sekmesinde anlamlı (ID bağı orada)
    if (yalnizLokasyonsuz && sekme === 'takilan' && k.musteriLokasyonId) return false
    if (arama) {
      const hedef = sekme === 'takilan'
        ? [k.seriNo, k.stokKodu, k.barkod, k.marka, k.model, k.musteriAd, k.lokasyonAd]
        : [k.seriNo, k.cihazAdi, k.marka, k.model, k.ipAdresi, k.musteriAd, k.lokasyon]
      if (!trKelimeEslesir(hedef.filter(Boolean).join(' '), arama)) return false
    }
    return true
  }), [kaynak, sekme, arama, musteriFiltre, durumFiltre, yalnizLokasyonsuz])

  const toplamSayfa = Math.max(1, Math.ceil(filtreli.length / SAYFA_BOYUTU))
  const aktifSayfa = Math.min(sayfa, toplamSayfa)
  const gorunen = filtreli.slice((aktifSayfa - 1) * SAYFA_BOYUTU, aktifSayfa * SAYFA_BOYUTU)

  // Durum filtresi seçenekleri — sekmenin gerçek verisinden (uydurma liste değil)
  const durumlar = useMemo(
    () => [...new Set(kaynak.map(k => k.durum).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
    [kaynak]
  )

  const arizali = envanter.filter(c => c.durum === 'arizali').length
  const lokasyonsuzSayi = useMemo(() => takilan.filter(k => !k.musteriLokasyonId).length, [takilan])

  const musteriGit = (id) => { if (id) navigate(`/musteriler/${id}`) }

  // ── Lokasyon atama seçimi — yalnız S/N sekmesinde ──────────────────────────
  const secimAcik = sekme === 'takilan'
  const seciliKalemler = useMemo(() => takilan.filter(k => seciliIdler.has(k.id)), [takilan, seciliIdler])
  // ⚠️ Lokasyonlar MÜŞTERİYE ait — karışık seçimde hangi listenin gösterileceği
  // belirsiz olurdu. Toplu atama tek müşteriyle sınırlı.
  const seciliMusteriSayisi = useMemo(
    () => new Set(seciliKalemler.map(k => k.musteriId)).size, [seciliKalemler])
  const atanabilir = seciliKalemler.length > 0 && seciliMusteriSayisi === 1

  const secimDegistir = useCallback((id) => {
    setSeciliIdler(prev => {
      const yeni = new Set(prev)
      if (yeni.has(id)) yeni.delete(id); else yeni.add(id)
      return yeni
    })
  }, [])
  const secimiTemizle = useCallback(() => setSeciliIdler(new Set()), [])

  // Sekme değişince seçim düşer (render sırasında düzeltme deseni)
  const [oncekiSekme, setOncekiSekme] = useState(sekme)
  if (oncekiSekme !== sekme) {
    setOncekiSekme(sekme)
    if (seciliIdler.size) setSeciliIdler(new Set())
  }

  const gorunenHepsiSecili = gorunen.length > 0 && gorunen.every(k => seciliIdler.has(k.id))
  const sayfaSecimiDegistir = () => {
    setSeciliIdler(prev => {
      const yeni = new Set(prev)
      if (gorunenHepsiSecili) gorunen.forEach(k => yeni.delete(k.id))
      else gorunen.forEach(k => yeni.add(k.id))
      return yeni
    })
  }
  // ⚠️ Sayfa dışını da kapsayan seçim ayrı bir eylem: ELEMENT'te 148 cihaz var,
  // 50'lik sayfalarda tek tek gezmek pratik değil.
  const tumFiltreyiSec = () => setSeciliIdler(new Set(filtreli.map(k => k.id)))

  const atamaTamamlandi = (sonuc) => {
    setModalAcik(false)
    secimiTemizle()
    setSonucMesaji(
      sonuc.guncellenen > 0
        ? `${sonuc.guncellenen} cihazın lokasyonu güncellendi.` +
          (sonuc.degismeyen ? ` ${sonuc.degismeyen} cihaz zaten aynıydı, dokunulmadı.` : '')
        : 'Seçili cihazlar zaten bu lokasyondaydı — değişiklik yapılmadı.'
    )
    yukle()
  }

  if (yukleniyor) return <div style={{ padding: 24 }}><SkeletonList /></div>

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <p className="t-caption" style={{ margin: 0, color: 'var(--text-tertiary)' }}>
          Sahaya takılı cihazların toplu görünümü. Cihaz seçip <strong>lokasyon atayabilirsiniz</strong>;
          diğer bilgiler için müşteri kartını kullanın.
        </p>
        <Button variant="secondary" size="sm" iconLeft={<RefreshCw size={13} strokeWidth={1.5} />} onClick={yukle}>
          Yenile
        </Button>
      </div>

      {sonucMesaji && (
        <Alert variant="success" action={
          <Button size="sm" variant="ghost" onClick={() => setSonucMesaji('')}>
            <X size={14} strokeWidth={1.5} />
          </Button>
        }>
          {sonucMesaji}
        </Alert>
      )}

      {/* Sayaç şeridi — kutular sekmelerin kaynağını birebir sayar.
          18.08: dev kartlar listeyi ekran dışına itiyordu — kompakt şerit */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <SayacKutu deger={takilan.length} etiket="Takılan Ürün (S/N)" />
        <SayacKutu deger={lokasyonsuzSayi} etiket="Lokasyonu Girilmemiş" />
        <SayacKutu deger={envanter.length} etiket="Elle Girilen Cihaz" />
        <SayacKutu deger={new Set([...takilan, ...envanter].map(k => k.musteriId).filter(Boolean)).size} etiket="Müşteri" />
        <SayacKutu deger={arizali} etiket="Arızalı (envanter)" />
      </div>

      {/* Sekmeler — FaturaTalepleri ile aynı alt-çizgi deseni */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border-default)', flexWrap: 'wrap' }}>
        {SEKMELER.map(s => {
          const aktif = sekme === s.id
          return (
            <button key={s.id} type="button" onClick={() => setSekme(s.id)}
              style={{
                padding: '10px 14px', marginBottom: -1,
                background: 'transparent', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${aktif ? 'var(--brand-primary)' : 'transparent'}`,
                color: aktif ? 'var(--brand-primary)' : 'var(--text-secondary)',
                font: '600 11px/16px var(--font-sans)',
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
              {s.label} ({s.id === 'takilan' ? takilan.length : envanter.length})
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 240, maxWidth: 420 }}>
          <SearchInput
            value={arama}
            onChange={e => setArama(e.target.value)}
            placeholder={sekme === 'takilan'
              ? 'Seri no, stok kodu, marka, müşteri, lokasyon ara…'
              : 'Cihaz adı, seri no, IP, müşteri, lokasyon ara…'}
          />
        </div>
        {/* 18.08: w-auto şart — yoksa select kökü %100 genişleyip her filtreyi
            ayrı satıra itiyor, liste ekranın çok altından başlıyordu */}
        <CustomSelect className="w-auto" value={musteriFiltre} onChange={e => setMusteriFiltre(e.target.value)} style={{ minWidth: 200 }}>
          <option value="">Tüm Müşteriler</option>
          {musteriler.map(m => <option key={m} value={m}>{m}</option>)}
        </CustomSelect>
        <CustomSelect className="w-auto" value={durumFiltre} onChange={e => setDurumFiltre(e.target.value)} style={{ minWidth: 140 }}>
          <option value="">Tüm Durumlar</option>
          {durumlar.map(d => <option key={d} value={d}>{d}</option>)}
        </CustomSelect>
        {secimAcik && (
          <Button
            variant={yalnizLokasyonsuz ? 'primary' : 'secondary'}
            size="sm"
            iconLeft={<MapPin size={13} strokeWidth={1.5} />}
            onClick={() => setYalnizLokasyonsuz(v => !v)}
          >
            Lokasyonu girilmemiş ({lokasyonsuzSayi})
          </Button>
        )}
      </div>

      {/* Seçim şeridi — yalnız seçim varken görünür */}
      {secimAcik && seciliIdler.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: '10px 14px', borderRadius: 'var(--radius-md)',
          background: 'var(--brand-soft, var(--surface-sunken))',
          border: '1px solid var(--border-default)',
        }}>
          <span style={{ font: '600 12.5px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
            {seciliIdler.size} cihaz seçili
          </span>
          {seciliIdler.size < filtreli.length && (
            <button type="button" onClick={tumFiltreyiSec}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: '500 12.5px/18px var(--font-sans)', color: 'var(--brand-primary)', textDecoration: 'underline' }}>
              Filtredeki {filtreli.length} cihazın tümünü seç
            </button>
          )}
          <div style={{ flex: 1 }} />
          {!atanabilir && (
            <span style={{ font: '400 12px/18px var(--font-sans)', color: 'var(--warning, var(--text-tertiary))' }}>
              {seciliMusteriSayisi > 1
                ? `${seciliMusteriSayisi} farklı müşteri seçili — lokasyon atamak için tek müşteri seçin`
                : 'Seçim geçersiz'}
            </span>
          )}
          <Button size="sm" variant="secondary" onClick={secimiTemizle}>Seçimi temizle</Button>
          <Button size="sm" iconLeft={<MapPin size={13} strokeWidth={1.5} />}
            disabled={!atanabilir} onClick={() => setModalAcik(true)}>
            Lokasyon Ata
          </Button>
        </div>
      )}

      {gorunen.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MonitorSmartphone size={36} strokeWidth={1.2} />}
            title={arama || musteriFiltre || durumFiltre ? 'Filtreyle eşleşen kayıt yok' : 'Kayıt yok'}
            description={sekme === 'takilan'
              ? 'Depodan S/N ile müşteriye bağlanan ürünler burada listelenir.'
              : 'Müşteri kartından elle eklenen cihazlar burada listelenir.'}
          />
        </Card>
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            {sekme === 'takilan' ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', font: '400 12.5px/18px var(--font-sans)' }}>
                <thead>
                  <tr style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', textAlign: 'left' }}>
                    <th style={{ ...hucre, width: 36 }}>
                      <input type="checkbox" checked={gorunenHepsiSecili} onChange={sayfaSecimiDegistir}
                        title="Bu sayfadakileri seç" style={{ cursor: 'pointer' }} />
                    </th>
                    {['Seri No', 'Ürün', 'Müşteri', 'Lokasyon', 'Durum', 'Takılma', 'Garanti', ''].map((h, i) => (
                      <th key={i} style={{ ...hucre, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gorunen.map(k => {
                    const secili = seciliIdler.has(k.id)
                    return (
                    <tr key={k.id}
                      style={{ cursor: 'pointer', transition: 'background 120ms', background: secili ? 'var(--surface-sunken)' : 'transparent' }}
                      onClick={() => musteriGit(k.musteriId)}
                      onMouseEnter={e => { if (!secili) e.currentTarget.style.background = 'var(--surface-sunken)' }}
                      onMouseLeave={e => { if (!secili) e.currentTarget.style.background = 'transparent' }}>
                      {/* ⚠️ stopPropagation: satır tıklaması müşteri kartını açıyor */}
                      <td style={hucre} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={secili} onChange={() => secimDegistir(k.id)} style={{ cursor: 'pointer' }} />
                      </td>
                      <td style={hucre}><CodeBadge>{k.seriNo || k.barkod || '—'}</CodeBadge></td>
                      <td style={{ ...hucre, fontWeight: 500 }}>
                        {[k.marka, k.model].filter(Boolean).join(' ') || k.stokKodu || '—'}
                        {k.stokKodu && (
                          <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> · {k.stokKodu}</span>
                        )}
                      </td>
                      <td style={hucre}>{k.musteriAd}</td>
                      <td style={hucre}>
                        {k.lokasyonAd
                          ? k.lokasyonAd
                          : <span style={{ color: 'var(--text-faded)', fontStyle: 'italic' }}>girilmemiş</span>}
                      </td>
                      <td style={hucre}>{k.durum ? <Badge tone={k.durum === 'sahada' ? 'aktif' : 'neutral'}>{k.durum}</Badge> : '—'}</td>
                      <td style={{ ...hucre, whiteSpace: 'nowrap' }}>{fmtTarih(k.takilmaTarihi)}</td>
                      <td style={{ ...hucre, whiteSpace: 'nowrap' }}>{fmtTarih(k.garantiBitisTarihi)}</td>
                      <td style={{ ...hucre, textAlign: 'right' }}>
                        <ExternalLink size={13} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', font: '400 12.5px/18px var(--font-sans)' }}>
                <thead>
                  <tr style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', textAlign: 'left' }}>
                    {['Cihaz', 'Seri No', 'IP', 'Müşteri', 'Lokasyon', 'Durum', 'Eklenme', ''].map((h, i) => (
                      <th key={i} style={{ ...hucre, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gorunen.map(c => (
                    <tr key={c.id}
                      style={{ cursor: 'pointer', transition: 'background 120ms' }}
                      onClick={() => musteriGit(c.musteriId)}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-sunken)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      <td style={{ ...hucre, fontWeight: 500 }}>
                        {c.cihazAdi || [c.marka, c.model].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td style={hucre}>{c.seriNo ? <CodeBadge>{c.seriNo}</CodeBadge> : '—'}</td>
                      <td style={hucre}>{c.ipAdresi || '—'}</td>
                      <td style={hucre}>{c.musteriAd}</td>
                      <td style={hucre}>{c.lokasyon || '—'}</td>
                      <td style={hucre}>
                        {c.durum === 'arizali'
                          ? <span title={c.arizaNedeni || ''}><Badge tone="kayip">arızalı</Badge></span>
                          : <Badge tone="aktif">{c.durum || 'aktif'}</Badge>}
                      </td>
                      <td style={{ ...hucre, whiteSpace: 'nowrap' }}>{fmtTarih(c.olusturmaTarih)}</td>
                      <td style={{ ...hucre, textAlign: 'right' }}>
                        <ExternalLink size={13} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <Sayfalama
            aktifSayfa={aktifSayfa}
            toplamSayfa={toplamSayfa}
            toplam={filtreli.length}
            sayfaBoyutu={SAYFA_BOYUTU}
            setSayfa={setSayfa}
            setSayfaBoyutu={() => {}}
            secenekler={[SAYFA_BOYUTU]}
          />
          <p className="t-caption" style={{ margin: '8px 12px 4px', color: 'var(--text-tertiary)' }}>
            Satıra tıklayınca müşteri kartı açılır.
            {secimAcik && ' Soldaki kutulardan cihaz seçip lokasyon atayabilirsiniz.'}
          </p>
        </Card>
      )}

      {modalAcik && atanabilir && (
        <LokasyonAtaModal
          acik={modalAcik}
          kalemler={seciliKalemler}
          onKapat={() => setModalAcik(false)}
          onTamamlandi={atamaTamamlandi}
        />
      )}
    </div>
  )
}

const hucre = { padding: '9px 12px', borderBottom: '1px solid var(--border-default)' }

// Kompakt sayaç (ArizaliUrunler KPI deseniyle aynı boy) — KPICard'ın iki
// satırlı dev kartı üst bloğu şişiriyordu, liste ekran dışına kayıyordu.
const SayacKutu = ({ deger, etiket }) => (
  <Card style={{ padding: '7px 14px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
    <span className="tabular-nums" style={{ font: '700 15px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{deger}</span>
    <span className="t-caption">{etiket}</span>
  </Card>
)
