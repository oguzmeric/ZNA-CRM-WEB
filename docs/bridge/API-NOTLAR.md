# Bridge Task Operation API — Doğrulanmış Entegrasyon Notları

Başakşehir Belediyesi Bridge API'si. Bu dosya **canlıda doğrulanmış** davranışı
yansıtır (2026-07-24, salt-okuma testleri) — PDF kılavuz ile çeliştiği yerlerde
BURASI geçerlidir.

> Kimlik bilgileri bu repoda TUTULMAZ — Supabase secret olarak saklanır
> (`BRIDGE_USERNAME`, `BRIDGE_PASSWORD`, `BRIDGE_COMPANY_ID`).
> Ham cevap örnekleri (kişisel veri içerir, repoya konmaz):
> `C:\Users\MSI-LAPTOP\Downloads\bridge-ornekler\`

## Temel

- Uç nokta: `https://ortakapi.basaksehir.bel.tr/http` — hep POST, tek adres,
  metot gövdedeki `action` alanında.
- Cevap hep HTTP 200; sonuç `code` alanında. `0` başarılı;
  `3` oturum zaman aşımı / `4` başka oturum açıldı / `6` IP değişti → yeniden
  giriş + isteği tekrarla. `2` yetki hatası, `10` validasyon.
- Oturum **kayan pencere**: her başarılı istek süreyi yeniler; 10 dk'lık cron
  oturumu canlı tutar. Limit: 350 istek/dk.
- Sabit IP GEREKMİYOR (bizim kullanıcıda IP kısıtı kapalı) → edge fn'den direkt.

## SP (her istekte zorunlu)

```json
{
  "currentCompanyId": 3433,
  "originatorMemberId": <auth.data.id>,
  "proxyMemberId": null,
  "sessionId": "<auth.data.sessionId>",
  "platform": "3rdParty",
  "language": "tr"
}
```

**KRİTİK:** `proxyMemberId` **null** olacak. Güncel kılavuz (Sürüm 1.0,
22.07.2026 — belediye 2026-07-24 mailiyle iletti) artık RESMEN "null gönderilir;
dolu gönderilirse sistem vekâlet yetkisi arar, kod 2 yetki hatası döner" diyor —
bizim canlı bulgumuz yazıya geçti.
`platform`: **çelişki SÜRÜYOR** — güncel PDF hâlâ `"web"` sabit değerini yazıyor,
biz canlıda `"3rdParty"` ile başardık. IP kısıtı bizde kapalı olduğu için ikisi de
geçebilir; kodda önce doğrulanmış `"3rdParty"` kullan, kod 2/10 alırsan `"web"` dene.

## Kullanılacak metotlar

| Metot | Amaç | Not |
|---|---|---|
| `authenticateMemberForExternalApi` | Oturum | `data.id` + `data.sessionId` döner |
| `getTaskList` | Periyodik çekim (10 dk cron) | pageSize max 25; `data: {list[], count, rejectTaskCount, additionalTimeRequestTaskCount}` |
| `getTask` | Detay | `params: {id}` — ~187 alan |
| `getTaskCommentList` | Yorumlar | `params: {taskId}` — `[{id, title, insertDatetime, content, fileList, imageList}]` |
| `updateTaskProgress` | Durum yazma | Zorunlu: `id, taskStatusId, completedPercent, comment`; kalanlar `null`; **`sendSms: false` DAİMA** |
| `insertTaskComment` | Yorum yazma | `taskId, content`; `sendSms: false` |

## getTaskList filtre alanları (güncel kılavuz — çelişkiler çözüldü)

Tümü istekte bulunmalı; kullanılmayan `null` gönderilir:
`insertDate:{beginDate,endDate}` · `taskStatusIdList:[]` · `taskTypeIdList:[]` ·
`departmentIdList:[]` · `pageNumber` (1'den başlar) · `pageSize` (max 25) ·
`sortColumn:"insertDate"` · `sortWay:"ASC"|"DESC"` (**METİN**, sayı değil) ·
`searchKeyword` (yoksa null). Önerilen sorgu aralığı: 5 dk'dan sık olmasın.

**ZNA süzgeci = `taskTypeIdList`** (talep tipi). Alan adı artık kesin; yalnız
DEĞERLERİ Orhan Bey'den bekleniyor.

Güncel kılavuzda ilk kez görünen 2 metot (read-only kapsamda GEREKMEZ, ileride
yazma için): `updateTaskComment` (yorum güncelle: `id`, `content`) ·
`getTaskLastComment` (son yorum: `id`).

## Cevap kayıtlarının önemli alanları

Açıklamalar **veriyle birlikte gelir** — ID sözlüğü gerekmez:
`id`, `taskSerialNumber` (B2026...), `subject`, `content` (+`contentIsHtml`),
`taskType{id,description}`, `taskStatusId/Description`,
`closedTaskStatusId/Description`, `departmentDescription`,
`taskSourceChannelDescription`, `priorityDescription`, `insertDatetime`,
`deadline`, `completedDatetime`, `completedPercent`, `commentCount`,
`lastComment`, `city/town/district/taskAddress`, `latitude/longitude`.

**KVKK:** `collocutor*` alanlarında vatandaş adı, telefonu, e-postası, maskeli
TC, doğum tarihi gelir. `bridge_talepler` tablosuna yalnız gerekli alanlar
yazılır, RLS staff-only olur.

## Tarihler

- Filtrelerde TR yerel saat: `"insertDate": {"beginDate": "2026-07-22T09:00:00", "endDate": ...}`
- **Cevaplarda UTC** (`...Z` sonekli) — mapper'da +3 çevir. (Belediyeye teyit soruldu.)
- Sınır kaçırmamak için beginDate = son sorgu − 5-10 dk (belediye önerisi).

## Durum kodları (taskStatusId — güncel kılavuz Bölüm 5, RESMİ)

`1` Başlamadı · `2` Devam Ediyor · `3` Tamamlandı · `4` Yeniden Açıldı ·
`5` Reddedildi · `6` Başarısız · `7` Gerek Kalmadı (tarihsel adı "Süresi Doldu") ·
`8` Ek Süre Talebi · `9` Ek Süre Onayı · `10` Ek Süre Reddi · `11` Ek Süre İptali ·
`12` Kapatıldı · `13` Onay Bekliyor.
Kılavuz: "bunların dışındaki kodlar Bridge iç akışlarına aittir; entegrasyonda
yukarıdakiler yeterli." (Önceki notta 14-24 diye geçenler bu kapsam dışı iç kodlar.)

**DÜZELTME:** Eski notta `3`="olumlu", `6`="olumsuz" yazıyordu; RESMİ tablo
`3`=Tamamlandı, `6`=Başarısız. Görüntü eşleşmesini buna göre yap.

Yazma senaryosu (ileride): biz `2` devam / `3` tamamlandı / `6` başarısız /
`7` gerek kalmadı göndeririz; `12` kapatmayı muhtemelen belediye yapar (Orhan Bey
teyidi). updateTaskProgress `sendSms: false` DAİMA.

## Test kayıtları

- Yazma testi: talep **4392945** ("test talebidir silmeyiniz")
- Yorum okuma örneği: taskId **3471674**

## Bekleyenler

- [ ] **`taskTypeIdList` değerleri** — ZNA taleplerini ayıran görev tipi ID'leri.
      Filtre ALANI artık kesin (güncel kılavuz); sadece DEĞERLERİ Orhan Bey'den
      bekliyoruz. **Gelene kadar canlı çekim (getTaskList) AÇILMAZ** — 4,3M talep var;
      test kaydı 4392945 ile getTask/getTaskCommentList tek-kayıt okuması serbest.
- [ ] Kapatma (12) kimde — belediye teyidi (Orhan Bey)
- [x] Cevap tarihleri UTC — 2026-07-24 mailiyle TEYİT (istek TR yerel, cevap "…Z").
- [x] proxyMemberId=null — güncel kılavuzda RESMEN doğrulandı.

## Ağ erişimi — GÜNDEN GÜNE DEĞİŞKEN (kritik)

Ofis DNS'i alan adını iç ağ IP'sine çözer (10.100.5.67; genel IP 95.0.169.114).
- **2026-07-23:** iç IP timeout, genel IP AÇIK → testler genel IP'den geçti.
- **2026-07-24 akşam:** TERSİNE DÖNDÜ — iç IP 200/30ms, genel IP TCP timeout
  (hem ofisten hem Supabase'den). Yerel ağdan uçtan uca test yine BAŞARILI
  (auth 0 / getTask 187 alan / yorum listesi 0). Yani sözleşme doğru, engel ağ.
- **Sonuç:** genel erişim kapalı kaldıkça edge fn (bulut IP) BAĞLANAMAZ.
  Belediyeye sorulacak: 95.0.169.114 dış erişimi bilinçli mi kapatıldı /
  IP whitelist mi geldi? Whitelist ise sabit çıkış IP'li ara katman gerekir
  (edge fn IP'si değişkendir).
- Test kaydı 4392945'in **taskTypeId = 9425** çıktı — muhtemel ZNA görev tipi
  (Orhan Bey teyidi olmadan canlı çekimde KULLANMA).
