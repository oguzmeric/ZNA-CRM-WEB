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

// esnweb teknisyen alanı 15 karakter limitli — bazı isimler kesiliyor.
// Buradaki map ile kesik ismi tam adına çeviriyoruz.
const TEKNISYEN_MAP: Record<string, string> = {
  'MEHMET AKİF ERE': 'MEHMET AKİF EREL',
}
function normTeknisyen(t: string | null): string | null {
  if (!t) return t
  return TEKNISYEN_MAP[t.trim()] ?? t
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const body = await req.json().catch(() => ({}))
    const limit = Math.min(Math.max(parseInt(body.limit ?? 100, 10), 1), 500)

    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Yetki: pg_cron X-Cron-Secret ile gelir; kullanıcılar JWT ile.
    const cronSecret = req.headers.get('X-Cron-Secret')
    const cronMu = !!cronSecret && cronSecret === Deno.env.get('ESN_CRON_SECRET')
    if (!cronMu) {
      const authHeader = req.headers.get('Authorization') ?? ''
      if (!authHeader) return json({ ok: false, hata: 'yetkisiz' }, 401)
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
    }

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
    const raw = await esnR.text()

    // esnweb response defensive parsing:
    //   1) raw JSON array
    //   2) double-encoded (string containing JSON array)
    //   3) ASP.NET wrapper {d: [...]} veya benzeri
    const tryParse = (v: unknown): unknown => {
      if (typeof v !== 'string') return v
      try { return JSON.parse(v) } catch { return v }
    }
    let liste: any = tryParse(raw)
    liste = tryParse(liste)  // double-encoded
    if (!Array.isArray(liste) && liste && typeof liste === 'object') {
      for (const key of ['d', 'data', 'Data', 'result', 'Result', 'items', 'Items', 'rows', 'Rows']) {
        if (Array.isArray(liste[key])) { liste = liste[key]; break }
        const un = tryParse(liste[key])
        if (Array.isArray(un)) { liste = un; break }
      }
    }
    if (!Array.isArray(liste)) {
      return json({ ok: false, hata: 'liste_geçersiz', rawPreview: raw.slice(0, 400) }, 502)
    }

    const fisNolar = liste.map((r) => String(r.AFIS)).filter(Boolean)
    if (!fisNolar.length) return json({ ok: true, yeni: 0, guncellenen: 0, taranan: 0 })

    // DB'de olan fişleri değişiklik karşılaştırması için çek
    const { data: mevcut, error: e1 } = await svc
      .from('servis_raporlari')
      .select('fis_no, ariza_kodu, sonuc, bildirilen_ariza, takip_kodu, teknisyen, gid_tarih')
      .in('fis_no', fisNolar)
    if (e1) return json({ ok: false, hata: 'db_sorgu: ' + e1.message }, 500)
    const mevcutMap = new Map((mevcut ?? []).map((r) => [String(r.fis_no), r]))

    const bildirenTemiz = (b: string | null) => (b && b.trim() && b.trim() !== '.') ? b.trim() : null

    const yeniler: any[] = []
    const guncellenecekler: any[] = []

    for (const r of liste) {
      const fis = String(r.AFIS)
      const mev = mevcutMap.get(fis)
      const listeYansimasi = {
        ariza_kodu: r.ARZKOD ?? null,
        sonuc: r.NETICE ?? null,
        bildirilen_ariza: r.BARIZ ?? null,
        takip_kodu: r.XISLA ?? null,
        teknisyen: normTeknisyen(r.TEKN ?? null),
        gid_tarih: parseTarihTR(r.GTARIH),
      }
      if (!mev) {
        yeniler.push({
          fis_no: fis,
          firma_adi: r.XFIRMA ?? null,
          cari_kodu: r.KODU ? String(r.KODU) : null,
          lokasyon: r.XADRES ?? null,
          sistem_no: r.SISNO ?? null,
          bildiren: bildirenTemiz(r.BILDIREN),
          bil_tarih: parseTarihTR(r.BTARIH),
          ...listeYansimasi,
        })
      } else {
        // Herhangi bir alanda fark var mı?
        const degisti =
          mev.ariza_kodu !== listeYansimasi.ariza_kodu ||
          mev.sonuc !== listeYansimasi.sonuc ||
          mev.bildirilen_ariza !== listeYansimasi.bildirilen_ariza ||
          mev.takip_kodu !== listeYansimasi.takip_kodu ||
          mev.teknisyen !== listeYansimasi.teknisyen ||
          mev.gid_tarih !== listeYansimasi.gid_tarih
        if (degisti) guncellenecekler.push({ fis_no: fis, ...listeYansimasi })
      }
    }

    if (yeniler.length) {
      const { error: e2 } = await svc.from('servis_raporlari').insert(yeniler)
      if (e2) return json({ ok: false, hata: 'db_insert: ' + e2.message }, 500)
    }

    for (const u of guncellenecekler) {
      const { fis_no, ...alanlar } = u
      const { error: eu } = await svc.from('servis_raporlari').update(alanlar).eq('fis_no', fis_no)
      if (eu) return json({ ok: false, hata: `db_update ${fis_no}: ` + eu.message }, 500)
    }

    // Silme algılama: esnweb'in son 100'ünde min-max fis_no aralığında olup
    // esnweb listesinde artık olmayan DB fişleri → silindi = true
    const esnFisNums = fisNolar.map((f) => parseInt(f, 10)).filter((n) => !isNaN(n))
    const maxEsn = Math.max(...esnFisNums)
    const minEsn = Math.min(...esnFisNums)
    const esnFisSet = new Set(esnFisNums)
    // DB'de aralıkta olan fişleri getir (fis_no text — JS filtrele)
    const { data: dbAralik } = await svc
      .from('servis_raporlari').select('fis_no,silindi')
      .in('fis_no', Array.from({ length: maxEsn - minEsn + 1 }, (_, i) => String(minEsn + i)))
    const silinecekler = (dbAralik ?? [])
      .filter((r) => !r.silindi && !esnFisSet.has(parseInt(r.fis_no, 10)))
      .map((r) => r.fis_no)
    if (silinecekler.length) {
      const { error: es } = await svc
        .from('servis_raporlari').update({ silindi: true }).in('fis_no', silinecekler)
      if (es) return json({ ok: false, hata: 'db_silme: ' + es.message }, 500)
    }

    const degisenFisler = [...yeniler.map((r) => r.fis_no), ...guncellenecekler.map((r) => r.fis_no)]

    // Cron modunda detayları da sunucu tarafında çek (browser yok, kimse tetikleyemez).
    // Cap + 5'li paralel gruplar: fonksiyon zaman aşımına takılmasın; artan
    // fişler bir sonraki 10dk koşusunda yakalanır.
    let detayCekilen = 0
    if (body.detayCek && degisenFisler.length) {
      const hedefler = degisenFisler.slice(0, 30)
      const detayUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/esn-detay-senkron'
      for (let i = 0; i < hedefler.length; i += 5) {
        const grup = hedefler.slice(i, i + 5)
        const sonuclar = await Promise.allSettled(grup.map((fisno) =>
          fetch(detayUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Cron-Secret': Deno.env.get('ESN_CRON_SECRET') ?? '',
            },
            body: JSON.stringify({ fisno }),
          })
        ))
        detayCekilen += sonuclar.filter((s) => s.status === 'fulfilled' && (s.value as Response).ok).length
      }
    }

    return json({
      ok: true,
      yeni: yeniler.length,
      guncellenen: guncellenecekler.length,
      silinen: silinecekler.length,
      taranan: fisNolar.length,
      detayCekilen,
      fisNolar: degisenFisler,
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
