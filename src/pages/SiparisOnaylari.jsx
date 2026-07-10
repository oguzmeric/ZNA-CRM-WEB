// Sipariş Onayları — yetkili kullanıcılar burada bekleyen siparişleri görür,
// imza ekleyerek onaylar veya reddeder.
//
// Erisim: sadece kullanici.siparis_onay_yetkilisi === true olanlar.

import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, Clock, FileText, Upload, X, Image as ImageIcon,
  Building2, User as UserIcon, Calendar, Receipt, Plus,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  Card, CardTitle, Button, Badge, EmptyState, Textarea,
} from '../components/ui'
import {
  bekleyenSiparisleriGetir, onaylananSiparisleriGetir, reddedilenSiparisleriGetir,
  bekleyenOnSiparisleriGetir, onSiparisiOnayla, onSiparisiReddet,
  imzaYukle, siparisOnayla, siparisReddet, siparisOnayGeriAl,
} from '../services/siparisOnayService'
import { kalemleriGetir as onSiparisKalemleriGetir, iptalEdilenOnSiparisleriGetir } from '../services/onSiparisService'
import { siparisleriGetir } from '../services/siparisService'
import { gorusmeleriGetir } from '../services/gorusmeService'
import TeklifKalemTablosu, { toplamHesapla } from '../components/TeklifKalemTablosu'
import YeniOnSiparisWizard from '../components/YeniOnSiparisWizard'

// Teklifin genel toplamı DB'de yoksa satırlardan hesapla
function gerçekToplam(t) {
  const db = Number(t?.genelToplam || 0)
  if (db > 0) return db
  return toplamHesapla(t?.satirlar).genelToplam
}

const fmtPara = (tutar, pb = 'TL') => {
  const n = Number(tutar || 0)
  const sembol = pb === 'TL' ? '₺' : pb === 'USD' ? '$' : pb === 'EUR' ? '€' : pb
  return `${sembol} ${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const fmtTarih = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
  } catch { return iso }
}

// Ön sipariş odaklı 3 sekme — tüm veriler on_siparisler + siparisler tablolarından.
const SEKMELER = [
  { id: 'bekleyen', label: 'Bekleyen',   renk: '#F59E0B' },
  { id: 'onayli',   label: 'Onaylı',     renk: '#10B981' },
  { id: 'red',      label: 'Reddedilen', renk: '#DC2626' },
]

export default function SiparisOnaylari() {
  const { kullanici } = useAuth()
  const navigate = useNavigate()
  const [sekme, setSekme] = useState('bekleyen')
  const [liste, setListe] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [secili, setSecili] = useState(null)
  const [gorusmeMap, setGorusmeMap] = useState(new Map())
  const [wizardAcik, setWizardAcik] = useState(false)

  // Görüşmeleri bir kere yükle — id→gorusme_no+tarih+gorusen mapping
  useEffect(() => {
    if (!yetkili) return
    gorusmeleriGetir()
      .then(gs => {
        const m = new Map()
        ;(gs || []).forEach(g => m.set(g.id, g))
        setGorusmeMap(m)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const yetkili = kullanici?.siparisOnayYetkilisi === true || kullanici?.siparis_onay_yetkilisi === true

  const yukle = async () => {
    setYukleniyor(true)
    try {
      if (sekme === 'bekleyen') {
        // Ön siparişler: onay bekleyenler (tedarik odaklı)
        const onSiparisler = await bekleyenOnSiparisleriGetir().catch(() => [])
        setListe(
          onSiparisler.map(o => ({ ...o, _kaynak: 'on_siparis' }))
            .sort((a, b) => new Date(b.olusturmaTarih || 0) - new Date(a.olusturmaTarih || 0))
        )
      } else if (sekme === 'onayli') {
        // Onaylı: ön siparişten dönmüş siparişler (ZNA-SIP-... kayıtları)
        const tumSiparisler = await siparisleriGetir().catch(() => [])
        setListe(
          tumSiparisler
            .filter(s => s.kaynakTipi === 'on_siparis' && s.durum !== 'iptal')
            .map(s => ({ ...s, _kaynak: 'siparis' }))
            .sort((a, b) => new Date(b.onayTarihi || 0) - new Date(a.onayTarihi || 0))
        )
      } else {
        // Reddedilen: iptal edilen ön siparişler
        const iptaller = await iptalEdilenOnSiparisleriGetir().catch(() => [])
        setListe(
          iptaller
            .map(o => ({ ...o, _kaynak: 'on_siparis' }))
            .sort((a, b) => new Date(b.guncellemeTarih || 0) - new Date(a.guncellemeTarih || 0))
        )
      }
    } catch (e) {
      console.error('[siparis onay liste]', e)
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { if (yetkili) yukle() }, [sekme, yetkili])

  if (!yetkili) {
    return (
      <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
        <EmptyState
          title="Bu sayfaya erişim yetkin yok"
          aciklama="Sipariş Onayları sayfası yalnızca yetkilendirilmiş kullanıcılara açıktır. Yöneticinden talep edebilirsin."
          icon={<XCircle size={32} />}
        />
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <h1 className="t-h1">Sipariş Onayları</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => navigate('/siparisler')}>Siparişler →</Button>
          <Button
            variant="primary"
            iconLeft={<Plus size={14} strokeWidth={1.5} />}
            onClick={() => setWizardAcik(true)}
          >
            Yeni Ön Sipariş
          </Button>
        </div>
      </div>

      {/* Sekme barı */}
      <div style={{
        display: 'inline-flex',
        background: 'var(--surface-subtle, #F4F6F8)',
        borderRadius: 10, padding: 4, marginBottom: 16,
      }}>
        {SEKMELER.map(s => {
          const aktif = sekme === s.id
          return (
            <button
              key={s.id}
              onClick={() => { setSekme(s.id); setSecili(null) }}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                background: aktif ? '#fff' : 'transparent',
                color: aktif ? s.renk : 'var(--text-secondary)',
                border: 'none', cursor: 'pointer',
                font: aktif ? '700 13px/16px var(--font-sans)' : '500 13px/16px var(--font-sans)',
                boxShadow: aktif ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 420px) 1fr', gap: 16 }}>
        {/* Liste */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {yukleniyor ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
          ) : liste.length === 0 ? (
            <EmptyState
              title={sekme === 'bekleyen' ? 'Bekleyen ön sipariş yok' : sekme === 'onayli' ? 'Onaylanmış sipariş yok' : 'İptal edilmiş ön sipariş yok'}
              icon={<Clock size={24} />}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {liste.map(t => {
                const kaynak = t._kaynak || 'on_siparis'
                const isSip = kaynak === 'siparis'   // Onaylı → ZNA-SIP kaydı
                const seciliMi = secili?.id === t.id && secili?._kaynak === kaynak
                const kayitNo = isSip ? t.siparisNo : t.onSiparisNo
                const badgeLabel = isSip ? 'SİPARİŞ' : 'ÖN SİPARİŞ'
                const badgeTone = isSip ? 'aktif' : 'success'
                const tarih = isSip ? (t.onayTarihi || t.olusturmaTarih)
                            : sekme === 'red' ? (t.guncellemeTarih || t.olusturmaTarih)
                            : t.olusturmaTarih
                const musteriAd = (() => {
                  // Ön sipariş kaydında firmaAdi yok; görüşmeden çıkar
                  const g = gorusmeMap.get(t.gorusmeId)
                  return g?.firmaAdi || '—'
                })()
                const onClick = isSip
                  ? () => navigate(`/siparisler/${t.id}`)
                  : () => setSecili(t)
                return (
                  <button
                    key={`${kaynak}-${t.id}`}
                    onClick={onClick}
                    style={{
                      textAlign: 'left',
                      padding: '14px 16px',
                      background: seciliMi ? 'var(--surface-subtle)' : 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      borderLeft: `3px solid ${seciliMi ? 'var(--accent, #1E5AA8)' : 'transparent'}`,
                    }}
                    onMouseEnter={e => { if (!seciliMi) e.currentTarget.style.background = 'var(--surface-subtle)' }}
                    onMouseLeave={e => { if (!seciliMi) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: isSip ? 'monospace' : 'inherit' }}>
                        {kayitNo || '—'}
                      </strong>
                      <Badge tone={badgeTone} style={{ fontSize: 10 }}>{badgeLabel}</Badge>
                      {(() => {
                        const g = gorusmeMap.get(t.gorusmeId)
                        return g?.aktNo ? (
                          <span style={{
                            fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
                            color: '#3b82f6', padding: '2px 6px',
                            background: 'rgba(59,130,246,0.10)', borderRadius: 4,
                          }} title="Kaynak görüşme">
                            {g.aktNo}
                          </span>
                        ) : null
                      })()}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      <Building2 size={11} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />
                      {musteriAd}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtTarih(tarih)}</span>
                      {isSip ? (
                        <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{fmtPara(t.genelToplam, t.paraBirimi)}</strong>
                      ) : sekme === 'red' ? (
                        <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 600 }}>iptal</span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#F59E0B', fontWeight: 600 }}>fiyat girilecek</span>
                      )}
                    </div>
                    {isSip && t.onaylayanAd && (
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                        ✓ {t.onaylayanAd} · {fmtTarih(t.onayTarihi)}
                      </div>
                    )}
                    {sekme === 'red' && t.iptalSebebi && (
                      <div style={{ fontSize: 11, color: '#B91C1C', marginTop: 4 }}>
                        ✕ {t.iptalSebebi}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        {/* Detay */}
        <div>
          {secili ? (
            secili._kaynak === 'on_siparis' ? (
              <OnSiparisDetayPaneli
                onSiparis={secili}
                sekme={sekme}
                kullanici={kullanici}
                gorusme={gorusmeMap.get(secili.gorusmeId)}
                onTamamlandi={() => { setSecili(null); yukle() }}
              />
            ) : (
              <DetayPaneli
                teklif={secili}
                sekme={sekme}
                kullanici={kullanici}
                gorusme={gorusmeMap.get(secili.gorusmeId)}
                onTamamlandi={() => { setSecili(null); yukle() }}
              />
            )
          ) : (
            <Card>
              <EmptyState
                title="Bir kayıt seç"
                description={
                  sekme === 'onayli'
                    ? 'Soldan bir siparişe tıklayınca detay sayfasına yönlendirilirsin.'
                    : sekme === 'red'
                    ? 'Soldan iptal edilen bir ön siparişe tıklayınca detayları görürsün.'
                    : 'Soldan bir ön sipariş seç, kalemlere fiyat gir ve onayla → ZNA-SIP-... otomatik oluşur.'
                }
                icon={<FileText size={24} />}
              />
            </Card>
          )}
        </div>
      </div>

      {/* Yeni Ön Sipariş wizard'ı */}
      {wizardAcik && (
        <YeniOnSiparisWizard
          onKapat={() => setWizardAcik(false)}
          onKaydedildi={() => { yukle() }}
        />
      )}
    </div>
  )
}

// ─── Detay paneli ──────────────────────────────────────────────────────────

function DetayPaneli({ teklif: t, sekme, kullanici, onTamamlandi, gorusme }) {
  const fileRef = useRef(null)
  const [imzaDosyasi, setImzaDosyasi] = useState(null)
  const [imzaPreview, setImzaPreview] = useState(null)
  const [redNedeni, setRedNedeni] = useState('')
  const [redModalAcik, setRedModalAcik] = useState(false)
  const [onayGerekcesi, setOnayGerekcesi] = useState('')
  const [calisiyor, setCalisiyor] = useState(false)
  const [hata, setHata] = useState(null)

  const s = t.siparisOnayi || {}
  const profilImzasi = kullanici?.imza  // profilde yuklenmis imza
  const imzaVar = !!(imzaDosyasi || profilImzasi)
  // Ust yetkili (Ali) degilse onaylamadan once gerekce girmek zorunda.
  const ustYetkili = kullanici?.siparisOnayUstYetkili === true || kullanici?.siparis_onay_ust_yetkili === true
  const gerekceZorunlu = !ustYetkili

  const imzaSec = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { setHata('Sadece görsel dosyalar (JPG/PNG/WebP).'); return }
    if (f.size > 5 * 1024 * 1024) { setHata('Dosya 5 MB\'ı aşıyor.'); return }
    setHata(null)
    setImzaDosyasi(f)
    setImzaPreview(URL.createObjectURL(f))
  }

  const onayla = async () => {
    setHata(null)
    if (!imzaDosyasi && !profilImzasi) {
      setHata('İmza yok. Profilinden yükleyebilir veya buradan tek seferlik ekleyebilirsin.')
      return
    }
    if (gerekceZorunlu && !onayGerekcesi.trim()) {
      setHata('Üst yetkili (Ali Aktepe) henüz onaylamadığı için onay gerekçesi girmen gerekiyor.')
      return
    }
    setCalisiyor(true)
    try {
      const url = imzaDosyasi
        ? await imzaYukle(imzaDosyasi, t.id)
        : profilImzasi
      await siparisOnayla(t.id, {
        onaylayanId: kullanici.id,
        onaylayanAd: kullanici.ad,
        imzaUrl: url,
        onayGerekcesi: onayGerekcesi.trim(),
      })
      onTamamlandi()
    } catch (e) {
      setHata(e?.message || 'Onay kaydedilemedi.')
    } finally {
      setCalisiyor(false)
    }
  }

  const reddet = async () => {
    setHata(null)
    if (!redNedeni.trim()) { setHata('Red nedeni boş olamaz.'); return }
    setCalisiyor(true)
    try {
      await siparisReddet(t.id, {
        onaylayanId: kullanici.id,
        onaylayanAd: kullanici.ad,
        redNedeni: redNedeni.trim(),
      })
      setRedModalAcik(false)
      onTamamlandi()
    } catch (e) {
      setHata(e?.message || 'Red kaydedilemedi.')
    } finally {
      setCalisiyor(false)
    }
  }

  // Kararı geri al — onaylı ya da reddedilmiş siparişi bekleyen konumuna döndürür.
  // Onaylayan kişi VEYA üst yetkili yapabilir.
  const kararKimin = String(s.onaylayan_id) === String(kullanici?.id)
  const geriAlYetkili = ustYetkili || kararKimin
  const geriAl = async () => {
    if (!geriAlYetkili) { setHata('Bu kararı sadece onaylayan kişi veya üst yetkili geri alabilir.'); return }
    const eminMi = window.confirm(
      sekme === 'onayli'
        ? 'Onay geri alınacak. Sipariş tekrar "bekleyen" olacak, mevcut imza silinecek. Devam?'
        : 'Red kararı geri alınacak. Sipariş tekrar "bekleyen" olacak. Devam?'
    )
    if (!eminMi) return
    setHata(null)
    setCalisiyor(true)
    try {
      await siparisOnayGeriAl(t.id)
      onTamamlandi()
    } catch (e) {
      setHata(e?.message || 'Karar geri alınamadı.')
    } finally {
      setCalisiyor(false)
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            {gorusme?.aktNo && (
              <span style={{
                fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                color: '#3b82f6', padding: '3px 8px',
                background: 'rgba(59,130,246,0.10)', borderRadius: 6,
              }} title="Kaynak görüşme">
                {gorusme.aktNo}
              </span>
            )}
            <Badge tone="brand" style={{ fontSize: 10 }}>TEKLİF</Badge>
          </div>
          <CardTitle>{t.teklifNo} · {t.konu || '—'}</CardTitle>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            {t.firmaAdi} · {t.musteriYetkilisi || '—'}
          </div>
        </div>
        <Badge tone={sekme === 'onayli' ? 'aktif' : sekme === 'red' ? 'kayip' : 'beklemede'}>
          {sekme === 'onayli' ? 'Onaylı' : sekme === 'red' ? 'Reddedildi' : 'Bekliyor'}
        </Badge>
      </div>

      {/* Teklif bilgileri grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <BilgiKart Icon={Calendar} etiket="Teklif Tarihi" deger={fmtTarih(t.tarih)} />
        <BilgiKart Icon={UserIcon} etiket="Hazırlayan" deger={t.hazirlayan || '—'} />
        <BilgiKart Icon={Receipt} etiket="Tutar" deger={fmtPara(gerçekToplam(t), t.paraBirimi)} vurgu />
        <BilgiKart Icon={FileText} etiket="Ödeme" deger={t.odemeSekli || t.odemeSecenegi || '—'} />
        {(t.gecerlilikTarihi || t.teslimTarihi) && (
          <BilgiKart Icon={Calendar} etiket={t.teslimTarihi ? 'Teslim Tarihi' : 'Geçerlilik'} deger={fmtTarih(t.teslimTarihi || t.gecerlilikTarihi)} />
        )}
        {t.aciklama && (
          <BilgiKart Icon={FileText} etiket="Açıklama" deger={t.aciklama} />
        )}
      </div>

      {/* Kalem tablosu — teklif detayı */}
      <TeklifKalemTablosu satirlar={t.satirlar} paraBirimi={t.paraBirimi} />


      {/* Onay notu — varsa belirgin gozuksun */}
      {s.onay_notu && (
        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid #F59E0B',
          borderRadius: 10, padding: 14, marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <FileText size={14} style={{ color: '#B45309' }} />
            <strong style={{ font: '700 12px/16px var(--font-sans)', color: '#92400E' }}>
              {t.hazirlayan ? `${t.hazirlayan}'dan not` : 'Hazırlayandan not'}
            </strong>
          </div>
          <div style={{ font: '400 13px/19px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
            {s.onay_notu}
          </div>
        </div>
      )}

      {/* Mevcut durum bilgisi */}
      {sekme === 'onayli' && (
        <div style={{
          background: 'rgba(16,185,129,0.08)', border: '1px solid #10B981',
          borderRadius: 10, padding: 14, marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <CheckCircle2 size={16} style={{ color: '#10B981' }} />
            <strong style={{ fontSize: 13, color: '#065F46' }}>Onaylı</strong>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <strong>{s.onaylayan_ad}</strong> · {fmtTarih(s.onay_tarihi)}
          </div>
          {s.onay_gerekcesi && (
            <div style={{ marginTop: 10, padding: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid #F59E0B', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: '#92400E', fontWeight: 700, marginBottom: 4 }}>ONAY GEREKÇESİ</div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{s.onay_gerekcesi}</div>
            </div>
          )}
          {s.imza_url && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>İMZA</div>
              <img src={s.imza_url} alt="imza" style={{ maxHeight: 80, maxWidth: 240, background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 4 }} />
            </div>
          )}
          {geriAlYetkili && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(16,185,129,0.25)' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={geriAl}
                disabled={calisiyor}
                iconLeft={<Clock size={12} strokeWidth={1.5} />}
              >
                {calisiyor ? 'İşleniyor…' : 'Onayı Geri Al'}
              </Button>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
                Yanlışlıkla onayladıysan burada tekrar bekleyene çevirebilirsin.
              </div>
            </div>
          )}
        </div>
      )}

      {sekme === 'red' && (
        <div style={{
          background: '#FEE2E2', border: '1px solid #FCA5A5',
          borderRadius: 10, padding: 14, marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <XCircle size={16} style={{ color: '#DC2626' }} />
            <strong style={{ fontSize: 13, color: '#991B1B' }}>Reddedildi</strong>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <strong>{s.onaylayan_ad}</strong> · {fmtTarih(s.onay_tarihi)}
          </div>
          {s.red_nedeni && (
            <div style={{ marginTop: 8, padding: 8, background: '#fff', borderRadius: 6, fontSize: 12, color: 'var(--text-primary)' }}>
              <strong>Neden:</strong> {s.red_nedeni}
            </div>
          )}
          {geriAlYetkili && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(220,38,38,0.2)' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={geriAl}
                disabled={calisiyor}
                iconLeft={<Clock size={12} strokeWidth={1.5} />}
              >
                {calisiyor ? 'İşleniyor…' : 'Reddi Geri Al'}
              </Button>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
                Yanlışlıkla reddettiysen burada tekrar bekleyene çevirebilirsin.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bekleyen — imza + onay/red butonları */}
      {sekme === 'bekleyen' && (
        <>
          <div style={{
            border: '2px dashed var(--border-default)',
            borderRadius: 12, padding: 20, marginBottom: 14,
            background: imzaPreview || profilImzasi ? '#fff' : 'var(--surface-subtle)',
            textAlign: 'center',
          }}>
            {imzaPreview ? (
              // Yeni imza secildi (override)
              <div>
                <div style={{ font: '500 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Yeni İmza (Bu Onay İçin)
                </div>
                <img src={imzaPreview} alt="imza preview" style={{ maxHeight: 100, maxWidth: 320, marginBottom: 8 }} />
                <div>
                  <button
                    onClick={() => { setImzaDosyasi(null); setImzaPreview(null); if (fileRef.current) fileRef.current.value = '' }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <X size={12} /> Vazgeç, profil imzasını kullan
                  </button>
                </div>
              </div>
            ) : profilImzasi ? (
              // Profilden gelen imza kullanilacak
              <div>
                <div style={{ font: '500 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Profil İmzan
                </div>
                <img src={profilImzasi} alt="profil imzası" style={{ maxHeight: 100, maxWidth: 320, marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <Button variant="tertiary" onClick={() => fileRef.current?.click()} iconLeft={<Upload size={12} />}>
                    Bu onay için farklı imza yükle
                  </Button>
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={imzaSec} />
                </div>
              </div>
            ) : (
              <>
                <ImageIcon size={28} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Henüz profilinde imza yok.
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
                  Profile imza yüklersen sonraki onaylarda otomatik kullanılır. Veya bu onaya özel:
                </div>
                <Button variant="secondary" onClick={() => fileRef.current?.click()} iconLeft={<Upload size={14} />}>
                  Bu onay için imza yükle
                </Button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={imzaSec} />
              </>
            )}
          </div>

          {/* Gerekce zorunlu — ust yetkili degilse */}
          {gerekceZorunlu && (
            <div style={{
              background: 'rgba(245,158,11,0.06)',
              border: '1px solid #F59E0B',
              borderRadius: 10, padding: 14, marginBottom: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <strong style={{ font: '700 12px/16px var(--font-sans)', color: '#92400E' }}>
                  Onay Gerekçesi <span style={{ color: '#DC2626' }}>*</span>
                </strong>
              </div>
              <div style={{ font: '400 12px/17px var(--font-sans)', color: 'var(--text-secondary)', marginBottom: 8 }}>
                Üst yetkili (Ali Aktepe) bu siparişi henüz onaylamadığı için onaylamadan önce gerekçe belirtmen gerekiyor.
              </div>
              <Textarea
                value={onayGerekcesi}
                onChange={e => setOnayGerekcesi(e.target.value)}
                placeholder="Örn: Ali bey izinde, müşteri aciliyet bildirdiği için onaylıyorum…"
                rows={3}
              />
            </div>
          )}

          {hata && (
            <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', color: '#991B1B', fontSize: 13, marginBottom: 12 }}>
              {hata}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="tertiary" onClick={() => setRedModalAcik(true)} disabled={calisiyor}>
              <XCircle size={14} /> Reddet
            </Button>
            <Button
              variant="primary"
              onClick={onayla}
              disabled={!imzaVar || calisiyor || (gerekceZorunlu && !onayGerekcesi.trim())}
            >
              <CheckCircle2 size={14} /> {calisiyor ? 'Kaydediliyor…' : 'Siparişi Onayla'}
            </Button>
          </div>
        </>
      )}

      {/* Red modal */}
      {redModalAcik && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,27,46,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }}
        onClick={() => setRedModalAcik(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 480, width: '100%' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ font: '700 16px/22px var(--font-sans)', marginBottom: 12 }}>Siparişi Reddet</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
              <strong>{t.teklifNo}</strong> teklifini reddediyorsun. Neden belirt:
            </p>
            <Textarea
              value={redNedeni}
              onChange={e => setRedNedeni(e.target.value)}
              placeholder="Red nedeni…"
              rows={4}
              autoFocus
            />
            {hata && <div style={{ color: '#991B1B', fontSize: 12, marginTop: 8 }}>{hata}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <Button variant="secondary" onClick={() => setRedModalAcik(false)} disabled={calisiyor}>İptal</Button>
              <Button variant="primary" onClick={reddet} disabled={calisiyor}>
                {calisiyor ? 'Kaydediliyor…' : 'Reddet'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

function BilgiKart({ Icon, etiket, deger, vurgu }) {
  return (
    <div style={{
      background: 'var(--surface-subtle)',
      borderRadius: 10, padding: '10px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Icon size={11} style={{ color: 'var(--text-tertiary)' }} />
        <span style={{ font: '600 10px/14px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{etiket}</span>
      </div>
      <div style={{ font: vurgu ? '700 16px/20px var(--font-sans)' : '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
        {deger}
      </div>
    </div>
  )
}

// ─── Ön Sipariş Detay Paneli — fiyat girme + onay ──────────────────────────
function OnSiparisDetayPaneli({ onSiparis: os, sekme, kullanici, gorusme, onTamamlandi }) {
  const fileRef = useRef(null)
  const [imzaDosyasi, setImzaDosyasi] = useState(null)
  const [imzaPreview, setImzaPreview] = useState(null)
  const [redNedeni, setRedNedeni] = useState('')
  const [redModalAcik, setRedModalAcik] = useState(false)
  const [onayGerekcesi, setOnayGerekcesi] = useState('')
  const [calisiyor, setCalisiyor] = useState(false)
  const [hata, setHata] = useState(null)
  const [kalemler, setKalemler] = useState([])
  const [yukleniyorKalem, setYukleniyorKalem] = useState(true)
  const [genelIskonto, setGenelIskonto] = useState(0)
  const [paraBirimi, setParaBirimi] = useState('TL')

  const profilImzasi = kullanici?.imza
  const imzaVar = !!(imzaDosyasi || profilImzasi)
  const ustYetkili = kullanici?.siparisOnayUstYetkili === true || kullanici?.siparis_onay_ust_yetkili === true

  // Kalemleri yükle — DB'den al, birimFiyat = 0 varsayılan (kullanıcı girecek)
  useEffect(() => {
    setYukleniyorKalem(true)
    onSiparisKalemleriGetir(os.id)
      .then(k => {
        setKalemler((k || []).map(x => ({
          ...x,
          birimFiyat: Number(x.birimFiyat || 0),
          alisFiyat: Number(x.alisFiyat || 0),
          iskontoOrani: Number(x.iskontoOrani || 0),
          kdvOrani: Number(x.kdvOrani || 20),
        })))
      })
      .catch(() => setKalemler([]))
      .finally(() => setYukleniyorKalem(false))
  }, [os.id])

  const kalemGuncelle = (idx, alan, deger) => {
    const yeni = [...kalemler]
    const eski = yeni[idx]
    const guncel = { ...eski, [alan]: deger }
    // Kar% girildiğinde satışı hesapla: satış = alış × (1 + kar/100)
    if (alan === 'karYuzde') {
      const a = Number(eski.alisFiyat || 0)
      if (a > 0) guncel.birimFiyat = Number((a * (1 + Number(deger || 0) / 100)).toFixed(2))
    }
    yeni[idx] = guncel
    setKalemler(yeni)
  }

  const toplamlar = useMemo(() => {
    const araToplam = kalemler.reduce((s, k) => {
      const m = Number(k.miktar || 0), f = Number(k.birimFiyat || 0)
      return s + m * f
    }, 0)
    const kdvToplam = kalemler.reduce((s, k) => {
      const m = Number(k.miktar || 0), f = Number(k.birimFiyat || 0), kd = Number(k.kdvOrani || 0)
      return s + m * f * (kd / 100)
    }, 0)
    const toplamAlis = kalemler.reduce((s, k) => {
      const m = Number(k.miktar || 0), a = Number(k.alisFiyat || 0)
      return s + m * a
    }, 0)
    const toplamKar = araToplam - toplamAlis
    const karYuzde = toplamAlis > 0 ? (toplamKar / toplamAlis) * 100 : null
    return { araToplam, kdvToplam, toplamAlis, toplamKar, karYuzde, genelToplam: araToplam + kdvToplam }
  }, [kalemler])

  const imzaSec = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { setHata('Sadece görsel dosyalar.'); return }
    if (f.size > 5 * 1024 * 1024) { setHata('Dosya 5 MB\'ı aşıyor.'); return }
    setHata(null)
    setImzaDosyasi(f)
    setImzaPreview(URL.createObjectURL(f))
  }

  const onayla = async () => {
    setHata(null)
    if (kalemler.length === 0) { setHata('Kalem yok.'); return }
    const eksikFiyat = kalemler.some(k => !Number(k.birimFiyat))
    if (eksikFiyat) { setHata('Tüm kalemler için birim fiyat girmelisin.'); return }
    if (!imzaDosyasi && !profilImzasi) {
      setHata('İmza gerekli. Profilden veya buradan yükle.')
      return
    }
    setCalisiyor(true)
    try {
      const url = imzaDosyasi
        ? await imzaYukle(imzaDosyasi, `on-${os.id}`)
        : profilImzasi
      const siparisNo = await onSiparisiOnayla(os.id, {
        onaylayanId: kullanici.id,
        onaylayanAd: kullanici.ad,
        imzaUrl: url,
        notlar: onayGerekcesi.trim() || null,
        fiyatliKalemler: kalemler,
        paraBirimi,
        dovizKuru: 1,
        genelIskonto: 0,
      })
      alert(`Sipariş oluştu: ${siparisNo}`)
      onTamamlandi()
    } catch (e) {
      setHata(e?.message || 'Onay hatası.')
    } finally { setCalisiyor(false) }
  }

  const reddet = async () => {
    setHata(null)
    if (!redNedeni.trim()) { setHata('Red nedeni boş olamaz.'); return }
    setCalisiyor(true)
    try {
      await onSiparisiReddet(os.id, {
        onaylayanId: kullanici.id,
        redNedeni: redNedeni.trim(),
      })
      setRedModalAcik(false)
      onTamamlandi()
    } catch (e) {
      setHata(e?.message || 'Red hatası.')
    } finally { setCalisiyor(false) }
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {gorusme?.aktNo && (
          <span style={{
            fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
            color: '#3b82f6', padding: '3px 8px',
            background: 'rgba(59,130,246,0.10)', borderRadius: 6,
          }} title="Kaynak görüşme">
            {gorusme.aktNo}
          </span>
        )}
        <Badge tone="success" style={{ fontSize: 10 }}>ÖN SİPARİŞ</Badge>
        <CardTitle style={{ margin: 0 }}>{os.onSiparisNo}</CardTitle>
      </div>
      {gorusme && (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
          <Building2 size={11} style={{ display: 'inline', verticalAlign: -1, marginRight: 3 }} />
          {gorusme.firmaAdi || '—'}
          {gorusme.tarih && <> · Görüşme: {fmtTarih(gorusme.tarih)}</>}
          {gorusme.gorusen && <> · {gorusme.gorusen}</>}
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        {os.ilgiliKisi && <>👤 {os.ilgiliKisi} · </>}
        Aciliyet: <strong>{os.aciliyet || 'orta'}</strong>
        {os.musteriOnayBilgisi && <> · {os.musteriOnayBilgisi}</>}
      </div>
      {os.aciklama && (
        <div style={{ background: 'var(--surface-subtle)', padding: 10, borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
          {os.aciklama}
        </div>
      )}

      {/* Kalem tablosu — fiyat girme */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          Fiyatlandırma (kalemler DB'den, birim fiyatları burada gir)
        </div>
        {yukleniyorKalem ? (
          <div style={{ padding: 12, color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
        ) : kalemler.length === 0 ? (
          <div style={{ padding: 12, color: 'var(--text-tertiary)' }}>Kalem yok</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-tertiary)' }}>
                  <th style={{ textAlign: 'left', padding: 6, fontWeight: 500 }}>Ürün</th>
                  <th style={{ textAlign: 'right', padding: 6, fontWeight: 500, width: 60 }}>Miktar</th>
                  <th style={{ textAlign: 'right', padding: 6, fontWeight: 500, width: 100 }}>Alış ₺</th>
                  <th style={{ textAlign: 'right', padding: 6, fontWeight: 500, width: 100 }}>Satış ₺</th>
                  <th style={{ textAlign: 'right', padding: 6, fontWeight: 500, width: 70 }}>Kar %</th>
                  <th style={{ textAlign: 'right', padding: 6, fontWeight: 500, width: 60 }}>KDV %</th>
                  <th style={{ textAlign: 'right', padding: 6, fontWeight: 500, width: 100 }}>Ara Toplam</th>
                </tr>
              </thead>
              <tbody>
                {kalemler.map((k, i) => {
                  const m = Number(k.miktar || 0)
                  const f = Number(k.birimFiyat || 0)
                  const a = Number(k.alisFiyat || 0)
                  const at = m * f
                  const karYuzde = a > 0 ? ((f - a) / a) * 100 : null
                  const karRenk = karYuzde == null
                    ? 'var(--text-tertiary)'
                    : karYuzde < 0 ? '#dc2626' : karYuzde < 15 ? '#f59e0b' : '#10b981'
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: 6 }}>
                        <div style={{ fontWeight: 600 }}>{k.urunAd}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {k.birim || 'Adet'}{k.aciklama ? ' · ' + k.aciklama : ''}
                        </div>
                      </td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{m}</td>
                      <td style={{ padding: 6 }}>
                        <input
                          type="number" step="0.01" min="0" value={a || ''}
                          onChange={e => kalemGuncelle(i, 'alisFiyat', Number(e.target.value) || 0)}
                          style={{ width: '100%', textAlign: 'right', padding: '4px 6px', border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 12 }}
                          placeholder="Alış"
                        />
                      </td>
                      <td style={{ padding: 6 }}>
                        <input
                          type="number" step="0.01" min="0" value={f || ''}
                          onChange={e => kalemGuncelle(i, 'birimFiyat', Number(e.target.value) || 0)}
                          style={{ width: '100%', textAlign: 'right', padding: '4px 6px', border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 12 }}
                          placeholder="Satış"
                        />
                      </td>
                      <td style={{ padding: 6 }}>
                        <input
                          type="text" inputMode="decimal"
                          value={
                            k.karInputText != null
                              ? k.karInputText
                              : karYuzde == null ? '' : karYuzde.toFixed(1).replace('.', ',')
                          }
                          disabled={!(a > 0)}
                          onChange={e => {
                            const raw = e.target.value
                            // Serbest yazımı sakla (kullanıcı "1," yazarken kaybolmasın)
                            const parsed = parseFloat(raw.replace(',', '.'))
                            const yeni = [...kalemler]
                            yeni[i] = { ...yeni[i], karInputText: raw }
                            if (!isNaN(parsed) && a > 0) {
                              yeni[i].birimFiyat = Number((a * (1 + parsed / 100)).toFixed(2))
                            }
                            setKalemler(yeni)
                          }}
                          onBlur={() => {
                            // Odak çıkınca serbest yazımı temizle, hesaplı değere dön
                            const yeni = [...kalemler]
                            const { karInputText, ...rest } = yeni[i]
                            yeni[i] = rest
                            setKalemler(yeni)
                          }}
                          style={{
                            width: '100%', textAlign: 'right', padding: '4px 6px',
                            border: '1px solid var(--border-default)', borderRadius: 4,
                            fontSize: 12, fontWeight: 700, color: karRenk,
                            background: a > 0 ? 'var(--surface-card)' : 'var(--surface-sunken)',
                            cursor: a > 0 ? 'text' : 'not-allowed',
                          }}
                          placeholder={a > 0 ? 'örn. 1,5' : 'Alış gir'}
                          title={a > 0 ? 'Kar %: 1,5 veya 5,4 gibi ondalıklı yazabilirsin — Satış otomatik hesaplanır' : 'Önce Alış girin'}
                        />
                      </td>
                      <td style={{ padding: 6 }}>
                        <input
                          type="number" step="0.01" min="0" value={Number(k.kdvOrani || 0)}
                          onChange={e => kalemGuncelle(i, 'kdvOrani', Number(e.target.value) || 0)}
                          style={{ width: '100%', textAlign: 'right', padding: '4px 6px', border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 12 }}
                        />
                      </td>
                      <td style={{ padding: 6, textAlign: 'right', fontWeight: 600 }}>{fmtPara(at, paraBirimi)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Toplamlar */}
        {kalemler.length > 0 && (
          <div style={{ marginTop: 12, padding: 12, background: 'var(--surface-subtle)', borderRadius: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Toplam Alış</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtPara(toplamlar.toplamAlis, paraBirimi)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Ara Toplam (Satış)</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtPara(toplamlar.araToplam, paraBirimi)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Toplam Kar</div>
              <div style={{
                fontSize: 14, fontWeight: 700,
                color: toplamlar.karYuzde == null
                  ? 'var(--text-tertiary)'
                  : toplamlar.karYuzde < 0 ? '#dc2626' : toplamlar.karYuzde < 15 ? '#f59e0b' : '#10b981',
              }}>
                {fmtPara(toplamlar.toplamKar, paraBirimi)}
                {toplamlar.karYuzde != null && (
                  <span style={{ fontSize: 11, marginLeft: 6 }}>
                    ({toplamlar.karYuzde >= 0 ? '+' : ''}{toplamlar.karYuzde.toFixed(1)}%)
                  </span>
                )}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>KDV Toplamı</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtPara(toplamlar.kdvToplam, paraBirimi)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Genel Toplam</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent, #1E5AA8)' }}>{fmtPara(toplamlar.genelToplam, paraBirimi)}</div>
            </div>
          </div>
        )}
      </div>

      {sekme === 'bekleyen' && (
        <>
          {/* İmza */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>İmza</div>
            {profilImzasi && !imzaDosyasi ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img src={profilImzasi} alt="Profil imza" style={{ maxHeight: 40, border: '1px solid var(--border-default)', borderRadius: 4, background: '#fff' }} />
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Profil imzası kullanılacak</span>
                <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>Değiştir</Button>
              </div>
            ) : imzaPreview ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img src={imzaPreview} alt="Yeni imza" style={{ maxHeight: 40, border: '1px solid var(--border-default)', borderRadius: 4, background: '#fff' }} />
                <Button variant="ghost" size="sm" onClick={() => { setImzaDosyasi(null); setImzaPreview(null) }}>Kaldır</Button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} iconLeft={<Upload size={13} />}>İmza Yükle</Button>
            )}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={imzaSec} />
          </div>

          {/* Gerekçe */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Onay gerekçesi (opsiyonel)</div>
            <Textarea rows={2} value={onayGerekcesi} onChange={e => setOnayGerekcesi(e.target.value)} placeholder="Not..." />
          </div>

          {hata && (
            <div style={{ padding: 10, borderRadius: 6, background: 'rgba(220,38,38,0.1)', color: '#B91C1C', fontSize: 12, marginBottom: 12 }}>
              {hata}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setRedModalAcik(true)} disabled={calisiyor} style={{ color: '#DC2626' }}>Reddet</Button>
            <Button variant="primary" onClick={onayla} disabled={calisiyor}>
              {calisiyor ? 'İşleniyor…' : 'Onayla ve Sipariş Oluştur'}
            </Button>
          </div>
        </>
      )}

      {redModalAcik && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface-card)', borderRadius: 12, padding: 20, maxWidth: 480, width: '100%' }}>
            <h3 style={{ margin: '0 0 12px' }}>Ön Siparişi Reddet</h3>
            <Textarea rows={3} value={redNedeni} onChange={e => setRedNedeni(e.target.value)} placeholder="Red nedeni..." />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <Button variant="ghost" onClick={() => setRedModalAcik(false)}>Vazgeç</Button>
              <Button variant="primary" onClick={reddet} disabled={calisiyor} style={{ background: '#DC2626' }}>Reddet</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
