// Teklif takip çekirdeği — DAVRANIŞ testi (tarayıcısız).
//
// Neden bu dosya var: bugün ÜÇ ayrı ekranda aynı hata çıktı — sayaç bir
// kümeden, liste başka kümeden hesaplanıyordu (Görevler'de "rozet 37 · liste
// 0", Servis Talepleri'nde "şerit 116 · liste 115" ve kapalı işlerin hiç
// sayılmaması). Buradaki testler o sınıfı kapatır: kovaların toplamı açık
// teklif sayısını TUTMAK ZORUNDA ve kutuya tıklayınca gelen liste, kutunun
// gösterdiği sayıyla AYNI olmak zorunda.
//
// Çalıştır:  node scripts/test-teklif-takip.mjs

import assert from 'node:assert/strict'
import {
  teklifAcikMi, teklifYasi, yasKovasi, YAS_KOVALARI, yaslandirmaOzeti,
  kovayaGiriyorMu, kisiBazliAcik, kisaTutar, KAPALI_DURUMLAR,
} from '../src/lib/teklifTakip.js'

let gecen = 0, kalan = []
const test = (ad, fn) => {
  try {
    const r = fn()
    if (r && typeof r.then === 'function') throw new Error('Test senkron olmalı (async fn verilmiş)')
    gecen++
  } catch (e) { kalan.push(`${ad}\n    ${e.message.split('\n')[0]}`) }
}

// Sabit "şimdi" — testler takvime göre kaymasın
const SIMDI = new Date('2026-08-11T12:00:00Z')
const gunOnce = (n) => new Date(SIMDI.getTime() - n * 86400000).toISOString()
const teklif = (o = {}) => ({ id: o.id ?? 1, onayDurumu: 'bekliyor', tarih: gunOnce(1), genelToplam: 1000, ...o })

// ─── Açık / kapalı ayrımı ───────────────────────────────────────────────────

test('A1 · sonuçlanmış durumlar kapalı sayılır', () => {
  for (const d of KAPALI_DURUMLAR) assert.equal(teklifAcikMi(teklif({ onayDurumu: d })), false, d)
})

test('A2 · bekliyor / takipte / revizyon AÇIK', () => {
  for (const d of ['bekliyor', 'takipte', 'revizyon']) {
    assert.equal(teklifAcikMi(teklif({ onayDurumu: d })), true, d)
  }
})

test('A3 · durumu boş teklif AÇIK sayılır — gözden kaçmasın', () => {
  assert.equal(teklifAcikMi(teklif({ onayDurumu: null })), true)
  assert.equal(teklifAcikMi(teklif({ onayDurumu: '' })), true)
  assert.equal(teklifAcikMi({}), true)
})

// ─── Yaş hesabı ─────────────────────────────────────────────────────────────

test('Y1 · yaş gün cinsinden doğru', () => {
  assert.equal(teklifYasi(teklif({ tarih: gunOnce(0) }), SIMDI), 0)
  assert.equal(teklifYasi(teklif({ tarih: gunOnce(45) }), SIMDI), 45)
})

test('Y2 · tarih yoksa olusturmaTarih kullanılır, o da yoksa null', () => {
  assert.equal(teklifYasi({ olusturmaTarih: gunOnce(10) }, SIMDI), 10)
  assert.equal(teklifYasi({}, SIMDI), null)
  assert.equal(teklifYasi({ tarih: 'bozuk-tarih' }, SIMDI), null)
})

test('Y3 · kova sınırları — 7/8 ve 30/31 ve 90/91 doğru tarafa düşer', () => {
  assert.equal(yasKovasi(0), '0_7')
  assert.equal(yasKovasi(7), '0_7')
  assert.equal(yasKovasi(8), '8_30')
  assert.equal(yasKovasi(30), '8_30')
  assert.equal(yasKovasi(31), '31_90')
  assert.equal(yasKovasi(90), '31_90')
  assert.equal(yasKovasi(91), '90_')
  assert.equal(yasKovasi(500), '90_')
  assert.equal(yasKovasi(null), null)
})

// ─── KAPSAMA: hiçbir teklif kaybolmasın ─────────────────────────────────────

test('K1 · kovaların toplamı açık teklif sayısını TUTAR', () => {
  const liste = [
    ...Array.from({ length: 5 },  (_, i) => teklif({ id: i,      tarih: gunOnce(2) })),
    ...Array.from({ length: 3 },  (_, i) => teklif({ id: 10 + i, tarih: gunOnce(15) })),
    ...Array.from({ length: 9 },  (_, i) => teklif({ id: 20 + i, tarih: gunOnce(60) })),
    ...Array.from({ length: 4 },  (_, i) => teklif({ id: 30 + i, tarih: gunOnce(200) })),
    // kapalılar sayılmamalı
    teklif({ id: 90, onayDurumu: 'kabul' }), teklif({ id: 91, onayDurumu: 'vazgecildi' }),
  ]
  const o = yaslandirmaOzeti(liste, SIMDI)
  const kovaToplam = Object.values(o.kovalar).reduce((s, k) => s + k.adet, 0) + o.tarihsiz.adet
  assert.equal(o.toplamAdet, 21, 'açık teklif sayısı')
  assert.equal(kovaToplam, o.toplamAdet, 'kovalar toplamı açık sayıyı tutmuyor — kayıt kayboluyor')
  assert.deepEqual(
    [o.kovalar['0_7'].adet, o.kovalar['8_30'].adet, o.kovalar['31_90'].adet, o.kovalar['90_'].adet],
    [5, 3, 9, 4],
  )
})

test('K2 · TARİHSİZ açık teklif sessizce yok olmaz', () => {
  const o = yaslandirmaOzeti([teklif({ tarih: null, olusturmaTarih: null }), teklif()], SIMDI)
  assert.equal(o.tarihsiz.adet, 1)
  assert.equal(o.toplamAdet, 2)
  const kovaToplam = Object.values(o.kovalar).reduce((s, k) => s + k.adet, 0) + o.tarihsiz.adet
  assert.equal(kovaToplam, o.toplamAdet)
})

test('K3 · tutarlar da kova bazında toplanır', () => {
  const o = yaslandirmaOzeti([
    teklif({ id: 1, tarih: gunOnce(2),  genelToplam: 1500 }),
    teklif({ id: 2, tarih: gunOnce(3),  genelToplam: 2500 }),
    teklif({ id: 3, tarih: gunOnce(60), genelToplam: 10000 }),
  ], SIMDI)
  assert.equal(o.kovalar['0_7'].tutar, 4000)
  assert.equal(o.kovalar['31_90'].tutar, 10000)
  assert.equal(o.toplamTutar, 14000)
})

// ─── SAYAÇ ↔ LİSTE TUTARLILIĞI (bu turun asıl hata sınıfı) ──────────────────

test('S1 · kutuya tıklayınca gelen liste, kutunun sayısıyla AYNI', () => {
  const liste = [
    teklif({ id: 1, tarih: gunOnce(1) }),   teklif({ id: 2, tarih: gunOnce(6) }),
    teklif({ id: 3, tarih: gunOnce(20) }),
    teklif({ id: 4, tarih: gunOnce(45) }),  teklif({ id: 5, tarih: gunOnce(88) }),
    teklif({ id: 6, tarih: gunOnce(120) }),
    teklif({ id: 7, tarih: gunOnce(40), onayDurumu: 'kabul' }),      // kapalı
    teklif({ id: 8, tarih: null, olusturmaTarih: null }),            // tarihsiz
  ]
  const o = yaslandirmaOzeti(liste, SIMDI)
  for (const k of YAS_KOVALARI) {
    const listeAdet = liste.filter(t => kovayaGiriyorMu(t, k.id, SIMDI)).length
    assert.equal(listeAdet, o.kovalar[k.id].adet,
      `${k.etiket}: sayaç ${o.kovalar[k.id].adet} · liste ${listeAdet}`)
  }
  const tarihsizListe = liste.filter(t => kovayaGiriyorMu(t, 'tarihsiz', SIMDI)).length
  assert.equal(tarihsizListe, o.tarihsiz.adet)
})

test('S2 · kapalı teklif hiçbir kovaya girmez', () => {
  const kapali = teklif({ onayDurumu: 'kabul', tarih: gunOnce(45) })
  for (const k of [...YAS_KOVALARI.map(x => x.id), 'tarihsiz']) {
    assert.equal(kovayaGiriyorMu(kapali, k, SIMDI), false, k)
  }
})

test('S3 · her açık teklif TAM BİR kovaya girer (ne sıfır, ne iki)', () => {
  const ornekler = [0, 1, 7, 8, 29, 30, 31, 89, 90, 91, 365].map((g, i) =>
    teklif({ id: i, tarih: gunOnce(g) }))
  for (const t of ornekler) {
    const kovalar = [...YAS_KOVALARI.map(x => x.id), 'tarihsiz']
      .filter(k => kovayaGiriyorMu(t, k, SIMDI))
    assert.equal(kovalar.length, 1, `${teklifYasi(t, SIMDI)} günlük teklif ${kovalar.length} kovada`)
  }
})

// ─── Kişi bazlı yük ─────────────────────────────────────────────────────────

test('P1 · kişi bazlı açık yük adet/tutar/en eski gün', () => {
  const r = kisiBazliAcik([
    teklif({ id: 1, olusturanAd: 'ALİ', tarih: gunOnce(10), genelToplam: 100 }),
    teklif({ id: 2, olusturanAd: 'ALİ', tarih: gunOnce(50), genelToplam: 200 }),
    teklif({ id: 3, olusturanAd: 'VELİ', tarih: gunOnce(5), genelToplam: 900 }),
    teklif({ id: 4, olusturanAd: 'ALİ', onayDurumu: 'kabul', genelToplam: 5000 }), // kapalı
  ], SIMDI)
  assert.equal(r[0].kisi, 'ALİ')
  assert.equal(r[0].adet, 2)
  assert.equal(r[0].tutar, 300)
  assert.equal(r[0].enEskiGun, 50)
  assert.equal(r[1].kisi, 'VELİ')
})

test('P2 · sahipsiz teklif "(atanmamış)" altında toplanır — kaybolmaz', () => {
  const r = kisiBazliAcik([teklif({ olusturanAd: null, hazirlayan: null })], SIMDI)
  assert.equal(r[0].kisi, '(atanmamış)')
  assert.equal(r[0].adet, 1)
})

// ─── Biçimleme ──────────────────────────────────────────────────────────────

test('B1 · kısa tutar okunur biçimde', () => {
  assert.equal(kisaTutar(25144331), '₺25,1M')
  assert.equal(kisaTutar(17384273), '₺17,4M')
  // 1M–10M aralığı da M ile gösterilmeli — eşik kayarsa "₺6194B" gibi
  // okunmaz bir çıktı olur (canlıda 0-7 gün kovası tam bu aralıkta: ₺6,19M)
  assert.equal(kisaTutar(6193644), '₺6,2M')
  assert.equal(kisaTutar(1566414), '₺1,6M')
  assert.equal(kisaTutar(1000000), '₺1M')
  // Eşiğin hemen altı binlik ayırıcıyla basılır (TR biçimi) — kabul edilen davranış
  assert.equal(kisaTutar(999999), '₺1.000B')
  assert.equal(kisaTutar(840000), '₺840B')
  assert.equal(kisaTutar(1500), '₺2B')
  assert.equal(kisaTutar(0), '₺0')
  assert.equal(kisaTutar(null), '₺0')
})

// ─── Sınır durumları ────────────────────────────────────────────────────────

test('X1 · boş/bozuk girdi çökmez', () => {
  for (const g of [null, undefined, []]) {
    const o = yaslandirmaOzeti(g, SIMDI)
    assert.equal(o.toplamAdet, 0)
    assert.equal(o.toplamTutar, 0)
  }
  assert.deepEqual(kisiBazliAcik(null, SIMDI), [])
})

test('X2 · tutarı bozuk teklif toplamı NaN yapmaz', () => {
  const o = yaslandirmaOzeti([
    teklif({ id: 1, genelToplam: 'abc' }), teklif({ id: 2, genelToplam: null }),
    teklif({ id: 3, genelToplam: 500 }),
  ], SIMDI)
  assert.equal(o.toplamTutar, 500)
  assert.ok(Number.isFinite(o.toplamTutar))
})

// ─── Sonuç ──────────────────────────────────────────────────────────────────
if (kalan.length) {
  console.error(`\n✗ ${kalan.length} test kaldı (${gecen} geçti):\n`)
  kalan.forEach(k => console.error('  • ' + k))
  process.exit(1)
}
console.log(`✓ ${gecen} test geçti`)
