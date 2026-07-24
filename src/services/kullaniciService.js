import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

// Liste kolonları — 21 kullanıcı listesinde imza (~150KB base64) taşımak saçma.
// Servis Formu / mobil profil ihtiyacı için ayrıca session'a özgü kolon seti var.
const KULLANICI_KOLONLARI = 'id, ad, kullanici_adi, tip, moduller, durum, izinli_turler, firma_adi, unvan, foto_url, rol, email, musteri_id, cep_telefon, siparis_onay_yetkilisi, siparis_onay_ust_yetkili, teklif_onay_yetkilisi, teklif_onay_ust_yetkili, fatura_yetkilisi, montaj_sorumlusu, demirbas_yetkilisi, saha_sorumlusu, hesap_silindi, onay_durum, onay_tarihi, onaylayan_id, red_nedeni, email_dogrulandi, zeyna_kalan_soru, zeyna_toplam_soru, created_at, silinebilir, auth_id'

// Session'daki kullanıcının tam bilgisi — imza dahil (Profil ekranı için gerekli).
// Liste'de değil, sadece login/session-restore çağrılarında kullanılır.
const KULLANICI_SESSION_KOLONLARI = KULLANICI_KOLONLARI + ', imza'

// Username → internal email (auth için sentetik email)
const kullaniciAdiToEmail = (kullaniciAdi) =>
  `${kullaniciAdi.toLowerCase().replace(/[^a-z0-9]/g, '')}@zna.local`

export const kullanicilariGetir = async () => {
  const { data } = await supabase.from('kullanicilar').select(KULLANICI_KOLONLARI).order('id')
  return arrayToCamel(data)
}

// Supabase Auth ile giriş.
// 1. auth.signInWithPassword(email, password)
// 2. Başarılı ise kullanicilar tablosundan profili çek (auth_id ile)
export const kullaniciGirisKontrol = async (kullaniciAdi, sifre) => {
  // '@' içeriyorsa gerçek e-posta; yoksa önce DB'den gercek email cozumle (RPC),
  // bulunamazsa sentetik @zna.local'e fallback yap.
  const girdi = (kullaniciAdi ?? '').trim()
  let email = null
  if (girdi.includes('@')) {
    email = girdi.toLowerCase()
  } else {
    try {
      const { data: cozulen } = await supabase.rpc('kullanici_adi_email_cozumle', { p_kullanici_adi: girdi })
      if (cozulen && typeof cozulen === 'string') email = cozulen.toLowerCase()
    } catch (e) { console.warn('[kullaniciGirisKontrol] email cozumle hata:', e?.message) }
    if (!email) email = kullaniciAdiToEmail(girdi)
  }

  // Brute-force kilit kontrolü — 15 dk'da 5+ başarısız → 15 dk kilit
  try {
    const { data: kilitSn } = await supabase.rpc('giris_kilit_saniye', { p_email: email })
    if (typeof kilitSn === 'number' && kilitSn > 0) {
      const dk = Math.ceil(kilitSn / 60)
      const e = new Error(`Çok fazla başarısız deneme. Hesap ${dk} dakika kilitli. Şifrenizi hatırlayamıyorsanız "Şifremi Unuttum" ile sıfırlayabilirsiniz.`)
      e.kod = 'KILITLI'
      e.kalanSaniye = kilitSn
      throw e
    }
  } catch (e) {
    if (e.kod === 'KILITLI') throw e
    console.warn('[kullaniciGirisKontrol] kilit kontrolü hata:', e?.message)
  }

  let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password: sifre,
  })
  // Fallback: gercek email basarisizsa sentetik denenmis olabilir
  if ((authError || !authData?.user) && !girdi.includes('@')) {
    const sentetik = kullaniciAdiToEmail(girdi)
    if (sentetik !== email) {
      const retry = await supabase.auth.signInWithPassword({ email: sentetik, password: sifre })
      if (!retry.error && retry.data?.user) { authData = retry.data; authError = null }
    }
  }

  // Deneme kaydı (başarılı/başarısız)
  const basarili = !!(authData?.user && !authError)
  try {
    await supabase.rpc('giris_denemesi_kaydet', { p_email: email, p_basarili: basarili })
  } catch (e) { console.warn('[kullaniciGirisKontrol] deneme kaydı hata:', e?.message) }

  if (authError || !authData?.user) return null

  // Şifre DOĞRU (signIn başarılı) — profil çekimi geçici ağ hatasına takılırsa
  // retry et; tek timeout'ta null dönmek kullanıcıya "hatalı giriş" gibi
  // yansıyor ve tekrar tekrar login denemesine yol açıyordu.
  let profilCamel = null
  try {
    profilCamel = await profilGetirRetry(authData.user.id)
  } catch (e) {
    console.warn('[kullaniciGirisKontrol] profil alınamadı (retry sonrası):', e.message)
    const err = new Error('Bağlantı sorunu: profil bilgisi alınamadı. Lütfen tekrar deneyin.')
    err.kod = 'PROFIL_HATASI'
    throw err
  }
  if (!profilCamel) return null
  const profil = {
    onay_durum: profilCamel.onayDurum,
    red_nedeni: profilCamel.redNedeni,
  }

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
  return profilCamel
}

// Promise.race timeout helper — supabase çağrıları hanging kalırsa bypass
const ileTimeout = (promise, ms, etiket) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${etiket} timeout (${ms}ms)`)), ms)),
  ])
}

const bekle = (ms) => new Promise((r) => setTimeout(r, ms))

// Profili RETRY ile getir — tek seferlik geçici ağ hatası / timeout, geçerli
// oturumu olan kullanıcıyı login'e DÜŞÜRMEMELİ. (Deploy sonrası chunk reload
// fırtınasında her mount'ta tek zar atılıyordu; kaybeden login'e düşüyordu.)
const profilGetirRetry = async (authId, deneme = 3) => {
  let sonHata
  for (let i = 0; i < deneme; i++) {
    try {
      const { data: profil, error } = await ileTimeout(
        supabase.from('kullanicilar').select(KULLANICI_SESSION_KOLONLARI).eq('auth_id', authId).single(),
        6000,
        'profil',
      )
      if (error) throw new Error(error.message)
      return profil ? toCamel(profil) : null
    } catch (e) {
      sonHata = e
      console.warn(`[profilGetir] deneme ${i + 1}/${deneme}:`, e.message)
      if (i < deneme - 1) await bekle(600 * (i + 1))
    }
  }
  throw sonHata
}

// Oturum yenileme — sayfa yüklendiğinde çağır.
// KRİTİK: getSession() ve profil sorgusu timeout olmadan hang olabilir
// (stale session, ölmüş HTTP/2 keep-alive, vb.). Timeout race + RETRY:
// geçici hata login'e düşürmesin; ancak gerçekten oturum yoksa null dön.
export const mevcutOturumKullanici = async () => {
  let session = null
  for (let i = 0; i < 2; i++) {
    try {
      const result = await ileTimeout(supabase.auth.getSession(), 5000, 'getSession')
      session = result?.data?.session
      break
    } catch (e) {
      console.warn(`[mevcutOturumKullanici] getSession deneme ${i + 1}/2:`, e.message)
      if (i === 0) await bekle(600)
    }
  }
  if (!session?.user) return null

  try {
    return await profilGetirRetry(session.user.id)
  } catch (e) {
    console.warn('[mevcutOturumKullanici] profil alınamadı (retry sonrası):', e.message)
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
  // Hem kullanicilar satirini hem auth.users kaydini siler (RPC) →
  // ayni e-posta ile tekrar kayit olunabilir, cakisma olmaz.
  const { error } = await supabase.rpc('kullanici_tam_sil', { p_id: id })
  if (error) {
    console.error('kullaniciSil hata:', error.message)
    throw new Error(error.message)
  }
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
  // Onay maili — best-effort, giriş akışını bloklamaz
  supabase.functions.invoke('kullanici-onay-bildir', { body: { kullaniciId: id } })
    .catch((e) => console.warn('[onay-bildir]', e?.message))
  return toCamel(data)
}

export const kullaniciReddet = async (id, neden = null) => {
  const { data, error } = await supabase.rpc('kullanici_reddet', { p_id: id, p_neden: neden })
  if (error) { console.error('kullaniciReddet hata:', error.message); throw error }
  return toCamel(data)
}
