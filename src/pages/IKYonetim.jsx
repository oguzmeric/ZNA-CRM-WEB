// İK Yönetim — izin onayları + bordro yükleme/yönetimi (rota: /ik-yonetim).
// Erişim guard'ı rota seviyesinde (ik_yonetim modülü / admin) — burada tekrar kontrol YOK.
// Desen kaynağı: KisiselDokumanlar.jsx (sekme, Card/Button/Badge, CustomSelect).

import { useState, useEffect, useMemo } from 'react'
import {
  CalendarCheck, Upload, FolderOpen, CheckCircle2, XCircle,
  Download, Trash2, FileText, Clock, Users, Printer,
} from 'lucide-react'
import { izinFormuYazdir } from '../lib/izinFormu'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import {
  IZIN_TURLERI, IZIN_DURUM, izinDurumBilgi,
  izinTalepleriGetir, izinKarar,
  bordrolariGetir, bordroYukle, bordroIndirUrl, bordroSil,
} from '../services/ikService'
import {
  Button, Input, Textarea, Label, Card, Badge, EmptyState, Modal,
  Table, THead, TBody, TR, TH, TD,
} from '../components/ui'
import CustomSelect from '../components/CustomSelect'

const AYLAR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

const fmtTarih = (t) => t ? new Date(t + (String(t).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('tr-TR') : '—'
const turIsim = (id) => IZIN_TURLERI.find(t => t.id === id)?.isim || id || '—'

// IZIN_DURUM tone'ları ('basari'/'nötr') Badge TONE haritasıyla birebir örtüşmüyor —
// Badge bilinmeyen tone'u neutral'a düşürür, onaylandı gri görünürdü. Köprü:
const BADGE_TONE = { basari: 'basarili', 'nötr': 'neutral', beklemede: 'beklemede', kayip: 'kayip' }
const durumBadge = (durum) => {
  const b = izinDurumBilgi(durum) || IZIN_DURUM[durum] || { isim: durum, tone: 'nötr' }
  return <Badge tone={BADGE_TONE[b.tone] || b.tone}>{b.isim}</Badge>
}

const SEKMELER = [
  { id: 'izin',      label: 'İzin Onayları',    ikon: CalendarCheck },
  { id: 'yukle',     label: 'Bordro Yükle',     ikon: Upload },
  { id: 'bordrolar', label: 'Yüklü Bordrolar',  ikon: FolderOpen },
]

export default function IKYonetim() {
  const { kullanici } = useAuth()
  const { toast } = useToast()

  const [sekme, setSekme] = useState('izin')
  const [yukleniyor, setYukleniyor] = useState(true)
  const [izinler, setIzinler] = useState([])
  const [bordrolar, setBordrolar] = useState([])
  const [personeller, setPersoneller] = useState([])

  // Sekme 1 — izin onayları
  const [durumFiltre, setDurumFiltre] = useState('')
  const [kararModal, setKararModal] = useState(null)   // { talep, durum: 'onaylandi'|'reddedildi' }

  // Sekme 3 — yüklü bordrolar filtresi
  const [bordroPersonelFiltre, setBordroPersonelFiltre] = useState('')

  const yukle = async () => {
    setYukleniyor(true)
    try {
      const [iz, bo] = await Promise.all([izinTalepleriGetir(), bordrolariGetir()])
      setIzinler(iz || [])
      setBordrolar(bo || [])
    } catch (e) {
      toast.error(e?.message || 'Veriler yüklenemedi.')
    } finally { setYukleniyor(false) }
  }

  useEffect(() => {
    yukle()
    // Personel listesi: müşteri hesapları ve silinmiş hesaplar HARİÇ
    supabase.from('kullanicilar')
      .select('id, ad, hesap_silindi')
      .neq('tip', 'musteri')
      .order('ad')
      .then(({ data }) => setPersoneller((data || []).filter(k => !k.hesap_silindi)))
  }, [])

  const personelAd = (id) => personeller.find(p => String(p.id) === String(id))?.ad || `#${id}`

  // ── KPI şeridi ────────────────────────────────────────────────────────
  const buYil = new Date().getFullYear()
  const kpi = useMemo(() => {
    const onayliGun = izinler
      .filter(t => t.durum === 'onaylandi' && new Date(t.baslangic).getFullYear() === buYil)
      .reduce((top, t) => top + (Number(t.gunSayisi) || 0), 0)
    const bekleyen = izinler.filter(t => t.durum === 'bekliyor').length
    return { onayliGun, bekleyen }
  }, [izinler, buYil])

  const bekleyenler = useMemo(
    () => izinler.filter(t => t.durum === 'bekliyor'),
    [izinler],
  )

  const tumListe = useMemo(() => {
    let liste = izinler
    if (durumFiltre) liste = liste.filter(t => t.durum === durumFiltre)
    return liste
  }, [izinler, durumFiltre])

  const bordroListe = useMemo(() => {
    let liste = bordrolar
    if (bordroPersonelFiltre) liste = liste.filter(b => String(b.kullaniciId) === bordroPersonelFiltre)
    return [...liste].sort((a, b) =>
      (b.donemYil - a.donemYil) || (b.donemAy - a.donemAy) || (String(a.kullaniciId).localeCompare(String(b.kullaniciId))))
  }, [bordrolar, bordroPersonelFiltre])

  const bordroIndir = async (b) => {
    try {
      const url = await bordroIndirUrl(b.dosyaYol)
      window.open(url, '_blank')
    } catch (e) { toast.error(e?.message || 'İndirme linki alınamadı.') }
  }

  const bordroKaldir = async (b) => {
    if (!confirm(`${personelAd(b.kullaniciId)} — ${AYLAR[b.donemAy - 1]} ${b.donemYil} bordrosu silinsin mi?`)) return
    try {
      await bordroSil(b.id, b.dosyaYol)
      toast.success('Bordro silindi.')
      const bo = await bordrolariGetir()
      setBordrolar(bo || [])
    } catch (e) { toast.error(e?.message || 'Silme hatası.') }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 className="t-h1" style={{ margin: 0 }}>İK Yönetim</h1>
        <p className="t-caption" style={{ color: 'var(--text-tertiary)', marginTop: 4 }}>
          İzin taleplerini karara bağla, personel bordrolarını yükle ve yönet.
        </p>
      </div>

      {/* KPI şeridi */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Card style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: 'var(--warning-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Clock size={20} style={{ color: 'var(--warning)' }} />
          </div>
          <div>
            <div style={{ font: '700 22px/26px var(--font-sans)', color: 'var(--text-primary)' }}>{kpi.bekleyen}</div>
            <div className="t-caption" style={{ color: 'var(--text-tertiary)' }}>Bekleyen izin talebi</div>
          </div>
        </Card>
        <Card style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: 'var(--success-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <CalendarCheck size={20} style={{ color: 'var(--success)' }} />
          </div>
          <div>
            <div style={{ font: '700 22px/26px var(--font-sans)', color: 'var(--text-primary)' }}>{kpi.onayliGun}</div>
            <div className="t-caption" style={{ color: 'var(--text-tertiary)' }}>{buYil} onaylanan izin günü</div>
          </div>
        </Card>
      </div>

      {/* Sekmeler */}
      <div style={{
        display: 'inline-flex', background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
        borderRadius: 10, padding: 3, marginBottom: 16,
      }}>
        {SEKMELER.map(s => {
          const aktif = sekme === s.id
          const Icon = s.ikon
          return (
            <button key={s.id} onClick={() => setSekme(s.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 7,
                background: aktif ? 'var(--brand-primary)' : 'transparent',
                color: aktif ? '#fff' : 'var(--text-secondary)',
                border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}>
              <Icon size={14} /> {s.label}
              {s.id === 'izin' && kpi.bekleyen > 0 && (
                <span style={{
                  minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999,
                  background: aktif ? 'rgba(255,255,255,0.25)' : 'var(--danger)',
                  color: '#fff', font: '700 11px/18px var(--font-sans)', textAlign: 'center',
                }}>
                  {kpi.bekleyen}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {yukleniyor ? (
        <Card><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</div></Card>
      ) : (
        <>
          {sekme === 'izin' && (
            <IzinOnaylari
              bekleyenler={bekleyenler}
              tumListe={tumListe}
              durumFiltre={durumFiltre}
              setDurumFiltre={setDurumFiltre}
              personelAd={personelAd}
              onKarar={(talep, durum) => setKararModal({ talep, durum })}
            />
          )}

          {sekme === 'yukle' && (
            <BordroYukleForm
              personeller={personeller}
              kullanici={kullanici}
              onYuklendi={async () => { const bo = await bordrolariGetir(); setBordrolar(bo || []) }}
            />
          )}

          {sekme === 'bordrolar' && (
            <YukluBordrolar
              bordroListe={bordroListe}
              personeller={personeller}
              personelAd={personelAd}
              bordroPersonelFiltre={bordroPersonelFiltre}
              setBordroPersonelFiltre={setBordroPersonelFiltre}
              onIndir={bordroIndir}
              onSil={bordroKaldir}
            />
          )}
        </>
      )}

      {kararModal && (
        <KararModal
          talep={kararModal.talep}
          durum={kararModal.durum}
          personelAd={personelAd}
          onaylayanId={kullanici?.id}
          onKapat={() => setKararModal(null)}
          onKaydedildi={async () => { setKararModal(null); await yukle() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Sekme 1: İzin Onayları
function IzinOnaylari({ bekleyenler, tumListe, durumFiltre, setDurumFiltre, personelAd, onKarar }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Bekleyenler — vurgulu blok */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Clock size={16} style={{ color: 'var(--warning)' }} />
          <span style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
            Bekleyen Talepler ({bekleyenler.length})
          </span>
        </div>

        {bekleyenler.length === 0 ? (
          <Card>
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              <CheckCircle2 size={22} style={{ color: 'var(--success)', marginBottom: 6 }} />
              <div>Bekleyen izin talebi yok — hepsi karara bağlanmış.</div>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bekleyenler.map(t => (
              <Card key={t.id} style={{
                padding: 14, borderLeft: '3px solid var(--warning)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
                      {personelAd(t.kullaniciId)}
                    </span>
                    <Badge tone="brand">{turIsim(t.tur)}</Badge>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {fmtTarih(t.baslangic)} — {fmtTarih(t.bitis)}
                    </span>
                    <Badge tone="beklemede">{Number(t.gunSayisi) || 0} gün</Badge>
                  </div>
                  {t.aciklama && (
                    <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6 }}>
                      {t.aciklama}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                    Talep tarihi: {fmtTarih(t.olusturmaTarih)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <Button variant="secondary" size="sm" iconLeft={<Printer size={13} />}
                    onClick={() => izinFormuYazdir(t, { ad: personelAd(t.kullaniciId) })}>
                    Form
                  </Button>
                  <Button variant="primary" size="sm" iconLeft={<CheckCircle2 size={13} />}
                    onClick={() => onKarar(t, 'onaylandi')}>
                    Onayla
                  </Button>
                  <Button variant="secondary" size="sm" iconLeft={<XCircle size={13} />}
                    style={{ color: 'var(--danger)' }}
                    onClick={() => onKarar(t, 'reddedildi')}>
                    Reddet
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Tümü — durum filtreli liste */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
            Tüm Talepler
          </span>
          <CustomSelect value={durumFiltre} onChange={e => setDurumFiltre(e.target.value)} style={{ minWidth: 180 }} className="w-auto">
            <option value="">Tümü</option>
            {Object.entries(IZIN_DURUM).map(([id, d]) => (
              <option key={id} value={id}>{d.isim}</option>
            ))}
          </CustomSelect>
        </div>

        {tumListe.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck size={40} strokeWidth={1.5} />}
            title="Kayıt yok"
            description="Seçili durumda izin talebi bulunmuyor."
          />
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <Table>
                <THead>
                  <TR>
                    <TH>Personel</TH>
                    <TH>Tür</TH>
                    <TH>Tarih Aralığı</TH>
                    <TH>Gün</TH>
                    <TH>Durum</TH>
                    <TH>Açıklama / Karar Notu</TH>
                    <TH></TH>
                  </TR>
                </THead>
                <TBody>
                  {tumListe.map(t => (
                    <TR key={t.id}>
                      <TD style={{ fontWeight: 600 }}>{personelAd(t.kullaniciId)}</TD>
                      <TD>{turIsim(t.tur)}</TD>
                      <TD style={{ whiteSpace: 'nowrap' }}>{fmtTarih(t.baslangic)} — {fmtTarih(t.bitis)}</TD>
                      <TD>{Number(t.gunSayisi) || 0}</TD>
                      <TD>{durumBadge(t.durum)}</TD>
                      <TD style={{ maxWidth: 260 }}>
                        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                          {t.aciklama || '—'}
                          {t.kararNotu && (
                            <span style={{ color: 'var(--text-tertiary)' }}> · Karar: {t.kararNotu}</span>
                          )}
                        </span>
                      </TD>
                      <TD style={{ whiteSpace: 'nowrap' }}>
                        <Button variant="tertiary" size="sm" iconLeft={<Printer size={12} />}
                          onClick={() => izinFormuYazdir(t, { ad: personelAd(t.kullaniciId) })}>
                          Form
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Karar modalı — reddetmede not ZORUNLU, onayda opsiyonel
function KararModal({ talep, durum, personelAd, onaylayanId, onKapat, onKaydedildi }) {
  const { toast } = useToast()
  const [not, setNot] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const reddet = durum === 'reddedildi'

  const kaydet = async () => {
    if (reddet && !not.trim()) { toast.error('Reddetme sebebini yaz — personel görecek.'); return }
    setKaydediliyor(true)
    try {
      await izinKarar(talep.id, { durum, onaylayanId, kararNotu: not.trim() || null })
      toast.success(reddet ? 'Talep reddedildi.' : 'Talep onaylandı.')
      await onKaydedildi()
    } catch (e) {
      toast.error(e?.message || 'Karar kaydedilemedi.')
    } finally { setKaydediliyor(false) }
  }

  return (
    <Modal
      open
      onClose={onKapat}
      title={reddet ? 'Talebi Reddet' : 'Talebi Onayla'}
      width={460}
      footer={
        <>
          <Button variant="secondary" onClick={onKapat} disabled={kaydediliyor}>Vazgeç</Button>
          <Button
            variant={reddet ? 'danger' : 'primary'}
            onClick={kaydet}
            disabled={kaydediliyor}
            iconLeft={reddet ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
          >
            {kaydediliyor ? 'Kaydediliyor…' : (reddet ? 'Reddet' : 'Onayla')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{
          background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)',
          padding: '10px 12px', fontSize: 13, color: 'var(--text-secondary)',
        }}>
          <strong style={{ color: 'var(--text-primary)' }}>{personelAd(talep.kullaniciId)}</strong>
          {' · '}{turIsim(talep.tur)}
          {' · '}{fmtTarih(talep.baslangic)} — {fmtTarih(talep.bitis)}
          {' · '}{Number(talep.gunSayisi) || 0} gün
          {talep.aciklama && <div style={{ marginTop: 4, fontSize: 12.5 }}>{talep.aciklama}</div>}
        </div>

        <div>
          <Label required={reddet}>Karar notu {reddet ? '(zorunlu)' : '(opsiyonel)'}</Label>
          <Textarea
            rows={3}
            autoFocus
            value={not}
            onChange={e => setNot(e.target.value)}
            placeholder={reddet ? 'Reddetme sebebi — personel bu notu görecek…' : 'İstersen kısa bir not bırak…'}
          />
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Sekme 2: Bordro Yükle
function BordroYukleForm({ personeller, kullanici, onYuklendi }) {
  const { toast } = useToast()
  const simdi = new Date()
  const [personelId, setPersonelId] = useState('')
  // Varsayılan: bir önceki ay (bordro genelde geçen ayın belgesidir)
  const oncekiAy = simdi.getMonth() === 0 ? 12 : simdi.getMonth()
  const oncekiAyYil = simdi.getMonth() === 0 ? simdi.getFullYear() - 1 : simdi.getFullYear()
  const [yil, setYil] = useState(String(oncekiAyYil))
  const [ay, setAy] = useState(String(oncekiAy))
  const [dosya, setDosya] = useState(null)
  const [aciklama, setAciklama] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)

  const yillar = [simdi.getFullYear() - 1, simdi.getFullYear(), simdi.getFullYear() + 1]

  const dosyaSec = (f) => {
    if (!f) { setDosya(null); return }
    const pdfMi = f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
    if (!pdfMi) { toast.error('Sadece PDF dosyası yüklenebilir.'); setDosya(null); return }
    setDosya(f)
  }

  const gonder = async () => {
    if (!personelId) { toast.error('Personel seç.'); return }
    if (!dosya) { toast.error('PDF dosyası seç.'); return }
    setYukleniyor(true)
    try {
      await bordroYukle({
        kullaniciId: Number(personelId),
        yil: Number(yil),
        ay: Number(ay),
        dosya,
        aciklama: aciklama.trim() || null,
        yukleyenId: kullanici?.id,
      })
      toast.success(`${AYLAR[Number(ay) - 1]} ${yil} bordrosu yüklendi.`)
      setDosya(null)
      setAciklama('')
      await onYuklendi()
    } catch (e) {
      toast.error(e?.message || 'Bordro yüklenemedi.')
    } finally { setYukleniyor(false) }
  }

  return (
    <Card style={{ maxWidth: 560, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <FileText size={16} style={{ color: 'var(--brand-primary)' }} />
        <span style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
          Bordro Yükle
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <Label required>Personel</Label>
          <CustomSelect value={personelId} onChange={e => setPersonelId(e.target.value)}>
            <option value="">Personel seç…</option>
            {personeller.map(p => (
              <option key={p.id} value={p.id}>{p.ad}</option>
            ))}
          </CustomSelect>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label required>Yıl</Label>
            <CustomSelect value={yil} onChange={e => setYil(e.target.value)}>
              {yillar.map(y => <option key={y} value={String(y)}>{y}</option>)}
            </CustomSelect>
          </div>
          <div>
            <Label required>Ay</Label>
            <CustomSelect value={ay} onChange={e => setAy(e.target.value)}>
              {AYLAR.map((a, i) => <option key={i + 1} value={String(i + 1)}>{a}</option>)}
            </CustomSelect>
          </div>
        </div>

        <div>
          <Label required>PDF Dosyası</Label>
          <input
            type="file"
            accept="application/pdf"
            onChange={e => dosyaSec(e.target.files?.[0] || null)}
            style={{
              padding: 8, background: 'var(--surface-sunken)', borderRadius: 8,
              border: '1px solid var(--border-default)', width: '100%', color: 'var(--text-primary)', fontSize: 13,
            }}
          />
          {dosya && (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
              {dosya.name} · {(dosya.size / (1024 * 1024)).toFixed(2)} MB
            </div>
          )}
        </div>

        <div>
          <Label>Açıklama (opsiyonel)</Label>
          <Input value={aciklama} onChange={e => setAciklama(e.target.value)} placeholder="Örn: İkramiye dahil" />
        </div>

        <div style={{
          background: 'var(--info-soft)', borderRadius: 'var(--radius-md)',
          padding: '8px 12px', fontSize: 12, color: 'var(--info)',
        }}>
          Aynı döneme tekrar yüklersen eski dosya değişir — personel her dönemde tek bordro görür.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" iconLeft={<Upload size={14} />} onClick={gonder} disabled={yukleniyor}>
            {yukleniyor ? 'Yükleniyor…' : 'Yükle'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Sekme 3: Yüklü Bordrolar
function YukluBordrolar({
  bordroListe, personeller, personelAd,
  bordroPersonelFiltre, setBordroPersonelFiltre, onIndir, onSil,
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
          <Users size={15} /> Yüklü Bordrolar ({bordroListe.length})
        </span>
        <CustomSelect value={bordroPersonelFiltre} onChange={e => setBordroPersonelFiltre(e.target.value)} style={{ minWidth: 220 }} className="w-auto">
          <option value="">Tüm personel</option>
          {personeller.map(p => (
            <option key={p.id} value={String(p.id)}>{p.ad}</option>
          ))}
        </CustomSelect>
      </div>

      {bordroListe.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={40} strokeWidth={1.5} />}
          title="Bordro yok"
          description='Henüz bordro yüklenmemiş — "Bordro Yükle" sekmesinden ekleyebilirsin.'
        />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <THead>
                <TR>
                  <TH>Personel</TH>
                  <TH>Dönem</TH>
                  <TH>Dosya</TH>
                  <TH>Açıklama</TH>
                  <TH>Yüklenme</TH>
                  <TH style={{ textAlign: 'right' }}>İşlem</TH>
                </TR>
              </THead>
              <TBody>
                {bordroListe.map(b => (
                  <TR key={b.id}>
                    <TD style={{ fontWeight: 600 }}>{personelAd(b.kullaniciId)}</TD>
                    <TD style={{ whiteSpace: 'nowrap' }}>{AYLAR[b.donemAy - 1]} {b.donemYil}</TD>
                    <TD>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                        <FileText size={13} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                        {b.dosyaAd || 'bordro.pdf'}
                      </span>
                    </TD>
                    <TD style={{ maxWidth: 220 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{b.aciklama || '—'}</span>
                    </TD>
                    <TD style={{ whiteSpace: 'nowrap', fontSize: 12.5, color: 'var(--text-tertiary)' }}>
                      {fmtTarih(b.olusturmaTarih)}
                    </TD>
                    <TD style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <Button size="sm" variant="secondary" iconLeft={<Download size={12} />} onClick={() => onIndir(b)}>
                          İndir
                        </Button>
                        <Button size="sm" variant="secondary" iconLeft={<Trash2 size={12} />}
                          style={{ color: 'var(--danger)' }} onClick={() => onSil(b)}>
                          Sil
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  )
}
