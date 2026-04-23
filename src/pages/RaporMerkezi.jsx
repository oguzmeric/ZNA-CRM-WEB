import { useState, useMemo, useEffect } from 'react'
import {
  FileSpreadsheet, FileText, Check, BarChart3,
  Phone, Briefcase, Wrench, CheckSquare, Users, Package,
  ArrowUp, ArrowDown,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useAuth } from '../context/AuthContext'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { teklifleriGetir } from '../services/teklifService'
import { servisTalepleriniGetir } from '../services/servisService'
import { gorevleriGetir } from '../services/gorevService'
import { musterileriGetir } from '../services/musteriService'
import { stokUrunleriniGetir, stokHareketleriniGetir } from '../services/stokService'
import { Button, Card, KPICard, Badge, CodeBadge, EmptyState } from '../components/ui'

// ─── Tarih yardımcıları ──
function basOfDay(d) { const t = new Date(d); t.setHours(0, 0, 0, 0); return t }
function endOfDay(d) { const t = new Date(d); t.setHours(23, 59, 59, 999); return t }
function mondayOfWeek(d) {
  const t = new Date(d); const day = t.getDay(); const diff = (day === 0 ? -6 : 1 - day)
  t.setDate(t.getDate() + diff); t.setHours(0, 0, 0, 0); return t
}
function sundayOfWeek(d) { const t = mondayOfWeek(d); t.setDate(t.getDate() + 6); t.setHours(23, 59, 59, 999); return t }
function startOfMonth(d) { return basOfDay(new Date(d.getFullYear(), d.getMonth(), 1)) }
function endOfMonth(d)   { return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }
function startOfYear(d)  { return basOfDay(new Date(d.getFullYear(), 0, 1)) }
function endOfYear(d)    { return endOfDay(new Date(d.getFullYear(), 11, 31)) }

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

const formatTarih = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('tr-TR')
}

const formatPara = (n) => {
  if (!n && n !== 0) return '—'
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺'
}

// ─── PDF üretici (aynen korundu) ──
function pdfUret({ aralikEtiketi, gorusmeler, teklifler, servis, gorevler, musteriler, stok, seciliModuller }) {
  const stil = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', Arial, sans-serif; font-size: 11px; color: #0F1C2E; padding: 24px; }
    .baslik { font-size: 20px; font-weight: 600; color: #0F1C2E; margin-bottom: 4px; }
    .alt-baslik { font-size: 12px; color: #4A5A6E; margin-bottom: 24px; }
    .bolum { margin-bottom: 28px; page-break-inside: avoid; }
    .bolum-baslik { font-size: 13px; font-weight: 600; color: #1E5AA8; border-bottom: 2px solid #1E5AA8; padding-bottom: 4px; margin-bottom: 10px; }
    .ozet-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px; }
    .ozet-kart { background: #EDF0F3; border: 1px solid #D9DFE5; border-radius: 6px; padding: 12px; text-align: center; }
    .ozet-sayi { font-size: 22px; font-weight: 600; color: #1E5AA8; font-variant-numeric: tabular-nums; }
    .ozet-etiket { font-size: 10px; color: #4A5A6E; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    th { background: #EDF0F3; padding: 6px 8px; text-align: left; font-weight: 600; color: #4A5A6E; border-bottom: 1px solid #D9DFE5; text-transform: uppercase; letter-spacing: 0.04em; }
    td { padding: 5px 8px; border-bottom: 1px solid #EDF0F3; color: #0F1C2E; vertical-align: top; }
    .bos { color: #8393A6; font-style: italic; padding: 12px; text-align: center; }
    .badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 9.5px; font-weight: 500; }
    .logo-alan { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #D9DFE5; }
    .firma-logo { font-size: 16px; font-weight: 600; color: #1E5AA8; }
    @media print { body { padding: 12px; } }
  `

  const badgeRenk = (tip, val) => {
    const renkler = {
      durumGorusme: { acik: '#2B6A9E', beklemede: '#B77516', kapali: '#2F7D4F' },
      durumTeklif:  { takipte: '#2B6A9E', kabul: '#2F7D4F', vazgecildi: '#B23A3A', revizyon: '#B77516' },
      durumServis:  { bekliyor: '#8393A6', inceleniyor: '#2B6A9E', atandi: '#1E5AA8', devam_ediyor: '#B77516', tamamlandi: '#2F7D4F', iptal: '#B23A3A' },
      durumGorev:   { bekliyor: '#8393A6', devam: '#B77516', tamamlandi: '#2F7D4F' },
      oncelik:      { dusuk: '#8393A6', orta: '#B77516', yuksek: '#B23A3A' },
    }
    const renk = renkler[tip]?.[val] || '#8393A6'
    return `<span class="badge" style="background:${renk}22;color:${renk}">${val}</span>`
  }

  const satirOlustur = (satirlar, kolonlar) => {
    if (!satirlar.length) return `<tr><td class="bos" colspan="${kolonlar.length}">Bu dönemde kayıt bulunamadı</td></tr>`
    return satirlar.map((s) => `<tr>${s.map((h) => `<td>${h}</td>`).join('')}</tr>`).join('')
  }

  let icerik = ''

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
        <div class="bolum-baslik">Görüşmeler (${gorusmeler.length})</div>
        <table>
          <thead><tr><th>Aktv. No</th><th>Firma</th><th>Muhatap</th><th>Konu</th><th>Görüşen</th><th>Tarih</th><th>Durum</th></tr></thead>
          <tbody>${satirOlustur(gorusmeler.map((g) => [
            g.aktNo || '—', g.firmaAdi || '—', g.muhatapAd || '—',
            g.konu || '—', g.gorusen || '—', g.tarih || '—',
            badgeRenk('durumGorusme', g.durum),
          ]), 7)}</tbody>
        </table>
      </div>`
  }
  if (seciliModuller.teklifler) {
    icerik += `
      <div class="bolum">
        <div class="bolum-baslik">Teklifler (${teklifler.length})</div>
        <table>
          <thead><tr><th>No</th><th>Müşteri</th><th>Firma</th><th>Hazırlayan</th><th>Tutar</th><th>Tarih</th><th>Durum</th></tr></thead>
          <tbody>${satirOlustur(teklifler.map((t) => [
            t.teklifNo || '—', t.musteriAd || '—', t.firmaAdi || '—',
            t.hazirlayan || '—', formatPara(t.genelToplam), formatTarih(t.tarih),
            badgeRenk('durumTeklif', t.onayDurumu),
          ]), 7)}</tbody>
        </table>
      </div>`
  }
  if (seciliModuller.servis) {
    icerik += `
      <div class="bolum">
        <div class="bolum-baslik">Servis Talepleri (${servis.length})</div>
        <table>
          <thead><tr><th>No</th><th>Müşteri / Firma</th><th>Tür</th><th>Konu</th><th>Aciliyet</th><th>Tarih</th><th>Durum</th></tr></thead>
          <tbody>${satirOlustur(servis.map((s) => [
            s.talepNo || '—',
            `${s.musteriAd || '—'}${s.firmaAdi ? ' / ' + s.firmaAdi : ''}`,
            s.anaTur || '—', (s.konu || '—').substring(0, 30),
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
        <div class="bolum-baslik">Görevler (${gorevler.length})</div>
        <table>
          <thead><tr><th>Başlık</th><th>Atanan</th><th>Öncelik</th><th>Son Tarih</th><th>Oluşturan</th><th>Durum</th></tr></thead>
          <tbody>${satirOlustur(gorevler.map((g) => [
            (g.baslik || '—').substring(0, 35),
            g.atananAd || g.atanan || '—',
            badgeRenk('oncelik', g.oncelik),
            g.sonTarih || '—', g.olusturanAd || '—',
            badgeRenk('durumGorev', g.durum),
          ]), 6)}</tbody>
        </table>
      </div>`
  }
  if (seciliModuller.musteriler) {
    icerik += `
      <div class="bolum">
        <div class="bolum-baslik">Yeni Müşteriler (${musteriler.length})</div>
        <table>
          <thead><tr><th>Müşteri Kodu</th><th>Ad Soyad</th><th>Firma</th><th>Unvan</th><th>Telefon</th><th>Şehir</th><th>Durum</th></tr></thead>
          <tbody>${satirOlustur(musteriler.map((m) => [
            m.kod || '—',
            `${m.ad || ''} ${m.soyad || ''}`.trim() || '—',
            m.firma || '—', m.unvan || '—',
            m.telefon || '—', m.sehir || '—', m.durum || '—',
          ]), 7)}</tbody>
        </table>
      </div>`
  }
  if (seciliModuller.stok) {
    icerik += `
      <div class="bolum">
        <div class="bolum-baslik">Stok Hareketleri (${stok.length})</div>
        <table>
          <thead><tr><th>Stok Kodu</th><th>Ürün Adı</th><th>Tür</th><th>Miktar</th><th>Birim</th><th>Belge No</th><th>Tarih</th></tr></thead>
          <tbody>${satirOlustur(stok.map((h) => [
            h.stokKodu || '—',
            (h.stokAdi || '—').substring(0, 30),
            h.tur === 'giris'
              ? '<span class="badge" style="background:#E8F3EC;color:#2F7D4F">Giriş</span>'
              : '<span class="badge" style="background:#F7E6E6;color:#B23A3A">Çıkış</span>',
            h.miktar || '—', h.birim || '—',
            h.belgeNo || '—', formatTarih(h.tarih),
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
      <div style="font-size:10px;color:#4A5A6E">Yönetim Sistemi</div>
    </div>
    <div style="text-align:right">
      <div class="baslik">Faaliyet Raporu</div>
      <div class="alt-baslik">Dönem: ${aralikEtiketi} &nbsp;|&nbsp; Oluşturma: ${new Date().toLocaleString('tr-TR')}</div>
    </div>
  </div>
  ${icerik}
</body></html>`
}

// ─── Excel üretici (aynen korundu) ──
function excelIndir({ aralikEtiketi, gorusmeler, teklifler, servis, gorevler, musteriler, stok, kullanicilar, seciliModuller }) {
  const wb = XLSX.utils.book_new()
  if (seciliModuller.gorusmeler && gorusmeler.length) {
    const veri = gorusmeler.map(g => ({
      'Aktivite No': g.aktNo || '', 'Firma': g.firmaAdi || '',
      'Muhatap': g.muhatapAd || '', 'Konu': g.konu || '',
      'Görüşen': g.gorusen || '', 'Tarih': g.tarih || '',
      'Durum': g.durum || '', 'Takip Notu': g.takipNotu || '',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(veri), 'Görüşmeler')
  }
  if (seciliModuller.teklifler && teklifler.length) {
    const veri = teklifler.map(t => ({
      'Teklif No': t.teklifNo || '', 'Müşteri': t.musteriAd || '',
      'Firma': t.firmaAdi || '', 'Hazırlayan': t.hazirlayan || '',
      'Tutar (₺)': t.genelToplam || 0, 'Tarih': formatTarih(t.tarih),
      'Durum': t.onayDurumu || '',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(veri), 'Teklifler')
  }
  if (seciliModuller.servis && servis.length) {
    const veri = servis.map(s => ({
      'Talep No': s.talepNo || '', 'Müşteri': s.musteriAd || '',
      'Firma': s.firmaAdi || '', 'Tür': s.anaTur || '',
      'Konu': s.konu || '', 'Aciliyet': s.aciliyet || '',
      'Tarih': formatTarih(s.olusturmaTarihi), 'Durum': s.durum || '',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(veri), 'Servis Talepleri')
  }
  if (seciliModuller.gorevler && gorevler.length) {
    const veri = gorevler.map(g => {
      const atanan = kullanicilar.find(k => k.id?.toString() === g.atanan)
      return {
        'Başlık': g.baslik || '', 'Atanan': atanan?.ad || g.atanan || '',
        'Öncelik': g.oncelik || '', 'Son Tarih': g.sonTarih || '',
        'Oluşturan': g.olusturanAd || '', 'Oluşturma': formatTarih(g.olusturmaTarih),
        'Durum': g.durum || '',
      }
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(veri), 'Görevler')
  }
  if (seciliModuller.musteriler && musteriler.length) {
    const veri = musteriler.map(m => ({
      'Kod': m.kod || '', 'Ad': m.ad || '', 'Soyad': m.soyad || '',
      'Firma': m.firma || '', 'Unvan': m.unvan || '',
      'Telefon': m.telefon || '', 'E-posta': m.email || '',
      'Şehir': m.sehir || '', 'Durum': m.durum || '',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(veri), 'Müşteriler')
  }
  if (seciliModuller.stok && stok.length) {
    const veri = stok.map(h => ({
      'Stok Kodu': h.stokKodu || '', 'Ürün Adı': h.stokAdi || '',
      'Tür': h.tur || '', 'Miktar': h.miktar || 0,
      'Birim': h.birim || '', 'Belge No': h.belgeNo || '',
      'Tarih': formatTarih(h.tarih),
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(veri), 'Stok Hareketleri')
  }
  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 'Bilgi': 'Seçilen dönemde veri bulunamadı' }]), 'Rapor')
  }
  XLSX.writeFile(wb, `ZNA_Rapor_${aralikEtiketi.replace(/\s|\/|-/g, '_')}.xlsx`)
}

const aralikSecenekleri = [
  { id: 'bugun',    isim: 'Bugün' },
  { id: 'bu_hafta', isim: 'Bu Hafta' },
  { id: 'bu_ay',    isim: 'Bu Ay' },
  { id: 'bu_yil',   isim: 'Bu Yıl' },
  { id: 'ozel',     isim: 'Özel Aralık' },
]

const modulListesi = [
  { id: 'gorusmeler', isim: 'Görüşmeler',       C: Phone },
  { id: 'teklifler',  isim: 'Teklifler',        C: Briefcase },
  { id: 'servis',     isim: 'Servis Talepleri', C: Wrench },
  { id: 'gorevler',   isim: 'Görevler',         C: CheckSquare },
  { id: 'musteriler', isim: 'Yeni Müşteriler',  C: Users },
  { id: 'stok',       isim: 'Stok Hareketleri', C: Package },
]

const ACIL_TONE   = { acil: 'kayip', yuksek: 'beklemede', normal: 'lead', dusuk: 'neutral' }
const ONCELIK_TONE = { dusuk: 'pasif', orta: 'beklemede', yuksek: 'kayip' }
const DURUM_GORUSME_TONE = { acik: 'acik', beklemede: 'beklemede', kapali: 'kapali' }
const DURUM_GORUSME_ISIM = { acik: 'Açık', beklemede: 'Beklemede', kapali: 'Kapalı' }
const DURUM_TEKLIF_TONE = { takipte: 'lead', kabul: 'aktif', vazgecildi: 'kayip', revizyon: 'beklemede' }
const DURUM_TEKLIF_ISIM = { takipte: 'Takipte', kabul: 'Kabul', vazgecildi: 'Vazgeçildi', revizyon: 'Revizyon' }
const DURUM_SERVIS_TONE = {
  bekliyor: 'pasif', inceleniyor: 'beklemede', atandi: 'lead',
  devam_ediyor: 'beklemede', tamamlandi: 'aktif', iptal: 'kayip',
}
const DURUM_SERVIS_ISIM = {
  bekliyor: 'Bekliyor', inceleniyor: 'İnceleniyor', atandi: 'Atandı',
  devam_ediyor: 'Devam Ediyor', tamamlandi: 'Tamamlandı', iptal: 'İptal',
}
const DURUM_GOREV_TONE = { bekliyor: 'pasif', devam: 'beklemede', tamamlandi: 'aktif' }
const DURUM_GOREV_ISIM = { bekliyor: 'Bekliyor', devam: 'Devam Ediyor', tamamlandi: 'Tamamlandı' }
const ONCELIK_ISIM = { dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek' }

export default function RaporMerkezi() {
  const { kullanicilar } = useAuth()

  const bugun = new Date()
  const [aralik, setAralik] = useState('bu_ay')
  const [ozelBas, setOzelBas] = useState(new Date(bugun.getFullYear(), bugun.getMonth(), 1).toISOString().split('T')[0])
  const [ozelBit, setOzelBit] = useState(bugun.toISOString().split('T')[0])
  const [seciliModuller, setSeciliModuller] = useState({
    gorusmeler: true, teklifler: true, servis: true,
    gorevler: true, musteriler: true, stok: true,
  })
  const [yukleniyor, setYukleniyor] = useState(false)

  const [tumVeri, setTumVeri] = useState({
    gorusmeler: [], teklifler: [], servis: [], gorevler: [],
    musteriler: [], stokHareketler: [], stokUrunler: [],
  })
  const [veriYukleniyor, setVeriYukleniyor] = useState(true)

  useEffect(() => {
    Promise.all([
      gorusmeleriGetir(), teklifleriGetir(), servisTalepleriniGetir(),
      gorevleriGetir(), musterileriGetir(), stokHareketleriniGetir(), stokUrunleriniGetir(),
    ]).then(([g, t, s, gv, m, sh, su]) => {
      setTumVeri({
        gorusmeler: g || [], teklifler: t || [], servis: s || [], gorevler: gv || [],
        musteriler: m || [], stokHareketler: sh || [], stokUrunler: su || [],
      })
      setVeriYukleniyor(false)
    }).catch(e => { console.error('Rapor verisi yüklenemedi:', e); setVeriYukleniyor(false) })
  }, [])

  const [bas, bit] = useMemo(() => aralikHesapla(aralik, ozelBas, ozelBit), [aralik, ozelBas, ozelBit])

  const aralikEtiketi = useMemo(() => {
    if (aralik === 'ozel') return `${ozelBas} / ${ozelBit}`
    return aralikSecenekleri.find(a => a.id === aralik)?.isim || ''
  }, [aralik, ozelBas, ozelBit])

  const veri = useMemo(() => {
    const stokSon = tumVeri.stokHareketler
      .filter(h => tarihFiltrele(h.tarih, bas, bit))
      .map(h => {
        const urun = tumVeri.stokUrunler.find(u => u.stokKodu === h.stokKodu)
        return { ...h, stokAdi: urun?.stokAdi || h.stokKodu }
      })
    const gorevSon = tumVeri.gorevler
      .filter(g => tarihFiltrele(g.olusturmaTarih, bas, bit))
      .map(g => {
        const atanan = (kullanicilar || []).find(k => k.id?.toString() === String(g.atanan))
        return { ...g, atananAd: atanan?.ad || '' }
      })
    return {
      gorusmeler: tumVeri.gorusmeler.filter(g => tarihFiltrele(g.tarih, bas, bit) || tarihFiltrele(g.olusturmaTarih, bas, bit)),
      teklifler:  tumVeri.teklifler.filter(t => tarihFiltrele(t.tarih, bas, bit) || tarihFiltrele(t.olusturmaTarih, bas, bit)),
      servis:     tumVeri.servis.filter(s => tarihFiltrele(s.olusturmaTarihi || s.olusturmaTarih, bas, bit)),
      gorevler:   gorevSon,
      musteriler: tumVeri.musteriler.filter(m => tarihFiltrele(m.olusturmaTarih, bas, bit)),
      stok:       stokSon,
    }
  }, [bas, bit, kullanicilar, tumVeri])

  const modulDegistir = (id) => setSeciliModuller(prev => ({ ...prev, [id]: !prev[id] }))

  const pdfIndirAction = () => {
    setYukleniyor(true)
    setTimeout(() => {
      const html = pdfUret({ aralikEtiketi, ...veri, seciliModuller })
      const w = window.open('', '_blank')
      w.document.write(html); w.document.close(); w.focus()
      setTimeout(() => { w.print(); setYukleniyor(false) }, 400)
    }, 100)
  }

  const excelIndirAction = () => excelIndir({ aralikEtiketi, ...veri, kullanicilar, seciliModuller })

  const toplamKayit = Object.entries(veri)
    .filter(([k]) => seciliModuller[k])
    .reduce((s, [, v]) => s + v.length, 0)

  if (veriYukleniyor) {
    return (
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <EmptyState icon={<BarChart3 size={32} strokeWidth={1.5} />} title="Veriler yükleniyor…" />
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Rapor Merkezi</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            Seçilen dönem: <span style={{ color: 'var(--brand-primary)', fontWeight: 500 }}>{aralikEtiketi}</span>
            <> · </>
            <span className="tabular-nums">{toplamKayit}</span> kayıt seçildi
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" iconLeft={<FileSpreadsheet size={14} strokeWidth={1.5} />} onClick={excelIndirAction}>
            Excel indir
          </Button>
          <Button variant="primary" iconLeft={<FileText size={14} strokeWidth={1.5} />} onClick={pdfIndirAction} disabled={yukleniyor}>
            {yukleniyor ? 'Hazırlanıyor…' : 'PDF indir'}
          </Button>
        </div>
      </div>

      {/* Dönem Seçici */}
      <Card style={{ marginBottom: 16 }}>
        <p className="t-label" style={{ marginBottom: 12 }}>DÖNEM SEÇ</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: aralik === 'ozel' ? 16 : 0 }}>
          {aralikSecenekleri.map(a => {
            const active = aralik === a.id
            return (
              <button
                key={a.id}
                onClick={() => setAralik(a.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: active ? 'var(--brand-primary)' : 'var(--surface-card)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                  font: '500 13px/18px var(--font-sans)',
                  cursor: 'pointer',
                }}
              >
                {a.isim}
              </button>
            )
          })}
        </div>

        {aralik === 'ozel' && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <label className="t-label" style={{ display: 'block', marginBottom: 4 }}>BAŞLANGIÇ</label>
              <input
                type="date"
                value={ozelBas}
                onChange={e => setOzelBas(e.target.value)}
                style={{
                  height: 36, padding: '0 12px',
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  font: '400 14px/20px var(--font-sans)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </div>
            <span style={{ color: 'var(--text-tertiary)', marginBottom: 10 }}>→</span>
            <div>
              <label className="t-label" style={{ display: 'block', marginBottom: 4 }}>BİTİŞ</label>
              <input
                type="date"
                value={ozelBit}
                onChange={e => setOzelBit(e.target.value)}
                style={{
                  height: 36, padding: '0 12px',
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  font: '400 14px/20px var(--font-sans)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </div>
          </div>
        )}
      </Card>

      {/* Modül Seçici */}
      <Card style={{ marginBottom: 16 }}>
        <p className="t-label" style={{ marginBottom: 12 }}>RAPORA DAHİL EDİLECEK MODÜLLER</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {modulListesi.map(m => {
            const aktif = seciliModuller[m.id]
            const sayac = veri[m.id]?.length || 0
            const IconC = m.C
            return (
              <button
                key={m.id}
                onClick={() => modulDegistir(m.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                  background: aktif ? 'var(--brand-primary-soft)' : 'var(--surface-sunken)',
                  border: `1px solid ${aktif ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{
                  width: 20, height: 20, borderRadius: 'var(--radius-sm)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: aktif ? 'var(--brand-primary)' : 'var(--surface-card)',
                  border: aktif ? 'none' : '1px solid var(--border-default)',
                  color: '#fff', flexShrink: 0,
                }}>
                  {aktif && <Check size={12} strokeWidth={2.5} />}
                </span>
                <IconC size={16} strokeWidth={1.5} style={{ color: aktif ? 'var(--brand-primary)' : 'var(--text-secondary)' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ font: '500 13px/18px var(--font-sans)', color: aktif ? 'var(--brand-primary)' : 'var(--text-primary)', margin: 0 }}>
                    {m.isim}
                  </p>
                  <p className="t-caption" style={{ marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{sayac} kayıt</p>
                </div>
              </button>
            )
          })}
        </div>
      </Card>

      {/* Özet */}
      <Card style={{ marginBottom: 16 }}>
        <p className="t-label" style={{ marginBottom: 12 }}>ÖZET — {aralikEtiketi}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <KPICard label="Görüşme"      value={veri.gorusmeler.length} icon={<Phone size={14} strokeWidth={1.5} />} />
          <KPICard label="Teklif"       value={veri.teklifler.length}  icon={<Briefcase size={14} strokeWidth={1.5} />} />
          <KPICard label="Servis Talebi" value={veri.servis.length}    icon={<Wrench size={14} strokeWidth={1.5} />} />
          <KPICard label="Görev"        value={veri.gorevler.length}   icon={<CheckSquare size={14} strokeWidth={1.5} />} />
          <KPICard label="Yeni Müşteri" value={veri.musteriler.length} icon={<Users size={14} strokeWidth={1.5} />} />
          <KPICard label="Kabul Teklif" value={veri.teklifler.filter(t => t.onayDurumu === 'kabul').length} footer={<span style={{ color: 'var(--success)' }}>Onaylandı</span>} />
          <KPICard label="Tam. Servis"  value={veri.servis.filter(s => s.durum === 'tamamlandi').length} footer={<span style={{ color: 'var(--success)' }}>Kapalı</span>} />
          <KPICard
            label="Kabul Tutar"
            value={formatPara(veri.teklifler.filter(t => t.onayDurumu === 'kabul').reduce((s, t) => s + (t.genelToplam || 0), 0))}
            footer={<span style={{ color: 'var(--success)' }}>Gelir</span>}
          />
        </div>
      </Card>

      {/* Modül Tabloları */}
      {modulListesi.filter(m => seciliModuller[m.id]).map(modul => {
        const kayitlar = veri[modul.id]
        const IconC = modul.C
        return (
          <Card key={modul.id} padding={0} style={{ marginBottom: 12 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 20px',
              borderBottom: '1px solid var(--border-default)',
            }}>
              <p style={{ display: 'inline-flex', alignItems: 'center', gap: 8, font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>
                <IconC size={14} strokeWidth={1.5} style={{ color: 'var(--text-secondary)' }} />
                {modul.isim}
              </p>
              <Badge tone="brand"><span className="tabular-nums">{kayitlar.length}</span> kayıt</Badge>
            </div>

            {kayitlar.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', font: '400 13px/18px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                Bu dönemde {modul.isim.toLowerCase()} kaydı bulunamadı.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <TabloBilesenler modul={modul.id} kayitlar={kayitlar} />
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th style={{
      background: 'var(--surface-sunken)',
      padding: '10px 14px',
      textAlign: align,
      font: '600 11px/16px var(--font-sans)',
      color: 'var(--text-tertiary)',
      textTransform: 'uppercase', letterSpacing: '0.04em',
      borderBottom: '1px solid var(--border-default)',
      whiteSpace: 'nowrap',
    }}>{children}</th>
  )
}

function Td({ children, align = 'left', style, ...rest }) {
  return (
    <td
      style={{
        padding: '10px 14px',
        textAlign: align,
        font: '400 13px/18px var(--font-sans)',
        color: 'var(--text-primary)',
        borderBottom: '1px solid var(--border-default)',
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >{children}</td>
  )
}

function TabloBilesenler({ modul, kayitlar }) {
  const rowHover = {
    onMouseEnter: e => e.currentTarget.style.background = 'var(--surface-sunken)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent',
  }
  const tableStyle = { width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontVariantNumeric: 'tabular-nums' }

  if (modul === 'gorusmeler') {
    return (
      <table style={tableStyle}>
        <thead><tr>
          <Th>Aktv. No</Th><Th>Firma</Th><Th>Muhatap</Th><Th>Konu</Th>
          <Th>Görüşen</Th><Th>Tarih</Th><Th>Durum</Th>
        </tr></thead>
        <tbody>{kayitlar.slice(0, 50).map(g => (
          <tr key={g.id} style={{ transition: 'background 120ms' }} {...rowHover}>
            <Td><CodeBadge>{g.aktNo}</CodeBadge></Td>
            <Td><span style={{ fontWeight: 500 }}>{g.firmaAdi || '—'}</span></Td>
            <Td>{g.muhatapAd || '—'}</Td>
            <Td><Badge tone="brand">{g.konu}</Badge></Td>
            <Td>{g.gorusen || '—'}</Td>
            <Td>{g.tarih || '—'}</Td>
            <Td>{g.durum && <Badge tone={DURUM_GORUSME_TONE[g.durum] || 'neutral'}>{DURUM_GORUSME_ISIM[g.durum] || g.durum}</Badge>}</Td>
          </tr>
        ))}</tbody>
      </table>
    )
  }

  if (modul === 'teklifler') {
    return (
      <table style={tableStyle}>
        <thead><tr>
          <Th>Teklif No</Th><Th>Müşteri</Th><Th>Firma</Th>
          <Th>Hazırlayan</Th><Th align="right">Tutar</Th><Th>Tarih</Th><Th>Durum</Th>
        </tr></thead>
        <tbody>{kayitlar.slice(0, 50).map(t => (
          <tr key={t.id} style={{ transition: 'background 120ms' }} {...rowHover}>
            <Td><CodeBadge>{t.teklifNo}</CodeBadge></Td>
            <Td><span style={{ fontWeight: 500 }}>{t.musteriAd || '—'}</span></Td>
            <Td>{t.firmaAdi || '—'}</Td>
            <Td>{t.hazirlayan || '—'}</Td>
            <Td align="right" style={{ fontWeight: 600, color: 'var(--brand-primary)' }}>{formatPara(t.genelToplam)}</Td>
            <Td>{formatTarih(t.tarih)}</Td>
            <Td>{t.onayDurumu && <Badge tone={DURUM_TEKLIF_TONE[t.onayDurumu] || 'neutral'}>{DURUM_TEKLIF_ISIM[t.onayDurumu] || t.onayDurumu}</Badge>}</Td>
          </tr>
        ))}</tbody>
      </table>
    )
  }

  if (modul === 'servis') {
    return (
      <table style={tableStyle}>
        <thead><tr>
          <Th>Talep No</Th><Th>Müşteri</Th><Th>Tür</Th>
          <Th>Konu</Th><Th>Aciliyet</Th><Th>Tarih</Th><Th>Durum</Th>
        </tr></thead>
        <tbody>{kayitlar.slice(0, 50).map(s => (
          <tr key={s.id} style={{ transition: 'background 120ms' }} {...rowHover}>
            <Td><CodeBadge>{s.talepNo}</CodeBadge></Td>
            <Td>
              <div style={{ fontWeight: 500 }}>{s.musteriAd || '—'}</div>
              {s.firmaAdi && <div className="t-caption" style={{ marginTop: 2 }}>{s.firmaAdi}</div>}
            </Td>
            <Td>{s.anaTur || '—'}</Td>
            <Td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.konu || '—'}</Td>
            <Td>{s.aciliyet && <Badge tone={ACIL_TONE[s.aciliyet] || 'neutral'}>{s.aciliyet}</Badge>}</Td>
            <Td>{formatTarih(s.olusturmaTarihi)}</Td>
            <Td>{s.durum && <Badge tone={DURUM_SERVIS_TONE[s.durum] || 'neutral'}>{DURUM_SERVIS_ISIM[s.durum] || s.durum}</Badge>}</Td>
          </tr>
        ))}</tbody>
      </table>
    )
  }

  if (modul === 'gorevler') {
    return (
      <table style={tableStyle}>
        <thead><tr>
          <Th>Başlık</Th><Th>Atanan</Th><Th>Öncelik</Th>
          <Th>Son Tarih</Th><Th>Oluşturan</Th><Th>Durum</Th>
        </tr></thead>
        <tbody>{kayitlar.slice(0, 50).map(g => (
          <tr key={g.id} style={{ transition: 'background 120ms' }} {...rowHover}>
            <Td><span style={{ fontWeight: 500 }}>{g.baslik || '—'}</span></Td>
            <Td>{g.atananAd || '—'}</Td>
            <Td>{g.oncelik && <Badge tone={ONCELIK_TONE[g.oncelik] || 'neutral'}>{ONCELIK_ISIM[g.oncelik] || g.oncelik}</Badge>}</Td>
            <Td>{g.sonTarih || '—'}</Td>
            <Td>{g.olusturanAd || '—'}</Td>
            <Td>{g.durum && <Badge tone={DURUM_GOREV_TONE[g.durum] || 'neutral'}>{DURUM_GOREV_ISIM[g.durum] || g.durum}</Badge>}</Td>
          </tr>
        ))}</tbody>
      </table>
    )
  }

  if (modul === 'musteriler') {
    return (
      <table style={tableStyle}>
        <thead><tr>
          <Th>Kod</Th><Th>Ad Soyad</Th><Th>Firma</Th><Th>Unvan</Th>
          <Th>Telefon</Th><Th>Şehir</Th><Th>Durum</Th>
        </tr></thead>
        <tbody>{kayitlar.slice(0, 50).map(m => (
          <tr key={m.id} style={{ transition: 'background 120ms' }} {...rowHover}>
            <Td><CodeBadge>{m.kod}</CodeBadge></Td>
            <Td><span style={{ fontWeight: 500 }}>{m.ad} {m.soyad}</span></Td>
            <Td>{m.firma || '—'}</Td>
            <Td>{m.unvan || '—'}</Td>
            <Td>{m.telefon || '—'}</Td>
            <Td>{m.sehir || '—'}</Td>
            <Td><span style={{ textTransform: 'capitalize', color: 'var(--text-secondary)' }}>{m.durum || '—'}</span></Td>
          </tr>
        ))}</tbody>
      </table>
    )
  }

  if (modul === 'stok') {
    return (
      <table style={tableStyle}>
        <thead><tr>
          <Th>Stok Kodu</Th><Th>Ürün Adı</Th><Th>Tür</Th>
          <Th align="right">Miktar</Th><Th>Birim</Th><Th>Belge No</Th><Th>Tarih</Th>
        </tr></thead>
        <tbody>{kayitlar.slice(0, 50).map((h, i) => (
          <tr key={i} style={{ transition: 'background 120ms' }} {...rowHover}>
            <Td><CodeBadge>{h.stokKodu}</CodeBadge></Td>
            <Td>{h.stokAdi || '—'}</Td>
            <Td>
              {h.tur === 'giris'
                ? <Badge tone="aktif" icon={<ArrowUp size={11} strokeWidth={2} />}>Giriş</Badge>
                : <Badge tone="kayip" icon={<ArrowDown size={11} strokeWidth={2} />}>Çıkış</Badge>}
            </Td>
            <Td align="right" style={{ fontWeight: 600 }}>{h.miktar}</Td>
            <Td>{h.birim || '—'}</Td>
            <Td>{h.belgeNo || '—'}</Td>
            <Td>{formatTarih(h.tarih)}</Td>
          </tr>
        ))}</tbody>
      </table>
    )
  }

  return null
}
