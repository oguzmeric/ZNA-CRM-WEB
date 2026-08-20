// İzin & Bordro — PERSONEL sayfası (rota /izin-bordro).
// Personel kendi izin taleplerini oluşturur/iptal eder ve kendi bordrolarını
// signed URL ile indirir. RLS zaten satır bazında kısıtlar; sorgular yine de
// kullanici.id ile daraltılır. İK yönetim ekranı ayrı sayfadadır.

import { useState, useEffect, useMemo } from 'react'
import {
  CalendarDays, FileText, Plus, Download, XCircle, Wallet, Printer,
  Banknote, CheckCircle2, Clock,
} from 'lucide-react'
import { izinFormuYazdir } from '../lib/izinFormu'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  IZIN_TURLERI, IZIN_DURUM, izinDurumBilgi, isGunuHesapla,
  bordrolariGetir, bordroIndirUrl,
  izinTalepleriGetir, izinTalepEkle, izinIptal,
  avansTalepleriGetir, avansTalepEkle, avansIptal, avansDurumBilgi,
  TAKSIT_SECENEKLERI, tutarBicim, donemBicim,
} from '../services/ikService'
import {
  Button, Input, Textarea, Label, Card, Badge, EmptyState, Modal,
} from '../components/ui'
import CustomSelect from '../components/CustomSelect'
import { yeniSekmedeAc, acmaHatasi } from '../lib/dosyaAc'

const AY_ADLARI = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

// IZIN_DURUM tone'ları ('basari'/'nötr') Badge TONE haritasında yok — köprü
// olmadan onaylandı rozeti gri (neutral) görünür. IKYonetim'dekiyle aynı eşleme:
const BADGE_TONE = { basari: 'basarili', 'nötr': 'neutral', beklemede: 'beklemede', kayip: 'kayip' }

const fmtTarih = (t) => t ? new Date(t + 'T00:00:00').toLocaleDateString('tr-TR') : '—'
const fmtTarihSaat = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'
const turIsim = (id) => IZIN_TURLERI.find(t => t.id === id)?.isim || id

const SEKMELER = [
  { id: 'izin', label: 'İzin Taleplerim', ikon: CalendarDays },
  { id: 'avans', label: 'Avans Taleplerim', ikon: Banknote },
  { id: 'bordro', label: 'Bordrolarım', ikon: Wallet },
]

export default function IzinBordro() {
  const { kullanici } = useAuth()
  const { toast } = useToast()
  const [sekme, setSekme] = useState('izin')
  const [talepler, setTalepler] = useState([])
  const [bordrolar, setBordrolar] = useState([])
  const [avanslar, setAvanslar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [talepModal, setTalepModal] = useState(false)
  const [avansModal, setAvansModal] = useState(false)
  const [iptalEdilen, setIptalEdilen] = useState(null)   // iptal isteği gönderilen talep id
  const [avansIptalEdilen, setAvansIptalEdilen] = useState(null)

  const kimId = kullanici?.id

  const yukle = async () => {
    if (!kimId) return
    setYukleniyor(true)
    try {
      const [t, b, a] = await Promise.all([
        izinTalepleriGetir({ kullaniciId: kimId }),
        // bordrolariGetir imzası POZİSYONEL (kullaniciId) — obje verme (NaN eq → boş liste)
        bordrolariGetir(kimId),
        avansTalepleriGetir({ kullaniciId: kimId }),
      ])
      setTalepler(t)
      setBordrolar(b)
      setAvanslar(a)
    } catch (e) {
      toast.error(e?.message || 'Kayıtlar yüklenemedi.')
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { yukle() }, [kimId])

  // Bekleyen talep sayısı — sekme etiketinde küçük rozet
  const bekleyenSayi = useMemo(
    () => talepler.filter(t => t.durum === 'bekliyor').length,
    [talepler],
  )
  const avansBekleyenSayi = useMemo(
    () => avanslar.filter(a => a.durum === 'bekliyor').length,
    [avanslar],
  )
  // Ödenmiş ama taksitleri bitmemiş avansların toplam kalan borcu
  const toplamKalanBorc = useMemo(
    () => avanslar.reduce((s, a) => s + (a.kalanBorc || 0), 0),
    [avanslar],
  )

  const iptalEt = async (talep) => {
    if (!confirm(`${turIsim(talep.tur)} talebin (${fmtTarih(talep.baslangic)} – ${fmtTarih(talep.bitis)}) iptal edilsin mi?`)) return
    setIptalEdilen(talep.id)
    try {
      await izinIptal(talep.id)
      toast.success('İzin talebi iptal edildi.')
      await yukle()
    } catch (e) {
      toast.error(e?.message || 'İptal edilemedi.')
    } finally {
      setIptalEdilen(null)
    }
  }

  const avansIptalEt = async (a) => {
    if (!confirm(`${tutarBicim(a.tutar)} tutarındaki avans talebin iptal edilsin mi?`)) return
    setAvansIptalEdilen(a.id)
    try {
      await avansIptal(a.id)
      toast.success('Avans talebi iptal edildi.')
      await yukle()
    } catch (e) {
      toast.error(e?.message || 'İptal edilemedi.')
    } finally {
      setAvansIptalEdilen(null)
    }
  }

  const bordroIndir = async (b) => {
    // Pencere URL'den ÖNCE açılır — await sonrası window.open popup engeline
    // takılıp sessizce null dönüyordu (bkz. src/lib/dosyaAc.js).
    const sonuc = await yeniSekmedeAc(() => bordroIndirUrl(b.dosyaYol))
    if (!sonuc.ok) toast.error(acmaHatasi(sonuc, 'Bordro indirilemedi.'))
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Başlık */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p className="t-caption" style={{ color: 'var(--text-tertiary)', marginTop: 4 }}>
            İzin ve avans taleplerini buradan oluştur ve takip et; onaylı bordrolarını indir.
          </p>
        </div>
        {sekme === 'izin' && (
          <Button variant="primary" iconLeft={<Plus size={14} />} onClick={() => setTalepModal(true)}>
            Yeni İzin Talebi
          </Button>
        )}
        {sekme === 'avans' && (
          <Button variant="primary" iconLeft={<Plus size={14} />} onClick={() => setAvansModal(true)}>
            Yeni Avans Talebi
          </Button>
        )}
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
              {((s.id === 'izin' && bekleyenSayi > 0) || (s.id === 'avans' && avansBekleyenSayi > 0)) && (
                <span style={{
                  minWidth: 18, height: 18, borderRadius: 999, padding: '0 5px',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: aktif ? 'rgba(255,255,255,0.25)' : 'var(--brand-primary)',
                  color: '#fff', fontSize: 10.5, fontWeight: 700,
                }}>
                  {s.id === 'izin' ? bekleyenSayi : avansBekleyenSayi}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {yukleniyor ? (
        <Card><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</div></Card>
      ) : sekme === 'izin' ? (
        // ── İzin Taleplerim ─────────────────────────────────────────────
        talepler.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={40} strokeWidth={1.5} />}
            title="Henüz izin talebin yok"
            description={'"Yeni İzin Talebi" ile ilk talebini oluşturabilirsin.'}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {talepler.map(t => {
              const durum = izinDurumBilgi(t.durum)
              return (
                <Card key={t.id} style={{ padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
                      <div style={{
                        width: 42, height: 42, borderRadius: 8, background: 'var(--surface-sunken)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <CalendarDays size={20} style={{ color: 'var(--brand-primary)' }} strokeWidth={1.5} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className="t-body-strong">{turIsim(t.tur)}</span>
                          <Badge tone={BADGE_TONE[durum.tone] || durum.tone}>{durum.isim}</Badge>
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                          {fmtTarih(t.baslangic)} – {fmtTarih(t.bitis)}
                          <span style={{ color: 'var(--text-tertiary)' }}> · {Number(t.gunSayisi)} iş günü</span>
                        </div>
                        {t.aciklama && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                            {t.aciklama}
                          </div>
                        )}
                        {t.kararNotu && (
                          <div style={{
                            marginTop: 6, padding: '6px 10px', borderRadius: 8,
                            background: 'var(--surface-sunken)', fontSize: 12,
                            color: t.durum === 'reddedildi' ? 'var(--danger)' : 'var(--text-secondary)',
                          }}>
                            <strong>Karar notu:</strong> {t.kararNotu}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        Talep: {fmtTarihSaat(t.olusturmaTarih)}
                        {t.onayTarihi && <> · Karar: {fmtTarihSaat(t.onayTarihi)}</>}
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {t.durum !== 'iptal' && (
                          <Button size="sm" variant="secondary"
                            iconLeft={<Printer size={12} />}
                            onClick={() => { if (!izinFormuYazdir(t, { ad: kullanici?.ad, unvan: kullanici?.unvan })) toast.error('Tarayıcı yazdırma penceresini engelledi — açılır pencere iznini verin.') }}>
                            Formu Yazdır
                          </Button>
                        )}
                        {t.durum === 'bekliyor' && (
                          <Button size="sm" variant="secondary"
                            iconLeft={<XCircle size={12} />}
                            onClick={() => iptalEt(t)}
                            disabled={iptalEdilen === t.id}
                            style={{ color: 'var(--danger)' }}>
                            {iptalEdilen === t.id ? 'İptal ediliyor…' : 'İptal Et'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )
      ) : sekme === 'avans' ? (
        // ── Avans Taleplerim ────────────────────────────────────────────
        <>
          {toplamKalanBorc > 0 && (
            <Card style={{
              padding: '12px 16px', marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              borderLeft: '3px solid var(--brand-primary)',
            }}>
              <Banknote size={18} strokeWidth={1.5} style={{ color: 'var(--brand-primary)' }} />
              <span className="t-body-strong">Kalan avans borcun: {tutarBicim(toplamKalanBorc)}</span>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                (maaşından kesilecek taksitlerin toplamı)
              </span>
            </Card>
          )}
          {avanslar.length === 0 ? (
            <EmptyState
              icon={<Banknote size={40} strokeWidth={1.5} />}
              title="Henüz avans talebin yok"
              description={'"Yeni Avans Talebi" ile tutarı ve kaç taksitte kesileceğini seçerek talep oluşturabilirsin.'}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {avanslar.map(a => {
                const durum = avansDurumBilgi(a.durum)
                return (
                  <Card key={a.id} style={{ padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
                        <div style={{
                          width: 42, height: 42, borderRadius: 8, background: 'var(--surface-sunken)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <Banknote size={20} style={{ color: 'var(--brand-primary)' }} strokeWidth={1.5} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span className="t-body-strong">{tutarBicim(a.tutar)}</span>
                            <Badge tone={BADGE_TONE[durum.tone] || durum.tone}>{durum.isim}</Badge>
                            {a.odemeTarihi && <Badge tone="basarili">Ödendi</Badge>}
                          </div>
                          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                            {a.taksitSayisi} taksit
                            {a.taksitler.length > 0 && (
                              <span style={{ color: 'var(--text-tertiary)' }}>
                                {' · '}{a.kesilenTaksit}/{a.taksitler.length} kesildi
                              </span>
                            )}
                          </div>
                          {a.gerekce && (
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{a.gerekce}</div>
                          )}
                          {a.kararNotu && (
                            <div style={{
                              marginTop: 6, padding: '6px 10px', borderRadius: 8,
                              background: 'var(--surface-sunken)', fontSize: 12,
                              color: a.durum === 'reddedildi' ? 'var(--danger)' : 'var(--text-secondary)',
                            }}>
                              <strong>Karar notu:</strong> {a.kararNotu}
                            </div>
                          )}
                          {/* Onaylandı ama para henüz verilmedi — personel bunu bilmeli */}
                          {a.durum === 'onaylandi' && !a.odemeTarihi && (
                            <div style={{
                              marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5,
                              fontSize: 12, color: '#b45309',
                            }}>
                              <Clock size={12} strokeWidth={1.5} /> Onaylandı — ödeme bekleniyor
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          Talep: {fmtTarihSaat(a.olusturmaTarih)}
                          {a.odemeTarihi && <> · Ödeme: {fmtTarihSaat(a.odemeTarihi)}</>}
                        </span>
                        {a.durum === 'bekliyor' && (
                          <Button size="sm" variant="secondary"
                            iconLeft={<XCircle size={12} />}
                            onClick={() => avansIptalEt(a)}
                            disabled={avansIptalEdilen === a.id}
                            style={{ color: 'var(--danger)' }}>
                            {avansIptalEdilen === a.id ? 'İptal ediliyor…' : 'İptal Et'}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Taksit planı — ödeme işaretlenince oluşur */}
                    {a.taksitler.length > 0 && (
                      <div style={{ marginTop: 12, borderTop: '1px solid var(--border-default)', paddingTop: 10 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {a.taksitler.map(t => {
                            const kesildi = !!t.kesintiTarihi
                            return (
                              <span key={t.id} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '4px 10px', borderRadius: 'var(--radius-pill)',
                                fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
                                background: kesildi ? 'rgba(34,197,94,0.12)' : 'var(--surface-sunken)',
                                color: kesildi ? '#15803d' : 'var(--text-secondary)',
                                border: `1px solid ${kesildi ? 'rgba(34,197,94,0.35)' : 'var(--border-default)'}`,
                              }}>
                                {kesildi ? <CheckCircle2 size={11} strokeWidth={2} /> : <Clock size={11} strokeWidth={1.5} />}
                                {donemBicim(t.donem)} · {tutarBicim(t.tutar)}
                              </span>
                            )
                          })}
                        </div>
                        {a.kalanBorc > 0 && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                            Kalan borç: <strong>{tutarBicim(a.kalanBorc)}</strong>
                            {a.sonrakiTaksit && <> · Sıradaki kesinti: {donemBicim(a.sonrakiTaksit.donem)}</>}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </>
      ) : (
        // ── Bordrolarım ─────────────────────────────────────────────────
        bordrolar.length === 0 ? (
          <EmptyState
            icon={<Wallet size={40} strokeWidth={1.5} />}
            title="Henüz bordro yüklenmemiş"
            description="Bordroların İK tarafından yüklendiğinde burada listelenir."
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {bordrolar.map(b => (
              <Card key={b.id} style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 8, background: 'var(--surface-sunken)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <FileText size={20} style={{ color: 'var(--danger)' }} strokeWidth={1.5} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="t-body-strong">
                      {AY_ADLARI[(b.donemAy || 1) - 1]} {b.donemYil}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      Yüklendi: {fmtTarihSaat(b.olusturmaTarih)}
                    </div>
                  </div>
                </div>
                {b.aciklama && (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>{b.aciklama}</p>
                )}
                <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 8 }}>
                  <Button size="sm" variant="secondary" iconLeft={<Download size={12} />} onClick={() => bordroIndir(b)}>
                    İndir
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {talepModal && (
        <YeniIzinTalepModal
          kullaniciId={kimId}
          onKapat={() => setTalepModal(false)}
          onKaydet={async () => { setTalepModal(false); await yukle() }}
        />
      )}

      {avansModal && (
        <YeniAvansTalepModal
          kullaniciId={kimId}
          onKapat={() => setAvansModal(false)}
          onKaydet={async () => { setAvansModal(false); await yukle() }}
        />
      )}
    </div>
  )
}

// ---------------- Yeni İzin Talebi ----------------
function YeniIzinTalepModal({ kullaniciId, onKapat, onKaydet }) {
  const { toast } = useToast()
  const [tur, setTur] = useState('yillik')
  const [baslangic, setBaslangic] = useState('')
  const [bitis, setBitis] = useState('')
  const [gunSayisi, setGunSayisi] = useState('')
  const [gunElle, setGunElle] = useState(false)   // kullanıcı elle değiştirdiyse otomatik hesap ezmesin
  const [aciklama, setAciklama] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)

  // Tarihler değişince iş günü otomatik dolar (Cumartesi+Pazar hariç).
  // Kullanıcı sayıyı elle değiştirdiyse dokunma — yarım gün vb. girebilir.
  useEffect(() => {
    if (gunElle) return
    if (baslangic && bitis && bitis >= baslangic) {
      setGunSayisi(String(isGunuHesapla(baslangic, bitis)))
    }
  }, [baslangic, bitis, gunElle])

  const kaydet = async () => {
    if (!baslangic) { toast.error('Başlangıç tarihi zorunlu.'); return }
    if (!bitis) { toast.error('Bitiş tarihi zorunlu.'); return }
    if (bitis < baslangic) { toast.error('Bitiş tarihi başlangıçtan önce olamaz.'); return }
    const gun = Number(gunSayisi)
    if (!gun || gun <= 0) { toast.error('Gün sayısı 0\'dan büyük olmalı.'); return }

    setKaydediliyor(true)
    try {
      await izinTalepEkle({
        kullaniciId,
        tur,
        baslangic,
        bitis,
        gunSayisi: gun,
        aciklama: aciklama.trim() || null,
      })
      toast.success('İzin talebin oluşturuldu — onay bekliyor.')
      onKaydet()
    } catch (e) {
      toast.error(e?.message || 'Talep oluşturulamadı.')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <Modal open onClose={onKapat} title="Yeni İzin Talebi" width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <Label required>İzin Türü</Label>
          <CustomSelect value={tur} onChange={e => setTur(e.target.value)}>
            {IZIN_TURLERI.map(t => (
              <option key={t.id} value={t.id}>{t.isim}</option>
            ))}
          </CustomSelect>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label required>Başlangıç</Label>
            <Input type="date" value={baslangic}
              onChange={e => setBaslangic(e.target.value)} />
          </div>
          <div>
            <Label required>Bitiş</Label>
            <Input type="date" value={bitis} min={baslangic || undefined}
              onChange={e => setBitis(e.target.value)} />
          </div>
        </div>

        <div>
          <Label required>Gün Sayısı (iş günü)</Label>
          <Input type="number" min="0.5" step="0.5" value={gunSayisi}
            onChange={e => { setGunElle(true); setGunSayisi(e.target.value) }}
            placeholder="Tarihleri seçince otomatik dolar" />
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Cumartesi ve Pazar hariç otomatik hesaplanır; gerekirse elle değiştirebilirsin.
          </div>
        </div>

        <div>
          <Label>Açıklama (opsiyonel)</Label>
          <Textarea rows={3} value={aciklama} onChange={e => setAciklama(e.target.value)}
            placeholder="Örn: Aile ziyareti…" />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="secondary" onClick={onKapat} disabled={kaydediliyor}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Kaydediliyor…' : 'Talebi Gönder'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Yeni Avans Talebi ──────────────────────────────────────────────────────
function YeniAvansTalepModal({ kullaniciId, onKapat, onKaydet }) {
  const { toast } = useToast()
  const [tutar, setTutar] = useState('')
  const [taksit, setTaksit] = useState(1)
  const [gerekce, setGerekce] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)

  // Kullanıcı "9.000" ya da "9000,50" yazabilir — ikisini de sayıya çevir
  const sayi = Number(String(tutar).replace(/\./g, '').replace(',', '.'))
  const gecerli = Number.isFinite(sayi) && sayi > 0
  const taksitTutar = gecerli ? sayi / taksit : 0

  const kaydet = async () => {
    if (!gecerli) { toast.error('Geçerli bir avans tutarı girin.'); return }
    setKaydediliyor(true)
    try {
      await avansTalepEkle({ kullaniciId, tutar, taksitSayisi: taksit, gerekce })
      toast.success('Avans talebin oluşturuldu — onay bekliyor.')
      onKaydet()
    } catch (e) {
      toast.error(e?.message || 'Talep oluşturulamadı.')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <Modal open onClose={onKapat} title="Yeni Avans Talebi" width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <Label required>Avans Tutarı (₺)</Label>
          <Input
            value={tutar}
            onChange={e => setTutar(e.target.value.replace(/[^0-9.,]/g, ''))}
            placeholder="Örn: 9000"
            inputMode="decimal"
            autoFocus
          />
        </div>

        <div>
          <Label required>Kaç taksitte kesilsin?</Label>
          <CustomSelect value={String(taksit)} onChange={e => setTaksit(Number(e.target.value))}>
            {TAKSIT_SECENEKLERI.map(n => (
              <option key={n} value={n}>{n} taksit</option>
            ))}
          </CustomSelect>
        </div>

        {/* Talep göndermeden önce aylık kesintiyi göster — sürpriz olmasın */}
        {gecerli && (
          <div style={{
            padding: '10px 12px', borderRadius: 8, background: 'var(--surface-sunken)',
            fontSize: 13, color: 'var(--text-secondary)',
          }}>
            Maaşından <strong style={{ color: 'var(--text-primary)' }}>
              {taksit} ay boyunca ayda {tutarBicim(taksitTutar)}
            </strong> kesilir.
            <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 3 }}>
              Kesintiler avans ödendikten sonraki ay başlar. Küsurat son taksite eklenir.
            </div>
          </div>
        )}

        <div>
          <Label>Gerekçe (opsiyonel)</Label>
          <Textarea rows={3} value={gerekce} onChange={e => setGerekce(e.target.value)}
            placeholder="Örn: Ev taşınma masrafı…" />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="secondary" onClick={onKapat} disabled={kaydediliyor}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={kaydediliyor || !gecerli}>
            {kaydediliyor ? 'Kaydediliyor…' : 'Talebi Gönder'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
