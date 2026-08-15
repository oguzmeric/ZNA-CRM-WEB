// HTML enjeksiyon koruması — `dangerouslySetInnerHTML` kullanan HER yer buradan geçer.
//
// SORUN (15.08 güvenlik taraması): 6 `dangerouslySetInnerHTML` çağrısından
// yalnız 1'i (Takvim) sanitize ediliyordu. Sanitize edilmeyenler arasında:
//   • BridgeTalepler — belediye API'sinden gelen ÜÇÜNCÜ TARAF HTML'i
//   • PaylasimBelge  — GİRİŞ GEREKTİRMEYEN public sayfa, müşteriye link gidiyor
// Bir <script> ya da <img onerror=...> enjekte edilirse sayfayı açan kişinin
// oturumunda çalışırdı.
//
// İKİ PROFİL — çünkü ihtiyaçlar farklı:
//
// 1) guvenliMetinHtml — DIŞ KAYNAKLI içerik (Bridge). Sadece temel
//    biçimlendirme. <style> YOK: dış kaynağın sayfamıza CSS enjekte etmesi
//    (görünmez katman, veri sızdıran arka plan isteği) istenmez.
//
// 2) guvenliBelgeHtml — KENDİ ürettiğimiz sözleşme/belge HTML'i.
//    ⚠️ <style> KORUNUR: `ssBelgeGoster` yazdırma düzenini gömülü <style> ile
//    kuruyor (ss-sabit-ust/alt) — kaldırılırsa çıktı bozulur. Buna karşılık
//    script/iframe/object/embed/form ve tüm event handler'lar temizlenir.
//
// Not: DOMPurify `on*` özniteliklerini (onerror, onclick…) ve
// `javascript:` protokolünü her iki profilde de varsayılan olarak siler.

import DOMPurify from 'dompurify'

const YASAKLI_ETIKETLER = ['script', 'iframe', 'object', 'embed', 'form', 'base', 'link', 'meta']

/** Dış kaynaklı metin içeriği (Bridge talep gövdesi vb.) */
export const guvenliMetinHtml = (html) =>
  DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS: ['br', 'p', 'b', 'strong', 'i', 'em', 'u', 'a', 'ul', 'ol', 'li', 'span', 'div',
                   'table', 'thead', 'tbody', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false,
  })

/**
 * Kendi ürettiğimiz belge/sözleşme HTML'i — gömülü <style> KORUNUR.
 *
 * ⚠️ `FORCE_BODY: true` ŞART. Onsuz DOMPurify `<style>` etiketini <head>
 * bağlamına ait sayıp düşürüyor ve `ADD_TAGS: ['style']` işe yaramıyor —
 * sözleşmenin yazdırma düzeni (ss-sabit-ust/alt) sessizce bozuluyordu.
 * Bu, prova testinde yakalandı; kaldırmayın.
 */
export const guvenliBelgeHtml = (html) =>
  DOMPurify.sanitize(html || '', {
    ADD_TAGS: ['style'],
    FORCE_BODY: true,
    FORBID_TAGS: YASAKLI_ETIKETLER,
    FORBID_ATTR: ['formaction', 'srcdoc'],
    ALLOW_DATA_ATTR: false,
    // Yazdırma düzeni class/style özniteliklerine dayanıyor; DOMPurify bunlara
    // varsayılan olarak zaten izin verir, ALLOWED_ATTR ile daraltmıyoruz.
  })
