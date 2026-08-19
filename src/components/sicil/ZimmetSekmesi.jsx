// Sicil → Zimmet & Demirbaş sekmesi (mig 312).
//
// ⚠️ Bu sekme bir kez KALDIRILMIŞTI: demirbas_zimmet RLS'i `demirbas_yetkili()`
// fonksiyonuna bakıyor, o fonksiyon da yalnız admin + demirbas_yetkilisi
// bayrağını kapsadığı için Abdullah (İK) 162 kaydın SIFIRINI görüyordu.
// mig 312 fonksiyona ik_yonetim modülünü ekledi; ölçüm: Abdullah 0 → 162.
//
// Tutanak ayrı tablo DEĞİL — aynı teslimdeki kalemler aynı tutanak_no'yu
// paylaşır. Numarayı DB üretir (istemci sayacı yarış yaratır,
// bkz. reference_belge_no_trigger). Bu tasarım sayesinde TOPLU tutanak
// kendiliğinden çalışır: kaç kalem seçilirse seçilsin tek belge olur.
//
// TUTANAĞA BAĞLI KALEM KURALI (hem UI'da hem servis katmanında):
//   • silinemez            → basılı belgenin dayanağı ortadan kalkmasın
//   • kategori/marka/model/seri no → değiştirilemez
//   • açıklama, teslim notu → değiştirilebilir
//   • iade her zaman açık   → kayıt tarihsel iz olarak kalır

import { useState, useMemo, useRef } from 'react'
import {
  Plus, Printer, FileText, PackageCheck, Pencil, Trash2, Undo2,
  Upload, CheckCircle2, ExternalLink, RotateCcw,
} from 'lucide-react'
import { Button, Badge, Input, Select, Table, THead, TBody, TR, TH, TD } from '../ui'
import {
  teknisyenDemirbaslari, demirbasEkle, demirbasGuncelle,
  demirbasSil, demirbasIade, tutanakOlustur,
  imzaliTutanakYukle, imzaliTutanakUrl, imzaliTutanakKaldir,
} from '../../services/zimmetService'
import { useSekmeVeri } from './useSekmeVeri'
import { SekmeYukleniyor, SekmeHata, SekmeBos, OzetKutular } from './ortak'
import { tarihBicim } from './bicim'
import { useToast } from '../../context/ToastContext'
import { yeniSekmedeAc, acmaHatasi } from '../../lib/dosyaAc'

const KATEGORILER = [
  { id: 'bilgisayar', ad: 'Bilgisayar' },
  { id: 'laptop', ad: 'Dizüstü' },
  { id: 'telefon', ad: 'Telefon' },
  { id: 'alet', ad: 'Alet / Ekipman' },
  { id: 'canta', ad: 'Çanta' },
  { id: 'diger', ad: 'Diğer' },
]
const kategoriAd = (id) => KATEGORILER.find(k => k.id === id)?.ad || id || '—'

// Cihazlarda seri no ZORUNLU: tutanağın hukuki dayanağı "hangi cihaz" sorusuna
// verilen cevaptır, marka/model tek başına o cevabı vermez.
const SERI_ZORUNLU = ['bilgisayar', 'laptop', 'telefon']

const BOS_FORM = { kategori: 'bilgisayar', marka: '', model: '', seriNo: '', aciklama: '', teslimNotu: '' }
const etiket = { font: '500 11px/15px var(--font-sans)', color: 'var(--text-secondary)' }
const islemBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 26, height: 26, padding: 0,
  background: 'transparent', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
}

const kalemAdi = (d) =>
  [d.marka, d.model].filter(Boolean).join(' ') || d.aciklama || d.demirbas_no || 'Kayıt'

export default function ZimmetSekmesi({ kullaniciId, personelAd }) {
  // useToast() { showToast, toast } döner — destructure ŞART, yoksa
  // toast.success sessizce undefined kalır (MaasBordroSekmesi bu tuzağa düşmüş).
  const { toast } = useToast()
  const { veri, yukleniyor, hata, yenile } = useSekmeVeri(
    () => teknisyenDemirbaslari(kullaniciId),
    [kullaniciId],
  )

  const [formAcik, setFormAcik] = useState(false)
  const [duzenlenen, setDuzenlenen] = useState(null) // { id, tutanakNo } | null
  const [form, setForm] = useState(BOS_FORM)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [secili, setSecili] = useState([])
  const [tutanakYapiliyor, setTutanakYapiliyor] = useState(false)
  const [islemdeki, setIslemdeki] = useState(null)
  const [yuklenen, setYuklenen] = useState(null)       // yükleme sürerken tutanak no
  const dosyaRef = useRef(null)
  const hedefTutanakRef = useRef(null)                 // dosya seçicinin hangi tutanak için açıldığı

  // Tutanak listesi — kalemler tutanak_no'ya göre gruplanır. Ayrı tablo yok
  // (mig 312 tasarımı), grup burada kuruluyor. İmzalı belge alanları tutanağın
  // TÜM satırlarında aynı; ilk satırdan okumak yeterli.
  // ⚠️ Hook erken return'lerin ÜSTÜNDE: `liste` aşağıda tanımlı olduğu için
  // bilerek `veri` üzerinden hesaplanıyor.
  const tutanaklar = useMemo(() => {
    const harita = new Map()
    for (const d of veri || []) {
      if (!d.tutanak_no) continue
      const g = harita.get(d.tutanak_no)
      if (g) { g.kalemler.push(d); continue }
      harita.set(d.tutanak_no, {
        no: d.tutanak_no,
        tarih: d.verildi_tarih,
        imzaliYol: d.imzali_tutanak_yolu || null,
        imzaliTarih: d.imzali_yukleme_tarih || null,
        kalemler: [d],
      })
    }
    return Array.from(harita.values()).sort((a, b) => b.no.localeCompare(a.no, 'tr'))
  }, [veri])

  if (yukleniyor) return <SekmeYukleniyor metin="Demirbaş kayıtları yükleniyor…" />
  if (hata) return <SekmeHata hata={hata} tekrar={yenile} />

  const liste = veri || []
  const cihazlar = liste.filter(d => SERI_ZORUNLU.includes(d.kategori))
  const tutanaksiz = liste.filter(d => !d.tutanak_no)
  const imzaBekleyen = tutanaklar.filter(t => !t.imzaliYol)
  const kilitli = !!duzenlenen?.tutanakNo
  const hepsiSecili = tutanaksiz.length > 0 && secili.length === tutanaksiz.length

  const alan = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const secimDegis = (id) => setSecili(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))
  // Tümünü seç yalnız TUTANAKSIZ kalemleri kapsar — tutanaklı olan zaten
  // yeni bir belgeye eklenemez.
  const tumunuSec = () => setSecili(hepsiSecili ? [] : tutanaksiz.map(d => d.id))

  const formuKapat = () => { setForm(BOS_FORM); setFormAcik(false); setDuzenlenen(null) }

  const duzenlemeyeAl = (d) => {
    setDuzenlenen({ id: d.id, tutanakNo: d.tutanak_no })
    setForm({
      kategori: d.kategori || 'diger',
      marka: d.marka || '',
      model: d.model || '',
      seriNo: d.seri_no || '',
      aciklama: d.aciklama || '',
      teslimNotu: d.teslim_notu || '',
    })
    setFormAcik(true)
  }

  const kaydet = async () => {
    // Kimlik alanları kilitliyken bu doğrulamalar anlamsız — kullanıcı zaten
    // o alanlara dokunamıyor.
    if (!kilitli) {
      if (!form.marka.trim() && !form.aciklama.trim()) {
        toast.warning('Marka ya da açıklama girin.')
        return
      }
      if (SERI_ZORUNLU.includes(form.kategori) && !form.seriNo.trim()) {
        toast.warning('Bu kategoride seri numarası zorunlu — tutanağın dayanağı odur.')
        return
      }
    }
    setKaydediliyor(true)
    try {
      if (duzenlenen) {
        await demirbasGuncelle(duzenlenen.id, form)
        toast.success(kilitli ? 'Not alanları güncellendi.' : 'Demirbaş güncellendi.')
      } else {
        await demirbasEkle({ kullaniciId, ...form })
        toast.success('Demirbaş eklendi.')
      }
      formuKapat()
      await yenile()
    } catch (e) {
      toast.error(e.message || 'Kayıt başarısız.')
    } finally {
      setKaydediliyor(false)
    }
  }

  const sil = async (d) => {
    if (!window.confirm(`"${kalemAdi(d)}" kaydı tamamen silinecek. Emin misiniz?`)) return
    setIslemdeki(d.id)
    try {
      await demirbasSil(d.id)
      toast.success('Demirbaş silindi.')
      setSecili(s => s.filter(x => x !== d.id))
      await yenile()
    } catch (e) {
      toast.error(e.message || 'Silinemedi.')
    } finally {
      setIslemdeki(null)
    }
  }

  const iade = async (d) => {
    if (!window.confirm(`"${kalemAdi(d)}" iade alınacak. Kayıt geçmişte kalır. Onaylıyor musunuz?`)) return
    setIslemdeki(d.id)
    try {
      await demirbasIade(d.id)
      toast.success('İade alındı.')
      setSecili(s => s.filter(x => x !== d.id))
      await yenile()
    } catch (e) {
      toast.error(e.message || 'İade alınamadı.')
    } finally {
      setIslemdeki(null)
    }
  }

  const tutanakYap = async () => {
    if (!secili.length) return
    setTutanakYapiliyor(true)
    try {
      // ⚠️ Pencere tutanak numarasından ÖNCE açılır. Eskiden `await
      // tutanakOlustur()` + `await yenile()` sonrasında window.open
      // çağrılıyordu; o noktada kullanıcı etkileşimi bittiği için popup
      // engelleniyor, sekme açılmıyor ama "Tutanak oluşturuldu" mesajı
      // çıkıyordu — belge oluşur, kullanıcı göremezdi (bkz. src/lib/dosyaAc.js).
      let olusanNo = null
      const sonuc = await yeniSekmedeAc(async () => {
        olusanNo = await tutanakOlustur(secili)
        return '/demirbas-tutanak/' + olusanNo
      })

      if (!olusanNo) {
        // tutanakOlustur patladı — sebebini yeniSekmedeAc taşıdı.
        throw sonuc.hata || new Error('Tutanak oluşturulamadı.')
      }

      toast.success(`Tutanak oluşturuldu: ${olusanNo} (${secili.length} kalem)`)
      setSecili([])
      await yenile()
      // Belge oluştu ama sekme açılamadıysa kullanıcı bunu bilmeli.
      if (!sonuc.ok) toast.warning(acmaHatasi(sonuc, 'Tutanak açılamadı, listeden açabilirsiniz.'))
    } catch (e) {
      toast.error(e.message || 'Tutanak oluşturulamadı.')
    } finally {
      setTutanakYapiliyor(false)
    }
  }

  // ── İmzalı tutanak arşivi (mig 313) ──────────────────────────────────
  // Tek gizli <input> tüm satırlara hizmet eder; hangi tutanak için açıldığı
  // ref'te tutulur (her satıra ayrı input koymak DOM'u şişirir).
  const belgeIste = (tutanakNo) => {
    hedefTutanakRef.current = tutanakNo
    dosyaRef.current?.click()
  }

  const dosyaSecildi = async (e) => {
    const dosya = e.target.files?.[0]
    const tutanakNo = hedefTutanakRef.current
    e.target.value = ''            // aynı dosya tekrar seçilebilsin
    if (!dosya || !tutanakNo) return
    setYuklenen(tutanakNo)
    try {
      const { adet } = await imzaliTutanakYukle(tutanakNo, dosya)
      toast.success(`İmzalı tutanak yüklendi (${adet} kalem).`)
      yenile()
    } catch (err) {
      toast.error(err.message || 'Belge yüklenemedi.')
    } finally {
      setYuklenen(null)
      hedefTutanakRef.current = null
    }
  }

  // Bucket private — her açılışta 1 saatlik imzalı link üretilir.
  // Pencere URL'den ÖNCE açılır: await sonrası window.open popup engeline
  // takılıp sessizce null dönüyor (bkz. src/lib/dosyaAc.js).
  const belgeAc = async (yol) => {
    const sonuc = await yeniSekmedeAc(() => imzaliTutanakUrl(yol))
    if (!sonuc.ok) toast.error(acmaHatasi(sonuc, 'Belge açılamadı. Yetkiniz olmayabilir.'))
  }

  const belgeKaldir = async (tutanakNo) => {
    setYuklenen(tutanakNo)
    try {
      await imzaliTutanakKaldir(tutanakNo)
      toast.success('Belge bağlantısı kaldırıldı, tutanak yeniden imza bekliyor.')
      yenile()
    } catch (err) {
      toast.error(err.message || 'Bağlantı kaldırılamadı.')
    } finally {
      setYuklenen(null)
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <OzetKutular
        kutular={[
          { label: 'ÜZERİNDEKİ DEMİRBAŞ', value: String(liste.length), ipucu: 'İade edilmemiş' },
          { label: 'CİHAZ (SERİ NOLU)', value: String(cihazlar.length), ipucu: 'Bilgisayar / dizüstü / telefon' },
          {
            label: 'TUTANAKSIZ',
            value: String(tutanaksiz.length),
            color: tutanaksiz.length > 0 ? 'var(--warning)' : 'var(--success)',
            ipucu: tutanaksiz.length > 0 ? 'Belgesi yok' : 'Hepsi belgeli',
          },
          {
            label: 'İMZA BEKLEYEN',
            value: String(imzaBekleyen.length),
            color: imzaBekleyen.length > 0 ? 'var(--warning)' : 'var(--success)',
            ipucu: imzaBekleyen.length > 0
              ? 'Islak imzalı tarama yüklenmemiş'
              : (tutanaklar.length ? 'Tüm tutanaklar arşivde' : 'Tutanak yok'),
          },
        ]}
        sutun={4}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '16px 0 12px' }}>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Plus size={14} strokeWidth={1.8} />}
          onClick={() => {
            if (formAcik && !duzenlenen) { formuKapat(); return }
            setDuzenlenen(null); setForm(BOS_FORM); setFormAcik(true)
          }}
        >
          Demirbaş Ekle
        </Button>
        <Button
          variant={secili.length ? 'secondary' : 'tertiary'}
          size="sm"
          disabled={!secili.length || tutanakYapiliyor}
          iconLeft={<FileText size={14} strokeWidth={1.8} />}
          onClick={tutanakYap}
        >
          {tutanakYapiliyor
            ? 'Oluşturuluyor…'
            : 'Teslim Tutanağı Oluştur' + (secili.length ? ' (' + secili.length + ' kalem)' : '')}
        </Button>
        {tutanaksiz.length > 1 && (
          <Button variant="tertiary" size="sm" onClick={tumunuSec}>
            {hepsiSecili ? 'Seçimi temizle' : `Tutanaksızların tümünü seç (${tutanaksiz.length})`}
          </Button>
        )}
      </div>

      {formAcik && (
        <div style={{
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          padding: 14,
          marginBottom: 14,
          background: 'var(--surface-sunken)',
        }}>
          <div style={{ font: '600 12px/16px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 10 }}>
            {duzenlenen ? 'Demirbaşı Düzenle' : 'Yeni Demirbaş'}
          </div>

          {kilitli && (
            <div style={{
              font: '400 11.5px/16px var(--font-sans)', color: 'var(--text-secondary)',
              background: 'var(--surface-card)', border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)', padding: '7px 9px', marginBottom: 10,
            }}>
              Bu kalem <b>{duzenlenen.tutanakNo}</b> tutanağına bağlı. Tutanak imzalanan bir belge
              olduğu için kategori, marka, model ve seri no değiştirilemez — yalnız açıklama ve
              teslim notu güncellenebilir.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={etiket}>Kategori</span>
              <Select value={form.kategori} onChange={e => alan('kategori', e.target.value)} disabled={kilitli}>
                {KATEGORILER.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
              </Select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={etiket}>Marka</span>
              <Input value={form.marka} onChange={e => alan('marka', e.target.value)} placeholder="Örn. Lenovo" disabled={kilitli} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={etiket}>Model</span>
              <Input value={form.model} onChange={e => alan('model', e.target.value)} placeholder="Örn. ThinkPad E14" disabled={kilitli} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={etiket}>
                Seri No{SERI_ZORUNLU.includes(form.kategori) ? ' *' : ''}
              </span>
              <Input value={form.seriNo} onChange={e => alan('seriNo', e.target.value)} placeholder="Cihaz seri numarası" disabled={kilitli} />
            </label>
            <label style={{ display: 'grid', gap: 4, gridColumn: '1 / -1' }}>
              <span style={etiket}>Açıklama</span>
              <Input value={form.aciklama} onChange={e => alan('aciklama', e.target.value)} placeholder="Örn. Ofis bilgisayarı" />
            </label>
            <label style={{ display: 'grid', gap: 4, gridColumn: '1 / -1' }}>
              <span style={etiket}>Teslim notu</span>
              <Input
                value={form.teslimNotu}
                onChange={e => alan('teslimNotu', e.target.value)}
                placeholder="Örn. çantası ve şarj adaptörü ile birlikte"
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button variant="primary" size="sm" onClick={kaydet} disabled={kaydediliyor}>
              {kaydediliyor ? 'Kaydediliyor…' : duzenlenen ? 'Güncelle' : 'Kaydet'}
            </Button>
            <Button variant="tertiary" size="sm" onClick={formuKapat}>Vazgeç</Button>
          </div>
        </div>
      )}

      {liste.length === 0 ? (
        <SekmeBos>
          <PackageCheck size={26} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
          <div style={{ marginTop: 8 }}>{personelAd || 'Bu personel'} üzerinde kayıtlı demirbaş yok.</div>
        </SekmeBos>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH style={{ width: 34 }}>
                <input
                  type="checkbox"
                  checked={hepsiSecili}
                  onChange={tumunuSec}
                  disabled={tutanaksiz.length === 0}
                  title={tutanaksiz.length === 0 ? 'Tutanaksız kalem yok' : 'Tutanaksızların tümünü seç'}
                  style={{ cursor: tutanaksiz.length === 0 ? 'not-allowed' : 'pointer' }}
                />
              </TH>
              <TH>DEMİRBAŞ NO</TH>
              <TH>KATEGORİ</TH>
              <TH>MARKA / MODEL</TH>
              <TH>SERİ NO</TH>
              <TH>VERİLİŞ</TH>
              <TH>TUTANAK</TH>
              <TH style={{ width: 108 }}>İŞLEM</TH>
            </TR>
          </THead>
          <TBody>
            {liste.map(d => {
              const mesgul = islemdeki === d.id
              return (
                <TR key={d.id}>
                  <TD>
                    <input
                      type="checkbox"
                      checked={secili.includes(d.id)}
                      onChange={() => secimDegis(d.id)}
                      disabled={!!d.tutanak_no}
                      title={d.tutanak_no ? 'Zaten tutanağa bağlı' : 'Tutanağa ekle'}
                      style={{ cursor: d.tutanak_no ? 'not-allowed' : 'pointer' }}
                    />
                  </TD>
                  <TD>{d.demirbas_no || '—'}</TD>
                  <TD>{kategoriAd(d.kategori)}</TD>
                  <TD>
                    {[d.marka, d.model].filter(Boolean).join(' ') || d.aciklama || '—'}
                    {d.marka && d.aciklama && (
                      <div style={{ font: '400 11px/15px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                        {d.aciklama}
                      </div>
                    )}
                  </TD>
                  <TD>{d.seri_no || '—'}</TD>
                  <TD>{tarihBicim(d.verildi_tarih)}</TD>
                  <TD>
                    {d.tutanak_no ? (
                      <a
                        href={'/demirbas-tutanak/' + d.tutanak_no}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          color: 'var(--accent-primary)', textDecoration: 'none',
                        }}
                      >
                        <Printer size={13} strokeWidth={1.7} />
                        {d.tutanak_no}
                      </a>
                    ) : (
                      <Badge tone="uyari">Tutanaksız</Badge>
                    )}
                    {/* display:flex — inline-flex ALT SATIRA İNMİYOR, tutanak
                        numarasına yapışıyordu (19.08 ekran görüntüsü). */}
                    {d.tutanak_no && (
                      <div style={{
                        marginTop: 3, font: '400 11px/15px var(--font-sans)',
                        display: 'flex', alignItems: 'center', gap: 3,
                        color: d.imzali_tutanak_yolu ? 'var(--success)' : 'var(--warning)',
                      }}>
                        {d.imzali_tutanak_yolu && <CheckCircle2 size={11} strokeWidth={2} style={{ flexShrink: 0 }} />}
                        {d.imzali_tutanak_yolu ? 'İmzalısı arşivde' : 'İmza bekliyor'}
                      </div>
                    )}
                  </TD>
                  <TD>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button" onClick={() => duzenlemeyeAl(d)} disabled={mesgul}
                        title="Düzenle" style={islemBtn}
                      >
                        <Pencil size={14} strokeWidth={1.7} />
                      </button>
                      <button
                        type="button" onClick={() => iade(d)} disabled={mesgul}
                        title="İade al — kayıt geçmişte kalır" style={islemBtn}
                      >
                        <Undo2 size={14} strokeWidth={1.7} />
                      </button>
                      <button
                        type="button" onClick={() => sil(d)} disabled={mesgul || !!d.tutanak_no}
                        title={d.tutanak_no ? `${d.tutanak_no} tutanağına bağlı — silinemez` : 'Kaydı sil'}
                        style={{
                          ...islemBtn,
                          color: d.tutanak_no ? 'var(--text-tertiary)' : 'var(--danger)',
                          cursor: d.tutanak_no ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <Trash2 size={14} strokeWidth={1.7} />
                      </button>
                    </div>
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      )}

      {/* ── Teslim tutanakları — ıslak imzalı arşiv (mig 313) ─────────────
          Kalem tablosu "personelde ne var" sorusuna, bu tablo "belgesi nerede"
          sorusuna cevap verir. Belge tutanak bazlı olduğu için kalem satırına
          değil buraya konuldu: 5 kalemlik tutanakta 5 ayrı yükle butonu
          göstermek aynı taramayı 5 kez istemek olurdu. */}
      {tutanaklar.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <div style={{
            font: '600 12px/16px var(--font-sans)',
            color: 'var(--text-primary)',
            display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4,
          }}>
            <FileText size={14} strokeWidth={1.8} style={{ color: 'var(--text-secondary)' }} />
            TESLİM TUTANAKLARI
          </div>
          <div style={{
            font: '400 11px/16px var(--font-sans)',
            color: 'var(--text-tertiary)', marginBottom: 10,
          }}>
            Tutanağı yazdırıp teslim eden ve teslim alan imzaladıktan sonra taramasını buraya
            yükleyin. Belge kişiye özeldir, yalnız yetkili personel görebilir. PDF, JPG veya PNG · en çok 15 MB.
          </div>

          <Table>
            <THead>
              <TR>
                <TH>TUTANAK NO</TH>
                <TH>TARİH</TH>
                <TH>KALEM</TH>
                <TH>İMZALI BELGE</TH>
                <TH style={{ width: 210 }}>İŞLEM</TH>
              </TR>
            </THead>
            <TBody>
              {tutanaklar.map(t => {
                const mesgul = yuklenen === t.no
                return (
                  <TR key={t.no}>
                    <TD>
                      <a
                        href={'/demirbas-tutanak/' + t.no}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          color: 'var(--accent-primary)', textDecoration: 'none',
                        }}
                      >
                        <Printer size={13} strokeWidth={1.7} />
                        {t.no}
                      </a>
                    </TD>
                    <TD>{tarihBicim(t.tarih)}</TD>
                    <TD>
                      {t.kalemler.length} kalem
                      <div style={{ font: '400 11px/15px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                        {t.kalemler.map(kalemAdi).join(', ')}
                      </div>
                    </TD>
                    <TD>
                      {t.imzaliYol ? (
                        <div>
                          <Badge tone="basarili" icon={<CheckCircle2 size={11} strokeWidth={2} />}>
                            İmzalı
                          </Badge>
                          {t.imzaliTarih && (
                            <div style={{ font: '400 11px/15px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 3 }}>
                              {tarihBicim(t.imzaliTarih)} tarihinde yüklendi
                            </div>
                          )}
                        </div>
                      ) : (
                        <Badge tone="uyari">İmza bekliyor</Badge>
                      )}
                    </TD>
                    <TD>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {t.imzaliYol ? (
                          <>
                            <Button
                              variant="secondary" size="sm" disabled={mesgul}
                              iconLeft={<ExternalLink size={13} strokeWidth={1.7} />}
                              onClick={() => belgeAc(t.imzaliYol)}
                            >
                              Görüntüle
                            </Button>
                            <button
                              type="button" onClick={() => belgeIste(t.no)} disabled={mesgul}
                              title="Yerine yeni tarama yükle — eskisi arşivde kalır"
                              style={islemBtn}
                            >
                              <Upload size={14} strokeWidth={1.7} />
                            </button>
                            <button
                              type="button" onClick={() => belgeKaldir(t.no)} disabled={mesgul}
                              title="Belge bağlantısını kaldır — tutanak yeniden imza bekler"
                              style={islemBtn}
                            >
                              <RotateCcw size={14} strokeWidth={1.7} />
                            </button>
                          </>
                        ) : (
                          <Button
                            variant="primary" size="sm" disabled={mesgul}
                            iconLeft={<Upload size={13} strokeWidth={1.7} />}
                            onClick={() => belgeIste(t.no)}
                          >
                            {mesgul ? 'Yükleniyor…' : 'İmzalı PDF Yükle'}
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </div>
      )}

      {/* Tek gizli seçici tüm satırlara hizmet eder — hedef tutanak ref'te */}
      <input
        ref={dosyaRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        onChange={dosyaSecildi}
        style={{ display: 'none' }}
      />
    </div>
  )
}
