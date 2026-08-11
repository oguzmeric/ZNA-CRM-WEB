// Teklif tutar hesabı — DAVRANIŞ testi (tarayıcısız).
//
// Neden bu dosya var: teklif toplamları altı ayrı dosyada kopyalanmıştı ve
// kopyalar sessizce ayrıştı — aynı teklifin PDF'i ile Excel'i farklı KDV
// gösteriyordu (Excel oranı sabit %20 sayıyordu; canlıda %18'li 20 teklif var).
// Buradaki testler hem doğru formülü kilitler hem de çıktı dosyalarının hesabı
// kendi içine geri kopyalamadığını denetler.
//
// Çalıştır:  node scripts/test-teklif-hesap.mjs
// Tutar hesabını değiştirecekseniz ÖNCE burayı güncelleyin.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  satirHesapla, teklifHesapla, oranMetni, iskontoEtiketi, satirIskontoMetni, kdvSatirlari,
  tutarMetni, r2,
} from '../src/lib/teklifHesap.js'

let gecen = 0, kalan = []
// Belgede gösterilen tutarlar toplandığında tutmalı — müşteri hesap makinesiyle
// kontrol ettiğinde açık çıkmasın. Her senaryoda ayrıca bunu doğruluyoruz.
const belgeTutarli = (h) => {
  assert.equal(r2(h.brutToplam - h.satirIskontoToplam), h.araToplam, 'brüt − iskonto ≠ ara toplam')
  assert.equal(r2(h.araToplam - h.genelIskontoTutar + h.kdvToplam), h.genelToplam, 'ara − genel iskonto + KDV ≠ genel toplam')
  assert.equal(r2(kdvSatirlari(h).reduce((t, s) => t + s.tutar, 0)), h.kdvToplam, 'KDV kırılımı toplamı KDV toplamını tutmuyor')
}
// ⚠️ Testler SENKRON olmalı: async bir test reject olursa buradaki try/catch
// onu yakalayamaz, "geçti" yazılır ve süreç sonradan çöker.
const test = (ad, fn) => {
  try {
    const r = fn()
    if (r && typeof r.then === 'function') throw new Error('Test senkron olmalı (async fn verilmiş)')
    gecen++
  } catch (e) { kalan.push(`${ad}\n    ${e.message.split('\n')[0]}`) }
}

const kaynak = (yol) => readFileSync(new URL(`../${yol}`, import.meta.url), 'utf8')
const satirYap = ([miktar, birimFiyat, iskonto, kdv]) => ({ miktar, birimFiyat, iskonto, kdv })

// ─── Canlı veriden alınmış gerçek teklifler (10.08.2026) ────────────────────
// Beklenen toplamlar DB'deki genel_toplam kolonuyla doğrulanmıştır.
const TEK_0672 = [
  [1, 1150, 11.09122, 20], [2, 3000, 11.09122, 20], [8, 650, 11.09122, 20],
  [182, 66, 11.09122, 20], [91, 98, 11.09122, 20], [286, 1.05, 11.09122, 20],
  [15, 400, 11.09122, 20], [1, 796.02, 11.09122, 20], [3, 387.8, 11.09122, 20],
  [2, 36.01, 11.09122, 20], [7, 14, 11.09122, 20], [36, 0.63, 11.09122, 20],
  [32, 5.04, 11.09122, 20], [72, 11.76, 11.09122, 20],
].map(satirYap)

// Teklif "12" — KDV %18, satırların yalnız biri iskontolu
const TEKLIF_12 = [[25, 22.1, 5, 18], [1, 5100, 0, 18], [1, 200, 0, 18]].map(satirYap)

// ─── Satır hesabı ───────────────────────────────────────────────────────────

test('S1 · brüt = miktar × birim fiyat', () => {
  const h = satirHesapla({ miktar: 10, birimFiyat: 100, iskonto: 0, kdv: 20 })
  assert.equal(h.brut, 1000)
  assert.equal(h.net, 1000)
  assert.equal(h.kdvTutar, 200)
  assert.equal(h.toplam, 1200)
})

test('S2 · iskonto brütten düşer, KDV net üzerinden hesaplanır', () => {
  const h = satirHesapla({ miktar: 10, birimFiyat: 100, iskonto: 10, kdv: 20 })
  assert.equal(h.iskontoTutar, 100)
  assert.equal(h.net, 900)
  assert.equal(h.kdvTutar, 180)   // 1000'in değil 900'ün %20'si
  assert.equal(h.toplam, 1080)
})

test('S3 · KDV alanı hiç yoksa %20 varsayılır (eski/içe aktarılmış satır)', () => {
  assert.equal(satirHesapla({ miktar: 1, birimFiyat: 100 }).kdvOran, 20)
  assert.equal(satirHesapla({ miktar: 1, birimFiyat: 100, kdv: null }).kdvOran, 20)
  assert.equal(satirHesapla({ miktar: 1, birimFiyat: 100, kdv: '' }).kdvOran, 20)
})

test('S4 · KDV açıkça 0 ise 0 kalır — `kdv || 20` tuzağı', () => {
  const h = satirHesapla({ miktar: 1, birimFiyat: 100, kdv: 0 })
  assert.equal(h.kdvOran, 0)
  assert.equal(h.kdvTutar, 0)     // eski kalıp burada 20 yazıp ₺20 KDV uyduruyordu
  assert.equal(h.toplam, 100)
})

test('S5 · bozuk/eksik veri sıfıra düşer, çökmez', () => {
  const h = satirHesapla({ miktar: 'abc', birimFiyat: undefined, iskonto: null })
  assert.equal(h.brut, 0)
  assert.equal(h.toplam, 0)
  assert.equal(satirHesapla(null).brut, 0)
})

// ─── Teklif toplamı — gerçek kayıtlarla ─────────────────────────────────────

test('T1 · TEK-0672 (14 satır, tek oran) DB genel toplamını üretir', () => {
  const h = teklifHesapla({ satirlar: TEK_0672 })
  assert.equal(h.brutToplam, 42740.42)
  assert.equal(h.satirIskontoToplam, 4740.44)
  assert.equal(h.araToplam, 37999.98)
  assert.equal(h.kdvToplam, 7600)
  assert.equal(h.genelToplam, 45599.98)   // DB: teklifler.genel_toplam
  belgeTutarli(h)
})

test('T2 · TEK-0672 tek iskonto oranı yakalanır, etiket %11,09 olur', () => {
  const h = teklifHesapla({ satirlar: TEK_0672 })
  assert.equal(h.tekIskontoOrani, 11.09122)
  assert.equal(iskontoEtiketi(h), 'İskonto (%11,09)')
  assert.equal(h.satirIskontoVar, true)
})

test('T3 · Teklif 12 (KDV %18) DB genel toplamını üretir', () => {
  const h = teklifHesapla({ satirlar: TEKLIF_12 })
  assert.equal(h.brutToplam, 5852.5)
  assert.equal(h.satirIskontoToplam, 27.63)
  assert.equal(h.araToplam, 5824.87)
  assert.equal(h.kdvToplam, 1048.48)
  assert.equal(h.genelToplam, 6873.35)    // DB: teklifler.genel_toplam
  belgeTutarli(h)
})

test('T4 · REGRESYON — Excel\'in sabit %20 KDV hatası geri gelmemeli', () => {
  const h = teklifHesapla({ satirlar: TEKLIF_12 })
  const eskiExcelKdv = h.araToplam * 0.20      // karelExcel/trassirExcel'in eski satırı
  assert.equal(r2(eskiExcelKdv), 1164.97)
  assert.ok(r2(eskiExcelKdv - h.kdvToplam) > 116)  // müşteriye ₺116'dan fazla KDV yazıyordu
  assert.notEqual(r2(h.kdvToplam), r2(eskiExcelKdv))
})

test('T5 · KDV kırılımı gerçek oranı basar — "%20" sabiti değil', () => {
  const s = kdvSatirlari(teklifHesapla({ satirlar: TEKLIF_12 }))
  assert.equal(s.length, 1)
  assert.equal(s[0].etiket, 'KDV %18')
})

test('T6 · karışık KDV oranı ayrı satırlara bölünür, yüksekten düşüğe', () => {
  const h = teklifHesapla({ satirlar: [
    { miktar: 1, birimFiyat: 1000, iskonto: 0, kdv: 18 },
    { miktar: 1, birimFiyat: 1000, iskonto: 0, kdv: 20 },
  ] })
  const s = kdvSatirlari(h)
  assert.deepEqual(s.map(x => x.etiket), ['KDV %20', 'KDV %18'])
  assert.equal(s[0].tutar, 200)
  assert.equal(s[1].tutar, 180)
  assert.equal(r2(h.kdvToplam), 380)
})

test('T7 · bazı satırlar iskontosuzsa tek oran iddia edilmez — "ort." yazılır', () => {
  const h = teklifHesapla({ satirlar: TEKLIF_12 })
  assert.equal(h.tekIskontoOrani, null)        // %5'lik satır var ama diğer ikisi iskontosuz
  assert.equal(r2(h.efektifIskontoOrani), 0.47)
  assert.equal(iskontoEtiketi(h), 'İskonto (ort. %0,47)')
})

// ─── Yuvarlama: belge kendi içinde tutmalı ──────────────────────────────────

test('Y1 · tutarlar kuruşa yuvarlanır — üç ondalık basılmaz', () => {
  // Eski çıktı ₺45.599,983 yazıyordu: Intl varsayılanı maximumFractionDigits=3
  assert.equal(tutarMetni(45599.983), '45.599,98')
  assert.equal(tutarMetni(1226.9414), '1.226,94')
  assert.equal(tutarMetni(1000), '1.000,00')
  assert.equal(tutarMetni(0), '0,00')
  assert.ok(!/,\d{3}/.test(tutarMetni(7599.9972)))
})

test('Y2 · satır bileşenleri kuruşa yuvarlı döner', () => {
  const h = satirHesapla({ miktar: 1, birimFiyat: 1150, iskonto: 11.09122, kdv: 20 })
  assert.equal(h.iskontoTutar, 127.55)
  assert.equal(h.net, 1022.45)
  assert.equal(h.kdvTutar, 204.49)
  assert.equal(h.toplam, 1226.94)
})

test('Y2b · ikili kayan nokta artığı satıra sızmaz', () => {
  // 0,30 − 0,10 kayan noktada 0.19999999999999998 verir; yuvarlanmazsa bu değer
  // toplamlara taşınır ve belgede kuruş kayması yapar.
  const h = satirHesapla({ miktar: 1, birimFiyat: 0.3, iskonto: 33.33, kdv: 20 })
  assert.equal(h.iskontoTutar, 0.1)
  assert.equal(h.net, 0.2)
  assert.equal(String(h.net), '0.2')
  const t = satirHesapla({ miktar: 1, birimFiyat: 1.1, iskonto: 0, kdv: 20 })
  assert.equal(t.toplam, 1.32)          // 1.1 + 0.22 = 1.3199999999999998
  assert.equal(String(t.toplam), '1.32')
})

test('Y3 · REGRESYON — brüt − iskonto = ara toplam (1 kuruş açık kalmamalı)', () => {
  // Eski hesapta teklif 12 için 5.852,50 − 27,63 = 5.824,88 yazıyordu (doğrusu 5.824,87)
  for (const satirlar of [TEK_0672, TEKLIF_12]) belgeTutarli(teklifHesapla({ satirlar }))
})

test('Y4 · KDV oran grubunun yuvarlanmış matrahından hesaplanır', () => {
  // Satır satır yuvarlanmış KDV'leri toplamak TEK-0672'de ₺7.600,01 veriyor ve
  // genel toplamı sistemdeki 45.599,98'den ayırıyordu.
  const h = teklifHesapla({ satirlar: TEK_0672 })
  const satirKdvToplami = r2(h.satirlar.reduce((t, s) => t + s.kdvTutar, 0))
  assert.equal(satirKdvToplami, 7600.01)
  assert.equal(h.kdvToplam, 7600)
  assert.equal(h.genelToplam, 45599.98)
})

test('Y5 · genel iskontolu belgede de aritmetik tutar', () => {
  const h = teklifHesapla({ genelIskonto: 7.5, satirlar: [
    { miktar: 3, birimFiyat: 333.33, iskonto: 12.5, kdv: 20 },
    { miktar: 7, birimFiyat: 19.99, iskonto: 3, kdv: 18 },
  ] })
  belgeTutarli(h)
})

test('T8 · farklı oranlı satırlarda efektif oran brüt üzerinden hesaplanır', () => {
  const h = teklifHesapla({ satirlar: [
    { miktar: 1, birimFiyat: 1000, iskonto: 10, kdv: 20 },
    { miktar: 1, birimFiyat: 1000, iskonto: 20, kdv: 20 },
  ] })
  assert.equal(h.brutToplam, 2000)
  assert.equal(h.satirIskontoToplam, 300)
  assert.equal(h.efektifIskontoOrani, 15)
  assert.equal(iskontoEtiketi(h), 'İskonto (ort. %15)')
})

// ─── Genel iskonto ──────────────────────────────────────────────────────────

test('G1 · genel iskonto yoksa toplam = ara + KDV (mevcut çıktı davranışı)', () => {
  const h = teklifHesapla({ satirlar: [{ miktar: 1, birimFiyat: 1000, iskonto: 0, kdv: 20 }] })
  assert.equal(h.genelIskontoVar, false)
  assert.equal(h.genelIskontoTutar, 0)
  assert.equal(h.genelToplam, 1200)
})

test('G2 · genel iskonto ara toplamdan düşer — TeklifDetay ekranıyla aynı formül', () => {
  // Ekrandaki hesap: genelToplam = araToplam − genelIskontoTutar + kdvToplam
  // (KDV, genel iskonto düşülmeden hesaplanır — belge ile sistem ayrışmasın diye birebir korundu)
  const h = teklifHesapla({ genelIskonto: 5, satirlar: [
    { miktar: 10, birimFiyat: 100, iskonto: 10, kdv: 20 },
  ] })
  assert.equal(h.araToplam, 900)
  assert.equal(h.genelIskontoOran, 5)
  assert.equal(h.genelIskontoTutar, 45)
  assert.equal(h.kdvToplam, 180)
  assert.equal(h.genelToplam, 1035)   // 900 − 45 + 180
})

test('G3 · satır iskontosu + genel iskonto birlikte çalışır', () => {
  const h = teklifHesapla({ genelIskonto: 10, satirlar: [
    { miktar: 1, birimFiyat: 1000, iskonto: 20, kdv: 20 },
  ] })
  assert.equal(h.brutToplam, 1000)
  assert.equal(h.satirIskontoToplam, 200)
  assert.equal(h.araToplam, 800)
  assert.equal(h.genelIskontoTutar, 80)
  assert.equal(r2(h.genelToplam), 880)   // 800 − 80 + 160
})

// ─── Biçimleme ──────────────────────────────────────────────────────────────

test('B1 · tam sayı oran gereksiz ondalık basmaz', () => {
  assert.equal(oranMetni(10), '10')
  assert.equal(oranMetni(20), '20')
  assert.equal(oranMetni(0), '0')
})

test('B2 · ondalıklı oran iki basamağa yuvarlanır, TR virgülü kullanılır', () => {
  assert.equal(oranMetni(11.09122), '11,09')
  assert.equal(oranMetni(0.4720), '0,47')
  assert.equal(oranMetni(7.5), '7,5')
})

test('B3 · iskontosuz satır hücresi tire — "0%" gürültüsü basılmaz', () => {
  assert.equal(satirIskontoMetni(0), '—')
  assert.equal(satirIskontoMetni(null), '—')
  assert.equal(satirIskontoMetni(undefined), '—')
  assert.equal(satirIskontoMetni(11.09122), '%11,09')
  assert.equal(satirIskontoMetni(10), '%10')
})

// ─── Sınır durumları ────────────────────────────────────────────────────────

test('K1 · boş teklif çökmez, her şey sıfır', () => {
  for (const t of [null, undefined, {}, { satirlar: [] }, { satirlar: null }]) {
    const h = teklifHesapla(t)
    assert.equal(h.genelToplam, 0)
    assert.equal(h.satirIskontoVar, false)
    assert.equal(h.tekIskontoOrani, null)
  }
})

test('K2 · brüt 0 iken efektif oran sıfıra bölünmez', () => {
  const h = teklifHesapla({ satirlar: [{ miktar: 0, birimFiyat: 0, iskonto: 10, kdv: 20 }] })
  assert.equal(h.efektifIskontoOrani, 0)
  assert.ok(Number.isFinite(h.efektifIskontoOrani))
  assert.equal(h.satirIskontoVar, true)   // oran girilmiş: kolon yine de basılmalı
})

test('K3 · %100 iskonto tam bedelsiz satır üretir', () => {
  const h = satirHesapla({ miktar: 5, birimFiyat: 200, iskonto: 100, kdv: 20 })
  assert.equal(h.net, 0)
  assert.equal(h.kdvTutar, 0)
  assert.equal(h.toplam, 0)
})

// ─── Kaynak denetimi: hesap geri kopyalanmasın ──────────────────────────────

test('D1 · çıktı şablonları hesabı kendi içinde tekrar yazmıyor', () => {
  const dosyalar = [
    'src/pages/teklifCikti/StandartCikti.jsx',
    'src/pages/teklifCikti/KarelCikti.jsx',
    'src/pages/teklifCikti/TrassirCikti.jsx',
    'src/lib/teklifExport/standartExcel.js',
    'src/lib/teklifExport/karelExcel.js',
    'src/lib/teklifExport/trassirExcel.js',
  ]
  for (const d of dosyalar) {
    const k = kaynak(d)
    assert.ok(k.includes('teklifHesap'), `${d}: ortak hesap modülünü kullanmıyor`)
    assert.ok(!/iskonto\s*\|\|\s*0\)\s*\/\s*100/.test(k), `${d}: iskonto hesabı geri kopyalanmış`)
    assert.ok(!/araToplam\s*\*\s*0\.2/.test(k), `${d}: sabit %20 KDV hesabı geri gelmiş`)
  }
})

test('D2 · Karel/Trassir çıktılarında sabit "Kdv % 20" etiketi kalmamalı', () => {
  for (const d of ['src/pages/teklifCikti/KarelCikti.jsx', 'src/pages/teklifCikti/TrassirCikti.jsx',
                   'src/lib/teklifExport/karelExcel.js', 'src/lib/teklifExport/trassirExcel.js']) {
    assert.ok(!/Kdv % 20/.test(kaynak(d)), `${d}: KDV oranı hâlâ sabit yazılı`)
  }
})

test('D3 · üç çıktı da genel iskontoyu hesaba katıyor', () => {
  for (const d of ['src/pages/teklifCikti/StandartCikti.jsx',
                   'src/pages/teklifCikti/KarelCikti.jsx',
                   'src/pages/teklifCikti/TrassirCikti.jsx']) {
    assert.ok(/genelIskonto/.test(kaynak(d)), `${d}: genel iskonto çıktıda yok`)
  }
})

// ─── Sonuç ──────────────────────────────────────────────────────────────────
if (kalan.length) {
  console.error(`\n✗ ${kalan.length} test kaldı (${gecen} geçti):\n`)
  kalan.forEach(k => console.error('  • ' + k))
  process.exit(1)
}
console.log(`✓ ${gecen} test geçti`)
