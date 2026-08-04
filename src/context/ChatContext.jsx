import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import { supabase } from '../lib/supabase'
import { toCamel } from '../lib/mapper'
import {
  mesajlariGetir,
  sohbetleriGetir,
  mesajGonder as dbMesajGonder,
  konusmayiOkunduYap,
  mesajSil as dbMesajSil,
  sohbetiGizle as dbSohbetiGizle,
  sohbetOkunduIsaretle,
  birebirSohbetAc,
  grupSohbetAc,
  grubaKisiEkle as dbGrubaKisiEkle,
  gruptanAyril as dbGruptanAyril,
  grupAdiDegistir as dbGrupAdiDegistir,
  sohbetDosyaYukle,
  sohbetDosyaSil,
  DOSYA_LIMIT,
} from '../services/chatService'

// Dosya mesajının Storage yolu (yeni format). Eski base64 mesajlarda yok.
const dosyaYolu = (icerik) => {
  try {
    const j = JSON.parse(icerik)
    return j?.tip === 'dosya' ? (j.yol || null) : null
  } catch { return null }
}

const ChatContext = createContext(null)

// Kısa bir "ding" sesi — Web Audio API ile asset gerektirmez
const bildirimSesiCal = () => {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.18)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.4)
  } catch (e) { /* sessizce yut */ }
}

const MANUEL_DURUMLAR = ['mesgul', 'disarida', 'toplantida']

const onizlemeMetni = (icerik = '') => {
  try {
    const j = JSON.parse(icerik)
    if (j?.tip === 'dosya') return '📎 Dosya gönderdi'
  } catch { /* düz metin */ }
  return icerik.length > 60 ? icerik.slice(0, 60) + '…' : icerik
}

export function ChatProvider({ children }) {
  const { kullanici, kullanicilar } = useAuth()
  // DİKKAT: destructuring ŞART. `const toast = useToast()` context objesinin
  // KENDİSİNİ verir ({ showToast, toast }) → toast.info undefined olur ve
  // `toast?.info?.(...)` optional-call sayesinde hata bile fırlatmadan sessizce
  // hiçbir şey yapmaz. Bu yüzden yeni mesaj bildirimi HİÇ çıkmıyordu; aynı
  // sebeple "Mesaj gönderilemedi" / "Sohbet açılamadı" hataları da yutuluyordu.
  const { toast } = useToast()
  const [mesajlar, setMesajlar] = useState([])
  const [sohbetler, setSohbetler] = useState([])
  const [okunmamis, setOkunmamis] = useState(0)
  const [cevrimiciIdSeti, setCevrimiciIdSeti] = useState(() => new Set())
  // Açık olan sohbetin anahtarı: 'k:<kisiId>' veya 'g:<sohbetId>'
  const aktifKonusmaRef = useRef(null)

  // ---- Mini sohbet penceresi (sağ alt) ----
  // Durum sayfa bileşenlerinde DEĞİL burada: pencere MainLayout'ta Routes'un
  // dışında yaşıyor, ayrıca ileride "müşteri detayından bu kişiye yaz" gibi
  // giriş noktaları eklenince her yerden pencereAc(...) çağrılabilsin.
  const [pencereAcik, setPencereAcik] = useState(false)
  const [pencereHedef, setPencereHedef] = useState(null)   // null | { tip:'kisi'|'grup', id }
  const [pencereKucuk, setPencereKucuk] = useState(false)

  const pencereAc = useCallback((hedef = null) => {
    setPencereHedef(hedef)
    setPencereKucuk(false)
    setPencereAcik(true)
  }, [])
  const pencereKapat = useCallback(() => {
    setPencereAcik(false)
    setPencereKucuk(false)
  }, [])
  const pencereKucult = useCallback((deger = true) => setPencereKucuk(!!deger), [])
  const pencereHedefSec = useCallback((hedef) => setPencereHedef(hedef), [])

  // ---- Otomatik pencere açma (04.08 isteği: "mesaj atınca karşıda pencere açılsın")
  // Pencere durumu REF olarak da tutulur: realtime geri çağrısı kurulduğu andaki
  // state'i kapatır (closure), bayat değerle karar verirdi.
  const pencereAcikRef = useRef(false)
  const pencereHedefRef = useRef(null)
  useEffect(() => { pencereAcikRef.current = pencereAcik }, [pencereAcik])
  useEffect(() => { pencereHedefRef.current = pencereHedef }, [pencereHedef])

  // SohbetPenceresi yazı kutusunda metin varken bildirir. VERİ KAYBI KORUMASI:
  // kullanıcı A'ya mesaj yazarken B'den mesaj gelirse pencereyi B'ye çevirmek,
  // yazılan metnin YANLIŞ KİŞİYE gitmesine yol açardı (metin kutusu hedefe
  // bağlı değil, tek state). Taslak varken hedef değiştirilmez.
  const taslakVarRef = useRef(false)
  const taslakBildir = useCallback((v) => { taslakVarRef.current = !!v }, [])

  const pencereOtomatikAc = useCallback((hedef) => {
    const mevcut = pencereHedefRef.current
    const ayni = mevcut && mevcut.tip === hedef.tip && String(mevcut.id) === String(hedef.id)
    // Aynı kişiyle zaten açık: küçültülmüşse öne getir, hedefe dokunma
    if (pencereAcikRef.current && ayni) { setPencereKucuk(false); return }
    // Açık ve BAŞKA hedefte + yazılmış taslak var → dokunma (toast zaten çıkıyor)
    if (pencereAcikRef.current && taslakVarRef.current) return
    pencereAc(hedef)
  }, [pencereAc])

  const sohbetleriYenile = useCallback(async () => {
    if (!kullanici?.id) { setSohbetler([]); return [] }
    const d = await sohbetleriGetir()
    setSohbetler(d)
    return d
  }, [kullanici?.id])

  // İlk yükleme + kullanıcı değişiminde mesaj ve sohbetleri çek
  useEffect(() => {
    if (!kullanici?.id) { setMesajlar([]); setSohbetler([]); return }
    let iptal = false
    mesajlariGetir(kullanici.id).then((d) => { if (!iptal) setMesajlar(d ?? []) })
    sohbetleriGetir().then((d) => { if (!iptal) setSohbetler(d ?? []) })
    return () => { iptal = true }
  }, [kullanici?.id])

  const grupIdler = useMemo(
    () => sohbetler.filter(s => s.tip === 'grup').map(s => s.id),
    [sohbetler],
  )
  const grupIdAnahtar = grupIdler.join(',')

  const yeniMesajGeldi = useCallback((yeni, anahtar, baslik, otomatikHedef = null) => {
    setMesajlar((prev) => prev.some((m) => m.id === yeni.id) ? prev : [...prev, yeni])
    if (yeni.gondericiId === kullanici?.id) return          // kendi mesajım
    if (aktifKonusmaRef.current === anahtar) return          // zaten bakıyorum
    bildirimSesiCal()
    toast?.info?.(`${baslik}: ${onizlemeMetni(yeni.icerik)}`)
    // Birebir mesajda sohbet penceresi kendiliğinden açılır (04.08 isteği).
    // Grupta AÇILMAZ: grup trafiği yoğun, her mesajda pencere zıplaması işi
    // böler — grupta bildirim + okunmamış rozeti yeterli.
    if (otomatikHedef) pencereOtomatikAc(otomatikHedef)
  }, [kullanici?.id, toast, pencereOtomatikAc])

  // Realtime — birebir: bana gelen mesajlar
  useEffect(() => {
    if (!kullanici?.id) return
    const kanal = supabase
      .channel(`mesajlar_kullanici_${kullanici.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mesajlar', filter: `alici_id=eq.${kullanici.id}` },
        (payload) => {
          const yeni = toCamel(payload.new)
          const gonderen = kullanicilar?.find((k) => k.id === yeni.gondericiId)
          yeniMesajGeldi(yeni, `k:${yeni.gondericiId}`, gonderen?.ad || 'Yeni mesaj',
            { tip: 'kisi', id: yeni.gondericiId })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mesajlar', filter: `gonderici_id=eq.${kullanici.id}` },
        (payload) => {
          const yeni = toCamel(payload.new)
          setMesajlar((prev) => prev.map((m) => m.id === yeni.id ? { ...m, ...yeni } : m))
        }
      )
      // Bir gruba eklendiğimde/çıkarıldığımda sohbet listesi tazelensin
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sohbet_katilimcilar', filter: `kullanici_id=eq.${kullanici.id}` },
        () => { sohbetleriYenile() }
      )
      .subscribe()
    return () => { supabase.removeChannel(kanal) }
  }, [kullanici?.id, kullanicilar, yeniMesajGeldi, sohbetleriYenile])

  // Realtime — grup: grup mesajında alici_id yok, sohbet başına abone oluyoruz.
  // (Filtre yalnız tek kolonda eq destekliyor; "sohbet_id in (...)" yok.)
  useEffect(() => {
    if (!kullanici?.id || !grupIdAnahtar) return
    const idler = grupIdAnahtar.split(',').filter(Boolean)
    let kanal = supabase.channel(`mesajlar_gruplar_${kullanici.id}`)
    idler.forEach((gid) => {
      kanal = kanal.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mesajlar', filter: `sohbet_id=eq.${gid}` },
        (payload) => {
          const yeni = toCamel(payload.new)
          const grup = sohbetler.find(s => String(s.id) === String(gid))
          const gonderen = kullanicilar?.find((k) => k.id === yeni.gondericiId)
          const baslik = `${grup?.ad || 'Grup'} · ${gonderen?.ad || '?'}`
          yeniMesajGeldi(yeni, `g:${gid}`, baslik)
        }
      )
    })
    kanal.subscribe()
    return () => { supabase.removeChannel(kanal) }
    // sohbetler'i bilerek bağımlılığa koymuyoruz — her son_mesaj_tarih
    // değişiminde tüm kanalları yeniden kurmak gereksiz. Grup listesi
    // değiştiğinde (grupIdAnahtar) yeniden kuruluyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kullanici?.id, grupIdAnahtar, kullanicilar, yeniMesajGeldi])

  // Realtime Presence: kim gerçekten bağlı?
  useEffect(() => {
    if (!kullanici?.id) { setCevrimiciIdSeti(new Set()); return }
    const kanal = supabase.channel('online-users', {
      config: { presence: { key: String(kullanici.id) } },
    })
    const guncelle = () => {
      const state = kanal.presenceState()
      setCevrimiciIdSeti(new Set(Object.keys(state).map((k) => Number(k))))
    }
    kanal.on('presence', { event: 'sync' }, guncelle)
    kanal.on('presence', { event: 'join' }, guncelle)
    kanal.on('presence', { event: 'leave' }, guncelle)
    kanal.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await kanal.track({ id: kullanici.id, ad: kullanici.ad, at: Date.now() })
        guncelle()
      }
    })
    return () => { supabase.removeChannel(kanal) }
  }, [kullanici?.id, kullanici?.ad])

  const cevrimiciMi = useCallback((id) => cevrimiciIdSeti.has(id), [cevrimiciIdSeti])

  // Görünen durum: bağlı değilse 'cevrimdisi'; bağlıysa manuel statüyü göster
  const efektifDurum = useCallback((k) => {
    if (!k) return 'cevrimdisi'
    if (k.id === kullanici?.id) return k.durum || 'cevrimici'
    if (!cevrimiciIdSeti.has(k.id)) return 'cevrimdisi'
    if (MANUEL_DURUMLAR.includes(k.durum)) return k.durum
    return 'cevrimici'
  }, [cevrimiciIdSeti, kullanici?.id])

  // ── Birebir yardımcıları ──────────────────────────────────────────────────
  const birebirSohbetIdBul = useCallback((kisiId) => {
    const s = sohbetler.find(x =>
      x.tip === 'birebir' && (x.katilimcilar || []).includes(Number(kisiId))
    )
    return s?.id ?? null
  }, [sohbetler])

  const konusmaGetir = useCallback((kisiId) => {
    if (!kullanici?.id) return []
    return mesajlar
      .filter((m) =>
        (m.gondericiId === kullanici.id && m.aliciId === kisiId) ||
        (m.gondericiId === kisiId && m.aliciId === kullanici.id)
      )
      .sort((a, b) => new Date(a.tarih) - new Date(b.tarih))
  }, [mesajlar, kullanici?.id])

  const grupMesajlari = useCallback((sohbetId) => (
    mesajlar
      .filter((m) => m.sohbetId === sohbetId)
      .sort((a, b) => new Date(a.tarih) - new Date(b.tarih))
  ), [mesajlar])

  // ── Gönderme ──────────────────────────────────────────────────────────────
  // Hedefin sohbet_id'sini getirir; birebirde henüz sohbet yoksa açtırır.
  // Dosya yüklemesi mesajdan ÖNCE olduğu için ayrı fonksiyon gerekti
  // (dosya yolu `<sohbet_id>/...` — yükleme öncesi id şart).
  const sohbetIdSagla = useCallback(async (hedef) => {
    if (!hedef) return null
    if (hedef.tip === 'grup') return hedef.sohbetId
    const mevcut = birebirSohbetIdBul(hedef.kisiId)
    if (mevcut) return mevcut
    // Yarış koşulu DB'de advisory lock ile tekilleştiriliyor
    const r = await birebirSohbetAc(hedef.kisiId)
    if (r.__error) { toast?.error?.(`Sohbet açılamadı: ${r.__error}`); return null }
    sohbetleriYenile()
    return r.sohbetId
  }, [birebirSohbetIdBul, sohbetleriYenile, toast])

  // hedef: { tip: 'kisi', kisiId } | { tip: 'grup', sohbetId }
  const mesajGonder = useCallback(async (hedef, icerik) => {
    if (!icerik?.trim() || !kullanici?.id || !hedef) return

    const sohbetId = await sohbetIdSagla(hedef)
    if (!sohbetId) { toast?.error?.('Sohbet bulunamadı'); return }

    const yeni = await dbMesajGonder(
      kullanici.id,
      hedef.tip === 'kisi' ? hedef.kisiId : null,
      icerik,
      sohbetId,
    )
    if (yeni?.__error) { toast?.error?.(`Mesaj gönderilemedi: ${yeni.__error}`); return }
    if (yeni) {
      setMesajlar((prev) => prev.some((m) => m.id === yeni.id) ? prev : [...prev, yeni])
      setSohbetler((prev) => prev.map(s =>
        s.id === sohbetId ? { ...s, sonMesajTarih: yeni.tarih } : s
      ))
    }
  }, [kullanici?.id, sohbetIdSagla, toast])

  // Dosya gönder — önce Storage'a yüklenir, mesaja SADECE yolu yazılır (mig 244)
  const dosyaGonder = useCallback(async (hedef, dosya) => {
    if (!dosya || !kullanici?.id) return { __error: 'Dosya yok' }
    if (dosya.size > DOSYA_LIMIT) return { __error: 'Dosya 25 MB\'dan büyük olamaz' }

    const sohbetId = await sohbetIdSagla(hedef)
    if (!sohbetId) return { __error: 'Sohbet bulunamadı' }

    const y = await sohbetDosyaYukle(sohbetId, dosya)
    if (y.__error) return y

    await mesajGonder(hedef, JSON.stringify({
      tip: 'dosya',
      dosyaAdi: dosya.name,
      dosyaTipi: dosya.type,
      dosyaBoyutu: dosya.size,
      yol: y.yol,
    }))
    return { ok: true }
  }, [kullanici?.id, sohbetIdSagla, mesajGonder])

  const aktifKonusmaAyarla = useCallback((anahtar) => {
    aktifKonusmaRef.current = anahtar
  }, [])

  const mesajlariOku = useCallback(async (kisiId) => {
    if (!kullanici?.id) return
    aktifKonusmaRef.current = `k:${kisiId}`
    setMesajlar((prev) => prev.map((m) =>
      m.gondericiId === kisiId && m.aliciId === kullanici.id && !m.okundu
        ? { ...m, okundu: true }
        : m
    ))
    await konusmayiOkunduYap(kullanici.id, kisiId)
  }, [kullanici?.id])

  const grubuOku = useCallback(async (sohbetId) => {
    if (!kullanici?.id) return
    aktifKonusmaRef.current = `g:${sohbetId}`
    const simdi = new Date().toISOString()
    setSohbetler((prev) => prev.map(s => s.id === sohbetId ? { ...s, sonOkumaTarih: simdi } : s))
    await sohbetOkunduIsaretle(sohbetId)
  }, [kullanici?.id])

  // ── Silme ─────────────────────────────────────────────────────────────────
  const mesajSil = useCallback(async (id) => {
    // Dosya mesajıysa Storage'daki kopyayı da bırakma (yetim dosya kalmasın)
    const yol = dosyaYolu(mesajlar.find((m) => m.id === id)?.icerik || '')
    const sonuc = await dbMesajSil(id)
    if (!sonuc.__error) {
      setMesajlar((prev) => prev.filter((m) => m.id !== id))
      if (yol) sohbetDosyaSil(yol)
    }
    return sonuc
  }, [mesajlar])

  // Sohbeti kendi tarafımdan temizle (karşı tarafta kalır).
  // hedef: { tip:'kisi', kisiId } | { tip:'grup', sohbetId }
  const sohbetiSil = useCallback(async (hedef) => {
    if (!kullanici?.id || !hedef) return { __error: 'Oturum yok' }
    let sohbetId = hedef.tip === 'grup' ? hedef.sohbetId : birebirSohbetIdBul(hedef.kisiId)
    if (!sohbetId) return { ok: true }   // hiç yazışma yoksa silinecek bir şey de yok

    const sonuc = await dbSohbetiGizle(sohbetId)
    if (!sonuc.__error) {
      setMesajlar((prev) => prev.filter((m) => m.sohbetId !== sohbetId))
      sohbetleriYenile()
    }
    return sonuc
  }, [kullanici?.id, birebirSohbetIdBul, sohbetleriYenile])

  // ── Grup işlemleri ────────────────────────────────────────────────────────
  const grupOlustur = useCallback(async (ad, katilimciIdler) => {
    const r = await grupSohbetAc(ad, katilimciIdler)
    if (r.__error) return r
    await sohbetleriYenile()
    return r
  }, [sohbetleriYenile])

  const grubaKisiEkle = useCallback(async (sohbetId, kullaniciId) => {
    const r = await dbGrubaKisiEkle(sohbetId, kullaniciId)
    if (!r.__error) await sohbetleriYenile()
    return r
  }, [sohbetleriYenile])

  const gruptanAyril = useCallback(async (sohbetId) => {
    const r = await dbGruptanAyril(sohbetId)
    if (!r.__error) {
      setMesajlar((prev) => prev.filter((m) => m.sohbetId !== sohbetId))
      await sohbetleriYenile()
    }
    return r
  }, [sohbetleriYenile])

  const grupAdiDegistir = useCallback(async (sohbetId, ad) => {
    const r = await dbGrupAdiDegistir(sohbetId, ad)
    if (!r.__error) {
      setSohbetler((prev) => prev.map(s => s.id === sohbetId ? { ...s, ad } : s))
    }
    return r
  }, [])

  // ── Okunmamış sayaçları ───────────────────────────────────────────────────
  const okunmamisSay = useCallback((kisiId) => {
    if (!kullanici?.id) return 0
    return mesajlar.filter((m) =>
      m.gondericiId === kisiId && m.aliciId === kullanici.id && !m.okundu
    ).length
  }, [mesajlar, kullanici?.id])

  const grupOkunmamisSay = useCallback((sohbetId) => {
    if (!kullanici?.id) return 0
    const s = sohbetler.find(x => x.id === sohbetId)
    if (!s) return 0
    const damga = s.sonOkumaTarih ? new Date(s.sonOkumaTarih) : null
    return mesajlar.filter((m) =>
      m.sohbetId === sohbetId &&
      m.gondericiId !== kullanici.id &&
      (!damga || new Date(m.tarih) > damga)
    ).length
  }, [mesajlar, sohbetler, kullanici?.id])

  // Toplam rozet: birebir okunmamışlar + grup okunmamışları
  useEffect(() => {
    if (!kullanici?.id) { setOkunmamis(0); return }
    const birebir = mesajlar.filter((m) => m.aliciId === kullanici.id && !m.okundu).length
    const grup = sohbetler
      .filter(s => s.tip === 'grup')
      .reduce((t, s) => {
        const damga = s.sonOkumaTarih ? new Date(s.sonOkumaTarih) : null
        return t + mesajlar.filter((m) =>
          m.sohbetId === s.id && m.gondericiId !== kullanici.id && (!damga || new Date(m.tarih) > damga)
        ).length
      }, 0)
    setOkunmamis(birebir + grup)
  }, [mesajlar, sohbetler, kullanici?.id])

  return (
    <ChatContext.Provider value={{
      mesajlar,
      sohbetler,
      okunmamis,
      mesajGonder,
      dosyaGonder,
      mesajlariOku,
      grubuOku,
      aktifKonusmaAyarla,
      konusmaGetir,
      grupMesajlari,
      mesajSil,
      sohbetiSil,
      grupOlustur,
      grubaKisiEkle,
      gruptanAyril,
      grupAdiDegistir,
      sohbetleriYenile,
      birebirSohbetIdBul,
      okunmamisSay,
      grupOkunmamisSay,
      cevrimiciMi,
      efektifDurum,
      // Mini pencere
      pencereAcik,
      pencereHedef,
      pencereKucuk,
      pencereAc,
      pencereKapat,
      pencereKucult,
      pencereHedefSec,
      taslakBildir,
    }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() { return useContext(ChatContext) }
