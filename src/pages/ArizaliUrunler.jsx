// Arızalı Ürünler — merkezi cihaz arıza ekranı (18.08 kullanıcı isteği:
// "bilgisayardan işleyemiyoruz ve giremiyoruz; barkodsuz üründe sıkıntı var").
// Eskiden web'de tek yol MusteriDetay'daki bölümdü — depocu ürünü elinde
// tutarken müşteri kartını bulmak zorundaydı. Burada:
//  • tüm müşterilerin cihazları tek listede (durum filtresi + arama)
//  • web'den YENİ arızalı giriş — SN OPSİYONEL (barkodsuz ürün çözümü)
//  • durum işleme: Arızalı → Serviste → Tamir edildi (Aktif) / Hurda, notlu
//  • hareket geçmişi. Veri katmanı musteriCihazService (mig 149 tabloları).
import { useState, useEffect, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'
import {
  AlertTriangle, Wrench, Plus, History, CheckCircle2, Trash2, Send, FileSpreadsheet, Ban,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import {
  CIHAZ_DURUMLARI, tumCihazlariGetir, cihazEkle, cihazArizaBildir,
  cihazArizaGiderildi, cihazServiseGonder, cihazHurdayaAyir, cihazHareketleriGetir,
  cihazSil,
} from '../services/musteriCihazService'
import { musterileriGetir } from '../services/musteriService'
import { musteriLokasyonSecenekleri } from '../services/sahaCihazService'
import LokasyonSecici from '../components/LokasyonSecici'
import {
  Button, Input, Textarea, Label, Card, Badge, EmptyState, Modal,
  Table, THead, TBody, TR, TH, TD,
} from '../components/ui'

const DURUM_TONE = { aktif: 'basarili', arizali: 'kayip', serviste: 'beklemede', hurda: 'neutral' }
const musteriAdi = (m) => m?.firma || [m?.ad, m?.soyad].filter(Boolean).join(' ') || (m ? `Müşteri #${m.id}` : '')
const durumBilgi = (id) => CIHAZ_DURUMLARI.find(d => d.id === id) || { id, isim: id, renk: '#6b7280' }
const kucukTr = (s) => (s || '').toLocaleLowerCase('tr-TR')
const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'

export default function ArizaliUrunler() {
  const { kullanici } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [yukleniyor, setYukleniyor] = useState(true)
  const [cihazlar, setCihazlar] = useState([])
  const [yuklemeHatasi, setYuklemeHatasi] = useState(null)
  const [durumFiltre, setDurumFiltre] = useState('acik')   // acik = arızalı + serviste
  const [arama, setArama] = useState('')

  const [yeniModal, setYeniModal] = useState(false)
  const [islemModal, setIslemModal] = useState(null)   // { cihaz, islem }
  const [gecmisModal, setGecmisModal] = useState(null) // cihaz

  const yukle = useCallback(async () => {
    setYukleniyor(true)
    try { setCihazlar(await tumCihazlariGetir()); setYuklemeHatasi(null) }
    catch (e) { setYuklemeHatasi(e.message || 'Bilinmeyen hata') }
    finally { setYukleniyor(false) }
  }, [])

  // Kalıcı silme — YANLIŞ girilen kayıtlar için (hurdayla karışmasın:
  // hurda iş süreci, silme veri düzeltmesi). Hareketler FK cascade ile gider.
  const sil = async (c) => {
    const onay = await confirm({
      baslik: 'Kaydı Sil',
      mesaj: `"${c.cihazAdi || 'Cihaz'}"${c.seriNo ? ` (SN: ${c.seriNo})` : ''} kaydı ve hareket geçmişi kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    const ok = await cihazSil(c.id)
    if (!ok) { toast.error('Kayıt silinemedi.'); return }
    toast.success('Kayıt silindi.')
    yukle()
  }
  useEffect(() => { Promise.resolve().then(yukle) }, [yukle])

  const sayilar = useMemo(() => ({
    arizali: cihazlar.filter(c => c.durum === 'arizali').length,
    serviste: cihazlar.filter(c => c.durum === 'serviste').length,
    toplam: cihazlar.length,
  }), [cihazlar])

  const liste = useMemo(() => {
    let l = cihazlar
    if (durumFiltre === 'acik') l = l.filter(c => c.durum === 'arizali' || c.durum === 'serviste')
    else if (durumFiltre !== 'tumu') l = l.filter(c => c.durum === durumFiltre)
    const q = kucukTr(arama.trim())
    if (q) {
      l = l.filter(c =>
        kucukTr(c.musteriAd).includes(q) || kucukTr(c.cihazAdi).includes(q)
        || kucukTr(c.seriNo).includes(q) || kucukTr(c.marka).includes(q)
        || kucukTr(c.model).includes(q))
    }
    return l
  }, [cihazlar, durumFiltre, arama])

  const FILTRELER = [
    { id: 'acik', ad: `Açık (${sayilar.arizali + sayilar.serviste})` },
    { id: 'arizali', ad: 'Arızalı' }, { id: 'serviste', ad: 'Serviste' },
    { id: 'aktif', ad: 'Tamir edilen/Aktif' }, { id: 'hurda', ad: 'Hurda' },
    { id: 'tumu', ad: `Tümü (${sayilar.toplam})` },
  ]
  const aktifFiltreAd = FILTRELER.find(f => f.id === durumFiltre)?.ad || durumFiltre

  // Ekrandaki FİLTRELENMİŞ listenin birebir Excel hali (Puantaj deseni:
  // künye + satırlar; buton tablonun başlık şeridinde).
  const excelAktar = () => {
    const kunye = [
      ['ARIZALI ÜRÜNLER'],
      ['Filtre', aktifFiltreAd + (arama.trim() ? ` · arama: "${arama.trim()}"` : '')],
      ['Rapor alındı', new Date().toLocaleString('tr-TR')],
      [],
    ]
    const veriler = liste.map(c => ({
      'Müşteri': c.musteriAd || '',
      'Cihaz Adı': c.cihazAdi || '',
      'Marka': c.marka || '',
      'Model': c.model || '',
      'Seri No': c.seriNo || 'SN\'siz',
      'Durum': durumBilgi(c.durum).isim,
      'Arıza Nedeni': c.arizaNedeni || '',
      'Arıza Tarihi': fmtTarih(c.arizaTarihi),
      'Lokasyon': c.lokasyon || '',
      'Not': c.notlar || '',
      'Kayıt Tarihi': fmtTarih(c.olusturmaTarih),
    }))
    const ws = XLSX.utils.aoa_to_sheet(kunye)
    XLSX.utils.sheet_add_json(ws, veriler, { origin: -1 })
    ws['!cols'] = [{ wch: 28 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 32 }, { wch: 12 }, { wch: 26 }, { wch: 24 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Arızalı Ürünler')
    XLSX.writeFile(wb, `arizali-urunler-${durumFiltre}-${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast.success('Excel indirildi.')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 1440, margin: '0 auto', padding: 24 }}>
      {/* KPI şeridi */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <KpiKart Icon={AlertTriangle} renk="#dc2626" deger={sayilar.arizali} etiket="Arızalı ürün" />
        <KpiKart Icon={Wrench} renk="#f59e0b" deger={sayilar.serviste} etiket="Serviste" />
        <KpiKart Icon={CheckCircle2} renk="#10b981" deger={sayilar.toplam - sayilar.arizali - sayilar.serviste} etiket="Aktif / kapanmış" />
      </div>

      {/* Filtre + arama + yeni kayıt */}
      <Card style={{ padding: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {FILTRELER.map(f => (
            <button key={f.id} type="button" onClick={() => setDurumFiltre(f.id)}
              style={{
                padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
                border: '1px solid ' + (durumFiltre === f.id ? 'var(--accent, #2563eb)' : 'var(--border-default)'),
                background: durumFiltre === f.id ? 'var(--accent-soft, #eff6ff)' : 'transparent',
                color: durumFiltre === f.id ? 'var(--accent, #2563eb)' : 'var(--text-secondary)',
                font: '600 12px/16px var(--font-sans)',
              }}>{f.ad}</button>
          ))}
          <div style={{ flex: 1, minWidth: 180 }}>
            <Input placeholder="Müşteri, cihaz, SN, marka ara…" value={arama}
              onChange={e => setArama(e.target.value)} />
          </div>
          <Button variant="primary" onClick={() => setYeniModal(true)}>
            <Plus size={14} strokeWidth={2} /> Yeni Arızalı Ürün
          </Button>
        </div>
      </Card>

      {/* Liste */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border-default)',
        }}>
          <div style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
            {aktifFiltreAd}
            <span style={{ font: '400 12px/18px var(--font-sans)', color: 'var(--text-tertiary)', marginLeft: 6 }}>
              {liste.length} kayıt
            </span>
          </div>
          <Button variant="ghost" onClick={excelAktar} disabled={yukleniyor || liste.length === 0}>
            <FileSpreadsheet size={14} strokeWidth={1.7} /> Excel'e Aktar
          </Button>
        </div>
        {yukleniyor ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
        ) : yuklemeHatasi ? (
          // "kayıt yok" ile "yüklenemedi" AYRI: sorgu hatası sessizce boş
          // liste gibi görünüyordu (firma_adi embed vakası, 18.08)
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ color: 'var(--danger)', font: '600 13px/18px var(--font-sans)', marginBottom: 8 }}>
              Liste yüklenemedi: {yuklemeHatasi}
            </div>
            <Button variant="ghost" onClick={yukle}>Tekrar Dene</Button>
          </div>
        ) : liste.length === 0 ? (
          <EmptyState title="Kayıt yok" description="Bu filtrede cihaz bulunmuyor." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <THead>
                <TR>
                  <TH>Müşteri</TH><TH>Cihaz</TH><TH>Seri No</TH><TH>Durum</TH>
                  <TH>Arıza Nedeni</TH><TH>Arıza Tarihi</TH><TH style={{ width: 210 }}>İşlem</TH>
                </TR>
              </THead>
              <TBody>
                {liste.map(c => {
                  const d = durumBilgi(c.durum)
                  return (
                    <TR key={c.id}>
                      <TD style={{ fontWeight: 600 }}>{c.musteriAd || '—'}</TD>
                      <TD>
                        {c.cihazAdi || '—'}
                        {(c.marka || c.model) && (
                          <div className="t-caption">{[c.marka, c.model].filter(Boolean).join(' · ')}</div>
                        )}
                      </TD>
                      <TD>
                        {c.seriNo || <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>SN'siz</span>}
                      </TD>
                      <TD><Badge tone={DURUM_TONE[c.durum] || 'neutral'}>{d.isim}</Badge></TD>
                      <TD style={{ maxWidth: 220 }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.arizaNedeni || ''}>
                          {c.arizaNedeni || '—'}
                        </div>
                      </TD>
                      <TD>{fmtTarih(c.arizaTarihi)}</TD>
                      <TD>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {c.durum === 'arizali' && (
                            <MiniBtn title="Servise gönder" onClick={() => setIslemModal({ cihaz: c, islem: 'serviste' })}>
                              <Send size={12} strokeWidth={1.7} />
                            </MiniBtn>
                          )}
                          {(c.durum === 'arizali' || c.durum === 'serviste') && (
                            <MiniBtn title="Tamir edildi" onClick={() => setIslemModal({ cihaz: c, islem: 'tamir' })}>
                              <CheckCircle2 size={12} strokeWidth={1.7} />
                            </MiniBtn>
                          )}
                          {c.durum !== 'hurda' && c.durum !== 'aktif' && (
                            <MiniBtn title="Hurdaya ayır" onClick={() => setIslemModal({ cihaz: c, islem: 'hurda' })}>
                              <Ban size={12} strokeWidth={1.7} />
                            </MiniBtn>
                          )}
                          {c.durum === 'aktif' && (
                            <MiniBtn title="Arıza bildir" onClick={() => setIslemModal({ cihaz: c, islem: 'ariza' })}>
                              <AlertTriangle size={12} strokeWidth={1.7} />
                            </MiniBtn>
                          )}
                          <MiniBtn title="Hareket geçmişi" onClick={() => setGecmisModal(c)}>
                            <History size={12} strokeWidth={1.7} />
                          </MiniBtn>
                          {/* 18.08: çöp = GERÇEK silme (yanlış giriş) — hurda değil */}
                          <MiniBtn title="Kaydı sil (yanlış giriş)" onClick={() => sil(c)}>
                            <Trash2 size={12} strokeWidth={1.7} />
                          </MiniBtn>
                        </div>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </div>
        )}
      </Card>

      {yeniModal && (
        <YeniArizaliModal kullanici={kullanici} toast={toast}
          onKapat={() => setYeniModal(false)} onDegisti={yukle} />
      )}
      {islemModal && (
        <IslemModal {...islemModal} kullanici={kullanici} toast={toast}
          onKapat={() => setIslemModal(null)} onDegisti={yukle} />
      )}
      {gecmisModal && (
        <GecmisModal cihaz={gecmisModal} onKapat={() => setGecmisModal(null)} />
      )}
    </div>
  )
}

const KpiKart = (p) => (
  <Card style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
    <div style={{
      width: 38, height: 38, borderRadius: 10, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: p.renk + '18', color: p.renk,
    }}><p.Icon size={18} strokeWidth={1.8} /></div>
    <div>
      <div style={{ font: '700 20px/24px var(--font-sans)', color: 'var(--text-primary)' }}>{p.deger}</div>
      <div className="t-caption">{p.etiket}</div>
    </div>
  </Card>
)

const MiniBtn = ({ title, onClick, children }) => (
  <button type="button" title={title} onClick={onClick} style={{
    background: 'transparent', border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)', width: 26, height: 26,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: 'var(--text-secondary)',
  }}>{children}</button>
)

// ── Yeni arızalı ürün — SN OPSİYONEL (barkodsuz ürünler webden girilebilsin) ──
function YeniArizaliModal({ kullanici, toast, onKapat, onDegisti }) {
  const [musteriler, setMusteriler] = useState([])
  const [musteriArama, setMusteriArama] = useState('')
  const [musteri, setMusteri] = useState(null)
  const [form, setForm] = useState({
    cihazAdi: '', marka: '', model: '', seriNo: '', lokasyon: '', arizaNedeni: '', notlar: '',
  })
  // Müşterinin TANIMLI lokasyonları (18.08: "Başakşehir'i yazdım, lokasyonlar
  // gelmedi") — varsa ID tabanlı seçici + detay, yoksa serbest metin.
  // Kayıt kolonu METİN: "Lokasyon Adı — detay" birleştirilip yazılır.
  const [lokasyonlar, setLokasyonlar] = useState([])
  const [lokasyonId, setLokasyonId] = useState(null)
  const [lokasyonDetay, setLokasyonDetay] = useState('')
  const [mesgul, setMesgul] = useState(false)

  useEffect(() => { musterileriGetir().then(m => setMusteriler(m || [])) }, [])

  // Müşteri seçimi/temizliği tek handler'da: lokasyon durumu sıfırlanır,
  // tanımlı lokasyonlar çekilir (effect'te senkron setState lint hatasıydı).
  const musteriSec = (m) => {
    setMusteri(m)
    setLokasyonId(null)
    setLokasyonDetay('')
    setForm(f => ({ ...f, lokasyon: '' }))
    if (!m?.id) { setLokasyonlar([]); return }
    musteriLokasyonSecenekleri(m.id)
      .then(l => setLokasyonlar(l || []))
      .catch(() => setLokasyonlar([]))
  }

  // ⚠️ Müşteri listesinde alan adı `firma` (firmaAdi DEĞİL — canlıda "liste
  // gelmiyor" vakası, 18.08). Boş aramada ilk 30 gösterilir: alana tıklayan
  // kullanıcı yazmadan da liste görsün.
  const adaylar = useMemo(() => {
    const q = kucukTr(musteriArama.trim())
    if (!q) return []   // 18.08: yazmadan dropdown AÇILMAZ (kullanıcı istedi)
    const l = musteriler.filter(m => kucukTr(musteriAdi(m)).includes(q))
    return l.slice(0, 30)
  }, [musteriler, musteriArama])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const kaydet = async () => {
    if (!musteri) { toast.error('Müşteri seçin.'); return }
    if (!form.cihazAdi.trim()) { toast.error('Cihaz adı zorunlu.'); return }
    if (!form.arizaNedeni.trim()) { toast.error('Arıza nedeni zorunlu.'); return }
    setMesgul(true)
    try {
      const seciliLok = lokasyonlar.find(l => String(l.id) === String(lokasyonId))
      const lokasyonMetni = seciliLok
        ? (lokasyonDetay.trim() ? `${seciliLok.ad} — ${lokasyonDetay.trim()}` : seciliLok.ad)
        : (lokasyonlar.length > 0 ? lokasyonDetay.trim() : form.lokasyon.trim())
      const { hata } = await cihazEkle({
        musteriId: musteri.id,
        cihazAdi: form.cihazAdi.trim(),
        marka: form.marka.trim(), model: form.model.trim(),
        seriNo: form.seriNo.trim(),          // boş = SN'siz (barkodsuz)
        lokasyon: lokasyonMetni,
        durum: 'arizali',
        arizaNedeni: form.arizaNedeni.trim(),
        arizaTarihi: new Date().toISOString(),
        notlar: form.notlar.trim(),
      }, kullanici)
      if (hata) { toast.error(hata); return }
      toast.success('Arızalı ürün kaydedildi.')
      onDegisti(); onKapat()
    } finally { setMesgul(false) }
  }

  return (
    <Modal open onClose={onKapat} title="Yeni Arızalı Ürün" width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <Label required>Müşteri</Label>
          {musteri ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
              border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
            }}>
              <span style={{ flex: 1, fontWeight: 600 }}>{musteriAdi(musteri)}</span>
              <Button variant="ghost" onClick={() => { musteriSec(null); setMusteriArama('') }}>Değiştir</Button>
            </div>
          ) : (
            <>
              <Input placeholder="Müşteri adı yazmaya başlayın…" value={musteriArama}
                onChange={e => setMusteriArama(e.target.value)} autoFocus />
              {adaylar.length > 0 && (
                <div style={{
                  marginTop: 4, border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)', maxHeight: 180, overflowY: 'auto',
                }}>
                  {adaylar.map(m => (
                    <button key={m.id} type="button" onClick={() => musteriSec(m)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '7px 12px', background: 'transparent', border: 'none',
                        borderBottom: '1px solid var(--border-default)', cursor: 'pointer',
                        font: '400 13px/18px var(--font-sans)', color: 'var(--text-primary)',
                      }}>{musteriAdi(m)}</button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label required>Cihaz adı</Label>
            <Input value={form.cihazAdi} onChange={set('cihazAdi')} placeholder="örn. IP Kamera" />
          </div>
          <div>
            <Label>Seri No</Label>
            <Input value={form.seriNo} onChange={set('seriNo')} placeholder="Barkodsuz üründe boş bırakın" />
          </div>
          <div>
            <Label>Marka</Label>
            <Input value={form.marka} onChange={set('marka')} />
          </div>
          <div>
            <Label>Model</Label>
            <Input value={form.model} onChange={set('model')} />
          </div>
        </div>
        <div>
          <Label>Lokasyon</Label>
          {lokasyonlar.length > 0 ? (
            <>
              <LokasyonSecici
                lokasyonlar={lokasyonlar}
                value={lokasyonId}
                onChange={setLokasyonId}
                ipucuVer={(l) => l.adres || ''}
              />
              <div style={{ marginTop: 6 }}>
                <Input value={lokasyonDetay} onChange={e => setLokasyonDetay(e.target.value)}
                  placeholder="Bina/kat/oda detayı (opsiyonel)" />
              </div>
            </>
          ) : (
            <Input value={form.lokasyon} onChange={set('lokasyon')} placeholder="örn. Giriş kapısı / Depo" />
          )}
        </div>
        <div>
          <Label required>Arıza nedeni</Label>
          <Textarea rows={2} value={form.arizaNedeni} onChange={set('arizaNedeni')}
            placeholder="örn. Görüntü gelmiyor, güç LED'i yanmıyor" />
        </div>
        <div>
          <Label>Not</Label>
          <Input value={form.notlar} onChange={set('notlar')} placeholder="Opsiyonel" />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onKapat} disabled={mesgul}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={mesgul}>
            {mesgul ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Durum işleme (tek modal: serviste / tamir / hurda / ariza) ───────────────
const ISLEMLER = {
  serviste: { baslik: 'Servise Gönder', dugme: 'Servise Gönder', notZorunlu: false, ipucu: 'örn. Teknik servise kargo ile gönderildi' },
  tamir:    { baslik: 'Tamir Edildi',   dugme: 'Tamir Edildi — Aktife Al', notZorunlu: false, ipucu: 'örn. Güç kartı değişti' },
  hurda:    { baslik: 'Hurdaya Ayır',   dugme: 'Hurdaya Ayır', notZorunlu: false, ipucu: 'örn. Ekonomik ömrünü doldurdu' },
  ariza:    { baslik: 'Arıza Bildir',   dugme: 'Arıza Bildir', notZorunlu: true,  ipucu: 'Arıza nedeni (zorunlu)' },
}

function IslemModal({ cihaz, islem, kullanici, toast, onKapat, onDegisti }) {
  const bilgi = ISLEMLER[islem]
  const [not, setNot] = useState('')
  const [mesgul, setMesgul] = useState(false)

  const uygula = async () => {
    if (bilgi.notZorunlu && !not.trim()) { toast.error('Açıklama zorunlu.'); return }
    setMesgul(true)
    try {
      let sonuc = null
      if (islem === 'serviste') sonuc = await cihazServiseGonder(cihaz.id, not.trim(), kullanici)
      else if (islem === 'tamir') sonuc = await cihazArizaGiderildi(cihaz.id, not.trim(), kullanici)
      else if (islem === 'hurda') sonuc = await cihazHurdayaAyir(cihaz.id, not.trim(), kullanici)
      else if (islem === 'ariza') sonuc = await cihazArizaBildir(cihaz.id, not.trim(), kullanici)
      if (!sonuc) { toast.error('İşlem kaydedilemedi.'); return }
      toast.success(bilgi.baslik + ' kaydedildi.')
      onDegisti(); onKapat()
    } finally { setMesgul(false) }
  }

  return (
    <Modal open onClose={onKapat} title={`${bilgi.baslik} — ${cihaz.cihazAdi || 'Cihaz'}`} width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-secondary)', margin: 0 }}>
          {cihaz.musteriAd} · {[cihaz.marka, cihaz.model].filter(Boolean).join(' ') || '—'}
          {cihaz.seriNo ? ` · SN: ${cihaz.seriNo}` : ' · SN\'siz'}
        </p>
        <div>
          <Label required={bilgi.notZorunlu}>Açıklama</Label>
          <Textarea rows={2} value={not} onChange={e => setNot(e.target.value)} placeholder={bilgi.ipucu} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onKapat} disabled={mesgul}>Vazgeç</Button>
          <Button variant="primary" onClick={uygula} disabled={mesgul}>
            {mesgul ? 'Kaydediliyor…' : bilgi.dugme}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Hareket geçmişi ──────────────────────────────────────────────────────────
function GecmisModal({ cihaz, onKapat }) {
  const [hareketler, setHareketler] = useState(null)
  useEffect(() => { cihazHareketleriGetir(cihaz.id).then(setHareketler) }, [cihaz.id])

  return (
    <Modal open onClose={onKapat} title={`Hareket Geçmişi — ${cihaz.cihazAdi || 'Cihaz'}`} width={480}>
      {hareketler === null ? (
        <div style={{ padding: 16, color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
      ) : hareketler.length === 0 ? (
        <div style={{ padding: 16, color: 'var(--text-tertiary)' }}>Hareket kaydı yok.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
          {hareketler.map(h => (
            <div key={h.id} style={{
              padding: '8px 12px', border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)', font: '400 12.5px/18px var(--font-sans)',
            }}>
              <div style={{ color: 'var(--text-primary)' }}>{h.aciklama || h.tip}</div>
              <div className="t-caption">
                {h.yapanAd || '—'} · {h.tarih ? new Date(h.tarih).toLocaleString('tr-TR') : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
