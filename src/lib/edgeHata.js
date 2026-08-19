// Edge function hatalarının GERÇEK mesajını çıkarır.
//
// SORUN (19.08): `supabase.functions.invoke` non-2xx bir yanıt alınca
// FunctionsHttpError üretir ve `error.message` DAİMA şu genel metni taşır:
//
//     "Edge Function returned a non-2xx status code"
//
// Fonksiyonun kendi anlattığı sebep — örneğin
// {"ok":false,"hata":"Mobiltek aylık sorgulama limiti dolmuş."} — yanıt
// GÖVDESİNDE kalır ve `data` null geldiği için hiç okunmaz. Kullanıcı ekranda
// "Bağlantı hatası: Edge Function returned a non-2xx status code" görür;
// teknik, İngilizce ve hiçbir şey anlatmaz.
//
// Gövde `error.context` içinde bir Response olarak durur. Bir kez okunabilir,
// o yüzden önce klonlanır.

const GENEL_KALIP = /non-2xx status code/i

/**
 * @param {unknown} error  supabase.functions.invoke'un döndürdüğü hata
 * @param {string} varsayilan  gövdeden bir şey çıkmazsa gösterilecek metin
 * @returns {Promise<string>} kullanıcıya gösterilebilir Türkçe mesaj
 */
export async function edgeHataMesaji(error, varsayilan = 'İşlem tamamlanamadı.') {
  if (!error) return varsayilan

  // 1) Gövdeden fonksiyonun kendi mesajını çıkarmayı dene
  const ctx = error.context
  if (ctx && typeof ctx.clone === 'function') {
    try {
      const govde = await ctx.clone().json()
      const mesaj = govde?.hata || govde?.error || govde?.message
      if (mesaj && String(mesaj).trim()) return String(mesaj)
    } catch { /* gövde JSON değil ya da okunamadı — aşağı düş */ }
  }

  // 2) Zaman aşımı / ağ kopması ayrı bir dil ister
  // ⚠️ "timed out" da yakalanmalı: tarayıcılar "The operation timed out" diyor,
  // yalnız `timeout` aranınca bu İngilizce metin kullanıcıya sızıyordu.
  const ham = String(error.message || '')
  if (/time[ -]?d?\s?out|abort/i.test(ham)) {
    return 'Sunucu yanıt vermedi (zaman aşımı). Tekrar deneyin.'
  }
  if (/failed to fetch|network/i.test(ham)) {
    return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.'
  }

  // 3) Supabase'in genel metnini kullanıcıya OLDUĞU GİBİ gösterme
  if (!ham || GENEL_KALIP.test(ham)) return varsayilan
  return ham
}
