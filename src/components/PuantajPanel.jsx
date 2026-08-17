// Puantaj sekmesi (IKYonetim) — brüt maaş girişi + fazla mesai hakediş tablosu.
// Formül kaynağı: kullanıcının verdiği belge (17.08.2026) — hesap TEK KAYNAK
// src/lib/puantajHesap.js'tedir; burada yalnız veri akışı ve sunum var.
// Fazla mesai dakikaları mesai_kayitlari tip='fazla' kayıtlarından gelir
// (puantaj_donem_ozeti RPC); Abdullah satır bazında düzeltebilir, düzeltme
// gerekçesi zorunludur ve rozetle görünür. Erişim RLS'te Abdullah+admin.
import { useState, useEffect, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'
import {
  Wallet, Pencil, AlertTriangle, Settings2, Trash2, RotateCcw, FileSpreadsheet,
} from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import {
  puantajAyarGetir, puantajAyarKaydet, maasKayitlariGetir, maasEkle, maasSil,
  puantajDonemOzeti, puantajDuzeltmelerGetir, puantajDuzeltmeKaydet, puantajDuzeltmeSil,
  tutarBicim,
} from '../services/ikService'
import {
  puantajSatirHesapla, donemMaasiSec, gecerliDakikalar, saatBicim, VARSAYILAN_AYAR,
} from '../lib/puantajHesap'
import {
  Button, Card, Badge, Modal, Input, Label, Textarea,
  Table, THead, TBody, TR, TH, TD, EmptyState,
} from './ui'
import CustomSelect from './CustomSelect'

const AYLAR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

const bugun = new Date()

export default function PuantajPanel({ personeller = [], kullanici }) {
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [yil, setYil] = useState(bugun.getFullYear())
  const [ay, setAy] = useState(bugun.getMonth() + 1)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [ayar, setAyar] = useState(VARSAYILAN_AYAR)
  const [maaslar, setMaaslar] = useState([])
  const [ozet, setOzet] = useState([])
  const [duzeltmeler, setDuzeltmeler] = useState([])

  const [maasModal, setMaasModal] = useState(null)     // personel
  const [duzeltModal, setDuzeltModal] = useState(null) // { personel, satir }
  const [ayarModal, setAyarModal] = useState(false)

  const yukle = useCallback(async () => {
    setYukleniyor(true)
    try {
      const [a, m, o, d] = await Promise.all([
        puantajAyarGetir(), maasKayitlariGetir(),
        puantajDonemOzeti(yil, ay), puantajDuzeltmelerGetir(yil, ay),
      ])
      setAyar(a); setMaaslar(m); setOzet(o); setDuzeltmeler(d)
    } catch (e) {
      toast.error('Puantaj verileri yüklenemedi: ' + (e?.message || 'hata'))
    } finally { setYukleniyor(false) }
  }, [yil, ay])   // eslint-disable-line react-hooks/exhaustive-deps

  // Mikrotask: yukle ilk satırında senkron setState var (react-hooks/set-state-in-effect)
  useEffect(() => { Promise.resolve().then(yukle) }, [yukle])

  const satirlar = useMemo(() => personeller.map(p => {
    const oto = ozet.find(o => o.kullaniciId === p.id) || {}
    const duzeltme = duzeltmeler.find(d => d.kullaniciId === p.id) || null
    const dakikalar = gecerliDakikalar(oto, duzeltme)
    const maasKaydi = donemMaasiSec(maaslar.filter(m => m.kullaniciId === p.id), yil, ay)
    const hesap = puantajSatirHesapla({ brutTutar: maasKaydi?.brutTutar, ...dakikalar, ayar })
    return { personel: p, oto, duzeltme, dakikalar, maasKaydi, hesap }
  }), [personeller, ozet, duzeltmeler, maaslar, yil, ay, ayar])

  const toplamlar = useMemo(() => {
    const maasli = satirlar.filter(s => s.hesap.genelToplam != null)
    return {
      maasliSayi: maasli.length,
      maassizSayi: satirlar.length - maasli.length,
      mesaiToplam: maasli.reduce((t, s) => t + (s.hesap.mesaiToplam || 0), 0),
      genelToplam: maasli.reduce((t, s) => t + (s.hesap.genelToplam || 0), 0),
    }
  }, [satirlar])

  // Ekrandaki hesabın birebir Excel hali (bordro/muhasebe paylaşımı için).
  // Tutarlar HAM SAYI yazılır ki Excel'de toplanabilsin; maaşsız satırın
  // tutar hücreleri BOŞ kalır (0 yazmak "maaş girildi" sanılır), durum
  // Not sütununda açıkça belirtilir. Mesai Raporu künye deseni.
  const excelAktar = () => {
    const kunye = [
      ['PUANTAJ RAPORU'],
      ['Dönem', `${AYLAR[ay - 1]} ${yil}`],
      ['Formül', `Saat ücreti = brüt ÷ ${Number(ayar.aylikSaatBolen)} · Hafta içi ×${Number(ayar.haftaIciKatsayi)} · Pazar ×${Number(ayar.pazarKatsayi)} · Resmî tatil ×${Number(ayar.resmiTatilKatsayi)}`],
      ['Rapor alındı', new Date().toLocaleString('tr-TR')],
      [],
    ]
    const veriler = satirlar.map(({ personel, oto, duzeltme, dakikalar, maasKaydi, hesap }) => {
      const notlar = []
      if (!maasKaydi) notlar.push('Maaş girilmemiş')
      if (dakikalar.duzeltilmis) notlar.push(`Elle düzeltildi: ${duzeltme?.aciklama || ''}`)
      if ((oto.acikKayitSayisi || 0) > 0) notlar.push(`${oto.acikKayitSayisi} açık mesai kaydı hesaba girmedi`)
      return {
        'Personel': personel.ad,
        'Brüt Maaş (₺)': maasKaydi ? Number(maasKaydi.brutTutar) : '',
        'Saat Ücreti (₺)': hesap.saatUcreti ?? '',
        'Hafta İçi FM (saat)': Number(hesap.hiSaat.toFixed(2)),
        'Pazar (saat)': Number(hesap.pzSaat.toFixed(2)),
        'Resmî Tatil (saat)': Number(hesap.rtSaat.toFixed(2)),
        'Mesai Tutarı (₺)': hesap.mesaiToplam ?? '',
        'Toplam Hakediş (₺)': hesap.genelToplam ?? '',
        'Not': notlar.join(' · '),
      }
    })
    veriler.push({
      'Personel': 'TOPLAM',
      'Brüt Maaş (₺)': '',
      'Saat Ücreti (₺)': '',
      'Hafta İçi FM (saat)': '',
      'Pazar (saat)': '',
      'Resmî Tatil (saat)': '',
      'Mesai Tutarı (₺)': toplamlar.mesaiToplam,
      'Toplam Hakediş (₺)': toplamlar.genelToplam,
      'Not': toplamlar.maassizSayi > 0 ? `${toplamlar.maassizSayi} personel maaşsız, toplam dışı` : '',
    })
    const ws = XLSX.utils.aoa_to_sheet(kunye)
    XLSX.utils.sheet_add_json(ws, veriler, { origin: -1 })
    ws['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 13 }, { wch: 17 }, { wch: 12 }, { wch: 16 }, { wch: 15 }, { wch: 17 }, { wch: 40 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `Puantaj ${AYLAR[ay - 1]} ${yil}`)
    XLSX.writeFile(wb, `puantaj-${yil}-${String(ay).padStart(2, '0')}.xlsx`)
    toast.success('Excel indirildi.')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Dönem + ayar şeridi */}
      <Card style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 130 }}>
            <Label>Dönem — Ay</Label>
            <CustomSelect value={String(ay)} onChange={e => setAy(Number(e.target.value))}>
              {AYLAR.map((a, i) => <option key={a} value={String(i + 1)}>{a}</option>)}
            </CustomSelect>
          </div>
          <div style={{ width: 100 }}>
            <Label>Yıl</Label>
            <CustomSelect value={String(yil)} onChange={e => setYil(Number(e.target.value))}>
              {[yil - 1, yil, yil + 1].filter((v, i, a) => a.indexOf(v) === i)
                .concat([2025, 2026, 2027].filter(y => ![yil - 1, yil, yil + 1].includes(y)))
                .sort()
                .map(y => <option key={y} value={String(y)}>{y}</option>)}
            </CustomSelect>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
            Saat ücreti = brüt ÷ {Number(ayar.aylikSaatBolen)} · Hafta içi ×{Number(ayar.haftaIciKatsayi)} · Pazar ×{Number(ayar.pazarKatsayi)} · Resmî tatil ×{Number(ayar.resmiTatilKatsayi)}
          </div>
          <Button variant="ghost" onClick={() => setAyarModal(true)}>
            <Settings2 size={14} strokeWidth={1.7} /> Katsayılar
          </Button>
        </div>
      </Card>

      {/* Hakediş tablosu */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border-default)',
        }}>
          <div style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
            {AYLAR[ay - 1]} {yil} — Hakediş Tablosu
            <span style={{ font: '400 12px/18px var(--font-sans)', color: 'var(--text-tertiary)', marginLeft: 6 }}>
              {satirlar.length} personel
            </span>
          </div>
          <Button variant="ghost" onClick={excelAktar} disabled={yukleniyor || satirlar.length === 0}>
            <FileSpreadsheet size={14} strokeWidth={1.7} /> Excel'e Aktar
          </Button>
        </div>
        {yukleniyor ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
        ) : satirlar.length === 0 ? (
          <EmptyState title="Personel bulunamadı" description="Aktif personel listesi boş." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <THead>
                <TR>
                  <TH>Personel</TH>
                  <TH style={{ textAlign: 'right' }}>Brüt Maaş</TH>
                  <TH style={{ textAlign: 'right' }}>Saat Ücreti</TH>
                  <TH style={{ textAlign: 'right' }}>Hafta İçi FM</TH>
                  <TH style={{ textAlign: 'right' }}>Pazar</TH>
                  <TH style={{ textAlign: 'right' }}>Resmî Tatil</TH>
                  <TH style={{ textAlign: 'right' }}>Mesai Tutarı</TH>
                  <TH style={{ textAlign: 'right' }}>Toplam Hakediş</TH>
                  <TH style={{ width: 90 }}></TH>
                </TR>
              </THead>
              <TBody>
                {satirlar.map(({ personel, oto, duzeltme, dakikalar, maasKaydi, hesap }) => (
                  <TR key={personel.id}>
                    <TD>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600 }}>{personel.ad}</span>
                        {dakikalar.duzeltilmis && (
                          <Badge tone="beklemede" title={duzeltme?.aciklama || ''}>Düzeltildi</Badge>
                        )}
                        {(oto.acikKayitSayisi || 0) > 0 && (
                          <Badge tone="kayip" title="Çıkışı kapanmamış fazla mesai kaydı var — süre hesaba girmedi.">
                            <AlertTriangle size={10} strokeWidth={2} /> {oto.acikKayitSayisi} açık kayıt
                          </Badge>
                        )}
                      </div>
                    </TD>
                    <TD style={{ textAlign: 'right' }}>
                      {maasKaydi
                        ? tutarBicim(maasKaydi.brutTutar)
                        : <Badge tone="kayip">Maaş girilmemiş</Badge>}
                    </TD>
                    <TD style={{ textAlign: 'right' }}>{hesap.saatUcreti != null ? tutarBicim(hesap.saatUcreti) : '—'}</TD>
                    <TD style={{ textAlign: 'right' }}>{saatBicim(hesap.hiSaat)} sa</TD>
                    <TD style={{ textAlign: 'right' }}>{saatBicim(hesap.pzSaat)} sa</TD>
                    <TD style={{ textAlign: 'right' }}>{saatBicim(hesap.rtSaat)} sa</TD>
                    <TD style={{ textAlign: 'right', fontWeight: 600 }}>
                      {hesap.mesaiToplam != null ? tutarBicim(hesap.mesaiToplam) : '—'}
                    </TD>
                    <TD style={{ textAlign: 'right', fontWeight: 700 }}>
                      {hesap.genelToplam != null ? tutarBicim(hesap.genelToplam) : '—'}
                    </TD>
                    <TD>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button
                          type="button" title="Maaş gir / geçmiş"
                          onClick={() => setMaasModal(personel)}
                          style={ikonBtnStil}
                        ><Wallet size={13} strokeWidth={1.7} /></button>
                        <button
                          type="button" title="Saatleri düzelt"
                          onClick={() => setDuzeltModal({ personel, oto, duzeltme })}
                          style={ikonBtnStil}
                        ><Pencil size={13} strokeWidth={1.7} /></button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
        {/* Toplam şeridi */}
        {!yukleniyor && satirlar.length > 0 && (
          <div style={{
            display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center',
            padding: '10px 14px', borderTop: '1px solid var(--border-default)',
            background: 'var(--surface-muted, #f8fafc)',
            font: '500 12.5px/18px var(--font-sans)',
          }}>
            <span>Mesai toplamı: <b>{tutarBicim(toplamlar.mesaiToplam)}</b></span>
            <span>Genel hakediş (maaş + mesai): <b>{tutarBicim(toplamlar.genelToplam)}</b></span>
            {toplamlar.maassizSayi > 0 && (
              <span style={{ color: 'var(--danger)' }}>
                ⚠ {toplamlar.maassizSayi} personelin maaşı girilmediği için toplamlara dahil değil
              </span>
            )}
          </div>
        )}
      </Card>

      {maasModal && (
        <MaasModal
          personel={maasModal}
          maaslar={maaslar.filter(m => m.kullaniciId === maasModal.id)}
          yil={yil} ay={ay} kullanici={kullanici}
          onKapat={() => setMaasModal(null)}
          onDegisti={yukle}
          toast={toast} confirm={confirm}
        />
      )}
      {duzeltModal && (
        <DuzeltModal
          {...duzeltModal}
          yil={yil} ay={ay} kullanici={kullanici}
          onKapat={() => setDuzeltModal(null)}
          onDegisti={yukle}
          toast={toast} confirm={confirm}
        />
      )}
      {ayarModal && (
        <AyarModal
          ayar={ayar} kullanici={kullanici}
          onKapat={() => setAyarModal(false)}
          onDegisti={yukle}
          toast={toast}
        />
      )}
    </div>
  )
}

const ikonBtnStil = {
  background: 'transparent', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', width: 26, height: 26,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', color: 'var(--text-secondary)',
}

// ── Maaş girişi + geçmiş ──────────────────────────────────────────────────
function MaasModal({ personel, maaslar, yil, ay, kullanici, onKapat, onDegisti, toast, confirm }) {
  const donemBasi = `${yil}-${String(ay).padStart(2, '0')}-01`
  const [baslangic, setBaslangic] = useState(donemBasi)
  const [tutar, setTutar] = useState('')
  const [not, setNot] = useState('')
  const [mesgul, setMesgul] = useState(false)

  const kaydet = async () => {
    const t = Number(String(tutar).replace(',', '.'))
    if (!(t > 0)) { toast.error('Geçerli bir brüt tutar girin.'); return }
    if (!baslangic) { toast.error('Geçerlilik başlangıcı gerekli.'); return }
    setMesgul(true)
    try {
      await maasEkle({
        kullaniciId: personel.id, gecerliBaslangic: baslangic,
        brutTutar: t, not: not.trim(), ekleyenId: kullanici?.id,
      })
      toast.success('Maaş kaydedildi.')
      onDegisti()
      onKapat()
    } catch (e) {
      toast.error(e?.message || 'Kaydedilemedi.')
    } finally { setMesgul(false) }
  }

  const sil = async (m) => {
    const onay = await confirm({
      baslik: 'Maaş Kaydını Sil',
      mesaj: `${fmtTarihKisa(m.gecerliBaslangic)} başlangıçlı ${tutarBicim(m.brutTutar)} kaydı silinecek. Bu kayda dayanan dönem hesapları değişir. Emin misin?`,
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    try {
      await maasSil(m.id)
      toast.success('Kayıt silindi.')
      onDegisti()
    } catch (e) { toast.error(e?.message || 'Silinemedi.') }
  }

  return (
    <Modal open onClose={onKapat} title={`Maaş — ${personel.ad}`} width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label required>Geçerlilik başlangıcı</Label>
            <Input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)} />
          </div>
          <div>
            <Label required>Brüt maaş (₺)</Label>
            <Input type="number" min="0" step="0.01" value={tutar}
              onChange={e => setTutar(e.target.value)} placeholder="örn. 45000" autoFocus />
          </div>
        </div>
        <div>
          <Label>Not</Label>
          <Input value={not} onChange={e => setNot(e.target.value)} placeholder="örn. Ağustos zammı" />
        </div>
        <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', margin: 0 }}>
          Zam geldiğinde eskisini silmeyin — yeni başlangıç tarihiyle yeni kayıt ekleyin.
          Her dönem, o ay geçerli olan maaşla hesaplanır; geçmiş dönem raporları değişmez.
        </p>

        {maaslar.length > 0 && (
          <div>
            <Label>Maaş geçmişi</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {maaslar.map(m => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                  border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                  font: '400 12.5px/18px var(--font-sans)',
                }}>
                  <span style={{ fontWeight: 600 }}>{fmtTarihKisa(m.gecerliBaslangic)}</span>
                  <span style={{ flex: 1 }}>{tutarBicim(m.brutTutar)}</span>
                  {m.not && <span style={{ color: 'var(--text-tertiary)' }}>{m.not}</span>}
                  <button type="button" title="Sil" onClick={() => sil(m)} style={ikonBtnStil}>
                    <Trash2 size={12} strokeWidth={1.7} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onKapat} disabled={mesgul}>Kapat</Button>
          <Button variant="primary" onClick={kaydet} disabled={mesgul}>
            {mesgul ? 'Kaydediliyor…' : 'Maaşı Kaydet'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Saat düzeltme ─────────────────────────────────────────────────────────
function DuzeltModal({ personel, oto = {}, duzeltme, yil, ay, kullanici, onKapat, onDegisti, toast, confirm }) {
  const dkToSaatStr = (dk) => dk == null ? '' : String(Math.round((dk / 60) * 100) / 100)
  const [hiSaat, setHiSaat] = useState(dkToSaatStr(duzeltme?.haftaIciDakika))
  const [pzSaat, setPzSaat] = useState(dkToSaatStr(duzeltme?.pazarDakika))
  const [rtSaat, setRtSaat] = useState(duzeltme?.resmiTatilDakika ? dkToSaatStr(duzeltme.resmiTatilDakika) : '')
  const [aciklama, setAciklama] = useState(duzeltme?.aciklama || '')
  const [mesgul, setMesgul] = useState(false)

  const saatToDk = (s) => {
    const t = String(s).trim().replace(',', '.')
    if (t === '') return null
    const n = Number(t)
    if (!Number.isFinite(n) || n < 0) return undefined   // geçersiz işareti
    return Math.round(n * 60)
  }

  const kaydet = async () => {
    const hi = saatToDk(hiSaat), pz = saatToDk(pzSaat), rt = saatToDk(rtSaat)
    if (hi === undefined || pz === undefined || rt === undefined) {
      toast.error('Saat alanlarına geçerli sayı girin (boş = otomatik değer).')
      return
    }
    if (!aciklama.trim()) { toast.error('Düzeltme gerekçesi zorunlu.'); return }
    setMesgul(true)
    try {
      await puantajDuzeltmeKaydet({
        kullaniciId: personel.id, donemYil: yil, donemAy: ay,
        haftaIciDakika: hi, pazarDakika: pz, resmiTatilDakika: rt ?? 0,
        aciklama: aciklama.trim(), duzeltenId: kullanici?.id,
      })
      toast.success('Düzeltme kaydedildi.')
      onDegisti()
      onKapat()
    } catch (e) {
      toast.error(e?.message || 'Kaydedilemedi.')
    } finally { setMesgul(false) }
  }

  const duzeltmeyiKaldir = async () => {
    const onay = await confirm({
      baslik: 'Düzeltmeyi Kaldır',
      mesaj: 'Bu dönemin elle düzeltmesi silinecek, satır tamamen otomatik mesai kayıtlarına dönecek. Emin misin?',
      onayMetin: 'Evet, kaldır', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    try {
      await puantajDuzeltmeSil(duzeltme.id)
      toast.success('Düzeltme kaldırıldı.')
      onDegisti()
      onKapat()
    } catch (e) { toast.error(e?.message || 'Kaldırılamadı.') }
  }

  return (
    <Modal open onClose={onKapat} title={`Saat Düzelt — ${personel.ad} (${AYLAR[ay - 1]} ${yil})`} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', margin: 0 }}>
          Otomatik (QR mesai kayıtlarından): hafta içi <b>{saatBicim((oto.haftaIciDakika || 0) / 60)} sa</b> ·
          Pazar <b>{saatBicim((oto.pazarDakika || 0) / 60)} sa</b>.
          Boş bırakılan alan otomatik değeriyle kalır; resmî tatil yalnız elle girilir.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <Label>Hafta içi FM (saat)</Label>
            <Input type="number" min="0" step="0.25" value={hiSaat}
              onChange={e => setHiSaat(e.target.value)} placeholder="otomatik" />
          </div>
          <div>
            <Label>Pazar (saat)</Label>
            <Input type="number" min="0" step="0.25" value={pzSaat}
              onChange={e => setPzSaat(e.target.value)} placeholder="otomatik" />
          </div>
          <div>
            <Label>Resmî tatil (saat)</Label>
            <Input type="number" min="0" step="0.25" value={rtSaat}
              onChange={e => setRtSaat(e.target.value)} placeholder="0" />
          </div>
        </div>
        <div>
          <Label required>Gerekçe</Label>
          <Textarea rows={2} value={aciklama} onChange={e => setAciklama(e.target.value)}
            placeholder="örn. 15.08 çıkışı unutulmuş, saha sorumlusu teyidiyle 3 saat" />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          {duzeltme
            ? <Button variant="ghost" onClick={duzeltmeyiKaldir} disabled={mesgul}>
                <RotateCcw size={13} strokeWidth={1.7} /> Otomatiğe Dön
              </Button>
            : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={onKapat} disabled={mesgul}>Vazgeç</Button>
            <Button variant="primary" onClick={kaydet} disabled={mesgul}>
              {mesgul ? 'Kaydediliyor…' : 'Düzeltmeyi Kaydet'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Katsayı ayarları ──────────────────────────────────────────────────────
function AyarModal({ ayar, kullanici, onKapat, onDegisti, toast }) {
  const [bolen, setBolen] = useState(String(ayar.aylikSaatBolen))
  const [hi, setHi] = useState(String(ayar.haftaIciKatsayi))
  const [pz, setPz] = useState(String(ayar.pazarKatsayi))
  const [rt, setRt] = useState(String(ayar.resmiTatilKatsayi))
  const [mesgul, setMesgul] = useState(false)

  const kaydet = async () => {
    const sayi = (s) => Number(String(s).replace(',', '.'))
    const b = sayi(bolen), h = sayi(hi), p = sayi(pz), r = sayi(rt)
    if (![b, h, p, r].every(n => Number.isFinite(n) && n > 0)) {
      toast.error('Tüm değerler sıfırdan büyük sayı olmalı.')
      return
    }
    setMesgul(true)
    try {
      await puantajAyarKaydet({
        aylikSaatBolen: b, haftaIciKatsayi: h, pazarKatsayi: p, resmiTatilKatsayi: r,
        guncelleyenId: kullanici?.id,
      })
      toast.success('Katsayılar güncellendi.')
      onDegisti()
      onKapat()
    } catch (e) {
      toast.error(e?.message || 'Kaydedilemedi.')
    } finally { setMesgul(false) }
  }

  return (
    <Modal open onClose={onKapat} title="Puantaj Katsayıları" width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', margin: 0 }}>
          Değişiklik tüm dönem hesaplarına anında yansır (kayıtlı tutar yok, hesap her açılışta yapılır).
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label>Aylık saat böleni</Label>
            <Input type="number" min="1" step="0.5" value={bolen} onChange={e => setBolen(e.target.value)} />
          </div>
          <div>
            <Label>Hafta içi katsayısı</Label>
            <Input type="number" min="0.1" step="0.05" value={hi} onChange={e => setHi(e.target.value)} />
          </div>
          <div>
            <Label>Pazar katsayısı</Label>
            <Input type="number" min="0.1" step="0.05" value={pz} onChange={e => setPz(e.target.value)} />
          </div>
          <div>
            <Label>Resmî tatil katsayısı</Label>
            <Input type="number" min="0.1" step="0.05" value={rt} onChange={e => setRt(e.target.value)} />
          </div>
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

const fmtTarihKisa = (t) => t ? new Date(t + 'T00:00:00').toLocaleDateString('tr-TR') : '—'
