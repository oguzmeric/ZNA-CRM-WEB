import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

export const servisRaporlariniGetir = async () => {
  const hepsi = []
  const sayfa = 1000
  let off = 0
  while (true) {
    const { data, error } = await supabase
      .from('servis_raporlari')
      .select('*')
      .order('bil_tarih', { ascending: false, nullsFirst: false })
      .range(off, off + sayfa - 1)
    if (error) { console.error('servisRaporlariniGetir hata:', error.message); break }
    if (!data || data.length === 0) break
    hepsi.push(...data)
    if (data.length < sayfa) break
    off += sayfa
  }
  return arrayToCamel(hepsi)
}

export const servisRaporGetir = async (id) => {
  const { data, error } = await supabase.from('servis_raporlari').select('*').eq('id', id).single()
  if (error) { console.error('servisRaporGetir hata:', error.message); return null }
  return toCamel(data)
}

// Belirli müşterinin tüm raporları
export const musteriRaporlariniGetir = async (musteriId) => {
  const { data, error } = await supabase
    .from('servis_raporlari')
    .select('*')
    .eq('musteri_id', musteriId)
    .order('bil_tarih', { ascending: false, nullsFirst: false })
  if (error) { console.error(error.message); return [] }
  return arrayToCamel(data) ?? []
}

export const servisRaporEkle = async (rapor) => {
  const { id, olusturmaTarih, ...rest } = rapor
  const { data, error } = await supabase.from('servis_raporlari').insert(toSnake(rest)).select().single()
  if (error) { console.error('servisRaporEkle hata:', error.message); throw error }
  return toCamel(data)
}

export const servisRaporGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, ...rest } = guncellenmis
  const { data, error } = await supabase.from('servis_raporlari').update(toSnake(rest)).eq('id', id).select().single()
  if (error) { console.error('servisRaporGuncelle hata:', error.message); throw error }
  return toCamel(data)
}

export const servisRaporSil = async (id) => {
  const { error } = await supabase.from('servis_raporlari').delete().eq('id', id)
  if (error) console.error('servisRaporSil hata:', error.message)
}

// === Server-side pagination + arama + filtre ===
// Liste sayfası için optimize: sadece görüntülenecek 50 kayıt fetch'lenir,
// arama ve filtreler DB'de uygulanır.
export const servisRaporlariSayfa = async ({
  offset = 0,
  limit = 50,
  arama = '',
  firma = '',
  teknisyen = '',
  arizaKodu = '',
  takipKodu = '',
  tarihBaslangic = '',
  tarihBitis = '',
} = {}) => {
  let q = supabase
    .from('servis_raporlari')
    .select('*', { count: 'exact' })
    .order('bil_tarih', { ascending: false, nullsFirst: false })

  if (firma) q = q.eq('firma_adi', firma)
  if (teknisyen) q = q.eq('teknisyen', teknisyen)
  if (arizaKodu) q = q.eq('ariza_kodu', arizaKodu)
  if (takipKodu) q = q.eq('takip_kodu', takipKodu)
  if (tarihBaslangic) q = q.gte('gid_tarih', tarihBaslangic)
  if (tarihBitis) q = q.lte('gid_tarih', tarihBitis)
  if (arama && arama.trim()) {
    const t = `%${arama.trim()}%`
    q = q.or(
      `fis_no.ilike.${t},firma_adi.ilike.${t},lokasyon.ilike.${t},sonuc.ilike.${t},teknisyen.ilike.${t},bildirilen_ariza.ilike.${t}`
    )
  }
  q = q.range(offset, offset + limit - 1)

  const { data, count, error } = await q
  if (error) { console.error('servisRaporlariSayfa hata:', error.message); return { rows: [], toplam: 0 } }
  return { rows: arrayToCamel(data) ?? [], toplam: count ?? 0 }
}

// Filtre dropdown'ları için unique listeleri tek seferde çek.
// Sayfada cache'lenir, her ziyarette tekrar çekilmez.
export const servisRaporFiltreSecenekleri = async () => {
  const hepsi = []
  const sayfa = 1000
  let off = 0
  while (true) {
    const { data, error } = await supabase
      .from('servis_raporlari')
      .select('firma_adi, teknisyen, ariza_kodu, takip_kodu')
      .range(off, off + sayfa - 1)
    if (error || !data || data.length === 0) break
    hepsi.push(...data)
    if (data.length < sayfa) break
    off += sayfa
  }
  const f = new Set(), t = new Set(), a = new Set(), tk = new Set()
  for (const r of hepsi) {
    if (r.firma_adi) f.add(r.firma_adi)
    if (r.teknisyen) t.add(r.teknisyen)
    if (r.ariza_kodu) a.add(r.ariza_kodu)
    if (r.takip_kodu) tk.add(r.takip_kodu)
  }
  return {
    firmalar: [...f].sort(),
    teknisyenler: [...t].sort(),
    arizaKodlari: [...a].sort(),
    takipDurumlari: [...tk].sort(),
  }
}
