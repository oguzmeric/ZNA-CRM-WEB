// Müşteri portalı — "Cihazlarım": SN'li cihaz envanteri, lokasyon ve durum.
// Kaynak: portal_cihazlarim görünümü (mig 298). Cihaz şifresi/IP/MAC GELMEZ.
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, HardDrive, MapPin, Search, AlertTriangle, RefreshCcw, Hash,
} from 'lucide-react'
import { portalCihazlariGetir, CIHAZ_DURUMLARI } from '../../services/portalCihazService'
import { SearchInput, Card, Badge, EmptyState, Button } from '../../components/ui'
import CustomSelect from '../../components/CustomSelect'

const trTarih = (d) => (d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

// Lokasyon etiketi: önce tanımlı lokasyon adı, yoksa serbest metin alt lokasyon
const lokasyonEtiketi = (c) => c.lokasyonAd || c.altLokasyon || null

export default function Cihazlarim() {
  const navigate = useNavigate()
  const [cihazlar, setCihazlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState('')
  const [arama, setArama] = useState('')
  const [seciliLokasyon, setSeciliLokasyon] = useState('hepsi')
  const [seciliDurum, setSeciliDurum] = useState('hepsi')

  // "Yenile" butonu için — kullanıcı eylemiyle çalışır
  const yukle = () => {
    setYukleniyor(true); setHata('')
    portalCihazlariGetir()
      .then(d => setCihazlar(d || []))
      .catch(e => setHata(e.message || 'Cihazlar yüklenemedi'))
      .finally(() => setYukleniyor(false))
  }

  // İlk yükleme — setState'ler promise İÇİNDE (effect gövdesinde senkron
  // setState cascade render'a yol açıyor); yukleniyor zaten true başlıyor.
  useEffect(() => {
    let iptal = false
    portalCihazlariGetir()
      .then(d => { if (!iptal) setCihazlar(d || []) })
      .catch(e => { if (!iptal) setHata(e.message || 'Cihazlar yüklenemedi') })
      .finally(() => { if (!iptal) setYukleniyor(false) })
    return () => { iptal = true }
  }, [])

  // Lokasyon listesi — sayılarıyla; lokasyonsuzlar ayrı seçenek
  const lokasyonlar = useMemo(() => {
    const h = new Map()
    let lokasyonsuz = 0
    for (const c of cihazlar) {
      const ad = lokasyonEtiketi(c)
      if (!ad) { lokasyonsuz++; continue }
      h.set(ad, (h.get(ad) || 0) + 1)
    }
    return {
      liste: [...h.entries()].sort((a, b) => b[1] - a[1]),
      lokasyonsuz,
    }
  }, [cihazlar])

  const durumlar = useMemo(() => {
    const h = new Map()
    for (const c of cihazlar) h.set(c.durum, (h.get(c.durum) || 0) + 1)
    return [...h.entries()].sort((a, b) => b[1] - a[1])
  }, [cihazlar])

  const filtreli = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr')
    return cihazlar.filter(c => {
      const aramaUygun = !q ||
        `${c.seriNo || ''} ${c.model || ''} ${c.marka || ''} ${c.urunAdi || ''} ${lokasyonEtiketi(c) || ''}`
          .toLocaleLowerCase('tr').includes(q)
      const lokUygun = seciliLokasyon === 'hepsi'
        || (seciliLokasyon === '__yok' ? !lokasyonEtiketi(c) : lokasyonEtiketi(c) === seciliLokasyon)
      const durumUygun = seciliDurum === 'hepsi' || c.durum === seciliDurum
      return aramaUygun && lokUygun && durumUygun
    })
  }, [cihazlar, arama, seciliLokasyon, seciliDurum])

  const filtreVar = arama.trim() !== '' || seciliLokasyon !== 'hepsi' || seciliDurum !== 'hepsi'
  const temizle = () => { setArama(''); setSeciliLokasyon('hepsi'); setSeciliDurum('hepsi') }

  // Servisteki cihaz sayısı — üstte uyarı şeridi olarak gösterilir
  const servisteki = cihazlar.filter(c => c.durum === 'arizali_depoda' || c.durum === 'teknisyende').length

  return (
    <div style={{ padding: 16, maxWidth: 1480, margin: '0 auto' }}>

      {/* Geri + başlık tek satır */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button
          onClick={() => navigate('/musteri-portal')}
          aria-label="Geri dön"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, flexShrink: 0,
            background: 'none', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)', padding: 0, cursor: 'pointer',
            color: 'var(--text-tertiary)',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-primary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
        >
          <ArrowLeft size={15} strokeWidth={1.6} />
        </button>
        <h1 className="t-h1" style={{ margin: 0 }}>Cihazlarım</h1>
      </div>

      {/* Serviste cihaz varsa uyarı şeridi */}
      {servisteki > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px', marginBottom: 10,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--warning-soft, rgba(245,158,11,0.12))',
          border: '1px solid var(--border-default)',
          font: '500 12.5px/17px var(--font-sans)', color: 'var(--text-secondary)',
        }}>
          <AlertTriangle size={14} strokeWidth={1.8} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <span><b>{servisteki}</b> cihazınız serviste. Durumunu aşağıdaki listeden takip edebilirsiniz.</span>
        </div>
      )}

      {/* Filtreler */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <SearchInput value={arama} onChange={e => setArama(e.target.value)}
            placeholder="Seri no, model veya lokasyon ara…" />
        </div>
        <div style={{ minWidth: 200 }}>
          <CustomSelect value={seciliLokasyon} onChange={e => setSeciliLokasyon(e.target.value)}>
            <option value="hepsi">Tüm lokasyonlar ({cihazlar.length})</option>
            {lokasyonlar.liste.map(([ad, adet]) => (
              <option key={ad} value={ad}>{ad} ({adet})</option>
            ))}
            {lokasyonlar.lokasyonsuz > 0 && (
              <option value="__yok">Lokasyon girilmemiş ({lokasyonlar.lokasyonsuz})</option>
            )}
          </CustomSelect>
        </div>
        <div style={{ minWidth: 180 }}>
          <CustomSelect value={seciliDurum} onChange={e => setSeciliDurum(e.target.value)}>
            <option value="hepsi">Tüm durumlar</option>
            {durumlar.map(([d, adet]) => (
              <option key={d} value={d}>{(CIHAZ_DURUMLARI[d]?.etiket || d)} ({adet})</option>
            ))}
          </CustomSelect>
        </div>
      </div>

      {/* Sonuç şeridi */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10,
        font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)',
      }}>
        <span><b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{filtreli.length}</b> cihaz</span>
        {filtreVar && (
          <button type="button" onClick={temizle}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--brand-primary)', font: '500 12px/16px var(--font-sans)',
            }}>
            Filtreleri temizle
          </button>
        )}
        <button type="button" onClick={yukle} disabled={yukleniyor}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto',
            background: 'none', border: 'none', padding: 0,
            cursor: yukleniyor ? 'default' : 'pointer',
            color: 'var(--text-tertiary)', font: '500 12px/16px var(--font-sans)',
          }}>
          <RefreshCcw size={12} strokeWidth={1.8} /> Yenile
        </button>
      </div>

      {hata ? (
        <EmptyState
          icon={<AlertTriangle size={30} strokeWidth={1.5} />}
          title="Cihaz listesi alınamadı"
          description={hata}
          action={<Button variant="secondary" onClick={yukle}>Tekrar dene</Button>}
        />
      ) : yukleniyor ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="shimmer" style={{
              height: 116, borderRadius: 'var(--radius-md)',
              background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
            }} />
          ))}
        </div>
      ) : filtreli.length === 0 ? (
        <EmptyState
          icon={<HardDrive size={30} strokeWidth={1.5} />}
          title={filtreVar ? 'Bu filtrelerle cihaz bulunamadı' : 'Kayıtlı cihazınız görünmüyor'}
          description={filtreVar
            ? 'Arama veya filtre seçimini genişletmeyi deneyin.'
            : 'Sahada devreye alınan cihazlarınız seri numarasıyla kaydedildikçe burada listelenir.'}
          action={filtreVar ? <Button variant="secondary" onClick={temizle}>Filtreleri temizle</Button> : undefined}
        />
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10,
          maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', paddingRight: 4,
        }}>
          {filtreli.map(c => {
            const durum = CIHAZ_DURUMLARI[c.durum] || { etiket: c.durum, tone: 'neutral' }
            const lok = lokasyonEtiketi(c)
            return (
              <Card key={c.id} padding={0}>
                <div style={{ padding: '11px 12px' }}>
                  {/* Model + durum */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {c.model || c.urunAdi || 'Cihaz'}
                      </div>
                      {c.marka && (
                        <div className="t-caption" style={{ marginTop: 1 }}>{c.marka}</div>
                      )}
                    </div>
                    <Badge tone={durum.tone}>{durum.etiket}</Badge>
                  </div>

                  {/* Seri no */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 5, marginTop: 8,
                    font: '500 11.5px/16px var(--font-mono, var(--font-sans))',
                    color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums',
                  }}>
                    <Hash size={11} strokeWidth={2} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.seriNo}
                    </span>
                  </div>

                  {/* Lokasyon */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 5, marginTop: 4,
                    font: '400 12px/16px var(--font-sans)',
                    color: lok ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                  }}>
                    <MapPin size={11} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lok || 'Lokasyon girilmemiş'}
                    </span>
                  </div>
                  {c.kanalNo != null && (
                    <div className="t-caption" style={{ marginTop: 2 }}>Kanal {c.kanalNo}</div>
                  )}

                  {/* Tarihler */}
                  <div style={{
                    display: 'flex', gap: 10, marginTop: 8, paddingTop: 8,
                    borderTop: '1px solid var(--border-default)',
                    font: '400 11px/15px var(--font-sans)', color: 'var(--text-tertiary)',
                  }}>
                    <span>Kurulum: {trTarih(c.takilmaTarihi)}</span>
                    {c.garantiBitisTarihi && <span>Garanti: {trTarih(c.garantiBitisTarihi)}</span>}
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
