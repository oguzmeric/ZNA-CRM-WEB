// Supabase'te 1000 satır limiti var. Bu helper 1000'lik paketlerle
// tüm satırları çeker.
//
// PERF: Sayfalar eskiden SERİ çekiliyordu — 2600 satırlık görüşmeler
// 3 ardışık istek ≈ 3× tek istek süresi (~4sn) tutuyordu. İlk sayfadan
// sonra devam eden sayfalar 4'lü PARALEL partilerle çekilir; toplam süre
// pratikte tek istek süresine iner.
//
// Kullanım:
//   await pagedFetch((off, size) =>
//     supabase.from('x').select('*').order('id').range(off, off + size - 1)
//   )
//
// queryFn: (offset, size) => supabase promise
// size: varsayılan 1000
const PARALEL = 4

export async function pagedFetch(queryFn, size = 1000) {
  // İlk sayfa — tablo küçükse tek istekte biter (en yaygın durum)
  const ilk = await queryFn(0, size)
  if (ilk.error) { console.error('[pagedFetch]', ilk.error.message); return [] }
  const hepsi = [...(ilk.data || [])]
  if (!ilk.data || ilk.data.length < size) return hepsi

  // Devamı: paralel partiler. Kısa/boş sayfa görülünce durur.
  let off = size
  while (true) {
    const partiler = await Promise.all(
      Array.from({ length: PARALEL }, (_, i) => queryFn(off + i * size, size))
    )
    let bitti = false
    for (const p of partiler) {
      if (p.error) { console.error('[pagedFetch]', p.error.message); bitti = true; break }
      if (!p.data || p.data.length === 0) { bitti = true; break }
      hepsi.push(...p.data)
      if (p.data.length < size) { bitti = true; break }
    }
    if (bitti) break
    off += PARALEL * size
  }
  return hepsi
}
