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

**KRİTİK:** `proxyMemberId` **null** olacak. PDF "originatorMemberId ile aynı
değer" diyor ama öyle gönderilince **code 2 (yetki hatası)** dönüyor —
canlıda test edildi. `platform: "3rdParty"` çalışıyor.

## Kullanılacak metotlar

| Metot | Amaç | Not |
|---|---|---|
| `authenticateMemberForExternalApi` | Oturum | `data.id` + `data.sessionId` döner |
| `getTaskList` | Periyodik çekim (10 dk cron) | pageSize max 25; `data: {list[], count, rejectTaskCount, additionalTimeRequestTaskCount}` |
| `getTask` | Detay | `params: {id}` — ~187 alan |
| `getTaskCommentList` | Yorumlar | `params: {taskId}` — `[{id, title, insertDatetime, content, fileList, imageList}]` |
| `updateTaskProgress` | Durum yazma | Zorunlu: `id, taskStatusId, completedPercent, comment`; kalanlar `null`; **`sendSms: false` DAİMA** |
| `insertTaskComment` | Yorum yazma | `taskId, content`; `sendSms: false` |

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

## Durum akışı (belediye onaylı)

Biz göndeririz: `2` devam (0-50%), `3` olumlu (100%), `6` olumsuz (100%),
`7` gerek kalmadı (100%). Kapatma `12` + `closeTaskStatusId` (3/6/7, params
içinde) — kapatmayı muhtemelen belediye yapacak (Orhan Bey teyidi bekleniyor).
`14-24` iç akış kodları, biz set etmeyiz; okurken gelebilir:
14 Onaylandı, 15 Reddedildi, 16-19 Zamanlama, 20-22 Sonlandırma Onayı,
23 Dış Birimde, 24 Eksik Bilgi.

## Test kayıtları

- Yazma testi: talep **4392945** ("test talebidir silmeyiniz")
- Yorum okuma örneği: taskId **3471674**

## Bekleyenler

- [ ] ZNA görev tipi filtre değerleri (Orhan Bey → belediye koleksiyona işleyecek).
      **Gelene kadar canlı çekim AÇILMAZ** — sistemde 4,3 milyon talep var.
- [ ] Kapatma (12) kimde — belediye teyidi
- [ ] Cevap tarihlerinin UTC olduğunun teyidi

## Yerel geliştirme tuzağı

Bu ofis makinesinde DNS, alan adını iç ağ IP'sine (10.100.5.67) çözüyor →
timeout. Gerçek IP: 95.0.169.114 (`curl --resolve` ile zorla). Bulutta sorun yok.
