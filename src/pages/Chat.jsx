import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import {
  Paperclip, Send, MessageSquare, FileText, FileSpreadsheet, FileImage, FileArchive, File,
} from 'lucide-react'
import { Avatar, Button, Textarea, EmptyState } from '../components/ui'

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

const saatFormat = (tarih) =>
  new Date(tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

const dosyaBoyutFormat = (b) => {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function Chat() {
  const { kullanici, kullanicilar } = useAuth()
  const { mesajGonder, konusmaGetir, mesajlariOku, okunmamisSay, aktifKonusmaAyarla } = useChat()
  const [seciliKisi, setSeciliKisi] = useState(null)
  const [yeniMesaj, setYeniMesaj] = useState('')
  const mesajSonuRef = useRef(null)
  const dosyaInputRef = useRef(null)

  const digerKullanicilar = kullanicilar.filter(k => k.id !== kullanici?.id)
  const konusma = seciliKisi ? konusmaGetir(seciliKisi.id) : []

  useEffect(() => { if (seciliKisi) mesajlariOku(seciliKisi.id) }, [seciliKisi, konusma.length])
  useEffect(() => () => aktifKonusmaAyarla?.(null), [aktifKonusmaAyarla])
  useEffect(() => { mesajSonuRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [konusma.length])

  const gonder = () => {
    if (!yeniMesaj.trim() || !seciliKisi) return
    mesajGonder(seciliKisi.id, yeniMesaj)
    setYeniMesaj('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); gonder() }
  }

  const dosyaSecildi = (e) => {
    const dosya = e.target.files[0]
    if (!dosya || !seciliKisi) return
    if (dosya.size > 5 * 1024 * 1024) { alert('Dosya boyutu 5 MB\'dan büyük olamaz.'); return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      mesajGonder(seciliKisi.id, JSON.stringify({
        tip: 'dosya', dosyaAdi: dosya.name, dosyaTipi: dosya.type,
        dosyaBoyutu: dosya.size, dosyaData: ev.target.result,
      }))
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
    const gruplar = []
    let sonTarih = null
    konusma.forEach(m => {
      const t = tarihFormat(m.tarih)
      if (t !== sonTarih) { gruplar.push({ tip: 'tarih', tarih: t }); sonTarih = t }
      gruplar.push({ tip: 'mesaj', ...m })
    })
    return gruplar
  }

  const seciliKisiGuncel = digerKullanicilar.find(k => k.id === seciliKisi?.id)

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', background: 'var(--surface-card)' }}>

      {/* Kişi listesi */}
      <div style={{
        width: 280, flexShrink: 0,
        background: 'var(--surface-card)',
        borderRight: '1px solid var(--border-default)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-default)' }}>
          <h2 className="t-h2" style={{ margin: 0 }}>Mesajlar</h2>
          <p className="t-caption" style={{ marginTop: 2 }}>
            <span className="tabular-nums">{digerKullanicilar.length}</span> kişi
          </p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {digerKullanicilar.map(k => {
            const okunmamis = okunmamisSay(k.id)
            const sonMesaj = konusmaGetir(k.id).slice(-1)[0]
            const aktif = seciliKisi?.id === k.id
            const kisiDurum = k.durum || 'cevrimdisi'
            const sonMesajMetin = sonMesaj
              ? isDosyaMesaj(sonMesaj.icerik) ? 'Dosya' : sonMesaj.icerik
              : ''

            return (
              <div
                key={k.id}
                onClick={() => setSeciliKisi(k)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border-default)',
                  borderLeft: `3px solid ${aktif ? 'var(--brand-primary)' : 'transparent'}`,
                  paddingLeft: 13,
                  background: aktif ? 'var(--brand-primary-soft)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 120ms',
                }}
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
                  {okunmamis > 0 && (
                    <span style={{
                      position: 'absolute', top: -4, right: -4,
                      minWidth: 16, height: 16, padding: '0 4px',
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--danger)', color: '#fff',
                      fontSize: 10, fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {okunmamis}
                    </span>
                  )}
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
                    <div style={{
                      font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      marginTop: 2,
                    }}>
                      {sonMesaj.gondericId === kullanici?.id?.toString() ? 'Sen: ' : ''}{sonMesajMetin}
                    </div>
                  )}
                </div>
                {sonMesaj && (
                  <span style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {saatFormat(sonMesaj.tarih)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Konuşma alanı */}
      {seciliKisiGuncel ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 20px',
            background: 'var(--surface-card)',
            borderBottom: '1px solid var(--border-default)',
          }}>
            <div style={{ position: 'relative' }}>
              <Avatar name={seciliKisiGuncel.ad} size="md" />
              <span
                aria-hidden
                style={{
                  position: 'absolute', bottom: -1, right: -1,
                  width: 10, height: 10, borderRadius: '50%',
                  background: durumRenk[seciliKisiGuncel.durum || 'cevrimdisi'],
                  border: '2px solid var(--surface-card)',
                }}
              />
            </div>
            <div>
              <div style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
                {seciliKisiGuncel.ad}
              </div>
              <div style={{ font: '400 12px/16px var(--font-sans)', color: durumRenk[seciliKisiGuncel.durum || 'cevrimdisi'] }}>
                {durumIsim[seciliKisiGuncel.durum || 'cevrimdisi']}
              </div>
            </div>
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
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
                    <span className="t-caption">{item.tarih}</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
                  </div>
                )
              }

              const benimMesajim = item.gondericId === kullanici?.id?.toString()
              const dosyaMi = isDosyaMesaj(item.icerik)
              const dosyaBilgi = dosyaMi ? JSON.parse(item.icerik) : null
              const IconC = dosyaMi ? dosyaIcon(dosyaBilgi.dosyaTipi) : null

              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: benimMesajim ? 'flex-end' : 'flex-start',
                    marginBottom: 10,
                  }}
                >
                  {!benimMesajim && (
                    <div style={{ marginRight: 8, alignSelf: 'flex-end' }}>
                      <Avatar name={item.gondericAd} size="xs" />
                    </div>
                  )}
                  <div style={{
                    maxWidth: 520,
                    display: 'flex', flexDirection: 'column',
                    alignItems: benimMesajim ? 'flex-end' : 'flex-start',
                  }}>
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
                      {benimMesajim && <span style={{ marginLeft: 4 }}>{item.okundu ? '✓✓' : '✓'}</span>}
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
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <button
                onClick={() => dosyaInputRef.current?.click()}
                aria-label="Dosya ekle"
                style={{
                  flexShrink: 0, width: 36, height: 36,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)'; e.currentTarget.style.borderColor = 'var(--brand-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-card)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}
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
            <p className="t-caption" style={{ marginTop: 6, marginLeft: 44 }}>
              PDF, Excel, Word, resim ve ZIP (max 5 MB)
            </p>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-bg)' }}>
          <EmptyState
            icon={<MessageSquare size={32} strokeWidth={1.5} />}
            title="Mesajlaşmaya başla"
            description="Sol taraftan bir kişi seç"
          />
        </div>
      )}
    </div>
  )
}

export default Chat
