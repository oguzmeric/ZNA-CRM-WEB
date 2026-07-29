import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import {
  Paperclip, Send, MessageSquare, FileText, FileSpreadsheet, FileImage, FileArchive, File,
  Trash2, Users, UserPlus, LogOut, Smile, Plus,
} from 'lucide-react'
import { Avatar, Button, Textarea, EmptyState, Modal, Input, Label, Select } from '../components/ui'
import CokluSelect from '../components/CokluSelect'
import EmojiSecici from '../components/EmojiSecici'

const durumRenk = {
  cevrimici:    'var(--success)',
  mesgul:       'var(--danger)',
  disarida:     'var(--warning)',
  toplantida:   'var(--brand-primary)',
  cevrimdisi:   'var(--text-tertiary)',
}
const durumIsim = {
  cevrimici: 'Çevrimiçi', mesgul: 'Meşgul', disarida: 'Dışarıda',
  toplantida: 'Toplantıda', cevrimdisi: 'Çevrimdışı',
}

const dosyaIcon = (tip) => {
  if (!tip) return File
  if (tip.includes('pdf')) return FileText
  if (tip.includes('excel') || tip.includes('spreadsheet') || tip.includes('xlsx')) return FileSpreadsheet
  if (tip.includes('word') || tip.includes('document')) return FileText
  if (tip.includes('image')) return FileImage
  if (tip.includes('zip') || tip.includes('rar')) return FileArchive
  return File
}

const isDosyaMesaj = (icerik) => {
  try {
    const p = JSON.parse(icerik)
    return p.tip === 'dosya'
  } catch { return false }
}

// Sadece emojiden oluşan kısa mesajlar büyük gösterilir (WhatsApp/Slack davranışı)
const sadeceEmojiMi = (metin = '') => {
  const t = metin.trim()
  if (!t || t.length > 24) return false
  try {
    if (!/^(\p{Extended_Pictographic}|\p{Emoji_Component}|️|‍|\s)+$/u.test(t)) return false
  } catch { return false }   // eski tarayıcıda Unicode property yoksa sessizce vazgeç
  return [...t.replace(/\s/g, '')].length > 0
}

const saatFormat = (tarih) =>
  new Date(tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

const dosyaBoyutFormat = (b) => {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function Chat() {
  const { kullanici, kullanicilar } = useAuth()
  const {
    mesajGonder, konusmaGetir, grupMesajlari, mesajlariOku, grubuOku,
    okunmamisSay, grupOkunmamisSay, aktifKonusmaAyarla, efektifDurum,
    mesajSil, sohbetiSil, sohbetler, grupOlustur, grubaKisiEkle, gruptanAyril,
  } = useChat()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  // secili: { tip: 'kisi' | 'grup', id }
  const [secili, setSecili] = useState(null)
  const [yeniMesaj, setYeniMesaj] = useState('')
  const [emojiAcik, setEmojiAcik] = useState(false)
  const [grupModal, setGrupModal] = useState(false)
  const [grupAd, setGrupAd] = useState('')
  const [grupUyeler, setGrupUyeler] = useState([])
  const [grupKaydediliyor, setGrupKaydediliyor] = useState(false)
  const [kisiEkleModal, setKisiEkleModal] = useState(false)
  const [eklenecekKisi, setEklenecekKisi] = useState('')
  const mesajSonuRef = useRef(null)
  const dosyaInputRef = useRef(null)
  const metinRef = useRef(null)

  // Sadece personel (ZNA) ile mesajlasilir — musteriler chat listesine girmez
  const digerKullanicilar = kullanicilar.filter(k => k.id !== kullanici?.id && k.tip !== 'musteri')
  const gruplar = useMemo(() => sohbetler.filter(s => s.tip === 'grup'), [sohbetler])

  const seciliKisi = secili?.tip === 'kisi' ? digerKullanicilar.find(k => k.id === secili.id) : null
  const seciliGrup = secili?.tip === 'grup' ? gruplar.find(g => g.id === secili.id) : null

  const konusma = secili
    ? (secili.tip === 'grup' ? grupMesajlari(secili.id) : konusmaGetir(secili.id))
    : []

  const kisiAd = (id) => kullanicilar.find(k => k.id === id)?.ad || 'Bilinmeyen'

  useEffect(() => {
    if (!secili) return
    if (secili.tip === 'kisi') mesajlariOku(secili.id)
    else grubuOku(secili.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secili?.tip, secili?.id, konusma.length])

  useEffect(() => () => aktifKonusmaAyarla?.(null), [aktifKonusmaAyarla])
  useEffect(() => { mesajSonuRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [konusma.length])

  // Seçili grup silinirse/ayrıldıysak seçimi bırak
  useEffect(() => {
    if (secili?.tip === 'grup' && !gruplar.some(g => g.id === secili.id)) setSecili(null)
  }, [gruplar, secili])

  const gonder = () => {
    if (!yeniMesaj.trim() || !secili) return
    mesajGonder(
      secili.tip === 'grup' ? { tip: 'grup', sohbetId: secili.id } : { tip: 'kisi', kisiId: secili.id },
      yeniMesaj,
    )
    setYeniMesaj('')
    setEmojiAcik(false)
  }

  const emojiEkle = (e) => {
    const ta = metinRef.current
    if (!ta) { setYeniMesaj(p => p + e); return }
    const bas = ta.selectionStart ?? yeniMesaj.length
    const son = ta.selectionEnd ?? yeniMesaj.length
    setYeniMesaj(yeniMesaj.slice(0, bas) + e + yeniMesaj.slice(son))
    requestAnimationFrame(() => {
      ta.focus()
      const p = bas + e.length
      ta.setSelectionRange(p, p)
    })
  }

  // Tek mesaj sil — yalnız kendi mesajın
  const mesajSilTikla = async (id) => {
    const onay = await confirm({
      baslik: 'Mesajı Sil',
      mesaj: 'Bu mesaj karşı taraftan da kalkacak. Emin misin?',
      onayMetin: 'Sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    const r = await mesajSil(id)
    if (r?.__error) toast.error('Mesaj silinemedi: ' + r.__error)
  }

  // Sohbeti sil — SADECE benden; karşı tarafta durur, yeni mesajla geri gelir
  const sohbetiSilTikla = async () => {
    if (!secili) return
    const ad = seciliGrup ? seciliGrup.ad : seciliKisi?.ad
    const onay = await confirm({
      baslik: 'Sohbeti Sil',
      mesaj: `${ad} sohbeti SENİN ekranından kaldırılacak. Diğer katılımcılarda kalmaya devam eder; yeni mesaj gelince sohbet geri gelir (eski mesajlar gizli kalır).`,
      onayMetin: 'Sohbeti sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    const r = await sohbetiSil(
      secili.tip === 'grup' ? { tip: 'grup', sohbetId: secili.id } : { tip: 'kisi', kisiId: secili.id },
    )
    if (r?.__error) { toast.error('Sohbet silinemedi: ' + r.__error); return }
    toast.success('Sohbet temizlendi.')
    setSecili(null)
  }

  const gruptanAyrilTikla = async () => {
    if (!seciliGrup) return
    const onay = await confirm({
      baslik: 'Gruptan Ayrıl',
      mesaj: `"${seciliGrup.ad}" grubundan ayrılacaksın. Yeni mesajları görmezsin; tekrar eklenmen için grup üyelerinden birinin seni eklemesi gerekir.`,
      onayMetin: 'Ayrıl', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    const r = await gruptanAyril(seciliGrup.id)
    if (r?.__error) { toast.error('Ayrılamadın: ' + r.__error); return }
    toast.success('Gruptan ayrıldın.')
    setSecili(null)
  }

  const grupKaydet = async () => {
    if (!grupAd.trim()) { toast.error('Grup adı gerekli'); return }
    if (grupUyeler.length === 0) { toast.error('En az bir kişi seç'); return }
    setGrupKaydediliyor(true)
    const r = await grupOlustur(grupAd.trim(), grupUyeler)
    setGrupKaydediliyor(false)
    if (r?.__error) { toast.error('Grup oluşturulamadı: ' + r.__error); return }
    toast.success('Grup oluşturuldu.')
    setGrupModal(false); setGrupAd(''); setGrupUyeler([])
    if (r?.sohbetId) setSecili({ tip: 'grup', id: r.sohbetId })
  }

  const kisiEkleKaydet = async () => {
    if (!seciliGrup || !eklenecekKisi) return
    const r = await grubaKisiEkle(seciliGrup.id, Number(eklenecekKisi))
    if (r?.__error) { toast.error('Kişi eklenemedi: ' + r.__error); return }
    toast.success('Kişi gruba eklendi.')
    setKisiEkleModal(false); setEklenecekKisi('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); gonder() }
  }

  const dosyaSecildi = (e) => {
    const dosya = e.target.files[0]
    if (!dosya || !secili) return
    if (dosya.size > 5 * 1024 * 1024) { toast.error('Dosya boyutu 5 MB\'dan büyük olamaz.'); return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      mesajGonder(
        secili.tip === 'grup' ? { tip: 'grup', sohbetId: secili.id } : { tip: 'kisi', kisiId: secili.id },
        JSON.stringify({
          tip: 'dosya', dosyaAdi: dosya.name, dosyaTipi: dosya.type,
          dosyaBoyutu: dosya.size, dosyaData: ev.target.result,
        }),
      )
    }
    reader.readAsDataURL(dosya)
    e.target.value = ''
  }

  const dosyaIndir = (icerik) => {
    try {
      const d = JSON.parse(icerik)
      const link = document.createElement('a')
      link.href = d.dosyaData; link.download = d.dosyaAdi; link.click()
    } catch {}
  }

  const tarihFormat = (tarih) => {
    const bugun = new Date()
    const m = new Date(tarih)
    if (m.toDateString() === bugun.toDateString()) return 'Bugün'
    return m.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
  }

  const grupluMesajlar = () => {
    const gruplanmis = []
    let sonTarih = null
    konusma.forEach(m => {
      const t = tarihFormat(m.tarih)
      if (t !== sonTarih) { gruplanmis.push({ tip: 'tarih', tarih: t }); sonTarih = t }
      gruplanmis.push({ tip: 'mesaj', ...m })
    })
    return gruplanmis
  }

  const grupUyeAdlari = (g) => (g?.katilimcilar || [])
    .filter(id => id !== kullanici?.id)
    .map(kisiAd)

  const acikSohbetVar = !!(seciliKisi || seciliGrup)

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', background: 'var(--surface-card)' }}>

      {/* Sol panel: gruplar + kişiler */}
      <div style={{
        width: 280, flexShrink: 0,
        background: 'var(--surface-card)',
        borderRight: '1px solid var(--border-default)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--border-default)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 className="t-h2" style={{ margin: 0 }}>Mesajlar</h2>
            <p className="t-caption" style={{ marginTop: 2 }}>
              <span className="tabular-nums">{digerKullanicilar.length}</span> kişi
              {gruplar.length > 0 && <> · <span className="tabular-nums">{gruplar.length}</span> grup</>}
            </p>
          </div>
          <button
            onClick={() => setGrupModal(true)}
            title="Yeni grup sohbeti"
            style={{
              flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'var(--brand-primary)', color: '#fff', border: 'none',
              borderRadius: 'var(--radius-sm)', padding: '6px 10px', cursor: 'pointer',
              font: '600 11px/16px var(--font-sans)',
            }}
          >
            <Plus size={12} strokeWidth={2} /> Grup Sohbeti
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* ── Gruplar ── */}
          {gruplar.length > 0 && (
            <>
              <div style={baslikSeridi}>Gruplar</div>
              {gruplar.map(g => {
                const okunmamis = grupOkunmamisSay(g.id)
                const sonMesaj = grupMesajlari(g.id).slice(-1)[0]
                const aktif = secili?.tip === 'grup' && secili.id === g.id
                const uyeler = grupUyeAdlari(g)
                return (
                  <div
                    key={`g-${g.id}`}
                    onClick={() => setSecili({ tip: 'grup', id: g.id })}
                    style={satirStil(aktif)}
                    onMouseEnter={e => { if (!aktif) e.currentTarget.style.background = 'var(--surface-sunken)' }}
                    onMouseLeave={e => { if (!aktif) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 'var(--radius-sm)',
                        background: 'var(--brand-primary-soft)', color: 'var(--brand-primary)',
                        display: 'grid', placeItems: 'center',
                      }}>
                        <Users size={17} strokeWidth={1.6} />
                      </div>
                      {okunmamis > 0 && <span style={rozetStil}>{okunmamis}</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        font: okunmamis > 0 ? '600 13px/18px var(--font-sans)' : '500 13px/18px var(--font-sans)',
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {g.ad}
                      </div>
                      <div style={{
                        font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {uyeler.length} kişi · {uyeler.slice(0, 2).join(', ')}{uyeler.length > 2 ? '…' : ''}
                      </div>
                      {sonMesaj && (
                        <div style={onizlemeStil}>
                          {sonMesaj.gondericiId === kullanici?.id ? 'Sen: ' : `${kisiAd(sonMesaj.gondericiId).split(' ')[0]}: `}
                          {isDosyaMesaj(sonMesaj.icerik) ? 'Dosya' : sonMesaj.icerik}
                        </div>
                      )}
                    </div>
                    {sonMesaj && <span style={saatStil}>{saatFormat(sonMesaj.tarih)}</span>}
                  </div>
                )
              })}
            </>
          )}

          {/* ── Kişiler ── */}
          {gruplar.length > 0 && <div style={baslikSeridi}>Kişiler</div>}
          {digerKullanicilar.map(k => {
            const okunmamis = okunmamisSay(k.id)
            const sonMesaj = konusmaGetir(k.id).slice(-1)[0]
            const aktif = secili?.tip === 'kisi' && secili.id === k.id
            const kisiDurum = efektifDurum(k)
            const sonMesajMetin = sonMesaj
              ? isDosyaMesaj(sonMesaj.icerik) ? 'Dosya' : sonMesaj.icerik
              : ''

            return (
              <div
                key={k.id}
                onClick={() => setSecili({ tip: 'kisi', id: k.id })}
                style={satirStil(aktif)}
                onMouseEnter={e => { if (!aktif) e.currentTarget.style.background = 'var(--surface-sunken)' }}
                onMouseLeave={e => { if (!aktif) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <Avatar name={k.ad} size="md" />
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute', bottom: -1, right: -1,
                      width: 10, height: 10, borderRadius: '50%',
                      background: durumRenk[kisiDurum],
                      border: '2px solid var(--surface-card)',
                    }}
                  />
                  {okunmamis > 0 && <span style={rozetStil}>{okunmamis}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    font: okunmamis > 0 ? '600 13px/18px var(--font-sans)' : '500 13px/18px var(--font-sans)',
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {k.ad}
                  </div>
                  <div style={{ font: '400 11px/14px var(--font-sans)', color: durumRenk[kisiDurum] }}>
                    {durumIsim[kisiDurum]}
                  </div>
                  {sonMesajMetin && (
                    <div style={onizlemeStil}>
                      {sonMesaj.gondericiId === kullanici?.id ? 'Sen: ' : ''}{sonMesajMetin}
                    </div>
                  )}
                </div>
                {sonMesaj && <span style={saatStil}>{saatFormat(sonMesaj.tarih)}</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Konuşma alanı */}
      {acikSohbetVar ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 20px',
            background: 'var(--surface-card)',
            borderBottom: '1px solid var(--border-default)',
          }}>
            {seciliGrup ? (
              <div style={{
                width: 36, height: 36, borderRadius: 'var(--radius-sm)', flexShrink: 0,
                background: 'var(--brand-primary-soft)', color: 'var(--brand-primary)',
                display: 'grid', placeItems: 'center',
              }}>
                <Users size={17} strokeWidth={1.6} />
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <Avatar name={seciliKisi.ad} size="md" />
                <span
                  aria-hidden
                  style={{
                    position: 'absolute', bottom: -1, right: -1,
                    width: 10, height: 10, borderRadius: '50%',
                    background: durumRenk[efektifDurum(seciliKisi)],
                    border: '2px solid var(--surface-card)',
                  }}
                />
              </div>
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
                {seciliGrup ? seciliGrup.ad : seciliKisi.ad}
              </div>
              <div style={{
                font: '400 12px/16px var(--font-sans)',
                color: seciliGrup ? 'var(--text-tertiary)' : durumRenk[efektifDurum(seciliKisi)],
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {seciliGrup
                  ? `Sen, ${grupUyeAdlari(seciliGrup).join(', ')}`
                  : durumIsim[efektifDurum(seciliKisi)]}
              </div>
            </div>

            {seciliGrup && (
              <button onClick={() => setKisiEkleModal(true)} title="Gruba kişi ekle" style={ustButonStil}
                onMouseEnter={vurgula('var(--brand-primary)')} onMouseLeave={vurguKaldir}>
                <UserPlus size={13} strokeWidth={1.5} /> Kişi ekle
              </button>
            )}

            {/* SOHBETİ SİL — tüm yazışmayı benden temizler (tek tek mesaj silme
                DEĞİL). Diğer katılımcılarda kalır; yeni mesajla sohbet geri döner
                ama gizlenen eski mesajlar geri gelmez (mig 240/243). */}
            <button onClick={sohbetiSilTikla} title="Bu sohbetin tamamını benden sil" style={ustButonStil}
              onMouseEnter={vurgula('var(--danger)')} onMouseLeave={vurguKaldir}>
              <Trash2 size={13} strokeWidth={1.5} /> Sohbeti sil
            </button>

            {seciliGrup && (
              <button onClick={gruptanAyrilTikla} title="Gruptan ayrıl" style={ustButonStil}
                onMouseEnter={vurgula('var(--danger)')} onMouseLeave={vurguKaldir}>
                <LogOut size={13} strokeWidth={1.5} /> Ayrıl
              </button>
            )}
          </div>

          {/* Mesajlar */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: 'var(--surface-bg)' }}>
            {konusma.length === 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <p className="t-caption">Henüz mesaj yok. İlk mesajı gönder.</p>
              </div>
            )}

            {grupluMesajlar().map((item, i) => {
              if (item.tip === 'tarih') {
                return (
                  <div key={`t-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
                    <span className="t-caption">{item.tarih}</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
                  </div>
                )
              }

              const benimMesajim = item.gondericiId === kullanici?.id
              const gondererAd = benimMesajim ? kullanici?.ad : kisiAd(item.gondericiId)
              const dosyaMi = isDosyaMesaj(item.icerik)
              const dosyaBilgi = dosyaMi ? JSON.parse(item.icerik) : null
              const IconC = dosyaMi ? dosyaIcon(dosyaBilgi.dosyaTipi) : null
              const buyukEmoji = !dosyaMi && sadeceEmojiMi(item.icerik)

              return (
                <div
                  key={item.id}
                  className="chat-satir"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: benimMesajim ? 'flex-end' : 'flex-start',
                    marginBottom: 10,
                  }}
                >
                  {/* Kendi mesajını herkes silebilir — RLS ile aynı kural.
                      Başkasının mesajında bu buton hiç çıkmaz. */}
                  {benimMesajim && (
                    <button
                      className="chat-sil-btn"
                      onClick={() => mesajSilTikla(item.id)}
                      title="Mesajı sil"
                      aria-label="Mesajı sil"
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--text-tertiary)', padding: 4, marginRight: 4,
                        display: 'inline-flex', alignItems: 'center',
                      }}
                    >
                      <Trash2 size={13} strokeWidth={1.5} />
                    </button>
                  )}
                  {!benimMesajim && (
                    <div style={{ marginRight: 8, alignSelf: 'flex-end' }}>
                      <Avatar name={gondererAd} size="xs" />
                    </div>
                  )}
                  <div style={{
                    maxWidth: 520,
                    display: 'flex', flexDirection: 'column',
                    alignItems: benimMesajim ? 'flex-end' : 'flex-start',
                  }}>
                    {/* Grupta kimin yazdığı belli olsun */}
                    {seciliGrup && !benimMesajim && (
                      <span style={{
                        font: '600 11px/14px var(--font-sans)', color: 'var(--brand-primary)',
                        marginBottom: 2, padding: '0 4px',
                      }}>
                        {gondererAd}
                      </span>
                    )}
                    {dosyaMi ? (
                      <div
                        onClick={() => dosyaIndir(item.icerik)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-md)',
                          background: benimMesajim ? 'var(--brand-primary)' : 'var(--surface-card)',
                          color: benimMesajim ? '#fff' : 'var(--text-primary)',
                          border: benimMesajim ? 'none' : '1px solid var(--border-default)',
                          boxShadow: benimMesajim ? 'none' : 'var(--shadow-sm)',
                          cursor: 'pointer',
                        }}
                      >
                        <IconC size={20} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ font: '500 13px/18px var(--font-sans)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
                            {dosyaBilgi.dosyaAdi}
                          </div>
                          <div style={{
                            font: '400 11px/14px var(--font-sans)',
                            color: benimMesajim ? 'rgba(255,255,255,0.7)' : 'var(--text-tertiary)',
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {dosyaBoyutFormat(dosyaBilgi.dosyaBoyutu)} · İndir
                          </div>
                        </div>
                      </div>
                    ) : buyukEmoji ? (
                      <div style={{ fontSize: 34, lineHeight: '42px', padding: '0 4px' }}>
                        {item.icerik}
                      </div>
                    ) : (
                      <div style={{
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-md)',
                        background: benimMesajim ? 'var(--brand-primary)' : 'var(--surface-card)',
                        color: benimMesajim ? '#fff' : 'var(--text-primary)',
                        border: benimMesajim ? 'none' : '1px solid var(--border-default)',
                        boxShadow: benimMesajim ? 'none' : 'var(--shadow-sm)',
                        font: '400 13px/20px var(--font-sans)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}>
                        {item.icerik}
                      </div>
                    )}
                    <span style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4, padding: '0 4px', fontVariantNumeric: 'tabular-nums' }}>
                      {saatFormat(item.tarih)}
                      {benimMesajim && !seciliGrup && <span style={{ marginLeft: 4 }}>{item.okundu ? '✓✓' : '✓'}</span>}
                    </span>
                  </div>
                </div>
              )
            })}
            <div ref={mesajSonuRef} />
          </div>

          {/* Gönder */}
          <div style={{
            padding: '12px 16px',
            background: 'var(--surface-card)',
            borderTop: '1px solid var(--border-default)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, position: 'relative' }}>
              <button
                data-emoji-buton
                onClick={() => setEmojiAcik(a => !a)}
                aria-label="Emoji ekle"
                title="Emoji"
                style={{ ...araButonStil, color: emojiAcik ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
                onMouseEnter={araButonHover} onMouseLeave={araButonCik}
              >
                <Smile size={16} strokeWidth={1.5} />
              </button>
              {emojiAcik && (
                <EmojiSecici onSec={emojiEkle} onKapat={() => setEmojiAcik(false)} />
              )}
              <button
                onClick={() => dosyaInputRef.current?.click()}
                aria-label="Dosya ekle"
                style={araButonStil}
                onMouseEnter={araButonHover} onMouseLeave={araButonCik}
              >
                <Paperclip size={16} strokeWidth={1.5} />
              </button>
              <input
                ref={dosyaInputRef}
                type="file"
                onChange={dosyaSecildi}
                style={{ display: 'none' }}
                accept=".pdf,.xlsx,.xls,.doc,.docx,.png,.jpg,.jpeg,.zip,.rar,.txt,.csv"
              />
              <Textarea
                ref={metinRef}
                value={yeniMesaj}
                onChange={e => setYeniMesaj(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Mesaj yaz… (Enter ile gönder)"
                rows={1}
                style={{ maxHeight: 120, resize: 'none' }}
              />
              <Button
                variant="primary"
                onClick={gonder}
                disabled={!yeniMesaj.trim()}
                iconLeft={<Send size={14} strokeWidth={1.5} />}
              >
                Gönder
              </Button>
            </div>
            <p className="t-caption" style={{ marginTop: 6, marginLeft: 88 }}>
              PDF, Excel, Word, resim ve ZIP (max 5 MB)
            </p>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-bg)' }}>
          <EmptyState
            icon={<MessageSquare size={32} strokeWidth={1.5} />}
            title="Mesajlaşmaya başla"
            description="Sol taraftan bir kişi ya da grup seç"
          />
        </div>
      )}

      {/* Yeni grup */}
      <Modal
        open={grupModal}
        onClose={() => setGrupModal(false)}
        title="Yeni Grup Sohbeti"
        footer={
          <>
            <Button variant="secondary" onClick={() => setGrupModal(false)}>Vazgeç</Button>
            <Button variant="primary" onClick={grupKaydet} disabled={grupKaydediliyor}>
              {grupKaydediliyor ? 'Oluşturuluyor…' : 'Grubu Oluştur'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <Label>Grup adı</Label>
            <Input
              value={grupAd}
              onChange={e => setGrupAd(e.target.value)}
              placeholder="Örn. Saha Ekibi, Bahçeşehir Projesi"
              autoFocus
            />
          </div>
          <div>
            <Label>Katılımcılar</Label>
            <CokluSelect
              degerler={grupUyeler}
              onChange={setGrupUyeler}
              secenekler={digerKullanicilar.map(k => ({ id: k.id, ad: k.ad }))}
              placeholder="Kişi seç…"
            />
            <p className="t-caption" style={{ marginTop: 6 }}>
              Sen otomatik olarak gruba dahilsin. Sonradan da kişi ekleyebilirsin.
            </p>
          </div>
        </div>
      </Modal>

      {/* Gruba kişi ekle */}
      <Modal
        open={kisiEkleModal}
        onClose={() => setKisiEkleModal(false)}
        title="Gruba Kişi Ekle"
        width={420}
        footer={
          <>
            <Button variant="secondary" onClick={() => setKisiEkleModal(false)}>Vazgeç</Button>
            <Button variant="primary" onClick={kisiEkleKaydet} disabled={!eklenecekKisi}>Ekle</Button>
          </>
        }
      >
        <Label>Kişi</Label>
        <Select value={eklenecekKisi} onChange={e => setEklenecekKisi(e.target.value)}>
          <option value="">Seç…</option>
          {digerKullanicilar
            .filter(k => !(seciliGrup?.katilimcilar || []).includes(k.id))
            .map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
        </Select>
        <p className="t-caption" style={{ marginTop: 8 }}>
          Eklenen kişi gruptaki eski mesajları da görür.
        </p>
      </Modal>
    </div>
  )
}

// ── Ortak stiller ───────────────────────────────────────────────────────────
const baslikSeridi = {
  padding: '8px 16px 4px',
  font: '600 10px/14px var(--font-sans)',
  letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  background: 'var(--surface-card)',
}

const satirStil = (aktif) => ({
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '12px 16px',
  borderBottom: '1px solid var(--border-default)',
  borderLeft: `3px solid ${aktif ? 'var(--brand-primary)' : 'transparent'}`,
  paddingLeft: 13,
  background: aktif ? 'var(--brand-primary-soft)' : 'transparent',
  cursor: 'pointer',
  transition: 'background 120ms',
})

const rozetStil = {
  position: 'absolute', top: -4, right: -4,
  minWidth: 16, height: 16, padding: '0 4px',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--danger)', color: '#fff',
  fontSize: 10, fontWeight: 600,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}

const onizlemeStil = {
  font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  marginTop: 2,
}

const saatStil = {
  font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)',
  flexShrink: 0, fontVariantNumeric: 'tabular-nums',
}

const ustButonStil = {
  display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
  background: 'transparent', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', padding: '6px 12px', cursor: 'pointer',
  font: '500 12px/16px var(--font-sans)', color: 'var(--text-secondary)',
}

const vurgula = (renk) => (e) => {
  e.currentTarget.style.borderColor = renk
  e.currentTarget.style.color = renk
}
const vurguKaldir = (e) => {
  e.currentTarget.style.borderColor = 'var(--border-default)'
  e.currentTarget.style.color = 'var(--text-secondary)'
}

const araButonStil = {
  flexShrink: 0, width: 36, height: 36,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--surface-card)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
}
const araButonHover = (e) => {
  e.currentTarget.style.background = 'var(--brand-primary-soft)'
  e.currentTarget.style.color = 'var(--brand-primary)'
  e.currentTarget.style.borderColor = 'var(--brand-primary)'
}
const araButonCik = (e) => {
  e.currentTarget.style.background = 'var(--surface-card)'
  e.currentTarget.style.color = 'var(--text-secondary)'
  e.currentTarget.style.borderColor = 'var(--border-default)'
}

export default Chat
