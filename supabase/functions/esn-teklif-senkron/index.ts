// esnweb teklif senkron proxy.
// Adım 1: L_TEKLIF listesinden son N teklifi çek (baş bilgi)
// Adım 2: DB'de yeni/güncellenen fisno'lar için TeklifDetayi (full baş) + TekharItems (kalemler) çek
// Adım 3: esn_teklifler upsert, esn_teklif_kalemleri delete+insert (kalem sırasını temiz tut)
//
// Kullanım: browser'dan JWT ile POST { limit?: number = 100 }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ESN_LISTE = 'https://api.esnweb.com/WebApi/GetDataAndCount'
const ESN_DETAY = 'https://api.esnweb.com/WebApi/TeklifDetayi'
const ESN_KALEM = 'https://api.esnweb.com/WebApi/TekharItems'

// "07/08/2026" veya "8.07.2026 00:00:00" → "2026-08-07" (US mm/dd/yyyy) veya "2026-07-08" (TR d.m.y)
// esnweb bazen ABD, bazen TR format kullanıyor. Header response'unda "tarih":"07/08/2026" ABD
// formatı. Baş listede ise "TARIH":"08.07.2026" TR formatı.
function parseTarihTR(s: string | null | undefined): string | null {
  if (!s) return null
  const clean = String(s).split(' ')[0].split('T')[0]
  // ISO zaten: 1899-12-31, 2026-07-08
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  // TR d.m.y: "08.07.2026"
  const tr = clean.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (tr) return `${tr[3]}-${tr[2].padStart(2, '0')}-${tr[1].padStart(2, '0')}`
  // US m/d/y: "07/08/2026"
  const us = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`
  return null
}

// 1899 tarihleri (default) null
function temizTarih(s: string | null | undefined): string | null {
  const t = parseTarihTR(s)
  if (!t) return null
  if (t.startsWith('1899')) return null
  return t
}

function esnBody(extra: Record<string, unknown>): string {
  const firmakodu = Deno.env.get('ESN_FIRMA_KODU') ?? 'AKELTELEKOM'
  const kno = Deno.env.get('ESN_KNO') ?? '99'
  const kadi = Deno.env.get('ESN_KADI') ?? 'ali.aktepe@znateknoloji.com'
  return JSON.stringify({ firmakodu, kno, kadi, ...extra })
}

async function esnCagir(url: string, extra: Record<string, unknown>): Promise<any> {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Referer': 'https://www.esnweb.com/',
      'Accept': 'application/json',
    },
    body: esnBody(extra),
  })
  if (!r.ok) throw new Error(`esn ${url.split('/').pop()} ${r.status}`)
  const raw = await r.text()
  // Defensive parse (aynı liste-senkron mantığı — double-encoded, {d:[]} wrapper)
  const tryParse = (v: unknown): unknown => {
    if (typeof v !== 'string') return v
    try { return JSON.parse(v) } catch { return v }
  }
  let veri: any = tryParse(raw)
  veri = tryParse(veri)
  if (!Array.isArray(veri) && veri && typeof veri === 'object') {
    for (const k of ['d', 'data', 'Data', 'result', 'Result', 'items', 'Items', 'rows', 'Rows']) {
      if (Array.isArray(veri[k])) { veri = veri[k]; break }
      const un = tryParse(veri[k])
      if (Array.isArray(un)) { veri = un; break }
    }
  }
  return veri
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return jsn({ ok: false, hata: 'yetkisiz' }, 401)

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
    if (!authRes?.user) return jsn({ ok: false, hata: 'yetkisiz' }, 401)
    const { data: kul } = await svc
      .from('kullanicilar').select('ad, rol').eq('auth_id', authRes.user.id).maybeSingle()
    if (!kul) return jsn({ ok: false, hata: 'kullanici_yok' }, 403)
    // TR karakter safe: JS \b Unicode değil, "OĞUZ" için \boğuz\b false döner (Ğ non-word)
    const adLower = String(kul.ad ?? '').toLocaleLowerCase('tr')
    const yonetim = kul.rol === 'admin'
      || adLower.includes('oğuz') || adLower.includes('oguz')
      || adLower.includes('ali uğur') || adLower.includes('ali ugur')
      || adLower.includes('ferdi')
    if (!yonetim) return jsn({ ok: false, hata: 'yetkisiz' }, 403)

    // 1) Liste — son N teklif (Verilen)
    const liste = await esnCagir(ESN_LISTE, {
      startIndex: 0, maximumRows: limit, sortExpressions: '',
      filterExpressions: [], where: "WHERECOLUMN='Verilen'",
      rkodu: 'L_TEKLIF', tablo: 'TEKLIF', pkey: 'FISNO',
      wherecolumn: 'FISTURU AS WHERECOLUMN,TARIH AS ORDERBYCOLUMN',
      orderby: 'ORDERBYCOLUMN DESC,PKEY DESC', rapno: '01',
    })
    if (!Array.isArray(liste)) return jsn({ ok: false, hata: 'liste_geçersiz' }, 502)

    const fisnolar = liste.map((r: any) => Number(r.FISNO)).filter((n: number) => Number.isFinite(n))
    if (!fisnolar.length) return jsn({ ok: true, yeni: 0, guncellenen: 0, kalem_yeni: 0, taranan: 0 })

    // Hangileri yeni / hangileri var (upsert etkisi için)
    const { data: mevcut } = await svc
      .from('esn_teklifler').select('fisno').in('fisno', fisnolar)
    const mevcutSet = new Set((mevcut ?? []).map((r: any) => Number(r.fisno)))
    const yeniFisnolar = fisnolar.filter((n) => !mevcutSet.has(n))

    // 2) Her fisno için baş detay + kalem çek (paralel, ama fair rate)
    let yeni = 0, guncellenen = 0, kalemYeni = 0, hatalar: string[] = []

    // Concurrency = 4 (esnweb yormamak için)
    const KAFILA = 4
    for (let i = 0; i < fisnolar.length; i += KAFILA) {
      const parca = fisnolar.slice(i, i + KAFILA)
      await Promise.all(parca.map(async (fisno) => {
        try {
          const listeSatir = liste.find((r: any) => Number(r.FISNO) === fisno)
          const [detay, kalemler] = await Promise.all([
            esnCagir(ESN_DETAY, { fisno: String(fisno), revize: 'Verilen' }),
            esnCagir(ESN_KALEM, { fisno: String(fisno), revize: 'Verilen' }),
          ])
          const bas = Array.isArray(detay) ? detay[0] : detay
          if (!bas) throw new Error('detay boş')

          const teklif = {
            fisno,
            evrak_no: bas.evrakno ?? String(listeSatir?.EVRAKNO ?? ''),
            tarih: temizTarih(bas.tarih ?? listeSatir?.TARIH),
            firma_adi: bas.firma ?? listeSatir?.XFIRMA ?? null,
            cari_kodu: bas.kodu ?? String(listeSatir?.KODU ?? ''),
            teklif_konusu: bas.teklifkonu ?? listeSatir?.TEKLIFKONU ?? null,
            hazirlayan: bas.hazirlayan ?? null,
            temsilci: kalemler?.[0]?.pkodu ?? bas.hazirlayan ?? null,
            aciklama: bas.aciklama ?? null,
            odeme_sekli: bas.odemesekli ?? null,
            teslim_yeri: bas.teslimyer ?? null,
            teslim_tarihi: temizTarih(bas.teslimtar),
            onay_durumu: bas.onaykodu ?? listeSatir?.ONYKD ?? null,
            tek_kabul: bas.tekkabul ?? listeSatir?.TEKKABUL ?? null,
            kabul_tarihi: temizTarih(bas.kabultar),
            kabul_eden: bas.kabuleden ?? null,
            teslim_edildi: bas.teslimedildi ?? listeSatir?.TESLIMEDILDI ?? null,
            vazgecildi: bas.vazgecildi ?? null,
            vazgec_sebep: bas.vazgecsebep ?? null,
            rakip_sat: bas.rakipsat ?? null,
            rakip_sat_sebep: bas.rakipsatsebep ?? null,
            revizyon: bas.revizyon ?? null,
            fis_turu: bas.fisturu ?? 'Verilen',
            dovkod: bas.dovkod ?? listeSatir?.DOVKOD ?? null,
            usd_kur: Number(bas.usdkur?.toString().replace(',', '.')) || null,
            euro_kur: Number(bas.eurokur?.toString().replace(',', '.')) || null,
            sterlin_kur: Number(bas.sterlinkur?.toString().replace(',', '.')) || null,
            gecerlilik_tarihi: temizTarih(bas.gecertar),
            toplam_tutar: Number(bas.toptutar) || 0,
            iskonto_tutar: Number(bas.isktutar) || 0,
            ara_tutar: Number(bas.aratutar) || 0,
            kdv_toplam: Number(bas.kdvtop) || 0,
            genel_toplam: Number(bas.gentop) || 0,
            genel_toplam_dov: Number(listeSatir?.GENTOPC) || 0,
            ham_json: bas,
            silindi: false,
            senkron_zamani: new Date().toISOString(),
          }

          const { error: eT } = await svc.from('esn_teklifler').upsert(teklif, { onConflict: 'fisno' })
          if (eT) throw new Error(`upsert teklif: ${eT.message}`)

          if (yeniFisnolar.includes(fisno)) yeni++
          else guncellenen++

          if (Array.isArray(kalemler) && kalemler.length) {
            // Önce eskiyi sil (temiz replace)
            await svc.from('esn_teklif_kalemleri').delete().eq('fisno', fisno)
            const yeniK = kalemler.map((k: any) => ({
              fisno,
              refno: String(k.refno),
              stok_kodu: k.stokkod ?? null,
              stok_adi: k.stokadi ?? null,
              stok_aciklama: k.stokacik ?? null,
              aciklama: k.aciklama ?? null,
              ozel_kod: k.ozelkod ?? null,
              birim: k.birim ?? null,
              miktar: Number(k.miktar) || 0,
              fiyat: Number(k.fiyat) || 0,
              tutar: Number(k.tutar) || 0,
              kdv_yuzde: Number(k.kdv) || 0,
              iskonto1_yuzde: Number(k.iskyuzde) || 0,
              iskonto2_yuzde: Number(k.iskyuzde2) || 0,
              net_fiyat: Number(k.netfiyat) || 0,
              net_tutar: Number(k.nettutar) || 0,
              net_fiyat_tl: Number(k.netfiyatd) || 0,
              net_tutar_tl: Number(k.nettutard) || 0,
              dovkod: k.dovkod ?? null,
              kur: Number(k.kur) || 0,
              temsilci: k.pkodu ?? null,
              dip_fiyat: Number(k.dipfiyat) || 0,
              hedef_fiyat: Number(k.hedeffiyat) || 0,
              giris_fiyat: Number(k.girfiyat) || 0,
              teslim_tarihi: temizTarih(k.teslimtar),
              ham_json: k,
            }))
            const { error: eK } = await svc.from('esn_teklif_kalemleri').insert(yeniK)
            if (eK) throw new Error(`insert kalem: ${eK.message}`)
            kalemYeni += yeniK.length
          }
        } catch (e) {
          hatalar.push(`fisno ${fisno}: ${(e as any)?.message ?? e}`)
        }
      }))
    }

    return jsn({
      ok: true, yeni, guncellenen, kalem_yeni: kalemYeni,
      taranan: fisnolar.length,
      hatalar: hatalar.slice(0, 20),
    })
  } catch (e) {
    return jsn({ ok: false, hata: String((e as any)?.message ?? e) }, 500)
  }
})

function jsn(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
