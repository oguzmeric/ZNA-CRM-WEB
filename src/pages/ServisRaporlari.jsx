import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  Wrench, Download, ChevronLeft, ChevronRight,
  Building2, MapPin, User, Calendar, Hash, FileText, AlertTriangle, CheckCircle2, Printer, RefreshCw,
} from 'lucide-react'
import {
  SearchInput, Card, Badge, CodeBadge, EmptyState, Button, Select, Label, Modal,
} from '../components/ui'
import { SkeletonList } from '../components/Skeleton'
import { servisRaporlariSayfa, servisRaporFiltreSecenekleri } from '../services/servisRaporService'
import ServisFormu from './servisCikti/ServisFormu'

const SAYFA_BOYUTU = 50

// servis_raporlari kaydını ServisFormu'nun beklediği `talep` şekline çevirir.
// Sadece raporda var olan alanlar dolar; yedek parça / imza / foto / checkbox'lar
// bu kaynakta olmadığı için formda boş kalır.
function raporToTalep(r) {
  if (!r) return {}
  const bildiren = (r.bildiren && r.bildiren.trim() && r.bildiren !== '.') ? r.bildiren : ''
  return {
    talepNo: r.fisNo,
    firmaAdi: r.firmaAdi,
    lokasyon: r.lokasyon,
    ilgiliKisi: bildiren,
    konu: r.arizaKodu || '',
    olusturmaTarihi: r.bilTarih,
    tarih: r.gidTarih || r.bilTarih,
    kunyeNumarasi: r.sisNo || '',
    servisNo: r.fisNo,
    aciklama: r.bildirilenAriza || '',        // Arıza Açıklaması
    cozumAciklamasi: r.sonuc || '',       // Yapılan İşlemler
    teslimAlanAd: r.teslimAlan || '',     // esnweb: pdaseri
    musteriImza: r._imzaUrl || null,      // Signed URL — modal butonundan doldurulur
    personelImza: r._personelImza || null, // Teknisyenin kullanicilar.imza kaydı
    teknisyen: r.teknisyen,
    servisTipi: r.servisTipi,
    yukumluluk: r.yukumluluk,
    servisYeri: r.servisYeri,
    varisSaati: r.varisSaati,
    ayrilisSaati: r.ayrilisSaati,
  }
}

const trNormalize = (str = '') =>
  String(str).toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/İ/gi, 'i').replace(/I/g, 'i')

const formatTarih = (iso) => {
  if (!iso) return '—'
  const [y, a, g] = iso.split('-')
  return `${g}.${a}.${y}`
}

const takipTone = (s) => {
  const t = (s || '').toLowerCase()
  if (t.includes('tamam')) return 'aktif'
  if (t.includes('devam')) return 'lead'
  if (t.includes('bekle')) return 'beklemede'
  if (t.includes('iptal')) return 'kayip'
  return 'neutral'
}

export default function ServisRaporlari() {
  const [gorunen, setGorunen] = useState([])         // şu anki sayfada gösterilen rapor satırları
  const [toplam, setToplam] = useState(0)            // filtreye uyan toplam kayıt
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState(null)

  const [arama, setArama] = useState('')
  const [aramaDebounced, setAramaDebounced] = useState('')
  const [firmaFiltre, setFirmaFiltre] = useState('')
  const [teknisyenFiltre, setTeknisyenFiltre] = useState('')
  const [arizaFiltre, setArizaFiltre] = useState('')
  const [takipFiltre, setTakipFiltre] = useState('')
  const [tarihBaslangic, setTarihBaslangic] = useState('')
  const [tarihBitis, setTarihBitis] = useState('')
  const [sayfa, setSayfa] = useState(1)
  const [seciliRapor, setSeciliRapor] = useState(null)
  const [formRapor, setFormRapor] = useState(null)   // form görünümünde gösterilen rapor
  const [formSirket, setFormSirket] = useState('zna') // 'zna' | 'anadolunet'
  const [esnGuncelleniyor, setEsnGuncelleniyor] = useState(false)
  const [yeniCekiliyor, setYeniCekiliyor] = useState(false)

  const yeniKayitlariCek = async () => {
    setYeniCekiliyor(true)
    try {
      const { data, error } = await supabase.functions.invoke('esn-liste-senkron', { body: { limit: 100 } })
      // Supabase JS 4xx/5xx yanıtta error.context.json() gerçek hatayı barındırıyor
      let hata = null, ekstra = ''
      if (error) {
        try {
          const ctx = await error.context?.json()
          hata = ctx?.hata || ctx?.error
          if (ctx?.responseType || ctx?.keys || ctx?.rawPreview) {
            ekstra = '\n\ntür: ' + ctx.responseType + '\nkeys: ' + JSON.stringify(ctx.keys) + '\nresponse: ' + ctx.rawPreview
          }
        } catch {}
        hata = hata || error.message
      } else if (!data?.ok) {
        hata = data?.hata || 'bilinmiyor'
      }
      if (hata) {
        alert('Çekilemedi: ' + hata + ekstra)
        return
      }
      if (data.yeni === 0) {
        alert('Yeni kayıt yok. (Taranan: ' + data.taranan + ')')
      } else {
        // Yeni fişler için arka planda detay senkronu tetikle
        const fisNolar = data.fisNolar || []
        for (const fisNo of fisNolar) {
          supabase.functions.invoke('esn-detay-senkron', { body: { fisno: fisNo } }).catch(() => {})
        }
        alert(`${data.yeni} yeni kayıt eklendi. Detaylar arka planda çekiliyor.`)
        // Listeyi yenile
        setSayfa(1)
      }
    } finally {
      setYeniCekiliyor(false)
    }
  }

  const esnGuncelle = async (rapor) => {
    if (!rapor?.fisNo) return
    setEsnGuncelleniyor(true)
    try {
      const { data, error } = await supabase.functions.invoke('esn-detay-senkron', { body: { fisno: rapor.fisNo } })
      if (error || !data?.ok) {
        alert('Güncellenemedi: ' + (data?.hata ?? error?.message ?? 'bilinmiyor'))
        return
      }
      // Kaydı yeniden çek
      const { data: yeni } = await supabase.from('servis_raporlari').select('*').eq('fis_no', rapor.fisNo).maybeSingle()
      if (yeni) {
        const { toCamel } = await import('../lib/mapper')
        setSeciliRapor(toCamel(yeni))
      }
    } finally {
      setEsnGuncelleniyor(false)
    }
  }

  // Filtre dropdown'ları için unique listeler — bir kez çekilir (sayfa yaşamı boyunca)
  const [firmalar, setFirmalar] = useState([])
  const [teknisyenler, setTeknisyenler] = useState([])
  const [arizaKodlari, setArizaKodlari] = useState([])
  const [takipDurumlari, setTakipDurumlari] = useState([])

  // Arama input için 250ms debounce — her tuş vuruşunda DB sorgusu atmasın
  useEffect(() => {
    const t = setTimeout(() => setAramaDebounced(arama), 250)
    return () => clearTimeout(t)
  }, [arama])

  // Filtre dropdown verisini bir kez çek
  useEffect(() => {
    servisRaporFiltreSecenekleri()
      .then(({ firmalar, teknisyenler, arizaKodlari, takipDurumlari }) => {
        setFirmalar(firmalar); setTeknisyenler(teknisyenler)
        setArizaKodlari(arizaKodlari); setTakipDurumlari(takipDurumlari)
      })
      .catch((e) => console.warn('servisRaporFiltreSecenekleri:', e))
  }, [])

  // Server-side fetch — filtre/arama/sayfa değişince yeniden çek
  useEffect(() => {
    let iptal = false
    setYukleniyor(true)
    setHata(null)
    servisRaporlariSayfa({
      offset: (sayfa - 1) * SAYFA_BOYUTU,
      limit: SAYFA_BOYUTU,
      arama: aramaDebounced,
      firma: firmaFiltre,
      teknisyen: teknisyenFiltre,
      arizaKodu: arizaFiltre,
      takipKodu: takipFiltre,
      tarihBaslangic, tarihBitis,
    })
      .then(({ rows, toplam }) => {
        if (iptal) return
        setGorunen(rows)
        setToplam(toplam)
        setYukleniyor(false)
      })
      .catch((e) => { if (!iptal) { setHata(String(e)); setYukleniyor(false) } })
    return () => { iptal = true }
  }, [sayfa, aramaDebounced, firmaFiltre, teknisyenFiltre, arizaFiltre, takipFiltre, tarihBaslangic, tarihBitis])

  const toplamSayfa = Math.max(1, Math.ceil(toplam / SAYFA_BOYUTU))

  useEffect(() => { setSayfa(1) }, [arama, firmaFiltre, teknisyenFiltre, arizaFiltre, takipFiltre, tarihBaslangic, tarihBitis])

  const temizle = () => {
    setArama(''); setFirmaFiltre(''); setTeknisyenFiltre(''); setArizaFiltre(''); setTakipFiltre('')
    setTarihBaslangic(''); setTarihBitis('')
  }

  const listePdfYazdir = async () => {
    // PDF'e tüm filtreye uyan kayıtları yaz — sayfada görünen 50 değil.
    // Server'dan büyük limit ile çek (max 10k cap)
    const { rows: filtreli } = await servisRaporlariSayfa({
      offset: 0, limit: 10000,
      arama: aramaDebounced,
      firma: firmaFiltre, teknisyen: teknisyenFiltre,
      arizaKodu: arizaFiltre, takipKodu: takipFiltre,
      tarihBaslangic, tarihBitis,
    })
    const esc = (s) => String(s ?? '—').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))
    const filtreOzet = []
    if (tarihBaslangic && tarihBitis) filtreOzet.push(`Tarih: ${formatTarih(tarihBaslangic)} – ${formatTarih(tarihBitis)}`)
    else if (tarihBaslangic) filtreOzet.push(`Tarih: ${formatTarih(tarihBaslangic)}'dan itibaren`)
    else if (tarihBitis) filtreOzet.push(`Tarih: ${formatTarih(tarihBitis)}'a kadar`)
    if (firmaFiltre) filtreOzet.push(`Müşteri Adı: ${firmaFiltre}`)
    if (teknisyenFiltre) filtreOzet.push(`Teknisyen: ${teknisyenFiltre}`)
    if (arizaFiltre) filtreOzet.push(`Arıza: ${arizaFiltre}`)
    if (takipFiltre) filtreOzet.push(`Takip: ${takipFiltre}`)
    if (arama) filtreOzet.push(`Arama: "${arama}"`)

    const satirlar = filtreli.map(r => `
      <tr>
        <td class="mono">${esc(r.fisNo)}</td>
        <td>${esc(formatTarih(r.gidTarih))}</td>
        <td><span class="badge ${takipTone(r.takipKodu)}">${esc(r.takipKodu || '—')}</span></td>
        <td>${esc(r.firmaAdi)}</td>
        <td>${esc(r.lokasyon)}</td>
        <td>${esc(r.sisNo)}</td>
        <td>${esc(r.teknisyen)}</td>
        <td class="sonuc">${esc(r.sonuc)}</td>
      </tr>`).join('')

    const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8" />
<title>Servis Raporları Listesi</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; font: 11px/1.45 -apple-system, "Segoe UI", Arial, sans-serif; color: #0F1C2E; }
  .header { padding-bottom: 12px; border-bottom: 2px solid #1E5AA8; margin-bottom: 16px; }
  .header h1 { margin: 0 0 4px; font-size: 20px; color: #1E5AA8; }
  .header .meta { font-size: 11px; color: #4A5A6E; }
  .filtreler { background: #F4F6F8; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 11px; color: #4A5A6E; }
  .filtreler strong { color: #0F1C2E; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  thead th { background: #EDF0F3; padding: 6px 8px; text-align: left; font-weight: 600; color: #4A5A6E; text-transform: uppercase; font-size: 9px; letter-spacing: .04em; border-bottom: 1px solid #D9DFE5; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #EDF0F3; vertical-align: top; }
  tbody tr:nth-child(even) { background: #FAFBFC; }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #1E5AA8; font-weight: 600; }
  .sonuc { max-width: 240px; }
  .badge { padding: 2px 8px; border-radius: 999px; font-size: 9px; font-weight: 600; background: #EDF0F3; color: #4A5A6E; white-space: nowrap; }
  .badge.aktif { background: #DCF1E2; color: #2F7D4F; }
  .badge.lead { background: #E8EFF8; color: #2B6A9E; }
  .badge.beklemede { background: #FBEFD8; color: #B77516; }
  .badge.kayip { background: #F8DEDE; color: #B23A3A; }
  .footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #D9DFE5; font-size: 9px; color: #8393A6; text-align: center; }
  @page { size: A4 landscape; margin: 12mm; }
  @media print {
    body { padding: 0; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>Servis Raporları Listesi</h1>
    <div class="meta">
      Toplam <strong>${filtreli.length.toLocaleString('tr-TR')}</strong> kayıt ·
      Oluşturma: ${new Date().toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
    </div>
  </div>

  ${filtreOzet.length > 0 ? `<div class="filtreler"><strong>Uygulanan filtreler:</strong> ${filtreOzet.map(esc).join(' · ')}</div>` : ''}

  <table>
    <thead>
      <tr>
        <th>Fiş No</th>
        <th>Tarih</th>
        <th>Takip</th>
        <th>Müşteri Adı</th>
        <th>Lokasyon</th>
        <th>Sistem</th>
        <th>Teknisyen</th>
        <th>Sonuç</th>
      </tr>
    </thead>
    <tbody>
      ${satirlar || '<tr><td colspan="8" style="text-align:center; padding: 32px; color: #8393A6;">Kayıt yok</td></tr>'}
    </tbody>
  </table>

  <div class="footer">
    ZNA Teknoloji · Servis Raporları · ${filtreli.length.toLocaleString('tr-TR')} kayıt
  </div>

  <script>window.onload = () => { window.print(); }</script>
</body></html>`

    const w = window.open('', '_blank', 'width=1200,height=800')
    if (!w) {
      alert('Pop-up engellendi. Tarayıcınızın pop-up engelleyicisine bu sayfa için izin verin.')
      return
    }
    w.document.write(html)
    w.document.close()
  }

  const raporPdfYazdir = (r) => {
    if (!r) return
    const esc = (s) => String(s ?? '—').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))
    const satir = (etiket, deger) => `
      <tr>
        <td class="lbl">${esc(etiket)}</td>
        <td class="val">${esc(deger)}</td>
      </tr>`
    const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8" />
<title>Servis Raporu ${esc(r.fisNo)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; font: 13px/1.5 -apple-system, "Segoe UI", Arial, sans-serif; color: #0F1C2E; }
  h1 { font-size: 22px; margin: 0 0 4px; color: #1E5AA8; }
  .meta { color: #4A5A6E; font-size: 12px; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 2px solid #1E5AA8; }
  .badges { display: flex; gap: 6px; margin: 12px 0 0; flex-wrap: wrap; }
  .badge { padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; background: #EDF0F3; color: #4A5A6E; }
  .badge.code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; background: #E8EFF8; color: #1E5AA8; }
  .badge.aktif { background: #DCF1E2; color: #2F7D4F; }
  .badge.lead { background: #E8EFF8; color: #2B6A9E; }
  .badge.beklemede { background: #FBEFD8; color: #B77516; }
  .badge.kayip { background: #F8DEDE; color: #B23A3A; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  td { padding: 8px 0; vertical-align: top; }
  td.lbl { width: 160px; color: #8393A6; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
  td.val { color: #0F1C2E; }
  .sonuc { margin-top: 16px; padding: 12px 14px; background: #DCF1E2; border-radius: 6px; }
  .sonuc h3 { margin: 0 0 6px; color: #2F7D4F; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  .sonuc p { margin: 0; white-space: pre-wrap; font-size: 13px; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #D9DFE5; font-size: 10px; color: #8393A6; text-align: center; }
  @media print {
    body { padding: 16px; }
    .noprint { display: none !important; }
  }
</style>
</head>
<body>
  <h1>Servis Raporu</h1>
  <div class="meta">
    Fiş No: <strong>${esc(r.fisNo)}</strong> · Tarih: ${esc(formatTarih(r.gidTarih))}
    <div class="badges">
      ${r.takipKodu ? `<span class="badge ${takipTone(r.takipKodu)}">${esc(r.takipKodu)}</span>` : ''}
      ${r.arizaKodu ? `<span class="badge">${esc(r.arizaKodu)}</span>` : ''}
      ${r.chKodu ? `<span class="badge code">CH ${esc(r.chKodu)}</span>` : ''}
      ${r.sisNo ? `<span class="badge">${esc(r.sisNo)}</span>` : ''}
    </div>
  </div>

  <table>
    ${satir('Müşteri Adı', r.firmaAdi)}
    ${r.lokasyon ? satir('Lokasyon', r.lokasyon) : ''}
    ${satir('Teknisyen', r.teknisyen)}
    ${satir('Bildirim Tarihi', formatTarih(r.bilTarih))}
    ${satir('Gidiş Tarihi', formatTarih(r.gidTarih))}
    ${(r.bildiren && r.bildiren.trim() && r.bildiren !== '.') ? satir('Bildiren', r.bildiren) : ''}
    ${r.bildirilenAriza ? satir('Bildirilen Sorun', r.bildirilenAriza) : ''}
  </table>

  ${r.sonuc ? `<div class="sonuc"><h3>✓ Sonuç</h3><p>${esc(r.sonuc)}</p></div>` : ''}

  <div class="footer">
    ZNA Teknoloji · Servis Raporu · ${new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}
  </div>

  <script>window.onload = () => { window.print(); }</script>
</body></html>`

    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) {
      alert('Pop-up engellendi. Tarayıcınızın pop-up engelleyicisine bu sayfa için izin verin.')
      return
    }
    w.document.write(html)
    w.document.close()
  }

  if (yukleniyor) {
    return <SkeletonList satirSayisi={10} />
  }

  if (hata) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyState
          icon={<Wrench size={32} strokeWidth={1.5} />}
          title="Veri yüklenemedi"
          description={hata}
        />
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Header — kompakt tek satır */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 className="t-h2" style={{ margin: 0 }}>Servis Raporları</h1>
          <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
            <span className="tabular-nums">{toplam.toLocaleString('tr-TR')}</span> kayıt
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<RefreshCw size={13} strokeWidth={1.5} className={yeniCekiliyor ? 'sk-dondur' : ''} />}
            onClick={yeniKayitlariCek}
            disabled={yeniCekiliyor}
            title="esnweb'den son 100 fişi kontrol edip DB'de olmayanları ekler"
          >
            {yeniCekiliyor ? 'Çekiliyor…' : 'Yeni Kayıtları Çek'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Printer size={13} strokeWidth={1.5} />}
            onClick={listePdfYazdir}
            disabled={toplam === 0}
          >
            Liste PDF ({toplam.toLocaleString('tr-TR')})
          </Button>
        </div>
      </div>

      {/* Filters — kompakt tek şerit */}
      <Card style={{ marginBottom: 12, padding: 10 }}>
        {(() => {
          const inpStil = {
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-default)',
            background: 'var(--surface-card)',
            color: 'var(--text-primary)',
            font: '400 12px/16px var(--font-sans)',
            outline: 'none',
            height: 30,
            width: '100%',
          }
          const labStil = { font: '500 10px/12px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2, display: 'block' }
          return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 8 }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labStil}>Arama</label>
            <SearchInput
              value={arama}
              onChange={e => setArama(e.target.value)}
              placeholder="Fiş, firma, lokasyon, sonuç, teknisyen…"
            />
          </div>
          <div>
            <label style={labStil}>Müşteri Adı</label>
            <Select value={firmaFiltre} onChange={e => setFirmaFiltre(e.target.value)}>
              <option value="">Tümü</option>
              {firmalar.map(f => <option key={f} value={f}>{f}</option>)}
            </Select>
          </div>
          <div>
            <label style={labStil}>Teknisyen</label>
            <Select value={teknisyenFiltre} onChange={e => setTeknisyenFiltre(e.target.value)}>
              <option value="">Tümü</option>
              {teknisyenler.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <div>
            <label style={labStil}>Arıza kodu</label>
            <Select value={arizaFiltre} onChange={e => setArizaFiltre(e.target.value)}>
              <option value="">Tümü</option>
              {arizaKodlari.map(a => <option key={a} value={a}>{a}</option>)}
            </Select>
          </div>
          <div>
            <label style={labStil}>Takip durumu</label>
            <Select value={takipFiltre} onChange={e => setTakipFiltre(e.target.value)}>
              <option value="">Tümü</option>
              {takipDurumlari.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <div>
            <label style={labStil}>Tarih başlangıç</label>
            <input
              type="date"
              value={tarihBaslangic}
              onChange={e => setTarihBaslangic(e.target.value)}
              max={tarihBitis || undefined}
              style={inpStil}
            />
          </div>
          <div>
            <label style={labStil}>Tarih bitiş</label>
            <input
              type="date"
              value={tarihBitis}
              onChange={e => setTarihBitis(e.target.value)}
              min={tarihBaslangic || undefined}
              style={inpStil}
            />
          </div>
        </div>
          )
        })()}

        {/* Hızlı tarih kısayolları */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[
            { label: 'Bugün', gun: 0 },
            { label: 'Son 7 gün', gun: 7 },
            { label: 'Son 30 gün', gun: 30 },
            { label: 'Son 90 gün', gun: 90 },
            { label: 'Bu yıl', gun: -1 },
          ].map(opt => (
            <button
              key={opt.label}
              type="button"
              onClick={() => {
                const bugun = new Date()
                const bitis = bugun.toISOString().slice(0, 10)
                if (opt.gun === -1) {
                  setTarihBaslangic(`${bugun.getFullYear()}-01-01`)
                } else {
                  const baslangic = new Date(bugun)
                  baslangic.setDate(baslangic.getDate() - opt.gun)
                  setTarihBaslangic(baslangic.toISOString().slice(0, 10))
                }
                setTarihBitis(bitis)
              }}
              style={{
                padding: '3px 10px',
                font: '500 11px/14px var(--font-sans)',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--border-default)',
                background: 'var(--surface-card)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-primary)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {(arama || firmaFiltre || teknisyenFiltre || arizaFiltre || takipFiltre || tarihBaslangic || tarihBitis) && (
          <div style={{ marginTop: 8 }}>
            <Button variant="tertiary" size="sm" onClick={temizle}>Filtreleri temizle</Button>
          </div>
        )}
      </Card>

      {/* Table */}
      <Card padding={0} style={{ overflow: 'hidden' }}>
        {gorunen.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              title="Filtreye uyan kayıt yok"
              description="Arama veya filtre kriterlerini daraltmayı deneyin."
            />
          </div>
        ) : (
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr>
                  {['Fiş No', 'Takip', 'Müşteri Adı', 'Lokasyon', 'Arıza', 'Sis.No', 'Teknisyen', 'Gid. Tarih', 'Sonuç'].map((h, i) => (
                    <th key={i} style={{
                      background: 'var(--surface-sunken)',
                      padding: '10px 12px',
                      textAlign: 'left',
                      font: '600 11px/16px var(--font-sans)',
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      borderBottom: '1px solid var(--border-default)',
                      whiteSpace: 'nowrap',
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gorunen.map(r => (
                  <tr key={r.i} style={{ transition: 'background 120ms', cursor: 'pointer' }}
                    onClick={() => setSeciliRapor(r)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '10px 12px', font: '400 13px/18px var(--font-sans)', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                      <CodeBadge>{r.fisNo}</CodeBadge>
                    </td>
                    <td style={{ padding: '10px 12px', font: '400 13px/18px var(--font-sans)', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                      {r.takipKodu && <Badge tone={takipTone(r.takipKodu)}>{r.takipKodu}</Badge>}
                    </td>
                    <td style={{ padding: '10px 12px', font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)' }}>
                      {r.firmaAdi}
                    </td>
                    <td style={{ padding: '10px 12px', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)' }}>
                      {r.lokasyon || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                      {r.arizaKodu || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                      {r.sisNo || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                      {r.teknisyen}
                    </td>
                    <td style={{ padding: '10px 12px', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                      {formatTarih(r.gidTarih)}
                    </td>
                    <td style={{ padding: '10px 12px', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)', maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.sonuc}>
                      {r.sonuc || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {toplam > SAYFA_BOYUTU && (() => {
          const baslangic = (sayfa - 1) * SAYFA_BOYUTU
          return (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px',
            borderTop: '1px solid var(--border-default)',
            background: 'var(--surface-card)',
          }}>
            <span className="t-caption">
              {baslangic + 1}–{Math.min(baslangic + SAYFA_BOYUTU, toplam)} / {toplam.toLocaleString('tr-TR')}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button
                variant="secondary"
                size="sm"
                disabled={sayfa <= 1}
                onClick={() => setSayfa(s => Math.max(1, s - 1))}
                iconLeft={<ChevronLeft size={14} strokeWidth={1.5} />}
              >
                Önceki
              </Button>
              <span className="t-caption tabular-nums" style={{ minWidth: 80, textAlign: 'center' }}>
                Sayfa {sayfa} / {toplamSayfa}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={sayfa >= toplamSayfa}
                onClick={() => setSayfa(s => Math.min(toplamSayfa, s + 1))}
                iconRight={<ChevronRight size={14} strokeWidth={1.5} />}
              >
                Sonraki
              </Button>
            </div>
          </div>
          )
        })()}
      </Card>

      {/* Detay modali — satıra tıklanınca açılır */}
      <Modal
        open={!!seciliRapor}
        onClose={() => setSeciliRapor(null)}
        title={seciliRapor ? `Servis Raporu · ${seciliRapor.fisNo}` : ''}
        width={760}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSeciliRapor(null)}>Kapat</Button>
            <Button
              variant="secondary"
              iconLeft={<RefreshCw size={14} strokeWidth={1.5} className={esnGuncelleniyor ? 'sk-dondur' : ''} />}
              onClick={() => esnGuncelle(seciliRapor)}
              disabled={esnGuncelleniyor}
              title="esnweb.com'dan bu fişi yeniden çek"
            >
              {esnGuncelleniyor ? 'Güncelleniyor…' : 'esnweb güncelle'}
            </Button>
            <Button
              variant="secondary"
              iconLeft={<FileText size={14} strokeWidth={1.5} />}
              onClick={async () => {
                let rapor = seciliRapor
                if (rapor?.imzaUrl) {
                  const { data } = await supabase.storage.from('imzalar').createSignedUrl(rapor.imzaUrl, 3600)
                  if (data?.signedUrl) rapor = { ...rapor, _imzaUrl: data.signedUrl }
                }
                if (rapor?.teknisyen) {
                  // TR: PostgreSQL ilike İ↔i eşleştiremiyor + esnweb bazen orta ismi düşürüyor (MUHAMMET NAYMAN vs Muhammet Emin Nayman)
                  const { data: kullanicilar } = await supabase
                    .from('kullanicilar')
                    .select('ad, imza')
                    .not('imza', 'is', null)
                  const hedefTokens = trNormalize(rapor.teknisyen).split(/\s+/).filter(Boolean)
                  const bulunan = (kullanicilar || []).find(k => {
                    const adTokens = trNormalize(k.ad || '').split(/\s+/).filter(Boolean)
                    return hedefTokens.length > 0 && hedefTokens.every(t => adTokens.includes(t))
                  })
                  if (bulunan?.imza) rapor = { ...rapor, _personelImza: bulunan.imza }
                }
                setFormRapor(rapor); setSeciliRapor(null)
              }}
            >
              Servis Formu
            </Button>
            <Button
              variant="primary"
              iconLeft={<Printer size={14} strokeWidth={1.5} />}
              onClick={() => raporPdfYazdir(seciliRapor)}
            >
              PDF / Yazdır
            </Button>
          </>
        }
      >
        {seciliRapor && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Üst bilgi — meta */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
              paddingBottom: 12,
              borderBottom: '1px solid var(--border-default)',
            }}>
              <CodeBadge>{seciliRapor.fisNo}</CodeBadge>
              {seciliRapor.takipKodu && <Badge tone={takipTone(seciliRapor.takipKodu)}>{seciliRapor.takipKodu}</Badge>}
              {seciliRapor.arizaKodu && <Badge tone="neutral">{seciliRapor.arizaKodu}</Badge>}
              {seciliRapor.chKodu && (
                <span className="t-caption">
                  CH: <span className="t-mono" style={{ color: 'var(--text-secondary)' }}>{seciliRapor.chKodu}</span>
                </span>
              )}
            </div>

            {/* Firma + lokasyon */}
            <DetayAlan
              icon={<Building2 size={14} strokeWidth={1.5} />}
              baslik="Müşteri Adı"
              icerik={seciliRapor.firmaAdi}
            />
            {seciliRapor.lokasyon && (
              <DetayAlan
                icon={<MapPin size={14} strokeWidth={1.5} />}
                baslik="Lokasyon"
                icerik={seciliRapor.lokasyon}
              />
            )}

            {/* Sistem / arıza */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {seciliRapor.sisNo && (
                <DetayAlan
                  icon={<Hash size={14} strokeWidth={1.5} />}
                  baslik="Sistem"
                  icerik={seciliRapor.sisNo}
                />
              )}
              <DetayAlan
                icon={<User size={14} strokeWidth={1.5} />}
                baslik="Teknisyen"
                icerik={seciliRapor.teknisyen || '—'}
              />
            </div>

            {/* Tarihler */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <DetayAlan
                icon={<Calendar size={14} strokeWidth={1.5} />}
                baslik="Bildirim tarihi"
                icerik={formatTarih(seciliRapor.bilTarih)}
              />
              <DetayAlan
                icon={<Calendar size={14} strokeWidth={1.5} />}
                baslik="Gidiş tarihi"
                icerik={formatTarih(seciliRapor.gidTarih)}
              />
            </div>

            {/* Bildiren / bildirilen */}
            {(seciliRapor.bildiren?.trim() && seciliRapor.bildiren !== '.') && (
              <DetayAlan
                icon={<User size={14} strokeWidth={1.5} />}
                baslik="Bildiren"
                icerik={seciliRapor.bildiren}
              />
            )}
            {seciliRapor.bildirilenAriza && (
              <DetayAlan
                icon={<AlertTriangle size={14} strokeWidth={1.5} />}
                baslik="Bildirilen sorun"
                icerik={seciliRapor.bildirilenAriza}
              />
            )}

            {/* esnweb ek alanları */}
            {(seciliRapor.servisTipi || seciliRapor.yukumluluk || seciliRapor.servisYeri || seciliRapor.statuEsn) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                {seciliRapor.servisTipi && <DetayAlan baslik="Servis Tipi" icerik={seciliRapor.servisTipi} />}
                {seciliRapor.yukumluluk && <DetayAlan baslik="Yükümlülük" icerik={seciliRapor.yukumluluk} />}
                {seciliRapor.servisYeri && <DetayAlan baslik="Servis Yeri" icerik={seciliRapor.servisYeri} />}
                {seciliRapor.statuEsn && <DetayAlan baslik="Statü" icerik={seciliRapor.statuEsn} />}
              </div>
            )}
            {(seciliRapor.evrakNo || seciliRapor.teslimAlan) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {seciliRapor.evrakNo && <DetayAlan baslik="Evrak No" icerik={seciliRapor.evrakNo} />}
                {seciliRapor.teslimAlan && <DetayAlan baslik="Teslim Alan" icerik={seciliRapor.teslimAlan} />}
              </div>
            )}
            {seciliRapor.varisSaati && (
              <DetayAlan
                icon={<Calendar size={14} strokeWidth={1.5} />}
                baslik="Varış saati"
                icerik={new Date(seciliRapor.varisSaati).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' })}
              />
            )}
            {seciliRapor.imzaUrl && <ImzaGorseli yol={seciliRapor.imzaUrl} />}

            {/* Sonuç — en önemli */}
            {seciliRapor.sonuc && (
              <div style={{
                padding: 12,
                background: 'var(--success-soft)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <CheckCircle2 size={14} strokeWidth={1.5} style={{ color: 'var(--success)' }} />
                  <span className="t-label" style={{ color: 'var(--success)' }}>Sonuç</span>
                </div>
                <p style={{
                  font: '400 13px/20px var(--font-sans)',
                  color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  margin: 0,
                }}>
                  {seciliRapor.sonuc}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Servis formu görünümü — raporu Servis Talepleri'ndeki formla aynı şablonda gösterir */}
      {formRapor && (
        <div
          className="rapor-form-overlay"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: '#e9eef5', display: 'flex', flexDirection: 'column',
          }}
        >
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              .rapor-form-print, .rapor-form-print * { visibility: visible !important; }
              .rapor-form-print { position: absolute; left: 0; top: 0; width: 100%; }
              .rapor-form-toolbar { display: none !important; }
            }
          `}</style>

          {/* Araç çubuğu */}
          <div
            className="rapor-form-toolbar"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 16px', background: 'var(--surface-card)',
              borderBottom: '1px solid var(--border-default)', flexShrink: 0,
            }}
          >
            <span className="t-label" style={{ marginRight: 4 }}>{formRapor.fisNo}</span>
            {[
              { id: 'zna', label: 'ZNA Teknoloji' },
              { id: 'anadolunet', label: 'Anadolunet' },
            ].map(s => (
              <Button
                key={s.id}
                variant={formSirket === s.id ? 'primary' : 'secondary'}
                onClick={() => setFormSirket(s.id)}
              >
                {s.label}
              </Button>
            ))}
            <div style={{ flex: 1 }} />
            <Button variant="primary" iconLeft={<Printer size={14} strokeWidth={1.5} />} onClick={() => window.print()}>
              Yazdır
            </Button>
            <Button variant="secondary" onClick={() => setFormRapor(null)}>Kapat</Button>
          </div>

          {/* Form */}
          <div className="rapor-form-print" style={{ flex: 1, overflow: 'auto', padding: '16px 0' }}>
            <ServisFormu talep={raporToTalep(formRapor)} sirket={formSirket} />
          </div>
        </div>
      )}
    </div>
  )
}

function ImzaGorseli({ yol }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!yol) return
    supabase.storage.from('imzalar').createSignedUrl(yol, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl)
    })
  }, [yol])
  if (!url) return null
  return (
    <div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-tertiary)', marginBottom: 4 }}>
        <span className="t-label">Müşteri İmzası</span>
      </div>
      <div style={{ padding: 12, background: '#fff', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'center' }}>
        <img src={url} alt="İmza" style={{ maxHeight: 140, maxWidth: '100%' }} />
      </div>
    </div>
  )
}

function DetayAlan({ icon, baslik, icerik }) {
  return (
    <div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: 'var(--text-tertiary)',
        marginBottom: 4,
      }}>
        {icon}
        <span className="t-label">{baslik}</span>
      </div>
      <div style={{
        font: '400 14px/20px var(--font-sans)',
        color: 'var(--text-primary)',
        wordBreak: 'break-word',
      }}>
        {icerik}
      </div>
    </div>
  )
}
