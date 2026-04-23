import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, MapPin, User, Clock, Calendar, MessageSquare, Inbox } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useServisTalebi } from '../../context/ServisTalebiContext'
import CustomSelect from '../../components/CustomSelect'
import { Button, SearchInput, Card, Badge, CodeBadge, EmptyState } from '../../components/ui'

const ACIL_TONE = { acil: 'kayip', yuksek: 'beklemede', normal: 'lead', dusuk: 'neutral' }
const DURUM_TONE = {
  bekliyor: 'pasif', inceleniyor: 'beklemede', atandi: 'lead',
  devam_ediyor: 'beklemede', tamamlandi: 'aktif', iptal: 'kayip',
}

export default function Taleplerim() {
  const { kullanici } = useAuth()
  const { musteriTalepleri, ANA_TURLER, DURUM_LISTESI, ACILIYET_SEVIYELERI } = useServisTalebi()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [aramaMetni, setAramaMetni] = useState('')
  const [durumFiltre, setDurumFiltre] = useState(searchParams.get('durum') || 'tumu')
  const [turFiltre, setTurFiltre] = useState('tumu')

  const talepler = musteriTalepleri(kullanici?.id)

  const filtrelenmis = talepler.filter(t => {
    if (aramaMetni && !t.konu.toLowerCase().includes(aramaMetni.toLowerCase()) && !t.talepNo.toLowerCase().includes(aramaMetni.toLowerCase())) return false
    if (durumFiltre === 'bekliyor' && t.durum !== 'bekliyor') return false
    if (durumFiltre === 'devam' && !['inceleniyor', 'atandi', 'devam_ediyor'].includes(t.durum)) return false
    if (durumFiltre === 'tamamlandi' && t.durum !== 'tamamlandi') return false
    if (!['tumu', 'bekliyor', 'devam', 'tamamlandi'].includes(durumFiltre) && t.durum !== durumFiltre) return false
    if (turFiltre !== 'tumu' && t.anaTur !== turFiltre) return false
    return true
  }).sort((a, b) => new Date(b.olusturmaTarihi) - new Date(a.olusturmaTarihi))

  const tarihFormat = (tarih) => new Date(tarih).toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Taleplerim</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            Toplam <span className="tabular-nums">{talepler.length}</span> talep · <span className="tabular-nums">{filtrelenmis.length}</span> gösteriliyor
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => navigate('/musteri-portal/yeni-talep')}>
          Yeni talep
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 200px', gap: 12, minWidth: 0 }}>
          <SearchInput
            value={aramaMetni}
            onChange={e => setAramaMetni(e.target.value)}
            placeholder="Talep numarası veya konu ara…"
          />
          <CustomSelect value={durumFiltre} onChange={e => setDurumFiltre(e.target.value)}>
            <option value="tumu">Tüm durumlar</option>
            <option value="bekliyor">Bekleyen</option>
            <option value="devam">Devam eden</option>
            <option value="tamamlandi">Tamamlanan</option>
            <option value="iptal">İptal</option>
          </CustomSelect>
          <CustomSelect value={turFiltre} onChange={e => setTurFiltre(e.target.value)}>
            <option value="tumu">Tüm türler</option>
            {ANA_TURLER.map(t => <option key={t.id} value={t.id}>{t.isim}</option>)}
          </CustomSelect>
        </div>
      </Card>

      {filtrelenmis.length === 0 ? (
        <EmptyState icon={<Inbox size={32} strokeWidth={1.5} />} title="Gösterilecek talep bulunamadı" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtrelenmis.map(talep => {
            const anaTur = ANA_TURLER.find(t => t.id === talep.anaTur)
            const durum = DURUM_LISTESI.find(d => d.id === talep.durum)
            const aciliyet = ACILIYET_SEVIYELERI.find(a => a.id === talep.aciliyet)

            return (
              <Card
                key={talep.id}
                onClick={() => navigate(`/musteri-portal/talep/${talep.id}`)}
                style={{
                  cursor: 'pointer',
                  borderLeft: `3px solid ${talep.aciliyet === 'acil' ? 'var(--danger)' : 'var(--border-default)'}`,
                  transition: 'background 120ms',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-card)'}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{
                    width: 40, height: 40,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--brand-primary-soft)',
                    color: 'var(--brand-primary)',
                    borderRadius: 'var(--radius-sm)',
                    flexShrink: 0,
                    font: '600 14px/1 var(--font-sans)',
                  }}>
                    {anaTur?.isim?.charAt(0) || '·'}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                          <CodeBadge>{talep.talepNo}</CodeBadge>
                          {anaTur && <Badge tone="brand">{anaTur.isim}</Badge>}
                          {aciliyet && <Badge tone={ACIL_TONE[aciliyet.id]}>{aciliyet.isim}</Badge>}
                        </div>
                        <p style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>
                          {talep.konu}
                        </p>
                        {talep.lokasyon && (
                          <p style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                            <MapPin size={11} strokeWidth={1.5} /> {talep.lokasyon}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                        {durum && <Badge tone={DURUM_TONE[durum.id]}>{durum.isim}</Badge>}
                        {talep.atananKullaniciAd && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                            <User size={11} strokeWidth={1.5} /> {talep.atananKullaniciAd}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                        <Clock size={11} strokeWidth={1.5} /> {tarihFormat(talep.olusturmaTarihi)}
                      </span>
                      {talep.planliTarih && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '400 11px/16px var(--font-sans)', color: 'var(--warning)', fontVariantNumeric: 'tabular-nums' }}>
                          <Calendar size={11} strokeWidth={1.5} /> Planlı: {new Date(talep.planliTarih).toLocaleDateString('tr-TR')}
                        </span>
                      )}
                      {talep.notlar?.length > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '400 11px/16px var(--font-sans)', color: 'var(--brand-primary)' }}>
                          <MessageSquare size={11} strokeWidth={1.5} /> <span className="tabular-nums">{talep.notlar.length}</span> not
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
