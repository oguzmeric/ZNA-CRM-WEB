// Tokenli paylasim linki ile musterinin (anon) goruntuledigi belge sayfasi.
// Route: /p/:token  (App.jsx'te authentication gate'inin ONUNDE)
//
// Akis:
//   1. URL'den token'i al
//   2. paylasim_link_dogrula RPC -> token gecerli mi? (acilma sayisini da artirir)
//   3. belge_tipi'ne gore paylasim_teklif_oku veya paylasim_servis_oku
//   4. Verileri uygun cikti komponenti ile render
//
// Hata durumlari:
//   - Gecersiz/expired token -> "Bu link gecersiz veya suresi dolmus" sayfasi
//   - DB hatasi -> "Belge yuklenemedi, daha sonra tekrar deneyin"

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { toCamel } from '../lib/mapper'
import StandartCikti from './teklifCikti/StandartCikti'
import TrassirCikti  from './teklifCikti/TrassirCikti'
import KarelCikti    from './teklifCikti/KarelCikti'
import ServisFormu   from './servisCikti/ServisFormu'
import DemoTutanak   from './demoCikti/DemoTutanak'
import { bayiBelgeHtml } from '../lib/bayiSozlesmeBelge'
import { ssBelgeGoster } from '../lib/satisSozlesmeMaddeleri'
import { tipCoz } from '../lib/teklifTemplates'

const ciktiMap = {
  standart: StandartCikti,
  trassir:  TrassirCikti,
  karel:    KarelCikti,
}

const ekranMerkez = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#F4F6F8',
  fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,sans-serif',
  color: '#3B4960',
  padding: 20,
}

const kart = {
  maxWidth: 480,
  width: '100%',
  background: '#fff',
  borderRadius: 16,
  padding: '40px 32px',
  boxShadow: '0 4px 14px rgba(15,27,46,0.08)',
  textAlign: 'center',
}

function HataKarti({ baslik, mesaj }) {
  return (
    <div style={ekranMerkez}>
      <div style={kart}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: '#FEE2E2', color: '#DC2626',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, fontWeight: 700, marginBottom: 16,
        }}>!</div>
        <h1 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#0F1B2E' }}>{baslik}</h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: '#6B7A93' }}>{mesaj}</p>
        <div style={{ marginTop: 24, fontSize: 11, color: '#98A3B6' }}>
          © ZNA Teknoloji · <a href="https://znateknoloji.com" style={{ color: '#1E5AA8', textDecoration: 'none' }}>znateknoloji.com</a>
        </div>
      </div>
    </div>
  )
}

export default function PaylasimBelge() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const sablonOverride = searchParams.get('t')   // ornek: 'karel' — link icinde gelir
  const acHemen = searchParams.get('ac') === '1' // mail linki: karti atla, belgeyi direkt ac
  const [durum, setDurum] = useState('yukleniyor') // 'yukleniyor' | 'gecersiz' | 'hata' | 'teklif' | 'servis_raporu' | 'demo_tutanak'
  const [belge, setBelge] = useState(null)
  const [teklifGoster, setTeklifGoster] = useState(acHemen) // teklif: once kart, sonra cikti
  const [teklifYazdir, setTeklifYazdir] = useState(false) // cikti acilinca otomatik yazdir
  const [servisGoster, setServisGoster] = useState(acHemen) // servis raporu: once kart, sonra form
  const [servisYazdir, setServisYazdir] = useState(false)
  const [demoGoster, setDemoGoster] = useState(acHemen) // demo tutanagi: once kart, sonra belge
  const [demoYazdir, setDemoYazdir] = useState(false)

  // Cikti komponentleri A4 (~794px) genisliginde tasarlandi.
  // Telefonda viewport 'width=device-width' ise tablo kolonlari sikisip
  // her harf alta iniyor. Public belge gosterimi suresince viewport'u A4
  // genisligine sabitleyip telefonun otomatik fit-to-width yapmasini sagliyoruz.
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]')
    if (!meta) return
    const eski = meta.getAttribute('content')
    // Teklif A4 ciktisi telefonda fit-to-width olsun diye kuculuyor; servis
    // raporu / yukleniyor / hata sayfalari normal mobil genisliginde gosterilir.
    // A4 fit-to-width yalnizca teklif CIKTISI gosterilirken; kart/diger sayfalar normal
    const a4 = (durum === 'teklif' && teklifGoster) || (durum === 'servis_raporu' && servisGoster) || (durum === 'demo_tutanak' && demoGoster)
    const content = a4
      ? 'width=720, initial-scale=0.55, user-scalable=yes'
      : 'width=device-width, initial-scale=1, user-scalable=yes'
    meta.setAttribute('content', content)
    return () => { if (eski != null) meta.setAttribute('content', eski) }
  }, [durum, teklifGoster, servisGoster, demoGoster])

  useEffect(() => {
    if (!token || token.length < 8) {
      setDurum('gecersiz')
      return
    }
    let iptal = false
    ;(async () => {
      try {
        // 1. Token dogrula + acilma istatistigi guncelle
        const { data: dogrulama, error: dogrulamaErr } = await supabase
          .rpc('paylasim_link_dogrula', { in_token: token })

        if (dogrulamaErr) {
          console.error('[PaylasimBelge] dogrulama:', dogrulamaErr)
          if (!iptal) setDurum('hata')
          return
        }

        // RPC returns table — empty array means invalid token
        const link = Array.isArray(dogrulama) ? dogrulama[0] : dogrulama
        if (!link || !link.belge_tipi) {
          if (!iptal) setDurum('gecersiz')
          return
        }

        // 2. Belge verisini cek
        const rpcAdi = link.belge_tipi === 'teklif' ? 'paylasim_teklif_oku'
          : link.belge_tipi === 'demo_tutanak' ? 'paylasim_demo_tutanak_oku'
          : link.belge_tipi === 'bayi_sozlesme' ? 'paylasim_bayi_sozlesme_oku'
          : link.belge_tipi === 'satis_sozlesme' ? 'paylasim_satis_sozlesme_oku'
          : link.belge_tipi === 'fatura' ? 'paylasim_fatura_oku'
          : 'paylasim_servis_oku'
        const { data: belgeData, error: belgeErr } = await supabase
          .rpc(rpcAdi, { in_token: token })

        if (belgeErr || !belgeData) {
          console.error('[PaylasimBelge] belge:', belgeErr)
          if (!iptal) setDurum('hata')
          return
        }

        if (!iptal) {
          const b = toCamel(belgeData)
          // toCamel shallow — gomulu cihaz objesindeki seri_no'yu elle duzelt
          if (link.belge_tipi === 'demo_tutanak' && b?.cihaz) {
            b.cihaz = { ...b.cihaz, seriNo: b.cihaz.seriNo ?? b.cihaz.seri_no }
          }
          setBelge(b)
          setDurum(link.belge_tipi)
        }
      } catch (e) {
        console.error('[PaylasimBelge] beklenmedik:', e)
        if (!iptal) setDurum('hata')
      }
    })()
    return () => { iptal = true }
  }, [token])

  // PDF'i blob olarak cekip indirmeyi zorla (same-origin /dosya proxy sayesinde
  // calisir). iOS Safari direkt linki onizler; blob + a.download indirmeyi tetikler.
  const indirPdf = async (e) => {
    e?.preventDefault?.()
    const ad = `Servis-Raporu-${belge?.id ?? ''}.pdf`
    try {
      const res = await fetch(belge.servisFormuUrl)
      if (!res.ok) throw new Error('fetch')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = ad
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch {
      // Fallback: attachment header'li URL'e git
      window.location.href = `${belge.servisFormuUrl}${belge.servisFormuUrl.includes('?') ? '&' : '?'}download=${encodeURIComponent(ad)}`
    }
  }

  // Teklif "Indir / Kaydet": cikti acilinca gorseller yuklensin diye bekleyip yazdir
  useEffect(() => {
    const yazdir = (durum === 'teklif' && teklifGoster && teklifYazdir) ||
                   (durum === 'servis_raporu' && servisGoster && servisYazdir) ||
                   (durum === 'demo_tutanak' && demoGoster && demoYazdir)
    if (yazdir) {
      setTeklifYazdir(false); setServisYazdir(false); setDemoYazdir(false)
      const t = setTimeout(() => window.print(), 700)
      return () => clearTimeout(t)
    }
  }, [durum, teklifGoster, teklifYazdir, servisGoster, servisYazdir, demoGoster, demoYazdir])

  if (durum === 'yukleniyor') {
    return (
      <div style={ekranMerkez}>
        <div style={kart}>
          <div style={{
            width: 40, height: 40, margin: '0 auto 16px',
            border: '3px solid #DEE3EC', borderTopColor: '#1E5AA8',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ fontSize: 14, color: '#6B7A93' }}>Belge yükleniyor…</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  if (durum === 'gecersiz') {
    return <HataKarti
      baslik="Link Geçersiz veya Süresi Dolmuş"
      mesaj="Bu paylaşım linki artık geçerli değil. Lütfen ZNA Teknoloji ile iletişime geçin."
    />
  }

  if (durum === 'hata') {
    return <HataKarti
      baslik="Belge Yüklenemedi"
      mesaj="Geçici bir teknik sorun oluştu. Lütfen birkaç dakika sonra tekrar deneyin."
    />
  }

  if (durum === 'bayi_sozlesme') {
    return <BayiSozlesmeGorunum belge={belge} />
  }

  if (durum === 'satis_sozlesme') {
    return <SatisSozlesmeGorunum belge={belge} />
  }

  if (durum === 'teklif') {
    // Oncelik: URL'deki ?t= (gonderim aninda secilen sablon) > teklifin kayitli sablonu.
    // '_pacal' (Proje) varyantini tipCoz ile coz: baseTip komponenti secer, pacal=true
    // birim fiyatlari GIZLER (proje teklifi musteriye birim fiyatsiz gider).
    const rawTip = sablonOverride || belge?.teklifTipi || 'standart'
    const { baseTip, pacal } = tipCoz(rawTip)
    const Cikti = ciktiMap[baseTip] || StandartCikti

    // Once markali kart (servis raporu ile tutarli); "Ac" cikti'yi gosterir
    if (!teklifGoster) {
      const linkBtn = {
        cursor: 'pointer', padding: '12px 24px', borderRadius: 10,
        fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
      }
      return (
        <div style={ekranMerkez}>
          <div style={{ ...kart, maxWidth: 560 }}>
            <img src="/logo.jpeg" alt="ZNA Teknoloji"
              style={{ height: 64, objectFit: 'contain', display: 'block', margin: '0 auto 16px' }} />
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#0F1B2E', letterSpacing: '-0.02em' }}>
              Teklifiniz
            </h1>
            <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: 1.55, color: '#6B7A93' }}>
              {belge.teklifNo ? `${belge.teklifNo} — ` : ''}{belge.tarih ? new Date(belge.tarih).toLocaleDateString('tr-TR') : ''}
            </p>
            <div style={{
              textAlign: 'left', background: '#F4F6F8', border: '1px solid #DEE3EC',
              borderRadius: 12, padding: 16, marginBottom: 20, fontSize: 13, lineHeight: 1.6, color: '#3B4960',
            }}>
              <div><strong>Firma:</strong> {belge.firmaAdi || '—'}</div>
              {belge.konu && <div style={{ marginTop: 4 }}><strong>Konu:</strong> {belge.konu}</div>}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <button onClick={() => setTeklifGoster(true)}
                style={{ ...linkBtn, background: '#1E5AA8', color: '#fff', border: 'none' }}>
                📄 Aç
              </button>
              <button onClick={() => { setTeklifGoster(true); setTeklifYazdir(true) }}
                style={{ ...linkBtn, background: '#fff', color: '#1E5AA8', border: '1.5px solid #1E5AA8' }}>
                ⬇ İndir / Kaydet
              </button>
            </div>
            {/iP(hone|od|ad)/.test(navigator.userAgent) && (
              <div style={{ fontSize: 12, color: '#6B7A93', marginTop: 4, lineHeight: 1.5 }}>
                iPhone'da kaydetmek için yazdırma ekranında: <strong>PDF olarak kaydet</strong>
              </div>
            )}
            <div style={{ marginTop: 24, fontSize: 11, color: '#98A3B6' }}>
              © ZNA Teknoloji · <a href="https://znateknoloji.com" style={{ color: '#1E5AA8', textDecoration: 'none' }}>znateknoloji.com</a>
            </div>
          </div>
        </div>
      )
    }

    return (
      <>
        {/* Yazdir butonu — sag-alt floating, icerige binmez. Baskida gizlenir */}
        <div className="no-print" style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 999,
        }}>
          <button
            onClick={() => window.print()}
            style={{
              background: '#1E5AA8', color: '#fff', border: 'none',
              borderRadius: 999, padding: '14px 24px', fontSize: 15,
              fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 6px 20px rgba(30,90,168,0.35)',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            🖨 Yazdır / PDF
          </button>
        </div>
        <Cikti teklif={belge} pacal={pacal} />
        <MusteriKararPaneli token={token} belge={belge} />
      </>
    )
  }

  // Fatura — kesilen gerçek faturanın PDF'i. İmzalı bağlantı gönderim anında
  // (personel yetkisiyle) üretilip link kaydına yazıldı; burada sadece açılıyor.
  if (durum === 'fatura') {
    const sembol = { TL: '₺', USD: '$', EUR: '€' }[belge.paraBirimi] || '₺'
    const tutar = `${sembol}${(Number(belge.genelToplam) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
    const btn = { cursor: 'pointer', padding: '12px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }
    return (
      <div style={ekranMerkez}>
        <div style={{ ...kart, maxWidth: 560 }}>
          <img src="/logo.jpeg" alt="ZNA Teknoloji"
            style={{ height: 64, objectFit: 'contain', display: 'block', margin: '0 auto 16px' }} />
          <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#0F1B2E', letterSpacing: '-0.02em' }}>
            Faturanız
          </h1>
          <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: 1.55, color: '#6B7A93' }}>
            {belge.faturaNo}{belge.faturaTarihi ? ` — ${new Date(belge.faturaTarihi).toLocaleDateString('tr-TR')}` : ''}
          </p>
          <div style={{
            textAlign: 'left', background: '#F4F6F8', border: '1px solid #DEE3EC',
            borderRadius: 12, padding: 16, marginBottom: 20, fontSize: 13, lineHeight: 1.6, color: '#3B4960',
          }}>
            <div><strong>Firma:</strong> {belge.firmaAdi || '—'}</div>
            {belge.konu && <div style={{ marginTop: 4 }}><strong>Konu:</strong> {belge.konu}</div>}
            <div style={{ marginTop: 4 }}><strong>Tutar:</strong> {tutar}</div>
          </div>
          {belge.pdfUrl ? (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href={belge.pdfUrl} target="_blank" rel="noopener noreferrer"
                style={{ ...btn, background: '#1E5AA8', color: '#fff', border: 'none', textDecoration: 'none', display: 'inline-block' }}>
                📄 Faturayı Aç
              </a>
              <a href={belge.pdfUrl} download={belge.pdfAd || 'fatura.pdf'}
                style={{ ...btn, background: '#fff', color: '#1E5AA8', border: '1.5px solid #1E5AA8', textDecoration: 'none', display: 'inline-block' }}>
                ⬇ İndir / Kaydet
              </a>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#B45309' }}>
              Fatura dosyası bulunamadı. Lütfen bizimle iletişime geçin.
            </div>
          )}
          <div style={{ marginTop: 24, fontSize: 11, color: '#98A3B6' }}>
            © ZNA Teknoloji · <a href="https://znateknoloji.com" style={{ color: '#1E5AA8', textDecoration: 'none' }}>znateknoloji.com</a>
          </div>
        </div>
      </div>
    )
  }

  if (durum === 'servis_raporu') {
    // Once markali kart (teklif ile tutarli); "Ac" servis formunu render eder
    if (!servisGoster) {
      const linkBtn = { cursor: 'pointer', padding: '12px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }
      return (
        <div style={ekranMerkez}>
          <div style={{ ...kart, maxWidth: 560 }}>
            <img src="/logo.jpeg" alt="ZNA Teknoloji"
              style={{ height: 64, objectFit: 'contain', display: 'block', margin: '0 auto 16px' }} />
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#0F1B2E', letterSpacing: '-0.02em' }}>
              Servis Raporunuz
            </h1>
            <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: 1.55, color: '#6B7A93' }}>
              {belge.talepNo || ('Talep #' + belge.id)}
            </p>
            <div style={{
              textAlign: 'left', background: '#F4F6F8', border: '1px solid #DEE3EC',
              borderRadius: 12, padding: 16, marginBottom: 20, fontSize: 13, lineHeight: 1.6, color: '#3B4960',
            }}>
              <div><strong>Firma:</strong> {belge.firmaAdi || belge.musteriAd || '—'}</div>
              {belge.konu && <div style={{ marginTop: 4 }}><strong>Konu:</strong> {belge.konu}</div>}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <button onClick={() => setServisGoster(true)}
                style={{ ...linkBtn, background: '#1E5AA8', color: '#fff', border: 'none' }}>
                📄 Aç
              </button>
              <button onClick={() => { setServisGoster(true); setServisYazdir(true) }}
                style={{ ...linkBtn, background: '#fff', color: '#1E5AA8', border: '1.5px solid #1E5AA8' }}>
                ⬇ İndir / Kaydet
              </button>
            </div>
            {/iP(hone|od|ad)/.test(navigator.userAgent) && (
              <div style={{ fontSize: 12, color: '#6B7A93', marginTop: 4, lineHeight: 1.5 }}>
                iPhone'da kaydetmek için yazdırma ekranında: <strong>PDF olarak kaydet</strong>
              </div>
            )}
            <div style={{ marginTop: 24, fontSize: 11, color: '#98A3B6' }}>
              © ZNA Teknoloji · <a href="https://znateknoloji.com" style={{ color: '#1E5AA8', textDecoration: 'none' }}>znateknoloji.com</a>
            </div>
          </div>
        </div>
      )
    }

    return (
      <>
        <div className="no-print" style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999 }}>
          <button onClick={() => window.print()}
            style={{
              background: '#1E5AA8', color: '#fff', border: 'none', borderRadius: 999,
              padding: '14px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 6px 20px rgba(30,90,168,0.35)', display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
            🖨 Yazdır / PDF
          </button>
        </div>
        <ServisFormu talep={belge} sirket={searchParams.get('s') === 'anadolunet' ? 'anadolunet' : 'zna'} />
      </>
    )
  }

  if (durum === 'demo_tutanak') {
    if (!demoGoster) {
      const linkBtn = { cursor: 'pointer', padding: '12px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }
      return (
        <div style={ekranMerkez}>
          <div style={{ ...kart, maxWidth: 560 }}>
            <img src="/logo.jpeg" alt="ZNA Teknoloji"
              style={{ height: 64, objectFit: 'contain', display: 'block', margin: '0 auto 16px' }} />
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#0F1B2E', letterSpacing: '-0.02em' }}>
              Demo Cihaz Teslim Tutanağı
            </h1>
            <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: 1.55, color: '#6B7A93' }}>
              {belge.tutanakNo || ''}
            </p>
            <div style={{
              textAlign: 'left', background: '#F4F6F8', border: '1px solid #DEE3EC',
              borderRadius: 12, padding: 16, marginBottom: 20, fontSize: 13, lineHeight: 1.6, color: '#3B4960',
            }}>
              <div><strong>Cihaz:</strong> {belge.cihaz?.ad || '—'}</div>
              <div style={{ marginTop: 4 }}><strong>Beklenen İade:</strong> {belge.beklenenIadeTarihi ? new Date(belge.beklenenIadeTarihi).toLocaleDateString('tr-TR') : '—'}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <button onClick={() => setDemoGoster(true)}
                style={{ ...linkBtn, background: '#1E5AA8', color: '#fff', border: 'none' }}>
                📄 Aç
              </button>
              <button onClick={() => { setDemoGoster(true); setDemoYazdir(true) }}
                style={{ ...linkBtn, background: '#fff', color: '#1E5AA8', border: '1.5px solid #1E5AA8' }}>
                ⬇ İndir / Kaydet
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#6B7A93', marginTop: 4, lineHeight: 1.5 }}>
              Tutanağı yazdırıp imzaladıktan sonra teknisyenimize teslim edebilir veya taranmış halini bize iletebilirsiniz.
            </div>
            <div style={{ marginTop: 24, fontSize: 11, color: '#98A3B6' }}>
              © ZNA Teknoloji · <a href="https://znateknoloji.com" style={{ color: '#1E5AA8', textDecoration: 'none' }}>znateknoloji.com</a>
            </div>
          </div>
        </div>
      )
    }

    return (
      <>
        <div className="no-print" style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999 }}>
          <button onClick={() => window.print()}
            style={{
              background: '#1E5AA8', color: '#fff', border: 'none', borderRadius: 999,
              padding: '14px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 6px 20px rgba(30,90,168,0.35)', display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
            🖨 Yazdır / PDF
          </button>
        </div>
        <DemoTutanak zimmet={belge} />
      </>
    )
  }

  return null
}

// Satış sözleşmesi (anon görünüm) — HTML içerik; önce markalı kart, "Aç" belgeyi gösterir
function SatisSozlesmeGorunum({ belge }) {
  const [goster, setGoster] = useState(false)

  if (!goster) {
    const linkBtn = { cursor: 'pointer', padding: '12px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }
    return (
      <div style={ekranMerkez}>
        <div style={{ ...kart, maxWidth: 560 }}>
          <img src="/logo.jpeg" alt="ZNA Teknoloji"
            style={{ height: 64, objectFit: 'contain', display: 'block', margin: '0 auto 16px' }} />
          <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#0F1B2E', letterSpacing: '-0.02em' }}>
            Satış Sözleşmeniz
          </h1>
          <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: 1.55, color: '#6B7A93' }}>
            {belge.sozlesmeNo} — {belge.olusturmaTarih ? new Date(belge.olusturmaTarih).toLocaleDateString('tr-TR') : ''}
          </p>
          <div style={{
            textAlign: 'left', background: '#F4F6F8', border: '1px solid #DEE3EC',
            borderRadius: 12, padding: 16, marginBottom: 20, fontSize: 13, lineHeight: 1.6, color: '#3B4960',
          }}>
            <div><strong>Firma:</strong> {belge.firmaAdi || '—'}</div>
            {belge.projeAdi && <div style={{ marginTop: 4 }}><strong>Proje:</strong> {belge.projeAdi}</div>}
            <div style={{ marginTop: 6 }}>
              Sözleşmeyi görüntüleyip yazdırdıktan sonra kaşeli ve imzalı halini PDF olarak
              satış temsilcinize iletiniz.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <button onClick={() => setGoster(true)}
              style={{ ...linkBtn, background: '#1E5AA8', color: '#fff', border: 'none' }}>
              📄 Sözleşmeyi Aç
            </button>
          </div>
          <div style={{ marginTop: 24, fontSize: 11, color: '#98A3B6' }}>
            © ZNA Teknoloji · <a href="https://znateknoloji.com" style={{ color: '#1E5AA8', textDecoration: 'none' }}>znateknoloji.com</a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <div className="no-print" style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999 }}>
        <button onClick={() => window.print()}
          style={{
            background: '#1E5AA8', color: '#fff', border: 'none', borderRadius: 999,
            padding: '14px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(30,90,168,0.35)', display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
          🖨 Yazdır / PDF
        </button>
      </div>
      <div style={{ maxWidth: 794, margin: '0 auto', padding: '12px 40px 48px' }}>
        {/* İçerik CRM'in kendi ürettiği HTML — güvenli.
            ssBelgeGoster: eski kayıtların yazdırmada bozulan gömülü stilini
            gösterim anında onarır; içeriğe dokunmaz. */}
        <div dangerouslySetInnerHTML={{ __html: ssBelgeGoster(belge.uretilenIcerik) || '<p>Sözleşme içeriği bulunamadı.</p>' }} />
      </div>
    </div>
  )
}

// Bayi sözleşmesi (anon görünüm) — önce markalı kart, "Aç" sözleşme metnini gösterir
function BayiSozlesmeGorunum({ belge }) {
  const [goster, setGoster] = useState(false)

  if (!goster) {
    const linkBtn = { cursor: 'pointer', padding: '12px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }
    return (
      <div style={ekranMerkez}>
        <div style={{ ...kart, maxWidth: 560 }}>
          <img src="/logo.jpeg" alt="ZNA Teknoloji"
            style={{ height: 64, objectFit: 'contain', display: 'block', margin: '0 auto 16px' }} />
          <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#0F1B2E', letterSpacing: '-0.02em' }}>
            Bayilik Sözleşmeniz
          </h1>
          <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: 1.55, color: '#6B7A93' }}>
            {belge.sozlesmeNo} — {belge.sozlesmeTarihi ? new Date(belge.sozlesmeTarihi).toLocaleDateString('tr-TR') : ''}
          </p>
          <div style={{
            textAlign: 'left', background: '#F4F6F8', border: '1px solid #DEE3EC',
            borderRadius: 12, padding: 16, marginBottom: 20, fontSize: 13, lineHeight: 1.6, color: '#3B4960',
          }}>
            <div><strong>Bayi:</strong> {belge.firmaAdi || '—'}</div>
            <div style={{ marginTop: 6 }}>
              Sözleşmeyi görüntüleyip yazdırdıktan sonra kaşeli ve imzalı halini PDF olarak
              satış temsilcinize iletiniz. Talep edilen evraklar: İmza Sirküleri, Vergi Levhası,
              Faaliyet Belgesi (son 6 ay), Ticaret Sicil Gazetesi{belge.vadeTalebi ? ', Son Mizan (vade talebiniz nedeniyle)' : ''}.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <button onClick={() => setGoster(true)}
              style={{ ...linkBtn, background: '#1E5AA8', color: '#fff', border: 'none' }}>
              📄 Sözleşmeyi Aç
            </button>
          </div>
          <div style={{ marginTop: 24, fontSize: 11, color: '#98A3B6' }}>
            © ZNA Teknoloji · <a href="https://znateknoloji.com" style={{ color: '#1E5AA8', textDecoration: 'none' }}>znateknoloji.com</a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <div className="no-print" style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999 }}>
        <button onClick={() => window.print()}
          style={{
            background: '#1E5AA8', color: '#fff', border: 'none', borderRadius: 999,
            padding: '14px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(30,90,168,0.35)', display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
          🖨 Yazdır / PDF
        </button>
      </div>
      <div style={{ maxWidth: 794, margin: '0 auto', padding: '24px 40px 48px' }}>
        {/* İçerik CRM'in kendi ürettiği metinden biçimlendirilir — güvenli */}
        <div dangerouslySetInnerHTML={{
          __html: bayiBelgeHtml(belge.uretilenIcerik, { sozlesmeNo: belge.sozlesmeNo }),
        }} />
      </div>
    </div>
  )
}

// ── Müşteri karar paneli ────────────────────────────────────────────────
// Teklif çıktısının altında; müşteri linki açtığı yerden cevap verebilsin.
// Yetki modeli: linke sahip olan cevap verir (token'ın kendisi yetkidir) + müşteri
// adını yazıp yetkili olduğunu beyan eder. Ad/tarih/IP DB'de link meta'sına yazılır
// (mig 164), sonradan "kim onayladı" sorusu cevaplanabilsin diye.
const KARAR_VERILMIS_DURUMLAR = ['musteri_onayladi', 'musteri_reddetti', 'revizyon_istendi', 'siparise_aktarildi']

const KARAR_SECENEKLERI = [
  { id: 'onayladi', etiket: '✓ Onaylıyorum',        renk: '#0F8A4F', notZorunlu: false },
  { id: 'revizyon', etiket: '✎ Revizyon istiyorum', renk: '#B7791F', notZorunlu: true },
  { id: 'reddetti', etiket: '✕ Reddediyorum',       renk: '#C0392B', notZorunlu: false },
]

function MusteriKararPaneli({ token, belge }) {
  const [karar, setKarar] = useState(null)
  const [ad, setAd] = useState('')
  const [beyan, setBeyan] = useState(false)
  const [not, setNot] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [gonderildi, setGonderildi] = useState(false)
  const [hata, setHata] = useState('')

  const oncedenKararli =
    KARAR_VERILMIS_DURUMLAR.includes(belge?.spekDurum || '') ||
    ['kabul', 'vazgecildi', 'revizyon'].includes(belge?.onayDurumu || '')

  const secili = KARAR_SECENEKLERI.find(k => k.id === karar)

  const gonder = async () => {
    setHata('')
    if (ad.trim().length < 2) { setHata('Lütfen adınızı ve soyadınızı yazın.'); return }
    if (!beyan) { setHata('Devam etmek için yetkili olduğunuzu onaylayın.'); return }
    if (secili?.notZorunlu && !not.trim()) { setHata('Lütfen talebinizi kısaca yazın.'); return }
    setGonderiliyor(true)
    try {
      const { data, error } = await supabase.rpc('paylasim_teklif_musteri_karar', {
        in_token: token, in_karar: karar, in_ad: ad.trim(), in_not: not.trim() || null,
      })
      if (error) throw error
      if (!data?.ok) { setHata(data?.mesaj || 'Cevabınız kaydedilemedi.'); return }
      setGonderildi(true)
    } catch (e) {
      setHata('Bir sorun oluştu, lütfen tekrar deneyin. (' + (e?.message || 'bilinmeyen') + ')')
    } finally {
      setGonderiliyor(false)
    }
  }

  const sarmal = {
    maxWidth: 820, margin: '0 auto 48px', padding: '0 16px',
    fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
  }
  const kutu = {
    background: '#fff', border: '1px solid #DEE3EC', borderRadius: 14,
    padding: 20, boxShadow: '0 2px 12px rgba(15,27,46,0.06)',
  }
  const baslikSt = { margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: '#0F1B2E' }
  const altSt = { margin: '0 0 16px', fontSize: 13, lineHeight: 1.55, color: '#6B7A93' }
  const etiketSt = { display: 'block', fontSize: 12.5, fontWeight: 600, color: '#3B4960', marginBottom: 6 }
  const girdiSt = {
    width: '100%', boxSizing: 'border-box', padding: '11px 12px',
    border: '1px solid #DEE3EC', borderRadius: 8, fontSize: 14,
    fontFamily: 'inherit', color: '#0F1B2E', background: '#fff',
  }

  if (gonderildi) {
    return (
      <div className="no-print" style={sarmal}>
        <div style={{ ...kutu, borderColor: '#9FD8BC', background: '#F1FBF6', textAlign: 'center' }}>
          <div style={{ fontSize: 32, lineHeight: 1 }}>✓</div>
          <h2 style={{ ...baslikSt, marginTop: 10 }}>Cevabınız alındı</h2>
          <p style={{ ...altSt, margin: 0 }}>
            Teşekkür ederiz. Yetkilimiz bilgilendirildi, en kısa sürede sizinle iletişime geçecek.
          </p>
        </div>
      </div>
    )
  }

  if (oncedenKararli) {
    return (
      <div className="no-print" style={sarmal}>
        <div style={{ ...kutu, background: '#F4F6F8', textAlign: 'center' }}>
          <p style={{ ...altSt, margin: 0 }}>
            Bu teklif için cevabınız daha önce alınmıştır. Soru veya değişiklik talebiniz için
            yetkilimizle iletişime geçebilirsiniz.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="no-print" style={sarmal}>
      <div style={kutu}>
        <h2 style={baslikSt}>Teklife cevabınız</h2>
        <p style={altSt}>
          {belge?.teklifNo ? `${belge.teklifNo} numaralı teklif` : 'Teklif'} için kararınızı buradan
          iletebilirsiniz. Cevabınız satış yetkilimize anında bildirilir.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: karar ? 18 : 0 }}>
          {KARAR_SECENEKLERI.map(k => {
            const aktif = karar === k.id
            return (
              <button key={k.id} type="button"
                onClick={() => { setKarar(aktif ? null : k.id); setHata('') }}
                style={{
                  flex: '1 1 180px', padding: '13px 16px', borderRadius: 10,
                  fontSize: 14.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  background: aktif ? k.renk : '#fff',
                  color: aktif ? '#fff' : k.renk,
                  border: `1.5px solid ${k.renk}`,
                  transition: 'background 120ms, color 120ms',
                }}>
                {k.etiket}
              </button>
            )
          })}
        </div>

        {karar && (
          <div style={{ borderTop: '1px solid #EDF0F5', paddingTop: 16, display: 'grid', gap: 12 }}>
            <div>
              <label style={etiketSt}>Adınız ve soyadınız</label>
              <input style={girdiSt} value={ad} onChange={e => setAd(e.target.value)}
                placeholder="Ad Soyad" autoComplete="name" />
            </div>

            <div>
              <label style={etiketSt}>
                {secili?.notZorunlu ? 'Talebiniz' : 'Eklemek istediğiniz not (isteğe bağlı)'}
              </label>
              <textarea style={{ ...girdiSt, minHeight: 74, resize: 'vertical' }}
                value={not} onChange={e => setNot(e.target.value)}
                placeholder={secili?.notZorunlu
                  ? 'Hangi kalemde nasıl bir değişiklik istediğinizi yazın'
                  : 'İsterseniz bir not bırakabilirsiniz'} />
            </div>

            <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" checked={beyan} onChange={e => setBeyan(e.target.checked)}
                style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }} />
              <span style={{ fontSize: 12.5, lineHeight: 1.5, color: '#3B4960' }}>
                Firma adına bu teklife cevap vermeye yetkili olduğumu beyan ederim.
              </span>
            </label>

            {hata && (
              <div style={{
                background: '#FDF0EF', border: '1px solid #F0C4C0', borderRadius: 8,
                padding: '10px 12px', fontSize: 13, color: '#C0392B',
              }}>{hata}</div>
            )}

            <button type="button" onClick={gonder} disabled={gonderiliyor}
              style={{
                padding: '13px 20px', borderRadius: 10, border: 'none',
                background: gonderiliyor ? '#9BB4D4' : (secili?.renk || '#1E5AA8'),
                color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
                cursor: gonderiliyor ? 'default' : 'pointer',
              }}>
              {gonderiliyor ? 'Gönderiliyor…' : 'Cevabımı gönder'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
