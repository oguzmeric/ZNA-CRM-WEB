// Stok sayım modu — sayım oluştur, SN taratıp tikle, eksik/fazla raporu.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClipboardCheck, ScanLine, Play, CheckSquare, X } from 'lucide-react'
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
  const [detayModal, setDetayModal] = useState(null)  // { sayim, ozet }
  const [detayYukleniyor, setDetayYukleniyor] = useState(false)
  const inputRef = useRef(null)

  const detayAc = async (sayim) => {
    setDetayModal({ sayim, ozet: null })
    setDetayYukleniyor(true)
    try {
      const o = await sayimOzet(sayim.id)
      setDetayModal({ sayim, ozet: o })
    } catch (e) {
      toast.error('Detay yüklenemedi: ' + (e?.message || 'hata'))
      setDetayModal(null)
    } finally {
      setDetayYukleniyor(false)
    }
  }

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

      {!aktifSayim && (
        <Card style={{ marginBottom: 16, background: 'var(--surface-sunken)' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-primary)' }}>📖 Nasıl çalışır?</h3>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <li><strong>Başlat:</strong> Şu an <em>depoda</em> aktif olan tüm SN'ler "beklenen liste"ye eklenir (teknisyendekiler <strong>hariç</strong>).</li>
            <li><strong>Fiziksel sayım:</strong> Raflarda dolaş, her SN'i barkod okut veya elle yaz + Enter.
              <ul style={{ marginTop: 4 }}>
                <li>✅ <strong>Tarandı</strong>: sayı artar.</li>
                <li>⚠️ <strong>Zaten tarandı</strong>: aynı SN 2. kez okutulmuş.</li>
                <li>🆕 <strong>Fazladan</strong>: fiziksel var ama listede yok — kayıt hatası.</li>
                <li>❌ <strong>Bulunamadı</strong>: DB'de o SN kayıtlı değil.</li>
              </ul>
            </li>
            <li><strong>Bitir:</strong> "Sayımı Bitir" tıkla. Eksik listesindekiler <em>kayıp/çalıntı</em> demek — araştırılmalı.</li>
          </ol>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10, padding: '8px 10px', background: 'var(--surface-card)', borderRadius: 6 }}>
            💡 Sayım <strong>read-only</strong>: SN'lerin durumunu değiştirmez, sadece raporlar. Fiziksel eksik bulursan Depo Raporları'ndan araştır ya da SN'i "Kayıp" olarak sil.
          </div>
        </Card>
      )}

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
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
              📋 Raflarda dolaş, SN barkodu okut veya elle yaz + Enter. "Tarandı" artar, "Eksik" azalır. Bitince "Sayımı Bitir".
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
                <TR key={s.id} onClick={() => detayAc(s)} style={{ cursor: 'pointer' }}>
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

      {detayModal && (
        <SayimDetayModal
          sayim={detayModal.sayim}
          ozet={detayModal.ozet}
          yukleniyor={detayYukleniyor}
          onKapat={() => setDetayModal(null)}
        />
      )}
    </div>
  )
}

function SayimDetayModal({ sayim, ozet, yukleniyor, onKapat }) {
  const [sekme, setSekme] = useState('tarandi')
  const liste = sekme === 'tarandi' ? (ozet?.tarandiList || []) : (ozet?.eksik || [])
  return createPortal(
    <div onClick={onKapat} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface-card)', color: 'var(--text-primary)',
        borderRadius: 14, padding: 24, maxWidth: 780, width: '100%', maxHeight: '85vh',
        overflow: 'auto', border: '1px solid var(--border-default)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Sayım #{sayim.id} Detayı</h3>
          <button onClick={onKapat} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          {sayim.aciklama || '—'} · Başlangıç: {fmtTarih(sayim.olusturuldu)}
          {sayim.tamamlanma_tarihi && <> · Bitiş: {fmtTarih(sayim.tamamlanma_tarihi)}</>}
        </div>

        {yukleniyor ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
        ) : !ozet ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>Detay bulunamadı.</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 20, marginBottom: 14, padding: '10px 12px', background: 'var(--surface-sunken)', borderRadius: 8 }}>
              <div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Toplam</div><div style={{ fontWeight: 700, fontSize: 20 }}>{ozet.toplam}</div></div>
              <div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Tarandı</div><div style={{ fontWeight: 700, fontSize: 20, color: 'var(--success)' }}>{ozet.tarandi}</div></div>
              <div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Eksik</div><div style={{ fontWeight: 700, fontSize: 20, color: 'var(--danger)' }}>{ozet.eksik.length}</div></div>
              <div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Doluluk</div><div style={{ fontWeight: 700, fontSize: 20 }}>
                {ozet.toplam ? `%${Math.round(ozet.tarandi * 100 / ozet.toplam)}` : '—'}
              </div></div>
            </div>

            <div style={{ display: 'inline-flex', background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', borderRadius: 10, padding: 3, marginBottom: 12 }}>
              {[
                { id: 'tarandi', ad: `✅ Tarandı (${ozet.tarandi})` },
                { id: 'eksik',   ad: `❌ Eksik (${ozet.eksik.length})` },
              ].map(t => (
                <button key={t.id} onClick={() => setSekme(t.id)}
                  style={{
                    padding: '8px 14px', borderRadius: 7,
                    background: sekme === t.id ? 'var(--brand-primary)' : 'transparent',
                    color: sekme === t.id ? '#fff' : 'var(--text-secondary)',
                    border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                  }}>{t.ad}</button>
              ))}
            </div>

            {liste.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                {sekme === 'tarandi' ? 'Bu sayımda hiç SN taratılmamış.' : 'Bu sayımda eksik yok. 👍'}
              </div>
            ) : (
              <Table>
                <THead><TR><TH>SN</TH><TH>Stok Kodu</TH><TH>Ürün</TH>{sekme === 'tarandi' && <TH>Tarama Zamanı</TH>}</TR></THead>
                <TBody>
                  {liste.slice(0, 500).map(s => (
                    <TR key={s.id}>
                      <TD><CodeBadge>{s.kalem?.seri_no || '—'}</CodeBadge></TD>
                      <TD>{s.kalem?.stok_kodu || '—'}</TD>
                      <TD>{[s.kalem?.marka, s.kalem?.model].filter(Boolean).join(' ') || '—'}</TD>
                      {sekme === 'tarandi' && <TD>{s.tarama_zamani ? fmtTarih(s.tarama_zamani) : '—'}</TD>}
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
            {liste.length > 500 && (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8, textAlign: 'center' }}>
                İlk 500 kayıt gösteriliyor. Toplam: {liste.length}
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
