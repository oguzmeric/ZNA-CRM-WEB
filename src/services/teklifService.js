import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cached, invalidate } from '../lib/cache'

// Liste: satirlar/revizyon_gecmisi/aciklama (jsonb, KB'lar) detayda ayrıca çekilir
const TEKLIF_LISTE_KOLONLARI = 'id, teklif_no, revizyon, tarih, gecerlilik_tarihi, musteri_id, firma_adi, konu, para_birimi, doviz_kuru, onay_durumu, spek_durum, genel_iskonto, genel_toplam, olusturma_tarih, musteri_temsilcisi, kabul_tarihi, teklif_tipi, siparis_onayi, teklif_onayi, gorusme_id, hazirlayan, olusturan_id, olusturan_ad'

export const teklifleriGetir = () => cached('teklifler:list', async () => {
  const hepsi = []
  const sayfa = 1000
  let off = 0
  while (true) {
    const { data, error } = await supabase.from('teklifler').select(TEKLIF_LISTE_KOLONLARI).order('olusturma_tarih', { ascending: false }).order('id', { ascending: false }).range(off, off + sayfa - 1)
    if (error) { console.error('teklifleriGetir hata:', error.message); throw error }
    if (!data || data.length === 0) break
    hepsi.push(...data)
    if (data.length < sayfa) break
    off += sayfa
  }
  return arrayToCamel(hepsi)
})

// Hibrit yükleme AŞAMA 1: en yeni ~60 teklif + toplam sayı (anında boyama).
// Tam liste teklifleriGetir ile arkada iner (Gorusmeler ile aynı desen).
export const tekliflerIlkSayfa = async (limit = 60) => {
  const { data, count, error } = await supabase
    .from('teklifler')
    .select(TEKLIF_LISTE_KOLONLARI, { count: 'exact' })
    .order('olusturma_tarih', { ascending: false })
    .range(0, limit - 1)
  if (error) { console.error('tekliflerIlkSayfa hata:', error.message); return { satirlar: [], toplam: 0 } }
  return { satirlar: arrayToCamel(data || []), toplam: count || 0 }
}

export const teklifGetir = (id) => cached(`teklif:${id}`, async () => {
  const { data } = await supabase.from('teklifler').select('*').eq('id', id).single()
  return toCamel(data)
})

// Sayısal/ID alanlarda boş string → null, Postgres bigint hatası önlemek için
const NUMERIC_ALANLAR = ['musteriId', 'gorusmeId', 'musteriTalepId', 'dovizKuru', 'genelIskonto', 'revizyon', 'genelToplam']
const normalize = (obj) => {
  const out = { ...obj }
  NUMERIC_ALANLAR.forEach(k => {
    if (out[k] === '' || out[k] === undefined) out[k] = null
  })
  // Tarih alanları da aynı şekilde
  const TARIH_ALANLAR = ['gecerlilikTarihi', 'kabulTarihi', 'teslimTarihi', 'musteriTalepNo']
  TARIH_ALANLAR.forEach(k => {
    if (out[k] === '' || out[k] === undefined) out[k] = null
  })
  return out
}

export const teklifEkle = async (teklif) => {
  const { id, olusturmaTarih, ...rest } = normalize(teklif)
  const { data, error } = await supabase.from('teklifler').insert(toSnake(rest)).select().single()
  if (error) { console.error('teklifEkle hata:', error.message); throw error }
  invalidate('teklifler:list')
  return toCamel(data)
}

export const teklifGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, ...rest } = normalize(guncellenmis)
  const { data, error } = await supabase.from('teklifler').update(toSnake(rest)).eq('id', id).select().single()
  if (error) { console.error('teklifGuncelle hata:', error.message); throw error }
  invalidate('teklifler:list', `teklif:${id}`)
  return toCamel(data)
}

export const teklifSil = async (id) => {
  await supabase.from('teklifler').delete().eq('id', id)
  invalidate('teklifler:list', `teklif:${id}`)
}

// Bir stok kodunun geçmiş tekliflerdeki son birim fiyatları (fiyat geçmişi popover'ı).
// satirlar jsonb'si camelCase key'lerle saklanır (toSnake shallow — nested objelere
// dokunmaz) → jsonb containment sorgusu stokKodu key'i ile yapılır.
export const stokFiyatGecmisi = async (stokKodu, haricTeklifId = null) => {
  if (!stokKodu) return []
  const { data, error } = await supabase
    .from('teklifler')
    .select('id, teklif_no, firma_adi, tarih, para_birimi, satirlar')
    .contains('satirlar', JSON.stringify([{ stokKodu }]))
    .order('tarih', { ascending: false })
    .limit(10)
  if (error) { console.warn('stokFiyatGecmisi hata:', error.message); return [] }
  const sonuc = []
  for (const t of (data || [])) {
    if (haricTeklifId && String(t.id) === String(haricTeklifId)) continue
    const satir = (t.satirlar || []).find(s => s?.stokKodu === stokKodu && Number(s?.birimFiyat) > 0)
    if (!satir) continue
    sonuc.push({
      teklifId: t.id,
      teklifNo: t.teklif_no,
      firma: t.firma_adi,
      tarih: t.tarih,
      paraBirimi: t.para_birimi || 'TL',
      birimFiyat: Number(satir.birimFiyat),
    })
    if (sonuc.length >= 3) break
  }
  return sonuc
}

// Paylaşım linki açılma istatistiği — "Müşteri açtı mı?" rozeti.
// SECURITY DEFINER RPC (migration 136): token sızdırmadan sadece istatistik döner.
export const paylasimDurumOzet = async (belgeTipi, belgeId) => {
  const { data, error } = await supabase.rpc('paylasim_durum_ozet', {
    in_belge_tipi: belgeTipi,
    in_belge_id: Number(belgeId),
  })
  if (error) { console.warn('paylasimDurumOzet hata:', error.message); return null }
  const satir = Array.isArray(data) ? data[0] : data
  return satir ? toCamel(satir) : null
}

export const musteriTalepleriniGetir = async () => {
  const { data } = await supabase.from('musteri_teklif_talepleri').select('*').order('tarih', { ascending: false })
  return arrayToCamel(data)
}

export const musteriTalepEkle = async (talep) => {
  const { id, ...rest } = talep
  const { data } = await supabase.from('musteri_teklif_talepleri').insert(toSnake(rest)).select().single()
  return toCamel(data)
}

export const musteriTalepGuncelle = async (id, guncellenmis) => {
  const { id: _id, ...rest } = guncellenmis
  const { data } = await supabase.from('musteri_teklif_talepleri').update(toSnake(rest)).eq('id', id).select().single()
  return toCamel(data)
}
