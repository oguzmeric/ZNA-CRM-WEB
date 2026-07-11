// Stok sayım modu — sayım oluştur, SN taratıp tikle, eksik/fazla raporu.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { ClipboardCheck, ScanLine, Play, CheckSquare, X, Trash2, Download, AlertTriangle } from 'lucide-react'
import { sayimBaslat, sayimSNTara, sayimOzet, sayimBitir, sonSayimlar, sayimSil } from '../services/depoService'
import { snSil } from '../services/stokService'
import { Card, Button, Badge, EmptyState, Table, THead, TBody, TR, TH, TD, CodeBadge, Input } from '../components/ui'
import { SkeletonList } from '../components/Skeleton'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'

const fmtTarih = (t) => t ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export default function StokSayim() {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [baslatModal, setBaslatModal] = useState(false)
  const [baslatAciklama, setBaslatAciklama] = useState('')
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
    try {
      const s = await sayimBaslat(baslatAciklama.trim())
      setBaslatModal(false)
      setBaslatAciklama('')
      setAktifSayim(s)
      await ozetYukle(s.id)
      inputRef.current?.focus()
    } catch (e) {
      toast.error('Sayım başlatılamadı: ' + (e?.message || 'bilinmeyen hata'))
    }
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
    const onay = await confirm({
      baslik: 'Sayımı Bitir',
      mesaj: `${ozet.tarandi}/${ozet.toplam} tarandı, ${ozet.eksik.length} eksik. Sayım kapatılsın mı? Fark raporu kalıcı olarak kaydedilir.`,
      onayMetin: 'Sayımı Bitir', iptalMetin: 'Vazgeç',
    })
    if (!onay) return
    try {
      await sayimBitir(aktifSayim.id)
      toast.success('Sayım kapatıldı — fark raporu kaydedildi.')
      setAktifSayim(null); setOzet(null)
      await gecmisiYukle()
    } catch (e) {
      toast.error('Sayım kapatılamadı: ' + (e?.message || 'bilinmeyen hata'))
    }
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
          <Button variant="primary" iconLeft={<Play size={13} />} onClick={() => setBaslatModal(true)}>
            Yeni Sayım Başlat
          </Button>
        )}
      </div>

      {/* Sayım başlat modalı — eski native prompt() yerine */}
      {baslatModal && createPortal(
        <div
          onClick={() => setBaslatModal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--surface-card)', color: 'var(--text-primary)',
            borderRadius: 12, padding: 24, maxWidth: 420, width: '100%',
            border: '1px solid var(--border-default)',
          }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>Yeni Sayım Başlat</h3>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 14px' }}>
              Depodaki tüm aktif SN'ler beklenen listeye eklenir.
            </p>
            <Input
              value={baslatAciklama}
              onChange={e => setBaslatAciklama(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sayimBaslatAksiyon() }}
              placeholder='Açıklama (opsiyonel) — örn. "Temmuz ay sonu sayımı"'
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <Button variant="secondary" onClick={() => setBaslatModal(false)}>Vazgeç</Button>
              <Button variant="primary" iconLeft={<Play size={13} />} onClick={sayimBaslatAksiyon}>Başlat</Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

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
            <THead><TR><TH>#</TH><TH>Başlangıç</TH><TH>Bitiş</TH><TH>Açıklama</TH><TH style={{ textAlign: 'right' }}>Fark</TH><TH>Durum</TH></TR></THead>
            <TBody>
              {gecmis.map(s => (
                <TR key={s.id} onClick={() => detayAc(s)} style={{ cursor: 'pointer' }}>
                  <TD>#{s.id}</TD>
                  <TD>{fmtTarih(s.olusturuldu)}</TD>
                  <TD>{s.tamamlanma_tarihi ? fmtTarih(s.tamamlanma_tarihi) : '—'}</TD>
                  <TD>{s.aciklama || '—'}</TD>
                  <TD style={{ textAlign: 'right' }}>
                    {s.toplam_kalem != null ? (
                      <span className="tabular-nums" style={{ fontSize: 12 }}>
                        {s.tarandi_kalem}/{s.toplam_kalem}
                        {s.eksik_kalem > 0 && (
                          <strong style={{ color: 'var(--danger)', marginLeft: 6 }}>−{s.eksik_kalem}</strong>
                        )}
                      </span>
                    ) : '—'}
                  </TD>
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
          onSil={async () => {
            const onay = await confirm({
              baslik: 'Sayımı Sil',
              mesaj: `Sayım #${detayModal.sayim.id} kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
              onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
            })
            if (!onay) return
            try {
              await sayimSil(detayModal.sayim.id)
              toast.success('Sayım silindi.')
              setDetayModal(null)
              await gecmisiYukle()
            } catch (e) {
              toast.error('Silme hatası: ' + (e?.message || 'bilinmeyen'))
            }
          }}
          onKayipIsaretle={async (eksikler) => {
            const onay = await confirm({
              baslik: 'Eksikleri Kayıp Olarak İşaretle',
              mesaj: `${eksikler.length} SN "Kayıp / Bulunamadı" sebebiyle silinecek (soft delete — audit kaydıyla, geri getirilebilir). Devam?`,
              onayMetin: 'Kayıp İşaretle', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
            })
            if (!onay) return
            let ok = 0, hata = 0
            for (const e of eksikler) {
              try {
                await snSil(e.stok_kalem_id, { sebep: 'kayip', not: `Sayım #${detayModal.sayim.id} eksik listesi` })
                ok++
              } catch { hata++ }
            }
            if (ok) toast.success(`${ok} SN kayıp olarak işaretlendi.`)
            if (hata) toast.error(`${hata} SN işaretlenemedi.`)
            // Detayı tazele
            try {
              const o = await sayimOzet(detayModal.sayim.id)
              setDetayModal({ sayim: detayModal.sayim, ozet: o })
            } catch { setDetayModal(null) }
          }}
        />
      )}
    </div>
  )
}

function SayimDetayModal({ sayim, ozet, yukleniyor, onKapat, onSil, onKayipIsaretle }) {
  const [sekme, setSekme] = useState('tarandi')
  const liste = sekme === 'tarandi' ? (ozet?.tarandiList || []) : (ozet?.eksik || [])

  // Sayım sonucunu Excel'e aktar — Tarandı + Eksik iki sayfa
  const excelIndir = () => {
    if (!ozet) return
    const satirYap = (s) => ({
      'Seri No': s.kalem?.seri_no || '',
      'Stok Kodu': s.kalem?.stok_kodu || '',
      'Marka': s.kalem?.marka || '',
      'Model': s.kalem?.model || '',
      'Durum': s.kalem?.durum || '',
      'Tarama Zamanı': s.tarama_zamani ? new Date(s.tarama_zamani).toLocaleString('tr-TR') : '',
    })
    const wb = XLSX.utils.book_new()
    const wsT = XLSX.utils.json_to_sheet((ozet.tarandiList || []).map(satirYap))
    const wsE = XLSX.utils.json_to_sheet((ozet.eksik || []).map(satirYap))
    const cols = [{ wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 18 }]
    wsT['!cols'] = cols; wsE['!cols'] = cols
    XLSX.utils.book_append_sheet(wb, wsT, 'Tarandı')
    XLSX.utils.book_append_sheet(wb, wsE, 'Eksik')
    XLSX.writeFile(wb, `ZNA_Sayim_${sayim.id}.xlsx`)
  }

  return createPortal(
    <div style={{
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
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {ozet && (
              <button onClick={excelIndir}
                title="Sayım sonucunu Excel olarak indir"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '6px 10px', borderRadius: 6,
                  background: 'transparent', color: 'var(--text-secondary)',
                  border: '1px solid var(--border-default)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}>
                <Download size={12} strokeWidth={1.5} /> Excel
              </button>
            )}
            {ozet && sayim.tamamlandi && onKayipIsaretle && (ozet.eksik || []).length > 0 && (
              <button onClick={() => onKayipIsaretle(ozet.eksik)}
                title="Eksik listesindeki tüm SN'leri kayıp olarak işaretle (soft delete)"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '6px 10px', borderRadius: 6,
                  background: 'transparent', color: '#B45309',
                  border: '1px solid #B45309', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}>
                <AlertTriangle size={12} strokeWidth={1.5} /> Eksikleri Kayıp İşaretle
              </button>
            )}
            {onSil && (
              <button onClick={onSil}
                title="Bu sayımı sil"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '6px 10px', borderRadius: 6,
                  background: 'transparent', color: 'var(--danger)',
                  border: '1px solid var(--danger)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}>
                <Trash2 size={12} strokeWidth={1.5} /> Sayımı Sil
              </button>
            )}
            <button onClick={onKapat} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>
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
