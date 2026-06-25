// Zeyna AI asistanı — frontend service wrapper.
//
// NOT: supabase.functions.invoke yerine RAW FETCH kullaniyoruz —
// supabase-js v2.104'te uzun (5-6 sn) yanitlarda 'Failed to send a request'
// hatasi veriyordu. Raw fetch ile sorun yok.

import { supabase } from '../lib/supabase'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/zeyna`
const APIKEY = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Zeyna'ya mesaj gönder. Raw fetch (supabase-js bypass).
 */
export async function zeynaMesajGonder(mesaj, konusmaId) {
  // Aktif session'dan access_token al
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Oturum bulunamadı, tekrar giriş yap.')

  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: APIKEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mesaj, konusma_id: konusmaId }),
  })

  let data = null
  try { data = await res.json() } catch {}
  if (!res.ok) {
    const hata = data?.hata ?? `Sunucu hatasi (${res.status})`
    const e = new Error(hata)
    if (data?.kota_bitti) e.kota_bitti = true
    throw e
  }
  if (!data?.ok) {
    const e = new Error(data?.hata ?? 'Zeyna yanıt veremedi.')
    if (data?.kota_bitti) e.kota_bitti = true
    throw e
  }
  return data
}

/**
 * Kullanıcının konuşma geçmişi (sol panel — sohbet listesi).
 */
export async function konusmalarimiGetir() {
  const { data, error } = await supabase
    .from('ai_konusmalar')
    .select('id, baslik, son_mesaj_tarihi, mesaj_sayisi')
    .eq('arsivlendi', false)
    .order('son_mesaj_tarihi', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

/**
 * Bir konuşmanın tüm mesajları.
 */
export async function konusmaMesajlariniGetir(konusmaId) {
  const { data, error } = await supabase
    .from('ai_mesajlar')
    .select('id, rol, icerik, olusturma_tarih')
    .eq('konusma_id', konusmaId)
    .order('id', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function konusmaArsivle(konusmaId) {
  const { error } = await supabase
    .from('ai_konusmalar')
    .update({ arsivlendi: true })
    .eq('id', konusmaId)
  if (error) throw error
}
