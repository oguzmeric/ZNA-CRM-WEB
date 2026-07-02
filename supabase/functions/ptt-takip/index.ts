// PTT Kurumsal Gönderi Takip — klasik PTT şubelerinden gönderilen kargolar için.
//
// Resmi SOAP endpoint (barkodSorgu method):
//   https://pttws.ptt.gov.tr/PttVeriYukleme/services/Sorgu?wsdl
//
// Kredensiyaller PTT İl Müdürlüğü'nden kurumsal müşterilere veriliyor:
//   - PttMusteriId
//   - PttMusteriSifre
//
// POST body: { takipNo: string }
//
// Cevap:
//   { ok: true, sonDurum: string, sonGuncelleme: ISO, hareketler: [{tarih, konum, aciklama, ...}] }
//   { ok: false, hata: string }
//
// Env:
//   PTT_SOAP_URL      — default 'https://pttws.ptt.gov.tr/PttVeriYukleme/services/Sorgu'
//   PTT_MUSTERI_ID    — PTT İl Müdürlüğünden alınan Müşteri ID
//   PTT_MUSTERI_SIFRE — Müşteri şifresi
//   PTT_DEMO=true     — credentials olmadan mock veri döndür (UI test)
//
// NOT: PTT AVM (marketplace) satıcıları için farklı bir REST API mevcut
// (https://shipment.pttavm.com/api/v1/) — bu fonksiyon o API'yi kullanmaz.
// PTT AVM entegrasyonuna geçilecekse ayrıca yapılandırılmalı.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const PTT_SOAP_URL      = Deno.env.get('PTT_SOAP_URL')      || 'https://pttws.ptt.gov.tr/PttVeriYukleme/services/Sorgu'
const PTT_MUSTERI_ID    = Deno.env.get('PTT_MUSTERI_ID')    || ''
const PTT_MUSTERI_SIFRE = Deno.env.get('PTT_MUSTERI_SIFRE') || ''
const PTT_DEMO          = Deno.env.get('PTT_DEMO') === 'true'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const yanit = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: CORS })

// XML escape — takipNo'da özel karakter olabilir (nadiren)
const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return yanit({ ok: false, hata: 'sadece POST' }, 405)

  let body: { takipNo?: string } = {}
  try { body = await req.json() } catch { return yanit({ ok: false, hata: 'gecersiz JSON' }, 400) }

  const takipNo = (body.takipNo || '').toString().trim()
  if (!takipNo) return yanit({ ok: false, hata: 'takipNo zorunlu' }, 400)

  // ─── DEMO MOD (credentials yokken) ──────────────────────────────────────
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
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sor="http://sorgu.pttyukleme.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <sor:barkodSorgu>
      <PttMusteriId>${xmlEscape(PTT_MUSTERI_ID)}</PttMusteriId>
      <PttMusteriSifre>${xmlEscape(PTT_MUSTERI_SIFRE)}</PttMusteriSifre>
      <Barkod>${xmlEscape(takipNo)}</Barkod>
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
      const txt = await resp.text().catch(() => '')
      return yanit({
        ok: false,
        hata: `PTT SOAP hata: HTTP ${resp.status}${txt ? ' — ' + txt.slice(0, 200) : ''}`,
      }, 502)
    }

    const xml = await resp.text()

    // SOAP Fault kontrolü — auth veya format hatası
    if (xml.match(/<(soap|soapenv|env):Fault>/i)) {
      const faultMatch = xml.match(/<faultstring[^>]*>([^<]*)<\/faultstring>/i)
      return yanit({
        ok: false,
        hata: 'PTT SOAP Fault: ' + (faultMatch?.[1]?.trim() || 'auth veya format hatası'),
      }, 502)
    }

    // XML parse — PTT response şeması netleşene kadar esnek yaklaşım.
    // Beklenen (ahmeti/ptt-kargo-api referansına göre):
    //   <barkodSorguResponse>
    //     <return>
    //       <item>
    //         <UnitName>KADIKOY SUBE</UnitName>
    //         <SubUnitName>...</SubUnitName>
    //         <TransactionName>KABUL EDILDI</TransactionName>
    //         <TransactionDate>2026-07-02 14:23:45</TransactionDate>
    //       </item>
    //     </return>
    //   </barkodSorguResponse>
    const hareketler: Array<Record<string, string>> = []
    const itemRegex = /<(?:item|Item|GonderiHareket)[^>]*>([\s\S]*?)<\/(?:item|Item|GonderiHareket)>/g
    let m: RegExpExecArray | null

    const alan = (bloc: string, ...tags: string[]) => {
      for (const t of tags) {
        const rx = new RegExp(`<[^>]*${t}[^>]*>([^<]*)</[^>]*${t}[^>]*>`, 'i')
        const val = bloc.match(rx)?.[1]?.trim()
        if (val) return val
      }
      return ''
    }

    while ((m = itemRegex.exec(xml)) !== null) {
      const bloc = m[1]
      const konum = [
        alan(bloc, 'UnitName', 'SubeAdi', 'Merkez'),
        alan(bloc, 'SubUnitName', 'AltMerkez'),
      ].filter(Boolean).join(' · ')
      hareketler.push({
        tarih:    alan(bloc, 'TransactionDate', 'EventDate', 'IslemTarihi', 'Tarih'),
        konum,
        aciklama: alan(bloc, 'TransactionName', 'IslemAdi', 'Durum', 'DurumMetni') || '—',
        durum:    (alan(bloc, 'TransactionCode', 'DurumKodu') || '').toLowerCase(),
      })
    }

    // En yeni önce sırala
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
