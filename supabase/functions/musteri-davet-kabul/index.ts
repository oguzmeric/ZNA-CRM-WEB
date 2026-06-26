// B2B musteri davet kabul — token + sifre alir, hesap olusturur.
//
// 2 endpoint tek fonksiyonda:
//   POST { action: 'dogrula', token }
//     -> davet token'i gecerli mi? email, musteri firma ile birlikte donulur
//   POST { action: 'kabul', token, sifre }
//     -> auth.users + kullanicilar (tip=musteri, onay_durum=onayli, musteri_id linkli) olustur
//     -> token kullanildi=true
//     -> response: { ok, email } (frontend signInWithPassword yapacak)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE)

function err(status: number, hata: string) {
  return new Response(
    JSON.stringify({ ok: false, hata }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

function ok(body: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ ok: true, ...body }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

async function davetiBul(token: string) {
  const { data, error } = await supa
    .from('musteri_davetleri')
    .select('id, token, email, musteri_id, ad, son_kullanma, kullanildi')
    .eq('token', token)
    .maybeSingle()
  if (error || !data) return null
  return data
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const action: string = (body?.action ?? '').toString()
    const token: string = (body?.token ?? '').toString().trim()

    if (!token || token.length < 16) return err(400, 'Geçersiz davet linki.')

    const davet = await davetiBul(token)
    if (!davet) return err(404, 'Davet bulunamadı veya geçersiz.')
    if (davet.kullanildi) return err(410, 'Bu davet daha önce kullanılmış. Giriş yapmayı deneyin.')
    if (new Date(davet.son_kullanma).getTime() < Date.now()) {
      return err(410, 'Bu davetin süresi dolmuş. Lütfen ZNA ekibinden yeni bir davet isteyin.')
    }

    // Musteri firma adi
    const { data: musteri } = await supa
      .from('musteriler')
      .select('id, firma')
      .eq('id', davet.musteri_id)
      .maybeSingle()

    if (action === 'dogrula') {
      return ok({
        email: davet.email,
        ad: davet.ad,
        firma: musteri?.firma ?? '',
        son_kullanma: davet.son_kullanma,
      })
    }

    if (action === 'kabul') {
      const sifre: string = (body?.sifre ?? '').toString()
      if (sifre.length < 8) return err(400, 'Şifre en az 8 karakter olmalı.')

      // Bu email icin auth user var mi? Varsa update, yoksa create.
      const { data: mevcutKullanici } = await supa
        .from('kullanicilar')
        .select('id, auth_id, email_dogrulandi, musteri_id, onay_durum')
        .eq('email', davet.email)
        .maybeSingle()

      let authUserId: string | null = mevcutKullanici?.auth_id ?? null

      if (!authUserId) {
        const { data: authData, error: authErr } = await supa.auth.admin.createUser({
          email: davet.email,
          password: sifre,
          email_confirm: true,
          user_metadata: { kayit_yontemi: 'b2b_davet', davet_id: davet.id },
        })
        if (authErr || !authData?.user) {
          console.error('[musteri-davet-kabul] auth.createUser:', authErr?.message)
          return err(502, 'Hesap oluşturulamadı: ' + (authErr?.message ?? 'bilinmeyen'))
        }
        authUserId = authData.user.id
      } else {
        const { error: updErr } = await supa.auth.admin.updateUserById(authUserId, {
          password: sifre,
          email_confirm: true,
        })
        if (updErr) {
          console.error('[musteri-davet-kabul] auth.update:', updErr.message)
          return err(502, 'Şifre güncellenemedi: ' + updErr.message)
        }
      }

      // kullanicilar tablosunda profil olustur/guncelle
      let kullaniciId = mevcutKullanici?.id
      if (!mevcutKullanici) {
        const adAday = davet.ad?.trim() || davet.email.split('@')[0]
        const kullaniciAdiAday = davet.email.split('@')[0]
          .toLowerCase()
          .replace(/[^a-z0-9.]/g, '')
        const { data: yeni, error: insertErr } = await supa
          .from('kullanicilar')
          .insert({
            ad: adAday,
            kullanici_adi: kullaniciAdiAday,
            email: davet.email,
            email_dogrulandi: true,
            auth_id: authUserId,
            tip: 'musteri',
            musteri_id: davet.musteri_id,
            durum: 'cevrimdisi',
            onay_durum: 'onayli',     // admin davet ettigi icin auto-approved
          })
          .select('id')
          .single()
        if (insertErr) {
          console.error('[musteri-davet-kabul] kullanicilar.insert:', insertErr.message)
          return err(502, 'Kullanıcı profili oluşturulamadı: ' + insertErr.message)
        }
        kullaniciId = yeni.id
      } else {
        await supa
          .from('kullanicilar')
          .update({
            email_dogrulandi: true,
            auth_id: authUserId,
            musteri_id: davet.musteri_id,
            tip: 'musteri',
            onay_durum: 'onayli',
          })
          .eq('id', mevcutKullanici.id)
      }

      // Daveti tuket
      await supa
        .from('musteri_davetleri')
        .update({ kullanildi: true, kullanildi_tarih: new Date().toISOString() })
        .eq('id', davet.id)

      return ok({
        email: davet.email,
        kullanici_id: kullaniciId,
        mesaj: 'Hesabınız hazır. Şimdi giriş yapabilirsiniz.',
      })
    }

    return err(400, "Bilinmeyen action. 'dogrula' veya 'kabul' kullanın.")
  } catch (e) {
    console.error('[musteri-davet-kabul] beklenmedik:', e)
    return err(500, (e as Error)?.message ?? 'bilinmeyen hata')
  }
})
