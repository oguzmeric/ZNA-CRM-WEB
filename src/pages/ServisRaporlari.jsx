import { useState, useEffect, useMemo } from 'react'
import { Wrench, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  SearchInput, Card, Badge, CodeBadge, EmptyState, Button, Select, Label,
} from '../components/ui'

const SAYFA_BOYUTU = 50

const trNormalize = (str = '') =>
  String(str).toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/İ/gi, 'i').replace(/I/g, 'i')

const formatTarih = (iso) => {
  if (!iso) return '—'
  const [y, a, g] = iso.split('-')
  return `${g}.${a}.${y}`
}

const takipTone = (s) => {
  const t = (s || '').toLowerCase()
  if (t.includes('tamam')) return 'aktif'
  if (t.includes('devam')) return 'lead'
  if (t.includes('bekle')) return 'beklemede'
  if (t.includes('iptal')) return 'kayip'
  return 'neutral'
}

export default function ServisRaporlari() {
  const [veri, setVeri] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState(null)

  const [arama, setArama] = useState('')
  const [firmaFiltre, setFirmaFiltre] = useState('')
  const [teknisyenFiltre, setTeknisyenFiltre] = useState('')
  const [arizaFiltre, setArizaFiltre] = useState('')
  const [takipFiltre, setTakipFiltre] = useState('')
  const [sayfa, setSayfa] = useState(1)

  useEffect(() => {
    fetch('/data/servis-raporlari.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => { setVeri(d); setYukleniyor(false) })
      .catch(e => { setHata(String(e)); setYukleniyor(false) })
  }, [])

  const firmalar   = useMemo(() => [...new Set(veri.map(r => r.firma).filter(Boolean))].sort(), [veri])
  const teknisyenler = useMemo(() => [...new Set(veri.map(r => r.teknisyen).filter(Boolean))].sort(), [veri])
  const arizaKodlari = useMemo(() => [...new Set(veri.map(r => r.arizaKodu).filter(Boolean))].sort(), [veri])
  const takipDurumlari = useMemo(() => [...new Set(veri.map(r => r.takipKodu).filter(Boolean))].sort(), [veri])

  const filtreli = useMemo(() => {
    const q = trNormalize(arama)
    return veri.filter(r => {
      if (firmaFiltre && r.firma !== firmaFiltre) return false
      if (teknisyenFiltre && r.teknisyen !== teknisyenFiltre) return false
      if (arizaFiltre && r.arizaKodu !== arizaFiltre) return false
      if (takipFiltre && r.takipKodu !== takipFiltre) return false
      if (!q) return true
      return trNormalize(
        `${r.fisNo} ${r.firma} ${r.lokasyon} ${r.sonuc} ${r.teknisyen} ${r.bildirilen}`
      ).includes(q)
    })
  }, [veri, arama, firmaFiltre, teknisyenFiltre, arizaFiltre, takipFiltre])

  const toplamSayfa = Math.max(1, Math.ceil(filtreli.length / SAYFA_BOYUTU))
  const baslangic = (sayfa - 1) * SAYFA_BOYUTU
  const gorunen = filtreli.slice(baslangic, baslangic + SAYFA_BOYUTU)

  useEffect(() => { setSayfa(1) }, [arama, firmaFiltre, teknisyenFiltre, arizaFiltre, takipFiltre])

  const temizle = () => {
    setArama(''); setFirmaFiltre(''); setTeknisyenFiltre(''); setArizaFiltre(''); setTakipFiltre('')
  }

  const indirExcel = () => {
    const link = document.createElement('a')
    link.href = '/data/servis-raporlari.json'
    link.download = 'servis-raporlari.json'
    link.click()
  }

  if (yukleniyor) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyState
          icon={<Wrench size={32} strokeWidth={1.5} />}
          title="Servis raporları yükleniyor"
          description="11.000+ kayıt aktarılıyor, lütfen bekleyin…"
        />
      </div>
    )
  }

  if (hata) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyState
          icon={<Wrench size={32} strokeWidth={1.5} />}
          title="Veri yüklenemedi"
          description={hata}
        />
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Servis Raporları</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            <span className="tabular-nums">{filtreli.length.toLocaleString('tr-TR')}</span>
            {filtreli.length !== veri.length && (
              <> / <span className="tabular-nums">{veri.length.toLocaleString('tr-TR')}</span></>
            )} kayıt
          </p>
        </div>
        <Button variant="secondary" iconLeft={<Download size={14} strokeWidth={1.5} />} onClick={indirExcel}>
          JSON indir
        </Button>
      </div>

      {/* Filters */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
          <div style={{ gridColumn: 'span 2' }}>
            <Label>Arama</Label>
            <SearchInput
              value={arama}
              onChange={e => setArama(e.target.value)}
              placeholder="Fiş no, firma, lokasyon, sonuç, teknisyen…"
            />
          </div>
          <div>
            <Label>Firma</Label>
            <Select value={firmaFiltre} onChange={e => setFirmaFiltre(e.target.value)}>
              <option value="">Tümü</option>
              {firmalar.map(f => <option key={f} value={f}>{f}</option>)}
            </Select>
          </div>
          <div>
            <Label>Teknisyen</Label>
            <Select value={teknisyenFiltre} onChange={e => setTeknisyenFiltre(e.target.value)}>
              <option value="">Tümü</option>
              {teknisyenler.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <div>
            <Label>Arıza kodu</Label>
            <Select value={arizaFiltre} onChange={e => setArizaFiltre(e.target.value)}>
              <option value="">Tümü</option>
              {arizaKodlari.map(a => <option key={a} value={a}>{a}</option>)}
            </Select>
          </div>
          <div>
            <Label>Takip durumu</Label>
            <Select value={takipFiltre} onChange={e => setTakipFiltre(e.target.value)}>
              <option value="">Tümü</option>
              {takipDurumlari.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
        </div>
        {(arama || firmaFiltre || teknisyenFiltre || arizaFiltre || takipFiltre) && (
          <Button variant="tertiary" size="sm" onClick={temizle}>Filtreleri temizle</Button>
        )}
      </Card>

      {/* Table */}
      <Card padding={0} style={{ overflow: 'hidden' }}>
        {gorunen.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              title="Filtreye uyan kayıt yok"
              description="Arama veya filtre kriterlerini daraltmayı deneyin."
            />
          </div>
        ) : (
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr>
                  {['Fiş No', 'Takip', 'Firma', 'Lokasyon', 'Arıza', 'Sis.No', 'Teknisyen', 'Gid. Tarih', 'Sonuç'].map((h, i) => (
                    <th key={i} style={{
                      background: 'var(--surface-sunken)',
                      padding: '10px 12px',
                      textAlign: 'left',
                      font: '600 11px/16px var(--font-sans)',
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      borderBottom: '1px solid var(--border-default)',
                      whiteSpace: 'nowrap',
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gorunen.map(r => (
                  <tr key={r.i} style={{ transition: 'background 120ms' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '10px 12px', font: '400 13px/18px var(--font-sans)', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                      <CodeBadge>{r.fisNo}</CodeBadge>
                    </td>
                    <td style={{ padding: '10px 12px', font: '400 13px/18px var(--font-sans)', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                      {r.takipKodu && <Badge tone={takipTone(r.takipKodu)}>{r.takipKodu}</Badge>}
                    </td>
                    <td style={{ padding: '10px 12px', font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)' }}>
                      {r.firma}
                    </td>
                    <td style={{ padding: '10px 12px', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)' }}>
                      {r.lokasyon || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                      {r.arizaKodu || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                      {r.sisNo || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                      {r.teknisyen}
                    </td>
                    <td style={{ padding: '10px 12px', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                      {formatTarih(r.gidTarih)}
                    </td>
                    <td style={{ padding: '10px 12px', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)', maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.sonuc}>
                      {r.sonuc || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {filtreli.length > SAYFA_BOYUTU && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px',
            borderTop: '1px solid var(--border-default)',
            background: 'var(--surface-card)',
          }}>
            <span className="t-caption">
              {baslangic + 1}–{Math.min(baslangic + SAYFA_BOYUTU, filtreli.length)} / {filtreli.length.toLocaleString('tr-TR')}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button
                variant="secondary"
                size="sm"
                disabled={sayfa <= 1}
                onClick={() => setSayfa(s => Math.max(1, s - 1))}
                iconLeft={<ChevronLeft size={14} strokeWidth={1.5} />}
              >
                Önceki
              </Button>
              <span className="t-caption tabular-nums" style={{ minWidth: 80, textAlign: 'center' }}>
                Sayfa {sayfa} / {toplamSayfa}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={sayfa >= toplamSayfa}
                onClick={() => setSayfa(s => Math.min(toplamSayfa, s + 1))}
                iconRight={<ChevronRight size={14} strokeWidth={1.5} />}
              >
                Sonraki
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
