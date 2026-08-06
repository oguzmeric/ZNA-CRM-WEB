// Servis raporu (form) HTML sablonu.
// Sirket parametresine gore tepedeki banner ve dipteki firma bilgisi degisir.
// Ic icerik (musteri bilgileri, ariza/cozum metinleri, imza kutulari) ortak.
//
// Print: A4 boyutu, tek sayfaya sigdirir. Yazdir / PDF butonu ile cikti alinir.
//
// Kullanim:
//   <ServisFormu talep={talepData} sirket="zna" />     // ZNA Teknoloji
//   <ServisFormu talep={talepData} sirket="anadolunet" />

import { useState, useEffect, useRef } from 'react'
import znaBanner from '../../assets/servis-formu/zna-banner.png'
import anadolunetLogo from '../../assets/servis-formu/anadolunet-logo.jpeg'
import { kucukGorsel } from '../../lib/gorselUrl'

// A4 genisligi CSS px cinsinden (210mm @96dpi). Telefonda olcegi bundan hesaplariz.
const A4_PX = 794

const SIRKET_BILGI = {
  zna: {
    bannerSrc: znaBanner,
    bannerYukseklik: 58,
    showText: false,           // ZNA banner zaten "SERVIS RAPORU" yazisi iceriyor
    firmaAdi: 'ZNA TEKNOLOJİ BİLİŞİM HİZMETLERİ SANAYİ VE TİCARET LİMİTED ŞİRKETİ',
    adres: 'İ.O.S.B. KERESTECİLER SANAYİ SİTESİ 3B BLOK KAT:3 NO:3 BAŞAKŞEHİR/İSTANBUL',
    iletisim: 'İLETİŞİM: (212) 549-9494 · FAX: (212) 671-7454',
    accent: '#16365D',
    accentBg: '#DCE6F1',
  },
  anadolunet: {
    bannerSrc: anadolunetLogo,
    bannerYukseklik: 52,
    showText: true,            // Anadolunet logosunda 'SERVIS RAPORU' yok — yazi ekle
    firmaAdi: 'ANADOLUNET DİJİTAL YAPI A.Ş.',
    adres: 'İ.O.S.B. KERESTECİLER SANAYİ SİTESİ 3B BLOK KAT:3 NO:3 BAŞAKŞEHİR/İSTANBUL',
    iletisim: 'İLETİŞİM: (212) 549-9494 · FAX: (212) 671-7454',
    accent: '#1A1A1A',
    accentBg: '#F0F0F0',
  },
}

// Tarih formatla — '2026-06-15T08:30:00Z' -> '15/06/2026 08:30'
function tarihFmt(s) {
  if (!s) return ''
  try {
    const d = new Date(s)
    const gg = String(d.getDate()).padStart(2, '0')
    const aa = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${gg}/${aa}/${yyyy} ${hh}:${mm}`
  } catch { return s }
}

// Checkbox isareti — printer-safe (unicode box characters)
const KUTU_BOS = '☐'
const KUTU_DOLU = '☒'

// Unicode karakter bazı font/tarayıcılarda net render etmiyor.
// HTML kutu — her yerde net gözükür (browser + print + PDF).
function Kutu({ dolu }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 10, height: 10,
      border: '1.2px solid #000',
      textAlign: 'center',
      lineHeight: '8px',
      verticalAlign: 'middle',
      marginRight: 3,
      fontSize: 10,
      fontWeight: 700,
      color: '#000',
    }}>{dolu ? '✓' : ''}</span>
  )
}

// malzemeler: servis_malzemeleri kayıtları (kullanildi) — envanterden düşülen cihaz/sarf listesi
export default function ServisFormu({ talep = {}, sirket = 'zna', malzemeler = [] }) {
  const cfg = SIRKET_BILGI[sirket] || SIRKET_BILGI.zna

  // Telefonda A4'u ekrana SIGDIR. Eskiden sabit 794px basiliyordu: musteri SMS
  // linkini telefonda acinca formun sag yarisi (Tutar sutunu, Genel Toplam,
  // talep no) ekran disinda kaliyordu — 57 hucrenin 27'si gorunmuyordu.
  // Olcum: iPhone 13'te gorsel ekran 709px, form 794px (2026-07-15).
  // Yazdirmada olcek YOK — @page A4 aynen korunur (asagidaki print CSS sifirlar).
  const sarmalRef = useRef(null)
  const sayfaRef = useRef(null)
  const [olcek, setOlcek] = useState(1)
  const [sarmalYukseklik, setSarmalYukseklik] = useState(null)

  useEffect(() => {
    const hesapla = () => {
      const musait = sarmalRef.current?.clientWidth || window.innerWidth
      const yeni = Math.min(1, musait / A4_PX)
      setOlcek(yeni)
      const h = sayfaRef.current?.offsetHeight
      setSarmalYukseklik(yeni < 1 && h ? Math.ceil(h * yeni) : null)
    }
    hesapla()
    window.addEventListener('resize', hesapla)
    // Fotograf/banner yuklenince sayfa uzayabilir — yuksekligi tekrar olc
    const g = window.setTimeout(hesapla, 600)
    return () => { window.removeEventListener('resize', hesapla); window.clearTimeout(g) }
  }, [talep?.id, sirket])

  const kucultuluyor = olcek < 1

  // ─── Renkler ve stil tokenleri ───────────────────────────────────────
  const ACCENT = cfg.accent
  const ACCENT_BG = cfg.accentBg
  const BORDER = '#808080'

  const sayfaStyle = {
    width: '210mm',
    minHeight: '297mm',
    margin: '0 auto',
    padding: '8mm 10mm',
    background: '#fff',
    color: '#000',
    fontFamily: '"Microsoft Sans Serif", Arial, sans-serif',
    fontSize: 8.4,
    lineHeight: 1.22,
  }

  // Dikey yoğunluk: imza bloğu ilk sayfaya sığsın diye boşluklar kısıldı
  // (eskiden taşıp tek başına 2. sayfada, üstte kalıyordu).
  const tabloStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    border: `1px dashed ${BORDER}`,
    marginBottom: 4,
  }

  const cellStyle = {
    border: `1px dashed ${BORDER}`,
    padding: '2px 5px',
    verticalAlign: 'top',
  }

  const labelStyle = {
    ...cellStyle,
    fontWeight: 700,
    color: ACCENT,
    width: 110,
    background: '#fff',
  }

  const sectionHeader = {
    background: ACCENT_BG,
    color: ACCENT,
    fontWeight: 800,
    fontSize: 9,
    padding: '3px 6px',
    textAlign: 'left',
    letterSpacing: 0.3,
  }

  const valueStyle = { ...cellStyle, color: ACCENT }

  // ─── Veri ────────────────────────────────────────────────────────────
  const musteri = {
    no: talep.talepNo || talep.id || '—',
    kurum: talep.firmaAdi || talep.musteriAd || '—',
    // Lokasyon (alt lokasyon: "Living Lab" gibi) KENDİ satırında basılır —
    // eskiden İl/İlçe alanına düşüyordu (06.08). İl/İlçe gerçek şehirdir.
    lokasyon: talep.lokasyon || '—',
    ilIlce: talep.ilIlce || talep.sehir || '—',
    sube: talep.sube || '—',
    adres: talep.adres || '—',
    gsm: talep.telefon || '—',
    email: talep.email || '—',
  }

  // TR karakter normalize — "arıza" → "ariza" (checkbox eşleşmesi için)
  const trNorm = (s) => String(s || '').toLowerCase()
    .replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/Ü/g, 'u')
    .replace(/ş/g, 's').replace(/Ş/g, 's')
    .replace(/ö/g, 'o').replace(/Ö/g, 'o')
    .replace(/ç/g, 'c').replace(/Ç/g, 'c')
  const servisTipi = trNorm(talep.servisTipi)
  const tipKutu = (key) => <Kutu dolu={servisTipi.includes(key)} />
  const yukum = trNorm(talep.yukumluluk)
  const yukumKutu = (key) => <Kutu dolu={yukum.includes(key)} />
  const yer = trNorm(talep.servisYeri)
  const yerKutu = (key) => <Kutu dolu={yer.includes(key)} />

  const ariza = talep.aciklama || ''
  const yapilan = talep.cozumAciklamasi || ''
  const urunTanimi = talep.cihazTuru || talep.urunTanimi || '—'
  const seriNo = talep.seriNumarasi || '—'
  const markaModel = [talep.marka, talep.model].filter(Boolean).join(' / ') || '—'

  const yedekParcalar = Array.isArray(talep.yedekParcalar) ? talep.yedekParcalar : []
  const genelToplam = yedekParcalar.reduce((s, p) => s + Number(p.tutar || 0), 0)

  const fotolar = (Array.isArray(talep.dosyalar) ? talep.dosyalar : [])
    .filter((d) => d?.tip === 'image' || /\.(jpe?g|png|webp)(\?|$)/i.test(d?.url || ''))

  // Print-only stiller
  const printCss = `
    @media print {
      body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }

      /* Kenar boşluğunu YALNIZ @page verir; sayfa kutusu bu alanı birebir
         doldurur. Eskiden .sf-sayfa 210mm sabit + kendi 10mm yan padding'i
         vardı, üstüne @page 6mm boşluk bırakıyordu → her sayfada taşma,
         sağ kenar kırpılıyordu. */
      /* ⚠️ margin: 0 — Chrome'un kendi üstbilgi/altbilgisini (tarih, sayfa
         başlığı, SAYFA ALTINDAKİ UZUN URL) bastıracak yer bırakmaz; müşteriye
         giden belgede bunlar istenmiyor. Kenar boşluğunu .sf-sayfa'nın kendi
         dolgusu veriyor. */
      @page { size: A4; margin: 0; }
      .sf-sarmal { height: auto !important; overflow: visible !important; }

      /* ANTET — her sayfanın EN DİBİNDE (son sayfa ve fotoğraf sayfası dahil).
         İki parçalı desen:
         1) tfoot dolgusu: tarayıcı tablo altbilgisini her sayfa sonunda
            tekrarlar → her sayfada antet KADAR boşluk ayrılır, içerik binmez.
         2) gerçek antet position:fixed bottom:0 → Chrome yazdırmada fixed'i
            her sayfada tekrarlar ve HEP sayfanın dibine basar. tfoot tek
            başına son sayfada dibe inmiyordu (içerik bitince hemen altında
            kalıyordu). ⚠️ bottom NEGATİF OLMAMALI — sayfa kutusu dışına taşan
            fixed kırpılıyor, antet hiç basılmıyor (ilk denemenin sebebi).
            Playwright page.pdf ile 2 sayfalık testte doğrulandı. */
      .sf-antet-grup { display: table-footer-group; }
      .sf-antet-dolgu { height: 16mm; }
      .sf-antet {
        position: fixed !important;
        bottom: 0 !important; left: 0 !important; right: 0 !important;
        margin: 0 !important;
        background: #fff !important;
        border-top: 1px solid #808080 !important;
        padding: 4px 9mm 6mm !important;
      }
      .sf-sayfa {
        transform: none !important;
        width: auto !important;
        max-width: none !important;
        /* ⚠️ min-height 297mm EKRAN için (A4 önizlemesi). Yazdırmada ilk sayfayı
           zorla tam boya şişirip imza bloğunu tek başına 2. sayfaya itiyordu —
           sayfanın %80'i boş kalıyordu. */
        min-height: 0 !important;
        /* Kenar boşluğu artık @page'ten değil buradan (yukarıdaki margin:0
           notu). Alt boşluğu tfoot dolgusu (.sf-antet-dolgu) veriyor. */
        padding: 10mm 9mm 0 !important;
        margin: 0 !important;
        box-sizing: border-box !important;
      }

      /* Satır ve imza bloğu ortadan bölünmesin. Tablonun tamamına avoid
         vermiyoruz: uzun açıklama tablosu sığmayınca koca boşluk bırakırdı. */
      tr { break-inside: avoid; page-break-inside: avoid; }
      .sf-imza { break-inside: avoid; page-break-inside: avoid; }
      img { break-inside: avoid; page-break-inside: avoid; }
    }
    @media screen {
      body { background: #e9eef5; }
    }
  `

  return (
    <>
      <style>{printCss}</style>
      <div
        ref={sarmalRef}
        className="sf-sarmal"
        style={kucultuluyor
          ? { width: '100%', height: sarmalYukseklik ?? undefined, overflow: 'hidden' }
          : undefined}
      >
      <div
        ref={sayfaRef}
        className="sf-sayfa"
        style={kucultuluyor
          ? { ...sayfaStyle, margin: 0, transform: `scale(${olcek})`, transformOrigin: 'top left' }
          : sayfaStyle}
      >
        {/* ⚠️ ANTET her sayfada: tfoot + display:table-footer-group.
            Önce position:fixed denendi — Chrome yazdırmada BASMIYORDU (kullanıcı
            çıktısında antet hiç görünmedi). Tarayıcının tablo altbilgisini her
            sayfada tekrarlama davranışı bu iş için güvenilir tek yöntem. */}
        <table className="sf-cerceve" style={{ width: '100%', borderCollapse: 'collapse', border: 'none' }}>
          <tfoot className="sf-antet-grup">
            <tr><td style={{ border: 'none', padding: 0 }}>
            {/* Yazdırmada her sayfanın sonunda YER AYIRAN görünmez dolgu —
                gerçek antet aşağıdaki .sf-antet, print'te position:fixed ile
                bu boşluğun üstüne basılır. Ekranda yüksekliği 0. */}
            <div className="sf-antet-dolgu" />
            </td></tr>
          </tfoot>
          <tbody>
            <tr><td style={{ border: 'none', padding: 0 }}>
        {/* ─── BANNER ─── */}
        <div style={{ marginBottom: 8, textAlign: 'center' }}>
          <img
            src={cfg.bannerSrc}
            alt={cfg.firmaAdi}
            style={{
              maxWidth: '100%',
              height: cfg.bannerYukseklik,
              objectFit: 'contain',
            }}
          />
          {cfg.showText && (
            <div style={{
              fontSize: 18, fontWeight: 800, color: ACCENT,
              letterSpacing: 2, marginTop: 4,
            }}>
              SERVİS RAPORU
            </div>
          )}
        </div>

        {/* ─── MÜŞTERİ BİLGİLERİ ─── */}
        <table style={tabloStyle}>
          <tbody>
            <tr>
              <td colSpan={4} style={sectionHeader}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>MÜŞTERİ BİLGİLERİ</span>
                  <span style={{ fontSize: 9 }}>{musteri.no}</span>
                </div>
              </td>
            </tr>
            <tr>
              <td style={labelStyle}>Kurum/Kuruluş</td>
              <td style={valueStyle} colSpan={3}>{musteri.kurum}</td>
            </tr>
            <tr>
              <td style={labelStyle}>Lokasyon</td>
              <td style={valueStyle} colSpan={3}>{musteri.lokasyon}</td>
            </tr>
            <tr>
              <td style={labelStyle}>İl/İlçe</td>
              <td style={valueStyle}>{musteri.ilIlce}</td>
              <td style={labelStyle}>Şube</td>
              <td style={valueStyle}>{musteri.sube}</td>
            </tr>
            <tr>
              <td style={labelStyle}>Adres</td>
              <td style={valueStyle} colSpan={3}>{musteri.adres}</td>
            </tr>
            <tr>
              <td style={labelStyle}>Gsm</td>
              <td style={valueStyle}>{musteri.gsm}</td>
              <td style={labelStyle}>E-mail</td>
              <td style={valueStyle}>{musteri.email}</td>
            </tr>

            {/* Servis Tipi */}
            <tr>
              <td style={labelStyle}>Servis Tipi</td>
              <td style={{ ...valueStyle, fontSize: 9 }} colSpan={3}>
                <span style={{ marginRight: 14 }}>{tipKutu('ariza')} Arıza Tespiti</span>
                <span style={{ marginRight: 14 }}>{tipKutu('bakim')} Bakım</span>
                <span style={{ marginRight: 14 }}>{tipKutu('urun')} Ürün Alımı</span>
                <span style={{ marginRight: 14 }}>{tipKutu('kurulum')} Kurulum</span>
                <span style={{ marginRight: 14 }}>{tipKutu('teslimat')} Teslimat</span>
                <span>{tipKutu('kesif')} Keşif</span>
              </td>
            </tr>

            {/* Yükümlülük */}
            <tr>
              <td style={labelStyle}>Yükümlülük</td>
              <td style={{ ...valueStyle, fontSize: 9 }} colSpan={3}>
                <span style={{ marginRight: 14 }}>{yukumKutu('garanti')} Garanti Kapsamında</span>
                <span style={{ marginRight: 14 }}>{yukumKutu('servis')} Servis Sözleşmeli</span>
                <span>{yukumKutu('bakim')} Bakım Sözleşmeli</span>
              </td>
            </tr>

            {/* Servis Yeri */}
            <tr>
              <td style={labelStyle}>Servis Yeri</td>
              <td style={{ ...valueStyle, fontSize: 9 }} colSpan={3}>
                <span style={{ marginRight: 14 }}>{yerKutu('teknik')} ZNA Teknik Servis</span>
                <span style={{ marginRight: 14 }}>{yerKutu('yerinde')} Müşteri Yerinde</span>
                <span style={{ marginRight: 14 }}>{yerKutu('online')} Online</span>
                <span>{yerKutu('diger')} Diğer</span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ─── SERVİS TALEP BİLGİLERİ ─── */}
        <table style={tabloStyle}>
          <tbody>
            <tr><td colSpan={4} style={sectionHeader}>SERVİS TALEP BİLGİLERİ</td></tr>
            <tr>
              <td style={labelStyle}>Adı ve Soyadı</td>
              <td style={valueStyle}>{talep.ilgiliKisi || '—'}</td>
              <td style={labelStyle}>Servis Talep Tarihi / Saati</td>
              <td style={valueStyle}>{tarihFmt(talep.olusturmaTarihi || talep.tarih)}</td>
            </tr>
            <tr>
              <td style={labelStyle}>Servis İsteği</td>
              <td style={valueStyle} colSpan={3}>{talep.konu || '—'}</td>
            </tr>
          </tbody>
        </table>

        {/* ─── SERVİS VERİLEN SİSTEM BİLGİLERİ ─── */}
        <table style={tabloStyle}>
          <tbody>
            <tr><td colSpan={4} style={sectionHeader}>SERVİS VERİLEN SİSTEM BİLGİLERİ</td></tr>
            <tr>
              <td style={labelStyle}>Ürün Tanımı</td>
              <td style={valueStyle}>{urunTanimi}</td>
              <td style={labelStyle}>Seri Numarası</td>
              <td style={valueStyle}>{seriNo}</td>
            </tr>
            {/* Künye Numarası kaldırıldı (06.08): fiilen hiç kullanılmıyordu,
                boş kalınca da iç kayıt id'si basılıyordu — müşteri belgesinde
                anlamsız */}
            <tr>
              <td style={labelStyle}>Marka / Model</td>
              <td style={valueStyle} colSpan={3}>{markaModel}</td>
            </tr>
          </tbody>
        </table>

        {/* ─── ARIZA AÇIKLAMASI ─── */}
        <table style={tabloStyle}>
          <tbody>
            <tr><td style={sectionHeader}>ARIZA AÇIKLAMASI</td></tr>
            <tr>
              <td style={{ ...valueStyle, minHeight: 60, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>
                {ariza || ' '}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ─── YAPILAN İŞLEMLER ─── */}
        <table style={tabloStyle}>
          <tbody>
            <tr><td style={sectionHeader}>YAPILAN İŞLEMLER</td></tr>
            <tr>
              <td style={{ ...valueStyle, minHeight: 60, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>
                {yapilan || ' '}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ─── YEDEK PARÇALAR / HİZMETLER ─── */}
        <table style={tabloStyle}>
          <thead>
            <tr>
              <th style={{ ...sectionHeader, width: 28, textAlign: 'center' }}>#</th>
              <th style={sectionHeader}>Yedek Parçalar ve/veya Hizmetler</th>
              <th style={{ ...sectionHeader, width: 80, textAlign: 'right' }}>Birim Fiyat</th>
              <th style={{ ...sectionHeader, width: 60, textAlign: 'right' }}>Miktar</th>
              <th style={{ ...sectionHeader, width: 90, textAlign: 'right' }}>Tutar</th>
            </tr>
          </thead>
          <tbody>
            {yedekParcalar.length > 0 ? yedekParcalar.map((p, i) => (
              <tr key={i}>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
                <td style={cellStyle}>{p.aciklama || ''}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{Number(p.birim_fiyat ?? p.birimFiyat ?? 0).toFixed(2)} ₺</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{p.miktar || 0}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{Number(p.tutar || 0).toFixed(2)} ₺</td>
              </tr>
            )) : (
              <>
                {[0, 1, 2].map(i => (
                  <tr key={i}><td colSpan={5} style={{ ...cellStyle, height: 22 }}>&nbsp;</td></tr>
                ))}
              </>
            )}
            <tr>
              <td colSpan={4} style={{ ...cellStyle, textAlign: 'right', fontWeight: 700, color: ACCENT }}>
                Genel Toplam
              </td>
              <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 700, color: ACCENT }}>
                {genelToplam.toFixed(2)} ₺
              </td>
            </tr>
          </tbody>
        </table>

        {/* ─── KULLANILAN MALZEMELER (ENVANTER) — servis_malzemeleri 'kullanildi' ─── */}
        {malzemeler.length > 0 && (
          <table style={tabloStyle}>
            <thead>
              <tr>
                <th style={{ ...sectionHeader, width: 28, textAlign: 'center' }}>#</th>
                <th style={sectionHeader}>Kullanılan Malzeme / Cihaz (Envanter)</th>
                <th style={{ ...sectionHeader, width: 140 }}>Seri No</th>
                <th style={{ ...sectionHeader, width: 70, textAlign: 'right' }}>Miktar</th>
              </tr>
            </thead>
            <tbody>
              {malzemeler.map((m, i) => (
                <tr key={m.id || i}>
                  <td style={{ ...cellStyle, textAlign: 'center' }}>{i + 1}</td>
                  <td style={cellStyle}>{m.urunAdi || m.urun_adi || ''}{(m.stokKodu || m.stok_kodu) ? ` (${m.stokKodu || m.stok_kodu})` : ''}</td>
                  <td style={cellStyle}>{m.seriNo || m.seri_no || '—'}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{m.miktar || 1} {m.birim || 'Adet'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ─── SERVİS KOŞULLARI ─── */}
        <table style={tabloStyle}>
          <tbody>
            <tr><td style={sectionHeader}>SERVİS KOŞULLARI</td></tr>
            <tr>
              <td style={{ ...valueStyle, fontSize: 7.6, lineHeight: 1.5, color: '#333', padding: '5px 6px' }}>
                - Garanti dışı arıza müdahalelerinde, sistemin çalışır durumda teslim edilmesinden sonra gerçekleşen arızaların giderilmesi ayrıca ücretlendirilecektir.<br />
                - Servis Formunda belirtilen değiştirilmesi tespit edilmiş ve kurum yetkilisi tarafından imzalanarak onaylanmış parçaların değiştirilmemesinden kaynaklanan her türlü arızalara müdahale ayrıca ücretlendirilecektir.<br />
                - Servis Formunda belirtilen bilgiler doğrultusunda yapılan tüm işlemler müşteri onayı imzasını takiben geçerlilik kazanır.
              </td>
            </tr>
          </tbody>
        </table>

        {/* ─── İMZA ALANLARI ─── */}
        <table className="sf-imza" style={tabloStyle}>
          <thead>
            <tr>
              <th style={sectionHeader}>MÜŞTERİ YETKİLİSİ</th>
              <th style={sectionHeader}>YETKİLİ KURUM/KURULUŞ</th>
              <th style={sectionHeader}>YETKİLİ SERVİS PERSONELİ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...cellStyle, width: '33.3%', verticalAlign: 'top' }}>
                <div style={{ fontSize: 8, color: ACCENT, fontWeight: 600 }}>Servis İstemini Onaylayan</div>
                <div style={{ fontSize: 8, color: '#666' }}>{talep.teslimAlanAd || talep.ilgiliKisi || 'Kurum/Kuruluş Yetkilisi'}</div>
                {talep.musteriImza
                  ? <img src={talep.musteriImza} alt="imza" style={{ maxWidth: '100%', maxHeight: 56, objectFit: 'contain', display: 'block', margin: '2px 0' }} />
                  : <div style={{ height: 34 }} />}
                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 4, fontSize: 8, color: ACCENT, fontWeight: 600 }}>
                  ONAY / İMZA
                </div>
              </td>
              <td style={{ ...cellStyle, width: '33.3%', verticalAlign: 'top' }}>
                <div style={{ fontSize: 8, color: ACCENT, fontWeight: 600 }}>Servis İstemini Onaylayan</div>
                <div style={{ fontSize: 8, color: '#666' }}>Kurum/Kuruluş Yetkilisi</div>
                <div style={{ height: 34 }} />
                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 4, fontSize: 8, color: ACCENT, fontWeight: 600 }}>
                  TEKNİK İNCELEME
                </div>
              </td>
              <td style={{ ...cellStyle, width: '33.3%', verticalAlign: 'top' }}>
                <div style={{ fontSize: 8, color: ACCENT, fontWeight: 600 }}>{cfg.firmaAdi.split(' SANAYİ')[0]}</div>
                <div style={{ fontSize: 8, color: '#666' }}>{talep.teknisyen || '—'}</div>
                {talep.personelImza
                  ? <img src={talep.personelImza} alt="imza" style={{ maxWidth: '100%', maxHeight: 56, objectFit: 'contain', display: 'block', margin: '2px 0' }} />
                  : <div style={{ height: 34 }} />}
                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 4, fontSize: 8, color: ACCENT, fontWeight: 600 }}>
                  TEKNİK İNCELEME / İMZA
                </div>
              </td>
            </tr>
          </tbody>
        </table>


        {/* ─── SERVİS FOTOĞRAFLARI (varsa, ayrı sayfa) ─── */}
        {fotolar.length > 0 && (
          <div style={{ pageBreakBefore: 'always', paddingTop: '4mm' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: ACCENT, marginBottom: 20, paddingBottom: 6, borderBottom: `2px solid ${ACCENT}` }}>
              📷 SERVİS FOTOĞRAFLARI
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {fotolar.map((f, i) => (
                <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden', pageBreakInside: 'avoid' }}>
                  {/* 'contain' ŞART: 'cover' fotoğrafı kutuya KIRPARAK sığdırıyordu —
                      dikey telefon karelerinin üstü/altı kesilip "çekildiği gibi
                      görünmüyor" şikayeti doğurdu (06.08). Belge kalitesi için
                      1200px/82 çekilir (2'li gridde ~300 DPI baskı netliği). */}
                  <img src={kucukGorsel(f.url, { genislik: 1200, kalite: 82 })} alt={f.ad || `Fotoğraf ${i + 1}`} style={{ width: '100%', height: 220, objectFit: 'contain', display: 'block', background: '#f8fafc' }} />
                  {f.ad && <div style={{ fontSize: 8, color: '#64748b', padding: '3px 6px', borderTop: '1px solid #e2e8f0' }}>{f.ad}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
            </td></tr>
          </tbody>
        </table>
        {/* ─── ANTET (dipnot) ─── ekranda önizlemenin sonunda normal akışta;
            yazdırmada .sf-antet print CSS'i ile HER sayfanın en dibine
            sabitlenir (son sayfa dahil). */}
        <div
          className="sf-antet"
          style={{
            marginTop: 8, paddingTop: 5, borderTop: `1px solid ${BORDER}`,
            fontSize: 8.5, color: ACCENT, textAlign: 'center', lineHeight: 1.5,
            background: '#fff',
          }}
        >
          <div style={{ fontWeight: 700 }}>{cfg.firmaAdi}</div>
          <div>{cfg.adres} · {cfg.iletisim}</div>
        </div>
      </div>
      </div>
    </>
  )
}
