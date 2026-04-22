# ZNA CRM — Web

ZNA Teknoloji için geliştirilmiş müşteri ilişkileri yönetim (CRM) sistemi. Müşteri, görüşme, teklif, satış, servis talebi ve stok süreçlerini tek bir arayüzde toplar. Mobil uygulama ile aynı Supabase backend'ini paylaşır.

## 🎯 Özellikler

### Modüller
- **👥 Müşteriler** — Firma merkezli yönetim, ilgili kişiler, alt lokasyonlar
- **📞 Görüşmeler** — İrtibat şekli (Telefon/WhatsApp/Mail/Yüz Yüze vs.), aktivite kaydı
- **📋 Teklifler** — Kabul/Red takibi, satış temsilcisi, ödeme şekli
- **🧾 Satışlar & Faturalar** — Tahsilat yönetimi, gecikmiş alacak raporu
- **🔧 Servis Talepleri** — Mobil ekiple entegre saha takibi
- **📦 Stok** — S/N takipli cihazlar + toplu ürünler, mobil barkod ile senkron
- **🚚 Kargo Takip** — Durum geçmişi, ilerleyici bar
- **🔑 Trassir Lisanslar** — Lisans süresi takibi
- **✅ Görevler** — Kanban görünüm, yorum sistemi
- **📅 Takvim** — Tüm aktivitelerin tek ekranda görünümü
- **📊 Dashboard & Raporlar** — Özelleştirilebilir widget'lar, PDF/Excel export

### Teknik
- Firma merkezli müşteri modeli (1760+ müşteri taşındı)
- 2044+ görüşme, 545+ teklif geçmişi aktarıldı
- `musteri_kisiler` + `musteri_lokasyonlari` mobil ile senkron
- Excel import scriptleri (`scripts/`) toplu veri aktarım için
- Pagination ile 1000+ kayıt sorunsuz listelenir

---

## 🛠 Teknoloji

| Katman | Kullanılan |
|---|---|
| Frontend | React 19 + Vite + React Router 7 |
| Styling | Tailwind CSS + CSS Variables (tema desteği) |
| Backend | [Supabase](https://supabase.com) (Postgres + Auth + Storage) |
| State | Context API (Auth, Bildirim, Kargo, vs.) |
| Forms | Kendi CustomSelect, inline düzenleme |
| Animasyon | Framer Motion |
| İkonlar | Emoji + Feather |
| Excel | `xlsx` kütüphanesi (import/export) |
| PDF | HTML → window.print() yaklaşımı |

---

## 🚀 Kurulum

### Gereksinimler
- Node.js 18+
- npm (veya pnpm/yarn)

### Adımlar

```bash
# Bağımlılıkları yükle
npm install

# Geliştirme sunucusunu başlat
npm run dev
# → http://localhost:3000

# Prodüksiyon build
npm run build
```

### Ortam Değişkenleri

Kök dizinde `.env` dosyası oluştur:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

> ⚠️ `.env` **commit edilmemeli** — `.gitignore`'da hariç tutulmuştur.

---

## 📂 Proje Yapısı

```
crm-app/
├── src/
│   ├── pages/              # Sayfa bileşenleri (Müşteriler, Teklifler, vs.)
│   ├── components/         # Ortak UI bileşenleri (CustomSelect, ThemePaneli)
│   ├── context/            # Global state (Auth, Toast, Confirm, Kargo, vs.)
│   ├── services/           # Supabase servis katmanı (her modül için ayrı)
│   ├── layouts/            # MainLayout, MusteriLayout
│   ├── lib/
│   │   ├── supabase.js     # Supabase client
│   │   └── mapper.js       # camelCase ↔ snake_case dönüştürücü
│   ├── hooks/              # Custom React hooks
│   └── App.jsx             # Route tanımları
├── scripts/                # Toplu import scriptleri (Excel → Supabase)
│   ├── import-musteriler.mjs
│   ├── import-gorusmeler.mjs
│   └── import-teklifler.mjs
├── supabase_*.sql          # Şema dosyaları / migration SQL'leri
└── public/
```

---

## 🗄 Supabase Tabloları

| Tablo | Açıklama |
|---|---|
| `musteriler` | Firma + müşteri kodu |
| `musteri_kisiler` | İlgili kişiler (ana_kisi işaretli) |
| `musteri_lokasyonlari` | Alt lokasyonlar (şube/bina/oda) |
| `gorusmeler` | Aktivite kayıtları |
| `teklifler` | Teklif + satış temsilcisi |
| `satislar` + `satis_satirlari` + `tahsilatlar` | Fatura + ürünler + ödemeler |
| `servis_talepleri` | Saha servis kayıtları |
| `stok_urunler` | Ürün kataloğu (toplu stok) |
| `stok_kalemleri` | S/N takipli kalemler |
| `stok_kalemi_hareketleri` | Stok hareket geçmişi |
| `kargolar` | Kargo + durum_gecmisi JSONB |
| `gorevler` | Görev + yorumlar JSONB |
| `lisanslar` | Trassir lisans takibi |

---

## 📤 Veri Aktarım Scriptleri

Eski sistemden Excel ile toplu aktarım için:

```bash
# Müşteri listesi
node scripts/import-musteriler.mjs --dry-run   # önce dene
node scripts/import-musteriler.mjs --commit    # gerçek yazma

# Görüşme listesi
node scripts/import-gorusmeler.mjs --commit

# Teklif listesi
node scripts/import-teklifler.mjs --commit
```

Tüm scriptler önce `--dry-run` ile ön izleme gösterir, `--commit` ile Supabase'e yazar.

---

## 🔗 İlgili Projeler

- **ZNA CRM Mobile** — React Native (Expo) mobil uygulaması, aynı Supabase backend
- Mobil uygulamada yapılan barkod taraması / servis kaydı anında web'de görünür

---

## 📜 Geliştirme Notları

- Supabase default **1000 kayıt limiti** aşıldığı için tüm `*Getir()` servisleri **pagination** kullanır
- Müşteri silme → `ON DELETE CASCADE` ile ilgili kişiler/lokasyonlar otomatik silinir
- `useAuth()` kontextinden `kullanici` ve `kullanicilar` gelir — localStorage bağımsız
- Performans: büyük listeler (500+) için sayfa başı "Daha Fazla Yükle" butonu var

---

## 👤 Geliştirici

**Oğuz Meriç** — [@oguzmeric](https://github.com/oguzmeric)

© ZNA Teknoloji
