// Servis konu başlıkları — sabit liste (mig 285).
//
// Konu artık serbest metin DEĞİL: web, müşteri portalı ve mobil bu listeden
// seçer. Detay Açıklama alanına yazılır. Rapor köprüsü konuyu ariza_kodu'na
// metin olarak kopyalar; başlık sonradan yeniden adlandırılsa bile eski
// raporlar o günkü metniyle kalır (bilinçli — tarihsel kayıt değişmez).
//
// ⚠️ SİLME YOK, pasife alma var: silinen başlığın metni binlerce raporda
// yaşıyor; pasif başlık yeni talepte seçilemez ama geçmiş bozulmaz.

import { supabase } from '../lib/supabase'
import { arrayToCamel, toCamel } from '../lib/mapper'

/** Yeni talep formlarının listesi — yalnız aktifler, klasör sırasıyla */
export const aktifKonulariGetir = async () => {
  const { data, error } = await supabase
    .from('servis_konulari')
    .select('id, ad, sira')
    .eq('aktif', true)
    .order('sira')
    .order('ad')
  if (error) { console.error('[aktifKonulariGetir]', error.message); return [] }
  return arrayToCamel(data)
}

/** Yönetim ekranı — pasifler de dahil */
export const tumKonulariGetir = async () => {
  const { data, error } = await supabase
    .from('servis_konulari')
    .select('*')
    .order('aktif', { ascending: false })
    .order('sira')
    .order('ad')
  if (error) { console.error('[tumKonulariGetir]', error.message); return [] }
  return arrayToCamel(data)
}

export const konuEkle = async (ad, kullaniciId) => {
  const temiz = String(ad || '').trim()
  if (!temiz) return { _hata: 'Başlık boş olamaz.' }
  const { data, error } = await supabase
    .from('servis_konulari')
    .insert({ ad: temiz, olusturan_id: kullaniciId ?? null })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') return { _hata: `"${temiz}" zaten listede.` }
    console.error('[konuEkle]', error.message)
    return { _hata: error.message }
  }
  return toCamel(data)
}

/** Pasife al / geri aç — yeni taleplerde görünürlüğü belirler */
export const konuAktifDegistir = async (id, aktif) => {
  const { data, error } = await supabase
    .from('servis_konulari')
    .update({ aktif })
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('[konuAktifDegistir]', error.message); return { _hata: error.message } }
  return toCamel(data)
}
