// Puantaj hesabı testleri — beklenen değerler formül BELGESİNDEN
// ("Mesai ücreti hesaplanırken çalışılan günün niteliği.docx", 17.08.2026).
// Çalıştır: npm run test:puantaj
import {
  puantajSatirHesapla, donemMaasiSec, gecerliDakikalar, kurus, VARSAYILAN_AYAR,
} from '../src/lib/puantajHesap.js'

let ok = 0, fail = 0
const esit = (ad, gercek, beklenen) => {
  const g = JSON.stringify(gercek), b = JSON.stringify(beklenen)
  if (g === b) { ok++; console.log(`  ✓ ${ad}`) }
  else { fail++; console.error(`  ✗ ${ad}\n    beklenen: ${b}\n    gerçek  : ${g}`) }
}

console.log('— Belge örneği 1: asgari brüt 33.030, 10 saat hafta içi FM —')
{
  const s = puantajSatirHesapla({ brutTutar: 33030, haftaIciDakika: 600 })
  esit('saat ücreti 146,80', s.saatUcreti, 146.8)
  esit('10 saat Hİ FM = 2.202,00', s.hiTutar, 2202)
  esit('genel toplam 35.232,00', s.genelToplam, 35232)
}

console.log('— Belge örneği 2: 9,5 saat Hİ + 1,5 saat Pazar —')
{
  const s = puantajSatirHesapla({ brutTutar: 33030, haftaIciDakika: 570, pazarDakika: 90 })
  esit('Hİ 9,5 saat = 2.091,90', s.hiTutar, 2091.9)
  esit('Pazar 1,5 saat ×2,5 = 550,50', s.pzTutar, 550.5)
}

console.log('— Belge örneği 3: 22.097 maaş, ara değer yuvarlanmaz —')
{
  // 22097/225 ×1,5 ×15 = 2.209,70 kesin sonuç. Belge "2.207,70" yazmış ama
  // kendi ara değeriyle bile (147,3133 × 15 = 2.209,6995) tutmuyor —
  // belgede el hesabı/yazım hatası (9→7). Matematiksel doğru değer esas.
  const s = puantajSatirHesapla({ brutTutar: 22097, haftaIciDakika: 900 })
  esit('15 saat = 2.209,70', s.hiTutar, 2209.7)
}

console.log('— Resmî tatil ×2,0 —')
{
  const s = puantajSatirHesapla({ brutTutar: 33030, resmiTatilDakika: 480 })
  esit('8 saat RT = 2.348,80', s.rtTutar, kurus(8 * 146.8 * 2))
}

console.log('— Maaş girilmemiş: 0 DEĞİL null —')
{
  const s = puantajSatirHesapla({ brutTutar: null, haftaIciDakika: 600 })
  esit('tutarlar null', [s.saatUcreti, s.hiTutar, s.mesaiToplam, s.genelToplam], [null, null, null, null])
  esit('saatler yine görünür', s.hiSaat, 10)
}

console.log('— Ayarlanabilir katsayı (Abdullah değiştirirse) —')
{
  const s = puantajSatirHesapla({
    brutTutar: 45000, haftaIciDakika: 60,
    ayar: { ...VARSAYILAN_AYAR, haftaIciKatsayi: 2 },
  })
  esit('1 saat ×2 = 400,00', s.hiTutar, 400)
}

console.log('— BES kesintisi: (maaş+mesai) × %3, hakedişten düşer —')
{
  const s = puantajSatirHesapla({ brutTutar: 33030, haftaIciDakika: 600 })
  esit('genel 35.232 → BES 1.056,96', s.besKesinti, 1056.96)
  esit('ödenecek 34.175,04', s.odenecek, 34175.04)
  const muaf = puantajSatirHesapla({ brutTutar: 33030, haftaIciDakika: 600, besDahil: false })
  esit('caymış: kesinti 0', muaf.besKesinti, 0)
  esit('caymış: ödenecek = hakediş', muaf.odenecek, 35232)
  const kapali = puantajSatirHesapla({ brutTutar: 33030, ayar: { ...VARSAYILAN_AYAR, besOrani: 0 } })
  esit('oran 0: kesinti 0', kapali.besKesinti, 0)
  const maassiz = puantajSatirHesapla({ brutTutar: null, haftaIciDakika: 60 })
  esit('maaşsız: BES/ödenecek null', [maassiz.besKesinti, maassiz.odenecek], [null, null])
}

console.log('— donemMaasiSec: dönem sonuna kadar geçerli en yeni maaş —')
{
  const maaslar = [
    { gecerliBaslangic: '2026-01-01', brutTutar: 30000 },
    { gecerliBaslangic: '2026-07-01', brutTutar: 40000 },
    { gecerliBaslangic: '2026-09-01', brutTutar: 50000 },
  ]
  esit('Haziran → Ocak maaşı', donemMaasiSec(maaslar, 2026, 6)?.brutTutar, 30000)
  esit('Ağustos → Temmuz zammı', donemMaasiSec(maaslar, 2026, 8)?.brutTutar, 40000)
  esit('Eylül → Eylül zammı', donemMaasiSec(maaslar, 2026, 9)?.brutTutar, 50000)
  esit('2025 → maaş yok (null)', donemMaasiSec(maaslar, 2025, 12), null)
  // ay ortası geçerlilik: 15.08 başlangıçlı maaş Ağustos döneminde SEÇİLİR (ay sonu kapsar)
  esit('ay ortası başlangıç dahil', donemMaasiSec([{ gecerliBaslangic: '2026-08-15', brutTutar: 60000 }], 2026, 8)?.brutTutar, 60000)
}

console.log('— gecerliDakikalar: kısmi düzeltme, NULL = otomatik korunur —')
{
  const oto = { haftaIciDakika: 300, pazarDakika: 120 }
  esit('düzeltme yok', gecerliDakikalar(oto, null),
    { haftaIciDakika: 300, pazarDakika: 120, resmiTatilDakika: 0, duzeltilmis: false })
  esit('yalnız Hİ düzeltildi', gecerliDakikalar(oto, { haftaIciDakika: 240, pazarDakika: null, resmiTatilDakika: 0 }),
    { haftaIciDakika: 240, pazarDakika: 120, resmiTatilDakika: 0, duzeltilmis: true })
  esit('yalnız RT girildi', gecerliDakikalar(oto, { haftaIciDakika: null, pazarDakika: null, resmiTatilDakika: 480 }),
    { haftaIciDakika: 300, pazarDakika: 120, resmiTatilDakika: 480, duzeltilmis: true })
}

console.log(`\nSonuç: ${ok} geçti, ${fail} kaldı`)
if (fail > 0) process.exit(1)
