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
  const email = kullaniciAdiToEmail(kullaniciAdi)
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
  return profil ? toCamel(profil) : null
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
