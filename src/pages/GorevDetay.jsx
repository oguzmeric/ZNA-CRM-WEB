import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Trash2, Building2, Handshake, ArrowRight, CheckSquare, FileText, Smartphone,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { gorevGetir, gorevGuncelle, gorevSil } from '../services/gorevService'
import { gorevYorumlariGetir, gorevYorumEkle, gorevYorumGuncelle, gorevYorumSil } from '../services/gorevYorumService'
import { invalidate } from '../lib/cache'
import { useServisTalebi } from '../context/ServisTalebiContext'
import { useBildirim } from '../context/BildirimContext'
import { parseMentions, segmentMetin } from '../lib/mention'
import MentionTextarea from '../components/MentionTextarea'
import { EkSecici, EkListesi } from '../components/EkAlani'
import { ekleriYukle } from '../lib/ekDosya'
import { SkeletonDetay } from '../components/Skeleton'
import {
  Button, Textarea, Card, CardTitle, Badge, Avatar, EmptyState, SegmentedControl,
} from '../components/ui'

const oncelikler = [
  { id: 'dusuk',  isim: 'Düşük',  tone: 'pasif' },
  { id: 'orta',   isim: 'Orta',   tone: 'beklemede' },
  { id: 'yuksek', isim: 'Yüksek', tone: 'kayip' },
]

const durumlar = [
  { id: 'bekliyor',   isim: 'Açık',         tone: 'pasif' },
  { id: 'devam',      isim: 'Devam Ediyor', tone: 'lead' },
  { id: 'tamamlandi', isim: 'Tamamlandı',   tone: 'aktif' },
]

const DEVAM_SEBEPLERI = [
  { id: 'hava_muhalefeti',    isim: 'Hava Muhalefeti',    ikon: '🌧️' },
  { id: 'program_yogunlugu',  isim: 'Program Yoğunluğu',  ikon: '📅' },
  { id: 'tamir_ariza',        isim: 'Tamir / Arıza',      ikon: '🔧' },
  { id: 'uretici_tedarik',    isim: 'Üretici / Tedarik',  ikon: '📦' },
]

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
  }, [id])

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
  const durum   = durumlar.find(d => d.id === gorev.durum)
  const atananKisi = kullanicilar.find(k => k.id?.toString() === gorev.atanan?.toString())

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
    kaynak: 'mobil',
  }))
  const tumYorumlar = [...yorumlar.map(y => ({ ...y, kaynak: y.kaynak || 'web' })), ...mobilNotlar]
    .sort((a, b) => new Date(a.zaman || 0) - new Date(b.zaman || 0))

  const durumGuncelle = async (yeniDurum) => {
    const eskiDurum = gorev.durum
    // Devam'a geçerken sebep seçim modalını aç (opsiyonel)
    if (yeniDurum === 'devam' && eskiDurum !== 'devam') {
      setDevamSebepModal(true)
    }
    // Durum devam değilse mevcut sebep temizlenir
    const guncelleme = { durum: yeniDurum }
    if (yeniDurum !== 'devam') guncelleme.devamSebep = null
    await gorevGuncelle(gorev.id, guncelleme)
    setGorev(prev => ({ ...prev, ...guncelleme }))
    toast.success('Durum güncellendi.')
    // Atanan kişi mevcut kullanıcıdan farklıysa ona bildirim — kendi durumunu kendisi değiştirirken bildirim atmayalım
    if (eskiDurum !== yeniDurum && gorev.atanan && gorev.atanan?.toString() !== kullanici?.id?.toString()) {
      const yeniDurumIsim = durumlar.find(d => d.id === yeniDurum)?.isim || yeniDurum
      bildirimEkle(
        gorev.atanan,
        '📋 Görev durumu güncellendi',
        `"${gorev.baslik}" → ${yeniDurumIsim} (${kullanici?.ad || 'biri'} tarafından)`,
        'gorev',
        `/gorevler/${gorev.id}`,
      ).catch(e => console.warn('[bildirim] gorev durum:', e?.message))
    }
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

    // Görevi açan + atanan kişiye bildirim — yorumu kendisi yazmıyorsa ve mention'da yoksa.
    // olusturan_id kolonu yok, olusturanAd üzerinden kullanicilar tablosuyla eşleniyor.
    const paydaslar = []
    const olusturan = kullanicilar.find(k => k.ad === gorev.olusturanAd)
    if (olusturan?.id) paydaslar.push(olusturan.id)
    if (gorev.atanan) paydaslar.push(gorev.atanan)

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
            {oncelik && <Badge tone={oncelik.tone}>{oncelik.isim}</Badge>}
            {durum   && <Badge tone={durum.tone}>{durum.isim}</Badge>}
          </div>
          {duzenleyebilirMi && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <Button
                variant="secondary"
                iconLeft={<Pencil size={14} strokeWidth={1.5} />}
                onClick={() => navigate('/gorevler', { state: { duzenleGorevId: gorev.id } })}
              >
                Düzenle
              </Button>
              <Button
                variant="secondary"
                iconLeft={<Trash2 size={14} strokeWidth={1.5} />}
                onClick={async () => {
                  const onay = await confirm({
                    baslik: 'Görevi Sil',
                    mesaj: `"${gorev.baslik}" görevi silinecek. Geri alınamaz. Emin misin?`,
                    onayText: 'Evet, sil',
                    iptalText: 'Vazgeç',
                    tehlikeli: true,
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
            </div>
          )}
        </div>
        <h1 className="t-h1" style={{ marginBottom: 12 }}>{gorev.baslik}</h1>
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
            <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{gorev.sonTarih || '—'}</span>
          </div>
          <div>
            <div className="t-label" style={{ marginBottom: 4 }}>OLUŞTURAN</div>
            <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{gorev.olusturanAd || '—'}</span>
          </div>
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
              <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{gorev.gorusmeFirma}</span>
              {gorev.gorusmeAktNo && (
                <span style={{ font: '400 12px/16px var(--font-mono)', color: 'var(--text-tertiary)' }}>{gorev.gorusmeAktNo}</span>
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

      {/* Durum güncelle — yalnız yetkili (atanan/ekip/admin) */}
      {!duzenleyebilirMi ? (
        <Card style={{ marginBottom: 16 }}>
          <p className="t-label" style={{ marginBottom: 6 }}>DURUM</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {durum && <Badge tone={durum.tone}>{durum.isim}</Badge>}
            <span className="t-caption" style={{ fontStyle: 'italic' }}>
              Bu görevi yalnızca sahibi ve ekibi düzenleyebilir — siz görüntüleyebilir ve yorum yapabilirsiniz.
            </span>
          </div>
        </Card>
      ) : (
      <Card style={{ marginBottom: 16 }}>
        <p className="t-label" style={{ marginBottom: 8 }}>DURUMU GÜNCELLE</p>
        <SegmentedControl
          options={durumlar.map(d => ({ value: d.id, label: d.isim }))}
          value={gorev.durum}
          onChange={durumGuncelle}
        />
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

      {/* Yorumlar */}
      <Card>
        <div style={{ marginBottom: 16 }}>
          <CardTitle>Yorumlar</CardTitle>
          <p className="t-caption" style={{ marginTop: 2 }}>
            <span className="tabular-nums">{tumYorumlar.length}</span> yorum
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {tumYorumlar.length === 0 && (
            <p className="t-caption">Henüz yorum yok.</p>
          )}
          {tumYorumlar.map(yorum => {
            const mobilMi = yorum.kaynak === 'mobil'
            // Düzenle/sil yalnız web kaynaklı kendi yorumunda (mobil notlar
            // gorevler.notlar'da; webden düzenlenmez, mobil tarafın işi)
            const benimMi = !mobilMi && kendisiMi(yorum)
            const duzenlemede = duzenleYorumId === yorum.id
            return (
              <div
                key={yorum.id}
                className="group"
                style={{
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Avatar name={yorum.yazar} size="xs" />
                    <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{yorum.yazar}</span>
                    {mobilMi && (
                      <span title="Mobil uygulamadan eklendi" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        padding: '1px 6px', borderRadius: 'var(--radius-pill)',
                        background: 'var(--brand-primary-soft)', color: 'var(--brand-primary)',
                        font: '600 10px/14px var(--font-sans)',
                      }}>
                        <Smartphone size={10} strokeWidth={2} /> Mobil
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                      {yorum.tarih}
                      {yorum.duzenlendi && <span style={{ fontStyle: 'italic', marginLeft: 4 }}>(düzenlendi)</span>}
                    </span>
                    {benimMi && !duzenlemede && (
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <button
                          aria-label="Düzenle"
                          onClick={() => duzenlemeBaslat(yorum)}
                          style={{
                            width: 24, height: 24,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'transparent',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-secondary)', cursor: 'pointer',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                        >
                          <Pencil size={11} strokeWidth={1.5} />
                        </button>
                        <button
                          aria-label="Sil"
                          onClick={() => yorumSil(yorum.id)}
                          style={{
                            width: 24, height: 24,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'transparent',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-secondary)', cursor: 'pointer',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                        >
                          <Trash2 size={11} strokeWidth={1.5} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {duzenlemede ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    <MentionTextarea
                      value={duzenleIcerik}
                      onChange={setDuzenleIcerik}
                      kullanicilar={kullanicilar || []}
                      rows={3}
                      placeholder="Yorumu düzenle… (@ ile etiketle)"
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button variant="primary" size="sm" onClick={yorumGuncelle}>Kaydet</Button>
                      <Button variant="secondary" size="sm" onClick={duzenlemeIptal}>İptal</Button>
                    </div>
                  </div>
                ) : (
                  <p style={{ font: '400 13px/20px var(--font-sans)', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap' }}>
                    {segmentMetin(yorum.icerik, kullanicilar).map((seg, i) =>
                      seg.tip === 'mention' ? (
                        <span key={i} style={{
                          color: 'var(--brand-primary)',
                          fontWeight: 600,
                          background: 'var(--brand-primary-soft)',
                          padding: '0 4px',
                          borderRadius: 3,
                        }}>
                          {seg.deger}
                        </span>
                      ) : (
                        <span key={i}>{seg.deger}</span>
                      )
                    )}
                  </p>
                )}
                {/* Web yorum ekleri (mig 184) */}
                {!mobilMi && <EkListesi dosyalar={yorum.dosyalar} />}
                {/* Mobil nottaki fotoğraflar (varsa) */}
                {mobilMi && yorum.fotoUrls?.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {yorum.fotoUrls.filter(u => /^https?:\/\//.test(u)).map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt="not fotoğrafı" style={{
                          width: 72, height: 72, objectFit: 'cover',
                          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)',
                        }} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
          <MentionTextarea
            value={yeniYorum}
            onChange={setYeniYorum}
            kullanicilar={kullanicilar || []}
            rows={3}
            placeholder="Yorum yaz… (kullanıcı etiketlemek için @ yazın)"
            style={{ marginBottom: 8 }}
          />
          <div style={{ marginBottom: 8 }}>
            <EkSecici dosyalar={yorumEkleri} onChange={setYorumEkleri} disabled={yorumGonderiliyor} />
          </div>
          <Button variant="primary" onClick={yorumEkle} disabled={yorumGonderiliyor}>
            {yorumGonderiliyor ? 'Gönderiliyor…' : 'Yorum ekle'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default GorevDetay
