// Demo cihaz teslim tutanağı — A4 çıktı şablonu (ZNA).
// Hem personel yazdırma sayfası (/demolar/:id/tutanak) hem public paylaşım
// (/p/:token, belge_tipi='demo_tutanak') aynı bileşeni kullanır.
//
// zimmet prop'u camelCase (toCamel) — beklenen şekil:
//   { tutanakNo, verisTarihi, beklenenIadeTarihi, gercekIadeTarihi,
//     verenKullaniciAd, durumNotu, musteriKarari,
//     cihaz: { ad, marka, model, seriNo, kategori, notlar },
//     musteri: { firma, ad, soyad, telefon, email, adres },
//     lokasyonAd }

const FIRMA = {
  ad: 'ZNA TEKNOLOJİ BİLİŞİM HİZMETLERİ SANAYİ VE TİCARET LİMİTED ŞİRKETİ',
  adres: 'İ.O.S.B. KERESTECİLER SANAYİ SİTESİ 3B BLOK KAT:3 NO:3 BAŞAKŞEHİR/İSTANBUL',
  iletisim: 'İLETİŞİM: (212) 549-9494 · znateknoloji.com',
}

const ACCENT = '#16365D'
const ACCENT_BG = '#DCE6F1'
const BORDER = '#808080'

const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : ''

const SART_METNI = 'İşbu tutanak ile yukarıda bilgileri yazılı cihaz, DEMO/DENEME amaçlı olarak teslim edilmiştir. ' +
  'Cihaz, beklenen iade tarihine kadar teslim alan müşterinin sorumluluğundadır; kayıp, çalınma veya kullanıcı ' +
  'hatasından kaynaklanan hasar durumunda cihaz bedeli müşteri tarafından karşılanır. Demo süresi sonunda cihaz ' +
  'çalışır ve eksiksiz şekilde iade edilir ya da satın alma bildirimi yapılır. Süre uzatımı ZNA Teknoloji onayı ile mümkündür.'

export default function DemoTutanak({ zimmet = {} }) {
  const c = zimmet.cihaz || {}
  const m = zimmet.musteri || {}
  const yetkili = `${m.ad ?? ''} ${m.soyad ?? ''}`.trim()

  const sayfa = {
    width: '210mm', minHeight: '270mm', margin: '0 auto', padding: '10mm 12mm',
    background: '#fff', color: '#000',
    fontFamily: '"Microsoft Sans Serif", Arial, sans-serif',
    fontSize: 10, lineHeight: 1.45,
  }
  const tablo = { width: '100%', borderCollapse: 'collapse', border: `1px solid ${BORDER}`, marginBottom: 8 }
  const hucre = { border: `1px solid ${BORDER}`, padding: '4px 8px', verticalAlign: 'top' }
  const etiket = { ...hucre, fontWeight: 700, color: ACCENT, width: 130, background: '#F6F8FB' }
  const bolumBaslik = {
    background: ACCENT_BG, color: ACCENT, fontWeight: 800, fontSize: 10.5,
    padding: '5px 8px', border: `1px solid ${BORDER}`, borderBottom: 'none',
    letterSpacing: 0.4, textTransform: 'uppercase',
  }
  const imzaKutu = {
    border: `1px solid ${BORDER}`, height: 88, padding: '6px 10px',
    width: '50%', verticalAlign: 'top',
  }

  return (
    <div style={sayfa}>
      {/* ─── Başlık ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderBottom: `2.5px solid ${ACCENT}`, paddingBottom: 8, marginBottom: 10 }}>
        <img src="/logo.jpeg" alt="ZNA" style={{ height: 54, objectFit: 'contain' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 11.5, color: ACCENT }}>{FIRMA.ad}</div>
          <div style={{ fontSize: 8.5, marginTop: 2 }}>{FIRMA.adres}</div>
          <div style={{ fontSize: 8.5 }}>{FIRMA.iletisim}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: ACCENT, whiteSpace: 'nowrap' }}>
            DEMO CİHAZ<br />TESLİM TUTANAĞI
          </div>
        </div>
      </div>

      {/* ─── No + tarih ─── */}
      <table style={tablo}>
        <tbody>
          <tr>
            <td style={etiket}>Tutanak No</td>
            <td style={{ ...hucre, fontWeight: 700 }}>{zimmet.tutanakNo || '—'}</td>
            <td style={etiket}>Veriliş Tarihi</td>
            <td style={hucre}>{fmtTarih(zimmet.verisTarihi)}</td>
            <td style={etiket}>Beklenen İade</td>
            <td style={{ ...hucre, fontWeight: 700 }}>{fmtTarih(zimmet.beklenenIadeTarihi)}</td>
          </tr>
        </tbody>
      </table>

      {/* ─── Müşteri ─── */}
      <div style={bolumBaslik}>Teslim Alan (Müşteri)</div>
      <table style={tablo}>
        <tbody>
          <tr>
            <td style={etiket}>Firma</td>
            <td style={hucre} colSpan={3}>{m.firma || yetkili || '—'}</td>
          </tr>
          <tr>
            <td style={etiket}>Yetkili</td>
            <td style={hucre}>{yetkili || '—'}</td>
            <td style={etiket}>Telefon</td>
            <td style={hucre}>{m.telefon || '—'}</td>
          </tr>
          <tr>
            <td style={etiket}>E-posta</td>
            <td style={hucre}>{m.email || '—'}</td>
            <td style={etiket}>Lokasyon</td>
            <td style={hucre}>{zimmet.lokasyonAd || '—'}</td>
          </tr>
          {m.adres && (
            <tr>
              <td style={etiket}>Adres</td>
              <td style={hucre} colSpan={3}>{m.adres}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* ─── Cihaz ─── */}
      <div style={bolumBaslik}>Teslim Edilen Cihaz</div>
      <table style={tablo}>
        <tbody>
          <tr>
            <td style={etiket}>Cihaz</td>
            <td style={{ ...hucre, fontWeight: 700 }}>{c.ad || '—'}</td>
            <td style={etiket}>Marka / Model</td>
            <td style={hucre}>{[c.marka, c.model].filter(Boolean).join(' / ') || '—'}</td>
          </tr>
          <tr>
            <td style={etiket}>Seri No</td>
            <td style={{ ...hucre, fontFamily: 'monospace', fontWeight: 700 }}>{c.seriNo || '—'}</td>
            <td style={etiket}>Kategori</td>
            <td style={hucre}>{c.kategori || '—'}</td>
          </tr>
          <tr>
            <td style={etiket}>Aksesuar / Not</td>
            <td style={hucre} colSpan={3}>{zimmet.durumNotu || c.notlar || '—'}</td>
          </tr>
        </tbody>
      </table>

      {/* ─── Şartlar ─── */}
      <div style={bolumBaslik}>Teslim Şartları</div>
      <div style={{ border: `1px solid ${BORDER}`, padding: '6px 10px', fontSize: 8.8, marginBottom: 10, textAlign: 'justify' }}>
        {SART_METNI}
      </div>

      {/* ─── Teslim imzaları ─── */}
      <table style={{ ...tablo, marginBottom: 12 }}>
        <tbody>
          <tr>
            <td style={imzaKutu}>
              <div style={{ fontWeight: 800, color: ACCENT, fontSize: 9.5, marginBottom: 4 }}>TESLİM EDEN — ZNA TEKNOLOJİ</div>
              <div>Ad Soyad: <strong>{zimmet.verenKullaniciAd || '________________'}</strong></div>
              <div style={{ marginTop: 4 }}>Tarih: {fmtTarih(zimmet.verisTarihi) || '____ / ____ / ______'}</div>
              <div style={{ marginTop: 10 }}>İmza:</div>
            </td>
            <td style={imzaKutu}>
              <div style={{ fontWeight: 800, color: ACCENT, fontSize: 9.5, marginBottom: 4 }}>TESLİM ALAN — MÜŞTERİ</div>
              <div>Ad Soyad: <strong>{yetkili || '________________'}</strong></div>
              <div style={{ marginTop: 4 }}>Tarih: {fmtTarih(zimmet.verisTarihi) || '____ / ____ / ______'}</div>
              <div style={{ marginTop: 10 }}>İmza / Kaşe:</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ─── İade bölümü ─── */}
      <div style={bolumBaslik}>İade Teslim (Cihaz Geri Alındığında Doldurulur)</div>
      <table style={tablo}>
        <tbody>
          <tr>
            <td style={etiket}>İade Tarihi</td>
            <td style={hucre}>{fmtTarih(zimmet.gercekIadeTarihi) || ''}</td>
            <td style={etiket}>Cihaz Durumu</td>
            <td style={hucre}>
              {zimmet.gercekIadeTarihi ? 'Kontrol edildi' : '☐ Sağlam   ☐ Hasarlı (açıklayınız)'}
            </td>
          </tr>
          <tr>
            <td style={etiket}>Müşteri Kararı</td>
            <td style={hucre} colSpan={3}>
              {zimmet.musteriKarari === 'aldi' ? '☒ Satın Alındı   ☐ İade   ☐ Değerlendiriliyor'
                : zimmet.musteriKarari === 'almadi' ? '☐ Satın Alındı   ☒ İade   ☐ Değerlendiriliyor'
                : zimmet.musteriKarari === 'degerlendiriyor' ? '☐ Satın Alındı   ☐ İade   ☒ Değerlendiriliyor'
                : '☐ Satın Alındı   ☐ İade   ☐ Değerlendiriliyor'}
            </td>
          </tr>
          <tr>
            <td style={imzaKutu}>
              <div style={{ fontWeight: 800, color: ACCENT, fontSize: 9.5, marginBottom: 4 }}>İADE EDEN — MÜŞTERİ</div>
              <div>Ad Soyad:</div>
              <div style={{ marginTop: 10 }}>İmza:</div>
            </td>
            <td style={imzaKutu} colSpan={3}>
              <div style={{ fontWeight: 800, color: ACCENT, fontSize: 9.5, marginBottom: 4 }}>TESLİM ALAN — ZNA TEKNOLOJİ</div>
              <div>Ad Soyad:</div>
              <div style={{ marginTop: 10 }}>İmza:</div>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontSize: 8, color: '#555', textAlign: 'center' }}>
        {zimmet.tutanakNo || ''} · Bu belge ZNA CRM üzerinden otomatik oluşturulmuştur — {FIRMA.iletisim}
      </div>
    </div>
  )
}
