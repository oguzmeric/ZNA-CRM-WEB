# Görüşme → Görev → Servis Talebi Akışı

**Tarih:** 2026-05-04
**Bağlam:** Satışçı görüşmeden bir görev çıkartabilmeli, görev opsiyonel olarak bir servis talebine bağlanabilmeli. Tüm kayıtlar arasında izlenebilir bağlantı kurulmalı.

## Hedef

Mevcut izole modüller (görüşme, görev, servis talebi) arasında veri akışı kurulur:

1. **Görüşme detay → Görev oluştur** (mevcut, genişletilir)
2. **Görev formu → opsiyonel "+ Servis talebi de oluştur" toggle**
3. **Bağlantılar 2 yönlü** — her kayıttan diğerlerine ulaşılır
4. **Mobile + Web** paralel çalışır

## DB Migration — `028_gorev_iliskileri.sql`

```sql
-- Görevler tablosuna görüşme + servis talebi referansları
alter table gorevler
  add column if not exists gorusme_id bigint
    references gorusmeler(id) on delete set null,
  add column if not exists servis_talep_id bigint
    references servis_talepleri(id) on delete set null;

-- Servis talepleri tablosuna görev + görüşme referansları
alter table servis_talepleri
  add column if not exists gorev_id bigint
    references gorevler(id) on delete set null,
  add column if not exists gorusme_id bigint
    references gorusmeler(id) on delete set null;

create index if not exists idx_gorevler_gorusme on gorevler(gorusme_id);
create index if not exists idx_gorevler_servis on gorevler(servis_talep_id);
create index if not exists idx_servis_gorev on servis_talepleri(gorev_id);
create index if not exists idx_servis_gorusme on servis_talepleri(gorusme_id);

notify pgrst, 'reload schema';
```

Tüm FK'ler nullable. Mevcut kayıtlar etkilenmez. Cascade yerine `set null` — silme durumunda referans kaybolur ama veriler durur.

## Web — Görüşme Detayında Görev Modal'ı

`src/pages/GorusmeDetay.jsx` mevcut görev modal'ı genişletilir:

**Mevcut alanlar:** baslik, aciklama, atanan, oncelik, sonTarih
**Eklenecekler:**
- `lokasyonId` — müşterinin lokasyonu varsa dropdown (Görüşmeler.jsx'teki pattern'le)
- `servisTalepiOlustur` (boolean state) — toggle
- `gorusmeId` — kaydederken otomatik set

Kaydet akışı:
1. Görev kaydedilir, `gorusme_id` set edilir
2. Toggle ON ise: aynı anda servis talebi oluşturulur (alanlar görev'den kopyalanır)
3. İkisi `gorev_id` ↔ `servis_talep_id` ile bağlanır
4. Kullanıcı **servis talebi detay sayfasına** yönlendirilir (düzenleme için)
5. Toggle OFF ise: sadece görev kaydedilir, modal kapanır, görüşme detayında kalır

## Web — Görevler Sayfası Formu

`src/pages/Gorevler.jsx` yeni görev formuna aynı toggle eklenir:

```jsx
{form.musteriId && (
  <div>
    <label>
      <input
        type="checkbox"
        checked={form.servisTalebiOlustur || false}
        onChange={e => setForm({ ...form, servisTalebiOlustur: e.target.checked })}
      />
      Aynı anda servis talebi de oluştur
    </label>
  </div>
)}
```

Kaydet akışı: Görüşme detay'dakiyle aynı.

## Web — Görev Detay Sayfası (`GorevDetay.jsx`)

"Bağlantılar" bölümü eklenir:

- `gorev.gorusmeId` varsa → "← Görüşmeden oluşturuldu" linki
- `gorev.servisTalepId` varsa → "Bağlı servis talebi" linki
- `servisTalepId` yoksa ve müşteri varsa → **"Servis talebine dönüştür"** butonu (sonradan link kurma seçeneği)

Bu sayede A akışı (toggle) + B akışı (sonradan dönüştür) birlikte var.

## Yeni servis ortak yardımcı: `gorevdenServisTalebiOlustur(gorev)`

`src/services/servisTalepService.js`'e yeni fonksiyon:

```js
export const gorevdenServisTalebiOlustur = async (gorev, kullanici) => {
  // Lokasyon adını çek (varsa)
  let lokasyonMetni = ''
  if (gorev.lokasyonId) {
    const { data: lok } = await supabase
      .from('musteri_lokasyonlari')
      .select('ad')
      .eq('id', gorev.lokasyonId)
      .single()
    lokasyonMetni = lok?.ad || ''
  }

  const yeni = {
    talepNo: ...,           // mevcut numaralandırma mantığı
    musteriId: gorev.musteriId,
    firmaAdi: gorev.firmaAdi,
    konu: gorev.baslik,
    aciklama: gorev.aciklama || '',
    aciliyet: 'normal',
    anaTur: 'ariza',         // kullanıcı sonra değiştirir
    altKategori: '',         // kullanıcı seçer
    lokasyon: lokasyonMetni,
    durum: 'yeni',
    atananKullaniciId: gorev.atananId || null,
    olusturanKullaniciId: kullanici.id,
    gorevId: gorev.id,
    gorusmeId: gorev.gorusmeId || null,
  }

  const eklenen = await servisTalepEkle(yeni)
  if (eklenen) {
    // Görev tarafına da bağla
    await gorevGuncelle(gorev.id, { servisTalepId: eklenen.id })
  }
  return eklenen
}
```

Bu fonksiyon hem Görüşme detay'daki modal'dan, hem Görevler form'dan, hem GorevDetay "Servis'e dönüştür" butonundan kullanılır — DRY.

## Mobile — Aynı akış

### `GorusmeDetayScreen.js`

- "+ Görev oluştur" butonu (yoksa eklenir)
- Modal: baslik, aciklama, atanan kişi (kullanıcı dropdown), öncelik, son tarih, lokasyon, "+ Servis talebi de oluştur" switch
- Kaydet → görev kaydedilir → toggle ON ise servis talebi oluşturulur → kullanıcı YeniServisTalebiScreen'e yönlendirilir (önceden doldurulmuş, prefilledFromGorev parametresiyle)

### `YeniGorevScreen.js`

- Aynı switch eklenir
- Aynı kaydet akışı

### Mobile servis: `servisTalepService.js`'te aynı `gorevdenServisTalebiOlustur` fonksiyonu

Web ile aynı, sadece mobile import path'leri.

## Pre-fill alanları (görev → servis talebi)

| Servis talebi alanı | Görev'den kaynak |
|---|---|
| `firma_adi` | gorev.firmaAdi |
| `musteri_id` | gorev.musteriId |
| `lokasyon` | musteri_lokasyonlari.ad lookup (gorev.lokasyonId) |
| `konu` | gorev.baslik |
| `aciklama` | gorev.aciklama |
| `aciliyet` | 'normal' (sabit) |
| `ana_tur` | 'ariza' (sabit) |
| `atanan_kullanici_id` | gorev.atananId |
| `olusturan_kullanici_id` | mevcut kullanıcı |
| `gorev_id` | gorev.id |
| `gorusme_id` | gorev.gorusmeId (varsa) |
| `durum` | 'yeni' (sabit) |
| `talep_no` | otomatik (mevcut numaralandırma) |

## Test senaryoları

1. **Görüşme detay → Görev oluştur (basit)** — toggle OFF, sadece görev oluşur, modal kapanır, listede görünür, gorusme_id doludur
2. **Görüşme detay → Görev + Servis talebi** — toggle ON, görev oluşur, servis talebi oluşur, ikisi bağlı, kullanıcı servis talebi detayına yönlenir
3. **Görevler form → Görev + Servis talebi** — aynı, görüşme bağlantısı olmadan
4. **GorevDetay'da bağlantılar** — gorusmeId / servisTalepId doluysa link görünür
5. **GorevDetay'da "Servis'e dönüştür"** — sonradan servis talebi oluşturma, FK'ler bağlanır
6. **Mobile aynı** — paralel davranış
7. **Servis talebi silinince** — görev'in servis_talep_id null olur, görev silinmez (set null cascade)

## Kapsam dışı (YAGNI)

- Görüşme detayında görev silme/güncelleme (sonra)
- Bulk görev oluşturma
- Görev → görüşme oluşturma (ters yön — workflow olarak mantıksız)
- Servis tamamlanınca görev otomatik kapansın — ileride otomasyon
- Görev/servis tamamlanma istatistikleri raporu
- E-posta bildirim (mevcut bildirim sistemi yeter)

## Riskler

- **Servis talebi numaralandırması** (`talep_no` formatı): mevcut akışı bozmamak için `servisTalepEkle` içindeki mevcut numaralandırma korunur, yeni fonksiyon onu kullanır
- **RLS**: gorevler ve servis_talepleri zaten staff-only, yeni FK kolonları RLS'i etkilemez
- **Görev/servis tek bir görüşmeye birden çok bağlanırsa**: Şu an FK 1-1 (her görev tek görüşme/servis), 1-N için ayrı tablo gerekir — YAGNI
- **Mobile EAS Update**: Yeni native dep yok, OTA yeterli
- **Görüşme→Görev modal'ı zaten mevcut**: yeni alanlar (lokasyon, toggle) eklenir; geriye dönük uyumlu kalır
