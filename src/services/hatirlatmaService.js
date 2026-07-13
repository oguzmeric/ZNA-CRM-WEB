import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { pagedFetch } from '../lib/pagedFetch'

// Hatırlatmalar kişiseldir: teklifi/görüşmeyi hazırlayan kişiye görünür.
// kullanici_id NULL olan eski kayıtlar (backfill eşleşmeyenler) herkese görünür.
const mevcutKullaniciId = async () => {
  const { data } = await supabase.auth.getUser()
  if (!data?.user) return null
  const { data: k } = await supabase
    .from('kullanicilar').select('id').eq('auth_id', data.user.id).maybeSingle()
  return k?.id ?? null
}

export const hatirlatmalariGetir = async () => {
  const kid = await mevcutKullaniciId()
  if (!kid) return []
  // Yalnız KENDİ hatırlatmaların. Sahipsiz (NULL) eski kayıtlar artık kimseye
  // gösterilmez — backfill sonrası kalan NULL'lar yetim/eşleşemeyen kayıtlardı
  // ve herkese popup çıkarıyordu.
  const data = await pagedFetch((off, size) =>
    supabase.from('hatirlatmalar').select('*')
      .eq('kullanici_id', kid)
      .order('hatirlatma_tarihi')
      .range(off, off + size - 1)
  )
  return arrayToCamel(data)
}

// Tek bir hatırlatma kaydını PK ile sil (yetim temizliği için).
// DİKKAT: hatirlatmaSilDB teklif_id ile siler — karıştırma (eski bug buydu).
export const hatirlatmaKaydiSil = async (hatirlatmaId) => {
  const { error } = await supabase.from('hatirlatmalar').delete().eq('id', hatirlatmaId)
  if (error) console.error('hatirlatmaKaydiSil hata:', error.message)
}

// Teklif hatırlatmasının sahibi teklifi HAZIRLAYAN kişidir (kuran değil):
// hazırlayan adını kullanicilar.ad ile eşle; bulunamazsa kurana düş.
const teklifSahibiId = async (teklifId) => {
  try {
    const { data: t } = await supabase
      .from('teklifler').select('hazirlayan').eq('id', teklifId).maybeSingle()
    const ad = (t?.hazirlayan || '').trim()
    if (!ad) return null
    const { data: k } = await supabase
      .from('kullanicilar').select('id').ilike('ad', ad).maybeSingle()
    return k?.id ?? null
  } catch { return null }
}

export const hatirlatmaEkleDB = async (hatirlatma) => {
  // Sahibi ata: teklif tipi → teklifi hazırlayan; diğerleri → kuran kişi
  if (hatirlatma.kullaniciId === undefined) {
    let sahip = null
    if ((hatirlatma.tip || 'teklif') === 'teklif' && hatirlatma.teklifId) {
      sahip = await teklifSahibiId(hatirlatma.teklifId)
    }
    hatirlatma = { ...hatirlatma, kullaniciId: sahip ?? await mevcutKullaniciId() }
  }
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
