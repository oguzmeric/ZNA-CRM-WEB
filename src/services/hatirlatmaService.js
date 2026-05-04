import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { pagedFetch } from '../lib/pagedFetch'

export const hatirlatmalariGetir = async () => {
  const data = await pagedFetch((off, size) =>
    supabase.from('hatirlatmalar').select('*').order('hatirlatma_tarihi').range(off, off + size - 1)
  )
  return arrayToCamel(data)
}

export const hatirlatmaEkleDB = async (hatirlatma) => {
  // Aynı kaynak için (aynı teklif veya aynı görüşme) bekleyen hatırlatmayı
  // güncelle. ÖNCE INSERT, SONRA eski sil — sıra önemli: insert fail
  // ederse kullanıcı eski hatırlatmasını kaybetmez. (Önceden delete-then-insert
  // pattern'iydi; insert hatasında veri kaybına yol açıyordu.)
  const tip = hatirlatma.tip || 'teklif'
  const { id, ...rest } = hatirlatma
  const { data, error } = await supabase.from('hatirlatmalar').insert(toSnake(rest)).select().single()
  if (error) { console.error('hatirlatmaEkle hata:', error.message); return null }

  // INSERT başarılı — şimdi yeni eklenen DIŞINDAKİ eski bekleyenleri temizle
  if (tip === 'gorusme' && hatirlatma.gorusmeId) {
    await supabase.from('hatirlatmalar')
      .delete().eq('gorusme_id', hatirlatma.gorusmeId).eq('durum', 'bekliyor').neq('id', data.id)
  } else if (hatirlatma.teklifId || hatirlatma.teklif_id) {
    await supabase.from('hatirlatmalar')
      .delete().eq('teklif_id', hatirlatma.teklifId || hatirlatma.teklif_id).eq('durum', 'bekliyor').neq('id', data.id)
  }
  return toCamel(data)
}

export const hatirlatmaGuncelle = async (id, guncellenmis) => {
  const { id: _id, ...rest } = guncellenmis
  const { data, error } = await supabase.from('hatirlatmalar').update(toSnake(rest)).eq('id', id).select().single()
  if (error) { console.error('hatirlatmaGuncelle hata:', error.message); return null }
  return toCamel(data)
}

export const hatirlatmaSilDB = async (teklifId) => {
  const { error } = await supabase.from('hatirlatmalar').delete().eq('teklif_id', teklifId)
  if (error) console.error('hatirlatmaSil hata:', error.message)
}

export const hatirlatmaGorusmeSilDB = async (gorusmeId) => {
  const { error } = await supabase.from('hatirlatmalar').delete().eq('gorusme_id', gorusmeId)
  if (error) console.error('hatirlatmaGorusmeSil hata:', error.message)
}
