// Personel Sicil Kartı — /ik-yonetim/sicil/:id
//
// Menüde GÖRÜNMEZ; yalnız İK Yönetimi → Personel Sicil sekmesinden girilir
// (kullanıcı kararı 18.08: "ekstradan menü eklememize gerek yok").
//
// Görsel dil MusteriDetay.jsx ile birebir aynı: maxWidth 1440, künye kartı
// padding 14 / mb 12, bölüm kartları mb 16, sekme çubuğu IKYonetim pill'i.
//
// YETKİ: sayfa kapısı IKGuard (ik_yonetim modülü) — Ali (1), Oğuz (2),
// Abdullah (44). Bu üçü karttaki yedi tablonun HEPSİNİ görebiliyor, o yüzden
// kart içinde ikinci bir yetki ayrımı yok; "sekmeye tıkladım yetkim yok"
// durumu yapısal olarak imkânsız.
//
// Zimmet & Demirbaş sekmesi bir kez bu yüzden KALDIRILMIŞTI (demirbas_zimmet
// RLS'i demirbas_yetkili()'ye bakıyordu, Abdullah 162 kaydın sıfırını
// görüyordu). mig 312 o fonksiyona ik_yonetim modülünü ekledi — ölçüm
// Abdullah 0 → 162 — ve sekme geri geldi.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, User, Briefcase, Wallet, Clock, CalendarCheck, Banknote,
  LayoutDashboard, Pencil, Save, X, AlertTriangle, Phone, Mail, IdCard,
  PackageCheck, FolderOpen,
} from 'lucide-react'
import { Button, Card, Badge, CodeBadge, Avatar, EmptyState } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { SkeletonDetay } from '../components/Skeleton'
import {
  sicilGetir, sicilKaydet, personelGetir, yoneticiSecenekleriGetir,
  DEPARTMANLAR,
} from '../services/personelSicilService'
import { OZLUK_GRUPLARI, ISTIHDAM_GRUPLARI } from '../components/sicil/alanlar'
import { AlanGruplari, SekmeHata } from '../components/sicil/ortak'
import { tarihBicim } from '../components/sicil/bicim'
import { kidemMetni } from '../lib/izinHakedis'
import GenelBakisSekmesi from '../components/sicil/GenelBakisSekmesi'
import MaasBordroSekmesi from '../components/sicil/MaasBordroSekmesi'
import CalismaSaatleriSekmesi from '../components/sicil/CalismaSaatleriSekmesi'
import IzinlerSekmesi from '../components/sicil/IzinlerSekmesi'
import AvanslarSekmesi from '../components/sicil/AvanslarSekmesi'
import ZimmetSekmesi from '../components/sicil/ZimmetSekmesi'
import EvrakModal from '../components/sicil/EvrakModal'

const SEKMELER = [
  { id: 'genel',    label: 'Genel Bakış',      ikon: LayoutDashboard },
  { id: 'ozluk',    label: 'Özlük',            ikon: User },
  { id: 'istihdam', label: 'İstihdam',         ikon: Briefcase },
  { id: 'maas',     label: 'Maaş & Bordro',    ikon: Wallet },
  { id: 'mesai',    label: 'Çalışma Saatleri', ikon: Clock },
  { id: 'izin',     label: 'İzinler',          ikon: CalendarCheck },
  { id: 'avans',    label: 'Avanslar',         ikon: Banknote },
  { id: 'zimmet',   label: 'Zimmet & Demirbaş', ikon: PackageCheck },
]

// Düzenlenebilir sekmeler — ikisi de aynı personel_sicil satırını yazar
const DUZENLENEBILIR = { ozluk: OZLUK_GRUPLARI, istihdam: ISTIHDAM_GRUPLARI }

export default function PersonelSicil() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { kullanici } = useAuth()
  const { toast } = useToast()

  const [personel, setPersonel] = useState(null)
  const [sicil, setSicil] = useState(null)
  const [yoneticiler, setYoneticiler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState(null)
  const [sekme, setSekme] = useState('genel')
  const [evrakAcik, setEvrakAcik] = useState(false)

  // form !== null → düzenleme modu. TÜM sicil kaydını tutar: upsert satırın
  // tamamını yazdığı için yalnız görünen alanları göndermek diğerlerini siler.
  const [form, setForm] = useState(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  // Yükleme bayrağı effect gövdesinde senkron set EDİLMEZ (cascading render):
  // başlangıçta zaten true, yeniden denemede `yukle()` içinde — yani olay
  // işleyicisinde — set edilir.
  const [yenileSayac, setYenileSayac] = useState(0)

  useEffect(() => {
    let iptal = false
    const calistir = async () => {
      try {
        const [p, s, y] = await Promise.all([
          personelGetir(id),
          sicilGetir(id),
          yoneticiSecenekleriGetir(),
        ])
        if (iptal) return
        setPersonel(p)
        setSicil(s)
        setYoneticiler(y)
        setHata(null)
      } catch (e) {
        if (iptal) return
        console.error('[sicil yükle]', e?.message || e)
        setHata(e)
      } finally {
        if (!iptal) setYukleniyor(false)
      }
    }
    calistir()
    return () => { iptal = true }
  }, [id, yenileSayac])

  const yukle = useCallback(() => {
    setYukleniyor(true)
    setHata(null)
    setYenileSayac(s => s + 1)
  }, [])

  // Kaydedilmemiş değişiklikle sekmeden/sayfadan çıkış koruması
  useEffect(() => {
    if (!form) return undefined
    const uyar = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', uyar)
    return () => window.removeEventListener('beforeunload', uyar)
  }, [form])

  const setAlan = useCallback((k, v) => setForm(f => ({ ...(f || {}), [k]: v })), [])

  const duzenleBaslat = () => setForm({ ...(sicil || {}) })
  const duzenleIptal = () => setForm(null)

  const kaydet = async () => {
    setKaydediliyor(true)
    try {
      const yeni = await sicilKaydet(id, form, kullanici?.id)
      setSicil(yeni)
      setForm(null)
      toast?.success?.('Sicil bilgileri kaydedildi.')
    } catch (e) {
      toast?.error?.(e?.message || 'Kaydedilemedi.')
    } finally {
      setKaydediliyor(false)
    }
  }

  const ekBaglam = useMemo(() => ({
    yoneticiler: yoneticiler
      .filter(y => Number(y.id) !== Number(id))       // kişi kendi yöneticisi olamaz
      .map(y => ({ id: y.id, isim: y.unvan ? `${y.ad} — ${y.unvan}` : y.ad })),
  }), [yoneticiler, id])

  if (yukleniyor) return <SkeletonDetay />

  if (hata) {
    return (
      <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>
        <SekmeHata hata={hata} tekrar={yukle} />
      </div>
    )
  }

  if (!personel) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyState
          icon={<User size={32} strokeWidth={1.5} />}
          title="Personel bulunamadı"
          description="Kayıt silinmiş ya da erişim yetkiniz yok olabilir."
          action={
            <Button variant="secondary" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />}
              onClick={() => navigate('/ik-yonetim?sekme=sicil')}>
              İK Yönetimi'ne dön
            </Button>
          }
        />
      </div>
    )
  }

  const ayrildi = !!sicil?.istenCikisTarihi
  const durum = ayrildi
    ? { isim: 'Ayrıldı', tone: 'neutral' }
    : personel.askida
      ? { isim: 'Askıda', tone: 'kayip' }
      : { isim: 'Aktif', tone: 'basarili' }

  const sicilYok = !sicil
  const iseGirisYok = !sicil?.iseGirisTarihi

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>
      {/* Geri */}
      <button
        onClick={() => navigate('/ik-yonetim?sekme=sicil')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--text-tertiary)', font: '500 13px/18px var(--font-sans)',
          marginBottom: 16, transition: 'color 120ms',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--brand-primary)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)' }}
      >
        <ArrowLeft size={14} strokeWidth={1.5} /> İK Yönetimi
      </button>

      {/* Eksik veri uyarısı */}
      {(sicilYok || iseGirisYok) && !form && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '9px 14px', marginBottom: 14,
          border: '1px solid rgba(245,158,11,0.35)', borderRadius: 'var(--radius-md)',
          background: 'rgba(245,158,11,0.07)',
        }}>
          <AlertTriangle size={15} strokeWidth={1.7} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 220, font: '600 12.5px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
            {sicilYok
              ? 'Bu personel için sicil bilgisi henüz girilmemiş.'
              : 'İşe giriş tarihi girilmemiş — kıdem ve yıllık izin hakedişi hesaplanamıyor.'}
          </span>
          <Button size="sm" variant="secondary" iconLeft={<Pencil size={13} strokeWidth={1.5} />}
            onClick={() => { setSekme(sicilYok ? 'ozluk' : 'istihdam'); duzenleBaslat() }}>
            Bilgileri gir
          </Button>
        </div>
      )}

      {/* ── Künye ─────────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 12, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
            <Avatar name={personel.ad} src={personel.fotoUrl} size="lg" />
            <div style={{ minWidth: 0 }}>
              <div style={{ font: '700 19px/26px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 3 }}>
                {personel.ad || '—'}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)',
              }}>
                <Badge tone={durum.tone}>{durum.isim}</Badge>
                {personel.unvan && <span>{personel.unvan}</span>}
                {sicil?.departman && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Briefcase size={11} strokeWidth={1.5} /> {sicil.departman}
                  </span>
                )}
                {sicil?.tcKimlik && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} className="tabular-nums">
                    <IdCard size={11} strokeWidth={1.5} /> {sicil.tcKimlik}
                  </span>
                )}
                {personel.cepTelefon && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} className="tabular-nums">
                    <Phone size={11} strokeWidth={1.5} /> {personel.cepTelefon}
                  </span>
                )}
                {personel.email && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Mail size={11} strokeWidth={1.5} /> {personel.email}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Düzenle / Kaydet — yalnız düzenlenebilir sekmelerde */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
            {DUZENLENEBILIR[sekme] && (
              form ? (
                <>
                  <Button variant="primary" size="sm" disabled={kaydediliyor}
                    iconLeft={<Save size={13} strokeWidth={1.5} />} onClick={kaydet}>
                    {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
                  </Button>
                  <Button variant="secondary" size="sm" disabled={kaydediliyor}
                    iconLeft={<X size={13} strokeWidth={1.5} />} onClick={duzenleIptal}>
                    İptal
                  </Button>
                </>
              ) : (
                <Button variant="primary" size="sm"
                  iconLeft={<Pencil size={13} strokeWidth={1.5} />} onClick={duzenleBaslat}>
                  Düzenle
                </Button>
              )
            )}
          </div>
        </div>

        {/* Künye özet şeridi — kıdem / işe giriş / doğum */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 4,
          marginTop: 12, paddingTop: 10,
          borderTop: '1px solid var(--border-default)',
          alignItems: 'stretch',
        }}>
          {[
            { isim: 'İşe Giriş', deger: sicil?.iseGirisTarihi ? tarihBicim(sicil.iseGirisTarihi) : 'girilmemiş',
              vurgu: !sicil?.iseGirisTarihi },
            { isim: 'Kıdem', deger: sicil?.iseGirisTarihi ? kidemMetni(sicil.iseGirisTarihi) : '—' },
            { isim: 'Doğum', deger: sicil?.dogumTarihi ? tarihBicim(sicil.dogumTarihi) : '—' },
            ...(ayrildi ? [{ isim: 'Çıkış', deger: tarihBicim(sicil.istenCikisTarihi), vurgu: true }] : []),
          ].map((k, i, arr) => [
            <div key={k.isim} style={{ padding: '4px 12px', display: 'inline-flex', flexDirection: 'column', gap: 1 }}>
              <span className="t-label">{k.isim}</span>
              <span style={{
                font: '600 13px/18px var(--font-sans)',
                color: k.vurgu ? 'var(--warning)' : 'var(--text-primary)',
                fontVariantNumeric: 'tabular-nums',
              }}>{k.deger}</span>
            </div>,
            i < arr.length - 1 && (
              <span key={`ay-${i}`} style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-default)' }} />
            ),
          ])}
        </div>
      </Card>

      {/* ── Sekme çubuğu + özlük evrakları ────────────────────────────
          Evrak AYRI SEKME değil: çubuk zaten sekiz öğeyle dolu ve evrak işi
          "aç, yükle, kapat" biçiminde kısa sürüyor — sekme yapmak sicilde
          gezinmeyi bölerdi. Düğme bilerek çubuğun sağındaki boşlukta. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 16, flexWrap: 'wrap',
      }}>
      <div style={{
        display: 'inline-flex', background: 'var(--surface-sunken)',
        border: '1px solid var(--border-default)', borderRadius: 10,
        padding: 3, flexWrap: 'wrap',
        opacity: form ? 0.55 : 1,
      }}>
        {SEKMELER.map(s => {
          const aktif = sekme === s.id
          const Icon = s.ikon
          return (
            <button key={s.id} disabled={!!form} onClick={() => setSekme(s.id)}
              title={form ? 'Önce düzenlemeyi kaydet veya iptal et' : undefined}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 7,
                background: aktif ? 'var(--brand-primary)' : 'transparent',
                color: aktif ? '#fff' : 'var(--text-secondary)',
                border: 'none', cursor: form ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600,
              }}>
              <Icon size={14} /> {s.label}
            </button>
          )
        })}
      </div>

        <Button
          variant="secondary"
          size="sm"
          disabled={!!form}
          title={form ? 'Önce düzenlemeyi kaydet veya iptal et' : 'Kimlik, diploma, sağlık raporu gibi özlük evrakları'}
          iconLeft={<FolderOpen size={14} strokeWidth={1.8} />}
          onClick={() => setEvrakAcik(true)}
        >
          Özlük Evrakları
        </Button>
      </div>

      {form && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', marginBottom: 12,
          border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-sunken)',
          font: '500 12px/17px var(--font-sans)', color: 'var(--text-secondary)',
        }}>
          <Pencil size={12} strokeWidth={1.7} />
          Düzenleme modundasın — kaydetmeden sekme değiştiremezsin.
        </div>
      )}

      {/* ── Sekme içeriği ─────────────────────────────────────────────── */}
      <Card padding={0} style={{ marginBottom: 16 }}>
        {sekme === 'genel' && <GenelBakisSekmesi kullaniciId={id} sicil={sicil} />}

        {DUZENLENEBILIR[sekme] && (
          <div style={{ padding: 16 }}>
            <AlanGruplari
              gruplar={DUZENLENEBILIR[sekme]}
              form={form || sicil || {}}
              setAlan={setAlan}
              duzenle={!!form}
              ekBaglam={ekBaglam}
            />
            {!form && !sicil && (
              <div style={{ marginTop: 16, font: '400 12px/17px var(--font-sans)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                Henüz sicil bilgisi girilmemiş. Yukarıdaki{' '}
                <b style={{ fontStyle: 'normal', color: 'var(--text-secondary)' }}>Düzenle</b> butonundan doldurabilirsin.
              </div>
            )}
          </div>
        )}

        {sekme === 'maas'  && <MaasBordroSekmesi kullaniciId={id} />}
        {sekme === 'mesai' && <CalismaSaatleriSekmesi kullaniciId={id} />}
        {sekme === 'izin'  && (
          <IzinlerSekmesi kullaniciId={id} sicil={sicil}
            istihdamaGit={() => { setSekme('istihdam'); duzenleBaslat() }} />
        )}
        {sekme === 'avans' && <AvanslarSekmesi kullaniciId={id} />}
        {sekme === 'zimmet' && <ZimmetSekmesi kullaniciId={id} personelAd={personel?.ad} />}
      </Card>

      {/* Kayıt izi */}
      {sicil?.guncellemeTarih && (
        <div className="t-caption" style={{ textAlign: 'right' }}>
          Son güncelleme: {tarihBicim(sicil.guncellemeTarih)}
        </div>
      )}

      <EvrakModal
        acik={evrakAcik}
        kapat={() => setEvrakAcik(false)}
        kullaniciId={id}
        personelAd={personel?.ad}
      />
    </div>
  )
}
