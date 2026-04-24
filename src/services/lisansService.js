import { supabase } from '../lib/supabase'
import { pagedFetch } from '../lib/pagedFetch'
import { cached, invalidate } from '../lib/cache'

// Form (camelCase) → DB (snake_case)
const formToDb = (l) => ({
  firma_adi: l.firmaAdi || null,
  musteri_id: l.musteriId || null,
  lisans_no: l.lisansKodu || null,
  lisans_id: l.lisansId || null,
  lisans_turu: l.lisansTuru || null,
  lisans_tipi: l.lisansTipi || 'sureksiz',
  sunucu_adi: l.sunucuAdi || null,
  lokasyon: l.lokasyon || null,
  baslangic_tarihi: l.baslangicTarih || null,
  bitis_tarihi: l.bitisTarih || null,
  durum: l.durum || 'aktif',
  kamera_sayisi: l.kanalSayisi ? Number(l.kanalSayisi) : null,
  notlar: l.notlar || null,
})

// DB (snake_case) → Form (camelCase)
const dbToForm = (row) => {
  if (!row) return null
  return {
    id: row.id,
    firmaAdi: row.firma_adi || '',
    musteriId: row.musteri_id || '',
    lisansKodu: row.lisans_no || '',
    lisansId: row.lisans_id || '',
    lisansTuru: row.lisans_turu || '',
    lisansTipi: row.lisans_tipi || 'sureksiz',
    sunucuAdi: row.sunucu_adi || '',
    lokasyon: row.lokasyon || '',
    baslangicTarih: row.baslangic_tarihi || '',
    bitisTarih: row.bitis_tarihi || '',
    durum: row.durum || 'aktif',
    kanalSayisi: row.kamera_sayisi || '',
    notlar: row.notlar || '',
    olusturmaTarih: row.olusturma_tarih || '',
    demoGun: '30',
  }
}

export const lisanslariGetir = () => cached('lisanslar:list', async () => {
  const data = await pagedFetch((off, size) =>
    supabase.from('trassir_lisanslar').select('*').order('olusturma_tarih', { ascending: false }).range(off, off + size - 1)
  )
  return (data || []).map(dbToForm)
})

export const lisansGetir = (id) => cached(`lisans:${id}`, async () => {
  const { data, error } = await supabase.from('trassir_lisanslar').select('*').eq('id', id).single()
  if (error) { console.error('lisansGetir hata:', error.message); return null }
  return dbToForm(data)
})

export const lisansEkle = async (lisans) => {
  const { data, error } = await supabase.from('trassir_lisanslar').insert(formToDb(lisans)).select().single()
  if (error) { console.error('lisansEkle hata:', error.message); return null }
  invalidate('lisanslar:list')
  return dbToForm(data)
}

export const lisansGuncelle = async (id, guncellenmis) => {
  const { data, error } = await supabase.from('trassir_lisanslar').update(formToDb(guncellenmis)).eq('id', id).select().single()
  if (error) { console.error('lisansGuncelle hata:', error.message); return null }
  invalidate('lisanslar:list', `lisans:${id}`)
  return dbToForm(data)
}

export const lisansSil = async (id) => {
  await supabase.from('trassir_lisanslar').delete().eq('id', id)
  invalidate('lisanslar:list', `lisans:${id}`)
}
