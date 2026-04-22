import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import * as XLSX from 'xlsx'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { teklifleriGetir } from '../services/teklifService'
import { servisTalepleriniGetir } from '../services/servisService'
import { gorevleriGetir } from '../services/gorevService'
import { musterileriGetir } from '../services/musteriService'
import { stokUrunleriniGetir, stokHareketleriniGetir } from '../services/stokService'

// ─── Tarih yardımcıları ──────────────────────────────────────────────────────
function basOfDay(d) {
  const t = new Date(d); t.setHours(0, 0, 0, 0); return t
}
function endOfDay(d) {
  const t = new Date(d); t.setHours(23, 59, 59, 999); return t
}
function mondayOfWeek(d) {
  const t = new Date(d); const day = t.getDay(); const diff = (day === 0 ? -6 : 1 - day)
  t.setDate(t.getDate() + diff); t.setHours(0, 0, 0, 0); return t
}
function sundayOfWeek(d) {
  const t = mondayOfWeek(d); t.setDate(t.getDate() + 6); t.setHours(23, 59, 59, 999); return t
}
function startOfMonth(d) {
  return basOfDay(new Date(d.getFullYear(), d.getMonth(), 1))
}
function endOfMonth(d) {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}
function startOfYear(d) {
  return basOfDay(new Date(d.getFullYear(), 0, 1))
}
function endOfYear(d) {
  return endOfDay(new Date(d.getFullYear(), 11, 31))
}

function aralikHesapla(secim, ozelBas, ozelBit) {
  const bugun = new Date()
  switch (secim) {
    case 'bugun':    return [basOfDay(bugun),     endOfDay(bugun)]
    case 'bu_hafta': return [mondayOfWeek(bugun), sundayOfWeek(bugun)]
    case 'bu_ay':    return [startOfMonth(bugun), endOfMonth(bugun)]
    case 'bu_yil':   return [startOfYear(bugun),  endOfYear(bugun)]
    case 'ozel':     return [basOfDay(new Date(ozelBas)), endOfDay(new Date(ozelBit))]
    default:         return [startOfMonth(bugun), endOfMonth(bugun)]
  }
}

function tarihFiltrele(isoStr, bas, bit) {
  if (!isoStr) return false
  const d = new Date(isoStr)
  return d >= bas && d <= bit
}

function formatTarih(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  return d.toLocaleDateString('tr-TR')
}

function formatPara(sayi) {
  if (!sayi && sayi !== 0) return '—'
  return Number(sayi).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺'
}

// ─── PDF üretici ─────────────────────────────────────────────────────────────
function pdfUret({ aralikEtiketi, gorusmeler, teklifler, servis, gorevler, musteriler, stok, seciliModuller }) {
  const stil = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 24px; }
    .baslik { font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
    .alt-baslik { font-size: 12px; color: #64748b; margin-bottom: 24px; }
    .bolum { margin-bottom: 28px; page-break-inside: avoid; }
    .bolum-baslik { font-size: 13px; font-weight: 700; color: #0176D3; border-bottom: 2px solid #0176D3; padding-bottom: 4px; margin-bottom: 10px; }
    .ozet-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px; }
    .ozet-kart { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
    .ozet-sayi { font-size: 22px; font-weight: 700; color: #0176D3; }
    .ozet-etiket { font-size: 10px; color: #64748b; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    th { background: #f1f5f9; padding: 6px 8px; text-align: left; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; }
    td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    .bos { color: #94a3b8; font-style: italic; padding: 12px; text-align: center; }
    .badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 9.5px; font-weight: 600; }
    .logo-alan { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e2e8f0; }
    .firma-logo { font-size: 16px; font-weight: 800; color: #0176D3; }
    @media print { body { padding: 12px; } }
  `

  const badgeRenk = (tip, val) => {
    const renkler = {
      durumGorusme: { acik: '#3b82f6', beklemede: '#f59e0b', kapali: '#10b981' },
      durumTeklif:  { takipte: '#3b82f6', kabul: '#10b981', vazgecildi: '#ef4444', revizyon: '#f59e0b' },
      durumServis:  { bekliyor: '#6b7280', inceleniyor: '#0176D3', atandi: '#014486', devam_ediyor: '#f59e0b', tamamlandi: '#10b981', iptal: '#ef4444' },
      durumGorev:   { bekliyor: '#6b7280', devam: '#f59e0b', tamamlandi: '#10b981' },
      oncelik:      { dusuk: '#6b7280', orta: '#f59e0b', yuksek: '#ef4444' },
    }
    const renk = renkler[tip]?.[val] || '#6b7280'
    return `<span class="badge" style="background:${renk}22;color:${renk}">${val}</span>`
  }

  const satirOlustur = (satirlar, kolonlar) => {
    if (!satirlar.length) return `<tr><td class="bos" colspan="${kolonlar.length}">Bu dönemde kayıt bulunamadı</td></tr>`
    return satirlar.map((s) => `<tr>${s.map((h) => `<td>${h}</td>`).join('')}</tr>`).join('')
  }

  let icerik = ''

  // Özet
  icerik += `
    <div class="ozet-grid">
      <div class="ozet-kart"><div class="ozet-sayi">${gorusmeler.length}</div><div class="ozet-etiket">Görüşme</div></div>
      <div class="ozet-kart"><div class="ozet-sayi">${teklifler.length}</div><div class="ozet-etiket">Teklif</div></div>
      <div class="ozet-kart"><div class="ozet-sayi">${servis.length}</div><div class="ozet-etiket">Servis Talebi</div></div>
      <div class="ozet-kart"><div class="ozet-sayi">${gorevler.length}</div><div class="ozet-etiket">Görev</div></div>
      <div class="ozet-kart"><div class="ozet-sayi">${musteriler.length}</div><div class="ozet-etiket">Yeni Müşteri</div></div>
      <div class="ozet-kart"><div class="ozet-sayi">${teklifler.filter((t) => t.onayDurumu === 'kabul').length}</div><div class="ozet-etiket">Kabul Teklif</div></div>
      <div class="ozet-kart"><div class="ozet-sayi">${servis.filter((s) => s.durum === 'tamamlandi').length}</div><div class="ozet-etiket">Tamamlanan Servis</div></div>
      <div class="ozet-kart"><div class="ozet-sayi">${formatPara(teklifler.filter((t) => t.onayDurumu === 'kabul').reduce((s, t) => s + (t.genelToplam || 0), 0))}</div><div class="ozet-etiket">Kabul Tutar</div></div>
    </div>
  `

  if (seciliModuller.gorusmeler) {
    icerik += `
      <div class="bolum">
        <div class="bolum-baslik">🤝 Görüşmeler (${gorusmeler.length})</div>
        <table>
          <thead><tr><th>Aktv. No</th><th>Firma</th><th>Muhatap</th><th>Konu</th><th>Görüşen</th><th>Tarih</th><th>Durum</th></tr></thead>
          <tbody>${satirOlustur(gorusmeler.map((g) => [
            g.aktNo || '—',
            g.firmaAdi || '—',
            g.muhatapAd || '—',
            g.konu || '—',
            g.gorusen || '—',
            g.tarih || '—',
            badgeRenk('durumGorusme', g.durum),
          ]), 7)}</tbody>
        </table>
      </div>`
  }

  if (seciliModuller.teklifler) {
    icerik += `
      <div class="bolum">
        <div class="bolum-baslik">💼 Teklifler (${teklifler.length})</div>
        <table>
          <thead><tr><th>No</th><th>Müşteri</th><th>Firma</th><th>Hazırlayan</th><th>Tutar</th><th>Tarih</th><th>Durum</th></tr></thead>
          <tbody>${satirOlustur(teklifler.map((t) => [
            t.teklifNo || '—',
            t.musteriAd || '—',
            t.firmaAdi || '—',
            t.hazirlayan || '—',
            formatPara(t.genelToplam),
            formatTarih(t.tarih),
            badgeRenk('durumTeklif', t.onayDurumu),
          ]), 7)}</tbody>
        </table>
      </div>`
  }

  if (seciliModuller.servis) {
    icerik += `
      <div class="bolum">
        <div class="bolum-baslik">🛎️ Servis Talepleri (${servis.length})</div>
        <table>
          <thead><tr><th>No</th><th>Müşteri / Firma</th><th>Tür</th><th>Konu</th><th>Aciliyet</th><th>Tarih</th><th>Durum</th></tr></thead>
          <tbody>${satirOlustur(servis.map((s) => [
            s.talepNo || '—',
            `${s.musteriAd || '—'}${s.firmaAdi ? ' / ' + s.firmaAdi : ''}`,
            s.anaTur || '—',
            (s.konu || '—').substring(0, 30),
            badgeRenk('oncelik', s.aciliyet),
            formatTarih(s.olusturmaTarihi),
            badgeRenk('durumServis', s.durum),
          ]), 7)}</tbody>
        </table>
      </div>`
  }

  if (seciliModuller.gorevler) {
    icerik += `
      <div class="bolum">
        <div class="bolum-baslik">📋 Görevler (${gorevler.length})</div>
        <table>
          <thead><tr><th>Başlık</th><th>Atanan</th><th>Öncelik</th><th>Son Tarih</th><th>Oluşturan</th><th>Durum</th></tr></thead>
          <tbody>${satirOlustur(gorevler.map((g) => [
            (g.baslik || '—').substring(0, 35),
            g.atananAd || g.atanan || '—',
            badgeRenk('oncelik', g.oncelik),
            g.sonTarih || '—',
            g.olusturanAd || '—',
            badgeRenk('durumGorev', g.durum),
          ]), 6)}</tbody>
        </table>
      </div>`
  }

  if (seciliModuller.musteriler) {
    icerik += `
      <div class="bolum">
        <div class="bolum-baslik">👥 Yeni Müşteriler (${musteriler.length})</div>
        <table>
          <thead><tr><th>Müşteri Kodu</th><th>Ad Soyad</th><th>Firma</th><th>Unvan</th><th>Telefon</th><th>Şehir</th><th>Durum</th></tr></thead>
          <tbody>${satirOlustur(musteriler.map((m) => [
            m.kod || '—',
            `${m.ad || ''} ${m.soyad || ''}`.trim() || '—',
            m.firma || '—',
            m.unvan || '—',
            m.telefon || '—',
            m.sehir || '—',
            m.durum || '—',
          ]), 7)}</tbody>
        </table>
      </div>`
  }

  if (seciliModuller.stok) {
    icerik += `
      <div class="bolum">
        <div class="bolum-baslik">📦 Stok Hareketleri (${stok.length})</div>
        <table>
          <thead><tr><th>Stok Kodu</th><th>Ürün Adı</th><th>Tür</th><th>Miktar</th><th>Birim</th><th>Belge No</th><th>Tarih</th></tr></thead>
          <tbody>${satirOlustur(stok.map((h) => [
            h.stokKodu || '—',
            (h.stokAdi || '—').substring(0, 30),
            h.tur === 'giris' ? '<span class="badge" style="background:#10b98122;color:#10b981">Giriş</span>' : '<span class="badge" style="background:#ef444422;color:#ef4444">Çıkış</span>',
            h.miktar || '—',
            h.birim || '—',
            h.belgeNo || '—',
            formatTarih(h.tarih),
          ]), 7)}</tbody>
        </table>
      </div>`
  }

  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><title>ZNA Raporu — ${aralikEtiketi}</title>
<style>${stil}</style></head>
<body>
  <div class="logo-alan">
    <div>
      <div class="firma-logo">ZNA Teknoloji</div>
      <div style="font-size:10px;color:#64748b">Dinamik Sistemler</div>
    </div>
    <div style="text-align:right">
      <div class="baslik">Faaliyet Raporu</div>
      <div class="alt-baslik">Dönem: ${aralikEtiketi} &nbsp;|&nbsp; Oluşturma: ${new Date().toLocaleString('tr-TR')}</div>
    </div>
  </div>
  ${icerik}
</body></html>`
}

// ─── Excel üretici ────────────────────────────────────────────────────────────
function excelIndir({ aralikEtiketi, gorusmeler, teklifler, servis, gorevler, musteriler, stok, kullanicilar, seciliModuller }) {
  const wb = XLSX.utils.book_new()

  if (seciliModuller.gorusmeler && gorusmeler.length) {
    const veri = gorusmeler.map((g) => ({
      'Aktivite No': g.aktNo || '',
      'Firma': g.firmaAdi || '',
      'Muhatap': g.muhatapAd || '',
      'Konu': g.konu || '',
      'Görüşen': g.gorusen || '',
      'Tarih': g.tarih || '',
      'Durum': g.durum || '',
      'Takip Notu': g.takipNotu || '',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(veri), 'Görüşmeler')
  }

  if (seciliModuller.teklifler && teklifler.length) {
    const veri = teklifler.map((t) => ({
      'Teklif No': t.teklifNo || '',
      'Müşteri': t.musteriAd || '',
      'Firma': t.firmaAdi || '',
      'Hazırlayan': t.hazirlayan || '',
      'Tutar (₺)': t.genelToplam || 0,
      'Tarih': formatTarih(t.tarih),
      'Durum': t.onayDurumu || '',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(veri), 'Teklifler')
  }

  if (seciliModuller.servis && servis.length) {
    const veri = servis.map((s) => ({
      'Talep No': s.talepNo || '',
      'Müşteri': s.musteriAd || '',
      'Firma': s.firmaAdi || '',
      'Tür': s.anaTur || '',
      'Konu': s.konu || '',
      'Aciliyet': s.aciliyet || '',
      'Tarih': formatTarih(s.olusturmaTarihi),
      'Durum': s.durum || '',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(veri), 'Servis Talepleri')
  }

  if (seciliModuller.gorevler && gorevler.length) {
    const veri = gorevler.map((g) => {
      const atanan = kullanicilar.find((k) => k.id?.toString() === g.atanan)
      return {
        'Başlık': g.baslik || '',
        'Atanan': atanan?.ad || g.atanan || '',
        'Öncelik': g.oncelik || '',
        'Son Tarih': g.sonTarih || '',
        'Oluşturan': g.olusturanAd || '',
        'Oluşturma': formatTarih(g.olusturmaTarih),
        'Durum': g.durum || '',
      }
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(veri), 'Görevler')
  }

  if (seciliModuller.musteriler && musteriler.length) {
    const veri = musteriler.map((m) => ({
      'Kod': m.kod || '',
      'Ad': m.ad || '',
      'Soyad': m.soyad || '',
      'Firma': m.firma || '',
      'Unvan': m.unvan || '',
      'Telefon': m.telefon || '',
      'E-posta': m.email || '',
      'Şehir': m.sehir || '',
      'Durum': m.durum || '',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(veri), 'Müşteriler')
  }

  if (seciliModuller.stok && stok.length) {
    const veri = stok.map((h) => ({
      'Stok Kodu': h.stokKodu || '',
      'Ürün Adı': h.stokAdi || '',
      'Tür': h.tur || '',
      'Miktar': h.miktar || 0,
      'Birim': h.birim || '',
      'Belge No': h.belgeNo || '',
      'Tarih': formatTarih(h.tarih),
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(veri), 'Stok Hareketleri')
  }

  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 'Bilgi': 'Seçilen dönemde veri bulunamadı' }]), 'Rapor')
  }

  XLSX.writeFile(wb, `ZNA_Rapor_${aralikEtiketi.replace(/\s|\/|-/g, '_')}.xlsx`)
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────
const aralikSecenekleri = [
  { id: 'bugun',    isim: 'Bugün' },
  { id: 'bu_hafta', isim: 'Bu Hafta' },
  { id: 'bu_ay',    isim: 'Bu Ay' },
  { id: 'bu_yil',   isim: 'Bu Yıl' },
  { id: 'ozel',     isim: 'Özel Aralık' },
]

const modulListesi = [
  { id: 'gorusmeler', isim: 'Görüşmeler', ikon: '🤝' },
  { id: 'teklifler',  isim: 'Teklifler',  ikon: '💼' },
  { id: 'servis',     isim: 'Servis Talepleri', ikon: '🛎️' },
  { id: 'gorevler',   isim: 'Görevler',   ikon: '📋' },
  { id: 'musteriler', isim: 'Yeni Müşteriler', ikon: '👥' },
  { id: 'stok',       isim: 'Stok Hareketleri', ikon: '📦' },
]

function istatistikKarti(sayi, etiket, renk = '#0176D3') {
  return (
    <div
      key={etiket}
      className="rounded-xl p-4 text-center"
      style={{ background: `${renk}10`, border: `1px solid ${renk}25` }}
    >
      <p className="text-2xl font-bold" style={{ color: renk }}>{sayi}</p>
      <p className="text-xs text-gray-500 mt-0.5">{etiket}</p>
    </div>
  )
}

export default function RaporMerkezi() {
  const { kullanicilar } = useAuth()

  const bugun = new Date()
  const [aralik, setAralik] = useState('bu_ay')
  const [ozelBas, setOzelBas] = useState(new Date(bugun.getFullYear(), bugun.getMonth(), 1).toISOString().split('T')[0])
  const [ozelBit, setOzelBit] = useState(bugun.toISOString().split('T')[0])
  const [seciliModuller, setSeciliModuller] = useState({
    gorusmeler: true, teklifler: true, servis: true,
    gorevler: true,   musteriler: true, stok: true,
  })
  const [yukleniyor, setYukleniyor] = useState(false)

  // Supabase verileri (bir kez yüklenir)
  const [tumVeri, setTumVeri] = useState({
    gorusmeler: [], teklifler: [], servis: [], gorevler: [],
    musteriler: [], stokHareketler: [], stokUrunler: [],
  })
  const [veriYukleniyor, setVeriYukleniyor] = useState(true)

  useEffect(() => {
    Promise.all([
      gorusmeleriGetir(),
      teklifleriGetir(),
      servisTalepleriniGetir(),
      gorevleriGetir(),
      musterileriGetir(),
      stokHareketleriniGetir(),
      stokUrunleriniGetir(),
    ]).then(([g, t, s, gv, m, sh, su]) => {
      setTumVeri({
        gorusmeler: g || [],
        teklifler: t || [],
        servis: s || [],
        gorevler: gv || [],
        musteriler: m || [],
        stokHareketler: sh || [],
        stokUrunler: su || [],
      })
      setVeriYukleniyor(false)
    }).catch(e => {
      console.error('Rapor verisi yüklenemedi:', e)
      setVeriYukleniyor(false)
    })
  }, [])

  // Tarih aralığını hesapla
  const [bas, bit] = useMemo(() => aralikHesapla(aralik, ozelBas, ozelBit), [aralik, ozelBas, ozelBit])

  const aralikEtiketi = useMemo(() => {
    if (aralik === 'ozel') return `${ozelBas} / ${ozelBit}`
    return aralikSecenekleri.find((a) => a.id === aralik)?.isim || ''
  }, [aralik, ozelBas, ozelBit])

  // Filtrelenmiş veriler
  const veri = useMemo(() => {
    // Stok hareketlerine ürün adını ekle
    const stokSon = tumVeri.stokHareketler
      .filter((h) => tarihFiltrele(h.tarih, bas, bit))
      .map((h) => {
        const urun = tumVeri.stokUrunler.find((u) => u.stokKodu === h.stokKodu)
        return { ...h, stokAdi: urun?.stokAdi || h.stokKodu }
      })

    // Göreve atanan ad
    const gorevSon = tumVeri.gorevler
      .filter((g) => tarihFiltrele(g.olusturmaTarih, bas, bit))
      .map((g) => {
        const atanan = (kullanicilar || []).find((k) => k.id?.toString() === String(g.atanan))
        return { ...g, atananAd: atanan?.ad || '' }
      })

    return {
      gorusmeler:  tumVeri.gorusmeler.filter((g) => tarihFiltrele(g.tarih, bas, bit) || tarihFiltrele(g.olusturmaTarih, bas, bit)),
      teklifler:   tumVeri.teklifler.filter((t)  => tarihFiltrele(t.tarih, bas, bit) || tarihFiltrele(t.olusturmaTarih, bas, bit)),
      servis:      tumVeri.servis.filter((s)     => tarihFiltrele(s.olusturmaTarihi || s.olusturmaTarih, bas, bit)),
      gorevler:    gorevSon,
      musteriler:  tumVeri.musteriler.filter((m) => tarihFiltrele(m.olusturmaTarih, bas, bit)),
      stok:        stokSon,
    }
  }, [bas, bit, kullanicilar, tumVeri])

  const modulDegistir = (id) =>
    setSeciliModuller((prev) => ({ ...prev, [id]: !prev[id] }))

  const pdfIndir = () => {
    setYukleniyor(true)
    setTimeout(() => {
      const html = pdfUret({ aralikEtiketi, ...veri, seciliModuller })
      const w = window.open('', '_blank')
      w.document.write(html)
      w.document.close()
      w.focus()
      setTimeout(() => { w.print(); setYukleniyor(false) }, 400)
    }, 100)
  }

  const excelIndirim = () => {
    excelIndir({ aralikEtiketi, ...veri, kullanicilar, seciliModuller })
  }

  const toplamKayit = Object.entries(veri)
    .filter(([k]) => seciliModuller[k])
    .reduce((s, [, v]) => s + v.length, 0)

  if (veriYukleniyor) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Rapor Merkezi</h2>
        <div className="text-center text-gray-400 py-20">
          <div className="text-4xl mb-3 animate-pulse">📊</div>
          <p className="text-sm">Veriler yükleniyor...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Başlık */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Rapor Merkezi</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Seçilen dönem: <span className="font-medium text-indigo-600">{aralikEtiketi}</span>
            {' · '}{toplamKayit} kayıt seçildi
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={excelIndirim}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl border transition font-medium"
            style={{ color: '#10b981', borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.06)' }}
          >
            📊 Excel İndir
          </button>
          <button
            onClick={pdfIndir}
            disabled={yukleniyor}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl text-white font-medium transition disabled:opacity-60"
            style={{ background: 'var(--primary)', boxShadow: '0 4px 12px rgba(1,118,211,0.35)' }}
          >
            {yukleniyor ? '⏳ Hazırlanıyor...' : '📄 PDF İndir'}
          </button>
        </div>
      </div>

      {/* Dönem Seçici */}
      <div
        className="rounded-2xl p-5 mb-5"
        style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(1,118,211,0.12)', boxShadow: '0 4px 24px rgba(1,118,211,0.07)' }}
      >
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Dönem Seç</p>
        <div className="flex gap-2 flex-wrap mb-4">
          {aralikSecenekleri.map((a) => (
            <button
              key={a.id}
              onClick={() => setAralik(a.id)}
              className="text-sm px-4 py-2 rounded-xl font-medium transition"
              style={{
                background: aralik === a.id ? 'var(--primary)' : 'rgba(1,118,211,0.06)',
                color: aralik === a.id ? 'white' : 'var(--primary)',
                border: aralik === a.id ? 'none' : '1px solid rgba(1,118,211,0.2)',
                boxShadow: aralik === a.id ? '0 4px 12px rgba(1,118,211,0.3)' : 'none',
              }}
            >
              {a.isim}
            </button>
          ))}
        </div>

        {aralik === 'ozel' && (
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Başlangıç</label>
              <input
                type="date"
                value={ozelBas}
                onChange={(e) => setOzelBas(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <span className="text-gray-300 mt-4">→</span>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Bitiş</label>
              <input
                type="date"
                value={ozelBit}
                onChange={(e) => setOzelBit(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>
        )}
      </div>

      {/* Modül Seçici */}
      <div
        className="rounded-2xl p-5 mb-5"
        style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(1,118,211,0.12)', boxShadow: '0 4px 24px rgba(1,118,211,0.07)' }}
      >
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Rapora Dahil Edilecek Modüller</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {modulListesi.map((m) => {
            const aktif = seciliModuller[m.id]
            const sayac = veri[m.id]?.length || 0
            return (
              <button
                key={m.id}
                onClick={() => modulDegistir(m.id)}
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-left transition"
                style={{
                  background: aktif ? 'rgba(1,118,211,0.08)' : 'rgba(248,250,252,0.8)',
                  border: aktif ? '1.5px solid rgba(1,118,211,0.35)' : '1.5px solid #e5e7eb',
                }}
              >
                <span
                  className="w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0"
                  style={{ background: aktif ? 'var(--primary)' : '#e5e7eb' }}
                >
                  {aktif ? <span className="text-white font-bold">✓</span> : ''}
                </span>
                <span className="text-lg">{m.ikon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{m.isim}</p>
                  <p className="text-xs text-gray-400">{sayac} kayıt</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Özet Kartlar */}
      <div
        className="rounded-2xl p-5 mb-5"
        style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(1,118,211,0.12)', boxShadow: '0 4px 24px rgba(1,118,211,0.07)' }}
      >
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Özet — {aralikEtiketi}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {istatistikKarti(veri.gorusmeler.length, 'Görüşme', '#3b82f6')}
          {istatistikKarti(veri.teklifler.length, 'Teklif', '#014486')}
          {istatistikKarti(veri.servis.length, 'Servis Talebi', '#f59e0b')}
          {istatistikKarti(veri.gorevler.length, 'Görev', '#0176D3')}
          {istatistikKarti(veri.musteriler.length, 'Yeni Müşteri', '#10b981')}
          {istatistikKarti(veri.teklifler.filter((t) => t.onayDurumu === 'kabul').length, 'Kabul Teklif', '#10b981')}
          {istatistikKarti(veri.servis.filter((s) => s.durum === 'tamamlandi').length, 'Tam. Servis', '#10b981')}
          {istatistikKarti(
            formatPara(veri.teklifler.filter((t) => t.onayDurumu === 'kabul').reduce((s, t) => s + (t.genelToplam || 0), 0)),
            'Kabul Tutar', '#10b981'
          )}
        </div>
      </div>

      {/* Veri Önizleme Tabloları */}
      {modulListesi.filter((m) => seciliModuller[m.id]).map((modul) => {
        const kayitlar = veri[modul.id]
        return (
          <div
            key={modul.id}
            className="rounded-2xl mb-4 overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(1,118,211,0.12)', boxShadow: '0 4px 24px rgba(1,118,211,0.07)' }}
          >
            <div
              className="flex items-center justify-between px-5 py-3"
              style={{ borderBottom: '1px solid rgba(1,118,211,0.1)' }}
            >
              <p className="font-semibold text-gray-800 flex items-center gap-2">
                <span>{modul.ikon}</span> {modul.isim}
              </p>
              <span
                className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(1,118,211,0.1)', color: 'var(--primary)' }}
              >
                {kayitlar.length} kayıt
              </span>
            </div>

            {kayitlar.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                Bu dönemde {modul.isim.toLowerCase()} kaydı bulunamadı
              </div>
            ) : (
              <div className="overflow-x-auto">
                <TabloBilesenler modul={modul.id} kayitlar={kayitlar} kullanicilar={kullanicilar} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TabloBilesenler({ modul, kayitlar, kullanicilar }) {
  const thStyle = 'px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 whitespace-nowrap'
  const tdStyle = 'px-4 py-2.5 text-sm text-gray-700 border-t border-gray-50 whitespace-nowrap'

  const badge = (renk, bg, metin) => (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ color: renk, background: bg }}
    >
      {metin}
    </span>
  )

  const durumGorusme = { acik: ['#3b82f6', 'rgba(59,130,246,0.1)', 'Açık'], beklemede: ['#f59e0b', 'rgba(245,158,11,0.1)', 'Beklemede'], kapali: ['#10b981', 'rgba(16,185,129,0.1)', 'Kapalı'] }
  const durumTeklif  = { takipte: ['#3b82f6', 'rgba(59,130,246,0.1)', 'Takipte'], kabul: ['#10b981', 'rgba(16,185,129,0.1)', 'Kabul'], vazgecildi: ['#ef4444', 'rgba(239,68,68,0.1)', 'Vazgeçildi'], revizyon: ['#f59e0b', 'rgba(245,158,11,0.1)', 'Revizyon'] }
  const durumServis  = { bekliyor: ['#6b7280', 'rgba(107,114,128,0.1)', 'Bekliyor'], inceleniyor: ['#0176D3', 'rgba(1,118,211,0.1)', 'İnceleniyor'], atandi: ['#014486', 'rgba(1,68,134,0.1)', 'Atandı'], devam_ediyor: ['#f59e0b', 'rgba(245,158,11,0.1)', 'Devam Ediyor'], tamamlandi: ['#10b981', 'rgba(16,185,129,0.1)', 'Tamamlandı'], iptal: ['#ef4444', 'rgba(239,68,68,0.1)', 'İptal'] }
  const durumGorev   = { bekliyor: ['#6b7280', 'rgba(107,114,128,0.1)', 'Bekliyor'], devam: ['#f59e0b', 'rgba(245,158,11,0.1)', 'Devam Ediyor'], tamamlandi: ['#10b981', 'rgba(16,185,129,0.1)', 'Tamamlandı'] }
  const oncelikMap   = { dusuk: ['#6b7280', 'rgba(107,114,128,0.1)', 'Düşük'], orta: ['#f59e0b', 'rgba(245,158,11,0.1)', 'Orta'], yuksek: ['#ef4444', 'rgba(239,68,68,0.1)', 'Yüksek'] }

  if (modul === 'gorusmeler') {
    return (
      <table className="w-full">
        <thead><tr>
          <th className={thStyle}>Aktv. No</th><th className={thStyle}>Firma</th>
          <th className={thStyle}>Muhatap</th><th className={thStyle}>Konu</th>
          <th className={thStyle}>Görüşen</th><th className={thStyle}>Tarih</th><th className={thStyle}>Durum</th>
        </tr></thead>
        <tbody>{kayitlar.slice(0, 50).map((g) => (
          <tr key={g.id} className="hover:bg-gray-50 transition">
            <td className={tdStyle}><span className="font-mono text-xs text-gray-400">{g.aktNo}</span></td>
            <td className={tdStyle}><span className="font-medium">{g.firmaAdi || '—'}</span></td>
            <td className={tdStyle}>{g.muhatapAd || '—'}</td>
            <td className={tdStyle}><span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{g.konu}</span></td>
            <td className={tdStyle}>{g.gorusen || '—'}</td>
            <td className={tdStyle}>{g.tarih || '—'}</td>
            <td className={tdStyle}>{badge(...(durumGorusme[g.durum] || ['#6b7280', '#f1f5f9', g.durum]))}</td>
          </tr>
        ))}</tbody>
      </table>
    )
  }

  if (modul === 'teklifler') {
    return (
      <table className="w-full">
        <thead><tr>
          <th className={thStyle}>Teklif No</th><th className={thStyle}>Müşteri</th>
          <th className={thStyle}>Firma</th><th className={thStyle}>Hazırlayan</th>
          <th className={thStyle}>Tutar</th><th className={thStyle}>Tarih</th><th className={thStyle}>Durum</th>
        </tr></thead>
        <tbody>{kayitlar.slice(0, 50).map((t) => (
          <tr key={t.id} className="hover:bg-gray-50 transition">
            <td className={tdStyle}><span className="font-mono text-xs text-gray-400">{t.teklifNo}</span></td>
            <td className={tdStyle}><span className="font-medium">{t.musteriAd || '—'}</span></td>
            <td className={tdStyle}>{t.firmaAdi || '—'}</td>
            <td className={tdStyle}>{t.hazirlayan || '—'}</td>
            <td className={tdStyle}><span className="font-semibold text-indigo-600">{formatPara(t.genelToplam)}</span></td>
            <td className={tdStyle}>{formatTarih(t.tarih)}</td>
            <td className={tdStyle}>{badge(...(durumTeklif[t.onayDurumu] || ['#6b7280', '#f1f5f9', t.onayDurumu]))}</td>
          </tr>
        ))}</tbody>
      </table>
    )
  }

  if (modul === 'servis') {
    return (
      <table className="w-full">
        <thead><tr>
          <th className={thStyle}>Talep No</th><th className={thStyle}>Müşteri</th>
          <th className={thStyle}>Tür</th><th className={thStyle}>Konu</th>
          <th className={thStyle}>Aciliyet</th><th className={thStyle}>Tarih</th><th className={thStyle}>Durum</th>
        </tr></thead>
        <tbody>{kayitlar.slice(0, 50).map((s) => (
          <tr key={s.id} className="hover:bg-gray-50 transition">
            <td className={tdStyle}><span className="font-mono text-xs text-gray-400">{s.talepNo}</span></td>
            <td className={tdStyle}><span className="font-medium">{s.musteriAd || '—'}</span><br/><span className="text-xs text-gray-400">{s.firmaAdi}</span></td>
            <td className={tdStyle}>{s.anaTur || '—'}</td>
            <td className={tdStyle} style={{ maxWidth: 200 }}><span className="truncate block">{s.konu || '—'}</span></td>
            <td className={tdStyle}>{badge(...(oncelikMap[s.aciliyet] || ['#6b7280', '#f1f5f9', s.aciliyet]))}</td>
            <td className={tdStyle}>{formatTarih(s.olusturmaTarihi)}</td>
            <td className={tdStyle}>{badge(...(durumServis[s.durum] || ['#6b7280', '#f1f5f9', s.durum]))}</td>
          </tr>
        ))}</tbody>
      </table>
    )
  }

  if (modul === 'gorevler') {
    return (
      <table className="w-full">
        <thead><tr>
          <th className={thStyle}>Başlık</th><th className={thStyle}>Atanan</th>
          <th className={thStyle}>Öncelik</th><th className={thStyle}>Son Tarih</th>
          <th className={thStyle}>Oluşturan</th><th className={thStyle}>Durum</th>
        </tr></thead>
        <tbody>{kayitlar.slice(0, 50).map((g) => (
          <tr key={g.id} className="hover:bg-gray-50 transition">
            <td className={tdStyle}><span className="font-medium">{g.baslik || '—'}</span></td>
            <td className={tdStyle}>{g.atananAd || '—'}</td>
            <td className={tdStyle}>{badge(...(oncelikMap[g.oncelik] || ['#6b7280', '#f1f5f9', g.oncelik]))}</td>
            <td className={tdStyle}>{g.sonTarih || '—'}</td>
            <td className={tdStyle}>{g.olusturanAd || '—'}</td>
            <td className={tdStyle}>{badge(...(durumGorev[g.durum] || ['#6b7280', '#f1f5f9', g.durum]))}</td>
          </tr>
        ))}</tbody>
      </table>
    )
  }

  if (modul === 'musteriler') {
    return (
      <table className="w-full">
        <thead><tr>
          <th className={thStyle}>Kod</th><th className={thStyle}>Ad Soyad</th>
          <th className={thStyle}>Firma</th><th className={thStyle}>Unvan</th>
          <th className={thStyle}>Telefon</th><th className={thStyle}>Şehir</th><th className={thStyle}>Durum</th>
        </tr></thead>
        <tbody>{kayitlar.slice(0, 50).map((m) => (
          <tr key={m.id} className="hover:bg-gray-50 transition">
            <td className={tdStyle}><span className="font-mono text-xs text-indigo-500">{m.kod}</span></td>
            <td className={tdStyle}><span className="font-medium">{m.ad} {m.soyad}</span></td>
            <td className={tdStyle}>{m.firma || '—'}</td>
            <td className={tdStyle}>{m.unvan || '—'}</td>
            <td className={tdStyle}>{m.telefon || '—'}</td>
            <td className={tdStyle}>{m.sehir || '—'}</td>
            <td className={tdStyle}><span className="text-xs font-medium text-gray-500 capitalize">{m.durum}</span></td>
          </tr>
        ))}</tbody>
      </table>
    )
  }

  if (modul === 'stok') {
    return (
      <table className="w-full">
        <thead><tr>
          <th className={thStyle}>Stok Kodu</th><th className={thStyle}>Ürün Adı</th>
          <th className={thStyle}>Tür</th><th className={thStyle}>Miktar</th>
          <th className={thStyle}>Birim</th><th className={thStyle}>Belge No</th><th className={thStyle}>Tarih</th>
        </tr></thead>
        <tbody>{kayitlar.slice(0, 50).map((h, i) => (
          <tr key={i} className="hover:bg-gray-50 transition">
            <td className={tdStyle}><span className="font-mono text-xs text-gray-500">{h.stokKodu}</span></td>
            <td className={tdStyle}>{h.stokAdi || '—'}</td>
            <td className={tdStyle}>
              {h.tur === 'giris'
                ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600">Giriş</span>
                : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-500">Çıkış</span>}
            </td>
            <td className={tdStyle}><span className="font-medium">{h.miktar}</span></td>
            <td className={tdStyle}>{h.birim || '—'}</td>
            <td className={tdStyle}>{h.belgeNo || '—'}</td>
            <td className={tdStyle}>{formatTarih(h.tarih)}</td>
          </tr>
        ))}</tbody>
      </table>
    )
  }

  return null
}
