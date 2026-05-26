// Admin kullanicinin baska bir kullanicinin sifresini sifirlamasi icin.
//
// POST body: { hedefKullaniciId: number, yeniSifre: string }
//
// Akis:
//  1. Authorization header'dan caller'i dogrula (anon JWT)
//  2. Caller kullanicilar tablosunda 'zna' tip + aktif olmali (admin)
//  3. Hedef kullanicinin auth_id'sini bul
//  4. supabase.auth.admin.updateUserById(auth_id, { password: yeniSifre })
//
// Response: { ok: true } veya { ok: false, hata: '...' }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supaAdmin = createClient(SUPABASE_URL, SERVICE_ROLE)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 1. Caller'i dogrula
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'Yetkisiz — token yok' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: callerAuth, error: callerAuthErr } = await callerClient.auth.getUser()
    if (callerAuthErr || !callerAuth?.user) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'Yetkisiz — gecersiz token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Caller admin mi? kullanicilar tablosunda tip='zna' olanlar admin sayilir
    const { data: callerProfil, error: profilErr } = await supaAdmin
      .from('kullanicilar')
      .select('id, ad, tip, durum')
      .eq('auth_id', callerAuth.user.id)
      .maybeSingle()

    if (profilErr || !callerProfil) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'Profil bulunamadi' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (callerProfil.tip !== 'zna' || callerProfil.durum !== 'aktif') {
      return new Response(
        JSON.stringify({ ok: false, hata: 'Bu islem icin admin yetkisi gerekli' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3. Body kontrol
    const { hedefKullaniciId, yeniSifre } = (await req.json()) ?? {}
    if (!hedefKullaniciId || typeof yeniSifre !== 'string') {
      return new Response(
        JSON.stringify({ ok: false, hata: 'hedefKullaniciId ve yeniSifre zorunlu' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    if (yeniSifre.length < 8) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'Sifre en az 8 karakter olmali' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 4. Hedef kullaniciyi bul
    const { data: hedef, error: hedefErr } = await supaAdmin
      .from('kullanicilar')
      .select('id, ad, kullanici_adi, auth_id')
      .eq('id', hedefKullaniciId)
      .maybeSingle()

    if (hedefErr || !hedef) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'Hedef kullanici bulunamadi' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!hedef.auth_id) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'Kullanicinin auth kaydi yok (eski hesap?). Yoneticiyle goruşun.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 5. Supabase Auth API ile sifre guncelle
    const { error: updErr } = await supaAdmin.auth.admin.updateUserById(
      hedef.auth_id,
      { password: yeniSifre },
    )

    if (updErr) {
      return new Response(
        JSON.stringify({ ok: false, hata: 'Sifre guncellenirken hata: ' + updErr.message }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 6. Audit log (basit — console)
    console.info(`[sifre-sifirla] ${callerProfil.ad} → ${hedef.ad} (${hedef.kullanici_adi})`)

    return new Response(
      JSON.stringify({
        ok: true,
        mesaj: `${hedef.ad} icin sifre guncellendi`,
        hedefAd: hedef.ad,
        hedefKullaniciAdi: hedef.kullanici_adi,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, hata: (e as Error)?.message ?? 'bilinmeyen' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
