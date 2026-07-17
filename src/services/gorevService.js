import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cached, invalidate } from '../lib/cache'

// LİSTE kolonları: notlar + yorumlar jsonb HARİÇ — mobil not/foto geçmişi
// büyüdükçe listeyi şişiriyordu; liste/kanban bu alanları hiç okumuyor.
// Detay sayfası gorevGetir(id) ile tam kaydı alır. Yeni kolon eklerken buraya da ekle.
const GOREV_LISTE_KOLONLARI = `id, baslik, aciklama, durum, oncelik, atanan_id, atanan_ad,
  olusturan_ad, bitis_tarihi, tamamlanma_tarihi, firma_adi, musteri_id, olusturma_tarih,
  musteri_adi, atanan, son_tarih, lokasyon_id, gorusme_id, servis_talep_id,
  baslama_tarih, bitis_tarih, devam_sebep, ekip`

export const gorevleriGetir = () => cached('gorevler:list', async () => {
  const hepsi = []
  const sayfa = 1000
  let off = 0
  while (true) {
    const { data, error } = await supabase.from('gorevler').select(GOREV_LISTE_KOLONLARI).order('olusturma_tarih', { ascending: false }).range(off, off + sayfa - 1)
    if (error) { console.error('gorevleriGetir hata:', error.message); throw error }
    if (!data || data.length === 0) break
    hepsi.push(...data)
    if (data.length < sayfa) break
    off += sayfa
  }
  return arrayToCamel(hepsi)
})

export const gorevGetir = (id) => cached(`gorev:${id}`, async () => {
  const { data } = await supabase.from('gorevler').select('*').eq('id', id).single()
  return toCamel(data)
})

// Boş string tarih PG'de timestamptz/date cast hatası verir ve UPDATE komple
// reddedilir (Elite Garden "güncellenmiyor" vakası, 2026-07-17) — '' → null.
const TARIH_ALANLARI = ['baslamaTarih', 'bitisTarih', 'sonTarih', 'bitisTarihi', 'tamamlanmaTarihi']
const tarihleriNormallestir = (g) => {
  const out = { ...g }
  for (const k of TARIH_ALANLARI) if (out[k] === '') out[k] = null
  return out
}

export const gorevEkle = async (gorev) => {
  const { id, olusturmaTarih, yorumlar, ...rest } = gorev
  const { data, error } = await supabase.from('gorevler').insert(toSnake(tarihleriNormallestir(rest))).select().single()
  if (error) { console.error('gorevEkle hata:', error.message); return null }
  invalidate('gorevler:list')
  return toCamel(data)
}

export const gorevGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, ...rest } = guncellenmis
  const { data, error } = await supabase.from('gorevler').update(toSnake(tarihleriNormallestir(rest))).eq('id', id).select().single()
  if (error) { console.error('gorevGuncelle hata:', error.message); return null }
  invalidate('gorevler:list', `gorev:${id}`)
  return toCamel(data)
}

export const gorevSil = async (id) => {
  await supabase.from('gorevler').delete().eq('id', id)
  invalidate('gorevler:list', `gorev:${id}`)
}
