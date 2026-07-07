// Mobiltek araç takip — web tarafı. Sol tarafta araç listesi, sağda harita.
// Kredensiyeller yoksa proxy mock döndürür; UI aynı, "MOCK" rozeti gösterilir.

import { useEffect, useState } from 'react'
import { Truck, MapPin, Gauge, Video, RefreshCw, Zap, ZapOff } from 'lucide-react'
import { Card, Button, Badge, EmptyState } from '../components/ui'
import { araclariGetir, kameralariGetir, yakinlikTara, aktifYakinliklarGetir } from '../services/mobiltekService'
import MobiltekHarita from '../components/MobiltekHarita'
import CanliKameraModal from '../components/CanliKameraModal'

const kucukTarih = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) }
  catch { return iso }
}

export default function Mobiltek() {
  const [araclar, setAraclar] = useState([])
  const [mock, setMock] = useState(false)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [seciliArac, setSeciliArac] = useState(null)
  const [kameralar, setKameralar] = useState([])
  const [webviewUrl, setWebviewUrl] = useState(null)
  const [canliKameraAcik, setCanliKameraAcik] = useState(false)

  // .NET Date format "/Date(1783358792000+0300)/" → ISO string
  const parseNetDate = (s) => {
    if (!s) return null
    const m = String(s).match(/\/Date\((\d+)/)
    if (m) return new Date(parseInt(m[1], 10)).toISOString()
    return s
  }

  // Mobiltek response → düz mock formatına çevir
  const normalizeArac = (v) => {
    const loc = v['last-location'] || {}
    return {
      ...v,
      plateNo: v.label || v.plateNo || null,
      gpsSpeed: loc.speed ?? v.gpsSpeed ?? 0,
      gpsTime: parseNetDate(loc.logdatetime ?? v.gpsTime),
      lat: loc.latitude ?? v.lat ?? null,
      lng: loc.longitude ?? v.lng ?? null,
      direction: loc.dir ?? v.direction ?? 0,
      ignition: loc.ignition ?? v.ignition ?? false,
      address: loc.address ?? null,
    }
  }

  const [sonGuncelleme, setSonGuncelleme] = useState(null)
  const [yakinliklar, setYakinliklar] = useState([])
  const [gorunum, setGorunum] = useState('harita')  // 'harita' | 'liste'

  const yukle = async () => {
    setYukleniyor(true)
    const r = await araclariGetir()
    if (r) {
      const ham = r.veri?.vehicles || []
      setAraclar(ham.map(normalizeArac))
      setMock(r.mock)
      setSonGuncelleme(new Date())
    }
    setYukleniyor(false)
    // Yakınlık tara (sessiz) + aktif listeyi çek
    yakinlikTara().catch(() => {})
    aktifYakinliklarGetir().then(setYakinliklar).catch(() => {})
  }

  // İlk yükleme + 30 sn'de bir otomatik polling (canlı takip + yakınlık tarama)
  useEffect(() => {
    yukle()
    const t = setInterval(yukle, 60_000)
    return () => clearInterval(t)
  }, [])

  const aracSec = async (a) => {
    setSeciliArac(a)
    setKameralar([])
    setWebviewUrl(null)
    // Not: Mobiltek v1 /cameras/{id} endpoint'i gerçekte yok — 500 dönüyor.
    // Kamera adedi gösterimini kaldırdık. Kamerayı açmak için doğrudan v2 kullanılır.
  }

  return (
    <div style={{ padding: 20, maxWidth: 1440, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 className="t-h1" style={{ margin: 0 }}>Mobiltek Araç Takip</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            {araclar.length} araç · {mock ? 'MOCK modu — kredensiyel bekleniyor' : 'canlı takip (30 sn)'}
            {sonGuncelleme && (
              <span style={{ marginLeft: 8, opacity: 0.6 }}>
                · son güncelleme {sonGuncelleme.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {mock && <Badge tone="beklemede">MOCK</Badge>}
          <div style={{ display: 'inline-flex', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {[
              { id: 'harita', label: 'Harita', ikon: <MapPin size={13} strokeWidth={1.75} /> },
              { id: 'liste', label: 'Liste', ikon: <Truck size={13} strokeWidth={1.75} /> },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setGorunum(t.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px',
                  background: gorunum === t.id ? 'var(--brand-primary-soft)' : 'transparent',
                  color: gorunum === t.id ? 'var(--brand-primary)' : 'var(--text-secondary)',
                  border: 'none', cursor: 'pointer',
                  font: '500 12px/16px var(--font-sans)',
                }}
              >
                {t.ikon} {t.label}
              </button>
            ))}
          </div>
          <Button variant="secondary" iconLeft={<RefreshCw size={14} strokeWidth={1.5} />} onClick={yukle}>
            Yenile
          </Button>
        </div>
      </div>

      {/* Özet stat kartları */}
      {araclar.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
          {[
            { etiket: 'Araç Sayısı', deger: araclar.length, renk: '#3b82f6' },
            { etiket: 'Aktif (kontak açık)', deger: araclar.filter(a => a.ignition).length, renk: '#10b981' },
            { etiket: 'Ortalama Hız', deger: araclar.length ? Math.round(araclar.reduce((s, a) => s + Number(a.gpsSpeed || 0), 0) / araclar.length) + ' km/s' : '—', renk: '#f59e0b' },
            { etiket: 'Yakınlık İzleme', deger: yakinliklar.length, renk: yakinliklar.some(y => y.alarm_verildi) ? '#dc2626' : '#64748b' },
          ].map(k => (
            <Card key={k.etiket} style={{ padding: 12, textAlign: 'center' }}>
              <div style={{ font: '700 20px/24px var(--font-sans)', color: k.renk }}>{k.deger}</div>
              <div style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>{k.etiket}</div>
            </Card>
          ))}
        </div>
      )}

      {/* Yakınlık uyarıları */}
      {yakinliklar.length > 0 && (
        <Card style={{ marginBottom: 16, padding: 14, borderLeft: '4px solid ' + (yakinliklar.some(y => y.alarm_verildi) ? '#dc2626' : '#f59e0b') }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>🕵️</span>
            <strong style={{ font: '600 14px/18px var(--font-sans)' }}>
              {yakinliklar.filter(y => y.alarm_verildi).length > 0
                ? `${yakinliklar.filter(y => y.alarm_verildi).length} aktif alarm`
                : `${yakinliklar.length} yakınlık izleniyor`}
            </strong>
          </div>
          <div style={{ display: 'grid', gap: 6, fontSize: 12 }}>
            {yakinliklar.map(y => {
              const dk = Math.max(0, Math.round((new Date() - new Date(y.ilk_zaman)) / 60000))
              const alarm = y.alarm_verildi
              return (
                <div key={y.id} style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: alarm ? 'rgba(220,38,38,0.08)' : 'rgba(245,158,11,0.06)',
                  color: 'var(--text-primary)',
                }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{y.arac1_plaka}</span>
                    <span style={{ opacity: 0.6 }}>+</span>
                    <span style={{ fontWeight: 600 }}>{y.arac2_plaka}</span>
                    <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                      {alarm ? '🚨 ' : ''}{dk} dk · {y.son_mesafe_m}m
                    </span>
                  </div>
                  {y.son_adres && <div style={{ opacity: 0.7, marginTop: 2 }}>{y.son_adres}</div>}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* LİSTE GÖRÜNÜMÜ */}
      {gorunum === 'liste' && (
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', font: '400 12px/16px var(--font-sans)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)', background: 'var(--surface-sunken)' }}>
                  {['Etiket', 'Tarih-Saat', 'Adres', 'Hız', 'Yön', 'Durum'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-secondary)', font: '600 11px/14px var(--font-sans)', letterSpacing: 0.3, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {araclar.map(a => {
                  const kontak = a.ignition === '1' || a.ignition === true || a.engineStatus === 'on'
                  const hiz = Number(a.gpsSpeed || 0)
                  return (
                    <tr
                      key={a.id}
                      onClick={() => aracSec(a)}
                      style={{ borderBottom: '1px solid var(--border-default)', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 4, background: 'var(--brand-primary-soft)', color: 'var(--brand-primary)', font: '600 12px/16px var(--font-sans)' }}>
                          {a.plateNo || `#${a.id}`}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                        {a.gpsTime ? new Date(a.gpsTime).toLocaleString('tr-TR') : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', maxWidth: 380 }}>
                        {a.address || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{hiz} km/s</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-tertiary)' }}>{a.direction ?? 0}°</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 8px', borderRadius: 4,
                          background: kontak ? 'rgba(16,185,129,0.14)' : 'rgba(148,163,184,0.14)',
                          color: kontak ? 'var(--success)' : 'var(--text-tertiary)',
                          font: '600 11px/14px var(--font-sans)',
                        }}>
                          {kontak ? <><Zap size={11} strokeWidth={2} /> Açık</> : <><ZapOff size={11} strokeWidth={2} /> Kapalı</>}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* HARİTA GÖRÜNÜMÜ (split — sol araç listesi + sağ harita) */}
      {gorunum === 'harita' && (
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16, minHeight: 600 }}>
        {/* Sol — araç listesi */}
        <Card padding={0} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {yukleniyor ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
          ) : araclar.length === 0 ? (
            <div style={{ padding: 30 }}>
              <EmptyState icon={<Truck size={24} />} title="Araç yok" aciklama="Kredensiyeller geldiğinde otomatik listelenecek." />
            </div>
          ) : (
            <div style={{ overflowY: 'auto' }}>
              {araclar.map(a => {
                const aktif = seciliArac?.id === a.id
                const kontak = a.ignition === '1' || a.engineStatus === 'on'
                return (
                  <div
                    key={a.id}
                    onClick={() => aracSec(a)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 16px',
                      borderBottom: '1px solid var(--border-default)',
                      background: aktif ? 'var(--brand-primary-soft)' : 'transparent',
                      cursor: 'pointer',
                      transition: 'background 120ms',
                    }}
                    onMouseEnter={e => { if (!aktif) e.currentTarget.style.background = 'var(--surface-sunken)' }}
                    onMouseLeave={e => { if (!aktif) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: kontak ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.12)',
                      color: kontak ? 'var(--success)' : 'var(--text-tertiary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Truck size={20} strokeWidth={1.75} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ font: '600 14px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{a.plateNo || `#${a.id}`}</span>
                        {kontak
                          ? <Zap size={11} strokeWidth={2} style={{ color: 'var(--success)' }} />
                          : <ZapOff size={11} strokeWidth={2} style={{ color: 'var(--text-tertiary)' }} />}
                      </div>
                      <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)', marginTop: 2, display: 'flex', gap: 10 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Gauge size={11} strokeWidth={1.5} /> {Number(a.gpsSpeed || 0)} km/s
                        </span>
                        <span>{kucukTarih(a.gpsTime)}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setSeciliArac(a)
                        setCanliKameraAcik(true)
                      }}
                      title="Canlı Kamera İzle"
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 34, height: 34, borderRadius: 8,
                        background: 'var(--brand-primary)',
                        color: '#fff',
                        border: 'none', cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <Video size={16} strokeWidth={1.75} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Sağ — harita placeholder + araç detay */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card padding={0} style={{ position: 'relative', minHeight: 440, overflow: 'hidden', padding: 0 }}>
            <MobiltekHarita
              araclar={araclar}
              kameralar={kameralar}
              seciliArac={seciliArac}
              onAracSec={aracSec}
            />
          </Card>

          {seciliArac && (
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <p style={{ font: '600 15px/20px var(--font-sans)', margin: 0 }}>{seciliArac.plateNo}</p>
                  <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)', margin: 0, marginTop: 2 }}>
                    {kameralar.length} kamera
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  iconLeft={<Video size={14} strokeWidth={1.5} />}
                  onClick={() => setCanliKameraAcik(true)}
                >
                  Canlı İzle (v2)
                </Button>
              </div>

              {kameralar.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', font: '400 13px/18px var(--font-sans)' }}>
                  Bu araçta kamera bulunmadı.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                  {kameralar.map((k, i) => (
                    <div key={i} style={{
                      padding: 12,
                      background: 'var(--surface-sunken)',
                      borderRadius: 10,
                      border: '1px solid var(--border-default)',
                    }}>
                      <div style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                        Kamera {i + 1}
                      </div>
                      <div style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-secondary)', marginTop: 4 }}>
                        {k.lat}, {k.lng} · {kucukTarih(k.gpsTime)}
                      </div>
                      {k.urlCamera && (
                        <Button
                          variant="primary"
                          size="sm"
                          style={{ marginTop: 8, width: '100%' }}
                          iconLeft={<Video size={12} strokeWidth={1.5} />}
                          onClick={() => setWebviewUrl(k.urlCamera)}
                        >
                          Canlı İzle
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
      )}

      {/* Canlı yayın modalı */}
      {webviewUrl && (
        <div
          onClick={() => setWebviewUrl(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#000', width: 'min(1000px, 90vw)', height: 'min(600px, 80vh)',
              borderRadius: 12, overflow: 'hidden', position: 'relative',
            }}
          >
            <button
              onClick={() => setWebviewUrl(null)}
              style={{
                position: 'absolute', top: 10, right: 10, zIndex: 2,
                background: 'rgba(255,255,255,0.15)', color: '#fff',
                border: 'none', borderRadius: 6, padding: '6px 12px',
                cursor: 'pointer', font: '500 13px/18px var(--font-sans)',
              }}
            >
              × Kapat
            </button>
            <iframe
              src={webviewUrl}
              style={{ width: '100%', height: '100%', border: 'none' }}
              allow="autoplay; fullscreen"
              title="Canlı yayın"
            />
          </div>
        </div>
      )}

      <CanliKameraModal
        acik={canliKameraAcik}
        kapat={() => setCanliKameraAcik(false)}
        arac={seciliArac}
      />
    </div>
  )
}
