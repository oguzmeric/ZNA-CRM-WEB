// Sipariş Detay — sipariş bilgileri + kalemler + kaynak bağlantısı.

import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, ShoppingCart, Building2, User, Calendar, Package, ExternalLink } from 'lucide-react'
import { Card, CardTitle, Button, Badge, EmptyState } from '../components/ui'
import {
  siparisGetir, kalemleriGetir, SIPARIS_DURUMLARI, kalemAraToplam, kalemlerToplam,
} from '../services/siparisService'
import { musteriGetir } from '../services/musteriService'
import { gorusmeGetir } from '../services/gorusmeService'

const fmtPara = (n, pb = 'TL') => {
  const num = Number(n || 0)
  const sembol = pb === 'TL' ? '₺' : pb === 'USD' ? '$' : pb === 'EUR' ? '€' : pb
  return `${sembol} ${num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Tarih + saat (onay, timestamp'ler için)
const fmtTarih = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  } catch { return iso }
}
// Sadece tarih (görüşme tarihi gibi date alanları için — saatsiz)
const fmtSadeceTarih = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`
  } catch { return iso }
}

export default function SiparisDetay() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [siparis, setSiparis] = useState(null)
  const [kalemler, setKalemler] = useState([])
  const [musteri, setMusteri] = useState(null)
  const [gorusme, setGorusme] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)

  useEffect(() => {
    (async () => {
      setYukleniyor(true)
      try {
        const s = await siparisGetir(id)
        if (!s) { setSiparis(null); return }
        setSiparis(s)
        const [k, m, g] = await Promise.all([
          kalemleriGetir(s.id),
          s.musteriId ? musteriGetir(s.musteriId) : Promise.resolve(null),
          s.gorusmeId ? gorusmeGetir(s.gorusmeId) : Promise.resolve(null),
        ])
        setKalemler(k || [])
        setMusteri(m)
        setGorusme(g)
      } catch (e) {
        console.error('[siparis detay]', e)
      } finally { setYukleniyor(false) }
    })()
  }, [id])

  const toplam = useMemo(() => kalemlerToplam(kalemler, siparis?.genelIskonto), [kalemler, siparis?.genelIskonto])

  if (yukleniyor) return <div style={{ padding: 24, color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
  if (!siparis) return (
    <div style={{ padding: 24 }}>
      <EmptyState
        title="Sipariş bulunamadı"
        icon={<Package size={32} />}
        action={<Button variant="secondary" onClick={() => navigate('/siparisler')}>← Siparişlere dön</Button>}
      />
    </div>
  )

  const durumObj = SIPARIS_DURUMLARI.find(d => d.id === siparis.durum)
  const isTeklif = siparis.kaynakTipi === 'teklif'

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Üst bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Button variant="ghost" iconLeft={<ArrowLeft size={14} />} onClick={() => navigate('/siparisler')}>Geri</Button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, fontFamily: 'monospace' }}>{siparis.siparisNo}</h1>
            <Badge style={{ background: `${durumObj?.renk}22`, color: durumObj?.renk, border: `1px solid ${durumObj?.renk}55` }}>
              {durumObj?.isim || siparis.durum}
            </Badge>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
              background: isTeklif ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)',
              color: isTeklif ? '#3b82f6' : '#10b981',
            }}>
              {isTeklif ? <FileText size={11} /> : <ShoppingCart size={11} />}
              {isTeklif ? 'TEKLİFTEN' : 'ÖN SİPARİŞTEN'}
            </span>
          </div>
          {gorusme?.gorusmeNo && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-tertiary)' }}>
              <button
                onClick={() => navigate(`/gorusmeler/${gorusme.id}`)}
                style={{
                  fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
                  color: '#3b82f6', padding: '2px 6px',
                  background: 'rgba(59,130,246,0.10)', borderRadius: 4,
                  border: 'none', cursor: 'pointer',
                }}
                title="Kaynak görüşmeye git"
              >{gorusme.gorusmeNo}</button>
              <span>Kaynak görüşme</span>
              {gorusme.tarih && <>· {fmtSadeceTarih(gorusme.tarih)}</>}
              {gorusme.gorusen && <>· {gorusme.gorusen}</>}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 16 }}>
        {/* Sol: kalemler */}
        <Card>
          <CardTitle style={{ marginBottom: 12 }}>Kalemler ({kalemler.length})</CardTitle>
          {kalemler.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--text-tertiary)', textAlign: 'center' }}>Kalem yok</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-tertiary)' }}>
                    <th style={{ textAlign: 'left', padding: 8, fontWeight: 500 }}>Ürün</th>
                    <th style={{ textAlign: 'right', padding: 8, fontWeight: 500, width: 70 }}>Miktar</th>
                    <th style={{ textAlign: 'right', padding: 8, fontWeight: 500, width: 100 }}>Birim ₺</th>
                    <th style={{ textAlign: 'right', padding: 8, fontWeight: 500, width: 60 }}>İsk %</th>
                    <th style={{ textAlign: 'right', padding: 8, fontWeight: 500, width: 60 }}>KDV %</th>
                    <th style={{ textAlign: 'right', padding: 8, fontWeight: 500, width: 110 }}>Ara Toplam</th>
                  </tr>
                </thead>
                <tbody>
                  {kalemler.map(k => {
                    const at = kalemAraToplam(k)
                    return (
                      <tr key={k.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: 8 }}>
                          <div style={{ fontWeight: 600 }}>{k.urunAd}</div>
                          {(k.stokKodu || k.urunMarka) && (
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                              {k.stokKodu && <span style={{ fontFamily: 'monospace' }}>{k.stokKodu}</span>}
                              {k.stokKodu && k.urunMarka && ' · '}
                              {k.urunMarka}
                            </div>
                          )}
                          {k.aciklama && (
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{k.aciklama}</div>
                          )}
                        </td>
                        <td style={{ padding: 8, textAlign: 'right' }}>{Number(k.miktar || 0)} {k.birim}</td>
                        <td style={{ padding: 8, textAlign: 'right' }}>{fmtPara(k.birimFiyat, siparis.paraBirimi)}</td>
                        <td style={{ padding: 8, textAlign: 'right' }}>{Number(k.iskontoOrani || 0)}</td>
                        <td style={{ padding: 8, textAlign: 'right' }}>{Number(k.kdvOrani || 0)}</td>
                        <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{fmtPara(at, siparis.paraBirimi)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Toplamlar */}
          {kalemler.length > 0 && (
            <div style={{ marginTop: 16, padding: 12, background: 'var(--surface-subtle)', borderRadius: 8, display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Ara Toplam</span>
                <span>{fmtPara(toplam.araToplam, siparis.paraBirimi)}</span>
              </div>
              {Number(siparis.genelIskonto) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>Genel İskonto</span>
                  <span>−{fmtPara(siparis.genelIskonto, siparis.paraBirimi)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>KDV Toplamı</span>
                <span>{fmtPara(toplam.kdvToplam, siparis.paraBirimi)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, borderTop: '1px solid var(--border-default)', paddingTop: 6, marginTop: 4 }}>
                <span>Genel Toplam</span>
                <span style={{ color: 'var(--accent, #1E5AA8)' }}>{fmtPara(siparis.genelToplam || toplam.genelToplam, siparis.paraBirimi)}</span>
              </div>
            </div>
          )}
        </Card>

        {/* Sağ: bilgiler */}
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          {/* Müşteri */}
          <Card style={{ padding: 16 }}>
            <CardTitle style={{ marginBottom: 8 }}><Building2 size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} /> Müşteri</CardTitle>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{musteri?.firma || musteri?.ad || '—'}</div>
            {musteri?.ad && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{musteri.ad}</div>}
            {musteri?.telefon && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{musteri.telefon}</div>}
            {musteri && (
              <Button variant="ghost" size="sm" onClick={() => navigate(`/musteriler/${musteri.id}`)} style={{ marginTop: 8 }}>
                Müşteri Kartı →
              </Button>
            )}
          </Card>

          {/* Onay bilgileri */}
          <Card style={{ padding: 16 }}>
            <CardTitle style={{ marginBottom: 8 }}><User size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} /> Onay</CardTitle>
            <div style={{ fontSize: 13, marginBottom: 4 }}>
              <strong>{siparis.onaylayanAd || '—'}</strong>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
              <Calendar size={11} style={{ display: 'inline', verticalAlign: -1, marginRight: 3 }} />
              {fmtTarih(siparis.onayTarihi)}
            </div>
            {siparis.imzaUrl && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>İmza:</div>
                <img src={siparis.imzaUrl} alt="İmza" style={{ maxHeight: 60, border: '1px solid var(--border-default)', borderRadius: 4, background: '#fff' }} />
              </div>
            )}
          </Card>

          {/* Kaynak — sadece tekliftense göster (görüşme linki üstte zaten tıklanabilir) */}
          {isTeklif && siparis.teklifId && (
            <Card style={{ padding: 16 }}>
              <CardTitle style={{ marginBottom: 8 }}>Kaynak Teklif</CardTitle>
              <Button
                variant="secondary" size="sm" iconLeft={<FileText size={13} />}
                onClick={() => navigate(`/teklifler/${siparis.teklifId}`)}
              >
                Teklife git <ExternalLink size={12} style={{ marginLeft: 4 }} />
              </Button>
            </Card>
          )}

          {siparis.notlar && (
            <Card style={{ padding: 16 }}>
              <CardTitle style={{ marginBottom: 8 }}>Notlar</CardTitle>
              <div style={{ fontSize: 13 }}>{siparis.notlar}</div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
