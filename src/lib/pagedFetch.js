// Supabase'te 1000 satır limiti var. Bu helper 1000'lik paketlerle
// tüm satırları çeker.
//
// Kullanım:
//   await pagedFetch((off, size) =>
//     supabase.from('x').select('*').order('id').range(off, off + size - 1)
//   )
//
// queryFn: (offset, size) => supabase promise
// size: varsayılan 1000
export async function pagedFetch(queryFn, size = 1000) {
  const hepsi = []
  let off = 0
  while (true) {
    const { data, error } = await queryFn(off, size)
    if (error) { console.error('[pagedFetch]', error.message); break }
    if (!data || data.length === 0) break
    hepsi.push(...data)
    if (data.length < size) break
    off += size
  }
  return hepsi
}
