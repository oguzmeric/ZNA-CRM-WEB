# Görüşme Lokasyon Seçici — Design

**Tarih:** 2026-05-04
**Bağlam:** Yeni görüşme oluştururken müşteri seçildikten sonra o müşterinin lokasyonlarını seçebilme. Aynı zamanda Başakşehir Belediyesi'nin 60 lokasyonunu seed olarak yükleme.

## Hedef

Görüşme formuna opsiyonel **Lokasyon** dropdown'ı ekle. Müşterinin tanımlı lokasyonu varsa gösterilir; yoksa alan saklı kalır. Görüşme listesi/detayında lokasyon görünür hale getirilir.

## Mevcut Altyapı (kullanılacak)

- `musteri_lokasyonlari` tablosu zaten var
- `src/services/musteriLokasyonService.js` — `musteriLokasyonlariniGetir(musteriId)`, `musteriLokasyonEkle()` hazır
- `MusteriDetay.jsx`'te lokasyon CRUD işliyor

## DB Migration

`supabase_migrations/026_gorusmeler_lokasyon.sql`:

```sql
alter table gorusmeler
  add column if not exists lokasyon_id bigint
  references musteri_lokasyonlari(id) on delete set null;

create index if not exists idx_gorusmeler_lokasyon on gorusmeler(lokasyon_id);

notify pgrst, 'reload schema';
```

Nullable. Eski tüm görüşmeler `lokasyon_id = null` ile geçerli kalır.

## UI değişiklikleri

### Gorusmeler.jsx — yeni görüşme modal'ı

Müşteri seçimi (firmaAdi → muhatap) sonrası, eğer seçili müşterinin lokasyonu varsa yeni bir alan görünür:

```
[Lokasyon ▼]
  — Belirtilmedi
  AYAZMA SPOR PARKI
  İNOVASYON VE TEKNOLOJİ MERKEZİ
  ...
```

State:
- `form.lokasyonId` (eklenir, default `''`)
- `lokasyonlar` (yerel state) — müşteri seçildiğinde `musteriLokasyonlariniGetir(musteriId)` ile doldurulur

Davranış:
- Müşteri değiştiğinde `lokasyonId` resetlenir, `lokasyonlar` yeniden çekilir
- Müşterinin hiç lokasyonu yoksa dropdown render edilmez (saklı)
- Modal açılışında düzenleme modunda mevcut `lokasyonId` set edilir

### Liste satırında

`Gorusmeler.jsx`'te liste rendering'inde firma adının yanında:
```
🏢 Başakşehir Belediyesi · Tepecik Kütüphanesi
                          ^^^ küçük gri lokasyon ismi (varsa)
```

`musteriLokasyonlariniGetir` her satır için çağrılırsa N+1 olur — `useEffect`'te bir kerede tüm lokasyonları çekip Map'e koyalım, satırlarda lookup ederiz.

### Detayda

Açılan modal'da lokasyon dropdown'ı zaten var. Liste sayfasında ekstra detay yok.

## Başakşehir Belediyesi seed

Yeni script: `scripts/seed-basaksehir-lokasyonlari.mjs`

Akış:
1. `musteriler` tablosunda `firma ILIKE '%başakşehir%belediye%'` ya da `firma ILIKE '%başakşehir bel%'` ile kayıt arar
2. Bulunamazsa konsola: "BAŞAKŞEHİR BELEDİYESİ müşteri kaydı bulunamadı, önce manuel ekleyin" yazıp çıkar
3. Bulunursa `musteri_id` üzerinden 60 lokasyonu `musteri_lokasyonlari`'na bulk insert
4. Mevcut lokasyon (aynı `musteri_id` + `ad`) varsa atlar (idempotent)

Çalıştırma:
```bash
PGPASSWORD=... node scripts/seed-basaksehir-lokasyonlari.mjs
```

veya Supabase Dashboard → SQL Editor (SQL inline).

**60 lokasyon listesi** (kullanıcı tarafından sağlanan Excel'den):

```js
const LOKASYONLAR = [
  'AYAZMA SPOR PARKI',
  'İNOVASYON VE TEKNOLOJİ MERKEZİ',
  'NECİP FAZIL KISAKÜREK KÜLTÜR VE YAŞAM PARKI',
  'NİKAH SARAYI',
  'FENERTEPE KÜLTÜR YAŞAM MERKEZİ',
  'Z KUŞAĞI',
  'KAYAŞEHİR KÜLTÜR VE YAŞAM MERKEZİ',
  'ALTINŞEHİR MİLLET BAHÇESİ',
  'ALTINŞEHİR SPOR PARKI',
  'ALTINŞEHİR KÜLTÜR VE YAŞAM MERKEZİ',
  'GÜVERCİNTEPE KÜLTÜR VE YAŞAM MERKEZİ',
  'SEZAİ KARAKOÇ GENÇLİK MERKEZİ',
  'GÜVERCİNTEPE SPOR PARKI HAVUZ',
  'HAYVAN HASTANESİ',
  'ŞAMLAR İZCİ KAMPI',
  'CEVDET KILIÇLAR KÜLTÜR VE YAŞAM MERKEZİ',
  'ŞEHİT SAVCI SELİM KİRAZ KÜLTÜR VE YAŞAM MERKEZİ',
  'ÇAM SAKURA MİLLET BAHÇESİ',
  'BAŞAKŞEHİR KADEME',
  'BAHÇEŞEHİR SPOR MERKEZİ',
  'ÖZDEMİR BAYRAKTAR KÜLTÜR VE YAŞAM MERKEZİ',
  'TEOMAN DURALI BAHÇEKENT MİLLET KÜTÜPHANESİ',
  'BAHÇEŞEHİR EBUSSUUD EFENDİ KÜTÜPHANESİ',
  'MUHSİN ERTUĞRUL KÜLTÜR MERKEZİ',
  'BAHÇEŞEHİR GELİŞİM BİNASI',
  'BAHÇEŞEHİR EK HİZMET BİNASI',
  'BAHÇEŞEHİR KÜLTÜR SANAT MERKEZİ',
  'BAHÇEŞEHİR KÜLTÜR VE YAŞAM MERKEZİ',
  'KAYAŞEHİR SPOR PARKI',
  'ŞAMLAR 5. KAPI',
  'GÜVERCİNTEPE SPOR PARKI',
  'EMİN SARAÇ KÜLTÜR MERKEZİ',
  'BAHÇEŞEHİR ÇEVRE KORUMA',
  'BAŞAKŞEHİR SPOR PARKI',
  'BAHÇEŞEHİR TENİS PARKI',
  'BAHÇEŞEHİR KADEME',
  'AKİF İNAN KÜLTÜR YAŞAM MERKEZİ',
  'CEMİL MERİÇ KÜLTÜR YAŞAM MERKEZİ',
  'ŞEHİT ERDEM ÖZÇELİK STADI',
  'ANNE ÇOCUK MERKEZİ',
  'AT ÇİFTLİĞİ',
  'BAŞAKŞEHİR MİLLET BAHÇESİ',
  'ENGELSİZ YAŞAM MERKEZİ',
  'BAHÇEŞEHİR BİZİM ÇINARLAR',
  'ÇAM SAKURA BİZİM ÇINARLAR',
  'ŞAHİNTEPE SPOR PARKI',
  'ŞAHİNTEPE KÜLTÜR VE YAŞAM MERKEZİ',
  'KAYAPARK BİZİM ÇINARLAR',
  'BAŞAKŞEHİR MİLLET BAHÇESİ SPOR PARKI',
  'BAHÇEKENT SPOR PARKI',
  'SULARVADİSİ',
  'SULARVADİSİ BİZİM ÇINARLAR',
  'BAŞAKŞEHİR ÇEVRE KORUMA',
  'GÜVERCİNTEPE GERİ DÖNÜŞÜM',
  'KORUPARK SPORPARK',
  'BAHÇEŞEHİR GÖLET DOĞA PARKI',
  'HACI BEKTAŞI VELİ KÜTÜPHANESİ',
  'SOSYAL YARDIM MAĞAZA',
  'BAŞAKŞEHİR TAZİYE EVİ',
  'BAHÇEŞEHİR SPOR PARKI HALISAHA',
]
```

NOT: Listede 2 adet "BAŞAKŞEHİR KADEME" var (kasıtlı olabilir farklı bina/kademe). Idempotent kontrol `(musteri_id, ad)` üzerinden — aynı isim 2. kez insert edilmez. Bu kullanıcı istemiyorsa sonra düzenler.

## Test senaryoları

1. **Yeni görüşme + lokasyonsuz müşteri** → Lokasyon dropdown'u görünmez, görüşme normal kaydedilir
2. **Yeni görüşme + Başakşehir** → Dropdown'da 60 lokasyon listelenir, biri seçilip kaydedilir
3. **Eski görüşme açılır** → `lokasyon_id` doluysa dropdown'da seçili gelir
4. **Müşteri değiştirilir** → Önceki lokasyon resetlenir, yeni müşterinin lokasyonları gelir
5. **Liste sayfasında** → Lokasyonlu görüşmeler firmaAdı yanında lokasyon ismi gösterir
6. **Seed script** → 60 lokasyon Başakşehir müşterisine eklenir, 2. kez çalıştırılırsa hiçbir yeni kayıt eklenmez

## Kapsam dışı

- Lokasyon zorunluluğu (validation) — opsiyonel kalır
- Lokasyon arama (60 kayıt için scroll yeter)
- Lokasyon görüşme listesinde filtreleme
- Lokasyon-bazlı raporlama

## Riskler

- N+1 sorgu: Liste sayfasında her satırın lokasyonu için tek tek query gönderilirse yavaşlar. Çözüm: tüm lokasyonları bir kerede çekip Map'le lookup.
- Müşteri silinirse lokasyonlar cascade silinir mi? `musteri_lokasyonlari` zaten `on delete cascade` ile bağlı (mevcut migration), `gorusmeler.lokasyon_id` `on delete set null` — uyumlu.
