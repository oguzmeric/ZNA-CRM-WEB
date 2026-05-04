# Teklif Şablonları — Trassir & Karel

**Tarih:** 2026-05-04
**Bağlam:** ZNA CRM Web (`crm-app`) — `src/pages/TeklifYazdir.jsx` şu an tek tip baskı çıktısı veriyor. Satışçılar Trassir teklifleri (uzun, marka-yoğun, dikey A4 sunum) ve Karel teklifleri (tek sayfa, kompakt, mektup formatı) için iki farklı standart belge istiyor.

## Hedef

Teklif oluşturulurken **satışçı şablonu seçer** (Standart / Trassir / Karel). Yazdır sayfasında hem **PDF** (browser print) hem **Excel (.xlsx)** çıktısı alınabilir. Her şablon kendi mizanpajını korur: Trassir = çok sayfalı sunum, Karel = tek sayfa kompakt belge.

## Veri modeli

`teklifler` tablosuna yeni kolon:

```sql
ALTER TABLE teklifler
  ADD COLUMN teklif_tipi text NOT NULL DEFAULT 'standart'
  CHECK (teklif_tipi IN ('standart','trassir','karel'));
```

- Migration: `supabase_migrations/025_teklif_tipi.sql` (mevcut son migration 024)
- Mevcut tüm satırlar `'standart'` ile dolar — geriye dönük uyumluluk korunur.
- Schema cache reload `notify pgrst, 'reload schema'`.

## UI değişiklikleri

### TeklifDetay (`src/pages/TeklifDetay.jsx`)

Form'un en üstüne, müşteri/firma alanının yanına bir **SegmentedControl** eklenir:

```
Teklif Şablonu:  [ Standart ] [ Trassir ] [ Karel ]
```

- Yeni teklifte varsayılan: `Standart`
- State: `teklifTipi` (kayıt sırasında diğer alanlarla birlikte gönderilir)
- Servis: `teklifService.teklifEkle` / `teklifGuncelle` — `teklif_tipi` alanını mapper üzerinden gönderir.

### Teklifler liste sayfası (`src/pages/Teklifler.jsx`)

Satır içinde tipi göstermek için küçük bir badge: `Standart` / `Trassir` / `Karel`. Filtre eklenmez (YAGNI — kullanıcı talep ederse sonra).

### TeklifYazdir (`src/pages/TeklifYazdir.jsx`)

Mevcut sayfa tek bir component'a (`StandartCikti`) çekilir. Yeni iki component eklenir: `TrassirCikti`, `KarelCikti`. Üst seviye `TeklifYazdir` artık sadece veriyi çekip `teklif.teklifTipi`'ne göre uygun component'i render eder.

Yazdır butonunun yanına **"Excel İndir"** butonu eklenir. Excel üretimi `exceljs` kütüphanesi ile client-side yapılır.

## Şablon detayları

### Standart (mevcut çıktı, değişmez)

Tek sayfa A4, mavi (`#0176D3`) "TEKLİF" başlığı, iki kolon bilgi kartı, ürün tablosu, toplamlar, açıklama, footer. Karşılığını [TeklifYazdir.jsx](src/pages/TeklifYazdir.jsx) dosyasındaki mevcut kod oluşturur — değişmez.

### Trassir şablonu

A4 dikey, çok sayfalı, marka-yoğun.

**Sayfa 1 — Kapak:**
- Tam sayfa kapak görseli: `public/teklif-assets/zna-cover.png` (mavi devre kartı temalı ZNA Teknoloji görseli, Excel'in `image.png`'inden türetilir)

**Sayfa 2 — Anlatı:**
- Başlık: **"Fiyat Teklifi"**
- Karşılama paragrafı: `"Sayın {firmaAdi}\n\n{TRASSIR_KARSILAMA}"` — sabit metin
- **"ZNA Hakkında"** başlık + sabit paragraf
- **"Hizmetlerimiz"** başlık + 11 maddelik sabit bullet liste

**Sayfa 3 — Fiyatlandırma:**
- Üst sağda "Tarih: {tarih}", "Hazırlayan: {hazirlayan}"
- Başlık: **"Fiyatlandırma"**
- Tablo kolonları (Trassir orijinal düzeni):

  | Marka | Açıklama | Ad./Mt. | Birim Fiyat | Toplam Fiyat |
  |---|---|---|---|---|

  - `Marka` = stok kalemi markası (yoksa `'—'`); `'KURULUM VE MONTAJ'` benzeri hizmet satırları için `'ZNA'`
  - `Ad./Mt.` = `{miktar} {birim}` birleşik metin (örn. `"5 Adet"`, `"100 Mt."`)
  - Para birimi sembolü teklif para birimi'nden alınır
- Sağda toplamlar bloğu: **Ara Tutar / KDV %20 / Genel Toplam**
- En altta **"Açıklama:"** (mevcut `aciklama` alanı)

**Sayfa 4 — İş Ortaklarımız:**
- Tek görsel: `public/teklif-assets/is-ortaklari.png` (Excel'in `image2.png`'inden türetilir — legrand/Multitek/Ruijie-Reycc/Samsung/Telesis/TRASSIR/ttec/Bosch/Dahua/Hikvision/HP/Huawei/Karel logoları)

**Sayfa 5 — Bazı Referanslarımız:**
- Tek görsel: `public/teklif-assets/referanslar.png` (Excel'in `image3.png`'inden türetilir — belediyeler/güvenlik/oteller/medya logoları)

**Print:** `@page { size: A4; margin: 0 }`, her bölüm `page-break-after: always`.

### Karel şablonu

A4 yatay (landscape), tek sayfa, kompakt mektup formatı.

**Üst banner:**
- Sol: ZNA Teknoloji logosu (`public/teklif-assets/zna-logo.png` — Excel `image.jpg`'sinden)
- Sağ: KAREL İŞ ORTAĞI logosu (`public/teklif-assets/karel-is-ortagi.png` — Excel `image.png`'inden)

**Üst başlık satırı (tek satır, koyu):**
```
UNVAN: ZNA TEKNOLOJİ BİLİŞİM HİZ. SAN. VE TİC. LTD. ŞTİ.   ADRES: İ.O.S.B MAH. KERESTECİLER SAN. SİT. 3B BLOK KAT:3 D:3 BAŞAKŞEHİR/İSTANBUL   TEL/FAX: 0(212) 549 94 94 - (0212) 671 74 54
```
Sabit, `src/lib/teklifTemplates.js` içinde.

**Bilgi grid'i (2 sütunlu):**
```
Sayın :     {firmaAdi}              Tarih:        {tarih}
Tel :       {telefon}                Evrak No:    {teklifNo}
Konu :      {konu}                   Hazırlayan:  {hazirlayan}
```
- `telefon`: TeklifDetay zaten `musterileriGetir()` ile müşteri listesini yüklüyor. Şablon Karel seçildiğinde, `firmaAdi` adı ile `musteriler` listesi içinde eşleşen kaydın `telefon` alanı kullanılır. Eşleşme yoksa boş kalır (bilgi satırı görünür ama değer boş).
- `EvrakNo` = teklifNo (örn. `TKL-2026-0001`)

**Başlık (ortalı, kalın):** `FİYAT TEKLİFİ`

**Tablo kolonları (Karel orijinal düzeni — Birim ayrı kolon):**

| Marka | Açıklama | Miktar | Birim | Birim Fiyat | Toplam Fiyat |
|---|---|---|---|---|---|

- Standart şablondan farklı olarak `iskonto` ve `kdv` kolonları **gösterilmez** (Karel orijinal şablonunda yok). KDV toplamlarda gösterilir.

**Toplamlar (sağ alt blok):**
- `Toplam :` (Ara toplam)
- `KDV (%20) :`
- `Genel Toplam :` (kalın)

**Not (sol alt küçük blok):** `Not: {aciklama}` — boşsa gizlenir.

**Print:** `@page { size: A4 landscape; margin: 10mm }`. Tek sayfa zorunlu — taşma olursa font-size küçültme yapılmaz; satış ekibi gerekirse satır sayısını azaltır.

## Excel (.xlsx) üretimi

Kütüphane: **`exceljs`** (`npm i exceljs`). Browser bundle'a uygun, görsel embed'i destekler.

Üç ayrı üretici fonksiyon: `src/lib/teklifExport/`
- `standartExcel.js` — mevcut PDF düzenini ufak bir Excel sheet'e dönüştürür (basit, opsiyonel — istenirse atlanabilir)
- `trassirExcel.js` — 3 sheet'li workbook (Anlatı / Fiyatlandırma / Görseller) ya da merge'lü tek sheet (Excel orijinaline daha yakın). Tercih: **tek sheet**, orijinal Excel'i taklit edecek şekilde — page break'ler ile çoklu sayfa.
- `karelExcel.js` — tek sheet landscape, header'da iki görsel, info grid, tablo, totals.

Her fonksiyon `(teklif) → Blob` döndürür; `TeklifYazdir`'daki "Excel İndir" butonu `file-saver` (`saveAs`) ile dosyaya yazar. Dosya adı: `Teklif_{teklifNo}_{teklifTipi}.xlsx`.

Görseller `public/teklif-assets/`'ten `fetch` ile çekilir, `workbook.addImage({ buffer, extension: 'png' })` ile embed edilir.

## Sabit metinler — `src/lib/teklifTemplates.js`

```js
export const ZNA_FIRMA = {
  unvan: 'ZNA TEKNOLOJİ BİLİŞİM HİZ. SAN. VE TİC. LTD. ŞTİ.',
  adres: 'İ.O.S.B MAH. KERESTECİLER SAN. SİT. 3B BLOK KAT:3 D:3 BAŞAKŞEHİR/İSTANBUL',
  telFax: '0(212) 549 94 94 - (0212) 671 74 54',
}

export const TRASSIR_KARSILAMA = `Bu doküman, talep ettiğiniz hizmete ait proje detaylarını kapsamaktadır. Projenin kapsamı, hizmet detayı ve proje bedeli hakkında da bilgi içermektedir. Başarılı çalışmalarınıza fark katacak desteği sağlayacağımıza inanıyor ve sizlere hizmet etmekten mutluluk duyacağımızı paylaşmak istiyoruz. Her türlü soru, sorun ve talebiniz için bizim ile iletişime geçmenizi rica ederiz.`

export const ZNA_HAKKINDA = `ZNA Teknoloji, Türkiye'de Elektronik Güvenlik, İletişim Teknolojileri ve Data Transfer sistemleri uygulamalarını gerçekleştirmek, geliştirmek ve yaygınlaştırmak amacıyla kurulmuştur. Fiber iletişim sistemlerinde anahtar teslimi çözümler üzerine de faaliyet gösteren ZNA Teknoloji, kullanım öncesi ve sonrası iletişim ve güvenlik sistemleri konularında projeler gerçekleştirmektedir. Güvenlik ve İletişim sistemlerinin kavram aşamasından başlayan hizmetler, tasarım, proje, inşa, ekipman imal, işletme becerisi transferi, periyodik bakım ve danışmanlık olarak sistemin tüm yaşamını kapsamaktadır.`

export const HIZMETLERIMIZ = [
  'Network tasarımı ve uygulamaları',
  'Sistem tasarımı ve uygulamaları',
  'Altyapı tasarımı ve uygulamaları',
  'Telekomünikasyon çözümleri',
  'Güvenlik Kamerası çözümleri',
  'Zayıf Akım sistemleri',
  'Güvenlik Kameralarında Yapay Zeka Destek Çözümleri',
  'Ürün tedariği',
  'Çözüm tasarımı',
  'Danışmanlık',
  'Değerlendirme',
]
```

## Görsel varlıklar (`public/teklif-assets/`)

| Dosya | Kaynak | Kullanan şablon |
|---|---|---|
| `zna-cover.png` | `Trassir.xlsx` `xl/media/image.png` | Trassir kapak |
| `is-ortaklari.png` | `Trassir.xlsx` `xl/media/image2.png` | Trassir partner sayfası |
| `referanslar.png` | `Trassir.xlsx` `xl/media/image3.png` | Trassir referans sayfası |
| `zna-logo.png` | `karel.xlsx` `xl/media/image.jpg` | Karel sol header |
| `karel-is-ortagi.png` | `karel.xlsx` `xl/media/image.png` | Karel sağ header |

Implementation sırasında bu 5 dosya Excel'lerden çıkarılıp `public/teklif-assets/`'e konur. (Mevcut `public/trassirlogo.png`, `logotrassir.png`, `trassirlogo2.jpg` farklı amaçlı — dokunulmaz.)

## Test senaryoları

1. **Yeni teklif → Trassir seç → kaydet → yazdır** → 5 sayfalık A4 dikey çıktı, kapak + anlatı + fiyat + iş ortakları + referanslar görünür.
2. **Yeni teklif → Karel seç → kaydet → yazdır** → tek sayfa A4 yatay, iki logo header, info grid, tablo, totals.
3. **Excel İndir** her tip için doğru dosyayı üretir, açıldığında orijinal şablonla görsel olarak benzer.
4. **Eski (migration öncesi) teklif** → `teklif_tipi = 'standart'` → mevcut çıktı bozulmaz.
5. **Tip değiştir & tekrar yazdır** — eski teklif'in tipi `Trassir`'a çevrilebilir, çıktı yenilenir.
6. **Para birimi USD** seçilen Trassir teklifinde `$` sembolü tabloda doğru basılır.

## Kapsam dışı (YAGNI)

- Şablon metinlerini admin panelinden düzenleme — sabit metin yeterli, ileride istenirse ayrı feature.
- Yeni şablon ekleme (örn. Bosch, Hikvision) — gerekirse aynı pattern'le sonra eklenir.
- E-posta ile gönderme — ayrı feature.
- Dijital imza / onay akışı — kapsam dışı.
- Teklifler liste sayfasında tipe göre filtre — kullanıcı isterse sonra.
- iskonto/KDV kolonlarının Karel şablonunda gösterimi — orijinalde yok, eklenmez.

## Riskler

- **`exceljs` bundle boyutu** ~1MB — sadece TeklifYazdir sayfasında lazy-load edilir (`React.lazy` veya dynamic `import()`).
- **Logo görselleri telif** — Excel'de zaten kullanıldığı için ZNA'nın iş ortağı sıfatıyla kullanım hakkı var (kabul varsayımı).
- **Print sayfa boyutu farklılıkları** — Karel landscape vs Trassir portrait. Her component kendi `@page` rule'unu inline `<style>` içinde yazar; chromium/edge `print()` çağrısı bunları sayar.

## Açık Sorular

Yok — onaylanan kararlar:
- Şablon seçimi: TeklifDetay'da segmented control (kayıtla DB'ye yazılır)
- Sabit metin yaklaşımı: `src/lib/teklifTemplates.js` (kodun içinde, editable değil)
- Hem PDF hem Excel: ikisi de destekli
