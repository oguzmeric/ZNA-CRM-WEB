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
import { corsHeadersFor } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supa = createClient(SUPABASE_URL, SERVICE_ROLE)

function err(req: Request, status: number, hata: string) {
  return new Response(
    JSON.stringify({ ok: false, hata }),
    { status, headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' } },
  )
}

function ok(req: Request, body: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ ok: true, ...body }),
    { headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' } },
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(req) })

  try {
    const body = await req.json()
    const action: string = (body?.action ?? '').toString()
    const token: string = (body?.token ?? '').toString().trim()

    if (!token || token.length < 16) return err(req,400, 'Geçersiz davet linki.')

    const davet = await davetiBul(token)
    if (!davet) return err(req,404, 'Davet bulunamadı veya geçersiz.')
    if (davet.kullanildi) return err(req,410, 'Bu davet daha önce kullanılmış. Giriş yapmayı deneyin.')
    if (new Date(davet.son_kullanma).getTime() < Date.now()) {
      return err(req,410, 'Bu davetin süresi dolmuş. Lütfen ZNA ekibinden yeni bir davet isteyin.')
    }

    // Musteri firma adi
    const { data: musteri } = await supa
      .from('musteriler')
      .select('id, firma')
      .eq('id', davet.musteri_id)
      .maybeSingle()

    if (action === 'dogrula') {
      return ok(req,{
        email: davet.email,
        ad: davet.ad,
        firma: musteri?.firma ?? '',
        son_kullanma: davet.son_kullanma,
      })
    }

    if (action === 'kabul') {
      const sifre: string = (body?.sifre ?? '').toString()
      if (sifre.length < 8) return err(req,400, 'Şifre en az 8 karakter olmalı.')

      // Bu email icin profil var mi? Email karsilastirmasi buyuk/kucuk harf duyarsiz
      // olmali — davet lowercase yazilir ama kullanicilar.email baska akislardan
      // mixed-case gelmis olabilir.
      const { data: kullaniciListe } = await supa
        .from('kullanicilar')
        .select('id, auth_id, email_dogrulandi, musteri_id, onay_durum')
        .ilike('email', davet.email)
        .limit(1)
      const mevcutKullanici = kullaniciListe?.[0] ?? null

      let authUserId: string | null = mevcutKullanici?.auth_id ?? null

      // Profil yok ya da auth_id bos: auth.users'ta bu email zaten kayitli olabilir
      // (orphan). Dogrudan createUser denenirse "already been registered" ile kalici
      // olarak patlar — once auth tarafina bakip mevcut hesabi baglayalim.
      if (!authUserId) {
        const { data: mevcutAuthId, error: rpcErr } = await supa
          .rpc('auth_user_id_by_email', { p_email: davet.email })
        if (rpcErr) console.error('[musteri-davet-kabul] auth_user_id_by_email:', rpcErr.message)
        if (mevcutAuthId) authUserId = mevcutAuthId as string
      }

      // Profil insert'i patlarsa yeni acilan auth kullanicisini geri alabilmek icin
      let authYeniAcildi = false

      if (!authUserId) {
        const { data: authData, error: authErr } = await supa.auth.admin.createUser({
          email: davet.email,
          password: sifre,
          email_confirm: true,
          user_metadata: { kayit_yontemi: 'b2b_davet', davet_id: davet.id },
        })
        if (authErr || !authData?.user) {
          console.error('[musteri-davet-kabul] auth.createUser:', authErr?.message)
          return err(req,502, 'Hesap oluşturulamadı: ' + (authErr?.message ?? 'bilinmeyen'))
        }
        authUserId = authData.user.id
        authYeniAcildi = true
      } else {
        const { error: updErr } = await supa.auth.admin.updateUserById(authUserId, {
          password: sifre,
          email_confirm: true,
        })
        if (updErr) {
          console.error('[musteri-davet-kabul] auth.update:', updErr.message)
          return err(req,502, 'Şifre güncellenemedi: ' + updErr.message)
        }
      }

      // kullanicilar tablosunda profil olustur/guncelle
      let kullaniciId = mevcutKullanici?.id
      if (!mevcutKullanici) {
        const adAday = davet.ad?.trim() || davet.email.split('@')[0]
        const kokAd = davet.email.split('@')[0]
          .toLowerCase()
          .replace(/[^a-z0-9.]/g, '') || 'musteri'

        // kullanici_adi benzersiz olmali — cakisirsa son ek ver
        let kullaniciAdiAday = kokAd
        for (let i = 2; i <= 50; i++) {
          const { data: cakisma } = await supa
            .from('kullanicilar')
            .select('id')
            .ilike('kullanici_adi', kullaniciAdiAday)
            .limit(1)
          if (!cakisma?.length) break
          kullaniciAdiAday = `${kokAd}${i}`
        }

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
            onay_durum: 'onaylandi',  // admin davet ettigi icin auto-approved
          })
          .select('id')
          .single()
        if (insertErr) {
          console.error('[musteri-davet-kabul] kullanicilar.insert:', insertErr.message)
          // Profil acilamadiysa yeni auth kullanicisini geri al — aksi halde
          // auth.users'ta orphan kalir ve sonraki her deneme
          // "already been registered" ile kalici olarak patlar.
          if (authYeniAcildi && authUserId) {
            const { error: silErr } = await supa.auth.admin.deleteUser(authUserId)
            if (silErr) console.error('[musteri-davet-kabul] auth rollback:', silErr.message)
          }
          return err(req,502, 'Kullanıcı profili oluşturulamadı: ' + insertErr.message)
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
            onay_durum: 'onaylandi',
          })
          .eq('id', mevcutKullanici.id)
      }

      // Daveti tuket
      await supa
        .from('musteri_davetleri')
        .update({ kullanildi: true, kullanildi_tarih: new Date().toISOString() })
        .eq('id', davet.id)

      return ok(req,{
        email: davet.email,
        kullanici_id: kullaniciId,
        mesaj: 'Hesabınız hazır. Şimdi giriş yapabilirsiniz.',
      })
    }

    return err(req,400, "Bilinmeyen action. 'dogrula' veya 'kabul' kullanın.")
  } catch (e) {
    console.error('[musteri-davet-kabul] beklenmedik:', e)
    return err(req,500, (e as Error)?.message ?? 'bilinmeyen hata')
  }
})
