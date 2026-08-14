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
import { smsGonderVeLogla } from './smsLogService'
import { satisEkle } from './satisService'
import { musteriGetir } from './musteriService'
import { lokasyonAdiGetir } from './musteriLokasyonService'
import { formEnvanterKalemleri } from './servisMalzemeService'
import { proformaHesapla, kalemPayload, kalemleriDogrula, tutarDegistiMi } from '../lib/proformaKalem'

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

  // İŞ KURALI (06.08): proforma TEKLİFTEN kesilmez — teklif siparişe
  // dönüştükten sonra SİPARİŞ üzerinden kesilir. Teklif + sipariş yolu birlikte
  // açıkken aynı iş iki kez proformalanıyordu (FTL-16/22 ve FTL-17/21 çiftleri).
  // Servis talebi kaynaklı proformalar bu kuralın dışındadır.
  if (rest.teklifId && !rest.siparisId && !rest.servisTalepId) {
    throw new Error('Proforma teklif aşamasında kesilemez. Teklifi siparişe dönüştürüp proformayı sipariş üzerinden oluşturun.')
  }

  // Aynı siparişe ikinci proforma da açılmasın (reddedilmişse yenisi serbest)
  if (rest.siparisId) {
    const { data: mevcut } = await supabase
      .from('fatura_talepleri')
      .select('talep_no, durum')
      .eq('siparis_id', Number(rest.siparisId))
      .neq('durum', 'reddedildi')
      .limit(1)
    if (mevcut?.[0]) {
      throw new Error(`Bu sipariş için zaten ${mevcut[0].talep_no} numaralı proforma var (${mevcut[0].durum}).`)
    }
  }

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
// + fatura yetkililerine (muhasebe — Abdullah İğde) SMS ve MAİL
async function faturaYetkililerineBildir(talep) {
  try {
    const { data } = await supabase
      .from('kullanicilar')
      .select('id, ad, cep_telefon, fatura_yetkilisi')
      .eq('tip', 'zna')
      .or('fatura_yetkilisi.eq.true,rol.eq.admin')
    const kisiler = data || []
    const alicilar = [...new Set(kisiler.map(k => k.id))]
    if (!alicilar.length) return
    // Servis kaynaklı proformada tutar yok — "0 TL" yazmak yanıltıyor
    const tutarMetni = Number(talep.genelToplam) > 0
      ? `${talep.genelToplam} ${talep.paraBirimi}`
      : 'tutar kesimde girilecek'
    const kaynakMetni = talep.teklifNo || (talep.servisTalepId ? 'servis faturası' : 'talep')
    await cokluBildirimEkle(alicilar, {
      baslik: `Proforma fatura — ${talep.firmaAdi}`,
      mesaj: `${talep.talepNo} · ${kaynakMetni} · ${tutarMetni}`,
      tip: 'uyari',
      link: '/fatura-talepleri',
      meta: { kaynak: 'fatura_talebi', talep_id: talep.id },
    })

    // SMS — yalnız fatura YETKİLİLERİNE (muhasebe); adminlere in-app yeter.
    // Telefonu boş olan yetkili sms_gonderim_log'a 'atlandi' düşer.
    const smsMesaj = `ZNA CRM: Yeni proforma fatura talebi ${talep.talepNo} - ${(talep.firmaAdi || '').slice(0, 40)}. Tutar: ${Number(talep.genelToplam) > 0 ? `${talep.genelToplam} ${talep.paraBirimi}` : 'kesimde girilecek'}. Detay: talep.znateknoloji.com/fatura-talepleri`
    for (const k of kisiler.filter(x => x.faturaYetkilisi ?? x.fatura_yetkilisi)) {
      smsGonderVeLogla({
        gsm: k.cep_telefon || '',
        mesaj: smsMesaj,
        amac: 'proforma_bildirim',
        refTablo: 'fatura_talepleri',
        refId: talep.id,
        aliciKullaniciId: k.id,
        aliciAd: k.ad,
        gonderenKullaniciId: talep.talepEdenId || null,
      }).catch(() => {})
    }

    // MAİL — alıcı listesi edge fn içinde sunucu tarafında belirlenir
    // (fatura_yetkilisi=true + abdullahigde@znateknoloji.com fallback)
    supabase.functions.invoke('proforma-mail', {
      body: {
        talepNo: talep.talepNo,
        firmaAdi: talep.firmaAdi,
        teklifNo: talep.teklifNo,
        genelToplam: talep.genelToplam,
        paraBirimi: talep.paraBirimi,
      },
    }).catch(e => console.warn('[faturaTalebi] mail gönderilemedi:', e?.message))
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

// İrsaliye — aynı private bucket, PDF veya resim (tarama/foto) kabul
export const irsaliyeDosyaYukle = async (talepId, file) => {
  const uzanti = (file.name.split('.').pop() || 'pdf').toLowerCase()
  const yol = `${talepId}/irsaliye-${Date.now()}.${uzanti}`
  const { error } = await supabase.storage.from('fatura-belge').upload(yol, file)
  if (error) { console.error('[irsaliyeDosyaYukle]', error.message); return null }
  return yol
}

// Faturalandıktan SONRA da irsaliye eklenebilsin (mig 191)
export const irsaliyeKaydet = async (talep, file) => {
  const uygun = file.type === 'application/pdf' || file.type.startsWith('image/')
  if (!uygun) return { _hata: 'İrsaliye PDF veya resim olmalıdır.' }
  const yol = await irsaliyeDosyaYukle(talep.id, file)
  if (!yol) return { _hata: 'İrsaliye yüklenemedi.' }
  const { data, error } = await supabase
    .from('fatura_talepleri')
    .update({ irsaliye_yol: yol, irsaliye_ad: file.name })
    .eq('id', talep.id)
    .select()
    .single()
  if (error) { console.error('[irsaliyeKaydet]', error.message); return { _hata: error.message } }
  return toCamel(data)
}

// Faturalandıktan SONRA fatura PDF'ini değiştir — yeni dosyayı yükler, DB + satış
// kaydını senkronlar, eski storage dosyasını temizler (yetim kalmasın).
export const faturaPdfDegistir = async (talep, file) => {
  const pdfMi = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!pdfMi) return { _hata: 'Fatura dosyası PDF olmalıdır.' }
  const yeniYol = await faturaDosyaYukle(talep.id, file)
  if (!yeniYol) return { _hata: 'PDF yüklenemedi.' }
  const eski = talep.faturaPdfYol
  const { data, error } = await supabase
    .from('fatura_talepleri')
    .update({ fatura_pdf_yol: yeniYol, fatura_pdf_ad: file.name })
    .eq('id', talep.id)
    .select()
    .single()
  if (error) { console.error('[faturaPdfDegistir]', error.message); return { _hata: error.message } }
  // Satış kaydı aynı dosyayı gösterir (Müşteriye Gönder / satış PDF'i) — senkronla
  if (talep.satisId) {
    await supabase.from('satislar')
      .update({ fatura_pdf_yol: yeniYol, fatura_pdf_ad: file.name })
      .eq('id', talep.satisId)
  }
  if (eski && eski !== yeniYol) supabase.storage.from('fatura-belge').remove([eski]).catch(() => {})
  return toCamel(data)
}

// Fatura PDF'ini kaldır (yanlış dosya yüklendiğinde). Müşteriye Gönder butonu
// tekrar dosya yüklenene dek gizlenir.
export const faturaPdfSil = async (talep) => {
  const eski = talep.faturaPdfYol
  const { data, error } = await supabase
    .from('fatura_talepleri')
    .update({ fatura_pdf_yol: null, fatura_pdf_ad: null })
    .eq('id', talep.id)
    .select()
    .single()
  if (error) { console.error('[faturaPdfSil]', error.message); return { _hata: error.message } }
  if (talep.satisId) {
    await supabase.from('satislar')
      .update({ fatura_pdf_yol: null, fatura_pdf_ad: null })
      .eq('id', talep.satisId)
  }
  if (eski) supabase.storage.from('fatura-belge').remove([eski]).catch(() => {})
  return toCamel(data)
}

// İrsaliyeyi kaldır
export const irsaliyeSil = async (talep) => {
  const eski = talep.irsaliyeYol
  const { data, error } = await supabase
    .from('fatura_talepleri')
    .update({ irsaliye_yol: null, irsaliye_ad: null })
    .eq('id', talep.id)
    .select()
    .single()
  if (error) { console.error('[irsaliyeSil]', error.message); return { _hata: error.message } }
  if (eski) supabase.storage.from('fatura-belge').remove([eski]).catch(() => {})
  return toCamel(data)
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
export const faturayiKaydet = async ({ talep, faturaNo, faturaTarihi, dosya, irsaliyeDosya, kullanici, odemeSekli, tutar }) => {
  const no = (faturaNo || '').trim()
  if (!no) return { _hata: 'Fatura numarası zorunludur.' }

  // Tutar: proforma 0 TL açıldıysa (servis kaynaklı) muhasebe kesim anında girer.
  // 0 TL fatura = satislar'a 0 TL ciro kaydı (FTL-2026-000025 olayı) — hangi
  // kaynaktan gelirse gelsin ASLA kaydedilmez.
  const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100
  const girildi = Number(tutar?.araToplam) > 0 || Number(tutar?.kdvToplam) > 0
  const araT = girildi ? r2(tutar?.araToplam) : (Number(talep.araToplam) || 0)
  const kdvT = girildi ? r2(tutar?.kdvToplam) : (Number(talep.kdvToplam) || 0)
  const genelT = girildi ? r2(araT + kdvT) : (Number(talep.genelToplam) || 0)
  if (!(genelT > 0)) {
    return { _hata: 'Fatura tutarı 0 olamaz — kesilen faturanın KDV hariç toplamı ile KDV tutarını girin.' }
  }

  if (dosya) {
    const pdfMi = dosya.type === 'application/pdf' || /\.pdf$/i.test(dosya.name)
    if (!pdfMi) return { _hata: 'Fatura dosyası PDF olmalıdır.' }
  }
  if (irsaliyeDosya) {
    const uygun = irsaliyeDosya.type === 'application/pdf' || irsaliyeDosya.type.startsWith('image/')
    if (!uygun) return { _hata: 'İrsaliye PDF veya resim olmalıdır.' }
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
  let irsYol = talep.irsaliyeYol || null
  let irsAd = talep.irsaliyeAd || null
  if (irsaliyeDosya) {
    irsYol = await irsaliyeDosyaYukle(talep.id, irsaliyeDosya)
    if (!irsYol) return { _hata: 'İrsaliye yüklenemedi.' }
    irsAd = irsaliyeDosya.name
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
      araToplam: araT,
      iskontoToplam: 0,
      kdvToplam: kdvT,
      genelToplam: genelT,
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
      irsaliye_yol: irsYol,
      irsaliye_ad: irsAd,
      // Ödeme yöntemi kesim anında muhasebe tarafından belirlenebilir (servis
      // kaynaklı taleplerde teklif olmadığı için boş gelir).
      odeme_sekli: odemeSekli || talep.odemeSekli || null,
      faturalayan_id: kullanici?.id ?? null,
      faturalayan_ad: kullanici?.ad ?? '',
      faturalama_tarihi: new Date().toISOString(),
      satis_id: satis?.id ?? null,
      red_nedeni: null,
      // Kesim anında girilen tutar talebe de işlenir — talep kaydı ve
      // proforma çıktısı gerçek faturayı yansıtsın
      ...(girildi ? { ara_toplam: araT, kdv_toplam: kdvT, genel_toplam: genelT } : {}),
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

/**
 * BEDELSİZ KAPATMA (mig 282) — bakım anlaşması kapsamındaki iş.
 *
 * Neden ayrı fonksiyon: `faturayiKaydet` fatura numarası ve 0'dan büyük tutar
 * ŞART koşuyor (0 TL ciro kaydını engellemek için, FTL-25 olayı). Bakım
 * kapsamındaki işte bedel alınmadığı için o kapıdan geçemiyordu ve proformalar
 * kuyrukta asılı kalıyordu (canlıda 12 kayıt).
 *
 * ⚠️ `satislar` kaydı OLUŞTURULMAZ — kullanıcı kararı (12.08.2026): bedelsiz iş
 * ciroya girmemeli. Bu yüzden `satis_id` boş kalır, `fatura_no` boş kalır.
 * Kayıt "faturalandi" durumuna geçer ama `bedelsiz=true` ile ayırt edilir.
 */
export const bedelsizKapat = async ({ talep, kullanici, sebep }) => {
  if (talep?.durum !== 'bekliyor') {
    return { _hata: 'Yalnızca bekleyen proforma bedelsiz kapatılabilir.' }
  }
  if (Number(talep?.genelToplam) > 0) {
    return { _hata: 'Bu proformada tutar girilmiş. Bedelsiz kapatmak için önce tutarı sıfırlayın.' }
  }
  const { data, error } = await supabase
    .from('fatura_talepleri')
    .update({
      durum: 'faturalandi',
      bedelsiz: true,
      bedelsiz_sebep: (sebep || '').trim() || BEDELSIZ_SEBEP_VARSAYILAN,
      // Bedel yok: fatura numarası, PDF ve satış kaydı DA yok.
      fatura_no: null,
      satis_id: null,
      fatura_tarihi: new Date().toISOString().slice(0, 10),
      faturalayan_id: kullanici?.id ?? null,
      faturalayan_ad: kullanici?.ad ?? '',
      faturalama_tarihi: new Date().toISOString(),
      red_nedeni: null,
    })
    .eq('id', talep.id)
    .eq('durum', 'bekliyor')   // yarış koruması: iki sekmeden aynı anda kapatma
    .select()
    .single()
  if (error) { console.error('[bedelsizKapat]', error.message); return { _hata: error.message } }

  const kapanan = toCamel(data)
  await talepEdeneBildir(kapanan, 'faturalandi')
  return kapanan
}

/**
 * Bedelsiz olarak İŞARETLE — kaldırma işleminin geri alması.
 * ⚠️ Bu yol olmadan işaret tek yönlüydü: yanlışlıkla "faturalanacak" denince
 * geri dönmek için veritabanına girmek gerekiyordu (12.08 canlı vaka:
 * FTL-2026-000037/38). Tutar girilmişse engellenir — o iş artık ücretlidir.
 */
export const bedelsizIsaretle = async (talepId, sebep) => {
  const { data: mevcut } = await supabase
    .from('fatura_talepleri').select('genel_toplam, durum').eq('id', talepId).maybeSingle()
  if (mevcut?.durum !== 'bekliyor') return { _hata: 'Yalnızca bekleyen proforma işaretlenebilir.' }
  if (Number(mevcut?.genel_toplam) > 0) {
    return { _hata: 'Bu proformada tutar girilmiş. Bedelsiz yapmak için önce tutarı temizleyin.' }
  }
  const { data, error } = await supabase
    .from('fatura_talepleri')
    .update({ bedelsiz: true, bedelsiz_sebep: (sebep || '').trim() || BEDELSIZ_SEBEP_VARSAYILAN })
    .eq('id', talepId)
    .eq('durum', 'bekliyor')
    .select()
    .single()
  if (error) { console.error('[bedelsizIsaretle]', error.message); return { _hata: error.message } }
  return toCamel(data)
}

/** Bedelsiz işaretini kaldır — iş aslında ücretliyse normal kesime döner. */
export const bedelsizIsaretiniKaldir = async (talepId) => {
  const { data, error } = await supabase
    .from('fatura_talepleri')
    .update({ bedelsiz: false, bedelsiz_sebep: null })
    .eq('id', talepId)
    .eq('durum', 'bekliyor')
    .select()
    .single()
  if (error) { console.error('[bedelsizIsaretiniKaldir]', error.message); return { _hata: error.message } }
  return toCamel(data)
}

// ---------- Kalem / tutar düzeltme (mig 283) ----------

const PARA_SEMBOL = { TL: '₺', USD: '$', EUR: '€' }
const paraMetni = (n, pb) =>
  `${PARA_SEMBOL[pb] || '₺'}${(Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * PROFORMA KALEMLERİNİ DÜZELT (mig 283).
 *
 * Neden var: teknisyen servis faturasının kalemlerini mobilden fiyatlıyor.
 * Fatura yetkilisi rakamı yanlış bulduğunda tek çıkışı proformayı REDDETMEK ve
 * teknisyene geri göndermekti — teknisyen sahadayken yarım gün kayıp.
 *
 * ⚠️ `ilk_genel_toplam` BURADAN YAZILMAZ: DB trigger'ı doldurur ve korur, aksi
 * hâlde iki sekmeden arka arkaya düzeltme teknisyenin ilk rakamını siler.
 */
export const proformaKalemleriGuncelle = async ({ talep, kalemler, kullanici }) => {
  if (talep?.durum !== 'bekliyor') {
    return { _hata: 'Yalnızca bekleyen proformanın kalemleri düzeltilebilir.' }
  }
  // Ekranla AYNI kapılar — biri "kaydet" derken diğeri reddetmesin
  const hatalar = kalemleriDogrula(kalemler)
  if (hatalar.length) return { _hata: hatalar.join(' ') }

  const temiz = kalemler.map(kalemPayload)
  const h = proformaHesapla(temiz)
  const onceki = Number(talep.genelToplam) || 0

  const { data, error } = await supabase
    .from('fatura_talepleri')
    .update({
      kalemler: temiz,
      ara_toplam: h.araToplam,
      kdv_toplam: h.kdvToplam,
      genel_toplam: h.genelToplam,
      // Bedel girilen iş bedelsiz olamaz — iki durum bir arada tutarsız
      // (`bedelsizKapat` de tutar > 0'ı zaten reddediyor).
      bedelsiz: false,
      bedelsiz_sebep: null,
      kalem_duzenleyen_id: kullanici?.id ?? null,
      kalem_duzenleyen_ad: kullanici?.ad ?? '',
      kalem_duzenleme_tarihi: new Date().toISOString(),
    })
    .eq('id', talep.id)
    .eq('durum', 'bekliyor')   // başka sekmede kesilmiş/reddedilmiş olabilir
    .select()
    .single()
  if (error) { console.error('[proformaKalemleriGuncelle]', error.message); return { _hata: error.message } }

  const guncel = toCamel(data)
  if (tutarDegistiMi(onceki, guncel.genelToplam)) {
    await kalemDuzeltmeBildir({ talep: guncel, onceki, kullanici })
  }
  return guncel
}

/**
 * Tutarı giren kişiye haber ver. Sessiz düzeltme, sahada "ben 5.000 yazmıştım"
 * tartışmasını doğurur; rakamı değiştiren belli olsun.
 *
 * ⚠️ Link ALICININ açabildiği sayfaya gitmeli: teknisyen /fatura-talepleri'ni
 * göremez (fatura yetkisi kapısı), kaynak servise/siparişe yönlendiriyoruz.
 */
async function kalemDuzeltmeBildir({ talep, onceki, kullanici }) {
  try {
    const alici = talep.talepEdenId
    if (!alici || String(alici) === String(kullanici?.id)) return
    const pb = talep.paraBirimi || 'TL'
    const link = talep.servisTalepId ? `/servis-talepleri/${talep.servisTalepId}`
      : talep.siparisId ? `/siparisler/${talep.siparisId}`
      : '/fatura-talepleri'
    await cokluBildirimEkle([alici], {
      baslik: `Proforma tutarı güncellendi — ${talep.talepNo}`,
      mesaj: `${talep.firmaAdi} · ${paraMetni(onceki, pb)} → ${paraMetni(talep.genelToplam, pb)} · ${kullanici?.ad || 'Muhasebe'}`,
      tip: 'uyari',
      link,
      meta: { kaynak: 'fatura_talebi', talep_id: talep.id, olay: 'kalem_duzeltme' },
    })
  } catch (e) {
    console.warn('[proformaKalem] bildirim gönderilemedi:', e?.message)
  }
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
 * Servisten fatura_talebi payload'ı. Servislerin fiyatlı kalemi YOK — tutarlar
 * BOŞ açılır; muhasebe gerçek faturayı keserken tutarı girer (faturayiKaydet
 * 0 TL'yi reddeder). Kullanılan malzemeler FİYATSIZ kalem olarak taşınır ki
 * muhasebe NE faturalanacağını görsün (FTL-2026-000025: bomboş proforma
 * "hata" sanılmıştı).
 */
/** Bakım kapsamı = servisin yükümlülüğü "bakım". Tek yerde tanımlı. */
export const bakimKapsamiMi = (servis) =>
  String(servis?.yukumluluk || '').trim().toLocaleLowerCase('tr') === 'bakim'

export const BEDELSIZ_SEBEP_VARSAYILAN = 'Bakım anlaşması kapsamında'

const bakimBedelsizAlanlari = (servis) => (bakimKapsamiMi(servis)
  ? { bedelsiz: true, bedelsizSebep: BEDELSIZ_SEBEP_VARSAYILAN }
  : { bedelsiz: false, bedelsizSebep: null })

export const servistenTalep = (servis, musteri, kullanici, not = '', malzemeler = []) => ({
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
  // BAKIM KAPSAMI (mig 282): yükümlülüğü "bakım" olan işte bedel alınmaz.
  // Proforma bedelsiz açılır; fatura yetkilisi kesim anında kaldırabilir.
  // ⚠️ Sözleşme tablosuna BAKILMIYOR — orada tek aktif bakım sözleşmesi var,
  // bakım servisi verilen diğer firmalar kayıtlı değil (bkz. mig 282 notu).
  ...bakimBedelsizAlanlari(servis),
  // Serviste kullanılan malzemeler — fiyatsız anlık görüntü (fiyat muhasebede)
  kalemler: (malzemeler || []).map(m => ({
    stokKodu: m.stokKodu || '',
    urunAdi: m.seriNo ? `${m.urunAdi || ''} (S/N: ${m.seriNo})` : (m.urunAdi || ''),
    aciklama: '',
    miktar: Number(m.miktar) || 1,
    birim: m.birim || 'Adet',
    birimFiyat: 0, iskontoOran: 0, kdvOran: 20,
    araToplam: 0, kdvTutar: 0, satirToplam: 0,
  })),
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
  // Kullanılan malzemeler (web + mobil S/N akışı birleşik) proformaya taşınır
  const malzemeler = await formEnvanterKalemleri(servis.id).catch(() => [])
  const payload = servistenTalep(servis, musteri, kullanici, not, malzemeler)
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
    // Şube (mig 286): fatura_talepleri'nde ayrı lokasyon kolonu yok, bu yüzden
    // anlık görüntüye adresin başına yazılır — faturayı kesen kişi hangi şube
    // için kesildiğini siparişe geri dönmeden görsün.
    adres: [siparis.lokasyonAd, musteri?.adres, musteri?.sehir].filter(Boolean).join(' · '),
    telefon: musteri?.telefon || '',
    email: musteri?.email || '',
    konu: [
      siparis.konu ? `Sipariş: ${siparis.konu}` : `Sipariş ${siparis.siparisNo || ''}`.trim(),
      siparis.lokasyonAd || null,
    ].filter(Boolean).join(' · '),
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

  // Şube adı burada çözülür (çağıranın geçirmesine güvenmeyiz — proforma her
  // yerden açılabilir); id→ad köprüsü tek yerden geçsin.
  const [musteri, lokasyonAd] = await Promise.all([
    siparis.musteriId ? musteriGetir(siparis.musteriId).catch(() => null) : Promise.resolve(null),
    siparis.lokasyonId ? lokasyonAdiGetir(siparis.lokasyonId).catch(() => '') : Promise.resolve(''),
  ])
  const payload = siparistenTalep({ ...siparis, lokasyonAd }, kalemler, musteri, kullanici, not)
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

// ---------- Fatura kesim ekranı için servis künyesi (12.08.2026) ----------

/**
 * Proformanın kaynağı olan servisin FATURAYA ESAS bilgileri.
 *
 * Neden var: proforma yalnız firma künyesi + kalem listesi taşıyor. Faturayı
 * kesen kişi "ne yapıldı, hangi cihaz, garanti mi ücretli mi" göremiyordu ve
 * tutarı körlemesine giriyordu (kullanıcı isteği 12.08.2026).
 *
 * ⚠️ Anlık görüntü DEĞİL, canlı okuma: teknisyen açıklamayı sonradan
 * düzeltirse muhasebe güncelini görsün. Kalemler ve tutar ise proformaya
 * kopyalanır (onlar belgenin kendisi).
 *
 * Doluluk ölçümü (83 kapalı servis): cozum_aciklamasi %89, aciklama %84,
 * yukumluluk %96. `yapilan_mudahale` / `kok_sebep` / servis üstündeki
 * marka-model alanları canlıda HİÇ kullanılmıyor (0/83) — bu yüzden
 * sorgulanmıyor, ekranda yer kaplamasın.
 */
export const faturaIcinServisBilgisi = async (servisTalepId) => {
  if (!servisTalepId) return null
  const { data, error } = await supabase
    .from('servis_talepleri')
    .select(`id, talep_no, konu, aciklama, cozum_aciklamasi, yukumluluk,
             servis_tipi, servis_yeri, lokasyon, cihaz_turu,
             atanan_kullanici_ad, tamamlanma_tarihi, durum`)
    .eq('id', servisTalepId)
    .maybeSingle()
  if (error || !data) return null
  return toCamel(data)
}
