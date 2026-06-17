import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

// Username → internal email (auth için sentetik email)
const kullaniciAdiToEmail = (kullaniciAdi) =>
  `${kullaniciAdi.toLowerCase().replace(/[^a-z0-9]/g, '')}@zna.local`

export const kullanicilariGetir = async () => {
  const { data } = await supabase.from('kullanicilar').select('*').order('id')
  return arrayToCamel(data)
}

// Supabase Auth ile giriş.
// 1. auth.signInWithPassword(email, password)
// 2. Başarılı ise kullanicilar tablosundan profili çek (auth_id ile)
export const kullaniciGirisKontrol = async (kullaniciAdi, sifre) => {
  // '@' içeriyorsa gerçek e-posta (self-kayıt kullanıcısı); yoksa kullanıcı adı → sentetik e-posta
  const girdi = (kullaniciAdi ?? '').trim()
  const email = girdi.includes('@') ? girdi.toLowerCase() : kullaniciAdiToEmail(girdi)
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password: sifre,
  })
  if (authError || !authData?.user) return null

  const { data: profil, error: profilError } = await supabase
    .from('kullanicilar')
    .select('*')
    .eq('auth_id', authData.user.id)
    .single()

  if (profilError) { console.warn('[kullaniciGirisKontrol] profil hatası:', profilError.message); return null }
  if (!profil) return null

  if (profil.onay_durum === 'beklemede') {
    await supabase.auth.signOut()
    const e = new Error('Hesabınız onay bekliyor. Yönetici onayından sonra giriş yapabilirsiniz.')
    e.kod = 'ONAY_BEKLIYOR'
    throw e
  }
  if (profil.onay_durum === 'reddedildi') {
    await supabase.auth.signOut()
    const e = new Error('Başvurunuz reddedildi.' + (profil.red_nedeni ? ' Sebep: ' + profil.red_nedeni : ''))
    e.kod = 'REDDEDILDI'
    throw e
  }
  return toCamel(profil)
}

// Promise.race timeout helper — supabase çağrıları hanging kalırsa bypass
const ileTimeout = (promise, ms, etiket) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${etiket} timeout (${ms}ms)`)), ms)),
  ])
}

// Oturum yenileme — sayfa yüklendiğinde çağır.
// KRİTİK: getSession() ve profil sorgusu timeout olmadan hang olabilir
// (stale session, ölmüş HTTP/2 keep-alive, vb.). Timeout race ile bypass et,
// hata olursa null dön → App login ekranına düşer, "Yükleniyor…" sonsuza
// kadar takılmaz.
export const mevcutOturumKullanici = async () => {
  let session
  try {
    const result = await ileTimeout(supabase.auth.getSession(), 6000, 'getSession')
    session = result?.data?.session
  } catch (e) {
    console.warn('[mevcutOturumKullanici] getSession:', e.message)
    return null
  }
  if (!session?.user) return null

  try {
    const { data: profil, error } = await ileTimeout(
      supabase.from('kullanicilar').select('*').eq('auth_id', session.user.id).single(),
      6000,
      'profil',
    )
    if (error) {
      console.warn('[mevcutOturumKullanici] profil okuma hata:', error.message)
      return null
    }
    return profil ? toCamel(profil) : null
  } catch (e) {
    console.warn('[mevcutOturumKullanici] profil timeout:', e.message)
    return null
  }
}

export const cikisYapAuth = async () => {
  await supabase.auth.signOut()
}

// Şifre değiştirme (giriş yapmış kullanıcı kendi şifresini)
export const sifreDegistir = async (yeniSifre) => {
  const { error } = await supabase.auth.updateUser({ password: yeniSifre })
  if (error) throw error
  return true
}

// Şifre sıfırlama maili gönder (email'e link gider)
export const sifreSifirlamaMaili = async (email) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email)
  if (error) throw error
}

// Admin: yeni kullanıcı ekle.
// NOT: Frontend'den auth.users yaratamayız (admin API gerekir).
// Bu fonksiyon sadece kullanicilar tablosuna satır ekler; auth kullanıcısı
// ayrıca Supabase Dashboard'dan veya admin script'iyle oluşturulur.
// Yeni akış: önce supabase.auth.admin.createUser çağrılır (edge function),
// dönen auth_id ile bu fonksiyon çağrılır.
export const kullaniciEkle = async (kullanici) => {
  const { id, olusturmaTarih, ...rest } = kullanici
  const { data, error } = await supabase
    .from('kullanicilar')
    .insert(toSnake(rest))
    .select()
    .single()
  if (error) { console.error('kullaniciEkle hata:', error.message); throw error }
  return toCamel(data)
}

export const kullaniciGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, ...rest } = guncellenmis
  // sifre artık kullanicilar tablosunda yok — güvenlik için ayıkla
  delete rest.sifre
  const { data, error } = await supabase
    .from('kullanicilar')
    .update(toSnake(rest))
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('kullaniciGuncelle hata:', error.message); throw error }
  return toCamel(data)
}

// Admin: bir kullanicinin sifresini sifirla — edge function uzerinden
// (frontend auth.admin.updateUserById cagiramaz). yeniSifre min 8 karakter olmali.
export const kullaniciSifreSifirla = async (hedefKullaniciId, yeniSifre) => {
  const { data, error } = await supabase.functions.invoke('kullanici-sifre-sifirla', {
    body: { hedefKullaniciId, yeniSifre },
  })
  if (error) {
    let mesaj = error.message ?? 'Sifre sifirlanamadi'
    try {
      const ctx = error.context
      if (ctx && typeof ctx.text === 'function') {
        const text = await ctx.text()
        if (text) {
          try {
            const body = JSON.parse(text)
            if (body?.hata) mesaj = body.hata
          } catch { mesaj = text.slice(0, 300) }
        }
      }
    } catch {}
    throw new Error(mesaj)
  }
  if (!data?.ok) throw new Error(data?.hata ?? 'Sifre sifirlanamadi')
  return data
}

export const kullaniciSil = async (id) => {
  const { error } = await supabase
    .from('kullanicilar')
    .delete()
    .eq('id', id)
    .eq('silinebilir', true)
  if (error) console.error('kullaniciSil hata:', error.message)
}

export const kullaniciDurumGuncelle = async (id, durum) => {
  const { error } = await supabase
    .from('kullanicilar')
    .update({ durum })
    .eq('id', id)
  if (error) console.error('kullaniciDurumGuncelle hata:', error.message)
}

// === Onay/yetkilendirme (admin) ===

export const onayBekleyenleriGetir = async () => {
  const { data, error } = await supabase.rpc('onay_bekleyen_kullanicilar')
  if (error) { console.error('onayBekleyenleriGetir hata:', error.message); throw error }
  return arrayToCamel(data ?? [])
}

// erisim: 'musteri' | 'personel' | 'yonetici'
export const kullaniciOnayla = async (id, erisim, ek = {}) => {
  const harita = {
    musteri:  { tip: 'musteri', rol: 'musteri' },
    personel: { tip: 'zna',     rol: 'personel' },
    yonetici: { tip: 'zna',     rol: 'admin' },
  }
  const m = harita[erisim]
  if (!m) throw new Error('Geçersiz erişim seviyesi: ' + erisim)
  const { data, error } = await supabase.rpc('kullanici_onayla', {
    p_id: id,
    p_tip: m.tip,
    p_rol: m.rol,
    p_moduller: ek.moduller ?? [],
    p_musteri_id: ek.musteriId ?? null,
    p_izinli_turler: ek.izinliTurler ?? [],
  })
  if (error) { console.error('kullaniciOnayla hata:', error.message); throw error }
  return toCamel(data)
}

export const kullaniciReddet = async (id, neden = null) => {
  const { data, error } = await supabase.rpc('kullanici_reddet', { p_id: id, p_neden: neden })
  if (error) { console.error('kullaniciReddet hata:', error.message); throw error }
  return toCamel(data)
}
