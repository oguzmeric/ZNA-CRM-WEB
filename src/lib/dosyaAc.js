// Storage'dan gelen imzalı (signed) URL'leri güvenle açar.
//
// SORUN (19.08, "bordro indirmede sessiz bir hata var"): imzalı URL bir ağ
// çağrısının ARDINDAN üretiliyor:
//
//     const url = await bordroIndirUrl(...)
//     window.open(url, '_blank')        // ← burada iş biter
//
// await tamamlandığında tarayıcının "kullanıcı etkileşimi" penceresi çoktan
// kapanmıştır. O noktadaki window.open kullanıcının açtığı bir pencere değil,
// koddan doğan bir pencere sayılır ve POPUP OLARAK ENGELLENİR. Engellenince
// istisna fırlatmaz — sessizce `null` döner. Sonuç: düğmeye basılır, "Açılıyor…"
// yanıp söner, hiçbir şey olmaz, hata da görünmez.
//
// İki ayrı çözüm gerekiyor, çünkü iki ayrı iş var:
//
//   indirmeBaslat  — dosya İNDİRİLECEK (Content-Disposition: attachment).
//                    Aynı sekmede adres ataması yapılır; tarayıcı indirmeyi
//                    başlatır ve sayfa DEĞİŞMEZ. Popup kavramı devreye girmez.
//
//   yeniSekmedeAc  — dosya GÖRÜNTÜLENECEK (yeni sekmede açılacak). Pencere
//                    URL'den ÖNCE, etkileşim hâlâ tazeyken açılır; adres
//                    sonra doldurulur. Klasik "önce aç, sonra doldur" tekniği.

/** Attachment olarak sunulan bir URL'den indirmeyi başlatır. */
export function indirmeBaslat(url) {
  if (!url) return false
  window.location.href = url
  return true
}

/**
 * Yeni sekmede açar. `urlUretici` imzalı URL'i döndüren async fonksiyondur.
 *
 * ⚠️ Pencere açılırken 'noopener' VERİLMEZ: verilirse window.open null döner
 * ve elimizde dolduracak pencere kalmaz. Bunun yerine referans açıldıktan
 * sonra `opener = null` ile koparılır — aynı güvenlik, çalışan sonuç.
 *
 * Dönen: { ok: true } | { ok: false, sebep: 'popup-engellendi'|'url-yok'|'hata', hata? }
 */
export async function yeniSekmedeAc(urlUretici) {
  const pencere = window.open('', '_blank')
  if (pencere) {
    try { pencere.opener = null } catch { /* bazı tarayıcılar izin vermez */ }
  }
  try {
    const url = await urlUretici()
    if (!url) { pencere?.close(); return { ok: false, sebep: 'url-yok' } }
    if (!pencere) return { ok: false, sebep: 'popup-engellendi' }
    pencere.location.href = url
    return { ok: true }
  } catch (hata) {
    pencere?.close()
    return { ok: false, sebep: 'hata', hata }
  }
}

/** Kullanıcıya gösterilecek hazır mesaj — her çağıranda yeniden yazılmasın. */
export function acmaHatasi(sonuc, varsayilan = 'Dosya açılamadı.') {
  if (sonuc?.sebep === 'popup-engellendi') {
    return 'Tarayıcı yeni sekmeyi engelledi. Adres çubuğundaki açılır pencere iznini verip tekrar deneyin.'
  }
  return sonuc?.hata?.message || varsayilan
}
