// Toplu Bakım Detayı — merkez görünümü. Kalem durumları, sonuç metinleri,
// sonradan kalem ekleme (yalnız saha sorumlusu — spec madde 15), iptal.
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Wrench, ArrowLeft, Plus, Trash2, XCircle, MapPin, Phone, FileText, Printer, Smartphone } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { kullanicilariGetir } from '../services/kullaniciService'
import {
  topluBakimGetir, topluBakimGuncelle, topluBakimKalemEkle, topluBakimKalemSil,
  topluBakimSil,
  tbDurumBilgi, kalemBilgi, kalemDurumBilgi, sahaSorumlusuMu, BAKIM_KALEMLERI,
} from '../services/topluBakimService'
import { Button, Card, Badge, Input } from '../components/ui'
import BakimKalemFormModal from '../components/BakimKalemFormModal'
import ImzaPad from '../components/ImzaPad'

const fmtTarih = (t) => t ? new Date(String(t).includes('T') ? t : t + 'T00:00:00').toLocaleDateString('tr-TR') : '—'
const fmtTarihSaat = (t) => t ? new Date(t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export default function BakimDetay() {
  const { id } = useParams()
  const { kullanici } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [tb, setTb] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [personel, setPersonel] = useState([])
  const [kalemEkleAcik, setKalemEkleAcik] = useState(false)
  // Web'den yürütme: kalem formu + imza (mobil ile aynı akış, spec akışı korunur)
  const [acikKalem, setAcikKalem] = useState(null)
  const [imzaHedef, setImzaHedef] = useState(null)   // 'musteri' | 'personel'

  const yukle = useCallback(async () => {
    const t = await topluBakimGetir(id)
    setTb(t)
    setYukleniyor(false)
  }, [id])

  useEffect(() => { yukle() }, [yukle])
  useEffect(() => {
    kullanicilariGetir().then((k) => setPersonel(k || [])).catch(() => {})
  }, [])

  const personelAd = (pid) => personel.find((p) => String(p.id) === String(pid))?.ad || (pid ? `#${pid}` : '—')
  const sahaMi = sahaSorumlusuMu(kullanici)

  const kalemEkle = async (tip) => {
    const k = await topluBakimKalemEkle(tb.id, tip)
    if (k) {
      toast?.success?.(`${kalemBilgi(tip).isim} eklendi (${k.altNo}) — teknik personel ekranına yansır.`)
      setKalemEkleAcik(false)
      yukle()
    } else {
      toast?.error?.('Kalem eklenemedi (aynı kalem zaten var olabilir).')
    }
  }

  const kalemSil = async (k) => {
    if (!window.confirm(`${kalemBilgi(k.kalemTip).isim} kalemi silinsin mi?`)) return
    const s = await topluBakimKalemSil(k)
    if (s?.hata) toast?.error?.(s.hata)
    else { toast?.success?.('Kalem silindi.'); yukle() }
  }

  const iptalEt = async () => {
    const sebep = window.prompt('İptal sebebi:')
    if (sebep === null) return
    const g = await topluBakimGuncelle(tb.id, { durum: 'iptal', iptalSebebi: sebep || null })
    if (g) { toast?.success?.('İş emri iptal edildi.'); yukle() }
    else toast?.error?.('İptal edilemedi.')
  }

  const kaliciSil = async () => {
    if (!window.confirm(`${tb.tbNo} kalıcı olarak silinecek (tüm kalemleriyle birlikte). Emin misiniz?`)) return
    const s = await topluBakimSil(tb.id)
    if (s?.hata) { toast?.error?.('Silinemedi: ' + s.hata); return }
    toast?.success?.('Bakım işi silindi.')
    navigate('/bakim-isleri')
  }

  if (yukleniyor) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
  if (!tb) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Bakım işi bulunamadı.</div>

  const d = tbDurumBilgi(tb.durum)
  const tamam = tb.kalemler.filter((k) => k.durum === 'tamamlandi').length
  const oran = tb.kalemler.length ? Math.round((tamam / tb.kalemler.length) * 100) : 0
  const eklenebilirKalemler = Object.keys(BAKIM_KALEMLERI)
    .filter((tip) => !tb.kalemler.some((k) => k.kalemTip === tip))

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      {/* Başlık */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate('/bakim-isleri')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'inline-flex' }}>
            <ArrowLeft size={20} />
          </button>
          <Wrench size={20} style={{ color: 'var(--brand-primary)' }} />
          <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 800, color: 'var(--brand-primary)' }}>{tb.tbNo}</span>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 'var(--radius-pill)',
            background: `${d.renk}1a`, color: d.renk,
          }}>
            {d.isim}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => window.open(`/bakim-isleri/${tb.id}/yazdir`, '_blank')}>
            <Printer size={15} /> Rapor / Yazdır
          </Button>
          {sahaMi && (
            <>
              {tb.durum !== 'iptal' && tb.durum !== 'tamamlandi' && (
                <Button variant="ghost" onClick={iptalEt} style={{ color: '#dc2626' }}>
                  <XCircle size={15} /> İptal Et
                </Button>
              )}
              <Button variant="ghost" onClick={kaliciSil} style={{ color: '#dc2626' }}>
                <Trash2 size={15} /> Sil
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Sıradaki adım şeridi — "iş burada mı kalıyor?" karışıklığını önler:
          yürütme MOBİLDE, web izleme + rapor merkezi */}
      {tb.durum !== 'iptal' && (
        <Card style={{
          marginBottom: 16, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          background: tb.durum === 'tamamlandi' ? 'rgba(34,197,94,0.08)' : 'rgba(59,130,246,0.07)',
          border: `1px solid ${tb.durum === 'tamamlandi' ? 'rgba(34,197,94,0.35)' : 'rgba(59,130,246,0.25)'}`,
        }}>
          <Smartphone size={16} style={{ color: tb.durum === 'tamamlandi' ? '#16a34a' : 'var(--brand-primary)', flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {['planlandi', 'atandi'].includes(tb.durum) && (
              <>
                <strong>Sıradaki adım mobilde:</strong> Bu iş, {personelAd(tb.teknikPersonelId)}'in telefonundaki
                <strong> Bakım</strong> ekranına düştü. "Yola Çıktım → Lokasyona Ulaştım → Bakımı Başlat" akışı ve
                bakım formları mobil uygulamada doldurulur — buradan ilerlemeyi canlı izlersiniz.
              </>
            )}
            {['yola_cikildi', 'lokasyona_ulasildi', 'bakim_basladi', 'devam_ediyor', 'eksik_bakim'].includes(tb.durum) && (
              <><strong>Teknik personel sahada</strong> — kalem durumları ve sonuç metinleri tamamlandıkça burada görünür.</>
            )}
            {tb.durum === 'imza_bekleniyor' && (
              <><strong>Kalemler tamamlandı</strong> — mobilde müşteri yetkilisi ve teknik personel imzaları bekleniyor.</>
            )}
            {['tamamlandi', 'yonetici_kontrolunde', 'musteriye_gonderildi'].includes(tb.durum) && (
              <><strong>Bakım tamamlandı</strong> — "Rapor / Yazdır" ile birleşik rapor ve kalem formlarını PDF alabilirsiniz.</>
            )}
          </span>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        {/* Sol — kalemler */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Saha akışı web'den de yürütülebilir */}
          {!['iptal', 'tamamlandi', 'imza_bekleniyor'].includes(tb.durum) && (
            <Card style={{ padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['planlandi', 'atandi'].includes(tb.durum) && (
                <Button variant="primary" onClick={async () => {
                  const g = await topluBakimGuncelle(tb.id, { durum: 'yola_cikildi', yolaCikisTarih: new Date().toISOString() })
                  if (g) yukle()
                }}>🚗 Yola Çıkıldı</Button>
              )}
              {tb.durum === 'yola_cikildi' && (
                <Button variant="primary" onClick={async () => {
                  const g = await topluBakimGuncelle(tb.id, { durum: 'lokasyona_ulasildi', ulasmaTarih: new Date().toISOString() })
                  if (g) yukle()
                }}>📍 Lokasyona Ulaşıldı</Button>
              )}
              {tb.durum === 'lokasyona_ulasildi' && (
                <Button variant="primary" onClick={async () => {
                  const g = await topluBakimGuncelle(tb.id, { durum: 'bakim_basladi', baslamaTarih: new Date().toISOString() })
                  if (g) yukle()
                }}>▶️ Bakımı Başlat</Button>
              )}
              {['bakim_basladi', 'devam_ediyor', 'eksik_bakim'].includes(tb.durum) && (
                <Button
                  variant="primary"
                  disabled={!tb.kalemler.every((k) => ['tamamlandi', 'ariza_tespit', 'yapilamadi'].includes(k.durum))}
                  onClick={async () => {
                    const g = await topluBakimGuncelle(tb.id, { durum: 'imza_bekleniyor', bitisTarih: new Date().toISOString() })
                    if (g) yukle()
                  }}
                >
                  ✅ Tümünü Tamamla ve İmzaya Geç
                </Button>
              )}
              <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)', alignSelf: 'center' }}>
                Aynı akış mobilde de yürütülebilir — hangisi önce işlerse o geçerli.
              </span>
            </Card>
          )}

          {/* İlerleme */}
          <Card style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              <span><strong>{tamam}</strong> / {tb.kalemler.length} kalem tamamlandı</span>
              <span style={{ fontWeight: 700 }}>%{oran}</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-sunken)', overflow: 'hidden' }}>
              <div style={{ width: `${oran}%`, height: '100%', background: oran === 100 ? '#22c55e' : 'var(--brand-primary)', transition: 'width 300ms' }} />
            </div>
          </Card>

          {/* Kalem kartları */}
          {tb.kalemler.map((k) => {
            const kb = kalemBilgi(k.kalemTip)
            const kd = kalemDurumBilgi(k.durum)
            const formAcilabilir = ['bakim_basladi', 'devam_ediyor', 'eksik_bakim', 'imza_bekleniyor'].includes(tb.durum)
            return (
              <Card
                key={k.id}
                onClick={() => formAcilabilir && setAcikKalem(k)}
                style={{ padding: '12px 16px', borderLeft: `3px solid ${kb.renk}`, cursor: formAcilabilir ? 'pointer' : 'default' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{kb.ikon} {kb.isim}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-tertiary)' }}>{k.altNo}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                      background: `${kd.renk}1a`, color: kd.renk,
                    }}>
                      {kd.isim}
                    </span>
                    {k.arizaVar && <Badge tone="danger" style={{ fontSize: 10 }}>⚠️ ARIZA</Badge>}
                  </div>
                  {sahaMi && k.durum !== 'tamamlandi' && tb.durum !== 'iptal' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); kalemSil(k) }}
                      title="Kalemi sil (tamamlanmış kalem silinemez)"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'inline-flex' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                {k.yapilamadiSebep && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#f59e0b' }}>
                    Bakım yapılamadı: {k.yapilamadiSebep}
                  </div>
                )}
                {k.sonucMetni && (
                  <div style={{
                    marginTop: 8, padding: 10, borderRadius: 8, fontSize: 12.5, lineHeight: 1.55,
                    background: 'var(--surface-sunken)', color: 'var(--text-secondary)',
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                  }}>
                    <FileText size={14} style={{ flexShrink: 0, marginTop: 2, color: kb.renk }} />
                    <span>{k.sonucMetni}</span>
                  </div>
                )}
              </Card>
            )
          })}

          {/* İmza adımı — web'den de (spec 21-22-26) */}
          {tb.durum === 'imza_bekleniyor' && (
            <Card style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>✍️ İmza ve Tamamlama</div>
              {!tb.musteriImzaUrl && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <Input id="tb-yetkili-ad" defaultValue={tb.musteriYetkiliAd || ''} placeholder="Müşteri yetkilisi adı *" />
                  <Input id="tb-yetkili-gorev" defaultValue={tb.musteriYetkiliGorev || ''} placeholder="Görevi" />
                  <Input id="tb-yetkili-tel" defaultValue={tb.musteriYetkiliTel || ''} placeholder="Telefon" />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant={tb.musteriImzaUrl ? 'secondary' : 'primary'} onClick={() => {
                  if (!tb.musteriImzaUrl) {
                    const ad = document.getElementById('tb-yetkili-ad')?.value?.trim()
                    if (!ad) { toast?.error?.('Önce müşteri yetkilisinin adını girin.'); return }
                  }
                  setImzaHedef('musteri')
                }}>
                  {tb.musteriImzaUrl ? '✓ Müşteri İmzası Alındı' : 'Müşteri İmzası Al'}
                </Button>
                <Button variant={tb.personelImzaUrl ? 'secondary' : 'primary'} onClick={() => setImzaHedef('personel')}>
                  {tb.personelImzaUrl ? '✓ Personel İmzası Alındı' : 'Personel İmzası Al'}
                </Button>
                <Button
                  variant="primary"
                  disabled={!tb.musteriImzaUrl || !tb.personelImzaUrl}
                  style={{ marginLeft: 'auto', background: '#16a34a' }}
                  onClick={async () => {
                    const g = await topluBakimGuncelle(tb.id, { durum: 'tamamlandi' })
                    if (g) { toast?.success?.(`${tb.tbNo} tamamlandı 🎉`); yukle() }
                  }}
                >
                  Toplu Bakımı Tamamla
                </Button>
              </div>
            </Card>
          )}

          {/* Kalem ekleme — spec 15: yalnız saha sorumlusu; teknik personele otomatik yansır */}
          {sahaMi && tb.durum !== 'iptal' && tb.durum !== 'tamamlandi' && eklenebilirKalemler.length > 0 && (
            <Card style={{ padding: '12px 16px' }}>
              {!kalemEkleAcik ? (
                <Button variant="secondary" onClick={() => setKalemEkleAcik(true)}>
                  <Plus size={15} /> Bakım Kalemi Ekle
                </Button>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {eklenebilirKalemler.map((tip) => (
                    <Button key={tip} variant="secondary" onClick={() => kalemEkle(tip)}>
                      {kalemBilgi(tip).ikon} {kalemBilgi(tip).isim}
                    </Button>
                  ))}
                  <Button variant="ghost" onClick={() => setKalemEkleAcik(false)}>Vazgeç</Button>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* Sağ — iş bilgileri */}
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
          <Bilgi etiket="Müşteri" deger={tb.musteriFirma} />
          <Bilgi etiket="Lokasyon" deger={tb.lokasyonAdi} ikon={<MapPin size={12} />} />
          {tb.lokasyonAdres && <Bilgi etiket="Adres" deger={tb.lokasyonAdres} />}
          <Bilgi etiket="Bakım Dönemi" deger={tb.bakimDonemi} />
          <Bilgi etiket="Planlanan" deger={`${fmtTarih(tb.planlananTarih)}${tb.planlananSaat ? ' · ' + tb.planlananSaat : ''}`} />
          <Bilgi etiket="Teknik Personel" deger={personelAd(tb.teknikPersonelId)} />
          {tb.ekipIds?.length > 0 && (
            <Bilgi etiket="Yardımcı Ekip" deger={tb.ekipIds.map(personelAd).join(', ')} />
          )}
          <Bilgi etiket="Saha Sorumlusu" deger={personelAd(tb.olusturanId)} />
          {tb.musteriYetkiliAd && (
            <Bilgi
              etiket="Müşteri Yetkilisi"
              deger={`${tb.musteriYetkiliAd}${tb.musteriYetkiliGorev ? ' · ' + tb.musteriYetkiliGorev : ''}${tb.musteriYetkiliTel ? ' · ' + tb.musteriYetkiliTel : ''}`}
              ikon={<Phone size={12} />}
            />
          )}
          <Bilgi etiket="Öncelik" deger={tb.oncelik} />
          {tb.aciklama && <Bilgi etiket="Açıklama" deger={tb.aciklama} />}
          {tb.iptalSebebi && <Bilgi etiket="İptal Sebebi" deger={tb.iptalSebebi} />}

          {/* İmzalar (F4 — mobilde alınır, burada görünür) */}
          {(tb.musteriImzaUrl || tb.personelImzaUrl) && (
            <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 6 }}>İMZALAR</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {tb.musteriImzaUrl && (
                  <div style={{ flex: 1, border: '1px solid var(--border-default)', borderRadius: 8, padding: 6, background: '#fff', textAlign: 'center' }}>
                    <img src={tb.musteriImzaUrl} alt="Müşteri imzası" style={{ maxHeight: 40, maxWidth: '100%' }} />
                    <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>Müşteri</div>
                  </div>
                )}
                {tb.personelImzaUrl && (
                  <div style={{ flex: 1, border: '1px solid var(--border-default)', borderRadius: 8, padding: 6, background: '#fff', textAlign: 'center' }}>
                    <img src={tb.personelImzaUrl} alt="Personel imzası" style={{ maxHeight: 40, maxWidth: '100%' }} />
                    <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>Personel</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Saha zaman çizelgesi */}
          {(tb.yolaCikisTarih || tb.ulasmaTarih || tb.baslamaTarih || tb.bitisTarih) && (
            <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tb.yolaCikisTarih && <Bilgi etiket="Yola Çıkış" deger={fmtTarihSaat(tb.yolaCikisTarih)} />}
              {tb.ulasmaTarih && <Bilgi etiket="Lokasyona Ulaşma" deger={fmtTarihSaat(tb.ulasmaTarih)} />}
              {tb.baslamaTarih && <Bilgi etiket="Bakım Başlangıcı" deger={fmtTarihSaat(tb.baslamaTarih)} />}
              {tb.bitisTarih && <Bilgi etiket="Bakım Bitişi" deger={fmtTarihSaat(tb.bitisTarih)} />}
            </div>
          )}
        </Card>
      </div>

      {acikKalem && (
        <BakimKalemFormModal
          kalem={acikKalem}
          onKapat={() => setAcikKalem(null)}
          onKaydedildi={() => { setAcikKalem(null); yukle() }}
        />
      )}
      {imzaHedef && (
        <ImzaPad
          baslik={imzaHedef === 'musteri' ? 'Müşteri Yetkilisi İmzası' : 'Teknik Personel İmzası'}
          onKapat={() => setImzaHedef(null)}
          onKaydet={async (dataUrl) => {
            const simdi = new Date().toISOString()
            const patch = imzaHedef === 'musteri'
              ? {
                  musteriImzaUrl: dataUrl, musteriImzaTarih: simdi,
                  musteriYetkiliAd: document.getElementById('tb-yetkili-ad')?.value?.trim() || tb.musteriYetkiliAd,
                  musteriYetkiliGorev: document.getElementById('tb-yetkili-gorev')?.value?.trim() || tb.musteriYetkiliGorev,
                  musteriYetkiliTel: document.getElementById('tb-yetkili-tel')?.value?.trim() || tb.musteriYetkiliTel,
                }
              : { personelImzaUrl: dataUrl, personelImzaTarih: simdi }
            const g = await topluBakimGuncelle(tb.id, patch)
            setImzaHedef(null)
            if (g) yukle()
            else toast?.error?.('İmza kaydedilemedi.')
          }}
        />
      )}
    </div>
  )
}

function Bilgi({ etiket, deger, ikon }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {ikon}{etiket}
      </div>
      <div style={{ color: 'var(--text-primary)' }}>{deger || '—'}</div>
    </div>
  )
}
