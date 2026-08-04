// Kullanıcı Sözleşmesi — metin + zorunlu onay (mig 264/265).
//
// ⚠️ İSİM UYARISI: sozlesmeService.js BAŞKA bir şeydir (müşteri bakım/kiralama
// sözleşmeleri, mig 144). Bu dosya personelin sisteme giriş için onayladığı
// kullanıcı sözleşmesidir — ikisi karıştırılmamalı.
//
// Metin DB'de tutulur (sozlesme_metinleri), web ve mobil TEK kaynaktan okur:
// dosyada tutulsaydı iki projede iki kopya olur, biri güncellenip diğeri
// unutulurdu.
// Onay kaydı doğrudan insert ile DEĞİL RPC ile yazılır: kullanıcı kimliği
// oturumdan alınır, kimse başkası adına onay üretemez.

import { supabase } from '../lib/supabase'

/** Yürürlükteki metin. Giriş yapılmamışken de okunur (RLS: aktif=true herkese açık). */
export const aktifSozlesmeGetir = async () => {
  const { data, error } = await supabase
    .from('sozlesme_metinleri')
    .select('id, versiyon, baslik, icerik, yururluk_tarihi, metin_ozeti')
    .eq('aktif', true)
    .maybeSingle()
  if (error) { console.warn('[kullanici-sozlesme] metin:', error.message); return null }
  return data
}

/**
 * Oturumdaki kullanıcı onaylamış mı? → { gerekli, versiyon, baslik, onay_tarihi }
 * Personel dışı (müşteri portalı / bayi) için gerekli=false döner — kapsam
 * kararı gereği onlar kilitlenmez.
 */
export const sozlesmeDurumum = async () => {
  const { data, error } = await supabase.rpc('sozlesme_durumum')
  if (error) {
    // Kapıyı HATA yüzünden kilitlemeyiz: sözleşme altyapısına ulaşılamıyorsa
    // kullanıcı çalışmaya devam etsin, sorun loglansın. Aksi hâlde tek bir
    // ağ hatası tüm şirketi sistem dışında bırakırdı.
    console.warn('[kullanici-sozlesme] durum:', error.message)
    return { gerekli: false, hata: error.message }
  }
  return data || { gerekli: false }
}

/** Onayı kaydet. Kaynak + cihaz bilgisi ihtilafta kanıt olarak saklanır. */
export const sozlesmeOnayla = async (versiyon) => {
  const { data, error } = await supabase.rpc('sozlesme_onayla', {
    p_versiyon: versiyon,
    p_kaynak: 'web',
    p_cihaz: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  })
  if (error) { console.error('[kullanici-sozlesme] onay:', error.message); return { ok: false, hata: error.message } }
  return data
}

/** Yönetim takibi: kim onayladı, kim onaylamadı. */
export const onayDurumlariniGetir = async () => {
  const [kullanicilarSonuc, onaylarSonuc, sozlesme] = await Promise.all([
    supabase.from('kullanicilar').select('id, ad, rol, tip, durum').eq('tip', 'zna'),
    // Kanıt alanları da çekilir: ihtilafta "kim, neyi, nereden onayladı"
    // sorusunun cevabı bunlar. metin_ozeti = onay anındaki metnin SHA-256'sı.
    supabase.from('sozlesme_onaylari')
      .select('kullanici_id, versiyon, onay_tarihi, kaynak, cihaz, ip, metin_ozeti'),
    aktifSozlesmeGetir(),
  ])
  const onayHarita = new Map((onaylarSonuc.data ?? []).map(o => [Number(o.kullanici_id), o]))
  return (kullanicilarSonuc.data ?? []).map(k => {
    const onay = onayHarita.get(Number(k.id)) ?? null
    return {
      ...k,
      onay,
      guncelVersiyon: sozlesme?.versiyon ?? null,
      // Onay anındaki metin, bugün yürürlükte olanla aynı mı? Farklıysa
      // metin değişmiş demektir — imzanın neyi kapsadığı ayrıca incelenmeli.
      ozetGecerli: onay?.metin_ozeti && sozlesme?.metin_ozeti
        ? onay.metin_ozeti === sozlesme.metin_ozeti
        : null,
    }
  })
}
