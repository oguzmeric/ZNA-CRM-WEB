// "Fatura Oluşturulacak" kuyruğu (mig 165).
//
// Satışçı teklif üzerinden NUMARASIZ talep açar; burada fatura yetkilisi
// (Abdullah + adminler) gerçek faturayı keser, numarasını girer ve PDF'ini
// yükler. satislar kaydı YALNIZ burada oluşur — talep aşaması ciroya sızmaz.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Receipt, FileUp, ExternalLink, CheckCircle2, XCircle, RotateCcw, Clock, Send,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { SkeletonList } from '../components/Skeleton'
import BelgePaylasModal from '../components/BelgePaylasModal'
import {
  Button, Card, Badge, CodeBadge, EmptyState, Input, Label, Textarea,
} from '../components/ui'
import {
  faturaTalepleriGetir, faturayiKaydet, faturaTalebiReddet, faturaTalebiGeriAl,
  faturaDosyaUrl, faturaYetkisi, FATURA_TALEP_DURUM_META,
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
  const { kullanici } = useAuth()
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

function TalepDetay({ talep, kullanici, onKapat, onTamamlandi, navigate, toast, confirm }) {
  const [faturaNo, setFaturaNo] = useState(talep.faturaNo || '')
  const [faturaTarihi, setFaturaTarihi] = useState(talep.faturaTarihi || bugun())
  const [dosya, setDosya] = useState(null)
  const [redAcik, setRedAcik] = useState(false)
  const [redNedeni, setRedNedeni] = useState('')
  const [mesgul, setMesgul] = useState(false)
  const [gonderAcik, setGonderAcik] = useState(false)
  const dosyaRef = useRef(null)

  const bekliyor = talep.durum === 'bekliyor'
  const meta = FATURA_TALEP_DURUM_META[talep.durum] || FATURA_TALEP_DURUM_META.bekliyor

  const kaydet = async () => {
    setMesgul(true)
    try {
      const sonuc = await faturayiKaydet({ talep, faturaNo, faturaTarihi, dosya, kullanici })
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
                <Label>Fatura PDF</Label>
                <input ref={dosyaRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
                  onChange={e => setDosya(e.target.files?.[0] || null)} />
                <Button variant="secondary" style={{ width: '100%' }}
                  iconLeft={<FileUp size={14} strokeWidth={1.5} />}
                  onClick={() => dosyaRef.current?.click()}>
                  {dosya ? dosya.name.slice(0, 24) : 'PDF Seç'}
                </Button>
              </div>
            </div>

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
              {talep.faturaPdfYol && (
                <Button variant="secondary" size="sm" iconLeft={<ExternalLink size={13} strokeWidth={1.5} />} onClick={pdfAc}>
                  {talep.faturaPdfAd || 'PDF'}
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
      </div>
    </Card>
  )
}

const baslikSt = {
  font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
}
const miniHucre = { padding: '5px 8px', borderBottom: '1px solid var(--border-default)' }
