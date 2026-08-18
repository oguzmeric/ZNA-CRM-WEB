// Sicil kartı biçimleyicileri — saf fonksiyon, bileşen YOK.
//
// ortak.jsx'ten ayrıldı: bileşen ve yardımcı fonksiyon aynı dosyadan
// export edilince Vite fast-refresh bozuluyor (react-refresh kuralı).

/** 'YYYY-MM-DD' veya ISO damga → '18.08.2026'. Boşsa tire. */
export const tarihBicim = (d) =>
  d ? new Date(String(d).length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString('tr-TR') : '—'

export const tarihSaatBicim = (d) =>
  d ? new Date(d).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '—'

export const paraBicim = (n) =>
  `₺${(Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Dakika → "8:30". 24 saati aşabilir (aylık toplamlarda gerekiyor). */
export const saatBicim = (dk) => {
  const d = Number(dk) || 0
  if (d <= 0) return '0:00'
  return `${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, '0')}`
}
