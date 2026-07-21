// Sipariş onay sistemi — frontend service.
// Not: 126 migration'dan itibaren onay verildiğinde `siparisler` tablosuna
// da INSERT edilir ve ZNA-SIP-YYYY-NNNNNN no üretilir. Ön siparişler de aynı
// akıştan geçer.

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel } from '../lib/mapper'
import { bildirimEkleDb } from './bildirimService'
import { smsGonderVeLogla } from './smsLogService'

const BUCKET = 'siparis-imzalari'

// TR karakter → ASCII (SMS-friendly)
const trAsciify = (s) => String(s || '')
  .replace(/İ/g, 'I').replace(/ı/g, 'i')
  .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
  .replace(/Ş/g, 'S').replace(/ş/g, 's')
  .replace(/Ç/g, 'C').replace(/ç/g, 'c')
  .replace(/Ö/g, 'O').replace(/ö/g, 'o')
  .replace(/Ü/g, 'U').replace(/ü/g, 'u')

/**
 * Sipariş onaylandı → ön siparişi oluşturana bildirim + SMS.
 * Best-effort — telefon yoksa veya SMS fail olursa akış bozulmaz.
 */
async function siparisOnaylandiBildir({ siparisNo, onSiparisId, olusturanId, onaylayanAd, firmaAdi }) {
  if (!olusturanId) return
  try {
    const { data: k } = await supabase
      .from('kullanicilar')
      .select('id, ad, cep_telefon')
      .eq('id', olusturanId)
      .maybeSingle()
    if (!k) return

    // Sistem bildirimi
    bildirimEkleDb({
      aliciId: k.id,
      baslik: 'Ön Sipariş Onaylandı — Siparişe Dönüştü',
      mesaj: `${firmaAdi || 'Firma'} için oluşturduğunuz ön sipariş, ${onaylayanAd || 'yönetici'} tarafından onaylandı. Sipariş No: ${siparisNo}`,
      tip: 'siparis',
      link: `/siparisler`,
    }).catch(e => console.warn('[bildirim] onay:', e?.message))

    // SMS — log'lu gönderim
    const mesaj = `ZNA CRM: On siparisiniz onaylandi.\n${trAsciify(firmaAdi || '')}\nSiparis: ${siparisNo}\nOnaylayan: ${trAsciify(onaylayanAd || '')}\ntalep.znateknoloji.com`
    smsGonderVeLogla({
      gsm: k.cep_telefon,
      mesaj,
      amac: 'siparis_onaylandi_bildirim',
      refTablo: 'on_siparisler',
      refId: onSiparisId,
      aliciKullaniciId: k.id,
      aliciAd: k.ad,
    }).catch(e => console.warn('[sms] onay:', e?.message))
  } catch (e) {
    console.warn('[siparisOnaylandiBildir]', e?.message)
  }
}

/**
 * Onay bekleyen siparişler — yetkili sayfasında listelenir.
 */
export async function bekleyenSiparisleriGetir() {
  const { data, error } = await supabase
    .from('teklifler')
    .select('*')
    .eq('onay_durumu', 'kabul')
    .filter('siparis_onayi->>durum', 'eq', 'bekliyor')
    .order('tarih', { ascending: false })
  if (error) throw error
  return (data ?? []).map(toCamel)
}

/**
 * Onaylananlar — raporlama için
 */
export async function onaylananSiparisleriGetir(baslangic, bitis) {
  let q = supabase
    .from('teklifler')
    .select('*')
    .filter('siparis_onayi->>durum', 'eq', 'onayli')
    .order('siparis_onayi->>onay_tarihi', { ascending: false })
  if (baslangic) q = q.filter('siparis_onayi->>onay_tarihi', 'gte', baslangic)
  if (bitis) q = q.filter('siparis_onayi->>onay_tarihi', 'lte', bitis)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(toCamel)
}

/**
 * Reddedilenler
 */
export async function reddedilenSiparisleriGetir() {
  const { data, error } = await supabase
    .from('teklifler')
    .select('*')
    .filter('siparis_onayi->>durum', 'eq', 'reddedildi')
    .order('siparis_onayi->>onay_tarihi', { ascending: false })
  if (error) throw error
  return (data ?? []).map(toCamel)
}

/**
 * İmza dosyasını Supabase Storage'a yükle, public URL döner.
 */
export async function imzaYukle(file, teklifId) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const yol = `teklif-${teklifId}/imza-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(yol, file, {
    contentType: file.type || 'image/png',
    upsert: true,
  })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(yol)
  return publicUrl
}

/**
 * Siparişi onayla — imza url'i ile birlikte.
 * ARTIK: onaydan sonra siparisler + siparis_kalemleri tablosuna INSERT eder.
 * ZNA-SIP-YYYY-NNNNNN no otomatik atanır (DB trigger).
 */
export async function siparisOnayla(teklifId, { onaylayanId, onaylayanAd, imzaUrl, onayGerekcesi = '' }) {
  const onay = {
    durum: 'onayli',
    onaylayan_id: onaylayanId,
    onaylayan_ad: onaylayanAd,
    onay_tarihi: new Date().toISOString(),
    imza_url: imzaUrl,
    onay_gerekcesi: onayGerekcesi || null,
  }
  // 1) Mevcut geriye uyum: teklifler.siparis_onayi güncelle
  // Spec 10-durum: sipariş onayı = teklif "Siparişe Aktarıldı" (terminal durum)
  const { error: e1 } = await supabase
    .from('teklifler')
    .update({ siparis_onayi: onay, spek_durum: 'siparise_aktarildi' })
    .eq('id', teklifId)
  if (e1) throw e1

  // 2) Yeni: siparisler tablosuna INSERT (kalıcı sipariş no üretimi)
  const siparisNo = await tekliftenSiparisiOlustur(teklifId, {
    onaylayanId, onaylayanAd, imzaUrl,
    notlar: onayGerekcesi || null,
  })

  return { ...onay, siparis_no: siparisNo }
}

/**
 * Tekliften kalıcı sipariş oluşturur.
 * - siparisler INSERT (ZNA-SIP-... trigger ile atanır)
 * - siparis_kalemleri INSERT (teklif.satirlar jsonb'sinden mapping)
 * Zaten aynı teklifId için aktif sipariş varsa yeni INSERT yapmaz (idempotent).
 */
export async function tekliftenSiparisiOlustur(teklifId, { onaylayanId, onaylayanAd, imzaUrl, notlar }) {
  // Idempotent kontrol
  const { data: mevcut } = await supabase
    .from('siparisler')
    .select('id, siparis_no')
    .eq('teklif_id', teklifId)
    .neq('durum', 'iptal')
    .limit(1)
    .maybeSingle()
  if (mevcut) return mevcut.siparis_no

  // Teklifi çek
  const { data: teklif, error: eT } = await supabase
    .from('teklifler')
    .select('*')
    .eq('id', teklifId)
    .single()
  if (eT || !teklif) throw eT || new Error('Teklif bulunamadı')

  // siparisler.musteri_id NOT NULL — ama tekliflerin ~yarısında musteri_id BOŞ
  // (firma yalnız isim olarak yazılmış). Eskiden insert sessizce not-null
  // ihlaliyle patlıyor, teklif siparişe geçemiyordu. Firma adından çözüyoruz.
  let musteriId = teklif.musteri_id
  if (!musteriId && teklif.firma_adi) {
    const norm = (s) => (s || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim()
    const { data: adaylar } = await supabase
      .from('musteriler')
      .select('id, firma')
      .ilike('firma', teklif.firma_adi.trim())
      .limit(5)
    const tam = (adaylar || []).find(m => norm(m.firma) === norm(teklif.firma_adi))
    musteriId = tam?.id ?? adaylar?.[0]?.id ?? null
  }
  if (!musteriId) {
    throw new Error(
      `"${teklif.firma_adi || 'Bu teklif'}" için müşteri kartı bulunamadı. ` +
      'Siparişte müşteri kaydı zorunlu — önce müşteriyi oluşturun veya teklifi müşteriye bağlayın.'
    )
  }

  // siparisler INSERT
  const payload = {
    musteri_id: musteriId,
    gorusme_id: teklif.gorusme_id,
    kaynak_tipi: 'teklif',
    teklif_id: teklifId,
    onay_tarihi: new Date().toISOString(),
    onaylayan_id: onaylayanId,
    onaylayan_ad: onaylayanAd,
    imza_url: imzaUrl,
    para_birimi: teklif.para_birimi || 'TL',
    doviz_kuru: teklif.doviz_kuru || 1,
    genel_iskonto: teklif.genel_iskonto || 0,
    genel_toplam: teklif.genel_toplam || 0,
    konu: teklif.konu,
    notlar,
  }
  const { data: siparis, error: eI } = await supabase
    .from('siparisler')
    .insert(payload)
    .select()
    .single()
  if (eI) throw eI

  // Kalemleri kopyala (teklif.satirlar jsonb → siparis_kalemleri satırları)
  const satirlar = Array.isArray(teklif.satirlar) ? teklif.satirlar : []
  if (satirlar.length > 0) {
    const kalemler = satirlar.map((s, i) => {
      const miktar = Number(s.miktar || 0)
      const fiyat = Number(s.birimFiyat || 0)
      const isk = Number(s.iskonto || 0)
      return {
        siparis_id: siparis.id,
        stok_kodu: s.stokKodu || null,
        urun_ad: s.stokAdi || s.ad || 'Satır',
        birim: s.birim || 'Adet',
        miktar,
        birim_fiyat: fiyat,
        iskonto_orani: isk,
        kdv_orani: Number(s.kdv || 20),
        ara_toplam: miktar * fiyat * (1 - isk / 100),
        aciklama: s.aciklama || null,
        siralama: i,
      }
    })
    const { error: eK } = await supabase.from('siparis_kalemleri').insert(kalemler)
    if (eK) console.error('siparis_kalemleri insert hatasi:', eK.message)
  }

  return siparis.siparis_no
}

/**
 * Teklif kaynaklı sipariş onay kuyruğu — Sipariş Onayları > Teklifler sekmesi.
 * İki grup döner:
 *   hazir:  müşteri kabul etmiş (onay_durumu='kabul') VEYA erken alınmış
 *           → imza ile onaylanabilir (onay = ZNA-SIP sipariş oluşur)
 *   izleme: yönetici teklif onayı verilmiş, müşteri kabulü bekleniyor
 *           → salt izleme + "Erken Onaya Al" ile hazir grubuna çekilebilir
 */
export async function teklifSiparisKuyrugu() {
  const { data, error } = await supabase
    .from('teklifler')
    .select('*')
    .filter('siparis_onayi->>durum', 'eq', 'bekliyor')
    .in('onay_durumu', ['takipte', 'kabul'])
    .order('id', { ascending: false })
  if (error) { console.warn('[teklifSiparisKuyrugu]', error.message); return { hazir: [], izleme: [] } }
  const rows = arrayToCamel(data || [])
  const hazirMi = (t) => t.onayDurumu === 'kabul' || t.siparisOnayi?.erken === true
  return {
    hazir: rows.filter(hazirMi),
    izleme: rows.filter(t => !hazirMi(t)),
  }
}

/**
 * Teklif sipariş onay kuyruğuna gelince sipariş onay yetkililerine
 * (siparis_onay_yetkilisi=true: Ali Uğur + Oğuz + Ahmet Agun) bildirim + SMS.
 * Best-effort — hata ana akışı bozmaz. Tetikleyen yetkiliyse kendisine gitmez.
 */
export async function siparisOnayinaGeldiBildir(teklif, { gonderenAd, gonderenId, not } = {}) {
  if (!teklif?.id) return
  try {
    const { data: yetkiler, error } = await supabase
      .from('kullanicilar')
      .select('id, ad, cep_telefon')
      .eq('siparis_onay_yetkilisi', true)
      .eq('tip', 'zna')
      .neq('durum', 'pasif')
    if (error) { console.warn('[siparisOnayinaGeldiBildir] yetkili çekilemedi:', error.message); return }
    if (!yetkiler?.length) return

    const teklifNo = teklif.teklifNo || teklif.teklif_no || `#${teklif.id}`
    const firma = teklif.firmaAdi || teklif.firma_adi || 'Müşteri —'
    const kim = gonderenAd || 'Bir personel'

    await Promise.all(yetkiler
      .filter(y => String(y.id) !== String(gonderenId ?? ''))
      .map(async (y) => {
        bildirimEkleDb({
          aliciId: y.id,
          baslik: 'Teklif — Sipariş Onayı Bekliyor',
          mesaj: `${firma} için "${teklifNo}" teklifi ${not || 'sipariş onay kuyruğuna düştü'} (${kim}). Sipariş Onayları ekranında bekliyor.`,
          tip: 'siparis',
          link: '/siparis-onaylari',
        }).catch(e => console.warn('[bildirim] sipariş onayına geldi:', e?.message))

        const mesaj = `ZNA CRM: Teklif siparis onayi bekliyor.\n${trAsciify(firma)}\nNo: ${teklifNo}\n${trAsciify(kim)}\ntalep.znateknoloji.com`
        smsGonderVeLogla({
          gsm: y.cep_telefon,
          mesaj,
          amac: 'siparis_onay_bildirim',
          refTablo: 'teklifler',
          refId: teklif.id,
          aliciKullaniciId: y.id,
          aliciAd: y.ad,
          gonderenKullaniciId: gonderenId ?? null,
        }).catch(e => console.warn('[sms] sipariş onayına geldi:', e?.message))
      }))
  } catch (e) {
    console.warn('[siparisOnayinaGeldiBildir] hata:', e?.message)
  }
}

/**
 * Erken onaya al — müşteri kabulünü beklemeden teklifi sipariş onay kuyruğuna çeker
 * (uzun terminli tedarik gereken acil işler için, yetkili kararı).
 * Müşteri onay durumu (onay_durumu) DEĞİŞMEZ — sadece siparis_onayi.erken işaretlenir.
 */
export async function teklifErkenOnayaAl(teklifId, kullanici) {
  const { data: t, error: eS } = await supabase
    .from('teklifler').select('siparis_onayi, teklif_no, firma_adi').eq('id', teklifId).single()
  if (eS) throw eS
  const onay = {
    ...(t?.siparis_onayi || {}),
    durum: 'bekliyor',
    erken: true,
    erken_alan: kullanici?.ad || '',
    erken_tarih: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('teklifler').update({ siparis_onayi: onay }).eq('id', teklifId)
  if (error) throw error
  // Yetkililere bildirim + SMS (best-effort)
  siparisOnayinaGeldiBildir(
    { id: teklifId, teklif_no: t?.teklif_no, firma_adi: t?.firma_adi },
    { gonderenAd: kullanici?.ad, gonderenId: kullanici?.id, not: 'erken onaya alındı' },
  )
  return onay
}

/**
 * Bekleyen ön siparişleri getir — Sipariş Onayı ekranında listelenir.
 */
export async function bekleyenOnSiparisleriGetir() {
  const { data, error } = await supabase
    .from('on_siparisler')
    .select('*')
    .eq('durum', 'onay_bekliyor')
    .order('olusturma_tarih', { ascending: false })
  if (error) throw error
  return arrayToCamel(data || [])
}

/**
 * Ön siparişi onayla → kalıcı sipariş oluştur.
 * Kalemler burada FİYATLI olmalı (onay ekranında fiyatlar girilir).
 */
export async function onSiparisiOnayla(onSiparisId, {
  onaylayanId, onaylayanAd, imzaUrl, notlar,
  fiyatliKalemler,          // [{ urunAd, miktar, birimFiyat, iskontoOrani, kdvOrani, ... }]
  paraBirimi = 'TL',
  dovizKuru = 1,
  genelIskonto = 0,
}) {
  // Idempotent kontrol
  const { data: mevcut } = await supabase
    .from('siparisler')
    .select('id, siparis_no')
    .eq('on_siparis_id', onSiparisId)
    .neq('durum', 'iptal')
    .limit(1)
    .maybeSingle()
  if (mevcut) return mevcut.siparis_no

  // Ön siparişi çek
  const { data: os, error: eOs } = await supabase
    .from('on_siparisler')
    .select('*')
    .eq('id', onSiparisId)
    .single()
  if (eOs || !os) throw eOs || new Error('Ön sipariş bulunamadı')

  // Genel toplam hesapla (kalemlerden)
  const araToplam = (fiyatliKalemler || []).reduce((s, k) => {
    const m = Number(k.miktar || 0), f = Number(k.birimFiyat || 0), i = Number(k.iskontoOrani || 0)
    return s + m * f * (1 - i / 100)
  }, 0)
  const kdvToplam = (fiyatliKalemler || []).reduce((s, k) => {
    const m = Number(k.miktar || 0), f = Number(k.birimFiyat || 0), i = Number(k.iskontoOrani || 0), kd = Number(k.kdvOrani || 0)
    return s + m * f * (1 - i / 100) * (kd / 100)
  }, 0)
  const genelToplam = araToplam - Number(genelIskonto || 0) + kdvToplam

  // siparisler INSERT
  const payload = {
    musteri_id: os.musteri_id,
    gorusme_id: os.gorusme_id,
    kaynak_tipi: 'on_siparis',
    on_siparis_id: onSiparisId,
    onay_tarihi: new Date().toISOString(),
    onaylayan_id: onaylayanId,
    onaylayan_ad: onaylayanAd,
    imza_url: imzaUrl,
    para_birimi: paraBirimi,
    doviz_kuru: dovizKuru,
    genel_iskonto: genelIskonto,
    genel_toplam: genelToplam,
    konu: os.aciklama || null,
    notlar,
  }
  const { data: siparis, error: eI } = await supabase
    .from('siparisler')
    .insert(payload)
    .select()
    .single()
  if (eI) throw eI

  // Kalemleri INSERT
  if (fiyatliKalemler && fiyatliKalemler.length > 0) {
    const kalemler = fiyatliKalemler.map((k, i) => ({
      siparis_id: siparis.id,
      stok_kodu: k.stokKodu || null,
      urun_ad: k.urunAd,
      urun_marka: k.urunMarka || null,
      urun_model: k.urunModel || null,
      kategori: k.kategori || null,
      birim: k.birim || 'Adet',
      miktar: Number(k.miktar || 0),
      birim_fiyat: Number(k.birimFiyat || 0),
      alis_fiyat: Number(k.alisFiyat || 0),
      iskonto_orani: Number(k.iskontoOrani || 0),
      kdv_orani: Number(k.kdvOrani || 20),
      ara_toplam:
        Number(k.miktar || 0) * Number(k.birimFiyat || 0) *
        (1 - Number(k.iskontoOrani || 0) / 100),
      aciklama: k.aciklama || null,
      siralama: i,
    }))
    const { error: eK } = await supabase.from('siparis_kalemleri').insert(kalemler)
    if (eK) console.error('siparis_kalemleri insert hatasi:', eK.message)
  }

  // Ön siparişi 'siparise_donustu' olarak işaretle + siparis_id bağla
  await supabase
    .from('on_siparisler')
    .update({ durum: 'siparise_donustu', siparis_id: siparis.id })
    .eq('id', onSiparisId)

  // Ön siparişi oluşturana bildirim + SMS (best-effort)
  siparisOnaylandiBildir({
    siparisNo: siparis.siparis_no,
    onSiparisId,
    olusturanId: os.olusturan_id,
    onaylayanAd,
    firmaAdi: os.firma_adi || null,
  })

  return siparis.siparis_no
}

/**
 * Ön siparişi reddet (durum='iptal') — imza gerekmez, sadece red nedeni.
 */
export async function onSiparisiReddet(onSiparisId, { onaylayanId, redNedeni }) {
  const { error } = await supabase
    .from('on_siparisler')
    .update({ durum: 'iptal', iptal_sebebi: redNedeni })
    .eq('id', onSiparisId)
  if (error) throw error
  return true
}

/**
 * Siparişi reddet — neden zorunlu.
 */
export async function siparisReddet(teklifId, { onaylayanId, onaylayanAd, redNedeni }) {
  const onay = {
    durum: 'reddedildi',
    onaylayan_id: onaylayanId,
    onaylayan_ad: onaylayanAd,
    onay_tarihi: new Date().toISOString(),
    red_nedeni: redNedeni,
  }
  const { error } = await supabase
    .from('teklifler')
    .update({ siparis_onayi: onay })
    .eq('id', teklifId)
  if (error) throw error
  return onay
}

/**
 * Onay/red kararını geri al — siparişi tekrar bekleyen konumuna döndürür.
 * Onaylayanın kendisi VEYA üst yetkili yapabilir (frontend kontrol eder).
 * Hazırlayan tarafından bırakılan onay_notu korunur.
 */
export async function siparisOnayGeriAl(teklifId) {
  const { data: t, error: e1 } = await supabase
    .from('teklifler')
    .select('siparis_onayi')
    .eq('id', teklifId)
    .single()
  if (e1) throw e1
  const mevcut = t?.siparis_onayi || {}
  const onay = {
    durum: 'bekliyor',
    onay_notu: mevcut.onay_notu || null,   // hazırlayan notu korunur
  }
  const { error: e2 } = await supabase
    .from('teklifler')
    .update({ siparis_onayi: onay })
    .eq('id', teklifId)
  if (e2) throw e2
  return onay
}

/**
 * Sipariş onayı için not güncelle — satıcı onaylayacak kişiye not bırakır.
 * Sadece durum=bekliyor iken degisebilir.
 */
export async function siparisOnayNotuKaydet(teklifId, notMetni) {
  // Mevcut siparis_onayi'ni cek, not field'ini guncelle
  const { data: t, error: e1 } = await supabase
    .from('teklifler')
    .select('siparis_onayi')
    .eq('id', teklifId)
    .single()
  if (e1) throw e1
  const mevcut = t?.siparis_onayi || { durum: 'bekliyor' }
  if (mevcut.durum !== 'bekliyor') {
    throw new Error('Onaylanmış veya reddedilmiş siparişin notu değiştirilemez.')
  }
  const yeni = { ...mevcut, onay_notu: (notMetni || '').toString().slice(0, 1000) || null }
  const { error: e2 } = await supabase
    .from('teklifler')
    .update({ siparis_onayi: yeni })
    .eq('id', teklifId)
  if (e2) throw e2
  return yeni
}

/**
 * Raporlama özeti — bu ay/dönem onaylı toplam, bekleyen, reddedilen.
 */
export async function siparisOnayRaporu(baslangic, bitis) {
  const [bekleyen, onaylanan, reddedilen] = await Promise.all([
    bekleyenSiparisleriGetir(),
    onaylananSiparisleriGetir(baslangic, bitis),
    reddedilenSiparisleriGetir(),
  ])
  const toplam = (liste) => liste.reduce((s, t) => s + Number(t.genelToplam || 0), 0)
  return {
    bekleyen_sayisi: bekleyen.length,
    bekleyen_toplam: toplam(bekleyen),
    onayli_sayisi: onaylanan.length,
    onayli_toplam: toplam(onaylanan),
    red_sayisi: reddedilen.length,
    red_toplam: toplam(reddedilen),
    onaylananlar: onaylanan,
    bekleyenler: bekleyen,
    reddedilenler: reddedilen,
  }
}
