# Komut Paleti (⌘K / Ctrl+K)

**Tarih:** 2026-05-04
**Bağlam:** Modern CRM aracılarının (Linear, Notion, Vercel) sahip olduğu hızlı arama/eylem paleti — her sayfadan tek tuşla erişilebilir, müşteri/görev/görüşme/teklif/servis/satış/stok kalemlerinde arama yapar, hızlı eylem üretir.

## Hedef

`Ctrl+K` (Win) / `⌘K` (Mac) ile her sayfadan açılan tek input modal:
- Müşteri/firma, görev, görüşme, teklif, servis talebi, satış, stok kalemi arama
- Türkçe karakter tolerant (ş↔s, ğ↔g, vs. — `trSearch.js` mevcut)
- Sonuçlar **gruplandırılmış** (Müşteriler · Görevler · Teklifler · vb.)
- Enter → ilgili detay sayfasına git
- Hızlı eylemler ("Yeni görev", "Yeni teklif", "Yeni servis talebi", "Yeni müşteri") sonuçların altında
- LRU son görüntülenenler boş input açılışında en üstte
- ESC kapatır
- Klavye navigasyonu (↑↓ + Enter)

## Yapı

### Yeni component: `src/components/KomutPaleti.jsx`

- Modal — fullscreen overlay üzerinde merkezi 600x maks-yükseklik kart
- Tek `<input>` autoFocus
- Sonuçlar gruplu liste (her grup başlığı + 5'e kadar sonuç, "daha fazla" linki yok — daha spesifik aratılır)
- Footer: ↑↓ navigate · ↵ aç · esc kapat — küçük yardım metni
- Boş input → "Son görüntülenenler" gösterir (localStorage `kp_recent` last 8)
- Yazı yazınca → tüm modüllerde paralel filtre, ranking by trContains hit + recency

### Veri kaynakları

- **Mevcut Context'ler ve service'ler kullanılır** — DB'ye ek yük getirmez, ana sayfada zaten cache'lenmiş verileri kullanır
- Müşteriler: `musterileriGetir()` (cached)
- Görevler: `gorevleriGetir()` (cached)
- Görüşmeler: `gorusmeleriGetir()` (cached)
- Teklifler: `teklifleriGetir()` (cached)
- Servis talepleri: `useServisTalebi().talepler` (context state)
- Satışlar: `satislariGetir()` (cached)
- Stok kalemleri: `stokUrunleriniGetir()` (cached)
- Yükleme stratejisi: lazy — palet ilk açıldığında veriler yüklenir, sonraki açılışlarda cache hit
- Kullanıcı tipine göre kapsam: müşteri kullanıcıları için sadece müşteri portalına izin verilen modüller (talepler, teklifler), personel için hepsi

### Hızlı Eylemler (statik)

- "+ Yeni görev" → `/gorevler` (form aç state ile)
- "+ Yeni teklif" → `/teklifler/yeni`
- "+ Yeni servis talebi" → `/servis-talepleri/yeni`
- "+ Yeni müşteri" → `/musteriler` (form aç)
- "+ Yeni görüşme" → `/gorusmeler` (form aç)

Yazı yazınca eylemler gizlenir, sadece arama sonuçları görünür. Boşken hep en altta.

### Klavye

- `Ctrl/⌘+K` her yerde paleti açar (App.jsx'te global listener)
- Inputtaki text varsa, ↑↓ ile sonuçlar arasında gez
- `Enter` seçili sonucu açar
- `ESC` kapatır
- Açıkken sayfa scroll'u kilitlenir (body overflow hidden)

### Türkçe arama

Mevcut `src/lib/trSearch.js`'in `trContains(haystack, needle)` kullanılır.

### Recent (LRU)

- localStorage `kp_recent` — `[{ tip, id, baslik, yol }, ...]` last 8
- Bir sonuç açılınca listeye eklenir (varsa öne taşınır)

## UI taslak (text)

```
╔══════════════════════════════════════╗
║ 🔍  Ara: müşteri, görev, teklif…    ║
╠══════════════════════════════════════╣
║ MÜŞTERİLER                           ║
║ → Başakşehir Belediyesi              ║
║                                      ║
║ GÖREVLER                             ║
║ → Kameraya bakılacak  ·  Hayri       ║
║                                      ║
║ TEKLİFLER                            ║
║ → TEK-0021  ·  Karel Elektronik      ║
║                                      ║
║ HIZLI EYLEMLER                       ║
║ + Yeni görev                         ║
║ + Yeni teklif                        ║
╠══════════════════════════════════════╣
║  ↑↓ gez · ↵ aç · esc kapat           ║
╚══════════════════════════════════════╝
```

## Test senaryoları

1. **Boş arama** — Recent'lar görünür, hızlı eylemler altta
2. **"baş" yaz** — Başakşehir Belediyesi, Başak adlı kullanıcılar gibi sonuçlar
3. **"şahin" yaz** — "sahin" yazıldığında da bulur (Türkçe tolerant)
4. **Enter** — ilk sonuç açılır
5. **↓↓Enter** — 3. sonuç açılır
6. **"yeni görev" yaz** — "+ Yeni görev" üstte gelir (eylem önceliklendirilmesi)
7. **ESC** — modal kapanır, sayfada kaldığı yerde
8. **Müşteri kullanıcı** — sadece izinli modüllerde sonuç görür

## Kapsam dışı (YAGNI)

- Server-side fuzzy search (mevcut client-side yeterli, 5K kaydın altında)
- Algolia / Meilisearch entegrasyonu
- Komut listesi (örn. "/durum tamamlandi" gibi mini-DSL)
- Voice search
- AI suggestions

## Riskler

- **Performans**: Tüm context'leri ön yüklemek ilk açılışta yavaş olabilir. Çözüm: lazy load, ilk yazıda fetch
- **Cache invalidation**: Yeni kayıt eklendiğinde cache stale; service worker invalidate çağrıları zaten mevcut
- **Mobile**: Bu sadece web için — mobile'da farklı UX (sonra ele alınır)
- **Konfliktler**: Ctrl+K çoğu tarayıcının URL bar focus shortcut'u — preventDefault ile handle edilir
