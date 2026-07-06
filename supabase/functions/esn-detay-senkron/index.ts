// esnweb ServisDetayi proxy — CRM frontend'inden çağrılır.
// Kimlik doğrulaması JWT ile (yönetim: admin/Ali/Oğuz/Ferdi).
// esnweb credential'ı env'den okunur, client'a gitmez.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ESN_URL = 'https://api.esnweb.com/WebApi/ServisDetayi'
const BUCKET = 'imzalar'
const IMZA_ONEK = 'esn/'

function parseTarihSaat(s: string | null): string | null {
  if (!s) return null
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{1,2}))?/)
  if (!m) return null
  let [, a, b, y, h, min] = m
  const ai = +a, bi = +b
  let d: number, mn: number
  if (ai > 12) { d = ai; mn = bi }
  else if (bi > 12) { d = bi; mn = ai }
  else { d = ai; mn = bi }
  if (mn < 1 || mn > 12 || d < 1 || d > 31) return null
  const dd = String(d).padStart(2, '0'), mm = String(mn).padStart(2, '0')
  const hh = h ? String(+h).padStart(2, '0') : '00'
  const mi = min ? String(+min).padStart(2, '0') : '00'
  return `${y}-${mm}-${dd}T${hh}:${mi}:00+03:00`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return json({ ok: false, hata: 'yetkisiz' }, 401)

    const { fisno } = await req.json()
    if (!fisno) return json({ ok: false, hata: 'fisno_gerek' }, 400)

    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const usr = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: authRes } = await usr.auth.getUser()
    if (!authRes?.user) return json({ ok: false, hata: 'yetkisiz' }, 401)

    const { data: kul } = await svc
      .from('kullanicilar').select('ad, rol').eq('auth_id', authRes.user.id).maybeSingle()
    if (!kul) return json({ ok: false, hata: 'kullanici_yok' }, 403)
    const yonetim = kul.rol === 'admin' || /\b(oğuz|oguz|ali|ferdi)\b/i.test(kul.ad ?? '')
    if (!yonetim) return json({ ok: false, hata: 'yetkisiz' }, 403)

    // esnweb API
    const firmakodu = Deno.env.get('ESN_FIRMA_KODU') ?? 'AKELTELEKOM'
    const kno = Deno.env.get('ESN_KNO') ?? '99'
    const kadi = Deno.env.get('ESN_KADI') ?? 'ali.aktepe@znateknoloji.com'

    const esnR = await fetch(ESN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', Referer: 'https://www.esnweb.com/', Accept: 'application/json' },
      body: JSON.stringify({ firmakodu, afis: String(fisno), kno, kadi }),
    })
    if (!esnR.ok) return json({ ok: false, hata: `esn ${esnR.status}` }, 502)
    const arr = await esnR.json()
    const detay = arr?.[0]
    if (!detay) return json({ ok: false, hata: 'esn_veri_yok' }, 404)

    // İmza yükle
    let imzaYol: string | null = null
    if (detay.imzaresim && detay.imzaresim.length > 200) {
      imzaYol = `${IMZA_ONEK}${fisno}.png`
      const bin = Uint8Array.from(atob(detay.imzaresim), c => c.charCodeAt(0))
      const up = await svc.storage.from(BUCKET).upload(imzaYol, bin, {
        contentType: 'image/png', upsert: true,
      })
      if (up.error) console.warn('storage upload:', up.error.message)
    }

    // DB güncelle
    const payload = {
      servis_tipi: detay.arzkod || null,
      yukumluluk: detay.arzkod2 || null,
      statu_esn: detay.arzokod1 || null,
      servis_yeri: detay.arzokod2 || null,
      evrak_no: detay.evrakno || null,
      adres_kodu: detay.adreskod || null,
      sistem_marka: detay.xmarka || null,
      sistem_model: detay.xmodel || null,
      teslim_alan: (detay.pdaseri || '').trim() || null,
      varis_saati: parseTarihSaat(detay.vsaat),
      ayrilis_saati: parseTarihSaat(detay.asaat),
      yol_masraf: detay.masrafyol || null,
      yemek_masraf: detay.masrafyemek || null,
      konak_masraf: detay.masrafkonak || null,
      mesafe_km: detay.mesafekm || null,
      ...(imzaYol && { imza_url: imzaYol }),
      esn_senkron: new Date().toISOString(),
    }
    const { error } = await svc.from('servis_raporlari').update(payload).eq('fis_no', String(fisno))
    if (error) return json({ ok: false, hata: 'db: ' + error.message }, 500)

    return json({ ok: true, guncellendi: payload })
  } catch (e) {
    return json({ ok: false, hata: String((e as any)?.message ?? e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
