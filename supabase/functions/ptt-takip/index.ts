// PTT Gönderi Takip Servisi — verilen takip numarasının son durumunu ve
// tüm hareket geçmişini döndürür.
//
// PTT'nin resmi SOAP endpoint'ini kullanır:
//   https://pttws.ptt.gov.tr/PttVeriYukleme/services/Sorgu?wsdl
// Referans: https://github.com/ahmeti/ptt-kargo-api (PHP client)
//
// POST body: { takipNo: string }
//
// Cevap:
//   { ok: true, sonDurum: string, sonGuncelleme: ISO, hareketler: [{tarih, konum, aciklama, ...}] }
//   { ok: false, hata: string }
//
// Env:
//   PTT_MUSTERI_ID    — PTT İl Müdürlüğünden alınan Müşteri ID
//   PTT_MUSTERI_SIFRE — Müşteri şifresi
//   PTT_SOAP_URL      — SOAP endpoint (default: pttws.ptt.gov.tr)
//   PTT_DEMO=true     — credentials olmadan mock veri döndür (UI test)
//
// Not: Kredensiyaller PTT_DEMO=true iken göz ardı edilir, sahte data döner.
// Frontend UI'ı bu şekilde credentials gelene kadar test edilebilir.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const PTT_SOAP_URL     = Deno.env.get('PTT_SOAP_URL') || 'https://pttws.ptt.gov.tr/PttVeriYukleme/services/Sorgu'
const PTT_MUSTERI_ID   = Deno.env.get('PTT_MUSTERI_ID') || ''
const PTT_MUSTERI_SIFRE = Deno.env.get('PTT_MUSTERI_SIFRE') || ''
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
  if (PTT_DEMO || !PTT_MUSTERI_ID || !PTT_MUSTERI_SIFRE) {
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

  // ─── GERÇEK PTT SOAP ÇAĞRISI ────────────────────────────────────────────
  // PTT SOAP endpoint: barkodSorgu(PttMusteriId, PttMusteriSifre, barkod)
  // Response XML → parse → hareketler dizisi

  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sor="http://sorgu.pttyukleme.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <sor:barkodSorgu>
      <PttMusteriId>${PTT_MUSTERI_ID}</PttMusteriId>
      <PttMusteriSifre>${PTT_MUSTERI_SIFRE}</PttMusteriSifre>
      <Barkod>${takipNo}</Barkod>
    </sor:barkodSorgu>
  </soapenv:Body>
</soapenv:Envelope>`

  try {
    const resp = await fetch(PTT_SOAP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '"barkodSorgu"',
      },
      body: envelope,
    })
    if (!resp.ok) {
      return yanit({ ok: false, hata: `PTT SOAP hata: HTTP ${resp.status}` }, 502)
    }
    const xml = await resp.text()

    // SOAP Fault kontrolü
    if (xml.includes('<soap:Fault>') || xml.includes('<soapenv:Fault>')) {
      const faultMatch = xml.match(/<faultstring[^>]*>([^<]*)<\/faultstring>/i)
      return yanit({
        ok: false,
        hata: 'PTT SOAP Fault: ' + (faultMatch?.[1] || 'bilinmeyen'),
      }, 502)
    }

    // Basit XML → hareketler parse
    // PTT response şeması netleştikçe bu bölüm iyileştirilecek.
    // Beklenen alanlar: UnitName (konum), TransactionName (aciklama),
    // TransactionDate/EventDate (tarih), SubUnitName (alt konum).
    const hareketler: Array<Record<string, string>> = []
    const itemRegex = /<(?:item|Item|GonderiHareket)[^>]*>([\s\S]*?)<\/(?:item|Item|GonderiHareket)>/g
    let m: RegExpExecArray | null
    while ((m = itemRegex.exec(xml)) !== null) {
      const bloc = m[1]
      const alan = (tag: string) => {
        const rx = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i')
        return bloc.match(rx)?.[1]?.trim() || ''
      }
      hareketler.push({
        tarih:    alan('TransactionDate') || alan('EventDate') || alan('IslemTarihi'),
        konum:    [alan('UnitName') || alan('SubeAdi'), alan('SubUnitName')].filter(Boolean).join(' · '),
        aciklama: alan('TransactionName') || alan('IslemAdi') || alan('Durum') || '—',
        durum:    (alan('TransactionCode') || '').toLowerCase(),
      })
    }

    // En yeni önce sırala (tarih varsa)
    hareketler.sort((a, b) => (b.tarih || '').localeCompare(a.tarih || ''))

    return yanit({
      ok: true,
      takipNo,
      sonDurum:      hareketler[0]?.aciklama || 'Kayıt bulunamadı',
      sonGuncelleme: hareketler[0]?.tarih || new Date().toISOString(),
      hareketler,
    })
  } catch (e) {
    console.error('[ptt-takip] SOAP hata:', e)
    return yanit({ ok: false, hata: (e as Error).message }, 500)
  }
})
