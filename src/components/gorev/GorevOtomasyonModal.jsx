// Görev otomasyon merkezi — 3 sekme: Şablonlar (madde 29), Tekrarlayan (madde 28),
// Vekâlet (madde 39). Gorevler sayfasındaki "Otomasyon" butonundan açılır.
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, FileStack, Repeat, UserCheck, Plus, Trash2, Play } from 'lucide-react'
import {
  gorevSablonlariGetir, gorevSablonSil, gorevEkle,
  gorevTekrarlariGetir, gorevTekrarKaydet, gorevTekrarGuncelle,
  vekaletleriGetir, vekaletKaydet, vekaletKapat,
  kontrolMaddeEkle,
} from '../../services/gorevService'
import { gorevKategorileriGetir } from '../../services/gorevKategoriService'
import { useBildirim } from '../../context/BildirimContext'
import { useToast } from '../../context/ToastContext'
import { ONCELIK_SECENEKLERI, bugunStr } from '../../lib/gorevSabitleri'
import { Button, Input, Label, EmptyState } from '../ui'
import CustomSelect from '../CustomSelect'

const trTarih = (t) => (t ? String(t).slice(0, 10).split('-').reverse().join('.') : '—')
const HAFTA_GUNLERI = [
  { id: 1, isim: 'Pzt' }, { id: 2, isim: 'Sal' }, { id: 3, isim: 'Çar' },
  { id: 4, isim: 'Per' }, { id: 5, isim: 'Cum' }, { id: 6, isim: 'Cmt' }, { id: 7, isim: 'Paz' },
]

export default function GorevOtomasyonModal({ kullanici, kullanicilar, onKapat, onGorevOlustu }) {
  const [sekme, setSekme] = useState('sablon')
  const personeller = (kullanicilar || []).filter(k => k.rol !== 'musteri')

  return createPortal(
    <div onClick={onKapat} style={{
      position: 'fixed', inset: 0, zIndex: 100000, padding: 20,
      background: 'rgba(15, 23, 42, 0.72)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 760, maxHeight: '92vh', overflowY: 'auto',
        background: 'var(--surface-card)', border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ font: '700 16px/22px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>
            Görev Otomasyonu
          </h2>
          <button onClick={onKapat} aria-label="Kapat" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4 }}>
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { id: 'sablon', isim: 'Şablonlar', Icon: FileStack },
            { id: 'tekrar', isim: 'Tekrarlayan Görevler', Icon: Repeat },
            { id: 'vekalet', isim: 'Vekâlet', Icon: UserCheck },
          ].map(s => (
            <button key={s.id} onClick={() => setSekme(s.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              padding: '7px 14px', borderRadius: 'var(--radius-pill)',
              font: '600 12.5px/18px var(--font-sans)',
              background: sekme === s.id ? 'var(--brand-primary)' : 'var(--surface-sunken)',
              color: sekme === s.id ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--border-default)',
            }}>
              <s.Icon size={13} strokeWidth={1.5} /> {s.isim}
            </button>
          ))}
        </div>

        {sekme === 'sablon' && <SablonSekmesi kullanici={kullanici} personeller={personeller} onGorevOlustu={onGorevOlustu} onKapat={onKapat} />}
        {sekme === 'tekrar' && <TekrarSekmesi kullanici={kullanici} personeller={personeller} />}
        {sekme === 'vekalet' && <VekaletSekmesi kullanici={kullanici} personeller={personeller} />}
      </div>
    </div>,
    document.body,
  )
}

// ─── Şablonlar ──────────────────────────────────────────────────────────────
function SablonSekmesi({ kullanici, personeller, onGorevOlustu, onKapat }) {
  const { toast } = useToast()
  const { bildirimEkle } = useBildirim()
  const [sablonlar, setSablonlar] = useState([])
  const [uygula, setUygula] = useState(null) // seçili şablon
  const [atanan, setAtanan] = useState('')
  const [sonTarih, setSonTarih] = useState('')
  const [mesgul, setMesgul] = useState(false)

  useEffect(() => { gorevSablonlariGetir().then(setSablonlar) }, [])

  const sablonuUygula = async () => {
    if (!atanan) { toast.error('Ana sorumluyu seç.'); return }
    if (!sonTarih) { toast.error('Son tarih seç.'); return }
    setMesgul(true)
    try {
      const v = uygula.veri || {}
      const g = v.gorev || {}
      const kisi = personeller.find(k => String(k.id) === String(atanan))
      const ana = await gorevEkle({
        baslik: g.baslik || uygula.ad,
        aciklama: g.aciklama || null,
        durum: 'bekliyor', kabulDurumu: 'atandi',
        oncelik: g.oncelik || 'normal',
        atanan: String(atanan), atananId: Number(atanan), atananAd: kisi?.ad || null,
        sonTarih, bitisTarihi: sonTarih,
        kategoriId: g.kategoriId || null,
        onayGerekli: !!g.onayGerekli,
        beklenenCikti: g.beklenenCikti || null,
        tamamlamaKurali: g.tamamlamaKurali || 'zorunlular',
        etiketler: Array.isArray(g.etiketler) ? g.etiketler : [],
        olusturanAd: kullanici.ad, olusturanId: kullanici.id,
        sablonId: uygula.id,
      })
      if (!ana) throw new Error('Ana görev oluşturulamadı')
      // Alt görevler — ana sorumluya atanır (şablonda kişi belirtilmediyse)
      for (const alt of (v.altGorevler || [])) {
        const altAtananId = Number(alt.atananId) || Number(atanan)
        const altKisi = personeller.find(k => String(k.id) === String(altAtananId))
        await gorevEkle({
          baslik: alt.baslik, aciklama: alt.aciklama || null,
          ustGorevId: ana.id,
          durum: 'bekliyor', kabulDurumu: 'atandi',
          oncelik: alt.oncelik || 'normal',
          atanan: String(altAtananId), atananId: altAtananId, atananAd: altKisi?.ad || null,
          sonTarih, bitisTarihi: sonTarih,
          zorunlu: alt.zorunlu !== false,
          olusturanAd: kullanici.ad, olusturanId: kullanici.id,
          sablonId: uygula.id,
        })
      }
      for (const [i, m] of (v.kontrolListesi || []).entries()) {
        await kontrolMaddeEkle({ gorevId: ana.id, baslik: m.baslik, zorunlu: !!m.zorunlu, sira: i, olusturanId: kullanici.id })
      }
      if (String(atanan) !== String(kullanici.id)) {
        bildirimEkle(atanan, '📋 Yeni görev atandı',
          `"${ana.baslik}" (${ana.gorevNo || ''}) şablondan oluşturuldu — son tarih ${trTarih(sonTarih)}.`,
          'gorev', `/gorevler/${ana.id}`).catch(() => {})
      }
      toast.success(`Şablon uygulandı — ${ana.gorevNo || ''} oluşturuldu.`)
      onGorevOlustu?.(ana)
      onKapat?.()
    } catch (e) {
      toast.error('Uygulanamadı: ' + (e?.message || 'hata'))
    } finally {
      setMesgul(false)
    }
  }

  if (!sablonlar.length) return (
    <EmptyState
      icon={<FileStack size={28} strokeWidth={1.5} />}
      title="Henüz şablon yok"
      description="Alt görevleri ve kontrol listesi olan bir görevi açıp 'Şablon Olarak Kaydet' ile buraya ekleyebilirsin."
    />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sablonlar.map(s => (
        <div key={s.id} style={{
          padding: '10px 12px', borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ font: '600 13.5px/19px var(--font-sans)', color: 'var(--text-primary)' }}>{s.ad}</div>
              <div className="t-caption">
                {(s.veri?.altGorevler || []).length} alt görev · {(s.veri?.kontrolListesi || []).length} kontrol maddesi
                {s.aciklama ? ` — ${s.aciklama}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <Button variant="primary" size="sm" iconLeft={<Play size={12} strokeWidth={1.5} />}
                onClick={() => { setUygula(u => (u?.id === s.id ? null : s)); setAtanan(''); setSonTarih('') }}>
                Uygula
              </Button>
              {(kullanici?.rol === 'admin' || String(s.olusturanId) === String(kullanici?.id)) && (
                <Button variant="secondary" size="sm" iconLeft={<Trash2 size={12} strokeWidth={1.5} />}
                  onClick={async () => {
                    const ok = await gorevSablonSil(s.id)
                    if (ok) setSablonlar(p => p.filter(x => x.id !== s.id))
                  }} />
              )}
            </div>
          </div>
          {uygula?.id === s.id && (
            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ minWidth: 180 }}>
                <Label required>Ana sorumlu</Label>
                <CustomSelect value={atanan} onChange={e => setAtanan(e.target.value)} searchable>
                  <option value="">Seç…</option>
                  {personeller.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
                </CustomSelect>
              </div>
              <div>
                <Label required>Son tarih</Label>
                <Input type="date" value={sonTarih} min={bugunStr()} onChange={e => setSonTarih(e.target.value)} />
              </div>
              <Button variant="primary" onClick={sablonuUygula} disabled={mesgul}>
                {mesgul ? 'Oluşturuluyor…' : 'Görevleri Oluştur'}
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Tekrarlayan görevler ───────────────────────────────────────────────────
function TekrarSekmesi({ kullanici, personeller }) {
  const { toast } = useToast()
  const [tekrarlar, setTekrarlar] = useState([])
  const [kategoriler, setKategoriler] = useState([])
  const [formAcik, setFormAcik] = useState(false)
  const [form, setForm] = useState({
    ad: '', baslik: '', atananId: '', oncelik: 'normal', kategoriId: '',
    siklik: 'haftalik', gunler: [1], sureGun: 1,
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    gorevTekrarlariGetir().then(setTekrarlar)
    gorevKategorileriGetir().then(setKategoriler)
  }, [])

  const kaydet = async () => {
    if (!form.ad.trim()) { toast.error('Plan adı zorunlu.'); return }
    if (!form.atananId) { toast.error('Atanacak kişiyi seç.'); return }
    if ((form.siklik === 'haftalik' || form.siklik === 'aylik') && !form.gunler.length) {
      toast.error('En az bir gün seç.'); return
    }
    const t = await gorevTekrarKaydet({
      ad: form.ad.trim(),
      siklik: form.siklik,
      gunler: form.siklik === 'gunluk' || form.siklik === 'yillik' ? [] : form.gunler.map(Number),
      sablon: {
        gorev: {
          baslik: form.baslik.trim() || form.ad.trim(),
          atananId: Number(form.atananId),
          oncelik: form.oncelik,
          kategoriId: form.kategoriId ? Number(form.kategoriId) : null,
          sureGun: Number(form.sureGun) || 1,
        },
      },
      aktif: true,
      olusturanId: kullanici.id,
    })
    if (!t) { toast.error('Kaydedilemedi.'); return }
    setTekrarlar(p => [...p, t])
    setFormAcik(false)
    setForm({ ad: '', baslik: '', atananId: '', oncelik: 'normal', kategoriId: '', siklik: 'haftalik', gunler: [1], sureGun: 1 })
    toast.success('Tekrarlayan görev planı kuruldu — üretim her sabah 08:30\'da otomatik.')
  }

  const durumDegistir = async (t) => {
    const g = await gorevTekrarGuncelle(t.id, { aktif: !t.aktif })
    if (g) setTekrarlar(p => p.map(x => (x.id === t.id ? g : x)))
  }

  const SIKLIK_ISIM = { gunluk: 'Her gün', haftalik: 'Haftalık', aylik: 'Aylık', yillik: 'Yıllık' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        {!formAcik && (
          <Button variant="secondary" size="sm" iconLeft={<Plus size={13} strokeWidth={1.5} />} onClick={() => setFormAcik(true)}>
            Yeni Plan
          </Button>
        )}
      </div>

      {formAcik && (
        <div style={{
          padding: 12, borderRadius: 'var(--radius-sm)', marginBottom: 12,
          background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label required>Plan adı</Label>
              <Input value={form.ad} onChange={e => set('ad', e.target.value)} placeholder="Örn. Haftalık satış raporu" />
            </div>
            <div>
              <Label>Görev başlığı (boşsa plan adı)</Label>
              <Input value={form.baslik} onChange={e => set('baslik', e.target.value)} placeholder="Örn. Satış raporunu hazırla" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <div>
              <Label required>Atanan</Label>
              <CustomSelect value={form.atananId} onChange={e => set('atananId', e.target.value)} searchable>
                <option value="">Seç…</option>
                {personeller.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
              </CustomSelect>
            </div>
            <div>
              <Label>Öncelik</Label>
              <CustomSelect value={form.oncelik} onChange={e => set('oncelik', e.target.value)}>
                {ONCELIK_SECENEKLERI.map(o => <option key={o.id} value={o.id}>{o.isim}</option>)}
              </CustomSelect>
            </div>
            <div>
              <Label>Kategori</Label>
              <CustomSelect value={form.kategoriId} onChange={e => set('kategoriId', e.target.value)}>
                <option value="">—</option>
                {kategoriler.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
              </CustomSelect>
            </div>
            <div>
              <Label>Teslim süresi (gün)</Label>
              <Input type="number" min="1" value={form.sureGun} onChange={e => set('sureGun', e.target.value)} />
            </div>
          </div>
          <div>
            <Label required>Sıklık</Label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {Object.entries(SIKLIK_ISIM).map(([id, isim]) => (
                <button key={id} onClick={() => set('siklik', id)} style={{
                  padding: '6px 12px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                  font: '600 12px/16px var(--font-sans)',
                  background: form.siklik === id ? 'var(--brand-primary)' : 'var(--surface-card)',
                  color: form.siklik === id ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border-default)',
                }}>{isim}</button>
              ))}
            </div>
          </div>
          {form.siklik === 'haftalik' && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {HAFTA_GUNLERI.map(g => {
                const secili = form.gunler.includes(g.id)
                return (
                  <button key={g.id}
                    onClick={() => set('gunler', secili ? form.gunler.filter(x => x !== g.id) : [...form.gunler, g.id])}
                    style={{
                      width: 42, padding: '6px 0', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      font: '600 12px/16px var(--font-sans)', textAlign: 'center',
                      background: secili ? 'var(--brand-primary)' : 'var(--surface-card)',
                      color: secili ? '#fff' : 'var(--text-secondary)',
                      border: '1px solid var(--border-default)',
                    }}>{g.isim}</button>
                )
              })}
            </div>
          )}
          {form.siklik === 'aylik' && (
            <div>
              <Label>Ayın günleri (virgülle; 32 = ayın son iş günü)</Label>
              <Input
                value={form.gunler.join(',')}
                onChange={e => set('gunler', e.target.value.split(',').map(x => Number(x.trim())).filter(n => n >= 1 && n <= 32))}
                placeholder="Örn. 1,15 veya 32"
              />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" size="sm" onClick={() => setFormAcik(false)}>Vazgeç</Button>
            <Button variant="primary" size="sm" onClick={kaydet}>Planı Kur</Button>
          </div>
        </div>
      )}

      {tekrarlar.length === 0 && !formAcik ? (
        <EmptyState
          icon={<Repeat size={28} strokeWidth={1.5} />}
          title="Tekrarlayan görev planı yok"
          description="Her pazartesi rapor, her ayın 1'i fiyat kontrolü gibi işleri planla — görevler her sabah 08:30'da otomatik açılır."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tekrarlar.map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
              borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)',
              border: '1px solid var(--border-default)', opacity: t.aktif ? 1 : 0.55,
            }}>
              <Repeat size={14} strokeWidth={1.5} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{t.ad}</div>
                <div className="t-caption">
                  {SIKLIK_ISIM[t.siklik] || t.siklik}
                  {t.siklik === 'haftalik' && t.gunler?.length ? ` (${t.gunler.map(g => HAFTA_GUNLERI.find(h => h.id === g)?.isim).filter(Boolean).join(', ')})` : ''}
                  {t.siklik === 'aylik' && t.gunler?.length ? ` (ayın ${t.gunler.map(g => g === 32 ? 'son iş günü' : g).join(', ')}. günü)` : ''}
                  {' · '}Atanan: {personeller.find(k => String(k.id) === String(t.sablon?.gorev?.atananId))?.ad || '—'}
                  {t.sonrakiUretim ? ` · Sonraki: ${trTarih(t.sonrakiUretim)}` : ''}
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => durumDegistir(t)}>
                {t.aktif ? 'Durdur' : 'Başlat'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Vekâlet ────────────────────────────────────────────────────────────────
function VekaletSekmesi({ kullanici, personeller }) {
  const { toast } = useToast()
  const [vekaletler, setVekaletler] = useState([])
  const [form, setForm] = useState({ kullaniciId: '', vekilId: '', baslangic: bugunStr(), bitis: '', aciklama: '' })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const adminMi = kullanici?.rol === 'admin'

  useEffect(() => { vekaletleriGetir().then(setVekaletler) }, [])

  const kaydet = async () => {
    if (!form.kullaniciId || !form.vekilId) { toast.error('İzinli kişiyi ve vekilini seç.'); return }
    if (form.kullaniciId === form.vekilId) { toast.error('Kişi kendine vekil olamaz.'); return }
    const v = await vekaletKaydet({
      kullaniciId: Number(form.kullaniciId), vekilId: Number(form.vekilId),
      baslangic: form.baslangic, bitis: form.bitis || null,
      aciklama: form.aciklama.trim() || null, aktif: true, olusturanId: kullanici.id,
    })
    if (!v) { toast.error('Kaydedilemedi — yalnız kendin için veya admin olarak tanımlayabilirsin.'); return }
    setVekaletler(p => [v, ...p])
    setForm({ kullaniciId: '', vekilId: '', baslangic: bugunStr(), bitis: '', aciklama: '' })
    toast.success('Vekâlet tanımlandı — bu kişiye açılan yeni görevlerde vekili de bilgilendirilecek.')
  }

  const ad = (id) => personeller.find(k => String(k.id) === String(id))?.ad || `#${id}`

  return (
    <div>
      <div style={{
        padding: 12, borderRadius: 'var(--radius-sm)', marginBottom: 12,
        background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end',
      }}>
        <div>
          <Label required>İzinli / ayrılan kişi</Label>
          <CustomSelect value={form.kullaniciId} onChange={e => set('kullaniciId', e.target.value)} searchable>
            <option value="">Seç…</option>
            {(adminMi ? personeller : personeller.filter(k => String(k.id) === String(kullanici?.id))).map(k => (
              <option key={k.id} value={k.id}>{k.ad}</option>
            ))}
          </CustomSelect>
        </div>
        <div>
          <Label required>Vekili</Label>
          <CustomSelect value={form.vekilId} onChange={e => set('vekilId', e.target.value)} searchable>
            <option value="">Seç…</option>
            {personeller.filter(k => String(k.id) !== String(form.kullaniciId)).map(k => (
              <option key={k.id} value={k.id}>{k.ad}</option>
            ))}
          </CustomSelect>
        </div>
        <div>
          <Label>Başlangıç</Label>
          <Input type="date" value={form.baslangic} onChange={e => set('baslangic', e.target.value)} />
        </div>
        <div>
          <Label>Bitiş (boş = süresiz)</Label>
          <Input type="date" value={form.bitis} min={form.baslangic} onChange={e => set('bitis', e.target.value)} />
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'end' }}>
          <div style={{ flex: 1 }}>
            <Label>Açıklama</Label>
            <Input value={form.aciklama} onChange={e => set('aciklama', e.target.value)} placeholder="Örn. yıllık izin" />
          </div>
          <Button variant="primary" onClick={kaydet}>Vekâlet Tanımla</Button>
        </div>
      </div>

      {vekaletler.length === 0 ? (
        <p className="t-caption" style={{ fontStyle: 'italic' }}>Tanımlı vekâlet yok.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {vekaletler.map(v => (
            <div key={v.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
              borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)',
              border: '1px solid var(--border-default)', opacity: v.aktif ? 1 : 0.55,
            }}>
              <UserCheck size={14} strokeWidth={1.5} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                  {ad(v.kullaniciId)} → vekili {ad(v.vekilId)}
                </div>
                <div className="t-caption">
                  {trTarih(v.baslangic)} – {v.bitis ? trTarih(v.bitis) : 'süresiz'}
                  {v.aciklama ? ` · ${v.aciklama}` : ''}{!v.aktif ? ' · kapalı' : ''}
                </div>
              </div>
              {v.aktif && (adminMi || String(v.kullaniciId) === String(kullanici?.id)) && (
                <Button variant="secondary" size="sm" onClick={async () => {
                  const ok = await vekaletKapat(v.id)
                  if (ok) setVekaletler(p => p.map(x => (x.id === v.id ? { ...x, aktif: false } : x)))
                }}>Sonlandır</Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
