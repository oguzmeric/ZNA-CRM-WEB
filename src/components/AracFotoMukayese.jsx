// Araç Foto MUKAYESE ekranı (mig 198, 2026-07-19 tasarımı):
// Bölge başına REFERANS | SABAH | AKŞAM yan yana — Teknik Müdür Ferdi Kalkan
// (id 33) + admin, "Kontrol Edildi ✓" veya "Hasar Tespit ⚠" işaretler
// (serbest inceleme; hasar = kayıt + bildirim, otomatik görev yok).
// Referans yükleme/yenileme de buradan yapılır (yalnız Ferdi + admin;
// eskiler versiyonlu arşive düşer).
import { useState, useEffect, useCallback } from 'react'
import { ShieldCheck, AlertTriangle, Upload, Camera } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useBildirim } from '../context/BildirimContext'
import { Button, Card, CardTitle, Input, Label, Textarea, EmptyState } from './ui'
import CustomSelect from './CustomSelect'

const FERDI_ID = 33
const BOLGELER = [
  { id: 'on', ad: 'Ön' }, { id: 'arka', ad: 'Arka' }, { id: 'sol', ad: 'Sol Yan' },
  { id: 'sag', ad: 'Sağ Yan' }, { id: 'kokpit', ad: 'Ön Konsol' }, { id: 'ic', ad: 'Araç İçi' },
]
const bugunISO = () => new Date().toISOString().slice(0, 10)

export default function AracFotoMukayese() {
  const { kullanici } = useAuth()
  const { toast } = useToast()
  const { bildirimEkle } = useBildirim()
  const yetkili = kullanici?.rol === 'admin' || String(kullanici?.id) === String(FERDI_ID)

  const [araclar, setAraclar] = useState([])
  const [aracId, setAracId] = useState('')
  const [tarih, setTarih] = useState(bugunISO())
  const [referanslar, setReferanslar] = useState({})   // bolge → kayıt
  const [gunluk, setGunluk] = useState({ sabah: {}, aksam: {} })
  const [kontrol, setKontrol] = useState(null)
  const [imzaMap, setImzaMap] = useState({})
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hasarModal, setHasarModal] = useState(false)
  const [hasarBolgeler, setHasarBolgeler] = useState([])
  const [hasarNot, setHasarNot] = useState('')
  const [mesgul, setMesgul] = useState(false)
  const [yukleyenBolge, setYukleyenBolge] = useState(null)

  useEffect(() => {
    supabase.from('sirket_araclari')
      .select('id, plaka, marka, model, sorumlu_kullanici_idler')
      .eq('aktif', true).order('plaka')
      .then(({ data }) => setAraclar(data ?? []))
  }, [])

  const yukle = useCallback(async () => {
    if (!aracId) return
    setYukleniyor(true)
    try {
      const [refQ, gunQ, konQ] = await Promise.all([
        supabase.from('arac_referans_fotolar')
          .select('id, bolge, foto_url, versiyon, aciklama, ceken_ad, olusturma_tarih')
          .eq('arac_id', aracId).eq('aktif', true),
        supabase.from('arac_foto_kayitlari')
          .select('id, zaman, bolge, foto_url, cekim_zamani, kullanicilar(ad)')
          .eq('arac_id', aracId).eq('tarih', tarih),
        supabase.from('arac_foto_kontroller')
          .select('*').eq('arac_id', aracId).eq('tarih', tarih).maybeSingle(),
      ])
      const refMap = Object.fromEntries((refQ.data ?? []).map(r => [r.bolge, r]))
      const g = { sabah: {}, aksam: {} }
      for (const k of (gunQ.data ?? [])) g[k.zaman][k.bolge] = k
      setReferanslar(refMap)
      setGunluk(g)
      setKontrol(konQ.data ?? null)
      // Signed URL'ler
      const yollar = [...(refQ.data ?? []), ...(gunQ.data ?? [])].map(x => x.foto_url).filter(Boolean)
      const imzalar = {}
      await Promise.all(yollar.map(async yol => {
        const { data: s } = await supabase.storage.from('arac-fotolari').createSignedUrl(yol, 3600)
        if (s?.signedUrl) imzalar[yol] = s.signedUrl
      }))
      setImzaMap(imzalar)
    } finally {
      setYukleniyor(false)
    }
  }, [aracId, tarih])

  useEffect(() => { yukle() }, [yukle])

  const secilenArac = araclar.find(a => a.id === aracId)
  const refTamam = Object.keys(referanslar).length >= BOLGELER.length

  // ── Referans yükleme (web'den dosya seç — eski versiyon arşive düşer) ─────
  const referansYukle = async (bolge, file) => {
    if (!file) return
    setYukleyenBolge(bolge)
    try {
      const yol = `${aracId}/referans/${bolge}_${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage.from('arac-fotolari')
        .upload(yol, file, { contentType: file.type || 'image/jpeg', upsert: false })
      if (upErr) throw upErr
      const eski = referanslar[bolge]
      if (eski) {
        const { error } = await supabase.from('arac_referans_fotolar')
          .update({ aktif: false }).eq('id', eski.id)
        if (error) throw error
      }
      const { error: iErr } = await supabase.from('arac_referans_fotolar').insert({
        arac_id: aracId, bolge, foto_url: yol,
        versiyon: (eski?.versiyon ?? 0) + 1, aktif: true,
        ceken_id: kullanici.id, ceken_ad: kullanici.ad,
      })
      if (iErr) throw iErr
      toast.success(`${BOLGELER.find(b => b.id === bolge)?.ad} referansı kaydedildi (v${(eski?.versiyon ?? 0) + 1}).`)
      yukle()
    } catch (e) {
      toast.error('Referans yüklenemedi: ' + (e?.message || 'hata'))
    } finally {
      setYukleyenBolge(null)
    }
  }

  // ── Referans silme (yalnız Ferdi + admin; bölge boşalır, kilit geri gelir) ─
  const referansSilWeb = async (ref, bolgeAd) => {
    if (!window.confirm(`${bolgeAd} referansı silinsin mi? Bölge boşalır ve bu araçta günlük çekim yeniden kilitlenir.`)) return
    try {
      const { data, error } = await supabase
        .from('arac_referans_fotolar').delete().eq('id', ref.id).select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Silme yetkin yok (RLS engelledi).')
      if (ref.foto_url) {
        supabase.storage.from('arac-fotolari').remove([ref.foto_url]).catch(() => {})
      }
      toast.success(`${bolgeAd} referansı silindi.`)
      yukle()
    } catch (e) {
      toast.error('Silinemedi: ' + (e?.message || 'hata'))
    }
  }

  // ── Kontrol kararları ─────────────────────────────────────────────────────
  const kontrolKaydet = async (sonuc, bolgeler = [], notlar = null) => {
    setMesgul(true)
    try {
      const { data, error } = await supabase.from('arac_foto_kontroller')
        .upsert({
          arac_id: aracId, tarih, sonuc,
          hasarli_bolgeler: bolgeler, notlar,
          kontrol_eden_id: kullanici.id, kontrol_eden_ad: kullanici.ad,
        }, { onConflict: 'arac_id,tarih' })
        .select().single()
      if (error) throw error
      setKontrol(data)
      if (sonuc === 'hasar') {
        const bolgeAdlari = bolgeler.map(b => BOLGELER.find(x => x.id === b)?.ad || b).join(', ')
        const alicilar = new Set((secilenArac?.sorumlu_kullanici_idler || []).map(Number))
        for (const aid of alicilar) {
          if (String(aid) === String(kullanici.id)) continue
          bildirimEkle(aid, '⚠️ Araçta hasar tespit edildi',
            `${secilenArac?.plaka} — ${bolgeAdlari || 'bölge belirtilmedi'}. ${notlar || ''} (${kullanici.ad})`,
            'uyari', '').catch(() => {})
        }
        toast.warning('Hasar kaydedildi — araç sorumlusu bilgilendirildi.')
      } else {
        toast.success('Kontrol edildi olarak işaretlendi.')
      }
      setHasarModal(false); setHasarBolgeler([]); setHasarNot('')
    } catch (e) {
      toast.error('Kaydedilemedi: ' + (e?.message || 'hata'))
    } finally {
      setMesgul(false)
    }
  }

  const Hucre = ({ kayit, etiket }) => {
    const url = kayit?.foto_url ? imzaMap[kayit.foto_url] : null
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            <img src={url} alt={etiket} style={{
              width: '100%', height: 120, objectFit: 'cover',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)',
            }} />
          </a>
        ) : (
          <div style={{
            height: 120, borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--border-default)', background: 'var(--surface-sunken)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-tertiary)', font: '400 12px/16px var(--font-sans)',
          }}>
            Çekilmedi
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Araç + tarih seçimi */}
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 220 }}>
            <Label required>Araç</Label>
            <CustomSelect value={aracId} onChange={e => setAracId(e.target.value)} searchable>
              <option value="">Araç seç…</option>
              {araclar.map(a => <option key={a.id} value={a.id}>{a.plaka} — {a.marka} {a.model}</option>)}
            </CustomSelect>
          </div>
          <div>
            <Label>Tarih</Label>
            <Input type="date" value={tarih} max={bugunISO()} onChange={e => setTarih(e.target.value)} />
          </div>
          {aracId && (
            <span style={{
              padding: '5px 12px', borderRadius: 'var(--radius-pill)', marginBottom: 4,
              font: '600 12px/18px var(--font-sans)',
              color: refTamam ? 'var(--success)' : 'var(--warning)',
              background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
            }}>
              {refTamam ? '📌 Referans tamam (6/6)' : `📌 Referans eksik (${Object.keys(referanslar).length}/6) — günlük çekim KİLİTLİ`}
            </span>
          )}
          {aracId && kontrol && (
            <span style={{
              padding: '5px 12px', borderRadius: 'var(--radius-pill)', marginBottom: 4,
              font: '600 12px/18px var(--font-sans)',
              color: kontrol.sonuc === 'hasar' ? 'var(--danger)' : 'var(--success)',
              background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
            }}>
              {kontrol.sonuc === 'hasar' ? `⚠ Hasar tespit — ${kontrol.kontrol_eden_ad}` : `✓ Kontrol edildi — ${kontrol.kontrol_eden_ad}`}
            </span>
          )}
        </div>
      </Card>

      {!aracId ? (
        <EmptyState
          icon={<Camera size={28} strokeWidth={1.5} />}
          title="Mukayese için araç seç"
          description="Referans, sabah ve akşam fotoğrafları bölge bölge yan yana karşılaştırılır."
        />
      ) : yukleniyor ? (
        <p className="t-caption">Yükleniyor…</p>
      ) : (
        <>
          {/* Bölge satırları: REFERANS | SABAH | AKŞAM */}
          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 8, paddingLeft: 110 }}>
              {['REFERANS (BAZ)', 'SABAH', 'AKŞAM'].map(b => (
                <div key={b} className="t-label" style={{ flex: 1, textAlign: 'center' }}>{b}</div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {BOLGELER.map(b => {
                const ref = referanslar[b.id]
                return (
                  <div key={b.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 100, flexShrink: 0 }}>
                      <div style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{b.ad}</div>
                      {ref && <div className="t-caption">v{ref.versiyon} · {ref.ceken_ad || '—'}</div>}
                      {yetkili && (
                        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                          <label style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                            font: '600 11px/16px var(--font-sans)', color: 'var(--brand-primary)',
                          }}>
                            <Upload size={11} strokeWidth={1.5} />
                            {yukleyenBolge === b.id ? 'Yükleniyor…' : (ref ? 'Yenile' : 'Referans Yükle')}
                            <input type="file" accept="image/*" style={{ display: 'none' }}
                              disabled={!!yukleyenBolge}
                              onChange={e => { referansYukle(b.id, e.target.files?.[0]); e.target.value = '' }} />
                          </label>
                          {ref && (
                            <button
                              onClick={() => referansSilWeb(ref, b.ad)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer',
                                background: 'none', border: 'none', padding: 0,
                                font: '600 11px/16px var(--font-sans)', color: 'var(--danger)',
                              }}
                            >
                              Sil
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <Hucre kayit={ref} etiket={`${b.ad} referans`} />
                    <Hucre kayit={gunluk.sabah[b.id]} etiket={`${b.ad} sabah`} />
                    <Hucre kayit={gunluk.aksam[b.id]} etiket={`${b.ad} akşam`} />
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Kontrol kararları — yalnız Ferdi + admin */}
          {yetkili && (
            <Card>
              <CardTitle>Günlük Kontrol — {tarih.split('-').reverse().join('.')}</CardTitle>
              <p className="t-caption" style={{ margin: '4px 0 12px' }}>
                Referans ile günlük fotoğrafları karşılaştırdıktan sonra kararını işaretle. Hasar tespitinde araç sorumlusu bilgilendirilir.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="primary" iconLeft={<ShieldCheck size={14} strokeWidth={1.5} />}
                  disabled={mesgul} onClick={() => kontrolKaydet('temiz')}>
                  ✓ Kontrol Edildi — Sorun Yok
                </Button>
                <Button variant="secondary" iconLeft={<AlertTriangle size={14} strokeWidth={1.5} />}
                  disabled={mesgul} onClick={() => setHasarModal(true)}
                  style={{ color: 'var(--danger)', borderColor: 'var(--danger-border, var(--danger))' }}>
                  ⚠ Hasar Tespit
                </Button>
              </div>

              {hasarModal && (
                <div style={{
                  marginTop: 14, padding: 14, borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-sunken)', border: '1px solid var(--danger)',
                }}>
                  <Label required>Hasarlı bölgeler</Label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 10px' }}>
                    {BOLGELER.map(b => {
                      const secili = hasarBolgeler.includes(b.id)
                      return (
                        <button key={b.id}
                          onClick={() => setHasarBolgeler(p => secili ? p.filter(x => x !== b.id) : [...p, b.id])}
                          style={{
                            padding: '6px 12px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                            font: '600 12px/16px var(--font-sans)',
                            background: secili ? 'var(--danger)' : 'var(--surface-card)',
                            color: secili ? '#fff' : 'var(--text-secondary)',
                            border: '1px solid var(--border-default)',
                          }}>
                          {b.ad}
                        </button>
                      )
                    })}
                  </div>
                  <Label required>Hasar açıklaması</Label>
                  <Textarea rows={2} value={hasarNot} onChange={e => setHasarNot(e.target.value)}
                    placeholder="Ne görüldü? Örn. sol arka çamurlukta yeni çizik…" />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                    <Button variant="secondary" size="sm" onClick={() => setHasarModal(false)}>Vazgeç</Button>
                    <Button variant="primary" size="sm" disabled={mesgul}
                      onClick={() => {
                        if (!hasarBolgeler.length) { toast.error('En az bir hasarlı bölge seç.'); return }
                        if (!hasarNot.trim()) { toast.error('Hasar açıklaması zorunlu.'); return }
                        kontrolKaydet('hasar', hasarBolgeler, hasarNot.trim())
                      }}>
                      Hasarı Kaydet
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  )
}
