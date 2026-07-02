// PTT AVM Gönderi Takip Servisi — verilen tracking_id'nin durumunu döndürür.
//
// Resmi PTT AVM REST endpoint kullanır:
//   POST https://shipment.pttavm.com/api/v1/barcode-status
//   Body: { tracking_id: string }
//   Response: durum bilgisi (completed / error / pending) + gönderi detayları
//
// POST body: { takipNo: string }
//
// Cevap:
//   { ok: true, sonDurum: string, sonGuncelleme: ISO, hareketler: [{tarih, konum, aciklama, ...}] }
//   { ok: false, hata: string }
//
// Env:
//   PTT_API_URL         — default 'https://shipment.pttavm.com/api/v1'
//   PTT_KULLANICI_AD    — Basic Auth kullanıcı adı (PTT AVM'den gelir)
//   PTT_SIFRE           — Basic Auth şifresi
//   PTT_INTEGRATION_KEY — default 'pttavm' (multi-carrier destekliyorsa değişir)
//   PTT_DEMO=true       — credentials olmadan mock veri döndür (UI test)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const PTT_API_URL         = Deno.env.get('PTT_API_URL') || 'https://shipment.pttavm.com/api/v1'
const PTT_KULLANICI_AD    = Deno.env.get('PTT_KULLANICI_AD') || ''
const PTT_SIFRE           = Deno.env.get('PTT_SIFRE') || ''
const PTT_INTEGRATION_KEY = Deno.env.get('PTT_INTEGRATION_KEY') || 'pttavm'
const PTT_DEMO            = Deno.env.get('PTT_DEMO') === 'true'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const yanit = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: CORS })

// PTT AVM status kodunu Türkçe insan-okur metne çevir
function durumMetni(status: string): string {
  const map: Record<string, string> = {
    completed: 'Teslim edildi',
    pending:   'İşlem devam ediyor',
    error:     'Hata oluştu',
    delivered: 'Teslim edildi',
    in_transit: 'Yolda',
    dispatched: 'Kargoya verildi',
    picked_up: 'Alındı',
    processing: 'İşleniyor',
  }
  return map[status?.toLowerCase()] || status || 'Bilinmiyor'
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return yanit({ ok: false, hata: 'sadece POST' }, 405)

  let body: { takipNo?: string } = {}
  try { body = await req.json() } catch { return yanit({ ok: false, hata: 'gecersiz JSON' }, 400) }

  const takipNo = (body.takipNo || '').toString().trim()
  if (!takipNo) return yanit({ ok: false, hata: 'takipNo zorunlu' }, 400)

  // ─── DEMO MOD (credentials yokken) ──────────────────────────────────────
  if (PTT_DEMO || !PTT_KULLANICI_AD || !PTT_SIFRE) {
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

  // ─── GERÇEK PTT AVM REST ÇAĞRISI ────────────────────────────────────────
  try {
    const authHeader = 'Basic ' + btoa(`${PTT_KULLANICI_AD}:${PTT_SIFRE}`)

    const resp = await fetch(`${PTT_API_URL}/barcode-status`, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'Authorization':   authHeader,
        'Integration-Key': PTT_INTEGRATION_KEY,
      },
      body: JSON.stringify({ tracking_id: takipNo }),
    })

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      return yanit({
        ok: false,
        hata: `PTT API hata: HTTP ${resp.status}${txt ? ' — ' + txt.slice(0, 200) : ''}`,
      }, 502)
    }

    const ptt = await resp.json().catch(() => ({}))

    // PTT AVM cevap şeması netleşene kadar esnek mapping:
    //   status: 'completed'|'pending'|'error'
    //   history / movements / events: [{ date, location, description, status }]
    const raw = ptt as Record<string, unknown>
    const hareketlerRaw = (raw?.history || raw?.movements || raw?.events || raw?.transactions || []) as Array<Record<string, unknown>>

    const hareketler = hareketlerRaw.map((h) => ({
      tarih:    (h.date || h.datetime || h.timestamp || h.tarih) as string,
      konum:    (h.location || h.branch || h.konum || h.unit_name) as string,
      aciklama: (h.description || h.status_text || h.event || h.aciklama || durumMetni(h.status as string)) as string,
      durum:    ((h.status || h.code || '') as string).toLowerCase(),
    }))

    // Ana durum
    const anaDurum = durumMetni(raw?.status as string) || hareketler[0]?.aciklama || 'Kayıt bulunamadı'
    const anaTarih = (raw?.last_updated || raw?.updated_at || hareketler[0]?.tarih || new Date().toISOString()) as string

    return yanit({
      ok: true,
      takipNo,
      status: raw?.status,
      sonDurum: anaDurum,
      sonGuncelleme: anaTarih,
      hareketler,
    })
  } catch (e) {
    console.error('[ptt-takip] fetch hata:', e)
    return yanit({ ok: false, hata: (e as Error).message }, 500)
  }
})
