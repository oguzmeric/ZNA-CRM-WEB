// Web'den bakım kalemi doldurma — mobil KalemForm'un web karşılığı.
// Doğrulama + sonuç metni motoru ortak: src/lib/bakimSablon (mobil ile birebir).
import { useState } from 'react'
import { X, Plus, Trash2, MinusCircle, PlusCircle } from 'lucide-react'
import {
  kalemBilgi, YAPILAMADI_SEBEPLERI, KAYIT_CIHAZI_TURLERI, HDD_KAPASITELERI,
  SAAT_TARIH_SECENEKLERI, cctvDogrula, genelDogrula, arizaVarMi, sonucMetniUret,
} from '../lib/bakimSablon'
import { topluBakimKalemGuncelle } from '../services/topluBakimService'
import { Button, Input, Textarea, Label } from './ui'

export default function BakimKalemFormModal({ kalem, onKapat, onKaydedildi }) {
  const kb = kalemBilgi(kalem.kalemTip)
  const cctvMi = kalem.kalemTip === 'cctv'
  const [c, setC] = useState(() => ({
    kayitCihazlari: [], saatTarih: null,
    toplamKamera: '', calisanKamera: '', arizaliKamera: '',
    adet: '', marka: '', boyut: '', sonucDurum: null, arizaliAdet: '', aciklama: '',
    ...(kalem.cevaplar || {}),
  }))
  const [yapilamadi, setYapilamadi] = useState(kalem.durum === 'yapilamadi')
  const [sebep, setSebep] = useState(kalem.yapilamadiSebep || '')
  const [mesgul, setMesgul] = useState(false)
  const [hata, setHata] = useState(null)

  const set = (k, v) => setC((p) => ({ ...p, [k]: v }))

  const kaydet = async (tamamla) => {
    setHata(null)
    let patch
    if (yapilamadi) {
      if (!sebep) { setHata('Yapılamama sebebini seçin.'); return }
      patch = { durum: 'yapilamadi', yapilamadiSebep: sebep, cevaplar: c, sonucMetni: null, arizaVar: false, bitisTarih: new Date().toISOString() }
    } else if (tamamla) {
      const h = cctvMi ? cctvDogrula(c) : genelDogrula(c)
      if (h) { setHata(h); return }
      const ariza = arizaVarMi(kalem.kalemTip, c)
      patch = {
        cevaplar: c, durum: ariza ? 'ariza_tespit' : 'tamamlandi', arizaVar: ariza,
        sonucMetni: sonucMetniUret(kalem.kalemTip, c), yapilamadiSebep: null,
        baslamaTarih: kalem.baslamaTarih || new Date().toISOString(),
        bitisTarih: new Date().toISOString(),
      }
    } else {
      patch = { cevaplar: c, durum: kalem.durum === 'baslanmadi' ? 'devam_ediyor' : kalem.durum }
    }
    setMesgul(true)
    const g = await topluBakimKalemGuncelle(kalem.id, patch)
    setMesgul(false)
    if (g) onKaydedildi(g)
    else setHata('Kaydedilemedi.')
  }

  const cihazlar = c.kayitCihazlari || []
  const cihazSet = (i, alan, v) => {
    const y = [...cihazlar]; y[i] = { ...y[i], [alan]: v }; set('kayitCihazlari', y)
  }
  const hddDegistir = (i, kap, delta) => {
    const mev = Number(cihazlar[i].hddler?.[kap] || 0)
    cihazSet(i, 'hddler', { ...(cihazlar[i].hddler || {}), [kap]: Math.max(0, mev + delta) })
  }

  const secim = (aktif) => ({
    padding: '7px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
    border: `1.5px solid ${aktif ? 'var(--brand-primary)' : 'var(--border-default)'}`,
    background: aktif ? 'rgba(59,130,246,0.1)' : 'var(--surface-card)',
    color: aktif ? 'var(--brand-primary)' : 'var(--text-secondary)',
  })

  return (
    <div onClick={onKapat} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottom: '1px solid var(--border-default)', position: 'sticky', top: 0, background: 'var(--surface-card)', zIndex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>
            {kb.ikon} {kb.isim} <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-tertiary)' }}>{kalem.altNo}</span>
          </div>
          <button onClick={onKapat} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={20} /></button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Yapılamadı anahtarı */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: yapilamadi ? '#f59e0b' : 'var(--text-secondary)' }}>
            <input type="checkbox" checked={yapilamadi} onChange={(e) => setYapilamadi(e.target.checked)} />
            Bu sistemin bakımı YAPILAMADI
          </label>

          {yapilamadi ? (
            <div>
              <Label>Yapılamama sebebi</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {YAPILAMADI_SEBEPLERI.map((s) => (
                  <button key={s} type="button" onClick={() => setSebep(s)} style={secim(sebep === s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : cctvMi ? (
            <>
              {/* Kayıt cihazları */}
              <div>
                <Label>1) Kayıt Cihazları</Label>
                {cihazlar.map((k, i) => (
                  <div key={i} style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: 12, marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <strong style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>Cihaz {i + 1}</strong>
                      <button onClick={() => set('kayitCihazlari', cihazlar.filter((_, x) => x !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={14} /></button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {KAYIT_CIHAZI_TURLERI.map((t) => (
                        <button key={t} type="button" onClick={() => cihazSet(i, 'tur', t)} style={secim(k.tur === t)}>{t}</button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <Input value={k.ad || ''} onChange={(e) => cihazSet(i, 'ad', e.target.value)} placeholder="Cihaz adı / sıra no (ops.)" style={{ flex: 1 }} />
                      <Input value={String(k.kayitGun ?? '')} onChange={(e) => cihazSet(i, 'kayitGun', e.target.value.replace(/[^0-9]/g, ''))} placeholder="Kayıt (gün)" style={{ width: 110 }} />
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 6 }}>HDD KAPASİTE / ADET</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {HDD_KAPASITELERI.map((kap) => {
                        const adet = Number(k.hddler?.[kap] || 0)
                        return (
                          <div key={kap} style={{ ...secim(adet > 0), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span onClick={() => adet === 0 && hddDegistir(i, kap, 1)} style={{ cursor: 'pointer' }}>{kap}</span>
                            {adet > 0 && (
                              <>
                                <MinusCircle size={14} style={{ cursor: 'pointer' }} onClick={() => hddDegistir(i, kap, -1)} />
                                <strong>{adet}</strong>
                                <PlusCircle size={14} style={{ cursor: 'pointer' }} onClick={() => hddDegistir(i, kap, 1)} />
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
                <Button variant="secondary" style={{ marginTop: 8 }} onClick={() => set('kayitCihazlari', [...cihazlar, { tur: 'NVR', ad: '', kayitGun: '', hddler: {} }])}>
                  <Plus size={14} /> Kayıt Cihazı / Sunucu Ekle
                </Button>
              </div>

              {/* Saat/tarih */}
              <div>
                <Label>2) Saat ve tarih ayarları güncel mi?</Label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {SAAT_TARIH_SECENEKLERI.map((s) => (
                    <button key={s.id} type="button" onClick={() => set('saatTarih', s.id)} style={secim(c.saatTarih === s.id)}>{s.isim}</button>
                  ))}
                </div>
              </div>

              {/* Kamera sayıları */}
              <div>
                <Label>3) Kamera Sayıları (Toplam = Çalışan + Arızalı)</Label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <Input value={String(c.toplamKamera ?? '')} onChange={(e) => set('toplamKamera', e.target.value.replace(/[^0-9]/g, ''))} placeholder="Toplam" />
                  <Input value={String(c.calisanKamera ?? '')} onChange={(e) => set('calisanKamera', e.target.value.replace(/[^0-9]/g, ''))} placeholder="Çalışan" />
                  <Input value={String(c.arizaliKamera ?? '')} onChange={(e) => set('arizaliKamera', e.target.value.replace(/[^0-9]/g, ''))} placeholder="Arızalı" />
                </div>
              </div>
            </>
          ) : (
            <>
              {(kalem.kalemTip === 'turnike' || kalem.kalemTip === 'ekran_led') && (
                <div>
                  <Label>{kalem.kalemTip === 'turnike' ? 'Turnike adedi' : 'Ekran adedi'}</Label>
                  <Input value={String(c.adet ?? '')} onChange={(e) => set('adet', e.target.value.replace(/[^0-9]/g, ''))} placeholder="adet" />
                </div>
              )}
              {(kalem.kalemTip === 'ekran_led' || kalem.kalemTip === 'sistem_odasi') && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Label>Marka</Label>
                    <Input value={c.marka ?? ''} onChange={(e) => set('marka', e.target.value)} placeholder={kalem.kalemTip === 'sistem_odasi' ? 'örn. CANOVATE' : 'örn. SAMSUNG'} />
                  </div>
                  {kalem.kalemTip === 'ekran_led' && (
                    <div style={{ width: 120 }}>
                      <Label>Boyut</Label>
                      <Input value={c.boyut ?? ''} onChange={(e) => set('boyut', e.target.value)} placeholder="55 inç" />
                    </div>
                  )}
                </div>
              )}
              <div>
                <Label>Bakım sonucu</Label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button type="button" onClick={() => set('sonucDurum', 'sorunsuz')} style={{ ...secim(c.sonucDurum === 'sorunsuz'), flex: 1 }}>✅ Sorunsuz</button>
                  <button type="button" onClick={() => set('sonucDurum', 'arizali')} style={{ ...secim(c.sonucDurum === 'arizali'), flex: 1 }}>⚠️ Arızalı</button>
                </div>
              </div>
              {c.sonucDurum === 'arizali' && (
                <div>
                  <Label>Arızalı adet</Label>
                  <Input value={String(c.arizaliAdet ?? '')} onChange={(e) => set('arizaliAdet', e.target.value.replace(/[^0-9]/g, ''))} placeholder="adet" />
                </div>
              )}
              <div>
                <Label>Ek açıklama (sonuç metnine eklenir)</Label>
                <Textarea rows={2} value={c.aciklama ?? ''} onChange={(e) => set('aciklama', e.target.value)} />
              </div>
            </>
          )}

          {hata && <div style={{ padding: 10, borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#dc2626', fontSize: 12.5 }}>{hata}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {!yapilamadi && <Button variant="ghost" onClick={() => kaydet(false)} disabled={mesgul}>Ara Kaydet</Button>}
            <Button variant="primary" onClick={() => kaydet(true)} disabled={mesgul}
              style={yapilamadi ? { background: '#f59e0b' } : undefined}>
              {mesgul ? 'Kaydediliyor…' : yapilamadi ? 'Yapılamadı Olarak Kaydet' : 'Bakımı Tamamla'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
