// esnweb GetDataAndCountReport proxy — yeni fişleri DB'ye ekler.
// Kullanım: browser'dan JWT ile çağrılır. Son N kayıt (default 100) çekilir,
// DB'de olmayanlar servis_raporlari'ya insert edilir.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ESN_URL = 'https://api.esnweb.com/WebApi/GetDataAndCountReport'

// "06.07.2026" → "2026-07-06"
function parseTarihTR(s: string | null): string | null {
  if (!s) return null
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return json({ ok: false, hata: 'yetkisiz' }, 401)

    const body = await req.json().catch(() => ({}))
    const limit = Math.min(Math.max(parseInt(body.limit ?? 100, 10), 1), 500)

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

    const firmakodu = Deno.env.get('ESN_FIRMA_KODU') ?? 'AKELTELEKOM'
    const kno = Deno.env.get('ESN_KNO') ?? '99'
    const kadi = Deno.env.get('ESN_KADI') ?? 'ali.aktepe@znateknoloji.com'

    const esnR = await fetch(ESN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Referer: 'https://www.esnweb.com/',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        startIndex: 0,
        maximumRows: limit,
        sortExpressions: '',
        filterExpressions: [],
        where: 'WHERECOLUMN IS NOT NULL',
        rkodu: 'R_ARIZALIS',
        tablo: 'ARZ',
        pkey: 'AFIS',
        wherecolumn: 'ARZ.ISLAH AS WHERECOLUMN,ARZ.BTARIH AS ORDERBYCOLUMN',
        orderby: 'ORDERBYCOLUMN DESC',
        rapno: '01',
        firmakodu,
        kno,
        kadi,
      }),
    })
    if (!esnR.ok) return json({ ok: false, hata: `esn ${esnR.status}` }, 502)
    const liste = await esnR.json()
    if (!Array.isArray(liste)) return json({ ok: false, hata: 'liste_geçersiz' }, 502)

    const fisNolar = liste.map((r) => String(r.AFIS)).filter(Boolean)
    if (!fisNolar.length) return json({ ok: true, yeni: 0, taranan: 0 })

    // DB'de olan fişleri bul
    const { data: mevcut, error: e1 } = await svc
      .from('servis_raporlari').select('fis_no').in('fis_no', fisNolar)
    if (e1) return json({ ok: false, hata: 'db_sorgu: ' + e1.message }, 500)
    const mevcutSet = new Set((mevcut ?? []).map((r) => String(r.fis_no)))

    const yeniler = liste.filter((r) => !mevcutSet.has(String(r.AFIS)))
    if (!yeniler.length) {
      return json({ ok: true, yeni: 0, taranan: fisNolar.length })
    }

    // Yeni kayıtları insert et
    const bildirenTemiz = (b: string | null) => (b && b.trim() && b.trim() !== '.') ? b.trim() : null
    const rows = yeniler.map((r) => ({
      fis_no: String(r.AFIS),
      firma_adi: r.XFIRMA ?? null,
      cari_kodu: r.KODU ? String(r.KODU) : null,
      lokasyon: r.XADRES ?? null,
      sistem_no: r.SISNO ?? null,
      ariza_kodu: r.ARZKOD ?? null,
      bildirilen_ariza: r.BARIZ ?? null,
      sonuc: r.NETICE ?? null,
      teknisyen: r.TEKN ?? null,
      bildiren: bildirenTemiz(r.BILDIREN),
      takip_kodu: r.XISLA ?? null,
      bil_tarih: parseTarihTR(r.BTARIH),
      gid_tarih: parseTarihTR(r.GTARIH),
    }))

    const { error: e2 } = await svc.from('servis_raporlari').insert(rows)
    if (e2) return json({ ok: false, hata: 'db_insert: ' + e2.message }, 500)

    return json({
      ok: true,
      yeni: rows.length,
      taranan: fisNolar.length,
      fisNolar: rows.map((r) => r.fis_no),
    })
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
