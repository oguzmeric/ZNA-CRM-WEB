// Zeyna AI asistanı — frontend service wrapper.

import { supabase } from '../lib/supabase'

/**
 * Zeyna'ya mesaj gönder.
 * @param {string} mesaj
 * @param {number} [konusmaId] - opsiyonel: mevcut konuşmaya devam et
 * @returns {Promise<{ok:true, konusma_id:number, yanit:string, token_input:number, token_output:number}>}
 */
export async function zeynaMesajGonder(mesaj, konusmaId) {
  const { data, error } = await supabase.functions.invoke('zeyna', {
    body: { mesaj, konusma_id: konusmaId },
  })
  if (error) throw new Error(error.message)
  if (!data?.ok) throw new Error(data?.hata ?? 'Zeyna yanıt veremedi.')
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
