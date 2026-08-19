// Mobiltek yanıtındaki uygulama-seviyesi hata kodunu tanır.
//
// SORUN (19.08): Mobiltek hatayı HTTP durumuyla DEĞİL, gövdedeki `code` alanıyla
// bildiriyor. Kota dolduğunda dönen yanıt:
//
//   HTTP 200
//   {"code":40,"description":"Aylık sorgulama limiti doldu.","vehicles":null}
//
// Kodumuz yalnız `res.ok`'e baktığı için bunu BAŞARI sayıyordu; `vehicles: null`
// da `?? []` ile boş diziye düşüyor ve akış sessizce "araç yok" diyerek
// tamamlanıyordu. Araç konumları 09.08'den, kontak durumları 12.08'den beri
// güncellenmiyordu ve HİÇBİR YERDE hata görünmüyordu.
//
// ⚠️ TASARIM: yanlış alarm vermemek için kapı DAR tutuldu. Başarılı yanıtın
// `code` alanında ne geldiğini tam bilmiyoruz (kota dolu olduğu için gerçek
// başarılı yanıt gözlenemedi). Bu yüzden:
//   • bilinen hata kodu           → kesin hata
//   • bilinmeyen kod + boş veri   → hata (bir şeyler ters ve elde veri yok)
//   • bilinmeyen kod + dolu veri  → hata SAYILMAZ (veri geldiyse iş görüyor)
// Böylece Mobiltek başarıda `code: 200` gibi bir şey dönse bile akış kırılmaz.

export const MOBILTEK_KOTA_KODU = 40

const KRITIK_KODLAR: Record<number, string> = {
  40: 'Mobiltek aylık sorgulama limiti dolmuş. Araç verileri limit yenilenene kadar güncellenmiyor.',
}

/** Hata varsa kullanıcıya gösterilebilir Türkçe mesaj, yoksa null. */
export function mobiltekYanitHatasi(veri: unknown): string | null {
  const v = veri as Record<string, unknown> | null | undefined
  if (!v || typeof v !== 'object') return null

  const kod = Number(v.code)
  if (!Number.isFinite(kod)) return null      // `code` alanı yok → eski/farklı uç
  if (KRITIK_KODLAR[kod]) return KRITIK_KODLAR[kod]
  if (kod === 0) return null                  // 0 = başarı

  // Bilinmeyen kod: yalnız taşıdığı veri de boşsa hata say.
  const veriBos =
    v.vehicles == null && v.data == null && v.cameras == null && v.drivers == null
  if (!veriBos) return null

  const aciklama = String(v.description ?? '').trim()
  return aciklama
    ? `Mobiltek hata kodu ${kod}: ${aciklama}`
    : `Mobiltek hata kodu ${kod}`
}

/** Kota hatası mı — çağıranın farklı davranması gerekebilir (örn. cron sessiz geçsin). */
export function kotaHatasiMi(veri: unknown): boolean {
  return Number((veri as Record<string, unknown> | null)?.code) === MOBILTEK_KOTA_KODU
}
