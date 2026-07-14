# Stok Toplu Sınıflandırma

Ürün adı/markası/açıklamasından otomatik **kategori + teknik özellik** atayan
kural bazlı script. İlk çalıştırma: 2026-07-14 — 3.769 üründen 973'üne kategori,
414 teknik özellik değeri yazıldı.

## Dosyalar
- `urun-siniflandir.cjs` — sınıflandırıcı (kurallar + özellik çıkarımı)
- `siniflandirma-log-2026-07-14.json` — o gün atanan 973 kaydın tam listesi
  (**geri alma referansı**: hangi ürüne hangi kategori/özellik otomatik verildi)

## Güvenlik garantileri
- Hiçbir kayıt SİLMEZ — yalnız `kategori_id` UPDATE (sadece boş olanlara) ve
  özellik INSERT (mevcut değer ezilmez, `ignoreDuplicates`)
- Emin olamadığı ürünü boş bırakır; montaj/kurulum gibi hizmet satırlarını atlar
- Tekrar çalıştırılabilir: kategorisi dolu ürünlere dokunmaz

## Kullanım
```bash
# SERVICE_KEY = Supabase service_role anahtarı
SERVICE_KEY=... node urun-siniflandir.cjs           # kuru çalıştırma (rapor)
SERVICE_KEY=... APPLY=1 node urun-siniflandir.cjs   # uygula
```
Her çalıştırma yanına `siniflandirma-log.json` üretir — uyguladıysan tarihli
kopyasını bu klasöre alıp commit'le.

## Geri alma
Log'daki id'lerde `kategori_id`'yi null'a çekmek yeterli:
```sql
update stok_urunler set kategori_id = null where id in (...log'daki id'ler...);
delete from stok_urun_ozellikler where urun_id in (...log'daki id'ler...);
```
