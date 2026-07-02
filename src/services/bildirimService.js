// Bildirim servisi — DB tabanlı (localStorage'dan migrate edildi).
// RLS sayesinde her kullanıcı yalnızca kendine yönelik bildirimleri görür.

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

// Kullanıcının bildirimlerini çek (en yeni 50)
export const bildirimleriGetir = async (kullaniciId, limit = 50) => {
  if (!kullaniciId) return []
  const { data, error } = await supabase
    .from('bildirimler')
    .select('*')
    .eq('alici_id', kullaniciId)
    .order('olusturma_tarih', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('[bildirimleriGetir] hata:', error.message)
    return []
  }
  return arrayToCamel(data || [])
}

// Okunmamış sayısı (badge için)
export const okunmamisBildirimSayisi = async (kullaniciId) => {
  if (!kullaniciId) return 0
  const { count, error } = await supabase
    .from('bildirimler')
    .select('*', { count: 'exact', head: true })
    .eq('alici_id', kullaniciId)
    .eq('okundu', false)
  if (error) {
    console.error('[okunmamisBildirimSayisi] hata:', error.message)
    return 0
  }
  return count ?? 0
}

// Yeni bildirim ekle — RPC üzerinden (SECURITY DEFINER).
// RLS WITH CHECK'in is_staff()+alt-sorgu kombinasyonuyla güvenilmez etkileşimini
// bypass etmek için. Staff kontrolü RPC içinde yapılıyor.
// payload: { aliciId, gonderenId?, baslik, mesaj?, tip?, link?, meta? }
export const bildirimEkleDb = async (payload) => {
  if (!payload?.aliciId) return null
  const { data, error } = await supabase.rpc('bildirim_ekle', {
    p_alici_id: Number(payload.aliciId),
    p_baslik: payload.baslik || '',
    p_mesaj: payload.mesaj || '',
    p_tip: payload.tip || 'bilgi',
    p_link: payload.link || '',
    p_meta: payload.meta || null,
  })
  if (error) {
    console.error('[bildirimEkleDb] hata:', error.message)
    return null
  }
  return { id: data }
}

// Birden fazla alıcıya aynı bildirimi gönder (örn. @mention 2 kişi) — RPC üzerinden
export const cokluBildirimEkle = async (aliciIdList, baseBildirim) => {
  if (!aliciIdList?.length) return []
  const { data, error } = await supabase.rpc('bildirim_ekle_coklu', {
    p_alici_idler: aliciIdList.map(Number),
    p_baslik: baseBildirim.baslik || '',
    p_mesaj: baseBildirim.mesaj || '',
    p_tip: baseBildirim.tip || 'bilgi',
    p_link: baseBildirim.link || '',
    p_meta: baseBildirim.meta || null,
  })
  if (error) {
    console.error('[cokluBildirimEkle] hata:', error.message)
    return []
  }
  return (data || []).map(id => ({ id }))
}

// Bildirimi okundu olarak işaretle
export const bildirimOkuDb = async (id) => {
  const { error } = await supabase
    .from('bildirimler')
    .update({ okundu: true, okunma_tarih: new Date().toISOString() })
    .eq('id', id)
  if (error) console.error('[bildirimOkuDb] hata:', error.message)
}

// Tüm bildirimleri okundu işaretle (kullanıcıya ait)
export const tumBildirimleriOkuDb = async (kullaniciId) => {
  const { error } = await supabase
    .from('bildirimler')
    .update({ okundu: true, okunma_tarih: new Date().toISOString() })
    .eq('alici_id', kullaniciId)
    .eq('okundu', false)
  if (error) console.error('[tumBildirimleriOkuDb] hata:', error.message)
}

// Bildirimi sil
export const bildirimSilDb = async (id) => {
  const { error } = await supabase.from('bildirimler').delete().eq('id', id)
  if (error) console.error('[bildirimSilDb] hata:', error.message)
}

// Realtime — yeni bildirim geldiğinde callback tetikler
// Kullanım: const sub = bildirimleriDinle(kullaniciId, (yeni) => { ... })
//          sub.unsubscribe() (cleanup'ta)
// NOT: Kanal adı her abonelik için unique olmalı, aksi halde Supabase aynı
// kanalı reuse eder ve ikinci .on() "cannot add callbacks after subscribe()"
// fırlatır (örn: aynı kullanıcı için 2 farklı bileşen abone olduğunda).
let _kanalSayac = 0
export const bildirimleriDinle = (kullaniciId, onYeniBildirim) => {
  if (!kullaniciId) return { unsubscribe: () => {} }
  _kanalSayac += 1
  const kanalAdi = `bildirimler:${kullaniciId}:${_kanalSayac}:${Date.now()}`
  const channel = supabase
    .channel(kanalAdi)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'bildirimler',
        filter: `alici_id=eq.${kullaniciId}`,
      },
      (payload) => {
        try {
          onYeniBildirim?.(toCamel(payload.new))
        } catch (e) {
          console.error('[bildirim realtime] callback hata:', e)
        }
      },
    )
    .subscribe()
  return {
    unsubscribe: () => {
      try { supabase.removeChannel(channel) } catch {}
    },
  }
}
