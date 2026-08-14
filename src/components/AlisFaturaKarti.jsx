// Siparişin TEDARİKÇİ (alış) faturaları — mig 249.
//
// ⚠️ Bu kart GELEN faturaları gösterir: tedarikçi bize kesiyor, gider tarafı.
// Sayfadaki "Fatura Kesilecek" butonu ise GİDEN (müşteriye) proformayı açar.
// İkisi karışmasın diye başlıkta ve butonda "Tedarikçi" kelimesi zorunlu.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Truck, Upload, FileText, Trash2, Search, Plus, Pencil, MapPin } from 'lucide-react'
import { Card, CardTitle, Button, Badge, Input, Label, Textarea, Modal } from './ui'
import BelgeOnizlemeModal from './BelgeOnizlemeModal'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import {
  alisFaturalariGetir, alisFaturaEkle, alisFaturaDuzenle, alisFaturaSil, alisFaturaDosyaUrl,
  tedarikciAra, tedarikToplami,
} from '../services/alisFaturaService'
import { sayiCoz } from '../lib/teklifHesap'
import {
  KDV_ORANLARI, ORAN_ELLE, tutarAlaniYazildi, oranDegistirildi,
  ucluTutarli, ucluSapmasi, oraniTahminEt,
} from '../lib/tutarUclusu'

const PARA_SEMBOL = { TL: '₺', USD: '$', EUR: '€' }
const fmtPara = (n, pb = 'TL') =>
  `${PARA_SEMBOL[pb] || pb} ${(Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'

const BOS_FORM = {
  tedarikciAd: '', vergiNo: '', faturaNo: '', faturaTarihi: '', ettn: '',
  paraBirimi: 'TL', araToplam: '', kdvToplam: '', genelToplam: '', aciklama: '',
}

export default function AlisFaturaKarti({ siparis, lokasyonAd = '' }) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { kullanici } = useAuth()

  const [faturalar, setFaturalar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  // null = kapalı | 'yeni' = ekleme | kayıt nesnesi = düzenleme
  const [modal, setModal] = useState(null)
  const [belge, setBelge] = useState(null)   // { url, baslik, indirmeAdi }

  const yukle = useCallback(async () => {
    setYukleniyor(true)
    setFaturalar(await alisFaturalariGetir(siparis?.id))
    setYukleniyor(false)
  }, [siparis?.id])

  useEffect(() => { yukle() }, [yukle])

  const belgeAc = async (f) => {
    const url = await alisFaturaDosyaUrl(f.dosyaYol)
    if (!url) { toast.error('Belge açılamadı. Dosya taşınmış olabilir.'); return }
    const uz = (f.dosyaYol.split('.').pop() || 'pdf').toLowerCase()
    const temiz = (s) => (s || '').replace(/[\\/:*?"<>|]/g, '-')
    setBelge({
      url,
      baslik: `${f.tedarikciAd} — ${f.faturaNo}`,
      indirmeAdi: `${temiz(siparis?.siparisNo || 'siparis')} - ${temiz(f.tedarikciAd)} - ${temiz(f.faturaNo)}.${uz}`,
    })
  }

  const sil = async (f) => {
    const onay = await confirm({
      baslik: 'Tedarikçi Faturasını Sil',
      mesaj: `${f.tedarikciAd} — ${f.faturaNo} kaydı ve yüklenen dosya kalıcı olarak silinecek. Devam edilsin mi?`,
      onayMetin: 'Sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    const sonuc = await alisFaturaSil(f)
    if (sonuc?._hata) { toast.error('Silinemedi: ' + sonuc._hata); return }
    toast.success('Tedarikçi faturası silindi.')
    yukle()
  }

  const toplamlar = tedarikToplami(faturalar)

  return (
    <>
      <Card style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <CardTitle style={{ margin: 0 }}>
            <Truck size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
            Tedarikçi Faturaları
          </CardTitle>
          {faturalar.length > 0 && <Badge tone="neutral">{faturalar.length}</Badge>}
        </div>
        <p style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--text-tertiary)', margin: '0 0 10px' }}>
          Bu siparişi karşılamak için tedarikçiden alınan mal/hizmetin <strong>bize kesilen</strong> faturaları.
        </p>

        {/* Şube künyesi (mig 286) — gelen fatura sipariş numarasıyla eşleştirilirken
            "bu hangi şube?" sorusu buradan cevaplanıyor. Sipariş detayında müşteri
            kartında da yazar ama fatura yüklerken göz burada oluyor. */}
        {lokasyonAd && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10,
            fontSize: 12, fontWeight: 600, color: '#7c3aed',
            background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.22)',
            borderRadius: 6, padding: '5px 8px',
          }}>
            <MapPin size={12} style={{ flexShrink: 0 }} />
            <span>{lokasyonAd}</span>
          </div>
        )}

        {yukleniyor ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
        ) : faturalar.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>
            Henüz tedarikçi faturası yüklenmedi.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            {faturalar.map(f => (
              <div key={f.id} style={{
                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                padding: '8px 10px', background: 'var(--surface-sunken)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, wordBreak: 'break-word' }}>{f.tedarikciAd}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                      {f.faturaNo} · {fmtTarih(f.faturaTarihi)}
                    </div>
                  </div>
                  <strong style={{ fontSize: 12.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtPara(f.genelToplam, f.paraBirimi)}
                  </strong>
                </div>
                {f.aciklama && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 3 }}>{f.aciklama}</div>
                )}
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  <Button variant="ghost" size="sm" iconLeft={<FileText size={12} strokeWidth={1.5} />}
                    onClick={() => belgeAc(f)}>Görüntüle</Button>
                  <Button variant="ghost" size="sm" iconLeft={<Pencil size={12} strokeWidth={1.5} />}
                    onClick={() => setModal(f)}>Düzenle</Button>
                  <Button variant="ghost" size="sm" style={{ color: 'var(--danger)' }}
                    iconLeft={<Trash2 size={12} strokeWidth={1.5} />} onClick={() => sil(f)}>Sil</Button>
                </div>
              </div>
            ))}

            {/* Para birimleri TOPLANMAZ — her biri ayrı satır */}
            <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>Toplam tedarik maliyeti</div>
              {toplamlar.map(t => (
                <div key={t.paraBirimi} style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtPara(t.tutar, t.paraBirimi)}
                </div>
              ))}
            </div>
          </div>
        )}

        <Button variant="secondary" size="sm" iconLeft={<Upload size={13} strokeWidth={1.5} />}
          onClick={() => setModal('yeni')} style={{ width: '100%' }}>
          Tedarikçi Faturası Yükle
        </Button>
      </Card>

      {modal && (
        <AlisFaturaModal
          siparis={siparis}
          kullanici={kullanici}
          mevcut={modal === 'yeni' ? null : modal}
          onKapat={() => setModal(null)}
          onKaydedildi={() => { setModal(null); yukle() }}
        />
      )}

      {belge && (
        <BelgeOnizlemeModal
          baslik={belge.baslik} url={belge.url} indirmeAdi={belge.indirmeAdi}
          onKapat={() => setBelge(null)}
        />
      )}
    </>
  )
}

// ---------------- Yükleme modalı ----------------

function AlisFaturaModal({ siparis, kullanici, mevcut, onKapat, onKaydedildi }) {
  const { toast } = useToast()
  const dosyaRef = useRef(null)
  const duzenleme = !!mevcut

  const [form, setForm] = useState(() => mevcut ? {
    tedarikciAd: mevcut.tedarikciAd || '',
    vergiNo: mevcut.tedarikciVergiNo || '',
    faturaNo: mevcut.faturaNo || '',
    faturaTarihi: mevcut.faturaTarihi || '',
    ettn: mevcut.ettn || '',
    paraBirimi: mevcut.paraBirimi || 'TL',
    araToplam: mevcut.araToplam ?? '',
    kdvToplam: mevcut.kdvToplam ?? '',
    genelToplam: mevcut.genelToplam ?? '',
    aciklama: mevcut.aciklama || '',
  } : BOS_FORM)
  // Düzenlemede cari kart bağı korunur; kullanıcı "Değiştir" derse yeniden seçer.
  const [tedarikci, setTedarikci] = useState(() => mevcut?.tedarikciMusteriId
    ? { id: mevcut.tedarikciMusteriId, firma: mevcut.tedarikciAd, vergiNo: mevcut.tedarikciVergiNo, kod: '' }
    : null)
  const [arama, setArama] = useState('')
  const [sonuclar, setSonuclar] = useState([])
  const [toplam, setToplam] = useState(0)
  const [tumCariler, setTumCariler] = useState(false)
  const [araniyor, setAraniyor] = useState(false)
  // Cari bağı olmayan eski kayıt düzenlenirken doğrudan serbest metin açılır
  const [serbest, setSerbest] = useState(() => !!mevcut && !mevcut.tedarikciMusteriId)
  const [dosya, setDosya] = useState(null)
  const [mesgul, setMesgul] = useState(false)
  // Kayıtlı faturayı açarken oran tutarlardan geri okunur; standart bir orana
  // oturmuyorsa "elle" — yanlış oran göstermek, kullanıcı bir alana dokunduğu
  // anda doğru tutarları bozardı.
  const [kdvOran, setKdvOran] = useState(() =>
    mevcut ? oraniTahminEt(mevcut.araToplam, mevcut.kdvToplam) : 20)

  const alan = (k, v) => setForm(f => ({ ...f, [k]: v }))

  /** Bir tutar alanına yazıldı — kural `lib/tutarUclusu` içinde, saf ve testli */
  const tutarYaz = (hangi, deger) => {
    const s = tutarAlaniYazildi({
      hangi, deger,
      araToplam: form.araToplam, kdvToplam: form.kdvToplam, oran: kdvOran,
    })
    setForm(f => ({ ...f, araToplam: s.araToplam, kdvToplam: s.kdvToplam, genelToplam: s.genelToplam }))
    if (s.oran !== kdvOran) setKdvOran(s.oran)
  }

  const oranDegistir = (yeni) => {
    const oran = yeni === ORAN_ELLE ? ORAN_ELLE : Number(yeni)
    setKdvOran(oran)
    const s = oranDegistirildi({ yeniOran: oran, araToplam: form.araToplam, genelToplam: form.genelToplam })
    if (s) setForm(f => ({ ...f, ...s }))
  }

  // Üç rakam birbirini tutuyor mu? (kalem yuvarlamasından 1-2 kuruş normal)
  const tutarUyari = (() => {
    const dolu = sayiCoz(form.araToplam) > 0 || sayiCoz(form.kdvToplam) > 0
    if (!dolu || !(sayiCoz(form.genelToplam) > 0)) return null
    if (ucluTutarli(form.araToplam, form.kdvToplam, form.genelToplam)) return null
    const sapma = ucluSapmasi(form.araToplam, form.kdvToplam, form.genelToplam)
    return `Mal/hizmet + KDV = ${fmtPara(sayiCoz(form.araToplam) + sayiCoz(form.kdvToplam), form.paraBirimi)}, `
      + `ödenecek tutar ${fmtPara(form.genelToplam, form.paraBirimi)} — ${fmtPara(Math.abs(sapma), form.paraBirimi)} fark var.`
  })()

  // Tedarikçi arama — yazarken gecikmeli sorgu
  useEffect(() => {
    if (serbest) return
    let iptal = false
    setAraniyor(true)
    const t = setTimeout(async () => {
      const { liste, toplam: adet } = await tedarikciAra(arama, { tumCariler })
      if (!iptal) { setSonuclar(liste); setToplam(adet); setAraniyor(false) }
    }, 280)
    return () => { iptal = true; clearTimeout(t) }
  }, [arama, serbest, tumCariler])

  const kaydet = async () => {
    // Düzenlemede dosya zorunlu değil — sadece künye düzeltiliyor olabilir
    if (!duzenleme && !dosya) { toast.error('Fatura dosyasını seçin.'); return }
    setMesgul(true)
    const sonuc = duzenleme
      ? await alisFaturaDuzenle({ kayit: mevcut, tedarikci, form, file: dosya })
      : await alisFaturaEkle({ siparis, tedarikci, form, file: dosya, kullanici })
    setMesgul(false)
    if (sonuc?._hata) { toast.error(sonuc._hata); return }
    toast.success(duzenleme ? 'Tedarikçi faturası güncellendi.' : 'Tedarikçi faturası yüklendi.')
    onKaydedildi()
  }

  return (
    <Modal open onClose={onKapat} width={620}
      title={`${duzenleme ? 'Tedarikçi Faturasını Düzenle' : 'Tedarikçi Faturası'} — ${siparis?.siparisNo || ''}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Tedarikçi seçimi */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Label style={{ margin: 0 }}>Tedarikçi *</Label>
            <Button variant="ghost" size="sm" onClick={() => { setSerbest(s => !s); setTedarikci(null) }}>
              {serbest ? 'Cari listesinden seç' : 'Listede yok, elle yaz'}
            </Button>
          </div>

          {serbest ? (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginTop: 4 }}>
              <Input placeholder="Tedarikçi ünvanı" value={form.tedarikciAd}
                onChange={e => alan('tedarikciAd', e.target.value)} />
              <Input placeholder="Vergi no" value={form.vergiNo}
                onChange={e => alan('vergiNo', e.target.value)} />
            </div>
          ) : tedarikci ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4,
              border: '1px solid var(--brand-primary)', borderRadius: 'var(--radius-md)',
              padding: '8px 10px', background: 'var(--brand-primary-soft)',
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{tedarikci.firma}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                  {tedarikci.kod}{tedarikci.vergiNo ? ` · VKN ${tedarikci.vergiNo}` : ''}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setTedarikci(null)}>Değiştir</Button>
            </div>
          ) : (
            <>
              <div style={{ position: 'relative', marginTop: 4 }}>
                <Search size={14} strokeWidth={1.5}
                  style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                <Input autoFocus value={arama} onChange={e => setArama(e.target.value)}
                  placeholder="Tedarikçi ara — ünvan, cari kod veya vergi no" style={{ paddingLeft: 30 }} />
              </div>
              <div style={{
                maxHeight: 170, overflowY: 'auto', marginTop: 6,
                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
              }}>
                {araniyor ? (
                  <div style={{ padding: 10, fontSize: 12, color: 'var(--text-tertiary)' }}>Aranıyor…</div>
                ) : sonuclar.length === 0 ? (
                  <div style={{ padding: 10, fontSize: 12, color: 'var(--text-tertiary)' }}>
                    Eşleşen cari bulunamadı — “Tüm carilerde ara”yı deneyin ya da
                    “Listede yok, elle yaz” ile devam edin.
                  </div>
                ) : sonuclar.map(m => (
                  <button key={m.id} onClick={() => setTedarikci(m)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                      padding: '7px 10px', border: 'none', borderBottom: '1px solid var(--border-subtle)',
                      background: 'transparent',
                    }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)' }}>{m.firma}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {m.kod}{m.vergiNo ? ` · VKN ${m.vergiNo}` : ''}
                    </div>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {toplam > sonuclar.length
                    ? `${sonuclar.length} / ${toplam} kayıt — daraltmak için yazın`
                    : `${sonuclar.length} kayıt`}
                  {!tumCariler && ' · tedarikçi carileri (320 / 336)'}
                </span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={tumCariler} onChange={e => setTumCariler(e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: 'var(--brand-primary)' }} />
                  Tüm carilerde ara
                </label>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <Label>Fatura no *</Label>
            <Input value={form.faturaNo} onChange={e => alan('faturaNo', e.target.value)} placeholder="ANL2026000008092" />
          </div>
          <div>
            <Label>Fatura tarihi</Label>
            <Input type="date" value={form.faturaTarihi} onChange={e => alan('faturaTarihi', e.target.value)} />
          </div>
          <div>
            <Label>Para birimi</Label>
            <select value={form.paraBirimi} onChange={e => alan('paraBirimi', e.target.value)}
              style={{
                width: '100%', height: 38, borderRadius: 'var(--radius-md)', padding: '0 8px',
                border: '1px solid var(--border-default)', background: 'var(--surface-card)',
                color: 'var(--text-primary)', font: '400 13px/1 var(--font-sans)',
              }}>
              <option value="TL">TL</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>

        {/* ---- Tutarlar: hangi rakamı biliyorsan onu yaz, diğerleri hesaplansın ----
            Belgeye göre bazen matrah, bazen yalnız ödenecek tutar öne çıkar.
            Üçünü de elle doldurmak yavaştı ve aritmetik hatası fark edilmiyordu. */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <Label style={{ margin: 0 }}>Tutarlar</Label>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>KDV oranı</span>
              <select value={String(kdvOran)} onChange={e => oranDegistir(e.target.value)}
                style={{
                  height: 30, borderRadius: 'var(--radius-md)', padding: '0 8px',
                  border: '1px solid var(--border-default)', background: 'var(--surface-card)',
                  color: 'var(--text-primary)', font: '400 12.5px/1 var(--font-sans)',
                }}>
                {KDV_ORANLARI.map(o => <option key={o} value={String(o)}>%{o}</option>)}
                <option value={ORAN_ELLE}>Karışık / elle</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <Label>Mal/hizmet toplamı</Label>
              <Input inputMode="decimal" value={form.araToplam}
                onChange={e => tutarYaz('ara', e.target.value)} placeholder="1.429,50" />
            </div>
            <div>
              <Label>KDV</Label>
              <Input inputMode="decimal" value={form.kdvToplam}
                onChange={e => tutarYaz('kdv', e.target.value)} placeholder="285,90" />
            </div>
            <div>
              <Label>Ödenecek tutar *</Label>
              <Input inputMode="decimal" value={form.genelToplam}
                onChange={e => tutarYaz('genel', e.target.value)} placeholder="1.715,40" />
            </div>
          </div>

          {/* Yazılan üç rakam birbirini tutmalı — kimse fark etmiyordu */}
          {tutarUyari && (
            <div style={{
              marginTop: 6, padding: '6px 10px', borderRadius: 'var(--radius-md)',
              background: 'var(--warning-soft)', border: '1px solid var(--warning)',
              color: 'var(--warning)', font: '400 11.5px/17px var(--font-sans)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
            }}>
              <span>{tutarUyari}</span>
              <Button variant="ghost" size="sm" onClick={() => tutarYaz('ara', form.araToplam)}>
                Orana göre düzelt
              </Button>
            </div>
          )}
          {kdvOran !== ORAN_ELLE && !tutarUyari && (
            <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--text-tertiary)' }}>
              Bir alana yazın, kalan ikisi %{kdvOran} üzerinden hesaplanır. Karışık oranlı
              faturada "Karışık / elle" seçin.
            </div>
          )}
        </div>

        <div>
          <Label>Açıklama</Label>
          <Textarea rows={2} value={form.aciklama} onChange={e => alan('aciklama', e.target.value)}
            placeholder="Kısmi sevkiyat, iade, vade notu…" />
        </div>

        <div>
          <Label>Fatura dosyası {duzenleme ? '(değiştirmek isterseniz)' : '* (PDF veya görsel)'}</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm" iconLeft={<Plus size={13} strokeWidth={1.5} />}
              onClick={() => dosyaRef.current?.click()}>
              {dosya ? 'Dosyayı Değiştir' : duzenleme ? 'Yeni Dosya Yükle' : 'Dosya Seç'}
            </Button>
            <span style={{ fontSize: 12, color: dosya ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
              {dosya ? dosya.name
                : duzenleme ? `Mevcut: ${mevcut.dosyaAd || 'yüklü belge'} (korunacak)`
                : 'Henüz seçilmedi'}
            </span>
          </div>
          {duzenleme && dosya && (
            <div style={{ fontSize: 11.5, color: 'var(--warning)', marginTop: 4 }}>
              Kaydedince eski belge silinip yerine bu dosya geçecek.
            </div>
          )}
          <input ref={dosyaRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
            onChange={e => { setDosya(e.target.files?.[0] || null); e.target.value = '' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
          <Button variant="ghost" onClick={onKapat} disabled={mesgul}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={mesgul}>
            {mesgul ? 'Yükleniyor…' : 'Kaydet'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
