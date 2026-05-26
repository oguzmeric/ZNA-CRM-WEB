import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cokluBildirimEkle } from './bildirimService'

// İlgili personel ID'leri — koda gömülü (zamanla DB tablosuna taşınabilir)
const FERDI_ID = 16    // Teknik Müdür — her servis talebinde haberdar olmalı
const OGUZ_ID  = 2     // Sadece Trassir ile ilgili taleplerde

// Trassir keyword'i yakala (case-insensitive, talebin konusunda/açıklamasında/kategorisinde)
const trassirIcerirMi = (talep) => {
  const metin = [
    talep?.konu, talep?.aciklama, talep?.altKategori, talep?.alt_kategori,
    talep?.cihazTuru, talep?.cihaz_turu, talep?.anaTur, talep?.ana_tur,
  ].filter(Boolean).join(' ').toLowerCase()
  return /trassir/i.test(metin)
}

// Yeni servis talebi için bildirim alıcı ID listesi.
// Kural:
//  - Tüm aktif ZNA personeli (admin sayılır)
//  - Ferdi Kalkan her zaman
//  - Oğuz Meriç sadece Trassir keyword'lü taleplerde
// Talebi oluşturan kişi listede ise çıkarılır (kendi bildirimini almasın).
export const servisTalebiBildirimAlicilari = async (talep, olusturanId = null) => {
  const aliciSet = new Set()

  // 1. Tüm ZNA personeli (pasif olmayanlar)
  const { data: znaPersonel } = await supabase
    .from('kullanicilar')
    .select('id, durum')
    .eq('tip', 'zna')
    .neq('durum', 'pasif')
  for (const k of (znaPersonel || [])) aliciSet.add(k.id)

  // 2. Ferdi'yi her durumda ekle (varsa)
  aliciSet.add(FERDI_ID)

  // 3. Oğuz'u sadece Trassir ile ilgili taleplerde tut
  if (!trassirIcerirMi(talep)) {
    aliciSet.delete(OGUZ_ID)
  }

  // 4. Kendi oluşturduğun talebin bildirimini sen alma
  if (olusturanId) aliciSet.delete(Number(olusturanId))

  return Array.from(aliciSet)
}

// Yeni servis talebi → ilgili kişilere bildirim gönder.
// RPC fonksiyonu (servis_talebi_bildirim_olustur, SECURITY DEFINER) kullanır —
// RLS bypass eder, müşteri portal kullanıcısı da kendi haricindeki personele
// bildirim oluşturabilir.
// Best-effort: hata olursa talep yine de geçerli, sadece log düşer.
export const servisTalebiBildirimGonder = async (talep, olusturanId = null) => {
  if (!talep?.id) return { gonderildi: 0 }
  try {
    const { data, error } = await supabase.rpc('servis_talebi_bildirim_olustur', {
      p_talep_id: talep.id,
      p_olusturan_id: olusturanId ?? null,
    })
    if (error) throw error
    return { gonderildi: (data || []).length, aliciIdler: (data || []).map(r => r.alici_id) }
  } catch (e) {
    console.warn('[servisTalebiBildirimGonder]', e?.message)
    return { gonderildi: 0, hata: e?.message }
  }
}

export const servisTalepleriniGetir = async () => {
  const hepsi = []
  const sayfa = 1000
  let off = 0
  while (true) {
    const { data, error } = await supabase.from('servis_talepleri').select('*').order('id', { ascending: false }).range(off, off + sayfa - 1)
    if (error) { console.error('servisTalepleriniGetir hata:', error.message); throw error }
    if (!data || data.length === 0) break
    hepsi.push(...data)
    if (data.length < sayfa) break
    off += sayfa
  }
  return arrayToCamel(hepsi)
}

export const servisTalepGetir = async (id) => {
  const { data } = await supabase.from('servis_talepleri').select('*').eq('id', id).single()
  return toCamel(data)
}

export const servisTalepEkle = async (talep) => {
  const { id, olusturmaTarihi, guncellemeTarihi, ...rest } = talep
  const { data, error } = await supabase.from('servis_talepleri').insert(toSnake(rest)).select().single()
  if (error) { console.error('servisTalepEkle hata:', error.message); throw error }
  return toCamel(data)
}

export const servisTalepGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarihi, guncellemeTarihi, ...rest } = guncellenmis
  const { data, error } = await supabase.from('servis_talepleri').update({
    ...toSnake(rest),
    guncelleme_tarihi: new Date().toISOString()
  }).eq('id', id).select().single()
  if (error) { console.error('servisTalepGuncelle hata:', error.message); throw error }
  return toCamel(data)
}

export const servisTalepSil = async (id) => {
  const { error } = await supabase.from('servis_talepleri').delete().eq('id', id)
  if (error) console.error('servisTalepSil hata:', error.message)
}
