# Auth & Async — Pitfall Guide

Bu dokümanda yaşadığımız ve yaşayabileceğimiz auth/async hatalarını ve
nasıl önlendiğini topluyoruz. Yeni kod yazarken bu desenlere uy.

## 1. `onAuthStateChange` "no session" callback'i ≠ logout

**Bug:** Kullanıcı CRM'de oturumdayken yeni sekmede `/yazdir` açılınca her
iki sekmede de oturum kapanıyordu.

**Sebep:** Supabase auth event'leri farklı sebeplerle `null session`
fırlatır:
- Multi-tab storage sync (yeni sekmenin session yüklemesi)
- Token refresh transient fail (network glitch)
- Periyodik refresh kontrolleri

`onAuthStateChange((_event, session) => { if (!session) logout() })`
yazarsan, **yukarıdaki tüm durumlarda** logout fırlatılır. Yanlış.

**Doğru:** Yalnızca `event === 'SIGNED_OUT'`'da logout. Diğer "no session"
durumlarında mevcut state'i koru.

```js
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') { setUser(null); return }
  if (!session?.user) return // transient — yok say
  // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED → state'i güncelle
})
```

**Referans:** [`src/context/AuthContext.jsx`](../src/context/AuthContext.jsx)
satır 58–80

---

## 2. Promise timeout'suz çağrı = sonsuza kadar "Yükleniyor…"

**Bug:** Sabahları stale session ile sayfa açıldığında
`supabase.auth.getSession()` hang oluyor, `.finally()` hiç çalışmıyor,
`oturumYuklendi` false kalıyordu.

**Sebep:** Promise resolve/reject etmezse `.then/.catch/.finally`
zinciri tetiklenmez. Network dead, proxy stuck, edge cache loop — hangi
sebeple olursa olsun **timeout yoksa app sonsuza kadar bekler**.

**Doğru:** Kritik async çağrılarda **iki katman** koruma:

```js
// Katman 1: Promise.race ile çağrı içinde timeout
const result = await Promise.race([
  supabase.auth.getSession(),
  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
])

// Katman 2: outer useEffect'te safety timer
useEffect(() => {
  const safety = setTimeout(() => setOturumYuklendi(true), 10_000)
  doAsync().finally(() => { clearTimeout(safety); setOturumYuklendi(true) })
}, [])
```

**Referans:** [`src/services/kullaniciService.js`](../src/services/kullaniciService.js)
`mevcutOturumKullanici` (Katman 1) + [`AuthContext.jsx`](../src/context/AuthContext.jsx)
useEffect (Katman 2)

---

## 3. Supabase fetch'leri DEFAULT_TIMEOUT_MS'siz olamaz

**Bug:** Bir DB sorgusu hang olunca sayfa donar, kullanıcı F5 atmak zorunda.

**Doğru:** `src/lib/supabase.js`'de createClient'a global `fetch:
fetchWithTimeout` veriyoruz — her supabase çağrısı 8sn timeout alır.
Storage upload/download muaf (büyük dosya).

**Yeni servis yazarken:** Doğrudan `fetch()` kullanma — `supabase` client
üzerinden git. Eğer mecburen `fetch()` kullanırsan, `AbortController` +
`setTimeout` ekle.

**Referans:** [`src/lib/supabase.js`](../src/lib/supabase.js) `fetchWithTimeout`

---

## 4. Tab idle'dan dönünce "donmuş sayfa"

**Bug:** Tab 2-3 dakika arka planda kalıp dönünce sayfa geçişleri "yüklenmiyor",
F5 zorunlu kalıyor.

**Sebep:** Browser arka plandaki tab'ların pending fetch'lerini pause eder,
HTTP/2 keep-alive ölür, supabase client'ın in-flight Promise'leri askıda kalır.

**Çözüm 3 katmanlı:**

| Süre | Aksiyon |
|---|---|
| < 5 sn | Yok say — kısa switch'lerde dokunma |
| 5 sn – 60 sn | `cacheInvalidateAll()` + `abortStaleInFlight()` (soft) |
| 60 sn – 2 dk | + idle eşiği için aynı (1+ dk) |
| ≥ 2 dk | `window.location.reload()` (sessiz, chunk preload anlık) |

`guvenliReload()` 5sn cooldown ile çift reload önler.

**Referans:** [`AuthContext.jsx`](../src/context/AuthContext.jsx) satır 85–168

---

## 5. `useEffect` async + setState cascade

**Anti-pattern:**
```js
useEffect(() => {
  fetchData().then(setVeri)
}, [veri]) // ❌ veri değişince yeniden fetch → sonsuz loop
```

**Doğru:**
```js
useEffect(() => {
  let iptal = false
  fetchData().then(d => { if (!iptal) setVeri(d) })
  return () => { iptal = true }
}, [/* sadece input deps */])
```

Veya daha iyisi: `setSecili(0)`'ı useEffect içinde değil, `onChange`
handler içinde yap (lint uyarı veriyor).

---

## 6. Logout sonrası response sızıntısı

**Bug:** Kullanıcı logout olduktan sonra önceki kullanıcının pending
fetch'i tamamlanıp cache'e yazılırsa, yeni login olan kullanıcı eski
verileri görüyordu.

**Doğru:** `cikisYap`'ta önce `abortAllInFlight('logout')` çağır, sonra
`signOut()` ve `cacheInvalidateAll()` paralel çalıştır:

```js
const cikisYap = async () => {
  abortAllInFlight('logout')           // pending fetch'leri iptal
  await Promise.allSettled([            // signOut + status update paralel
    cikisYapAuth(),
    durumGuncelle(kullanici.id, 'cevrimdisi'),
  ])
  cacheInvalidateAll()                  // tüm cache'i temizle
  setKullanici(null)
}
```

**Referans:** [`AuthContext.jsx`](../src/context/AuthContext.jsx) `cikisYap`

---

## 7. `onAuthStateChange` callback'i `async` ve hata yakalanmamış

**Anti-pattern:**
```js
supabase.auth.onAuthStateChange(async (_, session) => {
  const profile = await fetchProfile(session.user.id) // throw ederse?
  setProfile(profile)
})
```

**Bug:** `fetchProfile` reject olursa unhandled rejection. Subscription
sustain durumda ama callback'in sonrası çalışmaz. State stale kalır.

**Doğru:** try/catch ekle, fail-soft davran:
```js
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_OUT') { setUser(null); return }
  if (!session?.user) return
  try {
    const profile = await fetchProfile(session.user.id)
    if (profile) setProfile(profile)
  } catch (e) {
    console.warn('[auth] profile fetch hata:', e) // log + mevcut state'i koru
  }
})
```

---

## 8. Yeni özellik kontrol listesi

Yeni async/auth-bağımlı kod yazarken sor:

- [ ] **Timeout var mı?** `Promise.race` veya `AbortController` ile
- [ ] **`.finally()` her durumda çalışıyor mu?** Throw/reject sonrası bile
      `setLoading(false)` garantili mi?
- [ ] **Multi-tab senaryosu test edildi mi?** İki sekmede aynı app açıkken
      bir tarafta logout/login → diğeri ne yapar?
- [ ] **Storage event'leri yan etki yaratıyor mu?** localStorage değişimini
      izlemek istemediğin sürece dinleme.
- [ ] **State setState'i unmount sonrası mı çalışıyor?** `iptal` flag'i veya
      `AbortController.signal` ile guard et.
- [ ] **Logout sonrası leak var mı?** Pending fetch'leri abort, cache
      invalidate.
- [ ] **`onAuthStateChange` callback'inde try/catch?** Throw → silent fail
      yerine logla, mevcut state'i koru.

---

## 9. Test senaryoları (manuel)

Yeni auth-touch eden değişiklikten sonra şunları dene:

1. **Sabah açılış:** Sayfayı kapat, 8+ saat bekle, tekrar aç. "Yükleniyor…"
   en geç 10sn'de kapanmalı.
2. **Multi-tab:** İki sekmede aynı CRM aç. Birinde detay sayfasından
   `/yazdir` aç → diğer sekmede oturum bozulmamalı.
3. **Tab idle:** CRM sekmesini 3+ dk arka plana al, dön. Sayfa geçişleri
   anında çalışmalı (sessiz reload görünebilir, normal).
4. **Network kesintisi:** DevTools → Network → Offline. Tıkla. 8sn sonra
   timeout, kullanıcı toast/empty state görür, "Yükleniyor…" takılmaz.
5. **Logout sırasında pending request:** Yavaş bir sayfaya git (Raporlar),
   loading varken çıkış yap. Yeni login olan kullanıcı eski verileri
   görmemeli.

---

**Son güncelleme:** 2026-05-04
