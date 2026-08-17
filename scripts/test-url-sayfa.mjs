// Liste sayfa numarası çekirdeği — DAVRANIŞ testi (tarayıcısız).
//
// Neden bu dosya var: 17.08'de kullanıcı "Servis Raporları 2. sayfaya geçmiyor"
// dedi. Kök neden `useUrlSayfa`'nın React setState sözleşmesini karşılamamasıydı;
// `setSayfa(s => s + 1)` çağrısında URL'e fonksiyonun KAYNAK KODU yazılıyordu
// (?sayfa=e%3D%3EMath.min...). ALTI ekran sessizce etkilenmişti. Buradaki her
// test o senaryolardan birini üretir.
//
// Çalıştır:  node scripts/test-url-sayfa.mjs

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { sayfaOku, sayfaHesapla } from '../src/lib/sayfaNo.js'

let gecen = 0, kalan = []
// ⚠️ Testler SENKRON olmalı (bkz. test-gorev-filtre.mjs'teki aynı not)
const test = (ad, fn) => {
  try {
    const r = fn()
    if (r && typeof r.then === 'function') throw new Error('Test senkron olmalı')
    gecen++
  } catch (e) { kalan.push(`${ad}\n    ${e.message.split('\n')[0]}`) }
}

// ─── sayfaOku: URL'den okuma ────────────────────────────────────────────────
test('sayfaOku — parametre yoksa 1', () => {
  assert.equal(sayfaOku(null), 1)
  assert.equal(sayfaOku(undefined), 1)
  assert.equal(sayfaOku(''), 1)
})

test('sayfaOku — normal sayı', () => {
  assert.equal(sayfaOku('3'), 3)
  assert.equal(sayfaOku('42'), 42)
})

test('sayfaOku — çöp değer 1 döner (eski bug: NaN sayfası)', () => {
  assert.equal(sayfaOku('e=>Math.min($,e+1)'), 1)
  assert.equal(sayfaOku('abc'), 1)
})

test('sayfaOku — 0 ve negatif 1e çekilir', () => {
  assert.equal(sayfaOku('0'), 1)
  assert.equal(sayfaOku('-5'), 1)
})

// ─── sayfaHesapla: düz değer ────────────────────────────────────────────────
test('düz sayı doğrudan yazılır', () => {
  assert.equal(sayfaHesapla(1, 5), 5)
  assert.equal(sayfaHesapla(9, 2), 2)
})

test('düz sayı — Sayfalama bileşeninin ‹/› düğmeleri', () => {
  assert.equal(sayfaHesapla(3, 3 + 1), 4)   // ›
  assert.equal(sayfaHesapla(3, 3 - 1), 2)   // ‹
})

test('düz sayı — 1 altına inilmez', () => {
  assert.equal(sayfaHesapla(1, 0), 1)
  assert.equal(sayfaHesapla(2, -3), 1)
})

// ─── sayfaHesapla: FONKSİYONEL güncelleyici (17.08 bug'ı) ───────────────────
test('🔴 REGRESYON: setSayfa(s => s + 1) ilerler', () => {
  assert.equal(sayfaHesapla(1, s => s + 1), 2)
  assert.equal(sayfaHesapla(7, s => s + 1), 8)
})

test('🔴 REGRESYON: ServisRaporlari "Sonraki" biçimi', () => {
  const toplamSayfa = 4
  assert.equal(sayfaHesapla(1, s => Math.min(toplamSayfa, s + 1)), 2)
  assert.equal(sayfaHesapla(4, s => Math.min(toplamSayfa, s + 1)), 4)  // sonda takılı kalır
})

test('🔴 REGRESYON: "Önceki" biçimi', () => {
  assert.equal(sayfaHesapla(3, p => Math.max(1, p - 1)), 2)
  assert.equal(sayfaHesapla(1, p => Math.max(1, p - 1)), 1)
})

test('güncelleyiciye URL string değil SAYI geçer', () => {
  // Hook `p.get('sayfa')` string'ini veriyor; güncelleyici aritmetik yapıyor.
  // Dönüştürme yapılmazsa "2" + 1 = "21" olurdu.
  assert.equal(sayfaHesapla('2', s => s + 1), 3)
})

// ─── Bozuk girdi: sayfa KAYMAZ ──────────────────────────────────────────────
test('NaN üreten güncelleyici mevcut sayfayı korur', () => {
  assert.equal(sayfaHesapla(5, () => undefined), 5)
  assert.equal(sayfaHesapla(5, () => NaN), 5)
  assert.equal(sayfaHesapla(5, () => 'abc'), 5)
})

test('patlayan güncelleyici mevcut sayfayı korur', () => {
  assert.equal(sayfaHesapla(6, () => { throw new Error('boom') }), 6)
})

test('Infinity mevcut sayfayı korur', () => {
  assert.equal(sayfaHesapla(2, () => Infinity), 2)
})

test('ondalık aşağı yuvarlanır', () => {
  assert.equal(sayfaHesapla(1, 3.7), 3)
})

// ─── Kaynak taraması: hook gerçekten çekirdeği kullanıyor mu ────────────────
const kaynak = (yol) => readFileSync(new URL(`../${yol}`, import.meta.url), 'utf8')

test('useUrlSayfa çekirdeği kullanıyor (elle parseInt kalmadı)', () => {
  const src = kaynak('src/lib/useUrlSayfa.js')
  assert.match(src, /sayfaHesapla/, 'sayfaHesapla çağrılmıyor')
  assert.match(src, /sayfaOku/, 'sayfaOku çağrılmıyor')
  assert.doesNotMatch(src, /parseInt\(/, 'elle parseInt kalmış — çekirdek atlanıyor')
})

test('setSayfa önceki değeri prev URL\'inden okuyor (ref DEĞİL)', () => {
  const src = kaynak('src/lib/useUrlSayfa.js')
  assert.match(src, /sayfaHesapla\(p\.get\('sayfa'\)/, 'önceki değer prev\'den okunmuyor')
})

test('useUrlSayfa kullanan TÜM sayfalar taranmış olmalı', () => {
  // Bu test bug'ın kapsamını kaydeder: fonksiyonel çağrı kullanan sayfalar.
  // Yeni bir sayfa eklenirse burası düşmez — hook artık ikisini de destekliyor.
  // Amaç, kapsamın belgelenmesi ve hook'un ikisini de karşıladığının kanıtı.
  const sayfaDosyalari = []
  const gez = (dizin) => {
    for (const e of readdirSync(new URL(`../${dizin}`, import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory()) gez(`${dizin}/${e.name}`)
      else if (e.name.endsWith('.jsx')) sayfaDosyalari.push(`${dizin}/${e.name}`)
    }
  }
  gez('src/pages')
  const kullananlar = sayfaDosyalari.filter(f => kaynak(f).includes('useUrlSayfa('))
  // 17.08 ölçümü: src/pages altında 12 sayfa (13. eşleşme hook'un kendi dosyası)
  assert.ok(kullananlar.length >= 12, `useUrlSayfa kullanan sayfa sayısı beklenenden az: ${kullananlar.length}`)
  // Fonksiyonel çağrı yapanlar artık çalışıyor olmalı — hook desteği testlerle kanıtlı
  const fonksiyonel = kullananlar.filter(f => /setSayfa\(\s*[a-zA-Z_$][\w$]*\s*=>/.test(kaynak(f)))
  assert.ok(fonksiyonel.length > 0, 'fonksiyonel çağrı deseni hiç bulunamadı — tarama bozulmuş olabilir')
})

// ─── Sonuç ──────────────────────────────────────────────────────────────────
if (kalan.length) {
  console.error(`\n❌ ${kalan.length} test KALDI (${gecen} geçti):\n`)
  for (const k of kalan) console.error('  • ' + k)
  process.exit(1)
}
console.log(`✅ ${gecen} test geçti — sayfa numarası çekirdeği sağlam.`)
