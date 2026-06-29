// uygun_zaman alani — yeni kayitlar ISO datetime ('2026-06-30T14:00'),
// eski kayitlar serbest metin olabilir. Bu helper ikisini de gosterilebilir
// formata cevirir; ISO degilse oldugu gibi dondurur.
export function uygunZamanFormat(deger) {
  if (!deger) return ''
  const s = String(deger).trim()
  // YYYY-MM-DDTHH:MM veya YYYY-MM-DDTHH:MM:SS
  const isoMatch = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)
  if (!isoMatch) return s
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString('tr-TR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
