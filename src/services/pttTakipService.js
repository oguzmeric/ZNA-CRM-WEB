// PTT gönderi takip servisi — supabase edge function 'ptt-takip'i çağırır.
// Sonuç 30 dakika localStorage'da cache'lenir (aynı takip no'ya sürekli çağrı gitmesin).

import { supabase } from '../lib/supabase'

const CACHE_ANAHTAR = (takipNo) => `ptt_takip_${takipNo}`
const CACHE_SURE_MS = 30 * 60 * 1000  // 30 dk

// takipNo → { ok, sonDurum, sonGuncelleme, hareketler[], demo? }
export async function pttTakipGetir(takipNo, { yenile = false } = {}) {
  if (!takipNo) return { ok: false, hata: 'takipNo boş' }

  // Cache kontrol
  if (!yenile) {
    try {
      const raw = localStorage.getItem(CACHE_ANAHTAR(takipNo))
      if (raw) {
        const c = JSON.parse(raw)
        if (Date.now() - c.zaman < CACHE_SURE_MS) {
          return { ...c.veri, kaynak: 'cache' }
        }
      }
    } catch {}
  }

  try {
    const { data, error } = await supabase.functions.invoke('ptt-takip', {
      body: { takipNo },
    })
    if (error) return { ok: false, hata: error.message }
    if (data?.ok) {
      try {
        localStorage.setItem(CACHE_ANAHTAR(takipNo), JSON.stringify({ zaman: Date.now(), veri: data }))
      } catch {}
    }
    return data
  } catch (e) {
    return { ok: false, hata: e?.message || 'bilinmeyen hata' }
  }
}

export function pttTakipCacheTemizle(takipNo) {
  try { localStorage.removeItem(CACHE_ANAHTAR(takipNo)) } catch {}
}
