# Teklif Trassir & Karel Şablonları — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Satışçı teklif oluştururken şablon seçer (Standart/Trassir/Karel); her şablon kendi PDF ve Excel çıktısını üretir.

**Architecture:** `teklifler` tablosuna `teklif_tipi` kolonu eklenir. `TeklifDetay`'da segmented control şablon seçimi yapar. `TeklifYazdir` artık tipe göre 3 farklı render component'i yükler. Excel `exceljs` ile client-side üretilir, görseller `public/teklif-assets/`'ten embed edilir. Sabit metinler (firma profili, hizmetler, karşılama paragrafı) `src/lib/teklifTemplates.js`'te tutulur — kod-içi, editable değil.

**Tech Stack:** React 19, Supabase, `exceljs` (yeni dep), `file-saver` (yeni dep), inline `<style>` ile print CSS. Mevcut codebase'de test framework yok — doğrulama manuel smoke test ile yapılır.

**Spec:** [docs/superpowers/specs/2026-05-04-teklif-trassir-karel-sablonlari-design.md](../specs/2026-05-04-teklif-trassir-karel-sablonlari-design.md)

---

## File Structure

**Yeni:**
- `supabase_migrations/025_teklif_tipi.sql` — kolon ekleme + check constraint + schema reload
- `src/lib/teklifTemplates.js` — sabit metinler (firma profili, karşılama, hakkında, hizmetler)
- `src/lib/teklifExport/trassirExcel.js` — Trassir .xlsx üreticisi
- `src/lib/teklifExport/karelExcel.js` — Karel .xlsx üreticisi
- `src/lib/teklifExport/standartExcel.js` — Standart .xlsx üreticisi (basit fallback)
- `src/lib/teklifExport/index.js` — dispatch (`teklif.teklifTipi` → uygun export fn)
- `src/pages/teklifCikti/StandartCikti.jsx` — mevcut çıktının ayrılmış hali
- `src/pages/teklifCikti/TrassirCikti.jsx` — Trassir 5-sayfa A4 dikey
- `src/pages/teklifCikti/KarelCikti.jsx` — Karel tek-sayfa A4 yatay
- `public/teklif-assets/zna-cover.png` — Trassir kapak (Trassir.xlsx image.png'den)
- `public/teklif-assets/is-ortaklari.png` — Trassir partner grid'i
- `public/teklif-assets/referanslar.png` — Trassir referans grid'i
- `public/teklif-assets/zna-logo.png` — Karel sol header (karel.xlsx image.jpg'den, JPG'i PNG'ye çevirmeden de bırakılabilir)
- `public/teklif-assets/karel-is-ortagi.png` — Karel sağ header

**Değişen:**
- `src/pages/TeklifDetay.jsx` — form'a `teklifTipi` state, segmented control UI, kaydet flow
- `src/pages/TeklifYazdir.jsx` — refactor: tipe göre render + Excel İndir butonu
- `src/pages/Teklifler.jsx` — satırda küçük tip badge'i
- `package.json` — `exceljs` ve `file-saver` eklenir

---

## Task 1: DB Migration — teklif_tipi kolonu

**Files:**
- Create: `supabase_migrations/025_teklif_tipi.sql`

- [ ] **Step 1: Migration dosyasını oluştur**

`supabase_migrations/025_teklif_tipi.sql`:

```sql
-- =====================================================================
-- Teklifler — şablon tipi kolonu
-- =====================================================================
-- Trassir / Karel / Standart şablon ayrımı için.
-- Mevcut tüm satırlar 'standart' default'u alır.
-- =====================================================================

alter table teklifler
  add column if not exists teklif_tipi text not null default 'standart';

-- Geçerli değerleri kısıtla
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'teklifler_teklif_tipi_check'
  ) then
    alter table teklifler
      add constraint teklifler_teklif_tipi_check
      check (teklif_tipi in ('standart','trassir','karel'));
  end if;
end$$;

-- PostgREST schema cache reload
notify pgrst, 'reload schema';
```

- [ ] **Step 2: Supabase'de çalıştır**

User'ın memory'sindeki [reference_supabase_db.md](memory:reference_supabase_db) bilgisine göre psql üzerinden:

```bash
psql "$SUPABASE_DB_URL" -f supabase_migrations/025_teklif_tipi.sql
```

Beklenen çıktı: `ALTER TABLE`, `DO`, `NOTIFY` (hata yok).

- [ ] **Step 3: Doğrulama**

```bash
psql "$SUPABASE_DB_URL" -c "select column_name, data_type, column_default from information_schema.columns where table_name='teklifler' and column_name='teklif_tipi';"
```

Beklenen: `teklif_tipi | text | 'standart'::text`

```bash
psql "$SUPABASE_DB_URL" -c "select count(*), teklif_tipi from teklifler group by teklif_tipi;"
```

Beklenen: tüm mevcut kayıtlar `standart`.

- [ ] **Step 4: Commit**

```bash
git add supabase_migrations/025_teklif_tipi.sql
git commit -m "db(migration): teklifler.teklif_tipi kolonu (standart/trassir/karel)"
```

---

## Task 2: Sabit metinler dosyası

**Files:**
- Create: `src/lib/teklifTemplates.js`

- [ ] **Step 1: Dosyayı oluştur**

`src/lib/teklifTemplates.js`:

```js
// Trassir/Karel teklif şablonlarında kullanılan sabit metinler.
// Excel orijinallerinden birebir alınmıştır. Değişirse buradan tek
// noktadan güncellenir; admin UI'sı yok (YAGNI).

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

// Şablon tipi → görünür isim
export const TEKLIF_TIPI_LABEL = {
  standart: 'Standart',
  trassir: 'Trassir',
  karel: 'Karel',
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/teklifTemplates.js
git commit -m "feat(teklif): şablon sabit metinleri (firma profili, hakkında, hizmetler)"
```

---

## Task 3: Görsel varlıkları public'e ekle

**Files:**
- Create: `public/teklif-assets/zna-cover.png`
- Create: `public/teklif-assets/is-ortaklari.png`
- Create: `public/teklif-assets/referanslar.png`
- Create: `public/teklif-assets/zna-logo.png`
- Create: `public/teklif-assets/karel-is-ortagi.png`

- [ ] **Step 1: Klasörü oluştur**

```bash
mkdir -p public/teklif-assets
```

- [ ] **Step 2: Excel'lerden görselleri çıkar**

Excel dosyaları (`xl/media/` klasöründe görselleri zip içinde tutar). Bash ile:

```bash
mkdir -p /tmp/xlsx_t /tmp/xlsx_k
unzip -o "C:/Users/MSI-LAPTOP/Downloads/Trassir.xlsx" -d /tmp/xlsx_t > /dev/null
unzip -o "C:/Users/MSI-LAPTOP/Downloads/karel.xlsx" -d /tmp/xlsx_k > /dev/null

# Trassir kapak (image.png), iş ortakları (image2.png), referanslar (image3.png)
cp /tmp/xlsx_t/xl/media/image.png  public/teklif-assets/zna-cover.png
cp /tmp/xlsx_t/xl/media/image2.png public/teklif-assets/is-ortaklari.png
cp /tmp/xlsx_t/xl/media/image3.png public/teklif-assets/referanslar.png

# Karel sol logo (image.jpg → uzantıyı koru, exceljs jpg'yi destekler), sağ logo (image.png)
cp /tmp/xlsx_k/xl/media/image.jpg public/teklif-assets/zna-logo.jpg
cp /tmp/xlsx_k/xl/media/image.png public/teklif-assets/karel-is-ortagi.png

rm -rf /tmp/xlsx_t /tmp/xlsx_k
ls -la public/teklif-assets/
```

Beklenen: 5 dosya, hiçbiri 0 byte değil.

NOT: `zna-logo.jpg` kaldı (PNG değil); kod içinde uzantıyı buna göre kullan.

- [ ] **Step 3: Commit**

```bash
git add public/teklif-assets/
git commit -m "assets: teklif şablon görselleri (Trassir kapak, iş ortakları, referanslar; Karel logoları)"
```

---

## Task 4: Yeni bağımlılıklar (exceljs + file-saver)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Paketleri kur**

```bash
npm install exceljs file-saver
```

Beklenen: package.json'a `exceljs` (~^4.x) ve `file-saver` (~^2.x) eklenir, lock güncellenir.

- [ ] **Step 2: Doğrula**

```bash
node -e "console.log(require('exceljs').version)"
```

Hatasız çalışmalı.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: exceljs ve file-saver (Excel export için)"
```

---

## Task 5: TeklifDetay'a şablon seçici ekle

**Files:**
- Modify: `src/pages/TeklifDetay.jsx`

- [ ] **Step 1: Import ekle**

`TeklifDetay.jsx` üst kısmında ui import'una `SegmentedControl` zaten dahil (satır 23). Yeni import: `TEKLIF_TIPI_LABEL`'a gerek yok — opsiyonları sabit yazılır.

`bosUrun` constant'ının altına ekle:

```js
const teklifTipiSecenekleri = [
  { value: 'standart', label: 'Standart' },
  { value: 'trassir', label: 'Trassir' },
  { value: 'karel', label: 'Karel' },
]
```

- [ ] **Step 2: Form state'ine teklifTipi alanını ekle**

Mevcut iki form `setForm({...})` çağrısı (yeni teklif için ~satır 130, mevcut teklif için ~satır 152) — her ikisine ekle:

Yeni teklif (~satır 130 bloğu):
```js
setForm({
  teklifNo: `TEK-${String(teklifSayisi + 1).padStart(4, '0')}`,
  revizyon: 0,
  // ... mevcut alanlar
  teklifTipi: 'standart',  // ← yeni
  // ... kalan alanlar
})
```

Mevcut teklif (~satır 152 bloğu):
```js
setForm({
  teklifNo: mevcutTeklif.teklifNo || '',
  // ... mevcut alanlar
  teklifTipi: mevcutTeklif.teklifTipi || 'standart',  // ← yeni
  // ... kalan alanlar
})
```

- [ ] **Step 3: Form'da SegmentedControl render et**

Form'un en üstünde (Firma adı / müşteri seçim alanından önce), uygun bir Card/section içine ekle. Mevcut form layout'unu izleyerek (firma seçimi card'ının üstüne):

```jsx
<Card style={{ padding: 16, marginBottom: 16 }}>
  <Label>Teklif Şablonu</Label>
  <SegmentedControl
    options={teklifTipiSecenekleri.map(s => ({ id: s.value, isim: s.label }))}
    value={form.teklifTipi}
    onChange={(val) => setForm({ ...form, teklifTipi: val })}
    size="md"
  />
  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
    Yazdırma ve Excel çıktısı seçilen şablona göre üretilir.
  </p>
</Card>
```

NOT: SegmentedControl'ün API'sini doğrula — gerekirse `{ value, label }` veya `{ id, isim }` alanlarına uydur. (`src/components/ui/SegmentedControl.jsx` `options[]` ile çalışır; yapısını oraya bakıp uyarla.)

- [ ] **Step 4: kaydet flow'unun teklifTipi'ni gönderdiğini doğrula**

`teklifService.teklifEkle`/`teklifGuncelle` `toSnake` ile camelCase→snake_case dönüşümü yapıyor. `teklifTipi` → `teklif_tipi` otomatik dönüşür. Ekstra kod gerekmez.

- [ ] **Step 5: Smoke test**

```bash
npm run dev
```

Tarayıcıda:
1. `/teklifler/yeni` — Şablon seçici görünür, varsayılan "Standart"
2. "Trassir" seç, formu doldur, kaydet
3. Listeye dön, kaydı aç → seçili olanın "Trassir" olduğunu doğrula
4. DB'de kaydı kontrol: `psql "$SUPABASE_DB_URL" -c "select id, teklif_no, teklif_tipi from teklifler order by id desc limit 3;"`

- [ ] **Step 6: Commit**

```bash
git add src/pages/TeklifDetay.jsx
git commit -m "feat(teklif): şablon seçici (Standart/Trassir/Karel) TeklifDetay formuna eklendi"
```

---

## Task 6: Teklifler listesinde tip badge'i

**Files:**
- Modify: `src/pages/Teklifler.jsx`

- [ ] **Step 1: Tip için renk haritası tanımla**

Liste tablosunda her satırın "Teklif No" hücresinin yanına küçük bir Badge eklenir (sadece `trassir` veya `karel` için; `standart` için boş — gürültü olmasın).

`Teklifler.jsx` içinde, mevcut `onayTone` map'ının altına ekle:

```js
const tipBadge = {
  trassir: { tone: 'lead', isim: 'Trassir' },
  karel:   { tone: 'aktif', isim: 'Karel' },
  // standart → render edilmez
}
```

- [ ] **Step 2: Tablo satırında render et**

Teklif satırının render edildiği yerde (Teklif No hücresi yakını), şu pattern'i uygula:

```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
  <CodeBadge>{teklif.teklifNo}</CodeBadge>
  {tipBadge[teklif.teklifTipi] && (
    <Badge tone={tipBadge[teklif.teklifTipi].tone}>
      {tipBadge[teklif.teklifTipi].isim}
    </Badge>
  )}
</div>
```

NOT: `Teklifler.jsx` içinde mevcut tablo render kodunu bul (Teklif No'nun render edildiği `<td>`/`<TD>`) ve oraya yerleştir.

- [ ] **Step 3: Smoke test**

`npm run dev` → `/teklifler` — Trassir kaydedilen teklif listede yanında "Trassir" badge'iyle görünmeli, eski (standart) kayıtlar değişmez.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Teklifler.jsx
git commit -m "feat(teklif): liste sayfasında şablon tipi badge'i (Trassir/Karel)"
```

---

## Task 7: Standart çıktıyı kendi component'ına çek (refactor)

**Files:**
- Create: `src/pages/teklifCikti/StandartCikti.jsx`
- Modify: `src/pages/TeklifYazdir.jsx`

- [ ] **Step 1: Klasörü oluştur**

```bash
mkdir -p src/pages/teklifCikti
```

- [ ] **Step 2: StandartCikti'yı oluştur**

Mevcut `TeklifYazdir.jsx`'ten render JSX'i + lokal hesaplamaları (kdvOranlari, araToplam, kdvToplam, genelToplam, paraSembol, fmt) yeni component'a taşı. Component sadece prop olarak `teklif` alır:

`src/pages/teklifCikti/StandartCikti.jsx`:

```jsx
// Standart teklif çıktısı — A4 dikey, tek sayfa, sade.
// (Eski TeklifYazdir.jsx'in birebir çıktısı; sadece component'a sarıldı.)

export default function StandartCikti({ teklif }) {
  const kdvOranlari = {}
  ;(teklif.satirlar || []).forEach((s) => {
    const kdv = s.kdv || 20
    const ara = s.miktar * s.birimFiyat
    const isk = ara * ((s.iskonto || 0) / 100)
    const kdvT = (ara - isk) * (kdv / 100)
    kdvOranlari[kdv] = (kdvOranlari[kdv] || 0) + kdvT
  })
  const araToplam = (teklif.satirlar || []).reduce((s, r) => {
    const ara = r.miktar * r.birimFiyat
    return s + ara - ara * ((r.iskonto || 0) / 100)
  }, 0)
  const kdvToplam = Object.values(kdvOranlari).reduce((a, b) => a + b, 0)
  const genelToplam = araToplam + kdvToplam
  const paraSembol = teklif.paraBirimi === 'USD' ? '$' : teklif.paraBirimi === 'EUR' ? '€' : '₺'
  const fmt = (n) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; }
        @media print {
          @page { size: A4; margin: 15mm 15mm 15mm 15mm; }
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .page { max-width: 860px; margin: 0 auto; padding: 32px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th, td { padding: 8px 10px; font-size: 12px; word-break: break-word; overflow-wrap: anywhere; vertical-align: top; }
        th { background: #f1f5f9; font-weight: 700; text-align: left; }
        tr:nth-child(even) { background: #f8fafc; }
        .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
      `}</style>

      <div className="page">
        {/* Başlık */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, paddingBottom: 20, borderBottom: '2px solid #0176D3' }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0176D3', letterSpacing: '-0.5px' }}>TEKLİF</h1>
            <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>{teklif.teklifNo}{teklif.revizyon > 0 ? ` — Rev.${teklif.revizyon}` : ''}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{teklif.firmaAdi}</p>
            {teklif.musteriYetkilisi && <p style={{ fontSize: 12, color: '#64748b' }}>{teklif.musteriYetkilisi}</p>}
          </div>
        </div>

        {/* (... mevcut TeklifYazdir.jsx'teki bilgi kartları, ürün tablosu, toplamlar, notlar, footer aynen taşınır ...) */}
      </div>
    </>
  )
}
```

NOT: Yukarıdaki kod `(...)` ile ihmal etti — tam JSX'i mevcut `TeklifYazdir.jsx` satır 75-184'ten birebir kopyala.

- [ ] **Step 3: TeklifYazdir.jsx'i refactor et**

`src/pages/TeklifYazdir.jsx`:

```jsx
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { teklifGetir } from '../services/teklifService'
import StandartCikti from './teklifCikti/StandartCikti'
// (TrassirCikti ve KarelCikti sonraki task'larda eklenecek)

export default function TeklifYazdir() {
  const { id } = useParams()
  const [teklif, setTeklif] = useState(null)

  useEffect(() => {
    teklifGetir(id).then((data) => {
      setTeklif(data)
      setTimeout(() => window.print(), 600)
    })
  }, [id])

  if (!teklif) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial' }}>Yükleniyor...</div>

  const tip = teklif.teklifTipi || 'standart'

  const Cikti = tip === 'standart' ? StandartCikti : StandartCikti  // trassir/karel sonra wired olacak

  return (
    <>
      {/* Yazdır + Excel butonları */}
      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 999 }}>
        <button onClick={() => window.print()} style={{ background: '#0176D3', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
          🖨 Yazdır / PDF
        </button>
        <button onClick={() => window.close()} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>
          ✕ Kapat
        </button>
      </div>

      <Cikti teklif={teklif} />
    </>
  )
}
```

- [ ] **Step 4: Smoke test**

`npm run dev` → mevcut bir teklifin `/teklifler/:id/yazdir` sayfasını aç. Çıktının önceki haliyle birebir aynı olduğunu doğrula (regresyon yok).

- [ ] **Step 5: Commit**

```bash
git add src/pages/teklifCikti/StandartCikti.jsx src/pages/TeklifYazdir.jsx
git commit -m "refactor(teklif): standart çıktı kendi component'ına çekildi"
```

---

## Task 8: TrassirCikti — PDF render component

**Files:**
- Create: `src/pages/teklifCikti/TrassirCikti.jsx`

- [ ] **Step 1: Component'ı yaz**

`src/pages/teklifCikti/TrassirCikti.jsx`:

```jsx
import { TRASSIR_KARSILAMA, ZNA_HAKKINDA, HIZMETLERIMIZ } from '../../lib/teklifTemplates'

export default function TrassirCikti({ teklif }) {
  const paraSembol = teklif.paraBirimi === 'USD' ? '$' : teklif.paraBirimi === 'EUR' ? '€' : '₺'
  const fmt = (n) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })

  const araToplam = (teklif.satirlar || []).reduce((s, r) => {
    const ara = r.miktar * r.birimFiyat
    return s + ara - ara * ((r.iskonto || 0) / 100)
  }, 0)
  const kdvToplam = (teklif.satirlar || []).reduce((s, r) => {
    const ara = r.miktar * r.birimFiyat
    const isk = ara * ((r.iskonto || 0) / 100)
    return s + (ara - isk) * ((r.kdv || 20) / 100)
  }, 0)
  const genelToplam = araToplam + kdvToplam

  const sayfaStil = {
    width: '210mm',
    minHeight: '297mm',
    pageBreakAfter: 'always',
    padding: '20mm',
    boxSizing: 'border-box',
    fontFamily: "'Segoe UI', Arial, sans-serif",
    color: '#1e293b',
    background: '#fff',
  }

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; }
          .trassir-page { padding: 20mm !important; }
        }
      `}</style>

      {/* Sayfa 1 — Kapak */}
      <div className="trassir-page" style={{ ...sayfaStil, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src="/teklif-assets/zna-cover.png" alt="ZNA Teknoloji"
          style={{ width: '100%', height: '297mm', objectFit: 'cover' }} />
      </div>

      {/* Sayfa 2 — Anlatı */}
      <div className="trassir-page" style={sayfaStil}>
        <h1 style={{ fontSize: 28, color: '#0176D3', fontWeight: 800, marginBottom: 24 }}>Fiyat Teklifi</h1>

        <p style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 20 }}>
          <strong>Sayın {teklif.firmaAdi}</strong>
          {'\n\n'}{TRASSIR_KARSILAMA}
        </p>

        <h2 style={{ fontSize: 18, color: '#0176D3', fontWeight: 700, marginTop: 24, marginBottom: 10 }}>ZNA Hakkında</h2>
        <p style={{ fontSize: 12, lineHeight: 1.7, textAlign: 'justify' }}>{ZNA_HAKKINDA}</p>

        <h2 style={{ fontSize: 18, color: '#0176D3', fontWeight: 700, marginTop: 24, marginBottom: 10 }}>Hizmetlerimiz</h2>
        <ul style={{ fontSize: 12, lineHeight: 1.9, paddingLeft: 20 }}>
          {HIZMETLERIMIZ.map(h => <li key={h}>{h}</li>)}
        </ul>
      </div>

      {/* Sayfa 3 — Fiyatlandırma */}
      <div className="trassir-page" style={sayfaStil}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 12 }}>
          <span><strong>Tarih :</strong> {teklif.tarih}</span>
          <span><strong>Hazırlayan :</strong> {teklif.hazirlayan || '—'}</span>
        </div>

        <h2 style={{ fontSize: 22, color: '#0176D3', fontWeight: 800, marginBottom: 16, textAlign: 'center' }}>Fiyatlandırma</h2>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#0176D3', color: '#fff' }}>
              <th style={{ padding: 8, textAlign: 'left', border: '1px solid #0176D3' }}>Marka</th>
              <th style={{ padding: 8, textAlign: 'left', border: '1px solid #0176D3' }}>Açıklama</th>
              <th style={{ padding: 8, textAlign: 'right', border: '1px solid #0176D3' }}>Ad./Mt.</th>
              <th style={{ padding: 8, textAlign: 'right', border: '1px solid #0176D3' }}>Birim Fiyat</th>
              <th style={{ padding: 8, textAlign: 'right', border: '1px solid #0176D3' }}>Toplam Fiyat</th>
            </tr>
          </thead>
          <tbody>
            {(teklif.satirlar || []).map((s, i) => {
              const ara = s.miktar * s.birimFiyat
              const isk = ara * ((s.iskonto || 0) / 100)
              const top = ara - isk
              return (
                <tr key={i}>
                  <td style={{ padding: 6, border: '1px solid #cbd5e1' }}>{s.marka || (s.stokKodu ? '—' : 'ZNA')}</td>
                  <td style={{ padding: 6, border: '1px solid #cbd5e1' }}>{s.stokAdi}</td>
                  <td style={{ padding: 6, border: '1px solid #cbd5e1', textAlign: 'right' }}>{s.miktar} {s.birim}</td>
                  <td style={{ padding: 6, border: '1px solid #cbd5e1', textAlign: 'right' }}>{paraSembol}{fmt(s.birimFiyat)}</td>
                  <td style={{ padding: 6, border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 600 }}>{paraSembol}{fmt(top)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <table style={{ fontSize: 13 }}>
            <tbody>
              <tr><td style={{ padding: 4, paddingRight: 16 }}>Ara Tutar :</td><td style={{ textAlign: 'right' }}>{paraSembol}{fmt(araToplam)}</td></tr>
              <tr><td style={{ padding: 4, paddingRight: 16 }}>Kdv % 20 :</td><td style={{ textAlign: 'right' }}>{paraSembol}{fmt(kdvToplam)}</td></tr>
              <tr style={{ fontWeight: 800, color: '#0176D3', borderTop: '2px solid #0176D3' }}>
                <td style={{ padding: 6, paddingRight: 16 }}>Genel Toplam :</td>
                <td style={{ textAlign: 'right', padding: 6 }}>{paraSembol}{fmt(genelToplam)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {teklif.aciklama && (
          <div style={{ marginTop: 24, fontSize: 12 }}>
            <strong>Açıklama : </strong>{teklif.aciklama}
          </div>
        )}
      </div>

      {/* Sayfa 4 — İş Ortaklarımız */}
      <div className="trassir-page" style={sayfaStil}>
        <h2 style={{ fontSize: 24, color: '#0176D3', fontWeight: 800, textAlign: 'center', marginBottom: 24 }}>İş Ortaklarımız</h2>
        <img src="/teklif-assets/is-ortaklari.png" alt="İş ortakları"
          style={{ width: '100%', objectFit: 'contain' }} />
      </div>

      {/* Sayfa 5 — Referanslar */}
      <div className="trassir-page" style={{ ...sayfaStil, pageBreakAfter: 'auto' }}>
        <h2 style={{ fontSize: 24, color: '#0176D3', fontWeight: 800, textAlign: 'center', marginBottom: 24 }}>Bazı Referanslarımız</h2>
        <img src="/teklif-assets/referanslar.png" alt="Referanslar"
          style={{ width: '100%', objectFit: 'contain' }} />
      </div>
    </>
  )
}
```

NOT: `s.marka` alanı `satirlar` JSON'unda yok — opsiyonel. `stokKodu` varsa marka boş, hizmet kalemiyse 'ZNA' fallback. İleride stok modeline `marka` alanı eklenirse otomatik dolar.

- [ ] **Step 2: Smoke test (yalnız component, henüz wire edilmedi)**

Bu task tek başına test edilemez — Task 10'da TeklifYazdir wire'lanır. Geçici test: `TeklifYazdir.jsx`'in `Cikti` seçim satırını şöyle değiştirip test et:

```js
const Cikti = tip === 'standart' ? StandartCikti : (tip === 'trassir' ? TrassirCikti : StandartCikti)
```

ve üstteki import'a `TrassirCikti`'yi ekle. Bir Trassir tipinde teklifin `/yazdir` sayfasını aç, 5 sayfalık görünümü doğrula.

- [ ] **Step 3: Commit**

```bash
git add src/pages/teklifCikti/TrassirCikti.jsx
git commit -m "feat(teklif): Trassir çıktı bileşeni (5 sayfa A4 dikey, kapak/anlatı/fiyat/iş ortakları/referanslar)"
```

---

## Task 9: KarelCikti — PDF render component

**Files:**
- Create: `src/pages/teklifCikti/KarelCikti.jsx`

- [ ] **Step 1: Component'ı yaz**

`src/pages/teklifCikti/KarelCikti.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { ZNA_FIRMA } from '../../lib/teklifTemplates'
import { musterileriGetir } from '../../services/musteriService'

export default function KarelCikti({ teklif }) {
  const [musteri, setMusteri] = useState(null)

  useEffect(() => {
    musterileriGetir().then(list => {
      // teklif.firmaAdi'na string olarak match et
      const m = (list || []).find(x => x.firma === teklif.firmaAdi)
      setMusteri(m || null)
    })
  }, [teklif.firmaAdi])

  const paraSembol = teklif.paraBirimi === 'USD' ? '$' : teklif.paraBirimi === 'EUR' ? '€' : '₺'
  const fmt = (n) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })

  const araToplam = (teklif.satirlar || []).reduce((s, r) => {
    const ara = r.miktar * r.birimFiyat
    return s + ara - ara * ((r.iskonto || 0) / 100)
  }, 0)
  const kdvToplam = (teklif.satirlar || []).reduce((s, r) => {
    const ara = r.miktar * r.birimFiyat
    const isk = ara * ((r.iskonto || 0) / 100)
    return s + (ara - isk) * ((r.kdv || 20) / 100)
  }, 0)
  const genelToplam = araToplam + kdvToplam

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; }
        }
      `}</style>

      <div style={{
        width: '297mm',
        minHeight: '210mm',
        padding: '10mm',
        boxSizing: 'border-box',
        fontFamily: "'Segoe UI', Arial, sans-serif",
        color: '#1e293b',
        background: '#fff',
        fontSize: 11,
      }}>
        {/* Üst banner — iki logo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <img src="/teklif-assets/zna-logo.jpg" alt="ZNA Teknoloji" style={{ height: 64, objectFit: 'contain' }} />
          <img src="/teklif-assets/karel-is-ortagi.png" alt="Karel İş Ortağı" style={{ height: 56, objectFit: 'contain' }} />
        </div>

        {/* Üst başlık — firma bilgisi tek satır */}
        <div style={{ background: '#1e3a8a', color: '#fff', padding: '6px 10px', fontSize: 10, fontWeight: 600, marginBottom: 10, textAlign: 'center' }}>
          UNVAN: {ZNA_FIRMA.unvan} &nbsp;&nbsp; ADRES: {ZNA_FIRMA.adres} &nbsp;&nbsp; TEL/FAX: {ZNA_FIRMA.telFax}
        </div>

        {/* Bilgi grid'i */}
        <table style={{ width: '100%', fontSize: 11, marginBottom: 10, borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ padding: 4, width: '14%', fontWeight: 600 }}>Sayın :</td>
              <td style={{ padding: 4, width: '36%' }}>{teklif.firmaAdi}</td>
              <td style={{ padding: 4, width: '14%', fontWeight: 600 }}>Tarih:</td>
              <td style={{ padding: 4, width: '36%' }}>{teklif.tarih}</td>
            </tr>
            <tr>
              <td style={{ padding: 4, fontWeight: 600 }}>Tel :</td>
              <td style={{ padding: 4 }}>{musteri?.telefon || ''}</td>
              <td style={{ padding: 4, fontWeight: 600 }}>Evrak No:</td>
              <td style={{ padding: 4 }}>{teklif.teklifNo}</td>
            </tr>
            <tr>
              <td style={{ padding: 4, fontWeight: 600 }}>Konu :</td>
              <td style={{ padding: 4 }}>{teklif.konu}</td>
              <td style={{ padding: 4, fontWeight: 600 }}>Hazırlayan:</td>
              <td style={{ padding: 4 }}>{teklif.hazirlayan || '—'}</td>
            </tr>
          </tbody>
        </table>

        {/* Başlık */}
        <h2 style={{ fontSize: 16, fontWeight: 800, textAlign: 'center', margin: '8px 0', letterSpacing: '0.5px' }}>FİYAT TEKLİFİ</h2>

        {/* Tablo */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 8 }}>
          <thead>
            <tr style={{ background: '#1e3a8a', color: '#fff' }}>
              <th style={{ padding: 6, border: '1px solid #1e3a8a', textAlign: 'left' }}>Marka</th>
              <th style={{ padding: 6, border: '1px solid #1e3a8a', textAlign: 'left' }}>Açıklama</th>
              <th style={{ padding: 6, border: '1px solid #1e3a8a', textAlign: 'right' }}>Miktar</th>
              <th style={{ padding: 6, border: '1px solid #1e3a8a', textAlign: 'left' }}>Birim</th>
              <th style={{ padding: 6, border: '1px solid #1e3a8a', textAlign: 'right' }}>Birim Fiyat</th>
              <th style={{ padding: 6, border: '1px solid #1e3a8a', textAlign: 'right' }}>Toplam Fiyat</th>
            </tr>
          </thead>
          <tbody>
            {(teklif.satirlar || []).map((s, i) => {
              const ara = s.miktar * s.birimFiyat
              const isk = ara * ((s.iskonto || 0) / 100)
              const top = ara - isk
              return (
                <tr key={i}>
                  <td style={{ padding: 5, border: '1px solid #cbd5e1' }}>{s.marka || (s.stokKodu ? '—' : 'ZNA')}</td>
                  <td style={{ padding: 5, border: '1px solid #cbd5e1' }}>{s.stokAdi}</td>
                  <td style={{ padding: 5, border: '1px solid #cbd5e1', textAlign: 'right' }}>{s.miktar}</td>
                  <td style={{ padding: 5, border: '1px solid #cbd5e1' }}>{s.birim}</td>
                  <td style={{ padding: 5, border: '1px solid #cbd5e1', textAlign: 'right' }}>{paraSembol}{fmt(s.birimFiyat)}</td>
                  <td style={{ padding: 5, border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 600 }}>{paraSembol}{fmt(top)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Alt: Not + Toplamlar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, gap: 16 }}>
          <div style={{ flex: 1, fontSize: 11 }}>
            {teklif.aciklama && (<><strong>Not:</strong> {teklif.aciklama}</>)}
          </div>
          <table style={{ fontSize: 12 }}>
            <tbody>
              <tr><td style={{ padding: 3, paddingRight: 12 }}>Toplam :</td><td style={{ textAlign: 'right' }}>{paraSembol}{fmt(araToplam)}</td></tr>
              <tr><td style={{ padding: 3, paddingRight: 12 }}>KDV (%20) :</td><td style={{ textAlign: 'right' }}>{paraSembol}{fmt(kdvToplam)}</td></tr>
              <tr style={{ fontWeight: 800, borderTop: '2px solid #1e3a8a' }}>
                <td style={{ padding: 4, paddingRight: 12 }}>Genel Toplam :</td>
                <td style={{ textAlign: 'right', padding: 4 }}>{paraSembol}{fmt(genelToplam)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/teklifCikti/KarelCikti.jsx
git commit -m "feat(teklif): Karel çıktı bileşeni (tek sayfa A4 yatay, mektup formatı)"
```

---

## Task 10: TeklifYazdir router — tipe göre seçim + Excel butonu

**Files:**
- Modify: `src/pages/TeklifYazdir.jsx`

- [ ] **Step 1: Tüm component'ları wire et**

`src/pages/TeklifYazdir.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { teklifGetir } from '../services/teklifService'
import StandartCikti from './teklifCikti/StandartCikti'
import TrassirCikti from './teklifCikti/TrassirCikti'
import KarelCikti from './teklifCikti/KarelCikti'
import { teklifiExcelOlarakIndir } from '../lib/teklifExport'

const ciktiMap = {
  standart: StandartCikti,
  trassir: TrassirCikti,
  karel: KarelCikti,
}

export default function TeklifYazdir() {
  const { id } = useParams()
  const [teklif, setTeklif] = useState(null)
  const [excelYukleniyor, setExcelYukleniyor] = useState(false)

  useEffect(() => {
    teklifGetir(id).then((data) => {
      setTeklif(data)
      setTimeout(() => window.print(), 600)
    })
  }, [id])

  if (!teklif) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial' }}>Yükleniyor...</div>

  const tip = teklif.teklifTipi || 'standart'
  const Cikti = ciktiMap[tip] || StandartCikti

  const excelIndir = async () => {
    setExcelYukleniyor(true)
    try {
      await teklifiExcelOlarakIndir(teklif)
    } catch (err) {
      console.error('[Excel indir]', err)
      alert('Excel üretilirken hata: ' + err.message)
    } finally {
      setExcelYukleniyor(false)
    }
  }

  return (
    <>
      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 999 }}>
        <button onClick={() => window.print()} style={{ background: '#0176D3', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
          🖨 Yazdır / PDF
        </button>
        <button onClick={excelIndir} disabled={excelYukleniyor} style={{ background: '#0d9f6e', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontWeight: 600, opacity: excelYukleniyor ? 0.6 : 1 }}>
          {excelYukleniyor ? 'Hazırlanıyor…' : '📊 Excel İndir'}
        </button>
        <button onClick={() => window.close()} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>
          ✕ Kapat
        </button>
      </div>

      <Cikti teklif={teklif} />
    </>
  )
}
```

- [ ] **Step 2: Smoke test (yalnız PDF)**

`npm run dev`. Excel butonu Task 11-12'de gerçekleştirilene kadar hata verecek (`teklifExport` modülü henüz yok); PDF tarafını test et:
1. Standart teklif → eski çıktıyla aynı
2. Trassir teklifi → 5 sayfa
3. Karel teklifi → tek sayfa yatay

NOT: Excel butonu bu adımda hata verecek; Task 11 ekledikten sonra çalışacak.

- [ ] **Step 3: Commit**

```bash
git add src/pages/TeklifYazdir.jsx
git commit -m "feat(teklif): yazdir sayfası tipe göre çıktı seçer + Excel butonu"
```

---

## Task 11: Excel export utility'leri

**Files:**
- Create: `src/lib/teklifExport/index.js`
- Create: `src/lib/teklifExport/standartExcel.js`
- Create: `src/lib/teklifExport/trassirExcel.js`
- Create: `src/lib/teklifExport/karelExcel.js`

- [ ] **Step 1: Klasör + dispatch index.js**

```bash
mkdir -p src/lib/teklifExport
```

`src/lib/teklifExport/index.js`:

```js
// Tipe göre Excel üreticisini lazy-load eder, blob'u file-saver ile kaydeder.

export async function teklifiExcelOlarakIndir(teklif) {
  const tip = teklif.teklifTipi || 'standart'
  const { saveAs } = await import('file-saver')

  let blob
  if (tip === 'trassir') {
    const { trassirExcelOlustur } = await import('./trassirExcel')
    blob = await trassirExcelOlustur(teklif)
  } else if (tip === 'karel') {
    const { karelExcelOlustur } = await import('./karelExcel')
    blob = await karelExcelOlustur(teklif)
  } else {
    const { standartExcelOlustur } = await import('./standartExcel')
    blob = await standartExcelOlustur(teklif)
  }

  const dosyaAdi = `Teklif_${teklif.teklifNo || teklif.id}_${tip}.xlsx`
  saveAs(blob, dosyaAdi)
}

// Yardımcı: public/teklif-assets/...'tan görseli ArrayBuffer olarak çek
export async function gorseliCek(yol) {
  const res = await fetch(yol)
  if (!res.ok) throw new Error(`Görsel yüklenemedi: ${yol} (${res.status})`)
  return await res.arrayBuffer()
}
```

- [ ] **Step 2: standartExcel.js — basit fallback**

`src/lib/teklifExport/standartExcel.js`:

```js
import ExcelJS from 'exceljs'

export async function standartExcelOlustur(teklif) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Teklif')

  ws.columns = [
    { header: '#', width: 5 },
    { header: 'Ürün/Hizmet', width: 40 },
    { header: 'Miktar', width: 10 },
    { header: 'Birim', width: 10 },
    { header: 'Birim Fiyat', width: 14 },
    { header: 'İsk%', width: 8 },
    { header: 'KDV%', width: 8 },
    { header: 'Toplam', width: 14 },
  ]

  ws.mergeCells('A1:H1')
  const baslik = ws.getCell('A1')
  baslik.value = `TEKLİF — ${teklif.teklifNo}  (${teklif.firmaAdi})`
  baslik.font = { size: 16, bold: true, color: { argb: 'FF0176D3' } }
  baslik.alignment = { horizontal: 'center' }

  ws.addRow([])
  ws.addRow(['Tarih', teklif.tarih, 'Hazırlayan', teklif.hazirlayan || ''])
  ws.addRow(['Konu', teklif.konu])
  ws.addRow([])

  const headerRow = ws.addRow(['#', 'Ürün/Hizmet', 'Miktar', 'Birim', 'Birim Fiyat', 'İsk%', 'KDV%', 'Toplam'])
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }

  let araToplam = 0
  let kdvToplam = 0
  ;(teklif.satirlar || []).forEach((s, i) => {
    const ara = s.miktar * s.birimFiyat
    const isk = ara * ((s.iskonto || 0) / 100)
    const kdvT = (ara - isk) * ((s.kdv || 20) / 100)
    const top = ara - isk + kdvT
    araToplam += ara - isk
    kdvToplam += kdvT
    ws.addRow([i + 1, s.stokAdi, s.miktar, s.birim, s.birimFiyat, s.iskonto || 0, s.kdv || 20, top])
  })

  ws.addRow([])
  ws.addRow(['', '', '', '', '', '', 'Ara Toplam', araToplam]).font = { italic: true }
  ws.addRow(['', '', '', '', '', '', 'KDV Toplam', kdvToplam]).font = { italic: true }
  const gtRow = ws.addRow(['', '', '', '', '', '', 'GENEL TOPLAM', araToplam + kdvToplam])
  gtRow.font = { bold: true, size: 12, color: { argb: 'FF0176D3' } }

  if (teklif.aciklama) {
    ws.addRow([])
    ws.addRow(['Açıklama:', teklif.aciklama])
  }

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
```

- [ ] **Step 3: trassirExcel.js**

`src/lib/teklifExport/trassirExcel.js`:

```js
import ExcelJS from 'exceljs'
import { TRASSIR_KARSILAMA, ZNA_HAKKINDA, HIZMETLERIMIZ } from '../teklifTemplates'
import { gorseliCek } from './index'

export async function trassirExcelOlustur(teklif) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Teklif', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 } })

  // Trassir kapak görselini ekle (sayfa 1)
  const kapakBuf = await gorseliCek('/teklif-assets/zna-cover.png')
  const kapakImgId = wb.addImage({ buffer: kapakBuf, extension: 'png' })
  ws.addImage(kapakImgId, { tl: { col: 0, row: 0 }, ext: { width: 600, height: 800 } })

  // Sayfa 1'i bitir
  for (let i = 0; i < 30; i++) ws.addRow([])
  ws.getRow(31).addPageBreak = true

  // Sayfa 2 — Anlatı
  let row = ws.addRow(['Fiyat Teklifi'])
  row.font = { size: 22, bold: true, color: { argb: 'FF0176D3' } }
  ws.addRow([])

  row = ws.addRow([`Sayın ${teklif.firmaAdi}`])
  row.font = { bold: true }
  ws.addRow([])
  row = ws.addRow([TRASSIR_KARSILAMA])
  row.alignment = { wrapText: true, vertical: 'top' }
  ws.getRow(row.number).height = 100

  ws.addRow([])
  row = ws.addRow(['ZNA Hakkında'])
  row.font = { size: 14, bold: true, color: { argb: 'FF0176D3' } }
  row = ws.addRow([ZNA_HAKKINDA])
  row.alignment = { wrapText: true, vertical: 'top' }
  ws.getRow(row.number).height = 120

  ws.addRow([])
  row = ws.addRow(['Hizmetlerimiz'])
  row.font = { size: 14, bold: true, color: { argb: 'FF0176D3' } }
  HIZMETLERIMIZ.forEach(h => ws.addRow([`• ${h}`]))

  ws.lastRow.addPageBreak = true

  // Sayfa 3 — Fiyatlandırma
  ws.addRow([`Tarih : ${teklif.tarih}`, '', '', '', `Hazırlayan : ${teklif.hazirlayan || '—'}`])
  ws.addRow([])
  row = ws.addRow(['Fiyatlandırma'])
  row.font = { size: 18, bold: true, color: { argb: 'FF0176D3' } }
  ws.addRow([])

  const headerRow = ws.addRow(['Marka', 'Açıklama', 'Ad./Mt.', 'Birim Fiyat', 'Toplam Fiyat'])
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0176D3' } }
  headerRow.eachCell(c => c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } })

  const paraSembol = teklif.paraBirimi === 'USD' ? '$' : teklif.paraBirimi === 'EUR' ? '€' : '₺'
  let araToplam = 0
  ;(teklif.satirlar || []).forEach(s => {
    const ara = s.miktar * s.birimFiyat
    const isk = ara * ((s.iskonto || 0) / 100)
    const top = ara - isk
    araToplam += top
    const r = ws.addRow([
      s.marka || (s.stokKodu ? '—' : 'ZNA'),
      s.stokAdi,
      `${s.miktar} ${s.birim}`,
      `${paraSembol}${s.birimFiyat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
      `${paraSembol}${top.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
    ])
    r.eachCell(c => c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } })
  })

  const kdvToplam = araToplam * 0.20
  ws.addRow([])
  ws.addRow(['', '', '', 'Ara Tutar :', `${paraSembol}${araToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`])
  ws.addRow(['', '', '', 'Kdv % 20 :', `${paraSembol}${kdvToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`])
  row = ws.addRow(['', '', '', 'Genel Toplam :', `${paraSembol}${(araToplam + kdvToplam).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`])
  row.font = { bold: true, color: { argb: 'FF0176D3' } }

  if (teklif.aciklama) {
    ws.addRow([])
    ws.addRow([`Açıklama : ${teklif.aciklama}`])
  }
  ws.lastRow.addPageBreak = true

  // Sayfa 4 — İş Ortakları
  row = ws.addRow(['İş Ortaklarımız'])
  row.font = { size: 18, bold: true, color: { argb: 'FF0176D3' } }
  const ortakBuf = await gorseliCek('/teklif-assets/is-ortaklari.png')
  const ortakImgId = wb.addImage({ buffer: ortakBuf, extension: 'png' })
  const ortakStartRow = ws.lastRow.number + 1
  for (let i = 0; i < 25; i++) ws.addRow([])
  ws.addImage(ortakImgId, { tl: { col: 0, row: ortakStartRow }, ext: { width: 700, height: 500 } })
  ws.lastRow.addPageBreak = true

  // Sayfa 5 — Referanslar
  row = ws.addRow(['Bazı Referanslarımız'])
  row.font = { size: 18, bold: true, color: { argb: 'FF0176D3' } }
  const refBuf = await gorseliCek('/teklif-assets/referanslar.png')
  const refImgId = wb.addImage({ buffer: refBuf, extension: 'png' })
  const refStartRow = ws.lastRow.number + 1
  for (let i = 0; i < 25; i++) ws.addRow([])
  ws.addImage(refImgId, { tl: { col: 0, row: refStartRow }, ext: { width: 700, height: 500 } })

  // Kolon genişlikleri
  ws.columns = [
    { width: 12 }, { width: 35 }, { width: 12 }, { width: 16 }, { width: 18 },
  ]

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
```

- [ ] **Step 4: karelExcel.js**

`src/lib/teklifExport/karelExcel.js`:

```js
import ExcelJS from 'exceljs'
import { ZNA_FIRMA } from '../teklifTemplates'
import { gorseliCek } from './index'
import { supabase } from '../supabase'

async function musteriTelefonGetir(firmaAdi) {
  if (!firmaAdi) return ''
  const { data } = await supabase.from('musteriler').select('telefon').eq('firma', firmaAdi).limit(1).maybeSingle()
  return data?.telefon || ''
}

export async function karelExcelOlustur(teklif) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Teklif', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 } })

  ws.columns = [
    { width: 4 }, { width: 8 }, { width: 6 }, { width: 16 }, { width: 32 },
    { width: 1 }, { width: 8 }, { width: 4 }, { width: 4 }, { width: 4 },
    { width: 5 }, { width: 4 }, { width: 12 }, { width: 2 }, { width: 14 },
    { width: 2 }, { width: 14 }, { width: 1 }, { width: 1 },
  ]

  // Sıra 1 — Logolar
  ws.getRow(1).height = 60
  const znaLogoBuf = await gorseliCek('/teklif-assets/zna-logo.jpg')
  const znaLogoId = wb.addImage({ buffer: znaLogoBuf, extension: 'jpeg' })
  ws.addImage(znaLogoId, { tl: { col: 1, row: 0 }, ext: { width: 220, height: 70 } })

  const karelLogoBuf = await gorseliCek('/teklif-assets/karel-is-ortagi.png')
  const karelLogoId = wb.addImage({ buffer: karelLogoBuf, extension: 'png' })
  ws.addImage(karelLogoId, { tl: { col: 12, row: 0 }, ext: { width: 200, height: 70 } })

  // Sıra 2 — Firma bilgi banner
  ws.mergeCells('A2:S2')
  const banner = ws.getCell('A2')
  banner.value = `UNVAN: ${ZNA_FIRMA.unvan}   ADRES: ${ZNA_FIRMA.adres}   TEL/FAX: ${ZNA_FIRMA.telFax}`
  banner.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
  banner.alignment = { horizontal: 'center', vertical: 'middle' }
  banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
  ws.getRow(2).height = 22

  // Bilgi grid'i (sıra 5-7)
  const tel = await musteriTelefonGetir(teklif.firmaAdi)
  ws.addRow([])
  ws.addRow([])
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : ''
  ws.getRow(5).values = ['', 'Sayın :', '', teklif.firmaAdi, '', '', '', '', '', 'Tarih:', '', '', fmtDate(teklif.tarih)]
  ws.getRow(6).values = ['', 'Tel :',   '', tel,            '', '', '', '', '', 'Evrak No:', '', '', teklif.teklifNo]
  ws.getRow(7).values = ['', 'Konu :',  '', teklif.konu,    '', '', '', '', '', 'Hazırlayan:','', '', teklif.hazirlayan || '']

  ;[5, 6, 7].forEach(r => {
    ws.getRow(r).getCell(2).font = { bold: true }
    ws.getRow(r).getCell(10).font = { bold: true }
  })

  ws.addRow([])
  // Başlık (sıra 9)
  ws.mergeCells('A9:S9')
  const baslik = ws.getCell('A9')
  baslik.value = 'FİYAT TEKLİFİ'
  baslik.font = { size: 14, bold: true }
  baslik.alignment = { horizontal: 'center' }

  // Tablo başlığı (sıra 10)
  const headerRow = ws.getRow(10)
  headerRow.values = ['', 'Marka', '', 'Açıklama', '', '', '', '', '', '', 'Miktar', '', 'Birim', '', 'Birim Fiyat', '', 'Toplam Fiyat']
  ws.mergeCells('B10:C10')
  ws.mergeCells('D10:I10')  // Açıklama geniş
  ws.mergeCells('K10:L10')  // Miktar
  ws.mergeCells('M10:N10')  // Birim
  ws.mergeCells('O10:P10')  // Birim fiyat
  ;[2, 4, 11, 13, 15, 17].forEach(c => {
    headerRow.getCell(c).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
    headerRow.getCell(c).alignment = { horizontal: c === 4 ? 'left' : 'center' }
  })

  const paraSembol = teklif.paraBirimi === 'USD' ? '$' : teklif.paraBirimi === 'EUR' ? '€' : '₺'
  let araToplam = 0
  let satirNo = 11
  ;(teklif.satirlar || []).forEach(s => {
    const ara = s.miktar * s.birimFiyat
    const isk = ara * ((s.iskonto || 0) / 100)
    const top = ara - isk
    araToplam += top
    const r = ws.getRow(satirNo)
    r.values = ['', s.marka || (s.stokKodu ? '—' : 'ZNA'), '', s.stokAdi, '', '', '', '', '', '', s.miktar, '', s.birim, '', `${paraSembol}${s.birimFiyat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, '', `${paraSembol}${top.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`]
    ws.mergeCells(`B${satirNo}:C${satirNo}`)
    ws.mergeCells(`D${satirNo}:I${satirNo}`)
    ws.mergeCells(`K${satirNo}:L${satirNo}`)
    ws.mergeCells(`M${satirNo}:N${satirNo}`)
    ws.mergeCells(`O${satirNo}:P${satirNo}`)
    satirNo++
  })

  // Toplamlar (sağ alt)
  satirNo += 1
  const kdvToplam = araToplam * 0.20
  ws.getCell(`O${satirNo}`).value = 'Toplam :'
  ws.getCell(`Q${satirNo}`).value = `${paraSembol}${araToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
  satirNo++
  ws.getCell(`O${satirNo}`).value = 'KDV (%20) :'
  ws.getCell(`Q${satirNo}`).value = `${paraSembol}${kdvToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
  satirNo++
  ws.getCell(`O${satirNo}`).value = 'Genel Toplam :'
  ws.getCell(`Q${satirNo}`).value = `${paraSembol}${(araToplam + kdvToplam).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
  ws.getRow(satirNo).font = { bold: true }

  if (teklif.aciklama) {
    satirNo += 2
    ws.getCell(`B${satirNo}`).value = `Not: ${teklif.aciklama}`
  }

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
```

- [ ] **Step 5: Smoke test**

`npm run dev`. Trassir tipi bir teklifin yazdir sayfasında "Excel İndir" → 5-bölümlü .xlsx indirilir. Karel tipinde → tek-sheet landscape .xlsx indirilir. Standart → basit .xlsx.

Doğrulama:
- Excel'i Office'te aç → görseller görünüyor (Trassir kapak/iş ortakları/referanslar; Karel iki logo)
- Sayfa kırılmaları doğru yerlerde (yazdır önizleme)
- Para birimi sembolü doğru
- Genel Toplam ekrandaki PDF ile eşleşiyor

- [ ] **Step 6: Commit**

```bash
git add src/lib/teklifExport/
git commit -m "feat(teklif): exceljs ile Excel export (standart/Trassir/Karel)"
```

---

## Task 12: Final entegrasyon testi + deploy

- [ ] **Step 1: Tüm uçtan-uca akışı test et**

Tarayıcıda (`npm run dev`):

1. **Yeni Trassir teklifi**:
   - `/teklifler/yeni` → "Trassir" şablonunu seç
   - Müşteri seç, ürün satırı ekle, kaydet
   - Listeye dön → "Trassir" badge görünür
   - Detay'a tekrar gir → "Trassir" seçili kalmış
   - Yazdır sayfasını aç → 5 sayfa A4 dikey görünüyor (kapak + anlatı + fiyat + iş ortakları + referanslar)
   - "Excel İndir" → .xlsx dosyası inmeli, açıldığında orijinal şablona benzer

2. **Yeni Karel teklifi**:
   - "Karel" şablonu seç, müşteri + ürün, kaydet
   - Yazdır → tek sayfa A4 yatay, iki logo header, info grid, tablo, totals
   - Excel İndir → tek-sheet landscape .xlsx

3. **Eski (standart) teklif**:
   - Migration öncesi mevcut bir teklifi aç → "Standart" seçili görünür (default)
   - Yazdır → eski çıktıyla birebir aynı (regresyon yok)

4. **Tip değiştir**:
   - Mevcut "Standart" bir teklifi "Trassir"a çevir, kaydet → yazdırırken Trassir çıktısı

5. **Para birimi USD**:
   - Trassir teklifinde para birimi USD seç → tabloda `$` sembolü hem PDF'te hem Excel'de doğru

- [ ] **Step 2: Lint + build**

```bash
npm run lint
npm run build
```

Beklenen: hatasız build, dist/ üretilir.

- [ ] **Step 3: Final commit + push**

```bash
git status  # temiz olmalı
git log --oneline -10
```

Branch'i ana repo'ya push (worktree workflow):

```bash
git push origin HEAD
```

User Vercel auto-deploy ile yayına alır. Test kullanıcılarıyla doğrulama yapar; revize gerekirse yeni iterasyon.

---

## Self-Review Sonuçları

**Spec coverage:**
- ✅ Veri modeli (`teklif_tipi` kolonu) → Task 1
- ✅ TeklifDetay segmented control → Task 5
- ✅ Teklifler liste tip badge → Task 6
- ✅ Standart çıktı refactor → Task 7
- ✅ Trassir PDF → Task 8
- ✅ Karel PDF → Task 9
- ✅ TeklifYazdir router + Excel butonu → Task 10
- ✅ Excel exporters → Task 11
- ✅ Sabit metinler dosyası → Task 2
- ✅ Görsel varlıklar → Task 3
- ✅ Yeni dependencies → Task 4

**Placeholder taraması:** Task 7 Step 2'de "(... mevcut JSX'i birebir kopyala ...)" yer alıyor — bu reasonable, çünkü `TeklifYazdir.jsx` zaten okundu ve component'a sarılması mekanik bir iş. Engineer dosyayı okur, kopyalar.

**Type tutarlılığı:** `teklif.teklifTipi` her component'ta aynı isimle kullanıldı; mapper otomatik `teklif_tipi` ↔ `teklifTipi` dönüşümü yapar. `gorseliCek` import'u trassirExcel.js ve karelExcel.js'te aynı path'ten (`./index`) çekildi.

**Bilinen noktalar:**
- Karel telefon lookup'ı KarelCikti'da `musterileriGetir()` ile (frontend), Excel'de `supabase` direct query ile (backend). Bu kasıtlı: PDF render'ında veri zaten yüklü, Excel async fonksiyon olduğu için doğrudan query daha hızlı.
- `s.marka` alanı stok modelinde yok — `'—'` veya `'ZNA'` fallback'i kullanılıyor. İleride stok'a marka kolonu eklenirse otomatik dolar.
