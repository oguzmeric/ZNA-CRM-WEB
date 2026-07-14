// Bayi Sözleşmeleri Modülü (mig 154) — bayi kartı, şablonlu sözleşme üretimi,
// zorunlu evrak takibi, 4 adımlı onay akışı ve aktivasyon blokaj kuralı.
//
// Kritik iş kuralı (spec §20): imzalı sözleşme + zorunlu evraklar tamamlanıp
// yönetici aktivasyon onayı verilmeden bayi "aktif" olamaz; aktif olmayan bayi
// için teklif / Deal Register / özel fiyat işlemleri yapılamaz.
// Merkezi kontrol: bayiAktivasyonKontrol().

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { invalidate } from '../lib/cache'
import { cokluBildirimEkle } from './bildirimService'

// ---------- Sabitler ----------

export const BAYI_STATULERI = [
  { id: 'aday',                    isim: 'Aday Bayi',                tone: 'neutral' },
  { id: 'evrak_bekleniyor',        isim: 'Evrak Bekleniyor',         tone: 'uyari' },
  { id: 'sozlesme_olusturuldu',    isim: 'Sözleşme Oluşturuldu',     tone: 'bilgi' },
  { id: 'imza_bekleniyor',         isim: 'İmza Bekleniyor',          tone: 'uyari' },
  { id: 'evrak_kontrolunde',       isim: 'Evrak Kontrolünde',        tone: 'bilgi' },
  { id: 'finans_onayi_bekliyor',   isim: 'Finans Onayı Bekliyor',    tone: 'uyari' },
  { id: 'yonetici_onayi_bekliyor', isim: 'Yönetici Onayı Bekliyor',  tone: 'uyari' },
  { id: 'aktif',                   isim: 'Aktif Bayi',               tone: 'aktif' },
  { id: 'askida',                  isim: 'Askıda',                   tone: 'uyari' },
  { id: 'pasif',                   isim: 'Pasif Bayi',               tone: 'pasif' },
  { id: 'kara_liste',              isim: 'Kara Liste / Riskli',      tone: 'kayip' },
]
export const bayiStatu = (id) => BAYI_STATULERI.find(s => s.id === id) || BAYI_STATULERI[0]

export const BAYI_TURLERI = ['Sistem Entegratörü', 'Perakende / Mağaza', 'Toptan / Alt Bayi', 'Proje Firması', 'Online Satış', 'Diğer']

export const ODEME_TIPLERI = [
  { id: 'pesin',  isim: 'Peşin' },
  { id: 'vadeli', isim: 'Vadeli' },
]

export const TEMINAT_TIPLERI = ['Çek', 'Senet', 'Teminat Mektubu', 'Kefalet', 'Diğer']

// Evrak tipleri — açıklamalar spec §16'daki bayi yönlendirme metinleri
export const EVRAK_TIPLERI = [
  {
    id: 'imzali_sozlesme', isim: 'İmzalı Bayi Sözleşmesi', zorunlu: true, pdfZorunlu: true,
    aciklama: 'Kaşeli ve imzalı bayi sözleşmesini PDF formatında yükleyiniz.',
  },
  {
    id: 'imza_sirkusu', isim: 'İmza Sirküleri', zorunlu: true,
    aciklama: 'Şirket yetkilisine ait güncel imza sirkülerini PDF formatında yükleyiniz.',
  },
  {
    id: 'vergi_levhasi', isim: 'Vergi Levhası', zorunlu: true,
    aciklama: 'Güncel vergi levhanızı PDF olarak yükleyiniz.',
  },
  {
    id: 'faaliyet_belgesi', isim: 'Faaliyet Belgesi', zorunlu: true, sureli: true,
    aciklama: 'Son 6 ay içerisinde alınmış faaliyet belgenizi yükleyiniz.',
  },
  {
    id: 'ticaret_sicil_gazetesi', isim: 'Ticaret Sicil Gazetesi', zorunlu: true,
    aciklama: 'Şirket kuruluş ve varsa son ortaklık/yetki değişikliğini gösteren Ticaret Sicil Gazetesi\'ni yükleyiniz.',
  },
  {
    id: 'son_mizan', isim: 'Son Mizan', kosullu: true,
    aciklama: 'Yalnızca vade talebiniz bulunuyorsa son mizanın yüklenmesi zorunludur.',
  },
]
export const evrakTip = (id) => EVRAK_TIPLERI.find(t => t.id === id)

export const EVRAK_DURUMLARI = {
  bekleniyor:           { isim: 'Bekleniyor',          tone: 'neutral' },
  yuklendi:             { isim: 'Yüklendi',            tone: 'bilgi' },
  kontrol_ediliyor:     { isim: 'Kontrol Ediliyor',    tone: 'bilgi' },
  onaylandi:            { isim: 'Onaylandı',           tone: 'aktif' },
  reddedildi:           { isim: 'Reddedildi',          tone: 'kayip' },
  suresi_gecti:         { isim: 'Süresi Geçti',        tone: 'kayip' },
  yenisi_talep_edildi:  { isim: 'Yenisi Talep Edildi', tone: 'uyari' },
}

export const ONAY_ADIMLARI = [
  { id: 'satis',     isim: 'Satış Temsilcisi Kontrolü' },
  { id: 'operasyon', isim: 'Operasyon / Kanal Yönetimi' },
  { id: 'finans',    isim: 'Finans Kontrolü' },
  { id: 'yonetici',  isim: 'Yönetici Onayı' },
]

export const SOZLESME_DURUMLARI = {
  olusturuldu:     { isim: 'Oluşturuldu',     tone: 'bilgi' },
  imza_bekleniyor: { isim: 'İmza Bekleniyor', tone: 'uyari' },
  imzalandi:       { isim: 'İmzalandı',       tone: 'aktif' },
  iptal:           { isim: 'İptal',           tone: 'kayip' },
  arsiv:           { isim: 'Arşiv',           tone: 'pasif' },
}

// Sözleşme üretimi için bayi kartında zorunlu alanlar (spec §4.1)
export const ZORUNLU_BAYI_ALANLARI = [
  { alan: 'firmaAdi',          isim: 'Bayi ticari unvanı' },
  { alan: 'vergiDairesi',      isim: 'Vergi dairesi' },
  { alan: 'vergiNo',           isim: 'Vergi numarası' },
  { alan: 'mersisNo',          isim: 'MERSİS numarası' },
  { alan: 'ticaretSicilNo',    isim: 'Ticaret sicil numarası' },
  { alan: 'adres',             isim: 'Firma adresi' },
  { alan: 'telefon',           isim: 'Telefon' },
  { alan: 'email',             isim: 'E-posta' },
  { alan: 'kepAdresi',         isim: 'KEP adresi' },
  { alan: 'yetkiliAdi',        isim: 'Yetkili kişi adı soyadı' },
  { alan: 'yetkiliUnvani',     isim: 'Yetkili kişi unvanı' },
  { alan: 'yetkiliTelefon',    isim: 'Yetkili telefon' },
  { alan: 'yetkiliEposta',     isim: 'Yetkili e-posta' },
  { alan: 'bayiTuru',          isim: 'Bayi türü' },
  { alan: 'sehir',             isim: 'İl / bölge' },
  { alan: 'faaliyetAlani',     isim: 'Faaliyet alanı' },
  { alan: 'satisTemsilcisiId', isim: 'Satış temsilcisi' },
]

export const bayiEksikAlanlar = (firma) =>
  ZORUNLU_BAYI_ALANLARI.filter(({ alan }) => {
    const v = firma?.[alan]
    return v === null || v === undefined || String(v).trim() === ''
  })

// Sözleşme formu varsayılanları (spec §4.3)
export const SOZLESME_VARSAYILANLARI = {
  sureAy: 12,
  yillikHedefUsd: 25000,
  statuMetni: 'Münhasır olmayan, devredilemez, geri alınabilir yetkili dış bayi',
}

// ---------- Şablonlar ----------

export const sablonlariGetir = async (pasiflerDahil = false) => {
  let q = supabase.from('sozlesme_sablonlari').select('*').order('id')
  if (!pasiflerDahil) q = q.eq('aktif', true)
  const { data, error } = await q
  if (error) { console.error('sablonlariGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const sablonEkle = async (payload) => {
  const { data, error } = await supabase.from('sozlesme_sablonlari')
    .insert(toSnake(payload)).select().single()
  if (error) return { _hata: error.message }
  return toCamel(data)
}

export const sablonGuncelle = async (id, payload) => {
  const { data, error } = await supabase.from('sozlesme_sablonlari')
    .update({ ...toSnake(payload), guncelleme_tarih: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) return { _hata: error.message }
  return toCamel(data)
}

// {{degisken}} yerine değerleri koy — bilinmeyen değişkenler "—" olur
export const sablonRender = (govde, degerler) =>
  (govde || '').replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k) => {
    const v = degerler?.[k]
    return (v === null || v === undefined || String(v).trim() === '') ? '—' : String(v)
  })

const trTarih = (d) => {
  if (!d) return '—'
  const t = new Date(d)
  return isNaN(t) ? String(d) : t.toLocaleDateString('tr-TR')
}

const usd = (n) => n == null || n === '' ? '—'
  : `${Number(n).toLocaleString('tr-TR')} USD + KDV hariç tahsil edilmiş net ciro`

// Şablon değişken haritası — firma kartı + sözleşme formu → {{degiskenler}}
export const sozlesmeDegerleri = (firma, form, sozlesmeNo) => ({
  sozlesme_no: sozlesmeNo || '',
  sozlesme_tarihi: trTarih(form.sozlesmeTarihi),
  bayi_unvani: firma.firmaAdi,
  bayi_adresi: [firma.adres, firma.ilce, firma.sehir].filter(Boolean).join(' / '),
  bayi_vergi_dairesi: firma.vergiDairesi,
  bayi_vergi_no: firma.vergiNo,
  bayi_mersis_no: firma.mersisNo,
  bayi_ticaret_sicil_no: firma.ticaretSicilNo,
  bayi_yetkili_adi: firma.yetkiliAdi,
  bayi_yetkili_unvani: firma.yetkiliUnvani,
  bayi_telefon: firma.telefon,
  bayi_eposta: firma.email,
  bayi_kep_adresi: firma.kepAdresi,
  bayi_yillik_hedef: usd(form.yillikHedefUsd),
  bayi_vade_durumu: form.odemeTipi === 'vadeli' ? 'Vadeli (finans onaylı)' : 'Peşin',
  bayi_vade_gunu: form.odemeTipi === 'vadeli' && form.vadeGunu ? `${form.vadeGunu} gün` : '—',
  bayi_kredi_limiti: form.krediLimiti ? `${Number(form.krediLimiti).toLocaleString('tr-TR')} USD` : '—',
  sozlesme_suresi: `${form.sureAy || 12} ay (${trTarih(form.baslangicTarih)} – ${trTarih(form.bitisTarih)})`,
  yetkili_satici_statusu: form.statuMetni || SOZLESME_VARSAYILANLARI.statuMetni,
  imza_yetkilisi: form.imzaYetkilisi || '',
})

// ---------- Sözleşmeler ----------

// toCamel shallow — join'lenen firma objesini elle camel'a çevir
const firmaJoinCamel = (kayitlar) =>
  kayitlar.map(k => k.firma ? { ...k, firma: toCamel(k.firma) } : k)

export const bayiSozlesmeleriGetir = async () => {
  const { data, error } = await supabase
    .from('bayi_sozlesmeleri')
    .select('*, firma:firma_id (id, firma_adi, kod, bayi_statusu, vade_talebi, email, yetkili_eposta)')
    .order('id', { ascending: false })
  if (error) console.error('bayiSozlesmeleriGetir hata:', error.message)
  return firmaJoinCamel(arrayToCamel(data || []))
}

export const firmaninSozlesmeleri = async (firmaId) => {
  const { data, error } = await supabase
    .from('bayi_sozlesmeleri').select('*')
    .eq('firma_id', firmaId).order('id', { ascending: false })
  if (error) { console.error('firmaninSozlesmeleri hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

// Yaşayan (iptal/arşiv olmayan) sözleşme — mükerrer engeli için
export const YASAYAN_DURUMLAR = ['olusturuldu', 'imza_bekleniyor', 'imzalandi']
export const yasayanSozlesme = (sozlesmeler) =>
  (sozlesmeler || []).find(s => YASAYAN_DURUMLAR.includes(s.durum)) || null

export const MUKERRER_UYARI =
  'Bu bayi için aktif veya imza bekleyen bir bayi sözleşmesi bulunmaktadır. ' +
  'Yeni sözleşme oluşturmak için mevcut sözleşmeyi iptal edin veya revize edin.'

// Sözleşme üret (spec §5): numara DB trigger'ından gelir, içerik sonra render edilir.
// Yan etkiler: firma statüsü, evrak satırları, onay adımları, bildirim.
export const sozlesmeUret = async ({ firma, sablon, form, kullanici }) => {
  const eksikler = bayiEksikAlanlar(firma)
  if (eksikler.length) {
    return { _hata: 'Bayi sözleşmesi oluşturulamaz. Bayi kartında eksik zorunlu bilgiler bulunmaktadır.', _eksikler: eksikler }
  }

  const mevcutlar = await firmaninSozlesmeleri(firma.id)
  if (yasayanSozlesme(mevcutlar)) return { _hata: MUKERRER_UYARI }

  const { data: kayit, error } = await supabase.from('bayi_sozlesmeleri').insert({
    firma_id: firma.id,
    sablon_id: sablon?.id || null,
    sozlesme_tarihi: form.sozlesmeTarihi,
    baslangic_tarih: form.baslangicTarih || null,
    bitis_tarih: form.bitisTarih || null,
    sure_ay: form.sureAy || 12,
    yillik_hedef_usd: form.yillikHedefUsd || null,
    statu_metni: form.statuMetni || SOZLESME_VARSAYILANLARI.statuMetni,
    odeme_tipi: form.odemeTipi || 'pesin',
    vade_gunu: form.odemeTipi === 'vadeli' ? (form.vadeGunu || null) : null,
    kredi_limiti: form.krediLimiti || null,
    olusturan_id: kullanici?.id || null,
    olusturan_ad: kullanici?.ad || null,
  }).select().single()
  if (error) {
    if (error.code === '23505') return { _hata: MUKERRER_UYARI }
    return { _hata: error.message }
  }

  const icerik = sablonRender(sablon?.govde, sozlesmeDegerleri(firma, form, kayit.sozlesme_no))
  await supabase.from('bayi_sozlesmeleri').update({ uretilen_icerik: icerik }).eq('id', kayit.id)

  // Finansal bilgiler bayi kartına da işlenir (vade kuralı evrak/onay kontrolünde kullanılır)
  await supabase.from('firmalar').update({
    bayi_statusu: 'sozlesme_olusturuldu',
    odeme_tipi: form.odemeTipi || 'pesin',
    vade_talebi: form.odemeTipi === 'vadeli',
    vade_gunu: form.odemeTipi === 'vadeli' ? (form.vadeGunu || null) : null,
    kredi_limiti: form.krediLimiti || null,
    teminat_istegi: !!form.teminatIstegi,
    teminat_tipi: form.teminatIstegi ? (form.teminatTipi || null) : null,
    yillik_hedef_usd: form.yillikHedefUsd || null,
  }).eq('id', firma.id)
  invalidate('firmalar:list', `firma:${firma.id}`)

  await evrakSatirlariniHazirla(firma.id, kayit.id, form.odemeTipi === 'vadeli')
  await onayAdimlariniHazirla(firma.id, kayit.id)
  bayiBildirim(firma, `Yeni bayi sözleşmesi oluşturuldu`, `${firma.firmaAdi} için ${kayit.sozlesme_no} numaralı sözleşme oluşturuldu.`)

  return toCamel({ ...kayit, uretilen_icerik: icerik })
}

export const sozlesmeGuncelleDb = async (id, patch) => {
  const { data, error } = await supabase.from('bayi_sozlesmeleri')
    .update({ ...toSnake(patch), guncelleme_tarih: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) return { _hata: error.message }
  return toCamel(data)
}

// Bayiye gönderildi → sözleşme + bayi "İmza Bekleniyor" (spec §6)
export const sozlesmeGonderildiIsaretle = async (sozlesme) => {
  await sozlesmeGuncelleDb(sozlesme.id, { durum: 'imza_bekleniyor' })
  await supabase.from('firmalar').update({ bayi_statusu: 'imza_bekleniyor' }).eq('id', sozlesme.firmaId)
}

// Revizyon (spec §13): eski sözleşme arşive, aynı bilgilerle versiyon+1 yeni kayıt
export const sozlesmeRevize = async ({ sozlesme, firma, sablon, sebep, kullanici }) => {
  await sozlesmeGuncelleDb(sozlesme.id, { durum: 'arsiv' })
  const form = {
    sozlesmeTarihi: new Date().toISOString().slice(0, 10),
    baslangicTarih: sozlesme.baslangicTarih, bitisTarih: sozlesme.bitisTarih,
    sureAy: sozlesme.sureAy, yillikHedefUsd: sozlesme.yillikHedefUsd,
    statuMetni: sozlesme.statuMetni, odemeTipi: sozlesme.odemeTipi,
    vadeGunu: sozlesme.vadeGunu, krediLimiti: sozlesme.krediLimiti,
  }
  const { data: kayit, error } = await supabase.from('bayi_sozlesmeleri').insert({
    firma_id: firma.id, sablon_id: sablon?.id || sozlesme.sablonId || null,
    sozlesme_tarihi: form.sozlesmeTarihi,
    baslangic_tarih: form.baslangicTarih || null, bitis_tarih: form.bitisTarih || null,
    sure_ay: form.sureAy, yillik_hedef_usd: form.yillikHedefUsd,
    statu_metni: form.statuMetni, odeme_tipi: form.odemeTipi,
    vade_gunu: form.vadeGunu, kredi_limiti: form.krediLimiti,
    versiyon: (sozlesme.versiyon || 1) + 1,
    revizyon_sebebi: sebep || null,
    onceki_sozlesme_id: sozlesme.id,
    olusturan_id: kullanici?.id || null, olusturan_ad: kullanici?.ad || null,
  }).select().single()
  if (error) {
    // Yeni kayıt açılamadıysa eskiyi geri getir — bayi sözleşmesiz kalmasın
    await sozlesmeGuncelleDb(sozlesme.id, { durum: sozlesme.durum })
    return { _hata: error.message }
  }
  const icerik = sablonRender(sablon?.govde, sozlesmeDegerleri(firma, form, kayit.sozlesme_no))
  await supabase.from('bayi_sozlesmeleri').update({ uretilen_icerik: icerik }).eq('id', kayit.id)
  return toCamel({ ...kayit, uretilen_icerik: icerik })
}

// ---------- Dosyalar (bayi-evrak bucket) ----------

export const bayiDosyaYukle = async (firmaId, file, prefix) => {
  const uzanti = (file.name.split('.').pop() || 'pdf').toLowerCase()
  const path = `${firmaId}/${prefix}-${Date.now()}.${uzanti}`
  const { error } = await supabase.storage.from('bayi-evrak').upload(path, file)
  if (error) { console.error('bayiDosyaYukle hata:', error.message); return null }
  return path
}

export const bayiDosyaUrl = async (path) => {
  const { data, error } = await supabase.storage.from('bayi-evrak').createSignedUrl(path, 3600)
  if (error) { console.error('bayiDosyaUrl hata:', error.message); return null }
  return data?.signedUrl || null
}

// İmzalı sözleşme yükleme (spec §7) — nihai onay için PDF zorunlu
export const imzaliSozlesmeYukle = async ({ sozlesme, file, kullanici }) => {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    return { _hata: 'İmzalı sözleşme yalnızca PDF olarak yüklenebilir.' }
  }
  const path = await bayiDosyaYukle(sozlesme.firmaId, file, 'imzali-sozlesme')
  if (!path) return { _hata: 'Dosya yüklenemedi.' }

  const g = await sozlesmeGuncelleDb(sozlesme.id, {
    imzaliPdfUrl: path, imzaliPdfAd: file.name, durum: 'imzalandi',
  })
  if (g?._hata) return g

  await supabase.from('bayi_evraklar').upsert({
    firma_id: sozlesme.firmaId, sozlesme_id: sozlesme.id,
    evrak_tipi: 'imzali_sozlesme', dosya_url: path, dosya_adi: file.name,
    durum: 'yuklendi', yukleyen_id: kullanici?.id || null, yukleyen_ad: kullanici?.ad || null,
    yukleme_tarihi: new Date().toISOString(),
  }, { onConflict: 'firma_id,evrak_tipi' })

  await supabase.from('firmalar').update({ bayi_statusu: 'evrak_kontrolunde' }).eq('id', sozlesme.firmaId)
  return g
}

// ---------- Evraklar ----------

export const evraklariGetir = async (firmaId) => {
  const { data, error } = await supabase.from('bayi_evraklar')
    .select('*').eq('firma_id', firmaId).order('id')
  if (error) { console.error('evraklariGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

// Sözleşme üretilince beklenen evrak satırlarını aç (mevcutlara dokunma)
export const evrakSatirlariniHazirla = async (firmaId, sozlesmeId, vadeTalebi) => {
  const tipler = EVRAK_TIPLERI.filter(t => t.zorunlu || (t.kosullu && vadeTalebi))
  const satirlar = tipler.map(t => ({
    firma_id: firmaId, sozlesme_id: sozlesmeId, evrak_tipi: t.id, durum: 'bekleniyor',
  }))
  const { error } = await supabase.from('bayi_evraklar')
    .upsert(satirlar, { onConflict: 'firma_id,evrak_tipi', ignoreDuplicates: true })
  if (error) console.error('evrakSatirlariniHazirla hata:', error.message)
}

export const evrakYukle = async ({ firmaId, tip, file, kullanici, gecerlilikTarihi }) => {
  const tanim = evrakTip(tip)
  if (tanim?.pdfZorunlu && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    return { _hata: `${tanim.isim} yalnızca PDF olarak yüklenebilir.` }
  }
  const path = await bayiDosyaYukle(firmaId, file, tip.replace(/_/g, '-'))
  if (!path) return { _hata: 'Dosya yüklenemedi.' }
  const { data, error } = await supabase.from('bayi_evraklar').upsert({
    firma_id: firmaId, evrak_tipi: tip, dosya_url: path, dosya_adi: file.name,
    durum: 'yuklendi',
    yukleyen_id: kullanici?.id || null, yukleyen_ad: kullanici?.ad || null,
    yukleme_tarihi: new Date().toISOString(),
    gecerlilik_tarihi: gecerlilikTarihi || null,
    onaylayan_id: null, onaylayan_ad: null, onay_tarihi: null, red_sebebi: null,
  }, { onConflict: 'firma_id,evrak_tipi' }).select().single()
  if (error) return { _hata: error.message }
  return toCamel(data)
}

export const evrakDurumGuncelle = async (id, patch) => {
  const { data, error } = await supabase.from('bayi_evraklar')
    .update(toSnake(patch)).eq('id', id).select().single()
  if (error) return { _hata: error.message }
  return toCamel(data)
}

export const evrakOnayla = (evrak, kullanici) => evrakDurumGuncelle(evrak.id, {
  durum: 'onaylandi', onaylayanId: kullanici?.id || null, onaylayanAd: kullanici?.ad || null,
  onayTarihi: new Date().toISOString(), redSebebi: null,
})

export const evrakReddet = (evrak, kullanici, sebep) => evrakDurumGuncelle(evrak.id, {
  durum: 'reddedildi', onaylayanId: kullanici?.id || null, onaylayanAd: kullanici?.ad || null,
  onayTarihi: new Date().toISOString(), redSebebi: sebep || null,
})

// Süreli evrak (faaliyet belgesi) geçerlilik kontrolü — UI her yüklemede çağırır
export const evrakSuresiGectiMi = (evrak) =>
  !!evrak?.gecerlilikTarihi && new Date(evrak.gecerlilikTarihi) < new Date(new Date().toDateString())

// ---------- Onay akışı ----------

export const onaylariGetir = async (firmaId) => {
  const { data, error } = await supabase.from('bayi_onaylar')
    .select('*').eq('firma_id', firmaId).order('id')
  if (error) { console.error('onaylariGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const onayAdimlariniHazirla = async (firmaId, sozlesmeId) => {
  const satirlar = ONAY_ADIMLARI.map(a => ({
    firma_id: firmaId, sozlesme_id: sozlesmeId, adim: a.id, durum: 'bekliyor',
  }))
  const { error } = await supabase.from('bayi_onaylar')
    .upsert(satirlar, { onConflict: 'firma_id,adim', ignoreDuplicates: true })
  if (error) console.error('onayAdimlariniHazirla hata:', error.message)
}

export const onayIsle = async ({ firmaId, adim, durum, kullanici, sebep, notlar }) => {
  const { data, error } = await supabase.from('bayi_onaylar').upsert({
    firma_id: firmaId, adim, durum,
    onaylayan_id: kullanici?.id || null, onaylayan_ad: kullanici?.ad || null,
    tarih: new Date().toISOString(), sebep: sebep || null, notlar: notlar || null,
  }, { onConflict: 'firma_id,adim' }).select().single()
  if (error) return { _hata: error.message }
  return toCamel(data)
}

// Finans kontrolü hangi durumda zorunlu (spec §10)
export const finansOnayiZorunluMu = (firma) =>
  !!firma?.vadeTalebi || Number(firma?.krediLimiti || 0) > 0 || !!firma?.teminatIstegi
  || firma?.bayiStatusu === 'kara_liste'

// ---------- Merkezi aktivasyon kontrolü (spec §11 / §17 / §18 / §20) ----------

export const bayiAktivasyonKontrol = ({ firma, sozlesmeler, evraklar, onaylar }) => {
  const eksikler = []
  const sozlesme = yasayanSozlesme(sozlesmeler)

  const kartEksikleri = bayiEksikAlanlar(firma)
  if (kartEksikleri.length) {
    eksikler.push(`Bayi kartında eksik zorunlu bilgi: ${kartEksikleri.map(e => e.isim).join(', ')}`)
  }

  if (!sozlesme) {
    eksikler.push('Bayi sözleşmesi üretilmemiş')
  } else if (!sozlesme.imzaliPdfUrl) {
    eksikler.push('İmzalı Bayi Sözleşmesi PDF bekleniyor')
  }

  const evrakMap = new Map((evraklar || []).map(e => [e.evrakTipi, e]))
  for (const tip of EVRAK_TIPLERI) {
    if (tip.id === 'imzali_sozlesme') continue // sözleşme PDF kontrolü yukarıda
    const gerekli = tip.zorunlu || (tip.kosullu && firma?.vadeTalebi)
    if (!gerekli) continue
    const e = evrakMap.get(tip.id)
    if (!e || e.durum === 'bekleniyor' || e.durum === 'yenisi_talep_edildi') {
      eksikler.push(`${tip.isim} yüklenmedi`)
    } else if (e.durum === 'reddedildi') {
      eksikler.push(`${tip.isim} reddedildi${e.redSebebi ? ` (${e.redSebebi})` : ''} — yeniden yükleyin`)
    } else if (e.durum === 'suresi_gecti' || evrakSuresiGectiMi(e)) {
      eksikler.push(`${tip.isim} süresi geçmiş — güncelini yükleyin`)
    } else if (e.durum !== 'onaylandi') {
      eksikler.push(`${tip.isim} onay bekliyor`)
    }
  }

  const onayMap = new Map((onaylar || []).map(o => [o.adim, o]))
  const finansZorunlu = finansOnayiZorunluMu(firma)
  for (const adim of ONAY_ADIMLARI) {
    const o = onayMap.get(adim.id)
    if (adim.id === 'finans' && !finansZorunlu) {
      if (o?.durum === 'reddedildi') eksikler.push(`${adim.isim} reddedildi${o.sebep ? ` (${o.sebep})` : ''}`)
      continue // peşin çalışan bayide finans opsiyonel (spec §10)
    }
    if (!o || o.durum === 'bekliyor') eksikler.push(`${adim.isim} bekleniyor`)
    else if (o.durum === 'reddedildi') eksikler.push(`${adim.isim} reddedildi${o.sebep ? ` (${o.sebep})` : ''}`)
  }

  return { uygun: eksikler.length === 0, eksikler, sozlesme, finansZorunlu }
}

// Bayi statüsü güncelle (askıya alma / kara liste / pasif dahil)
export const bayiStatuGuncelle = async (firmaId, statu) => {
  const { error } = await supabase.from('firmalar').update({ bayi_statusu: statu }).eq('id', firmaId)
  if (error) return { _hata: error.message }
  invalidate('firmalar:list', `firma:${firmaId}`)
  return true
}

// Aktivasyon (spec §17) — kontrol geçmeden aktif edilemez
export const bayiAktifEt = async ({ firma, sozlesmeler, evraklar, onaylar, kullanici }) => {
  const kontrol = bayiAktivasyonKontrol({ firma, sozlesmeler, evraklar, onaylar })
  if (!kontrol.uygun) return { _hata: 'Bayi aktif edilemez. Eksik süreçler bulunmaktadır.', _eksikler: kontrol.eksikler }
  const s = await bayiStatuGuncelle(firma.id, 'aktif')
  if (s?._hata) return s
  bayiBildirim(firma,
    'Bayi aktif edildi',
    `${firma.firmaAdi} aktivasyon süreci tamamlandı — teklif, Deal Register ve fiyat listesi yetkileri açıldı.`)
  return true
}

// Teklif / Deal Register blokaj uyarıları (spec §11-12, §21)
export const BAYI_UYARILAR = {
  teklif: 'Bu bayi için teklif oluşturulamaz. Bayilik sözleşmesi ve zorunlu evrak onay süreci tamamlanmamıştır.',
  dealRegister: 'Deal Register işlemi başlatılamaz. Bayi aktivasyon süreci tamamlanmamıştır.',
  aktifDegil: 'Bu bayi aktif bayi statüsünde değildir. Teklif, Deal Register ve özel fiyat işlemleri yapılamaz.',
  imzaliEksik: 'İmzalı bayi sözleşmesi PDF olarak yüklenmeden bayi aktif edilemez.',
  mizanEksik: 'Bayi vade talep ettiği için son mizan yüklenmeden finans onayı başlatılamaz.',
  finansEksik: 'Bayi için vade/kredi limiti talebi bulunmaktadır. Finans onayı tamamlanmadan bayi aktif edilemez.',
}

// ---------- Bildirim ----------

// Satış temsilcisi + adminlere CRM içi bildirim (best-effort, akışı bloklamaz)
export const bayiBildirim = async (firma, baslik, mesaj) => {
  try {
    const { data: adminler } = await supabase.from('kullanicilar').select('id').eq('rol', 'admin')
    const alicilar = new Set((adminler || []).map(a => a.id))
    if (firma?.satisTemsilcisiId) alicilar.add(Number(firma.satisTemsilcisiId))
    if (!alicilar.size) return
    await cokluBildirimEkle([...alicilar], {
      baslik, mesaj, tip: 'bilgi', link: `/bayiler/${firma?.id || ''}`,
    })
  } catch (e) {
    console.error('bayiBildirim hata:', e?.message)
  }
}

// Eksik Evrak Takibi sekmesi — onaylanmamış tüm evrak kayıtları (firma bilgisiyle)
export const eksikEvrakKayitlari = async () => {
  const { data, error } = await supabase.from('bayi_evraklar')
    .select('*, firma:firma_id (id, firma_adi, kod, bayi_statusu, vade_talebi)')
    .neq('durum', 'onaylandi')
    .order('firma_id')
  if (error) { console.error('eksikEvrakKayitlari hata:', error.message); return [] }
  return firmaJoinCamel(arrayToCamel(data || []))
}

// Onay Bekleyenler sekmesi — tüm onay satırları (firma bilgisiyle)
export const onayKayitlariTumu = async () => {
  const { data, error } = await supabase.from('bayi_onaylar')
    .select('*, firma:firma_id (id, firma_adi, kod, bayi_statusu, vade_talebi)')
    .order('firma_id')
  if (error) { console.error('onayKayitlariTumu hata:', error.message); return [] }
  return firmaJoinCamel(arrayToCamel(data || []))
}

// ---------- Statü türetme (süreç ilerledikçe otomatik) ----------

// Manuel statüler otomatik türetmeyle EZİLMEZ
const MANUEL_STATULER = ['aktif', 'askida', 'pasif', 'kara_liste']

export const bayiStatuTuret = ({ firma, sozlesmeler, evraklar, onaylar }) => {
  const sozlesme = yasayanSozlesme(sozlesmeler)
  if (!sozlesme) return 'aday'
  if (!sozlesme.imzaliPdfUrl) {
    return sozlesme.durum === 'imza_bekleniyor' ? 'imza_bekleniyor' : 'sozlesme_olusturuldu'
  }
  const evrakMap = new Map((evraklar || []).map(e => [e.evrakTipi, e]))
  const gerekliler = EVRAK_TIPLERI.filter(t =>
    t.id !== 'imzali_sozlesme' && (t.zorunlu || (t.kosullu && firma?.vadeTalebi)))
  const evraklarTamam = gerekliler.every(t => evrakMap.get(t.id)?.durum === 'onaylandi')
  if (!evraklarTamam) return 'evrak_kontrolunde'
  const onayMap = new Map((onaylar || []).map(o => [o.adim, o]))
  if (finansOnayiZorunluMu(firma) && onayMap.get('finans')?.durum !== 'onaylandi') {
    return 'finans_onayi_bekliyor'
  }
  return 'yonetici_onayi_bekliyor'
}

// Evrak/onay işlemlerinden sonra çağrılır — manuel statülere dokunmaz
export const bayiStatuSenkronize = async ({ firma, sozlesmeler, evraklar, onaylar }) => {
  if (MANUEL_STATULER.includes(firma?.bayiStatusu)) return firma?.bayiStatusu
  const yeni = bayiStatuTuret({ firma, sozlesmeler, evraklar, onaylar })
  if (yeni !== firma?.bayiStatusu) await bayiStatuGuncelle(firma.id, yeni)
  return yeni
}

// Teklif blokajı için hafif kontrol — firma adına kayıtlı bayi var mı, aktif mi?
// Bayi kaydı yoksa (normal müşteri) engel yok.
export const bayiTeklifKontrol = async (firmaAdi) => {
  if (!firmaAdi?.trim()) return { engel: false }
  const { data } = await supabase.from('firmalar')
    .select('id, firma_adi, bayi_statusu')
    .ilike('firma_adi', firmaAdi.trim())
    .limit(1)
  const bayi = data?.[0]
  if (!bayi || !bayi.bayi_statusu) return { engel: false }
  if (bayi.bayi_statusu === 'aktif') return { engel: false, bayi: toCamel(bayi) }
  return { engel: true, bayi: toCamel(bayi), mesaj: BAYI_UYARILAR.teklif }
}
