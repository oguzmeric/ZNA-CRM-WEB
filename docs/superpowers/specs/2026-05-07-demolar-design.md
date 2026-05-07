# Demolar Modülü — Tasarım Dokümanı

**Tarih:** 2026-05-07
**Kapsam:** Web (`crm-app`) + Mobile (`crm-mobile`) için fiziksel demo cihaz takibi
**Bağlam:** ZNA satış ekibi müşterilere demo amaçlı CCTV/NVR/santral cihazları ödünç veriyor; bazı cihazlar takipsizlikten geri alınamadan unutuluyor. "Hangi müşteride ne cihaz var, kaç gündür duruyor" sorusunun otomatik cevabı + iade tarihi yaklaşan/geçen cihazlar için bildirim altyapısı.

---

## 1. Veri Modeli

İki yeni tablo: `demo_cihazlari` (havuz) ve `demo_zimmet_kayitlari` (her ödünç verme/alma olayı). Cihaz durumu **denormalize edilmez**, aktif zimmet kaydından hesaplanır → drift yok.

### 1.1 `demo_cihazlari`

```sql
create table demo_cihazlari (
  id           bigserial primary key,
  ad           text not null,                       -- "Trassir NVR-04"
  marka        text,                                -- "Trassir"
  model        text,
  seri_no      text,                                -- opsiyonel manuel S/N
  kategori     text,                                -- "NVR", "IP Kamera", "Santral", "Switch", ...
  foto_url     text,                                -- supabase storage public URL
  bakimda      boolean default false,               -- admin elle işaret koyar
  notlar       text,
  olusturma_tarih timestamptz default now()
);

create index demo_cihazlari_ad_idx on demo_cihazlari (ad);
create index demo_cihazlari_seri_no_idx on demo_cihazlari (seri_no);
```

### 1.2 `demo_zimmet_kayitlari`

```sql
create table demo_zimmet_kayitlari (
  id                              bigserial primary key,
  cihaz_id                        bigint references demo_cihazlari(id) on delete cascade not null,
  musteri_id                      bigint references musteriler(id) not null,
  lokasyon_id                     bigint references musteri_lokasyonlari(id),
  veren_kullanici_id              text,
  veren_kullanici_ad              text,
  veris_tarihi                    date not null default current_date,
  beklenen_iade_tarihi            date not null,
  gercek_iade_tarihi              date,                       -- NULL = aktif zimmet
  musteri_karari                  text check (musteri_karari in ('aldi','almadi','degerlendiriyor')),
  durum_notu                      text,                       -- "ek 1 hafta uzatıldı" gibi
  uyari_3gun_kala_gonderildi      boolean default false,
  uyari_suresi_gecti_son_gonderim date,
  olusturma_tarih                 timestamptz default now()
);

create index demo_zimmet_aktif_idx
  on demo_zimmet_kayitlari (cihaz_id) where gercek_iade_tarihi is null;
create index demo_zimmet_musteri_idx on demo_zimmet_kayitlari (musteri_id);

-- RLS açık, yetki "demolar" menüsüne göre app-level kontrol
alter table demo_cihazlari enable row level security;
alter table demo_zimmet_kayitlari enable row level security;
create policy demo_cihazlari_select on demo_cihazlari for select using (true);
create policy demo_cihazlari_modify on demo_cihazlari for all using (true);
create policy demo_zimmet_select   on demo_zimmet_kayitlari for select using (true);
create policy demo_zimmet_modify   on demo_zimmet_kayitlari for all using (true);
```

### 1.3 Türetilmiş Cihaz Durumu (View)

```sql
create or replace view demo_cihazlari_durum as
select
  c.*,
  z.id            as aktif_zimmet_id,
  z.musteri_id    as aktif_musteri_id,
  z.lokasyon_id   as aktif_lokasyon_id,
  z.veris_tarihi,
  z.beklenen_iade_tarihi,
  z.veren_kullanici_ad,
  case
    when c.bakimda then 'bakimda'
    when z.id is null then 'depoda'
    when z.beklenen_iade_tarihi >= current_date then 'musteride'
    else 'suresi_gecti'
  end as hesaplanan_durum,
  case when z.id is not null
       then current_date - z.veris_tarihi
       else null
  end as gecen_gun
from demo_cihazlari c
left join demo_zimmet_kayitlari z
  on z.cihaz_id = c.id and z.gercek_iade_tarihi is null;
```

Listeleme/dashboard sorguları bu view üzerinden yapılır.

### 1.4 Kategori sabitleri

Form'da seçilebilen kategori listesi (frontend'de sabit):
`NVR`, `DVR`, `IP Kamera`, `Analog Kamera`, `Switch`, `Server`, `Santral`, `Telefon`, `Diğer`

---

## 2. UI — Web (`crm-app`)

### 2.1 Routing

| Path | Bileşen | İşlev |
|---|---|---|
| `/demolar` | `Demolar.jsx` | Liste + sekme + filtre |
| `/demolar/yeni` | `YeniDemoCihaz.jsx` | Havuza cihaz ekle |
| `/demolar/:id` | `DemoCihazDetay.jsx` | Cihaz detayı + geçmiş |
| `/demolar/:id/zimmet` | `YeniZimmet.jsx` | Zimmet aç |

### 2.2 `Demolar.jsx` — Liste

- **Üst sekme:** Tümü · Depoda · Müşteride · Süresi Geçti · Bakımda (her sekme yanında count badge)
- **Sıralama:** süresi geçti en üstte (en eski geç) → yaklaşanlar → diğerleri
- **Sütunlar:** Foto (40x40), Cihaz adı (marka + model alt), Müşteri/Lokasyon (zimmette ise), Veriliş tarihi, Kalan/Geçen gün (renkli rozet), Durum
- **Renk şeması:**
  - 🟢 Depoda → `var(--success)`
  - 🟡 Yaklaşan (0 < kalan ≤ 3 gün) → `var(--warning)`
  - 🔴 Süresi geçti → `var(--danger)`
  - ⚪ Bakımda → `var(--text-muted)`
- **Header butonları:** [+ Yeni Cihaz] [+ Yeni Zimmet] (Yeni Zimmet hızlı yol — depodakilerden seçtirir)
- **Arama:** ad/marka/model/seri_no üzerinde `trIcerir` (Türkçe normalize)

### 2.3 `DemoCihazDetay.jsx`

- **Üst:** foto + ad + marka/model + kategori
- **Aktif zimmet kartı** (varsa): müşteri, lokasyon, veriliş, beklenen iade, geçen gün rozeti, **[İade Al]** butonu, **[Süreyi Uzat]** butonu (yeni beklenen tarih sorar, durum_notu ekler)
- **Geçmiş zimmetler tablosu:** Müşteri · Veriliş · Gerçek iade · Süre · Müşteri kararı (rozet)
- **Cihaz işlemleri:** Düzenle, Bakıma Al / Bakımdan Çıkar (admin), Sil (admin, sadece hiç zimmeti yoksa)
- **Konversiyon istatistiği:** geçmiş zimmetlerden — `aldı / toplam_demoda_kalanlar` yüzde

### 2.4 `YeniZimmet.jsx`

Form alanları:
- **Cihaz** (sadece `depoda` durumdakiler — autocomplete dropdown)
- **Müşteri** (mevcut müşteri picker)
- **Lokasyon** (müşteri seçilince lokasyonlar yüklenir, opsiyonel)
- **Veriliş tarihi** (default: bugün)
- **Süre presetleri:** [7g] [14g] [30g] [Manuel]
- **Beklenen iade tarihi** (otomatik hesap, manuel düzenlenebilir)
- **Notlar** (opsiyonel)
- **Veren personel** (default: oturum kullanıcısı, admin başkasını seçebilir)

Kayıt sonrası: `/demolar/:cihazId` detayına yönlendirir.

### 2.5 İade Al akışı

`DemoCihazDetay`'da "İade Al" butonu modal açar:
- **Gerçek iade tarihi** (default: bugün)
- **Müşteri kararı:** Aldı / Almadı / Değerlendiriyor (radio)
- **Notlar** (opsiyonel: cihaz durumu, hasar vs.)
- Kaydet → zimmet kapanır, cihaz "depoda"ya döner

### 2.6 Dashboard entegrasyonu

`Dashboard.jsx` üst kart sırasına yeni KPI:
- **"⚠ N demo gecikmiş"** (kırmızı, tıklayınca `/demolar?sekme=suresi_gecti`)
- **"⏰ N demo yaklaşıyor"** (sarı, 0 < kalan ≤ 3 gün)
- KPI yalnızca sayı > 0 ise gösterilir (boşsa karta yer kaplamaz)

### 2.7 Sidebar / Menü

`MainLayout.jsx` ana menüye yeni öğe: **"Demolar"** (📦 `Package` icon), `/demolar` linki. Müşteriler ile Stok arasına yerleştirilir.

### 2.8 Yetki

`kullanici_menu_yetkileri` tablosuna yeni anahtar: `demolar`. Admin paneli üzerinden kullanıcı bazlı görünürlük kapatılabilir (mevcut mekanizma).

---

## 3. UI — Mobile (`crm-mobile`)

### 3.1 Navigasyon

`RootNavigator.js` Stack'e eklenecekler:
- `Demolar` → liste ekranı (DrawerItem)
- `DemoCihazDetay` → detay
- `YeniDemoCihaz` → cihaz ekle
- `YeniDemoZimmet` → zimmet aç

`HomeScreen` grid'ine yeni `Tile`: **"Demolar"** (`Package` ikonu, badge = süresi geçen aktif zimmet sayısı).

### 3.2 `DemolarScreen.js`

- Üstte 5 yatay sekme (Tümü / Depoda / Müşteride / Süresi Geçti / Bakımda) ScrollView
- FlatList: foto thumb + ad + müşteri (varsa) + kalan/geçen gün rozeti
- Sağ alt FAB: **+ Yeni Zimmet**
- Sağ üst header: **+ Yeni Cihaz**
- Pull-to-refresh

### 3.3 `DemoCihazDetayScreen.js`

- Cihaz başlık + foto
- Aktif zimmet kartı + [İade Al] [Süreyi Uzat] butonları
- Geçmiş zimmetler accordion listesi
- Bakıma Al / Bakımdan Çıkar (admin)

### 3.4 `YeniDemoZimmetScreen.js` & `YeniDemoCihazScreen.js`

Web ile aynı form alanları, mobile UI pattern'i (bottom sheet picker'lar, mevcut `LokasyonPicker` reused).

### 3.5 Tara entegrasyonu (faz 2 — opsiyonel)

`TaraScreen.js`'de mevcut S/N okutma akışına bir branch: okutulan kod bir demo cihaz seri numarasıyla eşleşirse → "Bu cihaz şu an X müşterisinde. İade alalım mı?" alert + onay → iade ekranı. Bu özellik faz 2.

### 3.6 Yetki

Web ile aynı `demolar` anahtarı kullanılır; `kullaniciMenuYetkileri` zaten mobile'da çalışıyor.

---

## 4. Servisler — kod yapısı

### 4.1 Web

`src/services/demoService.js`:
- `demoCihazlariGetir()` — view üzerinden, hesaplanan durum dahil
- `demoCihazGetir(id)` — tek cihaz + son aktif zimmet
- `demoCihazEkle(payload)` / `demoCihazGuncelle(id, payload)` / `demoCihazSil(id)`
- `demoZimmetGecmisi(cihazId)` — cihaza ait tüm zimmet kayıtları
- `demoZimmetAc({ cihazId, musteriId, lokasyonId, beklenenIadeTarihi, ... })`
- `demoZimmetIadeAl(zimmetId, { gercekIadeTarihi, musteriKarari, durumNotu })`
- `demoZimmetUzat(zimmetId, yeniBeklenenTarih, neden)`
- `demoBakimaAl(cihazId, bakimda)` (boolean toggle)
- `gecikmisDemolar()` ve `yaklasanDemolar()` — Dashboard kart kaynağı
- Cache: `cached('demo:cihazlar:list')` + invalidate yazma operasyonlarında

### 4.2 Mobile

`src/services/demoService.js` — web ile aynı API yüzeyi, mevcut `mapper.js` (toCamel/toSnake) ile snake_case ↔ camelCase otomatik.

---

## 5. Bildirim Akışı

### 5.1 Yaklaşım: client-side check (faz 1)

Sunucu cron yok. Web Dashboard ve Demolar sayfası açıldığında, mobile HomeScreen mount + visibilitychange'te şu fonksiyon çalışır:

```js
async function demoBildirimleriniKontrolEt() {
  const aktif = await aktifZimmetleriGetir()
  for (const z of aktif) {
    const kalan = z.beklenenIadeTarihi - bugun
    // 0 < kalan ≤ 3: kullanıcı arka arkaya gün açmasa da yine yakalanır
    if (kalan > 0 && kalan <= 3 && !z.uyari3gunKalaGonderildi) {
      await bildirimGonder(z, '3gun')
      await zimmetUyariFlag(z.id, { uyari3gunKalaGonderildi: true })
    }
    if (kalan < 0 && z.uyariSuresiGectiSonGonderim !== bugun) {
      await bildirimGonder(z, 'gecti')
      await zimmetUyariFlag(z.id, { uyariSuresiGectiSonGonderim: bugun })
    }
  }
}
```

**Race-condition koruması:** `uyari_*` alanları DB'de güncellenir → aynı bildirim mükerrer atılmaz (web + mobile aynı anda açılsa bile en geç gelene update geçer, bildirim de zaten 1 saniye içinde 2 kere insert olsa "okunmamış sayısı" 1 fazla; admin için kabul edilebilir).

### 5.2 Faz 2 — Supabase pg_cron (opsiyonel, sonradan)

Sunucu tarafında her sabah 09:00'da çalışan SQL fonksiyon. Faz 1 yeterli geliyorsa eklenmez.

### 5.3 Bildirim metinleri & alıcılar

**Alıcılar:** veren personel + tüm adminler (`rol = 'admin'`).

**3 gün kala** (`tip='uyari'`):
- Başlık: `"Demo iade tarihi yaklaşıyor"`
- Mesaj: `"{cihazAd} demo cihazı 3 gün sonra iade gelmeli — {firmaAdi}"`
- Link: `/demolar/{cihazId}`

**Süresi geçti** (`tip='hata'`):
- Başlık: `"⚠ Demo iade tarihi geçti"`
- Mesaj: `"{cihazAd} demo cihazı {N} gündür gecikmiş — {firmaAdi}"`
- Link: `/demolar/{cihazId}`

Mevcut `bildirimEkleDb` kullanılır (web + mobile API uyumlu).

---

## 6. Migration & Yayınlama Planı

1. **DB migration** (`supabase_migrations/030_demolar.sql`): tablolar, view, RLS, indexler. Manuel SQL Editor üzerinden uygulanır (mevcut workflow).
2. **Web servisleri** + **Web sayfaları** (yetki dahil) — tek PR.
3. **Web Dashboard kartları** + **MainLayout menü** — aynı PR.
4. **Mobile servisleri** + **Mobile ekranları** — ayrı commit.
5. **Bildirim kontrolü** (Dashboard + HomeScreen useEffect).
6. **Yetki tablosuna `demolar` anahtarı** — admin panelinden kullanıcılara açılır.
7. **EAS Update** (mobile JS-only fix'ler dahil).

Native asset değişikliği yok → `eas update` yeterli, `eas build` gerekmez.

---

## 7. Kapsam Dışı (YAGNI)

- **Demo cihaz alış değeri / sigorta alanı** — şu an pratik fayda yok, eklenmez.
- **PDF rapor üretimi** — istenince Faz 2.
- **Müşteri portal entegrasyonu** (müşterinin kendi demolarını görmesi) — gerekli değil.
- **Çoklu cihaz tek zimmette** — bir zimmet kaydı bir cihaza bağlı, birden fazla cihaz vermek istersen ayrı zimmet aç.
- **Otomatik conversion → satış kaydı dönüşümü** — `musteriKarari = 'aldi'` set edilir ama satış kaydı manuel açılır.
- **Demo cihaz transferi (personel → personel)** — şu an yok, gerekirse Faz 2.

---

## 8. Açık Sorular

Hiç kalmadı — tüm kararlar yukarıda netleştirildi. Brainstorm sırasında değişebilecek konular Bölüm 7'ye not olarak yazıldı.
