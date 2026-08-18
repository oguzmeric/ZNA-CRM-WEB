// Yıllık izin hakedişi birim testleri — node scripts/test-izin-hakedis.mjs
// Kural kaynağı: 4857 sayılı İş Kanunu md. 53 (bkz. src/lib/izinHakedis.js).
//
// Tüm testler SABİT "bugün" tarihiyle çalışır — gerçek tarihe bağlı test
// yarın kendiliğinden kırılır.

import assert from 'node:assert/strict'
import {
  kidemHesapla, kidemMetni, yilBasinaHak, yasHesapla,
  toplamHakEdilen, kullanilanYillik, hakedisOzeti,
} from '../src/lib/izinHakedis.js'

let gecen = 0
const t = (ad, fn) => {
  try { fn(); gecen++; console.log(`  ✓ ${ad}`) }
  catch (e) { console.error(`  ✗ ${ad}\n    ${e.message}`); process.exitCode = 1 }
}

console.log('\nkidemHesapla')
t('tam 3 yıl', () => {
  const k = kidemHesapla('2023-08-18', '2026-08-18')
  assert.equal(k.yil, 3); assert.equal(k.ay, 0); assert.equal(k.gun, 0)
})
t('3 yıl 2 ay', () => {
  const k = kidemHesapla('2023-06-18', '2026-08-18')
  assert.equal(k.yil, 3); assert.equal(k.ay, 2)
})
t('bir gün eksikle yıl dolmaz', () => {
  const k = kidemHesapla('2025-08-19', '2026-08-18')
  assert.equal(k.yil, 0)
})
t('gelecek tarih → gecerli:false', () => {
  const k = kidemHesapla('2027-01-01', '2026-08-18')
  assert.equal(k.gecerli, false); assert.equal(k.yil, 0)
})
t('null giriş → gecerli:false', () => {
  assert.equal(kidemHesapla(null, '2026-08-18').gecerli, false)
})

console.log('\nkidemMetni')
t('yıl + ay', () => assert.equal(kidemMetni('2023-06-18', '2026-08-18'), '3 yıl 2 ay'))
t('tam yıl → ay yazılmaz', () => assert.equal(kidemMetni('2023-08-18', '2026-08-18'), '3 yıl'))
t('bir yıldan az → ay', () => assert.equal(kidemMetni('2026-02-18', '2026-08-18'), '6 ay'))
t('tarih yoksa tire', () => assert.equal(kidemMetni(null), '—'))

console.log('\nyilBasinaHak — İş Kanunu md.53 kademeleri')
t('kıdem 0 → hak doğmaz', () => assert.equal(yilBasinaHak(0), 0))
t('kıdem 1 → 14', () => assert.equal(yilBasinaHak(1), 14))
t('kıdem 5 → 14 (5 DAHİL)', () => assert.equal(yilBasinaHak(5), 14))
t('kıdem 6 → 20', () => assert.equal(yilBasinaHak(6), 20))
t('kıdem 14 → 20', () => assert.equal(yilBasinaHak(14), 20))
t('kıdem 15 → 26', () => assert.equal(yilBasinaHak(15), 26))
t('kıdem 20 → 26', () => assert.equal(yilBasinaHak(20), 26))
t('yaş 50+ → en az 20 (kıdem 2 olsa bile)', () => assert.equal(yilBasinaHak(2, 52), 20))
t('yaş 18- → en az 20', () => assert.equal(yilBasinaHak(1, 17), 20))
t('yaş istisnası 26 günü DÜŞÜRMEZ', () => assert.equal(yilBasinaHak(16, 55), 26))
t('yaş null → istisna uygulanmaz', () => assert.equal(yilBasinaHak(2, null), 14))

console.log('\nyasHesapla')
t('doğum 1990 → 2026 yazında 36', () =>
  assert.equal(yasHesapla('1990-01-10', '2026-08-18'), 36))
t('doğum günü gelmemiş → bir eksik', () =>
  assert.equal(yasHesapla('1990-12-31', '2026-08-18'), 35))

console.log('\ntoplamHakEdilen — devreden izinler')
t('1 yılını doldurmamış → 0', () =>
  assert.equal(toplamHakEdilen('2026-01-01', null, '2026-08-18'), 0))
t('tam 1 yıl → 14', () =>
  assert.equal(toplamHakEdilen('2025-08-18', null, '2026-08-18'), 14))
t('3 yıl → 42 (14×3)', () =>
  assert.equal(toplamHakEdilen('2023-08-18', null, '2026-08-18'), 42))
t('5 yıl → 70 (14×5)', () =>
  assert.equal(toplamHakEdilen('2021-08-18', null, '2026-08-18'), 70))
t('6 yıl → 90 (14×5 + 20)', () =>
  assert.equal(toplamHakEdilen('2020-08-18', null, '2026-08-18'), 90))
t('15 yıl → 276 (14×5 + 20×9 + 26)', () =>
  assert.equal(toplamHakEdilen('2011-08-18', null, '2026-08-18'), 276))
t('50 yaş üstü, 2 yıl → 40 (20×2)', () =>
  assert.equal(toplamHakEdilen('2024-08-18', '1970-01-01', '2026-08-18'), 40))
t('tarih yoksa 0', () => assert.equal(toplamHakEdilen(null, null, '2026-08-18'), 0))

console.log('\nkullanilanYillik — yalnız onaylı YILLIK izin sayılır')
const talepler = [
  { tur: 'yillik',  durum: 'onaylandi',  gunSayisi: 5 },
  { tur: 'yillik',  durum: 'onaylandi',  gunSayisi: 3 },
  { tur: 'yillik',  durum: 'bekliyor',   gunSayisi: 10 },  // sayılmaz
  { tur: 'yillik',  durum: 'reddedildi', gunSayisi: 10 },  // sayılmaz
  { tur: 'mazeret', durum: 'onaylandi',  gunSayisi: 2 },   // sayılmaz
  { tur: 'rapor',   durum: 'onaylandi',  gunSayisi: 7 },   // sayılmaz
]
t('yalnız onaylı yıllık → 8', () => assert.equal(kullanilanYillik(talepler), 8))
t('snake_case gun_sayisi da okunur', () =>
  assert.equal(kullanilanYillik([{ tur: 'yillik', durum: 'onaylandi', gun_sayisi: 4 }]), 4))
t('boş dizi → 0', () => assert.equal(kullanilanYillik([]), 0))
t('undefined → 0', () => assert.equal(kullanilanYillik(undefined), 0))

console.log('\nhakedisOzeti')
t('3 yıllık, 8 gün kullanmış → 34 kalan', () => {
  const o = hakedisOzeti({ iseGiris: '2023-08-18', talepler, bugun: '2026-08-18' })
  assert.equal(o.gecerli, true)
  assert.equal(o.hakEdilen, 42)
  assert.equal(o.kullanilan, 8)
  assert.equal(o.kalan, 34)
  assert.equal(o.kidemMetni, '3 yıl')
  assert.equal(o.yilBasina, 14)
})
t('fazla kullanım NEGATİF döner (sıfıra kırpılmaz)', () => {
  const o = hakedisOzeti({
    iseGiris: '2025-08-18',                                   // 1 yıl → 14 gün hak
    talepler: [{ tur: 'yillik', durum: 'onaylandi', gunSayisi: 20 }],
    bugun: '2026-08-18',
  })
  assert.equal(o.hakEdilen, 14)
  assert.equal(o.kullanilan, 20)
  assert.equal(o.kalan, -6)
})
t('işe giriş yoksa gecerli:false — sessiz 0 DEĞİL', () => {
  const o = hakedisOzeti({ iseGiris: null, talepler, bugun: '2026-08-18' })
  assert.equal(o.gecerli, false)
  assert.equal(o.kidemMetni, '—')
})
t('argümansız çağrı patlamaz', () => {
  const o = hakedisOzeti()
  assert.equal(o.gecerli, false)
})

console.log(`\n${gecen} test geçti${process.exitCode ? ' — HATA VAR' : ''}\n`)
