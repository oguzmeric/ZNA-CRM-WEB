// Ön Sipariş modal — görüşme detayından açılır. FİYATSIZ.
// Stoktan ürün seç veya manuel yaz. Miktar + birim + açıklama + aciliyet.
// Bkz: supabase_migrations/125_on_siparisler.sql

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Trash2, Package, Search, ShoppingCart, AlertCircle, UserPlus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Button, Input, Textarea, Label } from './ui'
import CustomSelect from './CustomSelect'
import { stokUrunleriniGetir } from '../services/stokService'
import AkilliUrunSecici from './AkilliUrunSecici'
import { musteriKisileriniGetir } from '../services/musteriKisiService'
import {
  onSiparisTumunuKaydet, kalemleriGetir, onSiparisSil,
  ACILIYETLER,
} from '../services/onSiparisService'

const BIRIMLER = ['Adet', 'Metre', 'Kutu', 'Paket', 'Set', 'Rulo', 'Kg', 'Litre']

const bosKalem = () => ({
  stokKodu: '', urunAd: '', urunMarka: '', urunModel: '', kategori: '',
  miktar: 1, birim: 'Adet', aciklama: '',
})

export default function OnSiparisModal({ gorusme, mevcutOnSiparis = null, onKapat, onKaydedildi }) {
  const { kullanici } = useAuth()
  const { toast } = useToast()
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [stokUrunleri, setStokUrunleri] = useState([])
  // Eski satır-içi stok arama paneli AkilliUrunSecici'ye taşındı (Faz 3)
  const [musteriKisileri, setMusteriKisileri] = useState([])
  const [ilgiliManuel, setIlgiliManuel] = useState(false)

  const [form, setForm] = useState({
    id: mevcutOnSiparis?.id || null,
    gorusmeId: gorusme?.id,
    // Mevcut kayıt varsa oradan al; yoksa görüşmeden devral
    musteriId: mevcutOnSiparis?.musteriId ?? gorusme?.musteriId ?? null,
    lokasyonId: mevcutOnSiparis?.lokasyonId ?? gorusme?.lokasyonId ?? null,
    ilgiliKisi: mevcutOnSiparis?.ilgiliKisi || gorusme?.muhatapAd || '',
    aciklama: mevcutOnSiparis?.aciklama || '',
    aciliyet: mevcutOnSiparis?.aciliyet || 'orta',
    musteriOnayBilgisi: mevcutOnSiparis?.musteriOnayBilgisi || '',
    // Yeni kayıt → direkt Sipariş Onayı ekranına düşsün (onay_bekliyor).
    // Mevcut kayıt varsa durumu koru.
    durum: mevcutOnSiparis?.durum || 'onay_bekliyor',
    olusturanId: mevcutOnSiparis?.olusturanId ?? kullanici?.id ?? null,
  })
  const [kalemler, setKalemler] = useState([bosKalem()])
  const [silinecekKalemIdleri, setSilinecekKalemIdleri] = useState([])

  // Var olan ön siparişse kalemleri yükle
  useEffect(() => {
    if (mevcutOnSiparis?.id) {
      kalemleriGetir(mevcutOnSiparis.id).then(k => {
        if (k && k.length) setKalemler(k)
      })
    }
  }, [mevcutOnSiparis?.id])

  // Stok ürünlerini yükle (arama için)
  useEffect(() => {
    // Pasif ürünler ön siparişte aranamaz (mig 151)
    stokUrunleriniGetir().then(d => setStokUrunleri((d || []).filter(u => u.aktif !== false))).catch(() => setStokUrunleri([]))
  }, [])

  // Müşteri kişilerini yükle (İlgili Kişi dropdown için)
  useEffect(() => {
    if (gorusme?.musteriId) {
      musteriKisileriniGetir(gorusme.musteriId).then(setMusteriKisileri).catch(() => setMusteriKisileri([]))
    }
  }, [gorusme?.musteriId])

  const kalemGuncelle = (idx, alan, deger) => {
    const yeni = [...kalemler]
    yeni[idx] = { ...yeni[idx], [alan]: deger }
    setKalemler(yeni)
  }

  const kalemEkle = () => setKalemler([...kalemler, bosKalem()])

  const kalemKaldir = (idx) => {
    const k = kalemler[idx]
    if (k.id) setSilinecekKalemIdleri([...silinecekKalemIdleri, k.id])
    setKalemler(kalemler.filter((_, i) => i !== idx))
  }

  const stokSec = (idx, urun) => {
    const yeni = [...kalemler]
    yeni[idx] = {
      ...yeni[idx],
      stokKodu: urun.stokKodu,
      urunAd: urun.stokAdi,
      urunMarka: urun.marka || '',
      kategori: urun.kategori || '',
      birim: urun.birim || 'Adet',
    }
    setKalemler(yeni)
  }

  const stokKaldir = (idx) => {
    // Stok seçimini temizle, manuel yazıma dön
    const yeni = [...kalemler]
    yeni[idx] = { ...yeni[idx], stokKodu: '', urunAd: '', urunMarka: '', kategori: '' }
    setKalemler(yeni)
  }

  const sil = async () => {
    if (!form.id) return
    if (!confirm(`${mevcutOnSiparis?.onSiparisNo || 'Bu ön siparişi'} silmek istediğine emin misin? Kalemler de silinecek. Bu işlem geri alınamaz.`)) return
    setKaydediliyor(true)
    try {
      const ok = await onSiparisSil(form.id)
      if (!ok) { toast.error('Silinemedi.'); return }
      toast.success('Ön sipariş silindi.')
      if (onKaydedildi) onKaydedildi(null)
      onKapat?.()
    } catch (e) {
      toast.error(e?.message || 'Silme hatası')
    } finally {
      setKaydediliyor(false)
    }
  }

  const kaydet = async () => {
    // Validasyon
    if (!form.gorusmeId) { toast.warning('Görüşme bilgisi eksik.'); return }
    const gecerliKalemler = kalemler.filter(k => k.urunAd && k.urunAd.trim() && Number(k.miktar) > 0)

    // Yeni kayıt (henüz id yok) + hiç geçerli kalem yok → zorla kalem iste
    if (!form.id && gecerliKalemler.length === 0) {
      toast.warning('Yeni ön sipariş için en az bir ürün ekle (ürün adı + miktar).')
      return
    }
    // Güncelleme + tüm kalemler silindiyse: soft confirm ile devam
    if (form.id && gecerliKalemler.length === 0) {
      if (!confirm('Bu ön siparişte hiç kalem kalmadı. Yine de kaydedelim mi?\n(İstersen Sil butonu ile tüm kaydı silebilirsin.)')) return
    }

    setKaydediliyor(true)
    try {
      const sonuc = await onSiparisTumunuKaydet({
        onSiparis: form,
        kalemler: gecerliKalemler,
        silinecekKalemIdleri,
        firmaAdi: gorusme?.firmaAdi || form.firmaAdi || null,
        olusturanAd: kullanici?.ad || null,
      })
      if (!sonuc) {
        toast.error('Ön sipariş kaydedilemedi.')
        return
      }
      toast.success(`Ön sipariş kaydedildi: ${sonuc.onSiparisNo}`)
      if (onKaydedildi) onKaydedildi(sonuc)
      onKapat?.()
    } catch (e) {
      toast.error(e?.message || 'Kayıt hatası')
    } finally {
      setKaydediliyor(false)
    }
  }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: 'var(--surface-card)', color: 'var(--text-primary)',
        borderRadius: 14, padding: 20, maxWidth: 900, width: '100%', maxHeight: '90vh',
        overflow: 'auto', border: '1px solid var(--border-default)',
      }}>
        {/* Başlık */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShoppingCart size={18} strokeWidth={1.5} />
              {mevcutOnSiparis ? 'Ön Siparişi Düzenle' : 'Ön Sipariş Oluştur'}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {gorusme?.aktNo && <span style={{ fontFamily: 'monospace', color: 'var(--brand)' }}>{gorusme.aktNo}</span>}
              <span>{gorusme?.firmaAdi}</span>
              {gorusme?.muhatapAd && <span>· {gorusme.muhatapAd}</span>}
            </div>
          </div>
          <button onClick={onKapat}
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}
            title="Kapat">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        {/* Fiyat girişi uyarısı */}
        <div style={{
          padding: '10px 12px', borderRadius: 8,
          background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.3)',
          fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertCircle size={14} strokeWidth={1.5} style={{ color: '#3b82f6', flexShrink: 0 }} />
          <span>
            Ön siparişte <strong>fiyat girilmez</strong>. Fiyatlandırma Sipariş Onayı ekranında yapılır.
            Bu ekran müşteri talebini kayıt altına almak içindir.
          </span>
        </div>

        {/* Genel alanlar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div>
            <Label>
              İlgili Kişi
              {!ilgiliManuel ? (
                <button
                  type="button"
                  onClick={() => { setIlgiliManuel(true); setForm({ ...form, ilgiliKisi: '' }) }}
                  style={{
                    marginLeft: 8, background: 'none', border: 'none', color: 'var(--brand)',
                    cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0,
                  }}
                >
                  <UserPlus size={11} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                  Manuel Yaz
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setIlgiliManuel(false); setForm({ ...form, ilgiliKisi: gorusme?.muhatapAd || '' }) }}
                  style={{
                    marginLeft: 8, background: 'none', border: 'none', color: 'var(--text-tertiary)',
                    cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0,
                  }}
                >
                  Listeden Seç
                </button>
              )}
            </Label>
            {!ilgiliManuel ? (
              (() => {
                // Görüşme muhatabı + müşteri kişileri birleşik liste (duplicate temizlenir)
                const opts = []
                const seen = new Set()
                if (gorusme?.muhatapAd?.trim()) {
                  opts.push({ value: gorusme.muhatapAd, label: `${gorusme.muhatapAd}  ·  Görüşme muhatabı`, kaynak: 'muhatap' })
                  seen.add(gorusme.muhatapAd.trim().toLocaleLowerCase('tr'))
                }
                musteriKisileri.forEach(k => {
                  const key = String(k.ad || '').trim().toLocaleLowerCase('tr')
                  if (!key || seen.has(key)) return
                  seen.add(key)
                  opts.push({
                    value: k.ad,
                    label: `${k.ad}${k.unvan ? ' — ' + k.unvan : ''}${k.telefon ? ' (' + k.telefon + ')' : ''}`,
                    kaynak: 'kisi',
                  })
                })
                return (
                  <CustomSelect
                    value={form.ilgiliKisi}
                    onChange={e => setForm({ ...form, ilgiliKisi: e.target.value })}
                  >
                    <option value="">Seç...</option>
                    {opts.map(o => (
                      <option key={o.value + o.kaynak} value={o.value}>{o.label}</option>
                    ))}
                    {opts.length === 0 && (
                      <option value="" disabled>Bu müşteride kayıtlı kişi yok — "Manuel Yaz" tıkla</option>
                    )}
                  </CustomSelect>
                )
              })()
            ) : (
              <Input
                value={form.ilgiliKisi}
                onChange={e => setForm({ ...form, ilgiliKisi: e.target.value })}
                placeholder="Muhatap adı..."
              />
            )}
          </div>
          <div>
            <Label>Aciliyet</Label>
            <CustomSelect
              value={form.aciliyet}
              onChange={e => setForm({ ...form, aciliyet: e.target.value })}
            >
              {ACILIYETLER.map(a => (
                <option key={a.id} value={a.id}>{a.isim}</option>
              ))}
            </CustomSelect>
          </div>
          <div>
            <Label>Müşteri Onay Bilgisi</Label>
            <Input
              value={form.musteriOnayBilgisi}
              onChange={e => setForm({ ...form, musteriOnayBilgisi: e.target.value })}
              placeholder='"Telefonda onayladı", "WhatsApp yazılı onay"...'
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Label>Genel Açıklama / İhtiyaç Notu</Label>
          <Textarea
            value={form.aciklama}
            onChange={e => setForm({ ...form, aciklama: e.target.value })}
            rows={2}
            placeholder="Sipariş hakkında genel not..."
          />
        </div>

        {/* Kalemler */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Ürünler ({kalemler.length})</div>
            <Button variant="secondary" size="sm" iconLeft={<Plus size={13} />} onClick={kalemEkle}>
              Kalem Ekle
            </Button>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {kalemler.map((k, idx) => (
              <div key={idx} style={{
                border: '1px solid var(--border-default)', borderRadius: 8, padding: 12,
                background: 'var(--surface-sunken)', position: 'relative',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Kalem #{idx + 1}</div>
                  <button
                    onClick={() => kalemKaldir(idx)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                    title="Kalemi kaldır"
                  >
                    <Trash2 size={14} strokeWidth={1.5} />
                  </button>
                </div>

                {/* Stoktan seç veya manuel yaz */}
                {k.stokKodu ? (
                  <div style={{
                    padding: 8, borderRadius: 6, background: 'rgba(16,185,129,0.10)',
                    border: '1px solid rgba(16,185,129,0.3)', marginBottom: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>STOKTAN SEÇİLDİ</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>{k.stokKodu}</div>
                      <div style={{ fontSize: 12 }}>{k.urunAd}</div>
                      {k.urunMarka && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{k.urunMarka}</div>}
                    </div>
                    <button
                      onClick={() => stokKaldir(idx)}
                      style={{ background: 'none', border: '1px solid var(--border-default)', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '4px 8px', borderRadius: 4, fontSize: 11 }}
                    >
                      Değiştir
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Akıllı seçici (Faz 3): "2 mp 2.8 dome kamera" özellik bazlı
                        arama + stok durumu; manuel serbest metin de mümkün */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <AkilliUrunSecici
                          urunler={stokUrunleri}
                          value=""
                          placeholder="Stoktan seç — akıllı arama…"
                          onSec={(u) => stokSec(idx, u)}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Input
                          value={k.urunAd}
                          onChange={e => kalemGuncelle(idx, 'urunAd', e.target.value)}
                          placeholder="veya manuel ürün adı yaz…"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '80px 100px 1fr', gap: 8, marginTop: 8 }}>
                  <div>
                    <Label>Miktar</Label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      value={k.miktar}
                      onChange={e => kalemGuncelle(idx, 'miktar', Number(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label>Birim</Label>
                    <CustomSelect
                      value={k.birim}
                      onChange={e => kalemGuncelle(idx, 'birim', e.target.value)}
                    >
                      {BIRIMLER.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </CustomSelect>
                  </div>
                  <div>
                    <Label>Açıklama</Label>
                    <Input
                      value={k.aciklama || ''}
                      onChange={e => kalemGuncelle(idx, 'aciklama', e.target.value)}
                      placeholder="İhtiyaç notu (opsiyonel)"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alt butonlar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
          <div>
            {mevcutOnSiparis?.id && (
              <Button
                variant="ghost"
                onClick={sil}
                disabled={kaydediliyor}
                iconLeft={<Trash2 size={13} strokeWidth={1.5} />}
                style={{ color: '#ef4444' }}
              >
                Sil
              </Button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={onKapat}>Vazgeç</Button>
            <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
              {kaydediliyor ? 'Kaydediliyor…' : (mevcutOnSiparis ? 'Güncelle' : 'Kaydet')}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
