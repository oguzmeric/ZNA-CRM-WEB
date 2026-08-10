// Görevler sayfası filtre çekirdeği — DAVRANIŞ testi (tarayıcısız).
//
// Neden bu dosya var: 10.08 denetiminde bulunan hatalar "stil doğru görünüyor"
// diye gözden kaçıyordu; kullanıcı ekranda "rozet 37 · liste 0" görüyordu.
// Buradaki her test, kullanıcının bildirdiği bir senaryoyu üretir ve düzeltmenin
// hâlâ ayakta olduğunu kanıtlar.
//
// Çalıştır:  node scripts/test-gorev-filtre.mjs
// Filtre davranışını değiştirecekseniz ÖNCE burayı güncelleyin.

import assert from 'node:assert/strict'
import {
  SEKME_LISTESI, sekmeBaglami, sekmeKumesi, kapsamEsle, kisiselSekmeMi,
  gorunurMu, durumEsle, hiyerarsikSirala, bitisGorunen, haftaAraligi,
} from '../src/lib/gorevFiltre.js'
import {
  bugunStr, etkinSonTarih, gorevGecikti, isYukuHesapla, ACIK_DURUMLAR, KAPALI_DURUMLAR,
} from '../src/lib/gorevSabitleri.js'

let gecen = 0, kalan = []
const test = (ad, fn) => {
  try { fn(); gecen++ }
  catch (e) { kalan.push(`${ad}\n    ${e.message.split('\n')[0]}`) }
}

// ─── Yardımcılar ────────────────────────────────────────────────────────────
const gunEkle = (n) => {
  const [y, ay, g] = bugunStr().split('-').map(Number)
  return new Date(Date.UTC(y, ay - 1, g + n)).toISOString().slice(0, 10)
}

const BEN = { id: 7, ad: 'OĞUZ MERİÇ', kullaniciAdi: 'oguzmeric' }
const ctxTemel = (ek = {}) => ({ ...sekmeBaglami(BEN), sadeceBenim: false, kisiFiltre: '', ...ek })

let sayac = 0
const gorev = (o = {}) => ({
  id: ++sayac,
  gorevNo: `GRV-${String(sayac).padStart(4, '0')}`,
  durum: 'bekliyor',
  atanan: '7',
  olusturanId: 7,
  olusturanAd: 'OĞUZ MERİÇ',
  sonTarih: gunEkle(5),
  olusturmaTarih: gunEkle(-10),
  ...o,
})

// ─── B: tarih doğruluğu ─────────────────────────────────────────────────────

test('B1 · bugunStr TR gününü verir (YYYY-MM-DD, Europe/Istanbul)', () => {
  const b = bugunStr()
  assert.match(b, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(b, new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }))
})

test('B1b · web (Intl) ve mobil (UTC+3 ofset) AYNI günü üretir', () => {
  // crm-mobile/src/lib/gorevSabitleri.js Hermes yüzünden Intl kullanamıyor,
  // sabit UTC+3 ofsetiyle hesaplıyor. İkisi ayrışırsa aynı görev web'de
  // "gecikmedi", telefonda "gecikti" görünür.
  const mobilFormul = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  assert.equal(bugunStr(), mobilFormul)
})

test('B2 · etkin bitiş bekleme günü kadar İLERİ gider (geri değil)', () => {
  // Eski hâli yerel Date + toISOString kullanıyordu: TR'de sonuç 1 gün GERİ
  // kayıyor, beklemede kalmış görev bir gün erken "gecikti" sayılıyordu.
  assert.equal(etkinSonTarih({ sonTarih: '2026-08-10', toplamBeklemeGun: 3 }), '2026-08-13')
  assert.equal(etkinSonTarih({ sonTarih: '2026-08-30', toplamBeklemeGun: 5 }), '2026-09-04') // ay taşması
  assert.equal(etkinSonTarih({ sonTarih: '2026-12-30', toplamBeklemeGun: 3 }), '2027-01-02') // yıl taşması
  assert.equal(etkinSonTarih({ sonTarih: '2026-08-10' }), '2026-08-10')                      // ofset yok
  assert.equal(etkinSonTarih({}), null)
})

test('B2b · bekleme telafisi gecikmeyi öteler', () => {
  // Ham bitişi 2 gün geçmiş AMA 5 gün beklemede kalmış görev gecikmiş DEĞİL
  const g = gorev({ durum: 'devam', sonTarih: gunEkle(-2), toplamBeklemeGun: 5 })
  assert.equal(gorevGecikti(g), false)
  assert.equal(gorevGecikti(gorev({ durum: 'devam', sonTarih: gunEkle(-2) })), true)
})

test('B3 · bekleme telafili görev "Bugün Bitecekler"e düşer', () => {
  // Ham bitiş 3 gün önce + 3 gün bekleme = etkin bitiş BUGÜN.
  // Eski kod ham tarihe baktığı için bu görev ne "Bugün"de ne "Gecikenler"de
  // görünüyor, ertesi gün doğrudan gecikmiş beliriyordu.
  const g = gorev({ durum: 'beklemede', sonTarih: gunEkle(-3), toplamBeklemeGun: 3 })
  const ctx = ctxTemel()
  assert.equal(sekmeKumesi([g], 'bugun', ctx).length, 1)
  assert.equal(gorevGecikti(g), false)
})

test('B4 · taslak gecikmiş SAYILMAZ (ne açık ne kapalı)', () => {
  const t = gorev({ durum: 'taslak', sonTarih: gunEkle(-9) })
  assert.equal(gorevGecikti(t), false)
  // aynı tarihli normal görev gecikmiş olmalı — kontrol grubu
  assert.equal(gorevGecikti(gorev({ durum: 'bekliyor', sonTarih: gunEkle(-9) })), true)
})

test('B4b · kapalı durumlar ve legacy alias gecikmiş sayılmaz', () => {
  for (const d of KAPALI_DURUMLAR) {
    assert.equal(gorevGecikti(gorev({ durum: d, sonTarih: gunEkle(-9) })), false, d)
  }
  // 'devam_ediyor' legacy alias → 'devam' (açık) olarak normalize edilir
  assert.equal(gorevGecikti(gorev({ durum: 'devam_ediyor', sonTarih: gunEkle(-9) })), true)
})

test('B5 · hafta aralığı Pzt–Paz ve bugünü kapsar', () => {
  const { bas, son } = haftaAraligi('2026-08-10') // Pazartesi
  assert.equal(bas, '2026-08-10')
  assert.equal(son, '2026-08-16')
  const pazar = haftaAraligi('2026-08-16')
  assert.equal(pazar.bas, '2026-08-10')
  assert.equal(pazar.son, '2026-08-16')
  const bugun = bugunStr()
  const h = haftaAraligi(bugun)
  assert.ok(h.bas <= bugun && bugun <= h.son, 'bugün kendi haftasının içinde olmalı')
})

test('B6 · iş yükü "bugün bitecek" bekleme telafisini sayar', () => {
  const liste = [gorev({ durum: 'devam', sonTarih: gunEkle(-2), toplamBeklemeGun: 2 })]
  assert.equal(isYukuHesapla(liste, 7).bugunBitecek, 1)
})

// ─── K1: sekme değişince chip sıfırlanmalı ──────────────────────────────────

test('K1 · chip taşınırsa liste MATEMATİKSEL olarak boşalır (fix gerekçesi)', () => {
  // Kullanıcının senaryosu: KPI "Bana Atanan Açık" → chip='acik'.
  // Ardından "Tamamlananlar" sekmesine geçiliyor. Chip taşınırsa kesişim boş.
  const liste = [gorev({ durum: 'tamamlandi' }), gorev({ durum: 'tamamlandi' })]
  const ctx = ctxTemel()
  const kume = sekmeKumesi(liste, 'tamamlanan', ctx)
  assert.equal(kume.length, 2, 'sekme kümesi dolu')
  assert.equal(kume.filter(g => durumEsle(g, 'acik')).length, 0, 'eski davranış: boş liste')
  assert.equal(kume.filter(g => durumEsle(g, 'hepsi')).length, 2, 'chip sıfırlanınca liste dolu')
})

test('K1b · Gorevler.jsx sekme seçimi chip’i sıfırlıyor (kaynak kontrolü)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../src/pages/Gorevler.jsx', import.meta.url), 'utf8')
  assert.match(src, /onSec=\{\(id\) => \{ setSekme\(id\); setFiltre\('hepsi'\); setSayfa\(1\) \}\}/,
    'SekmeSatiri onSec chip sıfırlamalı')
})

// ─── K2: rozet = liste ──────────────────────────────────────────────────────

const karisikListe = () => [
  gorev({ durum: 'bekliyor', atanan: '7' }),
  gorev({ durum: 'devam', atanan: '9', olusturanId: 7 }),                      // başkasına atadığım
  gorev({ durum: 'devam', atanan: '9', olusturanId: 9, olusturanAd: 'ALİ' }),  // beni ilgilendirmeyen
  gorev({ durum: 'tamamlandi', atanan: '7' }),
  gorev({ durum: 'bekliyor', atanan: '9', olusturanId: 9, olusturanAd: 'ALİ', sonTarih: gunEkle(-4) }), // başkasının gecikeni
  gorev({ durum: 'devam', atanan: '7', sonTarih: gunEkle(-2) }),               // benim gecikenim
  gorev({ durum: 'onay_bekliyor', atanan: '9', olusturanId: 9, olusturanAd: 'ALİ', onaylayiciId: 7 }), // onayımı bekleyen
  gorev({ durum: 'bekliyor', atanan: '9', ekip: [7] }),                        // ekipte olduğum
  gorev({ durum: 'taslak', atanan: '7', olusturanId: 7 }),                     // kendi taslağım
  gorev({ durum: 'taslak', atanan: '9', olusturanId: 9, olusturanAd: 'ALİ' }), // başkasının taslağı
  gorev({ durum: 'bekliyor', atanan: '7', sonTarih: bugunStr() }),             // bugün bitecek
]

test('K2 · rozet sayıları KAPSAMI yansıtır (eskiden kapsamdan bağımsızdı)', () => {
  // Şikâyetin kaynağı: rozet gorunurGorevler'den, liste kapsamlı kümeden
  // sayılıyordu → "Görevlerim"de rozet 300, tabloda 25 satır.
  const ctxTum = ctxTemel()
  const gorunur = karisikListe().filter(g => gorunurMu(g, ctxTum))
  const tumu = sekmeKumesi(gorunur, 'tumu', ctxTum).length
  const benim = sekmeKumesi(gorunur, 'tumu', ctxTemel({ sadeceBenim: true })).length
  const kisi = sekmeKumesi(gorunur, 'tumu', ctxTemel({ kisiFiltre: '9' })).length
  assert.ok(benim < tumu, `kapsam daraltınca rozet düşmeli (${benim} < ${tumu})`)
  assert.ok(kisi < tumu, `kişi seçilince rozet düşmeli (${kisi} < ${tumu})`)
  // Kişisel sekmeler kapsamdan ETKİLENMEZ — orada sayı sabit kalmalı
  for (const id of ['bana', 'olusturdugum', 'alt', 'onay']) {
    assert.equal(
      sekmeKumesi(gorunur, id, ctxTum).length,
      sekmeKumesi(gorunur, id, ctxTemel({ sadeceBenim: true })).length, id)
  }
})

test('K2a · Gorevler.jsx rozet ve tabloyu AYNI fonksiyondan besliyor (kaynak kontrolü)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../src/pages/Gorevler.jsx', import.meta.url), 'utf8')
  assert.match(src, /sekmeSayilari\[s\.id\] = sekmeKumesi\(gorunurGorevler, s\.id, ctx\)\.length/,
    'rozetler sekmeKumesi()’nden sayılmalı')
  assert.match(src, /const sekmeliGorevler = sekmeKumesi\(gorunurGorevler, sekme, ctx\)/,
    'tablo da sekmeKumesi()’nden beslenmeli')
  assert.match(src, /const listeSuzulmus = sekmeliGorevler/,
    'tablo zinciri sekmeliGorevler ile başlamalı')
  assert.match(src, /const kpiBanaAcik = sekmeKumesi\(gorunurGorevler, 'bana', ctx\)/,
    'KPI da aynı kümeden sayılmalı')
})

test('K2d · chip yokken tablo tabanı rozetle birebir eşit', () => {
  const ctx = ctxTemel()
  const gorunur = karisikListe().filter(g => gorunurMu(g, ctx))
  for (const s of SEKME_LISTESI) {
    const kume = sekmeKumesi(gorunur, s.id, ctx)
    assert.equal(kume.filter(g => durumEsle(g, 'hepsi')).length, kume.length, s.id)
  }
})

test('K2b · taslak yalnız oluşturana görünür', () => {
  const ham = karisikListe()
  const gorunur = ham.filter(g => gorunurMu(g, ctxTemel()))
  const taslaklar = gorunur.filter(g => g.durum === 'taslak')
  assert.equal(taslaklar.length, 1)
  assert.equal(String(taslaklar[0].olusturanId), '7')
})

test('K2c · aynı isimli kullanıcı BAŞKASININ taslağını göremez', () => {
  // olusturanId dolu ve farklıysa ada DÜŞÜLMEZ (eski hâli fail-open'dı)
  const baskasi = gorev({ durum: 'taslak', olusturanId: 99, olusturanAd: 'OĞUZ MERİÇ' })
  assert.equal(gorunurMu(baskasi, ctxTemel()), false)
  // olusturanId hiç yoksa (eski kayıt) ad eşleşmesi hâlâ çalışır
  const eski = gorev({ durum: 'taslak', olusturanId: null, olusturanAd: 'OĞUZ MERİÇ' })
  assert.equal(gorunurMu(eski, ctxTemel()), true)
})

// ─── K3: kapsam boyutları dikleşti ──────────────────────────────────────────

test('K3a · "Gecikenler" kapsamı daraltmaz — başkasının gecikeni de görünür', () => {
  const ctx = ctxTemel()
  const gorunur = karisikListe().filter(g => gorunurMu(g, ctx))
  const geciken = sekmeKumesi(gorunur, 'geciken', ctx)
  assert.equal(geciken.length, 2, 'benim + başkasının gecikeni')
  assert.ok(geciken.some(g => g.atanan === '9'), 'yönetici başkasının gecikenini görmeli')
})

test('K3a2 · kapsam anahtarı "Gecikenler"i yine de daraltabilir', () => {
  const ctx = ctxTemel({ sadeceBenim: true })
  const gorunur = karisikListe().filter(g => gorunurMu(g, ctx))
  const geciken = sekmeKumesi(gorunur, 'geciken', ctx)
  assert.equal(geciken.length, 1)
  assert.equal(geciken[0].atanan, '7')
})

test('K3b · "Oluşturduklarım" + Görevlerim → başkasına atadıklarım KAYBOLMAZ', () => {
  const ctx = ctxTemel({ sadeceBenim: true })
  const gorunur = karisikListe().filter(g => gorunurMu(g, ctx))
  const kume = sekmeKumesi(gorunur, 'olusturdugum', ctx)
  // ⚠️ Ekipte olduğum görevler kapsamdan zaten geçer; testin anlamlı olması için
  // TAMAMEN devrettiğim (ekibinde de olmadığım) görevi arıyoruz.
  const devredilen = kume.filter(g => g.atanan === '9' && !(Array.isArray(g.ekip) && g.ekip.includes(7)))
  assert.ok(devredilen.length > 0, 'ekibinde olmadığım halde oluşturduğum görev listede olmalı')
})

test('K3c · "Onay Bekleyenler" + Görevlerim → bana atanmamış onaylar KAYBOLMAZ', () => {
  const ctx = ctxTemel({ sadeceBenim: true })
  const gorunur = karisikListe().filter(g => gorunurMu(g, ctx))
  const kume = sekmeKumesi(gorunur, 'onay', ctx)
  assert.equal(kume.length, 1)
  assert.equal(kume[0].atanan, '9', 'onaylayıcısı benim ama atananı başkası')
})

test('K3d · kişisel sekmelerde kapsam yok sayılır, nötr sekmelerde uygulanır', () => {
  assert.deepEqual(SEKME_LISTESI.filter(s => kisiselSekmeMi(s.id)).map(s => s.id),
    ['bana', 'olusturdugum', 'alt', 'onay'])
  for (const id of ['geciken', 'bugun', 'hafta', 'tamamlanan', 'tumu']) {
    assert.equal(kisiselSekmeMi(id), false, id)
  }
})

test('K3e · kişi açılırı ekip üyeliğini de sayar (kapsam anahtarıyla aynı tanım)', () => {
  const ekipli = gorev({ atanan: '9', ekip: [7] })
  assert.equal(kapsamEsle(ekipli, ctxTemel({ kisiFiltre: '7' })), true)
  assert.equal(kapsamEsle(ekipli, ctxTemel({ sadeceBenim: true })), true)
})

test('K3f · "Bana Atananlar" ekipte olduğum görevleri kapsar', () => {
  const ctx = ctxTemel()
  const gorunur = karisikListe().filter(g => gorunurMu(g, ctx))
  assert.ok(sekmeKumesi(gorunur, 'bana', ctx).some(g => Array.isArray(g.ekip) && g.ekip.includes(7)))
})

// ─── C: chip tutarlılığı ────────────────────────────────────────────────────

test('C1 · "Atandı" chip’i taslağı KAPSAMAZ, "Taslak" chip’i kapsar', () => {
  const taslak = gorev({ durum: 'taslak' })
  const atandi = gorev({ durum: 'bekliyor' })
  assert.equal(durumEsle(taslak, 'atandi'), false)
  assert.equal(durumEsle(taslak, 'taslak'), true)
  assert.equal(durumEsle(atandi, 'atandi'), true)
  assert.equal(durumEsle(atandi, 'taslak'), false)
})

test('C2 · durum chip’leri AYRIK ve toplamları "Tümü"yü tutar', () => {
  const AYRIK = ['taslak', 'atandi', 'devam', 'beklemede', 'bilgi', 'onay', 'tamam', 'iptal']
  const liste = ['taslak', 'bekliyor', 'devam', 'revize', 'beklemede', 'bilgi_bekleniyor',
    'onay_bekliyor', 'tamamlandi', 'reddedildi', 'iptal'].map(d => gorev({ durum: d }))
  let toplam = 0
  for (const g of liste) {
    const eslesen = AYRIK.filter(c => durumEsle(g, c))
    assert.equal(eslesen.length, 1, `${g.durum} tam BİR chip'e düşmeli, düştüğü: ${eslesen}`)
    toplam++
  }
  assert.equal(toplam, liste.filter(g => durumEsle(g, 'hepsi')).length)
})

test('C3 · Açık + Kapalı = taslak dışında her şey (legacy "kapali" karşılıklı)', () => {
  const liste = ['taslak', 'bekliyor', 'devam', 'beklemede', 'bilgi_bekleniyor',
    'onay_bekliyor', 'revize', 'tamamlandi', 'reddedildi', 'iptal'].map(d => gorev({ durum: d }))
  const acik = liste.filter(g => durumEsle(g, 'acik'))
  const kapali = liste.filter(g => durumEsle(g, 'kapali'))
  assert.equal(acik.length + kapali.length, liste.length - 1, 'yalnız taslak dışarıda')
  assert.equal(acik.length, ACIK_DURUMLAR.length)
  assert.equal(kapali.length, KAPALI_DURUMLAR.length)
})

test('C4 · "Bit. Tarih" sütun filtresi GÖRÜNEN değerle eşleşir', () => {
  // Hücre `bitisTarih || sonTarih` yazıyor; filtre sonTarih'e bakınca kullanıcı
  // gördüğü tarihi yazdığında satır kayboluyordu.
  const g = gorev({ sonTarih: '2026-08-20', bitisTarih: '2026-08-25' })
  assert.equal(bitisGorunen(g), '2026-08-25')
  assert.equal(bitisGorunen(gorev({ sonTarih: '2026-08-20', bitisTarih: null })), '2026-08-20')
})

test('C5 · KPI "Bana Atanan Açık" tıklanınca açılan listeyle aynı sayıyı verir', () => {
  const ctx = ctxTemel()
  const gorunur = karisikListe().filter(g => gorunurMu(g, ctx))
  const kpi = sekmeKumesi(gorunur, 'bana', ctx).filter(g => durumEsle(g, 'acik')).length
  // Tıklama: sekme='bana', chip='acik' (kpiTikla) — listenin ürettiği küme
  const liste = sekmeKumesi(gorunur, 'bana', ctx).filter(g => durumEsle(g, 'acik')).length
  assert.equal(kpi, liste)
  assert.ok(kpi > 0, 'senaryoda açık görev olmalı')
})

// ─── Hiyerarşi + kenar durumlar ─────────────────────────────────────────────

test('D1 · alt görev üstünün hemen altına dizilir', () => {
  const ust = gorev({ gorevNo: 'GRV-0100' })
  const alt1 = gorev({ gorevNo: 'GRV-0102', ustGorevId: ust.id })
  const alt2 = gorev({ gorevNo: 'GRV-0101', ustGorevId: ust.id })
  const digeri = gorev({ gorevNo: 'GRV-0200' })
  const sirali = hiyerarsikSirala([ust, digeri, alt1, alt2])
  assert.deepEqual(sirali.map(g => g.gorevNo), ['GRV-0100', 'GRV-0101', 'GRV-0102', 'GRV-0200'])
})

test('D2 · üstü listede olmayan alt görev KAYBOLMAZ (kök sayılır)', () => {
  const yetim = gorev({ gorevNo: 'GRV-0300', ustGorevId: 999999 })
  assert.equal(hiyerarsikSirala([yetim]).length, 1)
})

test('D3 · oturum yokken (uid boş) kişisel sekmeler boş döner, çökmez', () => {
  const ctx = { ...sekmeBaglami(null), sadeceBenim: false, kisiFiltre: '' }
  const liste = karisikListe()
  for (const s of SEKME_LISTESI) {
    assert.ok(Array.isArray(sekmeKumesi(liste, s.id, ctx)), s.id)
  }
  assert.equal(sekmeKumesi(liste, 'bana', ctx).length, 0)
})

test('D4 · sonTarih’i olmayan görev tarih sekmelerine düşmez', () => {
  const g = gorev({ sonTarih: null })
  const ctx = ctxTemel()
  assert.equal(sekmeKumesi([g], 'bugun', ctx).length, 0)
  assert.equal(sekmeKumesi([g], 'hafta', ctx).length, 0)
  assert.equal(sekmeKumesi([g], 'geciken', ctx).length, 0)
  assert.equal(sekmeKumesi([g], 'tumu', ctx).length, 1)
})

test('D5 · kapalı görev "Bugün/Bu Hafta"da görünmez', () => {
  const ctx = ctxTemel()
  const g = gorev({ durum: 'tamamlandi', sonTarih: bugunStr() })
  assert.equal(sekmeKumesi([g], 'bugun', ctx).length, 0)
  assert.equal(sekmeKumesi([g], 'hafta', ctx).length, 0)
})

// ─── Sonuç ──────────────────────────────────────────────────────────────────
console.log(`\n  ${gecen} test geçti${kalan.length ? `, ${kalan.length} KALDI` : ''}`)
if (kalan.length) {
  console.error('\n  ✗ Başarısız:\n' + kalan.map(k => `  - ${k}`).join('\n') + '\n')
  process.exit(1)
}
console.log('  ✓ Görev filtre çekirdeği doğrulandı\n')
