// Personel özlük evrak arşivi (mig 314).
//
// İK'nın personelden topladığı evraklar: kimlik, diploma, adli sicil, sağlık
// raporu, ikametgah, SGK işe giriş bildirgesi...
//
// ⚠️ `kisiDokumanService` ile KARIŞTIRMA: orası kişinin KENDİ dosya dolabı
// (kendi yükler, görünürlüğünü kendi seçer). Burası İK'nın tuttuğu işveren
// kaydı — personelin silme/gizleme yetkisi yok, hatta göremiyor.
//
// Kapı `ik_yetkili()` ('ik_yonetim' modülü). Salt admin olmak YETMEZ.

import { supabase } from '../lib/supabase'

const BUCKET = 'personel-evrak'
export const MAX_BOYUT_MB = 20
const TIPLER = ['application/pdf', 'image/jpeg', 'image/png']

// DB'de check constraint YOK (bkz. mig 314) — liste burada yaşıyor, yeni tür
// eklemek migration gerektirmesin. `sureli` alanı, geçerlilik tarihi sorulacak
// evrakları işaretler.
export const EVRAK_TURLERI = [
  { id: 'kimlik',        ad: 'Kimlik Fotokopisi' },
  { id: 'diploma',       ad: 'Diploma / Öğrenim Belgesi' },
  { id: 'adli_sicil',    ad: 'Adli Sicil Kaydı' },
  { id: 'saglik_raporu', ad: 'Sağlık Raporu',            sureli: true },
  { id: 'ikametgah',     ad: 'İkametgah Belgesi' },
  { id: 'sgk_giris',     ad: 'SGK İşe Giriş Bildirgesi' },
  { id: 'vesikalik',     ad: 'Vesikalık Fotoğraf' },
  { id: 'askerlik',      ad: 'Askerlik Durum Belgesi' },
  { id: 'ehliyet',       ad: 'Ehliyet Fotokopisi',        sureli: true },
  { id: 'sertifika',     ad: 'Sertifika / Yeterlilik',    sureli: true },
  { id: 'sozlesme',      ad: 'İş Sözleşmesi' },
  { id: 'diger',         ad: 'Diğer' },
]

export const turAd = (id) => EVRAK_TURLERI.find(t => t.id === id)?.ad || id || '—'
export const turSureliMi = (id) => !!EVRAK_TURLERI.find(t => t.id === id)?.sureli

export async function evraklariGetir(kullaniciId) {
  const { data, error } = await supabase
    .from('personel_evraklari')
    .select('id, tur, baslik, dosya_yolu, dosya_ad, dosya_boyut, dosya_tip, gecerlilik_tarihi, aciklama, yukleyen_id, olusturma_tarih')
    .eq('kullanici_id', kullaniciId)
    .order('olusturma_tarih', { ascending: false })
  if (error) throw error
  return data || []
}

export async function evrakYukle(kullaniciId, alanlar, file) {
  if (!kullaniciId) throw new Error('Personel seçilmedi.')
  if (!file) throw new Error('Dosya seçilmedi.')
  // Bucket zaten reddeder ama oradan dönen hata kullanıcıya anlaşılmaz geliyor.
  if (!TIPLER.includes(file.type)) {
    throw new Error('Yalnız PDF, JPG veya PNG yükleyebilirsiniz.')
  }
  if (file.size > MAX_BOYUT_MB * 1024 * 1024) {
    throw new Error(`Dosya ${MAX_BOYUT_MB} MB sınırını aşıyor (${(file.size / 1048576).toFixed(1)} MB).`)
  }

  const uzanti = (file.name?.split('.').pop() || 'pdf').toLowerCase()
  const yol = `${kullaniciId}/${alanlar.tur}-${Date.now()}.${uzanti}`

  const { error: upHata } = await supabase.storage
    .from(BUCKET)
    .upload(yol, file, { contentType: file.type, upsert: false })
  if (upHata) throw new Error(upHata.message || 'Dosya yüklenemedi.')

  // Yükleyeni damgala — evrak sorumluluğunun izi.
  const { data: ben } = await supabase.auth.getUser()
  let yukleyenId = null
  if (ben?.user?.id) {
    const { data: k } = await supabase
      .from('kullanicilar').select('id').eq('auth_id', ben.user.id).maybeSingle()
    yukleyenId = k?.id ?? null
  }

  const { data, error } = await supabase
    .from('personel_evraklari')
    .insert({
      kullanici_id: kullaniciId,
      tur: alanlar.tur,
      baslik: alanlar.baslik?.trim() || null,
      dosya_yolu: yol,
      dosya_ad: file.name || null,
      dosya_boyut: file.size,
      dosya_tip: file.type,
      gecerlilik_tarihi: alanlar.gecerlilikTarihi || null,
      aciklama: alanlar.aciklama?.trim() || null,
      yukleyen_id: yukleyenId,
    })
    .select()
    .single()

  if (error) {
    // Kayıt açılamadıysa dosya bucket'ta öksüz kalmasın.
    await supabase.storage.from(BUCKET).remove([yol])
    throw new Error(error.message || 'Evrak kaydedilemedi.')
  }
  return data
}

// Private bucket — her açılışta 1 saatlik geçici bağlantı.
export async function evrakUrl(yol) {
  if (!yol) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(yol, 3600)
  if (error) { console.error('[evrak] evrakUrl:', error); return null }
  return data?.signedUrl ?? null
}

// Yanlış yüklenen evrağı kaldırır. Çağıran taraf ONAY ALMAK ZORUNDA —
// özlük evrakı geri getirilemez.
export async function evrakSil(id, yol) {
  const { error } = await supabase.from('personel_evraklari').delete().eq('id', id)
  if (error) throw error
  if (yol) await supabase.storage.from(BUCKET).remove([yol])
  return true
}
