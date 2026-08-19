// Sözleşme onay takibi — kim onayladı, kim onaylamadı (mig 264/266).
// Onay kaydı İMZA niteliğindedir: değiştirilemez, silinemez (DB trigger).
// Burada kanıt alanları da gösterilir — tarih, kanal, cihaz, IP ve onay
// anındaki metnin özeti.

import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck, ShieldAlert, Search, Smartphone, Monitor, ChevronDown } from 'lucide-react'
import { Card, Badge, SearchInput } from '../components/ui'
import { onayDurumlariniGetir, aktifSozlesmeGetir } from '../services/kullaniciSozlesmeService'
import { trContains } from '../lib/trSearch'

const tarihMetni = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) }
  catch { return '—' }
}

export default function SozlesmeOnaylari() {
  const [liste, setListe] = useState([])
  const [sozlesme, setSozlesme] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [arama, setArama] = useState('')
  const [suzgec, setSuzgec] = useState('hepsi')   // hepsi | onayli | bekleyen
  const [acikDetay, setAcikDetay] = useState(null)  // kanıt detayı açık olan kullanıcı id

  useEffect(() => {
    Promise.all([onayDurumlariniGetir(), aktifSozlesmeGetir()])
      .then(([l, s]) => { setListe(l); setSozlesme(s) })
      .finally(() => setYukleniyor(false))
  }, [])

  const suzulmus = useMemo(() => {
    return liste.filter(k => {
      if (arama && !trContains(k.ad || '', arama)) return false
      const onayli = !!k.onay
      if (suzgec === 'onayli') return onayli
      if (suzgec === 'bekleyen') return !onayli
      return true
    })
  }, [liste, arama, suzgec])

  const onayliSayi = liste.filter(k => k.onay).length
  const bekleyenSayi = liste.length - onayliSayi

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <p className="t-caption" style={{ marginTop: 4 }}>
          {sozlesme
            ? <>Yürürlükteki sürüm <b>{sozlesme.versiyon}</b> · {new Date(sozlesme.yururluk_tarihi).toLocaleDateString('tr-TR')}</>
            : 'Yayımlanmış sözleşme yok'}
        </p>
      </div>

      {/* Özet */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
        {[
          { etiket: 'Personel', deger: liste.length, renk: '#3b82f6', id: 'hepsi' },
          { etiket: 'Onayladı', deger: onayliSayi, renk: '#10b981', id: 'onayli' },
          { etiket: 'Bekliyor', deger: bekleyenSayi, renk: bekleyenSayi ? '#f59e0b' : '#64748b', id: 'bekleyen' },
        ].map(k => (
          <Card
            key={k.id}
            onClick={() => setSuzgec(k.id)}
            style={{
              padding: 12, textAlign: 'center', cursor: 'pointer',
              border: suzgec === k.id ? `1.5px solid ${k.renk}` : undefined,
            }}
          >
            <div style={{ font: '700 21px/26px var(--font-sans)', color: k.renk }}>{k.deger}</div>
            <div style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>
              {k.etiket}
            </div>
          </Card>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <SearchInput
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Personel ara…"
          icon={<Search size={15} strokeWidth={1.5} />}
        />
      </div>

      <Card padding={0} style={{ overflow: 'hidden' }}>
        {yukleniyor ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
        ) : suzulmus.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Kayıt yok.</div>
        ) : (
          suzulmus.map((k, i) => {
            const o = k.onay
            const eskiSurum = o && sozlesme && o.versiyon !== sozlesme.versiyon
            const acik = acikDetay === k.id
            return (
              <div key={k.id} style={{
                borderBottom: i < suzulmus.length - 1 ? '1px solid var(--border-default)' : 'none',
              }}>
              <div
                onClick={() => o && setAcikDetay(acik ? null : k.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  cursor: o ? 'pointer' : 'default',
                  background: acik ? 'var(--surface-sunken)' : 'transparent',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: o ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                  color: o ? '#10b981' : '#f59e0b',
                }}>
                  {o ? <ShieldCheck size={17} strokeWidth={1.75} /> : <ShieldAlert size={17} strokeWidth={1.75} />}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                    {k.ad}
                  </div>
                  <div style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-secondary)', marginTop: 1 }}>
                    {o ? (
                      <>
                        {tarihMetni(o.onay_tarihi)}
                        {o.kaynak && (
                          <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            {o.kaynak === 'mobil'
                              ? <Smartphone size={11} strokeWidth={1.75} />
                              : <Monitor size={11} strokeWidth={1.75} />}
                            {o.kaynak}
                          </span>
                        )}
                        <span style={{ marginLeft: 8, opacity: 0.7 }}>· sürüm {o.versiyon}</span>
                      </>
                    ) : 'Henüz onaylamadı'}
                  </div>
                </div>

                {eskiSurum && <Badge tone="beklemede">eski sürüm</Badge>}
                {o
                  ? <Badge tone="basarili">Onaylı</Badge>
                  : <Badge tone="beklemede">Bekliyor</Badge>}
                {o && (
                  <ChevronDown
                    size={15}
                    strokeWidth={1.75}
                    style={{
                      color: 'var(--text-tertiary)', flexShrink: 0,
                      transform: acik ? 'rotate(180deg)' : 'none', transition: 'transform 150ms',
                    }}
                  />
                )}
              </div>

              {/* Kanıt detayı — ihtilafta "kim, neyi, nereden onayladı" */}
              {acik && o && (
                <div style={{
                  padding: '4px 16px 14px 60px',
                  background: 'var(--surface-sunken)',
                  font: '400 12px/18px var(--font-sans)',
                }}>
                  {[
                    ['Onay zamanı', new Date(o.onay_tarihi).toLocaleString('tr-TR', { dateStyle: 'full', timeStyle: 'medium' })],
                    ['Sürüm', o.versiyon],
                    ['Kanal', o.kaynak === 'mobil' ? 'Mobil uygulama' : 'Web tarayıcı'],
                    ['Cihaz', o.cihaz || '—'],
                    ['IP adresi', o.ip || '—'],
                  ].map(([etiket, deger]) => (
                    <div key={etiket} style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
                      <span style={{ width: 96, flexShrink: 0, color: 'var(--text-tertiary)' }}>{etiket}</span>
                      <span style={{ color: 'var(--text-primary)', wordBreak: 'break-word', flex: 1 }}>{deger}</span>
                    </div>
                  ))}

                  {/* Metin özeti: onay anındaki metnin parmak izi. Bugünkü
                      metinle aynıysa imza o metni kapsıyor demektir. */}
                  <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'flex-start' }}>
                    <span style={{ width: 96, flexShrink: 0, color: 'var(--text-tertiary)' }}>Metin özeti</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <code style={{
                        display: 'block', wordBreak: 'break-all',
                        font: '400 11px/16px ui-monospace, monospace',
                        color: 'var(--text-secondary)',
                        background: 'var(--surface-default)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 6, padding: '5px 8px',
                      }}>
                        {o.metin_ozeti || '—'}
                      </code>
                      {k.ozetGecerli === true && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5, color: '#059669', font: '500 11px/16px var(--font-sans)' }}>
                          <ShieldCheck size={12} strokeWidth={2} />
                          Yürürlükteki metinle birebir aynı — imza geçerli
                        </div>
                      )}
                      {k.ozetGecerli === false && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5, color: '#b45309', font: '500 11px/16px var(--font-sans)' }}>
                          <ShieldAlert size={12} strokeWidth={2} />
                          Onaylanan metin bugünküyle FARKLI — yeniden onay gerekir
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              </div>
            )
          })
        )}
      </Card>

      <p style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 12 }}>
        Onay kayıtları imza niteliğindedir: değiştirilemez, silinemez. Onay anındaki
        metnin özeti (SHA-256), kanal, cihaz ve IP bilgisi kayıt altındadır.
      </p>
    </div>
  )
}
