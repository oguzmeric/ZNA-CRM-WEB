import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Receipt, AlertTriangle, FileText } from 'lucide-react'
import { satislariGetir, satisSil } from '../services/satisService'
import { useConfirm } from '../context/ConfirmContext'
import { useToast } from '../context/ToastContext'
import {
  Button, SearchInput, Card, Badge, CodeBadge, KPICard, EmptyState,
} from '../components/ui'

const durumBadge = (durum, vadeTarihi) => {
  const bugun = new Date()
  bugun.setHours(0, 0, 0, 0)
  const g = durum === 'gonderildi' && vadeTarihi && new Date(vadeTarihi) < bugun ? 'gecikti' : durum
  const map = {
    taslak:     { label: 'Taslak',     tone: 'pasif' },
    gonderildi: { label: 'Gönderildi', tone: 'lead' },
    odendi:     { label: 'Ödendi',     tone: 'aktif' },
    gecikti:    { label: 'Gecikti',    tone: 'kayip' },
    iptal:      { label: 'İptal',      tone: 'neutral' },
  }
  return map[g] || map.taslak
}

const fmtTL = n => `₺${(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
const fmtTarih = t => t ? new Date(t).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const SEKMELER = [
  { id: 'hepsi',      label: 'Tümü' },
  { id: 'taslak',     label: 'Taslak' },
  { id: 'gonderildi', label: 'Gönderildi' },
  { id: 'odendi',     label: 'Ödendi' },
  { id: 'gecikti',    label: 'Gecikti' },
  { id: 'iptal',      label: 'İptal' },
]

export default function Satislar() {
  const navigate = useNavigate()
  const { confirm } = useConfirm()
  const { toast } = useToast()

  const [satislar, setSatislar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [aktifSekme, setAktifSekme] = useState('hepsi')
  const [arama, setArama] = useState('')

  useEffect(() => {
    satislariGetir().then(d => { setSatislar(d); setYukleniyor(false) })
  }, [])

  const bugun = new Date(); bugun.setHours(0, 0, 0, 0)

  const toplam   = satislar.reduce((s, f) => s + Number(f.genelToplam || 0), 0)
  const tahsil   = satislar.reduce((s, f) => s + Number(f.odenenToplam || 0), 0)
  const bekleyen = satislar.filter(f => f.durum !== 'iptal')
    .reduce((s, f) => s + (Number(f.genelToplam || 0) - Number(f.odenenToplam || 0)), 0)
  const gecikmis = satislar.filter(f =>
      f.durum !== 'odendi' && f.durum !== 'iptal' && f.vadeTarihi && new Date(f.vadeTarihi) < bugun)
    .reduce((s, f) => s + (Number(f.genelToplam || 0) - Number(f.odenenToplam || 0)), 0)

  const sekmeSayisi = (id) => {
    if (id === 'hepsi') return satislar.length
    if (id === 'gecikti') {
      return satislar.filter(f =>
        f.durum !== 'odendi' && f.durum !== 'iptal' && f.vadeTarihi && new Date(f.vadeTarihi) < bugun).length
    }
    return satislar.filter(f => f.durum === id).length
  }

  const gorunen = satislar.filter(f => {
    const match = !arama || `${f.faturaNo} ${f.firmaAdi}`.toLowerCase().includes(arama.toLowerCase())
    if (!match) return false
    if (aktifSekme === 'hepsi') return true
    if (aktifSekme === 'gecikti') {
      return f.durum !== 'odendi' && f.durum !== 'iptal' && f.vadeTarihi && new Date(f.vadeTarihi) < bugun
    }
    return f.durum === aktifSekme
  })

  const handleSil = async (id, faturaNo) => {
    const onay = await confirm({
      baslik: 'Faturayı Sil',
      mesaj: `${faturaNo} numaralı fatura kalıcı olarak silinecek. Emin misiniz?`,
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    await satisSil(id)
    setSatislar(prev => prev.filter(f => f.id !== id))
    toast.success('Fatura silindi.')
  }

  if (yukleniyor) return <div style={{ padding: 24 }}><EmptyState title="Yükleniyor…" /></div>

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Satış Faturaları</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            <span className="tabular-nums">{satislar.length}</span> fatura
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => navigate('/satislar/yeni')}>
          Yeni fatura
        </Button>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KPICard label="TOPLAM FATURALANAN" value={fmtTL(toplam)} icon={<Receipt size={16} strokeWidth={1.5} />} />
        <KPICard label="TAHSİL EDİLEN"       value={fmtTL(tahsil)}   footer={<span style={{ color: 'var(--success)' }}>Alındı</span>} />
        <KPICard label="BEKLEYEN"            value={fmtTL(bekleyen)} footer={<span style={{ color: 'var(--warning)' }}>Vade bekleniyor</span>} />
        <KPICard label="GECİKMİŞ"            value={fmtTL(gecikmis)} footer={gecikmis > 0 ? <><AlertTriangle size={12} strokeWidth={1.5} style={{ color: 'var(--danger)' }} /><span style={{ color: 'var(--danger)' }}>Tahsil edilmeli</span></> : <span style={{ color: 'var(--text-tertiary)' }}>Yok</span>} />
      </div>

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--border-default)', overflowX: 'auto' }}>
        {SEKMELER.map(s => {
          const sayi = sekmeSayisi(s.id)
          const aktif = aktifSekme === s.id
          return (
            <button
              key={s.id}
              onClick={() => setAktifSekme(s.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${aktif ? 'var(--brand-primary)' : 'transparent'}`,
                marginBottom: -1,
                color: aktif ? 'var(--brand-primary)' : 'var(--text-secondary)',
                font: aktif ? '600 13px/18px var(--font-sans)' : '500 13px/18px var(--font-sans)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {s.label}
              <span style={{
                minWidth: 18, height: 18, padding: '0 6px',
                borderRadius: 'var(--radius-pill)',
                background: aktif ? 'var(--brand-primary-soft)' : 'var(--surface-sunken)',
                color: aktif ? 'var(--brand-primary)' : 'var(--text-tertiary)',
                font: '500 11px/1 var(--font-sans)',
                fontVariantNumeric: 'tabular-nums',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {sayi}
              </span>
            </button>
          )
        })}
      </div>

      {/* Arama */}
      <div style={{ marginBottom: 16, maxWidth: 400 }}>
        <SearchInput
          value={arama}
          onChange={e => setArama(e.target.value)}
          placeholder="Fatura no veya firma adı ara…"
        />
      </div>

      {/* Tablo */}
      <Card padding={0} style={{ overflow: 'hidden' }}>
        {gorunen.length === 0 ? (
          <div style={{ padding: 40 }}>
            <EmptyState
              icon={<FileText size={32} strokeWidth={1.5} />}
              title={arama ? 'Arama sonucu bulunamadı' : 'Henüz fatura oluşturulmadı'}
              action={!arama && <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => navigate('/satislar/yeni')}>İlk faturayı oluştur</Button>}
            />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr>
                  {[
                    { l: 'Fatura No' },
                    { l: 'Müşteri / Firma' },
                    { l: 'Fatura Tarihi' },
                    { l: 'Vade' },
                    { l: 'Toplam', align: 'right' },
                    { l: 'Ödenen', align: 'right' },
                    { l: 'Kalan', align: 'right' },
                    { l: 'Durum' },
                    { l: '', align: 'right' },
                  ].map((h, i) => (
                    <th key={i} style={{
                      background: 'var(--surface-sunken)',
                      padding: '10px 14px',
                      textAlign: h.align || 'left',
                      font: '600 11px/16px var(--font-sans)',
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      borderBottom: '1px solid var(--border-default)',
                      whiteSpace: 'nowrap',
                    }}>{h.l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gorunen.map(f => {
                  const badge = durumBadge(f.durum, f.vadeTarihi)
                  const kalan = Number(f.genelToplam || 0) - Number(f.odenenToplam || 0)
                  const vadeGecti = f.vadeTarihi && new Date(f.vadeTarihi) < bugun
                    && f.durum !== 'odendi' && f.durum !== 'iptal'
                  return (
                    <tr key={f.id}
                      style={{ transition: 'background 120ms' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => navigate(`/satislar/${f.id}`)}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                        >
                          <CodeBadge>{f.faturaNo}</CodeBadge>
                        </button>
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', maxWidth: 300 }}>
                        <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {f.firmaAdi || '—'}
                        </div>
                        {f.musteriYetkili && (
                          <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {f.musteriYetkili}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {fmtTarih(f.faturaTarihi)}
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', font: '400 13px/18px var(--font-sans)', color: vadeGecti ? 'var(--danger)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {fmtTarih(f.vadeTarihi)}
                          {vadeGecti && <AlertTriangle size={11} strokeWidth={1.5} />}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', borderBottom: '1px solid var(--border-default)', font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                        {fmtTL(f.genelToplam)}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', borderBottom: '1px solid var(--border-default)', font: '400 13px/18px var(--font-sans)', color: 'var(--success)', whiteSpace: 'nowrap' }}>
                        {fmtTL(f.odenenToplam)}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', borderBottom: '1px solid var(--border-default)', font: '500 13px/18px var(--font-sans)', color: kalan > 0 ? 'var(--warning)' : 'var(--success)', whiteSpace: 'nowrap' }}>
                        {fmtTL(kalan)}
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          <button
                            aria-label="Düzenle"
                            onClick={() => navigate(`/satislar/${f.id}`)}
                            style={{
                              width: 28, height: 28,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              background: 'transparent', border: '1px solid var(--border-default)',
                              borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                          >
                            <Pencil size={12} strokeWidth={1.5} />
                          </button>
                          <button
                            aria-label="Sil"
                            onClick={() => handleSil(f.id, f.faturaNo)}
                            style={{
                              width: 28, height: 28,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              background: 'transparent', border: '1px solid var(--border-default)',
                              borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                          >
                            <Trash2 size={12} strokeWidth={1.5} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
