// Musteri paylasim — teklif veya servis raporu icin tokenli link uretir,
// secilen kanala (mail / sms / her_ikisi) Resend ve/veya NetGSM ile gonderir.
//
// POST body: {
//   belge_tipi: 'teklif' | 'servis_raporu',
//   belge_id: number,
//   kanal: 'mail' | 'sms' | 'her_ikisi',
//   email?: string,
//   gsm?: string,
//   sure_gun?: number,    // default 30
//   ozel_mesaj?: string,  // opsiyonel: musteriye ekstra not
// }
//
// Required secrets:
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   - RESEND_API_KEY
//   - PUBLIC_BASE_URL   (ornek 'https://talep.znateknoloji.com')
//
// Akis:
//   1. Auth — caller'in auth.uid()'sinden kullanici_id cek (audit icin)
//   2. Validate — belge_tipi/belge_id geceri mi, kanal'a gore email/gsm dolu mu
//   3. Token uret (32 char crypto-random base62), DB'ye yaz
//   4. Kanala gore: mail (Resend) ve/veya SMS (sms-gonder fn) cagir
//   5. Sonuc durumlarini DB'ye yaz, response don

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeadersFor } from '../_shared/cors.ts'

const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY  = Deno.env.get('RESEND_API_KEY') ?? ''
const PUBLIC_BASE_URL = Deno.env.get('PUBLIC_BASE_URL') ?? 'https://talep.znateknoloji.com'
const FROM            = 'ZNA Destek <noreply@znateknoloji.com.tr>'  // znateknoloji.com.tr Resend dogrulamasi tamamlandi

// corsHeaders artık request bazlı — corsHeadersFor(req) çağrılır

const supa = createClient(SUPABASE_URL, SERVICE_ROLE)

function tokenUret(): string {
  // 24 byte = 32 char base64url (URL-safe, padding'siz)
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function emailGecerli(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function gsmGecerli(s: string): boolean {
  return /\d{10,}/.test(s.replace(/[^\d]/g, ''))
}

function err(req: Request, status: number, hata: string, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({ ok: false, hata, ...extra }),
    { status, headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' } },
  )
}

// ------ Mail govdesi (HTML + text) ------

function mailGovdesi(
  belgeTipi: 'teklif' | 'servis_raporu' | 'demo_tutanak',
  link: string,
  ozelMesaj: string,
  sureGun: number,
): { html: string; text: string; subject: string } {
  const baslik = belgeTipi === 'teklif' ? 'Teklifiniz Hazır'
    : belgeTipi === 'demo_tutanak' ? 'Demo Cihaz Teslim Tutanağınız'
    : 'Servis Raporunuz Hazır'
  const aciklama = belgeTipi === 'teklif'
    ? 'Tarafınıza hazırlanan teklifi aşağıdaki butona tıklayarak görüntüleyebilir veya yazdırabilirsiniz.'
    : belgeTipi === 'demo_tutanak'
    ? 'Tarafınıza demo amaçlı teslim edilen cihazın teslim tutanağını aşağıdaki butona tıklayarak görüntüleyebilir, yazdırıp imzalayabilirsiniz.'
    : 'Tamamlanan servis raporunuzu aşağıdaki butona tıklayarak görüntüleyebilir veya yazdırabilirsiniz.'

  const text = `${baslik}

${aciklama}

${ozelMesaj ? `\n${ozelMesaj}\n\n` : ''}Görüntüle: ${link}

Bu link ${sureGun} gün boyunca geçerlidir.

— ZNA Destek
znateknoloji.com`

  const ozelKutusu = ozelMesaj
    ? `<div style="background:#FFF7E6;border-left:3px solid #F59E0B;border-radius:6px;padding:14px 16px;margin-bottom:20px;font-size:14px;color:#3B4960;line-height:1.55;">${
        ozelMesaj.replace(/</g, '&lt;').replace(/\n/g, '<br>')
      }</div>`
    : ''

  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F4F6F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F4F6F8;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#fff;border-radius:16px;box-shadow:0 4px 12px rgba(15,27,46,0.08);overflow:hidden;">
        <!-- Header -->
        <tr><td style="padding:32px 32px 24px;border-bottom:1px solid #DEE3EC;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td valign="middle" style="padding-right:12px;">
                <div style="width:44px;height:44px;background:linear-gradient(135deg,#1E5AA8,#4A82C8);border-radius:11px;display:inline-block;text-align:center;line-height:44px;color:#fff;font-weight:800;font-size:18px;">Z</div>
              </td>
              <td valign="middle">
                <div style="font-size:18px;font-weight:700;color:#0F1B2E;letter-spacing:-0.01em;">ZNA Teknoloji</div>
                <div style="font-size:11px;color:#6B7A93;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;margin-top:2px;">Servis &amp; Saha Yönetim Platformu</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0F1B2E;letter-spacing:-0.02em;">${baslik}</h1>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.55;color:#3B4960;">${aciklama}</p>

          ${ozelKutusu}

          <!-- Buton -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;">
            <tr><td align="center" style="background:#1E5AA8;border-radius:10px;">
              <a href="${link}" style="display:inline-block;padding:14px 32px;color:#fff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.01em;">Belgeyi Görüntüle →</a>
            </td></tr>
          </table>

          <p style="margin:0 0 4px;font-size:12px;color:#6B7A93;text-align:center;word-break:break-all;">
            Buton çalışmıyorsa: <a href="${link}" style="color:#1E5AA8;text-decoration:none;">${link}</a>
          </p>
          <p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:#6B7A93;">
            ⏱️ Bu link <strong style="color:#3B4960;">${sureGun} gün</strong> boyunca geçerlidir.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#F4F6F8;border-top:1px solid #DEE3EC;">
          <p style="margin:0 0 4px;font-size:12px;color:#6B7A93;">
            Sorularınız için bizimle iletişime geçebilirsiniz.
          </p>
          <p style="margin:0;font-size:11px;color:#98A3B6;">
            © ZNA Teknoloji · <a href="https://znateknoloji.com" style="color:#1E5AA8;text-decoration:none;">znateknoloji.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  return { html, text, subject: baslik + ' — ZNA Teknoloji' }
}

// ------ SMS govdesi ------

function smsGovdesi(belgeTipi: 'teklif' | 'servis_raporu' | 'demo_tutanak', link: string): string {
  const baslik = belgeTipi === 'teklif' ? 'Teklifiniz'
    : belgeTipi === 'demo_tutanak' ? 'Demo teslim tutanaginiz'
    : 'Servis raporunuz'
  // ~140 char hedef (Tr karakter ile encode 70 char limiti, ASCII'ye yakin tutuyoruz)
  return `ZNA Teknoloji: ${baslik} hazir. Goruntule: ${link}`
}

async function resendGonder(toEmail: string, subject: string, html: string, text: string) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY tanimli degil.')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: [toEmail], subject, html, text }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Resend (${res.status}): ${JSON.stringify(data).slice(0, 200)}`)
  return data
}

async function smsGonderFn(gsm: string, mesaj: string) {
  // sms-gonder edge function'ini cagir
  const res = await fetch(`${SUPABASE_URL}/functions/v1/sms-gonder`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ gsm, mesaj }),
  })
  const data = await res.json()
  if (!data?.ok) throw new Error(data?.hata ?? 'SMS gonderilemedi.')
  return data
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(req) })

  try {
    // Caller'in kullanici_id'sini cek (audit/olusturan_id)
    const authHeader = req.headers.get('Authorization') ?? ''
    let olusturanId: number | null = null
    try {
      const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: ures } = await userClient.auth.getUser()
      if (ures?.user) {
        const { data: krow } = await supa
          .from('kullanicilar')
          .select('id, tip')
          .eq('auth_id', ures.user.id)
          .maybeSingle()
        if (krow) {
          // Sadece personel kullanabilir (musteri tipi bu fn'i cagiramamali)
          if (krow.tip === 'musteri') {
            return err(req,403, 'Bu islemi sadece personel yapabilir.')
          }
          olusturanId = krow.id
        }
      }
    } catch (_) { /* unauth -> reject below */ }

    if (!olusturanId) return err(req,401, 'Oturum gerekli.')

    const body = await req.json()
    const belgeTipi: string = (body?.belge_tipi ?? '').toString()
    const belgeId: number   = Number(body?.belge_id ?? 0)
    const kanal: string     = (body?.kanal ?? '').toString()
    const email: string     = (body?.email ?? '').toString().trim().toLowerCase()
    const gsm: string       = (body?.gsm ?? '').toString().trim()
    const sureGun: number   = Math.min(Math.max(Number(body?.sure_gun ?? 30), 1), 365)
    const ozelMesaj: string = (body?.ozel_mesaj ?? '').toString().slice(0, 500)
    const sablonRaw: string = (body?.sablon ?? '').toString().toLowerCase()
    const sablon: string | null =
      ['standart', 'trassir', 'karel'].includes(sablonRaw) ? sablonRaw : null
    // Servis raporu icin sirket/format (zna varsayilan -> param eklenmez)
    const sirketRaw: string = (body?.sirket ?? '').toString().toLowerCase()
    const sirket: string | null = sirketRaw === 'anadolunet' ? 'anadolunet' : null

    if (!['teklif', 'servis_raporu', 'demo_tutanak'].includes(belgeTipi)) return err(req,400, 'Gecersiz belge tipi.')
    if (!belgeId || belgeId < 1) return err(req,400, 'Gecersiz belge id.')
    if (!['mail', 'sms', 'her_ikisi'].includes(kanal)) return err(req,400, 'Gecersiz kanal.')

    const mailGonderilecek = kanal === 'mail' || kanal === 'her_ikisi'
    const smsGonderilecek  = kanal === 'sms'  || kanal === 'her_ikisi'

    if (mailGonderilecek && !emailGecerli(email)) return err(req,400, 'Gecerli bir e-posta girin.')
    if (smsGonderilecek && !gsmGecerli(gsm)) return err(req,400, 'Gecerli bir GSM numarasi girin.')

    // Belge gercekten var mi?
    const tablo = belgeTipi === 'teklif' ? 'teklifler'
      : belgeTipi === 'demo_tutanak' ? 'demo_zimmet_kayitlari'
      : 'servis_talepleri'
    const { data: belgeRow, error: belgeErr } = await supa
      .from(tablo)
      .select('id')
      .eq('id', belgeId)
      .maybeSingle()
    if (belgeErr || !belgeRow) return err(req,404, 'Belge bulunamadi.')

    // Token uret + DB'ye yaz
    const token = tokenUret()
    const sonKullanma = new Date(Date.now() + sureGun * 24 * 60 * 60 * 1000).toISOString()

    const { data: linkRow, error: insertErr } = await supa
      .from('musteri_paylasim_linkleri')
      .insert({
        token,
        belge_tipi: belgeTipi,
        belge_id: belgeId,
        olusturan_id: olusturanId,
        son_kullanma: sonKullanma,
        gonderim_kanali: kanal,
        gonderildigi_email: mailGonderilecek ? email : null,
        gonderildigi_gsm:   smsGonderilecek ? gsm : null,
      })
      .select('id')
      .single()

    if (insertErr || !linkRow) {
      console.error('[belge-paylas] DB insert:', insertErr)
      return err(req,500, 'Paylasim kaydedilemedi.')
    }

    // Query param'lar: teklif sablonu (?t=karel) ve/veya servis sirketi (?s=anadolunet)
    const qp: string[] = []
    if (sablon) qp.push(`t=${sablon}`)
    if (sirket) qp.push(`s=${sirket}`)
    const link = `${PUBLIC_BASE_URL}/p/${token}` + (qp.length ? `?${qp.join('&')}` : '')
    // Mail'den gelen kullanici zaten "Belgeyi Goruntule"ye bastigi icin karti
    // atlayip belgeyi DIREKT acsin (?ac=1). SMS'te kart kalir (ciplak link).
    const mailLink = link + (link.includes('?') ? '&' : '?') + 'ac=1'

    // Mail ve/veya SMS gonder, durumlari topla
    let mailDurum: string | null = null
    let smsDurum:  string | null = null

    if (mailGonderilecek) {
      try {
        const { html, text, subject } = mailGovdesi(belgeTipi as any, mailLink, ozelMesaj, sureGun)
        await resendGonder(email, subject, html, text)
        mailDurum = 'gonderildi'
      } catch (e) {
        mailDurum = 'hata: ' + ((e as Error).message ?? '').slice(0, 200)
        console.error('[belge-paylas] mail:', e)
      }
    }

    if (smsGonderilecek) {
      try {
        const mesaj = smsGovdesi(belgeTipi as any, link)
        await smsGonderFn(gsm, mesaj)
        smsDurum = 'gonderildi'
      } catch (e) {
        smsDurum = 'hata: ' + ((e as Error).message ?? '').slice(0, 200)
        console.error('[belge-paylas] sms:', e)
      }
    }

    // Durumlari guncelle
    await supa
      .from('musteri_paylasim_linkleri')
      .update({ mail_durumu: mailDurum, sms_durumu: smsDurum })
      .eq('id', linkRow.id)

    // Hicbir kanal basarili degilse hata don
    const mailOk = !mailGonderilecek || mailDurum === 'gonderildi'
    const smsOk  = !smsGonderilecek  || smsDurum  === 'gonderildi'
    if (!mailOk && !smsOk) {
      return err(req,502, 'Gonderim basarisiz oldu. Mail: ' + (mailDurum ?? '-') + ' / SMS: ' + (smsDurum ?? '-'))
    }

    // Demo tutanagi gonderildi olarak isaretle (rozet takibi icin)
    if (belgeTipi === 'demo_tutanak') {
      await supa.from('demo_zimmet_kayitlari')
        .update({ tutanak_gonderildi: true })
        .eq('id', belgeId)
    }

    return new Response(
      JSON.stringify({
        ok: true,
        token,
        link,
        son_kullanma: sonKullanma,
        mail_durumu: mailDurum,
        sms_durumu: smsDurum,
        kismi: !mailOk || !smsOk,   // bir kanal basarili digeri hatali
      }),
      { headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[belge-paylas] beklenmedik:', e)
    return err(req,500, (e as Error)?.message ?? 'bilinmeyen hata')
  }
})
