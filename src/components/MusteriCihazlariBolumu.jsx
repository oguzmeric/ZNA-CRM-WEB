// Müşteri Cihaz Envanteri bölümü — MusteriDetay içinde kullanılır.
// Liste + cihaz ekle + detay modal (SN/IP/MAC/kimlik, şifre maskeli,
// arıza bildir/giderildi, hareket geçmişi).
import { useState, useEffect, useCallback } from 'react'
import { MonitorSmartphone, Plus, Eye, EyeOff, Pencil, Trash2, X, AlertTriangle, CheckCircle2, MapPin } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import CustomSelect from './CustomSelect'
import { Button, Input, Textarea, Label, Card, CardTitle, EmptyState } from './ui'
import {
  CIHAZ_DURUMLARI, musteriCihazlariGetir, cihazEkle, cihazGuncelle,
  cihazArizaBildir, cihazArizaGiderildi, cihazSil, cihazHareketleriGetir,
} from '../services/musteriCihazService'

const bosForm = {
  seriNo: '', cihazAdi: '', marka: '', model: '', lokasyon: '',
  ipAdresi: '', macAdresi: '', kullaniciAdi: '', sifre: '',
  durum: 'aktif', arizaNedeni: '', notlar: '',
}

const durumObj = (d) => CIHAZ_DURUMLARI.find(x => x.id === d) || CIHAZ_DURUMLARI[0]

const HAREKET_IKON = {
  olusturuldu: '➕', ariza: '⚠️', tamir: '✅', guncelleme: '✏️', not: '📝',
}

export default function MusteriCihazlariBolumu({ musteriId, lokasyonlar = [] }) {
  const { kullanici } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [cihazlar, setCihazlar] = useState([])
  const [secili, setSecili] = useState(null)          // detay modal cihazı
  const [form, setForm] = useState(null)              // yeni/düzenle formu (null = kapalı)
  const [duzenleId, setDuzenleId] = useState(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [sifreGoster, setSifreGoster] = useState(false)
  const [hareketler, setHareketler] = useState([])
  const [arizaFormu, setArizaFormu] = useState(null)  // { neden } — detayda arıza bildirimi
  const [hepsiGoster, setHepsiGoster] = useState(false)

  const yukle = useCallback(() => {
    if (!musteriId) return
    musteriCihazlariGetir(musteriId).then(setCihazlar)
  }, [musteriId])

  useEffect(() => { yukle() }, [yukle])

  const detayAc = async (c) => {
    setSecili(c); setSifreGoster(false); setArizaFormu(null)
    setHareketler(await cihazHareketleriGetir(c.id))
  }

  const formAc = (cihaz = null) => {
    if (cihaz) {
      setForm({
        seriNo: cihaz.seriNo || '', cihazAdi: cihaz.cihazAdi || '',
        marka: cihaz.marka || '', model: cihaz.model || '', lokasyon: cihaz.lokasyon || '',
        ipAdresi: cihaz.ipAdresi || '', macAdresi: cihaz.macAdresi || '',
        kullaniciAdi: cihaz.kullaniciAdi || '', sifre: cihaz.sifre || '',
        durum: cihaz.durum || 'aktif', arizaNedeni: cihaz.arizaNedeni || '', notlar: cihaz.notlar || '',
      })
      setDuzenleId(cihaz.id)
    } else {
      setForm({ ...bosForm })
      setDuzenleId(null)
    }
    setSecili(null)
  }

  const kaydet = async () => {
    if (!form.seriNo.trim()) { toast.error('Seri numarası zorunlu.'); return }
    if (form.durum === 'arizali' && !form.arizaNedeni.trim()) {
      toast.error('Arızalı cihaz için arıza nedeni belirtin.'); return
    }
    setKaydediliyor(true)
    try {
      if (duzenleId) {
        const g = await cihazGuncelle(duzenleId, form, kullanici)
        if (!g) { toast.error('Güncellenemedi.'); return }
        toast.success('Cihaz güncellendi.')
      } else {
        const r = await cihazEkle({
          ...form, musteriId,
          arizaTarihi: form.durum === 'arizali' ? new Date().toISOString() : undefined,
        }, kullanici)
        if (r.hata) { toast.error(r.hata); return }
        toast.success('Cihaz kaydedildi.')
      }
      setForm(null); setDuzenleId(null)
      yukle()
    } finally { setKaydediliyor(false) }
  }

  const arizaKaydet = async () => {
    if (!arizaFormu?.neden?.trim()) { toast.error('Arıza nedenini yazın.'); return }
    const g = await cihazArizaBildir(secili.id, arizaFormu.neden.trim(), kullanici)
    if (g) {
      toast.success('Arıza kaydedildi.')
      setSecili(g); setArizaFormu(null)
      setHareketler(await cihazHareketleriGetir(g.id))
      yukle()
    }
  }

  const giderildi = async () => {
    const g = await cihazArizaGiderildi(secili.id, null, kullanici)
    if (g) {
      toast.success('Arıza giderildi olarak işaretlendi.')
      setSecili(g)
      setHareketler(await cihazHareketleriGetir(g.id))
      yukle()
    }
  }

  const sil = async (c) => {
    const onay = await confirm({
      baslik: 'Cihazı Sil',
      mesaj: `${c.cihazAdi || c.seriNo} kaydı ve hareket geçmişi silinecek.`,
      onayMetin: 'Sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    if (await cihazSil(c.id)) {
      toast.success('Cihaz silindi.')
      setSecili(null)
      yukle()
    }
  }

  const arizaliSayi = cihazlar.filter(c => c.durum === 'arizali').length
  const gorunen = hepsiGoster ? cihazlar : cihazlar.slice(0, 6)

  const alanSatiri = (etiket, deger, mono = false) => (
    <div>
      <div style={{ font: '600 10px/14px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{etiket}</div>
      <div style={{ font: mono ? '500 13px/18px var(--font-mono)' : '400 13px/18px var(--font-sans)', color: deger ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
        {deger || '—'}
      </div>
    </div>
  )

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CardTitle style={{ margin: 0 }}>Müşteri Cihazları</CardTitle>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {cihazlar.length} cihaz{arizaliSayi > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}> · {arizaliSayi} arızalı</span>}
          </span>
        </div>
        <Button variant="secondary" size="sm" iconLeft={<Plus size={13} strokeWidth={1.5} />} onClick={() => formAc()}>
          Cihaz Ekle
        </Button>
      </div>

      {cihazlar.length === 0 && !form && (
        <EmptyState
          icon={<MonitorSmartphone size={26} strokeWidth={1.5} />}
          title="Kayıtlı cihaz yok"
          description="Müşteriye ait NVR, kamera, santral gibi cihazları SN ile buradan (veya sahada mobil uygulamadan) kaydedebilirsin."
        />
      )}

      {/* Liste */}
      {gorunen.map(c => {
        const d = durumObj(c.durum)
        return (
          <div
            key={c.id}
            onClick={() => detayAc(c)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              padding: '10px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'background 120ms',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>
                {c.cihazAdi || [c.marka, c.model].filter(Boolean).join(' ') || 'Cihaz'}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-tertiary)' }}>S.N. {c.seriNo}</span>
              {c.ipAdresi && <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-tertiary)' }}>{c.ipAdresi}</span>}
              {c.lokasyon && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-tertiary)' }}>
                  <MapPin size={10} strokeWidth={1.5} /> {c.lokasyon}
                </span>
              )}
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                background: `${d.renk}18`, color: d.renk, border: `1px solid ${d.renk}44`,
              }}>{d.isim.toLocaleUpperCase('tr')}</span>
            </div>
            <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
              {c.guncellemeTarih ? new Date(c.guncellemeTarih).toLocaleDateString('tr-TR') : ''}
            </span>
          </div>
        )
      })}
      {cihazlar.length > 6 && (
        <button
          onClick={() => setHepsiGoster(!hepsiGoster)}
          style={{ background: 'transparent', border: 'none', color: 'var(--brand-primary)', cursor: 'pointer', font: '500 12px/16px var(--font-sans)', padding: '8px 12px' }}
        >
          {hepsiGoster ? 'Daha az göster' : `Tümünü göster (${cihazlar.length})`}
        </button>
      )}

      {/* Yeni / Düzenle formu */}
      {form && (
        <div style={{ marginTop: 12, padding: 14, borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)', border: '1px solid var(--border-default)' }}>
          <div style={{ font: '600 13px/18px var(--font-sans)', marginBottom: 12 }}>
            {duzenleId ? 'Cihazı Düzenle' : 'Yeni Cihaz'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
            <div>
              <Label required>Seri No</Label>
              <Input value={form.seriNo} onChange={e => setForm({ ...form, seriNo: e.target.value })} placeholder="SN" style={{ fontFamily: 'var(--font-mono)' }} />
            </div>
            <div>
              <Label>Cihaz adı</Label>
              <Input value={form.cihazAdi} onChange={e => setForm({ ...form, cihazAdi: e.target.value })} placeholder="NVR, Kamera - Depo…" />
            </div>
            <div>
              <Label>Lokasyon</Label>
              {lokasyonlar.length > 0 ? (
                <CustomSelect
                  value={lokasyonlar.some(l => l.ad === form.lokasyon) ? form.lokasyon : (form.lokasyon ? '__m__' : '')}
                  onChange={e => setForm({ ...form, lokasyon: e.target.value === '__m__' ? '' : e.target.value })}
                >
                  <option value="">Lokasyon seç…</option>
                  {lokasyonlar.map(l => <option key={l.id} value={l.ad}>{l.ad}</option>)}
                  <option value="__m__">+ Manuel yaz…</option>
                </CustomSelect>
              ) : (
                <Input value={form.lokasyon} onChange={e => setForm({ ...form, lokasyon: e.target.value })} placeholder="Merkez Bina…" />
              )}
              {lokasyonlar.length > 0 && !lokasyonlar.some(l => l.ad === form.lokasyon) && (
                <Input value={form.lokasyon} onChange={e => setForm({ ...form, lokasyon: e.target.value })} placeholder="Manuel lokasyon…" style={{ marginTop: 6 }} />
              )}
            </div>
            <div>
              <Label>Marka</Label>
              <Input value={form.marka} onChange={e => setForm({ ...form, marka: e.target.value })} placeholder="Hikvision, Trassir…" />
            </div>
            <div>
              <Label>Model</Label>
              <Input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} />
            </div>
            <div>
              <Label>Durum</Label>
              <CustomSelect value={form.durum} onChange={e => setForm({ ...form, durum: e.target.value })}>
                {CIHAZ_DURUMLARI.map(d => <option key={d.id} value={d.id}>{d.isim}</option>)}
              </CustomSelect>
            </div>
            <div>
              <Label>IP adresi</Label>
              <Input value={form.ipAdresi} onChange={e => setForm({ ...form, ipAdresi: e.target.value })} placeholder="192.168.1.64" style={{ fontFamily: 'var(--font-mono)' }} />
            </div>
            <div>
              <Label>MAC adresi</Label>
              <Input value={form.macAdresi} onChange={e => setForm({ ...form, macAdresi: e.target.value })} placeholder="AA:BB:CC:DD:EE:FF" style={{ fontFamily: 'var(--font-mono)' }} />
            </div>
            <div />
            <div>
              <Label>Kullanıcı adı</Label>
              <Input value={form.kullaniciAdi} onChange={e => setForm({ ...form, kullaniciAdi: e.target.value })} autoComplete="off" />
            </div>
            <div>
              <Label>Şifre</Label>
              <Input value={form.sifre} onChange={e => setForm({ ...form, sifre: e.target.value })} autoComplete="new-password" style={{ fontFamily: 'var(--font-mono)' }} />
            </div>
            <div />
            {form.durum === 'arizali' && (
              <div style={{ gridColumn: 'span 3' }}>
                <Label required>Arıza nedeni</Label>
                <Textarea value={form.arizaNedeni} onChange={e => setForm({ ...form, arizaNedeni: e.target.value })} rows={2} placeholder="Görüntü yok, disk arızası, güç sorunu…" />
              </div>
            )}
            <div style={{ gridColumn: 'span 3' }}>
              <Label>Notlar</Label>
              <Textarea value={form.notlar} onChange={e => setForm({ ...form, notlar: e.target.value })} rows={2} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button variant="primary" size="sm" onClick={kaydet} disabled={kaydediliyor}>
              {kaydediliyor ? 'Kaydediliyor…' : (duzenleId ? 'Güncelle' : 'Kaydet')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setForm(null); setDuzenleId(null) }}>İptal</Button>
          </div>
        </div>
      )}

      {/* Detay modal */}
      {secili && (
        <div
          onClick={() => setSecili(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(6,12,26,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface-card)', borderRadius: 12, padding: 20,
              width: 'min(680px, 94vw)', maxHeight: '88vh', overflowY: 'auto',
              boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ font: '600 15px/20px var(--font-sans)' }}>
                  {secili.cihazAdi || [secili.marka, secili.model].filter(Boolean).join(' ') || 'Cihaz'}
                </span>
                {(() => { const d = durumObj(secili.durum); return (
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                    background: `${d.renk}18`, color: d.renk, border: `1px solid ${d.renk}44`,
                  }}>{d.isim.toLocaleUpperCase('tr')}</span>
                )})()}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button variant="secondary" size="sm" iconLeft={<Pencil size={12} strokeWidth={1.5} />} onClick={() => formAc(secili)}>Düzenle</Button>
                <button
                  aria-label="Sil"
                  onClick={() => sil(secili)}
                  style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', cursor: 'pointer' }}
                >
                  <Trash2 size={13} strokeWidth={1.5} />
                </button>
                <button
                  aria-label="Kapat"
                  onClick={() => setSecili(null)}
                  style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {secili.durum === 'arizali' && secili.arizaNedeni && (
              <div style={{
                display: 'flex', gap: 8, alignItems: 'flex-start',
                padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 14,
                background: 'var(--danger-soft, rgba(220,38,38,0.08))', border: '1px solid rgba(220,38,38,0.25)',
              }}>
                <AlertTriangle size={15} strokeWidth={1.5} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ font: '600 12px/16px var(--font-sans)', color: 'var(--danger)' }}>
                    Arıza {secili.arizaTarihi ? `· ${new Date(secili.arizaTarihi).toLocaleDateString('tr-TR')}` : ''}
                  </div>
                  <div style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{secili.arizaNedeni}</div>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14, marginBottom: 16 }}>
              {alanSatiri('Seri No', secili.seriNo, true)}
              {alanSatiri('IP Adresi', secili.ipAdresi, true)}
              {alanSatiri('MAC Adresi', secili.macAdresi, true)}
              {alanSatiri('Marka', secili.marka)}
              {alanSatiri('Model', secili.model)}
              {alanSatiri('Lokasyon', secili.lokasyon)}
              {alanSatiri('Kullanıcı Adı', secili.kullaniciAdi, true)}
              <div>
                <div style={{ font: '600 10px/14px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Şifre</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ font: '500 13px/18px var(--font-mono)', color: secili.sifre ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                    {secili.sifre ? (sifreGoster ? secili.sifre : '••••••••') : '—'}
                  </span>
                  {secili.sifre && (
                    <button
                      aria-label={sifreGoster ? 'Şifreyi gizle' : 'Şifreyi göster'}
                      onClick={() => setSifreGoster(!sifreGoster)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'inline-flex', padding: 2 }}
                    >
                      {sifreGoster ? <EyeOff size={13} strokeWidth={1.5} /> : <Eye size={13} strokeWidth={1.5} />}
                    </button>
                  )}
                </div>
              </div>
              {alanSatiri('Ekleyen', secili.olusturanAd)}
            </div>

            {secili.notlar && (
              <div style={{ marginBottom: 14 }}>
                {alanSatiri('Notlar', secili.notlar)}
              </div>
            )}

            {/* Arıza aksiyonları */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {secili.durum !== 'arizali' ? (
                arizaFormu ? null : (
                  <Button variant="secondary" size="sm" iconLeft={<AlertTriangle size={12} strokeWidth={1.5} />} onClick={() => setArizaFormu({ neden: '' })}>
                    Arıza Bildir
                  </Button>
                )
              ) : (
                <Button variant="secondary" size="sm" iconLeft={<CheckCircle2 size={12} strokeWidth={1.5} />} onClick={giderildi}>
                  Arıza Giderildi
                </Button>
              )}
            </div>
            {arizaFormu && (
              <div style={{ marginBottom: 16, padding: 12, borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)', border: '1px solid var(--border-default)' }}>
                <Label required>Arıza nedeni</Label>
                <Textarea value={arizaFormu.neden} onChange={e => setArizaFormu({ neden: e.target.value })} rows={2} placeholder="Görüntü yok, disk arızası…" />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Button variant="primary" size="sm" onClick={arizaKaydet}>Arızayı Kaydet</Button>
                  <Button variant="secondary" size="sm" onClick={() => setArizaFormu(null)}>Vazgeç</Button>
                </div>
              </div>
            )}

            {/* Hareket geçmişi */}
            <div style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Hareket Geçmişi
            </div>
            {hareketler.length === 0 ? (
              <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>Kayıt yok.</div>
            ) : hareketler.map(h => (
              <div key={h.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-default)', alignItems: 'baseline' }}>
                <span style={{ fontSize: 12 }}>{HAREKET_IKON[h.tip] || '•'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ font: '400 12px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{h.aciklama || h.tip}</span>
                  {h.yapanAd && <span style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}> — {h.yapanAd}</span>}
                </div>
                <span style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  {new Date(h.tarih).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
