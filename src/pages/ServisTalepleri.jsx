import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useServisTalebi } from '../context/ServisTalebiContext'
import { useNavigate } from 'react-router-dom'
import { Trash2, Inbox, LayoutGrid, List, X, AlertTriangle, Filter } from 'lucide-react'
import CustomSelect from '../components/CustomSelect'
import {
  Button, SearchInput, Card, Badge, CodeBadge, KPICard, EmptyState,
} from '../components/ui'

const ACIL_TONE = {
  acil:    'kayip',
  yuksek:  'beklemede',
  normal:  'lead',
  dusuk:   'neutral',
}
const DURUM_TONE = {
  bekliyor:     'pasif',
  inceleniyor:  'beklemede',
  atandi:       'lead',
  devam_ediyor: 'beklemede',
  tamamlandi:   'aktif',
  iptal:        'kayip',
}

export default function ServisTalepleri() {
  const { kullanici } = useAuth()
  const { talepler, talepSil, ANA_TURLER, DURUM_LISTESI, ACILIYET_SEVIYELERI } = useServisTalebi()
  const [silOnayId, setSilOnayId] = useState(null)
  const navigate = useNavigate()

  const [aramaMetni, setAramaMetni] = useState('')
  const [durumFiltre, setDurumFiltre] = useState('tumu')
  const [turFiltre, setTurFiltre] = useState('tumu')
  const [aciliyetFiltre, setAciliyetFiltre] = useState('tumu')
  const [gorunum, setGorunum] = useState('liste')

  const filtrelenmis = talepler.filter(t => {
    if (aramaMetni) {
      const q = aramaMetni.toLowerCase()
      if (![t.talepNo, t.konu, t.musteriAd, t.firmaAdi].some(v => (v || '').toLowerCase().includes(q))) return false
    }
    if (durumFiltre !== 'tumu' && t.durum !== durumFiltre) return false
    if (turFiltre !== 'tumu' && t.anaTur !== turFiltre) return false
    if (aciliyetFiltre !== 'tumu' && t.aciliyet !== aciliyetFiltre) return false
    return true
  }).sort((a, b) => {
    const acilSira = { acil: 0, yuksek: 1, normal: 2, dusuk: 3 }
    if (acilSira[a.aciliyet] !== acilSira[b.aciliyet]) return acilSira[a.aciliyet] - acilSira[b.aciliyet]
    return new Date(b.olusturmaTarihi) - new Date(a.olusturmaTarihi)
  })

  const ist = {
    toplam: talepler.length,
    bekliyor: talepler.filter(t => t.durum === 'bekliyor').length,
    devam: talepler.filter(t => ['inceleniyor', 'atandi', 'devam_ediyor'].includes(t.durum)).length,
    tamamlandi: talepler.filter(t => t.durum === 'tamamlandi').length,
    acil: talepler.filter(t => t.aciliyet === 'acil' && !['tamamlandi', 'iptal'].includes(t.durum)).length,
  }

  const temizle = () => { setDurumFiltre('tumu'); setTurFiltre('tumu'); setAciliyetFiltre('tumu'); setAramaMetni('') }
  const filtreAktif = durumFiltre !== 'tumu' || turFiltre !== 'tumu' || aciliyetFiltre !== 'tumu' || aramaMetni

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Servis Talepleri</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>Müşteri talep ve servis portalı</p>
        </div>
        <div style={{ display: 'inline-flex', padding: 2, background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)' }}>
          <button
            onClick={() => setGorunum('liste')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px',
              borderRadius: 'calc(var(--radius-sm) - 2px)',
              background: gorunum === 'liste' ? 'var(--surface-card)' : 'transparent',
              boxShadow: gorunum === 'liste' ? 'var(--shadow-sm)' : 'none',
              color: gorunum === 'liste' ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: 'none', cursor: 'pointer',
              font: '500 13px/18px var(--font-sans)',
            }}
          >
            <List size={14} strokeWidth={1.5} /> Liste
          </button>
          <button
            onClick={() => setGorunum('pano')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px',
              borderRadius: 'calc(var(--radius-sm) - 2px)',
              background: gorunum === 'pano' ? 'var(--surface-card)' : 'transparent',
              boxShadow: gorunum === 'pano' ? 'var(--shadow-sm)' : 'none',
              color: gorunum === 'pano' ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: 'none', cursor: 'pointer',
              font: '500 13px/18px var(--font-sans)',
            }}
          >
            <LayoutGrid size={14} strokeWidth={1.5} /> Pano
          </button>
        </div>
      </div>

      {/* İstatistik kartları */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KPICard label="TOPLAM"      value={ist.toplam} />
        <KPICard label="BEKLİYOR"    value={ist.bekliyor}    footer={<span style={{ color: 'var(--text-tertiary)' }}>İşleme alınmadı</span>} />
        <KPICard label="DEVAM EDEN"  value={ist.devam}       footer={<span style={{ color: 'var(--warning)' }}>İşlemde</span>} />
        <KPICard label="TAMAMLANDI"  value={ist.tamamlandi}  footer={<span style={{ color: 'var(--success)' }}>Kapalı</span>} />
        <KPICard label="ACİL"        value={ist.acil}        footer={ist.acil > 0 ? <><AlertTriangle size={12} strokeWidth={1.5} style={{ color: 'var(--danger)' }} /><span style={{ color: 'var(--danger)' }}>Müdahale bekliyor</span></> : <span style={{ color: 'var(--text-tertiary)' }}>Yok</span>} />
      </div>

      {/* Filtreler */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div style={{ gridColumn: 'span 2' }}>
            <SearchInput
              value={aramaMetni}
              onChange={e => setAramaMetni(e.target.value)}
              placeholder="Talep no, konu, müşteri veya firma ara…"
            />
          </div>
          <CustomSelect value={durumFiltre} onChange={e => setDurumFiltre(e.target.value)}>
            <option value="tumu">Tüm Durumlar</option>
            {DURUM_LISTESI.map(d => <option key={d.id} value={d.id}>{d.isim}</option>)}
          </CustomSelect>
          <CustomSelect value={turFiltre} onChange={e => setTurFiltre(e.target.value)}>
            <option value="tumu">Tüm Türler</option>
            {ANA_TURLER.map(t => <option key={t.id} value={t.id}>{t.isim}</option>)}
          </CustomSelect>
          <CustomSelect value={aciliyetFiltre} onChange={e => setAciliyetFiltre(e.target.value)}>
            <option value="tumu">Tüm Aciliyet</option>
            {ACILIYET_SEVIYELERI.map(a => <option key={a.id} value={a.id}>{a.isim}</option>)}
          </CustomSelect>
        </div>
        {filtreAktif && (
          <div style={{ marginTop: 10 }}>
            <Button variant="tertiary" size="sm" iconLeft={<X size={14} strokeWidth={1.5} />} onClick={temizle}>
              Filtreleri temizle
            </Button>
          </div>
        )}
      </Card>

      <p className="t-caption" style={{ marginBottom: 12 }}>
        <span className="tabular-nums">{filtrelenmis.length}</span> talep gösteriliyor
      </p>

      {/* Liste */}
      {gorunum === 'liste' && (
        filtrelenmis.length === 0 ? (
          <EmptyState icon={<Inbox size={32} strokeWidth={1.5} />} title="Talep bulunamadı" />
        ) : (
          <Card padding={0} style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr>
                    {['Talep No', 'Konu / Müşteri', 'Tür', 'Aciliyet', 'Durum', 'Tarih', ''].map((h, i) => (
                      <th key={i} style={{
                        background: 'var(--surface-sunken)',
                        padding: '10px 14px',
                        textAlign: i === 6 ? 'right' : 'left',
                        font: '600 11px/16px var(--font-sans)',
                        color: 'var(--text-tertiary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        borderBottom: '1px solid var(--border-default)',
                        whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrelenmis.map(talep => {
                    const anaTur = ANA_TURLER.find(t => t.id === talep.anaTur)
                    const durum = DURUM_LISTESI.find(d => d.id === talep.durum)
                    const aciliyet = ACILIYET_SEVIYELERI.find(a => a.id === talep.aciliyet)
                    const silOnayAcik = silOnayId === talep.id
                    return (
                      <>
                        <tr
                          key={talep.id}
                          onClick={() => !silOnayAcik && navigate(`/servis-talepleri/${talep.id}`)}
                          style={{ cursor: silOnayAcik ? 'default' : 'pointer', transition: 'background 120ms' }}
                          onMouseEnter={e => !silOnayAcik && (e.currentTarget.style.background = 'var(--surface-sunken)')}
                          onMouseLeave={e => !silOnayAcik && (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                            <CodeBadge>{talep.talepNo}</CodeBadge>
                          </td>
                          <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', maxWidth: 300 }}>
                            <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {talep.konu}
                            </div>
                            <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                              {talep.firmaAdi || talep.musteriAd}
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                            {anaTur && <Badge tone="brand">{anaTur.isim}</Badge>}
                          </td>
                          <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                            {aciliyet && <Badge tone={ACIL_TONE[aciliyet.id]}>{aciliyet.isim}</Badge>}
                          </td>
                          <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                            {durum && <Badge tone={DURUM_TONE[durum.id]}>{durum.isim}</Badge>}
                          </td>
                          <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                            {new Date(talep.olusturmaTarihi).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                          </td>
                          <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                            <button
                              aria-label="Sil"
                              onClick={() => setSilOnayId(silOnayAcik ? null : talep.id)}
                              style={{
                                width: 28, height: 28,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: 'transparent', border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-sm)',
                                color: silOnayAcik ? 'var(--danger)' : 'var(--text-secondary)',
                                cursor: 'pointer',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = silOnayAcik ? 'var(--danger)' : 'var(--text-secondary)' }}
                            >
                              <Trash2 size={12} strokeWidth={1.5} />
                            </button>
                          </td>
                        </tr>
                        {silOnayAcik && (
                          <tr>
                            <td colSpan={7} style={{
                              padding: '12px 20px',
                              background: 'var(--danger-soft)',
                              borderTop: '1px solid var(--danger-border)',
                              borderBottom: '1px solid var(--border-default)',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '500 13px/18px var(--font-sans)', color: 'var(--danger)' }}>
                                  <AlertTriangle size={14} strokeWidth={1.5} />
                                  <strong>{talep.talepNo}</strong> silinecek. Emin misiniz?
                                </span>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <Button variant="secondary" size="sm" onClick={() => setSilOnayId(null)}>İptal</Button>
                                  <Button variant="danger" size="sm" onClick={() => { talepSil(talep.id); setSilOnayId(null) }}>Evet, sil</Button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )
      )}

      {/* Pano */}
      {gorunum === 'pano' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {DURUM_LISTESI.filter(d => d.id !== 'iptal').map(durum => {
            const durumTalepleri = filtrelenmis.filter(t => t.durum === durum.id)
            const durumToneId = DURUM_TONE[durum.id]
            return (
              <div
                key={durum.id}
                style={{
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--surface-card)',
                  borderBottom: '1px solid var(--border-default)',
                }}>
                  <Badge tone={durumToneId}>{durum.isim}</Badge>
                  <span style={{
                    minWidth: 20, height: 20, padding: '0 6px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--surface-sunken)',
                    border: '1px solid var(--border-default)',
                    font: '600 11px/1 var(--font-sans)',
                    color: 'var(--text-secondary)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {durumTalepleri.length}
                  </span>
                </div>
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 520, overflowY: 'auto' }}>
                  {durumTalepleri.length === 0 && (
                    <p style={{ textAlign: 'center', padding: '16px 8px', font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                      Talep yok
                    </p>
                  )}
                  {durumTalepleri.map(talep => {
                    const anaTur = ANA_TURLER.find(t => t.id === talep.anaTur)
                    const aciliyet = ACILIYET_SEVIYELERI.find(a => a.id === talep.aciliyet)
                    return (
                      <div
                        key={talep.id}
                        onClick={() => navigate(`/servis-talepleri/${talep.id}`)}
                        style={{
                          background: 'var(--surface-card)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-sm)',
                          padding: 10,
                          cursor: 'pointer',
                          transition: 'border-color 120ms',
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brand-primary)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-default)'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                          <CodeBadge>{talep.talepNo}</CodeBadge>
                          {aciliyet && <Badge tone={ACIL_TONE[aciliyet.id]}>{aciliyet.isim}</Badge>}
                        </div>
                        <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                          {talep.konu}
                        </div>
                        <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                          {talep.firmaAdi || talep.musteriAd}
                        </div>
                        {anaTur && (
                          <div style={{ marginTop: 6 }}>
                            <Badge tone="brand">{anaTur.isim}</Badge>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
