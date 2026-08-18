# İK Personel Sicil Ekranı — Tasarım Belgesi

**Tarih:** 18.08.2026
**Karar veren:** Oğuz Meriç
**Durum:** Onaylandı, uygulamaya geçildi

---

## 1. Amaç

Bir personele ait **tüm** İK bilgisini tek ekranda toplamak: özlük bilgileri, istihdam
kaydı, maaş geçmişi, çalışma saatleri, izin talepleri, avans talepleri, zimmetli
demirbaşlar ve belgeler.

Bugün bu bilgiler beş ayrı yere dağılmış durumda (İK Yönetimi sekmeleri, Çalışma
Saatleri sayfası, Kişisel Dökümanlar, Demirbaş Zimmet) ve hiçbiri kişi ekseninde
değil — hepsi liste ekseninde. "Bu personelin durumu nedir?" sorusunun tek bir cevabı
yok. Sicil kartı bu boşluğu kapatır.

**Pusula:** Kurumsal bir şirket ERP'si kullanıyor hissi. Her karar bu ölçüte tabidir.

## 2. Kapsam

### Kapsam içi
- Yeni `personel_sicil` tablosu (özlük verileri)
- İK Yönetimi sayfasına **Personel Sicil** sekmesi (personel listesi)
- Kişi bazlı sicil kartı: `/ik-yonetim/sicil/:id` — 8 sekmeli
- Yıllık izin hakediş hesabı (İş Kanunu md. 53)
- Özlük bilgisi düzenleme formu

### Kapsam dışı (bilinçli kararlar)
- **Menüye yeni öğe eklenmez.** Giriş noktası yalnızca İK Yönetimi sekmesidir.
- **Personel kendi sicilini göremez.** Kendi izin/bordro/avans bilgisi için mevcut
  `/izin-bordro` sayfası zaten var. Sicil kartı yönetim aracıdır.
- **Görüntüleme logu tutulmaz.** Yalnızca değişiklik izlenir (`guncelleyen_id`,
  `guncelleme_tarih`). Kim baktı logu ileride ayrı iş olarak eklenebilir.
- **Mobil tarafa taşınmaz.** Sicil masabaşı işidir.
- `mesai_kayitlari` RLS politikasına dokunulmaz (18.08 kullanıcı kararı).

## 3. Yetki modeli

| Ne | Kim | Nasıl |
|---|---|---|
| Sicil sekmesi + kartı | Ali Uğur Aktepe (1), Oğuz Meriç (2), Abdullah İğde (44) | `ik_yonetim` modülü |
| Özlük verisi okuma/yazma | Aynı üç kişi | `personel_sicil` RLS → `ik_yetkili()` |
| Maaş verisi | Aynı üç kişi | `personel_maaslari` RLS → `ik_puantaj_yetkili()` (mig 309) |

**Tek kapı ilkesi:** Sicil kartına giren üç kişi, karttaki yedi tablonun hepsini görme
yetkisine zaten sahiptir. Bu yüzden kart içinde ikinci bir yetki ayrımı **yoktur** —
"sekmeye tıkladım ama yetkim yok" durumu yapısal olarak imkânsızdır.

**Mig 309 bağlamı:** Bu iş sırasında `ik_puantaj_yetkili()` fonksiyonunun `rol='admin'`
bypass'ı yüzünden Ahmet Agun (29) ve Ferdi Kalkan (33) için de açık olduğu tespit edildi
ve kapatıldı. Kapı artık `ik_yonetim` modülüne bağlı; web tarafındaki `ikGorebilirMi()`
ile birebir aynı küme.

> ⚠️ **Bundan sonra:** birine `ik_yonetim` modülü vermek, maaş erişimi de vermek
> demektir. Maaşı İK'dan ayırmak gerekirse ayrı bir bayrak (`maas_yetkilisi`) açılmalı.

## 4. Veri modeli — `personel_sicil` (migration 310)

Özlük verisi `kullanicilar` tablosuna **eklenmez**. Gerekçe: o tabloyu
`kullanicilar_personel_select_personel` politikası gereği tüm personel okuyabiliyor ve
Postgres RLS'inde kolon bazlı koruma yok. TC kimlik veya IBAN oraya konsa şirketteki
herkes görürdü.

Birincil anahtar doğrudan `kullanici_id` — bir personelin bir sicil kaydı olur.

```sql
create table public.personel_sicil (
  kullanici_id bigint primary key
    references public.kullanicilar(id) on delete cascade,

  -- Kimlik
  tc_kimlik        text,
  dogum_tarihi     date,
  dogum_yeri       text,
  cinsiyet         text check (cinsiyet in ('kadin','erkek') or cinsiyet is null),
  medeni_durum     text check (medeni_durum in ('bekar','evli','bosanmis','dul') or medeni_durum is null),
  uyruk            text default 'T.C.',
  kan_grubu        text,
  baba_adi         text,
  ana_adi          text,

  -- İletişim
  adres            text,
  il               text,
  ilce             text,
  ev_telefon       text,
  acil_kisi_ad        text,
  acil_kisi_yakinlik  text,
  acil_kisi_telefon   text,

  -- İstihdam
  ise_giris_tarihi   date,
  isten_cikis_tarihi date,
  cikis_nedeni       text,
  departman          text,
  calisma_sekli      text check (calisma_sekli in ('tam_zamanli','yari_zamanli','sozlesmeli') or calisma_sekli is null),
  sozlesme_turu      text check (sozlesme_turu in ('belirsiz_sureli','belirli_sureli') or sozlesme_turu is null),
  calisma_yeri       text,
  yonetici_id        bigint references public.kullanicilar(id),

  -- SGK & resmi
  sgk_sicil_no       text,
  sigorta_baslangic  date,
  meslek_kodu        text,
  engellilik_orani   integer check (engellilik_orani between 0 and 100),
  askerlik_durumu    text check (askerlik_durumu in ('yapti','muaf','tecilli','yapmadi','ilgisiz') or askerlik_durumu is null),

  -- Eğitim
  ogrenim_durumu   text,
  mezun_okul       text,
  bolum            text,
  mezuniyet_yili   integer check (mezuniyet_yili between 1950 and 2100),

  -- Aile (AGİ hesabı için)
  es_calisiyor     boolean,
  cocuk_sayisi     integer default 0 check (cocuk_sayisi >= 0),

  -- Banka
  iban             text,
  banka_adi        text,

  -- Serbest not
  notlar           text,

  -- Meta
  guncelleyen_id     bigint references public.kullanicilar(id),
  guncelleme_tarih   timestamptz not null default now(),
  olusturma_tarih    timestamptz not null default now()
);
```

**Tekrarlanmayan alanlar:** `ad`, `unvan`, `email`, `cep_telefon`, `foto_url`,
`ehliyet_sinifi`, `ehliyet_bitis`, `imza` zaten `kullanicilar` tablosunda. Sicil kartı
bunları oradan okur, kopyalamaz — iki kaynak olursa senkron sorunu doğar.

**RLS:**
```sql
alter table public.personel_sicil enable row level security;
create policy personel_sicil_ik on public.personel_sicil
  for all
  using ((select public.ik_yetkili()))
  with check ((select public.ik_yetkili()));
grant select, insert, update, delete on public.personel_sicil to authenticated;
```

`(select ...)` sarmalı zorunlu — RLS initplan performans dersi (mig 227-228).

## 5. Ekran yapısı

### 5.1 Giriş noktası

`IKYonetim.jsx` içindeki `SEKMELER` dizisine altıncı öğe eklenir:

```
İzin Talepleri | Avanslar | Puantaj | Bordro Yükle | Bordrolar | Personel Sicil
```

**Personel Sicil sekmesi** = personel listesi tablosu. Kolonlar: foto+ad, ünvan,
departman, işe giriş, kıdem, durum rozeti. Üstte arama kutusu ve
"Aktif / Ayrılmış / Tümü" filtresi. Satıra tıklama → sicil kartı.

Sicil kaydı henüz açılmamış personelin satırında "Sicil bilgisi girilmemiş" uyarı
rozeti görünür — bu, İK'ya eksik veriyi gösteren kurumsal bir davranıştır.

### 5.2 Sicil kartı — `/ik-yonetim/sicil/:id`

Menüde görünmeyen rota; yalnızca sekmeden girilir. Sayfa başında "← İK Yönetimi"
dönüş bağlantısı.

**Künye şeridi** (sekmelerden bağımsız, hep görünür):
avatar · ad · ünvan · departman · işe giriş tarihi · **kıdem** · durum rozeti.

**Sekmeler:**

| # | Sekme | İçerik | Kaynak |
|---|---|---|---|
| 0 | Genel Bakış | Özet kartlar: kıdem, kalan yıllık izin, açık avans borcu, bu ay çalışma saati, zimmet adedi. Altında son 10 hareket (izin/avans/zimmet karışık, tarihe göre). | Diğer sekmelerin özeti |
| 1 | Özlük | Kimlik, iletişim, eğitim, aile, banka bilgileri + **Düzenle** formu | `personel_sicil` |
| 2 | İstihdam | İşe giriş/çıkış, departman, sözleşme, çalışma şekli, SGK bilgileri, bağlı yönetici + **Düzenle** formu | `personel_sicil` |
| 3 | Maaş & Bordro | Maaş geçmişi tablosu (dönem, brüt/net, BES durumu, ekleyen) + bordro PDF listesi (indirme signed URL ile) | `personel_maaslari`, `bordrolar` |
| 4 | Çalışma Saatleri | Son 12 ayın aylık özeti (normal / hafta içi fazla / hafta sonu fazla) + seçilen ayın gün gün dökümü | `mesai_kayitlari`, `mesai_duzeltmeleri` |
| 5 | İzinler | **Hakediş kartı** (hak edilen / kullanılan / kalan) + izin talepleri tablosu | `izin_talepleri` + hakediş hesabı |
| 6 | Avanslar | Avans talepleri + taksit planı + kalan borç | `avans_talepleri`, `avans_taksitleri` |

### 5.3 Kaldırılan sekme: Zimmet & Belgeler

Tasarımda sekizinci sekme olarak planlanmıştı, **uygulamadan önce yapılan RLS ölçümü
sonucu kaldırıldı** (18.08 kullanıcı kararı: "zimmeti kaldır o zaman").

Abdullah İğde (44) kimliğiyle canlı ölçüm:

| Tablo | Abdullah görüyor | Gerçek satır |
|---|---|---|
| `demirbas_zimmet` | **0** | 162 |
| `kisi_dokumanlari` | **7** | 27 |

Sebep: `demirbas_zimmet` RLS'i `demirbas_yetkili()` istiyor (admin **veya**
`demirbas_yetkilisi` bayrağı) — Abdullah ikisine de sahip değil.
`kisi_dokumanlari` ise tasarımı gereği kişinin özel alanı: yalnızca sahibi, `herkes`
görünürlüklü kayıtlar ve `secili` listesindekiler okunabiliyor.

Bu sekme konsa Abdullah'ta boş liste görünecekti — kullanıcının açıkça istemediği durum.

**İleride açmak gerekirse:** Abdullah'a `kullanicilar.demirbas_yetkilisi = true`
verilmesi yeterli; zimmet tarafı o anda tam görünür olur. Kişisel belgeler ise bilinçli
bir gizlilik kararıdır, açılması ayrı bir karar gerektirir.

## 6. Hakediş hesabı — `src/lib/izinHakedis.js`

Saf fonksiyon, birim testli, **tek kaynak**. Ekranda ayrıca hesap yapılmaz.

**Kural (4857 sayılı İş Kanunu md. 53):**

| Kıdem | Yıllık hak |
|---|---|
| 1 yıldan az | 0 gün (hak doğmaz) |
| 1 yıl – 5 yıl (5 dahil) | 14 gün |
| 5 yıldan fazla – 15 yıldan az | 20 gün |
| 15 yıl ve üzeri | 26 gün |

**Yaş istisnası:** 18 yaşından küçük veya 50 yaşından büyük çalışanın yıllık izni
20 günden az olamaz. `dogum_tarihi` doluysa uygulanır.

**Toplam hak:** İşe giriş tarihinden bugüne kadar tamamlanan **her hizmet yılı** için,
o yılın sonundaki kıdeme karşılık gelen gün sayısı toplanır. Böylece devreden izinler
kendiliğinden hesaba girer.

**Kullanılan:** `izin_talepleri` içinde `tur='yillik'` ve `durum='onaylandi'` olan
kayıtların `gun_sayisi` toplamı. Diğer izin türleri (mazeret, rapor, ücretsiz) yıllık
hakedişten düşülmez.

**Kalan = toplam hak − kullanılan.** Negatif çıkabilir (fazla kullanım); ekranda kırmızı
gösterilir, sıfıra kırpılmaz — çünkü fazla kullanım İK'nın görmesi gereken bir bilgidir.

**İşe giriş tarihi boşsa:** hesap yapılmaz, "İşe giriş tarihi girilmemiş" uyarısı ve
İstihdam sekmesine yönlendiren bağlantı gösterilir. Sessizce 0 gösterilmez.

> **Neden `created_at` kullanılamaz:** Sistemdeki en eski hesap 16.04.2026. Teknisyenlerin
> çoğu Temmuz 2026'da açılmış. Bunlar CRM'e eklenme tarihleridir, şirketteki kıdem değil.
> `created_at` üzerinden hesap yapılsa herkes "1 yılını doldurmamış" çıkar ve tüm yıllık
> izin hakları 0 görünürdü.

## 7. Hata ve boş durum politikası

Kullanıcının açık talebi: *"sekmelere tıklandığında database hatası rls hatası
istemiyorum."*

1. **Servis fonksiyonları hatayı yutmaz.** `catch` ile `[]` dönmek yasak — `throw`
   edilir. (Arızalı Ürünler'de kaydı yutan hata tam olarak buydu: embed'de yanlış kolon
   adı → PostgREST 400 → servis boş dizi → "kaydetti ama listelemiyor".)
2. **Her sekme kendi hata durumunu gösterir:** "Bu bölüm yüklenemedi" + hata metni +
   **Tekrar Dene** düğmesi. Bir sekmenin hatası diğerlerini etkilemez.
3. **Boş veri ≠ hata.** Veri yoksa `EmptyState` ile açıklayıcı mesaj gösterilir
   ("Henüz izin talebi yok"), hata kutusu değil.
4. **Tembel yükleme:** Sekme ilk kez açıldığında veri çekilir, sonra önbellekte kalır.
   Sayfa açılışında sekiz sorgu birden gitmez.
5. **Sayfa kapısı:** `ik_yonetim` modülü olmayan kullanıcı rotaya hiç giremez (IKGuard).

## 8. Test planı

Kullanıcının kalıcı talimatı: *"yaptığın yenilikleri test etmeden yayına alma."*

### 8.1 Birim testleri
`src/lib/izinHakedis.test.js` — en az şu vakalar:
- 1 yılını doldurmamış → 0 gün
- Tam 1 yıl → 14 gün
- 3 yıl kıdem, hiç izin kullanmamış → 42 gün (14×3)
- 5 yıl → 14×5 = 70 gün; 6. yıl 20 güne geçer
- 15 yıl sınırı → 26 güne geçiş
- 50 yaş üstü, 2 yıl kıdem → yılda 20 gün (yaş istisnası)
- İşe giriş tarihi null → hesap yapılmaz, işaret döner
- Fazla kullanım → negatif kalan döner (sıfıra kırpılmaz)

### 8.2 Canlı doğrulama (yayından önce, zorunlu)
Her sekmenin sorgusu canlı veritabanında **authenticated rol taklidiyle** çalıştırılır:

```sql
begin;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"<auth_id>"}', true);
set local role authenticated;
-- sekmenin gerçek sorgusu
```

Test kimlikleri:
| Kimlik | auth_id | Beklenen |
|---|---|---|
| Abdullah İğde (44) | `f8009b9f-a3a4-47b4-ae68-65b4d16d91dd` | Tüm sekmeler veri döner |
| Ali Uğur Aktepe (1) | `af626c70-7cb7-4cb2-8ddd-e48cbb7d9225` | Tüm sekmeler veri döner |
| Salih Çakmaklı (34) | `28c438ae-8f54-4721-abd0-57b9469a7b61` | `personel_sicil` 0 satır, yazma reddedilir |

Yazma testi rollback'li yapılır — canlıda kalıcı test satırı bırakılmaz.

### 8.3 Tarayıcı doğrulaması
Yayın sonrası sekiz sekme tek tek açılır, konsol hatası ve ağ 4xx/5xx kontrol edilir.

## 9. Dosya yapısı

| Dosya | Sorumluluk |
|---|---|
| `supabase_migrations/310_personel_sicil.sql` | Tablo + RLS + grant |
| `src/services/personelSicilService.js` | Sicil CRUD + kişi bazlı özet sorguları |
| `src/lib/izinHakedis.js` | Hakediş hesabı (saf fonksiyon) |
| `src/lib/izinHakedis.test.js` | Birim testleri |
| `src/pages/PersonelSicil.jsx` | Sicil kartı (8 sekme) |
| `src/components/sicil/` | Sekme bileşenleri — her sekme ayrı dosya |
| `src/pages/IKYonetim.jsx` | Personel Sicil sekmesi eklenir (mevcut dosya) |
| `src/App.jsx` | `/ik-yonetim/sicil/:id` rotası (mevcut dosya) |

Sekmeler ayrı dosyalara bölünür. `PersonelSicil.jsx` tek başına 2000 satır olursa ne
okunabilir ne de güvenle düzenlenebilir olur; İK Yönetimi'nin bugün 700+ satırda
yaşadığı sıkışıklık tekrarlanmamalı.

## 10. Görsel standartlar

Kullanıcı talebi: *"sayfanın UI tarafını düzgün yap. Defalarca uğraşmayalım — sayfa
otursun, görseller menüler yerleşik olsun."*

**Referans sayfa: `MusteriDetay.jsx`.** 18.08'de kurumsal görünüm için yeniden
tasarlandı ve onaylandı. Sicil kartı yeni bir görsel dil icat etmez, o sayfanın
kalıbını uygular:

- Sayfa iskeleti: `maxWidth` sınırlı + `margin: '0 auto'` ile ortalanmış gövde
- Künye: avatar + ad + ünvan tek bir Card içinde, özet şeridi aynı kartın içinde
  (`borderTop` ile ayrılmış) — ayrık kutular değil
- Bölüm başlıkları: `BolumBaslik` bileşeni — ikon kutusu + başlık + sayı + sağ aksiyon.
  `h2` ve `CardTitle` karışımı yasak (bu karışım "amatör görünüyor" geri bildiriminin
  sebebiydi)
- Listeler **tablo** olarak gösterilir, kart yığını olarak değil

**Bilinen tuzaklar — uygulama sırasında kontrol edilecek:**

| Tuzak | Kural |
|---|---|
| `CustomSelect` filtre satırında tüm satırı kaplıyor | `className="w-auto"` zorunlu |
| KPI kartları çok büyük duruyor | Kompakt desen: `padding: '7px 14px'`, ikon 26px, tek satır |
| Sayaç şeridi ekrana yayılıyor | `grid auto-fit` değil `flex` |
| Liste sayfanın çok aşağısından başlıyor | Başlık + filtre bloğu yüksekliği denetlenir, `gap` 12 |
| Uzun listeler | Sınır + katlama + arama varsayılan |
| Çoklu seçim | Chip yığını değil, `CokluSelect` dropdown |
| Tarih + saat girişi | `datetime-local` değil, `TarihSaatSecici` |
| Liste sayfa numarası kayboluyor | `useUrlSayfa` (`?sayfa=N`) |
| Tutar/sayı biçimi | Chrome otomatik çeviri tutarları bozar → `lang="tr"` + `notranslate` |

**Onay akışı:** Sayfa tamamlanınca tarayıcıda açılır, her sekmenin ekran görüntüsü
alınır ve kullanıcıya iletilir. **Canlıya ancak kullanıcı görseli onayladıktan sonra
çıkılır.** Bu, "defalarca uğraşmayalım" talebinin karşılığıdır: düzeltme turu varsa
yayından önce yapılır.

## 11. Açık riskler

| Risk | Karşılık |
|---|---|
| Özlük verisi KVKK kapsamında hassas (TC, IBAN, SGK) | Ayrı tablo + tek RLS politikası + üç kişilik erişim. Görüntüleme logu ileride eklenebilir. |
| `ik_yonetim` modülü verilen yeni kişi maaşı da görür | Belgede ve migration yorumunda açıkça uyarıldı. Ayrışma gerekirse `maas_yetkilisi` bayrağı. |
| İşe giriş tarihleri elle girilecek — 23 personel | Sicil listesinde "girilmemiş" rozeti ile eksikler görünür kılınır. |
| `mesai_kayitlari` politikasındaki isim regex'i | Bu işte dokunulmuyor (kullanıcı kararı). Ayrı iş olarak kayıtlı. |
