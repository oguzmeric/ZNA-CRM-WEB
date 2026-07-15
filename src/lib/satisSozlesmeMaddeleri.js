// Satış sözleşmesi madde havuzu + dinamik sözleşme HTML üretici (spec §4-§7).
// Kullanıcı seçenek seçtikçe (çekli / döviz / montaj / damga) ilgili maddeler
// otomatik eklenir; firma tipine göre talep edilecek belgeler listelenir.

import { sozlesmeHesapla, paraFmt } from './satisSozlesmeHesap'

export const SABLON_TIPLERI_SS = [
  { id: 'standart',       isim: 'Standart Satış Sözleşmesi' },
  { id: 'cekli_vadeli',   isim: 'Çekli / Vadeli Satış Sözleşmesi' },
  { id: 'kur_farkli',     isim: 'Kur Farklı Satış Sözleşmesi' },
  { id: 'montaj_proje',   isim: 'Montaj Dahil Proje Sözleşmesi' },
  { id: 'bakim_hizmet',   isim: 'Bakım Hizmeti Sözleşmesi' },
  { id: 'kamu_yuklenici', isim: 'Kamu / Müteahhit Alt Yüklenici Sözleşmesi' },
  { id: 'bayi_satis',     isim: 'Bayi Satış Sözleşmesi' },
  { id: 'yazilim_lisans', isim: 'Yazılım Lisans Sözleşmesi' },
  { id: 'servis_destek',  isim: 'Servis ve Teknik Destek Sözleşmesi' },
]

export const FIRMA_TIPLERI_SS = [
  { id: 'sahis',   isim: 'Şahıs Firması' },
  { id: 'limited', isim: 'Limited Şirket' },
  { id: 'anonim',  isim: 'Anonim Şirket' },
  { id: 'kamu',    isim: 'Kamu Kurumu' },
  { id: 'dernek',  isim: 'Dernek' },
  { id: 'vakif',   isim: 'Vakıf' },
]

export const ODEME_TIPLERI_SS = [
  { id: 'pesin',       isim: 'Peşin' },
  { id: 'havale',      isim: 'Havale / EFT' },
  { id: 'kredi_karti', isim: 'Kredi Kartı' },
  { id: 'cek',         isim: 'Çek' },
  { id: 'senet',       isim: 'Senet' },
  { id: 'parcali',     isim: 'Parçalı Ödeme' },
]

export const KUR_TIPLERI_SS = [
  { id: 'tcmb_satis',    isim: 'TCMB Döviz Satış' },
  { id: 'efektif_satis', isim: 'TCMB Efektif Satış' },
  { id: 'ozel',          isim: 'Özel Kur' },
]

export const SS_DURUMLARI = {
  taslak:            { isim: 'Taslak',                    tone: 'neutral' },
  yonetici_onayinda: { isim: 'Yönetici Onayı Bekliyor',   tone: 'uyari' },
  onaylandi:         { isim: 'Onaylandı (Kilitli)',       tone: 'bilgi' },
  gonderildi:        { isim: 'Müşteriye Gönderildi',      tone: 'beklemede' },
  imzalandi:         { isim: 'İmzalandı',                 tone: 'aktif' },
  iptal:             { isim: 'İptal',                     tone: 'kayip' },
}

// Firma tipine göre talep edilecek belgeler (spec §7) — çek fotokopisi yalnız çekli ödemede
export const evrakListesiUret = ({ firmaTipi, odemeTipi, imzaBelgesiIstenir = true }) => {
  const cekli = odemeTipi === 'cek' || odemeTipi === 'senet'
  const liste = []
  if (firmaTipi === 'sahis') {
    liste.push({ tip: 'vergi_levhasi', isim: 'Vergi Levhası' })
    if (imzaBelgesiIstenir) liste.push({ tip: 'imza_beyannamesi', isim: 'İmza Beyannamesi' })
    liste.push({ tip: 'kimlik', isim: 'T.C. Kimlik Fotokopisi' })
    liste.push({ tip: 'faaliyet_belgesi', isim: 'Faaliyet Belgesi (varsa)' })
    if (cekli) liste.push({ tip: 'cek_fotokopisi', isim: 'Çek Fotokopisi' })
    liste.push({ tip: 'kase', isim: 'Kaşe Bilgisi' })
    liste.push({ tip: 'adres', isim: 'Adres Bilgisi / Tebligat Adresi' })
  } else if (firmaTipi === 'limited' || firmaTipi === 'anonim') {
    liste.push({ tip: 'vergi_levhasi', isim: 'Vergi Levhası' })
    if (imzaBelgesiIstenir) liste.push({ tip: 'imza_sirkusu', isim: 'İmza Sirküleri' })
    liste.push({ tip: 'ticaret_sicil', isim: 'Ticaret Sicil Gazetesi' })
    liste.push({ tip: 'faaliyet_belgesi', isim: 'Faaliyet Belgesi' })
    liste.push({ tip: 'yetkili_kimlik', isim: 'Yetkili Kimlik Fotokopisi' })
    if (cekli) liste.push({ tip: 'cek_fotokopisi', isim: 'Çek Fotokopisi' })
    liste.push({ tip: 'kase', isim: 'Kaşe Bilgisi' })
  } else {
    // Kamu / dernek / vakıf
    liste.push({ tip: 'yetki_yazisi', isim: 'Kurum Yetki / Görevlendirme Yazısı' })
    liste.push({ tip: 'vergi_levhasi', isim: 'Vergi Levhası / Vergi Muafiyet Belgesi' })
    if (imzaBelgesiIstenir) liste.push({ tip: 'imza_sirkusu', isim: 'İmza Sirküleri / Yetkili İmza Örneği' })
    liste.push({ tip: 'yetkili_kimlik', isim: 'Yetkili Kimlik Fotokopisi' })
    if (cekli) liste.push({ tip: 'cek_fotokopisi', isim: 'Çek Fotokopisi' })
  }
  return liste.map(e => ({ ...e, durum: 'bekleniyor' }))
}

// ---------- Madde havuzu ----------

const kurTipiIsim = (id) => KUR_TIPLERI_SS.find(k => k.id === id)?.isim || 'TCMB Döviz Satış'
const odemeIsim = (id) => ODEME_TIPLERI_SS.find(o => o.id === id)?.isim || id

// Spec §3'teki ZNA'yı koruyan kur maddesi — birebir
const KUR_KORUMA_METNI = (paraBirimi, kurTipi) =>
  `Sözleşme bedeli ${paraBirimi} bazlıdır. Ödeme TL çek ile yapılacaksa çek tutarı, çekin düzenlendiği ` +
  `tarihteki ${kurTipiIsim(kurTipi)} kuru üzerinden TL'ye çevrilir. Çekin vadesinde tahsil edildiği ` +
  `tarihteki kur ile düzenleme tarihindeki kur arasında Satıcı aleyhine fark oluşması halinde kur farkı ` +
  `ayrıca fatura edilir.`

export const maddeleriOlustur = (s) => {
  const maddeler = []
  const ekle = (baslik, metin) => maddeler.push({ baslik, metin })
  const kapsamlar = [
    s.montajDahil && 'montaj',
    s.devreyeAlmaDahil && 'devreye alma',
    s.egitimDahil && 'kullanıcı eğitimi',
    s.bakimDahil && 'bakım hizmeti',
  ].filter(Boolean)

  ekle('Sözleşmenin Konusu',
    `İşbu sözleşmenin konusu; Satıcı tarafından Alıcı'ya, ${s.projeAdi ? `"${s.projeAdi}" projesi kapsamında ` : ''}` +
    `${s.isinKonusu || 'ekli ürün listesinde belirtilen ürün ve hizmetlerin satışı'}` +
    `${kapsamlar.length ? ` ile ${kapsamlar.join(', ')} hizmetlerinin verilmesi` : ''}dir. ` +
    `Sözleşme kapsamındaki ürün ve hizmetler Ek-2 Ürün Listesi'nde ayrıntılı olarak yer alır.`)

  ekle('Sözleşme Bedeli',
    `Sözleşme bedeli, vade farkı${s.damgaDahil !== false ? ', damga vergisi' : ''} ve iskonto dahil ` +
    `nihai ${paraFmt(s.nihaiToplam, s.paraBirimi)} olup hesap dökümü işbu sözleşmenin "Bedel ve Hesap Özeti" ` +
    `bölümünde gösterilmiştir. Aksi yazılı olarak kararlaştırılmadıkça bedele nakliye, sigorta ve ` +
    `sözleşme dışı ek işler dahil değildir.`)

  ekle('Ödeme Şekli',
    `Ödeme, ${odemeIsim(s.odemeTipi)} yoluyla${s.vadeGunu > 0 ? ` ve ${s.vadeGunu} gün vade ile` : ' peşin olarak'} yapılacaktır. ` +
    `Ödemeler Satıcı'nın yazılı olarak bildirdiği banka hesabına yapılır. ` +
    `${s.vadeGunu > 0 && s.vadeOrani > 0 ? `Vade farkı aylık %${Number(s.vadeOrani).toLocaleString('tr-TR')} oranı üzerinden hesaplanmış ve sözleşme bedeline yansıtılmıştır. ` : ''}` +
    `Vadesinde ödenmeyen tutarlara ayrıca ihtara gerek olmaksızın kanuni ticari temerrüt faizi uygulanır.`)

  // Çekli ödeme maddeleri (spec §5)
  if (s.odemeTipi === 'cek' || s.odemeTipi === 'senet') {
    const belge = s.odemeTipi === 'cek' ? 'çek' : 'senet'
    ekle('Çek / Senet Teslim Şartı',
      `Alıcı, sözleşme imzasıyla birlikte${s.cekTarihi ? ` ${trTarih(s.cekTarihi)} keşide/vade tarihli` : ''}` +
      `${s.cekBankasi ? ` ${s.cekBankasi} bankasına ait` : ''}${s.cekNo ? ` ${s.cekNo} numaralı` : ''} ` +
      `${belge}i Satıcı'ya teslim eder. ${belge.charAt(0).toUpperCase() + belge.slice(1)} teslim edilmeden Satıcı ifa yükümlülüğü altına girmez.`)
    ekle('Karşılıksız Çıkma ve Temerrüt',
      `${belge.charAt(0).toUpperCase() + belge.slice(1)}in karşılıksız çıkması, ödenmemesi veya ödemeden men talimatı verilmesi halinde ` +
      `Alıcı başkaca ihtara gerek olmaksızın temerrüde düşer; bakiye borcun tamamı muaccel olur ve Satıcı ` +
      `teslimatı/hizmeti durdurma, sözleşmeyi fesih ve tüm zararlarını talep hakkına sahiptir.`)
    ekle('Tahsil Şartı',
      `${belge.charAt(0).toUpperCase() + belge.slice(1)} tahsil edilmeden ödeme tamamlanmış sayılmaz. ` +
      `${belge.charAt(0).toUpperCase() + belge.slice(1)}in ciro edilmesi veya teminata verilmesi ödeme yerine geçmez.`)
    ekle('Devir ve Teminat',
      `Satıcı, kendisine teslim edilen ${belge}i ciro ve devredebilir veya teminat olarak kullanabilir. ` +
      `Alıcı bu hususta şimdiden muvafakat etmiştir.`)
    ekle('Kur Farkı Tahsil Hakkı',
      `Döviz bazlı sözleşmelerde kur farkı tahsil hakkı saklıdır; ilgili hüküm "Kur ve Kur Farkı" maddesinde düzenlenmiştir.`)
  }

  // Döviz / kur farkı maddeleri (spec §5)
  if (s.paraBirimi !== 'TL' || s.kurFarkiUygulanir) {
    ekle('Kur ve Kur Farkı', KUR_KORUMA_METNI(s.paraBirimi === 'TL' ? 'döviz' : s.paraBirimi, s.kurTipi))
    ekle('Fatura ve Tahsilat Kuru',
      `Faturalama ve TL tahsilatlarda, aksi yazılı olarak kararlaştırılmadıkça işlem günündeki ` +
      `${kurTipiIsim(s.kurTipi)} kuru${s.kurTipi === 'ozel' && s.ozelKur ? ` (özel kur: ${Number(s.ozelKur).toLocaleString('tr-TR')} TL)` : ''} esas alınır.`)
    ekle('TL Ödeme Halinde Kur Koruması',
      `Alıcı'nın TL ödemesi halinde ödeme günü kuru ile fatura/sözleşme kuru arasında Satıcı aleyhine ` +
      `oluşan fark, Satıcı tarafından ayrıca fatura edilir; Alıcı bu farkı fatura tarihinden itibaren 7 gün içinde öder.`)
  }

  // Montaj maddeleri (spec §5)
  if (s.montajDahil) {
    ekle('Montaj Alanının Hazırlığı',
      `Montaj alanı; Alıcı tarafından montaja hazır, temiz, güvenli ve erişilebilir şekilde teslim edilir. ` +
      `Alanın hazır olmamasından kaynaklanan bekleme, tekrar mobilizasyon ve gecikme maliyetleri Alıcı'ya aittir.`)
    ekle('Elektrik, Altyapı ve Kablolama Sınırları',
      `Aksi Ek-3 Teknik Kapsam'da yazılı değilse; enerji hattı, topraklama, şebeke/internet altyapısı, ` +
      `kazı, kanal, boru ve bina içi kablolama güzergâhının hazırlanması Alıcı sorumluluğundadır. ` +
      `Satıcı'nın kablolama sorumluluğu Ek-3'te belirtilen nokta ve metrajla sınırlıdır.`)
    ekle('İş Sağlığı ve Güvenliği',
      `Alıcı, montaj sahasında iş sağlığı ve güvenliği koşullarını sağlar; saha kaynaklı risklere karşı ` +
      `gerekli önlemleri alır. Satıcı personeli, sahada Alıcı'nın İSG kurallarına uyar.`)
    ekle('Ek İş ve Keşif Farkı',
      `Sözleşme kapsamı Ek-3 Teknik Kapsam ile sınırlıdır. Keşifte öngörülmeyen ilave iş, malzeme veya ` +
      `metraj farkları ayrıca fiyatlandırılır ve yazılı onay sonrası yapılır.`)
    ekle('Teslim Tutanağı',
      `Montaj ve varsa devreye alma tamamlandığında taraflarca Teslim Tutanağı imzalanır. ` +
      `Tutanağın imzası veya sistemin fiilen kullanılmaya başlanması ile teslim gerçekleşmiş sayılır.`)
  }

  // Damga vergisi maddesi (spec §5)
  if (s.damgaDahil !== false) {
    ekle('Damga Vergisi',
      `Damga vergisi (binde ${(Number(s.damgaOrani || 0.00948) * 1000).toLocaleString('tr-TR')}) sözleşme bedeline dahil edilmiştir. ` +
      `Taraflar aksini yazılı olarak kararlaştırmadıkça damga vergisi bedeli Alıcı'ya yansıtılmış kabul edilir.`)
  }

  if (s.bakimDahil) {
    ekle('Bakım Hizmeti',
      `Sözleşme kapsamındaki bakım hizmeti${s.isSuresi ? ` ${s.isSuresi} boyunca` : ''} Ek-3 Teknik Kapsam'da ` +
      `belirtilen periyot ve içerikle sınırlıdır. Kullanıcı hatası, üçüncü kişi müdahalesi, elektrik/altyapı ` +
      `kaynaklı arızalar ve sarf malzemeleri bakım kapsamı dışındadır.`)
  }
  if (s.egitimDahil) {
    ekle('Eğitim',
      `Satıcı, sistemin temel kullanımı için Alıcı'nın belirleyeceği kullanıcılara bir defaya mahsus ` +
      `kullanım eğitimi verir. İlave eğitim talepleri ayrıca ücretlendirilir.`)
  }

  ekle('Teslim ve Süre',
    `${s.teslimSekli ? `Teslim şekli: ${s.teslimSekli}. ` : ''}` +
    `${s.isSuresi ? `İşin süresi: ${s.isSuresi}. ` : ''}` +
    `Teslim süreleri; tedarik, lojistik, gümrük, mücbir sebep, ödeme gecikmesi veya Alıcı'dan kaynaklanan ` +
    `nedenlerle uzayabilir. Bu hallerde Satıcı temerrüde düşmüş sayılmaz.`)

  ekle('Garanti',
    `Ürünler, üretici garanti koşulları ile sınırlı olmak üzere fatura tarihinden itibaren garanti kapsamındadır. ` +
    `Yanlış kullanım, uygunsuz ortam, enerji/altyapı sorunları, yetkisiz müdahale ve bakım eksikliği garanti dışıdır.`)

  ekle('Gizlilik ve Kişisel Verilerin Korunması',
    `Taraflar; işbu sözleşme kapsamında öğrendikleri ticari sırları gizli tutar ve 6698 sayılı KVKK ` +
    `kapsamındaki yükümlülüklerine uygun davranır.`)

  ekle('Mülkiyetin Saklı Tutulması',
    `Sözleşme bedeli tamamen tahsil edilinceye kadar ürünlerin mülkiyeti Satıcı'da kalır. ` +
    `Alıcı, bedeli ödenmemiş ürünleri üçüncü kişilere devredemez, rehnedemez veya teminat gösteremez.`)

  ekle('Uyuşmazlık Çözümü',
    `İşbu sözleşmeden doğan uyuşmazlıklarda Satıcı'nın ticari defter ve kayıtları, CRM/ERP kayıtları ve ` +
    `elektronik belgeleri HMK kapsamında delil niteliğindedir. Uyuşmazlıklarda İstanbul Anadolu Mahkemeleri ` +
    `ve İcra Daireleri yetkilidir.`)

  ekle('Yürürlük',
    `İşbu sözleşme, taraf yetkililerince imzalandığı tarihte yürürlüğe girer ve ekleriyle birlikte ayrılmaz bir bütündür.`)

  return maddeler
}

// ---------- HTML üretici (spec §6, §11) ----------
// position:fixed başlık/altbilgi yazdırmada HER SAYFADA tekrarlanır:
// üstte ZNA logosu + sözleşme no, altta Satıcı/Alıcı kaşe-imza şeridi.

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const trTarih = (d) => {
  if (!d) return '—'
  const t = new Date(d)
  return isNaN(t) ? String(d) : t.toLocaleDateString('tr-TR')
}

export const sozlesmeHtmlUret = (s, { logoUrl = '/logo.jpeg' } = {}) => {
  const hesap = sozlesmeHesapla({
    anaToplam: s.anaToplam, vadeGunu: s.vadeGunu, vadeOrani: s.vadeOrani,
    damgaOrani: s.damgaOrani, damgaDahil: s.damgaDahil, iskonto: s.iskonto, yuvarlama: s.yuvarlama,
  })
  const maddeler = maddeleriOlustur({ ...s, nihaiToplam: hesap.nihaiToplam })
  const evraklar = (s.evraklar?.length ? s.evraklar : evrakListesiUret({
    firmaTipi: s.firmaTipi, odemeTipi: s.odemeTipi, imzaBelgesiIstenir: s.imzaBelgesiIstenir,
  }))
  const sablonIsim = SABLON_TIPLERI_SS.find(t => t.id === s.sablonTipi)?.isim || 'Satış Sözleşmesi'
  const urunler = Array.isArray(s.urunListesi) ? s.urunListesi : []
  const pb = s.paraBirimi || 'TL'
  const firmaTipiIsim = FIRMA_TIPLERI_SS.find(f => f.id === s.firmaTipi)?.isim || '—'
  const kapsamRozet = [
    ['Montaj', s.montajDahil], ['Devreye Alma', s.devreyeAlmaDahil],
    ['Eğitim', s.egitimDahil], ['Bakım', s.bakimDahil],
  ].map(([ad, v]) => `${ad}: ${v ? 'Dahil' : 'Hariç'}`).join(' · ')

  const satirlar = urunler.map((u, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${esc(u.stokKodu || u.stok_kodu || '')}</td>
      <td>${esc(u.urunAdi || u.urun_adi || u.aciklama || '')}</td>
      <td class="c">${esc(u.miktar ?? '')} ${esc(u.birim || 'Adet')}</td>
      <td class="r">${u.birimFiyat != null ? paraFmt(u.birimFiyat, pb) : '—'}</td>
      <td class="r">${u.toplam != null ? paraFmt(u.toplam, pb) : (u.birimFiyat != null && u.miktar != null ? paraFmt(u.birimFiyat * u.miktar, pb) : '—')}</td>
    </tr>`).join('')

  return `
<style>
  .ss-belge { font: 400 11.5pt/1.5 'Times New Roman', Georgia, serif; color: #111; }
  .ss-belge * { box-sizing: border-box; }

  /* Sayfa iskeleti. Başlık/altlık thead/tfoot içinde durur: tarayıcı bunları HER
     A4 sayfasında tekrarlar VE yerlerini kendisi ayırır. Eskiden position:fixed
     kullanılıyordu; fixed öğe her sayfada çizilir ama yer YALNIZCA ilk sayfada
     ayrıldığı için (.ss-icerik margin) 2. sayfadan itibaren başlık metnin üstüne
     biniyor, altına gizlenen satırlar okunamıyordu. */
  .ss-belge > .ss-sayfa { width: 100%; border-collapse: collapse; margin: 0; page-break-inside: auto; }
  .ss-sayfa > thead > tr > td,
  .ss-sayfa > tfoot > tr > td,
  .ss-sayfa > tbody > tr > td { border: 0; padding: 0; font-size: inherit; vertical-align: top; }
  .ss-ust { display: flex; align-items: center; justify-content: space-between;
    padding: 6px 0 4px; margin-bottom: 12px;
    border-bottom: 1.5px solid #1E5AA8; background: #fff; }
  .ss-ust img { height: 40px; object-fit: contain; }
  .ss-ust .no { font: 700 10pt/1.2 'Times New Roman', serif; color: #1E5AA8; text-align: right; }
  .ss-alt { border-top: 1px solid #999; background: #fff; display: flex; justify-content: space-between;
    margin-top: 12px; padding-top: 4px; font: 600 8.5pt/1.3 'Times New Roman', serif; color: #444; }
  .ss-alt .kutu { width: 46%; }
  .ss-belge h1 { font-size: 15pt; text-align: center; margin: 8px 0 2px; letter-spacing: 0.02em; }
  .ss-belge h2 { font-size: 12pt; margin: 18px 0 6px; border-bottom: 1px solid #bbb; padding-bottom: 2px; }
  .ss-belge h3 { font-size: 11.5pt; margin: 12px 0 4px; }
  .ss-belge table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; }
  .ss-belge td, .ss-belge th { border: 1px solid #999; padding: 4px 8px; font-size: 10.5pt; vertical-align: top; }
  .ss-belge th { background: #EEF3FA; text-align: left; font-weight: 700; }
  .ss-belge .c { text-align: center; } .ss-belge .r { text-align: right; white-space: nowrap; }
  .ss-belge .madde { margin: 0 0 8px; text-align: justify; }
  .ss-belge .kunye td:first-child { width: 200px; font-weight: 700; background: #F6F8FB; }
  .ss-imza { margin-top: 36px; display: flex; justify-content: space-between; gap: 24px; page-break-inside: avoid; }
  .ss-imza .alan { width: 46%; border: 1px solid #999; padding: 12px 14px 64px; font-size: 10.5pt; }
  .ss-toplam td { font-weight: 700; background: #F6F8FB; }
  @media print {
    .ss-sayfa > thead { display: table-header-group; }
    .ss-sayfa > tfoot { display: table-footer-group; }
    /* Başlık sayfa sonunda tek başına kalmasın, madde metni tek satır bölünmesin */
    .ss-belge h2, .ss-belge h3 { page-break-after: avoid; break-after: avoid; }
    .ss-belge .madde { orphans: 2; widows: 2; }
    @page { margin: 18mm 14mm; }
  }
</style>
<div class="ss-belge">
 <table class="ss-sayfa">
  <thead><tr><td>
    <div class="ss-ust">
      <img src="${esc(logoUrl)}" alt="ZNA Teknoloji" />
      <div class="no">${esc(s.sozlesmeNo || 'TASLAK')}<br/><span style="font-weight:400;color:#555">${esc(sablonIsim)}</span></div>
    </div>
  </td></tr></thead>
  <tfoot><tr><td>
    <div class="ss-alt">
      <div class="kutu">SATICI Kaşe / İmza:</div>
      <div class="kutu" style="text-align:right">ALICI Kaşe / İmza:</div>
    </div>
  </td></tr></tfoot>
  <tbody><tr><td>

  <div class="ss-icerik">
    <h1>${esc(sablonIsim).toUpperCase()}</h1>
    <div style="text-align:center; font-size:10.5pt; color:#333; margin-bottom:14px;">
      Sözleşme No: <strong>${esc(s.sozlesmeNo || 'TASLAK')}</strong> &nbsp;·&nbsp; Tarih: <strong>${trTarih(s.olusturmaTarih || new Date())}</strong>
      ${s.gorusmeNo ? ` &nbsp;·&nbsp; Görüşme: ${esc(s.gorusmeNo)}` : ''}
      ${s.teklifNo ? ` &nbsp;·&nbsp; Teklif: ${esc(s.teklifNo)}` : ''}
      ${s.siparisNo ? ` &nbsp;·&nbsp; Sipariş: ${esc(s.siparisNo)}` : ''}
    </div>

    <h2>1. Taraflar</h2>
    <table class="kunye">
      <tr><td>SATICI</td><td><strong>ZNA Teknoloji Bilişim Hizmetleri Sanayi ve Ticaret Ltd. Şti.</strong><br/>Başakşehir / İstanbul</td></tr>
      <tr><td>ALICI</td><td><strong>${esc(s.firmaAdi || '—')}</strong> (${esc(firmaTipiIsim)})<br/>
        ${s.vergiDairesi || s.tcVergiNo ? `Vergi D./No: ${esc(s.vergiDairesi || '—')} / ${esc(s.tcVergiNo || '—')}<br/>` : ''}
        ${s.adres ? `Adres: ${esc(s.adres)}<br/>` : ''}
        ${s.telefon ? `Telefon: ${esc(s.telefon)} · ` : ''}${s.email ? `E-posta: ${esc(s.email)}` : ''}<br/>
        Yetkili: ${esc(s.yetkiliAdi || '—')}${s.imzaYetkilisi && s.imzaYetkilisi !== s.yetkiliAdi ? ` · İmza Yetkilisi: ${esc(s.imzaYetkilisi)}` : ''}</td></tr>
    </table>

    <h2>2. Proje Bilgileri</h2>
    <table class="kunye">
      ${s.projeAdi ? `<tr><td>Proje Adı</td><td>${esc(s.projeAdi)}</td></tr>` : ''}
      ${s.lokasyon ? `<tr><td>Lokasyon</td><td>${esc(s.lokasyon)}</td></tr>` : ''}
      ${s.kurumAdi ? `<tr><td>Belediye / Kurum</td><td>${esc(s.kurumAdi)}</td></tr>` : ''}
      ${s.anaYuklenici ? `<tr><td>Ana Yüklenici</td><td>${esc(s.anaYuklenici)}</td></tr>` : ''}
      ${s.isinKonusu ? `<tr><td>İşin Konusu</td><td>${esc(s.isinKonusu)}</td></tr>` : ''}
      ${s.isSuresi ? `<tr><td>İş Süresi</td><td>${esc(s.isSuresi)}</td></tr>` : ''}
      ${s.teslimSekli ? `<tr><td>Teslim Şekli</td><td>${esc(s.teslimSekli)}</td></tr>` : ''}
      <tr><td>Kapsam</td><td>${esc(kapsamRozet)}</td></tr>
    </table>

    <h2>3. Bedel ve Hesap Özeti</h2>
    <table>
      <tr><th style="width:60%">Kalem</th><th class="r">Tutar</th></tr>
      <tr><td>Ana Toplam (KDV dahil)</td><td class="r">${paraFmt(hesap.anaToplam, pb)}</td></tr>
      ${hesap.vadeFarki ? `<tr><td>Vade Farkı (${esc(s.vadeGunu)} gün · aylık %${Number(s.vadeOrani || 0).toLocaleString('tr-TR')})</td><td class="r">${paraFmt(hesap.vadeFarki, pb)}</td></tr>` : ''}
      ${hesap.damgaVergisi ? `<tr><td>Damga Vergisi (binde ${(Number(s.damgaOrani || 0.00948) * 1000).toLocaleString('tr-TR')})</td><td class="r">${paraFmt(hesap.damgaVergisi, pb)}</td></tr>` : ''}
      ${Number(s.iskonto) ? `<tr><td>Ticari İskonto</td><td class="r">− ${paraFmt(s.iskonto, pb)}</td></tr>` : ''}
      ${Number(s.yuvarlama) ? `<tr><td>Yuvarlama / Özel Anlaşma</td><td class="r">${paraFmt(s.yuvarlama, pb)}</td></tr>` : ''}
      <tr class="ss-toplam"><td>NİHAİ SÖZLEŞME BEDELİ</td><td class="r">${paraFmt(hesap.nihaiToplam, pb)}</td></tr>
    </table>

    <h2>4. Sözleşme Maddeleri</h2>
    ${maddeler.map((m, i) => `<h3>4.${i + 1}. ${esc(m.baslik)}</h3><p class="madde">${esc(m.metin)}</p>`).join('')}

    <h2>Ek-1 / Ek-2 — Fiyat Teklifi ve Ürün Listesi</h2>
    ${urunler.length ? `
    <table>
      <tr><th class="c" style="width:34px">#</th><th style="width:110px">Stok Kodu</th><th>Ürün / Hizmet</th><th class="c" style="width:80px">Miktar</th><th class="r" style="width:110px">Birim Fiyat</th><th class="r" style="width:120px">Toplam</th></tr>
      ${satirlar}
    </table>` : `<p class="madde">Ürün listesi ${s.teklifNo ? `${esc(s.teklifNo)} numaralı teklif ekinde` : 'sözleşme ekinde'} yer almaktadır.</p>`}

    <h2>Ek-3 — Teknik Kapsam</h2>
    <p class="madde">${esc(s.isinKonusu || 'Teknik kapsam, taraflarca onaylanan keşif ve teklif dokümanı ile sınırlıdır.')}${kapsamlarMetni(s)}</p>

    <h2>Ek-4 — Talep Edilecek Belgeler</h2>
    <table>
      <tr><th style="width:40px" class="c">#</th><th>Belge</th></tr>
      ${evraklar.map((e, i) => `<tr><td class="c">${i + 1}</td><td>${esc(e.isim)}</td></tr>`).join('')}
    </table>

    <div class="ss-imza">
      <div class="alan"><strong>SATICI</strong><br/>ZNA Teknoloji Bilişim Hizmetleri San. ve Tic. Ltd. Şti.<br/>Yetkili: ${esc(s.saticiImzaYetkilisi || 'Ali Uğur Aktepe')}<br/><br/>Kaşe / İmza:</div>
      <div class="alan"><strong>ALICI</strong><br/>${esc(s.firmaAdi || '—')}<br/>Yetkili: ${esc(s.imzaYetkilisi || s.yetkiliAdi || '—')}<br/><br/>Kaşe / İmza:</div>
    </div>
  </div>

  </td></tr></tbody>
 </table>
</div>`
}

// 2026-07-15 öncesi üretilmiş sözleşmelerin GÖMÜLÜ stili bozuktu (position:fixed
// başlık 2. sayfadan itibaren metnin üstüne biniyor, altındaki satırlar
// okunamıyordu). uretilen_icerik imzalı sözleşmelerde donmuş bir anlık
// görüntüdür — metnine dokunulmaz. Bu yama yalnızca GÖSTERİM anında sonuna
// eklenir; kayıt byte olarak aynı kalır, sadece binme kalkar.
//
// Eski belgede başlık/altlık HER sayfada tekrar edemez (yapısı buna uygun
// değil): başlık bir kez üstte görünür. Metnin kaybolmasına yeğdir.
const ESKI_KAYIT_YAMASI = `
<style>
  .ss-sabit-ust { position: static !important; height: auto !important; margin-bottom: 12px !important; }
  .ss-sabit-alt { display: none !important; }
  .ss-icerik { margin: 0 !important; }
</style>`

/** Kayıtlı sözleşme HTML'ini ekrana/yazdırmaya vermeden önce buradan geçir. */
export const ssBelgeGoster = (html) => {
  if (!html) return ''
  return html.includes('ss-sabit-ust') ? `${html}${ESKI_KAYIT_YAMASI}` : html
}

const kapsamlarMetni = (s) => {
  const dahil = [
    s.montajDahil && 'montaj', s.devreyeAlmaDahil && 'devreye alma',
    s.egitimDahil && 'kullanıcı eğitimi', s.bakimDahil && 'bakım',
  ].filter(Boolean)
  return dahil.length ? ` Sözleşme kapsamına ${dahil.join(', ')} dahildir.` : ''
}
