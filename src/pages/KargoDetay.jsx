import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Trash2, ArrowUpRight, ArrowDownLeft, Phone, MapPin, AlertTriangle,
  Check, Pencil, Package, Send,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useBildirim } from '../context/BildirimContext'
import { useKargo } from '../context/KargoContext'
import {
  Button, Input, Card, CardTitle, Badge, CodeBadge, Avatar, Alert, EmptyState,
} from '../components/ui'

const KARGO_DURUM_TONE = {
  hazirlaniyor:    'beklemede',
  kargoya_verildi: 'lead',
  yolda:           'lead',
  dagitimda:       'beklemede',
  teslim_edildi:   'aktif',
  iade:            'kayip',
  kayip:           'kayip',
}

const safeArr = (v) => {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] } }
  return []
}
const safeObj = (v) => {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v
  if (typeof v === 'string') { try { const p = JSON.parse(v); return (p && typeof p === 'object') ? p : {} } catch { return {} } }
  return {}
}

export default function KargoDetay() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { kullanici, kullanicilar } = useAuth()
  const { bildirimEkle } = useBildirim()
  const {
    kargolar, kargoDurumGuncelle, kargoGuncelle,
    kargoNotEkle, kargoSil,
    KARGO_FIRMALARI, DURUM_LISTESI,
  } = useKargo()

  const [yeniDurum, setYeniDurum] = useState('')
  const [durumNot, setDurumNot] = useState('')
  const [yeniNot, setYeniNot] = useState('')
  const [takipNoDuzenle, setTakipNoDuzenle] = useState(false)
  const [takipNoGecici, setTakipNoGecici] = useState('')
  const [silOnay, setSilOnay] = useState(false)

  const kargo = (kargolar || []).find(k => String(k?.id) === String(id))

  if (!kargo) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyState
          icon={<Package size={32} strokeWidth={1.5} />}
          title="Kargo bulunamadı"
          action={<Button variant="secondary" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => navigate('/kargolar')}>Kargolara dön</Button>}
        />
      </div>
    )
  }

  const gonderen = safeObj(kargo.gonderen)
  const alici    = safeObj(kargo.alici)
  const notlar   = safeArr(kargo.notlar)
  const durumGecmisi = safeArr(kargo.durumGecmisi)
  const ilgiliKullaniciIds = safeArr(kargo.ilgiliKullaniciIds)

  const mevcutDurum = DURUM_LISTESI.find(d => d.id === kargo.durum)
  const firma = KARGO_FIRMALARI.find(f => f.id === kargo.kargoFirmasi)
  const gecikti = kargo.tahminiTeslim && new Date(kargo.tahminiTeslim) < new Date() && !['teslim_edildi', 'iade'].includes(kargo.durum)
  const tamamlandi = ['teslim_edildi', 'iade'].includes(kargo.durum)
  const TipIcon = kargo.tip === 'giden' ? ArrowUpRight : ArrowDownLeft
  const mevcut_sira = mevcutDurum?.sira || 0

  const durumGuncelle = () => {
    if (!yeniDurum) return
    kargoDurumGuncelle(kargo.id, yeniDurum, kullanici.ad, durumNot)
    const durumBilgi = DURUM_LISTESI.find(d => d.id === yeniDurum)
    ilgiliKullaniciIds.filter(uid => String(uid) !== String(kullanici.id)).forEach(uid => {
      bildirimEkle(
        uid,
        `Kargo Güncellendi — ${durumBilgi?.isim}`,
        `${kargo.kargoNo}: ${gonderen.firma || gonderen.ad || '?'} → ${alici.firma || alici.ad || '?'}${durumNot ? '. Not: ' + durumNot : ''}`,
        yeniDurum === 'teslim_edildi' ? 'basari' : yeniDurum === 'iade' ? 'uyari' : 'bilgi',
        `/kargolar/${kargo.id}`
      )
    })
    setYeniDurum(''); setDurumNot('')
  }

  const notEkle = () => {
    if (!yeniNot.trim()) return
    kargoNotEkle(kargo.id, yeniNot, kullanici)
    setYeniNot('')
  }

  const takipNoKaydet = () => {
    kargoGuncelle(kargo.id, { takipNo: takipNoGecici })
    setTakipNoDuzenle(false)
  }

  const metaBilgiler = [
    { l: 'AĞIRLIK',          v: kargo.agirlik ? `${kargo.agirlik} kg` : '—' },
    { l: 'DESİ',             v: kargo.desi || '—' },
    { l: 'ÜCRET',            v: kargo.ucret ? `₺${kargo.ucret}` : '—' },
    { l: 'ÖDEME',            v: { gonderici: 'Gönderici', alici: 'Alıcı', kapida: 'Kapıda' }[kargo.odemeYontemi] || '—' },
    { l: 'TAHMİNİ TESLİM',   v: kargo.tahminiTeslim || '—' },
    { l: 'TESLİM TARİHİ',    v: kargo.teslimTarihi ? new Date(kargo.teslimTarihi).toLocaleDateString('tr-TR') : '—' },
    { l: 'OLUŞTURAN',        v: kargo.olusturanAd || '—' },
    { l: 'KAYIT TARİHİ',     v: kargo.olusturmaTarihi ? new Date(kargo.olusturmaTarihi).toLocaleDateString('tr-TR') : '—' },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1040, margin: '0 auto' }}>

      {/* Geri + Sil */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button
          onClick={() => navigate('/kargolar')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            color: 'var(--text-tertiary)', font: '500 13px/18px var(--font-sans)',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-primary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
        >
          <ArrowLeft size={14} strokeWidth={1.5} /> Kargolara dön
        </button>
        {!tamamlandi && (
          <Button variant="tertiary" size="sm" iconLeft={<Trash2 size={12} strokeWidth={1.5} />} onClick={() => setSilOnay(true)}>
            Sil
          </Button>
        )}
      </div>

      {silOnay && (
        <Alert
          variant="danger"
          title="Bu kargoyu kalıcı olarak silmek istediğinize emin misiniz?"
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="danger" size="sm" onClick={() => { kargoSil(kargo.id); navigate('/kargolar') }}>Evet, sil</Button>
              <Button variant="secondary" size="sm" onClick={() => setSilOnay(false)}>İptal</Button>
            </div>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Ana kart */}
      <Card
        style={{
          marginBottom: 16,
          borderColor: gecikti ? 'var(--danger-border)' : 'var(--border-default)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{
            width: 44, height: 44,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-md)',
            background: kargo.tip === 'giden' ? 'var(--brand-primary-soft)' : 'var(--success-soft)',
            color: kargo.tip === 'giden' ? 'var(--brand-primary)' : 'var(--success)',
            flexShrink: 0,
          }}>
            <TipIcon size={20} strokeWidth={1.5} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              <CodeBadge>{kargo.kargoNo}</CodeBadge>
              <Badge tone={kargo.tip === 'giden' ? 'brand' : 'aktif'}>
                {kargo.tip === 'giden' ? 'Giden' : 'Gelen'}
              </Badge>
              {firma && <Badge tone="brand">{firma.isim}</Badge>}
              {mevcutDurum && <Badge tone={KARGO_DURUM_TONE[mevcutDurum.id] ?? 'neutral'}>{mevcutDurum.isim}</Badge>}
              {gecikti && <Badge tone="kayip" icon={<AlertTriangle size={11} strokeWidth={1.5} />}>Gecikti</Badge>}
            </div>
            <h1 className="t-h1">
              {gonderen.firma || gonderen.ad || '?'}
              <span style={{ color: 'var(--text-tertiary)', margin: '0 8px' }}>→</span>
              {alici.firma || alici.ad || '?'}
            </h1>
            <p className="t-caption" style={{ marginTop: 4 }}>{kargo.icerik}</p>
          </div>
        </div>

        {/* Takip No */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', marginBottom: 16,
          background: 'var(--surface-sunken)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
        }}>
          <span className="t-label" style={{ margin: 0 }}>TAKİP NO:</span>
          {takipNoDuzenle ? (
            <>
              <div style={{ flex: 1 }}>
                <Input
                  value={takipNoGecici}
                  onChange={e => setTakipNoGecici(e.target.value)}
                  placeholder="Takip numarası girin"
                  autoFocus
                  style={{ height: 32 }}
                />
              </div>
              <Button variant="primary" size="sm" onClick={takipNoKaydet}>Kaydet</Button>
              <Button variant="secondary" size="sm" onClick={() => setTakipNoDuzenle(false)}>İptal</Button>
            </>
          ) : (
            <>
              <span style={{ flex: 1, font: '500 13px/18px var(--font-mono)', color: kargo.takipNo ? 'var(--brand-primary)' : 'var(--text-tertiary)' }}>
                {kargo.takipNo || 'Henüz eklenmedi'}
              </span>
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<Pencil size={12} strokeWidth={1.5} />}
                onClick={() => { setTakipNoGecici(kargo.takipNo || ''); setTakipNoDuzenle(true) }}
              >
                {kargo.takipNo ? 'Düzenle' : 'Ekle'}
              </Button>
            </>
          )}
        </div>

        {/* Gönderen / Alıcı */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[
            { baslik: 'Gönderen', icon: ArrowUpRight, veri: gonderen },
            { baslik: 'Alıcı',    icon: ArrowDownLeft, veri: alici },
          ].map(({ baslik, icon: IconC, veri }) => (
            <div
              key={baslik}
              style={{
                padding: 14,
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <p style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                <IconC size={12} strokeWidth={1.5} /> {baslik}
              </p>
              {veri.firma && <p style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>{veri.firma}</p>}
              {veri.ad && <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', margin: 0 }}>{veri.ad}</p>}
              {veri.telefon && (
                <p style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                  <Phone size={11} strokeWidth={1.5} /> {veri.telefon}
                </p>
              )}
              {veri.adres && (
                <p style={{ display: 'flex', alignItems: 'flex-start', gap: 4, font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                  <MapPin size={11} strokeWidth={1.5} style={{ marginTop: 2, flexShrink: 0 }} /> {veri.adres}
                </p>
              )}
              {!veri.ad && !veri.firma && (
                <p className="t-caption">Bilgi girilmedi</p>
              )}
            </div>
          ))}
        </div>

        {/* Meta */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
          {metaBilgiler.map(i => (
            <div key={i.l}>
              <div className="t-label" style={{ marginBottom: 4 }}>{i.l}</div>
              <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {i.v}
              </div>
            </div>
          ))}
        </div>

        {/* İlgili kişiler */}
        {ilgiliKullaniciIds.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
            <p className="t-label" style={{ marginBottom: 8 }}>BİLDİRİM ALAN PERSONEL</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ilgiliKullaniciIds.map(uid => {
                const k = (kullanicilar || []).find(u => String(u?.id) === String(uid))
                return k ? (
                  <div
                    key={uid}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px 4px 4px',
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--brand-primary-soft)',
                      border: '1px solid var(--border-default)',
                      font: '500 12px/16px var(--font-sans)',
                      color: 'var(--brand-primary)',
                    }}
                  >
                    <Avatar name={k.ad} size="xs" />
                    {k.ad}
                  </div>
                ) : null
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Durum ilerleyişi */}
      {!['iade'].includes(kargo.durum) && (
        <Card style={{ marginBottom: 16 }}>
          <p className="t-label" style={{ marginBottom: 16 }}>KARGO İLERLEYİŞİ</p>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 14, left: 14, right: 14, height: 2, background: 'var(--border-default)', zIndex: 0 }} />
            {DURUM_LISTESI.filter(d => d.sira > 0).sort((a, b) => a.sira - b.sira).map(d => {
              const gecildi = d.sira <= mevcut_sira
              return (
                <div key={d.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, position: 'relative', zIndex: 1, flex: 1 }}>
                  <div style={{
                    width: 30, height: 30,
                    borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: gecildi ? 'var(--brand-primary)' : 'var(--surface-card)',
                    border: `2px solid ${gecildi ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                  }}>
                    {gecildi ? <Check size={14} strokeWidth={2.5} style={{ color: '#fff' }} /> : null}
                  </div>
                  <p style={{
                    font: gecildi ? '600 11px/14px var(--font-sans)' : '500 11px/14px var(--font-sans)',
                    color: gecildi ? 'var(--brand-primary)' : 'var(--text-tertiary)',
                    textAlign: 'center',
                    maxWidth: 80,
                    margin: 0,
                  }}>
                    {d.isim}
                  </p>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Durum güncelle */}
      {!tamamlandi && (
        <Card style={{ marginBottom: 16 }}>
          <p className="t-label" style={{ marginBottom: 12 }}>DURUM GÜNCELLE</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: yeniDurum ? 12 : 0 }}>
            {DURUM_LISTESI.filter(d => d.id !== kargo.durum).map(d => {
              const active = yeniDurum === d.id
              return (
                <button
                  key={d.id}
                  onClick={() => setYeniDurum(d.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: active ? 'var(--brand-primary)' : 'var(--surface-card)',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                    font: '500 13px/18px var(--font-sans)',
                    cursor: 'pointer',
                  }}
                >
                  {d.isim}
                </button>
              )
            })}
          </div>
          {yeniDurum && (
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Input
                  value={durumNot}
                  onChange={e => setDurumNot(e.target.value)}
                  placeholder="Durum notu (opsiyonel)…"
                />
              </div>
              <Button variant="primary" onClick={durumGuncelle}>Güncelle</Button>
            </div>
          )}
        </Card>
      )}

      {/* Durum geçmişi */}
      <Card style={{ marginBottom: 16 }}>
        <p className="t-label" style={{ marginBottom: 16 }}>DURUM GEÇMİŞİ</p>
        {durumGecmisi.length === 0 ? (
          <p className="t-caption">Henüz durum güncellemesi yok.</p>
        ) : (
          <div style={{ position: 'relative', paddingLeft: 24 }}>
            <div style={{ position: 'absolute', left: 8, top: 0, bottom: 0, width: 1, background: 'var(--border-default)' }} />
            {[...durumGecmisi].reverse().map((gecmis, i) => {
              const durumBilgi = DURUM_LISTESI.find(d => d.id === gecmis.durum)
              const durumT = durumBilgi ? KARGO_DURUM_TONE[durumBilgi.id] : 'neutral'
              return (
                <div key={i} style={{ position: 'relative', paddingBottom: i < durumGecmisi.length - 1 ? 16 : 0 }}>
                  <span style={{
                    position: 'absolute', left: -20, top: 2,
                    width: 17, height: 17,
                    borderRadius: '50%',
                    background: 'var(--surface-card)',
                    border: '2px solid var(--brand-primary)',
                  }} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      {durumBilgi && <Badge tone={durumT}>{durumBilgi.isim}</Badge>}
                      <span className="t-caption">{gecmis.kullaniciAd}</span>
                      <span className="t-caption" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {gecmis.tarih ? new Date(gecmis.tarih).toLocaleString('tr-TR') : ''}
                      </span>
                    </div>
                    {gecmis.aciklama && (
                      <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', margin: 0 }}>
                        {gecmis.aciklama}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Notlar */}
      <Card>
        <CardTitle>Notlar {notlar.length > 0 && <span style={{ color: 'var(--brand-primary)', fontVariantNumeric: 'tabular-nums' }}>({notlar.length})</span>}</CardTitle>
        <div style={{ marginTop: 12 }}>
          {notlar.length === 0 && <p className="t-caption" style={{ marginBottom: 12 }}>Henüz not eklenmedi.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {notlar.map((not, i) => (
              <div
                key={not.id || i}
                style={{
                  padding: 12,
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Avatar name={not.kullaniciAd} size="xs" />
                  <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{not.kullaniciAd}</span>
                  <span className="t-caption" style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                    {not.tarih ? new Date(not.tarih).toLocaleString('tr-TR') : ''}
                  </span>
                </div>
                <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap' }}>
                  {not.metin}
                </p>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Input
                value={yeniNot}
                onChange={e => setYeniNot(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && notEkle()}
                placeholder="Not ekle…"
              />
            </div>
            <Button variant="primary" iconLeft={<Send size={14} strokeWidth={1.5} />} onClick={notEkle} disabled={!yeniNot.trim()}>
              Ekle
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
