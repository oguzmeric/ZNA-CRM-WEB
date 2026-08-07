// sistem-nobetcisi — Günlük sessiz bozulma nöbetçisi (mig 276).
//
// NEDEN VAR: 07.08'de bulunan hataların ortak özelliği sessiz olmalarıydı —
// ekranda hata çıkmıyor, kimse fark etmiyor, veri her gün biraz daha
// bozuluyordu (75 servisin tamamlanma tarihi haftalarca boş kaldı; müşteriye
// giden belgelerde yanlış tarih vardı; bir cihaz 5 kez takılmış görünüyordu).
// Hepsi tek bir sayım sorgusuyla ilk gün yakalanabilirdi.
//
// Her sabah 08:20 TR'de pg_cron çağırır. sistem_sagligi_kontrol() RPC'si
// kapatılmış hataların tekrar oluşup oluşmadığını sayar.
//
// ⚠️ SORUN YOKSA BİLDİRİM GİTMEZ. Her sabah "her şey yolunda" bildirimi
// göndermek alarm yorgunluğu yaratır ve gerçek uyarı da göz ardı edilir.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Teknik nöbet bildirimi — kullanicilar.id (2 = OĞUZ MERİÇ)
const ALICILAR = [2]

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// Token'daki rolü okur. GÜVENLİ, çünkü imzayı platform zaten doğruluyor:
// verify_jwt açık olduğu için sahte token bu fonksiyona HİÇ ulaşmaz
// (platform UNAUTHORIZED_INVALID_JWT_FORMAT ile keser — 07.08'de test edildi).
// Anahtar METNİNİ karşılaştırmak kırılgan: legacy/yeni anahtar formatı veya
// bir rotasyon, cron'u sessizce 401'e düşürür.
function rolOku(jwt: string): string | null {
  try {
    const p = jwt.split('.')[1]
    if (!p) return null
    const b64 = p.replace(/-/g, '+').replace(/_/g, '/')
    const dolgulu = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')
    return JSON.parse(atob(dolgulu))?.role ?? null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const servisAnahtari = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, servisAnahtari)

    // ── Yetki: cron (service_role token / cron secret) VEYA giriş yapmış kullanıcı ──
    // anon rolü kabul EDİLMEZ: anon anahtarı herkeste var.
    const authHeader = req.headers.get('Authorization') ?? ''
    const bearer = authHeader.replace(/^Bearer\s+/i, '')
    const cronSecret = req.headers.get('X-Cron-Secret') ?? ''
    const beklenenSecret = Deno.env.get('ESN_CRON_SECRET') ?? ''

    const rol = rolOku(bearer)
    const yetkili =
      rol === 'service_role' ||
      rol === 'authenticated' ||
      (beklenenSecret !== '' && cronSecret === beklenenSecret)

    if (!yetkili) return json({ ok: false, hata: 'yetkisiz' }, 401)

    // ── Sağlık taraması ──
    const { data: rapor, error } = await svc.rpc('sistem_sagligi_kontrol')
    if (error) return json({ ok: false, hata: 'kontrol: ' + error.message }, 500)

    const bulgular = (rapor?.bulgular ?? []) as Array<{
      kod: string; agirlik: string; adet: number; mesaj: string
    }>

    // Sorun yoksa sessiz kal — sadece cron kaydına sonuç döner
    if (!bulgular.length) {
      return json({ ok: true, saglikli: true, bildirim: false, rapor })
    }

    const kritikler = bulgular.filter(b => b.agirlik === 'kritik')
    const uyarilar = bulgular.filter(b => b.agirlik === 'uyari')

    // Kritikler önce; her satır tek başına anlaşılır olmalı
    const govde = [...kritikler, ...uyarilar]
      .map(b => `${b.agirlik === 'kritik' ? '🔴' : '🟡'} ${b.mesaj}`)
      .join('\n')

    const baslik = kritikler.length
      ? `🔴 Sistem nöbeti — ${kritikler.length} kritik bulgu`
      : `🟡 Sistem nöbeti — ${uyarilar.length} uyarı`

    const rows = ALICILAR.map(id => ({
      alici_id: id,
      tip: kritikler.length ? 'hata' : 'uyari',
      baslik,
      mesaj: govde,
      link: '/gunluk-ozet',
      meta: { kaynak: 'sistem_nobetcisi', bulgular },
    }))

    const { error: bilErr } = await svc.from('bildirimler').insert(rows)
    if (bilErr) return json({ ok: false, hata: 'bildirim: ' + bilErr.message }, 500)

    return json({ ok: true, saglikli: false, bildirim: true, rapor })
  } catch (e) {
    return json({ ok: false, hata: String((e as any)?.message ?? e) }, 500)
  }
})
