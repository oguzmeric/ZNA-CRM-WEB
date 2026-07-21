import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Trash2, Building2, Handshake, ArrowRight, CheckSquare, FileText, Smartphone,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import {
  gorevGetir, gorevGuncelle, gorevSil, gorevGoruldu, gorevOnayaGonder,
  gorevHareketleriGetir, gorevSablonKaydet, kontrolListesiGetir,
} from '../services/gorevService'
import { gorevYorumlariGetir, gorevYorumEkle, gorevYorumGuncelle, gorevYorumSil } from '../services/gorevYorumService'
import { invalidate } from '../lib/cache'
import { useServisTalebi } from '../context/ServisTalebiContext'
import { useBildirim } from '../context/BildirimContext'
import { parseMentions } from '../lib/mention'
import { EkListesi } from '../components/EkAlani'
import { ekleriYukle } from '../lib/ekDosya'
import { SkeletonDetay } from '../components/Skeleton'
import {
  GECIKME_SEBEPLERI, KABUL_MAP, durumBilgi, etkinDurum, oncelikBilgi,
  gorevGecikti, gecikmeGunu, anaGorevKapatKontrol, ilerlemeOtomatik,
  ILERLEME_ADIMLARI, SEBEP_ZORUNLU_DURUMLAR,
} from '../lib/gorevSabitleri'
import GorevAkisKarti from '../components/gorev/GorevAkisKarti'
import AltGorevlerKarti from '../components/gorev/AltGorevlerKarti'
import KontrolListesiKarti from '../components/gorev/KontrolListesiKarti'
import GorevSohbet from '../components/gorev/GorevSohbet'
import {
  Button, Textarea, Card, CardTitle, Badge, Avatar, EmptyState,
} from '../components/ui'

// Badge tonu eşlemesi (mevcut Badge bileşeni tone API'si)
const oncelikler = [
  { id: 'dusuk',  isim: 'Düşük',  tone: 'pasif' },
  { id: 'normal', isim: 'Normal', tone: 'beklemede' },
  { id: 'orta',   isim: 'Orta',   tone: 'beklemede' },
  { id: 'yuksek', isim: 'Yüksek', tone: 'kayip' },
  { id: 'acil',   isim: 'Acil',   tone: 'kayip' },
  { id: 'kritik', isim: 'Kritik', tone: 'kayip' },
]

// Elle seçilebilen durumlar — onay/kabul/ret akış durumları butonlarla yönetilir
const SECILEBILIR_DURUMLAR = ['bekliyor', 'devam', 'beklemede', 'bilgi_bekleniyor', 'tamamlandi', 'iptal']

const DEVAM_SEBEPLERI = GECIKME_SEBEPLERI

// Mobil, görüşmeden görev oluştururken açıklamaya "Firma: …\nGörüşme tarihi: …\n
// \nNotlar:\n<not>" blob'u basıyor. Görev zaten müşteri + bağlı görüşme linkiyle
// gösterildiği için Firma/tarih tekrarını ayıklayıp yalnız asıl notu döndür.
const temizleGorusmeBlob = (aciklama) => {
  if (!aciklama) return aciklama
  const m = /(?:^|\n)Notlar:\s*\n?([\s\S]*)$/.exec(aciklama)
  if (m && /^Firma:|Görüşme tarihi:/m.test(aciklama)) return m[1].trim()
  return aciklama
}

function GorevDetay() {
  const { id } = useParams()
  const { kullanici, kullanicilar } = useAuth()
  const navigate = useNavigate()
  const { talepOlusturGorevden } = useServisTalebi()
  const { bildirimEkle } = useBildirim()
  const [servisOlusturuluyor, setServisOlusturuluyor] = useState(false)
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [gorev, setGorev] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [yeniYorum, setYeniYorum] = useState('')
  const [yorumEkleri, setYorumEkleri] = useState([])       // henüz yüklenmemiş File[]
  const [yorumGonderiliyor, setYorumGonderiliyor] = useState(false)
  const [yorumlar, setYorumlar] = useState([])
  const [duzenleYorumId, setDuzenleYorumId] = useState(null)
  const [duzenleIcerik, setDuzenleIcerik] = useState('')
  const [devamSebepModal, setDevamSebepModal] = useState(false)
  // Sebep seçilirse yeni bitiş tarihi ZORUNLU (kullanıcı kuralı) —
  // sebep butonuna basınca hemen kaydetmek yerine iki adım: seç → tarih → Kaydet
  const [secilenSebep, setSecilenSebep] = useState(null)
  const [devamYeniTarih, setDevamYeniTarih] = useState('')
  const [devamKaydediliyor, setDevamKaydediliyor] = useState(false)
  // v2: hareket geçmişi + alt görev ağacı + sebep zorunlu durum modalı
  const [hareketler, setHareketler] = useState([])
  const [altAgac, setAltAgac] = useState([])
  const [sebepModal, setSebepModal] = useState(null)   // { hedefDurum } — beklemede/bilgi_bekleniyor/iptal
  const [sebepMetin, setSebepMetin] = useState('')
  const [kapatGerekce, setKapatGerekce] = useState(null) // 'serbest' kuralında açık altlarla kapatma gerekçesi
  const [gorusmeOzet, setGorusmeOzet] = useState(null)   // bağlı görüşme etiketi (firma + ACT no)

  // Modal her açılışta mevcut sebeple başlasın, tarih boş gelsin
  useEffect(() => {
    if (devamSebepModal) {
      setSecilenSebep(gorev?.devamSebep || null)
      setDevamYeniTarih('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devamSebepModal])

  useEffect(() => {
    gorevGetir(id)
      .then(d => setGorev(d))
      .catch(err => console.error('[GorevDetay yükle]', err))
      .finally(() => setYukleniyor(false))
    gorevYorumlariGetir(id)
      .then(setYorumlar)
      .catch(err => console.error('[GorevDetay yorum yükle]', err))
    gorevHareketleriGetir(id).then(setHareketler).catch(() => {})
  }, [id])

  // Bağlı görüşme etiketi — gorevler'de firma/akt_no kolonu yok, hafif fetch
  // (kart boş etiketle render oluyordu, denetim bulgusu 2026-07-19)
  useEffect(() => {
    if (!gorev?.gorusmeId) { setGorusmeOzet(null); return }
    import('../lib/supabase').then(({ supabase }) =>
      supabase.from('gorusmeler').select('firma, akt_no').eq('id', gorev.gorusmeId).maybeSingle()
        .then(({ data }) => setGorusmeOzet(data || null)))
      .catch(() => {})
  }, [gorev?.gorusmeId])

  // Atanan görevi ilk kez açtığında kabul durumu 'Görüldü' olur (madde 10)
  useEffect(() => {
    if (!gorev || !kullanici) return
    const benAtanan = String(gorev.atananId ?? gorev.atanan ?? '') === String(kullanici.id)
    if (benAtanan && gorev.kabulDurumu === 'atandi') {
      gorevGoruldu(gorev.id).then(g => {
        if (g) setGorev(prev => (prev ? { ...prev, kabulDurumu: 'goruldu' } : prev))
      }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gorev?.id, gorev?.kabulDurumu, kullanici?.id])

  // Realtime: bu göreve (web yorumu gorev_yorumlari, mobil not gorevler.notlar)
  // biri yorum eklerse açık detayda anında görünsün (mig 175).
  useEffect(() => {
    let zaman = null
    const tazele = (fn) => { if (zaman) return; zaman = setTimeout(() => { zaman = null; fn() }, 500) }
    let kanal
    import('../lib/supabase').then(({ supabase }) => {
      kanal = supabase
        .channel(`gorev-${id}-canli`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'gorev_yorumlari', filter: `gorev_id=eq.${id}` },
          () => tazele(() => gorevYorumlariGetir(id).then(setYorumlar).catch(() => {})))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'gorevler', filter: `id=eq.${id}` },
          () => tazele(() => { invalidate(`gorev:${id}`); gorevGetir(id).then(d => d && setGorev(d)).catch(() => {}) }))
        .subscribe()
    })
    return () => { if (zaman) clearTimeout(zaman); if (kanal) kanal.unsubscribe() }
  }, [id])

  if (yukleniyor) return <SkeletonDetay />

  if (!gorev) return (
    <div style={{ padding: 24 }}>
      <EmptyState
        icon={<CheckSquare size={32} strokeWidth={1.5} />}
        title="Görev bulunamadı"
        action={
          <Button variant="secondary" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => navigate('/gorevler')}>
            Görevlere dön
          </Button>
        }
      />
    </div>
  )

  const oncelik = oncelikler.find(o => o.id === gorev.oncelik)
  const durumV2 = etkinDurum(gorev)
  const kabul = KABUL_MAP[gorev.kabulDurumu]
  const atananKisi = kullanicilar.find(k => k.id?.toString() === gorev.atanan?.toString())
  const direktAltlar = altAgac.filter(a => String(a.ustGorevId) === String(gorev.id))
  // İlerleme: otomatik modda alt görev ortalaması, yoksa manuel değer (madde 15)
  const otoIlerleme = ilerlemeOtomatik(direktAltlar)
  const gosterilenIlerleme = gorev.durum === 'tamamlandi' ? 100
    : (gorev.ilerlemeModu === 'otomatik' && otoIlerleme !== null ? otoIlerleme : (gorev.ilerleme || 0))

  // Görevi DÜZENLEME yetkisi (RLS UPDATE ile aynı: admin + atanan + ekip).
  // SELECT herkese açık (mig 174) olduğundan artık herkes bu detayı açabilir;
  // ama yalnız yetkili düzenleyebilsin — aksi halde durum değişikliği sessizce
  // kaybolurdu (RLS UPDATE bloklar). Herkes YORUM yapabilir (ayrı tablo/policy).
  const uid = String(kullanici?.id ?? '___')
  const duzenleyebilirMi =
    kullanici?.rol === 'admin' ||
    String(gorev.atanan ?? '') === uid ||
    String(gorev.atananId ?? '') === uid ||
    gorev.atananAd === kullanici?.ad ||
    (Array.isArray(gorev.ekip) && gorev.ekip.some(x => String(x) === uid)) ||
    // Görevi AÇAN da düzenleyebilir (mig 178 ile RLS UPDATE'te açıldı; UI de eşleşsin)
    (!!gorev.olusturanAd && (gorev.olusturanAd === kullanici?.ad || gorev.olusturanAd === kullanici?.kullaniciAdi))

  // MOBİL yorumları da göster: mobil, görev yorumlarını gorevler.notlar (jsonb)
  // dizisine yazıyor; web ise gorev_yorumlari tablosunu. İkisini tek zaman
  // çizelgesinde birleştir ki telefondan yazılan yorumlar webde de görünsün.
  const mobilNotlar = (gorev.notlar || []).map((n, i) => ({
    id: 'mobilnot-' + i,
    yazar: n.kullanici || '—',
    yazarId: null,
    icerik: n.metin || '',
    tarih: n.tarih ? new Date(n.tarih).toLocaleString('tr-TR') : '',
    zaman: n.tarih || null,
    duzenlendi: !!n.duzenlendiTarih,
    fotoUrls: Array.isArray(n.fotoUrls) ? n.fotoUrls : [],
    dosyalar: Array.isArray(n.dosyalar) ? n.dosyalar : [],   // mobil belge ekleri (mig 184)
    kaynak: 'mobil',
  }))
  const tumYorumlar = [...yorumlar.map(y => ({ ...y, kaynak: y.kaynak || 'web' })), ...mobilNotlar]
    .sort((a, b) => new Date(a.zaman || 0) - new Date(b.zaman || 0))

  // Durum değişikliği bildirimleri mig 212 DB trigger'ında — atanan + ekip +
  // oluşturan, hangi istemciden değişirse değişsin (çift bildirim olmasın diye
  // buradaki istemci bildirimi kaldırıldı).
  const durumUygula = async (guncelleme) => {
    const g = await gorevGuncelle(gorev.id, guncelleme)
    if (!g) { toast.error('Durum güncellenemedi.'); return false }
    setGorev(prev => ({ ...prev, ...guncelleme }))
    gorevHareketleriGetir(gorev.id).then(setHareketler).catch(() => {})
    toast.success('Durum güncellendi.')
    return true
  }

  const durumGuncelle = async (yeniDurum) => {
    const eskiDurum = gorev.durum
    if (yeniDurum === eskiDurum) return

    // Onay sürecindeyken karar YALNIZ onaylayıcıdan gelir — sorumlu çiplerle
    // onayı baypas edemez (denetim bulgusu). Onaylayıcı/admin çıkış yaparsa
    // onay_durumu artığı temizlenir.
    if (eskiDurum === 'onay_bekliyor') {
      const benOnaylayiciMi = gorev.onaylayiciId
        ? String(gorev.onaylayiciId) === String(kullanici?.id)
        : (String(gorev.olusturanId ?? '') === String(kullanici?.id) || gorev.olusturanAd === kullanici?.ad)
      if (!benOnaylayiciMi && kullanici?.rol !== 'admin') {
        toast.warning('Görev onay sürecinde — karar onaylayıcıya ait. Onay panelini kullanın.')
        return
      }
      // Onaylayıcı çiple süreci bozarsa onay artığını temizle + sorumluya haber ver
      if (yeniDurum !== 'tamamlandi') {
        const ok = await durumUygula({ durum: yeniDurum, onayDurumu: null, devamSebep: null })
        if (ok && SEBEP_ZORUNLU_DURUMLAR.includes(yeniDurum)) {
          setSebepMetin(''); setSebepModal({ hedefDurum: yeniDurum })
        }
        return
      }
    }

    // Reddedilmiş görev yeniden canlandırılıyorsa kabul akışı sıfırlanır —
    // yeni/aynı sorumlu kabul barını tekrar görmeli (denetim bulgusu)
    const kabulReset = gorev.kabulDurumu === 'reddedildi' && ['bekliyor', 'devam'].includes(yeniDurum)
      ? { kabulDurumu: 'atandi', redSebebi: null } : {}

    // Devam'a geçerken sebep seçim modalını aç (mevcut davranış korunur)
    if (yeniDurum === 'devam') {
      setDevamSebepModal(true)
      await durumUygula({ durum: 'devam', ...kabulReset })
      return
    }

    // Beklemede / Bilgi Bekleniyor / İptal → sebep ZORUNLU (madde 10, 37)
    if (SEBEP_ZORUNLU_DURUMLAR.includes(yeniDurum)) {
      setSebepMetin('')
      setSebepModal({ hedefDurum: yeniDurum })
      return
    }

    if (yeniDurum === 'tamamlandi') {
      // 1) Bağımlılık kapısı (madde 16)
      if (gorev.bagimliGorevId && gorev.bagimlilikTuru === 'once_tamamlanmali') {
        const bagimli = await gorevGetir(gorev.bagimliGorevId).catch(() => null)
        if (bagimli && bagimli.durum !== 'tamamlandi') {
          toast.error(`Önce bağımlı görev tamamlanmalı: ${bagimli.gorevNo || ''} "${bagimli.baslik}"`)
          return
        }
      }
      // 2) Alt görev kapısı (madde 13)
      const direktAltlar = altAgac.filter(a => String(a.ustGorevId) === String(gorev.id))
      const kontrol = anaGorevKapatKontrol(gorev, direktAltlar)
      if (kontrol.engel) { toast.error(kontrol.mesaj); return }
      if (kontrol.gerekceli) { setKapatGerekce({ mesaj: kontrol.mesaj, metin: '' }); return }
      // 3) Onay kapısı (madde 14): onay gerekliyse ve onaylayıcı ben değilsem onaya gider
      const benOnaylayici = gorev.onaylayiciId
        ? String(gorev.onaylayiciId) === String(kullanici?.id)
        : (String(gorev.olusturanId ?? '') === String(kullanici?.id) || gorev.olusturanAd === kullanici?.ad)
      if (gorev.onayGerekli && !benOnaylayici) {
        const g = await gorevOnayaGonder(gorev.id)
        if (!g) { toast.error('Onaya gönderilemedi.'); return }
        setGorev(prev => ({ ...prev, durum: 'onay_bekliyor', onayDurumu: 'bekliyor', ilerleme: 100 }))
        gorevHareketleriGetir(gorev.id).then(setHareketler).catch(() => {})
        const onaylayiciHedef = gorev.onaylayiciId ||
          kullanicilar?.find(k => String(k.id) === String(gorev.olusturanId ?? '') || k.ad === gorev.olusturanAd)?.id
        if (onaylayiciHedef && String(onaylayiciHedef) !== String(kullanici?.id)) {
          bildirimEkle(onaylayiciHedef, '⏳ Görev onayınızı bekliyor',
            `${kullanici?.ad}, "${gorev.baslik}" görevini tamamladı — onayınız bekleniyor.`,
            'gorev', `/gorevler/${gorev.id}`).catch(() => {})
        }
        toast.success('Görev tamamlandı olarak işaretlendi — onaya gönderildi.')
        return
      }
      await durumUygula({ durum: 'tamamlandi', devamSebep: null, ilerleme: 100 })
      return
    }

    await durumUygula({ durum: yeniDurum, devamSebep: null, ...kabulReset })
  }

  // Sebep zorunlu durum modalının onayı
  const sebepliDurumKaydet = async () => {
    if (!sebepMetin.trim()) { toast.error('Sebep yazman zorunlu.'); return }
    const hedef = sebepModal.hedefDurum
    const ok = await durumUygula({ durum: hedef, durumSebebi: sebepMetin.trim(), devamSebep: null })
    if (!ok) return
    gorevYorumEkle({
      gorevId: gorev.id, kullaniciId: kullanici.id, yazarAd: kullanici.ad,
      icerik: `${durumBilgi(hedef).isim}: ${sebepMetin.trim()}`,
    }).then(y => setYorumlar(prev => [...prev, y])).catch(() => {})
    setSebepModal(null); setSebepMetin('')
  }

  // 'serbest' kuralında açık alt görevlerle kapatma gerekçesi
  const gerekceliKapat = async () => {
    if (!kapatGerekce?.metin?.trim()) { toast.error('Gerekçe yazman zorunlu.'); return }
    const ok = await durumUygula({ durum: 'tamamlandi', devamSebep: null, ilerleme: 100 })
    if (!ok) return
    gorevYorumEkle({
      gorevId: gorev.id, kullaniciId: kullanici.id, yazarAd: kullanici.ad,
      icerik: `✅ Ana görev, açık alt görevler varken kapatıldı. Gerekçe: ${kapatGerekce.metin.trim()}`,
    }).then(y => setYorumlar(prev => [...prev, y])).catch(() => {})
    setKapatGerekce(null)
  }

  const yorumEkle = async () => {
    if (!yeniYorum.trim() && yorumEkleri.length === 0) return
    setYorumGonderiliyor(true)
    let eklenen
    try {
      // Önce ekleri yükle (varsa) — sonra yorumu ek listesiyle kaydet
      const dosyalar = yorumEkleri.length ? await ekleriYukle('yorum-ekleri', yorumEkleri) : []
      eklenen = await gorevYorumEkle({
        gorevId: gorev.id, kullaniciId: kullanici.id,
        yazarAd: kullanici.ad, icerik: yeniYorum.trim() || '(ek)',
        dosyalar,
      })
    } catch (e) {
      toast.error('Yorum eklenemedi: ' + (e?.message || 'bağlantıyı kontrol edin'))
      setYorumGonderiliyor(false)
      return
    }
    setYorumGonderiliyor(false)
    setYorumEkleri([])
    setYorumlar(prev => [...prev, eklenen])

    // @mention bildirimleri — mention edilen herkese bildirim gider
    // (kendine mention yapsa bile filtreleme: mention === yazar atlanır)
    const mentionIdler = parseMentions(yeniYorum, kullanicilar)
      .filter(mid => mid?.toString() !== kullanici.id?.toString())
    const alanlar = new Set(mentionIdler.map(x => x?.toString()))

    // Görevi açan + atanan + EKİP üyelerine bildirim — yorumu kendisi yazmıyorsa
    // ve mention'da yoksa. olusturan_id kolonu yok, olusturanAd üzerinden eşleniyor.
    const paydaslar = []
    const olusturan = kullanicilar.find(k => k.ad === gorev.olusturanAd)
    if (olusturan?.id) paydaslar.push(olusturan.id)
    if (gorev.atanan) paydaslar.push(gorev.atanan)
    for (const eid of (gorev.ekip || [])) paydaslar.push(eid)

    for (const pid of paydaslar) {
      const idStr = pid?.toString()
      if (!idStr) continue
      if (idStr === kullanici.id?.toString()) continue      // yazan kendisi
      if (alanlar.has(idStr)) continue                       // mention'da zaten var
      alanlar.add(idStr)
      bildirimEkle(
        pid,
        `${kullanici.ad} göreve yorum ekledi`,
        `"${gorev.baslik}": ${yeniYorum.slice(0, 80)}${yeniYorum.length > 80 ? '…' : ''}`,
        'gorev',
        `/gorevler/${gorev.id}`,
      ).catch(e => console.warn('[bildirim] yorum→paydas:', e?.message))
    }

    for (const aliciId of mentionIdler) {
      bildirimEkle(
        aliciId,
        `${kullanici.ad} sizi bir görevde etiketledi`,
        `"${gorev.baslik}" görevinde sizi mention etti: ${yeniYorum.slice(0, 80)}${yeniYorum.length > 80 ? '…' : ''}`,
        'mention',
        `/gorevler/${gorev.id}`,
      )
    }

    setYeniYorum('')
    toast.success(mentionIdler.length > 0 ? `Yorum eklendi · ${mentionIdler.length} kişi etiketlendi` : 'Yorum eklendi.')
  }

  const duzenlemeBaslat = (yorum) => { setDuzenleYorumId(yorum.id); setDuzenleIcerik(yorum.icerik) }
  const duzenlemeIptal  = () => { setDuzenleYorumId(null); setDuzenleIcerik('') }

  const yorumGuncelle = async () => {
    if (!duzenleIcerik.trim()) return
    try {
      const guncel = await gorevYorumGuncelle(duzenleYorumId, duzenleIcerik.trim())
      setYorumlar(prev => prev.map(y => (y.id === duzenleYorumId ? guncel : y)))
    } catch {
      toast.error('Yorum güncellenemedi.')
      return
    }
    duzenlemeIptal()
    toast.success('Yorum güncellendi.')
  }

  const yorumSil = async (yorumId) => {
    const onay = await confirm({
      baslik: 'Yorumu Sil',
      mesaj: 'Bu yorum kalıcı olarak silinecek. Emin misiniz?',
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    try {
      await gorevYorumSil(yorumId)
      setYorumlar(prev => prev.filter(y => y.id !== yorumId))
    } catch {
      toast.error('Yorum silinemedi.')
      return
    }
    toast.success('Yorum silindi.')
  }

  const kendisiMi = (yorum) => {
    if (yorum.yazarId && kullanici.id) return String(yorum.yazarId) === String(kullanici.id)
    return yorum.yazar === kullanici.ad
  }

  return (
    <div style={{ padding: 24, maxWidth: 880, margin: '0 auto' }}>

      {/* Geri */}
      <button
        onClick={() => navigate('/gorevler')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--text-tertiary)', font: '500 13px/18px var(--font-sans)',
          marginBottom: 16,
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-primary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
      >
        <ArrowLeft size={14} strokeWidth={1.5} /> Görevlere dön
      </button>

      {/* Başlık kartı */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {gorev.gorevNo && (
              <span style={{
                font: '600 12px/18px var(--font-mono)', color: 'var(--text-tertiary)',
                padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
              }}>
                {gorev.gorevNo}
              </span>
            )}
            {oncelik && <Badge tone={oncelik.tone}>{oncelik.isim}</Badge>}
            <span style={{
              padding: '2px 10px', borderRadius: 'var(--radius-pill)',
              font: '600 12px/18px var(--font-sans)', color: durumV2.renk,
              background: 'var(--surface-card)', border: `1.5px solid ${durumV2.renk}`,
            }}>
              {durumV2.isim}
            </span>
            {kabul && gorev.kabulDurumu !== 'kabul_edildi' && gorev.durum !== 'tamamlandi' && (
              <span title="Kabul durumu" style={{
                padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                font: '500 11.5px/16px var(--font-sans)', color: kabul.renk,
                background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
              }}>
                {kabul.isim}
              </span>
            )}
            {gorev.gizlilik && gorev.gizlilik !== 'standart' && (
              <span title="Gizli görev — yalnız katılımcılar görür" style={{ fontSize: 14 }}>🔒</span>
            )}
          </div>
          {duzenleyebilirMi && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <Button
                variant="secondary"
                onClick={async () => {
                  const ad = window.prompt('Şablon adı:', gorev.baslik)
                  if (!ad?.trim()) return
                  const kontrol = await kontrolListesiGetir(gorev.id)
                  const s = await gorevSablonKaydet({
                    ad: ad.trim(),
                    aciklama: `${gorev.gorevNo || ''} görevinden kaydedildi`,
                    olusturanId: kullanici.id,
                    aktif: true,
                    veri: {
                      gorev: {
                        baslik: gorev.baslik, aciklama: gorev.aciklama || null,
                        oncelik: gorev.oncelik || 'normal', kategoriId: gorev.kategoriId || null,
                        onayGerekli: !!gorev.onayGerekli, beklenenCikti: gorev.beklenenCikti || null,
                        tamamlamaKurali: gorev.tamamlamaKurali || 'zorunlular',
                        etiketler: gorev.etiketler || [],
                      },
                      altGorevler: direktAltlar.map(a => ({
                        baslik: a.baslik, aciklama: a.aciklama || null,
                        oncelik: a.oncelik || 'normal', zorunlu: a.zorunlu !== false,
                      })),
                      kontrolListesi: kontrol.map(m => ({ baslik: m.baslik, zorunlu: !!m.zorunlu })),
                    },
                  })
                  if (s) toast.success(`"${s.ad}" şablonu kaydedildi — Görevler > Otomasyon'dan uygulanır.`)
                  else toast.error('Şablon kaydedilemedi.')
                }}
              >
                Şablon Kaydet
              </Button>
              <Button
                variant="secondary"
                iconLeft={<Pencil size={14} strokeWidth={1.5} />}
                onClick={() => navigate('/gorevler', { state: { duzenleGorevId: gorev.id } })}
              >
                Düzenle
              </Button>
              {/* Kural 9: atanmış görev SİLİNMEZ, iptal edilir. Silme yalnız
                  kendi TASLAĞI olan (RLS ile aynı) veya admin. */}
              {((gorev.durum === 'taslak' && (
                  String(gorev.olusturanId ?? '') === String(kullanici?.id) ||
                  gorev.olusturanAd === kullanici?.ad || gorev.olusturanAd === kullanici?.kullaniciAdi
                )) || kullanici?.rol === 'admin') ? (
                <Button
                  variant="secondary"
                  iconLeft={<Trash2 size={14} strokeWidth={1.5} />}
                  onClick={async () => {
                    const onay = await confirm({
                      baslik: 'Görevi Sil',
                      mesaj: `"${gorev.baslik}" görevi ve TÜM alt görevleri silinecek. Geri alınamaz. Emin misin?`,
                      onayMetin: 'Evet, sil',
                      iptalMetin: 'Vazgeç',
                      tip: 'tehlikeli',
                    })
                    if (!onay) return
                    try {
                      await gorevSil(gorev.id)
                      toast.success('Görev silindi.')
                      navigate('/gorevler', { replace: true })
                    } catch (err) {
                      toast.error('Görev silinemedi: ' + (err?.message ?? 'bilinmeyen hata'))
                    }
                  }}
                  style={{ color: 'var(--danger)', borderColor: 'var(--danger-border)' }}
                >
                  Sil
                </Button>
              ) : gorev.durum !== 'iptal' && gorev.durum !== 'tamamlandi' && (
                <Button
                  variant="secondary"
                  iconLeft={<Trash2 size={14} strokeWidth={1.5} />}
                  onClick={() => { setSebepMetin(''); setSebepModal({ hedefDurum: 'iptal' }) }}
                  style={{ color: 'var(--danger)', borderColor: 'var(--danger-border)' }}
                >
                  İptal Et
                </Button>
              )}
            </div>
          )}
        </div>
        <h1 className="t-h1" style={{ marginBottom: 6 }}>{gorev.baslik}</h1>

        {/* Üst görev bağlantısı (alt görevse) */}
        {gorev.ustGorevId && (
          <button
            onClick={() => navigate(`/gorevler/${gorev.ustGorevId}`)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10,
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--brand-primary)', font: '500 12.5px/18px var(--font-sans)',
            }}
          >
            ↑ Ana göreve git
          </button>
        )}

        {/* İlerleme (madde 15) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', overflow: 'hidden' }}>
            <div style={{
              width: `${gosterilenIlerleme}%`, height: '100%', transition: 'width 200ms',
              background: gosterilenIlerleme >= 100 ? 'var(--success)' : 'var(--brand-primary)',
            }} />
          </div>
          <span className="t-caption tabular-nums" style={{ minWidth: 38, textAlign: 'right', fontWeight: 600 }}>%{gosterilenIlerleme}</span>
        </div>
        {duzenleyebilirMi && gorev.durum !== 'tamamlandi' && !(gorev.ilerlemeModu === 'otomatik' && otoIlerleme !== null) && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
            {ILERLEME_ADIMLARI.map(p => (
              <button
                key={p}
                onClick={async () => {
                  const g = await gorevGuncelle(gorev.id, { ilerleme: p, ilerlemeModu: 'manuel' })
                  if (g) setGorev(prev => ({ ...prev, ilerleme: p, ilerlemeModu: 'manuel' }))
                }}
                style={{
                  padding: '3px 8px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                  font: '600 11px/16px var(--font-sans)',
                  background: (gorev.ilerleme || 0) === p ? 'var(--brand-primary)' : 'var(--surface-sunken)',
                  color: (gorev.ilerleme || 0) === p ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border-default)',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        {gorev.ilerlemeModu === 'otomatik' && otoIlerleme !== null && (
          <p className="t-caption" style={{ marginTop: -6, marginBottom: 12, fontStyle: 'italic' }}>
            İlerleme, alt görevlerin ortalamasından otomatik hesaplanıyor.
          </p>
        )}
        {gorev.aciklama ? (
          <div style={{
            padding: '12px 14px',
            background: 'var(--surface-sunken)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            marginTop: 4,
          }}>
            <div className="t-label" style={{ marginBottom: 6 }}>AÇIKLAMA</div>
            <p style={{ font: '400 14px/20px var(--font-sans)', color: 'var(--text-primary)', margin: 0, whiteSpace: 'pre-wrap' }}>
              {temizleGorusmeBlob(gorev.aciklama)}
            </p>
            {/* Görev oluştururken eklenen dosyalar (mig 184) */}
            <EkListesi dosyalar={gorev.dosyalar} />
          </div>
        ) : (
          <div style={{
            padding: '10px 14px',
            background: 'var(--surface-sunken)',
            border: '1px dashed var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            marginTop: 4,
            font: '400 13px/18px var(--font-sans)',
            color: 'var(--text-tertiary)',
            fontStyle: 'italic',
          }}>
            Açıklama girilmedi.
          </div>
        )}

        {gorev.beklenenCikti && (
          <div style={{
            padding: '10px 14px', marginTop: 10,
            background: 'var(--brand-primary-soft)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
          }}>
            <div className="t-label" style={{ marginBottom: 4 }}>BEKLENEN ÇIKTI</div>
            <p style={{ font: '400 13px/19px var(--font-sans)', color: 'var(--text-primary)', margin: 0, whiteSpace: 'pre-wrap' }}>
              {gorev.beklenenCikti}
            </p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, paddingTop: 16, marginTop: 16, borderTop: '1px solid var(--border-default)' }}>
          <div>
            <div className="t-label" style={{ marginBottom: 4 }}>ATANAN</div>
            {atananKisi ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                <Avatar name={atananKisi.ad} size="xs" />
                {atananKisi.ad}
              </span>
            ) : <span style={{ color: 'var(--text-tertiary)' }}>Bilinmiyor</span>}
          </div>
          <div>
            <div className="t-label" style={{ marginBottom: 4 }}>SON TARİH</div>
            <span style={{ font: '500 13px/18px var(--font-sans)', color: gorevGecikti(gorev) ? 'var(--danger)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {gorev.sonTarih || '—'}{gorev.bitisSaat ? ` · ${String(gorev.bitisSaat).slice(0, 5)}` : ''}
              {gorevGecikti(gorev) && <b> · {gecikmeGunu(gorev)} gün gecikti</b>}
            </span>
          </div>
          {gorev.baslamaTarih && (
            <div>
              <div className="t-label" style={{ marginBottom: 4 }}>BAŞLANGIÇ</div>
              <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {String(gorev.baslamaTarih).slice(0, 10)}
              </span>
            </div>
          )}
          <div>
            <div className="t-label" style={{ marginBottom: 4 }}>OLUŞTURAN</div>
            <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{gorev.olusturanAd || '—'}</span>
          </div>
          {/* Ekip üyeleri — görünmediği için "bu görev neden bende?" karışıklığı oluyordu */}
          {Array.isArray(gorev.ekip) && gorev.ekip.length > 0 && (
            <div>
              <div className="t-label" style={{ marginBottom: 4 }}>EKİP</div>
              <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                {gorev.ekip
                  .map(uid => kullanicilar?.find(k => String(k.id) === String(uid))?.ad || `#${uid}`)
                  .join(', ')}
              </span>
            </div>
          )}
          {Array.isArray(gorev.gozlemciler) && gorev.gozlemciler.length > 0 && (
            <div>
              <div className="t-label" style={{ marginBottom: 4 }}>GÖZLEMCİLER</div>
              <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                {gorev.gozlemciler
                  .map(gid => kullanicilar?.find(k => String(k.id) === String(gid))?.ad || `#${gid}`)
                  .join(', ')}
              </span>
            </div>
          )}
          {gorev.onayGerekli && (
            <div>
              <div className="t-label" style={{ marginBottom: 4 }}>ONAYLAYICI</div>
              <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                {gorev.onaylayiciId
                  ? (kullanicilar?.find(k => String(k.id) === String(gorev.onaylayiciId))?.ad || `#${gorev.onaylayiciId}`)
                  : `${gorev.olusturanAd || 'Oluşturan'} (oluşturan)`}
              </span>
            </div>
          )}
          {gorev.musteriAdi && (
            <div>
              <div className="t-label" style={{ marginBottom: 4 }}>İLGİLİ MÜŞTERİ</div>
              <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{gorev.musteriAdi}</div>
              {gorev.firmaAdi && (
                <button
                  onClick={() => navigate(`/firma-gecmisi/${encodeURIComponent(gorev.firmaAdi)}`)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--brand-primary)', font: '500 12px/16px var(--font-sans)', marginTop: 2 }}
                >
                  <Building2 size={11} strokeWidth={1.5} /> {gorev.firmaAdi}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bağlı görüşme */}
        {gorev.gorusmeId && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
            <div className="t-label" style={{ marginBottom: 8 }}>BAĞLI GÖRÜŞME</div>
            <button
              onClick={() => navigate(`/gorusmeler/${gorev.gorusmeId}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--brand-primary-soft)',
                border: '1px solid var(--border-default)',
                cursor: 'pointer',
                transition: 'border-color 120ms',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brand-primary)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-default)'}
            >
              <Handshake size={16} strokeWidth={1.5} style={{ color: 'var(--brand-primary)' }} />
              <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                {gorusmeOzet?.firma || gorev.musteriAdi || 'Bağlı görüşme'}
              </span>
              {gorusmeOzet?.akt_no && (
                <span style={{ font: '400 12px/16px var(--font-mono)', color: 'var(--text-tertiary)' }}>{gorusmeOzet.akt_no}</span>
              )}
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--brand-primary)', font: '500 12px/16px var(--font-sans)' }}>
                Görüşmeye git <ArrowRight size={12} strokeWidth={1.5} />
              </span>
            </button>
          </div>
        )}

        {/* Bağlı / Oluşturulacak servis talebi */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
          <div className="t-label" style={{ marginBottom: 8 }}>SERVİS TALEBİ</div>
          {gorev.servisTalepId ? (
            <button
              onClick={() => navigate(`/servis-talepleri/${gorev.servisTalepId}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--brand-primary-soft)',
                border: '1px solid var(--border-default)',
                cursor: 'pointer',
                transition: 'border-color 120ms',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brand-primary)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-default)'}
            >
              <FileText size={16} strokeWidth={1.5} style={{ color: 'var(--brand-primary)' }} />
              <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>Bağlı servis talebi</span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--brand-primary)', font: '500 12px/16px var(--font-sans)' }}>
                Servis talebine git <ArrowRight size={12} strokeWidth={1.5} />
              </span>
            </button>
          ) : gorev.musteriId ? (
            <Button
              variant="primary"
              iconLeft={<FileText size={14} strokeWidth={1.5} />}
              disabled={servisOlusturuluyor}
              onClick={async () => {
                setServisOlusturuluyor(true)
                try {
                  const atananKisi = kullanicilar?.find(k => k.id?.toString() === gorev.atananId?.toString())
                  const yeni = await talepOlusturGorevden(gorev, kullanici, atananKisi)
                  if (yeni) {
                    toast.success('Servis talebi oluşturuldu.')
                    navigate(`/servis-talepleri/${yeni.id}`)
                  } else {
                    toast.error('Servis talebi oluşturulamadı.')
                  }
                } catch (err) {
                  console.error('[Servis talebine dönüştür]', err)
                  toast.error('Hata: ' + (err?.message || 'bilinmeyen'))
                } finally {
                  setServisOlusturuluyor(false)
                }
              }}
            >
              {servisOlusturuluyor ? 'Oluşturuluyor…' : 'Servis talebine dönüştür'}
            </Button>
          ) : (
            <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
              Servis talebi oluşturmak için önce göreve bir müşteri bağlamalısınız.
            </p>
          )}
        </div>
      </Card>

      {/* Kabul / ret / devir / onay akışı (madde 11, 14, 38) */}
      <GorevAkisKarti
        gorev={gorev}
        kullanici={kullanici}
        kullanicilar={kullanicilar}
        onGuncellendi={(g) => {
          if (g) setGorev(prev => ({ ...prev, ...g }))
          gorevHareketleriGetir(gorev.id).then(setHareketler).catch(() => {})
          gorevYorumlariGetir(gorev.id).then(setYorumlar).catch(() => {})
        }}
      />

      {/* Durum güncelle — yalnız yetkili (atanan/ekip/admin) */}
      {!duzenleyebilirMi ? (
        <Card style={{ marginBottom: 16 }}>
          <p className="t-label" style={{ marginBottom: 6 }}>DURUM</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              padding: '2px 10px', borderRadius: 'var(--radius-pill)',
              font: '600 12px/18px var(--font-sans)', color: durumV2.renk,
              background: 'var(--surface-card)', border: `1.5px solid ${durumV2.renk}`,
            }}>
              {durumV2.isim}
            </span>
            <span className="t-caption" style={{ fontStyle: 'italic' }}>
              Bu görevi yalnızca sahibi ve ekibi düzenleyebilir — siz görüntüleyebilir ve yorum yapabilirsiniz.
            </span>
          </div>
        </Card>
      ) : (
      <Card style={{ marginBottom: 16 }}>
        <p className="t-label" style={{ marginBottom: 8 }}>DURUMU GÜNCELLE</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SECILEBILIR_DURUMLAR.map(dId => {
            const d = durumBilgi(dId)
            const secili = gorev.durum === dId
            return (
              <button
                key={dId}
                onClick={() => durumGuncelle(dId)}
                style={{
                  padding: '7px 14px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                  font: `600 12.5px/18px var(--font-sans)`,
                  background: secili ? d.renk : 'var(--surface-sunken)',
                  color: secili ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${secili ? d.renk : 'var(--border-default)'}`,
                  transition: 'all 120ms',
                }}
              >
                {d.isim}
              </button>
            )
          })}
        </div>
        {gorev.durum === 'onay_bekliyor' && (
          <p className="t-caption" style={{ marginTop: 8, fontStyle: 'italic' }}>
            Görev onay sürecinde — karar onaylayıcıdan bekleniyor.
          </p>
        )}
        {gorev.durumSebebi && ['beklemede', 'bilgi_bekleniyor', 'iptal'].includes(gorev.durum) && (
          <p className="t-caption" style={{ marginTop: 8 }}>
            Sebep: {gorev.durumSebebi}
          </p>
        )}
        {/* Devam durumunda sebep gösterimi + değiştir */}
        {gorev.durum === 'devam' && (
          <div style={{
            marginTop: 12, padding: 10, background: 'var(--surface-sunken)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, flexWrap: 'wrap',
          }}>
            {gorev.devamSebep ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>
                  {DEVAM_SEBEPLERI.find(s => s.id === gorev.devamSebep)?.ikon}
                </span>
                <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                  Sebep: {DEVAM_SEBEPLERI.find(s => s.id === gorev.devamSebep)?.isim || gorev.devamSebep}
                </span>
              </div>
            ) : (
              <span className="t-caption" style={{ fontStyle: 'italic' }}>Devam sebebi belirtilmemiş</span>
            )}
            <button
              onClick={() => setDevamSebepModal(true)}
              style={{
                background: 'transparent', border: '1px solid var(--border-default)',
                color: 'var(--brand-primary)', padding: '6px 12px', borderRadius: 6,
                font: '500 12px/16px var(--font-sans)', cursor: 'pointer',
              }}
            >
              {gorev.devamSebep ? 'Değiştir' : 'Sebep Seç'}
            </button>
          </div>
        )}
      </Card>
      )}

      {/* Devam sebep seçim modalı — Portal ile document.body'ye render */}
      {devamSebepModal && createPortal(
        <div
          onClick={() => setDevamSebepModal(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 100000, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              color: '#0f172a',
              borderRadius: 14, maxWidth: 460, width: '100%',
              padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
              border: '1px solid #e2e8f0',
            }}
          >
            <h3 style={{
              margin: 0, marginBottom: 4, fontSize: 17, fontWeight: 700, color: '#0f172a',
            }}>
              Devam Ediyor — Sebep
            </h3>
            <p style={{
              margin: 0, marginBottom: 18, fontSize: 12, color: '#64748b', lineHeight: 1.5,
            }}>
              Sebep seçersen <strong>yeni bitiş tarihi zorunludur</strong> (ek süre).
              Atlamak için "Belirtme" butonuna basabilirsin.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {DEVAM_SEBEPLERI.map(s => {
                const secili = secilenSebep === s.id
                return (
                  <button
                    key={s.id}
                    onClick={() => setSecilenSebep(s.id)}
                    style={{
                      padding: '16px 10px',
                      border: secili ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      borderRadius: 10,
                      background: secili ? '#eff6ff' : '#ffffff',
                      color: '#0f172a',
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', gap: 8,
                      transition: 'all 120ms',
                    }}
                  >
                    <span style={{ fontSize: 28, lineHeight: 1 }}>{s.ikon}</span>
                    <span style={{
                      fontSize: 13, fontWeight: 600, color: '#0f172a', textAlign: 'center', lineHeight: 1.3,
                    }}>
                      {s.isim}
                    </span>
                  </button>
                )
              })}
            </div>
            {/* Sebep seçildiyse yeni bitiş tarihi ZORUNLU (ek süre) */}
            {secilenSebep && (
              <div style={{
                marginTop: 16, padding: 14, borderRadius: 10,
                background: '#fffbeb', border: '1px solid #fcd34d',
              }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
                  📅 Yeni bitiş tarihi (zorunlu)
                </label>
                {gorev.bitisTarihi && (
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: '#a16207' }}>
                    Mevcut bitiş: {new Date(gorev.bitisTarihi).toLocaleDateString('tr-TR')}
                  </p>
                )}
                <input
                  type="date"
                  value={devamYeniTarih}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setDevamYeniTarih(e.target.value)}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: 8,
                    border: '1px solid #cbd5e1', background: '#ffffff',
                    color: '#0f172a', fontSize: 14, boxSizing: 'border-box',
                  }}
                />
              </div>
            )}
            <div style={{
              display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end',
            }}>
              {gorev.devamSebep && (
                <button
                  onClick={async () => {
                    await gorevGuncelle(gorev.id, { devamSebep: null })
                    setGorev(prev => ({ ...prev, devamSebep: null }))
                    setDevamSebepModal(false)
                    toast.success('Sebep kaldırıldı.')
                  }}
                  style={{
                    background: '#ffffff', border: '1px solid #cbd5e1',
                    color: '#64748b', padding: '9px 16px', borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Sebebi Kaldır
                </button>
              )}
              <button
                onClick={() => setDevamSebepModal(false)}
                style={{
                  background: '#f1f5f9', border: '1px solid #cbd5e1',
                  color: '#0f172a', padding: '9px 16px', borderRadius: 8,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Belirtme
              </button>
              {secilenSebep && (
                <button
                  disabled={!devamYeniTarih || devamKaydediliyor}
                  onClick={async () => {
                    if (!devamYeniTarih) { toast.warning('Yeni bitiş tarihi zorunlu.'); return }
                    setDevamKaydediliyor(true)
                    try {
                      const g = await gorevGuncelle(gorev.id, {
                        devamSebep: secilenSebep,
                        bitisTarihi: devamYeniTarih,
                        // son_tarih kanonik teslim tarihi: panel/listeler/gecikme
                        // SMS'i buna bakar — sadece bitis_tarihi yazmak görevin
                        // "gecikti" görünmeye devam etmesine yol açıyordu
                        sonTarih: devamYeniTarih,
                      })
                      if (!g) throw new Error('Kaydedilemedi.')
                      setGorev(prev => ({ ...prev, devamSebep: secilenSebep, bitisTarihi: devamYeniTarih, sonTarih: devamYeniTarih }))
                      setDevamSebepModal(false)
                      const s = DEVAM_SEBEPLERI.find(x => x.id === secilenSebep)
                      toast.success(`${s?.isim || 'Sebep'} — yeni bitiş: ${new Date(devamYeniTarih).toLocaleDateString('tr-TR')}`)
                    } catch (e) {
                      toast.error('Kaydedilemedi: ' + (e?.message || 'bilinmeyen hata'))
                    } finally {
                      setDevamKaydediliyor(false)
                    }
                  }}
                  style={{
                    background: devamYeniTarih ? '#2563eb' : '#93c5fd',
                    border: 'none', color: '#fff',
                    padding: '9px 18px', borderRadius: 8,
                    fontSize: 13, fontWeight: 700,
                    cursor: devamYeniTarih ? 'pointer' : 'not-allowed',
                  }}
                >
                  {devamKaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Alt görevler (madde 3, 6.3, 7, 12) */}
      <AltGorevlerKarti
        gorev={gorev}
        kullanici={kullanici}
        kullanicilar={kullanicilar}
        onAgacDegisti={setAltAgac}
      />

      {/* Kontrol listesi (madde 18) */}
      <KontrolListesiKarti
        gorev={gorev}
        kullanici={kullanici}
        kullanicilar={kullanicilar}
        duzenleyebilir={duzenleyebilirMi}
      />

      {/* Görev sohbeti — yorumlar + hareket geçmişi tek akışta (madde 17, 23) */}
      <GorevSohbet
        gorev={gorev}
        kullanici={kullanici}
        kullanicilar={kullanicilar}
        yorumlar={tumYorumlar}
        hareketler={hareketler}
        yeniYorum={yeniYorum}
        setYeniYorum={setYeniYorum}
        yorumEkleri={yorumEkleri}
        setYorumEkleri={setYorumEkleri}
        gonderiliyor={yorumGonderiliyor}
        onGonder={yorumEkle}
        duzenleYorumId={duzenleYorumId}
        duzenleIcerik={duzenleIcerik}
        setDuzenleIcerik={setDuzenleIcerik}
        onDuzenleBaslat={duzenlemeBaslat}
        onDuzenleKaydet={yorumGuncelle}
        onDuzenleIptal={duzenlemeIptal}
        onSil={yorumSil}
        kendisiMi={kendisiMi}
      />

      {/* Sebep zorunlu durum modalı (beklemede / bilgi bekleniyor / iptal) */}
      {sebepModal && createPortal(
        <div
          onClick={() => setSebepModal(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100000, padding: 20,
            background: 'rgba(15, 23, 42, 0.72)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 440,
            background: 'var(--surface-card)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: 22,
          }}>
            <h3 style={{ font: '700 15px/20px var(--font-sans)', color: 'var(--text-primary)', margin: '0 0 4px' }}>
              {durumBilgi(sebepModal.hedefDurum).isim}
            </h3>
            <p className="t-caption" style={{ margin: '0 0 12px' }}>
              {sebepModal.hedefDurum === 'iptal'
                ? 'Atanmış görev silinmez, iptal edilir — gerekçesi kayda geçer ve geçmişte saklanır.'
                : 'Bu duruma geçmek için sebep yazmak zorunlu — sebep, görev sohbetine işlenir.'}
            </p>
            <Textarea
              rows={3} value={sebepMetin} onChange={e => setSebepMetin(e.target.value)}
              placeholder={sebepModal.hedefDurum === 'bilgi_bekleniyor'
                ? 'Kimden / hangi bilgi bekleniyor?'
                : sebepModal.hedefDurum === 'iptal' ? 'İptal gerekçesi…' : 'Bekleme sebebi…'}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <Button variant="secondary" onClick={() => setSebepModal(null)}>Vazgeç</Button>
              <Button variant="primary" onClick={sebepliDurumKaydet}>Kaydet</Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Açık alt görevlerle kapatma gerekçesi ('serbest' kuralı, madde 13) */}
      {kapatGerekce && createPortal(
        <div
          onClick={() => setKapatGerekce(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100000, padding: 20,
            background: 'rgba(15, 23, 42, 0.72)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 440,
            background: 'var(--surface-card)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: 22,
          }}>
            <h3 style={{ font: '700 15px/20px var(--font-sans)', color: 'var(--text-primary)', margin: '0 0 4px' }}>
              Açık alt görevler var
            </h3>
            <p className="t-caption" style={{ margin: '0 0 12px' }}>{kapatGerekce.mesaj}</p>
            <Textarea
              rows={3} value={kapatGerekce.metin}
              onChange={e => setKapatGerekce(prev => ({ ...prev, metin: e.target.value }))}
              placeholder="Ana görevi açık alt görevlerle kapatma gerekçen…"
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <Button variant="secondary" onClick={() => setKapatGerekce(null)}>Vazgeç</Button>
              <Button variant="primary" onClick={gerekceliKapat}>Gerekçeyle Tamamla</Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default GorevDetay
