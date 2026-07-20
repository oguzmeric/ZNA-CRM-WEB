// Keşif Detayı — bilgiler + malzeme listesi + fotoğraflar + dönüşümler.
// Dönüşümler: Teklife Aktar (kalemler teklif satırlarına), Görev Oluştur,
// Servis Talebi Oluştur — oluşan kayıtların id'leri keşfe geri bağlanır.

import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, MapPin, Compass, FileText, CheckSquare, Wrench, Camera,
  Plus, Trash2, Save, Upload, X, Printer, Eye,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import {
  kesifGetir, kesifGuncelle, kesifSil,
  kesifKalemleriGetir, kesifKalemEkle, kesifKalemSil,
  kesifFotolariGetir, kesifFotoUrlleri, kesifFotoEtiketBilgi,
  kesifKrokileriGetir, krokiSembolBilgi,
  KROKI_KATEGORILER, KROKI_SEMBOLLERI, KROKI_SEMBOL_PATH, sembolleriSay,
  KESIF_KATEGORILERI, KESIF_DURUMLARI,
  KESIF_ONCELIKLERI, KESIF_TURLERI,
} from '../services/kesifService'
import KesifFotoBolumu from '../components/kesif/KesifFotoBolumu'
import KesifKrokiBolumu from '../components/kesif/KesifKrokiBolumu'
import { stokUrunleriniGetir } from '../services/stokService'
import AkilliUrunSecici from '../components/AkilliUrunSecici'
import { gorevEkle } from '../services/gorevService'
import { servisTalepEkle, servisTalebiBildirimGonder } from '../services/servisService'
import { kesiftenMalzemePlanla } from '../services/servisMalzemeService'
import CustomSelect from '../components/CustomSelect'
import CokluSelect from '../components/CokluSelect'
import { SkeletonDetay } from '../components/Skeleton'
import {
  Button, Input, Textarea, Label, Card, Badge, CodeBadge,
  EmptyState, Modal, Table, THead, TBody, TR, TH, TD,
} from '../components/ui'

const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'
const birimler = ['Adet', 'Metre', 'Paket', 'Kutu', 'Takım', 'Saat']

// Sembol Özeti çipi ikonu — kroki tuvaliyle aynı path kaynağı
function SembolMiniIkon({ id, renk, size = 22 }) {
  const d = KROKI_SEMBOL_PATH[id]
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: renk, display: 'inline-grid', placeItems: 'center', flexShrink: 0 }}>
      {d && (
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none"
          stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={d} />
        </svg>
      )}
    </span>
  )
}

const bosKalem = {
  kategori: 'kamera', stokKodu: '', urunAdi: '', marka: '',
  miktar: 1, birim: 'Adet', notlar: '',
}

export default function KesifDetay() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { kullanici, kullanicilar } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [kesif, setKesif] = useState(null)
  const [kalemler, setKalemler] = useState([])
  const [fotolar, setFotolar] = useState([])
  const [krokiler, setKrokiler] = useState([])
  const [fotoUrlMap, setFotoUrlMap] = useState(new Map())
  const [stokUrunler, setStokUrunler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [yeniKalem, setYeniKalem] = useState({ ...bosKalem })
  const [gorevModal, setGorevModal] = useState(false)
  const [donusumCalisiyor, setDonusumCalisiyor] = useState(false)
  const [yazdirModal, setYazdirModal] = useState(false)
  const [yazdirFotoSecim, setYazdirFotoSecim] = useState('tumu') // tumu | cizimli | yok
  const [onizlemeHtml, setOnizlemeHtml] = useState(null) // rapor önizleme (iframe)

  const yukle = async () => {
    setYukleniyor(true)
    try {
      const [k, kal, fot, kro, stok] = await Promise.all([
        kesifGetir(id),
        kesifKalemleriGetir(id),
        kesifFotolariGetir(id),
        kesifKrokileriGetir(id),
        stokUrunleriniGetir(),
      ])
      setKesif(k)
      setKalemler(kal)
      setFotolar(fot)
      setKrokiler(kro)
      setStokUrunler((stok || []).filter(u => u.aktif !== false))  // pasif ürün keşfe eklenemez (mig 151)
      // Orijinal + çizimli + kroki yolları birlikte imzalanır (lightbox/çizim/yazdır kullanır)
      const urls = await kesifFotoUrlleri([
        ...fot.flatMap(f => [f.dosyaYolu, f.cizimYolu]),
        ...kro.map(x => x.gorselYolu),
      ].filter(Boolean))
      setFotoUrlMap(urls)
    } catch (e) {
      console.error('[KesifDetay]', e)
      toast.error('Keşif yüklenemedi: ' + (e?.message || 'bilinmeyen hata'))
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { yukle() }, [id])  // eslint-disable-line react-hooks/exhaustive-deps

  // Kategori bazlı özet chip'leri (📷 12 Kamera gibi)
  const kategoriOzet = useMemo(() => {
    const m = new Map()
    kalemler.forEach(k => m.set(k.kategori, (m.get(k.kategori) || 0) + Number(k.miktar || 0)))
    return KESIF_KATEGORILERI.filter(kat => m.has(kat.id)).map(kat => ({ ...kat, toplam: m.get(kat.id) }))
  }, [kalemler])

  // Sembol Özeti — kroki/foto BAZINDA kırılım (hangi katta ne var) + genel toplam
  const sembolOzet = useMemo(() => {
    const sayim = (sekiller) => {
      const m = new Map()
      for (const s of (sekiller || [])) {
        if (s.tip === 'sembol' && s.sembol) m.set(s.sembol, (m.get(s.sembol) || 0) + 1)
      }
      return m
    }
    const listele = (m) => KROKI_SEMBOLLERI.filter(s => m.has(s.id)).map(s => ({ ...s, adet: m.get(s.id) }))
    const kaynaklar = []
    krokiler.forEach((k, i) => {
      const m = sayim(k.veri?.sekiller)
      if (m.size) kaynaklar.push({
        anahtar: `k${k.id}`, tip: 'Kroki', baslik: k.baslik || `Kroki ${i + 1}`,
        semboller: listele(m), toplam: [...m.values()].reduce((a, b) => a + b, 0),
      })
    })
    fotolar.forEach((f, i) => {
      const m = sayim(f.cizimVeri?.sekiller)
      if (m.size) kaynaklar.push({
        anahtar: `f${f.id}`, tip: 'Foto', baslik: f.baslik || f.mahal || `Fotoğraf ${i + 1}`,
        semboller: listele(m), toplam: [...m.values()].reduce((a, b) => a + b, 0),
      })
    })
    const say = sembolleriSay(krokiler, fotolar)
    const gruplar = KROKI_KATEGORILER.map(kat => ({
      ...kat,
      semboller: KROKI_SEMBOLLERI
        .filter(s => s.kategori === kat.id && say.has(s.id))
        .map(s => ({ ...s, adet: say.get(s.id) })),
    })).filter(g => g.semboller.length)
    const toplam = [...say.values()].reduce((a, b) => a + b, 0)
    return { kaynaklar, gruplar, toplam }
  }, [krokiler, fotolar])

  const kalemOzetMetni = () => kalemler
    .map(k => `• ${k.miktar} ${k.birim} — ${k.urunAdi}${k.marka ? ` (${k.marka})` : ''}${k.notlar ? ` · ${k.notlar}` : ''}`)
    .join('\n')

  if (yukleniyor) return <SkeletonDetay />
  if (!kesif) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <EmptyState title="Keşif bulunamadı" icon={<Compass size={28} />} />
        <Button variant="primary" style={{ marginTop: 12 }} onClick={() => navigate('/kesifler')}>Keşiflere Dön</Button>
      </div>
    )
  }

  const durum = KESIF_DURUMLARI.find(d => d.id === kesif.durum)

  const bilgiKaydet = async () => {
    setKaydediliyor(true)
    try {
      await kesifGuncelle(id, {
        firmaAdi: kesif.firmaAdi,
        projeAdi: kesif.projeAdi,
        kesifBasligi: kesif.kesifBasligi,
        lokasyon: kesif.lokasyon,
        musteriYetkilisi: kesif.musteriYetkilisi,
        yetkiliTelefon: kesif.yetkiliTelefon,
        yetkiliEmail: kesif.yetkiliEmail,
        satisPersoneli: kesif.satisPersoneli,
        // haritaKonumu + rakipFirma UI'dan kaldırıldı (kullanılmıyor) — kolonlar DB'de duruyor
        oncelik: kesif.oncelik || 'normal',
        kesifTarihi: kesif.kesifTarihi,
        tahminiProjeTarihi: kesif.tahminiProjeTarihi || null,
        kesfiYapan: kesif.kesfiYapan,
        genelNot: kesif.genelNot,
        ozelTalepler: kesif.ozelTalepler,
        mevcutSistem: kesif.mevcutSistem,
        icNotlar: kesif.icNotlar,
        turler: kesif.turler || [],
        teknikDetaylar: kesif.teknikDetaylar || {},
        durum: kesif.durum,
      })
      toast.success('Keşif kaydedildi.')
    } catch (e) {
      toast.error('Kaydedilemedi: ' + (e?.message || 'bilinmeyen hata'))
    } finally {
      setKaydediliyor(false)
    }
  }

  const teknikNotDegistir = (turId, metin) => {
    setKesif(k => ({ ...k, teknikDetaylar: { ...(k.teknikDetaylar || {}), [turId]: metin } }))
  }

  const kalemKaydet = async () => {
    if (!yeniKalem.urunAdi.trim()) { toast.warning('Ürün adı girin.'); return }
    try {
      const eklenen = await kesifKalemEkle({
        ...yeniKalem,
        kesifId: Number(id),
        miktar: Number(yeniKalem.miktar) || 1,
        siralama: kalemler.length,
      })
      setKalemler(prev => [...prev, eklenen])
      setYeniKalem({ ...bosKalem, kategori: yeniKalem.kategori })
    } catch (e) {
      toast.error('Kalem eklenemedi: ' + (e?.message || 'bilinmeyen hata'))
    }
  }

  const kalemKaldir = async (k) => {
    try {
      await kesifKalemSil(k.id)
      setKalemler(prev => prev.filter(x => x.id !== k.id))
    } catch (e) {
      toast.error('Silinemedi: ' + (e?.message || 'bilinmeyen hata'))
    }
  }

  const stokSec = (kod) => {
    const u = stokUrunler.find(x => x.stokKodu === kod)
    setYeniKalem(v => ({
      ...v, stokKodu: kod,
      urunAdi: u ? u.stokAdi : v.urunAdi,
      marka: u?.marka || v.marka,
      birim: u?.birim || v.birim,
    }))
  }

  // ── Rapor HTML üreticisi (önizleme + yazdır ortak) ─────────────────────
  const raporHtmlUret = (printTetikle = false) => {
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const yazFotolar = yazdirFotoSecim === 'yok' ? []
      : yazdirFotoSecim === 'cizimli' ? fotolar.filter(f => f.cizimYolu)
      : fotolar
    const oncelikAd = KESIF_ONCELIKLERI.find(o => o.id === (kesif.oncelik || 'normal'))?.ad
    const durumAd = KESIF_DURUMLARI.find(d => d.id === kesif.durum)?.ad
    const bilgi = [
      ['Müşteri', kesif.firmaAdi], ['Proje', kesif.projeAdi], ['Keşif Adresi', kesif.lokasyon],
      ['Müşteri Yetkilisi', kesif.musteriYetkilisi], ['Yetkili Telefon', kesif.yetkiliTelefon],
      ['Yetkili E-posta', kesif.yetkiliEmail], ['İlgili Satış Personeli', kesif.satisPersoneli],
      ['Keşfi Yapan', kesif.kesfiYapan], ['Keşif Tarihi', kesif.kesifTarihi && fmtTarih(kesif.kesifTarihi)],
      ['Tahmini Proje Tarihi', kesif.tahminiProjeTarihi && fmtTarih(kesif.tahminiProjeTarihi)],
      ['Öncelik', oncelikAd], ['Durum', durumAd],
    ].filter(([, v]) => v)
    // Keşif türleri + türe özel teknik detaylar
    const turBlok = (kesif.turler || []).map(tid => {
      const t = KESIF_TURLERI.find(x => x.id === tid)
      const detay = (kesif.teknikDetaylar || {})[tid]
      return `<div class="tur"><strong>${esc(t?.ad || tid)}</strong>${detay ? `<div class="mut">${esc(detay)}</div>` : ''}</div>`
    }).join('')
    const kalemSatir = kalemler.map(k =>
      `<tr><td>${esc(KESIF_KATEGORILERI.find(x => x.id === k.kategori)?.ad || k.kategori)}</td><td>${esc(k.urunAdi)}${k.marka ? ` <span class="mut">(${esc(k.marka)})</span>` : ''}</td><td class="sag">${esc(k.miktar)} ${esc(k.birim)}</td><td>${esc(k.notlar || '')}</td></tr>`
    ).join('')
    const fotoBlok = yazFotolar.map(f => {
      // Doküman: varsa çizimli hali basılır
      const url = fotoUrlMap.get(f.cizimYolu) || fotoUrlMap.get(f.dosyaYolu)
      if (!url) return ''
      // Fotoya yerleştirilen semboller — kroki gibi lejant basılır
      const fotoLejant = (f.cizimVeri?.sekiller || []).filter(s => s.tip === 'sembol').map(s => {
        const b = krokiSembolBilgi(s.sembol)
        return `<span class="lj"><span class="ljn" style="background:${b.renk}">${b.kod}${s.no}</span>${esc(b.ad)}</span>`
      }).join('')
      const satir = [
        f.aciklama && `<div>${esc(f.aciklama)}</div>`,
        f.montajNotu && `<div class="mut">Montaj: ${esc(f.montajNotu)}</div>`,
        [f.mahal, f.katBolum].filter(Boolean).length && `<div class="mut">Yer: ${esc([f.mahal, f.katBolum].filter(Boolean).join(' / '))}</div>`,
        f.etiket && `<div class="mut">Etiket: ${esc(kesifFotoEtiketBilgi(f.etiket)?.ad || f.etiket)}</div>`,
        f.kalemId && `<div class="mut">Kalem: ${esc(kalemler.find(x => String(x.id) === String(f.kalemId))?.urunAdi || '')}</div>`,
      ].filter(Boolean).join('')
      return `<div class="foto"><img src="${url}"><div class="fmeta"><strong>${esc(f.baslik || 'Fotoğraf')}</strong>${f.cizimYolu ? ' <span class="ciz">✏ çizimli</span>' : ''}${satir}${fotoLejant ? `<div class="ljs">${fotoLejant}</div>` : ''}<div class="mut">${esc(f.olusturanAd || '')} · ${esc(new Date(f.olusturmaTarih).toLocaleString('tr-TR'))}</div></div></div>`
    }).join('')
    // Krokiler: görsel + sembol lejantı + kalem bağları
    const krokiBlok = krokiler.map(k => {
      const url = fotoUrlMap.get(k.gorselYolu)
      if (!url) return ''
      const semboller = (k.veri?.sekiller || []).filter(s => s.tip === 'sembol')
      const lejant = semboller.map(s => {
        const b = krokiSembolBilgi(s.sembol)
        const kalem = s.kalemId ? kalemler.find(x => String(x.id) === String(s.kalemId)) : null
        return `<span class="lj"><span class="ljn" style="background:${b.renk}">${b.kod}${s.no}</span>${esc(b.ad)}${kalem ? ` → ${esc(kalem.urunAdi)}` : ''}</span>`
      }).join('')
      return `<div class="kroki"><strong>${esc(k.baslik)}</strong><img src="${url}">${lejant ? `<div class="ljs">${lejant}</div>` : ''}</div>`
    }).join('')
    const logo = `${window.location.origin}/logo.jpeg`
    const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>${esc(kesif.kesifNo)} — Keşif Raporu</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { font: 12px/1.55 -apple-system, system-ui, "Segoe UI", sans-serif; color: #1a2332; padding: 26px 28px; }
  .antet { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #014486; padding-bottom: 12px; }
  .antet img { height: 46px; width: auto; }
  .antet .marka { flex: 1; }
  .antet .marka b { display: block; font-size: 18px; font-weight: 800; color: #014486; letter-spacing: .3px; }
  .antet .marka span { font-size: 10.5px; font-weight: 700; color: #64748b; letter-spacing: 2.5px; }
  .antet .no { text-align: right; font-size: 11px; color: #64748b; }
  .antet .no b { display: block; font-size: 15px; color: #1a2332; font-weight: 800; }
  h1 { font-size: 16px; margin: 14px 0 2px; color: #1a2332; }
  .alt { color: #64748b; font-size: 11.5px; }
  h2 { font-size: 12.5px; margin: 18px 0 8px; padding: 5px 10px; background: #eef3f8; border-left: 4px solid #014486; color: #014486; font-weight: 800; letter-spacing: .3px; }
  .mut { color: #64748b; }
  .bilgi { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 24px; }
  .bilgi > div { border-bottom: 1px dotted #dbe2ea; padding: 2px 0; font-size: 11.5px; }
  .bilgi b { color: #475569; }
  .metin-blok { white-space: pre-wrap; padding: 9px 11px; background: #f8fafc; border-radius: 6px; border: 1px solid #e5e9ef; font-size: 11.5px; }
  .tur { margin-bottom: 6px; font-size: 11.5px; }
  table { width: 100%; border-collapse: collapse; margin-top: 2px; font-size: 11px; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #eef3f8; color: #334155; font-weight: 700; }
  .sag { text-align: right; white-space: nowrap; }
  /* Görseller — her blok TEK PARÇA basılır, sayfa geçişinde bölünmez */
  .fgrid { margin-top: 2px; }
  .foto { display: inline-block; width: 49%; vertical-align: top; margin: 0 0 10px; border: 1px solid #d5dde6; border-radius: 7px; overflow: hidden;
          break-inside: avoid; page-break-inside: avoid; -webkit-column-break-inside: avoid; }
  .foto:nth-child(odd) { margin-right: 1.4%; }
  .foto img { width: 100%; max-height: 220px; object-fit: contain; background: #f6f8fb; display: block; }
  .fmeta { padding: 7px 9px; font-size: 10.5px; display: grid; gap: 2px; }
  .fmeta strong { font-size: 11.5px; }
  .ciz { color: #16a34a; font-weight: 700; }
  .kroki { margin-bottom: 14px; break-inside: avoid; page-break-inside: avoid; -webkit-column-break-inside: avoid; }
  .kroki > strong { font-size: 12px; }
  .kroki img { width: 100%; max-height: 400px; object-fit: contain; border: 1px solid #d5dde6; border-radius: 7px; margin-top: 4px; display: block; background: #fff; }
  .ljs { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 6px; font-size: 10.5px; }
  .lj { display: inline-flex; align-items: center; gap: 5px; }
  .ljn { color: #fff; font-weight: 800; font-size: 9px; padding: 2px 6px; border-radius: 9px; }
  .imza { display: flex; justify-content: space-between; gap: 50px; margin-top: 42px; break-inside: avoid; page-break-inside: avoid; }
  .imza > div { flex: 1; border-top: 1.5px solid #334155; padding-top: 6px; font-size: 11px; color: #64748b; text-align: center; }
  .foot { margin-top: 22px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 9.5px; color: #94a3b8; text-align: center; line-height: 1.5; }
  .foot b { color: #014486; }
  .sheet { width: 100%; border-collapse: collapse; }
  .sheet > thead > tr > td, .sheet > tbody > tr > td, .sheet > tfoot > tr > td { padding: 0; border: none; vertical-align: top; }
  .top-space { height: 0; }
  @media print {
    /* @page margin:0 → tarayıcının otomatik ekini (URL / tarih / sayfa no) kaldırır */
    @page { margin: 0; }
    body { padding: 0; }
    h2 { break-after: avoid; }
    /* Antetli kağıt: kenar boşlukları tablo yapısından gelir; üst boşluk (thead) ve footer (tfoot) HER sayfada tekrarlar */
    .sheet > tbody > tr > td { padding: 0 12mm; }
    .top-space { height: 12mm; }
    .foot { margin-top: 0; padding: 4mm 12mm 6mm; background: #fff; }
  }
</style></head><body>
<table class="sheet">
<thead><tr><td><div class="top-space"></div></td></tr></thead>
<tbody><tr><td>
<div class="antet">
  <img src="${logo}" alt="ZNA" onerror="this.style.display='none'">
  <div class="marka"><b>ZNA TEKNOLOJİ</b><span>SAHA KEŞİF RAPORU</span></div>
  <div class="no"><b>${esc(kesif.kesifNo || '')}</b>${kesif.kesifTarihi ? `Keşif: ${esc(fmtTarih(kesif.kesifTarihi))}` : ''}</div>
</div>
<h1>${esc(kesif.kesifBasligi || kesif.firmaAdi || 'Keşif')}</h1>
${kesif.kesifBasligi && kesif.firmaAdi ? `<div class="alt">${esc(kesif.firmaAdi)}</div>` : ''}

<h2>MÜŞTERİ VE PROJE BİLGİLERİ</h2>
<div class="bilgi">${bilgi.map(([a, v]) => `<div><b>${esc(a)}:</b> ${esc(v)}</div>`).join('')}</div>
${turBlok ? `<h2>KEŞİF TÜRLERİ VE TEKNİK DETAYLAR</h2>${turBlok}` : ''}
${kesif.genelNot ? `<h2>KEŞİF AÇIKLAMASI</h2><div class="metin-blok">${esc(kesif.genelNot)}</div>` : ''}
${kesif.ozelTalepler ? `<h2>MÜŞTERİ ÖZEL TALEPLERİ</h2><div class="metin-blok">${esc(kesif.ozelTalepler)}</div>` : ''}
${kesif.mevcutSistem ? `<h2>MEVCUT SİSTEM BİLGİSİ</h2><div class="metin-blok">${esc(kesif.mevcutSistem)}</div>` : ''}
${kalemler.length ? `<h2>MALZEME LİSTESİ (${kalemler.length})</h2><table><tr><th>Kategori</th><th>Ürün</th><th>Miktar</th><th>Not</th></tr>${kalemSatir}</table>` : ''}
${sembolOzet.toplam ? `<h2>CİHAZ YERLEŞİM DÖKÜMÜ (${sembolOzet.toplam} ADET)</h2><table><tr><th>Konum</th><th>Ürün</th><th>Adet</th></tr>${
  sembolOzet.kaynaklar.map(ka =>
    `<tr><td rowspan="${ka.semboller.length}"><b>${esc(ka.tip)} — ${esc(ka.baslik)}</b><div class="mut">${ka.toplam} adet</div></td><td>${esc(ka.semboller[0].ad)}</td><td class="sag">${ka.semboller[0].adet}</td></tr>` +
    ka.semboller.slice(1).map(s => `<tr><td>${esc(s.ad)}</td><td class="sag">${s.adet}</td></tr>`).join('')
  ).join('')
}<tr><td colspan="3" style="background:#eef3f8;font-weight:800;color:#014486">GENEL TOPLAM · ${sembolOzet.toplam} ADET</td></tr>${
  sembolOzet.gruplar.flatMap(g => g.semboller.map(s => `<tr><td>${esc(g.ad)}</td><td>${esc(s.ad)}</td><td class="sag"><b>${s.adet}</b></td></tr>`)).join('')
}</table>` : ''}
${krokiBlok ? `<h2>KROKİLER (${krokiler.length})</h2>${krokiBlok}` : ''}
${fotoBlok ? `<h2>FOTOĞRAFLAR (${yazFotolar.length})</h2><div class="fgrid">${fotoBlok}</div>` : ''}
<div class="imza">
  <div>Keşfi Yapan${kesif.kesfiYapan ? `<br><b style="color:#1a2332">${esc(kesif.kesfiYapan)}</b>` : ''}</div>
  <div>Müşteri Yetkilisi${kesif.musteriYetkilisi ? `<br><b style="color:#1a2332">${esc(kesif.musteriYetkilisi)}</b>` : ''}</div>
</div>
</td></tr></tbody>
<tfoot><tr><td>
<div class="foot"><b>ZNA TEKNOLOJİ BİLİŞİM HİZ. SAN. VE TİC. LTD. ŞTİ.</b> · znateknoloji.com<br>Bu rapor ZNA Teknoloji CRM sistemi üzerinden ${esc(new Date().toLocaleString('tr-TR'))} tarihinde oluşturulmuştur.</div>
</td></tr></tfoot>
</table>
${printTetikle ? '<' + `script>window.onload = () => setTimeout(() => window.print(), 700)</scr` + 'ipt>' : ''}
</body></html>`
    return html
  }

  const kesifYazdir = () => {
    const html = raporHtmlUret(true)
    const w = window.open('', '_blank', 'width=980,height=1000')
    if (!w) { toast.error('Açılır pencere engellendi — tarayıcı iznini kontrol et.'); return }
    w.document.write(html)
    w.document.close()
    setYazdirModal(false)
  }

  // ── Dönüşümler ─────────────────────────────────────────────────────
  const teklifeAktar = () => {
    if (kalemler.length === 0) { toast.warning('Önce malzeme listesine kalem ekleyin — teklif satırları buradan oluşur.'); return }
    localStorage.setItem('teklif_on_doldurum', JSON.stringify({
      kesifId: Number(id),  // TeklifDetay kaydedince kesifler.teklif_id günceller
      musteriId: kesif.musteriId || '',
      firmaAdi: kesif.firmaAdi || '',
      konu: `${kesif.kesifNo} — ${kesif.lokasyon || kesif.firmaAdi || 'Keşif'} kurulum teklifi`,
      aciklama: kesif.genelNot || '',
      satirlar: kalemler.map(k => ({
        id: crypto.randomUUID(),
        stokKodu: k.stokKodu || '',
        stokAdi: `${k.urunAdi}${k.marka ? ` — ${k.marka}` : ''}`,
        miktar: Number(k.miktar) || 1,
        birim: k.birim || 'Adet',
        birimFiyat: 0,
        iskonto: 0,
        kdv: 20,
      })),
    }))
    navigate('/teklifler/yeni')
  }

  const servisOlustur = async () => {
    const onay = await confirm({
      baslik: 'Servis Talebi Oluştur',
      mesaj: kalemler.length
        ? `${kesif.kesifNo} için "Kurulum" türünde servis talebi açılacak. ${kalemler.length} malzeme kalemi servise "planlanan" olarak aktarılacak — teknisyen kullandıkça işaretler, stok o an düşer. Devam?`
        : `${kesif.kesifNo} için "Kurulum" türünde servis talebi açılacak (keşif notları açıklamaya eklenir). Devam?`,
      onayMetin: 'Talebi Oluştur', iptalMetin: 'Vazgeç',
    })
    if (!onay) return
    setDonusumCalisiyor(true)
    try {
      const talep = await servisTalepEkle({
        talepNo: null,
        musteriId: kesif.musteriId || null,
        musteriAd: '',
        firmaAdi: kesif.firmaAdi || '',
        anaTur: 'kurulum',
        altKategori: '',
        konu: `${kesif.kesifNo} — ${kesif.lokasyon || kesif.firmaAdi || 'keşif'} kurulumu`,
        lokasyon: kesif.lokasyon || '',
        aciklama: [
          kesif.genelNot ? `Keşif notu: ${kesif.genelNot}` : null,
          kalemler.length ? `Malzeme listesi:\n${kalemOzetMetni()}` : null,
          `Kaynak keşif: ${kesif.kesifNo}`,
        ].filter(Boolean).join('\n\n'),
        aciliyet: 'normal',
        ilgiliKisi: kesif.kesfiYapan || kullanici?.ad || '',
        durum: 'bekliyor',
        kaynak: 'personel',
        atananKullaniciId: null,
        atananKullaniciAd: null,
        planliTarih: null,
        notlar: [],
        durumGecmisi: [{
          durum: 'bekliyor',
          tarih: new Date().toISOString(),
          kullaniciAd: kullanici?.ad || '',
          aciklama: `${kesif.kesifNo} keşfinden oluşturuldu`,
        }],
      })
      // Keşif kalemleri servise "planlanan malzeme" olarak taşınır. Eskiden yalnız
      // açıklamaya metin olarak yapışıyordu; teknisyen listeyi elle yeniden
      // yazmak zorunda kalıyordu (2026-07-15 şikayeti).
      let aktarilan = 0
      if (kalemler.length) {
        try {
          aktarilan = (await kesiftenMalzemePlanla(talep.id, kalemler)).length
        } catch (e) {
          // Talep açıldı — malzeme aktarımı patlarsa akışı durdurma, ama SUSMA.
          toast.error('Servis açıldı ama keşif malzemeleri aktarılamadı: ' + (e?.message || 'bilinmeyen hata'))
        }
      }
      await kesifGuncelle(id, { servisTalepId: talep.id })
      setKesif(k => ({ ...k, servisTalepId: talep.id }))
      servisTalebiBildirimGonder(talep, kullanici?.id).catch(() => {})
      toast.success(`Servis talebi oluşturuldu (${talep.talepNo || '#' + talep.id})${aktarilan ? ` · ${aktarilan} malzeme planlandı` : ''}.`)
    } catch (e) {
      toast.error('Servis talebi oluşturulamadı: ' + (e?.message || 'bilinmeyen hata'))
    } finally {
      setDonusumCalisiyor(false)
    }
  }

  const kesfiSil = async () => {
    const onay = await confirm({
      baslik: 'Keşfi Sil',
      mesaj: `${kesif.kesifNo} kalemleri ve fotoğraflarıyla birlikte kalıcı silinecek. Emin misin?`,
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    try {
      await kesifSil(id)
      toast.success('Keşif silindi.')
      navigate('/kesifler')
    } catch (e) {
      toast.error('Silinemedi: ' + (e?.message || 'bilinmeyen hata'))
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <button
        onClick={() => navigate('/kesifler')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--text-tertiary)', font: '500 13px/18px var(--font-sans)', marginBottom: 16,
        }}
      >
        <ArrowLeft size={14} strokeWidth={1.5} /> Keşiflere dön
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 className="t-h1" style={{ margin: 0 }}>{kesif.kesifNo}</h1>
          {durum && <Badge tone={durum.tone}>{durum.ad}</Badge>}
          {(() => {
            const o = KESIF_ONCELIKLERI.find(x => x.id === (kesif.oncelik || 'normal'))
            return o && o.id !== 'normal' ? (
              <span style={{
                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                color: o.renk, background: `${o.renk}18`, border: `1px solid ${o.renk}55`,
              }}>{o.ad.toUpperCase()}</span>
            ) : null
          })()}
          {kesif.gorusmeNo && (
            <button
              onClick={() => kesif.gorusmeId && navigate(`/gorusmeler/${kesif.gorusmeId}`)}
              title="Kaynak görüşmeye git"
              style={{
                fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                color: '#3b82f6', padding: '3px 8px',
                background: 'rgba(59,130,246,0.10)', borderRadius: 6,
                border: 'none', cursor: kesif.gorusmeId ? 'pointer' : 'default',
              }}
            >{kesif.gorusmeNo}</button>
          )}
          {kesif.teklifId && (
            <Badge tone="brand" style={{ cursor: 'pointer' }} onClick={() => navigate(`/teklifler/${kesif.teklifId}`)}>
              <FileText size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 3 }} />Teklif oluşturuldu →
            </Badge>
          )}
          {kesif.gorevId && (
            <Badge tone="beklemede" style={{ cursor: 'pointer' }} onClick={() => navigate(`/gorevler/${kesif.gorevId}`)}>
              <CheckSquare size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 3 }} />Görev oluşturuldu →
            </Badge>
          )}
          {kesif.servisTalepId && (
            <Badge tone="aktif" style={{ cursor: 'pointer' }} onClick={() => navigate(`/servis-talepleri/${kesif.servisTalepId}`)}>
              <Wrench size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 3 }} />Servis oluşturuldu →
            </Badge>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!kesif.teklifId && (
            <Button variant="primary" iconLeft={<FileText size={14} strokeWidth={1.5} />} onClick={teklifeAktar} disabled={donusumCalisiyor}>
              Teklife Aktar
            </Button>
          )}
          {!kesif.gorevId && (
            <Button variant="secondary" iconLeft={<CheckSquare size={14} strokeWidth={1.5} />} onClick={() => setGorevModal(true)} disabled={donusumCalisiyor}>
              Görev Oluştur
            </Button>
          )}
          {!kesif.servisTalepId && (
            <Button variant="secondary" iconLeft={<Wrench size={14} strokeWidth={1.5} />} onClick={servisOlustur} disabled={donusumCalisiyor}>
              Servis Talebi
            </Button>
          )}
          <Button variant="secondary" iconLeft={<Printer size={14} strokeWidth={1.5} />} onClick={() => setYazdirModal(true)}>
            Yazdır / PDF
          </Button>
          <Button variant="danger" iconLeft={<Trash2 size={14} strokeWidth={1.5} />} onClick={kesfiSil}>Sil</Button>
          <Button variant="primary" iconLeft={<Save size={14} strokeWidth={1.5} />} onClick={bilgiKaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Kaydediliyor…' : 'Keşfi Kaydet'}
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)', gap: 16, marginBottom: 16 }}>
        {/* Bilgiler */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 className="t-h2" style={{ margin: 0 }}>Keşif Bilgileri</h2>
            <Button variant="secondary" size="sm" iconLeft={<Save size={13} strokeWidth={1.5} />} onClick={bilgiKaydet} disabled={kaydediliyor}>
              {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <Label>Keşif başlığı</Label>
              <Input value={kesif.kesifBasligi || ''} onChange={e => setKesif(k => ({ ...k, kesifBasligi: e.target.value }))}
                placeholder="örn. Fabrika çevre güvenlik kamera keşfi" />
            </div>
            <div>
              <Label>Firma</Label>
              <Input value={kesif.firmaAdi || ''} onChange={e => setKesif(k => ({ ...k, firmaAdi: e.target.value }))} />
            </div>
            <div>
              <Label>Proje adı</Label>
              <Input value={kesif.projeAdi || ''} onChange={e => setKesif(k => ({ ...k, projeAdi: e.target.value }))} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <Label>Keşif adresi</Label>
              <Input value={kesif.lokasyon || ''} onChange={e => setKesif(k => ({ ...k, lokasyon: e.target.value }))} placeholder="Saha adresi" />
            </div>
            <div>
              <Label>Müşteri yetkilisi</Label>
              <Input value={kesif.musteriYetkilisi || ''} onChange={e => setKesif(k => ({ ...k, musteriYetkilisi: e.target.value }))} />
            </div>
            <div>
              <Label>Yetkili telefon</Label>
              <Input value={kesif.yetkiliTelefon || ''} onChange={e => setKesif(k => ({ ...k, yetkiliTelefon: e.target.value }))} placeholder="05xx…" />
            </div>
            <div>
              <Label>Yetkili e-posta</Label>
              <Input value={kesif.yetkiliEmail || ''} onChange={e => setKesif(k => ({ ...k, yetkiliEmail: e.target.value }))} />
            </div>
            <div>
              <Label>İlgili satış personeli</Label>
              <Input value={kesif.satisPersoneli || ''} onChange={e => setKesif(k => ({ ...k, satisPersoneli: e.target.value }))} />
            </div>
            <div>
              <Label>Keşif tarihi</Label>
              <Input type="date" value={kesif.kesifTarihi || ''} onChange={e => setKesif(k => ({ ...k, kesifTarihi: e.target.value }))} />
            </div>
            <div>
              <Label>Tahmini proje tarihi</Label>
              <Input type="date" value={kesif.tahminiProjeTarihi || ''} onChange={e => setKesif(k => ({ ...k, tahminiProjeTarihi: e.target.value }))} />
            </div>
            <div>
              <Label>Keşfi yapan</Label>
              <Input value={kesif.kesfiYapan || ''} onChange={e => setKesif(k => ({ ...k, kesfiYapan: e.target.value }))} />
            </div>
            <div>
              <Label>Öncelik</Label>
              <CustomSelect value={kesif.oncelik || 'normal'} onChange={e => setKesif(k => ({ ...k, oncelik: e.target.value }))}>
                {KESIF_ONCELIKLERI.map(o => <option key={o.id} value={o.id}>{o.ad}</option>)}
              </CustomSelect>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <Label>Keşif açıklaması</Label>
              <Textarea rows={3} value={kesif.genelNot || ''} onChange={e => setKesif(k => ({ ...k, genelNot: e.target.value }))}
                placeholder="Saha gözlemleri, montaj noktaları…" />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <Label>Müşteri özel talepleri</Label>
              <Textarea rows={2} value={kesif.ozelTalepler || ''} onChange={e => setKesif(k => ({ ...k, ozelTalepler: e.target.value }))}
                placeholder="Müşterinin özellikle istediği şeyler…" />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <Label>Mevcut sistem bilgisi</Label>
              <Textarea rows={2} value={kesif.mevcutSistem || ''} onChange={e => setKesif(k => ({ ...k, mevcutSistem: e.target.value }))}
                placeholder="Sahada kurulu sistem…" />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <Label>İç notlar (müşteri görmez)</Label>
              <Textarea rows={2} value={kesif.icNotlar || ''} onChange={e => setKesif(k => ({ ...k, icNotlar: e.target.value }))}
                placeholder="Şirket içi değerlendirme…" />
            </div>
            <div>
              <Label>Durum</Label>
              <CustomSelect value={kesif.durum} onChange={e => setKesif(k => ({ ...k, durum: e.target.value }))}>
                {KESIF_DURUMLARI.map(d => <option key={d.id} value={d.id}>{d.ad}</option>)}
              </CustomSelect>
            </div>
          </div>

          {/* Keşif türleri — çoklu seçim dropdown; seçilen türe teknik not alanı açılır */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-default)' }}>
            <Label>Keşif türleri (birden fazla seçilebilir)</Label>
            <div style={{ marginTop: 6, maxWidth: 420 }}>
              <CokluSelect
                degerler={kesif.turler || []}
                onChange={(arr) => setKesif(k => ({ ...k, turler: arr }))}
                secenekler={KESIF_TURLERI.map(t => ({ id: t.id, ad: t.ad }))}
                placeholder="Keşif türü seç…"
              />
            </div>
            {(kesif.turler || []).length > 0 && (
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {(kesif.turler || []).map(tid => {
                  const t = KESIF_TURLERI.find(x => x.id === tid)
                  return (
                    <div key={tid}>
                      <Label>{t?.ad || tid} — teknik detay</Label>
                      <Textarea
                        rows={2}
                        value={(kesif.teknikDetaylar || {})[tid] || ''}
                        onChange={e => teknikNotDegistir(tid, e.target.value)}
                        placeholder={`${t?.ad || tid} için saha tespitleri — adet, mesafe, mevcut altyapı…`}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Fotoğraflar — alt bilgi + çizim (KEŞİF DÜZENLEME dokümanı) */}
        <KesifFotoBolumu
          kesifId={id}
          fotolar={fotolar}
          setFotolar={setFotolar}
          fotoUrlMap={fotoUrlMap}
          setFotoUrlMap={setFotoUrlMap}
          kalemler={kalemler}
          kullanici={kullanici}
        />

        {/* Krokiler — saha yerleşim planı (mig 202) */}
        <KesifKrokiBolumu
          kesifId={id}
          krokiler={krokiler}
          setKrokiler={setKrokiler}
          fotoUrlMap={fotoUrlMap}
          setFotoUrlMap={setFotoUrlMap}
          kalemler={kalemler}
          kullanici={kullanici}
        />

        {/* Sembol Özeti — kroki + foto ikonlarının otomatik sayımı (2026-07-20) */}
        {sembolOzet.toplam > 0 && (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 className="t-h2" style={{ margin: 0 }}>Cihaz Yerleşim Dökümü</h2>
              <Badge tone="aktif">{sembolOzet.toplam} adet</Badge>
            </div>
            <p className="t-caption" style={{ margin: '0 0 12px' }}>
              Kroki ve fotoğraflara yerleştirilen cihaz ikonları kaynak bazında otomatik sayılır — hangi katta/alanda ne kullanılacak tek bakışta.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...sembolOzet.kaynaklar,
                { anahtar: 'genel-toplam', tip: 'Toplam', baslik: 'GENEL TOPLAM', toplam: sembolOzet.toplam,
                  semboller: sembolOzet.gruplar.flatMap(g => g.semboller) },
              ].map(ka => (
                <div key={ka.anahtar}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    padding: '6px 10px', borderRadius: 8, marginBottom: 6,
                    background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      {ka.tip !== 'Toplam' && <Badge tone={ka.tip === 'Kroki' ? 'aktif' : 'lead'}>{ka.tip}</Badge>}
                      <b style={{ font: '700 12.5px/17px var(--font-sans)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: ka.tip === 'Toplam' ? '0.04em' : 0 }}>{ka.baslik}</b>
                    </span>
                    <span style={{ font: '700 12px/16px var(--font-sans)', color: 'var(--text-primary)', flexShrink: 0 }}>{ka.toplam} adet</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 5 }}>
                    {ka.semboller.map(s => (
                      <div key={`${ka.anahtar}-${s.id}`} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 9px 4px 5px',
                        borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--surface-card)',
                        minWidth: 0,
                      }}>
                        <SembolMiniIkon id={s.id} renk={s.renk} size={20} />
                        <span style={{ font: '600 12.5px/17px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.ad}</span>
                        <span className="t-caption" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                          · {KROKI_KATEGORILER.find(k => k.id === s.kategori)?.ad || s.kategori}
                        </span>
                        <b style={{ marginLeft: 'auto', font: '800 13px/18px var(--font-sans)', color: 'var(--text-primary)', flexShrink: 0 }}>{s.adet}</b>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Yazdır seçenekleri */}
      {yazdirModal && (
        <Modal open onClose={() => setYazdirModal(false)} title="Keşif Raporu Yazdır" width={420}>
          <p className="t-caption" style={{ marginTop: 0 }}>Fotoğraflar çıktıda nasıl yer alsın?</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {[
              { id: 'tumu', ad: `Tüm fotoğraflar (${fotolar.length})`, alt: 'Çizimi olanlar çizimli haliyle basılır' },
              { id: 'cizimli', ad: `Sadece çizimli fotoğraflar (${fotolar.filter(f => f.cizimYolu).length})`, alt: 'İşaretleme yapılmış görseller' },
              { id: 'yok', ad: 'Fotoğrafsız', alt: 'Yalnız bilgiler + malzeme listesi' },
            ].map(s => (
              <label key={s.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', cursor: 'pointer',
                borderRadius: 'var(--radius-sm)', border: `1px solid ${yazdirFotoSecim === s.id ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                background: yazdirFotoSecim === s.id ? 'var(--brand-primary-soft)' : 'transparent',
              }}>
                <input type="radio" name="yazdirFoto" checked={yazdirFotoSecim === s.id} onChange={() => setYazdirFotoSecim(s.id)} style={{ marginTop: 2 }} />
                <span>
                  <span style={{ display: 'block', font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{s.ad}</span>
                  <span className="t-caption">{s.alt}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="t-caption" style={{ margin: '0 0 14px', padding: '8px 10px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)' }}>
            💡 Önce <b>Önizle</b> ile raporun nasıl görüneceğine bak, sonra yazdır penceresinde <b>Hedef: PDF olarak kaydet</b> seçerek PDF oluşturup mail/WhatsApp ile gönder.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setYazdirModal(false)}>Vazgeç</Button>
            <Button variant="secondary" iconLeft={<Eye size={14} strokeWidth={1.5} />}
              onClick={() => { setOnizlemeHtml(raporHtmlUret(false)); setYazdirModal(false) }}>
              Önizle
            </Button>
            <Button variant="primary" iconLeft={<Printer size={14} strokeWidth={1.5} />} onClick={kesifYazdir}>Yazdır / PDF</Button>
          </div>
        </Modal>
      )}

      {/* Rapor önizleme — tam ekran iframe */}
      {onizlemeHtml && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(10,14,25,0.75)',
          display: 'flex', flexDirection: 'column', padding: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
            <span style={{ color: '#fff', font: '700 14px/20px var(--font-sans)' }}>Rapor Önizleme — {kesif.kesifNo}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" size="sm" iconLeft={<Printer size={13} strokeWidth={1.5} />}
                onClick={() => { document.getElementById('rapor-onizleme-iframe')?.contentWindow?.print() }}>
                Yazdır / PDF
              </Button>
              <button onClick={() => setOnizlemeHtml(null)} aria-label="Kapat"
                style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                <X size={17} />
              </button>
            </div>
          </div>
          <iframe
            id="rapor-onizleme-iframe"
            title="Rapor Önizleme"
            srcDoc={onizlemeHtml}
            style={{ flex: 1, width: '100%', border: 'none', borderRadius: 8, background: '#fff' }}
          />
        </div>
      )}

      {/* Malzeme listesi */}
      <Card padding={0}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 className="t-h2" style={{ margin: 0 }}>Malzeme Listesi ({kalemler.length})</h2>
          {kategoriOzet.map(k => (
            <span key={k.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 10px', borderRadius: 12,
              background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
              font: '600 11px/16px var(--font-sans)', color: 'var(--text-secondary)',
            }}>
              {k.ikon} {Number(k.toplam).toLocaleString('tr-TR')} {k.ad}
            </span>
          ))}
        </div>

        {/* Yeni kalem satırı */}
        <div style={{
          display: 'grid', gap: 8, padding: '12px 20px',
          gridTemplateColumns: '130px 150px minmax(160px, 1fr) 130px 70px 90px minmax(120px, 1fr) auto',
          alignItems: 'end', borderBottom: '1px solid var(--border-default)',
          background: 'var(--surface-subtle, #F4F6F8)',
        }}>
          <div>
            <Label>Kategori</Label>
            <CustomSelect value={yeniKalem.kategori} onChange={e => setYeniKalem(v => ({ ...v, kategori: e.target.value }))}>
              {KESIF_KATEGORILERI.map(k => <option key={k.id} value={k.id}>{k.ikon} {k.ad}</option>)}
            </CustomSelect>
          </div>
          <div>
            <Label>Stok (ops.)</Label>
            {/* Akıllı seçici (Faz 3): "2 mp 2.8 dome" özellik bazlı arama + stok durumu */}
            <AkilliUrunSecici
              urunler={stokUrunler}
              value={yeniKalem.stokKodu}
              placeholder="Stoktan seç…"
              onSec={(u) => stokSec(u.stokKodu)}
            />
          </div>
          <div>
            <Label required>Ürün adı</Label>
            <Input value={yeniKalem.urunAdi} onChange={e => setYeniKalem(v => ({ ...v, urunAdi: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') kalemKaydet() }} placeholder="örn. 4MP IP Dome kamera" />
          </div>
          <div>
            <Label>Marka/Model</Label>
            <Input value={yeniKalem.marka} onChange={e => setYeniKalem(v => ({ ...v, marka: e.target.value }))} placeholder="Hikvision…" />
          </div>
          <div>
            <Label>Miktar</Label>
            <Input type="number" min="0" value={yeniKalem.miktar}
              onChange={e => setYeniKalem(v => ({ ...v, miktar: e.target.value }))}
              style={{ textAlign: 'right' }} />
          </div>
          <div>
            <Label>Birim</Label>
            <CustomSelect value={yeniKalem.birim} onChange={e => setYeniKalem(v => ({ ...v, birim: e.target.value }))}>
              {birimler.map(b => <option key={b} value={b}>{b}</option>)}
            </CustomSelect>
          </div>
          <div>
            <Label>Not</Label>
            <Input value={yeniKalem.notlar} onChange={e => setYeniKalem(v => ({ ...v, notlar: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') kalemKaydet() }} placeholder="montaj yeri vb." />
          </div>
          <Button variant="primary" iconLeft={<Plus size={13} strokeWidth={1.5} />} onClick={kalemKaydet}>Ekle</Button>
        </div>

        {kalemler.length === 0 ? (
          <div style={{ padding: 28 }}>
            <EmptyState
              icon={<Compass size={22} strokeWidth={1.5} />}
              title="Malzeme listesi boş"
              description='Yukarıdaki satırdan kamera/kayıt cihazı/kablo vb. ekle — "Teklife Aktar" bu listeyi teklif satırlarına çevirir.'
            />
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Kategori</TH><TH>Stok</TH><TH>Ürün</TH><TH>Marka/Model</TH>
                <TH align="right">Miktar</TH><TH>Not</TH><TH></TH>
              </TR>
            </THead>
            <TBody>
              {kalemler.map(k => {
                const kat = KESIF_KATEGORILERI.find(x => x.id === k.kategori)
                return (
                  <TR key={k.id}>
                    <TD>{kat ? `${kat.ikon} ${kat.ad}` : k.kategori}</TD>
                    <TD>{k.stokKodu ? <CodeBadge>{k.stokKodu}</CodeBadge> : '—'}</TD>
                    <TD style={{ fontWeight: 500 }}>{k.urunAdi}</TD>
                    <TD>{k.marka || '—'}</TD>
                    <TD align="right"><span className="tabular-nums">{Number(k.miktar).toLocaleString('tr-TR')} {k.birim}</span></TD>
                    <TD style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{k.notlar || '—'}</TD>
                    <TD align="right">
                      <button
                        aria-label="Kalemi sil"
                        onClick={() => kalemKaldir(k)}
                        style={{
                          width: 26, height: 26, display: 'inline-grid', placeItems: 'center',
                          background: 'transparent', border: '1px solid var(--border-default)',
                          borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                      >
                        <Trash2 size={12} strokeWidth={1.5} />
                      </button>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Görev oluştur modalı */}
      {gorevModal && (
        <GorevOlusturModal
          kesif={kesif}
          kalemOzet={kalemOzetMetni()}
          kullanici={kullanici}
          kullanicilar={kullanicilar}
          onKapat={() => setGorevModal(false)}
          onOlusturuldu={async (gorev) => {
            await kesifGuncelle(id, { gorevId: gorev.id }).catch(() => {})
            setKesif(k => ({ ...k, gorevId: gorev.id }))
            setGorevModal(false)
            toast.success('Görev oluşturuldu ve keşfe bağlandı.')
          }}
        />
      )}
    </div>
  )
}

function GorevOlusturModal({ kesif, kalemOzet, kullanici, kullanicilar, onKapat, onOlusturuldu }) {
  const { toast } = useToast()
  const [baslik, setBaslik] = useState(`${kesif.kesifNo} — ${kesif.firmaAdi || 'saha'} kurulum/uygulama`)
  const [atanan, setAtanan] = useState('')
  const [oncelik, setOncelik] = useState('orta')
  const [sonTarih, setSonTarih] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const kaydet = async () => {
    if (!baslik.trim()) { toast.warning('Başlık zorunlu.'); return }
    setKaydediliyor(true)
    try {
      // Alan adları gorevler tablosuyla birebir eşleşmeli (GorusmeDetay çalışan
      // pattern'i): atananId/atananAd/olusturanAd/bitisTarihi. Eski payload
      // 'olusturan' ve 'atanan' string gönderiyordu — 'olusturan' kolonu YOK,
      // PostgREST 400 → sessiz null → "Görev kaydedilemedi".
      const atananKisi = (kullanicilar || []).find(k => String(k.id) === String(atanan))
      const gorev = await gorevEkle({
        baslik: baslik.trim(),
        aciklama: [
          kesif.lokasyon ? `Lokasyon: ${kesif.lokasyon}` : null,
          kesif.genelNot ? `Keşif notu: ${kesif.genelNot}` : null,
          kalemOzet ? `Malzeme listesi:\n${kalemOzet}` : null,
          `Kaynak keşif: ${kesif.kesifNo}`,
        ].filter(Boolean).join('\n\n'),
        atananId: atanan ? Number(atanan) : null,
        atananAd: atananKisi?.ad || '',
        oncelik,
        durum: 'bekliyor',
        bitisTarihi: sonTarih || null,
        musteriId: kesif.musteriId || null,
        firmaAdi: kesif.firmaAdi || '',
        olusturanAd: kullanici?.ad || '',
      })
      if (!gorev) throw new Error('Görev kaydedilemedi (konsol log\'una bakın).')
      onOlusturuldu(gorev)
    } catch (e) {
      toast.error('Görev oluşturulamadı: ' + (e?.message || 'bilinmeyen hata'))
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <Modal
      open
      onClose={onKapat}
      title="Keşiften Görev Oluştur"
      width={460}
      footer={
        <>
          <Button variant="secondary" onClick={onKapat}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Oluşturuluyor…' : 'Görevi Oluştur'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <Label required>Başlık</Label>
          <Input value={baslik} onChange={e => setBaslik(e.target.value)} />
        </div>
        <div>
          <Label>Atanan</Label>
          <CustomSelect value={atanan} onChange={e => setAtanan(e.target.value)}>
            <option value="">Atanmadı</option>
            {(kullanicilar || []).map(k => <option key={k.id} value={String(k.id)}>{k.ad}</option>)}
          </CustomSelect>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label>Öncelik</Label>
            <CustomSelect value={oncelik} onChange={e => setOncelik(e.target.value)}>
              <option value="dusuk">Düşük</option>
              <option value="orta">Orta</option>
              <option value="yuksek">Yüksek</option>
            </CustomSelect>
          </div>
          <div>
            <Label>Son tarih</Label>
            <Input type="date" value={sonTarih} onChange={e => setSonTarih(e.target.value)} />
          </div>
        </div>
        <p className="t-caption" style={{ margin: 0 }}>
          Keşif notu ve malzeme listesi görev açıklamasına otomatik eklenir.
        </p>
      </div>
    </Modal>
  )
}
