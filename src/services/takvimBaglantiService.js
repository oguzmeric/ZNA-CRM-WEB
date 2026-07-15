// Harici takvim bağlantıları (Google Calendar — Outlook ileride) ve etkinlikler.

import { supabase } from '../lib/supabase'
import { cached, invalidate } from '../lib/cache'

const GOOGLE_CLIENT_ID = '954751547968-e03blkl20k73bit261sljftr3nvflue4.apps.googleusercontent.com'
// calendar.events: read + write (etkinlik oluştur, davetli ekle, Meet linki üret)
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events email profile'

// Google OAuth başlangıç URL'i — kullanıcıyı buraya yönlendir
export function googleOAuthBaslat(kullaniciId, mevcutOrigin) {
  const redirectUri = `${mevcutOrigin}/oauth/google/callback`
  // state: kullanıcı id'sini callback'e taşımak için (CSRF koruması da burada)
  const state = btoa(JSON.stringify({
    kullaniciId,
    nonce: Math.random().toString(36).slice(2),
    t: Date.now(),
  }))

  // Bir sonraki callback adımı için ne için bağlanıldığını localStorage'a yaz
  sessionStorage.setItem('takvim_oauth_state', state)
  sessionStorage.setItem('takvim_oauth_redirect_uri', redirectUri)

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',        // refresh_token al
    prompt: 'select_account consent',  // her bağlantıda hem hesap seçtir hem izin sor
                                       // (birden fazla Gmail hesabı bağlayabilmek için kritik)
    state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

// Callback page'de code → token exchange (edge function çağrısı)
export async function googleOAuthTamamla({ code, kullaniciId, redirectUri }) {
  const { data, error } = await supabase.functions.invoke('google-takvim-baglan', {
    body: { code, kullaniciId, redirectUri },
  })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.hata ?? 'OAuth tamamlanamadı')
  invalidate('takvim_baglantilari', `harici_etkinlikler:${kullaniciId}`)
  return data
}

// Bir kullanıcının takvim bağlantılarını listele
export async function takvimBaglantilariniGetir(kullaniciId) {
  if (!kullaniciId) return []
  const { data, error } = await supabase
    .from('kullanici_takvim_baglantilari')
    .select('id, saglayici, hesap_email, aktif, son_sync_zamani, son_sync_hatasi, olusturma_tarih')
    .eq('kullanici_id', kullaniciId)
    .order('olusturma_tarih', { ascending: false })
  if (error) { console.warn('takvimBaglantilariniGetir', error.message); return [] }
  return data ?? []
}

// Bağlantıyı sil (token'lar dahil her şey)
export async function takvimBaglantisiKaldir(baglantiId) {
  const { error } = await supabase
    .from('kullanici_takvim_baglantilari')
    .delete()
    .eq('id', baglantiId)
  if (error) throw error
  invalidate('takvim_baglantilari')
}

// Manuel sync tetikle
export async function takvimSyncTetikle(baglantiId) {
  const { data, error } = await supabase.functions.invoke('google-takvim-sync', {
    body: { baglantiId },
  })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.hata ?? 'Senkronizasyon başarısız')
  return data
}

// Kullanıcının aktif bağlantılarından SON_SYNC_ZAMANI eskiyse otomatik sync tetikle.
// Takvim sayfası açıldığında çağrılır — kullanıcıya hızlı güncellik sağlar.
// Throttle: her bağlantı son sync'ten 5 dk geçtiyse tetikler, daha taze ise atlar.
//
// Best-effort: hata olursa sessiz, UI etkilenmez.
export async function tazelikSyncTetikle(kullaniciId, threshDk = 5) {
  if (!kullaniciId) return
  try {
    const { data: baglantilar } = await supabase
      .from('kullanici_takvim_baglantilari')
      .select('id, son_sync_zamani')
      .eq('kullanici_id', kullaniciId)
      .eq('aktif', true)

    const simdi = Date.now()
    const esikMs = threshDk * 60 * 1000
    const eskiOlanlar = (baglantilar ?? []).filter(b => {
      if (!b.son_sync_zamani) return true  // hiç sync edilmediyse zaten lazım
      return (simdi - new Date(b.son_sync_zamani).getTime()) > esikMs
    })

    // Paralel olarak hepsini tetikle (her biri ayrı edge function çağrısı)
    await Promise.allSettled(
      eskiOlanlar.map(b =>
        supabase.functions.invoke('google-takvim-sync', { body: { baglantiId: b.id } })
      )
    )

    if (eskiOlanlar.length > 0) {
      invalidate(`harici_etkinlikler:${kullaniciId}`)
    }
    return { tetiklenenSayisi: eskiOlanlar.length }
  } catch (e) {
    console.warn('[tazelikSyncTetikle]', e?.message)
  }
}

// CRM'den Google Calendar'a etkinlik oluştur (+ opsiyonel Google Meet linki)
// baglantiId: hangi Google hesabına yazılacak (kullanici_takvim_baglantilari.id)
// payload: { baslik, aciklama, lokasyon, baslangic (ISO), bitis (ISO), davetliler ([email,...]), meetOlustur (bool) }
export async function etkinlikOlustur(baglantiId, payload) {
  if (!baglantiId) {
    throw new Error('Google Calendar bağlantısı seçilmedi. "Takvim Bağlantıları" sayfasından bağlantı ekleyin.')
  }
  const { data, error } = await supabase.functions.invoke('google-takvim-etkinlik-olustur', {
    body: { baglantiId, ...payload },
  })
  // supabase-js v2 non-2xx'te error.context = Response objesi.
  // Gerçek (Türkçe) hata mesajını bu Response gövdesinden okumamız gerek.
  if (error) {
    let mesaj = error.message ?? 'Etkinlik oluşturulamadı'
    let scopeYok = false
    // "Failed to send a request to the Edge Function" — istemci ulaşamıyor
    if (/failed to send.*edge function/i.test(mesaj)) {
      mesaj = 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin, sayfayı yenileyin (Ctrl+Shift+R) veya oturumunuzu kapatıp tekrar açın. Sorun devam ederse ad-blocker/uzantıları kapatıp deneyin.'
    }
    try {
      const ctx = error.context
      if (ctx && typeof ctx.text === 'function') {
        const text = await ctx.text()
        if (text) {
          try {
            const body = JSON.parse(text)
            if (body?.hata) mesaj = body.hata
            if (body?.scopeYok) scopeYok = true
          } catch {
            mesaj = text.slice(0, 300)
          }
        }
      } else if (typeof ctx === 'object' && ctx?.hata) {
        mesaj = ctx.hata
        if (ctx.scopeYok) scopeYok = true
      }
    } catch (e) {
      console.warn('[etkinlikOlustur error parse]', e)
    }
    console.error('[etkinlikOlustur] hata:', error, 'mesaj:', mesaj)
    const err = new Error(mesaj)
    err.scopeYok = scopeYok
    throw err
  }
  if (!data?.ok) throw new Error(data?.hata ?? 'Etkinlik oluşturulamadı')
  // Cache invalidate — yeni etkinlik listede görünmeli
  invalidate(`harici_etkinlikler`)
  return data
}

// Etkinliği Google Calendar'dan ve DB'den sil (soft-delete + Google'a iptal bildirimi)
export async function etkinlikSil(etkinlikId) {
  const { data, error } = await supabase.functions.invoke('google-takvim-etkinlik-sil', {
    body: { etkinlikId },
  })
  if (error) {
    let mesaj = error.message ?? 'Etkinlik silinemedi'
    try {
      const ctx = error.context
      if (ctx && typeof ctx.text === 'function') {
        const text = await ctx.text()
        if (text) {
          try {
            const body = JSON.parse(text)
            if (body?.hata) mesaj = body.hata
            if (body?.scopeYok) mesaj += ' (Bağlantıyı yenileyin.)'
          } catch { mesaj = text.slice(0, 300) }
        }
      }
    } catch {}
    throw new Error(mesaj)
  }
  if (!data?.ok) throw new Error(data?.hata ?? 'Etkinlik silinemedi')
  invalidate(`harici_etkinlikler`)
  return data
}

// Bir kullanıcının harici etkinliklerini, belirli tarih aralığında çek
// (Takvim ekranı buradan beslenir)
export async function hariciEtkinlikleriGetir(kullaniciId, baslangic, bitis) {
  if (!kullaniciId) return []
  const { data, error } = await supabase
    .from('harici_etkinlikler')
    .select('id, baglanti_id, saglayici, baslik, aciklama, lokasyon, baslangic, bitis, tum_gun, durum, davetliler, organizator_email, toplanti_linki')
    .eq('kullanici_id', kullaniciId)
    .eq('silindi', false)
    .gte('baslangic', baslangic)
    .lte('baslangic', bitis)
    .order('baslangic', { ascending: true })
  if (error) { console.warn('hariciEtkinlikleriGetir', error.message); return [] }
  return data ?? []
}

// ─── Etkinlik ↔ Müşteri bağı (mig 173) ────────────────────────────────────
// Toplantıya müşteri bağlanınca Firma Geçmişi zaman çizelgesinde görünür.

/**
 * Oluşturulan etkinliği seçili müşterilere bağla.
 * Etkinlik ZATEN oluşmuş durumda çağrılır — burada patlarsa etkinliği geri
 * almayız, çağıran tarafa hata döner ve kullanıcıya bildirilir.
 */
export async function etkinlikMusterileriBagla(etkinlikId, musteriIdler = [], olusturanId = null) {
  const idler = [...new Set((musteriIdler || []).map(Number).filter(Boolean))]
  if (!etkinlikId || !idler.length) return []
  const { data, error } = await supabase
    .from('etkinlik_musterileri')
    .upsert(
      idler.map((mid) => ({ etkinlik_id: etkinlikId, musteri_id: mid, olusturan_id: olusturanId })),
      { onConflict: 'etkinlik_id,musteri_id' },
    )
    .select()
  if (error) throw new Error('Toplantı müşteriye bağlanamadı: ' + error.message)
  return data ?? []
}

/** Bir müşterinin bağlı toplantıları — Firma Geçmişi zaman çizelgesi için. */
export async function musteriToplantilariGetir(musteriId) {
  if (!musteriId) return []
  const { data, error } = await supabase
    .from('etkinlik_musterileri')
    .select('etkinlik_id, harici_etkinlikler (id, baslik, aciklama, lokasyon, baslangic, bitis, toplanti_linki, durum, davetliler, silindi)')
    .eq('musteri_id', musteriId)
  if (error) { console.warn('musteriToplantilariGetir', error.message); return [] }
  return (data ?? [])
    .map((r) => r.harici_etkinlikler)
    .filter((e) => e && !e.silindi)          // iptal edilen toplantı geçmişte durmasın
    .sort((a, b) => new Date(b.baslangic) - new Date(a.baslangic))
}
