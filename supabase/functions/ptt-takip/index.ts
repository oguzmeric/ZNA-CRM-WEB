// PTT Gönderi Takip Servisi — verilen takip numarasının son durumunu ve
// tüm hareket geçmişini döndürür.
//
// POST body: { takipNo: string }
//
// Cevap:
//   { ok: true, sonDurum: string, sonGuncelleme: ISO, hareketler: [{tarih, konum, aciklama, ...}] }
//   { ok: false, hata: string }
//
// Env:
//   PTT_API_URL      — resmi WSDL veya REST endpoint (PTT'den gelir)
//   PTT_KULLANICI_AD — API kullanıcı adı
//   PTT_SIFRE        — API şifresi
//   PTT_DEMO=true    — mock data döndür (credentials gelmeden test için)
//
// Not: PTT credential'ları gelmeden PTT_DEMO=true iken sahte data döndürür.
// Frontend UI'ı test edebilirsiniz.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const PTT_API_URL      = Deno.env.get('PTT_API_URL') || ''
const PTT_KULLANICI_AD = Deno.env.get('PTT_KULLANICI_AD') || ''
const PTT_SIFRE        = Deno.env.get('PTT_SIFRE') || ''
const PTT_DEMO         = Deno.env.get('PTT_DEMO') === 'true'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const yanit = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: CORS })

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return yanit({ ok: false, hata: 'sadece POST' }, 405)

  let body: { takipNo?: string } = {}
  try { body = await req.json() } catch { return yanit({ ok: false, hata: 'gecersiz JSON' }, 400) }

  const takipNo = (body.takipNo || '').toString().trim()
  if (!takipNo) return yanit({ ok: false, hata: 'takipNo zorunlu' }, 400)

  // ─── DEMO MOD (credentials yokken) ──────────────────────────────────────
  // Gerçek PTT credentials env'de yoksa mock data döndür — UI test için.
  if (PTT_DEMO || !PTT_API_URL || !PTT_KULLANICI_AD) {
    return yanit({
      ok: true,
      demo: true,
      takipNo,
      sonDurum: 'Dağıtım Şubesinde',
      sonGuncelleme: new Date().toISOString(),
      hareketler: [
        {
          tarih: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          konum: 'Kadıköy Dağıtım Şubesi · İstanbul',
          aciklama: 'Dağıtıcıya teslim edildi',
          durum: 'dagitimda',
        },
        {
          tarih: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
          konum: 'Anadolu Yakası Aktarma Merkezi',
          aciklama: 'Aktarma merkezinde işlendi',
          durum: 'transfer',
        },
        {
          tarih: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
          konum: 'Şişli Kabul Şubesi · İstanbul',
          aciklama: 'Gönderi kabul edildi',
          durum: 'kabul',
        },
      ],
      not: 'DEMO — gerçek PTT API bağlanınca canlı veri gelecek',
    })
  }

  // ─── GERÇEK PTT API ÇAĞRISI ─────────────────────────────────────────────
  // NOT: PTT'nin resmi endpoint'i geldiğinde bu blok aktifleştirilecek.
  // Muhtemel iki yol:
  //   (1) SOAP: XML envelope hazırla → PTT_API_URL'e POST → XML parse → JSON'a çevir
  //   (2) REST: JSON body ile GET/POST → doğrudan cevap
  // PTT'den dokuman gelince bu bölüm 15-20 satırlık gerçek fetch olacak.

  try {
    // Örnek REST çağrısı iskeleti — endpoint gelince aktifleşecek
    const resp = await fetch(PTT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + btoa(`${PTT_KULLANICI_AD}:${PTT_SIFRE}`),
      },
      body: JSON.stringify({ takipNo }),
    })
    if (!resp.ok) {
      return yanit({ ok: false, hata: `PTT API hata: HTTP ${resp.status}` }, 502)
    }
    const ptt = await resp.json()

    // PTT response'unu normalize et — gerçek şema gelince bu mapping netleşecek
    const hareketler = (ptt?.hareketler || ptt?.movements || []).map((h: Record<string, unknown>) => ({
      tarih:    h.tarih || h.date || h.transactionDate,
      konum:    h.konum || h.location || h.subeAdi,
      aciklama: h.aciklama || h.description || h.durumMetni,
      durum:    h.durum || h.status,
    }))

    return yanit({
      ok: true,
      takipNo,
      sonDurum:      ptt?.sonDurum || hareketler[0]?.aciklama || 'Bilinmiyor',
      sonGuncelleme: hareketler[0]?.tarih || new Date().toISOString(),
      hareketler,
    })
  } catch (e) {
    console.error('[ptt-takip] fetch hata:', e)
    return yanit({ ok: false, hata: (e as Error).message }, 500)
  }
})
