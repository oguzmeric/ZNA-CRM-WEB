// SN OKUT — depo kiosk ekranı (21.08 kullanıcı isteği).
//
// Depodaki PC + USB barkod okuyucu (Zebex) için: okuyucu klavye gibi yazar ve
// Enter gönderir. Ekran hep tek giriş alanına odaklıdır; seçili İŞLEM MODU
// her okutmada otomatik uygulanır:
//   🔎 Sorgula        — yalnız bul/göster (karttaki butonlarla tekil işlem)
//   📥 Depoya Çek     — teknisyende/sahada/arızalı kalemi depoya alır
//   👤 Teknisyene Ver — depodaki kalemi seçili personele zimmetler
//   🔧 Arızalı        — kalemi arızalı-depoda işaretler (atomik RPC)
// Arama mig 321 `stok_sn_ara` ile NORMALIZE: tire/boşluk/kasa farkı yutulur,
// müşteri-cihazı kayıtları da tanınır (işlem uygulanmaz, bilgi verilir).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ScanLine, Search, PackageOpen, User, Wrench, CheckCircle2, AlertTriangle,
  Info, ArrowLeft, Volume2, VolumeX,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { toCamel } from '../lib/mapper'
import { snDepoyaCek, snTeknisyeneVer, durumBul } from '../services/stokService'
import { snArizaliIsaretle, ARIZA_SEBEPLERI } from '../services/depoService'
import { useToast } from '../context/ToastContext'
import { Card, Button, Badge, CodeBadge } from '../components/ui'
import CustomSelect from '../components/CustomSelect'

const MODLAR = [
  { id: 'sorgula', isim: 'Sorgula', Ikon: Search, renk: 'var(--brand-primary)', aciklama: 'Okut, sadece bilgi göster' },
  { id: 'depoya', isim: 'Depoya Çek', Ikon: PackageOpen, renk: 'var(--success)', aciklama: 'Gelen ürünü depoya al' },
  { id: 'teknisyen', isim: 'Teknisyene Ver', Ikon: User, renk: '#8b5cf6', aciklama: 'Depodakini personele zimmetle' },
  { id: 'ariza', isim: 'Arızalı İşaretle', Ikon: Wrench, renk: 'var(--danger)', aciklama: 'Arızalı-depoya düşür' },
]

const DEPOYA_CEKILEBILIR = ['teknisyende', 'sahada', 'arizada', 'arizali_depoda', 'tamirde']
// Badge tone'ları TÜRKÇE tokenlardır — tanımsız ton sessizce griye düşer
const DURUM_TON = { depoda: 'brand', teknisyende: 'beklemede', sahada: 'aktif', arizada: 'kayip', arizali_depoda: 'kayip', tamirde: 'beklemede', hurda: 'neutral' }

export default function StokOkut() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [mod, setMod] = useState('sorgula')
  const [teknisyenId, setTeknisyenId] = useState('')
  const [arizaSebep, setArizaSebep] = useState('diger')
  const [personel, setPersonel] = useState([])
  const [girdi, setGirdi] = useState('')
  const [mesgul, setMesgul] = useState(false)
  const [sonKart, setSonKart] = useState(null)      // en son okutulan kalemin kartı
  const [islemler, setIslemler] = useState([])      // oturum listesi (en yeni üstte)
  const [sesAcik, setSesAcik] = useState(true)
  const inputRef = useRef(null)
  const sonOkunanRef = useRef({ kod: '', zaman: 0 }) // Zebex çift okuma koruması
  // Oturum boyu mükerrer koruması (21.08 kullanıcı isteği): aynı SN'e AYNI
  // İŞLEM bu oturumda uygulandıysa tekrar uygulanmaz — kafa karışmasın.
  // Anahtar MOD+SN: 'depoya çek → sonra teknisyene ver' akışı serbest kalır
  // (farklı iş), yalnız aynı işlemin tekrarı kilitlenir.
  const oturumIslenenRef = useRef(new Map())   // mod:normKod -> saat
  const audioRef = useRef(null)

  // Personel listesi — zimmet alıcıları (tip='zna', silinmemiş, admin hariç)
  useEffect(() => {
    let iptal = false
    ;(async () => {
      const { data } = await supabase
        .from('kullanicilar')
        .select('id, ad, unvan, rol')
        .eq('tip', 'zna')
        .or('hesap_silindi.is.null,hesap_silindi.eq.false')
        .order('ad')
      if (!iptal) setPersonel((data || []).filter(k => k.rol !== 'admin'))
    })()
    return () => { iptal = true }
  }, [])

  // Kiosk: odak HEP giriş alanında — sayfaya tıklanınca bile geri döner
  const odaklan = useCallback(() => {
    // CustomSelect paneli açıkken ya da başka bir giriş alanı odaktayken odağı
    // ÇALMA (21.08: personel seçicinin arama kutusunun odağı çalınıyordu —
    // 'kişi seçiliyor ama kaydedilmiyor' bildirimi).
    setTimeout(() => {
      if (document.querySelector('[data-custom-select-panel]')) return
      const aktif = document.activeElement
      if (aktif && aktif !== inputRef.current &&
          (aktif.tagName === 'INPUT' || aktif.tagName === 'TEXTAREA' || aktif.tagName === 'SELECT')) return
      inputRef.current?.focus()
    }, 50)
  }, [])
  useEffect(() => {
    odaklan()
    const h = () => odaklan()
    window.addEventListener('click', h)
    return () => window.removeEventListener('click', h)
  }, [odaklan])

  const bip = (basarili) => {
    if (!sesAcik) return
    try {
      audioRef.current = audioRef.current || new (window.AudioContext || window.webkitAudioContext)()
      const ctx = audioRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = basarili ? 880 : 220
      gain.gain.value = 0.08
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(); osc.stop(ctx.currentTime + (basarili ? 0.09 : 0.2))
    } catch { /* ses desteklenmiyorsa sessiz devam */ }
  }

  const kaydet = (satir) => {
    setIslemler(prev => [{ ...satir, saat: new Date().toLocaleTimeString('tr-TR'), key: Date.now() + Math.random() }, ...prev].slice(0, 200))
  }

  const isle = async (hamKod) => {
    const kod = String(hamKod || '').trim()
    if (!kod || mesgul) return
    // Çift okuma koruması: aynı kod 2 sn içinde tekrar geldiyse yok say
    const simdi = Date.now()
    if (sonOkunanRef.current.kod === kod && simdi - sonOkunanRef.current.zaman < 2000) return
    sonOkunanRef.current = { kod, zaman: simdi }

    const normAnahtar = (x) => String(x).toUpperCase().replace(/[^A-Z0-9]/g, '')
    const nk = mod + ':' + normAnahtar(kod)
    if (mod !== 'sorgula' && oturumIslenenRef.current.has(nk)) {
      kaydet({ tip: 'atla', sn: kod, mesaj: 'Mükerrer — bu oturumda ' + oturumIslenenRef.current.get(nk) + "'de işlendi" })
      bip(false)
      setGirdi('')
      odaklan()
      return
    }
    setMesgul(true)
    try {
      const { data: rpc, error } = await supabase.rpc('stok_sn_ara', { p_kod: kod })
      if (error) throw new Error(error.message)

      if (!rpc) {
        setSonKart(null)
        kaydet({ tip: 'hata', sn: kod, mesaj: 'Kayıtlı değil — sistemde bulunamadı' })
        bip(false)
        return
      }
      if (rpc.kaynak === 'cihaz') {
        const c = toCamel(rpc.kayit)
        setSonKart({ kaynak: 'cihaz', kalem: c })
        kaydet({ tip: 'bilgi', sn: c.seriNo, mesaj: 'Müşteri cihazı kaydı — stok işlemi uygulanmaz' })
        bip(false)
        return
      }

      const kalem = toCamel(rpc.kayit)
      setSonKart({ kaynak: 'stok', kalem })

      if (mod === 'sorgula') {
        kaydet({ tip: 'ok', sn: kalem.seriNo, mesaj: `${durumBul(kalem.durum)?.isim || kalem.durum} — ${kalem.model || kalem.stokKodu}` })
        bip(true)
        return
      }

      if (mod === 'depoya') {
        if (kalem.durum === 'depoda') {
          kaydet({ tip: 'atla', sn: kalem.seriNo, mesaj: 'Zaten depoda — atlandı' })
          bip(false)
          return
        }
        if (!DEPOYA_CEKILEBILIR.includes(kalem.durum)) {
          kaydet({ tip: 'atla', sn: kalem.seriNo, mesaj: `'${durumBul(kalem.durum)?.isim || kalem.durum}' durumundan çekilemez` })
          bip(false)
          return
        }
        const g = await snDepoyaCek(kalem.id)
        setSonKart({ kaynak: 'stok', kalem: g })
        oturumIslenenRef.current.set(nk, new Date().toLocaleTimeString('tr-TR'))
        kaydet({ tip: 'ok', sn: kalem.seriNo, mesaj: 'Depoya çekildi' })
        bip(true)
        return
      }

      if (mod === 'teknisyen') {
        if (!teknisyenId) {
          kaydet({ tip: 'hata', sn: kalem.seriNo, mesaj: 'Önce personel seçin' })
          toast.error('Teknisyene Ver modu için önce personel seçin.')
          bip(false)
          return
        }
        if (kalem.durum !== 'depoda') {
          kaydet({ tip: 'atla', sn: kalem.seriNo, mesaj: `Depoda değil (${durumBul(kalem.durum)?.isim || kalem.durum}) — önce depoya çekin` })
          bip(false)
          return
        }
        const g = await snTeknisyeneVer(kalem.id, Number(teknisyenId))
        const kisi = personel.find(p => String(p.id) === String(teknisyenId))
        setSonKart({ kaynak: 'stok', kalem: g })
        oturumIslenenRef.current.set(nk, new Date().toLocaleTimeString('tr-TR'))
        kaydet({ tip: 'ok', sn: kalem.seriNo, mesaj: `${kisi?.ad || 'Personele'} verildi` })
        bip(true)
        return
      }

      if (mod === 'ariza') {
        if (kalem.durum === 'arizali_depoda' || kalem.durum === 'arizada') {
          kaydet({ tip: 'atla', sn: kalem.seriNo, mesaj: 'Zaten arızalı — atlandı' })
          bip(false)
          return
        }
        const { kalem: g } = await snArizaliIsaretle(kalem.id, {
          yeniDurum: 'arizali_depoda',
          sebep: arizaSebep,
          aciklama: 'SN Okut ekranından işaretlendi',
          geldigi_teknisyen_id: kalem.teknisyenId || null,
          geldigi_musteri_id: kalem.musteriId || null,
        })
        setSonKart({ kaynak: 'stok', kalem: g ? toCamel(g) : { ...kalem, durum: 'arizali_depoda' } })
        oturumIslenenRef.current.set(nk, new Date().toLocaleTimeString('tr-TR'))
        kaydet({ tip: 'ok', sn: kalem.seriNo, mesaj: 'Arızalı (depoda) işaretlendi' })
        bip(true)
        return
      }
    } catch (e) {
      console.error('[sn okut]', e)
      kaydet({ tip: 'hata', sn: kod, mesaj: e?.message || 'İşlem başarısız' })
      bip(false)
    } finally {
      setMesgul(false)
      setGirdi('')
      odaklan()
    }
  }

  const sayaclar = useMemo(() => ({
    ok: islemler.filter(i => i.tip === 'ok').length,
    atla: islemler.filter(i => i.tip === 'atla').length,
    hata: islemler.filter(i => i.tip === 'hata').length,
  }), [islemler])

  const seciliMod = MODLAR.find(m => m.id === mod)
  const RENK = { ok: 'var(--success)', atla: 'var(--warning)', hata: 'var(--danger)', bilgi: 'var(--brand-primary)' }
  const IKON = { ok: CheckCircle2, atla: Info, hata: AlertTriangle, bilgi: Info }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Başlık */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Button variant="ghost" iconLeft={<ArrowLeft size={14} />} onClick={() => navigate('/stok')}>Stok Kartları</Button>
        <h1 className="t-h2" style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <ScanLine size={20} strokeWidth={1.8} style={{ color: 'var(--brand-primary)' }} />
          SN Okut
        </h1>
        <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
          USB okuyucuyla art arda okutun — seçili işlem otomatik uygulanır
        </span>
        <button
          type="button"
          onClick={() => setSesAcik(s => !s)}
          title={sesAcik ? 'Sesi kapat' : 'Sesi aç'}
          style={{
            marginLeft: 'auto', width: 32, height: 32,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
          }}
        >
          {sesAcik ? <Volume2 size={15} strokeWidth={1.6} /> : <VolumeX size={15} strokeWidth={1.6} />}
        </button>
      </div>

      {/* Mod kartları */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 10 }}>
        {MODLAR.map(({ id, isim, renk, aciklama, ...m }) => {
          const Ikon = m.Ikon
          const secili = mod === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setMod(id)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                background: secili ? `color-mix(in srgb, ${renk} 10%, var(--surface-card))` : 'var(--surface-card)',
                border: `1.5px solid ${secili ? renk : 'var(--border-default)'}`,
                cursor: 'pointer',
              }}
            >
              <Ikon size={18} strokeWidth={1.7} style={{ color: renk, flexShrink: 0, marginTop: 1 }} />
              <span>
                <span style={{ display: 'block', font: `${secili ? 700 : 500} 13.5px/18px var(--font-sans)`, color: secili ? renk : 'var(--text-primary)' }}>{isim}</span>
                <span style={{ display: 'block', font: '400 11px/15px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 1 }}>{aciklama}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Mod parametreleri */}
      {mod === 'teknisyen' && (
        <div style={{ marginBottom: 10, maxWidth: 340 }}>
          <CustomSelect value={teknisyenId} onChange={e => setTeknisyenId(e.target.value)}>
            <option value="">— Zimmetlenecek personeli seçin —</option>
            {personel.map(p => <option key={p.id} value={p.id}>{p.ad}{p.unvan ? ` · ${p.unvan}` : ''}</option>)}
          </CustomSelect>
        </div>
      )}
      {mod === 'ariza' && (
        <div style={{ marginBottom: 10, maxWidth: 340 }}>
          <CustomSelect value={arizaSebep} onChange={e => setArizaSebep(e.target.value)}>
            {ARIZA_SEBEPLERI.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
          </CustomSelect>
        </div>
      )}

      {/* Okutma alanı — kiosk odağı */}
      <Card padding={0} style={{ marginBottom: 10, border: `1.5px solid ${seciliMod?.renk || 'var(--border-default)'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px' }}>
          <ScanLine size={22} strokeWidth={1.8} style={{ color: seciliMod?.renk, flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={girdi}
            onChange={e => setGirdi(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') isle(girdi) }}
            placeholder={mesgul ? 'İşleniyor…' : 'Barkodu okutun ya da S/N yazıp Enter…'}
            disabled={mesgul}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              font: '600 20px/28px var(--font-mono, monospace)',
              color: 'var(--text-primary)', letterSpacing: 0.5,
            }}
          />
          <Button variant="primary" onClick={() => isle(girdi)} disabled={mesgul || !girdi.trim()}>
            {mesgul ? 'İşleniyor…' : 'Uygula'}
          </Button>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 380px)', gap: 12, alignItems: 'start' }}>
        {/* Sol: işlem listesi */}
        <Card padding={0}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            borderBottom: '1px solid var(--border-default)',
          }}>
            <span style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>Bu Oturumda</span>
            <Badge tone="aktif">{sayaclar.ok} işlendi</Badge>
            {sayaclar.atla > 0 && <Badge tone="beklemede">{sayaclar.atla} atlandı</Badge>}
            {sayaclar.hata > 0 && <Badge tone="kayip">{sayaclar.hata} hata</Badge>}
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {islemler.length === 0 ? (
              <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-tertiary)', padding: 20, textAlign: 'center' }}>
                Henüz okutma yok — okuyucuyu giriş alanına odaklayıp başlayın.
              </p>
            ) : islemler.map(i => {
              const Ikon = IKON[i.tip] || Info
              return (
                <div key={i.key} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 14px', borderBottom: '1px solid var(--border-default)',
                }}>
                  <Ikon size={14} strokeWidth={1.8} style={{ color: RENK[i.tip], flexShrink: 0 }} />
                  <CodeBadge>{i.sn}</CodeBadge>
                  <span style={{ flex: 1, minWidth: 0, font: '400 12.5px/17px var(--font-sans)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i.mesaj}
                  </span>
                  <span style={{ font: '400 11px/15px var(--font-sans)', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {i.saat}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Sağ: son okutulan kart */}
        <Card padding={14}>
          <p className="t-label" style={{ marginBottom: 8 }}>SON OKUTULAN</p>
          {!sonKart ? (
            <p style={{ font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-tertiary)', margin: 0 }}>
              Okutulan kalemin ayrıntısı burada görünür.
            </p>
          ) : sonKart.kaynak === 'cihaz' ? (
            <div>
              <CodeBadge>{sonKart.kalem.seriNo}</CodeBadge>
              <p style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)', margin: '8px 0 2px' }}>
                {sonKart.kalem.model || sonKart.kalem.cihazAdi || 'Müşteri cihazı'}
              </p>
              <Badge tone="beklemede">Müşteri cihazı kaydı</Badge>
              <p style={{ font: '400 12px/17px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 8 }}>
                Bu SN, Arızalı Ürünler / müşteri cihaz envanterinde — stok işlemi uygulanmaz.
              </p>
            </div>
          ) : (
            <SonKalemKarti
              k={sonKart.kalem}
              mod={mod}
              mesgul={mesgul}
              onDepoyaCek={async (k) => {
                try {
                  const g = await snDepoyaCek(k.id)
                  setSonKart({ kaynak: 'stok', kalem: g })
                  kaydet({ tip: 'ok', sn: k.seriNo, mesaj: 'Depoya çekildi' })
                  bip(true)
                } catch (e) {
                  kaydet({ tip: 'hata', sn: k.seriNo, mesaj: e?.message || 'İşlem başarısız' })
                  bip(false)
                }
                odaklan()
              }}
              onModelDetay={(k) => navigate(`/stok/model/${encodeURIComponent(k.stokKodu)}`)}
            />
          )}
        </Card>
      </div>
    </div>
  )
}

// Son okutulan kalem kartı — ayrı bileşen: ref kullanan yardımcıları (bip/odaklan)
// render içi IIFE'den çağırmak react-hooks/refs kuralına takılıyordu.
function SonKalemKarti({ k, mod, mesgul, onDepoyaCek, onModelDetay }) {
  const d = durumBul(k.durum)
  return (
                <div>
                  <CodeBadge>{k.seriNo}</CodeBadge>
                  <p style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)', margin: '8px 0 2px' }}>
                    {[k.marka, k.model].filter(Boolean).join(' · ') || k.stokKodu}
                  </p>
                  <p style={{ font: '400 11.5px/16px var(--font-sans)', color: 'var(--text-tertiary)', margin: '0 0 8px' }}>{k.stokKodu}</p>
                  {d && <Badge tone={DURUM_TON[d.id] || 'neutral'}>{d.isim}</Badge>}
                  {/* Sorgula modunda hızlı tekil işlemler */}
                  {mod === 'sorgula' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                      {k.durum !== 'depoda' && DEPOYA_CEKILEBILIR.includes(k.durum) && (
                        <Button size="sm" variant="secondary" iconLeft={<PackageOpen size={13} />} disabled={mesgul}
                          onClick={() => onDepoyaCek(k)}>
                          Depoya Çek
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" iconLeft={<ScanLine size={13} />}
                        onClick={() => onModelDetay(k)}>
                        Model Detayına Git
                      </Button>
                    </div>
                  )}
                </div>
  )
}
