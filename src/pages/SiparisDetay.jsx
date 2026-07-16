// Sipariş Detay — sipariş bilgileri + kalemler + kaynak bağlantısı.

import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, ShoppingCart, Building2, User, Calendar, Package, ExternalLink, Printer, XCircle, AlertTriangle, CheckCircle2, Wrench, Receipt } from 'lucide-react'
import { Card, CardTitle, Button, Badge, EmptyState, Textarea, Input, Label, Modal } from '../components/ui'
import {
  siparisGetir, kalemleriGetir, SIPARIS_DURUMLARI, kalemAraToplam, kalemlerToplam, siparisIptalEt,
  siparisTamamla, siparisServisBagla,
} from '../services/siparisService'
import { siparistenMontajServisi, montajSorumlusuGetir, servisTalebiBildirimGonder } from '../services/servisService'
import { siparistenFaturaTalebiAc, siparisFaturaTalebiGetir } from '../services/faturaTalepService'
import { useConfirm } from '../context/ConfirmContext'
import { musteriGetir } from '../services/musteriService'
import { gorusmeGetir } from '../services/gorusmeService'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

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
  const { kullanici } = useAuth()
  const { toast } = useToast()
  const [siparis, setSiparis] = useState(null)
  const [kalemler, setKalemler] = useState([])
  const [musteri, setMusteri] = useState(null)
  const [gorusme, setGorusme] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [iptalModalAcik, setIptalModalAcik] = useState(false)
  const [iptalSebebi, setIptalSebebi] = useState('')
  const [iptalIsleniyor, setIptalIsleniyor] = useState(false)
  // Sipariş tamamlama → montaj servisi köprüsü (mig 168)
  const { confirm } = useConfirm()
  const [mesgul, setMesgul] = useState(false)
  const [montajModal, setMontajModal] = useState(null)  // null | { planliTarih, ekNot, atanan }
  // Sipariş → proforma fatura köprüsü (mig 182)
  const [faturaTalebi, setFaturaTalebi] = useState(null)
  const [faturaModalAcik, setFaturaModalAcik] = useState(false)
  const [faturaNot, setFaturaNot] = useState('')
  const [faturaMesgul, setFaturaMesgul] = useState(false)

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
        // Fatura talebi rozeti (best-effort)
        siparisFaturaTalebiGetir(s.id).then(setFaturaTalebi).catch(() => {})
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

  const iptalOnayla = async () => {
    setIptalIsleniyor(true)
    try {
      await siparisIptalEt(siparis.id, {
        iptalSebebi: iptalSebebi.trim() || null,
        kullaniciAd: kullanici?.ad || null,
      })
      toast.success('Sipariş iptal edildi. Kaynak ' + (isTeklif ? 'teklif' : 'ön sipariş') + ' yeniden onaya açıldı.')
      setIptalModalAcik(false)
      // Detayı tazele
      const g = await siparisGetir(siparis.id)
      if (g) setSiparis(g)
    } catch (e) {
      toast.error('İptal edilemedi: ' + (e?.message || 'hata'))
    } finally {
      setIptalIsleniyor(false)
    }
  }

  // Montaj modalını aç — atanan varsayılanı montaj sorumlusu (Ferdi, mig 168)
  const montajModaliAc = async () => {
    const sorumlu = await montajSorumlusuGetir()
    setMontajModal({ planliTarih: '', ekNot: '', atanan: sorumlu })
  }

  const tamamlaTikla = async () => {
    const onay = await confirm({
      baslik: 'Siparişi Tamamla',
      mesaj: `${siparis.siparisNo} tamamlandı olarak işaretlenecek. Ardından montaj servisi açabilirsiniz.`,
      onayMetin: 'Tamamla', iptalMetin: 'Vazgeç',
    })
    if (!onay) return
    setMesgul(true)
    try {
      const g = await siparisTamamla(siparis.id, { kullanici })
      setSiparis(s => ({ ...s, ...g }))
      toast.success('Sipariş tamamlandı.')
      // Zincirin devamı: montaj servisi. Her sipariş montaj gerektirmez —
      // otomatik açmıyoruz, ön-dolu modalla soruyoruz.
      await montajModaliAc()
    } catch (e) {
      toast.error('Tamamlanamadı: ' + (e?.message || 'hata'))
    } finally {
      setMesgul(false)
    }
  }

  const montajOlustur = async () => {
    setMesgul(true)
    try {
      const talep = await siparistenMontajServisi({
        siparis: { ...siparis, firmaAdi: musteri?.firma || '', lokasyon: musteri?.adres || '' },
        kalemler,
        atanan: montajModal.atanan,
        planliTarih: montajModal.planliTarih || null,
        ekNot: montajModal.ekNot,
        kullanici,
      })
      await siparisServisBagla(siparis.id, talep.id)
      setSiparis(s => ({ ...s, servisTalepId: talep.id }))
      try { await servisTalebiBildirimGonder(talep, kullanici?.id) } catch (e) { console.warn('[montaj bildirim]', e?.message) }
      setMontajModal(null)
      toast.success(`${talep.talepNo} montaj servisi açıldı${montajModal.atanan?.ad ? ` — ${montajModal.atanan.ad}` : ''}.`)
    } catch (e) {
      toast.error('Servis açılamadı: ' + (e?.message || 'hata'))
    } finally {
      setMesgul(false)
    }
  }

  // "Fatura Kesilecek" — siparişten proforma aç (kalem anlık görüntüsüyle)
  const faturaKesilecekOnayla = async () => {
    setFaturaMesgul(true)
    try {
      const sonuc = await siparistenFaturaTalebiAc({
        siparis, kalemler, kullanici, not: faturaNot.trim(),
      })
      if (sonuc?._hata) { toast.error(sonuc._hata); return }
      setFaturaTalebi(sonuc)
      setFaturaModalAcik(false)
      toast.success(`${sonuc.talepNo} proforma kuyruğa eklendi — muhasebe faturayı kesince bildirim gelir.`)
    } catch (e) {
      toast.error('Proforma açılamadı: ' + (e?.message || 'hata'))
    } finally {
      setFaturaMesgul(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Üst bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Button variant="ghost" iconLeft={<ArrowLeft size={14} />} onClick={() => navigate('/siparisler')}>Geri</Button>
        <Button variant="secondary" iconLeft={<Printer size={14} />} onClick={() => window.open(`/siparisler/${siparis.id}/yazdir`, '_blank')}>PDF / Yazdır</Button>
        {/* Satış sözleşmesi (spec: sipariş numarası oluşunca "Satış Sözleşmesi Oluştur") */}
        {siparis.sozlesmeId ? (
          <Button variant="secondary" iconLeft={<FileText size={14} />} onClick={() => navigate(`/sozlesmeler/satis/${siparis.sozlesmeId}`)}>
            Sözleşmeli Sipariş ✓
          </Button>
        ) : (
          <Button variant="secondary" iconLeft={<FileText size={14} />} onClick={() => navigate(`/sozlesmeler/satis/yeni?siparisId=${siparis.id}`)}>
            Satış Sözleşmesi Oluştur
          </Button>
        )}
        {/* Zincirin son adımı: tamamlama → montaj servisi köprüsü (mig 168).
            Şema 'tamamlandi'yi kabul ediyordu ama SET eden kod yoktu. */}
        {siparis.durum === 'aktif' && (
          <Button
            variant="primary"
            iconLeft={<CheckCircle2 size={14} />}
            onClick={tamamlaTikla}
            disabled={mesgul}
            title="Siparişi tamamla — ardından montaj servisi açabilirsin"
          >
            {mesgul ? 'İşleniyor…' : 'Siparişi Tamamla'}
          </Button>
        )}
        {/* Montaj: onaylanan (aktif) siparişte de açılabilir — tamamlanmayı beklemek şart değil (madde 23) */}
        {['aktif', 'tamamlandi'].includes(siparis.durum) && (
          siparis.servisTalepId ? (
            <Button variant="secondary" iconLeft={<Wrench size={14} />}
              onClick={() => navigate(`/servis-talepleri/${siparis.servisTalepId}`)}>
              Montaj Servisine Git
            </Button>
          ) : (
            <Button variant="secondary" iconLeft={<Wrench size={14} />} onClick={montajModaliAc}>
              Montaj Servisi Oluştur
            </Button>
          )
        )}
        {/* Proforma / fatura köprüsü (mig 182) — servis detayındaki desenle aynı */}
        {['aktif', 'tamamlandi'].includes(siparis.durum) && (
          faturaTalebi ? (
            <Button
              variant="secondary"
              iconLeft={<Receipt size={14} />}
              onClick={() => navigate('/fatura-talepleri')}
              title={faturaTalebi.durum === 'faturalandi'
                ? `Fatura kesildi: ${faturaTalebi.faturaNo || faturaTalebi.talepNo}`
                : `Proforma kuyrukta: ${faturaTalebi.talepNo}`}
              style={faturaTalebi.durum === 'faturalandi'
                ? { color: '#10b981', borderColor: 'rgba(16,185,129,0.4)' }
                : { color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)' }}
            >
              {faturaTalebi.durum === 'faturalandi'
                ? `Faturalandı ✓ ${faturaTalebi.faturaNo || ''}`.trim()
                : `Proforma: ${faturaTalebi.talepNo}`}
            </Button>
          ) : (
            <Button variant="secondary" iconLeft={<Receipt size={14} />}
              onClick={() => { setFaturaNot(''); setFaturaModalAcik(true) }}>
              Fatura Kesilecek
            </Button>
          )
        )}
        {siparis.durum === 'aktif' && (
          <Button
            variant="danger"
            iconLeft={<XCircle size={14} />}
            onClick={() => { setIptalSebebi(''); setIptalModalAcik(true) }}
            title="Siparişi iptal et — kaynak teklif/ön sipariş yeniden onaylanabilir"
          >
            İptal Et
          </Button>
        )}
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
          {gorusme?.aktNo && (
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
              >{gorusme.aktNo}</button>
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
                    <th style={{ textAlign: 'right', padding: 8, fontWeight: 500, width: 70 }}>Kar %</th>
                    <th style={{ textAlign: 'right', padding: 8, fontWeight: 500, width: 60 }}>KDV %</th>
                    <th style={{ textAlign: 'right', padding: 8, fontWeight: 500, width: 110 }}>Ara Toplam</th>
                  </tr>
                </thead>
                <tbody>
                  {kalemler.map(k => {
                    const at = kalemAraToplam(k)
                    const f = Number(k.birimFiyat || 0)
                    const a = Number(k.alisFiyat || 0)
                    const karYuzde = (a > 0 && f > 0) ? ((f - a) / a) * 100 : null
                    const karRenk = karYuzde == null
                      ? 'var(--text-tertiary)'
                      : karYuzde < 0 ? '#dc2626' : karYuzde < 15 ? '#f59e0b' : '#10b981'
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
                        <td style={{ padding: 8, textAlign: 'right', fontWeight: 700, color: karRenk }}>
                          {karYuzde == null ? '—' : `${karYuzde >= 0 ? '+' : ''}${karYuzde.toFixed(1).replace('.', ',')}%`}
                        </td>
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

      {/* Fatura Kesilecek — siparişten proforma (mig 182) */}
      {faturaModalAcik && (
        <Modal open onClose={() => !faturaMesgul && setFaturaModalAcik(false)} title="Fatura Kesilecek" width={520}>
          <div style={{ display: 'grid', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <strong>{siparis.siparisNo}</strong> siparişi {kalemler.length} kalemiyle proforma
              kuyruğuna eklenecek. Muhasebe gerçek faturayı kesip PDF + ödeme yöntemini girecek.
            </p>
            <div>
              <Label>Not (isteğe bağlı)</Label>
              <Textarea rows={2} value={faturaNot} onChange={e => setFaturaNot(e.target.value)}
                placeholder="Muhasebeye iletmek istediğin not…" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" onClick={() => setFaturaModalAcik(false)} disabled={faturaMesgul}>Vazgeç</Button>
              <Button variant="primary" onClick={faturaKesilecekOnayla} disabled={faturaMesgul}
                iconLeft={<Receipt size={14} />}>
                {faturaMesgul ? 'Açılıyor…' : 'Proforma Aç'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Montaj servisi — sipariş tamamlanınca ön-dolu açılır (mig 168) */}
      {montajModal && (
        <Modal open onClose={() => !mesgul && setMontajModal(null)} title="Montaj Servisi Oluştur" width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              background: 'var(--info-soft)', border: '1px solid var(--info)', borderRadius: 8,
              padding: '10px 12px', font: '400 12.5px/1.5 var(--font-sans)',
            }}>
              <strong>{siparis.siparisNo}</strong> için "Kurulum" türünde servis talebi açılacak.
              Sipariş kalemleri montaj kapsamı olarak açıklamaya eklenir.
            </div>

            <div>
              <Label>Atanacak kişi</Label>
              <div style={{
                padding: '9px 12px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)', background: 'var(--surface-sunken)',
                font: '500 13px/18px var(--font-sans)',
              }}>
                {montajModal.atanan?.ad || 'Atanmadı — talep "bekliyor" olarak açılacak'}
              </div>
              <div style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                Montaj sorumlusu Kullanıcı Yönetimi'nden değiştirilir.
              </div>
            </div>

            <div>
              <Label>Planlı montaj tarihi</Label>
              <Input type="date" value={montajModal.planliTarih}
                onChange={e => setMontajModal(m => ({ ...m, planliTarih: e.target.value }))} />
            </div>

            <div>
              <Label>Montaj notu (isteğe bağlı)</Label>
              <Textarea rows={2} value={montajModal.ekNot}
                onChange={e => setMontajModal(m => ({ ...m, ekNot: e.target.value }))}
                placeholder="Ör. Sahaya giriş için önceden randevu alınmalı" />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setMontajModal(null)} disabled={mesgul}>
                Şimdi Değil
              </Button>
              <Button variant="primary" onClick={montajOlustur} disabled={mesgul}
                iconLeft={<Wrench size={14} />}>
                {mesgul ? 'Oluşturuluyor…' : 'Montaj Servisini Aç'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* İptal Modal */}
      {iptalModalAcik && (
        <div
          onClick={() => !iptalIsleniyor && setIptalModalAcik(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface-card)', borderRadius: 12,
              padding: 20, width: '100%', maxWidth: 480,
              boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <AlertTriangle size={22} color="#ef4444" />
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Siparişi İptal Et</h3>
            </div>
            <div style={{
              padding: 12, background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8,
              fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5,
            }}>
              <strong style={{ color: '#dc2626' }}>{siparis.siparisNo}</strong> iptal edilecek.<br/>
              Kaynak <strong>{isTeklif ? 'teklif' : 'ön sipariş'}</strong> yeniden onaya açılacak — hatalar düzeltilip tekrar onaylanabilir.
            </div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
              İptal sebebi (opsiyonel)
            </label>
            <Textarea
              value={iptalSebebi}
              onChange={e => setIptalSebebi(e.target.value)}
              rows={3}
              placeholder="Örn: Fiyat hatası, yanlış müşteri, revize teklif geldi…"
              disabled={iptalIsleniyor}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <Button variant="ghost" onClick={() => setIptalModalAcik(false)} disabled={iptalIsleniyor}>Vazgeç</Button>
              <Button variant="danger" onClick={iptalOnayla} disabled={iptalIsleniyor}>
                {iptalIsleniyor ? 'İptal ediliyor…' : 'Evet, İptal Et'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
