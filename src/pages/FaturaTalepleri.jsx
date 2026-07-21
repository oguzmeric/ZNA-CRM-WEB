// "Fatura Oluşturulacak" kuyruğu (mig 165).
//
// Satışçı teklif üzerinden NUMARASIZ talep açar; burada fatura yetkilisi
// (Abdullah + adminler) gerçek faturayı keser, numarasını girer ve PDF'ini
// yükler. satislar kaydı YALNIZ burada oluşur — talep aşaması ciroya sızmaz.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Receipt, FileUp, ExternalLink, CheckCircle2, XCircle, RotateCcw, Clock, Send, Printer, X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useBildirim } from '../context/BildirimContext'
import { SkeletonList } from '../components/Skeleton'
import BelgePaylasModal from '../components/BelgePaylasModal'
import MentionTextarea from '../components/MentionTextarea'
import { EkSecici, EkListesi } from '../components/EkAlani'
import { ekleriYukle } from '../lib/ekDosya'
import { parseMentions, segmentMetin } from '../lib/mention'
import {
  faturaTalebiYorumlariGetir, faturaTalebiYorumEkle, faturaTalebiYorumSil,
} from '../services/faturaTalebiYorumService'
import {
  Button, Card, Badge, CodeBadge, EmptyState, Input, Label, Textarea, Select, Avatar,
} from '../components/ui'
import { ODEME_TIPLERI_SS } from '../lib/satisSozlesmeMaddeleri'
import {
  faturaTalepleriGetir, faturayiKaydet, faturaTalebiReddet, faturaTalebiGeriAl,
  faturaDosyaUrl, irsaliyeKaydet, faturaPdfDegistir, faturaPdfSil, irsaliyeSil,
  faturaYetkisi, FATURA_TALEP_DURUM_META,
} from '../services/faturaTalepService'

// Sayfa "Proforma Fatura" (2026-07-15 terim düzeltmesi: numarasız ön fatura =
// proforma). DB tarafı değişmedi — tablo fatura_talepleri, numara FTL- kalır.
const SEKMELER = [
  { id: 'bekliyor',    label: 'Bekleyen' },
  { id: 'faturalandi', label: 'Faturalanan' },
  { id: 'reddedildi',  label: 'Reddedilen' },
]

const PARA_SEMBOL = { TL: '₺', USD: '$', EUR: '€' }
const fmtPara = (n, pb) => `${PARA_SEMBOL[pb] || '₺'}${(Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'
const bugun = () => new Date().toISOString().slice(0, 10)

export default function FaturaTalepleri() {
  const navigate = useNavigate()
  const { kullanici, kullanicilar } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [sekme, setSekme] = useState('bekliyor')
  const [talepler, setTalepler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [secili, setSecili] = useState(null)

  const yetkili = faturaYetkisi(kullanici)
  // Tam iskelet YALNIZ ilk yüklemede. Eskiden her sekme tıklamasında tüm sayfa
  // (sekmeler dahil) SkeletonList'e dönüp geri geliyordu — "yanıp sönme" buydu.
  const [ilkYukleme, setIlkYukleme] = useState(true)

  const yukle = useCallback(async () => {
    if (!yetkili) { setYukleniyor(false); return }
    setYukleniyor(true)
    const veri = await faturaTalepleriGetir(sekme)
    setTalepler(veri || [])
    setYukleniyor(false)
    setIlkYukleme(false)
  }, [sekme, yetkili])

  useEffect(() => { yukle(); setSecili(null) }, [yukle])

  // MainLayout içerik alanına dolgu vermez — her sayfa kendini sarar
  // (Teklifler ile aynı: padding 24 + maxWidth). Bu unutulmuştu, açıklama
  // metni sol kenara yapışıktı.
  const sayfaStil = {
    padding: 24, maxWidth: 1440, margin: '0 auto',
    display: 'flex', flexDirection: 'column', gap: 16,
  }

  // Guard'a ek ikinci savunma — rota bypass edilse bile veri görünmesin
  if (!yetkili) {
    return (
      <div style={sayfaStil}>
        <EmptyState
          icon={<Receipt size={40} strokeWidth={1.2} />}
          title="Bu sayfayı görme yetkiniz yok"
          description="Proforma Fatura kuyruğu yalnızca fatura yetkililerine açıktır."
        />
      </div>
    )
  }

  if (yukleniyor && ilkYukleme) {
    return <div style={sayfaStil}><SkeletonList /></div>
  }

  return (
    <div style={sayfaStil}>
      {/* Başlık MainLayout'ta zaten yazıyor — sayfada tekrar etmiyoruz. */}
      <p className="t-caption" style={{ margin: 0, color: 'var(--text-tertiary)' }}>
        Tekliften kesilen proforma faturalar. Gerçek faturayı kesip numarasını ve PDF'ini buraya girin —
        satış kaydı ancak o zaman oluşur.
      </p>

      {/* Sekmeler — Teklifler/Sözleşmeler ile aynı alt-çizgi deseni.
          Kalınlık HER ZAMAN 600: eskiden aktif olunca 500→600 değişiyordu,
          yazı genişleyip yanındaki sekmeler zıplıyordu ("garip tepki"). */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border-default)', flexWrap: 'wrap' }}>
        {SEKMELER.map(s => {
          const aktif = sekme === s.id
          return (
            <button key={s.id} type="button" onClick={() => setSekme(s.id)}
              style={{
                padding: '10px 14px', marginBottom: -1,
                background: 'transparent', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${aktif ? 'var(--brand-primary)' : 'transparent'}`,
                color: aktif ? 'var(--brand-primary)' : 'var(--text-secondary)',
                font: '600 11px/16px var(--font-sans)',
                textTransform: 'uppercase', letterSpacing: '0.04em',
                transition: 'color 120ms, border-color 120ms',
              }}
              onMouseEnter={e => { if (!aktif) e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { if (!aktif) e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      {secili && (
        <TalepDetay
          talep={secili}
          kullanici={kullanici}
          kullanicilar={kullanicilar}
          onKapat={() => setSecili(null)}
          onTamamlandi={() => { setSecili(null); yukle() }}
          navigate={navigate}
          toast={toast}
          confirm={confirm}
        />
      )}

      {/* Sekme geçişinde YALNIZ içerik alanı yüklenir — sekmeler yerinde kalır.
          Eski sekmenin verisi de gösterilmez (yanıltıcı olurdu). */}
      {!secili && yukleniyor && (
        <Card>
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', font: '400 13px/18px var(--font-sans)' }}>
            Yükleniyor…
          </div>
        </Card>
      )}

      {!secili && !yukleniyor && (
        talepler.length === 0 ? (
          <EmptyState
            icon={<Receipt size={40} strokeWidth={1.2} />}
            title={sekme === 'bekliyor' ? 'Bekleyen proforma yok'
              : sekme === 'faturalandi' ? 'Henüz faturalanmış proforma yok'
              : 'Reddedilmiş proforma yok'}
            description={sekme === 'bekliyor' ? 'Satış ekibi tekliften proforma kestiğinde burada görünür.' : ''}
          />
        ) : (
          <Card>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  {/* Başlıklar gövdeyle BİREBİR aynı sayıda olmalı. Eskiden
                      'Fatura No' koşulu boş bir <th> bırakıyordu → sekme
                      'faturalandi' değilken 8 başlık / 7 hücre = sütunlar kayıyordu. */}
                  <tr style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', textAlign: 'left' }}>
                    {[
                      'Proforma No', 'Müşteri', 'Teklif', 'Tutar', 'Oluşturan', 'Tarih',
                      ...(sekme === 'faturalandi' ? ['Fatura No'] : []),
                      '',
                    ].map((h, i) => (
                      <th key={i} style={{
                        padding: '8px 12px', borderBottom: '1px solid var(--border-default)',
                        whiteSpace: 'nowrap',
                        textAlign: h === 'Tutar' ? 'right' : 'left',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {talepler.map(t => (
                    <tr key={t.id}
                      style={{ font: '400 13px/18px var(--font-sans)', transition: 'background 120ms' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-sunken)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <td style={hucre}><CodeBadge>{t.talepNo}</CodeBadge></td>
                      <td style={{ ...hucre, fontWeight: 500 }}>{t.firmaAdi}</td>
                      <td style={hucre}>{t.teklifNo || '—'}</td>
                      <td className="tabular-nums" style={{ ...hucre, fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'right' }}>{fmtPara(t.genelToplam, t.paraBirimi)}</td>
                      <td style={hucre}>{t.talepEdenAd || '—'}</td>
                      <td style={{ ...hucre, whiteSpace: 'nowrap' }}>{fmtTarih(t.talepTarihi)}</td>
                      {sekme === 'faturalandi' && <td style={hucre}><CodeBadge>{t.faturaNo}</CodeBadge></td>}
                      <td style={{ ...hucre, textAlign: 'right' }}>
                        <Button variant="secondary" size="sm" onClick={() => setSecili(t)}>
                          {sekme === 'bekliyor' ? 'Faturayı Kes' : 'Aç'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      )}
    </div>
  )
}

const hucre = { padding: '10px 12px', borderBottom: '1px solid var(--border-default)' }

function TalepDetay({ talep, kullanici, kullanicilar, onKapat, onTamamlandi, navigate, toast, confirm }) {
  const { bildirimEkle } = useBildirim()
  const [faturaNo, setFaturaNo] = useState(talep.faturaNo || '')
  const [faturaTarihi, setFaturaTarihi] = useState(talep.faturaTarihi || bugun())
  const [odemeSekli, setOdemeSekli] = useState(talep.odemeSekli || '')
  const [dosya, setDosya] = useState(null)
  const [irsaliyeDosya, setIrsaliyeDosya] = useState(null)
  const [redAcik, setRedAcik] = useState(false)
  const [redNedeni, setRedNedeni] = useState('')
  const [mesgul, setMesgul] = useState(false)
  const [gonderAcik, setGonderAcik] = useState(false)
  const dosyaRef = useRef(null)
  const irsaliyeRef = useRef(null)
  const irsaliyeSonradanRef = useRef(null)
  const faturaPdfDegistirRef = useRef(null)

  // Yorumlar (mig 214) — muhasebe↔satış onay yazışması + @mention + ek
  const [yorumlar, setYorumlar] = useState([])
  const [yeniYorum, setYeniYorum] = useState('')
  const [yorumEkleri, setYorumEkleri] = useState([])
  const [yorumGonderiliyor, setYorumGonderiliyor] = useState(false)

  useEffect(() => {
    let iptal = false
    faturaTalebiYorumlariGetir(talep.id).then(y => { if (!iptal) setYorumlar(y) }).catch(() => {})
    return () => { iptal = true }
  }, [talep.id])

  const bekliyor = talep.durum === 'bekliyor'
  const meta = FATURA_TALEP_DURUM_META[talep.durum] || FATURA_TALEP_DURUM_META.bekliyor

  const kaydet = async () => {
    setMesgul(true)
    try {
      const sonuc = await faturayiKaydet({ talep, faturaNo, faturaTarihi, dosya, irsaliyeDosya, kullanici, odemeSekli })
      if (sonuc?._hata) { toast.error(sonuc._hata); return }
      toast.success(`${faturaNo} kaydedildi — Satış Faturaları'na eklendi.`)
      onTamamlandi()
    } finally {
      setMesgul(false)
    }
  }

  const reddet = async () => {
    setMesgul(true)
    try {
      const sonuc = await faturaTalebiReddet({ talep, redNedeni, kullanici })
      if (sonuc?._hata) { toast.error(sonuc._hata); return }
      toast.success('Proforma reddedildi — satış ekibine bildirildi.')
      onTamamlandi()
    } finally {
      setMesgul(false)
    }
  }

  const geriAl = async () => {
    const onay = await confirm({
      baslik: 'Proformayı Kuyruğa Al',
      mesaj: `${talep.talepNo} tekrar "fatura bekleyen" durumuna dönecek. Devam edilsin mi?`,
      onayMetin: 'Kuyruğa al', iptalMetin: 'Vazgeç',
    })
    if (!onay) return
    const sonuc = await faturaTalebiGeriAl(talep.id)
    if (sonuc?._hata) { toast.error(sonuc._hata); return }
    onTamamlandi()
  }

  const pdfAc = async () => {
    const url = await faturaDosyaUrl(talep.faturaPdfYol)
    if (!url) { toast.error('PDF açılamadı.'); return }
    window.open(url, '_blank', 'noopener')
  }

  const irsaliyeAc = async () => {
    const url = await faturaDosyaUrl(talep.irsaliyeYol)
    if (!url) { toast.error('İrsaliye açılamadı.'); return }
    window.open(url, '_blank', 'noopener')
  }

  // Faturalandıktan sonra irsaliye ekleme/değiştirme
  const irsaliyeSonradanYukle = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setMesgul(true)
    try {
      const sonuc = await irsaliyeKaydet(talep, f)
      if (sonuc?._hata) { toast.error(sonuc._hata); return }
      toast.success('İrsaliye kaydedildi.')
      onTamamlandi()
    } finally {
      setMesgul(false)
    }
  }

  // Faturalandıktan sonra fatura PDF'ini değiştir (yanlış dosya yüklendiyse)
  const faturaPdfDegistirYukle = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setMesgul(true)
    try {
      const sonuc = await faturaPdfDegistir(talep, f)
      if (sonuc?._hata) { toast.error(sonuc._hata); return }
      toast.success('Fatura PDF değiştirildi.')
      onTamamlandi()
    } finally {
      setMesgul(false)
    }
  }

  const faturaPdfSilTikla = async () => {
    const onay = await confirm({
      baslik: 'Fatura PDF sil',
      mesaj: 'Yüklü fatura PDF kaldırılacak. Müşteriye gönderebilmek için yeni bir PDF yüklemeniz gerekir. Devam edilsin mi?',
      onayMetin: 'Sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    setMesgul(true)
    try {
      const sonuc = await faturaPdfSil(talep)
      if (sonuc?._hata) { toast.error(sonuc._hata); return }
      toast.success('Fatura PDF kaldırıldı.')
      onTamamlandi()
    } finally {
      setMesgul(false)
    }
  }

  const irsaliyeSilTikla = async () => {
    const onay = await confirm({
      baslik: 'İrsaliye sil',
      mesaj: 'Yüklü irsaliye kaldırılacak. Devam edilsin mi?',
      onayMetin: 'Sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    setMesgul(true)
    try {
      const sonuc = await irsaliyeSil(talep)
      if (sonuc?._hata) { toast.error(sonuc._hata); return }
      toast.success('İrsaliye kaldırıldı.')
      onTamamlandi()
    } finally {
      setMesgul(false)
    }
  }

  const kunye = [
    ['Firma', talep.firmaAdi], ['Yetkili', talep.yetkiliAdi],
    ['Vergi No', talep.vergiNo], ['Vergi Dairesi', talep.vergiDairesi],
    ['Adres', talep.adres], ['Telefon', talep.telefon], ['E-posta', talep.email],
  ]
  const eksik = ['vergiNo', 'vergiDairesi', 'adres'].filter(k => !talep[k])

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <CodeBadge>{talep.talepNo}</CodeBadge>
          <Badge tone={meta.tone}>{meta.isim}</Badge>
          <span style={{ font: '600 15px/22px var(--font-sans)' }}>{talep.firmaAdi}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {talep.teklifId && (
              <Button variant="tertiary" size="sm" iconLeft={<ExternalLink size={13} strokeWidth={1.5} />}
                onClick={() => navigate(`/teklifler/${talep.teklifId}`)}>
                {talep.teklifNo || 'Teklife git'}
              </Button>
            )}
            <Button variant="secondary" size="sm" iconLeft={<Printer size={13} strokeWidth={1.5} />}
              onClick={() => window.open(`/fatura-talepleri/${talep.id}/yazdir`, '_blank', 'noopener')}>
              Proforma Yazdır
            </Button>
            <Button variant="secondary" size="sm" onClick={onKapat}>Kapat</Button>
          </div>
        </div>

        {talep.talepNotu && (
          <div style={{
            background: 'var(--info-soft)', border: '1px solid var(--info)', borderRadius: 8,
            padding: '10px 12px', font: '400 12.5px/1.5 var(--font-sans)',
          }}>
            <strong>{talep.talepEdenAd || 'Satış'}:</strong> {talep.talepNotu}
          </div>
        )}

        {talep.durum === 'reddedildi' && talep.redNedeni && (
          <div style={{
            background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 8,
            padding: '10px 12px', font: '400 12.5px/1.5 var(--font-sans)', color: 'var(--danger)',
          }}>
            <strong>Red nedeni:</strong> {talep.redNedeni}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div>
            <div style={baslikSt}>Müşteri Künyesi</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', font: '400 12.5px/18px var(--font-sans)' }}>
              <tbody>
                {kunye.map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ ...miniHucre, color: 'var(--text-tertiary)', width: 110 }}>{k}</td>
                    <td style={{ ...miniHucre, color: v ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{v || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {eksik.length > 0 && bekliyor && (
              <div style={{ font: '400 11.5px/16px var(--font-sans)', color: 'var(--warning)', marginTop: 6 }}>
                ⚠ Vergi/adres bilgisi eksik — gerekirse proformayı reddedip satıştan tamamlamasını isteyin.
              </div>
            )}
          </div>

          <div>
            <div style={baslikSt}>Tutar</div>
            <div style={{ background: 'var(--surface-sunken)', borderRadius: 8, padding: '10px 12px' }}>
              {[['Ara toplam', talep.araToplam], ['KDV', talep.kdvToplam]].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', font: '400 12.5px/20px var(--font-sans)', color: 'var(--text-secondary)' }}>
                  <span>{k}</span><span>{fmtPara(v, talep.paraBirimi)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', font: '700 15px/24px var(--font-sans)', borderTop: '1px solid var(--border-default)', marginTop: 4, paddingTop: 4 }}>
                <span>Fatura Tutarı</span><span>{fmtPara(talep.genelToplam, talep.paraBirimi)}</span>
              </div>
              {talep.odemeSekli && (
                <div style={{ font: '400 11.5px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                  Ödeme: {talep.odemeSekli}
                </div>
              )}
            </div>
            <div style={{ font: '400 11.5px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 6 }}>
              Talep: {talep.talepEdenAd} · {fmtTarih(talep.talepTarihi)}
              {talep.faturalayanAd && ` · İşleyen: ${talep.faturalayanAd} · ${fmtTarih(talep.faturalamaTarihi)}`}
            </div>
          </div>
        </div>

        <div>
          <div style={baslikSt}>Kalemler ({(talep.kalemler || []).length})</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', font: '400 12.5px/18px var(--font-sans)' }}>
              <thead>
                <tr style={{ color: 'var(--text-tertiary)', textAlign: 'left' }}>
                  <th style={miniHucre}>Kod</th><th style={miniHucre}>Ürün</th>
                  <th style={{ ...miniHucre, textAlign: 'right' }}>Miktar</th>
                  <th style={{ ...miniHucre, textAlign: 'right' }}>Birim Fiyat</th>
                  <th style={{ ...miniHucre, textAlign: 'right' }}>KDV</th>
                  <th style={{ ...miniHucre, textAlign: 'right' }}>Toplam</th>
                </tr>
              </thead>
              <tbody>
                {(talep.kalemler || []).map((k, i) => (
                  <tr key={i}>
                    <td style={miniHucre}>{k.stokKodu || '—'}</td>
                    <td style={miniHucre}>{k.urunAdi}</td>
                    <td style={{ ...miniHucre, textAlign: 'right' }}>{k.miktar} {k.birim}</td>
                    <td style={{ ...miniHucre, textAlign: 'right' }}>{fmtPara(k.birimFiyat, talep.paraBirimi)}</td>
                    <td style={{ ...miniHucre, textAlign: 'right' }}>%{k.kdvOran}</td>
                    <td style={{ ...miniHucre, textAlign: 'right', fontWeight: 600 }}>{fmtPara(k.satirToplam, talep.paraBirimi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---- Faturalama ---- */}
        {bekliyor && (
          <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 14 }}>
            <div style={baslikSt}>Kesilen Fatura</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div>
                <Label required>Fatura No</Label>
                <Input value={faturaNo} onChange={e => setFaturaNo(e.target.value)} placeholder="Ör. ZNA2026000000123" />
              </div>
              <div>
                <Label>Fatura Tarihi</Label>
                <Input type="date" value={faturaTarihi} onChange={e => setFaturaTarihi(e.target.value)} />
              </div>
              <div>
                <Label>Ödeme Yöntemi</Label>
                <Select value={odemeSekli} onChange={e => setOdemeSekli(e.target.value)}>
                  <option value="">Seç…</option>
                  {ODEME_TIPLERI_SS.map(o => <option key={o.id} value={o.isim}>{o.isim}</option>)}
                </Select>
              </div>
              <div>
                <Label>Fatura PDF</Label>
                <input ref={dosyaRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
                  onChange={e => setDosya(e.target.files?.[0] || null)} />
                <Button variant="secondary" style={{ width: '100%' }}
                  iconLeft={<FileUp size={14} strokeWidth={1.5} />}
                  onClick={() => dosyaRef.current?.click()}>
                  {dosya ? dosya.name.slice(0, 24) : 'PDF Seç'}
                </Button>
              </div>
              <div>
                <Label>İrsaliye (opsiyonel)</Label>
                <input ref={irsaliyeRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
                  onChange={e => setIrsaliyeDosya(e.target.files?.[0] || null)} />
                <Button variant="secondary" style={{ width: '100%' }}
                  iconLeft={<FileUp size={14} strokeWidth={1.5} />}
                  onClick={() => irsaliyeRef.current?.click()}>
                  {irsaliyeDosya ? irsaliyeDosya.name.slice(0, 24) : 'İrsaliye Seç'}
                </Button>
              </div>
            </div>
            <p className="t-caption" style={{ margin: '6px 0 0', color: 'var(--text-tertiary)' }}>
              Gerçek fatura muhasebe / e-arşiv sisteminde kesilir — buraya o faturanın
              PDF'ini yükleyin. CRM'de saklanır ve "Müşteriye Gönder" bu dosyayı iletir.
              İrsaliye (PDF veya fotoğraf) de aynı kayda eklenir.
            </p>

            {redAcik && (
              <div style={{ marginTop: 12 }}>
                <Label required>Red nedeni</Label>
                <Textarea rows={2} value={redNedeni} onChange={e => setRedNedeni(e.target.value)}
                  placeholder="Ör. Müşteri vergi bilgileri eksik — kartı güncelleyip tekrar talep açın" />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              {!redAcik ? (
                <>
                  <Button variant="primary" onClick={kaydet} disabled={mesgul}
                    iconLeft={<CheckCircle2 size={14} strokeWidth={1.5} />}>
                    {mesgul ? 'Kaydediliyor…' : 'Faturayı Kaydet'}
                  </Button>
                  <Button variant="secondary" onClick={() => setRedAcik(true)}
                    iconLeft={<XCircle size={14} strokeWidth={1.5} />}>
                    Proformayı Reddet
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="danger" onClick={reddet} disabled={mesgul}>
                    {mesgul ? 'Gönderiliyor…' : 'Reddet ve Bildir'}
                  </Button>
                  <Button variant="secondary" onClick={() => { setRedAcik(false); setRedNedeni('') }}>Vazgeç</Button>
                </>
              )}
            </div>
          </div>
        )}

        {talep.durum === 'faturalandi' && (
          <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 14 }}>
            <div style={baslikSt}>Kesilen Fatura</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <CodeBadge>{talep.faturaNo}</CodeBadge>
              <span style={{ font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                {fmtTarih(talep.faturaTarihi)}
              </span>
              {/* Fatura PDF — görüntüle / değiştir / sil (yanlış dosya yüklenmişse) */}
              <input ref={faturaPdfDegistirRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
                onChange={faturaPdfDegistirYukle} />
              {talep.faturaPdfYol ? (
                <>
                  <Button variant="secondary" size="sm" iconLeft={<ExternalLink size={13} strokeWidth={1.5} />} onClick={pdfAc}>
                    {talep.faturaPdfAd || 'PDF'}
                  </Button>
                  <Button variant="tertiary" size="sm" disabled={mesgul}
                    onClick={() => faturaPdfDegistirRef.current?.click()}>
                    Faturayı Değiştir
                  </Button>
                  <Button variant="tertiary" size="sm" disabled={mesgul} onClick={faturaPdfSilTikla}
                    style={{ color: 'var(--text-danger, #c62828)' }}>
                    Faturayı Sil
                  </Button>
                </>
              ) : (
                <Button variant="secondary" size="sm" disabled={mesgul}
                  iconLeft={<FileUp size={13} strokeWidth={1.5} />}
                  onClick={() => faturaPdfDegistirRef.current?.click()}>
                  Fatura PDF Yükle
                </Button>
              )}
              <input ref={irsaliyeSonradanRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
                onChange={irsaliyeSonradanYukle} />
              {talep.irsaliyeYol ? (
                <>
                  <Button variant="secondary" size="sm" iconLeft={<ExternalLink size={13} strokeWidth={1.5} />} onClick={irsaliyeAc}>
                    📄 {talep.irsaliyeAd?.slice(0, 20) || 'İrsaliye'}
                  </Button>
                  <Button variant="tertiary" size="sm" disabled={mesgul}
                    onClick={() => irsaliyeSonradanRef.current?.click()}>
                    İrsaliyeyi Değiştir
                  </Button>
                  <Button variant="tertiary" size="sm" disabled={mesgul} onClick={irsaliyeSilTikla}
                    style={{ color: 'var(--text-danger, #c62828)' }}>
                    İrsaliyeyi Sil
                  </Button>
                </>
              ) : (
                <Button variant="secondary" size="sm" disabled={mesgul}
                  iconLeft={<FileUp size={13} strokeWidth={1.5} />}
                  onClick={() => irsaliyeSonradanRef.current?.click()}>
                  İrsaliye Yükle
                </Button>
              )}
              {talep.satisId && (
                <Button variant="tertiary" size="sm" onClick={() => navigate(`/satislar/${talep.satisId}`)}>
                  Satış kaydına git
                </Button>
              )}
              {talep.faturaPdfYol && (
                <Button variant="primary" size="sm" iconLeft={<Send size={13} strokeWidth={1.5} />}
                  onClick={() => setGonderAcik(true)}>
                  Müşteriye Gönder
                </Button>
              )}
            </div>
            <BelgePaylasModal
              acik={gonderAcik}
              onKapat={() => setGonderAcik(false)}
              belgeTipi="fatura"
              belgeId={talep.id}
              baslangicEmail={talep.email || ''}
              baslangicGsm={talep.telefon || ''}
              baslangicOzelMesaj={`${talep.faturaNo} numaralı faturanız ektedir. Tutar: ${fmtPara(talep.genelToplam, talep.paraBirimi)}.`}
              belgeBaslik={`${talep.faturaNo} — ${talep.firmaAdi}`}
            />
          </div>
        )}

        {talep.durum === 'reddedildi' && (
          <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 14 }}>
            <Button variant="secondary" onClick={geriAl} iconLeft={<RotateCcw size={14} strokeWidth={1.5} />}>
              Tekrar Kuyruğa Al
            </Button>
          </div>
        )}

        {/* Yorumlar (mig 214) — muhasebe müdürü taslak fatura görselini ekler,
            satış müdürünü @ ile etiketler; onay/görüş burada yürür. */}
        <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 14, marginTop: 14 }}>
          <div style={baslikSt}>
            Yorumlar {yorumlar.length > 0 && <span className="tabular-nums">({yorumlar.length})</span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {yorumlar.length === 0 && (
              <p style={{ font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-tertiary)', margin: 0 }}>
                Henüz yorum yok. Taslak faturayı ekleyip ilgili kişiyi @ ile etiketleyerek onay isteyebilirsiniz.
              </p>
            )}
            {yorumlar.map(yorum => {
              const benimMi = yorum.yazarId?.toString() === kullanici?.id?.toString()
              return (
                <div key={yorum.id} style={{
                  background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)', padding: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Avatar name={yorum.yazar} size="xs" />
                      <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{yorum.yazar}</span>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>{yorum.tarih}</span>
                      {benimMi && (
                        <button
                          aria-label="Sil"
                          onClick={async () => {
                            try {
                              await faturaTalebiYorumSil(yorum.id)
                              setYorumlar(prev => prev.filter(y => y.id !== yorum.id))
                            } catch { toast.error('Yorum silinemedi.') }
                          }}
                          style={{
                            width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'transparent', border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                          }}
                        >
                          <X size={11} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </div>
                  <p style={{ font: '400 13px/20px var(--font-sans)', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap' }}>
                    {segmentMetin(yorum.icerik, kullanicilar || []).map((seg, i) =>
                      seg.tip === 'mention'
                        ? <span key={i} style={{ color: 'var(--brand-primary)', fontWeight: 600, background: 'var(--brand-primary-soft)', padding: '0 4px', borderRadius: 3 }}>{seg.deger}</span>
                        : <span key={i}>{seg.deger}</span>)}
                  </p>
                  <EkListesi dosyalar={yorum.dosyalar} />
                </div>
              )
            })}
          </div>

          <MentionTextarea
            rows={3}
            value={yeniYorum}
            onChange={setYeniYorum}
            kullanicilar={kullanicilar || []}
            placeholder="Yorum yaz… (@ ile etiketle, Ctrl+V ile ekran görüntüsü yapıştır)"
            style={{ marginBottom: 8 }}
            onResimYapistir={(resimler) => setYorumEkleri(prev => [...prev, ...resimler])}
          />
          <div style={{ marginBottom: 8 }}>
            <EkSecici dosyalar={yorumEkleri} onChange={setYorumEkleri} disabled={yorumGonderiliyor} />
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={yorumGonderiliyor}
            onClick={async () => {
              if (!yeniYorum.trim() && yorumEkleri.length === 0) return
              setYorumGonderiliyor(true)
              try {
                const dosyalar = yorumEkleri.length ? await ekleriYukle('yorum-ekleri', yorumEkleri) : []
                const metin = yeniYorum.trim()
                const eklenen = await faturaTalebiYorumEkle({
                  talepId: talep.id, kullaniciId: kullanici.id,
                  yazarAd: kullanici.ad, icerik: metin || '(ek)', dosyalar,
                })
                setYorumlar(prev => [...prev, eklenen])
                // @mention'lara bildirim (yazan hariç) — proforma numarası + firma
                const proNo = talep.talepNo || talep.faturaNo || `#${talep.id}`
                const mentionIdler = parseMentions(metin, kullanicilar || [])
                  .filter(mid => mid?.toString() !== kullanici.id?.toString())
                for (const aliciId of mentionIdler) {
                  bildirimEkle(
                    aliciId,
                    `${kullanici.ad} sizi bir proforma faturada etiketledi`,
                    `${proNo} (${talep.firmaAdi || 'Müşteri'}): ${metin.slice(0, 80)}${metin.length > 80 ? '…' : ''}`,
                    'mention',
                    '/fatura-talepleri',
                  ).catch(() => {})
                }
                setYeniYorum('')
                setYorumEkleri([])
              } catch (e) {
                toast.error('Yorum eklenemedi: ' + (e?.message || 'bağlantıyı kontrol edin'))
              } finally {
                setYorumGonderiliyor(false)
              }
            }}
          >
            {yorumGonderiliyor ? 'Gönderiliyor…' : 'Yorum ekle'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

const baslikSt = {
  font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
}
const miniHucre = { padding: '5px 8px', borderBottom: '1px solid var(--border-default)' }
