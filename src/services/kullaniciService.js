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

  const { data: profil } = await supabase
    .from('kullanicilar')
    .select('*')
    .eq('auth_id', authData.user.id)
    .single()

  return profil ? toCamel(profil) : null
}

// Oturum yenileme — sayfa yüklendiğinde çağır
export const mevcutOturumKullanici = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return null

  const { data: profil } = await supabase
    .from('kullanicilar')
    .select('*')
    .eq('auth_id', session.user.id)
    .single()

  return profil ? toCamel(profil) : null
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
