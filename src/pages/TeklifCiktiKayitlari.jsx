// Teklif Çıktı Kayıtları (admin) — hangi teklif kaç kere, kim tarafından, hangi yolla
// çıktı alınmış tek merkezden görülür. Kaynak: teklif_cikti_loglari (mig 158), değiştirilemez.
// Loglama bugünden (mig 158 deploy) itibaren birikir; daha eski çıktılar kayıtta yok.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Printer, FileText, FileSpreadsheet, Search, X } from 'lucide-react'
import { Card, Table, THead, TBody, TR, TH, TD, Badge, EmptyState, Input, Select, Label, Button } from '../components/ui'
import { tumCiktiLoglariGetir, ISLEM_ISIMLERI } from '../services/teklifCiktiLogService'

const ISLEM_ICON = { yazdir: Printer, pdf: FileText, excel: FileSpreadsheet }

function tarihSaat(t) {
  if (!t) return '—'
  const d = new Date(t)
  return `${d.toLocaleDateString('tr-TR')} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
}

export default function TeklifCiktiKayitlari() {
  const navigate = useNavigate()
  const [loglar, setLoglar] = useState(null) // null = yükleniyor
  const [arama, setArama] = useState('')
  const [kisiFiltre, setKisiFiltre] = useState('')
  const [islemFiltre, setIslemFiltre] = useState('')
  const [taslakFiltre, setTaslakFiltre] = useState('') // '' | 'taslak' | 'onayli'
  const [baslangic, setBaslangic] = useState('')
  const [bitis, setBitis] = useState('')

  useEffect(() => {
    tumCiktiLoglariGetir({ limit: 2000 }).then(setLoglar).catch(() => setLoglar([]))
  }, [])

  // Kişi filtresi seçenekleri — loglarda geçen benzersiz adlar
  const kisiler = useMemo(() => {
    const set = new Map()
    ;(loglar || []).forEach(l => { if (l.kullaniciAd) set.set(l.kullaniciId ?? l.kullaniciAd, l.kullaniciAd) })
    return [...set.entries()].map(([id, ad]) => ({ id: String(id), ad })).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
  }, [loglar])

  const filtreli = useMemo(() => {
    if (!loglar) return []
    const q = arama.trim().toLocaleLowerCase('tr')
    const b0 = baslangic ? new Date(baslangic + 'T00:00:00').getTime() : null
    const b1 = bitis ? new Date(bitis + 'T23:59:59').getTime() : null
    return loglar.filter(l => {
      if (islemFiltre && l.islem !== islemFiltre) return false
      if (taslakFiltre === 'taslak' && !l.taslak) return false
      if (taslakFiltre === 'onayli' && l.taslak) return false
      if (kisiFiltre && String(l.kullaniciId ?? l.kullaniciAd) !== kisiFiltre) return false
      if (b0 || b1) {
        const t = new Date(l.olusturmaTarih).getTime()
        if (b0 && t < b0) return false
        if (b1 && t > b1) return false
      }
      if (q) {
        const hay = `${l.teklifNo || ''} ${l.kullaniciAd || ''}`.toLocaleLowerCase('tr')
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [loglar, arama, kisiFiltre, islemFiltre, taslakFiltre, baslangic, bitis])

  // Özet KPI'lar (filtreli küme üzerinden)
  const ozet = useMemo(() => {
    const toplam = filtreli.length
    const taslak = filtreli.filter(l => l.taslak).length
    const teklifSayac = {}
    const kisiSayac = {}
    filtreli.forEach(l => {
      if (l.teklifNo) teklifSayac[l.teklifNo] = (teklifSayac[l.teklifNo] || 0) + 1
      if (l.kullaniciAd) kisiSayac[l.kullaniciAd] = (kisiSayac[l.kullaniciAd] || 0) + 1
    })
    const enCokTeklif = Object.entries(teklifSayac).sort((a, b) => b[1] - a[1])[0]
    const enCokKisi = Object.entries(kisiSayac).sort((a, b) => b[1] - a[1])[0]
    return {
      toplam, taslak,
      benzersizTeklif: Object.keys(teklifSayac).length,
      enCokTeklif, enCokKisi,
    }
  }, [filtreli])

  const filtreVar = arama || kisiFiltre || islemFiltre || taslakFiltre || baslangic || bitis
  const temizle = () => {
    setArama(''); setKisiFiltre(''); setIslemFiltre(''); setTaslakFiltre(''); setBaslangic(''); setBitis('')
  }

  return (
    <div style={{ padding: 24, maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ marginBottom: 4 }}>
        <h1 className="t-h1" style={{ margin: 0 }}>Teklif Çıktı Kayıtları</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
          Hangi teklif kaç kere, kim tarafından, hangi yolla çıktı alınmış — değiştirilemez kayıt.
          Loglama sistemin bu özelliği eklendiği andan (bugün) itibaren birikir.
        </p>
      </div>

      {/* Özet şeridi */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: '16px 0' }}>
        <Card style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Toplam çıktı</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>{ozet.toplam}</div>
        </Card>
        <Card style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Taslak (onaysız) çıktı</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: ozet.taslak > 0 ? '#d97706' : 'var(--text-primary)' }}>{ozet.taslak}</div>
        </Card>
        <Card style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>En çok çıktı alınan teklif</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            {ozet.enCokTeklif ? `${ozet.enCokTeklif[0]} · ${ozet.enCokTeklif[1]}×` : '—'}
          </div>
        </Card>
        <Card style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>En çok çıktı alan kişi</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            {ozet.enCokKisi ? `${ozet.enCokKisi[0]} · ${ozet.enCokKisi[1]}×` : '—'}
          </div>
        </Card>
      </div>

      {/* Filtreler */}
      <Card style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
          <div>
            <Label>Ara (teklif no / kişi)</Label>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <Input value={arama} onChange={e => setArama(e.target.value)} placeholder="TEK-0606 / ad" style={{ paddingLeft: 30 }} />
            </div>
          </div>
          <div>
            <Label>Çıktıyı alan</Label>
            <Select value={kisiFiltre} onChange={e => setKisiFiltre(e.target.value)}>
              <option value="">Herkes</option>
              {kisiler.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
            </Select>
          </div>
          <div>
            <Label>İşlem</Label>
            <Select value={islemFiltre} onChange={e => setIslemFiltre(e.target.value)}>
              <option value="">Tümü</option>
              <option value="yazdir">Yazdırma</option>
              <option value="pdf">PDF indirme</option>
              <option value="excel">Excel indirme</option>
            </Select>
          </div>
          <div>
            <Label>Onay durumu</Label>
            <Select value={taslakFiltre} onChange={e => setTaslakFiltre(e.target.value)}>
              <option value="">Tümü</option>
              <option value="onayli">Onaylı çıktı</option>
              <option value="taslak">Taslak (onaysız)</option>
            </Select>
          </div>
          <div>
            <Label>Başlangıç</Label>
            <Input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)} />
          </div>
          <div>
            <Label>Bitiş</Label>
            <Input type="date" value={bitis} onChange={e => setBitis(e.target.value)} />
          </div>
        </div>
        {filtreVar && (
          <div style={{ marginTop: 10 }}>
            <Button variant="tertiary" size="sm" onClick={temizle}><X size={14} /> Filtreleri temizle</Button>
          </div>
        )}
      </Card>

      {/* Liste */}
      {loglar === null ? (
        <Card style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</Card>
      ) : filtreli.length === 0 ? (
        <EmptyState
          title={loglar.length === 0 ? 'Henüz çıktı kaydı yok' : 'Filtreye uyan kayıt yok'}
          description={loglar.length === 0
            ? 'Bir teklif Yazdır / PDF / Excel olarak çıktı alındığında burada listelenir.'
            : 'Filtreleri gevşetmeyi deneyin.'}
        />
      ) : (
        <Card style={{ padding: 0, overflowX: 'auto' }}>
          <Table>
            <THead>
              <TR>
                <TH>Tarih / Saat</TH>
                <TH>Teklif No</TH>
                <TH>İşlem</TH>
                <TH>Çıktıyı alan</TH>
                <TH>Durum</TH>
              </TR>
            </THead>
            <TBody>
              {filtreli.map(l => {
                const Icon = ISLEM_ICON[l.islem] || FileText
                return (
                  <TR key={l.id}>
                    <TD style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                      {tarihSaat(l.olusturmaTarih)}
                    </TD>
                    <TD>
                      {l.teklifId ? (
                        <button
                          onClick={() => navigate(`/teklifler/${l.teklifId}`)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                            fontFamily: 'monospace', fontSize: 12.5, fontWeight: 700,
                            color: 'var(--brand)', letterSpacing: 0.3,
                          }}
                          title="Teklif detayına git"
                        >
                          {l.teklifNo || `#${l.teklifId}`}
                        </button>
                      ) : (
                        <span style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{l.teklifNo || '—'}</span>
                      )}
                    </TD>
                    <TD>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                        <Icon size={14} /> {ISLEM_ISIMLERI[l.islem] || l.islem}
                      </span>
                    </TD>
                    <TD><strong style={{ color: 'var(--text-primary)' }}>{l.kullaniciAd || '—'}</strong></TD>
                    <TD>
                      {l.taslak
                        ? <Badge tone="uyari">Taslak filigranlı</Badge>
                        : <Badge tone="basarili">Onaylı</Badge>}
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </Card>
      )}

      {loglar && filtreli.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'right' }}>
          {filtreli.length} kayıt gösteriliyor{filtreVar ? ` (toplam ${loglar.length})` : ''}
        </div>
      )}
    </div>
  )
}
