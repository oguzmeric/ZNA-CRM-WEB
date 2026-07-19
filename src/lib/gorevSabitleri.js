// Görev modülü sözlükleri — 44 maddelik spek (2026-07-19).
// DB'de SAKLANAN durumlar + HESAPLANAN durumlar (suresi_gecti / baska_goreve_bagli)
// ayrımı bilinçli: gecikme ve bağımlılık her an tarihten/bağdan türetilir, kolonda
// tutulursa bayatlıyor. Mevcut veri değerleri (bekliyor/devam/tamamlandi/iptal) korunur.

// ─── Durumlar (madde 10) ────────────────────────────────────────────────────
export const GOREV_DURUMLARI = [
  { id: 'taslak',           isim: 'Taslak',            renk: 'var(--text-muted)',  grup: 'pasif' },
  { id: 'bekliyor',         isim: 'Atandı',            renk: 'var(--info)',        grup: 'acik' },
  { id: 'devam',            isim: 'Devam Ediyor',      renk: 'var(--warning)',     grup: 'acik' },
  { id: 'beklemede',        isim: 'Beklemede',         renk: '#f97316',            grup: 'acik' },
  { id: 'bilgi_bekleniyor', isim: 'Bilgi Bekleniyor',  renk: '#a855f7',            grup: 'acik' },
  { id: 'onay_bekliyor',    isim: 'Onay Bekliyor',     renk: '#06b6d4',            grup: 'acik' },
  { id: 'revize',           isim: 'Revize İstendi',    renk: '#ec4899',            grup: 'acik' },
  { id: 'tamamlandi',       isim: 'Tamamlandı',        renk: 'var(--success)',     grup: 'kapali' },
  { id: 'reddedildi',       isim: 'Reddedildi',        renk: 'var(--danger)',      grup: 'kapali' },
  { id: 'iptal',            isim: 'İptal Edildi',      renk: 'var(--text-muted)',  grup: 'kapali' },
]

export const DURUM_MAP = Object.fromEntries(GOREV_DURUMLARI.map(d => [d.id, d]))
// Legacy alias: eski mobil sürümler 'devam_ediyor' yazabiliyor (mig 197 normalize
// eder; okuma anında da aynı görünsün)
DURUM_MAP.devam_ediyor = DURUM_MAP.devam
export const durumBilgi = (id) => DURUM_MAP[id] || { id, isim: id || '—', renk: 'var(--text-muted)', grup: 'acik' }
export const ACIK_DURUMLAR = GOREV_DURUMLARI.filter(d => d.grup === 'acik').map(d => d.id)
export const KAPALI_DURUMLAR = GOREV_DURUMLARI.filter(d => d.grup === 'kapali').map(d => d.id)

// Durum değişikliğinde sebep zorunlu olanlar (madde 10 — Beklemede sebep şart)
export const SEBEP_ZORUNLU_DURUMLAR = ['beklemede', 'bilgi_bekleniyor', 'iptal']

// ─── Hesaplanan durumlar ────────────────────────────────────────────────────
export const bugunStr = () => new Date().toISOString().slice(0, 10)

export const gorevGecikti = (g) =>
  !!g?.sonTarih && !KAPALI_DURUMLAR.includes(g.durum) && String(g.sonTarih).slice(0, 10) < bugunStr()

export const gecikmeGunu = (g) => {
  if (!gorevGecikti(g)) return 0
  const fark = Date.now() - new Date(String(g.sonTarih).slice(0, 10) + 'T23:59:59').getTime()
  return Math.max(1, Math.ceil(fark / 86400000))
}

// Etkin (görünen) durum: gecikme saklanan durumu ezer (madde 26)
export const etkinDurum = (g) => {
  if (gorevGecikti(g)) return { id: 'suresi_gecti', isim: `${gecikmeGunu(g)} gün gecikti`, renk: 'var(--danger)', grup: 'acik' }
  return durumBilgi(g?.durum)
}

// ─── Kabul akışı (madde 10-11) ──────────────────────────────────────────────
export const KABUL_DURUMLARI = [
  { id: 'atandi',       isim: 'Atandı',       renk: 'var(--info)' },
  { id: 'goruldu',      isim: 'Görüldü',      renk: '#06b6d4' },
  { id: 'kabul_edildi', isim: 'Kabul Edildi', renk: 'var(--success)' },
  { id: 'reddedildi',   isim: 'Reddedildi',   renk: 'var(--danger)' },
]
export const KABUL_MAP = Object.fromEntries(KABUL_DURUMLARI.map(d => [d.id, d]))

export const RET_SEBEPLERI = [
  'Görev uzmanlık alanım dışında',
  'Görev tarihi uygun değil',
  'Eksik bilgi bulunuyor',
  'Yanlış kişiye atandı',
  'Başka görev nedeniyle müsait değilim',
  'Yetkim dışında',
  'Diğer',
]

// ─── Öncelik (madde 27 — 5 seviye; mevcut normal/orta/yuksek verisi korunur) ─
export const GOREV_ONCELIKLERI = [
  { id: 'dusuk',  isim: 'Düşük',  renk: 'var(--text-muted)', sira: 1, agirlik: 1 },
  { id: 'normal', isim: 'Normal', renk: 'var(--info)',       sira: 2, agirlik: 2 },
  { id: 'orta',   isim: 'Orta',   renk: 'var(--info)',       sira: 2, agirlik: 2 }, // legacy eşdeğer
  { id: 'yuksek', isim: 'Yüksek', renk: 'var(--warning)',    sira: 3, agirlik: 3 },
  { id: 'acil',   isim: 'Acil',   renk: '#f97316',           sira: 4, agirlik: 5 },
  { id: 'kritik', isim: 'Kritik', renk: 'var(--danger)',     sira: 5, agirlik: 8 },
]
export const ONCELIK_MAP = Object.fromEntries(GOREV_ONCELIKLERI.map(o => [o.id, o]))
export const oncelikBilgi = (id) => ONCELIK_MAP[id] || ONCELIK_MAP.normal
// Formlarda gösterilecek liste (legacy 'orta' gizli — 'normal' ile aynı)
export const ONCELIK_SECENEKLERI = GOREV_ONCELIKLERI.filter(o => o.id !== 'orta')

// ─── Gizlilik (madde 20) ────────────────────────────────────────────────────
export const GIZLILIK_SECENEKLERI = [
  { id: 'standart',               isim: 'Standart (tüm ekip görür)' },
  { id: 'katilimcilar',           isim: 'Yalnızca görev katılımcıları' },
  { id: 'yonetici_katilimcilar',  isim: 'Yönetici ve görev katılımcıları' },
  { id: 'ozel',                   isim: 'Özel ve gizli' },
]

// ─── Atama türü (madde 6.2) ─────────────────────────────────────────────────
export const ATAMA_TURLERI = [
  { id: 'tek',           isim: 'Tek kişiye' },
  { id: 'ana_katilimci', isim: 'Ana sorumlu + katılımcılar' },
  { id: 'ortak',         isim: 'Ortak sorumluluk' },
]

// ─── Ana görev tamamlama kuralı (madde 13) ──────────────────────────────────
export const TAMAMLAMA_KURALLARI = [
  { id: 'hepsi',      isim: 'Tüm alt görevler bitmeden kapatılamaz' },
  { id: 'zorunlular', isim: 'Zorunlu alt görevler bitmeden kapatılamaz' },
  { id: 'serbest',    isim: 'Ana sorumlu gerekçeyle kapatabilir' },
]

// ─── Bağımlılık (madde 16) ──────────────────────────────────────────────────
export const BAGIMLILIK_TURLERI = [
  { id: 'once_tamamlanmali',    isim: 'Seçilen görev bitmeden bu görev tamamlanamaz' },
  { id: 'sonra_baslayabilir',   isim: 'Seçilen görev bitince başlayabilir' },
  { id: 'birlikte',             isim: 'Birlikte yürütülür (bilgi amaçlı)' },
]

// ─── Gecikme sebepleri (kapı + devam modalıyla ORTAK — duplicate'lik giderildi)
export const GECIKME_SEBEPLERI = [
  { id: 'hava_muhalefeti',   isim: 'Hava Muhalefeti',   ikon: '🌧️' },
  { id: 'program_yogunlugu', isim: 'Program Yoğunluğu', ikon: '📅' },
  { id: 'tamir_ariza',       isim: 'Tamir / Arıza',     ikon: '🔧' },
  { id: 'uretici_tedarik',   isim: 'Üretici / Tedarik', ikon: '📦' },
]

// ─── İlerleme (madde 15) ────────────────────────────────────────────────────
export const ILERLEME_ADIMLARI = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

export const ilerlemeOtomatik = (altGorevler) => {
  const aktif = (altGorevler || []).filter(a => a.durum !== 'iptal' && a.durum !== 'reddedildi')
  if (!aktif.length) return null
  const toplam = aktif.reduce((t, a) => t + (a.durum === 'tamamlandi' ? 100 : Number(a.ilerleme) || 0), 0)
  return Math.round(toplam / aktif.length)
}

// ─── Ana görev kapatma kontrolü (madde 13) ──────────────────────────────────
// Dönüş: { engel: bool, mesaj, acikAltlar: [] }
export const anaGorevKapatKontrol = (gorev, altGorevler) => {
  const acik = (altGorevler || []).filter(a => !KAPALI_DURUMLAR.includes(a.durum))
  if (!acik.length) return { engel: false, mesaj: '', acikAltlar: [] }
  const kural = gorev?.tamamlamaKurali || 'zorunlular'
  if (kural === 'serbest') {
    return { engel: false, gerekceli: true, acikAltlar: acik, mesaj: `${acik.length} alt görev hâlâ açık — gerekçe yazarak kapatabilirsin.` }
  }
  const engelleyen = kural === 'hepsi' ? acik : acik.filter(a => a.zorunlu !== false)
  if (!engelleyen.length) return { engel: false, mesaj: '', acikAltlar: acik }
  return {
    engel: true, acikAltlar: engelleyen,
    mesaj: kural === 'hepsi'
      ? `Açık alt görevler bulunduğu için ana görev tamamlanamaz (${engelleyen.length} açık).`
      : `Zorunlu alt görevler tamamlanmadan ana görev kapatılamaz (${engelleyen.length} açık).`,
  }
}

// ─── Yetki (madde 9) — kullanicilar.gorev_yetki jsonb ───────────────────────
export const VARSAYILAN_GOREV_YETKI = { altGorev: 'herkes', devir: true, cokluAtama: true, sureDegistir: true, altIptal: true }
export const gorevYetkisi = (kullanici) => ({ ...VARSAYILAN_GOREV_YETKI, ...(kullanici?.gorevYetki || {}) })
export const altGorevVerebilirMi = (kullanici) => {
  if (kullanici?.rol === 'admin') return true
  return gorevYetkisi(kullanici).altGorev !== 'yok'
}

// ─── İş yükü (madde 35) ─────────────────────────────────────────────────────
export const isYukuHesapla = (gorevListesi, kullaniciId) => {
  const id = String(kullaniciId)
  const benim = (gorevListesi || []).filter(g =>
    String(g.atananId ?? '') === id || String(g.atanan ?? '') === id ||
    (Array.isArray(g.ekip) && g.ekip.map(String).includes(id)))
  const acik = benim.filter(g => !KAPALI_DURUMLAR.includes(g.durum) && g.durum !== 'taslak')
  const bugun = bugunStr()
  const bugunBitecek = acik.filter(g => String(g.sonTarih || '').slice(0, 10) === bugun)
  const geciken = acik.filter(g => gorevGecikti(g))
  const kritik = acik.filter(g => g.oncelik === 'kritik' || g.oncelik === 'acil')
  const puan = acik.reduce((t, g) => t + oncelikBilgi(g.oncelik).agirlik, 0) + geciken.length * 2
  const seviye = puan >= 25 ? 'Yüksek' : puan >= 12 ? 'Orta' : 'Düşük'
  return { acik: acik.length, bugunBitecek: bugunBitecek.length, geciken: geciken.length, kritik: kritik.length, puan, seviye }
}

// ─── Katılımcı yardımcıları ─────────────────────────────────────────────────
export const gorevKatilimcisiMi = (g, kullanici) => {
  if (!g || !kullanici) return false
  const id = String(kullanici.id)
  return String(g.atananId ?? '') === id || String(g.atanan ?? '') === id ||
    String(g.olusturanId ?? '') === id || String(g.onaylayiciId ?? '') === id ||
    (Array.isArray(g.ekip) && g.ekip.map(String).includes(id)) ||
    (Array.isArray(g.gozlemciler) && g.gozlemciler.map(String).includes(id)) ||
    g.olusturanAd === kullanici.ad || g.olusturanAd === kullanici.kullaniciAdi
}

export const gorevSorumlusuMu = (g, kullanici) => {
  if (!g || !kullanici) return false
  const id = String(kullanici.id)
  return String(g.atananId ?? '') === id || String(g.atanan ?? '') === id ||
    (g.atamaTuru === 'ortak' && Array.isArray(g.ekip) && g.ekip.map(String).includes(id))
}
