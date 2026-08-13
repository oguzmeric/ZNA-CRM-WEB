// Teklif tutar hesabının TEK kaynağı.
//
// Çıktı şablonları (StandartCikti / KarelCikti / TrassirCikti) ve Excel dışa
// aktarımları (standartExcel / karelExcel / trassirExcel) buradan beslenir.
// Önceden altı dosyanın her biri hesabı kendi içinde tekrar yazıyordu; kopyalar
// zamanla ayrıştı ve aynı teklifin PDF'i ile Excel'i farklı tutar gösterdi
// (Excel KDV'yi sabit %20 sayıyordu — canlıda %18'li 20 teklif var).
//
// ⚠️ Formül, TeklifDetay ekranındaki toplam hesabının birebir aynısıdır.
// Belgeyle sistem aynı rakamı göstermek zorunda; buradaki formülü değiştirmek
// TeklifDetay'ı da değiştirmeyi gerektirir.

const sayi = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// "12.000" / "1.250.000" — noktayla ayrılmış TAM üçlü gruplar: TR yazımında
// binlik ayracı. "1250.50" ve "0.5" bu kalıba uymaz, ondalık kalır.
const TR_BINLIK = /^-?\d{1,3}(\.\d{3})+$/

/**
 * Kullanıcının YAZDIĞI metni sayıya çevirir — ekrandan gelen ham girdi için.
 * "1.250,50" · "1250,50" · "1250.50" aynı tutardır.
 *
 * ⚠️ Yukarıdaki `sayi()` düz `Number()`; DB'den gelen sayısal değerler için.
 * Virgüllü metni NaN→0 yapar, o yüzden ekran girdisi ÖNCE buradan geçmeli.
 *
 * ⚠️ "12.000" TUZAĞI: düz `parseFloat` bunu 12 okur. Fatura tutarında 12 TL ile
 * 12.000 TL arasındaki fark bir yazım tercihine bırakılamaz.
 */
export const sayiCoz = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v ?? '').trim()
  if (!s) return 0
  const ham = s.includes(',') ? s.replace(/\./g, '').replace(',', '.')
    : TR_BINLIK.test(s) ? s.replace(/\./g, '')
    : s
  const n = parseFloat(ham)
  return Number.isFinite(n) ? n : 0
}

// Kuruşa yuvarlama. Belgede gösterilen her tutar yuvarlanmış hâliyle toplanır;
// aksi hâlde müşteri belgeyi hesap makinesiyle kontrol ettiğinde tutmaz —
// eski çıktıda "brüt 5.852,50 − iskonto 27,63 = ara 5.824,88" yazıyordu (1 kuruş
// açık) ve tutarlar üç ondalıkla basılıyordu (₺45.599,983).
export const r2 = (n) => Math.round((sayi(n) + Number.EPSILON) * 100) / 100

// KDV alanı hiç girilmemişse (eski/içe aktarılmış satırlar) %20 varsayılır.
// Ama açıkça 0 yazılmışsa 0'dır — `s.kdv || 20` kalıbı bunu %20'ye çeviriyordu,
// ekran ise 0 kabul ediyordu; ikisi ayrışmasın diye burada tek kural var.
const kdvOraniCoz = (v) => (v === null || v === undefined || v === '' ? 20 : sayi(v))

/** Tek satırın bileşenleri: brüt → iskonto → net → KDV → toplam (hepsi kuruşa yuvarlı) */
export const satirHesapla = (s) => {
  const brut = r2(sayi(s?.miktar) * sayi(s?.birimFiyat))
  const iskontoOran = sayi(s?.iskonto)
  const iskontoTutar = r2(brut * (iskontoOran / 100))
  const net = r2(brut - iskontoTutar)
  const kdvOran = kdvOraniCoz(s?.kdv)
  const kdvTutar = r2(net * (kdvOran / 100))
  return { brut, iskontoOran, iskontoTutar, net, kdvOran, kdvTutar, toplam: r2(net + kdvTutar) }
}

/** Teklifin tüm toplamları — çıktıların tek beslendiği yer */
export const teklifHesapla = (teklif) => {
  const satirlar = (teklif?.satirlar || []).map(satirHesapla)

  const brutToplam = r2(satirlar.reduce((t, s) => t + s.brut, 0))
  const satirIskontoToplam = r2(satirlar.reduce((t, s) => t + s.iskontoTutar, 0))
  const araToplam = r2(brutToplam - satirIskontoToplam)

  const genelIskontoOran = sayi(teklif?.genelIskonto)
  const genelIskontoTutar = r2(araToplam * (genelIskontoOran / 100))

  // ⚠️ GENEL İSKONTO KDV MATRAHINDAN DÜŞER (11.08.2026 kullanıcı kararı).
  // Eskiden iskonto ara toplamdan düşülüyor ama KDV indirim ÖNCESİ tutardan
  // hesaplanıyordu: %5 yazınca genel toplam %4,17 düşüyordu. Kullanıcı toplam
  // rakamı düzlemek için oran giriyor — girilen oran genel toplama BİREBİR
  // yansımalı. Fatura düzenlemesi de indirimli matrahtan KDV ister.
  //   10.000 + %20 KDV = 12.000 · %5 iskonto → 9.500 matrah, 1.900 KDV, 11.400
  //   (= 12.000 × 0,95 — tam orantılı)
  const matrahCarpani = 1 - genelIskontoOran / 100

  // KDV, her oranın YUVARLANMIŞ matrahı üzerinden hesaplanır — satır satır
  // yuvarlanmış KDV'leri toplamak kuruş kırıntısı biriktirip belgeyi sistemdeki
  // genel toplamdan ayırıyordu (TEK-0672'de 45.599,99 ↔ 45.599,98).
  // Sabit "%20" etiketi de %18'li tekliflerde yanlış oran gösteriyordu.
  const matrah = {}
  for (const s of satirlar) matrah[s.kdvOran] = (matrah[s.kdvOran] || 0) + s.net
  const kdvKirilimi = {}
  for (const [oran, tutar] of Object.entries(matrah)) {
    kdvKirilimi[oran] = r2(r2(r2(tutar) * matrahCarpani) * (Number(oran) / 100))
  }
  const kdvToplam = r2(Object.values(kdvKirilimi).reduce((a, b) => a + b, 0))

  const genelToplam = r2(araToplam - genelIskontoTutar + kdvToplam)

  const iskontoOranlari = [...new Set(satirlar.map((s) => s.iskontoOran))]

  return {
    satirlar,
    brutToplam,
    satirIskontoToplam,
    araToplam,
    kdvKirilimi,
    kdvToplam,
    genelIskontoOran,
    genelIskontoTutar,
    genelToplam,
    /** Herhangi bir satırda iskonto oranı girilmiş mi — iskonto kolonu bu bayrağa göre basılır */
    satirIskontoVar: satirlar.some((s) => s.iskontoOran > 0),
    genelIskontoVar: genelIskontoOran > 0,
    /** Tüm satırlar aynı oranla iskontoluysa o oran, değilse null */
    tekIskontoOrani: iskontoOranlari.length === 1 && iskontoOranlari[0] > 0 ? iskontoOranlari[0] : null,
    /** Brüt üzerinden gerçekleşen efektif iskonto yüzdesi */
    efektifIskontoOrani: brutToplam > 0 ? (satirIskontoToplam / brutToplam) * 100 : 0,
  }
}

/** %11,09122 → "11,09" · %10 → "10" (gereksiz sıfır basılmaz) */
export const oranMetni = (n) => sayi(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 })

/**
 * Belgedeki para biçimi — her zaman iki ondalık.
 * ⚠️ `maximumFractionDigits` yazılmazsa Intl varsayılanı 3'e çıkar ve tutarlar
 * ₺45.599,983 gibi basılır; eski çıktılarda bu hata vardı.
 */
export const tutarMetni = (n) =>
  sayi(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Toplamlar bloğundaki iskonto satırının etiketi.
 * Tüm satırlar aynı orandaysa gerçek oran yazılır ("İskonto (%10)").
 * Oranlar karışıksa ya da bazı satırlar iskontosuzsa efektif oran "ort." ile
 * işaretlenir — tek bir oranı hepsine mal etmek müşteriyi yanıltır.
 */
export const iskontoEtiketi = (h) =>
  h.tekIskontoOrani != null
    ? `İskonto (%${oranMetni(h.tekIskontoOrani)})`
    : `İskonto (ort. %${oranMetni(h.efektifIskontoOrani)})`

/** Satır tablosundaki iskonto hücresi — iskontosuz satırda tire */
export const satirIskontoMetni = (oran) => (sayi(oran) > 0 ? `%${oranMetni(oran)}` : '—')

/** "KDV %20" / oran kırılımı tek değilse her oran ayrı satır olur */
export const kdvSatirlari = (h) =>
  Object.entries(h.kdvKirilimi)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([oran, tutar]) => ({ etiket: `KDV %${oranMetni(oran)}`, tutar }))

// ---------- Dövizli belgede TL karşılığı (13.08.2026) ----------
//
// Devlet kuruluşları dövizli teklifi TL karşılığıyla ister. Karşılıklar
// BİLGİ değeridir: belgenin resmi tutarı döviz cinsindendir, kur beyan edilir.
// Üç çıktı şablonu da BURADAN beslenir — formül şablonlara kopyalanmaz
// (kopyalanan formül PDF ≠ Excel vakasının kök nedeniydi).

/** Çıktıda TL karşılığı gösterilsin mi — tek koşul kaynağı */
export const tlKarsiligiGoster = (teklif) =>
  teklif?.paraBirimi && teklif.paraBirimi !== 'TL' && sayi(teklif.dovizKuru) > 0

/** Tek tutarın TL karşılığı — kuruşa yuvarlı */
export const tlKarsilik = (n, kur) => r2(sayi(n) * sayi(kur))

/**
 * Kur beyan cümlesi. Kur en çok 4 ondalıkla basılır (TCMB kurları 4 hanelidir;
 * `maximumFractionDigits` yazılmazsa Intl 3'e sabitler — bilinen tuzak).
 */
export const kurBeyani = (paraBirimi, kur) =>
  `1 ${paraBirimi} = ${sayi(kur).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} TL kuru esas alınmıştır. TL karşılıkları bilgi amaçlıdır.`
