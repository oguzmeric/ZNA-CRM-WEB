// Görev gecikme SMS'i — son tarih 24 saati aşan, henüz tamamlanmamış,
// SMS'i gitmemiş görevler için atanan personele kurumsal bir hatırlatıcı SMS gönderir.
//
// pg_cron ile her gün 09:00'da (Europe/Istanbul) tetiklenir.
//
// Envanter:
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (Supabase default env)
//   - NetGSM sırları sms-gonder function'da ayarlı

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const trAsciify = (s: string) => (s || '')
  .replace(/İ/g, 'I').replace(/ı/g, 'i')
  .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
  .replace(/Ş/g, 'S').replace(/ş/g, 's')
  .replace(/Ç/g, 'C').replace(/ç/g, 'c')
  .replace(/Ö/g, 'O').replace(/ö/g, 'o')
  .replace(/Ü/g, 'U').replace(/ü/g, 'u')

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  // Son tarihi 1 gün önce (24 saat) geçmiş + tamamlanmamış + iptal edilmemiş + SMS gitmemiş
  // Not: son_tarih date, timestampsız. Bugün date - 1 gün ondan sonrası gecikme sayılır.
  const dun = new Date()
  dun.setDate(dun.getDate() - 1)
  const dunISO = dun.toISOString().slice(0, 10)

  const { data: gorevler, error } = await sb
    .from('gorevler')
    .select('id, baslik, atanan, atanan_id, son_tarih, durum, gecikme_sms_gonderildi')
    .lte('son_tarih', dunISO)
    // Kapalı durumlar + SLA saati durmuş bekleyenler (mig 221) gecikme SMS'i almaz
    .not('durum', 'in', '(tamamlandi,iptal,reddedildi,taslak,beklemede,bilgi_bekleniyor)')
    .eq('gecikme_sms_gonderildi', false)

  if (error) {
    console.error('[gorev-gecikme-sms] gorev query hatasi:', error.message)
    return new Response(JSON.stringify({ ok: false, hata: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Atanan id'lerini topla — atanan (text) veya atanan_id (bigint) hangisi doluysa
  const idler = [...new Set(
    (gorevler ?? [])
      .map(g => Number(g.atanan_id ?? g.atanan))
      .filter(n => Number.isFinite(n) && n > 0)
  )]

  const kulHarita = new Map<number, { id: number, ad: string, cep_telefon: string | null }>()
  if (idler.length > 0) {
    const { data: kullar } = await sb
      .from('kullanicilar')
      .select('id, ad, cep_telefon')
      .in('id', idler)
    for (const k of kullar ?? []) kulHarita.set(k.id, k as any)
  }

  const rapor = { toplam: gorevler?.length ?? 0, gonderilen: 0, telefonYok: 0, hata: 0 }

  for (const g of gorevler ?? []) {
    const atananId = Number((g as any).atanan_id ?? g.atanan)
    const kul = Number.isFinite(atananId) ? kulHarita.get(atananId) : null
    if (!kul?.cep_telefon) {
      rapor.telefonYok++
      // Yine de flag'i işaretle ki her cron'da tekrar denemesin — telefon eklenince yeni görevden gider
      await sb.from('gorevler').update({ gecikme_sms_gonderildi: true, gecikme_sms_tarihi: new Date().toISOString() }).eq('id', g.id)
      continue
    }

    const baslik = trAsciify(g.baslik).slice(0, 60)
    const sonTarihStr = g.son_tarih ? new Date(g.son_tarih).toLocaleDateString('tr-TR') : ''
    const mesaj = `ZNA CRM: Gecikmis gorev hatirlatmasi.\n"${baslik}"\nSon tarih: ${sonTarihStr} (asildi).\nLutfen en kisa surede tamamlayin.\ntalep.znateknoloji.com`

    try {
      // sms-gonder edge function'u cagir
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sms-gonder`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SERVICE_ROLE}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ gsm: kul.cep_telefon, mesaj }),
      })
      const sonuc = await res.json()
      if (sonuc?.ok) {
        await sb.from('gorevler').update({
          gecikme_sms_gonderildi: true,
          gecikme_sms_tarihi: new Date().toISOString(),
        }).eq('id', g.id)
        rapor.gonderilen++
      } else {
        console.warn('[gorev-gecikme-sms] sms basarisiz:', g.id, sonuc)
        rapor.hata++
      }
    } catch (e) {
      console.error('[gorev-gecikme-sms] exception:', g.id, e)
      rapor.hata++
    }
  }

  console.log('[gorev-gecikme-sms] rapor:', rapor)
  return new Response(JSON.stringify({ ok: true, rapor }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
