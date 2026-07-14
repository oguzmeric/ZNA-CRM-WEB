// Bayi Detayı — sözleşme + zorunlu evrak + 4 adımlı onay + aktivasyon süreci (mig 154).
// Kritik kural (spec §20): imzalı sözleşme ve zorunlu evraklar tamamlanıp yönetici
// onayı verilmeden bayi aktif edilemez; aktif olmayan bayi teklif/Deal Register alamaz.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, FileSignature, Plus, FileUp, ExternalLink, CheckCircle2, XCircle,
  ShieldCheck, ShieldAlert, History, PauseCircle, PlayCircle, Ban,
} from 'lucide-react'
import { Button, Card, Badge, CodeBadge, EmptyState, Label, Input, Table, THead, TBody, TR, TH, TD } from '../components/ui'
import { SkeletonList } from '../components/Skeleton'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { firmaGetir } from '../services/firmaService'
import {
  BAYI_STATULERI, bayiStatu, EVRAK_TIPLERI, EVRAK_DURUMLARI, ONAY_ADIMLARI,
  SOZLESME_DURUMLARI, bayiEksikAlanlar,
  firmaninSozlesmeleri, evraklariGetir, onaylariGetir, sablonlariGetir,
  bayiAktivasyonKontrol, bayiAktifEt, bayiStatuGuncelle, bayiStatuSenkronize,
  evrakYukle, evrakOnayla, evrakReddet, evrakDurumGuncelle, bayiDosyaUrl,
  onayIsle, finansOnayiZorunluMu, bayiBildirim, BAYI_UYARILAR,
} from '../services/bayiService'
import { YeniSozlesmeWizard, SozlesmeGoruntuleModal } from '../components/BayiSozlesmeModallari'

const altiAySonra = () => {
  const d = new Date(); d.setMonth(d.getMonth() + 6)
  return d.toISOString().slice(0, 10)
}

const trTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'

export default function BayiDetay() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { kullanici } = useAuth()
  const admin = kullanici?.rol === 'admin'

  const [firma, setFirma] = useState(null)
  const [sozlesmeler, setSozlesmeler] = useState([])
  const [evraklar, setEvraklar] = useState([])
  const [onaylar, setOnaylar] = useState([])
  const [sablonlar, setSablonlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [wizardAcik, setWizardAcik] = useState(false)
  const [acikSozlesme, setAcikSozlesme] = useState(null)
  const [gecerlilikler, setGecerlilikler] = useState({}) // evrak tipi → tarih (süreli evraklar)
  const dosyaRef = useRef(null)
  const yuklenecekTip = useRef(null)

  const yukle = useCallback(async (statuSenkron = false) => {
    const [f, s, e, o, sab] = await Promise.all([
      firmaGetir(Number(id)),
      firmaninSozlesmeleri(Number(id)),
      evraklariGetir(Number(id)),
      onaylariGetir(Number(id)),
      sablonlariGetir(),
    ])
    if (statuSenkron && f) {
      const yeniStatu = await bayiStatuSenkronize({ firma: f, sozlesmeler: s, evraklar: e, onaylar: o })
      if (yeniStatu !== f.bayiStatusu) f.bayiStatusu = yeniStatu
    }
    setFirma(f); setSozlesmeler(s); setEvraklar(e); setOnaylar(o); setSablonlar(sab)
    setYukleniyor(false)
  }, [id])

  useEffect(() => { yukle() }, [yukle])

  const kontrol = useMemo(
    () => firma ? bayiAktivasyonKontrol({ firma, sozlesmeler, evraklar, onaylar }) : null,
    [firma, sozlesmeler, evraklar, onaylar],
  )
  const eksikAlanlar = useMemo(() => firma ? bayiEksikAlanlar(firma) : [], [firma])
  const statu = bayiStatu(firma?.bayiStatusu || 'aday')

  // Evraklar — bu bayi için gerekli tipler + mevcut kayıt eşleşmesi
  const evrakSatirlari = useMemo(() => {
    const map = new Map(evraklar.map(e => [e.evrakTipi, e]))
    return EVRAK_TIPLERI
      .filter(t => t.zorunlu || (t.kosullu && firma?.vadeTalebi))
      .map(t => ({ tanim: t, kayit: map.get(t.id) || null }))
  }, [evraklar, firma])

  const onayMap = useMemo(() => new Map(onaylar.map(o => [o.adim, o])), [onaylar])
  const sonMizanOnayli = evraklar.find(e => e.evrakTipi === 'son_mizan')?.durum === 'onaylandi'
  const finansZorunlu = firma ? finansOnayiZorunluMu(firma) : false

  // ---- Evrak işlemleri ----

  const dosyaSecAc = (tip) => { yuklenecekTip.current = tip; dosyaRef.current?.click() }

  const dosyaSecildi = async (file) => {
    const tip = yuklenecekTip.current
    if (!file || !tip) return
    const tanim = EVRAK_TIPLERI.find(t => t.id === tip)
    const sonuc = await evrakYukle({
      firmaId: firma.id, tip, file, kullanici,
      gecerlilikTarihi: tanim?.sureli ? (gecerlilikler[tip] || altiAySonra()) : null,
    })
    if (sonuc?._hata) { toast.error(sonuc._hata); return }
    toast.success(`${tanim?.isim || 'Evrak'} yüklendi — kontrol bekliyor.`)
    yukle(true)
  }

  const evrakAc = async (kayit) => {
    const url = await bayiDosyaUrl(kayit.dosyaUrl)
    if (url) window.open(url, '_blank')
    else toast.error('Dosya açılamadı.')
  }

  const onayla = async (kayit) => {
    const s = await evrakOnayla(kayit, kullanici)
    if (s?._hata) { toast.error(s._hata); return }
    toast.success('Evrak onaylandı.')
    yukle(true)
  }

  const reddet = async (kayit) => {
    const sebep = window.prompt('Red sebebi:')
    if (sebep === null) return
    const s = await evrakReddet(kayit, kullanici, sebep.trim())
    if (s?._hata) { toast.error(s._hata); return }
    bayiBildirim(firma, 'Evrak reddedildi', `${firma.firmaAdi} — ${EVRAK_TIPLERI.find(t => t.id === kayit.evrakTipi)?.isim}: ${sebep || 'sebep belirtilmedi'}`)
    toast.success('Evrak reddedildi.')
    yukle(true)
  }

  const yenisiniTalepEt = async (kayit) => {
    const s = await evrakDurumGuncelle(kayit.id, { durum: 'yenisi_talep_edildi' })
    if (s?._hata) { toast.error(s._hata); return }
    toast.success('Evrakın yenisi talep edildi.')
    yukle(true)
  }

  // ---- Onay akışı ----

  const onayVer = async (adim, durum) => {
    if (adim === 'finans' && durum === 'onaylandi' && firma?.vadeTalebi && !sonMizanOnayli) {
      toast.error(BAYI_UYARILAR.mizanEksik)
      return
    }
    let sebep = null
    if (durum === 'reddedildi') {
      sebep = window.prompt('Red sebebi:')
      if (sebep === null) return
    }
    const s = await onayIsle({ firmaId: firma.id, adim, durum, kullanici, sebep })
    if (s?._hata) { toast.error(s._hata); return }
    toast.success(durum === 'onaylandi' ? 'Adım onaylandı.' : 'Adım reddedildi.')
    yukle(true)
  }

  // ---- Aktivasyon / statü ----

  const aktifEt = async () => {
    const onay = await confirm({
      baslik: 'Bayiyi Aktif Et',
      mesaj: `${firma.firmaAdi} aktif bayi statüsüne geçirilsin mi? Teklif, Deal Register ve fiyat listesi yetkileri açılır.`,
      onayMetin: 'Aktif Et', iptalMetin: 'Vazgeç',
    })
    if (!onay) return
    const s = await bayiAktifEt({ firma, sozlesmeler, evraklar, onaylar, kullanici })
    if (s?._hata) {
      toast.error(s._hata)
      return
    }
    toast.success('Bayi aktif edildi. 🎉')
    yukle()
  }

  const statuDegistir = async (yeni, mesaj) => {
    const onay = await confirm({ baslik: 'Bayi Statüsü', mesaj, onayMetin: 'Evet', iptalMetin: 'Vazgeç', tip: yeni === 'kara_liste' ? 'tehlikeli' : undefined })
    if (!onay) return
    const s = await bayiStatuGuncelle(firma.id, yeni)
    if (s?._hata) { toast.error(s._hata); return }
    toast.success('Statü güncellendi.')
    yukle(yeni === 'surece_don')
  }

  const sureceDon = async () => {
    const onay = await confirm({ baslik: 'Sürece Döndür', mesaj: 'Bayi statüsü, sözleşme/evrak/onay durumuna göre yeniden hesaplansın mı?', onayMetin: 'Evet', iptalMetin: 'Vazgeç' })
    if (!onay) return
    await bayiStatuGuncelle(firma.id, 'evrak_bekleniyor') // manuel statüden çıkar
    await yukle(true)
    toast.success('Bayi süreç takibine döndürüldü.')
  }

  if (yukleniyor) return <SkeletonList />
  if (!firma) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyState title="Bayi bulunamadı" description="Kayıt silinmiş olabilir." />
      </div>
    )
  }

  const BILGI = [
    ['Vergi dairesi / no', [firma.vergiDairesi, firma.vergiNo].filter(Boolean).join(' / ')],
    ['MERSİS', firma.mersisNo],
    ['Ticaret sicil no', firma.ticaretSicilNo],
    ['KEP', firma.kepAdresi],
    ['Telefon', firma.telefon],
    ['E-posta', firma.email],
    ['Adres', [firma.adres, firma.ilce, firma.sehir].filter(Boolean).join(' / ')],
    ['Yetkili', firma.yetkiliAdi ? `${firma.yetkiliAdi}${firma.yetkiliUnvani ? ` — ${firma.yetkiliUnvani}` : ''}` : ''],
    ['Yetkili iletişim', [firma.yetkiliTelefon, firma.yetkiliEposta].filter(Boolean).join(' · ')],
    ['Bayi türü', firma.bayiTuru],
    ['Faaliyet alanı', firma.faaliyetAlani],
    ['Ödeme', firma.vadeTalebi ? `Vadeli (${firma.vadeGunu || '?'} gün)${firma.krediLimiti ? ` · limit ${Number(firma.krediLimiti).toLocaleString('tr-TR')} USD` : ''}` : 'Peşin'],
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <button onClick={() => navigate('/bayiler')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', font: '500 12px/16px var(--font-sans)', padding: 0, marginBottom: 6 }}>
            <ArrowLeft size={13} strokeWidth={1.5} /> Bayiler
          </button>
          <h1 className="t-h1" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {firma.firmaAdi}
            <Badge tone={statu.tone}>{statu.isim}</Badge>
            {firma.kod && <CodeBadge>{firma.kod}</CodeBadge>}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" iconLeft={<History size={14} strokeWidth={1.5} />}
            onClick={() => navigate(`/firma-gecmisi/${encodeURIComponent(firma.firmaAdi)}`)}>
            Firma Geçmişi
          </Button>
          {admin && firma.bayiStatusu === 'aktif' && (
            <>
              <Button variant="secondary" iconLeft={<PauseCircle size={14} strokeWidth={1.5} />}
                onClick={() => statuDegistir('askida', 'Bayi askıya alınsın mı? Teklif ve Deal Register yetkileri durur.')}>
                Askıya Al
              </Button>
              <Button variant="ghost" iconLeft={<Ban size={14} strokeWidth={1.5} />} style={{ color: 'var(--danger)' }}
                onClick={() => statuDegistir('kara_liste', 'Bayi kara listeye alınsın mı?')}>
                Kara Liste
              </Button>
            </>
          )}
          {admin && ['askida', 'pasif', 'kara_liste'].includes(firma.bayiStatusu) && (
            <Button variant="secondary" iconLeft={<PlayCircle size={14} strokeWidth={1.5} />} onClick={sureceDon}>
              Sürece Döndür
            </Button>
          )}
        </div>
      </div>

      {/* Aktivasyon durumu paneli */}
      {firma.bayiStatusu === 'aktif' ? (
        <Card style={{ marginBottom: 16, borderColor: 'var(--success)', background: 'var(--success-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: '600 14px/20px var(--font-sans)', color: 'var(--success)' }}>
            <ShieldCheck size={18} strokeWidth={1.75} />
            Bayi aktif. Teklif oluşturabilirsiniz — Deal Register ve fiyat listesi yetkileri açık.
          </div>
        </Card>
      ) : (
        <Card style={{ marginBottom: 16, borderColor: kontrol?.uygun ? 'var(--success)' : 'var(--warning)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: '600 14px/20px var(--font-sans)', color: kontrol?.uygun ? 'var(--success)' : 'var(--warning)', marginBottom: kontrol?.uygun ? 0 : 8 }}>
                {kontrol?.uygun ? <ShieldCheck size={18} strokeWidth={1.75} /> : <ShieldAlert size={18} strokeWidth={1.75} />}
                {kontrol?.uygun
                  ? 'Tüm şartlar tamamlandı — bayi aktivasyona hazır.'
                  : BAYI_UYARILAR.aktifDegil}
              </div>
              {!kontrol?.uygun && (
                <ul style={{ margin: 0, paddingLeft: 24, font: '400 13px/22px var(--font-sans)', color: 'var(--text-secondary)' }}>
                  {kontrol?.eksikler.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
            {admin && (
              <Button variant="primary" disabled={!kontrol?.uygun} onClick={aktifEt}>
                Bayiyi Aktif Et
              </Button>
            )}
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 7fr)', gap: 16, alignItems: 'start' }}>

        {/* Sol — bilgi kartı */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 className="t-h2">Bayi Kartı</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate('/bayiler')}>Bayiler'den düzenle</Button>
          </div>
          {eksikAlanlar.length > 0 && (
            <div style={{ background: 'var(--danger-soft)', borderRadius: 'var(--radius-md)', padding: '8px 12px', marginBottom: 12, font: '400 12.5px/18px var(--font-sans)', color: 'var(--danger)' }}>
              Eksik zorunlu alanlar: {eksikAlanlar.map(e => e.isim).join(', ')}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {BILGI.map(([etiket, deger]) => (
              <div key={etiket} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, font: '400 13px/19px var(--font-sans)' }}>
                <span style={{ color: 'var(--text-tertiary)' }}>{etiket}</span>
                <span style={{ color: deger ? 'var(--text-primary)' : 'var(--danger)', wordBreak: 'break-word' }}>
                  {deger || 'Eksik'}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* Sözleşmeler */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 className="t-h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileSignature size={17} strokeWidth={1.75} /> Bayi Sözleşmeleri
              </h2>
              <Button variant="primary" size="sm" iconLeft={<Plus size={13} strokeWidth={1.5} />} onClick={() => setWizardAcik(true)}>
                Yeni Sözleşme
              </Button>
            </div>
            {sozlesmeler.length === 0 ? (
              <p className="t-caption">Henüz sözleşme üretilmedi. "Yeni Sözleşme" ile başlayın.</p>
            ) : (
              <Table>
                <THead>
                  <TR><TH>No</TH><TH>Tarih</TH><TH>Bitiş</TH><TH>Durum</TH><TH>İmzalı PDF</TH><TH></TH></TR>
                </THead>
                <TBody>
                  {sozlesmeler.map(s => {
                    const d = SOZLESME_DURUMLARI[s.durum] || SOZLESME_DURUMLARI.olusturuldu
                    return (
                      <TR key={s.id}>
                        <TD><strong>{s.sozlesmeNo}</strong>{s.versiyon > 1 && <span className="t-caption"> v{s.versiyon}</span>}</TD>
                        <TD>{trTarih(s.sozlesmeTarihi)}</TD>
                        <TD>{trTarih(s.bitisTarih)}</TD>
                        <TD><Badge tone={d.tone}>{d.isim}</Badge></TD>
                        <TD>{s.imzaliPdfUrl ? <Badge tone="aktif">Yüklendi</Badge> : <span className="t-caption">—</span>}</TD>
                        <TD>
                          <Button variant="ghost" size="sm" onClick={() => setAcikSozlesme(s)}>Görüntüle</Button>
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            )}
          </Card>

          {/* Evraklar */}
          <Card>
            <h2 className="t-h2" style={{ marginBottom: 4 }}>Zorunlu Evraklar</h2>
            <p className="t-caption" style={{ marginBottom: 12 }}>
              Evraklar onaylanmadan bayi aktif edilemez.{firma.vadeTalebi ? ' Vade talebi olduğu için Son Mizan da zorunludur.' : ''}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {evrakSatirlari.map(({ tanim, kayit }) => {
                const durum = EVRAK_DURUMLARI[kayit?.durum || 'bekleniyor']
                return (
                  <div key={tanim.id} style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{tanim.isim}</span>
                          <Badge tone={durum.tone}>{durum.isim}</Badge>
                          {tanim.kosullu && <Badge tone="uyari">Vade koşullu</Badge>}
                          {kayit?.gecerlilikTarihi && (
                            <span className="t-caption">Geçerlilik: {trTarih(kayit.gecerlilikTarihi)}</span>
                          )}
                        </div>
                        {kayit?.redSebebi && kayit.durum === 'reddedildi' && (
                          <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--danger)', marginTop: 2 }}>Red: {kayit.redSebebi}</div>
                        )}
                        {kayit?.yukleyenAd && kayit?.dosyaUrl && (
                          <div className="t-caption" style={{ marginTop: 2 }}>
                            {kayit.dosyaAdi} · {kayit.yukleyenAd} · {trTarih(kayit.yuklemeTarihi)}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {tanim.sureli && (
                          <Input type="date" style={{ width: 140 }}
                            value={gecerlilikler[tanim.id] || kayit?.gecerlilikTarihi || altiAySonra()}
                            onChange={e => setGecerlilikler(g => ({ ...g, [tanim.id]: e.target.value }))} />
                        )}
                        {kayit?.dosyaUrl && (
                          <Button variant="ghost" size="sm" iconLeft={<ExternalLink size={13} strokeWidth={1.5} />} onClick={() => evrakAc(kayit)}>Aç</Button>
                        )}
                        {tanim.id === 'imzali_sozlesme' ? (
                          <span className="t-caption">Sözleşme kartından yüklenir</span>
                        ) : (
                          <Button variant="secondary" size="sm" iconLeft={<FileUp size={13} strokeWidth={1.5} />} onClick={() => dosyaSecAc(tanim.id)}>
                            {kayit?.dosyaUrl ? 'Yeniden Yükle' : 'Yükle'}
                          </Button>
                        )}
                        {admin && kayit?.dosyaUrl && kayit.durum !== 'onaylandi' && (
                          <Button variant="ghost" size="sm" iconLeft={<CheckCircle2 size={13} strokeWidth={1.5} />} style={{ color: 'var(--success)' }} onClick={() => onayla(kayit)}>Onayla</Button>
                        )}
                        {admin && kayit?.dosyaUrl && kayit.durum !== 'reddedildi' && (
                          <Button variant="ghost" size="sm" iconLeft={<XCircle size={13} strokeWidth={1.5} />} style={{ color: 'var(--danger)' }} onClick={() => reddet(kayit)}>Reddet</Button>
                        )}
                        {admin && kayit?.durum === 'onaylandi' && (
                          <Button variant="ghost" size="sm" onClick={() => yenisiniTalepEt(kayit)}>Yenisini Talep Et</Button>
                        )}
                      </div>
                    </div>
                    <p className="t-caption" style={{ marginTop: 6 }}>{tanim.aciklama}</p>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Onay akışı */}
          <Card>
            <h2 className="t-h2" style={{ marginBottom: 4 }}>Onay Akışı</h2>
            <p className="t-caption" style={{ marginBottom: 12 }}>
              Sıra: satış temsilcisi → operasyon/kanal → finans → yönetici. {!finansZorunlu && 'Peşin çalışıldığı için finans adımı opsiyonel.'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
              {ONAY_ADIMLARI.map((adim, idx) => {
                const o = onayMap.get(adim.id)
                const durumRenk = o?.durum === 'onaylandi' ? 'var(--success)' : o?.durum === 'reddedildi' ? 'var(--danger)' : 'var(--text-tertiary)'
                const finansOpsiyonel = adim.id === 'finans' && !finansZorunlu
                return (
                  <div key={adim.id} style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
                    <div style={{ font: '600 12.5px/17px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 4 }}>
                      {idx + 1}. {adim.isim}
                    </div>
                    <div style={{ font: '500 12px/16px var(--font-sans)', color: durumRenk, marginBottom: 6 }}>
                      {o?.durum === 'onaylandi' ? `Onaylandı — ${o.onaylayanAd || ''} ${trTarih(o.tarih)}`
                        : o?.durum === 'reddedildi' ? `Reddedildi${o.sebep ? `: ${o.sebep}` : ''}`
                        : finansOpsiyonel ? 'Opsiyonel (peşin)' : 'Bekliyor'}
                    </div>
                    {admin && o?.durum !== 'onaylandi' && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Button variant="secondary" size="sm" onClick={() => onayVer(adim.id, 'onaylandi')}>Onayla</Button>
                        <Button variant="ghost" size="sm" style={{ color: 'var(--danger)' }} onClick={() => onayVer(adim.id, 'reddedildi')}>Reddet</Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {firma.vadeTalebi && !sonMizanOnayli && (
              <p style={{ marginTop: 10, font: '400 12.5px/18px var(--font-sans)', color: 'var(--warning)' }}>
                ⚠ {BAYI_UYARILAR.mizanEksik}
              </p>
            )}
          </Card>
        </div>
      </div>

      <input ref={dosyaRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
        onChange={e => { dosyaSecildi(e.target.files?.[0]); e.target.value = '' }} />

      {wizardAcik && (
        <YeniSozlesmeWizard
          firmalar={[firma]}
          secilenFirmaId={firma.id}
          sablonlar={sablonlar}
          kullanici={kullanici}
          onKapat={() => setWizardAcik(false)}
          onOlustu={() => { setWizardAcik(false); yukle(true) }}
        />
      )}

      {acikSozlesme && (
        <SozlesmeGoruntuleModal
          sozlesme={acikSozlesme}
          firma={firma}
          sablonlar={sablonlar}
          kullanici={kullanici}
          onKapat={() => setAcikSozlesme(null)}
          onDegisti={() => { setAcikSozlesme(null); yukle(true) }}
        />
      )}
    </div>
  )
}
