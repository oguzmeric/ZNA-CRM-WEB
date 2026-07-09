// Teklif Onayları — teklif onay yetkilileri burada bekleyen teklifleri görür.
// Onaylanınca teklif sipariş onayına düşer (bir sonraki aşama).

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, Clock, FileText, Building2, User as UserIcon, Calendar, Receipt,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  Card, CardTitle, Button, Badge, EmptyState, Textarea,
} from '../components/ui'
import {
  bekleyenTeklifOnaylariniGetir, onaylananTeklifOnaylariniGetir, reddedilenTeklifOnaylariniGetir,
  teklifOnayla, teklifReddet, teklifOnayGeriAl,
} from '../services/teklifOnayService'
import TeklifKalemTablosu, { toplamHesapla } from '../components/TeklifKalemTablosu'

// Teklif genel toplamını al: DB'deki value 0/null ise satırlardan hesapla
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

const SEKMELER = [
  { id: 'bekleyen', label: 'Bekleyen', renk: '#F59E0B' },
  { id: 'onayli',   label: 'Onaylı',   renk: '#10B981' },
  { id: 'red',      label: 'Reddedilen', renk: '#DC2626' },
]

export default function TeklifOnaylari() {
  const { kullanici } = useAuth()
  const navigate = useNavigate()
  const [sekme, setSekme] = useState('bekleyen')
  const [liste, setListe] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [secili, setSecili] = useState(null)
  // Filtre + sıralama
  const [tarihBas, setTarihBas] = useState('')
  const [tarihBit, setTarihBit] = useState('')
  const [siralama, setSiralama] = useState('yeni') // 'yeni' | 'eski'

  const yetkili = kullanici?.teklifOnayYetkilisi === true || kullanici?.teklif_onay_yetkilisi === true

  const yukle = async () => {
    setYukleniyor(true)
    try {
      const d = sekme === 'bekleyen' ? await bekleyenTeklifOnaylariniGetir()
              : sekme === 'onayli' ? await onaylananTeklifOnaylariniGetir()
              : await reddedilenTeklifOnaylariniGetir()
      setListe(d)
    } catch (e) {
      console.error('[teklif onay liste]', e)
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { if (yetkili) yukle() }, [sekme, yetkili])

  // Tarih baz al: bekleyen için tarih (teklif tarihi), diğerleri için onay/red tarihi
  const filtreliListe = () => {
    const bazTarih = (t) => {
      if (sekme === 'bekleyen') return t.tarih || null
      return t.teklifOnayi?.onayTarih || t.teklifOnayi?.onay_tarih || t.tarih || null
    }
    let sonuc = liste.slice()
    if (tarihBas) sonuc = sonuc.filter(t => { const d = bazTarih(t); return d && d >= tarihBas })
    if (tarihBit) sonuc = sonuc.filter(t => { const d = bazTarih(t); return d && d <= tarihBit })
    sonuc.sort((a, b) => {
      const da = bazTarih(a) || ''
      const db = bazTarih(b) || ''
      const cmp = da.localeCompare(db)
      return siralama === 'yeni' ? -cmp : cmp
    })
    return sonuc
  }

  if (!yetkili) {
    return (
      <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
        <EmptyState
          title="Bu sayfaya erişim yetkin yok"
          aciklama="Teklif Onayları sayfası yalnızca yetkilendirilmiş kullanıcılara açıktır."
          icon={<XCircle size={32} />}
        />
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 className="t-h1">Teklif Onayları</h1>
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
                padding: '8px 16px', borderRadius: 8,
                background: aktif ? '#fff' : 'transparent',
                color: aktif ? s.renk : 'var(--text-secondary)',
                border: 'none', cursor: 'pointer',
                font: aktif ? '700 13px/16px var(--font-sans)' : '500 13px/16px var(--font-sans)',
                boxShadow: aktif ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >{s.label}</button>
          )
        })}
      </div>

      {/* Tarih + sıralama filtresi */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 10, marginBottom: 14,
        padding: 12, background: 'var(--surface-sunken)', borderRadius: 10,
      }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 600 }}>Tarih başlangıç</label>
          <input type="date" value={tarihBas} onChange={e => setTarihBas(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: '#fff', fontSize: 13 }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 600 }}>Tarih bitiş</label>
          <input type="date" value={tarihBit} onChange={e => setTarihBit(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: '#fff', fontSize: 13 }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 600 }}>Sıralama</label>
          <div style={{ display: 'inline-flex', background: '#fff', border: '1px solid var(--border-default)', borderRadius: 8, padding: 3 }}>
            {[{ id: 'yeni', label: 'Yeniden → Eskiye' }, { id: 'eski', label: 'Eskiden → Yeniye' }].map(o => (
              <button key={o.id} onClick={() => setSiralama(o.id)}
                style={{
                  padding: '6px 12px', borderRadius: 6,
                  background: siralama === o.id ? 'var(--brand-primary)' : 'transparent',
                  color: siralama === o.id ? '#fff' : 'var(--text-secondary)',
                  border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}>{o.label}</button>
            ))}
          </div>
        </div>
        {(tarihBas || tarihBit) && (
          <Button variant="secondary" size="sm" onClick={() => { setTarihBas(''); setTarihBit('') }}>
            Tarihi Temizle
          </Button>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>
          {(() => {
            const f = filtreliListe()
            return `${f.length} kayıt${(tarihBas || tarihBit) ? ` (${liste.length}'den)` : ''}`
          })()}
        </div>
      </div>

      {/* Seçili detay üstte tam genişlik */}
      {secili && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="secondary" size="sm" onClick={() => setSecili(null)}>× Kapat</Button>
          </div>
          <DetayPaneli
            teklif={secili}
            sekme={sekme}
            kullanici={kullanici}
            onTamamlandi={() => { setSecili(null); yukle() }}
          />
        </div>
      )}

      {/* Liste — tam genişlik tablo (detay açıkken gizli) */}
      {!secili && (
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {yukleniyor ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
        ) : filtreliListe().length === 0 ? (
          <EmptyState
            title={sekme === 'bekleyen' ? 'Bekleyen teklif onayı yok' : sekme === 'onayli' ? 'Onaylanmış teklif yok' : 'Reddedilmiş teklif yok'}
            icon={<Clock size={24} />}
          />
        ) : (
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: 'var(--surface-sunken)' }}>
                <tr>
                  <th style={thStyle}>Teklif No</th>
                  <th style={thStyle}>Firma</th>
                  <th style={thStyle}>Konu</th>
                  <th style={thStyle}>Hazırlayan</th>
                  <th style={thStyle}>{sekme === 'bekleyen' ? 'Gönderme' : sekme === 'onayli' ? 'Onay Tarihi' : 'Red Tarihi'}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Tutar</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 100 }}>&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {filtreliListe().map(t => {
                  const to = t.teklifOnayi || {}
                  const tarihGoster = sekme === 'bekleyen'
                    ? fmtTarih(to.gonderme_tarih || t.tarih)
                    : fmtTarih(to.onay_tarih || t.tarih)
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSecili(t)}
                      style={{ cursor: 'pointer', borderTop: '1px solid var(--border-subtle)', transition: 'background 100ms' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={tdStyle}>
                        <strong style={{ color: 'var(--text-primary)' }}>{t.teklifNo}</strong>
                      </td>
                      <td style={tdStyle}>{t.firmaAdi || '—'}</td>
                      <td style={tdStyle}>
                        <span style={{ color: 'var(--text-secondary)' }}>{t.konu || '—'}</span>
                      </td>
                      <td style={tdStyle}>{sekme === 'bekleyen' ? (to.gonderen_ad || '—') : (to.onaylayan_ad || t.hazirlayan || '—')}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{tarihGoster}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {fmtPara(gerçekToplam(t), t.paraBirimi)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <Button variant="secondary" size="sm">İncele →</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      )}
    </div>
  )
}

function DetayPaneli({ teklif: t, sekme, kullanici, onTamamlandi }) {
  const [gerekce, setGerekce] = useState('')
  const [redNedeni, setRedNedeni] = useState('')
  const [redAcik, setRedAcik] = useState(false)
  const [calisiyor, setCalisiyor] = useState(false)
  const [hata, setHata] = useState(null)

  const to = t.teklifOnayi || {}
  const ustYetkili = kullanici?.teklifOnayUstYetkili === true || kullanici?.teklif_onay_ust_yetkili === true
  const geriAlYetkili = ustYetkili || (to.onaylayan_id === kullanici?.id)

  const onayla = async () => {
    setHata(null)
    if (!ustYetkili && !gerekce.trim()) { setHata('Onay için gerekçe gerekli.'); return }
    setCalisiyor(true)
    try {
      await teklifOnayla(t.id, kullanici, gerekce.trim(), null)
      onTamamlandi()
    } catch (e) {
      setHata(e?.message || 'Onay başarısız')
    } finally { setCalisiyor(false) }
  }

  const reddet = async () => {
    setHata(null)
    if (!redNedeni.trim()) { setHata('Red nedeni gerekli.'); return }
    setCalisiyor(true)
    try {
      await teklifReddet(t.id, kullanici, redNedeni.trim())
      onTamamlandi()
    } catch (e) {
      setHata(e?.message || 'Red başarısız')
    } finally { setCalisiyor(false) }
  }

  const geriAl = async () => {
    if (!confirm('Bu kararı geri almak istediğine emin misin?')) return
    setCalisiyor(true)
    try {
      await teklifOnayGeriAl(t.id)
      onTamamlandi()
    } catch (e) {
      setHata(e?.message || 'Geri alınamadı')
    } finally { setCalisiyor(false) }
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <BilgiKart Icon={Calendar} etiket="Teklif Tarihi" deger={fmtTarih(t.tarih)} />
        <BilgiKart Icon={UserIcon} etiket="Hazırlayan" deger={t.hazirlayan || t.musteriTemsilcisi || '—'} />
        <BilgiKart Icon={Receipt} etiket="Tutar" deger={fmtPara(gerçekToplam(t), t.paraBirimi)} vurgu />
        <BilgiKart Icon={FileText} etiket="Ödeme" deger={t.odemeSekli || t.odemeSecenegi || '—'} />
        {(t.gecerlilikTarihi || t.teslimTarihi) && (
          <BilgiKart Icon={Calendar} etiket={t.teslimTarihi ? 'Teslim' : 'Geçerlilik'} deger={fmtTarih(t.teslimTarihi || t.gecerlilikTarihi)} />
        )}
        {t.aciklama && <BilgiKart Icon={FileText} etiket="Açıklama" deger={t.aciklama} />}
      </div>

      <TeklifKalemTablosu satirlar={t.satirlar} paraBirimi={t.paraBirimi} />

      {/* Gonderme bilgisi */}
      {to.gonderen_ad && sekme === 'bekleyen' && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid #F59E0B', borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: '#92400E', fontWeight: 700, marginBottom: 4 }}>ONAYA GÖNDERİLDİ</div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            <strong>{to.gonderen_ad}</strong> · {fmtTarih(to.gonderme_tarih)}
          </div>
        </div>
      )}

      {sekme === 'onayli' && (
        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid #10B981', borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <CheckCircle2 size={16} style={{ color: '#10B981' }} />
            <strong style={{ fontSize: 13, color: '#065F46' }}>Onaylı</strong>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <strong>{to.onaylayan_ad}</strong> · {fmtTarih(to.onay_tarih)}
          </div>
          {to.onay_gerekcesi && (
            <div style={{ marginTop: 10, padding: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid #F59E0B', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: '#92400E', fontWeight: 700, marginBottom: 4 }}>GEREKÇE</div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{to.onay_gerekcesi}</div>
            </div>
          )}
          {geriAlYetkili && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(16,185,129,0.25)' }}>
              <Button variant="secondary" size="sm" onClick={geriAl} disabled={calisiyor} iconLeft={<Clock size={12} strokeWidth={1.5} />}>
                {calisiyor ? 'İşleniyor…' : 'Onayı Geri Al'}
              </Button>
            </div>
          )}
        </div>
      )}

      {sekme === 'red' && (
        <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid #DC2626', borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <XCircle size={16} style={{ color: '#DC2626' }} />
            <strong style={{ fontSize: 13, color: '#7F1D1D' }}>Reddedildi</strong>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <strong>{to.onaylayan_ad}</strong> · {fmtTarih(to.onay_tarih)}
          </div>
          {to.red_nedeni && (
            <div style={{ marginTop: 10, padding: 10, background: 'rgba(220,38,38,0.08)', border: '1px solid #DC2626', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: '#7F1D1D', fontWeight: 700, marginBottom: 4 }}>RED NEDENİ</div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{to.red_nedeni}</div>
            </div>
          )}
          {geriAlYetkili && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(220,38,38,0.25)' }}>
              <Button variant="secondary" size="sm" onClick={geriAl} disabled={calisiyor}>Reddi Geri Al</Button>
            </div>
          )}
        </div>
      )}

      {sekme === 'bekleyen' && (
        <>
          {!redAcik ? (
            <>
              {!ustYetkili && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ font: '600 12px/16px var(--font-sans)', color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                    Onay Gerekçesi (zorunlu) *
                  </label>
                  <Textarea
                    value={gerekce}
                    onChange={e => setGerekce(e.target.value)}
                    placeholder="Neden onaylıyorsun? (örn: Fiyat piyasa uygun, müşteri güvenilir)"
                    rows={2}
                  />
                </div>
              )}
              {hata && (
                <div style={{ padding: 10, background: 'rgba(220,38,38,0.08)', border: '1px solid #DC2626', borderRadius: 8, color: '#7F1D1D', fontSize: 13, marginBottom: 12 }}>
                  {hata}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                <Button
                  variant="secondary"
                  onClick={() => setRedAcik(true)}
                  disabled={calisiyor}
                  iconLeft={<XCircle size={14} strokeWidth={1.5} />}
                >
                  Reddet
                </Button>
                <Button
                  variant="primary"
                  onClick={onayla}
                  disabled={calisiyor}
                  iconLeft={<CheckCircle2 size={14} strokeWidth={1.5} />}
                >
                  {calisiyor ? 'İşleniyor…' : 'Onayla'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={{ font: '600 12px/16px var(--font-sans)', color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                  Red Nedeni (zorunlu) *
                </label>
                <Textarea
                  value={redNedeni}
                  onChange={e => setRedNedeni(e.target.value)}
                  placeholder="Neden reddediyorsun?"
                  rows={3}
                />
              </div>
              {hata && (
                <div style={{ padding: 10, background: 'rgba(220,38,38,0.08)', border: '1px solid #DC2626', borderRadius: 8, color: '#7F1D1D', fontSize: 13, marginBottom: 12 }}>
                  {hata}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" onClick={() => { setRedAcik(false); setRedNedeni(''); setHata(null) }} disabled={calisiyor}>
                  Vazgeç
                </Button>
                <Button variant="danger" onClick={reddet} disabled={calisiyor} iconLeft={<XCircle size={14} strokeWidth={1.5} />} style={{ flex: 1 }}>
                  {calisiyor ? 'İşleniyor…' : 'Reddet'}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </Card>
  )
}

const thStyle = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--text-tertiary)',
  fontWeight: 700,
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border-default)',
}
const tdStyle = { padding: '10px 12px', verticalAlign: 'middle' }

function BilgiKart({ Icon, etiket, deger, vurgu }) {
  return (
    <div style={{ padding: '10px 12px', background: 'var(--surface-sunken)', borderRadius: 8, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <Icon size={14} style={{ color: 'var(--text-tertiary)', marginTop: 2, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '600 10px/13px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>
          {etiket}
        </div>
        <div style={{ font: vurgu ? '700 15px/20px var(--font-sans)' : '500 13px/18px var(--font-sans)', color: vurgu ? 'var(--brand-primary)' : 'var(--text-primary)' }}>
          {deger}
        </div>
      </div>
    </div>
  )
}
