// Servis malzemeleri (mig 153) — serviste kullanılan ürünlerin kaydı.
// Spec: "Kullanılan ürün otomatik olarak teknisyen deposundan düşmelidir."
// SN'li üründe teknisyendeki kalem seçilir → durum='sahada' (düşüm) + çıkış
// hareketi; silinirse geri alınır (durum='teknisyende' + giriş hareketi).
import { supabase } from '../lib/supabase'
import { arrayToCamel, toCamel } from '../lib/mapper'
import { invalidatePrefix } from '../lib/cache'

// Madde 23.10 — malzeme başına faturalandırma işareti. DB trigger'ı (mig 193)
// bu işarete göre Kullanılan Malzemeler'deki fatura durumunu senkron tutar.
export const FATURALANDIRMA_SECENEK = [
  { id: '',                      isim: 'Faturalandırma seç…' },
  { id: 'ucretli',               isim: '💰 Ücretli (faturalanacak)' },
  { id: 'garanti',               isim: '🛡 Garanti kapsamında' },
  { id: 'sozlesme',              isim: '📋 Bakım sözleşmesi' },
  { id: 'ucretsiz',              isim: '🎁 Ücretsiz' },
  { id: 'musteriden_alinan',     isim: '↩ Müşteriden alınan' },
  { id: 'iade',                  isim: '📦 İade edilecek' },
  { id: 'faturalandirilmayacak', isim: '🚫 Faturalandırılmayacak' },
]

const oturumKullanici = async () => {
  const { data: sess } = await supabase.auth.getUser()
  if (!sess?.user?.id) return { id: null, ad: null }
  const { data: kul } = await supabase.from('kullanicilar')
    .select('id, ad').eq('auth_id', sess.user.id).maybeSingle()
  return { id: kul?.id || null, ad: kul?.ad || null }
}

const hareketYaz = async ({ stokKodu, stokAdi, tip, miktar = 1, aciklama, kullaniciId, kullaniciAd }) => {
  // stok_miktari bu insert'in trigger'ı ile güncellenir (mig 270) — elle yazılmaz.
  // Hata YUTULMAZ: SN'siz üründe bakiyenin tek kaynağı bu kayıt (06.08 denetimi).
  const { error } = await supabase.from('stok_hareketleri').insert({
    stok_kodu: stokKodu,
    stok_adi: stokAdi || null,
    hareket_tipi: tip,
    miktar: Number(miktar) || 1,
    aciklama,
    tarih: new Date().toISOString(),
    kullanici_id: kullaniciId,
    kullanici_ad: kullaniciAd || null,
  })
  if (error) {
    console.error('hareketYaz:', error.message)
    throw new Error('Stok hareketi yazılamadı: ' + error.message)
  }
}

export const servisMalzemeleriGetir = async (servisId) => {
  const { data, error } = await supabase
    .from('servis_malzemeleri')
    .select('*')
    .eq('servis_id', servisId)
    .order('tarih', { ascending: false })
  if (error) { console.error('[servisMalzemeleriGetir]', error.message); return [] }
  return arrayToCamel(data) ?? []
}

// Ürünün teknisyende olan aktif SN kalemleri (düşüm için seçilebilir liste)
export const teknisyendekiKalemler = async (stokKodu) => {
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .select('id, seri_no, teknisyen_id, model, teknisyen:teknisyen_id (ad)')
    .eq('stok_kodu', stokKodu)
    .eq('durum', 'teknisyende')
    .eq('silindi', false)
    .order('seri_no')
  if (error) { console.error('[teknisyendekiKalemler]', error.message); return [] }
  return arrayToCamel(data) ?? []
}

// Sonraki satır numarası — müşteri formundaki sıra bununla belirlenir
const sonrakiSiralama = async (servisId) => {
  const { data } = await supabase
    .from('servis_malzemeleri')
    .select('siralama').eq('servis_id', servisId)
    .order('siralama', { ascending: false }).limit(1)
  return (data?.[0]?.siralama ?? 0) + 1
}

/**
 * Malzeme ekle. kalem verilirse (SN'li) o kalem 'sahada' yapılır ve çıkış
 * hareketi yazılır; kalem yoksa yalnız kayıt + çıkış hareketi (miktarlı).
 * durum='planlanan' ise stok DÜŞÜLMEZ — sadece "kullanılacak" listesidir.
 */
export const servisMalzemeEkle = async ({
  servisId, servisKodu, urun, miktar = 1, kalem = null,
  birimFiyat = 0, durum = 'kullanildi',
}) => {
  const kul = await oturumKullanici()
  const planlanan = durum === 'planlanan'

  if (kalem && !planlanan) {
    // SN düşümü — teknisyen deposundan sahaya
    const { data: dusen, error: kErr } = await supabase
      .from('stok_kalemleri')
      .update({ durum: 'sahada' })
      .eq('id', kalem.id)
      .eq('durum', 'teknisyende')  // yarış koşulu: hâlâ teknisyendeyse düş
      .select('id')
    if (kErr) throw new Error('SN düşümü yapılamadı: ' + kErr.message)
    // 0 satır = kalem artık teknisyende değil (paralel işlem/yarım kalan tekrar
    // deneme). Sessizce devam edilirse MÜKERRER satır + hareket yazılıyordu.
    if (!dusen?.length) {
      throw new Error(`${kalem.seriNo || 'S/N'} artık teknisyen deposunda değil — liste yenilenip tekrar denenmeli.`)
    }
  }

  const { data, error } = await supabase
    .from('servis_malzemeleri')
    .insert({
      servis_id: servisId,
      stok_kodu: urun.stokKodu || null,
      urun_adi: urun.stokAdi || urun.urunAdi,
      miktar: Number(miktar) || 1,
      birim: urun.birim || 'Adet',
      seri_no: planlanan ? null : (kalem?.seriNo || null),
      kalem_id: planlanan ? null : (kalem?.id || null),
      birim_fiyat: Number(birimFiyat) || 0,
      durum,
      siralama: await sonrakiSiralama(servisId),
      kullanici_id: kul.id,
      kullanici_ad: kul.ad,
    })
    .select()
    .single()
  if (error) {
    // Malzeme kaydı başarısızsa SN düşümünü geri al (tutarlılık)
    if (kalem && !planlanan) {
      await supabase.from('stok_kalemleri').update({ durum: 'teknisyende' }).eq('id', kalem.id)
    }
    throw new Error('Malzeme kaydedilemedi: ' + error.message)
  }

  if (urun.stokKodu && !planlanan) {
    await hareketYaz({
      stokKodu: urun.stokKodu,
      stokAdi: urun.stokAdi || urun.urunAdi,
      tip: 'cikis',
      miktar: kalem ? 1 : (Number(miktar) || 1),
      aciklama: kalem
        ? `Serviste kullanıldı: ${kalem.seriNo} — ${servisKodu || 'servis #' + servisId}`
        : `Serviste kullanıldı (${miktar} ${urun.birim || 'Adet'}) — ${servisKodu || 'servis #' + servisId}`,
      kullaniciId: kul.id,
      kullaniciAd: kul.ad,
    })
  }
  invalidatePrefix('stok')
  return toCamel(data)
}

// Malzeme kaydını sil + SN'li ise düşümü geri al
export const servisMalzemeSil = async (malzeme, servisKodu) => {
  const kul = await oturumKullanici()
  const { error } = await supabase.from('servis_malzemeleri').delete().eq('id', malzeme.id)
  if (error) throw new Error('Silinemedi: ' + error.message)

  if (malzeme.kalemId) {
    await supabase.from('stok_kalemleri')
      .update({ durum: 'teknisyende' })
      .eq('id', malzeme.kalemId)
      .eq('durum', 'sahada')  // yalnız hâlâ sahadaysa geri al
  }
  // 'planlanan' satır stoktan hiç düşmemişti — geri giriş yazmak stoğu ŞİŞİRİRDİ
  if (malzeme.stokKodu && malzeme.durum !== 'planlanan') {
    await hareketYaz({
      stokKodu: malzeme.stokKodu,
      stokAdi: malzeme.urunAdi,
      tip: 'giris',
      miktar: malzeme.kalemId ? 1 : (Number(malzeme.miktar) || 1),
      aciklama: malzeme.seriNo
        ? `Servis kullanımı geri alındı: ${malzeme.seriNo} — ${servisKodu || 'servis #' + malzeme.servisId}`
        : `Servis kullanımı geri alındı (${malzeme.miktar} ${malzeme.birim || 'Adet'}) — ${servisKodu || 'servis #' + malzeme.servisId}`,
      kullaniciId: kul.id,
      kullaniciAd: kul.ad,
    })
  }
  invalidatePrefix('stok')
}

/**
 * Miktar / birim fiyat düzenleme. Müşteri formundaki satır DB trigger'ı ile
 * kendiliğinden güncellenir (tutar da DB'de hesaplanır) — burada yazılmaz.
 */
export const servisMalzemeGuncelle = async (id, { miktar, birimFiyat, notlar, faturalandirma }) => {
  const alanlar = {}
  if (miktar !== undefined) {
    // S/N'li satırda adet HER ZAMAN 1 — elle 91 yazılınca satır "91 kullanıldı"
    // derken zimmetten yalnız 1 kalem düşmüştü (06.08 TLP-2026-0062 vakası).
    // Birden çok cihaz = S/N listesinden çoklu seçim (Otomatik Seç ile N kalem).
    const { data: sat } = await supabase
      .from('servis_malzemeleri')
      .select('seri_no, miktar, durum, stok_kodu, urun_adi, servis_id')
      .eq('id', id).maybeSingle()
    if (sat?.seri_no) {
      throw new Error('S/N’li satırda adet her zaman 1’dir — birden fazla cihaz için üstteki S/N seçiminde adet yazıp "Otomatik Seç" kullanın; her cihaz zimmetten ayrı düşer.')
    }
    const yeniM = Number(miktar) || 0
    const eskiM = Number(sat?.miktar) || 0
    const fark = yeniM - eskiM
    // SN'siz 'kullanildi' satırda adet değişimi STOĞA da yansımalı: fark kadar
    // cikis/giris hareketi (mig 270 trigger'ı bakiyeyi bundan günceller).
    // Eskiden yalnız satır güncelleniyordu — forma 10 gider, stoktan 2 düşmüş
    // olurdu (06.08 denetimi). Hareket yazılamazsa adet de değişmez (sıra önemli).
    if (fark !== 0 && sat?.durum === 'kullanildi' && sat?.stok_kodu) {
      const kul = await oturumKullanici()
      await hareketYaz({
        stokKodu: sat.stok_kodu,
        stokAdi: sat.urun_adi,
        tip: fark > 0 ? 'cikis' : 'giris',
        miktar: Math.abs(fark),
        aciklama: `Servis malzeme adedi güncellendi (${eskiM} → ${yeniM}) — servis #${sat.servis_id}`,
        kullaniciId: kul.id,
        kullaniciAd: kul.ad,
      })
    }
    alanlar.miktar = yeniM
  }
  if (birimFiyat !== undefined) alanlar.birim_fiyat = Number(birimFiyat) || 0
  if (notlar !== undefined) alanlar.notlar = notlar || null
  if (faturalandirma !== undefined) alanlar.faturalandirma = faturalandirma || null
  const { data, error } = await supabase
    .from('servis_malzemeleri').update(alanlar).eq('id', id).select().single()
  if (error) throw new Error('Güncellenemedi: ' + error.message)
  return toCamel(data)
}

/**
 * Keşiften gelen 'planlanan' satırı "kullanıldı"ya çevirir: stok bu anda düşer.
 * SN'li üründe kalem seçilmiş olmalı.
 */
export const servisMalzemeKullanildiYap = async (malzeme, { kalem = null, servisKodu } = {}) => {
  const kul = await oturumKullanici()

  if (kalem) {
    const { error: kErr } = await supabase
      .from('stok_kalemleri').update({ durum: 'sahada' })
      .eq('id', kalem.id).eq('durum', 'teknisyende')
    if (kErr) throw new Error('SN düşümü yapılamadı: ' + kErr.message)
  }

  const { data, error } = await supabase
    .from('servis_malzemeleri')
    .update({
      durum: 'kullanildi',
      seri_no: kalem?.seriNo || null,
      kalem_id: kalem?.id || null,
      kullanici_id: kul.id,
      kullanici_ad: kul.ad,
      tarih: new Date().toISOString(),
    })
    .eq('id', malzeme.id)
    // Çift tıklama/yarış guard'ı: yalnız hâlâ 'planlanan' ise geçir — ikinci
    // çağrı 0 satır görür, ikinci 'cikis' hareketi YAZILMAZ (06.08 denetimi).
    .eq('durum', 'planlanan')
    .select().maybeSingle()
  if (error) {
    if (kalem) await supabase.from('stok_kalemleri').update({ durum: 'teknisyende' }).eq('id', kalem.id)
    throw new Error('İşaretlenemedi: ' + error.message)
  }
  if (!data) {
    if (kalem) await supabase.from('stok_kalemleri').update({ durum: 'teknisyende' }).eq('id', kalem.id)
    throw new Error('Satır zaten "kullanıldı" olarak işaretlenmiş — mükerrer düşüm engellendi.')
  }

  if (malzeme.stokKodu) {
    await hareketYaz({
      stokKodu: malzeme.stokKodu,
      stokAdi: malzeme.urunAdi,
      tip: 'cikis',
      miktar: kalem ? 1 : (Number(malzeme.miktar) || 1),
      aciklama: kalem
        ? `Serviste kullanıldı: ${kalem.seriNo} — ${servisKodu || 'servis #' + malzeme.servisId}`
        : `Serviste kullanıldı (${malzeme.miktar} ${malzeme.birim || 'Adet'}) — ${servisKodu || 'servis #' + malzeme.servisId}`,
      kullaniciId: kul.id,
      kullaniciAd: kul.ad,
    })
  }
  invalidatePrefix('stok')
  return toCamel(data)
}

/**
 * Keşif kalemlerini servise "planlanan malzeme" olarak taşır (fiyatsız —
 * keşifte fiyat tutulmuyor; teknisyen/yetkili sonra girer). Stok DÜŞMEZ.
 */
// Servis formu "Kullanılan Malzeme/Cihaz (Envanter)" bölümü — İKİ kaynağı birleştirir:
//   1) servis_malzemeleri durum='kullanildi' (web Kullanılan Malzemeler kartı)
//   2) servis_kalem_kullanimi durum='kullanildi' (mobil S/N akışı: teslim al → kullan)
// Mobil akış servis_malzemeleri'ne YAZMAZ — yalnız 1'i okumak formda eksik gösteriyordu (KRL-2026-0001 olayı).
export const formEnvanterKalemleri = async (servisTalepId) => {
  const [webM, snM] = await Promise.all([
    supabase.from('servis_malzemeleri')
      .select('id, urun_adi, stok_kodu, seri_no, miktar, birim, durum')
      .eq('servis_id', servisTalepId).eq('durum', 'kullanildi'),
    supabase.from('servis_kalem_kullanimi')
      .select('id, durum, stok_kalemleri (seri_no, stok_kodu)')
      .eq('servis_talep_id', servisTalepId).eq('durum', 'kullanildi'),
  ])
  const webListe = (webM.data || []).map(m => ({
    id: `w-${m.id}`, urunAdi: m.urun_adi, stokKodu: m.stok_kodu,
    seriNo: m.seri_no, miktar: m.miktar, birim: m.birim,
  }))
  const snSatir = snM.data || []
  const kodlar = [...new Set(snSatir.map(r => r.stok_kalemleri?.stok_kodu).filter(Boolean))]
  let uMap = new Map()
  if (kodlar.length) {
    const { data: urunler } = await supabase
      .from('stok_urunler').select('stok_kodu, stok_adi, marka').in('stok_kodu', kodlar)
    uMap = new Map((urunler || []).map(u => [u.stok_kodu, u]))
  }
  const snListe = snSatir.map(r => {
    const kod = r.stok_kalemleri?.stok_kodu || ''
    const u = uMap.get(kod)
    return {
      id: `s-${r.id}`,
      urunAdi: u ? `${u.stok_adi}${u.marka ? ` — ${u.marka}` : ''}` : (kod || 'Envanter kalemi'),
      stokKodu: kod, seriNo: r.stok_kalemleri?.seri_no || '', miktar: 1, birim: 'Adet',
    }
  })
  // Aynı S/N iki kaynakta da varsa tekle
  const gorulen = new Set()
  return [...webListe, ...snListe].filter(m => {
    const k = m.seriNo || m.id
    if (gorulen.has(k)) return false
    gorulen.add(k)
    return true
  })
}

// Bu serviste kullanılmış S/N'li kalemlerden cihaz bilgisi (IP / alt-lokasyon)
// girilmemiş olanlar — "Tamamlandı" öncesi hatırlatıcı. Mobildeki
// eksikCihazKayitlariGetir'in web eşi; iki kaynağı da tarar (web
// servis_malzemeleri + mobil servis_kalem_kullanimi). Hata halinde [] döner —
// hatırlatıcı, sorgu hatası yüzünden servisi kilitlememeli.
export const eksikCihazBilgisiKalemleri = async (servisTalepId) => {
  const [webM, snM] = await Promise.all([
    supabase.from('servis_malzemeleri')
      .select('kalem_id')
      .eq('servis_id', servisTalepId).eq('durum', 'kullanildi')
      .not('kalem_id', 'is', null),
    supabase.from('servis_kalem_kullanimi')
      .select('kalem_id')
      .eq('servis_talep_id', servisTalepId).eq('durum', 'kullanildi')
      .not('kalem_id', 'is', null),
  ])
  if (webM.error) console.warn('eksikCihazBilgisi.web:', webM.error.message)
  if (snM.error) console.warn('eksikCihazBilgisi.mobil:', snM.error.message)
  const kalemIds = [...new Set(
    [...(webM.data || []), ...(snM.data || [])].map(r => r.kalem_id)
  )]
  if (kalemIds.length === 0) return []

  const { data: kalemler, error } = await supabase
    .from('stok_kalemleri')
    .select('id, seri_no, ip_adresi, alt_lokasyon, stok_kodu, musteri_id')
    .in('id', kalemIds)
    .not('seri_no', 'is', null)
    .eq('silindi', false)
  if (error) { console.warn('eksikCihazBilgisi.kalem:', error.message); return [] }

  let eksikler = (kalemler || []).filter(k => !k.ip_adresi || !k.alt_lokasyon)
  if (eksikler.length === 0) return []

  // Bilgi musteri_cihazlari'na girilmiş olabilir (ServisMalzemeleriCard "Cihaz"
  // modalı oraya yazar) — orada IP+lokasyon dolu olan S/N'i eksik sayma.
  // SN eşleşmesi upper(trim) normalize edilerek yapılır (unique index kuralı).
  // (Webden düşülen kalemde musteri_id boş kalır — servisin müşterisi de
  // sete eklenir ki kontrol atlanmasın.)
  const musteriIdSet = new Set(eksikler.map(k => k.musteri_id).filter(Boolean))
  const { data: st } = await supabase
    .from('servis_talepleri').select('musteri_id').eq('id', servisTalepId).maybeSingle()
  if (st?.musteri_id) musteriIdSet.add(st.musteri_id)
  const musteriIds = [...musteriIdSet]
  if (musteriIds.length > 0) {
    const { data: mcler } = await supabase
      .from('musteri_cihazlari')
      .select('seri_no, ip_adresi, lokasyon')
      .in('musteri_id', musteriIds)
    const norm = s => String(s || '').trim().toUpperCase()
    const doluSn = new Set((mcler || [])
      .filter(c => c.ip_adresi && c.lokasyon)
      .map(c => norm(c.seri_no)))
    eksikler = eksikler.filter(k => !doluSn.has(norm(k.seri_no)))
    if (eksikler.length === 0) return []
  }

  // Ürün adı: stok_kalemleri→stok_urunler FK yok, bağ stok_kodu metniyle
  const kodlar = [...new Set(eksikler.map(k => k.stok_kodu).filter(Boolean))]
  let adlar = new Map()
  if (kodlar.length > 0) {
    const { data: urunler } = await supabase
      .from('stok_urunler').select('stok_kodu, stok_adi').in('stok_kodu', kodlar)
    adlar = new Map((urunler || []).map(u => [u.stok_kodu, u.stok_adi]))
  }
  return eksikler.map(k => ({
    id: k.id,
    seriNo: k.seri_no,
    stokKodu: k.stok_kodu,
    urunAdi: adlar.get(k.stok_kodu) || null,
    eksikAlanlar: [!k.ip_adresi && 'IP', !k.alt_lokasyon && 'alt-lokasyon'].filter(Boolean),
  }))
}

// Teknisyen envanterinden bu servise düşen S/N kalemleri (mobil akış:
// teslim al → kullan). servis_kalem_kullanimi'nin TÜM statülerini döndürür ki
// web servis detayında yönetici "teknisyen hangi cihazı çekmiş" görebilsin.
// (ServisMalzemeleriCard yalnız servis_malzemeleri'ni gösterir — bu ayrı kaynak.)
export const kalemKullanimlariGetir = async (servisTalepId) => {
  const { data, error } = await supabase
    .from('servis_kalem_kullanimi')
    .select('id, durum, tarih, kullanici_ad, stok_kalemleri (seri_no, stok_kodu, marka, model)')
    .eq('servis_talep_id', servisTalepId)
    .order('tarih', { ascending: true })
  if (error) { console.warn('[kalemKullanimlariGetir]', error.message); return [] }
  const rows = data || []
  const kodlar = [...new Set(rows.map(r => r.stok_kalemleri?.stok_kodu).filter(Boolean))]
  let uMap = new Map()
  if (kodlar.length) {
    const { data: urunler } = await supabase
      .from('stok_urunler').select('stok_kodu, stok_adi, marka').in('stok_kodu', kodlar)
    uMap = new Map((urunler || []).map(u => [u.stok_kodu, u]))
  }
  return rows.map(r => {
    const kod = r.stok_kalemleri?.stok_kodu || ''
    const u = uMap.get(kod)
    const marka = r.stok_kalemleri?.marka || u?.marka || ''
    const ad = u?.stok_adi || r.stok_kalemleri?.model || kod || 'Envanter kalemi'
    return {
      id: r.id,
      durum: r.durum, // 'teslim_alindi' | 'kullanildi' | 'teslim_edildi' ...
      urunAdi: `${ad}${marka ? ` — ${marka}` : ''}`,
      stokKodu: kod,
      seriNo: r.stok_kalemleri?.seri_no || '',
      kullaniciAd: r.kullanici_ad || '',
      tarih: r.tarih || null,
    }
  })
}

export const kesiftenMalzemePlanla = async (servisId, kalemler = []) => {
  if (!servisId || !kalemler.length) return []
  const kul = await oturumKullanici()
  const satirlar = kalemler.map((k, i) => ({
    servis_id: servisId,
    stok_kodu: k.stokKodu || null,
    urun_adi: [k.urunAdi, k.marka].filter(Boolean).join(' — ') || 'Malzeme',
    miktar: Number(k.miktar) || 1,
    birim: k.birim || 'Adet',
    birim_fiyat: 0,
    durum: 'planlanan',
    siralama: i + 1,
    notlar: k.notlar || null,
    kullanici_id: kul.id,
    kullanici_ad: kul.ad,
  }))
  const { data, error } = await supabase.from('servis_malzemeleri').insert(satirlar).select()
  if (error) throw new Error('Keşif malzemeleri aktarılamadı: ' + error.message)
  return arrayToCamel(data) ?? []
}
