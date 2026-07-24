// Toplu Bakım çıktısı — BİRLEŞİK RAPOR + kalem başına AYRI BAKIM FORMU
// (spec 23-24-25). Tek yazdır sayfası; bölümler page-break ile ayrılır,
// yazıcıdan "PDF olarak kaydet" ile arşivlenir. Tek müşteri imzası tüm alt
// formlara otomatik uygulanır (spec 21).
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import znaBanner from '../assets/servis-formu/zna-banner.png'
import anadolunetLogo from '../assets/servis-formu/anadolunet-logo.jpeg'

// Servis formu şablonuyla AYNI kurumsal kimlik (ServisFormu.jsx ile hizalı)
const SIRKET_BILGI = {
  zna: {
    bannerSrc: znaBanner, bannerYukseklik: 90, label: 'ZNA Teknoloji',
    firmaAdi: 'ZNA TEKNOLOJİ BİLİŞİM HİZMETLERİ SANAYİ VE TİCARET LİMİTED ŞİRKETİ',
    adres: 'İ.O.S.B. KERESTECİLER SANAYİ SİTESİ 3B BLOK KAT:3 NO:3 BAŞAKŞEHİR/İSTANBUL',
    iletisim: 'İLETİŞİM: (212) 549-9494 · FAX: (212) 671-7454',
    accent: '#16365D', accentBg: '#DCE6F1',
  },
  anadolunet: {
    bannerSrc: anadolunetLogo, bannerYukseklik: 80, label: 'Anadolunet',
    firmaAdi: 'ANADOLUNET DİJİTAL YAPI A.Ş.',
    adres: 'İ.O.S.B. KERESTECİLER SANAYİ SİTESİ 3B BLOK KAT:3 NO:3 BAŞAKŞEHİR/İSTANBUL',
    iletisim: 'İLETİŞİM: (212) 549-9494 · FAX: (212) 671-7454',
    accent: '#1A1A1A', accentBg: '#F0F0F0',
  },
}
import { topluBakimGetir, kalemBilgi, kalemDurumBilgi } from '../services/topluBakimService'
import { kullanicilariGetir } from '../services/kullaniciService'

const fmtTarih = (t) => t ? new Date(String(t).includes('T') ? t : t + 'T00:00:00').toLocaleDateString('tr-TR') : '—'
const fmtTarihSaat = (t) => t ? new Date(t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export default function BakimYazdir() {
  const { id } = useParams()
  const [tb, setTb] = useState(null)
  const [personel, setPersonel] = useState([])
  const [secilen, setSecilen] = useState(null)   // null = birleşik; kalem id = tekil form
  const [pdfUretiliyor, setPdfUretiliyor] = useState(false)
  const [sirket, setSirket] = useState('zna')
  const cfg = SIRKET_BILGI[sirket]
  const sayfaRef = useRef(null)

  // Ekrandaki belgeyi (önizleme = sayfanın kendisi) .pdf dosyası olarak indirir.
  const pdfIndir = async () => {
    setPdfUretiliyor(true)
    try {
      const canvas = await html2canvas(sayfaRef.current, {
        scale: 2, backgroundColor: '#ffffff',
        ignoreElements: (el) => el.classList?.contains('no-print'),
      })
      const pdf = new jsPDF('p', 'mm', 'a4')
      const w = 210
      const h = (canvas.height * w) / canvas.width
      const img = canvas.toDataURL('image/jpeg', 0.92)
      const sayfaH = 297
      let kalan = h, offset = 0, ilk = true
      while (kalan > 0) {
        if (!ilk) pdf.addPage()
        pdf.addImage(img, 'JPEG', 0, -offset, w, h)
        kalan -= sayfaH; offset += sayfaH; ilk = false
      }
      const secilenKalem = secilen !== null ? tb.kalemler.find((x) => x.id === secilen) : null
      pdf.save(`${secilenKalem ? secilenKalem.altNo : tb.tbNo}.pdf`)
    } finally { setPdfUretiliyor(false) }
  }

  useEffect(() => {
    topluBakimGetir(id).then(setTb)
    kullanicilariGetir().then((k) => setPersonel(k || [])).catch(() => {})
  }, [id])

  if (!tb) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Yükleniyor…</div>

  const personelAd = (pid) => personel.find((p) => String(p.id) === String(pid))?.ad || '—'
  const yapilanlar = tb.kalemler.filter((k) => k.sonucMetni || k.durum === 'yapilamadi')

  return (
    <div ref={sayfaRef} style={{ fontFamily: 'Arial, sans-serif', color: '#111', background: '#fff', maxWidth: 800, margin: '0 auto', padding: 24 }}>
      {/* Yazdır butonu — çıktıya girmez */}
      <div className="no-print" style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={pdfIndir} disabled={pdfUretiliyor} style={{ ...btnStil, background: '#16a34a' }}>
          {pdfUretiliyor ? '⏳ Hazırlanıyor…' : '⬇️ PDF İndir'}
        </button>
        <button onClick={() => window.print()} style={btnStil}>🖨 Yazdır</button>
        <button onClick={() => setSecilen(null)} style={{ ...btnStil, background: secilen === null ? '#1E5AA8' : '#94a3b8' }}>Birleşik Rapor</button>
        {yapilanlar.map((k) => (
          <button key={k.id} onClick={() => setSecilen(k.id)} style={{ ...btnStil, background: secilen === k.id ? '#1E5AA8' : '#94a3b8' }}>
            {kalemBilgi(k.kalemTip).isim} Formu
          </button>
        ))}
        <span style={{ borderLeft: '1px solid #cbd5e1', margin: '0 4px' }} />
        {Object.entries(SIRKET_BILGI).map(([id, s]) => (
          <button key={id} onClick={() => setSirket(id)} style={{ ...btnStil, background: sirket === id ? '#0176D3' : '#cbd5e1', color: sirket === id ? '#fff' : '#334155' }}>
            {s.label}
          </button>
        ))}
        <button onClick={() => window.close()} style={{ ...btnStil, background: '#64748b' }}>Kapat</button>
      </div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .sayfa-kes { page-break-before: always; }
          body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4; margin: 8mm; }
        }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 12px; text-align: left; }
        th { background: ${cfg.accentBg}; color: ${cfg.accent}; }
      `}</style>

      {/* ═══ TEKİL BAKIM FORMU (seçilen kalem) ═══ */}
      {secilen !== null && (() => {
        const k = yapilanlar.find((x) => x.id === secilen)
        if (!k) return null
        return (
          <div>
            <Baslik altBaslik={`${kalemBilgi(k.kalemTip).isim.toLocaleUpperCase('tr')} BAKIM FORMU`} tbNo={k.altNo} cfg={cfg} />
            <BilgiTablosu tb={tb} personelAd={personelAd} kalem={k} />
            <h3 style={h3Stil}>Bakım Sonucu</h3>
            <div style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: 12, fontSize: 12.5, lineHeight: 1.65 }}>
              {k.durum === 'yapilamadi'
                ? `Bu sistemin bakımı yapılamamıştır. Sebep: ${k.yapilamadiSebep || '—'}`
                : (k.sonucMetni || '—')}
            </div>
            <CevapOzeti kalem={k} />
            <ImzaBloku tb={tb} personelAd={personelAd} />
            <KurumsalFooter cfg={cfg} />
          </div>
        )
      })()}

      {secilen !== null ? null : (<>
      {/* ═══ BİRLEŞİK TOPLU BAKIM RAPORU (spec 24) ═══ */}
      <Baslik altBaslik="TOPLU BAKIM RAPORU" tbNo={tb.tbNo} cfg={cfg} />
      <BilgiTablosu tb={tb} personelAd={personelAd} />

      <h3 style={h3Stil}>Yapılan Bakım Kalemleri ve Sonuçları</h3>
      <table>
        <thead>
          <tr><th style={{ width: 160 }}>Bakım Kalemi</th><th>Sonuç</th><th style={{ width: 90 }}>Durum</th></tr>
        </thead>
        <tbody>
          {tb.kalemler.map((k) => (
            <tr key={k.id}>
              <td><strong>{kalemBilgi(k.kalemTip).isim}</strong><br /><span style={{ fontSize: 10, color: '#64748b' }}>{k.altNo}</span></td>
              <td>{k.durum === 'yapilamadi' ? `Bakım yapılamadı — ${k.yapilamadiSebep || ''}` : (k.sonucMetni || '—')}</td>
              <td>{kalemDurumBilgi(k.durum).isim}{k.arizaVar ? ' ⚠' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Kalem cevap detayları — ayrı form YOK, tek belge (kullanıcı kararı 24.07) */}
      {yapilanlar.map((k) => (
        <div key={k.id} style={{ marginTop: 8 }}>
          <h3 style={h3Stil}>{kalemBilgi(k.kalemTip).isim} — Detay ({k.altNo})</h3>
          <CevapOzeti kalem={k} />
        </div>
      ))}

      <ImzaBloku tb={tb} personelAd={personelAd} />
      <KurumsalFooter cfg={cfg} />
      </>)}
    </div>
  )
}

const btnStil = {
  padding: '10px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: '#1E5AA8', color: '#fff', fontWeight: 700, fontSize: 14,
}
const h3Stil = { fontSize: 13, margin: '16px 0 6px', borderBottom: '2px solid #334155', paddingBottom: 4, color: '#1f2937' }

// Servis formu şablonuyla aynı antet: şirket bannerı + belge başlık şeridi
function Baslik({ altBaslik, tbNo, cfg }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <img
          src={cfg.bannerSrc}
          alt={cfg.firmaAdi}
          style={{ maxWidth: '100%', height: cfg.bannerYukseklik, objectFit: 'contain' }}
        />
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: cfg.accentBg, border: `1.5px solid ${cfg.accent}`,
        padding: '6px 12px',
      }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: cfg.accent, letterSpacing: 0.5 }}>{altBaslik}</div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: cfg.accent }}>{tbNo}</span>
          <span style={{ fontSize: 10, color: '#64748b', marginLeft: 10 }}>{new Date().toLocaleDateString('tr-TR')}</span>
        </div>
      </div>
    </div>
  )
}

// Kurumsal alt bilgi (servis formu footer'ı ile aynı)
function KurumsalFooter({ cfg }) {
  return (
    <div style={{ marginTop: 10, fontSize: 8.5, color: cfg.accent, textAlign: 'center', lineHeight: 1.5 }}>
      <div style={{ fontWeight: 700 }}>{cfg.firmaAdi}</div>
      <div>{cfg.adres}</div>
      <div>{cfg.iletisim}</div>
    </div>
  )
}

function BilgiTablosu({ tb, personelAd, kalem }) {
  return (
    <table style={{ marginBottom: 4 }}>
      <tbody>
        <tr>
          <th style={{ width: 130 }}>Müşteri</th><td>{tb.musteriFirma || '—'}</td>
          <th style={{ width: 130 }}>Toplu Bakım No</th><td>{tb.tbNo}</td>
        </tr>
        <tr>
          <th>Lokasyon</th><td>{tb.lokasyonAdi || '—'}</td>
          <th>{kalem ? 'Form No' : 'Bakım Dönemi'}</th><td>{kalem ? kalem.altNo : (tb.bakimDonemi || '—')}</td>
        </tr>
        <tr>
          <th>Adres</th><td colSpan={3}>{tb.lokasyonAdres || '—'}</td>
        </tr>
        <tr>
          <th>Bakım Tarihi</th><td>{fmtTarih(tb.planlananTarih)}</td>
          <th>Başlangıç / Bitiş</th>
          <td>{fmtTarihSaat(tb.baslamaTarih)} — {fmtTarihSaat(tb.bitisTarih)}</td>
        </tr>
        <tr>
          <th>Saha Sorumlusu</th><td>{personelAd(tb.olusturanId)}</td>
          <th>Teknik Personel</th>
          <td>{personelAd(tb.teknikPersonelId)}{tb.ekipIds?.length ? ` + ${tb.ekipIds.map(personelAd).join(', ')}` : ''}</td>
        </tr>
      </tbody>
    </table>
  )
}

// Kalem cevaplarının okunur özeti (spec 25: ilgili sistemin bakım cevapları)
function CevapOzeti({ kalem }) {
  const c = kalem.cevaplar || {}
  const satirlar = []
  if (kalem.kalemTip === 'cctv') {
    ;(c.kayitCihazlari || []).forEach((k, i) => {
      const hdd = Object.entries(k.hddler || {}).filter(([, a]) => a > 0).map(([kap, a]) => `${a}×${kap}`).join(', ')
      // Etiket = cihazın kendi adı (yoksa türü); aynı türden birden çoksa numaralandır
      const ayniTur = (c.kayitCihazlari || []).filter((x) => !x.ad && x.tur === k.tur)
      const etiket = k.ad || (ayniTur.length > 1 ? `${k.tur} ${ayniTur.indexOf(k) + 1}` : k.tur)
      satirlar.push([etiket, `${k.ad ? k.tur + ' · ' : ''}${k.kayitGun} gün kayıt${hdd ? ` · HDD: ${hdd}` : ''}`])
    })
    satirlar.push(['Kamera Sayıları', `Toplam ${c.toplamKamera} · Çalışan ${c.calisanKamera} · Arızalı ${c.arizaliKamera}`])
  } else {
    // Tip'e özgü etiketler — jenerik "Adet" yerine (kullanıcı isteği 24.07)
    const adetEtiket = kalem.kalemTip === 'turnike' ? 'Turnike Adedi'
      : kalem.kalemTip === 'ekran_led' ? 'Ekran Adedi' : 'Adet'
    if (c.adet) satirlar.push([adetEtiket, c.adet])
    if (c.marka) satirlar.push(['Marka', c.marka])
    if (c.boyut) satirlar.push(['Ekran Boyutu', c.boyut])
    if (c.sonucDurum) satirlar.push(['Bakım Sonucu', c.sonucDurum === 'sorunsuz' ? 'Sorunsuz' : `Arızalı (${c.arizaliAdet || '?'} adet)`])
  }
  if (!satirlar.length) return null
  return (
    <>
      <h3 style={h3Stil}>Bakım Cevapları</h3>
      <table>
        <tbody>
          {satirlar.map(([e, d], i) => (
            <tr key={i}><th style={{ width: 160 }}>{e}</th><td>{String(d)}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function ImzaBloku({ tb, personelAd }) {
  return (
    <div style={{ display: 'flex', gap: 16, marginTop: 20 }}>
      <div style={imzaKutuStil}>
        <div style={imzaEtiketStil}>MÜŞTERİ YETKİLİSİ</div>
        {tb.musteriImzaUrl
          ? <img src={tb.musteriImzaUrl} alt="Müşteri imzası" style={imzaImgStil} />
          : <div style={{ height: 90 }} />}
        <div style={{ fontSize: 11, fontWeight: 700 }}>{tb.musteriYetkiliAd || '—'}</div>
        <div style={{ fontSize: 10, color: '#64748b' }}>
          {tb.musteriYetkiliGorev || ''}{tb.musteriImzaTarih ? ` · ${fmtTarihSaat(tb.musteriImzaTarih)}` : ''}
        </div>
      </div>
      <div style={imzaKutuStil}>
        <div style={imzaEtiketStil}>TEKNİK PERSONEL</div>
        {tb.personelImzaUrl
          ? <img src={tb.personelImzaUrl} alt="Personel imzası" style={imzaImgStil} />
          : <div style={{ height: 90 }} />}
        <div style={{ fontSize: 11, fontWeight: 700 }}>{personelAd(tb.teknikPersonelId)}</div>
        <div style={{ fontSize: 10, color: '#64748b' }}>
          {tb.personelImzaTarih ? fmtTarihSaat(tb.personelImzaTarih) : ''}
        </div>
      </div>
    </div>
  )
}

const imzaKutuStil = {
  flex: 1, border: '1px solid #cbd5e1', borderRadius: 6, padding: 10,
  textAlign: 'center', minHeight: 150,
  display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
}
// İmza görseli — büyük ve kutuda tam ortalı
const imzaImgStil = {
  maxHeight: 90, maxWidth: '90%', display: 'block', margin: '4px auto', objectFit: 'contain',
}
const imzaEtiketStil = { fontSize: 10, fontWeight: 800, color: '#475569', marginBottom: 6 }
