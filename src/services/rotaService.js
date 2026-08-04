// Araç rota geçmişi — mig 261 (arac_konum_izleri + arac_park_kayitlari).
//
// Veriyi mobiltek-rota-kaydet edge fn'i 2 dakikada bir yazar. Buradaki
// fonksiyonlar yalnız OKUR; RLS okumayı zaten yönetimle sınırlıyor
// (admin veya arac_takip modülü) — arayüz tarafında ek kapı gerekmez.

import { supabase } from '../lib/supabase'

// Bir günde araç başına en fazla ~720 nokta birikir (2 dk × 24 saat).
// Tavan bunun çok üstünde: çok günlük aralık seçilirse de tek istek yeter.
const IZ_TAVAN = 5000

// Haversine — iki GPS noktası arası metre
export const mesafeM = (e1, b1, e2, b2) => {
  const R = 6371000
  const f1 = (e1 * Math.PI) / 180
  const f2 = (e2 * Math.PI) / 180
  const df = ((e2 - e1) * Math.PI) / 180
  const dl = ((b2 - b1) * Math.PI) / 180
  const x = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)))
}

// Bir günün TR saatiyle başlangıç/bitiş sınırları (ISO).
// Kayıtlar timestamptz; gün sınırını yerel saate göre kurmazsak sabahın
// ilk saatleri bir önceki güne düşer.
export const gunAraligi = (gunYYYYAAGG) => {
  const [y, a, g] = gunYYYYAAGG.split('-').map(Number)
  const bas = new Date(y, a - 1, g, 0, 0, 0, 0)
  const bit = new Date(y, a - 1, g, 23, 59, 59, 999)
  return { baslangic: bas.toISOString(), bitis: bit.toISOString() }
}

export const izleriGetir = async (aracId, baslangic, bitis) => {
  if (!aracId) return []
  const { data, error } = await supabase
    .from('arac_konum_izleri')
    .select('id, arac_id, plaka, enlem, boylam, hiz, yon, kontak, adres, olcum_zamani')
    .eq('arac_id', aracId)
    .gte('olcum_zamani', baslangic)
    .lte('olcum_zamani', bitis)
    .order('olcum_zamani', { ascending: true })
    .limit(IZ_TAVAN)
  if (error) { console.warn('[rota] izler:', error.message); return [] }
  return data ?? []
}

export const parklariGetir = async (aracId, baslangic, bitis) => {
  if (!aracId) return []
  // Seçilen aralıkta BAŞLAYAN parklar + aralığa sarkan açık park.
  // (Gece boyu duran araç: baslangic dünde kalır, o park bugün de haritada
  // görünmeli — bu yüzden bitiş tarafından da bakıyoruz.)
  const { data, error } = await supabase
    .from('arac_park_kayitlari')
    .select('id, arac_id, plaka, enlem, boylam, adres, baslangic, bitis, sure_dk')
    .eq('arac_id', aracId)
    .lte('baslangic', bitis)
    .or(`bitis.is.null,bitis.gte.${baslangic}`)
    .order('baslangic', { ascending: true })
  if (error) { console.warn('[rota] parklar:', error.message); return [] }
  return data ?? []
}

// Rota özeti — mesafe/süre/park. GPS gürültüsünü mesafeye katmamak için
// 25 m altındaki sıçramalar yok sayılır (duran araç GPS'i sürekli oynar,
// yoksa "hiç hareket etmedi" diyeceğimiz araç günde 4 km yapmış görünür).
const GURULTU_ESIK_M = 25

export const rotaOzeti = (izler = [], parklar = []) => {
  let metre = 0
  for (let i = 1; i < izler.length; i++) {
    const a = izler[i - 1], b = izler[i]
    const d = mesafeM(Number(a.enlem), Number(a.boylam), Number(b.enlem), Number(b.boylam))
    if (d >= GURULTU_ESIK_M) metre += d
  }

  const hareketli = izler.filter(i => i.kontak)
  const hizlar = izler.map(i => Number(i.hiz || 0)).filter(h => h > 0)

  // Hareket süresi: kontak açık ardışık noktalar arasındaki farkların toplamı.
  // Aralarda kopukluk olabilir (araç kapsama dışı) — 15 dk üstü boşluklar
  // sürekliliği bozar, sayılmaz.
  let hareketDk = 0
  for (let i = 1; i < izler.length; i++) {
    if (!izler[i].kontak) continue
    const fark = (new Date(izler[i].olcum_zamani) - new Date(izler[i - 1].olcum_zamani)) / 60000
    if (fark > 0 && fark <= 15) hareketDk += fark
  }

  const parkDk = parklar.reduce((t, p) => t + (p.sure_dk || 0), 0)

  return {
    nokta: izler.length,
    mesafeKm: metre / 1000,
    hareketDk: Math.round(hareketDk),
    hareketliNokta: hareketli.length,
    maxHiz: hizlar.length ? Math.max(...hizlar) : 0,
    ortHiz: hizlar.length ? hizlar.reduce((a, b) => a + b, 0) / hizlar.length : 0,
    parkSayisi: parklar.length,
    parkDk,
    ilk: izler[0]?.olcum_zamani ?? null,
    son: izler[izler.length - 1]?.olcum_zamani ?? null,
  }
}

// Kayıt tutulan araçlar — rota ekranındaki araç listesi Mobiltek'ten canlı
// gelir, ama geçmişte kaydı olup bugün API'de görünmeyen araç da seçilebilmeli.
export const kayitliAraclariGetir = async () => {
  const { data, error } = await supabase
    .from('arac_iz_durumu')
    .select('arac_id, plaka, son_olcum')
    .order('plaka')
  if (error) { console.warn('[rota] araclar:', error.message); return [] }
  return data ?? []
}

// ── YOLA OTURTMA (rota tahmini) ────────────────────────────────────────
// SORUN: Mobiltek'ten 1-2 dakikada bir yalnız "son konum" alabiliyoruz, oysa
// cihaz 10 saniyeye kadar sık nokta üretiyor. Aradaki noktalar bize hiç
// gelmediği için iki nokta kuş uçuşu düz çizgiyle birleşiyor ve "hangi
// yoldan gitti" görünmüyor (kullanıcı şikayeti, 04.08).
//
// ÇÖZÜM: elimizdeki noktaları OSRM sürüş ağına verip aradaki güzergâhı
// doldurmak. Çizgi artık sokaklara oturur.
//
// ⚠️ BU BİR TAHMİNDİR, ölçüm değil. İki nokta arasında araç başka bir
// yoldan gitmiş olabilir; OSRM en makul sürüş rotasını verir. Arayüzde
// bu ayrım kullanıcıya açıkça söylenir. Kesin çözüm Mobiltek'in
// location-logs ucunun yetkisidir (mig 261).
const OSRM = 'https://router.project-osrm.org/route/v1/driving/'
const OSRM_MAX_NOKTA = 90      // demo sunucu sınırı ~100; pay bırakıldı
const ATLAMA_ESIK_KM = 8       // bundan uzak sıçramada tahmin güvenilmez

export const yolaOturt = async (izler = []) => {
  const noktalar = izler
    .filter(i => i.enlem && i.boylam)
    .map(i => [Number(i.boylam), Number(i.enlem)])   // OSRM: lon,lat
  if (noktalar.length < 2) return null

  // Çok nokta varsa eşit aralıkla seyrelt — şekil korunur, URL şişmez
  let kullanilacak = noktalar
  if (noktalar.length > OSRM_MAX_NOKTA) {
    const adim = Math.ceil(noktalar.length / OSRM_MAX_NOKTA)
    kullanilacak = noktalar.filter((_, i) => i % adim === 0)
    if (kullanilacak[kullanilacak.length - 1] !== noktalar[noktalar.length - 1]) {
      kullanilacak.push(noktalar[noktalar.length - 1])
    }
  }

  // Uzak sıçramalar (araç kapsama dışı kalmış, arada saatler var) tahmini
  // saçmalatır — böyle segmentlerde rotayı bölüp parça parça isteriz.
  const parcalar = []
  let mevcut = [kullanilacak[0]]
  for (let i = 1; i < kullanilacak.length; i++) {
    const [o1, e1] = kullanilacak[i - 1]
    const [o2, e2] = kullanilacak[i]
    if (mesafeM(e1, o1, e2, o2) / 1000 > ATLAMA_ESIK_KM) {
      if (mevcut.length > 1) parcalar.push(mevcut)
      mevcut = [kullanilacak[i]]
    } else {
      mevcut.push(kullanilacak[i])
    }
  }
  if (mevcut.length > 1) parcalar.push(mevcut)
  if (!parcalar.length) return null

  try {
    const hatlar = await Promise.all(parcalar.map(async (p) => {
      const yol = p.map(([lon, lat]) => `${lon.toFixed(5)},${lat.toFixed(5)}`).join(';')
      const r = await fetch(`${OSRM}${yol}?overview=full&geometries=geojson`)
      if (!r.ok) return null
      const j = await r.json()
      const koord = j?.routes?.[0]?.geometry?.coordinates
      if (!Array.isArray(koord) || koord.length < 2) return null
      return koord.map(([lon, lat]) => [lat, lon])   // Leaflet: lat,lng
    }))
    const gecerli = hatlar.filter(Boolean)
    return gecerli.length ? gecerli : null
  } catch (e) {
    // Yol servisi erişilemezse harita düz çizgiye düşer — özellik kaybolur,
    // sayfa çalışmaya devam eder.
    console.warn('[rota] yola oturtma başarısız:', e?.message)
    return null
  }
}

export const sureMetni = (dk) => {
  if (!dk || dk < 1) return '—'
  const s = Math.floor(dk / 60), d = Math.round(dk % 60)
  return s > 0 ? `${s} sa ${d} dk` : `${d} dk`
}
