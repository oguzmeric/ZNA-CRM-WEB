// Fatura Talebi servisi (mig 165).
//
// Akış: satışçı teklif üzerinden NUMARASIZ talep açar → "Fatura Oluşturulacak"
// kuyruğu → fatura yetkilisi gerçek faturayı keser, numarasını girer ve PDF'ini
// yükler → ancak o zaman satislar kaydı oluşur.
//
// Talep, teklifin talep anındaki ANLIK GÖRÜNTÜSÜNÜ taşır: teklif sonradan
// değişse bile muhasebenin gördüğü ve faturaladığı bilgi sabit kalır.

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cokluBildirimEkle } from './bildirimService'
import { satisEkle } from './satisService'
import { musteriGetir } from './musteriService'

export const FATURA_TALEP_DURUM = {
  BEKLIYOR:    'bekliyor',
  FATURALANDI: 'faturalandi',
  REDDEDILDI:  'reddedildi',
  IPTAL:       'iptal',
}

export const FATURA_TALEP_DURUM_META = {
  bekliyor:    { isim: 'Fatura Bekliyor', tone: 'beklemede' },
  faturalandi: { isim: 'Faturalandı',     tone: 'aktif' },
  reddedildi:  { isim: 'Reddedildi',      tone: 'kayip' },
  iptal:       { isim: 'İptal',           tone: 'neutral' },
}

// Fatura yetkisi: bayrak ya da admin. Sidebar/guard/sayfa aynı kaynağı kullansın
// diye tek yerde — üç yerde ayrı ayrı yazılınca senkron kopuyor.
export const faturaYetkisi = (kullanici) =>
  kullanici?.faturaYetkilisi === true ||
  kullanici?.fatura_yetkilisi === true ||
  kullanici?.rol === 'admin'

// ---------- Okuma ----------

export const faturaTalepleriGetir = async (durum) => {
  let q = supabase.from('fatura_talepleri').select('*').order('id', { ascending: false })
  if (durum) q = q.eq('durum', durum)
  const { data, error } = await q
  if (error) { console.error('[faturaTalepleriGetir]', error.message); return [] }
  return arrayToCamel(data)
}

export const faturaTalepGetir = async (id) => {
  const { data, error } = await supabase.from('fatura_talepleri').select('*').eq('id', id).maybeSingle()
  if (error) { console.error('[faturaTalepGetir]', error.message); return null }
  return data ? toCamel(data) : null
}

// Teklife bağlı talep (TeklifDetay'da buton durumunu belirlemek için).
// Tüm listeyi çekip filtrelemek yerine tek sorgu.
export const teklifFaturaTalebiGetir = async (teklifId) => {
  const { data, error } = await supabase
    .from('fatura_talepleri')
    .select('*')
    .eq('teklif_id', Number(teklifId))
    .order('id', { ascending: false })
    .limit(1)
  if (error) { console.error('[teklifFaturaTalebiGetir]', error.message); return null }
  return data?.[0] ? toCamel(data[0]) : null
}

export const bekleyenFaturaTalepSayisi = async () => {
  const { count, error } = await supabase
    .from('fatura_talepleri')
    .select('id', { count: 'exact', head: true })
    .eq('durum', 'bekliyor')
  if (error) { console.error('[bekleyenFaturaTalepSayisi]', error.message); return 0 }
  return count || 0
}

// ---------- Talep açma ----------

export const faturaTalebiEkle = async (talep) => {
  const { id, olusturmaTarih, guncellemeTarih, talepNo, ...rest } = talep
  const { data, error } = await supabase
    .from('fatura_talepleri')
    .insert(toSnake(rest))   // talep_no DB trigger'ından gelir
    .select()
    .single()
  if (error) { console.error('[faturaTalebiEkle]', error.message); throw error }
  const kayit = toCamel(data)
  await faturaYetkililerineBildir(kayit)
  return kayit
}

// Fatura yetkililerine bildirim (bildirimler INSERT → trigger → Expo push)
async function faturaYetkililerineBildir(talep) {
  try {
    const { data } = await supabase
      .from('kullanicilar')
      .select('id')
      .eq('tip', 'zna')
      .or('fatura_yetkilisi.eq.true,rol.eq.admin')
    const alicilar = [...new Set((data || []).map(k => k.id))]
    if (!alicilar.length) return
    await cokluBildirimEkle(alicilar, {
      baslik: `Proforma fatura — ${talep.firmaAdi}`,
      mesaj: `${talep.talepNo} · ${talep.teklifNo || 'teklif'} · ${talep.genelToplam} ${talep.paraBirimi}`,
      tip: 'uyari',
      link: '/fatura-talepleri',
      meta: { kaynak: 'fatura_talebi', talep_id: talep.id },
    })
  } catch (e) {
    console.warn('[faturaTalebi] bildirim gönderilemedi:', e?.message)
  }
}

// ---------- PDF ----------

export const faturaDosyaYukle = async (talepId, file) => {
  const uzanti = (file.name.split('.').pop() || 'pdf').toLowerCase()
  const yol = `${talepId}/fatura-${Date.now()}.${uzanti}`
  const { error } = await supabase.storage.from('fatura-belge').upload(yol, file)
  if (error) { console.error('[faturaDosyaYukle]', error.message); return null }
  return yol
}

// Bucket private — gösterim için imzalı URL şart
export const faturaDosyaUrl = async (yol) => {
  if (!yol) return null
  const { data, error } = await supabase.storage.from('fatura-belge').createSignedUrl(yol, 3600)
  if (error) { console.error('[faturaDosyaUrl]', error.message); return null }
  return data?.signedUrl ?? null
}

// ---------- Faturalama (F2) ----------

/**
 * Talebi gerçek faturaya dönüştürür: satislar kaydını AÇAR ve talebi kapatır.
 * Satış kaydı yalnız burada oluşur — talep aşamasında ciro/raporlara sızmasın.
 */
export const faturayiKaydet = async ({ talep, faturaNo, faturaTarihi, dosya, kullanici, odemeSekli }) => {
  const no = (faturaNo || '').trim()
  if (!no) return { _hata: 'Fatura numarası zorunludur.' }

  if (dosya) {
    const pdfMi = dosya.type === 'application/pdf' || /\.pdf$/i.test(dosya.name)
    if (!pdfMi) return { _hata: 'Fatura dosyası PDF olmalıdır.' }
  }

  // Aynı fatura no ile başka kayıt var mı? (satislar.fatura_no unique)
  const { data: cakisan } = await supabase
    .from('satislar').select('id').eq('fatura_no', no).limit(1)
  if (cakisan?.length) return { _hata: `${no} numaralı fatura zaten kayıtlı.` }

  let pdfYol = talep.faturaPdfYol || null
  let pdfAd = talep.faturaPdfAd || null
  if (dosya) {
    pdfYol = await faturaDosyaYukle(talep.id, dosya)
    if (!pdfYol) return { _hata: 'PDF yüklenemedi.' }
    pdfAd = dosya.name
  }

  // satislar kaydı — talebin anlık görüntüsünden
  let satis
  try {
    satis = await satisEkle({
      faturaNo: no,
      // Talebin FTL- numarası satışa iç takip numarası olarak taşınır; DB
      // trigger'ı dolu istek_no'ya dokunmaz (mig 167).
      istekNo: talep.talepNo || null,
      firmaAdi: talep.firmaAdi,
      musteriYetkili: talep.yetkiliAdi || '',
      musteriEmail: talep.email || '',
      musteriTelefon: talep.telefon || '',
      vergiNo: talep.vergiNo || '',
      vergiDairesi: talep.vergiDairesi || '',
      faturaPdfYol: pdfYol,
      faturaPdfAd: pdfAd,
      faturaTarihi: faturaTarihi || new Date().toISOString().slice(0, 10),
      vadeTarihi: talep.vadeTarihi || null,
      durum: 'gonderildi',
      paraBirimi: talep.paraBirimi || 'TL',
      notlar: talep.talepNotu || '',
      teklifId: talep.teklifId ? String(talep.teklifId) : null,
      teklifNo: talep.teklifNo || '',
      araToplam: Number(talep.araToplam) || 0,
      iskontoToplam: 0,
      kdvToplam: Number(talep.kdvToplam) || 0,
      genelToplam: Number(talep.genelToplam) || 0,
      odenenToplam: 0,
      satirlar: (talep.kalemler || []).map((k, i) => ({
        stokKodu: k.stokKodu || '',
        urunAdi: k.urunAdi || '',
        aciklama: k.aciklama || '',
        miktar: Number(k.miktar) || 0,
        birim: k.birim || 'Adet',
        birimFiyat: Number(k.birimFiyat) || 0,
        iskontoOran: Number(k.iskontoOran) || 0,
        kdvOran: Number(k.kdvOran) || 20,
        araToplam: Number(k.araToplam) || 0,
        kdvTutar: Number(k.kdvTutar) || 0,
        satirToplam: Number(k.satirToplam) || 0,
        sira: i,
      })),
    })
  } catch (e) {
    return { _hata: 'Fatura kaydı oluşturulamadı: ' + (e?.message || 'bilinmeyen') }
  }

  const { data, error } = await supabase
    .from('fatura_talepleri')
    .update({
      durum: 'faturalandi',
      fatura_no: no,
      fatura_tarihi: faturaTarihi || new Date().toISOString().slice(0, 10),
      fatura_pdf_yol: pdfYol,
      fatura_pdf_ad: pdfAd,
      // Ödeme yöntemi kesim anında muhasebe tarafından belirlenebilir (servis
      // kaynaklı taleplerde teklif olmadığı için boş gelir).
      odeme_sekli: odemeSekli || talep.odemeSekli || null,
      faturalayan_id: kullanici?.id ?? null,
      faturalayan_ad: kullanici?.ad ?? '',
      faturalama_tarihi: new Date().toISOString(),
      satis_id: satis?.id ?? null,
      red_nedeni: null,
    })
    .eq('id', talep.id)
    .select()
    .single()
  if (error) { console.error('[faturayiKaydet]', error.message); return { _hata: error.message } }

  const kesilen = toCamel(data)
  await talepEdeneBildir(kesilen, 'faturalandi')
  await adminlereFaturaKesildiBildir(kesilen)
  // Servis kaynaklıysa servisin fatura durumu geri-link zaten var; ek işlem yok.
  return kesilen
}

// Fatura kesilince adminlere bildir ("Fatura bizim bilgimiz olmalı")
async function adminlereFaturaKesildiBildir(talep) {
  try {
    const { data } = await supabase.from('kullanicilar').select('id').eq('rol', 'admin')
    const alicilar = [...new Set((data || []).map(k => k.id))].filter(id => id !== talep.faturalayanId)
    if (!alicilar.length) return
    await cokluBildirimEkle(alicilar, {
      baslik: `🧾 Fatura kesildi — ${talep.faturaNo}`,
      mesaj: `${talep.firmaAdi} · ${talep.talepNo}${talep.genelToplam ? ` · ${talep.genelToplam} ${talep.paraBirimi}` : ''}`,
      tip: 'basari',
      link: '/fatura-talepleri',
      meta: { kaynak: 'fatura_talebi', talep_id: talep.id, olay: 'faturalandi' },
    })
  } catch (e) {
    console.warn('[faturaTalebi] admin bildirim:', e?.message)
  }
}

export const faturaTalebiReddet = async ({ talep, redNedeni, kullanici }) => {
  const neden = (redNedeni || '').trim()
  if (!neden) return { _hata: 'Red nedeni zorunludur.' }
  const { data, error } = await supabase
    .from('fatura_talepleri')
    .update({
      durum: 'reddedildi',
      red_nedeni: neden,
      faturalayan_id: kullanici?.id ?? null,
      faturalayan_ad: kullanici?.ad ?? '',
      faturalama_tarihi: new Date().toISOString(),
    })
    .eq('id', talep.id)
    .select()
    .single()
  if (error) { console.error('[faturaTalebiReddet]', error.message); return { _hata: error.message } }
  await talepEdeneBildir(toCamel(data), 'reddedildi')
  return toCamel(data)
}

// Reddedilen/iptal talebi tekrar kuyruğa al
export const faturaTalebiGeriAl = async (talepId) => {
  const { data, error } = await supabase
    .from('fatura_talepleri')
    .update({ durum: 'bekliyor', red_nedeni: null })
    .eq('id', talepId)
    .select()
    .single()
  if (error) { console.error('[faturaTalebiGeriAl]', error.message); return { _hata: error.message } }
  return toCamel(data)
}

async function talepEdeneBildir(talep, sonuc) {
  try {
    if (!talep?.talepEdenId) return
    const faturalandi = sonuc === 'faturalandi'
    await cokluBildirimEkle([talep.talepEdenId], {
      baslik: faturalandi
        ? `Faturanız kesildi — ${talep.faturaNo}`
        : `Fatura talebiniz reddedildi — ${talep.talepNo}`,
      mesaj: faturalandi
        ? `${talep.firmaAdi} · ${talep.talepNo}`
        : `${talep.firmaAdi} · ${talep.redNedeni || ''}`,
      tip: faturalandi ? 'basari' : 'hata',
      link: '/fatura-talepleri',
      meta: { kaynak: 'fatura_talebi', talep_id: talep.id },
    })
  } catch (e) {
    console.warn('[faturaTalebi] talep edene bildirim:', e?.message)
  }
}

// ---------- Teklif → talep verisi ----------

/**
 * Teklifin ANLIK GÖRÜNTÜSÜNÜ talep alanlarına çevirir.
 * Eski localStorage devri müşteri e-posta/telefon, para birimi, vade ve notları
 * hiç taşımıyordu — burada künye de dahil hepsi taşınır.
 */
export const tekliftenTalep = (teklif, musteri, kullanici) => {
  const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100
  const kalemler = (teklif.satirlar || []).map(s => {
    const miktar = Number(s.miktar) || 0
    const birimFiyat = Number(s.birimFiyat) || 0
    const iskonto = Number(s.iskonto) || 0
    const kdv = Number(s.kdv) || 0
    const ara = r2(miktar * birimFiyat * (1 - iskonto / 100))
    const kdvTutar = r2(ara * kdv / 100)
    return {
      stokKodu: s.stokKodu || '',
      urunAdi: s.stokAdi || s.aciklama || '',
      aciklama: s.aciklama || '',
      miktar, birim: s.birim || 'Adet', birimFiyat,
      iskontoOran: iskonto, kdvOran: kdv,
      araToplam: ara, kdvTutar, satirToplam: r2(ara + kdvTutar),
    }
  })
  const araToplam = r2(kalemler.reduce((a, k) => a + k.araToplam, 0))
  const kdvToplam = r2(kalemler.reduce((a, k) => a + k.kdvTutar, 0))
  // Teklifin kendi genel toplamı önce; yoksa kalemlerden türet (teklifler.genel_toplam
  // 62 kayıtta boş — bkz. satisSozlesmeService.anaToplamCoz)
  const genel = Number(teklif.genelToplam)
  return {
    teklifId: teklif.id ? Number(teklif.id) : null,
    teklifNo: teklif.teklifNo || '',
    musteriId: musteri?.id ? Number(musteri.id) : (teklif.musteriId ? Number(teklif.musteriId) : null),
    firmaAdi: teklif.firmaAdi || musteri?.firma || '',
    yetkiliAdi: teklif.musteriYetkilisi || [musteri?.ad, musteri?.soyad].filter(Boolean).join(' '),
    vergiNo: musteri?.vergiNo || '',
    vergiDairesi: musteri?.vergiDairesi || '',
    adres: [musteri?.adres, musteri?.sehir].filter(Boolean).join(' · '),
    telefon: musteri?.telefon || '',
    email: musteri?.email || '',
    konu: teklif.konu || '',
    paraBirimi: ['TL', 'USD', 'EUR'].includes(teklif.paraBirimi) ? teklif.paraBirimi : 'TL',
    dovizKuru: Number(teklif.dovizKuru) || null,
    kalemler,
    araToplam, kdvToplam,
    genelToplam: Number.isFinite(genel) && genel > 0 ? r2(genel) : r2(araToplam + kdvToplam),
    odemeSekli: teklif.odemeSecenegi || teklif.odemeSekli || '',
    vadeTarihi: null,
    talepEdenId: kullanici?.id ?? null,
    talepEdenAd: kullanici?.ad ?? '',
  }
}

// ---------- Servisten proforma ----------

/**
 * Servisten fatura_talebi payload'ı. Servislerin fiyatlı kalemi YOK — proforma
 * müşteri künyesi + servis konusuyla, tutarlar BOŞ açılır; muhasebe gerçek
 * faturayı keserken tutar + ödeme + PDF girer.
 */
export const servistenTalep = (servis, musteri, kullanici, not = '') => ({
  servisTalepId: servis.id ? Number(servis.id) : null,
  teklifId: null,
  teklifNo: '',
  musteriId: musteri?.id ? Number(musteri.id) : (servis.musteriId ? Number(servis.musteriId) : null),
  firmaAdi: servis.firmaAdi || musteri?.firma || servis.musteriAd || '',
  yetkiliAdi: [musteri?.ad, musteri?.soyad].filter(Boolean).join(' ') || servis.musteriAd || '',
  vergiNo: musteri?.vergiNo || '',
  vergiDairesi: musteri?.vergiDairesi || '',
  adres: [musteri?.adres, musteri?.sehir].filter(Boolean).join(' · '),
  telefon: musteri?.telefon || '',
  email: musteri?.email || '',
  konu: servis.konu ? `Servis: ${servis.konu}` : 'Servis faturası',
  paraBirimi: 'TL',
  dovizKuru: null,
  kalemler: [],
  araToplam: 0, kdvToplam: 0, genelToplam: 0,
  odemeSekli: '',
  vadeTarihi: null,
  talepNotu: not || '',
  talepEdenId: kullanici?.id ?? null,
  talepEdenAd: kullanici?.ad ?? '',
})

/**
 * Servis için "Fatura Kesilecek" — proforma açar + servise geri-link yazar.
 * Aynı servise ikinci açık proforma engeli (uq_fatura_talep_acik_servis).
 */
export const servistenFaturaTalebiAc = async ({ servis, kullanici, not = '' }) => {
  // Zaten açık talep var mı?
  const { data: mevcut } = await supabase
    .from('fatura_talepleri')
    .select('id, talep_no, durum')
    .eq('servis_talep_id', servis.id)
    .eq('durum', 'bekliyor')
    .maybeSingle()
  if (mevcut) return { _hata: `Bu servise zaten açık bir proforma var (${mevcut.talep_no}).` }

  const musteri = servis.musteriId ? await musteriGetir(servis.musteriId).catch(() => null) : null
  const payload = servistenTalep(servis, musteri, kullanici, not)
  let kayit
  try {
    kayit = await faturaTalebiEkle(payload)
  } catch (e) {
    if (String(e?.message || '').includes('uq_fatura_talep_acik_servis')) {
      return { _hata: 'Bu servise zaten açık bir proforma var.' }
    }
    return { _hata: 'Proforma açılamadı: ' + (e?.message || 'bilinmeyen') }
  }
  // Servise geri-link (durum gösterimi için)
  await supabase.from('servis_talepleri').update({ fatura_talep_id: kayit.id }).eq('id', servis.id)
  return kayit
}

// Servisin fatura talebi durumunu getir (ServisTalepDetay rozetleri için)
export const servisFaturaTalebiGetir = async (servisId) => {
  const { data } = await supabase
    .from('fatura_talepleri')
    .select('id, talep_no, durum, fatura_no')
    .eq('servis_talep_id', servisId)
    .order('id', { ascending: false })
    .limit(1)
  return data?.[0] ? toCamel(data[0]) : null
}

// ---------- Siparişten proforma (mig 182, madde 23) ----------

/**
 * Siparişten fatura_talebi payload'ı. Servisten farkı: sipariş FİYATLI kalem
 * taşır (siparis_kalemleri) — proforma kalem anlık görüntüsüyle dolu açılır.
 * kalemler param = siparisService.kalemleriGetir() çıktısı (camelCase).
 */
export const siparistenTalep = (siparis, kalemler, musteri, kullanici, not = '') => {
  const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100
  const fKalemler = (kalemler || []).map(k => {
    const miktar = Number(k.miktar) || 0
    const birimFiyat = Number(k.birimFiyat) || 0
    const iskonto = Number(k.iskontoOrani) || 0
    const kdv = Number(k.kdvOrani) || 0
    const ara = r2(miktar * birimFiyat * (1 - iskonto / 100))
    const kdvTutar = r2(ara * kdv / 100)
    return {
      stokKodu: k.stokKodu || '',
      urunAdi: k.urunAd || [k.urunMarka, k.urunModel].filter(Boolean).join(' ') || '',
      aciklama: k.aciklama || '',
      miktar, birim: k.birim || 'Adet', birimFiyat,
      iskontoOran: iskonto, kdvOran: kdv,
      araToplam: ara, kdvTutar, satirToplam: r2(ara + kdvTutar),
    }
  })
  const araToplam = r2(fKalemler.reduce((a, k) => a + k.araToplam, 0))
  const kdvToplam = r2(fKalemler.reduce((a, k) => a + k.kdvTutar, 0))
  // Siparişin kendi genel toplamı otorite (genel iskonto orada uygulanmış olabilir)
  const genel = Number(siparis.genelToplam)
  return {
    siparisId: siparis.id ? Number(siparis.id) : null,
    teklifId: null,
    teklifNo: siparis.siparisNo || '',   // kuyrukta kaynak no görünsün (kolon adı tarihsel)
    musteriId: musteri?.id ? Number(musteri.id) : (siparis.musteriId ? Number(siparis.musteriId) : null),
    firmaAdi: musteri?.firma || '',
    yetkiliAdi: [musteri?.ad, musteri?.soyad].filter(Boolean).join(' '),
    vergiNo: musteri?.vergiNo || '',
    vergiDairesi: musteri?.vergiDairesi || '',
    adres: [musteri?.adres, musteri?.sehir].filter(Boolean).join(' · '),
    telefon: musteri?.telefon || '',
    email: musteri?.email || '',
    konu: siparis.konu ? `Sipariş: ${siparis.konu}` : `Sipariş ${siparis.siparisNo || ''}`.trim(),
    paraBirimi: ['TL', 'USD', 'EUR'].includes(siparis.paraBirimi) ? siparis.paraBirimi : 'TL',
    dovizKuru: Number(siparis.dovizKuru) || null,
    kalemler: fKalemler,
    araToplam, kdvToplam,
    genelToplam: Number.isFinite(genel) && genel > 0 ? r2(genel) : r2(araToplam + kdvToplam),
    odemeSekli: '',
    vadeTarihi: null,
    talepNotu: not || '',
    talepEdenId: kullanici?.id ?? null,
    talepEdenAd: kullanici?.ad ?? '',
  }
}

/**
 * Sipariş için "Fatura Kesilecek" — proforma açar + siparişe geri-link yazar.
 * Aynı siparişe ikinci açık proforma engeli (uq_fatura_talep_acik_siparis).
 */
export const siparistenFaturaTalebiAc = async ({ siparis, kalemler, kullanici, not = '' }) => {
  const { data: mevcut } = await supabase
    .from('fatura_talepleri')
    .select('id, talep_no, durum')
    .eq('siparis_id', siparis.id)
    .eq('durum', 'bekliyor')
    .maybeSingle()
  if (mevcut) return { _hata: `Bu siparişe zaten açık bir proforma var (${mevcut.talep_no}).` }

  const musteri = siparis.musteriId ? await musteriGetir(siparis.musteriId).catch(() => null) : null
  const payload = siparistenTalep(siparis, kalemler, musteri, kullanici, not)
  let kayit
  try {
    kayit = await faturaTalebiEkle(payload)
  } catch (e) {
    if (String(e?.message || '').includes('uq_fatura_talep_acik_siparis')) {
      return { _hata: 'Bu siparişe zaten açık bir proforma var.' }
    }
    return { _hata: 'Proforma açılamadı: ' + (e?.message || 'bilinmeyen') }
  }
  // Siparişe geri-link (rozet + Kullanılan Malzemeler ekranı için)
  await supabase.from('siparisler').update({ fatura_talep_id: kayit.id }).eq('id', siparis.id)
  return kayit
}

// Siparişin fatura talebi durumunu getir (SiparisDetay rozeti için)
export const siparisFaturaTalebiGetir = async (siparisId) => {
  const { data } = await supabase
    .from('fatura_talepleri')
    .select('id, talep_no, durum, fatura_no')
    .eq('siparis_id', siparisId)
    .order('id', { ascending: false })
    .limit(1)
  return data?.[0] ? toCamel(data[0]) : null
}
