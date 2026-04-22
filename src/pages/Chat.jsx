import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'

const durumRenkleri = {
  cevrimici: '#22c55e',
  mesgul: '#ef4444',
  disarida: '#f59e0b',
  toplantida: '#014486',
  cevrimdisi: '#6b7280',
}

const durumIsimleri = {
  cevrimici: 'Çevrimiçi',
  mesgul: 'Meşgul',
  disarida: 'Dışarıda',
  toplantida: 'Toplantıda',
  cevrimdisi: 'Çevrimdışı',
}

function Chat() {
  const { kullanici, kullanicilar } = useAuth()
  const { mesajGonder, konusmaGetir, mesajlariOku, okunmamisSay } = useChat()
  const [seciliKisi, setSeciliKisi] = useState(null)
  const [yeniMesaj, setYeniMesaj] = useState('')
  const mesajSonuRef = useRef(null)
  const dosyaInputRef = useRef(null)

  const digenKullanicilar = kullanicilar.filter((k) => k.id !== kullanici?.id)
  const konusma = seciliKisi
    ? konusmaGetir(seciliKisi.id)
    : []

  useEffect(() => {
    if (seciliKisi) mesajlariOku(seciliKisi.id)
  }, [seciliKisi, konusma.length])

  useEffect(() => {
    mesajSonuRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [konusma.length])

  const gonder = () => {
    if (!yeniMesaj.trim() || !seciliKisi) return
    mesajGonder(seciliKisi.id, yeniMesaj)
    setYeniMesaj('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      gonder()
    }
  }

  const dosyaSecildi = (e) => {
    const dosya = e.target.files[0]
    if (!dosya || !seciliKisi) return
    const maxBoyut = 5 * 1024 * 1024
    if (dosya.size > maxBoyut) {
      alert('Dosya boyutu 5MB\'dan büyük olamaz!')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dosyaMesaj = {
        tip: 'dosya',
        dosyaAdi: dosya.name,
        dosyaTipi: dosya.type,
        dosyaBoyutu: dosya.size,
        dosyaData: ev.target.result,
      }
      mesajGonder(seciliKisi.id, JSON.stringify(dosyaMesaj))
    }
    reader.readAsDataURL(dosya)
    e.target.value = ''
  }

  const dosyaIndir = (mesajIcerik) => {
    try {
      const dosya = JSON.parse(mesajIcerik)
      const link = document.createElement('a')
      link.href = dosya.dosyaData
      link.download = dosya.dosyaAdi
      link.click()
    } catch (e) {}
  }

  const isDosyaMesaj = (icerik) => {
    try {
      const parsed = JSON.parse(icerik)
      return parsed.tip === 'dosya'
    } catch {
      return false
    }
  }

  const dosyaIkon = (dosyaTipi) => {
    if (dosyaTipi?.includes('pdf')) return '📄'
    if (dosyaTipi?.includes('excel') || dosyaTipi?.includes('spreadsheet') || dosyaTipi?.includes('xlsx')) return '📊'
    if (dosyaTipi?.includes('word') || dosyaTipi?.includes('document')) return '📝'
    if (dosyaTipi?.includes('image')) return '🖼️'
    if (dosyaTipi?.includes('zip') || dosyaTipi?.includes('rar')) return '🗜️'
    return '📎'
  }

  const dosyaBoyutFormat = (boyut) => {
    if (boyut < 1024) return `${boyut} B`
    if (boyut < 1024 * 1024) return `${(boyut / 1024).toFixed(1)} KB`
    return `${(boyut / (1024 * 1024)).toFixed(1)} MB`
  }

  const saatFormat = (tarih) =>
    new Date(tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

  const tarihFormat = (tarih) => {
    const bugun = new Date()
    const mesajTarih = new Date(tarih)
    if (mesajTarih.toDateString() === bugun.toDateString()) return 'Bugün'
    return mesajTarih.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
  }

  const grupluMesajlar = () => {
    const gruplar = []
    let sonTarih = null
    konusma.forEach((m) => {
      const tarih = tarihFormat(m.tarih)
      if (tarih !== sonTarih) {
        gruplar.push({ tip: 'tarih', tarih })
        sonTarih = tarih
      }
      gruplar.push({ tip: 'mesaj', ...m })
    })
    return gruplar
  }

  const seciliKisiGuncel = digenKullanicilar.find((k) => k.id === seciliKisi?.id)

  return (
    <div className="flex" style={{ height: 'calc(100vh - 57px)' }}>

      {/* Sol — Kişi listesi */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Mesajlar</h2>
          <p className="text-xs text-gray-400 mt-0.5">{digenKullanicilar.length} kişi</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {digenKullanicilar.map((k) => {
            const okunmamis = okunmamisSay(k.id)
            const sonMesaj = konusmaGetir(k.id).slice(-1)[0]
            const aktif = seciliKisi?.id === k.id
            const kisiDurum = k.durum || 'cevrimdisi'
            const sonMesajMetin = sonMesaj
              ? isDosyaMesaj(sonMesaj.icerik)
                ? '📎 Dosya'
                : sonMesaj.icerik
              : ''

            return (
              <div
                key={k.id}
                onClick={() => setSeciliKisi(k)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-50 transition ${
                  aktif ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="relative flex-shrink-0">
                  <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-semibold">
                    {k.ad?.charAt(0) || "?"}
                  </div>
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
                    style={{ backgroundColor: durumRenkleri[kisiDurum] }}
                  />
                  {okunmamis > 0 && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                      <span className="text-white" style={{ fontSize: '9px' }}>{okunmamis}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${okunmamis > 0 ? 'font-semibold text-gray-800' : 'font-medium text-gray-700'}`}>
                    {k.ad}
                  </p>
                  <p className="text-xs truncate" style={{ color: durumRenkleri[kisiDurum] }}>
                    {durumIsimleri[kisiDurum]}
                  </p>
                  {sonMesajMetin && (
                    <p className="text-xs text-gray-400 truncate">
                      {sonMesaj.gondericId === kullanici?.id?.toString() ? 'Sen: ' : ''}{sonMesajMetin}
                    </p>
                  )}
                </div>
                {sonMesaj && (
                  <span className="text-xs text-gray-300 flex-shrink-0">
                    {saatFormat(sonMesaj.tarih)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Sağ — Mesaj alanı */}
      {seciliKisiGuncel ? (
        <div className="flex-1 flex flex-col">

          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-semibold">
                {seciliKisiGuncel.ad.charAt(0)}
              </div>
              <div
                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
                style={{ backgroundColor: durumRenkleri[seciliKisiGuncel.durum || 'cevrimdisi'] }}
              />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">{seciliKisiGuncel.ad}</p>
              <p className="text-xs" style={{ color: durumRenkleri[seciliKisiGuncel.durum || 'cevrimdisi'] }}>
                {durumIsimleri[seciliKisiGuncel.durum || 'cevrimdisi']}
              </p>
            </div>
          </div>

          {/* Mesajlar */}
          <div className="flex-1 overflow-y-auto px-5 py-4 bg-gray-50">
            {konusma.length === 0 && (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Henüz mesaj yok. İlk mesajı gönder!
              </div>
            )}

            {grupluMesajlar().map((item, i) => {
              if (item.tip === 'tarih') {
                return (
                  <div key={i} className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-gray-200"></div>
                    <span className="text-xs text-gray-400">{item.tarih}</span>
                    <div className="flex-1 h-px bg-gray-200"></div>
                  </div>
                )
              }

              const benimMesajim = item.gondericId === kullanici?.id?.toString()
              const dosyaMi = isDosyaMesaj(item.icerik)
              const dosyaBilgi = dosyaMi ? JSON.parse(item.icerik) : null

              return (
                <div
                  key={item.id}
                  className={`flex mb-3 ${benimMesajim ? 'justify-end' : 'justify-start'}`}
                >
                  {!benimMesajim && (
                    <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold mr-2 flex-shrink-0 self-end">
                      {item.gondericAd.charAt(0)}
                    </div>
                  )}
                  <div className={`max-w-xs lg:max-w-md flex flex-col ${benimMesajim ? 'items-end' : 'items-start'}`}>
                    {dosyaMi ? (
                      <div
                        onClick={() => dosyaIndir(item.icerik)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer hover:opacity-90 transition ${
                          benimMesajim
                            ? 'bg-blue-600 text-white rounded-br-sm'
                            : 'bg-white text-gray-800 rounded-bl-sm shadow-sm border border-gray-100'
                        }`}
                      >
                        <span className="text-2xl">{dosyaIkon(dosyaBilgi.dosyaTipi)}</span>
                        <div>
                          <p className="text-sm font-medium truncate max-w-40">{dosyaBilgi.dosyaAdi}</p>
                          <p className={`text-xs ${benimMesajim ? 'text-blue-200' : 'text-gray-400'}`}>
                            {dosyaBoyutFormat(dosyaBilgi.dosyaBoyutu)} — İndirmek için tıkla
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`px-4 py-2.5 rounded-2xl text-sm ${
                          benimMesajim
                            ? 'bg-blue-600 text-white rounded-br-sm'
                            : 'bg-white text-gray-800 rounded-bl-sm shadow-sm border border-gray-100'
                        }`}
                      >
                        {item.icerik}
                      </div>
                    )}
                    <span className="text-xs text-gray-400 mt-1 px-1">
                      {saatFormat(item.tarih)}
                      {benimMesajim && (
                        <span className="ml-1">{item.okundu ? '✓✓' : '✓'}</span>
                      )}
                    </span>
                  </div>
                </div>
              )
            })}
            <div ref={mesajSonuRef} />
          </div>

          {/* Mesaj gönder */}
          <div className="bg-white border-t border-gray-200 px-4 py-3">
            <div className="flex items-end gap-2">
              <button
                onClick={() => dosyaInputRef.current?.click()}
                className="flex-shrink-0 w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:border-blue-300 transition"
                title="Dosya ekle"
              >
                📎
              </button>
              <input
                ref={dosyaInputRef}
                type="file"
                onChange={dosyaSecildi}
                className="hidden"
                accept=".pdf,.xlsx,.xls,.doc,.docx,.png,.jpg,.jpeg,.zip,.rar,.txt,.csv"
              />
              <textarea
                value={yeniMesaj}
                onChange={(e) => setYeniMesaj(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Mesaj yaz... (Enter ile gönder)"
                rows={1}
                style={{ maxHeight: '120px' }}
              />
              <button
                onClick={gonder}
                disabled={!yeniMesaj.trim()}
                className="flex-shrink-0 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Gönder
              </button>
            </div>
            <p className="text-xs text-gray-300 mt-1.5 ml-11">
              PDF, Excel, Word, resim ve ZIP dosyaları desteklenir (max 5MB)
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="text-5xl mb-4">💬</div>
            <p className="text-gray-500 font-medium">Mesajlaşmaya başla</p>
            <p className="text-gray-400 text-sm mt-1">Sol taraftan bir kişi seç</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default Chat