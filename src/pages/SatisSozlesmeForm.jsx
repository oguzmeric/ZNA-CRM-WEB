// Satış Sözleşmesi formu (mig 156) — teklif/siparişten veya bağımsız üretim.
// Rotalar: /sozlesmeler/satis/yeni (?teklifId= | ?siparisId=) ve /sozlesmeler/satis/:id
// Akış: taslak → yönetici onayı → onaylandı (KİLİTLİ) → müşteriye gönderildi →
// imzalandı → (bağlı sipariş "Sözleşmeli Sipariş"). Kur farkı takibi imza sonrası.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, FileSignature, Lock, Unlock, Printer, Send, FileUp, ExternalLink,
  Eye, CheckCircle2, XCircle, AlertTriangle, Calculator, Plus, Trash2, Wallet,
} from 'lucide-react'
import { Button, Card, Badge, Input, Label, Textarea, Modal } from '../components/ui'
import CustomSelect from '../components/CustomSelect'
import { SkeletonList } from '../components/Skeleton'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import BelgePaylasModal from '../components/BelgePaylasModal'
import BelgeOnizlemeModal from '../components/BelgeOnizlemeModal'
import { teklifleriGetir, teklifGetir } from '../services/teklifService'
import { siparisGetir, kalemleriGetir } from '../services/siparisService'
import { musteriGetir, musterileriGetir } from '../services/musteriService'
import { gorusmeGetir, gorusmeleriGetir } from '../services/gorusmeService'
import {
  satisSozlesmeGetir, satisSozlesmeEkle, satisSozlesmeGuncelle, hesapVeIcerikHazirla,
  onayaGonder, sozlesmeOnayla, sozlesmeReddet, gonderildiIsaretle, sozlesmeIptalEt, kilidiAc,
  imzaliSozlesmeYukleSS, ssDosyaUrl, ssDosyaYukle, kurFarkiKaydet,
  tekliftenForm, siparistenForm, musteridenKunye, teklifinAktifSozlesmesi,
  sozlesmeTeklifleriGetir, sozlesmeTekliflerimiKaydet, teklifiSozlesmeSatiri, tekliflerdenBirlesik,
  paraBirimiCakismasi, imzaGecmisiGetir, satisSozlesmeSil,
} from '../services/satisSozlesmeService'
import {
  sozlesmeHesapla, kurFarkiHesapla, paraFmt,
  odemePlaniHesapla, ODEME_SATIR_TIPLERI, ODEME_PLANI_SABLONLARI, BOS_ODEME_SATIRI,
} from '../lib/satisSozlesmeHesap'
import {
  SABLON_TIPLERI_SS, FIRMA_TIPLERI_SS, ODEME_TIPLERI_SS, KUR_TIPLERI_SS, SS_DURUMLARI,
  evrakListesiUret, sozlesmeHtmlUret, ssBelgeGoster,
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
  paraBirimi: 'TL', odemeTipi: 'pesin', vadeGunu: 0, vadeOrani: 0, odemePlani: [],
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

// Ödeme planı / teklif tabloları — dar hücreler, satır içi input'lar.
// 10 kolon karta sığmıyordu: başlıklar kısaltıldı, banka + belge no tek hücrede
// birleştirildi, input yükseklikleri düşürüldü.
const TBL_TH = {
  padding: '3px 4px', font: '600 10.5px/14px var(--font-sans)', color: 'var(--text-tertiary)',
  textAlign: 'left', whiteSpace: 'nowrap',
}
const TBL_TD = { padding: '2px 4px', verticalAlign: 'middle' }
const MINI_INPUT = { height: 30, fontSize: 12, padding: '0 6px' }
const SABLON_CHIP = {
  padding: '3px 9px', borderRadius: 999, border: '1px solid var(--border-default)',
  background: 'var(--surface-card)', color: 'var(--text-secondary)',
  font: '500 11px/15px var(--font-sans)', cursor: 'pointer', whiteSpace: 'nowrap',
}

const trNorm = (s) => (s || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim()

// Teklif/siparişin müşteri kartını bul. Tekliflerin ~yarısında musteri_id BOŞ
// (firma yalnız isimle yazılmış) — bu durumda firma adından eşleştiriyoruz,
// yoksa künye otomatiği tekliflerin yarısında sessizce çalışmaz.
// Not: musterileriGetir liste sorgusu vergi_no/adres kolonlarını çekmez; id'yi
// bulup tam kaydı musteriGetir ile alıyoruz.
const musteriKartiBul = async ({ musteriId, firmaAdi }) => {
  if (musteriId) {
    const m = await musteriGetir(Number(musteriId)).catch(() => null)
    if (m) return m
  }
  const hedef = trNorm(firmaAdi)
  if (!hedef) return null
  const liste = await musterileriGetir().catch(() => [])
  const eslesen = (liste || []).filter(m => trNorm(m.firma) === hedef)
  if (!eslesen.length) return null
  return musteriGetir(eslesen[0].id).catch(() => null)
}

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
  // Bağlı teklifler (mig 247). form İÇİNDE TUTULMAZ: satis_sozlesmeleri'nde böyle bir
  // kolon yok, payload'a karışırsa PostgREST insert'i düşer.
  const [sozTeklifler, setSozTeklifler] = useState([])
  const [teklifEkleId, setTeklifEkleId] = useState('')
  const [teklifler, setTeklifler] = useState([])
  const [gorusmeler, setGorusmeler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [mesgul, setMesgul] = useState(false)
  const [onizleme, setOnizleme] = useState(false)
  const [belge, setBelge] = useState(null)       // { url, baslik, indirmeAdi } — depodaki PDF
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
      const [s, bagliTeklifler] = await Promise.all([
        satisSozlesmeGetir(Number(id)),
        sozlesmeTeklifleriGetir(Number(id)),
      ])
      if (s) { setKayit(s); setForm(kayittanForma(s)); setGonderEmail(s.email || '') }
      setSozTeklifler(bagliTeklifler || [])
    } else if (params.get('teklifId')) {
      // Teklif başına tek sözleşme (mig 186) — varsa yenisini açma, mevcuda git
      const mevcut = await teklifinAktifSozlesmesi(params.get('teklifId'))
      if (mevcut) {
        toast.info(`Bu tekliften zaten sözleşme oluşturulmuş: ${mevcut.sozlesmeNo}`)
        navigate(`/sozlesmeler/satis/${mevcut.id}`, { replace: true })
        return
      }
      const t = await teklifGetir(Number(params.get('teklifId')))
      if (t) {
        await tekliftenDoldur(t)
        setSozTeklifler([teklifiSozlesmeSatiri(t)])   // ilk teklif listeye de girer (mig 247)
      }
    } else if (params.get('siparisId')) {
      const sip = await siparisGetir(Number(params.get('siparisId')))
      if (sip) await siparistenDoldur(sip)
    }
    setYukleniyor(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => { yukle() }, [yukle])

  const tekliftenDoldur = async (t) => {
    // Teklif kaydı firma künyesini (vergi no, vergi dairesi, adres, iletişim)
    // tutmuyor — müşteri kartında duruyor. Sözleşmede elle doldurulmasın diye
    // müşteriyi de çekip birleştiriyoruz.
    const [g, musteri] = await Promise.all([
      t.gorusmeId ? gorusmeGetir(t.gorusmeId).catch(() => null) : Promise.resolve(null),
      musteriKartiBul({ musteriId: t.musteriId, firmaAdi: t.firmaAdi }),
    ])
    const veri = tekliftenForm(t, g?.gorusmeNo || '')
    const kunye = musteridenKunye(musteri)
    setForm(f => ({
      ...f, ...kunye, ...veri,
      // Teklifteki değer önce; boşsa müşteri kartından
      firmaAdi:   veri.firmaAdi   || kunye.firmaAdi   || f.firmaAdi,
      yetkiliAdi: veri.yetkiliAdi || kunye.yetkiliAdi || f.yetkiliAdi,
      // Teklifte bağ yoksa isimden bulduğumuz kartı sözleşmeye bağla
      musteriId:  veri.musteriId  || musteri?.id      || f.musteriId,
    }))
    setGonderEmail(kunye.email || '')
    const eksik = ['tcVergiNo', 'vergiDairesi', 'adres'].filter(k => !kunye[k])
    toast.success(
      `${t.teklifNo || 'Teklif'} bilgileri yüklendi — ana toplam KDV dahil ${paraFmt(veri.anaToplam, veri.paraBirimi)}.` +
      (musteri && eksik.length ? ' Müşteri kartında vergi/adres bilgisi eksik.' : '')
    )
  }

  const siparistenDoldur = async (sip) => {
    // musterileriGetir liste sorgusu vergi_no / vergi_dairesi / adres kolonlarını
    // ÇEKMEZ (MUSTERI_LISTE_KOLONLARI) — künye boş kalırdı. Tek kaydı tam çekiyoruz.
    const [kalemler, musteri] = await Promise.all([
      kalemleriGetir(sip.id).catch(() => []),
      musteriKartiBul({ musteriId: sip.musteriId }),
    ])
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
    // Firma künyesi (vergi no / vergi dairesi / adres / firma tipi) müşteri kartında
    const kunye = musteridenKunye(musteri)
    setForm(f => ({ ...f, ...kunye, ...veri, ...ek }))
    setGonderEmail(veri.email || kunye.email || '')
    toast.success(`${sip.siparisNo || 'Sipariş'} bilgileri yüklendi.`)
  }

  // ---- Çoklu teklif (mig 247) ----
  // Teklif listesi değişince ana toplam, ürün listesi ve teklif numaraları tekliflerden türetilir.
  const tekliflerdenFormaYansit = (liste) => {
    const b = tekliflerdenBirlesik(liste)
    setForm(f => ({
      ...f,
      teklifId: b.teklifId,
      teklifNo: b.teklifNo || f.teklifNo,
      urunListesi: b.urunListesi,
      // Liste boşaldıysa elle girilmiş tutarı silmiyoruz
      anaToplam: b.anaToplam || f.anaToplam,
    }))
  }

  const teklifEkleTikla = async () => {
    const tid = Number(teklifEkleId)
    if (!tid) { toast.error('Eklenecek teklifi seçin.'); return }
    if (sozTeklifler.some(t => Number(t.teklifId) === tid)) { toast.info('Bu teklif zaten ekli.'); return }
    setMesgul(true)
    const t = await teklifGetir(tid).catch(() => null)
    setMesgul(false)
    if (!t) { toast.error('Teklif okunamadı.'); return }
    const satir = teklifiSozlesmeSatiri(t)
    // 9.152 EUR + 45.599 USD toplanamaz — ilk teklif para birimini belirler, sonrakiler uymalı
    const cakisma = sozTeklifler.length ? paraBirimiCakismasi(sozTeklifler, satir, form.paraBirimi) : null
    if (cakisma) { toast.error(cakisma); return }
    // İlk teklif firma künyesini de doldurur; sonrakiler yalnız kalem ve tutar ekler
    if (!sozTeklifler.length) await tekliftenDoldur(t)
    const yeni = [...sozTeklifler, satir]
    setSozTeklifler(yeni)
    tekliflerdenFormaYansit(yeni)
    setTeklifEkleId('')
    toast.success(`${satir.teklifNo || `#${tid}`} eklendi — ${paraFmt(satir.tutar, form.paraBirimi)}`)
  }

  const teklifKaldirTikla = (teklifId) => {
    const yeni = sozTeklifler.filter(t => Number(t.teklifId) !== Number(teklifId))
    setSozTeklifler(yeni)
    tekliflerdenFormaYansit(yeni)
  }

  const tekliflerToplami = useMemo(
    () => sozTeklifler.reduce((a, t) => a + (Number(t.tutar) || 0), 0),
    [sozTeklifler],
  )

  // Eklenebilir teklifler: zaten bağlı olanlar düşer, aynı müşterinin teklifleri üste
  // çıkar (çoklu teklif senaryosu daima tek firmada geçer).
  const eklenebilirTeklifler = useMemo(() => {
    const ekli = new Set(sozTeklifler.map(t => Number(t.teklifId)))
    const liste = (teklifler || []).filter(t => !ekli.has(Number(t.id)))
    const firma = trNorm(form.firmaAdi)
    if (!firma && !form.musteriId) return liste.slice(0, 200)
    const ayniMi = (t) =>
      (form.musteriId && Number(t.musteriId) === Number(form.musteriId)) || (firma && trNorm(t.firmaAdi) === firma)
    const ayni = liste.filter(ayniMi)
    const diger = liste.filter(t => !ayniMi(t)).slice(0, 200)
    return [...ayni, ...diger]
  }, [teklifler, sozTeklifler, form.firmaAdi, form.musteriId])

  // ---- Parçalı ödeme planı (mig 247) ----
  const plan = useMemo(
    () => odemePlaniHesapla(form.odemePlani, hesap.nihaiToplam),
    [form.odemePlani, hesap.nihaiToplam],
  )

  const planSatirGuncelle = (idx, kolon, deger) => {
    const liste = [...(form.odemePlani || [])]
    liste[idx] = { ...liste[idx], [kolon]: deger }
    // Oran girilirse tutar ondan TÜRETİLİR (odemePlaniHesapla) — elle tutar girilecekse oran boşaltılır
    if (kolon === 'yuzde' && deger !== '') liste[idx].tutar = ''
    if (kolon === 'tutar' && deger !== '') liste[idx].yuzde = ''
    alan('odemePlani', liste)
  }

  const planSatirEkle = () => alan('odemePlani', [...(form.odemePlani || []), { ...BOS_ODEME_SATIRI }])
  const planSatirSil = (idx) => alan('odemePlani', (form.odemePlani || []).filter((_, i) => i !== idx))
  const planSablonUygula = (sablon) => {
    alan('odemePlani', sablon.satirlar.map(s => ({ ...BOS_ODEME_SATIRI, ...s })))
    toast.success(`"${sablon.isim}" planı uygulandı — tutarlar nihai bedelden hesaplandı.`)
  }
  const agirlikliVadeUygula = () => {
    alan('vadeGunu', plan.agirlikliVade)
    toast.success(`Vade ${plan.agirlikliVade} güne ayarlandı — vade farkı bu süreden hesaplanacak.`)
  }

  // ---- Kaydet ----
  const dogrula = () => {
    if (!form.firmaAdi?.trim()) { toast.error('Firma adı zorunludur.'); return false }
    if (!Number(form.anaToplam)) { toast.error('Ana toplam (KDV dahil) girilmelidir.'); return false }
    if ((form.odemeTipi === 'cek' || form.odemeTipi === 'senet') && !form.vadeTarihi && !form.cekTarihi) {
      toast.error('Çekli/senetli ödemede çek tarihi veya vade tarihi girilmelidir.'); return false
    }
    if (form.odemeTipi === 'parcali' && !(form.odemePlani || []).length) {
      toast.error('Parçalı ödemede en az bir ödeme satırı girilmelidir.'); return false
    }
    return true
  }

  const kaydet = async (sessiz = false) => {
    if (kilitli) { toast.error('Sözleşme kilitli — değişiklik için yönetici kilidi açmalı.'); return null }
    if (!dogrula()) return null
    setMesgul(true)
    const hazir = hesapVeIcerikHazirla({
      ...form, sozlesmeTeklifleri: sozTeklifler,
      sozlesmeNo: kayit?.sozlesmeNo, olusturmaTarih: kayit?.olusturmaTarih,
    })
    const payload = {
      ...form,
      ozelKur: form.ozelKur || null, cekTutarTl: form.cekTutarTl || null, cekKuru: form.cekKuru || null,
      cekTarihi: form.cekTarihi || null, vadeTarihi: form.vadeTarihi || null,
      odemePlani: form.odemeTipi === 'parcali' ? (form.odemePlani || []) : [],
      anaToplam: hazir.anaToplam, vadeFarki: hazir.vadeFarki,
      damgaVergisi: hazir.damgaVergisi, nihaiToplam: hazir.nihaiToplam,
      evraklar: hazir.evraklar, uretilenIcerik: hazir.uretilenIcerik,
    }
    let sonuc = kayit
      ? await satisSozlesmeGuncelle(kayit.id, payload)
      : await satisSozlesmeEkle({ ...payload, hazirlayanId: kullanici?.id || null, hazirlayanAd: kullanici?.ad || null })
    if (sonuc?._hata) { setMesgul(false); toast.error('Kaydedilemedi: ' + sonuc._hata); return null }

    // Bağlı teklifleri ara tabloya yansıt (mig 247). Tekillik trigger'ı bir teklifi
    // reddederse sözleşme kaydı ayakta kalır, kullanıcı hangi teklif olduğunu görür.
    const tSonuc = await sozlesmeTekliflerimiKaydet(sonuc.id, sozTeklifler)
    if (tSonuc?._hata) toast.error('Teklif bağlanamadı — ' + tSonuc._hata)

    // teklif_no DB trigger'ında birleştiriliyor ("TEK-1, TEK-2") → belge içeriğini
    // taze numarayla yeniden üret. Yeni kayıtta sözleşme numarası da bu turda gelir.
    const [taze, bagli] = await Promise.all([
      satisSozlesmeGetir(sonuc.id),
      sozlesmeTeklifleriGetir(sonuc.id),
    ])
    setSozTeklifler(bagli || [])
    const hazir2 = hesapVeIcerikHazirla({
      ...form,
      teklifNo: taze?.teklifNo ?? form.teklifNo,
      sozlesmeTeklifleri: bagli,
      sozlesmeNo: sonuc.sozlesmeNo, olusturmaTarih: sonuc.olusturmaTarih,
      evraklar: hazir.evraklar,
    })
    sonuc = await satisSozlesmeGuncelle(sonuc.id, { uretilenIcerik: hazir2.uretilenIcerik })
    setMesgul(false)
    if (sonuc?._hata) { toast.error('Belge içeriği güncellenemedi: ' + sonuc._hata); return null }
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
    // İmzalı sözleşmede uyarı çok daha sert: müşterinin imzaladığı metin değişecek
    const imzali = kayit?.durum === 'imzalandi'
    const onay = await confirm({
      baslik: imzali ? 'İmzalı Sözleşmeyi Revizyona Aç' : 'Kilidi Aç',
      mesaj: imzali
        ? `${kayit.sozlesmeNo} MÜŞTERİ TARAFINDAN İMZALANMIŞ. Kilidi açarsanız:\n\n` +
          `• Mevcut imzalı PDF arşivlenir (kaybolmaz, "Önceki İmzalı Sürümler"de kalır)\n` +
          `• Sözleşme Rev. ${(Number(kayit.revizyonNo) || 0) + 1} olarak taslağa döner\n` +
          `• Değişiklikten sonra yeniden onay ve YENİDEN İMZA gerekir\n\n` +
          `Müşterinin imzaladığı metinle sistemdeki metin farklılaşacağı için, yeni sürümü ` +
          `mutlaka yeniden imzalatın. Devam edilsin mi?`
        : 'Sözleşme taslağa dönecek ve yeniden yönetici onayı gerekecek. Devam edilsin mi?',
      onayMetin: imzali ? 'Revizyona Aç' : 'Kilidi Aç', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    setMesgul(true)
    const g = await kilidiAc(kayit, kullanici)
    setMesgul(false)
    if (g?._hata) { toast.error(g._hata); return }
    setKayit(g)
    toast.success(imzali
      ? `Rev. ${g.revizyonNo} açıldı — önceki imzalı sürüm arşivlendi. Değişiklik sonrası yeniden imzalatın.`
      : 'Kilit açıldı — sözleşme taslağa döndü.')
  }

  // Kalıcı silme (admin) — iptal arşivde tutar, bu geri alınamaz
  const silTikla = async () => {
    const onay = await confirm({
      baslik: 'Sözleşmeyi Kalıcı Sil',
      mesaj: `${kayit.sozlesmeNo} (${durum.isim}) KALICI olarak silinecek.\n\n` +
        `• Bağlı ${sozTeklifler.length} teklif kaydı ile bağı kopar\n` +
        `• Yüklenen imzalı PDF ve evraklar silinir\n` +
        `• Geri alınamaz\n\n` +
        `Kaydı arşivde tutmak istiyorsanız "İptal Et" kullanın. Silinsin mi?`,
      onayMetin: 'Kalıcı Sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    setMesgul(true)
    const g = await satisSozlesmeSil(kayit)
    setMesgul(false)
    if (g?._hata) { toast.error('Silinemedi: ' + g._hata); return }
    toast.success(`${kayit.sozlesmeNo} silindi.`)
    navigate('/sozlesmeler')
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
    || hesapVeIcerikHazirla({ ...form, sozlesmeTeklifleri: sozTeklifler, sozlesmeNo: kayit?.sozlesmeNo }).uretilenIcerik

  const yazdir = () => {
    const w = window.open('', '_blank', 'width=920,height=1000')
    if (!w) { toast.error('Açılır pencere engellendi.'); return }
    w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><base href="${window.location.origin}/"><title>${kayit?.sozlesmeNo || 'Satış Sözleşmesi'}</title></head><body>${ssBelgeGoster(icerikHtml())}<script>window.onload = () => setTimeout(() => window.print(), 400)</scr` + `ipt></body></html>`)
    w.document.close()
  }

  // ---- Müşteriye gönder ----
  // Gönderim ortak BelgePaylasModal ile yapılıyor (e-posta / SMS / ikisi).
  // Eskiden bu sayfada kanal 'mail' olarak sabitlenmişti; altyapı SMS'i zaten
  // destekliyordu (belge-paylas edge fn satis_sozlesme SMS metnini üretiyor).
  const gonderildiSonrasi = async () => {
    try {
      const g = await gonderildiIsaretle(kayit.id)
      if (!g?._hata) setKayit(g)
    } catch (e) {
      console.warn('[SatisSozlesmeForm] gonderildiIsaretle:', e?.message)
    }
  }

  const gonderOzelMesaj = kayit
    ? `Satış sözleşmenizi görüntüleyip yazdırdıktan sonra kaşe ve imza ile PDF olarak tarafımıza iletiniz. Nihai sözleşme bedeli: ${paraFmt(kayit.nihaiToplam, kayit.paraBirimi)}.`
    : ''

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

  // Belgeler uygulama İÇİNDE açılır: signed URL adres çubuğuna (ve geçmişe)
  // düşmesin, PDF sayfaya sığdırılsın. Bkz. BelgeOnizlemeModal.
  const belgeAc = async (yol, baslik, indirmeAdi) => {
    const url = await ssDosyaUrl(yol)
    if (url) setBelge({ url, baslik, indirmeAdi })
    else toast.error('Dosya açılamadı.')
  }

  const belgeAdi = (ek) => {
    const no = (kayit?.sozlesmeNo || 'sozlesme').replace(/[\\/:*?"<>|]/g, '-')
    return `${no}${ek}.pdf`
  }

  const imzaliAc = () =>
    belgeAc(kayit.imzaliPdfUrl, `${kayit.sozlesmeNo} — İmzalı Nüsha`, belgeAdi(' - imzali'))

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

  const evrakAc = (e) =>
    belgeAc(e.dosyaUrl, `${kayit.sozlesmeNo} — ${e.isim || 'Evrak'}`,
      belgeAdi(` - ${(e.isim || 'evrak').replace(/[\\/:*?"<>|]/g, '-')}`))

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
            {/* mig 248: imzadan sonra revize edildiyse kaçıncı sürüm olduğu görünsün */}
            {Number(kayit?.revizyonNo) > 0 && (
              <Badge tone="uyari" title="İmzadan sonra revize edildi">Rev. {kayit.revizyonNo}</Badge>
            )}
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
                <Input value={form.teklifNo} disabled={!duzenlenebilir || sozTeklifler.length > 0}
                  onChange={e => alan('teklifNo', e.target.value)} placeholder="TEK-0123" />
                {sozTeklifler.length > 0 && (
                  <p className="t-caption" style={{ marginTop: 3 }}>Bağlı tekliflerden otomatik yazılıyor.</p>
                )}
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

              {/* Parçalı ödeme planı (mig 247) — "%30 nakit ön ödeme + 60/90 gün çek" gibi
                  anlaşmalar tek satırlık ödeme tipine sığmıyordu */}
              {form.odemeTipi === 'parcali' && (
                <div style={{
                  gridColumn: '1 / -1', border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)', padding: 12, background: 'var(--surface-subtle)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                      <Wallet size={15} strokeWidth={1.75} /> Parçalı Ödeme Planı
                    </span>
                    {duzenlenebilir && (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {ODEME_PLANI_SABLONLARI.map(s => (
                          <button key={s.id} type="button" style={SABLON_CHIP} onClick={() => planSablonUygula(s)}>
                            {s.isim}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="t-caption" style={{ marginBottom: 8 }}>
                    Her satırın üst şeridi ödeme şekli · oran · tutar · vade, alt şeridi vade tarihi, banka, çek no ve
                    açıklama. Oran girerseniz tutar nihai bedelden hesaplanır; tutarı elle yazmak için oranı boş bırakın.
                  </p>

                  {/* Satır kartları — 9 kolonluk tablo bu kartın içine (≈570px) sığmıyor,
                      yatay kaydırma gerekiyordu. Her ödeme iki şeride bölündü:
                      üstte tutar bilgisi, altta belge/açıklama. Kaydırma kalktı. */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(form.odemePlani || []).map((p, i) => {
                      const oranModu = p.yuzde !== '' && p.yuzde != null && Number(p.yuzde) > 0
                      const hesapli = plan.satirlar[i] || {}
                      return (
                        <div key={i} style={{
                          border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                          background: 'var(--surface-card)', padding: '6px 8px',
                          display: 'flex', flexDirection: 'column', gap: 5,
                        }}>
                          {/* Üst şerit: ne, ne kadar, ne zaman.
                              flexWrap: dar ekranda (sağ özet kolonu sabit 280px olduğu için
                              form kolonu ~380px'e düşebiliyor) alanlar alt satıra iner, taşmaz. */}
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ width: 14, flexShrink: 0, color: 'var(--text-tertiary)', font: '600 11px/15px var(--font-sans)' }}>{i + 1}</span>
                            <div style={{ width: 112, flexShrink: 0 }}>
                              <CustomSelect value={p.tip || 'nakit'} disabled={!duzenlenebilir}
                                onChange={e => planSatirGuncelle(i, 'tip', e.target.value)}>
                                {ODEME_SATIR_TIPLERI.map(t => <option key={t.id} value={t.id}>{t.isim}</option>)}
                              </CustomSelect>
                            </div>
                            <div style={{ width: 66, flexShrink: 0, position: 'relative' }}>
                              <Input type="number" className="sayi-sade" style={{ ...MINI_INPUT, paddingRight: 18 }} placeholder="30"
                                title="Bedele oranı" value={p.yuzde ?? ''} disabled={!duzenlenebilir}
                                onChange={e => planSatirGuncelle(i, 'yuzde', e.target.value)} />
                              <span style={{ position: 'absolute', right: 6, top: 7, font: '500 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', pointerEvents: 'none' }}>%</span>
                            </div>
                            <div style={{ flex: 1, minWidth: 84, textAlign: 'right' }}>
                              {oranModu ? (
                                <span title="Orandan hesaplandı" style={{ font: '600 12.5px/30px var(--font-sans)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                  {paraFmt(hesapli.tutar, form.paraBirimi)}
                                </span>
                              ) : (
                                <Input type="number" className="sayi-sade" style={{ ...MINI_INPUT, textAlign: 'right' }}
                                  placeholder="Tutar" title="Tutarı elle gir" value={p.tutar ?? ''} disabled={!duzenlenebilir}
                                  onChange={e => planSatirGuncelle(i, 'tutar', e.target.value)} />
                              )}
                            </div>
                            <div style={{ width: 78, flexShrink: 0, position: 'relative' }}>
                              <Input type="number" className="sayi-sade" style={{ ...MINI_INPUT, paddingRight: 26 }} placeholder="0"
                                title="Vade (gün)" value={p.vadeGunu ?? 0} disabled={!duzenlenebilir}
                                onChange={e => planSatirGuncelle(i, 'vadeGunu', e.target.value)} />
                              <span style={{ position: 'absolute', right: 5, top: 7, font: '500 10.5px/16px var(--font-sans)', color: 'var(--text-tertiary)', pointerEvents: 'none' }}>gün</span>
                            </div>
                            {duzenlenebilir && (
                              <button type="button" onClick={() => planSatirSil(i)} title="Satırı sil"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 2, display: 'inline-flex', flexShrink: 0, marginLeft: 'auto' }}>
                                <Trash2 size={13} strokeWidth={1.75} />
                              </button>
                            )}
                          </div>
                          {/* Alt şerit: belge bilgileri ve not */}
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingLeft: 20, flexWrap: 'wrap' }}>
                            <div style={{ width: 122, flexShrink: 0 }}>
                              <Input type="date" style={{ ...MINI_INPUT, fontSize: 11.5, padding: '0 4px' }} title="Vade tarihi"
                                value={p.vadeTarihi || ''} disabled={!duzenlenebilir}
                                onChange={e => planSatirGuncelle(i, 'vadeTarihi', e.target.value)} />
                            </div>
                            <div style={{ width: 96, flexShrink: 0 }}>
                              <Input style={MINI_INPUT} placeholder="Banka" value={p.banka || ''} disabled={!duzenlenebilir}
                                onChange={e => planSatirGuncelle(i, 'banka', e.target.value)} />
                            </div>
                            <div style={{ width: 96, flexShrink: 0 }}>
                              <Input style={MINI_INPUT} placeholder="Çek/senet no" value={p.belgeNo || ''} disabled={!duzenlenebilir}
                                onChange={e => planSatirGuncelle(i, 'belgeNo', e.target.value)} />
                            </div>
                            <div style={{ flex: 1, minWidth: 120 }}>
                              <Input style={MINI_INPUT} placeholder="Açıklama — örn. sözleşme imzasında"
                                value={p.aciklama || ''} disabled={!duzenlenebilir}
                                onChange={e => planSatirGuncelle(i, 'aciklama', e.target.value)} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {!(form.odemePlani || []).length && (
                    <p className="t-caption" style={{ marginTop: 6 }}>
                      Henüz satır yok — üstteki hazır planlardan birini seçin veya elle satır ekleyin.
                    </p>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                    {duzenlenebilir && (
                      <Button variant="secondary" size="sm" iconLeft={<Plus size={13} strokeWidth={1.75} />} onClick={planSatirEkle}>
                        Satır Ekle
                      </Button>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', font: '500 12.5px/18px var(--font-sans)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Plan toplamı: <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{paraFmt(plan.planToplam, form.paraBirimi)}</strong>
                      </span>
                      <span style={{ color: 'var(--text-tertiary)' }}>
                        Nihai bedel: {paraFmt(hesap.nihaiToplam, form.paraBirimi)}
                      </span>
                      {/* Bedel 0 iken "karşılıyor" demek yanıltıcı olur (0 = 0) */}
                      {(form.odemePlani || []).length > 0 && (
                        hesap.nihaiToplam <= 0
                          ? <Badge tone="beklemede">Tutar girilince hesaplanır</Badge>
                          : plan.dengeli
                            ? <Badge tone="aktif" icon={<CheckCircle2 size={11} strokeWidth={2} />}>Plan bedeli karşılıyor</Badge>
                            : <Badge tone="uyari" icon={<AlertTriangle size={11} strokeWidth={2} />}>
                                {plan.fark > 0 ? `${paraFmt(plan.fark, form.paraBirimi)} eksik` : `${paraFmt(Math.abs(plan.fark), form.paraBirimi)} fazla`}
                              </Badge>
                      )}
                      {plan.agirlikliVade > 0 && duzenlenebilir && Number(form.vadeGunu) !== plan.agirlikliVade && (
                        <Button variant="ghost" size="sm" iconLeft={<Calculator size={13} strokeWidth={1.75} />} onClick={agirlikliVadeUygula}>
                          Ağırlıklı vadeyi uygula ({plan.agirlikliVade} gün)
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
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

          {/* Bağlı teklifler (mig 247) — tek proje, birden fazla teklif */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <div>
                <h2 className="t-h2">Bağlı Teklifler</h2>
                <p className="t-caption">
                  Bir binanın yangın, kamera, kartlı geçiş ve ses sistemi ayrı tekliflenmiş olsa da tek sözleşmede
                  birleşir. Ana toplam ve ürün listesi buradaki tekliflerden hesaplanır.
                </p>
              </div>
              {sozTeklifler.length > 0 && (
                <Badge tone="bilgi">{sozTeklifler.length} teklif · {paraFmt(tekliflerToplami, form.paraBirimi)}</Badge>
              )}
            </div>

            {/* Kilitli sözleşmede ekleme kutusu yok — sebebini yazmazsak kullanıcı
                "kutu nerede?" diye arıyor (gerçekte yaşandı). */}
            {!duzenlenebilir && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                padding: '8px 12px', background: 'var(--surface-subtle)',
              }}>
                <Lock size={14} strokeWidth={1.75} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
                <span className="t-caption">
                  {kayit?.durum === 'imzalandi'
                    ? 'Sözleşme imzalandı — belge donduruldu, teklif eklenip çıkarılamaz.'
                    : kayit?.durum === 'iptal'
                      ? 'Sözleşme iptal edildi — teklif eklenip çıkarılamaz.'
                      : 'Sözleşme onaylanıp kilitlendi — teklif eklemek için yöneticinin kilidi açması gerekir.'}
                  {' '}Teklifi başka bir sözleşmeye bağlamak için teklif detayındaki
                  “Mevcut Sözleşmeye Ekle” butonunu kullanın.
                </span>
              </div>
            )}
            {duzenlenebilir && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 340px', minWidth: 240 }}>
                  <Label>Teklif ekle</Label>
                  <CustomSelect value={teklifEkleId} onChange={e => setTeklifEkleId(e.target.value)}>
                    <option value="">— Teklif seçin —</option>
                    {/* Para birimi görünsün — farklı birimli teklif eklenemiyor, önden belli olsun */}
                    {eklenebilirTeklifler.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.teklifNo || `#${t.id}`} · {t.paraBirimi || 'TL'} · {t.firmaAdi}{t.konu ? ` · ${t.konu}` : ''}
                      </option>
                    ))}
                  </CustomSelect>
                </div>
                <Button variant="secondary" iconLeft={<Plus size={14} strokeWidth={1.75} />}
                  disabled={!teklifEkleId || mesgul} onClick={teklifEkleTikla}>
                  Ekle
                </Button>
              </div>
            )}

            {sozTeklifler.length === 0 ? (
              <p className="t-caption">
                Henüz teklif bağlanmadı. Sözleşme bağımsız olarak da hazırlanabilir — o durumda tutarı elle girin.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', font: '400 12.5px/18px var(--font-sans)' }}>
                  <thead>
                    <tr>
                      <th style={{ ...TBL_TH, width: 26 }}>#</th>
                      <th style={{ ...TBL_TH, width: 120 }}>Teklif No</th>
                      <th style={TBL_TH}>Konu</th>
                      <th style={{ ...TBL_TH, width: 70 }}>Kalem</th>
                      <th style={{ ...TBL_TH, width: 140, textAlign: 'right' }}>Tutar (KDV dahil)</th>
                      <th style={{ ...TBL_TH, width: 96 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sozTeklifler.map((t, i) => (
                      <tr key={t.teklifId} style={{ borderTop: '1px solid var(--border-default)' }}>
                        <td style={{ ...TBL_TD, color: 'var(--text-tertiary)' }}>{i + 1}</td>
                        <td style={{ ...TBL_TD, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
                          {t.teklifNo || `#${t.teklifId}`}
                        </td>
                        <td style={TBL_TD}>{t.konu || '—'}</td>
                        <td style={{ ...TBL_TD, color: 'var(--text-tertiary)' }}>{(t.urunListesi || []).length}</td>
                        <td style={{ ...TBL_TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {paraFmt(t.tutar, form.paraBirimi)}
                        </td>
                        <td style={{ ...TBL_TD, whiteSpace: 'nowrap' }}>
                          <Button variant="ghost" size="sm" iconLeft={<ExternalLink size={12} strokeWidth={1.5} />}
                            onClick={() => window.open(`/teklifler/${t.teklifId}`, '_blank')}>Aç</Button>
                          {duzenlenebilir && (
                            <button type="button" onClick={() => teklifKaldirTikla(t.teklifId)} title="Bağı kaldır"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 4, display: 'inline-flex', verticalAlign: 'middle' }}>
                              <Trash2 size={14} strokeWidth={1.75} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid var(--border-default)' }}>
                      <td style={{ ...TBL_TD, font: '600 12.5px/18px var(--font-sans)' }} colSpan={4}>TEKLİFLER TOPLAMI</td>
                      <td style={{ ...TBL_TD, textAlign: 'right', font: '600 12.5px/18px var(--font-sans)', fontVariantNumeric: 'tabular-nums' }}>
                        {paraFmt(tekliflerToplami, form.paraBirimi)}
                      </td>
                      <td style={TBL_TD}></td>
                    </tr>
                  </tbody>
                </table>
                {Math.abs(Number(form.anaToplam) - tekliflerToplami) >= 1 && (
                  <p className="t-caption" style={{ marginTop: 8, color: 'var(--warning)' }}>
                    Ana toplam ({paraFmt(form.anaToplam, form.paraBirimi)}) teklifler toplamından farklı —
                    elle değiştirilmiş. Tekliflerden hesaplamak için{' '}
                    <button type="button" onClick={() => alan('anaToplam', tekliflerToplami)}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--brand-primary)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>
                      buraya tıklayın
                    </button>.
                  </p>
                )}
              </div>
            )}
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
                      {sozTeklifler.length > 1 && <th style={{ padding: '4px 8px' }}>Teklif</th>}
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
                        {sozTeklifler.length > 1 && (
                          <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)', fontSize: 11 , color: 'var(--text-tertiary)' }}>{u.teklifNo || '—'}</td>
                        )}
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{paraFmt(u.toplam, form.paraBirimi)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Önceki imzalı sürümler (mig 248) — revizyona açılan sözleşmenin arşivi.
              Müşterinin hangi metni imzaladığı sorusu her zaman cevaplanabilmeli. */}
          {kayit && imzaGecmisiGetir(kayit).length > 0 && (
            <Card>
              <h2 className="t-h2" style={{ marginBottom: 4 }}>Önceki İmzalı Sürümler</h2>
              <p className="t-caption" style={{ marginBottom: 10 }}>
                Bu sözleşme imzalandıktan sonra {imzaGecmisiGetir(kayit).length} kez revizyona açıldı.
                Her sürümün imzalı PDF'i saklanır — güncel metin bunlardan farklı olabilir.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {imzaGecmisiGetir(kayit).map((s, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                    padding: '8px 12px', flexWrap: 'wrap',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <Badge tone="neutral">Rev. {s.revizyon ?? 0}</Badge>
                        <span className="t-caption">İmza: {trTarih(s.imzaTarihi)}</span>
                        <span className="t-caption" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {paraFmt(s.nihaiToplam, s.paraBirimi || form.paraBirimi)}
                        </span>
                      </div>
                      <div className="t-caption">
                        {s.teklifNo ? `Teklifler: ${s.teklifNo} · ` : ''}
                        Revizyona açan: {s.acanAd || '—'} · {trTarih(s.acmaTarihi)}
                        {s.sebep ? ` · ${s.sebep}` : ''}
                      </div>
                    </div>
                    {s.imzaliPdfUrl && (
                      <Button variant="ghost" size="sm" iconLeft={<ExternalLink size={13} strokeWidth={1.5} />}
                        onClick={() => belgeAc(s.imzaliPdfUrl,
                          `${kayit.sozlesmeNo} — Rev. ${s.revizyon ?? 0} İmzalı Nüsha`,
                          belgeAdi(` - rev${s.revizyon ?? 0} imzali`))}>
                        İmzalı PDF
                      </Button>
                    )}
                  </div>
                ))}
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
                  <Button variant="primary" iconLeft={<Send size={14} strokeWidth={1.5} />} onClick={() => setGonderAcik(true)}>
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

              {/* mig 248: imzalı sözleşmede de açılabiliyor — eski imzalı PDF arşivleniyor */}
              {kayit && kilitli && admin && (
                <Button variant="ghost" iconLeft={<Unlock size={14} strokeWidth={1.5} />} onClick={kilidiAcTikla}>
                  {kayit.durum === 'imzalandi' ? 'Revizyona Aç (Yeniden İmza)' : 'Kilidi Aç (Revizyon)'}
                </Button>
              )}

              {/* Kalıcı silme: admin. Hatalı/deneme kayıtlarını temizlemek için —
                  iş akışı için doğru yol "İptal Et" (kayıt arşivde kalır). */}
              {kayit && admin && (
                <Button variant="ghost" style={{ color: 'var(--danger)' }} disabled={mesgul}
                  iconLeft={<Trash2 size={14} strokeWidth={1.5} />} onClick={silTikla}>
                  Kalıcı Sil
                </Button>
              )}

              {kayit && !['iptal', 'imzalandi'].includes(kayit.durum) && (
                <Button variant="ghost" style={{ color: 'var(--danger)' }} iconLeft={<XCircle size={14} strokeWidth={1.5} />} onClick={iptalTikla}>
                  İptal Et
                </Button>
              )}
            </div>

            {kayit && (
              <BelgePaylasModal
                acik={gonderAcik}
                onKapat={() => setGonderAcik(false)}
                belgeTipi="satis_sozlesme"
                belgeId={kayit.id}
                baslangicEmail={gonderEmail || form.email || ''}
                baslangicGsm={form.telefon || ''}
                baslangicOzelMesaj={gonderOzelMesaj}
                belgeBaslik={`${kayit.sozlesmeNo || 'Satış Sözleşmesi'} — ${form.firmaAdi || ''}`}
                onGonderildi={gonderildiSonrasi}
              />
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
            {/* İçerik kendi ürettiğimiz HTML — güvenli.
                Önizleme ile yazdırma AYNI HTML'i basar. Eskiden burada
                position:fixed'ler static'e çevriliyordu: önizleme düzgün
                görünüyor ama yazdırma bozuk çıkıyordu (madde kayması) — hata
                tam da bu yüzden fark edilmiyordu. */}
            <div dangerouslySetInnerHTML={{ __html: ssBelgeGoster(icerikHtml()) }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <Button variant="secondary" iconLeft={<Printer size={14} strokeWidth={1.5} />} onClick={yazdir}>Yazdır / PDF</Button>
            <Button variant="ghost" onClick={() => setOnizleme(false)}>Kapat</Button>
          </div>
        </Modal>
      )}

      {belge && (
        <BelgeOnizlemeModal
          baslik={belge.baslik}
          url={belge.url}
          indirmeAdi={belge.indirmeAdi}
          onKapat={() => setBelge(null)}
        />
      )}
    </div>
  )
}
