// Şirket araçları CRUD — Ali/Oğuz için. Plaka, marka, model, yıl, aktif,
// muayene/sigorta/kasko bitiş tarihleri + sorumlu(lar) (bitiş hatırlatmaları için).
import { useEffect, useState } from 'react'
import { Car, Plus, Edit2, Trash2, Check, X, CalendarClock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Card, Button, Badge } from '../components/ui'
import CokluSelect from '../components/CokluSelect'

const bosArac = {
  plaka: '', marka: '', model: '', yil: '', not_: '', aktif: true,
  muayene_bitis: '', sigorta_bitis: '', kasko_bitis: '', sorumlu_kullanici_idler: [],
}

// tr-TR gösterim + kalan gün rozeti
const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'
const kalanGun = (t) => t ? Math.ceil((new Date(t) - new Date()) / 86400000) : null

export default function AracYonetimi() {
  const [araclar, setAraclar] = useState([])
  const [personeller, setPersoneller] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [yeniMi, setYeniMi] = useState(false)
  const [duzenlenen, setDuzenlenen] = useState(null)
  const [form, setForm] = useState(bosArac)
  const [hata, setHata] = useState(null)

  const yukle = async () => {
    setYukleniyor(true)
    const { data } = await supabase.from('sirket_araclari').select('*').order('plaka')
    setAraclar(data ?? [])
    setYukleniyor(false)
  }
  useEffect(() => { yukle() }, [])

  // Sorumlu seçimi için personel listesi (müşteri hesapları hariç)
  useEffect(() => {
    supabase.from('kullanicilar').select('id, ad').neq('tip', 'musteri').order('ad')
      .then(({ data }) => setPersoneller(data ?? []))
  }, [])

  const modaliAc = (arac = null) => {
    setHata(null)
    if (arac) {
      setDuzenlenen(arac)
      setForm({
        ...bosArac, ...arac, yil: arac.yil ?? '',
        muayene_bitis: arac.muayene_bitis ?? '',
        sigorta_bitis: arac.sigorta_bitis ?? '',
        kasko_bitis: arac.kasko_bitis ?? '',
        sorumlu_kullanici_idler: arac.sorumlu_kullanici_idler ?? [],
      })
    } else {
      setDuzenlenen(null)
      setForm(bosArac)
    }
    setYeniMi(true)
  }

  const kapat = () => { setYeniMi(false); setDuzenlenen(null); setForm(bosArac); setHata(null) }

  const kaydet = async () => {
    const plaka = form.plaka.trim().toUpperCase()
    if (!plaka) { setHata('Plaka boş olamaz'); return }
    const payload = {
      plaka,
      marka: form.marka?.trim() || null,
      model: form.model?.trim() || null,
      yil: form.yil ? Number(form.yil) : null,
      not_: form.not_?.trim() || null,
      aktif: !!form.aktif,
      muayene_bitis: form.muayene_bitis || null,
      sigorta_bitis: form.sigorta_bitis || null,
      kasko_bitis: form.kasko_bitis || null,
      sorumlu_kullanici_idler: form.sorumlu_kullanici_idler ?? [],
    }
    let err
    if (duzenlenen) {
      const r = await supabase.from('sirket_araclari').update(payload).eq('id', duzenlenen.id)
      err = r.error
    } else {
      const r = await supabase.from('sirket_araclari').insert(payload)
      err = r.error
    }
    if (err) { setHata('Hata: ' + err.message); return }
    kapat(); yukle()
  }

  const sil = async (arac) => {
    if (!confirm(`${arac.plaka} plakalı aracı silmek istediğine emin misin?\nDaha önce çekilmiş fotolar da silinir.`)) return
    const { error } = await supabase.from('sirket_araclari').delete().eq('id', arac.id)
    if (error) { alert('Hata: ' + error.message); return }
    yukle()
  }

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 className="t-h1" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Car size={22} strokeWidth={1.75} /> Araç Yönetimi
          </h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            Şirket araç listesi — teknisyenler mobilden foto kaydı için buradaki plakaları görür.
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.75} />} onClick={() => modaliAc(null)}>
          Yeni Araç
        </Button>
      </div>

      <Card padding={0}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              {/* 'Not' değil 'Araç Notu' — Chrome otomatik çeviri 'Not'u İngilizce sanıp 'Değil' yapıyordu */}
              {['Plaka', 'Marka', 'Model', 'Yıl', 'Muayene', 'Durum', 'Araç Notu', ''].map(h =>
                <th key={h} style={{ textAlign: 'left', padding: '12px 14px', borderBottom: '2px solid var(--border-default)', font: '600 12px/16px var(--font-sans)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {yukleniyor && <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</td></tr>}
            {!yukleniyor && araclar.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                Henüz araç kaydı yok. "Yeni Araç" ile başla.
              </td></tr>
            )}
            {araclar.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--border-default)' }}>
                <td style={{ padding: '10px 14px', font: '700 14px/20px var(--font-sans)', color: 'var(--text-primary)', letterSpacing: 0.5 }}>{a.plaka}</td>
                <td style={{ padding: '10px 14px', color: 'var(--text-primary)', fontSize: 13 }}>{a.marka || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--text-primary)', fontSize: 13 }}>{a.model || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 13 }}>{a.yil || '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 13 }}>
                  {(() => {
                    const kg = kalanGun(a.muayene_bitis)
                    if (kg === null) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                    const tone = kg < 0 ? 'kayip' : kg <= 15 ? 'beklemede' : 'basari'
                    return (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{fmtTarih(a.muayene_bitis)}</span>
                        <Badge tone={tone}>{kg < 0 ? `${Math.abs(kg)}g geçti` : `${kg}g`}</Badge>
                      </span>
                    )
                  })()}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <Badge tone={a.aktif ? 'basari' : 'nötr'}>{a.aktif ? 'Aktif' : 'Pasif'}</Badge>
                </td>
                <td style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontSize: 12, maxWidth: 220 }}>{a.not_ || ''}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    <Button variant="tertiary" size="sm" iconLeft={<Edit2 size={12} strokeWidth={1.75} />} onClick={() => modaliAc(a)}>Düzenle</Button>
                    <Button variant="tertiary" size="sm" iconLeft={<Trash2 size={12} strokeWidth={1.75} />} onClick={() => sil(a)}>Sil</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Modal */}
      {yeniMi && (
        <div onClick={kapat} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <Card onClick={e => e.stopPropagation()} style={{ width: 'min(560px, 92vw)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, font: '700 18px/24px var(--font-sans)' }}>{duzenlenen ? 'Araç Düzenle' : 'Yeni Araç'}</h2>
              <button onClick={kapat} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Alan etiket="Plaka *" deger={form.plaka} onDegis={v => setForm({ ...form, plaka: v.toUpperCase() })} otoBuyuk />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Alan etiket="Marka" deger={form.marka} onDegis={v => setForm({ ...form, marka: v })} />
                <Alan etiket="Model" deger={form.model} onDegis={v => setForm({ ...form, model: v })} />
              </div>
              <Alan etiket="Yıl" tip="number" deger={form.yil} onDegis={v => setForm({ ...form, yil: v })} />
              <Alan etiket="Araç Notu" deger={form.not_} onDegis={v => setForm({ ...form, not_: v })} />

              {/* Belge bitiş tarihleri — sistem 15 gün önceden sorumlulara bildirir */}
              <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <CalendarClock size={14} strokeWidth={1.75} style={{ color: 'var(--brand-primary)' }} />
                  <span style={{ font: '600 12px/16px var(--font-sans)', color: 'var(--text-secondary)' }}>
                    Belge Bitişleri — 15 gün önceden sorumlulara bildirilir
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <Alan etiket="Muayene" tip="date" deger={form.muayene_bitis} onDegis={v => setForm({ ...form, muayene_bitis: v })} />
                  <Alan etiket="Sigorta" tip="date" deger={form.sigorta_bitis} onDegis={v => setForm({ ...form, sigorta_bitis: v })} />
                  <Alan etiket="Kasko" tip="date" deger={form.kasko_bitis} onDegis={v => setForm({ ...form, kasko_bitis: v })} />
                </div>
              </div>

              <div>
                <label style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 4 }}>
                  Sorumlu(lar) — bitiş hatırlatması alır
                </label>
                <CokluSelect
                  degerler={form.sorumlu_kullanici_idler ?? []}
                  onChange={ids => setForm({ ...form, sorumlu_kullanici_idler: ids })}
                  secenekler={personeller}
                  placeholder="Sorumlu seç…"
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.aktif} onChange={e => setForm({ ...form, aktif: e.target.checked })} />
                <span style={{ font: '500 13px/18px var(--font-sans)' }}>Aktif (mobil listede görünsün)</span>
              </label>

              {hata && <div style={{ padding: 8, background: 'rgba(239,68,68,0.12)', color: 'var(--danger)', borderRadius: 6, fontSize: 12 }}>{hata}</div>}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <Button variant="secondary" onClick={kapat}>İptal</Button>
                <Button variant="primary" iconLeft={<Check size={14} strokeWidth={1.75} />} onClick={kaydet}>Kaydet</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function Alan({ etiket, deger, onDegis, tip = 'text', otoBuyuk = false }) {
  return (
    <div>
      <label style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{etiket}</label>
      <input
        type={tip}
        value={deger ?? ''}
        onChange={e => onDegis(e.target.value)}
        style={{
          display: 'block', width: '100%', marginTop: 4,
          padding: '8px 10px', borderRadius: 8,
          border: '1px solid var(--border-default)',
          background: 'var(--surface-sunken)', color: 'var(--text-primary)',
          fontSize: 14,
          textTransform: otoBuyuk ? 'uppercase' : 'none',
          letterSpacing: otoBuyuk ? 0.5 : 0,
          fontWeight: otoBuyuk ? 600 : 400,
        }}
      />
    </div>
  )
}
