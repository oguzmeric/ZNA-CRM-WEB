// TEKLİF İCMALİ — aynı kurum için hazırlanan birden çok teklifi TEK belgede sunar.
//
// İstek (20.08): bir projede 3-4 ayrı teklif hazırlanıyor (ör. kamera + ses +
// yangın). 1. sayfa İCMAL: her teklifin KDV hariç tutarı alt alta + KDV +
// KDV dahil genel toplam; devam sayfalarında her teklifin kendisi.
//
// TASARIM KARARLARI:
//   • İcmal ANLIK bir çıktıdır — DB'ye kayıt/numara üretmez. Çıktı logu teklif
//     BAŞINA düşer (mig 158, mevcut yazdir/pdf işlemleriyle).
//   • Devam sayfaları TEK TİP standart fiyat düzeniyle basılır (StandartCikti).
//     Karel/Trassir şablonları @page margin'i 0, Standart 15mm — aynı belgede
//     karışamazlar; Trassir'in 5 sayfalık marka sunumu icmali şişirirdi.
//     Paçal tipli teklif paçallığını KORUR (satır fiyatı gizli kalır).
//   • Tutarlar TEK KAYNAKTAN: teklifHesapla (KDV hariç = araToplam − genel
//     iskonto = KDV matrahı; KDV dahil = genelToplam).
//   • Farklı para birimleri TOPLANMAZ — kapakta toplam yerine uyarı basılır;
//     tüm dövizlilerde kur girilmişse "₺ TL Göster" hepsini TL'ye çevirir
//     (TeklifYazdir'daki 13.08 kavramının devamı).
//   • Herhangi bir teklif onaysızsa TÜM belge TASLAK filigranı taşır — kısmen
//     onaylı bir icmal müşteriye gidemez.
//   • Yüklenemeyen teklif SESSİZCE atlanmaz: ekranda no-print şeritte sebep
//     listelenir (sessiz-hata listesi md.1).

import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Printer, FileDown, X, AlertTriangle } from 'lucide-react'
import { teklifGetir } from '../services/teklifService'
import { stokUrunleriniGetir } from '../services/stokService'
import { musteriyeGonderilebilir } from '../lib/teklifDurumlari'
import { useAuth } from '../context/AuthContext'
import { ciktiLogla } from '../services/teklifCiktiLogService'
import StandartCikti from './teklifCikti/StandartCikti'
import { dosyaAdiTemizle } from '../lib/teklifDosyaAdi'
import { tipCoz } from '../lib/teklifTemplates'
import { teklifHesapla, teklifiTlyeCevir, oranMetni, tutarMetni, r2 } from '../lib/teklifHesap'

const PARA_SEMBOL = { TL: '₺', USD: '$', EUR: '€' }
const sembol = (pb) => PARA_SEMBOL[pb] || '₺'

export default function TeklifIcmalYazdir() {
  const { kullanici } = useAuth()
  const [searchParams] = useSearchParams()
  const [teklifler, setTeklifler] = useState(null)   // null = yükleniyor
  const [hatalilar, setHatalilar] = useState([])      // yüklenemeyen id/no listesi
  const [tlGoster, setTlGoster] = useState(false)
  const [pdfYukleniyor, setPdfYukleniyor] = useState(false)
  const bolumRefs = useRef([])                        // [kapak, teklif1, teklif2, …]
  const sonLogRef = useRef(0)

  // ?ids=12,34,56 — SEÇİM SIRASI korunur (kapak tablosu ve sayfa sırası bu sıradadır)
  const ids = useMemo(() => (
    [...new Set(String(searchParams.get('ids') || '').split(','))]
      .map(s => Number(s.trim()))
      .filter(n => Number.isFinite(n) && n > 0)
  ), [searchParams])

  useEffect(() => {
    let iptal = false
    ;(async () => {
      const [urunler, sonuclar] = await Promise.all([
        stokUrunleriniGetir().catch(() => []),
        Promise.all(ids.map(id =>
          teklifGetir(id).then(t => ({ id, teklif: t })).catch(e => ({ id, hata: e?.message })),
        )),
      ])
      if (iptal) return
      // Eski tekliflerin satırlarında marka olmayabiliyor — TeklifYazdir ile aynı enrich
      const urunMap = new Map((urunler || []).map(u => [u.stokKodu, u]))
      const gelenler = []
      const sorunlular = []
      for (const s of sonuclar) {
        if (!s.teklif?.id) { sorunlular.push({ id: s.id, sebep: s.hata || 'teklif bulunamadı' }); continue }
        gelenler.push({
          ...s.teklif,
          satirlar: (s.teklif.satirlar || []).map(sa => ({
            ...sa,
            marka: sa.marka || urunMap.get(sa.stokKodu)?.marka || '',
          })),
        })
      }
      setTeklifler(gelenler)
      setHatalilar(sorunlular)
    })()
    return () => { iptal = true }
  }, [ids])

  // Ctrl+P / tarayıcı menüsünden yazdırma da loglansın (butonu atlayan yol)
  useEffect(() => {
    const f = () => {
      if (!teklifler?.length || Date.now() - sonLogRef.current < 3000) return
      sonLogRef.current = Date.now()
      teklifler.forEach(t =>
        ciktiLogla({ teklif: t, kullanici, islem: 'yazdir', taslak: !musteriyeGonderilebilir(t) }))
    }
    window.addEventListener('beforeprint', f)
    return () => window.removeEventListener('beforeprint', f)
  }, [teklifler, kullanici])

  if (teklifler === null) {
    return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial' }}>Yükleniyor...</div>
  }

  if (teklifler.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial', color: '#475569' }}>
        <p style={{ fontWeight: 700, marginBottom: 8 }}>İcmal için teklif yüklenemedi.</p>
        {hatalilar.map(h => <p key={h.id} style={{ fontSize: 13 }}>#{h.id} — {h.sebep}</p>)}
        <p style={{ fontSize: 13, marginTop: 12 }}>
          Teklifler listesinden <strong>İcmal</strong> düğmesiyle en az bir teklif seçerek tekrar deneyin.
        </p>
      </div>
    )
  }

  // ── Para birimi / TL çevirisi ─────────────────────────────────────────────
  const dovizliler = teklifler.filter(t => t.paraBirimi && t.paraBirimi !== 'TL')
  const tumKurlarVar = dovizliler.every(t => Number(t.dovizKuru) > 0)
  const tlCevrildi = tlGoster && dovizliler.length > 0 && tumKurlarVar
  const gosterilenler = tlCevrildi ? teklifler.map(teklifiTlyeCevir) : teklifler

  const birimler = [...new Set(gosterilenler.map(t => t.paraBirimi || 'TL'))]
  const tekBirim = birimler.length === 1 ? birimler[0] : null

  // ── Hesaplar — tek kaynak teklifHesapla ───────────────────────────────────
  const kalemler = gosterilenler.map(t => {
    const h = teklifHesapla(t)
    return {
      teklif: t,
      pacal: tipCoz(t.teklifTipi).pacal,
      kdvHaric: r2(h.araToplam - h.genelIskontoTutar),   // KDV matrahı (genel iskonto sonrası)
      kdvToplam: h.kdvToplam,
      kdvKirilimi: h.kdvKirilimi,
      kdvDahil: h.genelToplam,
      onaysiz: !musteriyeGonderilebilir(t),
    }
  })

  // Toplamlar yalnız TEK para biriminde anlamlı
  const kdvHaricToplam = tekBirim ? r2(kalemler.reduce((a, k) => a + k.kdvHaric, 0)) : null
  const kdvDahilToplam = tekBirim ? r2(kalemler.reduce((a, k) => a + k.kdvDahil, 0)) : null
  // KDV, oran bazında birleştirilir (%18'li eski tekliflerle %20'liler ayrı satır)
  const kdvOranToplamlari = {}
  if (tekBirim) {
    for (const k of kalemler) {
      for (const [oran, tutar] of Object.entries(k.kdvKirilimi)) {
        kdvOranToplamlari[oran] = r2((kdvOranToplamlari[oran] || 0) + tutar)
      }
    }
  }

  const onaysizVar = kalemler.some(k => k.onaysiz)

  // Müşteri: tüm teklifler aynı firmaya aitse adı basılır; değilse uyarı
  const firmalar = [...new Set(teklifler.map(t => String(t.firmaAdi || '').trim()).filter(Boolean))]
  const tekFirma = firmalar.length === 1 ? firmalar[0] : null

  const bugun = new Date()
  const fmt = tutarMetni
  const ps = tekBirim ? sembol(tekBirim) : ''

  const logla = (islem) => {
    sonLogRef.current = Date.now()
    teklifler.forEach(t =>
      ciktiLogla({ teklif: t, kullanici, islem, taslak: !musteriyeGonderilebilir(t) }))
  }

  const pdfIndir = async () => {
    setPdfYukleniyor(true)
    try {
      const { bolumleriPdfIndir } = await import('../lib/ciktiPdfIndir')
      const ad = `Teklif Icmali - ${dosyaAdiTemizle(tekFirma || teklifler[0]?.firmaAdi) || 'Coklu'}`
      await bolumleriPdfIndir(
        bolumRefs.current.filter(Boolean),
        onaysizVar ? `${ad}-TASLAK.pdf` : `${ad}.pdf`,
      )
    } catch (err) {
      console.error('[İcmal PDF]', err)
      alert('PDF üretilirken hata: ' + (err?.message || 'bilinmeyen'))
    } finally {
      setPdfYukleniyor(false)
    }
  }

  const aksiyonBtn = (bg) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 12px', fontSize: 12.5, fontWeight: 600,
    color: '#fff', background: bg,
    border: 'none', borderRadius: 6, cursor: 'pointer',
  })

  return (
    <>
      <style>{`
        /* StandartCikti'nin stil dili — kapak, teklifler yüklenmese de aynı görünsün */
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; padding-top: 56px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th, td { padding: 8px 10px; font-size: 12px; word-break: break-word; overflow-wrap: anywhere; vertical-align: top; }
        th { background: #f1f5f9; font-weight: 700; text-align: left; }
        .page { max-width: 860px; margin: 0 auto; padding: 32px; }
        .icmal-ayrac { max-width: 860px; margin: 0 auto; border-top: 1px dashed #cbd5e1; }
        @media print {
          @page { size: A4; margin: 15mm 15mm 15mm 15mm; }
          .no-print, .toolbar-yazdir, .icmal-ayrac { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding-top: 0 !important; }
          /* Her teklif bölümü yeni sayfadan başlar — icmalin ana kuralı */
          .icmal-bolum { break-before: page; page-break-before: always; }
          tr, .bedel-serit { break-inside: avoid; page-break-inside: avoid; }
          thead { display: table-header-group; }
        }
        .toolbar-yazdir button:hover:not(:disabled) { filter: brightness(1.08); }
        .toolbar-yazdir button:active:not(:disabled) { transform: translateY(1px); }
      `}</style>

      {/* Üst toolbar — TeklifYazdir ile aynı dil */}
      <div
        className="no-print toolbar-yazdir"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 48,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', gap: 12,
          background: '#fff', borderBottom: '1px solid #e2e8f0',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)', zIndex: 999,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Teklif İcmali
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tekFirma || `${firmalar.length} farklı müşteri`} · {teklifler.length} teklif
          </span>
          {dovizliler.length > 0 && (
            <button
              onClick={() => tumKurlarVar && setTlGoster(v => !v)}
              disabled={!tumKurlarVar}
              title={tumKurlarVar
                ? (tlGoster ? 'Teklifleri kendi para birimlerinde göster' : 'Tüm teklifleri kayıtlı kurlarıyla TL bas')
                : 'Dövizli tekliflerin bazılarında kur girilmemiş — önce teklif kartlarına kuru girin.'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', fontSize: 12.5, fontWeight: 700,
                color: tlGoster ? '#fff' : tumKurlarVar ? '#0f766e' : '#94a3b8',
                background: tlGoster ? '#0f766e' : '#fff',
                border: `1px solid ${tlGoster ? '#0f766e' : tumKurlarVar ? '#0f766e' : '#e2e8f0'}`,
                borderRadius: 6, cursor: tumKurlarVar ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
              }}
            >
              {tlGoster ? 'Döviz Göster' : '₺ TL Göster'}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onaysizVar && (
            <span
              title="Seçilen tekliflerden en az biri yönetici onayı almadı — icmalin tamamına TASLAK filigranı basılır."
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 999,
                background: '#FEF3C7', border: '1px solid #F59E0B', color: '#92400E',
                fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              }}>
              ⚠ ONAYSIZ teklif var — TASLAK filigranlı çıktı
            </span>
          )}
          <button onClick={() => { logla('yazdir'); window.print() }} style={aksiyonBtn('#0176D3')} title="Yazdır / PDF">
            <Printer size={14} strokeWidth={2} /> Yazdır
          </button>
          <button
            onClick={() => { logla('pdf'); pdfIndir() }}
            disabled={pdfYukleniyor}
            style={{ ...aksiyonBtn('#dc2626'), cursor: pdfYukleniyor ? 'wait' : 'pointer', opacity: pdfYukleniyor ? 0.6 : 1 }}
            title="PDF olarak indir"
          >
            <FileDown size={14} strokeWidth={2} /> {pdfYukleniyor ? 'Hazırlanıyor…' : 'PDF'}
          </button>
          <div style={{ width: 1, height: 22, background: '#e2e8f0', margin: '0 2px' }} />
          <button
            onClick={() => window.close()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '7px 10px', fontSize: 12.5, fontWeight: 500,
              color: '#64748b', background: 'transparent',
              border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer',
            }}
            title="Kapat"
          >
            <X size={14} strokeWidth={2} /> Kapat
          </button>
        </div>
      </div>

      {/* Ekran uyarıları — belgeye BASILMAZ */}
      {(hatalilar.length > 0 || !tekFirma) && (
        <div className="no-print" style={{ maxWidth: 860, margin: '0 auto', padding: '12px 32px 0' }}>
          {hatalilar.length > 0 && (
            <div style={uyariStil('#FEE2E2', '#DC2626', '#7F1D1D')}>
              <AlertTriangle size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                {hatalilar.length} teklif yüklenemedi ve icmale DAHİL DEĞİL:{' '}
                {hatalilar.map(h => `#${h.id} (${h.sebep})`).join(', ')}
              </span>
            </div>
          )}
          {!tekFirma && (
            <div style={uyariStil('#FEF3C7', '#F59E0B', '#92400E')}>
              <AlertTriangle size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Seçilen teklifler FARKLI müşterilere ait: {firmalar.join(' · ')}. İcmal genelde tek kurum
                için hazırlanır — seçimi kontrol edin.
              </span>
            </div>
          )}
        </div>
      )}

      <div translate="no" className="notranslate">
        {/* ── SAYFA 1: İCMAL KAPAĞI ── */}
        <div
          ref={el => { bolumRefs.current[0] = el }}
          className="page icmal-kapak"
          style={{ position: 'relative', background: '#fff' }}
        >
          {/* Başlık */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, paddingBottom: 20, borderBottom: '2px solid #0176D3' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <img src="/teklif-assets/zna-logo.jpg" alt="ZNA Teknoloji" style={{ height: 56, objectFit: 'contain', flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Teklif İcmali</p>
                <p style={{ fontSize: 14, color: '#64748b', marginTop: 4, fontWeight: 600 }}>
                  {teklifler.length} teklifin birleşik özeti
                </p>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{tekFirma || teklifler[0]?.firmaAdi || '—'}</p>
              <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{bugun.toLocaleDateString('tr-TR')}</p>
            </div>
          </div>

          {/* İcmal tablosu */}
          <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Kapsanan Teklifler
          </p>
          <table style={{ marginBottom: 20, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <colgroup>
              <col style={{ width: '4%' }} />
              <col style={{ width: '17%' }} />
              <col />
              <col style={{ width: '16%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '16%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>Teklif No</th>
                <th>Konu</th>
                <th style={{ textAlign: 'right' }}>KDV Hariç</th>
                <th style={{ textAlign: 'right' }}>KDV</th>
                <th style={{ textAlign: 'right' }}>KDV Dahil</th>
              </tr>
            </thead>
            <tbody>
              {kalemler.map((k, i) => {
                const pb = sembol(k.teklif.paraBirimi)
                return (
                  <tr key={k.teklif.id}>
                    <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>
                      {k.teklif.teklifNo}{k.teklif.revizyon > 0 ? ` — Rev.${k.teklif.revizyon}` : ''}
                    </td>
                    <td>{k.teklif.konu || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{pb}{fmt(k.kdvHaric)}</td>
                    <td style={{ textAlign: 'right' }}>{pb}{fmt(k.kdvToplam)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{pb}{fmt(k.kdvDahil)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Toplamlar — StandartCikti toplam bloğuyla aynı dil */}
          {tekBirim ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
              <div style={{ width: 300, background: '#f8fafc', borderRadius: 10, padding: '14px 16px' }}>
                <div style={toplamSatirStil()}>
                  <span>KDV Hariç Toplam</span><span>{ps}{fmt(kdvHaricToplam)}</span>
                </div>
                {Object.entries(kdvOranToplamlari)
                  .sort((a, b) => Number(b[0]) - Number(a[0]))
                  .map(([oran, tutar]) => (
                    <div key={oran} style={toplamSatirStil()}>
                      <span>KDV %{oranMetni(oran)}</span><span>{ps}{fmt(tutar)}</span>
                    </div>
                  ))}
                <div style={{ borderTop: '2px solid #0176D3', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: '#0176D3' }}>
                  <span>GENEL TOPLAM (KDV Dahil)</span><span>{ps}{fmt(kdvDahilToplam)}</span>
                </div>
              </div>
            </div>
          ) : (
            /* Karışık para birimi: toplam basılamaz — bu ibare belgeye DE girer,
               eksik toplamlı bir icmal "toplamı unutulmuş" sanılmasın */
            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              border: '1px solid #F59E0B', background: '#FFFBEB', color: '#92400E',
              borderRadius: 8, padding: '10px 14px', marginBottom: 24, fontSize: 12, lineHeight: 1.5,
            }}>
              <AlertTriangle size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                Teklifler farklı para birimlerinde ({birimler.join(', ')}) olduğundan genel toplam
                hesaplanmamıştır. Tutarlar her teklifin kendi para birimindedir.
                {dovizliler.length > 0 && tumKurlarVar ? ' Ekrandaki "₺ TL Göster" düğmesi tüm teklifleri TL\'ye çevirir.' : ''}
              </span>
            </div>
          )}

          <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.6, marginBottom: 20 }}>
            Bu icmal, yukarıda listelenen tekliflerin birleşik özetidir. Her teklifin ürün/hizmet
            detayı sonraki sayfalarda kendi teklif numarasıyla yer almaktadır. Teklifler tek tek de
            geçerli olup birlikte değerlendirilmesi durumunda yukarıdaki genel toplam esas alınır.
          </p>

          {/* Footer + izlenebilirlik damgası (kapak bölümünün içinde — PDF'e de girer) */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <p style={{ fontSize: 10, color: '#94a3b8' }}>Bu icmal bilgisayar ortamında hazırlanmıştır.</p>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#0176D3' }}>
                {kalemler.map(k => k.teklif.teklifNo).filter(Boolean).join(' · ')}
              </p>
            </div>
            <p style={{ fontSize: 8.5, color: '#94a3b8', textAlign: 'center' }}>
              Bu çıktı {kullanici?.ad || '—'} tarafından {bugun.toLocaleDateString('tr-TR')}{' '}
              {bugun.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}'te ZNA CRM
              üzerinden alınmıştır.{onaysizVar ? ' (TASLAK — onaysız teklif içerir)' : ''}
            </p>
            {tlCevrildi && (
              <p style={{ fontSize: 8.5, color: '#94a3b8', textAlign: 'center', marginTop: 2 }}>
                Dövizli teklif tutarları, teklif kartlarındaki kurlar esas alınarak TL'ye çevrilmiştir
                ({dovizliler.map(t => `${t.teklifNo}: 1 ${t.paraBirimi} = ${oranMetni(t.dovizKuru)} TL`).join(' · ')}).
              </p>
            )}
          </div>

          {onaysizVar && <IcmalTaslakFiligran />}
        </div>

        {/* ── SAYFA 2..N: her teklifin kendisi ── */}
        {gosterilenler.map((t, i) => (
          <div key={t.id}>
            <div className="icmal-ayrac no-print" style={{ margin: '24px auto' }} />
            <div
              ref={el => { bolumRefs.current[i + 1] = el }}
              className="icmal-bolum"
              style={{ position: 'relative', background: '#fff' }}
            >
              <StandartCikti teklif={t} pacal={kalemler[i].pacal} />
              {onaysizVar && <IcmalTaslakFiligran />}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

const uyariStil = (bg, kenar, renk) => ({
  display: 'flex', gap: 8, alignItems: 'flex-start',
  background: bg, border: `1px solid ${kenar}`, color: renk,
  borderRadius: 8, padding: '10px 14px', marginBottom: 10,
  fontSize: 12.5, lineHeight: 1.5, fontWeight: 500,
})

const toplamSatirStil = () => ({
  display: 'flex', justifyContent: 'space-between',
  fontSize: 12, marginBottom: 6, color: '#475569',
})

// Bölüm içi TASLAK filigranı — her bölüm PDF'te AYRI yakalandığından filigran
// bölümün İÇİNDE olmalı (TeklifYazdir'daki kök overlay klona girmezdi).
function IcmalTaslakFiligran() {
  return (
    <div aria-hidden style={{
      position: 'absolute', inset: 0, overflow: 'hidden',
      pointerEvents: 'none', zIndex: 40, printColorAdjust: 'exact',
    }}>
      {[14, 48, 82].map(top => (
        <div key={top} style={{
          position: 'absolute', top: `${top}%`, left: '50%',
          transform: 'translateX(-50%) rotate(-24deg)',
          font: '800 46px/1 Arial, sans-serif',
          letterSpacing: '0.06em', whiteSpace: 'nowrap',
          color: 'rgba(148, 163, 184, 0.16)',
          WebkitPrintColorAdjust: 'exact',
        }}>
          TASLAK — ONAYLANMAMIŞ TEKLİF
        </div>
      ))}
    </div>
  )
}
