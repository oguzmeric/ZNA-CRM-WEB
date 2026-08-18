import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cached, invalidate } from '../lib/cache'

// Liste kolonları — takip_notu listede kolon olarak görünüyor; notlar/dosyalar sadece detayda
const GORUSME_LISTE_KOLONLARI = 'id, gorusme_no, akt_no, tarih, saat, firma_adi, musteri_adi, konu, tip, durum, hazirlayan, olusturma_tarih, gorusen, takip_notu, gorusme_sonucu, muhatap_id, muhatap_ad, olusturan_id, musteri_id, irtibat_sekli, lokasyon_id, yalniz_yonetici'

// İlk boyama için hızlı sayfa: yalnız en yeni N kayıt + toplam sayı (~20KB).
// Tam liste (gorusmeleriGetir) arka planda inerken kullanıcı bunu görür.
export const gorusmelerIlkSayfa = async (limit = 60) => {
  const { data, count, error } = await supabase
    .from('gorusmeler')
    .select(GORUSME_LISTE_KOLONLARI, { count: 'exact' })
    .order('olusturma_tarih', { ascending: false })
    .range(0, limit - 1)
  if (error) { console.error('gorusmelerIlkSayfa hata:', error.message); return { satirlar: [], toplam: 0 } }
  return { satirlar: arrayToCamel(data || []), toplam: count || 0 }
}

export const gorusmeleriGetir = () => cached('gorusmeler:list', async () => {
  const hepsi = []
  const sayfa = 1000
  let off = 0
  while (true) {
    const { data, error } = await supabase.from('gorusmeler').select(GORUSME_LISTE_KOLONLARI).order('olusturma_tarih', { ascending: false }).order('id', { ascending: false }).range(off, off + sayfa - 1)
    // Error olunca break yerine throw — partial data cache'e yazılıp 60sn
    // boyunca kullanıcıya eksik liste gösterilmesini önler.
    if (error) { console.error('gorusmeleriGetir hata:', error.message); throw error }
    if (!data || data.length === 0) break
    hepsi.push(...data)
    if (data.length < sayfa) break
    off += sayfa
  }
  return arrayToCamel(hepsi)
})

export const gorusmeGetir = (id) => cached(`gorusme:${id}`, async () => {
  const { data } = await supabase.from('gorusmeler').select('*').eq('id', id).single()
  return toCamel(data)
})

export const gorusmeEkle = async (gorusme) => {
  const { id, olusturmaTarih, manuelKonu, ...rest } = gorusme
  const { data, error } = await supabase.from('gorusmeler').insert(toSnake(rest)).select().single()
  if (error) { console.error('gorusmeEkle hata:', error.message); return null }
  invalidate('gorusmeler:list')
  return toCamel(data)
}

export const gorusmeGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, manuelKonu, ...rest } = guncellenmis
  const { data, error } = await supabase.from('gorusmeler').update(toSnake(rest)).eq('id', id).select().single()
  if (error) { console.error('gorusmeGuncelle hata:', error.message); return null }
  invalidate('gorusmeler:list', `gorusme:${id}`)
  return toCamel(data)
}

// Konu adını toplu yeniden adlandır — eski konu'yu tüm görüşmelerde yenisiyle değiştir
// Döner: etkilenen kayıt sayısı (veya null hata durumunda)
export const konuTopluYeniden = async (eskiAd, yeniAd) => {
  if (!eskiAd || !yeniAd) return null
  if (eskiAd === yeniAd) return 0
  const { data, error } = await supabase
    .from('gorusmeler')
    .update({ konu: yeniAd })
    .eq('konu', eskiAd)
    .select('id')
  if (error) { console.error('konuTopluYeniden hata:', error.message); return null }
  invalidate('gorusmeler:list')
  return data?.length ?? 0
}

export const gorusmeSil = async (id) => {
  const { data: g } = await supabase.from('gorusmeler').select('dosyalar').eq('id', id).single()
  const dosyaPaths = (g?.dosyalar || []).map(d => d.path).filter(Boolean)
  if (dosyaPaths.length > 0) {
    await supabase.storage.from('gorusme-dosyalari').remove(dosyaPaths)
  }
  await supabase.from('gorusmeler').delete().eq('id', id)
  invalidate('gorusmeler:list', `gorusme:${id}`)
}

// ─────────────────────────────────────────────────────────────────────
// DOSYA yönetimi
// ─────────────────────────────────────────────────────────────────────

// Dosya yükle + dosyalar array'ini güncelle
// Döner: yeni dosya meta objesi { path, name, type, size, uploadedAt, uploaderAd }
export const dosyaYukle = async (gorusmeId, file, uploaderAd = '') => {
  const safeName = file.name.replace(/[^\w.\-]/g, '_')
  const path = `${gorusmeId}/${Date.now()}_${safeName}`
  const { error: upError } = await supabase.storage
    .from('gorusme-dosyalari')
    .upload(path, file, { contentType: file.type })
  if (upError) throw upError

  const yeniMeta = {
    path,
    name: file.name,
    type: file.type,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    uploaderAd: uploaderAd || null,
  }

  const { data: mevcut } = await supabase.from('gorusmeler').select('dosyalar').eq('id', gorusmeId).single()
  const yeniDosyalar = [...(mevcut?.dosyalar || []), yeniMeta]
  const { error: updError } = await supabase.from('gorusmeler').update({ dosyalar: yeniDosyalar }).eq('id', gorusmeId)
  if (updError) throw updError

  return yeniMeta
}

// Dosyaya geçici (60 sn) signed URL üret — bucket private olduğu için public URL yok
export const dosyaLinkiAl = async (path) => {
  const { data, error } = await supabase.storage
    .from('gorusme-dosyalari')
    .createSignedUrl(path, 60)
  if (error) throw error
  return data.signedUrl
}

/**
 * Bu görüşmeden ÜRETİLEN kayıtlar — servis talebi / teklif / keşif.
 *
 * 18.08 kullanıcı isteği: "görüşmeden servis açıyorum, aynı servise ararken
 * çok fazla servis olduğundan karışıyor — bu görüşmenin servisine ulaşmak
 * istiyoruz." Bağ zaten kuruluydu (gorusme_id), yalnız ekranda gösterilmiyordu.
 *
 * ⚠️ ÜÇ TABLONUN KOLON ADLARI FARKLI — canlıdan doğrulandı, tahmin DEĞİL:
 *   servis_talepleri : olusturma_tarih_İ_ · durum
 *   teklifler        : olusturma_tarih    · onay_durumu   (durum kolonu YOK!)
 *   kesifler         : olusturma_tarih    · durum · kesif_basligi
 * Yanlış kolon adı PostgREST'te 400 döndürür ve liste sessizce boş kalır.
 *
 * Bir tablonun hatası diğerlerini düşürmesin diye her sorgu ayrı ele alınır;
 * hata konsola yazılır, o bölüm boş döner ama diğerleri gelir.
 */
export const gorusmeninUretilenleri = async (gorusmeId) => {
  const gid = Number(gorusmeId)
  const bos = { servisler: [], teklifler: [], kesifler: [] }
  if (!gid) return bos

  const [s, t, k] = await Promise.all([
    supabase.from('servis_talepleri')
      .select('id, talep_no, konu, durum, atanan_kullanici_ad, olusturma_tarihi')
      .eq('gorusme_id', gid).order('id', { ascending: false }),
    supabase.from('teklifler')
      .select('id, teklif_no, konu, onay_durumu, olusturma_tarih')
      .eq('gorusme_id', gid).order('id', { ascending: false }),
    supabase.from('kesifler')
      .select('id, kesif_no, kesif_basligi, durum, olusturma_tarih')
      .eq('gorusme_id', gid).order('id', { ascending: false }),
  ])

  if (s.error) console.error('[gorusmeninUretilenleri/servis]', s.error.message)
  if (t.error) console.error('[gorusmeninUretilenleri/teklif]', t.error.message)
  if (k.error) console.error('[gorusmeninUretilenleri/kesif]', k.error.message)

  return {
    servisler: (s.data || []).map(toCamel),
    teklifler: (t.data || []).map(toCamel),
    kesifler:  (k.data || []).map(toCamel),
  }
}

// Dosya sil (storage + dosyalar array)
export const dosyaSil = async (gorusmeId, path) => {
  const { error: delError } = await supabase.storage
    .from('gorusme-dosyalari')
    .remove([path])
  if (delError) throw delError

  const { data: mevcut } = await supabase.from('gorusmeler').select('dosyalar').eq('id', gorusmeId).single()
  const kalanlar = (mevcut?.dosyalar || []).filter(d => d.path !== path)
  const { error: updError } = await supabase.from('gorusmeler').update({ dosyalar: kalanlar }).eq('id', gorusmeId)
  if (updError) throw updError
}
