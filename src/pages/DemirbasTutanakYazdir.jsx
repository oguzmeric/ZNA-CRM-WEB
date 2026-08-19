// Personel demirbaş teslim tutanağı — A4 çıktı (mig 312).
// Route: /demirbas-tutanak/:no   (no = TTN-2026-0001)
//
// Tutanak ayrı tabloda DEĞİL: aynı teslimdeki demirbas_zimmet satırları aynı
// tutanak_no'yu paylaşır, bu sayfa o numaraya sahip kalemleri toplar.
//
// Görsel dil DemoTutanak.jsx ile birebir aynı (aynı antet, ACCENT rengi,
// 210mm sayfa, Microsoft Sans Serif) — iki belge yan yana konduğunda aynı
// kurumun evrakı gibi durmalı.

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button, EmptyState } from '../components/ui'
import { SkeletonDetay } from '../components/Skeleton'
import { tutanakGetir } from '../services/zimmetService'

const FIRMA = {
  ad: 'ZNA TEKNOLOJİ BİLİŞİM HİZMETLERİ SANAYİ VE TİCARET LİMİTED ŞİRKETİ',
  adres: 'İ.O.S.B. KERESTECİLER SANAYİ SİTESİ 3B BLOK KAT:3 NO:3 BAŞAKŞEHİR/İSTANBUL',
  iletisim: 'İLETİŞİM: (212) 549-9494 · znateknoloji.com',
}

const ACCENT = '#16365D'
const ACCENT_BG = '#DCE6F1'
const BORDER = '#808080'

const KATEGORI_AD = {
  bilgisayar: 'Bilgisayar',
  laptop: 'Dizüstü',
  telefon: 'Telefon',
  alet: 'Alet / Ekipman',
  diger: 'Diğer',
}

const fmtTarih = (t) => (t ? new Date(t).toLocaleDateString('tr-TR') : '')

// İş Kanunu'na atıf yapan standart zimmet metni. Tutanağın hukuki ağırlığı
// buradan gelir; kalem listesi tek başına yükümlülük doğurmaz.
const SART_METNI =
  'İşbu tutanak ile yukarıda nitelikleri belirtilen demirbaş(lar), görevin ifası amacıyla personele ' +
  'zimmetlenerek teslim edilmiştir. Personel; teslim aldığı demirbaşları özenle kullanmayı, iş amacı ' +
  'dışında kullanmamayı, üçüncü kişilere devretmemeyi ve üzerinde izinsiz değişiklik yapmamayı kabul eder. ' +
  'Görevden ayrılması hâlinde demirbaşlar eksiksiz ve çalışır durumda iade edilir. Kasıt, ihmal veya ' +
  'kusurdan kaynaklanan hasar, kayıp ve çalınma hâllerinde doğan zarar, 4857 sayılı İş Kanunu ve genel ' +
  'hükümler çerçevesinde personelden tazmin edilir. Taraflar işbu tutanağı okuyarak imza altına almıştır.'

export default function DemirbasTutanakYazdir() {
  const { no } = useParams()
  const navigate = useNavigate()
  const [veri, setVeri] = useState(null)
  const [hata, setHata] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)

  useEffect(() => {
    let iptal = false
    tutanakGetir(no)
      .then(d => { if (!iptal) setVeri(d) })
      .catch(e => { if (!iptal) setHata(e.message || 'Tutanak yüklenemedi.') })
      .finally(() => { if (!iptal) setYukleniyor(false) })
    return () => { iptal = true }
  }, [no])

  if (yukleniyor) return <SkeletonDetay />

  if (hata || !veri) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyState title="Tutanak bulunamadı" description={hata || `${no} numaralı tutanak yok.`} />
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Button variant="secondary" onClick={() => navigate(-1)}>Geri Dön</Button>
        </div>
      </div>
    )
  }

  const { kalemler, personel, teslimEden, tarih } = veri

  const sayfa = {
    width: '210mm', minHeight: '270mm', margin: '0 auto', padding: '10mm 12mm',
    background: '#fff', color: '#000',
    fontFamily: '"Microsoft Sans Serif", Arial, sans-serif',
    fontSize: 10, lineHeight: 1.45,
  }
  const tablo = { width: '100%', borderCollapse: 'collapse', border: `1px solid ${BORDER}`, marginBottom: 8 }
  const hucre = { border: `1px solid ${BORDER}`, padding: '4px 8px', verticalAlign: 'top' }
  const etiketH = { ...hucre, fontWeight: 700, color: ACCENT, width: 130, background: '#F6F8FB' }
  const baslikH = { ...hucre, fontWeight: 700, color: ACCENT, background: '#F6F8FB', textAlign: 'left' }
  const bolumBaslik = {
    background: ACCENT_BG, color: ACCENT, fontWeight: 800, fontSize: 10.5,
    padding: '5px 8px', border: `1px solid ${BORDER}`, borderBottom: 'none',
    letterSpacing: 0.4, textTransform: 'uppercase',
  }
  const imzaKutu = {
    border: `1px solid ${BORDER}`, height: 96, padding: '6px 10px',
    width: '50%', verticalAlign: 'top',
  }

  return (
    <div style={{ background: '#e5e7eb', minHeight: '100vh', padding: '16px 0' }}>
      <div className="no-print" style={{
        maxWidth: '210mm', margin: '0 auto 12px',
        display: 'flex', justifyContent: 'space-between', gap: 8,
      }}>
        <Button variant="secondary" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => navigate(-1)}>
          Geri
        </Button>
        <Button variant="primary" iconLeft={<Printer size={14} strokeWidth={1.5} />} onClick={() => window.print()}>
          Yazdır
        </Button>
      </div>

      <div style={sayfa}>
        {/* ─── Antet ─── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          borderBottom: `2.5px solid ${ACCENT}`, paddingBottom: 8, marginBottom: 10,
        }}>
          <img src="/logo.jpeg" alt="ZNA" style={{ height: 54, objectFit: 'contain' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 11.5, color: ACCENT }}>{FIRMA.ad}</div>
            <div style={{ fontSize: 8.5, marginTop: 2 }}>{FIRMA.adres}</div>
            <div style={{ fontSize: 8.5 }}>{FIRMA.iletisim}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: ACCENT, whiteSpace: 'nowrap' }}>
              DEMİRBAŞ<br />TESLİM TUTANAĞI
            </div>
          </div>
        </div>

        {/* ─── No + tarih ─── */}
        <table style={tablo}>
          <tbody>
            <tr>
              <td style={etiketH}>TUTANAK NO</td>
              <td style={{ ...hucre, fontWeight: 700 }}>{veri.tutanakNo}</td>
              <td style={etiketH}>TESLİM TARİHİ</td>
              <td style={hucre}>{fmtTarih(tarih)}</td>
            </tr>
          </tbody>
        </table>

        {/* ─── Personel ─── */}
        <div style={bolumBaslik}>Teslim Alan Personel</div>
        <table style={tablo}>
          <tbody>
            <tr>
              <td style={etiketH}>ADI SOYADI</td>
              <td style={hucre}>{personel?.ad || '—'}</td>
              <td style={etiketH}>GÖREVİ</td>
              <td style={hucre}>{personel?.unvan || '—'}</td>
            </tr>
          </tbody>
        </table>

        {/* ─── Kalemler ─── */}
        <div style={bolumBaslik}>Teslim Edilen Demirbaşlar ({kalemler.length} kalem)</div>
        <table style={tablo}>
          <thead>
            <tr>
              <th style={{ ...baslikH, width: 34 }}>#</th>
              <th style={{ ...baslikH, width: 110 }}>DEMİRBAŞ NO</th>
              <th style={{ ...baslikH, width: 90 }}>CİNSİ</th>
              <th style={baslikH}>MARKA / MODEL</th>
              <th style={{ ...baslikH, width: 130 }}>SERİ NO</th>
            </tr>
          </thead>
          <tbody>
            {kalemler.map((k, i) => (
              <tr key={k.id}>
                <td style={{ ...hucre, textAlign: 'center' }}>{i + 1}</td>
                <td style={hucre}>{k.demirbas_no || '—'}</td>
                <td style={hucre}>{KATEGORI_AD[k.kategori] || k.kategori || '—'}</td>
                <td style={hucre}>
                  {[k.marka, k.model].filter(Boolean).join(' ') || k.aciklama || '—'}
                  {k.marka && k.aciklama ? (
                    <div style={{ fontSize: 8.5, color: '#444' }}>{k.aciklama}</div>
                  ) : null}
                  {k.teslim_notu ? (
                    <div style={{ fontSize: 8.5, color: '#444' }}>({k.teslim_notu})</div>
                  ) : null}
                </td>
                <td style={{ ...hucre, fontFamily: 'Consolas, monospace' }}>{k.seri_no || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ─── Şartlar ─── */}
        <div style={bolumBaslik}>Zimmet Şartları</div>
        <div style={{
          border: `1px solid ${BORDER}`, borderTop: 'none',
          padding: '7px 9px', marginBottom: 10, textAlign: 'justify', fontSize: 9.2,
        }}>
          {SART_METNI}
        </div>

        {/* ─── İmzalar ─── */}
        <table style={{ ...tablo, marginTop: 4 }}>
          <tbody>
            <tr>
              <td style={imzaKutu}>
                <div style={{ fontWeight: 700, color: ACCENT, marginBottom: 3 }}>TESLİM EDEN</div>
                <div style={{ fontSize: 9 }}>{teslimEden?.ad || 'ZNA Teknoloji'}</div>
                <div style={{ fontSize: 8.5, color: '#444' }}>{teslimEden?.unvan || ''}</div>
                <div style={{ fontSize: 8.5, marginTop: 26 }}>Tarih / İmza</div>
              </td>
              <td style={imzaKutu}>
                <div style={{ fontWeight: 700, color: ACCENT, marginBottom: 3 }}>TESLİM ALAN</div>
                <div style={{ fontSize: 9 }}>{personel?.ad || ''}</div>
                <div style={{ fontSize: 8.5, color: '#444' }}>{personel?.unvan || ''}</div>
                <div style={{ fontSize: 8.5, marginTop: 26 }}>Tarih / İmza</div>
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ fontSize: 8, color: '#555', textAlign: 'center', marginTop: 6 }}>
          Bu tutanak ZNA Teknoloji CRM sistemi üzerinden oluşturulmuştur. · {veri.tutanakNo}
        </div>
      </div>
    </div>
  )
}
