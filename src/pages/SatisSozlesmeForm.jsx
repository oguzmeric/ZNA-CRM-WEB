// Satış Sözleşmesi formu (mig 156) — teklif/siparişten veya bağımsız üretim.
// Rotalar: /sozlesmeler/satis/yeni (?teklifId= | ?siparisId=) ve /sozlesmeler/satis/:id
// Akış: taslak → yönetici onayı → onaylandı (KİLİTLİ) → müşteriye gönderildi →
// imzalandı → (bağlı sipariş "Sözleşmeli Sipariş"). Kur farkı takibi imza sonrası.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, FileSignature, Lock, Unlock, Printer, Send, FileUp, ExternalLink,
  Eye, CheckCircle2, XCircle, AlertTriangle, Calculator,
} from 'lucide-react'
import { Button, Card, Badge, Input, Label, Textarea, Modal } from '../components/ui'
import CustomSelect from '../components/CustomSelect'
import { SkeletonList } from '../components/Skeleton'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { belgePaylas } from '../services/belgePaylasimService'
import { teklifleriGetir, teklifGetir } from '../services/teklifService'
import { siparisGetir, kalemleriGetir } from '../services/siparisService'
import { musterileriGetir } from '../services/musteriService'
import { gorusmeGetir, gorusmeleriGetir } from '../services/gorusmeService'
import {
  satisSozlesmeGetir, satisSozlesmeEkle, satisSozlesmeGuncelle, hesapVeIcerikHazirla,
  onayaGonder, sozlesmeOnayla, sozlesmeReddet, gonderildiIsaretle, sozlesmeIptalEt, kilidiAc,
  imzaliSozlesmeYukleSS, ssDosyaUrl, ssDosyaYukle, kurFarkiKaydet,
  tekliftenForm, siparistenForm,
} from '../services/satisSozlesmeService'
import { sozlesmeHesapla, kurFarkiHesapla, paraFmt } from '../lib/satisSozlesmeHesap'
import {
  SABLON_TIPLERI_SS, FIRMA_TIPLERI_SS, ODEME_TIPLERI_SS, KUR_TIPLERI_SS, SS_DURUMLARI,
  evrakListesiUret, sozlesmeHtmlUret,
} from '../lib/satisSozlesmeMaddeleri'

const BOS_FORM = {
  sablonTipi: 'standart',
  // siparisNo kaldırıldı — sözleşme öncesi sipariş akışı kullanılmıyor.
  // siparisId kalıyor: /sozlesmeler/satis/yeni?siparisId= girişi ve imzalı sözleşme
  // yüklenince siparisler.sozlesme_id işaretlemesi buna bağlı.
  musteriId: null, gorusmeNo: '', teklifId: null, teklifNo: '', siparisId: null,
  firmaTipi: 'limited', firmaAdi: '', yetkiliAdi: '', tcVergiNo: '', vergiDairesi: '',
  adres: '', telefon: '', email: '', imzaYetkilisi: '', imzaBelgesiIstenir: true,
  projeAdi: '', lokasyon: '', kurumAdi: '', anaYuklenici: '', isinKonusu: '',
  isSuresi: '', teslimSekli: '',
  montajDahil: false, devreyeAlmaDahil: false, egitimDahil: false, bakimDahil: false,
  paraBirimi: 'TL', odemeTipi: 'pesin', vadeGunu: 0, vadeOrani: 0,
  damgaOrani: 0.00948, damgaDahil: true,
  kurFarkiUygulanir: false, kurTipi: 'tcmb_satis', ozelKur: '',
  cekTarihi: '', cekBankasi: '', cekNo: '', cekTutarTl: '', cekKuru: '',
  iskonto: 0, yuvarlama: 0, anaToplam: 0, urunListesi: [],
  vadeTarihi: '', notlar: '',
}

const BOLUM = {
  gridColumn: '1 / -1',
  font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  borderBottom: '1px solid var(--border-default)', paddingBottom: 4, marginTop: 6,
}

const trTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'

export default function SatisSozlesmeForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { kullanici } = useAuth()
  const admin = kullanici?.rol === 'admin'

  const [form, setForm] = useState(BOS_FORM)
  const [kayit, setKayit] = useState(null)       // DB'deki sözleşme (yeni ise null)
  const [teklifler, setTeklifler] = useState([])
  const [gorusmeler, setGorusmeler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [mesgul, setMesgul] = useState(false)
  const [onizleme, setOnizleme] = useState(false)
  const [gonderAcik, setGonderAcik] = useState(false)
  const [gonderEmail, setGonderEmail] = useState('')
  const [redAcik, setRedAcik] = useState(false)
  const [redSebep, setRedSebep] = useState('')
  const imzaliRef = useRef(null)

  const kilitli = !!kayit?.kilitli
  const durum = SS_DURUMLARI[kayit?.durum || 'taslak'] || SS_DURUMLARI.taslak

  const alan = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Canlı hesap özeti (spec §3)
  const hesap = useMemo(() => sozlesmeHesapla(form), [form])

  // Bağlı görüşme seçenekleri — elle numara yazmak yerine geçmişten seç.
  // Müşteri/firma biliniyorsa (teklif seçilince doluyor) o firmayla daralt;
  // bilinmiyorsa hepsini göster — CustomSelect 8+ seçenekte aramayı kendi açar.
  const gorusmeSecenekleri = useMemo(() => {
    const norm = (s) => (s || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim()
    const firma = norm(form.firmaAdi)
    let liste = gorusmeler || []
    const eslesen = liste.filter(g =>
      (form.musteriId && Number(g.musteriId) === Number(form.musteriId)) ||
      (firma && norm(g.firmaAdi) === firma)
    )
    if (eslesen.length) liste = eslesen

    const secenekler = liste
      .map(g => {
        const no = g.gorusmeNo || g.aktNo || ''
        if (!no) return null
        const rozet = g.aktNo || g.gorusmeNo
        const tarih = g.tarih ? new Date(g.tarih).toLocaleDateString('tr-TR') : ''
        return {
          no,
          kisa: rozet,
          etiket: [rozet, g.konu, tarih].filter(Boolean).join(' · '),
        }
      })
      .filter(Boolean)

    // Kayıtlı numara listede yoksa (eski kayıt / farklı firma) seçili kalsın diye ekle
    if (form.gorusmeNo && !secenekler.some(s => s.no === form.gorusmeNo)) {
      secenekler.unshift({ no: form.gorusmeNo, kisa: form.gorusmeNo, etiket: `${form.gorusmeNo} · (kayıtlı)` })
    }
    return secenekler
  }, [gorusmeler, form.musteriId, form.firmaAdi, form.gorusmeNo])

  // ---- Yükleme ----
  const kayittanForma = (s) => {
    const f = { ...BOS_FORM }
    for (const k of Object.keys(BOS_FORM)) if (s[k] !== null && s[k] !== undefined) f[k] = s[k]
    return f
  }

  const yukle = useCallback(async () => {
    // Sipariş listesi artık çekilmiyor — "Kaynak sipariş" seçici kaldırıldı.
    // ?siparisId= ile gelinirse siparisGetir ile tek kayıt çekiliyor.
    const [tList, gList] = await Promise.all([
      teklifleriGetir().catch(() => []),
      gorusmeleriGetir().catch(() => []),
    ])
    setTeklifler(tList || [])
    setGorusmeler(gList || [])

    if (id) {
      const s = await satisSozlesmeGetir(Number(id))
      if (s) { setKayit(s); setForm(kayittanForma(s)); setGonderEmail(s.email || '') }
    } else if (params.get('teklifId')) {
      const t = await teklifGetir(Number(params.get('teklifId')))
      if (t) await tekliftenDoldur(t)
    } else if (params.get('siparisId')) {
      const sip = await siparisGetir(Number(params.get('siparisId')))
      if (sip) await siparistenDoldur(sip)
    }
    setYukleniyor(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => { yukle() }, [yukle])

  const tekliftenDoldur = async (t) => {
    let gorusmeNo = ''
    if (t.gorusmeId) {
      const g = await gorusmeGetir(t.gorusmeId).catch(() => null)
      gorusmeNo = g?.gorusmeNo || ''
    }
    const veri = tekliftenForm(t, gorusmeNo)
    setForm(f => ({ ...f, ...veri }))
    setGonderEmail(veri.email || '')
    toast.success(`${t.teklifNo || 'Teklif'} bilgileri yüklendi — ana toplam KDV dahil ${paraFmt(veri.anaToplam, veri.paraBirimi)}.`)
  }

  const siparistenDoldur = async (sip) => {
    const [kalemler, musteriler] = await Promise.all([
      kalemleriGetir(sip.id).catch(() => []),
      musterileriGetir().catch(() => []),
    ])
    const musteri = (musteriler || []).find(m => Number(m.id) === Number(sip.musteriId))
    let ek = {}
    if (sip.gorusmeId) {
      const g = await gorusmeGetir(sip.gorusmeId).catch(() => null)
      ek.gorusmeNo = g?.gorusmeNo || ''
    }
    if (sip.teklifId) {
      const t = (teklifler || []).find(x => Number(x.id) === Number(sip.teklifId))
      if (t) ek.teklifNo = t.teklifNo || ''
    }
    const veri = siparistenForm(sip, kalemler, musteri)
    setForm(f => ({ ...f, ...veri, ...ek }))
    setGonderEmail(veri.email || '')
    toast.success(`${sip.siparisNo || 'Sipariş'} bilgileri yüklendi.`)
  }

  // ---- Kaydet ----
  const dogrula = () => {
    if (!form.firmaAdi?.trim()) { toast.error('Firma adı zorunludur.'); return false }
    if (!Number(form.anaToplam)) { toast.error('Ana toplam (KDV dahil) girilmelidir.'); return false }
    if ((form.odemeTipi === 'cek' || form.odemeTipi === 'senet') && !form.vadeTarihi && !form.cekTarihi) {
      toast.error('Çekli/senetli ödemede çek tarihi veya vade tarihi girilmelidir.'); return false
    }
    return true
  }

  const kaydet = async (sessiz = false) => {
    if (kilitli) { toast.error('Sözleşme kilitli — değişiklik için yönetici kilidi açmalı.'); return null }
    if (!dogrula()) return null
    setMesgul(true)
    const hazir = hesapVeIcerikHazirla({ ...form, sozlesmeNo: kayit?.sozlesmeNo, olusturmaTarih: kayit?.olusturmaTarih })
    const payload = {
      ...form,
      ozelKur: form.ozelKur || null, cekTutarTl: form.cekTutarTl || null, cekKuru: form.cekKuru || null,
      cekTarihi: form.cekTarihi || null, vadeTarihi: form.vadeTarihi || null,
      anaToplam: hazir.anaToplam, vadeFarki: hazir.vadeFarki,
      damgaVergisi: hazir.damgaVergisi, nihaiToplam: hazir.nihaiToplam,
      evraklar: hazir.evraklar, uretilenIcerik: hazir.uretilenIcerik,
    }
    let sonuc
    if (kayit) {
      sonuc = await satisSozlesmeGuncelle(kayit.id, payload)
    } else {
      sonuc = await satisSozlesmeEkle({ ...payload, hazirlayanId: kullanici?.id || null, hazirlayanAd: kullanici?.ad || null })
      if (!sonuc?._hata) {
        // Numara trigger'dan geldi — içeriği gerçek numarayla yeniden üret
        const hazir2 = hesapVeIcerikHazirla({ ...form, sozlesmeNo: sonuc.sozlesmeNo, olusturmaTarih: sonuc.olusturmaTarih, evraklar: hazir.evraklar })
        sonuc = await satisSozlesmeGuncelle(sonuc.id, { uretilenIcerik: hazir2.uretilenIcerik })
      }
    }
    setMesgul(false)
    if (sonuc?._hata) { toast.error('Kaydedilemedi: ' + sonuc._hata); return null }
    setKayit(sonuc)
    setForm(kayittanForma(sonuc))
    if (!sessiz) toast.success(`Kaydedildi: ${sonuc.sozlesmeNo}`)
    if (!id) navigate(`/sozlesmeler/satis/${sonuc.id}`, { replace: true })
    return sonuc
  }

  // ---- Durum aksiyonları ----
  const onayaGonderTikla = async () => {
    const s = await kaydet(true)
    if (!s) return
    const g = await onayaGonder(s, kullanici)
    if (g?._hata) { toast.error(g._hata); return }
    setKayit(g)
    toast.success('Yönetici onayına gönderildi — oranlar, vade farkı ve iskonto kontrol edilecek.')
  }

  const onaylaTikla = async () => {
    const onay = await confirm({
      baslik: 'Sözleşmeyi Onayla ve Kilitle',
      mesaj: `${kayit.sozlesmeNo} onaylanacak ve düzenlemeye KİLİTLENECEK. Nihai bedel: ${paraFmt(kayit.nihaiToplam, kayit.paraBirimi)}. Devam edilsin mi?`,
      onayMetin: 'Onayla ve Kilitle', iptalMetin: 'Vazgeç',
    })
    if (!onay) return
    const g = await sozlesmeOnayla(kayit, kullanici)
    if (g?._hata) { toast.error(g._hata); return }
    setKayit(g)
    toast.success('Sözleşme onaylandı ve kilitlendi. 🔒')
  }

  const reddetTikla = async () => {
    if (!redSebep.trim()) { toast.error('Red sebebi girin.'); return }
    const g = await sozlesmeReddet(kayit, kullanici, redSebep.trim())
    if (g?._hata) { toast.error(g._hata); return }
    setKayit(g); setRedAcik(false); setRedSebep('')
    toast.success('Sözleşme taslağa geri gönderildi.')
  }

  const kilidiAcTikla = async () => {
    const onay = await confirm({
      baslik: 'Kilidi Aç',
      mesaj: 'Sözleşme taslağa dönecek ve yeniden yönetici onayı gerekecek. Devam edilsin mi?',
      onayMetin: 'Kilidi Aç', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    const g = await kilidiAc(kayit.id)
    if (g?._hata) { toast.error(g._hata); return }
    setKayit(g)
    toast.success('Kilit açıldı — sözleşme taslağa döndü.')
  }

  const iptalTikla = async () => {
    const onay = await confirm({
      baslik: 'Sözleşmeyi İptal Et',
      mesaj: `${kayit.sozlesmeNo} iptal edilsin mi?`,
      onayMetin: 'İptal Et', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    const g = await sozlesmeIptalEt(kayit.id)
    if (g?._hata) { toast.error(g._hata); return }
    setKayit(g)
    toast.success('Sözleşme iptal edildi.')
  }

  // ---- Yazdır / önizleme ----
  const icerikHtml = () => kayit?.uretilenIcerik
    || hesapVeIcerikHazirla({ ...form, sozlesmeNo: kayit?.sozlesmeNo }).uretilenIcerik

  const yazdir = () => {
    const w = window.open('', '_blank', 'width=920,height=1000')
    if (!w) { toast.error('Açılır pencere engellendi.'); return }
    w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><base href="${window.location.origin}/"><title>${kayit?.sozlesmeNo || 'Satış Sözleşmesi'}</title></head><body>${icerikHtml()}<script>window.onload = () => setTimeout(() => window.print(), 400)</scr` + `ipt></body></html>`)
    w.document.close()
  }

  // ---- Müşteriye gönder ----
  const gonder = async () => {
    if (!gonderEmail.trim()) { toast.error('E-posta adresi girin.'); return }
    setMesgul(true)
    try {
      await belgePaylas({
        belge_tipi: 'satis_sozlesme', belge_id: kayit.id, kanal: 'mail',
        email: gonderEmail.trim(), sure_gun: 30,
        ozel_mesaj: `Satış sözleşmenizi görüntüleyip yazdırdıktan sonra kaşe ve imza ile PDF olarak tarafımıza iletiniz. Nihai sözleşme bedeli: ${paraFmt(kayit.nihaiToplam, kayit.paraBirimi)}.`,
      })
      const g = await gonderildiIsaretle(kayit.id)
      if (!g?._hata) setKayit(g)
      toast.success('Sözleşme müşteriye e-posta ile gönderildi.')
      setGonderAcik(false)
    } catch (e) {
      toast.error('Gönderilemedi: ' + e.message)
    } finally {
      setMesgul(false)
    }
  }

  // ---- İmzalı PDF ----
  const imzaliYukle = async (file) => {
    if (!file) return
    setMesgul(true)
    const g = await imzaliSozlesmeYukleSS({ sozlesme: kayit, file })
    setMesgul(false)
    if (g?._hata) { toast.error(g._hata); return }
    setKayit(g)
    toast.success(kayit.siparisId
      ? 'İmzalı sözleşme yüklendi — bağlı sipariş "Sözleşmeli Sipariş" olarak işaretlendi. ✅'
      : 'İmzalı sözleşme yüklendi. ✅')
  }

  const imzaliAc = async () => {
    const url = await ssDosyaUrl(kayit.imzaliPdfUrl)
    if (url) window.open(url, '_blank')
    else toast.error('Dosya açılamadı.')
  }

  // ---- Evrak checklist ----
  const evrakToggle = async (idx) => {
    const evraklar = [...(kayit.evraklar || [])]
    evraklar[idx] = { ...evraklar[idx], durum: evraklar[idx].durum === 'tamam' ? 'bekleniyor' : 'tamam' }
    const g = await satisSozlesmeGuncelle(kayit.id, { evraklar })
    if (g?._hata) { toast.error(g._hata); return }
    setKayit(g)
  }

  const evrakDosya = async (idx, file) => {
    if (!file) return
    const path = await ssDosyaYukle(kayit.id, file, `evrak-${kayit.evraklar[idx]?.tip || idx}`)
    if (!path) { toast.error('Dosya yüklenemedi.'); return }
    const evraklar = [...(kayit.evraklar || [])]
    evraklar[idx] = { ...evraklar[idx], durum: 'tamam', dosyaUrl: path, dosyaAdi: file.name }
    const g = await satisSozlesmeGuncelle(kayit.id, { evraklar })
    if (g?._hata) { toast.error(g._hata); return }
    setKayit(g)
    toast.success('Evrak yüklendi.')
  }

  const evrakAc = async (e) => {
    const url = await ssDosyaUrl(e.dosyaUrl)
    if (url) window.open(url, '_blank')
    else toast.error('Dosya açılamadı.')
  }

  // ---- Kur farkı takip (spec §10) ----
  const [tahsilKuru, setTahsilKuru] = useState('')
  useEffect(() => { if (kayit?.tahsilKuru) setTahsilKuru(String(kayit.tahsilKuru)) }, [kayit?.tahsilKuru])

  const kurFarki = useMemo(() => {
    if (!kayit || !tahsilKuru) return null
    const dovizTutar = Number(kayit.nihaiToplam) || 0
    return kurFarkiHesapla({
      dovizTutar,
      duzenlemeKuru: kayit.cekKuru || kayit.ozelKur || 0,
      tahsilKuru: Number(tahsilKuru),
      cekTutarTl: kayit.cekTutarTl,
    })
  }, [kayit, tahsilKuru])

  const kurFarkiKaydetTikla = async (faturalandi = false) => {
    if (!kurFarki) { toast.error('Tahsil günü kurunu girin.'); return }
    const g = await kurFarkiKaydet(kayit.id, {
      tahsilKuru: Number(tahsilKuru),
      kurFarkiTl: kurFarki.kurFarkiTl,
      durum: faturalandi ? 'faturalandi' : (kurFarki.saticiAleyhine ? 'olustu' : 'izleniyor'),
    })
    if (g?._hata) { toast.error(g._hata); return }
    setKayit(g)
    toast.success(faturalandi ? 'Kur farkı faturalandı olarak işaretlendi.' : 'Kur farkı kaydedildi.')
  }

  if (yukleniyor) return <SkeletonList />

  const duzenlenebilir = !kilitli && (!kayit || ['taslak', 'yonetici_onayinda'].includes(kayit.durum))
  const kurTakipGoster = kayit && (kayit.paraBirimi !== 'TL' || kayit.kurFarkiUygulanir)
    && ['onaylandi', 'gonderildi', 'imzalandi'].includes(kayit.durum)

  return (
    <div style={{ padding: 24, maxWidth: 1360, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <button onClick={() => navigate('/sozlesmeler')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', font: '500 12px/16px var(--font-sans)', padding: 0, marginBottom: 6 }}>
            <ArrowLeft size={13} strokeWidth={1.5} /> Sözleşmeler
          </button>
          <h1 className="t-h1" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <FileSignature size={22} strokeWidth={1.75} />
            {kayit ? kayit.sozlesmeNo : 'Yeni Satış Sözleşmesi'}
            <Badge tone={durum.tone}>{durum.isim}</Badge>
            {kilitli && <Badge tone="kayip" icon={<Lock size={11} strokeWidth={2} />}>Kilitli</Badge>}
          </h1>
          {kayit?.redSebebi && kayit.durum === 'taslak' && (
            <p style={{ marginTop: 4, font: '400 12.5px/18px var(--font-sans)', color: 'var(--danger)' }}>
              Yönetici reddi: {kayit.redSebebi}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 8fr) minmax(280px, 4fr)', gap: 16, alignItems: 'start' }}>
        {/* ---------- SOL: form ---------- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
              <div style={BOLUM}>Bağlantı ve Şablon</div>
              <div>
                <Label>Sözleşme şablonu</Label>
                <CustomSelect value={form.sablonTipi} disabled={!duzenlenebilir} onChange={e => alan('sablonTipi', e.target.value)}>
                  {SABLON_TIPLERI_SS.map(t => <option key={t.id} value={t.id}>{t.isim}</option>)}
                </CustomSelect>
              </div>
              <div>
                <Label>Kaynak teklif</Label>
                <CustomSelect value={form.teklifId || ''} disabled={!duzenlenebilir}
                  onChange={async e => {
                    if (!e.target.value) { alan('teklifId', null); return }
                    // Liste objesi satirlar içermez — tam kaydı çek (ürün listesi + toplam için)
                    const t = await teklifGetir(Number(e.target.value)).catch(() => null)
                    if (t) await tekliftenDoldur(t)
                  }}>
                  <option value="">— Bağımsız / seçilmedi —</option>
                  {(teklifler || []).slice(0, 200).map(t => (
                    <option key={t.id} value={t.id}>{t.teklifNo || `#${t.id}`} · {t.firmaAdi}</option>
                  ))}
                </CustomSelect>
              </div>
              <div>
                <Label>Bağlı görüşme</Label>
                <CustomSelect value={form.gorusmeNo || ''} disabled={!duzenlenebilir}
                  selectedDisplay={(v) => {
                    const g = gorusmeSecenekleri.find(x => x.no === v)
                    return g ? g.kisa : (v || '— Seçilmedi —')
                  }}
                  onChange={e => alan('gorusmeNo', e.target.value)}>
                  <option value="">— Seçilmedi —</option>
                  {gorusmeSecenekleri.map(g => (
                    <option key={g.no} value={g.no}>{g.etiket}</option>
                  ))}
                </CustomSelect>
              </div>
              <div>
                <Label>Teklif no</Label>
                <Input value={form.teklifNo} disabled={!duzenlenebilir} onChange={e => alan('teklifNo', e.target.value)} placeholder="TEK-0123" />
              </div>

              <div style={BOLUM}>Müşteri / Alıcı Bilgileri</div>
              <div>
                <Label>Firma tipi</Label>
                <CustomSelect value={form.firmaTipi} disabled={!duzenlenebilir} onChange={e => alan('firmaTipi', e.target.value)}>
                  {FIRMA_TIPLERI_SS.map(t => <option key={t.id} value={t.id}>{t.isim}</option>)}
                </CustomSelect>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <Label required>Firma adı</Label>
                <Input value={form.firmaAdi} disabled={!duzenlenebilir} onChange={e => alan('firmaAdi', e.target.value)} placeholder="Alıcı firma unvanı" />
              </div>
              <div>
                <Label>Yetkili adı soyadı</Label>
                <Input value={form.yetkiliAdi} disabled={!duzenlenebilir} onChange={e => alan('yetkiliAdi', e.target.value)} />
              </div>
              <div>
                <Label>T.C. kimlik / Vergi no</Label>
                <Input value={form.tcVergiNo} disabled={!duzenlenebilir} onChange={e => alan('tcVergiNo', e.target.value)} />
              </div>
              <div>
                <Label>Vergi dairesi</Label>
                <Input value={form.vergiDairesi} disabled={!duzenlenebilir} onChange={e => alan('vergiDairesi', e.target.value)} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <Label>Adres</Label>
                <Input value={form.adres} disabled={!duzenlenebilir} onChange={e => alan('adres', e.target.value)} />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input value={form.telefon} disabled={!duzenlenebilir} onChange={e => alan('telefon', e.target.value)} />
              </div>
              <div>
                <Label>E-posta</Label>
                <Input type="email" value={form.email} disabled={!duzenlenebilir} onChange={e => { alan('email', e.target.value); setGonderEmail(e.target.value) }} />
              </div>
              <div>
                <Label>İmza yetkilisi</Label>
                <Input value={form.imzaYetkilisi} disabled={!duzenlenebilir} onChange={e => alan('imzaYetkilisi', e.target.value)} placeholder="Boşsa yetkili adı kullanılır" />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', font: '500 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={form.imzaBelgesiIstenir} disabled={!duzenlenebilir}
                    onChange={e => alan('imzaBelgesiIstenir', e.target.checked)}
                    style={{ width: 15, height: 15, accentColor: 'var(--brand-primary)' }} />
                  İmza sirküleri / beyannamesi istenecek
                </label>
              </div>

              <div style={BOLUM}>Proje Bilgileri</div>
              <div>
                <Label>Proje adı</Label>
                <Input value={form.projeAdi} disabled={!duzenlenebilir} onChange={e => alan('projeAdi', e.target.value)} placeholder="Güneşli Otoparkı" />
              </div>
              <div>
                <Label>Lokasyon</Label>
                <Input value={form.lokasyon} disabled={!duzenlenebilir} onChange={e => alan('lokasyon', e.target.value)} />
              </div>
              <div>
                <Label>Belediye / kurum</Label>
                <Input value={form.kurumAdi} disabled={!duzenlenebilir} onChange={e => alan('kurumAdi', e.target.value)} />
              </div>
              <div>
                <Label>Ana yüklenici / müteahhit</Label>
                <Input value={form.anaYuklenici} disabled={!duzenlenebilir} onChange={e => alan('anaYuklenici', e.target.value)} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <Label>İşin konusu</Label>
                <Input value={form.isinKonusu} disabled={!duzenlenebilir} onChange={e => alan('isinKonusu', e.target.value)} />
              </div>
              <div>
                <Label>İş süresi</Label>
                <Input value={form.isSuresi} disabled={!duzenlenebilir} onChange={e => alan('isSuresi', e.target.value)} placeholder="30 iş günü" />
              </div>
              <div>
                <Label>Teslim şekli</Label>
                <Input value={form.teslimSekli} disabled={!duzenlenebilir} onChange={e => alan('teslimSekli', e.target.value)} placeholder="Yerinde teslim / kargo" />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', paddingBottom: 6 }}>
                {[['montajDahil', 'Montaj'], ['devreyeAlmaDahil', 'Devreye alma'], ['egitimDahil', 'Eğitim'], ['bakimDahil', 'Bakım']].map(([k, ad]) => (
                  <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', font: '500 12.5px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={!!form[k]} disabled={!duzenlenebilir}
                      onChange={e => alan(k, e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: 'var(--brand-primary)' }} />
                    {ad}
                  </label>
                ))}
              </div>

              <div style={BOLUM}>Ödeme Bilgileri</div>
              <div>
                <Label>Para birimi</Label>
                <CustomSelect value={form.paraBirimi} disabled={!duzenlenebilir} onChange={e => alan('paraBirimi', e.target.value)}>
                  <option value="TL">TL</option><option value="USD">USD</option><option value="EUR">EUR</option>
                </CustomSelect>
              </div>
              <div>
                <Label>Ödeme tipi</Label>
                <CustomSelect value={form.odemeTipi} disabled={!duzenlenebilir} onChange={e => alan('odemeTipi', e.target.value)}>
                  {ODEME_TIPLERI_SS.map(o => <option key={o.id} value={o.id}>{o.isim}</option>)}
                </CustomSelect>
              </div>
              <div>
                <Label>Vade (gün)</Label>
                <Input type="number" className="sayi-sade" value={form.vadeGunu} disabled={!duzenlenebilir}
                  onChange={e => alan('vadeGunu', e.target.value)} placeholder="0 / 30 / 60 / 90 / 120" />
              </div>
              <div>
                <Label>Vade farkı oranı (aylık %)</Label>
                <Input type="number" step="0.1" className="sayi-sade" value={form.vadeOrani} disabled={!duzenlenebilir}
                  onChange={e => alan('vadeOrani', e.target.value)} placeholder="4,5" />
              </div>
              <div>
                <Label>Damga vergisi oranı</Label>
                <Input type="number" step="0.0001" className="sayi-sade" value={form.damgaOrani} disabled={!duzenlenebilir}
                  onChange={e => alan('damgaOrani', e.target.value)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', font: '500 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={form.damgaDahil} disabled={!duzenlenebilir}
                    onChange={e => alan('damgaDahil', e.target.checked)}
                    style={{ width: 15, height: 15, accentColor: 'var(--brand-primary)' }} />
                  Damga vergisi bedele dahil (binde 9,48)
                </label>
              </div>
              <div>
                <Label>İskonto ({form.paraBirimi})</Label>
                <Input type="number" className="sayi-sade" value={form.iskonto} disabled={!duzenlenebilir} onChange={e => alan('iskonto', e.target.value)} />
              </div>
              <div>
                <Label>Yuvarlama / özel anlaşma</Label>
                <Input type="number" className="sayi-sade" value={form.yuvarlama} disabled={!duzenlenebilir} onChange={e => alan('yuvarlama', e.target.value)} />
              </div>
              <div>
                <Label>Vade / tahsilat tarihi</Label>
                <Input type="date" value={form.vadeTarihi || ''} disabled={!duzenlenebilir} onChange={e => alan('vadeTarihi', e.target.value)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', font: '500 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={form.kurFarkiUygulanir} disabled={!duzenlenebilir}
                    onChange={e => alan('kurFarkiUygulanir', e.target.checked)}
                    style={{ width: 15, height: 15, accentColor: 'var(--brand-primary)' }} />
                  Kur farkı uygulanacak
                </label>
              </div>
              {(form.paraBirimi !== 'TL' || form.kurFarkiUygulanir) && (
                <>
                  <div>
                    <Label>Kur tipi</Label>
                    <CustomSelect value={form.kurTipi} disabled={!duzenlenebilir} onChange={e => alan('kurTipi', e.target.value)}>
                      {KUR_TIPLERI_SS.map(k => <option key={k.id} value={k.id}>{k.isim}</option>)}
                    </CustomSelect>
                  </div>
                  {form.kurTipi === 'ozel' && (
                    <div>
                      <Label>Özel kur (TL)</Label>
                      <Input type="number" step="0.0001" className="sayi-sade" value={form.ozelKur} disabled={!duzenlenebilir} onChange={e => alan('ozelKur', e.target.value)} />
                    </div>
                  )}
                </>
              )}
              {(form.odemeTipi === 'cek' || form.odemeTipi === 'senet') && (
                <>
                  <div>
                    <Label>Çek/senet tarihi</Label>
                    <Input type="date" value={form.cekTarihi || ''} disabled={!duzenlenebilir} onChange={e => alan('cekTarihi', e.target.value)} />
                  </div>
                  <div>
                    <Label>Banka</Label>
                    <Input value={form.cekBankasi} disabled={!duzenlenebilir} onChange={e => alan('cekBankasi', e.target.value)} />
                  </div>
                  <div>
                    <Label>Çek/senet no</Label>
                    <Input value={form.cekNo} disabled={!duzenlenebilir} onChange={e => alan('cekNo', e.target.value)} />
                  </div>
                  <div>
                    <Label>Çek tutarı (TL)</Label>
                    <Input type="number" className="sayi-sade" value={form.cekTutarTl} disabled={!duzenlenebilir} onChange={e => alan('cekTutarTl', e.target.value)} />
                  </div>
                  <div>
                    <Label>Çek düzenleme kuru (TL)</Label>
                    <Input type="number" step="0.0001" className="sayi-sade" value={form.cekKuru} disabled={!duzenlenebilir} onChange={e => alan('cekKuru', e.target.value)} placeholder="Döviz bazlıysa" />
                  </div>
                </>
              )}

              <div style={BOLUM}>Tutar</div>
              <div>
                <Label required>Ana toplam — KDV dahil ({form.paraBirimi})</Label>
                <Input type="number" className="sayi-sade" value={form.anaToplam} disabled={!duzenlenebilir} onChange={e => alan('anaToplam', e.target.value)} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <Label>Notlar (sözleşmeye yazılmaz)</Label>
                <Input value={form.notlar} disabled={!duzenlenebilir} onChange={e => alan('notlar', e.target.value)} />
              </div>
            </div>
          </Card>

          {/* Ürün listesi */}
          {(form.urunListesi || []).length > 0 && (
            <Card>
              <h2 className="t-h2" style={{ marginBottom: 8 }}>Ürün Listesi (Ek-1/Ek-2)</h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', font: '400 12.5px/18px var(--font-sans)' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-tertiary)', textAlign: 'left' }}>
                      <th style={{ padding: '4px 8px' }}>#</th><th style={{ padding: '4px 8px' }}>Kod</th>
                      <th style={{ padding: '4px 8px' }}>Ürün</th><th style={{ padding: '4px 8px' }}>Miktar</th>
                      <th style={{ padding: '4px 8px', textAlign: 'right' }}>Toplam (KDV dahil)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.urunListesi.map((u, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border-default)' }}>
                        <td style={{ padding: '4px 8px' }}>{i + 1}</td>
                        <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{u.stokKodu || '—'}</td>
                        <td style={{ padding: '4px 8px' }}>{u.urunAdi}</td>
                        <td style={{ padding: '4px 8px' }}>{u.miktar} {u.birim}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{paraFmt(u.toplam, form.paraBirimi)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Evrak checklist */}
          {kayit && (kayit.evraklar || []).length > 0 && (
            <Card>
              <h2 className="t-h2" style={{ marginBottom: 4 }}>Talep Edilecek Belgeler (Ek-4)</h2>
              <p className="t-caption" style={{ marginBottom: 10 }}>
                Firma tipine göre otomatik listelendi. Tamamlanmayan belgeler "Eksik Evraklı Sözleşmeler" filtresine düşer.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(kayit.evraklar || []).map((e, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '8px 12px', flexWrap: 'wrap' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                      <input type="checkbox" checked={e.durum === 'tamam'} onChange={() => evrakToggle(idx)}
                        style={{ width: 15, height: 15, accentColor: 'var(--brand-primary)' }} />
                      {e.isim}
                      <Badge tone={e.durum === 'tamam' ? 'aktif' : 'beklemede'}>{e.durum === 'tamam' ? 'Tamam' : 'Bekleniyor'}</Badge>
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {e.dosyaUrl && (
                        <Button variant="ghost" size="sm" iconLeft={<ExternalLink size={13} strokeWidth={1.5} />} onClick={() => evrakAc(e)}>Aç</Button>
                      )}
                      <label style={{ cursor: 'pointer' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', font: '500 12px/16px var(--font-sans)', color: 'var(--text-secondary)' }}>
                          <FileUp size={12} strokeWidth={1.5} /> {e.dosyaUrl ? 'Değiştir' : 'Dosya'}
                        </span>
                        <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
                          onChange={ev => { evrakDosya(idx, ev.target.files?.[0]); ev.target.value = '' }} />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Kur farkı takip */}
          {kurTakipGoster && (
            <Card style={{ borderColor: kayit.kurFarkiDurumu === 'olustu' ? 'var(--warning)' : undefined }}>
              <h2 className="t-h2" style={{ marginBottom: 4 }}>Kur Farkı Takibi</h2>
              <p className="t-caption" style={{ marginBottom: 10 }}>
                Sözleşme {kayit.paraBirimi} bazlı. Çek düzenleme kuru: {kayit.cekKuru ? `${Number(kayit.cekKuru).toLocaleString('tr-TR')} TL` : '—'}
                {kayit.cekTutarTl ? ` · Çek tutarı: ${paraFmt(kayit.cekTutarTl, 'TL')}` : ''}
              </p>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ width: 180 }}>
                  <Label>Tahsil günü kuru (TL)</Label>
                  <Input type="number" step="0.0001" className="sayi-sade" value={tahsilKuru} onChange={e => setTahsilKuru(e.target.value)} placeholder="43,00" />
                </div>
                <Button variant="secondary" iconLeft={<Calculator size={14} strokeWidth={1.5} />} onClick={() => kurFarkiKaydetTikla(false)}>
                  Hesapla ve Kaydet
                </Button>
                {kurFarki?.saticiAleyhine && kayit.kurFarkiDurumu !== 'faturalandi' && (
                  <Button variant="primary" onClick={() => kurFarkiKaydetTikla(true)}>
                    Faturalandı İşaretle
                  </Button>
                )}
                {kayit.kurFarkiDurumu === 'faturalandi' && <Badge tone="aktif">Kur farkı faturalandı</Badge>}
              </div>
              {kurFarki && (
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: kurFarki.saticiAleyhine ? 'var(--warning-soft)' : 'var(--surface-sunken)', font: '400 13px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
                  Çek/TL karşılığı: <strong>{paraFmt(kurFarki.cekTutarTl, 'TL')}</strong> · Tahsil günü değeri: <strong>{paraFmt(kurFarki.vadeDegeriTl, 'TL')}</strong>
                  <br />
                  {kurFarki.saticiAleyhine ? (
                    <span style={{ color: 'var(--warning)', fontWeight: 600 }}>
                      <AlertTriangle size={13} strokeWidth={1.75} style={{ verticalAlign: '-2px' }} /> Bu sözleşmede {paraFmt(kurFarki.kurFarkiTl, 'TL')} kur farkı oluşmuştur. Kur farkı faturası oluşturulsun mu?
                    </span>
                  ) : (
                    <span style={{ color: 'var(--success)' }}>Satıcı aleyhine kur farkı oluşmadı.</span>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>

        {/* ---------- SAĞ: hesap özeti + aksiyonlar ---------- */}
        <div style={{ position: 'sticky', top: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card>
            <h2 className="t-h2" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Calculator size={16} strokeWidth={1.75} /> Hesap Özeti
            </h2>
            {[
              ['Ana toplam (KDV dahil)', paraFmt(hesap.anaToplam, form.paraBirimi)],
              [`Vade farkı${Number(form.vadeGunu) ? ` (${form.vadeGunu} gün × %${Number(form.vadeOrani || 0).toLocaleString('tr-TR')}/ay)` : ''}`, paraFmt(hesap.vadeFarki, form.paraBirimi)],
              [`Damga vergisi${form.damgaDahil ? ' (binde 9,48)' : ' (hariç)'}`, paraFmt(hesap.damgaVergisi, form.paraBirimi)],
              ['İskonto', `− ${paraFmt(form.iskonto || 0, form.paraBirimi)}`],
              ...(Number(form.yuvarlama) ? [['Yuvarlama / özel anlaşma', paraFmt(form.yuvarlama, form.paraBirimi)]] : []),
            ].map(([etiket, deger]) => (
              <div key={etiket} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, font: '400 12.5px/22px var(--font-sans)', color: 'var(--text-secondary)' }}>
                <span>{etiket}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{deger}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-default)', font: '700 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
              <span>NİHAİ BEDEL</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--brand-primary)' }}>{paraFmt(hesap.nihaiToplam, form.paraBirimi)}</span>
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {duzenlenebilir && (
                <Button variant="primary" onClick={() => kaydet()} disabled={mesgul}>
                  {mesgul ? 'Kaydediliyor…' : (kayit ? 'Kaydet' : 'Taslak Kaydet')}
                </Button>
              )}
              <Button variant="secondary" iconLeft={<Eye size={14} strokeWidth={1.5} />} onClick={() => setOnizleme(true)}>
                Önizle
              </Button>
              <Button variant="secondary" iconLeft={<Printer size={14} strokeWidth={1.5} />} onClick={yazdir}>
                Yazdır / PDF
              </Button>

              {kayit && kayit.durum === 'taslak' && (
                <Button variant="primary" iconLeft={<Send size={14} strokeWidth={1.5} />} onClick={onayaGonderTikla} disabled={mesgul}>
                  Yönetici Onayına Gönder
                </Button>
              )}

              {kayit && kayit.durum === 'yonetici_onayinda' && (
                admin ? (
                  <>
                    <Button variant="primary" iconLeft={<CheckCircle2 size={14} strokeWidth={1.5} />} onClick={onaylaTikla}>
                      Onayla ve Kilitle
                    </Button>
                    <Button variant="ghost" style={{ color: 'var(--danger)' }} iconLeft={<XCircle size={14} strokeWidth={1.5} />} onClick={() => setRedAcik(true)}>
                      Reddet
                    </Button>
                  </>
                ) : (
                  <p className="t-caption">Yönetici; oranları, vade farkını, iskontoyu ve kur maddelerini kontrol ediyor.</p>
                )
              )}

              {kayit && ['onaylandi', 'gonderildi'].includes(kayit.durum) && (
                <>
                  <Button variant="primary" iconLeft={<Send size={14} strokeWidth={1.5} />} onClick={() => setGonderAcik(v => !v)}>
                    Müşteriye Gönder
                  </Button>
                  <Button variant="secondary" iconLeft={<FileUp size={14} strokeWidth={1.5} />} onClick={() => imzaliRef.current?.click()} disabled={mesgul}>
                    İmzalı PDF Yükle
                  </Button>
                </>
              )}

              {kayit?.imzaliPdfUrl && (
                <Button variant="secondary" iconLeft={<ExternalLink size={14} strokeWidth={1.5} />} onClick={imzaliAc}>
                  İmzalı PDF'i Aç
                </Button>
              )}

              {kayit && kilitli && admin && kayit.durum !== 'imzalandi' && (
                <Button variant="ghost" iconLeft={<Unlock size={14} strokeWidth={1.5} />} onClick={kilidiAcTikla}>
                  Kilidi Aç (Revizyon)
                </Button>
              )}

              {kayit && !['iptal', 'imzalandi'].includes(kayit.durum) && (
                <Button variant="ghost" style={{ color: 'var(--danger)' }} iconLeft={<XCircle size={14} strokeWidth={1.5} />} onClick={iptalTikla}>
                  İptal Et
                </Button>
              )}
            </div>

            {gonderAcik && kayit && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-default)' }}>
                <Label>Müşteri e-posta</Label>
                <Input type="email" value={gonderEmail} onChange={e => setGonderEmail(e.target.value)} placeholder="musteri@firma.com" />
                <Button variant="primary" style={{ marginTop: 8, width: '100%' }} onClick={gonder} disabled={mesgul}>
                  {mesgul ? 'Gönderiliyor…' : 'E-posta Gönder'}
                </Button>
              </div>
            )}

            {redAcik && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-default)' }}>
                <Label>Red sebebi</Label>
                <Textarea rows={2} value={redSebep} onChange={e => setRedSebep(e.target.value)} />
                <Button variant="primary" style={{ marginTop: 8, width: '100%' }} onClick={reddetTikla}>Reddet ve Taslağa Gönder</Button>
              </div>
            )}
          </Card>

          {kayit && (
            <Card>
              <h2 className="t-h2" style={{ marginBottom: 8 }}>Süreç</h2>
              {[
                ['Hazırlayan', kayit.hazirlayanAd, kayit.olusturmaTarih],
                ['Onaya gönderim', null, kayit.onayaGonderimTarihi],
                ['Yönetici onayı', kayit.onaylayanAd, kayit.onayTarihi],
                ['Müşteriye gönderim', null, kayit.gonderimTarihi],
                ['İmza', null, kayit.imzaTarihi],
              ].map(([etiket, kim, tarih]) => (
                <div key={etiket} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, font: '400 12px/20px var(--font-sans)', color: tarih ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                  <span>{etiket}{kim ? ` — ${kim}` : ''}</span>
                  <span>{tarih ? trTarih(tarih) : '—'}</span>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>

      <input ref={imzaliRef} type="file" accept="application/pdf" style={{ display: 'none' }}
        onChange={e => { imzaliYukle(e.target.files?.[0]); e.target.value = '' }} />

      {onizleme && (
        <Modal open onClose={() => setOnizleme(false)} title={`Önizleme — ${kayit?.sozlesmeNo || 'Taslak'}`} width={900}>
          <div style={{ maxHeight: '68vh', overflow: 'auto', background: '#fff', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '8px 16px' }}>
            {/* İçerik kendi ürettiğimiz HTML — güvenli */}
            <div dangerouslySetInnerHTML={{ __html: icerikHtml().replace(/position:\s*fixed/g, 'position: static') }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <Button variant="secondary" iconLeft={<Printer size={14} strokeWidth={1.5} />} onClick={yazdir}>Yazdır / PDF</Button>
            <Button variant="ghost" onClick={() => setOnizleme(false)}>Kapat</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
