// Kişisel Dokümanlar servisi — kullanıcının kendi dosyaları + link'leri.
// Görünürlük: sadece_ben / herkes / secili (belirli kullanıcılar).

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

const BUCKET = 'kisi-dokuman'
// 8 MB'dan 25'e çıkarıldı (2026-07-15): proje/DWG dosyaları 8 MB'a sığmıyordu.
// DWG'yi engelleyen dosya TİPİ değildi — ne bucket'ta MIME kısıtı var ne de
// input'ta accept — sadece bu sınırdı. Üstü OneDrive linki olarak eklenir.
export const MAX_BOYUT_MB = 25
export const MAX_BOYUT = MAX_BOYUT_MB * 1024 * 1024

// ---------- Kategoriler ----------
export async function kategorileriGetir() {
  const { data, error } = await supabase
    .from('dokuman_kategorileri')
    .select('*')
    .order('kullanici_id', { ascending: true, nullsFirst: true })
    .order('isim', { ascending: true })
  if (error) { console.error('[kategori]', error.message); return [] }
  return arrayToCamel(data)
}

export async function kategoriEkle({ isim, ikon, publicMi = false }) {
  const kullaniciId = publicMi ? null : (await mevcutKullaniciId())
  const { data, error } = await supabase
    .from('dokuman_kategorileri')
    .insert({ isim: isim.trim(), ikon: ikon || null, kullanici_id: kullaniciId })
    .select().single()
  if (error) throw error
  return toCamel(data)
}

export async function kategoriSil(id) {
  const { error } = await supabase.from('dokuman_kategorileri').delete().eq('id', id)
  if (error) throw error
}

/** Klasör adını değiştir. Sistem klasörleri (kullanici_id null) korunur —
 *  RLS zaten engeller ama kullanıcıya net hata dönsün. */
export async function kategoriYenidenAdlandir(id, isim) {
  const yeni = String(isim || '').trim()
  if (!yeni) throw new Error('Klasör adı boş olamaz.')
  const { data, error } = await supabase
    .from('dokuman_kategorileri')
    .update({ isim: yeni })
    .eq('id', id)
    .select().single()
  if (error) {
    if (error.code === '23505') throw new Error('Bu isimde bir klasörün zaten var.')
    throw error
  }
  if (!data) throw new Error('Klasör güncellenemedi — sistem klasörleri yeniden adlandırılamaz.')
  return toCamel(data)
}

async function mevcutKullaniciId() {
  const { data } = await supabase.auth.getUser()
  if (!data?.user) return null
  const { data: k } = await supabase
    .from('kullanicilar').select('id').eq('auth_id', data.user.id).maybeSingle()
  return k?.id ?? null
}

// ---------- Dokümanlar ----------
// benimMi=true → sadece kendi dokümanlarım
// benimMi=false → RLS gereği: kendim + herkese açık + bana paylaşılmış
export async function dokumanlariGetir({ benimMi = false } = {}) {
  let q = supabase
    .from('kisi_dokumanlari')
    .select('*')
    .order('guncelleme_tarih', { ascending: false })
  if (benimMi) {
    const kid = await mevcutKullaniciId()
    if (!kid) return []
    q = q.eq('kullanici_id', kid)
  }
  const { data, error } = await q
  if (error) { console.error('[dokuman liste]', error.message); return [] }
  return arrayToCamel(data)
}

// dosya: File nesnesi (opsiyonel)
// linkUrl: 'https://...' (opsiyonel)
export async function dokumanEkle({
  baslik, aciklama, kategoriId, tip,
  linkUrl, dosya,
  gorunurluk = 'sadece_ben', gorunenKullaniciIdler = [],
}) {
  const kid = await mevcutKullaniciId()
  if (!kid) throw new Error('Oturum bulunamadı.')

  const payload = {
    kullanici_id: kid,
    kategori_id: kategoriId || null,
    baslik: baslik.trim(),
    aciklama: aciklama?.trim() || null,
    tip,
    gorunurluk,
    gorunen_kullanici_idler: gorunurluk === 'secili' ? gorunenKullaniciIdler : [],
  }

  if (tip === 'link') {
    if (!linkUrl?.trim()) throw new Error('Link URL zorunlu.')
    payload.link_url = linkUrl.trim()
  } else if (tip === 'dosya') {
    if (!dosya) throw new Error('Dosya zorunlu.')
    if (dosya.size > MAX_BOYUT) throw new Error(`Dosya çok büyük (max ${MAX_BOYUT_MB} MB).`)
    const ext = (dosya.name.split('.').pop() || 'bin').toLowerCase().slice(0, 8)
    const yol = `${kid}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(yol, dosya, {
      cacheControl: '3600', upsert: false,
    })
    if (upErr) throw upErr
    payload.dosya_yolu = yol
    payload.dosya_ad = dosya.name
    payload.dosya_boyut = dosya.size
    payload.dosya_tip = dosya.type || null
  }

  const { data, error } = await supabase
    .from('kisi_dokumanlari').insert(payload).select().single()
  if (error) {
    // Yükleme oldu ama INSERT patladıysa dosyayı temizle
    if (payload.dosya_yolu) await supabase.storage.from(BUCKET).remove([payload.dosya_yolu])
    throw error
  }
  return toCamel(data)
}

export async function dokumanGuncelle(id, {
  baslik, aciklama, kategoriId,
  gorunurluk, gorunenKullaniciIdler,
  linkUrl,  // sadece link tipi güncellenebilir
}) {
  const yama = {}
  if (baslik !== undefined) yama.baslik = baslik.trim()
  if (aciklama !== undefined) yama.aciklama = aciklama?.trim() || null
  if (kategoriId !== undefined) yama.kategori_id = kategoriId || null
  if (gorunurluk !== undefined) {
    yama.gorunurluk = gorunurluk
    yama.gorunen_kullanici_idler = gorunurluk === 'secili' ? (gorunenKullaniciIdler || []) : []
  }
  if (linkUrl !== undefined) yama.link_url = linkUrl?.trim() || null
  const { data, error } = await supabase
    .from('kisi_dokumanlari').update(yama).eq('id', id).select().single()
  if (error) throw error
  return toCamel(data)
}

export async function dokumanSil(id) {
  // Önce dosya yolunu al, sonra kayıt + storage temizle
  const { data: mevcut } = await supabase
    .from('kisi_dokumanlari').select('dosya_yolu').eq('id', id).maybeSingle()
  const { error } = await supabase.from('kisi_dokumanlari').delete().eq('id', id)
  if (error) throw error
  if (mevcut?.dosya_yolu) {
    await supabase.storage.from(BUCKET).remove([mevcut.dosya_yolu]).catch(() => {})
  }
}

// Signed URL — dosyayı web'de aç veya indir
export async function dokumanIndirmeUrl(dosya_yolu, saniye = 300) {
  const { data, error } = await supabase.storage.from(BUCKET)
    .createSignedUrl(dosya_yolu, saniye, { download: false })
  if (error) throw error
  return data.signedUrl
}

export async function dokumanDosyayiIndir(dosya_yolu, dosya_ad) {
  const { data, error } = await supabase.storage.from(BUCKET)
    .createSignedUrl(dosya_yolu, 300, { download: dosya_ad || true })
  if (error) throw error
  // Yeni sekmede aç → download olarak inecek
  window.location.assign(data.signedUrl)
}
