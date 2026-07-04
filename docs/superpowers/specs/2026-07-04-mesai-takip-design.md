# Mesai Takip — Design Spec

**Tarih:** 2026-07-04
**Kapsam:** Teknisyen / depo mesai giriş-çıkış logu — ofis QR + GPS ile giriş, tek buton ile çıkış. Web'de Ali/Oğuz'a raporlama.

---

## 1. Amaç

Teknisyenlerin ve depo personelinin işe başlama ve bitiş saatlerini objektif, yalan söylenemez şekilde kayıt altına almak. Ofis giriş QR'ı + telefon GPS'i ile "gerçekten ofiste miydi" doğrulanır. Çıkış tek tuşla — teknisyen genellikle sahadan işi bitirir.

## 2. Kullanıcılar ve erişim

| Rol | Mobil kart | Web raporu | Ofis konumu ayarı |
|---|---|---|---|
| Teknisyen | ✅ | ❌ | ❌ |
| Depocu | ✅ | ❌ | ❌ |
| Ferdi (yönetici) | ✅ | ❌ | ❌ |
| Ali (yönetici) | ✅ | ✅ | ❌ |
| Oğuz (admin) | ✅ | ✅ | ✅ |

Modül anahtarı: `mesai_takip`. `kullanicilar.moduller` array'ine eklenir.

## 3. Veri modeli

### 3.1 `mesai_kayitlari`

| Kolon | Tip | Not |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `kullanici_id` | uuid | fk → `kullanicilar(id)`, `on delete cascade` |
| `giris_zamani` | timestamptz not null | QR okunduğu an |
| `giris_lat` | numeric(10,7) | telefondan alınan GPS lat |
| `giris_lng` | numeric(10,7) | telefondan alınan GPS lng |
| `giris_mesafe_m` | integer | ofise Haversine mesafe, metre |
| `cikis_zamani` | timestamptz | null → aktif mesai |
| `cikis_lat` | numeric(10,7) | opsiyonel |
| `cikis_lng` | numeric(10,7) | opsiyonel |
| `sure_dakika` | integer | çıkışta trigger ile |
| `not` | text | ör. "Ofis dışı: 320m", "GPS reddedildi", "Yeni giriş için otomatik kapatıldı" |
| `created_at` | timestamptz default now() | |
| `updated_at` | timestamptz default now() | |

**Index:**
- `create unique index mesai_aktif_tek on mesai_kayitlari(kullanici_id) where cikis_zamani is null;`
  → Bir kullanıcının aynı anda tek açık kaydı olabilir.
- `create index mesai_kullanici_tarih on mesai_kayitlari(kullanici_id, giris_zamani desc);`

**Trigger:**
- BEFORE UPDATE — `cikis_zamani` set edilirse `sure_dakika = extract(epoch from (cikis_zamani - giris_zamani))::int / 60`.

### 3.2 `ofis_konumu`

Tek satır. Şube açılırsa çoklu satır kolayca desteklenir (kullanıcıya `ofis_id` eklenir).

| Kolon | Tip | Not |
|---|---|---|
| `id` | uuid pk | |
| `ad` | text | ör. "Merkez Ofis" |
| `lat` | numeric(10,7) not null | |
| `lng` | numeric(10,7) not null | |
| `tolerans_metre` | integer default 150 | GPS toleransı |
| `guncelleme_zamani` | timestamptz default now() | |

Seed: bir kayıt `ad='Merkez Ofis'` ile — koordinat Oğuz haritadan setler.

### 3.3 RLS

- `mesai_kayitlari`:
  - SELECT: `kullanici_id = auth.uid()` VEYA kullanıcının rolü admin / adı Ali|Oğuz
  - INSERT/UPDATE: doğrudan yasak — sadece SECURITY DEFINER RPC üzerinden (aşağıda)
- `ofis_konumu`:
  - SELECT: authenticated
  - UPDATE: sadece Oğuz (`ad ~* '(oğuz|oguz)'`)

## 4. QR kodu

**Payload biçimi:** `ZNA-MESAI:v1:{ofis_id}:{hmac16}`

- `hmac16` = HMAC-SHA256(secret, `v1|{ofis_id}`) → base64url ilk 16 karakter.
- `secret` = Supabase secret `MESAI_QR_SECRET` (32 byte random, sadece backend'de).
- Mobil sadece `ZNA-MESAI:v1:` prefix eşleşmesini kontrol eder — asıl imza doğrulama backend'de.
- QR üretim: `mesai-qr-uret` edge function — Oğuz-only. PNG + A4 PDF döner. Ofis kapısına yazdırılır.

**Rotasyon:** Yok (YAGNI). Secret sızarsa Oğuz secret'i regenerate edip yeni QR yazdırır — eski geçersizleşir.

## 5. Mobil akış

### 5.1 HomeScreen — Mesai kartı

Sadece `mesai_takip` modülü olan kullanıcıda görünür.

**Durum: mesai kapalı**
```
┌──────────────────────────────────┐
│  ⏱  Mesai                        │
│  Bugün henüz başlamadın           │
│  ┌────────────────────────────┐  │
│  │  🟢 Mesaiye Başla (QR Okut)│  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

**Durum: mesai açık**
```
┌──────────────────────────────────┐
│  🟢 Mesaide  ·  03:42 sürüyor    │
│  Başlangıç: 08:14                 │
│  ┌────────────────────────────┐  │
│  │  🔴 Mesaiyi Bitir          │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

Sayaç canlı (setInterval, dakika bazında).

### 5.2 Giriş akışı

1. **Buton** → `expo-camera` barkod okuyucu (mevcut komponent yeniden kullanılır).
2. QR okunur → prefix kontrol `ZNA-MESAI:v1:`. Değilse: "Bu QR mesai kodu değil."
3. `expo-location` — foreground GPS **zorunlu**. İzin reddedilirse veya alınamıyorsa mesai başlatılamaz:
   - Alert: "Mesai başlatmak için konum izni zorunlu. Ayarlar > Uygulama izinleri > Konum'dan aç ve tekrar dene."
   - "Tekrar Dene" ve "İptal" butonları.
4. Edge fn `mesai-giris` çağrılır:
   ```json
   { "qr_payload": "ZNA-MESAI:v1:abc:xyz", "lat": 41.05, "lng": 29.02 }
   ```
5. Backend cevabı:
   - `{ ok: true, mesai_id, mesafe_m }` → haptic success + toast "Mesaiye başladın 🟢"
   - `{ ok: true, uyari: "ofis_disi", mesafe_m: 320 }` → alert: "Ofis konumundan ~320m uzaktasın. Yine de başlayayım mı?" Onay → tekrar çağrı `{ zorla: true }` ile.
   - `{ ok: false, hata: "zaten_acik", acik_kayit_baslangic }` → confirm: "Zaten 07:32'den beri mesaidesin. Kapatıp yenisini açayım mı?" → onay → `mesai-cikis` sonra tekrar `mesai-giris`.
   - `{ ok: false, hata: "gecersiz_qr" }` → "QR geçersiz — ofis QR'ını okuttuğundan emin ol."
   - `{ ok: false, hata: "konum_yok" }` → (backend defence) "Konum bilgisi olmadan giriş yapılamaz."

### 5.3 Çıkış akışı

1. "Mesaiyi Bitir" → confirm: "Mesaiyi bitir? Toplam ~03:42 çalıştın."
2. GPS opsiyonel snapshot (izin varsa).
3. Edge fn `mesai-cikis` → `{ ok, sure_dakika }`.
4. Toast: "Mesai bitti ✅ Toplam 08:14".

### 5.4 Realtime sync

`mesai_kayitlari` üzerinde Supabase Realtime abonelik — kullanıcı web'den bir şey değişse kart güncellenir (ör. Oğuz manuel kaydı düzeltirse). Ana app zaten Realtime provider kullanıyor.

## 6. Web akışı

### 6.1 Raporlar > Mesai sekmesi

Sadece Ali + Oğuz görür. Mevcut `YonetimGuard` yeterli değil — Ferdi de Yönetim erişimli mi? Değil (Ali/Oğuz-only). Sekmenin görünürlüğü aynı regex ile (`/\b(oğuz|oguz|ali)\b/i`).

**Filtreler:**
- Tarih aralığı — default "bu hafta" (pazartesi-bugün)
- Personel çoklu seçici — boş = hepsi

**Tablo kolonları:**
| Tarih | Personel | Giriş | Çıkış | Süre | Not |
|---|---|---|---|---|---|
| 04.07.2026 | Sefa Övüngen | 08:12 | 17:34 | 09:22 | — |
| 04.07.2026 | Muhammet Nayman | 08:45 | — | (devam ediyor) | Ofis dışı: 210m |

- Sıralanabilir kolonlar (tarih desc default).
- CSV export butonu (üstte, mevcut CSV util'i kullan).
- Devam eden kayıtlar `cikis_zamani IS NULL` — Süre "devam" olarak.

### 6.2 Yönetim > Ofis Konumu (sadece Oğuz)

Sidebar > Yönetim grubu içinde yeni item (OguzGuard ile korunur).

- Leaflet harita (OSM tile — mevcut `MobiltekHarita` altyapısı yeniden kullanılabilir formatta).
- Sürüklenebilir tek pin.
- Input: Ofis adı, Tolerans (metre, default 150).
- "Kaydet" butonu → `ofis_konumu` upsert.

## 7. Backend — Edge Functions

Deno, mevcut `mobiltek-proxy` yapısıyla aynı klasör paterni.

### 7.1 `mesai-giris`

**Input:** `{ qr_payload: string, lat: number, lng: number, zorla?: boolean }`

**Akış:**
1. JWT'den `kullanici_id` çıkar.
2. `lat`/`lng` yoksa → `{ ok:false, hata:'konum_yok' }` (backend defence — mobil zaten engelleyecek ama emin olalım).
3. `MESAI_QR_SECRET` ile QR HMAC doğrula. Geçersizse → `{ ok:false, hata:'gecersiz_qr' }`.
4. `ofis_konumu` çek, Haversine ile `mesafe_m` hesapla.
5. Açık kayıt var mı? Varsa `zorla=false` → `{ ok:false, hata:'zaten_acik', acik_kayit_baslangic }`. `zorla=true` → önce kapat (not: "Yeni giriş için otomatik kapatıldı"), devam et.
6. Mesafe > tolerans VE `zorla=false` → `{ ok:false, uyari:'ofis_disi', mesafe_m }` (ön uyarı).
7. Insert `mesai_kayitlari`, gerekiyorsa `not` ayarla:
   - `mesafe_m > tolerans` → "Ofis dışı: {mesafe_m}m"
8. Return `{ ok:true, mesai_id, mesafe_m }`.

**RLS bypass:** service_role ile insert (RLS insert yasak).

### 7.2 `mesai-cikis`

**Input:** `{ lat?: number, lng?: number }`

**Akış:**
1. JWT → `kullanici_id`.
2. Açık kayıt bul (`cikis_zamani IS NULL`, en yeni). Yoksa → `{ ok:false, hata:'acik_kayit_yok' }`.
3. Update: `cikis_zamani = now(), cikis_lat, cikis_lng`. Trigger `sure_dakika` set eder.
4. Return `{ ok:true, sure_dakika }`.

### 7.3 `mesai-qr-uret`

**Yetki:** JWT'den kullanici adı — sadece Oğuz.

**Akış:**
1. `ofis_konumu.id` al.
2. HMAC hesapla → payload üret.
3. `qrcode` npm/deno lib ile PNG üret.
4. Return `{ png_base64, payload }`.

A4 PDF çıktısı için frontend basit HTML → `window.print`.

## 8. Migration 083

```sql
-- 083_mesai_takip.sql (özet)

create table ofis_konumu (...);
create table mesai_kayitlari (...);
create unique index mesai_aktif_tek on mesai_kayitlari(kullanici_id) where cikis_zamani is null;
create index mesai_kullanici_tarih on mesai_kayitlari(kullanici_id, giris_zamani desc);

create trigger mesai_sure_hesapla before update on mesai_kayitlari
  for each row execute function mesai_sure_hesapla_fn();

-- RLS
alter table mesai_kayitlari enable row level security;
create policy mesai_kendi_okur on mesai_kayitlari for select using (
  kullanici_id = auth.uid()::uuid
  or exists (select 1 from kullanicilar where auth_id = auth.uid()
              and (rol = 'admin' or ad ~* '\b(oğuz|oguz|ali)\b'))
);
-- INSERT/UPDATE policy YOK — edge function service_role ile yazar.

alter table ofis_konumu enable row level security;
create policy ofis_okur on ofis_konumu for select to authenticated using (true);
create policy ofis_oguz_yazar on ofis_konumu for all using (
  exists (select 1 from kullanicilar where auth_id = auth.uid() and ad ~* '\b(oğuz|oguz)\b')
);

-- Seed
insert into ofis_konumu (ad, lat, lng, tolerans_metre) values ('Merkez Ofis', 0, 0, 150);

-- Modül dağıtımı
update kullanicilar set moduller = array_append(coalesce(moduller,'{}'), 'mesai_takip')
where not ('mesai_takip' = any(coalesce(moduller,'{}')))
  and (rol = 'admin'
       or ad ~* '\b(ferdi|ali|oğuz|oguz)\b'
       or unvan ~* '(teknisyen|depo)');
```

## 9. Güvenlik notları

- QR secret hiçbir zaman frontend'e (mobil/web) gitmez. Sadece `mesai-qr-uret` ve `mesai-giris` edge functions'da.
- Mobil "prefix kontrolü" yalnızca UX (yanlış QR okuduysa hemen uyar) — asıl güvenlik backend'de.
- Konum sahtekârlığı (fake GPS app) tamamen engellenemez — ama bir teknisyen fake GPS ile giriş yaparsa disiplin problemidir, işveren bunu bilir. Log kalır (`giris_lat/lng`).
- RLS yazma yasağı → mobil kullanıcı doğrudan `insert into mesai_kayitlari` deneyemez.

## 10. Kapsam dışı (sonra)

- Push bildirim ("Nayman 10:00'da hala giriş yapmadı")
- Otomatik çıkış saatinde bitir (23:59'a kadar açık kalanlar için cron)
- Şube desteği (çoklu ofis)
- Isı tablosu / heatmap görsel raporlama
- Aylık PDF bordro ihracı

## 11. Yapılacak işlerin özeti (implementation plan girdisi)

1. Migration 083 — tablolar, index, trigger, RLS, seed, modül dağıtımı
2. Edge fn `mesai-giris`, `mesai-cikis`, `mesai-qr-uret` deploy
3. Mobile: HomeScreen'de MesaiKarti komponenti + servis fonksiyonları
4. Mobile: `expo-location` foreground GPS entegrasyonu
5. Web: Raporlar > Mesai sekmesi (tablo + filtre + CSV)
6. Web: Yönetim > Ofis Konumu sayfası (Leaflet + form)
7. Oğuz için QR yazdırma sayfası (Ofis Konumu ayarları altında "QR Üret" butonu)
8. Test: soft blok / GPS yok / zaten açık senaryoları
