import { useNavigate } from 'react-router-dom'
import {
  Plus, Clock, Loader, CheckCircle2, AlertOctagon, Inbox, Briefcase, ArrowRight, MapPin, User,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useServisTalebi } from '../../context/ServisTalebiContext'
import { Button, Card, Badge, Alert, EmptyState } from '../../components/ui'

const ACIL_TONE = { acil: 'kayip', yuksek: 'beklemede', normal: 'lead', dusuk: 'neutral' }
const DURUM_TONE = {
  bekliyor: 'pasif', inceleniyor: 'beklemede', atandi: 'lead',
  devam_ediyor: 'beklemede', tamamlandi: 'aktif', iptal: 'kayip',
}

function StatKart({ sayi, baslik, Icon, renk, onClick }) {
  return (
    <Card
      onClick={onClick}
      style={{ cursor: 'pointer', transition: 'border-color 120ms, box-shadow 120ms' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-primary)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--surface-sunken)',
          borderRadius: 'var(--radius-sm)',
          color: renk,
        }}>
          <Icon size={18} strokeWidth={1.5} />
        </div>
        <span style={{ font: '600 28px/1 var(--font-sans)', color: renk, fontVariantNumeric: 'tabular-nums' }}>{sayi}</span>
      </div>
      <p style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-secondary)', margin: 0 }}>{baslik}</p>
    </Card>
  )
}

function tarihFormat(tarih) {
  const d = new Date(tarih)
  const fark = Date.now() - d.getTime()
  const dk = Math.floor(fark / 60000)
  const saat = Math.floor(dk / 60)
  const gun = Math.floor(saat / 24)
  if (dk < 60) return `${dk} dk önce`
  if (saat < 24) return `${saat} saat önce`
  if (gun < 7) return `${gun} gün önce`
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function MusteriDashboard() {
  const { kullanici } = useAuth()
  const { musteriTalepleri, ANA_TURLER, DURUM_LISTESI, ACILIYET_SEVIYELERI } = useServisTalebi()
  const navigate = useNavigate()

  const talepler = musteriTalepleri(kullanici?.id)
  const izinliTurler = kullanici?.izinliTurler
  const filtreliTurler = izinliTurler && izinliTurler.length > 0
    ? ANA_TURLER.filter(t => izinliTurler.includes(t.id))
    : ANA_TURLER
  const acik = talepler.filter(t => t.durum === 'bekliyor')
  const devam = talepler.filter(t => ['inceleniyor', 'atandi', 'devam_ediyor'].includes(t.durum))
  const tamamlandi = talepler.filter(t => t.durum === 'tamamlandi')
  const acil = talepler.filter(t => t.aciliyet === 'acil' && !['tamamlandi', 'iptal'].includes(t.durum))

  const sonTalepler = [...talepler]
    .sort((a, b) => new Date(b.olusturmaTarihi) - new Date(a.olusturmaTarihi))
    .slice(0, 5)

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>

      {/* Hoşgeldin */}
      <div style={{
        background: 'var(--brand-primary)',
        borderRadius: 'var(--radius-md)',
        padding: 24,
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.75)', font: '400 13px/18px var(--font-sans)', marginBottom: 4 }}>Hoş geldiniz,</p>
            <h1 style={{ color: '#fff', font: '600 24px/32px var(--font-sans)', margin: 0 }}>{kullanici?.ad}</h1>
            {kullanici?.firmaAdi && (
              <p style={{ color: 'rgba(255,255,255,0.75)', font: '400 13px/18px var(--font-sans)', marginTop: 4 }}>
                {kullanici.firmaAdi}
              </p>
            )}
          </div>
          <Button
            variant="secondary"
            iconLeft={<Plus size={14} strokeWidth={1.5} />}
            onClick={() => navigate('/musteri-portal/yeni-talep')}
          >
            Yeni talep oluştur
          </Button>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatKart sayi={acik.length}       baslik="Bekleyen Talepler" Icon={Clock}        renk="var(--text-secondary)" onClick={() => navigate('/musteri-portal/taleplerim?durum=bekliyor')} />
        <StatKart sayi={devam.length}      baslik="Devam Eden"         Icon={Loader}       renk="var(--warning)"        onClick={() => navigate('/musteri-portal/taleplerim?durum=devam')} />
        <StatKart sayi={tamamlandi.length} baslik="Tamamlanan"         Icon={CheckCircle2} renk="var(--success)"        onClick={() => navigate('/musteri-portal/taleplerim?durum=tamamlandi')} />
        <StatKart sayi={acil.length}       baslik="Acil Talepler"      Icon={AlertOctagon} renk="var(--danger)"         onClick={() => navigate('/musteri-portal/taleplerim?aciliyet=acil')} />
      </div>

      {/* Acil uyarı */}
      {acil.length > 0 && (
        <Alert
          variant="danger"
          title={<><span className="tabular-nums">{acil.length}</span> acil talebiniz işlemde</>}
          style={{ marginBottom: 20 }}
        >
          Ekibimiz en kısa sürede dönüş yapacaktır.
        </Alert>
      )}

      {/* Son talepler */}
      <Card padding={0} style={{ marginBottom: 16 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border-default)',
        }}>
          <h2 className="t-h2" style={{ margin: 0 }}>Son Talepler</h2>
          <button
            onClick={() => navigate('/musteri-portal/taleplerim')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--brand-primary)', font: '500 13px/18px var(--font-sans)',
            }}
          >
            Tümünü gör <ArrowRight size={14} strokeWidth={1.5} />
          </button>
        </div>

        {sonTalepler.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<Inbox size={32} strokeWidth={1.5} />}
              title="Henüz talep oluşturmadınız"
              description="İlk talebinizi oluşturmak için yukarıdaki butona tıklayın."
            />
          </div>
        ) : (
          <div>
            {sonTalepler.map(talep => {
              const anaTur = ANA_TURLER.find(t => t.id === talep.anaTur)
              const durum = DURUM_LISTESI.find(d => d.id === talep.durum)
              const aciliyet = ACILIYET_SEVIYELERI.find(a => a.id === talep.aciliyet)
              return (
                <div
                  key={talep.id}
                  onClick={() => navigate(`/musteri-portal/talep/${talep.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 20px',
                    borderBottom: '1px solid var(--border-default)',
                    cursor: 'pointer',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{
                    width: 36, height: 36,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--brand-primary-soft)',
                    color: 'var(--brand-primary)',
                    borderRadius: 'var(--radius-sm)',
                    flexShrink: 0,
                    font: '600 13px/1 var(--font-sans)',
                  }}>
                    {anaTur?.isim?.charAt(0) || '·'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                      <span style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                        {talep.talepNo}
                      </span>
                      {aciliyet && <Badge tone={ACIL_TONE[aciliyet.id]}>{aciliyet.isim}</Badge>}
                    </div>
                    <p style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {talep.konu}
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    {durum && <Badge tone={DURUM_TONE[durum.id]}>{durum.isim}</Badge>}
                    <span className="t-caption" style={{ fontVariantNumeric: 'tabular-nums' }}>{tarihFormat(talep.olusturmaTarihi)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Teklif İste kartı */}
      {filtreliTurler.some(t => t.id === 'teklif') && (
        <Card
          onClick={() => navigate('/musteri-portal/teklif-iste')}
          style={{
            cursor: 'pointer',
            borderColor: 'var(--success-border)',
            background: 'var(--success-soft)',
            marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 14,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--success)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--success-border)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)' }}
        >
          <div style={{
            width: 44, height: 44,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--success)',
            color: '#fff',
            borderRadius: 'var(--radius-md)',
            flexShrink: 0,
          }}>
            <Briefcase size={22} strokeWidth={1.5} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>Ürün Teklifi İste</p>
            <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)', marginTop: 2 }}>
              Ürün kataloğumuzu inceleyin, ilgilendiğiniz ürünler için fiyat teklifi alın.
            </p>
          </div>
          <ArrowRight size={20} strokeWidth={1.5} style={{ color: 'var(--success)', flexShrink: 0 }} />
        </Card>
      )}

      {/* Hızlı kategoriler */}
      <div>
        <h3 className="t-label" style={{ marginBottom: 10 }}>HIZLI TALEP AÇ</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {filtreliTurler.map(tur => (
            <button
              key={tur.id}
              onClick={() => navigate(`/musteri-portal/yeni-talep?tur=${tur.id}`)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: 14,
                background: 'var(--surface-card)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                transition: 'all 120ms',
                font: '500 12px/16px var(--font-sans)',
                color: 'var(--text-secondary)',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-primary)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <span style={{
                width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                background: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                font: '600 14px/1 var(--font-sans)',
              }}>
                {tur.isim.charAt(0)}
              </span>
              <span>{tur.isim}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
