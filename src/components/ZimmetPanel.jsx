// Zimmet & Envanter — Skor sayfası içinden açılan fullscreen modal panel.
// createPortal + hardcoded solid renkler (transparent parent bug'ı önlemek için).
// Envanter tab: transit SN'li kalemler (görüntüleme)
// Demirbaş tab: kalıcı laptop/çanta/alet zimmetleri (admin ekle/iade)

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  tumTeknisyenEnvanter, teknisyenAktifEnvanter,
  tumDemirbaslar, teknisyenDemirbaslari,
  demirbasEkle, demirbasIade, demirbasFotoYukle,
} from '../services/zimmetService'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// Yönetim ayrımı: aynı YonetimGuard mantığı (isim regex).
// Kullanicilar.rol kolonuna güvenmiyoruz — bu CRM'de yönetici kimliği isim
// üzerinden belirleniyor.
const isYonetim = (ad) => /\b(oğuz|oguz|ali|ferdi)\b/i.test(String(ad || '').toLocaleLowerCase('tr'))

const DEMIRBAS_KATEGORI = [
  { id: 'laptop', ad: 'Laptop', ikon: '💻' },
  { id: 'canta', ad: 'Takım Çantası', ikon: '🎒' },
  { id: 'alet', ad: 'Alet/Ekipman', ikon: '🔧' },
  { id: 'telefon', ad: 'Telefon', ikon: '📱' },
  { id: 'diger', ad: 'Diğer', ikon: '📦' },
]

// Solid renkler (CSS var kullanma — parent transparent olabiliyor)
const R = {
  bg: '#0B1220',
  panel: '#131C2E',
  panel2: '#1B263D',
  border: 'rgba(255,255,255,0.08)',
  border2: 'rgba(255,255,255,0.14)',
  metin: '#E5E9F4',
  metin2: '#94A3B8',
  metin3: '#64748B',
  mavi: '#3B82F6',
  mor: '#8B5CF6',
  yesil: '#10B981',
  kirmizi: '#EF4444',
}

export default function ZimmetPanel({ onKapat }) {
  const { kullanici } = useAuth()
  const kullaniciId = kullanici?.id
  const yonetim = isYonetim(kullanici?.ad)
  const [sekme, setSekme] = useState('envanter')
  const [kullanicilar, setKullanicilar] = useState([])
  const [envanterListe, setEnvanterListe] = useState([])
  const [demirbasListe, setDemirbasListe] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [ekleModal, setEkleModal] = useState(false)
  const [seciliTeknisyenId, setSeciliTeknisyenId] = useState(null)

  useEffect(() => {
    (async () => {
      // Demirbaş ekleme modalı için teknisyen listesi (adminler dahil olmasın)
      const { data: liste } = await supabase.from('kullanicilar').select('id, ad, unvan').order('ad')
      setKullanicilar((liste || []).filter(k => !isYonetim(k.ad)))
    })()
  }, [])

  const yukle = async () => {
    if (!kullaniciId) return
    setYukleniyor(true)
    try {
      if (yonetim) {
        setEnvanterListe(await tumTeknisyenEnvanter())
        setDemirbasListe(await tumDemirbaslar())
      } else {
        setEnvanterListe(await teknisyenAktifEnvanter(kullaniciId))
        setDemirbasListe(await teknisyenDemirbaslari(kullaniciId))
      }
    } catch (e) {
      console.warn('[zimmet-panel] yükle hata:', e?.message)
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { yukle() }, [kullaniciId, yonetim])

  // Escape ile kapat
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onKapat()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onKapat])

  const teknisyeneGoreGrupla = (liste) => {
    const map = new Map()
    for (const kayit of liste) {
      const k = kayit.kullanici
      if (!k?.id) continue
      if (!map.has(k.id)) map.set(k.id, { kullanici: k, kayitlar: [] })
      map.get(k.id).kayitlar.push(kayit)
    }
    return Array.from(map.values()).sort((a, b) => (a.kullanici.ad || '').localeCompare(b.kullanici.ad || '', 'tr'))
  }

  const envanterGruplu = yonetim ? teknisyeneGoreGrupla(envanterListe) : null
  const demirbasGruplu = yonetim ? teknisyeneGoreGrupla(demirbasListe) : null

  const icerik = (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100000,
      background: R.bg, color: R.metin,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      overflow: 'auto',
    }}>
      <div style={{ padding: '24px 40px', maxWidth: 1400, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, borderBottom: `1px solid ${R.border}`, paddingBottom: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: R.metin3, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, marginBottom: 6 }}>
              ZNA Teknoloji
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: R.metin }}>Zimmet & Envanter</h1>
            <div style={{ color: R.metin2, fontSize: 13, marginTop: 4 }}>
              {yonetim ? 'Tüm teknisyenlerin aktif kayıtları' : 'Sizdeki aktif kayıtlar'}
            </div>
          </div>
          <button onClick={onKapat} style={{
            padding: '10px 16px', borderRadius: 10,
            background: R.panel2, color: R.metin, border: `1px solid ${R.border2}`,
            cursor: 'pointer', fontSize: 14, fontWeight: 600,
          }}>✕ Kapat</button>
        </div>

        {/* Tabs + Add */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'inline-flex', background: R.panel, border: `1px solid ${R.border}`, borderRadius: 10, padding: 3 }}>
            {[
              { id: 'envanter', ad: '🎒 Envanter (SN)', boyut: envanterListe.length },
              { id: 'demirbas', ad: '💻 Demirbaş', boyut: demirbasListe.length },
            ].map(t => {
              const on = sekme === t.id
              return (
                <button key={t.id} onClick={() => setSekme(t.id)} style={{
                  padding: '10px 18px', borderRadius: 8,
                  background: on ? R.mor : 'transparent',
                  color: on ? '#fff' : R.metin2,
                  border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
                }}>
                  {t.ad} <span style={{ opacity: 0.75, marginLeft: 4 }}>({t.boyut})</span>
                </button>
              )
            })}
          </div>

          {sekme === 'demirbas' && yonetim && (
            <button onClick={() => setEkleModal(true)} style={{
              padding: '10px 18px', borderRadius: 10,
              background: R.mor, color: '#fff', border: 'none',
              fontWeight: 600, cursor: 'pointer', fontSize: 14,
            }}>+ Demirbaş Ekle</button>
          )}
        </div>

        {sekme === 'envanter' && yonetim && (
          <div style={{ padding: 12, marginBottom: 16, background: R.panel, border: `1px solid ${R.border}`, borderRadius: 10, fontSize: 13, color: R.metin2 }}>
            💡 Envanter kayıtları servise SN taradığında otomatik gelir. Buradan sadece izleme yapılır.
          </div>
        )}

        {/* Content */}
        {yukleniyor ? (
          <div style={{ padding: 60, textAlign: 'center', color: R.metin2 }}>Yükleniyor…</div>
        ) : yonetim ? (
          <YonetimGorunum
            sekme={sekme}
            envanterGruplu={envanterGruplu}
            demirbasGruplu={demirbasGruplu}
            seciliId={seciliTeknisyenId}
            setSeciliId={setSeciliTeknisyenId}
            onIade={async (id) => {
              if (!confirm('Bu demirbaş iade edildi olarak işaretlensin mi?')) return
              await demirbasIade(id)
              yukle()
            }}
          />
        ) : sekme === 'envanter' ? (
          <EnvanterListe yonetim={false} liste={envanterListe} />
        ) : (
          <DemirbasListe yonetim={false} liste={demirbasListe} onIade={null} />
        )}
      </div>

      {ekleModal && yonetim && (
        <DemirbasEkleModal
          kullanicilar={kullanicilar}
          onKapat={() => setEkleModal(false)}
          onKaydet={() => { setEkleModal(false); yukle() }}
        />
      )}
    </div>
  )

  return createPortal(icerik, document.body)
}

// Yönetim modu için master-detail: sol teknisyen listesi, sağ seçili teknisyenin kayıtları
function YonetimGorunum({ sekme, envanterGruplu, demirbasGruplu, seciliId, setSeciliId, onIade }) {
  const gruplu = sekme === 'envanter' ? envanterGruplu : demirbasGruplu
  const birim = sekme === 'envanter' ? 'kalem' : 'demirbaş'

  if (!gruplu || gruplu.length === 0) {
    return <BosMesaj>Şu an hiçbir teknisyende aktif {birim} yok.</BosMesaj>
  }

  const secili = gruplu.find(g => g.kullanici.id === seciliId) || gruplu[0]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, alignItems: 'start' }}>
      {/* Sol: teknisyen listesi */}
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 12, color: R.metin3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, padding: '0 4px 6px' }}>
          Teknisyenler ({gruplu.length})
        </div>
        {gruplu.map(g => {
          const on = secili?.kullanici.id === g.kullanici.id
          return (
            <button
              key={g.kullanici.id}
              onClick={() => setSeciliId(g.kullanici.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: 12, borderRadius: 10,
                background: on ? 'rgba(139,92,246,0.12)' : R.panel,
                border: `1px solid ${on ? 'rgba(139,92,246,0.45)' : R.border}`,
                cursor: 'pointer', textAlign: 'left', color: R.metin,
                width: '100%',
              }}
            >
              {g.kullanici.foto_url ? (
                <img src={g.kullanici.foto_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: R.panel2, color: R.metin, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14 }}>
                  {(g.kullanici.ad || '?').slice(0, 2).toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{g.kullanici.ad}</div>
                <div style={{ fontSize: 12, color: R.metin2, marginTop: 2 }}>{g.kayitlar.length} {birim}</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Sağ: seçili teknisyenin kayıtları */}
      <div style={kartStil()}>
        <div style={{ marginBottom: 12, fontSize: 14, color: R.metin2 }}>
          <strong style={{ color: R.metin }}>{secili.kullanici.ad}</strong> · {secili.kayitlar.length} {birim}
        </div>
        {sekme === 'envanter'
          ? secili.kayitlar.map(k => <EnvanterSatir key={k.id} kayit={k} />)
          : secili.kayitlar.map(d => <DemirbasSatir key={d.id} kayit={d} yonetim onIade={onIade} />)
        }
      </div>
    </div>
  )
}

function EnvanterListe({ liste }) {
  if (!liste.length) return <BosMesaj>Aktif envanter yok.</BosMesaj>
  return <div style={kartStil()}>{liste.map(k => <EnvanterSatir key={k.id} kayit={k} />)}</div>
}

function EnvanterSatir({ kayit }) {
  const urun = kayit.stok_kalemi?.urun
  return (
    <div style={{ padding: 12, background: R.panel2, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'monospace', color: R.metin, fontSize: 13, fontWeight: 600 }}>{kayit.stok_kalemi?.seri_no || '—'}</div>
        <div style={{ fontSize: 12, color: R.metin2, marginTop: 2 }}>{[urun?.marka, urun?.model, urun?.ad].filter(Boolean).join(' · ')}</div>
      </div>
      <div style={{ fontSize: 11, color: R.metin3 }}>
        {new Date(kayit.zimmet_zamani).toLocaleDateString('tr-TR')}
      </div>
    </div>
  )
}

function DemirbasSatir({ kayit, yonetim, onIade }) {
  const kat = DEMIRBAS_KATEGORI.find(k => k.id === kayit.kategori)
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, background: R.panel2, borderRadius: 8, marginBottom: 6 }}>
      {kayit.foto_url ? (
        <img src={kayit.foto_url} alt="" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover' }} />
      ) : (
        <div style={{ width: 60, height: 60, borderRadius: 8, background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>{kat?.ikon}</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: R.metin }}>{kat?.ad}</div>
        <div style={{ fontSize: 12, color: R.metin2 }}>{kayit.aciklama || '—'}</div>
        <div style={{ fontSize: 11, color: R.metin3, marginTop: 2 }}>Verildi: {new Date(kayit.verildi_tarih).toLocaleDateString('tr-TR')}</div>
      </div>
      {yonetim && onIade && (
        <button onClick={() => onIade(kayit.id)} style={{
          padding: '8px 14px', borderRadius: 8, background: R.panel, color: R.metin, border: `1px solid ${R.border2}`, cursor: 'pointer', fontSize: 13,
        }}>İade Al</button>
      )}
    </div>
  )
}

function DemirbasListe({ liste }) {
  if (!liste.length) return <BosMesaj>Aktif demirbaş zimmeti yok.</BosMesaj>
  return <div style={kartStil()}>{liste.map(d => <DemirbasSatir key={d.id} kayit={d} yonetim={false} />)}</div>
}

function BosMesaj({ children }) {
  return (
    <div style={{
      padding: 60, textAlign: 'center', color: R.metin2,
      background: R.panel, borderRadius: 12, border: `1px dashed ${R.border2}`,
    }}>{children}</div>
  )
}

function DemirbasEkleModal({ kullanicilar, onKapat, onKaydet }) {
  const [kullaniciId, setKullaniciId] = useState('')
  const [kategori, setKategori] = useState('laptop')
  const [aciklama, setAciklama] = useState('')
  const [foto, setFoto] = useState(null)
  const [hata, setHata] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(false)

  const kaydet = async () => {
    setYukleniyor(true); setHata(null)
    try {
      let fotoUrl = null
      if (foto) fotoUrl = await demirbasFotoYukle(foto, kullaniciId)
      await demirbasEkle({ kullaniciId, kategori, aciklama, fotoUrl })
      onKaydet()
    } catch (e) { setHata(e?.message || 'Kayıt hatası') }
    finally { setYukleniyor(false) }
  }

  return createPortal(
    <div onClick={onKapat} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100001,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: R.panel, color: R.metin,
        borderRadius: 14, padding: 24,
        maxWidth: 520, width: '100%', maxHeight: '90vh', overflow: 'auto',
        border: `1px solid ${R.border2}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, color: R.metin, fontSize: 18 }}>Demirbaş Zimmet Ekle</h3>
          <button onClick={onKapat} style={{ background: 'none', border: 'none', color: R.metin2, fontSize: 24, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={etiket}>Kime</label>
            <select value={kullaniciId} onChange={e => setKullaniciId(e.target.value)} style={inputStil()}>
              <option value="">— seç —</option>
              {kullanicilar.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
            </select>
          </div>
          <div>
            <label style={etiket}>Kategori</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DEMIRBAS_KATEGORI.map(k => (
                <button key={k.id} onClick={() => setKategori(k.id)} style={{
                  padding: '8px 14px', borderRadius: 8,
                  background: kategori === k.id ? R.mor : R.panel2,
                  color: kategori === k.id ? '#fff' : R.metin,
                  border: `1px solid ${R.border2}`, cursor: 'pointer', fontSize: 13,
                }}>{k.ikon} {k.ad}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={etiket}>Açıklama</label>
            <input value={aciklama} onChange={e => setAciklama(e.target.value)} placeholder="Örn: Dell Latitude 5540, S/N ABC123" style={inputStil()} />
          </div>
          <div>
            <label style={etiket}>Fotoğraf</label>
            <input type="file" accept="image/*" onChange={e => setFoto(e.target.files?.[0] || null)} style={{ ...inputStil(), padding: 8 }} />
          </div>
          {hata && <div style={{ color: R.kirmizi, fontSize: 13 }}>{hata}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onKapat} style={{ padding: '10px 16px', borderRadius: 8, background: R.panel2, color: R.metin, border: `1px solid ${R.border2}`, cursor: 'pointer', fontSize: 14 }}>İptal</button>
            <button onClick={kaydet} disabled={!kullaniciId || yukleniyor} style={{
              padding: '10px 18px', borderRadius: 8, background: R.mor, color: '#fff',
              border: 'none', fontWeight: 600, cursor: yukleniyor ? 'default' : 'pointer', fontSize: 14, opacity: (!kullaniciId || yukleniyor) ? 0.5 : 1,
            }}>{yukleniyor ? 'Yükleniyor…' : 'Kaydet'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const etiket = { display: 'block', fontSize: 12, color: '#94A3B8', marginBottom: 6, fontWeight: 600 }
const inputStil = () => ({
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: `1px solid ${R.border2}`, background: R.panel2, color: R.metin,
  fontSize: 14, boxSizing: 'border-box',
})
const kartStil = () => ({ padding: 16, background: R.panel, borderRadius: 12, border: `1px solid ${R.border}` })
