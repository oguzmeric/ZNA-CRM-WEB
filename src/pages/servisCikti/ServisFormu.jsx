// Servis raporu (form) HTML sablonu.
// Sirket parametresine gore tepedeki banner ve dipteki firma bilgisi degisir.
// Ic icerik (musteri bilgileri, ariza/cozum metinleri, imza kutulari) ortak.
//
// Print: A4 boyutu, tek sayfaya sigdirir. Yazdir / PDF butonu ile cikti alinir.
//
// Kullanim:
//   <ServisFormu talep={talepData} sirket="zna" />     // ZNA Teknoloji
//   <ServisFormu talep={talepData} sirket="anadolunet" />

import znaBanner from '../../assets/servis-formu/zna-banner.png'
import anadolunetLogo from '../../assets/servis-formu/anadolunet-logo.jpeg'

const SIRKET_BILGI = {
  zna: {
    bannerSrc: znaBanner,
    bannerYukseklik: 90,
    showText: false,           // ZNA banner zaten "SERVIS RAPORU" yazisi iceriyor
    firmaAdi: 'ZNA TEKNOLOJİ BİLİŞİM HİZMETLERİ SANAYİ VE TİCARET LİMİTED ŞİRKETİ',
    adres: 'İ.O.S.B. KERESTECİLER SANAYİ SİTESİ 3B BLOK KAT:3 NO:3 BAŞAKŞEHİR/İSTANBUL',
    iletisim: 'İLETİŞİM: (212) 549-9494 · FAX: (212) 671-7454',
    accent: '#16365D',
    accentBg: '#DCE6F1',
  },
  anadolunet: {
    bannerSrc: anadolunetLogo,
    bannerYukseklik: 80,
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

export default function ServisFormu({ talep = {}, sirket = 'zna' }) {
  const cfg = SIRKET_BILGI[sirket] || SIRKET_BILGI.zna

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
    fontSize: 9,
    lineHeight: 1.35,
  }

  const tabloStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    border: `1px dashed ${BORDER}`,
    marginBottom: 6,
  }

  const cellStyle = {
    border: `1px dashed ${BORDER}`,
    padding: '3px 6px',
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
    fontSize: 10,
    padding: '4px 8px',
    textAlign: 'left',
    letterSpacing: 0.3,
  }

  const valueStyle = { ...cellStyle, color: ACCENT }

  // ─── Veri ────────────────────────────────────────────────────────────
  const musteri = {
    no: talep.talepNo || talep.id || '—',
    kurum: talep.firmaAdi || talep.musteriAd || '—',
    ilIlce: talep.ilIlce || talep.lokasyon || '—',
    sube: talep.sube || '—',
    adres: talep.adres || '—',
    gsm: talep.telefon || '—',
    email: talep.email || '—',
  }

  const servisTipi = (talep.servisTipi || '').toLowerCase()
  const tipKutu = (key) => (servisTipi.includes(key) ? KUTU_DOLU : KUTU_BOS)
  const yukum = (talep.yukumluluk || '').toLowerCase()
  const yukumKutu = (key) => (yukum.includes(key) ? KUTU_DOLU : KUTU_BOS)
  const yer = (talep.servisYeri || '').toLowerCase()
  const yerKutu = (key) => (yer.includes(key) ? KUTU_DOLU : KUTU_BOS)

  const ariza = talep.aciklama || ''
  const yapilan = talep.cozumAciklamasi || ''
  const urunTanimi = talep.cihazTuru || talep.urunTanimi || '—'
  const seriNo = talep.seriNumarasi || '—'
  const markaModel = [talep.marka, talep.model].filter(Boolean).join(' / ') || '—'
  const kunye = talep.kunyeNumarasi || talep.servisNo || talep.id || '—'

  const yedekParcalar = Array.isArray(talep.yedekParcalar) ? talep.yedekParcalar : []
  const genelToplam = yedekParcalar.reduce((s, p) => s + Number(p.tutar || 0), 0)

  const fotolar = (Array.isArray(talep.dosyalar) ? talep.dosyalar : [])
    .filter((d) => d?.tip === 'image' || /\.(jpe?g|png|webp)(\?|$)/i.test(d?.url || ''))

  // Print-only stiller
  const printCss = `
    @media print {
      body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      @page { size: A4; margin: 6mm; }
    }
    @media screen {
      body { background: #e9eef5; }
    }
  `

  return (
    <>
      <style>{printCss}</style>
      <div style={sayfaStyle}>
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
                <span>{tipKutu('teslimat')} Teslimat</span>
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
            <tr>
              <td style={labelStyle}>Marka / Model</td>
              <td style={valueStyle}>{markaModel}</td>
              <td style={labelStyle}>Künye Numarası</td>
              <td style={valueStyle}>{kunye}</td>
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

        {/* ─── SERVİS KOŞULLARI ─── */}
        <table style={tabloStyle}>
          <tbody>
            <tr><td style={sectionHeader}>SERVİS KOŞULLARI</td></tr>
            <tr>
              <td style={{ ...valueStyle, fontSize: 8, lineHeight: 1.4, color: '#333' }}>
                - Garanti dışı arıza müdahalelerinde, sistemin çalışır durumda teslim edilmesinden sonra gerçekleşen arızaların giderilmesi ayrıca ücretlendirilecektir.<br />
                - Servis Formunda belirtilen değiştirilmesi tespit edilmiş ve kurum yetkilisi tarafından imzalanarak onaylanmış parçaların değiştirilmemesinden kaynaklanan her türlü arızalara müdahale ayrıca ücretlendirilecektir.<br />
                - Servis Formunda belirtilen bilgiler doğrultusunda yapılan tüm işlemler müşteri onayı imzasını takiben geçerlilik kazanır.
              </td>
            </tr>
          </tbody>
        </table>

        {/* ─── İMZA ALANLARI ─── */}
        <table style={tabloStyle}>
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
                  ? <img src={talep.musteriImza} alt="imza" style={{ maxWidth: '100%', maxHeight: 90, objectFit: 'contain', display: 'block', margin: '2px 0' }} />
                  : <div style={{ height: 64 }} />}
                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 4, fontSize: 8, color: ACCENT, fontWeight: 600 }}>
                  ONAY / İMZA
                </div>
              </td>
              <td style={{ ...cellStyle, width: '33.3%', verticalAlign: 'top' }}>
                <div style={{ fontSize: 8, color: ACCENT, fontWeight: 600 }}>Servis İstemini Onaylayan</div>
                <div style={{ fontSize: 8, color: '#666' }}>Kurum/Kuruluş Yetkilisi</div>
                <div style={{ height: 50 }} />
                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 4, fontSize: 8, color: ACCENT, fontWeight: 600 }}>
                  TEKNİK İNCELEME
                </div>
              </td>
              <td style={{ ...cellStyle, width: '33.3%', verticalAlign: 'top' }}>
                <div style={{ fontSize: 8, color: ACCENT, fontWeight: 600 }}>{cfg.firmaAdi.split(' SANAYİ')[0]}</div>
                <div style={{ height: 50 }} />
                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 4, fontSize: 8, color: ACCENT, fontWeight: 600 }}>
                  TEKNİK İNCELEME
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ─── FOOTER ─── */}
        <div style={{ marginTop: 8, fontSize: 8, color: ACCENT, textAlign: 'center', lineHeight: 1.5 }}>
          <div style={{ fontWeight: 700 }}>{cfg.firmaAdi}</div>
          <div>{cfg.adres}</div>
          <div>{cfg.iletisim}</div>
        </div>

        {/* ─── SERVİS FOTOĞRAFLARI (varsa, ayrı sayfa) ─── */}
        {fotolar.length > 0 && (
          <div style={{ pageBreakBefore: 'always', paddingTop: '4mm' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: ACCENT, marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${ACCENT}` }}>
              📷 SERVİS FOTOĞRAFLARI
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {fotolar.map((f, i) => (
                <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden', pageBreakInside: 'avoid' }}>
                  <img src={f.url} alt={f.ad || `Fotoğraf ${i + 1}`} style={{ width: '100%', height: 190, objectFit: 'cover', display: 'block', background: '#f1f5f9' }} />
                  {f.ad && <div style={{ fontSize: 8, color: '#64748b', padding: '3px 6px', borderTop: '1px solid #e2e8f0' }}>{f.ad}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
