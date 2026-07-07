# Mobiltek Canlı Kamera — mpegts.js/HLS Hibrit Tasarım

**Tarih:** 2026-07-07
**Bağlam:** Mobiltek MDVR canlı kamera stream'i mevcut HLS+hls.js yaklaşımıyla çalışmıyor. DVR ilk keyframe göndermeden m3u8 boş dönüyor ve hls.js "hata" olarak yorumluyor. İki paralel research agent'ı, MDVR ekosistemi için standart çözümün mpegts.js + HTTP-FLV olduğunu ve mobil için native HLS'in optimal olduğunu gösterdi.

## Amaç

Bir cümlede: **Kullanıcı, ZNA CRM'in mobil veya web arayüzünden Mobiltek MDVR'lı 6 aracın canlı kamera görüntüsünü, motor açık veya kapalı durumlarda güvenilir şekilde izleyebilsin.**

## Kapsam

**Dahil:**
- Web `talep.znateknoloji.com` `/mobiltek` sayfasında canlı kamera modal
- Mobile `crm-mobile` uygulamasında canlı kamera ekranı
- Aynı Supabase edge fn proxy altyapısı (mobiltek-proxy, mobiltek-stream)
- Motor açıkken 15-20 sn içinde, motor kapalıyken 1-2 dk içinde ilk frame

**Dahil değil:**
- Kayıt (playback) — sadece live
- Multi-camera grid (bir seferde tek araç, tek kanal)
- Mobile'da FLV desteği (react-native-video HLS ile idare ediyoruz)
- Ses (sadece video)

## Mimari

### İki katmanlı hibrit transport

| Platform | Transport | Kütüphane | Neden |
|---|---|---|---|
| **Web** | HTTP-FLV | `mpegts.js` | Warm-up sırasında m3u8 polling yok. HTTP chunked açık kalır, DVR ilk frame'i gönderince oynar. Sub-second latency. |
| **Mobile** | HLS | `expo-av` (react-native-video wrapper) | Native player, iOS/Android'de sıfır konfigürasyonla çalışır. Mobile'da FLV desteği zayıf. |

**Ortak arka uç:** Supabase edge fn `mobiltek-stream` (path-based HTTPS proxy) her iki platform için de kullanılır. Mobiltek HTTP → Supabase HTTPS.

### Veri akışı

```
[Kullanıcı] → 📹 buton
    ↓
[Frontend] → supabase.functions.invoke('mobiltek-proxy', { yol: 'cameras-live/{aracId}', params: { channel: N } })
    ↓
[mobiltek-proxy edge fn] → GET https://api.mobiltek.com.tr/v2/cameras/{aracId}?channel=N (Bearer token)
    ↓ (streamingUrls: rtmp, flv, hls)
[Frontend] URL seçimi:
    ├─ Web: streamingUrls.flv → path proxy /functions/v1/mobiltek-stream/{path}
    │        → mpegts.js Player.load()
    └─ Mobile: streamingUrls.hls → path proxy /functions/v1/mobiltek-stream/{path}
             → <Video source={{ uri, type: 'm3u8' }} />
    ↓
[mobiltek-stream edge fn] → GET http://84.51.5.140:8881/{path}
    ↓
Video oynatır
```

## Bileşenler

### 1. Backend — Değişiklik minimal

**`supabase/functions/mobiltek-stream/index.ts`** (mevcut, ufak düzeltmeler):
- **BUG 2 fix:** `.m3u8` → `Content-Type: application/vnd.apple.mpegurl` zorla
- **BUG 3 fix:** `.m3u8` body içinde `http://84.51.5.140:8881/` mutlak URL'leri path proxy'sine rewrite et
- **BUG 8 fix:** `.m3u8` ve `.ts` için upstream Range header gönderme (416 önlemek için)

**`supabase/functions/mobiltek-proxy/index.ts`** (mevcut, değişiklik yok):
- v2 cameras endpoint çağrısı doğru
- resultCode handling frontend'de

### 2. Web — mpegts.js entegrasyon

**Kaldır:**
- `flv.js` bağımlılığı (unmaintained, mpegts.js zaten fork'u)
- `hls.js` şu an kalır (sadece iOS Safari fallback için, ilerde değerlendirilir)

**Ekle:**
- `mpegts.js` bağımlılığı (pnpm add mpegts.js)

**Refactor `src/components/CanliKameraModal.jsx`:**
- Player başlatma: `mpegts.createPlayer({ type: 'flv', url, isLive: true, cors: true, hasVideo: true, hasAudio: false })`
- FLV URL'i tercih et (streamingUrls.flv → proxy path)
- 90 sn warm-up: mpegts.js `mpegts.LoggingControl` + `player.unload()/load()` üzerinden otomatik reconnect
- `onError` callback → hata mesajı + tekrar dene butonu
- `canplay` event → yükleniyor state kapatılır
- Cleanup: `player.destroy()` unmount'ta

**Kanal değişikliği:**
- Yeni: önce eski player'ı destroy et
- Sonra `canliKameraDurdur(prevChannel)` (opsiyonel, fail-safe)
- Sonra `baslat(newChannel)`

### 3. Mobile — Yeni ekran

**Ekle:**
- `expo-av` bağımlılığı (Expo SDK'da default var, kontrol edilecek)
- `crm-mobile/src/screens/CanliKameraScreen.js` — yeni

**`CanliKameraScreen` yapı:**
```
- Route param: { aracId, aracPlaka, kanal? }
- Yükleniyor / Hata / Video state
- <Video 
    source={{ uri: streamUrlProxied, type: 'm3u8' }}
    shouldPlay
    resizeMode="contain"
    onLoadStart / onReadyForDisplay / onError
  />
- Kanal 1 / Kanal 2 tab
- Alt: "Yeniden Dene" + araç bilgisi
```

**`crm-mobile/src/services/mobiltekService.js`** (mevcut):
- `canliKameraBaslat(aracId, kanal)` ekle — v2 cameras endpoint
- `canliKameraDurdur(aracId, kanal)` ekle — v2 stop endpoint

**Mobile navigation:**
- `MobiltekScreen.js`'te araç listesine 📹 butonu ekle → `CanliKameraScreen`

## Hata Yönetimi

| Hata | Kaynak | UI Davranışı |
|---|---|---|
| `resultCode: 302 (Device busy)` | Mobiltek | 90 sn countdown + otomatik retry |
| `resultCode: !== 100` | Mobiltek | Hata mesajı + kullanıcıya "Kontak açın / Mobiltek destek çağır" |
| mpegts.js `NetworkError` | Stream server offline | 5 sn sonra unload + load (max 3 kez) |
| mpegts.js `MediaError` | Bozuk frame | mpegts recover attempt |
| Video 60 sn'de canplay yok | Warm-up başarısız | "Motor kapalıyken 1-2 dk sürebilir" mesajı + manuel retry |
| Kullanıcı modal'ı kapatır | User | canliKameraDurdur çağrılır + izleme_log finalize |

## Test Kriterleri

**Mobile (E2E):**
1. Motor çalışan araç seç → 20 sn içinde video oynamalı
2. Motor kapalı araç seç → 90 sn içinde video oynamalı (kabul edilirse Mobiltek 1-2 dk)
3. Kanal 1 → Kanal 2 geç → 20 sn içinde yeni kanal oynamalı
4. Ekran kapat → stop çağrılmalı (Supabase log kontrol)
5. Ağ yok → hata mesajı + otomatik reconnect

**Web (E2E):**
1-5 aynı, sadece mpegts.js player kullanılır

**Manuel test için 2 araç:**
- Motor çalışan bir araç (test sırasında sür)
- Motor kapalı bir araç

## Bağımlılıklar

| Package | Repo | Neden |
|---|---|---|
| `mpegts.js` (yeni) | web | HTTP-FLV MDVR standart player |
| `flv.js` (kaldırılacak) | web | Unmaintained, mpegts.js fork'u |
| `hls.js` (şimdilik kalır) | web | Safari native HLS fallback (opsiyonel) |
| `expo-av` (varsa) | mobile | Native HLS player |

## Uygulama Sırası

1. Backend proxy düzeltmeleri (Bug 2, 3, 8) — 20 dk
2. Web: mpegts.js entegre, CanliKameraModal refactor — 1 saat
3. Web canlı test (motor açık araç) — 30 dk
4. Mobile: CanliKameraScreen + service — 1.5 saat
5. Mobile navigation entegrasyon — 20 dk
6. EAS Update publish + canlı test — 30 dk

**Toplam:** ~4 saat

## Riskler ve Karşılıkları

- **Risk:** Motor kapalı araçlarda gerçekten 1-2 dk gerekiyor → mpegts.js bu sırada boş fetch açık kalırsa timeout olabilir. **Karşılık:** mpegts.js reconnect timer 5 sn, max 20 deneme (100 sn) — bu Mobiltek warm-up'ını karşılar.
- **Risk:** iOS Safari'de FLV çalışmaz (MSE yok Safari <14.1). **Karşılık:** Kullanıcı belirtti ki Chrome/Edge yeterli. iOS Safari fallback ilerde eklenir.
- **Risk:** Mobile'da HLS de warm-up polling yapıyor. **Karşılık:** react-native-video'nun retry policy'si daha esnek; hls.js gibi kolay pes etmez.

## İlgili Dosyalar

- Frontend web: `src/components/CanliKameraModal.jsx`, `src/services/mobiltekService.js`, `src/pages/Mobiltek.jsx`
- Frontend mobile: `crm-mobile/src/screens/CanliKameraScreen.js` (yeni), `crm-mobile/src/services/mobiltekService.js`
- Backend: `supabase/functions/mobiltek-proxy/index.ts`, `supabase/functions/mobiltek-stream/index.ts`
- Migration: (yok — tabloları değiştirmiyor)
