import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { pagedFetch } from '../lib/pagedFetch'
import { cached, invalidate, invalidatePrefix } from '../lib/cache'

// Liste kolonları — aciklama listede lazım değil (3762 ürün × free text = büyük)
const STOK_URUN_LISTE_KOLONLARI = 'id, stok_kodu, stok_adi, kategori, birim, stok_miktari, min_stok, birim_fiyat, kdv_orani, olusturma_tarih, marka, grup_kodu, gorsel_url, katalogda_goster, seri_takipli, beklenen_adet, alis_fiyat, raf, kategori_id, urun_tipi, barkod, tedarikci, tedarikci_urun_kodu, garanti_suresi_ay, para_birimi, aktif, dokuman_url, dokuman_ad'

// Ürün tipleri (mig 151) — spec: stoklu/stoksuz/sarf/hizmet/demirbaş
export const URUN_TIPLERI = [
  { id: 'stoklu',   ad: 'Stoklu ürün' },
  { id: 'stoksuz',  ad: 'Stoksuz ürün' },
  { id: 'sarf',     ad: 'Sarf malzemesi' },
  { id: 'hizmet',   ad: 'Hizmet ürünü' },
  { id: 'demirbas', ad: 'Demirbaş' },
]
export const PARA_BIRIMLERI = ['TRY', 'USD', 'EUR']

// Alış fiyatı/maliyet görme yetkisi — kâr/marj kuralıyla aynı üçlü:
// 1=Ali Uğur, 2=Oğuz, 29=Ahmet Agun
export const ALIS_FIYAT_GOREBILENLER = [1, 2, 29]
export const alisFiyatGorebilir = (kullanici) =>
  ALIS_FIYAT_GOREBILENLER.includes(Number(kullanici?.id))

export const stokUrunleriniGetir = () => cached('stokUrunler:list', async () => {
  const data = await pagedFetch((off, size) =>
    supabase.from('stok_urunler').select(STOK_URUN_LISTE_KOLONLARI).order('stok_adi').range(off, off + size - 1)
  )
  return arrayToCamel(data)
})

export const stokUrunGetir = async (id) => {
  const { data } = await supabase.from('stok_urunler').select('*').eq('id', id).single()
  return toCamel(data)
}

// stok_urunler kolonları (camelCase) — tabloya gidebilecek tüm alanların whitelist'i
const KABUL_EDILEN_KOLONLAR = [
  'stokKodu', 'stokAdi', 'birim', 'minStok', 'aciklama',
  'marka', 'grupKodu', 'gorselUrl', 'katalogdaGoster', 'birimFiyat',
  'seriTakipli', 'beklenenAdet', 'kategori', 'stokMiktari', 'kdvOrani',
  'alisFiyat', 'raf',
  // Stok v2 Faz 1 (mig 151)
  'kategoriId', 'urunTipi', 'barkod', 'tedarikci', 'tedarikciUrunKodu',
  'garantiSuresiAy', 'paraBirimi', 'aktif', 'dokumanUrl', 'dokumanAd',
]

// Eski tablolarda olmayan kolonlar varsa fallback — burada da grupKodu dahil
const FALLBACK_KOLONLAR = ['stokKodu', 'stokAdi', 'birim', 'minStok', 'aciklama', 'marka', 'grupKodu']

const tumAlanlarTemizle = (urun) => {
  // Sadece whitelist'teki alanları geçir (bilinmeyen alanlar PGRST204'e yol açmasın)
  const temiz = {}
  KABUL_EDILEN_KOLONLAR.forEach(k => {
    if (urun[k] !== undefined) temiz[k] = urun[k]
  })
  // Boş string → null (numeric/url alanlar için)
  if (temiz.minStok === '' || temiz.minStok === undefined) temiz.minStok = null
  if (temiz.birimFiyat === '' || temiz.birimFiyat === undefined) temiz.birimFiyat = null
  if (temiz.alisFiyat === '' || temiz.alisFiyat === undefined) temiz.alisFiyat = null
  if (temiz.gorselUrl === '') temiz.gorselUrl = null
  if (temiz.marka === '') temiz.marka = null
  if (temiz.grupKodu === '') temiz.grupKodu = null
  if (temiz.raf === '') temiz.raf = null
  // Stok v2 alanları: boş string → null (numeric/FK kolonlar 22P02 vermesin)
  if (temiz.kategoriId === '') temiz.kategoriId = null
  if (temiz.garantiSuresiAy === '') temiz.garantiSuresiAy = null
  if (temiz.barkod === '') temiz.barkod = null
  if (temiz.tedarikci === '') temiz.tedarikci = null
  if (temiz.tedarikciUrunKodu === '') temiz.tedarikciUrunKodu = null
  if (temiz.dokumanUrl === '') temiz.dokumanUrl = null
  if (temiz.dokumanAd === '') temiz.dokumanAd = null
  return temiz
}

const sadecOrijinalKolonlar = (urun) => {
  const temiz = {}
  FALLBACK_KOLONLAR.forEach(k => {
    if (urun[k] !== undefined && urun[k] !== '') temiz[k] = urun[k]
  })
  if (temiz.minStok === '' || temiz.minStok === undefined) temiz.minStok = null
  return temiz
}

export const stokUrunEkle = async (urun) => {
  const temiz = tumAlanlarTemizle(urun)
  const { data, error } = await supabase.from('stok_urunler').insert(toSnake(temiz)).select().single()
  if (error) {
    console.error('stokUrunEkle hata:', error.code, error.message, error.details, error.hint)
    if (error.code === 'PGRST204') {
      console.warn('Schema cache eski — fallback ile yeniden deneniyor...')
      const temel = sadecOrijinalKolonlar(urun)
      const { data: d2, error: e2 } = await supabase.from('stok_urunler').insert(toSnake(temel)).select().single()
      if (e2) { console.error('stokUrunEkle (fallback) hata:', e2.message); return null }
      invalidatePrefix('stok')
      return toCamel(d2)
    }
    return null
  }
  invalidatePrefix('stok')
  return toCamel(data)
}

export const stokUrunGuncelle = async (id, guncellenmis) => {
  const temiz = tumAlanlarTemizle(guncellenmis)
  const { data, error } = await supabase.from('stok_urunler').update(toSnake(temiz)).eq('id', id).select().single()
  if (error) {
    if (error.code === 'PGRST204') {
      console.warn('Schema cache güncellenmemiş, orijinal kolonlarla güncelleniyor...')
      const temel = sadecOrijinalKolonlar(guncellenmis)
      const { data: d2, error: e2 } = await supabase.from('stok_urunler').update(toSnake(temel)).eq('id', id).select().single()
      if (e2) { console.error('stokUrunGuncelle (fallback) hata:', e2.message); return null }
      invalidatePrefix('stok')
      return toCamel(d2)
    }
    console.error('stokUrunGuncelle hata:', error.message, error.details)
    return null
  }
  invalidatePrefix('stok')
  return toCamel(data)
}

export const stokUrunSil = async (id) => {
  const { error } = await supabase.from('stok_urunler').delete().eq('id', id)
  if (error) { console.error('stokUrunSil hata:', error.message); throw error }
  invalidatePrefix('stok')
}

export const gorselYukle = async (file, stokKodu) => {
  const ext = file.name.split('.').pop()
  const path = `${stokKodu}.${ext}`
  const { error } = await supabase.storage
    .from('urun-gorselleri')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) return null
  const { data } = supabase.storage.from('urun-gorselleri').getPublicUrl(path)
  return data.publicUrl
}

export const gorselSil = async (stokKodu, ext) => {
  await supabase.storage.from('urun-gorselleri').remove([`${stokKodu}.${ext}`])
}

// ── Teknik doküman (datasheet) — private 'urun-dokuman' bucket (mig 151) ──
export const DOKUMAN_MAX_MB = 8

export const dokumanYukle = async (file, stokKodu) => {
  if (file.size > DOKUMAN_MAX_MB * 1024 * 1024) {
    throw new Error(`Dosya çok büyük — en fazla ${DOKUMAN_MAX_MB} MB.`)
  }
  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
  const path = `${stokKodu}/${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('urun-dokuman')
    .upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' })
  if (error) throw new Error('Doküman yüklenemedi: ' + error.message)
  return { path, ad: file.name }
}

// Private bucket — görüntüleme için kısa ömürlü imzalı URL
export const dokumanImzaliUrl = async (path, saniye = 300) => {
  const { data, error } = await supabase.storage
    .from('urun-dokuman')
    .createSignedUrl(path, saniye)
  if (error) { console.error('[dokumanImzaliUrl]', error.message); return null }
  return data?.signedUrl || null
}

export const dokumanSil = async (path) => {
  if (!path) return
  await supabase.storage.from('urun-dokuman').remove([path])
}

export const katalogUrunleriniGetir = async () => {
  const data = await pagedFetch((off, size) =>
    supabase
      .from('stok_urunler')
      .select('id, stok_kodu, stok_adi, marka, grup_kodu, birim, aciklama, gorsel_url, katalogda_goster')
      .eq('katalogda_goster', true)
      .eq('aktif', true)   // pasif ürün müşteri kataloğunda görünmez (mig 151)
      .order('stok_adi')
      .range(off, off + size - 1)
  )
  return arrayToCamel(data)
}

export const stokHareketleriniGetir = () => cached('stokHareketleri:list', async () => {
  const data = await pagedFetch((off, size) =>
    supabase.from('stok_hareketleri').select('*').order('tarih', { ascending: false }).range(off, off + size - 1)
  )
  return arrayToCamel(data)
})

// ──────────────────────────────────────────────────────────────
// S/N TAKIPLI KALEMLER (stok_kalemleri) — mobile ile senkron
// ──────────────────────────────────────────────────────────────

export const DURUMLAR = [
  { id: 'depoda',          isim: 'Depoda',              renk: '#3b82f6', ikon: '📦' },
  { id: 'teknisyende',     isim: 'Teknisyende',         renk: '#a855f7', ikon: '🚚' },
  { id: 'sahada',          isim: 'Sahada',              renk: '#10b981', ikon: '✅' },
  { id: 'arizada',         isim: 'Arızalı (Teknisyen)', renk: '#f59e0b', ikon: '⚠️' },
  { id: 'arizali_depoda',  isim: 'Arızalı Depoda',      renk: '#dc2626', ikon: '🔧' },
  { id: 'tamirde',         isim: 'Tamirde',             renk: '#ec4899', ikon: '🛠️' },
  { id: 'hurda',           isim: 'Hurda',               renk: '#6b7280', ikon: '🗑️' },
]
export const durumBul = (id) => DURUMLAR.find((d) => d.id === id)

// Her stok kodu için S/N kalemlerinin özetini getir (marka/model + durum sayıları)
export const stokKalemOzetleriniGetir = () => cached('stokKalemOzet:list', async () => {
  const kalemler = await pagedFetch((off, size) =>
    supabase
      .from('stok_kalemleri')
      .select('stok_kodu, marka, model, durum')
      .eq('silindi', false)  // sadece aktif
      .range(off, off + size - 1)
  )
  const map = new Map()
  for (const k of kalemler) {
    const key = k.stok_kodu ?? '(kodsuz)'
    if (!map.has(key)) {
      map.set(key, {
        stokKodu: k.stok_kodu,
        marka: k.marka || null,
        model: k.model || null,
        toplam: 0,
        depoda: 0,
        teknisyende: 0,
        sahada: 0,
        arizada: 0,
        arizaliDepoda: 0,
        tamirde: 0,
        hurda: 0,
      })
    }
    const row = map.get(key)
    row.toplam += 1
    if (k.durum === 'depoda') row.depoda += 1
    else if (k.durum === 'teknisyende') row.teknisyende += 1
    else if (k.durum === 'sahada') row.sahada += 1
    else if (k.durum === 'arizada') row.arizada += 1
    else if (k.durum === 'arizali_depoda') row.arizaliDepoda += 1
    else if (k.durum === 'tamirde') row.tamirde += 1
    else if (k.durum === 'hurda') row.hurda += 1
    if (!row.marka && k.marka) row.marka = k.marka
    if (!row.model && k.model) row.model = k.model
  }
  return map
})

// Belirli stok_kodu için S/N'li tüm kalemleri getir
// Tüm SN'lerin haritası — { seri_no.toLowerCase(): stok_kodu }
// Cross-product duplicate kontrolü için. Cache'li: SN eklemede invalidate ediliyor.
export const tumSeriNumaralariniGetir = () => cached('tumSN:list', async () => {
  const data = await pagedFetch((off, size) =>
    supabase
      .from('stok_kalemleri')
      .select('seri_no, stok_kodu, barkod')
      .not('seri_no', 'is', null)
      .range(off, off + size - 1)
  )
  const map = new Map()
  for (const k of data || []) {
    if (k.seri_no) map.set(String(k.seri_no).trim().toLowerCase(), k.stok_kodu || null)
    if (k.barkod) map.set(String(k.barkod).trim().toLowerCase(), k.stok_kodu || null)
  }
  return map
})

export const modelKalemleriniGetir = async (stokKodu) => {
  const data = await pagedFetch((off, size) =>
    supabase
      .from('stok_kalemleri')
      .select('*')
      .eq('stok_kodu', stokKodu)
      .eq('silindi', false)   // varsayılan: sadece aktif SN'ler
      .order('guncelleme_tarih', { ascending: false })
      .range(off, off + size - 1)
  )
  return arrayToCamel(data) ?? []
}

// Tek bir S/N kalemi ekle (stok_kalemleri tablosu) — mobile ile aynı
export const stokKalemEkle = async (kalem) => {
  const { id, olusturmaTarih, guncellemeTarih, ...rest } = kalem
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .insert(toSnake(rest))
    .select()
    .single()
  if (error) {
    console.error('stokKalemEkle hata:', error.message)
    throw new Error(stokHataMesaji(error))
  }
  invalidatePrefix('stok')
  return toCamel(data)
}

// Şu anki kullanıcı ID'sini al (audit hareketleri için)
const oturumKullaniciId = async () => {
  const { data: sess } = await supabase.auth.getUser()
  if (!sess?.user?.id) return null
  const { data: kul } = await supabase.from('kullanicilar').select('id').eq('auth_id', sess.user.id).maybeSingle()
  return kul?.id || null
}

// Ortak hareket ekleyici — kullanici_id otomatik
const hareketEkle = async ({ stokKodu, stokAdi, hareketTipi, miktar, aciklama }) => {
  const kullaniciId = await oturumKullaniciId()
  await supabase.from('stok_hareketleri').insert({
    stok_kodu: stokKodu,
    stok_adi: stokAdi || null,
    hareket_tipi: hareketTipi,
    miktar,
    aciklama,
    tarih: new Date().toISOString(),
    kullanici_id: kullaniciId,
  })
}

// Bir SN'i teknisyene ver — durum='teknisyende', teknisyen_id set + audit
export const snTeknisyeneVer = async (id, teknisyenId) => {
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .update({ durum: 'teknisyende', teknisyen_id: teknisyenId })
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('snTeknisyeneVer:', error.message); throw error }
  // Audit hareketi ekle
  if (data) {
    const { data: teknisyen } = await supabase.from('kullanicilar').select('ad').eq('id', teknisyenId).maybeSingle()
    await hareketEkle({
      stokKodu: data.stok_kodu,
      stokAdi: data.marka || data.model,
      hareketTipi: 'transfer_cikis',
      miktar: 1,
      aciklama: `SN teknisyene verildi: ${data.seri_no} → ${teknisyen?.ad || '?'}`,
    })
  }
  invalidatePrefix('stok')
  return toCamel(data)
}

// SN'i depoya çek — durum='depoda', teknisyen_id trigger ile null olur + audit
export const snDepoyaCek = async (id) => {
  // Önce mevcut teknisyen bilgisini al
  const { data: onceki } = await supabase.from('stok_kalemleri')
    .select('stok_kodu, seri_no, marka, model, teknisyen_id')
    .eq('id', id).maybeSingle()
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .update({ durum: 'depoda' })
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('snDepoyaCek:', error.message); throw error }
  if (data && onceki?.teknisyen_id) {
    const { data: teknisyen } = await supabase.from('kullanicilar').select('ad').eq('id', onceki.teknisyen_id).maybeSingle()
    await hareketEkle({
      stokKodu: data.stok_kodu,
      stokAdi: data.marka || data.model,
      hareketTipi: 'transfer_giris',
      miktar: 1,
      aciklama: `SN depoya çekildi: ${data.seri_no} ← ${teknisyen?.ad || '?'}`,
    })
  }
  invalidatePrefix('stok')
  return toCamel(data)
}

// Bir SN'i güncelle (seri_no, marka, model, barkod)
export const snGuncelle = async (id, alanlar) => {
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .update(toSnake(alanlar))
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('snGuncelle:', error.message); throw error }
  invalidatePrefix('stok')
  return toCamel(data)
}

// SN silme sebepleri — audit için standart set
export const SN_SILME_SEBEPLERI = [
  { id: 'satildi',       ad: 'Satıldı / Müşteriye teslim',   ikon: '🛒' },
  { id: 'iade',          ad: 'İade edildi (tedarikçiye)',    ikon: '↩️' },
  { id: 'hasarli',       ad: 'Hasarlı / Bozuldu',            ikon: '💥' },
  { id: 'kayip',         ad: 'Kayıp / Bulunamadı',           ikon: '❓' },
  { id: 'yanlis_kayit',  ad: 'Yanlış eklenmiş',              ikon: '⚠️' },
  { id: 'diger',         ad: 'Diğer',                        ikon: '📝' },
]

// Bir SN'i SOFT SİL — silindi=true, geri getirilebilir + audit trail
export const snSil = async (id, sebepBilgi = {}) => {
  const { sebep = 'diger', not = '' } = sebepBilgi
  const sebepObj = SN_SILME_SEBEPLERI.find(s => s.id === sebep) || SN_SILME_SEBEPLERI[SN_SILME_SEBEPLERI.length - 1]
  const kullaniciId = await oturumKullaniciId()
  // Soft delete: silindi flag'i set, seri_no ve barkod aktif değil (partial unique index sayesinde)
  const { data: kalem, error } = await supabase.from('stok_kalemleri')
    .update({
      silindi: true,
      silindi_zamani: new Date().toISOString(),
      silinme_sebebi: sebepObj.id,
      silinme_notu: not || null,
      silen_kullanici_id: kullaniciId,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('snSil:', error.message); throw error }
  // Cikis hareketi ekle (audit)
  if (kalem?.stok_kodu) {
    const aciklama = [
      `SN silindi: ${kalem.seri_no || id}`,
      `Sebep: ${sebepObj.ad}`,
      not ? `Not: ${not}` : null,
    ].filter(Boolean).join(' — ')
    await hareketEkle({
      stokKodu: kalem.stok_kodu,
      stokAdi: kalem.marka,
      hareketTipi: 'cikis',
      miktar: 1,
      aciklama,
    })
  }
  invalidatePrefix('stok')
}

// Silinen bir SN'i geri getir — silindi=false, aktif olur
export const snGeriGetir = async (id) => {
  const { data: kalem, error } = await supabase.from('stok_kalemleri')
    .update({
      silindi: false,
      silindi_zamani: null,
      silinme_sebebi: null,
      silinme_notu: null,
      silen_kullanici_id: null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('snGeriGetir:', error.message); throw new Error(stokHataMesaji(error)) }
  if (kalem?.stok_kodu) {
    await hareketEkle({
      stokKodu: kalem.stok_kodu,
      stokAdi: kalem.marka,
      hareketTipi: 'giris',
      miktar: 1,
      aciklama: `SN geri getirildi (silme iptal): ${kalem.seri_no}`,
    })
  }
  invalidatePrefix('stok')
}

// Silinen SN'leri de dahil et
export const modelKalemleriniGetirTumu = async (stokKodu, silinenlerDahil = false) => {
  let q = supabase.from('stok_kalemleri').select('*').eq('stok_kodu', stokKodu)
  if (!silinenlerDahil) q = q.eq('silindi', false)
  const data = await pagedFetch((off, size) => q.order('guncelleme_tarih', { ascending: false }).range(off, off + size - 1))
  return arrayToCamel(data) ?? []
}

// Bir SN'in tam geçmişi — bu ürünün stok_hareketleri'nde seri_no geçen kayıtları
export const snGecmisi = async (seriNo, stokKodu) => {
  const { data, error } = await supabase.from('stok_hareketleri')
    .select('*, kullanici:kullanici_id (ad)')
    .eq('stok_kodu', stokKodu)
    .ilike('aciklama', `%${seriNo}%`)
    .order('tarih', { ascending: false })
  if (error) { console.error('[snGecmisi]', error); return [] }
  return arrayToCamel(data) ?? []
}

// Birden fazla S/N kalemi toplu ekle
// PG hata mesajlarını kullanıcı dostu Türkçe'ye çevir
const stokHataMesaji = (error) => {
  // Supabase PostgrestError: message + details + hint + code (23505 = unique_violation)
  const parcalar = [error?.message, error?.details, error?.hint].filter(Boolean).join(' | ')
  const msg = String(parcalar).toLowerCase()
  const kod = String(error?.code || '')

  const isDuplicate = kod === '23505' || msg.includes('duplicate key') || msg.includes('already exists')

  if (isDuplicate && (msg.includes('seri_no') || msg.includes('stok_kalemleri_seri_no_key'))) {
    // Hata mesajından SN'yi çıkarmayı dene: Key (seri_no)=(XXX) already exists
    const m = parcalar.match(/\(seri_no\)=\(([^)]+)\)/i)
    const sn = m ? m[1] : null
    return sn
      ? `Bu seri numarası zaten kayıtlı: ${sn} — aynı SN iki farklı ürüne verilemez.`
      : 'Bu seri numarası zaten kayıtlı — aynı SN iki farklı ürüne verilemez.'
  }
  if (isDuplicate && msg.includes('barkod')) {
    const m = parcalar.match(/\(barkod\)=\(([^)]+)\)/i)
    const bk = m ? m[1] : null
    return bk
      ? `Bu barkod zaten kayıtlı: ${bk} — aynı barkod iki farklı ürüne verilemez.`
      : 'Bu barkod zaten kayıtlı — aynı barkod iki farklı ürüne verilemez.'
  }
  return error?.message || 'Bilinmeyen hata'
}

export const stokKalemleriToplu = async (kalemler) => {
  if (!kalemler?.length) return []
  const rows = kalemler.map(k => {
    const { id, olusturmaTarih, guncellemeTarih, ...rest } = k
    return toSnake(rest)
  })
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .insert(rows)
    .select()
  if (error) {
    console.error('stokKalemleriToplu hata:', error.message)
    const dostuHata = new Error(stokHataMesaji(error))
    dostuHata.origMessage = error.message
    throw dostuHata
  }
  invalidatePrefix('stok')
  return arrayToCamel(data) ?? []
}


export const stokHareketEkle = async (hareket) => {
  const { id, olusturmaTarih, ...rest } = hareket
  const { data, error } = await supabase.from('stok_hareketleri').insert(toSnake(rest)).select().single()
  if (error) { console.error('stokHareketEkle hata:', error); return null }
  invalidate('stokHareketleri:list', 'stokUrunler:list')
  return toCamel(data)
}
