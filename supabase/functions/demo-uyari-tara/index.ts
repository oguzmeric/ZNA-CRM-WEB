// demo-uyari-tara — demo zimmet uyarılarını SUNUCUDAN tarar (mig 142).
// pg_cron her sabah 06:00 UTC (09:00 TR) çağırır; kimse web'i açmasa da
// bildirim düşer → tr_bildirim_push trigger'ı telefonlara Expo push atar.
//
// Üç kontrol (aktif zimmetler üzerinde):
//   1. İade 3 gün kala   (0 < kalan ≤ 3, uyari3gun_kala_gonderildi=false)
//   2. İade süresi geçti (kalan < 0, günde bir kez)
//   3. İmzasız tutanak   (verişten 3+ gün geçti, imzali_tutanak_url yok)
//
// Alıcılar: zimmeti açan kullanıcı + tüm adminler.
// Yetki: X-Cron-Secret == ESN_CRON_SECRET veya admin JWT.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// TR gününe göre 'YYYY-MM-DD'
function trBugun(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Yetki: cron secret VEYA admin kullanıcı ──
    const cronSecret = req.headers.get('X-Cron-Secret') ?? ''
    const beklenen = Deno.env.get('ESN_CRON_SECRET') ?? ''
    let yetkili = beklenen !== '' && cronSecret === beklenen
    if (!yetkili) {
      const authHeader = req.headers.get('Authorization') ?? ''
      if (authHeader) {
        const usr = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_ANON_KEY')!,
          { global: { headers: { Authorization: authHeader } } },
        )
        const { data: authRes } = await usr.auth.getUser()
        if (authRes?.user) {
          const { data: kul } = await svc
            .from('kullanicilar').select('rol')
            .eq('auth_id', authRes.user.id).maybeSingle()
          yetkili = kul?.rol === 'admin'
        }
      }
    }
    if (!yetkili) return json({ ok: false, hata: 'yetkisiz' }, 401)

    // ── Aktif zimmetler + admin listesi ──
    const [{ data: aktif, error: zErr }, { data: adminler }] = await Promise.all([
      svc.from('demo_zimmet_kayitlari')
        .select('id, cihaz_id, veren_kullanici_id, veris_tarihi, beklenen_iade_tarihi, uyari3gun_kala_gonderildi, uyari_suresi_gecti_son_gonderim, imzali_tutanak_url, tutanak_hatirlatma_gonderildi, tutanak_no, cihaz:cihaz_id (ad), musteri:musteri_id (firma, ad, soyad)')
        .is('gercek_iade_tarihi', null),
      svc.from('kullanicilar').select('id').eq('rol', 'admin'),
    ])
    if (zErr) return json({ ok: false, hata: zErr.message }, 500)

    const adminIdler = (adminler ?? []).map((a: any) => Number(a.id))
    const bugun = trBugun()
    const bugunMs = new Date(bugun + 'T00:00:00').getTime()
    let iadeYaklasan = 0, iadeGeciken = 0, tutanakEksik = 0

    const bildirimGonder = async (z: any, tip: string, baslik: string, mesaj: string) => {
      const alicilar = new Set<number>(adminIdler)
      const verenId = Number(z.veren_kullanici_id)
      if (verenId) alicilar.add(verenId)
      const satirlar = [...alicilar].map((aliciId) => ({
        alici_id: aliciId,
        tip,
        baslik,
        mesaj,
        link: `/demolar/${z.cihaz_id}`,
      }))
      if (satirlar.length) await svc.from('bildirimler').insert(satirlar)
    }

    for (const z of aktif ?? []) {
      const cihazAd = z.cihaz?.ad || `Cihaz #${z.cihaz_id}`
      const firmaAd = z.musteri?.firma
        || `${z.musteri?.ad ?? ''} ${z.musteri?.soyad ?? ''}`.trim() || 'Müşteri'

      // 1-2. İade uyarıları
      if (z.beklenen_iade_tarihi) {
        const kalan = Math.round(
          (new Date(z.beklenen_iade_tarihi + 'T00:00:00').getTime() - bugunMs) / 86400000,
        )
        if (kalan > 0 && kalan <= 3 && !z.uyari3gun_kala_gonderildi) {
          await bildirimGonder(z, 'uyari',
            'Demo iade tarihi yaklaşıyor',
            `${cihazAd} demo cihazı ${kalan} gün sonra iade gelmeli — ${firmaAd}`)
          await svc.from('demo_zimmet_kayitlari')
            .update({ uyari3gun_kala_gonderildi: true }).eq('id', z.id)
          iadeYaklasan++
        }
        if (kalan < 0 && z.uyari_suresi_gecti_son_gonderim !== bugun) {
          await bildirimGonder(z, 'hata',
            '⚠ Demo iade tarihi geçti',
            `${cihazAd} demo cihazı ${-kalan} gündür gecikmiş — ${firmaAd}`)
          await svc.from('demo_zimmet_kayitlari')
            .update({ uyari_suresi_gecti_son_gonderim: bugun }).eq('id', z.id)
          iadeGeciken++
        }
      }

      // 3. İmzasız tutanak (verişten 3+ gün geçti, bir kez hatırlat)
      if (!z.imzali_tutanak_url && !z.tutanak_hatirlatma_gonderildi && z.veris_tarihi) {
        const gecen = Math.round(
          (bugunMs - new Date(z.veris_tarihi + 'T00:00:00').getTime()) / 86400000,
        )
        if (gecen >= 3) {
          await bildirimGonder(z, 'uyari',
            'İmzalı demo tutanağı eksik',
            `${z.tutanak_no || 'Tutanak'} — ${cihazAd} (${firmaAd}) ${gecen} gündür imzalı tutanak yüklenmedi`)
          await svc.from('demo_zimmet_kayitlari')
            .update({ tutanak_hatirlatma_gonderildi: true }).eq('id', z.id)
          tutanakEksik++
        }
      }
    }

    return json({
      ok: true,
      taranan: (aktif ?? []).length,
      iadeYaklasan, iadeGeciken, tutanakEksik,
    })
  } catch (e) {
    console.error('[demo-uyari-tara]', e)
    return json({ ok: false, hata: (e as Error)?.message ?? 'bilinmeyen' }, 500)
  }
})
