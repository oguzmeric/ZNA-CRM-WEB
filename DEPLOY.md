# ZNA CRM — Güvenli Deploy Kılavuzu

Bu döküman, CRM'i **güvenli şekilde public'e açmak** için adım adım süreci anlatır.
Toplam süre: ~1-2 saat (test dahil).

> **Uyarı:** Her fazı ayrı ayrı test etmeden bir sonrakine geçme. Rollback
> için her `supabase_migrations/*.sql` dosyasının sonunda ROLLBACK bölümü var.

---

## Ön Koşullar

- Supabase projesi (URL + anon key elinde)
- GitHub repo (push yapabildiğin)
- Vercel hesabı (ücretsiz yeterli)
- **Veritabanı yedeği** (Supabase Dashboard → Database → Backups → Create backup)

---

## FAZ 1 — Supabase Auth'a geçiş

Amaç: `kullanicilar.sifre` plaintext kolonundan Supabase'in hash'li auth sistemine geç.

### 1.1 Şema güncelleme

1. Supabase Dashboard → **SQL Editor** → **New query**
2. `supabase_migrations/001_auth_migration.sql` **BÖLÜM A**'yı yapıştır ve **Run**.
3. Dosyanın yorum satırında "kendi kullanıcı adını admin işaretle" satırını aç:
   ```sql
   update kullanicilar set rol = 'admin' where kullanici_adi = 'admin';
   ```
   (veya kendi kullanıcı adın)

### 1.2 Mevcut kullanıcıları Auth'a taşı

**En kolay yol — migrate-users.mjs script'i:**

1. **Service role key** al:
   Dashboard → Settings → API → **service_role secret** (gizli, paylaşma)
2. Proje köküne `.env.local` oluştur (repo'ya commit EDİLMEZ):
   ```
   VITE_SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```
3. Önizleme:
   ```bash
   node scripts/migrate-users.mjs --dry-run
   ```
4. Her şey iyi görünüyorsa migrasyon:
   ```bash
   node scripts/migrate-users.mjs --execute
   ```
5. Oluşan `migrated-users.csv` dosyasında her kullanıcının:
   - Yeni email'i: `kullaniciadi@zna.local`
   - Yeni (rastgele) şifresi
   yazar.
6. Bu bilgileri kullanıcılarla paylaş. Herkes **mutlaka profil sayfasından
   kendi şifresini değiştirsin**.
7. Test: Sen bu yeni şifreyle giriş yapabildiğini doğrula.
8. `migrated-users.csv`'yi **sil** (plaintext şifre içerir).

### 1.3 Temizlik

Tüm kullanıcılar giriş yapabildiğinden emin olduktan sonra:

1. SQL Editor → `001_auth_migration.sql` **BÖLÜM C**'yi yapıştır.
2. Kontrol sorgusunu çalıştır:
   ```sql
   select id, kullanici_adi, auth_id from kullanicilar where auth_id is null;
   ```
   Sonuç boş olmalı.
3. Yorum açıp `ALTER TABLE` çalıştır → `sifre` kolonu silinir.

✅ **Faz 1 tamam.** Artık şifreler Supabase tarafında bcrypt ile hash'li.

---

## FAZ 2 — Row Level Security

Amaç: Anon key ele geçirilse bile tabloların dışarı açılmamasını sağla.

### 2.1 Policy'leri çalıştır

1. SQL Editor → `supabase_migrations/002_rls_policies.sql`'ı **tamamen** yapıştır.
2. **Run** → "Success. No rows returned" görmelisin.

### 2.2 Doğrulama

Aynı editörde:
```sql
select schemaname, tablename, rowsecurity
  from pg_tables
 where schemaname = 'public'
 order by tablename;
```
Tüm satırların `rowsecurity = true` olmalı.

```sql
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
 order by tablename;
```
Her tablo için en az 1 policy görmelisin.

### 2.3 Uygulamada test

1. `npm run dev` → giriş yap → tüm sayfaları gez.
2. **Beklenen:** her şey normal çalışır.
3. Müşteri portalı hesabıyla giriş yap → sadece kendi kayıtlarını görüyor mu kontrol et.
4. Browser console:
   ```js
   fetch('SUPABASE_URL/rest/v1/musteriler?select=*', {
     headers: { apikey: 'ANON_KEY' }
   }).then(r => r.json()).then(console.log)
   ```
   **Beklenen:** `[]` veya "permission denied" — liste GELMEMELİ.

❌ **Eğer bir şey çalışmıyorsa:** policy eksik. Eksik tabloyu tespit et
(console'da 401/403 hatası), `002_rls_policies.sql`'a ekle.

✅ **Faz 2 tamam.** Backend artık gerçekten güvenli.

---

## FAZ 3 — Vercel'e deploy

### 3.1 Repo'yu Vercel'e bağla

1. [vercel.com/new](https://vercel.com/new) → GitHub repo seç: `oguzmeric/ZNA-CRM-WEB`
2. Framework: Vite (otomatik algılar)
3. **Environment Variables** sekmesi — şunları ekle:
   ```
   VITE_SUPABASE_URL       = https://xxx.supabase.co
   VITE_SUPABASE_ANON_KEY  = eyJ...
   ```
   ⚠️ `SUPABASE_SERVICE_ROLE_KEY`'i **ASLA** Vercel'e ekleme; o sadece lokal script için.
4. **Deploy** → ilk deploy ~2 dk.

### 3.2 Supabase'e Vercel URL'ini izin ver

1. Supabase Dashboard → **Authentication → URL Configuration**:
   - **Site URL:** `https://crm-app-xxx.vercel.app` (Vercel'in verdiği URL)
   - **Redirect URLs:** aynı URL + custom domain eklersen onu da
2. Kaydet.

### 3.3 Custom domain (opsiyonel)

1. Vercel → Project → Settings → Domains → `crm.zna.com.tr` ekle
2. DNS'de CNAME `crm` → `cname.vercel-dns.com` yönlendir
3. SSL otomatik kurulur.
4. Supabase'de redirect URL'yi yeni domain'e güncelle.

### 3.4 Son kontroller

- [ ] Production URL'de giriş yap
- [ ] Müşteri portalı hesabıyla giriş yap, isolation doğru çalışıyor
- [ ] Network tab'inde Supabase isteklerinde `Authorization: Bearer ...` header'ı görülüyor
- [ ] Şifre değişikliği (profil sayfasından) çalışıyor

---

## Olası sorunlar

| Sorun | Çözüm |
|---|---|
| "Invalid login credentials" | migrate-users çalıştırmamışsın; Faz 1.2 |
| Herhangi bir liste boş geliyor | RLS policy eksik; tarayıcı console 401/403'a bak, tabloyu 002'ye ekle |
| Müşteri başkasının teklifini görüyor | `is_staff()` policy'si müşteriyi de içeriyor — `002_rls_policies.sql`'da müşteri policy'lerini gözden geçir |
| Vercel'de 404 (sayfa yenilenince) | `vercel.json`'daki rewrites yanlış — tek ve final kuralı: `"/(.*)" → "/"` |
| Vercel env değişkeni okunmuyor | Değişken adı `VITE_` ile başlamalı, sonra **Redeploy** gerekli |

---

## Güvenlik kontrol listesi (deploy sonrası)

- [ ] `.env` repo'ya commit edilmemiş (kontrol: `git ls-files | grep -i env` → sonuç boş)
- [ ] `migrated-users.csv` silinmiş
- [ ] `kullanicilar.sifre` kolonu veritabanından kaldırılmış
- [ ] Tüm kullanıcılar kendi şifrelerini değiştirmiş
- [ ] RLS tüm tablolarda açık (`pg_tables.rowsecurity = true`)
- [ ] Vercel Password Protection (Pro plan) — iç kullanım için ek katman istersen

---

**Yardım:** Bir şey kafa karıştırıyorsa adım numarasıyla yaz, düzeltelim.
