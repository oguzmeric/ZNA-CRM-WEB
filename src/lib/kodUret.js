// Mevcut kodlardan bir sonraki sıra numarasını üretir — count+1 DEĞİL max+1.
//
// count+1 tuzağı: bir kayıt silinince sayaç geriler ve daha önce VERİLMİŞ bir
// kod yeniden üretilir; kod kolonu unique olduğu için insert sessizce patlar.
// 05.08'de mobil servis talebinde canlıda yaşandı (68 kayıt / max 97 →
// TLP-2026-0069 çakışması, "Talep oluşturulamadı"). Aynı hastalık müşteri/bayi
// kodu üreticilerindeydi — hepsi bu yardımcıya bağlandı.
//
// haricKod: düzenleme modunda kaydın KENDİ kodu üst sınıra sayılmasın diye.
export const sonrakiSiraNo = (kodlar, prefix, haricKod = '') =>
  (kodlar || []).reduce((max, kod) => {
    if (!kod || kod === haricKod || !String(kod).startsWith(prefix)) return max
    const n = Number(String(kod).match(/\d+$/)?.[0] ?? 0)
    return n > max ? n : max
  }, 0) + 1
