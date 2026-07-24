// Toplu Bakım çıktısı — BİRLEŞİK RAPOR + kalem başına AYRI BAKIM FORMU
// (spec 23-24-25). Tek yazdır sayfası; bölümler page-break ile ayrılır,
// yazıcıdan "PDF olarak kaydet" ile arşivlenir. Tek müşteri imzası tüm alt
// formlara otomatik uygulanır (spec 21).
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { topluBakimGetir, kalemBilgi, kalemDurumBilgi } from '../services/topluBakimService'
import { kullanicilariGetir } from '../services/kullaniciService'

const fmtTarih = (t) => t ? new Date(String(t).includes('T') ? t : t + 'T00:00:00').toLocaleDateString('tr-TR') : '—'
const fmtTarihSaat = (t) => t ? new Date(t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export default function BakimYazdir() {
  const { id } = useParams()
  const [tb, setTb] = useState(null)
  const [personel, setPersonel] = useState([])

  useEffect(() => {
    topluBakimGetir(id).then(setTb)
    kullanicilariGetir().then((k) => setPersonel(k || [])).catch(() => {})
  }, [id])

  if (!tb) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Yükleniyor…</div>

  const personelAd = (pid) => personel.find((p) => String(p.id) === String(pid))?.ad || '—'
  const yapilanlar = tb.kalemler.filter((k) => k.sonucMetni || k.durum === 'yapilamadi')

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', color: '#111', background: '#fff', maxWidth: 800, margin: '0 auto', padding: 24 }}>
      {/* Yazdır butonu — çıktıya girmez */}
      <div className="no-print" style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <button onClick={() => window.print()} style={btnStil}>🖨 Yazdır / PDF Kaydet</button>
        <button onClick={() => window.close()} style={{ ...btnStil, background: '#64748b' }}>Kapat</button>
      </div>
      <style>{`
        @media print { .no-print { display: none !important; } .sayfa-kes { page-break-before: always; } }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 12px; text-align: left; }
        th { background: #f1f5f9; }
      `}</style>

      {/* ═══ 1) BİRLEŞİK TOPLU BAKIM RAPORU (spec 24) ═══ */}
      <Baslik altBaslik="TOPLU BAKIM RAPORU (BİRLEŞİK)" tbNo={tb.tbNo} />
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

      <ImzaBloku tb={tb} personelAd={personelAd} />

      {/* ═══ 2) KALEM BAŞINA AYRI FORMLAR (spec 23-25) ═══ */}
      {yapilanlar.map((k) => (
        <div key={k.id} className="sayfa-kes" style={{ paddingTop: 8 }}>
          <Baslik altBaslik={`${kalemBilgi(k.kalemTip).isim.toLocaleUpperCase('tr')} BAKIM FORMU`} tbNo={k.altNo} />
          <BilgiTablosu tb={tb} personelAd={personelAd} kalem={k} />
          <h3 style={h3Stil}>Bakım Sonucu</h3>
          <div style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: 12, fontSize: 12.5, lineHeight: 1.65 }}>
            {k.durum === 'yapilamadi'
              ? `Bu sistemin bakımı yapılamamıştır. Sebep: ${k.yapilamadiSebep || '—'}`
              : (k.sonucMetni || '—')}
          </div>
          <CevapOzeti kalem={k} />
          <ImzaBloku tb={tb} personelAd={personelAd} />
        </div>
      ))}
    </div>
  )
}

const btnStil = {
  padding: '10px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: '#1E5AA8', color: '#fff', fontWeight: 700, fontSize: 14,
}
const h3Stil = { fontSize: 13, margin: '16px 0 6px', borderBottom: '2px solid #1E5AA8', paddingBottom: 4 }

function Baslik({ altBaslik, tbNo }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '3px solid #1E5AA8', paddingBottom: 10, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src="/logo.jpeg" alt="ZNA" style={{ width: 44, height: 44, objectFit: 'contain' }} />
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>ZNA TEKNOLOJİ</div>
          <div style={{ fontSize: 11, color: '#475569' }}>{altBaslik}</div>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: '#1E5AA8' }}>{tbNo}</div>
        <div style={{ fontSize: 10, color: '#64748b' }}>{new Date().toLocaleDateString('tr-TR')}</div>
      </div>
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
      satirlar.push([`Kayıt Cihazı ${i + 1}`, `${k.tur}${k.ad ? ` (${k.ad})` : ''} · ${k.kayitGun} gün kayıt${hdd ? ` · HDD: ${hdd}` : ''}`])
    })
    satirlar.push(['Kamera Sayıları', `Toplam ${c.toplamKamera} · Çalışan ${c.calisanKamera} · Arızalı ${c.arizaliKamera}`])
  } else {
    if (c.adet) satirlar.push(['Adet', c.adet])
    if (c.marka) satirlar.push(['Marka', c.marka])
    if (c.boyut) satirlar.push(['Boyut', c.boyut])
    if (c.sonucDurum) satirlar.push(['Sonuç', c.sonucDurum === 'sorunsuz' ? 'Sorunsuz' : `Arızalı (${c.arizaliAdet || '?'} adet)`])
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
          ? <img src={tb.musteriImzaUrl} alt="Müşteri imzası" style={{ maxHeight: 52, maxWidth: '100%' }} />
          : <div style={{ height: 52 }} />}
        <div style={{ fontSize: 11, fontWeight: 700 }}>{tb.musteriYetkiliAd || '—'}</div>
        <div style={{ fontSize: 10, color: '#64748b' }}>
          {tb.musteriYetkiliGorev || ''}{tb.musteriImzaTarih ? ` · ${fmtTarihSaat(tb.musteriImzaTarih)}` : ''}
        </div>
      </div>
      <div style={imzaKutuStil}>
        <div style={imzaEtiketStil}>TEKNİK PERSONEL</div>
        {tb.personelImzaUrl
          ? <img src={tb.personelImzaUrl} alt="Personel imzası" style={{ maxHeight: 52, maxWidth: '100%' }} />
          : <div style={{ height: 52 }} />}
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
  textAlign: 'center', minHeight: 110,
}
const imzaEtiketStil = { fontSize: 10, fontWeight: 800, color: '#475569', marginBottom: 6 }
