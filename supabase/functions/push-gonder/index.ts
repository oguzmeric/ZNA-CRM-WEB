// Yeni bildirim eklendiğinde çağrılır.
// Hedef kullanıcının tüm cihazlarına Expo Push API üzerinden push gönderir.
//
// Çağrı: POST { bildirimId: number }
// Trigger DB'den otomatik çağırır (034_bildirim_push_trigger.sql).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

serve(async (req) => {
  try {
    const { bildirimId } = await req.json()
    if (!bildirimId) {
      return new Response(JSON.stringify({ ok: false, hata: 'bildirimId gerekli' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supa = createClient(SUPABASE_URL, SERVICE_ROLE)

    // Bildirimi al — alici_id = bildirimi alacak kullanıcı
    const { data: bildirim, error: bErr } = await supa
      .from('bildirimler')
      .select('id, alici_id, baslik, mesaj, tip')
      .eq('id', bildirimId)
      .single()

    if (bErr || !bildirim) {
      return new Response(JSON.stringify({ ok: false, hata: 'Bildirim bulunamadı' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Hedef kullanıcının token'larını al
    const { data: tokenler, error: tErr } = await supa
      .from('kullanici_push_tokenlari')
      .select('id, token')
      .eq('kullanici_id', bildirim.alici_id)

    if (tErr) {
      return new Response(JSON.stringify({ ok: false, hata: 'Token sorgu: ' + tErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (!tokenler || tokenler.length === 0) {
      return new Response(JSON.stringify({ ok: true, gonderildi: 0, sebep: 'token yok' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Okunmamış sayısını al (badge için)
    const { count: okunmamis } = await supa
      .from('bildirimler')
      .select('id', { count: 'exact', head: true })
      .eq('alici_id', bildirim.alici_id)
      .eq('okundu', false)

    // Expo Push API'ye batch
    const messages = tokenler.map((t) => ({
      to: t.token,
      sound: 'default',
      title: bildirim.baslik ?? 'Bildirim',
      body: bildirim.mesaj ?? '',
      badge: typeof okunmamis === 'number' ? okunmamis : undefined,
      data: { bildirimId: bildirim.id, tip: bildirim.tip },
    }))

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    })
    const sonuc = await res.json()

    // Geçersiz token'ları temizle
    if (Array.isArray(sonuc?.data)) {
      const silinecek: number[] = []
      sonuc.data.forEach((row: any, i: number) => {
        if (
          row?.status === 'error' &&
          (row?.details?.error === 'DeviceNotRegistered' ||
            row?.details?.error === 'InvalidCredentials')
        ) {
          silinecek.push(tokenler[i].id)
        }
      })
      if (silinecek.length > 0) {
        await supa.from('kullanici_push_tokenlari').delete().in('id', silinecek)
      }
    }

    return new Response(
      JSON.stringify({ ok: true, gonderildi: tokenler.length, expo: sonuc }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, hata: (e as Error)?.message ?? 'bilinmeyen' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
