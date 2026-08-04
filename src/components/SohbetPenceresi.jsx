// Sağ altta mini sohbet penceresi — "bir sayfada çalışırken aynı zamanda
// oradan sohbeti sürdürmek" (kullanıcı talebi, 31.07).
//
// MİMARİ ŞARTLAR (keşifle doğrulandı):
//  • MainLayout'ta <Routes>'un DIŞINDA render edilir → route değişiminde
//    unmount olmaz, açık sohbet ve yazılan metin korunur.
//  • FloatingSohbetButton'ın İÇİNE konmaz: o buton /chat, /yazdir, /p/
//    sayfalarında erken return yapıyor; pencere de onunla birlikte kaybolurdu.
//  • Backdrop YOK. Zeyna panelindeki `position:fixed; inset:0` katmanı
//    sayfayı tıklanamaz yapıyor — burada amaç tam tersi: arkada çalışmaya
//    devam edebilmek.
//  • Durum ChatContext'te tutulur; veri zaten orada ve ileride başka
//    ekranlardan da pencereAc() çağrılabilsin.
//
// z-index 960: Sohbet FAB'ı (950) örter, Zeyna backdrop'unun (980) altında
// kalır — iki panel aynı anda açıkken görsel kargaşa olmaz.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, X, Minus, Send, Maximize2, Search, Users, Paperclip } from 'lucide-react'
import { useChat } from '../context/ChatContext'
import { useAuth } from '../context/AuthContext'

const GENISLIK = 340
const DURUM_RENK = {
  cevrimici: 'var(--success)',
  mesgul: 'var(--danger)',
  disarida: 'var(--warning)',
  toplantida: 'var(--brand-primary)',
  cevrimdisi: 'var(--text-tertiary)',
}

const dosyaMesajiMi = (icerik) => {
  try { return JSON.parse(icerik)?.tip === 'dosya' } catch { return false }
}
const dosyaAdi = (icerik) => {
  try { return JSON.parse(icerik)?.dosyaAd || 'Dosya' } catch { return 'Dosya' }
}
const saat = (t) => {
  if (!t) return ''
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const kucuk = (s) => (s || '').toLocaleLowerCase('tr')

export default function SohbetPenceresi() {
  const navigate = useNavigate()
  const { kullanici, kullanicilar } = useAuth()
  const {
    pencereAcik, pencereHedef, pencereKucuk,
    pencereKapat, pencereKucult, pencereHedefSec,
    sohbetler, konusmaGetir, grupMesajlari, mesajGonder,
    mesajlariOku, grubuOku, aktifKonusmaAyarla,
    okunmamisSay, grupOkunmamisSay, efektifDurum,
    taslakBildir,
  } = useChat()

  const [metin, setMetin] = useState('')

  // Yazı kutusunda metin varken ChatContext'e bildir: gelen mesaj pencereyi
  // BAŞKA kişiye çevirip yazılanı yanlış alıcıya göndermesin (04.08 otomatik
  // pencere açma özelliğinin veri kaybı koruması).
  useEffect(() => { taslakBildir?.(metin.trim().length > 0) }, [metin, taslakBildir])
  const [arama, setArama] = useState('')
  const sonRef = useRef(null)

  // Yazışılabilir kişiler — Chat.jsx ile AYNI kural: müşteri portal hesabı
  // ancak daha önce birebir sohbeti varsa listelenir.
  const yazismaliIdler = useMemo(() => new Set(
    (sohbetler || [])
      .filter(s => s.tip === 'birebir')
      .flatMap(s => s.katilimcilar || [])
      .filter(id => id !== kullanici?.id)
  ), [sohbetler, kullanici?.id])

  const kisiler = useMemo(() => (kullanicilar || []).filter(k =>
    k.id !== kullanici?.id && (k.tip !== 'musteri' || yazismaliIdler.has(k.id))
  ), [kullanicilar, kullanici?.id, yazismaliIdler])

  const gruplar = useMemo(() => (sohbetler || []).filter(s => s.tip === 'grup'), [sohbetler])

  // Liste sırası: okunmamışı olanlar üstte, sonra ada göre
  const listeKisiler = useMemo(() => {
    const q = kucuk(arama).trim()
    return kisiler
      .filter(k => !q || kucuk(k.ad).includes(q))
      .map(k => ({ ...k, _okunmamis: okunmamisSay(k.id) }))
      .sort((a, b) => (b._okunmamis - a._okunmamis) || (a.ad || '').localeCompare(b.ad || '', 'tr'))
  }, [kisiler, arama, okunmamisSay])

  const listeGruplar = useMemo(() => {
    const q = kucuk(arama).trim()
    return gruplar
      .filter(g => !q || kucuk(g.ad).includes(q))
      .map(g => ({ ...g, _okunmamis: grupOkunmamisSay(g.id) }))
      .sort((a, b) => (b._okunmamis - a._okunmamis) || (a.ad || '').localeCompare(b.ad || '', 'tr'))
  }, [gruplar, arama, grupOkunmamisSay])

  const grup = pencereHedef?.tip === 'grup'
  const secili = pencereHedef
    ? (grup ? gruplar.find(g => g.id === pencereHedef.id) : kisiler.find(k => k.id === pencereHedef.id))
    : null

  const konusma = useMemo(() => {
    if (!pencereHedef) return []
    return grup ? grupMesajlari(pencereHedef.id) : konusmaGetir(pencereHedef.id)
  }, [pencereHedef, grup, grupMesajlari, konusmaGetir])

  // Açık sohbet = "zaten bakıyorum" → bu sohbetin mesajı için toast/ses çıkmaz
  useEffect(() => {
    if (!pencereAcik || pencereKucuk || !pencereHedef) { aktifKonusmaAyarla?.(null); return }
    aktifKonusmaAyarla?.(`${grup ? 'g' : 'k'}:${pencereHedef.id}`)
    return () => aktifKonusmaAyarla?.(null)
  }, [pencereAcik, pencereKucuk, pencereHedef, grup, aktifKonusmaAyarla])

  // Okundu işaretle — pencere açık VE küçültülmemişken
  useEffect(() => {
    if (!pencereAcik || pencereKucuk || !pencereHedef) return
    if (grup) grubuOku(pencereHedef.id)
    else mesajlariOku(pencereHedef.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pencereAcik, pencereKucuk, pencereHedef?.id, grup, konusma.length])

  useEffect(() => {
    if (pencereAcik && !pencereKucuk) sonRef.current?.scrollIntoView({ block: 'end' })
  }, [konusma.length, pencereAcik, pencereKucuk, pencereHedef?.id])

  if (!pencereAcik) return null

  const gonder = () => {
    if (!metin.trim() || !pencereHedef) return
    mesajGonder(
      grup ? { tip: 'grup', sohbetId: pencereHedef.id } : { tip: 'kisi', kisiId: pencereHedef.id },
      metin,
    )
    setMetin('')
  }

  const baslik = secili?.ad || (pencereHedef ? 'Sohbet' : 'Sohbetler')
  const durum = !grup && secili ? efektifDurum(secili) : null

  // ---- Küçültülmüş şerit ----
  if (pencereKucuk) {
    const toplam = listeKisiler.reduce((a, k) => a + k._okunmamis, 0)
      + listeGruplar.reduce((a, g) => a + g._okunmamis, 0)
    return (
      <div style={{ ...KABUK, height: 44, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8, cursor: 'pointer' }}
        onClick={() => pencereKucult(false)}>
        <span style={{ font: '600 13px/1 var(--font-sans)', color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {baslik}
        </span>
        {toplam > 0 && <Rozet sayi={toplam} />}
        <button onClick={(e) => { e.stopPropagation(); pencereKapat() }} style={IKON_BTN} title="Kapat">
          <X size={15} strokeWidth={1.8} />
        </button>
      </div>
    )
  }

  return (
    <div style={{ ...KABUK, height: 'min(520px, calc(100vh - 120px))', display: 'flex', flexDirection: 'column' }}>
      {/* Başlık */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '9px 8px 9px 10px',
        borderBottom: '1px solid var(--border-default)', background: 'var(--surface-sunken)',
        borderRadius: '10px 10px 0 0',
      }}>
        {pencereHedef && (
          <button onClick={() => pencereHedefSec(null)} style={IKON_BTN} title="Sohbetlere dön">
            <ArrowLeft size={16} strokeWidth={1.8} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '600 13px/16px var(--font-sans)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {grup && <Users size={11} strokeWidth={2} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />}
            {baslik}
          </div>
          {durum && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: DURUM_RENK[durum] || DURUM_RENK.cevrimdisi }} />
              <span style={{ font: '400 10.5px/12px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                {durum === 'cevrimici' ? 'Çevrimiçi' : durum === 'mesgul' ? 'Meşgul'
                  : durum === 'disarida' ? 'Dışarıda' : durum === 'toplantida' ? 'Toplantıda' : 'Çevrimdışı'}
              </span>
            </div>
          )}
        </div>
        <button onClick={() => { pencereKapat(); navigate('/chat') }} style={IKON_BTN} title="Tam sayfada aç">
          <Maximize2 size={14} strokeWidth={1.8} />
        </button>
        <button onClick={() => pencereKucult(true)} style={IKON_BTN} title="Küçült">
          <Minus size={16} strokeWidth={1.8} />
        </button>
        <button onClick={pencereKapat} style={IKON_BTN} title="Kapat">
          <X size={16} strokeWidth={1.8} />
        </button>
      </div>

      {!pencereHedef ? (
        /* ---- Sohbet listesi ---- */
        <>
          <div style={{ padding: 8, borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} strokeWidth={1.6}
                style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input value={arama} onChange={e => setArama(e.target.value)} placeholder="Kişi veya grup ara"
                style={{
                  width: '100%', height: 30, paddingLeft: 26, paddingRight: 8,
                  borderRadius: 6, border: '1px solid var(--border-default)',
                  background: 'var(--surface-card)', color: 'var(--text-primary)',
                  font: '400 12px/1 var(--font-sans)', outline: 'none',
                }} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {listeGruplar.length === 0 && listeKisiler.length === 0 ? (
              <div style={{ padding: 16, font: '400 12px/17px var(--font-sans)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                Eşleşen kişi veya grup yok.
              </div>
            ) : (
              <>
                {listeGruplar.map(g => (
                  <SatirDugmesi key={`g${g.id}`} ad={g.ad} ikon={<Users size={13} strokeWidth={1.8} />}
                    okunmamis={g._okunmamis} onClick={() => pencereHedefSec({ tip: 'grup', id: g.id })} />
                ))}
                {listeKisiler.map(k => (
                  <SatirDugmesi key={`k${k.id}`} ad={k.ad} okunmamis={k._okunmamis}
                    nokta={DURUM_RENK[efektifDurum(k)] || DURUM_RENK.cevrimdisi}
                    onClick={() => pencereHedefSec({ tip: 'kisi', id: k.id })} />
                ))}
              </>
            )}
          </div>
        </>
      ) : (
        /* ---- Sohbet ---- */
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {konusma.length === 0 ? (
              <div style={{ margin: 'auto', font: '400 12px/17px var(--font-sans)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                Henüz mesaj yok.<br />İlk mesajı siz yazın.
              </div>
            ) : konusma.map(m => {
              const benim = m.gondericiId === kullanici?.id
              const dosya = dosyaMesajiMi(m.icerik)
              const gonderenAd = grup && !benim
                ? (kullanicilar?.find(k => k.id === m.gondericiId)?.ad || '?')
                : null
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: benim ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '82%', padding: '6px 9px', borderRadius: 10,
                    background: benim ? 'var(--brand-primary)' : 'var(--surface-sunken)',
                    color: benim ? '#fff' : 'var(--text-primary)',
                    border: benim ? 'none' : '1px solid var(--border-subtle)',
                  }}>
                    {gonderenAd && (
                      <div style={{ font: '600 10.5px/13px var(--font-sans)', color: 'var(--brand-primary)', marginBottom: 2 }}>
                        {gonderenAd}
                      </div>
                    )}
                    {dosya ? (
                      /* Dosya önizleme/indirme tam sayfada — mini pencerede yalnız işaret */
                      <button onClick={() => { pencereKapat(); navigate('/chat') }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
                          padding: 0, cursor: 'pointer', color: 'inherit',
                          font: '500 12px/16px var(--font-sans)', textDecoration: 'underline',
                        }}>
                        <Paperclip size={12} strokeWidth={1.8} /> {dosyaAdi(m.icerik)}
                      </button>
                    ) : (
                      <div style={{ font: '400 12.5px/17px var(--font-sans)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {m.icerik}
                      </div>
                    )}
                    <div style={{
                      font: '400 9.5px/12px var(--font-sans)', marginTop: 2, textAlign: 'right',
                      color: benim ? 'rgba(255,255,255,.75)' : 'var(--text-tertiary)',
                    }}>
                      {saat(m.tarih)}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={sonRef} />
          </div>

          <div style={{ display: 'flex', gap: 6, padding: 8, borderTop: '1px solid var(--border-default)' }}>
            <textarea
              value={metin}
              onChange={e => setMetin(e.target.value)}
              onKeyDown={e => {
                // Enter gönderir, Shift+Enter alt satır — sohbet kutusu alışkanlığı
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); gonder() }
              }}
              placeholder="Mesaj yazın…"
              rows={1}
              style={{
                flex: 1, resize: 'none', maxHeight: 80, padding: '7px 9px',
                borderRadius: 8, border: '1px solid var(--border-default)',
                background: 'var(--surface-card)', color: 'var(--text-primary)',
                font: '400 12.5px/17px var(--font-sans)', outline: 'none',
              }}
            />
            <button onClick={gonder} disabled={!metin.trim()}
              title="Gönder (Enter)"
              style={{
                width: 34, height: 34, borderRadius: 8, border: 'none', flexShrink: 0,
                background: metin.trim() ? 'var(--brand-primary)' : 'var(--surface-sunken)',
                color: metin.trim() ? '#fff' : 'var(--text-tertiary)',
                cursor: metin.trim() ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <Send size={15} strokeWidth={1.8} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------- Parçalar ----------------

const KABUK = {
  position: 'fixed',
  right: 96,          // Sohbet FAB'ı (right 24, 56px) ve rozeti kapanmasın
  bottom: 24,
  width: GENISLIK,
  maxWidth: 'calc(100vw - 32px)',
  zIndex: 960,        // FAB 950 üstü, Zeyna backdrop 980 altı
  background: 'var(--surface-card)',
  border: '1px solid var(--border-default)',
  borderRadius: 10,
  boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,.18))',
  overflow: 'hidden',
}

const IKON_BTN = {
  width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent',
  color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

function Rozet({ sayi }) {
  return (
    <span style={{
      minWidth: 17, height: 17, padding: '0 4px', borderRadius: 9,
      background: 'var(--danger)', color: '#fff',
      font: '700 10px/17px var(--font-sans)', textAlign: 'center', flexShrink: 0,
    }}>
      {sayi > 99 ? '99+' : sayi}
    </span>
  )
}

function SatirDugmesi({ ad, ikon, nokta, okunmamis, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '8px 10px', border: 'none', borderBottom: '1px solid var(--border-subtle)',
        background: 'transparent', cursor: 'pointer', textAlign: 'left',
      }}>
      {ikon
        ? <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}>{ikon}</span>
        : <span style={{ width: 8, height: 8, borderRadius: '50%', background: nokta, flexShrink: 0 }} />}
      <span style={{
        flex: 1, minWidth: 0, font: `${okunmamis ? 600 : 400} 12.5px/17px var(--font-sans)`,
        color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {ad}
      </span>
      {okunmamis > 0 && <Rozet sayi={okunmamis} />}
    </button>
  )
}
