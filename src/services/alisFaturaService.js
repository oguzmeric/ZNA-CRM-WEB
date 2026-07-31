// Tedarikçi (ALIŞ) faturaları — mig 249.
//
// ⚠️ Bu modül GELEN faturadır: tedarikçi bize kesiyor, gider tarafı.
// Karıştırmayın: fatura_talepleri = müşteriye keseceğimiz proforma,
// satislar = kestiğimiz satış faturası. İkisi de GİDEN taraftır.
//
// Bir sipariş birden çok tedarikçiden karşılanabilir ve kısmi sevkiyatta
// birden çok fatura gelir — bu yüzden sipariş başına N kayıt tutulur.

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel } from '../lib/mapper'

const BUCKET = 'alis-fatura-belge'

// Muhasebe hesap kodu öneki: Tekdüzen Hesap Planı'nda 320 = SATICILAR.
// Cari kartlar musteriler tablosuna aktarılmış durumda (227 adet); ayrı bir
// tedarikçi tablosu yok, olanı kullanıyoruz.
export const TEDARIKCI_KOD_ONEKI = '320'

// ---------- Okuma ----------

export const alisFaturalariGetir = async (siparisId) => {
  if (!siparisId) return []
  const { data, error } = await supabase
    .from('alis_faturalari').select('*')
    .eq('siparis_id', Number(siparisId))
    .order('fatura_tarihi', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })   // eşit tarihte kararlı sıra (id tiebreaker)
  if (error) { console.error('alisFaturalariGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

/** Birden çok sipariş için "faturası var mı" haritası — liste rozetleri için. */
export const alisFaturaOzetleri = async (siparisIdler) => {
  const idler = [...new Set((siparisIdler || []).map(Number).filter(Boolean))]
  if (!idler.length) return {}
  const { data, error } = await supabase
    .from('alis_faturalari').select('siparis_id, genel_toplam, para_birimi')
    .in('siparis_id', idler)
  if (error) { console.error('alisFaturaOzetleri hata:', error.message); return {} }
  const harita = {}
  for (const s of data || []) {
    const k = harita[s.siparis_id] || (harita[s.siparis_id] = { adet: 0, toplam: 0, paraBirimleri: new Set() })
    k.adet += 1
    k.toplam += Number(s.genel_toplam) || 0
    if (s.para_birimi) k.paraBirimleri.add(s.para_birimi)
  }
  return harita
}

/**
 * Tedarikçi cari kartı ara (musteriler içinde kod '320…').
 * Türkçe İ/I tuzağı: ilike Postgres lower()'ına dayanır ve "İ" ile "i"
 * eşleşmez — bu yüzden sonuç ayrıca istemcide toLocaleLowerCase('tr') ile
 * süzülür; kullanıcı "işlem" yazınca "İŞLEM" kaydını da bulsun.
 */
export const tedarikciAra = async (q, limit = 20) => {
  const arama = (q || '').trim()
  let sorgu = supabase
    .from('musteriler')
    .select('id, firma, kod, vergi_no, vergi_dairesi')
    .like('kod', `${TEDARIKCI_KOD_ONEKI}%`)
    .order('firma', { ascending: true })
    .limit(arama ? 200 : limit)
  if (arama) sorgu = sorgu.or(`firma.ilike.%${arama}%,kod.ilike.%${arama}%,vergi_no.ilike.%${arama}%`)

  const { data, error } = await sorgu
  if (error) { console.error('tedarikciAra hata:', error.message); return [] }
  const liste = arrayToCamel(data || [])
  if (!arama) return liste

  const kucuk = (s) => (s || '').toLocaleLowerCase('tr')
  const hedef = kucuk(arama)
  const tr = liste.filter(m =>
    kucuk(m.firma).includes(hedef) || kucuk(m.kod).includes(hedef) || kucuk(m.vergiNo).includes(hedef))
  return (tr.length ? tr : liste).slice(0, limit)
}

// ---------- Dosya ----------

const uzantiAl = (ad) => (ad?.split('.').pop() || 'pdf').toLowerCase()

export const alisFaturaDosyaUrl = async (yol) => {
  if (!yol) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(yol, 3600)
  if (error) { console.error('alisFaturaDosyaUrl hata:', error.message); return null }
  return data?.signedUrl || null
}

// ---------- Yazma ----------

/**
 * Faturayı yükler ve kaydeder.
 * Dosya ÖNCE storage'a gider; INSERT patlarsa yüklenen dosya geri silinir —
 * yoksa her başarısız denemede bucket'ta öksüz dosya birikir.
 */
export const alisFaturaEkle = async ({ siparis, tedarikci, form, file, kullanici }) => {
  if (!siparis?.id) return { _hata: 'Sipariş bulunamadı.' }
  if (!file) return { _hata: 'Fatura dosyası seçilmedi.' }
  const ad = (tedarikci?.firma || form?.tedarikciAd || '').trim()
  if (!ad) return { _hata: 'Tedarikçi adı gerekli.' }
  if (!form?.faturaNo?.trim()) return { _hata: 'Fatura numarası gerekli.' }

  const uz = uzantiAl(file.name)
  if (!['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(uz)) {
    return { _hata: 'Yalnızca PDF veya görsel (jpg/png/webp) yüklenebilir.' }
  }

  const yol = `${siparis.id}/tedarikci-fatura-${Date.now()}.${uz}`
  const { error: yuklemeHata } = await supabase.storage.from(BUCKET).upload(yol, file)
  if (yuklemeHata) return { _hata: 'Dosya yüklenemedi: ' + yuklemeHata.message }

  const satir = {
    siparis_id: Number(siparis.id),
    tedarikci_musteri_id: tedarikci?.id ? Number(tedarikci.id) : null,
    tedarikci_ad: ad,
    tedarikci_vergi_no: (tedarikci?.vergiNo || form?.vergiNo || '').trim() || null,
    fatura_no: form.faturaNo.trim(),
    fatura_tarihi: form.faturaTarihi || null,
    ettn: form.ettn?.trim() || null,
    para_birimi: form.paraBirimi || 'TL',
    ara_toplam: form.araToplam === '' || form.araToplam == null ? null : Number(form.araToplam),
    kdv_toplam: form.kdvToplam === '' || form.kdvToplam == null ? null : Number(form.kdvToplam),
    genel_toplam: Number(form.genelToplam) || 0,
    aciklama: form.aciklama?.trim() || null,
    dosya_yol: yol,
    dosya_ad: file.name,
    yukleyen_id: kullanici?.id || null,
    yukleyen_ad: kullanici?.ad || null,
  }

  const { data, error } = await supabase.from('alis_faturalari').insert(satir).select().single()
  if (error) {
    // Öksüz dosya bırakma
    await supabase.storage.from(BUCKET).remove([yol]).catch(() => {})
    if (error.code === '23505') {
      return { _hata: `${satir.fatura_no} numaralı fatura bu siparişe zaten yüklenmiş.` }
    }
    return { _hata: error.message }
  }
  return toCamel(data)
}

/**
 * Kayıtlı faturayı düzenler. Yanlış künye ya da yanlış dosya yüklenmiş olabilir.
 *
 * Dosya değişiyorsa sıra kritik: ÖNCE yeni dosya yüklenir, SONRA DB güncellenir,
 * EN SON eski dosya silinir. Ters sırada DB güncellemesi patlarsa kayıt silinmiş
 * bir dosyayı gösterir hale gelirdi.
 */
export const alisFaturaDuzenle = async ({ kayit, tedarikci, form, file }) => {
  if (!kayit?.id) return { _hata: 'Kayıt bulunamadı.' }
  const ad = (tedarikci?.firma || form?.tedarikciAd || '').trim()
  if (!ad) return { _hata: 'Tedarikçi adı gerekli.' }
  if (!form?.faturaNo?.trim()) return { _hata: 'Fatura numarası gerekli.' }

  let yeniYol = null
  if (file) {
    const uz = uzantiAl(file.name)
    if (!['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(uz)) {
      return { _hata: 'Yalnızca PDF veya görsel (jpg/png/webp) yüklenebilir.' }
    }
    yeniYol = `${kayit.siparisId}/tedarikci-fatura-${Date.now()}.${uz}`
    const { error: yuklemeHata } = await supabase.storage.from(BUCKET).upload(yeniYol, file)
    if (yuklemeHata) return { _hata: 'Yeni dosya yüklenemedi: ' + yuklemeHata.message }
  }

  const patch = {
    tedarikci_musteri_id: tedarikci?.id ? Number(tedarikci.id) : null,
    tedarikci_ad: ad,
    tedarikci_vergi_no: (tedarikci?.vergiNo || form?.vergiNo || '').trim() || null,
    fatura_no: form.faturaNo.trim(),
    fatura_tarihi: form.faturaTarihi || null,
    para_birimi: form.paraBirimi || 'TL',
    ara_toplam: form.araToplam === '' || form.araToplam == null ? null : Number(form.araToplam),
    kdv_toplam: form.kdvToplam === '' || form.kdvToplam == null ? null : Number(form.kdvToplam),
    genel_toplam: Number(form.genelToplam) || 0,
    aciklama: form.aciklama?.trim() || null,
  }
  if (yeniYol) { patch.dosya_yol = yeniYol; patch.dosya_ad = file.name }

  const { data, error } = await supabase
    .from('alis_faturalari').update(patch).eq('id', kayit.id).select().single()
  if (error) {
    if (yeniYol) await supabase.storage.from(BUCKET).remove([yeniYol]).catch(() => {})
    if (error.code === '23505') {
      return { _hata: `${patch.fatura_no} numaralı fatura bu siparişe zaten yüklenmiş.` }
    }
    return { _hata: error.message }
  }

  // Güncelleme geçti — eski dosya artık kimseye ait değil
  if (yeniYol && kayit.dosyaYol && kayit.dosyaYol !== yeniYol) {
    const { error: silHata } = await supabase.storage.from(BUCKET).remove([kayit.dosyaYol])
    if (silHata) console.warn('[alisFaturaDuzenle] eski dosya silinemedi:', silHata.message)
  }
  return toCamel(data)
}

/** Kaydı ve dosyasını birlikte siler. */
export const alisFaturaSil = async (kayit) => {
  if (!kayit?.id) return { _hata: 'Kayıt bulunamadı.' }
  const { error } = await supabase.from('alis_faturalari').delete().eq('id', kayit.id)
  if (error) return { _hata: error.message }
  if (kayit.dosyaYol) {
    const { error: dosyaHata } = await supabase.storage.from(BUCKET).remove([kayit.dosyaYol])
    // Satır gitti ama dosya kaldıysa sessiz geçmiyoruz — bucket'ta çöp birikir
    if (dosyaHata) console.warn('[alisFaturaSil] dosya silinemedi:', dosyaHata.message)
  }
  return { ok: true }
}

// ---------- Hesap ----------

/**
 * Siparişin toplam tedarik maliyeti. Farklı para birimleri TOPLANMAZ —
 * 100 EUR + 500 TL "600" değildir; her biri ayrı gösterilir.
 */
export const tedarikToplami = (faturalar) => {
  const gruplar = {}
  for (const f of faturalar || []) {
    const pb = f.paraBirimi || 'TL'
    gruplar[pb] = (gruplar[pb] || 0) + (Number(f.genelToplam) || 0)
  }
  return Object.entries(gruplar).map(([paraBirimi, tutar]) => ({ paraBirimi, tutar }))
}
