// Zimmet & Envanter yönetim sayfası.
// - Envanter tab: transit SN'li stok kalemleri (servise götürülen)
// - Demirbaş tab: kalıcı laptop/çanta/alet zimmetleri (fotoğraflı)

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  tumTeknisyenEnvanter, teknisyenAktifEnvanter,
  envanterDurumGuncelle,
  tumDemirbaslar, teknisyenDemirbaslari,
  demirbasEkle, demirbasIade, demirbasFotoYukle,
} from '../services/zimmetService'
import { supabase } from '../lib/supabase'

const DEMIRBAS_KATEGORI = [
  { id: 'laptop', ad: 'Laptop', ikon: '💻' },
  { id: 'canta', ad: 'Takım Çantası', ikon: '🎒' },
  { id: 'alet', ad: 'Alet/Ekipman', ikon: '🔧' },
  { id: 'telefon', ad: 'Telefon', ikon: '📱' },
  { id: 'diger', ad: 'Diğer', ikon: '📦' },
]

export default function Zimmet() {
  const [sekme, setSekme] = useState('envanter')
  const [rol, setRol] = useState(null)
  const [kullaniciId, setKullaniciId] = useState(null)
  const [kullanicilar, setKullanicilar] = useState([])
  const [envanterListe, setEnvanterListe] = useState([])
  const [demirbasListe, setDemirbasListe] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [ekleModal, setEkleModal] = useState(null)  // 'envanter' | 'demirbas' | null

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getUser()
      const uid = sess?.user?.id
      setKullaniciId(uid)
      if (!uid) return
      const { data: kul } = await supabase.from('kullanicilar').select('id, rol').eq('id', uid).maybeSingle()
      setRol(kul?.rol)
      const { data: liste } = await supabase.from('kullanicilar').select('id, ad, unvan, rol').eq('rol', 'personel').order('ad')
      setKullanicilar(liste || [])
    })()
  }, [])

  const yukle = async () => {
    if (!kullaniciId) return
    setYukleniyor(true)
    try {
      if (rol === 'admin') {
        setEnvanterListe(await tumTeknisyenEnvanter())
        setDemirbasListe(await tumDemirbaslar())
      } else {
        setEnvanterListe(await teknisyenAktifEnvanter(kullaniciId))
        setDemirbasListe(await teknisyenDemirbaslari(kullaniciId))
      }
    } catch (e) {
      console.warn('[zimmet] yükle hata:', e?.message)
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { yukle() }, [kullaniciId, rol])

  // Personel görünümü için gruplama gereksiz; admin'de teknisyene göre grupla
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

  const envanterGruplu = rol === 'admin' ? teknisyeneGoreGrupla(envanterListe) : null
  const demirbasGruplu = rol === 'admin' ? teknisyeneGoreGrupla(demirbasListe) : null

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Zimmet & Envanter</h1>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13, marginTop: 4 }}>
            {rol === 'admin' ? 'Tüm teknisyenlerin aktif kayıtları' : 'Sizdeki aktif kayıtlar'}
          </div>
        </div>
        <Link to="/skor" style={{ fontSize: 13, color: 'var(--accent-primary)', textDecoration: 'none' }}>← Skor</Link>
      </div>

      {/* Tabs */}
      <div style={{ display: 'inline-flex', background: 'var(--surface-secondary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 3, marginBottom: 20 }}>
        {[
          { id: 'envanter', ad: '🎒 Envanter (SN)', boyut: envanterListe.length },
          { id: 'demirbas', ad: '💻 Demirbaş', boyut: demirbasListe.length },
        ].map(t => {
          const on = sekme === t.id
          return (
            <button key={t.id} onClick={() => setSekme(t.id)} style={{
              padding: '10px 18px', borderRadius: 8,
              background: on ? 'var(--accent-primary)' : 'transparent',
              color: on ? '#fff' : 'var(--text-secondary)',
              border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
            }}>
              {t.ad} <span style={{ opacity: 0.7, marginLeft: 4 }}>({t.boyut})</span>
            </button>
          )
        })}
      </div>

      {/* Add button — sadece demirbaş için (envanter mevcut SN akışıyla otomatik gelir) */}
      {sekme === 'demirbas' && rol === 'admin' && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => setEkleModal('demirbas')} style={btnPrimary}>+ Demirbaş Ekle</button>
        </div>
      )}

      {yukleniyor ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
      ) : sekme === 'envanter' ? (
        <EnvanterListe rol={rol} liste={envanterListe} gruplu={envanterGruplu} onGuncelle={async (id, durum) => {
          await envanterDurumGuncelle(id, durum)
          yukle()
        }} />
      ) : (
        <DemirbasListe rol={rol} liste={demirbasListe} gruplu={demirbasGruplu} onIade={async (id) => {
          if (!confirm('Bu demirbaş iade edildi olarak işaretlensin mi?')) return
          await demirbasIade(id)
          yukle()
        }} />
      )}

      {ekleModal === 'demirbas' && rol === 'admin' && (
        <DemirbasEkleModal kullanicilar={kullanicilar} onKapat={() => setEkleModal(null)} onKaydet={() => { setEkleModal(null); yukle() }} />
      )}
    </div>
  )
}

function EnvanterListe({ rol, liste, gruplu }) {
  if (!liste.length) return <div style={bosMesaj}>Aktif envanter yok.</div>
  if (rol === 'admin' && gruplu) {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        {gruplu.map(g => (
          <div key={g.kullanici.id} style={kartStil}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {g.kullanici.foto_url ? (
                <img src={g.kullanici.foto_url} alt="" style={avatar} />
              ) : (
                <div style={{ ...avatar, background: 'var(--surface-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                  {(g.kullanici.ad || '?').slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{g.kullanici.ad}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{g.kayitlar.length} kalem</div>
              </div>
            </div>
            {g.kayitlar.map(k => <EnvanterSatir key={k.id} kayit={k} />)}
          </div>
        ))}
      </div>
    )
  }
  return <div style={{ ...kartStil, display: 'grid', gap: 8 }}>{liste.map(k => <EnvanterSatir key={k.id} kayit={k} />)}</div>
}

function EnvanterSatir({ kayit }) {
  const urun = kayit.stok_kalemi?.urun
  return (
    <div style={{ padding: 10, background: 'var(--surface-secondary)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'monospace', color: 'var(--text-primary)', fontSize: 13 }}>{kayit.stok_kalemi?.seri_no || '—'}</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{[urun?.marka, urun?.model, urun?.ad].filter(Boolean).join(' · ')}</div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
        {new Date(kayit.zimmet_zamani).toLocaleDateString('tr-TR')}
      </div>
    </div>
  )
}

function DemirbasListe({ rol, liste, gruplu, onIade }) {
  if (!liste.length) return <div style={bosMesaj}>Aktif demirbaş zimmeti yok.</div>
  const kartlariYaz = (kayitlar) => kayitlar.map(d => {
    const kat = DEMIRBAS_KATEGORI.find(k => k.id === d.kategori)
    return (
      <div key={d.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, background: 'var(--surface-secondary)', borderRadius: 8 }}>
        {d.foto_url ? (
          <img src={d.foto_url} alt="" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 60, height: 60, borderRadius: 8, background: 'var(--surface-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>{kat?.ikon}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{kat?.ad}</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{d.aciklama || '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Verildi: {new Date(d.verildi_tarih).toLocaleDateString('tr-TR')}</div>
        </div>
        {rol === 'admin' && <button onClick={() => onIade(d.id)} style={btnGhost}>İade</button>}
      </div>
    )
  })
  if (rol === 'admin' && gruplu) {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        {gruplu.map(g => (
          <div key={g.kullanici.id} style={kartStil}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {g.kullanici.foto_url ? (
                <img src={g.kullanici.foto_url} alt="" style={avatar} />
              ) : (
                <div style={{ ...avatar, background: 'var(--surface-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                  {(g.kullanici.ad || '?').slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{g.kullanici.ad}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{g.kayitlar.length} demirbaş</div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>{kartlariYaz(g.kayitlar)}</div>
          </div>
        ))}
      </div>
    )
  }
  return <div style={{ ...kartStil, display: 'grid', gap: 8 }}>{kartlariYaz(liste)}</div>
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

  return (
    <ModalKapak onKapat={onKapat} baslik="Demirbaş Zimmet Ekle">
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <label style={etiket}>Kime</label>
          <select value={kullaniciId} onChange={e => setKullaniciId(e.target.value)} style={input}>
            <option value="">— seç —</option>
            {kullanicilar.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
          </select>
        </div>
        <div>
          <label style={etiket}>Kategori</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DEMIRBAS_KATEGORI.map(k => (
              <button key={k.id} onClick={() => setKategori(k.id)} style={{
                padding: '8px 12px', borderRadius: 8,
                background: kategori === k.id ? 'var(--accent-primary)' : 'var(--surface-secondary)',
                color: kategori === k.id ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border-primary)', cursor: 'pointer', fontSize: 13,
              }}>{k.ikon} {k.ad}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={etiket}>Açıklama (marka/model/detay)</label>
          <input value={aciklama} onChange={e => setAciklama(e.target.value)} placeholder="Örn: Dell Latitude 5540, S/N ABC123" style={input} />
        </div>
        <div>
          <label style={etiket}>Fotoğraf</label>
          <input type="file" accept="image/*" onChange={e => setFoto(e.target.files?.[0] || null)} style={{ ...input, padding: 6 }} />
        </div>
        {hata && <div style={{ color: '#ef4444', fontSize: 13 }}>{hata}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onKapat} style={btnGhost}>İptal</button>
          <button onClick={kaydet} disabled={!kullaniciId || yukleniyor} style={btnPrimary}>{yukleniyor ? 'Yükleniyor…' : 'Kaydet'}</button>
        </div>
      </div>
    </ModalKapak>
  )
}

function ModalKapak({ baslik, onKapat, children }) {
  return (
    <div onClick={onKapat} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface-primary)', borderRadius: 12, padding: 24,
        maxWidth: 500, width: '100%', maxHeight: '90vh', overflow: 'auto',
        border: '1px solid var(--border-primary)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>{baslik}</h3>
          <button onClick={onKapat} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const etiket = { display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 600 }
const input = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--surface-secondary)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box' }
const btnPrimary = { padding: '10px 18px', borderRadius: 8, background: 'var(--accent-primary)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 }
const btnGhost = { padding: '10px 14px', borderRadius: 8, background: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)', cursor: 'pointer', fontSize: 14 }
const kartStil = { padding: 16, background: 'var(--surface-primary)', borderRadius: 12, border: '1px solid var(--border-primary)' }
const avatar = { width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }
const bosMesaj = { padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', background: 'var(--surface-primary)', borderRadius: 12, border: '1px dashed var(--border-primary)' }
