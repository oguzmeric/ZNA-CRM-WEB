// Alt görev ağacı + Alt Görev Oluştur modalı (spek madde 3, 6.3, 7, 8, 12).
// Ağaç gorev_no prefix'iyle tek sorguda gelir (GRV-2026-000145-01-02 → DFS sıralı).
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Plus, CornerDownRight, GitBranch, X } from 'lucide-react'
import { gorevAgaciGetir, gorevEkle, gorevAyarlariGetir } from '../../services/gorevService'
import { useBildirim } from '../../context/BildirimContext'
import { useToast } from '../../context/ToastContext'
import {
  etkinDurum, oncelikBilgi, ONCELIK_SECENEKLERI, gorevYetkisi, altGorevVerebilirMi,
  gorevSorumlusuMu, bugunStr,
} from '../../lib/gorevSabitleri'
import { Button, Input, Textarea, Label, Card, CardTitle, Avatar } from '../ui'
import CustomSelect from '../CustomSelect'
import CokluSelect from '../CokluSelect'

const trTarih = (t) => (t ? String(t).slice(0, 10).split('-').reverse().join('.') : '—')

function IlerlemeBar({ deger }) {
  return (
    <div style={{ width: 54, height: 5, borderRadius: 3, background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', overflow: 'hidden', flexShrink: 0 }} title={`%${deger || 0}`}>
      <div style={{ width: `${Math.min(100, Math.max(0, deger || 0))}%`, height: '100%', background: (deger || 0) >= 100 ? 'var(--success)' : 'var(--brand-primary)' }} />
    </div>
  )
}

export default function AltGorevlerKarti({ gorev, kullanici, kullanicilar, onAgacDegisti }) {
  const navigate = useNavigate()
  const { bildirimEkle } = useBildirim()
  const { toast } = useToast()
  const [agac, setAgac] = useState([])
  const [modalAcik, setModalAcik] = useState(false)
  const [maxSeviye, setMaxSeviye] = useState(5)

  const yukle = useCallback(() => {
    if (!gorev?.gorevNo) return
    gorevAgaciGetir(gorev.gorevNo).then(a => {
      setAgac(a)
      onAgacDegisti?.(a)
    })
  }, [gorev?.gorevNo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { yukle() }, [yukle])
  useEffect(() => { gorevAyarlariGetir().then(a => setMaxSeviye(a?.maxAltSeviye ?? 5)) }, [])

  // Alt görev verebilme (madde 9): yetki + ana sorumlu/oluşturan/admin olmak
  const verebilir = altGorevVerebilirMi(kullanici) && (
    kullanici?.rol === 'admin' ||
    gorevSorumlusuMu(gorev, kullanici) ||
    String(gorev?.olusturanId ?? '') === String(kullanici?.id) ||
    gorev?.olusturanAd === kullanici?.ad
  )
  const seviyeDolu = (gorev?.seviye ?? 0) + 1 > maxSeviye

  if (!gorev?.gorevNo && !agac.length) return null

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: agac.length ? 12 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GitBranch size={16} strokeWidth={1.5} style={{ color: 'var(--brand-primary)' }} />
          <CardTitle>Alt Görevler</CardTitle>
          {agac.length > 0 && (
            <span className="t-caption tabular-nums">
              {agac.filter(a => a.durum === 'tamamlandi').length}/{agac.length} tamamlandı
            </span>
          )}
        </div>
        {verebilir && !seviyeDolu && (
          <Button variant="secondary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => setModalAcik(true)}>
            Alt Görev Oluştur
          </Button>
        )}
      </div>

      {agac.length === 0 ? (
        <p className="t-caption" style={{ fontStyle: 'italic', margin: 0 }}>
          {verebilir
            ? 'Bu görevin alt görevi yok. İşi bölmek için alt görev oluşturabilirsin — ana sorumluluk sende kalır.'
            : 'Bu görevin alt görevi yok.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {agac.map(a => {
            const d = etkinDurum(a)
            const o = oncelikBilgi(a.oncelik)
            const girinti = Math.max(0, (a.seviye ?? 1) - (gorev.seviye ?? 0) - 1) * 18
            const sorumlu = kullanicilar?.find(k => String(k.id) === String(a.atananId ?? a.atanan))
            return (
              <button
                key={a.id}
                onClick={() => navigate(`/gorevler/${a.id}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                  marginLeft: girinti, maxWidth: `calc(100% - ${girinti}px)`,
                  padding: '9px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  background: 'var(--surface-sunken)', border: '1px solid var(--border-default)',
                  transition: 'border-color 120ms',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brand-primary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-default)'}
              >
                <CornerDownRight size={13} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                <span style={{ font: '500 11px/16px var(--font-mono)', color: 'var(--text-tertiary)', flexShrink: 0 }}>{a.gorevNo}</span>
                <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {a.baslik}
                </span>
                {sorumlu && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }} title={`Sorumlu: ${sorumlu.ad}`}>
                    <Avatar name={sorumlu.ad} size="xs" />
                    <span className="t-caption" style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sorumlu.ad}</span>
                  </span>
                )}
                <span title={`Öncelik: ${o.isim}`} style={{ width: 8, height: 8, borderRadius: '50%', background: o.renk, flexShrink: 0 }} />
                <IlerlemeBar deger={a.durum === 'tamamlandi' ? 100 : a.ilerleme} />
                <span className="t-caption tabular-nums" style={{ flexShrink: 0, minWidth: 62, textAlign: 'right' }}>{trTarih(a.sonTarih)}</span>
                <span style={{
                  flexShrink: 0, padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                  font: '600 11px/16px var(--font-sans)', color: d.renk,
                  background: 'var(--surface-card)', border: `1px solid ${d.renk}`,
                }}>
                  {d.isim}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {seviyeDolu && verebilir && (
        <p className="t-caption" style={{ marginTop: 8, fontStyle: 'italic' }}>
          Maksimum alt görev seviyesine ({maxSeviye}) ulaşıldı — bu görevin altına yeni görev açılamaz.
        </p>
      )}

      {modalAcik && (
        <AltGorevModal
          anaGorev={gorev}
          kardesler={agac.filter(a => String(a.ustGorevId) === String(gorev.id))}
          kullanici={kullanici}
          kullanicilar={kullanicilar}
          onKapat={() => setModalAcik(false)}
          onOlustu={(yeni, atananAd) => {
            setModalAcik(false)
            yukle()
            // Spek madde 24 örnek bildirim biçimi
            if (String(yeni.atananId ?? '') !== String(kullanici?.id)) {
              bildirimEkle(
                yeni.atanan,
                '📋 Yeni alt görev atandı',
                `${kullanici?.ad}, "${gorev.baslik}" ana görevi kapsamında size "${yeni.baslik}" alt görevini atadı. Son tarih: ${trTarih(yeni.sonTarih)}.`,
                'gorev',
                `/gorevler/${yeni.id}`,
              ).catch(() => {})
            }
            for (const gid of (yeni.gozlemciler || [])) {
              if (String(gid) === String(kullanici?.id)) continue
              bildirimEkle(gid, '👀 Bir göreve gözlemci eklendiniz',
                `"${yeni.baslik}" alt görevini takip listenize ${kullanici?.ad} ekledi.`,
                'gorev', `/gorevler/${yeni.id}`).catch(() => {})
            }
            toast.success(`Alt görev oluşturuldu (${yeni.gorevNo || ''}) — sorumlu: ${atananAd}.`)
          }}
        />
      )}
    </Card>
  )
}

// ─── Alt Görev Oluştur modalı (madde 7) ─────────────────────────────────────
function AltGorevModal({ anaGorev, kardesler, kullanici, kullanicilar, onKapat, onOlustu }) {
  const { toast } = useToast()
  const [form, setForm] = useState({
    baslik: '', aciklama: '', atanan: '', baslamaTarih: '', sonTarih: '',
    oncelik: 'normal', zorunlu: true, beklenenCikti: '',
    onayGerekli: true, gozlemciler: [], bagimliGorevId: '',
  })
  const [tarihGerekce, setTarihGerekce] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const anaSon = anaGorev?.sonTarih ? String(anaGorev.sonTarih).slice(0, 10) : null
  const tarihAsiyor = !!(anaSon && form.sonTarih && form.sonTarih > anaSon)
  const asabilir = kullanici?.rol === 'admin' || gorevYetkisi(kullanici).sureDegistir

  const kaydet = async () => {
    if (!form.baslik.trim()) { toast.error('Alt görev başlığı zorunlu.'); return }
    if (!form.atanan) { toast.error('Alt görevin atanacağı kişiyi seç.'); return }
    if (!form.sonTarih) { toast.error('Bitiş tarihi zorunlu.'); return }
    if (form.sonTarih < bugunStr()) { toast.error('Bitiş tarihi geçmişte olamaz.'); return }
    if (tarihAsiyor && !asabilir) {
      toast.error('Alt görevin tamamlanma tarihi ana görevin tamamlanma tarihinden sonraya ayarlanamaz.')
      return
    }
    if (tarihAsiyor && asabilir && !tarihGerekce.trim()) {
      toast.error('Ana görev tarihini aşıyorsun — gerekçe yazman zorunlu.')
      return
    }
    setKaydediliyor(true)
    try {
      const atananKisi = kullanicilar.find(k => String(k.id) === String(form.atanan))
      const yeni = await gorevEkle({
        baslik: form.baslik.trim(),
        aciklama: [form.aciklama.trim(), tarihAsiyor ? `\n[Tarih aşım gerekçesi: ${tarihGerekce.trim()}]` : '']
          .join('').trim() || null,
        ustGorevId: anaGorev.id,
        atanan: String(form.atanan),
        atananId: Number(form.atanan),
        atananAd: atananKisi?.ad || null,
        baslamaTarih: form.baslamaTarih || null,
        sonTarih: form.sonTarih,
        bitisTarihi: form.sonTarih,
        oncelik: form.oncelik,
        zorunlu: !!form.zorunlu,
        beklenenCikti: form.beklenenCikti.trim() || null,
        onayGerekli: !!form.onayGerekli,
        // Alt görev onayı, alt görevi OLUŞTURANA düşer (madde 14)
        onaylayiciId: form.onayGerekli ? kullanici.id : null,
        gozlemciler: form.gozlemciler.map(Number),
        bagimliGorevId: form.bagimliGorevId ? Number(form.bagimliGorevId) : null,
        bagimlilikTuru: form.bagimliGorevId ? 'once_tamamlanmali' : null,
        durum: 'bekliyor',
        kabulDurumu: 'atandi',
        olusturanAd: kullanici.ad,
        olusturanId: kullanici.id,
        olusturmaTarih: undefined,
        // Müşteri bağlamı ana görevden miras
        musteriId: anaGorev.musteriId || null,
        musteriAdi: anaGorev.musteriAdi || null,
        firmaAdi: anaGorev.firmaAdi || null,
        gizlilik: anaGorev.gizlilik || 'standart',
      })
      if (!yeni) throw new Error('Alt görev kaydedilemedi')
      onOlustu(yeni, atananKisi?.ad || '—')
    } catch (e) {
      toast.error('Kaydedilemedi: ' + (e?.message || 'hata'))
    } finally {
      setKaydediliyor(false)
    }
  }

  return createPortal(
    <div
      onClick={onKapat}
      style={{
        position: 'fixed', inset: 0, zIndex: 100000, padding: 20,
        background: 'rgba(15, 23, 42, 0.72)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 620, maxHeight: '92vh', overflowY: 'auto',
          background: 'var(--surface-card)', border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ font: '700 16px/22px var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>Alt Görev Oluştur</h2>
          <button onClick={onKapat} aria-label="Kapat" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4 }}>
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* Ana görev bilgileri otomatik (madde 7) */}
        <div style={{
          padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 16,
          background: 'var(--brand-primary-soft)', border: '1px solid var(--border-default)',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8,
        }}>
          <div>
            <div className="t-label">ANA GÖREV</div>
            <div style={{ font: '500 12.5px/17px var(--font-sans)', color: 'var(--text-primary)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', marginRight: 6 }}>{anaGorev.gorevNo}</span>
              {anaGorev.baslik}
            </div>
          </div>
          <div>
            <div className="t-label">ANA SORUMLU</div>
            <div style={{ font: '500 12.5px/17px var(--font-sans)', color: 'var(--text-primary)' }}>{anaGorev.atananAd || '—'}</div>
          </div>
          <div>
            <div className="t-label">OLUŞTURAN</div>
            <div style={{ font: '500 12.5px/17px var(--font-sans)', color: 'var(--text-primary)' }}>{anaGorev.olusturanAd || '—'}</div>
          </div>
          <div>
            <div className="t-label">ANA SON TARİH</div>
            <div style={{ font: '500 12.5px/17px var(--font-sans)', color: 'var(--text-primary)' }} className="tabular-nums">{trTarih(anaGorev.sonTarih)}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Label required>Alt görev başlığı</Label>
            <Input value={form.baslik} onChange={e => set('baslik', e.target.value)} placeholder="Örn. Bayi evraklarının kontrolü" />
          </div>
          <div>
            <Label>Açıklama</Label>
            <Textarea rows={2} value={form.aciklama} onChange={e => set('aciklama', e.target.value)} placeholder="Ne yapılmasını bekliyorsun?" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label required>Atanacak kişi</Label>
              <CustomSelect value={form.atanan} onChange={e => set('atanan', e.target.value)} searchable>
                <option value="">Seç…</option>
                {(kullanicilar || []).filter(k => k.rol !== 'musteri').map(k => (
                  <option key={k.id} value={k.id}>{k.ad}</option>
                ))}
              </CustomSelect>
            </div>
            <div>
              <Label>Öncelik</Label>
              <CustomSelect value={form.oncelik} onChange={e => set('oncelik', e.target.value)}>
                {ONCELIK_SECENEKLERI.map(o => <option key={o.id} value={o.id}>{o.isim}</option>)}
              </CustomSelect>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Başlangıç tarihi</Label>
              <Input type="date" value={form.baslamaTarih} onChange={e => set('baslamaTarih', e.target.value)} />
            </div>
            <div>
              <Label required>Bitiş tarihi</Label>
              <Input type="date" value={form.sonTarih} min={bugunStr()} onChange={e => set('sonTarih', e.target.value)} />
            </div>
          </div>

          {tarihAsiyor && (
            <div style={{
              padding: '10px 12px', borderRadius: 'var(--radius-sm)',
              background: 'var(--warning-soft, rgba(245,158,11,0.1))', border: '1px solid var(--warning)',
            }}>
              <div style={{ font: '600 12.5px/18px var(--font-sans)', color: 'var(--warning)', marginBottom: 6 }}>
                ⚠️ Alt görevin tamamlanma tarihi ana görevin tamamlanma tarihinden ({trTarih(anaSon)}) sonra.
              </div>
              {asabilir ? (
                <>
                  <Label required>Aşım gerekçesi</Label>
                  <Input value={tarihGerekce} onChange={e => setTarihGerekce(e.target.value)} placeholder="Neden ana görev tarihinden sonra bitecek?" />
                </>
              ) : (
                <p className="t-caption" style={{ margin: 0 }}>Tarih aşma yetkin yok — ana görev tarihinden önce bir tarih seç.</p>
              )}
            </div>
          )}

          <div>
            <Label>Görev için beklenen çıktı</Label>
            <Textarea rows={2} value={form.beklenenCikti} onChange={e => set('beklenenCikti', e.target.value)} placeholder="Örn. güncel bayi listesi Excel dosyası" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Gözlemciler</Label>
              <CokluSelect
                degerler={form.gozlemciler}
                onChange={arr => set('gozlemciler', arr)}
                secenekler={(kullanicilar || []).filter(k => k.rol !== 'musteri').map(k => ({ id: k.id, ad: k.ad }))}
                placeholder="Gözlemci seç…"
              />
            </div>
            <div>
              <Label>Bağımlı olduğu alt görev</Label>
              <CustomSelect value={form.bagimliGorevId} onChange={e => set('bagimliGorevId', e.target.value)}>
                <option value="">Yok</option>
                {kardesler.map(k => <option key={k.id} value={k.id}>{k.gorevNo} — {k.baslik}</option>)}
              </CustomSelect>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={form.zorunlu} onChange={e => set('zorunlu', e.target.checked)} />
              Ana görevin tamamlanması için zorunlu
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={form.onayGerekli} onChange={e => set('onayGerekli', e.target.checked)} />
              Tamamlanınca onayıma düşsün
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <Button variant="secondary" onClick={onKapat}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Oluşturuluyor…' : 'Alt Görevi Oluştur'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
