// HEIC'i GÖRÜNTÜLERKEN çevirme — tarihi kayıtlar için köprü (17.08.2026).
//
// Teknisyenler ağırlıklı iPhone kullanıyor; 04.08 öncesi mobil yüklemelerde
// galeriden seçilen fotolar HEIC düştü (fotoSec.js o gün kuruldu, yenileri
// JPEG geliyor). Tarayıcı HEIC çizemediği için eski kayıtların fotoğrafları
// ekranda ve PDF/yazdır çıktısında boş kalıyordu (TB-2026-00029: 6'nın 5'i).
//
// ⭐ Dönüşümü SUNUCU yapar: Supabase render/image endpoint'i HEIC kaynağı
// JPEG olarak döndürüyor (17.08 canlı doğrulama: 5/5 dosya 200 image/jpeg).
// İlk sürümdeki tarayıcı-içi heic-to yolu KALDIRILDI — 3 MB kütüphane +
// dosya başına saniyeler süren dönüşüm "yazdır önizlemesi boş/yavaş"
// şikayeti doğurdu; sunucu yolu anında ve beklemesizdir.
import { kucukGorsel } from './gorselUrl'

export const heicMi = (url = '') =>
  /\.hei[cf]($|\?)/i.test(String(url))

// HEIC ise sunucuda JPEG'e çevrilmiş halinin URL'i; değilse url aynen döner.
// 1200px/82 = ServisFormu çıktısıyla aynı ölçü (2'li gridde ~300 DPI baskı).
export const heicGosterimUrl = (url, { genislik = 1200, kalite = 82 } = {}) =>
  heicMi(url) ? kucukGorsel(url, { genislik, kalite }) : url
