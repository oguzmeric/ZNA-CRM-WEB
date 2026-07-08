// Stok sayım modu — sayım oluştur, SN taratıp tikle, eksik/fazla raporu.
import { useEffect, useRef, useState } from 'react'
import { ClipboardCheck, ScanLine, Play, CheckSquare } from 'lucide-react'
import { sayimBaslat, sayimSNTara, sayimOzet, sayimBitir, sonSayimlar } from '../services/depoService'
import { Card, Button, Badge, EmptyState, Table, THead, TBody, TR, TH, TD, CodeBadge } from '../components/ui'
import { SkeletonList } from '../components/Skeleton'
import { useToast } from '../context/ToastContext'

const fmtTarih = (t) => t ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export default function StokSayim() {
  const { toast } = useToast()
  const [aktifSayim, setAktifSayim] = useState(null)
  const [ozet, setOzet] = useState(null)
  const [taramaBuf, setTaramaBuf] = useState('')
  const [gecmis, setGecmis] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const inputRef = useRef(null)

  const gecmisiYukle = () =>
    sonSayimlar(20).then(list => {
      setGecmis(list)
      const acik = (list || []).find(s => !s.tamamlandi)
      if (acik) { setAktifSayim(acik); ozetYukle(acik.id) }
    }).finally(() => setYukleniyor(false))

  useEffect(() => { gecmisiYukle() }, [])

  const ozetYukle = async (sid) => {
    const o = await sayimOzet(sid)
    setOzet(o)
  }

  const sayimBaslatAksiyon = async () => {
    const aciklama = prompt('Sayım açıklaması (opsiyonel):') || ''
    const s = await sayimBaslat(aciklama)
    setAktifSayim(s)
    await ozetYukle(s.id)
    inputRef.current?.focus()
  }

  const taramaOku = async (e) => {
    const val = e.target.value
    setTaramaBuf(val)
    if (!val.includes('\n')) return
    // Barkod scanner Enter geldi
    const sn = val.split(/\r?\n/)[0].trim()
    setTaramaBuf('')
    if (!sn) return
    const sonuc = await sayimSNTara(aktifSayim.id, sn)
    if (sonuc.ok) {
      if (sonuc.reason === 'tarandi') toast.success(`✓ ${sn} taransı işlendi`)
      else if (sonuc.reason === 'zaten_tarandi') toast.info(`Zaten tarandı: ${sn}`)
      else if (sonuc.reason === 'fazladan') toast.warn(`Sayım listesinde yoktu, "fazladan" olarak eklendi: ${sn}`)
    } else {
      if (sonuc.reason === 'bulunamadi') toast.error(`SN bulunamadı: ${sn}`)
      else if (sonuc.reason === 'silinmis') toast.error(`Silinmiş SN: ${sn}`)
    }
    await ozetYukle(aktifSayim.id)
  }

  const sayimBitirAksiyon = async () => {
    if (!confirm(`Sayım bitirilsin mi? ${ozet.tarandi}/${ozet.toplam} tarandı, ${ozet.eksik.length} eksik.`)) return
    await sayimBitir(aktifSayim.id)
    toast.success('Sayım kapatıldı.')
    setAktifSayim(null); setOzet(null)
    await gecmisiYukle()
  }

  if (yukleniyor) return <SkeletonList />

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ClipboardCheck size={22} strokeWidth={1.5} />
          <h1 className="t-h2" style={{ margin: 0 }}>Stok Sayım</h1>
        </div>
        {!aktifSayim && (
          <Button variant="primary" iconLeft={<Play size={13} />} onClick={sayimBaslatAksiyon}>
            Yeni Sayım Başlat
          </Button>
        )}
      </div>

      {aktifSayim && ozet && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Aktif Sayım</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>#{aktifSayim.id}{aktifSayim.aciklama ? ` — ${aktifSayim.aciklama}` : ''}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Başlatıldı: {fmtTarih(aktifSayim.olusturuldu)}</div>
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                <div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Toplam</div><div style={{ fontWeight: 700, fontSize: 22 }}>{ozet.toplam}</div></div>
                <div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Tarandı</div><div style={{ fontWeight: 700, fontSize: 22, color: 'var(--success)' }}>{ozet.tarandi}</div></div>
                <div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Eksik</div><div style={{ fontWeight: 700, fontSize: 22, color: 'var(--danger)' }}>{ozet.eksik.length}</div></div>
              </div>
              <Button variant="secondary" size="sm" iconLeft={<CheckSquare size={13} />} onClick={sayimBitirAksiyon}>
                Sayımı Bitir
              </Button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--surface-sunken)', borderRadius: 8 }}>
              <ScanLine size={16} strokeWidth={1.5} />
              <textarea
                ref={inputRef}
                autoFocus
                rows={1}
                value={taramaBuf}
                onChange={taramaOku}
                placeholder="Barkod okut veya SN yaz + Enter…"
                style={{
                  flex: 1, border: 'none', background: 'transparent', color: 'var(--text-primary)',
                  fontFamily: 'monospace', fontSize: 14, outline: 'none', resize: 'none',
                }}
              />
            </div>
          </Card>

          {ozet.eksik.length > 0 && (
            <Card style={{ marginBottom: 16 }}>
              <h3 className="t-h2" style={{ fontSize: 14, marginBottom: 12, color: 'var(--danger)' }}>Eksik ({ozet.eksik.length})</h3>
              <Table>
                <THead><TR><TH>SN</TH><TH>Stok Kodu</TH><TH>Marka/Model</TH></TR></THead>
                <TBody>
                  {ozet.eksik.slice(0, 100).map(e => (
                    <TR key={e.id}>
                      <TD><CodeBadge>{e.kalem?.seri_no || '—'}</CodeBadge></TD>
                      <TD>{e.kalem?.stok_kodu}</TD>
                      <TD>{[e.kalem?.marka, e.kalem?.model].filter(Boolean).join(' ')}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
        </>
      )}

      <Card>
        <h3 className="t-h2" style={{ fontSize: 14, marginBottom: 12 }}>Sayım Geçmişi</h3>
        {gecmis.length === 0 ? (
          <EmptyState icon={<ClipboardCheck size={40} strokeWidth={1.5} />} title="Henüz sayım yok" description="Yukarıdaki butonla başlat." />
        ) : (
          <Table>
            <THead><TR><TH>#</TH><TH>Başlangıç</TH><TH>Bitiş</TH><TH>Açıklama</TH><TH>Durum</TH></TR></THead>
            <TBody>
              {gecmis.map(s => (
                <TR key={s.id}>
                  <TD>#{s.id}</TD>
                  <TD>{fmtTarih(s.olusturuldu)}</TD>
                  <TD>{s.tamamlanma_tarihi ? fmtTarih(s.tamamlanma_tarihi) : '—'}</TD>
                  <TD>{s.aciklama || '—'}</TD>
                  <TD>{s.tamamlandi
                    ? <Badge tone="aktif">Kapalı</Badge>
                    : <Badge tone="brand">Açık</Badge>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
