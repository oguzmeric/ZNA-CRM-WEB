import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Plus, MapPin, Clock, Calendar, MessageSquare, Trash2,
  FolderOpen, CheckCircle2, Circle, AlertTriangle, List, History,
  ChevronLeft, ChevronRight, X, User,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useServisTalebi } from '../../context/ServisTalebiContext'
import { Button, Card, Badge, CodeBadge } from '../../components/ui'

const ACIL_TONE = { acil: 'kayip', yuksek: 'beklemede', normal: 'lead', dusuk: 'neutral' }
const DURUM_TONE = {
  bekliyor: 'pasif', inceleniyor: 'beklemede', atandi: 'lead',
  devam_ediyor: 'beklemede', tamamlandi: 'aktif', iptal: 'kayip',
}

const durumIkonu = (id) => {
  if (id === 'tamamlandi') return <CheckCircle2 size={14} strokeWidth={1.8} style={{ color: 'var(--success)' }} />
  if (id === 'iptal') return <AlertTriangle size={14} strokeWidth={1.8} style={{ color: 'var(--danger)' }} />
  if (['inceleniyor', 'atandi', 'devam_ediyor'].includes(id)) return <Clock size={14} strokeWidth={1.8} style={{ color: 'var(--warning)' }} />
  return <Circle size={14} strokeWidth={1.8} style={{ color: 'var(--info)' }} />
}

const inSearch = (val, q) => !q || String(val ?? '').toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))
const inDateEq = (val, q) => !q || (val && String(val).slice(0, 10) === q)

export default function Taleplerim() {
  const { kullanici } = useAuth()
  const { musteriTalepleri, talepSil, ANA_TURLER, DURUM_LISTESI, ACILIYET_SEVIYELERI } = useServisTalebi()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [durumFiltre, setDurumFiltre] = useState(searchParams.get('durum') || 'tumu')
  const [kolonFiltre, setKolonFiltre] = useState({
    no: '', tur: '', konu: '', aciliyet: '', atanan: '', planli: '', olusturma: '',
  })
  const [sayfa, setSayfa] = useState(1)
  const SAYFA_BOYUT = 25

  const talepler = musteriTalepleri(kullanici?.musteriId)

  const bugun = new Date().toISOString().split('T')[0]

  const filtrelenmis = talepler
    .filter(t => {
      if (durumFiltre === 'bekliyor' && t.durum !== 'bekliyor') return false
      if (durumFiltre === 'devam' && !['inceleniyor', 'atandi', 'devam_ediyor'].includes(t.durum)) return false
      if (durumFiltre === 'tamamlandi' && t.durum !== 'tamamlandi') return false
      if (durumFiltre === 'iptal' && t.durum !== 'iptal') return false
      if (durumFiltre === 'gecmis') {
        if (t.durum === 'tamamlandi' || t.durum === 'iptal') return false
        return t.planliTarih && String(t.planliTarih).slice(0, 10) < bugun
      }
      return true
    })
    .filter(t => {
      const anaTur = ANA_TURLER.find(x => x.id === t.anaTur)?.isim
      const aciliyet = ACILIYET_SEVIYELERI.find(a => a.id === t.aciliyet)?.isim
      const olusturma = t.olusturmaTarihi ? String(t.olusturmaTarihi).slice(0, 10) : ''
      const planli = t.planliTarih ? String(t.planliTarih).slice(0, 10) : ''
      return (
        inSearch(t.talepNo, kolonFiltre.no) &&
        inSearch(anaTur, kolonFiltre.tur) &&
        inSearch(t.konu, kolonFiltre.konu) &&
        inSearch(aciliyet, kolonFiltre.aciliyet) &&
        inSearch(t.atananKullaniciAd, kolonFiltre.atanan) &&
        inDateEq(planli, kolonFiltre.planli) &&
        inDateEq(olusturma, kolonFiltre.olusturma)
      )
    })
    .sort((a, b) => new Date(b.olusturmaTarihi) - new Date(a.olusturmaTarihi))

  const toplam = filtrelenmis.length
  const toplamSayfa = Math.max(1, Math.ceil(toplam / SAYFA_BOYUT))
  const guvSayfa = Math.min(sayfa, toplamSayfa)
  const dilim = filtrelenmis.slice((guvSayfa - 1) * SAYFA_BOYUT, guvSayfa * SAYFA_BOYUT)

  const filtreVar = Object.values(kolonFiltre).some(Boolean)

  const silmeOnay = async (e, talep) => {
    e.stopPropagation()
    const onay = window.confirm(`"${talep.talepNo} — ${talep.konu}" talebini silmek istediğine emin misin?\n\nBu işlem geri alınamaz.`)
    if (!onay) return
    try {
      await talepSil(talep.id)
    } catch (err) {
      alert('Talep silinemedi: ' + (err?.message || 'Bilinmeyen hata'))
    }
  }

  const fmtTarih = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  }
  const fmtSadeTarih = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const thStyle = {
    textAlign: 'left',
    padding: '10px 12px',
    font: '600 11px/14px var(--font-sans)',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    background: 'var(--surface-sunken)',
    borderBottom: '1px solid var(--border-default)',
    whiteSpace: 'nowrap',
    position: 'sticky', top: 0, zIndex: 1,
  }
  const tdStyle = {
    padding: '10px 12px',
    font: '400 13px/18px var(--font-sans)',
    color: 'var(--text-primary)',
    borderBottom: '1px solid var(--border-default)',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
  }
  const colFilterInput = {
    width: '100%',
    padding: '6px 8px',
    font: '400 12px/16px var(--font-sans)',
    color: 'var(--text-primary)',
    background: 'var(--surface-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    outline: 'none',
  }

  const durumChipler = [
    { id: 'tumu', isim: 'Tümü', Icon: List },
    { id: 'bekliyor', isim: 'Bekleyen', Icon: Circle, renk: 'var(--info)' },
    { id: 'devam', isim: 'Devam Eden', Icon: Clock, renk: 'var(--warning)' },
    { id: 'tamamlandi', isim: 'Tamamlanan', Icon: CheckCircle2, renk: 'var(--success)' },
    { id: 'iptal', isim: 'İptal', Icon: X, renk: 'var(--danger)' },
    { id: 'gecmis', isim: 'Geçmiş', Icon: History, renk: 'var(--danger)' },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Taleplerim</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            Toplam <span className="tabular-nums">{talepler.length}</span> talep · <span className="tabular-nums">{toplam}</span> gösteriliyor
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => navigate('/musteri-portal/yeni-talep')}>
          Yeni talep
        </Button>
      </div>

      <Card padding={0} style={{ overflow: 'hidden' }}>
        {/* Üst status şeridi */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
          padding: '10px 12px',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--surface-card)',
        }}>
          {durumChipler.map(d => {
            const aktif = durumFiltre === d.id
            const Icon = d.Icon
            return (
              <button
                key={d.id}
                onClick={() => { setDurumFiltre(d.id); setSayfa(1) }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px',
                  background: aktif ? 'var(--brand-primary-soft)' : 'transparent',
                  color: aktif ? 'var(--brand-primary)' : 'var(--text-secondary)',
                  border: 'none', cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)',
                  font: aktif ? '600 13px/18px var(--font-sans)' : '500 13px/18px var(--font-sans)',
                }}
                onMouseEnter={e => { if (!aktif) e.currentTarget.style.background = 'var(--surface-sunken)' }}
                onMouseLeave={e => { if (!aktif) e.currentTarget.style.background = 'transparent' }}
              >
                <Icon size={13} strokeWidth={1.5} style={{ color: d.renk || undefined }} />
                {d.isim}
              </button>
            )
          })}
          {filtreVar && (
            <button
              onClick={() => setKolonFiltre({ no:'', tur:'', konu:'', aciliyet:'', atanan:'', planli:'', olusturma:'' })}
              style={{
                marginLeft: 'auto',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '6px 10px',
                background: 'transparent', border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)', cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                font: '500 12px/16px var(--font-sans)',
              }}
            >
              <X size={12} strokeWidth={1.5} /> Filtreleri temizle
            </button>
          )}
        </div>

        {/* Tablo */}
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 64 }}></th>
                <th style={thStyle}>Talep No</th>
                <th style={thStyle}>Tür</th>
                <th style={{ ...thStyle, minWidth: 320 }}>Konu</th>
                <th style={thStyle}>Aciliyet</th>
                <th style={thStyle}>Atanan</th>
                <th style={thStyle}>Planlı Tarih</th>
                <th style={thStyle}>Oluşturma</th>
                <th style={thStyle}>Durum</th>
                <th style={{ ...thStyle, width: 60 }}></th>
              </tr>
              <tr>
                <th style={{ ...thStyle, top: 34, padding: '6px 12px', background: 'var(--surface-card)' }}></th>
                <th style={{ ...thStyle, top: 34, padding: '6px 12px', background: 'var(--surface-card)' }}>
                  <input placeholder="ara…" value={kolonFiltre.no}
                    onChange={e => { setKolonFiltre({ ...kolonFiltre, no: e.target.value }); setSayfa(1) }}
                    style={colFilterInput} />
                </th>
                <th style={{ ...thStyle, top: 34, padding: '6px 12px', background: 'var(--surface-card)' }}>
                  <input placeholder="ara…" value={kolonFiltre.tur}
                    onChange={e => { setKolonFiltre({ ...kolonFiltre, tur: e.target.value }); setSayfa(1) }}
                    style={colFilterInput} />
                </th>
                <th style={{ ...thStyle, top: 34, padding: '6px 12px', background: 'var(--surface-card)' }}>
                  <input placeholder="konu / lokasyon…" value={kolonFiltre.konu}
                    onChange={e => { setKolonFiltre({ ...kolonFiltre, konu: e.target.value }); setSayfa(1) }}
                    style={colFilterInput} />
                </th>
                <th style={{ ...thStyle, top: 34, padding: '6px 12px', background: 'var(--surface-card)' }}>
                  <input placeholder="ara…" value={kolonFiltre.aciliyet}
                    onChange={e => { setKolonFiltre({ ...kolonFiltre, aciliyet: e.target.value }); setSayfa(1) }}
                    style={colFilterInput} />
                </th>
                <th style={{ ...thStyle, top: 34, padding: '6px 12px', background: 'var(--surface-card)' }}>
                  <input placeholder="ara…" value={kolonFiltre.atanan}
                    onChange={e => { setKolonFiltre({ ...kolonFiltre, atanan: e.target.value }); setSayfa(1) }}
                    style={colFilterInput} />
                </th>
                <th style={{ ...thStyle, top: 34, padding: '6px 12px', background: 'var(--surface-card)' }}>
                  <input type="date" value={kolonFiltre.planli}
                    onChange={e => { setKolonFiltre({ ...kolonFiltre, planli: e.target.value }); setSayfa(1) }}
                    style={colFilterInput} />
                </th>
                <th style={{ ...thStyle, top: 34, padding: '6px 12px', background: 'var(--surface-card)' }}>
                  <input type="date" value={kolonFiltre.olusturma}
                    onChange={e => { setKolonFiltre({ ...kolonFiltre, olusturma: e.target.value }); setSayfa(1) }}
                    style={colFilterInput} />
                </th>
                <th style={{ ...thStyle, top: 34, padding: '6px 12px', background: 'var(--surface-card)' }}></th>
                <th style={{ ...thStyle, top: 34, padding: '6px 12px', background: 'var(--surface-card)' }}></th>
              </tr>
            </thead>
            <tbody>
              {dilim.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', font: '400 13px/18px var(--font-sans)' }}>
                    Gösterilecek talep bulunamadı
                  </td>
                </tr>
              )}
              {dilim.map(talep => {
                const anaTur = ANA_TURLER.find(t => t.id === talep.anaTur)
                const durum = DURUM_LISTESI.find(d => d.id === talep.durum)
                const aciliyet = ACILIYET_SEVIYELERI.find(a => a.id === talep.aciliyet)
                const silinebilir = ['bekliyor', 'iptal'].includes(talep.durum)

                return (
                  <tr
                    key={talep.id}
                    onClick={() => navigate(`/musteri-portal/talep/${talep.id}`)}
                    style={{ cursor: 'pointer', background: 'var(--surface-card)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-card)'}
                  >
                    <td style={{ ...tdStyle, padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', gap: 2 }}>
                        <button
                          aria-label="Detay"
                          onClick={() => navigate(`/musteri-portal/talep/${talep.id}`)}
                          title="Detay"
                          style={{
                            width: 26, height: 26,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'transparent', border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                        >
                          <FolderOpen size={13} strokeWidth={1.5} />
                        </button>
                        <button
                          aria-label={durum?.isim}
                          title={durum?.isim}
                          onClick={() => navigate(`/musteri-portal/talep/${talep.id}`)}
                          style={{
                            width: 26, height: 26,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'transparent', border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                          }}
                        >
                          {durumIkonu(talep.durum)}
                        </button>
                      </div>
                    </td>
                    <td style={tdStyle}><CodeBadge>{talep.talepNo}</CodeBadge></td>
                    <td style={tdStyle}>
                      {anaTur && <Badge tone="brand">{anaTur.isim}</Badge>}
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={talep.konu}>
                      <div style={{ fontWeight: 500 }}>{talep.konu}</div>
                      {talep.lokasyon && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2, font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                          <MapPin size={10} strokeWidth={1.5} /> {talep.lokasyon}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {aciliyet && <Badge tone={ACIL_TONE[aciliyet.id]}>{aciliyet.isim}</Badge>}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                      {talep.atananKullaniciAd ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <User size={12} strokeWidth={1.5} /> {talep.atananKullaniciAd}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                      {fmtSadeTarih(talep.planliTarih)}
                    </td>
                    <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                      {fmtTarih(talep.olusturmaTarihi)}
                    </td>
                    <td style={tdStyle}>
                      {durum && <Badge tone={DURUM_TONE[durum.id]}>{durum.isim}</Badge>}
                      {talep.notlar?.length > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 6, font: '500 11px/14px var(--font-sans)', color: 'var(--brand-primary)' }}>
                          <MessageSquare size={10} strokeWidth={1.5} /> {talep.notlar.length}
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                      {silinebilir && (
                        <button
                          onClick={e => silmeOnay(e, talep)}
                          title="Talebi sil"
                          style={{
                            width: 26, height: 26,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'transparent', border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                        >
                          <Trash2 size={13} strokeWidth={1.5} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer sayfalama */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '10px 16px',
          borderTop: '1px solid var(--border-default)',
          background: 'var(--surface-sunken)',
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => setSayfa(1)}
              disabled={guvSayfa === 1}
              style={{
                padding: '6px 10px', background: 'var(--surface-card)',
                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                cursor: guvSayfa === 1 ? 'not-allowed' : 'pointer',
                color: 'var(--text-secondary)', font: '500 12px/16px var(--font-sans)',
                opacity: guvSayfa === 1 ? 0.5 : 1,
              }}
            >«</button>
            <button
              onClick={() => setSayfa(p => Math.max(1, p - 1))}
              disabled={guvSayfa === 1}
              style={{
                padding: '6px 10px', background: 'var(--surface-card)',
                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                cursor: guvSayfa === 1 ? 'not-allowed' : 'pointer',
                color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center',
                opacity: guvSayfa === 1 ? 0.5 : 1,
              }}
            ><ChevronLeft size={14} strokeWidth={1.5} /></button>
            {(() => {
              const start = Math.max(1, guvSayfa - 4)
              const end = Math.min(toplamSayfa, start + 9)
              const baslangic = Math.max(1, end - 9)
              const sayilar = []
              for (let i = baslangic; i <= end; i++) sayilar.push(i)
              return sayilar.map(n => (
                <button
                  key={n}
                  onClick={() => setSayfa(n)}
                  style={{
                    minWidth: 32, padding: '6px 10px',
                    background: n === guvSayfa ? 'var(--brand-primary)' : 'var(--surface-card)',
                    color: n === guvSayfa ? '#fff' : 'var(--text-secondary)',
                    border: `1px solid ${n === guvSayfa ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    font: '500 12px/16px var(--font-sans)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >{n}</button>
              ))
            })()}
            <button
              onClick={() => setSayfa(p => Math.min(toplamSayfa, p + 1))}
              disabled={guvSayfa === toplamSayfa}
              style={{
                padding: '6px 10px', background: 'var(--surface-card)',
                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                cursor: guvSayfa === toplamSayfa ? 'not-allowed' : 'pointer',
                color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center',
                opacity: guvSayfa === toplamSayfa ? 0.5 : 1,
              }}
            ><ChevronRight size={14} strokeWidth={1.5} /></button>
            <button
              onClick={() => setSayfa(toplamSayfa)}
              disabled={guvSayfa === toplamSayfa}
              style={{
                padding: '6px 10px', background: 'var(--surface-card)',
                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                cursor: guvSayfa === toplamSayfa ? 'not-allowed' : 'pointer',
                color: 'var(--text-secondary)', font: '500 12px/16px var(--font-sans)',
                opacity: guvSayfa === toplamSayfa ? 0.5 : 1,
              }}
            >»</button>
          </div>
          <div style={{ font: '500 12px/16px var(--font-sans)', color: 'var(--text-secondary)' }}>
            <span className="tabular-nums">{toplamSayfa}</span> sayfada toplam <strong style={{ color: 'var(--text-primary)' }} className="tabular-nums">{toplam}</strong> kayıt var
          </div>
        </div>
      </Card>
    </div>
  )
}
