// Mesai süresi hesabı — TEK KAYNAK.
//
// Model: "Bitir" butonu YOK; 18:30'da pg_cron kaydı kapatır (mig 225).
// `sure_dakika` kolonu YALNIZ o kapanışta yazılır, gün içinde null'dur.
// Ekranlar bu kolonu doğrudan okuyunca devam eden mesai 0:00 görünüyordu
// (01.08 bildirimi: "10 dk önce QR ile başladılar, rapor hâlâ 0.00").
//
// Kural: çıkış varsa DB'deki değer otoritedir (kesin süre); yoksa girişten
// şu ana kadar geçen hesaplanır (anlık süre, 18:30'da kesinleşir).

export const mesaiKayitDakika = (k, simdi = Date.now()) => {
  if (!k) return 0
  if (k.sure_dakika != null) return Number(k.sure_dakika) || 0
  const giris = k.giris_zamani
  if (!giris) return 0
  const gecen = Math.round((simdi - new Date(giris).getTime()) / 60000)
  return gecen > 0 ? gecen : 0
}

// Kayıt hâlâ açık mı (süre anlık mı)?
export const mesaiDevamEdiyor = (k) => !!k && !k.cikis_zamani
