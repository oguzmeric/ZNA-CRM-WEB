// Sipariş Detay — başlık + kalem tablosu + durum makinesi + kâr hesabı.
// Yeni sipariş (path '/siparisler/yeni') veya mevcut (id ile).

import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Save, Plus, Trash2, Package, Building2, Calendar,
  ChevronRight, History, X, AlertCircle,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  Card, Button, Badge, Input, Label, Textarea,
} from '../components/ui'
import CustomSelect from '../components/CustomSelect'
import {
  siparisGetir, siparisEkle, siparisGuncelle, siparisDurumGuncelle,
  kalemleriGetir, kalemEkle, kalemGuncelle, kalemSil,
  durumGecmisiniGetir,
  SIPARIS_DURUMLARI, DURUM_ETIKET, DURUM_RENK, karGorebilir,
  kalemSatisTutari, kalemAlisTutari, kalemKar, siparisKalemToplam,
} from '../services/siparisService'
import { musterileriGetir } from '../services/musteriService'

const fmtPara = (n) => `₺ ${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtTarih = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  } catch { return iso }
}

const bosKalem = () => ({
  urunAd: '', urunMarka: '', urunModel: '', stokKodu: '', birim: 'Adet',
  miktar: 1, alisBirimFiyat: 0, satisBirimFiyat: 0, iskontoOrani: 0,
  teslimEdilenMiktar: 0, kalemDurumu: 'bekliyor', aciklama: '',
})

export default function SiparisDetay() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { kullanici } = useAuth()
  const toast = useToast()
  const yeni = !id

  const [siparis, setSiparis] = useState(null)
  const [kalemler, setKalemler] = useState([])
  const [musteriler, setMusteriler] = useState([])
  const [gecmis, setGecmis] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [durumModal, setDurumModal] = useState(null) // { yeniDurum, gerekce }

  const gosterKar = karGorebilir(kullanici)

  useEffect(() => {
    (async () => {
      setYukleniyor(true)
      const m = await musterileriGetir()
      setMusteriler(m || [])
      if (yeni) {
        // Query param'dan gel: musteriId, gorusmeId, teklifId
        setSiparis({
          musteriId: searchParams.get('musteriId') ? Number(searchParams.get('musteriId')) : null,
          durum: 'GORUSME_TALEBI',
          konu: searchParams.get('konu') || '',
          notlar: '',
          iskontoOrani: 0,
          iskontoTutari: 0,
          gorusmeId: searchParams.get('gorusmeId') ? Number(searchParams.get('gorusmeId')) : null,
          teklifId: searchParams.get('teklifId') ? Number(searchParams.get('teklifId')) : null,
          terminTarihi: null,
        })
        setKalemler([])
        setGecmis([])
      } else {
        const [s, k, g] = await Promise.all([
          siparisGetir(id),
          kalemleriGetir(id),
          durumGecmisiniGetir(id),
        ])
        setSiparis(s)
        setKalemler(k || [])
        setGecmis(g || [])
      }
      setYukleniyor(false)
    })()
  }, [id, yeni, searchParams])

  const musteri = useMemo(
    () => musteriler.find(m => m.id === siparis?.musteriId),
    [musteriler, siparis?.musteriId]
  )

  const toplamlar = useMemo(
    () => siparisKalemToplam(kalemler, siparis?.iskontoTutari),
    [kalemler, siparis?.iskontoTutari]
  )

  const musteriOpsiyonlari = useMemo(
    () => musteriler.map(m => ({
      value: m.id,
      label: m.firma ? `${m.firma} — ${m.ad || ''}`.trim() : (m.ad || '—'),
    })),
    [musteriler]
  )

  if (yukleniyor || !siparis) {
    return <div style={{ padding: 24, color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
  }

  const alanGuncelle = (k, v) => setSiparis({ ...siparis, [k]: v })

  const kalemGuncelleUI = (idx, k, v) => {
    const yeni = [...kalemler]
    yeni[idx] = { ...yeni[idx], [k]: v }
    setKalemler(yeni)
  }

  const kalemEkleUI = () => setKalemler([...kalemler, bosKalem()])

  const kalemKaldirUI = async (idx) => {
    const k = kalemler[idx]
    if (k.id) {
      const ok = confirm('Bu kalemi silmek istediğine emin misin?')
      if (!ok) return
      await kalemSil(k.id, siparis.id)
    }
    setKalemler(kalemler.filter((_, i) => i !== idx))
  }

  const kaydet = async () => {
    if (!siparis.musteriId) { toast.uyari('Müşteri seç.'); return }
    setKaydediliyor(true)
    try {
      let siparisId = siparis.id
      if (yeni) {
        const yeniSip = await siparisEkle(siparis, kullanici?.id)
        if (!yeniSip) { toast.hata('Sipariş oluşturulamadı.'); return }
        siparisId = yeniSip.id
        setSiparis(yeniSip)
      } else {
        await siparisGuncelle(siparis.id, siparis, kullanici?.id)
      }
      // Kalemleri kaydet
      for (const k of kalemler) {
        const payload = { ...k, siparisId }
        if (k.id) await kalemGuncelle(k.id, payload)
        else await kalemEkle(payload)
      }
      toast.basari('Kaydedildi.')
      if (yeni) navigate(`/siparisler/${siparisId}`, { replace: true })
    } catch (e) {
      toast.hata(e.message || 'Kayıt hatası')
    } finally {
      setKaydediliyor(false)
    }
  }

  const durumaGec = async (yeniDurum, gerekce) => {
    if (yeni) { toast.uyari('Önce siparişi kaydet.'); return }
    const guncel = await siparisDurumGuncelle(siparis.id, yeniDurum, kullanici?.id, gerekce)
    if (guncel) {
      setSiparis(guncel)
      const g = await durumGecmisiniGetir(siparis.id)
      setGecmis(g || [])
      toast.basari(`Durum: ${DURUM_ETIKET[yeniDurum]}`)
    }
    setDurumModal(null)
  }

  // Durum geçiş buton önerileri
  const durumButonlari = () => {
    const buts = []
    switch (siparis.durum) {
      case 'GORUSME_TALEBI':
        buts.push({ hedef: 'ON_SIPARIS', label: 'Ön Siparişe Al', renk: '#3b82f6' })
        break
      case 'ON_SIPARIS':
        buts.push({ hedef: 'ONAY_BEKLIYOR', label: 'Onaya Gönder', renk: '#f59e0b' })
        break
      case 'ONAY_BEKLIYOR':
        buts.push({ hedef: 'ONAYLANDI', label: 'Onayla', renk: '#10b981' })
        break
      case 'ONAYLANDI':
        buts.push({ hedef: 'TEDARIK', label: 'Tedariğe Al', renk: '#8b5cf6' })
        break
      case 'TEDARIK':
        buts.push({ hedef: 'SEVK_TESLIM', label: 'Teslim Edildi', renk: '#06b6d4' })
        buts.push({ hedef: 'KISMI_TESLIM', label: 'Kısmi Teslim', renk: '#0ea5e9' })
        break
      case 'SEVK_TESLIM':
      case 'KISMI_TESLIM':
        buts.push({ hedef: 'FATURALANDI', label: 'Faturalandı', renk: '#6366f1' })
        break
      case 'FATURALANDI':
        buts.push({ hedef: 'KAPANDI', label: 'Kapat', renk: '#059669' })
        break
    }
    if (!['KAPANDI','IPTAL'].includes(siparis.durum)) {
      buts.push({ hedef: 'IPTAL', label: 'İptal Et', renk: '#ef4444', gerekce: true })
    }
    return buts
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Üst bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Button variant="ghost" iconLeft={<ArrowLeft size={14} />} onClick={() => navigate('/siparisler')}>
          Geri
        </Button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
              {yeni ? 'Yeni Sipariş' : (siparis.siparisNo || 'Sipariş Detay')}
            </h1>
            {!yeni && (
              <Badge style={{
                background: `${DURUM_RENK[siparis.durum]}22`,
                color: DURUM_RENK[siparis.durum],
                border: `1px solid ${DURUM_RENK[siparis.durum]}55`,
              }}>
                {DURUM_ETIKET[siparis.durum]}
              </Badge>
            )}
          </div>
        </div>
        <Button variant="primary" iconLeft={<Save size={14} />} onClick={kaydet} disabled={kaydediliyor}>
          {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
      </div>

      {/* İçerik: 2 kolon grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.5fr) minmax(280px, 1fr)', gap: 16 }}>
        {/* Sol: kalemler */}
        <div style={{ display: 'grid', gap: 16 }}>
          {/* Başlık bilgileri */}
          <Card style={{ padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <div>
                <Label>Müşteri *</Label>
                <CustomSelect
                  value={siparis.musteriId || ''}
                  onChange={v => alanGuncelle('musteriId', Number(v) || null)}
                  options={[{ value: '', label: 'Seç...' }, ...musteriOpsiyonlari]}
                />
              </div>
              <div>
                <Label>Konu</Label>
                <Input
                  value={siparis.konu || ''}
                  onChange={e => alanGuncelle('konu', e.target.value)}
                  placeholder="Örn. Depo alarm modernizasyonu"
                />
              </div>
              <div>
                <Label>Termin Tarihi</Label>
                <Input
                  type="date"
                  value={siparis.terminTarihi ? String(siparis.terminTarihi).slice(0,10) : ''}
                  onChange={e => alanGuncelle('terminTarihi', e.target.value || null)}
                />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <Label>Notlar</Label>
              <Textarea
                rows={2}
                value={siparis.notlar || ''}
                onChange={e => alanGuncelle('notlar', e.target.value)}
                placeholder="Sipariş notları, özel talepler..."
              />
            </div>
          </Card>

          {/* Kalemler */}
          <Card style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Kalemler ({kalemler.length})</h3>
              <Button variant="secondary" size="sm" iconLeft={<Plus size={13} />} onClick={kalemEkleUI}>
                Kalem Ekle
              </Button>
            </div>

            {kalemler.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                Kalem yok. Yukarıdan ekle.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-tertiary)' }}>
                      <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 500 }}>Ürün</th>
                      <th style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 500, width: 70 }}>Miktar</th>
                      {gosterKar && (
                        <th style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 500, width: 100 }}>Alış ₺</th>
                      )}
                      <th style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 500, width: 100 }}>Satış ₺</th>
                      <th style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 500, width: 60 }}>İsk %</th>
                      <th style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 500, width: 110 }}>Tutar</th>
                      {gosterKar && (
                        <th style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 500, width: 100 }}>Kâr</th>
                      )}
                      <th style={{ width: 34 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {kalemler.map((k, idx) => {
                      const satis = kalemSatisTutari(k)
                      const kar = kalemKar(k)
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '6px 6px' }}>
                            <Input
                              value={k.urunAd || ''}
                              onChange={e => kalemGuncelleUI(idx, 'urunAd', e.target.value)}
                              placeholder="Ürün adı"
                              style={{ fontSize: 12 }}
                            />
                          </td>
                          <td style={{ padding: '6px 6px' }}>
                            <Input
                              type="number"
                              step="0.001"
                              value={k.miktar}
                              onChange={e => kalemGuncelleUI(idx, 'miktar', Number(e.target.value) || 0)}
                              style={{ fontSize: 12, textAlign: 'right' }}
                            />
                          </td>
                          {gosterKar && (
                            <td style={{ padding: '6px 6px' }}>
                              <Input
                                type="number"
                                step="0.01"
                                value={k.alisBirimFiyat}
                                onChange={e => kalemGuncelleUI(idx, 'alisBirimFiyat', Number(e.target.value) || 0)}
                                style={{ fontSize: 12, textAlign: 'right' }}
                              />
                            </td>
                          )}
                          <td style={{ padding: '6px 6px' }}>
                            <Input
                              type="number"
                              step="0.01"
                              value={k.satisBirimFiyat}
                              onChange={e => kalemGuncelleUI(idx, 'satisBirimFiyat', Number(e.target.value) || 0)}
                              style={{ fontSize: 12, textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ padding: '6px 6px' }}>
                            <Input
                              type="number"
                              step="0.01"
                              value={k.iskontoOrani || 0}
                              onChange={e => kalemGuncelleUI(idx, 'iskontoOrani', Number(e.target.value) || 0)}
                              style={{ fontSize: 12, textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 600 }}>
                            {fmtPara(satis)}
                          </td>
                          {gosterKar && (
                            <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 600, color: kar >= 0 ? '#10b981' : '#ef4444' }}>
                              {fmtPara(kar)}
                            </td>
                          )}
                          <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                            <button
                              onClick={() => kalemKaldirUI(idx)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                              title="Sil"
                            >
                              <Trash2 size={14} strokeWidth={1.5} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Toplamlar */}
            {kalemler.length > 0 && (
              <div style={{
                marginTop: 12, padding: 12, background: 'var(--surface-sunken)',
                borderRadius: 8, display: 'grid',
                gridTemplateColumns: gosterKar ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
                gap: 12,
              }}>
                {gosterKar && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Toplam Alış</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtPara(toplamlar.toplamAlis)}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Toplam Satış</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtPara(toplamlar.toplamSatis)}</div>
                </div>
                {gosterKar && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Kâr</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: toplamlar.toplamKar >= 0 ? '#10b981' : '#ef4444' }}>
                      {fmtPara(toplamlar.toplamKar)}
                    </div>
                  </div>
                )}
                {gosterKar && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Marj</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>%{toplamlar.marj.toFixed(1)}</div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Sağ: durum + eylem + geçmiş */}
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          {!yeni && (
            <Card style={{ padding: 16 }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600 }}>Durum İşlemleri</h3>
              <div style={{ display: 'grid', gap: 8 }}>
                {durumButonlari().map(b => (
                  <button
                    key={b.hedef}
                    onClick={() => b.gerekce ? setDurumModal({ yeniDurum: b.hedef, gerekce: '' }) : durumaGec(b.hedef)}
                    style={{
                      padding: '10px 12px', borderRadius: 8, border: `1px solid ${b.renk}55`,
                      background: `${b.renk}18`, color: b.renk, fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <span>{b.label}</span>
                    <ChevronRight size={14} strokeWidth={1.5} />
                  </button>
                ))}
                {durumButonlari().length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Bu durumda ek işlem yok.</div>
                )}
              </div>
            </Card>
          )}

          {/* Müşteri özet */}
          {musteri && (
            <Card style={{ padding: 16 }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Building2 size={14} strokeWidth={1.5} /> Müşteri
              </h3>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{musteri.firma || musteri.ad}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{musteri.ad}</div>
              {musteri.telefon && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{musteri.telefon}</div>}
              <Button
                variant="ghost" size="sm"
                onClick={() => navigate(`/musteriler/${musteri.id}`)}
                style={{ marginTop: 8 }}
              >
                Müşteri Kartı →
              </Button>
            </Card>
          )}

          {/* Geçmiş */}
          {!yeni && gecmis.length > 0 && (
            <Card style={{ padding: 16 }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <History size={14} strokeWidth={1.5} /> Durum Geçmişi
              </h3>
              <div style={{ display: 'grid', gap: 8, maxHeight: 300, overflow: 'auto' }}>
                {gecmis.map(g => (
                  <div key={g.id} style={{ fontSize: 12, padding: '6px 8px', borderRadius: 6, background: 'var(--surface-sunken)' }}>
                    <div style={{ fontWeight: 600, color: DURUM_RENK[g.yeniDurum] }}>
                      {g.eskiDurum ? `${DURUM_ETIKET[g.eskiDurum]} → ` : ''}{DURUM_ETIKET[g.yeniDurum]}
                    </div>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{fmtTarih(g.olusturmaTarih)}</div>
                    {g.gerekce && <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>{g.gerekce}</div>}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* İptal gerekçe modalı */}
      {durumModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--surface-card)', borderRadius: 12, padding: 20,
            maxWidth: 480, width: '100%', border: '1px solid var(--border-default)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{DURUM_ETIKET[durumModal.yeniDurum]} — Gerekçe</h3>
              <button onClick={() => setDurumModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
            <Textarea
              rows={3}
              value={durumModal.gerekce}
              onChange={e => setDurumModal({ ...durumModal, gerekce: e.target.value })}
              placeholder="Sebep..."
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <Button variant="ghost" onClick={() => setDurumModal(null)}>Vazgeç</Button>
              <Button variant="primary" onClick={() => durumaGec(durumModal.yeniDurum, durumModal.gerekce)}>
                Uygula
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
