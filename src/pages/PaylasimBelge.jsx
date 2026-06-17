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
  const [durum, setDurum] = useState('yukleniyor') // 'yukleniyor' | 'gecersiz' | 'hata' | 'teklif' | 'servis_raporu'
  const [belge, setBelge] = useState(null)
  const [teklifGoster, setTeklifGoster] = useState(false) // teklif: once kart, sonra cikti
  const [teklifYazdir, setTeklifYazdir] = useState(false) // cikti acilinca otomatik yazdir
  const [servisGoster, setServisGoster] = useState(false) // servis raporu: once kart, sonra form
  const [servisYazdir, setServisYazdir] = useState(false)

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
    const a4 = (durum === 'teklif' && teklifGoster) || (durum === 'servis_raporu' && servisGoster)
    const content = a4
      ? 'width=720, initial-scale=0.55, user-scalable=yes'
      : 'width=device-width, initial-scale=1, user-scalable=yes'
    meta.setAttribute('content', content)
    return () => { if (eski != null) meta.setAttribute('content', eski) }
  }, [durum, teklifGoster, servisGoster])

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
        const rpcAdi = link.belge_tipi === 'teklif' ? 'paylasim_teklif_oku' : 'paylasim_servis_oku'
        const { data: belgeData, error: belgeErr } = await supabase
          .rpc(rpcAdi, { in_token: token })

        if (belgeErr || !belgeData) {
          console.error('[PaylasimBelge] belge:', belgeErr)
          if (!iptal) setDurum('hata')
          return
        }

        if (!iptal) {
          setBelge(toCamel(belgeData))
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
                   (durum === 'servis_raporu' && servisGoster && servisYazdir)
    if (yazdir) {
      setTeklifYazdir(false); setServisYazdir(false)
      const t = setTimeout(() => window.print(), 700)
      return () => clearTimeout(t)
    }
  }, [durum, teklifGoster, teklifYazdir, servisGoster, servisYazdir])

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

  if (durum === 'teklif') {
    // Oncelik: URL'deki ?t= (gonderim aninda secilen sablon) > teklifin kayitli sablonu
    const tip = (sablonOverride && ciktiMap[sablonOverride]) ? sablonOverride
              : (belge?.teklifTipi || 'standart')
    const Cikti = ciktiMap[tip] || StandartCikti

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
        <Cikti teklif={belge} />
      </>
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
        <ServisFormu talep={belge} sirket="zna" />
      </>
    )
  }

  return null
}
