// Sipariş Onayları — yetkili kullanıcılar burada bekleyen siparişleri görür,
// imza ekleyerek onaylar veya reddeder.
//
// Erisim: sadece kullanici.siparis_onay_yetkilisi === true olanlar.

import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, Clock, FileText, Upload, X, Image as ImageIcon,
  Building2, User as UserIcon, Calendar, Receipt,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  Card, CardTitle, Button, Badge, EmptyState, Textarea,
} from '../components/ui'
import {
  bekleyenSiparisleriGetir, onaylananSiparisleriGetir, reddedilenSiparisleriGetir,
  imzaYukle, siparisOnayla, siparisReddet,
} from '../services/siparisOnayService'

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

const SEKMELER = [
  { id: 'bekleyen', label: 'Bekleyen', renk: '#F59E0B' },
  { id: 'onayli',   label: 'Onaylı',   renk: '#10B981' },
  { id: 'red',      label: 'Reddedilen', renk: '#DC2626' },
]

export default function SiparisOnaylari() {
  const { kullanici } = useAuth()
  const navigate = useNavigate()
  const [sekme, setSekme] = useState('bekleyen')
  const [liste, setListe] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [secili, setSecili] = useState(null)

  const yetkili = kullanici?.siparisOnayYetkilisi === true || kullanici?.siparis_onay_yetkilisi === true

  const yukle = async () => {
    setYukleniyor(true)
    try {
      const d = sekme === 'bekleyen' ? await bekleyenSiparisleriGetir()
              : sekme === 'onayli' ? await onaylananSiparisleriGetir()
              : await reddedilenSiparisleriGetir()
      setListe(d)
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 className="t-h1">Sipariş Onayları</h1>
        <Button variant="secondary" onClick={() => navigate('/teklifler')}>← Tekliflere dön</Button>
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
              title={sekme === 'bekleyen' ? 'Bekleyen sipariş yok' : sekme === 'onayli' ? 'Onaylı sipariş yok' : 'Reddedilmiş sipariş yok'}
              icon={<Clock size={24} />}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {liste.map(t => {
                const s = t.siparisOnayi || {}
                const seciliMi = secili?.id === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setSecili(t)}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{t.teklifNo}</strong>
                      <Badge tone="brand">{t.konu || '—'}</Badge>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      <Building2 size={11} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />
                      {t.firmaAdi || '—'}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtTarih(t.tarih)}</span>
                      <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{fmtPara(t.genelToplam, t.paraBirimi)}</strong>
                    </div>
                    {sekme === 'onayli' && s.onaylayan_ad && (
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                        ✓ {s.onaylayan_ad} · {fmtTarih(s.onay_tarihi)}
                      </div>
                    )}
                    {sekme === 'red' && s.red_nedeni && (
                      <div style={{ fontSize: 11, color: '#B91C1C', marginTop: 4 }}>
                        ✕ {s.red_nedeni}
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
            <DetayPaneli
              teklif={secili}
              sekme={sekme}
              kullanici={kullanici}
              onTamamlandi={() => { setSecili(null); yukle() }}
            />
          ) : (
            <Card>
              <EmptyState
                title="Bir teklif seç"
                aciklama="Soldaki listeden bir sipariş seçerek detaylarını gör ve onay/red işlemi yap."
                icon={<FileText size={24} />}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Detay paneli ──────────────────────────────────────────────────────────

function DetayPaneli({ teklif: t, sekme, kullanici, onTamamlandi }) {
  const fileRef = useRef(null)
  const [imzaDosyasi, setImzaDosyasi] = useState(null)
  const [imzaPreview, setImzaPreview] = useState(null)
  const [redNedeni, setRedNedeni] = useState('')
  const [redModalAcik, setRedModalAcik] = useState(false)
  const [calisiyor, setCalisiyor] = useState(false)
  const [hata, setHata] = useState(null)

  const s = t.siparisOnayi || {}
  const profilImzasi = kullanici?.imza  // profilde yuklenmis imza
  const imzaVar = !!(imzaDosyasi || profilImzasi)

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
    setCalisiyor(true)
    try {
      // Yeni dosya secildiyse storage'a yukle, yoksa profil imzasini kullan
      const url = imzaDosyasi
        ? await imzaYukle(imzaDosyasi, t.id)
        : profilImzasi
      await siparisOnayla(t.id, {
        onaylayanId: kullanici.id,
        onaylayanAd: kullanici.ad,
        imzaUrl: url,
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

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
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
        <BilgiKart Icon={Receipt} etiket="Tutar" deger={fmtPara(t.genelToplam, t.paraBirimi)} vurgu />
        <BilgiKart Icon={FileText} etiket="Ödeme" deger={t.odeme || '—'} />
      </div>

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
          {s.imza_url && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>İMZA</div>
              <img src={s.imza_url} alt="imza" style={{ maxHeight: 80, maxWidth: 240, background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 4 }} />
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

          {hata && (
            <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', color: '#991B1B', fontSize: 13, marginBottom: 12 }}>
              {hata}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="tertiary" onClick={() => setRedModalAcik(true)} disabled={calisiyor}>
              <XCircle size={14} /> Reddet
            </Button>
            <Button variant="primary" onClick={onayla} disabled={!imzaVar || calisiyor}>
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
